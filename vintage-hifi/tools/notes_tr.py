"""Translate only the German variant notes found in HiFi-Wiki model names."""
import json, translate_hw as t, argostranslate.translate as tr
from concurrent.futures import ThreadPoolExecutor
rows = [json.loads(l) for l in open('hw/parsed.jsonl')]
notes = set()
for d in rows:
    m = (d.get('Modell') or '').strip()
    if m:
        c, n = t.split_model(m)
        if n: notes.add(t.clean(n))
cache = json.load(open(t.CACHE))
todo = [n for n in notes if n not in cache]
print(len(notes), 'notes,', len(todo), 'to translate', flush=True)
def one(n): return n, t.post(tr.translate(t.pre(n), 'de', 'en'))
with ThreadPoolExecutor(4) as ex:
    for n, e in ex.map(one, todo): cache[n] = e
json.dump(cache, open(t.CACHE, 'w'), ensure_ascii=False)
for n in list(notes)[:12]: print(repr(n), '->', cache[n])
print('done')
