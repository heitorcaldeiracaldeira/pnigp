import "server-only";
import type { ComprasSC } from "./queries";

const PNCP = "https://pncp.gov.br/api/consulta/v1/contratacoes/publicacao";
const CAP_PAGINAS = 8; // sob demanda: janela p/ resposta razoável (capitais ainda parciais)
const ORCAMENTO_MS = 40000; // tempo máx. de coleta por ente — retorna o que tiver
// Ordenadas por volume típico; lic=false só p/ dispensa(8)/inexigibilidade(9) (fuga à licitação).
const MODALIDADES = [
  { id: 6, nome: "Pregão Eletrônico", lic: true },
  { id: 8, nome: "Dispensa", lic: false },
  { id: 4, nome: "Concorrência Eletrônica", lic: true },
  { id: 9, nome: "Inexigibilidade", lic: false },
  { id: 12, nome: "Credenciamento", lic: true },
  { id: 7, nome: "Pregão Presencial", lic: true },
  { id: 5, nome: "Concorrência", lic: true },
  { id: 13, nome: "Leilão", lic: true },
  { id: 1, nome: "Leilão Eletrônico", lic: true },
  { id: 3, nome: "Concurso", lic: true },
];
const r2 = (n: number) => Math.round((n || 0) * 100) / 100;
const sleep = (ms: number) => new Promise((s) => setTimeout(s, ms));

async function fetchPagina(modId: number, esfera: string, cod: string, pagina: number) {
  const geo = cod === "42" ? "uf=SC" : `codigoMunicipioIbge=${cod}`;
  const url = `${PNCP}?dataInicial=20240101&dataFinal=20241231&codigoModalidadeContratacao=${modId}&${geo}&pagina=${pagina}&tamanhoPagina=50`;
  for (let t = 0; t < 3; t++) {
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(15000), next: { revalidate: 86400 } });
      if (r.status === 204) return { data: [], totalPaginas: 0 };
      if (r.status === 429) { if (t === 2) return null; await sleep(2500); continue; } // 429: espera curta, desiste rápido
      if (!r.ok) throw new Error("HTTP " + r.status);
      return (await r.json()) as { data?: Record<string, unknown>[]; totalPaginas?: number };
    } catch {
      await sleep(500 * (t + 1));
    }
  }
  return null;
}

type Bruto = { objeto: string; modalidade: string; lic: boolean; orgao: string; estimado: number; homologado: number; data: string };

export async function fetchComprasPNCP(cod: string, tipo: "M" | "E"): Promise<ComprasSC> {
  const esfera = tipo === "E" ? "E" : "M";
  const t0 = Date.now();
  const contratos: Bruto[] = [];
  for (const mod of MODALIDADES) {
    if (Date.now() - t0 > ORCAMENTO_MS) break;
    let pagina = 1, totalPaginas = 1;
    do {
      if (Date.now() - t0 > ORCAMENTO_MS) break;
      const j = await fetchPagina(mod.id, esfera, cod, pagina);
      if (!j) break;
      totalPaginas = j.totalPaginas || 0;
      for (const x of j.data || []) {
        const org = x.orgaoEntidade as { esferaId?: string; razaoSocial?: string } | undefined;
        if (org?.esferaId !== esfera) continue;
        contratos.push({
          objeto: String(x.objetoCompra || "").slice(0, 240),
          modalidade: mod.nome,
          lic: mod.lic,
          orgao: org?.razaoSocial || "",
          estimado: Number(x.valorTotalEstimado) || 0,
          homologado: Number(x.valorTotalHomologado) || 0,
          data: String(x.dataPublicacaoPncp || "").slice(0, 10),
        });
      }
      pagina++;
    } while (pagina <= totalPaginas && pagina <= CAP_PAGINAS);
  }

  const valor_homologado = r2(contratos.reduce((s, c) => s + c.homologado, 0));
  const comEH = contratos.filter((c) => c.estimado > 0 && c.homologado > 0);
  const estSoma = r2(comEH.reduce((s, c) => s + c.estimado, 0));
  const homSoma = r2(comEH.reduce((s, c) => s + c.homologado, 0));
  const economia_pct = estSoma > 0 ? r2(((estSoma - homSoma) / estSoma) * 100) : 0;
  const semLic = r2(contratos.filter((c) => !c.lic).reduce((s, c) => s + c.homologado, 0));
  const dispensa_pct = valor_homologado > 0 ? r2((semLic / valor_homologado) * 100) : 0;
  const porMod: Record<string, { modalidade: string; n: number; valor: number }> = {};
  for (const c of contratos) {
    porMod[c.modalidade] = porMod[c.modalidade] || { modalidade: c.modalidade, n: 0, valor: 0 };
    porMod[c.modalidade].n++;
    porMod[c.modalidade].valor = r2(porMod[c.modalidade].valor + c.homologado);
  }
  const por_modalidade = Object.values(porMod).sort((a, b) => b.valor - a.valor);
  const top = [...contratos].sort((a, b) => b.homologado - a.homologado).slice(0, 12).map((c) => ({
    objeto: c.objeto, modalidade: c.modalidade, orgao: c.orgao,
    estimado: r2(c.estimado), homologado: r2(c.homologado),
    economia_pct: c.estimado > 0 && c.homologado > 0 ? r2(((c.estimado - c.homologado) / c.estimado) * 100) : null,
    data: c.data,
  }));
  return { n_contratos: contratos.length, valor_estimado: estSoma, valor_homologado, economia_pct, dispensa_pct, por_modalidade, top };
}
