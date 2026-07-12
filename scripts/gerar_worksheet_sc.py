# Passo 2 do gabarito coloquial: para cada descrição de SC (sc_top.tsv), propõe candidatos de PDM
# (char-SVM treinado no gabarito federal + vizinho por nome-trigrama) -> planilha p/ rotulagem (sc_worksheet.tsv).
# python scripts/gerar_worksheet_sc.py
import os, csv, re, numpy as np
from collections import Counter
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import SGDClassifier
from sklearn.metrics.pairwise import linear_kernel

SC = os.environ.get("SCRATCH", r"C:/Users/PC/AppData/Local/Temp/claude/C--Users-PC/2adabc17-0913-484a-9ca7-576bee797555/scratchpad")
csv.field_size_limit(10**7)
def load(p):
    with open(p, encoding="utf-8") as f: return list(csv.DictReader(f, delimiter="\t"))
def norm(s): return re.sub(r"\s+", " ", (s or "").lower()).strip()

gold = load(SC + "/gold.tsv")
gold = [r for r in gold if r.get("codigo_pdm") and r.get("descricao")]
_c = Counter(r["codigo_pdm"] for r in gold); gold = [r for r in gold if _c[r["codigo_pdm"]] >= 2]
def mk(r):
    p = [r["descricao"]]
    if r["detalhada"] and r["detalhada"] not in r["descricao"]: p.append(r["detalhada"])
    if r["unidade"]: p.append("un " + r["unidade"])
    return norm(" ".join(p))
Xtr = [mk(r) for r in gold]; ytr = np.array([r["codigo_pdm"] for r in gold])
name = {r["codigo_pdm"]: r["nome_pdm"] for r in gold}
print(f"treinando char-SVM no gabarito federal ({len(gold):,} pares)...", flush=True)
vc = TfidfVectorizer(analyzer="char_wb", ngram_range=(3, 5), min_df=2, max_features=60000, sublinear_tf=True)
Xv = vc.fit_transform(Xtr)
clf = SGDClassifier(loss="modified_huber", alpha=1e-5, max_iter=40, tol=1e-3, n_jobs=-1, random_state=42).fit(Xv, ytr)

# vizinho por nome de PDM (trigrama) — candidatos complementares
allnames = load(SC + "/pdm_names.tsv")
vn = TfidfVectorizer(analyzer="char_wb", ngram_range=(3, 5), min_df=1, sublinear_tf=True)
NM = vn.fit_transform([norm(n["nome_pdm"]) for n in allnames])

IN = os.environ.get("WS_IN", "sc_top.tsv"); OUTF = os.environ.get("WS_OUT", "sc_worksheet.tsv")
sc = load(SC + "/" + IN)
Q = [norm(r["exemplo"] + " un " + (r.get("unidades") or "").split(",")[0]) for r in sc]
Pv = clf.predict_proba(vc.transform(Q)); classes = clf.classes_
simN = linear_kernel(vn.transform([norm(r["chave"]) for r in sc]), NM)

out = open(SC + "/" + OUTF, "w", encoding="utf-8", newline="")
w = csv.writer(out, delimiter="\t")
w.writerow(["i", "band", "chave", "n", "cand_svm", "cand_trgm"])  # candidatos como "cod:nome | cod:nome"
for i, r in enumerate(sc):
    top = Pv[i].argsort()[-6:][::-1]
    svm = " | ".join(f"{classes[j]}:{name.get(classes[j],'?')}" for j in top)
    tn = simN[i].argsort()[-4:][::-1]
    trg = " | ".join(f"{allnames[j]['codigo_pdm']}:{allnames[j]['nome_pdm']}" for j in tn)
    w.writerow([i, r.get("band", ""), r["chave"], r["n"], svm, trg])
out.close()
print(f"{OUTF}: {len(sc):,} descrições com candidatos (6 SVM + 4 trigrama)", flush=True)
