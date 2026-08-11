// ETL — SINAN agravos de notificação por município (residência), série. Fonte: DATASUS SINAN (DBC nacional, filtra SC). Usa _blast_dbc.mjs.
// Agravos: tuberculose, hanseníase, violência interpessoal/autoprovocada. node scripts/ingest_sinan_agravos_sc.mjs
import fs from "fs"; import os from "os"; import path from "path"; import { execFileSync } from "child_process"; import pg from "pg";
import { decompressDbc } from "./_blast_dbc.mjs";
const DATABASE_URL = fs.readFileSync("C:/Users/PC/pnigp/.env.local", "utf8").match(/^DATABASE_URL=(.+)$/m)[1].trim();
const ANOS = (process.env.ANOS || "2021,2022,2023,2024").split(",").map(Number);
const AGRAVOS = [{ cod: "TUBE", nome: "Tuberculose" }, { cod: "HANS", nome: "Hanseníase" }, { cod: "VIOL", nome: "Violência interpessoal/autoprovocada" }];
function parseDbf(buf) { const nrec = buf.readUInt32LE(4), hlen = buf.readUInt16LE(8), rlen = buf.readUInt16LE(10); const campos = {}; let off = 1; for (let o = 32; o < hlen - 1; o += 32) { const nm = buf.subarray(o, o + 11).toString("latin1").replace(/\0.*$/, ""); if (!nm) break; campos[nm] = { off, len: buf[o + 16] }; off += buf[o + 16]; } return { campos, hlen, rlen, nrec, buf }; }
const fld = (d, rec, n) => { const c = d.campos[n]; return c ? d.buf.subarray(rec + c.off, rec + c.off + c.len).toString("latin1").trim() : ""; };

