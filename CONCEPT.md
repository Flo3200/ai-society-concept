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

## 9. Addendum (v1.1): The Negotiation Forum

A second, independent game module alongside the Chancellor election -
same platform, same no-API/no-internet/human-in-the-loop principles, but
a different roster, different mechanic, and its own separate scoring
(it never touches the Chancellor game's coins).

**Roster.** 4 delegates instead of 5: 2x Sonnet-5, 2x Haiku-4.5. This is
a deliberate, self-contained variation for this module only - the
Chancellor election keeps its original 1x Sonnet-5 / 4x Haiku-4.5 roster
untouched.

**Phase 1 - Position.** Each delegate independently writes exactly 10
numbered policy points for Germany. No group discussion happens first -
this is a concrete platform, not a 100-word soundbite.

**Phase 2 - Negotiation.** Delegates take turns, round-robin, one at a
time. On their turn a delegate sends **exactly one private message to
exactly one other still-active delegate** - never a broadcast to the
whole group. This replaces an earlier "open talk-show debate" idea from
the design discussion, deliberately dropped in favor of private,
one-to-one dealmaking, which is closer to how real coalition talks work.
Every delegate is always shown the messages sent to them since their
last turn, even in a round where they choose to write to someone else -
so incoming offers are never silently missed.

**Forming a party.** Once two delegates have genuinely agreed on a joint
10-point paper and a leader, either of them includes a structured
`DEAL WITH: / LEADER: / 1..10.` block in their message (mirroring the
`RANKING:` line pattern from the Chancellor game - a minimal, strictly
parseable tag the platform can validate without guessing at free text).
The human operator uses this to formally record the party via a "Deal
aufzeichnen" action.

**Scoring.** With exactly 4 delegates, at most two parties can ever
form:
- The **first** party to lock in splits 1st/2nd place: leader = 1st,
  partner = 2nd.
- The two delegates *not* in that first party are automatically the
  second pairing (there is no other combination left). They share a
  **combined budget of 4 more messages** (not 4 each) to also finalize a
  deal.
  - Success: leader = 3rd, partner = 4th.
  - Budget exhausted with no deal: **both lose completely** - no rank at
    all, strictly worse than 4th place.
- Independent of rank, delegates are also told to care about how many of
  their own original 10 points survive into whichever final paper they
  end up part of - this is conveyed to them as a role-play incentive in
  the generated prompts, not tracked as an automatic score (matching
  points in free text reliably is out of scope for v1 - see below).

**Deliberate v1 scope cuts**, consistent with this being a first concept
paper rather than a finished product:
- No automatic detection of "how many of my points made it into the
  final paper" - the original 10 points and the final paper are shown
  side by side for a human (or the agents themselves) to judge
  qualitatively.
- No message-count cap during the *open* negotiation phase before the
  first deal locks - only the post-lock second pair has a hard budget.
- This module is single-shot per playthrough (no repeating rounds like
  the Chancellor election) - reset it via the UI to play again.
