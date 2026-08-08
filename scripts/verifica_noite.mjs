// VERIFICA A NOITE — responde "rodou tudo certo?" por MEDIÇÃO, e falha ALTO quando não.
//   node scripts/verifica_noite.mjs           (sai 1 se houver qualquer ALERTA)
//   HORAS=24 node scripts/verifica_noite.mjs  (janela de análise; default 24h)
//
// ═══ POR QUE ESTE ARQUIVO EXISTE ═══
// Em 07 e 08/ago, TUDO que estava quebrado neste projeto rodava sem erro. A lista, medida:
//   · produtor agendado e consumidor fora da cadeia — 4 vezes o mesmo padrão (fila de download parada 17
//     dias, leitor do PCP roteado para o vazio, normalização fora do pipeline, consumidor de evento)
//   · 4 tarefas em estado `Ready` que NUNCA disparavam: gatilho `Once` com repetição expirada
//   · a ETL varando a janela até 08:41 porque o limite estava no Agendador e não no processo
//   · `INSERT` sem `ON CONFLICT` matando o coletor na primeira colisão de chave
// Nenhum deles gritou. O que faltava não era conserto — era alguém perguntar.
// Este script faz as perguntas todo dia, e o silêncio dele passa a significar alguma coisa.
import fs from "fs"; import { execSync } from "child_process"; import pg from "pg";

const HORAS = Number(process.env.HORAS || 24);
const U = fs.readFileSync("./.env.local", "utf8").match(/^DATABASE_URL=(.+)$/m)[1].trim();
const db = new pg.Client({ connectionString: U, ssl: { rejectUnauthorized: false }, statement_timeout: 600000 });
await db.connect();

const alertas = [], oks = [];
const ok = (m) => oks.push(m);
const alerta = (m) => alertas.push(m);
const num = (x) => Number(x || 0);

// ── 1) AS TAREFAS DISPARARAM? E TÊM PRÓXIMA EXECUÇÃO?
// Duas perguntas distintas: "rodou" e "vai rodar de novo". A segunda é a que pegou os 4 gatilhos mortos —
// uma tarefa pode estar Ready, sem erro nenhum, e nunca mais disparar.
let tarefas = [];
try {
  const ps = `Get-ScheduledTask | Where-Object { $_.TaskName -like '*PNIGP*' } | ForEach-Object { $i = $_ | Get-ScheduledTaskInfo; '{0}|{1}|{2}|{3}|{4}' -f $_.TaskName, $_.State, $i.LastRunTime, $i.LastTaskResult, $i.NextRunTime }`;
  const out = execSync(`powershell -NoProfile -Command "${ps.replace(/"/g, '\\"')}"`, { encoding: "utf8", timeout: 120000 });
  tarefas = out.split(/\r?\n/).filter(Boolean).map((l) => {
    const [nome, estado, ultima, rc, proxima] = l.split("|");
    return { nome, estado, ultima: ultima ? new Date(ultima) : null, rc: Number(rc), proxima: proxima ? new Date(proxima) : null };
  });
} catch (e) { alerta(`não consegui ler o Agendador: ${e.message}`); }

const ativas = tarefas.filter((t) => t.estado === "Ready" || t.estado === "Running");
const limite = new Date(Date.now() - HORAS * 3600e3);
for (const t of ativas) {
  if (!t.proxima) {
    // "Rodada completa" é manual por desenho — não tem gatilho e isso está certo.
    if (!/Rodada completa/i.test(t.nome)) alerta(`${t.nome}: ATIVA mas SEM PRÓXIMA EXECUÇÃO (gatilho morto)`);
  }
  if (t.ultima && t.ultima < limite && t.proxima) alerta(`${t.nome}: não roda há mais de ${HORAS}h (última ${t.ultima.toLocaleString("pt-BR")})`);
  if (t.rc !== 0 && t.rc !== 267009 && t.rc !== 267011) alerta(`${t.nome}: último resultado ${t.rc} (0x${(t.rc >>> 0).toString(16)})`);
}
ok(`${ativas.length} tarefas ativas, ${ativas.filter((t) => t.proxima).length} com próxima execução`);

