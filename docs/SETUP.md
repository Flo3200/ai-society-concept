# Setup & Operator Guide

This document tells you, the **human operator**, exactly what to do to run
a session of the AI Society Chancellor game. The platform itself never
calls any model, any API, or the internet — it only tracks state and tells
you what to type and where.

## Prerequisites

- Python 3.8+ (standard library only, no `pip install` needed).
- The [Claude Code CLI](https://claude.com/claude-code) installed and
  logged in, since each "special agent" is just a Claude Code session
  scoped to one of the `agents/<id>/` folders in this repo.
- This repository cloned locally.

## 1. Start the platform

From the repository root:

```bash
python3 app/server.py
```

This starts a server bound to `127.0.0.1:8765` only — it is not reachable
from any other machine and makes no outbound network calls. Open
`http://127.0.0.1:8765/` in your browser.

Everything you do in the UI is written immediately to
`app/data/game_state.json`, so you can stop the server and restart it at
any point without losing progress.

## 2. Understand the five agents

| Agent id   | Display name             | Model                        | Project folder      |
|------------|---------------------------|-------------------------------|----------------------|
| `sonnet-5` | Sonnet-5 Candidate         | Claude Sonnet 5 (`claude-sonnet-5`) | `agents/sonnet-5/` |
| `haiku-1`  | Haiku-4.5 Candidate I       | Claude Haiku 4.5 (`claude-haiku-4-5-20251001`) | `agents/haiku-1/` |
| `haiku-2`  | Haiku-4.5 Candidate II      | Claude Haiku 4.5 | `agents/haiku-2/` |
| `haiku-3`  | Haiku-4.5 Candidate III     | Claude Haiku 4.5 | `agents/haiku-3/` |
| `haiku-4`  | Haiku-4.5 Candidate IV      | Claude Haiku 4.5 | `agents/haiku-4/` |

Each folder contains one file, `CONTEXT.md`, which is that agent's
persistent identity and rulebook. It never changes automatically — it is
the closest thing each agent has to "memory" between sessions, since every
terminal session you open is a fresh Claude Code conversation.

## 3. Running one round

The web UI always shows a **"Next step"** banner at the top telling you
exactly what to do next. The general loop is:

### Promotion phase (repeats for all 5 agents)

1. The UI highlights the next agent that still needs a promotion. Click
   its card.
2. A dialog shows you:
   - The exact terminal command to open that agent, e.g.
     ```bash
     cd agents/sonnet-5 && claude --model claude-sonnet-5
     ```
   - The exact prompt to paste into that freshly opened session.
3. Open a terminal, run the command, paste the prompt, and let the agent
   respond.
4. Copy the agent's full response and paste it into the "paste the agent's
   promotion" box in the dialog, then click **Save promotion**.
5. Close that terminal session (or leave it - it is not reused) and repeat
   for the next highlighted agent, until all 5 promotions are collected.
   The UI automatically switches to the voting phase once all 5 are in.

### Voting phase (repeats for all 5 agents)

1. Click the next highlighted agent's card.
2. The dialog shows the terminal command and a prompt that already contains
   the other four candidates' promotions, plus the required output format:
   ```
   RANKING: <1st_id>, <2nd_id>, <3rd_id>, <4th_id>
   ```
3. Run the command, paste the prompt, let the agent answer.
4. Paste the agent's **entire raw response** into the answer box. The
   platform automatically looks for the `RANKING:` line and validates it
   contains exactly the four expected candidate ids. You will see a green
   confirmation once it parses correctly, and only then can you save it.
5. Repeat for all 5 agents. Once all 5 ballots are in, the platform
   computes the round result automatically: points per candidate (4/3/2/1
   per ballot), the round winner, and the coin transfer (winner receives 5
   coins from every other candidate).

### Results & next round

The results panel shows the full scoreboard, coin changes, and this
round's promotions side by side. Click **Start Next Round** to loop back
to the promotion phase — coins and the leaderboard carry over, a fresh
round begins.

## 4. Creating the agent projects (first-time setup)

The five folders under `agents/` are already part of this repository and
already contain their `CONTEXT.md`. You do **not** need to create new
Claude Code projects from scratch — simply `cd` into the relevant folder
and run `claude` there, as shown by the platform. Claude Code will treat
that folder as the project root and can read `CONTEXT.md` directly.

If you ever want to reset an agent's persona (e.g. to start a fresh
concept-paper run), edit that agent's `CONTEXT.md` "Who you are" section
back to the generic instructions, or restore it from git.

## 5. Resetting the whole game

To wipe all rounds, coins, and history and start over, stop the server and
delete the state file:

```bash
rm app/data/game_state.json
```

The next time you start the server, a fresh game (round 1, 100 coins each)
is created automatically.
