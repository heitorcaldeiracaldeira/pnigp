// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
// ingest_folha_elotech_ficha.mjs — a SÉRIE MENSAL do Elotech, que a listagem não entrega.
//
// POR QUÊ: `/servidores?entidade=&exercicio=` devolve o CADASTRO do exercício — sem competência mensal e, em
// alguns municípios, sem valor nenhum (Maringá 14.876 servidores, Umuarama 3.370, Ibiporã 1.840: `remuneracao`
// nula em todos). Era o maior buraco de competência da base: 132.801 linhas com ano e sem mês.
//
// ⭐ A ficha `/servidores/{matricula}` traz `dadosFinanceiros[]` com a série mensal COMPLETA:
//    `anoCompetencia · mesCompetencia · salarioBase · vencimentos · descontos · descricaoTipoFolha`.
//    A mesma matrícula aparece VÁRIAS vezes no mesmo mês, uma por tipo de folha ("Folha Mensal",
//    "Folha Complementar", 13º) — por isso o tipo entra na chave, senão as parcelas colapsam numa só.
//
// 🚨 A listagem NÃO aceita pedir o financeiro junto: testei `dadosFinanceiros=true`, `comRemuneracao=true`,
//    `mes=`, `competencia=`, `exibeRemuneracao=true` — todos devolvem 200 com `dadosFinanceiros: []`.
//    É mesmo uma requisição por servidor. Ir ficha a ficha nos 135.649 servidores custaria ~38 h, então o
//    padrão deste script é atacar só quem está SEM VALOR ([[pnigp-job-longo-vai-para-o-agendador]]).
// 🚨 `/servidores/remuneracao` responde 500 com `MethodArgumentTypeMismatchException`: NÃO é rota que falta
//    parâmetro — é `/servidores/{id}` recebendo "remuneracao" onde espera número. 500 nem sempre é promessa.
// ⭐ Dois hosts servem a MESMA API: `{slug}.oxy.elotech.com.br` (novo) e `{slug}.eloweb.net` (clássico).
//
// Uso: node scripts/ingest_folha_elotech_ficha.mjs   · TUDO=1 inclui quem já tem valor · SO=maringa · CONC=3
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
import crypto from "crypto";
import { pool, withRetry } from "./_cadprev.mjs";

const db = pool();
const q = withRetry(db);
const SO = process.env.SO || null;
const TUDO = process.env.TUDO === "1";
const CONC = +(process.env.CONC || 3);
const EXERCICIO = process.env.EXERCICIO || String(new Date().getFullYear());
const PAUSA = +(process.env.PAUSA || 250);
const UA = { "user-agent": "Mozilla/5.0 (compatible; PNIGP/1.0; pesquisa de dados publicos)", accept: "application/json" };
const dorme = (ms) => new Promise((s) => setTimeout(s, ms));

await q(`create table if not exists folha_servidores_elotech_mensal (
  cod_ibge text, municipio text, uf text, entidade_id text, competencia text,
  matricula text, nome text, cargo text, lotacao text, vinculo text, situacao text,
  tipo_folha text, salario_base numeric, bruto numeric, descontos numeric, liquido numeric,
  _hash text primary key, _coletado_em timestamptz default now()
)`);
await q(`create index if not exists ix_folha_elo_mensal on folha_servidores_elotech_mensal (cod_ibge, competencia)`);
await q(`create table if not exists folha_elotech_ficha_coleta (
  cod_ibge text primary key, municipio text, fichas int, linhas int, situacao text, detalhe text,
  em timestamptz default now()
)`);

// ⭐ o host JÁ foi descoberto pelo coletor de cadastro e está em `elotech_portal` — usar, não adivinhar
//    ([[pnigp-ordem-retorno-resondar-corrigir-criar]]). Só cai na sondagem quem não estiver lá.
async function achaHost(slug, entidade) {
  for (const h of [`${slug}.oxy.elotech.com.br`, `${slug}.eloweb.net`]) {
    const r = await fetch(`https://${h}/portaltransparencia-api/api/servidores?entidade=${entidade}&exercicio=${new Date().getFullYear()}&size=1`,
      { headers: { ...UA, entidade: String(entidade) }, signal: AbortSignal.timeout(45000) }).catch(() => null);
    if (r?.ok) return h;
  }
  return null;
}

