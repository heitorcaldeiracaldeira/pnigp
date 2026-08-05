// Passo de mentira, usado só pelas cadeias "teste" e "teste_falha" do runner. Não toca em banco nem em rede.
// Serve para provar, sem risco: que a ordem é respeitada, que o ambiente vem da declaração e NÃO do passo
// anterior, que o timeout mata, que a cadeia corta no primeiro erro, e que o código de saída chega inteiro.
const p = process.env.PASSO || "(sem PASSO)";
console.log(`  [passo ${p}] CADEIA_BASE=${process.env.CADEIA_BASE ?? "(ausente)"} PASSO=${process.env.PASSO ?? "(ausente)"} SAIR=${process.env.SAIR ?? "(ausente)"}`);
if (process.env.DEMORA) await new Promise((r) => setTimeout(r, Number(process.env.DEMORA) * 1000));
const cod = Number(process.env.SAIR || 0);
if (cod) { console.error(`  [passo ${p}] saindo com ${cod} de proposito`); process.exit(cod); }
console.log(`  [passo ${p}] terminei bem`);
