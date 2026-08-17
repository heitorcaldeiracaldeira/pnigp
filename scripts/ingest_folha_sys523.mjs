// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
// ingest_folha_sys523.mjs — folha nominal COM salário do bloco `sys523` (CECAM e rótulos irmãos).
//
// O bloco foi achado na sonda dos 497 do RS ([[pnigp-sys523-cecam-bloco-rs]]): 12 municípios servindo
// `https://{host-do-municipio}:{porta}/sys523/publico/remuneracao.xhtml`. A assinatura é o CAMINHO, não o
// domínio — cada município hospeda no próprio host (`sistema.`, `portal.`, `transparencia.`) e em porta alta
// variável (8181, 8282, 8283, 8383, 8484). Por isso nenhuma sonda por subdomínio de fornecedor os enxerga.
//
// A tela entrega os campos do pedido de uma vez: Nome · Função (cargo) · LOTAÇÃO (secretaria) · Regime Jurídico ·
// Admissão · Rescisão · Total de Proventos.
//
// MECANISMO: JSF/PrimeFaces. O GET inicial já traz a 1ª página e o `javax.faces.ViewState`; a paginação é um POST
// AJAX (`javax.faces.partial.ajax=true`, `form1:tbl_first/_rows`), com JSESSIONID. 100 linhas por requisição.
//
// 🚨 IDs DO JSF NÃO PODEM VIRAR CONSTANTE. `form1:j_idt129_input` é o mês em Campinas do Sul e pode ser outro
// número no município seguinte — fixar o id do primeiro portal é a causa nº 4 das sete de
// [[pnigp-coletor-ok-sem-dado-sete-causas]]. Aqui cada campo é achado pelo CONTEÚDO das opções (meses, anos,
// "PREFEITURA") e o dataTable pelo sufixo `_data`.
//
// 🚨 Certificado inválido em porta alta faz o Node devolver `fetch failed` genérico, com cara de host morto
// ([[pnigp-tenosoft-equiplano-crackeados]]) — daí o NODE_TLS_REJECT_UNAUTHORIZED=0 no lançamento.
//
// Uso: UF=RS node scripts/ingest_folha_sys523.mjs
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
import crypto from "crypto";
import { pool, withRetry } from "./_cadprev.mjs";

const db = pool();
const q = withRetry(db);
const UF = process.env.UF || null;
const SO = process.env.SO || null;
const UA = { "user-agent": "Mozilla/5.0 (compatible; PNIGP/1.0; pesquisa de dados publicos)" };

await q(`create table if not exists folha_servidores_sys523 (
  cod_ibge text, municipio text, uf text, entidade text, competencia text,
  nome text, cargo text, lotacao text, regime text, admissao text, rescisao text,
  provento numeric,
  _hash text primary key, _coletado_em timestamptz default now()
)`);
await q(`create index if not exists ix_folha_sys523_mun on folha_servidores_sys523 (cod_ibge, competencia)`);
await q(`create table if not exists folha_sys523_coleta (
  cod_ibge text primary key, municipio text, uf text, url text, competencia text,
  linhas int, situacao text, detalhe text, em timestamptz default now()
)`);

// ── alvos: qualquer município cujo portal conhecido contenha /sys523/ ──────────────────────────────────────────
// ⭐ sonda + candidatos achados lendo o site oficial (filtros de UF/SO FORA do union)
const alvos = (await q(`
  select * from (
    select s.cod_ibge, s.municipio, s.uf, coalesce(s.url_pessoal, s.url_base) url
      from folha_sonda_municipal s
     where (s.url_pessoal ~ 'sys523' or s.url_base ~ 'sys523')
     union
    select c.cod_ibge, c.municipio, c.uf, c.url
      from folha_portal_candidato c where c.produto = 'sys523'
  ) x
   where true ${UF ? "and uf = $1" : ""} ${SO ? `and municipio ilike '%'||$${UF ? 2 : 1}||'%'` : ""}
   order by municipio`, [UF, SO].filter(Boolean))).rows;
