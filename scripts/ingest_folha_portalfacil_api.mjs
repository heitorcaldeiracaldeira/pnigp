// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
// ingest_folha_portalfacil_api.mjs — Portal Fácil pela API central de DADOS ABERTOS (a boa).
//
// ⭐⭐ Existem DOIS caminhos para o mesmo produto, e este é melhor que o outro em tudo:
//
//                       tpc_servidor_data.ashx (site do município)   |   API de dados abertos (host central)
//   alcance             só quem eu adivinhar o domínio               |   ENUMERÁVEL por id — o produto inteiro
//   página              25 registros (whitelist 5/10/25)             |   100
//   valores             só o líquido (`vldefault`)                   |   base, provento, desconto E líquido
//   rubricas            não tem                                      |   `itens[]` com evento a evento
//   erro                zero CALADO quando o parâmetro é errado      |   diz o que falta e qual o limite
//
// O molde de domínio ([[pnigp-portalfacil-tpc-aspx]]) achou 24 municípios, todos em MG, e me levou a concluir
// "produto regional mineiro". **Era falso** — o id 400 do catálogo é Aiquara/BA. O domínio é que não seguia molde.
//
// O contrato:
//   GET /api/cliente?idCliente=N                      → {"id":"247","value":"Prefeitura Fernandes Tourinho"}
//   GET /api/servidoresano?idcliente=N                → [{"id":202607,"value":"07/2026"}, …]
//   GET /api/servidores?idcliente=N&numAno=MM/AAAA&page=1&pageSize=100
//       → [{numMatricula, descServidor, descUnidade, descCargo, descFuncao, descVinculo, descTpFolha,
//           descSituacaoContrato, covid, dtCompetencia, vlBase, vlProvento, vlDesconto, vlLiquido,
//           itens:[{descCodigo, descEvento, descTipo, descRefe, numValor}]}]
//
// 🚨 `numAno` QUER `MM/AAAA`, NÃO O ID. O catálogo devolve `{"id":202607,"value":"07/2026"}` e o campo que a
// consulta aceita é o **value**. Passando 202607 — o "id", o que qualquer um usaria — a resposta é
// `"Dados não encontrados"` com HTTP **200**: parece município sem folha, é parâmetro no formato errado
// ([[pnigp-coletor-ok-sem-dado-sete-causas]]).
//
// 🚨 `descTpFolha` separa "FOLHA DO MÊS" de 13º, férias e rescisão — sem isso a mesma pessoa entra várias vezes.
//
// Uso: node scripts/ingest_folha_portalfacil_api.mjs      · SO=<município> · UF=BA · ID=247
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
import "./_rede.mjs";
import crypto from "node:crypto";
import { pool, withRetry } from "./_cadprev.mjs";

const db = pool();
const q = withRetry(db);
const SO = process.env.SO || null;
const UF = process.env.UF || null;
const ID = process.env.ID ? Number(process.env.ID) : null;
const API = "https://dadosabertos-portalfacil.azurewebsites.net";
const UA = { "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120 Safari/537.36" };
const PAGINA = 100;   // 🚨 teto do servidor; acima disso ele recusa (e avisa, ao contrário do outro endpoint)

await q(`create table if not exists folha_servidores_portalfacil_api (
  cod_ibge text, municipio text, uf text, competencia text, id_cliente int, entidade text,
  matricula text, nome text, unidade text, cargo text, funcao text, vinculo text, tipo_folha text,
  situacao text, base numeric, proventos numeric, descontos numeric, liquido numeric, rubricas jsonb,
  _hash text primary key, _coletado_em timestamptz default now()
)`);
await q(`create table if not exists folha_portalfacil_api_coleta (
  id_cliente int primary key, cod_ibge text, municipio text, uf text, situacao text, detalhe text,
  pessoas int, linhas int, competencia text, em timestamptz default now()
)`);

