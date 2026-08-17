// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
// levanta_am_aam.mjs — LEVANTAMENTO do portal da AAM (Associação Amazonense de Municípios), que concentra
// 44 prefeituras + 36 câmaras + 14 autarquias do Amazonas em `transparenciamunicipalaam.org.br/p/{slug}`.
//
// A pergunta que este script responde não é "existe menu de pessoal" (existe em todos), é
//   **o município publica FOLHA, de que ANO, e em que FORMATO?**
// porque o portal é um REPOSITÓRIO DE ARQUIVOS, não uma tela de dados
// ([[pnigp-diagnostico-profundo-menu-dados-produto]], 2ª pergunta: a tela tem linhas de fato?).
//
// ⭐ O mecanismo (medido): a árvore ano → tema → mês vem no HTML com `data-path` (payload cifrado do Laravel).
// Clicar num mês dispara `POST /get-files-list {path, _token}` → JSON `{data:[{arquivo, criacao, path, downloadto}]}`.
// O arquivo sai por `/download/{pdf|csv|doc}/{downloadto}`.
// 🚨 `/download/csv` só funciona quando o ORIGINAL é planilha — em PDF devolve HTTP 500. O formato do que está
// lá dentro é o que decide se dá para extrair folha nominal ou se é só resumo contábil digitalizado.
//
// Uso: node scripts/levanta_am_aam.mjs   ·   CONC=4   ·   SO=apui
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
import { pool, withRetry } from "./_cadprev.mjs";

const db = pool();
const q = withRetry(db);
const CONC = +(process.env.CONC || 4);
const SO = process.env.SO || null;
const B = "https://transparenciamunicipalaam.org.br";
const UA = { "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36", accept: "*/*", "accept-language": "pt-BR,pt;q=0.9" };
const dec = (b) => { const u = b.toString("utf8"); return /�/.test(u.slice(0, 4000)) ? b.toString("latin1") : u; };
const dorme = (ms) => new Promise((s) => setTimeout(s, ms));

function sessao() {
  const c = new Map();
  const H = () => [...c].map(([k, v]) => `${k}=${v}`).join("; ");
  return async (u, opt = {}) => {
    for (let t = 0; t < 3; t++) {
      try {
        const r = await fetch(u, { method: opt.method || "GET", body: opt.body, redirect: "follow",
          signal: AbortSignal.timeout(120000), headers: { ...UA, ...(H() ? { cookie: H() } : {}), ...(opt.headers || {}) } });
        for (const sc of (r.headers.getSetCookie?.() || [])) { const kv = sc.split(";")[0], i = kv.indexOf("="); if (i > 0) c.set(kv.slice(0, i), kv.slice(i + 1)); }
        const buf = Buffer.from(await r.arrayBuffer());
        return { st: r.status, ct: r.headers.get("content-type") || "", t: dec(buf), n: buf.length };
      } catch (e) { if (t === 2) return { st: 0, t: "", n: 0, erro: String(e?.cause?.message || e.message).slice(0, 50) }; await dorme(2500 * (t + 1)); }
    }
  };
}

await q(`create table if not exists am_aam_levantamento (
  slug text, ente text, tipo text, cod_ibge text, municipio text,
  tema text, ano text, mes text, arquivo text, extensao text, criacao text, downloadto text,
  em timestamptz default now(), primary key (slug, tema, ano, mes, arquivo)
)`);
await q(`create table if not exists am_aam_ente (
  slug text primary key, tipo text, nome_portal text, cod_ibge text, municipio text,
  tem_menu_pessoal boolean, anos_com_folha text, ultimo_ano text, formatos text, arquivos int,
  veredito text, em timestamptz default now()
)`);

// ── 1. os entes do portal ───────────────────────────────────────────────────────────────────────────────────────
const nav0 = sessao();
const entes = [];
for (const tela of ["prefeituras", "camaras", "autarquias"]) {
  const r = await nav0(`${B}/${tela}`);
  // 🚨 casar o TEXTO do link junto com o href derrubou o levantamento para ZERO: os cards do portal têm imagem
  // e markup longo dentro do <a>, e o `{0,120}` não alcançava o fechamento. O slug basta — o nome vem do IBGE.
  const achados = [...r.t.matchAll(/href=["'][^"']*\/p\/([a-z0-9-]+)["']/gi)]
    .map((m) => ({ slug: m[1], nome: m[1], tipo: tela.slice(0, -1) }));
  const vistos = new Set();
  for (const a of achados) if (!vistos.has(a.slug)) { vistos.add(a.slug); entes.push(a); }
}
console.log(`[aam] ${entes.length} entes no portal (${entes.filter((e) => e.tipo === "prefeitura").length} prefeituras)`);

// casar slug → município do IBGE (o slug é o nome sem acento, com ou sem hífen)
const munis = (await q(`select cod_ibge, nome from municipios_br where uf='AM'`)).rows
  .map((m) => ({ ...m, chave: m.nome.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "") }));
const casa = (slug) => {
  const k = slug.replace(/-camara$/, "").replace(/[^a-z0-9]/g, "");
  return munis.find((m) => m.chave === k) || munis.find((m) => m.chave.startsWith(k) && k.length > 5) || null;
};