async function run() {
  const db = new pg.Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 3 });
  db.on("error", () => {});
  const by6 = new Map((await db.query(`SELECT cod_ibge FROM entes_sc WHERE tipo='M'`)).rows.map((e) => [e.cod_ibge.slice(0, 6), e.cod_ibge]));
  const dir = process.env.DIR || os.tmpdir();
  const M = new Map(); // cod -> Map("agravo|ano" -> casos)
  const carregados = new Set();   // pares (agravo|ano) que REALMENTE vieram — é a chave do conserto abaixo

  for (const ag of AGRAVOS) {
    for (const ano of ANOS) {
      const yy = String(ano).slice(2);
      const dp = path.join(dir, `${ag.cod}BR${yy}.dbc`);
      // ═══ O SINAN TEM DOIS DIRETÓRIOS, E ESTE SCRIPT SÓ OLHAVA UM ═══
      // `FINAIS` guarda o ano fechado; `PRELIM`, o que ainda está sendo consolidado. Medido em 10/ago:
      // tuberculose em FINAIS para em 2019 — TUBEBR20 a TUBEBR25 estão TODOS em PRELIM. Por isso a fonte
      // dizia "TUBE 2021: sem arquivo" em todos os anos e a tabela nunca teve uma linha de tuberculose,
      // com o script terminando em ✔. O mesmo vale para HANS 2026 e VIOL 2025.
      // Procura no fechado primeiro (é o dado revisado) e cai no preliminar quando não houver.
      for (const base of ["FINAIS", "PRELIM"]) {
        if (fs.existsSync(dp) && fs.statSync(dp).size >= 1e3) break;
        try { execFileSync("curl", ["-sS", "--fail", "--max-time", "1800", "--speed-limit", "1024", "--speed-time", "60",
          `ftp://ftp.datasus.gov.br/dissemin/publicos/SINAN/DADOS/${base}/${ag.cod}BR${yy}.dbc`, "-o", dp], { stdio: "ignore" }); } catch (e) { /* tenta o outro diretório */ }
      }
      if (!fs.existsSync(dp) || fs.statSync(dp).size < 1e3) { console.log(`  ⚠ ${ag.cod} ${ano}: sem arquivo em FINAIS nem PRELIM`); continue; }
      let d; try { d = parseDbf(decompressDbc(fs.readFileSync(dp))); } catch (e) { console.log(`  ⚠ ${ag.cod} ${ano}: ${e.message.slice(0, 25)}`); continue; }
      const fMun = d.campos.ID_MN_RESI ? "ID_MN_RESI" : (d.campos.ID_MUNICIP ? "ID_MUNICIP" : null); if (!fMun) { console.log(`  ⚠ ${ag.cod}: sem campo município`); continue; }
      let n = 0;
      for (let i = 0; i < d.nrec; i++) {
        const rec = d.hlen + i * d.rlen; if (d.buf[rec] === 0x2a) continue;
        const cod = by6.get(fld(d, rec, fMun).slice(0, 6)); if (!cod) continue;
        const k = ag.cod + "|" + ano; if (!M.has(cod)) M.set(cod, new Map()); const mm = M.get(cod); mm.set(k, (mm.get(k) || 0) + 1); n++;
      }
      carregados.add(ag.cod + "|" + ano);
      console.log(`  ✓ ${ag.cod} ${ano}: ${n} casos SC (de ${d.nrec.toLocaleString("pt-BR")} nac.)`);
    }
  }

  await db.query(`CREATE TABLE IF NOT EXISTS sinan_agravos_sc (cod_ibge TEXT, agravo TEXT, ano INTEGER, casos INTEGER, atualizado TIMESTAMPTZ DEFAULT now(), PRIMARY KEY (cod_ibge, agravo, ano))`);
  // ═══ O TRUNCATE APAGAVA O QUE JÁ ESTAVA CERTO PARA REGRAVAR SÓ O QUE PASSOU ═══
  // Era `TRUNCATE` seguido dos inserts do que a rodada conseguiu. Com parte das combinações falhando —
  // e falhavam 9 de 12, entre o teto do descompressor e o diretório PRELIM que não era consultado —
  // cada execução ZERAVA a tabela e devolvia só o pedaço bom. Por isso ela nunca acumulava: um agravo que
  // tinha carregado na semana passada sumia na semana seguinte se o arquivo dele falhasse.
  // É o desenho que transforma uma falha PARCIAL e temporária em PERDA TOTAL e permanente.
  //
  // A substituição passa a ser na granularidade do que de fato veio: para cada par (agravo, ano)
  // CARREGADO, apaga e regrava; o par que não veio fica intacto, com o dado da última vez que deu certo.
  // Isso preserva também a semântica que o TRUNCATE dava de graça — município que deixou de ter caso
  // naquele agravo/ano some, porque o par inteiro é reescrito, não só as linhas novas.
  // Tudo numa transação: ou a rodada troca o conjunto, ou não troca nada.
  if (!carregados.size) {
    console.log("⚠ nenhum par (agravo, ano) carregou — a tabela fica como estava, e isto NÃO é sucesso");
    await db.end(); process.exit(1);
  }
  const L = [];
  for (const [cod, mm] of M) for (const [k, casos] of mm) { const [ag, ano] = k.split("|"); L.push([cod, ag, +ano, casos]); }
  const antes = Number((await db.query(`SELECT count(*) n FROM sinan_agravos_sc`)).rows[0].n);
  await db.query("BEGIN");
  try {
    for (const par of carregados) {
      const [ag, ano] = par.split("|");
      await db.query(`DELETE FROM sinan_agravos_sc WHERE agravo=$1 AND ano=$2`, [ag, +ano]);
    }
    if (L.length) {
      await db.query(`INSERT INTO sinan_agravos_sc (cod_ibge,agravo,ano,casos,atualizado)
        SELECT c, a, an, cs, now() FROM unnest($1::text[], $2::text[], $3::int[], $4::int[]) AS z(c,a,an,cs)`,
        [L.map((x) => x[0]), L.map((x) => x[1]), L.map((x) => x[2]), L.map((x) => x[3])]);
    }
    await db.query("COMMIT");
  } catch (e) { await db.query("ROLLBACK"); throw e; }

  const total = Number((await db.query(`SELECT count(*) n FROM sinan_agravos_sc`)).rows[0].n);
  const esperados = AGRAVOS.length * ANOS.length;
  const chk = (await db.query(`SELECT agravo, sum(casos) c FROM sinan_agravos_sc WHERE ano=(SELECT max(ano) FROM sinan_agravos_sc) GROUP BY agravo`)).rows;
  console.log(`${carregados.size < esperados ? "⚠" : "✔"} sinan_agravos_sc: ${total} linhas (eram ${antes}) · ${carregados.size}/${esperados} pares carregados · último ano SC: ${chk.map((r) => r.agravo + " " + r.c).join(", ")}`);
  if (carregados.size < esperados) {
    const faltam = AGRAVOS.flatMap((a) => ANOS.map((y) => a.cod + "|" + y)).filter((p) => !carregados.has(p));
    console.log(`  NÃO carregaram (dado anterior preservado): ${faltam.join(", ")}`);
    process.exitCode = 1;   // carregar parte não é sucesso: o catálogo tem de ver
  }
  await db.end();
}
run().catch((e) => { console.error("ERRO:", e.message); process.exit(1); });
