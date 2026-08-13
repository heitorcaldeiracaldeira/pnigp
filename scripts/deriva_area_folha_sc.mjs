// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
// deriva_area_folha_sc.mjs — o campo SECRETARIA do pedido, derivado.
//
// POR QUÊ existe: `descricaoLotacao` é fiel à fonte e por isso é heterogêneo — em Jaraguá vem "Gerência de Ensino
// Fundamental - FUNDEB 70%" (secretaria), em Florianópolis vem "EBM PROF HERONDINA ZEFERINO" (a escola), em outros
// vem a dotação ("2.040 - Ensino Infantil - 70%") ou só a fonte ("FUNDEB 70%"). Ninguém consegue somar "quanto
// custa a Educação" a partir disso. A ÁREA é a leitura funcional dessa lotação — andar 2, derivada, marcada como
// tal ([[pnigp-arquitetura-espelho-vs-derivado]]): a tabela de folha continua sendo o espelho intocado.
//
// COMO: classifica os valores DISTINTOS (dezenas de milhares), não as linhas (milhões), e publica uma VIEW que
// faz o join. Assim reclassificar custa segundos e nenhuma escrita na tabela de fatos.
// A lotação manda; o cargo só decide quando a lotação não diz nada (estagiário lotado em "SECRETARIA", etc).
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
import { pool, withRetry } from "./_cadprev.mjs";

const db = pool();
const q = withRetry(db);

// A ordem IMPORTA: a primeira regra que casa vence. Educação antes de tudo porque "FUNDEB" só existe lá;
// Previdência antes de Administração porque "IPREV/instituto" cai no genérico; Legislativo é decidido pelo órgão.
const REGRAS = [
  ["Educação", /EDUCA|ENSIN|FUNDEB|ESCOL|CRECHE|\bCEI\b|NEIM|\bEBM\b|\bEEB\b|\bCEIM\b|MAGIST|PROFESSOR|\bPROF\b|PEDAG|SEMED|\bSME\b|MERENDA|ALIMENTA[ÇC][ÃA]O ESCOLAR|BIBLIOTEC|INFANTIL|FUNDAMENTAL|\bEJA\b|CRE[ÇC]HE|PR[ÉE]-?ESCOL|DIDATIC|TRANSPORTE ESCOLAR|UNIVERSID|FACULDADE|\bCMEI\b/i],
  ["Saúde", /SA[ÚU]DE|\bPSF\b|\bESF\b|\bUPA\b|\bUBS\b|ATEN[ÇC][ÃA]O B[ÁA]SICA|HOSPITAL|\bHMSJ\b|\bHMRC\b|ENFERM|ODONTO|M[ÉE]DIC|FARM[ÁA]C|VIGIL[ÂA]NCIA (SANIT|EPIDEM)|\bSAMU\b|\bPACS\b|\bCAPS\b|AMBUL[ÂA]T|LABORAT[ÓO]RIO|EPIDEMIOL|CENTRO DE ESPECIALID|PRONTO (ATENDIMENTO|SOCORRO)|\bUTI\b|ZOONOSE|ENDEMIA|RADIOLOG|FISIOTERAP|\bSES\b|\bSMS\b|\bSEMUS\b|\bPA (LESTE|SUL|NORTE|CENTRO)\b|BLOCO CIR[ÚU]RGICO|INTERNA[ÇC][ÃA]O|DIAGN[ÓO]STICO|VACINA|CENTRO DE SA[ÚU]DE|POLICL[ÍI]NICA/i],
  ["Assistência social", /ASSIST[ÊE]NCIA|A[ÇC][ÃA]O SOCIAL|\bCRAS\b|\bCREAS\b|PROTE[ÇC][ÃA]O SOCIAL|CONSELHO TUTELAR|\bSUAS\b|BOLSA FAM[ÍI]LIA|CADASTRO [ÚU]NICO|ABRIGO|IDOSO|CONV[ÍI]VIO|HABITA[ÇC][ÃA]O SOCIAL|SEGURAN[ÇC]A ALIMENTAR|ACOLHIMENTO|\bSEMAS\b|\bSMAS\b/i],
  ["Segurança e trânsito", /GUARDA (MUNICIPAL|PATRIMONIAL)|SEGURAN[ÇC]A P[ÚU]BLICA|TR[ÂA]NSITO|DEFESA CIVIL|BOMBEIR|VIGIL[ÂA]NCIA.*PATRIMONIAL|SEGURAN[ÇC]A VI[ÁA]RIA|POL[ÍI]CIA MUNICIPAL|SINALIZA[ÇC][ÃA]O|\bGMU\b|VIGIL[ÂA]NCIA \(PATRIMONIAL\)/i],
  ["Previdência", /PREVID|\bIPREV|\bRPPS\b|IPRECON|INSTITUTO DE APOSENT|FUNDO DE APOSENT|INATIVOS E PENSION|APOSENTADORIA|PENSIONISTA/i],
  ["Obras e infraestrutura", /\bOBRAS\b|INFRAESTRUT|URBANIS|VIA[ÇC][ÃA]O|PAVIMENT|SANEAMENT|\b[ÁA]GUA\b|ESGOTO|LIMPEZA|SERVI[ÇC]OS (URBANOS|GERAIS)|ILUMINA[ÇC][ÃA]O|RES[ÍI]DUOS|CEMIT[ÉE]RIO|OPERA[ÇC][ÕO]ES? URBAN|MANUTEN[ÇC][ÃA]O DE (VIAS|ESTRADAS)|ESTRADAS|GARAGEM|OFICINA|FROTA|\bETA\b|\bETE\b|\bIPUF\b|\bSMLMU\b|PLANEJAMENTO URBANO|\bSAMAE\b|MOBILIDADE/i],
  ["Agricultura e meio ambiente", /AGRICULT|\bRURAL\b|PESCA|MEIO AMBIENTE|AMBIENTAL|FLORESTA|AGROPECU|EXTENS[ÃA]O RURAL|VIGIL[ÂA]NCIA AMBIENT|\bSAMA\b|SUSTENTABILID/i],
  ["Cultura, esporte e turismo", /CULTURA|ESPORTE|TURISMO|LAZER|MUSEU|TEATRO|GIN[ÁA]SIO|DESPORT|EVENTOS/i],
  ["Desenvolvimento econômico", /IND[ÚU]STRIA|COM[ÉE]RCIO|DESENVOLVIMENTO ECON|TRABALHO E RENDA|EMPREG|\bSINE\b|INOVA[ÇC][ÃA]O/i],
  ["Administração e fazenda", /ADMINISTRA|FAZENDA|FINAN[ÇC]|TRIBUT|CONTABIL|RECURSOS HUMANOS|\bRH\b|PESSOAL|PATRIM[ÔO]NIO|COMPRAS|LICITA|JUR[ÍI]DIC|PROCURAD|CONTROLE INTERNO|PLANEJAMENTO|TECNOLOGIA|INFORM[ÁA]TICA|ARRECADA[ÇC][ÃA]O|TESOURARIA|PROTOCOLO|ALMOXARIF|\bSEFIN\b|\bSMF\b|ATENDIMENTO AO P[ÚU]BLICO|FISCALIZA[ÇC][ÃA]O|\bSEAD\b/i],
  ["Gabinete e governo", /GABINETE|PREFEIT|GOVERNO|COMUNICA[ÇC][ÃA]O|IMPRENSA|VICE-?PREFEIT|CHEFIA|ASSESSORIA ESPECIAL|CERIMONIAL|OUVIDORIA/i],
];

