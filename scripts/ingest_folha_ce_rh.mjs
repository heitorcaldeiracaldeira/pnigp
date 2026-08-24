// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════
// ingest_folha_ce_rh.mjs — folha NOMINAL dos municípios do CEARÁ pelo CMS municipal padrão do estado.
//
// ⭐ O ACHADO: 91 dos 118 municípios do CE sem folha usam o MESMO produto de site, com a folha em
//     {host}/recursoshumanos.php?MES={MM}{TIPO}&ANO={AAAA}&pagina={N}
//   e o host derivável do nome (`www.{slug}.ce.gov.br`). A tela é HTML server-side (PHP) — **não precisa de
//   navegador**, o que a torna ~20× mais rápida que os coletores de portal com Playwright.
//
// A TABELA traz os cinco campos: Data admissão · Funcionário · Vínculo · Cargo · **Setor** · Matrícula ·
// Carga horária · Proventos · Descontos · Líquido · Situação · Data demissão.
//
// ⭐ COMPETÊNCIA: o combo `MES` lista o que existe (`07FN`, `07FC1`, `06FN`…). **FN = folha normal**; FC1/FC2
//   são complementares e teriam poucas pessoas. Pegamos as FN mais recentes e ficamos com a MAIS CHEIA
//   ([[pnigp-competencia-mais-cheia-nao-a-recente]]) — o contador "N registros" da 1ª página diz o tamanho
//   sem precisar paginar.
// 🚨 Dinheiro em pt-BR ("3.483,20"): ponto é milhar. Ler como número americano daria 3,48 — erro de 1000×.
//
// Uso: node scripts/ingest_folha_ce_rh.mjs   ·   SO=Aiuaba   ·   REFAZ=1   ·   CONC=4
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
import crypto from "crypto";
import { pool, withRetry } from "./_cadprev.mjs";

const db = pool(); const q = withRetry(db);
const SO = process.env.SO || null;
const REFAZ = process.env.REFAZ === "1";
const MESES_TESTE = Number(process.env.MESES_TESTE || 3);
const UA = { "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36" };

await q(`create table if not exists folha_servidores_cerh (
  cod_ibge text, municipio text, uf text, host text, competencia text,
  nome text, matricula text, cargo text, secretaria text, vinculo text, situacao text,
  data_admissao text, carga_horaria text,
  bruto numeric, descontos numeric, liquido numeric,
  _hash text primary key, _coletado_em timestamptz default now()
)`);
await q(`create index if not exists ix_folha_cerh_mun on folha_servidores_cerh (cod_ibge)`);
await q(`create table if not exists folha_cerh_coleta (
  cod_ibge text primary key, municipio text, host text, competencia text,
  linhas int, situacao text, detalhe text, em timestamptz default now()
)`);

const money = (s) => {
  const t = String(s ?? "").replace(/[^\d,.-]/g, "").replace(/\./g, "").replace(",", ".");
  const n = +t; return Number.isFinite(n) ? n : null;
};
const limpa = (s) => String(s ?? "").replace(/<[^>]+>/g, " ").replace(/&nbsp;/gi, " ")
  .replace(/&amp;/gi, "&").replace(/&aacute;/gi, "á").replace(/\s+/g, " ").trim();
