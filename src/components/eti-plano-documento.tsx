"use client";
// Documento IMPRIMÍVEL do Plano de Expansão da ETI — gerado pelo sistema com os dados reais do município,
// seguindo as 3 fases do Guia MEC (Diagnóstico, Planejamento/Metas, Monitoramento). Botão gera uma janela
// de impressão isolada (A4) para a prefeitura imprimir ou salvar em PDF e formalizar.
import type { getEtiDiagnosticoSC, getEvasaoEscolarSC, getFundebGanhoEtiSC, getEscolasEtiSC } from "@/lib/queries";
import { Printer } from "lucide-react";

type Un<T> = NonNullable<Awaited<T>>;
const n0 = (x: number) => x.toLocaleString("pt-BR");
const brlD = (x: number) => (Math.abs(x) >= 1e6 ? "R$ " + (x / 1e6).toLocaleString("pt-BR", { maximumFractionDigits: 1 }) + " mi" : "R$ " + n0(Math.round(x)));

export default function EtiPlanoDocumento({ d, evasao, fundebGanho, escolasEti, nome }: { d: Un<ReturnType<typeof getEtiDiagnosticoSC>>; evasao?: Un<ReturnType<typeof getEvasaoEscolarSC>> | null; fundebGanho?: Un<ReturnType<typeof getFundebGanhoEtiSC>> | null; escolasEti?: Un<ReturnType<typeof getEscolasEtiSC>> | null; nome: string }) {
  const gerar = () => {
    const hoje = new Date().toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" });
    const linhasEtapa = d.etapas.map((e) => `<tr><td>${e.nome}</td><td class="r">${n0(e.integral)}</td><td class="r">${n0(e.total)}</td><td class="r"><b>${e.cobertura}%</b></td><td class="r">${n0(e.gap)}</td></tr>`).join("");
    const linhasMeta = d.metas.map((m) => `<tr><td>Atingir ${m.alvo}% da rede em tempo integral</td><td class="r"><b>+${n0(m.novas)}</b></td><td class="r">${m.projecao}%</td></tr>`).join("");
    const distrib = d.prioridades.map((p) => `<li><b>${p.nome}</b>: aproximadamente ${n0(p.sugestao)} novas matrículas</li>`).join("");
    const evasaoTxt = evasao?.etapas?.length ? evasao.etapas.map((e) => `${e.nome}: ${e.evasao.toLocaleString("pt-BR")}%`).join(" · ") : "dado do INEP a acompanhar";
    const fundebSec = fundebGanho ? `
<h2>3.1 Retorno financeiro — ganho de FUNDEB</h2>
<p>A matrícula em <b>tempo integral pondera mais</b> no FUNDEB (fund/pré 1,50 · médio 1,52 · creche 1,55, contra 1,00 da matrícula-padrão). Com o valor-aluno de <b>${brlD(fundebGanho.valorAluno)}</b> (FUNDEB recebido ÷ matrículas ponderadas do município), a expansão gera o seguinte aumento <b>recorrente</b> de repasse:</p>
<table><thead><tr><th>Cenário</th><th class="r">FUNDEB / ano</th><th class="r">Aumento</th><th class="r">%</th></tr></thead><tbody>
<tr><td>Situação atual</td><td class="r">${brlD(fundebGanho.fundebAtual)}</td><td class="r">—</td><td class="r">—</td></tr>
${fundebGanho.metas.map((m) => { const dep = fundebGanho.fundebAtual + m.ganhoAnual; const pct = fundebGanho.fundebAtual > 0 ? Math.round((m.ganhoAnual / fundebGanho.fundebAtual) * 1000) / 10 : 0; return `<tr><td>Meta ${m.alvo}% (+${n0(m.novas)} matrículas)</td><td class="r"><b>${brlD(dep)}</b></td><td class="r">+${brlD(m.ganhoAnual)}</td><td class="r"><b>+${pct}%</b></td></tr>`; }).join("")}
</tbody></table>
<p style="font-size:9pt;color:#475569"><b>Como é calculado:</b> (1) valor-aluno = FUNDEB recebido ÷ matrículas ponderadas — sai do próprio repasse do município; (2) matrícula ponderada = matrícula × fator (padrão 1,00; integral 1,50–1,55 conforme a etapa, Resolução MEC 05/2024); (3) ganho = (novas matrículas integrais × incremento do fator) × valor-aluno. Exemplo: um aluno de anos iniciais que passa a integral rende +0,50 × ${brlD(fundebGanho.valorAluno)} por ano. Estimativa orientativa; a distribuição do fundo é intra-estadual.</p>` : "";
    const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Plano de Expansão da ETI — ${nome}</title>
<style>
@page { size: A4; margin: 22mm 18mm; }
* { box-sizing: border-box; }
body { font-family: Georgia, 'Times New Roman', serif; color: #1e293b; line-height: 1.5; font-size: 11.5pt; }
h1 { font-size: 16pt; text-align: center; margin: 0 0 2px; }
h2 { font-size: 12.5pt; border-bottom: 2px solid #1e3a8a; color: #1e3a8a; padding-bottom: 3px; margin: 20px 0 8px; }
.sub { text-align: center; color: #475569; font-size: 10pt; margin-bottom: 2px; }
.base { text-align: center; color: #64748b; font-size: 9pt; margin-bottom: 18px; }
table { width: 100%; border-collapse: collapse; margin: 8px 0; font-size: 10pt; }
th, td { border: 1px solid #cbd5e1; padding: 5px 8px; text-align: left; }
th { background: #eff6ff; color: #1e3a8a; }
td.r, th.r { text-align: right; }
.kpi { display: flex; gap: 14px; margin: 8px 0; }
.kpi div { flex: 1; border: 1px solid #cbd5e1; border-radius: 6px; padding: 8px; text-align: center; }
.kpi b { display: block; font-size: 18pt; color: #1e3a8a; }
.kpi span { font-size: 8.5pt; color: #64748b; }
ul { margin: 6px 0 6px 18px; } li { margin: 2px 0; }
.box { border: 1px solid #93c5fd; background: #eff6ff; border-radius: 6px; padding: 10px; margin: 8px 0; font-size: 10pt; }
.assin { margin-top: 40px; display: flex; justify-content: space-around; text-align: center; font-size: 10pt; }
.assin div { border-top: 1px solid #334155; width: 40%; padding-top: 4px; }
.foot { margin-top: 24px; border-top: 1px solid #e2e8f0; padding-top: 8px; font-size: 8pt; color: #94a3b8; text-align: center; }
.fill { color: #94a3b8; } .rubr { border-bottom: 1px dotted #94a3b8; }
</style></head><body>
<h1>Plano de Expansão da Educação em Tempo Integral</h1>
<div class="sub"><b>Prefeitura Municipal de ${nome}</b></div>
<div class="base">Elaborado conforme o Guia de Apoio Técnico do MEC · Programa Escola em Tempo Integral (Lei nº 14.640/2023) · ${hoje}</div>

<h2>1. Apresentação</h2>
<p>Este documento apresenta o Plano de Expansão da Educação Integral em Tempo Integral (ETI) da rede municipal de ${nome}, estruturado nas três fases previstas pelo Guia de Apoio Técnico do Ministério da Educação: <b>Diagnóstico</b>, <b>Planejamento</b> e <b>Monitoramento</b>. O objetivo é ampliar, de forma qualificada e sustentável, o número de matrículas em tempo integral, aproveitando o financiamento federal disponível.</p>

<h2>2. Fase 1 — Diagnóstico</h2>
<p>No exercício de referência (${d.ano}), a rede possui <b>${n0(d.total)}</b> matrículas, das quais <b>${n0(d.integral)}</b> em tempo integral, o que corresponde a uma cobertura de <b>${d.cobertura}%</b>. A meta 6 do Plano Nacional de Educação (PNE) estabelece o atendimento de, no mínimo, <b>${d.metaPne}%</b> dos estudantes em tempo integral${d.cobertura >= d.metaPne ? " — meta já alcançada pelo município" : ""}.</p>
<div class="kpi"><div><b>${d.cobertura}%</b><span>cobertura em tempo integral</span></div><div><b>${n0(d.integral)}</b><span>matrículas integrais</span></div><div><b>${n0(d.gap)}</b><span>potencial de expansão</span></div></div>
<table><thead><tr><th>Etapa</th><th class="r">Integral</th><th class="r">Total</th><th class="r">Cobertura</th><th class="r">Potencial</th></tr></thead><tbody>${linhasEtapa}</tbody></table>

${escolasEti ? `<h2>2.1 Escolas prioritárias para a implantação</h2>
<p>Das <b>${n0(escolasEti.total)}</b> escolas da rede municipal, <b>${n0(escolasEti.nProntas)}</b> já dispõem da infraestrutura necessária ao tempo integral (refeitório, quadra, biblioteca e saneamento) e <b>${n0(escolasEti.nAdequar)}</b> necessitam de adequação de espaços. Recomenda-se <b>iniciar a expansão pelas escolas já preparadas</b> — menor custo e resultado mais rápido —, listadas abaixo por porte:</p>
<table><thead><tr><th>#</th><th>Escola</th><th>Bairro</th><th class="r">Matrículas</th><th class="r">Turmas</th></tr></thead><tbody>
${escolasEti.candidatas.map((e, i) => `<tr><td>${i + 1}</td><td>${e.nome}</td><td>${e.bairro || "—"}</td><td class="r">${n0(e.matriculas)}</td><td class="r">${n0(e.turmas)}</td></tr>`).join("")}
</tbody></table>` : ""}
<h2>3. Fase 2 — Planejamento e Metas</h2>
<p>A partir do diagnóstico, definem-se as metas de criação de novas matrículas em tempo integral. Os valores abaixo são <b>referências calculadas</b> sobre o total de matrículas da rede; os alvos finais devem ser definidos pela gestão, considerando a capacidade de implementação.</p>
<table><thead><tr><th>Meta</th><th class="r">Novas matrículas ETI</th><th class="r">Cobertura projetada</th></tr></thead><tbody>${linhasMeta || '<tr><td colspan="3">Cobertura já elevada — priorizar a qualificação e a manutenção das matrículas existentes.</td></tr>'}</tbody></table>
${distrib ? `<p><b>Distribuição sugerida (pelas etapas de maior lacuna):</b></p><ul>${distrib}</ul>` : ""}
<div class="box"><b>Financiamento (planejamento orçamentário)</b><ul>
<li>Programa Escola em Tempo Integral — incentivo federal por nova matrícula em tempo integral (Lei nº 14.640/2023).</li>
<li>Complementação da União ao FUNDEB — EC nº 135/2024 e Portaria MEC nº 605/2025 (recursos redistribuídos por matrícula ETI por rede).</li>
<li>Aplicação mínima de 4% do FUNDEB vinculada à criação de matrículas em tempo integral.</li></ul></div>

${fundebSec}
<h2>4. Fase 3 — Monitoramento</h2>
<p>O acompanhamento do plano se dá por meio dos seguintes eixos e indicadores:</p>
<table><thead><tr><th>Eixo</th><th>Indicadores</th></tr></thead><tbody>
<tr><td>Expansão das matrículas</td><td>nº de matrículas ETI criadas; % em tempo integral; distribuição por etapa e território (Censo Escolar).</td></tr>
<tr><td>Equidade no acesso</td><td>distribuição por raça/cor, sexo, deficiência e território (Censo Escolar, CadÚnico).</td></tr>
<tr><td>Permanência e trajetória</td><td>abandono e aprovação (INEP); <b>evasão por etapa — ${evasaoTxt}</b>; frequência (sistema da rede).</td></tr>
</tbody></table>

<h2>5. Responsáveis e prazos</h2>
<table><thead><tr><th>Ação</th><th>Responsável</th><th>Prazo</th></tr></thead><tbody>
<tr><td class="fill">&nbsp;</td><td class="fill">&nbsp;</td><td class="fill">&nbsp;</td></tr>
<tr><td class="fill">&nbsp;</td><td class="fill">&nbsp;</td><td class="fill">&nbsp;</td></tr>
<tr><td class="fill">&nbsp;</td><td class="fill">&nbsp;</td><td class="fill">&nbsp;</td></tr></tbody></table>

<div class="assin"><div>Secretário(a) Municipal de Educação</div><div>Prefeito(a) Municipal</div></div>
<div class="foot">Documento gerado automaticamente pela plataforma <b>i10 Gov 360</b> a partir de dados oficiais (INEP/FNDE, Censo Escolar) · ${hoje}. Os valores de metas são referências orientativas; a decisão é da gestão municipal.</div>
</body></html>`;
    const w = window.open("", "_blank");
    if (!w) return;
    w.document.write(html); w.document.close();
    w.onload = () => { w.focus(); w.print(); };
    setTimeout(() => { try { w.focus(); w.print(); } catch { /* noop */ } }, 500);
  };

  return (
    <div className="rounded-2xl border border-blue-200 bg-blue-50/40 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="font-display text-sm font-bold text-slate-800">📄 Documento do Plano de Expansão da ETI</div>
          <p className="mt-0.5 text-[12px] text-slate-600">Gera o plano formal com as 3 fases (Diagnóstico, Metas, Monitoramento) preenchido com os dados de {nome} — pronto para imprimir, salvar em PDF e entregar à prefeitura.</p>
        </div>
        <button onClick={gerar} className="flex items-center gap-2 rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-800">
          <Printer className="h-4 w-4" /> Gerar e imprimir o Plano
        </button>
      </div>
    </div>
  );
}
