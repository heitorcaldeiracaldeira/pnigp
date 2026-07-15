// PARSER DETERMINÍSTICO — AZ INFORMATICA ("Resultados" / "FORNECEDORES CLASSIFICADOS").
// Rotear por arquivo_texto_sc.gerador='az' (assinatura no texto), NÃO pela plataforma do PNCP ([[mapa_atas_plataformas]]).
//
// COBERTURA = "completo": TODOS os licitantes por lote, cada um com CNPJ + valor + situação + MARCA + MODELO.
// Marca (qualidade) + disputa (nº de concorrentes + queda de preço) + preço no MESMO documento = os 3 sinais do
// banco de sucesso ([[pnigp-copiloto-compra]]).
//
// ESTRUTURA REAL (lida do documento, não suposta):
//   Lote 1 Itens do lote: 1 Item: 1 Unidade: Peça Microcomputador administrativo... Quantidade: 34
//   CNPJ/CPF Nome Marca Modelo SituaçãoValor                       <- CABEÇALHO da tabela
//   BX DISTRIBUIDORA DE48.849.767/0001-16 2.147,0000 VencedorAIOX AIOX G200
//   SINCES TECNOLOGIA33.615.509/0001-06 2.148,0000 ClassificadoEXIX E5652
//   Lote 2 Itens do lote: 1 Item: 1 Unidade: Peça ...
//
// ⚠️ 2 ARMADILHAS (ambas medidas no documento real):
//  1. **`Item:` é SEMPRE 1** — quem numera é o **LOTE**. Usar `Item:` como chave colapsa tudo em "item 1".
//  2. O PDF tem coluna estreita: o nome vem TRUNCADO e COLADO no CNPJ ("BX DISTRIBUIDORA DE48.849..."), e a
//     situação cola na marca ("VencedorAIOX"). Por isso a âncora é o CNPJ (determinístico) e o nome é o campo
//     fuzzy — mesma arquitetura do ECustomize: identidade = CNPJ, nome = atributo.
import { normalizaMarca } from "./mapa_atas_plataformas.mjs";
const num = (s) => Number(String(s).replace(/[^\d,.-]/g, "").replace(/\.(?=\d{3}(\D|$))/g, "").replace(",", ".")) || 0;
const limpaCnpj = (s) => s.replace(/\s+/g, "");

// cabeçalho do LOTE. Descrição limitada (gap ilimitado = backtracking catastrófico).
const LOTE = /Lote\s+(\d+)\s+Itens do lote:\s*(\d+)\s+Item:\s*(\d+)\s+Unidade:\s*(\S{1,24})\s+([\s\S]{1,400}?)\s+Quantidade:\s*([\d.]+(?:,\d+)?)\s+CNPJ\s*\/\s*CPF\s+Nome\s+Marca\s+Modelo\s+Situa[çc][ãa]o\s*Valor/gi;
// licitante: <nome><CNPJ> <valor> <situação><marca modelo>
const LIC = /([^\d]{0,50}?)(\d{2}\.\d{3}\.\d{3}\/\d{4}\s*-\s*\d{2}|\d{3}\.\d{3}\.\d{3}\s*-\s*\d{2})\s*([\d.]+,\d{2,4})\s*(Vencedor|Classificad[oa]|Desclassificad[oa]|Cancelad[oa]|Empatad[oa]|Inabilitad[oa]|Habilitad[oa]|Deserto|Fracassad[oa])\s*([^]{0,60}?)(?=[^\d]{0,50}?(?:\d{2}\.\d{3}\.\d{3}\/\d{4}|\d{3}\.\d{3}\.\d{3}\s*-\s*\d{2})|Lote\s+\d+\s+Itens|$)/g;
// resíduo do cabeçalho colado no nome do 1º licitante ("...SituaçãoValor BX DISTRIBUIDORA")
const CAB_RESID = /^[\s\S]*(?:Situa[çc][ãa]o\s*Valor|CNPJ\s*\/\s*CPF|Modelo)\s*/i;

