// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
// ingest_folha_algov.mjs — folha nominal COM SALÁRIO dos portais `transparencia.{slug}.al.gov.br` (Alagoas).
//
// ⭐ Achado em 19/ago/2026 procurando municípios NOVOS: Dois Riachos aparecia no diagnóstico como "tem_dados" sem
// produto identificado. A lista `/servidores` mostra Matrícula · Nome · Cargo · Lotação · Admissão e **não tem
// valor** — o que faria o município cair na regra "nome sem valor não é folha". Mas o botão **Detalhes** abre
// `/servidores/{id}?competencia=M_AAAA` com "Remuneração Atual → Salário Bruto R$ …". O valor existe, um clique
// abaixo ([[pnigp-lista-sem-valor-nao-e-folha]] vale para a FONTE, não para a primeira tela que eu abro).
//
// O host é DERIVÁVEL do slug, como no Top Solutions do RN ([[pnigp-topsolutions-host-derivavel]]) — a varredura
// dos 70 municípios de AL sem folha achou 3 com esta variante (Dois Riachos, Jacaré dos Homens, Taquarana).
//
// O contrato (HTTP puro, sem navegador):
//   GET /servidores?competencia=M_AAAA&page=N   → 15 links `/servidores/{id}?competencia=…` por página
//   GET /servidores/{id}?competencia=M_AAAA     → Nome, Matrícula, CPF mascarado, Admissão, Cargo, Lotação,
//                                                 Órgão e **Salário Bruto**
// 🚨 UMA REQUISIÇÃO POR SERVIDOR. Vale para município pequeno (Dois Riachos: 26 páginas ≈ 390 pessoas). Arapiraca
//    tem 735 páginas (~14.700) na variante `ano/mes/entidade` — fica FORA deste coletor de propósito, para não
//    disparar 15 mil requisições sem decisão explícita.
//
// Uso: node scripts/ingest_folha_algov.mjs        · SO=<município> · REFAZ=1 · MAX_PAGINAS=60
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
import crypto from "node:crypto";
import { pool, withRetry } from "./_cadprev.mjs";

const db = pool(); const q = withRetry(db);
const SO = process.env.SO || null;
const REFAZ = process.env.REFAZ === "1";
const MAX_PAGINAS = Number(process.env.MAX_PAGINAS || 60);
const PAUSA = Number(process.env.PAUSA || 150);
const H = { "user-agent": "Mozilla/5.0 (compatible; PNIGP/1.0; pesquisa de dados publicos)" };
const dorme = (ms) => new Promise((r) => setTimeout(r, ms));
const chave = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "");
const limpa = (s) => { const t = String(s ?? "").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim(); return t || null; };
const dinheiro = (s) => { if (!s) return null; const t = String(s).replace(/[^\d,.-]/g, "").replace(/\./g, "").replace(",", "."); const n = Number(t); return Number.isFinite(n) ? n : null; };

await q(`create table if not exists folha_servidores_algov (
  cod_ibge text, municipio text, uf text default 'AL', competencia text,
  matricula text, nome text, cargo text, lotacao text, orgao text, admissao text,
  bruto numeric, url text,
  _hash text primary key, _coletado_em timestamptz default now())`);
await q(`create index if not exists ix_folha_algov_mun on folha_servidores_algov (cod_ibge)`);
await q(`create table if not exists folha_algov_coleta (
  cod_ibge text primary key, municipio text, uf text, base_url text, competencia text,
  linhas int, situacao text, detalhe text, em timestamptz default now())`);

// 🚨 O MESMO SERVIDOR VEM DUAS VEZES em parte dos portais (mesma matrícula, nome e bruto) e o Postgres recusa o
//    lote inteiro com "ON CONFLICT DO UPDATE command cannot affect row a second time" — 3 municípios de AL
//    morreram assim com a folha inteira em mãos. Deduplicar pelo `_hash` ANTES de gravar.
function porHash(regs) {
  const m = new Map();
  for (const r of regs) {
    const h = crypto.createHash("sha1").update([r.cod_ibge, r.competencia, r.matricula, r.nome, r.bruto].join("|")).digest("hex");
    if (!m.has(h)) m.set(h, { ...r, _hash: h });
  }
  return [...m.values()];
}

