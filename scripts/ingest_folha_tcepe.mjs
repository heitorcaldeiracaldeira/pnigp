// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
// ingest_folha_tcepe.mjs — quadro de pessoal dos 184 municípios de PERNAMBUCO (TCE-PE, Dados Abertos).
//
// O QUE ENTREGA: Município (pela unidade jurisdicionada) · Órgão/secretaria (NomeUJ) · Cargo · Função (tipo de
// vínculo: efetivo, comissionado, temporário) · NOME do servidor. NÃO entrega salário — o recurso ListaServidores
// não tem remuneração e nenhum outro recurso do TCE-PE publica valor de folha (medido: 72 recursos do catálogo).
//
// COMO PAGINA: não pagina. `!json` devolve no máximo 100.000 linhas por chamada e não aceita page/size, então a
// varredura é POR UNIDADE JURISDICIONADA (690 municipais em 2025) — cada uma cabe folgado no limite.
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
import crypto from "crypto";
import { pool, withRetry } from "./_cadprev.mjs";

const BASE = "https://sistemas.tcepe.tc.br/DadosAbertos";
const EXERCICIO = process.env.EXERCICIO || "2025";
const db = pool();
const q = withRetry(db);

// o payload vem em ISO-8859-1 e o servidor não declara — decodificar na mão, senão vira mojibake
async function pega(entidade, params = {}) {
  const url = `${BASE}/${entidade}!json` + (Object.keys(params).length ? "?" + new URLSearchParams(params) : "");
  for (let t = 0; t < 4; t++) {
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(180000) });
      if (!r.ok) throw new Error("HTTP " + r.status);
      const txt = new TextDecoder("iso-8859-1").decode(await r.arrayBuffer());
      return JSON.parse(txt).resposta?.conteudo || [];
    } catch (e) { if (t === 3) throw e; await new Promise((s) => setTimeout(s, 3000 * (t + 1))); }
  }
}

await q(`create table if not exists folha_servidores_pe (
  exercicio text, uj_codigo text, uj_nome text, municipio_cod text, municipio text, natureza_orgao text,
  nome text, cpf_masc text, matricula text, cargo_cod text, cargo text, tipo_vinculo text, carga_horaria text,
  data_ingresso text, data_admissao text, data_afastamento text, ano_remessa text, mes_remessa text,
  _hash text primary key, _coletado_em timestamptz default now()
)`);
await q(`create index if not exists ix_folha_pe_mun on folha_servidores_pe (municipio_cod)`);

// 1) de-para município → código IBGE (o cadastro do TCE usa código próprio; o IBGE é o que casa com o resto da base)
const muns = await pega("Municipios");
const ibgePorCodigo = new Map(muns.map((m) => [String(m.CODIGO), String(m.CODIGOIBGE)]));
console.log(`municípios no cadastro: ${muns.length}`);

// 2) O cadastro geral de UJ já traz esfera, município, órgão, poder e o CODIGOTCE — que é a chave da
//    ListaServidores. UnidadesJurisdicionadasMunicipais não serve: o nome não bate para fazer o join.
const todas = await pega("UnidadesJurisdicionadas");
const ujs = todas.filter((u) => /municip/i.test(String(u.ESFERA || "")));
console.log(`UJs no cadastro: ${todas.length} · municipais: ${ujs.length}`);

