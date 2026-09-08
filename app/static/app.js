(function () {
  "use strict";

  var state = null;

  var els = {
    roundNumber: document.getElementById("round-number"),
    nextAction: document.getElementById("next-action"),
    phaseStepper: document.getElementById("phase-stepper"),
    agentGrid: document.getElementById("agent-grid"),
    resultsPanel: document.getElementById("results-panel"),
    leaderboardBody: document.querySelector("#leaderboard-table tbody"),
    historyList: document.getElementById("history-list"),
    modalBackdrop: document.getElementById("modal-backdrop"),
    modalBody: document.getElementById("modal-body"),
    modalClose: document.getElementById("modal-close"),
  };

  function api(method, path, body) {
    var opts = { method: method, headers: {} };
    if (body !== undefined) {
      opts.headers["Content-Type"] = "application/json";
      opts.body = JSON.stringify(body);
    }
    return fetch(path, opts).then(function (res) {
      return res.json().then(function (data) {
        if (!res.ok) throw new Error(data.error || "request failed");
        return data;
      });
    });
  }

  function refresh() {
    return api("GET", "/api/state").then(function (data) {
      state = data;
      render();
      return data;
    });
  }

  function agentById(id) {
    return state.agents.filter(function (a) { return a.id === id; })[0];
  }

  function wordCount(text) {
    var trimmed = text.trim();
    if (!trimmed) return 0;
    return trimmed.split(/\s+/).length;
  }

  // ---------- tabs ----------

  document.querySelectorAll(".tab-btn").forEach(function (btn) {
    btn.addEventListener("click", function () {
      document.querySelectorAll(".tab-btn").forEach(function (b) { b.classList.remove("active"); });
      document.querySelectorAll(".tab-panel").forEach(function (p) { p.classList.remove("active"); });
      btn.classList.add("active");
      document.getElementById("tab-" + btn.dataset.tab).classList.add("active");
    });
  });

  els.modalClose.addEventListener("click", closeModal);
  els.modalBackdrop.addEventListener("click", function (e) {
    if (e.target === els.modalBackdrop) closeModal();
  });

  function openModal(html) {
    els.modalBody.innerHTML = html;
    els.modalBackdrop.classList.remove("hidden");
  }

  function closeModal() {
    els.modalBackdrop.classList.add("hidden");
    els.modalBody.innerHTML = "";
  }

  // ---------- rendering ----------

  function render() {
    els.roundNumber.textContent = state.round;
    renderNextAction();
    renderStepper();
    renderAgentGrid();
    renderResults();
    renderLeaderboard();
    renderHistory();
  }

  function renderNextAction() {
    var na = state.next_action;
    var html = "";
    if (na.type === "promotion") {
      var a = agentById(na.agent_id);
      html =
        "<strong>Next step:</strong> collect the election promotion from <strong>" +
        escapeHtml(a.name) +
        "</strong>. Click its card below to get the terminal command and prompt.";
    } else if (na.type === "vote") {
      var a2 = agentById(na.agent_id);
      html =
        "<strong>Next step:</strong> collect the ranked ballot from <strong>" +
        escapeHtml(a2.name) +
        "</strong>. Click its card below.";
    } else if (na.type === "advance_to_voting") {
      html = "<strong>All promotions collected.</strong> Moving to the voting phase &mdash; reload if the view does not switch automatically.";
    } else if (na.type === "compute_results") {
      html = "<strong>All ballots collected.</strong> Results have been computed below.";
    } else if (na.type === "start_next_round") {
      html = "<strong>Round " + state.round + " is finished.</strong> Review the results below, then click &ldquo;Start Next Round&rdquo;.";
    }
    els.nextAction.innerHTML = html;
  }

  function renderStepper() {
    var phases = [
      { id: "promotion", label: "1. Election Promotions" },
      { id: "voting", label: "2. Voting" },
      { id: "results", label: "3. Results" },
    ];
    var order = ["promotion", "voting", "results"];
    var currentIdx = order.indexOf(state.phase);
    els.phaseStepper.innerHTML = phases
      .map(function (p, i) {
        var cls = "phase-step";
        if (i === currentIdx) cls += " current";
        else if (i < currentIdx) cls += " done";
        return '<div class="' + cls + '">' + p.label + "</div>";
      })
      .join("");
  }

  function renderAgentGrid() {
    if (state.phase === "results") {
      els.agentGrid.classList.add("hidden");
      return;
    }
    els.agentGrid.classList.remove("hidden");

    var isPromotion = state.phase === "promotion";
    var completedMap = isPromotion ? state.promotions : state.ballots;
    var nextAgentId = state.next_action.agent_id;

    els.agentGrid.innerHTML = state.agents
      .map(function (a) {
        var done = !!completedMap[a.id];
        var cardCls = "agent-card" + (a.id === nextAgentId ? " pending-highlight" : "");
        var pillCls = done ? "status-pill done" : "status-pill pending";
        var pillText = done ? "Collected" : "Pending";
        var preview = "";
        if (isPromotion && done) {
          preview = escapeHtml(truncate(state.promotions[a.id], 90));
        } else if (!isPromotion && done) {
          preview = "Ranking: " + state.ballots[a.id].join(" &gt; ");
        } else if (isPromotion) {
          preview = "No promotion collected yet.";
        } else {
          preview = "No ballot collected yet.";
        }
        return (
          '<div class="' + cardCls + '" data-agent="' + a.id + '">' +
          '<div class="agent-card-header">' +
          '<div><div class="agent-name">' + escapeHtml(a.name) + "</div>" +
          '<div class="agent-model">' + escapeHtml(a.display_model) + "</div></div>" +
          '<span class="' + pillCls + '">' + pillText + "</span>" +
          "</div>" +
          '<div class="agent-coins">Coins: <b>' + a.coins + "</b></div>" +
          '<div class="agent-preview">' + preview + "</div>" +
          "</div>"
        );
      })
      .join("");

    els.agentGrid.querySelectorAll(".agent-card").forEach(function (card) {
      card.addEventListener("click", function () {
        openAgentModal(card.dataset.agent);
      });
    });
  }

  function truncate(text, n) {
    if (text.length <= n) return text;
    return text.slice(0, n) + "...";
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  // ---------- agent modal (promotion / voting) ----------

  function openAgentModal(agentId) {
    api("GET", "/api/prompt/" + agentId).then(function (data) {
      var agent = agentById(agentId);
      if (data.phase === "promotion") {
        renderPromotionModal(agent, data);
      } else {
        renderVotingModal(agent, data);
      }
    });
  }

  function renderPromotionModal(agent, data) {
    var existing = state.promotions[agent.id] || "";
    var html =
      "<h2>" + escapeHtml(agent.name) + " &mdash; Election Promotion</h2>" +
      "<h3>1. Open this agent&rsquo;s terminal</h3>" +
      '<pre class="cmd-block">' + escapeHtml(data.terminal_command) + "</pre>" +
      '<button class="copy-btn" data-copy="' + attrEscape(data.terminal_command) + '">Copy command</button>' +
      "<h3>2. Paste this prompt into the agent</h3>" +
      '<textarea class="prompt-box" readonly>' + escapeHtml(data.prompt) + "</textarea>" +
      '<button class="copy-btn" data-copy="' + attrEscape(data.prompt) + '">Copy prompt</button>' +
      "<h3>3. Paste the agent&rsquo;s promotion below</h3>" +
      '<textarea class="answer-box" id="answer-box" placeholder="Paste the agent\'s election promotion here...">' + escapeHtml(existing) + "</textarea>" +
      '<div class="word-count" id="word-count"></div>' +
      '<button class="primary" id="save-btn">Save promotion</button>' +
      '<div id="save-status"></div>';
    openModal(html);

    var answerBox = document.getElementById("answer-box");
    var wc = document.getElementById("word-count");
    function updateCount() {
      var n = wordCount(answerBox.value);
      wc.textContent = n + " / 100 words";
      wc.className = "word-count " + (n > 100 ? "over" : "ok");
    }
    updateCount();
    answerBox.addEventListener("input", updateCount);

    wireCopyButtons();

    document.getElementById("save-btn").addEventListener("click", function () {
      var text = answerBox.value.trim();
      var n = wordCount(text);
      if (n === 0) {
        showSaveStatus("Please paste the agent's promotion first.", true);
        return;
      }
      if (n > 100) {
        var proceed = confirm(
          "This promotion is " + n + " words, over the 100-word limit. Save anyway?"
        );
        if (!proceed) return;
      }
      api("POST", "/api/promotion", { agent_id: agent.id, text: text })
        .then(function () {
          closeModal();
          return refresh();
        })
        .catch(function (err) { showSaveStatus(err.message, true); });
    });
  }

  function renderVotingModal(agent, data) {
    var otherIds = state.agents.map(function (a) { return a.id; }).filter(function (id) { return id !== agent.id; });
    var existing = state.ballots[agent.id];
    var html =
      "<h2>" + escapeHtml(agent.name) + " &mdash; Voting</h2>" +
      "<h3>1. Open this agent&rsquo;s terminal</h3>" +
      '<pre class="cmd-block">' + escapeHtml(data.terminal_command) + "</pre>" +
      '<button class="copy-btn" data-copy="' + attrEscape(data.terminal_command) + '">Copy command</button>' +
      "<h3>2. Paste this prompt into the agent</h3>" +
      '<textarea class="prompt-box" readonly>' + escapeHtml(data.prompt) + "</textarea>" +
      '<button class="copy-btn" data-copy="' + attrEscape(data.prompt) + '">Copy prompt</button>' +
      "<h3>3. Paste the agent&rsquo;s raw response below</h3>" +
      '<textarea class="answer-box" id="answer-box" placeholder="Paste the agent\'s full response, including the RANKING: line...">' +
      (existing ? "RANKING: " + existing.join(", ") : "") +
      "</textarea>" +
      '<p class="helper-text">Expected format: <code>RANKING: id_1st, id_2nd, id_3rd, id_4th</code> using: ' +
      otherIds.join(", ") +
      "</p>" +
      '<div class="parse-status" id="parse-status">Waiting for input...</div>' +
      '<button class="primary" id="save-btn" disabled>Save ballot</button>';
    openModal(html);
    wireCopyButtons();

    var answerBox = document.getElementById("answer-box");
    var parseStatusEl = document.getElementById("parse-status");
    var saveBtn = document.getElementById("save-btn");
    var parsedRanking = null;

    function tryParse() {
      var text = answerBox.value;
      var match = text.match(/RANKING:\s*([\w-]+)\s*,\s*([\w-]+)\s*,\s*([\w-]+)\s*,\s*([\w-]+)/i);
      if (!match) {
        parseStatusEl.textContent = "No RANKING: line found yet.";
        parseStatusEl.className = "parse-status";
        saveBtn.disabled = true;
        parsedRanking = null;
        return;
      }
      var ranking = [match[1], match[2], match[3], match[4]];
      var expected = otherIds.slice().sort();
      var got = ranking.slice().sort();
      var valid = JSON.stringify(expected) === JSON.stringify(got);
      if (!valid) {
        parseStatusEl.textContent =
          "Parsed " + ranking.join(", ") + " but this does not exactly match the expected ids (" + otherIds.join(", ") + ").";
        parseStatusEl.className = "parse-status error";
        saveBtn.disabled = true;
        parsedRanking = null;
        return;
      }
      parseStatusEl.textContent = "Parsed ranking: " + ranking.join(" > ");
      parseStatusEl.className = "parse-status success";
      saveBtn.disabled = false;
      parsedRanking = ranking;
    }

    tryParse();
    answerBox.addEventListener("input", tryParse);

    saveBtn.addEventListener("click", function () {
      if (!parsedRanking) return;
      api("POST", "/api/ballot", { agent_id: agent.id, ranking: parsedRanking })
        .then(function () {
          closeModal();
          return refresh();
        })
        .catch(function (err) {
          parseStatusEl.textContent = err.message;
          parseStatusEl.className = "parse-status error";
        });
    });
  }

  function showSaveStatus(msg, isError) {
    var el = document.getElementById("save-status");
    if (!el) return;
    el.textContent = msg;
    el.style.color = isError ? "#d16060" : "#4caf82";
    el.style.fontSize = "13px";
    el.style.marginTop = "8px";
  }

  function attrEscape(s) {
    return escapeHtml(s).replace(/\n/g, "&#10;");
  }

  function wireCopyButtons() {
    document.querySelectorAll(".copy-btn").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var text = btn.getAttribute("data-copy");
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(text).then(function () {
            var old = btn.textContent;
            btn.textContent = "Copied!";
            setTimeout(function () { btn.textContent = old; }, 1200);
          }).catch(function () {});
        }
      });
    });
  }

  // ---------- results ----------

  function renderResults() {
    if (state.phase !== "results" || state.history.length === 0) {
      els.resultsPanel.classList.add("hidden");
      return;
    }
    els.resultsPanel.classList.remove("hidden");
    var record = state.history[state.history.length - 1];
    var rows = state.agents
      .map(function (a) {
        return {
          id: a.id,
          name: a.name,
          points: record.points[a.id],
          transfer: record.coin_transfer[a.id],
          balance: record.balances_after[a.id],
        };
      })
      .sort(function (x, y) { return y.points - x.points; });

    var rowsHtml = rows
      .map(function (r) {
        var isWinner = r.id === record.winner;
        var transferText =
          r.transfer > 0
            ? '<span class="coin-plus">+' + r.transfer + "</span>"
            : r.transfer < 0
            ? '<span class="coin-minus">' + r.transfer + "</span>"
            : "0";
        return (
          '<tr class="' + (isWinner ? "winner-row" : "") + '">' +
          "<td>" + (isWinner ? "★ " : "") + escapeHtml(r.name) + "</td>" +
          "<td>" + r.points + "</td>" +
          "<td>" + transferText + "</td>" +
          "<td>" + r.balance + "</td>" +
          "</tr>"
        );
      })
      .join("");

    var promosHtml = state.agents
      .map(function (a) {
        return (
          '<div class="history-promo"><b>' +
          escapeHtml(a.name) +
          ":</b> " +
          escapeHtml(record.promotions[a.id] || "") +
          "</div>"
        );
      })
      .join("");

    els.resultsPanel.innerHTML =
      "<h2>Round " + record.round + " Results</h2>" +
      '<div class="results-table-wrap"><table class="table"><thead><tr><th>Candidate</th><th>Points</th><th>Coin change</th><th>New balance</th></tr></thead><tbody>' +
      rowsHtml +
      "</tbody></table></div>" +
      "<h3 style='margin-top:20px;color:var(--text-dim);font-size:13px;text-transform:uppercase;letter-spacing:.04em;'>Promotions this round</h3>" +
      promosHtml +
      (record.tie_break !== "none"
        ? '<p class="helper-text">Tie-break used: ' + escapeHtml(record.tie_break) + "</p>"
        : "") +
      '<button class="primary" id="next-round-btn">Start Next Round</button>';

    document.getElementById("next-round-btn").addEventListener("click", function () {
      api("POST", "/api/next_round", {}).then(refresh);
    });
  }

  // ---------- leaderboard ----------

  function renderLeaderboard() {
    els.leaderboardBody.innerHTML = state.leaderboard
      .map(function (r, i) {
        return (
          "<tr><td>" +
          (i + 1) +
          "</td><td>" +
          escapeHtml(r.name) +
          "</td><td>" +
          r.coins +
          "</td><td>" +
          r.cumulative_points +
          "</td><td>" +
          r.wins +
          "</td></tr>"
        );
      })
      .join("");
  }

  // ---------- history ----------

  function renderHistory() {
    if (state.history.length === 0) {
      els.historyList.innerHTML = '<p class="helper-text">No rounds completed yet.</p>';
      return;
    }
    els.historyList.innerHTML = state.history
      .slice()
      .reverse()
      .map(function (record) {
        var winnerName = agentById(record.winner).name;
        var promos = state.agents
          .map(function (a) {
            return (
              '<div class="history-promo"><b>' +
              escapeHtml(a.name) +
              " (" +
              record.points[a.id] +
              " pts):</b> " +
              escapeHtml(record.promotions[a.id] || "") +
              "</div>"
            );
          })
          .join("");
        return (
          '<div class="history-entry"><h3>Round ' +
          record.round +
          " &mdash; winner: " +
          escapeHtml(winnerName) +
          "</h3>" +
          promos +
          "</div>"
        );
      })
      .join("");
  }

  refresh();
  setInterval(refresh, 5000);
})();