async function pega(url) {
  const r = await fetch(url, { headers: H, redirect: "follow", signal: AbortSignal.timeout(45000) });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.text();
}

// competências que o portal oferece, da mais recente para trás
function competencias(html) {
  const m = html.match(/<select[^>]*name="competencia"[\s\S]*?<\/select>/i);
  if (!m) return [];
  return [...m[0].matchAll(/value="(\d+_\d{4})"/g)].map((x) => x[1]);
}

function idsDaPagina(html) {
  return [...new Set([...html.matchAll(/\/servidores\/(\d+)\?competencia=/g)].map((m) => m[1]))];
}

// o detalhe é uma sequência "<rótulo> … <valor>"; pega pelo rótulo, não por posição
function campo(html, rotulo) {
  const re = new RegExp(rotulo + "\\s*<\\/[^>]+>([\\s\\S]{0,400}?)<\\/(?:div|dd|span|p|td)>", "i");
  const m = html.match(re);
  if (!m) return null;
  return limpa(m[1]);
}

const alvos = (await q(`select m.cod_ibge, m.nome municipio from municipios_br m
  where m.uf='AL' ${SO ? "and m.nome ilike '%'||$1||'%'" : ""} order by m.nome`, SO ? [SO] : [])).rows;
const feitos = REFAZ ? new Set() : new Set((await q(`select cod_ibge from folha_algov_coleta where situacao in ('ok','sem_tabela_nominal')`)).rows.map((r) => r.cod_ibge));
const fila = alvos.filter((a) => !feitos.has(a.cod_ibge));
console.log(`[algov] ${fila.length} municípios de AL na fila`);

