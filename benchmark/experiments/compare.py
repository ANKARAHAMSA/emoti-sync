import json, sys, itertools
EMO=['happy','neutral','surprised','sad','angry','fearful','disgusted']
POL={'happy':'positive','neutral':'neutral','surprised':'surprised','sad':'negative','angry':'negative','fearful':'negative','disgusted':'negative'}
def load(path):
    r=json.load(open(path)); return [x for x in r if x['detected'] and 'hs' in x and x['hs']]
def argmax(d): return max(EMO,key=lambda e:d[e])
def avg(*ds,w=None):
    w=w or [1]*len(ds); return {e:sum(wi*d[e] for wi,d in zip(w,ds))/sum(w) for e in EMO}
def metrics(rows,fn):
    n=len(rows); ok=0; cm={a:{b:0 for b in EMO} for a in EMO}
    for x in rows:
        p=argmax(fn(x)); cm[x['label']][p]+=1; ok+= (p==x['label'])
    f1s=[];rec={}
    for e in EMO:
        tp=cm[e][e]; fn_=sum(cm[e].values())-tp; fp=sum(cm[o][e] for o in EMO if o!=e)
        pr=tp/(tp+fp) if tp+fp else 0; rc=tp/(tp+fn_) if tp+fn_ else 0
        f1s.append(2*pr*rc/(pr+rc) if pr+rc else 0); rec[e]=rc
    # polarity
    sub=[x for x in rows if x['label']!='surprised']
    P=lambda e:'neutral' if e=='surprised' else POL[e]
    pol=sum(1 for x in sub if P(argmax(fn(x)))==POL[x['label']])/len(sub)
    # balanced accuracy = mean recall over classes with >=20 support (excl fear) to reduce class-size effects
    return dict(acc=ok/n,macro_f1=sum(f1s)/7,pol=pol,rec=rec,cm=cm)
def show(name,m):
    r=m['rec']
    print(f"{name:34} acc {m['acc']*100:5.1f}  mF1 {m['macro_f1']:.3f}  pol3 {m['pol']*100:5.1f} | recall "+' '.join(f"{e[:3]} {r[e]*100:3.0f}" for e in EMO))
for path in sys.argv[1:]:
    rows=load(path); print(f"\n=== {path}  (faces detected & scored: {len(rows)}) ===")
    show('face-api (baseline)',metrics(rows,lambda x:x['fa']))
    cfgs=sorted(rows[0]['hs'].keys())
    for c in cfgs:
        show(c.replace('enet_','').replace('_8',''),metrics(rows,lambda x,c=c:x['hs'][c]['p7']))
    for c in ['enet_b0_8_best_vgaf@0.2','enet_b0_8_best_vgaf@0','enet_b2_8@0']:
        if c in cfgs:
            show('ENS fa+'+c.replace('enet_','').replace('_8',''),metrics(rows,lambda x,c=c:avg(x['fa'],x['hs'][c]['p7'])))
    a,b='enet_b0_8_best_vgaf@0.2','enet_b0_8_best_afew@0.2'
    if a in cfgs and b in cfgs:
        show('ENS vgaf+afew @0.2',metrics(rows,lambda x:avg(x['hs'][a]['p7'],x['hs'][b]['p7'])))
        show('ENS vgaf+afew+fa @0.2',metrics(rows,lambda x:avg(x['hs'][a]['p7'],x['hs'][b]['p7'],x['fa'])))
