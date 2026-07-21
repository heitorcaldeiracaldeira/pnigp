// RE-ROTEIA por DOMÍNIO (correção de precisão) — o roteia_portal_amplo casava NOME solto ("e-lic", "SEA")
// → 87% falso-positivo no e-lic. Aqui exige a URL/DOMÍNIO real do portal no doc (o portal se declara pela URL de
// disputa, não pelo nome citado de passagem). Re-computa portal_real de TODOS os procs homologados (UPSERT, sobrescreve
// a rota frouxa). Quem não cita domínio de portal volta a 'sem rota' (honesto). Inclui Atende.net (ERP IPM), revelado
// pelos falsos-positivos do e-lic. Set-based, em lote, idempotente (app.reroteia_feitas). node scripts/reroteia_dominio.mjs
import fs from "fs"; import pg from "pg";
const U = fs.readFileSync("./.env.local", "utf8").match(/^DATABASE_URL=(.+)$/m)[1].trim();
const db = new pg.Pool({ connectionString: U, ssl: { rejectUnauthorized: false }, max: 2, statement_timeout: 590000 });
const UF = (process.env.UF || "sc").toLowerCase();
const LOTE = Number(process.env.LOTE || 6000);
const TXT = `arquivo_texto_${UF}`, CONTR = `contratacoes_${UF}`, ITENS = `itens_${UF}`;
const PPR = "app.processo_portal_real", FEITAS = "app.reroteia_feitas";

// CASE por DOMÍNIO (a URL de disputa no doc). Ordem: estadual sc antes de federal p/ não confundir compras.sc × compras.gov.
const CASE = `case
  when tx ~ 'portaldecompraspublicas\\.com'                      then 'Portal de Compras Públicas'
  when tx ~ 'bllcompras\\.com'                                   then 'BLL'
  when tx ~ 'bnccompras\\.com|bnc\\.org\\.br'                    then 'BNC'
  when tx ~ 'e-?lic\\.sc\\.gov\\.br|compras\\.sc\\.gov\\.br'     then 'Estado de Santa Catarina (e-lic)'
  when tx ~ 'atende\\.net'                                       then 'Atende.net (IPM)'
  when tx ~ 'comprasnet\\.gov|compras\\.gov\\.br|gov\\.br/compras' then 'Compras.gov'
  when tx ~ 'licitardigital\\.com'                              then 'Licitar Digital'
  when tx ~ 'licitanet\\.com'                                   then 'Licitanet'
  when tx ~ 'bbmnetlicitacoes\\.com|bbmnet\\.com'               then 'BBMNET'
  when tx ~ 'licitacoes-e\\.com'                                then 'Licitações-E BB'
  when tx ~ 'comprasbr\\.com'                                   then 'ComprasBR (AZ)'
  when tx ~ 'portaldecompras\\.publica\\.inf|publicanet\\.com'  then 'Pública Tecnologia'
  when tx ~ 'ecustomize\\.com|licitardigital'                  then 'ECustomize'
  else null end`;
const caseTx = CASE.replace(/tx/g, "left(lower(t.texto),12000)");

async function main() {
  const t0 = Date.now();
  await db.query(`create table if not exists ${FEITAS}(cnpj text,ano int,seq int,primary key(cnpj,ano,seq))`);
  let tot = 0, comRota = 0;
  for (let i = 0; i < 80; i++) {
    const r = await db.query(`
      with alvo as (
        select c.cnpj,c.ano,c.seq,c.modalidade,c.plataforma from ${CONTR} c
        where exists(select 1 from ${ITENS} i where i.cnpj=c.cnpj and i.ano=c.ano and i.seq=c.seq and i.unit_homologado is not null)
          and exists(select 1 from ${TXT} t where t.cnpj=c.cnpj and t.ano=c.ano and t.seq=c.seq and t.chars>500)
          and not exists(select 1 from ${FEITAS} f where f.cnpj=c.cnpj and f.ano=c.ano and f.seq=c.seq)
        limit ${LOTE}
      ),
      scan as (
        select distinct on (a.cnpj,a.ano,a.seq) a.cnpj,a.ano,a.seq,a.modalidade,a.plataforma, ${caseTx} portal
        from alvo a join ${TXT} t on t.cnpj=a.cnpj and t.ano=a.ano and t.seq=a.seq and t.chars>500
        order by a.cnpj,a.ano,a.seq, (${caseTx}) is null   -- doc que cita domínio primeiro
      ),
      up as (
        insert into ${PPR}(cnpj,ano,seq,portal_real,modalidade,plataforma_rotulo)
        select cnpj,ano,seq,portal,modalidade,plataforma from scan
        on conflict(cnpj,ano,seq) do update set portal_real=excluded.portal_real, atualizado=now()
        returning (portal_real is not null) tem
      ),
      mark as (insert into ${FEITAS}(cnpj,ano,seq) select cnpj,ano,seq from scan on conflict do nothing returning 1)
      select count(*) n, count(*) filter(where tem) com from up`);
    const n = r.rows[0].n, com = Number(r.rows[0].com);
    tot += Number(n); comRota += com;
    process.stdout.write(`\r  re-roteados: ${tot} · com domínio: ${comRota}`);
    if (Number(n) === 0) break;
  }
  console.log(`\n✔ re-roteado ${tot} procs (${comRota} com domínio de portal) em ${((Date.now() - t0) / 1000).toFixed(0)}s`);
  console.log("\n=== MAPA VALIDADO — portal por DOMÍNIO (procs homologados) ===");
  console.table((await db.query(`
    select coalesce(p.portal_real,'(sem rota — sem domínio no doc)') portal, count(*) procs
    from ${PPR} p where exists(select 1 from ${ITENS} i where i.cnpj=p.cnpj and i.ano=p.ano and i.seq=p.seq and i.unit_homologado is not null)
    group by 1 order by 2 desc`)).rows);
  await db.end();
}
main().catch((e) => { console.error("ERRO:", e.message); process.exit(1); });
