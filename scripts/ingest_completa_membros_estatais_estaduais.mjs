// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
// ingest_completa_membros_estatais_estaduais.mjs — resposta a "isso está com todos os dados colhidos?": NÃO
// estava — só tinha o dirigente máximo de cada empresa. Este script completa:
//   1) o ROSTER INTEIRO de Conselho de Administração / Diretoria / Conselho Fiscal de CEMIG, Banrisul, CELESC,
//      Sanepar, CASAN (via o mesmo arquivo da CVM que já tinha, administrador_membro_conselho_fiscal) e de BDMG
//      e Badesul (via página institucional própria, achada agora) — SEM salário individual (a fonte não publica
//      isso para nenhuma delas, só o agregado por órgão que já está em remuneracao_dirigentes_estatais_estaduais).
//   2) os membros de Conselho que faltavam em CIDASC/COHAB-SC (a varredura anterior só pegou o cargo máximo).
//   3) os outros 5 diretores da Fomento Paraná (só tinha o Diretor-Presidente).
//
// node scripts/ingest_completa_membros_estatais_estaduais.mjs
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
import crypto from "crypto";
import { pool, withRetry } from "./_cadprev.mjs";

const db = pool();
const q = withRetry(db);

await q(`create table if not exists membros_estatais_estaduais (
  uf text, empresa_sigla text, empresa_nome text, orgao text, cargo_especifico text, nome text,
  fonte text, referencia text, _hash text primary key, _coletado_em timestamptz default now()
)`);

