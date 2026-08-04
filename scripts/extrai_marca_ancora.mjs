// EXTRATOR DE MARCA POR ÂNCORA DE VALOR — o método que o Bento (Heitor) ensinou, provado ponta a ponta:
//   a marca de produto NÃO está na spec do edital (art. 41 veda) nem colada na descrição — está na linha do
//   VENCEDOR, na Ata de Homologação/Adjudicação/Final ("Outros Documentos", tipo 16/11/19). Nessa linha
//   coexistem: fornecedor · MARCA · modelo · qtd · VALOR UNITÁRIO. O valor homologado (unit_homologado, da API)
//   é ÚNICO no documento → ancora exatamente na linha do vencedor → a marca está a -500/+200 dali (medido: 99%).
//
// Determinístico primeiro (rótulo "Marca:" / coluna); LLM só entra num passe SEPARADO no resíduo (janela tem o
// token 'marca' mas sem rótulo). Casa pelo NÚMERO do item (o valor já identifica a linha), confirma com CNPJ do
// vencedor / quantidade. Grava item_marca_sc. Resumível. Zero LLM neste arquivo.
//
//   node scripts/extrai_marca_ancora.mjs            # produção (grava)
//   VALIDA=1 node scripts/extrai_marca_ancora.mjs   # valida recall/precisão contra as marcas já conhecidas
import fs from "fs"; import path from "path"; import { fileURLToPath } from "url"; import pg from "pg";
const __dirname = path.dirname(fileURLToPath(import.meta.url)); const ROOT = path.join(__dirname, "..");
const U = fs.readFileSync(path.join(ROOT, ".env.local"), "utf8").match(/^DATABASE_URL=(.+)$/m)[1].trim();
const LIMIT = Number(process.env.LIMIT || 0);
const VALIDA = process.env.VALIDA === "1";
const TESTA_HAIKU = process.env.TESTA_HAIKU === "1";   // roda Haiku na janela do resíduo e mede contra a verdade
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// —— Haiku na JANELA (700 chars da linha do vencedor). Só é chamado no resíduo (âncora ok, sem rótulo determinístico).
let _llm = null;
async function haikuMarca(win, fornecedor) {
  if (!_llm) {
    for (const f of [path.join(ROOT, ".env.ai"), path.join(ROOT, ".env.local")])
      try { for (const l of fs.readFileSync(f, "utf8").split("\n")) { const m = l.match(/^([A-Z_]+)=(.*)$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"|"$/g, ""); } } catch {}
    const { anthropic } = await import("@ai-sdk/anthropic"); const { generateObject } = await import("ai"); const { z } = await import("zod");
    const model = anthropic(process.env.RERANK_MODEL_ANTHROPIC || "claude-haiku-4-5");
    const schema = z.object({ marca: z.string().nullable().describe("a MARCA/FABRICANTE do produto do vencedor (ex.: TIGRE, HP, NESTLÉ). NÃO o fornecedor/empresa. null se for serviço, 'Própria', ou não houver marca"), modelo: z.string().nullable() });
    _llm = async (w, forn) => {
      const { object } = await generateObject({ model, schema, temperature: 0,
        system: "Você recebe UMA linha de uma ata de homologação com a proposta do VENCEDOR (fornecedor · marca · modelo · qtd · valor). Extraia a MARCA do produto (o fabricante), nunca o nome da empresa fornecedora. Se for serviço ou 'marca própria', retorne null.",
        prompt: `Fornecedor vencedor: ${forn || "?"}\nLinha da ata:\n${w.slice(0, 700)}` });
      return object;
    };
  }
  // ⚠️ falha do LLM é TRANSITÓRIA (rede/rate-limit/timeout) e NÃO é "não achei marca". Devolvo um objeto que
  // distingue os dois: `{falhou:true}` sobe até o laço, que então NÃO marca o processo como feito.
  try { return await _llm(win, fornecedor); } catch { return { __falhou: true }; }
}

