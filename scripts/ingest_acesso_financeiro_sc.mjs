// ETL — Acesso e movimento financeiro por município (BCB Olinda). SÉRIE HISTÓRICA.
// 4 camadas: AGÊNCIAS + POSTOS (inc. COOPERATIVAS) + CORRESPONDENTES (snapshot por COMPETÊNCIA, acumula) + PIX (série mensal).
// Diferencial: SC cooperativista; Pix = economia que circula (insumo do motor de arrecadação). State-agnostic (UF env).
// node scripts/ingest_acesso_financeiro_sc.mjs
import fs from "fs"; import pg from "pg";
const DATABASE_URL = fs.readFileSync("C:/Users/PC/pnigp/.env.local", "utf8").match(/^DATABASE_URL=(.+)$/m)[1].trim();
const UF = process.env.UF || "SC";
const OL = "https://olinda.bcb.gov.br/olinda/servico";
const H = { "user-agent": "Mozilla/5.0", accept: "application/json" };
const j = async (url) => { for (let t = 0; t < 6; t++) { try { const r = await fetch(url, { headers: H, signal: AbortSignal.timeout(50000) }); if (r.ok) return await r.json(); await new Promise((s) => setTimeout(s, 1500 * (t + 1))); } catch { await new Promise((s) => setTimeout(s, 1500 * (t + 1))); } } return null; };
const pull = async (path, ent) => { const base = `${OL}/${path}/versao/v1/odata/${ent}`; let all = [], skip = 0; for (let p = 0; p < 60; p++) { const d = await j(`${base}?$filter=UF%20eq%20%27${UF}%27&$top=1000&$skip=${skip}&$format=json`); if (!d?.value?.length) break; all = all.concat(d.value); skip += d.value.length; if (d.value.length < 1000) break; } return all; };
const norm = (s) => String(s || "").replace(/\s+/g, " ").trim();
const nn = (v) => Number(v) || 0;
const compet = (posicao) => { const m = String(posicao || "").match(/(\d{2})\/(\d{2})\/(\d{4})/); return m ? `${m[3]}-${m[2]}` : null; }; // dd/mm/aaaa → aaaa-mm