// --- CVM: CEMIG, Banrisul, CELESC, Sanepar, CASAN (nome + cargo específico, sem salário individual) ---
const FONTE_CVM = "dados.cvm.gov.br (fre_cia_aberta_2026.zip, administrador_membro_conselho_fiscal) — sem salário individual, só o agregado por órgão";
const CVM = [
  ["MG","CEMIG","Companhia Energética de Minas Gerais",[
    ["Diretoria","Alexandre Ramos Peixoto","Diretor Presidente / Superintendente"],
    ["Diretoria","Demétrio Alexandre Ferreira","Outros Diretores"],["Diretoria","Ernando Antunes Braga","Outros Diretores"],
    ["Diretoria","Leonardo George de Magalhães","Outros Diretores"],["Diretoria","Luiz Cláudio Correa Villani","Outros Diretores"],
    ["Diretoria","Sérgio Pessoa de Paula Castro","Outros Diretores"],["Diretoria","Marcos Montes Cordeiro","Outros Diretores"],
    ["Diretoria","Sergio Lopes Cabral","Outros Diretores"],
    ["Conselho de Administração","Marcio Pereira Zimmermann","Presidente do Conselho de Administração Independente"],
    ["Conselho de Administração","Valeria Pires Amoroso Lima","Conselho de Adm. Independente (Efetivo)"],
    ["Conselho de Administração","Anderson Rodrigues","Conselho de Administração (Efetivo)"],
    ["Conselho de Administração","Marcus Leonardo Silberman","Conselho de Adm. Independente (Efetivo)"],
    ["Conselho de Administração","Maria do Socorro Gama da Silva","Conselho de Adm. Independente (Efetivo)"],
    ["Conselho de Administração","Aloísio Macário Ferreira de Souza","Conselho de Adm. Independente (Efetivo)"],
    ["Conselho de Administração","Roger Daniel Versieux","Conselho de Adm. Independente (Efetivo)"],
    ["Conselho de Administração","Daniel Alves Ferreira","Conselho de Adm. Independente (Efetivo)"],
    ["Conselho de Administração","Afonso Henriques Moreira Santos","Conselho de Adm. Independente (Efetivo)"],
    ["Conselho Fiscal","Pedro Bruno Barros de Souza","C.F.(Efetivo) Eleito p/Controlador"],
    ["Conselho Fiscal","Ricardo José Martins Gimenez","C.F.(Suplente) Eleito p/preferencialistas"],
    ["Conselho Fiscal","Mauro Teixeira Biondini","C.F.(Suplente) Eleito p/Controlador"],
    ["Conselho Fiscal","Welerson Cavalieri","C.F.(Efetivo) Eleito p/Minor.Ordinaristas"],
    ["Conselho Fiscal","Paulo Roberto Bellentani Brandão","C.F.(Suplente) Eleito p/Minor.Ordinaristas"],
    ["Conselho Fiscal","Carlos Roberto de Albuquerque Sá","C.F.(Efetivo) Eleito p/Controlador"],
    ["Conselho Fiscal","João Vicente Silva Machado","C.F.(Efetivo) Eleito p/preferencialistas"],
    ["Conselho Fiscal","Carlos Alberto Arruda de Oliveira","C.F.(Suplente) Eleito p/Controlador"],
    ["Conselho Fiscal","Silvia Caroline Listgarten Dias","C.F.(Suplente) Eleito p/Controlador"],
  ]],
  ["RS","Banrisul","Banco do Estado do Rio Grande do Sul S.A.",[
    ["Diretoria","Fernando Guerreiro de Lemos","Vice Pres. C.A. e Diretor Presidente"],
    ["Diretoria","Luiz Gonzaga Veras Mota","Conselheiro(Efetivo) e Dir. Rel. Invest."],
    ["Diretoria","Carlos Aluísio Vaz Malafaia","Outros Diretores"],["Diretoria","Elizabete Rejane Sodré Tavares","Outros Diretores"],
    ["Diretoria","Ivanor Antonio Duranti","Outros Diretores"],["Diretoria","Kalil Sehbe Neto","Outros Diretores"],
    ["Diretoria","Robson Oliveira Santos","Outros Diretores"],["Diretoria","Irany de Oliveira Sant'Anna Junior","Outros Diretores"],
    ["Diretoria/Conselho","Márcia Adriana Celestino","Outros Conselheiros / Diretores"],
    ["Conselho de Administração","Itanielson Dantas Silveira Cruz","Presidente do Conselho de Administração"],
    ["Conselho de Administração","Ramiro Silveira Severo","Conselho de Adm. Independente (Efetivo)"],
    ["Conselho de Administração","Jorge Luís Tonetto","Conselho de Administração (Efetivo)"],
    ["Conselho de Administração","Eduardo Cunha da Costa","Conselho de Administração (Efetivo)"],
    ["Conselho de Administração","Urbano Schmitt","Conselho de Adm. Independente (Efetivo)"],
    ["Conselho de Administração","Eduardo Junior de Matos Lewandowski","Conselho de Administração (Efetivo)"],
    ["Conselho de Administração","Julio Cesar Lopes Abrantes","Conselho de Adm. Independente (Efetivo)"],
    ["Conselho de Administração","Ricardo Englert","Conselho de Adm. Independente (Efetivo)"],
    ["Conselho Fiscal","Reginaldo Ferreira Alexandre","C.F.(Efetivo) Eleito p/preferencialistas"],
    ["Conselho Fiscal","Paulo Roberto Franceschi","C.F.(Suplente) Eleito p/preferencialistas"],
    ["Conselho Fiscal","Pricilla Maria Santana","C.F.(Efetivo) Eleito p/Controlador"],
    ["Conselho Fiscal","Pedro Maciel Capeluppi","C.F.(Efetivo) Eleito p/Controlador"],
    ["Conselho Fiscal","Micheli Tassiani Petry","C.F.(Suplente) Eleito p/Controlador"],
    ["Conselho Fiscal","Luís Antonio Zanotta Calçada","C.F.(Suplente) Eleito p/Controlador"],
    ["Conselho Fiscal","André Flores Coronel","C.F.(Efetivo) Eleito p/Minor.Ordinaristas"],
    ["Conselho Fiscal","Jonas Martins Machado","C.F.(Suplente) Eleito p/Minor.Ordinaristas"],
    ["Conselho Fiscal","Ranolfo Vieira Júnior","C.F.(Efetivo) Eleito p/Controlador"],
  ]],
  ["SC","CELESC","Centrais Elétricas de Santa Catarina S.A.",[
    ["Diretoria","Edson Moritz Martins da Silva","Diretor Presidente / Superintendente"],
    ["Diretoria","Pilar Sabino da Silva","Outros Diretores"],["Diretoria","Eloi Hoffelder","Outros Diretores"],
    ["Diretoria","Julio Cesar Pungan","Diretor Financeiro"],["Diretoria","Pedro Augusto Schmidt de Carvalho Júnior","Outros Diretores"],
    ["Diretoria","Claudio Varella do Nascimento","Outros Diretores"],["Diretoria","Wagner Felipe Vogel","Outros Diretores"],
    ["Diretoria","Lino Henrique Pedroni Junior","Outros Diretores"],["Diretoria","Moisés Diersmann","Outros Diretores"],
    ["Conselho de Administração","Glauco Jose Corte","Presidente do Conselho de Administração Independente"],
    ["Conselho de Administração","Marco Aurelio Quadros","Vice Presidente Cons. de Administração Independente"],
    ["Conselho de Administração","Paulo Guilherme de Simas Horn","Conselho de Administração (Efetivo)"],
    ["Conselho de Administração","Cesar Souza Junior","Conselho de Adm. Independente (Efetivo)"],
    ["Conselho de Administração","Fábio William Loreti","Conselho de Adm. Independente (Efetivo)"],
    ["Conselho de Administração","Jose Valerio Medeiros Junior","Conselho de Adm. Independente (Efetivo)"],
    ["Conselho de Administração","Romeu Donizete Rufino","Conselho de Adm. Independente (Efetivo)"],
    ["Conselho de Administração","Silvia Regina da Silva Marafon","Conselho de Adm. Independente (Efetivo)"],
    ["Conselho de Administração","Ivácio Pedro Felisbino Filho","Conselho de Administração (Efetivo)"],
    ["Conselho de Administração","Michel Nunes Itkes","Conselho de Adm. Independente (Efetivo)"],
    ["Conselho de Administração","Carlos Emanuel Baptista Andrade","Conselho de Adm. Independente (Efetivo)"],
    ["Conselho Fiscal","Fabiano de Souza","C.F.(Efetivo) Eleito p/Controlador"],
    ["Conselho Fiscal","Daniela Alves Carvalho Schmidt","C.F.(Suplente) Eleito p/Controlador"],
    ["Conselho Fiscal","Ilana Luiza Ferreira Marujo","C.F.(Suplente) Eleito p/Controlador"],
    ["Conselho Fiscal","Acácio Roboredo","C.F.(Efetivo) Eleito p/preferencialistas"],
    ["Conselho Fiscal","João Arthur Bastos Gasparino da Silva","C.F.(Suplente) Eleito p/preferencialistas"],
    ["Conselho Fiscal","Danieli Blanger Pinheiro","C.F.(Efetivo) Eleito p/Controlador"],
    ["Conselho Fiscal","Claudio Rocha","C.F.(Efetivo) Eleito p/Controlador"],
    ["Conselho Fiscal","Cléber dos Santos Lima","C.F.(Efetivo) Eleito p/Minor.Ordinaristas"],
    ["Conselho Fiscal","Deyse Cristina Locatelli Haviaras","C.F.(Suplente) Eleito p/Controlador"],
  ]],
  ["PR","Sanepar","Companhia de Saneamento do Paraná",[
    ["Diretoria","Wilson Bley Lipski","Diretor Presidente / Superintendente"],
    ["Diretoria","Melissa Ferreira","Outros Diretores"],["Diretoria","Sergio Wippel","Outros Diretores"],
    ["Diretoria","Fernando Mauro Nascimento Guedes","Outros Diretores"],["Diretoria","Leura Lucia Conte de Oliveira","Outros Diretores"],
    ["Diretoria","Anatalicio Risden Junior","Outros Diretores"],["Diretoria","Flavio Luis Coutinho Slivinski","Outros Diretores"],
    ["Diretoria","Marcos Domakoski","Outros Diretores"],["Diretoria","Robson Augusto Pascoalini","Outros Diretores"],
    ["Diretoria","Ozires Kloster","Diretor Financeiro / Diretor de Relações com Investidores"],
    ["Conselho de Administração","Demetrius Nichele Macei","Presidente do Conselho de Administração"],
    ["Conselho de Administração","João Biral Junior","Conselho de Adm. Independente (Efetivo)"],
    ["Conselho de Administração","Joisa Campanher Dutra Saraiva","Conselho de Adm. Independente (Efetivo)"],
    ["Conselho de Administração","Reginaldo Ferreira Alexandre","Conselho de Adm. Independente (Efetivo)"],
    ["Conselho de Administração","Eduardo Francisco Sciarra","Conselho de Adm. Independente (Efetivo)"],
    ["Conselho de Administração","Diane Agustini","Conselho de Administração (Efetivo)"],
    ["Conselho de Administração","Milton José Paizani","Conselho de Adm. Independente (Efetivo)"],
    ["Conselho de Administração","Rafael Lamastra Junior","Conselho de Adm. Independente (Efetivo)"],
    ["Conselho Fiscal","Denize Aparecida Cabulon Graça","C.F.(Efetivo) Eleito p/Controlador"],
    ["Conselho Fiscal","Alexandre Pedercini Issa","C.F.(Efetivo) Eleito p/Minor.Ordinaristas"],
    ["Conselho Fiscal","Roberval Vieira","C.F.(Efetivo) Eleito p/Controlador"],
    ["Conselho Fiscal","André Luís Rennó Guimarães","C.F.(Efetivo) Eleito p/preferencialistas"],
    ["Conselho Fiscal","Fabio Davidovici","C.F.(Suplente) Eleito p/preferencialistas"],
    ["Conselho Fiscal","Helena Maria Boschini Lemucch","C.F.(Efetivo) Eleito p/Controlador"],
    ["Conselho Fiscal","Kaio Gustavo Weihermann","C.F.(Suplente) Eleito p/Controlador"],
    ["Conselho Fiscal","Maycon Vieira da Silva","C.F.(Suplente) Eleito p/Controlador"],
    ["Conselho Fiscal","César Antonio Gaioto Soares","C.F.(Suplente) Eleito p/Controlador"],
    ["Conselho Fiscal","Genival Francisco da Silva","C.F.(Suplente) Eleito p/Minor.Ordinaristas"],
  ]],
  ["SC","CASAN","Companhia Catarinense de Águas e Saneamento",[
    ["Diretoria","Pedro Joel Horstmann","Diretor Presidente / Superintendente"],
    ["Diretoria","Carlos Ivan Sturzbecher","Diretor Financeiro / Diretor de Relações com Investidores"],
    ["Diretoria","Rosane Vettori","Outros Diretores"],["Diretoria","Leonardo Lacerda da Silva","Outros Diretores"],
    ["Conselho de Administração","Alfeu Luiz Abreu","Presidente do Conselho de Administração"],
    ["Conselho de Administração","Karla Celina Ghisi da Luz","Conselho de Administração (Efetivo)"],
    ["Conselho de Administração","Ivan Gabriel Coutinho","Conselho de Administração (Efetivo)"],
    ["Conselho de Administração","Jucélio João da Silva","Conselho de Administração (Efetivo)"],
    ["Conselho de Administração","Gerson Antônio Basso","Conselho de Administração (Efetivo)"],
    ["Conselho de Administração","Cintia de Castro Cardoso","Conselho de Administração (Efetivo)"],
    ["Conselho de Administração","Marlon Testoni Batisti","Conselho de Administração (Efetivo)"],
    ["Conselho de Administração","Irvando Luiz Zomer","Conselho de Administração (Efetivo)"],
    ["Conselho Fiscal","Fábio Wagner Pinto","Pres. C.F. Eleito p/Controlador"],
    ["Conselho Fiscal","Ricardo Euclides Grando","C.F.(Efetivo) Eleito p/Controlador"],
    ["Conselho Fiscal","Letícia Pedercini Issa","C.F.(Efetivo) Eleito p/Minor.Ordinaristas"],
    ["Conselho Fiscal","Fabiano Francisco Caitano","C.F.(Efetivo) Eleito p/Controlador"],
    ["Conselho Fiscal","Lisandro José Fendrich","C.F.(Suplente) Eleito p/Controlador"],
    ["Conselho Fiscal","Gabriela Soares Pedercini","C.F.(Suplente) Eleito p/preferencialistas"],
    ["Conselho Fiscal","Eduardo José de Souza","C.F.(Suplente) Eleito p/Minor.Ordinaristas"],
    ["Conselho Fiscal","Ludimar Silvério Ribeiro Junior","C.F.(Suplente) Eleito p/Controlador"],
    ["Conselho Fiscal","Deyse Cristina Locatelli Haviaras","C.F.(Suplente) Eleito p/Controlador"],
    ["Conselho Fiscal","Isabela Farah Costa","C.F.(Suplente) Eleito p/preferencialistas"],
  ]],
];

