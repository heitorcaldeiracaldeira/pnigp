// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
// ingest_folha_farol.mjs — a folha de TODOS os servidores públicos MUNICIPAIS de SC, no grão pedido:
//     município · secretaria (lotação) · cargo · função (tipo de cargo) · salário.
//
// FONTE: Farol TCE-SC "Pessoal On-line" (e-Sfinge, Qlik anônimo) — a única base que tem os cinco campos juntos
// para os 295 municípios. O SICONFI não cruza pessoal × órgão e o portal municipal não entrega o Executivo.
//
// GRÃO: um vínculo-mês. O mesmo servidor aparece em mais de uma linha quando acumula cargos ou muda de lotação
// no mês — por isso a contagem de PESSOAS é `count(distinct nome)` e não `count(*)`.
//
// DECISÕES QUE A SONDA FECHOU (probe_farol_folha.mjs):
//   · MUNICÍPIO   = `Ente` (+ `Cod_IBGE`), não `cidade`: `cidade` é o ENDEREÇO da unidade gestora, então UG
//                   estadual sediada na cidade entraria junto. `Esfera`='Municipal' isola a esfera.
//   · SECRETARIA  = `descricaoLotacao` (setor dentro do órgão; encoda inclusive a FONTE do recurso: FUNDEB 70%,
//                   Recursos Próprios) + `nomeUG` (o órgão: Prefeitura, Câmara, Fundo, Autarquia).
//   · FUNÇÃO      = `descricaoTipoCargo` — Cargo Efetivo, Cargo Comissionado, Contratação por Tempo Determinado,
//                   Agente Político, Estagiário, Emprego Público… É o campo que separa quadro de confiança.
//   · SITUAÇÃO    = `NATUREZA_VINCULO` (Ativo | Inativo | Pensionista) — inativo e pensionista estão na mesma
//                   folha e NÃO são funcionários; ficam gravados e a view separa.
//   · SALÁRIO     = Sum({<sinal_val_pagamento={'positivo'}>}val_pagamento). `sinal_val_pagamento` é TEXTO:
//                   Sum(val*sinal) devolve ZERO. Líquido = positivo − negativo.
//
// TETO DE PÁGINA: o engine recusa qHeight*qWidth > ~10.000 células (erro 6001). A altura sai da largura, em _farol.mjs.
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
import crypto from "crypto";
import { pool, withRetry } from "./_cadprev.mjs";
import { abrir, selecionar, valoresDoCampo, tabela, BRUTO, DESC, sleep } from "./_farol.mjs";

const MES = process.env.MES || "202511";       // mês com folha NORMAL (dez infla ~2× com 13º; 2026 vem parcial)
const SO = process.env.SO || null;             // roda um ente só (teste)
const REFAZ = process.env.REFAZ === "1";       // reprocessa entes já gravados

const DIMS = ["Cod_IBGE", "Ente", "nomeUG", "Poder", "descricaoLotacao", "nomeCargo", "descricaoTipoCargo", "NATUREZA_VINCULO", "nome"];
const MEDIDAS = [BRUTO, DESC, "Count(DISTINCT numeroCPF)"];

const db = pool();
const q = withRetry(db);

await q(`create table if not exists folha_servidores_sc (
  anomes       text not null,
  cod_ibge     text,
  municipio    text not null,
  orgao        text,
  poder        text,
  lotacao      text,
  cargo        text,
  tipo_cargo   text,
  situacao     text,
  nome         text,
  bruto        numeric,
  descontos    numeric,
  liquido      numeric,
  cpfs         int,
  _hash        text primary key,
  _coletado_em timestamptz default now()
)`);
await q(`create index if not exists ix_folha_sc_mun on folha_servidores_sc (cod_ibge, anomes)`);
await q(`create index if not exists ix_folha_sc_mes on folha_servidores_sc (anomes)`);
await q(`create index if not exists ix_folha_sc_lot on folha_servidores_sc (anomes, municipio, lotacao)`);

let { rpc, appH, fechar } = await abrir();
const religar = async () => { try { fechar(); } catch {} ; await sleep(1500); ({ rpc, appH, fechar } = await abrir()); };

// universo: os entes da esfera MUNICIPAL com folha no mês (municípios + consórcios/associações/agências)
await rpc("ClearAll", appH, [false]);
await selecionar(rpc, appH, "anoMes", MES);
await selecionar(rpc, appH, "Esfera", "Municipal");
let entes = await valoresDoCampo(rpc, appH, "Ente", 2000);
if (SO) entes = entes.filter((e) => e.toUpperCase().includes(SO.toUpperCase()));

