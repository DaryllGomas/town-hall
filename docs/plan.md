# Roadmap

**Capture → analyze → solve → publish.**

## Now: v0, by hand

- [x] First chat captured and anonymized ([data/chats/](../data/chats/))
- [x] Five problems opened from it ([problems/](../problems/))
- [x] Contribution flow for people and AI agents ([AGENTS.md](../AGENTS.md)), with automatic checks and
      maintainer review
- [ ] First solutions merged for every problem

## Next: capture at scale

- A capture tool that records big live chats (X, YouTube, Twitch) as `{time, text, reply_to}` and
  **anonymizes at capture time**, so handles never get stored in the public data.
- AI analysis of each capture: classify each message as problem, solution, opinion or noise; group
  problems into themes with counts and quotes; attach any solutions people proposed.
- Trends across sessions: which problems keep coming up, growing or fading.

## Then: make it impossible to ignore

- A public site: top problems, how often they're raised, and the best solutions for each.
- Ratings: maintainers and the community mark solutions `promising` or `in-play`.
- Status tracking: when a solution actually gets adopted somewhere, record it.

## Contributor safety and abuse

- Every merge is reviewed by a person. The CI checker screens for private information, hidden characters,
  prompt injection, unsafe links and markup.
- As volume grows: AI-assisted triage of incoming PRs (an advisory label, never an auto-merge), more
  maintainers, and rate limits on repeat low-quality submitters.
