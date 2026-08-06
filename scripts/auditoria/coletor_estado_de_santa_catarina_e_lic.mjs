// COLETOR "Estado de Santa Catarina (e-lic)" — marca do portal PRÓPRIO do Governo de SC (SEA).
// CRACK (jul/2026): o e-lic velho (WebForms/__VIEWSTATE) e o compras.sc novo TÊM download de doc atrás de
//   reCAPTCHA no fluxo do navegador — MAS a API Spring do portal novo expõe, SEM captcha e SEM login:
//     GET https://compras.sc.gov.br/api/editais?ano=YYYY&pagina=&tamanhoPagina=  → lista {id,processo,tipo,orgaoNome,objeto,situacao}
//     GET https://compras.sc.gov.br/api/editais/{id}/arquivos                     → [{tipoArquivo,linkArquivo}]  (inclui "Ata de Sessão de Pregão" e "Resultado da Licitação")
//     GET {linkArquivo}  (portal-compras-backend...ciasc.sc.gov.br/.../download)  → PDF direto (200, application/pdf). NÃO é reCAPTCHA — é a rota pública/limpa.
//   ⛔ NÃO é contorno de captcha: é o endpoint público de consulta do próprio portal. O download do PDF não exige o token do reCAPTCHA.
// ONDE VIVE A MARCA: na "Ata de Sessão de Pregão" (tipo 16), por ITEM, dentro da tabela de LANCES:
//     "Item N - <desc> ... Lance vencedor R$ V ... <data> <licitante> R$ <valor> <MARCA> <Válido> ... QUADRO DE RESULTADOS Licitante <venc> CNPJ <cnpj>"
//   A marca fica entre o valor do lance e a situação, só na linha da PROPOSTA do licitante (nem toda linha traz). ESTRUTURA = colunar (col. Marca no lance).
// ÂNCORA POR VALOR (nunca por posição): "Lance vencedor R$ V" == itens_sc.unit_homologado (±R$0,02); TRAVA DUPLA com CNPJ do vencedor (QUADRO DE RESULTADOS).
//   A marca gravada é a do VENCEDOR (linha de lance do próprio vencedor). Item sem marca do vencedor = deserto de marca (grava nada — correto).
// BRIDGE proc(PNCP cnpj/ano/seq) → edital(id do compras.sc): (ano, numero_compra == int(processo)) + confirmação por objeto normalizado. (link_sistema_origem é VAZIO p/ e-lic.)
// STATE-AGNOSTIC: UF por env (default sc). A receita (API pública do portal estadual) vale p/ qualquer estado com portal Spring equivalente; o host vem de PORTAL_HOST.
// Idempotente: app.<slug>_feitas_${uf} PK(cnpj,ano,seq). Grava em LOTE (unnest) em app.item_marca_conferida_${uf}. LIMIT=N leva; DRY=1 mede sem gravar.
//   node scripts/auditoria/coletor_estado_de_santa_catarina_e_lic.mjs
import fs from "fs"; import pg from "pg";
import { extractText, getDocumentProxy } from "unpdf";
import { limpaMarca, parseBR } from "../portais_comportamento.mjs";

const U = fs.readFileSync("./.env.local", "utf8").match(/^DATABASE_URL=(.+)$/m)[1].trim();
const db = new pg.Pool({ connectionString: U, ssl: { rejectUnauthorized: false }, max: 3, statement_timeout: 590000 });
const UF = (process.env.UF || "sc").toLowerCase();
const PORTAL = process.env.PORTAL_NOME || "Estado de Santa Catarina (e-lic)";
const HOST = process.env.PORTAL_HOST || "compras.sc.gov.br";       // API pública Spring do portal estadual
const CONF = `app.item_marca_conferida_${UF}`, FEITAS = `app.estado_sc_elic_feitas_${UF}`;
const LIM = process.env.LIMIT != null ? Number(process.env.LIMIT) : 20;
const DRY = process.env.DRY === "1";
const UA = { "user-agent": "Mozilla/5.0", accept: "application/json" };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------- fetch com backoff em 429 ----------
async function getJSON(url) {
  for (let t = 0; t < 4; t++) {
    try {
      const r = await fetch(url, { headers: UA, signal: AbortSignal.timeout(30000) });
      if (r.status === 429) { await sleep(4000 * (t + 1)); continue; }
      if (!r.ok) return null;
      return await r.json().catch(() => null);
    } catch { await sleep(1500 * (t + 1)); }
  }
  return "RATE";
}
async function getPDFtext(url) {
  for (let t = 0; t < 4; t++) {
    try {
      const r = await fetch(url, { headers: { "user-agent": "Mozilla/5.0" }, signal: AbortSignal.timeout(60000) });
      if (r.status === 429) { await sleep(4000 * (t + 1)); continue; }
      const buf = Buffer.from(await r.arrayBuffer());
      if (buf[0] !== 0x25) return "";                                  // não é PDF (%)
      return (await extractText(await getDocumentProxy(new Uint8Array(buf)), { mergePages: true })).text || "";
    } catch { await sleep(1500 * (t + 1)); }
  }
  return "";
}