let ok = 0, total = 0;
for (let i = 0; i < fila.length; i++) {
  const a = fila[i];
  const base = `https://transparencia.${chave(a.municipio)}.al.gov.br`;
  const marca = (situacao, detalhe, linhas = 0, comp = null) =>
    q(`insert into folha_algov_coleta (cod_ibge,municipio,uf,base_url,competencia,linhas,situacao,detalhe,em)
       values ($1,$2,'AL',$3,$4,$5,$6,$7,now()) on conflict (cod_ibge) do update set base_url=excluded.base_url,
       competencia=excluded.competencia, linhas=excluded.linhas, situacao=excluded.situacao,
       detalhe=excluded.detalhe, em=now()`, [a.cod_ibge, a.municipio, base, comp, linhas, situacao, detalhe]);
  // ⚠️ `/servidores` redireciona para `/servidores/` em parte dos portais e o fetch tropeça no 301 — tentar as
  //    duas formas antes de desistir (Taquarana estava sendo perdida por isso, e é a MELHOR variante de todas).
  let raiz = null;
  for (const cam of ["/servidores/", "/servidores"]) {
    try { raiz = await pega(base + cam); break; } catch { /* tenta a próxima */ }
  }
  if (!raiz) continue;                                  // host não existe: nem registra, não é alvo deste produto
  // 🚨 ORDEM IMPORTA: testar o rótulo "Matrícula" ANTES do endpoint descartava municípios que TÊM o DataTables
  //    e escrevem o cabeçalho de outro jeito — Coité do Nóia, Delmiro Gouveia, Pariconha e São Miguel dos Campos
  //    saíram como "sem tabela nominal" tendo folha completa. O sinal do produto é o `tables.php`, não a palavra.
  if (!/tables\.php/i.test(raiz) && !/Matr[íi]cula|MATRICULA/i.test(raiz)) {
    await marca("sem_tabela_nominal", "responde mas a lista não é nominal (outra variante do portal)");
    continue;
  }

  // ⭐⭐ VARIANTE DATATABLES (Taquarana): a tabela `#sample_2` vem com <thead> e NADA de <tbody> — o corpo chega
  //    por `POST /servidores/tables.php` (DataTables server-side). Procurar <td> no HTML devolve zero e o
  //    município parece vazio; a chamada certa entrega TUDO de uma vez (`length=2000` → 1.982 servidores).
  //    Colunas: matrícula · nome · CPF · cargo · lotação · BRUTO · descontos · líquido — valor na LISTA,
  //    sem uma requisição por pessoa.
  if (/tables\.php/i.test(raiz)) {
    try {
      const corpo = (start, length) => {
        const q2 = new URLSearchParams();
        q2.set("draw", "1");
        for (let i = 0; i < 8; i++) {
          q2.set(`columns[${i}][data]`, String(i)); q2.set(`columns[${i}][name]`, "");
          q2.set(`columns[${i}][searchable]`, "true"); q2.set(`columns[${i}][orderable]`, "true");
          q2.set(`columns[${i}][search][value]`, ""); q2.set(`columns[${i}][search][regex]`, "false");
        }
        q2.set("order[0][column]", "0"); q2.set("order[0][dir]", "asc");
        q2.set("start", String(start)); q2.set("length", String(length));
        q2.set("search[value]", ""); q2.set("search[regex]", "false");
        return q2.toString();
      };
      const post = async (start, length) => {
        const r = await fetch(`${base}/servidores/tables.php`, { method: "POST", signal: AbortSignal.timeout(90000),
          headers: { ...H, "content-type": "application/x-www-form-urlencoded; charset=UTF-8",
            "x-requested-with": "XMLHttpRequest", referer: `${base}/servidores/` }, body: corpo(start, length) });
        if (!r.ok) throw new Error(`tables.php HTTP ${r.status}`);
        return r.json();
      };
      // 🚨 AS COLUNAS MUDAM DE PORTAL PARA PORTAL: Taquarana tem MATRICULA·NOME·CPF·CARGO·ORGÃO·BRUTO·DESC·LÍQ
      //    (8) e Pariconha tem NOME·CPF·CARGO·VÍNCULO·ORGÃO·BRUTO·LÍQUIDO (7), começando pelo NOME. Ler por
      //    POSIÇÃO gravou nome no campo matrícula e zero salário em 3 municípios que têm a folha inteira.
      //    O cabeçalho da tabela é quem diz onde cada coisa está.
      const th = [...raiz.matchAll(/<th[^>]*>([\s\S]*?)<\/th>/gi)].map((m) => (limpa(m[1]) || "").toUpperCase());
      const acha = (re) => th.findIndex((t) => re.test(t));
      const iNome = acha(/^NOME/), iMat = acha(/MATR/), iCargo = acha(/CARGO/),
            iOrg = acha(/[ÓO]RG[ÃA]O|LOTA/), iBruto = acha(/BRUTO/), iLiq = acha(/L[ÍI]QUIDO/);
      if (iNome < 0 && iMat < 0) throw new Error(`cabeçalho não reconhecido: ${th.slice(0, 8).join("/")}`);
      const cabeca = await post(0, 1);
      const total0 = Number(cabeca.recordsFiltered || 0);
      const regs = [];
      for (let ini = 0; ini < total0; ini += 2000) {
        const j = await post(ini, 2000);
        for (const l of (j.data || [])) {
          if (!l || !l.length) continue;
          const g = (i) => (i >= 0 && i < l.length ? limpa(l[i]) : null);
          const nome = g(iNome) || g(iMat);
          if (!nome) continue;
          regs.push({ cod_ibge: a.cod_ibge, municipio: a.municipio, competencia: null,
            matricula: iMat >= 0 ? g(iMat) : null, nome, cargo: g(iCargo), lotacao: g(iOrg), orgao: g(iOrg),
            admissao: null, bruto: dinheiro(g(iBruto)) ?? dinheiro(g(iLiq)), url: `${base}/servidores/` });
        }
        if (!(j.data || []).length) break;
        await dorme(PAUSA);
      }
      if (regs.length) {
        const unicos = porHash(regs);
        for (let k = 0; k < unicos.length; k += 500) {
          const parte = unicos.slice(k, k + 500); const N = 13;
          const vals = parte.map((_, j) => `(${Array.from({ length: N }, (_, c) => `$${j * N + c + 1}`).join(",")})`).join(",");
          await q(`insert into folha_servidores_algov
            (cod_ibge,municipio,uf,competencia,matricula,nome,cargo,lotacao,orgao,admissao,bruto,url,_hash)
            values ${vals} on conflict (_hash) do update set bruto=excluded.bruto, _coletado_em=now()`,
            parte.flatMap((r) => [r.cod_ibge, r.municipio, "AL", r.competencia, r.matricula, r.nome, r.cargo,
              r.lotacao, r.orgao, r.admissao, r.bruto, r.url,
              r._hash]));
        }
        const comValor = regs.filter((r) => r.bruto > 0).length;
        await marca("ok", `datatables: ${comValor} de ${regs.length} com salário`, regs.length, null);
        ok++; total += regs.length;
        console.log(`  ⭐ ${a.municipio.padEnd(24)} ${String(regs.length).padStart(5)} servidores · ${comValor} com salário · (datatables)`);
        continue;
      }
    } catch (e) { await marca("erro", `datatables: ${String(e.message).slice(0, 90)}`); continue; }
  }

  // ⭐ VARIANTE COM VALOR NA PRÓPRIA LISTA: MATRICULA · NOME · CPF · CARGO · ORGÃO · BRUTO · DESCONTOS · LÍQUIDO
  //    já renderizados em <td> — uma requisição por PÁGINA em vez de uma por SERVIDOR.
  if (/>\s*BRUTO\s*</i.test(raiz) && /L[ÍI]QUIDO/i.test(raiz)) {
    try {
      const regs = [];
      for (let pg = 1; pg <= MAX_PAGINAS; pg++) {
        const h = pg === 1 ? raiz : await pega(`${base}/servidores/?page=${pg}`);
        const linhas = [...h.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)]
          .map((m) => [...m[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((c) => limpa(c[1])))
          .filter((c) => c.length >= 8 && c[1]);
        if (!linhas.length) break;
        const antes = regs.length;
        for (const c of linhas) {
          if (regs.some((r) => r.matricula === c[0] && r.nome === c[1])) continue;
          regs.push({ cod_ibge: a.cod_ibge, municipio: a.municipio, competencia: null, matricula: c[0],
            nome: c[1], cargo: c[3], lotacao: c[4], orgao: c[4], admissao: null,
            bruto: dinheiro(c[5]), url: `${base}/servidores/?page=${pg}` });
        }
        if (regs.length === antes) break;               // página repetida: fim da lista
        await dorme(PAUSA);
      }
      if (regs.length) {
        const unicos = porHash(regs);
        for (let k = 0; k < unicos.length; k += 500) {
          const parte = unicos.slice(k, k + 500); const N = 13;
          const vals = parte.map((_, j) => `(${Array.from({ length: N }, (_, c) => `$${j * N + c + 1}`).join(",")})`).join(",");
          await q(`insert into folha_servidores_algov
            (cod_ibge,municipio,uf,competencia,matricula,nome,cargo,lotacao,orgao,admissao,bruto,url,_hash)
            values ${vals} on conflict (_hash) do update set bruto=excluded.bruto, _coletado_em=now()`,
            parte.flatMap((r) => [r.cod_ibge, r.municipio, "AL", r.competencia, r.matricula, r.nome, r.cargo,
              r.lotacao, r.orgao, r.admissao, r.bruto, r.url,
              r._hash]));
        }
        const comValor = regs.filter((r) => r.bruto > 0).length;
        await marca("ok", `lista com valor: ${comValor} de ${regs.length} com salário`, regs.length, null);
        ok++; total += regs.length;
        console.log(`  ⭐ ${a.municipio.padEnd(24)} ${String(regs.length).padStart(5)} servidores · ${comValor} com salário · (valor na lista)`);
        continue;
      }
    } catch (e) { await marca("erro", `variante lista-com-valor: ${String(e.message).slice(0, 90)}`); continue; }
  }
  if (!/Detalhes/i.test(raiz)) {
    await marca("sem_tabela_nominal", "lista nominal sem valor e sem botão Detalhes");
    continue;
  }
  try {
    // ⭐ competência MAIS CHEIA: mede pelo nº de páginas de cada uma das 3 mais recentes
    // 🚨 QUANDO SE FILTRA POR COMPETÊNCIA, O PORTAL PARA DE DESENHAR OS LINKS DE PÁGINA — mas `&page=N` continua
    //    funcionando. Confiar no maior `page=` do HTML devolvia UMA página (15 pessoas) e o município saía
    //    "coletado" com 4% da folha. Pagina-se até vir vazio ([[pnigp-coletor-ok-sem-dado-sete-causas]]).
    const comps = competencias(raiz).filter(Boolean);
    const varre = async (c) => {
      const ids = new Set();
      for (let pg = 1; pg <= MAX_PAGINAS; pg++) {
        const h = await pega(`${base}/servidores?${c ? `competencia=${c}&` : ""}page=${pg}`);
        const novos = idsDaPagina(h).filter((x) => !ids.has(x));
        if (!novos.length) break;
        novos.forEach((x) => ids.add(x));
        await dorme(PAUSA);
      }
      return ids;
    };
    // ⭐ competência MAIS CHEIA entre as 2 mais recentes (cada uma custa ~26 requisições de lista, não mais)
    let melhor = null;
    for (const c of (comps.length ? comps.slice(0, 2) : [null])) {
      const ids = await varre(c);
      if (!ids.size) continue;
      if (!melhor || ids.size > melhor.ids.size) melhor = { comp: c, ids };
    }
    if (!melhor) { await marca("vazio", "nenhuma competência com servidor na lista"); continue; }
    const ids = melhor.ids;

    // 🚨 o VALOR só existe no detalhe: uma requisição por servidor
    const regs = [];
    for (const id of ids) {
      let h;
      try { h = await pega(`${base}/servidores/${id}?competencia=${melhor.comp}`); } catch { continue; }
      const bruto = dinheiro(campo(h, "Sal[áa]rio Bruto"));
      const nome = campo(h, "Nome");
      if (!nome) continue;
      const comp = (melhor.comp || "").split("_");
      regs.push({
        cod_ibge: a.cod_ibge, municipio: a.municipio, competencia: comp.length === 2 ? `${comp[1]}${String(comp[0]).padStart(2, "0")}` : null,
        matricula: campo(h, "Matr[íi]cula"), nome, cargo: campo(h, "Cargo"), lotacao: campo(h, "Lota[çc][ãa]o"),
        orgao: campo(h, "[ÓO]rg[ãa]o"), admissao: campo(h, "Data de Admiss[ãa]o"), bruto,
        url: `${base}/servidores/${id}?competencia=${melhor.comp}`,
      });
      await dorme(PAUSA);
    }
    if (!regs.length) { await marca("vazio", "lista tinha ids mas nenhum detalhe respondeu"); continue; }

    const unicos = porHash(regs);
    for (let k = 0; k < unicos.length; k += 500) {
      const parte = unicos.slice(k, k + 500);
      const N = 13;
      const vals = parte.map((_, j) => `(${Array.from({ length: N }, (_, c) => `$${j * N + c + 1}`).join(",")})`).join(",");
      await q(`insert into folha_servidores_algov
        (cod_ibge,municipio,uf,competencia,matricula,nome,cargo,lotacao,orgao,admissao,bruto,url,_hash)
        values ${vals} on conflict (_hash) do update set bruto=excluded.bruto, _coletado_em=now()`,
        parte.flatMap((r) => [r.cod_ibge, r.municipio, "AL", r.competencia, r.matricula, r.nome, r.cargo,
          r.lotacao, r.orgao, r.admissao, r.bruto, r.url,
          r._hash]));
    }
    const comValor = regs.filter((r) => r.bruto > 0).length;
    await marca("ok", `${comValor} de ${regs.length} com salário`, regs.length, regs[0].competencia);
    ok++; total += regs.length;
    console.log(`  ⭐ ${a.municipio.padEnd(24)} ${String(regs.length).padStart(5)} servidores · ${comValor} com salário · comp ${regs[0].competencia}`);
  } catch (e) {
    await marca("erro", String(e.message).slice(0, 120));
    console.log(`  ✖ ${a.municipio}: ${String(e.message).slice(0, 60)}`);
  }
}
console.log(`\n[algov] ${ok} municípios · ${total.toLocaleString("pt-BR")} servidores`);
await db.end();
