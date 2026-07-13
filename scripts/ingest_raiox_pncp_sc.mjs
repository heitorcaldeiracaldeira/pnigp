// RAIO-X ESTRUTURADO do processo licitatório — metadata oficial do PNCP, via endpoint de LISTAGEM EM LOTE
// (/contratacoes/publicacao por data+UF+modalidade, até 500/página) → MUITO menos requisições que 1 chamada/compra.
// Por compra guarda: PLATAFORMA (usuarioNome, chave p/ rotear o parser de ata), MODALIDADE, modo de disputa, SRP,
// instrumento, valor ESTIMADO × HOMOLOGADO (economia real), datas, situação. Grava compra_raiox_sc (cnpj/ano/seq),
// idempotente (UPSERT) e RESUMÍVEL por janela (mês×modalidade) em _raiox_janela. Backoff em 429. node scripts/ingest_raiox_pncp_sc.mjs
import fs from "fs"; import path from "path"; import { fileURLToPath } from "url"; import pg from "pg";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATABASE_URL = fs.readFileSync(path.join(__dirname, "..", ".env.local"), "utf8").match(/^DATABASE_URL=(.+)$/m)[1].trim();
const CONS = "https://pncp.gov.br/api/consulta/v1/contratacoes/publicacao";
const MODALIDADES = (process.env.MODALIDADES || "1,2,3,4,5,6,7,8,9,10,11,12,13").split(",").map(Number);
const ANO_INI = Number(process.env.ANO_INI || 2024);
const ANO_FIM = Number(process.env.ANO_FIM || 2026);
const num = (x) => (x == null || x === "" ? null : Number(x));
const dt = (s) => (s ? String(s).slice(0, 19) : null);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// meses do período (yyyyMM01..fim do mês)
function janelas() {
  const out = [];
  for (let a = ANO_INI; a <= ANO_FIM; a++) for (let m = 1; m <= 12; m++) {
    const ini = `${a}${String(m).padStart(2, "0")}01`;
    const fimDia = new Date(Date.UTC(a, m, 0)).getUTCDate();
    out.push({ ano: a, mes: m, ini, fim: `${a}${String(m).padStart(2, "0")}${String(fimDia).padStart(2, "0")}` });
  }
  return out;
}
async function getBulk(mod, ini, fim, pagina) {
  const url = `${CONS}?dataInicial=${ini}&dataFinal=${fim}&codigoModalidadeContratacao=${mod}&uf=SC&pagina=${pagina}&tamanhoPagina=50`;
  for (let t = 0; ; t++) {
    let r; try { r = await fetch(url, { signal: AbortSignal.timeout(25000) }); } catch (e) { if (t >= 5) throw e; await sleep(3000 * (t + 1)); continue; }
    if (r.status === 429) { if (t >= 8) throw new Error("429 persistente"); await sleep(8000 * (t + 1)); continue; }
    if (r.status === 204) return { data: [], totalPaginas: 0 };
    if (!r.ok) { if (t >= 3) return { data: [], totalPaginas: 0 }; await sleep(2000 * (t + 1)); continue; }
    return await r.json();
  }
}

