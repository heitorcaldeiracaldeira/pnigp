// ESPECIFICAÇÃO DO ITEM — a visão ÚNICA por item, reunindo TODAS as tabelas de grão de item.
//
// Heitor, 04/ago/2026: *"a construção da especificação pode fazer com todos os itens, independente da marca"* e
// *"então reaproveitamos todas as tabelas — nada se perdeu"*. Duas correções de desenho:
//   1) a base é `itens_sc` INTEIRA (a spec vem do DOCUMENTO, não depende de marca; marca é LEFT JOIN opcional);
//   2) toda tabela no grão do item entra. O que estava fora e agora entra (medido 04/ago):
//        unidade_basica 928.755 · nome_pdm/nome_classe 167.386 · sem_disputa 408.717 (item_homologado_sc)
//        marca crua não ancorada ~51k (item_marca_sc) · propostas 9.688 · participantes 4.088
//      A `unidade_basica` é a que mais faltava: é ela que torna preço COMPARÁVEL entre municípios
//      ([[pnigp-unidade-basica-compra]], [[pnigp-economia-preco-unitario]]).
//
// Camadas de marca, da mais forte para a mais fraca — nenhuma sobrescreve a anterior, cada uma tem sua coluna:
//   marca_vencedora (conferida, ancorada por valor) → marca_crua (extraída, não ancorou) → marca_homologada
//   (item_homologado_sc) → marcas_candidatas/propostas/participantes (quem concorreu).
// Derivada (Lei 1), set-based, troca ATÔMICA. node scripts/constroi_especificacao_item.mjs
import fs from "fs"; import pg from "pg";
const U = fs.readFileSync("./.env.local", "utf8").match(/^DATABASE_URL=(.+)$/m)[1].trim();
const db = new pg.Pool({ connectionString: U, ssl: { rejectUnauthorized: false }, max: 2, statement_timeout: 1790000 });
const RUIDO = `(atestado|habilitacao|comprovacao de que trata|parcela de maior relevancia|licitante devera|razao social|assinatura da empresa|grau de satisfacao)`;
const t0 = Date.now();

