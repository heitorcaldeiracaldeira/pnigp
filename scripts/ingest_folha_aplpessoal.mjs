// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════
// ingest_folha_aplpessoal.mjs — folha nominal do portal PHP "Portal da Transparência" cuja marca é o caminho
// `/transparencia/index.php?link=aplicacoes/pessoal/frmpessoal` (o servidor se identifica como
// `D:\SISTEMAS\WEB\TRANSPARENCIA`, e o parâmetro `tipo_empresa_sip` denuncia o SIP por trás).
// Forte em RONDÔNIA, onde nenhum coletor da campanha pegava um único município.
//
// ⭐ O QUE ENTREGA — os CINCO campos:
//    matrícula · **nome** · admissão · **cargo** · **lotação** · jornada · **salário base** · **total**
//
// ⛏️ COMO SE CHEGA AO DADO — três chamadas, e a terceira é a que importa:
//   1. GET  `index.php?link=aplicacoes/pessoal/frmpessoal`   → cookie PHPSESSID + combo de entidades e meses
//   2. POST `query/busca_tipo.php`  (cbx_entidade, cbx_ano, cbxmes) → devolve `<option value="3474">Folha Mensal`
//      ⚠️ o id do tipo MUDA A CADA MÊS (junho=3474, julho=3479). Fixar um número coleta o mês errado ou nada.
//   3. POST `aplicacoes/pessoal/processing.php` (DataTables server-side) com `referencia` = aquele id,
//      `entidade` = número da entidade, `estabelecimento`, `tipo_empresa_sip` e `length=5000`
//      → **JSON com a folha inteira numa requisição** (883 linhas em Cerejeiras).
//
// 🚨 QUATRO ARMADILHAS QUE ME CUSTARAM TEMPO (todas resolvidas aqui):
//   1. **`value = "3474"` com ESPAÇOS** em volta do `=`. O regex `/value="(\d+)"/` devolvia lista vazia e o
//      município parecia "sem tipo de folha". É o mesmo tipo de erro do `value='07FN'` com aspas simples no CE.
//   2. **O POST de `sessaoprincipal.php` NÃO basta.** Passei tempo tentando "gravar na sessão" e recebendo
//      `Undefined index: entidade`. Os parâmetros vão no CORPO do processing.php — eu não os via porque
//      truncava a captura do POST em 1500 caracteres e eles ficam DEPOIS dos 12 blocos de `columns[]`.
//      ⚠️ Ao capturar um POST para reproduzir, ler o corpo INTEIRO; o que importa costuma estar no fim.
//   3. **Combos em cadeia por AJAX** (entidade → ano → mês → tipo): no navegador, preencher tudo de uma vez
//      pega o combo ainda em "Carregando Referência". Por HTTP isso some — mais um motivo para não usar
//      navegador aqui ([[pnigp-fetch-node-ipv6-econnrefused]] é o outro).
//   4. **IPv4 obrigatório** (`family:4`) — sem ele, metade destes hosts dá ECONNREFUSED no Node.
//
// ⚠️ ENTIDADES: o combo traz prefeitura, fundos e CÂMARA. Coleto todas menos a câmara e gravo o nome em
//    `entidade` — misturar câmara com prefeitura já contaminou município noutra UF
//    ([[pnigp-chapadao-do-sul-camara-contaminacao]] é o precedente).
// ⚠️ COMPETÊNCIA: descarto o mês com < 85% do maior (esse está parcial) e fico com o MAIS RECENTE dos cheios.
//
// Uso: UF=RO node scripts/ingest_folha_aplpessoal.mjs   ·   SO=Cerejeiras   ·   REFAZ=1   ·   CONC=4
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
import crypto from "crypto";
import { Agent, setGlobalDispatcher } from "undici";
import { pool, withRetry } from "./_cadprev.mjs";
import { SG_UF as UF } from "./_uf.mjs";

setGlobalDispatcher(new Agent({ connect: { timeout: 20000, rejectUnauthorized: false, family: 4 },
  headersTimeout: 60000, bodyTimeout: 300000 }));

const db = pool(); const q = withRetry(db);
const SO = process.env.SO || null;
const REFAZ = process.env.REFAZ === "1";
const CONC = Number(process.env.CONC || 4);
const ANO_MAX = Number(process.env.ANO_MAX || new Date().getUTCFullYear());
const H = { "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36" };

