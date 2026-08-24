// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
// ingest_folha_cgm_al.mjs — folha nominal do white-label da CONTROLADORIA GERAL DO MUNICÍPIO (Alagoas).
//
// ⭐ COMO ESTE BLOCO APARECEU: o `diagnostica_faltantes.mjs` carimbou 60 dos 73 municípios de AL como
//    "sem item de pessoal" / "tela sem linhas" — mas ele visitou o SITE INSTITUCIONAL, que foi o que a
//    `radar_portal` tinha. A folha mora noutro host: `transparencia.{slug}.al.gov.br`. Testado o padrão,
//    21 dos 68 responderam ([[pnigp-rotulo-erp-nao-e-o-portal-da-folha]]).
//    ⚠️ A LIÇÃO: veredito de diagnóstico vale pela URL que ele visitou. "Sem item de pessoal" no site
//    institucional não é "o município não publica" — foi o mesmo erro que carimbou 20 municípios de SP.
//
// A TELA (`/servidores/`) traz os cinco campos: Matrícula · Nome · Cargo · Órgão · Total de Proventos ·
// Total de Descontos · Líquido. Rodapé "Controladoria Geral do Municipio (CGM)".
//
// 🚨 SÃO DOIS ENDPOINTS, e usar o errado grava folha de mês desconhecido:
//   `proc_pesq_user2.php`  — DataTables SEM filtro. Devolve o mês corrente do portal e **ignora ano/mes**
//                            (testado: mes=1/2020 devolve os mesmos 324 registros). Serve para SONDAR se o
//                            município publica, nunca para gravar.
//   `proc_pesq_user3.php`  — o mesmo DataTables COM os filtros `ano`, `mes`, `cargo`, `nome`, `orgao`,
//                            `regime`. É este que responde por competência. É POST puro: navegador só foi
//                            preciso para DESCOBRIR o contrato, não para coletar.
//
// 🚨 COMPETÊNCIA MAIS CHEIA, dezembro por último — a mesma regra do resto da casa
//    ([[pnigp-competencia-mais-cheia-nao-a-recente]], [[pnigp-dezembro-fim-de-mandato-nao-e-salario]]).
//    Medido em Maravilha: 2026 vai só até fevereiro (297 em jan, 324 em fev) e 2025 está inteiro — varrer só
//    o ano corrente pegaria o mês mais magro ([[pnigp-recuo-curto-perde-quem-parou]]).
//
// Uso: node scripts/ingest_folha_cgm_al.mjs [SO=<parte do nome>] [REFAZ=1] [UF=AL] [RECUO_ANOS=2]
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
import crypto from "crypto";
import { pool, withRetry } from "./_cadprev.mjs";

const db = pool();
const q = withRetry(db);
const SO = process.env.SO || null;
const UF = process.env.UF || "AL";
const REFAZ = process.env.REFAZ === "1";
const RECUO_ANOS = Number(process.env.RECUO_ANOS || 2);
const CONC = Number(process.env.CONC || 4);
const H = {
  "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "content-type": "application/x-www-form-urlencoded; charset=UTF-8",
  "x-requested-with": "XMLHttpRequest",
};

await q(`create table if not exists folha_servidores_cgmal (
  cod_ibge text, municipio text, uf text, base_url text, competencia text,
  matricula text, nome text, cargo text, orgao text, secretaria text,
  proventos numeric, descontos numeric, liquido numeric,
  _hash text primary key, _coletado_em timestamptz default now()
)`);
await q(`create index if not exists ix_folha_cgmal_mun on folha_servidores_cgmal (cod_ibge, competencia)`);
await q(`create table if not exists folha_cgmal_coleta (
  cod_ibge text primary key, municipio text, uf text, base_url text, competencia text,
  linhas int, situacao text, detalhe text, em timestamptz default now()
)`);

const dorme = (ms) => new Promise((s) => setTimeout(s, ms));
const slug = (s) => String(s).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
const money = (s) => {
  if (s == null) return null;
  const t = String(s).replace(/R\$|\s/g, "").replace(/\./g, "").replace(",", ".");
  const n = +t; return Number.isFinite(n) ? n : null;
};

