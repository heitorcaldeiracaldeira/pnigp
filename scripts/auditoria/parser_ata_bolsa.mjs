// PARSER da ATA DA SESSÃO (bolsa) — a marca da DISPENSA ELETRÔNICA vive AQUI, rotulada "Marca:/Modelo:".
// Achado (Heitor, 22/jul): o ERP (Betha/IPM) só PUBLICA no PNCP; a disputa eletrônica roda numa BOLSA (BLL,
// Compras.gov, BNC…) que gera a "Ata de Sessão" com o log de lances + a marca do vencedor ROTULADA:
//   ...Valor Unit.: 730,00 Valor Total: 2.190,00 Marca: Garthen Modelo: CG450
// A bolsa REAL vem da assinatura no TEXTO (o campo `plataforma`/`gerador` engana — diz Betha, mas a ata é BLL).
// Âncora dupla: o valor casa com unit_homologado; a marca é o rótulo. node scripts/auditoria/parser_ata_bolsa.mjs
import fs from "fs"; import path from "path"; import { fileURLToPath } from "url"; import pg from "pg";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATABASE_URL = fs.readFileSync(path.join(__dirname, "..", "..", ".env.local"), "utf8").match(/^DATABASE_URL=(.+)$/m)[1].trim();
const UF = (process.env.UF || "sc").toLowerCase();
const LIMIT = Number(process.env.LIMIT || 0);
const DRY = process.env.DRY === "1";
const ITENS = `itens_${UF}`, TXT = `arquivo_texto_${UF}`, CONF = `app.item_marca_conferida_${UF}`;
const db = new pg.Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 3, statement_timeout: 300000 });
const q = (s, p) => db.query(s, p);

// bolsa REAL pela assinatura no texto do doc (o gerador/plataforma engana)
function bolsaDoTexto(t) {
  const s = t.slice(0, 4000) + t.slice(-2000);
  if (/\bBLL\b|bllcompras|bolsa de licita/i.test(s)) return "bll";
  if (/comprasnet|compras\.gov|comprasgovbr/i.test(s)) return "compras_gov";
  if (/\bBNC\b|bnccompras|bolsa nacional de compras/i.test(s)) return "bnc";
  if (/licitanet/i.test(s)) return "licitanet";
  if (/licitar digital/i.test(s)) return "licitar_digital";
  if (/portal de compras p[úu]blicas|portaldecompras/i.test(s)) return "pcp";
  if (/bbmnet|bbm/i.test(s)) return "bbmnet";
  if (/publinexo|bionexo/i.test(s)) return "publinexo";
  return "bolsa_indef";
}
const brToNum = (s) => { const n = parseFloat(String(s).replace(/\./g, "").replace(",", ".")); return isFinite(n) ? n : null; };

async function main() {
  const lim = LIMIT ? `LIMIT ${LIMIT}` : "";
  // procs de Dispensa/Inexig com um doc de ATA/SESSÃO (a bolsa gera; título rápido por metadados)
  const procs = (await q(`
    SELECT DISTINCT c.cnpj, c.ano, c.seq FROM contratacoes_sc c
    WHERE c.modalidade_id IN (8,9)
      AND EXISTS(SELECT 1 FROM arquivos_sc a WHERE a.cnpj=c.cnpj AND a.ano=c.ano AND a.seq=c.seq
                 AND a.titulo ~* 'ata.*sess|sess.o.*p[úu]blic|sess.o final|ata de sess|resultado.*sess')
      AND EXISTS(SELECT 1 FROM ${ITENS} i WHERE i.cnpj=c.cnpj AND i.ano=c.ano AND i.seq=c.seq AND i.unit_homologado IS NOT NULL)
    ${lim}`)).rows;
  console.log(`[ata_bolsa] ${procs.length} processos com Ata de Sessão${DRY ? " · DRY" : ""}`);

  let procsOk = 0, itensMarca = 0; const porBolsa = {};
  const CONC = 6; let i = 0;
  await Promise.all(Array.from({ length: CONC }, async () => {
    while (i < procs.length) {
      const p = procs[i++];
      const doc = (await q(`SELECT texto FROM ${TXT} WHERE cnpj=$1 AND ano=$2 AND seq=$3
        AND titulo ~* 'ata.*sess|sess.o.*p[úu]blic|sess.o final|ata de sess|resultado.*sess' AND chars>500 ORDER BY chars DESC LIMIT 3`, [p.cnpj, p.ano, p.seq])).rows;
      if (!doc.length) continue;
      const texto = doc.map((d) => d.texto).join("\n");
      // extrai pares (valor, marca, modelo): "Valor Unit.: V ... Marca: X Modelo: Y"
      const pares = [];
      const re = /Valor\s*Unit[.\s]*:?\s*([\d.]+,\d{2})[\s\S]{0,90}?Marca:\s*([^\n]{1,40}?)\s*(?:Modelo:\s*([^\n]{1,30}?))?(?:\s{2,}|\n|Fabricante|Valor|Item|\d{2}\/\d{2})/gi;
      let m;
      while ((m = re.exec(texto))) {
        const valor = brToNum(m[1]); const marca = (m[2] || "").trim(); const modelo = (m[3] || "").trim();
        if (valor && marca && /[A-Za-zÀ-ÿ]{2}/.test(marca) && !/^\d/.test(marca)) pares.push({ valor, marca: marca.slice(0, 40), modelo: modelo.slice(0, 30) });
      }
      // fallback: "Marca: X Modelo: Y" sem valor colado — casa depois por descrição? por ora só os com valor.
      if (!pares.length) continue;
      const bolsa = bolsaDoTexto(texto);
      const itens = (await q(`SELECT numero, cnpj_fornecedor, unit_homologado FROM ${ITENS}
        WHERE cnpj=$1 AND ano=$2 AND seq=$3 AND unit_homologado IS NOT NULL`, [p.cnpj, p.ano, p.seq])).rows;
      const usados = new Set(); const grava = [];
      for (const par of pares) {
        const it = itens.find((x) => !usados.has(x.numero) && Math.abs(Number(x.unit_homologado) - par.valor) < 0.02);
        if (!it) continue;
        usados.add(it.numero); grava.push({ numero: it.numero, cnpj_f: it.cnpj_fornecedor, ...par });
      }
      if (grava.length) {
        procsOk++; itensMarca += grava.length; porBolsa[bolsa] = (porBolsa[bolsa] || 0) + grava.length;
        if (!DRY) {
          await q(`DELETE FROM ${CONF} WHERE cnpj=$1 AND ano=$2 AND seq=$3 AND portal='ata_bolsa'`, [p.cnpj, p.ano, p.seq]);
          for (const g of grava) {
            await q(`INSERT INTO ${CONF}(cnpj,ano,seq,numero,marca,modelo,fornecedor_cnpj,valor,marca_generica,cnpj_ok,valor_ok,portal,fonte_titulo)
              VALUES($1,$2,$3,$4,$5,$6,$7,$8,false,false,true,'ata_bolsa',$9)
              ON CONFLICT (cnpj,ano,seq,numero) DO NOTHING`,
              [p.cnpj, p.ano, p.seq, String(g.numero), g.marca, g.modelo || null, g.cnpj_f, g.valor, "Ata Sessão · " + bolsa]);
          }
        }
      }
    }
  }));
  console.log(`\n✔ ${procsOk}/${procs.length} procs renderam marca · ${itensMarca} itens (âncora por valor + rótulo Marca:)`);
  console.log(`  por bolsa (de onde a ata veio):`, JSON.stringify(porBolsa));
  await db.end();
}
main().catch((e) => { console.error("ERRO:", e.message); process.exit(1); });
