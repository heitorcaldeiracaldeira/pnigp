// Nota metodológica ÚNICA (fonte de verdade) sobre como os itens de compra são tratados:
// análise por item · aglutinação · classificação no catálogo oficial CATMAT/CATSER.
// Tom neutro/didático; mantém o estilo das notas já existentes (sem redesenho).
//   resumo  → uma linha discreta (slate-400), para telas onde o tema é secundário
//   padrão  → caixa slate-50, para a análise de itens propriamente dita

export function MetodologiaItens({ resumo = false }: { resumo?: boolean }) {
  if (resumo) {
    return (
      <p className="mt-2 text-[11px] leading-relaxed text-slate-400">
        <b className="text-slate-500">Metodologia.</b> Análise por <b>item</b> (descritivo do PNCP — preço unitário, não o objeto do edital).
        Itens equivalentes são <b>aglutinados</b> pela descrição normalizada (sem acento/maiúsculas/pontuação) <b>+ a mesma unidade</b>.
        Para categorias, cada item é <b>classificado</b> no catálogo oficial <b>CATMAT</b> (materiais) / <b>CATSER</b> (serviços) por similaridade textual, com <b>faixa de confiança</b> (alta/média).
      </p>
    );
  }
  return (
    <div className="mt-3 rounded-lg bg-slate-50 p-3 text-[11px] leading-relaxed text-slate-500">
      <b className="text-slate-600">📋 Metodologia — item, aglutinação e classificação.</b> Fonte: <b>PNCP</b> (itens, processos e contratos — dados oficiais).
      <br />• <b>Nível item:</b> a análise é do <b>item</b> de cada processo (preço unitário), <b>não</b> do objeto do edital — é o que permite comparar preço a preço.
      <br />• <b>Aglutinação (para comparar preço):</b> como o PNCP não traz o código do item, agrupamos pela <b>descrição normalizada</b> (sem acento/maiúsculas/pontuação) <b>+ a mesma unidade</b>, comparando apenas itens equivalentes presentes em <b>≥5 municípios de SC</b>.
      <br />• <b>Classificação (para categorizar):</b> cada descritivo é casado ao <b>catálogo oficial CATMAT/CATSER</b> (materiais/serviços) por similaridade de termos — núcleo do descritivo + cobertura, com tolerância a plural/variações. Cada casamento recebe uma <b>faixa de confiança</b> (alta = forte correspondência; média = indicativa); o que não atinge o mínimo fica <b>sem classificação</b> em vez de ser forçado.
      <br />• <b>É estimativa indicativa:</b> a aglutinação e a classificação partem de texto livre — confirmar a especificação do item antes de concluir sobrepreço ou enquadramento.
    </div>
  );
}
