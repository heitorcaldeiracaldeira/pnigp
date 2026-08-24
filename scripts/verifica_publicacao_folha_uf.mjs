// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
// verifica_publicacao_folha_uf.mjs — vai ao SITE DE CADA MUNICÍPIO e verifica a publicação da folha na fonte.
//
// POR QUE existe: o que temos até aqui é o que os AGREGADORES entregam (AAM, Diretório Digital, ANC, Betha). Isso
// responde "o coletor trouxe?", não responde "o município publica?". São perguntas diferentes: município pode
// publicar no site próprio e não estar no agregador, e pode estar no agregador com um arquivo que não é folha.
// A verificação vale por portal, um a um ([[feedback-verificar-por-portal]]), e a prova é a página aberta.
//
// O caminho é o do diagnóstico profundo ([[pnigp-diagnostico-profundo-menu-dados-produto]]):
//   1. o SITE responde?            → senão: site_fora_do_ar / dominio_parqueado
//   2. tem MENU de transparência?  → senão: site_sem_transparencia
//   3. o menu tem PESSOAL/folha?   → senão: portal_sem_modulo_de_pessoal
//   4. a página de pessoal tem DADO (linhas/arquivos) ou é casca/SPA? → publica_* / spa_sem_dado / menu_sem_dado
//
// 🚨 UA de navegador é obrigatório: três portais do ES devolviam 403 para o UA do PNIGP e pareciam "fora do ar".
//
// Uso: UF=AM node scripts/verifica_publicacao_folha_uf.mjs   ·   MUN="Tapauá,Manaquiri" para um recorte
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
import { pool, withRetry } from "./_cadprev.mjs";
import { SG_UF, COD_UF } from "./_uf.mjs";
import { identifica } from "./_erp_assinaturas.mjs";
import { criaUniaoFolha } from "./_folha_uniao.mjs";

const db = pool();
const q = withRetry(db);
const CONC = +(process.env.CONC || 6);
const MUN = process.env.MUN ? process.env.MUN.split(",").map((s) => s.trim()) : null;

const UA = {
  "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36",
  accept: "text/html,application/xhtml+xml,*/*;q=0.8", "accept-language": "pt-BR,pt;q=0.9",
};
const dec = (b) => { const u = b.toString("utf8"); return /�/.test(u.slice(0, 4000)) ? b.toString("latin1") : u; };
const pega = async (u, ms = 25000) => {
  for (const tent of [0, 1]) {
    try {
      const r = await fetch(u, { headers: UA, redirect: "follow", signal: AbortSignal.timeout(ms) });
      const b = Buffer.from(await r.arrayBuffer());
      return { st: r.status, url: r.url, t: dec(b), n: b.length };
    } catch (e) {
      if (tent) return { st: 0, url: u, t: "", n: 0, erro: String(e?.cause?.message || e.message).slice(0, 45) };
      await new Promise((s) => setTimeout(s, 1200));
    }
  }
};
const semTag = (h) => h.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ")
  .replace(/<[^>]+>/g, " ").replace(/&nbsp;/gi, " ").replace(/\s+/g, " ").trim();
