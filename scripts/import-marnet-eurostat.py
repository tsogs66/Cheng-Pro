#!/usr/bin/env python3 -I
"""Convert a Eurostat SeaRoute marnet_plus GeoPackage (EUPL-1.2, https://github.com/eurostat/searoute) into data/sea-lanes/marnet.json (format marnet-v1).
Usage: python3 scripts/import-marnet-eurostat.py [source.gpkg] [out.json]
The GeoPackage is read with sqlite3 only; LineString geometries (GeoPackage binary + WKB) are split into one edge per vertex pair and the `pass` column becomes the edge tag.
Eurostat's tag names are mapped to the ids the router uses (babelmandeb -> babalmandab, magellan -> chili)."""
import sqlite3, struct, json, os, sys
root = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
src = sys.argv[1] if len(sys.argv) > 1 else os.path.join(root, 'data/sea-lanes/source/marnet_plus_5km.gpkg')
out = sys.argv[2] if len(sys.argv) > 2 else os.path.join(root, 'data/sea-lanes/marnet.json')
RENAME = {'babelmandeb': 'babalmandab', 'magellan': 'chili'}
def line_points(blob):
    flags = blob[3]
    env = {0: 0, 1: 32, 2: 48, 3: 48, 4: 64}[(flags >> 1) & 7]
    wkb = blob[8 + env:]
    bo = '<' if wkb[0] == 1 else '>'
    gt = struct.unpack(bo + 'I', wkb[1:5])[0] % 1000
    if gt != 2: raise ValueError('not a LineString: %d' % gt)
    n = struct.unpack(bo + 'I', wkb[5:9])[0]
    return [struct.unpack(bo + 'dd', wkb[9 + 16 * i: 25 + 16 * i]) for i in range(n)]
con = sqlite3.connect('file:%s?mode=ro' % src, uri=True)
table = con.execute('select table_name from gpkg_contents').fetchone()[0]
idx, pts, tags, tag_i, edges, seen = {}, [], [], {}, [], set()
def node(p):
    k = (round(p[0], 5), round(p[1], 5))
    if k not in idx: idx[k] = len(pts); pts.append(k)
    return idx[k]
for blob, t in con.execute('select geometry, pass from "%s"' % table):
    p = line_points(blob)
    ti = -1
    if t and t != 'None':
        t = RENAME.get(t.lower(), t.lower())
        if t not in tag_i: tag_i[t] = len(tags); tags.append(t)
        ti = tag_i[t]
    for a, b in zip(p, p[1:]):
        i, j = node(a), node(b)
        k = (min(i, j), max(i, j))
        if k[0] == k[1] or k in seen: continue
        seen.add(k); edges.append([k[0], k[1], ti])
# The lane lines are cut at the 180th meridian: join each node at 180 E to the node at 180 W with the same latitude (the same place, a zero-length edge) so routes can cross the Pacific.
by = {(round(p[0]), p[1]): i for i, p in enumerate(pts) if abs(abs(p[0]) - 180) < 1e-9}
bridges = 0
for (lon, lat), i in list(by.items()):
    if lon == 180 and (-180, lat) in by:
        k = (min(i, by[(-180, lat)]), max(i, by[(-180, lat)]))
        if k not in seen: seen.add(k); edges.append([k[0], k[1], -1]); bridges += 1
print('dateline bridges:', bridges)
# sort nodes for stable output
order = sorted(range(len(pts)), key=lambda i: pts[i]); remap = {o: n for n, o in enumerate(order)}
nodes = [[pts[i][0], pts[i][1]] for i in order]
edges = sorted([min(remap[a], remap[b]), max(remap[a], remap[b]), t] for a, b, t in edges)
json.dump({'format': 'marnet-v1', 'tags': tags, 'nodes': nodes, 'edges': edges}, open(out, 'w'), separators=(',', ':')); open(out, 'a').write('\n')
print('%d nodes, %d edges, tags=%s -> %s (%d KB)' % (len(nodes), len(edges), tags, out, os.path.getsize(out) // 1024))
