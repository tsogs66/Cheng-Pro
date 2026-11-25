#!/usr/bin/env python3 -I
"""Convert data/sea-lanes/source/marnet_dict.py.txt (untrusted Python literal data) into data/sea-lanes/marnet.json.
The source is parsed with ast.literal_eval; it is never imported or executed."""
import ast, json, os, sys, math
root = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
src = os.path.join(root, 'data/sea-lanes/source/marnet_dict.py.txt')
out = os.path.join(root, 'data/sea-lanes/marnet.json')
vals = {}
for n in ast.parse(open(src, encoding='utf-8').read()).body:
    if isinstance(n, ast.Assign) and len(n.targets) == 1 and isinstance(n.targets[0], ast.Name):
        vals[n.targets[0].id] = ast.literal_eval(n.value)
nodes_src, edges_src = vals['node_list'], vals['edge_list']
pts = set(nodes_src)
for u, d in edges_src.items():
    pts.add(u); pts.update(d)
pts = sorted(pts)
idx = {p: i for i, p in enumerate(pts)}
tags, tag_i = [], {}
edges, seen = [], set()
for u, d in edges_src.items():
    for v, a in d.items():
        k = (min(idx[u], idx[v]), max(idx[u], idx[v]))
        if k in seen or k[0] == k[1]: continue
        seen.add(k)
        t = a.get('passage')
        ti = -1
        if t and t != 'None':
            if t not in tag_i: tag_i[t] = len(tags); tags.append(t)
            ti = tag_i[t]
        edges.append([k[0], k[1], ti])
edges.sort()
doc = {'format': 'marnet-v1', 'tags': tags,
       'nodes': [[round(p[0], 5), round(p[1], 5)] for p in pts],  # [lon, lat]
       'edges': edges}                                           # [i, j, tagIndex or -1]
json.dump(doc, open(out, 'w'), separators=(',', ':')); open(out, 'a').write('\n')
print(f'{len(pts)} nodes, {len(edges)} edges, tags={tags} -> {out} ({os.path.getsize(out)//1024} KB)')
