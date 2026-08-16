// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
// ingest_folha_citta.mjs — folha nominal COM salário E SECRETARIA do bloco `citta` (Città), 14 municípios do RS.
//
// ⭐ É a fonte mais RICA do RS depois do Betha: entrega **lotação (secretaria) + cargo + valor + nome**, os três
// campos do pedido original ([[pnigp-folha-municipal-cinco-campos]]) — o que nem sys523 nem multi24 dão.
//
// COMO FOI ACHADO (o SPA não renderiza no headless e o Swagger dá 401): as rotas estão DENTRO do bundle
// RequireJS. Navegar com Playwright só para COLHER OS ARQUIVOS .js e depois procurar `api/public/pessoal` no
// texto deles revelou a API inteira sem precisar renderizar tela nenhuma. Os parâmetros obrigatórios saíram do
// próprio erro 500 (`Required Integer parameter 'X' is not present`), pedidos um a um.
//
// A API (host = {slug}.cittaweb.com.br):
//   GET /transparencia/api/public/pessoal/unidades                      → unidades gestoras (1=Prefeitura, 2=Câmara)
//   GET /transparencia/api/public/anos/folha                            → exercícios disponíveis
//   GET .../pessoal/folha/lotacoes?exercicio&mes&unidadeGestora         → LOTAÇÕES (secretarias) + quantidade
//   GET .../pessoal/folha/lotacao/servidores?…&codigo={lotacao}         → servidores daquela secretaria
//   GET .../pessoal/folha/funcoes?exercicio&mes&unidadeGestora          → CARGOS + quantidade
//   GET .../pessoal/folha/funcao/servidores?…&codigo={funcao}           → servidores daquele cargo (com valor)
// Cada servidor traz: codigo · matricula · servidor (nome) · cnpj (CPF mascarado) · regime · valor · padrao · classe.
//
// ⚠️ O CRUZAMENTO é por MATRÍCULA: a rota de lotação diz em que secretaria a pessoa está, a de função diz o cargo.
// Quem não casar entra com o lado que tiver — nunca se descarta servidor por falta do par.
//
// 🚨 O user-agent headless leva 403 na casca do SPA; a API responde normalmente com UA de navegador real.
//
// Uso: UF=RS node scripts/ingest_folha_citta.mjs
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
import crypto from "crypto";
import { pool, withRetry } from "./_cadprev.mjs";

