// COMPORTAMENTO DE TODOS OS PORTAIS — registro único (detector + fetcher + parser de marca).
// Para CADA portal: como DETECTAR (regex no edital), como BUSCAR a ata (recipe do endpoint público,
// sem login), e qual PADRÃO de marca extrair (A=Marca/Fabricante, B=Item…Valor…Marca:Modelo:, V=visão/OCR).
// Fonte: [[pnigp-portais-endpoints-publicos]] + [[pnigp-conferencia-marca-comprasnet]] + [[pnigp-erps-como-publicam]].
// Lei da marca: acha-se por PADRÃO no doc, não por rótulo. ERPs (IPM/Betha/Pública/Governança) NÃO têm portal —
// relatam ao PNCP puxando do PORTAL onde o processo correu → rotear pra QUALQUER portal do edital, nunca 'sem_rota'.
// State-agnostic (UF param): os portais nacionais cobrem qualquer município do Brasil — 1 crack serve o país.

// ---- PADRÕES DE MARCA (portal-agnósticos; rodam sobre o texto do doc de resultado, seja qual for o portal) ----
const NOISE=/^(servi|material|pe[çc]a|diversos?|v[aá]rios?|nacional|importad|pr[oó]pri|sem marca|marca pr|conforme|generic|n\/?c|n\/?a|na|-+|\.+|x+)$/i;
// além do NOISE: descartar "não informado/informar", "fabricante" solto, e echo de objeto (engenharia/obra/serviço)
// ⚠️ "conforme ..." nunca é marca: é remissão ao edital/TR/anexo. O NOISE acima já tinha "conforme", mas
// ancorado em ^...$ — casava "CONFORME" sozinho e deixava passar "CONFORME TR", que foi o que o coletor do
// Compras.gov gravou como marca em 06/ago/2026. Aqui a âncora é só no início, então pega a frase inteira.
const NAO_MARCA=/n[aã]o\s+inform|fabricante\s*n[aã]o|^fabricante\b|^conforme\b|engenharia|constru|^obra|servi[çc]o/i;
export function limpaMarca(s){
  if(!s) return null;
  s=s.replace(/\s+/g," ").trim().replace(/[.,;:\-–]+$/,"").trim();
  if(s.length<2||s.length>60) return null;
  if(NOISE.test(s)||NAO_MARCA.test(s)||!/[a-zA-ZÀ-ÿ]/.test(s)||s.split(" ").length>5) return null;
  return s.toUpperCase();
}
export const parseBR=(x)=>{ if(!x) return null; const n=parseFloat(String(x).replace(/\./g,"").replace(",",".")); return isFinite(n)?n:null; };
// Extrai pares {marca, valor, padrao} de um texto de doc de resultado (A e B)
export function extraiMarcas(texto){
  const out=[];
  const reA=/Marca\/Fabricante\s*:?\s*(.+?)\s*Modelo\/?vers/gis; let m;
  while((m=reA.exec(texto))){ const mk=limpaMarca(m[1]); if(mk) out.push({marca:mk,valor:null,padrao:"A"}); }
  for(const b of texto.split(/Item\s*:/i).slice(1)){
    const mMarca=b.match(/Marca\s*:\s*(.+?)\s*Modelo/is); if(!mMarca) continue;
    const mk=limpaMarca(mMarca[1]); if(!mk) continue;
    const mVal=b.match(/Valor\s*(?:Unit\.?|Unit[aá]rio|unit[aá]rio)\s*:?\s*R?\$?\s*([\d.]+,\d{2})/i);
    out.push({marca:mk, valor:parseBR(mVal?.[1]), padrao:"B"});
  }
  return out;
}

