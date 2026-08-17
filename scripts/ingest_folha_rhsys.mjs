// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
// ingest_folha_rhsys.mjs — folha nominal do **RHsys Portal Transparência** (`{host}/rhsysportaltransp`).
//
// POR QUÊ: bloco novo, achado em 17/ago ao investigar Santa Cruz do Sul (RS) município por município.
// O portal GRP dela não tem consulta de pessoal no menu da tela — mas o MENU EM JSON
// (`/infra/apigw/transparencia/service/portal/conteudo/transparencia/menu?categoria=1062`) lista
// "Relação de Servidores" apontando para outro host: `portal.santacruz.rs.gov.br/rhsysportaltransp`.
// ⭐ A LEI: quando o menu da tela não mostra pessoal, PERGUNTAR AO SISTEMA — o menu em JSON traz itens que a
//    interface não exibe ([[pnigp-diagnostico-profundo-menu-dados-produto]]).
//
// 🚨 NÃO confundir com `rhsysweb`, que é o PORTAL DO SERVIDOR com login (Passo Fundo cadastrou essa URL e por
//    isso aparecia como "sem item de pessoal"). O de transparência é `rhsysportaltransp`.
//
// A API (AngularJS, REST puro, sem token):
//   GET /api/lov/referencia                                    → competências ({codigo: ISO, descricao: "07/2026"})
//   GET /api/relacaoservidores?page=N&referencia={ISO}         → {count, dados:[{matricula, nmfuncionario, nmcargo,
//                                                                 nmorgao, nmvinculo, inativo, pensionista, hrmensais}]}
//   GET /api/relacaoservidores/folha?matricula=M&referencia={} → {dados:{detalhesValorColuna:[{descricao, sinal, valor}]}}
// ⚠️ O VALOR é ficha a ficha — uma requisição por servidor. `check-config` confirma: `exportEnabled: "N"`.
//
// Uso: HOST=portal.santacruz.rs.gov.br MUN="Santa Cruz do Sul" UF=RS node scripts/ingest_folha_rhsys.mjs
//      SEM_VALOR=1 traz só o cadastro (rápido) · CONC=4
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
import crypto from "crypto";
import { pool, withRetry } from "./_cadprev.mjs";

const db = pool();
const q = withRetry(db);
const HOST = process.env.HOST;
const MUN = process.env.MUN;
const UF = process.env.UF || "RS";
const CONC = +(process.env.CONC || 4);
const PAUSA = +(process.env.PAUSA || 150);
const SEM_VALOR = process.env.SEM_VALOR === "1";
const dorme = (ms) => new Promise((s) => setTimeout(s, ms));
const UA = { "user-agent": "Mozilla/5.0 (compatible; PNIGP/1.0; pesquisa de dados publicos)", accept: "application/json" };

await q(`create table if not exists folha_servidores_rhsys (
  cod_ibge text, municipio text, uf text, host text, competencia text,
  matricula text, nome text, cargo text, orgao text, vinculo text, situacao text,
  horas_mensais numeric, bruto numeric, descontos numeric, liquido numeric,
  _hash text primary key, _coletado_em timestamptz default now()
)`);
await q(`create index if not exists ix_folha_rhsys_mun on folha_servidores_rhsys (cod_ibge, competencia)`);
await q(`create table if not exists folha_rhsys_coleta (
  cod_ibge text primary key, municipio text, uf text, host text, competencia text,
  servidores int, com_valor int, situacao text, detalhe text, em timestamptz default now()
)`);