// ⚠️ um município tem VÁRIAS entidades (Ibiporã: 1,2,3,5) — agrupar por município e usar a entidade DE CADA
//    servidor na hora de pedir a ficha
const alvos = (await q(`select f.cod_ibge, f.municipio, f.uf, f.slug, min(p.host) host,
    min(f.entidade_id) entidade_id, count(*)::int n
  from folha_servidores_elotech f
  left join elotech_portal p on p.cod_ibge = f.cod_ibge
  where f.slug is not null ${TUDO ? "" : "and f.remuneracao is null"}
  -- ⚠️ o filtro olha folha_servidores_elotech.remuneracao, que a coleta de ficha NÃO altera (grava em outra
  --    tabela). Sem esta guarda o município já coletado volta para a fila e as fichas são refeitas do zero.
  ${process.env.REFAZER === "1" ? "" :
    "and not exists (select 1 from folha_servidores_elotech_mensal m where m.cod_ibge = f.cod_ibge)"}
  ${SO ? "and (f.municipio ilike '%'||$1||'%' or f.slug = $1)" : ""}
  group by 1,2,3,4 order by 7 desc`, SO ? [SO] : [])).rows;
console.log(`[elo-ficha] ${alvos.length} municípios · ${alvos.reduce((a, x) => a + x.n, 0).toLocaleString("pt-BR")} fichas`);

