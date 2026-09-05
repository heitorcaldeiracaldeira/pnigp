// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
// ingest_remuneracao_estatais_mt_completa.mjs — Mato Grosso, segunda rodada: resolve as 5 pendências abertas no
// primeiro passe (MTI, EMPAER, METAMAT, CEASA/MT, DESENVOLVE MT).
//
// MTI: Cleberson Antonio Sávio Gomes, Diretor-Presidente — mti.mt.gov.br/diretoria-executiva.
// EMPAER: criada em 1992 como sociedade de economia mista, TRANSFORMADA LEGALMENTE em empresa pública (continua
// dentro do escopo do projeto — empresa pública também conta) — Diretor-Presidente Suelme Evangelista Fernandes,
// empaer.mt.gov.br/diretoria.
// DESENVOLVE MT (Agência de Fomento do Estado de Mato Grosso): Diretor Presidente Rodrigo Ribeiro Verão,
// desenvolve.mt.gov.br/institucional/diretoriaexecutiva.
//
// METAMAT: CONFIRMADO EM LIQUIDAÇÃO — decisão de extinção tomada em novembro/2024, processo em andamento (Diário
// Oficial de MT de 25/08/2026 já cita "O LIQUIDANTE DA METAMAT"). Não é mais uma estatal ativa com dirigente —
// move para estatais_extintas, sai da lista de pendências.
//
// CEASA/MT: CONFIRMADO QUE NÃO EXISTE — Mato Grosso não tem uma central de abastecimento estadual nos moldes de
// outros estados; o mercado atacadista de Cuiabá opera de forma privada/municipal. Não é falha de busca, é
// ausência real — sai da lista de pendências (não é estatal).
//
// node scripts/ingest_remuneracao_estatais_mt_completa.mjs
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
import crypto from "crypto";
import { pool, withRetry } from "./_cadprev.mjs";

const db = pool();
const q = withRetry(db);

const REGS = [
  { sigla: "MTI", nome_empresa: "Empresa Mato-grossense de Tecnologia da Informação", cargo: "Diretor Presidente",
    nome: "Cleberson Antonio Sávio Gomes", fonte: "mti.mt.gov.br/diretoria-executiva",
    obs: "funcionário de carreira da MTI (antiga Cepromat), concursado desde 1998" },
  { sigla: "EMPAER", nome_empresa: "Empresa Mato-grossense de Pesquisa, Assistência e Extensão Rural", cargo: "Diretor-Presidente",
    nome: "Suelme Evangelista Fernandes", fonte: "empaer.mt.gov.br/diretoria",
    obs: "criada em 1992 como sociedade de economia mista, hoje juridicamente EMPRESA PÚBLICA (não é mais economia mista, mas continua no escopo do projeto)" },
  { sigla: "DESENVOLVE MT", nome_empresa: "Agência de Fomento do Estado de Mato Grosso S.A.", cargo: "Diretor Presidente",
    nome: "Rodrigo Ribeiro Verão", fonte: "desenvolve.mt.gov.br/institucional/diretoriaexecutiva", obs: null },
].map((r) => ({ ...r, valor: null, competencia: null }));

for (const r of REGS) {
  const hash = crypto.createHash("sha256").update(`MT|${r.sigla}|${r.cargo}|${r.nome}`).digest("hex");
  await q(`insert into remuneracao_dirigentes_estatais_mt_individual
    (empresa_sigla,empresa_nome,cargo,nome,valor,competencia,fonte,observacao,_hash)
    values ($1,$2,$3,$4,$5,$6,$7,$8,$9) on conflict (_hash) do nothing`,
    [r.sigla, r.nome_empresa, r.cargo, r.nome, r.valor, r.competencia, r.fonte, r.obs, hash]);
}

{
  const hash = crypto.createHash("sha256").update("MT|METAMAT|em_liquidacao_nov2024").digest("hex");
  await q(`insert into estatais_extintas (uf,sigla,nome,ano_extincao,destino,fonte,_hash) values
    ('MT','METAMAT','Companhia Mato-grossense de Mineração',2024,
     'decisão de extinção tomada em novembro/2024; processo de liquidação em andamento — Diário Oficial de MT (25/08/2026) já cita "O LIQUIDANTE DA METAMAT"; atribuições passaram para a Secretaria de Estado',
     'Diário Oficial de MT (25/08/2026) + Estadão MT + FOLHAMAX', $1) on conflict (_hash) do nothing`, [hash]);
}

await q(`delete from estatais_pendencias where uf='MT' and empresa_sigla in ('MTI','EMPAER','DESENVOLVE MT','METAMAT')`);
await q(`update estatais_pendencias set motivo='confirmado_inexistente', detalhe='Mato Grosso não tem central de abastecimento estadual nos moldes de outros estados — mercado atacadista de Cuiabá opera de forma privada/municipal; não é falha de busca' where uf='MT' and empresa_sigla='CEASA/MT'`);

console.log("=== Mato Grosso — completo ===");
console.table((await q(`select empresa_sigla, nome, observacao from remuneracao_dirigentes_estatais_mt_individual order by empresa_sigla`)).rows);
console.log("=== Mato Grosso — pendências restantes ===");
console.table((await q(`select empresa_sigla, motivo from estatais_pendencias where uf='MT'`)).rows);
await db.end();
