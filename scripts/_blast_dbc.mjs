// _blast_dbc.mjs — DESCOMPRESSOR DBC (DATASUS). Um .dbc é um .dbf cujos REGISTROS estão comprimidos por
// PKWARE DCL "implode"; o cabeçalho DBF fica intacto. Descompressão = algoritmo "blast" de Mark Adler,
// portado fielmente para JS. Destrava SIM/SINASC/SIH/SIA/CNES etc.
//
// ⚠️ RECONSTRUÍDO em 2026-07-17 — o original (gitignored, `_*.mjs`) foi apagado por engano num `rm` por wildcard.
//    O algoritmo é fiel à referência (blast.c), MAS não pôde ser testado aqui por falta de um .dbc de amostra.
//    ANTES DE CONFIAR: rodar contra um .dbc real e conferir o .dbf de saída (ver validação no rodapé).
//
// uso (programático): import { dbc2dbf } from "./_blast_dbc.mjs"; const dbf = dbc2dbf(fs.readFileSync("x.dbc"));
// uso (CLI):          node scripts/_blast_dbc.mjs entrada.dbc saida.dbf

// ── tabelas de Huffman fixas do PKWARE DCL (compact rep: (repeats-1)<<4 | bitlength) ──
const LIT = [11,124,8,7,28,7,188,13,76,4,10,8,12,10,12,10,8,23,8,9,7,6,7,8,7,6,55,8,23,24,12,11,7,9,11,12,6,7,22,5,7,24,6,11,9,6,7,22,7,11,38,7,9,8,25,11,8,11,9,12,8,12,5,38,5,38,5,11,7,5,6,21,6,10,53,8,7,24,10,27,44,253,253,253,252,252,252,13,12,45,12,45,12,61,12,45,44,173];
const LEN = [2,35,36,53,38,23];
const DIST = [2,20,53,230,247,151,248];
const BASE = [3,2,4,5,6,7,8,9,10,12,16,24,40,72,136,264];
const EXTRA = [0,0,0,0,0,0,0,0,1,2,3,4,5,6,7,8];
const MAXBITS = 13;

function construct(rep) {
  const length = [];
  let symbol = 0;
  for (const b of rep) { let left = (b >> 4) + 1; const len = b & 15; while (left--) length[symbol++] = len; }
  const n = symbol;
  const count = new Array(MAXBITS + 1).fill(0);
  for (let s = 0; s < n; s++) count[length[s]]++;
  const offs = new Array(MAXBITS + 2).fill(0);
  for (let len = 1; len < MAXBITS; len++) offs[len + 1] = offs[len] + count[len];
  const sym = new Array(n).fill(0);
  for (let s = 0; s < n; s++) if (length[s] !== 0) sym[offs[length[s]]++] = s;
  return { count, symbol: sym };
}
const litcode = construct(LIT), lencode = construct(LEN), distcode = construct(DIST);

class Bits {
  constructor(buf) { this.buf = buf; this.pos = 0; this.bitbuf = 0; this.bitcnt = 0; }
  bits(need) {
    if (need === 0) return 0;
    let val = this.bitbuf;
    while (this.bitcnt < need) {
      if (this.pos >= this.buf.length) throw new Error("blast: fim inesperado da entrada");
      val |= this.buf[this.pos++] << this.bitcnt;
      this.bitcnt += 8;
    }
    this.bitbuf = val >>> need;
    this.bitcnt -= need;
    return val & ((1 << need) - 1);
  }
  decode(h) {                       // códigos do blast são LSB-first e INVERTIDOS
    let code = 0, first = 0, index = 0;
    for (let len = 1; len <= MAXBITS; len++) {
      code |= this.bits(1) ^ 1;
      const cnt = h.count[len];
      if (code - first < cnt) return h.symbol[index + (code - first)];
      index += cnt; first += cnt; first <<= 1; code <<= 1;
    }
    throw new Error("blast: código Huffman inválido");
  }
}

