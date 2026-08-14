// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
// ingest_folha_govbr.mjs — ingere o XML de folha exportado do portal GovernançaBrasil (PRONIM/cidade360, `geraxml.asp`).
//
// 🚨 DIVISÃO HUMANO-NO-LOOP: o export do GovBR é protegido por reCAPTCHA v3 ([[pnigp-govbr-pronim-transparencia]]).
// O HEITOR gera/baixa o XML por município (ele passa o captcha — passo humano legítimo); ESTE script só PARSEIA o
// arquivo que ele já obteve. Não automatiza captcha.
//
// Estrutura do XML (ISO-8859-1): <FolhasPagamento><FolhaPagamento> com
//   Competencia (MM/AAAA) · Lotacao (=secretaria) · Cargo · NomServidor · SalarioBase · Proventos · Vantagens ·
//   VencimentosTotais · Descontos · Liquido. Dinheiro em "R$ 1.912,89" (ponto milhar, vírgula decimal).
//
// Uso: ARQ="caminho/FolhaPagamento.xml" MUN="Ijuí" UF="RS" node scripts/ingest_folha_govbr.mjs
//   (ou IBGE=4310207). O XML NÃO traz o município — vem do parâmetro (o Heitor exporta um arquivo por município).
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
import fs from "fs";
import crypto from "crypto";
import { pool, withRetry } from "./_cadprev.mjs";

const db = pool();
const q = withRetry(db);
const ARQ = process.env.ARQ;
const MUN = process.env.MUN || null;
const UF = process.env.UF || null;
const IBGE = process.env.IBGE || null;
if (!ARQ) { console.error("faltou ARQ=caminho/FolhaPagamento.xml"); process.exit(1); }

await q(`create table if not exists folha_servidores_govbr (
  cod_ibge text, municipio text, uf text, competencia text,
  lotacao text, secretaria text, cargo text, nome text,
  salario_base numeric, proventos numeric, vantagens numeric, vencimentos_totais numeric,
  descontos numeric, liquido numeric,
  _hash text primary key, _coletado_em timestamptz default now()
)`);
await q(`create index if not exists ix_folha_govbr_mun on folha_servidores_govbr (cod_ibge, competencia)`);

// resolve o município → cod_ibge
let mun;
if (IBGE) mun = (await q(`select cod_ibge, nome, uf from municipios_br where left(cod_ibge::text,7)=$1 or cod_ibge::text=$1 limit 1`, [IBGE])).rows[0];
else if (MUN) mun = (await q(`select cod_ibge, nome, uf from municipios_br where lower(nome)=lower($1) ${UF ? "and uf=$2" : ""} limit 1`, UF ? [MUN, UF] : [MUN])).rows[0];
if (!mun) { console.error(`município não resolvido (MUN=${MUN} UF=${UF} IBGE=${IBGE})`); process.exit(1); }
console.log(`[govbr] município: ${mun.nome}/${mun.uf} (${mun.cod_ibge})`);

// dinheiro "R$ 1.912,89" → 1912.89
const money = (s) => {
  if (s == null) return null;
  const m = String(s).replace(/R\$|\s| /g, "").trim();
  if (!m) return null;
  const n = +m.replace(/\./g, "").replace(",", ".");
  return Number.isFinite(n) ? n : null;
};
const txt = (s) => { const v = (s == null ? "" : String(s)).trim(); return v || null; };

const raw = fs.readFileSync(ARQ, "latin1");
const blocos = raw.match(/<FolhaPagamento>[\s\S]*?<\/FolhaPagamento>/g) || [];
console.log(`[govbr] ${blocos.length} registros no XML`);
const campo = (b, tag) => { const m = b.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`)); return m ? m[1] : null; };

const regs = blocos.map((b) => {
  const lotacao = txt(campo(b, "Lotacao"));
  return {
    cod_ibge: mun.cod_ibge, municipio: mun.nome, uf: mun.uf,
    competencia: (txt(campo(b, "Competencia")) || "").replace("/", "").replace(/(\d{2})(\d{4})/, "$2$1"), // MM/AAAA→AAAAMM
    lotacao, secretaria: lotacao, cargo: txt(campo(b, "Cargo")), nome: txt(campo(b, "NomServidor")),
    salario_base: money(campo(b, "SalarioBase")), proventos: money(campo(b, "Proventos")),
    vantagens: money(campo(b, "Vantagens")), vencimentos_totais: money(campo(b, "VencimentosTotais")),
    descontos: money(campo(b, "Descontos")), liquido: money(campo(b, "Liquido")),
    _hash: crypto.createHash("md5").update([mun.cod_ibge, txt(campo(b, "Competencia")), txt(campo(b, "NomServidor")), txt(campo(b, "Cargo")), lotacao].join("¦")).digest("hex"),
  };
});

const LOTE = 1000;
const m = new Map(); for (const r of regs) m.set(r._hash, r);
const arr = [...m.values()];
for (let i = 0; i < arr.length; i += LOTE) {
  const p = arr.slice(i, i + LOTE);
  const c = (f) => p.map((x) => x[f]);
  await q(`insert into folha_servidores_govbr
    (cod_ibge,municipio,uf,competencia,lotacao,secretaria,cargo,nome,salario_base,proventos,vantagens,
     vencimentos_totais,descontos,liquido,_hash)
    select * from unnest($1::text[],$2::text[],$3::text[],$4::text[],$5::text[],$6::text[],$7::text[],$8::text[],
      $9::numeric[],$10::numeric[],$11::numeric[],$12::numeric[],$13::numeric[],$14::numeric[],$15::text[])
    on conflict (_hash) do update set liquido=excluded.liquido, _coletado_em=now()`,
    [c("cod_ibge"), c("municipio"), c("uf"), c("competencia"), c("lotacao"), c("secretaria"), c("cargo"),
     c("nome"), c("salario_base"), c("proventos"), c("vantagens"), c("vencimentos_totais"),
     c("descontos"), c("liquido"), c("_hash")]);
}
console.log(`[govbr] ${arr.length} servidores gravados para ${mun.nome}`);
await db.end();
