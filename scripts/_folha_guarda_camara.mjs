// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
// _folha_guarda_camara.mjs — a guarda que impede o coletor de gravar a folha da PREFEITURA como se fosse a da
// CÂMARA. Um lugar só, porque o erro apareceu em QUATRO coletores no mesmo dia.
//
// O QUE ACONTECEU (22/ago/2026): vários portais servem os dois poderes no mesmo endereço. Apontar o coletor para
// a URL da câmara e carimbar `poder='legislativo'` gravou o município inteiro — Matozinhos/MG com 1.439
// "vereadores" (RAIS: 49), Uruaçu/GO com 1.654 (RAIS: 53), Apiacá/ES com 487 (RAIS: 12). Nada falhou: fechou
// `ok` e inflou o placar. Foram 8.436 linhas apagadas.
//
// ⭐ A RÉGUA É A ESCALA, e o denominador existe: a RAIS publica quantas pessoas o Poder Legislativo de cada
//    município tem (natureza 1066). Procurar a palavra "câmara" nas linhas NÃO serve — em portal exclusivo de
//    câmara nenhuma linha repete a palavra (a do Rio tem 2.242 pessoas e zero ocorrência).
//
// Uso no coletor, antes de gravar:
//   const g = await guardaCamara(q, cod_ibge, pessoas);
//   if (!g.ok) { await marca("recusado_volume", g.motivo); continue; }
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════

const FATOR = Number(process.env.GUARDA_FATOR || 3);
const PISO = Number(process.env.GUARDA_PISO || 60);

export async function guardaCamara(q, codIbge, pessoas) {
  if (!codIbge || !pessoas) return { ok: true };
  const r = (await q(`select coalesce(rais_legislativo, 0)::int rais from aux_camara_com_folha where cod_ibge = $1`,
    [codIbge])).rows[0];
  const rais = r ? r.rais : 0;
  // sem denominador não se recusa nada: ausência de RAIS não é prova de contaminação
  if (!rais) return { ok: true, aviso: "sem RAIS do legislativo para comparar" };
  if (pessoas > PISO && pessoas > FATOR * rais) {
    return { ok: false,
      motivo: `${pessoas} pessoas para ${rais} da RAIS do legislativo (${(pessoas / rais).toFixed(1)}×) — ` +
              `é a folha do MUNICÍPIO, não a da câmara` };
  }
  return { ok: true };
}
