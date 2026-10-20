// ---------- Stream view: a screen to keep up while you stream ----------
(() => {
  "use strict";
  const $ = q => document.querySelector(q);
  const O = () => window.hubObs, ready = () => !!(O() && O().connected), req = (t, d) => O().request(t, d);
  const tab = $("#tab-live"), stage = $("#lvStage"), img = $("#lvImg");
  const S = (() => { try { return Object.assign({ fps: 5 }, JSON.parse(localStorage.getItem("streamhub.live") || "{}")); } catch (e) { return { fps: 5 }; } })();
  const save = () => { try { localStorage.setItem("streamhub.live", JSON.stringify(S)); } catch (e) {} };
  $("#lvFps").value = String(S.fps); $("#lvFps").onchange = () => { S.fps = +$("#lvFps").value; save(); };
  const shown = () => !tab.classList.contains("hide") && !document.hidden;
  const empty = $("#lvEmpty");
  try { if (window.testCardURL) empty.style.backgroundImage = 'url("' + window.testCardURL("NOT CONNECTED") + '")'; } catch (e) {}
  empty.innerHTML = "<span>Connect OBS on the Connections tab to see your stream here.</span>";

  // ---- the picture of your stream ----
  let scene = "", busy = false;
  async function grab() {
    if (busy || !shown() || !ready()) { if (!ready()) stage.classList.remove("has"); return; }
    busy = true;
    try {
      if (!scene) { const c = await req("GetCurrentProgramScene"); scene = c.currentProgramSceneName || c.sceneName || ""; }
      if (scene) {
        const r = await req("GetSourceScreenshot", { sourceName: scene, imageFormat: "jpg", imageWidth: 960, imageCompressionQuality: 75 });
        if (r && r.imageData) { img.src = r.imageData; stage.classList.add("has"); $("#lvScene").textContent = "Scene: " + scene; }
      }
    } catch (e) { scene = ""; }
    finally { busy = false; }
  }
  (function loop() { grab().finally(() => setTimeout(loop, Math.round(1000 / (S.fps || 5)))); })();

  // ---- scene buttons ----
  async function scenes() {
    const box = $("#lvScenes");
    if (!ready()) { box.innerHTML = ""; return; }
    try {
      const r = await req("GetSceneList"); scene = r.currentProgramSceneName || scene;
      box.innerHTML = "";
      (r.scenes || []).slice().reverse().forEach(sc => {
        const b = document.createElement("button"); b.type = "button"; b.className = "ghost" + (sc.sceneName === scene ? " on" : "");
        b.textContent = sc.sceneName;
        b.onclick = async () => { try { await req("SetCurrentProgramScene", { sceneName: sc.sceneName }); scene = sc.sceneName; scenes(); } catch (e) {} };
        box.append(b);
      });
    } catch (e) {}
  }

  // ---- stream health ----
  let lastBytes = 0, lastAt = 0;
  const tile = (id, text, cls) => { const b = $(id); b.textContent = text; b.parentElement.className = "lvtile" + (cls ? " " + cls : ""); };
  const dur = ms => { const t = Math.floor((ms || 0) / 1000), h = Math.floor(t / 3600), m = Math.floor(t / 60) % 60, s = t % 60; return (h ? h + ":" + String(m).padStart(2, "0") : m) + ":" + String(s).padStart(2, "0"); };
  async function health() {
    if (!shown()) return;
    const cam = window.__tosCamStream ? "TOS HUB cam ✓" : "OBS webcam";
    tile("#lvCam", cam, window.__tosCamStream ? "good" : "");
    if (!ready()) {
      ["#lvUp", "#lvKbps", "#lvDrop", "#lvFpsV", "#lvLag", "#lvCpu", "#lvRecT"].forEach(id => tile(id, "–"));
      $("#lvLive").className = "lvbadge"; $("#lvLive").textContent = "OFFLINE"; $("#lvRec").className = "lvbadge"; $("#lvRec").textContent = "NOT RECORDING";
      $("#lvMsg").textContent = "Connect OBS on the Connections tab to see these."; return;
    }
    $("#lvMsg").textContent = "";
    try {
      const st = await req("GetStreamStatus");
      const live = !!st.outputActive;
      $("#lvLive").className = "lvbadge" + (live ? " on" : ""); $("#lvLive").textContent = live ? (st.outputReconnecting ? "RECONNECTING" : "● LIVE") : "OFFLINE";
      tile("#lvUp", live ? dur(st.outputDuration) : "Not live", live ? "good" : "");
      const now = performance.now();
      if (live && lastAt && st.outputBytes >= lastBytes) {
        const kbps = Math.round((st.outputBytes - lastBytes) * 8 / ((now - lastAt) / 1000) / 1000);
        tile("#lvKbps", kbps.toLocaleString() + " kbps", kbps < 1500 ? "bad" : kbps < 3000 ? "warn" : "good");
      } else tile("#lvKbps", live ? "…" : "–");
      lastBytes = st.outputBytes || 0; lastAt = now;
      const tot = st.outputTotalFrames || 0, sk = st.outputSkippedFrames || 0, pct = tot ? sk / tot * 100 : 0;
      tile("#lvDrop", live ? `${sk.toLocaleString()} (${pct.toFixed(1)}%)` : "–", live ? (pct > 2 ? "bad" : pct > .5 ? "warn" : "good") : "");
    } catch (e) { tile("#lvUp", "?"); }
    try {
      const rc = await req("GetRecordStatus");
      $("#lvRec").className = "lvbadge" + (rc.outputActive ? " rec" : ""); $("#lvRec").textContent = rc.outputActive ? (rc.outputPaused ? "REC PAUSED" : "● REC") : "NOT RECORDING";
      tile("#lvRecT", rc.outputActive ? String(rc.outputTimecode || "").replace(/\.\d+$/, "") : "Off", rc.outputActive ? "good" : "");
    } catch (e) {}
    try {
      const g = await req("GetStats");
      const fps = g.activeFps || 0, rt = g.renderTotalFrames || 0, rs = g.renderSkippedFrames || 0, lag = rt ? rs / rt * 100 : 0;
      tile("#lvFpsV", fps ? fps.toFixed(0) + " fps" : "–", fps && fps < 28 ? "warn" : fps ? "good" : "");
      tile("#lvLag", `${lag.toFixed(1)}%`, lag > 2 ? "bad" : lag > .5 ? "warn" : "good");
      tile("#lvCpu", g.cpuUsage != null ? g.cpuUsage.toFixed(0) + "%" : "–", g.cpuUsage > 80 ? "warn" : "");
    } catch (e) {}
  }
  setInterval(health, 2000);
  setInterval(() => { if (shown()) scenes(); }, 8000);
  document.querySelector('.tabs button[data-tab="live"]').addEventListener("click", () => { scene = ""; scenes(); health(); grab(); });

  // ---- audio: OBS meters, mute and loudness warnings ----
  const A = { rows: {}, levels: {}, muted: {}, kinds: {}, seen: {}, mic: S.micInput || "", silentSince: 0, clipAt: {}, live: false, test: null };
  const toDb = m => m > 0 ? 20 * Math.log10(m) : -100;
  const pctA = db => Math.max(0, Math.min(100, (db + 60) / 60 * 100));
  const isMicIn = n => A.mic ? n === A.mic : (/wasapi_input|coreaudio_input|pulse_input|alsa_input/.test(A.kinds[n] || "") || /\bmic|sm7b|rode|r\u00f8de/i.test(n));
  function audioRow(name) {
    if (A.rows[name]) return A.rows[name];
    const box = $("#lvAudio"); if (box.querySelector("p.note")) box.innerHTML = "";
    const r = document.createElement("div"); r.className = "lvar";
    r.innerHTML = '<span class="nm"></span><span class="bar"><span class="fill"></span><span class="pk"></span></span><span class="db">–</span><button class="ghost icon" type="button"></button>';
    r.querySelector(".nm").textContent = name; r.querySelector(".nm").title = name + " (click to mark as your mic)";
    r.querySelector(".nm").style.cursor = "pointer";
    r.querySelector(".nm").onclick = () => { A.mic = A.mic === name ? "" : name; S.micInput = A.mic; save(); Object.keys(A.rows).forEach(paintName); };
    r.querySelector("button").onclick = async () => { try { await req("ToggleInputMute", { inputName: name }); } catch (e) {} };
    box.append(r); A.rows[name] = r; paintName(name);
    return r;
  }
  function paintName(name) {
    const r = A.rows[name]; if (!r) return;
    r.querySelector(".nm").textContent = (isMicIn(name) ? "🎙 " : "") + name;
    r.classList.toggle("muted", !!A.muted[name]);
    const b = r.querySelector("button"); b.textContent = A.muted[name] ? "🔇" : "🔊"; b.title = A.muted[name] ? "Muted in OBS: click to unmute" : "Click to mute in OBS";
  }
  async function audioSetup() {
    if (!ready()) return;
    try { const r = await req("GetInputList"); (r.inputs || []).forEach(i => { A.kinds[i.inputName] = i.inputKind; }); } catch (e) {}
  }
  async function muteOf(name) { try { const r = await req("GetInputMute", { inputName: name }); A.muted[name] = !!r.inputMuted; paintName(name); } catch (e) {} }
  window.addEventListener("obs-meters", e => {
    const now = performance.now(), names = {};
    (e.detail || []).forEach(inp => {
      const name = inp.inputName; if (!name) return;
      const ch = inp.inputLevelsMul || []; if (!ch.length) return;   // video-only sources have no audio
      let peak = 0, mag = 0; ch.forEach(c => { peak = Math.max(peak, c[1] || 0); mag = Math.max(mag, c[0] || 0); });
      const pdb = toDb(peak), L = A.levels[name] = A.levels[name] || { hold: -100, holdAt: 0, max: -100 };
      L.db = pdb; L.at = now; if (pdb > L.hold || now - L.holdAt > 1500) { L.hold = pdb; L.holdAt = now; }
      if (A.test) A.test.push([now, name, pdb]);
      if (pdb > -1) A.clipAt[name] = now;
      names[name] = 1;
      if (!A.seen[name]) { A.seen[name] = 1; muteOf(name); }
      if (!shown()) return;
      const r = audioRow(name);
      r.querySelector(".fill").style.width = pctA(toDb(mag)) + "%";
      r.querySelector(".fill").style.background = A.muted[name] ? "" : pdb > -3 ? "var(--bad)" : pdb > -9 ? "var(--warn)" : "var(--good)";
      r.querySelector(".pk").style.left = `calc(${pctA(L.hold)}% - 2px)`;
      r.querySelector(".db").textContent = pdb < -59 ? "–" : Math.round(pdb) + " dB";
    });
    // mic silent while you're live?
    const micName = Object.keys(names).find(isMicIn);
    if (micName && A.live && !A.muted[micName]) { if ((A.levels[micName].db || -100) < -55) { if (!A.silentSince) A.silentSince = now; } else A.silentSince = 0; }
    else A.silentSince = 0;
  });
  window.addEventListener("obs-mute", e => { const d = e.detail || {}; if (d.inputName) { A.muted[d.inputName] = !!d.inputMuted; paintName(d.inputName); warnings(); } });
  function warnings() {
    const box = $("#lvWarns"); if (!box) return;
    const out = [], now = performance.now();
    if (ready()) {
      const names = Object.keys(A.rows), micName = names.find(isMicIn);
      if (micName && A.muted[micName]) out.push(["", `🔇 Your mic (“${micName}”) is muted in OBS`, "Unmute", () => req("SetInputMute", { inputName: micName, inputMuted: false }).catch(() => {})]);
      if (!micName && names.length) out.push(["w", "No mic found in OBS. Click your mic's name below the meters to mark it, so TOS HUB can warn you about it."]);
      if (A.silentSince && now - A.silentSince > 120000) out.push(["w", `🤫 No sound from your mic for ${Math.round((now - A.silentSince) / 60000)} min while you're live. Is it muted on the RØDECaster?`]);
      names.forEach(n => { if (A.clipAt[n] && now - A.clipAt[n] < 6000) out.push(["", `📢 “${n}” is hitting the top (clipping). ${isMicIn(n) ? "Turn the SM7B's gain down a little on the Duo." : "Turn it down a little."}`]); });
    }
    box.innerHTML = "";
    out.forEach(([cls, text, btn, fn]) => {
      const d = document.createElement("div"); d.className = "lvwarn" + (cls ? " " + cls : ""); d.textContent = text;
      if (btn) { const b = document.createElement("button"); b.className = "ghost"; b.type = "button"; b.textContent = btn; b.onclick = fn; d.append(b); }
      box.append(d);
    });
  }
  function micReactBadge() {
    const st = window.hubCam && window.hubCam.micState ? window.hubCam.micState() : { on: false };
    const b = $("#lvMicR"); b.textContent = st.on ? "MIC REACTIONS ON" : "MIC REACTIONS OFF"; b.className = "lvbadge" + (st.on ? " rec" : "");
    $("#lvMicTog").textContent = st.on ? "🎙 Mic reactions off" : "🎙 Mic reactions on";
  }
  $("#lvMicTog").onclick = async () => { if (window.hubCam && window.hubCam.micToggle) await window.hubCam.micToggle(); micReactBadge(); };
  // play the private alert 3 times and watch OBS: did any of it reach the stream?
  const hearMsg = (t, cls) => { const m = $("#lvHearMsg"); m.textContent = t; m.className = "note " + (cls || ""); };
  $("#lvHearTest").onclick = async () => {
    if (!ready()) { hearMsg("Connect OBS first (Connections tab).", "err"); return; }
    if (!window.hubDing) { hearMsg("The chat alert sound isn't ready yet.", "err"); return; }
    const btn = $("#lvHearTest"); btn.disabled = true;
    hearMsg("Stay quiet for 5 seconds… listening to OBS, then playing your alert 3 times.", "");
    O().meters(true); A.test = [];
    await new Promise(r => setTimeout(r, 1500));
    const t0 = performance.now(), dings = [];
    for (let i = 0; i < 3; i++) { dings.push(performance.now()); window.hubDing(); await new Promise(r => setTimeout(r, 1100)); }
    await new Promise(r => setTimeout(r, 400));
    const samples = A.test; A.test = null; btn.disabled = false;
    if (!samples.length) { hearMsg("OBS didn't send any audio levels. Update OBS (28 or newer) and try again.", "err"); return; }
    const by = {};
    samples.forEach(([t, n, db]) => {
      const b = by[n] = by[n] || { before: -100, hits: [-100, -100, -100] };
      if (t < t0) b.before = Math.max(b.before, db);
      else dings.forEach((d, i) => { if (t >= d && t < d + 600) b.hits[i] = Math.max(b.hits[i], db); });
    });
    const heard = Object.keys(by).filter(n => { const b = by[n]; return b.hits.every(h => h > -50 && h > b.before + 12); });
    if (heard.length) hearMsg(`⚠ Yes: the stream hears it through ${heard.map(n => "“" + n + "”").join(", ")}. Play the alert through another output (Chat & alerts), or take that fader out of the Duo's USB 1 routing (setup guide on the Webcam tab → Mic reactions).`, "warn");
    else hearMsg(`✓ No: the stream didn't pick up your alert. Only you can hear it.${window.hubDingOn && !window.hubDingOn() ? " (The alert sound itself is switched off in Chat & alerts right now.)" : ""}`, "ok");
  };
  let wasShown = false;
  setInterval(() => {
    const on = shown() && ready();
    if (O() && O().meters) O().meters(on || !!A.test);
    if (on && !wasShown) audioSetup();
    if (!ready()) { A.rows = {}; A.seen = {}; const box = $("#lvAudio"); if (box && !box.querySelector("p.note")) box.innerHTML = '<p class="note">Connect OBS on the Connections tab to see your audio here.</p>'; }
    wasShown = on;
    if (shown()) { warnings(); micReactBadge(); }
  }, 1000);
  // for the "silent while live" warning
  setInterval(async () => { if (!ready()) { A.live = false; return; } try { A.live = !!(await req("GetStreamStatus")).outputActive; } catch (e) {} }, 5000);

  // ---- chat & events ----
  const box = $("#lvChat"); let first = true;
  const time = () => new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  function add(cls, name, color, text) {
    if (first) { box.innerHTML = ""; first = false; }
    const d = document.createElement("div"); d.className = "m" + (cls ? " " + cls : "");
    const t = document.createElement("span"); t.className = "t"; t.textContent = time(); d.append(t);
    if (name) { const n = document.createElement("span"); n.className = "n"; n.textContent = name + ": "; if (color) n.style.color = color; d.append(n); }
    d.append(text || "");
    const atBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 40;
    box.append(d); while (box.children.length > 150) box.firstChild.remove();
    if (atBottom) box.scrollTop = box.scrollHeight;
  }
  (window.hubChatHooks = window.hubChatHooks || []).push(m => {
    const tg = m.tags || {};
    if (m.command === "PRIVMSG") {
      const name = tg["display-name"] || ((m.prefix || "").split("!")[0]) || "?";
      let text = m.trailing || ""; const act = /^\u0001ACTION (.*)\u0001$/.exec(text); if (act) text = act[1];
      if (tg.bits) add("ev", "", "", `💎 ${name} cheered ${tg.bits} bits: ${text}`);
      else add("", name, tg.color || "", text);
    } else if (m.command === "USERNOTICE") {
      add("ev", "", "", "⭐ " + (tg["system-msg"] || "").replace(/\\s/g, " ") + (m.trailing ? " · " + m.trailing : ""));
    }
  });
})();
