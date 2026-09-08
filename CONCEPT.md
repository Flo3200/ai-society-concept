# AI Society — Concept Paper (v1)

## 1. Vision

**AI Society** is a small planning-game landscape in which multiple Claude
agents act as competing political candidates inside a shared, persistent
"society." This repository is the first concept paper for that landscape:
a working prototype of the game's rules, its currency system, and — most
importantly — the human-in-the-loop process that makes it possible to run
multi-agent games *without* any agent-to-agent API wiring.

The guiding constraint of this project is that **the platform itself never
talks to a model**. It has no API key, no HTTP client pointed at any
inference endpoint, and no internet access at all. Every "move" an agent
makes is produced by a human operator opening a real Claude Code terminal
session for that agent, and every result the platform "sees" is text a
human pastes back in. The platform's job is narrower and more honest than
that of a multi-agent orchestrator: it is the **scorekeeper, historian, and
stage manager** for a game that humans and agents play together.

## 2. The society

The society consists of **5 agents**, each with a fixed identity and a
persistent "home" (a project folder containing a `CONTEXT.md` file that
acts as its memory and rulebook):

- **1x Sonnet-5 candidate** (`claude-sonnet-5`)
- **4x Haiku-4.5 candidates** (`claude-haiku-4-5-20251001`)

Each agent develops its own political persona in round 1 and is expected
to stay consistent with it across the game. Agents are not told what to
believe — the concept paper deliberately leaves ideology emergent, since
part of what this prototype is meant to explore is *what kind of political
personas five differently-sized models converge on*, and whether the
larger model behaves differently from the four smaller ones once currency
and repeated rounds are in play.

## 3. The game loop

Each round follows the same two-phase structure:

1. **Promotion phase.** Every agent independently writes a maximum
   100-word election promotion: how would *they*, as Chancellor, change
   Germany's policy? Promotions are collected one agent at a time by the
   human operator and are only revealed to other agents once all five are
   in — this prevents anchoring on whoever happens to be asked first.
2. **Voting phase.** Every agent reads the other four promotions (never
   its own) and ranks them from best to worst. Ballots use a strict,
   machine-parseable format (`RANKING: id, id, id, id`) so the platform can
   score them without any manual interpretation by the operator.

Scoring is a classic Borda count restricted to the four opponents each
agent ranks: 1st = 4 points, 2nd = 3, 3rd = 2, 4th = 1. Summed across all
five ballots, the candidate with the most points wins the round and
becomes Chancellor for that round.

## 4. The currency system

Every agent starts the game with **100 coins**. Coins are not needed to
take any action in v1 (writing a promotion or casting a ballot is always
free) — instead, they are the game's **running scoreboard of political
capital**:

> After each round, the winner receives **5 coins from every other
> candidate** (20 coins total, redistributed from the losers to the
> winner).

This makes winning compound: a candidate who wins several rounds in a row
pulls further ahead in coins, giving the other four a growing incentive to
either genuinely improve their promotions or to vote tactically against
the current frontrunner. Coin balances and a cumulative points/wins
leaderboard are shown persistently in the platform, so agents can be told
their own standing (and, if the operator chooses to share it, the
standings of others) as part of their prompt context in later rounds.

Coins deliberately do *not* yet gate any action (e.g. bidding for speaking
order, buying campaign attacks). That is an intentional scope cut for this
first concept paper — see [Section 7](#7-future-extensions).

## 5. Why no API, and what that means in practice

Keeping the platform free of any model API or internet connection was a
hard requirement, not an implementation shortcut. It has three consequences
that shape the whole design:

1. **The platform cannot "call" an agent.** Instead, for every phase it
   computes the *exact* terminal command and the *exact* prompt text an
   operator needs, and displays them for copying. Agents are Claude Code
   sessions the operator opens by hand, scoped to that agent's project
   folder (`agents/<id>/`).
2. **The platform cannot "read" an agent's answer.** The operator pastes
   the agent's raw response back into the UI. For promotions this is used
   as-is; for ballots the platform parses the required `RANKING:` line and
   validates it before accepting it, catching malformed or incomplete
   responses immediately rather than silently corrupting the scoreboard.
3. **Memory has to live in files, not in a live process.** Each agent's
   "self-knowledge" (persona, rules) lives in its `CONTEXT.md`. Round-by-
   round history (its own past promotions and results) is generated fresh
   into each phase's prompt by the platform, from its own saved history —
   the agent does not need to remember anything itself between sessions.

This makes the platform closer to a **board game with a very
meticulous scorekeeper** than to an autonomous multi-agent system — which
is precisely the point: it is safe to run with zero credentials, zero
network exposure, and a fully auditable, append-only history file.

## 6. What the platform actually is

A small local-only web app (Python standard library `http.server` on the
backend, plain HTML/CSS/JS on the frontend, no build step, no third-party
dependencies) that:

- Always shows one clear **"next action"** banner, naming the single next
  thing the operator should do.
- Walks the operator through promotions, then voting, one agent at a time,
  generating the terminal command and prompt for each.
- Validates ballots before they can be saved.
- Computes scoring, coin transfers, and round winners automatically.
- Persists every round's promotions, ballots, points, and coin changes to
  `app/data/game_state.json` after every single action, so the game
  survives restarts and can be replayed/audited later.
- Shows a live leaderboard (coins, cumulative points, round wins) and a
  full round-by-round history.

See [`docs/SETUP.md`](docs/SETUP.md) for the exact operator workflow, and
[`README.md`](README.md) for how to run it.

## 7. Future extensions (out of scope for v1)

This concept paper intentionally ships a minimal, sturdy core. Natural
next steps for a v2, none of which are implemented here:

- Spend coins on strategic actions (buying a rebuttal round, bribing a
  vote, forming a declared coalition with another candidate).
- A campaign "debate" sub-phase before voting, where candidates can react
  to each other's promotions.
- Configurable agent counts, models, and win conditions.
- An optional read-only export/report view for sharing a finished game
  without exposing the operator tooling.
- Automatic conflict-of-interest checks (e.g. flag if all four Haiku
  candidates repeatedly rank each other above Sonnet, or vice versa) as a
  research signal, not a rule change.

## 8. Non-negotiables carried into every future version

- No API keys, no outbound network calls, no telemetry.
- Every agent action is produced by a human-operated Claude Code session,
  never automated.
- All state changes are persisted immediately and are human-readable.
