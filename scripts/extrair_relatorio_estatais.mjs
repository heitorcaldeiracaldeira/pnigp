import { pool, withRetry } from "./_cadprev.mjs";
import fs from "fs";

const db = pool();
const q = withRetry(db);

const UF_NOME = {AC:"Acre",AL:"Alagoas",AM:"Amazonas",AP:"Amapá",BA:"Bahia",CE:"Ceará",DF:"Distrito Federal",
ES:"Espírito Santo",GO:"Goiás",MA:"Maranhão",MG:"Minas Gerais",MS:"Mato Grosso do Sul",MT:"Mato Grosso",
PA:"Pará",PB:"Paraíba",PE:"Pernambuco",PI:"Piauí",PR:"Paraná",RJ:"Rio de Janeiro",RN:"Rio Grande do Norte",
RO:"Rondônia",RR:"Roraima",RS:"Rio Grande do Sul",SC:"Santa Catarina",SE:"Sergipe",SP:"São Paulo",TO:"Tocantins"};

const individualTables = ["ac","al","am","ap","ba","ce","df","es","go","ma","mg","ms","mt","pa","pb","pe","pi","pr","rn","ro","rr","sc","se","to"];
let rows = [];

for (const uf of individualTables) {
  const table = `remuneracao_dirigentes_estatais_${uf}_individual`;
  const cols = await q(`select column_name from information_schema.columns where table_name=$1`, [table]);
  const colNames = cols.rows.map(r => r.column_name);
  if (colNames.length === 0) continue;
  const valorCol = ["valor","salario_bruto","remuneracao_bruta","proventos","remuneracao_basica","total_vantagens"].find(c => colNames.includes(c));
  const liqCol = ["salario_liquido","remuneracao_liquida","liquido"].find(c => colNames.includes(c));
  const obsCol = colNames.includes("observacao") ? "observacao" : null;
  const selectCols = ["empresa_sigla","empresa_nome","cargo","nome", valorCol ? valorCol+" as valor" : "null as valor",
    liqCol ? liqCol+" as liquido" : "null as liquido", "fonte", obsCol ? obsCol : "null as observacao"].join(",");
  const r = await q(`select ${selectCols} from ${table}`);
  for (const row of r.rows) {
    rows.push({ uf: uf.toUpperCase(), uf_nome: UF_NOME[uf.toUpperCase()], ...row, origem: "individual" });
  }
}

// RJ, SP (schemas próprios)
{
  const r = await q(`select empresa_sigla, empresa_nome, cargo, nome, total_vantagens as valor, valor_liquido as liquido, fonte, ano_ref, mes_ref from remuneracao_dirigentes_estatais_rj`);
  for (const row of r.rows) rows.push({ uf: "RJ", uf_nome: "Rio de Janeiro", ...row, observacao: null, origem: "rj" });
}
{
  const r = await q(`select empresa_sigla, empresa_nome, cargo, nome, remuneracao_bruta as valor, remuneracao_liquida as liquido, fonte, mes_ano from remuneracao_dirigentes_estatais_sp`);
  for (const row of r.rows) rows.push({ uf: "SP", uf_nome: "São Paulo", ...row, observacao: null, origem: "sp" });
}

// CVM agregado (remuneracao_dirigentes_estatais_estaduais) - só linhas com ceo_nome preenchido, valor médio anual /12
{
  const r = await q(`select uf, empresa_sigla, empresa_nome, orgao_administracao, valor_medio_anual, ceo_nome, ceo_cargo, exercicio_referencia, fonte from remuneracao_dirigentes_estatais_estaduais where ceo_nome is not null`);
  for (const row of r.rows) {
    rows.push({
      uf: row.uf, uf_nome: UF_NOME[row.uf], empresa_sigla: row.empresa_sigla, empresa_nome: row.empresa_nome,
      cargo: row.ceo_cargo, nome: row.ceo_nome,
      valor: row.valor_medio_anual ? (row.valor_medio_anual/12).toFixed(2) : null,
      liquido: null, fonte: row.fonte, observacao: `Valor médio mensal calculado a partir do agregado CVM anual (${row.orgao_administracao}, ${row.exercicio_referencia})`,
      origem: "cvm"
    });
  }
}

// MG tem schema próprio (remuneracao_basica, matricula, mes_referencia)
{
  const r = await q(`select empresa_sigla, empresa_nome, cargo, nome, remuneracao_basica as valor, fonte, mes_referencia from remuneracao_dirigentes_estatais_mg_individual`);
  for (const row of r.rows) {
    const existing = rows.find(x => x.uf==='MG' && x.nome===row.nome && x.empresa_sigla===row.empresa_sigla);
    if (!existing) rows.push({ uf: "MG", uf_nome: "Minas Gerais", ...row, liquido:null, observacao: row.mes_referencia, origem: "mg" });
  }
}

await db.end();

// dedup by uf+empresa_sigla+nome
const seen = new Set();
rows = rows.filter(r => {
  const key = `${r.uf}|${r.empresa_sigla}|${r.nome}`;
  if (seen.has(key)) return false;
  seen.add(key);
  return true;
});

// normalizar valor pra número
for (const r of rows) {
  r.valor_num = r.valor ? parseFloat(r.valor) : null;
}

const ufsComDados = [...new Set(rows.map(r => r.uf))].sort();
const comValor = rows.filter(r => r.valor_num && r.valor_num > 0);
const semValor = rows.filter(r => !r.valor_num || r.valor_num <= 0);

const resumoPorUf = {};
for (const uf of ufsComDados) {
  const doUf = rows.filter(r => r.uf === uf);
  resumoPorUf[uf] = {
    uf_nome: UF_NOME[uf] || uf,
    total_empresas: doUf.length,
    com_valor: doUf.filter(r => r.valor_num > 0).length,
  };
}

const isPresidente = (cargo) => /presid/i.test(cargo || "");
const presidentesComValor = comValor.filter(r => isPresidente(r.cargo) && r.valor_num < 500000); // exclui CODEMGE (periodo ambiguo, nao mensal)
const top20 = [...presidentesComValor].sort((a,b) => b.valor_num - a.valor_num).slice(0, 20);

const out = {
  gerado_em: new Date().toISOString(),
  total_linhas: rows.length,
  total_ufs: ufsComDados.length,
  total_com_valor: comValor.length,
  total_sem_valor: semValor.length,
  resumo_por_uf: resumoPorUf,
  top25: top20,
  todos: rows.sort((a,b) => a.uf.localeCompare(b.uf) || (a.empresa_sigla||"").localeCompare(b.empresa_sigla||"")),
};

fs.writeFileSync("C:\\Users\\PC\\AppData\\Local\\Temp\\claude\\C--Users-PC\\ab8427a5-adc4-4a46-928f-f8b9e497905b\\scratchpad\\relatorio_estatais.json", JSON.stringify(out, null, 2));
console.log("Total linhas:", rows.length, "| UFs:", ufsComDados.length, "| com valor:", comValor.length);
console.log("Top 10 por valor:");
console.table(top20.slice(0,10).map(r => ({uf:r.uf, sigla:r.empresa_sigla, nome:r.nome, valor:r.valor_num})));
