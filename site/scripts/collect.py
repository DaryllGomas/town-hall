#!/usr/bin/env python3
"""Gather public posts about what people are struggling with, and send them to the site's AI filter.

  collect.py bluesky [--days 3] [--per-query 50] [--out FILE]   search Bluesky (no account needed) -> data/raw/
  collect.py ingest FILE.jsonl [--live] [--pending] send a collected file through /api/admin/ingest
                                                   (--pending: kept posts wait for review instead of showing)

X is collected through a logged-in browser with collect-x.js. Raw files keep the post links and stay
in data/raw/ (git-ignored). Only anonymized text ever reaches the site.
The admin token comes from TOWN_HALL_ADMIN_TOKEN, ~/.config/town-hall/admin-token (live) or
site/.dev.vars (local dev server).
"""
import datetime
import json
import os
import pathlib
import sys
import time
import urllib.parse
import urllib.request

SITE = pathlib.Path(__file__).resolve().parents[1]
RAW = SITE.parent / "data" / "raw"
LOCAL = "http://localhost:8787"
LIVE = os.environ.get("TOWN_HALL_URL", "https://townhall.bigpicsolutions.com")


def queries():
    lines = (SITE / "scripts" / "queries.txt").read_text().splitlines()
    return [q.strip() for q in lines if q.strip() and not q.startswith("#")]


def get(url):
    req = urllib.request.Request(url, headers={"User-Agent": "town-hall-collector/0.1"})
    with urllib.request.urlopen(req, timeout=20) as r:
        return json.load(r)


def bluesky(days=3, per_query=50, out=None):
    since = (datetime.datetime.now(datetime.timezone.utc) - datetime.timedelta(days=days)).strftime("%Y-%m-%dT%H:%M:%SZ")
    seen, rows = set(), []
    for q in queries():
        cursor, got = None, 0
        while got < per_query:
            params = {"q": q, "sort": "latest", "lang": "en", "since": since, "limit": 25}
            if cursor:
                params["cursor"] = cursor
            try:
                d = get("https://api.bsky.app/xrpc/app.bsky.feed.searchPosts?" + urllib.parse.urlencode(params))
            except Exception as e:  # one bad query shouldn't stop the run
                print(f"  {q}: {e}", file=sys.stderr)
                break
            for p in d.get("posts", []):
                text = p.get("record", {}).get("text", "").strip()
                if p["uri"] in seen or not text:
                    continue
                seen.add(p["uri"])
                rows.append({"source": "bluesky", "text": text, "url": p["uri"], "query": q,
                             "created": p.get("record", {}).get("createdAt", "")})
                got += 1
            cursor = d.get("cursor")
            if not cursor or not d.get("posts"):
                break
            time.sleep(0.5)
        print(f"  {got:3d}  {q}", file=sys.stderr)
    return save(rows, "bluesky", out)


def save(rows, source, out=None):
    RAW.mkdir(parents=True, exist_ok=True)
    out = pathlib.Path(out) if out else RAW / f"collect-{datetime.date.today()}-{source}.jsonl"
    with out.open("a") as f:
        for r in rows:
            f.write(json.dumps(r, ensure_ascii=False) + "\n")
    print(f"{len(rows)} posts -> {out}")
    return out


def token(live):
    t = os.environ.get("TOWN_HALL_ADMIN_TOKEN", "")
    saved = pathlib.Path.home() / ".config" / "town-hall" / "admin-token"
    if not t and live and saved.exists():
        t = saved.read_text().strip()
    if not t and not live:
        for line in (SITE / ".dev.vars").read_text().splitlines():
            if line.startswith("ADMIN_TOKEN="):
                t = line.split("=", 1)[1].strip()
    if not t:
        sys.exit("Set TOWN_HALL_ADMIN_TOKEN.")
    return t


def ingest(path, live=False, pending=False):
    base = LIVE if live else os.environ.get("TOWN_HALL_LOCAL", LOCAL)
    if not base:
        sys.exit("Set TOWN_HALL_URL to the live site.")
    rows = [json.loads(l) for l in pathlib.Path(path).read_text().splitlines() if l.strip()]
    total = {}
    for i in range(0, len(rows), 60):
        posts = [{"source": r["source"], "text": r["text"]} for r in rows[i:i + 60]]
        req = urllib.request.Request(f"{base}/api/admin/ingest", data=json.dumps({"posts": posts, "pending": pending}).encode(),
                                     headers={"Content-Type": "application/json", "Authorization": f"Bearer {token(live)}"})
        with urllib.request.urlopen(req, timeout=300) as r:
            stats = json.load(r)
        for k, v in stats.items():
            total[k] = total.get(k, 0) + v
        print(f"  batch {i // 60 + 1}: {stats}", file=sys.stderr)
    print(total)


if __name__ == "__main__":
    a = sys.argv[1:]
    opt = lambda name, default: int(a[a.index(name) + 1]) if name in a else default
    if a[:1] == ["bluesky"]:
        bluesky(opt("--days", 3), opt("--per-query", 50), a[a.index("--out") + 1] if "--out" in a else None)
    elif a[:1] == ["ingest"] and len(a) >= 2:
        ingest(a[1], "--live" in a, "--pending" in a)
    else:
        sys.exit(__doc__)
