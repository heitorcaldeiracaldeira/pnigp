// EXTRATOR Compras.gov / comprasnet (fase-externa) — a MARCA do vencedor por item, TODAS as modalidades.
// Achado (23/jul, engenharia reversa do bundle Angular): a marca NÃO está nas APIs abertas (PNCP/dados-abertos);
// vive ESTRUTURADA em JSON no micro-serviço comprasnet-fase-externa:
//   GET /comprasnet-fase-externa/public/v1/compras/{chave}/itens?captcha=            -> lista de itens
//   GET /comprasnet-fase-externa/public/v1/compras/{chave}/itens/{numeroItem}/propostas?captcha=
//        -> PropostaItemParaSelecaoFornecedoresRepresentation: marcaFabricante + modeloVersao + participante(CNPJ) + valores
//   chave = compra= do linkSistemaOrigem do PNCP  (fallback: UASG6 + SIASG_mod2 + numero5 + ano4)
// GATE: todas as rotas /public/* exigem ?captcha=<token hCaptcha/reCAPTCHA INTERATIVO>. Sem token -> 204 vazio; repetindo -> 429.
//   NÃO burlamos captcha: o token vem de fora (COMPRASGOV_CAPTCHA no .env.local ou env), gerado 1x por um humano na
//   página pública .../comprasnet-web/public/compras/acompanhamento-compra?compra={chave}. Enquanto vale, o motor dispara em LOTE.
// Ancora por VALOR (unit_homologado ±0,02) + CNPJ (trava dupla). Grava app.item_marca_conferida_${UF} portal='Compras.gov'.
// Idempotente (app.comprasnet_feitas_${UF}). State-agnostic (UF por env; a rota é nacional — serve PR/qualquer UF).
//   COMPRASGOV_CAPTCHA=<token> node scripts/auditoria/coletor_compras_gov_comprasnet.mjs   (LIMIT=N · CONC=2 · DRY=1)
import fs from "fs"; import path from "path"; import { fileURLToPath } from "url"; import pg from "pg";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ENV = fs.readFileSync(path.join(__dirname, "..", "..", ".env.local"), "utf8");
const envGet = (k) => ENV.match(new RegExp("^" + k + "=(.+)$", "m"))?.[1]?.trim();
const DATABASE_URL = envGet("DATABASE_URL");
const CAPTCHA = process.env.COMPRASGOV_CAPTCHA || envGet("COMPRASGOV_CAPTCHA") || "";
const UF = (process.env.UF || "sc").toLowerCase();
const LIMIT = process.env.LIMIT != null ? Number(process.env.LIMIT) : 40;
const CONC = Number(process.env.CONC || 2);
const DRY = process.env.DRY === "1";

const ITENS = `itens_${UF}`, CONTR = `contratacoes_${UF}`, CONF = `app.item_marca_conferida_${UF}`, FEITAS = `app.comprasnet_feitas_${UF}`;
const HOST = "https://cnetmobile.estaleiro.serpro.gov.br";
const FE = `${HOST}/comprasnet-fase-externa/public/v1`;
const UA = { "user-agent": "Mozilla/5.0", "accept": "application/json, text/plain, */*" };
// modalidade_id PNCP -> código SIASG na chave (enum /comprasnet-fase-externa/v1/enums)
const SIASG = { 6: "05", 8: "06", 4: "03", 9: "07", 12: "12", 1: "01", 3: "04", 7: "05" };
const db = new pg.Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 3, statement_timeout: 590000 });
const q = (s, p) => db.query(s, p);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const brToNum = (v) => { const n = typeof v === "number" ? v : parseFloat(String(v ?? "").replace(/\./g, "").replace(",", ".")); return isFinite(n) ? n : null; };

