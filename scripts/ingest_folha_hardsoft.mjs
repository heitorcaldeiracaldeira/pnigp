// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
// ingest_folha_hardsoft.mjs — folha nominal dos municípios com portal HardSoft Sistemas (Laravel, HTML servido).
// Achado em 16/ago/2026 em Cacequi/RS.
//
// Duas telas que se COMPLETAM (nenhuma sozinha basta):
//   /pessoal/folha/servidor?exercicio=&mes=&busca=&page=N → Matrícula · Servidor(+CPF mascarado) · Proventos ·
//                                                            Descontos · Líquido      — 20 por página
//   /pessoal/quadro/servidor                              → Matrícula · Nome · Admissão · FUNÇÃO · LOTAÇÃO
// O cruzamento é pela MATRÍCULA: a folha tem o dinheiro, o quadro tem cargo e secretaria
// ([[pnigp-folha-municipal-cinco-campos]]).
//
// Uso: HOST=transparencia-cacequipm.hardsoftsistemas.com IBGE=4302907 MUN=Cacequi node scripts/ingest_folha_hardsoft.mjs
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
import crypto from "crypto";
import { pool, withRetry } from "./_cadprev.mjs";

const db = pool();
const q = withRetry(db);
const HOST = process.env.HOST || "transparencia-cacequipm.hardsoftsistemas.com";
const IBGE = process.env.IBGE || "4302907";
const MUN = process.env.MUN || "Cacequi";
const UF = process.env.UF || "RS";
const ANO = process.env.ANO || String(new Date().getFullYear());
const MESES_TESTE = Number(process.env.MESES_TESTE || 3);
const MES_INI = Number(process.env.MES_INI || new Date().getMonth() + 1);
const UA = { "user-agent": "Mozilla/5.0 (compatible; PNIGP/1.0; pesquisa de dados publicos)" };

await q(`create table if not exists folha_servidores_hardsoft (
  cod_ibge text, municipio text, uf text, competencia text,
  matricula text, nome text, cargo text, lotacao text, admissao text,
  proventos numeric, descontos numeric, liquido numeric,
  _hash text primary key, _coletado_em timestamptz default now()
)`);
await q(`create index if not exists ix_folha_hardsoft_mun on folha_servidores_hardsoft (cod_ibge, competencia)`);
await q(`create table if not exists folha_hardsoft_coleta (
  cod_ibge text primary key, municipio text, uf text, host text, competencia text,
  servidores int, com_valor int, situacao text, detalhe text, em timestamptz default now()
)`);

