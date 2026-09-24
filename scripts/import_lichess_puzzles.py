"""Pick a kid-friendly subset of real lichess puzzles (CC0) for the puzzle trainer.

Source: the 50k-puzzle sample in https://github.com/mcognetta/lichess-combined-puzzle-game-db
(combined_puzzle_db_first_50k.ndjson.bz2), which comes from https://database.lichess.org/#puzzles.
Usage: python3 scripts/import_lichess_puzzles.py <path-to.ndjson.bz2>  -> data/puzzles/lichess.jsonl
"""
import bz2, json, random, sys
from collections import defaultdict

src = sys.argv[1]
random.seed(7)
PRIORITY = {'mateIn1', 'mateIn2', 'mateIn3', 'mateIn4', 'fork', 'pin', 'skewer', 'discoveredAttack',
            'backRankMate', 'smotheredMate', 'promotion', 'hangingPiece', 'trappedPiece', 'doubleCheck',
            'deflection', 'attraction', 'sacrifice'}
buckets = defaultdict(list)
with bz2.open(src, 'rt') as f:
    for line in f:
        p = json.loads(line)['puzzle']
        rating, rd, pop = int(p['Rating']), int(p['RatingDeviation']), int(p['Popularity'])
        themes = p['Themes'].split()
        if not (400 <= rating < 2000) or rd > 90 or pop < 80:
            continue
        mate = any(t.startswith('mateIn') for t in themes)
        if 'veryLong' in themes or ('long' in themes and not mate):
            continue  # keep lines short enough for a 9-year-old (mates can be a bit longer)
        if not (set(themes) & PRIORITY or 'crushing' in themes or 'advantage' in themes):
            continue
        buckets[rating // 100 * 100].append({
            'id': 'L' + p['PuzzleId'], 'fen': p['FEN'], 'moves': p['Moves'].split(),
            'rating': rating, 'themes': themes, 'src': 'lichess',
            'score': len(set(themes) & PRIORITY) + random.random(),
        })

# Balance the themes inside each rating band: take puzzles round-robin from each category.
CATS = [
    ('mate1', lambda t: 'mateIn1' in t), ('mate2', lambda t: 'mateIn2' in t),
    ('mate3', lambda t: 'mateIn3' in t or 'mateIn4' in t), ('fork', lambda t: 'fork' in t),
    ('pin', lambda t: 'pin' in t or 'skewer' in t), ('disc', lambda t: 'discoveredAttack' in t or 'doubleCheck' in t),
    ('hang', lambda t: 'hangingPiece' in t), ('promo', lambda t: 'promotion' in t),
    ('trick', lambda t: bool({'deflection', 'attraction', 'trappedPiece', 'sacrifice'} & set(t))),
    ('win', lambda t: 'crushing' in t or 'advantage' in t),
]
PER_BAND = 150
out = []
for b in sorted(buckets):
    pools = [sorted([p for p in buckets[b] if f(p['themes'])], key=lambda x: -x['score']) for _, f in CATS]
    taken = set()
    picked = []
    while len(picked) < PER_BAND and any(pools):
        for pool in pools:
            while pool and pool[0]['id'] in taken:
                pool.pop(0)
            if pool and len(picked) < PER_BAND:
                p = pool.pop(0)
                taken.add(p['id'])
                picked.append(p)
    out += picked
with open('data/puzzles/lichess.jsonl', 'w') as f:
    for p in out:
        p.pop('score')
        f.write(json.dumps(p) + '\n')
count = lambda t: sum(t in p['themes'] for p in out)
print(len(out), 'lichess puzzles;', {b: min(150, len(buckets[b])) for b in sorted(buckets)})
print({t: count(t) for t in sorted(PRIORITY)})
