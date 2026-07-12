# BANCADA DE AVALIAÇÃO — qual a melhor forma de classificar descrição de compra -> CATMAT (PDM).
# Mede no MESMO teste real (gabarito do Painel federal): descrição real do comprador -> PDM verdadeiro.
# Métodos: (A) nearest-PDM-name char-trgm = o que a produção faz hoje; (B) TF-IDF palavra + SVM linear;
# (C) TF-IDF char n-gram + SVM; (D) embeddings MiniLM + regressão logística (semântico).
# Dois trilhos de texto: SÓ DESCRIÇÃO (o que transfere p/ SC, que não tem marca) e DESCRIÇÃO+MARCA (teto).
# python scripts/eval_classificadores.py
import os, csv, re, numpy as np
from collections import Counter
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import SGDClassifier, LogisticRegression
from sklearn.model_selection import train_test_split
from sklearn.metrics.pairwise import linear_kernel

SC = os.environ.get("SCRATCH", r"C:/Users/PC/AppData/Local/Temp/claude/C--Users-PC/2adabc17-0913-484a-9ca7-576bee797555/scratchpad")
csv.field_size_limit(10**7)

def load(path):
    with open(path, encoding="utf-8") as f:
        return list(csv.DictReader(f, delimiter="\t"))

def norm(s):
    return re.sub(r"\s+", " ", (s or "").lower()).strip()

print("carregando gabarito...", flush=True)
rows = load(SC + "/gold.tsv")
rows = [r for r in rows if r.get("codigo_pdm") and r.get("descricao")]  # descarta linhas sem rótulo/texto
_cnt = Counter(r["codigo_pdm"] for r in rows)
rows = [r for r in rows if _cnt[r["codigo_pdm"]] >= 2]  # stratify exige >=2 por classe
# texto: descrição (+detalhada quando acrescenta) e unidade — SEM marca (trilho deployável)
def mk_text(r, with_marca):
    parts = [r["descricao"]]
    if r["detalhada"] and r["detalhada"] not in r["descricao"]:
        parts.append(r["detalhada"])
    if r["unidade"]:
        parts.append("un " + r["unidade"])
    if with_marca and r["marca"]:
        parts.append("marca " + r["marca"])
    return norm(" ".join(parts))

y = np.array([r["codigo_pdm"] for r in rows])
pdm2cls = {r["codigo_pdm"]: r["codigo_classe"] for r in rows}
print(f"  {len(rows):,} pares · {len(set(y)):,} PDMs · {len(set(pdm2cls.values())):,} classes", flush=True)

idx = np.arange(len(rows))
tr, te = train_test_split(idx, test_size=0.2, random_state=42, stratify=y)
ytr, yte = y[tr], y[te]
cls_te = np.array([pdm2cls[p] for p in yte])
print(f"  treino {len(tr):,} · teste {len(te):,}", flush=True)

def score(pred):
    acc_pdm = float((pred == yte).mean())
    acc_cls = float((np.array([pdm2cls.get(p, "?") for p in pred]) == cls_te).mean())
    return acc_pdm, acc_cls

SANITY = ["caneta esferografica azul ponta fina", "acucar cristal", "pneu 175/70 r13",
          "luva de procedimento tamanho m", "papel a4 75g", "dipirona sodica 500mg"]
pdm_name = {r["codigo_pdm"]: r["nome_pdm"] for r in rows}
def show_sanity(name, predict_fn):
    print(f"\n  [{name}] prova concreta:")
    for q, p in zip(SANITY, predict_fn(SANITY)):
        print(f"    '{q}' -> {pdm_name.get(p, p)}")

