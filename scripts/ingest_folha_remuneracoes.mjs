// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
// ingest_folha_remuneracoes.mjs — portal "Remunerações" (Nuxt + API REST), achado em CAXIAS DO SUL/RS.
//
// ⭐⭐ Destravou o MAIOR faltante do RS (8.118 vínculos na RAIS) em 17/ago/2026. O caminho até aqui foi longo e
// vale registrar: o portal da prefeitura redireciona `/transparencia/remuneracoes` para o GRP/Thema, que é uma SPA
// onde a rota `#/remuneracoes` cai na home. O link verdadeiro só aparece no MENU DO GRP, que vem por API JSON
// (`varre_grp_menu_api.mjs`) — e aponta para um portal separado, `remuneracoes.caxias.rs.gov.br`
// ([[pnigp-modulo-vs-host-fornecedor]]).
//
// A API é das mais limpas que já encontrei — sem sessão, sem captcha, sem POST:
//   GET /api/                                  → todas as REFERÊNCIAS e as categorias de cada uma
//   GET /api/{aaaa}/{mm}/{dd}/{categoria}/meta → colunas
//   GET /api/{aaaa}/{mm}/{dd}/{categoria}?sort=nome&offset=N&limit=M
//        → {response:{total, records:[{nome, cargo, padrao_cargo, funcao_gratificada, admissao, tempo_servico,
//                                      folha:{total_bruto, descontos, total_liquido, …rubricas}}]}}
//
// 🚨 CATEGORIA "SUPLEMENTAR" FICA DE FORA por padrão: é folha complementar do MESMO mês, e somá-la à mensal conta
// a mesma pessoa duas vezes ([[pnigp-entidade-espelho-infla-folha]]). Vem com CATEGORIAS=todas quando se quiser.
//
// Uso: node scripts/ingest_folha_remuneracoes.mjs          · SO=<município> · CATEGORIAS=todas
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
import crypto from "crypto";
import { pool, withRetry } from "./_cadprev.mjs";

const db = pool();
const q = withRetry(db);
const SO = process.env.SO || null;
const TODAS = process.env.CATEGORIAS === "todas";
const H = { "user-agent": "Mozilla/5.0 (compatible; PNIGP/1.0; pesquisa de dados publicos)", accept: "application/json" };
const LIMITE = Number(process.env.LIMITE || 500);

const ALVOS = [
  { municipio: "Caxias do Sul", uf: "RS", base: "https://remuneracoes.caxias.rs.gov.br" },
];

await q(`create table if not exists folha_servidores_remuneracoes (
  cod_ibge text, municipio text, uf text, competencia text, categoria text,
  nome text, cargo text, padrao_cargo text, funcao_gratificada text, admissao text, tempo_servico text,
  bruto numeric, descontos numeric, liquido numeric, rubricas jsonb,
  _hash text primary key, _coletado_em timestamptz default now()
)`);
await q(`create index if not exists ix_folha_remun_mun on folha_servidores_remuneracoes (cod_ibge, competencia)`);
await q(`create table if not exists folha_remuneracoes_coleta (
  cod_ibge text primary key, municipio text, uf text, competencia text, categorias text,
  servidores int, com_valor int, declarado int, situacao text, detalhe text, em timestamptz default now()
)`);

const num = (v) => (typeof v === "number" && Number.isFinite(v) ? v : null);
async function api(base, caminho) {
  for (let t = 0; t < 4; t++) {
    try {
      const r = await fetch(`${base}/api${caminho}`, { headers: H, signal: AbortSignal.timeout(90000) });
      if (!r.ok) { await new Promise((s) => setTimeout(s, 2500 * (t + 1))); continue; }
      const j = await r.json();
      if (j.status === "success") return j.response;
    } catch { await new Promise((s) => setTimeout(s, 2500 * (t + 1))); }
  }
  return null;
}

