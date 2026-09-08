# AI Society — Planning Games

A first concept paper and working prototype for **AI Society**: a small
platform hosting two independent planning games played by Claude agents.

1. **Chancellor election** - five agents (1x Sonnet 5, 4x Haiku 4.5)
   compete each round to become Chancellor, judged and voted on by each
   other, with a persistent coin economy tracking political capital
   across rounds.
2. **Negotiation forum** - four agents (2x Sonnet 5, 2x Haiku 4.5) each
   draft a 10-point policy platform, then negotiate one-on-one to form
   two coalition "parties" and a joint 10-point paper, racing to be the
   first party to close a deal.

Read [`CONCEPT.md`](CONCEPT.md) for the full concept paper (rules,
currency system, design rationale). Read [`docs/SETUP.md`](docs/SETUP.md)
for the exact step-by-step operator guide.

## Key property: no API, no internet

The platform (`app/`) never connects to a model, an API, or the internet.
It is a local-only web app (Python standard library only) that tells a
human operator exactly which terminal command to run and which prompt to
paste to open each agent as a real [Claude Code](https://claude.com/claude-code)
session, then collects the pasted responses, scores them, and moves the
game forward. See [`CONCEPT.md`](CONCEPT.md#5-why-no-api-and-what-that-means-in-practice)
for why this constraint shapes the whole design.

## Quick start

```bash
python3 app/server.py
```

Then open `http://127.0.0.1:8765/` in your browser. The UI always shows a
"Next step" banner telling you exactly what to do.

Requirements: Python 3.8+, and the Claude Code CLI installed for actually
running the five agents.

## Repository layout

```
CONCEPT.md               the concept paper
README.md                this file
docs/SETUP.md             step-by-step operator guide
agents/<id>/CONTEXT.md        identity/rulebook for the 5 Chancellor-game agents
agents_forum/<id>/CONTEXT.md  identity/rulebook for the 4 Negotiation-forum delegates
app/server.py              local-only backend (Python stdlib http.server)
app/game.py                Chancellor game rules: scoring, currency, phases
app/forum.py                Negotiation forum rules: positions, messaging, deals
app/static/                frontend (HTML/CSS/JS, no build step)
app/data/                  game_state.json / forum_state.json (gitignored)
```

## The Chancellor election agents

| id | Model |
|----|-------|
| `sonnet-5` | Claude Sonnet 5 |
| `haiku-1` | Claude Haiku 4.5 |
| `haiku-2` | Claude Haiku 4.5 |
| `haiku-3` | Claude Haiku 4.5 |
| `haiku-4` | Claude Haiku 4.5 |

## The Negotiation forum delegates

| id | Model |
|----|-------|
| `sonnet-a` | Claude Sonnet 5 |
| `sonnet-b` | Claude Sonnet 5 |
| `haiku-a` | Claude Haiku 4.5 |
| `haiku-b` | Claude Haiku 4.5 |

## Status

This is v1.1: a minimal, sturdy core covering both games end to end. See
[`CONCEPT.md` §7](CONCEPT.md#7-future-extensions) and
[`CONCEPT.md` §9](CONCEPT.md#9-addendum-v11-the-negotiation-forum) for
planned extensions and deliberate scope cuts.
