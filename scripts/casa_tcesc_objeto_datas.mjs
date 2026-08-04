// CASADOR 3 — objeto + TRÊS DATAS do processo + valor. Substitui o casador só-por-objeto.
//
// Por que (medido 04/ago/2026): casar por texto do objeto dentro de município+ano deixava 7,1% dos pares
// AMBÍGUOS — objeto idêntico, vários candidatos empatados no topo (o pior caso tinha 38), e o desempate era
// arbitrário. Um par errado aqui mostra ao prefeito um apontamento do Tribunal preso a um processo que não é
// o dele. A data de realização resolve: dois processos podem ter o mesmo objeto no mesmo ano, mas não a mesma
// sessão, o mesmo limite de proposta E a mesma homologação.
//
// AS TRÊS DATAS, uma linha do processo em cada sistema:
//   abertura da sessão     TCE data_abertura_certame          ↔  contratacoes_sc.data_abertura
//   limite de proposta     TCE data_limite_entrega_propostas  ↔  contratacoes_sc.data_encerramento
//   homologação            TCE data_homologacao               ↔  max(item_resultado_sc.data_resultado)
//
// ACEITE (trava por contagem de sinais, nunca um só):
//   3 ou 2 datas batendo            → aceita (objeto ≥0.30, só p/ descartar objeto totalmente diferente)
//   1 data + objeto ≥0.60           → aceita
//   0 data + valor igual + obj ≥.45 → aceita (a âncora de valor, que já era a trava do casador anterior)
//   nada disso                      → NÃO casa. Menos cobertura é melhor que cobertura falsa.
//   node scripts/casa_tcesc_objeto_datas.mjs      [TOL_DIAS=3]
import fs from "fs"; import pg from "pg";
const U = fs.readFileSync("./.env.local", "utf8").match(/^DATABASE_URL=(.+)$/m)[1].trim();
const db = new pg.Pool({ connectionString: U, ssl: { rejectUnauthorized: false }, max: 2, statement_timeout: 1790000 });
const TOL = Number(process.env.TOL_DIAS || 3);   // tolerância em dias (fuso/registro manual dão 1-2 dias de diferença)
const t0 = Date.now();
const NORM_TXT = (c) => `lower(translate(${c}, 'áàâãäéèêëíìîïóòôõöúùûüçÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇ', 'aaaaaeeeeiiiiooooouuuucAAAAAEEEEIIIIOOOOOUUUUC'))`;
// TCE grava dd/mm/aaaa; nós gravamos aaaa-mm-ddThh:mm:ss. Ambos viram date, tolerantes a lixo.
// [0-9] em vez de \d de propósito: com \d a minha própria medição de datas voltou ZERO em tudo e quase me levou
// à conclusão errada de que as datas nunca batiam. Classe explícita não depende de flavor de regex.
const D_TCE = (c) => `(case when ${c} ~ '^[0-9]{2}/[0-9]{2}/[0-9]{4}' then to_date(left(${c},10),'DD/MM/YYYY')
                            when ${c} ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}' then to_date(left(${c},10),'YYYY-MM-DD') end)`;
// do NOSSO lado os tipos variam: contratacoes_sc guarda data como TEXT ('aaaa-mm-ddThh:mm:ss') e
// item_resultado_sc já guarda como date. Converto via ::text para funcionar nos dois sem depender do tipo.
const D_NOSSO = (c) => `(case when (${c})::text ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}' then to_date(left((${c})::text,10),'YYYY-MM-DD') end)`;

await db.query(`create extension if not exists pg_trgm`);

console.log("1) candidatos do TCE — objeto + 3 datas…");
await db.query(`drop table if exists app.tce_cand`);
await db.query(`
  create table app.tce_cand as
  select t.id sfi, t.ente_norm, t.ano_edital ano,
         ${NORM_TXT("left(p.descricao_objeto_licitacao, 300)")} objeto,
         ${D_TCE("p.data_abertura_certame")} d_abertura,
         ${D_TCE("p.data_limite_entrega_propostas")} d_limite,
         ${D_TCE("p.data_homologacao")} d_homolog,
         v.valor
  from app.tce_proc_norm t
  join tcesc_processo_licitatorio p on p.identificador_sfi_processo_licitatorio = t.id
  left join app.tce_proc_valor v on v.sfi = t.id
  where p.descricao_objeto_licitacao is not null and t.ano_edital is not null
    and not exists (select 1 from app.processo_tce_pncp x where x.identificador_sfi = t.id)`);
await db.query(`create index ix_tcand on app.tce_cand(ente_norm, ano)`);

console.log("2) nossos processos sem par — objeto + 3 datas (homologação vem do resultado do item)…");
await db.query(`drop table if exists app.pncp_sem_par`);
await db.query(`
  create table app.pncp_sem_par as
  select p.cnpj, p.ano, p.seq, p.ente_norm,
         ${NORM_TXT("left(c.objeto, 300)")} objeto,
         -- PAREAMENTO CORRIGIDO (conferência à mão, 04/ago/2026): a data_abertura_certame do TCE é a SESSÃO
         -- PÚBLICA, que ocorre quando as propostas FECHAM — ou seja, o nosso data_encerramento. Eu havia
         -- pareado com o nosso data_abertura (abertura do PRAZO de propostas, semanas antes). Medido nos pares
         -- já confirmados pelo número: encerramento×abertura acerta 29.936; abertura×abertura, 3.359.
         -- (sem crase aqui: isto vive num template literal de JS)
         ${D_NOSSO("c.data_encerramento")} d_abertura,
         ${D_NOSSO("c.data_abertura")} d_limite,
         (select max(${D_NOSSO("r.data_resultado")}) from item_resultado_sc r
           where r.cnpj=p.cnpj and r.ano=p.ano and r.seq=p.seq) d_homolog,
         c.valor_homologado valor
  from app.pncp_proc_norm p
  join contratacoes_sc c on c.cnpj=p.cnpj and c.ano=p.ano and c.seq=p.seq
  where c.objeto is not null and c.esfera='M'
    and not exists (select 1 from app.processo_tce_pncp x where x.cnpj=p.cnpj and x.ano=p.ano and x.seq=p.seq)`);
