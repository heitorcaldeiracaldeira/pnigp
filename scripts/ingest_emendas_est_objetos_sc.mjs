// ETL — Catálogo REAL de objetos de emendas parlamentares ESTADUAIS de SC (ano 2026), do Power BI da SEF.
// Cada objeto (finalidade real de uma emenda) + valor, classificado por área. Fonte: querydata (Objeto Final, Ano=2026).
// Entrada: pbi_obj.txt. node scripts/ingest_emendas_est_objetos_sc.mjs
import fs from "fs"; import pg from "pg";
const DATABASE_URL = fs.readFileSync("C:/Users/PC/pnigp/.env.local", "utf8").match(/^DATABASE_URL=(.+)$/m)[1].trim();
const SRC = process.env.SRC || "C:/Users/PC/AppData/Local/Temp/claude/C--Users-PC/ba9cc77b-9f1b-4cbc-90a2-e9a04839ff68/scratchpad/pbi_obj.txt";

function parseDSR(raw) {
  let o = JSON.parse(raw); if (typeof o === "string") o = JSON.parse(o);
  const ds = o.results[0].result.data.dsr.DS[0]; const dicts = ds.ValueDicts || {}; const dm = ds.PH[0].DM0;
  const schema = dm[0].S; const nCol = schema.length; const rows = []; let prev = new Array(nCol).fill(null);
  for (const r of dm) { const R = r.R || 0, O = r["Ø"] || 0, C = r.C || []; const f = new Array(nCol); let ci = 0;
    for (let i = 0; i < nCol; i++) { if (O & (1 << i)) f[i] = null; else if (R & (1 << i)) f[i] = prev[i]; else { let v = C[ci++]; const dn = schema[i].DN; if (dn && typeof v === "number" && dicts[dn]) v = dicts[dn][v]; f[i] = v; } }
    prev = f; rows.push(f); }
  return rows;
}
// classificador por palavra-chave — remove ACENTOS antes (senão "Polícia"/"Saúde" não batem) e ordena por especificidade.
function area(t) {
  const s = String(t || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase();
  if (/CBMSC|BOMBEIR|POLIC|\bPM\b|VIATURA|SEGURANC|GUARDA MUNICIPAL|PENITENC|PRISION|DELEGACIA|GUARNICAO|DEFESA CIVIL|BRIGADA/.test(s)) return "seguranca";
  if (/ESCOLA|CRECHE|EDUCAC|ENSINO|\bALUNO|PROFESSOR|MERENDA|UNIVERSIDAD|EDUCACIONAL|\bCMEI\b|PROINFANCIA|BIBLIOTECA ESCOLAR|APRENDIZAG/.test(s)) return "educacao";
  if (/\bSAMU\b|\bUBS\b|SAUDE|ULTRASSOM|AMBULANCIA|HOSPITAL|MEDIC|ODONTO|FARMAC|CLINIC|POSTO DE SAUDE|EXAME|CIRURG|FISIOTERAP|\bSUS\b|\bUTI\b|TERAPIA INTENSIVA|ENFERMAGEM|VACINA|\bLEITO|\bAMA\b|MAMOGRAF|RAIO-X|RAIO X|ODONTOLOG/.test(s)) return "saude";
  if (/\bCRAS\b|\bCREAS\b|ASSISTENC|\bIDOSO|CRIANC|\bAPAE\b|ACOLHIMENTO|VULNERAB|SOCIOASSIST|TERCEIRA IDADE|ABRIGO|ENTIDADE|INSTITUICAO|FILANTROP|BENEFICENTE|BETHESDA|BOM PASTOR|\bLAR\b|APAMI|PESSOA COM DEFICIENCIA/.test(s)) return "assistencia";
  if (/AGRICULT|\bRURAL\b|TRATOR|AGRICOL|PRODUTOR|\bPESCA|PATRULHA|MECANIZ|EPAGRI|CIDASC|AVICOLA|PECUAR|SILAGEM|ESTRADA(S)? GERA|ESTRADA(S)? DO INTERIOR/.test(s)) return "agricultura";
  if (/ESPORT|QUADRA|GINASIO|ATLETA|CAMPO DE FUTEBOL|\bPISTA\b|GINASTICA|SKATE|PLAYGROUND|ACADEMIA (AO AR|DA)|LAZER|CAMPO SOCIETY/.test(s)) return "esporte";
  if (/CULTURA|MUSEU|FESTIVAL|TEATRO|BIBLIOTEC|PATRIMONIO|TURISM|\bEVENTO|CARNAVAL|BANDA|MUSIC|\bFESTA|FANFARRA|CENTRO CULTURAL/.test(s)) return "cultura";
  if (/PAVIMENT|ASFALT|ESTRADA|\bPONTE|DRENAGEM|SANEAMENTO|\bAGUA\b|ESGOTO|ILUMINAC|CALCAMENT|RECAPE|MOBILIDADE|VIACAO|\bOBRA|REFORMA|CONSTRU|INFRAESTRUTURA|INFRA-ESTRUTURA|VIARIO|RODOVI|CAMINHAO|PATROLA|\bMAQUINA|RETROESCAVAD|PASSARELA|ROTATORIA|PARQUE LINEAR|REVITALIZAC|CACAMBA|PIPA|MOTONIVELAD|MELHORIAS NA INFRA|SISTEMA VIARIO|GALPAO|PRACA|MURO|CALCADA|MEIO-FIO/.test(s)) return "infraestrutura";
  if (/HABITAC|MORADIA|CASA POPULAR|URBANIZAC|LOTEAMENTO|REGULARIZACAO FUNDIARIA|UNIDADE HABITAC/.test(s)) return "habitacao";
  return "outros";
}

async function main() {
  const rows = parseDSR(fs.readFileSync(SRC, "utf8")).filter((r) => r[0]);
  const db = new pg.Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 2 });
  db.on("error", () => {});
  await db.query(`CREATE TABLE IF NOT EXISTS emendas_est_objetos_sc (id SERIAL PRIMARY KEY, ano INT, area TEXT, objeto TEXT, valor NUMERIC, atualizado timestamptz DEFAULT now())`);
  const q = async (s, p) => { for (let t = 0; t < 6; t++) { try { return await db.query(s, p); } catch { await new Promise((r) => setTimeout(r, 800 * (t + 1))); } } throw new Error("db"); };
  await q(`DELETE FROM emendas_est_objetos_sc WHERE ano=2026`);
  let n = 0;
  for (const r of rows) { const obj = String(r[0]).trim().slice(0, 500); const val = Number(r[1]) || 0; if (!obj) continue; await q(`INSERT INTO emendas_est_objetos_sc (ano,area,objeto,valor) VALUES (2026,$1,$2,$3)`, [area(obj), obj, val]); n++; }
  console.log(`Objetos emendas estaduais 2026: ${n} ingeridos`);
  const porArea = (await db.query(`SELECT area, count(*) n, round(sum(valor)) v FROM emendas_est_objetos_sc WHERE ano=2026 GROUP BY area ORDER BY v DESC`)).rows;
  porArea.forEach((a) => console.log(`  ${a.area}: ${a.n} objetos · R$ ${Number(a.v).toLocaleString("pt-BR")}`));
  await db.end();
}
main().catch((e) => { console.error("ERRO:", e.message); process.exit(1); });
