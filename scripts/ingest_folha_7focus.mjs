// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
// ingest_folha_7focus.mjs — folha nominal do ERP 7Focus (forte no Tocantins).
//
// ⭐ Entrega os CINCO campos de [[pnigp-folha-municipal-cinco-campos]] por REST puro, sem navegador e sem login:
//   matricula · nome · nomeCargo · **nomeSecao (=secretaria)** · nomeTipoAdmissao · horasSemana ·
//   salario (base) · **valorProventos (bruto)** · dataAdmissao
//
// 🚨 EU TINHA DADO ESTE ERP COMO BECO. A conclusão veio de olhar `#/portal-transparencia/contra-cheques`, que
// redireciona para `/login` — mas aquilo é o contracheque DO SERVIDOR. A folha pública mora noutra rota,
// `#/portal-folha-pagamento`, e é aberta. **Uma rota fechada não prova que o portal é fechado.**
// Quem revelou foi o livro-razão do NucleoGov: Paranã e Alvorada estavam marcados `migrou_produto` com a URL
// nova anotada. O registro de falha de um coletor é pista para o próximo ([[pnigp-coletor-ok-sem-dado-sete-causas]]).
//
// A API: base `https://{slug}.7focus.inf.br/sfapi{slug}`
//   /portal-transparencia-folha-pagamento/get-mes-ano-liberado-portal → {ano, mes} publicados
//   /portal-transparencia-orgaos/lista-para-filtro?ordem=1&nome=&sistema=15 → órgãos
//   /portal-transparencia-folha-pagamento/listaPaginada?pagina=&registrosPorPagina=&exercicio=&mes=&orgao=
//
// ⚠️ A API devolve **CPF COMPLETO**. Gravamos MASCARADO — o dado é público, mas replicar CPF inteiro na nossa
// base é risco desnecessário e nenhum outro coletor nosso faz isso.
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
// 🚨 O host do 7Focus serve a cadeia de certificado INCOMPLETA: o Node recusa com
// `UNABLE_TO_VERIFY_LEAF_SIGNATURE` enquanto o curl (com -k) e o navegador passam. Sem isto o coletor
// reporta "nenhum host respondeu" para um host que responde perfeitamente — mesmo engano do Equiplano
// ([[pnigp-tenosoft-equiplano-crackeados]]), onde o certificado virou "fetch failed" genérico.
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
import crypto from "crypto";
import { pool, withRetry } from "./_cadprev.mjs";

const db = pool();
const q = withRetry(db);
const SO = process.env.SO || null;
const PAG = Number(process.env.PAG || 500);
const SONDAR = Number(process.env.SONDAR || 4);   // competencias a comparar antes de escolher
const dorme = (ms) => new Promise((r) => setTimeout(r, ms));
const UA = { "user-agent": "Mozilla/5.0 (compatible; PNIGP/1.0; pesquisa de dados publicos)" };

await q(`create table if not exists folha_servidores_7focus (
  cod_ibge text, municipio text, uf text, slug text, orgao text, competencia text,
  matricula text, nome text, cpf_masc text, cargo text, secretaria text, vinculo text,
  carga_horaria text, salario_base numeric, proventos numeric, data_admissao text,
  _hash text primary key, _coletado_em timestamptz default now())`);
await q(`create index if not exists ix_folha_7f_mun on folha_servidores_7focus (cod_ibge, competencia)`);
await q(`create table if not exists folha_7focus_coleta (
  cod_ibge text primary key, municipio text, uf text, slug text, competencia text,
  linhas int, situacao text, detalhe text, em timestamptz default now())`);

const slugDe = (s) => String(s).normalize("NFD").replace(/[̀-ͯ]/g, "")
  .toLowerCase().replace(/\b(de|do|da|dos|das)\b/g, "").replace(/[^a-z0-9]/g, "");

