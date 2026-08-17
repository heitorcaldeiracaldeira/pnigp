// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
// ingest_folha_multi24.mjs — folha nominal COM salário do bloco `multi24` (Multi24h / Vale Real), 18 municípios do RS.
//
// Bloco irmão do sys523 ([[pnigp-sys523-cecam-bloco-rs]]): mesmo perfil de white-label hospedado no domínio do
// próprio município — `{slug}.multi24h.com.br`, `multi24.{municipio}.rs.gov.br`, `portal.{municipio}.rs.gov.br` e
// até IP:porta cru (`177.136.215.226:7080`). A assinatura é o CAMINHO `/multi24/sistemas/transparencia/`.
//
// A ROTA: `?entidade=1&secao=servidores_salarios&action=consultar&ano=AAAA&mes=M&tipo_salario=0`
// 🚨 `ano` e `mes` são OBRIGATÓRIOS e não têm default útil: sem eles a tela responde 200 com a página inteira e
// ZERO linhas — o retrato exato do defeito nº 1 desta operação ([[pnigp-coletor-ok-sem-dado-sete-causas]]).
// Metade dos municípios está cadastrada em `secao=dinamico&id=NNNN`, que é uma página de PDFs; a rota boa é
// sempre `secao=servidores_salarios`, e o `id` varia por município — nunca copiar o do primeiro portal.
//
// O QUE ENTREGA: Nome · Cargo · Tipo · Valor bruto · Valor líquido, agrupado por GRUPO (`<tr class="entidade">`:
// Prefeitura / Aposentados / Câmara de Vereadores). ⚠️ NÃO traz lotação/secretaria — quem precisa de secretaria
// no RS continua dependendo do empenho ([[pnigp-tc-recebe-folha-e-nao-publica]]).
//
// Uso: UF=RS node scripts/ingest_folha_multi24.mjs      (REFAZ=1 reprocessa quem já está ok)
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
import crypto from "crypto";
import { pool, withRetry } from "./_cadprev.mjs";

const db = pool();
const q = withRetry(db);
const UF = process.env.UF || null;
const SO = process.env.SO || null;
const REFAZ = process.env.REFAZ === "1";
const UA = { "user-agent": "Mozilla/5.0 (compatible; PNIGP/1.0; pesquisa de dados publicos)" };

await q(`create table if not exists folha_servidores_multi24 (
  cod_ibge text, municipio text, uf text, grupo text, competencia text,
  nome text, cargo text, tipo text, bruto numeric, liquido numeric,
  _hash text primary key, _coletado_em timestamptz default now()
)`);
// a unidade gestora (`?entidade=N`) precisa ficar gravada: o mesmo município tem populações diferentes por entidade
await q(`alter table folha_servidores_multi24 add column if not exists entidade text`);
await q(`create index if not exists ix_folha_multi24_mun on folha_servidores_multi24 (cod_ibge, competencia)`);
await q(`create table if not exists folha_multi24_coleta (
  cod_ibge text primary key, municipio text, uf text, url text, competencia text,
  linhas int, situacao text, detalhe text, em timestamptz default now()
)`);

