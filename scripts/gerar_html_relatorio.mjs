import fs from "fs";

const DATA_PATH = "C:\\Users\\PC\\AppData\\Local\\Temp\\claude\\C--Users-PC\\ab8427a5-adc4-4a46-928f-f8b9e497905b\\scratchpad\\relatorio_estatais.json";
const data = JSON.parse(fs.readFileSync(DATA_PATH, "utf8"));

const REGIOES = {
  "Norte": ["AC","AP","AM","PA","RO","RR","TO"],
  "Nordeste": ["AL","BA","CE","MA","PB","PE","PI","RN","SE"],
  "Centro-Oeste": ["DF","GO","MS","MT"],
  "Sudeste": ["ES","MG","RJ","SP"],
  "Sul": ["PR","RS","SC"],
};

function esc(s) {
  if (s == null) return "";
  return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
}
function fmtBRL(v) {
  if (v == null || isNaN(v)) return null;
  return "R$\u00A0" + Number(v).toLocaleString("pt-BR", {minimumFractionDigits:2, maximumFractionDigits:2});
}
function titleCase(s) {
  if (!s) return s;
  const small = new Set(["de","da","do","das","dos","e"]);
  return s.toLowerCase().split(" ").map((w,i) => small.has(w) && i>0 ? w : w.charAt(0).toUpperCase()+w.slice(1)).join(" ");
}

// agrupar "todos" por UF > empresa
const byUf = {};
for (const r of data.todos) {
  byUf[r.uf] = byUf[r.uf] || {};
  byUf[r.uf][r.empresa_sigla || r.empresa_nome] = byUf[r.uf][r.empresa_sigla || r.empresa_nome] || [];
  byUf[r.uf][r.empresa_sigla || r.empresa_nome].push(r);
}

// ---------- TOP 20 ----------
let topHtml = "";
data.top25.forEach((r, i) => {
  topHtml += `<li class="rank-row">
    <span class="rank-n">${i+1}</span>
    <span class="rank-who"><strong>${esc(titleCase(r.nome))}</strong><span class="rank-org">${esc(r.empresa_sigla)} &middot; ${esc(r.uf)}</span></span>
    <span class="rank-val">${esc(fmtBRL(r.valor_num))}<span class="rank-unit">/mês</span></span>
  </li>\n`;
});

// ---------- PAINEL POR ESTADO (accordions agrupados por regiao) ----------
let paineisHtml = "";
for (const [regiao, ufs] of Object.entries(REGIOES)) {
  paineisHtml += `<div class="regiao-grupo">\n<h3 class="regiao-titulo">${esc(regiao)}</h3>\n<div class="uf-grid">\n`;
  for (const uf of ufs.slice().sort()) {
    const resumo = data.resumo_por_uf[uf];
    if (!resumo) continue;
    const empresas = byUf[uf] || {};
    const nomesEmpresas = Object.keys(empresas).sort();
    let linhasEmpresas = "";
    for (const sigla of nomesEmpresas) {
      const regs = empresas[sigla];
      for (const r of regs) {
        const valorStr = r.valor_num ? fmtBRL(r.valor_num) : null;
        linhasEmpresas += `<tr>
          <td class="td-empresa">${esc(sigla)}</td>
          <td class="td-nome">${esc(titleCase(r.nome))}<span class="td-cargo">${esc(r.cargo || "")}</span></td>
          <td class="td-valor">${valorStr ? esc(valorStr) : '<span class="sem-valor">não publicado</span>'}</td>
        </tr>\n`;
      }
    }
    const pct = resumo.total_empresas ? Math.round(100*resumo.com_valor/resumo.total_empresas) : 0;
    paineisHtml += `<details class="uf-card">
      <summary>
        <span class="uf-sigla">${esc(uf)}</span>
        <span class="uf-nome">${esc(resumo.uf_nome)}</span>
        <span class="uf-stats"><strong>${resumo.total_empresas}</strong> estatal${resumo.total_empresas===1?"":"is"} &middot; <strong>${resumo.com_valor}</strong> com valor</span>
        <span class="uf-bar" style="--pct:${pct}%"></span>
      </summary>
      <table class="uf-tabela">
        <thead><tr><th>Empresa</th><th>Dirigente</th><th>Remuneração</th></tr></thead>
        <tbody>${linhasEmpresas}</tbody>
      </table>
    </details>\n`;
  }
  paineisHtml += `</div></div>\n`;
}

fs.writeFileSync("C:\\Users\\PC\\pnigp\\scratch_top.html", topHtml);
fs.writeFileSync("C:\\Users\\PC\\pnigp\\scratch_paineis.html", paineisHtml);
console.log("Gerado. top bytes:", topHtml.length, "paineis bytes:", paineisHtml.length);
console.log("Total UFs no painel:", Object.keys(data.resumo_por_uf).length);