await q(`create table if not exists folha_servidores_aplpessoal (
  cod_ibge text, municipio text, uf text, entidade text, competencia text,
  nome text, cpf_masc text, matricula text, cargo text, secretaria text, departamento text,
  vinculo text, classe_nivel text, situacao text, data_admissao text, data_demissao text, carga_horaria text,
  salario_base numeric, gratificacoes numeric, outros numeric, ferias numeric, decimo numeric,
  bruto numeric, descontos numeric, liquido numeric,
  _hash text primary key, _coletado_em timestamptz default now())`);
await q(`create index if not exists ix_folha_aplpessoal_mun on folha_servidores_aplpessoal (cod_ibge)`);
await q(`create table if not exists folha_aplpessoal_coleta (
  cod_ibge text primary key, municipio text, host text, competencia text,
  entidades int, linhas int, situacao text, detalhe text, em timestamptz default now())`);

const dec = (b) => { const t = b.toString("utf8"); return /\uFFFD/.test(t) ? b.toString("latin1") : t; };
const sem = (s) => String(s ?? "").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
const num = (v) => { const m = String(v ?? "").match(/(-?[\d.]+),(\d{2})/); if (!m) return null;
  const n = parseFloat(m[1].replace(/\./g, "") + "." + m[2]); return Number.isFinite(n) ? n : null; };

async function req(u, { body = null, cookie = "", tent = 2 } = {}) {
  for (let k = 0; k < tent; k++) {
    try {
      const r = await fetch(u, { method: body ? "POST" : "GET", redirect: "follow",
        headers: { ...H, ...(cookie ? { cookie } : {}), ...(body ? { "content-type": "application/x-www-form-urlencoded", "x-requested-with": "XMLHttpRequest" } : {}) },
        body, signal: AbortSignal.timeout(300000) });
      if (r.status >= 400) return null;
      return { txt: dec(Buffer.from(await r.arrayBuffer())),
        cookie: (r.headers.getSetCookie?.() || []).map((c) => c.split(";")[0]).join("; ") };
    } catch { if (k === tent - 1) return null; }
  }
  return null;
}

// corpo do DataTables: 12 blocos de columns[] + os parâmetros próprios do portal
function corpoDT({ ref, entidade, estab, length, start = 0 }) {
  const p = new URLSearchParams({ draw: "1", start: String(start), length: String(length),
    "order[0][column]": "2", "order[0][dir]": "asc", "search[value]": "", "search[regex]": "false",
    referencia: ref, entidade: String(entidade), tipo_empresa_sip: "1", estabelecimento: String(estab) });
  for (let i = 0; i < 12; i++) {
    p.append(`columns[${i}][data]`, String(i)); p.append(`columns[${i}][name]`, "");
    p.append(`columns[${i}][searchable]`, "true"); p.append(`columns[${i}][orderable]`, "true");
    p.append(`columns[${i}][search][value]`, ""); p.append(`columns[${i}][search][regex]`, "false");
  }
  return p;
}

const LOTE = 700;
async function grava(regs) {
  const uniq = [...new Map(regs.map((r) => [r._hash, r])).values()];
  for (let i = 0; i < uniq.length; i += LOTE) {
    const p = uniq.slice(i, i + LOTE); const c = (f) => p.map((x) => x[f] ?? null);
    await q(`insert into folha_servidores_aplpessoal
      (cod_ibge,municipio,uf,entidade,competencia,nome,matricula,cargo,secretaria,data_admissao,
       data_demissao,carga_horaria,salario_base,bruto,_hash)
      select * from unnest($1::text[],$2::text[],$3::text[],$4::text[],$5::text[],$6::text[],$7::text[],
        $8::text[],$9::text[],$10::text[],$11::text[],$12::text[],$13::numeric[],$14::numeric[],$15::text[])
      on conflict (_hash) do update set cargo=excluded.cargo, secretaria=excluded.secretaria,
        salario_base=excluded.salario_base, bruto=excluded.bruto, _coletado_em=now()`,
      [c("cod_ibge"), c("municipio"), c("uf"), c("entidade"), c("competencia"), c("nome"), c("matricula"),
       c("cargo"), c("secretaria"), c("data_admissao"), c("data_demissao"), c("carga_horaria"),
       c("salario_base"), c("bruto"), c("_hash")]);
  }
  return uniq.length;
}

