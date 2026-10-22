(() => {
  "use strict";
  const $ = s => document.querySelector(s);
  const store = {
    get(k, d) { try { const v = localStorage.getItem("streamhub." + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem("streamhub." + k, JSON.stringify(v)); } catch (e) {} }
  };
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  const timeStr = t => new Date(t).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

  // the status badges can be shortened on smaller screens, so the full text shows on hover
  document.querySelectorAll("header .pill > span:last-child").forEach(el => {
    const t = () => { el.parentElement.title = el.textContent; };
    t(); new MutationObserver(t).observe(el, { childList: true, characterData: true, subtree: true });
  });
  // ---------- tabs ----------
  const tabBtns = document.querySelectorAll(".tabs button");
  // the tab buttons get their own row when they don't fit beside the title and status pills
  (() => {
    const hd = document.querySelector("header"), tb = document.querySelector("header .tabs"); if (!hd || !tb) return;
    const fit = () => {
      hd.classList.remove("tabsrow");
      const pills = hd.querySelector(".pills"), last = tb.lastElementChild;
      const clash = tb.scrollWidth > tb.clientWidth + 2 || (pills && last && last.getBoundingClientRect().right > pills.getBoundingClientRect().left - 4 && Math.abs(last.getBoundingClientRect().top - pills.getBoundingClientRect().top) < 30);
      if (clash) hd.classList.add("tabsrow");
    };
    addEventListener("resize", fit); if (window.ResizeObserver) new ResizeObserver(fit).observe(hd.querySelector(".pills") || hd);
    setTimeout(fit, 0); setTimeout(fit, 1500);
  })();
  function showTab(name) {
    tabBtns.forEach(b => b.classList.toggle("active", b.dataset.tab === name));
    document.querySelectorAll(".tab").forEach(t => t.classList.toggle("hide", t.id !== "tab-" + name));
    store.set("tab", name);
  }
  tabBtns.forEach(b => b.onclick = () => showTab(b.dataset.tab));
  showTab(["conn", "pads", "shout", "overlay", "cam", "trig", "keys", "voice", "live", "pcs"].includes(store.get("tab", "")) ? store.get("tab", "") : (localStorage.getItem("padbridge.conn") ? "pads" : "conn"));

  // ---------- state ----------
  const DEFAULT_TEMPLATE = "Go show some love to {name}! Find them at {link} – last seen playing {game}.";
  const cfg = Object.assign({
    channel: "", channelId: "", clientId: "", token: "", login: "", userId: "",
    sendChat: true, sendOfficial: true, raiders: true, delay: 2, template: DEFAULT_TEMPLATE
  }, store.get("cfg", {}));
  const saveCfg = () => store.set("cfg", cfg);
  let list = store.get("list", []);           // [{login, display, id, msg}]
  const saveList = () => store.set("list", list);
  let session = store.get("session", null);
  const SIX_HOURS = 6 * 3600 * 1000;
  const newSession = () => ({ started: Date.now(), last: Date.now(), done: {} });
  const saveSession = () => store.set("session", session);
  let pending = [];

  // ---------- logging ----------
  const logEl = $("#soLog");
  let logStarted = false;
  function slog(text, isErr) {
    if (!logStarted) { logEl.innerHTML = ""; logStarted = true; }
    const d = el("div", isErr ? "err" : "", `${new Date().toLocaleTimeString()}  ${text}`);
    logEl.prepend(d);
    while (logEl.children.length > 60) logEl.lastChild.remove();
  }
  function setTw(text, cls) {
    $("#twStatus").textContent = "Twitch: " + text;
    $("#twDot").className = "dot " + (cls || "");
  }
  function authMsg(text, isErr) {
    const m = $("#twAuthMsg"); m.textContent = text; m.style.color = isErr ? "var(--bad)" : "var(--good)";
  }

  // ---------- Twitch API ----------
  async function helix(path, opts) {
    opts = opts || {};
    const r = await fetch("https://api.twitch.tv/helix/" + path, {
      method: opts.method || "GET",
      headers: { "Authorization": "Bearer " + cfg.token, "Client-Id": cfg.clientId }
    });
    if (r.status === 204) return {};
    let j = {}; try { j = await r.json(); } catch (e) {}
    if (r.status === 401) { authExpired(); throw new Error("your Twitch login has expired, log in again"); }
    if (!r.ok) throw new Error(j.message || ("Twitch error " + r.status));
    return j;
  }
  function authExpired() {
    if (!cfg.token) return;
    cfg.token = ""; saveCfg(); renderAuth();
    slog("Twitch login expired. Open “Log in” and log in again.", true);
  }
  async function resolveChannelId() {
    if (!cfg.token || !cfg.channel) return;
    try {
      const u = await helix("users?login=" + encodeURIComponent(cfg.channel));
      cfg.channelId = (u.data && u.data[0] && u.data[0].id) || "";
      saveCfg();
      if (cfg.channelId && cfg.login && cfg.channel !== cfg.login)
        slog(`Logged in as ${cfg.login} but reading #${cfg.channel}. Official shoutouts need ${cfg.login} to be a mod there.`);
    } catch (e) { slog("Couldn't look up your channel: " + e.message, true); }
  }

  // ---------- login ----------
  function renderAuth() {
    const inn = !!cfg.token;
    $("#twLoggedOut").classList.toggle("hide", inn);
    $("#twLoggedIn").classList.toggle("hide", !inn);
    $("#twWho").textContent = inn ? `Logged in as ${cfg.login}. Shoutouts are sent automatically.` : "";
    $("#twAuthSummary").textContent = inn ? `Twitch login: ${cfg.login}` : "Log in so it can send shoutouts for you";
    renderMode();
  }
  $("#twLoginBtn").onclick = () => {
    const id = $("#twClientId").value.trim();
    if (!id) { authMsg("Paste your Client ID first.", true); return; }
    cfg.clientId = id; saveCfg();
    const state = Math.random().toString(36).slice(2) + Date.now().toString(36);
    store.set("authState", state);
    const url = "https://id.twitch.tv/oauth2/authorize?" + new URLSearchParams({
      client_id: id, redirect_uri: "http://localhost", response_type: "token",
      scope: "chat:read chat:edit moderator:manage:shoutouts channel:read:redemptions bits:read", state, force_verify: "true"
    }).toString();
    window.open(url, "_blank");
    authMsg(IN_APP ? "Log in and click Authorize in the Twitch window." : "Twitch opened in a new tab. Approve it, then copy that tab's address into step 3.");
  };
  $("#twFinishBtn").onclick = finishLogin;
  // In the desktop app, the app catches Twitch's reply and hands it straight over.
  const IN_APP = /Electron/i.test(navigator.userAgent);
  if (IN_APP) { $("#twStep3").classList.add("hide"); $("#twAppNote").classList.remove("hide"); }
  window.__twitchAuth = url => { $("#twPaste").value = url; finishLogin(); };
  $("#twPaste").addEventListener("keydown", e => { if (e.key === "Enter") finishLogin(); });
  async function finishLogin() {
    const raw = $("#twPaste").value.trim();
    if (!raw) return;
    let frag = raw;
    const hi = raw.indexOf("#"), qi = raw.indexOf("?");
    if (hi >= 0) frag = raw.slice(hi + 1); else if (qi >= 0) frag = raw.slice(qi + 1);
    const p = new URLSearchParams(frag);
    if (p.get("error")) { authMsg("Twitch said: " + (p.get("error_description") || p.get("error")).replace(/\+/g, " "), true); return; }
    let token = p.get("access_token");
    if (!token && /^[a-z0-9]{20,40}$/i.test(raw)) token = raw;
    if (!token) { authMsg("Couldn't find a login in that. Copy the full address from the tab Twitch sent you to.", true); return; }
    const st = p.get("state");
    if (st && st !== store.get("authState", "")) { authMsg("That's from an older login attempt. Click “Log in with Twitch” again.", true); return; }
    cfg.clientId = $("#twClientId").value.trim() || cfg.clientId;
    cfg.token = token;
    try {
      const u = await helix("users");
      const me = u.data && u.data[0];
      if (!me) throw new Error("Twitch didn't return your account");
      cfg.login = me.login; cfg.userId = me.id;
      if (!cfg.channel) { cfg.channel = me.login; $("#twChannel").value = me.login; }
      saveCfg();
      $("#twPaste").value = "";
      store.set("authState", "");
      renderAuth();
      authMsg("Logged in. You can close the Twitch tab.");
      slog(`Logged in as ${me.display_name}`);
      await resolveChannelId();
      chat.connect();
    } catch (e) {
      cfg.token = ""; saveCfg(); renderAuth();
      authMsg("Login didn't work: " + e.message, true);
    }
  }
  // ---------- channel point redemptions (Twitch EventSub, live over a websocket) ----------
  async function helixPost(path, body) {
    const r = await fetch("https://api.twitch.tv/helix/" + path, { method: "POST", headers: { "Authorization": "Bearer " + cfg.token, "Client-Id": cfg.clientId, "Content-Type": "application/json" }, body: JSON.stringify(body) });
    let j = {}; try { j = await r.json(); } catch (e) {}
    if (r.status === 401) { authExpired(); throw new Error("your Twitch login has expired, log in again"); }
    if (!r.ok) throw new Error(j.message || ("Twitch error " + r.status));
    return j;
  }
  const es = { ws: null, sid: "", want: false, ok: false, err: "", retry: null };
  window.hubRedeemHooks = window.hubRedeemHooks || [];
  const esStatus = () => window.dispatchEvent(new Event("tos-redeem-status"));
  async function tokenScopes() {
    if (!cfg.token) return [];
    try { const r = await fetch("https://id.twitch.tv/oauth2/validate", { headers: { Authorization: "OAuth " + cfg.token } }); if (!r.ok) return []; return (await r.json()).scopes || []; } catch (e) { return null; }
  }
  function esConnect(url) {
    clearTimeout(es.retry);
    if (!cfg.token || !cfg.userId) { es.ok = false; es.err = "login"; esStatus(); return; }
    try { if (es.ws && !url) { es.ws.onclose = null; es.ws.close(); } } catch (e) {}
    const ws = new WebSocket(url || "wss://eventsub.wss.twitch.tv/ws"), old = es.ws; es.ws = ws;
    ws.onmessage = async ev => {
      let m; try { m = JSON.parse(ev.data); } catch (e) { return; }
      const t = m.metadata && m.metadata.message_type;
      if (t === "session_welcome") {
        es.sid = m.payload.session.id;
        if (old && url) { try { old.onclose = null; old.close(); } catch (e) {} }   // moved to Twitch's new server: the old link can go
        if (!url) {
          const sub = type => helixPost("eventsub/subscriptions", { type, version: "1", condition: { broadcaster_user_id: cfg.userId }, transport: { method: "websocket", session_id: es.sid } });
          const errs = [];
          es.points = es.bits = false;
          try { await sub("channel.channel_points_custom_reward_redemption.add"); es.points = true; } catch (e) { errs.push("channel points: " + e.message); }
          try { await sub("channel.bits.use"); es.bits = true; } catch (e) { errs.push("power-ups: " + e.message); }   // cheers, Power-ups and custom Power-ups
          es.ok = es.points || es.bits; es.err = errs.join(" · ");
        } else es.ok = true;
        esStatus();
      } else if (t === "session_reconnect") esConnect(m.payload.session.reconnect_url);
      else if (t === "notification" && /channel_points/.test(m.payload.subscription.type)) {
        const e = m.payload.event;
        window.hubRedeemHooks.forEach(f => { try { f({ reward: e.reward.title, rewardId: e.reward.id, cost: e.reward.cost, user: e.user_name, input: e.user_input || "" }); } catch (x) {} });
      } else if (t === "notification" && m.payload.subscription.type === "channel.bits.use") {
        const e = m.payload.event; if (e.type === "cheer") return;   // plain cheers come through chat already
        const name = e.type === "custom_power_up" ? (e.custom_power_up && e.custom_power_up.title) || "" : "pu:" + ((e.power_up && e.power_up.type) || "");
        (window.hubBitsHooks || []).forEach(f => { try { f({ name, bits: e.bits, user: e.user_name }); } catch (x) {} });
      } else if (t === "revocation") { es.ok = false; es.err = "Twitch stopped it (" + m.payload.subscription.status + ")"; esStatus(); }
    };
    ws.onclose = () => { if (es.ws !== ws) return; es.ok = false; esStatus(); if (es.want) es.retry = setTimeout(() => esConnect(), 5000); };
  }
  window.hubTwitch = {
    loggedIn: () => !!cfg.token && !!cfg.userId,
    login: () => { const d = $("#twAuth"); if (d) d.open = true; showTab("conn"); const b = $("#twLoginBtn"); if (b) b.scrollIntoView({ block: "center", behavior: "smooth" }); },
    canRedeem: async () => { const sc = await tokenScopes(); return sc === null ? null : sc.includes("channel:read:redemptions") && sc.includes("bits:read"); },
    rewards: async () => { const j = await helix("channel_points/custom_rewards?broadcaster_id=" + encodeURIComponent(cfg.userId)); return (j.data || []).map(r => ({ id: r.id, title: r.title, cost: r.cost })); },
    start: () => { es.want = true; if (!es.ok) esConnect(); },
    stop: () => { es.want = false; clearTimeout(es.retry); try { if (es.ws) { es.ws.onclose = null; es.ws.close(); } } catch (e) {} es.ws = null; es.ok = false; esStatus(); },
    status: () => ({ ok: es.ok, err: es.err, want: es.want, points: !!es.points, bits: !!es.bits })
  };
  $("#twLogoutBtn").onclick = () => {
    cfg.token = ""; cfg.login = ""; cfg.userId = ""; cfg.channelId = ""; saveCfg();
    renderAuth(); authMsg("Logged out.");
    slog("Logged out of Twitch");
    if (chat.want) chat.connect();
  };

  // ---------- IRC chat ----------
  function parseIrc(line) {
    const m = { tags: {}, prefix: "", command: "", params: [], trailing: "" };
    if (line[0] === "@") {
      const sp = line.indexOf(" ");
      line.slice(1, sp).split(";").forEach(kv => {
        const e = kv.indexOf("=");
        const k = e < 0 ? kv : kv.slice(0, e);
        const v = e < 0 ? "" : kv.slice(e + 1);
        m.tags[k] = v.replace(/\\(.)/g, (_, c) => ({ s: " ", ":": ";", "\\": "\\", r: "\r", n: "\n" })[c] || c);
      });
      line = line.slice(sp + 1);
    }
    if (line[0] === ":") { const sp = line.indexOf(" "); m.prefix = line.slice(1, sp); line = line.slice(sp + 1); }
    const t = line.indexOf(" :");
    if (t >= 0) { m.trailing = line.slice(t + 2); line = line.slice(0, t); }
    else if (line.startsWith(":")) { m.trailing = line.slice(1); line = ""; }
    const parts = line.split(" ").filter(Boolean);
    m.command = parts.shift() || "";
    m.params = parts;
    return m;
  }
  // other tabs (like Webcam) can listen to chat too
  const runHooks = m => (window.hubChatHooks || []).forEach(f => { try { f(m); } catch (e) {} });
  const normName = s => (s || "").trim().replace(/^@/, "").replace(/^https?:\/\/(www\.)?twitch\.tv\//i, "").replace(/[\/?#].*$/, "").toLowerCase();

  const chat = {
    ws: null, want: false, retry: null, joined: false, nick: "", authed: false,
    connect() {
      this.close(true);
      const ch = normName($("#twChannel").value);
      if (!ch) { setTw("enter your channel", "bad"); $("#twMode").textContent = "Type your Twitch username, then connect."; return; }
      $("#twChannel").value = ch;
      if (ch !== cfg.channel) { cfg.channel = ch; cfg.channelId = ""; saveCfg(); resolveChannelId(); }
      this.want = true;
      this.authed = !!(cfg.token && cfg.login);
      this.nick = this.authed ? cfg.login : "justinfan" + (10000 + Math.floor(Math.random() * 80000));
      setTw("connecting…", "warn");
      $("#twConnectBtn").textContent = "Disconnect";
      let ws;
      try { ws = new WebSocket("wss://irc-ws.chat.twitch.tv:443"); }
      catch (e) { setTw("couldn't connect", "bad"); return; }
      this.ws = ws;
      ws.onopen = () => {
        ws.send("CAP REQ :twitch.tv/tags twitch.tv/commands");
        if (this.authed) ws.send("PASS oauth:" + cfg.token);
        ws.send("NICK " + this.nick);
        ws.send("JOIN #" + ch);
      };
      ws.onmessage = ev => String(ev.data).split("\r\n").forEach(l => { if (l) this.line(l); });
      ws.onclose = () => {
        if (this.ws !== ws) return;
        this.ws = null; this.joined = false;
        renderMode();
        if (this.want) {
          setTw("reconnecting…", "warn");
          clearTimeout(this.retry);
          this.retry = setTimeout(() => { if (this.want) this.connect(); }, 5000);
        } else setTw("not connected", "");
      };
      ws.onerror = () => {};
    },
    close(silent) {
      this.want = false; clearTimeout(this.retry);
      if (this.ws) { const w = this.ws; this.ws = null; try { w.close(); } catch (e) {} }
      this.joined = false;
      $("#twConnectBtn").textContent = "Connect to chat";
      if (!silent) { setTw("not connected", ""); renderMode(); }
    },
    line(raw) {
      const m = parseIrc(raw);
      switch (m.command) {
        case "PING": if (this.ws) this.ws.send("PONG :" + (m.trailing || "tmi.twitch.tv")); break;
        case "RECONNECT": if (this.ws) this.ws.close(); break;
        case "JOIN":
          if (m.prefix.split("!")[0] === this.nick) {
            this.joined = true;
            setTw(this.authed ? "connected" : "reading chat", this.authed ? "good" : "warn");
            renderMode();
            slog(`Joined #${cfg.channel}'s chat${this.authed ? "" : " (read-only)"}`);
            feedClear();
          }
          break;
        case "NOTICE":
          if (/authentication failed|improperly formatted auth|invalid nick/i.test(m.trailing)) {
            slog("Twitch rejected the chat login. Log in again.", true);
            authExpired();
            this.want = false;
            setTw("login failed", "bad");
            if (this.ws) this.ws.close();
          } else if (m.trailing) slog("Twitch: " + m.trailing);
          break;
        case "PRIVMSG": onChat(m); runHooks(m); break;
        case "USERNOTICE": if (m.tags["msg-id"] === "raid") onRaid(m); runHooks(m); break;
        case "CLEARMSG": case "CLEARCHAT": runHooks(m); break;
      }
    },
    send(text) {
      if (!this.ws || !this.joined || !this.authed) return false;
      this.ws.send(`PRIVMSG #${cfg.channel} :${text.replace(/[\r\n]+/g, " ")}`);
      return true;
    }
  };
  window.hubChat = chat;
  $("#twConnectBtn").onclick = () => { if (chat.want || chat.ws) chat.close(); else chat.connect(); };
  $("#twChannel").addEventListener("keydown", e => { if (e.key === "Enter") chat.connect(); });

  function renderMode() {
    let t;
    if (!chat.joined) t = chat.want ? "Connecting to chat…" : "Not connected.";
    else if (chat.authed) t = `Connected to #${cfg.channel} as ${cfg.login}. Shoutouts are sent for you.`;
    else t = `Reading #${cfg.channel}'s chat. You're not logged in, so shoutouts appear under “To shout out” for you to copy.`;
    $("#twMode").textContent = t;
  }

  // ---------- live chat feed ----------
  const feed = $("#chatFeed");
  function feedClear() { feed.innerHTML = ""; }
  function feedLine(name, text, color, hl, extraCls) {
    if (feed.firstChild && feed.firstChild.classList && feed.firstChild.classList.contains("muted")) feedClear();
    const d = el("div", (hl ? "hl " : "") + (extraCls || ""));
    const b = el("b", "", name);
    if (color) b.style.color = color;
    d.append(b, document.createTextNode(text ? ": " + text : ""));
    feed.appendChild(d);
    while (feed.children.length > 80) feed.firstChild.remove();
    feed.scrollTop = feed.scrollHeight;
  }

  function touchSession() {
    if (!session || Date.now() - (session.last || 0) > SIX_HOURS) {
      const had = session && Object.keys(session.done).length;
      session = newSession();
      if (had) slog("New stream session started (6+ hours since last use)");
    }
    session.last = Date.now();
    saveSession();
  }

  function onChat(m) {
    const login = (m.tags.login || m.prefix.split("!")[0] || "").toLowerCase();
    const display = m.tags["display-name"] || login;
    const entry = list.find(x => x.login === login);
    feedLine(display, m.trailing, m.tags.color, !!entry);
    if (!entry) return;
    let changed = false;
    if (m.tags["user-id"] && entry.id !== m.tags["user-id"]) { entry.id = m.tags["user-id"]; changed = true; }
    if (display && entry.display !== display) { entry.display = display; changed = true; }
    if (changed) saveList();
    trigger({ login, display, id: m.tags["user-id"] || entry.id || "" }, "said hi in chat");
  }

  function onRaid(m) {
    const login = (m.tags["msg-param-login"] || m.tags.login || "").toLowerCase();
    const display = m.tags["msg-param-displayName"] || m.tags["display-name"] || login;
    const viewers = m.tags["msg-param-viewerCount"] || "?";
    feedLine(display, `raided with ${viewers} viewers!`, null, true, "raid");
    slog(`${display} raided with ${viewers} viewers`);
    const onList = list.some(x => x.login === login);
    if (cfg.raiders || onList) trigger({ login, display, id: m.tags["user-id"] || "" }, "raided", { force: true });
  }