await db.query(`drop table if exists app.item_especificacao_novo`);
await db.query(`
  create table app.item_especificacao_novo as
  with prop as (   -- todas as propostas do item (competição interna do PNCP)
    select cnpj,ano,seq,numero, count(*) n_propostas, min(valor_unitario) menor_proposta,
           array_agg(distinct upper(marca)) filter (where marca is not null) marcas_propostas
    from propostas_sc group by 1,2,3,4),
  lan as (select cnpj,ano,seq,numero, count(*) n_lances, min(valor) menor_lance from lances_sc group by 1,2,3,4),
  -- ATENÇÃO ao tipo: nas tabelas app.item_marca_* a coluna numero é TEXT; nas do espelho é INTEGER.
  -- Casar sem casting dá "operator does not exist: text = integer". (Sem crases aqui: isto vive dentro
  -- de um template literal de JS, e uma crase no comentário fecha a string no meio do SQL.)
  part as (select cnpj,ano,seq,numero::text numero, array_agg(distinct upper(marca)) filter (where marca is not null) marcas_participantes
    from app.item_marca_participante_sc group by 1,2,3,4),
  cru as (select cnpj,ano,seq,numero::text numero, min(marca) marca_crua, min(template) template_marca
    from item_marca_sc where marca is not null group by 1,2,3,4),
  res as (   -- resultado oficial: a melhor classificação do item
    select distinct on (cnpj,ano,seq,numero) cnpj,ano,seq,numero,
      percentual_desconto, ordem_classificacao_srp, situacao_resultado, natureza_juridica_nome, data_resultado
    from item_resultado_sc order by cnpj,ano,seq,numero, ordem_classificacao_srp nulls last)
  select
    i.cod_ibge, i.cnpj, i.ano, i.seq, i.numero,
    i.material_ou_servico, i.unidade, i.catmat, i.catalogo_nome,
    i.quantidade, i.unit_estimado, i.unit_homologado, i.fornecedor, i.cnpj_fornecedor,
    i.porte_fornecedor, i.beneficio_lc, i.economia_pct, i.situacao,
    -- DESCRIÇÃO: API × documento (só entra quando acrescenta)
    left(i.descricao, 500) descricao_api,
    case when e.descricao_documento is not null and length(e.descricao_documento) >= 160
          and (e.descricao_e_spec or length(e.descricao_documento) > 1.5 * length(coalesce(i.descricao,'')))
         then left(coalesce(e.descricao_refinada, e.descricao_documento), 2500) end descricao_spec,
    e.descricao_e_spec, e.metodo metodo_spec, e.fonte_documento, e.n_docs,
    (e.descricao_documento ~* '${RUIDO}') tem_ruido_edital,
    case when e.descricao_documento is null then 'sem_documento'
         when length(e.descricao_documento) < 160 then 'documento_curto'
         when e.descricao_e_spec then 'spec_do_documento'
         when length(e.descricao_documento) > 1.5 * length(coalesce(i.descricao,'')) then 'documento_mais_rico'
         else 'api_suficiente' end fonte_spec,
    -- COMPARABILIDADE de preço (o que faltava): unidade canônica
    h.unidade_basica, h.fator, h.forma, h.unit_basica, h.est_basica,
    -- CLASSIFICAÇÃO oficial
    h.codigo_pdm, h.nome_pdm, h.nome_classe,
    -- DISPUTA
    h.sem_disputa, p.n_propostas, p.menor_proposta, l.n_lances, l.menor_lance,
    r.percentual_desconto, r.ordem_classificacao_srp, r.situacao_resultado, r.data_resultado,
    -- MARCA em camadas: da prova mais forte à mais fraca, cada uma na sua coluna
    m.marca marca_vencedora, m.marca_generica, m.portal marca_portal,
    cru.marca_crua, cru.template_marca, h.marca marca_homologada, h.modelo modelo_homologado,
    (select array_agg(distinct c.marca order by c.marca) from app.item_marca_candidata_sc c
      where c.cnpj=i.cnpj and c.ano=i.ano and c.seq=i.seq and c.numero=i.numero::text) marcas_candidatas,
    p.marcas_propostas, pa.marcas_participantes,
    coalesce(m.marca, cru.marca_crua, h.marca) marca_melhor,
    case when m.marca is not null then 'conferida' when cru.marca_crua is not null then 'crua_nao_ancorada'
         when h.marca is not null then 'homologado' else null end marca_origem,
    now() atualizado
  from itens_sc i
  left join app.item_enriquecimento e on e.cnpj=i.cnpj and e.ano=i.ano and e.seq=i.seq and e.numero=i.numero
  left join item_homologado_sc h on h.cnpj=i.cnpj and h.ano=i.ano and h.seq=i.seq and h.numero=i.numero
  left join prop p on p.cnpj=i.cnpj and p.ano=i.ano and p.seq=i.seq and p.numero=i.numero
  left join lan  l on l.cnpj=i.cnpj and l.ano=i.ano and l.seq=i.seq and l.numero=i.numero
  left join part pa on pa.cnpj=i.cnpj and pa.ano=i.ano and pa.seq=i.seq and pa.numero=i.numero::text
  left join res r on r.cnpj=i.cnpj and r.ano=i.ano and r.seq=i.seq and r.numero=i.numero
  left join cru on cru.cnpj=i.cnpj and cru.ano=i.ano and cru.seq=i.seq and cru.numero=i.numero::text
  left join app.item_marca_conferida_sc m on m.cnpj=i.cnpj and m.ano=i.ano and m.seq=i.seq and m.numero=i.numero::text`);

// Nome de índice é único no ESQUEMA inteiro, não por tabela: criar `ix_iesp_proc` na tabela _novo colide com o
// índice de mesmo nome que já vive na tabela em produção. Cria com sufixo, e renomeia depois da troca (os antigos
// morrem junto com a tabela velha).
const IX = [["ix_iesp_proc", "cnpj,ano,seq"], ["ix_iesp_ibge", "cod_ibge"], ["ix_iesp_catmat", "catmat"],
            ["ix_iesp_marca", "marca_melhor"], ["ix_iesp_pdm", "codigo_pdm"]];
for (const [nome, cols] of IX) await db.query(`create index ${nome}_n on app.item_especificacao_novo(${cols})`);

await db.query(`begin;
  drop table if exists app.item_especificacao_old;
  alter table if exists app.item_especificacao rename to item_especificacao_old;
  alter table app.item_especificacao_novo rename to item_especificacao;
  commit`);
await db.query(`drop table if exists app.item_especificacao_old`);
for (const [nome] of IX) await db.query(`alter index ${nome}_n rename to ${nome}`).catch(() => {});

console.log(`construída em ${((Date.now() - t0) / 1000).toFixed(0)}s`);
console.table((await db.query(`select count(*) itens,
  count(descricao_spec) spec_documento, count(unidade_basica) unidade_canonica, count(nome_pdm) classificado,
  count(marca_melhor) com_marca, count(*) filter (where sem_disputa) sem_disputa,
  count(n_propostas) com_propostas from app.item_especificacao`)).rows);
console.table((await db.query(`select coalesce(marca_origem,'(sem marca)') origem, count(*) itens
  from app.item_especificacao group by 1 order by 2 desc`)).rows);
await db.end();
