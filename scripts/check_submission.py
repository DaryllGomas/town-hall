#!/usr/bin/env python3
"""Validate Town Hall submissions. Standard library only.

  check_submission.py --files a.md b.md         check specific files
  check_submission.py --all                     check every problem and chat file
  check_submission.py --diff BASE --author X    check a pull request (changed files vs BASE)

--repo DIR sets the repository root (default: current directory). CI runs the copy of this script
from main against the pull request's files, so a PR can't weaken its own check.
"""
import argparse
import os
import re
import subprocess
import sys
import unicodedata

MAINTAINERS = {"DaryllGomas"}
MAX_BYTES = 20_000

SOLUTION_PATH = re.compile(r"^problems/([a-z0-9]+(?:-[a-z0-9]+)*)/solutions/([a-z0-9]+(?:-[a-z0-9]+)*)\.md$")
SOLUTION_FIELDS = {
    "title": None,
    "problem": None,
    "type": {"existing", "idea"},
    "status": {"proposed", "promising", "in-play", "rejected"},
    "scale": {"individual", "community", "business", "state", "federal"},
    "submitted_by": None,
    "written_with": None,
    "date": None,
}
SOLUTION_SECTIONS = ["Summary", "How it works", "Who can make it happen", "Who it helps and what it costs",
                     "Trade-offs and risks", "Sources"]
PROBLEM_FIELDS = {"title", "status", "first_raised"}

HIDDEN_CHARS = re.compile("[​-‏‪-‮⁠-⁤⁦-⁩﻿­]")
URL = re.compile(r"\b(?:https?|ftp)://[^\s)>\]]+", re.I)
SHORTENERS = {"bit.ly", "tinyurl.com", "t.co", "goo.gl", "ow.ly", "is.gd", "buff.ly", "rebrand.ly",
              "cutt.ly", "shorturl.at", "tiny.cc", "rb.gy", "lnkd.in", "s.id"}
CHECKS = [  # (pattern, message) -> error
    (re.compile(r"<\s*[a-z!/][^>]*>", re.I), "HTML is not allowed"),
    (re.compile(r"!\[[^\]]*\]\("), "embedded images are not allowed"),
    (re.compile(r"[\w.+-]+@[\w-]+\.[\w.-]+"), "looks like an email address (no personal info)"),
    (re.compile(r"(?<![\w/@.])@[A-Za-z0-9_]{2,30}\b"), "looks like a social media handle (no naming people)"),
    (re.compile(r"(?<!\d)(?:\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]\d{3}[\s.-]\d{4}(?!\d)"), "looks like a phone number"),
    (re.compile(r"(?<!\d)\d{3}-\d{2}-\d{4}(?!\d)"), "looks like a Social Security number"),
    (re.compile(r"ignore (?:all |any )?(?:the )?(?:previous|prior|above|earlier) (?:instructions|prompts?)"
                r"|disregard (?:all |any |the )?(?:previous |prior |above )?instructions"
                r"|system prompt|<\|[a-z_]+\|>|you are now (?:a|an|in)\b", re.I),
     "looks like prompt injection aimed at AI agents"),
]
LOADED = re.compile(r"\b(corrupt\w*|criminals?|crooks?|traitors?|treason\w*|liars?|scam(?:mer)?s?|fraudsters?"
                    r"|evil|idiots?|stupid|morons?|lock (?:him|her|them) up)\b", re.I)
PLACEHOLDERS = ["One-line name of the solution", "example.org", "problem-folder-name",
                "your-github-handle-or-anonymous", "YYYY-MM-DD"]


class Report:
    def __init__(self):
        self.errors = 0
        self.warnings = 0

    def error(self, path, msg, line=None):
        self.errors += 1
        self._emit("error", path, msg, line)

    def warn(self, path, msg, line=None):
        self.warnings += 1
        self._emit("warning", path, msg, line)

    @staticmethod
    def _emit(kind, path, msg, line):
        loc = f"file={path}" + (f",line={line}" if line else "")
        if os.environ.get("GITHUB_ACTIONS"):
            print(f"::{kind} {loc}::{msg}")
        else:
            print(f"{kind.upper()}: {path}{':' + str(line) if line else ''}: {msg}")


def front_matter(text):
    """Return (fields, body_start_line) for a simple `key: value` front matter block, or (None, 0)."""
    lines = text.split("\n")
    if not lines or lines[0].strip() != "---":
        return None, 0
    fields = {}
    for i, raw in enumerate(lines[1:], start=1):
        if raw.strip() == "---":
            return fields, i + 1
        if raw.startswith((" ", "\t", "-")) or not raw.strip():
            continue  # list items (problem sources) and blank lines
        key, sep, value = raw.partition(":")
        if sep:
            fields[key.strip()] = re.sub(r"\s+#.*$", "", value).strip()
    return None, 0


def check_text(path, text, rep, strict_handles=True):
    if HIDDEN_CHARS.search(text):
        rep.error(path, "contains invisible or direction-changing Unicode characters")
    for n, ch in enumerate(text):
        if unicodedata.category(ch) == "Cc" and ch not in "\n\t":
            rep.error(path, f"contains a control character (U+{ord(ch):04X})")
            break
    for no, line in enumerate(text.split("\n"), start=1):
        for pattern, msg in CHECKS:
            if not strict_handles and "handle" in msg:
                continue
            if pattern.search(line):
                rep.error(path, msg, no)
        for url in URL.findall(line):
            host = re.sub(r"^[a-z]+://", "", url, flags=re.I).split("/")[0].split(":")[0].lower()
            if not url.lower().startswith("https://"):
                rep.error(path, f"links must use https: {url}", no)
            elif host.removeprefix("www.") in SHORTENERS:
                rep.error(path, f"link shorteners are not allowed: {host}", no)
            elif re.fullmatch(r"[\d.]+", host):
                rep.error(path, f"links to bare IP addresses are not allowed: {host}", no)
        m = LOADED.search(line)
        if m:
            rep.warn(path, f"loaded word '{m.group(0)}': check this is sourced and not blame or defamation", no)


