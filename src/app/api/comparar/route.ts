import { NextResponse } from "next/server";
import { getRankingFiscalSC } from "@/lib/queries";
import { query } from "@/lib/db";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// Comparador dinâmico — ?list=1 devolve a lista de municípios (p/ o seletor); ?cods=a,b,c devolve os indicadores
// comparáveis dos 2–5 selecionados. Comparação analítica neutra (indicadores objetivos), sem ranking político.
export async function GET(req: Request) {
  try {
    const sp = new URL(req.url).searchParams;
    const rank = (await getRankingFiscalSC()).filter((r) => r.tipo === "M");

    if (sp.get("list")) {
      return NextResponse.json({ municipios: rank.map((r) => ({ cod: r.cod_ibge, nome: r.nome })).sort((a, b) => a.nome.localeCompare(b.nome)) });
    }

    const cods = (sp.get("cods") || "").split(",").map((c) => c.replace(/\D/g, "")).filter((c) => c.length === 7).slice(0, 5);
    if (cods.length < 2) return NextResponse.json({ itens: [], total: rank.length });

    const num = (v: unknown) => Number(v) || 0;
    const mapa = (rows: Record<string, unknown>[], f: (r: Record<string, unknown>) => Record<string, number>) => new Map(rows.map((r) => [String(r.cod_ibge), f(r)]));
    const [pops, sau, prev, edu, ideb, ass, com, conv, iegm2, san] = await Promise.all([
      query(`SELECT cod_ibge, populacao FROM entes_sc WHERE cod_ibge = ANY($1)`, [cods]),
      query(`SELECT DISTINCT ON (cod_ibge) cod_ibge, saude_pct, transf_uniao_pct FROM siops_sc WHERE cod_ibge = ANY($1) ORDER BY cod_ibge, ano DESC`, [cods]),
      query(`SELECT cod_ibge, avg(pct) prev FROM previne_sc WHERE cod_ibge = ANY($1) AND competencia = (SELECT max(competencia) FROM previne_sc) GROUP BY cod_ibge`, [cods]),
      query(`SELECT DISTINCT ON (cod_ibge) cod_ibge, educacao_pct, fundeb_pct FROM rreo_const_sc WHERE cod_ibge = ANY($1) AND educacao_pct IS NOT NULL ORDER BY cod_ibge, ano DESC`, [cods]),
      query(`SELECT DISTINCT ON (cod_ibge) cod_ibge, ideb FROM ideb_sc WHERE cod_ibge = ANY($1) AND rede ILIKE '%unicip%' ORDER BY cod_ibge, ano DESC, (etapa ILIKE '%inicia%') DESC`, [cods]),
      query(`SELECT cod_ibge, cras, hab_por_cras, cad_taxa_atualizacao, pbf_familias FROM assistencia_social_sc WHERE cod_ibge = ANY($1)`, [cods]),
      query(`SELECT DISTINCT ON (cod_ibge) cod_ibge, valor_homologado, n_contratos, dispensa_pct FROM compras_sc WHERE cod_ibge = ANY($1) ORDER BY cod_ibge, ano DESC`, [cods]),
      query(`SELECT cod_ibge, coalesce(sum(valor),0) celebrado, coalesce(sum(valor_liberado),0) liberado FROM convenios_captados_sc WHERE cod_ibge = ANY($1) GROUP BY cod_ibge`, [cods]),
      query(`SELECT cod_ibge, round(avg(pct)*100) iegm FROM iegm_sc WHERE cod_ibge = ANY($1) AND ano = (SELECT max(ano) FROM iegm_sc) GROUP BY cod_ibge`, [cods]),
      query(`SELECT cod_ibge, indicador, pct FROM saneamento_sc WHERE cod_ibge = ANY($1) AND ano = (SELECT max(ano) FROM saneamento_sc WHERE cod_ibge = ANY($1))`, [cods]),
    ]);
    const pop = new Map(pops.map((p) => [String(p.cod_ibge), num(p.populacao)]));
    const mSau = mapa(sau, (r) => ({ saudePct: num(r.saude_pct), transfUniao: num(r.transf_uniao_pct) }));
    const mPrev = mapa(prev, (r) => ({ previne: num(r.prev) }));
    const mEdu = mapa(edu, (r) => ({ educPct: num(r.educacao_pct), fundebPct: num(r.fundeb_pct) }));
    const mIdeb = mapa(ideb, (r) => ({ ideb: num(r.ideb) }));
    const mAss = mapa(ass, (r) => ({ cras: num(r.cras), habPorCras: num(r.hab_por_cras), cadAtualiza: num(r.cad_taxa_atualizacao), pbf: num(r.pbf_familias) }));
    const mCom = mapa(com, (r) => ({ comprasValor: num(r.valor_homologado), comprasN: num(r.n_contratos), dispensaPct: num(r.dispensa_pct) }));
    const mConv = mapa(conv, (r) => ({ convCelebrado: num(r.celebrado), convLiberado: num(r.liberado) }));
    const mIegm = mapa(iegm2, (r) => ({ iegm: num(r.iegm) }));
    const mSan = new Map<string, { agua: number; esgoto: number }>();
    for (const r of san) { const c = String(r.cod_ibge); if (!mSan.has(c)) mSan.set(c, { agua: 0, esgoto: 0 }); const ind = String(r.indicador).toLowerCase(); if (/[aá]gua/.test(ind)) mSan.get(c)!.agua = num(r.pct); if (/esgoto/.test(ind)) mSan.get(c)!.esgoto = num(r.pct); }

    const itens = cods.map((c) => {
      const r = rank.find((x) => x.cod_ibge === c);
      if (!r) return null;
      return { cod: c, nome: r.nome, populacao: pop.get(c) ?? 0, score: r.score, posicao: r.posicao,
        autonomia: r.autonomia, investimento: r.investimento, equilibrio: r.equilibrio, pessoal: r.pessoal,
        pctAutonomia: r.pctAutonomia, pctInvestimento: r.pctInvestimento, pctEquilibrio: r.pctEquilibrio, pctPessoal: r.pctPessoal,
        ...(mSau.get(c) || { saudePct: 0, transfUniao: 0 }), ...(mPrev.get(c) || { previne: 0 }),
        ...(mEdu.get(c) || { educPct: 0, fundebPct: 0 }), ...(mIdeb.get(c) || { ideb: 0 }),
        ...(mAss.get(c) || { cras: 0, habPorCras: 0, cadAtualiza: 0, pbf: 0 }),
        ...(mCom.get(c) || { comprasValor: 0, comprasN: 0, dispensaPct: 0 }),
        ...(mConv.get(c) || { convCelebrado: 0, convLiberado: 0 }),
        ...(mIegm.get(c) || { iegm: 0 }), ...(mSan.get(c) || { agua: 0, esgoto: 0 }) };
    }).filter(Boolean);

    return NextResponse.json({ itens, total: rank.length });
  } catch (e) {
    return NextResponse.json({ itens: [], erro: String(e) }, { status: 200 });
  }
}
