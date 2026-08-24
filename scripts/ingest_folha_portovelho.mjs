// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════
// ingest_folha_portovelho.mjs — folha nominal de PORTO VELHO (capital de RO) pela API pública da prefeitura.
//
// ⭐ ENTREGA OS CINCO CAMPOS E AINDA A FOLHA ABERTA POR RUBRICA:
//    nome · cpf(mascarado) · matrícula · cargo · **lotação** · local de trabalho · regime · admissão ·
//    salário base · férias · 13º · vantagens · outras · **bruto** · descontos · **líquido**
//
// A API: `https://api.portovelho.ro.gov.br/api/v1` (OpenAPI em `/docs/api.json`).
//   • `/recursos-humanos/instituicoes`                        → 12535 Prefeitura, 12537 IPAM, 12668 Câmara
//   • `/recursos-humanos/anos/{portal}` · `/meses/{portal}/{ano}` → competências disponíveis
//   • `/recursos-humanos/movimentacoes/{portal}/{ano}/{mes}`   → LISTA (nome, cargo, lotação) — **sem valor**
//   • `/recursos-humanos/remuneracao/{portal}/{matricula}/{ano}/{mes}` → **valores, um servidor por chamada**
//
// 🚨 QUATRO ARMADILHAS, TODAS MEDIDAS AQUI:
//   1. **O basePath não é a raiz.** `api.portovelho.ro.gov.br/recursos-humanos/...` dá 404; `/api/v1` está
//      declarado em `servers` do OpenAPI. ⚠️ Ler `servers` antes de montar URL a partir de spec.
//   2. **O parâmetro de página é `page`, não `pagina`.** Com `pagina` a API responde 200 e devolve SEMPRE a
//      página 1 — o coletor gira sem avançar e sem erro. E `por-pagina` é ignorado: vêm 30 sempre.
//   3. **429 "Too Many Attempts".** Com concorrência 10 a API respondeu "sem anos" e remuneração vazia —
//      parecia que a capital não publicava. Era pressa minha. ⚠️ 429 tratado como erro comum vira conclusão
//      FALSA sobre a fonte. Aqui ele é esperado: espera o `Retry-After` (ou escala) e tenta de novo.
//   4. **Descarregar o buffer só a cada 500 escondia o progresso**: ficavam 10 minutos sem gravar e sem saber
//      se andava ou tinha travado. FLUSH=100 dá progresso visível e retomada mais fina.
//
// ⚠️ CUSTO: a remuneração é UMA CHAMADA POR SERVIDOR — ~16 mil (12.693 prefeitura + 3.318 IPAM). Por isso o
//    coletor é **retomável** em dois níveis: pula portal já fechado no ledger e pula servidor já gravado com
//    valor. Uma queda de DNS no meio do caminho custou zero — bastou rodar de novo.
// ⚠️ A CÂMARA (12668) fica de fora: poder legislativo não entra na folha do executivo.
//
// Uso: node scripts/ingest_folha_portovelho.mjs   ·   CONC=2 PAUSA=350 FLUSH=100   ·   SO_LISTA=1 (só quadro)
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
import crypto from "crypto";
import { Agent, setGlobalDispatcher } from "undici";
import { pool, withRetry } from "./_cadprev.mjs";

setGlobalDispatcher(new Agent({ connect: { timeout: 20000, rejectUnauthorized: false, family: 4 },
  headersTimeout: 60000, bodyTimeout: 300000 }));

const db = pool(); const q = withRetry(db);
const CONC = Number(process.env.CONC || 2);      // a API limita taxa — concorrência alta só gera 429
const PAUSA = Number(process.env.PAUSA || 350);  // ms de respiro após cada chamada bem-sucedida
const FLUSH = Number(process.env.FLUSH || 100);  // grava a cada N servidores (progresso visível + retomada fina)
const LOTE = 500;                                // tamanho do INSERT
const SO_LISTA = process.env.SO_LISTA === "1";
const A = "https://api.portovelho.ro.gov.br/api/v1";
const H = { accept: "application/json", "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36" };

const MUN = "Porto Velho";
// 🚨 código pelo NOME, nunca digitado ([[pnigp-nunca-digitar-codigo-ibge]] — nesta mesma sessão eu digitei
// "1100155" para Monte Negro, que é Ouro Preto do Oeste, e joguei 165 servidores no município errado)
const IBGE = (await q(`select cod_ibge from municipios_br where uf='RO' and nome ilike $1`, [MUN])).rows[0]?.cod_ibge;
if (!IBGE) throw new Error(`municipio ${MUN} nao encontrado em municipios_br`);

