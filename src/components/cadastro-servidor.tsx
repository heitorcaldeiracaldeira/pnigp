"use client";

// Ficha cadastral do servidor para notificação — quem recebe o quê (secretaria + perfil + área), por qual canal,
// com validade (expira ao fim do mandato/nomeação) e consentimento LGPD obrigatório. Grava em notificacao_cadastro.
import { useEffect, useState, useCallback } from "react";
import { UserPlus, Trash2, ShieldCheck, AlertTriangle, Loader2 } from "lucide-react";

const SECRETARIAS = ["fazenda", "saude", "educacao", "assistencia", "compras", "previdencia", "planejamento", "obras", "agricultura", "cultura", "ambiente", "gabinete"];
const PERFIS = [{ v: "servidor", l: "Servidor (recebe alerta do tipo/área)" }, { v: "secretario", l: "Secretário (recebe o bloco da pasta)" }, { v: "prefeito", l: "Prefeito/Gabinete (recebe o consolidado)" }];
const CANAIS = [{ v: "email", l: "E-mail" }, { v: "whatsapp", l: "WhatsApp" }, { v: "sms", l: "SMS" }];
// Áreas de alerta que o servidor pode assinar (check) — mapeiam a secretaria da regra de notificação.
const AREAS_ALERTA = [
  { v: "fazenda", l: "Fiscal & Contábil (LRF, CAUC, prazos)" }, { v: "saude", l: "Saúde (SIOPS, Previne)" },
  { v: "educacao", l: "Educação (FUNDEB, IDEB)" }, { v: "assistencia", l: "Assistência (SUAS, Bolsa Família)" },
  { v: "compras", l: "Compras & Contratos (a vencer, dispensa)" }, { v: "previdencia", l: "Previdência / RPPS (CRP)" },
  { v: "planejamento", l: "Captação (emendas, programas, lacunas)" }, { v: "convenios", l: "Convênios (inadimplência)" },
  { v: "obras", l: "Obras & Infraestrutura" }, { v: "agricultura", l: "Agricultura / rural" },
  { v: "cultura", l: "Cultura" }, { v: "ambiente", l: "Meio ambiente" }, { v: "gabinete", l: "Governança / controle" },
];

type Servidor = { id: number; nome: string; cargo: string; secretaria: string; perfil: string; areas: string[]; email: string; celular: string; canal_pref: string; matricula: string; data_nomeacao: string; doc_nomeacao: string; validade: string; consentimento_lgpd: boolean; contato_verificado: boolean; vencido: boolean };
const VAZIO = { nome: "", cpf: "", matricula: "", cargo: "", secretaria: "fazenda", perfil: "servidor", email: "", celular: "", canal_pref: "email", data_nomeacao: "", doc_nomeacao: "", validade: "", consentimento_lgpd: false };

