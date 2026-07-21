// Núcleo de domínio do CONSTRUTOR DE PROCESSO LICITATÓRIO (Lei 14.133/2021) — o ciclo completo da fase interna à externa,
// sobre uma CESTA DE ITENS compartilhada. Cinco artefatos encadeados, cada um reaproveitando os dados do anterior:
//   DFD (formalização da demanda) → ETP (estudo técnico preliminar) → TR (termo de referência) → Edital → Contrato.
// Convenção de automação da AGU: texto fixo = literal (mudança exige justificativa nos autos); [entre colchetes] = campo a
// preencher (merge field). A base legal de cada seção é rastreável. É MINUTA de apoio — não substitui a análise do órgão.
import {
  type TipoObjeto, TIPO_OBJETO_LABEL, recomendarModalidade, checarEspecificacao, escoreAbertura, LIMITE_DISPENSA,
} from "./tr-modelo";

// ─────────────────────────────────────────────────────────────────────────────
// CESTA DE ITENS + DADOS DO PROCESSO (estado compartilhado pelos 5 artefatos)
// ─────────────────────────────────────────────────────────────────────────────
export type ItemProcesso = {
  id: string;
  descricao: string;        // objeto do item (o que se compra)
  catmat: string | null;    // classificação no catálogo (CATMAT/CATSER) — art. 19, II
  unidade: string;          // unidade de fornecimento
  quantidade: number;
  precoUnit: number;        // valor unitário de referência (mediana — IN 65/2021)
  fonte: string | null;     // fonte do preço (Banco de Preços)
  espec: string;            // especificação técnica do item (onde a redação abre/fecha a disputa)
  loteId?: string | null;   // LOTE a que o item pertence (null/undefined = item avulso, disputado a item)
  participacao?: TipoParticipacao;  // disputa geral (ampla) · exclusiva ME/EPP · cota reservada (art. 48)
  cotaReservadaPct?: number;        // % reservado a ME/EPP quando cota_reservada (default 25; art. 48, III)
};

// ADJUDICAÇÃO: por ITEM ou por LOTE — excludente, NÃO se mistura (o edital define um dos dois para todo o objeto).
export type Agrupamento = "item" | "lote";
// LOTE — agrupa itens disputados JUNTOS (adjudicação por lote). Pode ter critério de julgamento próprio (art. 33).
export type Lote = { id: string; nome: string; criterio?: CriterioJulgamentoId };

export type DadosProcesso = {
  orgao: string;            // secretaria/setor demandante
  responsavel: string;      // servidor responsável pela demanda
  tipo: TipoObjeto;
  necessidade: string;      // problema/necessidade pública a atender (DFD/ETP/TR)
  prazoEntrega: string;     // prazo de entrega/execução
  local: string;            // local de entrega
  dotacao: string;          // dotação orçamentária / fonte
  prioridade: string;       // grau de prioridade / data pretendida (DFD)
  // OBJETO — começa aqui. Adjudicação é POR ITEM **ou** POR LOTE (não se mistura): `agrupamento` decide.
  agrupamento?: Agrupamento;                        // "item" (cada item disputado a item) | "lote" (itens em grupos)
  itens: ItemProcesso[];
  lotes?: Lote[];                                   // usado só quando agrupamento="lote" (item.loteId aponta pra cá)
  // ENQUADRAMENTO — modalidade × critério/modo × instrumentos auxiliares × SRP (separados)
  modalidade?: ModalidadeId;                        // modalidade (art. 28) — default = recomendada por valor/objeto
  forma?: Forma;                                    // eletrônica | presencial (dentro das admitidas)
  criterio?: CriterioJulgamentoId;                  // critério de julgamento (art. 33)
  modoDisputa?: ModoDisputaId;                      // modo de disputa (art. 56)
  ordemFases?: OrdemFases;                          // habilitação após julgamento (padrão) ou invertida (art. 17)
  instrumentosAuxiliares?: InstrumentoAuxiliarId[]; // art. 78 — opcionais, marcáveis
  srp?: boolean;                                    // SRP (art. 82) — flag SEPARADA; depende da modalidade base
};

export const novoItem = (seed = ""): ItemProcesso =>
  ({ id: seed || Math.random().toString(36).slice(2, 9), descricao: "", catmat: null, unidade: "unidade", quantidade: 0, precoUnit: 0, fonte: null, espec: "" });

export const valorItem = (i: ItemProcesso) => (Number(i.quantidade) || 0) * (Number(i.precoUnit) || 0);
export const valorTotal = (itens: ItemProcesso[]) => itens.reduce((s, i) => s + valorItem(i), 0);

// alertas de superespecificação agregados da cesta (por item), reusando o checador do TR
export type AlertaItem = { item: string; termo: string; severidade: "alto" | "medio"; motivo: string; sugestao: string; base: string };
export function alertasCesta(itens: ItemProcesso[]): AlertaItem[] {
  const out: AlertaItem[] = [];
  for (const i of itens)
    for (const a of checarEspecificacao(i.espec))
      out.push({ item: i.descricao || "(item sem descrição)", ...a });
  return out;
}
// escore de abertura da cesta = média dos escores por item com especificação preenchida (100 se nenhum)
export function aberturaCesta(itens: ItemProcesso[]): number {
  const comEspec = itens.filter((i) => i.espec.trim().length > 2);
  if (!comEspec.length) return 100;
  return Math.round(comEspec.reduce((s, i) => s + escoreAbertura(checarEspecificacao(i.espec)), 0) / comEspec.length);
}

// ─────────────────────────────────────────────────────────────────────────────
// CATÁLOGO DOS ARTEFATOS (ordem do processo + base legal)
// ─────────────────────────────────────────────────────────────────────────────
export type ArtefatoId = "dfd" | "etp" | "tr" | "edital" | "ato" | "contrato" | "ata_rp";
export type Artefato = { id: ArtefatoId; sigla: string; nome: string; base: string; fase: "interna" | "externa"; desc: string };

