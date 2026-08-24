// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
// limpa_camara_contaminada.mjs — apaga a folha da PREFEITURA que entrou nas tabelas marcada como `legislativo`.
//
// A CAUSA (medida em 22/ago/2026): vários portais servem os DOIS poderes no mesmo endereço. Apontar o coletor
// para a URL da câmara e marcar tudo `poder='legislativo'` grava o município inteiro — Matozinhos/MG apareceu
// com **1.439 "vereadores"** para 49 na RAIS; Uruaçu/GO com 1.654 para 53.
//
// A RÉGUA é a ESCALA, não a palavra: em portal exclusivo de câmara as linhas não repetem "câmara" nenhuma vez
// (a do Rio é assim e está certa), então procurar o texto dá falso negativo. Quem denuncia é a RAIS do Poder
// Legislativo daquele município ([[pnigp-conferidor-rais-denominador-folha]]).
//   apaga quando: pessoas > FATOR × RAIS-1066  E  pessoas > PISO
//
// ⚠️ NÃO apaga o coletor nem a URL: apaga as LINHAS e o veredito daquele município naquele poder, para a
//    próxima passada poder decidir de novo ([[feedback-nunca-apagar-por-wildcard]] — aqui é alvo nomeado, um a um).
//
// Uso: node scripts/limpa_camara_contaminada.mjs         (DRY)
//      APLICAR=1 node scripts/limpa_camara_contaminada.mjs
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
import { pool, withRetry } from "./_cadprev.mjs";

const db = pool();
const q = withRetry(db);
const FATOR = Number(process.env.FATOR || 3);
const PISO = Number(process.env.PISO || 60);
const APLICAR = process.env.APLICAR === "1";

const TABELAS = (await q(`select table_name t from information_schema.columns
  where table_schema='public' and table_name like 'folha_servidores_%' and column_name='poder' group by 1 order by 1`)).rows.map((r) => r.t);

let totalLinhas = 0, totalMun = 0;
for (const tab of TABELAS) {
  const fonte = tab.replace("folha_servidores_", "");
  // ⚠️ nem toda tabela com `poder` tem `cod_ibge` (PE e MA guardam o município por nome) — sem ele não há como
  //    comparar com a RAIS daquele município, então a tabela fica fora desta auditoria, declaradamente.
  const temIbge = (await q(`select 1 from information_schema.columns where table_name=$1 and column_name='cod_ibge'`, [tab])).rowCount;
  if (!temIbge) { console.log(`(fora: ${fonte} não tem cod_ibge)`); continue; }
  const suspeitos = (await q(`
    with cam as (select cod_ibge, max(municipio) municipio, count(distinct nome)::int pessoas, count(*)::int linhas
                   from ${tab} where poder = 'legislativo' and cod_ibge is not null group by 1)
    select c.cod_ibge, c.municipio, c.pessoas, c.linhas, a.rais_legislativo
      from cam c join aux_camara_com_folha a on a.cod_ibge = c.cod_ibge
     where c.pessoas > $1 and (a.rais_legislativo = 0 or c.pessoas > $2 * a.rais_legislativo)
     order by c.pessoas desc`, [PISO, FATOR])).rows;
  if (!suspeitos.length) continue;
  const linhas = suspeitos.reduce((s, x) => s + x.linhas, 0);
  console.log(`\n🚨 ${fonte}: ${suspeitos.length} municípios · ${linhas} linhas — folha grande demais para câmara`);
  console.table(suspeitos.slice(0, 6).map((x) => ({ municipio: x.municipio, pessoas: x.pessoas, rais: x.rais_legislativo })));
  totalLinhas += linhas; totalMun += suspeitos.length;
  if (!APLICAR) continue;
  for (const s of suspeitos) {
    await q(`delete from ${tab} where poder = 'legislativo' and cod_ibge = $1`, [s.cod_ibge]);
    const led = `folha_${fonte}_coleta`;
    const existe = (await q(`select 1 from information_schema.columns where table_name=$1 and column_name='poder'`, [led])).rowCount;
    if (existe) await q(`delete from ${led} where poder = 'legislativo' and cod_ibge = $1`, [s.cod_ibge]).catch(() => {});
  }
}
console.log(`\n${totalMun} municípios · ${totalLinhas} linhas ${APLICAR ? "APAGADAS" : "a apagar (DRY — rode com APLICAR=1)"}`);
await db.end();
