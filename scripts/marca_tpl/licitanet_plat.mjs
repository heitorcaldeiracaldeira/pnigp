// Parser DETERMINISTICO de MARCA — celula: plataforma ILIKE 'Licitanet%' (Licitanet Licitacoes Eletronicas LTDA)
//   ~1.110 processos · 8.260 itens homologados c/ preco (725 processos) · 68% material / 32% servico.
//
// ————————————————————————————————————————————————————————————————————————————————————————————————
// ENGENHARIA REVERSA (amostra de 60 docs / 249 itens + survey de TODA a celula, 1.447 docs-texto):
// ————————————————————————————————————————————————————————————————————————————————————————————————
// CONCLUSAO HONESTA: a Licitanet NAO publica no PNCP nenhum documento-TEMPLATE que carregue a MARCA
// do VENCEDOR por item. A marca do vencedor vive no PORTAL da Licitanet (proposta eletronica / mapa
// de lances / ata de realizacao em licitanet.com.br), que NAO e anexado como PDF ao PNCP.
//
// Prova (distribuicao de tipo_documento em TODA a celula):
//   td=2 Contrato/Termo ... 940 | td=1 Edital ... 353 | td=20 ... 124 | td=3 ... 27 | td=4 ... 3
//   -> ZERO documentos td=16 (Ata de Resultado / Relacao de Vencedores), td=11, td=19.
//   Ou seja: nao chega ao PNCP a peca que consolida o vencedor+marca por item.
//
// Onde a palavra "marca" aparece (133/1.447 docs-texto ~ 9%), e SEMPRE ruido, nunca marca-do-vencedor:
//   (a) PROSA JURIDICA / boilerplate art. 41: "a proposta devera conter a marca dos produtos, QUANDO
//       FOR O CASO", "5.1.2. Marca; 5.1.3. Fabricante" (lista do TR do que a proposta deve conter).
//   (b) FALSO POSITIVO lexical: "Comarca" (foro), "data marcada", "demarcacao/marcacao" (pintura).
//   (c) CABECALHO DE COLUNA VAZIO num MODELO de proposta embutido no Edital/TR:
//       "...Especificacao Marca (se exigida no edital) Modelo (se exigido no edital) UNID..."
//       "...Fabricante/ Marca/ Modelo Quant. UNID P. unitario R$ ... 01 (Descricao do material ofertado)
//        02 ... Valor Global Total: R$ XXXXXX (xxxxxx)". -> tabela EM BRANCO (placeholders), sem valor real.
//   (d) MARCA DE REFERENCIA na especificacao do proprio edital: "chocolate Bis... da marca Lacta"
//       -> e a marca de REFERENCIA pedida, NAO a marca ofertada/homologada pelo vencedor. DESCARTAR.
//   (e) raramente, uma PROPOSTA TECNICA do fornecedor (documento proprio dele, nao template Licitanet)
//       cita a marca em prosa livre ("Geofone... marca SebaKMT serie HL7000"). E semantico, esparso e
//       nao-templatizado -> exige LLM (Haiku), fora do escopo de um parser deterministico por template.
//
// Portanto este parser DETECTA as familias de documento da celula e, corretamente, NAO extrai marca
// estrutural de nenhuma (retorna []), com guarda anti-falso-positivo forte para que um scanner futuro
// jamais confunda "Comarca"/"data marcada"/"marca Lacta"/coluna-vazia com a marca de um vencedor.
// A validacao empirica sobre os 60 docs confirma taxa ~0% (ver _valida_licitanet_plat.mjs).
//
// Zero rede / zero LLM. node --check limpo.

const norm = (s) => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, " ").trim();

// Assinaturas de PROSA / ruido que NUNCA sao marca-do-vencedor (usadas para blindar qualquer candidato).
const RUIDO_CTX = [
  /marca do produto,?\s*quando for o caso/i,
  /marca(s)?\s+(do|dos|de)\s+produto/i,
  /conter a marca/i,
  /n[aã]o (ser[aá]|será|poder[aá]) (admitida|substitu)/i,
  /marca de refer[eê]ncia/i,
  /marca ou (similar|equivalente|superior)/i,
  /\bcomarca\b/i,                         // foro
  /data\s+marcada|sess[aã]o\s+marcada/i,  // agendamento
  /demarca[cç]|marca[cç][aã]o/i,          // demarcacao/marcacao
  /se exigid[ao] no edital/i,             // cabecalho de coluna VAZIO no modelo de proposta
  /marca\s*[;:]\s*\d?\.?\d/i,             // "5.1.2. Marca; 5.1.3. Fabricante" (lista do TR)
  /marca pr[oó]pria|sem marca/i,
];