// ============================================================================
// ⭐ PADRÃO NACIONAL — LEIS e ARQUÉTIPOS que valem p/ QUALQUER portal do Brasil.
// (independem da UF; o VOLUME em SC é irrelevante — o que reusa é a RECEITA por padrão.)
// ============================================================================
export const LEIS_PORTAL = {
  marca_e_doc:      "A MARCA é fato de DOCUMENTO, nunca campo de API. Provado em PNCP e Compras.gov dados-abertos: as APIs dão vencedor+preço, NUNCA marca (art.41 veda no edital → nunca virou campo). Coletar marca = SEMPRE baixar+parsear o doc de resultado.",
  bolsa_vs_erp:     "BOLSA roda a disputa e guarda o doc de resultado. ERP (IPM/atende, Betha, Pública, Governança) só PUBLICA/RELATA — o domínio dele aparece no edital como publicação, mas a disputa roda em ALGUMA bolsa. Rota: bolsa SEMPRE vence o ERP; ERP só é 'portal' se tem módulo próprio de disputa E a URL vem em contexto de disputa (pregão/lance/sessão).",
  detecta_dominio:  "O portal é ESCOLHA da entidade, sabida SÓ pelo DOMÍNIO de disputa no doc — nunca pelo NOME (boilerplate/CRC: 'e-lic' 87% falso, 'banco do brasil' 99% falso), nunca pela GEOGRAFIA/UF (ex: Governo de SP usa compras.gov federal, não portal próprio; ter portal estadual é exceção — SC tem), nunca pelo ERP (relata, não define). Cada portal tem SEU padrão; casar sempre pelo domínio, por processo.",
  entrada_universal:"PNCP linkSistemaOrigem dá a URL do portal por processo — mas só p/ PARTE (PCP sempre; BLL subconjunto; VAZIO p/ BNC, Compras.gov, e-lic). Vazio → busca nativa do portal (quase sempre reCAPTCHA/WebForms).",
  pncp_entrada_limpa:"⭐ P/ toda BOLSA que trava o portal próprio (reCAPTCHA/login: BBMNET, Licitações-e BB, ComprasBR, BNC-busca), a Lei 14.133 OBRIGA publicar edital+ata+homologação no PNCP → baixar o doc de resultado (arquivo_blob) pela API pública do PNCP CONTORNA 100% o gate. NÃO contornar reCAPTCHA do portal. Só fica gated o que existe SÓ no portal (legado 8.666, ou estado que não empurra ata ao PNCP).",
};
// Os 5 ARQUÉTIPOS de acesso — todo portal do país cai num deles; a receita reusa nacionalmente:
export const ARQUETIPOS = {
  relatorio_gerado: { portais:["Portal de Compras Públicas"], receita:"marca vive num RELATÓRIO GERADO sob demanda (não arquivo): POST job + POLL até pronto → PDF → parser colunar. Ex: conteudo.api.portaldecompraspublicas.com.br/v1/arquivo/download {parametros:'Vencedor,{id}'}.", status:"cracked headless · nacional" },
  arquivo_blob:     { portais:["BLL","BNC"], receita:"lista de arquivos (ProcessFiles) → download direto em blob azure; ata em atas.zip. Software 'Lance Eletrônico' — MESMA receita p/ BLL+BNC+white-labels ({nome}compras.com).", status:"cracked (entrada via linkSistemaOrigem/ProcessView; busca própria = reCAPTCHA)" },
  api_sem_marca:    { portais:["PNCP","Compras.gov/modulo-contratacoes"], receita:"API estruturada dá vencedor+preço mas NÃO marca. Serve p/ ANCORAR (trava dupla cnpj+valor). ⚠️ VALE SÓ para o espelho PNCP (/modulo-contratacoes/*_ResultadoItens). NÃO vale para /modulo-pesquisa-preco → ver api_com_marca.", status:"marca precisa do DOC nesses endpoints" },
  api_com_marca:    { portais:["Compras.gov/modulo-pesquisa-preco"], receita:"⭐ dadosabertos.compras.gov.br/v3 /modulo-pesquisa-preco/1_consultarMaterial (e /3_consultarServico) EXPÕE campo 'marca' estruturado + precoUnitario + niFornecedor(CNPJ) + estado (NACIONAL). Param OBRIGATÓRIO codigoItemCatalogo(CATMAT) → só serve item que TENHA CATMAT. Ancora por valor+CNPJ.", status:"cracked, publico, nacional — BLOQUEADO pela falta de CATMAT em itens_sc (a ponte = motor CATMAT [[pnigp-catmat-classificacao]])" },
  doc_no_acervo:    { portais:["Compras.gov","qualquer"], receita:"parte das atas JÁ está espelhada no PNCP → parser sobre arquivo_texto, sem tocar portal. Ex: Comprasnet 'Proposta adjudicada/Marca/Fabricante'. Cobertura varia (é o ganho grátis; SC: 96 procs).", status:"grátis onde o portal empurrou a ata ao PNCP" },
  gated:            { portais:["Estado/e-lic","BNC(busca)","Licitar Digital","compras.sc.gov.br"], receita:"download atrás de reCAPTCHA/Cloudflare/WebForms(__VIEWSTATE) → só navegador; não escala headless.", status:"bloqueado p/ automação simples" },
};
// Prioridade de rota (menor vence): bolsa real 1..10 SEMPRE acima de ERP; ERP (atende) só com contexto de disputa.
export const PRIORIDADE = ["Portal de Compras Públicas","BLL","BNC","ComprasBR (AZ)","Licitar Digital","Licitanet","BBMNET","Licitações-E BB","Estado de Santa Catarina (e-lic)","Compras.gov","Atende.net (IPM)"];