// o corpo do DataTables. As 7 colunas visíveis são fixas nesta tela; o resto do array vem repetido no fim.
const corpo = (ano, mes, start, length) => {
  const p = new URLSearchParams();
  p.set("draw", "1");
  for (let i = 0; i < 7; i++) {
    p.set(`columns[${i}][data]`, String(i)); p.set(`columns[${i}][name]`, "");
    p.set(`columns[${i}][searchable]`, "true"); p.set(`columns[${i}][orderable]`, "true");
    p.set(`columns[${i}][search][value]`, ""); p.set(`columns[${i}][search][regex]`, "false");
  }
  p.set("order[0][column]", "1"); p.set("order[0][dir]", "asc");
  p.set("start", String(start)); p.set("length", String(length));
  p.set("search[value]", ""); p.set("search[regex]", "false");
  p.set("ano", String(ano)); p.set("mes", String(mes));
  p.set("cargo", ""); p.set("nome", ""); p.set("orgao", ""); p.set("regime", "");
  return p;
};

const chama = async (base, ano, mes, start, length, script = "proc_pesq_user3.php") => {
  const r = await fetch(base + script, {
    method: "POST", headers: { ...H, referer: base }, body: corpo(ano, mes, start, length),
    signal: AbortSignal.timeout(60000),
  });
  if (!r.ok) throw new Error(`http ${r.status}`);
  const t = await r.text();
  let j; try { j = JSON.parse(t); } catch { throw new Error(`resposta não-JSON (${t.length}b)`); }
  return { total: Number(j.recordsFiltered || 0), data: j.data || [] };
};

// 🚨 NÃO LER POR POSIÇÃO FIXA. Os dois endpoints devolvem o array com layouts DIFERENTES: no `user3` os
//    totais vêm em 11/12/13, no `user2` não — e a leitura fixa gravou descontos e líquido zerados nos três
//    municípios do user3 e jogou o valor na coluna errada em Pariconha (proventos nulo, líquido preenchido).
//    A regra robusta é pelo FORMATO: dinheiro no portal é sempre "1.234,56". Os três últimos valores monetários
//    da linha são, nesta ordem, PROVENTOS · DESCONTOS · LÍQUIDO — é assim que a tela de detalhe os imprime.
//    ⚠️ Quando só houver dois, são proventos e líquido (a coluna visível pula o desconto).
// ⚠️ escrever esta linha por script de patch já comeu as contrabarras duas vezes (`[d.]` no lugar de `[\d.]`),
//    e o efeito é silencioso: nenhum valor casa e a folha inteira grava com dinheiro nulo. Editar à mão.
const ehDinheiro = (v) => typeof v === "string" && /^-?[\d.]{1,15},\d{2}$/.test(v.trim());
// 🚨 A ÂNCORA É A REPETIÇÃO DA MATRÍCULA, não a posição. Medido nos dois endpoints com o payload cru na mão:
//      user3 (20 col): [1]matríc [2]nome [3]cargo [4]PROVENTOS [5]LÍQUIDO | [6]matríc… [9]ÓRGÃO
//      user2 (21 col): [1]matríc [2]nome [3]cargo [4]ÓRGÃO [5]PROVENTOS [6]LÍQUIDO | [7]matríc… [10]ÓRGÃO
//    Ou seja: NENHUMA posição fixa serve aos dois, e o órgão muda de lugar. O que não muda é a linha vir
//    duplicada — a matrícula reaparece e marca onde começa o bloco de detalhe. A partir dessa âncora:
//      · os DOIS últimos campos do bloco visível são sempre PROVENTOS e LÍQUIDO;
//      · o órgão é o 3º campo depois da âncora.
//    ⚠️ DESCONTOS sai por ARITMÉTICA (proventos − líquido), não por coluna: as colunas de desconto ficam em
//    índices diferentes nos dois layouts e vários vêm "0,00" mesmo quando há desconto. Subtração não erra.
//    🚨 Eu errei duas vezes aqui antes de olhar o payload — primeiro por posição fixa, depois pela regra dos
//    "três últimos valores monetários", que pegava [17][18][19] e zerava os proventos. Ler o dado cru primeiro.
const leLinha = (a) => {
  const t = a.map((x) => (x == null ? "" : String(x).replace(/<[^>]+>/g, "").trim()));
  const matricula = t[1] || null;
  const rep = matricula ? t.findIndex((x, i) => i > 1 && x === matricula) : -1;
  if (rep < 4) return { matricula, nome: t[2] || null, cargo: t[3] || null, orgao: null, proventos: null, descontos: null, liquido: null };
  const prov = money(t[rep - 2]), liq = money(t[rep - 1]);
  const desc = prov != null && liq != null && prov >= liq ? Math.round((prov - liq) * 100) / 100 : null;
  return {
    matricula, nome: t[2] || null, cargo: t[3] || null,
    orgao: (t[rep + 3] && !ehDinheiro(t[rep + 3]) ? t[rep + 3] : null),
    proventos: prov, descontos: desc, liquido: liq,
  };
};

