// CASAMENTO TCE-SC ↔ PNCP — derivada (Lei 1). O TCE indexa por ENTE + NÚMERO DO EDITAL; nós por cnpj+ano+seq.
// Chave: município normalizado + número do edital + ano. O `numero_edital` do TCE vem em formatos diferentes por
// município ("252021" = 25/2021 · "PE439/2020" · "PE 196/2025") — normalizo pegando os DÍGITOS e tratando os 4
// últimos como ano quando caem em 2000..2035; o que sobra à esquerda é o número.
// Produz: app.processo_tce_pncp (o casamento) e app.competicao_processo (a métrica que o PNCP não permite calcular).
//   node scripts/casa_tcesc_pncp.mjs
import fs from "fs"; import pg from "pg";
const U = fs.readFileSync("./.env.local", "utf8").match(/^DATABASE_URL=(.+)$/m)[1].trim();
const db = new pg.Pool({ connectionString: U, ssl: { rejectUnauthorized: false }, max: 2, statement_timeout: 590000 });
const q = async (s) => (await db.query(s)).rows;
// normalizador de nome de município: sem acento, maiúsculo, sem pontuação
const NORM = (c) => `upper(translate(btrim(${c}), 'áàâãäéèêëíìîïóòôõöúùûüçÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇ.-''', 'aaaaaeeeeiiiiooooouuuucAAAAAEEEEIIIIOOOOOUUUUC   '))`;

console.log("1) normalizando o lado do TCE…");
await db.query(`drop table if exists app.tce_proc_norm`);
await db.query(`
  create table app.tce_proc_norm as
  with d as (
    select identificador_sfi_processo_licitatorio id, nome_ente, numero_edital,
           descricao_modalidade_licitacao modalidade, data_homologacao,
           regexp_replace(coalesce(numero_edital,''), '\\D', '', 'g') dig
    from tcesc_processo_licitatorio where numero_edital is not null)
  select id, ${NORM("nome_ente")} ente_norm, numero_edital, modalidade, data_homologacao,
    case when length(dig) > 4 and right(dig,4) between '2000' and '2035'
         then nullif(ltrim(left(dig, length(dig)-4), '0'),'')::bigint end num_edital,
    case when length(dig) > 4 and right(dig,4) between '2000' and '2035'
         then right(dig,4)::int end ano_edital
  from d`);
await db.query(`create index ix_tpn on app.tce_proc_norm(ente_norm, num_edital, ano_edital)`);
console.table(await q(`select count(*) linhas, count(*) filter (where num_edital is not null) parseados,
  round(100.0*count(*) filter (where num_edital is not null)/count(*),1) pct from app.tce_proc_norm`));

console.log("2) normalizando o nosso lado (PNCP)…");
await db.query(`drop table if exists app.pncp_proc_norm`);
// ⚠️ O município vem por DOIS caminhos e o casador só olhava um. `municipio_nome` está VAZIO em 65.864
// contratações (27%) — quase todas de 2024–2026 —, mas 64.380 delas TÊM `cod_ibge`. Exigir o nome descartava
// processo com município perfeitamente identificado: era a maior causa isolada do casamento de 46%.
// Agora: nome quando existe, senão o nome canônico de entes_sc pelo cod_ibge.
// ⚠️ O NÚMERO PRECISA SER PARSEADO IGUAL NOS DOIS LADOS. O lado do TCE separa número e ano ("24/2024 - PRE" →
// 24 + 2024). O nosso juntava TODOS os dígitos num número só ("024/2024" → 242024), então só casava quando o
// município escrevia o numeroCompra sem o ano ("54", "90065"). Medido na conferência à mão: Vitor Meireles
// 024/2024 × 24/2024-PRE, S. Francisco do Sul 54/2024 × 54/2024-CNC e Treze Tílias eram o MESMO processo e
// falharam aqui — foram recuperados só depois, por similaridade de texto. Mesma regra dos dois lados agora.
await db.query(`
  create table app.pncp_proc_norm as
  with d as (
    select c.cnpj, c.ano, c.seq,
      coalesce(${NORM("c.municipio_nome")}, ${NORM("e.nome")}) ente_norm, c.modalidade,
      regexp_replace(coalesce(c.numero_compra,''), '[^0-9]', '', 'g') dig
    from contratacoes_sc c
    left join entes_sc e on e.cod_ibge = c.cod_ibge and e.tipo='M'
    where c.municipio_nome is not null or c.cod_ibge is not null)
  select cnpj, ano, seq, ente_norm, modalidade,
    case when length(dig) > 4 and right(dig,4) between '2000' and '2035'
         then nullif(ltrim(left(dig, length(dig)-4),'0'),'')::bigint      -- "024/2024" → 24
         else nullif(ltrim(dig,'0'),'')::bigint end num_compra,           -- "90065"    → 90065
    case when length(dig) > 4 and right(dig,4) between '2000' and '2035'
         then right(dig,4)::int else ano end ano_num                      -- ano escrito no número, se houver
  from d`);
