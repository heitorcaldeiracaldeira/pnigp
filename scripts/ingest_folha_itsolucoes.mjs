// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
// ingest_folha_itsolucoes.mjs — folha NOMINAL COM VALOR do portal `portaltransparencia.app.br` (IT Soluções),
// forte nas CÂMARAS de Pernambuco.
//
// ⭐ POR QUE IMPORTA: PE tem 184 câmaras com folha NOMINAL e SEM VALOR — é o limite do TCE-PE, que publica nome
// e cargo e não publica remuneração. Este portal publica **remuneração individualizada**, então é valor onde só
// havia nome ([[pnigp-lista-sem-valor-nao-e-folha]] deixa de morder aqui).
//
// A ROTA (GET puro, sem navegador, sem postback, sem sessão):
//   `servidoresMunicipal.aspx?t=1&p_i={ENTIDADE}&p_t=0&ano=AAAA&mes=M`
// Colunas da tabela: ANO · SERVIDOR/AGENTE · CARGO/JORNADA · FUNÇÃO/VÍNCULO · REMUNERAÇÃO_INDIVIDUAL, e cada
// célula empacota vários campos:
//   SERVIDOR   = "Matrícula: 000121 CPF: 034.9**.***-** EDNILDO GALINDO FREIRE"
//   CARGO      = "VEREADOR / 24 horas"
//   VÍNCULO    = "VEREADOR / 24 / Eletivo"
//   REMUNERAÇÃO= "Vencimentos: R$ 10400,00 Desconto: R$ 2530,12 Líquido: R$ 7869,88"
// ⭐ O CPF vem mascarado no PREFIXO (`034.9**.***-**`, 4 dígitos) — mais um padrão para `cpf_masc_visivel`.
// 🚨 O rótulo e o valor NÃO estão colados no HTML (há tags e `&nbsp;` no meio): casar "Vencimentos:\s*R\$"
//    devolve zero numa página que tem 28 ocorrências do rótulo.
//
// Uso: node scripts/ingest_folha_itsolucoes.mjs        · ANO=2026 MES=7 · SO=Alagoinha · REFAZ=1
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
import crypto from "crypto";
import { pool, withRetry } from "./_cadprev.mjs";

const db = pool();
const q = withRetry(db);
const ANO = Number(process.env.ANO || 2026);
const MES = Number(process.env.MES || 7);
const RECUO = Number(process.env.RECUO || 8);      // meses a recuar quando a competência vier vazia
const CONC = Number(process.env.CONC || 4);
const SO = process.env.SO || null;
const BASE = "https://portaltransparencia.app.br";
const UA = { "user-agent": "Mozilla/5.0 (compatible; PNIGP/1.0; pesquisa de dados publicos)" };

await q(`create table if not exists folha_servidores_itsolucoes (
  cod_ibge text, municipio text, uf text, poder text, entidade text, p_i int, competencia text,
  matricula text, cpf_masc text, nome text, cargo text, jornada text, vinculo text,
  bruto numeric, descontos numeric, liquido numeric,
  _hash text primary key, _coletado_em timestamptz default now())`);
await q(`create index if not exists ix_folha_its_mun on folha_servidores_itsolucoes (cod_ibge, competencia)`);
await q(`create table if not exists folha_itsolucoes_coleta (
  p_i int primary key, cod_ibge text, entidade text, uf text, competencia text, linhas int,
  situacao text, detalhe text, em timestamptz default now())`);