const muns = (await q(`select cod_ibge, nome, uf from municipios_br where uf = $1 ${SO ? "and nome ilike '%'||$2||'%'" : ""} order by nome`,
  SO ? [UF, SO] : [UF])).rows;
const feitos = REFAZ ? new Set()
  : new Set((await q(`select cod_ibge from folha_cgmal_coleta where situacao like 'ok%'`)).rows.map((r) => r.cod_ibge));
const fila = muns.filter((m) => !feitos.has(m.cod_ibge));
console.log(`[cgm-al] ${muns.length} municípios de ${UF} · ${fila.length} na fila`);

let i = 0, ok = 0, semPortal = 0, total = 0;
async function trabalhador() {
  while (i < fila.length) {
    const m = fila[i++];
    const base = `https://transparencia.${slug(m.nome)}.al.gov.br/servidores/`;
    const marca = (situacao, detalhe, competencia = null, linhas = 0) =>
      q(`insert into folha_cgmal_coleta (cod_ibge,municipio,uf,base_url,competencia,linhas,situacao,detalhe,em)
         values ($1,$2,$3,$4,$5,$6,$7,$8,now()) on conflict (cod_ibge) do update set competencia=excluded.competencia,
         linhas=excluded.linhas, situacao=excluded.situacao, detalhe=excluded.detalhe, em=now()`,
        [m.cod_ibge, m.nome, m.uf, base, competencia, linhas, situacao, detalhe]);
    try {
      // 1) o município roda este produto? A sonda é o **user2**, não o user3: em Coité do Nóia o user3
      //    devolve HTTP 500 e em Pariconha devolve 0 para todo mês, enquanto o user2 lista 450 e 572 pessoas.
      //    Sondar pelo user3 carimbava "sem portal" município que publica ([[pnigp-api-de-fachada-tc]]).
      const hoje = new Date();
      let sonda;
      try { sonda = await chama(base, null, null, 0, 1, "proc_pesq_user2.php"); }
      catch (e) { semPortal++; await marca("sem_portal", String(e.message).slice(0, 120)); continue; }
      if (!sonda.total) { await marca("sem_publicacao", "tela existe e a listagem devolve 0 registros"); continue; }

      // 2) varre as competências: ano corrente para trás, mês a mês, contando sem baixar
      const cands = [];
      for (let a = hoje.getUTCFullYear(); a >= hoje.getUTCFullYear() - RECUO_ANOS; a--) {
        for (let mes = 12; mes >= 1; mes--) {
          const n = await chama(base, a, mes, 0, 1).then((x) => x.total).catch(() => 0);
          if (n > 0) cands.push({ ano: a, mes, n });
        }
        if (cands.length) break;   // achou o ano que publica; não precisa recuar mais
      }
      // ⚠️ user3 inútil neste host (500 ou 0 em tudo) e user2 com gente: colher pelo user2 e declarar a
      //    competência que a PRÓPRIA TELA traz marcada nos selects. É inferência — e vai dita no detalhe,
      //    nunca embutida como se fosse filtro confirmado ([[pnigp-lista-sem-valor-nao-e-folha]] é a mesma
      //    disciplina: dizer o que o dado é, não o que se gostaria que fosse).
      let viaTela = false, compTela = null;
      if (!cands.length) {
        try {
          const html = await (await fetch(base, { headers: { "user-agent": H["user-agent"] }, signal: AbortSignal.timeout(30000) })).text();
          const marcado = (id) => { const i = html.indexOf(`id="${id}"`); if (i < 0) return null;
            const s2 = html.slice(i, html.indexOf("</select>", i));
            return (s2.match(/<option[^>]*value="([^"]*)"[^>]*selected/i) || [])[1] || null; };
          const mm = marcado("mes"), aa = marcado("ano");
          if (mm && aa) { compTela = `${aa}${String(mm).padStart(2, "0")}`; viaTela = true; }
        } catch {}
        if (!viaTela) {
          await marca("sem_competencia", `user2 lista ${sonda.total} pessoas mas o user3 não responde e a tela não declara mês/ano`);
          continue;
        }
        cands.push({ ano: Number(compTela.slice(0, 4)), mes: Number(compTela.slice(4)), n: sonda.total });
      }
      // 🚨 a mais CHEIA entre os meses COMUNS; dezembro só se for a única coisa publicada
      const comuns = cands.filter((c) => c.mes !== 12);
      const alvo = (comuns.length ? comuns : cands).sort((x, y) => y.n - x.n)[0];
      const ressalva = alvo.mes === 12 ? "⚠️ só dezembro publicado — mês de 13º e de rescisões" : null;
      const comp = `${alvo.ano}${String(alvo.mes).padStart(2, "0")}`;

      // 3) baixa a competência escolhida, paginando
      const linhas = [];
      for (let start = 0; start < alvo.n + 500; start += 200) {
        const r = await chama(base, alvo.ano, alvo.mes, start, 200, viaTela ? "proc_pesq_user2.php" : "proc_pesq_user3.php");
        if (!r.data.length) break;
        linhas.push(...r.data.map(leLinha));
        if (linhas.length >= r.total) break;
        await dorme(250);
      }
      const regs = linhas.filter((x) => x.nome).map((s) => ({
        cod_ibge: m.cod_ibge, municipio: m.nome, uf: m.uf, base_url: base, competencia: comp,
        matricula: s.matricula, nome: s.nome, cargo: s.cargo, orgao: s.orgao, secretaria: s.orgao,
        proventos: s.proventos, descontos: s.descontos, liquido: s.liquido,
        // 🚨 O HASH PRECISA DO ÓRGÃO E DO VALOR. Sem eles, Monteirópolis colapsou 566 linhas em 305: a mesma
        // pessoa aparece mais de uma vez na competência (órgãos/vínculos distintos) e virava UMA linha só. Foi o
        // guarda "declarado × colhido" que denunciou — sem ele o município teria terminado 'ok' pela metade
        // ([[pnigp-hash-decide-duplicata-ou-conserto-perdido]]).
        _hash: crypto.createHash("md5").update([m.cod_ibge, comp, s.matricula, s.nome, s.cargo, s.orgao, s.proventos].join("¦")).digest("hex"),
      }));
      if (!regs.length) { await marca("vazio", `competência ${comp} declarou ${alvo.n} e não veio linha`); continue; }
      const mp = new Map(); for (const r of regs) mp.set(r._hash, r);
      const arr = [...mp.values()];
      for (let k = 0; k < arr.length; k += 1000) {
        const p = arr.slice(k, k + 1000); const c = (f) => p.map((x) => x[f]);
        await q(`insert into folha_servidores_cgmal
          (cod_ibge,municipio,uf,base_url,competencia,matricula,nome,cargo,orgao,secretaria,proventos,descontos,liquido,_hash)
          select * from unnest($1::text[],$2::text[],$3::text[],$4::text[],$5::text[],$6::text[],$7::text[],$8::text[],
            $9::text[],$10::text[],$11::numeric[],$12::numeric[],$13::numeric[],$14::text[])
          on conflict (_hash) do update set proventos=excluded.proventos, descontos=excluded.descontos,
            liquido=excluded.liquido, _coletado_em=now()`,
          [c("cod_ibge"), c("municipio"), c("uf"), c("base_url"), c("competencia"), c("matricula"), c("nome"),
           c("cargo"), c("orgao"), c("secretaria"), c("proventos"), c("descontos"), c("liquido"), c("_hash")]);
      }
      // ⚠️ declarado × colhido: sem esta conferência a paginação incompleta termina 'ok'
      const parcial = arr.length < alvo.n ? `PARCIAL: ${arr.length} de ${alvo.n} declarados` : null;
      ok++; total += arr.length;
      const origem = viaTela ? "competência declarada pela TELA (user3 indisponível), não confirmada por filtro" : null;
      await marca(viaTela ? "ok_tela" : "ok", [parcial, ressalva, origem].filter(Boolean).join(" | ") || null, comp, arr.length);
      console.log(`  ✔ ${String(m.nome).padEnd(26)} ${String(arr.length).padStart(5)} servidores · ${comp}${parcial ? " ⚠️ " + parcial : ""}`);
    } catch (e) {
      await marca("erro", String(e.message).slice(0, 150));
      console.log(`  ✖ ${String(m.nome).padEnd(26)} ${String(e.message).slice(0, 70)}`);
    }
  }
}
await Promise.all(Array.from({ length: CONC }, trabalhador));
console.log(`\n[cgm-al] ${total.toLocaleString("pt-BR")} servidores · ${ok} municípios ok · ${semPortal} sem este portal`);
await db.end();
