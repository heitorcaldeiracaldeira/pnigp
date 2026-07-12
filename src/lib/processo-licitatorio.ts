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
};

export type DadosProcesso = {
  orgao: string;            // secretaria/setor demandante
  responsavel: string;      // servidor responsável pela demanda
  tipo: TipoObjeto;
  necessidade: string;      // problema/necessidade pública a atender (DFD/ETP/TR)
  prazoEntrega: string;     // prazo de entrega/execução
  local: string;            // local de entrega
  dotacao: string;          // dotação orçamentária / fonte
  prioridade: string;       // grau de prioridade / data pretendida (DFD)
  itens: ItemProcesso[];
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
export type ArtefatoId = "dfd" | "etp" | "tr" | "edital" | "contrato";
export type Artefato = { id: ArtefatoId; sigla: string; nome: string; base: string; fase: "interna" | "externa"; desc: string };

export const ARTEFATOS: Artefato[] = [
  { id: "dfd", sigla: "DFD", nome: "Documento de Formalização da Demanda", base: "Lei 14.133/2021, art. 12, VII; IN SEGES 58/2022", fase: "interna", desc: "Abre o processo: quem demanda, a necessidade, os itens e o valor estimado; vincula ao PCA." },
  { id: "etp", sigla: "ETP", nome: "Estudo Técnico Preliminar", base: "Lei 14.133/2021, art. 18, §1º e §2º", fase: "interna", desc: "Demonstra a viabilidade da contratação: necessidade, mercado, quantidades, valor e resultados pretendidos." },
  { id: "tr", sigla: "TR", nome: "Termo de Referência", base: "Lei 14.133/2021, art. 6º, XXIII", fase: "interna", desc: "Especifica o objeto para licitar: requisitos, execução, medição, preço e critério de julgamento." },
  { id: "edital", sigla: "Edital", nome: "Minuta de Edital", base: "Lei 14.133/2021, art. 25", fase: "externa", desc: "Convoca o mercado: participação, propostas, julgamento, habilitação e recursos." },
  { id: "contrato", sigla: "Contrato", nome: "Minuta de Contrato", base: "Lei 14.133/2021, art. 89–92", fase: "externa", desc: "Formaliza a contratação: obrigações, vigência, pagamento, fiscalização e sanções." },
];

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
  const rec = recomendarModalidade(dados.tipo, total);
  const parcelavel = dados.itens.length > 1;
  const s = [
    secao(1, "Descrição da necessidade", "art. 18, §1º, I", `<p>${campo(dados.necessidade, "problema a ser resolvido sob a perspectiva do interesse público")}</p>`),
    secao(2, "Requisitos da contratação", "art. 18, §1º, III", `<p>O objeto deverá atender aos requisitos técnicos especificados por item na tabela abaixo, descritos por desempenho e função sempre que possível, admitida a equivalência (art. 41).</p>${tabelaItens(dados.itens, false)}${blocoAlertas(dados)}`),
    secao(3, "Levantamento de mercado e soluções", "art. 18, §1º, III", `<p>Foram consultados os preços praticados por municípios de Santa Catarina no Banco de Preços (base PNCP), servindo de referência de mercado. <i class="mf">[Registrar as soluções alternativas analisadas e a justificativa da escolha.]</i></p>`),
    secao(4, "Estimativa das quantidades", "art. 18, §1º, IV", `<p>As quantidades foram estimadas conforme a memória de cálculo do consumo/necessidade da unidade, detalhadas por item:</p>${tabelaItens(dados.itens)}`),
    secao(5, "Estimativa do valor da contratação", "art. 18, §1º, VI · IN 65/2021", `<p>Valor total estimado: <b>${brl(total)}</b>, obtido pela mediana dos preços de referência por item (medida robusta a outliers, IN SEGES/ME 65/2021). As memórias de cálculo e as fontes integram os autos.</p>`),
    secao(6, "Justificativa do parcelamento", "art. 18, §1º, VIII", `<p>${parcelavel ? "A contratação é divisível em itens/lotes, favorecendo a ampliação da competitividade; adota-se o julgamento por item, salvo justificativa técnica para agrupamento." : "Objeto único/indivisível — não se aplica o parcelamento, mantendo-se a integridade técnica da contratação."} <span class="lb">(Súmula TCU 247)</span></p>`),
    secao(7, "Resultados pretendidos", "art. 18, §1º, VIII", `<p>Atendimento da necessidade descrita, com economicidade (preço aderente à mediana de mercado), regularidade do processo e ampla disputa. <i class="mf">[Complementar com metas/benefícios esperados.]</i></p>`),
    secao(8, "Posicionamento conclusivo sobre a viabilidade", "art. 18, §1º, XIII", `<p>Diante do exposto, a contratação mostra-se <b>tecnicamente viável, econômica e vantajosa</b> para a Administração, recomendando-se o prosseguimento por <b>${esc(rec.modalidade)}</b> (critério: ${esc(rec.criterio)}). ${esc(rec.justificativa)}</p>`),
  ].join("");
  return docShell("Estudo Técnico Preliminar (ETP)", "Lei nº 14.133/2021, art. 18", s, nomeEnte, ["Equipe de planejamento", "Autoridade competente"]);
}

