// Conserta o mojibake do TCE-PB: o CSV é UTF-8 e foi lido como latin-1 ("CÃ¢mara ... Ãgua Branca").
// Reverter = tomar os bytes latin-1 do texto e reinterpretá-los como UTF-8.
//
// 🚨 O guard NÃO pode ser `like '%Ã%'`: "JOÃO PESSOA" e "CONCEIÇÃO" estão CERTOS e contêm Ã. Com aquele guard,
//    as 37.060 linhas de João Pessoa entravam em TODA passada e a conversão morria com
//    `invalid byte sequence for encoding "UTF8": 0xc3 0x4f` — parecia sobrar mojibake que não existia.
//    Mojibake real é Ã/Â seguido de caractere da faixa alta do latin-1, nunca de letra ASCII maiúscula.
// ⚠️ `convert_from` lança em byte inválido; a função devolve o original quando a conversão falha.
import { pool, withRetry } from "./_cadprev.mjs";
const db = pool();
const q = withRetry(db);

const GUARD = `~ '[\\u00C3\\u00C2][\\u0080-\\u00BF]'`;

await q(`create or replace function conserta_mojibake(t text) returns text as $$
begin
  if t is null or t !${GUARD.slice(1)} then return t; end if;
  return convert_from(convert_to(t,'LATIN1'),'UTF8');
exception when others then return t;
end $$ language plpgsql immutable`);

const COLS = ["municipio", "unidade_gestora", "secretaria", "nome", "cargo", "vinculo"];
let total = 0;
for (const c of COLS) {
  const r = await q(`update folha_servidores_tcepb set ${c} = conserta_mojibake(${c}) where ${c} ${GUARD}`);
  total += r.rowCount;
  console.log(`  ${c.padEnd(18)} ${r.rowCount} linhas`);
}
const rest = (await q(`select count(*)::int n from folha_servidores_tcepb
  where municipio ${GUARD} or unidade_gestora ${GUARD} or nome ${GUARD} or cargo ${GUARD} or vinculo ${GUARD}`)).rows[0].n;
console.log(`\n${total} correções · restam com mojibake: ${rest}`);
console.log("amostra:", (await q(`select distinct municipio from folha_servidores_tcepb order by 1 limit 5`)).rows.map((r) => r.municipio).join(" · "));
await db.end();
