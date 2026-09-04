// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
// ingest_folha_camara_federal.mjs — subsídio (salário) dos 513 Deputados Federais em exercício.
//
// Espelho de ingest_folha_senado.mjs: por desenho constitucional o subsídio de Deputado Federal é FIXO e IGUAL
// para os 513 (mesmo valor do subsídio de Senador e de ministro do STF — teto do funcionalismo): hoje
// R$ 46.366,19. O que varia por pessoa é a identificação (nome, partido, UF), não o valor do subsídio.
//
// FONTE: Dados Abertos da Câmara (dadosabertos.camara.leg.br/api/v2/deputados) — lista dos deputados em exercício
// da legislatura atual. O valor do subsídio não tem CSV/API própria na Câmara (achado: nenhum recurso publica);
// é o MESMO subsídio do Congresso Nacional fixado pelo Decreto Legislativo que também vale para o Senado —
// conferido em www12.senado.leg.br/transparencia (ingest_folha_senado.mjs) e corroborado por múltiplas fontes
// jornalísticas independentes citando o mesmo valor e a mesma equivalência ao teto do STF.
//
// node scripts/ingest_folha_camara_federal.mjs
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
import crypto from "crypto";
import { pool, withRetry } from "./_cadprev.mjs";

const URL_LISTA = "https://dadosabertos.camara.leg.br/api/v2/deputados?ordem=ASC&ordenarPor=nome&itens=1000";
const SUBSIDIO = 46366.19; // igual ao de Senador — ver nota de fonte acima
const COMPETENCIA = "2026-04-30"; // mesma data-base usada na estrutura remuneratória do Senado

const db = pool();
const q = withRetry(db);

async function pega(url) {
  for (let t = 0; t < 4; t++) {
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(60000), headers: { Accept: "application/json" } });
      if (!r.ok) throw new Error("HTTP " + r.status);
      return await r.json();
    } catch (e) { if (t === 3) throw e; await new Promise((s) => setTimeout(s, 3000 * (t + 1))); }
  }
}

await q(`create table if not exists folha_camara_federal (
  id_deputado text, id_legislatura text, nome text, nome_civil text, sexo text, partido text, uf text,
  email text, situacao text, condicao_eleitoral text, url_foto text, cargo text, subsidio_mensal numeric,
  competencia date, fonte_lista text, _hash text primary key, _coletado_em timestamptz default now()
)`);
await q(`create index if not exists ix_folha_camara_uf on folha_camara_federal (uf)`);

const lista = (await pega(URL_LISTA)).dados;
console.log(`deputados em exercício: ${lista.length}`);

const regs = lista.map((d) => {
  const reg = {
    id_deputado: String(d.id), id_legislatura: String(d.idLegislatura), nome: d.nome, nome_civil: null,
    sexo: null, partido: d.siglaPartido, uf: d.siglaUf, email: d.email || null, situacao: null,
    condicao_eleitoral: null, url_foto: d.urlFoto || null, cargo: "Deputado Federal", subsidio_mensal: SUBSIDIO,
    competencia: COMPETENCIA, fonte_lista: URL_LISTA,
  };
  reg._hash = crypto.createHash("sha256").update(`${reg.id_deputado}|${COMPETENCIA}`).digest("hex");
  return reg;
});

const c = (f) => regs.map((x) => x[f]);
await q(`insert into folha_camara_federal
  (id_deputado,id_legislatura,nome,nome_civil,sexo,partido,uf,email,situacao,condicao_eleitoral,url_foto,cargo,
   subsidio_mensal,competencia,fonte_lista,_hash)
  select * from unnest($1::text[],$2::text[],$3::text[],$4::text[],$5::text[],$6::text[],$7::text[],$8::text[],
    $9::text[],$10::text[],$11::text[],$12::text[],$13::numeric[],$14::date[],$15::text[],$16::text[])
  on conflict (_hash) do update set subsidio_mensal = excluded.subsidio_mensal`,
  [c("id_deputado"), c("id_legislatura"), c("nome"), c("nome_civil"), c("sexo"), c("partido"), c("uf"), c("email"),
   c("situacao"), c("condicao_eleitoral"), c("url_foto"), c("cargo"), c("subsidio_mensal"), c("competencia"),
   c("fonte_lista"), c("_hash")]);

const { rows } = await q(`select count(*) n from folha_camara_federal where competencia = $1`, [COMPETENCIA]);
console.log(`gravados: ${rows[0].n}`);
await db.end();
