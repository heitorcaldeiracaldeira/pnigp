// MAPEAMENTO ÚNICO da entidade Contratação do PNCP → contratacoes_sc.
//
// Existe porque o mesmo objeto chega por DOIS caminhos e o mapeamento não pode divergir entre eles:
//   · varredura por janela  — /contratacoes/publicacao  (ingest_contratacoes_sc.mjs, completude, a cada 20 dias)
//   · incremental por evento — /contratacoes/atualizacao (coleta_incremental_pncp.mjs, diário, "o que mudou")
// Duas cópias do mapeamento significam que um campo novo entra num caminho e some no outro. Uma função só.
//
// Espelho FIEL (Lei 1): nomes do PNCP, `raw` com o JSON inteiro, nada descartado.
const num = (x) => (x == null || x === "" ? null : Number(x));
const dt = (s) => (s ? String(s).slice(0, 19) : null);

export async function upsertContratacao(q, o, codByCnpj) {
  const cnpj = o.orgaoEntidade?.cnpj;
  if (!cnpj) return false;
  const est = num(o.valorTotalEstimado), hom = num(o.valorTotalHomologado);
  const econ = est && hom && est > 0 ? Math.round((1 - hom / est) * 1000) / 10 : null;
  await q(`INSERT INTO contratacoes_sc (cod_ibge,cnpj,ano,seq,esfera,plataforma,modalidade_id,modalidade,modo_disputa,srp,instrumento,
      valor_estimado,valor_homologado,economia_pct,numero_compra,processo,objeto,situacao,emenda_parlamentar,amparo_legal,
      data_publicacao,data_abertura,data_encerramento,
      municipio_nome,unidade_codigo,unidade_nome,orgao_razao_social,uf,numero_controle_pncp,
      link_sistema_origem,justificativa_presencial,data_atualizacao,raw)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31,$32,$33)
    ON CONFLICT (cnpj,ano,seq) DO UPDATE SET plataforma=EXCLUDED.plataforma, modalidade=EXCLUDED.modalidade, modo_disputa=EXCLUDED.modo_disputa,
      srp=EXCLUDED.srp, valor_estimado=EXCLUDED.valor_estimado, valor_homologado=EXCLUDED.valor_homologado, economia_pct=EXCLUDED.economia_pct,
      situacao=EXCLUDED.situacao, cod_ibge=COALESCE(EXCLUDED.cod_ibge, contratacoes_sc.cod_ibge),
      municipio_nome=EXCLUDED.municipio_nome, unidade_codigo=EXCLUDED.unidade_codigo, unidade_nome=EXCLUDED.unidade_nome,
      orgao_razao_social=EXCLUDED.orgao_razao_social, uf=EXCLUDED.uf, numero_controle_pncp=EXCLUDED.numero_controle_pncp,
      link_sistema_origem=EXCLUDED.link_sistema_origem, justificativa_presencial=EXCLUDED.justificativa_presencial,
      data_atualizacao=EXCLUDED.data_atualizacao, raw=EXCLUDED.raw, atualizado=now()`,
    [o.unidadeOrgao?.codigoIbge || codByCnpj?.get(cnpj) || null, cnpj, num(o.anoCompra), num(o.sequencialCompra),
     o.orgaoEntidade?.esferaId || null, o.usuarioNome || null,
     num(o.modalidadeId), o.modalidadeNome || null, o.modoDisputaNome || null, o.srp === true, o.tipoInstrumentoConvocatorioNome || null,
     est, hom, econ, o.numeroCompra || null, o.processo || null, String(o.objetoCompra || "").slice(0, 500), o.situacaoCompraNome || null,
     o.emendaParlamentar === true, String(o.amparoLegal?.nome || o.amparoLegal?.descricao || "").slice(0, 160),
     dt(o.dataPublicacaoPncp), dt(o.dataAberturaProposta), dt(o.dataEncerramentoProposta),
     o.unidadeOrgao?.municipioNome || null, o.unidadeOrgao?.codigoUnidade || null,
     String(o.unidadeOrgao?.nomeUnidade || "").slice(0, 160) || null,
     String(o.orgaoEntidade?.razaoSocial || "").slice(0, 160) || null,
     o.unidadeOrgao?.ufSigla || null, o.numeroControlePNCP || null,
     String(o.linkSistemaOrigem || "").slice(0, 500) || null,
     String(o.justificativaPresencial || "").slice(0, 1000) || null,
     dt(o.dataAtualizacao),
     JSON.stringify(o)]);
  return true;
}