// já gravados neste mês — retomada barata sem tabela de controle
const feitos = new Set();
if (!REFAZ) {
  const r = await q(`select distinct municipio from folha_servidores_sc where anomes=$1`, [MES]);
  r.rows.forEach((x) => feitos.add(x.municipio));
}
const fila = entes.filter((e) => !feitos.has(e));
console.log(`[folha ${MES}] ${entes.length} entes municipais · ${feitos.size} já gravados · ${fila.length} na fila`);

const LOTE = 1000;
async function gravar(linhas) {
  for (let i = 0; i < linhas.length; i += LOTE) {
    const p = linhas.slice(i, i + LOTE);
    await q(
      `insert into folha_servidores_sc
         (anomes,cod_ibge,municipio,orgao,poder,lotacao,cargo,tipo_cargo,situacao,nome,bruto,descontos,liquido,cpfs,_hash)
       select * from unnest($1::text[],$2::text[],$3::text[],$4::text[],$5::text[],$6::text[],$7::text[],$8::text[],
                            $9::text[],$10::text[],$11::numeric[],$12::numeric[],$13::numeric[],$14::int[],$15::text[])
       on conflict (_hash) do update set bruto=excluded.bruto, descontos=excluded.descontos,
         liquido=excluded.liquido, cpfs=excluded.cpfs, _coletado_em=now()`,
      [p.map((x) => x.anomes), p.map((x) => x.cod_ibge), p.map((x) => x.municipio), p.map((x) => x.orgao),
       p.map((x) => x.poder), p.map((x) => x.lotacao), p.map((x) => x.cargo), p.map((x) => x.tipo_cargo),
       p.map((x) => x.situacao), p.map((x) => x.nome), p.map((x) => x.bruto), p.map((x) => x.descontos),
       p.map((x) => x.liquido), p.map((x) => x.cpfs), p.map((x) => x._hash)]
    );
  }
}

let totalLinhas = 0, erros = [];
const t00 = Date.now();
for (let i = 0; i < fila.length; i++) {
  const ente = fila[i];
  const t0 = Date.now();
  let linhas = null, ultimo;
  for (let tent = 0; tent < 3 && !linhas; tent++) {
    try {
      await rpc("ClearAll", appH, [false]);
      await selecionar(rpc, appH, "anoMes", MES);
      await selecionar(rpc, appH, "Esfera", "Municipal");
      await selecionar(rpc, appH, "Ente", ente);
      const r = await tabela(rpc, appH, DIMS, MEDIDAS);
      linhas = r.linhas;
    } catch (e) {
      ultimo = e;
      console.log(`  ⚠ ${ente} tentativa ${tent + 1}: ${e.message.slice(0, 90)}`);
      await religar();
    }
  }
  if (!linhas) { erros.push({ ente, erro: ultimo?.message }); continue; }

  const regs = linhas.map((l) => {
    const [cod_ibge, municipio, orgao, poder, lotacao, cargo, tipo_cargo, situacao, nome] = l.d;
    const bruto = l.m[0] || 0, descontos = l.m[1] || 0;
    return {
      anomes: MES, cod_ibge, municipio, orgao, poder, lotacao, cargo, tipo_cargo, situacao, nome,
      bruto, descontos, liquido: bruto - descontos, cpfs: Math.round(l.m[2] || 0),
      _hash: crypto.createHash("md5").update([MES, municipio, orgao, lotacao, cargo, tipo_cargo, situacao, nome].join("¦")).digest("hex"),
    };
  });
  await gravar(regs);
  totalLinhas += regs.length;
  const folha = regs.reduce((s, r) => s + r.bruto, 0);
  console.log(`  [${i + 1}/${fila.length}] ${ente}: ${regs.length} linhas · R$ ${(folha / 1e6).toFixed(2)} mi · ${((Date.now() - t0) / 1000).toFixed(1)}s`);
}

console.log(`\n[folha ${MES}] ${totalLinhas} linhas gravadas em ${((Date.now() - t00) / 60000).toFixed(1)} min · ${erros.length} entes com erro`);
erros.forEach((e) => console.log(`  ✖ ${e.ente}: ${String(e.erro).slice(0, 120)}`));
fechar();
await db.end();