/** Descomprime um stream PKWARE DCL "implode" → Buffer. */
export function blast(compressed) {
  const s = new Bits(compressed);
  const lit = s.bits(8);            // 0 = literais crus (8 bits); 1 = literais codificados (Huffman)
  if (lit > 1) throw new Error("blast: flag de literal inválida (" + lit + ")");
  const dict = s.bits(8);           // log2(dicionário) : 4,5,6 → 1024/2048/4096
  if (dict < 4 || dict > 6) throw new Error("blast: dicionário inválido (" + dict + ")");
  // ═══ ERA UM ARRAY JS, E ISSO TINHA TETO ═══
  // A saída era `const out = []` com um `push` por BYTE descompactado, e `Buffer.from(out)` no fim.
  // O limite de FixedArray do V8 é ~536 milhões de elementos: passar disso lança "Invalid array length".
  // Medido em 10/ago: os DBC pequenos (CNES, SIM, SINASC) passavam e os GRANDES do SIA não —
  // PASC2410.dbc tem 97 MB comprimidos e estoura ao descompactar. Falha determinística POR TAMANHO,
  // e por isso parecia intermitente: dependia de qual fonte se olhava.
  // E o consumidor engolia: `catch { console.log("⚠ …") ; continue }` transformava o estouro em aviso,
  // o script terminava com ✔ e a tabela ficava VAZIA. Erro determinístico mascarado por resiliência —
  // exatamente o que já custou os doze ETLs de saúde da vez do alias que faltava.
  // Um Uint8Array que dobra de capacidade não tem esse teto, gasta 1 byte por byte (contra 8 do array de
  // SMIs) e ainda é mais rápido, porque não há boxing nem realocação de FixedArray a cada crescimento.
  let cap = 1 << 20, n = 0;
  let out = new Uint8Array(cap);
  const cresce = (precisa) => {
    if (n + precisa <= cap) return;
    while (cap < n + precisa) cap *= 2;
    const novo = new Uint8Array(cap); novo.set(out.subarray(0, n)); out = novo;
  };
  for (;;) {
    if (s.bits(1)) {                                   // 1 = par comprimento/distância
      const symbol = s.decode(lencode);
      const len = BASE[symbol] + s.bits(EXTRA[symbol]);
      if (len === 519) break;                          // código de fim
      const dbits = len === 2 ? 2 : dict;
      const dist = (s.decode(distcode) << dbits) + s.bits(dbits) + 1;
      cresce(len);
      // cópia LZ byte a byte: a origem pode se sobrepor ao destino (dist < len), então NÃO dá para usar
      // copyWithin em bloco — o padrão que se repete depende dos bytes recém-escritos.
      for (let i = 0; i < len; i++) { out[n] = out[n - dist]; n++; }
    } else {                                           // 0 = literal
      cresce(1);
      out[n++] = lit ? s.decode(litcode) : s.bits(8);
    }
  }
  return Buffer.from(out.buffer, 0, n);
}

/** .dbc (DATASUS) → .dbf. O cabeçalho DBF é copiado íntegro; os registros vêm do blast. */
export function dbc2dbf(dbc) {
  const headerSize = dbc[8] | (dbc[9] << 8);           // bytes 8-9 do DBF = tamanho do cabeçalho (funciona em Uint8Array e Buffer)
  const header = dbc.subarray(0, headerSize);
  // ⚠️ o stream PKWARE começa em headerSize + 4 (há 4 bytes de marcador/CRC entre o cabeçalho e os dados).
  // Validado 2026-07-17 no DOSC2021.dbc: assinatura lit=0/dict=6 exatamente em headerSize+4.
  const compressed = dbc.subarray(headerSize + 4);
  const registros = blast(compressed);
  return Buffer.concat([header, registros, Buffer.from([0x1a])]);   // 0x1A = marcador EOF do DBF
}

// ═══ decompressDbc: O NOME QUE 12 SCRIPTS IMPORTAM ═══
// Medido em 07/ago/2026 ao investigar por que sih_internacoes falhava 5/5: doze ETLs do DATASUS importam
// `decompressDbc` deste módulo, e o módulo nunca exportou esse nome — só `blast` e `dbc2dbf`. Todos morriam
// na PRIMEIRA LINHA, com SyntaxError de import, antes de tocar o FTP. Por isso a falha não tinha relação
// nenhuma com a fonte: o FTP do DATASUS responde em 2,8s e entrega 3,8 MB.
// Os doze: sih_internacoes, apac, cnes_equipamentos, cnes_equipes, cnes_leitos, cnes_profissionais, sim,
// sinasc, medicamentos_alto_custo, raas_saude_mental, sia_producao, sinan_agravos.
// O alias resolve os doze de uma vez, sem tocar em doze arquivos — e sem escolher qual nome é "o certo",
// porque ambos passam a existir.
export const decompressDbc = dbc2dbf;

// ── CLI ─────────────────────────────────────────────────────────────────────────────────────────────────────
if (process.argv[1] && process.argv[1].endsWith("_blast_dbc.mjs")) {
  const fs = await import("fs");
  const [inp, outp] = process.argv.slice(2);
  if (!inp) { console.error("uso: node scripts/_blast_dbc.mjs entrada.dbc [saida.dbf]"); process.exit(1); }
  const dbf = dbc2dbf(new Uint8Array(fs.readFileSync(inp)));
  // sanidade: nº de registros (bytes 4-7) × tamanho do registro (bytes 10-11) deve casar com o corpo
  const nRec = dbf[4] | (dbf[5] << 8) | (dbf[6] << 16) | (dbf[7] << 24);
  const hSize = dbf[8] | (dbf[9] << 8);
  const rSize = dbf[10] | (dbf[11] << 8);
  const esperado = hSize + nRec * rSize + 1;
  const bateu = Math.abs(dbf.length - esperado) <= 1;
  if (outp) { fs.writeFileSync(outp, dbf); console.log(`✔ ${outp} · ${dbf.length.toLocaleString()} bytes`); }
  console.log(`registros=${nRec.toLocaleString()} · tam_registro=${rSize} · saída=${dbf.length.toLocaleString()} · esperado=${esperado.toLocaleString()} · ${bateu ? "✅ CASOU (descompressão OK)" : "⚠️ NÃO casou — revisar o offset do cabeçalho/framing"}`);
}
