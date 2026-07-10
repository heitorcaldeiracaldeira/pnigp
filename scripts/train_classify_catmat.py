# Classificador descricao->CATMAT (PDM) — VERSAO 2 (corrige o descasamento treino x uso).
# Contexto: itens_sc NAO tem CATMAT (PNCP/SC nao publica) -> o unico rotulo e o proprio catalogo (catmat_catalogo).
# O catalogo descreve em registro formal e longo; a compra real e curta e coloquial. A v1 media 88,6% no HOLDOUT DO
# CATALOGO e reprovava em consultas reais ("caneta azul" -> cunha odontologica). Tres correcoes:
#   (1) ANCORA NO NOME DO PDM: adiciona, por PDM, exemplos de treino cujo texto e o proprio nome do PDM (curto,
#       mesmo registro da compra real), com peso. E o que aproxima "caneta azul" de "CANETA ESFEROGRAFICA".
#   (2) ABSTENCAO: classifica so acima de um limiar de confianca (margem); abaixo disso -> NAO classificado. Nao grava chute.
#   (3) PORTAO DE SANIDADE: consultas reais viram criterio de ACEITE do modelo; metrica do catalogo e rotulada como
#       intra-catalogo (NAO e acuracia de producao). Baseline defensavel (linha CGU "Alice"): TF-IDF + SVM linear.
# Ponte por arquivos TSV. python scripts/train_classify_catmat.py
import sys, os, csv, re, math, unicodedata, numpy as np
from collections import Counter
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import SGDClassifier
from sklearn.model_selection import train_test_split

# --- LIMPADOR DE UNIDADE/EMBALAGEM (mantem a unidade FORA da classificacao; foca na identidade do produto) ---
STRIP = os.environ.get("STRIP_UNIT", "1") == "1"
_QTD_UN = re.compile(r'\b\d+[.,]?\d*\s*(kg|kilo|g|gr|grama|gramas|mg|ml|mililitro|l|lt|litro|litros|un|und|unid|unidade|unidades|cx|caixa|pct|pacote|fr|frasco|amp|ampola|pc|peca|par|pares|dz|duzia|rl|rolo|fardo|saco|galao|balde|lata|pote|bisnaga|tubo|resma|folha|folhas)\b', re.I)
_EMB = re.compile(r'\b(caixa|pacote|frasco|saco|fardo|pote|lata|galao|balde|bisnaga|tubo|rolo|resma|c/?)\s*(com|c/)?\s*\d+\s*(un|und|unid|unidade|unidades|pe[cç]as?)?\b', re.I)
_UNWORD = re.compile(r'\b(unidade|unidades|und|unid|kilograma|quilograma|kilo|quilo|grama|gramas|miligrama|mililitro|litro|litros|caixa|caixas|pacote|pacotes|frasco|frascos|ampola|ampolas|bisnaga|resma|resmas|galao|duzia|duzias)\b', re.I)
def strip_unit(s):
    s = s.lower()
    if not STRIP:
        return s
    s = _EMB.sub(' ', s); s = _QTD_UN.sub(' ', s); s = _UNWORD.sub(' ', s)
    return s

def unaccent_up(s):
    return "".join(c for c in unicodedata.normalize("NFKD", str(s)) if not unicodedata.combining(c)).upper()

csv.field_size_limit(10**7)
SC = r"C:/Users/PC/AppData/Local/Temp/claude/C--Users-PC/ba9cc77b-9f1b-4cbc-90a2-e9a04839ff68/scratchpad"
NAME_WEIGHT = int(os.environ.get("NAME_WEIGHT", "4"))     # (1) quantas copias do nome do PDM injetar como exemplo
CONF_MIN = float(os.environ.get("CONF_MIN", "0.62"))       # (2) limiar de confianca p/ aceitar a classificacao

def load_tsv(path):
    with open(path, encoding="utf-8") as f:
        return list(csv.DictReader(f, delimiter="\t"))