results = {}
for with_marca in (False, True):
    trilho = "DESC+MARCA (teto)" if with_marca else "SÓ DESCRIÇÃO (deployável em SC)"
    X_txt = [mk_text(r, with_marca) for r in rows]
    Xtr_txt = [X_txt[i] for i in tr]; Xte_txt = [X_txt[i] for i in te]
    print(f"\n===================== TRILHO: {trilho} =====================", flush=True)

    # (B) TF-IDF palavra + SGD hinge
    vw = TfidfVectorizer(ngram_range=(1, 2), min_df=2, max_features=40000, sublinear_tf=True, strip_accents="unicode")
    Xtr = vw.fit_transform(Xtr_txt); Xte = vw.transform(Xte_txt)
    clf = SGDClassifier(loss="modified_huber", alpha=1e-5, max_iter=40, tol=1e-3, n_jobs=-1, random_state=42).fit(Xtr, ytr)
    a = score(clf.predict(Xte)); results[("B_tfidf_word", with_marca)] = a
    print(f"(B) TF-IDF palavra + SVM  : PDM {a[0]*100:5.1f}% | CLASSE {a[1]*100:5.1f}%", flush=True)

    # (C) TF-IDF char n-gram + SGD
    vc = TfidfVectorizer(analyzer="char_wb", ngram_range=(3, 5), min_df=2, max_features=60000, sublinear_tf=True)
    Xtrc = vc.fit_transform(Xtr_txt); Xtec = vc.transform(Xte_txt)
    clfc = SGDClassifier(loss="modified_huber", alpha=1e-5, max_iter=40, tol=1e-3, n_jobs=-1, random_state=42).fit(Xtrc, ytr)
    ac = score(clfc.predict(Xtec)); results[("C_tfidf_char", with_marca)] = ac
    print(f"(C) TF-IDF char 3-5 + SVM  : PDM {ac[0]*100:5.1f}% | CLASSE {ac[1]*100:5.1f}%", flush=True)

    if not with_marca:
        # (A) baseline produção: nearest PDM name (char-trgm) — sem treinar em descrição real
        names = load(SC + "/pdm_names.tsv")
        # restringe aos PDMs do gabarito p/ ser comparável
        present = set(y.tolist())
        names = [n for n in names if n["codigo_pdm"] in present]
        vn = TfidfVectorizer(analyzer="char_wb", ngram_range=(3, 5), min_df=1, sublinear_tf=True)
        NM = vn.fit_transform([norm(n["nome_pdm"]) for n in names])
        Q = vn.transform(Xte_txt)
        sims = linear_kernel(Q, NM)
        best = sims.argmax(axis=1)
        predA = np.array([names[b]["codigo_pdm"] for b in best])
        aA = score(predA); results[("A_nearest_name", False)] = aA
        print(f"(A) nearest-PDM-name (=prod): PDM {aA[0]*100:5.1f}% | CLASSE {aA[1]*100:5.1f}%", flush=True)

        # (D) embeddings MiniLM + LogReg
        try:
            from sentence_transformers import SentenceTransformer
            print("(D) codificando com MiniLM (pode levar alguns min)...", flush=True)
            m = SentenceTransformer("paraphrase-multilingual-MiniLM-L12-v2")
            Etr = m.encode(Xtr_txt, batch_size=256, show_progress_bar=False, normalize_embeddings=True)
            Ete = m.encode(Xte_txt, batch_size=256, show_progress_bar=False, normalize_embeddings=True)
            lr = LogisticRegression(max_iter=200, n_jobs=-1, C=10).fit(Etr, ytr)
            aD = score(lr.predict(Ete)); results[("D_embeddings", False)] = aD
            print(f"(D) embeddings MiniLM+LogReg: PDM {aD[0]*100:5.1f}% | CLASSE {aD[1]*100:5.1f}%", flush=True)
            # abstenção: precisão x cobertura no melhor modelo
            proba = lr.predict_proba(Ete); conf = proba.max(axis=1); predD = lr.classes_[proba.argmax(axis=1)]
            print("    abstenção (embeddings) — precisão × cobertura:", flush=True)
            for th in (0.5, 0.7, 0.8, 0.9, 0.95):
                m_ = conf >= th; cov = m_.mean()
                prec = float((predD[m_] == yte[m_]).mean()) if m_.any() else 0
                print(f"      conf>={th:.2f}: precisão {prec*100:4.1f}% · cobertura {cov*100:4.1f}%", flush=True)
            show_sanity("D embeddings", lambda qs: lr.predict(m.encode([norm(q) for q in qs], normalize_embeddings=True)))
        except Exception as e:
            print(f"(D) embeddings indisponível: {e}", flush=True)
        show_sanity("A nearest-name", lambda qs: np.array([names[b]["codigo_pdm"] for b in vn.transform([norm(q) for q in qs]).dot(NM.T).toarray().argmax(axis=1)]))
        show_sanity("C char-svm", lambda qs: clfc.predict(vc.transform([norm(q) for q in qs])))

print("\n===================== RESUMO (acurácia PDM no teste real) =====================")
for (k, wm), (ap, ac) in sorted(results.items(), key=lambda kv: -kv[1][0]):
    print(f"  {'+marca' if wm else '      '} {k:18s}: PDM {ap*100:5.1f}% | CLASSE {ac*100:5.1f}%")