await db.query(`create index ix_ppn on app.pncp_proc_norm(ente_norm, num_compra, ano)`);
await db.query(`create index ix_ppn2 on app.pncp_proc_norm(ente_norm, num_compra, ano_num)`);
console.table(await q(`select count(*) linhas, count(*) filter (where num_compra is not null) com_numero from app.pncp_proc_norm`));

console.log("3) casando (município + número do edital + ano)…");
await db.query(`drop table if exists app.processo_tce_pncp`);
await db.query(`
  create table app.processo_tce_pncp as
  select distinct on (p.cnpj,p.ano,p.seq) p.cnpj, p.ano, p.seq, t.id identificador_sfi, t.numero_edital,
         t.ente_norm, 'ente+numero+ano' metodo,
         -- Este script é o DONO da tabela: quem cria declara o schema inteiro, inclusive o que ele não
         -- preenche. As colunas confianca/nota_verificacao existiam só por ALTER manual de uma sessão
         -- anterior — e sumiam a cada reconstrução, derrubando constroi_tce_apontamento_processo com
         -- "column m.confianca does not exist". Quem GRADUA é audita_casamento_tce.mjs; aqui nasce como
         -- 'confirmado' porque casar por município + número de edital + ano é o sinal mais forte que temos.
         'confirmado'::text confianca, null::text nota_verificacao
  from app.pncp_proc_norm p
  join app.tce_proc_norm t on t.ente_norm=p.ente_norm and t.num_edital=p.num_compra
       and t.ano_edital in (p.ano, p.ano_num)
  where p.num_compra is not null
  -- ⚠️ DISTINCT ON SEM ORDER BY escolhe linha ARBITRÁRIA: o mesmo dado produzia casamento diferente a cada
  -- rodada (fila de averiguação oscilou 3.143 → 3.238 → 3.280 sem nada mudar na base). Quando o município
  -- tem mais de um edital com o mesmo número, prefiro o que casa o ANO exato e desempato pelo id do TCE —
  -- critério explícito e estável, para a mesma base dar sempre o mesmo par.
  order by p.cnpj, p.ano, p.seq, (t.ano_edital = p.ano) desc, t.id`);
await db.query(`create index ix_ptp on app.processo_tce_pncp(cnpj,ano,seq)`);
await db.query(`create index ix_ptp_sfi on app.processo_tce_pncp(identificador_sfi)`);
console.table(await q(`select
  (select count(*) from contratacoes_sc) nossos_processos,
  (select count(*) from app.processo_tce_pncp) casados,
  round(100.0*(select count(*) from app.processo_tce_pncp)/(select count(*) from contratacoes_sc),1) pct`));
console.log("   casamento sobre os HOMOLOGADOS (o que interessa p/ marca e competição):");
console.table(await q(`
  with h as (select distinct cnpj,ano,seq from itens_sc where unit_homologado>0)
  select count(*) homologados, count(*) filter (where exists(select 1 from app.processo_tce_pncp x
    where x.cnpj=h.cnpj and x.ano=h.ano and x.seq=h.seq)) casados,
    round(100.0*count(*) filter (where exists(select 1 from app.processo_tce_pncp x
    where x.cnpj=h.cnpj and x.ano=h.ano and x.seq=h.seq))/count(*),1) pct from h`));

console.log("4) derivada de COMPETIÇÃO por processo…");
await db.query(`drop table if exists app.competicao_processo`);
await db.query(`
  create table app.competicao_processo as
  select m.cnpj, m.ano, m.seq, m.identificador_sfi,
    count(distinct ip.nome_participante_rfb) n_participantes,
    count(distinct ip.descricao_item_licitacao) n_itens,
    count(distinct ip.nome_participante_rfb) filter (where ip.indicativo_vencedor='Sim') n_vencedores,
    count(*) linhas_disputa,
    round(count(distinct ip.nome_participante_rfb)::numeric
          / nullif(count(distinct ip.descricao_item_licitacao),0), 2) participantes_por_item
  from app.processo_tce_pncp m
  join tcesc_item_participante ip on ip.identificador_sfi_processo_licitatorio=m.identificador_sfi
  group by 1,2,3,4`);
await db.query(`create index ix_comp on app.competicao_processo(cnpj,ano,seq)`);
console.table(await q(`select count(*) processos, sum(n_participantes) participantes,
  round(avg(n_participantes),1) media_participantes, round(avg(n_itens),1) media_itens,
  count(*) filter (where n_participantes=1) com_1_participante,
  count(*) filter (where n_participantes>=5) com_5_ou_mais from app.competicao_processo`));
console.log("   distribuição de concorrência:");
console.table(await q(`select case when n_participantes=1 then '1 (sem disputa)'
    when n_participantes between 2 and 3 then '2-3' when n_participantes between 4 and 6 then '4-6'
    when n_participantes between 7 and 10 then '7-10' else '11+' end faixa,
  count(*) processos from app.competicao_processo group by 1 order by 1`));
await db.end();
