// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
// reprocessa_subcoletados.mjs — pega a fila que a PROVA REAL deixou gravada e manda o coletor certo tentar de novo.
//
// A ordem é: `confere_folha_cobertura.mjs` mede contra a RAIS e grava `folha_prova_real`; este script lê os
// vereditos `subcoletado` (razão < min) e re-executa `ingest_folha_<fonte>.mjs` com SO=<município> e REFAZ=1.
//
// 🚨 REPROCESSAR NÃO CONSERTA TUDO — e é por isso que ele MEDE de novo no fim. As causas de subcoleta são de dois
//    tipos e só uma responde a nova tentativa ([[pnigp-coletor-ok-sem-dado-sete-causas]]):
//      TRANSITÓRIA  host fora do ar, iframe que não carregou, paginação interrompida  → a re-passada resolve
//      ESTRUTURAL   o portal só publica "Folha Complementar"; o mês corrente vem pela metade; a folha é
//                   anonimizada; a fonte cobre só parte das entidades                 → a re-passada NÃO resolve
//    Terminar sem separar as duas é prometer conserto que não veio.
//
// 🚨 A RE-PASSADA NÃO PODE REBAIXAR O VEREDITO ([[pnigp-repassada-nao-pode-rebaixar-veredito]]). Os coletores
//    gravam por `_hash` e NÃO apagam o que já existe: se a nova tentativa trouxer menos, a competência anterior
//    continua na tabela e a prova real segue pegando o PICO da série. Por isso aqui não há DELETE — de propósito.
//
// ⚠️ Um coletor por vez, em série. Vários deles abrem navegador; paralelizar derruba o portal do município
//    ([[pnigp-intraweb-sessao-derruba-servidor]]) e não é isso que se quer numa varredura de reparo.
//
// Uso: UF=PI node scripts/reprocessa_subcoletados.mjs            (dry-run: mostra a fila)
//      UF=PI APLICAR=1 node scripts/reprocessa_subcoletados.mjs  (executa)
//      LIMITE=10 · SO_FONTE=scpi · MIN=0.5
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
import { spawnSync } from "child_process";
import fs from "fs";
import { pool, withRetry } from "./_cadprev.mjs";

const db = pool();
const q = withRetry(db);
const UF = process.env.UF || null;
const APLICAR = process.env.APLICAR === "1";
const LIMITE = Number(process.env.LIMITE || 999);
const SO_FONTE = process.env.SO_FONTE || null;
const MIN = Number(process.env.MIN || 0.5);

// fonte da prova real → script de coleta. O nome bate na maioria; o mapa cobre quem foge do padrão.
const EXCECAO = {
  sc: "farol_sc", capital: "capitais", ma: "tcema", pe: "tcepe", pb: "tcepb", mt: "tcemt_nominal",
  cgmal: "cgm_al", scpicsv: "scpi_csv", piv2: "pi_v2", pitransp: "pi_transparencia",
  transpfacil: "transparenciafacil", transphd: "transparenciahd", abo_mg: "abo_mg",
  pdfrelacao: "pdf_relacao", pronimgrade: "pronim_grade", minastransp: "minastransparente",
  gwtransp: "gwtransparencia", cidadesmg_antigo: "cidadesmg_antigo",
  // ⚠️ aspec tem TRÊS coletores (nominal, agregado, empenho) e só o nominal é folha por pessoa —
  //    os outros dois são despesa. Mandar o agregado aqui reprocessaria a coisa errada.
  aspec: "aspec_nominal",
};
const scriptDa = (fonte) => {
  const cand = EXCECAO[fonte] || fonte;
  const p = `scripts/ingest_folha_${cand}.mjs`;
  return fs.existsSync(p) ? p : null;
};

