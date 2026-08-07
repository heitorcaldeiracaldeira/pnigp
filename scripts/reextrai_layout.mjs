// RE-EXTRAÇÃO COM GEOMETRIA — reescreve `texto` preservando linha e coluna, no lugar do fluxo achatado.
//
//   node scripts/reextrai_layout.mjs                       # editais e TR (o default), todos os pendentes
//   TIPOS=todos node scripts/reextrai_layout.mjs           # o acervo inteiro
//   DRY=1 LIMIT=20 node scripts/reextrai_layout.mjs        # mede sem gravar
//   NSHARD=4 SHARD=0 ...                                   # fatia disjunta por hash (o supervisor usa isso)
//
// ═══ POR QUE REFAZER ═══
// A extração antiga (extractText do unpdf) devolve o FLUXO de texto sem posição. Medido em 100 editais:
// 98 estão guardados como UMA ÚNICA LINHA — um deles com 54.441 caracteres — e dos 99 com item, o valor do
// item foi localizado em 66, em NENHUM numa linha própria. Sem linha e sem coluna não há fronteira de
// célula, e todo leitor vira recorte por proximidade. É a origem medida do lixo do enriquecimento.
// pdf_layout.mjs recupera a geometria: 1 linha → 375, 478 e 817 nos três editais de prova, com o cabeçalho
// voltando inteiro ("ITEM | ESPECIFICAÇÃO | CATMAT | UNIDADE | QUANTIDADE | VALOR").
//
// ═══ SUBSTITUI, NÃO DUPLICA ═══
// Decisão do Heitor: o texto novo ocupa o lugar do antigo. É o mesmo conteúdo com quebras de linha no lugar
// de espaços, então não cresce armazenamento (a tabela já tem 13 GB), e todo leitor melhora de uma vez —
// inclusive os de marca, que hoje achatam o texto de novo e continuarão funcionando igual.
// `layout_v` marca o que já foi refeito: é o que torna a operação retomável e o que permite saber, depois,
// qual linha veio de qual extração.
//
// ⚠️ NÃO temos os PDFs guardados: `arquivo_binario_sc` existe com ZERO linhas — a camada foi desenhada e
// nunca preenchida. Por isso refazer exige baixar de novo, e por isso o download é o gargalo, não o banco.
import fs from "fs"; import path from "path"; import { fileURLToPath } from "url"; import pg from "pg";
import { getDocumentProxy } from "unpdf";
import { extraiComLayout } from "./pdf_layout.mjs";
import { carimboBR } from "./hora_br.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const U = fs.readFileSync(path.join(__dirname, "..", ".env.local"), "utf8").match(/^DATABASE_URL=(.+)$/m)[1].trim();
const db = new pg.Pool({ connectionString: U, ssl: { rejectUnauthorized: false }, max: 3, statement_timeout: 590000 });
const UF = (process.env.UF || "sc").toLowerCase();
const DRY = process.env.DRY === "1";
const LIMIT = Number(process.env.LIMIT || 0);
const CONC = Number(process.env.CONC || 3);
const NSHARD = Number(process.env.NSHARD || 1);
const SHARD = Number(process.env.SHARD || 0);
const MAXCHARS = Number(process.env.MAXCHARS || 200000);
const PDF_TIMEOUT = Number(process.env.PDF_TIMEOUT || 45000);
const TIPOS = (process.env.TIPOS || "editais").toLowerCase();
const LOTE_GRAVA = Number(process.env.LOTE_GRAVA || 20);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const comLimite = (p, ms, r) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error(r)), ms))]);

async function baixa(uri) {
  for (let t = 0; t < 5; t++) {
    try {
      const r = await fetch(uri, { signal: AbortSignal.timeout(45000) });
      if (r.status === 429) { await sleep(4000 * (t + 1)); continue; }
      if (!r.ok) return null;
      return new Uint8Array(await r.arrayBuffer());
    } catch { await sleep(1500 * (t + 1)); }
  }
  return null;
}

