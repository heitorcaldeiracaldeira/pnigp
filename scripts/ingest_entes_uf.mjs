// ETL — carrega os ENTES (municípios + governo estadual) de qualquer UF na tabela entes_sc.
// Fonte: IBGE (localidades + população estimada). Pré-requisito para coletar um novo estado.
// Uso: UF=PR node scripts/ingest_entes_uf.mjs
import fs from "fs"; import path from "path"; import { fileURLToPath } from "url"; import pg from "pg";
import { SG_UF, COD_ESTADO, NOME_ESTADO } from "./_uf.mjs";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATABASE_URL = fs.readFileSync(path.join(__dirname, "..", ".env.local"), "utf8").match(/^DATABASE_URL=(.+)$/m)[1].trim();
const sleep = (ms) => new Promise((s) => setTimeout(s, ms));
const get = async (u) => { for (let t = 0; t < 4; t++) { try { const r = await fetch(u, { signal: AbortSignal.timeout(40000) }); if (r.ok) return await r.json(); } catch {} await sleep(1500 * (t + 1)); } return null; };

async function main() {
  const db = new pg.Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 2 });
  db.on("error", () => {});
  await db.query(`CREATE TABLE IF NOT EXISTS entes_sc (cod_ibge TEXT PRIMARY KEY, nome TEXT, uf TEXT, tipo TEXT, populacao BIGINT, pop_indigena BIGINT)`);
  await db.query(`ALTER TABLE entes_sc ADD COLUMN IF NOT EXISTS uf TEXT`);

  const muns = await get(`https://servicodados.ibge.gov.br/api/v1/localidades/estados/${COD_ESTADO}/municipios`);
  if (!muns) { console.error("falha IBGE localidades"); process.exit(1); }
  // população estimada mais recente (agregado 6579, variável 9324) — todos os municípios
  const popJson = await get(`https://servicodados.ibge.gov.br/api/v3/agregados/6579/periodos/-1/variaveis/9324?localidades=N6[all]`);
  const popMap = new Map();
  try { for (const s of popJson[0].resultados[0].series) { const v = Object.values(s.serie)[0]; popMap.set(String(s.localidade.id), Number(v) || 0); } } catch {}

  let n = 0, somaPop = 0;
  for (const m of muns) {
    const cod = String(m.id); const pop = popMap.get(cod) || 0; somaPop += pop;
    await db.query(`INSERT INTO entes_sc (cod_ibge,nome,uf,tipo,populacao) VALUES ($1,$2,$3,'M',$4)
                    ON CONFLICT (cod_ibge) DO UPDATE SET nome=EXCLUDED.nome, uf=EXCLUDED.uf, tipo='M', populacao=EXCLUDED.populacao`,
      [cod, m.nome, SG_UF, pop]);
    n++;
  }
  // governo estadual
  await db.query(`INSERT INTO entes_sc (cod_ibge,nome,uf,tipo,populacao) VALUES ($1,$2,$3,'E',$4)
                  ON CONFLICT (cod_ibge) DO UPDATE SET nome=EXCLUDED.nome, uf=EXCLUDED.uf, tipo='E', populacao=EXCLUDED.populacao`,
    [COD_ESTADO, `Estado de ${NOME_ESTADO}`, SG_UF, somaPop]);
  console.log(`Entes ${SG_UF}: ${n} municípios + Estado (${COD_ESTADO}) · pop total ${somaPop.toLocaleString("pt-BR")}`);
  await db.end();
}
main().catch((e) => { console.error("ERRO:", e); process.exit(1); });
