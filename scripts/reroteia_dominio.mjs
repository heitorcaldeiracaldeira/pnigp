// RE-ROTEIA por DOMÍNIO + PRIORIDADE (v2) — corrige a co-citação e o ERP-relay.
// Problemas do v1: (a) entre docs multi-portal, o distinct on escolhia arbitrário; (b) Atende.net (IPM) é ERP que
// PUBLICA — o domínio dele aparece mesmo quando a disputa roda no PCP/outra bolsa. Aqui: cada domínio tem PRIORIDADE
// (bolsa real 1..10 SEMPRE vence ERP), e o portal do proc = a MENOR prioridade entre TODOS os seus docs (bolsa vence
// co-citação). Atende só conta (pri 11) quando a URL vem em CONTEXTO DE DISPUTA (por meio de/endereço/sessão/pregão);
// atende só de publicação/transparência → não roteia. UPSERT sobrescreve. RESET=1 re-roteia tudo. node scripts/reroteia_dominio.mjs
import fs from "fs"; import pg from "pg";
const U = fs.readFileSync("./.env.local", "utf8").match(/^DATABASE_URL=(.+)$/m)[1].trim();
const db = new pg.Pool({ connectionString: U, ssl: { rejectUnauthorized: false }, max: 2, statement_timeout: 590000 });
const UF = (process.env.UF || "sc").toLowerCase();
const LOTE = Number(process.env.LOTE || 6000);
const RESET = process.env.RESET === "1";
const TXT = `arquivo_texto_${UF}`, CONTR = `contratacoes_${UF}`, ITENS = `itens_${UF}`;
const PPR = "app.processo_portal_real", FEITAS = "app.reroteia_feitas";

// PRIORIDADE por domínio (1..10 = bolsa real de disputa; 11 = ERP Atende SÓ com contexto de disputa). Menor vence.
const PRI = `case
  when tx ~ 'portaldecompraspublicas\\.com'                        then 1
  when tx ~ 'bllcompras\\.com'                                     then 2
  when tx ~ 'bnccompras\\.com|bnc\\.org\\.br'                      then 3
  when tx ~ 'comprasbr\\.com'                                      then 4
  when tx ~ 'licitardigital\\.com'                                 then 5
  when tx ~ 'licitanet\\.com'                                      then 6
  when tx ~ 'bbmnetlicitacoes\\.com|bbmnet\\.com'                  then 7
  when tx ~ 'licitacoes-e\\.com'                                   then 8
  when tx ~ 'e-?lic\\.sc\\.gov\\.br|compras\\.sc\\.gov\\.br'       then 9
  when tx ~ 'comprasnet\\.gov|compras\\.gov\\.br|gov\\.br/compras' then 10
  when tx ~ '(por meio d|endere[çc]o eletr|s[ií]tio eletr|plataforma|sistema|sess[aã]o|realizad|ocorrer)[^.]{0,60}[a-z0-9-]+\\.atende\\.net|[a-z0-9-]+\\.atende\\.net[^.]{0,60}(preg|disput|lance|sess[aã]o)' then 11
  else null end`;
const priTx = PRI.replace(/tx/g, "left(lower(t.texto),12000)");
// pri (int) → nome do portal (referencia b.pri direto)
const NOME = `case b.pri
  when 1 then 'Portal de Compras Públicas' when 2 then 'BLL' when 3 then 'BNC' when 4 then 'ComprasBR (AZ)'
  when 5 then 'Licitar Digital' when 6 then 'Licitanet' when 7 then 'BBMNET' when 8 then 'Licitações-E BB'
  when 9 then 'Estado de Santa Catarina (e-lic)' when 10 then 'Compras.gov' when 11 then 'Atende.net (IPM)' else null end`;

async function main() {
  const t0 = Date.now();
  await db.query(`create table if not exists ${FEITAS}(cnpj text,ano int,seq int,primary key(cnpj,ano,seq))`);
  if (RESET) { const d = await db.query(`truncate ${FEITAS}`); console.log("RESET: feitas zerado — re-roteia TUDO"); }
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
      -- por DOC: a prioridade do domínio citado (só docs que casam algum portal)
      docpri as (
        select a.cnpj,a.ano,a.seq, (${priTx}) pri
        from alvo a join ${TXT} t on t.cnpj=a.cnpj and t.ano=a.ano and t.seq=a.seq and t.chars>500
      ),
      -- por PROC: a MENOR prioridade entre todos os docs (bolsa real vence ERP e co-citação)
      best as (select cnpj,ano,seq, min(pri) pri from docpri where pri is not null group by 1,2,3),
      up as (
        insert into ${PPR}(cnpj,ano,seq,portal_real,modalidade,plataforma_rotulo)
        select a.cnpj,a.ano,a.seq, ${NOME}, a.modalidade, a.plataforma
        from alvo a left join best b using(cnpj,ano,seq)
        on conflict(cnpj,ano,seq) do update set portal_real=excluded.portal_real, atualizado=now()
        returning (portal_real is not null) tem
      ),
      mark as (insert into ${FEITAS}(cnpj,ano,seq) select cnpj,ano,seq from alvo on conflict do nothing returning 1)
      select count(*) n, count(*) filter(where tem) com from up`);
    const n = Number(r.rows[0].n), com = Number(r.rows[0].com);
    tot += n; comRota += com;
    process.stdout.write(`\r  re-roteados: ${tot} · com portal de DISPUTA: ${comRota}`);
    if (n === 0) break;
  }
  console.log(`\n✔ re-roteado ${tot} procs (${comRota} com portal de disputa) em ${((Date.now() - t0) / 1000).toFixed(0)}s`);
  console.log("\n=== MAPA VALIDADO v2 — portal de DISPUTA (bolsa>ERP, contexto) ===");
  console.table((await db.query(`
    select coalesce(p.portal_real,'(sem rota)') portal, count(*) procs
    from ${PPR} p where exists(select 1 from ${ITENS} i where i.cnpj=p.cnpj and i.ano=p.ano and i.seq=p.seq and i.unit_homologado is not null)
    group by 1 order by 2 desc`)).rows);
  await db.end();
}
main().catch((e) => { console.error("ERRO:", e.message); process.exit(1); });
