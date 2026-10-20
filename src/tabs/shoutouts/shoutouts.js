  // ---------- shoutouts ----------
  function trigger(t, reason, opts) {
    opts = opts || {};
    if (!t.login) return;
    touchSession();
    if (!opts.force && session.done[t.login]) return;
    session.done[t.login] = Date.now(); saveSession();
    renderList();
    slog(`${t.display} ${reason}, shoutout coming up`);
    const wait = Math.max(0, Number(cfg.delay) || 0) * 1000;
    setTimeout(() => doShout(t), wait);
  }

  const fill = (tpl, t, game) => (tpl || DEFAULT_TEMPLATE)
    .replace(/\{name\}/g, t.display || t.login)
    .replace(/\{login\}/g, t.login)
    .replace(/\{link\}/g, "https://twitch.tv/" + t.login)
    .replace(/\{game\}/g, game || "something awesome");

  async function doShout(t) {
    const entry = list.find(x => x.login === t.login);
    let game = "";
    if (cfg.token) {
      try {
        if (!t.id) {
          const u = await helix("users?login=" + encodeURIComponent(t.login));
          const d = u.data && u.data[0];
          if (d) { t.id = d.id; t.display = d.display_name || t.display; }
        }
        if (t.id) {
          const c = await helix("channels?broadcaster_id=" + t.id);
          game = (c.data && c.data[0] && c.data[0].game_name) || "";
        }
      } catch (e) { slog(`Couldn't look up ${t.display}: ${e.message}`, true); }
    }
    const msg = fill(entry && entry.msg ? entry.msg : cfg.template, t, game);

    if (!cfg.token || !chat.authed) { addPending(t, msg); return; }
    if (cfg.sendChat) {
      if (chat.send(msg)) slog(`Chat shoutout posted for ${t.display}`);
      else slog(`Couldn't post in chat for ${t.display} (chat not connected)`, true);
    }
    if (cfg.sendOfficial) {
      if (t.id) queueOfficial(t);
      else slog(`Couldn't find a Twitch account called ${t.login}`, true);
    }
  }

  // official shoutouts: one every 2 minutes
  const officialQ = [];
  let lastOfficial = store.get("lastOfficial", 0);
  let qTimer = null;
  function queueOfficial(t) {
    if (officialQ.some(x => x.login === t.login)) return;
    officialQ.push(t);
    pumpQueue();
  }
  function pumpQueue() {
    clearTimeout(qTimer);
    if (!officialQ.length) { renderQueue(); return; }
    const wait = lastOfficial + 121000 - Date.now();
    if (wait > 0) { qTimer = setTimeout(pumpQueue, wait); renderQueue(); return; }
    const t = officialQ.shift();
    lastOfficial = Date.now(); store.set("lastOfficial", lastOfficial);
    sendOfficial(t).finally(() => pumpQueue());
  }
  async function sendOfficial(t) {
    const from = cfg.channelId || cfg.userId;
    try {
      await helix(`chat/shoutouts?from_broadcaster_id=${from}&to_broadcaster_id=${t.id}&moderator_id=${cfg.userId}`, { method: "POST" });
      slog(`Twitch shoutout sent to ${t.display}`);
    } catch (e) {
      slog(`Twitch shoutout for ${t.display} didn't go through: ${e.message}`, true);
    }
  }
  function renderQueue() {
    const q = $("#soQueue");
    if (!officialQ.length) { q.textContent = ""; return; }
    const secs = Math.max(0, Math.ceil((lastOfficial + 121000 - Date.now()) / 1000));
    const mm = Math.floor(secs / 60), ss = String(secs % 60).padStart(2, "0");
    q.textContent = `Next Twitch shoutout: ${officialQ[0].display} in ${mm}:${ss}` + (officialQ.length > 1 ? ` (${officialQ.length} waiting)` : "");
  }
  setInterval(() => { if (officialQ.length) renderQueue(); }, 1000);

  // manual (not logged in)
  async function copyText(text) {
    try { await navigator.clipboard.writeText(text); return true; } catch (e) {}
    const ta = el("textarea"); ta.value = text; ta.style.position = "fixed"; ta.style.opacity = "0";
    document.body.appendChild(ta); ta.select();
    let ok = false; try { ok = document.execCommand("copy"); } catch (e) {}
    ta.remove(); return ok;
  }
  function addPending(t, msg) {
    if (pending.some(p => p.t.login === t.login)) return;
    pending.push({ t, msg });
    slog(`${t.display} is ready to shout out (copy it from “To shout out”)`);
    renderPending();
  }
  function renderPending() {
    $("#soPendingSec").classList.toggle("hide", !pending.length);
    const box = $("#soPending"); box.innerHTML = "";
    pending.forEach(p => {
      const row = el("div", "soitem");
      const who = el("span", "who", p.t.display);
      const txt = el("span", "", p.msg); txt.style.flex = "1"; txt.style.color = "var(--muted)"; txt.style.fontSize = "13px";
      const b1 = el("button", "", "Copy message");
      b1.onclick = async () => { b1.textContent = (await copyText(p.msg)) ? "Copied!" : "Copy failed"; setTimeout(() => b1.textContent = "Copy message", 1500); };
      const b2 = el("button", "", "Copy /shoutout");
      b2.onclick = async () => { b2.textContent = (await copyText("/shoutout " + p.t.login)) ? "Copied!" : "Copy failed"; setTimeout(() => b2.textContent = "Copy /shoutout", 1500); };
      const b3 = el("button", "ghost", "Done");
      b3.onclick = () => { pending = pending.filter(x => x !== p); renderPending(); };
      row.append(who, txt, b1, b2, b3);
      box.appendChild(row);
    });
  }

  // ---------- list editing ----------
  function addPeople() {
    const raw = $("#soAdd").value;
    const names = raw.split(/[\s,;]+/).map(normName).filter(Boolean);
    const bad = [], added = [];
    names.forEach(n => {
      if (!/^[a-z0-9_]{2,25}$/.test(n)) { bad.push(n); return; }
      if (list.some(x => x.login === n) || added.includes(n)) return;
      list.push({ login: n, display: "", id: "", msg: "" });
      added.push(n);
    });
    list.sort((a, b) => a.login.localeCompare(b.login));
    saveList(); renderList();
    $("#soAdd").value = "";
    if (added.length) slog(`Added ${added.join(", ")} to the shoutout list`);
    if (bad.length) slog(`Skipped (not valid Twitch names): ${bad.join(", ")}`, true);
  }
  $("#soAddBtn").onclick = addPeople;
  $("#soAdd").addEventListener("keydown", e => { if (e.key === "Enter") addPeople(); });

  function renderList() {
    const box = $("#soList"); box.innerHTML = "";
    if (!list.length) {
      box.appendChild(el("div", "empty", "No one on the list yet. Add the streamers you want to shout out."));
    }
    list.forEach(e => {
      const row = el("div", "soitem");
      const who = el("span", "who", e.display || e.login);
      const doneAt = session && session.done[e.login];
      const chip = el("span", "chip" + (doneAt ? " done" : ""), doneAt ? `✓ shouted ${timeStr(doneAt)}` : "not yet this stream");
      const msg = el("input");
      msg.placeholder = "Custom message (leave blank to use the default)";
      msg.value = e.msg || "";
      msg.oninput = () => { e.msg = msg.value; saveList(); };
      const shout = el("button", "", "Shout now");
      shout.onclick = () => trigger({ login: e.login, display: e.display || e.login, id: e.id || "" }, "manual shoutout", { force: true });
      const del = el("button", "danger", "Remove");
      del.onclick = () => { list = list.filter(x => x !== e); saveList(); renderList(); };
      row.append(who, chip, msg, shout, del);
      box.appendChild(row);
    });
    const n = session ? Object.keys(session.done).length : 0;
    $("#soSessionInfo").textContent = `${list.length} on the list · ${n} shouted out this stream`;
  }
  $("#soReset").onclick = () => {
    session = newSession(); saveSession(); pending = []; renderPending(); renderList();
    slog("Reset: everyone can be shouted out again");
  };

  // ---------- settings ----------
  const bindCheck = (id, key) => { const c = $(id); c.checked = !!cfg[key]; c.onchange = () => { cfg[key] = c.checked; saveCfg(); }; };
  bindCheck("#soChat", "sendChat");
  bindCheck("#soOfficial", "sendOfficial");
  bindCheck("#soRaid", "raiders");
  $("#soTemplate").value = cfg.template;
  $("#soTemplate").oninput = () => { cfg.template = $("#soTemplate").value || DEFAULT_TEMPLATE; saveCfg(); };
  $("#soDelay").value = cfg.delay;
  $("#soDelay").oninput = () => { cfg.delay = Math.max(0, parseFloat($("#soDelay").value) || 0); saveCfg(); };

