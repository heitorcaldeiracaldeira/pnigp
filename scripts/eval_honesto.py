# BANCADA HONESTA — corrige o vazamento de rótulo do gabarito federal (a descrição embute o nome do PDM).
# Particiona o TESTE em: (ECOA) a descrição contém o nome canônico do PDM = fácil/vazado; (NÃO ECOA) não contém =
# coloquial, o que de fato representa a compra de SC. A acurácia no grupo NÃO ECOA é o número deployável real.
# python scripts/eval_honesto.py
import os, csv, re, numpy as np
from collections import Counter
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import SGDClassifier, LogisticRegression
from sklearn.model_selection import train_test_split
from sklearn.metrics.pairwise import linear_kernel

SC = os.environ.get("SCRATCH", r"C:/Users/PC/AppData/Local/Temp/claude/C--Users-PC/2adabc17-0913-484a-9ca7-576bee797555/scratchpad")
csv.field_size_limit(10**7)
def load(p):
    with open(p, encoding="utf-8") as f: return list(csv.DictReader(f, delimiter="\t"))
def norm(s): return re.sub(r"\s+", " ", (s or "").lower()).strip()

rows = load(SC + "/gold.tsv")
rows = [r for r in rows if r.get("codigo_pdm") and r.get("descricao")]
_c = Counter(r["codigo_pdm"] for r in rows); rows = [r for r in rows if _c[r["codigo_pdm"]] >= 2]
STRIP_NAME = os.environ.get("STRIP_NAME", "1") == "1"  # remove o nome canônico do PDM (anti-vazamento)
def mk_text(r):
    parts = [r["descricao"]]
    if r["detalhada"] and r["detalhada"] not in r["descricao"]: parts.append(r["detalhada"])
    if r["unidade"]: parts.append("un " + r["unidade"])
    t = norm(" ".join(parts))
    if STRIP_NAME:
        n = norm(r["nome_pdm"]).strip('"*')
        if n: t = re.sub(r"\s+", " ", t.replace(n, " ")).strip()  # tira o nome do PDM embutido; sobra o coloquial/atributo
    return t
X_txt = [mk_text(r) for r in rows]
y = np.array([r["codigo_pdm"] for r in rows])
pdm2cls = {r["codigo_pdm"]: r["codigo_classe"] for r in rows}
# ECOA = o nome canônico do PDM aparece na descrição (vazamento)
echo = np.array([norm(r["nome_pdm"]) in X_txt[i] for i, r in enumerate(rows)])
print(f"{len(rows):,} pares · {len(set(y)):,} PDMs · ECOA o nome do PDM: {echo.mean()*100:.1f}% (vazado) · NÃO ECOA: {(1-echo.mean())*100:.1f}% (honesto)", flush=True)

idx = np.arange(len(rows))
tr, te = train_test_split(idx, test_size=0.25, random_state=42, stratify=y)
ytr, yte = y[tr], y[te]
cls_te = np.array([pdm2cls[p] for p in yte])
echo_te = echo[te]
Xtr_txt = [X_txt[i] for i in tr]; Xte_txt = [X_txt[i] for i in te]
print(f"treino {len(tr):,} · teste {len(te):,} (ecoa {echo_te.sum():,} · não-ecoa {(~echo_te).sum():,})\n", flush=True)

def report(name, pred):
    pcls = np.array([pdm2cls.get(p, "?") for p in pred])
    def acc(mask):
        return (float((pred[mask] == yte[mask]).mean())*100 if mask.any() else 0,
                float((pcls[mask] == cls_te[mask]).mean())*100 if mask.any() else 0)
    o, e, h = acc(np.ones(len(yte), bool)), acc(echo_te), acc(~echo_te)
    print(f"{name:26s} | PDM: geral {o[0]:5.1f}  ecoa {e[0]:5.1f}  NÃO-ECOA {h[0]:5.1f}  || CLASSE não-ecoa {h[1]:5.1f}", flush=True)
    return h[0]

# (A) nearest PDM name (produção)
names = [n for n in load(SC + "/pdm_names.tsv") if n["codigo_pdm"] in set(y.tolist())]
vn = TfidfVectorizer(analyzer="char_wb", ngram_range=(3,5), min_df=1, sublinear_tf=True)
NM = vn.fit_transform([norm(n["nome_pdm"]) for n in names])
predA = np.array([names[b]["codigo_pdm"] for b in linear_kernel(vn.transform(Xte_txt), NM).argmax(1)])
report("(A) nearest-name (prod)", predA)

# (B) TF-IDF palavra + SVM
vw = TfidfVectorizer(ngram_range=(1,2), min_df=2, max_features=40000, sublinear_tf=True, strip_accents="unicode")
clfB = SGDClassifier(loss="modified_huber", alpha=1e-5, max_iter=40, tol=1e-3, n_jobs=-1, random_state=42).fit(vw.fit_transform(Xtr_txt), ytr)
report("(B) TF-IDF palavra+SVM", clfB.predict(vw.transform(Xte_txt)))

# (C) TF-IDF char + SVM
vc = TfidfVectorizer(analyzer="char_wb", ngram_range=(3,5), min_df=2, max_features=60000, sublinear_tf=True)
clfC = SGDClassifier(loss="modified_huber", alpha=1e-5, max_iter=40, tol=1e-3, n_jobs=-1, random_state=42).fit(vc.fit_transform(Xtr_txt), ytr)
report("(C) TF-IDF char+SVM", clfC.predict(vc.transform(Xte_txt)))

# (D) embeddings MiniLM + LogReg
from sentence_transformers import SentenceTransformer
print("(D) codificando MiniLM...", flush=True)
m = SentenceTransformer("paraphrase-multilingual-MiniLM-L12-v2")
Etr = m.encode(Xtr_txt, batch_size=256, normalize_embeddings=True)
Ete = m.encode(Xte_txt, batch_size=256, normalize_embeddings=True)
lr = LogisticRegression(max_iter=200, n_jobs=-1, C=10).fit(Etr, ytr)
proba = lr.predict_proba(Ete); predD = lr.classes_[proba.argmax(1)]; conf = proba.max(1)
report("(D) embeddings+LogReg", predD)

# abstenção NO GRUPO HONESTO (não-ecoa) — precisão x cobertura reais
print("\nabstenção (embeddings, SÓ no grupo NÃO-ECOA = honesto):", flush=True)
hy, hp, hc = yte[~echo_te], predD[~echo_te], conf[~echo_te]
for th in (0.3,0.5,0.7,0.8,0.9):
    m_ = hc >= th; cov = m_.mean()
    prec = float((hp[m_] == hy[m_]).mean())*100 if m_.any() else 0
    print(f"  conf>={th:.2f}: precisão {prec:5.1f}% · cobertura {cov*100:5.1f}%", flush=True)
