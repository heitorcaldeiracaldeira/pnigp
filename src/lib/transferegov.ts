import "server-only";

// Transferências da União / Convênios (universo Transferegov/SICONV) via Portal da Transparência (CGU).
// Requer chave gratuita: portaldatransparencia.gov.br/api-de-dados/cadastrar-email → PORTAL_TRANSPARENCIA_KEY no .env.local
// OBS: os nomes de campo da resposta são tratados de forma defensiva (vários aliases) e devem ser
// confirmados contra uma resposta real assim que a chave estiver disponível.

const API = "https://api.portaldatransparencia.gov.br/api-de-dados";
const CAP_PAGINAS = 20; // bounded
const r2 = (n: number) => Math.round((n || 0) * 100) / 100;
const sleep = (ms: number) => new Promise((s) => setTimeout(s, ms));

export type TransferenciasSC = {
  n_instrumentos: number;
  valor_total: number;
  valor_liberado: number;
  por_situacao: { situacao: string; n: number; valor: number }[];
  por_orgao: { orgao: string; n: number; valor: number }[];
  top: { objeto: string; orgao: string; situacao: string; valor: number; liberado: number; inicio: string; fim: string }[];
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

// extração defensiva de um convênio
function campoNum(c: Record<string, unknown>, ...nomes: string[]): number {
  for (const n of nomes) { const v = c[n]; if (v != null && v !== "") return Number(String(v).replace(/\./g, "").replace(",", ".")) || Number(v) || 0; }
  return 0;
}
function campoStr(c: Record<string, unknown>, ...nomes: string[]): string {
  for (const n of nomes) {
    const v = c[n];
    if (v == null) continue;
    if (typeof v === "object") { const o = v as Record<string, unknown>; const nome = o.nome ?? o.descricao ?? o.razaoSocial; if (nome) return String(nome); }
    else if (String(v).trim()) return String(v);
  }
  return "—";
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
    const orgaoSup = c.dimensaoOrgaoSuperior ?? c.orgaoSuperior ?? c.concedente ?? c.orgao;
    return {
      objeto: campoStr(c, "objeto", "objetoConvenio", "objetoProposta").slice(0, 220),
      orgao: campoStr({ x: orgaoSup } as Record<string, unknown>, "x"),
      situacao: campoStr(c, "situacao", "situacaoConvenio", "situacaoPublicacao"),
      valor: r2(campoNum(c, "valor", "valorGlobal", "valorCelebrado", "valorConvenio")),
      liberado: r2(campoNum(c, "valorLiberado", "valorLiberadoConcedente")),
      inicio: campoStr(c, "dataInicioVigencia", "dataPublicacao", "dataCelebracao"),
      fim: campoStr(c, "dataFinalVigencia", "dataFimVigencia"),
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
