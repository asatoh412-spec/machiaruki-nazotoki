import csv,io,openpyxl,warnings,json,math,re;warnings.filterwarnings('ignore')
D='/tmp/claude-0/-home-claude/8c4caf6f-9fd0-5641-9608-85c11827ba8d/scratchpad/'
def load(f):
    f=D+'data/csv/'+f
    if f.endswith('xlsx'):
        ws=openpyxl.load_workbook(f,read_only=True).active; rows=[[str(c) if c is not None else '' for c in r] for r in ws.iter_rows(values_only=True)]
        return [dict(zip(rows[0],r)) for r in rows[1:]]
    b=open(f,'rb').read()
    for e in ['utf-8-sig','cp932']:
        try: return list(csv.DictReader(io.StringIO(b.decode(e))))
        except: pass
def hv(a,b,c,d):
    x=math.radians;return 2*6371000*math.asin(math.sqrt(math.sin(x(c-a)/2)**2+math.cos(x(a))*math.cos(x(c))*math.sin(x(d-b)/2)**2))
SETS={'kuni':'国立市_14.csv','hmura':'東村山市_42.csv','kurume':'東久留米市_19.csv','yamato':'東大和市_36.csv','hachi':'八王子市_21.xlsx'}
OLD={'chofu':'132080_cultural_property.csv','fuchu':'13206_cultural_property.xlsx','kokub':'132144_cultural_property.csv','komae':'132195_cultural_property.csv'}
INV=re.compile('無形|工芸技術|民俗芸能|風俗慣習|保存技術')
HID=re.compile('文書|典籍|書跡|古文書|歴史資料|考古資料|絵画|出土|経|版木|刀|薙刀|鏡|面|扁額|雲版|書状|絵図|日記|帳')
for k,f in SETS.items():
    R=load(f); recs=[]
    for i,r in enumerate(R,1):
        g=lambda *ks:' '.join((r.get(x) or '').strip() for x in ks if (r.get(x) or '').strip() and (r.get(x) or '')!='None')
        cls=g('文化財分類','文化財分類1','文化財分類2','種類')
        if INV.search(cls) or not (r.get('緯度') or '').strip(): continue
        rec={'名称':r['名称'].strip(),'文化財分類':cls,'所在地':g('所在地_連結表記','住所','住所（都道府県）','住所（市区町村）','住所（町名番地）','方書','場所名称'),
             '緯度':r['緯度'],'経度':r['経度'],'説明':g('概要','説明')[:500],'URL':g('URL'),'備考':g('備考','閲覧・見学','利用可能日時特記事項'),'行番号':i}
        rec={a:b for a,b in rec.items() if b!=''}
        recs.append(rec)
    groups=[]
    for rec in recs:
        la,lo=float(rec['緯度']),float(rec['経度'])
        for gp in groups:
            if hv(la,lo,gp['lat'],gp['lon'])<60: gp['records'].append(rec);break
        else: groups.append({'lat':la,'lon':lo,'records':[rec]})
    out=[]
    for gp in groups:
        rs=gp['records']
        if all(HID.search(x['名称']) or '個人' in x.get('所在地','')+x.get('備考','') for x in rs): continue
        out.append({'point_name':rs[0].get('所在地') or rs[0]['名称'],'records':rs})
    out.sort(key=lambda g:(round(float(g['records'][0]['緯度']),2),float(g['records'][0]['経度'])))
    n={'kuni':4,'hmura':3,'kurume':5,'yamato':2,'hachi':6}[k]
    for j in range(n):
        ch=out[j::n] if False else out[j*len(out)//n:(j+1)*len(out)//n]
        json.dump(ch,open(D+f'pack3/in/{k}{j+1}.json','w'),ensure_ascii=False,indent=1)
    print(k,len(R),len(recs),'groups',len(groups),'kept',len(out),'chunks',n)
