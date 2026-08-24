// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
// ingest_folha_pdtinfo.mjs — `{slug}.portaldatransparencia.info`, tema WordPress "portaldatransparencia".
//
// ⭐ Achado em 18/ago/2026 em Alpercata/MG, indo um clique adiante num município marcado `tela_sem_linhas`.
//
// 🚨 A ARMADILHA: no navegador a tela mostra **15 linhas**, e é fácil concluir "portal paginado, dá trabalho".
// É DataTables paginando NO CLIENTE — o HTML cru de `/servidores/` já traz as **509 linhas inteiras** (274 KB).
// Não há API, não há POST: é um GET e um parse. O contrário do erro de tratar SPA como obstáculo
// ([[pnigp-spa-nao-e-obstaculo-e-nao-publicacao]]) — aqui o obstáculo era só o JavaScript de paginação.
//
// Contrato: GET /servidores/ → <table id="table-folha"> com
//   Matrícula · Nome · Função · Lotação · Salário · Referência (MM/AAAA na PRÓPRIA LINHA)
//
// 🚨 O produto é minúsculo e quase todo morto. O crt.sh lista 32 hosts no domínio do fornecedor, mas só
// `alpercata` resolve DNS — `vicosa`, `virginopolis`, `pmnovamodica`, `pmrubelita` têm certificado e nenhum
// servidor atrás ([[pnigp-crtsh-host-pelo-certificado]]). E `cmporteirinha`/`cmvgp` são CÂMARA: o prefixo `cm`
// entrega o poder, como o `c` do portaltransp ([[pnigp-portaltransp-codigo-poder]]).
//
// Uso: node scripts/ingest_folha_pdtinfo.mjs      · SO=<município>
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
import "./_rede.mjs";
import crypto from "node:crypto";
import { pool, withRetry } from "./_cadprev.mjs";

const db = pool();
const q = withRetry(db);
const SO = process.env.SO || null;
const UA = { "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120 Safari/537.36" };
const RE_CAMARA = /(^|\/\/)cm[a-z]/i;

await q(`create table if not exists folha_servidores_pdtinfo (
  cod_ibge text, municipio text, uf text, competencia text, matricula text, nome text,
  funcao text, lotacao text, salario numeric, _hash text primary key, _coletado_em timestamptz default now()
)`);
await q(`create table if not exists folha_pdtinfo_coleta (
  cod_ibge text primary key, municipio text, uf text, url text, situacao text, detalhe text,
  linhas int, competencia text, em timestamptz default now()
)`);

const limpa = (s) => String(s ?? "").replace(/<[^>]+>/g, " ")
  .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
  .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
const num = (s) => { const n = Number(String(s ?? "").replace(/[^\d,.-]/g, "").replace(/\.(?=\d{3}\b)/g, "").replace(",", ".")); return Number.isFinite(n) ? n : null; };

const fila = (await q(`select distinct on (cod_ibge) cod_ibge, municipio, uf, url from folha_portal_candidato
  where produto = 'portaldatransparencia_info' ${SO ? "and municipio ilike '%'||$1||'%'" : ""}
  order by cod_ibge, achado_em desc`, [SO].filter(Boolean))).rows;
console.log(`[pdtinfo] ${fila.length} municípios na fila\n`);

let colhidos = 0;
for (const m of fila) {
  const marca = (situacao, detalhe, n = 0, comp = null) =>
    q(`insert into folha_pdtinfo_coleta (cod_ibge,municipio,uf,url,situacao,detalhe,linhas,competencia,em)
       values ($1,$2,$3,$4,$5,$6,$7,$8,now()) on conflict (cod_ibge) do update set situacao=excluded.situacao,
       detalhe=excluded.detalhe, linhas=excluded.linhas, competencia=excluded.competencia, em=now()`,
      [m.cod_ibge, m.municipio, m.uf, m.url, situacao, detalhe, n, comp]);

  if (RE_CAMARA.test(String(m.url).replace(/^https?:\/\//, ""))) {
    await marca("camara", "host começa com `cm` — é o portal da CÂMARA"); continue;
  }

  let html;
  try {
    const r = await fetch(m.url, { headers: UA, redirect: "follow", signal: AbortSignal.timeout(120000) });
    if (!r.ok) { await marca("http_erro", `HTTP ${r.status}`); console.log(`   ✖ ${m.municipio}: HTTP ${r.status}`); continue; }
    html = await r.text();
  } catch (e) { await marca("erro", String(e.message).slice(0, 140)); console.log(`   ✖ ${m.municipio}: ${String(e.message).slice(0, 50)}`); continue; }

  const i = html.indexOf('id="table-folha"');
  if (i < 0) { await marca("sem_tabela", "a página não traz `table-folha`"); console.log(`   · ${m.municipio}: sem tabela de folha`); continue; }
  const regs = [...html.slice(i).matchAll(/<tr>([\s\S]*?)<\/tr>/g)]
    .map((x) => [...x[1].matchAll(/<td>([\s\S]*?)<\/td>/g)].map((c) => limpa(c[1])))
    .filter((c) => c.length >= 6 && c[1]);
  if (!regs.length) { await marca("sem_dado", "tabela presente, nenhuma linha com nome"); console.log(`   · ${m.municipio}: tabela vazia`); continue; }

  // ⭐ a referência vem NA LINHA (MM/AAAA); fica a competência mais cheia
  const porComp = new Map();
  for (const c of regs) {
    const [mm, aa] = String(c[5] || "").split("/");
    if (!/^\d{1,2}$/.test(mm ?? "") || !/^\d{4}$/.test(aa ?? "")) continue;
    const comp = `${aa}${mm.padStart(2, "0")}`;
    porComp.set(comp, (porComp.get(comp) || 0) + 1);
  }
  const comp = [...porComp.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  if (!comp) { await marca("sem_competencia", `${regs.length} linhas, referência ilegível`); console.log(`   · ${m.municipio}: referência ilegível`); continue; }

  const lote = regs.filter((c) => {
    const [mm, aa] = String(c[5] || "").split("/");
    return `${aa}${String(mm).padStart(2, "0")}` === comp;
  }).map((c) => [m.cod_ibge, m.municipio, m.uf, comp, c[0] || null, c[1], c[2] || null, c[3] || null, num(c[4]),
    crypto.createHash("sha1").update([m.cod_ibge, comp, c[0] || "", c[1], c[4]].join("|")).digest("hex")]);

  for (let k = 0; k < lote.length; k += 500) {
    const p = lote.slice(k, k + 500);
    const vals = p.map((_, j) => `(${Array.from({ length: 10 }, (_, z) => `$${j * 10 + z + 1}`).join(",")})`).join(",");
    await q(`insert into folha_servidores_pdtinfo (cod_ibge,municipio,uf,competencia,matricula,nome,funcao,
      lotacao,salario,_hash) values ${vals} on conflict (_hash) do nothing`, p.flat());
  }
  colhidos++;
  await marca("ok", `${lote.length} servidores na competência mais cheia de ${porComp.size}`, lote.length, comp);
  console.log(`  ⭐ ${m.municipio.padEnd(26)} ${String(lote.length).padStart(5)} servidores · comp ${comp}`);
}

console.log(`\n[pdtinfo] ${colhidos} municípios colhidos`);
await db.end();