// ---- REGISTRO: comportamento de cada portal ----
// campos: detecta(DOMÍNIO no doc — nunca nome) · tipo(bolsa|erp) · entrada(pncp_link|busca_gated|uasg|acervo) ·
//         arquetipo · marca(A|B|V padrão do doc) · status(cracked|recon|blocked|fila) · fetch(recipe) · notas
export const PORTAIS = {
  "Portal de Compras Públicas": {
    detecta: /portaldecompraspublicas\.com/i,   // DOMÍNIO (nunca 'portal de compras p' — casa outros)
    tipo: "bolsa", entrada: "pncp_link", arquetipo: "relatorio_gerado",
    acesso: "api", marca: "colunar", status: "cracked",
    base: "https://compras.api.portaldecompraspublicas.com.br",
    uf_sc: "100142",
    listar: (uf, status, pag=1)=>`https://compras.api.portaldecompraspublicas.com.br/v2/licitacao/processos?limitePagina=50&pagina=${pag}&codigoUf=${uf}&codigoStatus=${status}&codigoRealizacao=1`,
    documentos: (idLic)=>`https://compras.api.portaldecompraspublicas.com.br/v2/licitacao/${idLic}/documentos/processo`,
    download: (hash)=>`https://arquivos.portaldecompraspublicas.com.br/v1/download/${hash}`,
    notas: "API pública sem navegador. /documentos/processo (sufixo essencial). Docs tipados (Edital/Relatorio/…). Ata de resultado tem marca no padrão A ou colunar.",
  },
  "BLL": {
    detecta: /bllcompras\.com/i,   // DOMÍNIO (nunca \bbll\b/'bolsa de licita' — inflou 3.685→1.516)
    tipo: "bolsa", entrada: "pncp_link", arquetipo: "arquivo_blob",
    acesso: "lance_eletronico", marca: "V", status: "cracked",
    base: "https://bllcompras.com",
    busca: "https://bllcompras.com/Process/ProcessSearchPublic",   // reCAPTCHA → só no navegador
    documentos: (id)=>`https://bllcompras.com/Process/ProcessFiles?param1=${id}`, // id vem do onclick "Arquivos" do ProcessView
    blob: (hash,ext="pdf")=>`https://lanceeletronico.blob.core.windows.net/processfiles/${hash}.${ext}`,
    notas: "Software 'Lance Eletrônico'. Busca usa reCAPTCHA (navegador). Ata de homologação vem em atas.zip. Doc costuma ser IMAGEM → visão/OCR.",
  },
  "BNC": {
    detecta: /bnccompras\.com|bnc\.org\.br/i,   // DOMÍNIO
    tipo: "bolsa", entrada: "busca_gated", arquetipo: "arquivo_blob",
    acesso: "lance_eletronico", marca: "V", status: "cracked",
    base: "https://bnccompras.com",
    busca: "https://bnccompras.com/Process/ProcessSearchPublic",
    documentos: (id)=>`https://bnccompras.com/Process/ProcessFiles?param1=${id}`,
    blob: (hash,ext="pdf")=>`https://bnccompras.blob.core.windows.net/processfiles/${hash}.${ext}`,
    notas: "MESMO software da BLL (Lance Eletrônico). Receita idêntica; só muda o host do blob. bnc.org.br é só WordPress institucional.",
  },
  "Compras.gov": {
    detecta: /comprasnet\.gov|compras\.gov\.br|gov\.br\/compras/i,   // DOMÍNIO
    tipo: "bolsa", entrada: "uasg", arquetipo: "doc_no_acervo",   // parte da ata Comprasnet vem no acervo PNCP; resto = SIASG por UASG
    acesso: "api", marca: "comprasnet", status: "parcial",
    base: "https://cnetmobile.estaleiro.serpro.gov.br",
    dados_abertos: "https://dadosabertos.compras.gov.br/v3/api-docs (77 endpoints, 15 módulos). ⭐ /modulo-pesquisa-preco/1_consultarMaterial + /3_consultarServico TÊM campo 'marca' (api_com_marca). /modulo-contratacoes/*_ResultadoItens = vencedor+preço SEM marca (api_sem_marca). ALICE (/alice/*) = red-flags c/ fundamentação legal mas AUTH-GATED (conta comprasnet). Ver [[pnigp-comprasgov-api-referencia]].",
    notas: "Federal (SIASG/comprasnet). CORREÇÃO (23/jul): a API dados-abertos TEM marca no módulo pesquisa-preco (banco de preços por CATMAT, nacional). MURALHA: itens_sc tem ZERO CATMAT útil → endpoint exige codigoItemCatalogo → destrava só com o motor CATMAT classificando os itens. Ata 'Proposta adjudicada/Marca/Fabricante/Valor' = doc; ~96 procs SC no acervo → confere_marca_comprasnet. idCompra=UASG(6)+modalidade(2)+numero(5)+ano(4); uasg casa unidade_codigo(6díg). Coletor: coletor_compras_gov.mjs.",
  },
  "ComprasBR (AZ)": {
    detecta: /comprasbr\.com\.br|app\.comprasbr/i,   // comprasbr.com (sem .br) está PARADO
    tipo: "bolsa", entrada: "pncp_link", arquetipo: "arquivo_blob",   // via PNCP (portal próprio é gated por login)
    acesso: "api_gated", marca: "B", status: "blocked_portal",
    base: "https://app.comprasbr.com.br",   // Angular + Spring HATEOAS /hal/. comprasbr.com.br=WordPress institucional
    notas: "AZ Informática. Portal próprio 100% GATED por login (302, auth pura, não reCAPTCHA). CRACK REAL (23/jul, RENDEU 4.447 marcas SC): a Ata 'Resultados' JÁ está no acervo PNCP local (arquivo_texto_sc), layout COLUNAR 'CNPJ Nome Marca Modelo Situação Valor' na linha do Vencedor → ancora trava dupla CNPJ+valor. ~23% das atas usam esse layout (resto é narrativo sem marca). Coletor: coletor_comprasbr_az.mjs. status_efetivo=via_pncp_acervo (não blocked).",
  },
  "Licitar Digital": {
    detecta: /licitardigital\.com|licitar\.digital/i,
    tipo: "bolsa", entrada: "api_lista", arquetipo: "arquivo_blob",
    acesso: "api", marca: "B", status: "cracked",
    base: "https://manager-api.licitardigital.com.br",   // ⭐ a API NÃO está atrás do Cloudflare (só o HTML app2/pesquisa está)
    buscar: "POST /auction-notice/doSearchAuctionNotice {filter:{search,startDatePublication,endDatePublication},offset} → data[].id=auctionId (biddingStageId 11=finalizado)",
    documentos: "POST /documents/generated/listPublicGeneratedDocuments {params:{auctionId}} → data[]{type,fileDescription,url}",
    blob: "GET url (licitar-signed-documents.s3.sa-east-1.amazonaws.com) → PDF; filtrar fileDescription ~ ATA|CONTRATO|HOMOLOG|ADJUDIC",
    notas: "CRACKED headless, SEM login/navegador (só Content-Type: application/json). PDF da ata TEM camada de texto (glyphs espaçados 'M A R C A' → pdftotext resolve, sem visão). Ancora item+valor. platform traz o ERP de origem (ex ammlicita). Homologated-proposals estruturado exige token (não precisa — preço vem do PNCP).",
  },
  "Licitanet": {
    detecta: /licitanet\.com/i,
    tipo: "bolsa", entrada: "api_lista", arquetipo: "relatorio_gerado",   // + arquivo_blob (proposta do vencedor)
    acesso: "api", marca: "B", status: "cracked",
    base: "https://licitanet.com.br",   // Laravel+Inertia+Vue, roda SOBRE a plataforma do PCP. WAF exige UA de browser
    lista: "GET /sessao-publica?limit=&page=&status=4 (4=Homologado; uf/modalidade/objeto) → props.publications[]",
    sessao: (cod)=>`https://licitanet.com.br/sessao/${cod}`,   // props.disputeRoom: supplierFiles (proposta vencedor, blob CloudFront) + reports[]
    gerarAta: "GET /sessao/{cod} → extrai <meta csrf-token> + gera X-Client-Token (base64 '{unix}|…', módulo clientToken-*.js) → POST /report/{cod} {relatorio:'RELATORIO_ATA_FINAL_COMPLETO',dados:'{\"tipoAta\":1,\"ata\":N}'} → {identifier} → GET /report/{identifier}/download/{type} → {url html}",
    doc: "dv7rs78smtpx8.cloudfront.net/reports/pregao/{cod}/..._{identifier}.html (público, tem Marca/Modelo/Fornecedor/CNPJ/valor)",
    notas: "CRACKED ao vivo (ata baixada c/ Marca). reCAPTCHA v3 NÃO validado no servidor. Caminho barato alternativo: supplierFiles (proposta do vencedor, d2e4y9pc28eke4.cloudfront.net/.../habilitanet/…) = blob direto, às vezes já traz marca. dispute-room/{id}/batches = vencedor+preço SEM marca.",
  },
  "Licitações-E BB": {
    detecta: /licitacoes-e\.com/i,   // SÓ DOMÍNIO — 'banco do brasil' deu 99% falso-positivo (4.111→40)
    tipo: "bolsa", entrada: "pncp_link", arquetipo: "gated",
    acesso: "webforms", marca: "V", status: "blocked_portal",
    base: "https://www.licitacoes-e.com.br",   // app /aop/ JSP/Struts (NÃO ASP.NET), ISO-8859-1
    notas: "Portal nacional do Banco do Brasil. Detalhe/ata atrás de reCAPTCHA v2 (sitekey 6Lfa7KEs…); sem API JSON; numeroLicitação proprietário sem mapa PNCP. Busca pública existe mas drill=captcha. Rota limpa: 14.133 → PNCP contorna 100% o reCAPTCHA. Legado 8.666-só-no-BB = blocked (não gastar recurso).",
  },
  "BBMNET": {
    detecta: /bbmnet(licitacoes)?\.com/i,
    tipo: "bolsa", entrada: "pncp_link", arquetipo: "relatorio_gerado",   // portal gerado mas gated → via PNCP
    acesso: "browser", marca: "B", status: "blocked_portal",
    base: "https://www2.bbmnet.com.br/BBMNET",   // legado ASP.NET (consulta pública). Novo: sistema.bbmnet.com.br (Angular+Keycloak, 100% gated)
    notas: "Bolsa Brasileira de Mercadorias. Legado tem consulta pública → DetalharEdital.aspx?chaveEdital → VisualizarRelatorioVencedores.aspx (relatorio_gerado: VisualizadorDocumentoHandler.ashx tipoModelo=10). MAS travado por reCAPTCHA por edital (ConfirmarCaptchaDetalharEdital) — NÃO contornar. Rota limpa = PNCP (bundle tem CONTRATACAO_PNCP; publica ata lá). Legado 8.666-só-no-www2 = blocked.",
  },
  "Estado de Santa Catarina (e-lic)": {
    detecta: /e-?lic\.sc\.gov\.br|compras\.sc\.gov\.br/i,   // SÓ DOMÍNIO — nome/'SEA'/'\belic\b' deu 87% falso-positivo
    tipo: "bolsa", entrada: "busca_gated", arquetipo: "gated",
    acesso: "webforms", marca: "V", status: "blocked",
    base: "https://e-lic.sc.gov.br",
    portal_novo: "https://compras.sc.gov.br (SPA + API Spring /api/editais; download de doc atrás de reCAPTCHA)",
    notas: "Portal PRÓPRIO do Governo de SC (SEA-SC). e-lic velho=WebForms(__VIEWSTATE) rejeita headless. CRACK PARCIAL (23/jul, RENDEU 892 marcas): compras.sc.gov.br novo tem API Spring PÚBLICA sem login/captcha (GET /api/editais?ano=&pagina=&tamanhoPagina=500 → GET /{id}/arquivos) — a Ata de Sessão por item (tipo 16) é colunar c/ marca entre lance e 'Válido'; só rende quando o órgão ANEXA a ata (~17% dos pregões; resto fica no visualizador de sessão gated). ⚠️ TODOS os procs são ESTADUAIS (não municipal — [[feedback-estado-municipio-separados]]). Coletor: coletor_estado_de_santa_catarina_e_lic.mjs. ⚠️ NÃO assumir 'cada UF tem portal próprio': é ESCOLHA da entidade — ex. Governo de SP usa compras.gov (federal), não portal próprio; muitos entes usam PCP/bolsa. O portal só se sabe pelo DOMÍNIO no doc, nunca pela geografia. Ter portal estadual próprio é EXCEÇÃO (SC tem), não regra.",
  },
  "Atende.net (IPM)": {
    detecta: /[a-z0-9-]+\.atende\.net/i,   // ⚠️ ERP-PUBLISHER, não bolsa — ver tipo
    tipo: "erp", entrada: "n/a", arquetipo: "gated",
    acesso: "browser", marca: "B", status: "erp_relay",
    notas: "⚠️ ATENDE.NET é ERP do IPM que PUBLICA (transparência municipal {municipio}.atende.net) — NÃO é bolsa. O domínio aparece no edital como publicação; a disputa roda em ALGUMA bolsa (PCP/outra). Só ~1,4k (de 8,5k que o nome sugeria) têm a URL em contexto de DISPUTA (módulo pregão próprio do IPM). Rota: bolsa SEMPRE vence; atende só quando co-cita disputa e nenhuma bolsa. Prova viva do bolsa_vs_erp.",
  },
  "ECustomize": {
    detecta: /portaldecompraspublicas\.com/i,   // ⭐ ECustomize Consultoria OPERA o Portal de Compras Públicas — É O PCP (não portal separado)
    tipo: "bolsa", entrada: "pncp_link", arquetipo: "relatorio_gerado", status: "cracked",
    api_documentada: "https://apipcp.portaldecompraspublicas.com.br/publico/ (precisa publicKey/API-key): obterAtas?publicKey&idLicitacao&tipoAta (8=Ata Vencedores,11=Total,12=Adjudicação,13=Homologação; gera+poll→link PDF) · obteranexoslicitacao (blob). fluxo: listarProcessos→obterProcesso(idLicitacao)→obterAtas",
    notas: "= o PRÓPRIO PCP. Caminho documentado com API-key, alternativo ao relatório conteudo.api já crackeado. DEDUP: rotear como 'Portal de Compras Públicas'.",
  },
  "Licita+Brasil":   {
    detecta: /licitamaisbrasil\.com/i,
    tipo: "bolsa", entrada: "api_lista", arquetipo: "arquivo_blob", acesso:"api_gated", marca:"B", status:"blocked_auth",
    base: "https://api.licitamaisbrasil.com.br",   // SaaS PRIVADO (Node/Express, Postgres); front licitamaisbrasil.com.br (Vue)
    notas: "Bolsa privada (Lei 14.133). arquivo_blob (POST /app/auction/documents/list → /app/document/download) mas /app/* atrás de LOGIN + CORS Origin. Vitrine pública /editais-publicados,/formalizacoes-publicadas (não confirmado se expõe blob sem auth). Rota limpa provável = PNCP.",
  },
  "StartGov":        {
    detecta: /startgov\.com|bid\.startgov/i,
    tipo: "erp", entrada: "pncp_link", arquetipo: "gated", acesso:"api_gated", marca:"B", status:"blocked_portal",
    base: "https://api-bid.startgov.com.br/v1",   // Laravel; app bid.startgov.com.br (Vue)
    notas: "ERP interno de gestão de compras (integra PNCP), NÃO marketplace de disputa. Tudo Bearer/token; rotas públicas só token-gated (/public/quotations/:token). Tem /desenvolvedor/plataforma-pregao (disputa externa). Rota = PNCP (publisher/relay).",
  },
  // FORA DE ESCOPO (sem doc de resultado com marca):
  "Contrata+Brasil": { detecta:/contratamaisbrasil\.sistema\.gov/i, tipo:"federal", arquetipo:"gated", status:"fora_escopo", notas:"Federal (MGI+AGU), contratação DIRETA de MEI (art.95, teto R$12.545) — sem disputa, sem ata de vencedor+marca. gov.br SSO. Se estruturado, aparece no PNCP como contratação direta. NÃO gastar recurso." },
};

