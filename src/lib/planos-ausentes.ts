// Motor de ausência — cruza os instrumentos de gestão que o município NÃO tem (base MUNIC/IBGE) com a obrigação
// legal e o repasse/consequência que a ausência trava. É o "ponto cego do servidor" aplicado aos planos: o gestor
// muitas vezes não sabe que a falta de um plano/fundo/conselho está fechando uma porta de recurso federal.
import type { MunicSC } from "./queries";

export type AusenciaMunic = { area: string; item: string; base: string; consequencia: string; prioridade: "alta" | "media" };

// Cada entrada casa um rótulo da MUNIC (por palavra-chave) com a base legal e a consequência da ausência.
const MAPA: { re: RegExp; area: string; item: string; base: string; consequencia: string; prioridade: "alta" | "media" }[] = [
  { re: /^plano diretor$/i, area: "Urbanismo", item: "Plano Diretor", prioridade: "alta",
    base: "Estatuto da Cidade (Lei 10.257/2001) — obrigatório p/ municípios com +20 mil hab, em região metropolitana ou de interesse turístico",
    consequencia: "Sem ele o município não pode aplicar IPTU progressivo, outorga onerosa e parcelamento/edificação compulsórios; a omissão pode configurar improbidade do gestor." },
  { re: /plano municipal de cultura/i, area: "Cultura", item: "Plano Municipal de Cultura", prioridade: "alta",
    base: "Sistema Nacional de Cultura (EC 71/2012) + Política Nacional Aldir Blanc — PNAB (Lei 14.399/2022)",
    consequencia: "Plano + Fundo + Conselho de Cultura são o tripé exigido para acessar os repasses federais anuais da PNAB." },
  { re: /fundo municipal de cultura/i, area: "Cultura", item: "Fundo Municipal de Cultura", prioridade: "alta",
    base: "Sistema Nacional de Cultura + PNAB",
    consequencia: "É o instrumento que recebe e executa os recursos da PNAB e demais programas culturais federais — sem fundo, o dinheiro não entra." },
  { re: /conselho municipal de cultura/i, area: "Cultura", item: "Conselho Municipal de Cultura", prioridade: "media",
    base: "Sistema Nacional de Cultura",
    consequencia: "Compõe, com o Plano e o Fundo, o tripé de adesão ao SNC e ao acesso pleno à PNAB." },
  { re: /conselho.*esporte/i, area: "Esporte", item: "Conselho Municipal de Esporte", prioridade: "media",
    base: "Política/Sistema Nacional do Esporte",
    consequencia: "Conselho e Fundo de Esporte estruturam o acesso a recursos do Ministério do Esporte e a projetos incentivados (Lei de Incentivo ao Esporte)." },
  { re: /fundo.*esporte/i, area: "Esporte", item: "Fundo Municipal de Esporte", prioridade: "media",
    base: "Sistema Nacional do Esporte",
    consequencia: "Instrumento para receber e executar recursos federais e incentivos ao esporte." },
  { re: /impacto de vizinhan/i, area: "Urbanismo", item: "Lei de Estudo de Impacto de Vizinhança (EIV)", prioridade: "media",
    base: "Estatuto da Cidade (arts. 36–38)",
    consequencia: "Sem o EIV o município fica sem instrumento para condicionar grandes empreendimentos e cobrar contrapartidas urbanas." },
  { re: /zoneamento ambiental|zoneamento ecol/i, area: "Meio ambiente", item: "Legislação de zoneamento ambiental", prioridade: "media",
    base: "Política Nacional do Meio Ambiente + Estatuto da Cidade",
    consequencia: "Base legal para o ordenamento territorial ambiental e o licenciamento local." },
  { re: /plano de carreira vigente para os profissionais|carreira.*n[ãa]o docentes/i, area: "Educação", item: "Plano de Carreira dos profissionais da educação (não docentes)", prioridade: "media",
    base: "LDB + Lei do Piso (11.738/2008)",
    consequencia: "Estrutura a valorização dos servidores da educação e a aplicação correta do FUNDEB (mín. 70% em profissionais)." },
  { re: /transporte escolar/i, area: "Educação", item: "Conselho de Transporte Escolar", prioridade: "media",
    base: "FNDE — PNATE / Caminho da Escola",
    consequencia: "Acompanha a aplicação dos recursos de transporte escolar; sua ausência é apontada no controle do FNDE." },
  // --- Instrumentos da MUNIC 2024 (habitação, mobilidade, governança) ---
  { re: /plano municipal de habita/i, area: "Habitação", item: "Plano Municipal de Habitação", prioridade: "alta",
    base: "Sistema Nacional de Habitação de Interesse Social — SNHIS (Lei 11.124/2005)",
    consequencia: "Plano + Conselho + Fundo de Habitação são condição para acessar o FNHIS e recursos habitacionais (FGTS/Minha Casa Minha Vida)." },
  { re: /fundo municipal de habita/i, area: "Habitação", item: "Fundo Municipal de Habitação", prioridade: "alta",
    base: "SNHIS (Lei 11.124/2005)",
    consequencia: "É o instrumento que recebe e executa os recursos habitacionais federais — sem fundo, o município não adere ao SNHIS." },
  { re: /conselho municipal de habita/i, area: "Habitação", item: "Conselho Municipal de Habitação", prioridade: "media",
    base: "SNHIS (Lei 11.124/2005)",
    consequencia: "Compõe, com o Plano e o Fundo, o tripé de adesão ao SNHIS e ao controle social da política habitacional." },
  { re: /plano municipal de transporte|plano.*mobilidade/i, area: "Mobilidade", item: "Plano de Mobilidade Urbana", prioridade: "alta",
    base: "Política Nacional de Mobilidade Urbana (Lei 12.587/2012) — obrigatório p/ municípios com +20 mil hab",
    consequencia: "Sem o plano, o município fica impedido de receber recursos federais destinados à mobilidade urbana." },
  { re: /conselho municipal de transpar[êe]ncia/i, area: "Governança", item: "Conselho de Transparência/Controle Social", prioridade: "media",
    base: "Lei de Acesso à Informação (12.527/2011) e Lei Anticorrupção",
    consequencia: "Fortalece o controle social e a transparência ativa — item avaliado no IEGM e no CAUC." },
];

// Deriva a lista priorizada de ausências a partir do que a MUNIC diz que o município NÃO tem (tem=false).
export function planosAusentes(munic: MunicSC): AusenciaMunic[] {
  if (!munic) return [];
  const ausentes = munic.grupos.flatMap((g) => g.itens).filter((i) => !i.tem);
  const out: AusenciaMunic[] = [];
  const vistos = new Set<string>();
  for (const a of ausentes) {
    const m = MAPA.find((x) => x.re.test(a.label));
    if (m && !vistos.has(m.item)) {
      vistos.add(m.item);
      out.push({ area: m.area, item: m.item, base: m.base, consequencia: m.consequencia, prioridade: m.prioridade });
    }
  }
  return out.sort((a, b) => (a.prioridade === "alta" ? 0 : 1) - (b.prioridade === "alta" ? 0 : 1));
}
