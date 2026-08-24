// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
// ingest_folha_siapapi.mjs — quadro NOMINAL de servidores (nome · cargo · LOTAÇÃO) do portal SIAP e-GOV novo,
// pela API REST PÚBLICA. Sem navegador: é JSON direto.
//
// Produto: SIAP e-GOV / GeoSIAP, portal Angular em `{host}/portal-transparencia/`. Serve `{mun}.geosiap.net.br`,
// `siapegov.{mun}.sp.gov.br` e instalações próprias (Jacareí: front em egov., API em siap.).
// ⚠️ Não confundir com `ingest_folha_geosiap.mjs`, que fala a interface ANTIGA (`websis`). Aqui é o portal novo.
//
// ⭐ COMO O ENDPOINT FOI ACHADO (o método, porque chutar nome custou 19 tentativas em vão): a tela só dispara a
// consulta ao clicar **"Pesquisar"** — aí a chamada aparece inteira no tráfego. Regra que já estava escrita e eu
// desrespeitei: copiar a requisição do app, não adivinhá-la ([[pnigp-betha-folha-nominal-nacional]]).
//   GET {host}/portal-transparencia/api/rh/servidores/servidores_ativos?competencia=AAAA-MM-01&id_entidade=N&tipo=ativos
//   → { servidores_ativos: [ {matricula, nome, dt_admissao, secretaria, lotacao, horas_semanais, cargo} ] }
//   GET .../api/sis_entidade → entidades (principal='1' é a PREFEITURA; as demais são câmara/autarquias)
//   GET .../api/rh/rh_competencia → anos disponíveis
//
// ⛔ NÃO TEM VALOR INDIVIDUAL: o módulo público lista o quadro e a "estrutura remuneratória" é só a TABELA por
// nível (`rh/estruturas_remuneratorias`), que é tabela de vencimentos, não folha. Município entra como
// "coletado sem valor" — e isso é limite da FONTE, não da coleta.
//
// Uso: UF=SP node scripts/ingest_folha_siapapi.mjs · SO=Jacareí · REFAZ=1 · HOST=... MUN=...
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
import crypto from "crypto";
import { pool, withRetry } from "./_cadprev.mjs";

const db = pool();
const q = withRetry(db);
const SO = process.env.SO || null;
const RECUO = Number(process.env.RECUO || 8);      // meses a testar, do fechado para trás
const H = { accept: "application/json", "user-agent": "Mozilla/5.0 (compatible; PNIGP/1.0; pesquisa de dados publicos)" };
const dorme = (ms) => new Promise((s) => setTimeout(s, ms));

await q(`create table if not exists folha_servidores_siapapi (
  cod_ibge text, municipio text, uf text, host text, entidade text, competencia text,
  matricula text, nome text, cargo text, secretaria text, lotacao text, horas_semanais text, data_admissao text,
  _hash text primary key, _coletado_em timestamptz default now()
)`);
await q(`create index if not exists ix_folha_siapapi_mun on folha_servidores_siapapi (cod_ibge, competencia)`);
await q(`create table if not exists folha_siapapi_coleta (
  cod_ibge text primary key, municipio text, uf text, host text, entidade text, competencia text,
  linhas int, situacao text, detalhe text, em timestamptz default now()
)`);

const pega = async (url) => {
  for (let t = 0; t < 3; t++) {
    try {
      const r = await fetch(url, { headers: H, signal: AbortSignal.timeout(60000) });
      if (r.ok) return await r.json();
      if (r.status >= 500 && t < 2) { await dorme(2000 * (t + 1)); continue; }
      return null;
    } catch { await dorme(2000 * (t + 1)); }
  }
  return null;
};

