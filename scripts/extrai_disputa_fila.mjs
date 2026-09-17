// FILA DA DISPUTA — propostas de TODOS os licitantes e LANCES, por processo, roteada pelo GERADOR do documento.
// É a única porta de escrita de app.disputa_proposta_sc / app.disputa_lance_sc / app.disputa_processo_sc.
//
//   node scripts/extrai_disputa_fila.mjs                 # 300 processos, GRAVA
//   DRY=1 LIMIT=500 node scripts/extrai_disputa_fila.mjs # mede sem gravar
//   LIMIT=0 node scripts/extrai_disputa_fila.mjs         # todo o acervo pendente
//
// ═══ POR QUE EXISTE (16/set/2026, ordem do Heitor) ═══
// "Quero saber todos os itens que estão sendo ofertados nos processos, e os lances que estão sendo ofertados pelos
// fornecedores" — e "busque sempre estes dados a partir de agora em todos os processos que leremos". O PNCP publica
// só o vencedor; a disputa inteira mora na ATA que o portal anexa. Até aqui só o e-Customize era lido (606
// processos, 1,7% do PCP) porque a âncora do parser não sobrevivia ao nome quebrado em duas linhas.
//
// ═══ O DESENHO (o mesmo da fila de marca, extrai_marca_fila.mjs) ═══
// · Para cada processo: os documentos do acervo local; cada documento é reconhecido pelo CONTEÚDO e vai ao leitor
//   do seu gerador (parser_disputa_*.mjs). Nunca pelo portal, nunca pelo título (pnigp-gerador-documento-roteador).
// · O leitor devolve BLOCOS (item ou lote do documento), PROPOSTAS e LANCES com identidade = CNPJ (ou apelido,
//   quando a ata anonimiza — AZ). Quem casa o bloco com o item do PNCP é ESTA fila: pela DESCRIÇÃO (casaItens,
//   a lição de pnigp-proposta-item-errado), e só no fallback pelo número, quando a numeração do PNCP é sequencial.
//   Sem casar, a linha entra MESMO ASSIM com numero NULL e casamento='nenhum' — a disputa existe e é do processo;
//   o que não se afirma é a qual item ela pertence.
// · Lote: a oferta vale para o lote (base_valor='total'); itens_lote guarda os itens do PNCP que o lote cobre.
// · Grava em LOTE (unnest) e substitui o que havia do processo (DELETE+INSERT) — reprocessar é idempotente.
// · Livro-razão app.disputa_fila_feitas_sc com VERSÃO: subir DISPUTA_VERSAO reabre a fila sozinho.
//   'sem_documento' aposenta só enquanto n_docs não mudar (documento chega depois).
import fs from "fs";
import pg from "pg";
import { leDisputaPcp } from "./parser_disputa_pcp.mjs";
import { leDisputaComprasGov } from "./parser_disputa_comprasgov.mjs";
import { leDisputaBetha } from "./parser_disputa_betha.mjs";
import { leDisputaAz } from "./parser_disputa_az.mjs";
import { leDisputaLicitar } from "./parser_disputa_licitar.mjs";
import { leDisputaElic } from "./parser_disputa_elic.mjs";
import { casaItens } from "./parser_az.mjs";
import { carimboBR } from "./hora_br.mjs";

export const DISPUTA_VERSAO = 1;

const U = fs.readFileSync("./.env.local", "utf8").match(/^DATABASE_URL=(.+)$/m)[1].trim();
const db = new pg.Pool({ connectionString: U, ssl: { rejectUnauthorized: false }, max: 3, statement_timeout: 590000 });
const UF = (process.env.UF || "sc").toLowerCase();
const DRY = process.env.DRY === "1";
const LIM = process.env.LIMIT != null ? Number(process.env.LIMIT) : 300;
const LOTE = Number(process.env.LOTE || 25);
// SHARD=k/N particiona a fila pelo md5 do processo — para rodar N instâncias em paralelo sem se pisarem
// (cada uma vê só a sua fatia do acervo). Sem SHARD, uma instância vê tudo.
const [SHARD_K, SHARD_N] = (process.env.SHARD || "0/1").split("/").map(Number);
const T_PROP = `app.disputa_proposta_${UF}`, T_LANCE = `app.disputa_lance_${UF}`, T_PROC = `app.disputa_processo_${UF}`, FEITAS = `app.disputa_fila_feitas_${UF}`;

