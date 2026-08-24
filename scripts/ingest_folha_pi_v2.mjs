// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════
// ingest_folha_pi_v2.mjs — FOLHA (com valor) dos municípios do PIAUÍ que rodam o portal "v2".
//
// A FONTE: `GET https://{host}/v2/servidores.json?skip=&take=&requireTotalCount=true`
// É o DataSource de um DevExpress DataGrid. Devolve JSON puro, sem token, sem POST, sem navegador:
//   { totalCount: 317, data: [{ id, matricula, nomeServidor, remuneracaoLiquida, nomeDoCargo, ano, mes }] }
//
// 🚨 COMO ESTE CAMINHO APARECEU — e por que o visitador não o tinha visto:
// o visitador por navegador marcava `tem_valor=false` no PI inteiro porque procurava "remuneração" no <th>.
// No v2 NÃO HÁ <th>: o DevExpress monta o cabeçalho em <div>, e a coluna "Rem. Líquida" some da leitura.
// Barro Duro, dado como "sem valor", publica R$ de 317 servidores. ⚠️ Ler rótulo de coluna não é ler dado
// ([[pnigp-marca-nao-esta-na-descricao]] é o mesmo erro noutro assunto).
//
// ⚠️ O QUE FALTA NESTA FONTE: **não há LOTAÇÃO nem CPF**. São 3 dos 5 campos (nome · cargo · remuneração).
// Fica registrado na coluna `entidade` de onde veio; quem precisar de lotação no PI tem de ir a outra fonte.
//
// ⚠️ COMPETÊNCIA: o JSON devolve UMA competência — a que o portal exibe por padrão. Medido em ago/2026:
// vai de Janeiro a Junho de 2026 conforme o município. É dado corrente ([[feedback-nao-usar-dado-antigo]]),
// mas a competência VARIA por município e por isso é gravada linha a linha, nunca assumida.
//
// A lista de alvos sai de `pi_v2_sonda` + `pi_host_censo` (as duas sondas que acharam o endpoint).
// Uso: node scripts/ingest_folha_pi_v2.mjs   ·   SO=Altos   ·   REFAZ=1   ·   CONC=6
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
import crypto from "crypto";
import { pool, withRetry } from "./_cadprev.mjs";

