// Sincroniza a PÁGINA DE COLETA (/etl) com a realidade do banco: conta registros reais por fonte,
// reflete progresso ao vivo do harvest (processos/itens) e atualiza etl_catalogo (msg/max_ano/ultima_exec).
// Não dispara coleta — só mantém o painel verdadeiro. node scripts/etl_pagina_sync.mjs
import fs from "fs"; import path from "path"; import { fileURLToPath } from "url"; import pg from "pg";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATABASE_URL = fs.readFileSync(path.join(__dirname, "..", ".env.local"), "utf8").match(/^DATABASE_URL=(.+)$/m)[1].trim();
// fonte -> { tabela, coluna de ano (opcional) }
const M = {
  financas: ["financas_sc", "ano"], metas: ["metas_fiscais_sc", "ano"], rreo_const: ["rreo_const_sc", "ano"], rgf: ["rgf_sc", "ano"],
  rpps: ["rpps_sc", "ano"], rpps_atuarial: ["rpps_atuarial_sc", "exercicio"], siops: ["siops_sc", "ano"], compras: ["compras_sc", "ano"],
  contratos: ["contratos_sc", "ano"], pca: ["pca_sc", "ano"], processos: ["processos_sc", "ano"], itens: ["itens_sc", "ano"],
  indicadores: ["indicadores_sc", null], transferencias: ["transferencias_sc", null], cnes: ["cnes_sc", null],
  sih: ["saude_producao_sc", "ano"], sia: ["saude_producao_sc", "ano"], previne: ["previne_sc", null], indigena: ["entes_sc", null],
  fns: ["fns_repasse_sc", "ano"], cnpj_loc: ["cnpj_loc", null], empenhos: ["empenhos_check", null], atas: ["atas_sc", "ano_ata"],
  nf: ["nf_sc", "ano"], cauc: ["cauc_sc", null],
};

async function main() {
  const db = new pg.Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 1 });
  db.on("error", () => {});
  const num1 = async (sql) => { try { return Number((await db.query(sql)).rows[0]?.n) || 0; } catch { return 0; } };
  for (const [id, [tab, anoCol]] of Object.entries(M)) {
    const n = await num1(`SELECT count(*) n FROM ${tab}`);
    const maxAno = anoCol ? await num1(`SELECT max(${anoCol}) n FROM ${tab}`) : null;
    let msg = `${n.toLocaleString("pt-BR")} registros`;
    // progresso ao vivo do harvest do PNCP
    if (id === "processos") { const c = await num1(`SELECT count(*) n FROM processos_feitos`); msg = `${n.toLocaleString("pt-BR")} processos · ${c}/78 combos`; }
    if (id === "itens") { const f = await num1(`SELECT count(*) n FROM itens_proc_feitos`); const p = await num1(`SELECT count(*) n FROM processos_sc`); const h = await num1(`SELECT count(*) n FROM itens_sc WHERE unit_homologado IS NOT NULL`); msg = `${n.toLocaleString("pt-BR")} itens (${h.toLocaleString("pt-BR")} c/ preço) · ${p ? Math.round((f / p) * 100) : 0}% dos processos`; }
    if (n === 0) continue;
    await db.query(
      `UPDATE etl_catalogo SET max_ano=$2, msg=$3, ultimo_status=COALESCE(ultimo_status,'ok'), ultima_exec=COALESCE(ultima_exec, now()), atualizado_em=now() WHERE id=$1`,
      [id, maxAno, msg]
    ).catch(() => {});
  }
  console.log("Página de coleta sincronizada com o banco.");
  await db.end();
}
main().catch((e) => { console.error("ERRO:", e); process.exit(1); });
