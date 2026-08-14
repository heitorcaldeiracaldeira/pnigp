// descobre_smarapd_probe.mjs — sonda de host dos clientes SMARAPD: `transparencia-{slug}.smarapd.com.br`.
// Confirma o portal PAI batendo em /paiportalserver/MenuPortal (200 = cliente). Popula smarapd_probe.
import { pool, withRetry } from "./_cadprev.mjs";
const db = pool(); const q = withRetry(db);
const CONC = Number(process.env.CONC || 15);
const norm = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
await q(`create table if not exists smarapd_probe (cod_ibge text primary key, municipio text, uf text, host text, achou boolean, em timestamptz default now())`);

async function sonda(host) {
  try { const r = await fetch(`https://${host}/paiportalserver/MenuPortal`, { signal: AbortSignal.timeout(9000), headers: { "user-agent": "Mozilla/5.0", origin: `https://${host}`, referer: `https://${host}/` } }); return r.status; } catch { return 0; }
}
function slugs(nome) {
  const base = norm(nome).replace(/[^a-z0-9]/g, "");
  const semStop = norm(nome).replace(/\b(de|do|da|dos|das|d)\b/g, "").replace(/[^a-z0-9]/g, "");
  return [...new Set([base, semStop])].filter(Boolean);
}
const feitos = new Set((await q(`select cod_ibge from smarapd_probe`)).rows.map((r) => r.cod_ibge));
// SMARAPD é forte em SP → sonda SP primeiro, depois resto
const muns = (await q(`select cod_ibge, nome, uf from municipios_br order by case uf when 'São Paulo' then 0 else 9 end, nome`)).rows
  .filter((m) => !feitos.has(String(m.cod_ibge)));
console.log(`[smarapd_probe] ${muns.length} municípios a sondar (conc=${CONC})`);
let achou = 0, i = 0;
async function processa(m) {
  let host = null;
  for (const s of slugs(m.nome)) { const h = `transparencia-${s}.smarapd.com.br`; if (await sonda(h) === 200) { host = h; break; } }
  await q(`insert into smarapd_probe (cod_ibge,municipio,uf,host,achou,em) values ($1,$2,$3,$4,$5,now())
    on conflict (cod_ibge) do update set host=excluded.host, achou=excluded.achou, em=now()`, [String(m.cod_ibge), m.nome, m.uf, host, !!host]);
  if (host) { achou++; console.log(`  ✅ ${m.uf} ${m.nome} -> ${host}`); }
  if (++i % 300 === 0) console.log(`  ...${i}/${muns.length}, ${achou} achados`);
}
const fila = [...muns];
await Promise.all(Array.from({ length: CONC }, async () => { while (fila.length) await processa(fila.shift()); }));
console.log(`\n[smarapd_probe] ${achou} clientes SMARAPD achados`);
await db.end();