const money = (s) => {
  const t = String(s ?? "").replace(/R\$|\s/g, "").replace(/\./g, "").replace(",", ".").trim();
  const n = parseFloat(t);
  return Number.isFinite(n) ? n : null;
};
const limpa = (s) => String(s ?? "").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
function tabela(html) {
  return [...html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)]
    .map((tr) => [...tr[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((m) => limpa(m[1])))
    .filter((l) => l.length >= 4);
}
async function pega(url) {
  for (let t = 0; t < 3; t++) {
    try {
      const r = await fetch(url, { headers: UA, signal: AbortSignal.timeout(90000) });
      if (r.ok) return await r.text();
      if (r.status === 404) return null;
    } catch { /* tenta de novo */ }
    await new Promise((s) => setTimeout(s, 2000 * (t + 1)));
  }
  return null;
}

// ── o quadro: cargo e lotação por matrícula (uma página só, tudo junto)
const htmlQuadro = await pega(`https://${HOST}/pessoal/quadro/servidor`);
const quadro = new Map();
if (htmlQuadro) {
  for (const l of tabela(htmlQuadro)) {
    const [mat, nome, adm, funcao, lot] = l;
    if (mat) quadro.set(mat.trim(), { nome, admissao: adm, cargo: funcao, lotacao: lot });
  }
}
console.log(`[hardsoft] ${MUN}: quadro com ${quadro.size} servidores`);

// ── a folha: pagina de 20 em 20, na competência MAIS CHEIA
async function folhaDoMes(ano, mes) {
  const out = [];
  for (let pagina = 1; pagina <= 500; pagina++) {
    const html = await pega(`https://${HOST}/pessoal/folha/servidor?exercicio=${ano}&mes=${mes}&busca=&page=${pagina}`);
    if (!html) break;
    const linhas = tabela(html);
    if (!linhas.length) break;
    const antes = out.length;
    for (const l of linhas) {
      const [mat, servidor, prov, desc, liq] = l;
      if (!mat || !/\d/.test(mat)) continue;
      out.push({ matricula: mat.trim(), nome: servidor.replace(/CPF:.*$/i, "").trim(),
                 proventos: money(prov), descontos: money(desc), liquido: money(liq) });
    }
    if (out.length === antes) break;          // página repetida ou sem linha nova
    if (linhas.length < 20) break;            // última página
  }
  // 🚨 a paginação pode devolver a MESMA página quando `page` estoura — dedup por matrícula antes de contar
  return [...new Map(out.map((x) => [x.matricula, x])).values()];
}

let melhor = null;
for (let k = 0; k < MESES_TESTE; k++) {
  const mes = MES_INI - k > 0 ? MES_INI - k : 12 + (MES_INI - k);
  const ano = MES_INI - k > 0 ? ANO : String(+ANO - 1);
  const linhas = await folhaDoMes(ano, mes);
  console.log(`   ${ano}/${String(mes).padStart(2, "0")}: ${linhas.length} servidores`);
  if (linhas.length && (!melhor || linhas.length > melhor.linhas.length)) melhor = { ano, mes, linhas };
}
const marca = (situacao, detalhe, comp = null, n = 0, cv = 0) =>
  q(`insert into folha_hardsoft_coleta (cod_ibge,municipio,uf,host,competencia,servidores,com_valor,situacao,detalhe,em)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,now()) on conflict (cod_ibge) do update set competencia=excluded.competencia,
     servidores=excluded.servidores, com_valor=excluded.com_valor, situacao=excluded.situacao,
     detalhe=excluded.detalhe, em=now()`, [IBGE, MUN, UF, HOST, comp, n, cv, situacao, detalhe]);

if (!melhor) { await marca("vazio", `sem linhas em ${MESES_TESTE} meses`); console.log("[hardsoft] sem dados"); await db.end(); process.exit(0); }
const comp = `${melhor.ano}${String(melhor.mes).padStart(2, "0")}`;
const regs = melhor.linhas.map((x) => {
  const qd = quadro.get(x.matricula) || {};
  return { cod_ibge: IBGE, municipio: MUN, uf: UF, competencia: comp,
    matricula: x.matricula, nome: x.nome || qd.nome || "", cargo: qd.cargo || "", lotacao: qd.lotacao || "",
    admissao: qd.admissao || "", proventos: x.proventos, descontos: x.descontos, liquido: x.liquido,
    _hash: crypto.createHash("md5").update([IBGE, comp, x.matricula, x.nome].join("¦")).digest("hex") };
}).filter((r) => r.nome);
for (let i = 0; i < regs.length; i += 1000) {
  const p = regs.slice(i, i + 1000);
  const c = (f) => p.map((x) => x[f]);
  await q(`insert into folha_servidores_hardsoft
    (cod_ibge,municipio,uf,competencia,matricula,nome,cargo,lotacao,admissao,proventos,descontos,liquido,_hash)
    select * from unnest($1::text[],$2::text[],$3::text[],$4::text[],$5::text[],$6::text[],$7::text[],$8::text[],
      $9::text[],$10::numeric[],$11::numeric[],$12::numeric[],$13::text[])
    on conflict (_hash) do update set proventos=excluded.proventos, descontos=excluded.descontos,
      liquido=excluded.liquido, _coletado_em=now()`,
    [c("cod_ibge"), c("municipio"), c("uf"), c("competencia"), c("matricula"), c("nome"), c("cargo"), c("lotacao"),
     c("admissao"), c("proventos"), c("descontos"), c("liquido"), c("_hash")]);
}
const cv = regs.filter((r) => r.proventos > 0).length;
const comCargo = regs.filter((r) => r.cargo).length;
await marca("ok", `folha × quadro por matrícula · ${comCargo} com cargo/lotação`, comp, regs.length, cv);
console.log(`[hardsoft] ${MUN}: ${regs.length} servidores (${cv} com valor · ${comCargo} com cargo) · ${comp}`);
await db.end();