await q(`create table if not exists folha_servidores_portovelho (
  cod_ibge text, municipio text, uf text default 'RO', entidade text, competencia text,
  nome text, cpf_masc text, matricula text, cargo text, secretaria text, departamento text,
  vinculo text, classe_nivel text, situacao text, data_admissao text, data_demissao text, carga_horaria text,
  salario_base numeric, gratificacoes numeric, outros numeric, ferias numeric, decimo numeric,
  bruto numeric, descontos numeric, liquido numeric,
  _hash text primary key, _coletado_em timestamptz default now())`);
await q(`create index if not exists ix_folha_pvh_mun on folha_servidores_portovelho (cod_ibge, competencia)`);
await q(`create table if not exists folha_portovelho_coleta (
  portal text, competencia text, listados int, com_valor int, situacao text, detalhe text,
  em timestamptz default now(), primary key (portal, competencia))`);

async function get(p, tent = 5) {
  for (let k = 0; k < tent; k++) {
    try {
      const r = await fetch(A + p, { headers: H, signal: AbortSignal.timeout(120000) });
      if (r.status === 429) {
        const esp = Number(r.headers.get("retry-after") || 0) * 1000 || 3000 * (k + 1);
        await new Promise((s) => setTimeout(s, esp));
        continue;
      }
      if (r.status >= 500) { await new Promise((s) => setTimeout(s, 1500 * (k + 1))); continue; }
      if (r.status >= 400) return null;
      const j = await r.json();
      await new Promise((s) => setTimeout(s, PAUSA));
      return j;
    } catch { if (k === tent - 1) return null; }
  }
  return null;
}
const val = (r) => (r?.valor?.value != null ? Number(r.valor.value) : null);

async function grava(regs) {
  const uniq = [...new Map(regs.map((r) => [r._hash, r])).values()];
  for (let i = 0; i < uniq.length; i += LOTE) {
    const p = uniq.slice(i, i + LOTE); const c = (f) => p.map((x) => x[f] ?? null);
    await q(`insert into folha_servidores_portovelho
      (cod_ibge,municipio,entidade,competencia,nome,cpf_masc,matricula,cargo,secretaria,departamento,
       vinculo,situacao,data_admissao,data_demissao,carga_horaria,salario_base,gratificacoes,outros,
       ferias,decimo,bruto,descontos,liquido,_hash)
      select * from unnest($1::text[],$2::text[],$3::text[],$4::text[],$5::text[],$6::text[],$7::text[],
        $8::text[],$9::text[],$10::text[],$11::text[],$12::text[],$13::text[],$14::text[],$15::text[],
        $16::numeric[],$17::numeric[],$18::numeric[],$19::numeric[],$20::numeric[],$21::numeric[],
        $22::numeric[],$23::numeric[],$24::text[])
      on conflict (_hash) do update set salario_base=excluded.salario_base, bruto=excluded.bruto,
        descontos=excluded.descontos, liquido=excluded.liquido, ferias=excluded.ferias,
        decimo=excluded.decimo, gratificacoes=excluded.gratificacoes, outros=excluded.outros, _coletado_em=now()`,
      [c("cod_ibge"), c("municipio"), c("entidade"), c("competencia"), c("nome"), c("cpf_masc"), c("matricula"),
       c("cargo"), c("secretaria"), c("departamento"), c("vinculo"), c("situacao"), c("data_admissao"),
       c("data_demissao"), c("carga_horaria"), c("salario_base"), c("gratificacoes"), c("outros"),
       c("ferias"), c("decimo"), c("bruto"), c("descontos"), c("liquido"), c("_hash")]);
  }
  return uniq.length;
}

const inst = (await get("/recursos-humanos/instituicoes"))?.data || [];
const portais = inst.filter((x) => !/c[âa]mara/i.test(x.nome || ""));
console.log(`[pvh] ${portais.length} portais: ${portais.map((p) => p.id).join(", ")}`);

const NOME_MES = { "01": "Janeiro", "02": "Fevereiro", "03": "Março", "04": "Abril", "05": "Maio", "06": "Junho",
  "07": "Julho", "08": "Agosto", "09": "Setembro", "10": "Outubro", "11": "Novembro", "12": "Dezembro" };

