// PARSER do TERMO DE HOMOLOGAÇÃO — a marca da DISPENSA vive AQUI (achado do Heitor, 22/jul), não na ata nem na proposta.
// Doc: "Termo de Homologação / Adjudicação / Processo Administrativo". Tabela:
//   Item | Material/Serviço | Unid. medida | Marca | Quantidade | Valor unitário | Valor total
// O layout VARIA (marca preenchida "UN Zatti 4 175,00" · vazia "1,000 KG 9,19" · marca na descrição "MERCOSUL 3M").
// ESTRATÉGIA: âncora no VALOR (unit_homologado, que já conhecemos) — acha o valor no texto e extrai a marca do que
// vem ANTES (entre a unidade e a quantidade). Trava dupla: o valor casa por definição; a marca é o resíduo textual.
//   node scripts/auditoria/parser_termo_homologacao.mjs        (LIMIT=N · PLAT=<plataforma> · DRY=1)
import fs from "fs"; import path from "path"; import { fileURLToPath } from "url"; import pg from "pg";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATABASE_URL = fs.readFileSync(path.join(__dirname, "..", "..", ".env.local"), "utf8").match(/^DATABASE_URL=(.+)$/m)[1].trim();
const UF = (process.env.UF || "sc").toLowerCase();
const LIMIT = Number(process.env.LIMIT || 0);
const PLAT = process.env.PLAT || null;          // filtra por plataforma; null = todas
const DRY = process.env.DRY === "1";
const ITENS = `itens_${UF}`, TXT = `arquivo_texto_${UF}`, CONF = `app.item_marca_conferida_${UF}`;
const db = new pg.Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 3, statement_timeout: 300000 });
const q = (s, p) => db.query(s, p);

// unidades de medida que aparecem coladas ao valor (o marcador de "fim da coluna Marca / início de qtd")
const UNID = "UN|UND|UNI|UNID|UNIDADE|PC|PÇ|PCT|CX|CT|KG|LT|L|MT|M|PAR|FR|GL|DZ|MÇ|BD|RL|KIT|JG|SC|RESMA|AMP|FRS|GRS|ML|MG|TON|CE|CJ|BL|RM";
// gera o valor em formatos BR (com milhar; 2 e 4 casas)
function fmts(v) {
  const mil = (i) => i.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  const [i2, d2] = v.toFixed(2).split("."); const [i4, d4] = v.toFixed(4).split(".");
  return [...new Set([`${mil(i2)},${d2}`, `${mil(i4)},${d4}`])];
}
// dado o texto ANTES do valor, extrai a marca (token entre a unidade e a quantidade)
function marcaAntes(pre) {
  // caso A — coluna Marca preenchida: "... <unidade> <MARCA> <qtd>" (qtd = número no fim do pre)
  let m = pre.match(new RegExp(`\\b(?:${UNID})\\.?\\s+([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ0-9 .&/+\\-]{1,34}?)\\s+[\\d]{1,3}(?:[.,]\\d{1,3})?\\s*$`, "i"));
  if (m) { const c = limpa(m[1]); if (c) return c; }
  return null;
}
function limpa(s) {
  let c = String(s).replace(/\s+/g, " ").trim();
  if (c.length < 2 || !/[A-Za-zÀ-ÿ]{2}/.test(c)) return null;
  // rejeita ruído comum (unidade solta, palavras de cabeçalho, descrição longa demais)
  if (new RegExp(`^(${UNID})$`, "i").test(c)) return null;
  if (/^(total|valor|marca|quant|unid|item|material|servi|r\$|de |da |do |para|com)\b/i.test(c)) return null;
  if (c.length > 40) return null;
  return c;
}

