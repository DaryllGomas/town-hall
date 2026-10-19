#!/usr/bin/env python3
"""Review held posts, apply review decisions, and export the board for an AI digest.

  review.py pending [--json]       voices and ideas waiting for review (approved = 0)
  review.py approve voice 12       show it on the page
  review.py reject idea 7          hide it for good
  review.py apply DECISIONS.json   apply {"approve": [{"kind": "voice", "id": 12}], "reject": [...]} in one go
  review.py export [--md]          everything shown (with backing counts) plus feedback, as JSON or Markdown

Add --local to work on the local dev database instead of the live one.
"""
import json
import pathlib
import subprocess
import sys

SITE = pathlib.Path(__file__).resolve().parents[1]
args = [a for a in sys.argv[1:] if not a.startswith("--")]
flags = {a for a in sys.argv[1:] if a.startswith("--")}
where = "--local" if "--local" in flags else "--remote"
KINDS = {"voice": "voices", "idea": "ideas"}


def sql(query):
    out = subprocess.run(["npx", "wrangler", "d1", "execute", "town-hall", where, "--json", "--command", query],
                         cwd=SITE, capture_output=True, text=True)
    if out.returncode:
        sys.exit(out.stderr or out.stdout)
    return json.loads(out.stdout)[0]["results"]


def pending():
    rows = [{"kind": "voice", **r} for r in sql("SELECT id, problem, source, text FROM voices WHERE approved = 0 ORDER BY id")]
    rows += [{"kind": "idea", **r} for r in sql("SELECT id, problem, source, title, body AS text FROM ideas WHERE approved = 0 ORDER BY id")]
    return rows


def set_status(items, value):
    # Approvals can refile a post under a better-fitting problem.
    slugs = {p["slug"] for p in json.loads((SITE / "public" / "problems.json").read_text())["problems"]}
    for i in items:
        if value == 1 and i.get("problem") in slugs and i.get("kind") in KINDS and str(i.get("id", "")).isdigit():
            sql(f"UPDATE {KINDS[i['kind']]} SET problem = '{i['problem']}' WHERE approved = 0 AND id = {int(i['id'])}")
    for kind in KINDS:
        ids = sorted({int(i["id"]) for i in items if i.get("kind") == kind and str(i.get("id", "")).isdigit()})
        if ids:
            sql(f"UPDATE {KINDS[kind]} SET approved = {value} WHERE approved = 0 AND id IN ({','.join(map(str, ids))})")
    return len(items)


def export():
    backers = "(SELECT COUNT(*) FROM backs b WHERE b.kind = '{k}' AND b.item_id = t.id)"
    return {
        "voices": sql(f"SELECT t.id, t.problem, t.text, t.source, t.created_at, {backers.format(k='voice')} AS backers "
                      "FROM voices t WHERE approved = 1"),
        "ideas": sql(f"SELECT t.id, t.problem, t.title, t.body, t.source, t.created_at, {backers.format(k='idea')} AS backers "
                     "FROM ideas t WHERE approved = 1"),
        "feedback": sql("SELECT text, created_at FROM feedback ORDER BY created_at"),
    }


def markdown(d):
    problems = {p["slug"]: p["title"] for p in json.loads((SITE / "public" / "problems.json").read_text())["problems"]}
    lines = ["# Town Hall: what people said", ""]
    for slug, title in problems.items():
        voices = sorted((v for v in d["voices"] if v["problem"] == slug), key=lambda v: -v["backers"])
        ideas = sorted((i for i in d["ideas"] if i["problem"] == slug), key=lambda i: -i["backers"])
        lines += [f"## {title} ({len(voices)} voices, {len(ideas)} fixes)", "", "### Voices", ""]
        lines += [f"- [{v['source']}, {v['backers']} me too] {v['text']}" for v in voices] or ["- none"]
        lines += ["", "### Fixes", ""]
        lines += [f"- [{i['source']}, {i['backers']} backers] **{i['title']}**: {i['body']}" for i in ideas] or ["- none"]
        lines.append("")
    lines += ["## Feedback on the site", ""] + ([f"- {f['text']}" for f in d["feedback"]] or ["- none"])
    return "\n".join(lines)


if not args or args[0] == "pending":
    rows = pending()
    if "--json" in flags:
        print(json.dumps(rows, ensure_ascii=False))
    else:
        for r in rows:
            print(r["kind"], json.dumps({k: v for k, v in r.items() if k != "kind"}, ensure_ascii=False))
elif args[0] in ("approve", "reject") and len(args) == 3 and args[1] in KINDS and args[2].isdigit():
    set_status([{"kind": args[1], "id": args[2]}], 1 if args[0] == "approve" else -1)
    print(f"{ {'approve': 'approved', 'reject': 'rejected'}[args[0]]} {args[1]} {args[2]}")
elif args[0] == "apply" and len(args) == 2:
    d = json.loads(pathlib.Path(args[1]).read_text())
    a = set_status(d.get("approve", []), 1)
    r = set_status(d.get("reject", []), -1)
    print(f"approved {a}, rejected {r}")
elif args[0] == "export":
    d = export()
    print(markdown(d) if "--md" in flags else json.dumps(d, indent=1, ensure_ascii=False))
else:
    sys.exit(__doc__)