// ═══ RECONHECIMENTO PELO CONTEÚDO — assinaturas POSITIVAS de documento de DISPUTA (não de resultado, não de edital) ═══
// Cada assinatura é o que só a ata daquele gerador escreve. Edital fala em "lances enviados" na prosa — por isso
// a assinatura do PCP exige o CABEÇALHO de tabela, não a palavra.
const NBSP = String.fromCharCode(160);
const LEITORES = [
  { gerador: "pcp", fn: leDisputaPcp, teste: (t) => /Fornecedor\s+CNPJ\s*\/\s*CPF\s+Data/i.test(t) || /Data\s+Valor\s+CNPJ\s+Situa[çc][ãa]o/i.test(t) },
  { gerador: "comprasgov", fn: leDisputaComprasGov, teste: (t) => /Propostas do Item\s+\d+|Lances do Item\s+\d+/i.test(t) },
  { gerador: "betha", fn: leDisputaBetha, teste: (t) => /Oferta Inicial\s+Oferta Final/i.test(t) },
  { gerador: "az", fn: leDisputaAz, teste: (t) => /Ata de Realiza[çc][ãa]o d[ao] (?:Preg[ãa]o|Compra Direta|Dispensa|Concorr[êe]ncia)/i.test(t) && /Propostas Iniciais|Valor da proposta inicial/i.test(t) },
  { gerador: "elic", fn: leDisputaElic, teste: (t) => /ATA DA SESS[ÃA]O P[ÚU]BLICA POR (?:LOTE|ITEM)/i.test(t) && /ETAPA DE LANCES/i.test(t) },
  { gerador: "licitar_digital", fn: leDisputaLicitar, teste: (t) => /Licitar Digital\s*::/i.test(t) && /ATA DE PROPOSTAS ENVIADAS|FORNECEDORES HABILITADOS|ATA (?:DE )?PREG[ÃA]O|ATA (?:DE )?DISPENSA/i.test(t) },
];

async function q(sql, params) {
  for (let t = 0; t < 5; t++) {
    try { return await db.query(sql, params); }
    catch (e) {
      const transitorio = /Connection terminated|ECONNRESET|timeout|terminating connection|socket hang up/i.test(e.message || "");
      if (!transitorio || t === 4) throw e;
      await new Promise((r) => setTimeout(r, 2000 * (t + 1)));
    }
  }
}

async function garanteTabelas() {
  await q(`create table if not exists ${T_PROP}(
    cnpj text, ano int, seq int, gerador text, ref text, nivel text,
    numero int, itens_lote int[], casamento text, sim numeric,
    fornecedor_ni text, fornecedor_alias text, fornecedor text,
    fornecedor_key text generated always as (coalesce(fornecedor_ni, 'alias:'||fornecedor_alias, 'nome:'||lower(fornecedor), '?')) stored,
    me_epp boolean, uf text, marca text, modelo text, fabricante text, marca_declarada boolean, quantidade numeric,
    valor_inicial numeric, valor_final numeric, valor_total numeric, base_valor text, situacao text, ordem int, data_hora text,
    descricao_doc text, fonte_titulo text, versao int, atualizado timestamptz default now(),
    primary key (cnpj,ano,seq,gerador,ref,fornecedor_key))`);
  await q(`create index if not exists disputa_proposta_${UF}_ni on ${T_PROP}(fornecedor_ni)`);
  await q(`create index if not exists disputa_proposta_${UF}_item on ${T_PROP}(cnpj,ano,seq,numero)`);
  await q(`create table if not exists ${T_LANCE}(
    cnpj text, ano int, seq int, gerador text, ref text, nivel text, numero int, itens_lote int[], casamento text,
    ordem int, fornecedor_ni text, fornecedor_alias text, fornecedor text, valor numeric, data_hora text, tipo text, situacao text,
    fonte_titulo text, versao int, atualizado timestamptz default now(),
    primary key (cnpj,ano,seq,gerador,ref,ordem))`);
  await q(`create index if not exists disputa_lance_${UF}_ni on ${T_LANCE}(fornecedor_ni)`);
  await q(`create table if not exists ${T_PROC}(
    cnpj text, ano int, seq int, n_participantes int, n_participantes_ni int, n_propostas int, n_lances int,
    n_blocos int, n_blocos_casados int, geradores text, versao int, atualizado timestamptz default now(),
    primary key (cnpj,ano,seq))`);
  await q(`create table if not exists ${FEITAS}(
    cnpj text, ano int, seq int, status text, geradores text, n_propostas int default 0, n_lances int default 0,
    n_docs int, versao int, atualizado timestamptz default now(), primary key (cnpj,ano,seq))`);
}

