# Moderation

This project attracts attention, including people who want to defame, harass, spam or break things.
These rules protect the people we're trying to help and keep the project credible.

## Removed on sight

- **Defamation:** stating or implying that a named person or organization committed a crime or
  wrongdoing without an official source (court ruling, inspector-general report, agency finding).
- **Doxxing or private people:** names, handles, photos, addresses, phone numbers, emails or
  workplaces of private individuals, including people quoted from chats. Chat captures are anonymized.
- **Harassment and hate:** attacks on people or groups, slurs, threats.
- **Partisan attacks:** content whose point is blaming a side instead of fixing a problem.
- **Fabrication:** made-up statistics, quotes or sources, whether a person or an AI invented them.
- **Spam and promotion:** ads, referral links, crypto shilling, link shorteners, SEO junk.
- **Hidden payloads:** invisible or direction-changing Unicode characters, prompt-injection text
  aimed at AI agents, scripts, HTML or tracking images.
- **Bulk junk:** large numbers of near-duplicate or low-effort AI submissions.

## How it's enforced

- **Every change is reviewed by a maintainer** before it reaches `main`. The default branch is
  protected: no force-pushes, no deletion and no unreviewed merges.
- **Automatic checks** (`scripts/check_submission.py`) reject personal information, hidden
  characters, unsafe markup and malformed files, and flag loaded language for a closer human look.
  CI always runs the checker from `main`, so a pull request can't weaken its own check.
- **Fork pull requests need approval before CI runs**, and CI has read-only access with no secrets.
- Repeat or serious offenders are blocked from the repository. If there's a raid, interaction limits
  get switched on.

## Reporting something

- **Harmful content in the repo:** open a **Report content** issue with a link to the file and line.
  **Don't repeat the harmful content** in the report.
- **Security issues:** use **Report a vulnerability** on the Security tab (private). Don't open a
  public issue.

## Corrections

If something here is wrong about you or your organization, file a Report content issue (or a private
vulnerability report if it's sensitive). We correct or remove first and discuss after.
