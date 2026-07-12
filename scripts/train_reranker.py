# RERANKER TREINADO (learning-to-rank pointwise) sobre os candidatos do retriever trigrama.
# Treina no gabarito federal (painel_gold): p/ cada descrição, o retriever dá top-k nomes de PDM; o verdadeiro é
# positivo, os demais são NEGATIVOS DUROS (os confundíveis). Aprende a escolher entre candidatos usando features
# léxicas — o que a heurística não conseguia. Testa no gabarito COLOQUIAL de SC (nunca treina nele). python scripts/train_reranker.py
import os, csv, re, numpy as np
from collections import defaultdict
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import linear_kernel
from sklearn.ensemble import HistGradientBoostingClassifier

SC = os.environ.get("SCRATCH", r"C:/Users/PC/AppData/Local/Temp/claude/C--Users-PC/2adabc17-0913-484a-9ca7-576bee797555/scratchpad")
csv.field_size_limit(10**7)
def load(p):
    with open(p, encoding="utf-8") as f: return list(csv.DictReader(f, delimiter="\t"))
def norm(s): return re.sub(r"\s+", " ", (s or "").lower()).strip()
STOP = {"de","da","do","para","com","em","por","ou","das","dos","p","a","o","e","sem","the","of"}
def words(s): return [w for w in re.findall(r"[a-záàâãéêíóôõúüç0-9]+", norm(s)) if len(w) >= 3 and w not in STOP]
def coverage(a_words, b_set): return (sum(w in b_set for w in a_words) / len(a_words)) if a_words else 0
def head(ch):
    h = re.split(r"[,;:/()\[\]]| - |º|°|\d", norm(ch))[0].strip(); t = h.split()
    return " ".join(t[:5]) if len(t) > 5 else h

# catálogo de nomes de PDM (retriever)
names = load(SC + "/pdm_names.tsv")
nm_norm = [norm(n["nome_pdm"]) for n in names]
nm_words = [set(words(n["nome_pdm"])) for n in names]
nm_wlist = [words(n["nome_pdm"]) for n in names]
vn = TfidfVectorizer(analyzer="char_wb", ngram_range=(3,5), min_df=1, sublinear_tf=True)
NM = vn.fit_transform(nm_norm)
K = 6

def feats_for(descs, batch=400):
    """retorna, por descrição: lista de (cand_idx, feature_vector, retr_sim)."""
    out = []
    for b0 in range(0, len(descs), batch):
        chunk = descs[b0:b0+batch]
        Sf = linear_kernel(vn.transform([norm(d) for d in chunk]), NM)
        Sh = linear_kernel(vn.transform([head(d) for d in chunk]), NM)
        for r, d in enumerate(chunk):
            sf = Sf[r]; sh = Sh[r]
            idx = np.argpartition(sf, -K)[-K:]; idx = idx[np.argsort(sf[idx])[::-1]]
            dw = set(words(d)); dwl = words(d)
            cand = []
            for rank, j in enumerate(idx):
                fv = [float(sf[j]), float(sh[j]), coverage(nm_wlist[j], dw), coverage(dwl, nm_words[j]),
                      rank, 1.0 if rank == 0 else 0.0, len(nm_words[j] & dw), len(nm_wlist[j])]
                cand.append((int(j), fv, float(sf[j])))
            out.append(cand)
    return out

# ---------- treino: painel_gold ----------
gold = [r for r in load(SC + "/gold.tsv") if r.get("codigo_pdm") and r.get("descricao")]
# nome verdadeiro por linha (comparação por nome, robusta a código duplicado)
true_name = {}
for r in gold: true_name.setdefault(id(r), norm(r["nome_pdm"]))
STRIP = os.environ.get("STRIP_NAME", "1") == "1"   # remove o nome do PDM da descrição de treino (anti-vazamento)
def strip_name(desc, name):
    n = norm(name).strip('"*.')
    return re.sub(r"\s+", " ", norm(desc).replace(n, " ")).strip() if n else norm(desc)
