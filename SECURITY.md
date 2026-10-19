# Security

## Reporting a vulnerability

Report it privately with **Security → Report a vulnerability** in this repository. Please don't open
a public issue. We aim to respond within a few days.

In scope: this repository's workflows, scripts and settings; ways to get content past review; ways
to attack AI agents that read this repo (for example prompt injection that gets past the checks).

## How the repo is protected

- `main` is protected by a ruleset: changes go through pull requests, the `check` status must pass,
  and there are no force-pushes or branch deletions.
- Code owner review is required for every path (`.github/CODEOWNERS`).
- GitHub Actions: read-only token by default, no repository secrets, actions pinned to full commit
  SHAs, only GitHub-authored actions allowed, and fork PRs need maintainer approval to run.
- The submission checker in CI is always taken from `main`, never from the pull request.
- Secret scanning with push protection, Dependabot alerts and Dependabot updates for actions are on.

## The site (townhall.bigpicsolutions.com)

What it stores: posts and backing keyed by a salted hash of a random browser cookie, plus a salted hash of
the IP that rotates daily (for rate limits). No raw IP addresses, emails or accounts. Posts collected from X
and Bluesky are stored as text only, with handles and links removed.

How it resists gaming:
- A Cloudflare Turnstile human check, verified on the server. A passed check earns a 30-minute pass signed
  to that browser's cookie id, so a bot that clears cookies has to pass a new check every time.
- One "me too" or "I back this" per browser per item; reposting existing text counts as backing it.
- Per-network limits: 60 requests a minute, 20 posts and 300 backs a day, 40 AI screens a day (10 per browser).
- Request size limits, a honeypot field, same-origin checks, and no links, handles or contact details in posts.
- AI instructions travel separately from what people wrote, so post text is treated as data.
- Maintainer endpoints need a secret token and return 404 without it.

If it gets gamed: tighten the limits, require Turnstile's non-interactive challenge, or add a sign-in.