// ── 2) O ESPELHO RECEBEU DADO NOVO? (o buraco de 3 dias não avisou ninguém)
const q = async (s, p) => (await db.query(s, p)).rows[0];
const esp = await q(`select
  (select count(*) from public.arquivos_sc where atualizado > now() - interval '${HORAS} hours') arquivos_novos,
  (select count(*) from public.pncp_evento where ocorrido_em > now() - interval '${HORAS} hours') eventos_novos`);
if (num(esp.arquivos_novos) === 0 && num(esp.eventos_novos) === 0)
  alerta(`ESPELHO PARADO: nenhum arquivo nem evento novo em ${HORAS}h — a coleta não está trazendo nada`);
else ok(`espelho vivo: ${esp.arquivos_novos} arquivos e ${esp.eventos_novos} eventos novos`);

// ── 3) TODA FILA TEM QUEM A ESVAZIE? (mede o SALDO, não o tamanho: fila grande que anda está saudável)
const filas = [
  ["download (fetch_fila)", `select count(*) filter (where status='pendente') pend, count(*) filter (where status='feito') feito from app.fetch_fila_sc`],
  ["eventos a consumir", `select count(*) filter (where consumido_dado is null and estacionado_em is null) pend, count(*) filter (where consumido_dado > now() - interval '${HORAS} hours') feito from public.pncp_evento`],
  ["re-extração", `select count(*) filter (where layout_v is null) pend, count(*) filter (where layout_v is not null and atualizado > now() - interval '${HORAS} hours') feito from public.arquivo_texto_sc`],
];
for (const [nome, sql] of filas) {
  try {
    const r = await q(sql);
    if (num(r.pend) > 0 && num(r.feito) === 0) alerta(`fila "${nome}": ${r.pend} pendentes e ZERO processados em ${HORAS}h — ninguém está esvaziando`);
    else ok(`fila "${nome}": ${r.pend} pendentes, ${r.feito} processados`);
  } catch (e) { alerta(`fila "${nome}": não consegui medir (${e.message})`); }
}

// ── 4) A MARCA CHEGOU AO PRODUTO? Consolidar não basta: queries.ts exige marca_norm + dicionário.
const m = await q(`select count(*) linhas,
   count(*) filter (where marca_norm is null) sem_norm,
   count(*) filter (where atualizado > now() - interval '${HORAS} hours') novas,
   (select count(*) from app.marca_dicionario_sc where confianca in ('alta','media')) allowlist
   from app.item_marca_conferida_sc`);
if (num(m.sem_norm) > 0)
  alerta(`MARCA NÃO CHEGOU AO PRODUTO: ${m.sem_norm} linhas sem marca_norm — faltou normaliza_marca/monta_dicionario`);
else ok(`marca no produto: ${m.linhas} linhas (${m.novas} novas), allowlist ${m.allowlist}`);

// ── 5) A ETL RESPEITOU A JANELA? A primeira noite varou até 08:41 sem que nada acusasse.
try {
  const e = await q(`select count(*) filter (where ultima_exec > now() - interval '${HORAS} hours') rodaram,
     count(*) filter (where ultimo_status='cortado') cortadas,
     count(*) filter (where falhas_seguidas >= 3) falhando,
     max(duracao_seg) filter (where ultima_exec > now() - interval '${HORAS} hours') maior_seg
     from public.etl_catalogo`);
  if (num(e.maior_seg) > 5700) alerta(`ETL: uma fonte levou ${Math.round(num(e.maior_seg)/60)} min — acima do teto de 90 min`);
  if (num(e.falhando) > 0) alerta(`ETL: ${e.falhando} fontes com 3+ falhas seguidas`);
  ok(`ETL: ${e.rodaram} fontes rodaram, ${e.cortadas} cortadas pela janela`);
} catch (e) { alerta(`ETL: não consegui medir (${e.message})`); }

await db.end();

console.log(`\n═══ VERIFICAÇÃO DA NOITE · ${new Date().toLocaleString("pt-BR")} · janela ${HORAS}h ═══\n`);
for (const o of oks) console.log(`  ok    ${o}`);
if (alertas.length) {
  console.log("");
  for (const a of alertas) console.log(`  !!    ${a}`);
  console.log(`\n✖ ${alertas.length} ALERTA(S) — algo não rodou como devia.`);
} else console.log(`\n✔ tudo rodou como devia.`);
process.exit(alertas.length ? 1 : 0);