const num = (s) => { const n = Number(String(s ?? "").replace(",", ".")); return Number.isFinite(n) ? n : null; };
const lim = (s) => { const t = String(s ?? "").replace(/\s+/g, " ").trim(); return t || null; };
// 🚨 só o mês fechado; 13º/férias/rescisão são outra folha
const EH_MENSAL = (t) => !/13|d[eé]cimo|f[ée]rias|rescis|adiant|complement/i.test(String(t ?? ""));

async function jsonDe(u) {
  const r = await fetch(`${API}${u}`, { headers: UA, signal: AbortSignal.timeout(120000) });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const t = await r.text();
  let j; try { j = JSON.parse(t); } catch { throw new Error("resposta não-JSON"); }
  if (typeof j === "string") return { aviso: j };   // "Dados não encontrados", "Erro: …"
  return j;
}

const fila = (await q(`select id_cliente, cod_ibge, municipio, uf, nome, competencia_ref
  from folha_portalfacil_catalogo
-- 22/ago/2026 PODER=legislativo: o catalogo central SEMPRE teve 177 CAMARAS (tipo=camara) e o coletor so pedia
--    prefeitura. Elas estavam sem cod_ibge porque o casador as descartava; agora 136 tem municipio. Mesma API,
--    mesma tela: muda o tipo pedido. A entidade gravada e o nome do cliente, e e ela que separa o poder.
 where tipo = '${(process.env.PODER || "executivo").toLowerCase() === "legislativo" ? "camara" : "prefeitura"}'
   and cod_ibge is not null
   -- as CAMARAS nunca passaram pela varredura, entao a coluna de competencias e nula nelas: exigir > 0 esvazia a fila.
   -- No legislativo o proprio coletor descobre a competencia; quem nao tiver fecha como sem_dado, que e a verdade.
   ${(process.env.PODER || "executivo").toLowerCase() === "legislativo" ? "" : "and coalesce(competencias,0) > 0"}
   ${ID ? "and id_cliente = " + ID : ""}
   ${SO ? "and municipio ilike '%'||$1||'%'" : ""}
   ${UF ? `and uf = '${String(UF).replace(/'/g, "")}'` : ""}
 order by uf, municipio`, [SO].filter(Boolean))).rows;
console.log(`[pf-api] ${fila.length} municípios na fila\n`);

let colhidos = 0, semDado = 0, erros = 0;
for (const m of fila) {
  const marca = (situacao, detalhe, pessoas = 0, linhas = 0, comp = null) =>
    q(`insert into folha_portalfacil_api_coleta (id_cliente,cod_ibge,municipio,uf,situacao,detalhe,pessoas,linhas,competencia,em)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,now()) on conflict (id_cliente) do update set situacao=excluded.situacao,
       detalhe=excluded.detalhe, pessoas=excluded.pessoas, linhas=excluded.linhas,
       competencia=excluded.competencia, em=now()`,
      [m.id_cliente, m.cod_ibge, m.municipio, m.uf, situacao, detalhe, pessoas, linhas, comp]);

  try {
    const anos = await jsonDe(`/api/servidoresano?idcliente=${m.id_cliente}`);
    const lista = Array.isArray(anos) ? anos : [];
    // ⚠️ o `value` (MM/AAAA) é o que a consulta aceita; o `id` (AAAAMM) só serve para ordenar
    const comps = lista.map((c) => ({ valor: String(c.value), ord: Number(c.id) }))
      .filter((c) => /^\d{2}\/\d{4}$/.test(c.valor)).sort((a, b) => b.ord - a.ord);
    if (!comps.length) { semDado++; await marca("sem_competencia", "servidoresano vazio"); continue; }

    // ⭐ a mais cheia em PESSOAS entre as 3 mais recentes ([[pnigp-competencia-mais-cheia-nao-a-recente]])
    let melhor = null;
    for (const c of comps.slice(0, 3)) {
      const p1 = await jsonDe(`/api/servidores?idcliente=${m.id_cliente}&numAno=${encodeURIComponent(c.valor)}&page=1&pageSize=${PAGINA}`);
      if (p1.aviso || !Array.isArray(p1) || !p1.length) continue;
      // uma página basta para comparar: se enche, o mês tem dado; a contagem exata vem na paginação
      if (!melhor || p1.length > melhor.amostra) melhor = { comp: c, amostra: p1.length, primeira: p1 };
      if (p1.length < PAGINA) break;   // município pequeno: a primeira página já é tudo
    }
    if (!melhor) { semDado++; await marca("consulta_sem_dado", `${comps.length} competências ofertadas, nenhuma devolveu linha`, 0, 0, comps[0].valor);
      console.log(`   · ${m.uf} ${m.municipio}: competências ofertadas, consulta vazia`); continue; }

    const regs = [...melhor.primeira];
    for (let page = 2; melhor.amostra === PAGINA; page++) {
      const p = await jsonDe(`/api/servidores?idcliente=${m.id_cliente}&numAno=${encodeURIComponent(melhor.comp.valor)}&page=${page}&pageSize=${PAGINA}`);
      if (p.aviso || !Array.isArray(p) || !p.length) break;
      regs.push(...p);
      if (p.length < PAGINA) break;
      if (page > 400) break;   // trava de segurança: 40 mil linhas é maior que qualquer folha municipal
    }

    const [mm, aa] = melhor.comp.valor.split("/");
    const comp = `${aa}${mm}`;
    const mensais = regs.filter((x) => EH_MENSAL(x.descTpFolha));
    const usar = mensais.length ? mensais : regs;
    const lote = usar.map((x) => [m.cod_ibge, m.municipio, m.uf, comp, m.id_cliente, m.nome,
      lim(x.numMatricula), lim(x.descServidor), lim(x.descUnidade), lim(x.descCargo), lim(x.descFuncao),
      lim(x.descVinculo), lim(x.descTpFolha), lim(x.descSituacaoContrato),
      num(x.vlBase), num(x.vlProvento), num(x.vlDesconto), num(x.vlLiquido),
      JSON.stringify(x.itens ?? []),
      crypto.createHash("sha1").update([m.cod_ibge, comp, x.numMatricula ?? "", x.descServidor ?? "",
        x.descTpFolha ?? "", x.vlLiquido ?? ""].join("|")).digest("hex")]);

    for (let i = 0; i < lote.length; i += 300) {
      const p = lote.slice(i, i + 300);
      const vals = p.map((_, k) => `(${Array.from({ length: 20 }, (_, j) => `$${k * 20 + j + 1}`).join(",")})`).join(",");
      await q(`insert into folha_servidores_portalfacil_api (cod_ibge,municipio,uf,competencia,id_cliente,entidade,
        matricula,nome,unidade,cargo,funcao,vinculo,tipo_folha,situacao,base,proventos,descontos,liquido,rubricas,_hash)
        values ${vals} on conflict (_hash) do nothing`, p.flat());
    }
    const pessoas = new Set(lote.map((x) => `${x[6] ?? ""}|${x[7] ?? ""}`)).size;
    const comValor = lote.filter((x) => x[15] > 0 || x[17] > 0).length;
    colhidos++;
    await marca("ok", `${pessoas} pessoas · ${comValor} com valor · ${regs.length - usar.length} linhas fora do mês`,
      pessoas, lote.length, comp);
    console.log(`  ⭐ ${m.uf} ${m.municipio.padEnd(28)} ${String(pessoas).padStart(6)} pessoas · ${lote.length} linhas · comp ${comp}`);
  } catch (e) {
    erros++; await marca("erro", String(e.message).slice(0, 160));
    console.log(`   ✖ ${m.uf} ${m.municipio}: ${String(e.message).slice(0, 60)}`);
  }
}

console.log(`\n[pf-api] ${colhidos} colhidos · ${semDado} sem dado · ${erros} erros`);
const t = (await q(`select count(distinct cod_ibge)::int m, count(*)::int n from folha_servidores_portalfacil_api`)).rows[0];
console.log(`[pf-api] tabela: ${t.m} municípios · ${t.n} linhas`);
await db.end();