// ---- ERPs: NÃO têm portal próprio — RELAY. ROTEIAM PARA QUALQUER PORTAL ----
// ⭐ NÃO existe mapa fixo ERP→portal. Cada ERP integra com TODOS os portais; o portal onde o processo
// correu é definido POR PROCESSO, lido no EDITAL (o mesmo município pode ir a um portal num pregão e a
// outro no seguinte). Logo: detectar o ERP NÃO diz onde está a marca — só o edital diz. Rotear sempre
// pelo edital, nunca assumir um portal por causa do ERP. 'sem_rota' = edital ainda não lido/sem marcador,
// NÃO "sem portal".
// ⭐ CONFIRMADO (jul/2026, investigação ao vivo): os 4 são PUBLISHER/RELAY, NÃO bolsas — nenhum tem sala de disputa
// própria com lances online. Publicam+integram; a disputa roda numa BOLSA externa citada no edital. NÃO são destino.
export const ERPS = {
  "IPM":         { detecta:/[a-z0-9-]+\.atende\.net/i,                publica:"{municipio}.atende.net (transparência)", pncp_resultado:"~1,6%",  disputa_propria:"não (raro módulo próprio)", roteia_para:"QUALQUER bolsa (definido no edital)" },
  "Betha":       { detecta:/betha\.com|betha\.cloud/i,                publica:"e-gov.betha.com.br/transparencia (con_licitacoes.faces PÚBLICO, tem ATA/download) · transparencia.betha.cloud", pncp_resultado:"~13,3%", disputa_propria:"não (faz presencial + INTEGRA eletrônico externo; AutoCotação=coleta, não sala)", roteia_para:"QUALQUER bolsa" },
  "Pública":     { detecta:/publicatecnologia\.com|publicacloud/i,    publica:"Portal da Transparência por município", pncp_resultado:"~18,4%", disputa_propria:"não (módulos Compras+Transparência, SEM disputa eletrônica)", roteia_para:"QUALQUER bolsa" },
  "Governança":  { detecta:/govbr\.cloud|governancabrasil\.com|transparencia\.cloud/i, publica:"govbr.cloud (Pronim/Cidade360), transparencia.cloud (WAF anti-bot)", pncp_resultado:"~1,1%", disputa_propria:"não — texto explícito 'integração automática ao Portal de Compras Públicas'", roteia_para:"QUALQUER bolsa (evidência mais literal: disputa no PCP)" },
};
// Regra de roteamento do ERP: para todo processo de ERP, LER O EDITAL → detectaPortal(texto) → portal real.
// O ERP NÃO restringe o conjunto de portais possíveis; TODOS os portais do registro são candidatos.

