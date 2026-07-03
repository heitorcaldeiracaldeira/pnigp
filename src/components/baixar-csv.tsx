"use client";

// Botão reutilizável de exportação CSV — leva o dado para a LOA/LDO, requerimentos, planilhas (recomendação do
// documento de soluções: exportar é caminho de adoção orgânica). Separador ';' e BOM UTF-8 (Excel-BR abre certo).
import { Download } from "lucide-react";

type Coluna = { chave: string; rotulo: string };

export function BaixarCsv({ nome, colunas, linhas, label = "Baixar CSV", className = "" }: {
  nome: string; colunas: Coluna[]; linhas: Record<string, unknown>[]; label?: string; className?: string;
}) {
  const baixar = () => {
    const esc = (v: unknown) => {
      const s = v === null || v === undefined ? "" : String(v);
      return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const cabecalho = colunas.map((c) => esc(c.rotulo)).join(";");
    const corpo = linhas.map((r) => colunas.map((c) => esc(r[c.chave])).join(";")).join("\r\n");
    const csv = "﻿" + cabecalho + "\r\n" + corpo; // BOM p/ Excel abrir em UTF-8
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${nome.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  };
  return (
    <button onClick={baixar} title={`Exportar ${linhas.length} linhas em CSV`}
      className={`inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-600 hover:border-teal-300 hover:bg-teal-50 hover:text-teal-700 ${className}`}>
      <Download aria-hidden className="h-3 w-3" /> {label}
    </button>
  );
}