// tokens que jamais sao marca de fabricante
const LIXO = new Set([
  "marca", "modelo", "fabricante", "propria", "proprio", "sem", "nao", "sim", "referencia",
  "similar", "equivalente", "produto", "produtos", "objeto", "descricao", "especificacao",
  "unid", "unidade", "quant", "quantidade", "preco", "unitario", "total", "global", "item",
]);

function detectaTemplate(texto) {
  const t = texto || "";
  // modelo de proposta embutido (tabela em branco) — Edital/TR
  if (/(Fabricante\/?\s*Marca\/?\s*Modelo|Especifica[çc][aã]o\s*Marca\s*\(se exigid)/i.test(t)) return "licitanet_modelo_proposta_vazio";
  // TR que lista "Marca" como campo obrigatorio da proposta
  if (/\bMarca\b\s*[;:]/.test(t) && /Fabricante/i.test(t)) return "licitanet_tr_lista_campos";
  // proposta tecnica livre do fornecedor citando marca em prosa (semantico)
  if (/\bmarca\s+[A-Z][A-Za-z0-9®]/.test(t)) return "licitanet_proposta_prosa";
  return "licitanet_sem_marca";
}

// Guarda: dado um trecho de contexto, ele carrega marca-do-VENCEDOR estrutural? (nunca, nesta celula)
function contextoEhRuido(ctx) {
  return RUIDO_CTX.some((re) => re.test(ctx));
}

// Parser publico. Assinatura identica a familia marca_tpl.
// Retorna [] por design: nenhum template Licitanet no PNCP carrega marca-do-vencedor por item ancorada
// a unit_homologado. Toda ocorrencia de "marca" e prosa/ruido/coluna-vazia/marca-de-referencia.
export function parse(texto, itensApi) {
  if (!texto || !Array.isArray(itensApi) || !itensApi.length) return [];
  // varredura defensiva: se algum dia surgir uma marca colada a um unit_homologado FORA de contexto de
  // ruido, este bloco a capturaria. Na celula atual isso nunca ocorre (taxa 0), mas mantem o parser
  // honesto e auditavel em vez de um "return [] cego".
  const out = [];
  const usados = new Set();
  for (const it of itensApi) {
    const n = Number(it.unit_homologado);
    if (!Number.isFinite(n) || n <= 0) continue;
    const [int, dec] = n.toFixed(2).split(".");
    const cp = int.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
    const formas = [...new Set([`${cp},${dec}`, `${int},${dec}`])];
    for (const f of formas) {
      let from = 0, pos;
      while ((pos = texto.indexOf(f, from)) >= 0) {
        from = pos + f.length;
        // procura rotulo "Marca:" ou "Marca " + TOKEN ate 60 chars ANTES ou DEPOIS do valor
        const win = texto.slice(Math.max(0, pos - 90), pos + 90);
        const m = win.match(/marca\s*[:\/]?\s*([A-Z][A-Za-z0-9&.\-]{2,24})/);
        if (!m) continue;
        if (contextoEhRuido(win)) continue;         // "Comarca"/"quando for o caso"/coluna vazia -> descarta
        const cand = m[1];
        if (LIXO.has(norm(cand))) continue;
        if (/^(se|nao|sim|do|da|dos|das)$/i.test(cand)) continue;
        if (usados.has(it.numero)) continue;
        usados.add(it.numero);
        out.push({ numero: it.numero, marca: cand.slice(0, 60), modelo: null, valorUnit: n, confianca: "baixa", template: "licitanet" });
        break;
      }
      if (usados.has(it.numero)) break;
    }
  }
  return out;
}

export { detectaTemplate, contextoEhRuido };