export const ARTEFATOS: Artefato[] = [
  { id: "dfd", sigla: "DFD", nome: "Documento de Formalização da Demanda", base: "Lei 14.133/2021, art. 12, VII; IN SEGES 58/2022", fase: "interna", desc: "Abre o processo: quem demanda, a necessidade, os itens e o valor estimado; vincula ao PCA." },
  { id: "etp", sigla: "ETP", nome: "Estudo Técnico Preliminar", base: "Lei 14.133/2021, art. 18, §1º e §2º", fase: "interna", desc: "Demonstra a viabilidade da contratação: necessidade, mercado, quantidades, valor e resultados pretendidos." },
  { id: "tr", sigla: "TR", nome: "Termo de Referência", base: "Lei 14.133/2021, art. 6º, XXIII", fase: "interna", desc: "Especifica o objeto para licitar: requisitos, execução, medição, preço e critério de julgamento." },
  { id: "edital", sigla: "Edital", nome: "Minuta de Edital", base: "Lei 14.133/2021, art. 25", fase: "externa", desc: "Convoca o mercado: participação, propostas, julgamento, habilitação e recursos." },
  { id: "ato", sigla: "Ato CD", nome: "Aviso / Ato de Contratação Direta", base: "Lei 14.133/2021, art. 72", fase: "externa", desc: "Instrumento da contratação direta (dispensa/inexigibilidade): fundamento legal, justificativa de preço e da escolha, ratificação." },
  { id: "contrato", sigla: "Contrato", nome: "Minuta de Contrato", base: "Lei 14.133/2021, art. 89–92", fase: "externa", desc: "Formaliza a contratação: obrigações, vigência, pagamento, fiscalização e sanções." },
  { id: "ata_rp", sigla: "Ata RP", nome: "Ata de Registro de Preços", base: "Lei 14.133/2021, art. 82–86", fase: "externa", desc: "SRP: registra o preço do vencedor por prazo determinado (até 1 ano + prorrogação). A contratação vem depois, por contrato/empenho derivado da Ata." },
];

// ─────────────────────────────────────────────────────────────────────────────
// MODALIDADE × FORMA — o catálogo que conecta modalidade → formas admitidas → conjunto de peças
// A lei é a régua: cada modalidade tem forma(s) admitida(s) e um instrumento convocatório próprio
// (Edital nas licitações; Ato/Aviso de Contratação Direta na dispensa/inexigibilidade — art. 72).
// ─────────────────────────────────────────────────────────────────────────────
export type Forma = "eletronica" | "presencial";
export const FORMA_LABEL: Record<Forma, string> = { eletronica: "Eletrônica", presencial: "Presencial" };
export type ModalidadeId = "pregao" | "concorrencia" | "concurso" | "leilao" | "dialogo_competitivo" | "dispensa" | "inexigibilidade" | "credenciamento";
export type ModalidadeDef = {
  id: ModalidadeId; nome: string; base: string;
  formas: Forma[]; formaPadrao: Forma;
  pecas: ArtefatoId[];             // conjunto exigido (fase interna + externa) — o que MONTAR
  instrumento: "edital" | "ato";   // instrumento convocatório
  notaForma: string;               // orientação legal sobre a forma
};
export const MODALIDADES: ModalidadeDef[] = [
  { id: "pregao", nome: "Pregão", base: "art. 6º, XLI; art. 17, §2º", formas: ["eletronica", "presencial"], formaPadrao: "eletronica",
    pecas: ["dfd", "etp", "tr", "edital", "contrato"], instrumento: "edital",
    notaForma: "Regra: forma ELETRÔNICA (art. 17, §2º). A presencial exige justificativa da inviabilidade do meio eletrônico registrada nos autos." },
  { id: "concorrencia", nome: "Concorrência", base: "art. 6º, XXXVIII; art. 17, §2º", formas: ["eletronica", "presencial"], formaPadrao: "eletronica",
    pecas: ["dfd", "etp", "tr", "edital", "contrato"], instrumento: "edital",
    notaForma: "Regra: forma ELETRÔNICA (art. 17, §2º). Presencial apenas com justificativa nos autos." },
  { id: "concurso", nome: "Concurso", base: "art. 28, III; art. 30", formas: ["eletronica", "presencial"], formaPadrao: "presencial",
    pecas: ["dfd", "etp", "tr", "edital", "contrato"], instrumento: "edital",
    notaForma: "Escolha de trabalho técnico, científico ou artístico (art. 30), com prêmio ou remuneração ao vencedor. Julgamento por comissão especial; critério de melhor técnica ou conteúdo artístico. O edital traz o regulamento próprio." },
  { id: "leilao", nome: "Leilão", base: "art. 28, IV; art. 31", formas: ["eletronica", "presencial"], formaPadrao: "eletronica",
    pecas: ["dfd", "edital", "contrato"], instrumento: "edital",
    notaForma: "ALIENAÇÃO de bens (venda), NÃO aquisição. Critério maior lance (art. 31). Exige avaliação prévia dos bens; preferência pela forma eletrônica (art. 31, §4º). Fluxo distinto do de compras." },
  { id: "dialogo_competitivo", nome: "Diálogo Competitivo", base: "art. 28, V; art. 32", formas: ["eletronica", "presencial"], formaPadrao: "eletronica",
    pecas: ["dfd", "etp", "tr", "edital", "contrato"], instrumento: "edital",
    notaForma: "Restrito a inovação tecnológica/técnica ou objeto de grande complexidade (art. 32). Fases de pré-seleção, diálogo com licitantes e competitiva. Instrumento: Edital." },
  { id: "dispensa", nome: "Dispensa de Licitação", base: "art. 72; art. 75", formas: ["eletronica", "presencial"], formaPadrao: "eletronica",
    pecas: ["dfd", "etp", "tr", "ato", "contrato"], instrumento: "ato",
    notaForma: "Dispensa ELETRÔNICA é a regra (art. 75, §3º c/c regulamento). O instrumento é o Ato/Aviso de Contratação Direta (art. 72), não o Edital." },
  { id: "inexigibilidade", nome: "Inexigibilidade", base: "art. 72; art. 74", formas: ["eletronica", "presencial"], formaPadrao: "eletronica",
    pecas: ["dfd", "etp", "tr", "ato", "contrato"], instrumento: "ato",
    notaForma: "Inviável a competição (art. 74). Exige razão da escolha do fornecedor e justificativa do preço (art. 72, II e III). Instrumento: Ato de Contratação Direta." },
  { id: "credenciamento", nome: "Credenciamento", base: "art. 79", formas: ["eletronica", "presencial"], formaPadrao: "eletronica",
    pecas: ["dfd", "tr", "edital", "contrato"], instrumento: "edital",
    notaForma: "Contratação paralela e não excludente (art. 79). O instrumento é o Edital de chamamento público; dispensa disputa por não haver competição." },
];
export const modalidadeDef = (id: ModalidadeId) => MODALIDADES.find((m) => m.id === id)!;
// mapeia a recomendação por valor/objeto (tr-modelo) para um ModalidadeId do catálogo
export function modalidadeIdRecomendada(tipo: TipoObjeto, total: number): ModalidadeId {
  const nome = recomendarModalidade(tipo, total).modalidade.toLowerCase();
  if (nome.includes("dispensa")) return "dispensa";
  if (nome.includes("inexig")) return "inexigibilidade";
  if (nome.includes("concorrência") || nome.includes("concorrencia")) return "concorrencia";
  if (nome.includes("credenc")) return "credenciamento";
  return "pregao";
}