// REFAZ=1 reprocessa quem já está ok (usar quando a REGRA mudou — ex.: o hash ganhou um campo)
const REFAZ = process.env.REFAZ === "1";
const feitos = new Set(REFAZ ? [] : (await q(`select cod_ibge from folha_sys523_coleta where situacao='ok'`)).rows.map((r) => r.cod_ibge));
const fila = alvos.filter((a) => !feitos.has(a.cod_ibge));
console.log(`[sys523] ${alvos.length} portais · ${feitos.size} já feitos · ${fila.length} na fila`);

// dinheiro "R$ 1.712,15" → 1712.15. Ponto é MILHAR aqui; tratá-lo como decimal já inflou uma folha em 100×
// ([[pnigp-portaltp-epublica-folha]]).
const money = (s) => {
  const m = String(s ?? "").replace(/[R$\s ]/g, "");
  if (!m) return null;
  const n = +m.replace(/\./g, "").replace(",", ".");
  return Number.isFinite(n) ? n : null;
};
const limpo = (s) => { const v = String(s ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim(); return v || null; };

// acha um <select> pelo CONTEÚDO das opções e devolve {name, selecionado}
function achaSelect(html, testeOpcoes) {
  for (const m of html.matchAll(/<select[^>]*name="([^"]+)"[^>]*>([\s\S]{0,3000}?)<\/select>/gi)) {
    const ops = [...m[2].matchAll(/<option[^>]*value="([^"]*)"([^>]*)>([\s\S]{0,60}?)<\/option>/gi)]
      .map((o) => ({ valor: o[1], sel: /selected/i.test(o[2]), texto: limpo(o[3]) }));
    if (ops.length && testeOpcoes(ops)) return { name: m[1], ops, selecionado: (ops.find((o) => o.sel) || ops[0]) };
  }
  return null;
}

const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

