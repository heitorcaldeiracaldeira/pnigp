// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════
// ingest_folha_portalnovo.mjs — folha do "Portal da Transparência /novo" (Laravel + Inertia + Vue),
// o sucessor do portal PHP `aplicacoes/pessoal`. Em RO atende Ji-Paraná, Ouro Preto do Oeste, Pimenta Bueno…
//
// ⭐ ENTREGA OS CINCO CAMPOS, e ainda separa lotação de local de trabalho:
//    MATRICULA · NOME · DTADMISSAO · NOMECARGO · **NOMEUNIDADE** (lotação) · LOCAL_TRABALHO ·
//    SITUACAO_FUNCIONAL · HORASEMANAL · **VALORSALARIO** · **TOTALPROVENTOS**
//
// ⛏️ COMO SE TIRA O DADO — e por que quase desisti três vezes:
//   • A rota `novo/{entidade}/{exercicio}/{menu}/recursos-humanos/folha-pagamento` responde 200 para
//     QUALQUER id, porque é uma SPA: o HTML é sempre a mesma casca de 230 KB. Testar status não prova nada.
//   • Tentei `Accept: application/json` → devolve HTML. Tentei `X-Inertia: true` → **409**, porque falta o
//     `x-inertia-version`. Perdi tempo nos dois.
//   • ⭐ A saída é o atributo **`data-page`** do HTML: o Inertia embute ali TODAS as props em JSON, inclusive
//     `servidores` já paginado. Não precisa de header nenhum — só desescapar `&quot;` e dar JSON.parse.
//   • `?perPage=5000` traz a folha inteira numa requisição (3.506 linhas em Ji-Paraná).
//
// A lista de entidades vem da API de dados abertos do próprio portal (`/api/empresas/{ano}`), que traz
// `TIPO` — 1 = Prefeitura, 2 = **Câmara** (excluída: câmara misturada com prefeitura contamina o município).
// ⚠️ Essa API de dados abertos cobre despesa/receita/contratos e **não tem rota de pessoal** — a folha só
//    existe pela via web acima. Ler o `/docs` e concluir "não publica folha" seria erro.
//
// Uso: UF=RO node scripts/ingest_folha_portalnovo.mjs   ·   SO=Ji-Paraná   ·   REFAZ=1   ·   CONC=4
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
const H = { accept: "text/html", "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36" };

await q(`create table if not exists folha_servidores_portalnovo (
  cod_ibge text, municipio text, uf text, entidade text, competencia text,
  nome text, cpf_masc text, matricula text, cargo text, secretaria text, departamento text,
  vinculo text, classe_nivel text, situacao text, data_admissao text, data_demissao text, carga_horaria text,
  salario_base numeric, gratificacoes numeric, outros numeric, ferias numeric, decimo numeric,
  bruto numeric, descontos numeric, liquido numeric,
  _hash text primary key, _coletado_em timestamptz default now())`);
await q(`create index if not exists ix_folha_portalnovo_mun on folha_servidores_portalnovo (cod_ibge)`);
await q(`create table if not exists folha_portalnovo_coleta (
  cod_ibge text primary key, municipio text, host text, competencia text,
  entidades int, linhas int, situacao text, detalhe text, em timestamptz default now())`);

const num = (v) => { const m = String(v ?? "").match(/(-?[\d.]+),(\d{2})/); if (!m) return null;
  const n = parseFloat(m[1].replace(/\./g, "") + "." + m[2]); return Number.isFinite(n) ? n : null; };