const RAIZ = `https://${HOST}/rhsysportaltransp/`;
const B = `${RAIZ}api`;
const H = { ...UA, referer: RAIZ };
// 🚨 A API responde **HTTP 440 "Sessão Inválida"** sem o JSESSIONID — e ele NÃO vem da página: vem da chamada
//    `/api/tracking/check-config`. Abrir a raiz não devolve cookie nenhum. Sem esse passo, `/relacaoservidores`
//    volta vazio e o município parece não publicar ([[pnigp-coletor-ok-sem-dado-sete-causas]]).
//    ⭐ O servidor se identifica como `srv-admrh-02` — é o mesmo fornecedor do ADMRH ([[pnigp-admrh-e-pelotas-csv]]).
let COOKIE = "";
async function abreSessao() {
  await fetch(RAIZ, { headers: { ...UA, accept: "text/html" }, redirect: "follow" }).catch(() => null);
  const r = await fetch(`${B}/tracking/check-config`, { headers: H }).catch(() => null);
  COOKIE = (r?.headers.getSetCookie?.() || []).map((c) => c.split(";")[0]).join("; ");
  return !!COOKIE;
}
const pede = async (caminho) => {
  for (let t = 1; t <= 3; t++) {
    const r = await fetch(B + caminho, { headers: { ...H, ...(COOKIE ? { cookie: COOKIE } : {}) }, signal: AbortSignal.timeout(120000) }).catch(() => null);
    if (r?.ok) { const j = await r.json().catch(() => null); if (j) return j; }
    if (r?.status === 440) await abreSessao();   // a sessão expira: reabrir e tentar de novo
    await dorme(2000 * t);
  }
  return null;
};
const lim = (v) => { const t = String(v ?? "").trim(); return t && t !== "-" ? t : null; };
// "10009 - LUCIANE TERESA GULARTE" → o nome vem prefixado pela matrícula
const soNome = (s) => String(s || "").replace(/^\s*\d+\s*-\s*/, "").trim() || null;

const m = (await q(`select cod_ibge, nome from municipios_br where uf=$1 and nome ilike $2||'%' limit 1`, [UF, MUN])).rows[0];
if (!m) { console.log(`[rhsys] município ${MUN}/${UF} não encontrado`); process.exit(1); }
console.log(`[rhsys] ${m.nome} (${m.cod_ibge}) · ${HOST}`);

const marca = (situacao, detalhe, comp = null, n = 0, cv = 0) =>
  q(`insert into folha_rhsys_coleta (cod_ibge,municipio,uf,host,competencia,servidores,com_valor,situacao,detalhe,em)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,now()) on conflict (cod_ibge) do update set host=excluded.host,
       competencia=excluded.competencia, servidores=excluded.servidores, com_valor=excluded.com_valor,
       situacao=excluded.situacao, detalhe=excluded.detalhe, em=now()`,
    [m.cod_ibge, m.nome, UF, HOST, comp, n, cv, situacao, detalhe]);

if (!(await abreSessao())) console.log("  ⚠️ não consegui o JSESSIONID — as consultas devem falhar com 440");
// ⚠️ competência mais CHEIA, não a mais recente — o mês corrente costuma vir parcial
const refs = (await pede("/lov/referencia"))?.dados || [];
if (!refs.length) { await marca("sem_referencia", "a API não devolveu competências"); console.log("  ✖ sem competências"); process.exit(0); }
console.log(`  ${refs.length} competências · testando as 4 mais recentes`);
let melhor = null;
const medidas = [];
for (const r of refs.slice(0, 4)) {
  const j = await pede(`/relacaoservidores?page=1&referencia=${encodeURIComponent(r.codigo)}`);
  const n = +(j?.count || 0);
  medidas.push(`${r.descricao}:${n}`);
  if (n > 0 && (!melhor || n > melhor.n)) melhor = { ref: r, n };
  await dorme(PAUSA);
}
if (!melhor) { await marca("vazio", `sem servidores (${medidas.join(" ")})`); console.log("  ✖ nenhuma competência com servidores"); process.exit(0); }
const comp = melhor.ref.descricao.replace(/(\d{2})\/(\d{4})/, "$2$1");
console.log(`  competência ${melhor.ref.descricao} → ${comp} · ${melhor.n} servidores (${medidas.join(" ")})`);

// ── cadastro: a lista paginada ──────────────────────────────────────────────────────────────────────────────────
const todos = [];
for (let p = 1; todos.length < melhor.n && p < 500; p++) {
  const j = await pede(`/relacaoservidores?page=${p}&referencia=${encodeURIComponent(melhor.ref.codigo)}`);
  const d = j?.dados || [];
  if (!d.length) break;
  todos.push(...d);
  if (p % 10 === 0) process.stdout.write(`\r   … ${todos.length}/${melhor.n} servidores`);
  await dorme(PAUSA);
}
console.log(`\r  cadastro: ${todos.length} servidores`);