const db = pool(); const q = withRetry(db);
const SO = process.env.SO || null;
const REFAZ = process.env.REFAZ === "1";
const CONC = Number(process.env.CONC || 6);
const PAG = Number(process.env.PAG || 500);   // take=5000 estoura 60s em Altos (2.602); 500 passa folgado
const H = { "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  accept: "application/json", "x-requested-with": "XMLHttpRequest" };

await q(`create table if not exists folha_servidores_piv2 (
  cod_ibge text, municipio text, uf text default 'PI', entidade text, competencia text,
  nome text, cpf_masc text, matricula text, cargo text, secretaria text, departamento text,
  vinculo text, classe_nivel text, situacao text, data_admissao text,
  salario_base numeric, gratificacoes numeric, outros numeric, ferias numeric, decimo numeric,
  bruto numeric, descontos numeric, liquido numeric,
  _hash text primary key, _coletado_em timestamptz default now())`);
await q(`create index if not exists ix_folha_piv2_mun on folha_servidores_piv2 (cod_ibge)`);
await q(`create table if not exists folha_piv2_coleta (
  cod_ibge text primary key, municipio text, url text, competencia text,
  linhas int, esperado int, situacao text, detalhe text, em timestamptz default now())`);

// alvos: união das duas sondas (uma chutou o host pelo slug, a outra usou os hosts reais lidos)
const alvos = (await q(`
  select cod_ibge, max(municipio) municipio, max(url) url from (
    select cod_ibge, municipio, url_json url from pi_v2_sonda where situacao='v2_json' and url_json is not null
    union all
    select cod_ibge, municipio, 'https://'||host||'/v2/servidores.json' from pi_host_censo where v2_json
  ) t ${SO ? "where municipio ilike '%'||$1||'%'" : ""} group by cod_ibge order by 2`, SO ? [SO] : [])).rows;
const feitos = REFAZ ? new Set()
  : new Set((await q(`select cod_ibge from folha_piv2_coleta where situacao='ok'`)).rows.map((r) => r.cod_ibge));
const fila = alvos.filter((a) => !feitos.has(a.cod_ibge));
console.log(`[pi-v2] ${alvos.length} municípios com endpoint · ${fila.length} na fila`);

const num = (v) => {
  if (v == null || v === "") return null;
  const s = String(v).replace(/[R$\s]/g, "");
  // o payload vem "1499.43" (ponto decimal), mas há portais devolvendo "1.499,43" — trato os dois
  const n = /,\d{1,2}$/.test(s) ? Number(s.replace(/\./g, "").replace(",", ".")) : Number(s);
  return Number.isFinite(n) ? n : null;
};

const LOTE = 700;
async function grava(regs) {
  const uniq = [...new Map(regs.map((r) => [r._hash, r])).values()];
  for (let i = 0; i < uniq.length; i += LOTE) {
    const p = uniq.slice(i, i + LOTE); const c = (f) => p.map((x) => x[f] ?? null);
    await q(`insert into folha_servidores_piv2
      (cod_ibge,municipio,entidade,competencia,nome,matricula,cargo,liquido,_hash)
      select * from unnest($1::text[],$2::text[],$3::text[],$4::text[],$5::text[],$6::text[],$7::text[],
        $8::numeric[],$9::text[])
      on conflict (_hash) do update set cargo=excluded.cargo, liquido=excluded.liquido, _coletado_em=now()`,
      [c("cod_ibge"), c("municipio"), c("entidade"), c("competencia"), c("nome"), c("matricula"),
       c("cargo"), c("liquido"), c("_hash")]);
  }
  return uniq.length;
}

async function puxa(url) {
  const out = []; let total = null;
  for (let skip = 0; ; skip += PAG) {
    const u = `${url}?skip=${skip}&take=${PAG}&requireTotalCount=true`;
    const r = await fetch(u, { headers: H, redirect: "follow", signal: AbortSignal.timeout(90000) });
    if (r.status >= 400) throw new Error(`HTTP ${r.status}`);
    const j = await r.json();
    const arr = Array.isArray(j) ? j : j.data || [];
    if (total == null) total = j.totalCount ?? arr.length;
    out.push(...arr);
    // duas paradas: página curta OU já tenho o esperado. Sem a 2ª, um portal que ignora `skip` gira eternamente.
    if (arr.length < PAG || out.length >= total) break;
    if (skip > 200000) break;
  }
  return { linhas: out, total };
}

let i = 0, ok = 0, erros = 0, total = 0;
async function trab() {
  while (i < fila.length) {
    const a = fila[i++];
    const marca = (situacao, detalhe, comp = null, n = 0, esp = null) =>
      q(`insert into folha_piv2_coleta (cod_ibge,municipio,url,competencia,linhas,esperado,situacao,detalhe,em)
         values ($1,$2,$3,$4,$5,$6,$7,$8,now()) on conflict (cod_ibge) do update set competencia=excluded.competencia,
         linhas=excluded.linhas, esperado=excluded.esperado, situacao=excluded.situacao, detalhe=excluded.detalhe, em=now()`,
        [a.cod_ibge, a.municipio, a.url, comp, n, esp, situacao, detalhe]);
    try {
      const d = await puxa(a.url);
      if (!d.linhas.length) { await marca("vazio", "endpoint respondeu sem linhas"); continue; }
      const host = new URL(a.url).hostname;
      const comps = [...new Set(d.linhas.map((x) => `${x.mes}/${x.ano}`))];
      const regs = d.linhas.map((x) => ({
        cod_ibge: a.cod_ibge, municipio: a.municipio, entidade: host,
        competencia: `${x.mes}/${x.ano}`,
        nome: x.nomeServidor ?? x.nome ?? null,
        matricula: x.matricula ?? null,
        cargo: x.nomeDoCargo ?? x.cargo ?? null,
        liquido: num(x.remuneracaoLiquida ?? x.remuneracao ?? x.liquido),
        _hash: crypto.createHash("md5")
          .update([a.cod_ibge, x.ano, x.mes, x.matricula, x.nomeServidor, x.id].join("|")).digest("hex"),
      }));
      const n = await grava(regs);
      total += n; ok++;
      await marca("ok", `comp: ${comps.join(" , ")}`, comps[0], n, d.total);
      console.log(`  ✔ ${a.municipio}: ${n} servidores · ${comps.join(" , ")}`);
    } catch (e) {
      erros++; await marca("erro", String(e.message).slice(0, 140));
      console.log(`  ✖ ${a.municipio}: ${String(e.message).slice(0, 60)}`);
    }
  }
}
await Promise.all(Array.from({ length: CONC }, trab));

console.log(`\n[pi-v2] ${total.toLocaleString("pt-BR")} linhas · ${ok} municípios · ${erros} erros`);
console.table((await q(`select count(distinct cod_ibge) municipios, count(*) linhas,
  count(*) filter (where liquido > 0) com_valor, round(avg(liquido)::numeric,2) media_liquido,
  count(distinct competencia) competencias from folha_servidores_piv2`)).rows);
console.table((await q(`select competencia, count(distinct cod_ibge) municipios, count(*) linhas
  from folha_servidores_piv2 group by 1 order by 2 desc`)).rows);
await db.end();