// ─────────────────────────────────────────────────────────────────────────────
// INSTRUMENTOS AUXILIARES (art. 78) — OPCIONAIS, marcáveis. Precedem/apoiam a licitação.
// (credenciamento é auxiliar — art. 78, I —, não modalidade.) SRP fica SEPARADO abaixo.
// ─────────────────────────────────────────────────────────────────────────────
export type InstrumentoAuxiliarId = "credenciamento" | "pre_qualificacao" | "pmi" | "registro_cadastral";
export type InstrumentoAuxiliarDef = { id: InstrumentoAuxiliarId; nome: string; base: string; desc: string };
export const INSTRUMENTOS_AUXILIARES: InstrumentoAuxiliarDef[] = [
  { id: "credenciamento", nome: "Credenciamento", base: "art. 78, I; art. 79",
    desc: "Contratação paralela e não excludente de todos os interessados que atendam às condições — não há disputa. Instrumento: edital de chamamento." },
  { id: "pre_qualificacao", nome: "Pré-qualificação", base: "art. 78, II; art. 80",
    desc: "Seleção prévia de licitantes ou de bens que atendam a requisitos, válida por até 1 ano." },
  { id: "pmi", nome: "Procedimento de Manifestação de Interesse (PMI)", base: "art. 78, III; art. 81",
    desc: "Chamamento para a iniciativa privada apresentar estudos, investigações, levantamentos ou projetos." },
  { id: "registro_cadastral", nome: "Registro Cadastral", base: "art. 78, V; art. 87",
    desc: "Registro atualizado de fornecedores habilitados, para uso nas contratações." },
];
export const instrumentoAuxiliarDef = (id: InstrumentoAuxiliarId) => INSTRUMENTOS_AUXILIARES.find((i) => i.id === id)!;

// SRP — Sistema de Registro de Preços (art. 78, IV; art. 82-86). SEPARADO: auxiliar que DEPENDE da modalidade base
// (Pregão/Concorrência "para Registro de Preços"; Dispensa nos casos do regulamento). Com SRP a peça de resultado
// é a ATA DE REGISTRO DE PREÇOS (não o Contrato direto).
export const SRP_BASE = "art. 78, IV; art. 82";
export const SRP_MODALIDADES: ModalidadeId[] = ["pregao", "concorrencia", "dispensa"];
export const srpAdmitido = (id: ModalidadeId) => SRP_MODALIDADES.includes(id);

// CRITÉRIO DE JULGAMENTO (art. 33) e MODO DE DISPUTA (art. 56) — separados da modalidade
export type CriterioJulgamentoId = "menor_preco" | "maior_desconto" | "melhor_tecnica" | "tecnica_e_preco" | "maior_lance" | "maior_retorno";
export const CRITERIOS_JULGAMENTO: { id: CriterioJulgamentoId; nome: string; base: string }[] = [
  { id: "menor_preco", nome: "Menor preço", base: "art. 33, I" },
  { id: "maior_desconto", nome: "Maior desconto", base: "art. 33, II" },
  { id: "melhor_tecnica", nome: "Melhor técnica ou conteúdo artístico", base: "art. 33, III" },
  { id: "tecnica_e_preco", nome: "Técnica e preço", base: "art. 33, IV" },
  { id: "maior_lance", nome: "Maior lance", base: "art. 33, V" },
  { id: "maior_retorno", nome: "Maior retorno econômico", base: "art. 33, VI" },
];
export type ModoDisputaId = "aberto" | "fechado" | "aberto_fechado" | "fechado_aberto";
export const MODOS_DISPUTA: { id: ModoDisputaId; nome: string; base: string }[] = [
  { id: "aberto", nome: "Aberto", base: "art. 56, I" },
  { id: "fechado", nome: "Fechado", base: "art. 56, II" },
  { id: "aberto_fechado", nome: "Aberto e fechado", base: "art. 56, §1º" },
  { id: "fechado_aberto", nome: "Fechado e aberto", base: "art. 56" },
];

// ORDEM DAS FASES (art. 17) — regra: julgamento ANTES da habilitação; inversão é exceção justificada (art. 17, §1º)
export type OrdemFases = "normal" | "invertida";
export const ORDENS_FASES: { id: OrdemFases; nome: string; base: string }[] = [
  { id: "normal", nome: "Julgamento → Habilitação (regra)", base: "art. 17, caput" },
  { id: "invertida", nome: "Habilitação → Julgamento (invertida, justificar)", base: "art. 17, §1º" },
];

// PARTICIPAÇÃO ME/EPP (art. 48; LC 123/2006) — por ITEM/LOTE: disputa geral, exclusiva, ou cota reservada
export type TipoParticipacao = "ampla" | "exclusiva_me" | "cota_reservada";
export const PARTICIPACAO: { id: TipoParticipacao; nome: string; base: string; desc: string }[] = [
  { id: "ampla", nome: "Disputa geral (ampla concorrência)", base: "—", desc: "Qualquer licitante pode disputar." },
  { id: "exclusiva_me", nome: "Exclusiva ME/EPP", base: "art. 48, I", desc: "Disputa restrita a ME/EPP. Obrigatória em itens de contratação até R$ 80.000,00." },
  { id: "cota_reservada", nome: "Cota reservada ME/EPP (divide o quantitativo)", base: "art. 48, III", desc: "Reserva até 25% do quantitativo para ME/EPP; o restante vai à ampla concorrência. Aplicável a itens divisíveis." },
];
export const LIMITE_EXCLUSIVA_ME = 80000; // art. 48, I