// candidatos de TRÊS origens — a 2ª é a que mais rende e só existe porque outro coletor registrou a falha direito
const candidatos = (await q(`
  with r as (select distinct cod_ibge, municipio, uf from radar_portal where erp='7focus'),
  mig as (select c.cod_ibge, c.municipio, c.uf,
                 (regexp_match(c.detalhe, '([a-z0-9-]+)\\.7focus\\.inf\\.br'))[1] slug_detalhe
            from folha_nucleogov_coleta c
           where c.situacao='migrou_produto' and c.detalhe ilike '%7focus%'),
  pr as (select distinct p.cod_ibge, p.municipio, p.uf,
                (regexp_match(p.url_portal_real, '([a-z0-9-]+)\\.7focus\\.inf\\.br'))[1] slug_detalhe
           from portal_real_descoberto p where p.url_portal_real ilike '%7focus%'),
  -- ⭐ 4ª origem: o IFRAME. Muitos portais municipais são casca que embute o ERP num iframe montado por JS —
  -- invisível para curl e para o identificador por assinatura. O descobre_iframe_folha.mjs abre com navegador
  -- e extrai o src. Crixás e São Bento do Tocantins só apareceram assim, e com SLUG que NÃO deriva do nome
  -- (crixas, saobento) — eram exatamente os sem_host desta fila.
  ifr as (select distinct i.cod_ibge, i.municipio, i.uf,
                 (regexp_match(i.iframe_src, '([a-z0-9-]+)\\.7focus\\.inf\\.br'))[1] slug_detalhe
            from folha_iframe_descoberto i where i.produto = '7focus')
  select cod_ibge, max(municipio) municipio, max(uf) uf, max(slug_detalhe) slug_detalhe from (
    select cod_ibge, municipio, uf, null::text slug_detalhe from r
    union all select cod_ibge, municipio, uf, slug_detalhe from mig
    union all select cod_ibge, municipio, uf, slug_detalhe from pr
    union all select cod_ibge, municipio, uf, slug_detalhe from ifr) x
  group by cod_ibge order by 2`)).rows
  .filter((c) => !SO || new RegExp(SO, "i").test(c.municipio));

// REFAZ=1 reprocessa quem ja esta ok — sem isso, conserto de campo nao alcanca quem ja foi coletado

const feitos = process.env.REFAZ === "1" ? new Set() : new Set((await q(`select cod_ibge from folha_7focus_coleta where situacao in ('ok','sem_publicacao')`)).rows.map((r) => r.cod_ibge));
const fila = candidatos.filter((c) => !feitos.has(c.cod_ibge));
console.log(`[7focus] ${candidatos.length} candidatos · ${fila.length} na fila`);

const jget = async (u) => {
  for (let t = 0; t < 3; t++) {
    try {
      const r = await fetch(u, { headers: UA, signal: AbortSignal.timeout(60000) });
      if (!r.ok) { if (r.status >= 500) { await dorme(1500 * (t + 1)); continue; } return null; }
      // 🚨 NÃO confiar no content-type: esta API devolve JSON válido rotulado `text/plain;charset=ISO-8859-1`.
      // A guarda `if (!/json/.test(ct)) return null` rejeitava TODOS os municípios — o coletor dizia
      // "nenhum host respondeu" para um host que respondia perfeitamente. Quem decide é o PARSE.
      const txt = await r.text();
      try { return JSON.parse(txt); } catch { return null; }
    } catch { await dorme(1500 * (t + 1)); }
  }
  return null;
};
// ⚠️ mascara o CPF na origem: 000.000.000-00 → xxx.000.000-xx (exemplo ficticio)
const mascara = (c) => { const d = String(c || "").replace(/\D/g, ""); return d.length === 11 ? `xxx.${d.slice(3, 6)}.${d.slice(6, 9)}-xx` : null; };
const dataDe = (ms) => (Number.isFinite(+ms) && +ms > 0 ? new Date(+ms).toISOString().slice(0, 10) : null);
const num = (v) => (Number.isFinite(+v) ? +v : null);

async function grava(p, comp, regs) {
  const LOTE = 800;
  for (let i = 0; i < regs.length; i += LOTE) {
    const parte = regs.slice(i, i + LOTE); const c = (f) => parte.map((x) => x[f]);
    await q(`insert into folha_servidores_7focus
      (cod_ibge,municipio,uf,slug,orgao,competencia,matricula,nome,cpf_masc,cargo,secretaria,vinculo,
       carga_horaria,salario_base,proventos,data_admissao,_hash)
      select * from unnest($1::text[],$2::text[],$3::text[],$4::text[],$5::text[],$6::text[],$7::text[],$8::text[],
        $9::text[],$10::text[],$11::text[],$12::text[],$13::text[],$14::numeric[],$15::numeric[],$16::text[],$17::text[])
      on conflict (_hash) do nothing`,
      [parte.map(() => p.cod_ibge), parte.map(() => p.municipio), parte.map(() => p.uf), parte.map(() => p.slug),
       c("orgao"), parte.map(() => comp), c("matricula"), c("nome"), c("cpf_masc"), c("cargo"), c("secretaria"),
       c("vinculo"), c("carga_horaria"), c("salario_base"), c("proventos"), c("data_admissao"),
       parte.map((r) => crypto.createHash("md5")
         .update([p.cod_ibge, comp, r.orgao, r.matricula, r.nome, r.cargo, r.proventos].join("¦")).digest("hex"))]);
  }
}