const fila = (await q(`select cod_ibge, municipio, uf, coletado, rais, razao, fonte_principal
  from folha_prova_real
 where veredito = 'subcoletado' and razao < $1
   ${UF ? "and uf = $2" : ""}
   ${SO_FONTE ? `and fonte_principal = '${SO_FONTE.replace(/'/g, "")}'` : ""}
 order by razao asc, coletado asc`, UF ? [MIN, UF] : [MIN])).rows.slice(0, LIMITE);

if (!fila.length) {
  console.log(`nenhum município subcoletado na fila${UF ? ` em ${UF}` : ""} — rode antes: ${UF ? `UF=${UF} ` : ""}node scripts/confere_folha_cobertura.mjs`);
  await db.end(); process.exit(0);
}

const semScript = fila.filter((f) => !scriptDa(f.fonte_principal));
const comScript = fila.filter((f) => scriptDa(f.fonte_principal));
console.log(`[reprocessa] ${fila.length} subcoletados${UF ? ` em ${UF}` : ""} (razão < ${MIN})`);
const porFonte = {};
for (const f of comScript) (porFonte[f.fonte_principal] ??= []).push(f);
for (const [fonte, arr] of Object.entries(porFonte).sort((a, b) => b[1].length - a[1].length)) {
  console.log(`  ${fonte.padEnd(14)} ${String(arr.length).padStart(3)} municípios → ${scriptDa(fonte)}`);
}
if (semScript.length) {
  console.log(`\n  ⚠️ sem coletor mapeado (${semScript.length}): ` +
    [...new Set(semScript.map((f) => f.fonte_principal))].join(", "));
}
if (!APLICAR) { console.log("\n(dry-run — rode com APLICAR=1 para executar)"); await db.end(); process.exit(0); }

// ── executa, um município por vez ───────────────────────────────────────────────────────────────────────────────
const antes = Object.fromEntries(comScript.map((f) => [f.cod_ibge, Number(f.coletado)]));
let feitos = 0;
for (const f of comScript) {
  const script = scriptDa(f.fonte_principal);
  process.stdout.write(`  [${++feitos}/${comScript.length}] ${f.uf} ${String(f.municipio).padEnd(26)} (${f.fonte_principal}, razão ${f.razao}) … `);
  const r = spawnSync(process.execPath, [script], {
    env: { ...process.env, SO: f.municipio, REFAZ: "1", UF: f.uf, APLICAR: "1" },
    encoding: "utf8", timeout: 1000 * 60 * 12,
  });
  const saida = `${r.stdout || ""}${r.stderr || ""}`.split("\n").filter((x) => /servidores|linhas|ok|✔|✖|erro/i.test(x)).slice(-1)[0] || "";
  console.log(r.status === 0 ? `ok · ${saida.trim().slice(0, 70)}` : `FALHOU (${r.status}) ${String(r.stderr || "").slice(0, 60)}`);
}

// ── mede de novo SÓ os reprocessados, e separa transitório de estrutural ────────────────────────────────────────
console.log("\n── medindo de novo ──");
const conta = await q(`
  with rais_ano as (select max(ano) a from folha_rais_municipal),
  r as (select lpad(cod_ibge6,6,'0') ibge6, count(*)::int ativos from folha_rais_municipal, rais_ano
         where ano = rais_ano.a and esfera_grupo='municipal' and ativo_3112 group by 1)
  select p.cod_ibge, p.municipio, p.uf, p.coletado antes_col, p.razao antes_razao, r.ativos rais
    from folha_prova_real p left join r on r.ibge6 = left(p.cod_ibge,6)
   where p.cod_ibge = any($1)`, [comScript.map((f) => f.cod_ibge)]);
console.log(`  ${conta.rows.length} municípios reprocessados — rode a prova real de novo para o veredito atualizado:`);
console.log(`     ${UF ? `UF=${UF} ` : ""}node scripts/confere_folha_cobertura.mjs`);
console.log("  ⚠️ quem continuar abaixo da faixa é ESTRUTURAL (só complementar, mês parcial, folha anonimizada) —");
console.log("     esses não se resolvem com nova tentativa e precisam de conserto no coletor ou de outra fonte.");
await db.end();
