// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
// ingest_folha_am_diretoriodigital.mjs — folha nominal dos municípios no bloco **Diretório Digital** (SISTP):
// portal em `transparencia.diretoriodigital.inf.br` e arquivos num bucket da DigitalOcean (`space-dd1.sfo2`).
//
// O CAMINHO (todo por HTTP — o navegador só serviu para DESCOBRIR o contrato):
//   1. `client-page/{slug}/servidores_publicos` → os ids das subcategorias (estão no HTML estático).
//   2. `transparencia/{slug}/servidores_publicos/subcategoria/{id}` → o RÓTULO da subcategoria ("Folha de
//      Pagamento"), o `_token` (CSRF) e o `var entity = 'N'` num script inline.
//   3. ⭐ `POST transparencia/editions` (DataTables) com `entity_id`, `subcategory_id` e o payload de colunas →
//      JSON com uma linha por edição: `{description, competence, month, number_month, PDF, XLSX, DOCX, TXT}`.
//   4. O arquivo sai direto do bucket. Barreirinha tem **179 edições** só na subcategoria de folha.
//
// 🚨 O QUE ENGANA AQUI: a listagem NÃO está no HTML — o `client-page` estático devolve sempre a mesma página de
// 65 KB, sem um href para o bucket, e parece "portal sem dado". É DataTables montando por JS. Sem abrir uma vez
// com navegador para ver o XHR, a conclusão seria "precisa de Playwright"; com o contrato na mão, é HTTP puro.
// 🚨 Os parâmetros são `entity_id`/`subcategory_id` (não `entity`/`subcategory`) e o servidor EXIGE o payload
// completo de `columns[i][…]` do DataTables: com um corpo mínimo devolve `recordsTotal: 0`, que parece portal
// vazio e é requisição incompleta — o mesmo tipo de armadilha do `sortBy=null` do Betha.
//
// O PDF é lido pela bateria compartilhada (`_folha_pdf_parsers.mjs`): em Barreirinha o relatório é o mesmo
// "Resumo da Folha por Funcionário" (Betha) que já era lido em Pauini pelo portal da AAM.
//
// Uso: node scripts/ingest_folha_am_diretoriodigital.mjs   ·   SO=barreirinha   ·   REFAZ=1
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
import crypto from "crypto";
import { pool, withRetry } from "./_cadprev.mjs";
import { extractText, getDocumentProxy } from "unpdf";
import { parsePdfTexto } from "./_folha_pdf_parsers.mjs";

const db = pool();
const q = withRetry(db);
const B = "https://transparencia.diretoriodigital.inf.br/";
const SO = process.env.SO || null;
const REFAZ = process.env.REFAZ === "1";
const CONC = +(process.env.CONC || 3);
const UA = { "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36", accept: "*/*", "accept-language": "pt-BR,pt;q=0.9" };
const dorme = (ms) => new Promise((s) => setTimeout(s, ms));
const dec = (b) => { const u = b.toString("utf8"); return /�/.test(u.slice(0, 3000)) ? b.toString("latin1") : u; };

async function req(url, opt = {}) {
  // ⚠️ download de PDF grande no bucket às vezes trava: 4 tentativas × 300 s = 20 min num arquivo só, e a coleta
  // parece pendurada. Binário usa menos tentativas e menos paciência.
  const maxT = opt.tentativas ?? 4;
  for (let t = 0; t < maxT; t++) {
    try {
      const r = await fetch(url, { method: opt.method || "GET", body: opt.body, redirect: "follow",
        signal: AbortSignal.timeout(opt.timeout || 120000), headers: { ...UA, ...(opt.headers || {}) } });
      const b = Buffer.from(await r.arrayBuffer());
      return { st: r.status, buf: b, t: opt.bin ? "" : dec(b), n: b.length };
    } catch (e) { if (t === maxT - 1) return { st: 0, buf: Buffer.alloc(0), t: "", n: 0, erro: String(e?.cause?.message || e.message).slice(0, 50) }; await dorme(2500 * (t + 1)); }
  }
}

