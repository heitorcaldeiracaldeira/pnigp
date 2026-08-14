// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
// descobre_govbr_probe.mjs — descoberta dos clientes GovernançaBrasil por SONDA DE HOST (o método que funciona).
//
// A varredura de site (HTTP e JS-render) tem teto: só acha quem linka o portal. Mas os hosts GovBR seguem um padrão
// FIXO e sondável: `webapp1-{slug}.cidade360.cloud`, onde slug = nome do município normalizado (sem acento/espaço).
// Provado: webapp1-arcos/acaiaca/caete/alvinopolis/contagem → 200; não-clientes → ENOTFOUND. Então sondamos
// `/pronimtb/index.asp?acao=10&item=8` para TODOS os 5.570 municípios e guardamos os 200 em `govbr_portal`.
//
// Puro HTTP, em paralelo (lotes). Retomável: pula quem já está em govbr_probe. Tenta algumas variantes de slug.
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
import { pool, withRetry } from "./_cadprev.mjs";

const db = pool();
const q = withRetry(db);
const CONC = Number(process.env.CONC || 12);
const dorme = (ms) => new Promise((s) => setTimeout(s, ms));
const norm = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

await q(`create table if not exists govbr_portal (
  cod_ibge text primary key, municipio text, uf text, host text, banco text default 'DW_LC131_AP_0',
  situacao text, linhas int, detalhe text, em timestamptz default now()
)`);
await q(`create table if not exists govbr_probe (
  cod_ibge text primary key, municipio text, uf text, host text, achou boolean, em timestamptz default now()
)`);

// variantes de slug: nome puro, sem 'd'/'de'/'do'/'da', e com uf
function slugs(nome, ufSigla) {
  const base = norm(nome).replace(/[^a-z0-9]/g, "");
  const semStop = norm(nome).replace(/\b(de|do|da|dos|das|d)\b/g, "").replace(/[^a-z0-9]/g, "");
  const out = new Set([base, semStop]);
  return [...out].filter(Boolean);
}

async function sonda(host) {
  try {
    const r = await fetch(`https://${host}/pronimtb/index.asp?acao=10&item=8`, { signal: AbortSignal.timeout(9000), headers: { "user-agent": "Mozilla/5.0 (compatible; PNIGP/1.0)" }, redirect: "manual" });
    return r.status;
  } catch { return 0; }
}

// mapa UF nome→sigla
const UFSIG = { "Acre": "AC", "Alagoas": "AL", "Amapá": "AP", "Amazonas": "AM", "Bahia": "BA", "Ceará": "CE", "Distrito Federal": "DF", "Espírito Santo": "ES", "Goiás": "GO", "Maranhão": "MA", "Mato Grosso": "MT", "Mato Grosso do Sul": "MS", "Minas Gerais": "MG", "Pará": "PA", "Paraíba": "PB", "Paraná": "PR", "Pernambuco": "PE", "Piauí": "PI", "Rio de Janeiro": "RJ", "Rio Grande do Norte": "RN", "Rio Grande do Sul": "RS", "Rondônia": "RO", "Roraima": "RR", "Santa Catarina": "SC", "São Paulo": "SP", "Sergipe": "SE", "Tocantins": "TO" };

const feitos = new Set((await q(`select cod_ibge from govbr_probe`)).rows.map((r) => r.cod_ibge));
const muns = (await q(`select cod_ibge, nome, uf from municipios_br order by
  case uf when 'Minas Gerais' then 0 when 'Mato Grosso do Sul' then 1 when 'Goiás' then 2 else 9 end, nome`)).rows
  .filter((m) => !feitos.has(String(m.cod_ibge)));
console.log(`[govbr_probe] ${muns.length} municípios a sondar (conc=${CONC})`);

let achou = 0, i = 0;
async function processa(m) {
  const uf = UFSIG[m.uf] || "";
  let hostBom = null;
  for (const s of slugs(m.nome, uf)) {
    for (const h of [`webapp1-${s}.cidade360.cloud`, `${s}.govbr.cloud`]) {
      const code = await sonda(h);
      if (code === 200) { hostBom = h; break; }
    }
    if (hostBom) break;
  }
  await q(`insert into govbr_probe (cod_ibge,municipio,uf,host,achou,em) values ($1,$2,$3,$4,$5,now())
    on conflict (cod_ibge) do update set host=excluded.host, achou=excluded.achou, em=now()`,
    [String(m.cod_ibge), m.nome, m.uf, hostBom, !!hostBom]);
  if (hostBom) {
    await q(`insert into govbr_portal (cod_ibge,municipio,uf,host,situacao) values ($1,$2,$3,$4,'descoberto')
      on conflict (cod_ibge) do update set host=excluded.host, em=now()`, [String(m.cod_ibge), m.nome, m.uf, hostBom]);
    achou++; console.log(`  ✅ ${m.uf} ${m.nome} -> ${hostBom}`);
  }
  if (++i % 200 === 0) console.log(`  ...${i}/${muns.length} sondados, ${achou} achados`);
}

// pool de concorrência
const fila = [...muns];
async function worker() { while (fila.length) { await processa(fila.shift()); } }
await Promise.all(Array.from({ length: CONC }, worker));

console.log(`\n[govbr_probe] ${achou} clientes GovBR achados`);
const tot = await q(`select count(*) n from govbr_portal where host is not null`);
console.log("govbr_portal total com host:", tot.rows[0].n);
await db.end();
