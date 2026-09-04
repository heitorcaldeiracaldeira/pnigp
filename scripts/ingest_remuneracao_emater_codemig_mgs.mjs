// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
// ingest_remuneracao_emater_codemig_mgs.mjs — EMATER-MG, CODEMIG, MGS.
//
// EMATER-MG: a fonte mais rica encontrada até agora nesta frente — PDF próprio (download.do?id=86546) com série
// MENSAL completa (jan-ago/2026), individualizado por nome, cargo, matrícula e TODOS os componentes (básica,
// outras remunerações, férias, 13º, INSS, IRRF, outros descontos, líquido). Guardo aqui só o mês mais recente
// (agosto/2026) para a tabela de "situação atual" — a série completa fica no PDF fonte se precisar histórico.
//
// CODEMIG: acordo de cooperação com a CODEMGE faz as duas terem O MESMO Conselho de Administração, Conselho
// Fiscal e Diretoria (confirmado nos nomes idênticos nas duas páginas institucionais) — quem serve nas duas só
// recebe uma remuneração. O valor do Conselho de Administração é FIXO e divulgado (R$ 9.100,00 bruto/mês,
// achado via busca) — o da Diretoria Executiva não achei publicado em lugar acessível (o dashboard "Pessoal" do
// site é só por departamento/gerência de custeio, não por administrador).
//
// MGS: BLOQUEADA por dois motivos reais, não por falta de busca — (1) o site institucional está com
// "informações restritas" por força da legislação eleitoral (comunicado explícito no próprio site, período
// eleitoral 2026); (2) a presidência está em transição não confirmada (notícia de nov/2024 fala em saída do
// presidente Marcelo Magalhães Rosa Isoni e cotação de Camila Neves, sem confirmação de posse). Fica registrada
// como pendência, sem nome nem valor.
//
// node scripts/ingest_remuneracao_emater_codemig_mgs.mjs
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
import crypto from "crypto";
import { pool, withRetry } from "./_cadprev.mjs";

const db = pool();
const q = withRetry(db);

await q(`create table if not exists remuneracao_dirigentes_estatais_mg_individual (
  empresa_sigla text, empresa_nome text, cargo text, nome text, matricula text,
  remuneracao_basica numeric, outras_remuneracoes numeric, ferias numeric, decimo_terceiro numeric,
  inss numeric, irrf numeric, demais_descontos numeric, liquido numeric, mes_referencia text, fonte text,
  _hash text primary key, _coletado_em timestamptz default now()
)`);

