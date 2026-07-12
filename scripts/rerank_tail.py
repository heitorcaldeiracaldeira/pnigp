# PROTÓTIPO do RERANKER da cauda (retrieve-then-rerank, sem LLM). Estágio 1 (retriever): candidatos que trigrama+char-SVM
# já geram (na planilha). Estágio 2 (rerank): escolhe o candidato com MAIOR COBERTURA — fração das palavras do nome do
# PDM presentes na descrição — desempatando por similaridade char. Implementa a "negative evidence": filtra o
# "similar-mas-errado" (PRÓTESE DE JOELHO perde p/ JOELHO PVC ESGOTO). python scripts/rerank_tail.py
import os, csv, re
from collections import defaultdict

SC = os.environ.get("SCRATCH", r"C:/Users/PC/AppData/Local/Temp/claude/C--Users-PC/2adabc17-0913-484a-9ca7-576bee797555/scratchpad")
csv.field_size_limit(10**7)
def load(p):
    with open(p, encoding="utf-8") as f: return list(csv.DictReader(f, delimiter="\t"))
def norm(s): return re.sub(r"\s+", " ", (s or "").lower()).strip()
STOP = {"de","da","do","para","com","em","por","ou","das","dos","p","a","o","e","the","of","sem"}
def words(s): return [w for w in re.findall(r"[a-záàâãéêíóôõúüç0-9]+", norm(s)) if len(w) >= 3 and w not in STOP]
def cg(s, n=3):
    s = " " + norm(s) + " "; return {s[i:i+n] for i in range(len(s)-n+1)}
def jac(a, b):
    A, B = cg(a), cg(b); return len(A & B) / len(A | B) if (A | B) else 0
def coverage(desc, cand):
    cw = words(cand); dw = set(words(desc))
    return (sum(1 for w in cw if w in dw) / len(cw)) if cw else 0

GOLD = {0:13546,1:19789,2:19772,3:19036,4:19773,5:30040,6:823,7:5778,8:6250,9:4550,10:20,11:18071,12:8618,13:3868,14:1501,15:19715,16:19705,17:12820,18:862,19:1505,20:911,21:0,22:19716,23:1415,24:5648,25:17297,26:30022,27:1080,28:11676,29:8203,30:1265,31:0,32:8974,33:615,34:6661,35:436,36:14584,37:12501,38:19771,39:12810,40:388,41:13634,42:4964,43:0,44:8414,45:13772,46:0,47:7059,48:8513,49:18258,50:0,51:17368,52:175,53:7868,54:30084,55:5200,56:0,57:0,58:3965,59:8719,60:18153,61:0,62:5017,63:1627,64:6537,65:14559,66:-1,67:578,68:696,69:5056,70:1076,71:8254,72:7595,73:3817,74:10422,75:-1,76:-1,77:5978,78:4010,79:-1,80:19769,81:8200,82:10383,83:7819,84:863,85:397,86:1139,87:0,88:14969,89:-1}
allname = {n["codigo_pdm"]: n["nome_pdm"] for n in load(SC + "/pdm_names.tsv")}

def parse_cands(row):  # une candidatos do SVM e do trigrama -> [(code,name)] dedup
    out, seen = [], set()
    for col in ("cand_svm", "cand_trgm"):
        for tok in (row.get(col) or "").split(" | "):
            if ":" in tok:
                code, name = tok.split(":", 1)
                if code not in seen: seen.add(code); out.append((code.strip(), name.strip()))
    return out

ws = {int(r["i"]): r for r in load(SC + "/sc_strat_ws.tsv")}
BANDS = ["A_200+","B_50-199","C_20-49","D_5-19","E_2-4"]
agg = defaultdict(lambda: {"n":0,"trig":0,"rerank":0})
fixes = []
for i in sorted(ws):
    g = GOLD[i]
    if g <= 0: continue
    r = ws[i]; band = r["band"]; desc = r["chave"]; a = agg[band]; a["n"] += 1
    gn = norm(allname.get(str(g), ""))
    cands = parse_cands(r)
    # retriever top-1 = 1o candidato do trigrama
    trig = (r.get("cand_trgm") or "").split(" | ")[0].split(":", 1)
    trig_name = trig[1] if len(trig) > 1 else ""
    # reranker: maior (cobertura, jac) entre os candidatos
    best = max(cands, key=lambda cn: (coverage(desc, cn[1]), jac(desc, cn[1])), default=("", ""))
    if norm(trig_name) == gn: a["trig"] += 1
    if norm(best[1]) == gn: a["rerank"] += 1
    if norm(best[1]) == gn and norm(trig_name) != gn:
        fixes.append((band, desc, best[1], trig_name))

print(f"{'banda':10s} {'bens':>4} | {'TRIGRAMA':>8} | {'RERANK':>7}")
tn=tt=tr=0
for b in BANDS:
    a = agg[b]
    if not a["n"]: continue
    tn+=a["n"]; tt+=a["trig"]; tr+=a["rerank"]
    print(f"{b:10s} {a['n']:4d} | {100*a['trig']/a['n']:6.1f}% | {100*a['rerank']/a['n']:5.1f}%")
print(f"{'TOTAL':10s} {tn:4d} | {100*tt/tn:6.1f}% | {100*tr/tn:5.1f}%")
print(f"\n{len(fixes)} casos consertados pelo reranker:")
for band, desc, fixed, was in fixes:
    print(f"  [{band}] '{desc[:42]}' -> {fixed}  (trigrama dava: {was})")
