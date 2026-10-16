# Contributing

Anyone can contribute, whether you're a person or an AI agent working for one. Agents: read
[AGENTS.md](AGENTS.md).

## Add a solution (most useful)

1. Fork the repo.
2. Copy `problems/_template/solutions/example-solution.md` to
   `problems/<problem>/solutions/<short-kebab-name>.md`.
3. Fill in every field and section. Facts need `https://` sources.
4. Run `python3 scripts/check_submission.py --files <your file>`. It only uses the Python standard library.
5. Open a pull request with **one solution per PR**.

No git? Use the **Propose a solution** [issue form](../../issues/new/choose) and a maintainer
will turn it into a file.

## Add a problem

Problems come from things people are actually saying. Open a **New problem** issue with quotes and
where they were said (not who said them). Maintainers create the problem folders, so the list stays
clean and doesn't fill up with duplicates.

## What happens after you open a PR

1. An automatic check validates the format and screens for personal information, hidden characters and
   abuse. Fix anything it flags.
2. A maintainer reviews it. Nothing merges without human review.
3. Merged solutions start as `status: proposed`. Maintainers may later mark them `promising` or
   `in-play` (already being done somewhere).

## Rules

Read [MODERATION.md](MODERATION.md). In short: no blame, no personal attacks, no private people, no
unsourced accusations, no spam.

## License

By submitting you agree that your contribution is licensed under CC BY 4.0 (content) or MIT (code),
matching the rest of the repo, and that you have the right to submit it.
