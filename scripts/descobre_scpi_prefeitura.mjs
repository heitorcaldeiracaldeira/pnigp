// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
// descobre_scpi_prefeitura.mjs — para os municípios em que o SCPI coletou SÓ A CÂMARA, procura o portal da
// PREFEITURA no MESMO servidor, variando a PORTA.
//
// POR QUÊ: 43 municípios estão marcados `ok_so_camara` — o coletor chegou no portal do legislativo, colheu
// 12 a 43 pessoas e rotulou certo. Não é subcoleta nem paginação: é ALVO ERRADO.
// 🚨 E a derivação por NOME não serve aqui: os hosts são IP com porta alta (`201.62.65.253:8079`) ou domínio
// do município (`portal.dracena.sp.gov.br:8079`) — não há "camara" no host. O que separa prefeitura de câmara
// no SCPI on-premise é a PORTA (ou a instância), não o nome ([[pnigp-varredura-host-porta-onpremise]]).
//
// A prova de identidade é o TEXTO da página: título/cabeçalho do SCPI trazem o nome da entidade.
// ⚠️ Guarda obrigatória: se a página falar em Câmara/Legislativo, NÃO é a prefeitura — seguir procurando
// ([[pnigp-entidade-espelho-infla-folha]]).
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
import { pool, withRetry } from "./_cadprev.mjs";

const db = pool();
const q = withRetry(db);
const CONC = Number(process.env.CONC || 5);
const UA = { "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36" };
// portas típicas do SCPI on-premise; a 1ª é a do próprio host já conhecido
const PORTAS = ["8079", "8078", "8077", "8076", "5656", "5657", "5661", "879", "8080"];

await q(`create table if not exists scpi_prefeitura_descoberta (
  cod_ibge text primary key, municipio text, uf text, host_camara text,
  host_prefeitura text, evidencia text, em timestamptz default now())`);

const alvos = (await q(`select c.cod_ibge, c.municipio, c.uf, c.host
  from folha_scpi_coleta c
 where c.situacao='ok_so_camara' and c.host is not null
   and not exists (select 1 from scpi_prefeitura_descoberta d where d.cod_ibge=c.cod_ibge)
 order by c.municipio`)).rows;
console.log(`[scpi/pref] ${alvos.length} municípios com só a câmara · testando ${PORTAS.length} portas cada`);

const baixa = async (url) => {
  try {
    const r = await fetch(url, { headers: UA, redirect: "follow", signal: AbortSignal.timeout(18000) });
    if (!r.ok) return null;
    return Buffer.from(await r.arrayBuffer()).toString("latin1");
  } catch { return null; }
};
// o SCPI põe o nome da entidade no título/topo; decide pela MENÇÃO, não pelo host
const ehCamara = (t) => /c[âa]mara|legislativ|vereador/i.test(t);
const ehPref = (t) => /prefeitura|munic[íi]pio|executivo/i.test(t);

let achados = 0, feitos = 0;
for (let i = 0; i < alvos.length; i += CONC) {
  await Promise.all(alvos.slice(i, i + CONC).map(async (a) => {
    const semPorta = a.host.replace(/:\d+$/, "");
    const portaAtual = (a.host.match(/:(\d+)$/) || [])[1];
    const portas = [...new Set(PORTAS.filter((p) => p !== portaAtual))];
    for (const p of portas) {
      for (const esq of ["http", "https"]) {
        const html = await baixa(`${esq}://${semPorta}:${p}/transparencia/`);
        if (!html) continue;
        const cabeca = html.slice(0, 6000).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
        if (!ehPref(cabeca) || ehCamara(cabeca)) continue;   // ⚠️ só aceita se fala de prefeitura E não de câmara
        await q(`insert into scpi_prefeitura_descoberta (cod_ibge,municipio,uf,host_camara,host_prefeitura,evidencia)
                 values ($1,$2,$3,$4,$5,$6) on conflict (cod_ibge) do update
                 set host_prefeitura=excluded.host_prefeitura, evidencia=excluded.evidencia, em=now()`,
          [a.cod_ibge, a.municipio, a.uf, a.host, `${semPorta}:${p}`, cabeca.slice(0, 120)]);
        achados++;
        console.log(`  ✔ ${a.municipio.padEnd(24)} ${a.host} → ${semPorta}:${p}`);
        return;
      }
    }
  }));
  feitos += Math.min(CONC, alvos.length - i);
  process.stdout.write(`   ${feitos}/${alvos.length} · ${achados} prefeituras achadas\r`);
}
console.log(`\n[scpi/pref] ${achados} de ${alvos.length} com porta da PREFEITURA encontrada`);
await db.end();
