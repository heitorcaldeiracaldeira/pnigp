// ETL — IBGE MUNIC via BASE DE DADOS OFICIAL (xlsx), não SIDRA. Fonte completa e fidedigna: cada município × cada
// pergunta. Auto-cura os indicadores de PLANO/CONSELHO/FUNDO/INSTRUMENTO de gestão (o "baú"), por setor, para SC.
// node scripts/ingest_munic_basedados.mjs   (ARQ + ANO opcionais)
import fs from "fs"; import pg from "pg"; import xlsx from "xlsx";
const DATABASE_URL = fs.readFileSync("C:/Users/PC/pnigp/.env.local", "utf8").match(/^DATABASE_URL=(.+)$/m)[1].trim();
// ═══ O ARQUIVO APONTAVA PARA O SCRATCHPAD DE UMA SESSÃO ANTIGA ═══
// Era `.../claude/C--Users-PC/ba9cc77b-.../scratchpad/munic2021.xlsx`: baixado à mão uma vez, num diretório
// temporário de vida curta, com o caminho cravado no script. Agendado, só dava ENOENT desde junho.
//
// ═══ E O MUNIC É UMA PESQUISA ROTATIVA ═══
// Medido em 10/ago, lendo as abas das três edições publicadas:
//   2021 → Legislação e instr de planej · Educação · Saúde · Cultura · Esporte · Info prefeito · Governança
//          · Habitação · Transporte · Agropecuária · Recursos humanos
//   2023 → Assistência Social · Trabalho · Segurança Alimentar · Mulheres · Segurança Pública · Direitos
//          Humanos · Primeira Infância · Recursos humanos
//   2024 → Informática · Governança · Habitação · Transporte · Agropecuária · Gestão migratória · Igualdade
//          racial · Evento climático RS · Recursos humanos
// Só "Recursos humanos" está nas três. As edições são COMPLEMENTARES, não substitutas: trocar 2021 por 2024
// perderia justamente Legislação/Educação/Saúde, que são o miolo do "baú" de planos, conselhos e fundos.
// Por isso varremos TODAS as edições, da mais antiga para a mais nova — o ON CONFLICT faz a recente vencer
// tema a tema, sem descartar o que só existe na antiga. Governança, Habitação, Transporte e Agropecuária
// sobem de 2021 para 2024 sozinhos; o resto de 2021 fica de pé.
//
// ARQ= força um arquivo único (com ANO=); sem isso, descobre e baixa todas as edições.
import os from "os"; import path from "path"; import { execFileSync } from "child_process";
const FTP_MUNIC = "https://ftp.ibge.gov.br/Perfil_Municipios";
const ARQ = process.env.ARQ || null;
const ANO = Number(process.env.ANO || 0);

const listaHttp = (url) => {
  const h = execFileSync("curl", ["-sS", "--fail", "--max-time", "90", "-A", "Mozilla/5.0", url], { encoding: "utf8", maxBuffer: 1 << 24 });
  return [...h.matchAll(/href="([^"]+)"/g)].map((m) => m[1]).filter((n) => !/^https?:|^\?|^\//.test(n));
};

/**
 * Descobre as edições do MUNIC e o arquivo de cada uma, da mais ANTIGA para a mais nova.
 * O nome traz carimbo de data e MUDA quando o IBGE republica — `Base_MUNIC_2021_20240425.xlsx` hoje,
 * outro amanhã. Por isso o nome se descobre listando o diretório; cravar quebra calado.
 */
function edicoesMunic() {
  const anos = listaHttp(`${FTP_MUNIC}/`).map((n) => n.replace(/\/$/, "")).filter((n) => /^\d{4}$/.test(n)).map(Number).sort((a, b) => a - b);
  const out = [];
  for (const ano of anos) {
    let arq = null;
    try { arq = listaHttp(`${FTP_MUNIC}/${ano}/Base_de_Dados/`).find((n) => /^Base_MUNIC_.*\.xlsx$/i.test(n)); } catch { continue; }
    if (arq) out.push({ ano, nome: arq, url: `${FTP_MUNIC}/${ano}/Base_de_Dados/${arq}` });
  }
  return out;
}

