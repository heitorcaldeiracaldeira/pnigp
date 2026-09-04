// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
// ingest_remuneracao_estatais_casan_bdmg_badesul.mjs — destrava as 3 pendências pedidas: CASAN (SC), BDMG (MG),
// Badesul (RS).
//
// CASAN: ao contrário do que a rodada anterior concluiu, ELA TEM Formulário de Referência na CVM — é registrada
// como companhia aberta (categoria B, por emissão de dívida) mesmo sem ação negociada em bolsa. Mesmo dataset dos
// outros (fre_cia_aberta_2026.zip). Achado um problema no PRÓPRIO arquivo da CVM: os dois formatos de disclosure
// (o "legado" maxima_minima_media e o "novo" remuneracao_total_orgao) trazem números incompatíveis pro mesmo
// órgão/ano/documento — a Diretoria Estatutária aparece com máximo anual de R$46.744,63 num arquivo e média de
// R$308.880,28 (calculada de total/membros) no outro, uma discrepância grande demais pra ser normal. Usei o
// total_orgao (mesma metodologia já usada pra Banrisul/CELESC) por ser mais consistente com o resto dos dados;
// registrei a divergência em vez de escolher calada.
//
// BDMG: achei em bdmg.mg.gov.br/transparencia-governanca/ um PDF próprio "Estimativa de Custos Alta
// Administração 2025" — é ESTIMATIVA (não realizado), mas é o único documento de remuneração que a BDMG publica.
//
// Badesul: página institucional lista os valores por cargo (Honorário + Verba de Representação, valores fixos
// tabelados por cargo — não por pessoa/mês real).
//
// node scripts/ingest_remuneracao_estatais_casan_bdmg_badesul.mjs
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
import crypto from "crypto";
import { pool, withRetry } from "./_cadprev.mjs";

const db = pool();
const q = withRetry(db);