// ---------- BRIDGE: cache de editais por ano do portal ----------
const norm = (s) => (s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]/g, "");
const anoCache = new Map();   // ano -> Map(numero -> [ {id,objN,orgN,tipo,situacao} ])
async function editaisDoAno(ano) {
  if (anoCache.has(ano)) return anoCache.get(ano);
  const byNum = new Map();
  for (let pag = 0; pag < 40; pag++) {
    const d = await getJSON(`https://${HOST}/api/editais?ano=${ano}&pagina=${pag}&tamanhoPagina=500`);
    if (d === "RATE") { await sleep(6000); pag--; continue; }
    const arr = d?.conteudo || [];
    for (const e of arr) {
      const num = parseInt(String(e.processo || "").split("/")[0], 10);
      if (!Number.isFinite(num)) continue;
      const rec = { id: e.id, objN: norm(e.objeto), orgN: norm(e.orgaoNome || e.orgaoSigla), tipo: e.tipo || "", situacao: e.situacao || "" };
      if (!byNum.has(num)) byNum.set(num, []);
      byNum.get(num).push(rec);
    }
    if (arr.length < 500) break;
    await sleep(300);
  }
  anoCache.set(ano, byNum);
  return byNum;
}
// resolve o id do edital no portal p/ um proc (ano, numero_compra, objeto, orgao)
async function resolveEditalId(proc) {
  const num = parseInt(String(proc.numero_compra || "").replace(/\D/g, ""), 10);
  if (!Number.isFinite(num)) return null;
  const byNum = await editaisDoAno(proc.ano);
  const cands = byNum.get(num) || [];
  if (!cands.length) return null;
  if (cands.length === 1) return cands[0].id;
  // desambigua por objeto (prefixo normalizado) — trava contra colisão de numero entre órgãos
  const objN = norm(proc.objeto);
  let best = null, bestScore = 0;
  for (const c of cands) {
    let i = 0; const m = Math.min(objN.length, c.objN.length);
    while (i < m && objN[i] === c.objN[i]) i++;             // tamanho do prefixo comum
    const orgHit = proc.orgN && c.orgN && (c.orgN.includes(proc.orgN.slice(0, 12)) || proc.orgN.includes(c.orgN.slice(0, 12))) ? 8 : 0;
    const score = i + orgHit;
    if (score > bestScore) { bestScore = score; best = c; }
  }
  return bestScore >= 15 ? best.id : null;                  // exige ~15 chars de objeto em comum
}

// ---------- arquivos de resultado do edital ----------
const ehResultado = (f) => /ata de sess|ata da sess|resultado da licit|extrato ata|homolog|adjudic|vencedor|resultad/i.test(`${f.tipoArquivo || ""} ${f.descricaoArquivo || ""} ${f.nomeArquivo || ""}`);
async function atasDoEdital(id) {
  const d = await getJSON(`https://${HOST}/api/editais/${id}/arquivos`);
  if (!d || d === "RATE" || !Array.isArray(d)) return [];
  return d.filter(ehResultado).map((f) => ({ tipo: f.descricaoArquivo || f.tipoArquivo, url: f.linkArquivo }));
}

