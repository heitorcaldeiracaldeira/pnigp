// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
// fix_funcao_cpf_mascara.mjs — decodifica o CPF MASCARADO que cada portal publica do seu jeito.
//
// POR QUÊ: o CPF mascarado é a única chave que separa HOMÔNIMO entre fontes (mesmo nome, CPF diferente) e casa a
// mesma pessoa em dois portais. Mas cada fornecedor mascara de um jeito, e DOIS deles corrompem o dado ao mascarar:
//
//   ✅ `***.039.200-**`  miolo visível (6 dígitos)  — layout, geosiap, rpm, ss, tcepb, topsolutions, megasoft…
//   ✅ `275.***.***-04`  pontas visíveis (3+2)      — abase, epublica, tcemt
//   ✅ `065******96`     pontas sem pontuação       — citta
//   ✅ `***.848.040-87`  miolo + sufixo (8)         — dbseller (parte)
//   🚨 `***..39.2.0-**`  **CADA ZERO VIRA PONTO**   — PortalTP, Porto Velho, Layout(10 linhas).
//        Medido na fonte em 21/ago/2026: `domingosmartins-es.portaltp.com.br` responde exatamente assim.
//        É REVERSÍVEL: o texto tem sempre 14 caracteres, então a posição diz onde havia dígito — e onde há
//        ponto numa casa de dígito, o dígito era ZERO.
//   🚨 `xxx.791.71-xx`   **ZEROS SUPRIMIDOS**       — NucleoGov (32 mil linhas, 10 a 13 caracteres).
//        NÃO é reversível: sabe-se que falta um zero, não em que casa. Marca-se `incerto` e não se usa como
//        chave — inventar a posição seria fabricar CPF ([[pnigp-lista-sem-valor-nao-e-folha]] é a mesma régua:
//        dado que não prova o que promete não entra como se provasse).
//
// A função devolve `cpf_visivel`: 11 posições, dígito onde se conhece e `?` onde está oculto — formato único
// para comparar QUALQUER fonte com qualquer outra.
//
// Uso: node scripts/fix_funcao_cpf_mascara.mjs
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
import { pool, withRetry } from "./_cadprev.mjs";
const db = pool();
const q = withRetry(db);

await q(`create or replace function cpf_masc_visivel(txt text) returns text language plpgsql immutable as $fn$
declare
  t text := upper(btrim(coalesce(txt, '')));
  so_dig text; i int; c text; out text := '';
begin
  if t = '' then return null; end if;
  -- 🚨 lixo colado no valor: o CR2 entrega "635.XXX.XXX-34 Data de" (o rótulo do campo seguinte veio junto)
  t := (regexp_match(t, '^[0-9X*#. /-]+'))[1];
  if t is null then return null; end if;
  t := btrim(t);
  -- CNPJ não é pessoa (o MegaSoft trouxe 1 linha assim)
  if t ~ '/' then return null; end if;

  -- caso A — 14 caracteres no gabarito NNN.NNN.NNN-NN: a POSIÇÃO manda. Onde a casa de dígito tem ponto,
  -- o dígito era ZERO (PortalTP/Porto Velho); onde tem máscara (* x #), fica oculto.
  if length(t) = 14 and substr(t,4,1) in ('.',' ') and substr(t,8,1) in ('.',' ') and substr(t,12,1) in ('-',' ') then
    for i in 1..14 loop
      if i in (4,8,12) then continue; end if;                 -- separadores
      c := substr(t, i, 1);
      out := out || case when c ~ '[0-9]' then c
                         when c = '.'     then '0'            -- zero mascarado como ponto
                         else '?' end;
    end loop;
    return out;                                               -- 11 posições
  end if;

  -- caso B — 11 caracteres, só dígitos e máscara, sem pontuação (065******96)
  if length(t) = 11 and t ~ '^[0-9X*#]{11}$' then
    for i in 1..11 loop
      c := substr(t, i, 1);
      out := out || case when c ~ '[0-9]' then c else '?' end;
    end loop;
    return out;
  end if;

  -- caso C — 🚨 ZEROS SUPRIMIDOS (NucleoGov): o texto encurtou, então não se sabe a casa de cada dígito.
  --          Devolve NULO de propósito: dígito sem posição não identifica ninguém.
  return null;
end $fn$`);

await q(`create or replace function cpf_masc_padrao(txt text) returns text language sql immutable as $$
  select case
    when coalesce(btrim(txt),'') = '' then null
    when cpf_masc_visivel(txt) is null and btrim(txt) <> '' then 'incerto (fonte suprimiu zeros)'
    when cpf_masc_visivel(txt) !~ '[0-9]' then 'oculto (sem dígito visível)'
    when cpf_masc_visivel(txt) ~ '^\\?\\?\\?[0-9]{6}\\?\\?$' then 'miolo 6'
    when cpf_masc_visivel(txt) ~ '^[0-9]{3}\\?{6}[0-9]{2}$' then 'pontas 3+2'
    when cpf_masc_visivel(txt) ~ '^\\?{3}[0-9]{8}$' then 'miolo+sufixo 8'
    when cpf_masc_visivel(txt) ~ '^[0-9]{3}\\?{8}$' then 'prefixo 3'
    else 'outro' end $$`);

console.log("→ cpf_masc_visivel() e cpf_masc_padrao() criadas");
const t = await q(`select cpf_masc_visivel($1) a, cpf_masc_visivel($2) b, cpf_masc_visivel($3) c,
  cpf_masc_visivel($4) d, cpf_masc_visivel($5) e, cpf_masc_padrao($1) pa, cpf_masc_padrao($4) pd, cpf_masc_padrao($5) pe`,
  ["***..39.2.0-**", "275.***.***-04", "065******96", "xxx.791.71-xx", "***.848.040-87"]);
console.table([t.rows[0]]);
await db.end();
