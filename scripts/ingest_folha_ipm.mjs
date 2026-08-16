// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
// ingest_folha_ipm.mjs — folha nominal dos municípios que usam o ERP IPM (Atende.net).
//
// Entrega os três campos do pedido: CARGO (cardescricao), LOTAÇÃO/SECRETARIA (cncdescricao) e SALÁRIO
// (provento/desconto/liquido), mais o nome — e com série mensal desde 2013, muito maior que a da Betha.
//
// FASES (rodar `FASE=descobrir` antes de coletar):
//   descobrir — testa {slug}.atende.net para cada município e registra quem tem portal (é também o levantamento
//               de qual ERP cada município usa)
//   coletar   — para cada portal achado, monta a tela, lê os filtros cifrados e pagina os servidores
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
import crypto from "crypto";
import { pool, withRetry } from "./_cadprev.mjs";
import { slugDe, achaPortal, achaEmbed, filtrosDaTela, entidadesDaTela, periodosDaEntidade, paginaServidores } from "./_ipm.mjs";

const db = pool();
const q = withRetry(db);
const FASE = process.env.FASE || "coletar";
const UF = process.env.UF || null;
const SO = process.env.SO || null;
const CONC = Number(process.env.CONC || 12);

await q(`create table if not exists erp_portal_municipal (
  cod_ibge text, erp text, slug text, url text, titulo text,
  achado_em timestamptz default now(),
  primary key (cod_ibge, erp)
)`);
await q(`create index if not exists ix_erp_portal_erp on erp_portal_municipal (erp)`);

await q(`create table if not exists folha_servidores_ipm (
  cod_ibge text, municipio text, uf text, entidade text, competencia text,
  nome text, cargo text, lotacao text, matricula text, contrato text,
  afastamento text, rescisao text, ferias text,
  provento numeric, desconto numeric, liquido numeric,
  _hash text primary key, _coletado_em timestamptz default now()
)`);
await q(`create index if not exists ix_folha_ipm_mun on folha_servidores_ipm (cod_ibge, competencia)`);
await q(`create table if not exists folha_ipm_coleta (
  cod_ibge text primary key, municipio text, uf text, competencia text,
  linhas int, situacao text, detalhe text, em timestamptz default now()
)`);

// ── fase 1: descobrir quem tem portal Atende.net ───────────────────────────────────────────────────────────────
if (FASE === "descobrir") {
  const muns = (await q(`select cod_ibge, nome, uf from municipios_br
    ${UF ? "where uf = $1" : ""} order by uf, nome`, UF ? [UF] : [])).rows;
  const jaVistos = new Set((await q(`select cod_ibge from erp_portal_municipal where erp='ipm'`)).rows.map((r) => r.cod_ibge));
  const fila = muns.filter((m) => !jaVistos.has(m.cod_ibge));
  console.log(`[ipm/descobrir] ${muns.length} municípios · ${fila.length} a testar · concorrência ${CONC}`);

  let achados = 0, testados = 0;
  for (let i = 0; i < fila.length; i += CONC) {
    const bloco = fila.slice(i, i + CONC);
    const res = await Promise.all(bloco.map(async (m) => ({ m, p: await achaPortal(slugDe(m.nome)) })));
    const ok = res.filter((x) => x.p);
    testados += bloco.length;
    if (ok.length) {
      await q(`insert into erp_portal_municipal (cod_ibge, erp, slug, url, titulo)
        select * from unnest($1::text[],$2::text[],$3::text[],$4::text[],$5::text[])
        on conflict (cod_ibge, erp) do update set slug=excluded.slug, titulo=excluded.titulo, achado_em=now()`,
        [ok.map((x) => x.m.cod_ibge), ok.map(() => "ipm"), ok.map((x) => x.p.slug),
         ok.map((x) => `https://${x.p.slug}.atende.net/transparencia`), ok.map((x) => x.p.titulo)]);
      achados += ok.length;
    }
    if (i % (CONC * 20) === 0) process.stdout.write(`   ${testados}/${fila.length} testados · ${achados} portais\r`);
  }
  console.log(`\n[ipm/descobrir] ${achados} portais Atende.net encontrados`);
  console.table((await q(`select uf, count(*) municipios from erp_portal_municipal p
     join municipios_br m on m.cod_ibge=p.cod_ibge where p.erp='ipm' group by 1 order by 2 desc`)).rows);
  await db.end();
  process.exit(0);
}

// ── fase 2: coletar a folha ────────────────────────────────────────────────────────────────────────────────────
const alvos = (await q(`select p.cod_ibge, p.slug, m.nome municipio, m.uf
  from erp_portal_municipal p join municipios_br m on m.cod_ibge = p.cod_ibge
 where p.erp='ipm' ${UF ? "and m.uf = $1" : ""} ${SO ? `and m.nome ilike '%' || $${UF ? 2 : 1} || '%'` : ""}
 order by m.uf, m.nome`, [UF, SO].filter(Boolean))).rows;
// REFAZ=1 reprocessa quem já está 'ok' — necessário depois do conserto da lista de entidades (15/ago/2026)
const feitos = process.env.REFAZ === "1" ? new Set()
  : new Set((await q(`select cod_ibge from folha_ipm_coleta where situacao='ok'`)).rows.map((r) => r.cod_ibge));
const fila = alvos.filter((a) => !feitos.has(a.cod_ibge));
console.log(`[ipm] ${alvos.length} portais · ${feitos.size} já feitos · ${fila.length} na fila`);