// ─────────────────────────────────────────────────────────────────────────────
// 3) TR — Termo de Referência (multi-item), estrutura do art. 6º, XXIII
// ─────────────────────────────────────────────────────────────────────────────
function gerarTR(dados: DadosProcesso, nomeEnte: string): string {
  const total = valorTotal(dados.itens);
  const rec = recomendarModalidade(dados.tipo, total);
  const s = [
    secao(1, "Definição do objeto", "art. 6º, XXIII, 'a'", `<p>${esc(resumoObjeto(dados))}, nos termos da tabela de itens abaixo, conforme condições e exigências estabelecidas neste instrumento.</p>${tabelaItens(dados.itens)}`),
    secao(2, "Fundamentação da contratação", "art. 6º, XXIII, 'b'", `<p>${campo(dados.necessidade, "necessidade pública, referenciada ao ETP e ao PCA")}</p>`),
    secao(3, "Descrição da solução como um todo", "art. 6º, XXIII, 'c'", `<p>A solução compreende o fornecimento do objeto no seu ciclo de vida — aquisição, entrega, garantia e assistência técnica quando aplicável — e não apenas o item isolado.</p>`),
    secao(4, "Requisitos da contratação", "art. 6º, XXIII, 'd' · art. 41", `<p>Especificação técnica por item (tabela acima), descrita por desempenho/função. Admite-se produto equivalente; eventual indicação de marca é excepcional, justificada nos autos e seguida de “ou equivalente”.</p>${blocoAlertas(dados)}`),
    secao(5, "Modelo de execução e local de entrega", "art. 6º, XXIII, 'e'/'f'", `<p>Prazo de entrega/execução: ${campo(dados.prazoEntrega, "prazo em dias")}. Local: ${campo(dados.local, "local de entrega")}. A execução será acompanhada e fiscalizada por servidor(es) formalmente designado(s).</p>`),
    secao(6, "Critérios de medição e pagamento", "art. 6º, XXIII, 'g'", `<p>O pagamento será efetuado após o recebimento definitivo do objeto, mediante atesto do fiscal do contrato e apresentação da nota fiscal, no prazo e nas condições da minuta de contrato.</p>`),
    secao(7, "Forma de seleção e critério de julgamento", "art. 6º, XXIII, 'h'", `<p>Modalidade: <b>${esc(rec.modalidade)}</b> — critério de julgamento: ${esc(rec.criterio)}.<br><span style="color:#475569">${esc(rec.justificativa)} (${esc(rec.base)})</span></p>`),
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
  const rec = recomendarModalidade(dados.tipo, total);
  const eletronico = /pregão|concorrência/i.test(rec.modalidade);
  const s = [
    secao(1, "Preâmbulo", "art. 25", `<p>O Município de ${esc(nomeEnte)}, por meio da ${campo(dados.orgao, "secretaria/unidade")}, torna público que realizará <b>${esc(rec.modalidade)}</b>, do tipo <b>${esc(rec.criterio)}</b>, ${eletronico ? "na forma eletrônica, " : ""}regido pela Lei nº 14.133/2021, na data e horário indicados em <i class="mf">[plataforma / portal de contratações]</i>. Sessão pública em <i class="mf">[data e hora]</i>.</p>`),
    secao(2, "Do objeto", "art. 25", `<p>${esc(resumoObjeto(dados))}, conforme especificações do <b>Termo de Referência (Anexo I)</b>. Valor total estimado: <b>${brl(total)}</b>.</p>${tabelaItens(dados.itens)}`),
    secao(3, "Das condições de participação", "art. 9º; LC 123/2006", `<p>Poderão participar os interessados do ramo pertinente ao objeto que atendam às exigências deste Edital. Será assegurado tratamento diferenciado às microempresas e empresas de pequeno porte (LC 123/2006), inclusive o direito de preferência e a regularização fiscal tardia.</p>`),
    secao(4, "Da apresentação e do julgamento das propostas", "art. 34; art. 56–57", `<p>As propostas serão julgadas pelo critério de <b>${esc(rec.criterio)}</b>. ${eletronico ? "Haverá fase de lances." : ""} Será verificada a exequibilidade e a conformidade da proposta com o Termo de Referência.</p>`),
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

// dispatcher
export function gerarArtefato(id: ArtefatoId, dados: DadosProcesso, nomeEnte: string): string {
  switch (id) {
    case "dfd": return gerarDFD(dados, nomeEnte);
    case "etp": return gerarETP(dados, nomeEnte);
    case "tr": return gerarTR(dados, nomeEnte);
    case "edital": return gerarEdital(dados, nomeEnte);
    case "contrato": return gerarContrato(dados, nomeEnte);
  }
}

// pré-requisitos mínimos para gerar cada artefato (para habilitar/desabilitar no UI)
export function prontoPara(id: ArtefatoId, dados: DadosProcesso): { ok: boolean; falta: string[] } {
  const falta: string[] = [];
  const temItem = dados.itens.some((i) => i.descricao.trim().length > 1);
  if (!temItem) falta.push("ao menos um item na cesta");
  if (!dados.necessidade.trim() && (id === "dfd" || id === "etp" || id === "tr")) falta.push("a justificativa da necessidade");
  const temQtdPreco = dados.itens.some((i) => (Number(i.quantidade) || 0) > 0 && (Number(i.precoUnit) || 0) > 0);
  if (!temQtdPreco && (id === "etp" || id === "tr" || id === "edital" || id === "contrato")) falta.push("quantidade e preço de referência dos itens");
  return { ok: falta.length === 0, falta };
}

export { TIPO_OBJETO_LABEL, LIMITE_DISPENSA, brl as fmtBRL };
export type { TipoObjeto };
