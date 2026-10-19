# Town Hall runbook

How Town Hall runs, day to day and on a bad day. Reviewed with the maintainer's security program on 2026-10-19. Public on purpose: the process is part of the trust.
Operational details that would help an attacker (machines, accounts, where credentials live) are kept
in the maintainer's private security program, not here.

## What runs where

| Piece | Where | Changes go through |
|---|---|---|
| Problems and researched fixes | `problems/` in this repo | Pull request + `check` CI + maintainer review |
| The site | Cloudflare Worker `town-hall` + D1 database, at townhall.bigpicsolutions.com | `site/` in this repo, deployed by the maintainer |
| Daily collection | Maintainer's machine, `site/scripts/daily-collect.sh` (systemd timer, 07:30) | This repo |
| Weekly review | Maintainer's machine, `site/scripts/weekly-review.sh` (Mondays 09:30) | This repo; its report stays private |

## The loop

1. **Collect.** Every morning, public Bluesky posts matching `site/scripts/queries.txt` are gathered.
   Raw posts (with links) stay on the maintainer's machine. Only text, with handles and links stripped,
   is sent on.
2. **Filter.** Workers AI keeps first-person hardship and drops news, commentary, partisan posts, money
   asks and self-harm posts. Kept posts are stored as *pending*, not shown.
3. **Second gate.** Claude, run with no tools and none of the maintainer's settings, reviews the pending
   posts and AI drafts and approves only what belongs, refiling posts under the right problem. Its decisions
   can only touch that day's pending items. Nothing else reaches the page.
4. **Draft.** Every 6 hours Workers AI drafts fixes from what people said (their words passed as data,
   never as instructions). Drafts are screened and then wait as *pending* for the next daily review.
5. **Research.** People and AI agents add sourced fixes as pull requests (`AGENTS.md`). Every fix says
   who can make it happen: government, people and companies with means, and you, this week.
6. **Publish.** After a merge, the maintainer syncs fixes to the site (deploy, below).
7. **Back.** People post, say "me too", back fixes and share them. The counts are the message.
8. **Review.** Every Monday Claude writes a digest: biggest problems, new problems forming in
   "Something else", fixes with momentum, feedback themes, and stuffing signals (busiest items by network,
   backing from brand-new browsers).
   Proposed changes become pull requests.

## Routine tasks

### Deploy

```sh
python3 scripts/check_submission.py --all          # repo content is valid
site/scripts/deploy.sh                             # sync problems, seed D1, deploy the worker
site/scripts/deploy.sh secret put NAME             # any wrangler command, with the same token
```

Deploys use a Cloudflare API token scoped to Workers, D1 and Workers Routes on this account only (never a
full account login), and the daily jobs use a separate token that can only reach D1. Both expire every
90 days; renew them before they do.

Database changes: add a file to `site/migrations/`, run it with `--remote --file`, and keep `schema.sql`
the full picture for fresh databases. Check for rows that would break a new constraint first.

### Add a problem

1. Create `problems/<slug>/README.md` from `problems/_template/README.md`, with real quotes and sourced facts.
2. Add it to the README table and the solution issue form (`.github/ISSUE_TEMPLATE/solution.yml`).
3. Pull request, merge, then deploy (the sync picks it up).

### Moderate

```sh
python3 site/scripts/review.py pending             # anything waiting
python3 site/scripts/review.py reject voice 123    # take something down
python3 site/scripts/review.py approve idea 45
```

Take down first, discuss after: defamation, private people, contact details, harassment, self-harm,
spam (`MODERATION.md`). Report-content issues on GitHub are checked daily.

### Collect by hand

```sh
python3 site/scripts/collect.py bluesky --days 2
python3 site/scripts/collect.py ingest data/raw/<file>.jsonl --live --pending
python3 site/scripts/review.py pending             # then approve or reject
```

X is collected only through a logged-in browser with `site/scripts/collect-x.js`, gently (a few searches,
a few screens, read-only).

## How it resists gaming

See `SECURITY.md`. In short: a Turnstile human check with a 30-minute pass tied to the browser, one
backing per browser per item, per-network limits (60 a minute, 20 posts, 300 backs and 40 AI checks a
day), AI instructions kept apart from post text, size limits, and every write screened.

## Bad days

