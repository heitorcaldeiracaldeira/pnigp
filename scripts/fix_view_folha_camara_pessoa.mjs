// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
// fix_view_folha_camara_pessoa.mjs — a camada de PESSOA da folha das câmaras: uma linha por servidor, não por
// vínculo-mês, com tudo o que as fontes informam para identificá-lo.
//
// POR QUÊ (pedido do Heitor, 21/ago/2026): *"mantenha todos os dados informados, mesmo que haja CPF mascarado
// traga, importante para termos como fazer comparações para tratarmos os homônimos"*.
//
// ⭐ A CHAVE DE PESSOA, em ordem de força:
//   1. `cpf_visivel` — 11 posições, dígito onde a fonte publica e `?` onde oculta (`cpf_masc_visivel`).
//      É o que separa DUAS pessoas de mesmo nome na mesma câmara — medido: **4 "ERIVAN PEREIRA DA SILVA" na
//      Câmara de Jurema/PE**, com quatro CPFs diferentes.
//   2. `matricula` + entidade — quando a fonte não publica CPF (35 fontes, 317 mil linhas).
//   3. só o nome — o mais fraco, e é onde o homônimo engana.
//
// ⭐ O 9º dígito do CPF é a REGIÃO FISCAL de emissão, não é aleatório: no TCE-PE ele é '4' em 95,5% das linhas
//    (4ª RF = PE/AL/PB/RN). Serve de conferência de sanidade da máscara — se a UF não bate com a RF dominante,
//    desconfie da leitura da máscara antes de desconfiar do dado.
//
// ⚠️ NADA É DESCARTADO: quem tem CPF incerto (NucleoGov suprime zeros) entra com `cpf_padrao` declarando isso, e
//    o CPF original fica em `cpf_masc` para quem quiser reprocessar.
//
// Uso: node scripts/fix_view_folha_camara_pessoa.mjs
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
import { pool, withRetry } from "./_cadprev.mjs";
const db = pool();
const q = withRetry(db);

// chave de nome: sem acento, sem pontuação, espaços colapsados — para o mesmo nome casar entre fontes
await q(`create or replace function nome_pessoa_chave(t text) returns text language sql immutable as $$
  select nullif(regexp_replace(upper(translate(coalesce(t,''),
      'áàâãäéèêëíìîïóòôõöúùûüçÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇ',
      'aaaaaeeeeiiiiooooouuuucAAAAAEEEEIIIIOOOOOUUUUC')), '[^A-Z ]', ' ', 'g'), '') $$`);
await q(`create or replace function nome_pessoa_chave2(t text) returns text language sql immutable as $$
  select nullif(btrim(regexp_replace(nome_pessoa_chave(t), '\\s+', ' ', 'g')), '') $$`);

await q(`drop view if exists vw_folha_camara_pessoa cascade`);
await q(`create view vw_folha_camara_pessoa as
  select
    cod_ibge, uf, max(municipio) municipio,
    nome_pessoa_chave2(nome) nome_chave,
    coalesce(max(nome), '(fonte não publica o nome)') nome,
    cpf_visivel,
    max(cpf_masc)   cpf_masc,
    max(cpf_padrao) cpf_padrao,
    max(matricula)  matricula,
    max(data_admissao) data_admissao,
    max(carga_horaria) carga_horaria,
    string_agg(distinct fonte, ',')      fontes,
    string_agg(distinct cargo, ' | ')    cargos,
    string_agg(distinct camara, ' | ')   entidades,
    count(*)::int                        vinculos_mes,
    min(competencia)                     competencia_min,
    max(competencia)                     competencia_max,
    max(salario_bruto)                   maior_remuneracao,
    round(avg(salario_bruto), 2)         remuneracao_media,
    -- como esta pessoa foi identificada (a força da chave)
    case when cpf_visivel ~ '[0-9]' then 'cpf mascarado'
         when max(matricula) is not null and max(matricula) <> '' then 'matrícula + entidade'
         else 'somente o nome' end       chave_identificacao
  from vw_folha_camara_brasil
  where cod_ibge is not null
  group by cod_ibge, uf, nome_pessoa_chave2(nome), cpf_visivel`);

const r = (await q(`select count(*)::int pessoas,
    count(*) filter (where chave_identificacao = 'cpf mascarado')::int por_cpf,
    count(*) filter (where chave_identificacao = 'matrícula + entidade')::int por_matricula,
    count(*) filter (where chave_identificacao = 'somente o nome')::int so_nome
  from vw_folha_camara_pessoa`)).rows[0];
console.log(`✔ vw_folha_camara_pessoa: ${r.pessoas.toLocaleString("pt-BR")} pessoas`);
console.log(`   identificadas por CPF mascarado: ${r.por_cpf.toLocaleString("pt-BR")} · ` +
            `por matrícula: ${r.por_matricula.toLocaleString("pt-BR")} · só pelo nome: ${r.so_nome.toLocaleString("pt-BR")}`);

// ── HOMÔNIMOS: mesmo nome no mesmo município, CPFs diferentes ───────────────────────────────────────────────────
await q(`drop view if exists vw_folha_camara_homonimo cascade`);
await q(`create view vw_folha_camara_homonimo as
  select cod_ibge, uf, max(municipio) municipio, nome_chave,
         count(*)::int pessoas_distintas,
         string_agg(cpf_visivel, ' / ' order by cpf_visivel) cpfs,
         string_agg(distinct cargos, ' | ') cargos
    from vw_folha_camara_pessoa
   where nome_chave is not null and cpf_visivel ~ '[0-9]'
   group by cod_ibge, uf, nome_chave
  having count(*) > 1`);
const h = (await q(`select count(*)::int casos, sum(pessoas_distintas)::int pessoas from vw_folha_camara_homonimo`)).rows[0];
console.log(`✔ vw_folha_camara_homonimo: ${h.casos.toLocaleString("pt-BR")} nomes repetidos que são ` +
            `${h.pessoas.toLocaleString("pt-BR")} pessoas diferentes — separadas só porque o CPF veio junto`);
await db.end();
