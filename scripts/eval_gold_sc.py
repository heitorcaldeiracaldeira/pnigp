# Bancada FINAL: mede no gabarito COLOQUIAL de SC (rotulado à mão por LLM, top-60 por volume) o número deployável real.
# Compara trigrama (produção) vs char-SVM (treinado no federal) NA LÍNGUA DE SC. python scripts/eval_gold_sc.py
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

# rótulos de ouro (i -> codigo_pdm; 0 = serviço/placeholder/não-classificável)
GOLD = {0:0,1:13546,2:19789,3:19772,4:19774,5:19036,6:883,7:19773,8:19555,9:19059,10:30040,11:823,12:13768,
13:11903,14:5778,15:14753,16:6250,17:6805,18:4550,19:20,20:931,21:18071,22:0,23:4380,24:8618,25:3868,26:11534,
27:0,28:19784,29:13894,30:722,31:0,32:1501,33:19715,34:948,35:53,36:12820,37:3905,38:862,39:814,40:0,41:4149,
42:18913,43:8753,44:635,45:2639,46:577,47:0,48:0,49:11495,50:1505,51:19754,52:14522,53:11902,54:12746,55:18984,
56:0,57:0,58:863,59:4009}

# treina char-SVM no gabarito federal
gold = [r for r in load(SC + "/gold.tsv") if r.get("codigo_pdm") and r.get("descricao")]
_c = Counter(r["codigo_pdm"] for r in gold); gold = [r for r in gold if _c[r["codigo_pdm"]] >= 2]
def mk(r):
    p=[r["descricao"]]
    if r["detalhada"] and r["detalhada"] not in r["descricao"]: p.append(r["detalhada"])
    if r["unidade"]: p.append("un "+r["unidade"])
    return norm(" ".join(p))
vc = TfidfVectorizer(analyzer="char_wb", ngram_range=(3,5), min_df=2, max_features=60000, sublinear_tf=True)
Xv = vc.fit_transform([mk(r) for r in gold])
clf = SGDClassifier(loss="modified_huber", alpha=1e-5, max_iter=40, tol=1e-3, n_jobs=-1, random_state=42).fit(Xv, np.array([r["codigo_pdm"] for r in gold]))

# trigrama nearest-name (produção) sobre TODOS os nomes de PDM
names = load(SC + "/pdm_names.tsv")
vn = TfidfVectorizer(analyzer="char_wb", ngram_range=(3,5), min_df=1, sublinear_tf=True)
NM = vn.fit_transform([norm(n["nome_pdm"]) for n in names])

sc = {int(r["i"]): r for r in load(SC + "/sc_worksheet.tsv")}
gname = {r["codigo_pdm"]: r["nome_pdm"] for r in gold}
allname = {n["codigo_pdm"]: n["nome_pdm"] for n in names}

lab = [(i, g) for i, g in GOLD.items() if g != 0]      # classificáveis (exclui serviço)
nserv = sum(1 for g in GOLD.values() if g == 0)
chaves = [sc[i]["chave"] for i, _ in lab]
ytrue = [str(g) for _, g in lab]

# predições
pred_trg = [names[j]["codigo_pdm"] for j in linear_kernel(vn.transform([norm(c) for c in chaves]), NM).argmax(1)]
pred_svm = list(clf.predict(vc.transform([norm(c) for c in chaves])))

def acc(pred): return 100.0*sum(1 for p,t in zip(pred,ytrue) if str(p)==str(t))/len(ytrue)
print(f"gabarito coloquial de SC: {len(GOLD)} rotuladas · {len(lab)} classificáveis · {nserv} serviço/placeholder (não-classificável)\n")
print(f"  TRIGRAMA (produção)  : {acc(pred_trg):5.1f}%  acerto no PDM")
print(f"  char-SVM (federal)   : {acc(pred_svm):5.1f}%  acerto no PDM")
print("\n--- onde o trigrama erra (amostra) ---")
for (i,g),c,p in zip(lab, chaves, pred_trg):
    if str(p)!=str(g): print(f"  '{c}' -> {allname.get(str(p),p)}  (certo: {gname.get(str(g)) or allname.get(str(g),g)})")
print("\n--- onde o char-SVM erra (amostra, 12) ---")
n=0
for (i,g),c,p in zip(lab, chaves, pred_svm):
    if str(p)!=str(g) and n<12: print(f"  '{c}' -> {gname.get(str(p),p)}  (certo: {gname.get(str(g)) or allname.get(str(g),g)})"); n+=1
