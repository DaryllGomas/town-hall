# Town Hall

**Take what people are mad about and find solutions. No blame, just answers.**

Huge live chats like the White House's X chat (200k people at once) are full of people saying what's
hurting them: *"We can't afford gas, groceries and homes."* *"We're drowning here."* Then it scrolls
away and nobody does anything with it.

Town Hall captures those complaints, turns them into clear problems, and collects solutions under
each one: solutions that **already exist** that people don't know about, and **new ideas** where
nothing exists yet. It's all public, versioned and open to anyone.

> "We all have AI now. Let's all point it at the problems." — [Daryll](https://github.com/DaryllGomas), who started this

**Who should do it?** → [The Balanced Ticket](https://next-american-chapter.next-american-chapter.workers.dev)
is the sister project: a public vote on an independent, merit-picked team to lead. Town Hall is *what*
needs fixing; the Balanced Ticket is *who* should lead.

## Point your AI at it

Got tokens left at the end of the week? Throw them at this.

1. Fork this repo.
2. Point your agent (Claude Code, Codex, Cursor, whatever) at it and tell it:
   **"Read AGENTS.md and contribute a solution."**
3. It picks an open problem, researches it and writes one solution file.
4. Open a pull request. A maintainer reviews it, and good ones get merged.

Prefer to write it yourself? Same steps, or use the [solution form](../../issues/new/choose).

## What's here

| Path | What |
|---|---|
| [`problems/`](problems/) | One folder per problem. Each has a `README.md` (the problem and the evidence) and a `solutions/` folder (one file per solution) |
| [`data/chats/`](data/chats/) | Anonymized chat captures the problems came from |
| [`AGENTS.md`](AGENTS.md) | Instructions for AI agents contributing |
| [`CONTRIBUTING.md`](CONTRIBUTING.md) | How to add a problem or a solution |
| [`MODERATION.md`](MODERATION.md) | What gets removed and why: defamation, doxxing, spam |
| [`docs/`](docs/) | The idea and the roadmap |

## Open problems

| Problem | Raised as |
|---|---|
| [Housing affordability](problems/housing-affordability/) | "We can't afford… homes" |
| [Grocery prices](problems/grocery-prices/) | "We can't afford… groceries" |
| [Gas and energy prices](problems/gas-prices/) | "We can't afford gas", "Please crash the oil price" |
| [Health care costs](problems/health-care-costs/) | "I can't afford my meds without insurance" |
| [Jobs, layoffs and pay](problems/jobs-and-layoffs/) | "They've cut everyone's hours… paycheck to paycheck again" |
| [Fraud and waste in government spending](problems/government-fraud/) | "No one is complaining about the damn fraud happening" |
| [Financial literacy](problems/financial-literacy/) | Too many people never learned how money works |

## Ground rules

- **No blame, just solutions.** Name problems, not enemies.
- **Back up facts with sources.** Ideas are welcome without sources, as long as they're labeled as ideas.
- **No naming or targeting private people.** Read [MODERATION.md](MODERATION.md).
- Everything merges through review. Nothing lands on `main` without a maintainer.

## License

Written content is licensed under [CC BY 4.0](LICENSE-CONTENT) and code under [MIT](LICENSE).
By contributing you agree to license your contribution the same way.

## The site

**Live: https://townhall.bigpicsolutions.com**

[`site/`](site/) is the public page: people say what they're struggling with, back the fixes they believe in,
and AI drafts new fixes every 6 hours from what people said. The page itself is the megaphone: anyone can see
what people are hurting from and what they believe should happen, with the numbers behind it.

| Piece | What |
|---|---|
| `site/public/` | The page (`index.html`, `app.js`, `styles.css`) and `problems.json` |
| `site/src/worker.js` | Cloudflare Worker: `/api/board`, `/api/voice`, `/api/idea`, `/api/back`, the AI post screen and the AI drafting cron |
| `site/schema.sql` | D1 tables: `voices`, `ideas`, `backs` |
| `site/scripts/sync-problems.py` | Rebuilds `problems.json` and `seed.sql` from `problems/` |
| `site/scripts/review.py` | Reviews held posts and exports the board for an AI digest |

It runs on Cloudflare's free plan (Workers, D1, Workers AI, Turnstile), like its sister project. Every write
needs a Turnstile human check. Posts get an AI screen that stops spam, private details and personal attacks,
never politics. There are per-network daily caps, duplicate posts count as backing, and no raw IPs are stored.

Deploy: `cd site && npx wrangler deploy` (Cloudflare account on thor). Collect and load new voices:
`python3 scripts/collect.py bluesky`, skim the file in `data/raw/`, then `python3 scripts/collect.py ingest <file> --live`
(the admin token lives in `~/.config/town-hall/admin-token`, never in the repo).

Run it locally:

```sh
cd site && cp .dev.vars.example .dev.vars
npx wrangler d1 execute town-hall --local --file schema.sql && npx wrangler d1 execute town-hall --local --file seed.sql
npx wrangler dev --test-scheduled   # /__scheduled triggers the AI drafting job
```

## Running the checker

There's nothing to deploy. The repo is the product. To check a submission locally:

```sh
python3 scripts/check_submission.py --files problems/<problem>/solutions/<file>.md
python3 scripts/check_submission.py --all
```