await db.query(`create index ix_psp on app.pncp_sem_par(ente_norm, ano)`);
console.table((await db.query(`select count(*) nossos_sem_par,
  count(d_abertura) c_abertura, count(d_limite) c_limite, count(d_homolog) c_homolog from app.pncp_sem_par`)).rows);
console.table((await db.query(`select count(*) candidatos_tce,
  count(d_abertura) c_abertura, count(d_limite) c_limite, count(d_homolog) c_homolog from app.tce_cand`)).rows);

console.log("3) casando por objeto + datas + valor…");
await db.query(`drop table if exists app.tce_match_objeto`);
await db.query(`
  create table app.tce_match_objeto as
  with par as (
    select n.cnpj, n.ano, n.seq, c.sfi,
      similarity(n.objeto, c.objeto) sim,
      (n.d_abertura is not null and c.d_abertura is not null and abs(n.d_abertura - c.d_abertura) <= ${TOL})::int b_ab,
      (n.d_limite   is not null and c.d_limite   is not null and abs(n.d_limite   - c.d_limite)   <= ${TOL})::int b_li,
      (n.d_homolog  is not null and c.d_homolog  is not null and abs(n.d_homolog  - c.d_homolog)  <= ${TOL})::int b_ho,
      (n.valor > 0 and c.valor > 0 and abs(n.valor - c.valor) <= 0.01 * greatest(n.valor, c.valor))::int b_val,
      n.valor valor_nosso, c.valor valor_tce
    from app.pncp_sem_par n
    join app.tce_cand c on c.ente_norm = n.ente_norm and c.ano = n.ano
    where similarity(n.objeto, c.objeto) >= 0.30)
  select distinct on (cnpj, ano, seq)
    cnpj, ano, seq, sfi identificador_sfi, round(sim::numeric,3) sim_objeto,
    (b_ab + b_li + b_ho) datas_batem, b_ab, b_li, b_ho, b_val, valor_nosso, valor_tce,
    case when (b_ab + b_li + b_ho) >= 2 then 'objeto+2datas'
         when (b_ab + b_li + b_ho) = 1 then 'objeto+1data'
         else 'objeto+valor' end metodo
  from par
  where (b_ab + b_li + b_ho) >= 2
     or ((b_ab + b_li + b_ho) = 1 and sim >= 0.60)
     or ((b_ab + b_li + b_ho) = 0 and b_val = 1 and sim >= 0.45)
  -- desempate final por sfi: sem ele, candidatos empatados em datas/valor/similaridade eram escolhidos ao
  -- acaso e o casamento mudava de uma rodada para outra com a MESMA base.
  order by cnpj, ano, seq, (b_ab + b_li + b_ho) desc, b_val desc, sim desc, sfi`);

console.log("4) somando ao casamento (nunca sobrescreve o casamento por número)…");
const ins = await db.query(`
  -- entra como 'a_verificar', NUNCA como confirmado: casar por objeto+datas é sinal mais fraco que o número
  -- do edital, e quem GRADUA é audita_casamento_tce.mjs (ele promove a 'confirmado' o que aprovar). Deixar a
  -- coluna de fora fazia o par nascer NULL — e NULL na tela não é nem "confira" nem "confirmado", é acaso.
  insert into app.processo_tce_pncp (cnpj, ano, seq, identificador_sfi, numero_edital, ente_norm, metodo, confianca)
  select m.cnpj, m.ano, m.seq, m.identificador_sfi, t.numero_edital, t.ente_norm, m.metodo, 'a_verificar'
  from app.tce_match_objeto m
  join app.tce_proc_norm t on t.id = m.identificador_sfi
  where not exists (select 1 from app.processo_tce_pncp x where x.cnpj=m.cnpj and x.ano=m.ano and x.seq=m.seq)`);
console.log(`   +${ins.rowCount} pares novos`);

console.log(`\nconstruído em ${((Date.now() - t0) / 1000).toFixed(0)}s`);
console.table((await db.query(`select metodo, count(*) pares from app.processo_tce_pncp group by 1 order by 2 desc`)).rows);
console.table((await db.query(`
  with h as (select distinct cnpj,ano,seq from itens_sc where unit_homologado>0)
  select count(*) homologados, count(*) filter (where exists(select 1 from app.processo_tce_pncp x
    where x.cnpj=h.cnpj and x.ano=h.ano and x.seq=h.seq)) casados,
    round(100.0*count(*) filter (where exists(select 1 from app.processo_tce_pncp x
    where x.cnpj=h.cnpj and x.ano=h.ano and x.seq=h.seq))/count(*),1) pct from h`)).rows);
console.log("força do casamento novo (quantos sinais bateram):");
console.table((await db.query(`select datas_batem, b_val valor_bateu, count(*) pares, round(avg(sim_objeto),3) sim_media
  from app.tce_match_objeto group by 1,2 order by 1 desc, 2 desc`)).rows);
console.log("amostra:");
console.table((await db.query(`select sim_objeto, datas_batem, b_ab, b_li, b_ho, b_val, valor_nosso, valor_tce
  from app.tce_match_objeto order by random() limit 8`)).rows);
await db.end();
