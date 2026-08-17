// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
// ingest_folha_am_aam.mjs — folha nominal dos municípios do AMAZONAS pelo portal da AAM
// (Associação Amazonense de Municípios), que concentra 44 prefeituras em `transparenciamunicipalaam.org.br`.
//
// ⭐ POR QUE ESTE COLETOR EXISTE: o TCE-AM recebe a folha e não publica (e-Contas é login), e o estado tinha
// 4 municípios com folha de verdade em 62. O portal da AAM entrega, por município, a **FOLHA ANALÍTICA
// NOMINAL** — só que em PDF, um arquivo por secretaria e por mês. Ver [[pnigp-am-aam-folha-analitica-pdf]].
//
// O CAMINHO (3 saltos, medidos):
//   1. `/p/{slug}/t/servidores-publicos` traz a árvore ano → tema → mês em `<label data-path="…">`, com o path
//      **cifrado pelo Laravel**, e o `_token` (CSRF) no HTML.
//   2. `POST /get-files-list {path,_token}` → JSON `{data:[{arquivo, criacao, downloadto}]}`.
//   3. `GET /download/pdf/{downloadto}` → o PDF. 🚨 `/download/csv/` só serve quando o ORIGINAL é planilha;
//      em PDF devolve HTTP 500 — não adianta pedir CSV para não ter que ler PDF.
//
// O PDF tem CAMADA DE TEXTO (nada de OCR): `Unidade: 020801 - SEC. DE OBRAS` · `Vínculo: 30 - ESTATUTARIO` e,
// por servidor, `Matrícula · Nome do Trabalhador · Admissão · Cargo · CPF · PIS · rubricas P/D · Proventos ·
// Descontos · Líquido`. Calibrado em Alvarães 03/2026: **63 de 63 servidores casados**.
//
// 🚨 NUNCA somar as rubricas para achar o bruto — o próprio PDF fecha em `Proventos`. As rubricas vão para
// jsonb como detalhe, não como fonte do total (mesma lei do Portal TP, [[pnigp-portaltp-epublica-folha]]).
//
// Uso: node scripts/ingest_folha_am_aam.mjs   ·   SO=alvaraes   ·   ANO=2026   ·   CONC=3   ·   REFAZ=1
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
import crypto from "crypto";
import { pool, withRetry } from "./_cadprev.mjs";
import { extractText, getDocumentProxy } from "unpdf";
import { parsePdfTexto } from "./_folha_pdf_parsers.mjs";

const db = pool();
const q = withRetry(db);
const B = "https://transparenciamunicipalaam.org.br";
const SO = process.env.SO || null;
const ANO = process.env.ANO || null;
const CONC = +(process.env.CONC || 3);
const REFAZ = process.env.REFAZ === "1";
const UA = { "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36", accept: "*/*", "accept-language": "pt-BR,pt;q=0.9" };
const dorme = (ms) => new Promise((s) => setTimeout(s, ms));
const dec = (b) => { const u = b.toString("utf8"); return /�/.test(u.slice(0, 4000)) ? b.toString("latin1") : u; };
const num = (v) => {
  if (v == null) return null;
  const s = String(v).replace(/[R$\s]/g, "").trim();
  if (!s || s === "-") return null;
  const n = parseFloat(s.replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) ? n : null;
};

function sessao() {
  const c = new Map();
  const H = () => [...c].map(([k, v]) => `${k}=${v}`).join("; ");
  return async (u, opt = {}) => {
    for (let t = 0; t < 3; t++) {
      try {
        const r = await fetch(u, { method: opt.method || "GET", body: opt.body, redirect: "follow",
          signal: AbortSignal.timeout(opt.timeout || 180000),
          headers: { ...UA, ...(H() ? { cookie: H() } : {}), ...(opt.headers || {}) } });
        for (const sc of (r.headers.getSetCookie?.() || [])) { const kv = sc.split(";")[0], i = kv.indexOf("="); if (i > 0) c.set(kv.slice(0, i), kv.slice(i + 1)); }
        const buf = Buffer.from(await r.arrayBuffer());
        return { st: r.status, ct: r.headers.get("content-type") || "", buf, t: opt.bin ? "" : dec(buf) };
      } catch (e) { if (t === 2) return { st: 0, buf: Buffer.alloc(0), t: "", erro: String(e?.cause?.message || e.message).slice(0, 60) }; await dorme(3000 * (t + 1)); }
    }
  };
}