export function CadastroServidor({ codigo, nome }: { codigo: string; nome: string }) {
  const [lista, setLista] = useState<Servidor[]>([]);
  const [f, setF] = useState({ ...VAZIO });
  const [areas, setAreas] = useState<string[]>([]);
  const toggleArea = (v: string) => setAreas((cur) => (cur.includes(v) ? cur.filter((x) => x !== v) : [...cur, v]));
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");
  const [aberto, setAberto] = useState(false);

  const carregar = useCallback(() => {
    fetch(`/api/notificacao-cadastro?cod=${codigo}`).then((r) => r.json()).then((d) => setLista(d.servidores || [])).catch(() => {});
  }, [codigo]);
  useEffect(() => { carregar(); }, [carregar]);

  const salvar = async () => {
    setErro(""); if (!f.nome.trim()) { setErro("Informe o nome."); return; }
    if (!f.consentimento_lgpd) { setErro("O consentimento LGPD é obrigatório."); return; }
    setSalvando(true);
    const r = await fetch(`/api/notificacao-cadastro`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ cod: codigo, ...f, areas }) }).then((x) => x.json()).catch(() => ({ ok: false, erro: "rede" }));
    setSalvando(false);
    if (r.ok) { setF({ ...VAZIO }); setAreas([]); setAberto(false); carregar(); } else setErro(r.erro || "Falha ao salvar.");
  };
  const inativar = async (id: number) => { await fetch(`/api/notificacao-cadastro`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ cod: codigo, inativar: id }) }); carregar(); };
  const verificar = async (id: number) => { await fetch(`/api/notificacao-cadastro`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ cod: codigo, verificar: id }) }); carregar(); };

  const Campo = ({ k, label, tipo = "text", ph = "" }: { k: keyof typeof VAZIO; label: string; tipo?: string; ph?: string }) => (
    <label className="flex flex-col gap-0.5 text-[11px] font-medium text-slate-600">{label}
      <input type={tipo} value={String(f[k] ?? "")} placeholder={ph} onChange={(e) => setF({ ...f, [k]: e.target.value })} className="rounded-lg border border-slate-300 px-2 py-1 text-[12px] font-normal text-slate-800" />
    </label>
  );

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-1.5 font-semibold text-slate-800"><UserPlus className="h-4 w-4 text-teal-600" /> Cadastro de servidores — quem recebe os alertas de {nome}</h3>
        <button onClick={() => setAberto(!aberto)} className="rounded-lg bg-teal-600 px-3 py-1.5 text-[12px] font-semibold text-white hover:bg-teal-700">{aberto ? "Fechar" : "+ Novo servidor"}</button>
      </div>
      <p className="mt-1 text-[11px] text-slate-500">Cada servidor recebe conforme a <b>secretaria</b> (roteia) e o <b>perfil</b> (servidor/secretário/prefeito). A <b>validade</b> expira o cadastro ao fim do mandato/nomeação. Dado pessoal com <b>consentimento LGPD</b>.</p>

      {aberto && (
        <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50/50 p-3">
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            <Campo k="nome" label="Nome completo *" />
            <Campo k="cpf" label="CPF" ph="000.000.000-00" />
            <Campo k="matricula" label="Matrícula do servidor" />
            <Campo k="cargo" label="Cargo/função" />
            <label className="flex flex-col gap-0.5 text-[11px] font-medium text-slate-600">Secretaria
              <select value={f.secretaria} onChange={(e) => setF({ ...f, secretaria: e.target.value })} className="rounded-lg border border-slate-300 px-2 py-1 text-[12px] font-normal capitalize text-slate-800">{SECRETARIAS.map((s) => <option key={s} value={s}>{s}</option>)}</select>
            </label>
            <label className="flex flex-col gap-0.5 text-[11px] font-medium text-slate-600">Perfil
              <select value={f.perfil} onChange={(e) => setF({ ...f, perfil: e.target.value })} className="rounded-lg border border-slate-300 px-2 py-1 text-[12px] font-normal text-slate-800">{PERFIS.map((p) => <option key={p.v} value={p.v}>{p.l}</option>)}</select>
            </label>
            <div className="sm:col-span-2 lg:col-span-3">
              <div className="text-[11px] font-medium text-slate-600">Receber alertas de <span className="text-slate-400">(marque as áreas)</span></div>
              <div className="mt-1 grid max-h-40 grid-cols-2 gap-x-3 gap-y-1 overflow-auto rounded-lg border border-slate-200 bg-white p-2 sm:grid-cols-3">
                {AREAS_ALERTA.map((a) => (
                  <label key={a.v} className="flex cursor-pointer items-start gap-1.5 text-[11px] text-slate-700 hover:text-teal-700">
                    <input type="checkbox" checked={areas.includes(a.v)} onChange={() => toggleArea(a.v)} className="mt-0.5 accent-teal-600" />
                    <span>{a.l}</span>
                  </label>
                ))}
              </div>
              <div className="mt-0.5 text-[10px] text-slate-400">{areas.length} área(s) marcada(s). Vazio = recebe conforme a secretaria acima.</div>
            </div>
            <Campo k="email" label="E-mail" tipo="email" />
            <Campo k="celular" label="Celular (SMS/WhatsApp)" ph="(00) 00000-0000" />
            <label className="flex flex-col gap-0.5 text-[11px] font-medium text-slate-600">Canal preferido
              <select value={f.canal_pref} onChange={(e) => setF({ ...f, canal_pref: e.target.value })} className="rounded-lg border border-slate-300 px-2 py-1 text-[12px] font-normal text-slate-800">{CANAIS.map((c) => <option key={c.v} value={c.v}>{c.l}</option>)}</select>
            </label>
            <Campo k="data_nomeacao" label="Data de nomeação" tipo="date" />
            <Campo k="doc_nomeacao" label="Nº do documento de nomeação" />
            <Campo k="validade" label="Validade do cadastro" tipo="date" />
          </div>
          <label className="mt-3 flex items-start gap-2 text-[11px] text-slate-600">
            <input type="checkbox" checked={f.consentimento_lgpd} onChange={(e) => setF({ ...f, consentimento_lgpd: e.target.checked })} className="mt-0.5 accent-teal-600" />
            <span><b>Consentimento LGPD (obrigatório):</b> o servidor autoriza o uso dos dados de contato exclusivamente para o envio das notificações de gestão, podendo revogar a qualquer tempo.</span>
          </label>
          {erro && <p className="mt-2 flex items-center gap-1 text-[11px] font-semibold text-rose-600"><AlertTriangle className="h-3 w-3" /> {erro}</p>}
          <button onClick={salvar} disabled={salvando} className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-teal-600 px-4 py-2 text-[13px] font-semibold text-white hover:bg-teal-700 disabled:opacity-60">{salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />} Salvar cadastro</button>
        </div>
      )}

      <div className="mt-3">
        {lista.length === 0 ? <p className="text-[12px] text-slate-400">Nenhum servidor cadastrado ainda. Clique em &quot;+ Novo servidor&quot;.</p> : (
          <div className="overflow-x-auto">
            <table className="w-full text-[12px]">
              <thead><tr className="border-b border-slate-100 text-left text-[11px] text-slate-500"><th className="p-1.5 font-medium">Servidor</th><th className="p-1.5 font-medium">Secretaria</th><th className="p-1.5 font-medium">Perfil</th><th className="p-1.5 font-medium">Canal</th><th className="p-1.5 font-medium">Validade</th><th className="p-1.5"></th></tr></thead>
              <tbody>
                {lista.map((s) => (
                  <tr key={s.id} className="border-b border-slate-50 align-top">
                    <td className="p-1.5 text-slate-700"><div className="font-semibold">{s.nome}</div><div className="text-[10px] text-slate-400">{s.cargo}{s.matricula ? ` · mat. ${s.matricula}` : ""}</div></td>
                    <td className="p-1.5 capitalize text-slate-600">{s.secretaria}</td>
                    <td className="p-1.5 capitalize text-slate-600">{s.perfil}</td>
                    <td className="p-1.5 text-slate-600">{s.canal_pref}{s.email ? ` · ${s.email}` : ""}
                      {s.contato_verificado
                        ? <span className="ml-1 rounded bg-emerald-100 px-1 py-0.5 text-[9px] font-semibold text-emerald-700">✓ verificado</span>
                        : <button onClick={() => verificar(s.id)} className="ml-1 rounded bg-amber-100 px-1 py-0.5 text-[9px] font-semibold text-amber-700 hover:bg-amber-200" title="Confirmar o contato (double opt-in) antes de enviar">confirmar contato</button>}
                    </td>
                    <td className="p-1.5">{s.validade ? <span className={s.vencido ? "font-semibold text-rose-600" : "text-slate-600"}>{s.validade.split("-").reverse().join("/")}{s.vencido ? " (vencido)" : ""}</span> : <span className="text-slate-300">—</span>}</td>
                    <td className="p-1.5 text-right"><button onClick={() => inativar(s.id)} title="Inativar" className="text-slate-300 hover:text-rose-600"><Trash2 className="h-3.5 w-3.5" /></button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}
