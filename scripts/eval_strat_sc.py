# Curva acurácia × frequência do trigrama no gabarito coloquial de SC estratificado (90 desc, 5 bandas).
# Comparação por NOME do PDM (não penaliza códigos duplicados). g=0 serviço/genérico (não-classificável);
# g=-1 produto real cujo PDM correto NÃO está nos candidatos (trigrama falhou). python scripts/eval_strat_sc.py
import os, csv, re, numpy as np
from collections import Counter, defaultdict
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import SGDClassifier
from sklearn.metrics.pairwise import linear_kernel

SC = os.environ.get("SCRATCH", r"C:/Users/PC/AppData/Local/Temp/claude/C--Users-PC/2adabc17-0913-484a-9ca7-576bee797555/scratchpad")
csv.field_size_limit(10**7)
def load(p):
    with open(p, encoding="utf-8") as f: return list(csv.DictReader(f, delimiter="\t"))
def norm(s): return re.sub(r"\s+", " ", (s or "").lower()).strip()

GOLD = {0:13546,1:19789,2:19772,3:19036,4:19773,5:30040,6:823,7:5778,8:6250,9:4550,10:20,11:18071,12:8618,13:3868,14:1501,15:19715,16:19705,17:12820,
18:862,19:1505,20:911,21:0,22:19716,23:1415,24:5648,25:17297,26:30022,27:1080,28:11676,29:8203,30:1265,31:0,32:8974,33:615,34:6661,35:436,
36:14584,37:12501,38:19771,39:12810,40:388,41:13634,42:4964,43:0,44:8414,45:13772,46:0,47:7059,48:8513,49:18258,50:0,51:17368,52:175,53:7868,
54:30084,55:5200,56:0,57:0,58:3965,59:8719,60:18153,61:0,62:5017,63:1627,64:6537,65:14559,66:-1,67:578,68:696,69:5056,70:1076,71:8254,
72:7595,73:3817,74:10422,75:-1,76:-1,77:5978,78:4010,79:-1,80:19769,81:8200,82:10383,83:7819,84:863,85:397,86:1139,87:0,88:14969,89:-1}

names = load(SC + "/pdm_names.tsv")
allname = {n["codigo_pdm"]: n["nome_pdm"] for n in names}
vn = TfidfVectorizer(analyzer="char_wb", ngram_range=(3,5), min_df=1, sublinear_tf=True)
NM = vn.fit_transform([norm(n["nome_pdm"]) for n in names])

# char-SVM federal (comparação)
gold = [r for r in load(SC+"/gold.tsv") if r.get("codigo_pdm") and r.get("descricao")]
_c=Counter(r["codigo_pdm"] for r in gold); gold=[r for r in gold if _c[r["codigo_pdm"]]>=2]
def mk(r):
    p=[r["descricao"]]
    if r["detalhada"] and r["detalhada"] not in r["descricao"]: p.append(r["detalhada"])
    if r["unidade"]: p.append("un "+r["unidade"])
    return norm(" ".join(p))
vc=TfidfVectorizer(analyzer="char_wb",ngram_range=(3,5),min_df=2,max_features=60000,sublinear_tf=True)
clf=SGDClassifier(loss="modified_huber",alpha=1e-5,max_iter=40,tol=1e-3,n_jobs=-1,random_state=42).fit(vc.fit_transform([mk(r) for r in gold]),np.array([r["codigo_pdm"] for r in gold]))
gname={r["codigo_pdm"]:r["nome_pdm"] for r in gold}
def nameof(code): return allname.get(str(code)) or gname.get(str(code))

ws = {int(r["i"]): r for r in load(SC+"/sc_strat_ws.tsv")}
chaves=[ws[i]["chave"] for i in sorted(ws)]
trig=[names[j]["codigo_pdm"] for j in linear_kernel(vn.transform([norm(c) for c in chaves]), NM).argmax(1)]
svm=list(clf.predict(vc.transform([norm(c) for c in chaves])))

BANDS=["A_200+","B_50-199","C_20-49","D_5-19","E_2-4"]
agg=defaultdict(lambda:{"goods":0,"trig_ok":0,"svm_ok":0,"serv":0,"hard":0})
for k,i in enumerate(sorted(ws)):
    band=ws[i]["band"]; g=GOLD[i]; a=agg[band]
    if g==0: a["serv"]+=1; continue
    a["goods"]+=1
    if g==-1: a["hard"]+=1; continue  # trigrama definitivamente erra (correto não pinado)
    gn=norm(nameof(g) or "")
    if norm(nameof(trig[k]) or "")==gn: a["trig_ok"]+=1
    if norm(nameof(svm[k]) or "")==gn: a["svm_ok"]+=1

print(f"{'banda':10s} {'bens':>5} {'serviço/gen':>11} | {'TRIGRAMA':>9} | {'char-SVM':>9}   (bens=classificáveis; hard=produto real fora dos candidatos)")
tg=ts=tgood=0
for b in BANDS:
    a=agg[b]; good=a["goods"];
    if not good: continue
    tokp=100*a["trig_ok"]/good; sokp=100*a["svm_ok"]/good
    tg+=a["trig_ok"]; ts+=a["svm_ok"]; tgood+=good
    print(f"{b:10s} {good:5d} {a['serv']:11d} | {tokp:7.1f}% | {sokp:7.1f}%   (hard={a['hard']})")
print(f"{'TOTAL':10s} {tgood:5d} {'':11} | {100*tg/tgood:7.1f}% | {100*ts/tgood:7.1f}%")