await q(`create table if not exists folha_servidores_amaam (
  cod_ibge text, municipio text, uf text, entidade text, competencia text,
  secretaria text, vinculo text, matricula text, nome text, cargo text,
  data_admissao text, cpf text, pis text, dependentes int,
  bruto numeric, descontos numeric, liquido numeric,
  rubricas jsonb, arquivo text,
  _hash text primary key, _coletado_em timestamptz default now()
)`);
await q(`create index if not exists ix_folha_amaam_mun on folha_servidores_amaam (cod_ibge, competencia)`);
await q(`create table if not exists folha_amaam_coleta (
  cod_ibge text primary key, slug text, municipio text, competencia text,
  arquivos int, servidores int, situacao text, detalhe text, em timestamptz default now()
)`);

// ── árvore do município ─────────────────────────────────────────────────────────────────────────────────────────
const MES_NUM = { janeiro: "01", fevereiro: "02", marco: "03", março: "03", abril: "04", maio: "05", junho: "06",
  julho: "07", agosto: "08", setembro: "09", outubro: "10", novembro: "11", dezembro: "12" };

function arvore(html) {
  const nos = [...html.matchAll(/data-path="([^"]+)"[^>]*>([^<]{2,45})<\/label>/gi)].map((m) => ({ path: m[1], rot: m[2].trim() }));
  let ano = null, tema = null;
  const out = [];
  for (const n of nos) {
    if (/^\d{4}$/.test(n.rot)) { ano = n.rot; tema = null; continue; }
    if (!/^\d\d\s/.test(n.rot)) {
      tema = n.rot;
      // 🚨 há tema que é FOLHA (tem meses dentro) e tema que é ARQUIVO DIRETO ("Quadro Atual de Servidores",
      // "Relação de Cargos e Salários" não têm mês). Emitir só os meses perdia esses — e é justamente onde
      // Benjamin Constant publica a lista nominal com valor.
      out.push({ ano, tema, mes: "00", rotulo: n.rot, path: n.path });
      continue;
    }
    const mes = MES_NUM[n.rot.replace(/^\d\d\s+/, "").toLowerCase()] || n.rot.slice(0, 2);
    out.push({ ano, tema, mes, rotulo: n.rot, path: n.path });
  }
  return out;
}

// ⭐ os 13 parsers vivem em `_folha_pdf_parsers.mjs` — o mesmo layout reaparece em outros portais do país.

// ── alvos ───────────────────────────────────────────────────────────────────────────────────────────────────────
const alvos = (await q(`select e.slug, e.cod_ibge, coalesce(e.municipio, e.slug) municipio, e.ultimo_ano
  from am_aam_ente e where e.tipo='prefeitura' and e.cod_ibge is not null and e.ultimo_ano is not null
  ${SO ? "and e.slug ilike '%'||$1||'%'" : ""} order by e.municipio`, SO ? [SO] : [])).rows;
const feitos = REFAZ ? new Set() : new Set((await q(`select cod_ibge from folha_amaam_coleta where situacao='ok'`)).rows.map((r) => r.cod_ibge));
const fila = alvos.filter((a) => !feitos.has(a.cod_ibge));
console.log(`[amaam] ${alvos.length} municípios com arquivo · ${fila.length} na fila`);