// ---------- PARSER da Ata de Sessão (colunar: marca na linha de lance do vencedor) ----------
const STATUS = /(Válido|V[aá]lido|Cancelad\w*|Inv[aá]lid\w*|Desclassificad\w*|Recusad\w*|Superad\w*)/i;
// mapa licitante(normalizado) → CNPJ, colhido no doc todo (cabeçalho LICITANTES + QUADROs) p/ a trava dupla
function mapaCnpj(txt) {
  const map = [];
  const re = /(\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2})/g; let m;
  while ((m = re.exec(txt))) {
    const cnpj = m[1].replace(/\D/g, "");
    const before = txt.slice(Math.max(0, m.index - 90), m.index);   // "Licitante <nome> CNPJ "
    const after = txt.slice(m.index + m[1].length, m.index + m[1].length + 90); // "<nome> E-mail/Sim"
    const nb = before.match(/([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ0-9 .,&'\/-]{4,}?)\s+CNPJ\s*$/);
    const na = after.match(/^\s+([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ0-9 .,&'\/-]{4,}?)\s+(?:[\w.+-]+@|Sim|Não|E-mail)/);
    const nome = nb?.[1] || na?.[1];
    if (nome) map.push({ n: norm(nome), cnpj });
  }
  return map;
}
// ═══ A CÉLULA DA MARCA VEM COM O PRÓPRIO RÓTULO DENTRO, E COM CÓDIGOS COLADOS ═══
// Medido em 06/ago/2026 num pregão do CBM: a coluna traz
//   "MARCA:HP BIO/REF:SLRM/RMS:10 166360025"  e  "MARCA:HP BIO/REF:ADM ADB//RMS:10166360 029"
// O licitante digita o rótulo junto do valor, e emenda referência e registro na ANVISA. A marca é HP BIO —
// o resto é código de produto, que varia por item e faria a MESMA marca virar dezenas de marcas distintas
// na base. Corta-se no primeiro separador de código.
const depoisDoRotulo = (s) => String(s || "")
  .replace(/^\s*MARCA\s*[:\-]?\s*/i, "")
  .split(/\s*\/\s*(?:REF|RMS|REG|COD|MOD|ANVISA)\b|\s*\b(?:REF|RMS|REG|ANVISA)\s*[:.]/i)[0]
  .trim();

function parseAta(txt) {
  const out = [];                          // {valor, marca, cnpj}
  const cnpjMap = mapaCnpj(txt);
  const cnpjDe = (nomeNorm) => { if (!nomeNorm) return null; const h = cnpjMap.find((x) => x.n.includes(nomeNorm.slice(0, 14)) || nomeNorm.includes(x.n.slice(0, 14))); return h ? h.cnpj : null; };
  const blocks = txt.split(/(?=Item\s+\d+\s*[-–]\s)/);
  for (const b of blocks) {
    const mv = b.match(/Lance vencedor\s*R\$\s*([\d.]+,\d{2})/i);
    if (!mv) continue;                     // frustrado/deserto/cancelado
    const winnerVal = parseBR(mv[1]); if (!winnerVal) continue;
    // vencedor autoritativo: QUADRO DE RESULTADOS (no bloco); senão nome pela linha do valor vencedor
    const mq = b.match(/QUADRO DE RESULTADOS\s+Licitante\s+(.+?)\s+CNPJ\s+([\d.\/-]+)/i);
    let winnerName = mq ? mq[1] : null;
    let winnerCnpj = mq ? mq[2].replace(/\D/g, "") : null;
    // linhas de lance: <data> <hora> <licitante> R$ <valor> <marcaOuVazio> <status>
    const rowRe = /(\d{2}\/\d{2}\/\d{4})\s+\d{2}:\d{2}:\d{2}\s+(.+?)\s+R\$\s*([\d.]+,\d{2})\s+(.*?)\s*(?=Válido|V[aá]lido|Cancelad|Inv[aá]lid|Desclassificad|Recusad|Superad)/gi;
    let m, winnerFromRow = null, marca = null;
    const rows = [];
    while ((m = rowRe.exec(b))) rows.push({ lic: m[2], val: parseBR(m[3]), marcaRaw: m[4] });
    // nome do vencedor pela linha do valor vencedor (fallback ao QUADRO)
    for (const r of rows) if (r.val === winnerVal) { winnerFromRow = r.lic; break; }
    if (!winnerName) winnerName = winnerFromRow;
    const wname = norm(winnerName || "");
    if (!winnerCnpj) winnerCnpj = cnpjDe(wname);            // trava dupla via mapa do doc
    // marca = 1ª marca válida numa linha de lance DO VENCEDOR (nome normalizado; valor vencedor só como reforço)
    for (const r of rows) {
      const belongs = (wname && norm(r.lic).includes(wname.slice(0, 14))) || (wname && norm(r.lic).length && wname.includes(norm(r.lic).slice(0, 14))) || r.val === winnerVal;
      if (!belongs) continue;
      const mk = limpaMarca(depoisDoRotulo(r.marcaRaw));
      if (mk) { marca = mk; break; }
    }
    if (marca) out.push({ valor: winnerVal, marca, cnpj: winnerCnpj });
  }
  // dedup por valor+marca
  const seen = new Set();
  return out.filter((r) => { const k = r.valor + "|" + r.marca; if (seen.has(k)) return false; seen.add(k); return true; });
}

async function main() {
  await db.query(`create table if not exists ${FEITAS}(cnpj text,ano int,seq int,edital_id int,status text,n int,atualizado timestamptz default now(),primary key(cnpj,ano,seq))`);
  const lim = LIM > 0 ? `limit ${LIM}` : ``;
  const anoFiltro = process.env.ANO ? `and c.ano=${Number(process.env.ANO)}` : ``;   // opcional: focar num ano (homologados)
  const modFiltro = process.env.MODALIDADE ? `and c.modalidade_id=${Number(process.env.MODALIDADE)}` : ``;   // opcional: 6=pregão (onde a marca vive)
  const procs = (await db.query(`
    select p.cnpj,p.ano,p.seq, c.numero_compra, c.objeto, c.orgao_razao_social
    from app.processo_portal_real p
    join contratacoes_sc c on c.cnpj=p.cnpj and c.ano=p.ano and c.seq=p.seq
    where p.portal_real=$1 ${anoFiltro} ${modFiltro}
      and exists(select 1 from itens_${UF} i where i.cnpj=p.cnpj and i.ano=p.ano and i.seq=p.seq and i.unit_homologado is not null)
      and not exists(select 1 from ${CONF} m where m.cnpj=p.cnpj and m.ano=p.ano and m.seq=p.seq and m.portal=$1)
      -- ═══ SÓ APOSENTA O QUE JÁ ESTÁ RESPONDIDO ═══
      -- 'sem_ata' e 'sem_bridge' NÃO são respostas definitivas: a ata pode ser publicada depois da sessão,
      -- e a ponte pode falhar por o edital ainda não ter entrado no portal. Retirando esses do acervo para
      -- sempre, um processo consultado cedo demais nunca mais seria visitado — e o dado existiria no portal
      -- sem nunca chegar aqui. Medido: dos 12 primeiros pregões de 2024, 3 sem ponte e 1 sem ata.
      -- 'ok', 'sem_marca' e 'sem_ancora' são fatos sobre o documento lido: esses sim ficam aposentados.
      and not exists(select 1 from ${FEITAS} f where f.cnpj=p.cnpj and f.ano=p.ano and f.seq=p.seq
                       and f.status in ('ok','sem_marca','sem_ancora'))
    -- o cnpj entra no ORDER BY porque seq NÃO é único entre órgãos: sem ele o desempate é arbitrário e duas
    -- rodadas com o mesmo filtro trazem conjuntos diferentes, o que torna qualquer medição irreproduzível
    order by c.ano desc, c.seq, p.cnpj ${lim}`, [PORTAL])).rows;
  if (!procs.length) { console.log(`acervo ${PORTAL} fechado — nada a coletar`); await db.end(); return; }
  console.log(`${PORTAL} a coletar: ${procs.length} · host ${HOST} · DRY=${DRY ? 1 : 0}`);

  let feitos = 0, comMarca = 0, itensTot = 0, semBridge = 0, semAta = 0, semMarca = 0;
  for (const p of procs) {
    p.orgN = norm(p.orgao_razao_social);
    let status = "sem_bridge", n = 0, editalId = null;
    try {
      editalId = await resolveEditalId(p);
      if (!editalId) { semBridge++; }
      else {
        const atas = await atasDoEdital(editalId);
        if (!atas.length) { status = "sem_ata"; semAta++; }
        else {
          let pares = [];
          for (const a of atas) { const txt = await getPDFtext(a.url); if (txt) pares.push(...parseAta(txt)); await sleep(200); }
          const seen = new Set(); pares = pares.filter((r) => { const k = r.valor + "|" + r.marca; if (seen.has(k)) return false; seen.add(k); return true; });
          status = pares.length ? "sem_ancora" : "sem_marca";
          if (!pares.length) semMarca++;
          // ÂNCORA POR VALOR contra itens_sc.unit_homologado (±0,02) + trava dupla CNPJ
          const itens = (await db.query(`select numero, unit_homologado, cnpj_fornecedor from itens_${UF} where cnpj=$1 and ano=$2 and seq=$3 and unit_homologado is not null`, [p.cnpj, p.ano, p.seq])).rows;
          const hits = [];
          for (const par of pares) {
            const cand = itens.filter((i) => Math.abs(Number(i.unit_homologado) - par.valor) <= 0.02);
            for (const it of cand) {
              const cnpjOk = par.cnpj && it.cnpj_fornecedor ? par.cnpj === String(it.cnpj_fornecedor).replace(/\D/g, "") : false;
              hits.push({ numero: it.numero, marca: par.marca, valor: par.valor, forn: it.cnpj_fornecedor ? String(it.cnpj_fornecedor).replace(/\D/g, "") : null, cnpjOk });
            }
          }
          const vistoN = new Set(); const uniq = hits.filter((h) => { if (vistoN.has(h.numero)) return false; vistoN.add(h.numero); return true; });
          if (uniq.length) {
            status = "ok"; n = uniq.length; comMarca++; itensTot += n;
            if (!DRY) {
              await db.query(`insert into ${CONF}
                (cnpj,ano,seq,numero,marca,valor,fornecedor_cnpj,cnpj_ok,valor_ok,portal,fonte_titulo)
                select $1,$2,$3, x.numero, x.marca, x.valor, x.forn, x.cnpjok, true, $4, 'Ata de Sessão de Pregão'
                from unnest($5::int[],$6::text[],$7::numeric[],$8::text[],$9::bool[]) as x(numero,marca,valor,forn,cnpjok)
                on conflict do nothing`,
                [p.cnpj, p.ano, p.seq, PORTAL, uniq.map(h => h.numero), uniq.map(h => h.marca), uniq.map(h => h.valor), uniq.map(h => h.forn), uniq.map(h => h.cnpjOk)]);
            }
            if (comMarca <= 5) console.log(`  ✔ ${p.cnpj}/${p.ano}/${p.seq} (edital ${editalId}): ${uniq.slice(0, 4).map(h => `${h.marca}@${h.valor}${h.cnpjOk ? "✓" : ""}`).join(", ")}`);
          }
        }
      }
    } catch (e) { status = "erro:" + e.message.slice(0, 40); }
    if (!DRY) await db.query(`insert into ${FEITAS}(cnpj,ano,seq,edital_id,status,n) values($1,$2,$3,$4,$5,$6) on conflict(cnpj,ano,seq) do update set edital_id=excluded.edital_id,status=excluded.status,n=excluded.n,atualizado=now()`, [p.cnpj, p.ano, p.seq, editalId, status, n]);
    process.stdout.write(`  ${++feitos}/${procs.length} · comMarca ${comMarca} · itens ${itensTot} · semBridge ${semBridge} · semAta ${semAta}\r`);
    await sleep(250);
  }
  console.log(`\n✔ ${PORTAL}: ${comMarca}/${feitos} procs com marca · ${itensTot} itens · semBridge ${semBridge} · semAta ${semAta} · semMarca ${semMarca}`);
  if (!DRY) console.table((await db.query(`select status, count(*) n, coalesce(sum(n),0) itens from ${FEITAS} group by 1 order by 2 desc`)).rows);
  await db.end();
}
main().catch((e) => { console.error("ERRO:", e.message); process.exit(1); });
