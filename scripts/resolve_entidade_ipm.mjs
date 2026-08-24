// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
// resolve_entidade_ipm.mjs — devolve o NOME da entidade às linhas do IPM que só têm o código do cliente.
//
// POR QUÊ (22/ago/2026): o coletor do IPM percorre TODAS as entidades do portal — prefeitura, autarquias, fundos
// e a CÂMARA — mas a coluna `entidade` guarda só o código (`12022`), nunca a descrição. Resultado: a folha da
// câmara está no banco desde sempre e é INDISTINGUÍVEL ([[pnigp-camara-vem-de-graca-quem-percorre-entidades]]).
// O conserto do coletor (gravar `entidade_nome`) já existe, mas a re-passada não roda: o Atende.net devolve
// HTTP 500 ([[pnigp-ipm-todas-as-entidades]]).
//
// ⭐ E NÃO PRECISA DE REDE: o livro-razão `folha_ipm_coleta.detalhe` guarda o nome de cada entidade JUNTO COM a
//    contagem de linhas daquela coleta —
//      "4 entidades · MUNICÍPIO DE GAROPABA:1463 | CÂMARA MUNICIPAL DE GARO:28 | INSTITUTO DE PREVIDÊNCIA:178 …"
//    e a contagem é a chave que casa nome ↔ código. É [[pnigp-medir-ineditismo-antes-de-escrever-coletor]]:
//    o dado que eu ia buscar na fonte já estava gravado ao lado.
//
// ⚠️ O nome vem TRUNCADO em 24 caracteres pelo próprio livro-razão ("CÂMARA MUNICIPAL DE GARO") — serve de
//    evidência de PODER, que é para o que a view o usa, e não como razão social. Ver
//    [[pnigp-cabecalho-do-export-truncado]]: o truncamento é da origem, não nosso.
//
// 🚨 SÓ CASA CONTAGEM ÚNICA. Se duas entidades do mesmo município têm o mesmo número de linhas, não há como
//    saber qual é qual — essas ficam de fora e entram no relatório. Chutar aqui gravaria a folha da autarquia
//    com o rótulo da câmara, que é o erro que [[pnigp-guarda-poder-volume-rais]] existe para impedir.
//
// Uso: node scripts/resolve_entidade_ipm.mjs          (só relata)
//      APLICAR=1 node scripts/resolve_entidade_ipm.mjs
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
import { pool, withRetry } from "./_cadprev.mjs";

const db = pool();
const q = withRetry(db);
const APLICAR = process.env.APLICAR === "1";
const CAMARA = /c[aâáà]mara|vereador|legislativ/i;

// "3 entidades · MUNICIPIO DE X:266 | CAMARA MUNICIPAL DE VERE:14 | FABS-…:43" → [{nome, linhas}]
function parseDetalhe(d) {
  const corpo = String(d || "").replace(/^\s*\d+\s+entidades?\s*·\s*/i, "");
  const out = [];
  for (const p of corpo.split("|")) {
    const m = p.trim().match(/^(.*):(\d+)$/);
    if (m && m[1].trim()) out.push({ nome: m[1].trim(), linhas: Number(m[2]) });
  }
  return out;
}

const ledger = (await q(`select cod_ibge, municipio, competencia, detalhe, poder
   from folha_ipm_coleta where coalesce(detalhe,'') <> '' order by municipio`)).rows;

const contagens = (await q(`select cod_ibge, coalesce(competencia,'') competencia, entidade, count(*)::int linhas
   from folha_servidores_ipm where entidade is not null group by 1,2,3`)).rows;

// (cod_ibge|competencia) → [{entidade, linhas}]
const porChave = new Map();
for (const r of contagens) {
  const k = `${r.cod_ibge}|${r.competencia}`;
  if (!porChave.has(k)) porChave.set(k, []);
  porChave.get(k).push(r);
}

const pares = [];               // {cod_ibge, competencia, entidade, nome}
const ambiguos = [], semCasar = [];

for (const l of ledger) {
  const itens = parseDetalhe(l.detalhe);
  if (!itens.length) continue;
  // a competência do livro-razão pode ser nula; nesse caso tenta todas as do município
  const chaves = l.competencia
    ? [`${l.cod_ibge}|${l.competencia}`]
    : [...porChave.keys()].filter((k) => k.startsWith(l.cod_ibge + "|"));
  for (const k of chaves) {
    const lado = porChave.get(k);
    if (!lado) continue;
    for (const it of itens) {
      const iguaisLedger = itens.filter((x) => x.linhas === it.linhas);
      const iguaisTabela = lado.filter((x) => x.linhas === it.linhas);
      if (iguaisTabela.length === 1 && iguaisLedger.length === 1) {
        pares.push({ cod_ibge: l.cod_ibge, competencia: k.split("|")[1], entidade: iguaisTabela[0].entidade,
                     nome: it.nome, municipio: l.municipio, linhas: it.linhas });
      } else if (iguaisTabela.length > 1 || iguaisLedger.length > 1) {
        ambiguos.push({ municipio: l.municipio, nome: it.nome, linhas: it.linhas,
                        motivo: `${iguaisLedger.length} no ledger × ${iguaisTabela.length} na tabela` });
      } else {
        semCasar.push({ municipio: l.municipio, nome: it.nome, linhas: it.linhas });
      }
    }
  }
}

const camaras = pares.filter((p) => CAMARA.test(p.nome));
console.log(`${ledger.length} registros no livro-razão · ${pares.length} entidades casadas por contagem única`);
console.log(`${ambiguos.length} ambíguas (contagem repetida) · ${semCasar.length} sem contagem correspondente`);
console.log(`\n⭐ ${camaras.length} delas são CÂMARA, em ${new Set(camaras.map((c) => c.cod_ibge)).size} municípios ` +
            `(${camaras.reduce((a, c) => a + c.linhas, 0)} linhas)`);
console.table(camaras.slice(0, 15).map((c) => ({ municipio: c.municipio, entidade: c.entidade, nome: c.nome, linhas: c.linhas })));

const camAmbiguas = ambiguos.filter((a) => CAMARA.test(a.nome));
if (camAmbiguas.length) {
  console.log(`\n⚠️ ${camAmbiguas.length} câmaras NÃO resolvidas por ambiguidade de contagem:`);
  console.table(camAmbiguas.slice(0, 12));
}

if (!APLICAR) { console.log("\n(só relatório — rode com APLICAR=1 para gravar entidade_nome)"); await db.end(); process.exit(0); }

let n = 0;
for (const p of pares) {
  const r = await q(`update folha_servidores_ipm set entidade_nome = $4
     where cod_ibge = $1 and coalesce(competencia,'') = $2 and entidade = $3
       and entidade_nome is distinct from $4`, [p.cod_ibge, p.competencia, p.entidade, p.nome]);
  n += r.rowCount;
}
console.log(`\n✅ ${n} linhas ganharam entidade_nome`);
await db.end();
