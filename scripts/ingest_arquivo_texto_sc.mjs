// DOCUMENTO_TEXTO — materializa o CONTEÚDO (texto) dos documentos do PNCP, para NÃO re-baixar a cada extração. Baixa o
// PDF (arquivos_sc.uri) → extrai texto (unpdf) → grava arquivo_texto_sc. A partir daí, marca (ata), descrição (edital),
// lances etc. rodam sobre o TEXTO GUARDADO, sem re-bater no PNCP. RESUMÍVEL (grava = feito), robusto a 429, idempotente.
// DOCFILTRO define quais documentos baixar (default: atas de sessão — a fonte da marca). node scripts/ingest_arquivo_texto_sc.mjs
import fs from "fs"; import path from "path"; import { fileURLToPath } from "url"; import pg from "pg";
import { extractText, getDocumentProxy } from "unpdf";
import { whereSelecaoAtas } from "./mapa_atas_plataformas.mjs";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATABASE_URL = fs.readFileSync(path.join(__dirname, "..", ".env.local"), "utf8").match(/^DATABASE_URL=(.+)$/m)[1].trim();
const CONC = Number(process.env.CONC || 4);
const LIMIT = Number(process.env.LIMIT || 0);
const MAXCHARS = Number(process.env.MAXCHARS || 200000);   // teto de texto por doc (atas gigantes)
// quais documentos materializar. default = ATA DE SESSÃO (fonte da marca/lances). Ex.: "edital" p/ editais.
const DOCFILTRO = process.env.DOCFILTRO || "titulo:atatotal|ata.*(sess|julg|realiz|final|resultad)|mapa.*lance";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// time-box: se a promessa não resolver em ms, rejeita (evita o unpdf travar indefinidamente num PDF ruim e parar o worker)
const comLimite = (p, ms, rotulo) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error(rotulo || "timeout")), ms))]);
const PDF_TIMEOUT = Number(process.env.PDF_TIMEOUT || 30000);

async function extraiPdf(buf) {   // extração cronometrada — PDF escaneado/malformado não pode pendurar o worker
  return await comLimite((async () => ((await extractText(await getDocumentProxy(buf), { mergePages: true })).text || ""))(), PDF_TIMEOUT, "pdf-timeout");
}
async function baixaTexto(uri) {
  for (let t = 0; t < 6; t++) {
    try {
      const r = await fetch(uri, { signal: AbortSignal.timeout(45000) });
      if (r.status === 429) { await sleep(4000 + t * 4000); continue; }
      if (!r.ok) return "";   // doc indisponível → grava vazio (feito, não re-tenta à toa)
      const ct = r.headers.get("content-type") || "";
      const buf = new Uint8Array(await r.arrayBuffer());
      if (/pdf/i.test(ct) || uri.toLowerCase().includes("pdf") || buf[0] === 0x25) {
        try { return (await extraiPdf(buf)).slice(0, MAXCHARS); }
        catch { return ""; }   // PDF corrompido/imagem/travado → vazio (feito, não re-tenta à toa)
      }
      return Buffer.from(buf).toString("utf8").slice(0, MAXCHARS);   // texto/html
    } catch { await sleep(1500 * (t + 1)); }
  }
  return null;   // esgotou fetch → NÃO grava (retenta no re-run)
}

async function main() {
  const db = new pg.Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 3, statement_timeout: 120000 });
  db.on("error", () => {});
  const q = async (s, p) => { for (let i = 0; i < 25; i++) { try { return await db.query(s, p); } catch { await sleep(1500 * (i + 1)); } } throw new Error("db"); };
  await q(`CREATE TABLE IF NOT EXISTS arquivo_texto_sc (
    cnpj TEXT, ano INT, seq INT, sequencial_documento INT, cod_ibge TEXT, tipo_documento TEXT, titulo TEXT,
    texto TEXT, chars INT, numero_controle TEXT GENERATED ALWAYS AS (cnpj || '-1-' || lpad(seq::text,6,'0') || '/' || ano) STORED,
    atualizado timestamptz DEFAULT now(), PRIMARY KEY (cnpj,ano,seq,sequencial_documento))`);
  await q(`CREATE INDEX IF NOT EXISTS ix_arqtexto_nc ON arquivo_texto_sc (numero_controle)`);

  // seleção por plataforma/modalidade (mapa_atas_plataformas) — traz o doc de resultado de TODAS as modalidades.
  const W = whereSelecaoAtas("a", "c");
  const docs = (await q(`SELECT a.cnpj,a.ano,a.seq,a.sequencial_documento,a.cod_ibge,a.tipo_documento,a.titulo,a.uri
    FROM arquivos_sc a JOIN contratacoes_sc c USING (cnpj,ano,seq)
    WHERE ${W} AND a.uri IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM arquivo_texto_sc d WHERE d.cnpj=a.cnpj AND d.ano=a.ano AND d.seq=a.seq AND d.sequencial_documento=a.sequencial_documento)
    ${LIMIT ? "LIMIT " + LIMIT : ""}`)).rows;
  console.log(`${docs.length.toLocaleString()} documentos a baixar (seleção por plataforma/modalidade) · conc ${CONC}`);

  let ok = 0, vazio = 0, i = 0, done = 0;
  await Promise.all(Array.from({ length: CONC }, async () => {
    while (i < docs.length) {
      const e = docs[i++];
      const texto = await baixaTexto(e.uri);
      if (texto === null) continue;   // falha de fetch → não grava, retenta
      await q(`INSERT INTO arquivo_texto_sc (cnpj,ano,seq,sequencial_documento,cod_ibge,tipo_documento,titulo,texto,chars)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT (cnpj,ano,seq,sequencial_documento) DO UPDATE SET texto=EXCLUDED.texto, chars=EXCLUDED.chars, atualizado=now()`,
        [e.cnpj, e.ano, e.seq, Number(e.sequencial_documento) || 0, e.cod_ibge, e.tipo_documento, String(e.titulo || "").slice(0, 300), texto, texto.length]);
      if (texto.length > 50) ok++; else vazio++;
      if (++done % 100 === 0) process.stdout.write(`  ${done}/${docs.length} · ${ok} com texto · ${vazio} vazios\r`);
    }
  }));
  const s = (await q(`SELECT count(*) n, count(*) FILTER (WHERE chars>50) com, round(avg(chars) FILTER (WHERE chars>50)) media FROM arquivo_texto_sc`)).rows[0];
  console.log(`\n✔ arquivo_texto_sc: ${Number(s.n).toLocaleString()} docs · ${Number(s.com).toLocaleString()} com texto (média ${s.media} chars)`);
  await db.end();
}
main().catch((e) => { console.error("ERRO:", e.message); process.exit(1); });