// DIVISÃO DOS QUANTITATIVOS — expande cada item com cota reservada em duas LINHAS (ampla + cota ME/EPP)
export type ItemDividido = ItemProcesso & { cota: "principal" | "reservada" | null; rotulo: string };
export function itensComCota(itens: ItemProcesso[]): ItemDividido[] {
  const out: ItemDividido[] = [];
  for (const i of itens) {
    if (i.participacao === "cota_reservada" && (Number(i.quantidade) || 0) > 0) {
      const pct = Math.min(25, Math.max(1, Number(i.cotaReservadaPct) || 25));
      const qReserva = Math.round((Number(i.quantidade) * pct) / 100);
      const qPrincipal = Number(i.quantidade) - qReserva;
      out.push({ ...i, quantidade: qPrincipal, cota: "principal", rotulo: `${i.descricao} — cota principal (ampla, ${100 - pct}%)` });
      out.push({ ...i, id: i.id + "-r", quantidade: qReserva, cota: "reservada", rotulo: `${i.descricao} — cota reservada ME/EPP (${pct}%)` });
    } else {
      out.push({ ...i, cota: null, rotulo: i.descricao });
    }
  }
  return out;
}
// rótulo curto da participação (pra tabela do documento)
export const participacaoLabel = (i: ItemProcesso, total = valorItem(i)): string =>
  i.participacao === "exclusiva_me" ? "Exclusiva ME/EPP (art. 48, I)"
  : i.participacao === "cota_reservada" ? `Cota reservada ${Math.min(25, Number(i.cotaReservadaPct) || 25)}% ME/EPP (art. 48, III)`
  : total > 0 && total <= LIMITE_EXCLUSIVA_ME ? "Ampla — atenção: item ≤ R$80k tende a exclusiva ME/EPP (art. 48, I)"
  : "Ampla concorrência";