const baixa = async (u, tent = 3) => {
  for (let t = 0; t < tent; t++) {
    try {
      const r = await fetch(u, { headers: UA, redirect: "follow", signal: AbortSignal.timeout(40000) });
      if (r.ok) return await r.text();
    } catch { /* tenta de novo */ }
    await new Promise((s) => setTimeout(s, 1200 * (t + 1)));
  }
  return null;
};
// lê as linhas da tabela pelo CABEÇALHO (a ordem das colunas pode variar entre municípios)
function leTabela(html) {
  const heads = [...html.matchAll(/<th[^>]*>([\s\S]*?)<\/th>/gi)].map((m) => limpa(m[1]).toLowerCase());
  const col = (re) => heads.findIndex((h) => re.test(h));
  const ix = { adm: col(/admiss/), nome: col(/funcion|servidor|nome/), vinc: col(/v[íi]nculo/), cargo: col(/cargo/),
    sec: col(/secretaria/), setor: col(/^setor|lota/), mat: col(/matr/), carga: col(/carga/), prov: col(/proventos|bruto/),
    desc: col(/descontos/), liq: col(/l[íi]quido/), sit: col(/situa/) };
  if (ix.nome < 0) return { linhas: [], ix };
  const linhas = [];
  for (const tr of html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const tds = [...tr[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((m) => limpa(m[1]));
    if (tds.length < 5) continue;
    const p = (i) => (i >= 0 && i < tds.length ? tds[i] : null);
    const r = { adm: p(ix.adm), nome: p(ix.nome), vinc: p(ix.vinc), cargo: p(ix.cargo), setor: p(ix.setor) || p(ix.sec),
      mat: p(ix.mat), carga: p(ix.carga), prov: p(ix.prov), desc: p(ix.desc), liq: p(ix.liq), sit: p(ix.sit) };
    if (!r.nome || /^funcion/i.test(r.nome)) continue;
    linhas.push(r);
  }
  return { linhas, ix };
}

const ARQ = process.env.ALVOS || "scripts/_ce_recursoshumanos.json";
const UFA = process.env.UFA || "CE";
const alvos = JSON.parse((await import("fs")).readFileSync(ARQ, "utf8"))
  .filter((a) => !SO || a.nome.toLowerCase().includes(SO.toLowerCase()));
const feitos = REFAZ ? new Set()
  : new Set((await q(`select cod_ibge from folha_cerh_coleta where situacao='ok'`)).rows.map((r) => r.cod_ibge));
const fila = alvos.filter((a) => !feitos.has(a.cod_ibge));
console.log(`[ce-rh] ${alvos.length} municípios com o padrão · ${fila.length} na fila`);

const LOTE = 700;
async function grava(regs) {
  const uniq = [...new Map(regs.map((r) => [r._hash, r])).values()];
  for (let i = 0; i < uniq.length; i += LOTE) {
    const p = uniq.slice(i, i + LOTE); const c = (f) => p.map((x) => x[f]);
    await q(`insert into folha_servidores_cerh
      (cod_ibge,municipio,uf,host,competencia,nome,matricula,cargo,secretaria,vinculo,situacao,
       data_admissao,carga_horaria,bruto,descontos,liquido,_hash)
      select * from unnest($1::text[],$2::text[],$3::text[],$4::text[],$5::text[],$6::text[],$7::text[],$8::text[],
        $9::text[],$10::text[],$11::text[],$12::text[],$13::text[],$14::numeric[],$15::numeric[],$16::numeric[],$17::text[])
      on conflict (_hash) do update set bruto=excluded.bruto, liquido=excluded.liquido,
        secretaria=excluded.secretaria, cargo=excluded.cargo, vinculo=excluded.vinculo, _coletado_em=now()`,
      [c("cod_ibge"), c("municipio"), c("uf"), c("host"), c("competencia"), c("nome"), c("matricula"), c("cargo"),
       c("secretaria"), c("vinculo"), c("situacao"), c("data_admissao"), c("carga_horaria"),
       c("bruto"), c("descontos"), c("liquido"), c("_hash")]);
  }
  return uniq.length;
}

let ok = 0, vazios = 0, erros = 0, total = 0;
for (const [i, a] of fila.entries()) {
  const marca = (situacao, detalhe, comp = null, linhas = 0) =>
    q(`insert into folha_cerh_coleta (cod_ibge,municipio,host,competencia,linhas,situacao,detalhe,em)
       values ($1,$2,$3,$4,$5,$6,$7,now()) on conflict (cod_ibge) do update set
       competencia=excluded.competencia, linhas=excluded.linhas, situacao=excluded.situacao,
       detalhe=excluded.detalhe, em=now()`, [a.cod_ibge, a.nome, a.host, comp, linhas, situacao, detalhe]);
  try {
    const home = await baixa(`${a.host}${a.caminho || "/recursoshumanos.php"}`);
    if (!home) throw new Error("recursoshumanos.php não respondeu");
    // competências do combo MES; FN = folha normal (as FC são complementares, com poucas pessoas)
    // 🚨 o HTML usa ASPAS SIMPLES (value='07FN'): um regex que exige aspas duplas devolve zero competências
    // e o município inteiro sai como "vazio" — erro que não falha ([[pnigp-coletor-ok-sem-dado-sete-causas]]).
    const comps = [...new Set([...home.matchAll(/<option[^>]*value=["'](\d{2}F[NC]\d?)["']/gi)].map((m) => m[1]))];
    const anos = [...new Set([...home.matchAll(/<option[^>]*value=["'](20\d{2})["']/gi)].map((m) => m[1]))].sort().reverse();
    const fn = comps.filter((c) => /FN$/.test(c)).sort().reverse();
    if (!fn.length || !anos.length) { await marca("vazio", `sem competência FN (comps=${comps.length})`); vazios++; continue; }

    // ⭐ a mais CHEIA entre as FN recentes — o contador "N registros" evita paginar para descobrir
    let melhor = null;
    for (const comp of fn.slice(0, MESES_TESTE)) {
      const p1 = await baixa(`${a.host}${a.caminho || "/recursoshumanos.php"}?&MES=${comp}&ANO=${anos[0]}&pagina=1`);
      if (!p1) continue;
      const n = +((p1.match(/([\d.]+)\s*registros?/i) || [])[1] || "0").replace(/\./g, "");
      if (n && (!melhor || n > melhor.n)) melhor = { comp, ano: anos[0], n, p1 };
    }
    if (!melhor || !melhor.n) { await marca("vazio", "nenhuma competência com registros"); vazios++; continue; }

    const paginas = Math.ceil(melhor.n / 30);
    const regs = []; const vistos = new Set();
    for (let pg = 1; pg <= paginas; pg++) {
      const html = pg === 1 ? melhor.p1 : await baixa(`${a.host}${a.caminho || "/recursoshumanos.php"}?&MES=${melhor.comp}&ANO=${melhor.ano}&pagina=${pg}`);
      if (!html) break;
      const { linhas } = leTabela(html);
      if (!linhas.length) break;
      for (const r of linhas) {
        const k = [r.mat, r.nome, r.cargo, r.prov].join("|");
        if (vistos.has(k)) continue;
        vistos.add(k);
        regs.push({
          cod_ibge: a.cod_ibge, municipio: a.nome, uf: UFA, host: a.host,
          competencia: `${melhor.comp}-${melhor.ano}`,
          nome: r.nome, matricula: r.mat, cargo: r.cargo, secretaria: r.setor, vinculo: r.vinc,
          situacao: r.sit, data_admissao: r.adm, carga_horaria: r.carga,
          bruto: money(r.prov), descontos: money(r.desc), liquido: money(r.liq),
          _hash: crypto.createHash("md5").update([a.cod_ibge, melhor.comp, melhor.ano, r.mat, r.nome, r.cargo].join("|")).digest("hex"),
        });
      }
    }
    if (!regs.length) { await marca("vazio", `${melhor.n} registros declarados, 0 lidos`); vazios++; continue; }
    const n = await grava(regs);
    total += n; ok++;
    await marca("ok", `${melhor.n} declarados · ${paginas} páginas`, `${melhor.comp}-${melhor.ano}`, n);
    if (ok % 5 === 0 || n > 3000) console.log(`  ✔ [${i + 1}/${fila.length}] ${a.nome}: ${n} servidores (${melhor.comp}/${melhor.ano})`);
  } catch (e) {
    erros++; await marca("erro", String(e.message).slice(0, 150));
    console.log(`  ✖ [${i + 1}/${fila.length}] ${a.nome}: ${String(e.message).slice(0, 60)}`);
  }
}
console.log(`\n[ce-rh] ${total.toLocaleString("pt-BR")} servidores · ${ok} ok · ${vazios} vazios · ${erros} erros`);
console.table((await q(`select count(distinct cod_ibge) municipios, count(*) linhas,
  count(*) filter (where bruto>0) com_valor, count(*) filter (where secretaria is not null and secretaria<>'') com_sec
  from folha_servidores_cerh`)).rows);
await db.end();