// --- páginas institucionais próprias: BDMG e Badesul (também sem salário individual) ---
const FONTE_BDMG = "bdmg.mg.gov.br/transparencia-governanca (página institucional)";
const BDMG = ["MG","BDMG","Banco de Desenvolvimento de Minas Gerais",[
  ["Conselho de Administração","Wagner Lenhart","Presidente"],["Conselho de Administração","Welerson Cavalieri","Vice-Presidente"],
  ["Conselho de Administração","Carolina de Oliveira Castro Baia Antunes","Conselheira"],
  ["Conselho de Administração","Daniel da Cunha Messias Roque","Conselheiro"],
  ["Conselho de Administração","Fernando Passalio de Avelar","Conselheiro"],
  ["Conselho de Administração","Gustavo Leipnitz Ene","Conselheiro"],
  ["Conselho de Administração","Larissa Wolochate Aracema Ladeira","Conselheira"],
  ["Conselho de Administração","Michele da Silva Gonsales Torres","Conselheira"],
  ["Conselho de Administração","Otávio Romagnolli Mendes","Conselheiro"],
  ["Diretoria Executiva","Gabriel Viégas Neto","Diretor-Presidente"],
  ["Diretoria Executiva","Antônio Claret de Oliveira Junior","Diretor Vice-Presidente"],
  ["Diretoria Executiva","Alexandre Navarro de Castro Barreto","Diretor-Executivo"],
  ["Diretoria Executiva","Sérgio Rodrigues Pimentel","Diretor-Executivo"],
  ["Diretoria Executiva","Rubens José Amaral de Brito","Diretor-Executivo"],
  ["Conselho Fiscal","Felippe Ferreira de Mello","Presidente (Efetivo)"],
  ["Conselho Fiscal","Carlos Alberto Arruda de Oliveira","Efetivo"],["Conselho Fiscal","Pedro Henrique Garzon Ribas","Efetivo"],
  ["Conselho Fiscal","Paulo Henrique Cotta Pacheco","Efetivo"],["Conselho Fiscal","Eduardo Quintanilha de Albuquerque","Efetivo"],
  ["Conselho Fiscal","Daniel Guimarães Medrado de Castro","Suplente"],["Conselho Fiscal","Luiz Angelo Coutinho Gonçalves","Suplente"],
  ["Conselho Fiscal","Célio Benício Siqueira Filho","Suplente"],["Conselho Fiscal","Marcos Amaral Castro","Suplente"],
  ["Conselho Fiscal","Luciana Machado Teixeira","Suplente"],
]];

