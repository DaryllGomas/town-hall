#!/usr/bin/env python3
"""Review posts the AI screen couldn't check (approved = 0), and export the board for an AI digest.

  review.py pending                list voices and ideas waiting for review
  review.py approve voice 12       show it on the page
  review.py reject idea 7          hide it for good
  review.py export > board.json    everything shown, with backing counts

Add --local to work on the local dev database instead of the live one.
"""
import json
import subprocess
import sys

args = [a for a in sys.argv[1:] if a != "--local"]
where = "--local" if "--local" in sys.argv else "--remote"


def sql(query):
    out = subprocess.run(["npx", "wrangler", "d1", "execute", "town-hall", where, "--json", "--command", query],
                         capture_output=True, text=True, check=True).stdout
    return json.loads(out)[0]["results"]


if not args or args[0] == "pending":
    for kind, cols in (("voices", "id, problem, text"), ("ideas", "id, problem, title, body")):
        for r in sql(f"SELECT {cols} FROM {kind} WHERE approved = 0 ORDER BY id"):
            print(kind[:-1], json.dumps(r, ensure_ascii=False))
elif args[0] in ("approve", "reject") and len(args) == 3 and args[1] in ("voice", "idea") and args[2].isdigit():
    sql(f"UPDATE {args[1]}s SET approved = {1 if args[0] == 'approve' else -1} WHERE id = {int(args[2])}")
    print(f"{ {'approve': 'approved', 'reject': 'rejected'}[args[0]]} {args[1]} {args[2]}")
elif args[0] == "export":
    count = "(SELECT COUNT(*) FROM backs b WHERE b.kind = '{k}' AND b.item_id = t.id) AS backers"
    print(json.dumps({
        "voices": sql(f"SELECT t.id, t.problem, t.text, t.source, t.created_at, {count.format(k='voice')} FROM voices t WHERE approved = 1"),
        "ideas": sql(f"SELECT t.id, t.problem, t.title, t.body, t.source, t.created_at, {count.format(k='idea')} FROM ideas t WHERE approved = 1"),
    }, indent=1, ensure_ascii=False))
else:
    sys.exit(__doc__)
