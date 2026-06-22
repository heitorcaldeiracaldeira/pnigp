// Consolidação dos repasses do FNDE/SIMAD em grupos canônicos (rótulo leigo), a partir do campo "programa"
// (que vem fragmentado: variantes de acento/caixa + sufixos de etapa + códigos legados). Primeira regra que casa vence.
// Base de referência: dropdown oficial p_programa do SIMAD (tabela fnde_programa_ref) + nomes observados nos dados.

export type GrupoFnde = { chave: string; rotulo: string };

const REGRAS: { re: RegExp; chave: string; rotulo: string }[] = [
  { re: /PNAE|ALIMENTA[ÇC]/i, chave: "merenda", rotulo: "🍽️ Merenda escolar (PNAE)" },
  { re: /CAMINHO DA ESCOLA|PNATE/i, chave: "transporte", rotulo: "🚌 Transporte escolar" },
  { re: /ETI|TEMPO INTEGRAL|MAIS EDUCA/i, chave: "integral", rotulo: "⏰ Educação integral" },
  { re: /CRECHE|BRASIL CARINHOSO|PROINF[ÂA]NCIA|ED\.?\s*INFANTIL|EDUCA[ÇC][ÃA]O INFANTIL|^EI\b|MANUTEN[ÇC][ÃA]O ED/i, chave: "infantil", rotulo: "🧸 Creche e Educação Infantil" },
  { re: /INFRA|OBRA|QUADRA|CONSTRU|MOBILI|CLIMATIZ|REFORM|REDE F[IÍ]SICA|AMPLIA[ÇC]/i, chave: "infraestrutura", rotulo: "🧱 Infraestrutura e obras" },
  { re: /PDDE/i, chave: "pdde", rotulo: "🏫 Dinheiro Direto na Escola (PDDE)" },
  { re: /PRONATEC|MEDIOTEC|BOLSA FORMA|MULHERES MIL|EMPREGA MAIS/i, chave: "formacao", rotulo: "🎓 Formação profissional" },
  { re: /PROINFO|CONECTAD|PIEC|TABLET|COMPUTADOR|PC-?LEI|TERMINAIS|TECNOL[ÓO]G/i, chave: "tecnologia", rotulo: "💻 Tecnologia e conectividade" },
  { re: /PNLD|MATERIAL DID[ÁA]TICO|BNCC|CANTINHO DA LEITURA|LIVRO/i, chave: "didatico", rotulo: "📚 Livro e material didático" },
  { re: /FUNDEB/i, chave: "fundeb", rotulo: "💰 FUNDEB" },
  { re: /FPM|QUOTA|QSE|SAL[ÁA]RIO[- ]EDUCA/i, chave: "apoio", rotulo: "🤝 Apoio e quota (FPM/Salário-Educação)" },
  { re: /PROVA BRASIL|AAE|AVALIA|^PTA\b|ADMINISTRA[ÇC]/i, chave: "avaliacao", rotulo: "📋 Avaliação e gestão" },
  { re: /DIREITOS HUMANOS|INCLUSIV/i, chave: "inclusao", rotulo: "♿ Inclusão e direitos" },
];

const LEGADO = { chave: "outros", rotulo: "📦 Outros (código legado / anos anteriores)" };

export function grupoFnde(programa: string): GrupoFnde {
  const p = String(programa || "").trim();
  for (const r of REGRAS) if (r.re.test(p)) return { chave: r.chave, rotulo: r.rotulo };
  return LEGADO; // inclui códigos crípticos (001-005, etc.) e nomes não reconhecidos
}
