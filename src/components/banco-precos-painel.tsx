"use client";
// ═══ BANCO DE PREÇOS — a tela (02/set/2026) ═══
// Três passos, na ordem em que a decisão acontece:
//   1. BUSCAR o objeto  → varre TODAS as descrições compradas (770.809), não só as que têm código de catálogo
//   2. ESCOLHER as contratações que entram na conta  → é aqui que mora o "critério fundamentado nos autos"
//   3. DOCUMENTO  → mediana, quartis, metodologia, ressalvas e rastreabilidade por número de controle PNCP
//
// A tela NÃO decide sozinha. Ela marca o que o IQR descartaria (art. 6º da IN SEGES/ME 65/2021) e deixa a
// exclusão com quem assina — porque o que torna a pesquisa defensável não é a mediana, é a justificativa.
// E NÃO INDICA MARCA: o art. 41 da Lei 14.133 veda direcionamento.
import { useCallback, useEffect, useRef, useState } from "react";
import { Search, Database, FileText, Check, AlertTriangle, Loader2, Copy, ChevronRight } from "lucide-react";
import FormularioPrecoReferencia from "@/components/formulario-preco-referencia";
// A nota técnica do CATMAT vinha do protótipo que esta tela substitui. Ela explica COMO a descrição crua é
// casada ao catálogo — que é a pergunta que um auditor faz primeiro. Migrou para cá em 03/set/2026 para não
// morrer junto com o protótipo.
import { NotaTecnicaCatmat } from "@/components/nota-tecnica-catmat";
// O carrinho de orçamento (03/set/2026) — aqui o "preço unitário" que entra é a MEDIANA das contratações
// SELECIONADAS por unidade (doc.porUnidade), não a de um objeto cru: é o único número que já passou pela
// curadoria humana que dá título ao Banco de Preços, e é o mesmo padrão de confiança do SINAPI/SICRO/SIE-SC.
import { AdicionarQtd, type NovoItemOrcamento } from "@/components/orcamento-obra";

type Objeto = {
  chave: string; unidade: string; nItens: number; nProcessos: number; nMunicipios: number;
  mediana: number; p25: number; p75: number; menor: number; maior: number;
  primeira: string | null; ultima: string | null;
  taxonomia: string | null; codigo: string | null; nomeCatalogo: string | null; sim: number;
};
type Candidato = {
  id: string; numeroControlePNCP: string; controlePublicado: boolean; municipio: string; orgao: string;
  modalidade: string; modoDisputa: string; srp: boolean; dataPublicacao: string | null;
  descricao: string; unidade: string; quantidade: number; unitario: number; fornecedor: string; foraDaCurva: boolean;
};
type Identificacao = { taxonomia: string; codigo: string; nome: string; classe: string | null; exata: boolean; deterministica: boolean; sim: number | null } | null;
type Documento = {
  identificacao: Identificacao;
  porUnidade: { unidade: string; grafias: string[]; n: number; media: number; mediana: number; p25: number; p75: number; menor: number; maior: number; nMunicipios: number; nForaDaCurva: number }[];
  itens: Candidato[]; metodologia: string[]; alertas: string[];
};

const brl = (v: number) => "R$ " + (v ?? 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: v < 1 ? 4 : 2 });
const dt = (s: string | null) => (s ? s.slice(8, 10) + "/" + s.slice(5, 7) + "/" + s.slice(0, 4) : "—");
const nfmt = (n: number) => n.toLocaleString("pt-BR");