// ─────────────────────────────────────────────────────────────────────────────────────────────────────────────
// LAYOUT 2 — "por FORNECEDOR" (a AZ gera 2 formatos de "Resultados"; medido: 150 docs no layout 1, 141 neste).
//   FORNECEDOR Portabilis Tecnologia LTDA CNPJ/CPF: 11258607000192 TOTAL: 61.000,00
//   1 Valor Inicial: 61.196,00 Valor final: 61.000,00 Itens do lote: 2
//   Item: 1 Unidade: UNID propriaMarca: proprioModelo: Implantação de solução... Quantidade: 1,00 Valor unitário: 19.935,94
//
// ⚠️ O RÓTULO VEM DEPOIS DO VALOR: "propriaMarca:" = marca "propria"; "proprioModelo:" = modelo "proprio".
// O PDF emite a coluna do valor antes da do label. Nenhum `Marca:\s*(...)` casa — o valor está À ESQUERDA.
// Cobertura deste layout = "vencedor" (marca do vencedor por item) + Valor Inicial→final (sinal de disputa).
const FORN2 = /FORNECEDOR\s+(.{3,80}?)\s+CNPJ\s*\/\s*CPF:\s*(\d{11,14})\s+TOTAL:\s*([\d.]+,\d{2})([\s\S]{0,200}?Valor\s*Inicial:\s*([\d.]+,\d{2})\s+Valor\s*final:\s*([\d.]+,\d{2}))?/gi;
const ITEM2 = /Item:\s*(\d+)\s+Unidade:\s*(\S{1,24})\s+([^]{0,40}?)Marca:\s*([^]{0,40}?)Modelo:\s*([\s\S]{1,300}?)\s+Quantidade:\s*([\d.]+(?:,\d+)?)\s+Valor\s*unit[áa]rio:\s*([\d.]+,\d{2})/gi;

function parseLayout2(t) {
  const fs2 = [...t.matchAll(FORN2)].map((m) => ({
    fornecedor: m[1].trim().slice(0, 160), cnpj: m[2],
    total: num(m[3]), ini: num(m[5] || 0), fim: num(m[6] || 0), pos: m.index + m[0].length,
  }));
  if (!fs2.length) return [];
  for (let i = 0; i < fs2.length; i++) fs2[i].ate = i + 1 < fs2.length ? fs2[i + 1].pos - 200 : t.length;
  const out = [];
  for (const f of fs2) {
    for (const m of t.slice(f.pos, Math.max(f.pos, f.ate)).matchAll(ITEM2)) {
      out.push({
        lote: null, item: parseInt(m[1], 10), numero: parseInt(m[1], 10),
        unidade: m[2].trim(), descricao: m[5].trim().slice(0, 400), quantidade: num(m[6]),
        fornecedor: f.fornecedor, cnpj: f.cnpj,
        valorUnitario: num(m[7]),
        situacao: "Vencedor", vencedor: true,   // este layout lista o(s) fornecedor(es) do resultado
        ofertaInicial: f.ini || null, ofertaFinal: f.fim || null,
        marca: normalizaMarca(m[3]), modelo: normalizaMarca(m[4]),
        layout: 2,
      });
    }
  }
  return out;
}

export function parseAtaAz(texto) {
  const t = String(texto || "").replace(/\s+/g, " ");
  // LAYOUT 1 (tabela de TODOS os licitantes). Se não casar, tenta o LAYOUT 2 (por fornecedor).
  const l1 = parseLayout1(t);
  return l1.length ? l1 : parseLayout2(t);
}

// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
// CRUZAMENTO LOTE (documento) → numeroItem (PNCP) — o "lote versus item".
//
// 🔴 O documento numera POR LOTE dentro do processo ("Lote 1", "Lote 2"); o PNCP numera POR ITEM com um ID GLOBAL
// ("numeroItem": 1400443). São DOIS sistemas de numeração diferentes. Medido em 749 lotes:
//     lote == numeroItem :   0  (0,0%)   ← usar o lote como chave grava 100% ERRADO
//     casa por DESCRIÇÃO : 749 (100,0%)  ← similaridade 1.00, zero falha
// Portanto a ponte é a DESCRIÇÃO, e ela é determinística. (2024/76: lote 1→item 1400443, lote 2→1400444.)
//
// casaItens(registros, itensDoPncp) → devolve os registros com `numero` = numeroItem REAL do PNCP.
// Sem casamento confiável (sim < MIN_SIM), `numero` fica null e o registro NÃO deve ser gravado — melhor perder
// do que pendurar a marca no item errado ([[feedback-privilegiar-dados]]: nunca cortar em silêncio, mas nunca mentir).
const MIN_SIM = 0.6;
const normD = (s) => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
function simDesc(a, b) {
  const A = new Set(normD(a).split(" ").filter((x) => x.length > 3));
  const B = new Set(normD(b).split(" ").filter((x) => x.length > 3));
  if (!A.size || !B.size) return 0;
  let i = 0; for (const x of A) if (B.has(x)) i++;
  return i / Math.min(A.size, B.size);
}
export function casaItens(regs, itens) {
  if (!regs.length || !itens?.length) return regs.map((r) => ({ ...r, numero: null, simItem: 0 }));
  // resolve UMA vez por lote (todos os licitantes do lote compartilham a descrição)
  const porChave = new Map();
  for (const r of regs) {
    const k = r.lote ?? r.item;
    if (porChave.has(k)) continue;
    let melhor = null, ms = 0;
    for (const it of itens) { const s = simDesc(r.descricao, it.descricao); if (s > ms) { ms = s; melhor = it; } }
    porChave.set(k, ms >= MIN_SIM ? { numero: Number(melhor.numero), sim: ms } : { numero: null, sim: ms });
  }
  return regs.map((r) => {
    const m = porChave.get(r.lote ?? r.item);
    return { ...r, numero: m?.numero ?? null, simItem: m?.sim ?? 0 };
  });
}

function parseLayout1(t) {
  const cabs = [...t.matchAll(LOTE)].map((m) => ({
    lote: parseInt(m[1], 10),
    nItens: parseInt(m[2], 10),
    item: parseInt(m[3], 10),
    unidade: m[4].trim(),
    descricao: m[5].trim().slice(0, 400),
    quantidade: num(m[6]),
    ini: m.index + m[0].length,
    fim: 0,
  }));
  for (let i = 0; i < cabs.length; i++) cabs[i].fim = i + 1 < cabs.length ? cabs[i + 1].ini - cabs[i + 1].descricao.length - 120 : t.length;

  const out = [];
  for (const c of cabs) {
    const bloco = t.slice(c.ini, Math.max(c.ini, c.fim));
    const vistos = new Set();
    for (const m of bloco.matchAll(LIC)) {
      const cnpj = limpaCnpj(m[2]);
      if (vistos.has(cnpj)) continue;   // o mesmo licitante repete entre páginas
      vistos.add(cnpj);
      const nome = (m[1] || "").replace(CAB_RESID, "").trim().replace(/[,;.\-]+$/, "");
      const blob = m[5].trim().replace(/\s+/g, " ");
      const bt = blob ? blob.split(" ") : [];
      out.push({
        // 🔑 a CHAVE é o LOTE (o `Item:` é sempre 1 neste documento)
        lote: c.lote, item: c.item, numero: c.lote,
        unidade: c.unidade, descricao: c.descricao, quantidade: c.quantidade,
        fornecedor: nome ? nome.slice(0, 160) : null,
        cnpj,
        valorUnitario: num(m[3]),
        situacao: m[4].trim(),
        vencedor: /vencedor/i.test(m[4]),
        marca: bt.length ? normalizaMarca(bt[0]) : null,
        modelo: bt.length > 1 ? normalizaMarca(bt.slice(1).join(" ")) : null,
        layout: 1,
      });
    }
  }
  return out;
}
