// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
// ingest_folha_gpecloud.mjs — GPE Cloud (`{slug}-transparencia.gpecloud.com.br`), portal Laravel.
//
// ⭐ Achado em 18/ago/2026 indo UM CLIQUE ADIANTE em Coronel Murta/MG, que o diagnóstico marcara `tela_sem_linhas`
// ([[pnigp-tela-certa-nao-e-so-ter-tabela]]). A tela `/servidores/remuneracao` mostra 15 linhas paginadas, mas a
// página dispara `GET /exportar/remuneracao?meta=1` — e o MESMO caminho SEM `meta` devolve o **CSV inteiro**.
//
// O contrato:
//   GET /exportar/remuneracao?meta=1        → {"ultima":"2026-08-17 08:24:37"}  (data da última carga)
//   GET /exportar/remuneracao               → CSV com a SÉRIE HISTÓRICA INTEIRA (9,5 MB em Coronel Murta)
//   GET /exportar/remuneracao?ano=&mes=     → CSV de UMA competência
//   Colunas: Id;Nome;Cpf;Matricula;Mes;Ano;"Tipo Calc";Situacao;Cargo;Lotacao;"Tipo Admissao";"Valor Liquido"
//
// 🚨 A GUARDA QUE DECIDE O NÚMERO — `Tipo Calc`. A mesma pessoa aparece várias vezes na mesma competência, uma
// por tipo de cálculo. Em Coronel Murta, jul/2026:
//     Vencimento 761 · Adiantamento 13º 760 · Férias 22 · Rescisão 14
//   somando tudo:      1.557 "servidores", R$ 2.711.702  ← 62% inflado, e cada pessoa contada duas vezes
//   só `Vencimento`:     761 servidores,   R$ 1.683.543  ← a folha mensal
// Gravar sem separar por tipo é o mesmo defeito da entidade-espelho, só que dentro do arquivo
// ([[pnigp-entidade-espelho-infla-folha]]). Os demais tipos ficam registrados em `tipo_calc` para quem quiser
// 13º/férias, mas `Vencimento` é o que responde "quanto é a folha".
//
// 🚨 O CPF vem MASCARADO (`***.249.056-**`) e não identifica — serve de desempate, nunca de chave.
// 🚨 `Valor Liquido` usa PONTO decimal (607.88), ao contrário do resto do CSV em pt-BR.
//
// Uso: node scripts/ingest_folha_gpecloud.mjs      · SO=<município> · COMPETENCIAS=6 · TUDO=1 (série inteira)
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
import "./_rede.mjs";
import crypto from "node:crypto";
import { pool, withRetry } from "./_cadprev.mjs";

const db = pool();
const q = withRetry(db);
const SO = process.env.SO || null;
const COMPETENCIAS = Number(process.env.COMPETENCIAS || 1);
const TUDO = process.env.TUDO === "1";
const UA = { "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120 Safari/537.36" };

await q(`create table if not exists folha_servidores_gpecloud (
  cod_ibge text, municipio text, uf text, competencia text, matricula text, nome text, cpf_masc text,
  cargo text, lotacao text, situacao text, tipo_admissao text, tipo_calc text, liquido numeric,
  _hash text primary key, _coletado_em timestamptz default now()
)`);
await q(`create table if not exists folha_gpecloud_coleta (
  cod_ibge text primary key, municipio text, uf text, url text, situacao text, detalhe text,
  linhas int, competencia text, ultima_carga text, em timestamptz default now()
)`);

// CSV com aspas e `;` — parser mínimo, porque nome e cargo trazem vírgula e o campo citado tem `;` dentro
function linhaCSV(l) {
  const out = []; let campo = "", aspas = false;
  for (const ch of l) {
    if (ch === '"') aspas = !aspas;
    else if (ch === ";" && !aspas) { out.push(campo); campo = ""; }
    else campo += ch;
  }
  out.push(campo);
  return out.map((x) => x.trim());
}
const num = (s) => { const n = Number(String(s ?? "").replace(/[^\d.\-]/g, "")); return Number.isFinite(n) ? n : null; };

