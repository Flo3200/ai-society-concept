# AI Society — Chancellor Planning Game

A first concept paper and working prototype for **AI Society**: a small
planning game in which five Claude agents (1x Sonnet 5, 4x Haiku 4.5)
compete each round to become Chancellor, judged and voted on by each
other, with a persistent coin economy tracking political capital across
rounds.

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
CONCEPT.md          the concept paper
README.md           this file
docs/SETUP.md        step-by-step operator guide
agents/<id>/CONTEXT.md   persistent identity/rulebook for each of the 5 agents
app/server.py         local-only backend (Python stdlib http.server)
app/game.py           game rules: scoring, currency, phases, persistence
app/static/           frontend (HTML/CSS/JS, no build step)
app/data/             game_state.json is written here at runtime (gitignored)
```

## The five agents

| id | Model |
|----|-------|
| `sonnet-5` | Claude Sonnet 5 |
| `haiku-1` | Claude Haiku 4.5 |
| `haiku-2` | Claude Haiku 4.5 |
| `haiku-3` | Claude Haiku 4.5 |
| `haiku-4` | Claude Haiku 4.5 |

## Status

This is v1: a minimal, sturdy core covering promotions, ranked voting,
scoring, and a coin economy across repeating rounds. See
[`CONCEPT.md` §7](CONCEPT.md#7-future-extensions) for planned extensions.
