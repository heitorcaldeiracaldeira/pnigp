// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
// audita_camara_volume.mjs — pega a folha da PREFEITURA gravada como se fosse da CÂMARA, pelo TAMANHO.
//
// POR QUÊ: em 22/ago/2026 o coletor do Abase, apontado para a URL da câmara, trouxe o município inteiro —
// **Santo Cristo com 478 "vereadores"**. O erro não deu exceção nenhuma: gravou 2.770 linhas e fechou `ok`.
// O que o denuncia é a ESCALA. Câmara municipal tem de 5 a 60 pessoas; a RAIS diz quantas, município a município
// ([[pnigp-contaminacao-camara-e-sempre-pequena]] é a mesma lei com o sinal trocado — lá a câmara inflava a
// prefeitura, aqui a prefeitura infla a câmara).
//
// A régua: pessoas coletadas > 3× o que a RAIS declara para o Poder Legislativo daquele município (natureza
// 1066) E acima de 60 pessoas. Os dois juntos, porque:
//   · só a razão acusaria câmara pequena com RAIS desatualizada (8 pessoas contra 2 declaradas);
//   · só o piso acusaria câmara grande de verdade (a do Rio tem 2.242 e está certa).
//
// ⚠️ SÓ RELATA. Apagar é decisão caso a caso — a mesma regra da auditoria da folha das prefeituras.
//
// Uso: node scripts/audita_camara_volume.mjs        · FATOR=3 PISO=60
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
import { pool, withRetry } from "./_cadprev.mjs";

const db = pool();
const q = withRetry(db);
const FATOR = Number(process.env.FATOR || 3);
const PISO = Number(process.env.PISO || 60);

const r = await q(`
  with cam as (
    select cod_ibge, uf, max(municipio) municipio, fonte,
           count(distinct nome) filter (where nome is not null and nome <> '')::int pessoas,
           count(*)::int linhas, max(competencia) competencia
      from vw_folha_camara_brasil
     where cod_ibge is not null
     group by cod_ibge, uf, fonte
  )
  select c.uf, c.municipio, c.fonte, c.pessoas, c.linhas, c.competencia,
         a.rais_legislativo,
         case when a.rais_legislativo > 0 then round(c.pessoas::numeric / a.rais_legislativo, 1) end razao
    from cam c
    join aux_camara_com_folha a on a.cod_ibge = c.cod_ibge
   where c.pessoas > $1
     and (a.rais_legislativo = 0 or c.pessoas > $2 * a.rais_legislativo)
   order by c.pessoas desc`, [PISO, FATOR]);

console.log(`🚨 ${r.rowCount} câmaras com volume INCOMPATÍVEL com a RAIS do legislativo ` +
            `(mais de ${FATOR}× e acima de ${PISO} pessoas) — suspeita de folha da PREFEITURA gravada como câmara:\n`);
console.table(r.rows);

if (r.rowCount) {
  const porFonte = await q(`
    with cam as (
      select cod_ibge, fonte, count(distinct nome)::int pessoas from vw_folha_camara_brasil
       where cod_ibge is not null and nome is not null and nome <> '' group by 1,2)
    select c.fonte, count(*)::int camaras_suspeitas, sum(c.pessoas)::int pessoas
      from cam c join aux_camara_com_folha a on a.cod_ibge = c.cod_ibge
     where c.pessoas > $1 and (a.rais_legislativo = 0 or c.pessoas > $2 * a.rais_legislativo)
     group by 1 order by 2 desc`, [PISO, FATOR]);
  console.log("por fonte (é aqui que se procura o defeito do coletor, não no município):");
  console.table(porFonte.rows);
}
console.log("\n⚠️ Só relata. Antes de apagar, conferir no portal de quem é a folha — pode ser câmara grande de verdade.");
await db.end();
