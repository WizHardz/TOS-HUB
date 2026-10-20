(() => {
  "use strict";
  // ---------- Chat on my screen: a private chat window over your game (desktop app) ----------
  const $ = s => document.querySelector(s);
  const SC_HTML = "<!doctype html>\n<html lang=\"en\">\n<head>\n<meta charset=\"utf-8\">\n<title>TOS HUB Chat<\/title>\n<style>\n  /* TOS HUB's private chat window: floats over your game, only you see it. */\n  :root{--fs:17px;--bg:.55;--c1:#2ff3ff;--c2:#b14dff;--w:100%}\n  html,body{margin:0;height:100%;background:transparent;overflow:hidden;font-family:Rubik, \"Segoe UI\", system-ui, sans-serif;color:#fff;user-select:none}\n  #wrap{position:absolute;inset:0;display:flex;flex-direction:column;justify-content:flex-end;padding:6px;box-sizing:border-box;gap:4px}\n  .m{background:rgba(10,4,22,var(--bg));border-radius:10px;padding:5px 10px 6px;font-size:var(--fs);line-height:1.3;word-wrap:break-word;overflow-wrap:anywhere;\n    text-shadow:0 1px 2px #000, 0 0 3px #000;animation:in .18s ease-out;transition:opacity .8s, transform .8s;border-left:3px solid transparent}\n  .m.gone{opacity:0;transform:translateX(12px)}\n  @keyframes in{from{opacity:0;transform:translateY(6px)}}\n  .m .n{font-weight:800}\n  .m .b{display:inline-block;font:800 calc(var(--fs) * .55)/1 system-ui, sans-serif;padding:3px 4px 2px;border-radius:4px;margin-right:4px;vertical-align:2px;color:#000;text-shadow:none}\n  .b.broadcaster{background:#ff4d5e}.b.moderator{background:#3dff8a}.b.vip{background:#ff4fd8}.b.subscriber,.b.founder{background:#b14dff;color:#fff}.b.first{background:#ffe14d}\n  .m img{height:1.6em;vertical-align:-.45em;margin:0 1px}\n  .m.mention{border-left-color:#ffe14d;background:rgba(70,55,0,calc(var(--bg) + .15))}\n  .m.first{border-left-color:#ffe14d}\n  .m.action .t{font-style:italic}\n  .m.event{border-left-color:var(--c2);background:rgba(50,10,80,calc(var(--bg) + .15));font-weight:600}\n  .m.event .ic{margin-right:4px}\n  .m.bits{border-left-color:#ffe14d}\n  .m.deleted .t{opacity:.45;text-decoration:line-through}\n  body.nobadges .b:not(.first){display:none}\n  /* move & resize mode */\n  #move{display:none;position:absolute;inset:0;border:2px dashed var(--c1);border-radius:12px;background:rgba(47,243,255,.08);-webkit-app-region:drag;z-index:5}\n  body.unlocked #move{display:block}\n  #move .tip{position:absolute;left:50%;top:10px;transform:translateX(-50%);background:rgba(10,4,22,.92);border:1px solid var(--c1);border-radius:10px;padding:8px 12px;\n    font:600 13px/1.35 system-ui, sans-serif;text-align:center;white-space:nowrap;max-width:92%;overflow:hidden;text-overflow:ellipsis}\n  #move button{-webkit-app-region:no-drag;margin-top:6px;font:700 13px system-ui;background:var(--c1);color:#000;border:0;border-radius:8px;padding:6px 14px;cursor:pointer}\n  #grip{position:absolute;right:0;bottom:0;width:26px;height:26px;-webkit-app-region:no-drag;cursor:nwse-resize;\n    background:linear-gradient(135deg,transparent 50%,var(--c1) 50%);border-bottom-right-radius:12px}\n  #empty{display:none;position:absolute;left:50%;bottom:14px;transform:translateX(-50%);font:600 13px system-ui;color:rgba(255,255,255,.75);text-shadow:0 1px 2px #000}\n  body.unlocked #empty{display:block}\n<\/style>\n<\/head>\n<body>\n<div id=\"wrap\"><\/div>\n<div id=\"move\"><div class=\"tip\">Drag to move · drag the corner to resize<br><button id=\"lockBtn\">Done<\/button><\/div><div id=\"grip\"><\/div><\/div>\n<div id=\"empty\">Chat will appear here<\/div>\n<script>\n(() => {\n  \"use strict\";\n  const $ = id => document.getElementById(id);\n  const wrap = $(\"wrap\");\n  const cfg = { size: 17, bg: 55, fade: 0, max: 30, emotes: true, badges: true, colours: true, alerts: true, hideCmds: false };\n  const items = [];\n  function apply() {\n    document.documentElement.style.setProperty(\"--fs\", (cfg.size || 17) + \"px\");\n    document.documentElement.style.setProperty(\"--bg\", Math.max(0, Math.min(1, (cfg.bg == null ? 55 : cfg.bg) / 100)));\n    document.body.classList.toggle(\"nobadges\", !cfg.badges);\n    trim();\n  }\n  // names in dark colours are hard to read on a dark box, so they're lifted a bit\n  function readable(hex) {\n    if (!/^#[0-9a-f]{6}$/i.test(hex || \"\")) return \"#b9a6ff\";\n    let r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16);\n    const lum = (r * 299 + g * 587 + b * 114) / 1000;\n    if (lum < 110) { const k = (110 - lum) / 255 + .25; r += (255 - r) * k; g += (255 - g) * k; b += (255 - b) * k; }\n    return `rgb(${r | 0},${g | 0},${b | 0})`;\n  }\n  // splits the message into text and emote pictures (Twitch counts positions in characters)\n  function body(text, emotes) {\n    const frag = document.createDocumentFragment();\n    const chars = Array.from(text || \"\");\n    const spots = [];\n    if (cfg.emotes && emotes) emotes.split(\"/\").forEach(part => {\n      const [id, ranges] = part.split(\":\"); if (!id || !ranges) return;\n      ranges.split(\",\").forEach(r => { const [a, b] = r.split(\"-\").map(Number); if (b >= a) spots.push([a, b, id]); });\n    });\n    spots.sort((x, y) => x[0] - y[0]);\n    let i = 0;\n    spots.forEach(([a, b, id]) => {\n      if (a < i) return;\n      if (a > i) frag.append(chars.slice(i, a).join(\"\"));\n      const img = document.createElement(\"img\");\n      img.src = `https://static-cdn.jtvnw.net/emoticons/v2/${encodeURIComponent(id)}/default/dark/2.0`;\n      img.alt = chars.slice(a, b + 1).join(\"\"); img.onerror = () => img.replaceWith(img.alt);\n      frag.append(img); i = b + 1;\n    });\n    if (i < chars.length) frag.append(chars.slice(i).join(\"\"));\n    return frag;\n  }\n  function add(m) {\n    if (m.kind === \"chat\" && cfg.hideCmds && /^!/.test(m.text || \"\")) return;\n    if (m.kind === \"event\" && !cfg.alerts) return;\n    const d = document.createElement(\"div\");\n    d.className = \"m\" + (m.kind === \"event\" ? \" event\" : \"\") + (m.mention ? \" mention\" : \"\") + (m.first ? \" first\" : \"\") + (m.action ? \" action\" : \"\") + (m.bits ? \" bits\" : \"\");\n    if (m.kind === \"event\") {\n      d.append(Object.assign(document.createElement(\"span\"), { className: \"ic\", textContent: m.icon || \"✨\" }), m.text || \"\");\n      if (m.say) { d.append(document.createElement(\"br\")); const t = document.createElement(\"span\"); t.className = \"t\"; t.append(body(m.say, m.emotes)); d.append(t); }\n    } else {\n      if (m.first) d.append(Object.assign(document.createElement(\"span\"), { className: \"b first\", textContent: \"FIRST\" }));\n      (m.badges || []).forEach(b => { const lab = { broadcaster: \"LIVE\", moderator: \"MOD\", vip: \"VIP\", subscriber: \"SUB\", founder: \"SUB\" }[b]; if (lab) d.append(Object.assign(document.createElement(\"span\"), { className: \"b \" + b, textContent: lab })); });\n      const n = document.createElement(\"span\"); n.className = \"n\"; n.textContent = m.name || \"?\";\n      n.style.color = cfg.colours ? readable(m.color) : \"#cbb8ff\";\n      d.append(n, m.action ? \" \" : \": \");\n      const t = document.createElement(\"span\"); t.className = \"t\"; t.append(body(m.text, m.emotes));\n      if (m.bits) t.prepend(`💎${m.bits} `);\n      d.append(t);\n    }\n    d.dataset.id = m.id || \"\"; d.dataset.user = (m.login || \"\").toLowerCase();\n    wrap.append(d);\n    const it = { el: d, at: Date.now() };\n    items.push(it);\n    trim();\n  }\n  function trim() {\n    while (items.length > Math.max(3, cfg.max || 30)) items.shift().el.remove();\n    // drop anything that has scrolled out of the top of the window\n    while (items.length > 1 && items[0].el.offsetTop < 0) items.shift().el.remove();\n  }\n  function clear(m) {\n    if (m.all) { items.splice(0).forEach(i => i.el.remove()); return; }\n    items.forEach(i => { if ((m.id && i.el.dataset.id === m.id) || (m.user && i.el.dataset.user === m.user.toLowerCase())) i.el.classList.add(\"deleted\"); });\n  }\n  setInterval(() => {\n    if (!cfg.fade) return;\n    const now = Date.now();\n    items.forEach(i => { if (!i.gone && now - i.at > cfg.fade * 1000) { i.gone = true; i.el.classList.add(\"gone\"); setTimeout(() => { i.el.remove(); const k = items.indexOf(i); if (k >= 0) items.splice(k, 1); }, 900); } });\n  }, 500);\n  function handle(m) {\n    if (!m || typeof m !== \"object\") return;\n    if (m.type === \"cfg\") { Object.assign(cfg, m.cfg || {}); apply(); }\n    else if (m.type === \"msg\") add(m.m);\n    else if (m.type === \"clear\") clear(m);\n    else if (m.type === \"mode\") document.body.classList.toggle(\"unlocked\", !!m.unlocked);\n  }\n  window.screenChat = handle;\n  window.addEventListener(\"message\", e => { if (e.source === window.parent) handle(e.data); });\n  if (window.tosChat) {\n    window.tosChat.onMsg(handle);\n    $(\"lockBtn\").onclick = () => window.tosChat.lock();\n    // resizing (see-through windows can't be resized from their edges, so there's a corner grip)\n    const grip = $(\"grip\");\n    let start = null;\n    grip.addEventListener(\"pointerdown\", e => { grip.setPointerCapture(e.pointerId); start = { x: e.screenX, y: e.screenY }; });\n    grip.addEventListener(\"pointermove\", e => { if (!start) return; window.tosChat.resize(e.screenX - start.x, e.screenY - start.y); start = { x: e.screenX, y: e.screenY }; });\n    grip.addEventListener(\"pointerup\", () => { start = null; window.tosChat.resize(0, 0, true); });\n  } else $(\"lockBtn\").onclick = () => handle({ type: \"mode\", unlocked: false });\n  apply();\n})();\n<\/script>\n<\/body>\n<\/html>\n";
  const ls = {
    get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  };
  const D = { on: false, size: 17, bg: 55, fade: 0, max: 30, emotes: true, badges: true, colours: true, alerts: true, hideCmds: false, mentions: true, hideFromCapture: true,
    ding: false, dingWhen: "first", dingSound: "chime", dingVol: 50, dingOut: "" };
  const S = Object.assign({}, D, ls.get("streamhub.screenchat", {}) || {});
  const save = () => ls.set("streamhub.screenchat", S);
  const inApp = !!(window.tosHub && window.tosHub.screenChat);
  let state = { open: false, visible: false, unlocked: false, keys: {} };
  const scMsg = (t, cls) => { const m = $("#scMsg"); m.textContent = t || ""; m.className = "note " + (cls || ""); };

  // ---- preview (works anywhere) ----
  const frame = $("#scFrame");
  frame.srcdoc = SC_HTML;
  const toPrev = m => { try { frame.contentWindow.postMessage(m, "*"); } catch (e) {} };
  const SAMPLES = [
    { kind: "chat", name: "FrogWizard", color: "#3dff8a", badges: ["subscriber"], text: "that fireball was huge 🔥" },
    { kind: "event", icon: "🚀", text: "BigWizardEnergy is raiding with 12 viewers!" },
    { kind: "chat", name: "pixelmage", color: "#1e1e8f", badges: ["moderator"], text: "welcome raiders! type !play to join the next round" },
    { kind: "chat", name: "NewPerson22", color: "#ff7a1a", badges: [], first: true, text: "first time here, love the hat" },
    { kind: "chat", name: "spellslinger", color: "#ff4fd8", badges: ["vip"], text: "@you can you do the meteor again?", mention: true }
  ];
  frame.onload = () => { toPrev({ type: "cfg", cfg: S }); SAMPLES.forEach(m => toPrev({ type: "msg", m })); };

  const send = async (cmd, data) => {
    if (!inApp) return state;
    try { state = await window.tosHub.screenChat(cmd, data); } catch (e) {}
    sync(); return state;
  };
  if (inApp && window.tosHub.onScreenChat) window.tosHub.onScreenChat(st => { state = st; sync(); });

  // ---- chat → window ----
  function channel() { try { return ((ls.get("streamhub.cfg", {}) || {}).channel || "").toLowerCase(); } catch (e) { return ""; } }
  function convert(m) {
    const tg = m.tags || {}, login = (m.prefix || "").split("!")[0];
    if (m.command === "PRIVMSG") {
      let text = m.trailing || "", action = false;
      const am = /^\u0001ACTION (.*)\u0001$/.exec(text); if (am) { text = am[1]; action = true; }
      const ch = channel();
      const mention = S.mentions && !!ch && login.toLowerCase() !== ch && new RegExp(`(^|[^a-z0-9_])@?${ch.replace(/[^a-z0-9_]/g, "")}([^a-z0-9_]|$)`, "i").test(text);
      return { kind: "chat", id: tg.id || "", login, name: tg["display-name"] || login, color: tg.color || "", text, emotes: tg.emotes || "", action,
        badges: (tg.badges || "").split(",").map(b => b.split("/")[0]).filter(Boolean), first: tg["first-msg"] === "1", bits: tg.bits ? +tg.bits : 0, mention };
    }
    if (m.command === "USERNOTICE") {
      const id = tg["msg-id"] || "";
      const icon = id === "raid" ? "🚀" : /gift/.test(id) ? "🎁" : /sub/.test(id) ? "⭐" : id === "announcement" ? "📣" : "✨";
      return { kind: "event", icon, text: tg["system-msg"] || "", say: m.trailing || "", emotes: tg.emotes || "" };
    }
    return null;
  }
  (window.hubChatHooks = window.hubChatHooks || []).push(m => {
    if (m.command === "CLEARMSG") { const c = { id: (m.tags || {})["target-msg-id"] || "" }; toPrev(Object.assign({ type: "clear" }, c)); send("clear", c); return; }
    if (m.command === "CLEARCHAT") { const c = m.trailing ? { user: m.trailing } : { all: true }; toPrev(Object.assign({ type: "clear" }, c)); send("clear", c); return; }
    const msg = convert(m);
    if (!msg) return;
    dingFor(msg);
    toPrev({ type: "msg", m: msg });
    if (state.open) send("msg", msg);
  });

  // ---- the private alert sound ----
  const opt = (v, t, sel) => { const o = document.createElement("option"); o.value = v; o.textContent = t; if (sel) o.selected = true; return o; };
  let dingCtx = null, dingSink = null, dingLast = 0;
  async function dingCtxFor(id) {
    if (dingCtx && dingSink === id) return dingCtx;
    if (dingCtx) { try { dingCtx.close(); } catch (e) {} }
    dingCtx = new (window.AudioContext || window.webkitAudioContext)(); dingSink = id;
    if (id && dingCtx.setSinkId) { try { await dingCtx.setSinkId(id); } catch (e) { dingMsg("Couldn't use that output (" + e.message + "). Playing through the default instead.", "warn"); } }
    return dingCtx;
  }
  const dingMsg = (t, cls) => { const m = $("#scDingMsg"); if (m) { m.textContent = t || ""; m.className = "note " + (cls || ""); } };
  async function ding(force) {
    const now = Date.now();
    if (!force && now - dingLast < 1500) return;
    dingLast = now;
    try {
      const ac = await dingCtxFor(S.dingOut || ""); if (ac.state === "suspended") await ac.resume();
      const t0 = ac.currentTime + .02, vol = Math.max(.02, (S.dingVol || 50) / 100) * .5, out = ac.createGain(); out.gain.value = vol; out.connect(ac.destination);
      const note = (f, at, dur, type, f2) => { const o = ac.createOscillator(), g = ac.createGain(); o.type = type || "sine"; o.frequency.setValueAtTime(f, t0 + at); if (f2) o.frequency.exponentialRampToValueAtTime(f2, t0 + at + dur); g.gain.setValueAtTime(0, t0 + at); g.gain.linearRampToValueAtTime(1, t0 + at + .008); g.gain.exponentialRampToValueAtTime(.0008, t0 + at + dur); o.connect(g).connect(out); o.start(t0 + at); o.stop(t0 + at + dur + .05); };
      ({ chime: () => { note(1318.5, 0, .5); note(1760, .09, .6); }, pop: () => note(420, 0, .12, "sine", 1400), blip: () => { note(988, 0, .07, "square"); note(1319, .08, .09, "square"); }, coin: () => { note(988, 0, .08, "square"); note(1319, .08, .35, "square"); } }[S.dingSound] || (() => note(1318.5, 0, .5)))();
    } catch (e) { dingMsg("Couldn't play the sound: " + e.message, "err"); }
  }
  function dingFor(m) {
    if (!S.ding || !m) return;
    const w = S.dingWhen || "first";
    if (w === "all" ? true : w === "mention" ? !!m.mention : w === "first" ? (m.mention || m.first) : (m.mention || m.first || m.kind === "event" || m.bits)) ding();
  }
  async function listOutputs() {
    const sel = $("#scDingOut");
    try {
      const outs = (await navigator.mediaDevices.enumerateDevices()).filter(d => d.kind === "audiooutput" && d.deviceId !== "default" && d.deviceId !== "communications");
      sel.innerHTML = ""; sel.append(opt("", "Windows default sound output", !S.dingOut));
      outs.forEach((d, i) => sel.append(opt(d.deviceId, d.label || `Sound output ${i + 1}`, d.deviceId === S.dingOut)));
      dingRodeHint();
      if (outs.length && !outs[0].label) dingMsg("Device names show once TOS HUB has been allowed to use a mic (turn on Mic reactions once, or click Test).", "");
    } catch (e) {}
  }

  // ---- controls ----
  function sync() {
    $("#scShow").textContent = state.open ? (state.visible ? "Hide chat from my screen" : "Show it again") : "Show chat on my screen";
    $("#scShow").className = state.open && state.visible ? "ghost" : "primary";
    $("#scMove").textContent = state.unlocked ? "Done moving" : "Move & resize";
    $("#scMove").disabled = !state.open;
    if (!inApp) { scMsg("This window floats over your game, so it needs the TOS HUB desktop app. The preview shows how it'll look.", "warn"); return; }
    if (!state.open) scMsg("Off.", "");
    else if (state.unlocked) scMsg("Move mode: drag the chat window where you want it, drag its corner to resize, then click Done.", "ok");
    else scMsg(`On ✓ ${state.visible ? "Showing over your game." : "Hidden (Ctrl+Shift+C brings it back)."}${state.keys && state.keys.toggle === false ? " (Ctrl+Shift+C is taken by another app.)" : ""}`, "ok");
  }
  $("#scShow").onclick = async () => {
    if (!inApp) { sync(); return; }
    if (!state.open) { S.on = true; save(); await send("open", S); }
    else if (state.visible) { S.on = false; save(); await send("close"); }
    else await send("show", true);
  };
  $("#scMove").onclick = () => send("unlock", !state.unlocked);
  $("#scTest").onclick = () => {
    const m = SAMPLES[Math.floor(Math.random() * SAMPLES.length)];
    toPrev({ type: "msg", m }); if (state.open) send("msg", m);
  };
  const push = () => { save(); toPrev({ type: "cfg", cfg: S }); if (state.open) send("cfg", S); };
  const rng = (id, k, out, fmt) => { const i = $(id); i.value = S[k]; const show = () => { $(out).textContent = fmt(S[k]); }; show(); i.oninput = () => { S[k] = +i.value; show(); push(); }; };
  const chk = (id, k) => { const i = $(id); i.checked = !!S[k]; i.onchange = () => { S[k] = i.checked; push(); }; };
  rng("#scSize", "size", "#scSizeV", v => v + "px");
  rng("#scBg", "bg", "#scBgV", v => v + "%");
  rng("#scMax", "max", "#scMaxV", v => String(v));
  $("#scFade").value = String(S.fade); $("#scFade").onchange = () => { S.fade = +$("#scFade").value; push(); };
  chk("#scHide", "hideFromCapture");
  { const d = $("#scDing"); d.checked = !!S.ding; d.onchange = () => { S.ding = d.checked; save(); if (S.ding) listOutputs(); }; }
  $("#scDingWhen").value = S.dingWhen; $("#scDingWhen").onchange = () => { S.dingWhen = $("#scDingWhen").value; save(); };
  $("#scDingSound").value = S.dingSound; $("#scDingSound").onchange = () => { S.dingSound = $("#scDingSound").value; save(); ding(true); };
  $("#scDingVol").value = S.dingVol; $("#scDingVolV").textContent = S.dingVol + "%"; $("#scDingVol").oninput = () => { S.dingVol = +$("#scDingVol").value; $("#scDingVolV").textContent = S.dingVol + "%"; save(); };
  $("#scDingVol").onchange = () => ding(true);
  // a RØDECaster output: everything on it goes to the stream unless its fader is routed away from USB 1
  function dingRodeHint() {
    const h = $("#scDingRode"), o = $("#scDingOut").selectedOptions[0], l = o && o.value ? o.textContent : "";
    if (!h) return;
    if (/r[øo]de|rodecaster/i.test(l)) {
      h.className = "note warn";
      h.textContent = /chat/i.test(l) ? "⚠ The Duo's Chat output is usually part of your stream mix, so chat may hear the alert. A spare one (like “B”) routed to headphones only is safer."
        : "This is a RØDECaster output: by default the Duo mixes it into your stream. Take its fader out of USB 1 in Settings → Outputs → Routing, then test it in Stream view.";
    } else { h.textContent = ""; h.className = "note"; }
  }
  $("#scDingOut").onchange = () => { S.dingOut = $("#scDingOut").value; save(); ding(true); dingRodeHint(); };
  if (navigator.mediaDevices && navigator.mediaDevices.addEventListener) navigator.mediaDevices.addEventListener("devicechange", () => setTimeout(listOutputs, 800));
  $("#scDingTest").onclick = async () => { await listOutputs(); ding(true); dingMsg("Playing it through " + ($("#scDingOut").selectedOptions[0] || { textContent: "the default output" }).textContent + ".", "ok"); };
  window.hubDing = () => ding(true);   // Stream view's "can the stream hear it?" test
  window.hubDingOn = () => !!S.ding;
  listOutputs(); chk("#scEmotes", "emotes"); chk("#scBadges", "badges"); chk("#scColours", "colours");
  chk("#scAlerts", "alerts"); chk("#scCmds", "hideCmds"); chk("#scMentions", "mentions");
  sync();
  if (inApp && S.on) send("open", S);   // it was on last time
})();