const LOTE = 1000;
async function grava(regs) {
  for (let i = 0; i < regs.length; i += LOTE) {
    const p = regs.slice(i, i + LOTE);
    const c = (f) => p.map((x) => x[f]);
    await q(`insert into folha_servidores_pe
      (exercicio,uj_codigo,uj_nome,municipio_cod,municipio,natureza_orgao,nome,cpf_masc,matricula,cargo_cod,cargo,
       tipo_vinculo,carga_horaria,data_ingresso,data_admissao,data_afastamento,ano_remessa,mes_remessa,_hash)
      select * from unnest($1::text[],$2::text[],$3::text[],$4::text[],$5::text[],$6::text[],$7::text[],$8::text[],
        $9::text[],$10::text[],$11::text[],$12::text[],$13::text[],$14::text[],$15::text[],$16::text[],$17::text[],
        $18::text[],$19::text[])
      on conflict (_hash) do nothing`,
      [c("exercicio"), c("uj_codigo"), c("uj_nome"), c("municipio_cod"), c("municipio"), c("natureza_orgao"),
       c("nome"), c("cpf_masc"), c("matricula"), c("cargo_cod"), c("cargo"), c("tipo_vinculo"), c("carga_horaria"),
       c("data_ingresso"), c("data_admissao"), c("data_afastamento"), c("ano_remessa"), c("mes_remessa"), c("_hash")]);
  }
}

// ⚠️ O parâmetro que funciona é NomeUJ, NÃO UnidadeJurisdicionadaTCE: o `CODIGOTCE` do cadastro tem 6 dígitos
// ("001001") e o campo homônimo do payload guarda outra coisa (o id da UG dentro do ente, "1"), então filtrar por
// ele devolve zero — foi assim que a primeira varredura trouxe 0 em todas as unidades. E NomeUJ casa por CONTÉM:
// "Prefeitura" devolve 100 mil linhas de todo o estado, por isso o resultado ainda é conferido nome a nome aqui.
// retomada: as UJs já gravadas são puladas — a coleta é longa (1.496 chamadas) e precisa sobreviver a uma parada
const jaFeitas = new Set((await q(`select distinct uj_codigo from folha_servidores_pe`)).rows.map((r) => r.uj_codigo));
console.log(`UJs já gravadas: ${jaFeitas.size}`);

let total = 0, semCodigo = 0;
for (let i = 0; i < ujs.length; i++) {
  const uj = ujs[i];
  const codigo = uj.CODIGOTCE;
  if (!codigo) { semCodigo++; continue; }
  if (jaFeitas.has(String(codigo))) continue;

  let servidores;
  try { servidores = await pega("ListaServidores", { NomeUJ: uj.ORGAO }); }
  catch (e) { console.log(`  ✖ ${uj.ORGAO}: ${e.message}`); continue; }
  servidores = servidores.filter((s) => String(s.NomeUJ).trim() === String(uj.ORGAO).trim());

  const regs = servidores.map((s) => ({
    exercicio: EXERCICIO, uj_codigo: String(codigo), uj_nome: s.NomeUJ || uj.ORGAO,
    municipio_cod: ibgePorCodigo.get(String(uj.CODIGOMUNICIPIO)) || uj.CODIGOMUNICIPIO, municipio: uj.MUNICIPIO,
    natureza_orgao: uj.NATUREZA || uj.PODER, nome: s.NomeServidor, cpf_masc: s.CPFServidor, matricula: s.Matricula,
    cargo_cod: s.CodigoCargo, cargo: s.NomeCargo, tipo_vinculo: s.NomeTipoVinculo, carga_horaria: s.CargaHoraria,
    data_ingresso: s.DataIngresso, data_admissao: s.DataAdmissao, data_afastamento: s.DataAfastamento,
    ano_remessa: s.AnoRemessa, mes_remessa: s.MesRemessa,
    _hash: crypto.createHash("md5").update([codigo, s.Matricula, s.CodigoCargo, s.DataIngresso, s.AnoRemessa, s.MesRemessa, s.HashCPFPessoa].join("¦")).digest("hex"),
  }));
  await grava(regs);
  total += regs.length;
  if (i % 25 === 0 || regs.length > 3000) console.log(`  [${i + 1}/${ujs.length}] ${uj.ORGAO}: ${regs.length} · acumulado ${total.toLocaleString("pt-BR")}`);
}
console.log(`\nTCE-PE: ${total.toLocaleString("pt-BR")} vínculos · ${semCodigo} UJs sem código no cadastro geral`);
await db.end();