async function main() {
  const platCond = PLAT ? `AND c.plataforma = '${PLAT.replace(/'/g, "''")}'` : "";
  const lim = LIMIT ? `LIMIT ${LIMIT}` : "";
  // procs de Dispensa/Inexig com Termo de Homologação e itens homologados SEM marca conferida
  const procs = (await q(`
    SELECT DISTINCT c.cnpj, c.ano, c.seq FROM contratacoes_sc c
    WHERE c.modalidade_id IN (8,9) ${platCond}
      AND EXISTS(SELECT 1 FROM arquivos_sc a WHERE a.cnpj=c.cnpj AND a.ano=c.ano AND a.seq=c.seq AND a.titulo ~* 'termo de homolog|adjudica|processo administrativo|processo.*licitat')
      AND EXISTS(SELECT 1 FROM ${ITENS} i WHERE i.cnpj=c.cnpj AND i.ano=c.ano AND i.seq=c.seq AND i.unit_homologado IS NOT NULL)
    ${lim}`)).rows;
  console.log(`[termo_homolog] ${procs.length} processos com Termo de Homologação${PLAT ? " · " + PLAT : ""}${DRY ? " · DRY" : ""}`);

  let comMarca = 0, itensMarca = 0, procsOk = 0;
  const CONC = 6; let i = 0;
  await Promise.all(Array.from({ length: CONC }, async () => {
    while (i < procs.length) {
      const p = procs[i++];
      const doc = (await q(`SELECT texto FROM ${TXT} WHERE cnpj=$1 AND ano=$2 AND seq=$3
        AND titulo ~* 'termo de homolog|adjudica|processo administrativo|processo.*licitat' AND chars>500 ORDER BY chars DESC LIMIT 2`, [p.cnpj, p.ano, p.seq])).rows;
      if (!doc.length) continue;
      const texto = doc.map((d) => d.texto).join("\n");
      const itens = (await q(`SELECT numero, cnpj_fornecedor, unit_homologado FROM ${ITENS}
        WHERE cnpj=$1 AND ano=$2 AND seq=$3 AND unit_homologado IS NOT NULL`, [p.cnpj, p.ano, p.seq])).rows;
      const achados = [];
      for (const it of itens) {
        const v = Number(it.unit_homologado); if (!(v > 0)) continue;
        for (const f of fmts(v)) {
          let idx = -1;
          // procura o valor SEGUIDO de outro número (valor_total) — evita casar valores soltos
          const re = new RegExp(`${f.replace(/\./g, "\\.")}\\s+[\\d.]`);
          const mm = re.exec(texto); if (!mm) continue;
          idx = mm.index;
          const marca = marcaAntes(texto.slice(Math.max(0, idx - 60), idx));
          if (marca) { achados.push({ numero: it.numero, cnpj_f: it.cnpj_fornecedor, valor: v, marca }); break; }
        }
      }
      if (achados.length) {
        procsOk++; itensMarca += achados.length;
        if (!DRY) {
          await q(`DELETE FROM ${CONF} WHERE cnpj=$1 AND ano=$2 AND seq=$3 AND portal='termo_homolog'`, [p.cnpj, p.ano, p.seq]);
          for (const a of achados) {
            await q(`INSERT INTO ${CONF}(cnpj,ano,seq,numero,marca,fornecedor_cnpj,valor,marca_generica,cnpj_ok,valor_ok,portal,fonte_titulo)
              VALUES($1,$2,$3,$4,$5,$6,$7,false,false,true,'termo_homolog','Termo de Homologação')
              ON CONFLICT (cnpj,ano,seq,numero) DO NOTHING`,
              [p.cnpj, p.ano, p.seq, String(a.numero), a.marca, a.cnpj_f, a.valor]);
          }
        }
      }
    }
  }));
  console.log(`\n✔ ${procsOk}/${procs.length} procs renderam marca · ${itensMarca} itens com marca (ancorada por valor)`);
  console.log(`  taxa: ${procs.length ? (procsOk / procs.length * 100).toFixed(1) : 0}% dos procs`);
  await db.end();
}
main().catch((e) => { console.error("ERRO:", e.message); process.exit(1); });
