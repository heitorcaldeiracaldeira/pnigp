// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
// ingest_folha_datapublic.mjs — folha NOMINAL dos municípios DATAPUBLIC (`/datapublic/transparencia/{slug}/`).
//
// ⭐ O FLUXO (ASP.NET + DevExpress, on-premise em IP:porta alta):
//   1. `/Sistema/EscolheUG.aspx` — grid `gdreferencia` com UG × Tipo de Folha × Poder × Exercício
//   2. 🚨 selecionar NÃO é clicar na linha: é `gdreferencia.SelectRowOnPage(i, true)` e depois o botão submit
//      `#ctl00_cpbody_gdreferencia_Title_btSelecionar_I`, que fica no TÍTULO do grid. Clicar na célula ou no
//      texto "Selecionar" não faz nada e a tela devolve "FAVOR SELECIONAR A REFERÊNCIA" para sempre.
//   3. `/Funcionarios/Funcionario.aspx` — colunas MATRIC · NOME · CARGO · Descrição Cargo · BRUTO · DESCONTO · LIQUIDO
//
// ⚠️ A referência escolhe TIPO DE FOLHA: preferir `NORMAL` + poder `EXECUTIVO`. "13º"/"FÉRIAS"/"RESCISÃO"
//    inflam e a câmara é outra entidade ([[pnigp-entidade-espelho-infla-folha]]).
// ⚠️ A competência aqui é o EXERCÍCIO (ano), não o mês — carimbada como AAAA no campo `referencia`.
//
// Uso: UF=RN node scripts/ingest_folha_datapublic.mjs   ·   SO=Jardim   ·   REFAZ=1
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
import crypto from "crypto";
import { chromium } from "playwright";
import { pool, withRetry } from "./_cadprev.mjs";

const db = pool();
const q = withRetry(db);
const UF = process.env.UF || "RN";
const SO = process.env.SO || null;
const REFAZ = process.env.REFAZ === "1";
const dorme = (ms) => new Promise((s) => setTimeout(s, ms));

await q(`create table if not exists folha_servidores_datapublic (
  cod_ibge text, municipio text, uf text, base text, referencia text, unidade_gestora text, tipo_folha text, poder text,
  matricula text, nome text, cargo_cod text, cargo text, bruto numeric, descontos numeric, liquido numeric,
  _hash text primary key, _coletado_em timestamptz default now()
)`);
await q(`create index if not exists ix_folha_dp_mun on folha_servidores_datapublic (cod_ibge, referencia)`);
await q(`create table if not exists folha_datapublic_coleta (
  cod_ibge text primary key, municipio text, uf text, base text, referencia text, linhas int, declarado int,
  situacao text, detalhe text, em timestamptz default now()
)`);

const money = (s) => {
  const t = String(s ?? "").replace(/R\$|\s/g, "").replace(/\./g, "").replace(",", ".");
  const n = +t; return Number.isFinite(n) && t !== "" ? n : null;
};
const txt = (s) => { const v = String(s ?? "").trim(); return v && v !== "-" ? v : null; };
// base = até o diretório do município, sem /Sistema/... nem query
const baseDe = (u) => {
  const m = String(u).match(/^(https?:\/\/[^\/]+\/datapublic\/transparencia\/[^\/]+)/i);
  return m ? m[1] : null;
};

const alvos = (await q(`select cod_ibge, municipio, url from folha_host_candidato
  where uf = $1 and produto = 'datapublic' ${SO ? "and municipio ilike '%'||$2||'%'" : ""}
  order by municipio`, SO ? [UF, SO] : [UF])).rows;
const feitos = REFAZ ? new Set()
  : new Set((await q(`select cod_ibge from folha_datapublic_coleta where situacao = 'ok'`)).rows.map((r) => r.cod_ibge));
const fila = alvos.filter((a) => !feitos.has(a.cod_ibge));
console.log(`[datapublic] ${UF}: ${alvos.length} candidatos · ${fila.length} na fila`);

const LOTE = 1000;
async function grava(regs) {
  const m = new Map(); for (const r of regs) m.set(r._hash, r);
  const arr = [...m.values()];
  for (let i = 0; i < arr.length; i += LOTE) {
    const p = arr.slice(i, i + LOTE); const c = (f) => p.map((x) => x[f]);
    await q(`insert into folha_servidores_datapublic
      (cod_ibge,municipio,uf,base,referencia,unidade_gestora,tipo_folha,poder,matricula,nome,cargo_cod,cargo,
       bruto,descontos,liquido,_hash)
      select * from unnest($1::text[],$2::text[],$3::text[],$4::text[],$5::text[],$6::text[],$7::text[],$8::text[],
        $9::text[],$10::text[],$11::text[],$12::text[],$13::numeric[],$14::numeric[],$15::numeric[],$16::text[])
      on conflict (_hash) do update set bruto=excluded.bruto, liquido=excluded.liquido, _coletado_em=now()`,
      [c("cod_ibge"), c("municipio"), c("uf"), c("base"), c("referencia"), c("unidade_gestora"), c("tipo_folha"),
       c("poder"), c("matricula"), c("nome"), c("cargo_cod"), c("cargo"), c("bruto"), c("descontos"), c("liquido"),
       c("_hash")]);
  }
}

