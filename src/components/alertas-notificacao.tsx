"use client";

// Modelos de NOTIFICAÇÃO de alertas — e-mail, SMS e WhatsApp — gerados a partir dos alertas REAIS do município.
// É a camada de "canal" da Central de Alertas: o texto pronto para o gestor/assessoria enviar (copiar e colar).
// O envio automático (integração de provedor) é passo futuro; aqui entregamos os modelos prontos.
import { useState } from "react";
import { Mail, MessageSquare, Phone, Copy, Check } from "lucide-react";
import type { Alerta } from "@/lib/queries";

const trunc = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1).trimEnd() + "…" : s);

export function AlertasNotificacao({ alertas, nome }: { alertas: Alerta[]; nome: string }) {
  const [copiado, setCopiado] = useState<string | null>(null);
  if (!alertas.length) return null;

  const criticos = alertas.filter((a) => a.sev === "critico");
  const outros = alertas.filter((a) => a.sev !== "critico");
  const top = criticos[0] || alertas[0];

  // E-MAIL — formal, completo, com ação por item
  const email =
    `Assunto: [i10 Gov 360] Alertas de gestão — ${nome}\n\n` +
    `Prezado(a) gestor(a),\n\n` +
    `O monitoramento contínuo identificou ${alertas.length} alerta(s) que requerem atenção em ${nome}:\n\n` +
    (criticos.length ? `CRÍTICOS (podem travar recursos federais):\n` + criticos.map((a, i) => `${i + 1}. ${a.titulo}\n   ${a.detalhe}\n   Ação recomendada: ${a.acao}`).join("\n\n") + "\n\n" : "") +
    (outros.length ? `ATENÇÃO:\n` + outros.map((a, i) => `${i + 1}. ${a.titulo} — ${a.acao}`).join("\n") + "\n\n" : "") +
    `Recomendamos priorizar os itens críticos.\n\nAtenciosamente,\nMonitoramento i10 Gov 360\nDados oficiais (SICONFI, CAUC, CADPREV, Transferegov).`;

  // SMS — até ~160 caracteres, só o essencial
  const sms = trunc(`[i10 Gov ${nome}] ${criticos.length || alertas.length} alerta(s) ${criticos.length ? "critico(s)" : ""}: ${trunc(top.titulo, 60)}. Regularize p/ nao travar repasses. Detalhes no painel.`, 160);

  // WHATSAPP — com marcadores e emojis, escaneável no celular
  const wpp =
    `*🔔 Alertas de Gestão — ${nome}*\n\n` +
    `Identificamos *${alertas.length} ponto(s)* que merecem atenção:\n\n` +
    criticos.map((a) => `🔴 *${a.titulo}*\n${trunc(a.detalhe, 120)}\n✅ _${trunc(a.acao, 90)}_`).join("\n\n") +
    (outros.length ? "\n\n" + outros.map((a) => `🟡 *${a.titulo}*\n✅ _${trunc(a.acao, 90)}_`).join("\n\n") : "") +
    `\n\n_Fonte: i10 Gov 360 · dados públicos oficiais_`;

  const copiar = (id: string, txt: string) => {
    navigator.clipboard?.writeText(txt).then(() => { setCopiado(id); setTimeout(() => setCopiado(null), 2000); }).catch(() => {});
  };

  const canais = [
    { id: "email", icone: Mail, cor: "text-sky-600", nome: "E-mail", desc: "formal, completo — para a caixa do gestor/secretaria", txt: email },
    { id: "wpp", icone: MessageSquare, cor: "text-emerald-600", nome: "WhatsApp", desc: "escaneável no celular — para o grupo da gestão", txt: wpp },
    { id: "sms", icone: Phone, cor: "text-violet-600", nome: "SMS", desc: `curto (${sms.length}/160) — para o número do gestor`, txt: sms },
  ];

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5">
      <h3 className="flex items-center gap-1.5 font-semibold text-slate-800"><MessageSquare className="h-4 w-4 text-teal-600" /> Modelos de notificação — e-mail, SMS e WhatsApp</h3>
      <p className="mt-1 text-[12px] text-slate-500">Textos prontos, gerados dos alertas reais de {nome}. Copie e envie pelo canal da sua preferência. (O envio automático é um passo futuro — aqui entregamos os modelos.)</p>

      <div className="mt-3 grid gap-3 lg:grid-cols-3">
        {canais.map((c) => (
          <div key={c.id} className="flex flex-col rounded-xl border border-slate-200 bg-slate-50/50 p-3">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-[13px] font-semibold text-slate-700"><c.icone className={`h-4 w-4 ${c.cor}`} /> {c.nome}</span>
              <button onClick={() => copiar(c.id, c.txt)} className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-2 py-1 text-[11px] font-semibold text-slate-600 hover:border-teal-300 hover:bg-teal-50 hover:text-teal-700">
                {copiado === c.id ? <><Check className="h-3 w-3 text-emerald-600" /> Copiado</> : <><Copy className="h-3 w-3" /> Copiar</>}
              </button>
            </div>
            <p className="mt-1 text-[10px] text-slate-400">{c.desc}</p>
            <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap rounded-lg border border-slate-200 bg-white p-2 text-[11px] leading-snug text-slate-600">{c.txt}</pre>
          </div>
        ))}
      </div>
    </section>
  );
}
