"use client";
// Documento IMPRIMÍVEL — "Projeto de Elaboração/Revisão do Plano Municipal de Educação (PME)".
// Gera A4 formal com as 6 fases do processo + o diagnóstico municipal (Fase 2) alinhado ao PNE, preenchido com dado real.
import type { getDiagnosticoEducacaoPneSC } from "@/lib/queries";
import { PNE_ACOES, PRAZO_LABEL, LEVANTAMENTO_INTERNO } from "@/lib/pne-acoes";
import { Printer } from "lucide-react";

type Un<T> = NonNullable<Awaited<T>>;
const LBL: Record<string, string> = { atingida: "Atingida", evolucao: "Em evolução", distante: "Distante", sd: "Sem dado" };

export default function PmeProjetoDocumento({ d, nome }: { d: Un<ReturnType<typeof getDiagnosticoEducacaoPneSC>>; nome: string }) {
  const gerar = () => {
    const hoje = new Date().toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" });
    const FASES = [
      ["Mobilização e organização", "Instituir por ato oficial a Comissão Coordenadora e a Equipe Técnica; envolver a Secretaria de Educação, o Conselho Municipal de Educação, escolas, profissionais e a sociedade civil."],
      ["Diagnóstico da realidade educacional", "Levantar a situação de cada dimensão da educação — acesso, fluxo, qualidade, gestão, valorização docente e financiamento. Este diagnóstico está consolidado na seção 4 deste documento."],
      ["Metas e estratégias locais", "Adequar as 20 metas do PNE à realidade do município, com indicadores, responsáveis e prazos. O PME é decenal (vigência de 10 anos)."],
      ["Consulta pública e audiências", "Submeter a minuta à participação da comunidade escolar e da sociedade; sistematizar as contribuições, assegurando a gestão democrática."],
      ["Aprovação em lei", "Encaminhar o projeto de lei à Câmara Municipal e sancionar a Lei do Plano Municipal de Educação."],
      ["Monitoramento e avaliação", "Constituir comissão de monitoramento; realizar avaliações periódicas (no mínimo a cada 2 anos) e revisões das metas."],
    ];
    const eixos = d.eixos.map((e) => `<tr><td colspan="4" style="background:#f5f3ff;font-weight:bold;color:#5b21b6">Eixo ${e.n} — ${e.titulo}</td></tr>` +
      e.metas.map((m) => { const val = m.valor != null ? m.valor.toLocaleString("pt-BR") + m.unidade : (m.situacao !== "sd" && m.nota ? (m.situacao === "atingida" ? "sim" : "não") : "—"); return `<tr><td>${m.meta}</td><td>${m.titulo}${m.aprox ? " *" : ""}</td><td class="r">${val} <span style="color:#94a3b8">(ref.: ${m.referencia})</span></td><td class="r"><b>${LBL[m.situacao]}</b></td></tr>`; }).join("")).join("");
    const situacao = d.temPme === null ? "A situação do PME não está informada." : d.temPme ? "O município POSSUI Plano Municipal de Educação vigente — o foco recomendado é o monitoramento e a revisão (Fase 6), a partir deste diagnóstico." : "O município NÃO possui Plano Municipal de Educação vigente — recomenda-se priorizar a elaboração, iniciando pela mobilização (Fase 1).";
    const metasFlat = d.eixos.flatMap((e) => e.metas);
    const codes = [...new Set(metasFlat.map((m) => m.meta))].filter((c) => PNE_ACOES[c]);
    const acoesSec = `<h2>5. Metas, estratégias e prazos (Fase 3)</h2>
<p>Para cada estrutura, a partir da situação atual do município rumo à meta do PNE, com as estratégias e prazos sugeridos (a Comissão do PME valida e prioriza):</p>
${codes.map((c) => { const ac = PNE_ACOES[c]; const rel = metasFlat.filter((m) => m.meta === c); return `<table style="margin:6px 0"><tr><td colspan="2" style="background:#f5f3ff;color:#5b21b6"><b>${c} — ${ac.estrutura}</b></td></tr>
<tr><td style="width:30%">Situação atual</td><td>${rel.map((m) => `${m.titulo.split("—")[0].trim()}: ${m.valor != null ? m.valor.toLocaleString("pt-BR") + m.unidade : (m.situacao === "atingida" ? "sim" : "não")} (ref.: ${m.referencia})`).join("; ")}</td></tr>
<tr><td>Como elevar</td><td>${ac.comoAumentar}</td></tr>
<tr><td>Ações e prazos</td><td>${ac.acoes.map((a) => `• ${a.acao} <b>[${PRAZO_LABEL[a.prazo]}]</b>`).join("<br>")}</td></tr></table>`; }).join("")}`;
    const levSec = `<h2>6. Pontos a levantar pelas equipes internas da Secretaria</h2>
<p>Indicadores que não estão disponíveis em dado aberto por município e devem ser coletados internamente pela Secretaria de Educação para completar o diagnóstico do PME:</p>
<table><thead><tr><th>Meta</th><th>Ponto</th><th>Como levantar (fonte interna)</th><th>Responsável</th></tr></thead><tbody>
${LEVANTAMENTO_INTERNO.map((l) => `<tr><td>${l.meta}</td><td>${l.ponto}</td><td>${l.comoLevantar} <i style="color:#64748b">Fonte: ${l.fonte}.</i></td><td>${l.responsavel}</td></tr>`).join("")}
</tbody></table>`;
    const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Projeto de Elaboração do PME — ${nome}</title>
<style>
@page { size: A4; margin: 22mm 18mm; }
* { box-sizing: border-box; }
body { font-family: Georgia, 'Times New Roman', serif; color: #1e293b; line-height: 1.5; font-size: 11.5pt; }
h1 { font-size: 16pt; text-align: center; margin: 0 0 2px; }
h2 { font-size: 12.5pt; border-bottom: 2px solid #5b21b6; color: #5b21b6; padding-bottom: 3px; margin: 20px 0 8px; }
.sub { text-align: center; color: #475569; font-size: 10pt; } .base { text-align: center; color: #64748b; font-size: 9pt; margin-bottom: 16px; }
table { width: 100%; border-collapse: collapse; margin: 8px 0; font-size: 9.5pt; }
th, td { border: 1px solid #cbd5e1; padding: 4px 7px; text-align: left; } th { background: #f5f3ff; color: #5b21b6; } td.r, th.r { text-align: right; }
ol { margin: 6px 0 6px 4px; padding-left: 16px; } li { margin: 4px 0; }
.box { border: 1px solid #c4b5fd; background: #f5f3ff; border-radius: 6px; padding: 10px; margin: 8px 0; font-size: 10pt; }
.assin { margin-top: 40px; display: flex; justify-content: space-around; text-align: center; font-size: 10pt; } .assin div { border-top: 1px solid #334155; width: 40%; padding-top: 4px; }
.foot { margin-top: 22px; border-top: 1px solid #e2e8f0; padding-top: 8px; font-size: 8pt; color: #94a3b8; text-align: center; }
.fill td { color: #94a3b8; }
</style></head><body>
<h1>Projeto de Elaboração do Plano Municipal de Educação</h1>
<div class="sub"><b>Prefeitura Municipal de ${nome}</b></div>
<div class="base">Em consonância com o Plano Nacional de Educação — Lei nº 13.005/2014, art. 8º · base metodológica: Diagnóstico da Educação Nacional (MEC, 2025) · ${hoje}</div>

<h2>1. Apresentação</h2>
<p>O Plano Municipal de Educação (PME) é o instrumento decenal que organiza as políticas educacionais do município em consonância com o Plano Nacional de Educação (PNE) e o Plano Estadual. Este documento estrutura o <b>processo de elaboração</b> do PME em seis fases e já incorpora o <b>diagnóstico da realidade educacional</b> (Fase 2) de ${nome}, gerado a partir de dados oficiais.</p>
<div class="box"><b>Situação atual:</b> ${situacao}</div>

<h2>2. Fases do processo de elaboração</h2>
<ol>${FASES.map(([t, dsc], i) => `<li><b>Fase ${i + 1} — ${t}.</b> ${dsc}</li>`).join("")}</ol>

<h2>3. Cronograma e responsáveis</h2>
<table><thead><tr><th>Fase</th><th>Responsável</th><th>Início</th><th>Conclusão</th></tr></thead><tbody>
${FASES.map((_, i) => `<tr class="fill"><td>Fase ${i + 1}</td><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td></tr>`).join("")}
</tbody></table>

<h2>4. Diagnóstico da realidade educacional (Fase 2)</h2>
<p>Situação do município em cada meta do PNE que pode ser medida com os dados oficiais disponíveis:</p>
<table><thead><tr><th>Meta</th><th>Indicador</th><th class="r">Município (referência PNE)</th><th class="r">Situação</th></tr></thead><tbody>${eixos}</tbody></table>
<p style="font-size:8.5pt;color:#64748b">* Indicadores de cobertura são taxa bruta: matrículas de todas as redes sobre a população da faixa etária (aproximação por faixas de 5 anos); valores próximos de 100% indicam etapa universalizada. Fontes: INEP (Censo Escolar, IDEB, rendimento), IBGE (população, alfabetização, MUNIC), FUNDEB, SICONFI. Exibição neutra; a definição das metas é da gestão municipal.</p>

${acoesSec}
${levSec}
<div class="assin"><div>Secretário(a) Municipal de Educação</div><div>Prefeito(a) Municipal</div></div>
<div class="foot">Documento gerado automaticamente pela plataforma <b>i10 Gov 360</b> a partir de dados oficiais · ${hoje}.</div>
</body></html>`;
    abrir(html);
  };

  // CSS comum para os artefatos legais (formato de norma)
  const cssLegal = `@page{size:A4;margin:25mm 22mm}*{box-sizing:border-box}body{font-family:'Times New Roman',Georgia,serif;color:#1e293b;line-height:1.6;font-size:12pt;text-align:justify}h1{font-size:13pt;text-align:center;text-transform:uppercase;margin:0 0 4px}.sub{text-align:center;font-size:11pt;margin-bottom:18px;font-style:italic}p{margin:8px 0}.art{margin:10px 0}.assin{margin-top:50px;display:flex;justify-content:space-around;text-align:center;font-size:11pt}.assin div{border-top:1px solid #334155;width:42%;padding-top:4px}.foot{margin-top:26px;font-size:8pt;color:#94a3b8;text-align:center}`;

  // Artefato: Minuta do Projeto de Lei do PME
  const gerarLei = () => {
    const hoje = new Date().toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" });
    const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Projeto de Lei do PME — ${nome}</title><style>${cssLegal}</style></head><body>
<h1>Projeto de Lei nº _____/${new Date().getFullYear()}</h1>
<p class="sub">Aprova o Plano Municipal de Educação de ${nome} e dá outras providências.</p>
<p>A Câmara Municipal de ${nome} aprova e eu, Prefeito(a) Municipal, sanciono a seguinte Lei:</p>
<p class="art"><b>Art. 1º</b> Fica aprovado o Plano Municipal de Educação — PME, com vigência de 10 (dez) anos a contar da publicação desta Lei, na forma do Anexo, em cumprimento ao art. 8º da Lei Federal nº 13.005, de 25 de junho de 2014 (Plano Nacional de Educação).</p>
<p class="art"><b>Art. 2º</b> São diretrizes do PME: I — universalização do atendimento escolar; II — superação das desigualdades educacionais, com ênfase na promoção da equidade; III — melhoria da qualidade da educação; IV — formação e valorização dos profissionais da educação; V — gestão democrática da educação pública; VI — aplicação eficiente dos recursos públicos.</p>
<p class="art"><b>Art. 3º</b> As metas e estratégias constantes do Anexo serão cumpridas no prazo de vigência deste Plano, ressalvadas as que possuam prazo próprio.</p>
<p class="art"><b>Art. 4º</b> O Município realizará, no mínimo, 2 (duas) conferências municipais de educação durante a vigência do PME, articuladas às conferências estadual e nacional.</p>
<p class="art"><b>Art. 5º</b> O Poder Público instituirá, no prazo de 1 (um) ano da publicação desta Lei, comissão permanente de monitoramento e avaliação do PME, com representação da Secretaria Municipal de Educação, do Conselho Municipal de Educação, das escolas e da sociedade civil.</p>
<p class="art"><b>Art. 6º</b> O plano plurianual, as diretrizes orçamentárias e os orçamentos anuais do Município serão formulados de modo a assegurar a consignação de dotações orçamentárias compatíveis com as metas deste Plano.</p>
<p class="art"><b>Art. 7º</b> Esta Lei entra em vigor na data de sua publicação.</p>
<div class="assin"><div>Prefeito(a) Municipal de ${nome}</div></div>
<div class="foot">Minuta gerada pela plataforma i10 Gov 360 · ${hoje}. Texto de referência a ser adequado pela Procuradoria e pela Secretaria de Educação; o Anexo (metas e estratégias) parte do diagnóstico municipal.</div>
</body></html>`;
    abrir(html);
  };

  // Artefato: Portaria de instituição da Comissão
  const gerarPortaria = () => {
    const hoje = new Date().toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" });
    const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Portaria da Comissão do PME — ${nome}</title><style>${cssLegal}</style></head><body>
<h1>Portaria nº _____/${new Date().getFullYear()}</h1>
<p class="sub">Institui a Comissão Coordenadora e a Equipe Técnica responsáveis pela elaboração/revisão do Plano Municipal de Educação.</p>
<p>O(A) Secretário(a) Municipal de Educação de ${nome}, no uso de suas atribuições legais, e considerando o disposto no art. 8º da Lei Federal nº 13.005/2014 (PNE), <b>RESOLVE:</b></p>
<p class="art"><b>Art. 1º</b> Fica instituída a Comissão Coordenadora do processo de elaboração/revisão do Plano Municipal de Educação, composta por representantes de: I — Secretaria Municipal de Educação; II — Conselho Municipal de Educação; III — direções e profissionais das escolas da rede; IV — pais/responsáveis e estudantes; V — sociedade civil organizada; VI — Câmara Municipal (na qualidade de convidada).</p>
<p class="art"><b>Art. 2º</b> Compete à Comissão Coordenadora: I — conduzir o diagnóstico da realidade educacional; II — sistematizar as metas e estratégias alinhadas ao PNE; III — organizar a consulta pública e as audiências; IV — elaborar a minuta do PME a ser encaminhada ao Chefe do Executivo.</p>
<p class="art"><b>Art. 3º</b> Fica instituída a Equipe Técnica de apoio, responsável pelo levantamento de dados, redação e sistematização dos documentos.</p>
<p class="art"><b>Art. 4º</b> Os trabalhos observarão as fases de mobilização, diagnóstico, definição de metas, consulta pública, aprovação e monitoramento.</p>
<p class="art"><b>Art. 5º</b> Esta Portaria entra em vigor na data de sua publicação.</p>
<div class="assin"><div>Secretário(a) Municipal de Educação de ${nome}</div></div>
<div class="foot">Modelo gerado pela plataforma i10 Gov 360 · ${hoje}. Adequar composição e nomes conforme a realidade do município.</div>
</body></html>`;
    abrir(html);
  };

  // Artefato: Minuta de Lei do Plano de Carreira e Remuneração do Magistério (valorização — PNE Metas 17 e 18)
  const gerarMagisterio = () => {
    const hoje = new Date().toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" });
    const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Plano de Carreira do Magistério — ${nome}</title><style>${cssLegal}</style></head><body>
<h1>Projeto de Lei nº _____/${new Date().getFullYear()}</h1>
<p class="sub">Institui o Plano de Carreira e Remuneração do Magistério Público Municipal de ${nome} e dá outras providências.</p>
<p>A Câmara Municipal de ${nome} aprova e eu sanciono a seguinte Lei:</p>
<p class="art"><b>Art. 1º</b> Fica instituído o Plano de Carreira e Remuneração dos Profissionais do Magistério da rede pública municipal de ensino, em observância ao art. 206 da Constituição Federal, à Lei nº 9.394/1996 (LDB), à Lei nº 11.738/2008 (Piso Salarial) e à Meta 18 do Plano Nacional de Educação (Lei nº 13.005/2014).</p>
<p class="art"><b>Art. 2º</b> O ingresso na carreira dar-se-á exclusivamente por concurso público de provas e títulos, exigida a habilitação específica.</p>
<p class="art"><b>Art. 3º</b> A carreira estrutura-se em níveis, correspondentes à titulação (magistério/licenciatura, especialização, mestrado e doutorado), e em classes/referências, percorridas por progressão.</p>
<p class="art"><b>Art. 4º</b> O vencimento inicial da carreira não será inferior ao piso salarial profissional nacional do magistério, atualizado na forma da Lei nº 11.738/2008.</p>
<p class="art"><b>Art. 5º</b> A jornada de trabalho observará o limite máximo de 2/3 (dois terços) da carga horária para o desempenho das atividades de interação com os educandos, destinando-se 1/3 (um terço) às atividades extraclasse (hora-atividade).</p>
<p class="art"><b>Art. 6º</b> A progressão funcional dar-se-á: I — horizontalmente, por titulação/qualificação; II — verticalmente, por tempo de serviço e avaliação de desempenho.</p>
<p class="art"><b>Art. 7º</b> O Município promoverá a formação inicial e continuada dos profissionais do magistério, com incentivo à pós-graduação.</p>
<p class="art"><b>Art. 8º</b> As despesas decorrentes desta Lei correrão à conta das dotações próprias, observados os recursos vinculados à manutenção e desenvolvimento do ensino e ao FUNDEB.</p>
<p class="art"><b>Art. 9º</b> Esta Lei entra em vigor na data de sua publicação.</p>
<div class="assin"><div>Prefeito(a) Municipal de ${nome}</div></div>
<div class="foot">Minuta de referência gerada pela plataforma i10 Gov 360 · ${hoje}. Estrutura de níveis, tabela de vencimentos e percentuais de progressão devem ser definidos pela gestão e negociados com a categoria; adequar pela Procuradoria.</div>
</body></html>`;
    abrir(html);
  };

  const abrir = (html: string) => { const w = window.open("", "_blank"); if (!w) return; w.document.write(html); w.document.close(); w.onload = () => { w.focus(); w.print(); }; setTimeout(() => { try { w.focus(); w.print(); } catch { /* noop */ } }, 500); };

  return (
    <div className="rounded-2xl border border-violet-200 bg-violet-50/40 p-4">
      <div className="font-display text-sm font-bold text-slate-800">📄 Artefatos do Plano Municipal de Educação — {nome}</div>
      <p className="mt-0.5 text-[12px] text-slate-600">Documentos formais gerados pelo sistema para a Secretaria conduzir a criação, a aprovação e a implementação do PME. Adequáveis à realidade do município.</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button onClick={gerar} className="flex items-center gap-2 rounded-lg bg-violet-700 px-3.5 py-2 text-sm font-semibold text-white hover:bg-violet-800"><Printer className="h-4 w-4" /> Projeto de Elaboração</button>
        <button onClick={gerarPortaria} className="flex items-center gap-2 rounded-lg border border-violet-300 bg-white px-3.5 py-2 text-sm font-semibold text-violet-700 hover:bg-violet-50"><Printer className="h-4 w-4" /> Portaria da Comissão</button>
        <button onClick={gerarLei} className="flex items-center gap-2 rounded-lg border border-violet-300 bg-white px-3.5 py-2 text-sm font-semibold text-violet-700 hover:bg-violet-50"><Printer className="h-4 w-4" /> Minuta do Projeto de Lei</button>
        <button onClick={gerarMagisterio} className="flex items-center gap-2 rounded-lg border border-violet-300 bg-white px-3.5 py-2 text-sm font-semibold text-violet-700 hover:bg-violet-50"><Printer className="h-4 w-4" /> Plano de Carreira do Magistério</button>
      </div>
    </div>
  );
}