// ── alvos: hosts com `/portal-transparencia/` (o portal NOVO) ────────────────────────────────────────────────
let alvos;
if (process.env.HOST) {
  const mun = (await q(`select cod_ibge, nome, uf from municipios_br where lower(nome)=lower($1) ${process.env.UF ? "and uf=$2" : ""} limit 1`,
    process.env.UF ? [process.env.MUN, process.env.UF] : [process.env.MUN])).rows[0];
  alvos = [{ ...mun, host: process.env.HOST }];
} else {
  const par = [];
  const pref = { SP: "35", PR: "41", RS: "43", SC: "42", MG: "31", RJ: "33" }[process.env.UF || ""] || null;
  const fUF = pref ? `and left(x.cod_ibge,2) = $${par.push(pref)}` : "";
  const fSO = SO ? `and x.municipio ilike '%'||$${par.push(SO)}||'%'` : "";
  alvos = (await q(`
    select distinct on (x.cod_ibge) x.cod_ibge, x.municipio nome, x.uf,
           (regexp_match(x.url, '^https?://([^/]+)/'))[1] host
      from (
        select cod_ibge, municipio, uf, url_portal_real url from portal_real_descoberto
         where url_portal_real ~* '/portal-transparencia'
        union all
        select cod_ibge, municipio, 'SP', coalesce(url_pessoal, url_visitada) from folha_diagnostico_faltante
         where coalesce(url_pessoal, url_visitada) ~* '/portal-transparencia'
        union all
        -- confirmados pela varredura _sp_siap_descobre.mjs, que só aceita host cuja API declara a ENTIDADE com
        -- o nome do município (pegou ferrazdevasconcelos.geosiap.net.br declarando "PREFEITURA DE TAUBATÉ")
        select cod_ibge, municipio, uf, 'https://'||host||'/portal-transparencia/' from siapapi_portal
      ) x
     where 1=1 ${fUF} ${fSO}
     order by x.cod_ibge, x.url`, par)).rows.filter((a) => a.host);
}
const feitos = process.env.REFAZ === "1" ? new Set()
  : new Set((await q(`select cod_ibge from folha_siapapi_coleta where situacao='ok'`)).rows.map((r) => r.cod_ibge));
const fila = alvos.filter((a) => a.cod_ibge && !feitos.has(a.cod_ibge));
console.log(`[siapapi] ${alvos.length} portais · ${fila.length} na fila`);

const LOTE = 1000;
async function grava(regs) {
  const m = new Map(); for (const r of regs) m.set(r._hash, r);
  const arr = [...m.values()];
  for (let i = 0; i < arr.length; i += LOTE) {
    const p = arr.slice(i, i + LOTE); const c = (f) => p.map((x) => x[f]);
    await q(`insert into folha_servidores_siapapi
      (cod_ibge,municipio,uf,host,entidade,competencia,matricula,nome,cargo,secretaria,lotacao,horas_semanais,data_admissao,_hash)
      select * from unnest($1::text[],$2::text[],$3::text[],$4::text[],$5::text[],$6::text[],$7::text[],$8::text[],
        $9::text[],$10::text[],$11::text[],$12::text[],$13::text[],$14::text[])
      on conflict (_hash) do update set _coletado_em=now()`,
      [c("cod_ibge"), c("municipio"), c("uf"), c("host"), c("entidade"), c("competencia"), c("matricula"), c("nome"),
       c("cargo"), c("secretaria"), c("lotacao"), c("horas_semanais"), c("data_admissao"), c("_hash")]);
  }
}

