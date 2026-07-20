// EXTRAI MARCA POR VISÃO — doc de resultado que é PDF IMAGEM (sem texto) → Haiku-visão lê item→fornecedor→marca→valor.
// Fonte: PNCP /arquivos/{sd} (o arquivo que a plataforma subiu). Derivada (Lei 1): grava em app.item_marca_visao_sc.
// Idempotente/resumível via app.marca_visao_feitas. Só 14.133. NÃO toca no motor do CATMAT nem no item_marca_sc antigo.
//   node scripts/extrai_marca_visao.mjs            # leva de validação (LIMIT padrão)
//   LIMIT=0 node scripts/extrai_marca_visao.mjs    # tier completo (todos os imagem)
import fs from "fs"; import path from "path"; import { fileURLToPath } from "url"; import pg from "pg";
const __dirname = path.dirname(fileURLToPath(import.meta.url)); const ROOT = path.join(__dirname, "..");
const ENV = fs.readFileSync(path.join(ROOT, ".env.local"), "utf8");
const DB = ENV.match(/^DATABASE_URL=(.+)$/m)[1].trim();
const KEY = ENV.match(/ANTHROPIC_API_KEY=(.+)/)[1].trim();
const LIMIT = process.env.LIMIT != null ? Number(process.env.LIMIT) : 12;   // padrão: leva de validação
const CONC = Number(process.env.CONC || 3);
const MODEL = "claude-haiku-4-5";
const MAXPDF = 25 * 1024 * 1024;  // guarda de tamanho (limite request 32MB; páginas ≤100 no modelo 200K)
const RES = `t.titulo ~* '(homolog|ata de realiz|ata de sess|ata final|resultado|adjudica|vencedor|termo de julg)'`;
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function ddl(db) {
  await db.query(`create table if not exists app.item_marca_visao_sc(
    cnpj text, ano int, seq int, sd int, numero text, descricao text,
    fornecedor text, marca text, modelo text, valor_unitario text,
    portal text, modalidade text, tipo_doc text, atualizado timestamptz default now())`);
  await db.query(`create table if not exists app.marca_visao_feitas(
    cnpj text, ano int, seq int, sd int, status text, n_itens int, msg text,
    atualizado timestamptz default now(), primary key(cnpj,ano,seq,sd))`);
}