const FONTE_EMATER = "emater.mg.gov.br/download.do?id=86546 (Remuneração de Diretoria, Conselho de Administração e Conselho Fiscal)";
const EMATER_AGO2026 = [
  { cargo: "Diretor Presidente", nome: "Claudio Augusto Bortolini", matricula: "87813", basica: 9267.66, outras: 31214.90, ferias: null, decimo: null, inss: 988.07, irrf: 4209.83, demais: 23294.36, liquido: 11990.30 },
  { cargo: "Diretor", nome: "Everton Augusto Paiva Ferreira", matricula: "87406", basica: 12637.72, outras: 14059.88, ferias: null, decimo: null, inss: 988.07, irrf: 5133.45, demais: 4317.60, liquido: 16258.48 },
  { cargo: "Diretor", nome: "Gelson Soares Lemes", matricula: "81068", basica: 13179.67, outras: 21907.91, ferias: null, decimo: null, inss: 988.07, irrf: 7052.20, demais: 7738.20, liquido: 19309.11 },
  { cargo: "Conselho de Administração", nome: "Cristiano de Magalhaes Barros", matricula: "902575", basica: 3245.52, outras: null, ferias: null, decimo: null, inss: 357, irrf: null, demais: null, liquido: 2888.52 },
  { cargo: "Conselho de Administração", nome: "Gilson de Assis Sales", matricula: "902435", basica: 3245.52, outras: null, ferias: null, decimo: null, inss: 357, irrf: null, demais: null, liquido: 2888.52 },
  { cargo: "Conselho de Administração", nome: "Natalia Patricia de Souza Henriques", matricula: "902745", basica: 3245.52, outras: null, ferias: null, decimo: null, inss: 30.37, irrf: null, demais: null, liquido: 3215.15 },
  { cargo: "Conselho de Administração", nome: "Nilda de Fatima Ferreira Soares", matricula: "900963", basica: 3245.52, outras: null, ferias: null, decimo: null, inss: null, irrf: null, demais: null, liquido: 3245.52 },
  { cargo: "Conselho de Administração", nome: "Rodrigo Carvalho Fernandes", matricula: "902443", basica: 3245.52, outras: null, ferias: null, decimo: null, inss: 357, irrf: null, demais: null, liquido: 2888.52 },
  { cargo: "Conselho Fiscal", nome: "Gustavo de Lima Tavares Coimbra", matricula: "902648", basica: 2163.68, outras: null, ferias: null, decimo: null, inss: null, irrf: null, demais: null, liquido: 2163.68 },
  { cargo: "Conselho Fiscal", nome: "Pedro Dangelo Ribeiro", matricula: "902150", basica: 2163.68, outras: null, ferias: null, decimo: null, inss: null, irrf: null, demais: null, liquido: 2163.68 },
].map((r) => ({ ...r, empresa_sigla: "EMATER-MG", empresa_nome: "Empresa de Assistência Técnica e Extensão Rural do Estado de Minas Gerais",
  mes_referencia: "2026-08", fonte: FONTE_EMATER }));

for (const r of EMATER_AGO2026) {
  const hash = crypto.createHash("sha256").update(`${r.empresa_sigla}|${r.cargo}|${r.nome}|${r.mes_referencia}`).digest("hex");
  await q(`insert into remuneracao_dirigentes_estatais_mg_individual
    (empresa_sigla,empresa_nome,cargo,nome,matricula,remuneracao_basica,outras_remuneracoes,ferias,decimo_terceiro,
     inss,irrf,demais_descontos,liquido,mes_referencia,fonte,_hash)
    values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) on conflict (_hash) do nothing`,
    [r.empresa_sigla, r.empresa_nome, r.cargo, r.nome, r.matricula, r.basica, r.outras, r.ferias, r.decimo,
     r.inss, r.irrf, r.demais, r.liquido, r.mes_referencia, r.fonte, hash]);
}