// ─────────────────────────────────────────────────────────────────────────────
// GERAÇÃO DE DOCUMENTO — helpers comuns
// ─────────────────────────────────────────────────────────────────────────────
const brl = (v: number) => "R$ " + (Number(v) || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const esc = (s: unknown) => String(s ?? "").replace(/[<>&]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" }[c] || c));
const nl = (s: string) => esc(s).replace(/\n/g, "<br>");
const campo = (s: string, dica: string) => (s && s.trim() ? nl(s) : `<i class="mf">[${esc(dica)}]</i>`);
const hoje = () => new Date().toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" });

// tabela de itens padrão AGU (ITEM | ESPECIFICAÇÃO | CATMAT | UNIDADE | QUANTIDADE | VALOR UNIT. | VALOR TOTAL)
function tabelaItens(itens: ItemProcesso[], comPreco = true): string {
  if (!itens.length) return `<p><i class="mf">[incluir ao menos um item na cesta]</i></p>`;
  const linhas = itens.map((i, n) => `<tr>
    <td style="text-align:center">${n + 1}</td>
    <td>${esc(i.descricao) || "<i class='mf'>[descrição]</i>"}${i.espec.trim() ? `<br><span style="color:#64748b;font-size:8.5pt">${nl(i.espec)}</span>` : ""}</td>
    <td style="text-align:center">${i.catmat ? esc(i.catmat) : "—"}</td>
    <td style="text-align:center">${esc(i.unidade) || "un"}</td>
    <td style="text-align:right">${(Number(i.quantidade) || 0).toLocaleString("pt-BR")}</td>
    ${comPreco ? `<td style="text-align:right">${brl(i.precoUnit)}</td><td style="text-align:right">${brl(valorItem(i))}</td>` : ""}
  </tr>`).join("");
  const total = comPreco ? `<tr><td colspan="6" style="text-align:right;font-weight:bold">VALOR TOTAL ESTIMADO</td><td style="text-align:right;font-weight:bold">${brl(valorTotal(itens))}</td></tr>` : "";
  return `<table><thead><tr><th style="width:5%">Item</th><th>Especificação</th><th style="width:9%">CATMAT</th><th style="width:9%">Unid.</th><th style="width:9%">Qtd.</th>${comPreco ? `<th style="width:12%">Vlr. unit.</th><th style="width:13%">Vlr. total</th>` : ""}</tr></thead><tbody>${linhas}${total}</tbody></table>`;
}

// invólucro imprimível (mesma linguagem visual do Construtor de TR)
function docShell(titulo: string, baseTopo: string, corpo: string, nomeEnte: string, assinaturas: [string, string]): string {
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>${esc(titulo)} — ${esc(nomeEnte)}</title>
<style>
@page { size: A4; margin: 22mm 18mm; }
* { box-sizing: border-box; }
body { font-family: Georgia,'Times New Roman',serif; color:#1e293b; line-height:1.5; font-size:11.5pt; }
h1 { font-size:16pt; text-align:center; margin:0 0 2px; }
h2 { font-size:12.5pt; border-bottom:2px solid #0f766e; color:#0f766e; padding-bottom:3px; margin:18px 0 6px; }
p { margin:6px 0; text-align:justify; }
.lb { font-size:8.5pt; color:#64748b; font-weight:normal; }
.mf { color:#b45309; font-style:italic; }
.sub { text-align:center; color:#475569; font-size:10pt; } .base { text-align:center; color:#64748b; font-size:9pt; margin-bottom:14px; }
table { width:100%; border-collapse:collapse; margin:8px 0; font-size:9.5pt; } th,td { border:1px solid #cbd5e1; padding:4px 7px; text-align:left; vertical-align:top; } th { background:#f0fdfa; color:#0f766e; }
.warn { border:1px solid #fbbf24; background:#fffbeb; border-radius:6px; padding:10px; margin:8px 0; font-size:9.5pt; } .warn ul { margin:6px 0 0 0; padding-left:18px; }
.ok { border:1px solid #6ee7b7; background:#ecfdf5; border-radius:6px; padding:10px; margin:8px 0; font-size:9.5pt; }
.assin { margin-top:38px; display:flex; justify-content:space-around; text-align:center; font-size:10pt; } .assin div { border-top:1px solid #334155; width:40%; padding-top:4px; }
.foot { margin-top:20px; border-top:1px solid #e2e8f0; padding-top:8px; font-size:8pt; color:#94a3b8; text-align:center; }
.bar { position:sticky; top:0; background:#0f766e; color:#fff; padding:8px 14px; font-family:system-ui,sans-serif; font-size:12px; display:flex; gap:10px; align-items:center; }
.bar button { background:#fff; color:#0f766e; border:none; border-radius:6px; padding:6px 12px; font-weight:600; cursor:pointer; }
@media print { .bar { display:none; } }
</style></head><body>
<div class="bar">${esc(titulo)} gerado — revise e ajuste antes de usar no processo. <button onclick="window.print()">Salvar como PDF / Imprimir</button></div>
<div style="padding:0 4px">
<h1>${esc(titulo)}</h1>
<div class="sub"><b>Prefeitura Municipal de ${esc(nomeEnte)}</b></div>
<div class="base">${esc(baseTopo)} · gerado pela PNIGP em ${esc(hoje())}</div>
${corpo}
<div class="assin"><div>${esc(assinaturas[0])}</div><div>${esc(assinaturas[1])}</div></div>
<div class="foot">Documento gerado como MINUTA de apoio, a partir de bases públicas (PNCP, CATMAT/CATSER) e da legislação vigente. Não substitui a análise técnica e jurídica do órgão. PNIGP · Instituto i10.</div>
</div></body></html>`;
}

const secao = (n: number, titulo: string, base: string, corpo: string) =>
  `<h2>${n}. ${esc(titulo)} <span class="lb">(${esc(base)})</span></h2>${corpo.startsWith("<") ? corpo : `<p>${corpo}</p>`}`;

// resumo do objeto a partir da cesta ("Aquisição de A, B e C")
function resumoObjeto(dados: DadosProcesso): string {
  const nomes = dados.itens.map((i) => i.descricao).filter(Boolean);
  if (!nomes.length) return "[objeto da contratação]";
  const lista = nomes.length <= 3 ? nomes.join(", ").replace(/, ([^,]*)$/, " e $1") : `${nomes.slice(0, 2).join(", ")} e outros ${nomes.length - 2} itens`;
  const verbo = dados.tipo === "obra_engenharia" ? "Contratação de" : dados.tipo.startsWith("servico") ? "Contratação de" : "Aquisição de";
  return `${verbo} ${lista}`;
}

const blocoAlertas = (dados: DadosProcesso): string => {
  const al = alertasCesta(dados.itens);
  const ab = aberturaCesta(dados.itens);
  return al.length
    ? `<div class="warn"><b>Pontos de atenção na especificação (abertura à concorrência: ${ab}/100):</b><ul>${al.map((a) => `<li><b>Item “${esc(a.item)}”</b>: “${esc(a.termo)}” — ${esc(a.motivo)} <i>Sugestão:</i> ${esc(a.sugestao)} <span class="lb">(${esc(a.base)})</span></li>`).join("")}</ul></div>`
    : `<div class="ok"><b>Especificação sem termos restritivos detectados</b> — boa abertura à concorrência (${ab}/100).</div>`;
};

// resolve a modalidade × forma efetiva (escolha explícita do gestor, ou a recomendada por valor/objeto)
export type ModalidadeResolvida = { def: ModalidadeDef; forma: Forma; nome: string; criterio: string; justificativa: string; base: string; eletronico: boolean; srp: boolean };
export function resolverModalidade(dados: DadosProcesso, total: number): ModalidadeResolvida {
  const id = dados.modalidade ?? modalidadeIdRecomendada(dados.tipo, total);
  const def = modalidadeDef(id);
  const forma = dados.forma && def.formas.includes(dados.forma) ? dados.forma : def.formaPadrao;
  const rec = recomendarModalidade(dados.tipo, total);
  const criterio = def.id === "credenciamento" ? "não há disputa (contratação de todos os habilitados)" : def.id === "inexigibilidade" ? "inviável a competição" : rec.criterio;
  const nome = def.instrumento === "ato" ? def.nome : `${def.nome} — forma ${FORMA_LABEL[forma].toLowerCase()}`;
  const srp = !!dados.srp && srpAdmitido(def.id);
  const nomeCompleto = srp ? `${nome} · para REGISTRO DE PREÇOS (SRP)` : nome;
  return { def, forma, nome: nomeCompleto, criterio, justificativa: rec.justificativa, base: def.base, eletronico: forma === "eletronica", srp };
}

// PEÇAS EFETIVAS do processo — reagem ao SRP: com SRP a peça de resultado é a ATA DE REGISTRO DE PREÇOS (não o Contrato).
// (o Edital passa a ser "Edital de RP" na prática; a troca estrutural é Contrato → Ata de RP.) É o que MONTAR.
export function pecasDoProcesso(dados: DadosProcesso, total: number): ArtefatoId[] {
  const { def, srp } = resolverModalidade(dados, total);
  const pecas = [...def.pecas];
  if (srp) return pecas.map((p) => (p === "contrato" ? "ata_rp" : p));
  return pecas;
}

// ─────────────────────────────────────────────────────────────────────────────
// 1) DFD — Documento de Formalização da Demanda
// ─────────────────────────────────────────────────────────────────────────────
function gerarDFD(dados: DadosProcesso, nomeEnte: string): string {
  const total = valorTotal(dados.itens);
  const s = [
    secao(1, "Órgão/setor demandante e responsável", "art. 12, VII", `<p>Unidade requisitante: <b>${campo(dados.orgao, "secretaria/setor demandante")}</b>.<br>Responsável pela demanda: ${campo(dados.responsavel, "nome e cargo do responsável")}.</p>`),
    secao(2, "Descrição sucinta do objeto", "art. 6º, XX", `<p>${esc(resumoObjeto(dados))}, conforme itens e quantitativos da tabela abaixo.</p>${tabelaItens(dados.itens)}`),
    secao(3, "Justificativa da necessidade da contratação", "art. 6º, XX", `<p>${campo(dados.necessidade, "descrever o problema/necessidade pública que a contratação atende")}</p>`),
    secao(4, "Estimativa preliminar do valor", "IN SEGES/ME 65/2021", `<p>Valor total estimado preliminar: <b>${brl(total)}</b>, com base em preços de referência (mediana) do Banco de Preços. A pesquisa de preços definitiva será consolidada no ETP/TR.</p>`),
    secao(5, "Grau de prioridade e data pretendida", "art. 12, VII", `<p>${campo(dados.prioridade, "prioridade (baixa/média/alta) e data pretendida para a contratação")}</p>`),
    secao(6, "Vinculação ao Plano de Contratações Anual (PCA)", "art. 12, VII", `<p>A presente demanda <i class="mf">[está / deverá ser incluída]</i> no Plano de Contratações Anual do exercício, em atendimento ao planejamento das contratações.</p>`),
  ].join("");
  return docShell("Documento de Formalização da Demanda (DFD)", "Lei nº 14.133/2021, art. 12, VII", s, nomeEnte, ["Responsável pela demanda", "Autoridade da unidade requisitante"]);
}

// ─────────────────────────────────────────────────────────────────────────────
// 2) ETP — Estudo Técnico Preliminar (mínimo obrigatório: art. 18, §2º → incisos I, IV, VI, VIII, XIII)
// ─────────────────────────────────────────────────────────────────────────────
function gerarETP(dados: DadosProcesso, nomeEnte: string): string {
  const total = valorTotal(dados.itens);
  const m = resolverModalidade(dados, total);
  const parcelavel = dados.itens.length > 1;
  const s = [
    secao(1, "Descrição da necessidade", "art. 18, §1º, I", `<p>${campo(dados.necessidade, "problema a ser resolvido sob a perspectiva do interesse público")}</p>`),
    secao(2, "Requisitos da contratação", "art. 18, §1º, III", `<p>O objeto deverá atender aos requisitos técnicos especificados por item na tabela abaixo, descritos por desempenho e função sempre que possível, admitida a equivalência (art. 41).</p>${tabelaItens(dados.itens, false)}${blocoAlertas(dados)}`),
    secao(3, "Levantamento de mercado e soluções", "art. 18, §1º, III", `<p>Foram consultados os preços praticados por municípios de Santa Catarina no Banco de Preços (base PNCP), servindo de referência de mercado. <i class="mf">[Registrar as soluções alternativas analisadas e a justificativa da escolha.]</i></p>`),
    secao(4, "Estimativa das quantidades", "art. 18, §1º, IV", `<p>As quantidades foram estimadas conforme a memória de cálculo do consumo/necessidade da unidade, detalhadas por item:</p>${tabelaItens(dados.itens)}`),
    secao(5, "Estimativa do valor da contratação", "art. 18, §1º, VI · IN 65/2021", `<p>Valor total estimado: <b>${brl(total)}</b>, obtido pela mediana dos preços de referência por item (medida robusta a outliers, IN SEGES/ME 65/2021). As memórias de cálculo e as fontes integram os autos.</p>`),
    secao(6, "Justificativa do parcelamento", "art. 18, §1º, VIII", `<p>${parcelavel ? "A contratação é divisível em itens/lotes, favorecendo a ampliação da competitividade; adota-se o julgamento por item, salvo justificativa técnica para agrupamento." : "Objeto único/indivisível — não se aplica o parcelamento, mantendo-se a integridade técnica da contratação."} <span class="lb">(Súmula TCU 247)</span></p>`),
    secao(7, "Resultados pretendidos", "art. 18, §1º, VIII", `<p>Atendimento da necessidade descrita, com economicidade (preço aderente à mediana de mercado), regularidade do processo e ampla disputa. <i class="mf">[Complementar com metas/benefícios esperados.]</i></p>`),
    secao(8, "Posicionamento conclusivo sobre a viabilidade", "art. 18, §1º, XIII", `<p>Diante do exposto, a contratação mostra-se <b>tecnicamente viável, econômica e vantajosa</b> para a Administração, recomendando-se o prosseguimento por <b>${esc(m.nome)}</b> (critério: ${esc(m.criterio)}). ${esc(m.justificativa)} <span class="lb">(${esc(m.base)})</span></p>`),
  ].join("");
  return docShell("Estudo Técnico Preliminar (ETP)", "Lei nº 14.133/2021, art. 18", s, nomeEnte, ["Equipe de planejamento", "Autoridade competente"]);
}

// ─────────────────────────────────────────────────────────────────────────────
// 3) TR — Termo de Referência (multi-item), estrutura do art. 6º, XXIII
// ─────────────────────────────────────────────────────────────────────────────
function gerarTR(dados: DadosProcesso, nomeEnte: string): string {
  const total = valorTotal(dados.itens);
  const m = resolverModalidade(dados, total);
  const s = [
    secao(1, "Definição do objeto", "art. 6º, XXIII, 'a'", `<p>${esc(resumoObjeto(dados))}, nos termos da tabela de itens abaixo, conforme condições e exigências estabelecidas neste instrumento.</p>${tabelaItens(dados.itens)}`),
    secao(2, "Fundamentação da contratação", "art. 6º, XXIII, 'b'", `<p>${campo(dados.necessidade, "necessidade pública, referenciada ao ETP e ao PCA")}</p>`),
    secao(3, "Descrição da solução como um todo", "art. 6º, XXIII, 'c'", `<p>A solução compreende o fornecimento do objeto no seu ciclo de vida — aquisição, entrega, garantia e assistência técnica quando aplicável — e não apenas o item isolado.</p>`),
    secao(4, "Requisitos da contratação", "art. 6º, XXIII, 'd' · art. 41", `<p>Especificação técnica por item (tabela acima), descrita por desempenho/função. Admite-se produto equivalente; eventual indicação de marca é excepcional, justificada nos autos e seguida de “ou equivalente”.</p>${blocoAlertas(dados)}`),
    secao(5, "Modelo de execução e local de entrega", "art. 6º, XXIII, 'e'/'f'", `<p>Prazo de entrega/execução: ${campo(dados.prazoEntrega, "prazo em dias")}. Local: ${campo(dados.local, "local de entrega")}. A execução será acompanhada e fiscalizada por servidor(es) formalmente designado(s).</p>`),
    secao(6, "Critérios de medição e pagamento", "art. 6º, XXIII, 'g'", `<p>O pagamento será efetuado após o recebimento definitivo do objeto, mediante atesto do fiscal do contrato e apresentação da nota fiscal, no prazo e nas condições da minuta de contrato.</p>`),
    secao(7, "Forma de seleção e critério de julgamento", "art. 6º, XXIII, 'h'", `<p>Modalidade: <b>${esc(m.nome)}</b> — critério de julgamento: ${esc(m.criterio)}.<br><span style="color:#475569">${esc(m.justificativa)} (${esc(m.base)})</span></p>`),
    secao(8, "Estimativa do valor (preço de referência)", "art. 6º, XXIII, 'i' · IN 65/2021", `<p>Valor total estimado: <b>${brl(total)}</b>. Valores unitários de referência = mediana das compras de municípios de SC (Banco de Preços — PNCP). Fonte e memórias de cálculo nos autos.</p>`),
    secao(9, "Adequação orçamentária", "art. 6º, XXIII, 'k' · LRF art. 16", `<p>${campo(dados.dotacao, "dotação orçamentária / fonte de recursos que suporta a despesa")}</p>`),
  ].join("");
  return docShell("Termo de Referência (TR)", "Lei nº 14.133/2021, art. 6º, XXIII", s, nomeEnte, ["Responsável pela elaboração", "Autoridade competente"]);
}

// ─────────────────────────────────────────────────────────────────────────────
// 4) EDITAL — Minuta (fase externa), art. 25
// ─────────────────────────────────────────────────────────────────────────────
function gerarEdital(dados: DadosProcesso, nomeEnte: string): string {
  const total = valorTotal(dados.itens);
  const m = resolverModalidade(dados, total);
  const eletronico = m.eletronico;
  const cred = m.def.id === "credenciamento";
  const s = [
    secao(1, "Preâmbulo", "art. 25", `<p>O Município de ${esc(nomeEnte)}, por meio da ${campo(dados.orgao, "secretaria/unidade")}, torna público que realizará <b>${esc(m.def.nome)}</b> ${eletronico ? "<b>na forma eletrônica</b>" : "<b>na forma presencial</b>"}${cred ? "" : `, do tipo <b>${esc(m.criterio)}</b>`}, regido pela Lei nº 14.133/2021, na data e horário indicados em <i class="mf">[${eletronico ? "plataforma / portal de contratações" : "endereço da sessão presencial"}]</i>. Sessão pública em <i class="mf">[data e hora]</i>.${eletronico ? "" : ` <span class="lb">(forma presencial: art. 17, §2º — justificar nos autos a inviabilidade do meio eletrônico)</span>`}</p>`),
    secao(2, "Do objeto", "art. 25", `<p>${esc(resumoObjeto(dados))}, conforme especificações do <b>Termo de Referência (Anexo I)</b>. Valor total estimado: <b>${brl(total)}</b>.</p>${tabelaItens(dados.itens)}`),
    secao(3, "Das condições de participação", "art. 9º; LC 123/2006", `<p>Poderão participar os interessados do ramo pertinente ao objeto que atendam às exigências deste Edital. Será assegurado tratamento diferenciado às microempresas e empresas de pequeno porte (LC 123/2006), inclusive o direito de preferência e a regularização fiscal tardia.${cred ? " No credenciamento, serão contratados TODOS os interessados que preencherem os requisitos — não há disputa entre eles (art. 79)." : ""}</p>`),
    secao(4, "Da apresentação e do julgamento das propostas", "art. 34; art. 56–57", `<p>${cred ? "Não há julgamento competitivo: a habilitação é a condição do credenciamento; o preço é fixado pela Administração ou tabelado." : `As propostas serão julgadas pelo critério de <b>${esc(m.criterio)}</b>. ${eletronico ? "Haverá fase de lances." : "As propostas serão apresentadas e abertas em sessão presencial."} Será verificada a exequibilidade e a conformidade da proposta com o Termo de Referência.`}</p>`),
    secao(5, "Da habilitação", "art. 62–70", `<p>Habilitação jurídica, fiscal/social/trabalhista, econômico-financeira e técnica, restrita ao necessário ao cumprimento do objeto. <b>É vedada a exigência cumulativa de capital social mínimo e patrimônio líquido</b> (Súmula TCU 275) — exige-se apenas um dos parâmetros, quando cabível.</p>`),
    secao(6, "Dos recursos", "art. 165–168", `<p>Caberá recurso no prazo legal, dirigido à autoridade competente, franqueada vista dos autos.</p>`),
    secao(7, "Da adjudicação e homologação", "art. 71", `<p>Encerrado o julgamento e a habilitação, o objeto será adjudicado ao licitante vencedor e o procedimento homologado pela autoridade competente.</p>`),
    secao(8, "Das sanções administrativas", "art. 155–156", `<p>O descumprimento das obrigações sujeitará o licitante/contratado às sanções do art. 156 da Lei 14.133/2021, assegurados o contraditório e a ampla defesa.</p>`),
    secao(9, "Dos anexos", "art. 25", `<p>Anexo I — Termo de Referência; Anexo II — Minuta de Contrato; Anexo III — <i class="mf">[modelo de proposta / declarações]</i>.</p>`),
  ].join("");
  return docShell("Minuta de Edital", "Lei nº 14.133/2021, art. 25", s, nomeEnte, ["Agente de contratação / Pregoeiro", "Autoridade competente"]);
}

// ─────────────────────────────────────────────────────────────────────────────
// 5) CONTRATO — Minuta (fase externa), art. 89–92
// ─────────────────────────────────────────────────────────────────────────────
function gerarContrato(dados: DadosProcesso, nomeEnte: string): string {
  const total = valorTotal(dados.itens);
  const s = [
    secao(1, "Das partes", "art. 92, I", `<p><b>CONTRATANTE:</b> Município de ${esc(nomeEnte)}, por meio da ${campo(dados.orgao, "secretaria/unidade")}, inscrito no CNPJ <i class="mf">[nº]</i>.<br><b>CONTRATADA:</b> <i class="mf">[razão social, CNPJ, endereço e representante legal do vencedor]</i>.</p>`),
    secao(2, "Do objeto", "art. 92, I", `<p>${esc(resumoObjeto(dados))}, conforme o Termo de Referência e a proposta vencedora, que integram este contrato.</p>${tabelaItens(dados.itens)}`),
    secao(3, "Do valor e da dotação orçamentária", "art. 92, II · LRF art. 16", `<p>Valor total: <b>${brl(total)}</b>. Despesa à conta da dotação: ${campo(dados.dotacao, "dotação orçamentária / fonte")}.</p>`),
    secao(4, "Da vigência", "art. 105", `<p>A vigência inicia-se na data de assinatura e encerra-se em <i class="mf">[prazo]</i>, admitida prorrogação nos termos da lei.</p>`),
    secao(5, "Das obrigações das partes", "art. 92, XIV", `<p>A CONTRATADA obriga-se a entregar/executar o objeto conforme o TR, nos prazos e padrões pactuados; a CONTRATANTE, a fiscalizar e a pagar nas condições ajustadas.</p>`),
    secao(6, "Da execução, do recebimento e do pagamento", "art. 140; art. 6º, XXIII, 'g'", `<p>Prazo de entrega/execução: ${campo(dados.prazoEntrega, "prazo")}. Local: ${campo(dados.local, "local")}. O recebimento será provisório e definitivo; o pagamento ocorrerá após o atesto do fiscal e a apresentação da nota fiscal.</p>`),
    secao(7, "Da fiscalização", "art. 117", `<p>A execução será acompanhada por <b>fiscal</b> e <b>gestor</b> do contrato formalmente designados: <i class="mf">[nomes e portarias de designação]</i>.</p>`),
    secao(8, "Das sanções", "art. 156", `<p>Pelo inadimplemento, aplicam-se as sanções do art. 156 (advertência, multa, impedimento e declaração de inidoneidade), assegurados o contraditório e a ampla defesa.</p>`),
    secao(9, "Da rescisão", "art. 137–139", `<p>O contrato poderá ser rescindido nas hipóteses do art. 137, observado o devido processo.</p>`),
    secao(10, "Do foro", "art. 92, §1º", `<p>Fica eleito o foro da Comarca de ${esc(nomeEnte)} para dirimir as questões oriundas deste contrato.</p>`),
  ].join("");
  return docShell("Minuta de Contrato Administrativo", "Lei nº 14.133/2021, art. 89–92", s, nomeEnte, ["Pelo CONTRATANTE", "Pela CONTRATADA"]);
}

// ─────────────────────────────────────────────────────────────────────────────
// 4b) ATO / AVISO DE CONTRATAÇÃO DIRETA — dispensa/inexigibilidade (art. 72)
// ─────────────────────────────────────────────────────────────────────────────
function gerarAto(dados: DadosProcesso, nomeEnte: string): string {
  const total = valorTotal(dados.itens);
  const m = resolverModalidade(dados, total);
  const inexig = m.def.id === "inexigibilidade";
  const fundamento = inexig ? "INEXIGIBILIDADE de licitação (art. 74)" : "DISPENSA de licitação (art. 75)";
  const s = [
    secao(1, "Objeto e fundamento da contratação direta", "art. 72, I", `<p>${esc(resumoObjeto(dados))} — contratação por <b>${esc(fundamento)}</b>, ${m.eletronico ? "na forma eletrônica" : "na forma presencial"}, regida pela Lei nº 14.133/2021.</p>${tabelaItens(dados.itens)}`),
    secao(2, "Justificativa da contratação e da escolha do fornecedor", "art. 72, II", `<p>${inexig
      ? `Inviável a competição (art. 74): <i class="mf">[fornecedor exclusivo / notória especialização / credenciamento — indicar a hipótese e comprovar]</i>. A escolha recai sobre <i class="mf">[fornecedor]</i> por <i class="mf">[razão da escolha]</i>.`
      : `Enquadramento da dispensa (art. 75): <i class="mf">[indicar o inciso — valor (I/II), emergência, licitação deserta, etc.]</i>. ${total > 0 ? `Valor total (${brl(total)}) compatível com a hipótese.` : ""}`}</p>`),
    secao(3, "Justificativa do preço", "art. 72, III", `<p>Preço aderente à mediana de mercado (Banco de Preços — PNCP); memórias de cálculo e fontes nos autos. Valor total estimado: <b>${brl(total)}</b>.</p>${blocoAlertas(dados)}`),
    secao(4, "Adequação orçamentária", "art. 72; LRF art. 16", `<p>${campo(dados.dotacao, "dotação orçamentária / fonte de recursos")}</p>`),
    secao(5, "Ratificação pela autoridade competente", "art. 72, parágrafo único", `<p>Autorizo e <b>ratifico</b> a presente contratação direta, com fundamento no ${esc(fundamento)}, determinando sua publicação no PNCP para eficácia (art. 72, parágrafo único, c/c art. 94).</p>`),
  ];
  return docShell("Aviso / Ato de Contratação Direta", "Lei nº 14.133/2021, art. 72", s.join(""), nomeEnte, ["Agente/setor responsável", "Autoridade competente — ratificação"]);
}

// ─────────────────────────────────────────────────────────────────────────────
// 5) ATA DE REGISTRO DE PREÇOS — peça de resultado quando há SRP (art. 82–86), no lugar do Contrato
// ─────────────────────────────────────────────────────────────────────────────
function gerarAtaRP(dados: DadosProcesso, nomeEnte: string): string {
  const total = valorTotal(dados.itens);
  const m = resolverModalidade(dados, total);
  const s = [
    secao(1, "Do órgão gerenciador e participantes", "art. 82; art. 86", `<p><b>Órgão gerenciador:</b> Município de ${esc(nomeEnte)}, por meio da ${campo(dados.orgao, "secretaria/unidade")}.<br><b>Órgãos participantes:</b> <i class="mf">[listar, se houver]</i>. Adesões posteriores (“caronas”) observarão os limites do art. 86.</p>`),
    secao(2, "Do objeto e dos preços registrados", "art. 82, §1º", `<p>Registro de preços para eventual e futura contratação de ${esc(resumoObjeto(dados))}, resultante da ${esc(m.nome)}, conforme o Edital e a proposta vencedora.</p>${tabelaItens(dados.itens)}`),
    secao(3, "Do fornecedor e do cadastro de reserva", "art. 82, §4º", `<p><b>Fornecedor registrado:</b> <i class="mf">[razão social, CNPJ do vencedor]</i>. <b>Cadastro de reserva:</b> <i class="mf">[demais licitantes que aceitaram cotar ao preço do 1º colocado, na ordem de classificação]</i>.</p>`),
    secao(4, "Da vigência", "art. 84", `<p>A Ata vigora por <b>1 (um) ano</b>, podendo ser prorrogada por igual período desde que comprovada a vantajosidade (art. 84), limitada a 2 anos no total.</p>`),
    secao(5, "Das condições de contratação", "art. 83", `<p>A existência de preços registrados <b>não obriga</b> a Administração a contratar; a contratação far-se-á por <b>contrato ou instrumento equivalente</b> (empenho), respeitada a ordem de classificação e as quantidades registradas.</p>`),
    secao(6, "Do controle e da revisão dos preços", "art. 82, §1º; art. 86", `<p>Os preços registrados serão acompanhados e poderão ser revistos em caso de alteração das condições de mercado, na forma do regulamento.</p>${blocoAlertas(dados)}`),
    secao(7, "Das obrigações e sanções", "art. 156", `<p>O fornecedor registrado sujeita-se às sanções do art. 156 pelo descumprimento das condições da Ata, assegurados o contraditório e a ampla defesa.</p>`),
  ];
  return docShell("Ata de Registro de Preços", "Lei nº 14.133/2021, art. 82–86 (SRP)", s.join(""), nomeEnte, ["Órgão gerenciador", "Fornecedor registrado"]);
}

// dispatcher
export function gerarArtefato(id: ArtefatoId, dados: DadosProcesso, nomeEnte: string): string {
  switch (id) {
    case "dfd": return gerarDFD(dados, nomeEnte);
    case "etp": return gerarETP(dados, nomeEnte);
    case "tr": return gerarTR(dados, nomeEnte);
    case "edital": return gerarEdital(dados, nomeEnte);
    case "ato": return gerarAto(dados, nomeEnte);
    case "contrato": return gerarContrato(dados, nomeEnte);
    case "ata_rp": return gerarAtaRP(dados, nomeEnte);
  }
}

// pré-requisitos mínimos para gerar cada artefato (para habilitar/desabilitar no UI)
export function prontoPara(id: ArtefatoId, dados: DadosProcesso): { ok: boolean; falta: string[] } {
  const falta: string[] = [];
  const temItem = dados.itens.some((i) => i.descricao.trim().length > 1);
  if (!temItem) falta.push("ao menos um item na cesta");
  if (!dados.necessidade.trim() && (id === "dfd" || id === "etp" || id === "tr")) falta.push("a justificativa da necessidade");
  const temQtdPreco = dados.itens.some((i) => (Number(i.quantidade) || 0) > 0 && (Number(i.precoUnit) || 0) > 0);
  if (!temQtdPreco && (id === "etp" || id === "tr" || id === "edital" || id === "ato" || id === "contrato")) falta.push("quantidade e preço de referência dos itens");
  return { ok: falta.length === 0, falta };
}

export { TIPO_OBJETO_LABEL, LIMITE_DISPENSA, brl as fmtBRL };
export type { TipoObjeto };