async function haiku(pdfB64, titulo) {
  const body = { model: MODEL, max_tokens: 8000, messages: [{ role: "user", content: [
    { type: "document", source: { type: "base64", media_type: "application/pdf", data: pdfB64 } },
    { type: "text", text: `Documento de resultado de licitação (imagem escaneada), título "${titulo}". Localize a TABELA de itens com o VENCEDOR (ignore atas de análise de recurso, que não têm essa tabela). Devolva SOMENTE JSON: {"tem_tabela":bool,"tipo_doc":"...","itens":[{"item":"","descricao":"","fornecedor":"","marca":"","modelo":"","valor_unitario":""}]}. Inclua TODOS os itens que tiverem MARCA visível. Se não houver tabela de itens com marca, {"tem_tabela":false,"itens":[]}.` }
  ]}]};
  const r = await fetch("https://api.anthropic.com/v1/messages", { method: "POST",
    headers: { "x-api-key": KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify(body) });
  const j = await r.json();
  if (j.error) throw new Error("API:" + (j.error.message || "").slice(0, 120));
  const txt = (j.content || []).map(c => c.text || "").join("");
  const m = txt.match(/\{[\s\S]*\}/); if (!m) return { tem_tabela: false, itens: [] };
  try { return JSON.parse(m[0]); } catch { return { tem_tabela: false, itens: [] }; }
}

async function processa(db, d) {
  const url = `https://pncp.gov.br/pncp-api/v1/orgaos/${d.cnpj}/compras/${d.ano}/${d.seq}/arquivos/${d.sd}`;
  const mark = (status, n, msg) => db.query(
    `insert into app.marca_visao_feitas(cnpj,ano,seq,sd,status,n_itens,msg) values($1,$2,$3,$4,$5,$6,$7)
     on conflict(cnpj,ano,seq,sd) do update set status=$5,n_itens=$6,msg=$7,atualizado=now()`,
    [d.cnpj, d.ano, d.seq, d.sd, status, n || 0, (msg || "").slice(0, 200)]);
  try {
    const resp = await fetch(url); if (!resp.ok) return mark("erro_download", 0, "HTTP " + resp.status);
    const buf = Buffer.from(await resp.arrayBuffer());
    if (buf.length > MAXPDF) return mark("muito_grande", 0, buf.length + "b");
    const out = await haiku(buf.toString("base64"), d.titulo);
    const itens = (out.itens || []).filter(i => i && i.marca && String(i.marca).trim());
    if (!out.tem_tabela || !itens.length) return mark("sem_tabela", 0, out.tipo_doc || "");
    for (const i of itens) await db.query(
      `insert into app.item_marca_visao_sc(cnpj,ano,seq,sd,numero,descricao,fornecedor,marca,modelo,valor_unitario,portal,modalidade,tipo_doc)
       values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
      [d.cnpj, d.ano, d.seq, d.sd, String(i.item ?? ""), String(i.descricao ?? "").slice(0, 500),
       String(i.fornecedor ?? "").slice(0, 200), String(i.marca).slice(0, 160), String(i.modelo ?? "").slice(0, 120),
       String(i.valor_unitario ?? ""), d.portal, d.modalidade, out.tipo_doc || null]);
    return mark("ok", itens.length, out.tipo_doc || "");
  } catch (e) { return mark("erro", 0, e.message); }
}

async function main() {
  const db = new pg.Pool({ connectionString: DB, ssl: { rejectUnauthorized: false }, max: CONC + 1, statement_timeout: 120000 });
  db.on("error", () => {});
  await ddl(db);
  const lim = LIMIT > 0 ? `limit ${LIMIT}` : "";
  const cand = (await db.query(`
    select t.cnpj,t.ano,t.seq,t.sequencial_documento sd,t.titulo,
           c.plataforma portal,c.modalidade
    from arquivo_texto_sc t
    join contratacoes_sc c on c.cnpj=t.cnpj and c.ano=t.ano and c.seq=t.seq
    where ${RES} and t.chars<=2 and c.valor_homologado is not null
      and exists(select 1 from itens_sc i where i.cnpj=t.cnpj and i.ano=t.ano and i.seq=t.seq)
      and not exists(select 1 from app.marca_visao_feitas f
                     where f.cnpj=t.cnpj and f.ano=t.ano and f.seq=t.seq and f.sd=t.sequencial_documento)
    order by case c.modalidade when 'Pregão - Eletrônico' then 0 when 'Dispensa' then 1
             when 'Inexigibilidade' then 2 else 9 end, t.cnpj ${lim}`)).rows;
  console.log(`candidatos: ${cand.length} (LIMIT=${LIMIT}) · conc ${CONC}`);
  let done = 0;
  for (let i = 0; i < cand.length; i += CONC) {
    await Promise.all(cand.slice(i, i + CONC).map(d => processa(db, d)));
    done += Math.min(CONC, cand.length - i);
    process.stdout.write(`\r  ${done}/${cand.length}`);
  }
  console.log("\n=== RESULTADO por status ===");
  console.table((await db.query(`select status,count(*) n,sum(n_itens) itens from app.marca_visao_feitas group by 1 order by 2 desc`)).rows);
  console.log("=== marcas por PORTAL × modalidade ===");
  console.table((await db.query(`select portal,modalidade,count(*) linhas,count(distinct cnpj||ano||seq) proc from app.item_marca_visao_sc group by 1,2 order by 3 desc`)).rows);
  await db.end();
}
main().catch(e => { console.error("ERRO:", e.message); process.exit(1); });