const FONTE_BADESUL = "badesul.com.br/administracao-e-orgaos-auxiliares (página institucional)";
const BADESUL = ["RS","Badesul","Badesul Desenvolvimento S.A. - Agência de Fomento/RS",[
  ["Diretoria","Robson Diego Ferreira","Presidente e Diretor Financeiro e CRO"],
  ["Diretoria","Flavio Luiz Lammel","Vice-Presidente e Diretor de Operações Privadas e Setor Público"],
  ["Diretoria","Átilo da Luz Escobar","Diretor Administrativo e Jurídico"],
  ["Diretoria","Elias Graziottin Rigon","Diretor de Inovação e Mercado"],
  ["Conselho de Administração","Ricardo Englert","Presidente"],["Conselho de Administração","Jeanette Halmenschlager Lontra","Vice-Presidente"],
  ["Conselho de Administração","Claudio Leite Gastal","Conselheiro"],["Conselho de Administração","Ernani José Althaus","Conselheiro"],
  ["Conselho de Administração","Hermenegildo Fração Junior","Conselheiro"],["Conselho de Administração","Jorge Steyer","Conselheiro"],
  ["Conselho de Administração","Juliano Balestrin","Conselheiro"],["Conselho de Administração","Luís Antônio Jesus de Carvalho","Conselheiro"],
  ["Conselho de Administração","Luiz Fernando Rodriguez Junior","Conselheiro"],
  ["Conselho Fiscal","Márcia Cristina Lima da Cruz Mendes","Presidente"],
  ["Conselho Fiscal","Alexandre Bruno Arrais Durans","Vice-presidente"],["Conselho Fiscal","João Jacob Seibel","Membro"],
]];