// ⭐ A sonda não é a única fonte de alvo: o DIAGNÓSTICO guardou hosts multi24 que ela não tem — inclusive os que
// não moram em `*.multi24h.com.br` (Santa Margarida do Sul em `191.36.149.248:8080/smargarida/…`, Cruzeiro do Sul
// servido pelo host de Westfalia). Ignorar essa fonte deixava município com coletor pronto parado.
const alvos = (await q(`
  with fontes as (
    select s.cod_ibge, s.municipio, s.uf, coalesce(s.url_pessoal, s.url_base) url
      from folha_sonda_municipal s
     where (s.url_pessoal ~ 'multi24' or s.url_base ~ 'multi24')
    union
    select d.cod_ibge, m.nome, m.uf, coalesce(d.url_pessoal, d.url_visitada)
      from folha_diagnostico_faltante d join municipios_br m on m.cod_ibge = d.cod_ibge
     where coalesce(d.url_pessoal, d.url_visitada) ~ 'multi24'
    union
    -- … e os candidatos achados lendo o SITE OFICIAL (descobre_portal_pelo_site.mjs), que é de onde vieram
    -- Cidreira e Coronel Pilar — nenhum dos dois estava na sonda nem no diagnóstico com host multi24
    select c.cod_ibge, c.municipio, c.uf, c.url
      from folha_portal_candidato c where c.produto = 'multi24'
  )
  -- 🚨 quando há mais de uma URL para o mesmo município, a ordem alfabética escolhia a PIOR: o IP morto
  -- (http://168.0.63.18:8080/...) vem antes do host vivo (https://nuvem.multi24h.com.br/salvadordosul/...) e o
  -- coletor fechava "fetch failed" com o portal no ar. Preferir, nesta ordem: caminho de TRANSPARENCIA, https,
  -- host com nome (nao IP cru), mais curta.
  select distinct on (cod_ibge) cod_ibge, municipio, uf, url from fontes
   where true ${UF ? "and uf = $1" : ""} ${SO ? `and municipio ilike '%'||$${UF ? 2 : 1}||'%'` : ""}
   order by cod_ibge,
     (url ~ '/sistemas/transparencia') desc,
     (url like 'https:%') desc,
     (url ~ '^https?://\\d{1,3}(\\.\\d{1,3}){3}') asc,
     length(url)`, [UF, SO].filter(Boolean))).rows;
const feitos = new Set(REFAZ ? [] : (await q(`select cod_ibge from folha_multi24_coleta
  where situacao in ('ok','ok_sem_valor')`)).rows.map((r) => r.cod_ibge));
const fila = alvos.filter((a) => !feitos.has(a.cod_ibge));
console.log(`[multi24] ${alvos.length} portais · ${feitos.size} já feitos · ${fila.length} na fila`);