// Fallback pelo CARGO, quando a lotação não diz nada. Mesma ordem de precedência.
const REGRAS_CARGO = [
  ["Educação", /PROFESSOR|\bPROF\.?\b|PEDAGOG|MERENDEIR|MONITOR DE (CRECHE|EDUCA)|AUX.* (DE )?SALA|ORIENTADOR EDUCAC|DIRETOR DE ESCOLA|SECRET[ÁA]RI[OA] ESCOLAR|NUTRICIONISTA ESCOLAR|AGENTE DE ALIMENTA|EDUCA[ÇC][ÃA]O|ENSINO|ESCOLAR|CRECHE/i],
  ["Saúde", /M[ÉE]DIC|ENFERM|DENTISTA|ODONTOL|FARMAC[ÊE]UT|FISIOTERAP|PSIC[ÓO]LOG|COMUNIT.*SA[ÚU]DE|ENDEMIA|BIOQU[ÍI]MIC|FONOAUDI[ÓO]LOG|TERAPEUTA OCUPAC|NUTRICIONISTA|VETERIN[ÁA]RI|RADIOLOG|SA[ÚU]DE|HOSPITAL|LABORAT[ÓO]RI/i],
  ["Assistência social", /ASSISTENTE SOCIAL|EDUCADOR SOCIAL|CONSELHEIR[OA] TUTELAR|ORIENTADOR SOCIAL|\bSOCIAL\b/i],
  ["Segurança e trânsito", /GUARDA|AGENTE DE TR[ÂA]NSITO|TR[ÂA]NSITO|VIGIA|VIGIL[ÂA]NCIA|VIGILANTE|SALVA-?VIDAS|POLICIAL/i],
  ["Obras e infraestrutura", /OPERADOR DE M[ÁA]QUINA|MOTORISTA|PEDREIRO|SERVENTE|GARI|COLETOR|ELETRICISTA|ENCANADOR|CARPINTEIRO|JARDINEIRO|MEC[ÂA]NIC|ENGENHEIR[OA] CIVIL|ARQUITET|TOPOGRAF|AUXILIAR DE (OBRAS|SERVI[ÇC]OS)/i],
  ["Agricultura e meio ambiente", /AGR[ÔO]NOM|T[ÉE]CNICO AGR[ÍI]COLA|FISCAL AMBIENTAL|BI[ÓO]LOG/i],
  ["Administração e fazenda", /CONTADOR|TESOUREIR|FISCAL DE TRIBUT|AUDITOR|PROCURADOR|ADVOGAD|ANALISTA DE SISTEMA|T[ÉE]CNICO EM INFORM|ASSISTENTE ADMINISTRATIV|AUXILIAR ADMINISTRATIV|RECEPCIONIST|TELEFONIST|ARQUIVIST/i],
  ["Gabinete e governo", /PREFEIT|VICE-?PREFEIT|SECRET[ÁA]RI[OA] MUNICIPAL|ASSESSOR DE (IMPRENSA|COMUNICA)|CHEFE DE GABINETE/i],
];

