// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
// ingest_dirigentes_atuais_estatais_federais.mjs — nome de quem ocupa HOJE (2026) a Presidência/Diretoria-Geral
// de cada estatal federal, para juntar ao salário do cargo (remuneracao_dirigentes_estatais_federais).
//
// POR QUÊ isso não vem de uma fonte única: o cadastro nacional de dirigentes da CGU (Portal da Transparência)
// parou de ser atualizado em outubro/2018 — confirmado navegando a página real, não é bloqueio de robô, o
// arquivo de 2018 baixa normal e nenhum mês depois disso existe. Cruzar um nome de 2018 com o salário de
// 2022-2023 atribuiria o cargo à pessoa errada na maioria dos casos (a rotatividade nesses cargos é de 2-4 anos).
// Por isso o nome de cada dirigente foi levantado individualmente na página institucional/imprensa de cada
// empresa (2 a 3 buscas por empresa, 6 levantamentos paralelos cobrindo as 77 estatais).
//
// COBERTURA: 47 de 77 com nome (61%). As faltantes se dividem em duas causas BEM diferentes — companheiras de
// "situacao" abaixo mostram qual:
//   - "nao_encontrado": subsidiária pequena sem divulgação de liderança própria indexada (ex.: BB DTVM, BB
//     Leasing, PBEN, Refinaria de Manaus) — o cargo pode existir, só não achei o nome nas buscas.
//   - "extinta_ou_incorporada": a EMPRESA em si não existe mais como estatal federal independente (Valec
//     incorporada pela Infra S.A. em 2022, Refinaria de Paraná Xisto vendida à Forbes Resources em 2022,
//     Termobahia desinvestida em 2018, TGO incorporada por Furnas em 2022) — o salário de 2022-2023 já
//     gravado é um retrato histórico de quando a empresa ainda tinha diretoria própria, não um erro a corrigir.
//   - "ambiguo": fontes conflitantes sem como resolver com segurança (BBTS, Finep) — dado propositalmente
//     omitido em vez de adivinhado entre duas opções.
//
// node scripts/ingest_dirigentes_atuais_estatais_federais.mjs
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
import crypto from "crypto";
import { pool, withRetry } from "./_cadprev.mjs";

const db = pool();
const q = withRetry(db);

