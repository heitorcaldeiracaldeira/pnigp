// Fase 2 — Compras OFICIAIS (PNCP) de Santa Catarina, agregadas por ente no banco.
// Para cada ente de entes_sc: contratações 2024 (PNCP), esfera municipal (ou estadual),
// principais modalidades, paginação limitada. Idempotente (UPSERT). node scripts/ingest_compras_sc.mjs
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import pg from "pg";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const env = fs.readFileSync(path.join(__dirname, "..", ".env.local"), "utf8");
const DATABASE_URL = env.match(/^DATABASE_URL=(.+)$/m)[1].trim();

const ANO = Number(process.env.ANO) || 2024;
const DI = `${ANO}0101`, DF = `${ANO}1231`;
const CAP_PAGINAS = 2000; // fidelidade total: pagina até totalPaginas (cobre o Estado, ~479 págs); avisa se exceder
const sleep = (ms) => new Promise((s) => setTimeout(s, ms));
const PNCP = "https://pncp.gov.br/api/consulta/v1/contratacoes/publicacao";
// modalidades principais p/ compras municipais (4 Concorrência Elet., 6 Pregão Elet., 8 Dispensa, 9 Inexig.)
const MODALIDADES = [
  { id: 6, nome: "Pregão Eletrônico", lic: true },
  { id: 8, nome: "Dispensa", lic: false },
  { id: 4, nome: "Concorrência Eletrônica", lic: true },
  { id: 9, nome: "Inexigibilidade", lic: false },
  { id: 12, nome: "Credenciamento", lic: true },
  { id: 7, nome: "Pregão Presencial", lic: true },
  { id: 5, nome: "Concorrência", lic: true },
  { id: 13, nome: "Leilão", lic: true },
  { id: 1, nome: "Leilão Eletrônico", lic: true },
  { id: 3, nome: "Concurso", lic: true },
];
const r2 = (n) => Math.round((n || 0) * 100) / 100;

async function fetchPagina(modId, esfera, codIbge, pagina) {
  const geo = codIbge === "42" ? "uf=SC" : `codigoMunicipioIbge=${codIbge}`;
  const url = `${PNCP}?dataInicial=${DI}&dataFinal=${DF}&codigoModalidadeContratacao=${modId}&${geo}&pagina=${pagina}&tamanhoPagina=50`;
  for (let t = 0; t < 7; t++) {
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(40000) });
      if (r.status === 204) return { data: [], totalPaginas: 0 };
      if (r.status === 429) { await sleep(8000 + t * 4000); continue; } // rate limit: espera e tenta de novo
      if (!r.ok) throw new Error("HTTP " + r.status);
      return await r.json();
    } catch (e) {
      await sleep(1000 * (t + 1));
    }
  }
  return null;
}

async function coletarEnte(ente) {
  const esferaAlvo = ente.tipo === "E" ? "E" : "M";
  let contratos = [];
  for (const mod of MODALIDADES) {
    let pagina = 1, totalPaginas = 1;
    do {
      await sleep(120); // throttle p/ não estourar o rate limit
      const j = await fetchPagina(mod.id, esferaAlvo, ente.cod_ibge, pagina);
      if (!j) break;
      totalPaginas = j.totalPaginas || 0;
      for (const x of j.data || []) {
        if ((x.orgaoEntidade?.esferaId) !== esferaAlvo) continue;
        contratos.push({
          objeto: (x.objetoCompra || "").slice(0, 240),
          modalidade: mod.nome,
          lic: mod.lic,
          orgao: x.orgaoEntidade?.razaoSocial || "",
          estimado: +x.valorTotalEstimado || 0,
          homologado: +x.valorTotalHomologado || 0,
          data: (x.dataPublicacaoPncp || "").slice(0, 10),
          cnpj: x.orgaoEntidade?.cnpj || "",
          ano: +x.anoCompra || 0,
          seq: +x.sequencialCompra || 0,
        });
      }
      pagina++;
    } while (pagina <= totalPaginas && pagina <= CAP_PAGINAS);
    if (totalPaginas > CAP_PAGINAS) console.log(`  ! TRUNCADO: ${ente.cod_ibge} mod ${mod.nome} tem ${totalPaginas} págs (>CAP ${CAP_PAGINAS}) — revisar fidelidade`);
  }
  return contratos;
}

