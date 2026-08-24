// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
// ingest_folha_portalfacil.mjs — Portal Fácil (`{site do município}/tpc_serv_nome_lis.aspx`), AngularJS + ASP.NET.
//
// ⭐⭐ Achado em 18/ago/2026 em Fernandes Tourinho/MG (3 mil habitantes) e o molde entregou **54 municípios de MG**,
// entre eles Betim, Sete Lagoas, Passos, Ubá, Leopoldina e Nova Serrana. O produto roda no PRÓPRIO domínio do
// município — por isso nenhuma varredura de fornecedor por host o encontrou ([[pnigp-portal-proprio-e-white-label]]).
//
// 🚨 POR QUE O DIAGNÓSTICO NÃO VIU: `GET /tpc_serv_nome_lis.aspx` devolve 120 KB **sem uma única `<td>`**. A grade
// é DataTables server-side montada por Angular. Ler o HTML — em UTF-8 ou latin-1, com cookie de sessão ou sem —
// dá zero linhas em qualquer competência. O dado só existe atrás do POST abaixo
// ([[pnigp-spa-nao-e-obstaculo-e-nao-publicacao]] ao contrário: aqui o SPA ESCONDE publicação real).
//
// O contrato — três POSTs, todos com corpo JSON:
//   POST /transparencia/servidor/tpc_servidor_data.ashx?metodo=ServidorGetCompetencia&entidade=
//        → [{"id":"07/2026","nome":"07/2026"}, …]  (103 competências em Fernandes Tourinho)
//   POST /transparencia/tpc_geral_data.ashx?metodo=GetEntidade
//        → [] quando só há a prefeitura; lista quando há mais de uma entidade  🚨 ver guarda abaixo
//   POST /transparencia/servidor/tpc_servidor_data.ashx?metodo=ServidorGetNomeGrid
//        {"parameters":{draw,columns[8],order,start,length,search},"entidade":"","competencia":"07/2026",
//         "unidade":"","cargo":"","funcao":"","vinculo":"","vlInicio":"0","vlFim":"0","grupocalculo":"","covid":null}
//        → {"recordsFiltered":328,"data":[{nmMatricula,nmServidor,nmUnidade,nmLotacao,nmCargo,nmSituacao,
//           nmVinculo,nmRegime,nuCargaHoraria,dtAdmissao,dtExoneracao,nmTipo,vldefault,cdContraCheque}]}
// 🚨 `columns` NÃO é decorativo: com nomes inventados (`nome`, `valor`) a API devolve `recordsTotal: 0` calada.
// Os `data` têm de ser exatamente os oito abaixo — foi o que separou "não publica" de 328 servidores.
//
// 🚨 GUARDA DE ENTIDADE: quando `GetEntidade` devolve lista, ela pode trazer CÂMARA e autarquias junto da
// prefeitura. O coletor colhe só a entidade que se declara prefeitura/município; sem isso o legislativo entraria
// somado ao executivo ([[pnigp-entidade-espelho-infla-folha]], [[pnigp-entidade-declarada-e-a-prova]]).
//
// ℹ️ Há também `GetLinkDadosAbertosServidorNome`, que devolve
// `https://dadosabertos-portalfacil.azurewebsites.net/{id}/servidores` — um catálogo central com id por município.
// É SPA e ainda não foi crackeado; se um dia for, enumera o produto no país inteiro.
//
// Uso: node scripts/ingest_folha_portalfacil.mjs      · SO=<município> · UF=MG
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
import "./_rede.mjs";
import crypto from "node:crypto";
import { pool, withRetry } from "./_cadprev.mjs";

const db = pool();
const q = withRetry(db);
const SO = process.env.SO || null;
const UF = process.env.UF || null;
const BLOCO = 25;   // 🚨 whitelist do servidor: só 5, 10 e 25 — ver nota acima
const H = {
  "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120 Safari/537.36",
  "content-type": "application/json; charset=UTF-8",
  "x-requested-with": "XMLHttpRequest",
  accept: "application/json, text/javascript, */*; q=0.01",
};