const LOTE = 400;
async function grava(regs) {
  const m = new Map(); for (const r of regs) m.set(r._hash, r);
  const todos = [...m.values()];
  for (let i = 0; i < todos.length; i += LOTE) {
    const p = todos.slice(i, i + LOTE); const c = (f) => p.map((x) => x[f]);
    await q(`insert into folha_servidores_amaam
      (cod_ibge,municipio,uf,entidade,competencia,secretaria,vinculo,matricula,nome,cargo,data_admissao,cpf,pis,
       dependentes,bruto,descontos,liquido,rubricas,arquivo,_hash)
      select * from unnest($1::text[],$2::text[],$3::text[],$4::text[],$5::text[],$6::text[],$7::text[],$8::text[],
        $9::text[],$10::text[],$11::text[],$12::text[],$13::text[],$14::int[],$15::numeric[],$16::numeric[],
        $17::numeric[],$18::jsonb[],$19::text[],$20::text[])
      -- 🚨 o mesmo servidor aparece em MAIS DE UM arquivo do mês (a folha da secretaria e a "FOLHA DE FERIAS"/
      -- "COMPLEMENTAR"). Somar infla a cada reprocessamento; deixar o último sobrescrever faria a folha de férias
      -- apagar o salário cheio. Fica o MAIOR bruto — conservador e idempotente.
      on conflict (_hash) do update set
        bruto = greatest(coalesce(folha_servidores_amaam.bruto, 0), coalesce(excluded.bruto, 0)),
        descontos = case when coalesce(excluded.bruto,0) >= coalesce(folha_servidores_amaam.bruto,0)
                         then excluded.descontos else folha_servidores_amaam.descontos end,
        liquido = case when coalesce(excluded.bruto,0) >= coalesce(folha_servidores_amaam.bruto,0)
                       then excluded.liquido else folha_servidores_amaam.liquido end,
        rubricas = case when coalesce(excluded.bruto,0) >= coalesce(folha_servidores_amaam.bruto,0)
                        then excluded.rubricas else folha_servidores_amaam.rubricas end,
        _coletado_em = now()`,
      [c("cod_ibge"), c("municipio"), c("uf"), c("entidade"), c("competencia"), c("secretaria"), c("vinculo"),
       c("matricula"), c("nome"), c("cargo"), c("data_admissao"), c("cpf"), c("pis"), c("dependentes"),
       c("bruto"), c("descontos"), c("liquido"), c("rubricas"), c("arquivo"), c("_hash")]);
  }
}

