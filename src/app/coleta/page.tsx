"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type Compras = { ano: number; entes: number; ctr: number; valor: number };
type Contratos = { ano: number; n: number; entes: number };
type Heartbeat = { etapa: string; reinicios: number; msg: string; progresso: number; idade: number };
type QA = { status: string; suspeitos: number; alertas: number; regras: Record<string, number>; idade: number };
type Status = {
  qa: QA | null;
  heartbeat: Heartbeat | null;
  ts: number;
  total: number;
  vazios: number;
  compras: Compras[];
  contratos: Contratos[];
  contratosTot: number;
  pcaFeitos: number;
  pcaDados: number;
  itens: number;
  itensFeitos: number;
};

const POLL_MS = 15000;
const fmtInt = (n: number) => n.toLocaleString("pt-BR");
const fmtBRL = (n: number) =>
  n >= 1e9 ? `R$ ${(n / 1e9).toFixed(2)} bi` : n >= 1e6 ? `R$ ${(n / 1e6).toFixed(1)} mi` : `R$ ${fmtInt(Math.round(n))}`;

function progresso(d: Status): number {
  const compras = d.compras.reduce((s, c) => s + c.entes, 0);
  return compras + d.pcaFeitos + Math.max(0, d.itens) + d.itensFeitos;
}

function Bar({ done, total, color }: { done: number; total: number; color: string }) {
  const pct = Math.min(100, Math.round((done / total) * 100));
  return (
    <div className="h-2.5 w-full rounded-full bg-slate-200">
      <div className={`h-2.5 rounded-full ${color} transition-all duration-500`} style={{ width: `${pct}%` }} />
    </div>
  );
}

