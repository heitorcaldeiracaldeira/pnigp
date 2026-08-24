// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
// descobre_topsolutions.mjs — enumera o produto TOP SOLUTIONS pelo PADRÃO DO HOST.
//
// ⭐ O host é DERIVÁVEL do nome: `pm{slug}{uf}.transparencia.topsolutionsrn.com.br` e a API gêmea em
//    `pm{slug}{uf}.apitransparencia.topsolutionsrn.com.br`. Achado ao caçar folha nos portais do RN — 7
//    municípios caíram no mesmo produto, e o padrão permite testar o estado inteiro.
//
// ⭐ A API entrega tudo numa chamada, sem navegador e sem sessão:
//    GET /Servidor/ServidorPorMesAnoAsync?numMes=MM&numAno=AAAA
//    → [{nome, cpf, vinculo, cargo, funcao, cargoFuncao, orgao, numMatricula, cargaHoraria,
//        vlrRemuneracaoBruta, vlrDescontosObrigatorios, vlrDescontoOutros, dtMesAno, idTipoFolha}]
//    Macau: 2.250 registros · 1,1 MB.
//
// Uso: UF=RN node scripts/descobre_topsolutions.mjs
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
import { pool, withRetry } from "./_cadprev.mjs";

const db = pool();
const q = withRetry(db);
const UF = (process.env.UF || "RN").toLowerCase();
const CONC = Number(process.env.CONC || 6);
const UA = { "user-agent": "Mozilla/5.0 (compatible; PNIGP/1.0; pesquisa de dados publicos)", accept: "application/json" };

const so = (s) => String(s).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");

const muns = (await q(`select cod_ibge, nome from municipios_br m
  where lower(uf) = $1
    and not exists (select 1 from vw_folha_oficial v where v.cod_ibge = m.cod_ibge)
  order by nome`, [UF])).rows;
console.log(`[topsolutions] ${UF.toUpperCase()}: testando ${muns.length} municípios sem folha`);

// competência de sondagem: mês corrente e os 2 anteriores
const comps = [];
const hoje = new Date();
for (let k = 0; k < 3; k++) {
  const d = new Date(hoje); d.setDate(1); d.setMonth(hoje.getMonth() - k);
  comps.push({ mes: String(d.getMonth() + 1).padStart(2, "0"), ano: String(d.getFullYear()) });
}

let achou = 0;
async function testa(m) {
  // ⚠️ o slug varia em três eixos: com/sem o sufixo da UF, com/sem as PREPOSIÇÕES e com/sem "pm".
  //    "São José do Campestre" → `pmsaojosecampestrern` (sem o "do"); "Tibau do Sul" → `pmtibausulrn`.
  const base = so(m.nome);
  const semPrep = so(String(m.nome).replace(/ (do|da|de|dos|das) /gi, " "));
  const slugs = [...new Set([base, semPrep].filter(Boolean))];
  const hosts = [];
  for (const sl of slugs) { hosts.push(`pm${sl}${UF}`); hosts.push(`pm${sl}`); }
  if (process.env.DEBUG) console.log(`      ${m.nome} → ${hosts.join(" · ")}`);
  for (const host of hosts) {
    const api = `https://${host}.apitransparencia.topsolutionsrn.com.br`;
    for (const c of comps) {
      let j;
      try {
        const r = await fetch(`${api}/Servidor/ServidorPorMesAnoAsync?numMes=${c.mes}&numAno=${c.ano}`,
          { headers: UA, signal: AbortSignal.timeout(45000) });
        if (!r.ok) continue;
        j = JSON.parse(await r.text());
      } catch { continue; }
      const arr = Array.isArray(j) ? j : (j?.data || j?.dados || []);
      if (!Array.isArray(arr) || !arr.length) continue;
      if (!arr[0]?.nome || arr[0]?.vlrRemuneracaoBruta == null) continue;   // prova: nome E valor
      const url = `https://${host}.transparencia.topsolutionsrn.com.br/servidores`;
      await q(`insert into folha_host_candidato (cod_ibge, municipio, uf, produto, host, url, achado_via)
        values ($1,$2,$3,'topsolutions',$4,$5,'padrão de host pm{slug}{uf} + API com nome e valor')
        on conflict (cod_ibge) do update set produto='topsolutions', host=excluded.host, url=excluded.url,
          achado_via=excluded.achado_via, em=now()`,
        [m.cod_ibge, m.nome, UF.toUpperCase(), `${host}.apitransparencia.topsolutionsrn.com.br`, url]);
      console.log(`   ⭐ ${m.nome.padEnd(24)} ${host} · ${arr.length} servidores em ${c.mes}/${c.ano}`);
      achou++;
      return;
    }
  }
}

for (let i = 0; i < muns.length; i += CONC) {
  await Promise.all(muns.slice(i, i + CONC).map(testa));
  if ((i + CONC) % 30 < CONC) console.log(`  ${Math.min(i + CONC, muns.length)}/${muns.length} · ${achou} achados`);
}
console.log(`\n[topsolutions] ${achou} de ${muns.length} municípios respondem no padrão`);
await db.end();