const LOTE = 1000;
async function grava(todos) {
  const porHash = new Map();
  for (const r of todos) porHash.set(r._hash, r);
  const regs = [...porHash.values()];
  for (let i = 0; i < regs.length; i += LOTE) {
    const p = regs.slice(i, i + LOTE);
    const c = (f) => p.map((x) => x[f]);
    await q(`insert into folha_servidores_ipm
      (cod_ibge,municipio,uf,entidade,competencia,nome,cargo,lotacao,matricula,contrato,
       afastamento,rescisao,ferias,provento,desconto,liquido,_hash)
      select * from unnest($1::text[],$2::text[],$3::text[],$4::text[],$5::text[],$6::text[],$7::text[],$8::text[],
        $9::text[],$10::text[],$11::text[],$12::text[],$13::text[],$14::numeric[],$15::numeric[],$16::numeric[],$17::text[])
      on conflict (_hash) do update set provento=excluded.provento, desconto=excluded.desconto,
        liquido=excluded.liquido, _coletado_em=now()`,
      [c("cod_ibge"), c("municipio"), c("uf"), c("entidade"), c("competencia"), c("nome"), c("cargo"),
       c("lotacao"), c("matricula"), c("contrato"), c("afastamento"), c("rescisao"), c("ferias"),
       c("provento"), c("desconto"), c("liquido"), c("_hash")]);
  }
}
const num = (v) => { const n = parseFloat(String(v ?? "").replace(",", ".")); return Number.isFinite(n) ? n : null; };

let total = 0, ok = 0, falhas = 0;
for (let i = 0; i < fila.length; i++) {
  const p = fila[i];
  const marca = (situacao, detalhe, competencia = null, linhas = 0) =>
    q(`insert into folha_ipm_coleta (cod_ibge,municipio,uf,competencia,linhas,situacao,detalhe,em)
       values ($1,$2,$3,$4,$5,$6,$7,now())
       on conflict (cod_ibge) do update set competencia=excluded.competencia, linhas=excluded.linhas,
         situacao=excluded.situacao, detalhe=excluded.detalhe, em=now()`,
      [p.cod_ibge, p.municipio, p.uf, competencia, linhas, situacao, detalhe]);
  try {
    const embed = await achaEmbed(p.slug);
    if (!embed) { await marca("sem_item", "portal sem 'relacao-funcionario-x-salario'"); falhas++; continue; }
    const filtros = await filtrosDaTela(embed);
    // ⭐ TODAS as entidades do município (prefeitura + autarquias + fundos), não só a pré-selecionada
    const entidades = entidadesDaTela(filtros.bruto);
    const lista = entidades.length ? entidades
      : (filtros.entidade ? [{ codigo: filtros.entidade, descricao: null }] : []);
    if (!lista.length) { await marca("sem_filtro", "tela sem entidade"); falhas++; continue; }

    const regs = [];
    const detalhes = [];
    for (const ent of lista) {
      // a competência é POR ENTIDADE — a autarquia pode publicar um mês diferente do da prefeitura
      const per = await periodosDaEntidade(embed, ent.codigo);
      const competencia = per[0]?.codigo
        || (ent.codigo === filtros.entidade ? filtros.competencia : null);
      if (!competencia) { detalhes.push(`${(ent.descricao || ent.codigo).slice(0, 24)}:sem_periodo`); continue; }
      const f2 = { entidade: ent.codigo, competencia };
      let pagina = 0, totalReg = null, antes = regs.length;
      do {
        const r = await paginaServidores(embed, f2, pagina);
        if (r.erro) throw new Error(r.erro);
        totalReg = r.total;
        for (const s of r.linhas) {
          regs.push({
            cod_ibge: p.cod_ibge, municipio: p.municipio, uf: p.uf, entidade: s.clicodigo,
            competencia: s.odomesano, nome: s.uninomerazao, cargo: s.cardescricao, lotacao: s.cncdescricao,
            matricula: s.fcncodigo, contrato: s.funcontrato, afastamento: s.afastamento,
            rescisao: s.rescisao, ferias: s.ferias,
            provento: num(s.provento), desconto: num(s.desconto), liquido: num(s.liquido),
            _hash: crypto.createHash("md5").update([p.cod_ibge, s.odomesano, s.fcncodigo, s.funcontrato, s.uninomerazao, s.cardescricao, s.provento].join("¦")).digest("hex"),
          });
        }
        if (!r.linhas.length) break;
        pagina++;
      } while (regs.length - antes < totalReg && pagina < 200);
      detalhes.push(`${(ent.descricao || ent.codigo).slice(0, 24)}:${regs.length - antes}`);
    }
    if (!regs.length) { await marca("sem_filtro", `nenhuma das ${lista.length} entidades tem período publicado`); falhas++; continue; }

    await grava(regs);
    total += regs.length; ok++;
    await marca("ok", `${lista.length} entidades · ${detalhes.join(" | ")}`.slice(0, 400), regs[0]?.competencia || null, regs.length);
    console.log(`  [${i + 1}/${fila.length}] ${p.uf} ${p.municipio}: ${regs.length} servidores (${lista.length} entidades)`);
  } catch (e) {
    falhas++;
    await marca("erro", String(e.message).slice(0, 200));
    console.log(`  ✖ [${i + 1}/${fila.length}] ${p.uf} ${p.municipio}: ${String(e.message).slice(0, 80)}`);
  }
}
console.log(`\n[ipm] ${total.toLocaleString("pt-BR")} servidores · ${ok} portais ok · ${falhas} falhas`);
await db.end();
