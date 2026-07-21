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
const NAO_MARCA=/n[aã]o\s+inform|fabricante\s*n[aã]o|^fabricante\b|engenharia|constru|^obra|servi[çc]o/i;
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

// ---- REGISTRO: comportamento de cada portal ----
// campos: detecta(regex p/ achar no edital) · acesso(api|lance_eletronico|browser|webforms) · marca(A|B|V) ·
//         status(cracked|recon|blocked|fila) · fetch(recipe) · notas
export const PORTAIS = {
  "Portal de Compras Públicas": {
    detecta: /portaldecompraspublicas|portal de compras p[uú]b/i,
    acesso: "api", marca: "A", status: "cracked",
    base: "https://compras.api.portaldecompraspublicas.com.br",
    uf_sc: "100142",
    listar: (uf, status, pag=1)=>`https://compras.api.portaldecompraspublicas.com.br/v2/licitacao/processos?limitePagina=50&pagina=${pag}&codigoUf=${uf}&codigoStatus=${status}&codigoRealizacao=1`,
    documentos: (idLic)=>`https://compras.api.portaldecompraspublicas.com.br/v2/licitacao/${idLic}/documentos/processo`,
    download: (hash)=>`https://arquivos.portaldecompraspublicas.com.br/v1/download/${hash}`,
    notas: "API pública sem navegador. /documentos/processo (sufixo essencial). Docs tipados (Edital/Relatorio/…). Ata de resultado tem marca no padrão A ou colunar.",
  },
  "BLL": {
    detecta: /\bbll\b|bolsa de licita|bllcompras/i,
    acesso: "lance_eletronico", marca: "V", status: "cracked",
    base: "https://bllcompras.com",
    busca: "https://bllcompras.com/Process/ProcessSearchPublic",   // reCAPTCHA → só no navegador
    documentos: (id)=>`https://bllcompras.com/Process/ProcessFiles?param1=${id}`, // id vem do onclick "Arquivos" do ProcessView
    blob: (hash,ext="pdf")=>`https://lanceeletronico.blob.core.windows.net/processfiles/${hash}.${ext}`,
    notas: "Software 'Lance Eletrônico'. Busca usa reCAPTCHA (navegador). Ata de homologação vem em atas.zip. Doc costuma ser IMAGEM → visão/OCR.",
  },
  "BNC": {
    detecta: /\bbnc\b|bolsa nacional de compras|bnccompras/i,
    acesso: "lance_eletronico", marca: "V", status: "cracked",
    base: "https://bnccompras.com",
    busca: "https://bnccompras.com/Process/ProcessSearchPublic",
    documentos: (id)=>`https://bnccompras.com/Process/ProcessFiles?param1=${id}`,
    blob: (hash,ext="pdf")=>`https://bnccompras.blob.core.windows.net/processfiles/${hash}.${ext}`,
    notas: "MESMO software da BLL (Lance Eletrônico). Receita idêntica; só muda o host do blob. bnc.org.br é só WordPress institucional.",
  },
  "Compras.gov": {
    detecta: /compras\.gov|comprasnet|cnetmobile|gov\.br\/compras/i,
    acesso: "api", marca: "A", status: "recon",
    base: "https://cnetmobile.estaleiro.serpro.gov.br",
    notas: "Federal (comprasnet). Vencedor+preço já vem por API PNCP. Marca no Termo (padrão A, texto — sem OCR). idCompra=UASG(6)+modalidade(2)+numero(5)+ano(4). Busca tem hCaptcha. TJSC=UASG 925045.",
  },
  "ComprasBR (AZ)": {
    detecta: /comprasbr|az inform/i,
    acesso: "browser", marca: "B", status: "recon",
    base: "https://comprasbr.com",
    notas: "AZ Informática, plataforma comprasbr.com. Doc no padrão B (Item…Marca:Modelo:). AZ já tem ~37% dos resultados no PNCP → maioria da marca já capturável in-store.",
  },
  "Licitar Digital": {
    detecta: /licitar ?digital/i,
    acesso: "browser", marca: "V", status: "blocked",
    base: "https://app2.licitardigital.com.br",
    busca: "https://app2.licitardigital.com.br/pesquisa",
    notas: "Atrás de Cloudflare ('Um momento…' 403); headless não passa. Precisa navegador real / sessão.",
  },
  "Licitanet": {
    detecta: /licitanet/i,
    acesso: "browser", marca: "B", status: "recon",
    base: "https://licitanet.com.br",
    sessao: (id)=>`https://licitanet.com.br/sessao/${id}`,
    api: (id)=>`https://licitanet.com.br/api/dispute-room/${id}/batches`,
    notas: "SPA. sessao-publica → /sessao/{id}; API dispute-room/{id}/batches + buyers. Falta achar endpoint dos documentos/ata. Volume baixo (~155) mas ENTRA (cauda não se descarta).",
  },
  "Licitações-E BB": {
    detecta: /licita[cç][oõ]es-?e|licitacoes-e\.com|banco do brasil/i,
    acesso: "browser", marca: "V", status: "fila",
    base: "https://www.licitacoes-e.com.br",
    notas: "Portal do Banco do Brasil (Licitações-e). ~770 procs. WebForms/ASP; sessão pública. A crackar. Cauda cobrada pelo Heitor — não esquecer.",
  },
  "BBMNET": {
    detecta: /bbmnet|bolsa brasileira/i,
    acesso: "browser", marca: "B", status: "fila",
    base: "https://bbmnetlicitacoes.com.br",
    notas: "Novo BBMNET. ~416 procs. A crackar.",
  },
  "Estado SC (e-lic)": {
    detecta: /e-?lic\.sc\.gov|portaldecompras\.sc|portal de compras.*santa catarina|secretaria de estado da administra|\belic\b/i,
    acesso: "webforms", marca: "V", status: "fila",
    base: "https://e-lic.sc.gov.br",
    busca: "https://e-lic.sc.gov.br/WBCPublic/Publico",
    notas: "Portal do ESTADO de SC (WebForms/ASP.NET, __VIEWSTATE). ~202 procs. Foi IGNORADO antes (Heitor cobrou) — ENTRA na rota. Estado-específico (não nacional), mas a receita WebForms serve outros portais estaduais.",
  },
  "ECustomize": {
    detecta: /ecustomize|e-customize/i,
    acesso: "browser", marca: "B", status: "fila",
    notas: "Plataforma ECustomize (rótulo aparece muito no confere_marca_lote). A reconhecer endpoints.",
  },
  "Contrata+Brasil": { detecta:/contrata\+ ?brasil|contratamais/i, acesso:"browser", marca:"B", status:"fila", notas:"Fila. A reconhecer." },
  "Licita+Brasil":   { detecta:/licita\+ ?brasil|licitamais/i,     acesso:"browser", marca:"B", status:"fila", notas:"Fila. A reconhecer." },
  "StartGov":        { detecta:/startgov|start gov/i,               acesso:"browser", marca:"B", status:"fila", notas:"Fila. A reconhecer." },
};

