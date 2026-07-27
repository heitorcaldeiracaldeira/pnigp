// COLETOR ComprasBR (AZ) — marca do portal AZ Informática. Portal próprio 100% GATED por LOGIN (auth pura,
// não reCAPTCHA) → NÃO se lê direto. ROTA LIMPA = o doc de resultado que a bolsa 14.133 PUBLICA no PNCP, já
// espelhado no ACERVO LOCAL arquivo_texto_${uf} (titulo 'Resultados' = Ata de Realização do Pregão AZ).
// ZERO chamada externa: filtra por PK do proc, nunca varre o acervo inteiro.
//
// ONDE VIVE A MARCA (provado ao vivo, jul/2026): a Ata AZ tem DOIS layouts —
//   (1) NARRATIVO (Propostas Iniciais / Lances / Adjudicação): SEM marca (a maioria dos medicamentos/alimentos);
//   (2) COLUNAR  "CNPJ/CPF Nome Marca Modelo Situação Valor": a linha do VENCEDOR traz CNPJ + valor + marca+modelo.
// O parser pega as linhas 'Vencedor' do layout colunar e ANCORA por TRAVA DUPLA: cnpj_fornecedor + unit_homologado
// (±R$0,02) casando itens_${uf}. Sem posição/ordem. 1.317 de 5.823 atas 'Resultados' são colunar → marca real ~90%.
// Fallback: Contrato/Termo colunar ("… Especificação Marca/Modelo Valor: 'Serra mármore DEWALT R$ 402,00'") —
//   ancora por valor (sem CNPJ na linha → cnpj_ok=false).
//
// Grava em app.item_marca_conferida_${uf} (portal='ComprasBR (AZ)') EM LOTE (unnest), nunca row-by-row.
// Idempotente (app.az_feitas_${uf}, PK cnpj,ano,seq). State-agnostic (UF por env). DRY=1 mede sem gravar.
//   node scripts/auditoria/coletor_comprasbr_az.mjs   (LIMIT=15 p/ validar; LIMIT=0 = todo o acervo)
import fs from "fs"; import pg from "pg";
import { limpaMarca, parseBR } from "../portais_comportamento.mjs";

const U = fs.readFileSync("./.env.local", "utf8").match(/^DATABASE_URL=(.+)$/m)[1].trim();
const db = new pg.Pool({ connectionString: U, ssl: { rejectUnauthorized: false }, max: 3, statement_timeout: 590000 });
const UF = (process.env.UF || "sc").toLowerCase();
const PORTAL = "ComprasBR (AZ)";
const CONF = `app.item_marca_conferida_${UF}`, FEITAS = `app.az_feitas_${UF}`;
const LIM = process.env.LIMIT != null ? Number(process.env.LIMIT) : 30;
const DRY = process.env.DRY === "1";
// marcas "genéricas" (própria/diversas/…) — recorda-se (é o que o doc diz) mas conta à parte no relatório
const GENERICA = /^(pr[oó]pri[ao]?|diversas?|diversos?|v[aá]ri[ao]s?|sem marca|nacional|generic[ao]?|s\/?\s*marca|nd|na)$/i;
// títulos/tipos de doc de RESULTADO (onde a marca pode viver) — filtro por PK, nunca scan
const RESRE = "(a.titulo ~* 'ata|homolog|adjudic|vencedor|resultad|proposta|contrato' or a.tipo_documento ~* 'ata|homolog|adjudic|resultad|proposta|contrato|registro de pre')";

