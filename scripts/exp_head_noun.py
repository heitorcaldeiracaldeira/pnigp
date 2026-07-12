# EXPERIMENTO p/ SOLUCIONAR a cauda: o produto costuma estar no INÍCIO da descrição. Testa trigrama sobre o
# SUBSTANTIVO-CABEÇA (1as palavras, antes do 1o atributo/número) vs descrição inteira, por banda. python scripts/exp_head_noun.py
import os, csv, re, numpy as np
from collections import defaultdict
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import linear_kernel

SC = os.environ.get("SCRATCH", r"C:/Users/PC/AppData/Local/Temp/claude/C--Users-PC/2adabc17-0913-484a-9ca7-576bee797555/scratchpad")
csv.field_size_limit(10**7)
def load(p):
    with open(p, encoding="utf-8") as f: return list(csv.DictReader(f, delimiter="\t"))
def norm(s): return re.sub(r"\s+", " ", (s or "").lower()).strip()

GOLD = {0:13546,1:19789,2:19772,3:19036,4:19773,5:30040,6:823,7:5778,8:6250,9:4550,10:20,11:18071,12:8618,13:3868,14:1501,15:19715,16:19705,17:12820,18:862,19:1505,20:911,21:0,22:19716,23:1415,24:5648,25:17297,26:30022,27:1080,28:11676,29:8203,30:1265,31:0,32:8974,33:615,34:6661,35:436,36:14584,37:12501,38:19771,39:12810,40:388,41:13634,42:4964,43:0,44:8414,45:13772,46:0,47:7059,48:8513,49:18258,50:0,51:17368,52:175,53:7868,54:30084,55:5200,56:0,57:0,58:3965,59:8719,60:18153,61:0,62:5017,63:1627,64:6537,65:14559,66:-1,67:578,68:696,69:5056,70:1076,71:8254,72:7595,73:3817,74:10422,75:-1,76:-1,77:5978,78:4010,79:-1,80:19769,81:8200,82:10383,83:7819,84:863,85:397,86:1139,87:0,88:14969,89:-1}

def head(ch):  # substantivo-cabeça: corta no 1o separador de atributo, número ou medida; máx 4 palavras
    h = re.split(r"[,;:/()\[\]]| - |º|°|\d", ch)[0].strip()
    toks = h.split()
    return " ".join(toks[:4]) if len(toks) > 4 else h

names = load(SC + "/pdm_names.tsv")
allname = {n["codigo_pdm"]: n["nome_pdm"] for n in names}
vn = TfidfVectorizer(analyzer="char_wb", ngram_range=(3,5), min_df=1, sublinear_tf=True)
NM = vn.fit_transform([norm(n["nome_pdm"]) for n in names])
def predict(txts):
    return [names[j]["codigo_pdm"] for j in linear_kernel(vn.transform([norm(t) for t in txts]), NM).argmax(1)]
def predict_sim(txts):  # retorna (codigo, sim) do melhor nome
    S = linear_kernel(vn.transform([norm(t) for t in txts]), NM); j = S.argmax(1)
    return [(names[j[k]]["codigo_pdm"], float(S[k, j[k]])) for k in range(len(txts))]

ws = {int(r["i"]): r for r in load(SC + "/sc_strat_ws.tsv")}
order = sorted(ws)
chaves = [ws[i]["chave"] for i in order]
heads = [head(c) for c in chaves]
ps_full = predict_sim(chaves); ps_head = predict_sim(heads)
pred_full = [c for c,_ in ps_full]; pred_head = [c for c,_ in ps_head]
# HÍBRIDO: usa o cabeça só se a descrição inteira tem sim baixa E o cabeça tem sim maior
LO = 0.55
pred_hyb = []
for k in range(len(order)):
    cf, sf = ps_full[k]; chd, shd = ps_head[k]
    pred_hyb.append(chd if (sf < LO and shd > sf) else cf)

BANDS = ["A_200+","B_50-199","C_20-49","D_5-19","E_2-4"]
agg = defaultdict(lambda: {"n":0,"full":0,"head":0,"hyb":0})
for k,i in enumerate(order):
    g = GOLD[i]
    if g <= 0: continue
    b = ws[i]["band"]; a = agg[b]; a["n"] += 1
    gn = norm(allname.get(str(g),""))
    if norm(allname.get(str(pred_full[k]),"")) == gn: a["full"] += 1
    if norm(allname.get(str(pred_head[k]),"")) == gn: a["head"] += 1
    if norm(allname.get(str(pred_hyb[k]),"")) == gn: a["hyb"] += 1

print(f"{'banda':10s} {'bens':>4} | {'INTEIRA':>8} | {'CABEÇA':>7} | {'HÍBRIDO':>8}")
tn=tf=th=thy=0
for b in BANDS:
    a=agg[b]
    if not a["n"]: continue
    tn+=a["n"]; tf+=a["full"]; th+=a["head"]; thy+=a["hyb"]
    print(f"{b:10s} {a['n']:4d} | {100*a['full']/a['n']:6.1f}% | {100*a['head']/a['n']:5.1f}% | {100*a['hyb']/a['n']:6.1f}%")
print(f"{'TOTAL':10s} {tn:4d} | {100*tf/tn:6.1f}% | {100*th/tn:5.1f}% | {100*thy/tn:6.1f}%")
print("\ncasos onde o CABEÇA conserta (banda D/E):")
for k,i in enumerate(order):
    g=GOLD[i]
    if g<=0: continue
    gn=norm(allname.get(str(g),""))
    okf=norm(allname.get(str(pred_full[k]),""))==gn; okh=norm(allname.get(str(pred_head[k]),""))==gn
    if okh and not okf and ws[i]["band"] in ("C_20-49","D_5-19","E_2-4"):
        print(f"  '{chaves[k][:45]}' | cabeça='{heads[k]}' -> {allname.get(str(pred_head[k]))}  (inteira dava: {allname.get(str(pred_full[k]))})")