// ---- ERPs: NÃO têm portal próprio — RELAY. ROTEIAM PARA QUALQUER PORTAL ----
// ⭐ NÃO existe mapa fixo ERP→portal. Cada ERP integra com TODOS os portais; o portal onde o processo
// correu é definido POR PROCESSO, lido no EDITAL (o mesmo município pode ir a um portal num pregão e a
// outro no seguinte). Logo: detectar o ERP NÃO diz onde está a marca — só o edital diz. Rotear sempre
// pelo edital, nunca assumir um portal por causa do ERP. 'sem_rota' = edital ainda não lido/sem marcador,
// NÃO "sem portal".
export const ERPS = {
  "IPM":         { detecta:/ipm sistemas|atende\.net|\bipm\b/i,      publica:"atende.net por município", pncp_resultado:"~1,6%",  roteia_para:"QUALQUER portal (definido no edital)" },
  "Betha":       { detecta:/betha/i,                                  publica:"betha cloud/transparência por município", pncp_resultado:"~13,3%", roteia_para:"QUALQUER portal — integra com todos; doc sai no formato do portal (padrão B)" },
  "Pública":     { detecta:/p[uú]blica tecnologia|publicacloud/i,    publica:"por município", pncp_resultado:"~18,4% (melhor dos ERPs)", roteia_para:"QUALQUER portal (definido no edital)" },
  "Governança":  { detecta:/governan[çc]a ?brasil|gestao publica/i,  publica:"por município", pncp_resultado:"~1,1%",  roteia_para:"QUALQUER portal (definido no edital)" },
};
// Regra de roteamento do ERP: para todo processo de ERP, LER O EDITAL → detectaPortal(texto) → portal real.
// O ERP NÃO restringe o conjunto de portais possíveis; TODOS os portais do registro são candidatos.

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
