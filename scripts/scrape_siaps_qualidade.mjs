// SIAPS público — classificação oficial do Componente de Qualidade (novo cofinanciamento, Port. 3.493/2024) por município/equipe/faixa.
// API REST pública: POST apisiaps.saude.gov.br/api/public/componente/indicador-quadrimestre/filtro {uf:["SC"],nuQuadrimestre:[...],coMunicipioIbge:[]}
import fs from "fs";
const B = "https://apisiaps.saude.gov.br/api/public/componente/indicador-quadrimestre/filtro";
const uf = process.argv[2] || "SC";
const quads = (process.argv[3] || "2025Q2,2025Q3,2026Q1").split(",");
const out = {}; // cod6 -> quad -> equipe -> {otimo,bom,suf,reg,total}   (classificação final QUALIDADE)
const cvat = {}; // cod6 -> quad -> equipe -> {otimo,bom,suf,reg,total}   (VÍNCULO/CVAT)
const ind = {}; // cod6 -> quad -> coTipoIndicador -> {nome,equipe,otimo,bom,suf,reg}   (por indicador)
for (const q of quads) {
  const r = await fetch(B, { method: "POST", headers: { "Content-Type": "application/json", "Origin": "https://siaps.saude.gov.br", "Referer": "https://siaps.saude.gov.br/", "User-Agent": "Mozilla/5.0" }, body: JSON.stringify({ uf: [uf], nuQuadrimestre: [q], coMunicipioIbge: [] }) });
  if (!r.ok) { console.log(q, "HTTP", r.status); continue; }
  const j = await r.json();
  const qual = (j.classificacaoFinalComponente || []).filter((x) => x.tipoOrigem === "QUALIDADE");
  for (const x of qual) {
    const c = x.coMunicipioIbge;
    (out[c] ||= {}); (out[c][q] ||= {});
    out[c][q][x.sgEquipe] = { otimo: x.qtdClassificacaoOtimo || 0, bom: x.qtdClassificacaoBom || 0, suf: x.qtdClassificacaoSuficiente || 0, reg: x.qtdClassificacaoRegular || 0, total: x.totalEquipesValidasParaComponente || 0 };
  }
  const cvatRows = (j.classificacaoFinalComponente || []).filter((x) => x.tipoOrigem === "CVAT");
  for (const x of cvatRows) {
    const c = x.coMunicipioIbge; (cvat[c] ||= {}); (cvat[c][q] ||= {});
    cvat[c][q][x.sgEquipe] = { otimo: x.qtdClassificacaoOtimo || 0, bom: x.qtdClassificacaoBom || 0, suf: x.qtdClassificacaoSuficiente || 0, reg: x.qtdClassificacaoRegular || 0, total: x.totalEquipesValidasParaComponente || 0 };
  }
  for (const x of (j.conceitoPorIndicadorQualidade || [])) {
    const c = x.coMunicipioIbge; (ind[c] ||= {}); (ind[c][q] ||= {});
    const k = x.coTipoIndicador;
    const o = ind[c][q][k] ||= { nome: x.noIndicador, equipe: x.sgEquipe, otimo: 0, bom: 0, suf: 0, reg: 0 };
    o.otimo += x.qtdClassificacaoOtimo || 0; o.bom += x.qtdClassificacaoBom || 0; o.suf += x.qtdClassificacaoSuficiente || 0; o.reg += x.qtdClassificacaoRegular || 0;
  }
  console.log(`${q}: ${qual.length} classificações · ${(j.conceitoPorIndicadorQualidade || []).length} conceitos (${new Set(qual.map(x => x.coMunicipioIbge)).size} munis)`);
}
fs.writeFileSync(`scripts/_dados/qualidade_siaps_${uf}.json`, JSON.stringify(out));
fs.writeFileSync(`scripts/_dados/qualidade_indicadores_${uf}.json`, JSON.stringify(ind));
fs.writeFileSync(`scripts/_dados/vinculo_cvat_${uf}.json`, JSON.stringify(cvat));
// resumo Floripa eSF
const fl = out["420540"];
if (fl) for (const [q, eq] of Object.entries(fl)) if (eq.eSF) console.log(`  Floripa ${q} eSF:`, JSON.stringify(eq.eSF));
console.log(`✔ salvo qualidade_siaps_${uf}.json · ${Object.keys(out).length} municípios`);
