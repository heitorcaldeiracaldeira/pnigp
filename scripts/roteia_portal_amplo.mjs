// ROTEADOR AMPLO do portal de origem — ataca os "SEM ROTA" que o detector antigo não alcança:
//   (1) o detector só olhava doc 'Edital' → Dispensa/Inexig (sem edital, mas com Aviso/TR/DFD) ficavam FORA da tabela;
//   (2) e só rodava 400/leva, nunca terminou. Aqui: lê QUALQUER doc com texto, escolhe 1 portal por proc (o 1º doc
//   que nomeia portal), cobre INSERT (fora da tabela) + UPDATE (portal_real null). Marca não-casável como tentado
//   (grava linha com portal_real=null) pra não re-varrer. Set-based, em lote, idempotente. Só procs HOMOLOGADOS
//   (os que têm marca a coletar). O portal sai do DOC, não do rótulo `plataforma` ([[pnigp-plataforma-rotulo-vs-sistema]]).
//   node scripts/roteia_portal_amplo.mjs
import fs from "fs"; import pg from "pg";
const U = fs.readFileSync("./.env.local", "utf8").match(/^DATABASE_URL=(.+)$/m)[1].trim();
const db = new pg.Pool({ connectionString: U, ssl: { rejectUnauthorized: false }, max: 2, statement_timeout: 590000 });
const UF = (process.env.UF || "sc").toLowerCase();
const LOTE = Number(process.env.LOTE || 6000);
const TXT = `arquivo_texto_${UF}`, CONTR = `contratacoes_${UF}`, ITENS = `itens_${UF}`;
const PPR = "app.processo_portal_real";

// CASE de detecção (prioridade = ordem; portais mais específicos primeiro). Padrão sai do DOC.
const CASE = `case
  when tx ~ 'e-?lic\\.sc\\.gov|portaldecompras\\.sc|portal de compras.*santa catarina|secretaria de estado da administra|\\melic\\M' then 'Estado de Santa Catarina (e-lic)'
  when tx ~ 'portaldecompraspublicas|portal de compras p' then 'Portal de Compras Públicas'
  when tx ~ '\\mbnc\\M|bolsa nacional de compras|bnccompras' then 'BNC'
  when tx ~ '\\mbll\\M|bolsa de licita|bllcompras' then 'BLL'
  when tx ~ 'comprasbr|az inform' then 'ComprasBR (AZ)'
  when tx ~ 'licitanet' then 'Licitanet'
  when tx ~ 'licitar ?digital' then 'Licitar Digital'
  when tx ~ 'bbmnet|bolsa brasileira' then 'BBMNET'
  when tx ~ 'compras\\.gov|comprasnet|cnetmobile|gov\\.br/compras' then 'Compras.gov'
  when tx ~ 'licitacoes-?e|banco do brasil' then 'Licitações-E BB'
  when tx ~ 'ecustomize|e-custom' then 'ECustomize'
  when tx ~ 'publica ?tec|publicanet' then 'Pública Tecnologia'
  when tx ~ 'governanca ?brasil|gov ?brasil' then 'Governançabrasil'
  else null end`;
const caseTx = CASE.replace(/tx/g, "left(lower(t.texto),9000)");

// PASS A — INSERT: procs FORA da tabela, com QUALQUER doc de texto → detecta pelo 1º doc que nomeia portal (senão null=tentado)
async function passA() {
  let tot = 0;
  for (let i = 0; i < 60; i++) {
    const r = await db.query(`
      with alvo as (
        select c.cnpj,c.ano,c.seq,c.modalidade,c.plataforma from ${CONTR} c
        where exists(select 1 from ${ITENS} i where i.cnpj=c.cnpj and i.ano=c.ano and i.seq=c.seq and i.unit_homologado is not null)
          and not exists(select 1 from ${PPR} p where p.cnpj=c.cnpj and p.ano=c.ano and p.seq=c.seq)
          and exists(select 1 from ${TXT} t where t.cnpj=c.cnpj and t.ano=c.ano and t.seq=c.seq and t.chars>500)
        limit ${LOTE}
      ),
      scan as (
        select distinct on (a.cnpj,a.ano,a.seq) a.cnpj,a.ano,a.seq,a.modalidade,a.plataforma, ${caseTx} portal
        from alvo a join ${TXT} t on t.cnpj=a.cnpj and t.ano=a.ano and t.seq=a.seq and t.chars>500
        order by a.cnpj,a.ano,a.seq, (${caseTx}) is null   -- doc que casa portal vem primeiro
      )
      insert into ${PPR}(cnpj,ano,seq,portal_real,modalidade,plataforma_rotulo)
      select cnpj,ano,seq,portal,modalidade,plataforma from scan
      on conflict(cnpj,ano,seq) do nothing`);
    tot += r.rowCount;
    process.stdout.write(`\r  PASS A (INSERT fora-da-tabela): ${tot}`);
    if (r.rowCount === 0) break;
  }
  console.log("");
  return tot;
}
// PASS B — UPDATE: procs com portal_real NULL (detector antigo não achou no Edital) → tenta em QUALQUER doc
async function passB() {
  let tot = 0;
  for (let i = 0; i < 40; i++) {
    const r = await db.query(`
      with alvo as (
        select p.cnpj,p.ano,p.seq from ${PPR} p
        where p.portal_real is null
          and exists(select 1 from ${TXT} t where t.cnpj=p.cnpj and t.ano=p.ano and t.seq=p.seq and t.chars>500)
        limit ${LOTE}
      ),
      scan as (
        select distinct on (a.cnpj,a.ano,a.seq) a.cnpj,a.ano,a.seq, ${caseTx} portal
        from alvo a join ${TXT} t on t.cnpj=a.cnpj and t.ano=a.ano and t.seq=a.seq and t.chars>500
        order by a.cnpj,a.ano,a.seq, (${caseTx}) is null
      )
      update ${PPR} p set portal_real=s.portal, atualizado=now()
      from scan s where p.cnpj=s.cnpj and p.ano=s.ano and p.seq=s.seq and s.portal is not null and p.portal_real is null`);
    tot += r.rowCount;
    process.stdout.write(`\r  PASS B (UPDATE nulls): ${tot}`);
    if (r.rowCount === 0) break;
  }
  console.log("");
  return tot;
}

async function main() {
  const t0 = Date.now();
  const a = await passA();
  const b = await passB();
  console.log(`\n✔ roteados: +${a} (fora-da-tabela) · +${b} (nulls) em ${((Date.now() - t0) / 1000).toFixed(0)}s`);
  console.log("\n=== PORTAL REAL (procs homolog) ===");
  console.table((await db.query(`
    select coalesce(p.portal_real,'(ainda sem rota)') portal, count(*) procs
    from ${PPR} p
    where exists(select 1 from ${ITENS} i where i.cnpj=p.cnpj and i.ano=p.ano and i.seq=p.seq and i.unit_homologado is not null)
    group by 1 order by 2 desc`)).rows);
  await db.end();
}
main().catch((e) => { console.error("ERRO:", e.message); process.exit(1); });
