#!/usr/bin/env python3
"""Download a reproducible, class-balanced sample of the public muxspace/facial_expressions
dataset (labels + images from raw.githubusercontent.com) into ./data.

Up to 150 images per emotion (seed 42); 'contempt' is skipped because the model has no such class.
Usage: python3 fetch_data.py [per_class=150]
"""
import csv, os, random, sys, urllib.request
from concurrent.futures import ThreadPoolExecutor

BASE = "https://raw.githubusercontent.com/muxspace/facial_expressions/master"
PER_CLASS = int(sys.argv[1]) if len(sys.argv) > 1 else 150
LABELS = {"anger": "angry", "disgust": "disgusted", "fear": "fearful", "happiness": "happy",
          "neutral": "neutral", "sadness": "sad", "surprise": "surprised"}

os.makedirs("data/img", exist_ok=True)
legend = urllib.request.urlopen(f"{BASE}/data/legend.csv", timeout=60).read().decode().splitlines()
by = {}
for r in csv.DictReader(legend):
    e = r["emotion"].strip().lower()
    if e in LABELS:
        by.setdefault(e, set()).add(r["image"])

random.seed(42)
rows = []
for e, imgs in by.items():
    imgs = sorted(imgs)
    random.shuffle(imgs)
    rows += [(f, LABELS[e]) for f in imgs[:PER_CLASS]]

with open("data/sample.csv", "w") as fh:
    fh.write("image,label\n")
    for f, l in rows:
        fh.write(f"{f},{l}\n")

def get(item):
    f = item[0]
    dest = f"data/img/{f}"
    if os.path.exists(dest) and os.path.getsize(dest) > 0:
        return True
    for _ in range(3):
        try:
            with open(dest, "wb") as out:
                out.write(urllib.request.urlopen(f"{BASE}/images/{f}", timeout=60).read())
            return True
        except Exception:
            pass
    return False

with ThreadPoolExecutor(12) as ex:
    ok = sum(ex.map(get, rows))
print(f"{ok}/{len(rows)} images ready in data/img (labels in data/sample.csv)")