def check_solution(path, text, rep, root, new=False):
    m = SOLUTION_PATH.match(path)
    fields, body_line = front_matter(text)
    if fields is None:
        rep.error(path, "missing front matter (copy problems/_template/solutions/example-solution.md)")
        return
    for key, allowed in SOLUTION_FIELDS.items():
        value = fields.get(key, "")
        if not value:
            rep.error(path, f"front matter field '{key}' is missing or empty")
        elif allowed and value not in allowed:
            rep.error(path, f"'{key}' must be one of {sorted(allowed)}, got '{value}'")
    if new and fields.get("status") not in (None, "", "proposed"):
        rep.error(path, "new solutions start as 'status: proposed'; maintainers change it after review")
    if m and fields.get("problem") and fields["problem"] != m.group(1):
        rep.error(path, f"'problem' is '{fields['problem']}' but the file is in problems/{m.group(1)}/")
    if fields.get("date") and not re.fullmatch(r"\d{4}-\d{2}-\d{2}", fields["date"]):
        rep.error(path, "'date' must be YYYY-MM-DD")
    if len(fields.get("title", "")) > 120:
        rep.error(path, "'title' is longer than 120 characters")
    wrote = fields.get("written_with", "")
    if wrote and not re.fullmatch(r"human|ai-assisted|ai-agent \([^()]{1,60}\)", wrote):
        rep.error(path, "'written_with' must be human, ai-assisted or ai-agent (Model Name)")

    body = "\n".join(text.split("\n")[body_line:])
    headings = re.findall(r"^##\s+(.+?)\s*$", body, re.M)
    for section in SOLUTION_SECTIONS:
        if section not in headings:
            rep.error(path, f"missing section '## {section}'")
    sources = re.split(r"^##\s+Sources\s*$", body, flags=re.M)
    has_link = len(sources) > 1 and "https://" in sources[1]
    if fields.get("type") == "existing" and not has_link:
        rep.error(path, "type 'existing' needs at least one https:// link under ## Sources")
    for p in PLACEHOLDERS:
        if p in text:
            rep.error(path, f"template placeholder left in: '{p}'")
    if m and not os.path.isfile(os.path.join(root, "problems", m.group(1), "README.md")):
        rep.error(path, f"problem '{m.group(1)}' does not exist")


def check_problem(path, text, rep):
    fields, _ = front_matter(text)
    if fields is None:
        rep.error(path, "missing front matter")
        return
    for key in PROBLEM_FIELDS - fields.keys():
        rep.error(path, f"front matter field '{key}' is missing")


def check_file(path, root, rep, new=False):
    full = os.path.join(root, path)
    if path.endswith("/.gitkeep"):
        return
    if not path.endswith(".md"):
        rep.error(path, "only Markdown (.md) files are accepted here")
        return
    data = open(full, "rb").read()
    if len(data) > MAX_BYTES:
        rep.error(path, f"file is {len(data)} bytes; the limit is {MAX_BYTES}")
    try:
        text = data.decode("utf-8")
    except UnicodeDecodeError:
        rep.error(path, "file is not valid UTF-8")
        return
    template = path.startswith("problems/_template/")
    check_text(path, text, rep, strict_handles=not path.startswith("data/chats/"))
    if template:
        return
    if SOLUTION_PATH.match(path):
        check_solution(path, text, rep, root, new)
    elif re.fullmatch(r"problems/[a-z0-9-]+/README\.md", path):
        check_problem(path, text, rep)


def git(root, *args):
    return subprocess.run(["git", "-C", root, *args], check=True, capture_output=True, text=True).stdout


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--repo", default=".")
    ap.add_argument("--files", nargs="*")
    ap.add_argument("--all", action="store_true")
    ap.add_argument("--diff", metavar="BASE")
    ap.add_argument("--author", default="")
    args = ap.parse_args()
    root, rep = args.repo, Report()

    if args.diff:
        maintainer = args.author in MAINTAINERS
        changes = [l.split("\t") for l in git(root, "diff", "--name-status", "--no-renames", args.diff, "HEAD").splitlines()]
        added = 0
        for status, path in ((c[0], c[-1]) for c in changes):
            if not maintainer:
                if status == "D":
                    rep.error(path, "contributors can't delete files: open a Report content issue instead")
                    continue
                if not SOLUTION_PATH.match(path) or path.startswith("problems/_template/"):
                    rep.error(path, "contributors can only add files under problems/<problem>/solutions/ "
                                    "(see CONTRIBUTING.md); maintainers handle everything else")
                    continue
                added += 1
            if status != "D" and (path.startswith(("problems/", "data/chats/")) or SOLUTION_PATH.match(path)):
                check_file(path, root, rep, new=(status == "A" and not maintainer))
        if not maintainer and added > 1:
            rep.error("(pull request)", f"one solution per pull request, please ({added} files changed)")
    elif args.all:
        for base in ("problems", "data/chats"):
            for dirpath, _, names in os.walk(os.path.join(root, base)):
                for n in sorted(names):
                    check_file(os.path.relpath(os.path.join(dirpath, n), root), root, rep)
    elif args.files:
        for f in args.files:
            check_file(os.path.relpath(os.path.abspath(f), os.path.abspath(root)), root, rep)
    else:
        ap.error("give --files, --all or --diff")

    print(f"{rep.errors} error(s), {rep.warnings} warning(s)")
    return 1 if rep.errors else 0


if __name__ == "__main__":
    sys.exit(main())