async function run() {
  const db = new pg.Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 3 });
  db.on("error", () => {});
  const ufCode = String((await db.query(`SELECT left(cod_ibge,2) u FROM entes_sc WHERE tipo='M' LIMIT 1`)).rows[0]?.u || "");
  console.log("puxando BCB: agências, postos, correspondentes…");
  const [ag, pa, co] = await Promise.all([pull("Informes_Agencias", "Agencias"), pull("Informes_PostosDeAtendimento", "PostosAtendimento"), pull("Informes_Correspondentes", "Correspondentes")]);
  if (!ag.length && !pa.length) throw new Error("BCB Olinda não respondeu");
  const posicao = ag[0]?.Posicao || pa[0]?.Posicao || co[0]?.Posicao || null;
  const competencia = compet(posicao);

  // ===== INFRAESTRUTURA — snapshot por competência (acumula série a cada coleta mensal) =====
  const M = new Map();
  const get = (c) => { if (!M.has(c)) M.set(c, { agencias: 0, bancos: new Map(), postosCoop: 0, coops: new Map(), postosBanco: 0, postosOutros: 0, corresp: new Set() }); return M.get(c); };
  for (const a of ag) { const c = String(a.MunicipioIbge || ""); if (c.length !== 7) continue; const m = get(c); m.agencias++; m.bancos.set(a.CnpjBase, norm(a.NomeIf)); }
  for (const p of pa) { const c = String(p.MunicipioIbge || ""); if (c.length !== 7) continue; const m = get(c); const seg = p.Segmento || ""; if (/Cooperativa/i.test(seg)) { m.postosCoop++; m.coops.set(p.Cnpj, norm(p.NomeIf)); } else if (/Banco|Caixa Econ/i.test(seg)) m.postosBanco++; else m.postosOutros++; }
  for (const x of co) { const c = String(x.MunicipioIBGE || ""); if (c.length !== 7) continue; get(c).corresp.add(x.CnpjCorrespondente); }
  await db.query(`CREATE TABLE IF NOT EXISTS acesso_financeiro_sc (
    cod_ibge TEXT, competencia TEXT, n_agencias INTEGER, n_bancos INTEGER, n_postos_coop INTEGER, n_cooperativas INTEGER,
    n_postos_banco INTEGER, n_postos_outros INTEGER, n_correspondentes INTEGER, bancos JSONB, cooperativas JSONB, posicao TEXT, atualizado TIMESTAMPTZ DEFAULT now(),
    PRIMARY KEY (cod_ibge, competencia))`);
  await db.query(`ALTER TABLE acesso_financeiro_sc ADD COLUMN IF NOT EXISTS n_postos_banco INTEGER`);
  let n = 0;
  for (const [cod, m] of M) {
    await db.query(`INSERT INTO acesso_financeiro_sc (cod_ibge,competencia,n_agencias,n_bancos,n_postos_coop,n_cooperativas,n_postos_banco,n_postos_outros,n_correspondentes,bancos,cooperativas,posicao,atualizado)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,now())
      ON CONFLICT (cod_ibge,competencia) DO UPDATE SET n_agencias=EXCLUDED.n_agencias,n_bancos=EXCLUDED.n_bancos,n_postos_coop=EXCLUDED.n_postos_coop,n_cooperativas=EXCLUDED.n_cooperativas,n_postos_banco=EXCLUDED.n_postos_banco,n_postos_outros=EXCLUDED.n_postos_outros,n_correspondentes=EXCLUDED.n_correspondentes,bancos=EXCLUDED.bancos,cooperativas=EXCLUDED.cooperativas,posicao=EXCLUDED.posicao,atualizado=now()`,
      [cod, competencia, m.agencias, m.bancos.size, m.postosCoop, m.coops.size, m.postosBanco, m.postosOutros, m.corresp.size, JSON.stringify([...m.bancos.values()].sort()), JSON.stringify([...m.coops.values()].sort()), posicao]);
    n++;
  }

  // ===== PIX — SÉRIE MENSAL por município (varre DataBases recuando p/ montar histórico) =====
  await db.query(`CREATE TABLE IF NOT EXISTS pix_municipio_sc (
    cod_ibge TEXT, ano_mes INTEGER, vl_recebido NUMERIC, vl_recebido_pj NUMERIC, vl_pago NUMERIC,
    qt_recebido INTEGER, n_pes_receb_pj INTEGER, atualizado TIMESTAMPTZ DEFAULT now(), PRIMARY KEY (cod_ibge, ano_mes))`);
  const pixB = `${OL}/Pix_DadosAbertos/versao/v1/odata/TransacoesPixPorMunicipio`;
  const jaTem = new Set((await db.query(`SELECT cod_ibge||'-'||ano_mes k FROM pix_municipio_sc`)).rows.map((r) => r.k));
  const meses = new Set(); let pixN = 0;
  // DataBase retorna janela ~3 meses; recua de 2 em 2 meses até 24 atrás para cobrir a série
  for (let back = 1; back <= 24; back += 2) {
    const dt = new Date(); dt.setMonth(dt.getMonth() - back); const ym = `${dt.getFullYear()}${String(dt.getMonth() + 1).padStart(2, "0")}`;
    const d = await j(`${pixB}(DataBase=%27${ym}%27)?$filter=Estado_Ibge%20eq%20${ufCode}&$format=json`);
    for (const x of (d?.value || [])) {
      const c = String(x.Municipio_Ibge || ""), am = nn(x.AnoMes); if (c.length !== 7 || !am || meses.has(c + "-" + am)) continue;
      meses.add(c + "-" + am);
      if (jaTem.has(c + "-" + am)) continue; // idempotente: só insere meses novos
      await db.query(`INSERT INTO pix_municipio_sc (cod_ibge,ano_mes,vl_recebido,vl_recebido_pj,vl_pago,qt_recebido,n_pes_receb_pj,atualizado)
        VALUES ($1,$2,$3,$4,$5,$6,$7,now()) ON CONFLICT (cod_ibge,ano_mes) DO UPDATE SET vl_recebido=EXCLUDED.vl_recebido,vl_recebido_pj=EXCLUDED.vl_recebido_pj,vl_pago=EXCLUDED.vl_pago,qt_recebido=EXCLUDED.qt_recebido,n_pes_receb_pj=EXCLUDED.n_pes_receb_pj,atualizado=now()`,
        [c, am, Math.round(nn(x.VL_RecebedorPF) + nn(x.VL_RecebedorPJ)), Math.round(nn(x.VL_RecebedorPJ)), Math.round(nn(x.VL_PagadorPF) + nn(x.VL_PagadorPJ)), nn(x.QT_RecebedorPF) + nn(x.QT_RecebedorPJ), nn(x.QT_PES_RecebedorPJ)]);
      pixN++;
    }
  }
  const ci = (await db.query(`SELECT sum(n_agencias) ag, sum(n_postos_coop) coop, sum(n_correspondentes) corr FROM acesso_financeiro_sc WHERE competencia=$1`, [competencia])).rows[0];
  const cp = (await db.query(`SELECT count(distinct ano_mes) meses, min(ano_mes) mi, max(ano_mes) ma FROM pix_municipio_sc`)).rows[0];
  console.log(`✔ infraestrutura ${UF}/${competencia}: ${n} munis · ${ci.ag} ag · ${ci.coop} coop · ${ci.corr} corresp`);
  console.log(`✔ Pix série: +${pixN} linhas novas · ${cp.meses} meses (${cp.mi}–${cp.ma})`);
  await db.end();
}
run().catch((e) => { console.error("ERRO:", e.message); process.exit(1); });