// competências a testar: do mês FECHADO para trás (o corrente vem vazio — foi o que escondeu o endpoint)
const COMPETENCIAS = (() => {
  const out = []; const d0 = new Date(); d0.setDate(1); d0.setMonth(d0.getMonth() - 1);
  for (let k = 0; k < RECUO; k++) { const d = new Date(d0); d.setMonth(d0.getMonth() - k);
    out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`); }
  return out;
})();

let totalGeral = 0, ok = 0, vazios = 0, falhas = 0;
for (let i = 0; i < fila.length; i++) {
  const a = fila[i];
  const base = `https://${a.host}/portal-transparencia/api`;
  const marca = (situacao, detalhe, linhas = 0, comp = null, ent = null) =>
    q(`insert into folha_siapapi_coleta (cod_ibge,municipio,uf,host,entidade,competencia,linhas,situacao,detalhe,em)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,now()) on conflict (cod_ibge) do update set host=excluded.host,
       entidade=excluded.entidade, competencia=excluded.competencia, linhas=excluded.linhas,
       situacao=excluded.situacao, detalhe=excluded.detalhe, em=now()`,
      [a.cod_ibge, a.nome, a.uf, a.host, ent, comp, linhas, situacao, detalhe]);
  try {
    // 🚨 a ENTIDADE não é sempre 1: o combo lista prefeitura, câmara, autarquias. Pegar a marcada `principal`
    // (ou cujo nome diz "prefeitura") evita coletar a CÂMARA no lugar do município
    // ([[pnigp-entidade-espelho-infla-folha]]).
    const ents = await pega(`${base}/sis_entidade`);
    if (!Array.isArray(ents) || !ents.length) throw new Error("sis_entidade não respondeu (portal não é SIAP novo)");
    const pref = ents.find((e) => String(e.principal) === "1")
      || ents.find((e) => /prefeitura/i.test(e.ds_entidade || ""))
      || ents[0];
    const idEnt = pref.id_entidade;

    // 🚨 RECUO FIXO NÃO BASTA: Niterói tem o módulo com anos só até 2024 — 8 meses para trás nunca chegam lá e o
    // município sai "vazio" como se não publicasse. A própria API diz quais anos existem (`rh/rh_competencia`);
    // se o ano mais recente for anterior ao corrente, varre os 12 meses DELE. Mesma família do recuo que ignorava
    // a virada de ano no SMARAPD.
    let competencias = COMPETENCIAS;
    const anos = await pega(`${base}/rh/rh_competencia`);
    if (Array.isArray(anos) && anos.length) {
      const maior = Math.max(...anos.map((x) => Number(x.cp_ano)).filter(Number.isFinite));
      if (Number.isFinite(maior) && maior < new Date().getFullYear())
        competencias = Array.from({ length: 12 }, (_, k) => `${maior}-${String(12 - k).padStart(2, "0")}-01`);
    }

    let melhor = null;
    for (const comp of competencias) {
      const j = await pega(`${base}/rh/servidores/servidores_ativos?competencia=${comp}&id_entidade=${encodeURIComponent(idEnt)}&tipo=ativos`);
      const arr = j && Array.isArray(j.servidores_ativos) ? j.servidores_ativos : [];
      if (arr.length && (!melhor || arr.length > melhor.arr.length)) melhor = { comp, arr };
      if (melhor && melhor.arr.length && arr.length && arr.length < melhor.arr.length * 0.5) break; // já passou do pico
      if (melhor && COMPETENCIAS.indexOf(comp) >= 2 && melhor.arr.length) break;
    }
    if (!melhor) { await marca("vazio", `sem servidores em ${competencias.length} competências`, 0, null, pref.ds_entidade); vazios++; console.log(`  ✖ [${i + 1}/${fila.length}] ${a.nome}: vazio`); continue; }

    const competencia = melhor.comp.slice(0, 7).replace("-", "");
    const regs = melhor.arr.map((s) => ({
      cod_ibge: a.cod_ibge, municipio: a.nome, uf: a.uf, host: a.host, entidade: pref.ds_entidade, competencia,
      matricula: s.matricula || null, nome: s.nome || null, cargo: s.cargo || null,
      secretaria: (s.secretaria || s.lotacao || null) || null, lotacao: s.lotacao || null,
      horas_semanais: s.horas_semanais || null, data_admissao: s.dt_admissao || null,
      _hash: crypto.createHash("md5").update([a.cod_ibge, competencia, s.matricula, s.nome, s.cargo].join("¦")).digest("hex"),
    }));
    await grava(regs);
    const n = new Set(regs.map((r) => r._hash)).size;
    await marca("ok", `competência ${competencia}`, n, competencia, pref.ds_entidade);
    ok++; totalGeral += n;
    console.log(`  [${i + 1}/${fila.length}] ${a.uf} ${a.nome}: ${n} servidores (${competencia}, ${pref.ds_entidade})`);
  } catch (e) {
    await marca("erro", String(e.message).slice(0, 200)); falhas++;
    console.log(`  ✖ [${i + 1}/${fila.length}] ${a.nome}: ${String(e.message).slice(0, 70)}`);
  }
}
console.log(`\n[siapapi] ${totalGeral.toLocaleString("pt-BR")} servidores · ${ok} ok · ${vazios} vazios · ${falhas} falhas`);
await db.end();