// ---- PARSER 1: Ata AZ layout COLUNAR — linhas 'Vencedor' (CNPJ + valor + marca+modelo) ----
function parseAtaAZ(txt) {
  const out = [];
  // {CNPJ} {valor},dddd Vencedor{marca modelo}  → até a próxima Nome+CNPJ / Lote / Item / Classificado / fim
  const re = /(\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2})\s+([\d.]+,\d{2,4})\s*Vencedor\s*([A-Za-zÀ-ÿ0-9][\s\S]{0,60}?)(?=\s+[A-ZÀ-Ÿ][A-Za-zÀ-ÿ&.\/ -]{1,40}?\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}|\s+Lote\s|\s+Item\s|\s+Classificad|\s+Desclassificad|$)/g;
  let m;
  while ((m = re.exec(txt))) {
    const cnpj = m[1].replace(/\D/g, ""); const valor = parseBR(m[2]);
    // corta o blob no 1º sinal do PRÓXIMO registro (CNPJ, valor ,dddd, ou N/C) — evita modelo sangrar p/ a próxima linha
    let blob = m[3].split(/\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}|[\d.]+,\d{4}|\bN\/C\b/)[0].replace(/\s+/g, " ").trim();
    const toks = blob.split(" ").filter(Boolean);
    const marca = limpaMarca(toks[0]) || limpaMarca(toks.slice(0, 2).join(" "));
    if (valor != null && marca) out.push({ cnpj, valor, marca, modelo: toks.slice(1).join(" ").slice(0, 60) || null, padrao: "colunar_ata" });
  }
  return out;
}
// ---- PARSER 2 (fallback): Contrato/Termo colunar "… {desc} {MARCA} R$ {unit},NN R$ {total},NN" ----
function parseContratoAZ(txt) {
  const out = [];
  const re = /\b(\d{1,4})\s+([\d.,]+)\s+([A-Za-zçÇºª\/.]{1,15})\s+(.+?)\s+R\$\s*([\d.]+,\d{2})\s+R\$\s*([\d.]+,\d{2})/g;
  let m;
  while ((m = re.exec(txt))) {
    const meio = m[4].trim().split(/\s+/);
    const marca = limpaMarca(meio.slice(-1)[0]) || limpaMarca(meio.slice(-2).join(" "));
    const vu = parseBR(m[5]);
    if (marca && vu != null) out.push({ cnpj: null, valor: vu, marca, modelo: null, padrao: "colunar_contrato" });
  }
  return out;
}
// estrutura da marca no doc (relatório)
function estruturaDoc(txt) {
  if (!txt || txt.replace(/\s/g, "").length < 40) return "vazio_ausente";
  if (/Nome\s+Marca\s+Modelo/.test(txt)) return "colunar";
  if (/Especifica[çc][aã]o\s+Marca\/?Modelo/i.test(txt)) return "colunar";
  if (/\bmarca\b/i.test(txt)) return "na_descricao";
  return "vazio_ausente";
}

