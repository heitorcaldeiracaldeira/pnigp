// FILA DE EXTRAÇÃO DE MARCA — roteia pelo GERADOR e grava em LOTE. É a única porta de escrita da base.
//
//   node scripts/extrai_marca_fila.mjs                 # 200 processos, GRAVA
//   DRY=1 LIMIT=500 node scripts/extrai_marca_fila.mjs # mede sem gravar
//   LIMIT=0 node scripts/extrai_marca_fila.mjs         # todo o acervo pendente
//
// ═══ O QUE ESTA FILA FAZ, E O QUE ELA SE RECUSA A FAZER ═══
// Para cada processo: pega os documentos do acervo local (zero chamada externa), pergunta a
// gerador_documento.mjs QUEM GEROU cada um, chama o leitor daquele gerador, e grava só o que foi AFIRMADO.
//
// GRAVA:      `marca` (campo lido, item identificado por âncora) e `sem_marca_declarada` (o campo existe e
//             veio vazio — é informação sobre a compra, e por isso vira linha com marca NULL).
// NÃO GRAVA:  `candidato` (leu a marca mas só a ordem sustenta o item) e `linha_nao_lida`. Esses ficam no
//             livro-razão como contagem, para sabermos o tamanho do que não foi afirmado, e fora da base.
//             Candidato virar marca é exatamente como a base anterior foi envenenada.
//
// ═══ O LIVRO-RAZÃO NÃO APOSENTA O QUE PODE MUDAR ═══
// Lição medida no coletor do e-lic: `sem_ata` e `sem_bridge` aposentavam processo que ainda ia ter ata, e o
// dado existiria no portal sem nunca chegar aqui. Aqui vale o mesmo: `sem_documento` NÃO aposenta, porque
// documento chega depois. Aposentam só os veredictos sobre documento já lido.
// E a regra maior, aprendida em 06/ago quando a base foi zerada mas os livros não: LIVRO E BASE SE LIMPAM
// JUNTOS. Um livro que sobrevive à base é promessa falsa de trabalho feito.
//
// ═══ ESCRITA EM LOTE ═══
// unnest() por processo, nunca linha a linha — o banco é o gargalo conhecido deste projeto.
import fs from "fs";
import pg from "pg";
import { identificaGerador } from "./gerador_documento.mjs";
import { leResultadosAz } from "./parser_az_resultados.mjs";
import { leResultadosBll } from "./parser_bll_resultados.mjs";
import { leResultadoOrgao } from "./parser_termo_homologacao.mjs";
import { leResultadosLicitarDigital } from "./parser_licitar_digital.mjs";
import { leResultadosIpm } from "./parser_ipm.mjs";
import { carimboBR } from "./hora_br.mjs";

const U = fs.readFileSync("./.env.local", "utf8").match(/^DATABASE_URL=(.+)$/m)[1].trim();
const db = new pg.Pool({ connectionString: U, ssl: { rejectUnauthorized: false }, max: 3, statement_timeout: 590000 });
const UF = (process.env.UF || "sc").toLowerCase();
const DRY = process.env.DRY === "1";
const LIM = process.env.LIMIT != null ? Number(process.env.LIMIT) : 200;
const LOTE = Number(process.env.LOTE || 25);
const CONF = `app.item_marca_conferida_${UF}`;
const FEITAS = `app.marca_fila_feitas_${UF}`;

// ⛔ parser_contrato_arp e parser_termo_municipal ficam FORA de propósito: os dois foram construídos,
// medidos e reprovados. O de contrato devolveu ZERO marcas e o municipal 50 em 525 documentos, ambos
// porque a coluna posicional não tem fronteira confiável. Estão no repositório com o motivo documentado
// para não refazermos a investigação; ligá-los aqui reintroduziria o recorte que envenena.
const LEITOR = {
  parser_az_resultados: leResultadosAz,
  parser_bll_resultados: leResultadosBll,
  parser_termo_homologacao: leResultadoOrgao,
  parser_licitar_digital: leResultadosLicitarDigital,
  parser_ipm: leResultadosIpm,
};

// o melhor estado vence quando dois documentos falam do mesmo item
const RANK = { marca: 4, sem_marca_declarada: 3, candidato: 2, linha_nao_lida: 1 };

