// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════
// ingest_quadro_pessoal_pi.mjs — QUADRO DE PESSOAL dos municípios do PIAUÍ (o layout que NÃO tem salário).
//
// ⚠️⚠️ O QUE ESTE COLETOR TRAZ — E O QUE NÃO TRAZ
// Traz: CPF (mascarado na fonte) · NOME · CARGO · **LOTAÇÃO** · jornada · admissão · demissão · funções.
// **NÃO traz REMUNERAÇÃO** — e isto foi MEDIDO, não suposto: a tela devolve as 8 colunas acima e nenhuma
// contém "R$". Por isso os dados entram em tabela PRÓPRIA (`quadro_pessoal_pi`), NUNCA em `folha_servidores_*`.
// Quem soma folha não pode somar isto sem perceber.
//
// 🚨 O PIAUÍ TEM DOIS PORTAIS, E ELES SE COMPLEMENTAM (não se substituem):
//   • ESTE (`/{slug}/servidores/`, Laravel): tem LOTAÇÃO, não tem valor.  → é a maioria do estado
//   • o "v2" (`/v2/servidores.json`, DevExpress): tem VALOR, não tem lotação. → `ingest_folha_pi_v2.mjs`, 13 municípios
//   Nenhum dos dois entrega os cinco campos sozinho. Dizer "o PI não publica salário" é falso; dizer
//   "o PI publica salário" também. A frase certa é: publica os dois pedaços, em telas diferentes.
//
// 🚨 DOIS ERROS QUE CUSTARAM TEMPO E ESTÃO CORRIGIDOS AQUI:
//   1. **IPv4.** O `fetch` do Node dava `ECONNREFUSED`/`ETIMEDOUT` nesses hosts e o navegador abria normal —
//      parecia portal fora do ar. É o undici tentando IPv6 e desistindo da conexão em 10s. Com
//      `connect:{family:4, timeout:40000}` o mesmo host responde 200. Sem isto eu teria concluído
//      "o PI não responde por HTTP" e escrito um coletor por navegador 20× mais lento — cheguei a escrever.
//   2. **`offset` mata a paginação.** A tela pagina de 15 em 15 (`&page=N`), mas aceita `offset=5000` e
//      devolve TUDO numa requisição. Paginar aqui seria trabalho inventado.
//
// ⚠️ COMPETÊNCIA: o combo vai de 2014 a 2026 e o mês corrente vem PARCIAL. Escolho varrendo os meses do ano
//    mais novo de trás pra frente e ficando com o MAIS CHEIO, não com o mais recente
//    ([[pnigp-competencia-mais-cheia-nao-a-recente]]). Em Angical: 07/2026 = 375, 01/2026 = 255.
//
// Uso: node scripts/ingest_quadro_pessoal_pi.mjs   ·   SO=Angical   ·   REFAZ=1   ·   CONC=8
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
import crypto from "crypto";
import { Agent, setGlobalDispatcher } from "undici";
import { pool, withRetry } from "./_cadprev.mjs";

setGlobalDispatcher(new Agent({ connect: { timeout: 40000, rejectUnauthorized: false, family: 4 },
  headersTimeout: 90000, bodyTimeout: 180000 }));

