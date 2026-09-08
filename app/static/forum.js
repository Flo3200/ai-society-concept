(function () {
  "use strict";

  var forumState = null;

  var els = {
    nextAction: document.getElementById("forum-next-action"),
    phaseStepper: document.getElementById("forum-phase-stepper"),
    agentGrid: document.getElementById("forum-agent-grid"),
    dealsPanel: document.getElementById("forum-deals-panel"),
    messagesPanel: document.getElementById("forum-messages-panel"),
    resultPanel: document.getElementById("forum-result-panel"),
    modalBackdrop: document.getElementById("modal-backdrop-forum"),
    modalBody: document.getElementById("modal-body-forum"),
    modalClose: document.getElementById("modal-close-forum"),
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
    return api("GET", "/api/forum/state").then(function (data) {
      forumState = data;
      render();
      return data;
    });
  }

  function agentById(id) {
    return forumState.agents.filter(function (a) { return a.id === id; })[0];
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function attrEscape(s) {
    return escapeHtml(s).replace(/\n/g, "&#10;");
  }

  function openModal(html) {
    els.modalBody.innerHTML = html;
    els.modalBackdrop.classList.remove("hidden");
  }

  function closeModal() {
    els.modalBackdrop.classList.add("hidden");
    els.modalBody.innerHTML = "";
  }

  els.modalClose.addEventListener("click", closeModal);
  els.modalBackdrop.addEventListener("click", function (e) {
    if (e.target === els.modalBackdrop) closeModal();
  });

  function wireCopyButtons(scope) {
    scope.querySelectorAll(".copy-btn").forEach(function (btn) {
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

  function rankBadge(rank) {
    if (rank === null || rank === undefined) {
      return '<span class="rank-badge rank-lost">verloren</span>';
    }
    var cls = rank === 1 ? "rank-1" : rank === 2 ? "rank-2" : "";
    return '<span class="rank-badge ' + cls + '">' + rank + ".</span>";
  }

  // ---------- rendering ----------

  function render() {
    renderNextAction();
    renderStepper();
    renderAgentGrid();
    renderDeals();
    renderMessages();
    renderResult();
  }

  function renderNextAction() {
    var na = forumState.next_action;
    var html = "";
    if (na.type === "position") {
      html =
        "<strong>Nächster Schritt:</strong> Position von <strong>" +
        escapeHtml(agentById(na.agent_id).name) +
        "</strong> einsammeln (genau 10 Punkte). Karte unten anklicken.";
    } else if (na.type === "advance_to_negotiation") {
      html = "<strong>Alle Positionen gesammelt.</strong> Verhandlungsphase beginnt.";
    } else if (na.type === "message") {
      html =
        "<strong>Nächster Schritt:</strong> Nachricht von <strong>" +
        escapeHtml(agentById(na.agent_id).name) +
        "</strong> einsammeln. Karte unten anklicken.";
    } else if (na.type === "round_complete") {
      html = "<strong>Runde abgeschlossen.</strong> Nächste Runde beginnt.";
    } else if (na.type === "await_deal_or_finish") {
      html =
        '<span class="budget-warning">Nachrichten-Budget der zweiten Partei ist aufgebraucht.</span> ' +
        "Prüfe, ob die letzte Nachricht einen abschließbaren Deal enthält (Button unten bei den Deals), " +
        'oder beende das Forum ohne Einigung.' +
        ' <button class="primary" id="finish-no-deal-btn" style="margin-top:10px;display:block;">Kein Deal – Forum beenden</button>';
    } else if (na.type === "forum_finished") {
      html = "<strong>Verhandlungsforum abgeschlossen.</strong> Ergebnis siehe unten.";
    }
    els.nextAction.innerHTML = html;

    var finishBtn = document.getElementById("finish-no-deal-btn");
    if (finishBtn) {
      finishBtn.addEventListener("click", function () {
        api("POST", "/api/forum/finish_without_deal", {}).then(refresh);
      });
    }
  }

  function renderStepper() {
    var phases = [
      { id: "position", label: "1. Positionen (10 Punkte)" },
      { id: "negotiation", label: "2. Verhandlung" },
      { id: "results", label: "3. Ergebnis" },
    ];
    var order = ["position", "negotiation", "results"];
    var currentIdx = order.indexOf(forumState.phase);
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
    if (forumState.phase === "results") {
      els.agentGrid.classList.add("hidden");
      return;
    }
    els.agentGrid.classList.remove("hidden");

    var isPosition = forumState.phase === "position";
    var nextAgentId = forumState.next_action.agent_id;
    var active = forumState.active_agent_ids;

    els.agentGrid.innerHTML = forumState.agents
      .map(function (a) {
        var isActive = active.indexOf(a.id) !== -1;
        var hasPosition = !!forumState.positions[a.id];
        var cardCls = "agent-card" + (a.id === nextAgentId ? " pending-highlight" : "");
        var pillCls, pillText, preview;

        if (isPosition) {
          pillCls = hasPosition ? "status-pill done" : "status-pill pending";
          pillText = hasPosition ? "Eingereicht" : "Ausstehend";
          preview = hasPosition
            ? forumState.positions[a.id].length + " Punkte eingereicht."
            : "Noch keine Position eingereicht.";
        } else {
          pillCls = isActive ? "status-pill pending" : "status-pill done";
          pillText = isActive ? "Aktiv" : "In Partei";
          var sentCount = forumState.messages.filter(function (m) { return m.from === a.id; }).length;
          preview = isActive
            ? sentCount + " Nachrichten gesendet."
            : "Bereits Teil einer Partei.";
        }

        return (
          '<div class="' + cardCls + '" data-agent="' + a.id + '">' +
          '<div class="agent-card-header">' +
          '<div><div class="agent-name">' + escapeHtml(a.name) + "</div>" +
          '<div class="agent-model">' + escapeHtml(a.display_model) + "</div></div>" +
          '<span class="' + pillCls + '">' + pillText + "</span>" +
          "</div>" +
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

  function renderDeals() {
    var html = "<h2>Parteien</h2>";
    if (forumState.deals.length === 0) {
      html += '<p class="helper-text">Noch keine Partei gebildet.</p>';
    } else {
      html += forumState.deals
        .map(function (deal) {
          var rankNote =
            deal.order === 1
              ? "1. Platz (Chef) / 2. Platz (Partner)"
              : "3. Platz (Chef) / 4. Platz (Partner)";
          return (
            '<div class="deal-card"><h3>Partei ' +
            deal.order +
            ": " +
            escapeHtml(agentById(deal.members[0]).name) +
            " + " +
            escapeHtml(agentById(deal.members[1]).name) +
            "</h3>" +
            "<p>Chef: <b>" +
            escapeHtml(agentById(deal.leader).name) +
            "</b> — " +
            rankNote +
            "</p>" +
            "<ol>" +
            deal.points.map(function (p) { return "<li>" + escapeHtml(p) + "</li>"; }).join("") +
            "</ol></div>"
          );
        })
        .join("");
    }

    if (
      forumState.phase === "negotiation" &&
      forumState.active_agent_ids.length === 2
    ) {
      html += '<button class="primary" id="record-deal-btn">Deal aufzeichnen</button>';
    }

    els.dealsPanel.innerHTML = html;

    var recordBtn = document.getElementById("record-deal-btn");
    if (recordBtn) {
      recordBtn.addEventListener("click", openRecordDealModal);
    }
  }

  function renderMessages() {
    var html = "<h2>Nachrichtenverlauf</h2>";
    if (forumState.messages.length === 0) {
      html += '<p class="helper-text">Noch keine Nachrichten.</p>';
    } else {
      html +=
        '<div class="message-thread">' +
        forumState.messages
          .slice()
          .reverse()
          .map(function (m) {
            return (
              '<div class="message-bubble"><div class="meta">Runde ' +
              m.round +
              " · " +
              escapeHtml(agentById(m.from).name) +
              ' <span class="arrow">&rarr;</span> ' +
              escapeHtml(agentById(m.to).name) +
              "</div>" +
              escapeHtml(m.text) +
              "</div>"
            );
          })
          .join("") +
        "</div>";
    }
    els.messagesPanel.innerHTML = html;
  }

  function renderResult() {
    if (forumState.phase !== "results" || !forumState.result) {
      els.resultPanel.classList.add("hidden");
      return;
    }
    els.resultPanel.classList.remove("hidden");
    var ranks = forumState.result.ranks;
    var rows = forumState.agents
      .slice()
      .sort(function (a, b) {
        var ra = ranks[a.id] === null || ranks[a.id] === undefined ? 99 : ranks[a.id];
        var rb = ranks[b.id] === null || ranks[b.id] === undefined ? 99 : ranks[b.id];
        return ra - rb;
      })
      .map(function (a) {
        return (
          "<tr><td>" +
          rankBadge(ranks[a.id]) +
          "</td><td>" +
          escapeHtml(a.name) +
          "</td></tr>"
        );
      })
      .join("");

    els.resultPanel.innerHTML =
      "<h2>Endergebnis</h2>" +
      '<div class="results-table-wrap"><table class="table"><thead><tr><th>Platz</th><th>Delegierte/r</th></tr></thead><tbody>' +
      rows +
      "</tbody></table></div>" +
      '<p class="helper-text">' +
      escapeHtml(forumState.result.note) +
      "</p>" +
      '<button class="primary" id="forum-reset-btn">Neues Verhandlungsforum starten</button>';

    document.getElementById("forum-reset-btn").addEventListener("click", function () {
      if (confirm("Wirklich zurücksetzen? Der gesamte Verlauf des Forums geht verloren.")) {
        api("POST", "/api/forum/reset", {}).then(refresh);
      }
    });
  }

  // ---------- agent modal (position / message) ----------

  function openAgentModal(agentId) {
    if (forumState.phase === "position") {
      api("GET", "/api/forum/prompt/" + agentId).then(function (data) {
        renderPositionModal(agentById(agentId), data);
      });
      return;
    }
    if (forumState.phase === "negotiation") {
      if (forumState.active_agent_ids.indexOf(agentId) === -1) {
        openModal(
          "<h2>" +
            escapeHtml(agentById(agentId).name) +
            "</h2><p>Dieser Delegierte ist bereits Teil einer Partei und nimmt nicht mehr an der Verhandlung teil.</p>"
        );
        return;
      }
      api("GET", "/api/forum/prompt/" + agentId).then(function (data) {
        renderMessageModal(agentById(agentId), data);
      });
    }
  }

  function parsePoints(text) {
    var lines = text.split("\n");
    var found = {};
    lines.forEach(function (line) {
      var m = line.match(/^\s*(\d{1,2})[.)]\s*(.+?)\s*$/);
      if (m) {
        var num = parseInt(m[1], 10);
        if (num >= 1 && num <= 10 && !(num in found)) found[num] = m[2];
      }
    });
    var points = [];
    for (var i = 1; i <= 10; i++) {
      if (found[i]) points.push(found[i]);
    }
    return points;
  }

  function renderPositionModal(agent, data) {
    var existing = forumState.positions[agent.id];
    var html =
      "<h2>" + escapeHtml(agent.name) + " &mdash; Position (10 Punkte)</h2>" +
      "<h3>1. Terminal öffnen</h3>" +
      '<pre class="cmd-block">' + escapeHtml(data.terminal_command) + "</pre>" +
      '<button class="copy-btn" data-copy="' + attrEscape(data.terminal_command) + '">Copy command</button>' +
      "<h3>2. Prompt einfügen</h3>" +
      '<textarea class="prompt-box" readonly>' + escapeHtml(data.prompt) + "</textarea>" +
      '<button class="copy-btn" data-copy="' + attrEscape(data.prompt) + '">Copy prompt</button>' +
      "<h3>3. Antwort (10 Punkte) einfügen</h3>" +
      '<textarea class="answer-box" id="answer-box" placeholder="1. ...\n2. ...\n...">' +
      (existing ? existing.map(function (p, i) { return (i + 1) + ". " + p; }).join("\n") : "") +
      "</textarea>" +
      '<div class="parse-status" id="parse-status">Warte auf Eingabe...</div>' +
      '<button class="primary" id="save-btn">Position speichern</button>';
    openModal(html);
    wireCopyButtons(els.modalBody);

    var answerBox = document.getElementById("answer-box");
    var parseStatusEl = document.getElementById("parse-status");
    var saveBtn = document.getElementById("save-btn");
    var parsedPoints = [];

    function tryParse() {
      parsedPoints = parsePoints(answerBox.value);
      if (parsedPoints.length === 10) {
        parseStatusEl.textContent = "10 Punkte erkannt.";
        parseStatusEl.className = "parse-status success";
      } else {
        parseStatusEl.textContent = parsedPoints.length + " von 10 Punkten erkannt.";
        parseStatusEl.className = "parse-status" + (parsedPoints.length > 0 ? " error" : "");
      }
    }
    tryParse();
    answerBox.addEventListener("input", tryParse);

    saveBtn.addEventListener("click", function () {
      if (parsedPoints.length !== 10) {
        var proceed = confirm(
          "Es wurden " + parsedPoints.length + " von 10 Punkten erkannt. Trotzdem speichern? (wird als Fehler abgelehnt, falls nicht genau 10)"
        );
        if (!proceed) return;
      }
      api("POST", "/api/forum/position", { agent_id: agent.id, points: parsedPoints })
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

  function renderMessageModal(agent, data) {
    var otherActive = forumState.active_agent_ids.filter(function (id) { return id !== agent.id; });
    var html =
      "<h2>" + escapeHtml(agent.name) + " &mdash; Nachricht senden</h2>" +
      "<h3>1. Terminal öffnen</h3>" +
      '<pre class="cmd-block">' + escapeHtml(data.terminal_command) + "</pre>" +
      '<button class="copy-btn" data-copy="' + attrEscape(data.terminal_command) + '">Copy command</button>' +
      "<h3>2. Prompt einfügen</h3>" +
      '<textarea class="prompt-box" readonly>' + escapeHtml(data.prompt) + "</textarea>" +
      '<button class="copy-btn" data-copy="' + attrEscape(data.prompt) + '">Copy prompt</button>' +
      "<h3>3. Rohe Antwort einfügen (muss mit TO: &lt;id&gt; beginnen)</h3>" +
      '<textarea class="answer-box" id="answer-box" placeholder="TO: ' +
      (otherActive[0] || "...") +
      '\n...">' +
      "</textarea>" +
      '<p class="helper-text">Gültige Empfänger: ' + otherActive.join(", ") + "</p>" +
      '<div class="parse-status" id="parse-status">Warte auf Eingabe...</div>' +
      '<button class="primary" id="save-btn" disabled>Nachricht senden</button>';
    openModal(html);
    wireCopyButtons(els.modalBody);

    var answerBox = document.getElementById("answer-box");
    var parseStatusEl = document.getElementById("parse-status");
    var saveBtn = document.getElementById("save-btn");
    var parsedTo = null;
    var parsedText = null;

    function tryParse() {
      var text = answerBox.value;
      var m = text.match(/^\s*TO:\s*([\w-]+)\s*\n([\s\S]*)/i);
      if (!m) {
        parseStatusEl.textContent = "Erste Zeile muss 'TO: <id>' sein.";
        parseStatusEl.className = "parse-status error";
        saveBtn.disabled = true;
        parsedTo = null;
        return;
      }
      var to = m[1];
      if (otherActive.indexOf(to) === -1) {
        parseStatusEl.textContent = "'" + to + "' ist kein gültiger, aktiver Empfänger (" + otherActive.join(", ") + ").";
        parseStatusEl.className = "parse-status error";
        saveBtn.disabled = true;
        parsedTo = null;
        return;
      }
      parsedTo = to;
      parsedText = m[2].trim();
      var hasDeal = /DEAL\s+WITH:/i.test(parsedText);
      parseStatusEl.textContent =
        "Empfänger erkannt: " + to + (hasDeal ? " (enthält einen DEAL-Block)" : "");
      parseStatusEl.className = "parse-status success";
      saveBtn.disabled = false;
    }
    tryParse();
    answerBox.addEventListener("input", tryParse);

    saveBtn.addEventListener("click", function () {
      if (!parsedTo) return;
      api("POST", "/api/forum/message", { from_id: agent.id, to_id: parsedTo, text: parsedText })
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

  // ---------- record deal modal ----------

  function openRecordDealModal() {
    var active = forumState.active_agent_ids;
    var options = active
      .map(function (id) { return '<option value="' + id + '">' + escapeHtml(agentById(id).name) + "</option>"; })
      .join("");
    var html =
      "<h2>Deal aufzeichnen</h2>" +
      '<p class="helper-text">Füge die vollständige Antwort ein, die den <code>DEAL WITH:</code> / <code>LEADER:</code>-Block plus 10 Punkte enthält.</p>' +
      '<label class="helper-text" for="deal-submitter">Eingereicht von</label>' +
      '<select id="deal-submitter" class="answer-box" style="min-height:auto;padding:8px;">' + options + "</select>" +
      '<textarea class="answer-box" id="deal-text" style="margin-top:10px;" placeholder="DEAL WITH: ...\nLEADER: ...\n1. ...\n...\n10. ..."></textarea>' +
      '<div class="parse-status" id="parse-status">Warte auf Eingabe...</div>' +
      '<button class="primary" id="record-btn">Deal speichern</button>';
    openModal(html);

    var textBox = document.getElementById("deal-text");
    var submitterSelect = document.getElementById("deal-submitter");
    var parseStatusEl = document.getElementById("parse-status");

    document.getElementById("record-btn").addEventListener("click", function () {
      api("POST", "/api/forum/record_deal", {
        agent_id: submitterSelect.value,
        raw_text: textBox.value,
      })
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

  refresh();
  setInterval(refresh, 5000);
})();