const db = pool();
const q = withRetry(db);
const UF = process.env.UF || null;
const SO = process.env.SO || null;
const REFAZ = process.env.REFAZ === "1";
const UA = { "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  accept: "application/json" };

await q(`create table if not exists folha_servidores_citta (
  cod_ibge text, municipio text, uf text, unidade_gestora text, competencia text,
  matricula text, nome text, cpf_masc text, regime text, lotacao text, cargo text,
  padrao text, classe text, valor numeric,
  _hash text primary key, _coletado_em timestamptz default now()
)`);
await q(`create index if not exists ix_folha_citta_mun on folha_servidores_citta (cod_ibge, competencia)`);
await q(`create table if not exists folha_citta_coleta (
  cod_ibge text primary key, municipio text, uf text, host text, competencia text,
  linhas int, com_lotacao int, com_cargo int, situacao text, detalhe text, em timestamptz default now()
)`);

const alvos = (await q(`
  select s.cod_ibge, s.municipio, s.uf, coalesce(s.url_pessoal, s.url_base) url
    from folha_sonda_municipal s
   where coalesce(s.url_pessoal, s.url_base) ~ 'citta'
     ${UF ? "and s.uf = $1" : ""} ${SO ? `and s.municipio ilike '%'||$${UF ? 2 : 1}||'%'` : ""}
   order by s.municipio`, [UF, SO].filter(Boolean))).rows;
const feitos = new Set(REFAZ ? [] : (await q(`select cod_ibge from folha_citta_coleta where situacao='ok'`)).rows.map((r) => r.cod_ibge));
const fila = alvos.filter((a) => !feitos.has(a.cod_ibge));
console.log(`[citta] ${alvos.length} portais · ${feitos.size} já feitos · ${fila.length} na fila`);

const jget = async (url) => {
  const r = await fetch(url, { headers: UA, redirect: "follow", signal: AbortSignal.timeout(60000) });
  if (!r.ok) throw new Error(`HTTP ${r.status} em ${url.split("/api/public")[1] || url}`);
  return r.json();
};

let totalGeral = 0, ok = 0, falhas = 0;
for (let i = 0; i < fila.length; i++) {
  const a = fila[i];
  let host; try { host = new URL(a.url).origin; } catch { host = null; }
  const api = host ? `${host}/transparencia/api/public` : null;
  const marca = (situacao, detalhe, competencia = null, linhas = 0, comLot = 0, comCar = 0) =>
    q(`insert into folha_citta_coleta (cod_ibge,municipio,uf,host,competencia,linhas,com_lotacao,com_cargo,situacao,detalhe,em)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,now())
       on conflict (cod_ibge) do update set host=excluded.host, competencia=excluded.competencia,
         linhas=excluded.linhas, com_lotacao=excluded.com_lotacao, com_cargo=excluded.com_cargo,
         situacao=excluded.situacao, detalhe=excluded.detalhe, em=now()`,
      [a.cod_ibge, a.municipio, a.uf, host, competencia, linhas, comLot, comCar, situacao, detalhe]);
  try {
    if (!api) { await marca("erro", "host não resolvido"); falhas++; continue; }
    const unidades = await jget(`${api}/pessoal/unidades`);
    const anos = await jget(`${api}/anos/folha`);
    const anoMax = Math.max(...anos.map((x) => x.ano));

    // por servidor: { matricula → registro }, preenchido pelos dois lados (lotação e função)
    const porMatricula = new Map();
    let competencia = null;
    const hoje = new Date();

    for (const un of unidades) {
      // 🚨 A COMPETÊNCIA É A MAIS CHEIA, NUNCA A MAIS RECENTE. Aceitar a primeira com dados trouxe 1 servidor
      // para André da Rocha e 13 para Camargo: o mês corrente entra parcial (às vezes com uma lotação só).
      // Mesma regra que `confere_folha_cobertura.mjs` já aplica ao contar — aqui ela decide o que coletar.
      let achou = null;
      for (let k = 0; k < 8; k++) {
        const d = new Date(Date.UTC(hoje.getUTCFullYear(), hoje.getUTCMonth() - k, 1));
        const ano = Math.min(d.getUTCFullYear(), anoMax), mes = d.getUTCMonth() + 1;
        const base = `exercicio=${ano}&mes=${mes}&unidadeGestora=${un.chave}`;
        const lots = await jget(`${api}/pessoal/folha/lotacoes?${base}`).catch(() => []);
        if (!lots.length) continue;
        const total = lots.reduce((s, x) => s + (x.quantidade || 0), 0);
        if (!achou || total > achou.total) achou = { ano, mes, base, lots, total };
      }
      if (!achou) continue;
      competencia = competencia || `${achou.ano}${String(achou.mes).padStart(2, "0")}`;

      const chave = (s) => `${un.chave}|${s.matricula || s.codigo}`;
      // 1) por LOTAÇÃO → a secretaria
      for (const lot of achou.lots) {
        const servs = await jget(`${api}/pessoal/folha/lotacao/servidores?${achou.base}&codigo=${lot.codigo}`).catch(() => []);
        for (const s of servs) {
          const k = chave(s);
          const r = porMatricula.get(k) || { unidade: un.descricao };
          porMatricula.set(k, { ...r, ...s, lotacao: lot.descricao, unidade: un.descricao });
        }
      }
      // 2) por FUNÇÃO → o cargo (mesmo servidor, casado por matrícula)
      const funcs = await jget(`${api}/pessoal/folha/funcoes?${achou.base}`).catch(() => []);
      for (const f of funcs) {
        const servs = await jget(`${api}/pessoal/folha/funcao/servidores?${achou.base}&codigo=${f.codigo}`).catch(() => []);
        for (const s of servs) {
          const k = chave(s);
          const r = porMatricula.get(k) || { unidade: un.descricao };
          porMatricula.set(k, { ...r, ...s, cargo: f.descricao, unidade: un.descricao });
        }
      }
    }

    const regs = [...porMatricula.values()].map((s) => ({
      cod_ibge: a.cod_ibge, municipio: a.municipio, uf: a.uf, unidade_gestora: s.unidade, competencia,
      matricula: s.matricula ?? null, nome: s.servidor ?? null, cpf_masc: s.cnpj ?? null,
      regime: s.regime ?? null, lotacao: s.lotacao ?? null, cargo: s.cargo ?? null,
      padrao: s.padrao ?? null, classe: s.classe ?? null, valor: s.valor ?? null,
      _hash: crypto.createHash("md5").update([a.cod_ibge, competencia, s.unidade, s.matricula, s.servidor].join("|")).digest("hex"),
    })).filter((x) => x.nome);
    if (!regs.length) { await marca("vazio", "API respondeu sem servidores"); falhas++; continue; }

    const pp = [...new Map(regs.map((x) => [x._hash, x])).values()];
    if (REFAZ) await q(`delete from folha_servidores_citta where cod_ibge=$1 and competencia=$2`, [a.cod_ibge, competencia]);
    const c = (f) => pp.map((x) => x[f]);
    await q(`insert into folha_servidores_citta
      (cod_ibge,municipio,uf,unidade_gestora,competencia,matricula,nome,cpf_masc,regime,lotacao,cargo,padrao,classe,valor,_hash)
      select * from unnest($1::text[],$2::text[],$3::text[],$4::text[],$5::text[],$6::text[],$7::text[],$8::text[],
        $9::text[],$10::text[],$11::text[],$12::text[],$13::text[],$14::numeric[],$15::text[])
      on conflict (_hash) do update set valor=excluded.valor, lotacao=coalesce(excluded.lotacao, folha_servidores_citta.lotacao),
        cargo=coalesce(excluded.cargo, folha_servidores_citta.cargo), _coletado_em=now()`,
      [c("cod_ibge"), c("municipio"), c("uf"), c("unidade_gestora"), c("competencia"), c("matricula"), c("nome"),
       c("cpf_masc"), c("regime"), c("lotacao"), c("cargo"), c("padrao"), c("classe"), c("valor"), c("_hash")]);

    const comLot = pp.filter((x) => x.lotacao).length, comCar = pp.filter((x) => x.cargo).length;
    await marca("ok", null, competencia, pp.length, comLot, comCar);
    totalGeral += pp.length; ok++;
    console.log(`  [${i + 1}/${fila.length}] ${a.municipio}: ${pp.length} servidores · ${competencia} · ${comLot} c/ secretaria · ${comCar} c/ cargo`);
  } catch (e) {
    falhas++;
    await marca("erro", String(e.message).slice(0, 150));
    console.log(`  ✖ [${i + 1}/${fila.length}] ${a.municipio}: ${String(e.message).slice(0, 80)}`);
  }
}
console.log(`\n[citta] ${totalGeral.toLocaleString("pt-BR")} servidores · ${ok} portais ok · ${falhas} falhas`);
await db.end();