// GET com backoff em 429; retorna {status, json}
async function jget(url) {
  for (let t = 0; t < 4; t++) {
    try {
      const r = await fetch(url, { headers: UA, signal: AbortSignal.timeout(30000) });
      if (r.status === 429) { await sleep(3000 * (t + 1)); continue; }
      const txt = await r.text(); let j = null; try { j = JSON.parse(txt); } catch {}
      return { status: r.status, json: j, len: txt.length };
    } catch { await sleep(1500); }
  }
  return { status: 0, json: null };
}
// chave da compra: 1) compra= do linkSistemaOrigem; 2) monta UASG6+SIASG+num5+ano
function chaveDe(c) {
  const m = (c.link_sistema_origem || "").match(/compra=(\d{15,})/);
  if (m) return m[1];
  const si = SIASG[c.modalidade_id]; if (!si) return null;
  const uasg = String(c.unidade_codigo || "").replace(/\D/g, ""); if (uasg.length !== 6) return null;
  const num = (String(c.numero_compra || "").match(/(\d+)/)?.[1] || "").padStart(5, "0"); if (num === "00000") return null;
  return `${uasg}${si}${num.slice(-5)}${c.ano}`;
}
// varre o JSON e coleta todo objeto com marcaFabricante (independe da nidificação exata)
function coletaPropostas(node, out = []) {
  if (!node || typeof node !== "object") return out;
  if (Array.isArray(node)) { for (const x of node) coletaPropostas(x, out); return out; }
  if (typeof node.marcaFabricante === "string" && node.marcaFabricante.trim()) out.push(node);
  for (const k of Object.keys(node)) { const v = node[k]; if (v && typeof v === "object") coletaPropostas(v, out); }
  return out;
}
// procura recursivamente o 1º número num objeto cujas chaves batam com keyRe (ex valor unitário)
function achaNumero(node, keyRe, depth = 0) {
  if (!node || typeof node !== "object" || depth > 6) return null;
  for (const [k, v] of Object.entries(node)) {
    if (keyRe.test(k)) { const n = brToNum(v); if (n != null && n > 0) return n; }
  }
  for (const v of Object.values(node)) { if (v && typeof v === "object") { const n = achaNumero(v, keyRe, depth + 1); if (n != null) return n; } }
  return null;
}
// CNPJ (14 díg) em qualquer string do objeto participante
function achaCNPJ(node, depth = 0) {
  if (!node || typeof node !== "object" || depth > 6) return null;
  for (const v of Object.values(node)) {
    if (typeof v === "string") { const d = v.replace(/\D/g, ""); if (d.length === 14) return d; }
    else if (v && typeof v === "object") { const c = achaCNPJ(v, depth + 1); if (c) return c; }
  }
  return null;
}
// de uma proposta: {marca, modelo, valorUnit, cnpj}
function leProposta(p) {
  const marca = (p.marcaFabricante || "").replace(/\s+/g, " ").trim().slice(0, 60);
  const modelo = (p.modeloVersao || "").replace(/\s+/g, " ").trim().slice(0, 60) || null;
  const valorUnit = achaNumero(p.valores || p, /unitari|valorNegociado|valorInformado|valorUnit/i);
  const cnpj = achaCNPJ(p.participante || p);
  return { marca, modelo, valorUnit, cnpj };
}
const ehMarcaReal = (m) => m && m.length >= 2 && /[a-zà-ÿ]{2}/i.test(m) && !/^(sem marca|marca pr|n\/?[ac]|nao|não|generic|propri|diversos?|conforme)/i.test(m);