let ok = 0, vazios = 0, falhas = 0, total = 0;
for (let i = 0; i < fila.length; i++) {
  const c = fila[i];
  const marca = (situacao, detalhe, slug = null, comp = null, linhas = 0) =>
    q(`insert into folha_7focus_coleta (cod_ibge,municipio,uf,slug,competencia,linhas,situacao,detalhe,em)
       values ($1,$2,$3,$4,$5,$6,$7,$8,now()) on conflict (cod_ibge) do update set
       slug=excluded.slug, competencia=excluded.competencia, linhas=excluded.linhas,
       situacao=excluded.situacao, detalhe=excluded.detalhe, em=now()`,
      [c.cod_ibge, c.municipio, c.uf, slug, comp, linhas, situacao, detalhe]);
  try {
    // slug: o anotado pelo outro coletor primeiro (é PROVA), depois a derivação pelo nome
    const tentar = [...new Set([c.slug_detalhe, slugDe(c.municipio)].filter(Boolean))];
    let slug = null, base = null, lib = null;
    for (const s of tentar) {
      const b = `https://${s}.7focus.inf.br/sfapi${s}`;
      const l = await jget(`${b}/portal-transparencia-folha-pagamento/get-mes-ano-liberado-portal`);
      if (l && l.ano) { slug = s; base = b; lib = l; break; }
    }
    if (!slug) { await marca("sem_host", `nenhum host 7focus respondeu (${tentar.join(", ")})`); falhas++; continue; }

    // 🚨 confirma de QUEM é o portal antes de gravar — o slug derivado do nome pode ser homônimo
    const cent = await jget(`${base}/portal-transparencia-orgaos/centralizador`);
    const nomeEnte = String(cent?.nome || "");
    if (nomeEnte && !slugDe(nomeEnte).includes(slugDe(c.municipio).slice(0, 6))) {
      await marca("host_de_outro_ente", `centralizador diz "${nomeEnte.slice(0, 60)}"`, slug); falhas++; continue;
    }

    const orgaos = await jget(`${base}/portal-transparencia-orgaos/lista-para-filtro?ordem=1&nome=&sistema=15`) || [];

    // ⭐⭐ LEI DA COMPETÊNCIA MAIS CHEIA ([[pnigp-competencia-mais-cheia-nao-a-recente]]) aplicada aqui.
    // 🚨 `get-mes-ano-liberado-portal` devolve o mês LIBERADO, não o mês CHEIO. Confiar nele trouxe
    // Talismã com 13 servidores numa competência 202612 (dezembro/2026, mês que ainda não ocorreu — é folha
    // adiantada), Santa Tereza com 13 e Aliança com 20. Tecnicamente "ok", materialmente errado.
    // Sonda o liberado e os 3 meses anteriores no órgão principal e fica com o que tem MAIS gente.
    const orgPrinc = (orgaos[0]?.codigo) ?? 1;
    // 🚨 A âncora NÃO pode ser cegamente o "liberado": em Talismã ele devolve **202612**, mês que ainda não
    // ocorreu (folha adiantada com 13 lançamentos). Sondar para trás a partir dele cai em meses vazios e o
    // município fica com 13 servidores. Ancorar no MENOR entre o liberado e o mês corrente resolve.
    const hoje = new Date();
    const anoHoje = hoje.getFullYear(), mesHoje = hoje.getMonth() + 1;
    const futuro = lib.ano > anoHoje || (lib.ano === anoHoje && lib.mes > mesHoje);
    const anc = futuro ? { ano: anoHoje, mes: mesHoje } : { ano: lib.ano, mes: lib.mes };
    const cands = [];
    for (let k = 0; k < SONDAR; k++) {
      let ano = anc.ano, mes = anc.mes - k;
      while (mes <= 0) { mes += 12; ano -= 1; }
      cands.push({ ano, mes });
    }
    let melhor = null;
    for (const cd of cands) {
      const amostra = await jget(`${base}/portal-transparencia-folha-pagamento/listaPaginada?pagina=0`
        + `&registrosPorPagina=1000&ordem=2&nomeSecao=&nomeCargo=&exercicio=${cd.ano}&mes=${cd.mes}`
        + `&orgao=${orgPrinc}&dataAdmissaoInicial=&dataAdmissaoFinal=&dataDesligamentoInicial=&dataDesligamentoFinal=`);
      const n = Array.isArray(amostra) ? amostra.length : 0;
      if (!melhor || n > melhor.n) melhor = { ...cd, n };
      await dorme(200);
    }
    if (melhor && melhor.n) { lib = { ano: melhor.ano, mes: melhor.mes }; }
    const comp = `${lib.ano}${String(lib.mes).padStart(2, "0")}`;
    let linhasMun = 0;
    for (const o of (orgaos.length ? orgaos : [{ codigo: 1, nomeResumido: "PM" }])) {
      let pagina = 0;
      while (true) {
        const url = `${base}/portal-transparencia-folha-pagamento/listaPaginada?pagina=${pagina}`
          + `&registrosPorPagina=${PAG}&ordem=2&nomeSecao=&nomeCargo=&exercicio=${lib.ano}&mes=${lib.mes}`
          + `&orgao=${o.codigo}&dataAdmissaoInicial=&dataAdmissaoFinal=&dataDesligamentoInicial=&dataDesligamentoFinal=`;
        const arr = await jget(url);
        if (!Array.isArray(arr) || !arr.length) break;
        await grava({ ...c, slug }, comp, arr.map((s) => ({
          orgao: s.nomeOrgao || o.nomeResumido || String(o.codigo),
          matricula: String(s.matricula ?? ""), nome: s.nome, cpf_masc: mascara(s.cpf),
          cargo: s.nomeCargo, secretaria: s.nomeSecao, vinculo: s.nomeTipoAdmissao,
          carga_horaria: s.horasSemana != null ? String(s.horasSemana) : null,
          salario_base: num(s.salario), proventos: num(s.valorProventos), data_admissao: dataDe(s.dataAdmissao),
        })));
        linhasMun += arr.length;
        if (arr.length < PAG) break;
        pagina++; if (pagina > 400) break;
        await dorme(250);
      }
      await dorme(250);
    }
    if (linhasMun) {
      // ⭐ CONFERIDOR EMBUTIDO ([[pnigp-conferidor-rais-denominador-folha]]): comparar com a RAIS na hora da
      // coleta, não num relatório depois. Talismã trouxe 13 servidores para 312 vínculos (4,2%) e passaria
      // como "ok" — o coletor tem de dizer que aquilo é PARCIAL, senão vira média e ranking errados.
      // `ok_parcial` NÃO aposenta na fila: volta na próxima passada, quando o portal talvez tenha enchido.
      const rais = (await q(`select count(*)::int v from folha_rais_municipal where left(cod_ibge6::text,6)=left($1,6)`,
        [c.cod_ibge])).rows[0]?.v || 0;
      const pct = rais ? Math.round(1000 * linhasMun / rais) / 10 : null;
      const parcial = rais > 100 && linhasMun < rais * 0.35;
      await marca(parcial ? "ok_parcial" : "ok",
        `${orgaos.length} órgãos${pct != null ? ` · ${pct}% da RAIS` : ""}`, slug, comp, linhasMun);
      ok++; total += linhasMun;
      console.log(`  ${parcial ? "⚠" : " "} [${i + 1}/${fila.length}] ${c.municipio}: ${linhasMun} servidores (${comp})${pct != null ? ` · ${pct}% da RAIS` : ""}`);
    }
    else { await marca("sem_publicacao", "API respondeu e a lista veio vazia", slug, comp); vazios++;
      console.log(`  ○ [${i + 1}/${fila.length}] ${c.municipio}: sem linhas em ${comp}`); }
  } catch (e) {
    falhas++; await marca("erro", String(e.message).slice(0, 150));
    console.log(`  ✖ [${i + 1}/${fila.length}] ${c.municipio}: ${String(e.message).slice(0, 70)}`);
  }
  await dorme(300);
}
console.log(`\n[7focus] ${total.toLocaleString("pt-BR")} servidores · ${ok} ok · ${vazios} sem publicação · ${falhas} falhas`);
console.table((await q(`select count(distinct cod_ibge)::int municipios, count(*)::int linhas,
  count(*) filter (where secretaria is not null and secretaria<>'')::int com_secretaria,
  count(*) filter (where proventos>0)::int com_salario from folha_servidores_7focus`)).rows);
await db.end();