const db = pool(); const q = withRetry(db);
const SO = process.env.SO || null;
const REFAZ = process.env.REFAZ === "1";
const CONC = Number(process.env.CONC || 8);
const ANO_MAX = Number(process.env.ANO_MAX || new Date().getUTCFullYear());
const H = { "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  accept: "text/html,application/xhtml+xml" };
const FONTE = "portal /servidores do PI - quadro de pessoal (com lotacao, SEM remuneracao)";

await q(`create table if not exists quadro_pessoal_pi (
  cod_ibge text, municipio text, uf text default 'PI', url text, competencia text,
  nome text, cpf_masc text, cargo text, secretaria text, funcoes text,
  jornada text, data_admissao text, data_demissao text,
  observacao text, _hash text primary key, _coletado_em timestamptz default now())`);
await q(`create index if not exists ix_quadro_pi_mun on quadro_pessoal_pi (cod_ibge)`);
// ⚠️ coluna nova: se ALGUM município deste layout expuser valor, quero ver — não quero descobrir por suposição
await q(`alter table quadro_pessoal_pi add column if not exists remuneracao numeric`);
await q(`create table if not exists quadro_pessoal_pi_coleta (
  cod_ibge text primary key, municipio text, url text, competencia text,
  linhas int, situacao text, detalhe text, em timestamptz default now())`);

const slug = (n) => n.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
  .replace(/ pi$/, "").replace(/ do piaui$/, "").replace(/[^a-z0-9]/g, "");

// alvos: TODO município do PI que ainda não tem folha coletada de nenhuma fonte
const tabs = (await q(`select table_name t from information_schema.tables where table_schema='public'
  and table_name like 'folha_servidores_%'`)).rows.map((r) => r.t);
const partes = [];
for (const t of tabs) {
  const ok = (await q(`select 1 from information_schema.columns where table_name=$1 and column_name='cod_ibge'`, [t])).rowCount;
  if (ok) partes.push(`select distinct left(cod_ibge::text,7) c from ${t} where left(cod_ibge::text,2)='22'`);
}
const alvos = (await q(`
  with col as (${partes.join(" union ")})
  select m.cod_ibge, m.nome municipio,
         (select v.url from pi_servidores_visita v where v.cod_ibge=m.cod_ibge and v.url is not null) url_visita,
         (select split_part(l,'|',2) from site_municipal_links s
            cross join lateral jsonb_array_elements_text(s.links) l
           where s.cod_ibge=m.cod_ibge and split_part(l,'|',2) ~* '/servidores' limit 1) url_lida,
         -- ⭐ os hosts REAIS do município (censo). Sem isto o coletor só sabe chutar "transparencia.{slug}" —
         -- e o chute errado vira "sem_portal", que é um buraco declarado onde há publicação.
         (select array_agg(distinct h.host) from pi_host_censo h
           where h.cod_ibge=m.cod_ibge and h.host like '%.gov.br') hosts
    from municipios_br m left join col c on c.c = m.cod_ibge
   where m.uf='PI' and c.c is null ${SO ? "and m.nome ilike '%'||$1||'%'" : ""}
   order by m.nome`, SO ? [SO] : [])).rows;
const feitos = REFAZ ? new Set()
  : new Set((await q(`select cod_ibge from quadro_pessoal_pi_coleta where situacao like 'ok%'`)).rows.map((r) => r.cod_ibge));
const fila = alvos.filter((a) => !feitos.has(a.cod_ibge));
console.log(`[pi-quadro] ${alvos.length} municípios sem folha · ${fila.length} na fila`);

const qs = (ano, mes, off, pag = 1) =>
  `offset=${off}&ano=${ano}&tipo_form=busca&mes=${String(mes).padStart(2, "0")}&nome_servidor=` +
  `&situacao_status=A&cargo=Todos&lotacao=Todos&tipo_vinculo=Todos&fonte_recurso=&page=${pag}`;

// ⚠️ o timeout é parâmetro, não constante: a DESCOBERTA de base tenta ~18 candidatos e a maioria não existe.
// A 120s por candidato, um município que não publica prende um trabalhador por mais de uma hora e a fila para.
// Descoberta = 20s (host que não existe falha rápido); o pull cheio = 120s (é onde vale esperar).
async function pega(url, tent = 2, tmo = 120000) {
  for (let t = 0; t < tent; t++) {
    try {
      const r = await fetch(url, { headers: H, redirect: "follow", signal: AbortSignal.timeout(tmo) });
      if (r.status >= 400) return null;
      return await r.text();
    } catch { if (t === tent - 1) return null; }
  }
  return null;
}

const semTags = (s) => s.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ")
  .replace(/&aacute;/g, "á").replace(/&eacute;/g, "é").replace(/&iacute;/g, "í").replace(/&oacute;/g, "ó")
  .replace(/&uacute;/g, "ú").replace(/&ccedil;/g, "ç").replace(/&atilde;/g, "ã").replace(/&otilde;/g, "õ")
  .replace(/&acirc;/g, "â").replace(/&ecirc;/g, "ê").replace(/&ocirc;/g, "ô").replace(/&amp;/g, "&")
  .replace(/\s+/g, " ").trim();

// quantas páginas a tela tem nesta competência → serve de medida do tamanho SEM baixar tudo
const paginas = (html) => Math.max(0, ...[...html.matchAll(/[?&]page=(\d+)/g)].map((m) => +m[1]));
const temLinhas = (html) => ((html.split(/<tbody/i)[1] || "").match(/<tr/gi) || []).length;

function leTabela(html) {
  const corpo = html.split(/<tbody/i)[1] || "";
  const heads = [...html.matchAll(/<th[^>]*>([\s\S]*?)<\/th>/gi)].map((m) => semTags(m[1]).toLowerCase());
  const col = (re) => heads.findIndex((h) => re.test(h));
  const ix = { cpf: col(/cpf/), nome: col(/nome/), cargo: col(/cargo/), lot: col(/lota|secretaria|setor/),
    func: col(/fun[çc]/), jor: col(/jornada|carga/), adm: col(/admiss/), dem: col(/demiss/),
    // ⚠️ valor pelo RÓTULO **e** pelo conteúdo: no v2 não havia <th> e o dinheiro passou despercebido
    val: col(/remunera|sal[áa]rio|l[íi]quido|bruto|valor|vencimento/) };
  const out = [];
  for (const tr of corpo.match(/<tr[\s\S]*?<\/tr>/gi) || []) {
    const c = [...tr.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((m) => semTags(m[1]));
    if (c.length < 3) continue;
    const p = (i) => (i >= 0 && i < c.length ? c[i] || null : null);
    const nome = p(ix.nome);
    if (!nome || /^nome$/i.test(nome)) continue;
    // se o cabeçalho não disser onde está o valor, procuro "R$ 1.234,56" em QUALQUER célula da linha
    let val = p(ix.val);
    if (!val) val = c.find((x) => /R\$\s?[\d.]+[,.]\d{2}/.test(x)) || null;
    out.push({ cpf: p(ix.cpf), nome, cargo: p(ix.cargo), lot: p(ix.lot), func: p(ix.func),
      jor: p(ix.jor), adm: p(ix.adm), dem: p(ix.dem), val });
  }
  return out;
}

const num = (v) => {
  if (!v) return null;
  const m = String(v).match(/([\d.]+),(\d{2})/) || String(v).match(/(\d+)\.(\d{2})\b/);
  if (!m) return null;
  const n = parseFloat(m[1].replace(/\./g, "") + "." + m[2]);
  return Number.isFinite(n) ? n : null;
};

const LOTE = 700;
async function grava(regs) {
  const uniq = [...new Map(regs.map((r) => [r._hash, r])).values()];
  for (let i = 0; i < uniq.length; i += LOTE) {
    const p = uniq.slice(i, i + LOTE); const c = (f) => p.map((x) => x[f] ?? null);
    await q(`insert into quadro_pessoal_pi
      (cod_ibge,municipio,url,competencia,nome,cpf_masc,cargo,secretaria,funcoes,jornada,
       data_admissao,data_demissao,observacao,remuneracao,_hash)
      select * from unnest($1::text[],$2::text[],$3::text[],$4::text[],$5::text[],$6::text[],$7::text[],$8::text[],
        $9::text[],$10::text[],$11::text[],$12::text[],$13::text[],$14::numeric[],$15::text[])
      on conflict (_hash) do update set cargo=excluded.cargo, secretaria=excluded.secretaria,
        funcoes=excluded.funcoes, remuneracao=excluded.remuneracao, _coletado_em=now()`,
      [c("cod_ibge"), c("municipio"), c("url"), c("competencia"), c("nome"), c("cpf_masc"), c("cargo"),
       c("secretaria"), c("funcoes"), c("jornada"), c("data_admissao"), c("data_demissao"),
       c("observacao"), c("remuneracao"), c("_hash")]);
  }
  return uniq.length;
}

// a base é a URL da tela SEM query string; aceito o que já foi validado antes e, se não houver, chuto pelo slug
function bases(a) {
  const s = slug(a.municipio);
  const limpa = (u) => { try { const x = new URL(u); return x.origin + x.pathname.replace(/\/?$/, "/"); } catch { return null; } };
  const doCenso = (a.hosts || []).flatMap((h) => [
    `https://${h}/${s}/servidores/`, `https://${h}/servidores/`, `http://${h}/${s}/servidores/`]);
  return [...new Set([a.url_visita && limpa(a.url_visita), a.url_lida && limpa(a.url_lida),
    `https://transparencia.${s}.pi.gov.br/${s}/servidores/`,
    `https://${s}.pi.gov.br/${s}/servidores/`,
    `https://transparencia.${s}.pi.gov.br/servidores/`,
    `https://${s}.pi.gov.br/transparencia/servidores/`,
    ...doCenso].filter(Boolean))];
}

let i = 0, ok = 0, vazios = 0, erros = 0, total = 0, comValor = 0;
async function trab() {
  while (i < fila.length) {
    const a = fila[i++];
    const marca = (situacao, detalhe, url = null, comp = null, n = 0) =>
      q(`insert into quadro_pessoal_pi_coleta (cod_ibge,municipio,url,competencia,linhas,situacao,detalhe,em)
         values ($1,$2,$3,$4,$5,$6,$7,now()) on conflict (cod_ibge) do update set url=excluded.url,
         competencia=excluded.competencia, linhas=excluded.linhas, situacao=excluded.situacao,
         detalhe=excluded.detalhe, em=now()`, [a.cod_ibge, a.municipio, url, comp, n, situacao, detalhe]);
    try {
      // 1) que base responde com a tela?
      let base = null;
      for (const b of bases(a)) {
        // 2 tentativas também aqui: com 1, um timeout isolado marca o município como "sem portal" —
        // um buraco declarado que na verdade publica. Errar assim é pior que demorar.
        const h = await pega(b + "?" + qs(ANO_MAX, 12, 15), 2, 20000);
        if (h && /tipo_form=busca|servidores/i.test(h) && /<t(head|body)/i.test(h)) { base = b; break; }
      }
      if (!base) { await marca("sem_portal", "nenhuma base respondeu"); vazios++; continue; }

      // 2) competência MAIS CHEIA do ano mais novo com dado (não a mais recente — o mês corrente vem parcial)
      let melhor = null;
      for (const ano of [ANO_MAX, ANO_MAX - 1]) {
        const medidas = [];
        for (let mes = 12; mes >= 1; mes--) {
          // ⚠️ 2 tentativas, não 1: com uma só, um timeout isolado faz o ANO INTEIRO parecer vazio e o
          // coletor desce para o ano anterior. Foi exatamente o que aconteceu em Angical (11/2025 no lugar
          // de 07/2026) — dado velho entrando por falha de rede, não por ausência de publicação.
          const h = await pega(base + "?" + qs(ano, mes, 15), 2, 45000);
          if (!h || !temLinhas(h)) continue;
          medidas.push({ ano, mes, pag: paginas(h) || 1 });
          if (medidas.length >= 5) break;   // folha é contígua: 5 meses bastam para achar o mais cheio
        }
        if (!medidas.length) continue;
        medidas.sort((x, y) => y.pag - x.pag || y.mes - x.mes);
        // ⚠️ nem todo portal do PI desenha links de página (Bertolínia não desenha). Sem paginador, `pag`
        // é 1 para todos os meses e o critério vira "mais recente" — que é justamente o que a lei da
        // competência mais CHEIA proíbe. Quando isso acontece, meço pelo número real de linhas dos 2 topos.
        if (medidas.every((m) => m.pag <= 1) && medidas.length > 1) {
          for (const m of medidas.slice(0, 2)) {
            const h = await pega(base + "?" + qs(m.ano, m.mes, 5000), 2);
            m.pag = h ? temLinhas(h) : 0;
          }
          medidas.sort((x, y) => y.pag - x.pag || y.mes - x.mes);
        }
        melhor = medidas[0];
        break;
      }
      if (!melhor) { await marca("sem_competencia", "nenhum mês devolveu linhas", base); vazios++; continue; }

      // 3) puxa TUDO de uma vez — a tela aceita offset grande e dispensa paginar
      // AAAAMM, o mesmo formato das folha_servidores_* — para poder comparar competência entre fontes
      const comp = `${melhor.ano}${String(melhor.mes).padStart(2, "0")}`;
      const html = await pega(base + "?" + qs(melhor.ano, melhor.mes, 5000));
      if (!html) { await marca("erro", "pull cheio não respondeu", base, comp); erros++; continue; }
      const linhas = leTabela(html);
      if (!linhas.length) { await marca("vazio", "tabela sem linhas", base, comp); vazios++; continue; }

      const temVal = linhas.some((x) => num(x.val) != null);
      const regs = linhas.map((x) => ({
        cod_ibge: a.cod_ibge, municipio: a.municipio, url: base, competencia: comp,
        nome: x.nome, cpf_masc: x.cpf, cargo: x.cargo, secretaria: x.lot, funcoes: x.func,
        jornada: x.jor, data_admissao: x.adm, data_demissao: x.dem,
        remuneracao: num(x.val),
        observacao: temVal ? FONTE.replace("SEM remuneracao", "COM remuneracao") : FONTE,
        _hash: crypto.createHash("md5")
          .update([a.cod_ibge, comp, x.cpf, x.nome, x.cargo, x.lot].join("|")).digest("hex"),
      }));
      const n = await grava(regs);
      total += n; ok++; if (temVal) comValor++;
      await marca(temVal ? "ok_com_valor" : "ok_sem_valor", `${melhor.pag} páginas na origem`, base, comp, n);
      console.log(`  ✔ [${ok}] ${a.municipio}: ${n} servidores · ${comp}${temVal ? " · COM VALOR" : ""}`);
    } catch (e) {
      erros++; await marca("erro", String(e.message).slice(0, 140));
      console.log(`  ✖ ${a.municipio}: ${String(e.message).slice(0, 60)}`);
    }
  }
}
await Promise.all(Array.from({ length: CONC }, trab));

console.log(`\n[pi-quadro] ${total.toLocaleString("pt-BR")} servidores · ${ok} municípios (${comValor} com valor) · ${vazios} sem tela · ${erros} erros`);
console.table((await q(`select situacao, count(*) n, sum(linhas) linhas from quadro_pessoal_pi_coleta group by 1 order by 2 desc`)).rows);
console.table((await q(`select count(distinct cod_ibge) municipios, count(*) linhas,
  count(*) filter (where secretaria is not null and secretaria<>'') com_lotacao,
  count(*) filter (where remuneracao is not null) com_remuneracao,
  count(distinct competencia) competencias from quadro_pessoal_pi`)).rows);
await db.end();