export default function BancoPrecosPainel({ nome, onAdicionar }: { nome?: string; onAdicionar?: (item: NovoItemOrcamento, quantidade: number) => void }) {
  const [q, setQ] = useState("");
  const [objetos, setObjetos] = useState<Objeto[]>([]);
  // De qual termo é a lista que está na tela. Sem isto, entre a tecla e a resposta (0,3–1,8 s) a tela mostra
  // o resultado do termo ANTERIOR como se fosse a resposta — e dá para clicar "Ver as contratações" e gerar
  // documento do objeto errado. Num documento que vai aos autos, isso não é atraso: é resposta errada.
  const [termoDoResultado, setTermoDoResultado] = useState("");
  const [total, setTotal] = useState(0);
  const [marcados, setMarcados] = useState<Set<string>>(new Set());
  const [candidatos, setCandidatos] = useState<Candidato[]>([]);
  const [identificacao, setIdentificacao] = useState<Identificacao>(null);
  const [escolhidos, setEscolhidos] = useState<Set<string>>(new Set());
  const [doc, setDoc] = useState<Documento | null>(null);
  const [carregando, setCarregando] = useState<"" | "busca" | "candidatos" | "documento">("");
  const [erro, setErro] = useState("");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const termoRef = useRef("");

  // ─── passo 1: busca (debounce). Zera o que vem depois: seleção de outro objeto não pode sobreviver.
  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    const termo = q.trim();
    // Todo setState vive DENTRO do timeout, inclusive o de limpar: chamar setState no corpo do efeito
    // dispara renderização em cascata (react-hooks/set-state-in-effect).
    timer.current = setTimeout(async () => {
      if (termo.length < 2) { setObjetos([]); setTotal(0); setTermoDoResultado(""); setCandidatos([]); setEscolhidos(new Set()); setDoc(null); return; }
      setCarregando("busca"); setErro("");
      try {
        const r = await fetch("/api/candidatos-preco/" + encodeURIComponent(termo));
        const j = await r.json();
        if (j.erro) throw new Error(j.erro);
        termoRef.current = termo;
        setObjetos(j.objetos || []); setTotal(j.total || 0); setTermoDoResultado(termo);
        // ═══ O PADRÃO É ADERÊNCIA, NÃO VOLUME ═══
        // A primeira versão pré-marcava os objetos de maior lastro até somar ~120 compras. Medido com
        // "papel a4": isso arrastava OUTSOURCING DE IMPRESSÃO (cobrado por página) para dentro de uma
        // busca de papel, e o documento saía com "por página, faixa R$ 0,01–R$ 425,00" — um número que
        // não descreve objeto nenhum. Volume não é pertinência.
        // Agora o padrão é o objeto de melhor aderência ao termo e os que dividem com ele o MESMO código
        // de catálogo — que é justamente o que o eixo serve para dizer: estas grafias são a mesma coisa.
        // Sem código, marca só o primeiro. O resto continua na lista, a um clique.
        const lista = (j.objetos || []) as Objeto[];
        const cabeca = lista[0];
        const pre = new Set<string>();
        if (cabeca) {
          pre.add(cabeca.chave);
          if (cabeca.taxonomia && cabeca.codigo) {
            for (const o of lista) {
              if (pre.size >= 25) break;
              if (o.taxonomia === cabeca.taxonomia && o.codigo === cabeca.codigo) pre.add(o.chave);
            }
          }
        }
        setMarcados(pre);
      } catch (e) { setErro(String((e as Error).message || e)); setObjetos([]); }
      setCandidatos([]); setEscolhidos(new Set()); setDoc(null);
      setCarregando("");
    }, 400);
  }, [q]);

  const verContratacoes = useCallback(async () => {
    if (!marcados.size) return;
    setCarregando("candidatos"); setErro(""); setDoc(null);
    try {
      const r = await fetch("/api/candidatos-preco/" + encodeURIComponent(termoRef.current || q.trim()), {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chaves: [...marcados] }),
      });
      const j = await r.json();
      if (j.erro) throw new Error(j.erro);
      const cs: Candidato[] = j.candidatos || [];
      setCandidatos(cs); setIdentificacao(j.identificacao || null);
      // Padrão: entra tudo, MENOS o que a cerca do IQR marcou e menos ata de registro de preço (preço de
      // ata não é preço praticado). É só um ponto de partida — as duas exclusões estão à vista e são
      // reversíveis com um clique, que é o oposto de descartar em silêncio.
      setEscolhidos(new Set(cs.filter((c) => !c.foraDaCurva && !c.srp).map((c) => c.id)));
    } catch (e) { setErro(String((e as Error).message || e)); setCandidatos([]); }
    setCarregando("");
  }, [marcados, q]);

  const gerarDocumento = useCallback(async () => {
    if (!escolhidos.size) return;
    setCarregando("documento"); setErro("");
    try {
      const r = await fetch("/api/candidatos-preco/" + encodeURIComponent(termoRef.current || q.trim()), {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chaves: [...marcados], selecao: [...escolhidos] }),
      });
      const j = await r.json();
      if (j.erro) throw new Error(j.erro);
      setDoc(j);
    } catch (e) { setErro(String((e as Error).message || e)); }
    setCarregando("");
  }, [escolhidos, marcados, q]);

  const alterna = (set: Set<string>, aplica: (s: Set<string>) => void) => (k: string) => {
    const n = new Set(set); if (n.has(k)) n.delete(k); else n.add(k); aplica(n);
  };

  const copiar = () => {
    if (!doc) return;
    const L: string[] = [];
    L.push(`DOCUMENTO DE FORMAÇÃO DO PREÇO DE REFERÊNCIA${nome ? ` — ${nome}` : ""}`);
    L.push(`Objeto pesquisado: ${q.trim()}`);
    if (doc.identificacao) L.push(`Identificação: ${doc.identificacao.taxonomia} ${doc.identificacao.codigo} — ${doc.identificacao.nome}`);
    L.push("");
    L.push("PREÇO DE REFERÊNCIA");
    for (const u of doc.porUnidade) L.push(`  ${u.unidade || "(sem unidade)"}: mediana ${brl(u.mediana)} · P25 ${brl(u.p25)} · P75 ${brl(u.p75)} · ${u.n} contratações · ${u.nMunicipios} municípios`);
    L.push("");
    L.push("METODOLOGIA");
    doc.metodologia.forEach((m) => L.push("  - " + m));
    L.push("");
    L.push("RESSALVAS");
    doc.alertas.forEach((a) => L.push("  - " + a));
    L.push("");
    L.push("CONTRATAÇÕES UTILIZADAS (rastreabilidade)");
    doc.itens.forEach((i) => L.push(`  ${i.numeroControlePNCP}${i.controlePublicado ? "" : " (nº reconstruído)"} · ${dt(i.dataPublicacao)} · ${i.municipio} · ${i.unidade} · ${brl(i.unitario)} · ${i.descricao}`));
    navigator.clipboard?.writeText(L.join("\n"));
  };

  // A lista na tela vale para o texto que está no campo? Se não, ela não é resposta — é rastro.
  const emDia = objetos.length > 0 && termoDoResultado === q.trim();
  const nFora = candidatos.filter((c) => c.foraDaCurva).length;
  const nSrp = candidatos.filter((c) => c.srp).length;

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="flex items-center gap-1.5 font-display text-base font-bold text-teal-700"><Database className="h-4 w-4" /> Banco de Preços</h3>
        <span className="rounded-full bg-teal-50 px-2 py-0.5 text-[10px] font-semibold text-teal-700">todos os processos licitatórios da base</span>
      </div>
      <p className="mt-1 text-[12px] leading-relaxed text-slate-600">
        Busque o material ou serviço, <b>escolha quais contratações entram na conta</b> e gere o documento de formação do
        preço de referência — com mediana, quartis, metodologia, ressalvas e o número de controle PNCP de cada preço.
        A busca corre <b>toda descrição comprada</b>, tenha ela código de catálogo ou não.
      </p>

      {/* ─── passo 1 ─── */}
      <div className="mt-3 flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 focus-within:border-teal-500">
        <Search className="h-4 w-4 shrink-0 text-slate-400" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Descreva o item: papel A4, dipirona, roçadeira, pneu 275/80…"
          className="w-full bg-transparent text-sm outline-none" />
        {carregando === "busca" && <Loader2 className="h-4 w-4 shrink-0 animate-spin text-teal-500" />}
      </div>
      {erro && <p className="mt-2 flex items-start gap-1.5 rounded-lg bg-rose-50 p-2 text-[12px] text-rose-700"><AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />{erro}</p>}

      {!emDia && q.trim().length >= 2 && !erro && (
        <p className="mt-3 flex items-center gap-1.5 text-[12px] text-slate-400"><Loader2 className="h-3.5 w-3.5 animate-spin" />procurando “{q.trim()}” em todas as descrições compradas…</p>
      )}
      {emDia && (
        <div className="mt-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              1. O que existe na base <span className="ml-1 font-normal normal-case tracking-normal text-slate-400">
                {nfmt(total)} descrição(ões) com esse texto{total > objetos.length ? ` · exibindo as ${objetos.length} de maior lastro` : ""}</span>
            </p>
            <button onClick={() => setMarcados(marcados.size === objetos.length ? new Set() : new Set(objetos.map((o) => o.chave)))}
              className="text-[11px] font-semibold text-teal-700 hover:underline">
              {marcados.size === objetos.length ? "desmarcar todos" : "marcar todos"}
            </button>
          </div>
          <div className="mt-1.5 max-h-72 space-y-1 overflow-y-auto rounded-lg border border-slate-100 p-1">
            {objetos.map((o) => (
              <label key={o.chave} className={`flex cursor-pointer items-start gap-2 rounded-md p-1.5 text-left hover:bg-slate-50 ${marcados.has(o.chave) ? "bg-teal-50/60" : ""}`}>
                <input type="checkbox" checked={marcados.has(o.chave)} onChange={() => alterna(marcados, setMarcados)(o.chave)}
                  className="mt-0.5 h-3.5 w-3.5 shrink-0 accent-teal-600" />
                <span className="min-w-0 flex-1">
                  <span className="block text-[12px] leading-snug text-slate-700">{o.chave}</span>
                  <span className="mt-0.5 block text-[10px] text-slate-400">
                    {nfmt(o.nItens)} compra(s) · {o.nMunicipios} município(s) · {o.unidade || "sem unidade"}
                    {o.primeira && o.ultima ? ` · ${o.primeira.slice(0, 4)}–${o.ultima.slice(0, 4)}` : ""}
                    {o.taxonomia ? <span className="ml-1 rounded bg-slate-100 px-1 font-semibold text-slate-500">{o.taxonomia} {o.codigo}</span>
                      : <span className="ml-1 rounded bg-amber-50 px-1 font-semibold text-amber-600">sem código de catálogo</span>}
                  </span>
                </span>
                <span className="shrink-0 text-right">
                  <span className="block font-display text-sm font-bold tabular-nums text-teal-700">{brl(o.mediana)}</span>
                  <span className="block text-[10px] text-slate-400">{brl(o.menor)}–{brl(o.maior)}</span>
                </span>
              </label>
            ))}
          </div>
          <button onClick={verContratacoes} disabled={!marcados.size || carregando === "candidatos"}
            className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-teal-600 px-3 py-1.5 text-[12px] font-semibold text-white disabled:opacity-40">
            {carregando === "candidatos" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ChevronRight className="h-3.5 w-3.5" />}
            Ver as contratações ({marcados.size} objeto{marcados.size === 1 ? "" : "s"})
          </button>
        </div>
      )}
      {q.trim().length >= 2 && !objetos.length && termoDoResultado === q.trim() && carregando !== "busca" && !erro && (
        <p className="mt-3 text-[12px] text-slate-400">Nenhuma compra com “{q.trim()}” nos {nfmt(255294)} processos da base. Tente uma palavra mais curta ou outro sinônimo.</p>
      )}

      {/* ─── passo 2 ─── */}
      {emDia && !!candidatos.length && (
        <div className="mt-4 border-t border-slate-100 pt-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              2. Quais entram na conta <span className="ml-1 font-normal normal-case tracking-normal text-slate-400">{escolhidos.size} de {candidatos.length} marcadas</span>
            </p>
            <div className="flex flex-wrap gap-2 text-[11px] font-semibold text-teal-700">
              <button onClick={() => setEscolhidos(new Set(candidatos.map((c) => c.id)))} className="hover:underline">marcar todas</button>
              <button onClick={() => setEscolhidos(new Set())} className="hover:underline">limpar</button>
              {!!nFora && <button onClick={() => setEscolhidos(new Set([...escolhidos].filter((id) => !candidatos.find((c) => c.id === id)?.foraDaCurva)))} className="hover:underline">tirar fora da curva ({nFora})</button>}
              {!!nSrp && <button onClick={() => setEscolhidos(new Set([...escolhidos].filter((id) => !candidatos.find((c) => c.id === id)?.srp)))} className="hover:underline">tirar SRP ({nSrp})</button>}
            </div>
          </div>
          <p className="mt-1 text-[11px] text-slate-500">
            Já vêm marcadas as contratações que servem de referência por padrão. Ficam <b>de fora</b>, à vista e reversíveis
            num clique, o que a cerca do IQR aponta como atípico e o que é <b>registro de preço</b> — porque preço de ata é
            preço máximo aceito, não preço praticado. Quem decide é você; a justificativa é que vai aos autos.
          </p>
          {identificacao && (
            <p className="mt-1 text-[11px] text-slate-500">Identificado como <b className="text-slate-700">{identificacao.taxonomia} {identificacao.codigo}</b> — {identificacao.nome}</p>
          )}
          <div className="mt-1.5 max-h-96 overflow-auto rounded-lg border border-slate-100">
            <table className="w-full text-left text-[11px]">
              <thead className="sticky top-0 bg-slate-50 text-[10px] uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="w-6 p-1.5"></th>
                  <th className="p-1.5">Data</th><th className="p-1.5">Município</th><th className="p-1.5">Descrição</th>
                  <th className="p-1.5">Un.</th><th className="p-1.5 text-right">Qtd.</th><th className="p-1.5 text-right">Unitário</th>
                  <th className="p-1.5">Modalidade</th><th className="p-1.5">Controle PNCP</th>
                </tr>
              </thead>
              <tbody>
                {candidatos.map((c) => (
                  <tr key={c.id} className={`border-t border-slate-100 ${escolhidos.has(c.id) ? "bg-teal-50/40" : "opacity-60"}`}>
                    <td className="p-1.5 align-top"><input type="checkbox" checked={escolhidos.has(c.id)} onChange={() => alterna(escolhidos, setEscolhidos)(c.id)} className="h-3.5 w-3.5 accent-teal-600" /></td>
                    <td className="whitespace-nowrap p-1.5 align-top tabular-nums text-slate-500">{dt(c.dataPublicacao)}</td>
                    <td className="p-1.5 align-top text-slate-600">{c.municipio || "—"}</td>
                    <td className="max-w-[22rem] p-1.5 align-top text-slate-700">{c.descricao}
                      {c.fornecedor && <span className="block text-[10px] text-slate-400">fornecedor: {c.fornecedor}</span>}</td>
                    <td className="p-1.5 align-top text-slate-500">{c.unidade}</td>
                    <td className="p-1.5 text-right align-top tabular-nums text-slate-500">{nfmt(c.quantidade)}</td>
                    <td className="whitespace-nowrap p-1.5 text-right align-top font-semibold tabular-nums text-teal-700">{brl(c.unitario)}
                      {c.foraDaCurva && <span className="ml-1 rounded bg-amber-100 px-1 text-[9px] font-bold text-amber-700" title="fora do intervalo interquartil (1,5×IQR) do conjunto">fora da curva</span>}</td>
                    <td className="p-1.5 align-top text-slate-500">{c.modalidade || "—"}
                      {c.srp && <span className="ml-1 rounded bg-indigo-100 px-1 text-[9px] font-bold text-indigo-700" title="registro de preço: preço de ata não é preço praticado">SRP</span>}</td>
                    <td className="whitespace-nowrap p-1.5 align-top font-mono text-[10px] text-slate-400" title={c.controlePublicado ? "número publicado pelo órgão" : "número reconstruído a partir de CNPJ, sequencial e ano"}>
                      {c.numeroControlePNCP}{c.controlePublicado ? "" : " *"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button onClick={gerarDocumento} disabled={!escolhidos.size || carregando === "documento"}
            className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-slate-800 px-3 py-1.5 text-[12px] font-semibold text-white disabled:opacity-40">
            {carregando === "documento" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileText className="h-3.5 w-3.5" />}
            Gerar documento com {escolhidos.size} contratação(ões)
          </button>
        </div>
      )}

      {/* ─── passo 3 ─── */}
      {emDia && doc && (
        <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50/60 p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h4 className="font-display text-sm font-bold text-slate-800">Documento de formação do preço de referência</h4>
            <button onClick={copiar} className="inline-flex items-center gap-1 text-[11px] font-semibold text-teal-700 hover:underline"><Copy className="h-3 w-3" /> copiar</button>
          </div>
          {doc.identificacao
            ? <p className="mt-1 text-[11px] text-slate-500">Objeto: <b className="text-slate-700">{doc.identificacao.taxonomia} {doc.identificacao.codigo}</b> — {doc.identificacao.nome}</p>
            : <p className="mt-1 text-[11px] text-amber-700">Objeto sem código de catálogo — identificado pela própria descrição das contratações.</p>}

          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            {doc.porUnidade.map((u) => (
              <div key={u.unidade} className="rounded-lg border border-slate-200 bg-white p-2.5">
                <div className="text-[10px] uppercase tracking-wide text-slate-400">preço de referência · por {u.unidade || "unidade não informada"}</div>
                <div className="font-display text-xl font-bold tabular-nums text-teal-700">{brl(u.mediana)}</div>
                <div className="text-[11px] text-slate-500">P25 {brl(u.p25)} · P75 {brl(u.p75)} · faixa {brl(u.menor)}–{brl(u.maior)}</div>
                <div className="text-[10px] text-slate-400">{u.n} contratação(ões) · {u.nMunicipios} município(s){u.nForaDaCurva ? ` · ${u.nForaDaCurva} fora da curva mantida(s)` : ""}</div>
                {u.grafias.length > 1 && <div className="mt-0.5 text-[9px] text-slate-400" title="grafias diferentes da mesma unidade, reunidas">grafias reunidas: {u.grafias.join(" · ")}</div>}
                {onAdicionar && (
                  <div className="mt-2 flex items-center justify-between border-t border-slate-100 pt-2">
                    <span className="text-[10px] text-slate-400">somar ao orçamento (mediana × qtd.)</span>
                    <AdicionarQtd onAdd={(qtd) => onAdicionar({
                      fonte: "PNCP", codigo: `${q.trim()}__${u.unidade}`,
                      descricao: (doc.identificacao?.nome || q.trim()) + (u.unidade ? ` (${u.unidade})` : ""),
                      unidade: u.unidade, precoNaoDesonerado: u.mediana, precoDesonerado: null,
                    }, qtd)} />
                  </div>
                )}
              </div>
            ))}
          </div>

          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Metodologia</p>
              <ul className="mt-1 space-y-0.5">
                {doc.metodologia.map((m, i) => <li key={i} className="flex gap-1.5 text-[11px] leading-snug text-slate-600"><Check className="mt-0.5 h-3 w-3 shrink-0 text-emerald-600" />{m}</li>)}
              </ul>
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Ressalvas</p>
              <ul className="mt-1 space-y-0.5">
                {doc.alertas.map((a, i) => <li key={i} className="flex gap-1.5 text-[11px] leading-snug text-slate-600"><AlertTriangle className="mt-0.5 h-3 w-3 shrink-0 text-amber-500" />{a}</li>)}
              </ul>
            </div>
          </div>
          <p className="mt-3 text-[10px] leading-relaxed text-slate-400">
            Preço de referência = <b>mediana</b> das contratações selecionadas, por unidade de medida, conforme a IN SEGES/ME 65/2021.
            A curadoria de valores atípicos é <b>sua</b> e deve constar dos autos. O documento <b>não indica marca</b> (art. 41 da Lei 14.133/2021).
            Números de controle marcados com <b>*</b> foram reconstruídos a partir de CNPJ, sequencial e ano porque o órgão não os publicou.
          </p>

          {/* O formulário do art. 3º da IN 65/2021 — o que de fato vai aos autos. O resumo acima é leitura
              rápida; o documento é este, com as cinco seções que a norma enumera. */}
          <FormularioPrecoReferencia
            termo={q.trim()}
            identificacao={doc.identificacao}
            porUnidade={doc.porUnidade}
            itens={doc.itens}
            descartados={candidatos.filter((c) => !escolhidos.has(c.id))}
            alertas={doc.alertas}
            nomeEnte={nome}
          />
        </div>
      )}
      <div className="nao-imprimir mt-4 border-t border-slate-100 pt-3">
        <NotaTecnicaCatmat compacto />
      </div>
    </section>
  );
}
