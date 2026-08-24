// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
// _uf.mjs — FONTE ÚNICA DA VERDADE DA UF (chave-mestra da nacionalização).
//
// POR QUÊ este arquivo existe: a plataforma nasceu em SC, mas o PNCP/SICONFI/DATASUS são NACIONAIS. Em vez de
// espalhar "SC" e "42" por 136 scripts (e ter que caçar cada um pra rodar SP), a sigla/código/nome da UF vivem
// AQUI, dirigidos por env. Rodar outro estado = `UF=SP node scripts/<qualquer>.mjs`. Um lugar, não 136.
//
// HISTÓRICO: foi apagado no `rm _*.mjs` (sessão de jul) e reconstruído aqui — 10 ingests que o importam
// (ingest_processos_sc, ingest_fns_sc, ingest_cadprev, ingest_cauc_sc…) dependem dele.
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════

// A UF alvo vem do ambiente. Default SC (o estado já 100% coletado). .toUpperCase() para aceitar "sp"/"SP".
// POR QUÊ default e não obrigatório: manter o comportamento atual (SC) intacto em todos os scripts sem env.
const UF = (process.env.UF || "SC").toUpperCase();

// Mapa oficial das 27 UFs (código IBGE de 2 dígitos + nome). O código de 2 dígitos é o MESMO prefixo dos 7 dígitos
// do município (ex.: 42 = SC → 4205407 Florianópolis) — por isso serve para bucketizar o Estado (esfera E) e para
// validar/roteirizar qualquer cod_ibge. Fonte: tabela de UFs do IBGE (estável, não muda).
const MAPA = {
  RO: { cod: "11", nome: "Rondônia" },        AC: { cod: "12", nome: "Acre" },
  AM: { cod: "13", nome: "Amazonas" },        RR: { cod: "14", nome: "Roraima" },
  PA: { cod: "15", nome: "Pará" },            AP: { cod: "16", nome: "Amapá" },
  TO: { cod: "17", nome: "Tocantins" },       MA: { cod: "21", nome: "Maranhão" },
  PI: { cod: "22", nome: "Piauí" },           CE: { cod: "23", nome: "Ceará" },
  RN: { cod: "24", nome: "Rio Grande do Norte" }, PB: { cod: "25", nome: "Paraíba" },
  PE: { cod: "26", nome: "Pernambuco" },      AL: { cod: "27", nome: "Alagoas" },
  SE: { cod: "28", nome: "Sergipe" },         BA: { cod: "29", nome: "Bahia" },
  MG: { cod: "31", nome: "Minas Gerais" },    ES: { cod: "32", nome: "Espírito Santo" },
  RJ: { cod: "33", nome: "Rio de Janeiro" },  SP: { cod: "35", nome: "São Paulo" },
  PR: { cod: "41", nome: "Paraná" },          SC: { cod: "42", nome: "Santa Catarina" },
  RS: { cod: "43", nome: "Rio Grande do Sul" }, MS: { cod: "50", nome: "Mato Grosso do Sul" },
  MT: { cod: "51", nome: "Mato Grosso" },     GO: { cod: "52", nome: "Goiás" },
  DF: { cod: "53", nome: "Distrito Federal" },
};

// CHECAGEM: uma sigla inválida (typo no env) tem que FALHAR AGORA, com mensagem clara — não silenciosamente coletar
// o estado errado. POR QUÊ: sem isto, `UF=SP1` cairia no default ou geraria código undefined e contaminaria a base.
if (!MAPA[UF]) throw new Error(`_uf.mjs: UF inválida "${UF}". Use uma das 27 siglas (ex.: SC, SP, RS).`);

export const SG_UF = UF;               // sigla, ex.: "SC" — vai no filtro das APIs (?uf=SC)
export const COD_ESTADO = MAPA[UF].cod; // código IBGE de 2 dígitos, ex.: "42" — bucket do Estado (esfera E)
export const COD_UF = MAPA[UF].cod;     // alias explícito (mesmo valor de COD_ESTADO)
export const NOME_ESTADO = MAPA[UF].nome; // nome por extenso, ex.: "Santa Catarina" — rótulos/telas
export const UFS = MAPA;               // o mapa inteiro, para quem precisar iterar o Brasil (nacional)

// Helper: dado um cod_ibge de 7 dígitos, a UF é o prefixo de 2 dígitos. POR QUÊ: validar que um município pertence
// à UF que estamos coletando (guarda contra o vazamento de ente de outra UF na base — ver feedback-estado-municipio).
export const ufDoIbge = (codIbge) => {
  const pref = String(codIbge || "").slice(0, 2);
  const ent = Object.entries(MAPA).find(([, v]) => v.cod === pref);
  return ent ? ent[0] : null;
};