for (const portal of portais) {
  const pid = portal.id;
  const anos = ((await get(`/recursos-humanos/anos/${pid}`))?.data || []).map((x) => x.ano).sort().reverse();
  if (!anos.length) { console.log(`  – portal ${pid}: sem anos`); continue; }
  const ano = anos[0];
  const meses = ((await get(`/recursos-humanos/meses/${pid}/${ano}`))?.data || []).map((x) => x.mes).sort().reverse();
  if (!meses.length) { console.log(`  – portal ${pid}: sem meses em ${ano}`); continue; }
  const mes = meses[0];
  const comp = `${ano}${mes}`;

  // ⚠️ portal já fechado nesta competência: pular ANTES de baixar as páginas. Sem isto, cada reinício
  // rebaixa as 111 páginas do IPAM só para descobrir que já tinha tudo — e com API limitada isso custa caro.
  const feito = (await q(`select com_valor from folha_portovelho_coleta
    where portal=$1 and competencia=$2 and situacao='ok'`, [String(pid), comp])).rows[0];
  if (feito?.com_valor > 0) {
    console.log(`\n[pvh] portal ${pid}: já coletado em ${comp} (${feito.com_valor} com valor) — pulando`);
    continue;
  }
  console.log(`\n[pvh] portal ${pid} (${portal.titulo}) · competência ${comp}`);

  const p1 = await get(`/recursos-humanos/movimentacoes/${pid}/${ano}/${mes}?page=1`);
  const ultima = p1?.meta?.last_page ?? 1;
  const totalDecl = p1?.meta?.total ?? 0;
  const lista = [...(p1?.data || [])];
  let pg = 2;
  async function baixaPaginas() {
    while (pg <= ultima) {
      const n = pg++;
      const j = await get(`/recursos-humanos/movimentacoes/${pid}/${ano}/${mes}?page=${n}`);
      if (j?.data) lista.push(...j.data);
      if (n % 100 === 0) console.log(`   lista: ${lista.length}/${totalDecl}`);
    }
  }
  await Promise.all(Array.from({ length: CONC }, baixaPaginas));
  console.log(`   lista completa: ${lista.length} de ${totalDecl} declarados`);

  const jaTem = new Set((await q(`select matricula from folha_servidores_portovelho
    where cod_ibge=$1 and competencia=$2 and bruto is not null`, [IBGE, comp])).rows.map((r) => r.matricula));
  const fila = lista.filter((s) => SO_LISTA || !jaTem.has(String(s.matricula)));
  console.log(`   ${fila.length} servidores a buscar remuneração (${jaTem.size} já gravados)`);

  const nomeMes = NOME_MES[mes];
  let i = 0, buffer = [], gravados = 0, semValor = 0;
  async function trab() {
    while (i < fila.length) {
      const s = fila[i++];
      const base = {
        cod_ibge: IBGE, municipio: MUN, entidade: portal.nome, competencia: comp,
        nome: s.nome, cpf_masc: s.cpf, matricula: String(s.matricula), cargo: s.cargo,
        secretaria: s.lotacao, departamento: s.local_trabalho, vinculo: s.regime, situacao: s.situacao,
        data_admissao: s.data_admissao, data_demissao: s.data_demissao,
        carga_horaria: s.horas_semanais == null ? null : String(s.horas_semanais),
        _hash: crypto.createHash("md5").update([IBGE, comp, pid, s.matricula, s.nome, s.cargo].join("|")).digest("hex"),
      };
      if (!SO_LISTA) {
        const d = (await get(`/recursos-humanos/remuneracao/${pid}/${s.matricula}/${ano}/${mes}`))?.data;
        const r = d?.remuneracao?.[nomeMes];
        if (r) {
          Object.assign(base, {
            salario_base: val(r.valor_rem01), ferias: val(r.valor_rem02), decimo: val(r.valor_rem03),
            gratificacoes: val(r.valor_rem04), outros: val(r.valor_rem05),
            bruto: val(r.valor_rem07), descontos: val(r.valor_rem12), liquido: val(r.valor_rem13),
          });
        } else semValor++;
      }
      buffer.push(base);
      if (buffer.length >= FLUSH) {
        const b = buffer; buffer = [];
        gravados += await grava(b);
        console.log(`   ${gravados}/${fila.length} gravados · ${semValor} sem valor`);
      }
    }
  }
  await Promise.all(Array.from({ length: CONC }, trab));
  if (buffer.length) gravados += await grava(buffer);

  const comValor = (await q(`select count(*) n from folha_servidores_portovelho
    where cod_ibge=$1 and competencia=$2 and bruto>0`, [IBGE, comp])).rows[0].n;
  await q(`insert into folha_portovelho_coleta (portal,competencia,listados,com_valor,situacao,detalhe,em)
    values ($1,$2,$3,$4,$5,$6,now()) on conflict (portal,competencia) do update set listados=excluded.listados,
    com_valor=excluded.com_valor, situacao=excluded.situacao, detalhe=excluded.detalhe, em=now()`,
    [String(pid), comp, lista.length, Number(comValor), "ok",
     `${portal.titulo} · declarados ${totalDecl} · sem valor ${semValor}`]);
  console.log(`   ✔ portal ${pid}: ${gravados} gravados · ${comValor} com valor`);
}

console.table((await q(`select competencia, entidade, count(*) linhas, count(*) filter (where bruto>0) com_valor,
  round(avg(bruto) filter (where bruto>0)::numeric,2) media_bruto
  from folha_servidores_portovelho group by 1,2 order by 3 desc`)).rows);
await db.end();