const browser = await chromium.launch({ headless: true, args: ["--ignore-certificate-errors"] });
let totalGeral = 0, ok = 0, vazios = 0, falhas = 0;
for (let i = 0; i < fila.length; i++) {
  const a = fila[i];
  const base = baseDe(a.url);
  const marca = (situacao, detalhe, linhas = 0, declarado = 0, referencia = null) =>
    q(`insert into folha_datapublic_coleta (cod_ibge,municipio,uf,base,referencia,linhas,declarado,situacao,detalhe,em)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,now()) on conflict (cod_ibge) do update set
       base=excluded.base, referencia=excluded.referencia, linhas=excluded.linhas, declarado=excluded.declarado,
       situacao=excluded.situacao, detalhe=excluded.detalhe, em=now()`,
      [a.cod_ibge, a.municipio, UF, base, referencia, linhas, declarado, situacao, detalhe]);
  if (!base) { await marca("sem_base", `URL fora do padrão: ${String(a.url).slice(0, 80)}`); falhas++; continue; }

  const ctx = await browser.newContext({ ignoreHTTPSErrors: true,
    userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36" });
  const page = await ctx.newPage();
  try {
    const r0 = await page.goto(`${base}/Sistema/EscolheUG.aspx`, { waitUntil: "domcontentloaded", timeout: 60000 }).catch(() => null);
    if (!r0 || r0.status() >= 400) { await marca("fora_do_ar", `HTTP ${r0?.status() ?? "sem resposta"}`); vazios++; continue; }
    await dorme(5000);

    // lê as referências: [descrição UG, UG, descr. tipo folha, tipo folha, poder, exercício]
    const refs = await page.evaluate(() => [...document.querySelectorAll("tr[class*=dxgvDataRow]")]
      .map((tr, idx) => ({ idx, cols: [...tr.cells].map((c) => c.innerText.replace(/\s+/g, " ").trim()) })));
    if (!refs.length) { await marca("sem_referencia", "EscolheUG sem linhas"); vazios++; continue; }

    // ⭐ prefere NORMAL + EXECUTIVO e o exercício mais recente; 13º/férias/rescisão inflam, câmara é outra entidade
    const nota = (c) => {
      const t = c.join(" ").toUpperCase();
      let n = 0;
      if (/NORMAL/.test(t)) n += 100;
      if (/EXECUTIVO/.test(t)) n += 50;
      if (/13|FERIAS|F[ÉE]RIAS|RESCIS|COMPLEMENT/.test(t)) n -= 200;
      if (/LEGISLATIV|C[ÂA]MARA/.test(t)) n -= 150;
      const ano = +(t.match(/\b(20\d\d)\b/) || [])[1] || 0;
      return n + ano / 100;
    };
    const escolhida = [...refs].sort((x, y) => nota(y.cols) - nota(x.cols))[0];
    const ref = escolhida.cols;
    const exercicio = (ref.join(" ").match(/\b(20\d\d)\b/) || [])[1] || null;

    const selecionou = await page.evaluate(async (idx) => {
      const nomes = Object.keys(window).filter((k) => { try { return typeof window[k]?.SelectRowOnPage === "function"; } catch { return false; } });
      if (!nomes.length) return false;
      window[nomes[0]].SelectRowOnPage(idx, true);
      await new Promise((f) => setTimeout(f, 1200));
      const bt = document.querySelector("#ctl00_cpbody_gdreferencia_Title_btSelecionar_I")
        || [...document.querySelectorAll("input[type=submit]")].find((b) => /selecionar/i.test(b.value || ""));
      if (!bt) return false;
      bt.click();
      return true;
    }, escolhida.idx);
    if (!selecionou) { await marca("sem_botao", "não achou SelectRowOnPage/btSelecionar"); falhas++; continue; }
    await dorme(7000);

    await page.goto(`${base}/Funcionarios/Funcionario.aspx`, { waitUntil: "domcontentloaded", timeout: 60000 }).catch(() => {});
    await page.waitForFunction(() => document.querySelectorAll("tr[class*=dxgvDataRow]").length > 0
      || /nenhum|não há|sem registro/i.test(document.body.innerText), { timeout: 40000 }).catch(() => {});
    await dorme(1500);

    const colhido = await page.evaluate(async () => {
      const dorme = (ms) => new Promise((f) => setTimeout(f, ms));
      const heads = [...document.querySelectorAll("td[class*=dxgvHeader]")].map((h) => h.innerText.trim().toLowerCase());
      const col = (re) => heads.findIndex((h) => re.test(h));
      const ix = { mat: col(/matric/), nome: col(/nome/), cargoCod: col(/^cargo$/), cargo: col(/descri.*cargo/),
        bruto: col(/bruto/), desc: col(/desconto/), liq: col(/l[íi]quido/) };
      // 🚨 achar o grid POR CAPACIDADE, não por nome — o nome muda por instalação
      //    ([[pnigp-devexpress-gotopage-nao-nextpage]])
      const acheGrid = () => {
        for (const k of Object.keys(window)) {
          try { const o = window[k];
            if (o && typeof o.GotoPage === "function" && typeof o.GetPageCount === "function"
                && /func/i.test(k)) return o;
          } catch {}
        }
        for (const k of Object.keys(window)) {
          try { const o = window[k];
            if (o && typeof o.GotoPage === "function" && typeof o.GetPageCount === "function") return o;
          } catch {}
        }
        return null;
      };
      const grid = acheGrid();
      const totalPag = grid?.GetPageCount?.() || 1;
      const declarado = +((document.body.innerText.match(/\((\d+)\s*itens\)/) || [])[1] || 0);
      const out = []; const vistos = new Set();
      const lePagina = () => {
        for (const tr of document.querySelectorAll("tr[class*=dxgvDataRow]")) {
          const c = [...tr.cells].map((x) => x.innerText.replace(/\s+/g, " ").trim());
          const nome = c[ix.nome]; if (!nome) continue;
          const k = `${c[ix.mat]}|${nome}|${c[ix.bruto]}`;
          if (vistos.has(k)) continue; vistos.add(k);
          out.push({ matricula: c[ix.mat], nome, cargo_cod: c[ix.cargoCod], cargo: c[ix.cargo],
            bruto: c[ix.bruto], descontos: c[ix.desc], liquido: c[ix.liq] });
        }
      };
      lePagina();
      let secas = 0;
      for (let pg = 1; pg < totalPag && pg < 300; pg++) {
        const antes = out.length;
        for (let t = 0; t < 2 && out.length === antes; t++) {
          grid.GotoPage(pg);
          for (let w = 0; w < 60; w++) { await dorme(300); if (grid.GetPageIndex?.() === pg) break; }
          await dorme(400);
          lePagina();
        }
        if (out.length === antes) { if (++secas >= 2) break; } else secas = 0;
      }
      return { linhas: out, declarado, paginas: totalPag };
    }).catch(() => ({ linhas: [], declarado: 0, paginas: 0 }));

    const rows = colhido.linhas || [];
    if (!rows.length) { await marca("vazio", "grid de funcionários sem linhas", 0, 0, exercicio); vazios++;
      console.log(`  · ${a.municipio}: vazio`); continue; }

    const regs = rows.map((s) => ({
      cod_ibge: a.cod_ibge, municipio: a.municipio, uf: UF, base, referencia: exercicio,
      unidade_gestora: txt(ref[0]), tipo_folha: txt(ref[2]), poder: txt(ref[4]),
      matricula: txt(s.matricula), nome: txt(s.nome), cargo_cod: txt(s.cargo_cod), cargo: txt(s.cargo),
      bruto: money(s.bruto), descontos: money(s.descontos), liquido: money(s.liquido),
      _hash: crypto.createHash("md5").update([a.cod_ibge, exercicio, ref[1], s.matricula, s.nome, s.cargo].join("¦")).digest("hex"),
    }));
    await grava(regs);
    totalGeral += regs.length; ok++;
    // régua contra subcoleta silenciosa ([[pnigp-scpi-subcoleta-78-municipios]])
    const faltou = colhido.declarado && regs.length < colhido.declarado * 0.95;
    await marca(faltou ? "subcoletado" : "ok",
      faltou ? `portal declara ${colhido.declarado}, colhi ${regs.length}` : `${ref[2]} · ${ref[4]}`,
      regs.length, colhido.declarado || 0, exercicio);
    console.log(`  [${i + 1}/${fila.length}] ${a.municipio}: ${regs.length} servidores · ${exercicio} · ${ref[2]}/${ref[4]}` +
      (faltou ? `  ⚠️ SUBCOLETADO — declara ${colhido.declarado}` : ""));
  } catch (e) {
    await marca("falha", String(e.message).slice(0, 160)); falhas++;
    console.log(`  ✖ ${a.municipio}: ${String(e.message).slice(0, 70)}`);
  } finally { await ctx.close().catch(() => {}); }
}
await browser.close();
console.log(`\n[datapublic] ${totalGeral.toLocaleString("pt-BR")} servidores · ${ok} ok · ${vazios} vazios · ${falhas} falhas`);
await db.end();