async function pega(u, tent = 2) {
  for (let k = 0; k < tent; k++) {
    try {
      const r = await fetch(u, { headers: H, redirect: "follow", signal: AbortSignal.timeout(300000) });
      if (r.status >= 400) return null;
      return await r.text();
    } catch { if (k === tent - 1) return null; }
  }
  return null;
}
// ⭐ o Inertia embute as props no atributo data-page — é daqui que sai tudo
function props(html) {
  const m = html && html.match(/data-page="([\s\S]*?)"\s*>/);
  if (!m) return null;
  try {
    return JSON.parse(m[1].replace(/&quot;/g, '"').replace(/&#039;/g, "'")
      .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&")).props || null;
  } catch { return null; }
}

const LOTE = 700;
async function grava(regs) {
  const uniq = [...new Map(regs.map((r) => [r._hash, r])).values()];
  for (let i = 0; i < uniq.length; i += LOTE) {
    const p = uniq.slice(i, i + LOTE); const c = (f) => p.map((x) => x[f] ?? null);
    await q(`insert into folha_servidores_portalnovo
      (cod_ibge,municipio,uf,entidade,competencia,nome,matricula,cargo,secretaria,departamento,vinculo,
       situacao,data_admissao,data_demissao,carga_horaria,salario_base,bruto,_hash)
      select * from unnest($1::text[],$2::text[],$3::text[],$4::text[],$5::text[],$6::text[],$7::text[],
        $8::text[],$9::text[],$10::text[],$11::text[],$12::text[],$13::text[],$14::text[],$15::text[],
        $16::numeric[],$17::numeric[],$18::text[])
      on conflict (_hash) do update set cargo=excluded.cargo, secretaria=excluded.secretaria,
        salario_base=excluded.salario_base, bruto=excluded.bruto, _coletado_em=now()`,
      [c("cod_ibge"), c("municipio"), c("uf"), c("entidade"), c("competencia"), c("nome"), c("matricula"),
       c("cargo"), c("secretaria"), c("departamento"), c("vinculo"), c("situacao"), c("data_admissao"),
       c("data_demissao"), c("carga_horaria"), c("salario_base"), c("bruto"), c("_hash")]);
  }
  return uniq.length;
}

const tabs = (await q(`select table_name t from information_schema.tables where table_schema='public'
  and table_name like 'folha_servidores_%'`)).rows.map((r) => r.t);
const partes = [];
for (const t of tabs) {
  const ok = (await q(`select 1 from information_schema.columns where table_name=$1 and column_name='cod_ibge'`, [t])).rowCount;
  if (ok && t !== "folha_servidores_portalnovo") partes.push(`select distinct left(cod_ibge::text,7) c from ${t}`);
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
  : new Set((await q(`select cod_ibge from folha_portalnovo_coleta where situacao='ok'`)).rows.map((r) => r.cod_ibge));
const fila = alvos.filter((a) => !feitos.has(a.cod_ibge));
console.log(`[portalnovo/${UF}] ${fila.length} municípios na fila`);

const slug = (n) => n.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");

let i = 0, ok = 0, semPortal = 0, erros = 0, total = 0;
async function trab() {
  while (i < fila.length) {
    const a = fila[i++];
    const marca = (situacao, detalhe, host = null, comp = null, ents = null, n = 0) =>
      q(`insert into folha_portalnovo_coleta (cod_ibge,municipio,host,competencia,entidades,linhas,situacao,detalhe,em)
         values ($1,$2,$3,$4,$5,$6,$7,$8,now()) on conflict (cod_ibge) do update set host=excluded.host,
         competencia=excluded.competencia, entidades=excluded.entidades, linhas=excluded.linhas,
         situacao=excluded.situacao, detalhe=excluded.detalhe, em=now()`,
        [a.cod_ibge, a.municipio, host, comp, ents, n, situacao, detalhe]);
    try {
      const s = slug(a.municipio);
      const cand = [...new Set([...(a.hosts || []).filter((h) => /\.gov\.br$/i.test(h || "")),
        `transparencia.${s}.${UF.toLowerCase()}.gov.br`, `${s}.${UF.toLowerCase()}.gov.br`])];
      let base = null;
      for (const h of cand) {
        for (const esq of ["https", "http"]) {
          // ⭐ `/novo/webhook/info` identifica o produto sem ambiguidade (a rota da folha responde 200 sempre)
          const t = await pega(`${esq}://${h}/novo/webhook/info`, 1);
          if (t && /"version"/.test(t) && /Transpar/i.test(t)) { base = `${esq}://${h}`; break; }
        }
        if (base) break;
      }
      if (!base) { await marca("sem_portal", "nenhum host tem /novo/webhook/info"); semPortal++; continue; }

      let emps = [];
      for (const ano of [ANO_MAX, ANO_MAX - 1]) {
        const t = await pega(`${base}/api/empresas/${ano}`, 1);
        try { emps = JSON.parse(t) || []; } catch { emps = []; }
        if (emps.length) break;
      }
      // ⚠️ TIPO 2 = Câmara — fora. Misturar câmara com prefeitura já contaminou município noutra UF.
      const alvosEnt = emps.filter((e) => String(e.TIPO) !== "2" && !/c[âa]mara/i.test(e.NOME || ""));
      if (!alvosEnt.length) { await marca("sem_entidades", `api/empresas devolveu ${emps.length}`, base); erros++; continue; }

      const regs = []; const usados = []; let comp = null;
      // 🚨 ESPELHO: este portal ACEITA qualquer {entidade} na URL e devolve sempre a MESMA lista. Sem esta
      // guarda, Ji-Paraná entrava com 14.024 servidores — 3.506 repetidos 4×, um por autarquia. A impressão
      // seria de um município 4× maior. Impressão digital = quantidade + 1ª e última matrícula.
      const digitais = new Set();
      for (const e of alvosEnt) {
        const u = `${base}/novo/${e.EMPRESA}/${ANO_MAX}/1/recursos-humanos/folha-pagamento?perPage=5000&page=1`;
        const pr = props(await pega(u));
        const lista = pr?.servidores?.data || (Array.isArray(pr?.servidores) ? pr.servidores : []);
        if (!lista.length) continue;
        // 🚨 O portal abre na referência que ELE escolhe — e em Corumbiara a única disponível é "Rescisão":
        // 12 desligamentos que entrariam como se fossem a folha de 524 servidores. Só aceito quando a
        // referência é FOLHA. ⚠️ Rescisão/13º/férias não são a folha do mês.
        const refs = pr?.referencias || pr?.tipoReferenciaSip || [];
        const tipoAtual = refs.find((x) => String(x.CODIGO) === String(lista[0]?.REFERENCIA));
        const nomeRef = String(tipoAtual?.TIPONOME || lista[0]?.REFERENCIA_NOME || "");
        if (nomeRef && !/folha/i.test(nomeRef)) {
          usados.push(`${(e.NOME || "").slice(0, 18)}:SÓ ${nomeRef.slice(0, 12)}`);
          continue;
        }
        const dig = `${lista.length}|${lista[0]?.MATRICULA}|${lista[lista.length - 1]?.MATRICULA}`;
        if (digitais.has(dig)) { usados.push(`${(e.NOME || "").slice(0, 20)}:ESPELHO`); continue; }
        digitais.add(dig);
        usados.push(`${(e.NOME || "").slice(0, 28)}:${lista.length}`);
        for (const l of lista) {
          const c = `${l.ANO}${l.MES}`;
          comp = comp || c;
          regs.push({ cod_ibge: a.cod_ibge, municipio: a.municipio, uf: a.uf, entidade: e.NOME, competencia: c,
            nome: l.NOME, matricula: String(l.MATRICULA ?? l.REGISTRO ?? ""), cargo: l.NOMECARGO,
            secretaria: l.NOMEUNIDADE, departamento: l.LOCAL_TRABALHO, vinculo: l.SITUACAO_FUNCIONAL,
            situacao: l.APOSENTADO === "S" ? "Aposentado" : "Ativo",
            data_admissao: l.DTADMISSAO, data_demissao: l.DTDEMISSAO, carga_horaria: String(l.HORASEMANAL ?? ""),
            salario_base: num(l.VALORSALARIO), bruto: num(l.TOTALPROVENTOS),
            _hash: crypto.createHash("md5")
              .update([a.cod_ibge, c, e.EMPRESA, l.REGISTRO, l.MATRICULA, l.NOME, l.CARGO].join("|")).digest("hex") });
        }
      }
      if (!regs.length) { await marca("vazio", "nenhuma entidade devolveu servidores", base); erros++; continue; }
      const n = await grava(regs);
      total += n; ok++;
      await marca("ok", usados.join(" · ").slice(0, 200), base, comp, alvosEnt.length, n);
      console.log(`  ✔ ${a.municipio}: ${n} servidores · ${comp} · ${usados.join(" · ").slice(0, 70)}`);
    } catch (e) {
      erros++; await marca("erro", String(e.message).slice(0, 140));
      console.log(`  ✖ ${a.municipio}: ${String(e.message).slice(0, 60)}`);
    }
  }
}
await Promise.all(Array.from({ length: CONC }, trab));

console.log(`\n[portalnovo/${UF}] ${total.toLocaleString("pt-BR")} linhas · ${ok} municípios · ${semPortal} sem portal · ${erros} erros`);
console.table((await q(`select situacao, count(*) n, sum(linhas) linhas from folha_portalnovo_coleta group by 1 order by 2 desc`)).rows);
console.table((await q(`select count(distinct cod_ibge) municipios, count(*) linhas,
  count(*) filter (where bruto>0) com_valor, count(*) filter (where secretaria is not null and secretaria<>'') com_lotacao,
  round(avg(bruto)::numeric,2) media_bruto, count(distinct competencia) comps from folha_servidores_portalnovo`)).rows);
await db.end();