// situacao: 'titular' | 'interino' | 'nao_encontrado' | 'extinta_ou_incorporada' | 'ambiguo'
const D = [
  { sigla: "ABGF", cargo: "Presidente", nome: "Maíra Madrid", situacao: "titular", confianca: "media", fonte: "qconcursos.com (entrevista 2026)" },
  { sigla: "Amazul", cargo: "Presidente", nome: "Alexandre Rabello de Faria", situacao: "titular", confianca: "alta", fonte: "amazul.marinha.mil.br (ata CONSAD, mar/2026)" },
  { sigla: "ANSA", cargo: "Presidente", nome: "Marcelo dos Santos Faria", situacao: "interino", confianca: "media", fonte: "gov.br/casacivil (2026)" },
  { sigla: "Ativos S.A.", cargo: "Presidente", nome: "Bruno Melo de Siqueira Vieira", situacao: "titular", confianca: "baixa", fonte: "perfil corporativo agregado, sem confirmação primária" },
  { sigla: "Ativos Gestão", cargo: "Presidente", nome: null, situacao: "nao_encontrado", confianca: null, fonte: null },
  { sigla: "Basa", cargo: "Presidente", nome: "Luiz Lessa", situacao: "titular", confianca: "alta", fonte: "exame.com (desde jun/2023)" },
  { sigla: "BB (Grupo)", cargo: "Presidente", nome: "Tarciana Medeiros", situacao: "titular", confianca: "alta", fonte: "desde jan/2023" },
  { sigla: "BB BI", cargo: "Presidente", nome: null, situacao: "nao_encontrado", confianca: null, fonte: null },
  { sigla: "BB Cartões", cargo: "Presidente", nome: null, situacao: "nao_encontrado", confianca: null, fonte: null },
  { sigla: "BB Consórcios", cargo: "Presidente", nome: "Marcel Kitamura", situacao: "titular", confianca: "baixa", fonte: "menção indireta, sem URL institucional primária" },
  { sigla: "BB DTVM", cargo: "Presidente", nome: null, situacao: "nao_encontrado", confianca: null, fonte: null },
  { sigla: "BB Elo Cartões", cargo: "Presidente", nome: null, situacao: "nao_encontrado", confianca: null, fonte: null },
  { sigla: "BB Leasing", cargo: "Presidente", nome: null, situacao: "nao_encontrado", confianca: null, fonte: null },
  { sigla: "BB Seguridade", cargo: "Presidente", nome: "Delano de Andrade", situacao: "titular", confianca: "alta", fonte: "exame.com (mandato 2025-2027)" },
  { sigla: "BBTS", cargo: "Presidente", nome: null, situacao: "ambiguo", confianca: null, fonte: "conflito: Paulo André Rocha Alves vs. Gustavo Pacheco Lustosa" },
  { sigla: "BBTUR", cargo: "Presidente", nome: null, situacao: "nao_encontrado", confianca: null, fonte: "indício de empresa desativada ~2019" },
  { sigla: "BNB", cargo: "Presidente", nome: "Wanger Antônio de Alencar Rocha", situacao: "interino", confianca: "alta", fonte: "bnb.gov.br (eleito out/2025)" },
  { sigla: "BNDES (Grupo)", cargo: "Presidente", nome: "Aloizio Mercadante Oliva", situacao: "titular", confianca: "alta", fonte: "bndes.gov.br/quem-e-quem (ago/2026)" },
  { sigla: "Caixa (Grupo)", cargo: "Presidente", nome: "Carlos Vieira", situacao: "titular", confianca: "alta", fonte: "agenciagov.ebc.com.br (posse nov/2023)" },
  { sigla: "Caixa DTVM", cargo: "Presidente", nome: "Pablo Costa Sarmento", situacao: "titular", confianca: "media", fonte: "caixa.gov.br (mandato 2023/2025, não confirmado se segue)" },
  { sigla: "Caixa Cartões", cargo: "Presidente", nome: "Júlio César Volpp Sierra", situacao: "titular", confianca: "media", fonte: "ata societária (mziq.com)" },
  { sigla: "Caixa Loterias", cargo: "Presidente", nome: "Tiago Cordeiro de Oliveira", situacao: "titular", confianca: "alta", fonte: "yogonet.com (posse jul/2025)" },
  { sigla: "Caixa Seguridade", cargo: "Presidente", nome: "Luiz Gustavo Portela", situacao: "titular", confianca: "alta", fonte: "cqcs.com.br (2026)" },
  { sigla: "CBTU", cargo: "Presidente", nome: "José Marques de Lima", situacao: "titular", confianca: "media", fonte: "gov.br/cbtu/quem-e-quem (mar/2024, não confirmado se segue)" },
  { sigla: "CDC", cargo: "Presidente", nome: "Francisco Quintino Vieira Neto", situacao: "titular", confianca: "alta", fonte: "docasdoceara.com.br (posse mai/2026, após 2 trocas no ano)" },
  { sigla: "CDP", cargo: "Presidente", nome: "Jardel Silva", situacao: "titular", confianca: "media", fonte: "cdp.com.br (2026)" },
  { sigla: "CDRJ", cargo: "Presidente", nome: null, situacao: "nao_encontrado", confianca: null, fonte: null },
  { sigla: "Ceagesp", cargo: "Presidente", nome: "José Lourenço Pechtoll", situacao: "titular", confianca: "alta", fonte: "ceagesp.gov.br (set/2024)" },
  { sigla: "Ceasaminas", cargo: "Presidente", nome: "Hideraldo Henrique Silva", situacao: "titular", confianca: "alta", fonte: "diariodocomercio.com.br (ago/2026)" },
  { sigla: "Ceitec", cargo: "Presidente", nome: "Cylon Gonçalves da Silva", situacao: "titular", confianca: "alta", fonte: "cnpem.br (assumiu 04/08/2026)" },
  { sigla: "CMB", cargo: "Presidente", nome: "Sérgio Perini Rodrigues", situacao: "titular", confianca: "media", fonte: "casadamoeda.gov.br/quem-e-quem" },
  { sigla: "Codeba", cargo: "Presidente", nome: "Antônio José Rodriguez de Mattos Gobbo", situacao: "titular", confianca: "media", fonte: "codeba.gov.br (pode ter sucessão recente não confirmada)" },
  { sigla: "Codern", cargo: "Presidente", nome: null, situacao: "nao_encontrado", confianca: null, fonte: null },
  { sigla: "Codesa", cargo: "Presidente", nome: null, situacao: "nao_encontrado", confianca: null, fonte: null },
  { sigla: "Codevasf", cargo: "Presidente", nome: "Lucas Felipe de Oliveira", situacao: "titular", confianca: "alta", fonte: "codevasf.gov.br (assumiu jun/2025)" },
  { sigla: "Conab", cargo: "Presidente", nome: "Edegar Pretto", situacao: "titular", confianca: "baixa", fonte: "conab.gov.br (nomeado 2023, desatualizado)" },
  { sigla: "Correios (ECT)", cargo: "Presidente", nome: "Emmanoel Schmidt Rondon", situacao: "titular", confianca: "alta", fonte: "cnnbrasil.com.br (2025/2026)" },
  { sigla: "CPRM", cargo: "Presidente", nome: "Vilmar Medeiros Simões", situacao: "titular", confianca: "media", fonte: "registro jan/2026, não é o site oficial" },
  { sigla: "DATAPREV", cargo: "Presidente", nome: "Rodrigo Ortiz D'Avila Assumpção", situacao: "titular", confianca: "alta", fonte: "TV Senado (mar/2026)" },
  { sigla: "EBC", cargo: "Presidente", nome: "André Basbaum", situacao: "titular", confianca: "alta", fonte: "ebc.com.br/imprensa (2025)" },
  { sigla: "Ebserh", cargo: "Presidente", nome: "Arthur Chioro", situacao: "titular", confianca: "alta", fonte: "MEC (desde 2023)" },
  { sigla: "Eletronuclear", cargo: "Presidente", nome: "Raphael Ehlers dos Santos", situacao: "interino", confianca: "alta", fonte: "eletronuclear.gov.br (mai/2026)" },
  { sigla: "Embrapa", cargo: "Presidente", nome: "Silvia Massruhá", situacao: "titular", confianca: "alta", fonte: "embrapa.br/presidencia (desde mai/2023)" },
  { sigla: "Emgea", cargo: "Presidente", nome: "Fernando Damata Pimentel", situacao: "titular", confianca: "alta", fonte: "portaldatransparencia.gov.br (2026)" },
  { sigla: "Emgepron", cargo: "Presidente", nome: "Vice-Almirante (RM1) Edésio Teixeira", situacao: "titular", confianca: "alta", fonte: "emgepron.gov.br (2026)" },
  { sigla: "ENBPar", cargo: "Presidente", nome: "Marlos Costa de Andrade", situacao: "titular", confianca: "alta", fonte: "enbpar.gov.br (posse jul/2025)" },
  { sigla: "EPE", cargo: "Presidente", nome: "Thiago Prado", situacao: "titular", confianca: "alta", fonte: "epe.gov.br (2026)" },
  { sigla: "EPL", cargo: "Presidente", nome: "Mateus Szwarcwing", situacao: "titular", confianca: "alta", fonte: "portal.epl.gov.br (2026)" },
  { sigla: "Finep", cargo: "Presidente", nome: null, situacao: "ambiguo", confianca: null, fonte: "conflito: Luiz Antônio Elias vs. Waldemar Barroso" },
  { sigla: "GHC", cargo: "Presidente", nome: "Gilberto Barichello", situacao: "titular", confianca: "alta", fonte: "ghc.com.br (nomeado abr/2024)" },
  { sigla: "HCPA", cargo: "Presidente", nome: "Brasil Silva Neto", situacao: "titular", confianca: "alta", fonte: "hcpa.edu.br (mandato out/2024-out/2026)" },
  { sigla: "Hemobras", cargo: "Presidente", nome: "Ana Paula Menezes", situacao: "titular", confianca: "alta", fonte: "hemobras.gov.br (biênio 2026/2027)" },
  { sigla: "Imbel", cargo: "Presidente", nome: "Gen. Div. Flávio Mayon Ferreira Neiva", situacao: "titular", confianca: "alta", fonte: "defesaemfoco.com.br (2026)" },
  { sigla: "INB", cargo: "Presidente", nome: "Tomás Albuquerque", situacao: "titular", confianca: "alta", fonte: "inb.gov.br (2026)" },
  { sigla: "Infraero", cargo: "Presidente", nome: "Rogério Amado Barzellay", situacao: "titular", confianca: "alta", fonte: "transparencia.infraero.gov.br/quem-e-quem" },
  { sigla: "NAVBrasil", cargo: "Presidente", nome: "José Pompeu dos Magalhães Brasil Filho", situacao: "titular", confianca: "alta", fonte: "navbrasil.gov.br (2026)" },
  { sigla: "Nuclep", cargo: "Presidente", nome: "Adeilson Telles", situacao: "titular", confianca: "alta", fonte: "defesanet.com.br (posse jan/2026)" },
  { sigla: "PBEN", cargo: "Presidente", nome: null, situacao: "nao_encontrado", confianca: null, fonte: null },
  { sigla: "PBEN-P", cargo: "Presidente", nome: null, situacao: "nao_encontrado", confianca: null, fonte: null },
  { sigla: "PBIO", cargo: "Presidente", nome: "Alex Gasparetto", situacao: "titular", confianca: "alta", fonte: "eixos.com.br (mai/2026)" },
  { sigla: "PBLOG", cargo: "Presidente", nome: null, situacao: "nao_encontrado", confianca: null, fonte: "incorporada à estrutura da Transpetro em 28/11/2025, sem presidente próprio distinto" },
  { sigla: "PETROBRAS (Grupo)", cargo: "Presidente", nome: "Magda Chambriard", situacao: "titular", confianca: "alta", fonte: "agencia.petrobras.com.br (eleita mai/2024)" },
  { sigla: "PPSA", cargo: "Presidente", nome: "Tabita Loureiro", situacao: "interino", confianca: "alta", fonte: "presalpetroleo.gov.br (2026, substituiu Eduardo Gerk)" },
  { sigla: "Refinaria de Manaus", cargo: "Presidente", nome: null, situacao: "nao_encontrado", confianca: null, fonte: null },
  { sigla: "Refinaria de Mucuripe", cargo: "Presidente", nome: "Isabella Carneiro Leão", situacao: "titular", confianca: "media", fonte: "busca web — CADE aprovou venda à Grepar, empresa pode estar em transição de controle" },
  { sigla: "Refinaria de Paraná Xisto", cargo: "Presidente", nome: null, situacao: "extinta_ou_incorporada", confianca: null, fonte: "vendida à Forbes Resources em 04/11/2022 — não é mais estatal" },
  { sigla: "Serpro", cargo: "Presidente", nome: "Wilton Itaiguara Gonçalves Mota", situacao: "titular", confianca: "alta", fonte: "convergenciadigital.com.br (nomeado 18/11/2025)" },
  { sigla: "SPA", cargo: "Presidente", nome: "Anderson Pomini", situacao: "titular", confianca: "alta", fonte: "santaportal.com.br (2026)" },
  { sigla: "Telebras", cargo: "Presidente", nome: "Hermano Studart Lins de Albuquerque", situacao: "titular", confianca: "alta", fonte: "telebras.com.br (desde 19/01/2026)" },
  { sigla: "Termobahia", cargo: "Presidente", nome: null, situacao: "extinta_ou_incorporada", confianca: null, fonte: "participação vendida à Total em 16/01/2018 — não é mais estatal" },
  { sigla: "Termomacaé", cargo: "Presidente", nome: null, situacao: "nao_encontrado", confianca: null, fonte: "ativa como subsidiária integral da Petrobras, nome não indexado" },
  { sigla: "TGO", cargo: "Presidente", nome: null, situacao: "extinta_ou_incorporada", confianca: null, fonte: "incorporada por Furnas em nov/2022 (Eletrobras, sua controladora, já privatizada)" },
  { sigla: "Transbel", cargo: "Presidente", nome: null, situacao: "nao_encontrado", confianca: null, fonte: null },
  { sigla: "Transpetro", cargo: "Presidente", nome: "Sérgio Bacci", situacao: "titular", confianca: "alta", fonte: "confirmado jun/2026" },
  { sigla: "Trensurb", cargo: "Presidente", nome: "Mariana Moya de Oliveira", situacao: "titular", confianca: "alta", fonte: "site oficial Trensurb (2026)" },
  { sigla: "Valec", cargo: "Presidente", nome: null, situacao: "extinta_ou_incorporada", confianca: null, fonte: "incorporada pela Infra S.A. (fusão com EPL) em 30/09/2022" },
  { sigla: "VDMG", cargo: "Presidente", nome: null, situacao: "ambiguo", confianca: null, fonte: "único achado é 'Veículo de Desestatização MG', que parece ser estadual (MG), sigla pode não bater com a empresa federal da lista Sest" },
];

