// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
// preenche_memory_entidade_candidato.mjs — extrai o código de entidade Memory das URLs já descobertas em
// `folha_portal_candidato` (a leitura do site oficial guarda a URL inteira, e o código está nela).
//
// Irmão de `preenche_memory_entidade.mjs`, que faz o mesmo a partir de `portal_real_descoberto`. Este cobre a
// fonte nova — `descobre_portal_pelo_site.mjs` ([[pnigp-descobre-portal-pelo-site-oficial]]) — sem tocar naquele
// ([[pnigp-script-existente-sobrescrito]]).
//
// 🚨 São QUATRO formatos para o mesmo identificador; extrair só o primeiro deixa a maioria de fora:
//   ilai.memory.com.br/#/entidades/login/98LDKP/1/     lai.memory.com.br/entidades/login/98GH6H
//   sistemaweb.memory.com.br:81/issqn/...?municipio=98P80D        lai.memory.com.br/esic/999RZ1
//
// Uso: UF=MG node scripts/preenche_memory_entidade_candidato.mjs
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
import { pool, withRetry } from "./_cadprev.mjs";

const db = pool();
const q = withRetry(db);
const UF = process.env.UF || null;

const PADROES = [
  /#\/(?:entidades\/login\/)?([0-9A-Z]{5,8})(?:\/|$)/i,
  /\/entidades\/login\/([0-9A-Z]{5,8})\b/i,
  /[?&]municipio=([0-9A-Z]{5,8})\b/i,
  /[?&]mu=([0-9A-Z]{5,8})\b/i,
  /\/esic\/([0-9A-Z]{5,8})\b/i,
];
// o código real mistura dígito e letra e começa por dígito — sem isso, "PUBLIC" e "MENU" entram como entidade
const VALIDO = /^\d[0-9A-Z]{4,7}$/;

const cands = (await q(`select c.cod_ibge, c.municipio, c.uf, c.url
  from folha_portal_candidato c join municipios_br m on m.cod_ibge = c.cod_ibge
 where c.produto = 'memory' ${UF ? "and m.uf = $1" : ""}
   and not exists (select 1 from memory_entidade e where e.cod_ibge = c.cod_ibge and e.entidade is not null)
 order by c.municipio`, UF ? [UF] : [])).rows;
console.log(`[memory-cand] ${cands.length} candidatos memory sem código de entidade`);

let ok = 0, sem = 0;
for (const c of cands) {
  let ent = null;
  for (const re of PADROES) {
    const m = c.url.match(re);
    if (m && VALIDO.test(m[1].toUpperCase())) { ent = m[1].toUpperCase(); break; }
  }
  if (!ent) { sem++; console.log(`   · ${c.municipio}: URL sem código (${c.url.slice(0, 70)})`); continue; }
  ok++;
  console.log(`  ⭐ ${c.municipio.padEnd(26)} → ${ent}`);
  await q(`insert into memory_entidade (cod_ibge, municipio, uf, entidade, situacao, em)
    values ($1,$2,$3,$4,'ok',now())
    on conflict (cod_ibge) do update set entidade=excluded.entidade, situacao='ok', em=now()`,
    [c.cod_ibge, c.municipio, c.uf, ent]);
}
console.log(`\n[memory-cand] ${ok} códigos extraídos · ${sem} URLs sem código`);
await db.end();