/** baixa (uma vez) e devolve o caminho local; o cache é pelo NOME publicado, então republicação rebaixa */
function baixaEdicao(ed) {
  const dest = path.join(process.env.DIR || os.tmpdir(), ed.nome);
  if (fs.existsSync(dest) && fs.statSync(dest).size > 1e6) return dest;
  execFileSync("curl", ["-sS", "--fail", "-L", "--max-time", "900", "--speed-limit", "1024", "--speed-time", "60",
    "--retry", "3", "--retry-all-errors", "-A", "Mozilla/5.0", "-o", dest, ed.url], { stdio: "ignore" });
  if (!fs.existsSync(dest) || fs.statSync(dest).size < 1e6) throw new Error(`MUNIC ${ed.ano}: download veio vazio`);
  return dest;
}

// (o antigo mapa fixo prefixo→aba, com os nomes de 2021, saiu daqui: a aba agora vem do próprio arquivo)
const INCLUI = /plano diretor|plano municipal de|plano de carreira|conselho (municipal |tutelar|de |do )|fundo municipal de|órg[ãa]o gestor|c[óo]digo de obras|c[óo]digo tribut|lei org[âa]nica|lei de perímetro|parcelamento do solo|zoneamento|estudo de impacto de vizinhan/i;
const EXCLUI = /shopping|cinema|livraria|r[áa]dio|\btv\b|jornal|revista|banca|videolocadora|galeria|loja|ensino superior|geradora|disco|sexo|idade|cor\/raça|escolaridade|capacita|titular|respondido/i;
const grupoDe = (d) => /plano diretor|perímetro|parcelamento|zoneamento|c[óo]digo|impacto de vizin|legisla/i.test(d) ? "Instrumentos legais" : /^plano|plano municipal|plano de carreira/i.test(d) ? "Planos" : /conselho/i.test(d) ? "Conselhos" : /fundo/i.test(d) ? "Fundos" : /órg[ãa]o/i.test(d) ? "Órgãos" : "Outros";
const ehSim = (v) => { const s = String(v || "").trim().toLowerCase(); return /^sim|^existe|^possui|^1$/.test(s); };

async function main() {
  const edicoes = ARQ ? [{ ano: ANO || 0, nome: path.basename(ARQ), local: ARQ }] : edicoesMunic();
  if (!edicoes.length) throw new Error("MUNIC: nenhuma edição encontrada no FTP do IBGE");
  console.log(`edições do MUNIC: ${edicoes.map((e) => e.ano).join(", ")} (da mais antiga p/ a mais nova; a recente vence tema a tema)`);

  const db = new pg.Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 2 });
  db.on("error", () => {});
  await db.query(`CREATE TABLE IF NOT EXISTS munic_sc (cod_ibge TEXT, indicador TEXT, grupo TEXT, label TEXT, tem BOOLEAN, atualizado timestamptz DEFAULT now(), PRIMARY KEY (cod_ibge, indicador))`);
  await db.query(`ALTER TABLE munic_sc ADD COLUMN IF NOT EXISTS valor TEXT`);
  await db.query(`ALTER TABLE munic_sc ADD COLUMN IF NOT EXISTS ano INT`);
  if (!process.env.APPEND) await db.query(`TRUNCATE munic_sc`);

  let total = 0;
  for (const ed of edicoes) total += await ingereEdicao(ed, db);
  const tot = await db.query(`SELECT count(distinct cod_ibge) m, count(distinct indicador) i, count(*) FILTER(WHERE tem) tem FROM munic_sc`);
  const porAno = await db.query(`SELECT ano, count(distinct indicador) i FROM munic_sc GROUP BY ano ORDER BY ano`);
  console.log(`✔ munic_sc: ${total} células · ${tot.rows[0].m} municípios SC · ${tot.rows[0].i} indicadores · ${tot.rows[0].tem} "tem"`);
  console.log(`  por edição vencedora: ${porAno.rows.map((r) => `${r.ano}=${r.i}`).join(" · ")}`);
  await db.end();
}