const TODOS = [...CVM.map((x) => [...x, FONTE_CVM]), [...BDMG, FONTE_BDMG], [...BADESUL, FONTE_BADESUL]];
for (const [uf, sigla, nome, membros, fonte] of TODOS) {
  for (const [orgao, pessoa, cargo] of membros) {
    const hash = crypto.createHash("sha256").update(`${uf}|${sigla}|${orgao}|${pessoa}|${cargo}`).digest("hex");
    await q(`insert into membros_estatais_estaduais (uf,empresa_sigla,empresa_nome,orgao,cargo_especifico,nome,fonte,referencia,_hash)
      values ($1,$2,$3,$4,$5,$6,$7,'2025-2026',$8) on conflict (_hash) do nothing`,
      [uf, sigla, nome, orgao, cargo, pessoa, fonte, hash]);
  }
}

// --- completa CIDASC/COHAB-SC (conselhos que faltavam) ---
const SC_EXTRA = [
  { empresa_sigla: "CIDASC", cargo: "Conselheiro de Administração", nome: "Matheus Cristiano", bruto: 1589.33 },
  { empresa_sigla: "CIDASC", cargo: "Conselheiro Fiscal", nome: "Jonas Pereira do Espirito Santo", bruto: 1589.33 },
  { empresa_sigla: "CIDASC", cargo: "Conselheiro de Administração", nome: "Lucas Adriano Luiz", bruto: 1589.33 },
  { empresa_sigla: "CIDASC", cargo: "Conselheiro Fiscal", nome: "Decio Alfredo Rockenbach", bruto: 1589.33 },
  { empresa_sigla: "CIDASC", cargo: "Conselheiro de Administração", nome: "Admir Edi Dalla Cort", bruto: 1589.33 },
  { empresa_sigla: "CIDASC", cargo: "Conselheiro Fiscal", nome: "Emerson Martins", bruto: 1589.33 },
  { empresa_sigla: "CIDASC", cargo: "Conselheiro de Administração", nome: "Bruna Regina Gonzaga Brito", bruto: 1589.33 },
  { empresa_sigla: "COHAB-SC", cargo: "Conselho Fiscal", nome: "Welliton Saulo da Costa", bruto: 1307.68 },
  { empresa_sigla: "COHAB-SC", cargo: "Conselho Fiscal", nome: "Jose Gaspar Rubick Junior", bruto: 1307.68 },
  { empresa_sigla: "COHAB-SC", cargo: "Conselho Fiscal", nome: "Jose Luiz Bernardini", bruto: 1307.68 },
].map((r) => ({ ...r, empresa_nome: r.empresa_sigla === "CIDASC" ? "Companhia Integrada de Desenvolvimento Agrícola de Santa Catarina" : "Companhia de Habitação do Estado de Santa Catarina",
  competencia: "2026-07", fonte: "dados.sc.gov.br/dataset/remuneracaoservidores (servidores-ativos-2026-07.csv)" }));

