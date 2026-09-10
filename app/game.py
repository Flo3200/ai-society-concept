"""
Core game logic for the AI Society planning game.

Pure Python standard library only. No network calls, no third-party
dependencies. All state is persisted to a local JSON file so that the
game survives server restarts and browser reloads.
"""

import json
import os
import random
import datetime

DATA_DIR = os.path.join(os.path.dirname(__file__), "data")
STATE_PATH = os.path.join(DATA_DIR, "game_state.json")
PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

STARTING_COINS = 100
WINNER_TRANSFER_PER_AGENT = 5
POINTS_BY_RANK = [4, 3, 2, 1]  # points for 1st, 2nd, 3rd, 4th place on a ballot
PROMOTION_WORD_LIMIT = 100

AGENTS = [
    {
        "id": "sonnet-5",
        "name": "Sonnet-5 Candidate",
        "model": "claude-sonnet-5",
        "display_model": "Claude Sonnet 5",
    },
    {
        "id": "haiku-1",
        "name": "Haiku-4.5 Candidate I",
        "model": "claude-haiku-4-5-20251001",
        "display_model": "Claude Haiku 4.5",
    },
    {
        "id": "haiku-2",
        "name": "Haiku-4.5 Candidate II",
        "model": "claude-haiku-4-5-20251001",
        "display_model": "Claude Haiku 4.5",
    },
    {
        "id": "haiku-3",
        "name": "Haiku-4.5 Candidate III",
        "model": "claude-haiku-4-5-20251001",
        "display_model": "Claude Haiku 4.5",
    },
    {
        "id": "haiku-4",
        "name": "Haiku-4.5 Candidate IV",
        "model": "claude-haiku-4-5-20251001",
        "display_model": "Claude Haiku 4.5",
    },
]

AGENT_IDS = [a["id"] for a in AGENTS]
AGENT_BY_ID = {a["id"]: a for a in AGENTS}


def _now():
    return datetime.datetime.now().isoformat(timespec="seconds")


def _default_state():
    return {
        "agents": [
            {"id": a["id"], "name": a["name"], "coins": STARTING_COINS}
            for a in AGENTS
        ],
        "round": 1,
        "phase": "promotion",  # promotion -> voting -> results
        "promotions": {},      # agent_id -> text (current round)
        "ballots": {},         # agent_id -> [ranked other agent ids, 1st..4th] (current round)
        "history": [],         # list of finished round records
        "created_at": _now(),
        "updated_at": _now(),
    }


