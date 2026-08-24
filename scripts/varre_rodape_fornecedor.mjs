// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
// varre_rodape_fornecedor.mjs — identifica o fornecedor do portal pelo RODAPÉ e pelos caminhos que ele serve.
//
// ⭐ Em Capivari do Sul (17/ago/2026) o Radar dizia govbr e o caminho `/PRONIMTB/` respondia — com "Missing
// Controller Error". O portal de verdade estava na RAIZ do mesmo host, e quem o denunciou foi o rodapé:
// "www.dbseller.com.br". Assinatura de fornecedor no rodapé vale mais que rótulo de cadastro
// ([[pnigp-plataforma-rotulo-vs-sistema]]).
//
// Uso: UF=RS node scripts/varre_rodape_fornecedor.mjs
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
import { pool, withRetry } from "./_cadprev.mjs";

const db = pool();
const q = withRetry(db);
const UF = process.env.UF || "RS";
const UA = { "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120 Safari/537.36" };
const so = (s) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");

// assinatura no HTML → produto com coletor pronto
const MARCAS = [
  [/dbseller/i, "dbseller"], [/multi24/i, "multi24"], [/cittaweb|cittatec|citta\b/i, "citta"],
  [/digifred/i, "digifred"], [/betha/i, "betha"], [/atende\.net|ipm sistemas/i, "ipm"],
  [/elotech/i, "elotech"], [/equiplano/i, "equiplano"], [/fiorilli|scpi/i, "scpi"],
  [/sinsoft/i, "sinsoft"],
  // 🚨 `abase` casava dentro de "fa-dat-ABASE" (o ícone Font Awesome `fa-database`): 36 municípios de MG entraram
  // como Abase só porque o site usa o ícone de banco de dados. Marca curta precisa de ÂNCORA — aqui, o domínio
  // do fornecedor ou a palavra isolada ([[pnigp-sonda-soft404-falso-positivo]]).
  [/abase\.com\.br|abase(?!ment)/i, "abase"],
  [/pronim|cidade360|govbr sistemas/i, "govbr"],
  [/rhsysportaltransp|admrh/i, "admrh"], [/tche inform|com\.tche/i, "tche"], [/sys523|cecam/i, "sys523"],
  [/publicsoft/i, "publicsoft"], [/memory inform/i, "memory"], [/megasoft/i, "megasoft"],
  // 🚨 `e-?p[uú]blica` casava dentro de "REPUBLICADO"/"Republicação" — palavras de todo edital municipal, e
  // marcaram 31 municípios de MG como PortalTP. Exigir o DOMÍNIO ou a forma com hífen e limite de palavra
  // ([[pnigp-assinatura-curta-falso-positivo]]).
  [/portaltp\.com\.br|portaltp|e-p[uú]blica/i, "portaltp"],
  [/hardsoft/i, "hardsoft"], [/thema/i, "thema"],
];

const tabs = (await q(`select table_name t from information_schema.tables where table_schema='public'
  and table_name like 'folha_servidores_%'`)).rows.map((r) => r.t);
const partes = [];
for (const t of tabs) {
  const c = (await q(`select 1 from information_schema.columns where table_name=$1 and column_name='cod_ibge'`, [t])).rowCount;
  if (c) partes.push(`select distinct left(cod_ibge::text,6) i from ${t} where cod_ibge is not null`);
}
const muns = (await q(`select cod_ibge, nome, uf from municipios_br
  where uf=$1 and left(cod_ibge,6) not in (${partes.join(" union ")}) order by nome`, [UF])).rows;
console.log(`[rodapé] ${muns.length} municípios ${UF} sem folha`);

async function leia(url) {
  try {
    const r = await fetch(url, { headers: UA, redirect: "follow", signal: AbortSignal.timeout(20000) });
    if (!r.ok) return null;
    const t = await r.text();
    return t.length > 500 ? t : null;
  } catch { return null; }
}

let achados = 0;
for (const m of muns) {
  const s = so(m.nome);
  // 🚨 a UF estava FIXA em `.rs.gov.br` — o script servia a um estado só. Vem do município, que é quem sabe.
  const d = `${s}.${m.uf.toLowerCase()}.gov.br`;
  const hosts = [`transparencia.${d}`, `www.${d}`, d, `portal.${d}`,
                 `transparencia.pm${s}.com.br`, `pm${s}.${m.uf.toLowerCase()}.gov.br`];
  const vistos = new Set();
  for (const h of hosts) {
    for (const esq of ["https", "http"]) {
      const html = await leia(`${esq}://${h}/`);
      if (!html) continue;
      const marca = MARCAS.find(([re]) => re.test(html));
      const chave = `${marca?.[1] || "?"}|${h}`;
      if (vistos.has(chave)) break;
      vistos.add(chave);
      if (!marca) { break; }
      // 🚨 O HOST DO MUNICÍPIO PODE SERVIR O PORTAL DO VIZINHO. `portal.montebelodosul.rs.gov.br/transparencia/`
      // devolve "Barra Funda/RS - Contas Públicas", com todos os links para `transparencia.barrafunda.rs.gov.br`.
      // Coletar dali gravaria a folha de Barra Funda com o nome de Monte Belo do Sul — contaminação que só a RAIS
      // denunciaria depois ([[pnigp-entidade-declarada-e-a-prova]]). O nome no título/corpo é a prova.
      const titulo = (html.match(/<title[^>]*>([^<]+)</i) || [])[1] || "";
      const declarado = `${titulo} ${html.slice(0, 4000)}`;
      const outro = (await q(`select nome from municipios_br where uf=$1 and nome <> $2
        and position(lower(nome) in lower($3)) > 0 order by length(nome) desc limit 1`, [m.uf, m.nome, declarado])).rows[0];
      if (outro && !new RegExp(m.nome.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i").test(declarado)) {
        console.log(`   ✖ ${m.nome.padEnd(24)} ${esq}://${h}/ declara "${outro.nome}" — contaminação, descartado`);
        break;
      }
      achados++;
      console.log(`⭐ ${m.nome.padEnd(24)} ${marca[1].padEnd(10)} ${esq}://${h}/`);
      await q(`insert into folha_portal_candidato (cod_ibge, municipio, uf, produto, url, achado_via, achado_em)
        values ($1,$2,$3,$4,$5,'rodapé do portal',now()) on conflict (cod_ibge, url) do nothing`,
        [m.cod_ibge, m.nome, m.uf, marca[1], `${esq}://${h}/`]);
      break;
    }
  }
  if (!vistos.size) console.log(`   · ${m.nome}: nenhum host respondeu`);
}
console.log(`\n[rodapé] ${achados} fornecedores identificados`);
await db.end();
