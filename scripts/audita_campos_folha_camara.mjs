// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
// audita_campos_folha_camara.mjs — onde a camada de câmara AINDA está cega: por fonte, o que ela informa e o que
// falta para identificar a pessoa.
//
// POR QUÊ (pedido do Heitor, 21/ago/2026): *"traga todos os dados, mesmo que precise fazer recoleta"*. Antes de
// recoletar é preciso saber ONDE falta — e distinguir três coisas que parecem a mesma:
//   1. a fonte NÃO publica o campo            → nada a fazer, é limite da fonte
//   2. a fonte publica e o coletor DESCARTA   → recoleta resolve (foi o caso do Betha: admissão, situação, tipo)
//   3. a coluna existe e está sempre NULA     → o coletor tem o campo e nunca preencheu (defeito silencioso)
//
// O relatório separa (3) de (1): coluna existente e 100% nula é suspeita de defeito, não de limite da fonte.
//
// Uso: node scripts/audita_campos_folha_camara.mjs
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
import { pool, withRetry } from "./_cadprev.mjs";
import { MAPA_IDENT } from "./_folha_contrato.mjs";

const db = pool();
const q = withRetry(db);

const fontes = (await q(`select fonte, count(*)::int linhas, count(distinct cod_ibge)::int municipios
  from vw_folha_camara_brasil group by 1 order by 2 desc`)).rows;

const linhas = [];
for (const f of fontes) {
  const t = `folha_servidores_${f.fonte}`;
  const cols = new Set((await q(`select column_name n from information_schema.columns where table_name=$1`, [t])).rows.map((r) => r.n));
  if (!cols.size) { linhas.push({ fonte: f.fonte, municipios: f.municipios, situacao: "bloco próprio (view)" }); continue; }
  const estado = {};
  for (const [alvo, candidatas] of Object.entries(MAPA_IDENT)) {
    const c = candidatas.find((x) => cols.has(x));
    if (!c) { estado[alvo] = "sem coluna"; continue; }
    const r = (await q(`select count(*) filter (where ${c} is not null and ${c}::text <> '')::int cheio, count(*)::int n from ${t}`)).rows[0];
    estado[alvo] = r.cheio === 0 ? "🚨 coluna VAZIA" : `${Math.round(100 * r.cheio / Math.max(r.n, 1))}%`;
  }
  linhas.push({ fonte: f.fonte, municipios: f.municipios, cpf: estado.cpf_masc, matricula: estado.matricula,
                admissao: estado.data_admissao, carga: estado.carga_horaria });
}
console.table(linhas.slice(0, 40));

const semCpf = linhas.filter((l) => l.cpf === "sem coluna").length;
const vazias = linhas.filter((l) => Object.values(l).includes("🚨 coluna VAZIA"));
console.log(`\n${semCpf} fontes sem NENHUMA coluna de CPF — nelas a chave de pessoa é matrícula+entidade ou só o nome.`);
if (vazias.length) {
  console.log(`🚨 ${vazias.length} fontes com coluna existente e 100% VAZIA (suspeita de defeito do coletor, não da fonte):`);
  console.table(vazias);
}
await db.end();