for (const a of ALVOS) {
  if (SO && !a.municipio.toLowerCase().includes(SO.toLowerCase())) continue;
  // 🚨 o código IBGE sai do cadastro, nunca digitado ([[pnigp-nunca-digitar-codigo-ibge]])
  const mun = (await q(`select cod_ibge from municipios_br where uf=$1 and lower(nome)=lower($2) limit 1`,
    [a.uf, a.municipio])).rows[0];
  if (!mun) { console.log(`✖ ${a.municipio}/${a.uf} não está em municipios_br`); continue; }
  console.log(`\n[remuneracoes] ${a.municipio}/${a.uf}`);

  const refs = await api(a.base, "/");
  if (!refs?.length) { console.log("   ✖ /api/ não devolveu referências"); continue; }

  // competência MAIS CHEIA entre as 3 mais recentes ([[pnigp-competencia-mais-cheia-nao-a-recente]])
  const candidatas = refs.slice(0, 3);
  let melhor = null;
  for (const r of candidatas) {
    const [aa, mm, dd] = r.reference.value.split("-");
    const cats = r.categories.filter((c) => TODAS || !/suplementar/i.test(c.value));
    let total = 0;
    for (const c of cats) {
      const j = await api(a.base, `/${aa}/${mm}/${dd}/${c.value}?sort=nome&offset=0&limit=1`);
      total += j?.total || 0;
    }
    console.log(`   ${r.reference.label}: ${total} em ${cats.map((c) => c.value).join("+")}`);
    if (!melhor || total > melhor.total) melhor = { ref: r.reference.value, label: r.reference.label, cats, total };
  }
  if (!melhor?.total) { console.log("   ✖ nenhuma referência com registros"); continue; }
  const [aa, mm, dd] = melhor.ref.split("-");
  const competencia = `${aa}${mm}`;
  console.log(`   ⭐ ${melhor.label} com ${melhor.total} registros`);

  let gravados = 0, comValor = 0;
  for (const c of melhor.cats) {
    let offset = 0, total = null;
    while (total === null || offset < total) {
      const j = await api(a.base, `/${aa}/${mm}/${dd}/${c.value}?sort=nome&offset=${offset}&limit=${LIMITE}`);
      if (!j) break;
      total = j.total ?? 0;
      const recs = j.records || [];
      if (!recs.length) break;
      for (const s of recs) {
        const f = s.folha || {};
        const bruto = num(f.total_bruto);
        // as rubricas variam por município e por categoria — guardar o resto cru evita perder informação que hoje
        // não sei nomear ([[pnigp-folha-municipal-cinco-campos]])
        const rubricas = Object.fromEntries(Object.entries(f)
          .filter(([k]) => !["total_bruto", "descontos", "total_liquido"].includes(k)));
        const _hash = crypto.createHash("sha1")
          .update([mun.cod_ibge, competencia, c.value, s.id || "", s.nome, s.cargo].join("|")).digest("hex");
        await q(`insert into folha_servidores_remuneracoes
          (cod_ibge, municipio, uf, competencia, categoria, nome, cargo, padrao_cargo, funcao_gratificada,
           admissao, tempo_servico, bruto, descontos, liquido, rubricas, _hash)
          values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
          on conflict (_hash) do update set bruto=excluded.bruto, descontos=excluded.descontos,
            liquido=excluded.liquido, rubricas=excluded.rubricas, _coletado_em=now()`,
          [mun.cod_ibge, a.municipio, a.uf, competencia, c.value, s.nome, s.cargo, s.padrao_cargo,
           s.funcao_gratificada, s.admissao ? String(s.admissao).slice(0, 10) : null, s.tempo_servico,
           bruto, num(f.descontos), num(f.total_liquido), JSON.stringify(rubricas), _hash]);
        gravados++; if (bruto > 0) comValor++;
      }
      offset += recs.length;
      process.stdout.write(`   ${c.value}: ${offset}/${total}\r`);
    }
    console.log(`   ${c.value}: ${total} lidos                `);
  }
  const bate = gravados === melhor.total;
  console.log(`   ${bate ? "✔" : "⚠"} ${gravados} gravados · ${comValor} com valor · declarado ${melhor.total}`);
  await q(`insert into folha_remuneracoes_coleta
    (cod_ibge, municipio, uf, competencia, categorias, servidores, com_valor, declarado, situacao, detalhe, em)
    values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,now())
    on conflict (cod_ibge) do update set competencia=excluded.competencia, categorias=excluded.categorias,
      servidores=excluded.servidores, com_valor=excluded.com_valor, declarado=excluded.declarado,
      situacao=excluded.situacao, detalhe=excluded.detalhe, em=now()`,
    [mun.cod_ibge, a.municipio, a.uf, competencia, melhor.cats.map((c) => c.value).join("+"),
     gravados, comValor, melhor.total, bate ? "ok" : "ok_parcial",
     `referência ${melhor.label}; suplementar ${TODAS ? "incluída" : "excluída para não contar a mesma pessoa duas vezes"}`]);
}
await db.end();
