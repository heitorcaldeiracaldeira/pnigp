// PROBE (read-only) — cataloga a superfície da API CADPREV (apicadprev.trabalho.gov.br).
// Para cada recurso: status HTTP, se exige dt_exercicio, nomes dos campos e o campo identificador
// do ente (no_ente / nr_cnpj_entidade). Serial + backoff (código 420 = throttle). NÃO grava no banco.
//   UF=SC node scripts/probe_cadprev.mjs   → imprime manifesto e salva em scripts/.cadprev_manifesto.json
import fs from "fs"; import path from "path"; import { fileURLToPath } from "url";
import { SG_UF } from "./_uf.mjs";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const API_BASE = "https://apicadprev.trabalho.gov.br";
const ANO = Number(process.env.ANO_PROBE || (new Date().getFullYear() - 1)); // exercício de teste

// Os 38 recursos do CADPREV (fonte: catálogo ODA + verificação ao vivo).
const RECURSOS = [
  "RPPS_CRP", "RPPS_ALIQUOTA", "RPPS_REGIME_PREVIDENCIARIO",
  "DAIR_IDENTIFICACAO", "DAIR_CARTEIRA", "DAIR_APLICACOES_RESGATE", "DAIR_FORMA_GESTAO",
  "DAIR_FUNDO_INVEST_ANALISADOS", "DAIR_GOVERNANCA", "DAIR_INSTITUICAO_CREDENCIADA", "DAIR_REGIME_ATA",
  "DIPR",
  "DRAA_BASE_CALCULO_AMORTIZACAO", "DRAA_BASE_CALCULO_ENTE", "DRAA_COMPARATIVO_AVALIACAO",
  "DRAA_COMPARATIVO_RECEITA", "DRAA_CONTRIBUICAO", "DRAA_CUSTO_NORMAL_BENEF_CAPIT",
  "DRAA_CUSTO_NORMAL_BENEF_COB", "DRAA_CUSTO_NORMAL_REP_APOS", "DRAA_CUSTO_NORMAL_REP_AUX",
  "DRAA_DADOS_CONSOLIDADOS", "DRAA_ENCAMINHAMENTO", "DRAA_ESTATISTICA", "DRAA_FLUXO_ATUARIAL",
  "DRAA_FORMA_AMORTIZACAO", "DRAA_HIPOTESE_ATUARIAL", "DRAA_HIPOTESE_BIOMETRICA", "DRAA_NOTIFICACAO",
  "DRAA_ORGAO_ENTIDADE", "DRAA_PARECER_ATUARIAL", "DRAA_PLANO_AMORTIZACAO",
  "DRAA_PLANO_AMORTIZACAO_DEFICIT", "DRAA_PLANO_BENEFICIO", "DRAA_PLANO_CUSTEIO",
  "DRAA_RETIFICACAO_NOTIFICACAO", "DRAA_SEGREGACAO_MASSA", "DRAA_VALORES_COMPROMISSOS",
];

const sleep = (ms) => new Promise((s) => setTimeout(s, ms));
const ID_FIELDS = ["no_ente", "nr_cnpj_entidade", "co_ente", "sg_uf", "id_ente"];

// 1 requisição com backoff progressivo p/ 420/erro de rede. Retorna {status, body|null}.
async function get(url) {
  for (let t = 0; t < 5; t++) {
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(45000) });
      if (r.status === 420 || r.status === 429 || r.status >= 500) { await sleep(2500 * (t + 1)); continue; }
      let body = null; try { body = await r.json(); } catch {}
      return { status: r.status, body };
    } catch { await sleep(2500 * (t + 1)); }
  }
  return { status: 0, body: null };
}

// sonda 1 recurso: tenta sem exercício; se vier vazio/erro, tenta com dt_exercicio.
async function probe(rec) {
  const u1 = `${API_BASE}/${rec}?sg_uf=${SG_UF}&limit=1&offset=0`;
  let res = await get(u1), usouAno = false;
  let data = res.body?.data;
  if (res.status === 200 && (!Array.isArray(data) || data.length === 0)) {
    await sleep(1200);
    const u2 = `${API_BASE}/${rec}?sg_uf=${SG_UF}&dt_exercicio=${ANO}&limit=1&offset=0`;
    const res2 = await get(u2);
    if (res2.status === 200 && Array.isArray(res2.body?.data) && res2.body.data.length) { res = res2; data = res2.body.data; usouAno = true; }
  }
  const rec0 = Array.isArray(data) && data.length ? data[0] : null;
  const campos = rec0 ? Object.keys(rec0) : [];
  return {
    recurso: rec,
    status: res.status,
    ok: res.status === 200 && !!rec0,
    exige_exercicio: usouAno,
    count: res.body?.count ?? null,
    id_ente: ID_FIELDS.filter((f) => campos.includes(f)),
    campos,
  };
}

async function main() {
  const manifesto = [];
  console.log(`Sondando ${RECURSOS.length} recursos CADPREV · UF=${SG_UF} · exercício-teste=${ANO}\n`);
  for (const rec of RECURSOS) {
    const m = await probe(rec);
    manifesto.push(m);
    const tag = m.ok ? "OK " : (m.status === 200 ? "VAZIO" : `HTTP ${m.status}`);
    console.log(`${tag.padEnd(8)} ${m.recurso.padEnd(32)} ${m.exige_exercicio ? "[exerc] " : "        "}id=${m.id_ente.join("/") || "-"} · ${m.campos.length} campos`);
    if (m.ok) console.log(`         campos: ${m.campos.join(", ")}`);
    await sleep(1500); // espaçamento p/ não bater no throttle 420
  }
  const out = path.join(__dirname, ".cadprev_manifesto.json");
  fs.writeFileSync(out, JSON.stringify(manifesto, null, 2));
  const okN = manifesto.filter((m) => m.ok).length;
  console.log(`\n${okN}/${RECURSOS.length} recursos responderam com dados. Manifesto salvo em ${out}`);
}
main().catch((e) => { console.error("ERRO:", e); process.exit(1); });