// alvos: municípios da UF sem folha, com os hosts lidos do site oficial
const tabs = (await q(`select table_name t from information_schema.tables where table_schema='public'
  and table_name like 'folha_servidores_%'`)).rows.map((r) => r.t);
const partes = [];
for (const t of tabs) {
  const ok = (await q(`select 1 from information_schema.columns where table_name=$1 and column_name='cod_ibge'`, [t])).rowCount;
  // ⚠️ pular a própria tabela: senão o REFAZ vem com fila vazia e o coletor não consegue se corrigir
  if (ok && t !== "folha_servidores_aplpessoal") partes.push(`select distinct left(cod_ibge::text,7) c from ${t}`);
}
const alvos = (await q(`
  with col as (${partes.join(" union ")})
  select m.cod_ibge, m.nome municipio, m.uf,
         (select array_agg(distinct split_part(split_part(split_part(l,'|',2),'//',2),'/',1))
            from site_municipal_links s cross join lateral jsonb_array_elements_text(s.links) l
           where s.cod_ibge=m.cod_ibge and split_part(l,'|',2) ~ '^https?://') hosts
    from municipios_br m left join col c on c.c=m.cod_ibge
   where m.uf=$1 and c.c is null ${SO ? "and m.nome ilike '%'||$2||'%'" : ""}
   order by m.nome`, SO ? [UF, SO] : [UF])).rows;
const feitos = REFAZ ? new Set()
  : new Set((await q(`select cod_ibge from folha_aplpessoal_coleta where situacao='ok'`)).rows.map((r) => r.cod_ibge));
const fila = alvos.filter((a) => !feitos.has(a.cod_ibge));
console.log(`[aplpessoal/${UF}] ${fila.length} municípios na fila`);

const slug = (n) => n.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");