function classifica(texto, regras) {
  if (!texto || texto === "-") return null;
  for (const [area, re] of regras) if (re.test(texto)) return area;
  return null;
}

await q(`create table if not exists folha_area_lotacao (lotacao text primary key, area text)`);
await q(`create table if not exists folha_area_cargo (cargo text primary key, area text)`);

// 1) lotações distintas
const lot = await q(`select distinct lotacao from folha_servidores_sc where lotacao is not null`);
const lotClass = lot.rows.map((r) => [r.lotacao, classifica(r.lotacao, REGRAS)]).filter((x) => x[1]);
console.log(`lotações distintas: ${lot.rows.length} · classificadas: ${lotClass.length} (${(100 * lotClass.length / lot.rows.length).toFixed(1)}%)`);

// 2) cargos distintos
const car = await q(`select distinct cargo from folha_servidores_sc where cargo is not null`);
const carClass = car.rows.map((r) => [r.cargo, classifica(r.cargo, REGRAS_CARGO)]).filter((x) => x[1]);
console.log(`cargos distintos: ${car.rows.length} · classificados: ${carClass.length} (${(100 * carClass.length / car.rows.length).toFixed(1)}%)`);

async function grava(tabela, chave, pares) {
  await q(`truncate ${tabela}`);
  for (let i = 0; i < pares.length; i += 2000) {
    const p = pares.slice(i, i + 2000);
    await q(`insert into ${tabela} (${chave}, area) select * from unnest($1::text[],$2::text[])
             on conflict (${chave}) do update set area=excluded.area`,
      [p.map((x) => x[0]), p.map((x) => x[1])]);
  }
}
await grava("folha_area_lotacao", "lotacao", lotClass);
await grava("folha_area_cargo", "cargo", carClass);

// 3) a VIEW de entrega: os cinco campos do pedido, com a área derivada ao lado da lotação fiel.
//    O órgão decide o Legislativo (Câmara) antes de qualquer palavra-chave, senão "GABINETE" leva vereador
//    para o Executivo.
await q(`create or replace view vw_folha_municipal_sc as
  select f.anomes,
         f.cod_ibge,
         f.municipio,
         f.orgao,
         f.poder,
         f.lotacao                                    as lotacao_origem,
         case when f.orgao ~* 'C[âa]mara' or f.cargo ~* 'VEREADOR' then 'Legislativo'
              else coalesce(l.area, c.area, 'Não classificado') end as area,
         f.cargo,
         f.tipo_cargo                                 as funcao,
         f.situacao,
         f.nome,
         f.bruto, f.descontos, f.liquido
    from folha_servidores_sc f
    left join folha_area_lotacao l on l.lotacao = f.lotacao
    left join folha_area_cargo   c on c.cargo   = f.cargo
   where f.situacao <> '-'`);

const cob = await q(`select area, count(*) linhas, count(distinct nome) pessoas, round(sum(bruto)/1e6,1) folha_mi
  from vw_folha_municipal_sc where situacao='Ativo' group by 1 order by 2 desc`);
console.log("\n=== cobertura da área (servidores ATIVOS) ===");
console.table(cob.rows);

await db.end();