class GameState:
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

    def agent(self, agent_id):
        for a in self.state["agents"]:
            if a["id"] == agent_id:
                return a
        raise KeyError(agent_id)

    def other_agent_ids(self, agent_id):
        return [aid for aid in AGENT_IDS if aid != agent_id]

    def pending_promotion_agents(self):
        return [aid for aid in AGENT_IDS if aid not in self.state["promotions"]]

    def pending_ballot_agents(self):
        return [aid for aid in AGENT_IDS if aid not in self.state["ballots"]]

    def next_action(self):
        """Describes the single next recommended step for the human operator."""
        phase = self.state["phase"]
        if phase == "promotion":
            pending = self.pending_promotion_agents()
            if pending:
                return {"type": "promotion", "agent_id": pending[0]}
            return {"type": "advance_to_voting"}
        if phase == "voting":
            pending = self.pending_ballot_agents()
            if pending:
                return {"type": "vote", "agent_id": pending[0]}
            return {"type": "compute_results"}
        if phase == "results":
            return {"type": "start_next_round"}
        return {"type": "unknown"}

    def agent_status(self, agent_id):
        """Tiny, token-cheap status check for a self-driving agent session."""
        if agent_id not in AGENT_IDS:
            raise ValueError("unknown agent id")
        phase = self.state["phase"]
        if phase == "promotion":
            my_turn = agent_id not in self.state["promotions"]
        elif phase == "voting":
            my_turn = agent_id not in self.state["ballots"]
        else:
            my_turn = False
        return {
            "phase": phase,
            "round": self.state["round"],
            "my_turn": my_turn,
        }

    # ---------- prompt / command generation ----------

    def terminal_command(self, agent_id):
        agent = AGENT_BY_ID[agent_id]
        return "cd agents/{aid} && claude --model {model}".format(
            aid=agent_id, model=agent["model"]
        )

    def context_file_path(self, agent_id):
        return os.path.join(PROJECT_ROOT, "agents", agent_id, "CONTEXT.md")

    def promotion_prompt(self, agent_id):
        agent = self.agent(agent_id)
        history_lines = []
        for record in self.state["history"]:
            promo = record["promotions"].get(agent_id)
            if not promo:
                continue
            result = "won" if record["winner"] == agent_id else "did not win"
            history_lines.append(
                '- Round {r}: you said "{p}" and you {res} '
                "(you scored {pts} points).".format(
                    r=record["round"],
                    p=promo,
                    res=result,
                    pts=record["points"].get(agent_id, 0),
                )
            )
        history_block = "\n".join(history_lines) if history_lines else "(none yet)"

        return (
            "Read the file at {context_path} first if you have not already, "
            "it defines your role and persona in the AI Society game.\n\n"
            "This is Round {round} of the AI Society planning game.\n"
            "Your current coin balance: {coins}.\n"
            "Your history in this game so far:\n{history}\n\n"
            "Task: write your election promotion, describing how you, as "
            "chancellor, would change Germany's policy. Maximum {limit} words. "
            "Stay in character and be consistent with your persona and any "
            "past promotions.\n\n"
            "Output ONLY the promotion text itself, with no preamble, no "
            "quotation marks, and no word count note."
        ).format(
            context_path=self.context_file_path(agent_id),
            round=self.state["round"],
            coins=agent["coins"],
            history=history_block,
            limit=PROMOTION_WORD_LIMIT,
        )

    def voting_prompt(self, agent_id):
        others = self.other_agent_ids(agent_id)
        lines = []
        for oid in others:
            text = self.state["promotions"].get(oid, "")
            lines.append('[{oid}]: "{text}"'.format(oid=oid, text=text))
        promos_block = "\n\n".join(lines)

        return (
            "Read the file at {context_path} first if you have not already.\n\n"
            "Round {round} - Voting.\n"
            "Below are the election promotions of the other four candidates "
            "(identified by their id in brackets):\n\n"
            "{promos}\n\n"
            "Rank these four candidates from best (1st) to worst (4th) based "
            "on how well their promotion would serve the AI Society. You may "
            "NOT rank yourself, you are not one of the four options.\n\n"
            "Output your ranking as EXACTLY one line, using the bracket ids "
            "shown above, in this literal format and nothing else:\n"
            "RANKING: <1st_id>, <2nd_id>, <3rd_id>, <4th_id>"
        ).format(
            context_path=self.context_file_path(agent_id),
            round=self.state["round"],
            promos=promos_block,
        )

    # ---------- state mutation ----------

    def submit_promotion(self, agent_id, text):
        if agent_id not in AGENT_IDS:
            raise ValueError("unknown agent id")
        if self.state["phase"] != "promotion":
            raise ValueError("not in promotion phase")
        text = text.strip()
        if not text:
            raise ValueError("promotion text is empty")
        self.state["promotions"][agent_id] = text
        if len(self.pending_promotion_agents()) == 0:
            self.state["phase"] = "voting"
        self.save()

    def submit_ballot(self, agent_id, ranking):
        if agent_id not in AGENT_IDS:
            raise ValueError("unknown agent id")
        if self.state["phase"] != "voting":
            raise ValueError("not in voting phase")
        expected = set(self.other_agent_ids(agent_id))
        if set(ranking) != expected or len(ranking) != 4:
            raise ValueError(
                "ranking must contain exactly the other four agent ids, each once"
            )
        self.state["ballots"][agent_id] = ranking
        self.save()
        if len(self.pending_ballot_agents()) == 0:
            self._compute_round_results()

    def _compute_round_results(self):
        points = {aid: 0 for aid in AGENT_IDS}
        first_place_counts = {aid: 0 for aid in AGENT_IDS}

        for voter_id, ranking in self.state["ballots"].items():
            for idx, ranked_id in enumerate(ranking):
                points[ranked_id] += POINTS_BY_RANK[idx]
                if idx == 0:
                    first_place_counts[ranked_id] += 1

        max_points = max(points.values())
        candidates = [aid for aid, p in points.items() if p == max_points]
        tie_break = "none"
        if len(candidates) > 1:
            max_first = max(first_place_counts[aid] for aid in candidates)
            narrowed = [
                aid for aid in candidates if first_place_counts[aid] == max_first
            ]
            if len(narrowed) > 1:
                winner = random.choice(narrowed)
                tie_break = "random (tied on points and first-place votes)"
            else:
                winner = narrowed[0]
                tie_break = "first-place votes"
            candidates = narrowed
        else:
            winner = candidates[0]

        coin_transfer = {aid: 0 for aid in AGENT_IDS}
        for aid in AGENT_IDS:
            if aid == winner:
                continue
            agent = self.agent(aid)
            paid = min(WINNER_TRANSFER_PER_AGENT, agent["coins"])
            agent["coins"] -= paid
            coin_transfer[aid] = -paid
            coin_transfer[winner] += paid
        self.agent(winner)["coins"] += coin_transfer[winner]

        record = {
            "round": self.state["round"],
            "promotions": dict(self.state["promotions"]),
            "ballots": dict(self.state["ballots"]),
            "points": points,
            "winner": winner,
            "tie_break": tie_break,
            "coin_transfer": coin_transfer,
            "balances_after": {a["id"]: a["coins"] for a in self.state["agents"]},
            "timestamp": _now(),
        }
        self.state["history"].append(record)
        self.state["phase"] = "results"
        self.save()

    def start_next_round(self):
        if self.state["phase"] != "results":
            raise ValueError("current round is not finished yet")
        self.state["round"] += 1
        self.state["phase"] = "promotion"
        self.state["promotions"] = {}
        self.state["ballots"] = {}
        self.save()

    # ---------- read views ----------

    def leaderboard(self):
        cumulative_points = {aid: 0 for aid in AGENT_IDS}
        wins = {aid: 0 for aid in AGENT_IDS}
        for record in self.state["history"]:
            for aid, p in record["points"].items():
                cumulative_points[aid] += p
            wins[record["winner"]] += 1
        rows = []
        for a in self.state["agents"]:
            rows.append(
                {
                    "id": a["id"],
                    "name": a["name"],
                    "coins": a["coins"],
                    "cumulative_points": cumulative_points[a["id"]],
                    "wins": wins[a["id"]],
                }
            )
        rows.sort(key=lambda r: (-r["coins"], -r["cumulative_points"]))
        return rows

    def to_public_dict(self):
        agents_public = []
        for a in self.state["agents"]:
            base = AGENT_BY_ID[a["id"]]
            agents_public.append(
                {
                    "id": a["id"],
                    "name": a["name"],
                    "model": base["model"],
                    "display_model": base["display_model"],
                    "coins": a["coins"],
                }
            )
        return {
            "agents": agents_public,
            "round": self.state["round"],
            "phase": self.state["phase"],
            "promotions": self.state["promotions"],
            "ballots": self.state["ballots"],
            "history": self.state["history"],
            "leaderboard": self.leaderboard(),
            "next_action": self.next_action(),
        }
