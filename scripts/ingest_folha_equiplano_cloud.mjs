// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
// ingest_folha_equiplano_cloud.mjs — folha nominal da geração NOVA do Equiplano (`portal-{slug}.equiplano.cloud`),
// SPA Angular servida por `api.equiplano.cloud`.
//
// ⭐ A CADEIA (capturada na rede, 16/ago/2026 — [[pnigp-equiplano-tres-controladores]]):
//   0. handshake: abrir a home no navegador UMA vez e capturar os headers do app
//      (`x-entity-uuid`, `x-client-uuid`, `x-county-client-uuid`, `x-encryption/permission/is-logged/validate`).
//      🚨 Sem eles a API responde 500 "Município não encontrado"; e `dominio/check/{slug}` sozinho não basta.
//   1. GET /transparencia/acao?take=0                          → o menu; achar a ação cujo `link` é
//                                                                `pessoal/salarios/relacao-servidores-salarios`
//   2. GET /transparencia/pes_relacao_servidores_salarios/relacaoDeServidoresSalariosMS?acaoUuid=&entidadeUuid=
//                                                              → uma linha por (entidade × exercício) — AGREGADO
//   3. …/listMesRelacaoDeServidoresSalariosMS?exercicio=&entidadeUuid=   → os meses publicados
//   4. …/listDataRelacaoDeServidoresSalariosMS?exercicio=&entidadeUuid=&mesType=&page=&size=  → ⭐ O NOMINAL
//      (`nmServidor`, `nmCargoServidor`, `nmLotacaoServidor`, `vlSalarioBruto`, `vlDescontos`, `vlLiquido`)
//
// Uso: PORTAIS=portal-prefeitura-pien,portal-prefeitura-imbau node scripts/ingest_folha_equiplano_cloud.mjs
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
import crypto from "crypto";
import { chromium } from "playwright";
import { pool, withRetry } from "./_cadprev.mjs";

const db = pool();
const q = withRetry(db);
const API = "https://api.equiplano.cloud/transparencia";
const PAG = Number(process.env.PAG || 500);
const MESN = { JANEIRO: "01", FEVEREIRO: "02", "MARÇO": "03", MARCO: "03", ABRIL: "04", MAIO: "05", JUNHO: "06",
  JULHO: "07", AGOSTO: "08", SETEMBRO: "09", OUTUBRO: "10", NOVEMBRO: "11", DEZEMBRO: "12" };

await q(`create table if not exists equiplano_cloud_portal (
  cod_ibge text primary key, municipio text, uf text, slug text, entidade_uuid text, cliente_uuid text,
  county_uuid text, acao_uuid text, achado_em timestamptz default now()
)`);