for (const r of SC_EXTRA) {
  const hash = crypto.createHash("sha256").update(`${r.empresa_sigla}|${r.cargo}|${r.nome}|${r.competencia}`).digest("hex");
  await q(`insert into remuneracao_dirigentes_estatais_sc_individual
    (empresa_sigla,empresa_nome,cargo,nome,salario_bruto,competencia,fonte,_hash)
    values ($1,$2,$3,$4,$5,$6,$7,$8) on conflict (_hash) do nothing`,
    [r.empresa_sigla, r.empresa_nome, r.cargo, r.nome, r.bruto, r.competencia, r.fonte, hash]);
}

// --- completa Fomento Paraná (os outros 5 diretores) ---
const PR_EXTRA = [
  { cargo: "Diretora Jurídica", nome: "Tatiany Zanatta Salvador Fogaça", proventos: 37036.48, descontos: 10198.45, liquido: 26838.03 },
  { cargo: "Diretora Administrativa e Financeira", nome: "Maria Eugenia Grau Bassas", proventos: 37036.48, descontos: 10384.67, liquido: 26651.81 },
  { cargo: "Diretor de Operações do Setor Público", nome: "Claudio Luiz Pacheco", proventos: 37036.48, descontos: 10217.86, liquido: 26818.62 },
  { cargo: "Diretor de Mercado", nome: "Gustavo Emanuel Cejas", proventos: 37036.48, descontos: 10712.83, liquido: 26323.65 },
].map((r) => ({ ...r, empresa_sigla: "AFPR", empresa_nome: "Agência de Fomento do Paraná S/A (Fomento Paraná)",
  competencia: "2026-06", fonte: "fomento.pr.gov.br/Pagina/Transparencia/Pessoal (remunera_colaboradores_2026_junho.xlsx)", observacao: null }));