async function itensDo(cnpj, ano, seq) {
  const { rows } = await q(`select numero, descricao from itens_${UF} where cnpj=$1 and ano=$2 and seq=$3`, [cnpj, ano, seq]);
  return rows.map((r) => ({ numero: Number(r.numero), descricao: r.descricao }));
}

// ═══ CASAMENTO bloco → item do PNCP ═══
// 1) descrição (casaItens, MIN_SIM 0,6) — é o que sobrevive ao número torto na origem (pnigp-itens-numero-id-na-origem);
// 2) número, só quando a numeração do PNCP é sequencial (nenhum "numero" acima de 5000) e o número existe;
// 3) lote: cada item do documento passa pelas mesmas regras; 1 item → resolve para o item.
function casaBlocos(blocos, itens) {
  const seqOk = itens.length > 0 && Math.max(...itens.map((i) => i.numero)) <= 5000;
  const nums = new Set(itens.map((i) => i.numero));
  const porDesc = casaItens(blocos.map((b) => ({ item: b.ref, descricao: b.descricao || "" })), itens);
  const out = new Map();
  blocos.forEach((b, i) => {
    let numero = null, casamento = "nenhum", sim = porDesc[i]?.simItem ?? 0, itensLote = null;
    if (b.nivel === "lote" && Array.isArray(b.itens_doc) && b.itens_doc.length) {
      itensLote = seqOk ? b.itens_doc.filter((n) => nums.has(n)) : [];
      if (itensLote.length === 1) { numero = itensLote[0]; casamento = "lote_1_item"; }
      else if (itensLote.length > 1) casamento = "lote";
      else if (porDesc[i]?.numero != null && b.itens_doc.length === 1) { numero = porDesc[i].numero; casamento = "descricao"; itensLote = [numero]; }
    } else if (porDesc[i]?.numero != null) { numero = porDesc[i].numero; casamento = "descricao"; }
    else if (seqOk && b.item != null && nums.has(Number(b.item))) { numero = Number(b.item); casamento = "numero"; }
    // lote GLOBAL sem itens declarados (PCP "0001 - LOTE GLOBAL"): cobre todos os itens do processo
    if (b.nivel === "lote" && !itensLote?.length && /^LOTE GLOBAL/i.test(b.descricao || "") && itens.length) { itensLote = itens.map((i) => i.numero); casamento = itensLote.length === 1 ? "lote_1_item" : "lote"; if (itensLote.length === 1) numero = itensLote[0]; }
    out.set(b.ref, { numero, casamento, sim: Number(sim.toFixed(3)), itens_lote: itensLote && itensLote.length ? itensLote : null });
  });
  return out;
}

