import json,re,os,time,urllib.request,urllib.parse
exec(open('img.py').read().split('def infos')[0].replace("todo=json.load","todo=json.load"))
def infos2(titles):
    out={}
    for i in range(0,len(titles),40):
        u='https://commons.wikimedia.org/w/api.php?'+urllib.parse.urlencode({'action':'query','titles':'|'.join(titles[i:i+40]),'prop':'imageinfo','iiprop':'url|extmetadata|mime','iiextmetadatafilter':'LicenseShortName|Artist|LicenseUrl','format':'json'})
        d=get(u) or {}
        norm={n['to']:n['from'] for n in d.get('query',{}).get('normalized',[])}
        for pg in d.get('query',{}).get('pages',{}).values():
            if 'imageinfo' not in pg: continue
            ii=pg['imageinfo'][0]; m=ii.get('extmetadata',{})
            if not ii.get('mime','').startswith('image/'): continue
            lic=clean(m.get('LicenseShortName',{}).get('value',''))
            if not OK.match(lic): continue
            out[pg['title']]={'file_page':ii['descriptionurl'],'image_url':ii['url'],'author':clean(m.get('Artist',{}).get('value',''))[:120] or '不明','license':lic,'license_url':clean(m.get('LicenseUrl',{}).get('value','')) or None}
        time.sleep(1)
    return out
rest=[t for t in todo if t['id'] not in res]
q={}
for t in rest:
    core=re.sub(r'（.*?）','',t['name']).strip(); inner=re.findall(r'（(.*?)）',t['name'])
    for n in [core]+[x for x in inner if len(x)>=2]: q.setdefault(n,[]).append(t)
names=list(q); pages={}
for i in range(0,len(names),50):
    u='https://ja.wikipedia.org/w/api.php?'+urllib.parse.urlencode({'action':'query','titles':'|'.join(names[i:i+50]),'prop':'pageimages|coordinates','piprop':'name','pilimit':50,'colimit':'max','redirects':1,'format':'json'})
    d=get(u) or {}
    mp={}
    for k in ('normalized','redirects'):
        for n in d.get('query',{}).get(k,[]): mp[n['to']]=mp.get(n['from'],n['from'])
    for pg in d.get('query',{}).get('pages',{}).values():
        src=mp.get(pg.get('title'),pg.get('title'))
        if pg.get('pageimage') and pg.get('coordinates'): pages[src]=(pg['title'],pg['pageimage'],pg['coordinates'][0])
    time.sleep(1)
print('names',len(names),'pages with img+coord',len(pages),flush=True)
cand={}
for n,(title,img,co) in pages.items():
    for t in q.get(n,[]):
        if t['id'] in cand: continue
        if hv(t['lat'],t['lon'],co['lat'],co['lon'])<400: cand[t['id']]=(title,'File:'+img.replace('_',' '))
inf=infos2(sorted({f for _,f in cand.values()}))
k=0
for tid,(title,f) in cand.items():
    if f in inf: res[tid]={'how':'wiki:'+title,'img':inf[f]}; k+=1
json.dump(res,open(H+'/res.json','w'),ensure_ascii=False)
print('cand',len(cand),'ok',k,'total res',len(res),sum(1 for v in res.values() if v['img']),'429',N429[0])
