import json,sys
src,dst,fname=sys.argv[1:4]
d=json.load(open(src)); L=[f"# 素材パック 確認用：{d['title']}","",f"版 {d['version']}・{len(d['points'])}地点・すべて未確認（現地で確かめる前）。アプリが読むのは {fname} で、これはその読みやすい写しです。",""]
for i,p in enumerate(d['points'],1):
    L+= [f"## {i}. {p['name']}","",f"- 謎: {p['riddle']}"]
    L+= [f"- ヒント{j}（半径{h['radius_m']}m）: {h['text']}" for j,h in enumerate(p['hints'],1)]
    L+= [f"- 現地のヒント{'（未確認）' if h.get('confidence')=='未確認' else ''}: {h['text']}" for h in p.get('onsite_hints',[])]
    a=p['answer']; L.append(f"- 問い: {a['prompt']} → 正解「{a['display']}」（許す表記: {'、'.join(a['accept'])}）")
    L.append(f"- 訪問の注意: {p.get('access') or '確認できず'}")
    L.append(f"- 屋内: {'はい' if p.get('indoor') else 'いいえ'}・駐輪して歩く: {'はい' if p.get('on_foot') else 'いいえ'}")
    L.append(f"- 短い解説: {p['short']}")
    L+= [f"- 画像: [{im['caption']}]({im['file_page']})（{im['author']}・{im['license']}）" for im in p.get('images',[])]
    L+= ["",p['long'].replace('\n\n','\n\n'),"","出典: "+" / ".join(f"[{s['title']}]({s['url']})" for s in p['sources']),""]
    if p.get('notes'): L+= ["作成メモ: "+p['notes'].replace('\n',' '),""]
open(dst,'w').write('\n'.join(L))