let totalGeral = 0;
for (let i = 0; i < fila.length; i++) {
  const a = fila[i];
  const marca = (situacao, detalhe, comp = null, arqs = 0, servs = 0) =>
    q(`insert into folha_amaam_coleta (cod_ibge,slug,municipio,competencia,arquivos,servidores,situacao,detalhe,em)
       values ($1,$2,$3,$4,$5,$6,$7,$8,now())
       on conflict (cod_ibge) do update set competencia=excluded.competencia, arquivos=excluded.arquivos,
         servidores=excluded.servidores, situacao=excluded.situacao, detalhe=excluded.detalhe, em=now()`,
      [a.cod_ibge, a.slug, a.municipio, comp, arqs, servs, situacao, detalhe]);
  try {
    const nav = sessao();
    const REF = `${B}/p/${a.slug}/t/servidores-publicos`;
    const pg = await nav(REF);
    if (pg.st !== 200) { await marca("erro", `página HTTP ${pg.st || pg.erro}`); console.log(`  ✖ [${i + 1}/${fila.length}] ${a.municipio}: HTTP ${pg.st}`); continue; }
    const token = (pg.t.match(/_token:\s*"([^"]+)"/) || [])[1];
    if (!token) { await marca("erro", "sem _token na página"); continue; }
    const lista = async (p) => {
      const body = new URLSearchParams({ path: decodeURIComponent(p), _token: token });
      const r = await nav(`${B}/get-files-list`, { method: "POST", body: body.toString(), timeout: 120000,
        headers: { "content-type": "application/x-www-form-urlencoded", "x-requested-with": "XMLHttpRequest", referer: REF } });
      try { return Object.values(JSON.parse(r.t).data || {}); } catch { return []; }
    };

    // 🚨 COMPETÊNCIA MAIS CHEIA, não a mais recente: o mês corrente costuma ter só parte das secretarias
    // publicadas ([[pnigp-competencia-mais-cheia-nao-a-recente]]). Aqui "cheia" = mês com MAIS ARQUIVOS.
    // 🚨 A folha nem sempre está no tema "Folha de Pagamento": em Benjamin Constant a lista nominal com valor é
    // o **"Quadro Atual de Servidores"** (2.491 pessoas), um tema irmão. Filtrar só por "folha de pagamento"
    // deixava o município em zero com o dado publicado ao lado. Aceita os temas irmãos, com a folha na frente.
    const TEMA_FOLHA = /folha de pagamento/i;
    const TEMA_IRMAO = /quadro atual|remunera|nominal|cargos e sal/i;
    const nos = arvore(pg.t)
      .filter((n) => TEMA_FOLHA.test(n.tema || "") || TEMA_IRMAO.test(n.tema || ""))
      .map((n) => ({ ...n, rank: TEMA_FOLHA.test(n.tema || "") ? 0 : 1 }));
    const anos = [...new Set(nos.map((n) => n.ano))].sort().reverse().filter((x) => !ANO || x === ANO);
    // ⚠️ não parar nos 2 anos mais recentes: Apuí tem "publica" no menu mas a última folha é de 2023 — o
    // município ficava "vazio" por causa da janela, não por falta de dado. Recua até 5 anos.
    let candidatos = [];
    for (const ano of anos.slice(0, 5)) {
      const meses = nos.filter((n) => n.ano === ano).sort((x, y) => y.mes.localeCompare(x.mes));
      for (const m of meses) {
        const arqs = await lista(m.path);
        if (arqs.length) candidatos.push({ ano, mes: m.mes, arqs, rank: m.rank, tema: m.tema });
        await dorme(120);
      }
      // 🚨 NÃO parar no primeiro ano com arquivo: o mês CHEIO pode estar no ano anterior (Alvarães tem 2 arquivos
      // por mês em 2026 e 14 num mês de 2025 — parar em 2026 derrubou a coleta de 451 para 29). Varre 3 anos e
      // só então escolhe.
      if (candidatos.length && anos.indexOf(ano) >= 2) break;
    }
    if (!candidatos.length) { await marca("vazio", `sem arquivo de folha em ${anos.slice(0, 5).join("/")}`); console.log(`  · [${i + 1}/${fila.length}] ${a.municipio}: sem arquivo`); continue; }
    // 🚨 UM mês só não basta: em Benjamin Constant o mês com mais arquivos trazia um documento que não é folha,
    // e o município saía "0 servidores" com o "Quadro Atual de Servidores" (2.491 pessoas) a um mês de distância.
    // Mantém a preferência pela competência mais cheia, mas tenta os 3 melhores até render.
    // 🚨 Reservar vaga para o TEMA IRMÃO: em Benjamin Constant a folha nominal está no "Quadro Atual de
    // Servidores" (4.954 pessoas), e ordenar só por rank empurrava esse nó para fora dos candidatos quando o
    // tema "Folha de Pagamento" tinha muitos meses. Top 3 do tema principal + top 2 dos irmãos.
    const ord = (a, b) => b.arqs.length - a.arqs.length || b.mes.localeCompare(a.mes);
    const principais = candidatos.filter((c) => c.rank === 0).sort(ord).slice(0, 3);
    const irmaos = candidatos.filter((c) => c.rank === 1).sort(ord).slice(0, 2);
    candidatos = [...principais, ...irmaos];

    // 🚨 nem todo arquivo do mês é a folha: há "Resumo Contábil", "DECLARAÇÃO ESTAGIÁRIOS", "13º". Se houver
    // algum com cara de folha NOMINAL, usa só esses — senão o coletor lê um resumo e conclui "0 servidores".
    const NOMINAL = /(folha|fopag|remunera|anal[íi]tica|nominal|servidor|pagamento|quadro)/i;
    const LIXO = /(resumo|declara|estagi|13º|decimo terceiro|rescis)/i;
    let regs = [], lidos = 0, falhos = 0, escolhidos = [], comp = `${candidatos[0].ano}${candidatos[0].mes}`;
    for (const cand of candidatos) {
      const bons = cand.arqs.filter((x) => NOMINAL.test(x.arquivo) && !LIXO.test(x.arquivo));
      const arquivos = bons.length ? bons : cand.arqs;
      const compCand = `${cand.ano}${cand.mes}`;
      const achados = [];
      const filaArq = [...arquivos];
      let li = 0, fa = 0;
      await Promise.all(Array.from({ length: CONC }, async () => {
        while (filaArq.length) {
          const arq = filaArq.shift();
          try {
            const d = await nav(`${B}/download/pdf/${arq.downloadto}`, { bin: true, timeout: 300000, headers: { referer: REF } });
            if (d.st !== 200 || d.buf.length < 2000) { fa++; continue; }
            const pdf = await getDocumentProxy(new Uint8Array(d.buf), { useSystemFonts: false });
            const { text } = await extractText(pdf, { mergePages: true });
            if (process.env.DEBUG === "1") console.log(`     [dbg] ${arq.arquivo}: ${d.buf.length}B → ${text.length} chars`);
            const { competencia, regs: rs } = parsePdfTexto(text);
            for (const r of rs) achados.push({
              ...r, cod_ibge: a.cod_ibge, municipio: a.municipio, uf: "AM", entidade: "PREFEITURA", arquivo: arq.arquivo,
              competencia: competencia || compCand,
              rubricas: JSON.stringify(r.rubricas || {}),
              _hash: crypto.createHash("md5").update([a.cod_ibge, competencia || compCand, r.matricula, r.nome, r.cargo, r.secretaria].join("¦")).digest("hex"),
            });
            li++;
          } catch (e) { fa++; if (process.env.DEBUG === "1") console.log(`     [dbg] falhou ${arq.arquivo}: ${String(e.message).slice(0, 80)}`); }
        }
      }));
      if (process.env.DEBUG === "1") console.log(`     [dbg] candidato ${compCand} tema="${cand.tema}" arquivos=${arquivos.length} → ${achados.length} servidores`);
      if (achados.length > regs.length) { regs = achados; lidos = li; falhos = fa; escolhidos = arquivos; comp = compCand; }
      // 🚨 corte baixo demais aceitava o candidato pior: Alvarães caiu de 451 para 29 porque um mês magro
      // passava dos 30 e o laço parava antes de ver o mês cheio. Só encerra quando já é uma folha de verdade.
      if (regs.length >= 300) break;
      // 🚨 contagem ridícula é FALSO POSITIVO do parser sobre um resumo (Tefé saiu com "5 servidores"),
      // não município minúsculo — continua tentando os outros candidatos antes de aceitar.
    }
    if (!regs.length) { await marca("vazio", `${escolhidos.length || candidatos[0].arqs.length} arquivos, nenhum servidor extraído`, comp, candidatos[0].arqs.length); console.log(`  ✖ [${i + 1}/${fila.length}] ${a.municipio}: ${candidatos.length} meses tentados, 0 servidores`); continue; }
    await grava(regs);
    totalGeral += regs.length;
    const suspeito = regs.length < 10;
    await marca(suspeito ? "parcial" : (falhos ? "parcial" : "ok"),
      suspeito ? `só ${regs.length} servidores — provável falso positivo do parser` : (falhos ? `${falhos} arquivos ilegíveis` : null),
      comp, escolhidos.length, regs.length);
    const secs = new Set(regs.map((r) => r.secretaria)).size;
    console.log(`  ✔ [${i + 1}/${fila.length}] ${a.municipio}: ${regs.length} servidores · ${comp} · ${lidos}/${escolhidos.length} PDFs · ${secs} unidades · ${regs.filter((r) => r.bruto > 0).length} com valor`);
    await dorme(800);
  } catch (e) {
    await marca("erro", String(e?.cause?.message || e.message).slice(0, 200));
    console.log(`  ✖ [${i + 1}/${fila.length}] ${a.municipio}: ${String(e.message).slice(0, 90)}`);
  }
}
console.log(`\n[amaam] ${totalGeral.toLocaleString("pt-BR")} servidores gravados`);
await db.end();