await q(`create table if not exists dirigentes_atuais_estatais_federais (
  empresa_sigla text, cargo text, nome text, situacao text, confianca text, fonte text,
  data_referencia date default current_date, _hash text primary key, _coletado_em timestamptz default now()
)`);

for (const d of D) {
  const hash = crypto.createHash("sha256").update(`${d.sigla}|${d.cargo}|hoje`).digest("hex");
  await q(`insert into dirigentes_atuais_estatais_federais
    (empresa_sigla, cargo, nome, situacao, confianca, fonte, _hash)
    values ($1,$2,$3,$4,$5,$6,$7)
    on conflict (_hash) do update set nome=excluded.nome, situacao=excluded.situacao,
      confianca=excluded.confianca, fonte=excluded.fonte, data_referencia=current_date`,
    [d.sigla, d.cargo, d.nome, d.situacao, d.confianca, d.fonte, hash]);
}

const { rows: resumo } = await q(`select situacao, count(*) from dirigentes_atuais_estatais_federais group by 1 order by 2 desc`);
console.table(resumo);

const { rows: junto } = await q(`
  select r.empresa_sigla, r.empresa_nome, d.nome, d.situacao, d.confianca, r.valor_um_mes as salario_mensal
  from remuneracao_dirigentes_estatais_federais r
  join dirigentes_atuais_estatais_federais d
    on d.empresa_sigla = r.empresa_sigla and d.cargo = r.tipo_cargo
  where r.rubrica = 'Honorário Fixo' and d.nome is not null
  order by r.valor_um_mes desc nulls last`);
console.log(`\nlinhas com salário + nome juntos: ${junto.length}`);
console.table(junto.slice(0, 10));

await db.end();
