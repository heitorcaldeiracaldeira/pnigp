// BACKFILL da entidade `unidadeOrgao` do PNCP nas contratações já ingeridas.
//
// POR QUE: o ingest DESCARTAVA `unidadeOrgao` (que traz o município do processo) e DEDUZIA o cod_ibge de um mapa
// cnpj→ibge montado de `itens_sc` — inventar arquitetura sobre um campo que já existe. Viola a lei
// SISTEMA DE ORIGEM = SISTEMA DE DESTINO ([[pnigp-nomenclatura-pncp]]). Custo medido: 3.724 processos SEM município
// e só 289 dos 295 municípios de SC presentes.
//
// COMO: relê o MESMO bulk do ingest (/contratacoes/publicacao por mês×modalidade) e faz UPDATE só das colunas-espelho.
// NÃO apaga nada, NÃO reinsere: é UPDATE por (cnpj,ano,seq). Idempotente e resumível por janela (_unidade_janela).
// State-agnostic: UF do env.
//
// node scripts/backfill_unidade_pncp.mjs    (env: UF=SC ANO_INI=2021 ANO_FIM=2026 CONC=2)
import fs from "fs"; import path from "path"; import { fileURLToPath } from "url"; import pg from "pg";
const __dirname = path.dirname(fileURLToPath(import.meta.url)); const ROOT = path.join(__dirname, "..");
const DATABASE_URL = fs.readFileSync(path.join(ROOT, ".env.local"), "utf8").match(/^DATABASE_URL=(.+)$/m)[1].trim();
const CONS = "https://pncp.gov.br/api/consulta/v1/contratacoes/publicacao";
const UF = (process.env.UF || "SC").toUpperCase();
const MODALIDADES = (process.env.MODALIDADES || "1,2,3,4,5,6,7,8,9,10,11,12,13").split(",").map(Number);
const ANO_INI = Number(process.env.ANO_INI || 2021);
const ANO_FIM = Number(process.env.ANO_FIM || 2026);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const db = new pg.Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 3, statement_timeout: 180000 });
db.on("error", () => {});
const FATAL = new Set(["22P05", "22021", "23505", "23502", "42703", "42P10"]);
const q = async (s, p) => {
  let u; for (let i = 0; i < 12; i++) { try { return await db.query(s, p); } catch (e) { u = e; if (FATAL.has(e.code)) throw e; await sleep(1500 * (i + 1)); } }
  throw new Error(`db (${u?.code}): ${u?.message}`);
};
for (const [c, t] of [["municipio_nome", "TEXT"], ["unidade_codigo", "TEXT"], ["unidade_nome", "TEXT"],
                      ["orgao_razao_social", "TEXT"], ["uf", "TEXT"], ["numero_controle_pncp", "TEXT"]])
  await q(`ALTER TABLE contratacoes_sc ADD COLUMN IF NOT EXISTS ${c} ${t}`);
await q(`CREATE TABLE IF NOT EXISTS _unidade_janela (uf TEXT, mod INT, ano INT, mes INT, n INT,
  feito_em timestamptz DEFAULT now(), PRIMARY KEY (uf,mod,ano,mes))`);

async function getBulk(mod, ini, fim, pagina) {
  const url = `${CONS}?dataInicial=${ini}&dataFinal=${fim}&codigoModalidadeContratacao=${mod}&uf=${UF}&pagina=${pagina}&tamanhoPagina=50`;
  for (let t = 0; ; t++) {
    let r; try { r = await fetch(url, { signal: AbortSignal.timeout(25000) }); } catch (e) { if (t >= 5) throw e; await sleep(3000 * (t + 1)); continue; }
    if (r.status === 429) { if (t >= 8) throw new Error("429 persistente"); await sleep(8000 * (t + 1)); continue; }
    if (r.status === 204) return { data: [], totalPaginas: 0 };
    if (!r.ok) { if (t >= 3) return { data: [], totalPaginas: 0 }; await sleep(2000 * (t + 1)); continue; }
    return await r.json();
  }
}
function janelas() {
  const out = [];
  for (let a = ANO_INI; a <= ANO_FIM; a++) for (let m = 1; m <= 12; m++) {
    const d = new Date(Date.UTC(a, m, 0)).getUTCDate();
    out.push({ ano: a, mes: m, ini: `${a}${String(m).padStart(2, "0")}01`, fim: `${a}${String(m).padStart(2, "0")}${String(d).padStart(2, "0")}` });
  }
  return out;
}

