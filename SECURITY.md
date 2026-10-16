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
