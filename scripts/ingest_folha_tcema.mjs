// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
// ingest_folha_tcema.mjs — folha dos 217 municípios do MARANHÃO (TCE-MA).
//
// ⚠️ LIMITE DA FONTE, medido em 12/ago/2026: o sistema NOVO (`/sincfolha/{2023,2024}/...`) responde HTTP 500 —
// "Erro ao se comunicar com sinc-folha-2024 … Connection refused" — é o backend interno do tribunal que está fora,
// não a nossa chamada. O que responde é o sistema ANTIGO (`/saapfolha/servidor`), cuja última competência com
// dado é 2021-12. Por isso a camada MA é de 2021 e está declarada como tal; quando o sinc voltar, o mesmo
// script coleta o ano recente trocando ROTA.
//
// ENTREGA: Município (nomeEnte/cnpj) · Unidade (nomeUnidade) · Cargo (nomeCargo + CBO) · Função (naturezaCargo,
// regime, categoriaSituacaoCargo) · Salário (valorBruto/valorLiquido). NÃO tem nome — o CPF vem mascarado.
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
import crypto from "crypto";
import { pool, withRetry } from "./_cadprev.mjs";

const BASE = "https://app.tcema.tc.br/tce/api";
const ANO = Number(process.env.ANO || 2021);
const MESES = (process.env.MESES || "6").split(",").map(Number);
const TAM = 5000;

const db = pool();
const q = withRetry(db);

await q(`create table if not exists folha_servidores_ma (
  ano int, mes int, cnpj text, ente_id text, ente text, unidade text, poder text,
  matricula text, cpf_masc text, regime text, cargo text, cargo_cod text, cbo text,
  natureza_cargo text, categoria_situacao text, carga_horaria text, tipo_folha text,
  data_exercicio text, data_aposentadoria text, data_exclusao text,
  valor_bruto numeric, valor_liquido numeric,
  _hash text primary key, _coletado_em timestamptz default now()
)`);
await q(`create index if not exists ix_folha_ma_ente on folha_servidores_ma (ente, ano, mes)`);

async function pega(pagina, mes) {
  const url = `${BASE}/saapfolha/servidor?ano=${ANO}&mes=${mes}&page=${pagina}&size=${TAM}`;
  for (let t = 0; t < 4; t++) {
    try {
      const r = await fetch(url, { headers: { accept: "application/json" }, signal: AbortSignal.timeout(300000) });
      if (!r.ok) throw new Error("HTTP " + r.status);
      return await r.json();
    } catch (e) { if (t === 3) throw e; await new Promise((s) => setTimeout(s, 5000 * (t + 1))); }
  }
}

const num = (v) => (v == null || v === "null" || v === "" ? null : Number(v));

const LOTE = 1000;
async function grava(regs) {
  for (let i = 0; i < regs.length; i += LOTE) {
    const p = regs.slice(i, i + LOTE);
    const c = (f) => p.map((x) => x[f]);
    await q(`insert into folha_servidores_ma
      (ano,mes,cnpj,ente_id,ente,unidade,poder,matricula,cpf_masc,regime,cargo,cargo_cod,cbo,natureza_cargo,
       categoria_situacao,carga_horaria,tipo_folha,data_exercicio,data_aposentadoria,data_exclusao,
       valor_bruto,valor_liquido,_hash)
      select * from unnest($1::int[],$2::int[],$3::text[],$4::text[],$5::text[],$6::text[],$7::text[],$8::text[],
        $9::text[],$10::text[],$11::text[],$12::text[],$13::text[],$14::text[],$15::text[],$16::text[],$17::text[],
        $18::text[],$19::text[],$20::text[],$21::numeric[],$22::numeric[],$23::text[])
      on conflict (_hash) do nothing`,
      [c("ano"), c("mes"), c("cnpj"), c("ente_id"), c("ente"), c("unidade"), c("poder"), c("matricula"),
       c("cpf_masc"), c("regime"), c("cargo"), c("cargo_cod"), c("cbo"), c("natureza_cargo"),
       c("categoria_situacao"), c("carga_horaria"), c("tipo_folha"), c("data_exercicio"),
       c("data_aposentadoria"), c("data_exclusao"), c("valor_bruto"), c("valor_liquido"), c("_hash")]);
  }
}

for (const mes of MESES) {
  const p0 = await pega(0, mes);
  const total = p0.totalElements || 0;
  const paginas = Math.ceil(total / TAM);
  console.log(`[MA ${ANO}-${String(mes).padStart(2, "0")}] ${total.toLocaleString("pt-BR")} registros · ${paginas} páginas`);
  let gravadas = 0;
  for (let pg = 0; pg < paginas; pg++) {
    const j = pg === 0 ? p0 : await pega(pg, mes);
    const regs = (j.content || []).map((s) => ({
      ano: ANO, mes, cnpj: s.cnpj, ente_id: s.enteId, ente: s.nomeEnte, unidade: s.nomeUnidade, poder: s.poder,
      matricula: s.matricula, cpf_masc: s.cpf, regime: s.regime, cargo: s.nomeCargo, cargo_cod: s.codigoCargo,
      cbo: s.cboCargo, natureza_cargo: s.naturezaCargo, categoria_situacao: s.categoriaSituacaoCargo,
      carga_horaria: s.cargaHoraria, tipo_folha: s.tipoFolha, data_exercicio: s.dataExercicio,
      data_aposentadoria: s.dataAposentadoria, data_exclusao: s.dataExclusao,
      valor_bruto: num(s.valorBruto), valor_liquido: num(s.valorLiquido),
      _hash: crypto.createHash("md5").update([ANO, mes, s.cnpj, s.matricula, s.codigoCargo, s.tipoFolha, s.cpf, s.valorBruto, s.nomeUnidade].join("¦")).digest("hex"),
    }));
    await grava(regs);
    gravadas += regs.length;
    if (pg % 10 === 0) process.stdout.write(`   página ${pg}/${paginas} · ${gravadas.toLocaleString("pt-BR")}\r`);
  }
  console.log(`\n[MA ${ANO}-${String(mes).padStart(2, "0")}] ${gravadas.toLocaleString("pt-BR")} gravadas`);
}
await db.end();