// ============================================================================
// UNIVERSO NACIONAL (jul/2026) — portal = bolsa (a MESMA coisa: onde a disputa roda e o doc vive).
// Todos publicam no PNCP (Lei 14.133) → a coleta universal é sempre via PNCP; receita direta só onde cracked.
// ============================================================================
// ⛔ NÃO SÃO PORTAIS — buscadores/monitoramento de editais; NÃO conduzem pregão, NÃO têm doc de resultado.
// EXCLUIR da rota (senão o domínio deles no edital vira falso-positivo):
export const NAO_PORTAL = /effecti\.com|sigapregao\.com|elicitacao\.com|conlicitacao\.com|alertalicitacao\.com|licitaja\.com/i;

// Bolsas PRIVADAS nacionais (além das do registro principal):
export const BOLSAS_EXTRAS = {
  "Publinexo (Bionexo)":  { detecta:/publinexo\.bionexo\.com|publinexo/i, tipo:"bolsa", abrangencia:"nacional (SAÚDE)", entrada:"pncp_link", status:"recon", notas:"maior comunidade de fornecedores hospitalares; login/credenciamento; doc via PNCP." },
  "LicitaConnect":        { detecta:/licitaconnect\.com/i,                tipo:"bolsa", abrangencia:"nacional", entrada:"pncp_link", status:"recon" },
  "AMM Licita":           { detecta:/ammlicita\.org/i,                    tipo:"bolsa", abrangencia:"MG (853 munis)", entrada:"api_lista", status:"cracked", reusa:"Licitar Digital (MESMO motor)", notas:"⭐ roda na plataforma do Licitar Digital → REUSA a receita RECEITA['Licitar Digital'] (manager-api), só muda o subdomínio." },
};
// Portais ESTADUAIS próprios (o Estado que tem sistema próprio; a MAIORIA dos entes usa portal nacional — ter próprio é minoria).
// Caminho: quase todos publicam no PNCP → viaPNCP. 'consulta pública SIM' mas doc de resultado gralmente gated (reCAPTCHA/login).
export const PORTAIS_ESTADUAIS = {
  "BEC-SP":            { uf:"SP", detecta:/bec\.sp\.gov\.br/i },
  "Compras SP (estado)": { uf:"SP", detecta:/compras\.sp\.gov\.br|compras\.prefeitura\.sp\.gov\.br/i },
  "Comprasnet BA":     { uf:"BA", detecta:/comprasnet\.ba\.gov\.br/i },
  "Portal Compras CE": { uf:"CE", detecta:/portalcompras\.ce\.gov\.br/i },
  "Compras ES":        { uf:"ES", detecta:/compras\.es\.gov\.br/i },
  "SIGA-RJ":           { uf:"RJ", detecta:/compras\.rj\.gov\.br/i },
  "SIGA-MA":           { uf:"MA", detecta:/compras\.ma\.gov\.br/i },
  "SIAG-MT":           { uf:"MT", detecta:/aquisicoes\.seplag\.mt\.gov\.br/i },
  "Central Compras MS":{ uf:"MS", detecta:/servicos\.ms\.gov\.br\/central_compras/i },
  "Compras RS/CELIC":  { uf:"RS", detecta:/compras\.rs\.gov\.br|celic\.rs\.gov\.br|pregaoonlinebanrisul\.com|pregaobanrisul\.com/i },
  "e-Compras DF":      { uf:"DF", detecta:/compras\.df\.gov\.br/i },
  "e-Compras AM":      { uf:"AM", detecta:/e-compras\.am\.gov\.br|compras\.manaus\.am\.gov\.br/i },
  "Compras PA":        { uf:"PA", detecta:/compraspara\.pa\.gov\.br/i },
  "Central Compras PB":{ uf:"PB", detecta:/centraldecompras\.pb\.gov\.br/i },
  "Comprasnet SE":     { uf:"SE", detecta:/comprasnet\.se\.gov\.br/i },
  "Compras PR (GMS)":  { uf:"PR", detecta:/compras\.pr\.gov\.br/i },
  "Compras MG (SIAD)": { uf:"MG", detecta:/compras\.mg\.gov\.br/i },
  "e-lic SC":          { uf:"SC", detecta:/e-?lic\.sc\.gov\.br|compras\.sc\.gov\.br/i },   // já no registro principal
  "Caixa":             { uf:"federal", detecta:/licitacoes\.caixa\.gov\.br/i, notas:"compras DA Caixa, não bolsa aberta a terceiros" },
};

