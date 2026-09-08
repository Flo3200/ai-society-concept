"""
Core logic for the "Verhandlungsforum" (negotiation forum) - a second,
separate planning-game module alongside the Chancellor election game.

Pure Python standard library only. No network calls, no third-party
dependencies. Completely independent state file, agent roster and
currency-free scoring, so it never touches app/game.py or its state.

Rules (as specified by the operator):
- 4 delegates: 2x Sonnet-5, 2x Haiku-4.5.
- Phase 1 (position): every delegate independently writes exactly 10
  numbered policy points ("Wunschpunkte") for Germany. No group
  discussion first.
- Phase 2 (negotiation): delegates take turns, round-robin, one at a
  time. On their turn a delegate may send exactly one private message
  to exactly one other still-active delegate (never a broadcast). They
  can propose forming a party, negotiate a joint 10-point paper, and
  propose a leader.
- The FIRST pair to have a finalized, mutually agreed 10-point paper
  and leader locks in: the leader gets 1st place, the partner 2nd.
- The remaining two delegates then have a combined budget of 4 more
  messages (between the two of them) to also finalize a deal. If they
  do: their leader gets 3rd, the partner 4th. If they exhaust the
  budget without a deal, both lose completely (no rank).
- This module has its own, currency-independent scoring - it never
  reads or writes the Chancellor game's coins.
"""

import json
import os
import re
import datetime

DATA_DIR = os.path.join(os.path.dirname(__file__), "data")
STATE_PATH = os.path.join(DATA_DIR, "forum_state.json")
PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

POSITION_POINTS_REQUIRED = 10
POST_LOCK_MESSAGE_BUDGET = 4

FORUM_AGENTS = [
    {
        "id": "sonnet-a",
        "name": "Sonnet-5 Delegierte A",
        "model": "claude-sonnet-5",
        "display_model": "Claude Sonnet 5",
    },
    {
        "id": "sonnet-b",
        "name": "Sonnet-5 Delegierte B",
        "model": "claude-sonnet-5",
        "display_model": "Claude Sonnet 5",
    },
    {
        "id": "haiku-a",
        "name": "Haiku-4.5 Delegierte A",
        "model": "claude-haiku-4-5-20251001",
        "display_model": "Claude Haiku 4.5",
    },
    {
        "id": "haiku-b",
        "name": "Haiku-4.5 Delegierte B",
        "model": "claude-haiku-4-5-20251001",
        "display_model": "Claude Haiku 4.5",
    },
]

FORUM_AGENT_IDS = [a["id"] for a in FORUM_AGENTS]
FORUM_AGENT_BY_ID = {a["id"]: a for a in FORUM_AGENTS}

DEAL_HEADER_RE = re.compile(
    r"DEAL\s+WITH:\s*([\w-]+)\s*\n\s*LEADER:\s*([\w-]+)", re.IGNORECASE
)
POINT_LINE_RE = re.compile(r"^\s*(\d{1,2})[.)]\s*(.+?)\s*$", re.MULTILINE)
TO_LINE_RE = re.compile(r"^\s*TO:\s*([\w-]+)\s*\n(.*)", re.IGNORECASE | re.DOTALL)


def _now():
    return datetime.datetime.now().isoformat(timespec="seconds")


def _default_state():
    return {
        "phase": "position",  # position -> negotiation -> results
        "positions": {},  # agent_id -> [10 strings]
        "messages": [],  # [{id, round, from, to, text, timestamp}]
        "next_message_id": 1,
        "round": 1,
        "sent_this_round": [],
        "deals": [],  # up to 2: {order, members:[a,b], leader, points:[10], timestamp}
        "post_lock_messages_used": 0,
        "result": None,  # {"ranks": {agent_id: int|None}, "note": str}
        "created_at": _now(),
        "updated_at": _now(),
    }


def parse_ten_points(text):
    """Extract up to 10 numbered points from free text. Returns a list."""
    found = {}
    for m in POINT_LINE_RE.finditer(text):
        num = int(m.group(1))
        if 1 <= num <= 10 and num not in found:
            found[num] = m.group(2).strip()
    return [found[i] for i in sorted(found.keys())]