const norm = (s) => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
// as formas que o valor aparece no PDF. Sem piso: a âncora é o valor EXATO homologado do item + a proximidade
// do token 'marca' + confirmação do CNPJ do vencedor desambiguam (valor baixo repetido não engana se a janela
// não tem 'marca' nem o CNPJ certo).
function formasValor(v) {
  const n = Number(v); if (!Number.isFinite(n) || n <= 0) return [];
  const [int, dec] = n.toFixed(2).split(".");
  const cp = int.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return [...new Set([`${cp},${dec}`, `${int},${dec}`])];
}
// LIXO que NUNCA é marca (rótulos, genéricos, "própria/sem marca" = ausência de marca de fabricante)
const LIXO = new Set(["propria", "proprio", "sem marca", "s marca", "nao possui", "n a", "na", "n d", "nd", "generico", "diversos", "varias", "varios", "sem", "outros", "outra", "modelo", "marca", "fabricante", "nacional", "importado", "conforme edital", "a definir", "objeto", "servico", "servicos"]);
// EXTRAI a marca da janela (linha do vencedor). Determinístico: rótulo "Marca:" e variações; para no próximo campo.
function marcaDaJanela(win) {
  if (!win) return null;
  const cands = [];
  // 1) rótulo explícito: Marca / Marca-Fabricante / Fabricante  →  X   (para em modelo/qtd/R$/;/pipe/quebra)
  const reRot = /\b(?:marca(?:\s*[\/-]\s*fabricante)?|fabricante)\s*[:\-–]?\s*([^\n;|]{1,45})/gi;
  let m;
  while ((m = reRot.exec(win)) !== null) {
    let v = m[1]
      .replace(/\b(modelo|model|mod\.?|refer[eê]ncia|ref\.?|c[oó]digo|cod\.?|valor|qtd|quant|unid|unidade|un\b|r\$|pre[çc]o|marca)\b.*$/i, "")
      .replace(/[.,;:\-–\s]+$/, "").replace(/^[\s.:\-–]+/, "").trim();
    if (v) cands.push(v);
  }
  for (let v of cands) {
    const nv = norm(v);
    if (!nv || nv.length < 2 || nv.length > 40) continue;
    if (LIXO.has(nv)) continue;
    if (/^\d+$/.test(nv)) continue;                 // só número não é marca
    if (nv.split(" ").every((w) => LIXO.has(w))) continue;
    return v.slice(0, 60);                           // devolve com o case original
  }
  return null;
}

