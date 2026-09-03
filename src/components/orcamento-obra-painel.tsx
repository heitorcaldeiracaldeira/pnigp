"use client";
// ═══ ENVELOPE do Banco de Preços + as três referências de obra + o carrinho de orçamento (03/set/2026) ═══
// Substitui o antigo quarteto solto <BancoPrecosPainel/><SinapiPainel/><SicroPainel/><SiescPainel/> por este
// envelope, que segura o estado do orçamento (os itens somados) e distribui `onAdicionar` para os quatro —
// é o que permite montar UM orçamento misturando preço PRATICADO (PNCP) com as três referências. Ver
// src/components/orcamento-obra.tsx para o tipo e o carrinho em si.
import { useState } from "react";
import BancoPrecosPainel from "@/components/banco-precos-painel";
import SinapiPainel from "@/components/sinapi-painel";
import SicroPainel from "@/components/sicro-painel";
import SiescPainel from "@/components/siesc-painel";
import { OrcamentoCarrinho, type ItemOrcamento, type NovoItemOrcamento } from "@/components/orcamento-obra";

export default function OrcamentoObraPainel({ nome }: { nome?: string }) {
  const [itens, setItens] = useState<ItemOrcamento[]>([]);
  const [desonerado, setDesonerado] = useState(false);

  const adicionar = (novo: NovoItemOrcamento, quantidade: number) => {
    const id = `${novo.fonte}:${novo.codigo}`;
    setItens((prev) => {
      const existente = prev.find((it) => it.id === id);
      if (existente) return prev.map((it) => it.id === id ? { ...it, quantidade: it.quantidade + quantidade } : it);
      return [...prev, { ...novo, id, quantidade }];
    });
  };
  const remover = (id: string) => setItens((prev) => prev.filter((it) => it.id !== id));
  const mudarQtd = (id: string, quantidade: number) => setItens((prev) => prev.map((it) => it.id === id ? { ...it, quantidade } : it));

  return (
    <>
      <BancoPrecosPainel nome={nome} onAdicionar={adicionar} />
      <SinapiPainel onAdicionar={adicionar} />
      <SicroPainel onAdicionar={adicionar} />
      <SiescPainel onAdicionar={adicionar} />
      <OrcamentoCarrinho itens={itens} desonerado={desonerado} onDesoneradoChange={setDesonerado} onQtdChange={mudarQtd} onRemover={remover} onAdicionar={adicionar} />
    </>
  );
}