print("carregando treino (catalogo)...", flush=True)
train = load_tsv(SC + "/catmat_train.tsv")
X_txt = [t["descricao"] for t in train]
y_pdm = [t["codigo_pdm"] for t in train]
pdm_meta = {}
for t in train:
    pdm_meta.setdefault(t["codigo_pdm"], (t["codigo_classe"], t["nome_pdm"]))

# (1) ANCORA NO NOME DO PDM — injeta o nome canonico (curto) como exemplo de treino, com peso NAME_WEIGHT.
#     Esse e o registro das compras reais; sem isso o modelo so conhece a descricao formal do catalogo.
n_anchor = 0
for pdm, (cls, nome) in pdm_meta.items():
    nome = (nome or "").strip()
    if len(nome) < 2:
        continue
    for _ in range(NAME_WEIGHT):
        X_txt.append(nome); y_pdm.append(pdm); n_anchor += 1
y_pdm = np.array(y_pdm)
print(f"  {len(train):,} exemplos do catalogo + {n_anchor:,} ancoras de nome de PDM (peso {NAME_WEIGHT}) = {len(X_txt):,} · {len(set(y_pdm)):,} PDMs", flush=True)

print("vetorizando (TF-IDF 1-2gram)...", flush=True)
vec = TfidfVectorizer(preprocessor=strip_unit, strip_accents="unicode", ngram_range=(1, 2),
                      min_df=2, max_features=20000, sublinear_tf=True, token_pattern=r"(?u)\b\w+\b")
X = vec.fit_transform(X_txt)
print(f"  matriz {X.shape}", flush=True)

# validacao intra-catalogo (holdout 8%). ATENCAO: mede acerto na LINGUAGEM DO CATALOGO, nao em compra real.
Xtr, Xte, ytr, yte = train_test_split(X, y_pdm, test_size=0.08, random_state=42)
print("treinando (validacao intra-catalogo)...", flush=True)
clf_v = SGDClassifier(loss="hinge", alpha=2e-5, max_iter=30, tol=1e-3, n_jobs=-1, random_state=42)
clf_v.fit(Xtr, ytr)
pred_te = clf_v.predict(Xte)
acc_pdm = float((pred_te == yte).mean())
cls_te = np.array([pdm_meta.get(p, ("", ""))[0] for p in pred_te])
cls_true = np.array([pdm_meta.get(p, ("", ""))[0] for p in yte])
acc_cls = float((cls_te == cls_true).mean())
print(f"  acuracia INTRA-CATALOGO (NAO e producao): PDM {acc_pdm*100:.1f}% | CLASSE {acc_cls*100:.1f}%", flush=True)

print("treinando modelo final (todos os dados)...", flush=True)
clf = SGDClassifier(loss="hinge", alpha=2e-5, max_iter=30, tol=1e-3, n_jobs=-1, random_state=42)
clf.fit(X, y_pdm)
classes = clf.classes_

def classify(qs):
    v = vec.transform([strip_unit(q) if False else q for q in qs])  # preprocessor ja aplicado no vectorizer
    d = clf.decision_function(v)
    out = []
    for i in range(d.shape[0]):
        row = d[i]
        top2 = np.argpartition(row, -2)[-2:]
        order = top2[np.argsort(row[top2])]
        best = order[-1]; margin = float(row[order[-1]] - row[order[-2]])
        conf = 1.0 / (1.0 + math.exp(-margin))
        out.append((classes[best], conf))
    return out

