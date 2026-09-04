// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
// ingest_remuneracao_estatais_sc_menores.mjs — destrava 2 das pendências de SC: CEASA-SC e CIASC, achadas no
// portal transparenciaempresas.sc.gov.br. Individualizado por NOME (diferente de CELESC/Sanepar, que só têm
// agregado via CVM) — mais rico, na verdade, que o federal.
//
// CEASA-SC: caminho /despesa/empregados-publicos/remuneracao — PDF mensal com TODOS os empregados e conselheiros,
// extraído com pdfplumber (o pdftotext -layout embaralhou linhas — conferido: dava valor errado pro Diretor
// Presidente). Mês usado: agosto/2026 (mais recente publicado).
//
// CIASC: caminho /gestao/governanca/divulgacao-da-remuneracao-dos-administradores — a página do ano corrente
// (2026) carrega VAZIA (sem PDF); a de anos anteriores tem os PDFs. Usei o mais recente disponível: maio/2025.
// Achado: CIASC não tem cargo "Presidente" — a diretoria é colegiada, 4 Vice-Presidentes (Tecnologia,
// Administrativo-Financeiro, Institucional, Mercado).
//
// PENDENTE (não desbloqueado nesta rodada): CASAN, BDMG, Badesul, EPAGRI, CIDASC, SANTUR — sem fonte achada.
// SCPAR/"Invest" (achada no mesmo portal) tem dado individualizado só que é uma HOLDING com várias siglas de
// subsidiária misturadas na mesma folha (PRES, CONSAD, DIRINV, SCPAR LAGUNA...) — não desembaracei a estrutura
// societária a tempo; fica de fora para não gravar errado.
//
// node scripts/ingest_remuneracao_estatais_sc_menores.mjs
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
import crypto from "crypto";
import { pool, withRetry } from "./_cadprev.mjs";

const db = pool();
const q = withRetry(db);

await q(`create table if not exists remuneracao_dirigentes_estatais_sc_individual (
  empresa_sigla text, empresa_nome text, cargo text, nome text, salario_bruto numeric, desconto numeric,
  salario_liquido numeric, competencia text, fonte text, _hash text primary key, _coletado_em timestamptz default now()
)`);

const CEASA = [
  { cargo: "Diretor de Apoio Operacional", nome: "Fernando dos Santos", bruto: 16380.59, desconto: 3586.93, liquido: 12793.66 },
  { cargo: "Diretor Técnico", nome: "Emerson Martins", bruto: 14579.49, desconto: 3639.07, liquido: 10940.42 },
  { cargo: "Diretor Presidente", nome: "Sandro Carlos Vidal", bruto: 22790.25, desconto: 6034.51, liquido: 16755.74 },
  { cargo: "Diretor Administrativo Financeiro", nome: "Edmilson Morais de Souza", bruto: 14579.49, desconto: 4254.65, liquido: 10324.84 },
  { cargo: "Conselheiro Fiscal", nome: "Viviane Aparecida Warling", bruto: 184.12, desconto: 0, liquido: 184.12 },
  { cargo: "Conselheiro Fiscal", nome: "Marcelo Alves Crivelatti", bruto: 184.12, desconto: 0, liquido: 184.12 },
  { cargo: "Conselheiro Fiscal", nome: "Camila Bolfe", bruto: 1426.90, desconto: 0, liquido: 1426.90 },
  { cargo: "Conselheiro Fiscal", nome: "Ilana Luiza Ferreira Marujo", bruto: 1242.78, desconto: 136.71, liquido: 1106.07 },
  { cargo: "Conselheiro Fiscal", nome: "Deyse Cristina Locatelli Haviaras", bruto: 1242.78, desconto: 136.71, liquido: 1106.07 },
  { cargo: "Conselheiro Administrativo", nome: "Diego Rosa Correia", bruto: 184.12, desconto: 0, liquido: 184.12 },
  { cargo: "Conselheiro Administrativo", nome: "Guido Luiz Hinckel", bruto: 184.12, desconto: 20.25, liquido: 163.87 },
  { cargo: "Conselheiro Administrativo", nome: "Athos de Almeida Lopes Filho", bruto: 1426.90, desconto: 0, liquido: 1426.90 },
  { cargo: "Conselheiro Administrativo", nome: "Admir Edi Dalla Cort", bruto: 1426.90, desconto: 156.96, liquido: 1269.94 },
  { cargo: "Conselheiro Administrativo", nome: "Antonio Marius Zuccarelli Bagnati", bruto: 1426.90, desconto: 0, liquido: 1426.90 },
  { cargo: "Conselheiro Administrativo", nome: "Camila Van de Sand Hemkemaier", bruto: 1426.90, desconto: 156.96, liquido: 1269.94 },
  { cargo: "Conselheiro Administrativo", nome: "Maria da Glória Mendes", bruto: 184.12, desconto: 20.25, liquido: 163.87 },
  { cargo: "Conselheiro Administrativo", nome: "Anderson Balestrin", bruto: 1242.78, desconto: 136.71, liquido: 1106.07 },
  { cargo: "Conselheiro Administrativo", nome: "Tatiana Gabriela Bonzini Olivera", bruto: 1242.78, desconto: 136.71, liquido: 1106.07 },
].map((r) => ({ ...r, empresa_sigla: "CEASA-SC", empresa_nome: "Centrais de Abastecimento do Estado de Santa Catarina S/A",
  competencia: "2026-08", fonte: "transparenciaempresas.sc.gov.br/ceasa/despesa/empregados-publicos/remuneracao" }));