function extraiLinhas(html) {
  return [...html.matchAll(/<tr[^>]*data-ri="\d+"[\s\S]*?<\/tr>/gi)].map((m) => {
    const cel = [...m[0].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((c) => limpo(c[1]));
    // [0] é o toggler da linha (vazio); a última é o menu "Imprimir"
    return { nome: cel[1], cargo: cel[2], lotacao: cel[3], regime: cel[4],
             admissao: cel[5], rescisao: cel[6], provento: money(cel[7]) };
  }).filter((r) => r.nome);
}

let totalGeral = 0, ok = 0, falhas = 0;
for (let i = 0; i < fila.length; i++) {
  const a = fila[i];
  const marca = (situacao, detalhe, competencia = null, linhas = 0) =>
    q(`insert into folha_sys523_coleta (cod_ibge,municipio,uf,url,competencia,linhas,situacao,detalhe,em)
       values ($1,$2,$3,$4,$5,$6,$7,$8,now())
       on conflict (cod_ibge) do update set url=excluded.url, competencia=excluded.competencia,
         linhas=excluded.linhas, situacao=excluded.situacao, detalhe=excluded.detalhe, em=now()`,
      [a.cod_ibge, a.municipio, a.uf, a.url, competencia, linhas, situacao, detalhe]);
  try {
    // ⚠️ nem todo município aponta para a MESMA tela do produto: Carlos Gomes está cadastrado em
    // `/sys523/publico/rhumanos.xhtml` ("Recursos Humanos"), que não tem o dataTable da folha. A folha vive em
    // `remuneracao.xhtml` no mesmo diretório — tentar a irmã antes de declarar "sem tela".
    // 🚨 o nome da tela pode ter HÍFEN (`perguntas-frequentes.xhtml`, `diarias-servidor.xhtml`): sem o `-` na
    // classe, a substituição não acontecia e o município fechava "nenhuma candidata trouxe o dataTable" — que
    // parece portal sem folha e é só a URL de origem apontando para outra página do mesmo portal (Ponte Preta).
    // Também vale tentar a raiz do diretório, para quando a URL cadastrada não é .xhtml nenhum.
    // 🚨🚨 A TELA DE FOLHA VEM PRIMEIRO, e a candidata tem de ser VALIDADA pelo cabeçalho. A URL cadastrada
    // costuma ser outra página do mesmo portal (`licitacoes.xhtml`, `perguntas-frequentes.xhtml`) — e essas
    // TAMBÉM têm `ui-datatable-data`. O coletor parava na primeira que tinha dataTable e lia o total de
    // LICITAÇÕES: Marcelino Ramos fechava "total declarado 22" (licitações) com 284 servidores publicados ao
    // lado, Maximiliano "2" e Barão de Cotegipe "0". Aceitar só a tabela cujo cabeçalho fale de servidor.
    const dir = a.url.replace(/\/[^/]*$/, "");
    const candidatas = [`${dir}/remuneracao.xhtml`, a.url,
                        a.url.replace(/\/[a-z-]+\.xhtml(\?.*)?$/i, "/remuneracao.xhtml")];
    let r1, html, cookie, vs, urlUsada;
    for (const cand of [...new Set(candidatas)]) {
      r1 = await fetch(cand, { redirect: "follow", signal: AbortSignal.timeout(60000), headers: UA });
      if (!r1.ok) continue;
      html = await r1.text();
      if (!/ui-datatable-data/.test(html)) continue;
      // a tela certa declara o cabeçalho da folha; licitações/contratos não têm "Nome do Servidor"
      if (!/nome do servidor|nome_servidor|servidor/i.test(html) || !/proventos|remunera|sal[áa]rio|l[íi]quido/i.test(html)) continue;
      cookie = (r1.headers.getSetCookie?.() || []).map((c) => c.split(";")[0]).join("; ");
      vs = (html.match(/name="javax\.faces\.ViewState"[^>]*value="([^"]+)"/) || [])[1];
      urlUsada = cand;
      break;
    }
    if (!urlUsada) { await marca("sem_tela", "nenhuma candidata trouxe o dataTable da folha"); falhas++; continue; }
    a.url = urlUsada;
    // o id do dataTable sai do próprio HTML (o tbody `..._data` com a classe do PrimeFaces), nunca fixado.
    // 🚨 E a página tem MAIS DE UMA tabela: pegar a primeira levava o coletor a paginar a tabela errada e voltar
    // zero linha com um total declarado que era de outra grade (Marcelino Ramos "declarado 22", Maximiliano "2").
    // Escolher a que tem cabeçalho de FOLHA — Nome + Cargo/Remuneração — olhando o HTML que antecede o tbody.
    const tabelas = [...html.matchAll(/id="([^"]+)_data"\s+class="[^"]*ui-datatable-data/g)];
    let tbl = null;
    for (const m of tabelas) {
      const antes = html.slice(Math.max(0, m.index - 4000), m.index);
      if (/nome/i.test(antes) && /(remunera|cargo|sal[áa]rio|l[íi]quido)/i.test(antes)) { tbl = m[1]; break; }
    }
    if (!tbl && tabelas.length) tbl = tabelas[0][1];   // sem cabeçalho reconhecível, mantém o comportamento antigo
    if (!vs || !tbl) { await marca("sem_tela", "sem ViewState ou dataTable"); falhas++; continue; }

    // competência e entidade lidas pelo CONTEÚDO, nunca pelo id
    const selMes = achaSelect(html, (o) => o.length === 12 && MESES.includes((o[0].texto || "").toLowerCase()));
    const selAno = achaSelect(html, (o) => o.length > 2 && /^20\d\d$/.test(o[0].texto || ""));
    const selEnt = achaSelect(html, (o) => o.some((x) => /PREFEITURA|MUNIC[ÍI]PIO/i.test(x.texto || "")));
    const mes = selMes ? String(MESES.indexOf(selMes.selecionado.texto.toLowerCase()) + 1).padStart(2, "0") : null;
    const competencia = mes && selAno ? `${selAno.selecionado.texto}${mes}` : null;
    const entidade = selEnt?.selecionado?.texto || null;

    const total = +((html.match(/Registros:\s*[\d.]+\s*-\s*[\d.]+\s*\/\s*([\d.]+)/) || [])[1] || "0").replace(/\./g, "");
    const regs = [];
    for (let first = 0; first === 0 || first < total; first += 100) {
      const corpo = new URLSearchParams({
        "javax.faces.partial.ajax": "true", "javax.faces.source": tbl,
        "javax.faces.partial.execute": tbl, "javax.faces.partial.render": tbl,
        [tbl]: tbl, [`${tbl}_pagination`]: "true", [`${tbl}_first`]: String(first),
        [`${tbl}_rows`]: "100", [`${tbl}_encodeFeature`]: "true",
        form1: "form1", "javax.faces.ViewState": vs,
      });
      const r2 = await fetch(a.url, { method: "POST", body: corpo, redirect: "follow",
        signal: AbortSignal.timeout(90000),
        headers: { ...UA, "content-type": "application/x-www-form-urlencoded; charset=UTF-8",
                   "faces-request": "partial/ajax", "x-requested-with": "XMLHttpRequest", cookie } });
      const t = await r2.text();
      const linhas = extraiLinhas(t);
      if (!linhas.length) break;
      for (const l of linhas) {
        // 🚨 ADMISSÃO E RESCISÃO ENTRAM NO HASH: em Canela dois pares de linhas eram idênticos em
        // nome+cargo+lotação+valor — duplo vínculo da mesma pessoa, que sem um discriminador COLAPSA na gravação
        // e some da folha (o mesmo que aconteceu em BH, [[pnigp-capitais-ckan-e-a-porta]]). A data de admissão
        // é o discriminador natural e é estável entre execuções, ao contrário do índice da linha.
        const _hash = crypto.createHash("md5")
          .update([a.cod_ibge, competencia, entidade, l.nome, l.cargo, l.lotacao, l.provento,
                   l.admissao, l.rescisao].join("|")).digest("hex");
        regs.push({ ...l, _hash, cod_ibge: a.cod_ibge, municipio: a.municipio, uf: a.uf, entidade, competencia });
      }
      if (linhas.length < 100) break;
    }
    if (!regs.length) { await marca("vazio", `total declarado ${total}`, competencia); falhas++; continue; }

    const porHash = new Map(regs.map((x) => [x._hash, x]));
    const p = [...porHash.values()];
    // no REFAZ o hash pode ter mudado de regra: sem apagar a versão antiga DESTE município nesta competência,
    // as duas coexistiriam e a folha sairia dobrada. Delete explícito por cod_ibge + competência — nunca amplo.
    if (REFAZ && competencia) {
      await q(`delete from folha_servidores_sys523 where cod_ibge = $1 and competencia = $2`,
        [a.cod_ibge, competencia]);
    }
    const c = (f) => p.map((x) => x[f]);
    await q(`insert into folha_servidores_sys523
      (cod_ibge,municipio,uf,entidade,competencia,nome,cargo,lotacao,regime,admissao,rescisao,provento,_hash)
      select * from unnest($1::text[],$2::text[],$3::text[],$4::text[],$5::text[],$6::text[],$7::text[],
        $8::text[],$9::text[],$10::text[],$11::text[],$12::numeric[],$13::text[])
      on conflict (_hash) do update set provento=excluded.provento, _coletado_em=now()`,
      [c("cod_ibge"), c("municipio"), c("uf"), c("entidade"), c("competencia"), c("nome"), c("cargo"),
       c("lotacao"), c("regime"), c("admissao"), c("rescisao"), c("provento"), c("_hash")]);

    await marca("ok", null, competencia, p.length);
    totalGeral += p.length; ok++;
    console.log(`  [${i + 1}/${fila.length}] ${a.municipio}: ${p.length} servidores · ${competencia} · declarado ${total}`);
  } catch (e) {
    falhas++;
    await marca("erro", String(e.message).slice(0, 150));
    console.log(`  ✖ [${i + 1}/${fila.length}] ${a.municipio}: ${String(e.message).slice(0, 80)}`);
  }
}
console.log(`\n[sys523] ${totalGeral.toLocaleString("pt-BR")} servidores · ${ok} portais ok · ${falhas} falhas`);
await db.end();
