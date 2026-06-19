// MOTOR DE DIAGNÓSTICO DO GESTOR — pontos de análise + sugestões acionáveis.
// Benchmark por GRUPO DE PARES (porte populacional) e ANO FECHADO (exclui ano em curso).
// Regras ancoradas em lei (LRF) / boa prática. node scripts/diagnostico_gestor.mjs [cod_ibge|nome]
import fs from "fs"; import pg from "pg";
const db = new pg.Pool({ connectionString: fs.readFileSync(new URL("../.env.local", import.meta.url), "utf8").match(/^DATABASE_URL=(.+)$/m)[1].trim(), ssl: { rejectUnauthorized: false }, max: 2 });

const ANO_CORRENTE = 2026; // ano em curso — excluído (não fechado)
const pct = (n) => (n * 100).toFixed(1) + "%";
const brl = (n) => "R$ " + Number(n).toLocaleString("pt-BR", { maximumFractionDigits: 0 });
const median = (a) => { const s = a.filter((x) => x != null && isFinite(x)).sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : 0; };
const faixa = (p) => (!p ? "s/pop" : p >= 100000 ? "acima_100k" : p >= 50000 ? "50_100k" : p >= 20000 ? "20_50k" : p >= 10000 ? "10_20k" : "ate_10k");
const ratios = (r) => ({
  auto: +r.tributaria / +r.receita,
  deptransf: +r.transferencias / +r.receita,
  pess: +r.pessoal / +r.receita,
  inv: +r.investimento / +r.despesa,
  eq: +r.resultado / +r.receita,
  rigidez: (+r.pessoal + +r.custeio) / +r.despesa,
});