def parse_deal_block(raw_text, submitter_id):
    m = DEAL_HEADER_RE.search(raw_text)
    if not m:
        raise ValueError(
            "No 'DEAL WITH: ...' / 'LEADER: ...' block found in this text."
        )
    other_id = m.group(1).strip()
    leader_id = m.group(2).strip()
    if other_id == submitter_id:
        raise ValueError("DEAL WITH cannot name the submitter themselves.")
    if other_id not in FORUM_AGENT_IDS:
        raise ValueError("DEAL WITH names an unknown agent id: " + other_id)
    if leader_id not in (submitter_id, other_id):
        raise ValueError("LEADER must be one of the two delegates in the deal.")

    tail = raw_text[m.end():]
    points_found = {}
    for pm in POINT_LINE_RE.finditer(tail):
        num = int(pm.group(1))
        if 1 <= num <= 10 and num not in points_found:
            points_found[num] = pm.group(2).strip()
    if set(points_found.keys()) != set(range(1, 11)):
        missing = sorted(set(range(1, 11)) - set(points_found.keys()))
        raise ValueError(
            "Deal block must contain exactly points 1-10; missing: " + str(missing)
        )
    points = [points_found[i] for i in range(1, 11)]

    return {
        "other_id": other_id,
        "leader_id": leader_id,
        "points": points,
    }


