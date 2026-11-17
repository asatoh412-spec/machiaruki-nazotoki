import json,re,os,time,urllib.request,urllib.parse,html
H=os.path.expanduser('~/img7'); T0=time.time(); LIM=float(os.environ.get('LIM','150'))
UA={'User-Agent':'machiaruki-personal/0.9 (walking quiz app)'}
todo=json.load(open(H+'/todo2.json'))
WIKI=json.load(open(H+'/res.json')) if os.path.exists(H+'/res.json') else {}
MODE=os.environ.get('MODE','commons')
R=H+('/res3.json' if MODE=='commons' else '/res3_ov.json'); res=json.load(open(R)) if os.path.exists(R) else {}
OTHER=json.load(open(H+'/res3.json')) if MODE!='commons' and os.path.exists(H+'/res3.json') else {}
st={'ov':0,'cm':0,'429':0}
def get(u):
    for i in range(3):
        try:
            with urllib.request.urlopen(urllib.request.Request(u,headers=UA),timeout=20) as r: return json.load(r)
        except urllib.error.HTTPError as e:
            if e.code==429: st['429']+=1; time.sleep(4*(i+1)); continue
            return None
        except Exception: time.sleep(2)
    return None
def clean(s): return html.unescape(re.sub('<[^>]+>','',s or '')).strip()
ROM={'荒川区':'Arakawa','板橋区':'Itabashi','武蔵野市':'Musashino','調布市':'Chofu','府中市':'Fuchu','国分寺市':'Kokubunji','狛江市':'Komae','葛飾区':'Katsushika','小金井市':'Koganei','西東京市':'Nishitokyo','新宿区':'Shinjuku','豊島区':'Toshima','練馬区':'Nerima','中野区':'Nakano','杉並区':'Suginami','千代田区':'Chiyoda','台東区':'Taito','港区':'Minato','中央区':'Chuo','墨田区':'Sumida','品川区':'Shinagawa','江東区':'Koto','国立市':'Kunitachi','東村山市':'Higashimurayama','東大和市':'Higashiyamato','東久留米市':'Higashikurume','八王子市':'Hachioji','渋谷区':'Shibuya','文京区':'Bunkyo','北区':'Kita','目黒区':'Meguro','世田谷区':'Setagaya','大田区':'Ota','三鷹市':'Mitaka','小平市':'Kodaira','足立区':'Adachi','江戸川区':'Edogawa','立川市':'Tachikawa','日野市':'Hino','稲城市':'Inagi','多摩市':'Tama'}
def ok_text(t,txt):
    n=t['names']
    if not any(x in txt for x in n): return False
    if re.search(r'分室|分館',txt) and not any(re.search(r'分室|分館',x) for x in n): return False
    if re.search(r'Station|駅',txt) and not any('駅' in x for x in n): return False
    if t['city'] not in txt and t['city'][:-1] not in txt and ROM.get(t['city'],'@@') not in txt.replace('ō','o').replace('ū','u'): return False
    if t['generic']:
        town=re.sub(r'^東京都','',t['addr'] or '')
        town=re.sub(r'[0-9０-９\-－丁目番地号].*$','',town)
        keys=[t['city'],t['city'][:-1],ROM.get(t['city'],'@@')]+([town] if len(town)>=2 else [])
        if not any(k and k in txt for k in keys): return False
    return True
OKL=re.compile(r'^(CC BY(-SA)?( \d\.\d)?|CC0|Public domain|PD.*|CC-BY.*)',re.I)
def commons(t):
    q='"%s"'%t['names'][0]
    u='https://commons.wikimedia.org/w/api.php?'+urllib.parse.urlencode({'action':'query','generator':'search','gsrsearch':q,'gsrnamespace':6,'gsrlimit':15,'prop':'imageinfo','iiprop':'url|extmetadata|mime','iiextmetadatafilter':'LicenseShortName|Artist|LicenseUrl|ImageDescription|ObjectName|Categories','format':'json'})
    d=get(u)
    for pg in sorted((d or {}).get('query',{}).get('pages',{}).values(),key=lambda p:p.get('index',99)):
        ii=(pg.get('imageinfo') or [{}])[0]; m=ii.get('extmetadata',{})
        if not ii.get('mime','').startswith('image/') or ii.get('mime')=='image/svg+xml': continue
        if re.search(r'NDL|\.pdf|map|地図|Map',pg['title']): continue
        lic=clean(m.get('LicenseShortName',{}).get('value',''))
        if not OKL.match(lic): continue
        txt=' '.join([pg['title'],clean(m.get('ImageDescription',{}).get('value','')),clean(m.get('ObjectName',{}).get('value','')),clean(m.get('Categories',{}).get('value',''))])
        if ok_text(t,txt):
            return {'src':'commons-search','file_page':ii['descriptionurl'],'image_url':ii['url'],'author':clean(m.get('Artist',{}).get('value',''))[:120] or '不明','license':lic,'license_url':clean(m.get('LicenseUrl',{}).get('value','')) or None,'_t':pg['title']}
    return None
def openverse(t):
    u='https://api.openverse.org/v1/images/?'+urllib.parse.urlencode({'q':t['names'][0],'license_type':'commercial,modification','page_size':20,'mature':'false'})
    d=get(u)
    for r in (d or {}).get('results',[]):
        txt=' '.join([r.get('title') or '']+[x.get('name','') for x in r.get('tags') or []])
        if r.get('filetype')=='svg': continue
        if ok_text(t,txt):
            lic={'by':'CC BY','by-sa':'CC BY-SA','cc0':'CC0','pdm':'Public domain'}.get(r['license'])
            if not lic: continue
            if r['license'] in('by','by-sa'): lic+=' '+(r.get('license_version') or '')
            return {'src':'openverse:'+r.get('source',''),'file_page':r['foreign_landing_url'],'image_url':r['url'],'author':(r.get('creator') or '不明')[:120],'license':lic.strip(),'license_url':r.get('license_url'),'_t':r.get('title')}
    return None
MODE=os.environ.get('MODE','commons')
for t in todo:
    k=t['id']+':'+MODE
    if k in res or OTHER.get(t['id']+':commons') or (WIKI.get(t['id']) or {}).get('img'): continue
    if time.time()-T0>LIM: break
    r=commons(t) if MODE=='commons' else openverse(t)
    res[k]=r; st['cm' if MODE=='commons' else 'ov']+=1
    time.sleep(float(os.environ.get('SL','0.5')))
json.dump(res,open(R,'w'),ensure_ascii=False)
done=len({k.split(':')[0] for k in res}); hit=len({k.split(':')[0] for k,v in res.items() if v})
print(st,'tried',len(res),'hit',hit)