await q(`create table if not exists folha_servidores_portalfacil (
  cod_ibge text, municipio text, uf text, competencia text, entidade text, matricula text, nome text,
  unidade text, lotacao text, cargo text, situacao text, vinculo text, regime text, carga_horaria text,
  admissao text, exoneracao text, tipo text, valor numeric,
  _hash text primary key, _coletado_em timestamptz default now()
)`);
await q(`create table if not exists folha_portalfacil_coleta (
  cod_ibge text primary key, municipio text, uf text, url text, situacao text, detalhe text,
  linhas int, competencia text, entidade text, em timestamptz default now()
)`);

// as OITO colunas que a API exige — nome errado devolve zero calado
const COLUNAS = ["nmMatricula", "nmServidor", "nmUnidade", "nmLotacao", "nmCargo", "nmVinculo", "nmTipo", "vldefault"]
  .map((d) => ({ data: d, name: "", searchable: true, orderable: true, search: { value: "", regex: false } }));

const num = (s) => {
  const t = String(s ?? "").replace(/[^\d,.-]/g, "");
  const n = Number(t.includes(",") ? t.replace(/\./g, "").replace(",", ".") : t);
  return Number.isFinite(n) ? n : null;
};
const lim = (s) => { const t = String(s ?? "").replace(/\s+/g, " ").trim(); return t || null; };