async function main() {
  const db = new pg.Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 3, statement_timeout: 120000 });
  db.on("error", () => {});
  const q = async (s, p) => { for (let i = 0; ; i++) { try { return await db.query(s, p); } catch (e) { if (i >= 2) throw e; await sleep(1200 * (i + 1)); } } };
  await q(`CREATE TABLE IF NOT EXISTS compra_raiox_sc (
    cod_ibge TEXT, cnpj TEXT, ano INT, seq INT, esfera TEXT, plataforma TEXT, modalidade_id INT, modalidade TEXT, modo_disputa TEXT,
    srp BOOLEAN, instrumento TEXT, valor_estimado NUMERIC, valor_homologado NUMERIC, economia_pct NUMERIC,
    numero_compra TEXT, processo TEXT, objeto TEXT, situacao TEXT, emenda_parlamentar BOOLEAN,
    amparo_legal TEXT, data_publicacao TEXT, data_abertura TEXT, data_encerramento TEXT, atualizado timestamptz DEFAULT now(),
    PRIMARY KEY (cnpj, ano, seq))`);
  await q(`CREATE INDEX IF NOT EXISTS ix_raiox_cod ON compra_raiox_sc (cod_ibge)`);
  await q(`CREATE INDEX IF NOT EXISTS ix_raiox_plat ON compra_raiox_sc (plataforma)`);
  await q(`CREATE TABLE IF NOT EXISTS _raiox_janela (mod INT, ano INT, mes INT, n INT, feito_em timestamptz DEFAULT now(), PRIMARY KEY (mod,ano,mes))`);
  // mapa cnpj→cod_ibge (dos itens já ingeridos) p/ carimbar o município
  const codByCnpj = new Map((await q(`SELECT DISTINCT cnpj, cod_ibge FROM itens_sc WHERE cod_ibge IS NOT NULL`)).rows.map((r) => [r.cnpj, r.cod_ibge]));

  const js = janelas(); let totGrav = 0, jaFeitas = 0;
  for (const mod of MODALIDADES) for (const j of js) {
    if ((await q(`SELECT 1 FROM _raiox_janela WHERE mod=$1 AND ano=$2 AND mes=$3`, [mod, j.ano, j.mes])).rowCount) { jaFeitas++; continue; }
    let pagina = 1, tp = 1, nJanela = 0;
    do {
      const r = await getBulk(mod, j.ini, j.fim, pagina).catch(() => ({ data: [], totalPaginas: 0 }));
      tp = r.totalPaginas || 0; const lista = r.data || [];
      for (const o of lista) {
        const cnpj = o.orgaoEntidade?.cnpj; if (!cnpj) continue;
        const est = num(o.valorTotalEstimado), hom = num(o.valorTotalHomologado);
        const econ = est && hom && est > 0 ? Math.round((1 - hom / est) * 1000) / 10 : null;
        await q(`INSERT INTO compra_raiox_sc (cod_ibge,cnpj,ano,seq,esfera,plataforma,modalidade_id,modalidade,modo_disputa,srp,instrumento,
            valor_estimado,valor_homologado,economia_pct,numero_compra,processo,objeto,situacao,emenda_parlamentar,amparo_legal,
            data_publicacao,data_abertura,data_encerramento)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23)
          ON CONFLICT (cnpj,ano,seq) DO UPDATE SET plataforma=EXCLUDED.plataforma, modalidade=EXCLUDED.modalidade, modo_disputa=EXCLUDED.modo_disputa,
            srp=EXCLUDED.srp, valor_estimado=EXCLUDED.valor_estimado, valor_homologado=EXCLUDED.valor_homologado, economia_pct=EXCLUDED.economia_pct,
            situacao=EXCLUDED.situacao, cod_ibge=COALESCE(EXCLUDED.cod_ibge, compra_raiox_sc.cod_ibge), atualizado=now()`,
          [codByCnpj.get(cnpj) || null, cnpj, num(o.anoCompra), num(o.sequencialCompra), o.orgaoEntidade?.esferaId || null, o.usuarioNome || null,
           num(o.modalidadeId), o.modalidadeNome || null, o.modoDisputaNome || null, o.srp === true, o.tipoInstrumentoConvocatorioNome || null,
           est, hom, econ, o.numeroCompra || null, o.processo || null, String(o.objetoCompra || "").slice(0, 500), o.situacaoCompraNome || null,
           o.emendaParlamentar === true, String(o.amparoLegal?.nome || o.amparoLegal?.descricao || "").slice(0, 160),
           dt(o.dataPublicacaoPncp), dt(o.dataAberturaProposta), dt(o.dataEncerramentoProposta)]);
        totGrav++; nJanela++;
      }
      pagina++;
    } while (pagina <= tp);
    await q(`INSERT INTO _raiox_janela (mod,ano,mes,n) VALUES ($1,$2,$3,$4) ON CONFLICT (mod,ano,mes) DO UPDATE SET n=EXCLUDED.n, feito_em=now()`, [mod, j.ano, j.mes, nJanela]);
    if (nJanela) process.stdout.write(`  mod ${mod} ${j.ano}-${String(j.mes).padStart(2, "0")}: ${nJanela} · total ${totGrav}\r`);
  }
  console.log(`\n✔ ${totGrav.toLocaleString()} compras gravadas (janelas já feitas puladas: ${jaFeitas})`);
  const s = (await q(`SELECT count(*) n, count(DISTINCT plataforma) plats, count(*) FILTER (WHERE economia_pct IS NOT NULL) c_econ FROM compra_raiox_sc`)).rows[0];
  console.log(`ACUMULADO: ${Number(s.n).toLocaleString()} compras · ${s.plats} plataformas · ${Number(s.c_econ).toLocaleString()} com economia`);
  await db.end();
}
main().catch((e) => { console.error("ERRO:", e.message); process.exit(1); });
