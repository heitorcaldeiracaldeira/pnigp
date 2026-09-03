"use client";
// ═══ FORMULÁRIO DE PESQUISA DE PREÇOS — o documento que a norma exige (03/set/2026) ═══
//
// A régua é o art. 3º da IN SEGES/ME nº 65/2021, que diz o que o documento CONTERÁ, NO MÍNIMO:
//   I   — identificação do agente responsável pela cotação;
//   II  — caracterização das fontes consultadas;
//   III — série de preços coletados;
//   IV  — método matemático aplicado para a definição do valor estimado;
//   V   — justificativas para a metodologia utilizada, em especial para a desconsideração de valores
//         inexequíveis, inconsistentes e excessivamente elevados, se aplicável.
// As seções abaixo levam esses números romanos de propósito: quem confere o processo procura por eles.
//
// O art. 6º admite MÉDIA, MEDIANA ou MENOR dos preços coletados — a escolha é do responsável, e por isso
// os três aparecem lado a lado, com o resultado mudando à vista, em vez de o sistema eleger um e calar.
// O parâmetro usado é o do art. 5º, II (contratações similares de outros entes públicos), que o §1º manda
// PRIORIZAR junto com o inciso I — dizer isso no documento é o que liga o dado à regra que o autoriza.
//
// ⚠️ O que este formulário NÃO faz, e não deve fazer: escolher fornecedor, indicar marca (art. 41 da Lei
// 14.133/2021 veda direcionamento) e decidir sozinho quais preços cair fora. Ele PROPÕE as exclusões que a
// estatística sugere e exige que a justificativa seja escrita — porque é a justificativa, não a mediana,
// que sustenta o preço quando o controle perguntar.
import { useMemo, useState } from "react";
import { Printer, FileText } from "lucide-react";

type Item = {
  id: string; numeroControlePNCP: string; controlePublicado: boolean; municipio: string; orgao: string;
  modalidade: string; modoDisputa: string; srp: boolean; dataPublicacao: string | null;
  descricao: string; unidade: string; quantidade: number; unitario: number; fornecedor: string; foraDaCurva: boolean;
};
type PorUnidade = { unidade: string; grafias: string[]; n: number; media: number; mediana: number; p25: number; p75: number; menor: number; maior: number; nMunicipios: number; nForaDaCurva: number };
type Props = {
  termo: string;
  identificacao: { taxonomia: string; codigo: string; nome: string; classe: string | null } | null;
  porUnidade: PorUnidade[];
  itens: Item[];
  descartados: Item[];
  alertas: string[];
  nomeEnte?: string;
};

const brl = (v: number, casas = 2) => "R$ " + (v ?? 0).toLocaleString("pt-BR", { minimumFractionDigits: casas, maximumFractionDigits: casas });
const brlAuto = (v: number) => brl(v, v > 0 && v < 1 ? 4 : 2);
const dt = (s: string | null) => (s ? s.slice(8, 10) + "/" + s.slice(5, 7) + "/" + s.slice(0, 4) : "—");
const hoje = () => new Date().toLocaleDateString("pt-BR");
type Metodo = "mediana" | "media" | "menor";
const ROTULO: Record<Metodo, string> = { mediana: "mediana", media: "média", menor: "menor preço" };

