// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
// ingest_folha_digifred.mjs — quadro de pessoal NOMINAL do bloco `digifred` (SIM), 11 municípios do RS.
//
// Achado em 15/ago/2026 agrupando os não-coletados do RS por domínio ([[pnigp-rs-mapa-folha-497]]).
// Host central: `sim.digifred.net.br/{slug}/contas/relatorios/quadro_salario_servidores`.
//
// 🚨 A ROTA ÓBVIA É ARMADILHA: `/{slug}/servidor/servidor` é o **Portal do Servidor** (área logada — contracheque,
// ficha funcional, RPPS), NÃO a transparência. Metade dos municípios estava cadastrada nela pela sonda. A
// transparência é `/{slug}/contas`, e dentro dela o relatório certo é `quadro_salario_servidores` — irmão de
// `tabela_padrao_remuneratorio` (que vem vazio) e de `quadro_salario_lista_estagiario`.
//
// A ESTRUTURA é uma ÁRVORE, não uma tabela: Cargo (piso · teto · fundamentação legal · quantidade) →
// Funcionário (nome · data de admissão) → Recibos (competência · tipo). 443 <table> aninhadas numa página.
// ⚠️ O VALOR INDIVIDUAL não está aqui: fica dentro do recibo de cada servidor, uma requisição por pessoa por
// competência. Este coletor pega o nível barato — quem é, em que cargo, desde quando, e a FAIXA (piso/teto) do
// cargo. Por isso a situação é `ok_sem_valor_individual` e não `ok`: os dois fatos ficam separados
// ([[pnigp-sonda-folha-prova-e-a-coleta]]).
//
// 🚨 Linha de FUNCIONÁRIO e linha de RECIBO têm as duas 2 colunas — o que as separa é o formato da data:
// admissão é `dd/mm/aaaa`, competência é `mm/aaaa`. Sem isso, recibo entra como se fosse gente.
//
// Uso: UF=RS node scripts/ingest_folha_digifred.mjs
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
import crypto from "crypto";
import { pool, withRetry } from "./_cadprev.mjs";

const db = pool();
const q = withRetry(db);
const UF = process.env.UF || null;
const SO = process.env.SO || null;
const REFAZ = process.env.REFAZ === "1";
const UA = { "user-agent": "Mozilla/5.0 (compatible; PNIGP/1.0; pesquisa de dados publicos)" };

await q(`create table if not exists folha_servidores_digifred (
  cod_ibge text, municipio text, uf text, competencia text,
  nome text, cargo text, admissao text, piso numeric, teto numeric, fundamentacao text,
  _hash text primary key, _coletado_em timestamptz default now()
)`);
await q(`create index if not exists ix_folha_digifred_mun on folha_servidores_digifred (cod_ibge)`);
await q(`create table if not exists folha_digifred_coleta (
  cod_ibge text primary key, municipio text, uf text, slug text, url text,
  linhas int, cargos int, situacao text, detalhe text, em timestamptz default now()
)`);

// ⭐ sonda + candidatos achados lendo o site oficial (filtros de UF/SO FORA do union)
const alvos = (await q(`
  select * from (
    select s.cod_ibge, s.municipio, s.uf, coalesce(s.url_pessoal, s.url_base) url
      from folha_sonda_municipal s
     where coalesce(s.url_pessoal, s.url_base) ~ 'digifred'
     union
    select c.cod_ibge, c.municipio, c.uf, c.url
      from folha_portal_candidato c where c.produto = 'digifred'
  ) x
   where true ${UF ? "and uf = $1" : ""} ${SO ? `and municipio ilike '%'||$${UF ? 2 : 1}||'%'` : ""}
   order by municipio`, [UF, SO].filter(Boolean))).rows
  // 🚨 um município com DUAS URLs entrava DUAS vezes na fila, e a segunda passagem sobrescrevia o sucesso da
  // primeira: Campos Borges coletou 244 servidores pela URL do host central e logo depois foi carimbado 'erro'
  // ("slug não extraído") pela URL do site próprio. Fica um município coletado com registro de falha — que na
  // próxima varredura vira recoleta ou, pior, classificação de pendência. Uma linha por município, e vence a URL
  // que contém o host do fornecedor, porque é dela que sai o slug.
  .sort((a, b) => Number(/digifred\.net\.br/i.test(b.url)) - Number(/digifred\.net\.br/i.test(a.url)))
  .filter((a, _i, todos) => todos.findIndex((x) => x.cod_ibge === a.cod_ibge) === _i);
const feitos = new Set(REFAZ ? [] : (await q(`select cod_ibge from folha_digifred_coleta
  where situacao like 'ok%'`)).rows.map((r) => r.cod_ibge));
const fila = alvos.filter((a) => !feitos.has(a.cod_ibge));
console.log(`[digifred] ${alvos.length} portais · ${feitos.size} já feitos · ${fila.length} na fila`);

