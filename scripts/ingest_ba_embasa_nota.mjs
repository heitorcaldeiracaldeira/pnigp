import { pool, withRetry } from "./_cadprev.mjs";

const db = pool();
const q = withRetry(db);

await q(`update remuneracao_dirigentes_estatais_ba_individual
  set observacao = observacao || ' | Demonstrações Financeiras auditadas 2025 (embasa.ba.gov.br) mencionam total anual de R$4,8 a R$5 milhões para pessoal-chave da administração (Conselho+Diretoria+Fiscal combinados), Nota Explicativa sobre partes relacionadas — valor agregado, não individualizado por cargo.'
  where empresa_sigla = 'EMBASA'`);

const r = await q(`select empresa_sigla, observacao from remuneracao_dirigentes_estatais_ba_individual where empresa_sigla='EMBASA'`);
console.log(JSON.stringify(r.rows, null, 2));
await db.end();