await q(`create table if not exists folha_servidores_dd (
  cod_ibge text, municipio text, uf text, slug text, competencia text,
  secretaria text, vinculo text, matricula text, nome text, cargo text, data_admissao text,
  bruto numeric, descontos numeric, liquido numeric, layout text, arquivo text,
  _hash text primary key, _coletado_em timestamptz default now()
)`);
await q(`create index if not exists ix_folha_dd_mun on folha_servidores_dd (cod_ibge, competencia)`);
await q(`create table if not exists folha_dd_coleta (
  cod_ibge text primary key, slug text, municipio text, competencia text, edicoes int, servidores int,
  layout text, situacao text, detalhe text, em timestamptz default now()
)`);

// ⚠️ `pm-careiro` é de **Careiro da Várzea** — foi o site dela que apontou para
// `space-dd1…/prod/transparencia/pm-careiro/…`; o Careiro (município distinto) está no portal da AAM.
const SEMENTE = [
  ["1300508", "Barreirinha", "pm-barreirinha"],
  ["1301159", "Careiro da Várzea", "pm-careiro"],
  ["1302207", "Juruá", "pm-jurua"],
  ["1303007", "Nhamundá", "pm-nhamunda"],
  ["1301001", "Carauari", "pm-carauari"],
  // 2ª leva (17/ago): achados varrendo os municípios que ainda não tinham folha — o CMS do site
  // (`diretoriodigital.com.br`) é pista, mas quem confirma é o `client-page/{slug}` responder com categorias.
  ["1304302", "Urucará", "pm-urucara"],
  ["1300060", "Amaturá", "pm-amatura"],
  ["1300086", "Anamã", "pm-anama"],
  ["1300706", "Boca do Acre", "pm-bocadoacre"],
  // ⚠️ Tabatinga tinha veredito "host_e_do_iss_nao_da_folha" (o :8111 do Radar é o ISSWEB): o portal de
  // transparência dela é o Diretório Digital. O rótulo de ERP apontava para o sistema errado.
  ["1304062", "Tabatinga", "pm-tabatinga"],
];

// o payload de colunas que o DataTables manda — o servidor monta a query a partir dele
function corpoEditions(token, entityId, subcategoryId, length = 500) {
  const cols = [["id", "id"], ["competence", "editions.competence"], ["month", "editions.month"],
    ["created_at", "editions.created_at"], ["description", "editions.description"], ["actions", "actions"]];
  const b = new URLSearchParams();
  b.set("draw", "1");
  cols.forEach(([d, n], i) => {
    b.set(`columns[${i}][data]`, d); b.set(`columns[${i}][name]`, n);
    b.set(`columns[${i}][searchable]`, "true"); b.set(`columns[${i}][orderable]`, "true");
    b.set(`columns[${i}][search][value]`, ""); b.set(`columns[${i}][search][regex]`, "false");
  });
  b.set("start", "0"); b.set("length", String(length));
  b.set("search[value]", ""); b.set("search[regex]", "false");
  b.set("_token", token || ""); b.set("entity_id", String(entityId));
  b.set("subcategory_id", String(subcategoryId)); b.set("data_ini", ""); b.set("data_end", "");
  return b.toString();
}

const feitos = REFAZ ? new Set() : new Set((await q(`select cod_ibge from folha_dd_coleta where situacao='ok'`)).rows.map((r) => r.cod_ibge));
const fila = SEMENTE.filter(([cod, mun, slug]) => (!SO || slug.includes(SO) || mun.toLowerCase().includes(SO.toLowerCase())) && !feitos.has(cod));
console.log(`[dd] ${SEMENTE.length} municípios · ${fila.length} na fila`);

