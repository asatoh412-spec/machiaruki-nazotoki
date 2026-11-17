import json,re,sys,time,math,os,urllib.request,urllib.parse,html
H=os.path.expanduser('~/img7'); T0=time.time()
UA={'User-Agent':'machiaruki-personal/0.9 (walking quiz app; contact via github)'}
todo=json.load(open(H+'/todo.json'))
res=json.load(open(H+'/res.json')) if os.path.exists(H+'/res.json') else {}
N429=[0]; HOSTS={}
def get(u,tries=4):
    time.sleep(float(os.environ.get("SL","0")))
    for i in range(tries):
        try:
            with urllib.request.urlopen(urllib.request.Request(u,headers=UA),timeout=20) as r: return json.load(r)
        except urllib.error.HTTPError as e:
            if e.code==429: N429[0]+=1; HOSTS[u.split('/')[2]+('geo' if 'geosearch' in u else '')]=HOSTS.get(u.split('/')[2]+('geo' if 'geosearch' in u else ''),0)+1; time.sleep(3*(i+1)); continue
            return None
        except Exception: time.sleep(2)
    return None
def hv(a,b,c,d):
    x=math.radians;return 2*6371000*math.asin(math.sqrt(math.sin(x(c-a)/2)**2+math.cos(x(a))*math.cos(x(c))*math.sin(x(d-b)/2)**2))
OK=re.compile(r'^(CC BY(-SA)?( \d\.\d)?|CC0|Public domain|PD.*|CC-BY.*|CC-BY-SA.*)',re.I)
def clean(s): return html.unescape(re.sub('<[^>]+>','',s or '')).strip()
def infos(titles):
    if not titles: return []
    u='https://commons.wikimedia.org/w/api.php?'+urllib.parse.urlencode({'action':'query','titles':'|'.join(titles[:20]),'prop':'imageinfo|categories','iiprop':'url|extmetadata|mime','iiextmetadatafilter':'LicenseShortName|Artist|LicenseUrl|ImageDescription|ObjectName','cllimit':'max','format':'json'})
    d=get(u); out={}
    if not d: return []
    for pg in d.get('query',{}).get('pages',{}).values():
        if 'imageinfo' not in pg: continue
        ii=pg['imageinfo'][0]; m=ii.get('extmetadata',{})
        if not ii.get('mime','').startswith('image/'): continue
        lic=clean(m.get('LicenseShortName',{}).get('value',''))
        if not OK.match(lic): continue
        out[pg['title']]={'file_page':ii['descriptionurl'],'image_url':ii.get('thumburl') or ii['url'],'author':clean(m.get('Artist',{}).get('value',''))[:120] or '不明',
                'license':lic,'license_url':clean(m.get('LicenseUrl',{}).get('value','')) or None,
                '_text':' '.join([pg['title'],clean(m.get('ImageDescription',{}).get('value','')),clean(m.get('ObjectName',{}).get('value',''))]+[c['title'] for c in pg.get('categories',[])])}
    return [out[t] for t in titles if t in out]
def one(t):
    core=re.sub(r'（.*?）','',t['name']).strip(); inner=re.findall(r'（(.*?)）',t['name'])
    names=[core]+[x for x in inner if len(x)>=2]
    u='https://ja.wikipedia.org/w/api.php?'+urllib.parse.urlencode({'action':'query','titles':'|'.join(names),'prop':'pageimages|coordinates','piprop':'name','redirects':1,'format':'json'})
    d=None if os.environ.get('NOWIKI') else get(u)
    if d:
        for pg in d.get('query',{}).get('pages',{}).values():
            co=pg.get('coordinates'); pi=pg.get('pageimage')
            if pi and co and hv(t['lat'],t['lon'],co[0]['lat'],co[0]['lon'])<400:
                c=infos(['File:'+pi.replace('_',' ')])
                if c: return {'how':'wiki:'+pg['title'],'img':c[0]}
    u='https://commons.wikimedia.org/w/api.php?'+urllib.parse.urlencode({'action':'query','list':'geosearch','gscoord':f"{t['lat']}|{t['lon']}",'gsradius':120,'gsnamespace':6,'gslimit':20,'format':'json'})
    d=get(u); g=[x['title'] for x in (d or {}).get('query',{}).get('geosearch',[])]
    for c in infos(g):
        if any(n in c['_text'] for n in names): return {'how':'geo','img':c}
    return {'how':None,'img':None}
from concurrent.futures import ThreadPoolExecutor, as_completed
rest=[t for t in todo if t['id'] not in res]
ex=ThreadPoolExecutor(int(os.environ.get('W','8')))
futs={ex.submit(one,t):t for t in rest}
try:
    for f in as_completed(futs,timeout=float(os.environ.get('LIM','140'))):
        t=futs[f]
        try: res[t['id']]=f.result()
        except Exception: pass
except Exception: pass
json.dump(res,open(H+'/res.json','w'),ensure_ascii=False)
print(len(res),'/',len(todo),sum(1 for v in res.values() if v['img']),'429:',N429[0],HOSTS,flush=True)
os._exit(0)