const CIASC = [
  { cargo: "Vice-Presidente de Tecnologia", nome: "Marcos Antonio da Silva", bruto: 36750.72, desconto: null, liquido: 56718.39 },
  { cargo: "Vice-Presidente Administrativo e Financeiro", nome: "Diego Ricardo Holler", bruto: null, desconto: null, liquido: 13674.15 },
  { cargo: "Vice-Presidente Institucional", nome: "Nilson da Rosa", bruto: 9116.10, desconto: null, liquido: 24501.86 },
  { cargo: "Vice-Presidente de Mercado", nome: "Tiago Fagonde de Moraes", bruto: 9116.10, desconto: null, liquido: 24501.86 },
  { cargo: "Conselheiro Fiscal - Presidente", nome: "Elisa Locks", bruto: 4145.02, desconto: null, liquido: 4145.02 },
  { cargo: "Conselheiro Fiscal - Membro Titular", nome: "Aldemar Ricardo Bampi", bruto: 4145.02, desconto: null, liquido: 4145.02 },
  { cargo: "Conselheiro Fiscal - Membro Titular", nome: "Jair Natal Lanzarin", bruto: 4145.02, desconto: null, liquido: 4145.02 },
].map((r) => ({ ...r, empresa_sigla: "CIASC", empresa_nome: "Centro de Informática e Automação do Estado de Santa Catarina S/A",
  competencia: "2025-05", fonte: "transparenciaempresas.sc.gov.br/ciasc/gestao/governanca/divulgacao-da-remuneracao-dos-administradores" }));

const TODOS = [...CEASA, ...CIASC];
for (const r of TODOS) {
  const hash = crypto.createHash("sha256").update(`${r.empresa_sigla}|${r.cargo}|${r.nome}|${r.competencia}`).digest("hex");
  await q(`insert into remuneracao_dirigentes_estatais_sc_individual
    (empresa_sigla,empresa_nome,cargo,nome,salario_bruto,desconto,salario_liquido,competencia,fonte,_hash)
    values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) on conflict (_hash) do nothing`,
    [r.empresa_sigla, r.empresa_nome, r.cargo, r.nome, r.bruto, r.desconto, r.liquido, r.competencia, r.fonte, hash]);
}

const { rows } = await q(`select empresa_sigla, cargo, nome, salario_liquido from remuneracao_dirigentes_estatais_sc_individual order by empresa_sigla, salario_liquido desc nulls last`);
console.table(rows);
await db.end();