async function main() {
  if (!CAPTCHA) {
    console.error(`FALTA o token de captcha. Como obter (1x, humano):
  1) Abra .../comprasnet-web/public/compras/acompanhamento-compra?compra={chave} no navegador
  2) Resolva o hCaptcha/reCAPTCHA e, no DevTools>Network, copie o valor do parâmetro ?captcha= de qualquer chamada /public/*
  3) COMPRASGOV_CAPTCHA=<token> no .env.local (ou env) e rode de novo. O token é curto — rode logo o LOTE.`);
    process.exit(2);
  }
  await q(`create table if not exists ${FEITAS}(cnpj text,ano int,seq int,chave text,status text,n int,atualizado timestamptz default now(),primary key(cnpj,ano,seq))`);
  const lim = LIMIT > 0 ? `limit ${LIMIT}` : "";
  const procs = (await q(`
    select c.cnpj,c.ano,c.seq,c.modalidade_id,c.unidade_codigo,c.numero_compra,c.link_sistema_origem
    from app.processo_portal_real p join ${CONTR} c using(cnpj,ano,seq)
    where p.portal_real='Compras.gov'
      and exists(select 1 from ${ITENS} i where i.cnpj=c.cnpj and i.ano=c.ano and i.seq=c.seq and i.unit_homologado is not null)
      and not exists(select 1 from ${CONF} m where m.cnpj=c.cnpj and m.ano=c.ano and m.seq=c.seq and m.portal='Compras.gov')
      and not exists(select 1 from ${FEITAS} f where f.cnpj=c.cnpj and f.ano=c.ano and f.seq=c.seq)
    order by c.data_publicacao desc nulls last ${lim}`)).rows;
  if (!procs.length) { console.log("nada a coletar (Compras.gov)"); await db.end(); return; }
  console.log(`Compras.gov/comprasnet: ${procs.length} procs · CONC ${CONC}${DRY ? " · DRY" : ""}`);

  let feitos = 0, comMarca = 0, itensMarca = 0, captchaFails = 0, parar = false;
  const porMod = {};

  async function processa(c) {
    const chave = chaveDe(c);
    let status = "sem_chave", n = 0;
    if (chave) {
      // 1) lista de itens do processo
      const rItens = await jget(`${FE}/compras/${chave}/itens?tamanhoPagina=500&pagina=0&captcha=${encodeURIComponent(CAPTCHA)}`);
      if (rItens.status === 204 || (rItens.status === 200 && !rItens.json)) { captchaFails++; if (captchaFails >= 5) parar = true; status = "captcha_vazio"; }
      else {
        captchaFails = 0;
        const listaItens = coletaNumerosItem(rItens.json);
        // nossos itens homologados p/ ancorar
        const nossos = (await q(`select numero, unit_homologado, cnpj_fornecedor from ${ITENS} where cnpj=$1 and ano=$2 and seq=$3 and unit_homologado is not null`, [c.cnpj, c.ano, c.seq])).rows;
        const grava = []; const usados = new Set();
        for (const numeroItem of listaItens) {
          const rp = await jget(`${FE}/compras/${chave}/itens/${numeroItem}/propostas?captcha=${encodeURIComponent(CAPTCHA)}`);
          if (rp.status === 429) { await sleep(2500); }
          const props = coletaPropostas(rp.json).map(leProposta).filter((x) => ehMarcaReal(x.marca) && x.valorUnit);
          // ancora por valor (±0,02) + CNPJ quando houver
          for (const it of nossos) {
            if (usados.has(it.numero)) continue;
            const uh = Number(it.unit_homologado);
            const cand = props.find((x) => Math.abs(x.valorUnit - uh) <= 0.02 && (!x.cnpj || !it.cnpj_fornecedor || x.cnpj === String(it.cnpj_fornecedor).replace(/\D/g, "")));
            if (cand) { usados.add(it.numero); grava.push({ numero: it.numero, marca: cand.marca, modelo: cand.modelo, valor: uh, forn: it.cnpj_fornecedor }); }
          }
          await sleep(120);
        }
        if (grava.length && !DRY) {
          await q(`insert into ${CONF}(cnpj,ano,seq,numero,marca,modelo,valor,fornecedor_cnpj,valor_ok,cnpj_ok,portal,fonte_titulo)
            select $1,$2,$3, x.numero, x.marca, x.modelo, x.valor, x.forn, true, true, 'Compras.gov', 'comprasnet propostas'
            from unnest($4::text[],$5::text[],$6::text[],$7::numeric[],$8::text[]) as x(numero,marca,modelo,valor,forn)
            on conflict (cnpj,ano,seq,numero) do nothing`,
            [c.cnpj, c.ano, c.seq, grava.map((g) => String(g.numero)), grava.map((g) => g.marca), grava.map((g) => g.modelo), grava.map((g) => g.valor), grava.map((g) => g.forn || null)]);
        }
        n = grava.length; status = n ? "ok" : "sem_marca";
        if (n) { comMarca++; itensMarca += n; porMod[c.modalidade_id] = (porMod[c.modalidade_id] || 0) + n; }
      }
    }
    if (!DRY) await q(`insert into ${FEITAS}(cnpj,ano,seq,chave,status,n) values($1,$2,$3,$4,$5,$6) on conflict(cnpj,ano,seq) do update set status=excluded.status,n=excluded.n,chave=excluded.chave`, [c.cnpj, c.ano, c.seq, chave, status, n]);
    process.stdout.write(`  ${++feitos}/${procs.length} · com marca ${comMarca} · itens ${itensMarca} · captchaFails ${captchaFails}\r`);
  }

  let idx = 0;
  async function worker(w) { await sleep(w * 400); while (idx < procs.length && !parar) { const c = procs[idx++]; try { await processa(c); } catch {} await sleep(200); } }
  await Promise.all(Array.from({ length: CONC }, (_, w) => worker(w)));

  if (parar) console.log(`\n⚠️  token de captcha inválido/expirado (5 respostas 204 seguidas). Gere um novo COMPRASGOV_CAPTCHA e rode de novo (idempotente).`);
  console.log(`\n✔ Compras.gov/comprasnet: ${comMarca}/${feitos} procs com marca · ${itensMarca} itens · por modalidade ${JSON.stringify(porMod)}`);
  await db.end();
}
// coleta os numeroItem/identificador da lista de itens (defensivo)
function coletaNumerosItem(json) {
  const nums = new Set();
  (function walk(node, depth = 0) {
    if (!node || typeof node !== "object" || depth > 6) return;
    if (Array.isArray(node)) { for (const x of node) walk(x, depth + 1); return; }
    for (const k of ["numeroItem", "numero", "identificador", "numeroGrupo"]) if (node[k] != null && /^\d+$/.test(String(node[k]))) nums.add(String(node[k]));
    for (const v of Object.values(node)) if (v && typeof v === "object") walk(v, depth + 1);
  })(json);
  return [...nums];
}
main().catch((e) => { console.error("ERRO:", e.message); process.exit(1); });