// ============================================================================
// COMPORTAMENTO POR MODALIDADE × FORMA (Lei 14.133/2021 e 8.666/1993)
// Para CADA modalidade: instrumento convocatório, documento de RESULTADO (onde a
// homologação/adjudicação registra o vencedor) e ONDE vive a MARCA + qual padrão.
// Regra-mãe ([[pnigp-marca-por-modalidade]]): pregão/concorrência → Ata de Resultado;
// dispensa/inexig → Termo/Proposta; credenciamento → Termo de Credenciamento.
// ============================================================================
export const MODALIDADES = {
  "pregao": {
    lei: "14.133", formas: ["eletronica","presencial"],
    instrumento: "Edital + Aviso",
    doc_resultado: "Ata de Realização/Sessão + Termo de Homologação e Adjudicação",
    onde_marca: "linha do VENCEDOR na Ata de Resultado (tipo 16) — marca+modelo por item, ancorada no preço homologado",
    padrao_marca: "A ou B (texto) · V (visão) se a ata for imagem",
    fonte: { eletronica: "ATA gerada pelo PORTAL onde o processo correu (fetch no portal)", presencial: "ata lavrada pelo órgão; sobe ao PNCP como doc" },
  },
  "concorrencia": {
    lei: "14.133", formas: ["eletronica","presencial"],
    instrumento: "Edital + Projeto Básico/TR",
    doc_resultado: "Ata de Julgamento/Resultado + Termo de Homologação",
    onde_marca: "Ata de Resultado (mesma lógica do pregão); em obra/serviço a 'marca' pode não existir (mão de obra)",
    padrao_marca: "A ou B (texto) · V (visão)",
    fonte: { eletronica: "ATA da BOLSA", presencial: "ata do órgão no PNCP" },
  },
  "dispensa": {
    lei: "14.133", formas: ["eletronica","presencial"],
    instrumento: "Aviso de Dispensa (dispensa eletrônica) OU Ato de Contratação Direta (art. 72)",
    doc_resultado: "Ato que autoriza a Contratação Direta + Proposta vencedora / Termo de Homologação",
    onde_marca: "PROPOSTA do fornecedor adjudicado (marca do produto ofertado)",
    padrao_marca: "A (Marca/Fabricante no Termo/Proposta) — geralmente TEXTO in-store",
    fonte: { eletronica: "dispensa eletrônica roda em algum portal (Compras.gov/PCP/…) OU no ERP; proposta anexa", presencial: "proposta anexada pelo órgão no PNCP" },
  },
  "inexigibilidade": {
    lei: "14.133", formas: ["presencial"],
    instrumento: "Ato de Contratação Direta (art. 74) + Razão da escolha + Justificativa de preço",
    doc_resultado: "Termo de Inexigibilidade + Proposta/Contrato",
    onde_marca: "Proposta/Contrato (produto exclusivo — marca costuma ser explícita, é o motivo da inexigibilidade)",
    padrao_marca: "A (texto) — quase sempre in-store",
    fonte: { presencial: "documentos anexados pelo órgão no PNCP" },
  },
  "credenciamento": {
    lei: "14.133", formas: ["eletronica","presencial"],
    instrumento: "Edital de Credenciamento (art. 79)",
    doc_resultado: "Termo de Credenciamento (todos os habilitados são contratados; não há 'vencedor' único)",
    onde_marca: "geralmente NÃO há marca (credencia prestadores/serviços, não produtos)",
    padrao_marca: "N/A na maioria",
    fonte: { eletronica: "sistema do órgão/ERP", presencial: "órgão no PNCP" },
  },
  // --- Lei 8.666/1993 (processos antigos ainda no acervo) ---
  "tomada_precos": { lei:"8.666", formas:["presencial"], instrumento:"Edital", doc_resultado:"Ata de Julgamento + Homologação", onde_marca:"Ata/Proposta", padrao_marca:"A/V", fonte:{presencial:"órgão no PNCP"} },
  "convite":       { lei:"8.666", formas:["presencial"], instrumento:"Carta-Convite", doc_resultado:"Ata + Homologação", onde_marca:"Ata/Proposta", padrao_marca:"A/V", fonte:{presencial:"órgão no PNCP"} },
  "concorrencia_8666": { lei:"8.666", formas:["presencial"], instrumento:"Edital", doc_resultado:"Ata de Julgamento + Homologação", onde_marca:"Ata/Proposta", padrao_marca:"A/V", fonte:{presencial:"órgão no PNCP"} },
};