async function main() {
  const db = new pg.Pool({ connectionString: U, ssl: { rejectUnauthorized: false }, max: 3, statement_timeout: 180000 });
  db.on("error", () => {});
  const q = async (s, p) => { let u; for (let i = 0; i < 6; i++) { try { return await db.query(s, p); } catch (e) { u = e; if (["22P05", "23502", "42703", "42P10", "21000"].includes(e.code)) throw e; await sleep(1200 * (i + 1)); } } throw new Error(`db: ${u?.message}`); };

  if (VALIDA) {
    // VALIDAÇÃO: contra as marcas já conhecidas (item_marca_sc), quanto o determinístico crava sozinho pela âncora de valor?
    const rows = (await q(`SELECT m.cnpj,m.ano,m.seq,m.numero,m.marca,i.unit_homologado, i.cnpj_fornecedor, i.fornecedor
      FROM item_marca_sc m JOIN itens_sc i USING (cnpj,ano,seq,numero)
      WHERE m.marca IS NOT NULL AND i.unit_homologado IS NOT NULL AND i.unit_homologado>0
        AND EXISTS (SELECT 1 FROM arquivos_sc a WHERE a.cnpj=m.cnpj AND a.ano=m.ano AND a.seq=m.seq AND a.tipo_documento_id IN (16,11,19))
      ORDER BY random() LIMIT 500`)).rows;
    const byProc = new Map();
    for (const r of rows) { const k = `${r.cnpj}|${r.ano}|${r.seq}`; if (!byProc.has(k)) byProc.set(k, []); byProc.get(k).push(r); }
    // POR PORTAL (aviso do Bento: a documentação varia por portal/gerador) — cada gerador tem seu layout de ata.
    const P = new Map();  // gerador -> {n, ancorou, extraiu, bateu, residuo}
    const bump = (g, campo) => { let o = P.get(g); if (!o) { o = { n: 0, ancorou: 0, extraiu: 0, bateu: 0, residuo: 0 }; P.set(g, o); } o[campo]++; };
    let n = 0;
    for (const [k, its] of byProc) {
      const [cnpj, ano, seq] = k.split("|");
      const docs = (await q(`SELECT t.texto, coalesce(t.gerador,'?') gerador FROM arquivo_texto_sc t JOIN arquivos_sc a USING (cnpj,ano,seq,sequencial_documento)
        WHERE t.cnpj=$1 AND t.ano=$2 AND t.seq=$3 AND a.tipo_documento_id IN (16,11,19) AND t.chars>300 ORDER BY t.chars DESC LIMIT 3`, [cnpj, +ano, +seq])).rows;
      if (!docs.length) continue;
      const portal = docs[0].gerador;   // rotula o processo pelo gerador do MAIOR doc de resultado
      const big = docs.map((d) => d.texto).join("\n\n");
      for (const it of its) {
        n++; bump(portal, "n");
        const cnpjV = it.cnpj_fornecedor ? String(it.cnpj_fornecedor).replace(/\D/g, "") : null;
        let win = null, best = -1;
        for (const fv of formasValor(it.unit_homologado)) {
          let pos = big.indexOf(fv);
          while (pos >= 0) {
            const w = big.slice(Math.max(0, pos - 500), pos + 200);
            let sc = 0;
            if (cnpjV && w.replace(/\D/g, "").includes(cnpjV)) sc += 10;   // CNPJ do vencedor → linha certa (evita total/qtd)
            if (/marca/i.test(w)) sc += 3;
            if (sc > best) { best = sc; win = w; }
            if (best >= 10) break;
            pos = big.indexOf(fv, pos + 1);
          }
          if (best >= 10) break;
        }
        if (!win) continue; bump(portal, "ancorou");
        const ex = marcaDaJanela(win);
        if (ex) { bump(portal, "extraiu"); if (norm(ex) === norm(it.marca) || norm(win).includes(norm(it.marca))) bump(portal, "bateu"); }
        else if (/marca/i.test(win)) bump(portal, "residuo");
      }
    }
    const pct = (a, b) => b ? (100 * a / b).toFixed(0) + "%" : "—";
    console.log(`VALIDAÇÃO POR PORTAL (${n} itens c/ marca conhecida) — âncora de valor + trava CNPJ:\n`);
    console.log(`${"portal (gerador)".padEnd(24)} ${"itens".padStart(6)} ${"ancorou".padStart(8)} ${"det.crava".padStart(10)} ${"det.certo".padStart(10)} ${"resid.Haiku".padStart(12)}`);
    for (const [g, o] of [...P.entries()].sort((a, b) => b[1].n - a[1].n))
      console.log(`${g.slice(0, 24).padEnd(24)} ${String(o.n).padStart(6)} ${pct(o.ancorou, o.n).padStart(8)} ${pct(o.extraiu, o.n).padStart(10)} ${pct(o.bateu, o.n).padStart(10)} ${pct(o.residuo, o.n).padStart(12)}`);
    await db.end(); return;
  }

  // ─────────────────────────────────────────────────────────────────────────────────────────────────────────
  // PRODUÇÃO — balde "outro"/az (sem parser determinístico dedicado). Por ITEM homologado: ancora o unit_homologado
  // na ata de resultado (tipo 16/11/19), janela CURTA por item, determinístico → senão Haiku (só se token 'marca').
  // DOCS onde a marca+vencedor+valor coexistem, POR MODALIDADE (frame portal×modalidade):
  //  · pregão/concorrência → Ata de resultado (16 "Outros", 11/19 ata RP)
  //  · COMPRA DIRETA (dispensa/inexig/cred) NÃO tem ata → Aviso de Contratação Direta (1), Edital (2), Ato (20), Outros (16)
  const TIPOS = (process.env.TIPOS || "1,2,11,16,19,20").split(",").map((s) => parseInt(s, 10)).filter(Boolean);
  const tlist = TIPOS.join(",");
  const MODS = process.env.MODALIDADES ? process.env.MODALIDADES.split(",").map((x) => parseInt(x, 10)).filter(Boolean) : null;
  const modFiltro = MODS ? `AND EXISTS (SELECT 1 FROM contratacoes_sc c WHERE c.cnpj=i.cnpj AND c.ano=i.ano AND c.seq=i.seq AND c.modalidade_id = ANY(ARRAY[${MODS.join(",")}]))` : "";
  const USA_HAIKU = process.env.HAIKU !== "0";   // Haiku ligado por padrão neste extrator (é o ponto dele)
  await q(`CREATE TABLE IF NOT EXISTS item_marca_sc (cnpj TEXT, ano INT, seq INT, numero INT, cod_ibge TEXT, descricao TEXT, produto_ata TEXT, modelo TEXT, marca TEXT, valor NUMERIC, atualizado timestamptz DEFAULT now(), PRIMARY KEY (cnpj,ano,seq,numero))`);
  await q(`CREATE TABLE IF NOT EXISTS marca_ancora_feitas (cnpj TEXT, ano INT, seq INT, n_marca INT, via_haiku INT, feito_em timestamptz DEFAULT now(), PRIMARY KEY (cnpj,ano,seq))`);

  // TODAS as modalidades (frame portal×modalidade — "para tudo"): item homologado SEM marca, com QUALQUER doc onde
  // marca+valor coexistem (tipo 1/2/16/20 compra direta, 16/11/19 ata). Não refaz (marca_ancora_feitas).
  const procs = (await q(`SELECT DISTINCT i.cnpj,i.ano,i.seq,i.cod_ibge FROM itens_sc i
    WHERE i.unit_homologado>0 AND i.situacao='Homologado'
      AND NOT EXISTS (SELECT 1 FROM item_marca_sc m WHERE m.cnpj=i.cnpj AND m.ano=i.ano AND m.seq=i.seq AND m.numero=i.numero AND m.marca IS NOT NULL)
      AND NOT EXISTS (SELECT 1 FROM marca_ancora_feitas f WHERE f.cnpj=i.cnpj AND f.ano=i.ano AND f.seq=i.seq)
      ${modFiltro}
      AND EXISTS (SELECT 1 FROM arquivo_texto_sc t JOIN arquivos_sc a USING (cnpj,ano,seq,sequencial_documento)
                  WHERE t.cnpj=i.cnpj AND t.ano=i.ano AND t.seq=i.seq AND a.tipo_documento_id IN (${tlist}) AND t.chars>300)
    ${LIMIT ? "LIMIT " + LIMIT : ""}`)).rows;
  console.log(`PRODUÇÃO tipos[${tlist}]${MODS ? " mod[" + MODS.join(",") + "]" : " TODAS mod"} · Haiku ${USA_HAIKU ? "ON" : "OFF"} · ${procs.length.toLocaleString()} processos`);
  let procIncompletos = 0;

  let done = 0, itensMarca = 0, viaDet = 0, viaHk = 0, hkCalls = 0;
  for (const p of procs) {
    try {
      const docs = (await q(`SELECT t.texto FROM arquivo_texto_sc t JOIN arquivos_sc a USING (cnpj,ano,seq,sequencial_documento)
        WHERE t.cnpj=$1 AND t.ano=$2 AND t.seq=$3 AND a.tipo_documento_id IN (${tlist}) AND t.chars>300 ORDER BY t.chars DESC LIMIT 6`, [p.cnpj, p.ano, p.seq])).rows;
      if (!docs.length) { await q(`INSERT INTO marca_ancora_feitas (cnpj,ano,seq,n_marca,via_haiku) VALUES ($1,$2,$3,0,0) ON CONFLICT DO NOTHING`, [p.cnpj, p.ano, p.seq]); continue; }
      const big = docs.map((d) => d.texto).join("\n\n");
      const itens = (await q(`SELECT numero, descricao, unit_homologado, quantidade, cnpj_fornecedor, fornecedor FROM itens_sc
        WHERE cnpj=$1 AND ano=$2 AND seq=$3 AND unit_homologado>0 AND situacao='Homologado'
          AND NOT EXISTS (SELECT 1 FROM item_marca_sc m WHERE m.cnpj=$1 AND m.ano=$2 AND m.seq=$3 AND m.numero=itens_sc.numero AND m.marca IS NOT NULL)`, [p.cnpj, p.ano, p.seq])).rows;
      const M = { num: [], desc: [], mar: [], mod: [], val: [] };
      let usouHkProc = 0, hkFalhouProc = 0;
      for (const it of itens) {
        const cnpjV = it.cnpj_fornecedor ? String(it.cnpj_fornecedor).replace(/\D/g, "") : null;
        // 1) escolhe a OCORRÊNCIA certa do valor (sinais largos: CNPJ do vencedor, nº do item, quantidade por perto)
        let bestPos = -1, bestSc = -1;
        for (const fv of formasValor(it.unit_homologado)) {
          let pos = big.indexOf(fv);
          while (pos >= 0) {
            const ctx = big.slice(Math.max(0, pos - 500), pos + 120);
            let sc = 0;
            if (cnpjV && ctx.replace(/\D/g, "").includes(cnpjV)) sc += 10;
            if (new RegExp(`\\b0*${it.numero}\\b`).test(big.slice(Math.max(0, pos - 300), pos))) sc += 2;
            if (it.quantidade > 0 && new RegExp(`\\b${it.quantidade}\\b`).test(ctx)) sc += 1;
            if (/marca/i.test(ctx)) sc += 1;
            if (sc > bestSc) { bestSc = sc; bestPos = pos; }
            if (bestSc >= 12) break;
            pos = big.indexOf(fv, pos + 1);
          }
          if (bestSc >= 12) break;
        }
        if (bestPos < 0 || bestSc < 2) continue;   // sem confirmação mínima → não atribui (não pendura marca errada)
        // 2) JANELA CURTA por item (isola 1 linha: marca vem ANTES do valor unitário) — conserto da janela-multi-item
        const win = big.slice(Math.max(0, bestPos - 300), bestPos + 40);
        let marca = marcaDaJanela(win), via = "det";
        if (!marca && USA_HAIKU && /marca/i.test(win)) {
          hkCalls++; usouHkProc++;
          const o = await haikuMarca(win, it.fornecedor);
          if (o && o.__falhou) hkFalhouProc++;              // transitório: o processo NÃO pode ser dado por feito
          if (o && o.marca) { const nm = norm(o.marca); if (nm.length >= 2 && !LIXO.has(nm) && !/^\d+$/.test(nm)) { marca = o.marca.slice(0, 60); via = "haiku"; } }
        }
        if (marca) { M.num.push(it.numero); M.desc.push((it.descricao || "").slice(0, 200)); M.mar.push(marca); M.mod.push(null); M.val.push(it.unit_homologado); if (via === "haiku") viaHk++; else viaDet++; }
      }
      if (M.num.length) {
        await q(`INSERT INTO item_marca_sc (cnpj,ano,seq,cod_ibge,numero,descricao,produto_ata,modelo,marca,valor)
          SELECT $1,$2,$3,$4, t.* FROM unnest($5::int[],$6::text[],$7::text[],$8::text[],$9::numeric[]) AS t(numero,descricao,marca,modelo,valor)
          ON CONFLICT (cnpj,ano,seq,numero) DO UPDATE SET marca=EXCLUDED.marca, valor=EXCLUDED.valor, descricao=COALESCE(item_marca_sc.descricao,EXCLUDED.descricao), atualizado=now()`,
          [p.cnpj, p.ano, p.seq, p.cod_ibge, M.num, M.desc, M.mar, M.mod, M.val]);
        itensMarca += M.num.length;
      }
      if (hkFalhouProc) {
        procIncompletos++;
        console.log(`  ⚠ ${p.cnpj}/${p.ano}/${p.seq}: Haiku falhou em ${hkFalhouProc} item(ns) — NAO marcado feito, volta no proximo run`);
      } else {
        await q(`INSERT INTO marca_ancora_feitas (cnpj,ano,seq,n_marca,via_haiku) VALUES ($1,$2,$3,$4,$5) ON CONFLICT (cnpj,ano,seq) DO UPDATE SET n_marca=EXCLUDED.n_marca, via_haiku=EXCLUDED.via_haiku, feito_em=now()`, [p.cnpj, p.ano, p.seq, M.num.length, usouHkProc]);
      }
    } catch { /* deixa p/ o próximo run */ }
    if (++done % 25 === 0) process.stdout.write(`  ${done}/${procs.length} · ${itensMarca} marcas (${viaDet} det + ${viaHk} haiku) · ${hkCalls} chamadas Haiku\r`);
  }
  console.log(`\n✔ tipos[${tlist}]: ${itensMarca.toLocaleString()} marcas gravadas · ${viaDet} determinístico + ${viaHk} Haiku · ${hkCalls} chamadas Haiku`);
  if (procIncompletos) {
    console.log(`\n⚠ ${procIncompletos} processo(s) com Haiku indisponível — NÃO marcados como feitos, voltam no próximo run.`);
    process.exitCode = 2;
  }
  await db.end();
}
main().catch((e) => { console.error("ERRO:", e.message); process.exit(1); });
