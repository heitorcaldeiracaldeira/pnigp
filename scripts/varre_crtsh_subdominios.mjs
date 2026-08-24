// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
// varre_crtsh_subdominios.mjs — acha o portal de folha pelo CERTIFICADO, não pelo site.
//
// ⭐ Achado em 17/ago/2026 em Candelária/RS. O site oficial apontava para `candelaria.atende.net`, que NÃO EXISTE
// mais (DNS morto); o Radar não tinha ERP; a varredura de host por moldes (`transparencia.`, `rh.`, `grp.`…) não
// acertou o nome. Mas o **Certificate Transparency** lista todo host que já recebeu certificado no domínio — e lá
// estava `portaltransparencia.candelaria.rs.gov.br`, servindo o ADMRH: 926 servidores, coletado = declarado.
//
// Por que funciona: o município pede certificado para CADA subdomínio que publica, e esses pedidos são registrados
// em log público e imutável. É a lista de hosts que o município realmente tem — inclusive os que nenhuma página
// linka. Onde o molde adivinha, o crt.sh ENUMERA ([[pnigp-varredura-host-porta-onpremise]]).
//
// 🚨 crt.sh devolve 502 com frequência: sem repetição, um município vira "sem subdomínio" quando na verdade a
// consulta é que falhou — o erro de sempre, tratar falha de rede como ausência de dado
// ([[pnigp-coletor-ok-sem-dado-sete-causas]]).
//
// Uso: UF=RS node scripts/varre_crtsh_subdominios.mjs
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
import { pool, withRetry } from "./_cadprev.mjs";

const db = pool();
const q = withRetry(db);
const UF = process.env.UF || "RS";
const SO = process.env.SO || null;
const UA = { "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120 Safari/537.36" };
const dorme = (ms) => new Promise((s) => setTimeout(s, ms));
const so = (s) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");

await q(`create table if not exists folha_crtsh_host (
  cod_ibge text, municipio text, uf text, host text, produto text, prova text,
  achado_em timestamptz default now(), primary key (cod_ibge, host)
)`);

// ── assinaturas: caminho que responde + como reconhecer que respondeu de verdade ──────────────────────────────
// a prova nunca é "HTTP 200": é o CONTEÚDO esperado daquele produto ([[pnigp-sonda-soft404-falso-positivo]])
const SONDAS = [
  { produto: "admrh", caminho: "/rhsysportaltransp/api/lov/referencia?busca=&page=1",
    prova: (t) => { try { const j = JSON.parse(t); const d = j.dados || j.data; return Array.isArray(d) && d.length ? `${d.length} competências` : null; } catch { return null; } } },
  { produto: "multi24", caminho: "/multi24/sistemas/transparencia/",
    prova: (t) => (/secao=servidores_salarios/i.test(t) ? "tem seção servidores_salarios" : null) },
  { produto: "sys523", caminho: "/remuneracao.xhtml",
    prova: (t) => (/nome do servidor|nome_servidor/i.test(t) && /proventos|remunera|l[íi]quido/i.test(t) ? "tela de remuneração" : null) },
  { produto: "govbr", caminho: "/PRONIMTB/",
    prova: (t) => (/pronim|cidade360|transpar/i.test(t) ? "PRONIM respondeu" : null) },
  { produto: "digifred", caminho: "/contas/relatorios/quadro_salario_servidores",
    prova: (t) => (/quadro de sal|servidor/i.test(t) ? "quadro de salários" : null) },
];

// nomes de host que valem sondar: os que soam a transparência, RH ou ERP
const RE_INTERESSE = /transparen|admrh|rhsys|\brh\b|folha|servidor|pessoal|portal|grp|sim|e-?gov|betha|ipm|atende|multi24|publico/i;
// 🚨 homologação NÃO é produção: `-hml` responde e pode devolver base de teste ou vazia — e um município
// carimbado por base de teste é pior que um município faltando
const RE_DESCARTA = /-hml\.|homolog|teste|hml-|\.hml\.|dev\./i;

const tabs = (await q(`select table_name t from information_schema.tables where table_schema='public'
  and table_name like 'folha_servidores_%'`)).rows.map((r) => r.t);