// ═══ GRAVAÇÃO EM LOTE — uma ida ao banco por tabela, por FATIA ═══
// Medido em 16/set: gravando por processo (4–6 idas ao Neon cada), a fila fazia 1,5 processo/s — 249 mil processos
// levariam dois dias. A leitura sozinha faz 28/s. O banco é o gargalo (feedback-banco-e-o-gargalo): acumula a fatia
// inteira em memória e grava com unnest; o int[] por linha (itens_lote) viaja como texto '{1,2}' e volta com ::int[].
const arrTxt = (a) => (a && a.length ? "{" + a.join(",") + "}" : null);
async function gravaFatia(W) {
  if (W.apaga.length) {
    const keys = W.apaga.map((_, j) => `($${j * 3 + 1},$${j * 3 + 2},$${j * 3 + 3})`).join(",");
    const params = W.apaga.flatMap((p) => [p.cnpj, p.ano, p.seq]);
    await q(`delete from ${T_PROP} where (cnpj,ano,seq) in (${keys})`, params);
    await q(`delete from ${T_LANCE} where (cnpj,ano,seq) in (${keys})`, params);
  }
  const P = W.prop;
  if (P.length) await q(`
    insert into ${T_PROP}(cnpj,ano,seq,gerador,ref,nivel,numero,itens_lote,casamento,sim,fornecedor_ni,fornecedor_alias,fornecedor,
      me_epp,uf,marca,modelo,fabricante,marca_declarada,quantidade,valor_inicial,valor_final,valor_total,base_valor,situacao,ordem,data_hora,descricao_doc,fonte_titulo,versao)
    select x.cnpj,x.ano,x.seq,x.gerador,x.ref,x.nivel,x.numero,x.il::int[],x.casamento,x.sim,x.ni,x.alias,x.forn,
      x.me,x.uf,x.marca,x.modelo,x.fab,x.md,x.qtd,x.vi,x.vf,x.vt,x.base,x.sit,x.ordem,x.dh,x.desc_doc,x.titulo, ${DISPUTA_VERSAO}
      from unnest($1::text[],$2::int[],$3::int[],$4::text[],$5::text[],$6::text[],$7::int[],$8::text[],$9::text[],$10::numeric[],$11::text[],$12::text[],$13::text[],
                  $14::bool[],$15::text[],$16::text[],$17::text[],$18::text[],$19::bool[],$20::numeric[],$21::numeric[],$22::numeric[],$23::numeric[],$24::text[],$25::text[],$26::int[],$27::text[],$28::text[],$29::text[])
           as x(cnpj,ano,seq,gerador,ref,nivel,numero,il,casamento,sim,ni,alias,forn,me,uf,marca,modelo,fab,md,qtd,vi,vf,vt,base,sit,ordem,dh,desc_doc,titulo)
    on conflict (cnpj,ano,seq,gerador,ref,fornecedor_key) do update set
      numero=excluded.numero, itens_lote=excluded.itens_lote, casamento=excluded.casamento, sim=excluded.sim, fornecedor=excluded.fornecedor,
      me_epp=excluded.me_epp, uf=excluded.uf, marca=excluded.marca, modelo=excluded.modelo, fabricante=excluded.fabricante, marca_declarada=excluded.marca_declarada,
      quantidade=excluded.quantidade, valor_inicial=excluded.valor_inicial, valor_final=excluded.valor_final, valor_total=excluded.valor_total, base_valor=excluded.base_valor,
      situacao=excluded.situacao, ordem=excluded.ordem, data_hora=excluded.data_hora, descricao_doc=excluded.descricao_doc, fonte_titulo=excluded.fonte_titulo, versao=excluded.versao, atualizado=now()`,
    [P.map((r) => r.p.cnpj), P.map((r) => r.p.ano), P.map((r) => r.p.seq),
      P.map((r) => r.g), P.map((r) => String(r.x.ref).slice(0, 80)), P.map((r) => r.x.nivel || "item"), P.map((r) => r.m.numero), P.map((r) => arrTxt(r.m.itens_lote)),
      P.map((r) => r.m.casamento), P.map((r) => r.m.sim), P.map((r) => r.x.ni || null), P.map((r) => r.x.alias || null), P.map((r) => r.x.fornecedor || null),
      P.map((r) => r.x.me_epp ?? null), P.map((r) => r.x.uf || null), P.map((r) => r.x.marca || null), P.map((r) => r.x.modelo || null), P.map((r) => r.x.fabricante || null), P.map((r) => !!r.x.marca_declarada),
      P.map((r) => r.x.quantidade ?? null), P.map((r) => r.x.valor_inicial ?? null), P.map((r) => r.x.valor_final ?? null), P.map((r) => r.x.valor_total ?? null), P.map((r) => r.x.base_valor || "unitario"),
      P.map((r) => r.x.situacao || null), P.map((r) => r.x.ordem ?? null), P.map((r) => r.x.data_hora || null), P.map((r) => r.x.descricao ? String(r.x.descricao).slice(0, 600) : null), P.map((r) => String(r.titulo || "").slice(0, 120))]);
  const Lc = W.lance;
  if (Lc.length) await q(`
    insert into ${T_LANCE}(cnpj,ano,seq,gerador,ref,nivel,numero,itens_lote,casamento,ordem,fornecedor_ni,fornecedor_alias,fornecedor,valor,data_hora,tipo,situacao,fonte_titulo,versao)
    select x.cnpj,x.ano,x.seq,x.gerador,x.ref,x.nivel,x.numero,x.il::int[],x.casamento,x.ordem,x.ni,x.alias,x.forn,x.valor,x.dh,x.tipo,x.sit,x.titulo, ${DISPUTA_VERSAO}
      from unnest($1::text[],$2::int[],$3::int[],$4::text[],$5::text[],$6::text[],$7::int[],$8::text[],$9::text[],$10::int[],$11::text[],$12::text[],$13::text[],$14::numeric[],$15::text[],$16::text[],$17::text[],$18::text[])
           as x(cnpj,ano,seq,gerador,ref,nivel,numero,il,casamento,ordem,ni,alias,forn,valor,dh,tipo,sit,titulo)
    on conflict (cnpj,ano,seq,gerador,ref,ordem) do update set numero=excluded.numero, itens_lote=excluded.itens_lote, casamento=excluded.casamento, fornecedor_ni=excluded.fornecedor_ni,
      fornecedor_alias=excluded.fornecedor_alias, fornecedor=excluded.fornecedor, valor=excluded.valor, data_hora=excluded.data_hora, tipo=excluded.tipo, situacao=excluded.situacao,
      fonte_titulo=excluded.fonte_titulo, versao=excluded.versao, atualizado=now()`,
    [Lc.map((r) => r.p.cnpj), Lc.map((r) => r.p.ano), Lc.map((r) => r.p.seq),
      Lc.map((r) => r.g), Lc.map((r) => String(r.x.ref).slice(0, 80)), Lc.map((r) => r.x.nivel || "item"), Lc.map((r) => r.m.numero), Lc.map((r) => arrTxt(r.m.itens_lote)), Lc.map((r) => r.m.casamento), Lc.map((r) => r.x.ordem),
      Lc.map((r) => r.x.ni || null), Lc.map((r) => r.x.alias || null), Lc.map((r) => r.x.fornecedor || null), Lc.map((r) => r.x.valor ?? null), Lc.map((r) => r.x.data_hora || null),
      Lc.map((r) => r.x.tipo || "lance"), Lc.map((r) => r.x.situacao || null), Lc.map((r) => String(r.titulo || "").slice(0, 120))]);
  const Pr = W.proc;
  if (Pr.length) await q(`
    insert into ${T_PROC}(cnpj,ano,seq,n_participantes,n_participantes_ni,n_propostas,n_lances,n_blocos,n_blocos_casados,geradores,versao)
    select x.*, ${DISPUTA_VERSAO} from unnest($1::text[],$2::int[],$3::int[],$4::int[],$5::int[],$6::int[],$7::int[],$8::int[],$9::int[],$10::text[]) as x(cnpj,ano,seq,a,b,c,d,e,f,g)
    on conflict (cnpj,ano,seq) do update set n_participantes=excluded.n_participantes, n_participantes_ni=excluded.n_participantes_ni, n_propostas=excluded.n_propostas,
      n_lances=excluded.n_lances, n_blocos=excluded.n_blocos, n_blocos_casados=excluded.n_blocos_casados, geradores=excluded.geradores, versao=excluded.versao, atualizado=now()`,
    [Pr.map((r) => r.p.cnpj), Pr.map((r) => r.p.ano), Pr.map((r) => r.p.seq), Pr.map((r) => r.nPart), Pr.map((r) => r.nPartNi), Pr.map((r) => r.nP), Pr.map((r) => r.nL), Pr.map((r) => r.nBlocos), Pr.map((r) => r.nCasados), Pr.map((r) => r.gers)]);
  const F = W.feitas;
  if (F.length) await q(`
    insert into ${FEITAS}(cnpj,ano,seq,status,geradores,n_propostas,n_lances,n_docs,versao)
    select x.*, ${DISPUTA_VERSAO} from unnest($1::text[],$2::int[],$3::int[],$4::text[],$5::text[],$6::int[],$7::int[],$8::int[]) as x(cnpj,ano,seq,status,gers,np,nl,nd)
    on conflict (cnpj,ano,seq) do update set status=excluded.status, geradores=excluded.geradores, n_propostas=excluded.n_propostas, n_lances=excluded.n_lances, n_docs=excluded.n_docs, versao=excluded.versao, atualizado=now()`,
    [F.map((r) => r.cnpj), F.map((r) => r.ano), F.map((r) => r.seq), F.map((r) => r.status), F.map((r) => r.gers), F.map((r) => r.nP), F.map((r) => r.nL), F.map((r) => r.nDocs)]);
}

