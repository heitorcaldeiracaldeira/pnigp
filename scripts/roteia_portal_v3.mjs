// ROTEADOR DE PORTAL v3 — resolve os processos homologados sem rota, RESPEITANDO a lei do ERP:
//   O portal que RODA a licitação é sempre um NÃO-ERP (bolsa/portal de disputa: PCP, BLL, BNC, ComprasBR,
//   Compras.gov, e-lic…). Quem ENVIA ao PNCP é o ERP (Betha, IPM/Atende, Pública, GovernançaBrasil).
//   Logo: o rótulo `plataforma` da API identifica o REMETENTE, nunca o portal ([[pnigp-erps-como-publicam]],
//   [[pnigp-plataforma-rotulo-vs-sistema]]). Domínio de ERP citado no documento é PUBLICAÇÃO, não disputa —
//   só vale como portal quando aparece em contexto explícito de disputa (o mesmo critério do v2).
//
// Três campos, três naturezas — nunca misturar:
//   portal_real     — onde a disputa correu. Só entra com PROVA (bolsa no documento ou no link da API).
//   remetente_pncp  — o ERP que transmitiu. FATO da API (rótulo `plataforma`), mas não é portal.
//   erp_no_doc      — ERP citado no documento (publicação). Evidência auxiliar, nunca rota de disputa.
//
// Por que sobrava tanta coisa: o mapa de domínios do v2 tinha 10 entradas e perdia variantes REAIS
// (bll.org.br / bllcompras.org.br, portal.sgpe.sea.sc.gov.br, cotacao.licitacao.sc.gov.br, licitamaisbrasil).
// Set-based, em lote, resumível (app.roteia_v3_feitas). RESET=1 refaz. LOTE=6000 padrão.
//   node scripts/roteia_portal_v3.mjs
import fs from "fs"; import pg from "pg";
const U = fs.readFileSync("./.env.local", "utf8").match(/^DATABASE_URL=(.+)$/m)[1].trim();
const db = new pg.Pool({ connectionString: U, ssl: { rejectUnauthorized: false }, max: 2, statement_timeout: 590000 });
const UF = (process.env.UF || "sc").toLowerCase();
const LOTE = Number(process.env.LOTE || 6000);
const RESET = process.env.RESET === "1";
const TXT = `arquivo_texto_${UF}`, CONTR = `contratacoes_${UF}`, ITENS = `itens_${UF}`;
const PPR = "app.processo_portal_real", FEITAS = "app.roteia_v3_feitas";

// —— PORTAL DE DISPUTA (não-ERP). Menor prioridade vence a co-citação.
const PRI = `case
  when tx ~ 'portaldecompraspublicas\\.(com|org)'                                    then 1
  when tx ~ 'bllcompras\\.(com|org)|bll\\.org\\.br|bolsa de licita'                  then 2
  when tx ~ 'bnccompras\\.com|bnc\\.org\\.br|bolsa nacional de compras'              then 3
  when tx ~ 'comprasbr\\.com|az inform'                                              then 4
  when tx ~ 'licitardigital\\.com|licitar ?digital'                                  then 5
  when tx ~ 'licitanet\\.com|licitanet'                                              then 6
  when tx ~ 'bbmnetlicitacoes\\.com|bbmnet\\.com|bolsa brasileira de mercadoria'     then 7
  when tx ~ 'licitacoes-?e2?\\.bb\\.com|licitacoes-?e\\.com'                         then 8
  when tx ~ 'licitamaisbrasil\\.com|licita ?\\+ ?brasil'                             then 9
  when tx ~ 'e-?lic\\.sc\\.gov\\.br|compras\\.sc\\.gov\\.br|sgpe\\.sea\\.sc\\.gov\\.br|cotacao\\.licitacao\\.sc\\.gov\\.br' then 10
  when tx ~ 'comprasnet\\.gov|compras\\.gov\\.br|cnetmobile|gov\\.br/compras'        then 11
  when tx ~ 'contrata ?\\+ ?brasil|contratamais\\.gov\\.br'                          then 12
  else null end`;
// NÃO é portal: ECustomize gera a ata/homologação e transmite ao PNCP, mas a disputa roda em outro lugar —
// 14.748 dos 16.662 processos que ele envia PROVAM o PCP como portal. Relay, igual aos demais ERPs.
// ERP com CONTEXTO DE DISPUTA — a única situação em que o domínio do ERP vira portal (critério herdado do v2)
const PRI_ERP_DISPUTA = `case
  when tx ~ '(por meio d|endere[çc]o eletr|s[ií]tio eletr|plataforma|sistema|sess[aã]o|realizad|ocorrer)[^.]{0,60}([a-z0-9-]+\\.atende\\.net|betha|publica ?tec|governanca ?brasil)|([a-z0-9-]+\\.atende\\.net|betha\\.(cloud|com\\.br)|publica ?tec|governanca ?brasil)[^.]{0,60}(preg[aã]o|disput|lance|sess[aã]o p)' then
    case when tx ~ 'atende\\.net' then 20 when tx ~ 'betha' then 21
         when tx ~ 'publica ?tec' then 22 else 23 end
  else null end`;
