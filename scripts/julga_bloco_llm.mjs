// O LLM JULGA O BLOCO — cirúrgico: 700 chars com a pergunta pronta, não 172 mil editais.
//
// ═══ POR QUE O LLM E NÃO REGEX (provado em 15 casos reais, 2026-07-15) ═══
// Empilhei regra em cima de regra e o resultado foi 1 acerto real em 15 (7%):
//   · rolo de pintura  → criei o PORTÃO (exigir rótulo/exigência/norma)
//   · carro (prosa)    → o portão barrou; criei o sinal PROSA
//   · endereço da prefeitura → o PROSA deixou passar: "Paço Municipal Ângelo Lodetti, CNPJ, CEP, Fone" virou
//                        "especificação" com pro=3. Cada sinal que acrescento deixa lixo novo entrar.
//   · "TORTA 216 TUBOS" com tec=11 e "BOMBA SUBMERSA 0,25 CV" com tec=3 → DESCARTADOS pelo portão que criei
//                        a partir de UM caso (o rolo).
// Assinatura de problema que lista de palavras não resolve: é JULGAMENTO SEMÂNTICO.
//
// ═══ A DIVISÃO DE TRABALHO ═══
//   determinístico (ancora_item_documento.mjs) → ACHA o bloco pelo VALOR estimado. 10/15, e onde falha é
//                                                 diagnosticável. Isto o LLM faria pior e caríssimo.
//   LLM (aqui)                                  → JULGA o bloco. É o que regex não faz.
// Custo: ~700 chars/chamada. NÃO é o LLM lendo o edital — é o LLM olhando o recorte que o determinístico entregou.
//
// ⚠️ O LLM É JUIZ, NÃO EXTRATOR: ele responde SIM/NÃO + copia o trecho. **Proibido reescrever, resumir ou
// completar** — se ele redigir, inventa especificação que o município não escreveu, e aí a base mente com
// aparência de precisão. Pior que dado faltando. A memória do projeto registra ~25% de falso positivo semântico
// quando o LLM opera solto ("3M" virou 3 metros, "PHILIPS" virou fenda).
//
// node scripts/julga_bloco_llm.mjs        (roda contra os casos reais de 15/07)
import fs from "fs"; import path from "path"; import { fileURLToPath } from "url";
import { generateText } from "ai";
import { createAnthropic } from "@ai-sdk/anthropic";
const __dirname = path.dirname(fileURLToPath(import.meta.url)); const ROOT = path.join(__dirname, "..");
const env = fs.readFileSync(path.join(ROOT, ".env.local"), "utf8");
const anthropic = createAnthropic({ apiKey: env.match(/^ANTHROPIC_API_KEY=(.+)$/m)[1].trim() });
const MODELO = process.env.MODELO || "claude-haiku-4-5-20251001";

const PROMPT = `Você recebe: o NOME de um item comprado por uma prefeitura e um TRECHO de um documento do processo (edital ou termo de referência).

Responda APENAS se o trecho contém a ESPECIFICAÇÃO TÉCNICA desse item — ou seja, o que define o que foi comprado: características, dimensões, potência, material, capacidade, normas, garantia, itens obrigatórios.

NÃO é especificação:
- linha de planilha de preços (só nome + quantidade + valor)
- cláusula jurídica, prazo de pagamento, sanção, recurso
- cabeçalho, endereço, CNPJ, telefone do órgão
- sumário ou índice
- descrição de OUTRO item que não o perguntado

REGRAS ABSOLUTAS:
- NUNCA reescreva, resuma, complete ou corrija o texto. COPIE literalmente do trecho.
- Se o trecho não tem a especificação DESTE item, responda "nao".
- Na dúvida, responda "nao". Dado faltando é melhor que dado inventado.

Responda em JSON, sem mais nada:
{"especificacao": true|false, "trecho": "<cópia literal, ou string vazia se false>", "motivo": "<até 8 palavras>"}`;