export default function ColetaPage() {
  const [d, setD] = useState<Status | null>(null);
  const [err, setErr] = useState("");
  const [now, setNow] = useState(() => Date.now());
  const [lastPoll, setLastPoll] = useState(0);
  const lastChange = useRef(0);
  const prevProg = useRef(-1);

  const carregar = useCallback(async () => {
    try {
      const r = await fetch("/api/coleta-status", { cache: "no-store" });
      const j: Status = await r.json();
      setD(j);
      setErr("");
      setLastPoll(Date.now());
      // avanço de dados: usa o progresso do supervisor (autoritativo) quando há heartbeat
      const p = j.heartbeat?.progresso ?? progresso(j);
      if (p !== prevProg.current) {
        prevProg.current = p;
        lastChange.current = Date.now();
      }
    } catch (e) {
      setErr(String(e));
    }
  }, []);

  useEffect(() => {
    carregar();
    const a = setInterval(carregar, POLL_MS);
    const b = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      clearInterval(a);
      clearInterval(b);
    };
  }, [carregar]);

  const secsSemMudanca = lastChange.current ? Math.round((now - lastChange.current) / 1000) : 0;
  const secsUltimoPoll = lastPoll ? Math.round((now - lastPoll) / 1000) : 0;
  const fmtDur = (s: number) => (s < 90 ? `${s}s` : `${Math.round(s / 60)} min`);

  // estado de saúde — prioriza o heartbeat do supervisor (autoritativo no servidor)
  // Distingue DUAS coisas: o supervisor está vivo (sinal) × os dados estão avançando (progresso).
  let saude: { txt: string; sub?: string; cls: string; dot: string } = { txt: "Aguardando dados…", cls: "bg-slate-100 text-slate-600", dot: "bg-slate-400" };
  const RED = "bg-red-50 text-red-700 ring-1 ring-red-200";
  const AMBER = "bg-amber-50 text-amber-700 ring-1 ring-amber-200";
  const GREEN = "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200";
  const hb = d?.heartbeat ?? null;
  if (d) {
    if (hb) {
      const sinal = `sinal do supervisor há ${hb.idade}s · dados avançaram há ${fmtDur(secsSemMudanca)} · reinícios: ${hb.reinicios}`;
      if (hb.etapa === "concluido") {
        saude = { txt: `✓ Coleta concluída`, sub: `${hb.reinicios} reinício(s) automático(s) no total`, cls: GREEN, dot: "bg-emerald-500" };
      } else if (hb.idade > 180) {
        // o PRÓPRIO supervisor parou de dar sinal → aí sim é problema
        saude = { txt: `⚠ Supervisor sem sinal há ${hb.idade}s — pode ter caído. Me avise!`, cls: RED, dot: "bg-red-500" };
      } else if (/estagna|religad/i.test(hb.msg)) {
        saude = { txt: `Supervisor religou "${hb.etapa}" automaticamente — recuperando`, sub: sinal, cls: AMBER, dot: "bg-amber-500" };
      } else if (secsSemMudanca > 900) {
        // supervisor vivo, mas dados parados há muito — ainda dentro do limite (religa aos 30 min)
        saude = { txt: `Supervisor ativo (etapa: ${hb.etapa}) — dados sem avanço há ${fmtDur(secsSemMudanca)}`, sub: `Normal para entes grandes no ritmo conservador. Se passar de 30 min, o supervisor religa sozinho.`, cls: AMBER, dot: "bg-amber-500" };
      } else {
        saude = { txt: `Supervisor ativo · coletando ${hb.etapa}`, sub: `${sinal}. Números parados por minutos ≠ travado — entes grandes levam tempo.`, cls: GREEN, dot: "bg-emerald-500" };
      }
    } else {
      // sem heartbeat (supervisor antigo/desligado): cai p/ detecção pelo navegador
      if (secsSemMudanca > 300) saude = { txt: `⚠ SEM PROGRESSO há ${secsSemMudanca}s — possível travamento. Me avise!`, cls: RED, dot: "bg-red-500" };
      else if (secsSemMudanca > 120) saude = { txt: `Atenção: sem mudança há ${secsSemMudanca}s (etapa pesada ou início de fase)`, cls: AMBER, dot: "bg-amber-500" };
      else saude = { txt: `Progredindo — última mudança há ${secsSemMudanca}s (sem supervisor)`, cls: GREEN, dot: "bg-emerald-500" };
    }
  }

  const ANOS_COMPRAS = [2026, 2025, 2024, 2023, 2022];
  const comprasMap = new Map((d?.compras ?? []).map((c) => [c.ano, c]));
  const alvo = d ? d.total : 296;

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Painel de Coleta — PNCP / SC</h1>
          <p className="text-sm text-slate-500">
            Atualiza a cada {POLL_MS / 1000}s · {alvo} entes (295 municípios + Estado)
            {d ? ` · painel atualizado há ${secsUltimoPoll}s` : ""}
          </p>
        </div>
        <span className={`flex items-center gap-2 rounded-full px-3 py-1 text-xs font-medium ${saude.cls}`}>
          <span className={`h-2.5 w-2.5 animate-pulse rounded-full ${saude.dot}`} />
          {d ? "ao vivo" : "conectando"}
        </span>
      </div>

      {/* banner de saúde */}
      <div className={`mb-6 rounded-xl px-4 py-3 ${saude.cls}`}>
        <div className="flex items-center gap-2 text-sm font-medium">
          <span className={`h-2.5 w-2.5 shrink-0 animate-pulse rounded-full ${saude.dot}`} />
          {saude.txt}
        </div>
        {saude.sub && <div className="mt-1 pl-[18px] text-xs opacity-80">{saude.sub}</div>}
      </div>

      {err && <div className="mb-6 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">Erro ao consultar: {err}</div>}

      {d && (
        <div className="space-y-6">
          {/* ROBUSTEZ & MELHORIAS */}
          <section className="rounded-2xl border border-slate-200 bg-gradient-to-br from-slate-50 to-white p-5 shadow-sm">
            <h2 className="mb-3 flex items-center justify-between text-base font-semibold text-slate-800">
              <span>🛡️ Robustez &amp; Melhorias</span>
              {hb && (
                <span className="flex flex-wrap gap-2 text-xs font-normal">
                  <span className="rounded-md bg-slate-100 px-2 py-1 tabular-nums text-slate-600">etapa: {hb.etapa}</span>
                  <span className={`rounded-md px-2 py-1 tabular-nums ${hb.reinicios > 0 ? "bg-amber-100 text-amber-700" : "bg-emerald-100 text-emerald-700"}`}>
                    reinícios auto: {hb.reinicios}
                  </span>
                  <span className="rounded-md bg-slate-100 px-2 py-1 tabular-nums text-slate-600">sinal há {hb.idade}s</span>
                </span>
              )}
            </h2>
            <div className="grid gap-2 sm:grid-cols-2">
              {[
                ["♻️ Supervisor auto-recuperável", "Detecta estagnação e religa a etapa sozinho (limite 30 min) — sem vigília humana."],
                ["📟 Heartbeat auditável no banco", "Estado gravado no Neon a cada 60s; o painel não depende da aba aberta."],
                ["⏱️ Timeouts de rede e banco", "Teto rígido no fetch (PNCP) e query_timeout/statement_timeout — fim do socket pendurado."],
                ["🔁 ETLs idempotentes/resumíveis", "Religar nunca duplica nem perde dados; retoma de onde parou."],
                ["🐢 Ritmo conservador (fidelidade)", "Paginação completa (CAP 2000) priorizando dados oficiais íntegros sobre velocidade."],
                ["✅ Verificação ponta a ponta", "Mudanças validadas no banco e em produção, não apenas afirmadas."],
              ].map(([t, desc]) => (
                <div key={t} className="rounded-lg border border-slate-100 bg-white p-3">
                  <p className="text-sm font-medium text-slate-700">{t}</p>
                  <p className="mt-0.5 text-xs text-slate-500">{desc}</p>
                </div>
              ))}
            </div>
          </section>

          {/* QUALIDADE — validação contínua */}
          {(() => {
            const qa = d.qa;
            if (!qa) return null;
            const cfg =
              qa.status === "erro"
                ? { cls: "border-red-200 bg-red-50", dot: "bg-red-500", txt: "text-red-700", label: "Erros reais a tratar" }
                : qa.status === "atencao"
                  ? { cls: "border-amber-200 bg-amber-50", dot: "bg-amber-500", txt: "text-amber-700", label: "Atenção — sinais a revisar" }
                  : { cls: "border-emerald-200 bg-emerald-50", dot: "bg-emerald-500", txt: "text-emerald-700", label: "Íntegro" };
            const R = qa.regras || {};
            return (
              <section className={`rounded-2xl border p-5 shadow-sm ${cfg.cls}`}>
                <h2 className="mb-3 flex items-center justify-between text-base font-semibold text-slate-800">
                  <span className="flex items-center gap-2">
                    <span className={`h-2.5 w-2.5 rounded-full ${cfg.dot}`} />
                    🔎 Validação contínua de integridade
                  </span>
                  <span className={`text-xs font-medium ${cfg.txt}`}>{cfg.label} · verificado há {qa.idade}s</span>
                </h2>
                <div className="grid gap-2 text-sm sm:grid-cols-3">
                  <div className="rounded-lg bg-white/70 p-3">
                    <p className="text-xs text-slate-500">Registros suspeitos (excluídos)</p>
                    <p className="text-lg font-semibold tabular-nums text-slate-800">{qa.suspeitos}</p>
                  </div>
                  <div className="rounded-lg bg-white/70 p-3">
                    <p className="text-xs text-slate-500">Sobrepreço unitário (preço hom &gt; est)</p>
                    <p className="text-lg font-semibold tabular-nums text-slate-800">
                      {(R.itens_coletados ?? 0) > 0 ? qa.alertas : <span className="text-sm font-normal text-slate-400">aguardando itens</span>}
                    </p>
                  </div>
                  <div className="rounded-lg bg-white/70 p-3">
                    <p className="text-xs text-slate-500">Erros reais a tratar</p>
                    <p className="text-lg font-semibold tabular-nums text-slate-800">
                      {(R.compras_pct_fora ?? 0) + (R.compras_valor_neg ?? 0) + (R.contratos_valor_neg ?? 0) + (R.transf_valor_neg ?? 0)}
                    </p>
                  </div>
                </div>
                <p className="mt-2 text-xs text-slate-500">
                  Auditor independente roda a cada 5 min: flaga anomalias impossíveis (preserva o dado bruto, exclui das análises).
                  <b> Sobrepreço é medido por preço unitário</b> (estimado × homologado, item a item) — a diferença no total do contrato
                  pode ser só quantidade (registro de preços/credenciamento), não preço maior.
                </p>
              </section>
            );
          })()}

          {/* COMPRAS */}
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="mb-3 flex items-center justify-between text-base font-semibold text-slate-800">
              <span>🛒 Compras (PNCP)</span>
              <span className="text-xs font-normal text-slate-400">vazios registrados: {d.vazios}</span>
            </h2>
            <div className="space-y-3">
              {ANOS_COMPRAS.map((ano) => {
                const c = comprasMap.get(ano);
                const entes = c?.entes ?? 0;
                return (
                  <div key={ano}>
                    <div className="mb-1 flex items-center justify-between text-sm">
                      <span className="font-medium text-slate-700">{ano}</span>
                      <span className="tabular-nums text-slate-500">
                        {entes}/{alvo} entes · {fmtInt(c?.ctr ?? 0)} contratações · {fmtBRL(c?.valor ?? 0)}
                      </span>
                    </div>
                    <Bar done={entes} total={alvo} color={entes >= alvo - d.vazios ? "bg-emerald-500" : "bg-blue-500"} />
                  </div>
                );
              })}
            </div>
          </section>

          {/* CONTRATOS */}
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="mb-3 text-base font-semibold text-slate-800">📄 Contratos assinados (PNCP)</h2>
            <p className="mb-3 text-sm text-slate-600">
              <span className="font-semibold text-emerald-600">✓ concluído</span> · {fmtInt(d.contratosTot)} contratos
            </p>
            <div className="flex flex-wrap gap-2 text-xs text-slate-500">
              {d.contratos.map((c) => (
                <span key={c.ano} className="rounded-md bg-slate-100 px-2 py-1 tabular-nums">
                  {c.ano}: {fmtInt(c.n)} ({c.entes} entes)
                </span>
              ))}
            </div>
          </section>

          {/* PCA */}
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="mb-3 text-base font-semibold text-slate-800">📅 PCA — Plano Anual de Contratações (2024–2027)</h2>
            <div className="mb-1 flex items-center justify-between text-sm">
              <span className="text-slate-700">municípios processados</span>
              <span className="tabular-nums text-slate-500">
                {d.pcaFeitos}/{alvo} · {d.pcaDados} com plano
              </span>
            </div>
            <Bar done={d.pcaFeitos} total={alvo} color={d.pcaFeitos >= alvo ? "bg-emerald-500" : "bg-violet-500"} />
          </section>

          {/* ITENS */}
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="mb-3 text-base font-semibold text-slate-800">🧾 Itens dos processos</h2>
            {d.itens < 0 ? (
              <p className="text-sm text-slate-400">Aguardando — roda como passo final, após Compras e PCA.</p>
            ) : (
              <p className="text-sm text-slate-600">
                {fmtInt(d.itens)} itens persistidos · {d.itensFeitos} entes processados
              </p>
            )}
          </section>

          {/* COMO AVISAR */}
          <section className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-5 text-sm text-slate-600">
            <p className="mb-1 font-semibold text-slate-700">Supervisor auto-recuperável ativo:</p>
            <ul className="list-inside list-disc space-y-1">
              <li>
                Travou? O supervisor <b>detecta e religa sozinho</b> a etapa (sem perder dados). A faixa fica{" "}
                <span className="font-medium text-amber-600">amarela</span> durante a recuperação — é normal, não precisa agir.
              </li>
              <li>
                Só me avise se ficar <span className="font-medium text-red-600">vermelha</span> (supervisor sem sinal &gt; 3 min = o próprio
                supervisor caiu) ou se os <b>reinícios subirem muito</b> (problema persistente).
              </li>
              <li>Os números só aumentam — se um contador <b>regredir ou zerar</b>, me avise na hora.</li>
            </ul>
          </section>
        </div>
      )}
    </div>
  );
}
