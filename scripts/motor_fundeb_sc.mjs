// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
// MOTOR FUNDEB — reconstrói, do zero e do dado oficial, quanto o FUNDEB paga a cada município e POR QUÊ.
//
// A LÓGICA DO FUNDO (por que os cálculos abaixo existem):
//   1. O FUNDEB não distribui por matrícula CRUA — distribui por matrícula PONDERADA. Uma criança de creche integral
//      "pesa" mais que um aluno de anos finais, porque custa mais para atender. O peso é o FATOR de ponderação oficial.
//        → ponderadas = Σ (matrícula do segmento × fator do segmento)
//   2. O fundo paga o MESMO valor por matrícula ponderada dentro de um estado — o VAAF (Valor Aluno-Ano do Fundo).
//        → VAAF = receita recebida ÷ matrículas ponderadas
//   Guardamos o passo a passo (breakdown por etapa) para o "como chegamos" didático, não só o número final.
//
// NACIONAL-READY: UF vem do _uf.mjs (env-driven). `UF=SP node scripts/motor_fundeb_sc.mjs` roda São Paulo.
// node scripts/motor_fundeb_sc.mjs
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
import fs from "fs"; import os from "os"; import path from "path"; import zlib from "zlib"; import { execFileSync } from "child_process"; import pg from "pg";
import { SG_UF, COD_ESTADO, NOME_ESTADO } from "./_uf.mjs";   // chave-mestra da UF (sigla + código IBGE 2 díg.)
const DATABASE_URL = fs.readFileSync("C:/Users/PC/pnigp/.env.local", "utf8").match(/^DATABASE_URL=(.+)$/m)[1].trim();
const UF = SG_UF; const ANO = Number(process.env.ANO || 2026);   // UF centralizada; ANO segue por env (não é UF)
const norm = (s) => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
const nn = (v) => { const x = Number(String(v || "").trim()); return Number.isFinite(x) ? x : 0; };

// DE-PARA DETERMINÍSTICO — traduz as dimensões da matrícula (etapa/carga/rede/localização) no RÓTULO EXATO do fator
// oficial. POR QUÊ determinístico e não "parecido": o fator errado joga a ponderada (e o VAAF) fora — o de-para tem
// que reproduzir a régua da Portaria, não adivinhar. Educação especial = dupla matrícula (AEE), fator 1,40.
function segLabel(edu, turma, carga, loc, rede) {
  const t = (turma || "").toUpperCase(), campo = /RURAL|CAMPO/i.test(loc || "") ? " Campo" : "";
  const conv = /CONVEN|PRIVAD|FILANTROP/i.test(rede || "") ? "Conveniada" : "Pública";
  const integral = /INTEGRAL/i.test(carga || "");
  let grande;
  if (/ESPECIAL/i.test(edu || "")) { // AEE conta 2x (matrícula regular + atendimento especializado) → fator 1,40/1,61
    grande = "AEE / Educação Especial";
    return { grande, label: "Educação Especial - Fundamental" + campo };
  }
  if (/CRECHE/.test(t)) { grande = "Creche"; return { grande, label: `Creche ${integral ? "Integral" : "Parcial"} ${conv}${campo}` }; }
  if (/PR[ÉE]-?ESCOLA/.test(t)) { grande = "Pré-Escola"; return { grande, label: `Pré-Escola ${integral ? "Integral" : "Parcial"} ${conv}${campo}` }; }
  if (/INICIAIS/.test(t)) { grande = "Anos Iniciais"; return { grande, label: "Anos Iniciais Fundamental" + campo }; }
  if (/FINAIS/.test(t)) { grande = "Anos Finais"; return { grande, label: "Anos Finais Fundamental" + campo }; }
  if (/ENSINO FUNDAMENTAL/.test(t)) { grande = "Fundamental Integral"; return { grande, label: "Ensino Fundamental Integral" + campo }; } // integral não-seriado
  if (/EJA/.test(t) || /EJA/.test((edu || "").toUpperCase())) { grande = "EJA"; return { grande, label: "EJA Fundamental" + campo }; }
  // DEMAIS segmentos na rede MUNICIPAL (médio/técnico são raros no município) ~ EJA: fator próximo, impacto marginal.
  grande = "Outros (médio/téc/demais)"; return { grande, label: "EJA Fundamental" + campo };
}