// dinheiro "21.326,49" → 21326.49 (ponto é MILHAR)
const money = (s) => {
  const m = String(s ?? "").replace(/[R$\s ]/g, "");
  if (!m) return null;
  const n = +m.replace(/\./g, "").replace(",", ".");
  return Number.isFinite(n) ? n : null;
};
const limpo = (s) => { const v = String(s ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim(); return v || null; };
// ⚠️ o portal é ISO-8859-1 e não declara: decodificar como UTF-8 estraga todo nome acentuado
const baixa = async (url) => {
  const r = await fetch(url, { headers: UA, redirect: "follow", signal: AbortSignal.timeout(120000) });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return new TextDecoder("iso-8859-1").decode(await r.arrayBuffer());
};

// 🚨 o recuo de competência tem de VIRAR O ANO: recuar o mês com o ano fixo foi a causa nº 3 das sete
// (o PortalTP recuava 4 meses dentro do ano corrente e nunca achava dezembro do ano anterior).
function competenciasRecentes(n = 8) {
  const hoje = new Date();
  const fora = [];
  for (let k = 0; k < n; k++) {
    const d = new Date(Date.UTC(hoje.getUTCFullYear(), hoje.getUTCMonth() - k, 1));
    fora.push({ ano: d.getUTCFullYear(), mes: d.getUTCMonth() + 1 });
  }
  return fora;
}

// separa as linhas de GRUPO das linhas de servidor
// 🚨 O NÚMERO DE COLUNAS VARIA POR MUNICÍPIO: Teutônia serve 6 células (nome|cargo|tipo|bruto|líquido|ficha) e
// Sapucaia do Sul apenas 4 (nome|cargo|tipo|vazio) — ela publica a lista nominal SEM salário. Exigir 5 células
// descartava os 3.956 servidores de Sapucaia em silêncio. Por isso as colunas de dinheiro são achadas pelo
// FORMATO do conteúdo, não pela posição.
const EH_DINHEIRO = /^R?\$?\s?\d{1,3}(\.\d{3})*,\d{2}$/;
function parseTabela(html) {
  const linhas = [];
  let grupo = null;
  for (const m of html.matchAll(/<tr([^>]*)>([\s\S]{0,1500}?)<\/tr>/gi)) {
    const ehGrupo = /class="[^"]*entidade/i.test(m[1]);
    const cels = [...m[2].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((c) => limpo(c[1]));
    if (ehGrupo) { grupo = cels.find(Boolean) || grupo; continue; }
    if (cels.length < 3) continue;
    const [nome, cargo] = cels;
    if (!nome || !cargo) continue;
    const valores = cels.slice(2).filter((c) => c && EH_DINHEIRO.test(c)).map(money);
    const tipo = cels.slice(2).find((c) => c && !EH_DINHEIRO.test(c)) || null;
    linhas.push({ grupo, nome, cargo, tipo, bruto: valores[0] ?? null, liquido: valores[1] ?? null });
  }
  return linhas;
}

// 🚨 CONTAMINAÇÃO ENTRE MUNICÍPIOS: a sonda cadastrou Cruzeiro do Sul apontando para
// `sistemas.westfalia.rs.gov.br` — o portal de WESTFÁLIA. A coleta não falha: ela grava a folha do vizinho com o
// nome certo, e só o cruzamento com a RAIS denuncia (razão 0,50). Host com NOME tem de conter o slug do
// município; host que é IP cru não dá para validar assim e passa sinalizado.
const so = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
// ⚠️ o host costuma OMITIR as preposições: `vistaalegreprata.multi24h.com.br` para "Vista Alegre do Prata".
// Sem tirar de/do/da/dos/das a guarda barra município legítimo — falso positivo que custou 1 município.
const soSemPrep = (s) => so(String(s || "").replace(/\b(de|do|da|dos|das)\b/gi, " "));
const ehIp = (h) => /^\d{1,3}(\.\d{1,3}){3}(:\d+)?$/.test(h);
function hostConfere(url, municipio) {
  let host; try { host = new URL(url).hostname; } catch { return { ok: true, motivo: "url ilegível" }; }
  if (ehIp(host)) return { ok: true, motivo: "ip" };
  const h = so(host);
  if (h.includes(so(municipio)) || h.includes(soSemPrep(municipio))) return { ok: true, motivo: "nome bate" };
  return { ok: false, motivo: `host ${host} não contém o nome do município` };
}

// ⭐⭐ O HOST É INDÍCIO; A PROVA É O NOME QUE O PORTAL DECLARA. O guard por host barrava São Sebastião do Caí só
// porque o host usa a SIGLA (`pmsscai.multi24h.com.br`) — e a página diz, com todas as letras, "Prefeitura
// Municipal de São Sebastião do Caí". No mesmo teste, `sistemas.westfalia.rs.gov.br` (cadastrado para Cruzeiro do
// Sul) declara "Prefeitura Municipal de Westfália": contaminação de verdade. Então, quando o host não bate, não se
// descarta nem se aceita — vai-se ler o portal.
async function entidadeDeclarada(raiz) {
  try {
    const r = await fetch(`${raiz}?entidade=1`, { headers: { "user-agent": "Mozilla/5.0 (compatible; PNIGP/1.0)" },
      signal: AbortSignal.timeout(25000) });
    if (!r.ok) return null;
    const buf = Buffer.from(await r.arrayBuffer());
    let t = buf.toString("utf8");
    if (t.includes("�")) t = buf.toString("latin1");
    const m = [...t.matchAll(/(?:PREFEITURA MUNICIPAL DE|MUNIC[ÍI]PIO DE)\s+([^<\n.]{3,60})/gi)]
      .map((x) => x[1].trim()).filter((x) => !/sua cidade/i.test(x));
    return m[0] || null;
  } catch { return null; }
}

let totalGeral = 0, ok = 0, falhas = 0;
for (let i = 0; i < fila.length; i++) {
  const a = fila[i];
  // 🚨 `/sistemas/portal/` NÃO é `/sistemas/transparencia/`. O link que o site oficial publica costuma ser o do
  // PORTAL DO CIDADÃO; a folha (`secao=servidores_salarios`) só responde no módulo de TRANSPARÊNCIA. Com a URL do
  // portal, o coletor fechava "nenhuma entidade/competência devolveu linhas" — 15 municípios de uma vez, todos
  // parecendo "não publica" e todos publicando. Normalizar antes de tudo, e tirar o `#âncora`.
  const raiz = a.url.split("?")[0].split("#")[0].replace(/\/sistemas\/portal\/?$/i, "/sistemas/transparencia/");
  // 🚨 CADA MUNICÍPIO TEM VÁRIAS ENTIDADES (`?entidade=N`) e elas trazem POPULAÇÕES DIFERENTES: em Sapucaia do
  // Sul a entidade 1 tem 107 pessoas COM valor e a 3 tem 3.958 SEM valor. Coletar só a da URL descoberta perdia
  // o resto — e pior, quando a re-sondagem reescreveu a URL sem o `?entidade=3`, o município caiu de 3.932 para
  // 106 registros sem que nada falhasse. Varre-se de 1 a MAX_ENT e junta-se tudo, com a entidade no hash.
  const MAX_ENT = Number(process.env.MAX_ENT || 4);
  const daUrl = (a.url.match(/[?&]entidade=(\d+)/) || [])[1];
  const entidades = [...new Set([daUrl, ...Array.from({ length: MAX_ENT }, (_, k) => String(k + 1))].filter(Boolean))];
  const marca = (situacao, detalhe, competencia = null, linhas = 0) =>
    q(`insert into folha_multi24_coleta (cod_ibge,municipio,uf,url,competencia,linhas,situacao,detalhe,em)
       values ($1,$2,$3,$4,$5,$6,$7,$8,now())
       on conflict (cod_ibge) do update set url=excluded.url, competencia=excluded.competencia,
         linhas=excluded.linhas, situacao=excluded.situacao, detalhe=excluded.detalhe, em=now()`,
      [a.cod_ibge, a.municipio, a.uf, raiz, competencia, linhas, situacao, detalhe]);
  try {
    const conf = hostConfere(raiz, a.municipio);
    if (!conf.ok) {
      const declarada = await entidadeDeclarada(raiz);
      const bate = declarada && (so(declarada).includes(so(a.municipio)) || so(declarada).includes(soSemPrep(a.municipio))
                                 || so(a.municipio).includes(so(declarada)));
      if (!bate) {
        const motivo = declarada ? `host ${raiz} declara "${declarada}", não ${a.municipio}`
                                 : `${conf.motivo} e o portal não declara entidade`;
        await marca("host_suspeito", motivo);
        falhas++;
        console.log(`  ⚠ [${i + 1}/${fila.length}] ${a.municipio}: ${motivo} — NÃO coletado`);
        continue;
      }
      console.log(`  ↪ [${i + 1}/${fila.length}] ${a.municipio}: host com sigla, mas o portal declara "${declarada}" — segue`);
    }
    // 🚨 A competência é a MAIS CHEIA, não a primeira que responder: Pareci Novo parava em 202608 (agosto, o mês
    // corrente, ainda em fechamento) com 13 linhas. Mesmo defeito já corrigido em Betha, Citta, Abase e SCPI
    // ([[pnigp-competencia-mais-cheia-nao-a-recente]]). Testa até MESES_TESTE competências COM dados.
    const MESES_TESTE = Number(process.env.MESES_TESTE || 3);
    const coletado = [];
    let competencia = null;
    for (const entidade of entidades) {
      let achou = null, testados = 0;
      for (const { ano, mes } of competenciasRecentes()) {
        const qs = new URLSearchParams({ secao: "servidores_salarios", action: "consultar", entidade,
          ano: String(ano), mes: String(mes), id_entidade_salario: "", nome_servidor: "",
          cargo_servidor: "", tipo_salario: "0" });
        const html = await baixa(`${raiz}?${qs}`);
        const linhas = parseTabela(html);
        if (!linhas.length) continue;
        testados++;
        if (!achou || linhas.length > achou.linhas.length) achou = { ano, mes, linhas };
        if (testados >= MESES_TESTE) break;
      }
      if (!achou) continue;
      const comp = `${achou.ano}${String(achou.mes).padStart(2, "0")}`;
      competencia = competencia || comp;
      for (const l of achou.linhas) coletado.push({ ...l, entidade, competencia: comp });
    }
    if (!coletado.length) { await marca("vazio", "nenhuma entidade/competência devolveu linhas"); falhas++; continue; }

    const regs = coletado.map((l) => ({
      ...l, cod_ibge: a.cod_ibge, municipio: a.municipio, uf: a.uf,
      // entidade e grupo entram no hash: a mesma pessoa pode aparecer em unidades diferentes e como aposentada
      _hash: crypto.createHash("md5")
        .update([a.cod_ibge, l.competencia, l.entidade, l.grupo, l.nome, l.cargo, l.tipo, l.bruto, l.liquido].join("|")).digest("hex"),
    }));
    const p = [...new Map(regs.map((x) => [x._hash, x])).values()];
    // no REFAZ apaga o município INTEIRO (todas as entidades e competências): apagar só uma competência deixaria
    // resíduo da passada anterior, que coletava uma entidade só
    if (REFAZ) await q(`delete from folha_servidores_multi24 where cod_ibge=$1`, [a.cod_ibge]);
    const c = (f) => p.map((x) => x[f]);
    await q(`insert into folha_servidores_multi24
      (cod_ibge,municipio,uf,grupo,competencia,nome,cargo,tipo,bruto,liquido,entidade,_hash)
      select * from unnest($1::text[],$2::text[],$3::text[],$4::text[],$5::text[],$6::text[],$7::text[],
        $8::text[],$9::numeric[],$10::numeric[],$11::text[],$12::text[])
      on conflict (_hash) do update set bruto=excluded.bruto, liquido=excluded.liquido, _coletado_em=now()`,
      [c("cod_ibge"), c("municipio"), c("uf"), c("grupo"), c("competencia"), c("nome"), c("cargo"),
       c("tipo"), c("bruto"), c("liquido"), c("entidade"), c("_hash")]);

    // ⭐ OS DOIS FATOS SEPARADOS: publicar a lista nominal não implica publicar o valor. Sapucaia do Sul serve
    // 3.956 servidores com nome e cargo e NENHUM salário — marcar isso como 'ok' inflaria a contagem de
    // municípios "com folha e salário"; marcar como 'vazio' jogaria fora 3.956 registros reais.
    const comValor = p.filter((x) => (x.bruto ?? 0) > 0 || (x.liquido ?? 0) > 0).length;
    const situacao = comValor > 0 ? "ok" : "ok_sem_valor";
    const entsUsadas = [...new Set(p.map((x) => x.entidade))].join("+");
    await marca(situacao, `entidades ${entsUsadas}` + (comValor > 0 ? ` · ${comValor} com valor` : " · lista nominal sem salário"),
      competencia, p.length);
    totalGeral += p.length; ok++;
    console.log(`  [${i + 1}/${fila.length}] ${a.municipio}: ${p.length} servidores · ${competencia} · ent ${entsUsadas}` +
      (comValor === 0 ? " · SEM VALOR" : ` · ${comValor} c/ valor`) +
      (coletado.length !== p.length ? ` (${coletado.length - p.length} duplicatas)` : ""));
  } catch (e) {
    falhas++;
    await marca("erro", String(e.message).slice(0, 150));
    console.log(`  ✖ [${i + 1}/${fila.length}] ${a.municipio}: ${String(e.message).slice(0, 80)}`);
  }
}
console.log(`\n[multi24] ${totalGeral.toLocaleString("pt-BR")} servidores · ${ok} portais ok · ${falhas} falhas`);
await db.end();
