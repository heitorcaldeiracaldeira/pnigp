// ETL — IBGE MUNIC via BASE DE DADOS OFICIAL (xlsx), não SIDRA. Fonte completa e fidedigna: cada município × cada
// pergunta. Auto-cura os indicadores de PLANO/CONSELHO/FUNDO/INSTRUMENTO de gestão (o "baú"), por setor, para SC.
// node scripts/ingest_munic_basedados.mjs   (ARQ + ANO opcionais)
import fs from "fs"; import pg from "pg"; import xlsx from "xlsx";
const DATABASE_URL = fs.readFileSync("C:/Users/PC/pnigp/.env.local", "utf8").match(/^DATABASE_URL=(.+)$/m)[1].trim();
const ARQ = process.env.ARQ || "C:/Users/PC/AppData/Local/Temp/claude/C--Users-PC/ba9cc77b-9f1b-4cbc-90a2-e9a04839ff68/scratchpad/munic2021.xlsx";
const ANO = Number(process.env.ANO || 2021);

const SHEET = { MREH: "Recursos humanos", MLEG: "Legislação e instr de planej", MEDU: "Educação", MSAU: "Saúde", MCUL: "Cultura", MESP: "Esporte", MINF: "Informações atual prefeito", MAGR: "Agropecuária", MGOV: "Governanca", MHAB: "Habitacao", MTRA: "Transporte e mobilidade urbana" };
const INCLUI = /plano diretor|plano municipal de|plano de carreira|conselho (municipal |tutelar|de |do )|fundo municipal de|órg[ãa]o gestor|c[óo]digo de obras|c[óo]digo tribut|lei org[âa]nica|lei de perímetro|parcelamento do solo|zoneamento|estudo de impacto de vizinhan/i;
const EXCLUI = /shopping|cinema|livraria|r[áa]dio|\btv\b|jornal|revista|banca|videolocadora|galeria|loja|ensino superior|geradora|disco|sexo|idade|cor\/raça|escolaridade|capacita|titular|respondido/i;
const grupoDe = (d) => /plano diretor|perímetro|parcelamento|zoneamento|c[óo]digo|impacto de vizin|legisla/i.test(d) ? "Instrumentos legais" : /^plano|plano municipal|plano de carreira/i.test(d) ? "Planos" : /conselho/i.test(d) ? "Conselhos" : /fundo/i.test(d) ? "Fundos" : /órg[ãa]o/i.test(d) ? "Órgãos" : "Outros";
const ehSim = (v) => { const s = String(v || "").trim().toLowerCase(); return /^sim|^existe|^possui|^1$/.test(s); };

async function main() {
  console.log("lendo xlsx…");
  const wb = xlsx.readFile(ARQ);
  const dic = xlsx.utils.sheet_to_json(wb.Sheets["Dicionário"], { header: 1, blankrows: false });
  // mapa código -> {label, grupo, sheet}
  const inds = [];
  const visto = new Set();
  for (const r of dic) {
    const cod = r.find((c) => /^M[A-Z]{2,4}\d/i.test(String(c || "")) && String(c).length <= 12);
    const desc = r.map((c) => String(c || "")).find((c) => c != null && c.length > 10 && /plano|conselho|fundo|órg[ãa]o|c[óo]digo|legisla|lei /i.test(c));
    if (!cod || !desc || visto.has(String(cod))) continue;
    if (!INCLUI.test(desc) || EXCLUI.test(desc)) continue;
    visto.add(String(cod));
    const pre = (String(cod).match(/^M[A-Z]+/i) || [""])[0].toUpperCase();
    inds.push({ cod: String(cod), label: desc.replace(/\s*-\s*exist[êe]ncia.*/i, "").slice(0, 80), grupo: grupoDe(desc), sheet: SHEET[pre] });
  }
  console.log(`  ${inds.length} indicadores curados`);

  const db = new pg.Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 2 });
  db.on("error", () => {});
  await db.query(`CREATE TABLE IF NOT EXISTS munic_sc (cod_ibge TEXT, indicador TEXT, grupo TEXT, label TEXT, tem BOOLEAN, atualizado timestamptz DEFAULT now(), PRIMARY KEY (cod_ibge, indicador))`);
  await db.query(`ALTER TABLE munic_sc ADD COLUMN IF NOT EXISTS valor TEXT`);
  await db.query(`ALTER TABLE munic_sc ADD COLUMN IF NOT EXISTS ano INT`);
  if (!process.env.APPEND) await db.query(`TRUNCATE munic_sc`); // limpa só na carga base; APPEND=1 adiciona (outra edição)
  const q = async (s, p) => { for (let t = 0; t < 6; t++) { try { return await db.query(s, p); } catch { await new Promise((r) => setTimeout(r, 800 * (t + 1))); } } throw new Error("db"); };

  // por aba: cabeçalho (código->coluna), linhas de SC (cod_ibge começa com 42)
  const porSheet = new Map();
  for (const ind of inds) { if (!ind.sheet) continue; if (!porSheet.has(ind.sheet)) porSheet.set(ind.sheet, []); porSheet.get(ind.sheet).push(ind); }
  let grav = 0;
  for (const [sheet, lista] of porSheet) {
    if (!wb.Sheets[sheet]) { console.log(`  [aba ausente] ${sheet}`); continue; }
    const rows = xlsx.utils.sheet_to_json(wb.Sheets[sheet], { header: 1, blankrows: false });
    if (!rows.length || !rows[0]) { console.log(`  [aba vazia] ${sheet}`); continue; }
    const head = rows[0].map((c) => String(c || "").trim());
    const codCol = head.findIndex((h) => /^cod\s*mun/i.test(h));
    const colDe = new Map(lista.map((ind) => [ind.cod, head.findIndex((h) => h.toLowerCase() === ind.cod.toLowerCase())]).filter(([, i]) => i >= 0));
    for (let i = 1; i < rows.length; i++) {
      const cod = String(rows[i][codCol] || "");
      if (!/^42/.test(cod) || cod.length !== 7) continue; // só SC
      for (const ind of lista) {
        const ci = colDe.get(ind.cod); if (ci == null) continue;
        const v = rows[i][ci]; if (v == null || v === "") continue;
        await q(`INSERT INTO munic_sc (cod_ibge,indicador,grupo,label,tem,valor,ano) VALUES ($1,$2,$3,$4,$5,$6,$7)
                 ON CONFLICT (cod_ibge,indicador) DO UPDATE SET grupo=EXCLUDED.grupo,label=EXCLUDED.label,tem=EXCLUDED.tem,valor=EXCLUDED.valor,ano=EXCLUDED.ano,atualizado=now()`,
          [cod, ind.cod, ind.grupo, ind.label, ehSim(v), String(v).slice(0, 60), ANO]);
        grav++;
      }
    }
    console.log(`  ${sheet}: ${lista.length} indicadores processados`);
  }
  const tot = await db.query(`SELECT count(distinct cod_ibge) m, count(distinct indicador) i, count(*) FILTER(WHERE tem) tem FROM munic_sc`);
  console.log(`Concluído: ${grav} células · ${tot.rows[0].m} municípios SC · ${tot.rows[0].i} indicadores · ${tot.rows[0].tem} "tem"`);
  await db.end();
}
main().catch((e) => { console.error("ERRO:", e.message); console.error(e.stack); process.exit(1); });