export async function julga(nomeItem, bloco) {
  const { text } = await generateText({
    model: anthropic(MODELO),
    temperature: 0,
    system: PROMPT,
    prompt: `ITEM: "${nomeItem}"\n\nTRECHO:\n"""${String(bloco).slice(0, 1400)}"""`,
  });
  try {
    const j = JSON.parse(text.trim().replace(/^```json?/i, "").replace(/```$/, "").trim());
    // 🔴 ANTI-ALUCINAÇÃO: o trecho TEM que existir no bloco. Se o LLM redigiu, cai fora — não importa quão
    // convincente. Normaliza espaço porque o PDF vem colado.
    const nb = String(bloco).toLowerCase().replace(/\s+/g, "");
    const nt = String(j.trecho || "").toLowerCase().replace(/\s+/g, "");
    if (j.especificacao && (!nt || !nb.includes(nt.slice(0, Math.min(60, nt.length)))))
      return { ok: false, motivo: "LLM REDIGIU (trecho não está no bloco) — descartado", trecho: "" };
    return { ok: !!j.especificacao, trecho: j.trecho || "", motivo: j.motivo || "" };
  } catch { return { ok: false, motivo: "resposta ilegível", trecho: "" }; }
}

// ─── TESTES: os casos REAIS de 15/07, incluindo os que o regex errou ──────────────────────────────────────────
if (process.argv[1] && process.argv[1].endsWith("julga_bloco_llm.mjs")) {
  const CASOS = [
    ["veiculo", true, "nimo,100CV,podendodispordeturbocompressor,combustívelgasolina,etanoloubicombustível(etanolegasolina);arcondicionadodefábrica;AirBag,napartefrontalparaocondutoreopassageirodoassentodianteiro,eainda,osistemadefrenagemantitravamentodasrodas–ABS;todositensobrigatóriosconformelegislaçãovigente;documentação(emplacamentoelicenciamento)emnomedoMUNICÍPIODEFLORIANÓPOLIS;garantiamínimade12(doze)meses.TOTALR$108.730,60"],
    // 🔴 o FALSO POSITIVO do regex: PROSA=3 num cabeçalho de ofício
    ["BOMBA HIDRAULICA", false, "rt,120-PaçoMunicipalÂngeloLodetti-Içara-SC,inscritonoCNPJsoboNº.82.916.800/0001-11CEP:88.820-000-Fone:(048)3431-3539ou(048)3431-3500EndereçoEletrônico:licitacao@icara.sc.gov.br"],
    // 🔴 os que o PORTÃO do regex barrou errado (tec=11 e tec=3, sem rótulo)
    ["TORTA 216 TUBOS - 120 TUBOS 3/4", null, "TORTA 216 TUBOS - 120 TUBOS 3/4 X 1,50M E 96 TUBOS 1/2 X 1,50M, ESTRUTURA EM CHAPA GALVANIZADA, ISOLAMENTO EM LÃ DE ROCHA UN 2 R$ 3.580,00"],
    ["ROLO DE PINTURA DE LA SINTETICA 23 CM", false, "SPARENTE 280GR TUBO 50 15,75 787,50 93 SOLVENTE PARA TINTA OLEO E ESMALTE LITRO 60 18,00 1.080,00 94 THINNER LITRO 40 22,50 900,00 95 ROLO DE PINTURA DE LA SINTETICA 23 CM UNIDADE 30 12,90 387,00"],
    ["Guardanapo de papel", true, "Guardanapo De Papel Material: Celulose , Largura: 24 CM, Comprimento: 24 CM, Cor: Branca , Tipo Folhas: Dupla, Características Adicionais: 396052 PC 8"],
    ["Inversor de frequência", true, "dbusRTUouincorporado;15)MóduloparacomunicaçãoEthernetIPouincorporado;16)ManualdousuárioeIHMemportuguês.UN02R$103.871,13R$207.742,26"],
    ["Poste metálico 4 metros", false, "O pagamento será efetuado em até 30 (trinta) dias após o recebimento definitivo do objeto, mediante apresentação da nota fiscal atestada pelo setor competente."],
  ];
  let ok = 0, n = 0;
  for (const [item, esp, bloco] of CASOS) {
    const r = await julga(item, bloco);
    const cmp = esp === null ? "?" : (r.ok === esp ? "✓" : "✗ ERROU");
    if (esp === null) { console.log(`? "${item.slice(0,30).padEnd(30)}" → ${r.ok ? "ESPEC" : "não"} · ${r.motivo}   (eu não sei a resposta — o regex barrou)`); }
    else { n++; if (r.ok === esp) ok++; console.log(`${cmp} "${item.slice(0,30).padEnd(30)}" → ${String(r.ok ? "ESPEC" : "não").padEnd(6)} esperado ${esp ? "ESPEC" : "não"} · ${r.motivo}`); }
    if (r.ok && r.trecho) console.log(`    copiou: "${String(r.trecho).slice(0, 100)}…"`);
  }
  console.log(`\n${ok} de ${n} certos (1 caso sem gabarito)`);
}