const js = janelas(); let tot = 0, pulei = 0;
for (const mod of MODALIDADES) for (const j of js) {
  if ((await q(`SELECT 1 FROM _unidade_janela WHERE uf=$1 AND mod=$2 AND ano=$3 AND mes=$4`, [UF, mod, j.ano, j.mes])).rowCount) { pulei++; continue; }
  let pagina = 1, tp = 1, nj = 0;
  do {
    const r = await getBulk(mod, j.ini, j.fim, pagina).catch(() => ({ data: [], totalPaginas: 0 }));
    tp = r.totalPaginas || 0;
    const L = { ibge: [], mun: [], uc: [], un: [], rs: [], uf: [], nc: [], cnpj: [], ano: [], seq: [] };
    for (const o of r.data || []) {
      const cnpj = o.orgaoEntidade?.cnpj; if (!cnpj) continue;
      L.cnpj.push(cnpj); L.ano.push(Number(o.anoCompra)); L.seq.push(Number(o.sequencialCompra));
      L.ibge.push(o.unidadeOrgao?.codigoIbge || null);
      L.mun.push(o.unidadeOrgao?.municipioNome || null);
      L.uc.push(o.unidadeOrgao?.codigoUnidade || null);
      L.un.push(String(o.unidadeOrgao?.nomeUnidade || "").slice(0, 160) || null);
      L.rs.push(String(o.orgaoEntidade?.razaoSocial || "").slice(0, 160) || null);
      L.uf.push(o.unidadeOrgao?.ufSigla || null);
      L.nc.push(o.numeroControlePNCP || null);
    }
    if (L.cnpj.length) {
      // UPDATE em LOTE — só as colunas-espelho. Nada e apagado nem reinserido.
      await q(`UPDATE contratacoes_sc c SET
          cod_ibge = COALESCE(x.ibge, c.cod_ibge), municipio_nome = x.mun, unidade_codigo = x.uc,
          unidade_nome = x.un, orgao_razao_social = x.rs, uf = x.uf, numero_controle_pncp = x.nc, atualizado = now()
        FROM unnest($1::text[],$2::int[],$3::int[],$4::text[],$5::text[],$6::text[],$7::text[],$8::text[],$9::text[],$10::text[])
          AS x(cnpj,ano,seq,ibge,mun,uc,un,rs,uf,nc)
        WHERE c.cnpj=x.cnpj AND c.ano=x.ano AND c.seq=x.seq`,
        [L.cnpj, L.ano, L.seq, L.ibge, L.mun, L.uc, L.un, L.rs, L.uf, L.nc]);
      tot += L.cnpj.length; nj += L.cnpj.length;
    }
    pagina++;
  } while (pagina <= tp);
  await q(`INSERT INTO _unidade_janela (uf,mod,ano,mes,n) VALUES ($1,$2,$3,$4,$5)
    ON CONFLICT (uf,mod,ano,mes) DO UPDATE SET n=EXCLUDED.n, feito_em=now()`, [UF, mod, j.ano, j.mes, nj]);
  process.stdout.write(`  mod ${mod} ${j.ano}/${String(j.mes).padStart(2, "0")} · ${tot.toLocaleString("pt-BR")} atualizados\r`);
}
const s = (await q(`SELECT count(*) tot, count(*) FILTER (WHERE cod_ibge IS NULL) sem_ibge,
  count(DISTINCT cod_ibge) munis, count(municipio_nome) com_mun FROM contratacoes_sc`)).rows[0];
console.log(`\n✔ backfill: ${tot.toLocaleString("pt-BR")} contratações atualizadas (janelas puladas: ${pulei})`);
console.log(`  contratações: ${Number(s.tot).toLocaleString("pt-BR")} · SEM cod_ibge: ${s.sem_ibge} · municípios distintos: ${s.munis} · com municipio_nome: ${Number(s.com_mun).toLocaleString("pt-BR")}`);
await db.end();