// alvos: o que o coletor on-premise deixou marcado como geração .cloud, casado com o município
const alvos = (await q(`select p.cod_ibge, p.municipio, m.uf, p.base_url from equiplano_portal p
  join municipios_br m on m.cod_ibge = p.cod_ibge
 where p.base_url ilike '%equiplano.cloud%'
 ${process.env.SO ? "and p.municipio ilike '%'||$1||'%'" : ""} order by p.municipio`,
  process.env.SO ? [process.env.SO] : [])).rows
  .map((a) => ({ ...a, host: String(a.base_url).replace(/^https?:\/\//, "").split("/")[0] }));
console.log(`[equiplano.cloud] ${alvos.length} portais: ${alvos.map((a) => a.municipio).join(", ")}`);

const browser = await chromium.launch({ headless: true });
const pega = async (u, H) => {
  const r = await fetch(API + u, { headers: { ...H, accept: "application/json" }, signal: AbortSignal.timeout(120000) });
  if (!r.ok) throw new Error(`HTTP ${r.status} em ${u.slice(0, 60)}`);
  return await r.json();
};

let totalGeral = 0, ok = 0, falhas = 0;
for (const a of alvos) {
  try {
    // 0. handshake no navegador
    const page = await browser.newPage();
    let H = null;
    page.on("request", (r) => {
      if (!H && /api\.equiplano\.cloud/.test(r.url())) {
        const h = r.headers();
        if (h["x-entity-uuid"]) H = Object.fromEntries(Object.entries(h).filter(([k]) => k.startsWith("x-")));
      }
    });
    await page.goto(`https://${a.host}/inicio`, { waitUntil: "networkidle", timeout: 90000 }).catch(() => {});
    await page.waitForTimeout(2500);
    await page.close();
    if (!H) throw new Error("sem handshake da API (headers x-*)");

    // 1. a ação da folha
    const menu = await pega("/acao?take=0", H);
    const acao = (menu.dados || menu.data || []).find((x) => /pessoal\/salarios\/relacao-servidores-salarios$/i.test(x.link || ""));
    if (!acao) throw new Error("portal sem a ação relacao-servidores-salarios");

    // 2. entidades × exercícios (agregado) — daqui saem os uuid de entidade e os anos
    const agg = await pega(`/pes_relacao_servidores_salarios/relacaoDeServidoresSalariosMS?page=0&size=200&acaoUuid=${acao.uuid}&entidadeUuid=${H["x-entity-uuid"]}`, H);
    const pares = (agg.data || []).map((x) => ({ ent: x.uuidEntidade, nome: x.nmEntidade, ano: x.nrExercicio }));
    if (!pares.length) throw new Error("agregado vazio");
    // só o exercício mais recente de cada entidade (a série inteira é grande; a competência mais cheia sai depois)
    const porEnt = new Map();
    for (const p of pares) if (!porEnt.has(p.ent) || porEnt.get(p.ent).ano < p.ano) porEnt.set(p.ent, p);

    const regs = [];
    for (const p of porEnt.values()) {
      const meses = await pega(`/pes_relacao_servidores_salarios/listMesRelacaoDeServidoresSalariosMS?exercicio=${p.ano}&entidadeUuid=${p.ent}&page=0&size=20&acaoUuid=${acao.uuid}`, H);
      const lista = (meses.data || []).map((m) => m.mes || m.mesType).filter(Boolean);
      if (!lista.length) continue;
      // 🚨 competência mais CHEIA, não a mais recente: em Imbaú o último mês publicado tinha 1 registro e o
      // município saía com "1 servidor" ([[pnigp-competencia-mais-cheia-nao-a-recente]]). Uma sondagem com
      // size=1 por mês custa pouco e diz qual é a cheia.
      let mes = lista[lista.length - 1], melhor = -1;
      for (const cand of lista) {
        const s = await pega(`/pes_relacao_servidores_salarios/listDataRelacaoDeServidoresSalariosMS?exercicio=${p.ano}&entidadeUuid=${p.ent}&mesType=${encodeURIComponent(cand)}&page=0&size=1&acaoUuid=${acao.uuid}`, H).catch(() => null);
        const n = s?.totalCount ?? 0;
        if (n > melhor) { melhor = n; mes = cand; }
      }
      for (let page = 0; page < 200; page++) {
        const j = await pega(`/pes_relacao_servidores_salarios/listDataRelacaoDeServidoresSalariosMS?exercicio=${p.ano}&entidadeUuid=${p.ent}&mesType=${encodeURIComponent(mes)}&page=${page}&size=${PAG}&acaoUuid=${acao.uuid}`, H);
        const arr = j.data || [];
        if (!arr.length) break;
        for (const s of arr) {
          const nome = String(s.nmServidor || "").trim();
          if (!nome) continue;
          const comp = `${s.nrExercicio}${String(MESN[s.mes] || "00")}`;
          regs.push({
            cod_ibge: a.cod_ibge, municipio: a.municipio, uf: a.uf, base_url: `https://${a.host}`,
            entidade: String(s.cdEntidade ?? ""), entidade_nome: s.nmEntidade, competencia: comp,
            matricula: String(s.matriculaServidor ?? ""), nome, cargo: s.nmCargoServidor,
            funcao_confianca: null, lotacao: s.nmLotacaoServidor, secretaria: s.nmLotacaoServidor,
            situacao: s.isServidorLicenciado === "1" ? "licenciado" : null,
            vantagens: Number.isFinite(+s.vlSalarioBruto) ? +s.vlSalarioBruto : null,
            descontos: Number.isFinite(+s.vlDescontos) ? +s.vlDescontos : null,
            liquido: Number.isFinite(+s.vlLiquido) ? +s.vlLiquido : null,
            _hash: crypto.createHash("md5").update([a.cod_ibge, comp, s.cdEntidade, s.matriculaServidor, nome, s.nmCargoServidor].join("¦")).digest("hex"),
          });
        }
        if (arr.length < PAG) break;
      }
    }
    if (!regs.length) throw new Error("nenhuma entidade devolveu servidores");

    const m = new Map(); for (const r of regs) m.set(r._hash, r);
    const arr = [...m.values()];
    for (let k = 0; k < arr.length; k += 1000) {
      const pp = arr.slice(k, k + 1000); const c = (f) => pp.map((x) => x[f]);
      await q(`insert into folha_servidores_equiplano
        (cod_ibge,municipio,uf,base_url,entidade,entidade_nome,competencia,matricula,nome,cargo,funcao_confianca,
         lotacao,secretaria,situacao,vantagens,descontos,liquido,_hash)
        select * from unnest($1::text[],$2::text[],$3::text[],$4::text[],$5::text[],$6::text[],$7::text[],$8::text[],
          $9::text[],$10::text[],$11::text[],$12::text[],$13::text[],$14::text[],$15::numeric[],$16::numeric[],
          $17::numeric[],$18::text[])
        on conflict (_hash) do update set liquido=excluded.liquido, _coletado_em=now()`,
        [c("cod_ibge"), c("municipio"), c("uf"), c("base_url"), c("entidade"), c("entidade_nome"), c("competencia"),
         c("matricula"), c("nome"), c("cargo"), c("funcao_confianca"), c("lotacao"), c("secretaria"), c("situacao"),
         c("vantagens"), c("descontos"), c("liquido"), c("_hash")]);
    }
    await q(`insert into folha_equiplano_coleta (cod_ibge,municipio,uf,competencia,linhas,situacao,detalhe,em)
      values ($1,$2,$3,$4,$5,'ok','geração .cloud (api.equiplano.cloud)',now())
      on conflict (cod_ibge) do update set competencia=excluded.competencia, linhas=excluded.linhas,
        situacao='ok', detalhe=excluded.detalhe, em=now()`,
      [a.cod_ibge, a.municipio, a.uf, arr[0]?.competencia || null, arr.length]);
    totalGeral += arr.length; ok++;
    console.log(`  ${a.municipio}: ${arr.length} servidores`);
  } catch (e) {
    falhas++;
    await q(`insert into folha_equiplano_coleta (cod_ibge,municipio,uf,linhas,situacao,detalhe,em)
      values ($1,$2,$3,0,'erro',$4,now()) on conflict (cod_ibge) do update set situacao='erro',
      detalhe=excluded.detalhe, em=now()`, [a.cod_ibge, a.municipio, a.uf, String(e.message).slice(0, 150)]);
    console.log(`  ✖ ${a.municipio}: ${String(e.message).slice(0, 80)}`);
  }
}
await browser.close();
console.log(`\n[equiplano.cloud] ${totalGeral.toLocaleString("pt-BR")} servidores · ${ok} ok · ${falhas} falhas`);
await db.end();
