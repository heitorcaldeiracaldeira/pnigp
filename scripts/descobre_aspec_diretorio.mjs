// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
// descobre_aspec_diretorio.mjs — varre o DIRETÓRIO INTEIRO do governotransparente (9 UFs, ~629 cidades) e descobre
// o acessoinfo_id da PREFEITURA vigente de cada uma, mapeando para o cod_ibge (por nome+UF). Popula aspec_diretorio.
// Depois, ingest_folha_aspec_nominal.mjs coleta a folha nominal de todas (as que têm o módulo alimentado).
//
// Cadeia por cidade: /transparencia/estado/cidade/entidades/{cidId} → PREFEITURA mais recente →
//   /selecionarentidade?ent= (redirect:manual) → Location /{acessoinfoId}.
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
import { pool, withRetry } from "./_cadprev.mjs";
const db = pool(); const q = withRetry(db);
const BASE = "https://www.governotransparente.com.br";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
const H = { "user-agent": UA, referer: BASE + "/" };
const CONC = Number(process.env.CONC || 8);
const dorme = (ms) => new Promise((s) => setTimeout(s, ms));
const norm = (s) => (s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/\s+/g, " ").trim();
// UF nome (municipios_br usa sigla) — mapa estId → sigla
const EST = { "150": "CE", "190": "MA", "250": "PA", "240": "PB", "280": "RN", "120": "AP", "260": "PE", "270": "PI", "320": "RR" };

await q(`create table if not exists aspec_diretorio (
  uf text, cid_id text, ent_id text, municipio_gt text, cod_ibge text, acessoinfo_id text,
  situacao text, em timestamptz default now(), primary key (uf, cid_id))`);

async function baixa(url, tipo = "json", tent = 3) {
  for (let t = 0; t < tent; t++) {
    try {
      const r = await fetch(url, { headers: H, redirect: tipo === "loc" ? "manual" : "follow", signal: AbortSignal.timeout(30000) });
      if (tipo === "loc") return r.headers.get("location");
      if (!r.ok) { if (r.status === 403 || r.status >= 500) { await dorme(1200 * (t + 1)); continue; } return null; }
      return tipo === "json" ? await r.json() : await r.text();
    } catch { await dorme(1200 * (t + 1)); }
  }
  return null;
}

// carrega municipios_br por UF para mapear nome→cod_ibge
const munPorUf = {};
for (const uf of new Set(Object.values(EST))) {
  munPorUf[uf] = new Map((await q(`select cod_ibge, nome from municipios_br where uf=$1`, [uf])).rows.map((r) => [norm(r.nome), r.cod_ibge]));
}
function achaIbge(uf, nomeGt) {
  const m = munPorUf[uf]; if (!m) return null;
  let n = norm(nomeGt).replace(/^PREFEITURA (MUNICIPAL )?(DE |DO |DA |D')?/, "").trim();
  return m.get(n) || m.get(n.replace(/[^A-Z ]/g, "")) || null;
}

let novos = 0, semId = 0;
for (const [estId, uf] of Object.entries(EST)) {
  const cidades = await baixa(`${BASE}/transparencia/estado/cidades/${estId}`);
  if (!Array.isArray(cidades)) { console.log(`${uf}: sem cidades`); continue; }
  const feitos = new Set((await q(`select cid_id from aspec_diretorio where uf=$1 and acessoinfo_id is not null`, [uf])).rows.map((r) => r.cid_id));
  const fila = cidades.filter((c) => !feitos.has(String(c.id)));
  console.log(`[${uf}] ${cidades.length} cidades · ${fila.length} a descobrir`);
  for (let i = 0; i < fila.length; i += CONC) {
    const bloco = fila.slice(i, i + CONC);
    await Promise.all(bloco.map(async (c) => {
      const ents = await baixa(`${BASE}/transparencia/estado/cidade/entidades/${c.id}`);
      let acessoId = null, entId = null, nomeGt = c.nome, situacao = "sem_prefeitura";
      if (Array.isArray(ents)) {
        const prefs = ents.filter((e) => /PREFEITURA/i.test(e.nome)).map((e) => {
          const m = e.nome.match(/a\s*(\d{2})\/(\d{2})\/(\d{4})\s*\)/); return { ...e, fim: m ? +`${m[3]}${m[2]}${m[1]}` : 0 };
        }).sort((a, b) => b.fim - a.fim);
        if (prefs.length) {
          entId = prefs[0].id; nomeGt = prefs[0].nome;
          const loc = await baixa(`${BASE}/selecionarentidade?est=${estId}&cid=${c.id}&ent=${entId}`, "loc");
          const idm = (loc || "").match(/\/(\d{5,})/);
          if (idm) { acessoId = idm[1]; situacao = "ok"; } else situacao = "sem_id";
        }
      } else situacao = "sem_entidades";
      const cod = achaIbge(uf, nomeGt) || achaIbge(uf, c.nome);
      await q(`insert into aspec_diretorio (uf,cid_id,ent_id,municipio_gt,cod_ibge,acessoinfo_id,situacao,em)
        values ($1,$2,$3,$4,$5,$6,$7,now()) on conflict (uf,cid_id) do update set
        ent_id=excluded.ent_id, municipio_gt=excluded.municipio_gt, cod_ibge=excluded.cod_ibge,
        acessoinfo_id=excluded.acessoinfo_id, situacao=excluded.situacao, em=now()`,
        [uf, String(c.id), entId, c.nome, cod, acessoId, situacao]);
      if (acessoId) novos++; else semId++;
    }));
    process.stdout.write(`   ${uf} ${Math.min(i + CONC, fila.length)}/${fila.length} · ${novos} com id\r`);
    await dorme(200);
  }
  console.log("");
}
console.log(`\n[diretorio] ${novos} prefeituras com acessoinfo_id · ${semId} sem`);
console.table((await q(`select uf, count(*) filter (where acessoinfo_id is not null) com_id,
  count(*) filter (where cod_ibge is not null) com_ibge, count(*) total from aspec_diretorio group by uf order by 4 desc`)).rows);
await db.end();