let totalGeral = 0;
for (const [cod, municipio, slug] of fila) {
  const marca = (situacao, detalhe, comp = null, edicoes = 0, servs = 0, layout = null) =>
    q(`insert into folha_dd_coleta (cod_ibge,slug,municipio,competencia,edicoes,servidores,layout,situacao,detalhe,em)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,now())
       on conflict (cod_ibge) do update set competencia=excluded.competencia, edicoes=excluded.edicoes,
         servidores=excluded.servidores, layout=excluded.layout, situacao=excluded.situacao,
         detalhe=excluded.detalhe, em=now()`,
      [cod, slug, municipio, comp, edicoes, servs, layout, situacao, detalhe]);
  try {
    console.log(`\n══ ${municipio} (${slug})`);
    // 🚨 O SLUG DA CATEGORIA MUDA de município para município: `servidores_publicos` (Barreirinha, com
    // UNDERSCORE), `servidores-publicos` (Carauari, com HÍFEN) e `recursos-humanos` (Nhamundá). Fixar um só
    // devolvia 404 e fazia o município parecer fora do portal — quando ele está lá com outro nome. Por isso a
    // categoria é LIDA da home do ente, e a lista fixa é só o plano B.
    const raiz = await req(`${B}client-page/${slug}`);
    const cats = [...new Set([...raiz.t.matchAll(new RegExp(`client-page/${slug}/([a-z0-9_%-]{3,40})`, "gi"))].map((m) => m[1]))];
    const candidatasCat = [...cats.filter((c) => /servidor|pessoal|recursos.?humanos/i.test(decodeURIComponent(c))),
      "servidores_publicos", "servidores-publicos", "recursos-humanos"];
    let home = null, subs = [];
    for (const cat of [...new Set(candidatasCat)]) {
      const r0 = await req(`${B}client-page/${slug}/${cat}`);
      const s0 = [...new Set([...r0.t.matchAll(/subcategoria\/(\d+)/g)].map((m) => m[1]))];
      if (r0.st === 200 && s0.length) { home = { ...r0, cat }; subs = s0; console.log(`  categoria: ${cat}`); break; }
    }
    if (!subs.length) { await marca("erro", `sem subcategorias (categorias vistas: ${cats.slice(0, 6).join(",") || "nenhuma"})`); console.log("  ✖ sem subcategorias"); continue; }

    // 🚨 Escolher a subcategoria PELO RÓTULO falha: em Carauari o rótulo de "Folha de Pagamento" vem VAZIO no
    // HTML e o município saía "sem subcategoria de folha" com 322 edições publicadas ao lado. Agora TODAS as
    // subcategorias são medidas pela própria API (quantas edições têm e como se chamam as edições), e vence a
    // que tem cara de folha — rótulo é pista, não sentença.
    let alvo = null, dados = [];
    for (const sub of subs) {
      const p = await req(`${B}transparencia/${slug}/${home.cat}/subcategoria/${sub}`);
      if (p.st !== 200) continue;
      const texto = p.t.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
      const rotulo = (texto.match(/Recursos Humanos\s+([A-Za-zÀ-ú\s]{4,45}?)\s+Atualizado/) || [, ""])[1].trim();
      const token = (p.t.match(/name=["']csrf-token["']\s+content=["']([^"']+)["']/i) || p.t.match(/_token["']\s*[:=]\s*["']([^"']+)["']/i) || [])[1];
      const entity = (p.t.match(/var\s+entity\s*=\s*['"](\d+)['"]/) || [])[1];
      if (!entity) continue;
      const r0 = await req(`${B}transparencia/editions`, { method: "POST", body: corpoEditions(token, entity, sub),
        headers: { "content-type": "application/x-www-form-urlencoded; charset=UTF-8", "x-requested-with": "XMLHttpRequest",
          referer: `${B}transparencia/${slug}/${home.cat}/subcategoria/${sub}` } });
      let d0 = [];
      try { d0 = JSON.parse(r0.t).data || []; } catch { /* html */ }
      const folhoso = /folha/i.test(rotulo) || d0.filter((x) => /folha de pagamento/i.test(x.description || "")).length;
      console.log(`   subcategoria ${sub}: "${rotulo || "(sem rótulo)"}" · ${d0.length} edições${folhoso ? " ← folha" : ""}`);
      if (folhoso && d0.length > dados.length) { alvo = { sub, token, entity, rotulo }; dados = d0; }
      await dorme(150);
    }
    if (!alvo || !dados.length) { await marca("vazio", "nenhuma subcategoria com edições de folha"); console.log("  ✖ sem edições de folha"); continue; }
    console.log(`  ${dados.length} edições de folha na subcategoria ${alvo.sub}`);

    // 🚨 competência mais cheia, não a mais recente: tenta as 4 edições mais novas com PDF e fica com a que
    // rende mais servidores ([[pnigp-competencia-mais-cheia-nao-a-recente]]).
    const comPdf = dados.filter((d) => d.PDF)
      .sort((a, b) => `${b.competence}${b.number_month}`.localeCompare(`${a.competence}${a.number_month}`))
      .slice(0, 3);
    let melhor = null;
    for (const ed of comPdf) {
      const url = `https://space-dd1.sfo2.digitaloceanspaces.com/${ed.PDF}`;
      const d = await req(url, { bin: true, timeout: 120000, tentativas: 2 });
      if (d.st !== 200 || d.n < 2000) continue;
      let texto = "";
      try {
        const pdf = await getDocumentProxy(new Uint8Array(d.buf), { useSystemFonts: false });
        texto = (await extractText(pdf, { mergePages: true })).text;
      } catch { continue; }
      const p = parsePdfTexto(texto);
      const comp = p.competencia || `${ed.competence}${ed.number_month}`;
      console.log(`   ${ed.competence}/${ed.number_month} "${(ed.description || "").slice(0, 40)}" → ${p.regs.length} servidores (${p.layout || "-"})`);
      if (!melhor || p.regs.length > melhor.regs.length) melhor = { ...p, comp, arquivo: ed.PDF.split("/").pop() };
      if (melhor.regs.length >= 300) break;
      await dorme(300);
    }
    if (!melhor?.regs.length) { await marca("vazio", `${comPdf.length} PDFs, nenhum layout casou`, null, dados.length); console.log("  ✖ nenhum servidor extraído"); continue; }

    const m = new Map();
    for (const x of melhor.regs) {
      const h = crypto.createHash("md5").update([cod, melhor.comp, x.matricula, x.nome, x.cargo, x.secretaria].join("¦")).digest("hex");
      m.set(h, { ...x, cod_ibge: cod, municipio, uf: "AM", slug, competencia: melhor.comp,
        layout: melhor.layout, arquivo: melhor.arquivo, _hash: h });
    }
    const todos = [...m.values()];
    for (let i = 0; i < todos.length; i += 500) {
      const p = todos.slice(i, i + 500); const c = (f) => p.map((x) => x[f]);
      await q(`insert into folha_servidores_dd
        (cod_ibge,municipio,uf,slug,competencia,secretaria,vinculo,matricula,nome,cargo,data_admissao,
         bruto,descontos,liquido,layout,arquivo,_hash)
        select * from unnest($1::text[],$2::text[],$3::text[],$4::text[],$5::text[],$6::text[],$7::text[],$8::text[],
          $9::text[],$10::text[],$11::text[],$12::numeric[],$13::numeric[],$14::numeric[],$15::text[],$16::text[],$17::text[])
        on conflict (_hash) do update set bruto=greatest(coalesce(folha_servidores_dd.bruto,0), coalesce(excluded.bruto,0)),
          descontos=excluded.descontos, liquido=excluded.liquido, _coletado_em=now()`,
        [c("cod_ibge"), c("municipio"), c("uf"), c("slug"), c("competencia"), c("secretaria"), c("vinculo"),
         c("matricula"), c("nome"), c("cargo"), c("data_admissao"), c("bruto"), c("descontos"), c("liquido"),
         c("layout"), c("arquivo"), c("_hash")]);
    }
    totalGeral += todos.length;
    await marca(todos.length < 10 ? "parcial" : "ok", null, melhor.comp, dados.length, todos.length, melhor.layout);
    console.log(`  ✔ ${municipio}: ${todos.length} servidores · ${melhor.comp} · layout ${melhor.layout} · ${todos.filter((x) => x.bruto > 0).length} com valor · ${new Set(todos.map((x) => x.secretaria)).size} unidades`);
  } catch (e) {
    await marca("erro", String(e?.cause?.message || e.message).slice(0, 200));
    console.log(`  ✖ ${municipio}: ${String(e.message).slice(0, 90)}`);
  }
}
console.log(`\n[dd] ${totalGeral.toLocaleString("pt-BR")} servidores gravados`);
await db.end();
