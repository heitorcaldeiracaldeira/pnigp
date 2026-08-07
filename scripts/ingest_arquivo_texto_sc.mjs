// DOCUMENTO_TEXTO — materializa o CONTEÚDO (texto) dos documentos do PNCP, para NÃO re-baixar a cada extração. Baixa o
// PDF (arquivos_sc.uri) → extrai texto (unpdf) → grava arquivo_texto_sc. A partir daí, marca (ata), descrição (edital),
// lances etc. rodam sobre o TEXTO GUARDADO, sem re-bater no PNCP. RESUMÍVEL (grava = feito), robusto a 429, idempotente.
// DOCFILTRO define quais documentos baixar (default: atas de sessão — a fonte da marca). node scripts/ingest_arquivo_texto_sc.mjs
import fs from "fs"; import path from "path"; import { fileURLToPath } from "url"; import pg from "pg";
import { getDocumentProxy } from "unpdf";
import { extraiComLayout } from "./pdf_layout.mjs";
import { whereUniversoDoc, ordemFilaDoc, detectaGerador } from "./mapa_atas_plataformas.mjs";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATABASE_URL = fs.readFileSync(path.join(__dirname, "..", ".env.local"), "utf8").match(/^DATABASE_URL=(.+)$/m)[1].trim();
const CONC = Number(process.env.CONC || 4);
const LIMIT = Number(process.env.LIMIT || 0);
// UNIVERSO: "resultado" (default — tipos 16/11/19/12, a caça da ata/marca) ou "todos" (SEM filtro de tipo —
// CADA documento do PNCP: edital, TR, ETP, DFD, projeto básico… — a especificação do item vive aqui). Regra 2.
const UNIVERSO = (process.env.UNIVERSO || "resultado").toLowerCase();
const MAXCHARS = Number(process.env.MAXCHARS || 200000);   // teto de texto por doc (atas gigantes)
// quais documentos materializar. default = ATA DE SESSÃO (fonte da marca/lances). Ex.: "edital" p/ editais.
const DOCFILTRO = process.env.DOCFILTRO || "titulo:atatotal|ata.*(sess|julg|realiz|final|resultad)|mapa.*lance";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// time-box: se a promessa não resolver em ms, rejeita (evita o unpdf travar indefinidamente num PDF ruim e parar o worker)
const comLimite = (p, ms, rotulo) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error(rotulo || "timeout")), ms))]);
const PDF_TIMEOUT = Number(process.env.PDF_TIMEOUT || 30000);
// Postgres RECUSA byte NUL em coluna TEXT ("invalid byte sequence for encoding UTF8: 0x00"), e PDF escaneado/
// malformado entrega NUL no texto extraido. Sem isto o INSERT falha, o q() retenta 25x em silencio (~8min), o
// coletor morre em "ERRO: db" e o ciclo seguinte reencontra o mesmo doc — o pipeline trava inteiro (ficou parado
// em 7.340/35.141 por horas). Tira tambem lone surrogates, que o driver serializa como UTF-8 invalido.
const limpaTexto = (s) => String(s).replace(/\u0000/g, "").replace(/[\uD800-\uDFFF]/g, "");