const NOME = `case pri
  when 1 then 'Portal de Compras Públicas' when 2 then 'BLL' when 3 then 'BNC' when 4 then 'ComprasBR (AZ)'
  when 5 then 'Licitar Digital' when 6 then 'Licitanet' when 7 then 'BBMNET' when 8 then 'Licitações-E BB'
  when 9 then 'Licita+Brasil' when 10 then 'Estado de Santa Catarina (e-lic)' when 11 then 'Compras.gov'
  when 12 then 'Contrata+Brasil'
  when 20 then 'Atende.net (IPM)' when 21 then 'Betha' when 22 then 'Pública Tecnologia' when 23 then 'Governançabrasil'
  else null end`;
// ERP citado no doc (publicação) — evidência auxiliar, NÃO é rota
const ERP_DOC = `case
  when tx ~ '[a-z0-9-]+\\.atende\\.net|ipm sistemas'    then 'Atende.net (IPM)'
  when tx ~ 'betha\\.(cloud|com\\.br)|betha sistemas'   then 'Betha'
  when tx ~ 'publica ?tec|publicanet'                    then 'Pública Tecnologia'
  when tx ~ 'governanca ?brasil|gov ?brasil tecnologia'  then 'Governançabrasil'
  when tx ~ 'ecustomize|e-custom'                        then 'ECustomize'
  else null end`;

async function ddl() {
  for (const c of ["via text", "remetente_pncp text", "erp_no_doc text"])
    await db.query(`alter table ${PPR} add column if not exists ${c}`);
  await db.query(`create table if not exists ${FEITAS}(cnpj text,ano int,seq int,primary key(cnpj,ano,seq))`);
  await db.query(`create index if not exists ix_ppr_null on ${PPR}(cnpj,ano,seq) where portal_real is null`);
  await db.query(`update ${PPR} set via='doc_bolsa_v2' where portal_real is not null and via is null`);
  // CORREÇÃO: a leva anterior gravou domínio de ERP como portal. Pela lei, ERP publica, não disputa → volta a null.
  const fix = await db.query(`update ${PPR} set erp_no_doc=portal_real, portal_real=null, via=null
    where via='doc_erp'`);
  if (fix.rowCount) console.log(`correção · linhas com ERP-como-portal revertidas: ${fix.rowCount} (viraram erp_no_doc)`);
  await db.query(`delete from ${FEITAS} f using ${PPR} p
    where f.cnpj=p.cnpj and f.ano=p.ano and f.seq=p.seq and p.portal_real is null and p.erp_no_doc is not null`);
  if (RESET) { await db.query(`truncate ${FEITAS}`); console.log("RESET: fila v3 zerada"); }
}

// PASSO 0 — toda contratação homologada tem linha na tabela
async function passo0() {
  const r = await db.query(`
    insert into ${PPR}(cnpj,ano,seq,portal_real,modalidade,plataforma_rotulo)
    select distinct c.cnpj,c.ano,c.seq,null,c.modalidade,c.plataforma from ${CONTR} c
    where exists(select 1 from ${ITENS} i where i.cnpj=c.cnpj and i.ano=c.ano and i.seq=c.seq and i.unit_homologado>0)
      and not exists(select 1 from ${PPR} p where p.cnpj=c.cnpj and p.ano=c.ano and p.seq=c.seq)
    on conflict do nothing`);
  console.log(`passo 0 · processos homologados inseridos: ${r.rowCount}`);
}

// PASSO 1 — REMETENTE (rótulo da API). FATO de quem transmitiu — NUNCA vira portal.
async function passo1() {
  const r = await db.query(`
    update ${PPR} p set remetente_pncp = nullif(btrim(c.plataforma),'')
    from ${CONTR} c where c.cnpj=p.cnpj and c.ano=p.ano and c.seq=p.seq
      and p.remetente_pncp is distinct from nullif(btrim(c.plataforma),'')`);
  console.log(`passo 1 · remetente_pncp (ERP que enviou) preenchido: ${r.rowCount}`);
}

// PASSO 2 — link_sistema_origem (campo da API). PROVA de portal, custo zero.
async function passo2() {
  const r = await db.query(`
    update ${PPR} p set portal_real=v.nome, via='link_origem', atualizado=now()
    from (select c.cnpj,c.ano,c.seq,(select ${NOME} from (select ${PRI.replace(/tx/g, "lower(c.link_sistema_origem)")} pri) z) nome
          from ${CONTR} c where c.link_sistema_origem is not null and btrim(c.link_sistema_origem)<>'') v
    where p.cnpj=v.cnpj and p.ano=v.ano and p.seq=v.seq and p.portal_real is null and v.nome is not null`);
  console.log(`passo 2 · roteados por link_sistema_origem: ${r.rowCount}`);
}