export default function FormularioPrecoReferencia({ termo, identificacao, porUnidade, itens, descartados, alertas, nomeEnte }: Props) {
  const [orgao, setOrgao] = useState(nomeEnte ? `Município de ${nomeEnte}` : "");
  const [setor, setSetor] = useState("");
  const [processo, setProcesso] = useState("");
  const [objeto, setObjeto] = useState(identificacao?.nome || termo);
  const [agente, setAgente] = useState("");
  const [cargo, setCargo] = useState("");
  const [matricula, setMatricula] = useState("");
  const [metodo, setMetodo] = useState<Metodo>("mediana");
  // ═══ A UNIDADE DE MEDIDA É CAMPO DO FORMULÁRIO, NÃO SÓ COLUNA DA CONTA ═══
  // O objeto que vai ser contratado tem UMA unidade ("resma", "comprimido", "hora"), e é nela que o preço
  // estimado precisa estar expresso — o edital vai pedir proposta nessa unidade. Quando a série reúne mais
  // de uma, a norma não permite somar: o responsável declara qual é a do objeto, e as demais permanecem no
  // documento como referência apurada, visivelmente separadas.
  // Padrão = a unidade cuja série está menos CONCENTRADA (mais municípios), e não a mais numerosa. Medido
  // com "papel a4": por número de preços vinha "unidade" (4 preços, 1 município); por espalhamento vem
  // "resma" (5 municípios) — e "concentrada em 1 município" é ressalva da própria pesquisa. Continua sendo
  // só um padrão: a unidade do objeto é declarada por quem assina, no campo acima.
  const [unidadeRef, setUnidadeRef] = useState(
    [...porUnidade].sort((a, b) => b.nMunicipios - a.nMunicipios || b.n - a.n)[0]?.unidade || "");
  const unidadeEscolhida = porUnidade.find((u) => u.unidade === unidadeRef) || porUnidade[0];
  const [quantidades, setQuantidades] = useState<Record<string, string>>({});
  const [justificativa, setJustificativa] = useState("");

  const valorDe = (u: PorUnidade) => (metodo === "media" ? u.media : metodo === "menor" ? u.menor : u.mediana);

  // A justificativa nasce escrita com o que a apuração de fato encontrou — e fica EDITÁVEL, porque quem
  // assina é quem justifica. Texto pronto que não pode ser corrigido é armadilha, não ajuda.
  const justificativaSugerida = useMemo(() => {
    const L: string[] = [];
    L.push(`Adotou-se como método a ${ROTULO[metodo]} dos preços coletados, na forma do art. 6º da IN SEGES/ME nº 65/2021.`);
    if (metodo === "mediana") L.push("A mediana foi preferida à média por ser medida resistente a valores extremos: um único lançamento equivocado desloca a média e não desloca a mediana.");
    if (metodo === "menor") L.push("Adotou-se o menor preço coletado, o que resulta em estimativa conservadora do ponto de vista do erário, observado que o valor permanece exequível por ter sido efetivamente praticado em contratação pública.");
    if (metodo === "media") L.push("Adotou-se a média simples dos preços coletados por se tratar de série homogênea, sem valores extremos que a distorçam.");
    const fora = descartados.filter((d) => d.foraDaCurva).length;
    const srp = descartados.filter((d) => d.srp && !d.foraDaCurva).length;
    const outros = descartados.length - fora - srp;
    if (fora) L.push(`Foram desconsiderados ${fora} preço(s) situados fora do intervalo interquartil (critério de 1,5×IQR), por se apresentarem inexequíveis ou excessivamente elevados em relação à série, nos termos do art. 6º, §§ da IN SEGES/ME nº 65/2021.`);
    if (srp) L.push(`Foram desconsiderados ${srp} preço(s) originados de atas de registro de preços, por refletirem valor máximo registrado e não preço efetivamente praticado na contratação.`);
    if (outros > 0) L.push(`Foram desconsiderados ${outros} preço(s) por decisão fundamentada do responsável, conforme análise das descrições e da compatibilidade do objeto.`);
    if (!descartados.length) L.push("Não houve desconsideração de preços: todos os valores coletados integram a série utilizada.");
    if (porUnidade.length > 1) L.push(`A série reúne ${porUnidade.length} unidades de medida distintas, calculadas separadamente por não serem comparáveis entre si; o valor estimado da contratação foi expresso na unidade "${unidadeRef}", que é a do objeto a ser contratado.`);
    const comGrafias = porUnidade.filter((u) => u.grafias.length > 1);
    if (comGrafias.length) L.push(`Grafias distintas de uma mesma unidade de medida foram reunidas (${comGrafias.map((u) => `${u.unidade}: ${u.grafias.join(", ")}`).join("; ")}), por designarem a mesma medida; unidades com capacidade declarada (p. ex. "frasco 20 ml" e "frasco 50 ml") foram mantidas separadas, por não serem equivalentes.`);
    return L.join(" ");
  }, [metodo, descartados, porUnidade, unidadeRef]);

  const textoJustificativa = justificativa.trim() ? justificativa : justificativaSugerida;
  const inputCls = "w-full rounded border border-slate-300 px-2 py-1 text-[12px] outline-none focus:border-teal-500 print:border-0 print:border-b print:border-slate-400 print:px-0";

  return (
    <div className="mt-4">
      <style>{`@media print {
        body * { visibility: hidden !important; }
        .doc-imprimivel, .doc-imprimivel * { visibility: visible !important; }
        .doc-imprimivel { position: absolute; left: 0; top: 0; width: 100%; padding: 0; }
        .nao-imprimir { display: none !important; }
        .doc-imprimivel table { font-size: 8.5pt; }
        .doc-imprimivel { font-size: 10pt; color: #000; }
      }`}</style>

      <div className="nao-imprimir mb-2 flex flex-wrap items-center justify-between gap-2">
        <h4 className="flex items-center gap-1.5 font-display text-sm font-bold text-slate-800"><FileText className="h-4 w-4" /> Formulário de pesquisa de preços — IN SEGES/ME nº 65/2021, art. 3º</h4>
        <button onClick={() => window.print()} className="inline-flex items-center gap-1.5 rounded-lg bg-slate-800 px-3 py-1.5 text-[12px] font-semibold text-white">
          <Printer className="h-3.5 w-3.5" /> Imprimir / salvar em PDF
        </button>
      </div>

      <article className="doc-imprimivel rounded-xl border border-slate-300 bg-white p-5 text-slate-800">
        <header className="border-b border-slate-300 pb-3 text-center">
          <h2 className="font-display text-base font-bold uppercase tracking-wide">Documento de pesquisa de preços</h2>
          <p className="text-[11px] text-slate-500">Formação do preço estimado da contratação — Lei nº 14.133/2021, art. 23, e IN SEGES/ME nº 65/2021, art. 3º</p>
        </header>

        <section className="mt-3 grid gap-2 sm:grid-cols-2">
          <label className="text-[11px]"><span className="font-semibold text-slate-600">Órgão / entidade</span>
            <input value={orgao} onChange={(e) => setOrgao(e.target.value)} className={inputCls} placeholder="Prefeitura Municipal de…" /></label>
          <label className="text-[11px]"><span className="font-semibold text-slate-600">Setor requisitante</span>
            <input value={setor} onChange={(e) => setSetor(e.target.value)} className={inputCls} placeholder="Secretaria de…" /></label>
          <label className="text-[11px]"><span className="font-semibold text-slate-600">Processo administrativo nº</span>
            <input value={processo} onChange={(e) => setProcesso(e.target.value)} className={inputCls} placeholder="000/2026" /></label>
          <label className="text-[11px]"><span className="font-semibold text-slate-600">Data da pesquisa</span>
            <input value={hoje()} readOnly className={inputCls + " bg-slate-50"} /></label>
          <label className="text-[11px]"><span className="font-semibold text-slate-600">Objeto</span>
            <input value={objeto} onChange={(e) => setObjeto(e.target.value)} className={inputCls} /></label>
          <label className="text-[11px]"><span className="font-semibold text-slate-600">Unidade de medida do objeto</span>
            {porUnidade.length > 1 ? (
              <select value={unidadeRef} onChange={(e) => setUnidadeRef(e.target.value)} className={inputCls + " nao-imprimir"}>
                {porUnidade.map((u) => <option key={u.unidade} value={u.unidade}>{u.unidade || "(não informada)"} — {u.n} preço(s)</option>)}
              </select>
            ) : null}
            <span className={porUnidade.length > 1 ? "mt-0.5 hidden text-[12px] print:block" : "block text-[12px]"}>{unidadeEscolhida?.unidade || "—"}</span>
          </label>
        </section>

        {/* ─── I ─── */}
        <h3 className="mt-4 border-b border-slate-200 pb-1 text-[12px] font-bold uppercase tracking-wide text-slate-700">I — Identificação do agente responsável pela cotação</h3>
        <div className="mt-2 grid gap-2 sm:grid-cols-3">
          <label className="text-[11px]"><span className="font-semibold text-slate-600">Nome</span>
            <input value={agente} onChange={(e) => setAgente(e.target.value)} className={inputCls} /></label>
          <label className="text-[11px]"><span className="font-semibold text-slate-600">Cargo / função</span>
            <input value={cargo} onChange={(e) => setCargo(e.target.value)} className={inputCls} /></label>
          <label className="text-[11px]"><span className="font-semibold text-slate-600">Matrícula</span>
            <input value={matricula} onChange={(e) => setMatricula(e.target.value)} className={inputCls} /></label>
        </div>

        {/* ─── II ─── */}
        <h3 className="mt-4 border-b border-slate-200 pb-1 text-[12px] font-bold uppercase tracking-wide text-slate-700">II — Caracterização das fontes consultadas</h3>
        <ul className="mt-2 space-y-1 text-[11px] leading-relaxed">
          <li><b>Parâmetro adotado:</b> art. 5º, inciso II, da IN SEGES/ME nº 65/2021 — contratações similares realizadas por outros entes públicos, em execução ou concluídas nos 1 (um) ano anterior à data da pesquisa, conforme série apresentada na seção III.</li>
          <li><b>Fonte:</b> Portal Nacional de Contratações Públicas (PNCP), dados abertos — itens homologados das contratações publicadas pelos próprios órgãos contratantes. Trata-se de <b>preço efetivamente praticado</b>, e não de preço estimado ou de proposta.</li>
          <li><b>Identificação do objeto no catálogo:</b> {identificacao ? `${identificacao.taxonomia} nº ${identificacao.codigo} — ${identificacao.nome}${identificacao.classe ? ` (classe ${identificacao.classe})` : ""}` : "objeto sem correspondência em catálogo padronizado; a pesquisa apoia-se na descrição textual das contratações reunidas"}</li>
          <li><b>Abrangência da série:</b> {itens.length} contratação(ões) utilizada(s), de {new Set(itens.map((i) => i.municipio)).size} município(s){descartados.length ? `; ${descartados.length} preço(s) coletado(s) e desconsiderado(s), com justificativa na seção V` : ""}.</li>
          <li><b>Rastreabilidade:</b> cada preço da seção III é identificado pelo número de controle PNCP da contratação de origem, permitindo verificação direta na fonte.</li>
          <li><b>Termo de busca utilizado:</b> “{termo}” · <b>data da extração:</b> {hoje()}.</li>
        </ul>

        {/* ─── III ─── */}
        <h3 className="mt-4 border-b border-slate-200 pb-1 text-[12px] font-bold uppercase tracking-wide text-slate-700">III — Série de preços coletados</h3>
        <div className="mt-2 overflow-x-auto">
          <table className="w-full text-left text-[10px]">
            <thead className="bg-slate-50 text-slate-600">
              <tr>
                <th className="border border-slate-200 p-1">#</th>
                <th className="border border-slate-200 p-1">Nº controle PNCP</th>
                <th className="border border-slate-200 p-1">Município / órgão</th>
                <th className="border border-slate-200 p-1">Data</th>
                <th className="border border-slate-200 p-1">Descrição do item</th>
                <th className="border border-slate-200 p-1">Un.</th>
                <th className="border border-slate-200 p-1 text-right">Qtd.</th>
                <th className="border border-slate-200 p-1 text-right">Valor unitário</th>
              </tr>
            </thead>
            <tbody>
              {itens.map((i, k) => (
                <tr key={i.id}>
                  <td className="border border-slate-200 p-1 tabular-nums">{k + 1}</td>
                  <td className="border border-slate-200 p-1 font-mono">{i.numeroControlePNCP}{i.controlePublicado ? "" : " *"}</td>
                  <td className="border border-slate-200 p-1">{i.municipio}{i.orgao ? ` — ${i.orgao}` : ""}</td>
                  <td className="border border-slate-200 p-1 whitespace-nowrap tabular-nums">{dt(i.dataPublicacao)}</td>
                  <td className="border border-slate-200 p-1">{i.descricao}</td>
                  <td className="border border-slate-200 p-1">{i.unidade}</td>
                  <td className="border border-slate-200 p-1 text-right tabular-nums">{i.quantidade.toLocaleString("pt-BR")}</td>
                  <td className="border border-slate-200 p-1 text-right tabular-nums font-semibold">{brlAuto(i.unitario)}</td>
                </tr>
              ))}
              {descartados.map((i, k) => (
                <tr key={"d" + i.id} className="text-slate-400 line-through">
                  <td className="border border-slate-200 p-1 tabular-nums">D{k + 1}</td>
                  <td className="border border-slate-200 p-1 font-mono">{i.numeroControlePNCP}{i.controlePublicado ? "" : " *"}</td>
                  <td className="border border-slate-200 p-1">{i.municipio}</td>
                  <td className="border border-slate-200 p-1 whitespace-nowrap tabular-nums">{dt(i.dataPublicacao)}</td>
                  <td className="border border-slate-200 p-1">{i.descricao}</td>
                  <td className="border border-slate-200 p-1">{i.unidade}</td>
                  <td className="border border-slate-200 p-1 text-right tabular-nums">{i.quantidade.toLocaleString("pt-BR")}</td>
                  <td className="border border-slate-200 p-1 text-right tabular-nums">{brlAuto(i.unitario)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-1 text-[9px] text-slate-500">Linhas riscadas e prefixadas por <b>D</b> = preços coletados e <b>desconsiderados</b>, mantidos no documento para que a exclusão seja auditável (a justificativa está na seção V). <b>*</b> = número de controle reconstruído a partir de CNPJ, sequencial e ano, por não ter sido publicado pelo órgão de origem.</p>

        {/* ─── IV ─── */}
        <h3 className="mt-4 border-b border-slate-200 pb-1 text-[12px] font-bold uppercase tracking-wide text-slate-700">IV — Método matemático aplicado</h3>
        <div className="nao-imprimir mt-2 flex flex-wrap gap-3 text-[11px]">
          {(["mediana", "media", "menor"] as Metodo[]).map((m) => (
            <label key={m} className="flex cursor-pointer items-center gap-1.5">
              <input type="radio" name="metodo" checked={metodo === m} onChange={() => setMetodo(m)} className="h-3.5 w-3.5 accent-teal-600" />
              <span className={metodo === m ? "font-semibold text-teal-700" : "text-slate-600"}>{ROTULO[m]}</span>
            </label>
          ))}
          <span className="text-slate-400">— art. 6º da IN 65/2021 admite os três; informe a quantidade a contratar para obter o valor estimado.</span>
        </div>
        <p className="mt-2 text-[11px]">Método adotado: <b>{ROTULO[metodo]} dos preços coletados</b>, apurado separadamente por unidade de medida.</p>
        <div className="mt-2 overflow-x-auto">
          <table className="w-full text-left text-[10px]">
            <thead className="bg-slate-50 text-slate-600">
              <tr>
                <th className="border border-slate-200 p-1">Unidade</th>
                <th className="border border-slate-200 p-1 text-right">Preços</th>
                <th className="border border-slate-200 p-1 text-right">Menor</th>
                <th className="border border-slate-200 p-1 text-right">Média</th>
                <th className="border border-slate-200 p-1 text-right">Mediana</th>
                <th className="border border-slate-200 p-1 text-right">Maior</th>
                <th className="border border-slate-200 p-1 text-right">Valor unitário estimado</th>
                <th className="border border-slate-200 p-1 text-right">Qtd. a contratar</th>
                <th className="border border-slate-200 p-1 text-right">Valor total estimado</th>
              </tr>
            </thead>
            <tbody>
              {porUnidade.map((u) => {
                const q = Number(String(quantidades[u.unidade] ?? "").replace(/\./g, "").replace(",", ".")) || 0;
                return (
                  <tr key={u.unidade}>
                    <td className={"border border-slate-200 p-1" + (u.unidade === unidadeEscolhida?.unidade ? " bg-teal-50/60 font-bold" : "")}>
                      {u.unidade || "(não informada)"}
                      {u.unidade === unidadeEscolhida?.unidade && <span className="ml-1 rounded bg-teal-600 px-1 text-[8px] font-bold uppercase text-white">objeto</span>}
                      {u.grafias.length > 1 && <span className="block text-[8px] font-normal text-slate-400">grafias reunidas: {u.grafias.join(" · ")}</span>}
                    </td>
                    <td className="border border-slate-200 p-1 text-right tabular-nums">{u.n}</td>
                    <td className="border border-slate-200 p-1 text-right tabular-nums">{brlAuto(u.menor)}</td>
                    <td className={"border border-slate-200 p-1 text-right tabular-nums" + (metodo === "media" ? " font-bold" : "")}>{brlAuto(u.media)}</td>
                    <td className={"border border-slate-200 p-1 text-right tabular-nums" + (metodo === "mediana" ? " font-bold" : "")}>{brlAuto(u.mediana)}</td>
                    <td className="border border-slate-200 p-1 text-right tabular-nums">{brlAuto(u.maior)}</td>
                    <td className="border border-slate-200 bg-teal-50/60 p-1 text-right font-bold tabular-nums text-teal-800">{brlAuto(valorDe(u))}</td>
                    <td className="border border-slate-200 p-1 text-right">
                      <input value={quantidades[u.unidade] ?? ""} onChange={(e) => setQuantidades({ ...quantidades, [u.unidade]: e.target.value })}
                        className="w-20 rounded border border-slate-300 px-1 py-0.5 text-right text-[10px] outline-none focus:border-teal-500 print:border-0" placeholder="0" />
                    </td>
                    <td className="border border-slate-200 p-1 text-right font-bold tabular-nums">{q > 0 ? brl(valorDe(u) * q) : "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {unidadeEscolhida && (() => {
          const q = Number(String(quantidades[unidadeEscolhida.unidade] ?? "").replace(/\./g, "").replace(",", ".")) || 0;
          const vu = valorDe(unidadeEscolhida);
          return (
            <p className="mt-2 rounded border border-teal-200 bg-teal-50/60 p-2 text-[11px] leading-relaxed">
              <b>Valor estimado da contratação:</b> {brlAuto(vu)} por <b>{unidadeEscolhida.unidade || "unidade não informada"}</b>
              {q > 0 ? <> × {q.toLocaleString("pt-BR")} {unidadeEscolhida.unidade} = <b>{brl(vu * q)}</b></> : <> (informe a quantidade a contratar para o total)</>},
              apurado pela {ROTULO[metodo]} de {unidadeEscolhida.n} preço(s) praticado(s) em {unidadeEscolhida.nMunicipios} município(s).
            </p>
          );
        })()}
        <p className="mt-1 text-[9px] text-slate-500">Menor, média, mediana e maior são apresentados juntos porque o art. 6º da IN SEGES/ME nº 65/2021 admite os três primeiros como método; a escolha é do responsável e fica registrada acima. Unidades de medida distintas não são somadas entre si.</p>

        {/* ─── V ─── */}
        <h3 className="mt-4 border-b border-slate-200 pb-1 text-[12px] font-bold uppercase tracking-wide text-slate-700">V — Justificativas da metodologia e das desconsiderações</h3>
        <textarea value={justificativa} onChange={(e) => setJustificativa(e.target.value)} rows={5}
          placeholder={justificativaSugerida}
          className="nao-imprimir mt-2 w-full rounded border border-slate-300 p-2 text-[11px] leading-relaxed outline-none focus:border-teal-500" />
        <p className="mt-2 hidden whitespace-pre-wrap text-[11px] leading-relaxed print:block">{textoJustificativa}</p>
        <p className="nao-imprimir mt-1 text-[9px] text-slate-500">Em branco, o documento imprime a justificativa sugerida acima, montada a partir do que a apuração encontrou. Edite livremente: a responsabilidade pela justificativa é de quem assina.</p>

        {alertas.length > 0 && (
          <>
            <h3 className="mt-4 border-b border-slate-200 pb-1 text-[12px] font-bold uppercase tracking-wide text-slate-700">VI — Ressalvas sobre a suficiência da pesquisa</h3>
            <ul className="mt-2 list-inside list-disc space-y-0.5 text-[11px] leading-relaxed">
              {alertas.map((a, i) => <li key={i}>{a}</li>)}
            </ul>
          </>
        )}

        <div className="mt-8 text-center text-[11px]">
          <div className="mx-auto w-72 border-t border-slate-500 pt-1">
            {agente || "________________________________"}<br />
            <span className="text-slate-500">{[cargo, matricula ? `matrícula ${matricula}` : ""].filter(Boolean).join(" · ") || "cargo / matrícula"}</span>
          </div>
          <p className="mt-2 text-slate-500">{orgao || "________________"}, {hoje()}.</p>
        </div>
      </article>
    </div>
  );
}
