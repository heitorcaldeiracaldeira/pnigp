// Gera um HTML de conclusão da extração de texto do PNCP (arquivo_texto_sc). Queries LEVES (sem subconsulta
// correlacionada) p/ NAO competir com a extração. Uso pelo vigia (.claude/watch-extracao.ps1).
//   node scripts/gera_relatorio_extracao.mjs         -> se ocioso (sem gravacao em 25min): gera HTML, imprime "DONE <path>"; senao "RUNNING ..."
//   FORCE=1 node ...                                 -> gera sempre (teste)
import fs from "fs"; import path from "path"; import { fileURLToPath } from "url"; import pg from "pg";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const U = fs.readFileSync(path.join(__dirname, "..", ".env.local"), "utf8").match(/^DATABASE_URL=(.+)$/m)[1].trim();
const OUT = "C:/Users/PC/extracao-concluida.html";
const db = new pg.Pool({ connectionString: U, ssl: { rejectUnauthorized: false }, max: 2, statement_timeout: 60000 });
const q = (s) => db.query(s).then((r) => r.rows);
const fmt = (n) => Number(n).toLocaleString("pt-BR");

try {
  // ═══ OCIOSO NÃO É TERMINADO ═══
  // O critério original era só `writes25 == 0`: nenhuma gravação em 25 minutos. Mas quem imprime DONE faz o
  // vigia (.claude/watch-extracao.ps1) DESATIVAR a extração e a si mesmo — então "ocioso" desligava tudo.
  // Silêncio tem duas causas opostas: acabou o trabalho, ou o trabalho morreu. Medido no log do vigia em
  // 19/jul/2026: a vazão caiu de ~10.000 gravações por janela para 53, os shards morreram (a tarefa saiu com
  // 0xC000013A) e a extração ficou DESLIGADA por 18 dias — com 20.975 documentos ainda pendentes, que
  // ninguém viu porque o sistema se declarou concluído.
  // Agora só é DONE quando NÃO HÁ MAIS PENDENTE. Ocioso com pendente é PARADO, e parado pede relance, não
  // desligamento — por isso sai como STALLED, que o vigia trata como "continua ligado".
  const writes25 = (await q(`SELECT count(*)::int n FROM arquivo_texto_sc WHERE atualizado > now() - interval '25 min'`))[0].n;
  if (!process.env.FORCE && writes25 > 0) { console.log(`RUNNING writes25=${writes25}`); await db.end(); process.exit(0); }
  const pend = (await q(`SELECT count(*)::int n FROM arquivos_sc a
     WHERE a.uri IS NOT NULL AND NOT EXISTS (SELECT 1 FROM arquivo_texto_sc t
       WHERE t.cnpj=a.cnpj AND t.ano=a.ano AND t.seq=a.seq AND t.sequencial_documento=a.sequencial_documento)`))[0].n;
  if (!process.env.FORCE && pend > 0) {
    console.log(`STALLED writes25=0 pendentes=${pend} — parado, NAO concluido`);
    await db.end(); process.exit(0);
  }

  // agregados leves: uma passada por tabela, sem subconsulta correlacionada
  const idxTot = (await q(`SELECT count(*)::int n FROM arquivos_sc WHERE uri IS NOT NULL`))[0].n;
  const e = (await q(`SELECT count(*)::int n, count(*) FILTER (WHERE coalesce(chars,0)>50)::int ct FROM arquivo_texto_sc`))[0];
  const ext = e.n, comTexto = e.ct, vazios = ext - comTexto, falta = Math.max(0, idxTot - ext);
  const idxT = await q(`SELECT tipo_documento tipo, count(*)::int n FROM arquivos_sc WHERE uri IS NOT NULL GROUP BY 1`);
  const extT = await q(`SELECT tipo_documento tipo, count(*)::int n FROM arquivo_texto_sc GROUP BY 1`);
  const horas = await q(`SELECT to_char(atualizado,'DD/MM HH24"h"') h, count(*)::int n, min(atualizado) mi
    FROM arquivo_texto_sc WHERE atualizado > now() - interval '48 hours' GROUP BY 1 ORDER BY 3`);
  const jan = (await q(`SELECT to_char(min(atualizado),'DD/MM HH24:MI') ini, to_char(max(atualizado),'DD/MM HH24:MI') fim FROM arquivo_texto_sc WHERE atualizado > now() - interval '48 hours'`))[0];
  const agora = (await q(`SELECT to_char(now(),'DD/MM/YYYY HH24:MI') t`))[0].t;

  const emap = Object.fromEntries(extT.map((r) => [r.tipo, r.n]));
  const tipos = idxT.map((r) => ({ tipo: r.tipo, idx: r.n, ext: emap[r.tipo] || 0 })).sort((a, b) => b.idx - a.idx);
  const pct = (ext / idxTot * 100).toFixed(1);
  const maxH = Math.max(1, ...horas.map((r) => r.n));
  const bar = (v, max, cor) => `<div class="bar"><span style="width:${(v / max * 100).toFixed(1)}%;background:${cor}"></span></div>`;

  const linhas = tipos.map((r) => {
    const p = r.idx ? r.ext / r.idx * 100 : 0;
    const cor = p >= 99 ? "var(--ok)" : p >= 80 ? "var(--accent)" : "var(--warn)";
    return `<tr><td>${r.tipo}</td><td class="num">${fmt(r.ext)}/${fmt(r.idx)}</td><td class="pc">${bar(r.ext, r.idx || 1, cor)}<span>${p.toFixed(0)}%</span></td></tr>`;
  }).join("");
  const barrasHora = horas.map((r) => `<div class="hbar" title="${r.h}: ${fmt(r.n)}"><span style="height:${(r.n / maxH * 100).toFixed(1)}%"></span></div>`).join("");

  const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>Extração concluída — PNCP</title>
<style>
:root{--bg:#0c1016;--card:#141a22;--ln:#232c37;--tx:#e8edf3;--dim:#93a1b0;--ok:#3fb96b;--accent:#3aa0d8;--warn:#d99a3a}
*{margin:0;box-sizing:border-box}body{background:var(--bg);color:var(--tx);font-family:"Segoe UI",-apple-system,Roboto,Arial,sans-serif;line-height:1.5}
.wrap{max-width:820px;margin:0 auto;padding:48px 22px 80px}
.tag{font-size:12px;letter-spacing:.18em;text-transform:uppercase;color:var(--ok);font-weight:600}
h1{font-size:clamp(28px,5vw,40px);font-weight:600;margin:10px 0 6px;letter-spacing:-.01em}
.sub{color:var(--dim);margin-bottom:34px}
.tiles{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:14px}
.tile{background:var(--card);border:1px solid var(--ln);border-radius:14px;padding:18px}
.tile .v{font-size:30px;font-weight:650;font-variant-numeric:tabular-nums}.tile .k{color:var(--dim);font-size:13px;margin-top:3px}
.cover{background:var(--card);border:1px solid var(--ln);border-radius:14px;padding:18px 20px;margin:14px 0}
.cover .big{font-size:22px;font-weight:600;margin-bottom:10px}
.bar{background:#0a0e13;border-radius:6px;height:12px;overflow:hidden;flex:1}.bar span{display:block;height:100%;border-radius:6px}
h2{font-size:13px;letter-spacing:.1em;text-transform:uppercase;color:var(--dim);margin:34px 0 12px;border-bottom:1px solid var(--ln);padding-bottom:8px}
table{width:100%;border-collapse:collapse;font-size:14px}td{padding:9px 8px;border-bottom:1px solid var(--ln)}
td.num{text-align:right;color:var(--dim);font-variant-numeric:tabular-nums;white-space:nowrap}
td.pc{display:flex;align-items:center;gap:10px;width:180px}td.pc span{font-variant-numeric:tabular-nums;font-size:12px;color:var(--dim);width:34px;text-align:right}
.chart{display:flex;align-items:flex-end;gap:3px;height:120px;background:var(--card);border:1px solid var(--ln);border-radius:14px;padding:16px}
.hbar{flex:1;display:flex;align-items:flex-end;height:100%}.hbar span{width:100%;background:linear-gradient(180deg,var(--accent),#1f5f80);border-radius:3px 3px 0 0;min-height:2px}
.foot{color:var(--dim);font-size:13px;margin-top:34px;border-top:1px solid var(--ln);padding-top:16px}
.note{background:var(--card);border:1px solid var(--ln);border-left:3px solid var(--accent);border-radius:10px;padding:14px 16px;margin-top:16px;font-size:14px;color:#cdd8e2}
</style></head><body><div class="wrap">
<div class="tag">&#10003; Extração concluída</div>
<h1>Texto dos documentos do PNCP</h1>
<div class="sub">Todos os documentos disponíveis foram baixados e tiveram o texto extraído. Gerado em ${agora}.</div>
<div class="tiles">
  <div class="tile"><div class="v">${fmt(ext)}</div><div class="k">documentos extraídos</div></div>
  <div class="tile"><div class="v">${pct}%</div><div class="k">de ${fmt(idxTot)} no índice</div></div>
  <div class="tile"><div class="v">${fmt(comTexto)}</div><div class="k">com texto real</div></div>
  <div class="tile"><div class="v">${fmt(vazios)}</div><div class="k">vazios (PDF imagem/indisponível)</div></div>
</div>
<div class="cover"><div class="big">${pct}% de cobertura</div>${bar(ext, idxTot, "var(--ok)")}
<div class="k" style="color:var(--dim);font-size:13px;margin-top:10px">Restam ~${fmt(falta)} — só PDFs corrompidos/indisponíveis, que ficam vazios de propósito.</div></div>
<h2>Cobertura por tipo de documento</h2>
<table>${linhas}</table>
<h2>Vazão por hora (perfil da extração &middot; ${jan.ini} &rarr; ${jan.fim})</h2>
<div class="chart">${barrasHora}</div>
<div class="note"><b>Próximo passo:</b> este texto é a nova fonte de descritivo do produto &rarr; dispara o re-derive do banco de preços. E a análise de <b>melhores horários pra baixar do PNCP</b> (o gráfico acima é o perfil de fim de semana) está pronta pra rodar.</div>
<div class="foot">Bento &middot; segundo cérebro do Heitor &middot; PNIGP / Instituto I10</div>
</div></body></html>`;

  fs.writeFileSync(OUT, html);
  console.log("DONE " + OUT);
} catch (e) {
  console.error("ERRO " + (e.message || e));
  process.exit(1);
}
await db.end();
