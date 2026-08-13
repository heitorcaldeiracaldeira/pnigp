// probe_farol_folha.mjs — sonda 3: qual campo é FUNÇÃO, e quanto custa um município grande.
import { abrir, selecionar, valoresDoCampo, tabela, BRUTO, DESC } from "./_farol.mjs";

const MES = process.env.MES || "202511";
const { rpc, appH, fechar } = await abrir();

await rpc("ClearAll", appH, [false]);
await selecionar(rpc, appH, "anoMes", MES);
await selecionar(rpc, appH, "Esfera", "Municipal");

console.log("=== candidatos a FUNÇÃO (valores distintos) ===");
for (const c of ["NATUREZA_VINCULO", "descricaoTipoCargo", "especificacao", "Cargo Vinculo - Resumo",
                 "descricaoTipoMovimentacao", "descricaoGrupoMovimentacao", "descricaoTipoOnus", "descricaoTipoCargoAcumulacao"]) {
  try {
    const v = await valoresDoCampo(rpc, appH, c, 60);
    console.log(`\n[${c}] ${v.length} valores:\n   ` + v.slice(0, 40).join(" | "));
  } catch (e) { console.log(`\n[${c}] ✖ ${e.message.slice(0, 70)}`); }
}

// entes municipais disponíveis
const entes = await valoresDoCampo(rpc, appH, "Ente", 1000);
console.log(`\n=== entes na esfera Municipal em ${MES}: ${entes.length} ===`);

// custo de um município grande com o cubo final
await selecionar(rpc, appH, "Ente", "FLORIANÓPOLIS");
const t0 = Date.now();
const p = await tabela(rpc, appH,
  ["Cod_IBGE", "Ente", "nomeUG", "Poder", "descricaoLotacao", "nomeCargo", "descricaoTipoCargo", "NATUREZA_VINCULO", "nome"],
  [BRUTO, DESC, "Count(DISTINCT numeroCPF)"], { altura: 5000 });
console.log(`\n=== Florianópolis ${MES}: ${p.total} linhas em ${((Date.now() - t0) / 1000).toFixed(1)}s ===`);
p.linhas.slice(0, 6).forEach((l) => console.log("  " + l.d.join(" ‖ ") + ` → bruto ${l.m[0].toFixed(2)} / desc ${l.m[1].toFixed(2)}`));
const semPag = p.linhas.filter((l) => !l.m[0]).length;
console.log(`  linhas com bruto zero: ${semPag} (${(100 * semPag / p.linhas.length).toFixed(1)}%)`);
console.log(`  soma bruto: R$ ${(p.linhas.reduce((s, l) => s + l.m[0], 0) / 1e6).toFixed(2)} mi`);

fechar();