for (const a of alvos) {
  const marca = (situacao, detalhe, fichas = 0, linhas = 0) =>
    q(`insert into folha_elotech_ficha_coleta (cod_ibge,municipio,fichas,linhas,situacao,detalhe,em)
       values ($1,$2,$3,$4,$5,$6,now()) on conflict (cod_ibge) do update set fichas=excluded.fichas,
         linhas=excluded.linhas, situacao=excluded.situacao, detalhe=excluded.detalhe, em=now()`,
      [a.cod_ibge, a.municipio, fichas, linhas, situacao, detalhe]);
  const host = a.host || await achaHost(a.slug, a.entidade_id);
  if (!host) { await marca("sem_host", "nem oxy nem eloweb responderam"); console.log(`  ✖ ${a.municipio}: host não responde`); continue; }
  const B = `https://${host}/portaltransparencia-api/api`;
  // 🚨 o header `exercicio` é OBRIGATÓRIO para a ficha trazer `dadosFinanceiros`. Sem ele a API responde
  //    200 com a ficha cadastral e `dadosFinanceiros: []` — 6.500 fichas de Maringá vieram vazias assim,
  //    sem um único erro. Silêncio não é ausência de dado ([[pnigp-coletor-ok-sem-dado-sete-causas]]).
  const H = { ...UA, entidade: String(a.entidade_id), exercicio: String(EXERCICIO) };

  const servidores = (await q(`select matricula, nome, cargo, lotacao, vinculo, situacao, entidade_id
    from folha_servidores_elotech where cod_ibge = $1 ${TUDO ? "" : "and remuneracao is null"}`, [a.cod_ibge])).rows;
  const regs = [];
  // 🚨 contar as respostas NÃO-ok: sem isso, 6.500 fichas com HTTP 500 imprimiram "0 linhas" como se o
  //    município não publicasse. Zero linhas com zero erros relatados é sintoma, não conclusão.
  let feitas = 0, comSerie = 0, ruins = 0;
  const fila = [...servidores];
  const trabalhador = async () => {
    while (fila.length) {
      const s = fila.pop();
      const r = await fetch(`${B}/servidores/${encodeURIComponent(s.matricula)}?entidade=${s.entidade_id || a.entidade_id}`,
        { headers: H, signal: AbortSignal.timeout(90000) }).catch(() => null);
      feitas++;
      if (!r?.ok) ruins++;
      if (r?.ok) {
        const j = await r.json().catch(() => null);
        const serie = j?.dadosFinanceiros || [];
        if (serie.length) comSerie++;
        for (const d of serie) {
          if (!d.anoCompetencia || !d.mesCompetencia) continue;
          const comp = `${d.anoCompetencia}${String(d.mesCompetencia).padStart(2, "0")}`;
          const bruto = d.vencimentos != null ? +d.vencimentos : null;
          // 🚨 parte dos portais manda `descontos` JÁ NEGATIVO (Quinta do Sol: bruto 23.096, descontos -13.955).
          //    Sem o abs, `bruto - desc` SOMA e o líquido sai maior que o bruto — saíram 5.450 linhas assim.
          //    Mesmo defeito do Farol TCE-SC ([[pnigp-farol-tce-pessoal-qlik]]).
          const desc = d.descontos != null ? Math.abs(+d.descontos) : null;
          const tipo = d.descricaoTipoFolha || null;
          regs.push({ cod_ibge: a.cod_ibge, municipio: a.municipio, uf: a.uf, entidade_id: String(a.entidade_id),
            competencia: comp, matricula: String(s.matricula), nome: s.nome, cargo: s.cargo, lotacao: s.lotacao,
            vinculo: s.vinculo, situacao: s.situacao, tipo_folha: tipo,
            salario_base: d.salarioBase != null ? +d.salarioBase : null, bruto, descontos: desc,
            liquido: bruto != null && desc != null ? +(bruto - desc).toFixed(2) : null,
            // 🚨 o TIPO DE FOLHA entra na chave: a mesma matrícula tem "Folha Mensal" e "Folha Complementar"
            //    no MESMO mês; sem ele as parcelas colapsam e o mês fica subestimado
            _hash: crypto.createHash("md5")
              .update([a.cod_ibge, comp, s.matricula, tipo, d.codigoCalculo ?? ""].join("¦")).digest("hex") });
        }
      }
      if (feitas % 500 === 0) console.log(`   … ${a.municipio}: ${feitas}/${servidores.length} fichas · ${regs.length} linhas · ${ruins} respostas com erro`);
      await dorme(PAUSA);
    }
  };
  await Promise.all(Array.from({ length: CONC }, trabalhador));

  if (regs.length) {
    const m = new Map(); for (const r of regs) m.set(r._hash, r);
    const arr = [...m.values()];
    for (let i = 0; i < arr.length; i += 500) {
      const p = arr.slice(i, i + 500); const c = (f) => p.map((x) => x[f]);
      await q(`insert into folha_servidores_elotech_mensal
        (cod_ibge,municipio,uf,entidade_id,competencia,matricula,nome,cargo,lotacao,vinculo,situacao,
         tipo_folha,salario_base,bruto,descontos,liquido,_hash)
        select * from unnest($1::text[],$2::text[],$3::text[],$4::text[],$5::text[],$6::text[],$7::text[],$8::text[],
          $9::text[],$10::text[],$11::text[],$12::text[],$13::numeric[],$14::numeric[],$15::numeric[],$16::numeric[],$17::text[])
        on conflict (_hash) do update set bruto=excluded.bruto, descontos=excluded.descontos,
          liquido=excluded.liquido, _coletado_em=now()`,
        [c("cod_ibge"), c("municipio"), c("uf"), c("entidade_id"), c("competencia"), c("matricula"), c("nome"),
         c("cargo"), c("lotacao"), c("vinculo"), c("situacao"), c("tipo_folha"), c("salario_base"), c("bruto"),
         c("descontos"), c("liquido"), c("_hash")]);
    }
    await marca("ok", `${comSerie} de ${feitas} fichas com série · ${ruins} respostas com erro`, feitas, arr.length);
    console.log(`  ✔ ${a.municipio.padEnd(22)} ${feitas} fichas → ${arr.length.toLocaleString("pt-BR")} linhas mensais (${comSerie} com série, ${ruins} erros)`);
  } else {
    // distinguir "não publica" de "eu chamei errado" — a diferença está no número de erros
    const causa = ruins > feitas * 0.5 ? `${ruins} de ${feitas} fichas responderam ERRO — suspeitar da chamada, não do portal`
                                       : `${feitas} fichas, nenhuma com dadosFinanceiros (portal não publica)`;
    await marca("vazio", causa, feitas, 0);
    console.log(`  ○ ${a.municipio.padEnd(22)} ${causa}`);
  }
}
await db.end();
