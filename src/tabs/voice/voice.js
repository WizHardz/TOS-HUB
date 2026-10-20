// ---------- voice commands: VoiceAttack (or anything that can open a web address) runs TOS HUB actions ----------
(() => {
  "use strict";
  const $ = q => document.querySelector(q);
  const H = window.tosHub, inApp = !!(H && H.voiceInfo);
  let info = { ok: false, port: 47821, key: "yourkey" };
  const cam = () => window.hubCam || {};
  function commands() {
    const out = [];
    (cam().EFFECTS || []).forEach(([k, l]) => out.push(["fx/" + k, "Effect: " + l]));
    (cam().EFFECTS || []).forEach(([k, l]) => { if (window.TOS_SCREEN_FX && window.TOS_SCREEN_FX.has(k)) out.push(["screen/" + k, "Whole screen: " + l]); });
    out.push(["object/random", "🎲 Become a random object (12 seconds)"]);
    (cam().objects ? cam().objects() : []).forEach(([n, l]) => out.push(["object/" + n, "Become: " + l + " (12 seconds)"]));
    (cam().objects ? cam().objects() : []).forEach(([n, l]) => out.push(["stay/" + n, "Stay as: " + l]));
    out.push(["stay/off", "🙂 Back to just me"], ["draw/toggle", "✏️ Draw mode on / off"], ["draw/clear", "🧽 Clear the drawing"], ["mic/toggle", "🎙️ Mic reactions on / off"],
      ["cam/toggle", "📷 Show / hide cam"], ["cam/punch", "🎥 Punch in + shake the cam"], ["follow/toggle", "🎯 Face follow on / off"],
      ["trk/face", "🙂 Face tracking on / off"], ["trk/hands", "✋ Hand tracking on / off"], ["trk/body", "🧍 Body tracking on / off"], ["trk/seg", "✂️ Background cut-out on / off"]);
    (window.hubPads ? window.hubPads.list() : []).forEach(p => out.push(["pad/" + encodeURIComponent(p.name), "Pad: " + p.name]));
    obsCommands().forEach(c => out.push(c));
    return out;
  }
  // ---- OBS: stream, recording, scenes, mute, show / hide ----
  const E = encodeURIComponent;
  const AUDIO = /wasapi|audio|pulse|alsa|coreaudio|jack|sck_audio|asio/i;
  function obsCommands() {
    const o = window.hubObs || {}, out = [["obs/golive", "🔴 Go live (start streaming)"], ["obs/endstream", "⏹️ End the stream"], ["obs/record", "⏺️ Start / stop recording"],
      ["obs/recpause", "⏸️ Pause / resume recording"], ["obs/replay", "💾 Save replay (OBS Replay Buffer)"], ["obs/lastscene", "↩️ Back to the last scene"]];
    (o.scenes || []).forEach(n => out.push(["obs/scene/" + E(n), "🎬 Scene: " + n]));
    (o.inputs || []).filter(n => AUDIO.test((o.kinds || {})[n] || "")).forEach(n => out.push(["obs/mute/" + E(n), "🔇 Mute / unmute: " + n]));
    const seen = new Set();
    Object.entries(o.items || {}).forEach(([sc, list]) => (list || []).forEach(it => { const k = it.itemScene + "\n" + it.source; if (seen.has(k) || /^TOS HUB/.test(it.source)) return; seen.add(k); out.push(["obs/item/" + E(it.itemScene) + "/" + E(it.source), "👁️ Show / hide: " + it.source + " (in " + it.itemScene + ")"]); }));
    return out;
  }
  let prevScene = "";
  async function runObs(c) {
    const o = window.hubObs, [, k, x, y] = String(c).split("/").map(v => decodeURIComponent(v || ""));
    if (!o || !o.connected) throw new Error("OBS not connected");
    const q = (t, d) => o.request(t, d);
    if (k === "golive") { const st = await q("GetStreamStatus"); if (!st.outputActive) await q("StartStream"); }
    else if (k === "endstream") { const st = await q("GetStreamStatus"); if (st.outputActive) await q("StopStream"); }
    else if (k === "record") await q("ToggleRecord");
    else if (k === "recpause") await q("ToggleRecordPause");
    else if (k === "replay") await q("SaveReplayBuffer");
    else if (k === "scene" || k === "lastscene") {
      const to = k === "scene" ? x : prevScene; if (!to) return;
      let cur = ""; try { const r = await q("GetCurrentProgramScene"); cur = r.currentProgramSceneName || r.sceneName || ""; } catch (e) {}
      if (cur === to) return;
      await q("SetCurrentProgramScene", { sceneName: to }); prevScene = cur;
    }
    else if (k === "mute") await q("ToggleInputMute", { inputName: x });
    else if (k === "item") { const { sceneItemId } = await q("GetSceneItemId", { sceneName: x, sourceName: y }); const { sceneItemEnabled } = await q("GetSceneItemEnabled", { sceneName: x, sceneItemId }); await q("SetSceneItemEnabled", { sceneName: x, sceneItemId, sceneItemEnabled: !sceneItemEnabled }); }
  }
  window.__runObs = runObs;   // for TOS HUB's own tests
  // ---- pressing keys: in the window in front (desktop app, Windows) or an OBS hotkey (through OBS's connection) ----
  const OBSK = { Space: "SPACE", Enter: "RETURN", Tab: "TAB", Backspace: "BACKSPACE", Delete: "DELETE", Insert: "INSERT", Home: "HOME", End: "END", PageUp: "PAGEUP", PageDown: "PAGEDOWN",
    Up: "UP", Down: "DOWN", Left: "LEFT", Right: "RIGHT", "-": "MINUS", "=": "EQUAL", "[": "BRACKETLEFT", "]": "BRACKETRIGHT", ";": "SEMICOLON", "'": "APOSTROPHE", "`": "QUOTELEFT", "\\": "BACKSLASH",
    ",": "COMMA", ".": "PERIOD", "/": "SLASH", numadd: "NUMPLUS", numsub: "NUMMINUS", nummult: "NUMASTERISK", numdiv: "NUMSLASH", numdec: "NUMPERIOD", Pause: "PAUSE", Scrolllock: "SCROLLLOCK", PrintScreen: "PRINT" };
  function obsKeyOf(acc) {
    const parts = String(acc).split("+"), k = parts.pop(), m = new Set(parts);
    const id = OBSK[k] || (/^[A-Z0-9]$/.test(k) ? k : /^F\d{1,2}$/.test(k) ? k : /^num\d$/.test(k) ? "NUM" + k.slice(3) : "");
    return id ? { keyId: "OBS_KEY_" + id, keyModifiers: { shift: m.has("Shift"), control: m.has("Ctrl"), alt: m.has("Alt"), command: m.has("Super") } } : null;
  }
  window.__obsKeyOf = obsKeyOf;
  async function runKeys(c) {
    const p = String(c).split("/"), acc = decodeURIComponent(p[1] || ""), hold = +p[2] || 0;
    const say = (t, bad) => { const tr = $("#tab-trig"), m = tr && !tr.classList.contains("hide") ? $("#rulesMsg") : $("#keysMsg"); if (m) { m.textContent = t; m.className = "note " + (bad ? "err" : "ok"); } };
    if (!acc) return say("Pick the keys for that action first.", true);
    if (p[0] === "obskey") {
      const o = window.hubObs, k = obsKeyOf(acc);
      if (!o || !o.connected) return say("Connect OBS (Connections tab) to press OBS hotkeys.", true);
      if (!k) return say("OBS can't use " + prettyKey(acc) + " as a hotkey.", true);
      await o.request("TriggerHotkeyByKeySequence", k); return;
    }
    if (!(H && H.pressKeys)) return say("Pressing keys needs the TOS HUB desktop app (this is the browser preview).", true);
    const res = await H.pressKeys(acc, hold);
    if (res && !res.ok) say(res.why || "Couldn't press " + prettyKey(acc) + ".", true);
  }
  const url = c => `http://127.0.0.1:${info.port}/${info.key}/${c}`;
  const vbs = () => info.vbs || "C:\\Users\\you\\AppData\\Roaming\\Stream Hub\\tos-voice.vbs";
  const APP = () => info.vbs || !info.ok ? "C:\\Windows\\System32\\wscript.exe" : "C:\\Windows\\System32\\curl.exe";
  const params = c => APP().endsWith("wscript.exe") ? `"${vbs()}" ${c}` : `-s "${url(c)}"`;   // wscript: no window ever pops up
  // ---- one-click VoiceAttack profile: every action, with a phrase to say ----
  const PKEY = "streamhub.vaprefix";
  const words = t => String(t).replace(/\(.*?\)/g, " ").replace(/[^\p{L}\p{N} ]/gu, " ").replace(/\s+/g, " ").trim().toLowerCase();
  function phrases() {
    const pre = words($("#vaPrefix").value || ""), P = w => w.split(";").map(x => (pre ? pre + " " : "") + x).join(";"), out = [], C = cam();
    (C.EFFECTS || []).forEach(([k, l]) => { const w = words(l.replace(/^Effect: /, "")); if (w) out.push([P(w), "fx/" + k, l]); });
    (C.EFFECTS || []).forEach(([k, l]) => { const w = words(l); if (w && window.TOS_SCREEN_FX && window.TOS_SCREEN_FX.has(k)) out.push([P("big " + w), "screen/" + k, "🖥️ Whole screen: " + l]); });
    out.push(["become something", "object/random", "🎲 Become a random object for 12 seconds"]);
    (C.objects ? C.objects() : []).forEach(([n, l]) => { const w = words(l); if (!w) return; out.push([`become [a;an] ${w}`, "object/" + n, "Become " + l + " for 12 seconds"]); out.push([`turn into [a;an] ${w}`, "stay/" + n, "Stay as " + l]); });
    out.push(["back to me;turn back", "stay/off", "🙂 Back to just you"], [P("draw mode"), "draw/toggle", "✏️ Draw mode on / off"], [P("clear [the] drawing"), "draw/clear", "🧽 Clear the drawing"],
      [P("mic reactions"), "mic/toggle", "🎙️ Mic reactions on / off"], [P("hide cam;show cam"), "cam/toggle", "📷 Show / hide cam"], [P("face follow"), "follow/toggle", "🎯 Face follow on / off"],
      [P("face tracking"), "trk/face", "🙂 Face tracking on / off"], [P("hand tracking"), "trk/hands", "✋ Hand tracking on / off"], [P("body tracking"), "trk/body", "🧍 Body tracking on / off"], [P("cut out"), "trk/seg", "✂️ Background cut-out on / off"]);
    (window.hubPads ? window.hubPads.list() : []).forEach(p => { const w = words(p.name); if (w) out.push([P(w), "pad/" + encodeURIComponent(p.name), "Pad: " + p.name]); });
    obsCommands().forEach(([c, l]) => { const w = obsSay(c, l); if (w) out.push([P(w), c, l]); });
    // your own voice rules from the Triggers list (with their cooldowns), first so they win over the built-in phrases
    const mine = (window.hubRules ? window.hubRules.list() : []).filter(r => r.on && r.act && r.ctl === "voice" && r.key).map(r => [words(r.key), "rule/" + r.id, "🗣️ " + window.hubRules.actLabel(r)]);
    if (($("#vaWhat") || {}).value === "mine") out.length = 0;
    out.unshift(...mine);
    const seen = new Set(); return out.filter(([w]) => !seen.has(w) && seen.add(w));
  }
  const esc = t => String(t).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, c => { const r = Math.random() * 16 | 0; return (c === "x" ? r : (r & 3 | 8)).toString(16); }));
  // what to say for an OBS action (scene names etc. become plain words)
  function obsSay(c, l) {
    const [, k, x, y] = String(c).split("/").map(v => decodeURIComponent(v || "")), w = words;
    return { golive: "go live now", endstream: "end the stream now", record: "start recording;stop recording", recpause: "pause recording;resume recording", replay: "save replay;clip that", lastscene: "last scene;go back a scene" }[k]
      || (k === "scene" && w(x) ? `scene ${w(x)};switch to ${w(x)}` : k === "mute" && w(x) ? `mute ${w(x)};unmute ${w(x)}` : k === "item" && w(y) ? `show ${w(y)};hide ${w(y)}` : "");
  }
  window.__obsSay = obsSay;
  function profileXml() {
    const cmd = ([say, c]) => `    <Command>
      <Id>${uuid()}</Id>
      <CommandString>${esc(say)}</CommandString>
      <ActionSequence>
        <CommandAction>
          <Id>${uuid()}</Id>
          <ActionType>Launch</ActionType>
          <Duration>0</Duration>
          <Delay>0</Delay>
          <KeyCodes />
          <Context>${esc(APP())}</Context>
          <Context2>${esc(params(c))}</Context2>
          <Context3 />
          <X>0</X>
          <Y>0</Y>
          <InputMode>0</InputMode>
        </CommandAction>
      </ActionSequence>
      <Async>true</Async>
      <Enabled>true</Enabled>
      <UseShortcut>false</UseShortcut>
      <keyValue>0</keyValue>
      <keyShift>0</keyShift>
      <keyAlt>0</keyAlt>
      <keyCtrl>0</keyCtrl>
      <keyWin>0</keyWin>
      <keyPassthru>true</keyPassthru>
      <UseSpokenPhrase>true</UseSpokenPhrase>
      <onlyKeyUp>false</onlyKeyUp>
      <RepeatNumber>2</RepeatNumber>
      <RepeatType>0</RepeatType>
      <CommandType>0</CommandType>
    </Command>`;
    const tail = ["OverrideGlobal>false", "GlobalHotkeyIndex>0", "GlobalHotkeyEnabled>false", "GlobalHotkeyValue>0", "GlobalHotkeyShift>0", "GlobalHotkeyAlt>0", "GlobalHotkeyCtrl>0", "GlobalHotkeyWin>0", "GlobalHotkeyPassThru>false",
      "OverrideMouse>false", "MouseIndex>0", "OverrideStop>false", "StopCommandHotkeyEnabled>false", "StopCommandHotkeyValue>0", "StopCommandHotkeyShift>0", "StopCommandHotkeyAlt>0", "StopCommandHotkeyCtrl>0", "StopCommandHotkeyWin>0",
      "StopCommandHotkeyPassThru>false", "DisableShortcuts>false", "UseOverrideListening>false"].map(x => { const [k, v] = x.split(">"); return `  <${k}>${v}</${k}>`; }).join("\r\n");
    return `<?xml version="1.0" encoding="utf-8"?>\r\n<Profile xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">\r\n  <Id>${uuid()}</Id>\r\n  <Name>TOS HUB</Name>\r\n  <Commands>\r\n${phrases().map(cmd).join("\r\n")}\r\n  </Commands>\r\n${tail}\r\n</Profile>\r\n`;
  }
  function renderSay() {
    const box = $("#vaSay"); if (!box) return; box.innerHTML = "";
    phrases().forEach(([w, , l]) => { const d = document.createElement("div"); const b = document.createElement("b"); b.textContent = "“" + w.replace(/\[(.*?)\]/g, (m, a) => "(" + a.split(";")[0] + ")").replace(/;/g, "” or “") + "”"; d.append(b, " → " + l); box.append(d); });
  }
  $("#vaPrefix").value = (() => { try { return localStorage.getItem(PKEY) || ""; } catch (e) { return ""; } })();
  $("#vaPrefix").oninput = () => { try { localStorage.setItem(PKEY, $("#vaPrefix").value); } catch (e) {} renderSay(); };
  const WKEY = "streamhub.vawhat";
  $("#vaWhat").value = (() => { try { return localStorage.getItem(WKEY) || "mine"; } catch (e) { return "mine"; } })();
  $("#vaWhat").onchange = () => { try { localStorage.setItem(WKEY, $("#vaWhat").value); } catch (e) {} renderSay(); };
  $("#vaMake").onclick = () => makeProfile($("#vaMakeMsg"));
  async function makeProfile(m) {
    if (!phrases().length) { m.innerHTML = "Nothing to put in it yet: add a <b>🗣️ Voice command</b> in the Triggers tab, or choose <b>Mine + every built-in phrase</b> (Connections tab)."; m.className = "note warn"; return; }
    const xml = profileXml();
    if (window.hubRules) window.hubRules.profileSaved();
    if (inApp && H.saveVoiceProfile) {
      try { const f = await H.saveVoiceProfile(xml); m.innerHTML = `Saved ✓ <b>${esc(f)}</b> (the folder is open). In VoiceAttack: profile menu → <b>Import Profile</b> → pick this file → choose the <b>TOS HUB</b> profile. ${phrases().length} commands are ready to say.`; m.className = "note ok"; }
      catch (e) { m.textContent = "Couldn't save it: " + e.message; m.className = "note err"; }
    } else {   // browser preview: download it
      const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([xml], { type: "application/xml" })); a.download = "TOS HUB voice commands.vap"; a.click();
      m.textContent = "Downloaded. It only works with the TOS HUB desktop app (the preview's addresses are examples)."; m.className = "note warn";
    }
  }
  window.__makeProfile = makeProfile;
  async function run(c, by, extra) {
    const [a, ...rest] = String(c).split("/"), b = decodeURIComponent(rest.join("/")), C = cam();
    try {
      if (a === "rule") { if (window.hubRules) window.hubRules.byId(b, by); return; }   // a keybind or voice rule from the Triggers list
      if (a === "obs") { await runObs(c); return; }
      if (a === "keys" || a === "obskey") { await runKeys(c); return; }
      if (a === "fx" && C.effect) await C.effect(b, by || "", extra || undefined);
      else if (a === "cam" && b === "punch" && C.punch) C.punch();
      else if (a === "screen" && C.effect) await C.effect(b, by || "", Object.assign({}, extra || {}, { target: "screen" }));
      else if (a === "trk") { const sw = $({ face: "#useFace", hands: "#useHands", body: "#useBody", seg: "#useSeg" }[b]); if (sw) sw.click(); }
      else if (a === "object" && C.become) await C.become(b === "random" || !b ? undefined : b);
      else if (a === "stay" && C.stayAs) C.stayAs(b === "off" ? "" : b === "random" ? (C.objects()[Math.floor(Math.random() * C.objects().length)] || [""])[0] : b);
      else if (a === "draw") await (b === "clear" ? C.drawClear() : C.drawToggle());
      else if (a === "mic" && C.micToggle) await C.micToggle();
      else if (a === "cam" && C.camToggle) await C.camToggle();
      else if (a === "follow" && C.followToggle) await C.followToggle();
      else if (a === "pad" && window.hubPads) window.hubPads.run(b);
      const st = $("#vaStatus"); if (st && inApp) { st.dataset.last = "Last voice command: " + c; render(true); }
    } catch (e) {}
  }
  function render(keepPick) {
    const sel = $("#vaPick"), was = sel.value;
    if (!keepPick || !sel.options.length) {
      sel.innerHTML = "";
      tosAZ(commands()).forEach(([c, l]) => { const o = document.createElement("option"); o.value = c; o.textContent = l; sel.append(o); });
      if (was && [...sel.options].some(o => o.value === was)) sel.value = was;
    }
    $("#vaParams").textContent = params(sel.value || "fx/spark"); $("#vaApp").textContent = APP();
    if (!keepPick) renderSay();
    const st = $("#vaStatus");
    if (!inApp) { st.textContent = "Voice commands need the TOS HUB desktop app (this is the browser preview). The address below is an example."; st.className = "note warn"; }
    else if (!info.ok) { st.textContent = info.err === "in use" ? "Another program is using the voice command address (port " + info.port + "). Close it and restart TOS HUB." : "Starting…"; st.className = "note " + (info.err ? "err" : ""); }
    else { st.textContent = "Ready ✓ Pick an action, copy the two lines into a VoiceAttack command, and say it." + (st.dataset.last ? " · " + st.dataset.last : ""); st.className = "note ok"; }
  }
  $("#vaPick").onchange = () => render(true);
  $("#vaTest").onclick = () => run($("#vaPick").value);
  document.querySelectorAll("#voiceSec [data-copy]").forEach(b => b.onclick = async () => { try { await navigator.clipboard.writeText($("#" + b.dataset.copy).textContent); b.textContent = "Copied ✓"; setTimeout(() => b.textContent = "Copy", 1200); } catch (e) {} });
  $("#vaAll").onclick = async () => { const txt = commands().map(([c, l]) => `${l}\n  Application: ${APP()}\n  Parameters:  ${params(c)}`).join("\n\n"); try { await navigator.clipboard.writeText(txt); $("#vaAll").textContent = "Copied ✓"; setTimeout(() => $("#vaAll").textContent = "Copy every command as a list", 1500); } catch (e) {} };
  if (inApp) { H.onVoice(run); const poll = async () => { try { info = await H.voiceInfo(); } catch (e) {} render(true); }; poll(); setTimeout(poll, 1500); setInterval(poll, 15000); }
  window.__voiceRun = run;   // for TOS HUB's own tests
  { const g = $("#goRules"); if (g) g.onclick = () => window.hubGoRules("kb"); }
  window.hubActions = { list: commands, run };