// ── 2. por ente: a árvore de "Servidores Públicos" e os arquivos mais recentes ───────────────────────────────────
const MESES = { "01": 1, "02": 2, "03": 3, "04": 4, "05": 5, "06": 6, "07": 7, "08": 8, "09": 9, 10: 10, 11: 11, 12: 12 };
async function levanta(e) {
  const nav = sessao();
  const REF = `${B}/p/${e.slug}/t/servidores-publicos`;
  const pg = await nav(REF);
  if (pg.st !== 200) return { ...e, veredito: `pagina ${pg.st || pg.erro}` };
  const token = (pg.t.match(/_token:\s*"([^"]+)"/) || [])[1];
  if (!token) return { ...e, veredito: "sem token (tema inexistente)" };

  // árvore em ORDEM: ano → tema → mês
  const nos = [...pg.t.matchAll(/data-path="([^"]+)"[^>]*>([^<]{2,45})<\/label>/gi)].map((m) => ({ path: m[1], rot: m[2].trim() }));
  let ano = null, tema = null;
  const folhas = [];
  for (const n of nos) {
    if (/^\d{4}$/.test(n.rot)) { ano = n.rot; tema = null; continue; }
    if (!/^\d\d\s/.test(n.rot)) { tema = n.rot; folhas.push({ ano, tema, mes: "—", path: n.path }); continue; }
    folhas.push({ ano, tema, mes: n.rot, path: n.path });
  }
  if (!folhas.length) return { ...e, veredito: "menu sem árvore de arquivos" };

  const lista = async (p) => {
    const body = new URLSearchParams({ path: decodeURIComponent(p), _token: token });
    const r = await nav(`${B}/get-files-list`, { method: "POST", body: body.toString(),
      headers: { "content-type": "application/x-www-form-urlencoded", "x-requested-with": "XMLHttpRequest", referer: REF } });
    try { return Object.values(JSON.parse(r.t).data || {}); } catch { return []; }
  };

  // só o que interessa: FOLHA DE PAGAMENTO (e os dois primos), do mais novo para o mais velho, até achar arquivo
  const alvo = folhas
    .filter((f) => /folha de pagamento|quadro atual|cargos e sal/i.test(f.tema || ""))
    .sort((a, b) => (b.ano || "").localeCompare(a.ano || "") || (b.mes || "").localeCompare(a.mes || ""));
  const achados = [];
  let tentativas = 0;
  for (const f of alvo) {
    if (tentativas >= 18 || achados.length >= 6) break;
    tentativas++;
    const arqs = await lista(f.path);
    for (const a of arqs) achados.push({ ...f, arquivo: a.arquivo, criacao: a.criacao, downloadto: a.downloadto,
      extensao: (a.arquivo.match(/\.([a-z0-9]{2,5})$/i) || [, "?"])[1].toLowerCase() });
    await dorme(150);
  }
  for (const a of achados) {
    await q(`insert into am_aam_levantamento (slug,ente,tipo,cod_ibge,municipio,tema,ano,mes,arquivo,extensao,criacao,downloadto)
             values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) on conflict do nothing`,
      [e.slug, e.nome, e.tipo, e.ibge?.cod_ibge || null, e.ibge?.nome || null, a.tema, a.ano, a.mes, a.arquivo, a.extensao, a.criacao, a.downloadto]);
  }
  const anos = [...new Set(achados.map((a) => a.ano))].sort();
  const fmts = [...new Set(achados.map((a) => a.extensao))];
  return { ...e, achados: achados.length, anos, fmts,
    veredito: achados.length ? `publica (${anos[anos.length - 1]}, ${fmts.join("/")})` : "menu tem pessoal, nenhum arquivo nos nós recentes" };
}

const alvos = entes.filter((e) => e.tipo === "prefeitura" && (!SO || e.slug.includes(SO)))
  .map((e) => ({ ...e, ibge: casa(e.slug) }));
console.log(`[aam] levantando ${alvos.length} prefeituras (casadas com IBGE: ${alvos.filter((a) => a.ibge).length})`);

const fila = [...alvos];
const saida = [];
await Promise.all(Array.from({ length: CONC }, async () => {
  while (fila.length) {
    const e = fila.shift();
    const r = await levanta(e);
    saida.push(r);
    console.log(`  ${(r.ibge?.nome || r.slug).padEnd(26)} ${r.veredito}`);
    await q(`insert into am_aam_ente (slug,tipo,nome_portal,cod_ibge,municipio,tem_menu_pessoal,anos_com_folha,ultimo_ano,formatos,arquivos,veredito,em)
             values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,now())
             on conflict (slug) do update set veredito=excluded.veredito, anos_com_folha=excluded.anos_com_folha,
               ultimo_ano=excluded.ultimo_ano, formatos=excluded.formatos, arquivos=excluded.arquivos, em=now()`,
      [e.slug, e.tipo, e.nome, e.ibge?.cod_ibge || null, e.ibge?.nome || null, true,
       (r.anos || []).join(","), (r.anos || []).slice(-1)[0] || null, (r.fmts || []).join(","), r.achados || 0, r.veredito]);
  }
}));

console.log("\n═══ RESUMO ═══");
console.table((await q(`select coalesce(ultimo_ano,'—') ultimo_ano, coalesce(formatos,'—') formatos, count(*) municipios
  from am_aam_ente where tipo='prefeitura' group by 1,2 order by 1 desc, 3 desc`)).rows);
console.table((await q(`select extensao, count(*) arquivos, count(distinct slug) municipios
  from am_aam_levantamento group by 1 order by 2 desc`)).rows);
await db.end();