async function main() {
  await db.query(`ALTER TABLE arquivo_texto_${UF} ADD COLUMN IF NOT EXISTS layout_v smallint`);

  const filtroTipo = TIPOS === "todos" ? "" :
    `and t.tipo_documento in ('Edital','Termo de Referência','Projeto Básico','Estudo Técnico Preliminar','Anexo')`;
  const filtroShard = NSHARD > 1
    ? `and (abs(hashtext(t.cnpj||t.ano::text||t.seq::text||t.sequencial_documento::text)) % ${NSHARD}) = ${SHARD}` : "";
  const lim = LIMIT > 0 ? `limit ${LIMIT}` : "";

  const { rows: fila } = await db.query(`
    select t.cnpj, t.ano, t.seq, t.sequencial_documento sd, a.uri, t.chars
      from arquivo_texto_${UF} t
      join arquivos_${UF} a
        on a.cnpj=t.cnpj and a.ano=t.ano and a.seq=t.seq and a.sequencial_documento=t.sequencial_documento
     where t.layout_v is null and a.uri is not null ${filtroTipo} ${filtroShard}
     order by t.chars desc ${lim}`);

  if (!fila.length) { console.log(`${carimboBR()} nada pendente (tipos=${TIPOS}, shard ${SHARD}/${NSHARD})`); await db.end(); return; }
  console.log(`${carimboBR()} re-extração com geometria · ${fila.length} documentos · shard ${SHARD}/${NSHARD} · DRY=${DRY ? 1 : 0}`);

  let feitos = 0, ok = 0, falhou = 0, semLinha = 0;
  let ganhoLinhas = 0, ganhoCelulas = 0;
  let buffer = [];

  async function grava() {
    if (!buffer.length || DRY) { buffer = []; return; }
    await db.query(`
      update arquivo_texto_${UF} t set texto = x.texto, chars = length(x.texto), layout_v = 1, atualizado = now()
        from unnest($1::text[],$2::int[],$3::int[],$4::int[],$5::text[]) as x(cnpj,ano,seq,sd,texto)
       where t.cnpj=x.cnpj and t.ano=x.ano and t.seq=x.seq and t.sequencial_documento=x.sd`,
      [buffer.map(b => b.cnpj), buffer.map(b => b.ano), buffer.map(b => b.seq), buffer.map(b => b.sd), buffer.map(b => b.texto)]);
    buffer = [];
  }

  // marca como tentado mesmo quando falha, para a fila não repetir o mesmo PDF ruim para sempre
  async function marcaFalha(d, v) {
    if (DRY) return;
    await db.query(`update arquivo_texto_${UF} set layout_v=$5 where cnpj=$1 and ano=$2 and seq=$3 and sequencial_documento=$4`,
      [d.cnpj, d.ano, d.seq, d.sd, v]);
  }

  const fatias = Array.from({ length: CONC }, (_, i) => fila.filter((_, j) => j % CONC === i));
  await Promise.all(fatias.map(async (minha) => {
    for (const d of minha) {
      try {
        const buf = await baixa(d.uri);
        if (!buf || buf[0] !== 0x25) { falhou++; await marcaFalha(d, 9); continue; }   // 9 = nao e PDF
        const doc = await comLimite(getDocumentProxy(buf), PDF_TIMEOUT, "abrir");
        const txt = await comLimite(extraiComLayout(doc, { maxChars: MAXCHARS }), PDF_TIMEOUT * 2, "extrair");
        if (!txt || txt.length < 50) { falhou++; await marcaFalha(d, 8); continue; }    // 8 = vazio/escaneado
        const nl = txt.split("\n").length;
        const nc = txt.split("\n").filter((l) => l.includes("\t")).length;
        ganhoLinhas += nl; ganhoCelulas += nc;
        if (nl <= 2) semLinha++;
        buffer.push({ ...d, texto: txt });
        if (buffer.length >= LOTE_GRAVA) await grava();
        ok++;
      } catch { falhou++; await marcaFalha(d, 7); }                                     // 7 = timeout/erro
      if (++feitos % 20 === 0)
        process.stdout.write(`  ${feitos}/${fila.length} · ok ${ok} · falha ${falhou} · linhas/doc ${ok ? Math.round(ganhoLinhas / ok) : 0}\r`);
    }
  }));
  await grava();

  console.log(`\n${carimboBR()} fim · ${feitos} documentos · ok ${ok} · falha ${falhou}`);
  console.table([{
    media_linhas_por_doc: ok ? Math.round(ganhoLinhas / ok) : 0,
    media_linhas_com_celula: ok ? Math.round(ganhoCelulas / ok) : 0,
    ainda_sem_linha: semLinha,
  }]);
  await db.end();
}
main().catch((e) => { console.error("ERRO:", e.message); process.exit(1); });