async function main() {
  const q = async (s, p) => (await db.query(s, p)).rows;
  await db.query(`create table if not exists ${FEITAS}(cnpj text,ano int,seq int,status text,n int,estrutura text,atualizado timestamptz default now(),primary key(cnpj,ano,seq))`);
  const lim = LIM > 0 ? `limit ${LIM}` : ``;
  const procs = await q(`
    select distinct p.cnpj,p.ano,p.seq from app.processo_portal_real p
    where p.portal_real='${PORTAL}'
      and exists(select 1 from itens_${UF} i where i.cnpj=p.cnpj and i.ano=p.ano and i.seq=p.seq and i.unit_homologado is not null)
      and exists(select 1 from arquivo_texto_${UF} a where a.cnpj=p.cnpj and a.ano=p.ano and a.seq=p.seq and a.excluido_em is null and ${RESRE})
      and not exists(select 1 from ${CONF} c where c.cnpj=p.cnpj and c.ano=p.ano and c.seq=p.seq and c.portal='${PORTAL}')
      and not exists(select 1 from ${FEITAS} f where f.cnpj=p.cnpj and f.ano=p.ano and f.seq=p.seq)
    ${lim}`);
  if (procs.length === 0) { console.log(`acervo ${PORTAL} fechado — nada a coletar`); await db.end(); return; }
  console.log(`${PORTAL} a coletar: ${procs.length}${DRY ? " (DRY)" : ""}`);
  let comMarca = 0, itensTot = 0, reais = 0, feitos = 0, estAcc = {};

  for (const p of procs) {
    // docs de RESULTADO deste proc (só PK — nunca scan do acervo); prioriza 'Resultados'/ata
    const docs = await q(`
      select a.titulo, a.texto from arquivo_texto_${UF} a
      where a.cnpj=$1 and a.ano=$2 and a.seq=$3 and a.excluido_em is null and ${RESRE}
      order by (a.titulo ilike 'Resultados') desc, (a.titulo ~* 'ata|homolog') desc, a.chars desc`, [p.cnpj, p.ano, p.seq]);
    const txt = docs.map(d => d.texto || "").join("\n");
    const tituloFonte = docs[0]?.titulo || "Resultados";
    const est = estruturaDoc(txt); estAcc[est] = (estAcc[est] || 0) + 1;

    // pares do layout colunar da ata (com CNPJ) + fallback contrato (só valor)
    let pares = parseAtaAZ(txt);
    const temCnpj = pares.length > 0;
    if (!pares.length) pares = parseContratoAZ(txt);

    const itens = await q(`select numero, unit_homologado, cnpj_fornecedor from itens_${UF} where cnpj=$1 and ano=$2 and seq=$3 and unit_homologado is not null`, [p.cnpj, p.ano, p.seq]);
    const vistoN = new Set(); const hits = [];
    for (const par of pares) {
      // TRAVA DUPLA: cnpj_fornecedor + unit_homologado (±0,02). Contrato: só valor (cnpj_ok=false).
      const it = itens.find(i =>
        (par.cnpj ? i.cnpj_fornecedor === par.cnpj : true) &&
        Math.abs(Number(i.unit_homologado) - par.valor) <= 0.02 &&
        !vistoN.has(i.numero));
      if (it) {
        vistoN.add(it.numero);
        hits.push({ numero: String(it.numero), marca: par.marca, modelo: par.modelo, valor: par.valor, forn: it.cnpj_fornecedor, cnpj_ok: !!par.cnpj });
      }
    }

    let status = "sem_doc_colunar", n = 0;
    if (pares.length && !hits.length) status = "sem_ancora";
    if (hits.length) {
      status = "ok"; n = hits.length; comMarca++; itensTot += n;
      reais += hits.filter(h => !GENERICA.test(h.marca)).length;
      if (!DRY) {
        await db.query(`
          insert into ${CONF} (cnpj,ano,seq,numero,marca,modelo,valor,fornecedor_cnpj,cnpj_ok,valor_ok,marca_generica,portal,fonte_titulo)
          select $1,$2,$3, x.numero, x.marca, x.modelo, x.valor, x.forn, x.cnpj_ok, true, x.gen, '${PORTAL}', $4
          from unnest($5::text[],$6::text[],$7::text[],$8::numeric[],$9::text[],$10::bool[],$11::bool[])
               as x(numero,marca,modelo,valor,forn,cnpj_ok,gen)
          on conflict do nothing`,
          [p.cnpj, p.ano, p.seq, tituloFonte,
           hits.map(h => h.numero), hits.map(h => h.marca), hits.map(h => h.modelo),
           hits.map(h => h.valor), hits.map(h => h.forn || null), hits.map(h => h.cnpj_ok),
           hits.map(h => GENERICA.test(h.marca))]);
      }
    }
    if (!DRY) await db.query(`insert into ${FEITAS}(cnpj,ano,seq,status,n,estrutura) values($1,$2,$3,$4,$5,$6)
      on conflict(cnpj,ano,seq) do update set status=excluded.status,n=excluded.n,estrutura=excluded.estrutura`,
      [p.cnpj, p.ano, p.seq, status, n, est]);
    process.stdout.write(`  ${++feitos}/${procs.length} · procs c/ marca ${comMarca} · itens ${itensTot} · marca real ${reais}\r`);
  }

  console.log(`\n✔ ${PORTAL}: ${comMarca}/${feitos} procs com marca · ${itensTot} itens ancorados · ${reais} com marca real (não-genérica)`);
  console.log(`  estrutura dos docs: ${JSON.stringify(estAcc)}`);
  if (!DRY) console.table(await q(`select status, count(*) n, coalesce(sum(nn),0) itens from (select status, n nn from ${FEITAS}) t group by 1 order by 2 desc`));
  await db.end();
}
main().catch(e => { console.error("ERRO:", e.message); process.exit(1); });