// Quais modalidades cada portal OPERA (eletrônicas rodam em algum portal; dispensa varia).
// Portal nacional → opera as ELETRÔNICAS (pregão-e, concorrência-e, dispensa-e). Presencial/inexig = órgão.
export const PORTAL_MODALIDADES = {
  "Portal de Compras Públicas": ["pregao","concorrencia","dispensa"],
  "BLL":                        ["pregao","concorrencia","dispensa"],
  "BNC":                        ["pregao","concorrencia","dispensa"],
  "Compras.gov":                ["pregao","concorrencia","dispensa"],
  "ComprasBR (AZ)":             ["pregao","concorrencia","dispensa"],
  "Licitar Digital":            ["pregao","concorrencia","dispensa"],
  "Licitanet":                  ["pregao","dispensa"],
  "Licitações-E BB":            ["pregao","concorrencia"],
  "BBMNET":                     ["pregao","dispensa"],
  "Estado SC (e-lic)":          ["pregao","concorrencia","dispensa"],
  "ECustomize":                 ["pregao","dispensa"],
  "Contrata+Brasil":            ["pregao","dispensa"],
  "Licita+Brasil":              ["pregao","dispensa"],
  "StartGov":                   ["pregao","dispensa"],
};
// Nota: inexigibilidade/credenciamento/presencial NÃO rodam em portal eletrônico → doc fica no PNCP (in-store) ou no órgão.

// Comportamento resolvido: portal × modalidade × forma → como chegar na marca
export function comportamento(portal, modalidadeId, forma){
  const p=PORTAIS[portal], m=MODALIDADES[modalidadeId];
  if(!m) return null;
  const opera=(PORTAL_MODALIDADES[portal]||[]).includes(modalidadeId);
  const ehEletronica=forma==="eletronica";
  return {
    portal, modalidade:modalidadeId, forma, lei:m.lei,
    instrumento: m.instrumento,
    doc_resultado: m.doc_resultado,
    onde_marca: m.onde_marca,
    padrao_marca: m.padrao_marca,
    // se é eletrônica E o portal opera essa modalidade → a ata vem do PORTAL (fetch); senão in-store/órgão
    fonte_doc: (ehEletronica && opera && p) ? `PORTAL ${portal} (${p.acesso}, status ${p.status})` : (m.fonte?.[forma] || m.fonte?.presencial || "PNCP in-store / órgão"),
    acesso: (ehEletronica && opera && p) ? p.acesso : "in-store/PNCP",
    status_crack: (ehEletronica && opera && p) ? p.status : "n/a (in-store)",
  };
}

// ============================================================================
// REPERTÓRIO DOCUMENTAL — cada documento × a ESPECIFICAÇÃO que ele "faz jus", por modalidade × tipo (Lei 14.133)
// Para cada doc: fase, base legal, O QUE ele especifica, tipo_documento PNCP, e DUAS flags-chave:
//   spec_objeto  = carrega a ESPECIFICAÇÃO TÉCNICA do objeto/item (descrição completa; NÃO a descricaoItem truncada — [[pnigp-item-limite-descricao-vs-documento]])
//   resultado    = carrega o RESULTADO (vencedor + preço + MARCA — [[pnigp-marca-ancora-valor]])
// ============================================================================
export const DOCS = {
  DFD:        { doc:"Documento de Formalização da Demanda", fase:"interna",   art:"art. 6º, X",        tipo_pncp:10, especifica:"a NECESSIDADE/demanda (quantitativo, justificativa da compra)", spec_objeto:false, resultado:false },
  ETP:        { doc:"Estudo Técnico Preliminar",            fase:"interna",   art:"art. 18, §1º",      tipo_pncp:7,  especifica:"viabilidade + requisitos + solução escolhida; spec PRELIMINAR do objeto", spec_objeto:true,  resultado:false },
  MATRIZ_RISCO:{doc:"Matriz/Mapa de Gerenciamento de Riscos",fase:"interna", art:"art. 22",           tipo_pncp:9,  especifica:"riscos do processo e da contratação (não spec de item)", spec_objeto:false, resultado:false },
  TR:         { doc:"Termo de Referência",                  fase:"interna",   art:"art. 6º, XXIII",    tipo_pncp:4,  especifica:"a ESPECIFICAÇÃO COMPLETA do objeto (compras/serviços) — o doc que FAZ JUS à spec do item", spec_objeto:true,  resultado:false },
  PB:         { doc:"Projeto Básico",                       fase:"interna",   art:"art. 6º, XXV",      tipo_pncp:6,  especifica:"a spec técnica de OBRAS/engenharia (equivale ao TR p/ obra)", spec_objeto:true,  resultado:false },
  PRECOS:     { doc:"Pesquisa/Estimativa de Preços",        fase:"interna",   art:"art. 23",           tipo_pncp:null,especifica:"o VALOR estimado (cesta de preços) — âncora do preço, não do item", spec_objeto:false, resultado:false },
  PARECER:    { doc:"Parecer Jurídico",                     fase:"interna",   art:"art. 53",           tipo_pncp:null,especifica:"controle prévio de legalidade", spec_objeto:false, resultado:false },
  EDITAL:     { doc:"Edital",                               fase:"externa",   art:"art. 25",           tipo_pncp:2,  especifica:"o instrumento convocatório; ANEXA TR/PB → leva a spec ao mercado", spec_objeto:true,  resultado:false },
  AVISO_CD:   { doc:"Aviso/Ato de Contratação Direta",      fase:"externa",   art:"art. 72 (disp) / 74 (inexig)", tipo_pncp:20, especifica:"autoriza a contratação direta; razão da escolha + justificativa de preço", spec_objeto:false, resultado:false },
  PROPOSTA:   { doc:"Proposta do fornecedor adjudicado",    fase:"resultado", art:"—",                 tipo_pncp:null,especifica:"a MARCA/modelo do produto ofertado pelo vencedor (dispensa/inexig)", spec_objeto:false, resultado:true },
  ATA_SESSAO: { doc:"Ata de Realização/Sessão Pública",     fase:"resultado", art:"—",                 tipo_pncp:16, especifica:"o desenrolar da disputa (lances, classificação, participantes+marcas)", spec_objeto:false, resultado:true },
  HOMOLOG:    { doc:"Termo de Homologação e Adjudicação",   fase:"resultado", art:"art. 71",           tipo_pncp:16, especifica:"o RESULTADO oficial: vencedor + preço homologado + MARCA por item (tipo 16)", spec_objeto:false, resultado:true },
  CONTRATO:   { doc:"Contrato / Ata de Registro de Preços", fase:"contrato",  art:"art. 89 / 82",      tipo_pncp:12, especifica:"o vínculo; marca/modelo às vezes reafirmada", spec_objeto:false, resultado:true },
  CREDENC:    { doc:"Termo de Credenciamento",              fase:"resultado", art:"art. 79",           tipo_pncp:null,especifica:"habilitação dos credenciados (sem vencedor único; sem marca em regra)", spec_objeto:false, resultado:false },
};
// Repertório (documentos que FAZEM JUS) por modalidade — ordem do fluxo. Onde vive a spec do item e o resultado.
export const REPERTORIO = {
  "pregao":          ["DFD","ETP","MATRIZ_RISCO","TR","PRECOS","PARECER","EDITAL","ATA_SESSAO","HOMOLOG","CONTRATO"],
  "concorrencia":    ["DFD","ETP","MATRIZ_RISCO","TR","PB","PRECOS","PARECER","EDITAL","ATA_SESSAO","HOMOLOG","CONTRATO"],
  "dispensa":        ["DFD","ETP","TR","PRECOS","AVISO_CD","PROPOSTA","CONTRATO"],
  "inexigibilidade": ["DFD","ETP","TR","PRECOS","AVISO_CD","PROPOSTA","CONTRATO"],
  "credenciamento":  ["ETP","TR","EDITAL","CREDENC"],
  "tomada_precos":     ["ETP","TR","EDITAL","ATA_SESSAO","HOMOLOG","CONTRATO"],
  "convite":           ["TR","EDITAL","ATA_SESSAO","HOMOLOG","CONTRATO"],
  "concorrencia_8666": ["ETP","PB","EDITAL","ATA_SESSAO","HOMOLOG","CONTRATO"],
};
// Resolve: por modalidade, quais docs carregam a SPEC do objeto e quais carregam o RESULTADO (marca)
export function docsDaModalidade(modalidadeId){
  const ids=REPERTORIO[modalidadeId]||[];
  return ids.map(k=>({chave:k, ...DOCS[k]}));
}
export function docSpecDoObjeto(modalidadeId){ return docsDaModalidade(modalidadeId).filter(d=>d.spec_objeto).map(d=>d.doc); }
export function docResultado(modalidadeId){ return docsDaModalidade(modalidadeId).filter(d=>d.resultado).map(d=>d.doc); }