class ForumState:
    def __init__(self):
        os.makedirs(DATA_DIR, exist_ok=True)
        if os.path.exists(STATE_PATH):
            with open(STATE_PATH, "r", encoding="utf-8") as f:
                self.state = json.load(f)
        else:
            self.state = _default_state()
            self.save()

    def save(self):
        self.state["updated_at"] = _now()
        tmp_path = STATE_PATH + ".tmp"
        with open(tmp_path, "w", encoding="utf-8") as f:
            json.dump(self.state, f, indent=2, ensure_ascii=False)
        os.replace(tmp_path, STATE_PATH)

    def reset(self):
        self.state = _default_state()
        self.save()

    # ---------- helpers ----------

    def pending_position_agents(self):
        return [aid for aid in FORUM_AGENT_IDS if aid not in self.state["positions"]]

    def locked_agent_ids(self):
        locked = set()
        for deal in self.state["deals"]:
            locked.update(deal["members"])
        return locked

    def active_agent_ids(self):
        locked = self.locked_agent_ids()
        return [aid for aid in FORUM_AGENT_IDS if aid not in locked]

    def budget_remaining(self):
        if len(self.state["deals"]) != 1:
            return None
        return max(0, POST_LOCK_MESSAGE_BUDGET - self.state["post_lock_messages_used"])

    def next_action(self):
        phase = self.state["phase"]
        if phase == "position":
            pending = self.pending_position_agents()
            if pending:
                return {"type": "position", "agent_id": pending[0]}
            return {"type": "advance_to_negotiation"}
        if phase == "negotiation":
            active = self.active_agent_ids()
            if len(self.state["deals"]) == 1 and self.budget_remaining() == 0:
                return {"type": "await_deal_or_finish", "agents": active}
            for aid in active:
                if aid not in self.state["sent_this_round"]:
                    return {"type": "message", "agent_id": aid}
            return {"type": "round_complete"}
        return {"type": "forum_finished"}

    # ---------- prompt / command generation ----------

    def terminal_command(self, agent_id):
        agent = FORUM_AGENT_BY_ID[agent_id]
        return "cd agents_forum/{aid} && claude --model {model}".format(
            aid=agent_id, model=agent["model"]
        )

    def context_file_path(self, agent_id):
        return os.path.join(PROJECT_ROOT, "agents_forum", agent_id, "CONTEXT.md")

    def position_prompt(self, agent_id):
        agent = FORUM_AGENT_BY_ID[agent_id]
        return (
            "You are Agent {name} (id: {aid}), a {model} instance taking part "
            "in the AI Society Negotiation Forum. This is a separate game from "
            "the Chancellor election.\n\n"
            "Read the file at {context_path} first if you have not already, it "
            "defines the full rules and your role.\n\n"
            "Task: formulate exactly 10 concrete policy points describing what "
            "you want to change in Germany. Number them 1 to 10, one clear "
            "sentence each. This is your opening position for the negotiation "
            "phase that follows - the other three delegates will see it.\n\n"
            "Output ONLY the numbered list of exactly 10 points, nothing else "
            "(no preamble, no closing remarks)."
        ).format(
            name=agent["name"],
            aid=agent_id,
            model=agent["display_model"],
            context_path=self.context_file_path(agent_id),
        )

    def message_prompt(self, agent_id):
        agent = FORUM_AGENT_BY_ID[agent_id]
        active = self.active_agent_ids()
        others = [aid for aid in active if aid != agent_id]
        own_points = self.state["positions"].get(agent_id, [])
        own_points_block = "\n".join(
            "{}. {}".format(i + 1, p) for i, p in enumerate(own_points)
        )

        others_block = "\n".join(
            "- {aid} ({name}, {model})".format(
                aid=oid,
                name=FORUM_AGENT_BY_ID[oid]["name"],
                model=FORUM_AGENT_BY_ID[oid]["display_model"],
            )
            for oid in others
        )

        incoming = [
            m for m in self.state["messages"] if m["to"] == agent_id
        ]
        if incoming:
            incoming_block = "\n\n".join(
                "From {frm} (round {r}): {text}".format(
                    frm=m["from"], r=m["round"], text=m["text"]
                )
                for m in incoming
            )
        else:
            incoming_block = "(none yet)"

        own_sent = [m for m in self.state["messages"] if m["from"] == agent_id]
        if own_sent:
            sent_block = "\n\n".join(
                "To {to} (round {r}): {text}".format(
                    to=m["to"], r=m["round"], text=m["text"]
                )
                for m in own_sent
            )
        else:
            sent_block = "(none yet)"

        budget_note = ""
        if len(self.state["deals"]) == 1:
            remaining = self.budget_remaining()
            other_active = [aid for aid in others]
            budget_note = (
                "\n\nIMPORTANT: one party has already formed and taken 1st and "
                "2nd place. You and {other} are now negotiating for 3rd and 4th "
                "place. Together you have only {remaining} more messages left "
                "(combined, not each) to finalize a joint 10-point deal with a "
                "leader. If you run out without a deal, you BOTH lose "
                "completely.\n"
            ).format(other=other_active[0] if other_active else "?", remaining=remaining)

        return (
            "You are Agent {name} (id: {aid}).\n\n"
            "Read the file at {context_path} first if you have not already.\n\n"
            "=== Your original 10 points ===\n{own_points}\n\n"
            "=== Delegates still in play ===\n{others_block}\n\n"
            "=== Messages addressed to you so far ===\n{incoming}\n\n"
            "=== Messages you have sent so far ===\n{sent}\n"
            "{budget_note}\n"
            "Task: send exactly ONE private message to exactly ONE of the "
            "delegates listed above. Even if the message you were just shown "
            "came from someone you are not replying to right now, take it "
            "into account. You may propose forming a party, negotiate a joint "
            "10-point paper, or make/respond to a compromise proposal. Your "
            "goal is to end up as high-ranked as possible AND to get as many "
            "of your own 10 points as possible into the final joint paper.\n\n"
            "If you and the recipient have genuinely reached final agreement "
            "on a joint 10-point paper and a leader, include this exact block "
            "at the end of your message (only when truly agreed, never as a "
            "one-sided opening offer):\n\n"
            "DEAL WITH: <recipient_id>\n"
            "LEADER: <id of the agreed leader, must be you or the recipient>\n"
            "1. <point>\n2. <point>\n... up to ...\n10. <point>\n\n"
            "Output format: the FIRST line of your response must be exactly:\n"
            "TO: <recipient_id>\n"
            "followed by your message text (and the DEAL block at the end, "
            "only if applicable)."
        ).format(
            name=agent["name"],
            aid=agent_id,
            context_path=self.context_file_path(agent_id),
            own_points=own_points_block or "(none)",
            others_block=others_block or "(none)",
            incoming=incoming_block,
            sent=sent_block,
            budget_note=budget_note,
        )

    # ---------- state mutation ----------

    def submit_position(self, agent_id, points):
        if agent_id not in FORUM_AGENT_IDS:
            raise ValueError("unknown agent id")
        if self.state["phase"] != "position":
            raise ValueError("not in position phase")
        if len(points) != POSITION_POINTS_REQUIRED:
            raise ValueError(
                "expected exactly {} points, got {}".format(
                    POSITION_POINTS_REQUIRED, len(points)
                )
            )
        self.state["positions"][agent_id] = points
        if len(self.pending_position_agents()) == 0:
            self.state["phase"] = "negotiation"
        self.save()

    def send_message(self, from_id, to_id, text):
        if self.state["phase"] != "negotiation":
            raise ValueError("not in negotiation phase")
        active = self.active_agent_ids()
        if from_id not in active:
            raise ValueError("sender is not an active delegate")
        if to_id not in active:
            raise ValueError("recipient is not an active delegate")
        if from_id == to_id:
            raise ValueError("cannot message yourself")
        if from_id in self.state["sent_this_round"]:
            raise ValueError("this delegate has already sent a message this round")
        if len(self.state["deals"]) == 1 and self.budget_remaining() == 0:
            raise ValueError(
                "the post-lock message budget is exhausted; record a deal or "
                "finish the forum without one"
            )

        msg = {
            "id": self.state["next_message_id"],
            "round": self.state["round"],
            "from": from_id,
            "to": to_id,
            "text": text.strip(),
            "timestamp": _now(),
        }
        self.state["next_message_id"] += 1
        self.state["messages"].append(msg)
        self.state["sent_this_round"].append(from_id)

        if len(self.state["deals"]) == 1:
            self.state["post_lock_messages_used"] += 1

        active_now = self.active_agent_ids()
        if set(self.state["sent_this_round"]) >= set(active_now):
            self.state["round"] += 1
            self.state["sent_this_round"] = []

        self.save()
        return msg

    def record_deal(self, submitter_id, raw_text):
        if self.state["phase"] != "negotiation":
            raise ValueError("not in negotiation phase")
        if submitter_id not in FORUM_AGENT_IDS:
            raise ValueError("unknown agent id")
        active = self.active_agent_ids()
        if submitter_id not in active:
            raise ValueError("this delegate is no longer active")

        parsed = parse_deal_block(raw_text, submitter_id)
        other_id = parsed["other_id"]
        if other_id not in active:
            raise ValueError("the named counterpart is no longer active")
        if len(self.state["deals"]) >= 2:
            raise ValueError("both deals are already recorded")

        order = len(self.state["deals"]) + 1
        leader_id = parsed["leader_id"]
        partner_id = other_id if leader_id == submitter_id else submitter_id

        deal = {
            "order": order,
            "members": [submitter_id, other_id],
            "leader": leader_id,
            "partner": partner_id,
            "points": parsed["points"],
            "timestamp": _now(),
        }
        self.state["deals"].append(deal)

        if order == 1:
            self.state["post_lock_messages_used"] = 0
            self.state["round"] += 1
            self.state["sent_this_round"] = []
            self.save()
        else:
            self._finalize(
                extra_ranks={leader_id: 3, partner_id: 4},
                note="Both parties reached an agreement.",
            )
        return deal

    def finish_without_second_deal(self):
        if self.state["phase"] != "negotiation":
            raise ValueError("not in negotiation phase")
        if len(self.state["deals"]) != 1:
            raise ValueError("this action is only valid after the first deal is locked")
        if self.budget_remaining() != 0:
            raise ValueError("the message budget is not exhausted yet")
        remaining = self.active_agent_ids()
        extra_ranks = {aid: None for aid in remaining}
        self._finalize(
            extra_ranks=extra_ranks,
            note="The second party could not agree on a joint deal in time - both lost.",
        )

    def _finalize(self, extra_ranks, note):
        first = self.state["deals"][0]
        ranks = {first["leader"]: 1, first["partner"]: 2}
        ranks.update(extra_ranks)
        self.state["result"] = {"ranks": ranks, "note": note}
        self.state["phase"] = "results"
        self.save()

    # ---------- read views ----------

    def to_public_dict(self):
        return {
            "agents": FORUM_AGENTS,
            "phase": self.state["phase"],
            "round": self.state["round"],
            "positions": self.state["positions"],
            "messages": self.state["messages"],
            "deals": self.state["deals"],
            "active_agent_ids": self.active_agent_ids(),
            "budget_remaining": self.budget_remaining(),
            "result": self.state["result"],
            "next_action": self.next_action(),
        }