async function main() {
  await garanteTabelas();
  const lim = LIM > 0 ? `limit ${LIM}` : ``;
  const { rows: procs } = await q(`
    with d as (select cnpj, ano, seq, count(*)::int n_docs from arquivo_texto_${UF} where chars > 300 group by 1,2,3)
    select d.cnpj, d.ano, d.seq, d.n_docs
      from d
     where exists (select 1 from itens_${UF} i where i.cnpj=d.cnpj and i.ano=d.ano and i.seq=d.seq)
       -- feito nesta versão fica fora; 'sem_disputa' volta quando o processo ganha documento novo (n_docs mudou)
       and mod(('x'||left(md5(d.cnpj||d.ano::text||d.seq::text),8))::bit(32)::int & 2147483647, ${SHARD_N}) = ${SHARD_K}
       and not exists (select 1 from ${FEITAS} f
                        where f.cnpj=d.cnpj and f.ano=d.ano and f.seq=d.seq
                          and f.versao = ${DISPUTA_VERSAO}
                          and (f.status = 'ok' or (f.status in ('sem_disputa','sem_documento') and f.n_docs = d.n_docs)))
     order by md5(d.cnpj||d.ano::text||d.seq::text) ${lim}`);
  if (!procs.length) { console.log(`${carimboBR()} disputa: acervo fechado — nada a extrair`); await db.end(); return; }
  console.log(`${carimboBR()} fila da disputa · ${procs.length} processos · DRY=${DRY ? 1 : 0} · lote ${LOTE} · v${DISPUTA_VERSAO} · shard ${SHARD_K}/${SHARD_N}`);

  const tot = { ok: 0, sem_disputa: 0, sem_documento: 0, propostas: 0, lances: 0, blocos: 0, casados: 0 };
  const porGerador = {};
  let feitos = 0;

  for (let i = 0; i < procs.length; i += LOTE) {
    const fatia = procs.slice(i, i + LOTE);
    const W = { feitas: [], apaga: [], prop: [], lance: [], proc: [] };
    const tF0 = Date.now();
    const { rows: docs } = await q(`
      select cnpj, ano, seq, titulo, texto from arquivo_texto_${UF}
       where (cnpj,ano,seq) in (${fatia.map((_, j) => `($${j * 3 + 1},$${j * 3 + 2},$${j * 3 + 3})`).join(",")}) and chars > 300`,
      fatia.flatMap((p) => [p.cnpj, p.ano, p.seq]));
    const tF1 = Date.now();
    const porProc = new Map();
    for (const d of docs) { const k = `${d.cnpj}|${d.ano}|${d.seq}`; if (!porProc.has(k)) porProc.set(k, []); porProc.get(k).push(d); }

    for (const p of fatia) {
      feitos++;
      const meus = porProc.get(`${p.cnpj}|${p.ano}|${p.seq}`) || [];
      // por gerador, fica o documento que mais disputa rendeu (AtaTotal × AtaFracassado do mesmo processo)
      const melhorPorGerador = new Map();
      let leuAlgum = false;
      for (const d of meus) {
        const t = String(d.texto || "").split(NBSP).join(" ");
        for (const L of LEITORES) {
          if (!L.teste(t)) continue;
          let r; try { r = L.fn(t); } catch { continue; }
          if (!r?.achou) continue;
          leuAlgum = true;
          const peso = r.propostas.length + r.lances.length;
          const ant = melhorPorGerador.get(L.gerador);
          if (!ant || peso > ant.peso) melhorPorGerador.set(L.gerador, { r, peso, titulo: d.titulo });
        }
      }
      const status = !meus.length ? "sem_documento" : !leuAlgum ? "sem_disputa" : "ok";
      const P = [], Lc = [], gers = [];
      let nBlocos = 0, nCasados = 0;
      if (melhorPorGerador.size) {
        const itens = await itensDo(p.cnpj, p.ano, p.seq);
        for (const [g, { r, titulo }] of melhorPorGerador) {
          gers.push(g);
          const mapa = casaBlocos(r.blocos, itens);
          nBlocos += r.blocos.length; nCasados += [...mapa.values()].filter((m) => m.numero != null || m.itens_lote).length;
          // dedup proposta por (ref, identidade): fica a de menor valor final
          const vistos = new Map();
          for (const x of r.propostas) {
            const key = `${x.ref}|${x.ni || (x.alias ? "alias:" + x.alias : "nome:" + String(x.fornecedor || "").toLowerCase())}`;
            const ant = vistos.get(key);
            if (!ant || (x.valor_final != null && (ant.valor_final == null || x.valor_final < ant.valor_final))) vistos.set(key, x);
          }
          for (const x of vistos.values()) {
            const m = mapa.get(x.ref) || { numero: null, casamento: "nenhum", sim: 0, itens_lote: null };
            P.push({ g, x, m, titulo });
          }
          const ordSeen = new Set();
          for (const x of r.lances) {
            const k = `${x.ref}|${x.ordem}`; if (ordSeen.has(k)) continue; ordSeen.add(k);
            const m = mapa.get(x.ref) || { numero: null, casamento: "nenhum", sim: 0, itens_lote: null };
            Lc.push({ g, x, m, titulo });
          }
          porGerador[g] = porGerador[g] || { processos: 0, propostas: 0, lances: 0 };
          porGerador[g].processos++; porGerador[g].propostas += vistos.size; porGerador[g].lances += r.lances.length;
        }
      }
      tot[status]++; tot.propostas += P.length; tot.lances += Lc.length; tot.blocos += nBlocos; tot.casados += nCasados;

      // acumula; a fatia inteira grava de uma vez (gravaFatia)
      W.feitas.push({ cnpj: p.cnpj, ano: p.ano, seq: p.seq, status, gers: gers.join(",") || null, nP: P.length, nL: Lc.length, nDocs: meus.length });
      if (status === "ok") {
        W.apaga.push(p);
        for (const r of P) W.prop.push({ p, ...r });
        for (const r of Lc) W.lance.push({ p, ...r });
        const ids = new Set(P.map((r) => r.x.ni || (r.x.alias ? `alias:${r.x.alias}` : `nome:${r.x.fornecedor}`)));
        const idsNi = new Set(P.filter((r) => r.x.ni).map((r) => r.x.ni));
        W.proc.push({ p, nPart: ids.size, nPartNi: idsNi.size, nP: P.length, nL: Lc.length, nBlocos, nCasados, gers: gers.join(",") });
      }
      if (feitos % 25 === 0 || feitos === procs.length)
        process.stdout.write(`  ${feitos}/${procs.length} · ok ${tot.ok} · sem disputa ${tot.sem_disputa} · propostas ${tot.propostas} · lances ${tot.lances}\r`);
    }
    const tF2 = Date.now();
    if (!DRY) await gravaFatia(W);
    if (process.env.PROFILE) console.log(`
  fatia: fetch ${tF1 - tF0}ms (${docs.length} docs, ${(docs.reduce((a, d) => a + (d.texto?.length || 0), 0) / 1e6).toFixed(1)}M) · leitura ${tF2 - tF1}ms · escrita ${Date.now() - tF2}ms`);
  }
  console.log(`\n${carimboBR()} fim · ${feitos} processos · com disputa ${tot.ok} · sem disputa no acervo ${tot.sem_disputa} · sem documento ${tot.sem_documento}`);
  console.log(`   propostas ${tot.propostas} · lances ${tot.lances} · blocos ${tot.blocos} (casados com item do PNCP: ${tot.casados})`);
  console.table(Object.entries(porGerador).map(([gerador, v]) => ({ gerador, ...v })));
  if (!DRY) {
    const { rows } = await q(`select (select count(*) from ${T_PROC}) processos, (select count(*) from ${T_PROP}) propostas, (select count(distinct fornecedor_ni) from ${T_PROP} where fornecedor_ni is not null) fornecedores, (select count(*) from ${T_LANCE}) lances`);
    console.log("estado da base:"); console.table(rows);
  }
  await db.end();
}
main().catch((e) => { console.error("ERRO:", e.message); process.exit(1); });
