"""Extract local course PDFs for authoring. Never copies PDFs into the website."""
import sys
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / '.work' / 'python'))
import pymupdf

SOURCE = Path(sys.argv[1])
DEST = ROOT / '.work' / 'sources'
DEST.mkdir(parents=True, exist_ok=True)
FILES = [
    'section3 (ch10-11).pdf',
    'section4 (ch12-13).pdf',
    'section4 (ch14-16).pdf',
    'section4 (ch17-19).pdf',
    'section4 (ch20-21).pdf',
    'section5 (ch22-26).pdf',
]
summary = []
for i, filename in enumerate(FILES, 1):
    doc = pymupdf.open(SOURCE / filename)
    pages = [{'page': n+1, 'text': page.get_text(sort=True)} for n, page in enumerate(doc)]
    payload = {'id': f'source-{i}', 'filename': filename, 'pageCount': len(doc), 'pages': pages}
    (DEST / f'source-{i}.json').write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding='utf-8')
    (DEST / f'source-{i}.txt').write_text('\n\n'.join(f'=== PDF PAGE {p["page"]} ===\n{p["text"]}' for p in pages), encoding='utf-8')
    summary.append({'id': payload['id'], 'filename': filename, 'pages': len(doc), 'chars': sum(len(p['text']) for p in pages)})
print(json.dumps(summary, ensure_ascii=False, indent=2))
