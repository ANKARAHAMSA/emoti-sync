import json, sys
from collections import Counter, defaultdict
EMO=['happy','neutral','surprised','sad','angry','fearful','disgusted']

def analyze(path, name):
    r=json.load(open(path))
    n=len(r); det=[x for x in r if x['detected']]
    correct=[x for x in det if x['pred']==x['label']]
    out={'name':name,'n':n,'detected':len(det),'det_rate':len(det)/n,
         'acc_detected':len(correct)/max(1,len(det)),'acc_strict':len(correct)/n}
    cm={a:{b:0 for b in EMO} for a in EMO}
    for x in det: cm[x['label']][x['pred']]+=1
    per={}
    for e in EMO:
        tp=cm[e][e]; fn=sum(cm[e].values())-tp; fp=sum(cm[o][e] for o in EMO if o!=e)
        total=sum(1 for x in r if x['label']==e); d=sum(1 for x in det if x['label']==e)
        p=tp/(tp+fp) if tp+fp else 0.0; rc=tp/(tp+fn) if tp+fn else 0.0
        f1=2*p*rc/(p+rc) if p+rc else 0.0
        per[e]={'support':total,'detected':d,'precision':p,'recall':rc,'f1':f1,'recall_strict':tp/total if total else 0}
    out['per_class']=per; out['cm']=cm
    out['macro_f1']=sum(per[e]['f1'] for e in EMO)/len(EMO)
    # by source
    src=defaultdict(lambda:[0,0,0])
    for x in r:
        k='clean_studio' if x['file'].startswith('facial-expressions_') else 'celebrity_photos'
        src[k][0]+=1
        if x['detected']: src[k][1]+=1
        if x['detected'] and x['pred']==x['label']: src[k][2]+=1
    out['by_source']={k:{'n':v[0],'det_rate':v[1]/v[0],'acc_detected':v[2]/max(1,v[1]),'acc_strict':v[2]/v[0]} for k,v in src.items()}
    # confidence calibration: top score vs correctness
    bins=[(0,.5),(.5,.7),(.7,.9),(.9,1.01)]
    cal=[]
    for lo,hi in bins:
        sel=[x for x in det if lo<=max(x['scores'].values())<hi]
        cal.append({'range':f'{lo:.1f}-{min(hi,1):.1f}','n':len(sel),'acc':(sum(1 for x in sel if x['pred']==x['label'])/len(sel)) if sel else None})
    out['calibration']=cal
    out['pred_dist']=dict(Counter(x['pred'] for x in det))
    return out

if __name__=='__main__':
    paths=sys.argv[1:] or ['results_asis.json','results_pad.json']
    res={}
    for path in paths:
        name=path.replace('results_','').replace('.json','')
        res[name]=analyze(path,name)
    json.dump(res,open('metrics.json','w'),indent=1)
    for name,o in res.items():
        print(f"\n===== {name} =====")
        print(f"images={o['n']} detected={o['detected']} ({o['det_rate']*100:.1f}%)  acc|detected={o['acc_detected']*100:.1f}%  acc(strict, misses wrong)={o['acc_strict']*100:.1f}%  macroF1={o['macro_f1']:.3f}")
        print('by source:',{k:{kk:round(vv,3) for kk,vv in v.items()} for k,v in o['by_source'].items()})
        print(f"{'class':10} {'n':>4} {'det':>4} {'prec':>6} {'rec':>6} {'f1':>6}")
        for e in EMO:
            p=o['per_class'][e]; print(f"{e:10} {p['support']:4d} {p['detected']:4d} {p['precision']*100:6.1f} {p['recall']*100:6.1f} {p['f1']*100:6.1f}")
        print('confusion (rows=true, cols=pred):'); print(' '*10+' '.join(f'{c[:5]:>6}' for c in EMO))
        for a in EMO: print(f'{a:10}'+' '.join(f"{o['cm'][a][b]:6d}" for b in EMO))
        print('calibration:',o['calibration'])
        print('pred dist:',o['pred_dist'])
