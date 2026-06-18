import "server-only";

// Transferências da União / Convênios (universo Transferegov/SICONV) via Portal da Transparência (CGU).
// Requer chave gratuita: portaldatransparencia.gov.br/api-de-dados/cadastrar-email → PORTAL_TRANSPARENCIA_KEY no .env.local
// OBS: os nomes de campo da resposta são tratados de forma defensiva (vários aliases) e devem ser
// confirmados contra uma resposta real assim que a chave estiver disponível.

const API = "https://api.portaldatransparencia.gov.br/api-de-dados";
const CAP_PAGINAS = 40; // on-demand: bounded p/ resposta rápida (pré-aquecidos têm coleta completa)
const r2 = (n: number) => Math.round((n || 0) * 100) / 100;
const sleep = (ms: number) => new Promise((s) => setTimeout(s, ms));

export type TransferenciasSC = {
  n_instrumentos: number;
  valor_total: number;
  valor_liberado: number;
  por_situacao: { situacao: string; n: number; valor: number }[];
  por_orgao: { orgao: string; n: number; valor: number }[];
  top: { objeto: string; orgao: string; convenente: string; situacao: string; valor: number; liberado: number; inicio: string; fim: string }[];
};

export function temChavePortal(): boolean {
  return !!(process.env.PORTAL_TRANSPARENCIA_KEY && process.env.PORTAL_TRANSPARENCIA_KEY.trim());
}

async function getPagina(cod: string, pagina: number): Promise<Record<string, unknown>[] | null> {
  const key = process.env.PORTAL_TRANSPARENCIA_KEY!.trim();
  const url = `${API}/convenios?codigoIBGE=${cod}&pagina=${pagina}`;
  for (let t = 0; t < 4; t++) {
    try {
      const r = await fetch(url, {
        headers: { "chave-api-dados": key, accept: "application/json" },
        signal: AbortSignal.timeout(20000),
        next: { revalidate: 86400 },
      });
      if (r.status === 401 || r.status === 403) return null; // chave ausente/inválida
      if (r.status === 204) return [];
      if (r.status === 429) { await sleep(3000 + t * 3000); continue; }
      if (!r.ok) return [];
      const j = await r.json();
      return Array.isArray(j) ? (j as Record<string, unknown>[]) : [];
    } catch {
      await sleep(700 * (t + 1));
    }
  }
  return [];
}

export async function fetchTransferenciasPortal(cod: string): Promise<TransferenciasSC | null> {
  if (!temChavePortal()) return null;
  const convenios: Record<string, unknown>[] = [];
  let pagina = 1;
  while (pagina <= CAP_PAGINAS) {
    const arr = await getPagina(cod, pagina);
    if (arr === null) return null; // sem chave válida
    if (!arr.length) break;
    convenios.push(...arr);
    if (arr.length < 15) break; // última página (page size padrão ~15)
    pagina++;
  }

  const norm = convenios.map((c) => {
    const dim = (c.dimConvenio ?? {}) as Record<string, unknown>;
    const org = (c.orgao ?? {}) as Record<string, unknown>;
    const orgMax = (org.orgaoMaximo ?? {}) as Record<string, unknown>;
    const conv = (c.convenente ?? {}) as Record<string, unknown>;
    return {
      objeto: String(dim.objeto ?? "—").slice(0, 220),
      orgao: String(orgMax.nome ?? org.nome ?? "—"),
      convenente: String(conv.nome ?? conv.razaoSocialReceita ?? "—"),
      situacao: String(c.situacao ?? "—"),
      valor: r2(Number(c.valor) || 0),
      liberado: r2(Number(c.valorLiberado) || 0),
      inicio: String(c.dataInicioVigencia ?? c.dataPublicacao ?? ""),
      fim: String(c.dataFinalVigencia ?? ""),
    };
  });

  const valor_total = r2(norm.reduce((s, c) => s + c.valor, 0));
  const valor_liberado = r2(norm.reduce((s, c) => s + c.liberado, 0));
  const agg = (key: "situacao" | "orgao") => {
    const m: Record<string, { n: number; valor: number }> = {};
    for (const c of norm) { const k = c[key] || "—"; (m[k] ??= { n: 0, valor: 0 }); m[k].n++; m[k].valor = r2(m[k].valor + c.valor); }
    return Object.entries(m).map(([nome, v]) => ({ [key]: nome, n: v.n, valor: v.valor })).sort((a, b) => b.valor - a.valor);
  };
  const por_situacao = agg("situacao") as TransferenciasSC["por_situacao"];
  const por_orgao = (agg("orgao") as TransferenciasSC["por_orgao"]).slice(0, 8);
  const top = [...norm].sort((a, b) => b.valor - a.valor).slice(0, 12);
  return { n_instrumentos: norm.length, valor_total, valor_liberado, por_situacao, por_orgao, top };
}