// 🚨 metade dos municípios responde ao POST com um `<meta http-equiv="refresh">` apontando para o mesmo caminho
// no host `www.` — NÃO é redirect HTTP, então `redirect: "follow"` não ajuda e o corpo POST se perde. Sem ler o
// meta, 30 dos 54 municípios fechariam como "resposta não-JSON" ([[pnigp-coletor-ok-sem-dado-sete-causas]]).
const RE_META = /<meta[^>]+refresh[^>]+url=([^"'>\s]+)/i;

async function post(base, caminho, corpo = {}) {
  const bate = async (b) => {
    const r = await fetch(`${b}${caminho}`, { method: "POST", headers: H, body: JSON.stringify(corpo), signal: AbortSignal.timeout(180000) });
    // 🚨 o servidor declara `charset=utf-8` no cabeçalho mas MANDA latin-1: `await r.text()` produziu 496 nomes
    // com U+FFFD ("Gon�alves", "Assun��o"). Decodifica-se em latin-1 quando o UTF-8 tem substituto.
    const buf = Buffer.from(await r.arrayBuffer());
    let texto = new TextDecoder("utf-8").decode(buf);
    if (texto.includes("�")) texto = buf.toString("latin1");
    return { ok: r.ok, status: r.status, texto };
  };
  let r = await bate(base);
  const meta = r.texto.length < 600 ? RE_META.exec(r.texto) : null;
  if (meta) {
    try { r = await bate(new URL(meta[1]).origin); } catch { /* fica com a resposta original */ }
  }
  if (!r.ok) throw new Error(`HTTP ${r.status} em ${caminho.slice(0, 60)}`);
  try { return JSON.parse(r.texto); } catch { throw new Error(`resposta não-JSON em ${caminho.slice(0, 50)}`); }
}

async function grade(base, competencia, entidade, start, length) {
  return post(base, "/transparencia/servidor/tpc_servidor_data.ashx?metodo=ServidorGetNomeGrid", {
    parameters: { draw: 1, columns: COLUNAS, order: [{ column: 0, dir: "asc" }], start, length,
      search: { value: "", regex: false } },
    entidade: entidade ?? "", competencia, unidade: "", cargo: "", funcao: "", vinculo: "",
    vlInicio: "0", vlFim: "0", grupocalculo: "", covid: null,
  });
}

const fila = (await q(`select distinct on (cod_ibge) cod_ibge, municipio, uf, url from folha_portal_candidato
  where produto = 'tpc_aspx' ${SO ? "and municipio ilike '%'||$1||'%'" : ""} ${UF ? `and uf = '${String(UF).replace(/'/g, "")}'` : ""}
  order by cod_ibge, achado_em desc`, [SO].filter(Boolean))).rows;
console.log(`[portalfacil] ${fila.length} municípios na fila\n`);

let colhidos = 0, semDado = 0, erros = 0;
for (const m of fila) {
  const base = String(m.url).replace(/\/tpc_serv_nome_lis\.aspx.*$/i, "").replace(/\/+$/, "");
  const marca = (situacao, detalhe, n = 0, comp = null, ent = null) =>
    q(`insert into folha_portalfacil_coleta (cod_ibge,municipio,uf,url,situacao,detalhe,linhas,competencia,entidade,em)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,now()) on conflict (cod_ibge) do update set situacao=excluded.situacao,
       detalhe=excluded.detalhe, linhas=excluded.linhas, competencia=excluded.competencia,
       entidade=excluded.entidade, em=now()`,
      [m.cod_ibge, m.municipio, m.uf, base, situacao, detalhe, n, comp, ent]);

  try {
    // ── entidade: [] = só a prefeitura. Se vier lista, fica a que se DECLARA prefeitura/município ──────────────
    let entidade = "", entRotulo = null;
    try {
      const ents = await post(base, "/transparencia/tpc_geral_data.ashx?metodo=GetEntidade");
      const lista = Array.isArray(ents) ? ents : (ents?.d ?? []);
      if (lista.length) {
        const pref = lista.find((e) => /prefeit|munic[íi]pio/i.test(String(e.nome ?? "")))
          ?? (lista.length === 1 ? lista[0] : null);
        if (!pref) {
          await marca("entidade_ambigua", `${lista.length} entidades, nenhuma se declara prefeitura: `
            + lista.map((e) => e.nome).join(" / ").slice(0, 160));
          console.log(`   ? ${m.municipio}: entidades ambíguas — ${lista.map((e) => e.nome).join(" / ").slice(0, 70)}`);
          continue;
        }
        // 🚨 câmara nunca, mesmo que seja a única
        if (/c[âa]mara|legislat|vereador/i.test(String(pref.nome ?? ""))) {
          await marca("camara", `única entidade é "${pref.nome}" — legislativo`);
          console.log(`   ✖ ${m.municipio}: entidade é CÂMARA`); continue;
        }
        entidade = String(pref.id ?? ""); entRotulo = String(pref.nome ?? "");
      }
    } catch { /* GetEntidade opcional: segue com entidade vazia */ }

    const comps = await post(base, `/transparencia/servidor/tpc_servidor_data.ashx?metodo=ServidorGetCompetencia&entidade=${encodeURIComponent(entidade)}`);
    const lista = (Array.isArray(comps) ? comps : (comps?.d ?? [])).map((c) => String(c.id ?? c));
    if (!lista.length) { semDado++; await marca("sem_competencia", "ServidorGetCompetencia devolveu vazio", 0, null, entRotulo);
      console.log(`   · ${m.municipio}: nenhuma competência publicada`); continue; }

    // 🚨 mês 13 é 13º SALÁRIO, não folha mensal — Sete Lagoas oferece "13/2026" como a competência mais recente,
    // e colhê-la traria a gratificação natalina no lugar do mês ([[pnigp-competencia-mais-cheia-nao-a-recente]]).
    // Mês 00 é competência vazia: seis municípios ofertam só "00/0000", que é base não alimentada.
    const mensais = lista.filter((c) => { const m = Number(String(c).slice(0, 2)); return m >= 1 && m <= 12; });
    if (!mensais.length) {
      semDado++; await marca("base_nao_alimentada", `única competência ofertada: ${lista[0]}`, 0, lista[0], entRotulo);
      console.log(`   · ${m.municipio}: só competência inválida (${lista[0]})`); continue;
    }

    // ⭐ a mais cheia entre as 4 mais recentes — o mês corrente costuma vir pela metade
    // ([[pnigp-competencia-mais-cheia-nao-a-recente]])
    let escolha = null;
    for (const c of mensais.slice(0, 4)) {
      let r; try { r = await grade(base, c, entidade, 0, 5); } catch { continue; }
      const n = Number(r?.recordsFiltered ?? 0);
      if (n && (!escolha || n > escolha.n)) escolha = { comp: c, n };
    }
    if (!escolha) { semDado++; await marca("consulta_sem_dado", `${mensais.length} competências mensais ofertadas, todas devolvem 0 linhas`, 0, mensais[0], entRotulo);
      console.log(`   · ${m.municipio}: competências ofertadas, grade vazia`); continue; }

    const regs = [];
    for (let start = 0; start < escolha.n; start += BLOCO) {
      const r = await grade(base, escolha.comp, entidade, start, BLOCO);
      const d = Array.isArray(r?.data) ? r.data : [];
      if (!d.length) break;
      regs.push(...d);
      if (d.length < BLOCO) break;
      if (start && start % (BLOCO * 40) === 0) process.stdout.write(`      … ${regs.length}/${escolha.n}
`);
    }
    if (!regs.length) { semDado++; await marca("consulta_sem_dado", `recordsFiltered=${escolha.n} mas a paginação devolveu 0`, 0, escolha.comp, entRotulo);
      console.log(`   · ${m.municipio}: contou ${escolha.n} e entregou 0`); continue; }

    const [mm, aa] = escolha.comp.split("/");
    const comp = `${aa}${String(mm).padStart(2, "0")}`;
    const lote = regs.map((x) => {
      const _hash = crypto.createHash("sha1")
        .update([m.cod_ibge, comp, x.cdContraCheque ?? "", x.nmMatricula ?? "", x.nmServidor ?? "", x.vldefault ?? ""].join("|")).digest("hex");
      return [m.cod_ibge, m.municipio, m.uf, comp, entRotulo, lim(x.nmMatricula), lim(x.nmServidor),
        lim(x.nmUnidade), lim(x.nmLotacao), lim(x.nmCargo), lim(x.nmSituacao), lim(x.nmVinculo),
        lim(x.nmRegime), lim(x.nuCargaHoraria), lim(x.dtAdmissao), lim(x.dtExoneracao), lim(x.nmTipo),
        num(x.vldefault), _hash];
    });
    for (let i = 0; i < lote.length; i += 400) {
      const p = lote.slice(i, i + 400);
      const vals = p.map((_, k) => `(${Array.from({ length: 19 }, (_, j) => `$${k * 19 + j + 1}`).join(",")})`).join(",");
      await q(`insert into folha_servidores_portalfacil (cod_ibge,municipio,uf,competencia,entidade,matricula,nome,
        unidade,lotacao,cargo,situacao,vinculo,regime,carga_horaria,admissao,exoneracao,tipo,valor,_hash)
        values ${vals} on conflict (_hash) do nothing`, p.flat());
    }
    const comValor = lote.filter((x) => x[17] != null && x[17] > 0).length;
    colhidos++;
    await marca("ok", `${comValor} com valor de ${lote.length} linhas`, lote.length, comp, entRotulo);
    console.log(`  ⭐ ${m.municipio.padEnd(26)} ${String(lote.length).padStart(6)} linhas · ${comValor} com valor · comp ${comp}`);
  } catch (e) {
    erros++; await marca("erro", String(e.message).slice(0, 160));
    console.log(`   ✖ ${m.municipio}: ${String(e.message).slice(0, 60)}`);
  }
}

console.log(`\n[portalfacil] ${colhidos} colhidos · ${semDado} sem dado · ${erros} erros`);
const t = (await q(`select count(distinct cod_ibge)::int m, count(*)::int n from folha_servidores_portalfacil`)).rows[0];
console.log(`[portalfacil] tabela: ${t.m} municípios · ${t.n} linhas`);
await db.end();