// PASSO 3 — DOCUMENTO. Bolsa (prova) > ERP só com contexto de disputa. Também colhe erp_no_doc (auxiliar).
// Custo: lê no máximo 3 docs por processo (Edital primeiro, depois Ata/resultado) em vez de todos — o detoast
// do texto é o gargalo ([[feedback-banco-e-o-gargalo]]).
async function passo3() {
  let varridos = 0, rot = 0, erp = 0, lotes = 0; const t0 = Date.now();
  for (let i = 0; i < 400; i++) {
    const r = await db.query(`
      with alvo as (
        select p.cnpj,p.ano,p.seq from ${PPR} p
        where p.portal_real is null
          and not exists(select 1 from ${FEITAS} f where f.cnpj=p.cnpj and f.ano=p.ano and f.seq=p.seq)
        limit ${LOTE}
      ),
      doc as (
        select a.cnpj,a.ano,a.seq, d.tx from alvo a
        cross join lateral (
          select left(lower(t.texto),10000) tx from ${TXT} t
          where t.cnpj=a.cnpj and t.ano=a.ano and t.seq=a.seq and t.chars>500
          order by (t.tipo_documento='Edital') desc, (t.titulo ~* 'ata|homolog|resultado|adjudica') desc, t.chars desc
          limit 3
        ) d
      ),
      sinal as (
        select cnpj,ano,seq,
          min(coalesce((${PRI.replace(/tx/g, "tx")}), (${PRI_ERP_DISPUTA.replace(/tx/g, "tx")}))) pri,
          min(${ERP_DOC.replace(/tx/g, "tx")}) erp
        from doc group by 1,2,3
      ),
      up as (
        update ${PPR} p set portal_real=(select ${NOME} from (select s.pri pri) z),
          via = case when s.pri is null then null when s.pri < 20 then 'doc_bolsa' else 'doc_erp_disputa' end,
          erp_no_doc = coalesce(s.erp, p.erp_no_doc), atualizado=now()
        from sinal s where p.cnpj=s.cnpj and p.ano=s.ano and p.seq=s.seq and p.portal_real is null
        returning (portal_real is not null) tem, (erp_no_doc is not null) temerp),
      mark as (insert into ${FEITAS}(cnpj,ano,seq) select cnpj,ano,seq from alvo on conflict do nothing returning 1)
      select (select count(*) from alvo) alvo, (select count(*) filter (where tem) from up) rot,
             (select count(*) filter (where temerp) from up) erp`);
    const n = Number(r.rows[0].alvo);
    varridos += n; rot += Number(r.rows[0].rot); erp += Number(r.rows[0].erp); lotes++;
    process.stdout.write(`\r  passo 3 · varridos ${varridos} · portal provado ${rot} · erp no doc ${erp} · ${((Date.now()-t0)/1000).toFixed(0)}s`);
    if (n === 0) break;
  }
  console.log("");
}

// PASSO 4 — ESTADO honesto do que sobrou: contratação direta não tem portal de disputa; o resto é "não lido ainda".
async function passo4() {
  const r = await db.query(`
    update ${PPR} p set via = case
        when p.modalidade in ('Dispensa','Inexigibilidade','Credenciamento') then 'sem_disputa_em_portal'
        else 'nao_lido' end
    where p.portal_real is null and p.via is null
      and exists(select 1 from ${FEITAS} f where f.cnpj=p.cnpj and f.ano=p.ano and f.seq=p.seq)`);
  console.log(`passo 4 · sem portal classificados (direta × não lido): ${r.rowCount}`);
}

async function relatorio() {
  console.log("\n=== ROTA por via — processos HOMOLOGADOS ===");
  console.table((await db.query(`
    select coalesce(p.via,'(nao varrido ainda)') via, count(*) procs,
           round(100.0*count(*)/sum(count(*)) over (),1) pct
    from ${PPR} p where exists(select 1 from ${ITENS} i where i.cnpj=p.cnpj and i.ano=p.ano and i.seq=p.seq and i.unit_homologado>0)
    group by 1 order by 2 desc`)).rows);
  console.log("=== PORTAL provado × via ===");
  console.table((await db.query(`
    select p.portal_real portal, p.via, count(*) procs from ${PPR} p
    where p.portal_real is not null
      and exists(select 1 from ${ITENS} i where i.cnpj=p.cnpj and i.ano=p.ano and i.seq=p.seq and i.unit_homologado>0)
    group by 1,2 order by 3 desc limit 25`)).rows);
  console.log("=== REMETENTE (ERP que enviou ao PNCP) — fato da API, NÃO é portal ===");
  console.table((await db.query(`
    select coalesce(p.remetente_pncp,'(vazio)') remetente, count(*) procs,
           count(*) filter (where p.portal_real is not null) com_portal_provado
    from ${PPR} p where exists(select 1 from ${ITENS} i where i.cnpj=p.cnpj and i.ano=p.ano and i.seq=p.seq and i.unit_homologado>0)
    group by 1 order by 2 desc limit 15`)).rows);
}

const t0 = Date.now();
await ddl(); await passo0(); await passo1(); await passo2(); await passo3(); await passo4(); await relatorio();
console.log(`\n✔ v3 (lei do ERP aplicada) em ${((Date.now()-t0)/1000).toFixed(0)}s`);
await db.end();