// CODEMIG: membros (mesmos da CODEMGE) — sem salário individual, exceto Conselho de Administração (fixo, achado)
const FONTE_CODEMIG = "codemge.com.br/codemig (página institucional) — Conselho de Administração e Diretoria compartilhados com a Codemge por Acordo de Cooperação";
const CODEMIG_MEMBROS = [
  ["Diretoria", "Luísa Cardoso Barreto", "Diretora-Presidente"],
  ["Diretoria", "Helger Marra Lopes", "Diretor"], ["Diretoria", "Leandro César Pereira", "Diretor"],
  ["Diretoria", "Fernanda Alen Gonçalves da Silva", "Diretora"], ["Diretoria", "Gabriel Ribeiro Fajardo", "Diretor"],
  ["Diretoria", "Maria Laura Marinho Vidigal", "Diretora Jurídica, Compliance e ESG"],
  ["Conselho de Administração", "Bruno Selmi Dei Falci", "Presidente"],
  ["Conselho de Administração", "Aluísio Eduardo Caetano de Medeiros", "Conselheiro"],
  ["Conselho de Administração", "Edsoney Max Alves", "Conselheiro"],
  ["Conselho de Administração", "Fernando Passalio de Avelar", "Conselheiro"],
  ["Conselho de Administração", "Jean Carlos Fernandes", "Conselheiro"],
  ["Conselho de Administração", "João Carlos Gontijo de Amorim", "Conselheiro"],
  ["Conselho de Administração", "Saulo Nazareno de Mesquita Carvalho", "Conselheiro"],
  ["Conselho de Administração", "Flávio Scholbi Uflacker de Oliveira", "Membro Empregado"],
  ["Conselho Fiscal", "Fábio Rodrigo Amaral de Assunção", "Presidente"],
  ["Conselho Fiscal", "Cássia Amorim Ximenes de Souza", "Titular"], ["Conselho Fiscal", "Fabiana Sidnei Bechir Vinhal", "Titular"],
  ["Conselho Fiscal", "Guilherme da Cunha Andrade", "Titular"], ["Conselho Fiscal", "Thales Almeida Pereira Fernandes", "Titular"],
  ["Conselho Fiscal", "Aline Brandão Silva", "Suplente"], ["Conselho Fiscal", "Sauro Henrique de Almeida", "Suplente"],
];
for (const [orgao, nome, cargo] of CODEMIG_MEMBROS) {
  const hash = crypto.createHash("sha256").update(`MG|CODEMIG|${orgao}|${nome}|${cargo}`).digest("hex");
  await q(`insert into membros_estatais_estaduais (uf,empresa_sigla,empresa_nome,orgao,cargo_especifico,nome,fonte,referencia,_hash)
    values ('MG','CODEMIG','Companhia de Desenvolvimento Econômico de Minas Gerais',$1,$2,$3,$4,'2026',$5)
    on conflict (_hash) do nothing`, [orgao, cargo, nome, FONTE_CODEMIG, hash]);
}
// valor fixo conhecido do Conselho de Administração
await q(`create table if not exists estatais_pendencias (
  uf text, empresa_sigla text, empresa_nome text, motivo text, detalhe text, fonte text, _hash text primary key
)`);
{
  const hash = crypto.createHash("sha256").update("MG|CODEMIG|conselho_valor").digest("hex");
  await q(`insert into estatais_pendencias (uf,empresa_sigla,empresa_nome,motivo,detalhe,fonte,_hash) values
    ('MG','CODEMIG','Companhia de Desenvolvimento Econômico de Minas Gerais','valor_parcial',
     'Conselho de Administração recebe R$ 9.100,00 brutos/mês (valor fixo, achado via busca) — Conselho Fiscal é por fórmula (mínimo 10% da média da Diretoria, Lei 6.404 art.162 §3) — Diretoria Executiva sem valor publicado encontrado',
     'busca web + codemge.com.br', $1) on conflict (_hash) do nothing`, [hash]);
}
{
  const hash = crypto.createHash("sha256").update("MG|MGS|bloqueada").digest("hex");
  await q(`insert into estatais_pendencias (uf,empresa_sigla,empresa_nome,motivo,detalhe,fonte,_hash) values
    ('MG','MGS','Minas Gerais Administração e Serviços S.A.','sem_dados',
     'Site institucional (mgs.srv.br) está com informações restritas por força da legislação eleitoral (aviso explícito no próprio site, período eleitoral 2026); presidência em transição não confirmada (nov/2024: saída de Marcelo Magalhães Rosa Isoni, cotação de Camila Neves sem confirmação de posse); portal de dados antigo (main.mgs.srv.br) com link de download quebrado (404)',
     'mgs.srv.br + busca web', $1) on conflict (_hash) do nothing`, [hash]);
}

console.log("=== EMATER-MG (ago/2026) ===");
console.table((await q(`select cargo, nome, liquido from remuneracao_dirigentes_estatais_mg_individual order by liquido desc nulls last`)).rows);
console.log("=== CODEMIG membros ===");
console.table((await q(`select orgao, count(*) from membros_estatais_estaduais where empresa_sigla='CODEMIG' group by 1`)).rows);
console.log("=== pendências MG ===");
console.table((await q(`select empresa_sigla, motivo, detalhe from estatais_pendencias where uf='MG'`)).rows);
await db.end();