const money = (s) => {
  const m = String(s ?? "").replace(/[R$\s ]/g, "");
  if (!m) return null;
  const n = +m.replace(/\./g, "").replace(",", ".");
  return Number.isFinite(n) ? n : null;
};
const limpo = (s) => { const v = String(s ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim(); return v || null; };
// o portal é ISO-8859-1 e não declara
const dec = (buf) => { let h = new TextDecoder("utf-8").decode(buf); if (/Ã[£§©]|�/.test(h)) h = new TextDecoder("iso-8859-1").decode(buf); return h; };

const EH_ADMISSAO = /^\d{2}\/\d{2}\/\d{4}$/;   // funcionário
const EH_COMPETENCIA = /^\d{2}\/\d{4}$/;       // recibo — NÃO é pessoa

function parseArvore(html) {
  const pessoas = [];
  let cargo = null, piso = null, teto = null, fund = null, nCargos = 0;
  for (const m of html.matchAll(/<tr[^>]*>([\s\S]{0,2000}?)<\/tr>/gi)) {
    const cel = [...m[1].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)].map((x) => limpo(x[1]));
    const uteis = cel.filter(Boolean);
    if (uteis.length >= 5 && money(cel[2]) !== null && money(cel[3]) !== null) {
      // linha de CARGO: [vazio] cargo | piso | teto | fundamentação | quantidade
      cargo = cel[1]; piso = money(cel[2]); teto = money(cel[3]); fund = cel[4]; nCargos++;
      continue;
    }
    if (cel.length === 2 && cel[0] && cel[1] && EH_ADMISSAO.test(cel[1])) {
      pessoas.push({ nome: cel[0], cargo, admissao: cel[1], piso, teto, fundamentacao: fund });
    }
  }
  return { pessoas, nCargos };
}

let totalGeral = 0, ok = 0, falhas = 0;
for (let i = 0; i < fila.length; i++) {
  const a = fila[i];
  // o slug do município no host central sai da própria URL descoberta
  const slug = (a.url.match(/digifred\.net\.br\/([a-z0-9_-]+)/i) || [])[1];
  const url = slug ? `https://sim.digifred.net.br/${slug}/contas/relatorios/quadro_salario_servidores` : null;
  const marca = (situacao, detalhe, linhas = 0, cargos = 0) =>
    q(`insert into folha_digifred_coleta (cod_ibge,municipio,uf,slug,url,linhas,cargos,situacao,detalhe,em)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,now())
       on conflict (cod_ibge) do update set slug=excluded.slug, url=excluded.url, linhas=excluded.linhas,
         cargos=excluded.cargos, situacao=excluded.situacao, detalhe=excluded.detalhe, em=now()`,
      [a.cod_ibge, a.municipio, a.uf, slug, url, linhas, cargos, situacao, detalhe]);
  try {
    if (!url) { await marca("erro", "slug não extraído da URL"); falhas++; continue; }
    const r = await fetch(url, { headers: UA, redirect: "follow", signal: AbortSignal.timeout(180000) });
    if (!r.ok) { await marca("erro", `HTTP ${r.status}`); falhas++; continue; }
    const html = dec(await r.arrayBuffer());
    const { pessoas, nCargos } = parseArvore(html);
    if (!pessoas.length) { await marca("vazio", `${nCargos} cargos, nenhum servidor`, 0, nCargos); falhas++; continue; }

    const regs = pessoas.map((p) => ({
      ...p, cod_ibge: a.cod_ibge, municipio: a.municipio, uf: a.uf, competencia: null,
      _hash: crypto.createHash("md5").update([a.cod_ibge, p.nome, p.cargo, p.admissao].join("|")).digest("hex"),
    }));
    const pp = [...new Map(regs.map((x) => [x._hash, x])).values()];
    if (REFAZ) await q(`delete from folha_servidores_digifred where cod_ibge = $1`, [a.cod_ibge]);
    const c = (f) => pp.map((x) => x[f]);
    await q(`insert into folha_servidores_digifred
      (cod_ibge,municipio,uf,competencia,nome,cargo,admissao,piso,teto,fundamentacao,_hash)
      select * from unnest($1::text[],$2::text[],$3::text[],$4::text[],$5::text[],$6::text[],$7::text[],
        $8::numeric[],$9::numeric[],$10::text[],$11::text[])
      on conflict (_hash) do update set piso=excluded.piso, teto=excluded.teto, _coletado_em=now()`,
      [c("cod_ibge"), c("municipio"), c("uf"), c("competencia"), c("nome"), c("cargo"), c("admissao"),
       c("piso"), c("teto"), c("fundamentacao"), c("_hash")]);

    await marca("ok_sem_valor_individual", "valor só na ficha do servidor (1 req por pessoa)", pp.length, nCargos);
    totalGeral += pp.length; ok++;
    console.log(`  [${i + 1}/${fila.length}] ${a.municipio}: ${pp.length} servidores · ${nCargos} cargos`);
  } catch (e) {
    falhas++;
    await marca("erro", String(e.message).slice(0, 150));
    console.log(`  ✖ [${i + 1}/${fila.length}] ${a.municipio}: ${String(e.message).slice(0, 80)}`);
  }
}
console.log(`\n[digifred] ${totalGeral.toLocaleString("pt-BR")} servidores · ${ok} portais ok · ${falhas} falhas`);
await db.end();