Work from a clean device for anything involving accounts. Write a timeline as you go.

**Severity.** Critical: someone could take an account, money or data today, or the site is publishing
something harmful right now. Fix it before anything else. High: a working path to that. Medium: makes an
attack easier. Low: hygiene. The maintainer keeps private incident playbooks for account takeover, an
AI agent misbehaving, and threats or doxxing; this page covers the site itself.

| Situation | First moves |
|---|---|
| **Defamatory or private content is up** | `review.py reject <kind> <id>`; if it came from the repo, revert the PR. Then find how it got through and tighten the screen. |
| **Flood of posts or backing (stuffing)** | Lower the caps in `site/src/worker.js` and deploy; in the Turnstile widget switch to the non-interactive challenge; reject the flood rows. If it continues: turn on Cloudflare's "I'm under attack" mode for the zone. |
| **Raid on the GitHub repo** | Settings → Moderation → Interaction limits (outside users) for 24h–6 months; lock issues; block repeat accounts. |
| **Admin token leaked** | `npx wrangler secret put ADMIN_TOKEN` with a new value, update the maintainer's copy, check D1 for rows inserted by ingest during the exposure. |
| **Turnstile or salt leaked** | Rotate in the Turnstile dashboard / `wrangler secret put`. A new `HASH_SALT` resets everyone's backing identity and passes; counts stay. |
| **Site defaced or worker changed unexpectedly** | `npx wrangler deployments list`, roll back with `npx wrangler rollback`, then treat it as an account compromise (below). |
| **Bad data in the database** | `npx wrangler d1 time-travel restore town-hall --timestamp <before it started>` (30-day window), then redeploy if needed. |
| **Cloudflare or GitHub account compromised** | Follow the maintainer's account-takeover playbook from a clean device: revoke sessions and tokens, rotate secrets, check deployments, DNS, rulesets and the security log. |
| **The AI screen or reviewer misbehaves (prompt injection, approving junk)** | Stop the timer (`systemctl --user stop town-hall-collect.timer`), reject the bad rows, read the decisions file, tighten the prompt and the regex screen, add the attack as a test case. |
| **A post shows someone in crisis** | It's dropped from the board by design. The page shows the 988 line next to the post box. |

## Lockdown levers (fastest first)

1. **Hold everything:** set `MODERATION = "hold"` in `site/wrangler.toml` and deploy. Every new post
   waits for review and AI drafting stops; the board stays up.
2. Stop the timers (`systemctl --user stop town-hall-collect.timer town-hall-review.timer`).
3. Raise the human check for everyone: Turnstile widget mode to interactive (always challenge).
4. Lower the per-network caps and deploy.
5. Cloudflare "I'm under attack" mode, or a WAF rate-limit rule on `/api/*`, for the zone.
6. GitHub interaction limits on the repo.
7. Roll the database back (D1 Time Travel) or the worker back (`npx wrangler rollback`).
8. Take the site down: deploy a static notice.

## Keys and secrets

| Secret | Lives in | Rotate when | How |
|---|---|---|---|
| `TURNSTILE_SECRET` | Worker secret | Leak, or yearly | Turnstile dashboard, then `wrangler secret put` |
| `HASH_SALT` | Worker secret | Leak | `wrangler secret put` (resets passes and per-browser identity) |
| `ADMIN_TOKEN` | Worker secret + one private copy for the collectors | Leak, or every 90 days | New random value, `wrangler secret put`, update the private copy |
| `PASS_KEY` | Worker secret | Leak | `wrangler secret put` (everyone's 30-minute pass ends; they pass one new check) |
| Cloudflare API tokens | Maintainer only, scoped: one for deploys, one D1-only for the timers | Leak, or before they expire (90 days) | Cloudflare dashboard → Manage account → Account API tokens → roll |

No secret is ever committed. `*.example` files show the shape; secret scanning and push protection are on.

## Reviews

- **Weekly:** the AI digest (Mondays) and the report-content issues.
- **Monthly:** skim rejected and approved posts for drift; check the caps against real traffic.
- **Quarterly:** with the maintainer's security audit: account 2FA and sessions, token scopes and ages,
  Cloudflare and GitHub security logs, dependency and action pins, a restore drill of the D1 database
  (`npx wrangler d1 time-travel`).