const money = (s) => {
  const t = String(s || "").replace(/[R$\s ]/g, "").replace(/\./g, "").replace(",", ".");
  const n = Number(t); return Number.isFinite(n) && t !== "" ? n : null;
};
const limpa = (s) => String(s || "").replace(/<[^>]*>/g, " ").replace(/&nbsp;/g, " ")
  .replace(/&amp;/g, "&").replace(/&#39;/g, "'").replace(/\s+/g, " ").trim();

async function baixa(url) {
  for (let t = 0; t < 3; t++) {
    try { const r = await fetch(url, { headers: UA, redirect: "follow", signal: AbortSignal.timeout(60000) });
      if (r.ok) return await r.text(); } catch { /* retry */ }
    await new Promise((s) => setTimeout(s, 2000 * (t + 1)));
  }
  return null;
}

// competências a tentar, da pedida para trás
const COMPETENCIAS = [];
for (let k = 0; k < RECUO; k++) {
  let mm = MES - k, aa = ANO;
  while (mm <= 0) { mm += 12; aa -= 1; }
  COMPETENCIAS.push({ ano: aa, mes: mm });
}

function extrai(html, ctx) {
  const out = [];
  for (const tr of html.match(/<tr[^>]*>[\s\S]*?<\/tr>/gi) || []) {
    const tds = [...tr.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((m) => limpa(m[1]));
    if (tds.length < 5) continue;
    const [ano, servidor, cargoJor, vinc, remun] = tds;
    if (!/^\d{4}$/.test(ano)) continue;                       // linha de cabeçalho/rodapé
    const matricula = (servidor.match(/Matr[íi]cula:\s*([0-9A-Za-z-]+)/i) || [])[1] || null;
    const cpf = (servidor.match(/CPF:\s*([0-9Xx*.\-]+)/i) || [])[1] || null;
    // o NOME é o que sobra depois de matrícula e CPF
    const nome = servidor.replace(/Matr[íi]cula:\s*[0-9A-Za-z-]+/i, "").replace(/CPF:\s*[0-9Xx*.\-]+/i, "").trim();
    if (!nome) continue;
    const cargo = (cargoJor.split("/")[0] || "").trim() || null;
    const jornada = (cargoJor.split("/")[1] || "").trim() || null;
    const vinculo = (vinc.split("/").slice(2).join("/") || "").trim() || null;
    const bruto = money((remun.match(/Vencimentos:\s*([R$\s.,0-9]+)/i) || [])[1]);
    const desc = money((remun.match(/Desconto[s]?:\s*([R$\s.,0-9]+)/i) || [])[1]);
    const liq = money((remun.match(/L[íi]quido:\s*([R$\s.,0-9]+)/i) || [])[1]);
    out.push({ ...ctx, matricula, cpf_masc: cpf, nome, cargo, jornada, vinculo,
      bruto, descontos: desc, liquido: liq,
      _hash: crypto.createHash("md5").update([ctx.p_i, ctx.competencia, matricula, nome, cargo].join("¦")).digest("hex") });
  }
  return out;
}

const alvos = (await q(`select p_i, entidade, uf, cod_ibge, municipio_txt from itsolucoes_entidade
  where tem_remuneracao ${SO ? "and municipio_txt ilike '%'||$1||'%'" : ""}
  order by p_i`, SO ? [SO] : [])).rows;
const feitos = process.env.REFAZ === "1" ? new Set()
  : new Set((await q(`select p_i from folha_itsolucoes_coleta where situacao='ok'`)).rows.map((r) => r.p_i));
const fila = alvos.filter((a) => !feitos.has(a.p_i));
console.log(`[itsolucoes] ${alvos.length} entidades · ${fila.length} na fila · concorrência ${CONC}`);

let total = 0, ok = 0, vazio = 0, falha = 0;
for (let i = 0; i < fila.length; i += CONC) {
  await Promise.all(fila.slice(i, i + CONC).map(async (a) => {
    const poder = /c[âa]mara/i.test(a.entidade || "") ? "legislativo" : "executivo";
    let regs = [], compUsada = null;
    for (const { ano, mes } of COMPETENCIAS) {
      const html = await baixa(`${BASE}/servidoresMunicipal.aspx?t=1&p_i=${a.p_i}&p_t=0&ano=${ano}&mes=${mes}`);
      if (!html) continue;
      const comp = `${ano}${String(mes).padStart(2, "0")}`;
      const r = extrai(html, { cod_ibge: a.cod_ibge, municipio: a.municipio_txt, uf: a.uf, poder,
                               entidade: a.entidade, p_i: a.p_i, competencia: comp });
      if (r.length) { regs = r; compUsada = comp; break; }
    }
    const marca = (situacao, detalhe, linhas = 0) =>
      q(`insert into folha_itsolucoes_coleta (p_i,cod_ibge,entidade,uf,competencia,linhas,situacao,detalhe,em)
         values ($1,$2,$3,$4,$5,$6,$7,$8,now()) on conflict (p_i) do update set competencia=excluded.competencia,
           linhas=excluded.linhas, situacao=excluded.situacao, detalhe=excluded.detalhe, em=now()`,
        [a.p_i, a.cod_ibge, a.entidade, a.uf, compUsada, linhas, situacao, detalhe]);
    if (!regs.length) { await marca("vazio", `sem linhas em ${RECUO} competências`); vazio++; return; }
    const c = (f) => regs.map((x) => x[f]);
    await q(`insert into folha_servidores_itsolucoes
      (cod_ibge,municipio,uf,poder,entidade,p_i,competencia,matricula,cpf_masc,nome,cargo,jornada,vinculo,
       bruto,descontos,liquido,_hash)
      select * from unnest($1::text[],$2::text[],$3::text[],$4::text[],$5::text[],$6::int[],$7::text[],$8::text[],
        $9::text[],$10::text[],$11::text[],$12::text[],$13::text[],$14::numeric[],$15::numeric[],$16::numeric[],$17::text[])
      on conflict (_hash) do update set bruto=coalesce(excluded.bruto, folha_servidores_itsolucoes.bruto),
        descontos=coalesce(excluded.descontos, folha_servidores_itsolucoes.descontos),
        liquido=coalesce(excluded.liquido, folha_servidores_itsolucoes.liquido),
        cpf_masc=coalesce(excluded.cpf_masc, folha_servidores_itsolucoes.cpf_masc), _coletado_em=now()`,
      [c("cod_ibge"), c("municipio"), c("uf"), c("poder"), c("entidade"), c("p_i"), c("competencia"),
       c("matricula"), c("cpf_masc"), c("nome"), c("cargo"), c("jornada"), c("vinculo"),
       c("bruto"), c("descontos"), c("liquido"), c("_hash")]);
    await marca("ok", `${poder} · ${compUsada}`, regs.length);
    total += regs.length; ok++;
    console.log(`  ✔ ${a.uf} ${a.entidade}: ${regs.length} servidores (${compUsada})`);
  }));
}
console.log(`\n[itsolucoes] ${total.toLocaleString("pt-BR")} servidores · ${ok} entidades ok · ${vazio} vazias · ${falha} falhas`);
await db.end();