// COMPORTAMENTO DE EXTRAÇÃO — por documento: extrai O QUÊ, por QUAL método, pra QUAL tabela. (derivado das flags)
export function extracaoDoDoc(d){
  if(d.spec_objeto) return { extrai:"SPEC do objeto/item (descrição completa)", metodo:"texto: bloco de spec no anchor do item", alvo:"app.item_enriquecimento" };
  if(d.resultado)   return { extrai:"VENCEDOR + preço + MARCA por item",       metodo:"texto padrão A/B (regex) · imagem → visão/OCR; ancora por item+valor", alvo:"app.item_marca_conferida" };
  return { extrai:"— (metadado do processo)", metodo:"—", alvo:"—" };
}

// ---- O DOCUMENTO SE DECLARA: portal, modalidade e forma estão ESCRITOS no próprio doc ----
// Nada de detector externo / plataforma / gerador. Lê do texto do doc e aplica o padrão de marca.
export function detectaPortal(texto){
  const tx=(texto||"").toLowerCase();
  for(const [nome,def] of Object.entries(PORTAIS)) if(def.detecta.test(tx)) return nome;
  return null;
}
export function detectaERP(texto){
  const tx=(texto||"").toLowerCase();
  for(const [nome,def] of Object.entries(ERPS)) if(def.detecta.test(tx)) return nome;
  return null;
}
// Modalidade + forma ditas no cabeçalho do doc ("PREGÃO ELETRÔNICO Nº…", "DISPENSA", "INEXIGIBILIDADE"…)
const MOD_RE=[
  ["pregao",          /preg[aã]o/i],
  ["concorrencia",    /concorr[eê]ncia/i],
  ["dispensa",        /dispensa/i],
  ["inexigibilidade", /inexigibilidade|inexig[ií]vel/i],
  ["credenciamento",  /credenciamento|credenciar/i],
  ["tomada_precos",   /tomada de pre[çc]os/i],
  ["convite",         /carta[- ]?convite|\bconvite\b/i],
];
export function detectaModalidade(texto){
  const tx=(texto||""); for(const [id,re] of MOD_RE) if(re.test(tx)) return id; return null;
}
export function detectaForma(texto){
  const tx=(texto||""); if(/eletr[oô]nic/i.test(tx)) return "eletronica"; if(/presencial/i.test(tx)) return "presencial"; return null;
}
// ⭐ TUDO num passe: dado o texto do documento, ele já diz portal + modalidade + forma → e daí extrai a marca.
export function leDocumento(texto){
  const portal=detectaPortal(texto), modalidade=detectaModalidade(texto), forma=detectaForma(texto);
  const marcas=extraiMarcas(texto); // pares {marca,valor,padrao} — ancorar por item+valor em itens_sc
  return { portal, modalidade, forma, marcas };
}

// Resumo executável: node scripts/portais_comportamento.mjs (NÃO roda ao importar)
// FOCO: o que está ESCONDIDO no documento (não existe em campo de API) — por documento, o que revelar e como.
if(process.argv[1] && process.argv[1].includes("portais_comportamento")){
  console.log("╔══ COMPORTAMENTO DE EXTRAÇÃO — o que cada documento ESCONDE (e não está em nenhum campo da API) ══╗\n");
  const vistos=new Set(); const linhas=[];
  for(const mod of Object.keys(REPERTORIO))
    for(const d of docsDaModalidade(mod)){
      if(vistos.has(d.chave)) continue; vistos.add(d.chave);
      const e=extracaoDoDoc(d);
      linhas.push({ documento:d.doc, fase:d.fase, "revela (escondido)":e.extrai, metodo:e.metodo, alvo:e.alvo });
    }
  console.table(linhas.filter(l=>l["revela (escondido)"]!=="— (metadado do processo)"));
  console.log("Escondido no doc, ausente na API: (1) MARCA/modelo do vencedor → Ata/Homologação/Proposta;");
  console.log("                                 (2) SPEC completa do item → TR/PB/ETP/Edital (a descricaoItem é truncada);");
  console.log("                                 (3) marcas dos PARTICIPANTES → Ata de Sessão.");
  console.log("Método portal-agnóstico: padrão A (Marca/Fabricante) · B (Item…Marca:Modelo:) · V (visão/OCR se imagem); ancora por item+valor.");
}
