// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
// sonda_dcfiorilli_porta.mjs — acha a PORTA e o CAMINHO reais do módulo de transparência nos servidores
// `*.dcfiorilli.com.br`, e grava a base COMPLETA em `fiorilli_portal`.
//
// 🚨 O DEFEITO QUE ISTO RESOLVE: `fiorilli_portal.base_url` desses 34 municípios tem só o HOST. O coletor
// remonta `{host}:879/transparencia/` — e a 879 NÃO EXISTE na maioria dos servidores contreina (ver
// [[pnigp-scpi-122-erros-recuperaveis]]). Resultado: 150 s de timeout por município e "erro" no livro-razão,
// quando o portal está no ar noutra porta (877, 878, 8072, 8078…), como os SITES OFICIAIS mostram.
//
// A prova exigida: a página tem de trazer a assinatura do SCPI **e nomear o município** — servidor compartilhado
// responde a página de outro cliente ([[pnigp-varredura-porta-exige-entidade]]).
//
// Uso: node scripts/sonda_dcfiorilli_porta.mjs        (APLICAR=1 grava a base completa)
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
import { pool, withRetry } from "./_cadprev.mjs";

const db = pool();
const q = withRetry(db);
const APLICAR = process.env.APLICAR === "1";
const CONC = Number(process.env.CONC || 10);
const UA = { "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36" };

// portas vistas nos links dos sites oficiais + as clássicas do SCPI on-premise
const PORTAS = (process.env.PORTAS ||
  "879,878,877,876,873,8078,8079,8072,8080,8081,8082,8083,8084,8085,8089,8090,8100,8110,443").split(",");
const CAMINHOS = ["transparencia", "transparencia/Default.aspx", "Transparencia"];

const eSCPI = (t) => /SCPI\s*9\.0|ProcessaDados\(|frmPaginaAspx/i.test(t);
const sem = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");

const alvos = (await q(`select f.cod_ibge, f.municipio, f.uf, f.base_url
  from fiorilli_portal f join folha_scpi_coleta c using (cod_ibge)
  where c.situacao='pendente' and f.base_url ilike '%dcfiorilli%' order by f.municipio`)).rows;
console.log(`[porta] ${alvos.length} servidores dcfiorilli a sondar · ${PORTAS.length} portas × ${CAMINHOS.length} caminhos\n`);

let ok = 0, i = 0;
for (const a of alvos) {
  const host = (() => { try { return new URL(a.base_url).host.replace(/:\d+$/, ""); } catch { return null; } })();
  i++;
  if (!host) { console.log(`   ${a.municipio} — base_url ilegível`); continue; }
  const chave = sem(a.municipio).slice(0, 9);
  let achou = null;

  // 🚨 NÃO PARAR NO PRIMEIRO SCPI QUE RESPONDE. Cada (host,porta) é a instância de UM município; num servidor
  // compartilhado a primeira porta que responde é a do VIZINHO. Parar ali marcava "não nomeia" e desistia —
  // 14 dos 34 caíram assim. Varrer TODAS as portas e só encerrar quando a página NOMEAR o município.
  let vizinho = null;
  for (let k = 0; k < PORTAS.length && !achou; k += CONC) {
    const lote = PORTAS.slice(k, k + CONC);
    const res = await Promise.all(lote.flatMap((p) => CAMINHOS.map(async (c) => {
      const url = `https://${host}${p === "443" ? "" : ":" + p}/${c}/`.replace(/\/+$/, "/");
      try {
        const r = await fetch(url, { headers: UA, redirect: "follow", signal: AbortSignal.timeout(9000) });
        if (!r.ok) return null;
        const t = await r.text();
        if (!eSCPI(t)) return null;
        return { url, nomeia: new RegExp(chave, "i").test(sem(t)) };
      } catch { return null; }
    })));
    const hits = res.filter(Boolean);
    achou = hits.find((x) => x.nomeia) || null;
    vizinho = vizinho || hits[0] || null;
  }

  if (!achou && !vizinho) { console.log(`   ${a.municipio.padEnd(26)} — nenhuma porta com transparência SCPI em ${host}`); continue; }
  if (!achou) { console.log(`⚠️  ${a.municipio.padEnd(26)} — ${PORTAS.length} portas varridas, nenhuma nomeia o município (a ${vizinho.url} é de outro cliente)`); continue; }
  ok++;
  console.log(`⭐ ${a.municipio.padEnd(26)} → ${achou.url}`);
  if (APLICAR) {
    await q(`update fiorilli_portal set base_url=$2,
               detalhe='porta e caminho reais sondados — a 879 não existe nestes servidores', em=now()
             where cod_ibge=$1`, [a.cod_ibge, achou.url]);
  }
}
console.log(`\n[porta] ${ok}/${alvos.length} com transparência confirmada${APLICAR ? " (gravado)" : " (simulação)"}`);
await db.end();