let i = 0, ok = 0, semPortal = 0, erros = 0, total = 0;
async function trab() {
  while (i < fila.length) {
    const a = fila[i++];
    const marca = (situacao, detalhe, host = null, comp = null, ents = null, n = 0) =>
      q(`insert into folha_aplpessoal_coleta (cod_ibge,municipio,host,competencia,entidades,linhas,situacao,detalhe,em)
         values ($1,$2,$3,$4,$5,$6,$7,$8,now()) on conflict (cod_ibge) do update set host=excluded.host,
         competencia=excluded.competencia, entidades=excluded.entidades, linhas=excluded.linhas,
         situacao=excluded.situacao, detalhe=excluded.detalhe, em=now()`,
        [a.cod_ibge, a.municipio, host, comp, ents, n, situacao, detalhe]);
    try {
      const s = slug(a.municipio);
      const cand = [...new Set([...(a.hosts || []).filter((h) => /\.gov\.br$/i.test(h || "")),
        `transparencia.${s}.${UF.toLowerCase()}.gov.br`, `${s}.${UF.toLowerCase()}.gov.br`])];
      let base = null, home = null, cookie = "";
      for (const h of cand) {
        for (const esq of ["https", "http"]) {
          const b = `${esq}://${h}/transparencia`;
          const r = await req(`${b}/index.php?link=aplicacoes/pessoal/frmpessoal`, { tent: 1 });
          if (r && /cbx_entidade/.test(r.txt)) { base = b; home = r.txt; cookie = r.cookie; break; }
        }
        if (base) break;
      }
      if (!base) { await marca("sem_portal", "nenhum host tem aplicacoes/pessoal"); semPortal++; continue; }

      const form = (home.match(/<form[^>]*sessaoprincipal\.php[\s\S]*?<\/form>/i) || [""])[0];
      // ⚠️ `value = "x"` com espaços — o regex tem de tolerar
      const opts = (nome) => [...form.matchAll(new RegExp(`<select[^>]*name="${nome}"[\\s\\S]*?</select>`, "gi"))]
        .flatMap((m) => [...m[0].matchAll(/value\s*=\s*"([^"]*)"[^>]*>([^<]*)</g)].map((x) => [x[1], sem(x[2])]))
        .filter((x) => x[0] && x[0] !== "0");
      const entidades = opts("cbx_entidade").filter((e) => !/c[âa]mara/i.test(e[1]));
      const meses = opts("cbxmes").map((x) => x[0]).filter((x) => /^\d{2}$/.test(x));
      const estabs = opts("cbx_estabelecimento").map((x) => x[0]);
      if (!entidades.length || !meses.length) { await marca("sem_combos", `ent=${entidades.length} meses=${meses.length}`, base); erros++; continue; }

      const regs = []; const usados = [];
      for (const [entCod, entNome] of entidades) {
        const entNum = String(Number(entCod));
        // mede cada mês pelo recordsTotal (barato: length=1) e escolhe a competência
        const med = [];
        for (const ano of [ANO_MAX, ANO_MAX - 1]) {
          for (const mes of meses) {
            const rt = await req(`${base}/query/busca_tipo.php`, { cookie, tent: 1,
              body: new URLSearchParams({ cbx_entidade: entCod, cbx_ano: String(ano), cbxmes: mes }) });
            if (!rt) continue;
            const tipos = [...rt.txt.matchAll(/value\s*=\s*"(\d+)"[^>]*>([^<]*)</g)].map((x) => [x[1], sem(x[2])]);
            const ref = (tipos.find((t) => /folha\s*mensal/i.test(t[1])) || tipos.find((t) => /folha/i.test(t[1])) || [])[0];
            if (!ref) continue;
            const rc = await req(`${base}/aplicacoes/pessoal/processing.php`, { cookie, tent: 1,
              body: corpoDT({ ref, entidade: entNum, estab: estabs[0] ?? "", length: 1 }) });
            let n = 0; try { n = JSON.parse(rc.txt).recordsTotal || 0; } catch { n = 0; }
            if (n) med.push({ ano, mes, ref, n });
            if (med.length >= 4) break;
          }
          if (med.length) break;
        }
        if (!med.length) continue;
        const teto = Math.max(...med.map((x) => x.n));
        const cheios = med.filter((x) => x.n >= teto * 0.85);
        const esc = cheios.sort((x, y) => y.ano - x.ano || Number(y.mes) - Number(x.mes))[0];
        const comp = `${esc.ano}${esc.mes}`;
        const rd = await req(`${base}/aplicacoes/pessoal/processing.php`, { cookie,
          body: corpoDT({ ref: esc.ref, entidade: entNum, estab: estabs[0] ?? "", length: 5000 }) });
        let linhas = [];
        try { linhas = JSON.parse(rd.txt).data || []; } catch { linhas = []; }
        if (!linhas.length) continue;
        usados.push(`${entNome}:${linhas.length}`);
        for (const l of linhas) {
          const g = (k) => (l[k] == null ? null : sem(l[k]) || null);
          regs.push({ cod_ibge: a.cod_ibge, municipio: a.municipio, uf: a.uf, entidade: entNome, competencia: comp,
            matricula: g(1), nome: g(2), data_admissao: g(4), data_demissao: g(5), cargo: g(6),
            secretaria: g(7), carga_horaria: g(8), salario_base: num(l[9]), bruto: num(l[10]),
            _hash: crypto.createHash("md5").update([a.cod_ibge, comp, entCod, g(1), g(2), g(6)].join("|")).digest("hex") });
        }
      }
      if (!regs.length) { await marca("vazio", "nenhuma entidade devolveu linhas", base); erros++; continue; }
      const n = await grava(regs);
      total += n; ok++;
      await marca("ok", usados.join(" · ").slice(0, 200), base, regs[0].competencia, entidades.length, n);
      console.log(`  ✔ ${a.municipio}: ${n} servidores · ${regs[0].competencia} · ${usados.join(" · ").slice(0, 60)}`);
    } catch (e) {
      erros++; await marca("erro", String(e.message).slice(0, 140));
      console.log(`  ✖ ${a.municipio}: ${String(e.message).slice(0, 60)}`);
    }
  }
}
await Promise.all(Array.from({ length: CONC }, trab));

console.log(`\n[aplpessoal/${UF}] ${total.toLocaleString("pt-BR")} linhas · ${ok} municípios · ${semPortal} sem portal · ${erros} erros`);
console.table((await q(`select situacao, count(*) n, sum(linhas) linhas from folha_aplpessoal_coleta group by 1 order by 2 desc`)).rows);
console.table((await q(`select count(distinct cod_ibge) municipios, count(*) linhas,
  count(*) filter (where bruto>0) com_valor, count(*) filter (where secretaria is not null and secretaria<>'') com_lotacao,
  round(avg(bruto)::numeric,2) media_bruto, count(distinct competencia) comps from folha_servidores_aplpessoal`)).rows);
await db.end();