// ⚠️ EXTRAI COM GEOMETRIA. Até 06/ago/2026 esta função usava extractText(...,{mergePages:true}), que devolve
// o FLUXO de texto sem posição — e o resultado ficava guardado como UMA ÚNICA LINHA (medido: 98 de 100
// editais; um deles com 54.441 caracteres numa linha só). Sem linha e sem coluna não há fronteira de célula,
// e todo leitor a jusante vira recorte por proximidade: foi a origem das 117.364 descrições começando com
// número e das 34.517 com dotação orçamentária no lugar da especificação.
// pdf_layout.mjs agrupa por Y (linha) e separa por vão de X (célula). Documento novo já entra legível.
async function extraiPdf(buf) {   // extração cronometrada — PDF escaneado/malformado não pode pendurar o worker
  return await comLimite((async () => await extraiComLayout(await getDocumentProxy(buf), { maxChars: MAXCHARS }))(), PDF_TIMEOUT, "pdf-timeout");
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
  // NÃO engolir o erro: o retry cego escondeu por horas um INSERT que falhava sempre (byte NUL). Erro de DADO
  // (não adianta retentar: 22P05/22021 encoding, 23505 unique, 42703 coluna) falha na hora, com a mensagem.
  const FATAL = new Set(["22P05", "22021", "23505", "23502", "42703", "42P10"]);
  const q = async (s, p) => {
    let ultimo;
    for (let i = 0; i < 25; i++) {
      try { return await db.query(s, p); }
      catch (err) {
        ultimo = err;
        if (FATAL.has(err.code)) throw err;   // erro de dado/schema — retentar é inútil
        await sleep(1500 * (i + 1));
      }
    }
    throw new Error(`db (${ultimo?.code || "?"}): ${ultimo?.message || "sem detalhe"}`);
  };
  await q(`CREATE TABLE IF NOT EXISTS arquivo_texto_sc (
    cnpj TEXT, ano INT, seq INT, sequencial_documento INT, cod_ibge TEXT, tipo_documento TEXT, titulo TEXT,
    texto TEXT, chars INT, numero_controle TEXT GENERATED ALWAYS AS (cnpj || '-1-' || lpad(seq::text,6,'0') || '/' || ano) STORED,
    atualizado timestamptz DEFAULT now(), PRIMARY KEY (cnpj,ano,seq,sequencial_documento))`);
  await q(`CREATE INDEX IF NOT EXISTS ix_arqtexto_nc ON arquivo_texto_sc (numero_controle)`);
  // GERADOR do documento (assinatura no texto) — é o que roteia o parser, NÃO a plataforma do PNCP (=quem publicou).
  // Carimbado aqui, na ingestão: varrer `texto ~* ...` a cada ciclo seria seq scan em GBs.
  await q(`ALTER TABLE arquivo_texto_sc ADD COLUMN IF NOT EXISTS gerador TEXT`);
  await q(`CREATE INDEX IF NOT EXISTS ix_arqtexto_gerador ON arquivo_texto_sc (gerador)`);

  // UNIVERSO = tipo oficial do PNCP. O TÍTULO NÃO FILTRA — só ordena.
  //  "resultado" (default): ata/marca (whereUniversoDoc). "criacao": documentos da construção (a spec do item vive
  //  aqui — TR/ETP/PB/Edital/Aviso/DFD…). "todos": sem filtro de tipo.
  // ordem = prioridade p/ enriquecimento (spec-rica primeiro). TIPOS=4,7,6 restringe (fatia de alto valor).
  const CRIACAO = process.env.TIPOS ? process.env.TIPOS.split(",").map(Number) : [4, 7, 6, 5, 8, 10, 20, 1, 3, 2, 9, 16];
  const universoSQL = UNIVERSO === "criacao" ? `a.tipo_documento_id = ANY(ARRAY[${CRIACAO.join(",")}]) AND a.uri IS NOT NULL`
    : UNIVERSO === "todos" ? `a.uri IS NOT NULL` : whereUniversoDoc("a");
  const ordemSQL = UNIVERSO === "criacao" ? `array_position(ARRAY[${CRIACAO.join(",")}], a.tipo_documento_id), a.data_publicacao DESC NULLS LAST`
    : UNIVERSO === "todos" ? `a.data_publicacao DESC NULLS LAST` : ordemFilaDoc("a");
  // SHARD (opcional): NSHARD>1 particiona o trabalho por hash da chave → N processos paralelos SEM sobreposição
  // (cada um pega uma fatia disjunta). Guardado por env: sem NSHARD, o comportamento é idêntico ao de antes.
  const NSHARD = Number(process.env.NSHARD || 0), SHARD = Number(process.env.SHARD || 0);
  const shardSQL = NSHARD > 1 ? `AND ((hashtext(a.numero_controle || '#' || a.sequencial_documento::text) % ${NSHARD}) + ${NSHARD}) % ${NSHARD} = ${SHARD}` : "";
  const docs = (await q(`SELECT a.cnpj,a.ano,a.seq,a.sequencial_documento,a.cod_ibge,a.tipo_documento,a.titulo,a.uri
    FROM arquivos_sc a
    WHERE ${universoSQL}
      AND NOT EXISTS (SELECT 1 FROM arquivo_texto_sc d WHERE d.cnpj=a.cnpj AND d.ano=a.ano AND d.seq=a.seq AND d.sequencial_documento=a.sequencial_documento)
      ${shardSQL}
    ORDER BY ${ordemSQL}
    ${LIMIT ? "LIMIT " + LIMIT : ""}`)).rows;
  console.log(`${docs.length.toLocaleString()} documentos a baixar (universo=${UNIVERSO}) · conc ${CONC}${NSHARD>1?` · shard ${SHARD}/${NSHARD}`:""}`);

  let ok = 0, vazio = 0, i = 0, done = 0, erros = 0;
  await Promise.all(Array.from({ length: CONC }, async () => {
    while (i < docs.length) {
      const e = docs[i++];
      const bruto = await baixaTexto(e.uri);
      if (bruto === null) continue;   // falha de fetch → não grava, retenta
      const texto = limpaTexto(bruto);   // sem NUL/surrogate: senão o Postgres recusa e o coletor inteiro para
      try {
        await q(`INSERT INTO arquivo_texto_sc (cnpj,ano,seq,sequencial_documento,cod_ibge,tipo_documento,titulo,texto,chars,gerador)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT (cnpj,ano,seq,sequencial_documento) DO UPDATE SET texto=EXCLUDED.texto, chars=EXCLUDED.chars, gerador=EXCLUDED.gerador, atualizado=now()`,
          [e.cnpj, e.ano, e.seq, Number(e.sequencial_documento) || 0, e.cod_ibge, e.tipo_documento, String(e.titulo || "").slice(0, 300), texto, texto.length, detectaGerador(texto)]);
        if (texto.length > 50) ok++; else vazio++;
      } catch (err) {
        // 1 doc ruim NÃO pode matar a passada inteira (era o que acontecia) — mas o erro tem que APARECER.
        if (++erros <= 10) console.log(`\n  ⚠ falhou ${e.ano}/${e.seq}#${e.sequencial_documento}: ${err.message}`);
      }
      if (++done % 100 === 0) process.stdout.write(`  ${done}/${docs.length} · ${ok} com texto · ${vazio} vazios · ${erros} erros\r`);
    }
  }));
  const s = (await q(`SELECT count(*) n, count(*) FILTER (WHERE chars>50) com, round(avg(chars) FILTER (WHERE chars>50)) media FROM arquivo_texto_sc`)).rows[0];
  console.log(`\n✔ arquivo_texto_sc: ${Number(s.n).toLocaleString()} docs · ${Number(s.com).toLocaleString()} com texto (média ${s.media} chars)`);
  await db.end();
}
main().catch((e) => { console.error("ERRO:", e.message); process.exit(1); });
