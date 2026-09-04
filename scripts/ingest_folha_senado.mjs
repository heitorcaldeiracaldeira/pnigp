// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
// ingest_folha_senado.mjs — subsídio (salário) dos 81 Senadores da República em exercício.
//
// O QUE ENTREGA: um registro por parlamentar em exercício (titular ou suplente que assumiu a cadeira) com o
// SUBSÍDIO MENSAL fixo do cargo "Senador da República". Diferente da folha municipal, aqui não há variação
// individual de valor: por desenho constitucional (art. 39, §4º da CF) todo senador recebe o MESMO subsídio —
// hoje R$ 46.366,19 (o mesmo valor do subsídio de ministro do STF, teto do funcionalismo). O que varia por pessoa
// é só a identificação (nome, partido, UF, mandato), não o valor.
//
// FONTES (2, cada uma cobre uma coisa que a outra não tem):
//  1) Dados Abertos do Senado (legis.senado.leg.br) — lista dos parlamentares em exercício, com nome, partido, UF,
//     mandato, suplência. NÃO tem valor de subsídio.
//  2) Estrutura Remuneratória dos Parlamentares (www12.senado.leg.br/transparencia/rh/segp) — CSV oficial com o
//     valor do subsídio por cargo. NÃO tem lista de pessoas (é só "SENADOR DA REPÚBLICA; 46.366,19").
// node scripts/ingest_folha_senado.mjs
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
import crypto from "crypto";
import { pool, withRetry } from "./_cadprev.mjs";

const URL_LISTA = "https://legis.senado.leg.br/dadosabertos/senador/lista/atual";
const URL_SUBSIDIO = "https://www12.senado.leg.br/transparencia/rh/segp/arquivos/estrutura-remuneratoria-dos-parlamentares/04-remuneracao-senadores-_lista_anexo_ii_tab_2_30042026_gerado21052026.csv";

const db = pool();
const q = withRetry(db);

async function pega(url, opts = {}) {
  for (let t = 0; t < 4; t++) {
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(60000), ...opts });
      if (!r.ok) throw new Error("HTTP " + r.status);
      return r;
    } catch (e) { if (t === 3) throw e; await new Promise((s) => setTimeout(s, 3000 * (t + 1))); }
  }
}

// o CSV vem em ISO-8859-1 com ";" — "SENADOR DA REPÚBLICA; 46.366,19"
async function pegaSubsidio() {
  const r = await pega(URL_SUBSIDIO);
  const txt = new TextDecoder("iso-8859-1").decode(await r.arrayBuffer());
  const linhas = txt.trim().split(/\r?\n/);
  const [, valorLinha] = linhas[1].split(";");
  const valor = Number(valorLinha.trim().replace(/\./g, "").replace(",", "."));
  if (!Number.isFinite(valor) || valor <= 0) throw new Error(`subsídio não parseou: "${linhas[1]}"`);
  return valor;
}

async function pegaSenadores() {
  const r = await pega(URL_LISTA, { headers: { Accept: "application/json" } });
  const j = await r.json();
  return j.ListaParlamentarEmExercicio.Parlamentares.Parlamentar;
}

await q(`create table if not exists folha_senado_federal (
  codigo_parlamentar text, codigo_publico_leg_atual text, nome_parlamentar text, nome_completo text,
  sexo text, forma_tratamento text, partido text, uf text, email text, membro_mesa text, membro_lideranca text,
  bloco_nome text, codigo_mandato text, participacao text, legislatura_inicio date, legislatura_fim date,
  cargo text, subsidio_mensal numeric, competencia date, fonte_lista text, fonte_subsidio text,
  _hash text primary key, _coletado_em timestamptz default now()
)`);
await q(`create index if not exists ix_folha_senado_uf on folha_senado_federal (uf)`);

const subsidio = await pegaSubsidio();
console.log(`subsídio oficial do cargo Senador da República: R$ ${subsidio.toFixed(2)}`);

const senadores = await pegaSenadores();
console.log(`senadores em exercício: ${senadores.length}`);

const COMPETENCIA = "2026-04-30"; // data-base da tabela de estrutura remuneratória (nome do arquivo: 30042026)

const regs = senadores.map((p) => {
  const ip = p.IdentificacaoParlamentar;
  const m = p.Mandato;
  const reg = {
    codigo_parlamentar: ip.CodigoParlamentar,
    codigo_publico_leg_atual: ip.CodigoPublicoNaLegAtual || null,
    nome_parlamentar: ip.NomeParlamentar,
    nome_completo: ip.NomeCompletoParlamentar,
    sexo: ip.SexoParlamentar || null,
    forma_tratamento: (ip.FormaTratamento || "").trim() || null,
    partido: ip.SiglaPartidoParlamentar || null,
    uf: ip.UfParlamentar,
    email: ip.EmailParlamentar || null,
    membro_mesa: ip.MembroMesa || null,
    membro_lideranca: ip.MembroLideranca || null,
    bloco_nome: ip.Bloco?.NomeBloco || null,
    codigo_mandato: m?.CodigoMandato || null,
    participacao: m?.DescricaoParticipacao || null,
    legislatura_inicio: m?.PrimeiraLegislaturaDoMandato?.DataInicio || null,
    legislatura_fim: m?.SegundaLegislaturaDoMandato?.DataFim || m?.PrimeiraLegislaturaDoMandato?.DataFim || null,
    cargo: "Senador da República",
    subsidio_mensal: subsidio,
    competencia: COMPETENCIA,
    fonte_lista: URL_LISTA,
    fonte_subsidio: URL_SUBSIDIO,
  };
  reg._hash = crypto.createHash("sha256").update(`${reg.codigo_parlamentar}|${reg.codigo_mandato}|${COMPETENCIA}`).digest("hex");
  return reg;
});

const c = (f) => regs.map((x) => x[f]);
await q(`insert into folha_senado_federal
  (codigo_parlamentar,codigo_publico_leg_atual,nome_parlamentar,nome_completo,sexo,forma_tratamento,partido,uf,
   email,membro_mesa,membro_lideranca,bloco_nome,codigo_mandato,participacao,legislatura_inicio,legislatura_fim,
   cargo,subsidio_mensal,competencia,fonte_lista,fonte_subsidio,_hash)
  select * from unnest($1::text[],$2::text[],$3::text[],$4::text[],$5::text[],$6::text[],$7::text[],$8::text[],
    $9::text[],$10::text[],$11::text[],$12::text[],$13::text[],$14::text[],$15::date[],$16::date[],$17::text[],
    $18::numeric[],$19::date[],$20::text[],$21::text[],$22::text[])
  on conflict (_hash) do update set subsidio_mensal = excluded.subsidio_mensal`,
  [c("codigo_parlamentar"), c("codigo_publico_leg_atual"), c("nome_parlamentar"), c("nome_completo"), c("sexo"),
   c("forma_tratamento"), c("partido"), c("uf"), c("email"), c("membro_mesa"), c("membro_lideranca"),
   c("bloco_nome"), c("codigo_mandato"), c("participacao"), c("legislatura_inicio"), c("legislatura_fim"),
   c("cargo"), c("subsidio_mensal"), c("competencia"), c("fonte_lista"), c("fonte_subsidio"), c("_hash")]);

const { rows } = await q(`select count(*) n, min(subsidio_mensal) mn, max(subsidio_mensal) mx from folha_senado_federal where competencia = $1`, [COMPETENCIA]);
console.log(`gravados: ${rows[0].n} · subsídio min/max: ${rows[0].mn} / ${rows[0].mx}`);
await db.end();