const REGS = [
  // CASAN — total_orgao, exercício 2025 (mesma metodologia de Banrisul/CELESC)
  { uf: "SC", sigla: "CASAN", nome_empresa: "Companhia Catarinense de Águas e Saneamento", orgao: "Conselho de Administração",
    numero_membros: 9, numero_membros_remunerados: 8, valor_maximo_anual: null, valor_minimo_anual: null,
    valor_medio_anual: 560420.49 / 8, ceo_nome: null, ceo_cargo: null,
    fonte: "dados.cvm.gov.br (fre_cia_aberta_2026.zip, remuneracao_total_orgao)", exercicio: "2025-01-01 a 2025-12-31",
    granularidade: "agregado_cvm_por_orgao" },
  { uf: "SC", sigla: "CASAN", nome_empresa: "Companhia Catarinense de Águas e Saneamento", orgao: "Diretoria Estatutária",
    numero_membros: 5, numero_membros_remunerados: 5, valor_maximo_anual: null, valor_minimo_anual: null,
    valor_medio_anual: 1544401.38 / 5, ceo_nome: "Pedro Joel Horstmann", ceo_cargo: "Diretor Presidente / Superintendente",
    fonte: "dados.cvm.gov.br (fre_cia_aberta_2026.zip, remuneracao_total_orgao) — DIVERGE do arquivo maxima_minima_media do mesmo documento (max anual lá: R$46.744,63) — ver nota no cabeçalho do script",
    exercicio: "2025-01-01 a 2025-12-31", granularidade: "agregado_cvm_por_orgao" },
  { uf: "SC", sigla: "CASAN", nome_empresa: "Companhia Catarinense de Águas e Saneamento", orgao: "Conselho Fiscal",
    numero_membros: 5, numero_membros_remunerados: 5, valor_maximo_anual: null, valor_minimo_anual: null,
    valor_medio_anual: 395085.46 / 5, ceo_nome: null, ceo_cargo: null,
    fonte: "dados.cvm.gov.br (fre_cia_aberta_2026.zip, remuneracao_total_orgao)", exercicio: "2025-01-01 a 2025-12-31",
    granularidade: "agregado_cvm_por_orgao" },
  // BDMG — estimativa de custos 2025 (documento próprio, não é CVM — BDMG não é companhia aberta)
  { uf: "MG", sigla: "BDMG", nome_empresa: "Banco de Desenvolvimento de Minas Gerais", orgao: "Conselho de Administração",
    numero_membros: 9, numero_membros_remunerados: 7, valor_maximo_anual: null, valor_minimo_anual: null,
    valor_medio_anual: 1160299.18 / 7, ceo_nome: null, ceo_cargo: null,
    fonte: "bdmg.mg.gov.br — Estimativa de Custos Alta Administração 2025.pdf (estimado, não realizado)",
    exercicio: "estimativa 2025", granularidade: "estimativa_propria_por_orgao" },
  { uf: "MG", sigla: "BDMG", nome_empresa: "Banco de Desenvolvimento de Minas Gerais", orgao: "Diretoria Executiva",
    numero_membros: 5, numero_membros_remunerados: 5, valor_maximo_anual: null, valor_minimo_anual: null,
    valor_medio_anual: 5422084.73 / 5, ceo_nome: "Gabriel Viégas Neto", ceo_cargo: "Diretor Presidente",
    fonte: "bdmg.mg.gov.br — Estimativa de Custos Alta Administração 2025.pdf (estimado, não realizado)",
    exercicio: "estimativa 2025", granularidade: "estimativa_propria_por_orgao" },
  { uf: "MG", sigla: "BDMG", nome_empresa: "Banco de Desenvolvimento de Minas Gerais", orgao: "Conselho Fiscal",
    numero_membros: 10, numero_membros_remunerados: 10, valor_maximo_anual: null, valor_minimo_anual: null,
    valor_medio_anual: 845655.90 / 10, ceo_nome: null, ceo_cargo: null,
    fonte: "bdmg.mg.gov.br — Estimativa de Custos Alta Administração 2025.pdf (estimado, não realizado)",
    exercicio: "estimativa 2025", granularidade: "estimativa_propria_por_orgao" },
  // Badesul — tabela fixa por cargo (honorário + verba de representação), não é média calculada
  { uf: "RS", sigla: "Badesul", nome_empresa: "Badesul Desenvolvimento S.A. - Agência de Fomento/RS", orgao: "Diretoria (Diretor Presidente)",
    numero_membros: 1, numero_membros_remunerados: 1, valor_maximo_anual: null, valor_minimo_anual: null,
    valor_medio_anual: (19858.84 + 19858.84) * 12, ceo_nome: "Robson Ferreira", ceo_cargo: "Diretor Presidente (desde mar/2026)",
    fonte: "badesul.com.br/paginas/Remuneração-Administração-e-Conselho-Fiscal (tabela fixa por cargo)",
    exercicio: "vigente 2026", granularidade: "tabela_fixa_por_cargo" },
  { uf: "RS", sigla: "Badesul", nome_empresa: "Badesul Desenvolvimento S.A. - Agência de Fomento/RS", orgao: "Diretoria (Vice-Presidente)",
    numero_membros: 1, numero_membros_remunerados: 1, valor_maximo_anual: null, valor_minimo_anual: null,
    valor_medio_anual: (18865.90 + 18865.90) * 12, ceo_nome: null, ceo_cargo: null,
    fonte: "badesul.com.br/paginas/Remuneração-Administração-e-Conselho-Fiscal (tabela fixa por cargo)",
    exercicio: "vigente 2026", granularidade: "tabela_fixa_por_cargo" },
  { uf: "RS", sigla: "Badesul", nome_empresa: "Badesul Desenvolvimento S.A. - Agência de Fomento/RS", orgao: "Diretoria (Diretor)",
    numero_membros: 1, numero_membros_remunerados: 1, valor_maximo_anual: null, valor_minimo_anual: null,
    valor_medio_anual: (16880.00 + 16880.00) * 12, ceo_nome: null, ceo_cargo: null,
    fonte: "badesul.com.br/paginas/Remuneração-Administração-e-Conselho-Fiscal (tabela fixa por cargo)",
    exercicio: "vigente 2026", granularidade: "tabela_fixa_por_cargo" },
];

for (const r of REGS) {
  const hash = crypto.createHash("sha256").update(`${r.uf}|${r.sigla}|${r.orgao}|${r.exercicio}`).digest("hex");
  await q(`insert into remuneracao_dirigentes_estatais_estaduais
    (uf,empresa_sigla,empresa_nome,orgao_administracao,numero_membros,numero_membros_remunerados,
     valor_maximo_anual,valor_minimo_anual,valor_medio_anual,ceo_nome,ceo_cargo,exercicio_referencia,
     granularidade,fonte,_hash)
    values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
    on conflict (_hash) do update set valor_medio_anual=excluded.valor_medio_anual`,
    [r.uf, r.sigla, r.nome_empresa, r.orgao, r.numero_membros, r.numero_membros_remunerados,
     r.valor_maximo_anual, r.valor_minimo_anual, r.valor_medio_anual, r.ceo_nome, r.ceo_cargo,
     r.exercicio, r.granularidade, r.fonte, hash]);
}

const { rows } = await q(`select uf, empresa_sigla, orgao_administracao, ceo_nome, round(valor_medio_anual/12,2) media_mensal, granularidade from remuneracao_dirigentes_estatais_estaduais where empresa_sigla in ('CASAN','BDMG','Badesul') order by uf, empresa_sigla, orgao_administracao`);
console.table(rows);
await db.end();