# (3) PORTAO DE SANIDADE — consultas reais (registro de compra). O modelo so e ACEITO se acerta a maioria.
SANITY = [
    ("caneta esferografica azul ponta fina", "CANETA"),
    ("acucar cristal", "ACUCAR"),
    ("pneu 175/70 r13", "PNEU"),
    ("luva de procedimento tamanho m", "LUVA"),
    ("papel a4 75g", "PAPEL"),
    ("cimento cp ii", "CIMENTO"),
    ("dipirona sodica 500mg", "DIPIRONA"),
    ("leite em po integral", "LEITE"),
    ("cadeira giratoria", "CADEIRA"),
    ("detergente neutro", "DETERGENTE"),
    ("alcool em gel 70", "ALCOOL"),
    ("parafuso sextavado", "PARAFUSO"),
]
print("\n=== PORTAO DE SANIDADE (consultas reais) ===", flush=True)
res = classify([q for q, _ in SANITY])
passes = 0
for (q, kw), (pdm, conf) in zip(SANITY, res):
    nome = pdm_meta.get(pdm, ("", "?"))[1]
    ok = unaccent_up(kw) in unaccent_up(nome)
    passes += ok
    marca = "OK " if ok else "XX "
    aceito = "" if conf >= CONF_MIN else "  (abstem: conf<%.2f)" % CONF_MIN
    print(f"  {marca}'{q}' -> PDM {pdm} {nome[:38]}  conf={conf:.2f}{aceito}", flush=True)
taxa = passes / len(SANITY)
print(f"  SANIDADE: {passes}/{len(SANITY)} ({taxa*100:.0f}%)", flush=True)
GATE = 0.66
if taxa < GATE:
    print(f"\nFALHA: sanidade {taxa*100:.0f}% < {GATE*100:.0f}% — modelo REJEITADO, sc_pred NAO sera escrito como confiavel.", flush=True)
    with open(SC + "/catmat_acc.txt", "w") as f:
        f.write(f"REJEITADO\t{acc_pdm:.4f}\t{acc_cls:.4f}\t{taxa:.3f}\t{len(train)}\t{len(set(y_pdm))}")
    sys.exit(2)

print("\nclassificando chaves de SC (com abstencao)...", flush=True)
keys = load_tsv(SC + "/sc_keys.tsv")
kt = [k["chave"] for k in keys]
Xk = vec.transform(kt)
out = open(SC + "/sc_pred.tsv", "w", encoding="utf-8", newline="")
w = csv.writer(out, delimiter="\t"); w.writerow(["chave", "codigo_pdm", "codigo_classe", "nome_pdm", "conf", "aceito"])
B = 3000; n_aceito = 0
for i in range(0, Xk.shape[0], B):
    d = clf.decision_function(Xk[i:i+B])
    top2 = np.argpartition(d, -2, axis=1)[:, -2:]
    rows = np.arange(d.shape[0])[:, None]
    tv = d[rows, top2]
    best_local = tv.argmax(axis=1)
    best_idx = top2[rows[:, 0], best_local]
    margin = np.abs(tv[:, 0] - tv[:, 1])
    for j in range(d.shape[0]):
        pdm = classes[best_idx[j]]
        cls, nome = pdm_meta.get(pdm, ("", ""))
        conf = 1.0 / (1.0 + math.exp(-float(margin[j])))
        aceito = 1 if conf >= CONF_MIN else 0
        n_aceito += aceito
        w.writerow([kt[i + j], pdm, cls, nome, f"{conf:.3f}", aceito])
    if (i // B) % 10 == 0:
        print(f"  {min(i+B, Xk.shape[0]):,}/{Xk.shape[0]:,}", flush=True)
out.close()
cobertura = n_aceito / max(len(kt), 1)
print(f"  cobertura aceita (conf>={CONF_MIN}): {n_aceito:,}/{len(kt):,} ({cobertura*100:.0f}%) — o resto fica NAO classificado", flush=True)
with open(SC + "/catmat_acc.txt", "w") as f:
    f.write(f"OK\t{acc_pdm:.4f}\t{acc_cls:.4f}\t{taxa:.3f}\t{cobertura:.3f}\t{len(kt)}\t{len(set(y_pdm))}")
print("OK", flush=True)
