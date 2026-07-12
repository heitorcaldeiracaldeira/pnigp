# MELHORAR A SOLUÇÃO, com método: (1) mede RECALL@k (o PDM certo está entre os candidatos?) do retriever full vs
# full+cabeca — diz o TETO. (2) testa um reranker COMBINADO (sim + cobertura) "não-piora" sobre o pool expandido.
# python scripts/improve_solution.py
import os, csv, re, numpy as np
from collections import defaultdict
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import linear_kernel

SC = os.environ.get("SCRATCH", r"C:/Users/PC/AppData/Local/Temp/claude/C--Users-PC/2adabc17-0913-484a-9ca7-576bee797555/scratchpad")
csv.field_size_limit(10**7)
def load(p):
    with open(p, encoding="utf-8") as f: return list(csv.DictReader(f, delimiter="\t"))
def norm(s): return re.sub(r"\s+", " ", (s or "").lower()).strip()
STOP = {"de","da","do","para","com","em","por","ou","das","dos","p","a","o","e","sem","the","of"}
def words(s): return [w for w in re.findall(r"[a-záàâãéêíóôõúüç0-9]+", norm(s)) if len(w) >= 3 and w not in STOP]
def coverage(desc, cand):
    cw = words(cand); dw = set(words(desc)); return (sum(w in dw for w in cw) / len(cw)) if cw else 0
def head(ch):
    h = re.split(r"[,;:/()\[\]]| - |º|°|\d", ch)[0].strip(); t = h.split()
    return " ".join(t[:5]) if len(t) > 5 else h

GOLD = {0:13546,1:19789,2:19772,3:19036,4:19773,5:30040,6:823,7:5778,8:6250,9:4550,10:20,11:18071,12:8618,13:3868,14:1501,15:19715,16:19705,17:12820,18:862,19:1505,20:911,21:0,22:19716,23:1415,24:5648,25:17297,26:30022,27:1080,28:11676,29:8203,30:1265,31:0,32:8974,33:615,34:6661,35:436,36:14584,37:12501,38:19771,39:12810,40:388,41:13634,42:4964,43:0,44:8414,45:13772,46:0,47:7059,48:8513,49:18258,50:0,51:17368,52:175,53:7868,54:30084,55:5200,56:0,57:0,58:3965,59:8719,60:18153,61:0,62:5017,63:1627,64:6537,65:14559,66:-1,67:578,68:696,69:5056,70:1076,71:8254,72:7595,73:3817,74:10422,75:-1,76:-1,77:5978,78:4010,79:-1,80:19769,81:8200,82:10383,83:7819,84:863,85:397,86:1139,87:0,88:14969,89:-1}
names = load(SC + "/pdm_names.tsv")
allname = {n["codigo_pdm"]: n["nome_pdm"] for n in names}
nmnorm = [norm(n["nome_pdm"]) for n in names]
vn = TfidfVectorizer(analyzer="char_wb", ngram_range=(3,5), min_df=1, sublinear_tf=True)
NM = vn.fit_transform(nmnorm)

def topk(text, k=6):  # [(idx, sim)]
    s = linear_kernel(vn.transform([norm(text)]), NM)[0]
    idx = np.argpartition(s, -k)[-k:]; idx = idx[np.argsort(s[idx])[::-1]]
    return [(int(j), float(s[j])) for j in idx]

ws = {int(r["i"]): r for r in load(SC + "/sc_strat_ws.tsv")}
BANDS = ["A_200+","B_50-199","C_20-49","D_5-19","E_2-4"]
agg = defaultdict(lambda: {"n":0,"trig":0,"rr":0,"rf1":0,"rf3":0,"ru6":0})
for i in sorted(ws):
    g = GOLD[i]
    if g <= 0: continue
    band = ws[i]["band"]; desc = ws[i]["chave"]; a = agg[band]; a["n"] += 1
    gn = norm(allname.get(str(g), ""))
    tf = topk(desc, 6); th = topk(head(desc), 6)
    pool = {}
    for j, s in tf + th: pool[j] = max(pool.get(j, 0), s)   # união full+cabeca, guarda maior sim
    names_full = [names[j]["nome_pdm"] for j, _ in tf]
    # recall
    if norm(names_full[0]) == gn: a["rf1"] += 1
    if any(norm(names[j]["nome_pdm"]) == gn for j, _ in tf[:3]): a["rf3"] += 1
    if any(norm(names[j]["nome_pdm"]) == gn for j in pool): a["ru6"] += 1
    # trigrama baseline = full top-1
    if norm(names_full[0]) == gn: a["trig"] += 1
    # reranker combinado (não-piora): score = 0.6*sim_norm + 0.4*cobertura; default é o próprio top-1 (maior sim)
    best_j, best_score = None, -1
    for j, s in pool.items():
        nm = names[j]["nome_pdm"]; score = 0.6 * s + 0.4 * coverage(desc, nm)
        if score > best_score: best_score, best_j = score, j
    if norm(names[best_j]["nome_pdm"]) == gn: a["rr"] += 1

print(f"{'banda':10s} {'n':>3} | {'TRIG(1)':>7} | {'RERANK':>6} || recall {'@1':>4} {'@3':>4} {'@6U':>5}")
T = defaultdict(int)
for b in BANDS:
    a = agg[b]
    if not a["n"]: continue
    for k in a: T[k] += a[k]
    n = a["n"]
    print(f"{b:10s} {n:3d} | {100*a['trig']/n:6.1f}% | {100*a['rr']/n:5.1f}% || {'':6} {100*a['rf1']/n:4.0f} {100*a['rf3']/n:4.0f} {100*a['ru6']/n:5.0f}")
n = T["n"]
print(f"{'TOTAL':10s} {n:3d} | {100*T['trig']/n:6.1f}% | {100*T['rr']/n:5.1f}% || {'':6} {100*T['rf1']/n:4.0f} {100*T['rf3']/n:4.0f} {100*T['ru6']/n:5.0f}")
print(f"\nLeitura: recall@6U = teto do reranker (PDM certo está no pool). Gap trig(1)→recall@6U = o que o rerank pode recuperar.")
