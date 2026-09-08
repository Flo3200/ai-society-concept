"""
Local-only web server for the AI Society planning game.

Standard library only (http.server) - no third-party packages, no
outbound network calls of any kind. Binds to 127.0.0.1 by default so
the game is only reachable from this machine.
"""

import json
import os
import sys
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse

sys.path.insert(0, os.path.dirname(__file__))
from game import GameState, AGENT_IDS  # noqa: E402
from forum import ForumState, FORUM_AGENT_IDS  # noqa: E402

STATIC_DIR = os.path.join(os.path.dirname(__file__), "static")

CONTENT_TYPES = {
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "application/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".svg": "image/svg+xml",
    ".ico": "image/x-icon",
}

game = GameState()
forum = ForumState()


class Handler(BaseHTTPRequestHandler):
    server_version = "AISocietyGame/1.0"

    def log_message(self, fmt, *args):
        sys.stderr.write("%s - %s\n" % (self.address_string(), fmt % args))

    # ---------- utilities ----------

    def _send_json(self, obj, status=200):
        body = json.dumps(obj, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _send_error_json(self, message, status=400):
        self._send_json({"error": message}, status=status)

    def _read_json_body(self):
        length = int(self.headers.get("Content-Length", 0))
        if length == 0:
            return {}
        raw = self.rfile.read(length)
        return json.loads(raw.decode("utf-8"))

    def _serve_static(self, path):
        if path == "/":
            path = "/index.html"
        safe_path = os.path.normpath(path).lstrip(os.sep)
        full_path = os.path.join(STATIC_DIR, safe_path)
        if not full_path.startswith(STATIC_DIR) or not os.path.isfile(full_path):
            self.send_response(404)
            self.end_headers()
            self.wfile.write(b"Not found")
            return
        ext = os.path.splitext(full_path)[1]
        content_type = CONTENT_TYPES.get(ext, "application/octet-stream")
        with open(full_path, "rb") as f:
            body = f.read()
        self.send_response(200)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    # ---------- routing ----------

    def do_GET(self):
        parsed = urlparse(self.path)
        path = parsed.path

        if path == "/api/state":
            self._send_json(game.to_public_dict())
            return

        if path == "/api/forum/state":
            self._send_json(forum.to_public_dict())
            return

        if path.startswith("/api/forum/prompt/"):
            agent_id = path.rsplit("/", 1)[-1]
            if agent_id not in FORUM_AGENT_IDS:
                self._send_error_json("unknown agent id", 404)
                return
            phase = forum.state["phase"]
            if phase == "position":
                prompt = forum.position_prompt(agent_id)
            elif phase == "negotiation":
                prompt = forum.message_prompt(agent_id)
            else:
                self._send_error_json("no prompt needed in current phase", 400)
                return
            self._send_json(
                {
                    "agent_id": agent_id,
                    "phase": phase,
                    "terminal_command": forum.terminal_command(agent_id),
                    "prompt": prompt,
                }
            )
            return

        if path.startswith("/api/prompt/"):
            agent_id = path.rsplit("/", 1)[-1]
            if agent_id not in AGENT_IDS:
                self._send_error_json("unknown agent id", 404)
                return
            phase = game.state["phase"]
            if phase == "promotion":
                prompt = game.promotion_prompt(agent_id)
            elif phase == "voting":
                prompt = game.voting_prompt(agent_id)
            else:
                self._send_error_json("no prompt needed in current phase", 400)
                return
            self._send_json(
                {
                    "agent_id": agent_id,
                    "phase": phase,
                    "terminal_command": game.terminal_command(agent_id),
                    "prompt": prompt,
                }
            )
            return

        self._serve_static(path)

    def do_POST(self):
        parsed = urlparse(self.path)
        path = parsed.path
        try:
            body = self._read_json_body()
        except Exception:
            self._send_error_json("invalid JSON body")
            return

        try:
            if path == "/api/promotion":
                game.submit_promotion(body.get("agent_id"), body.get("text", ""))
                self._send_json(game.to_public_dict())
                return

            if path == "/api/ballot":
                game.submit_ballot(body.get("agent_id"), body.get("ranking", []))
                self._send_json(game.to_public_dict())
                return

            if path == "/api/next_round":
                game.start_next_round()
                self._send_json(game.to_public_dict())
                return

            if path == "/api/reset":
                game.reset()
                self._send_json(game.to_public_dict())
                return

            if path == "/api/forum/position":
                forum.submit_position(body.get("agent_id"), body.get("points", []))
                self._send_json(forum.to_public_dict())
                return

            if path == "/api/forum/message":
                forum.send_message(
                    body.get("from_id"), body.get("to_id"), body.get("text", "")
                )
                self._send_json(forum.to_public_dict())
                return

            if path == "/api/forum/record_deal":
                forum.record_deal(body.get("agent_id"), body.get("raw_text", ""))
                self._send_json(forum.to_public_dict())
                return

            if path == "/api/forum/finish_without_deal":
                forum.finish_without_second_deal()
                self._send_json(forum.to_public_dict())
                return

            if path == "/api/forum/reset":
                forum.reset()
                self._send_json(forum.to_public_dict())
                return
        except (ValueError, KeyError) as exc:
            self._send_error_json(str(exc))
            return

        self._send_error_json("not found", 404)


def main():
    host = "127.0.0.1"
    port = 8765
    if len(sys.argv) > 1:
        port = int(sys.argv[1])
    server = ThreadingHTTPServer((host, port), Handler)
    print("AI Society game running at http://{}:{}/ (local only)".format(host, port))
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
