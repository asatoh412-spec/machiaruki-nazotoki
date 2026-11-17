import json,glob,math,collections,re,sys
D='/tmp/claude-0/-home-claude/8c4caf6f-9fd0-5641-9608-85c11827ba8d/scratchpad/'
P=[]
for f in sorted(sum([glob.glob(D+f'pack3/out/{x}[0-9]*.json') for x in sys.argv[1].split(',')],[])):
    for p in json.load(open(f)): p['_f']=f.split('/')[-1][:-5]; P.append(p)
def hv(a,b,c,d):
    R=6371000;x=math.radians
    return 2*R*math.asin(math.sqrt(math.sin(x(c-a)/2)**2+math.cos(x(a))*math.cos(x(c))*math.sin(x(d-b)/2)**2))
# id fixes
for p in P:
    pass
# dedupe same name within 60m: keep longer long
drop=set()
for i,a in enumerate(P):
    for b in P[i+1:]:
        if (a['name']==b['name'] and hv(a['lat'],a['lon'],b['lat'],b['lon'])<300) or hv(a['lat'],a['lon'],b['lat'],b['lon'])<15:
            k=b if len(b['long'])<=len(a['long']) else a
            drop.add(k['id']); print('dup',a['name'],a['id'],b['id'],'drop',k['id'])
drop|=set()
P=[p for p in P if p['id'] not in drop]
assert len({p['id'] for p in P})==len(P)
# stations
g=json.load(open(D+'data/n02/UTF-8/N02-24_Station.geojson'))
st=collections.defaultdict(lambda:{'lines':set(),'pts':[]})
for f in g['features']:
    c=f['geometry']['coordinates']; lon=sum(x[0] for x in c)/len(c); lat=sum(x[1] for x in c)/len(c)
    if not(35.5<lat<35.9 and 139.0<lon<139.95): continue
    s=st[f['properties']['N02_005']]; s['lines'].add(f['properties']['N02_004']+' '+f['properties']['N02_003']); s['pts'].append((lat,lon))
ST=[{'name':n,'lines':sorted(v['lines']),'lat':round(sum(a for a,b in v['pts'])/len(v['pts']),6),'lon':round(sum(b for a,b in v['pts'])/len(v['pts']),6)} for n,v in st.items()]
for s in ST:
    # far-apart same names: check spread
    v=st[s['name']]['pts']
    if max(hv(s['lat'],s['lon'],a,b) for a,b in v)>800: s['_bad']=True
def area(p):
    la,lo,f=p['lat'],p['lon'],p['_f']
    if f.startswith('tachikawa'): return 'tachikawa-shibasaki' if la<35.705 else 'tachikawa-sunagawa'
    if f.startswith('hino'): return 'hino-shuku' if (lo<139.405 and la>=35.655) else 'hino-takahata'
    if f.startswith('inagi'): return 'inagi'
    if f.startswith('tama'): return 'tama'
META={'tachikawa-shibasaki':('立川駅南・柴崎・錦町（立川市）','立川市'),'tachikawa-sunagawa':('砂川・高松・西砂（立川市）','立川市'),
 'hino-shuku':('日野宿・豊田・神明（日野市）','日野市'),'hino-takahata':('高幡・平山・百草・万願寺（日野市）','日野市'),
 'inagi':('矢野口・大丸・百村・平尾（稲城市）','稲城市'),'tama':('聖蹟桜ヶ丘・関戸・連光寺・落合（多摩市）','多摩市')}
ATT={'立川市':{'text':'立川市の文化財・歴史と文化の散歩道のページ（立川市）をもとに作成','url':'https://www.city.tachikawa.lg.jp/'},
 '日野市':{'text':'日野市の指定文化財一覧（日野市）をもとに作成','url':'https://www.city.hino.lg.jp/bunka/bunka/bunkazai/1003232.html'},
 '稲城市':{'text':'稲城市の文化財のページ（稲城市）をもとに作成','url':'https://www.city.inagi.tokyo.jp/kanko/rekishi/1011408/'},
 '多摩市':{'text':'多摩市の文化財のページ・文化財データ（多摩市）をもとに作成','url':'https://www.city.tama.lg.jp/'}}
groups=collections.defaultdict(list)
for p in P: groups[area(p)].append(p)
warn=[]
for k,ps in groups.items():
    for p in ps:
        t=p['riddle']+p['hints'][0]['text']+p['hints'][1]['text']
        for a in [p['answer']['display']]+p['answer']['accept']:
            if len(a)>=2 and a in t: warn.append((k,p['id'],p['name'],'LEAK',a))
        if len(p['hints'])!=3: warn.append((p['id'],'hints'))
        for h in p.get('onsite_hints') or []:
            if not h.get('text'): warn.append((p['id'],'onsite'))
        if p.get('images'): warn.append((p['id'],'img'))
    for i,a in enumerate(ps):
        for b in ps[i+1:]:
            d=hv(a['lat'],a['lon'],b['lat'],b['lon'])
            if d<50: warn.append((k,'NEAR',a['name'],b['name'],round(d)))
    sts=[]
    for s in ST:
        dm=min(hv(s['lat'],s['lon'],p['lat'],p['lon']) for p in ps)
        R=800
        if dm<R: sts.append(dict((x,y) for x,y in s.items() if x!='_bad')); 
        if dm<R and s.get('_bad'): warn.append((k,'STBAD',s['name']))
    out=[]
    for p in ps:
        q={x:y for x,y in p.items() if x!='_f'}; q['status']='unverified'; q['last_checked']=None; out.append(q)
    lat=[p['lat'] for p in ps]; lon=[p['lon'] for p in ps]
    t,city=META[k]
    pack={'schema':'machiaruki-pack/1','pack_id':k,'version':'2026-11-17.1','title':t,'prefecture':'東京都','city':city,'created':'2026-11-17',
      'rules':{'arrival_radius_m':50,'difficulty':'ふつう'},'stations':sts,
      'attribution':[ATT[city],{'text':'国土数値情報（鉄道データ）（国土交通省）を加工して作成','url':'https://nlftp.mlit.go.jp/ksj/gml/datalist/KsjTmplt-N02-2024.html'}],
      'area':{'bbox':[min(lat)-0.002,min(lon)-0.002,max(lat)+0.002,max(lon)+0.002]},'points':out}
    json.dump(pack,open(D+f'pack3/final/{k}.json','w'),ensure_ascii=False,indent=1)
    print(k,len(ps),[s['name'] for s in sts])
for w in warn: print(w)