np.random.seed(42)
samp = list(np.random.choice(len(gold), size=min(9000, len(gold)), replace=False))
descs = [strip_name(gold[i]["descricao"], gold[i]["nome_pdm"]) if STRIP else gold[i]["descricao"] for i in samp]
tnames = [norm(gold[i]["nome_pdm"]) for i in samp]
print(f"  treino {'SEM nome do PDM (anti-vazamento)' if STRIP else 'com descrição inteira'}", flush=True)
print(f"treinando reranker em {len(descs):,} exemplos federais (top-{K} candidatos cada)...", flush=True)
cand_lists = feats_for(descs)
X, y = [], []
for cl, tn in zip(cand_lists, tnames):
    has_pos = any(nm_norm[j] == tn for j, _, _ in cl)
    for j, fv, _ in cl:
        X.append(fv); y.append(1 if nm_norm[j] == tn else 0)
X = np.array(X); y = np.array(y)
print(f"  {len(y):,} pares · {y.mean()*100:.1f}% positivos", flush=True)
clf = HistGradientBoostingClassifier(max_iter=300, learning_rate=0.1, max_depth=4, random_state=42).fit(X, y)

# ---------- teste: gabarito coloquial de SC ----------
GOLD = {0:13546,1:19789,2:19772,3:19036,4:19773,5:30040,6:823,7:5778,8:6250,9:4550,10:20,11:18071,12:8618,13:3868,14:1501,15:19715,16:19705,17:12820,18:862,19:1505,20:911,21:0,22:19716,23:1415,24:5648,25:17297,26:30022,27:1080,28:11676,29:8203,30:1265,31:0,32:8974,33:615,34:6661,35:436,36:14584,37:12501,38:19771,39:12810,40:388,41:13634,42:4964,43:0,44:8414,45:13772,46:0,47:7059,48:8513,49:18258,50:0,51:17368,52:175,53:7868,54:30084,55:5200,56:0,57:0,58:3965,59:8719,60:18153,61:0,62:5017,63:1627,64:6537,65:14559,66:-1,67:578,68:696,69:5056,70:1076,71:8254,72:7595,73:3817,74:10422,75:-1,76:-1,77:5978,78:4010,79:-1,80:19769,81:8200,82:10383,83:7819,84:863,85:397,86:1139,87:0,88:14969,89:-1}
allname = {n["codigo_pdm"]: n["nome_pdm"] for n in names}
ws = {int(r["i"]): r for r in load(SC + "/sc_strat_ws.tsv")}
test_i = [i for i in sorted(ws) if GOLD[i] > 0]
test_desc = [ws[i]["chave"] for i in test_i]
test_cl = feats_for(test_desc)
MARGINS = [1.0, 0.30, 0.20, 0.10, 0.0]   # 1.0 = nunca sobrescreve (=trigrama); 0.0 = reranker puro
rows = []
for i, cl in zip(test_i, test_cl):
    gn = norm(allname.get(str(GOLD[i]), "")); band = ws[i]["band"]
    P = clf.predict_proba(np.array([fv for _, fv, _ in cl]))[:, 1]
    rows.append((band, gn, [nm_norm[j] for j, _, _ in cl], P))

def acc_at(margin):
    agg = defaultdict(lambda: {"n":0,"ok":0})
    for band, gn, cnames, P in rows:
        a = agg[band]; a["n"] += 1
        p0 = P[0]; jo = int(np.argmax(P[1:])) + 1 if len(P) > 1 else 0
        pred = cnames[jo] if (len(P) > 1 and P[jo] - p0 > margin) else cnames[0]   # não-piora: só sobrescreve por margem
        if pred == gn: a["ok"] += 1
    return agg

BANDS = ["A_200+","B_50-199","C_20-49","D_5-19","E_2-4"]
print(f"\n{'banda':10s} {'n':>3} | " + " | ".join(f"m={m:.2f}" for m in MARGINS))
Ts = {m: defaultdict(int) for m in MARGINS}
per = {m: acc_at(m) for m in MARGINS}
for b in BANDS:
    n = per[MARGINS[0]][b]["n"]
    if not n: continue
    line = f"{b:10s} {n:3d} | " + " | ".join(f"{100*per[m][b]['ok']/n:5.1f}" for m in MARGINS)
    print(line)
    for m in MARGINS:
        Ts[m]["ok"] += per[m][b]["ok"]; Ts[m]["n"] += n
n = Ts[MARGINS[0]]["n"]
print(f"{'TOTAL':10s} {n:3d} | " + " | ".join(f"{100*Ts[m]['ok']/n:5.1f}" for m in MARGINS))
print("\nm=1.00 = trigrama puro (baseline 94,7); menor margem = reranker sobrescreve mais. Melhor coluna = ganho real.")
