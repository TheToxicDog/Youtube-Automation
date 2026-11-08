#!/usr/bin/env python3
"""Build dist/blockwright.html: one self-contained file you can open offline or host anywhere.

Inlines js/*.js and wraps index.html in a full HTML document. three.js still loads from its CDN.
Run from the repo root:  python3 tools/build_standalone.py
"""
import pathlib, re

root = pathlib.Path(__file__).resolve().parent.parent
page = (root / "index.html").read_text()

def inline(m):
    src = m.group(1)
    if src.startswith("http"):
        return m.group(0)
    return "<script>\n" + (root / src).read_text() + "\n</script>"

page = re.sub(r'<script src="([^"]+)"></script>', inline, page)
doc = (
    '<!doctype html><html lang="en"><head><meta charset="utf-8">'
    '<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">'
    "<style>:root{padding-top:env(safe-area-inset-top);padding-bottom:env(safe-area-inset-bottom)}"
    "body{margin:0}img{max-width:100%}[hidden]{display:none!important}</style></head><body>"
    + page + "</body></html>\n"
)
out = root / "dist" / "blockwright.html"
out.parent.mkdir(exist_ok=True)
out.write_text(doc)
print(f"wrote {out.relative_to(root)} ({out.stat().st_size // 1024} KB)")