function agregar(contratos) {
  const n = contratos.length;
  const valor_homologado = r2(contratos.reduce((s, c) => s + c.homologado, 0));
  const comEstHom = contratos.filter((c) => c.estimado > 0 && c.homologado > 0);
  const estSoma = r2(comEstHom.reduce((s, c) => s + c.estimado, 0));
  const homSoma = r2(comEstHom.reduce((s, c) => s + c.homologado, 0));
  const economia_pct = estSoma > 0 ? r2(((estSoma - homSoma) / estSoma) * 100) : 0;
  const valorSemLic = r2(contratos.filter((c) => !c.lic).reduce((s, c) => s + c.homologado, 0));
  const dispensa_pct = valor_homologado > 0 ? r2((valorSemLic / valor_homologado) * 100) : 0;
  const porMod = {};
  for (const c of contratos) {
    porMod[c.modalidade] = porMod[c.modalidade] || { modalidade: c.modalidade, n: 0, valor: 0 };
    porMod[c.modalidade].n++;
    porMod[c.modalidade].valor = r2(porMod[c.modalidade].valor + c.homologado);
  }
  const por_modalidade = Object.values(porMod).sort((a, b) => b.valor - a.valor);
  const top = [...contratos].sort((a, b) => b.homologado - a.homologado).slice(0, 15).map((c) => ({
    objeto: c.objeto, modalidade: c.modalidade, orgao: c.orgao,
    estimado: r2(c.estimado), homologado: r2(c.homologado),
    economia_pct: c.estimado > 0 && c.homologado > 0 ? r2(((c.estimado - c.homologado) / c.estimado) * 100) : null,
    data: c.data, cnpj: c.cnpj, ano: c.ano, seq: c.seq,
  }));
  return { n_contratos: n, valor_estimado: estSoma, valor_homologado, economia_pct, dispensa_pct, por_modalidade, top };
}

async function pool(items, conc, fn) {
  let i = 0, done = 0;
  await Promise.all(Array.from({ length: conc }, async () => {
    while (i < items.length) {
      const it = items[i++];
      await fn(it);
      if (++done % 20 === 0) console.log(`  …${done}/${items.length}`);
    }
  }));
}

async function main() {
  const db = new pg.Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 4, idleTimeoutMillis: 8000, connectionTimeoutMillis: 20000 });
  db.on("error", (e) => console.warn("aviso pool:", e.message)); // não derruba o processo em desconexão ociosa
  await db.query(`
    CREATE TABLE IF NOT EXISTS compras_sc (
      cod_ibge TEXT NOT NULL, ano INTEGER NOT NULL,
      n_contratos INTEGER, valor_estimado NUMERIC(16,2), valor_homologado NUMERIC(16,2),
      economia_pct NUMERIC(7,2), dispensa_pct NUMERIC(7,2),
      por_modalidade JSONB, top JSONB,
      PRIMARY KEY (cod_ibge, ano) );
    CREATE TABLE IF NOT EXISTS compras_sc_vazios (cod_ibge TEXT PRIMARY KEY);`);
  if (process.env.LIMPAR === "1") { await db.query(`TRUNCATE compras_sc, compras_sc_vazios`); console.log("tabelas de compras limpas (re-ingestão completa)"); }
  const entes = (await db.query(`SELECT cod_ibge, tipo FROM entes_sc ORDER BY (tipo='E') DESC, cod_ibge`)).rows;
  // retomar: pular os que já têm compras OU já foram marcados como vazios
  // retomar: pular só os que já têm compras DESTE ano (vazios não entram, p/ suportar múltiplos anos)
  const feitos = new Set((await db.query(`SELECT cod_ibge FROM compras_sc WHERE ano=${ANO}`)).rows.map((r) => r.cod_ibge));
  const pendentes = entes.filter((e) => !feitos.has(e.cod_ibge));
  console.log(`Coletando compras PNCP ${ANO}: ${pendentes.length} pendentes (${feitos.size} já feitos) de ${entes.length}...`);
  let comDados = 0, vazios = 0;
  async function gravar(sql, params) {
    for (let t = 0; t < 4; t++) { try { return await db.query(sql, params); } catch (e) { await new Promise((s) => setTimeout(s, 700 * (t + 1))); } }
  }
  await pool(pendentes, 2, async (ente) => {
    let contratos = [];
    try { contratos = await coletarEnte(ente); } catch { contratos = []; }
    if (!contratos.length) {
      await gravar(`INSERT INTO compras_sc_vazios (cod_ibge) VALUES ($1) ON CONFLICT DO NOTHING`, [ente.cod_ibge]);
      vazios++; return;
    }
    const ag = agregar(contratos);
    await gravar(
      `INSERT INTO compras_sc (cod_ibge,ano,n_contratos,valor_estimado,valor_homologado,economia_pct,dispensa_pct,por_modalidade,top)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       ON CONFLICT (cod_ibge,ano) DO UPDATE SET n_contratos=EXCLUDED.n_contratos,valor_estimado=EXCLUDED.valor_estimado,valor_homologado=EXCLUDED.valor_homologado,economia_pct=EXCLUDED.economia_pct,dispensa_pct=EXCLUDED.dispensa_pct,por_modalidade=EXCLUDED.por_modalidade,top=EXCLUDED.top`,
      [ente.cod_ibge, ANO, ag.n_contratos, ag.valor_estimado, ag.valor_homologado, ag.economia_pct, ag.dispensa_pct, JSON.stringify(ag.por_modalidade), JSON.stringify(ag.top)],
    );
    comDados++;
  });
  const c = await db.query(`SELECT count(*) n FROM compras_sc`);
  console.log(`Compras concluído: novos c/ compras=${comDados} | novos vazios=${vazios} | total linhas=${c.rows[0].n}`);
  await db.end();
}
main().catch((e) => { console.error("ERRO:", e); process.exit(1); });