async function main() {
  // 1) base do ANO FECHADO por ente (último ano <= ANO_CORRENTE-1, dado íntegro)
  const fin = (await db.query(
    `SELECT DISTINCT ON (f.cod_ibge) f.cod_ibge, f.ano, e.nome, e.populacao,
            f.receita,f.tributaria,f.transferencias,f.despesa,f.resultado,f.pessoal,f.custeio,f.investimento
       FROM financas_sc f JOIN entes_sc e ON e.cod_ibge=f.cod_ibge
      WHERE f.suspeito IS NOT TRUE AND f.receita>0 AND f.ano <= ${ANO_CORRENTE - 1} AND e.tipo='M'
      ORDER BY f.cod_ibge, f.ano DESC`)).rows;

  // 2) medianas por GRUPO DE PARES
  const grupos = {};
  for (const r of fin) { const g = faixa(r.populacao); (grupos[g] ??= []).push(ratios(r)); }
  const bench = {};
  for (const g in grupos) bench[g] = { auto: median(grupos[g].map((x) => x.auto)), deptransf: median(grupos[g].map((x) => x.deptransf)), pess: median(grupos[g].map((x) => x.pess)), inv: median(grupos[g].map((x) => x.inv)), eq: median(grupos[g].map((x) => x.eq)), rigidez: median(grupos[g].map((x) => x.rigidez)) };

  // 3) escolher ente(s) p/ demonstrar
  const arg = process.argv[2];
  let alvos;
  if (arg) alvos = fin.filter((r) => r.cod_ibge === arg || r.nome?.toLowerCase().includes(arg.toLowerCase())).slice(0, 1);
  else { // um por faixa (representativos)
    const porFaixa = {}; for (const r of fin) { const g = faixa(r.populacao); if (!porFaixa[g]) porFaixa[g] = r; }
    alvos = ["acima_100k", "20_50k", "ate_10k"].map((g) => porFaixa[g]).filter(Boolean);
  }

  for (const alvo of alvos) {
    const g = faixa(alvo.populacao); const b = bench[g]; const r = ratios(alvo);
    const disp = (await db.query(`SELECT dispensa_pct FROM compras_sc WHERE cod_ibge=$1 AND ano<=${ANO_CORRENTE - 1} ORDER BY ano DESC LIMIT 1`, [alvo.cod_ibge])).rows[0];
    const meta = (await db.query(`SELECT ano,meta_primario,resultado_primario,dcl_inicio,dcl_fim FROM metas_fiscais_sc WHERE cod_ibge=$1 ORDER BY ano DESC LIMIT 1`, [alvo.cod_ibge])).rows[0];
    // RREO constitucional (base LEGAL): RCL real (Anexo 03) + educação MDE (Anexo 14) — prefere o mesmo ano da finança fechada
    const rc = (await db.query(`SELECT ano,educacao_pct,educacao_min,fundeb_pct,rcl FROM rreo_const_sc WHERE cod_ibge=$1 AND (rcl IS NOT NULL OR educacao_pct IS NOT NULL) ORDER BY (ano=$2) DESC, ano DESC LIMIT 1`, [alvo.cod_ibge, alvo.ano])).rows[0];
    const pessRCL = rc?.rcl ? +alvo.pessoal / +rc.rcl : null;
    // RGF — número OFICIAL de pessoal por Poder (Executivo) e DCL (o que o TCE usa)
    const rg = (await db.query(`SELECT ano,pessoal_pct,limite_pct,dcl_pct FROM rgf_sc WHERE cod_ibge=$1 AND pessoal_pct IS NOT NULL AND suspeito IS NOT TRUE ORDER BY (ano=$2) DESC, ano DESC LIMIT 1`, [alvo.cod_ibge, alvo.ano])).rows[0];

    console.log(`\n═══════════ DIAGNÓSTICO — ${alvo.nome} (${Number(alvo.populacao).toLocaleString("pt-BR")} hab · grupo ${g}) · exercício fechado ${alvo.ano} ═══════════`);
    const P = [];
    const low = (v, m) => v < m * 0.85, high = (v, m) => v > m * 1.15;
    P.push(["Autonomia tributária", pct(r.auto), `pares ${pct(b.auto)}`, low(r.auto, b.auto), "Arrecadação própria abaixo dos pares → recuperar dívida ativa e atualizar planta de valores (IPTU/ISS); menos dependência de repasses."]);
    P.push(["Dependência de transferências", pct(r.deptransf), `pares ${pct(b.deptransf)}`, high(r.deptransf, b.deptransf), "Dependência acima dos pares → diversificar receita própria; vulnerável a cortes de repasse."]);
    // Pessoal/RCL — base LEGAL (RREO Anexo 03) quando disponível; senão proxy s/ receita. Bandas LRF: alerta 48,6% · prud. 51,3% · limite 54%.
    if (rg?.pessoal_pct != null) { // OFICIAL — RGF (Executivo, % sobre RCL Ajustada)
      const pp = +rg.pessoal_pct;
      const pMsg = pp > 54 ? "ACIMA do limite LRF (54%) → recondução obrigatória (art. 23) e vedação a reajustes/contratações (art. 22)." : pp > 51.3 ? "Acima do limite PRUDENCIAL (51,3%) → vedações do parágrafo único do art. 22 aplicáveis." : pp > 48.6 ? "No limite de ALERTA da LRF (48,6%) — o TCE-SC notifica nessa faixa." : "Dentro dos limites da LRF.";
      P.push([`Pessoal Executivo / RCL (oficial RGF ${rg.ano})`, pct(pp / 100), `LRF: alerta 48,6% · prud. 51,3% · limite 54%`, pp > 48.6, pMsg]);
    } else { // ainda sem RGF: estimativa (indício), confirmar no RGF
      const pv = pessRCL ?? r.pess; const pBase = pessRCL != null ? "RCL real, mun.-total" : "proxy s/ receita";
      const pMsg = pv > 0.54 ? "Indício acima do teto LRF → confirmar no RGF (limite Exec. 54%)." : pv > 0.513 ? "Indício acima do prudencial (51,3%) → confirmar no RGF." : pv > 0.486 ? "Faixa de alerta — confirmar no RGF." : "Dentro dos limites (estimativa).";
      P.push([`Pessoal / RCL (${pBase} — aguardando RGF)`, pct(pv), `LRF: alerta 48,6% · prud. 51,3% · limite 54%`, pv > 0.486, pMsg]);
    }
    P.push(["Taxa de investimento", pct(r.inv), `pares ${pct(b.inv)}`, low(r.inv, b.inv), "Investimento abaixo dos pares → revisar execução de obras e restos a pagar; baixo investimento reduz entrega à população."]);
    P.push(["Rigidez da despesa (pessoal+custeio)", pct(r.rigidez), `pares ${pct(b.rigidez)}`, high(r.rigidez, b.rigidez), "Despesa muito rígida → pouca margem para investir; buscar eficiência no custeio."]);
    P.push(["Resultado orçamentário", pct(r.eq), brl(+alvo.resultado), r.eq < 0, "Déficit no exercício → ajustar despesa corrente ou reforçar receita; déficits recorrentes pressionam a dívida."]);
    if (disp) { const dp = +disp.dispensa_pct / 100; P.push(["Compras sem licitação", pct(dp), `valor por dispensa/inexig.`, dp > 0.30, "Fatia alta sem licitação → ampliar pregão/concorrência aumenta competição e reduz preço."]); }
    if (meta?.meta_primario != null && meta?.resultado_primario != null) { const ok = +meta.resultado_primario >= +meta.meta_primario; P.push([`Meta primária LDO (${meta.ano})`, ok ? "cumprida" : "NÃO cumprida", `meta ${brl(meta.meta_primario)} × real ${brl(meta.resultado_primario)}`, !ok, "Meta da LDO descumprida → revisar programação financeira; impacto na prestação de contas ao TCE."]); }
    if (rg?.dcl_pct != null) { const d = +rg.dcl_pct; P.push([`Dívida Consolidada Líquida / RCL (oficial RGF ${rg.ano})`, pct(d / 100), `limite 120% (Res. SF 40/2001)`, d > 120, "DCL acima do limite legal → recondução obrigatória e restrição a novas operações de crédito."]); }
    else if (meta?.dcl_inicio != null && meta?.dcl_fim != null) { const cresceu = +meta.dcl_fim > +meta.dcl_inicio && +meta.dcl_fim > 0; P.push([`Dívida Consolidada Líquida (${meta.ano})`, brl(meta.dcl_fim), `início ${brl(meta.dcl_inicio)}`, cresceu, "DCL crescente → monitorar capacidade de pagamento; evitar novo endividamento sem contrapartida."]); }

    if (rc?.educacao_pct != null) { const min = +rc.educacao_min || 25; P.push([`Aplicação em Educação (MDE · CF art. 212)`, pct(+rc.educacao_pct / 100), `mínimo ${min}% · ${rc.ano}`, +rc.educacao_pct < min, "Abaixo do mínimo constitucional de educação → risco de rejeição de contas pelo TCE; reforçar despesas de MDE."]); }
    if (rc?.fundeb_pct != null) { P.push([`FUNDEB em remuneração (mín. 70%)`, pct(+rc.fundeb_pct / 100), `mínimo 70% · ${rc.ano}`, +rc.fundeb_pct < 70, "Abaixo de 70% do FUNDEB em remuneração de profissionais → descumprimento legal a corrigir."]); }
    P.forEach((p, i) => { console.log(`${String(i + 1).padStart(2)}. ${p[0]}: ${p[1]} (${p[2]}) ${p[3] ? "⚠" : "✓"}`); if (p[3]) console.log(`    → ${p[4]}`); });
    console.log(`    SUGESTÕES PRIORITÁRIAS: ${P.filter((p) => p[3]).length} ponto(s) de atenção.`);
  }
  await db.end();
}
main().catch((e) => { console.error("ERRO:", e); process.exit(1); });
