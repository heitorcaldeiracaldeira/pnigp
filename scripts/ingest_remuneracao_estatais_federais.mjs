// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
// ingest_remuneracao_estatais_federais.mjs — salário (honorário) dos dirigentes das 77 empresas estatais federais.
//
// FONTE: "Remuneração de Administradores" (gov.br/gestao/estatais/transparencia) — 77 PDFs oficiais, um por
// empresa, aprovados pela Sest para instrução do voto do acionista controlador em Assembleia Geral. Período-base
// abril/2022 a março/2023 — é a edição mais recente publicada de forma centralizada e individualizada por cargo
// (não achei edição mais nova consolidada; cada empresa pode ter dado mais novo espalhado no seu próprio site,
// fora do escopo desta coleta).
//
// POR QUÊ é por CARGO e não por PESSOA: diferente da folha de servidor público, aqui a própria fonte agrega por
// tipo de cargo (Presidente, Vice-Presidente, Diretor, Membros de conselho/comitê) — não nomeia os indivíduos.
//
// POR QUÊ só rubricas "Honorário*": a tabela completa tem ~9 rubricas por cargo (benefícios: 13º, auxílio-moradia,
// plano de saúde, quarentena, RVA...) — isolei o "Honorário" (a peça que corresponde a SALÁRIO) porque é a única
// família de rubrica que nunca quebra em bloco multi-rubrica ambíguo entre páginas do PDF (ver nota no extrator
// python). Rodar o parser: python scripts/_extrai_remuneracao_estatais.py <links.json> <dir_pdfs> <saida.json>
//
// node scripts/ingest_remuneracao_estatais_federais.mjs <caminho_do_json_gerado_pelo_extrator>
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
import fs from "fs";
import crypto from "crypto";
import { pool, withRetry } from "./_cadprev.mjs";

const JSON_PATH = process.argv[2];
if (!JSON_PATH) throw new Error("uso: node ingest_remuneracao_estatais_federais.mjs <caminho.json>");
const { honorarios, totais } = JSON.parse(fs.readFileSync(JSON_PATH, "utf8"));

const db = pool();
const q = withRetry(db);

await q(`create table if not exists remuneracao_dirigentes_estatais_federais (
  empresa_sigla text, empresa_nome text, rubrica text, tipo_cargo text, qtde_cargos numeric,
  valor_um_mes numeric, num_pagamentos numeric, subtotal_por_cargo numeric, total_geral_tipo_cargo numeric,
  periodo_referencia text, fonte text, _hash text primary key, _coletado_em timestamptz default now()
)`);
await q(`create index if not exists ix_remun_estatais_empresa on remuneracao_dirigentes_estatais_federais (empresa_sigla)`);

await q(`create table if not exists remuneracao_dirigentes_estatais_federais_totais (
  empresa_sigla text, empresa_nome text, ordem text, categoria text, valor_total numeric,
  periodo_referencia text, _hash text primary key, _coletado_em timestamptz default now()
)`);

const PERIODO = "abril/2022 a março/2023";

const regsH = honorarios.map((h) => {
  const hash = crypto.createHash("sha256")
    .update(`${h.empresa_sigla}|${h.rubrica}|${h.tipo_cargo}|${PERIODO}`).digest("hex");
  return { ...h, _hash: hash, periodo_referencia: PERIODO };
});

const CAMPOS_H = ["empresa_sigla","empresa_nome","rubrica","tipo_cargo","qtde_cargos","valor_um_mes",
  "num_pagamentos","subtotal_por_cargo","total_geral_tipo_cargo","periodo_referencia","fonte","_hash"];
const TIPOS_H = ["text","text","text","text","numeric","numeric","numeric","numeric","numeric","text","text","text"];
{
  const c = (f) => regsH.map((x) => x[f]);
  const placeholders = CAMPOS_H.map((_, j) => `$${j + 1}::${TIPOS_H[j]}[]`).join(",");
  await q(`insert into remuneracao_dirigentes_estatais_federais (${CAMPOS_H.join(",")})
    select * from unnest(${placeholders}) on conflict (_hash) do nothing`, CAMPOS_H.map((f) => c(f)));
}

const regsT = totais.map((t) => ({
  ...t, periodo_referencia: PERIODO,
  _hash: crypto.createHash("sha256").update(`${t.empresa_sigla}|${t.ordem}|${t.categoria}|${PERIODO}`).digest("hex"),
}));
const CAMPOS_T = ["empresa_sigla","empresa_nome","ordem","categoria","valor_total","periodo_referencia","_hash"];
const TIPOS_T = ["text","text","text","text","numeric","text","text"];
{
  const c = (f) => regsT.map((x) => x[f]);
  const placeholders = CAMPOS_T.map((_, j) => `$${j + 1}::${TIPOS_T[j]}[]`).join(",");
  await q(`insert into remuneracao_dirigentes_estatais_federais_totais (${CAMPOS_T.join(",")})
    select * from unnest(${placeholders}) on conflict (_hash) do nothing`, CAMPOS_T.map((f) => c(f)));
}

console.log(`gravados: ${regsH.length} linhas de honorário, ${regsT.length} totais`);

const { rows } = await q(`
  select empresa_sigla, tipo_cargo, valor_um_mes
  from remuneracao_dirigentes_estatais_federais
  where rubrica = 'Honorário Fixo' and tipo_cargo = 'Presidente'
  order by valor_um_mes desc limit 8`);
console.table(rows);
await db.end();