async function ingereEdicao(ed, db) {
  const arq = ed.local || baixaEdicao(ed);
  console.log(`\nMUNIC ${ed.ano} — lendo ${ed.nome}…`);
  const wb = xlsx.readFile(arq);
  const dic = xlsx.utils.sheet_to_json(wb.Sheets["Dicionário"], { header: 1, blankrows: false });
  // ⚠️ A ABA SE DESCOBRE NO ARQUIVO, NÃO NUM MAPA FIXO.
  // Havia um `SHEET = { MREH: "Recursos humanos", MLEG: "Legislação e instr de planej", … }` com os nomes de
  // 2021. Como o MUNIC roda temas diferentes a cada edição, qualquer prefixo novo caía em `undefined` e a
  // aba inteira era pulada em silêncio. Lendo o cabeçalho de cada aba, o próprio arquivo diz onde cada
  // código mora — e passa a funcionar em edição que ainda nem existe.
  const sheetDoCodigo = new Map();
  for (const nome of wb.SheetNames) {
    if (nome === "Dicionário") continue;
    const h = xlsx.utils.sheet_to_json(wb.Sheets[nome], { header: 1, blankrows: false, range: 0 })[0] || [];
    for (const c of h) { const k = String(c || "").trim().toUpperCase(); if (/^M[A-Z]{2,4}\d/.test(k) && !sheetDoCodigo.has(k)) sheetDoCodigo.set(k, nome); }
  }
  // mapa código -> {label, grupo, sheet}
  const inds = [];
  const visto = new Set();
  for (const r of dic) {
    const cod = r.find((c) => /^M[A-Z]{2,4}\d/i.test(String(c || "")) && String(c).length <= 12);
    const desc = r.map((c) => String(c || "")).find((c) => c != null && c.length > 10 && /plano|conselho|fundo|órg[ãa]o|c[óo]digo|legisla|lei /i.test(c));
    if (!cod || !desc || visto.has(String(cod))) continue;
    if (!INCLUI.test(desc) || EXCLUI.test(desc)) continue;
    visto.add(String(cod));
    inds.push({ cod: String(cod), label: desc.replace(/\s*-\s*exist[êe]ncia.*/i, "").slice(0, 80), grupo: grupoDe(desc), sheet: sheetDoCodigo.get(String(cod).toUpperCase()) });
  }
  console.log(`  ${inds.length} indicadores curados`);
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
    // era uma ida ao banco POR CÉLULA — 295 municípios × dezenas de indicadores por aba. O banco é o
    // gargalo: junta a aba inteira e grava de uma vez.
    const L = [];
    for (let i = 1; i < rows.length; i++) {
      const cod = String(rows[i][codCol] || "");
      if (!/^42/.test(cod) || cod.length !== 7) continue; // só SC
      for (const ind of lista) {
        const ci = colDe.get(ind.cod); if (ci == null) continue;
        const v = rows[i][ci]; if (v == null || v === "") continue;
        L.push([cod, ind.cod, ind.grupo, ind.label, ehSim(v), String(v).slice(0, 60)]);
      }
    }
    if (L.length) {
      await q(`INSERT INTO munic_sc (cod_ibge,indicador,grupo,label,tem,valor,ano,atualizado)
        SELECT c,ind,g,lb,tm,vl,$7,now() FROM unnest($1::text[],$2::text[],$3::text[],$4::text[],$5::bool[],$6::text[]) AS z(c,ind,g,lb,tm,vl)
        ON CONFLICT (cod_ibge,indicador) DO UPDATE SET grupo=EXCLUDED.grupo,label=EXCLUDED.label,tem=EXCLUDED.tem,valor=EXCLUDED.valor,ano=EXCLUDED.ano,atualizado=now()`,
        [L.map((r) => r[0]), L.map((r) => r[1]), L.map((r) => r[2]), L.map((r) => r[3]), L.map((r) => r[4]), L.map((r) => r[5]), ed.ano]);
    }
    grav += L.length;
    console.log(`  ${sheet}: ${lista.length} indicadores · ${L.length} células`);
  }
  return grav;
}
main().catch((e) => { console.error("ERRO:", e.message); console.error(e.stack); process.exit(1); });