async function itensDo(cnpj, ano, seq) {
  const { rows } = await db.query(`
    SELECT i.numero, i.unidade, i.quantidade,
           coalesce(r.ni_fornecedor, i.cnpj_fornecedor) cnpj_fornecedor,
           coalesce(r.valor_unitario_homologado, i.unit_homologado, i.valor_total) valor,
           i.unit_estimado valor_ref
      FROM itens_${UF} i
      LEFT JOIN item_resultado_${UF} r
        ON r.cnpj=i.cnpj AND r.ano=i.ano AND r.seq=i.seq AND r.numero=i.numero
     WHERE i.cnpj=$1 AND i.ano=$2 AND i.seq=$3`, [cnpj, ano, seq]);
  return rows;
}

async function main() {
  await db.query(`create table if not exists ${FEITAS}(
    cnpj text, ano int, seq int, status text, geradores text,
    n_marca int default 0, n_vazio int default 0, n_candidato int default 0, n_nao_lido int default 0,
    atualizado timestamptz default now(), primary key(cnpj,ano,seq))`);

  const lim = LIM > 0 ? `limit ${LIM}` : ``;
  const { rows: procs } = await db.query(`
    select p.cnpj, p.ano, p.seq
      from app.processo_portal_real p
     where exists(select 1 from arquivo_texto_${UF} d
                   where d.cnpj=p.cnpj and d.ano=p.ano and d.seq=p.seq and d.chars>300)
       and exists(select 1 from itens_${UF} i
                   where i.cnpj=p.cnpj and i.ano=p.ano and i.seq=p.seq)
       -- 'sem_documento' NAO aposenta: documento chega depois
       and not exists(select 1 from ${FEITAS} f
                       where f.cnpj=p.cnpj and f.ano=p.ano and f.seq=p.seq
                         and f.status in ('ok','sem_afirmacao'))
     -- ⚠️ NAO ordenar por ano desc: concentra nos processos mais novos, que so tem edital publicado, e uma
     -- fatia de medicao volta quase vazia (medido: 148 de 150 sem documento legivel). Foi o mesmo defeito
     -- achado no coletor do e-lic. md5 da a ordem pseudo-aleatoria REPRODUZIVEL: a fatia e representativa
     -- do acervo e duas rodadas com o mesmo LIMIT trazem o mesmo conjunto.
     order by md5(p.cnpj||p.ano::text||p.seq::text) ${lim}`);

  if (!procs.length) { console.log(`${carimboBR()} acervo fechado — nada a extrair`); await db.end(); return; }
  console.log(`${carimboBR()} fila de marca · ${procs.length} processos · DRY=${DRY ? 1 : 0} · lote ${LOTE}`);

  const tot = { marca: 0, sem_marca_declarada: 0, candidato: 0, linha_nao_lida: 0 };
  const porGerador = {};
  let feitos = 0, gravados = 0, semDoc = 0;

  for (let i = 0; i < procs.length; i += LOTE) {
    const fatia = procs.slice(i, i + LOTE);
    const { rows: docs } = await db.query(`
      select cnpj, ano, seq, titulo, texto from arquivo_texto_${UF}
       where (cnpj,ano,seq) in (${fatia.map((_, j) => `($${j * 3 + 1},$${j * 3 + 2},$${j * 3 + 3})`).join(",")})
         and chars > 300`, fatia.flatMap((p) => [p.cnpj, p.ano, p.seq]));

    const porProc = new Map();
    for (const d of docs) {
      const k = `${d.cnpj}|${d.ano}|${d.seq}`;
      if (!porProc.has(k)) porProc.set(k, []);
      porProc.get(k).push(d);
    }

    for (const p of fatia) {
      feitos++;
      const meus = porProc.get(`${p.cnpj}|${p.ano}|${p.seq}`) || [];
      const melhor = new Map();
      const gers = new Set();
      let leu = false;

      // os itens sao os MESMOS para todos os documentos do processo: buscar uma vez, na primeira necessidade
      let itens = null;
      for (const d of meus) {
        const g = identificaGerador(d.texto);
        const fn = LEITOR[g.leitor];
        if (!fn || !g.tem_marca) continue;
        if (itens === null) itens = await itensDo(p.cnpj, p.ano, p.seq);
        if (!itens.length) break;
        let r;
        try { r = fn(d.texto, itens); } catch (e) { continue; }
        if (!r?.achou) continue;
        leu = true; gers.add(g.gerador);
        porGerador[g.gerador] = porGerador[g.gerador] || { marca: 0, vazio: 0 };
        for (const it of r.itens) {
          if (it.item_pncp == null) continue;
          const ant = melhor.get(it.item_pncp);
          if (!ant || RANK[it.status] > RANK[ant.status]) melhor.set(it.item_pncp, { ...it, gerador: g.gerador, titulo: d.titulo });
        }
      }

      const linhas = [...melhor.values()];
      for (const it of linhas) tot[it.status] = (tot[it.status] || 0) + 1;
      const afirmadas = linhas.filter((it) => it.status === "marca" || it.status === "sem_marca_declarada");
      for (const it of afirmadas) porGerador[it.gerador][it.status === "marca" ? "marca" : "vazio"]++;

      const status = !meus.length ? "sem_documento" : !leu ? "sem_documento" : afirmadas.length ? "ok" : "sem_afirmacao";
      if (status === "sem_documento") semDoc++;

      if (!DRY && afirmadas.length) {
        await db.query(`
          insert into ${CONF}
            (cnpj,ano,seq,numero,marca,modelo,fornecedor_cnpj,valor,cnpj_ok,valor_ok,portal,fonte_titulo,marca_motivo,atualizado)
          select $1,$2,$3, x.numero, x.marca, x.modelo, x.forn, x.valor, x.cnpjok, x.valorok,
                 (select portal_real from app.processo_portal_real where cnpj=$1 and ano=$2 and seq=$3),
                 x.titulo, x.motivo, now()
            from unnest($4::text[],$5::text[],$6::text[],$7::text[],$8::numeric[],$9::bool[],$10::bool[],$11::text[],$12::text[])
                 as x(numero,marca,modelo,forn,valor,cnpjok,valorok,titulo,motivo)
          on conflict (cnpj,ano,seq,numero) do update set
            marca=excluded.marca, modelo=excluded.modelo, fornecedor_cnpj=excluded.fornecedor_cnpj,
            valor=excluded.valor, cnpj_ok=excluded.cnpj_ok, valor_ok=excluded.valor_ok,
            portal=excluded.portal, fonte_titulo=excluded.fonte_titulo, marca_motivo=excluded.marca_motivo,
            atualizado=now()`,
          [p.cnpj, p.ano, p.seq,
           afirmadas.map((x) => String(x.item_pncp)),
           afirmadas.map((x) => x.marca || null),
           afirmadas.map((x) => x.modelo || null),
           afirmadas.map((x) => x.cnpj || null),
           afirmadas.map((x) => x.valor_ata ?? null),
           afirmadas.map((x) => String(x.ancora || "").includes("cnpj")),
           afirmadas.map((x) => String(x.ancora || "").includes("valor")),
           afirmadas.map((x) => String(x.titulo || "").slice(0, 120)),
           // a proveniencia inteira numa string: quem gerou, o que se afirmou, e o que sustentou
           afirmadas.map((x) => `${x.gerador} · ${x.status} · ${x.ancora}`)]);
        gravados += afirmadas.length;
      }

      if (!DRY) await db.query(`
        insert into ${FEITAS}(cnpj,ano,seq,status,geradores,n_marca,n_vazio,n_candidato,n_nao_lido)
        values($1,$2,$3,$4,$5,$6,$7,$8,$9)
        on conflict(cnpj,ano,seq) do update set status=excluded.status, geradores=excluded.geradores,
          n_marca=excluded.n_marca, n_vazio=excluded.n_vazio, n_candidato=excluded.n_candidato,
          n_nao_lido=excluded.n_nao_lido, atualizado=now()`,
        [p.cnpj, p.ano, p.seq, status, [...gers].join(",") || null,
         linhas.filter((x) => x.status === "marca").length,
         linhas.filter((x) => x.status === "sem_marca_declarada").length,
         linhas.filter((x) => x.status === "candidato").length,
         linhas.filter((x) => x.status === "linha_nao_lida").length]);

      if (feitos % 25 === 0 || feitos === procs.length)
        process.stdout.write(`  ${feitos}/${procs.length} · marca ${tot.marca} · vazio ${tot.sem_marca_declarada} · gravadas ${gravados}\r`);
    }
  }

  console.log(`\n${carimboBR()} fim · ${feitos} processos · sem documento legivel ${semDoc}`);
  console.table([{ ...tot, gravadas: gravados }]);
  console.log("por gerador (só o afirmado):");
  console.table(Object.entries(porGerador).map(([gerador, v]) => ({ gerador, marca: v.marca, campo_vazio: v.vazio })));
  if (!DRY) {
    const { rows } = await db.query(`select count(*) itens, count(marca) com_marca,
      count(*) filter (where marca is null) campo_vazio, count(distinct upper(marca)) marcas_distintas
      from ${CONF}`);
    console.log("estado da base:"); console.table(rows);
  }
  await db.end();
}
main().catch((e) => { console.error("ERRO:", e.message); process.exit(1); });