for (const r of PR_EXTRA) {
  const hash = crypto.createHash("sha256").update(`${r.empresa_sigla}|${r.cargo}|${r.nome}|${r.competencia}`).digest("hex");
  await q(`insert into remuneracao_dirigentes_estatais_pr_individual
    (empresa_sigla,empresa_nome,cargo,nome,proventos,descontos,liquido,competencia,fonte,observacao,_hash)
    values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) on conflict (_hash) do nothing`,
    [r.empresa_sigla, r.empresa_nome, r.cargo, r.nome, r.proventos, r.descontos, r.liquido, r.competencia, r.fonte, r.observacao, hash]);
}
// nota: Miécio Ávila Tezelli (Diretor de Operações do Setor Privado) é o 6º diretor citado no site institucional,
// mas não foi encontrado na folha de junho/2026 (pode ter entrado depois do fechamento da folha, ou nome grafado
// diferente) — fica como pendência, não inventei valor.

const { rows: r1 } = await q(`select uf, empresa_sigla, orgao, count(*) from membros_estatais_estaduais group by 1,2,3 order by 1,2,3`);
console.table(r1);
const { rows: r2 } = await q(`select count(*) total from membros_estatais_estaduais`);
console.log("total de membros cadastrados:", r2[0].total);
await db.end();