const chave = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
// 🚨 o teto do conteúdo do <a> tem que ser GENEROSO: em Manaquiri o item de menu embute um ícone SVG com máscara
// CSS e passa de 300 caracteres — com teto de 120 o regex não fechava, o link da AAM sumia e o município saía
// como "site_sem_transparencia" com o portal linkado no próprio menu. Rótulo vazio (ícone) cai no title/href.
const links = (html, base) => [...html.matchAll(/<a\s[^>]*href=["']([^"']+)["'][^>]*>([\s\S]{0,900}?)<\/a>/gi)]
  .map((m) => { let h; try { h = new URL(m[1].replace(/&amp;/g, "&"), base).href; } catch { return null; }
    const t = semTag(m[2]) || (m[0].match(/(?:title|aria-label)=["']([^"']+)/i) || [])[1] || "";
    return { href: h, txt: t }; }).filter(Boolean);
// último recurso quando o menu é montado por JS: colher toda URL do HTML cru (sem rótulo, mas com o destino)
const urlsCruas = (html) => [...new Set([...html.matchAll(/https?:\/\/[^\s"'<>)\\]+/g)].map((m) => m[0]))];
const RE_PLATAFORMA = /transparenciamunicipalaam|diretoriodigital|space-dd1|transparencia-am|ancweb|betha\.cloud|portaldatransparencia|portaltp|fiorilli|elotech|atende\.net|govbr\.cloud|memory\.com\.br|instarmob|adianti|publicsoft|nucleogov|megasoft/i;

const RE_TRANSP = /transpar[êe]ncia|portal da transp|acesso [àa] informa/i;
const RE_PESSOAL = /(folha de pagamento|folha|servidor|pessoal|remunera|sal[áa]rio|quadro (de )?(funcional|pessoal|servidor)|recursos humanos)/i;
// 🚨 "pessoal" casa com "dados pessoais/LGPD" e "folha" com "folha de rosto": esses NÃO são a folha.
const RE_FALSO = /lgpd|dados pessoais|prote[çc][ãa]o de dados|folha de rosto|folha de estilo|contracheque do servidor logado|acesso restrito/i;
const RE_VALOR = /r\$\s?\d|\d{1,3}(\.\d{3})*,\d{2}/;
const RE_ARQ_FOLHA = /folpag|folha|remunera|nominal|sal[áa]rio|servidor|fopag|pessoal|quadro|mapa|holerite/i;
const RE_SPA = /<div\s+id=["'](root|app|__next)["']|ng-app|<app-root/i;

// 🚨 o Radar traz `url_portal` com UM ESPAÇO em branco em vez de nulo, e traz linha de município HOMÔNIMO de
// outra UF (Japurá/AM vinha com japura.pr.gov.br). Filtrar por btrim<>'' e casar o domínio com a UF do alvo.
const alvos = (await q(`select m.cod_ibge, m.nome municipio,
    max(nullif(btrim(r.site), '')) filter (where btrim(r.site) not in ('-','')) site,
    max(nullif(btrim(r.url_portal), '')) filter (where btrim(r.url_portal) not in ('-','')) url_portal
  from municipios_br m left join radar_portal r on r.cod_ibge = m.cod_ibge and r.unidade_gestora ilike 'Prefeitura%'
  where m.uf = $1 ${MUN ? "and m.nome = any($2)" : ""}
  group by 1,2 order by 2`, MUN ? [SG_UF, MUN] : [SG_UF])).rows;
console.log(`[${SG_UF}] verificando a publicação no site de ${alvos.length} municípios (conc=${CONC})`);

await q(`create table if not exists folha_verificacao_site (
  cod_ibge text primary key, municipio text, uf text, site text, site_status int,
  url_transparencia text, url_pessoal text, rotulo_pessoal text, erp text, plataforma text,
  -- o veredito do RASTREADOR fica guardado a parte: a reconciliacao sobrescreve a coluna veredito, e sem esta
  -- aqui o estado anterior se perde. Quando a coleta some (parser corrigido, fatia apagada), da para VOLTAR --
  -- sem ela Manaquiri e Tapaua continuariam publica_por_consulta com zero linha no banco, a nosso favor.
  veredito_site text,
  publica boolean, tem_valor boolean, spa boolean, linhas int, arquivos int,
  veredito text, evidencia text, em timestamptz default now())`);

// 🚨 URL de município HOMÔNIMO de outra UF (o Radar deu japura.pr.gov.br para Japurá/AM): descarta.
// (Postgres não tem lookahead, então o descarte é aqui e não no SQL.)
// 🚨 rede social NÃO é site da prefeitura: o Radar guarda o Instagram no campo `site` de Careiro, e o município
// saía como "site sem transparência" com base num perfil do Instagram.
const RE_SOCIAL = /instagram\.com|facebook\.com|fb\.com|twitter\.com|x\.com|youtube\.com|linktr\.ee|wa\.me/i;
// 🚨 soft-404: borba.am.gov.br responde 200 e redireciona para /404.html — HTTP 200 não prova nada
// ([[pnigp-sonda-soft404-falso-positivo]]). O destino final é que conta, não o status.
const RE_SOFT404 = /\/404(\.html?|\.php)?$|\/(erro|error|not-?found)(\.html?)?$/i;
const soft404 = (r) => {
  if (!r || !r.url) return false;
  try { if (RE_SOFT404.test(new URL(r.url).pathname)) return true; } catch {}
  if (RE_SOCIAL.test(r.url)) return true;
  return /p[áa]gina n[ãa]o (foi )?encontrada|404 not found|erro 404/i.test(semTag(r.t || "").slice(0, 1200));
};
const url = (u) => {
  if (!u || RE_SOCIAL.test(u)) return null;
  const x = /^https?:\/\//i.test(u) ? u : "https://" + u.replace(/^\/+/, "");
  const m = x.match(/\.([a-z]{2})\.gov\.br/i);
  if (m && m[1].toLowerCase() !== SG_UF.toLowerCase()) return null;
  return x;
};

async function verifica(a) {
  const k = chave(a.municipio);
  const uf = SG_UF.toLowerCase();
  // 🚨 HTTP puro não é opcional: Ipixuna só responde em http (o https dá timeout) e sairia como "fora do ar".
  const https = [url(a.url_portal), url(a.site), `https://${k}.${uf}.gov.br/`, `https://www.${k}.${uf}.gov.br/`,
    `https://pm${k}.${uf}.gov.br/`, `https://prefeitura.${k}.${uf}.gov.br/`, `https://prefeiturade${k}.com.br/`,
    `https://transparencia.${k}.${uf}.gov.br/`].filter(Boolean);
  const cands = [...new Set([...https, ...https.map((u) => u.replace(/^https:/, "http:"))])];

  // ── 1. o site responde? ───────────────────────────────────────────────────────────────────────────────────────
  let home = null, ultimoErro = null;
  for (const c of cands) {
    const r = await pega(c);
    if (r.st === 200 && r.n > 1200 && !soft404(r)) { home = r; break; }
    // 🚨 guardar TAMBÉM o fracasso com st=0 (DNS/timeout): sem isso a evidência saía "HTTP 0" em vez do motivo,
    // e "fora do ar" sem motivo não serve nem para re-sondar nem para o pedido por LAI.
    ultimoErro = r.erro || `HTTP ${r.st}`;
    if (!home && r.st) home = r;
  }
  const base = { cod_ibge: a.cod_ibge, municipio: a.municipio, uf: SG_UF, site: home?.url || cands[0],
    site_status: home?.st || 0, url_transparencia: null, url_pessoal: null, rotulo_pessoal: null, erp: null,
    plataforma: null,
    publica: false, tem_valor: false, spa: false, linhas: 0, arquivos: 0 };
  if (!home || home.st !== 200 || home.n < 1200 || soft404(home)) {
    const parqueado = /hostgator|hospedagem|dom[íi]nio (est[áa] )?(dispon[íi]vel|[àa] venda)|registro\.br|parking/i.test(home?.t || "");
    return { ...base, veredito: parqueado ? "dominio_parqueado" : "site_fora_do_ar",
      evidencia: parqueado ? "o domínio devolve página de venda de hospedagem, não o site da prefeitura"
        : `nenhuma das ${cands.length} URLs candidatas respondeu — última: ${ultimoErro || "HTTP " + (home?.st || 0)} (${cands.slice(0, 3).map((c) => c.replace(/^https?:\/\//, "")).join(", ")})` };
  }

  // ── 2. tem transparência? ─────────────────────────────────────────────────────────────────────────────────────
  const lh = links(home.t, home.url);
  base.erp = identifica(home.t)?.erp || null;
  base.plataforma = (urlsCruas(home.t).find((u) => RE_PLATAFORMA.test(u)) || "").slice(0, 180) || null;
  let transp = lh.filter((l) => RE_TRANSP.test(l.txt) || RE_TRANSP.test(l.href))
    .sort((x, y) => (RE_TRANSP.test(x.txt) ? 0 : 1) - (RE_TRANSP.test(y.txt) ? 0 : 1));
  // menu montado por JS: o <a> não existe no HTML, mas a URL do portal está lá em algum atributo ou script
  if (!transp.length) transp = urlsCruas(home.t).filter((u) => /transpar/i.test(u) || RE_PLATAFORMA.test(u))
    .map((u) => ({ href: u, txt: "" }));

  // 🚨 quando o município delega a um AGREGADOR (AAM, Diretório Digital, ANC...), o link do agregador é o portal
  // de verdade — um "/transparencia" institucional do próprio site costuma ser só a página que aponta para lá.
  transp.sort((x, y) => (RE_PLATAFORMA.test(y.href) ? 1 : 0) - (RE_PLATAFORMA.test(x.href) ? 1 : 0));

  // a folha às vezes está linkada já na home (portais pequenos) — não exigir passar pela transparência
  let paginas = [{ ...home, de: "home" }];
  let transpFalhou = null;
  if (transp.length) {
    base.url_transparencia = transp[0].href;
    const t = await pega(transp[0].href, 45000);
    if (t.st === 200 && t.n > 800) { paginas.push({ ...t, de: "transparencia" }); base.erp ||= identifica(t.t)?.erp || null; }
    else transpFalhou = t.erro || `HTTP ${t.st}`;
  }

  // ── 3. o menu tem pessoal/folha? ──────────────────────────────────────────────────────────────────────────────
  // 🚨 "Portal do Servidor"/"Contracheque" é LOGIN do funcionário, não publicação — 19 municípios do AM saíram
  // como "menu sem dado" porque o link de login venceu o de folha. Ranqueia: folha/remuneração > relação nominal
  // > servidores > RH/pessoal > login. E tenta mais de um candidato antes de concluir ausência.
  const nota = (l) => { const s = `${l.txt} ${l.href}`;
    if (/contracheque|holerite|portal do servidor|login|autoatend/i.test(s)) return 0;
    if (/folha de pagamento|folha_?de_?pagamento|remunera|sal[áa]rio|fopag/i.test(s)) return 5;
    if (/rela[çc][ãa]o nominal|quadro (de )?(servidor|pessoal|funcional)|nominal/i.test(s)) return 4;
    if (/servidor/i.test(s)) return 3;
    if (/recursos humanos|pessoal/i.test(s)) return 2;
    return 1; };
  let candPessoal = [];
  for (const p of paginas.slice().reverse()) {                 // a página de transparência vale mais que a home
    const cand = links(p.t, p.url)
      .filter((l) => (RE_PESSOAL.test(l.txt) || RE_PESSOAL.test(l.href)) && !RE_FALSO.test(`${l.txt} ${l.href}`))
      .sort((x, y) => nota(y) - nota(x));
    if (cand.length) { candPessoal = cand; break; }
  }
  const alvo = candPessoal[0] || null;
  if (!alvo) {
    // 🚨 agregador fora do ar não é "não publica": é indisponibilidade do dia. Fica marcado para re-sondar, e não
    // vira veredito de ausência de publicação ([[pnigp-ordem-retorno-resondar-corrigir-criar]]).
    if (transpFalhou && RE_PLATAFORMA.test(base.url_transparencia || ""))
      return { ...base, veredito: "portal_agregador_indisponivel",
        evidencia: `o site delega a ${base.url_transparencia}, que hoje devolve ${transpFalhou} — re-sondar` };
    const spa = RE_SPA.test(home.t) && lh.length < 8;
    return { ...base, spa, veredito: spa ? "spa_sem_menu" : (base.url_transparencia ? "portal_sem_modulo_de_pessoal" : "site_sem_transparencia"),
      evidencia: spa ? "a home é um SPA: o menu não existe no HTML servido"
        : base.url_transparencia ? `portal de transparência em ${base.url_transparencia}, sem item de pessoal entre ${lh.length} links`
        : `nenhum link de transparência entre ${lh.length} links da home${base.plataforma ? ` (mas o HTML aponta ${base.plataforma})` : ""}` };
  }
  base.url_pessoal = alvo.href; base.rotulo_pessoal = alvo.txt.slice(0, 80);

  // ── 4. a página de pessoal tem DADO? ──────────────────────────────────────────────────────────────────────────
  // tenta os 3 melhores: o primeiro pode ser uma casca e o segundo a lista de verdade
  let pg = null, usado = alvo;
  for (const c of candPessoal.slice(0, 3)) {
    const r = await pega(c.href, 35000);
    if (r.st !== 200 || r.n < 600) { pg ||= r; continue; }
    const temDado = (r.t.match(/<tr[\s>]/gi) || []).length > 5 || /\.(pdf|xlsx?|csv|ods)(\?|")/i.test(r.t);
    if (temDado) { pg = r; usado = c; break; }
    pg ||= r;
  }
  if (!pg || pg.st !== 200 || pg.n < 600) {
    return { ...base, veredito: "pagina_de_pessoal_quebrada",
      evidencia: `"${base.rotulo_pessoal}" → ${alvo.href} devolve ${pg?.erro || "HTTP " + (pg?.st || 0)}` };
  }
  base.url_pessoal = usado.href; base.rotulo_pessoal = (usado.txt || "").slice(0, 80) || base.rotulo_pessoal;
  base.erp ||= identifica(pg.t)?.erp || null;
  base.linhas = (pg.t.match(/<tr[\s>]/gi) || []).length;
  const arqs = links(pg.t, pg.url).filter((l) => /\.(pdf|xlsx?|csv|ods|zip)(\?|$)/i.test(l.href));
  base.arquivos = arqs.length;
  base.tem_valor = RE_VALOR.test(semTag(pg.t));
  base.spa = RE_SPA.test(pg.t) && base.linhas < 3 && !base.arquivos;
  const texto = semTag(pg.t);

  if (base.spa) return { ...base, veredito: "spa_sem_dado",
    evidencia: `"${base.rotulo_pessoal}" abre um SPA: o HTML servido não tem tabela nem arquivo ([[pnigp-spa-nao-e-obstaculo-e-nao-publicacao]])` };
  if (nota(usado) === 0 && !base.arquivos && base.linhas <= 5)
    return { ...base, veredito: "so_login_do_servidor",
      evidencia: `o único item de pessoal do menu é "${base.rotulo_pessoal}" — autoatendimento do funcionário, não publicação` };
  // 🚨 arquivo publicado NÃO é folha publicada: Tabatinga lista "CARTA-DE-SERVICO.pdf", Manaus lista a política
  // de privacidade e Urucará lista o PPA. Só conta como publicação da folha se o NOME do arquivo (ou o rótulo do
  // menu) disser folha — senão vira "menu com anexo que não é folha", que é o que o município de fato tem.
  const folhaMesmo = arqs.filter((x) => RE_ARQ_FOLHA.test(decodeURIComponent(x.href.split("/").pop() || "")));
  // ⚠️ o rótulo NÃO salva o menu: Manaus rotula "Tabela Remuneratória" e anexa política de privacidade e
  // estrutura organizacional — tabela de cargos não é folha nominal. Exige nome de arquivo com cara de folha.
  if (base.arquivos && !folhaMesmo.length && !/folha de pagamento|rela[çc][ãa]o nominal/i.test(base.rotulo_pessoal || ""))
    return { ...base, veredito: "anexos_que_nao_sao_folha",
      evidencia: `"${base.rotulo_pessoal}" lista ${base.arquivos} arquivo(s), nenhum de folha: ${arqs.slice(0, 3).map((x) => decodeURIComponent(x.href.split("/").pop()).slice(0, 44)).join(" · ")}` };
  if (base.arquivos) return { ...base, publica: true, veredito: "publica_arquivos",
    evidencia: `"${base.rotulo_pessoal}" lista ${base.arquivos} arquivo(s), ${folhaMesmo.length} com nome de folha: ${(folhaMesmo.length ? folhaMesmo : arqs).slice(0, 3).map((x) => decodeURIComponent(x.href.split("/").pop()).slice(0, 48)).join(" · ")}` };
  if (base.linhas > 5) return { ...base, publica: true, veredito: base.tem_valor ? "publica_tabela_com_valor" : "publica_tabela_sem_valor",
    evidencia: `"${base.rotulo_pessoal}" traz tabela de ${base.linhas} linhas${base.tem_valor ? " COM valor em R$" : " SEM valor (nominal apenas)"}` };
  // 🚨 "menu sem dado" junta dois casos MUITO diferentes: página publicada e VAZIA (Autazes: o WordPress da
  // Perseus tem a página "Servidores" com 7,5 KB de casca e conteúdo em branco — 24 páginas no site, nenhuma de
  // folha) e site que só ESPELHA um agregador. O pedido por LAI muda conforme o caso, então o veredito separa.
  if (base.plataforma && texto.length < 4000)
    return { ...base, veredito: "publica_via_agregador",
      evidencia: `o site não hospeda a folha: delega a ${base.plataforma} (item "${base.rotulo_pessoal}")` };
  if (texto.length < 900)
    return { ...base, veredito: "pagina_de_pessoal_vazia",
      evidencia: `"${base.rotulo_pessoal}" existe no menu e abre uma página VAZIA (${texto.length} caracteres de texto, sem tabela e sem arquivo)` };
  return { ...base, veredito: "menu_sem_dado",
    evidencia: `"${base.rotulo_pessoal}" abre uma página de ${texto.length} caracteres, sem tabela e sem arquivo` };
}

const fila = [...alvos]; const saidas = [];
await Promise.all(Array.from({ length: CONC }, async () => {
  while (fila.length) {
    const a = fila.shift();
    let r; try { r = await verifica(a); } catch (e) {
      r = { cod_ibge: a.cod_ibge, municipio: a.municipio, uf: SG_UF, site: a.site, site_status: 0, publica: false,
        tem_valor: false, spa: false, linhas: 0, arquivos: 0, veredito: "erro_na_verificacao", evidencia: String(e.message).slice(0, 120) };
    }
    saidas.push(r);
    await q(`insert into folha_verificacao_site (cod_ibge,municipio,uf,site,site_status,url_transparencia,url_pessoal,
        rotulo_pessoal,erp,plataforma,publica,tem_valor,spa,linhas,arquivos,veredito,veredito_site,evidencia,em)
      values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$16,$17,now())
      on conflict (cod_ibge) do update set site=excluded.site, site_status=excluded.site_status,
        url_transparencia=excluded.url_transparencia, url_pessoal=excluded.url_pessoal,
        rotulo_pessoal=excluded.rotulo_pessoal, erp=excluded.erp, plataforma=excluded.plataforma, publica=excluded.publica,
        tem_valor=excluded.tem_valor, spa=excluded.spa, linhas=excluded.linhas, arquivos=excluded.arquivos,
        veredito=excluded.veredito, veredito_site=excluded.veredito_site,
        evidencia=excluded.evidencia, em=now()`,
      [r.cod_ibge, r.municipio, r.uf, r.site, r.site_status, r.url_transparencia, r.url_pessoal, r.rotulo_pessoal,
       r.erp, r.plataforma || null, r.publica, r.tem_valor, r.spa, r.linhas, r.arquivos, r.veredito, r.evidencia]);
    console.log(`  ${(r.publica ? "✔" : "·")} ${r.municipio.padEnd(26)} ${r.veredito.padEnd(30)} ${(r.rotulo_pessoal || "").slice(0, 40)}`);
  }
}));

// -- 5. reconciliacao: A PROVA E A COLETA -----------------------------------------------------------------------
// 🚨 O rastreador só enxerga a folha que está a UM LINK de distância. Em portal de CONSULTA — PortalTP, o
// TransparenciaWeb do ES, o SCPI de Maués — a folha só aparece depois de um formulário, e o município apareceria
// como "anexos que não são folha" com 3.000 servidores já coletados dele. Onde a coleta trouxe linha COM VALOR,
// o portal publica: isso é medição, não suposição ([[pnigp-sonda-folha-prova-e-a-coleta]]).
// 🚨 a união é construída AQUI, não herdada de outro script: a view antiga (`vw_folha_es`) era criada pelo
// relatório com a UF da última execução, e reconciliar o ES contra as linhas do AM devolvia zero em silêncio.
const { nome: VW } = await criaUniaoFolha(q, COD_UF, SG_UF);
await q(`update folha_verificacao_site set veredito = coalesce(veredito_site, veredito),
   publica = veredito_site in ('publica_arquivos','publica_tabela_com_valor','publica_tabela_sem_valor')
   where uf = $1 and veredito_site is not null`, [SG_UF]);
const reconc = (await q(`update folha_verificacao_site v
  set veredito = case
        -- 🚨 site MORTO com folha coletada não é "publica por consulta": o dado vem do AGREGADOR, e essas são
        -- duas afirmações diferentes. Anori, Japurá, Lábrea, Tapauá e São Gabriel da Cachoeira não têm site no
        -- ar — a folha deles existe porque a AAM/ANC/Diretório Digital publica, não porque a prefeitura publica.
        when coalesce(v.veredito_site, v.veredito) in ('site_fora_do_ar','dominio_parqueado','site_sem_transparencia')
          then 'sem_site_proprio_dado_vem_do_agregador'
        else 'publica_por_consulta_no_portal' end,
      publica = true,
      evidencia = case
        when coalesce(v.veredito_site, v.veredito) in ('site_fora_do_ar','dominio_parqueado','site_sem_transparencia')
          then 'O site do município não entrega a folha (' || v.veredito || '), mas o dado EXISTE e foi coletado: '
            || to_char(c.n, 'FM999G999') || ' servidores com remuneração na fonte "' || c.fonte
            || '". Quem publica é o agregador, não a prefeitura. (rastreio: ' || coalesce(v.veredito_site, v.veredito) || ')'
        else 'O rastreador não alcança a folha por link — o portal só a entrega depois de uma consulta. A prova de que publica é a COLETA: '
            || to_char(c.n, 'FM999G999') || ' servidores com remuneração já extraídos da fonte "' || c.fonte
            || '". Situação anterior do rastreio: ' || coalesce(v.veredito_site, v.veredito) || '.' end
  from (select f.cod_ibge, f.fonte, count(*) n from ${VW} f where f.valor > 0 group by 1,2) c
  where c.cod_ibge = v.cod_ibge and v.uf = $1 and not v.publica
    and c.n = (select max(z.n2) from (select count(*) n2 from ${VW} f2
               where f2.cod_ibge = v.cod_ibge and f2.valor > 0 group by f2.fonte) z)
  returning v.municipio`, [SG_UF])).rows;
if (reconc.length) console.log(`[${SG_UF}] ${reconc.length} municipios reclassificados como "publica por consulta" pela prova da coleta`);

console.log(`\n═══ ${SG_UF}: o que os sites publicam ═══`);
console.table((await q(`select veredito, count(*) n, string_agg(municipio, ', ' order by municipio) municipios
  from folha_verificacao_site where uf=$1 group by 1 order by 2 desc`, [SG_UF])).rows);
// o cruzamento que importa: publica no site e NÃO temos coletado
console.table((await q(`select v.municipio, v.veredito, v.erp, v.url_pessoal
  from folha_verificacao_site v
  where v.uf=$1 and v.publica
    and not exists (select 1 from ${VW} f where f.cod_ibge = v.cod_ibge and f.valor > 0)
  order by 1`, [SG_UF])).rows);
await db.end();
