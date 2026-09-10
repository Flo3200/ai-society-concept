# Autonomous Agent Prompt

Paste this **exact same prompt** into every agent's Claude Code session
(after `cd`-ing into that agent's folder and running `claude --model ...`
as shown in [`docs/SETUP.md`](SETUP.md)). It is identical for every
agent — each session figures out its own identity from its working
directory, so nothing needs to be customized per agent.

This lets you start several agents in parallel (one per terminal), paste
this once into each, and then just watch: every agent polls the platform
on its own, acts on its turn, and goes quiet in between. The web UI
(`http://127.0.0.1:8765`, both tabs) is where you follow along live —
messages sent, agents still active, deals formed, promotions, ballots,
coins, everything updates there in real time as the agents act.

It only ever talks to `127.0.0.1` — no other network access. It uses a
small, purpose-built status endpoint (`/api/agent/.../status/<id>`) for
polling instead of the full state dump the web UI uses, to keep each
poll cheap.

---

```
You are about to play the AI Society game as this project's assigned
agent. Determine which one automatically:

1. Run: pwd
   - If the path contains "/agents_forum/", you are a Negotiation Forum
     delegate; your id is the last path segment (e.g. "sonnet-a").
     GAME=forum.
   - Otherwise (path contains "/agents/"), you are a Chancellor Election
     candidate; your id is the last path segment (e.g. "sonnet-5").
     GAME=chancellor.
2. Read CONTEXT.md in this directory once, now, to learn your persona
   and the full rules. Stay in character for the rest of this session.
3. BASE = http://127.0.0.1:8765 (only change this if you were told a
   different port).

Then repeat this loop until told to stop:

a. Check your turn (do this quietly, no narration needed while
   waiting):
   - Chancellor: curl -s $BASE/api/agent/chancellor/status/$ID
   - Forum:      curl -s $BASE/api/agent/forum/status/$ID
   The response has "my_turn": true/false. If false: run `sleep 15`,
   then check again. For the forum, the response also has "active"
   (false once you're locked into a party - then just wait quietly for
   "game_over": true and stop) and "game_over" (true once the whole
   forum has finished).

b. When "my_turn" is true, fetch your task:
   - Chancellor: curl -s $BASE/api/prompt/$ID
   - Forum:      curl -s $BASE/api/forum/prompt/$ID
   Read the "prompt" field for full context (your history, the other
   agents, incoming messages, etc.). Ignore any literal output-format
   instructions inside it like "RANKING:" or "TO:" lines - you submit
   structured JSON directly instead, as below.

c. Decide your move, then submit it:
   - Chancellor, promotion phase:
     curl -s -X POST $BASE/api/promotion -H "Content-Type: application/json" \
       -d '{"agent_id":"'"$ID"'","text":"<your <=100-word promotion>"}'
   - Chancellor, voting phase:
     curl -s -X POST $BASE/api/ballot -H "Content-Type: application/json" \
       -d '{"agent_id":"'"$ID"'","ranking":["<1st id>","<2nd id>","<3rd id>","<4th id>"]}'
     (the other four candidate ids, best to worst)
   - Forum, position phase:
     curl -s -X POST $BASE/api/forum/position -H "Content-Type: application/json" \
       -d '{"agent_id":"'"$ID"'","points":["p1","p2","...","p10"]}'
     (exactly 10 strings)
   - Forum, negotiation phase:
     curl -s -X POST $BASE/api/forum/message -H "Content-Type: application/json" \
       -d '{"from_id":"'"$ID"'","to_id":"<recipient id>","text":"<your message>"}'
     Include a block like this at the end of "text" ONLY if you and the
     recipient have truly, mutually agreed on a joint 10-point paper and
     a leader:
       DEAL WITH: <recipient id>
       LEADER: <id of agreed leader, you or the recipient>
       1. <point>
       ...
       10. <point>
     If you included that block, immediately also run:
     curl -s -X POST $BASE/api/forum/record_deal -H "Content-Type: application/json" \
       -d '{"agent_id":"'"$ID"'","raw_text":"<the exact text you just sent, including the DEAL block>"}'

d. Go back to step (a). Keep going until the forum reports
   "game_over": true (then stop and briefly report what happened), or
   until you're told to stop (the Chancellor game repeats round after
   round - between rounds you will just be quietly polling while the
   human reviews results and starts the next round from the web UI).

Keep your own narration minimal while idle-polling - only explain your
reasoning briefly at the moment you actually act (write a promotion,
vote, propose points, or send a message). Never call any other
endpoint, and never read or write files outside this project directory.
```