// ── valores: uma requisição por servidor ────────────────────────────────────────────────────────────────────────
const valores = new Map();
if (!SEM_VALOR) {
  let feitas = 0, ruins = 0;
  const fila = [...todos];
  const trab = async () => {
    while (fila.length) {
      const s = fila.pop();
      const j = await pede(`/relacaoservidores/folha?matricula=${encodeURIComponent(s.matricula)}&referencia=${encodeURIComponent(melhor.ref.codigo)}`);
      feitas++;
      const linhas = j?.dados?.detalhesValorColuna || [];
      if (!linhas.length) ruins++;
      else {
        // 🚨 ler por RÓTULO, nunca por posição: a lista de rubricas varia por servidor
        const acha = (re) => linhas.find((x) => re.test(String(x.descricao || "")))?.valor;
        const liq = acha(/total l[íi]quido/i);
        const ded = acha(/dedu[çc][õo]es obrigat/i) ?? acha(/total.*descont/i);
        const bru = acha(/total bruto/i) ?? acha(/total de vencimento/i) ??
          (liq != null && ded != null ? +(liq + ded).toFixed(2) : null);
        valores.set(String(s.matricula), { bruto: bru, descontos: ded != null ? Math.abs(ded) : null, liquido: liq });
      }
      if (feitas % 500 === 0) console.log(`   … ${feitas}/${todos.length} fichas · ${ruins} sem valor`);
      await dorme(PAUSA);
    }
  };
  await Promise.all(Array.from({ length: CONC }, trab));
  console.log(`  valores: ${valores.size} de ${todos.length} (${ruins} sem)`);
}

const regs = todos.map((s) => {
  const v = valores.get(String(s.matricula)) || {};
  return { cod_ibge: m.cod_ibge, municipio: m.nome, uf: UF, host: HOST, competencia: comp,
    matricula: String(s.matricula), nome: soNome(s.nmfuncionario), cargo: lim(s.nmcargo),
    orgao: lim(s.nmorgao), vinculo: lim(s.nmvinculo),
    situacao: s.pensionista ? "Pensionista" : s.inativo ? "Inativo" : "Ativo",
    horas_mensais: s.hrmensais ?? null, bruto: v.bruto ?? null, descontos: v.descontos ?? null, liquido: v.liquido ?? null,
    _hash: crypto.createHash("md5").update([m.cod_ibge, comp, s.matricula, s.nmcargo, v.bruto ?? ""].join("¦")).digest("hex") };
}).filter((r) => r.nome);

if (regs.length) {
  const mp = new Map(); for (const r of regs) mp.set(r._hash, r);
  const arr = [...mp.values()];
  for (let i = 0; i < arr.length; i += 500) {
    const p = arr.slice(i, i + 500); const c = (f) => p.map((x) => x[f]);
    await q(`insert into folha_servidores_rhsys
      (cod_ibge,municipio,uf,host,competencia,matricula,nome,cargo,orgao,vinculo,situacao,horas_mensais,bruto,descontos,liquido,_hash)
      select * from unnest($1::text[],$2::text[],$3::text[],$4::text[],$5::text[],$6::text[],$7::text[],$8::text[],
        $9::text[],$10::text[],$11::text[],$12::numeric[],$13::numeric[],$14::numeric[],$15::numeric[],$16::text[])
      on conflict (_hash) do update set bruto=excluded.bruto, descontos=excluded.descontos,
        liquido=excluded.liquido, _coletado_em=now()`,
      [c("cod_ibge"), c("municipio"), c("uf"), c("host"), c("competencia"), c("matricula"), c("nome"), c("cargo"),
       c("orgao"), c("vinculo"), c("situacao"), c("horas_mensais"), c("bruto"), c("descontos"), c("liquido"), c("_hash")]);
  }
  const cv = arr.filter((r) => r.bruto > 0).length;
  await marca("ok", `competência mais cheia de ${medidas.length} (${medidas.join(" ")})`, comp, arr.length, cv);
  console.log(`  ✔ ${arr.length.toLocaleString("pt-BR")} servidores gravados · ${cv.toLocaleString("pt-BR")} com valor`);
} else { await marca("vazio", "lista sem nomes", comp); console.log("  ✖ nenhum registro"); }
await db.end();
