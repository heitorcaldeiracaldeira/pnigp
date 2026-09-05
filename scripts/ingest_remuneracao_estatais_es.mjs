// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
// ingest_remuneracao_estatais_es.mjs — Espírito Santo.
//
// BANESTES é companhia aberta (B3) — mesmo pipeline CVM usado em CEMIG/Banrisul/CELESC/Sanepar/SANEAGO/BANESTES.
// Diretor Presidente / Superintendente: Carlos Artur Hauschild (posse 28/01/2019, mandato até AGO 2028), achado
// no próprio arquivo de administradores da CVM (fre_cia_aberta_administrador_membro_conselho_fiscal_2026.csv).
//
// CESAN e BANDES: um agente de pesquisa em segundo plano já tinha coberto essas duas (mesma situação vista no
// Amazonas — o agente contornou o esgotamento do orçamento de WebSearch com WebFetch direto e JÁ GRAVOU no banco,
// na tabela remuneracao_dirigentes_estatais_es_individual, antes mesmo de eu terminar minha própria pesquisa).
// CONFERI o conteúdo (lei do projeto: checar antes de lançar): CESAN — Munir Abud de Oliveira, Diretor
// Presidente, valor pendente (portal de transparência da CESAN em manutenção/503 nas tentativas); BANDES —
// Marcelo Barbosa Saintive, Diretor Presidente, valor pendente (instabilidade de conexão no site institucional).
// Meu próprio achado de CESAN (via cesan.com.br/munir-abud-toma-posse-...) bate com o nome já gravado — não
// reinsiro para não duplicar a linha.
//
// CODESA (Companhia Docas do Espírito Santo) NÃO é estatal estadual — é autoridade portuária federal vinculada
// ao Ministério dos Portos — excluída desta lista.
//
// node scripts/ingest_remuneracao_estatais_es.mjs
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
import crypto from "crypto";
import { pool, withRetry } from "./_cadprev.mjs";

const db = pool();
const q = withRetry(db);

const FONTE_CVM = "dados.cvm.gov.br/dataset/cia_aberta-doc-fre (fre_cia_aberta_2026.zip)";
const EXERCICIO = "2025-01-01 a 2025-12-31";

await q(`create table if not exists remuneracao_dirigentes_estatais_estaduais (
  uf text, empresa_sigla text, empresa_nome text, orgao_administracao text, numero_membros numeric,
  numero_membros_remunerados numeric, valor_maximo_anual numeric, valor_minimo_anual numeric,
  valor_medio_anual numeric, ceo_nome text, ceo_cargo text, exercicio_referencia text, granularidade text,
  fonte text, _hash text primary key, _coletado_em timestamptz default now()
)`);

const CVM_REGS = [
  { uf: "ES", sigla: "BANESTES", nome_empresa: "Banestes S.A. - Banco do Estado do Espírito Santo", orgao: "Conselho de Administração",
    numero_membros: 9, numero_membros_remunerados: 9, valor_maximo_anual: 135392.92, valor_minimo_anual: 135392.92,
    valor_medio_anual: 135392.92, ceo_nome: null, ceo_cargo: null },
  { uf: "ES", sigla: "BANESTES", nome_empresa: "Banestes S.A. - Banco do Estado do Espírito Santo", orgao: "Diretoria Estatutária",
    numero_membros: 8, numero_membros_remunerados: 8, valor_maximo_anual: 451309.79, valor_minimo_anual: 235809.80,
    valor_medio_anual: 424372.27, ceo_nome: "Carlos Artur Hauschild", ceo_cargo: "Diretor Presidente / Superintendente (posse 28/01/2019, mandato até AGO 2028)" },
  { uf: "ES", sigla: "BANESTES", nome_empresa: "Banestes S.A. - Banco do Estado do Espírito Santo", orgao: "Conselho Fiscal",
    numero_membros: 5, numero_membros_remunerados: 5, valor_maximo_anual: 67696.40, valor_minimo_anual: 67696.40,
    valor_medio_anual: 67696.40, ceo_nome: null, ceo_cargo: null },
];

for (const r of CVM_REGS) {
  const hash = crypto.createHash("sha256").update(`${r.uf}|${r.sigla}|${r.orgao}|${EXERCICIO}`).digest("hex");
  await q(`insert into remuneracao_dirigentes_estatais_estaduais
    (uf,empresa_sigla,empresa_nome,orgao_administracao,numero_membros,numero_membros_remunerados,
     valor_maximo_anual,valor_minimo_anual,valor_medio_anual,ceo_nome,ceo_cargo,exercicio_referencia,
     granularidade,fonte,_hash)
    values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'agregado_cvm_por_orgao',$13,$14)
    on conflict (_hash) do update set valor_medio_anual=excluded.valor_medio_anual`,
    [r.uf, r.sigla, r.nome_empresa, r.orgao, r.numero_membros, r.numero_membros_remunerados,
     r.valor_maximo_anual, r.valor_minimo_anual, r.valor_medio_anual, r.ceo_nome, r.ceo_cargo, EXERCICIO, FONTE_CVM, hash]);
}

// CESAN e BANDES já estão em remuneracao_dirigentes_estatais_es_individual (gravados por outro processo desta
// mesma rodada) — não reinserir aqui para não duplicar a linha.

console.log("=== Espírito Santo — CVM (BANESTES) ===");
console.table((await q(`select empresa_sigla, orgao_administracao, ceo_nome, round(valor_medio_anual/12,2) media_mensal from remuneracao_dirigentes_estatais_estaduais where uf='ES' order by orgao_administracao`)).rows);
console.log("=== Espírito Santo — individual (CESAN) ===");
console.table((await q(`select empresa_sigla, nome, valor, observacao from remuneracao_dirigentes_estatais_es_individual`)).rows);
await db.end();