const partes = [];
for (const t of tabs) {
  const c = (await q(`select 1 from information_schema.columns where table_name=$1 and column_name='cod_ibge'`, [t])).rowCount;
  if (c) partes.push(`select distinct left(cod_ibge::text,6) i from ${t} where cod_ibge is not null`);
}
const muns = (await q(`select cod_ibge, nome, uf from municipios_br
  where uf=$1 and left(cod_ibge,6) not in (${partes.join(" union ")})
  ${SO ? "and nome ilike '%'||$2||'%'" : ""} order by nome`, [UF, SO].filter(Boolean))).rows;
console.log(`[crtsh] ${muns.length} municípios ${UF} sem folha`);

async function hostsDoDominio(dominio) {
  // 🚨 502 é a resposta mais comum do crt.sh sob carga — sem retry, o município some da varredura
  for (let t = 0; t < 4; t++) {
    try {
      const r = await fetch(`https://crt.sh/?q=%25.${dominio}&output=json`, { headers: UA, signal: AbortSignal.timeout(90000) });
      if (r.status === 502 || r.status === 503 || r.status === 429) { await dorme(4000 * (t + 1)); continue; }
      if (!r.ok) return null;
      const j = await r.json();
      return [...new Set(j.flatMap((x) => String(x.name_value || "").split("\n")))]
        .map((s) => s.trim().toLowerCase())
        .filter((s) => s && !s.startsWith("*.") && s.endsWith(dominio));
    } catch { await dorme(4000 * (t + 1)); }
  }
  return null; // null = NÃO SEI (consulta falhou); [] = sei que não há
}

async function sonda(host) {
  for (const s of SONDAS) {
    for (const esq of ["https", "http"]) {
      try {
        const r = await fetch(`${esq}://${host}${s.caminho}`, { headers: UA, redirect: "follow", signal: AbortSignal.timeout(15000) });
        if (!r.ok) continue;
        const p = s.prova(await r.text());
        // 🚨 devolver o CAMINHO junto, não só o host: gravar `https://host/` como candidato fez o coletor multi24
        // fechar "fetch failed" num portal que estava no ar — ele precisa da URL do MÓDULO, não da raiz
        // ([[pnigp-modulo-vs-host-fornecedor]]).
        if (p) return { produto: s.produto, url: `${esq}://${host}${s.caminho}`, prova: `${esq}://${host}${s.caminho} — ${p}` };
      } catch { /* próxima */ }
    }
  }
  return null;
}

let achados = 0, semConsulta = 0;
for (const m of muns) {
  const dominio = `${so(m.nome)}.${m.uf.toLowerCase()}.gov.br`;
  const hosts = await hostsDoDominio(dominio);
  if (hosts === null) { console.log(`   ? ${m.nome}: crt.sh não respondeu (não é prova de ausência)`); semConsulta++; continue; }
  const alvos = hosts.filter((h) => RE_INTERESSE.test(h) && !RE_DESCARTA.test(h));
  if (!alvos.length) { console.log(`   · ${m.nome}: ${hosts.length} hosts, nenhum de interesse`); continue; }
  let achou = false;
  for (const h of alvos) {
    const r = await sonda(h);
    if (!r) continue;
    achou = true; achados++;
    console.log(`⭐ ${m.nome.padEnd(24)} ${r.produto.padEnd(9)} ${r.prova}`);
    await q(`insert into folha_crtsh_host (cod_ibge, municipio, uf, host, produto, prova)
      values ($1,$2,$3,$4,$5,$6) on conflict (cod_ibge, host) do update set produto=excluded.produto,
        prova=excluded.prova, achado_em=now()`, [m.cod_ibge, m.nome, m.uf, h, r.produto, r.prova]);
    await q(`insert into folha_portal_candidato (cod_ibge, municipio, uf, produto, url, achado_via, achado_em)
      values ($1,$2,$3,$4,$5,'certificate transparency (crt.sh)',now())
      on conflict (cod_ibge, url) do nothing`, [m.cod_ibge, m.nome, m.uf, r.produto, r.url]);
  }
  if (!achou) console.log(`   · ${m.nome}: ${alvos.length} hosts de interesse, nenhum respondeu a produto conhecido (${alvos.slice(0, 4).join(", ")})`);
}
console.log(`\n[crtsh] ${achados} portais achados · ${semConsulta} municípios sem resposta do crt.sh`);
await db.end();