const fila = (await q(`select distinct on (c.cod_ibge) c.cod_ibge, c.municipio, c.uf, c.url
  from folha_portal_candidato c
 where c.produto = 'gpecloud' ${SO ? "and c.municipio ilike '%'||$1||'%'" : ""}
 order by c.cod_ibge, c.achado_em desc`, [SO].filter(Boolean))).rows;
console.log(`[gpecloud] ${fila.length} municípios na fila\n`);

let colhidos = 0, vazios = 0;
for (const m of fila) {
  const base = String(m.url).replace(/\/+$/, "");
  const marca = (situacao, detalhe, linhas = 0, comp = null, ultima = null) =>
    q(`insert into folha_gpecloud_coleta (cod_ibge,municipio,uf,url,situacao,detalhe,linhas,competencia,ultima_carga,em)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,now())
       on conflict (cod_ibge) do update set situacao=excluded.situacao, detalhe=excluded.detalhe,
         linhas=excluded.linhas, competencia=excluded.competencia, ultima_carga=excluded.ultima_carga, em=now()`,
      [m.cod_ibge, m.municipio, m.uf, base, situacao, detalhe, linhas, comp, ultima]);

  let ultima = null;
  try {
    const r = await fetch(`${base}/exportar/remuneracao?meta=1`, { headers: UA, signal: AbortSignal.timeout(40000) });
    ultima = JSON.parse(await r.text()).ultima ?? null;
  } catch { /* segue: o meta é informativo */ }

  let csv;
  try {
    const r = await fetch(`${base}/exportar/remuneracao`, { headers: UA, signal: AbortSignal.timeout(300000) });
    if (!r.ok) { await marca("http_erro", `exportador devolveu ${r.status}`, 0, null, ultima);
      console.log(`   ✖ ${m.municipio}: exportador HTTP ${r.status}`); continue; }
    csv = await r.text();
  } catch (e) {
    await marca("erro", String(e.message).slice(0, 140), 0, null, ultima);
    console.log(`   ✖ ${m.municipio}: ${String(e.message).slice(0, 50)}`); continue;
  }

  const linhas = csv.split(/\r?\n/);
  const cab = linhaCSV(linhas[0] || "").map((x) => x.toLowerCase());
  const col = (nome) => cab.findIndex((x) => x.includes(nome));
  const iNome = col("nome"), iMes = col("mes"), iAno = col("ano"), iTipo = col("tipo calc"), iLiq = col("liquido");
  if (iNome < 0 || iMes < 0 || iAno < 0 || iLiq < 0) {
    await marca("cabecalho_inesperado", `colunas: ${cab.join(",").slice(0, 120)}`, 0, null, ultima);
    console.log(`   ✖ ${m.municipio}: cabeçalho fora do contrato`); continue;
  }

  const regs = linhas.slice(1).filter(Boolean).map(linhaCSV).filter((c) => c.length >= cab.length && c[iNome]);
  if (!regs.length) {
    vazios++; await marca("sem_dado", `CSV com ${linhas.length} linhas, nenhuma com nome`, 0, null, ultima);
    console.log(`   · ${m.municipio}: exportador respondeu, mas sem registros (última carga ${ultima ?? "?"})`);
    continue;
  }

  // ⭐ competência: a MAIS CHEIA contando só linhas de `Vencimento` — o mês corrente costuma vir pela metade
  // ([[pnigp-competencia-mais-cheia-nao-a-recente]])
  const porComp = new Map();
  for (const c of regs) {
    const comp = `${c[iAno]}${String(c[iMes]).padStart(2, "0")}`;
    if (!/^\d{6}$/.test(comp)) continue;
    if (!porComp.has(comp)) porComp.set(comp, { venc: 0, todas: 0 });
    const e = porComp.get(comp); e.todas++;
    if (iTipo >= 0 && /vencimento/i.test(c[iTipo] || "")) e.venc++;
  }
  // 🚨 "mais cheia" tem de ser DENTRO DA JANELA RECENTE. O CSV traz a série inteira, então a regra crua escolheu
  // 201712 em Consolação e 202408 em Franciscópolis — meses cheios de anos atrás, num município cuja base é atual.
  // A folha que interessa é a de agora; a lei da competência mais cheia serve para descartar o mês corrente pela
  // metade, não para voltar oito anos ([[pnigp-competencia-mais-cheia-nao-a-recente]]).
  const todas = [...porComp.keys()].sort();
  const maisNova = todas[todas.length - 1];
  const limite = String(Number(maisNova) - 100); // mesma competência, um ano antes (AAAAMM - 100 = 12 meses)
  const janela = [...porComp.entries()].filter(([c]) => c >= limite);
  const ordem = (janela.length ? janela : [...porComp.entries()])
    .sort((a, b) => (b[1].venc - a[1].venc) || (b[0] > a[0] ? 1 : -1));
  const alvo = TUDO ? [...porComp.keys()] : ordem.slice(0, COMPETENCIAS).map((x) => x[0]);
  if (!alvo.length) {
    vazios++; await marca("sem_competencia", `${regs.length} registros, nenhuma competência válida`, 0, null, ultima);
    console.log(`   · ${m.municipio}: registros sem ano/mês legível`); continue;
  }

  const escolhidas = new Set(alvo);
  const lote = [];
  for (const c of regs) {
    const comp = `${c[iAno]}${String(c[iMes]).padStart(2, "0")}`;
    if (!escolhidas.has(comp)) continue;
    const tipo = iTipo >= 0 ? c[iTipo] : null;
    const nome = c[iNome];
    // hash inclui o TIPO: sem ele, `Vencimento` e `Adiantamento 13º` da mesma pessoa colidem e um sobrescreve o outro
    const _hash = crypto.createHash("sha1")
      .update([m.cod_ibge, comp, c[col("matricula")] || "", nome, tipo || "", c[iLiq]].join("|")).digest("hex");
    lote.push([m.cod_ibge, m.municipio, m.uf, comp, c[col("matricula")] || null, nome,
      c[col("cpf")] || null, c[col("cargo")] || null, c[col("lotacao")] || null,
      c[col("situacao")] || null, c[col("tipo admissao")] || null, tipo, num(c[iLiq]), _hash]);
  }

  for (let i = 0; i < lote.length; i += 500) {
    const parte = lote.slice(i, i + 500);
    const vals = parte.map((_, k) => `($${k * 14 + 1},$${k * 14 + 2},$${k * 14 + 3},$${k * 14 + 4},$${k * 14 + 5},$${k * 14 + 6},$${k * 14 + 7},$${k * 14 + 8},$${k * 14 + 9},$${k * 14 + 10},$${k * 14 + 11},$${k * 14 + 12},$${k * 14 + 13},$${k * 14 + 14})`).join(",");
    await q(`insert into folha_servidores_gpecloud (cod_ibge,municipio,uf,competencia,matricula,nome,cpf_masc,
      cargo,lotacao,situacao,tipo_admissao,tipo_calc,liquido,_hash) values ${vals}
      on conflict (_hash) do nothing`, parte.flat());
  }

  const compPrincipal = alvo[0];
  const e = porComp.get(compPrincipal);
  colhidos++;
  await marca("ok", `${e.venc} servidores em Vencimento (${e.todas} linhas com todos os tipos)`,
    e.venc, compPrincipal, ultima);
  console.log(`  ⭐ ${m.municipio.padEnd(26)} ${String(e.venc).padStart(5)} servidores · comp ${compPrincipal}`
    + ` · ${lote.length} linhas gravadas · carga ${ultima ?? "?"}`);
}

console.log(`\n[gpecloud] ${colhidos} municípios colhidos · ${vazios} sem dado`);
const t = (await q(`select count(distinct cod_ibge)::int m, count(*)::int n,
  count(*) filter (where tipo_calc ilike 'vencimento')::int v from folha_servidores_gpecloud`)).rows[0];
console.log(`[gpecloud] tabela: ${t.m} municípios · ${t.n} linhas · ${t.v} em Vencimento`);
await db.end();