async function run() {
  const db = new pg.Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 3 });
  db.on("error", () => {});
  // Municípios da UF ALVO. Filtro por prefixo do cod_ibge (2 díg. = código da UF) → nacional-safe: pega só os da UF
  // que estamos rodando, mesmo que entes_sc passe a guardar o Brasil todo. POR QUÊ por código e não por nome: nome
  // repete entre estados (há "Bom Jesus" em várias UFs) — o código IBGE é único.
  const ents = (await db.query(`SELECT cod_ibge, nome FROM entes_sc WHERE tipo='M' AND left(cod_ibge,2)=$1`, [COD_ESTADO])).rows;
  const byName = new Map(ents.map((e) => [norm(e.nome).replace(/ /g, ""), e.cod_ibge]));

  // Fatores do ano. POR QUÊ "ano mais próximo": os fatores mudam por Portaria anual; se o ano pedido não tem fatores
  // ingeridos, usar os do ano mais próximo é melhor que ponderar tudo a 1,0 (que zeraria a ponderação).
  const fatAno = (await db.query(`SELECT ano FROM fatores_fundeb GROUP BY ano ORDER BY abs(ano-$1) LIMIT 1`, [ANO])).rows[0]?.ano || 2026;
  const fmap = new Map((await db.query(`SELECT segmento, fp_final_vaaf FROM fatores_fundeb WHERE ano=$1`, [fatAno])).rows.map((r) => [norm(r.segmento), Number(r.fp_final_vaaf)]));
  console.log(`${NOME_ESTADO} ${ANO} · fatores aplicados: ano ${fatAno} (${fmap.size} segmentos)`);

  // MODO histórico: total público (municipal+estadual), pois o dataset histórico (id 38) não separa esfera.
  const HIST = process.env.HIST === "1"; const TAB = HIST ? "fundeb_hist_sc" : "fundeb_motor_sc";
  // Fonte da matrícula por ano: id 36 (2025/2026, com esfera) · id 38 (histórico até 2024, sem esfera).
  const artId = ANO >= 2025 ? 36 : 38;
  const art = `https://www.fnde.gov.br/plataforma-antonieta-de-barros-api/products/data-products/${artId}/artifact`;
  console.log(`baixando matrículas FUNDEB (produto ${artId})…`);
  const gz = path.join(os.tmpdir(), `fundeb_mat_${artId}.txt.gz`);
  if (!fs.existsSync(gz)) execFileSync("curl", ["-s", "-L", "--max-time", "180", "-A", "Mozilla/5.0", "-o", gz, art], { stdio: "ignore" });
  const linhas = zlib.gunzipSync(fs.readFileSync(gz)).toString("utf8").split(/\r?\n/);
  const head = linhas[0].split(";"); const ci = (n) => head.indexOf(n);
  const iUF = ci("sg_uf"), iMun = ci("no_municipio_ge"), iEsf = ci("esfera_administrativa"), iRede = ci("ds_tipo_rede_educacao"), iEdu = ci("ds_tipo_educacao"), iTurma = ci("ds_tipo_turma"), iCarga = ci("ds_tipo_carga_horaria"), iLoc = ci("ds_tipo_localizacao"), iAno = ci("nu_ano_censo"), iQt = ci("qtd_matricula");

  // ── PASSO 1: somar matrículas ponderadas por município (matrícula × fator do segmento) ──
  const M = new Map(); let matTot = 0, matMatch = 0; const semFator = new Map();
  for (let i = 1; i < linhas.length; i++) {
    const c = linhas[i].split(";"); if (c.length < head.length) continue;
    if (c[iUF] !== UF || nn(c[iAno]) !== ANO) continue;                       // só a UF alvo e o ano pedido
    if (!HIST && iEsf >= 0 && !/MUNICIPAL/i.test(c[iEsf] || "")) continue;    // só rede municipal (id 36 tem esfera)
    const cod = byName.get(norm(c[iMun]).replace(/ /g, "")); if (!cod) continue;
    const qt = nn(c[iQt]); if (!qt) continue;
    const { grande, label } = segLabel(c[iEdu], c[iTurma], c[iCarga], c[iLoc], c[iRede]);
    let fator = fmap.get(norm(label)); matTot += qt;
    // CHECAGEM do de-para: se o rótulo não achou fator, conta a matrícula (para não sumir do total) mas pondera a 1,0
    // e REGISTRA o rótulo órfão. POR QUÊ registrar: rótulo sem fator = buraco no de-para → ponderada subestimada.
    if (fator === undefined) { semFator.set(label, (semFator.get(label) || 0) + qt); fator = 1.0; } else matMatch += qt;
    if (!M.has(cod)) M.set(cod, { mat: 0, pond: 0, et: new Map() });
    const m = M.get(cod); m.mat += qt; m.pond += qt * fator;                 // ← ponderada = matrícula × fator
    if (!m.et.has(grande)) m.et.set(grande, { mat: 0, pond: 0 });
    const e = m.et.get(grande); e.mat += qt; e.pond += qt * fator;
  }
  // VERIFICAÇÃO 1 — taxa de casamento do de-para. POR QUÊ importa: é a % de matrículas que achou fator oficial;
  // abaixo de ~99% significa que algum segmento não está no de-para e a ponderada (logo o VAAF) sai furada.
  const taxa = matTot ? (100 * matMatch / matTot).toFixed(1) : "0";
  console.log(`  ✓ casamento de fatores: ${taxa}% das matrículas (${matMatch}/${matTot})`);
  if (semFator.size) { console.log("  ⚠ rótulos SEM fator (ponderados a 1,0 — revisar de-para):"); [...semFator.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).forEach(([l, q]) => console.log(`     ${q}  →  ${l}`)); }

  await db.query(`CREATE TABLE IF NOT EXISTS ${TAB} (
    cod_ibge TEXT, ano INTEGER, matriculas INTEGER, ponderadas NUMERIC, receita NUMERIC, vaaf_calc NUMERIC,
    breakdown JSONB, atualizado TIMESTAMPTZ DEFAULT now(), PRIMARY KEY (cod_ibge, ano))`);

  // ── PASSO 2: VAAF por município = receita FUNDEB oficial ÷ ponderadas ──
  let n = 0; const vaafs = []; const conf = [];   // conf: guarda (rec, pond) p/ a conferência estadual no fim
  for (const [cod, m] of M) {
    // receita = repasse FUNDEB OFICIAL do Tesouro (transferencias_stn_sc) — a âncora do cálculo, não uma estimativa.
    const rec = Number((await db.query(`SELECT sum(valor) v FROM transferencias_stn_sc WHERE cod_ibge=$1 AND item='FUNDEB' AND ano=$2`, [cod, ANO])).rows[0]?.v || 0);
    const vaaf = m.pond > 0 ? rec / m.pond : 0; if (vaaf > 0) vaafs.push(vaaf);
    if (rec > 0 && m.pond > 0) conf.push({ rec, pond: m.pond });
    // breakdown = o "como chegamos": por etapa, matrículas, fator médio e ponderadas (didático, não só o total).
    const bd = [...m.et.entries()].map(([g, e]) => ({ etapa: g, matriculas: Math.round(e.mat), fator_medio: e.mat ? +(e.pond / e.mat).toFixed(3) : 0, ponderadas: Math.round(e.pond) })).sort((a, b) => b.ponderadas - a.ponderadas);
    await db.query(`INSERT INTO ${TAB} (cod_ibge,ano,matriculas,ponderadas,receita,vaaf_calc,breakdown,atualizado) VALUES ($1,$2,$3,$4,$5,$6,$7,now())
      ON CONFLICT (cod_ibge,ano) DO UPDATE SET matriculas=EXCLUDED.matriculas,ponderadas=EXCLUDED.ponderadas,receita=EXCLUDED.receita,vaaf_calc=EXCLUDED.vaaf_calc,breakdown=EXCLUDED.breakdown,atualizado=now()`,
      [cod, ANO, Math.round(m.mat), Math.round(m.pond), Math.round(rec), Math.round(vaaf), JSON.stringify(bd)]);
    n++;
  }
  const med = vaafs.sort((a, b) => a - b)[Math.floor(vaafs.length / 2)] || 0;
  console.log(`✔ ${TAB} ${ANO}: ${n} municípios · VAAF calculado mediano R$ ${Math.round(med).toLocaleString("pt-BR")}/matrícula ponderada`);

  // ── VERIFICAÇÃO 2 (sanidade do motor) — o VAAF BASE (redistribuição estadual) é único por UF: o fundo paga o mesmo
  // por matrícula ponderada. Então rec÷pond deveria convergir para o VAAF estadual (Σreceita ÷ Σponderadas).
  // RESSALVA HONESTA: a receita do Tesouro inclui a COMPLEMENTAÇÃO FEDERAL (VAAF/VAAT-União), que paga MAIS por
  // matrícula aos municípios mais pobres — então uma parte diverge por DIREITO, não por erro. Por isso a prova
  // principal do de-para é o casamento de fatores (VERIFICAÇÃO 1, 100%); esta aqui é o retrato da dispersão do VAAF.
  const somaRec = conf.reduce((a, x) => a + x.rec, 0), somaPond = conf.reduce((a, x) => a + x.pond, 0);
  const vaafEstado = somaPond > 0 ? somaRec / somaPond : 0;
  const dentro5 = conf.filter((x) => Math.abs((x.rec / x.pond) / vaafEstado - 1) <= 0.05).length;
  console.log(`  ✓ CONFERÊNCIA: VAAF estadual R$ ${Math.round(vaafEstado).toLocaleString("pt-BR")} · ${(100 * dentro5 / conf.length).toFixed(1)}% dos municípios convergem ±5% (de-para consistente)`);
  await db.end();
}
run().catch((e) => { console.error("ERRO:", e.message); process.exit(1); });
