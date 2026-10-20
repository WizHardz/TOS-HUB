  // ================= TRIGGERS: one list of rules — Action · Control · Secondary control · Trigger · Cooldown =================
  const RKEY = "streamhub.rules";
  const rid = () => Math.random().toString(36).slice(2, 9);
  const strip = t => String(t || "").replace(/^[^\p{L}\p{N}]+/u, "").toLowerCase();
  const az = (a, b) => strip(a[1]).localeCompare(strip(b[1]));   // alphabetical, ignoring the emoji in front
  const CTL = [["key", "⌨️ Keyboard"], ["mic", "🎙️ Mic"], ["track", "🎯 Tracking"], ["twitch", "💜 Twitch"], ["voice", "🗣️ Voice"]];
  const SUB = { track: [["body", "🧍 Body"], ["face", "🙂 Face"], ["hands", "✋ Hands"], ["mood", "😄 Mood"], ["spell", "✨ Spells"]], twitch: [["bits", "💎 Bits (cheers)"], ["points", "💜 Channel points"], ["pu", "⚡ Power-ups (Bits rewards)"]] };
  const PREFIX = { hands: "gest", body: "pose", face: "expr", mood: "mood", spell: "spell" };
  const NEEDS = { hands: "hands", spell: "hands", body: "body", face: "face", mood: "face" };
  const PU = [["celebration", "🎉 On-screen celebration"], ["gigantify_an_emote", "😀 Gigantify an emote"], ["message_effect", "💬 Message effect"]];
  const lists = () => (cam().triggerLists ? cam().triggerLists() : { gest: [], pose: [], expr: [], mood: [], spell: [], mic: [] });
  function tidOf(r) {
    if (!r || !r.key && r.ctl !== "voice") return "";
    if (r.ctl === "track") return PREFIX[r.sub] ? PREFIX[r.sub] + ":" + r.key : "";
    if (r.ctl === "mic") return "mic:" + r.key;
    if (r.ctl === "key") return "key:" + r.key;
    if (r.ctl === "voice") return "voice:" + r.id;
    if (r.ctl === "twitch") return r.sub === "points" ? "cp:" + String(r.key).trim().toLowerCase() : r.sub === "pu" ? "pu:" + String(r.key).trim().toLowerCase() : r.sub === "bits" ? "bits:" + r.key : "";
    return "";
  }
  // first time: build the list from everything that was set up before (gestures, poses, faces, mood, spells, mic, keys, rewards, bits, Power-ups)
  function migrate() {
    const out = [], fx = a => !a ? "" : a === "punch" ? "cam/punch" : "fx/" + a;
    let T = {}, TR = {}; try { T = (JSON.parse(localStorage.getItem("streamhub.cam") || "{}").trk) || {}; } catch (e) {} try { TR = JSON.parse(localStorage.getItem("streamhub.triggers") || "{}"); } catch (e) {}
    const add = (on, act, ctl, sub, key, cd) => { if (act) out.push({ id: rid(), on: !!on, act, ctl, sub: sub || "", key: String(key), cd: +cd || 0 }); };
    const def = (m, d) => Object.assign({}, d, m || {});
    Object.entries(def(T.gestMap, { palm: "shield", gun: "zap", fist: "boom", peace: "hearts", thumbsup: "spark", thumbsdown: "rain", palmup: "handconfetti" })).forEach(([k, v]) => { if (v !== "trail") add(T.hands, fx(v), "track", "hands", k, T.cd || 5); });
    Object.entries(def(T.poseMap, { up: "confetti", tpose: "shield", flex: "fire", dab: "zap", cross: "boom", wave: "hearts", salute: "spark" })).forEach(([k, v]) => add(T.poseFx, fx(v), "track", "body", k, T.cd || 5));
    Object.entries(def(T.exprMap, { mouth: "firebreath", blink: "lasers", brows: "spark", smile: "hearts", puff: "bubbles" })).forEach(([k, v]) => add(T.expr, fx(v), "track", "face", k, T.cd || 5));
    Object.entries(def(T.moodMap, { surprised: "bigeyes", happy: "hearts", angry: "fire", sad: "rain" })).forEach(([k, v]) => add(T.mood, fx(v), "track", "mood", k, T.moodCd || 12));
    Object.entries(def(T.spellMap, { circle: "portal", zigzag: "zap", star: "spark", heart: "hearts", triangle: "magic", swipe: "shield" })).forEach(([k, v]) => add(T.spells, fx(v), "track", "spell", k, 3));
    const MCD = { laugh: 8, clap: 1.5, click: 1.5, shout: 4, bang: 4 };
    const mm = def(T.mic, { shout: "punch", bang: "boom", laugh: "confetti", clap: "spark", click: "zap" });
    ["clap", "click", "shout", "bang", "laugh"].forEach(k => add(true, fx(mm[k]), "mic", "", k, MCD[k]));
    (TR.keys || []).forEach(k => k.acc && k.cmd && out.push({ id: rid(), on: true, act: k.cmd, ctl: "key", sub: "", key: k.acc, cd: 1 }));
    (TR.points || []).forEach(p => p.title && p.cmd && out.push({ id: rid(), on: true, act: p.cmd, ctl: "twitch", sub: "points", key: p.title, cd: 0 }));
    (TR.bits || []).forEach(b => b.cmd && out.push({ id: rid(), on: true, act: b.cmd, ctl: "twitch", sub: "bits", key: String(b.min || 100), cd: 0 }));
    (TR.pups || []).forEach(p => p.name && p.cmd && out.push({ id: rid(), on: true, act: p.cmd, ctl: "twitch", sub: "pu", key: p.name.replace(/^pu:/, ""), cd: 0 }));
    return out;
  }
  const RS = (() => { try { const v = JSON.parse(localStorage.getItem(RKEY) || "null"); if (v && Array.isArray(v.rules)) return v; } catch (e) {} return null; })() || { rules: null, by: true };
  if (!RS.rules) { RS.rules = []; RS.lipsAdded = true; RS.tidied = true; try { localStorage.setItem(RKEY, JSON.stringify(RS)); } catch (e) {} }   // new: start empty, add only what you want
  if (!RS.lipsAdded) { RS.lipsAdded = true; if (!RS.rules.some(r => r.ctl === "track" && r.key === "lips")) RS.rules.push({ id: rid(), on: true, act: "fx/mouthsmoke", ctl: "track", sub: "hands", key: "lips", cd: 6 }); try { localStorage.setItem(RKEY, JSON.stringify(RS)); } catch (e) {} }
  // several actions per rule: acts[] (act stays = the first one, for older code)
  const fix = r => { if (!Array.isArray(r.acts)) r.acts = [r.act || ""]; if (!r.acts.length) r.acts = [""]; r.act = r.acts.find(Boolean) || ""; return r; };
  RS.rules.forEach(fix);
  RS.rules.forEach(r => { if (r.kbMigr) return; r.kbMigr = true; if (/^(keys|obskey)\//.test(r.acts[0] || "")) r.kb = true; });
  let tidyMsg = "";
  if (!RS.tidied) {   // once: the old list had a line for everything; keep only the ones that were switched on
    const before = RS.rules.length; RS.rules = RS.rules.filter(r => r.on && r.act); RS.tidied = true;
    if (before - RS.rules.length) tidyMsg = `Tidied up: removed ${before - RS.rules.length} switched-off lines, so this only shows triggers you use. Add more with the ＋ buttons.`;
    try { localStorage.setItem(RKEY, JSON.stringify(RS)); } catch (e) {}
  }
  const RULES = () => RS.rules;
  const rSave = () => { try { localStorage.setItem(RKEY, JSON.stringify(RS)); } catch (e) {} afterChange(); };
  const lastFired = {};
  function fireRule(r, extra, by) {
    const now = Date.now();
    if (!r.on || !r.act || now - (lastFired[r.id] || 0) < (+r.cd || 0) * 1000) return false;
    lastFired[r.id] = now; fix(r).acts.filter(Boolean).forEach(a => run(a, RS.by !== false ? by || "" : "", extra));
    const row = document.querySelector(`.rrow[data-id="${r.id}"]`); if (row) { row.classList.remove("fired"); void row.offsetWidth; row.classList.add("fired"); }
    return true;
  }
  window.hubRules = {
    has: tid => RULES().some(r => r.on && r.act && tidOf(r) === tid),
    fire: (tid, extra, by) => { let any = false; RULES().forEach(r => { if (tidOf(r) === tid && fireRule(r, extra, by)) any = true; }); return any; },
    byId: (id, by) => { const r = RULES().find(x => x.id === id); return r ? fireRule(r, null, by) : false; },
    list: RULES,
    actLabel: r => { const a = fix(r).acts.filter(Boolean); return a.length ? actName(a[0]) + (a.length > 1 ? ` (+${a.length - 1} more)` : "") : ""; },
    profileSaved: () => { let ch = false; RULES().forEach(r => { if (r.vaNew) { delete r.vaNew; ch = true; } }); if (ch) rSave(); },
    add: (ctl, act, key, sub) => addRule(ctl, act, key, sub)
  };
  function actName(c) {
    if (/^(keys|obskey)\//.test(c || "")) { const p = String(c).split("/"), acc = decodeURIComponent(p[1] || ""), hold = +p[2] || 0; return !acc ? (p[0] === "keys" ? "⌨️ Press keys (pick them)" : "🎬 OBS hotkey (pick it)") : p[0] === "keys" ? "⌨️ Press " + prettyKey(acc) + (hold ? ` (hold ${+(hold / 1000).toFixed(1)}s)` : "") : "🎬 OBS hotkey " + prettyKey(acc); }
    return String((commands().find(x => x[0] === c) || [c, c])[1] || "").replace(/^(Effect|Pad|Become|Stay as): ?/, "");
  }
  // the old bits alert checks this so a cheer doesn't set off two things
  Object.defineProperty(window, "__triggers", { configurable: true, get: () => ({ bits: RULES().filter(r => r.on && r.ctl === "twitch" && r.sub === "bits" && r.act).map(r => ({ cmd: r.act, min: +r.key || 1 })) }) });
  // Twitch: channel points, Power-ups, cheers
  (window.hubRedeemHooks = window.hubRedeemHooks || []).push(e => window.hubRules.fire("cp:" + String(e.reward).trim().toLowerCase(), null, e.user));
  (window.hubBitsHooks = window.hubBitsHooks || []).push(e => window.hubRules.fire("pu:" + String(e.name).replace(/^pu:/, "").trim().toLowerCase(), null, e.user));
  (window.hubChatHooks = window.hubChatHooks || []).push(m => {
    const tg = m.tags || {}, bits = +tg.bits || 0;
    if (m.command !== "PRIVMSG" || !bits) return;
    const best = RULES().filter(r => r.on && r.act && r.ctl === "twitch" && r.sub === "bits" && bits >= (+r.key || 1)).sort((a, b) => (+b.key) - (+a.key))[0];
    if (best) fireRule(best, null, tg["display-name"] || "");
  });
  // after any change: register keys, start Twitch listening, switch on just the detectors the rules need
  let kbResults = {};
  async function afterChange() {
    const on = RULES().filter(r => r.on && r.act);
    const need = { lips: on.some(r => r.ctl === "track" && r.sub === "hands" && r.key === "lips"), gest: on.some(r => r.ctl === "track" && r.sub === "hands"), pose: on.some(r => r.ctl === "track" && r.sub === "body"), expr: on.some(r => r.ctl === "track" && r.sub === "face"), mood: on.some(r => r.ctl === "track" && r.sub === "mood"), spell: on.some(r => r.ctl === "track" && r.sub === "spell") };
    if (cam().setNeeds) cam().setNeeds(need);
    const tw = window.hubTwitch;
    if (tw) { if (on.some(r => r.ctl === "twitch" && (r.sub === "points" || r.sub === "pu")) && tw.loggedIn()) tw.start(); else tw.stop(); }
    if (H && H.setKeybinds) { try { const res = await H.setKeybinds(on.filter(r => r.ctl === "key" && r.key).map(r => ({ acc: r.key, cmd: "rule/" + r.id }))); kbResults = {}; (res || []).forEach(x => kbResults[x.acc] = x); } catch (e) {} }
    rowStatus();
    try { renderSay(); } catch (e) {}
  }
  window.addEventListener("tos-redeem-status", () => rowStatus());
  window.addEventListener("tos-needs", () => rowStatus());

  // ---- the list: each trigger is a card "When … → Do …"; click one to change it ----
  const mk = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  const DEF_CD = { track: 5, mic: 2, key: 1, twitch: 0, voice: 1 };
  let filt = { q: "", kq: "" }, openId = "", picking = false, pickCat = "", pickQ = "";
  // actions that need keys: "keys/<keys>[/<hold ms>]" presses keys in the window in front, "obskey/<keys>" presses an OBS hotkey
  const parseKeys = c => { const p = String(c).split("/"); return { kind: p[0], acc: decodeURIComponent(p[1] || ""), hold: +p[2] || 0 }; };
  const keysAct = (kind, acc, hold) => kind + "/" + E(acc || "") + (kind === "keys" && hold ? "/" + Math.round(hold) : "");
  const isKeys = c => /^(keys|obskey)\//.test(c || "");
  function labelOf(r) {
    const a = fix(r).acts.filter(Boolean).map(actName).join(" + ");
    return strip(a) + " · " + strip(whenText(r)) + " · " + r.ctl + " " + r.sub;
  }
  function whenText(r) {
    const L = lists();
    if (r.ctl === "key") return r.key ? "⌨️ " + prettyKey(r.key) : "⌨️ Pick a key";
    if (r.ctl === "voice") return r.key ? "🗣️ “" + r.key + "”" : "🗣️ Type what you'll say";
    if (r.ctl === "track") return ((L[PREFIX[r.sub]] || []).find(x => x[0] === r.key) || [])[1] || "🎯 Pick a " + ({ hands: "hand gesture", body: "pose", face: "face", mood: "mood", spell: "spell" }[r.sub] || "move");
    if (r.ctl === "mic") return (L.mic.find(x => x[0] === r.key) || [])[1] || "🎙️ Pick a sound";
    if (!r.ctl) return "Pick what sets it off";
    if (r.ctl === "twitch") return r.sub === "bits" ? `💎 ${r.key || 100}+ bits` : r.sub === "points" ? (r.key ? "💜 " + r.key : "💜 Pick a reward") : (r.key ? "⚡ " + ((PU.find(p => p[0] === r.key) || [, r.key])[1]) : "⚡ Pick a Power-up");
    return "?";
  }
  const SEC = {
    key: ["⌨️ Hotkeys (keys on your keyboard)", "＋ Hotkey", "Nothing yet. A key you press (anywhere, even in a game) that sets off effects or OBS actions."],
    mic: ["🎙️ Mic sounds", "＋ Mic sound", "Nothing yet. e.g. a clap → sparkles, a shout → punch in."],
    track: ["🎯 Tracking (hands, face, body)", "＋ Tracking trigger", "Nothing yet. e.g. ✌️ peace sign → hearts, 🤫 fingers to lips → blow smoke."],
    twitch: ["💜 Twitch (channel points, bits, Power-ups)", "＋ Twitch trigger", "Nothing yet. e.g. a channel points reward → confetti."],
    voice: ["🗣️ Voice commands (VoiceAttack)", "＋ Voice command", "Nothing yet. Type what you'll say, pick what happens, then save your VoiceAttack profile."] };
  const sorted = list => list.slice().sort((a, b) => a.act && !b.act ? 1 : !a.act && b.act ? -1 : strip(labelOf(a)).localeCompare(strip(labelOf(b))));   // A–Z by action, new ones on top
  function renderRules() {
    const box = $("#rulesList"), kbox = $("#keysList"); if (!box) return;
    box.innerHTML = ""; if (kbox) kbox.innerHTML = "";
    const all = sorted(RULES()), q = filt.q.trim().toLowerCase(), kq = filt.kq.trim().toLowerCase();
    let shown = 0;
    CTL.forEach(([c]) => {
      const mine = all.filter(r => !r.kb && r.ctl === c && (!q || labelOf(r).toLowerCase().includes(q)));
      if (q && !mine.length) return;
      const [title, addTxt, empty] = SEC[c];
      const sec = mk("section", "rsec"); sec.dataset.ctl = c;
      const hd = mk("div", "rsech"), add = mk("button", "ghost", addTxt); add.type = "button"; add.dataset.add = c; add.onclick = () => addRule(c);
      hd.append(mk("h3", "", title), mk("span", "rn", mine.length ? mine.length + "" : ""), add);
      const list = mk("div", "tlist"); mine.forEach(r => { shown++; list.append(tCard(r)); });
      sec.append(hd, list);
      if (!mine.length) sec.append(mk("p", "rempty", empty));
      box.append(sec);
    });
    const trig = RULES().filter(r => !r.kb);
    $("#rulesCount").textContent = trig.length ? `${trig.filter(r => r.on && r.act).length} on · ${trig.length} in total` + (shown !== trig.length ? ` · showing ${shown}` : "") : "No triggers yet: add one with a ＋ button.";
    if (kbox) {
      const keys = all.filter(r => r.kb), mine = keys.filter(r => !kq || labelOf(r).toLowerCase().includes(kq));
      mine.forEach(r => kbox.append(tCard(r)));
      if (!keys.length) kbox.append(mk("p", "rempty", "No keybinds yet. Click ＋ New keybind, press the key you want pressed, then pick what sets it off: say something, a gesture, a mic sound…"));
      $("#keysCount").textContent = keys.length ? `${keys.filter(r => r.on && r.act && r.ctl).length} on · ${keys.length} in total` + (mine.length !== keys.length ? ` · showing ${mine.length}` : "") : "";
    }
    rowStatus();
    renderObsList();
    if (window.__needsSync) window.__needsSync();
  }
  function tCard(r) {
    fix(r);
    const open = openId === r.id, c = mk("div", "rrow tcard" + (r.on ? "" : " off") + (open ? " open" : "")); c.dataset.id = r.id;
    const sum = mk("div", "tsum"), sw = document.createElement("input"); sw.type = "checkbox"; sw.checked = !!r.on; sw.title = "On / off";
    sw.onchange = () => { r.on = sw.checked; c.classList.toggle("off", !r.on); rSave(); };
    const swl = mk("label", "tsw"); swl.append(sw); swl.onclick = e => e.stopPropagation();
    const when = mk("button", "twhen" + (r.ctl ? "" : " empty"), whenText(r)); when.type = "button"; when.title = "When this happens…";
    const dos = mk("div", "tdo"), acts = r.acts.filter(Boolean);
    if (r.kb) {   // keybind: the key it presses first, then what sets it off
      const k = parseKeys(r.acts[0] || "keys/"), press = mk("span", "tpress" + (k.acc ? "" : " empty"), k.acc ? actName(r.acts[0]) : "⌨️ Pick the key to press");
      acts.slice(1).forEach(a => dos.append(mk("span", "tpill", "+ " + actName(a))));
      const cd0 = mk("span", "tcd", r.cd ? "⏱ " + r.cd + "s" : "");
      sum.append(swl, press, mk("span", "tarrow", "←"), when, dos, cd0);
    }
    else if (acts.length) acts.forEach(a => dos.append(mk("span", "tpill", actName(a)))); else dos.append(mk("span", "tpill empty", "Choose what happens"));
    const cd = mk("span", "tcd", r.cd ? "⏱ " + r.cd + "s" : ""); cd.title = "Cooldown: seconds before it can go off again";
    const test = mk("button", "ghost", "▶"); test.type = "button"; test.title = "Try it now"; test.onclick = e => { e.stopPropagation(); acts.forEach(a => run(a, RS.by !== false ? "Test" : "")); };
    const edit = mk("button", open ? "primary" : "ghost", open ? "Done" : "✎ Edit"); edit.type = "button";
    const del = mk("button", "ghost", "✕"); del.type = "button"; del.title = "Remove"; del.onclick = e => { e.stopPropagation(); undo = JSON.stringify(RULES()); RS.rules = RULES().filter(x => x !== r); if (openId === r.id) openId = ""; rSave(); renderRules(); showUndo("Removed.", !!r.kb); };
    const btns = mk("span", "tbtns"); btns.append(test, edit, del);
    if (r.kb) sum.append(btns); else sum.append(swl, when, mk("span", "tarrow", "→"), dos, cd, btns);
    sum.onclick = e => { if (e.target.closest(".tbtns") && e.target !== edit) return; toggleOpen(r); };
    c.append(sum, mk("div", "rst"));
    if (open) c.append(editor(r));
    const nd = r.ctl === "track" ? NEEDS[r.sub] : null;
    if (nd) { c.dataset.needs = nd; c.dataset.needmsg = `You need ${{ hands: "hand", face: "face", body: "body" }[nd]} tracking for this to work`; }
    return c;
  }
  function toggleOpen(r) { openId = openId === r.id ? "" : r.id; picking = false; pickQ = ""; renderRules(); if (openId) { const c = document.querySelector(`.tcard[data-id="${r.id}"]`); if (c) c.scrollIntoView({ block: "nearest", behavior: "smooth" }); } }
  function refresh(r) {
    const old = document.querySelector(`.tcard[data-id="${r.id}"]`);
    if (!old) return renderRules();
    const n = tCard(r);
    try { if (!old.isConnected) throw 0; old.replaceWith(n); } catch (e) { renderRules(); return document.querySelector(`.tcard[data-id="${r.id}"]`); }
    rowStatus(); if (window.__needsSync) window.__needsSync(); return n;
  }
  function chips(items, val, on, cls) {
    const w = mk("div", "tchips" + (cls ? " " + cls : ""));
    items.forEach(([v, l]) => { const b = mk("button", "tchip" + (v === val ? " on" : ""), l); b.type = "button"; b.onclick = () => on(v); w.append(b); });
    return w;
  }
  const CTL_KB = [["voice", "🗣️ Voice"], ["track", "🎯 Tracking"], ["mic", "🎙️ Mic"], ["twitch", "💜 Twitch"], ["key", "⌨️ Another key"]];
  function editor(r) {
    const ed = mk("div", "tedit"), kb = !!r.kb;
    let pressStep = null;
    if (kb) {   // 1 · which key to press
      if (!isKeys(r.acts[0])) r.acts.unshift("keys/");
      const k = parseKeys(r.acts[0]);
      pressStep = mk("div", "tstep"); pressStep.append(mk("div", "tlab", "1 · Press"));
      pressStep.append(chips([["keys", "⌨️ Keys (game, Discord, anything in front)"], ["obskey", "🎬 An OBS hotkey"]], k.kind, v => { r.acts[0] = keysAct(v, k.acc, k.hold); fix(r); rSave(); refresh(r); }, "small"));
      const it = actItem(r, r.acts[0], 0); it.querySelector(".tal").textContent = k.kind === "keys" ? "Key to press" : "OBS hotkey to press"; it.querySelectorAll("button.ghost").forEach(b => { if (b.textContent === "✕") b.remove(); });
      pressStep.append(it);
    }
    const w = mk("div", "tstep"); w.append(mk("div", "tlab", (kb ? "2" : "1") + " · When"));
    w.append(chips(kb ? CTL_KB : CTL, r.ctl, v => { if (v === r.ctl) return; r.ctl = v; r.sub = v === "track" ? "hands" : SUB[v] ? SUB[v][0][0] : ""; r.key = ""; r.cd = DEF_CD[v]; if (v === "voice") r.vaNew = true; rSave(); renderRules(); }));
    if (SUB[r.ctl]) w.append(chips(SUB[r.ctl], r.sub, v => { r.sub = v; r.key = ""; rSave(); refresh(r); }, "small"));
    if (r.ctl) w.append(whenPicker(r)); else w.append(mk("p", "note", kb ? "Pick what makes TOS HUB press it: say something, a gesture, a mic sound, a Twitch reward or another key." : "Pick what sets it off."));
    const d = mk("div", "tstep"), real = r.acts.filter(Boolean), from = kb ? 1 : 0;
    d.append(mk("div", "tlab", kb ? "3 · Also do (optional)" : "2 · Do" + (real.length > 1 ? " (all at once)" : "")));
    const list = mk("div", "tacts"); r.acts.forEach((a, i) => { if (a && i >= from) list.append(actItem(r, a, i)); }); d.append(list);
    if (picking || (!kb && !real.length)) d.append(actPicker(r));
    else { const add = mk("button", "ghost tadd", kb ? (r.acts.length > 1 ? "＋ Also do something else" : "＋ Also do something (an effect, a scene…)") : "＋ Add another action"); add.type = "button"; add.onclick = () => { picking = true; pickQ = ""; refresh(r); const s2 = document.querySelector(`.tcard[data-id="${r.id}"] .apick input`); if (s2) s2.focus(); }; d.append(add); }
    const cw = mk("div", "tstep tcdrow"); cw.append(mk("div", "tlab", (kb ? "4" : "3") + " · Cooldown"));
    const row = mk("div", "tcdw"), rg = document.createElement("input"); rg.type = "range"; rg.min = 0; rg.max = 60; rg.step = .5; rg.value = r.cd || 0;
    const v = mk("b", "", (r.cd || 0) + "s"); rg.oninput = () => { v.textContent = rg.value + "s"; };
    rg.onchange = () => { r.cd = +rg.value; rSave(); const t = document.querySelector(`.tcard[data-id="${r.id}"] .tcd`); if (t) t.textContent = r.cd ? "⏱ " + r.cd + "s" : ""; };
    row.append(rg, v, mk("span", "note", "before it can go off again")); cw.append(row);
    const done = mk("button", "primary tdone", "Done"); done.type = "button"; done.onclick = () => { openId = ""; picking = false; renderRules(); };
    if (pressStep) ed.append(pressStep);
    ed.append(w, d, cw, done);
    return ed;
  }
  function whenPicker(r) {
    const L = lists(), box = mk("div", "twpick");
    const grid = items => { const g = mk("div", "tgrid"); items.forEach(([v, l]) => { const b = mk("button", "tchip" + (v === r.key ? " on" : ""), l); b.type = "button"; b.onclick = () => { r.key = v; rSave(); refresh(r); }; g.append(b); }); return g; };
    const text = (ph, val, set, numeric) => { const i = document.createElement("input"); if (numeric) { i.type = "number"; i.min = 1; } i.placeholder = ph; i.value = val || ""; i.onchange = () => { set(i.value.trim()); rSave(); refresh(r); }; return i; };
    if (r.ctl === "track") box.append(grid((L[PREFIX[r.sub]] || []).slice().sort(az)));
    else if (r.ctl === "mic") box.append(grid(L.mic.slice().sort(az)));
    else if (r.ctl === "key") {
      const b = mk("button", "kbkey big", r.key ? prettyKey(r.key) : "Click, then press your keys"); b.type = "button";
      b.onclick = e => { e.preventDefault(); capture(b, acc => { r.key = acc; rSave(); refresh(r); }); };
      box.append(b, mk("p", "note", r.kb ? "When you press this key, TOS HUB presses the other one (handy for remapping). Use Ctrl, Alt or Shift with it, or an F-key or numpad key." : "Use Ctrl, Alt or Shift with a key, or an F-key or numpad key on its own, so normal typing doesn't set it off."));
    }
    else if (r.ctl === "voice") box.append(text("What you'll say, e.g. let it burn", r.key, x => { r.key = x; r.vaNew = true; }), mk("p", "note", "After adding or changing a phrase, save your VoiceAttack profile again (Stream view or Connections)."));
    else if (r.ctl === "twitch" && r.sub === "bits") { if (!r.key) r.key = "100"; box.append(mk("span", "note", "When someone cheers at least this many bits:"), text("100", r.key, x => { r.key = String(Math.max(1, Math.round(+x || 1))); }, true)); }
    else if (r.ctl === "twitch" && r.sub === "points") {
      if (rewards.length) box.append(grid(rewards.map(x => [x.title, `${x.title} (${x.cost})`]).sort(az)));
      else box.append(text("Reward name, exactly as on Twitch", r.key, x => { r.key = x; }), mk("p", "note", "Log in to Twitch (Connections) to pick from your rewards."));
    }
    else if (r.ctl === "twitch" && r.sub === "pu") {
      box.append(grid(PU.slice().sort(az)), mk("span", "note", "Or one of your own Power-ups:"), text("Its name, exactly as on Twitch", PU.some(p => p[0] === r.key) ? "" : r.key, x => { if (x) r.key = x; }));
    }
    return box;
  }
  function actItem(r, a, i) {
    const it = mk("div", "tact");
    if (isKeys(a)) {
      const k = parseKeys(a);
      it.append(mk("span", "tal", k.kind === "keys" ? "⌨️ Press keys" : "🎬 OBS hotkey"));
      const b = mk("button", "kbkey", k.acc ? prettyKey(k.acc) : "Click, then press the keys"); b.type = "button";
      b.onclick = e => { e.preventDefault(); capture(b, acc => { r.acts[i] = keysAct(k.kind, acc, k.hold); fix(r); rSave(); refresh(r); }, true); };
      it.append(b);
      if (k.kind === "keys") {
        const how = document.createElement("select"); how.append(new Option("Tap", "0"), new Option("Hold for…", "1")); how.value = k.hold ? "1" : "0";
        const secs = document.createElement("input"); secs.type = "number"; secs.min = .1; secs.max = 30; secs.step = .1; secs.value = k.hold ? k.hold / 1000 : 1; secs.style.width = "64px"; secs.title = "Seconds";
        secs.hidden = !k.hold;
        const sl = mk("span", "note", "s"); sl.hidden = !k.hold;
        const set = () => { r.acts[i] = keysAct("keys", k.acc, how.value === "1" ? Math.max(100, (+secs.value || 1) * 1000) : 0); fix(r); rSave(); refresh(r); };
        how.onchange = () => { secs.hidden = sl.hidden = how.value !== "1"; set(); }; secs.onchange = set;
        it.append(how, secs, sl);
      } else it.append(mk("span", "note", "the same keys as in OBS → Settings → Hotkeys"));
    } else it.append(mk("span", "tal", actName(a)));
    const t = mk("button", "ghost", "▶"); t.type = "button"; t.title = "Try just this one"; t.onclick = () => run(a, RS.by !== false ? "Test" : "");
    const x = mk("button", "ghost", "✕"); x.type = "button"; x.title = "Remove this action"; x.onclick = () => { r.acts.splice(i, 1); fix(r); rSave(); refresh(r); };
    it.append(t, x);
    return it;
  }
  // the action picker: search, categories, click to add
  const PICK = ["💥 Big moments", "😜 Funny face", "👑 Hats & costumes", "⚡ Magic & elements", "🎉 Party & hype", "💨 Smoke & weather", "🗿 Transform", "✨ More", "🖥️ Whole screen", "🎬 OBS", "⌨️ Keys & hotkeys", "🍊 Objects", "🧰 Controls", "🎛️ My pads"];
  function catalog() {
    const out = [];
    commands().forEach(([c, l]) => {
      const [a, b] = c.split("/");
      const cat = a === "fx" ? (TOS_FX_CATS.find(x => x[0] === tosFxCat(b)) || [, "✨ More"])[1] : a === "screen" ? "🖥️ Whole screen" : a === "obs" ? "🎬 OBS" : a === "object" || a === "stay" ? "🍊 Objects" : a === "pad" ? "🎛️ My pads" : "🧰 Controls";
      out.push([cat, c, l.replace(/^(Effect|Pad|Whole screen): ?/, "")]);
    });
    out.push(["⌨️ Keys & hotkeys", "keys/", "⌨️ Press keys (in your game, Discord…)"], ["⌨️ Keys & hotkeys", "obskey/", "🎬 Press an OBS hotkey"]);
    return out;
  }
  function actPicker(r) {
    const box = mk("div", "apick"), all = catalog(), have = new Set(r.acts);
    const q = document.createElement("input"); q.type = "search"; q.placeholder = "🔎 Find an action (e.g. fire, scene, mute, press)"; q.value = pickQ;
    const bar = mk("div", "tchips small"), g = mk("div", "tgrid");
    const cats = PICK.filter(c => all.some(x => x[0] === c));
    function draw() {
      bar.innerHTML = ""; [["", "All"]].concat(cats.map(c => [c, c])).forEach(([v, l]) => { const b = mk("button", "tchip" + (v === pickCat ? " on" : ""), l); b.type = "button"; b.onclick = () => { pickCat = v; draw(); }; bar.append(b); });
      g.innerHTML = "";
      const qq = pickQ.trim().toLowerCase(), hit = x => !qq || (x[2] + " " + x[0]).toLowerCase().includes(qq);
      const show = cats.filter(c => qq || !pickCat || c === pickCat);
      let n = 0;
      show.forEach(c => {
        const items = all.filter(x => x[0] === c && hit(x)).sort((a, b) => strip(a[2]).localeCompare(strip(b[2])));
        if (!items.length) return;
        if (show.length > 1) g.append(mk("div", "tghead", c));
        items.forEach(([, id, l]) => {
          n++; const b = mk("button", "tchip" + (have.has(id) ? " on" : ""), l); b.type = "button"; b.title = l;
          b.onclick = () => {
            r.acts = r.acts.filter(Boolean).concat(id.endsWith("/") ? keysAct(id.slice(0, -1), "", 0) : id); fix(r);
            picking = false; pickQ = ""; rSave(); const card2 = refresh(r);
            if (id.endsWith("/") && card2) { const ks = card2.querySelectorAll(".tact .kbkey"); if (ks.length) ks[ks.length - 1].click(); }
          };
          g.append(b);
        });
      });
      if (!n) g.append(mk("p", "rempty", "Nothing matches that."));
    }
    q.oninput = () => { pickQ = q.value; draw(); };
    draw();
    box.append(q, bar, g);
    if (r.acts.some(Boolean)) { const c = mk("button", "ghost tadd", "Cancel"); c.type = "button"; c.onclick = () => { picking = false; refresh(r); }; box.append(c); }
    return box;
  }
  // status text on each row: key taken, mic off, Twitch login, etc.
  function rowStatus() {
    const tw = window.hubTwitch, st = tw ? tw.status() : {};
    document.querySelectorAll(".rrow").forEach(row => {
      const r = RULES().find(x => x.id === row.dataset.id), el2 = row.querySelector(".rst"); if (!r || !el2) return;
      let t = "", bad = false;
      const obsOff = r.acts && r.acts.some(a => /^obs(key)?\//.test(a)) && !(window.hubObs && window.hubObs.connected);
      const keyNoApp = r.acts && r.acts.some(a => /^keys\//.test(a)) && !(H && H.pressKeys);
      const keyEmpty = r.acts && r.acts.some(a => /^(keys|obskey)\/(\/|$)/.test(a));
      if (!r.ctl) { t = r.kb ? "Pick what makes it press the key" : "Pick what sets it off"; bad = true; }
      else if (!r.act) t = "Choose what happens";
      else if (keyEmpty) { t = "Pick the key to press"; bad = true; }
      else if (keyNoApp) { t = "Pressing keys works in the TOS HUB desktop app"; bad = true; }
      else if (obsOff) { t = "Connect OBS (Connections tab) for the OBS action" + (r.acts.length > 1 ? "s" : ""); bad = true; }
      else if (r.ctl === "voice" && r.key && r.vaNew) t = "New: save your VoiceAttack profile again (Stream view or Connections) so it hears this.";
      else if (r.ctl === "key") { const k = kbResults[r.key]; t = !r.key ? "Press a key" : !(H && H.setKeybinds) ? "Keys need the desktop app" : k ? (k.ok ? "" : k.why === "chat" ? "Used by the on-screen chat" : k.why === "twice" ? "That key is used twice" : "Taken by another program") : ""; bad = !!(k && !k.ok); }
      else if (r.ctl === "mic" && cam().micOn && !cam().micOn()) { t = "⏸ Mic reactions are switched off (Mic reactions card)"; bad = true; }
      else if (r.ctl === "twitch" && r.sub !== "bits") { if (!tw || !tw.loggedIn()) { t = "Log in to Twitch first"; bad = true; } else if (r.on && st.err) { t = st.err; bad = true; } }
      else if (r.ctl === "voice" && !r.key) t = "Type what you'll say";
      el2.textContent = t; el2.className = "rst" + (bad ? " bad" : "");
    });
  }
  // keys
  const KEYNAMES = { Space: "Space", Enter: "Enter", Tab: "Tab", Backspace: "Backspace", Delete: "Delete", Insert: "Insert", Home: "Home", End: "End", PageUp: "PageUp", PageDown: "PageDown",
    ArrowUp: "Up", ArrowDown: "Down", ArrowLeft: "Left", ArrowRight: "Right", Minus: "-", Equal: "=", BracketLeft: "[", BracketRight: "]", Semicolon: ";", Quote: "'", Backquote: "`", Backslash: "\\", Comma: ",", Period: ".", Slash: "/",
    NumpadAdd: "numadd", NumpadSubtract: "numsub", NumpadMultiply: "nummult", NumpadDivide: "numdiv", NumpadDecimal: "numdec", Pause: "Pause", ScrollLock: "Scrolllock", PrintScreen: "PrintScreen" };
  function accelOf(e, bare) {
    const c = e.code || ""; let k = "";
    if (/^Key[A-Z]$/.test(c)) k = c.slice(3); else if (/^Digit\d$/.test(c)) k = c.slice(5); else if (/^F\d{1,2}$/.test(c)) k = c; else if (/^Numpad\d$/.test(c)) k = "num" + c.slice(6); else k = KEYNAMES[c] || "";
    if (!k) return null;
    const mods = []; if (e.ctrlKey) mods.push("Ctrl"); if (e.altKey) mods.push("Alt"); if (e.shiftKey) mods.push("Shift"); if (e.metaKey) mods.push("Super");
    if (!bare && !mods.length && !/^F\d{1,2}$|^num|^(Pause|Scrolllock|Insert|Home|End|PageUp|PageDown)$/.test(k)) return { err: "Add Ctrl, Alt or Shift to that key, so it doesn't stop working when you type." };
    return { acc: [...mods, k].join("+") };
  }
  const prettyKey = a => (a || "").replace(/\bnum(\d)\b/g, "Num $1").replace(/numadd/, "Num +").replace(/numsub/, "Num -").replace(/nummult/, "Num *").replace(/numdiv/, "Num /").replace(/numdec/, "Num .").replace(/\+/g, " + ");
  let capturing = false;
  function capture(btn, done, bare) {
    if (capturing) return;
    capturing = true; const was = btn.textContent; btn.classList.add("wait"); btn.textContent = "Press the keys… (Esc cancels)";
    const onKey = e => {
      if (["Control", "Alt", "Shift", "Meta"].includes(e.key)) return;
      e.preventDefault(); e.stopPropagation(); window.removeEventListener("keydown", onKey, true); capturing = false; btn.classList.remove("wait");
      if (e.key === "Escape") { btn.textContent = was; return; }
      const a = accelOf(e, bare);
      if (!a || a.err) { btn.textContent = was; const m = btn.closest("#tab-keys") ? $("#keysMsg") : $("#rulesMsg"); m.textContent = a ? a.err : "TOS HUB can't use that key. Try another."; m.className = "note warn"; return; }
      btn.textContent = prettyKey(a.acc); done(a.acc);
    };
    window.addEventListener("keydown", onKey, true);
  }
  // Twitch rewards for the dropdown
  let rewards = [];
  async function loadRewards() {
    const tw = window.hubTwitch, m = $("#rulesMsg");
    if (!tw || !tw.loggedIn()) return;
    const can = await tw.canRedeem();
    if (can === false) { m.innerHTML = ""; m.append("Log in to Twitch again so TOS HUB can see channel points and Power-ups. "); const b = mk("button", "ghost", "Log in again"); b.type = "button"; b.onclick = () => tw.login(); m.append(b); m.className = "note warn"; return; }
    try { rewards = await tw.rewards(); renderRules(); } catch (e) { rewards = []; }
  }
  function addRule(ctl, act, key, sub) {
    const c = ctl || "key", r = fix({ id: rid(), on: true, act: act || "", ctl: c, sub: sub || (c === "track" ? "hands" : SUB[c] ? SUB[c][0][0] : ""), key: key || "", cd: DEF_CD[c] });
    if (c === "voice") r.vaNew = true;
    RS.rules.unshift(r);
    openId = r.id; picking = false; pickQ = ""; pickCat = "";
    filt.q = ""; filt.kq = ""; if ($("#rulesFind")) $("#rulesFind").value = ""; if ($("#keysFind")) $("#keysFind").value = ""; rSave(); renderRules();
    const row = document.querySelector(`.tcard[data-id="${r.id}"]`);
    if (row) {
      row.scrollIntoView({ block: "center", behavior: "smooth" });
      if (c === "key" && !r.key) { const b = row.querySelector(".twpick .kbkey"); if (b) b.click(); }
      else if (c === "voice") { const i = row.querySelector(".twpick input"); if (i) { i.focus(); i.select(); } }
    }
    return r;
  }
  function addKb() {
    const r = fix({ id: rid(), on: true, kb: true, kbMigr: true, acts: ["keys/"], ctl: "", sub: "", key: "", cd: 1 });
    RS.rules.unshift(r); openId = r.id; picking = false; filt.kq = ""; if ($("#keysFind")) $("#keysFind").value = "";
    rSave(); renderRules();
    const row = document.querySelector(`.tcard[data-id="${r.id}"]`);
    if (row) { row.scrollIntoView({ block: "center", behavior: "smooth" }); const b = row.querySelector(".tact .kbkey"); if (b) b.click(); }
    return r;
  }
  window.hubOpenRule = id => {
    const r = RULES().find(x => x.id === id); if (!r) return;
    const t = document.querySelector(`.tabs button[data-tab="${r.kb ? "keys" : "trig"}"]`); if (t) t.click();
    openId = id; picking = false; filt.q = filt.kq = ""; renderRules();
    setTimeout(() => { const c = document.querySelector(`.tcard[data-id="${id}"]`); if (c) c.scrollIntoView({ block: "center", behavior: "smooth" }); }, 120);
  };
  // open the Triggers tab (at one kind of trigger)
  window.hubGoRules = ctl => {
    const t = document.querySelector(`.tabs button[data-tab="${ctl === "kb" ? "keys" : "trig"}"]`); if (t) t.click();
    setTimeout(() => { const sc = ctl && document.querySelector(`.rsec[data-ctl="${ctl}"]`); if (sc) sc.scrollIntoView({ behavior: "smooth", block: "start" }); }, 120);
  };
  let undo = "";
  function showUndo(t, keys) { const m = $(keys ? "#keysMsg" : "#rulesMsg"); if (!m) return; m.innerHTML = ""; m.append(t + " "); const b = mk("button", "ghost", "↶ Undo"); b.type = "button"; b.onclick = doUndo; m.append(b); m.className = "note"; }
  function doUndo() { if (!undo) return; try { RS.rules = JSON.parse(undo).map(fix); } catch (e) {} undo = ""; rSave(); renderRules(); ["#rulesMsg", "#keysMsg"].forEach(q => { const m = $(q); if (m && m.querySelector("button")) { m.textContent = "Put back ✓"; m.className = "note ok"; } }); }
  // Stream view: OBS actions with ＋ Key / ＋ Voice
  function renderObsList() {
    const box = $("#lvObsList"); if (!box) return;
    const o = window.hubObs;
    if (!o || !o.connected) { box.innerHTML = '<p class="note">Connect OBS on the Connections tab to see your scenes and audio here.</p>'; return; }
    box.innerHTML = "";
    const G = c => ({ scene: "Scenes", lastscene: "Scenes", mute: "Mute / unmute", item: "Show / hide sources" })[c.split("/")[1]] || "Stream & recording";
    const groups = {};
    obsCommands().forEach(x => (groups[G(x[0])] = groups[G(x[0])] || []).push(x));
    ["Stream & recording", "Scenes", "Mute / unmute", "Show / hide sources"].forEach(g => {
      if (!groups[g]) return;
      box.append(mk("div", "og", g));
      groups[g].forEach(([c, l]) => {
        const row = mk("div", "orow"), uses = RULES().filter(r => r.acts && r.acts.includes(c));
        const say = (window.__obsSay(c, l) || "").split(";")[0];
        row.append(mk("span", "ol", l), mk("span", "os", say ? "“" + say + "”" : ""));
        [["key", "＋ Key", "Give this a keybind"], ["voice", "＋ Voice", "Say “" + say + "” in VoiceAttack"]].forEach(([k, t, tip]) => {
          const has = uses.find(r => r.ctl === k), b = mk("button", "ghost ob" + (has ? " has" : ""), has ? (k === "key" ? (has.key ? prettyKey(has.key) : "⌨️ set key") : "🗣️ " + (has.key || "set")) : t); b.type = "button";
          b.title = has ? "Already set: open it in the Triggers tab" : tip;
          b.onclick = () => { window.hubGoRules(k); setTimeout(() => { if (has) { const rw = document.querySelector(`.rrow[data-id="${has.id}"]`); if (rw) { rw.scrollIntoView({ block: "center" }); rw.classList.remove("fired"); void rw.offsetWidth; rw.classList.add("fired"); } } else addRule(k, c, k === "voice" ? say : ""); }, 200); };
          row.append(b);
        });
        box.append(row);
      });
    });
  }
  function wireRules() {
    if (!$("#rulesList")) return;
    $("#rulesFind").oninput = () => { filt.q = $("#rulesFind").value; renderRules(); };
    $("#rulesClear").onclick = () => { if (!RULES().some(r => !r.kb)) return; undo = JSON.stringify(RULES()); RS.rules = RULES().filter(r => r.kb); openId = ""; rSave(); renderRules(); showUndo("Removed every trigger (your keybinds are kept)."); };
    $("#rulesUndo").onclick = doUndo;
    $("#keysAdd").onclick = () => addKb();
    { const g = $("#goHotkeys"); if (g) g.onclick = e => { e.preventDefault(); window.hubGoRules("key"); }; }
    $("#keysFind").oninput = () => { filt.kq = $("#keysFind").value; renderRules(); };
    { const g = $("#goTrig"); if (g) g.onclick = () => window.hubGoRules("key"); }
    if (tidyMsg) { const m = $("#rulesMsg"); m.textContent = tidyMsg; m.className = "note ok"; }
    $("#lvVaMake").onclick = () => makeProfile($("#lvVaMsg"));
    $("#lvGoRules").onclick = () => window.hubGoRules("key");
    $("#lvGoRules").textContent = "Open Triggers";
    $("#rulesBy").checked = RS.by !== false; $("#rulesBy").onchange = () => { RS.by = $("#rulesBy").checked; rSave(); };
    renderRules(); afterChange(); loadRewards();
  }
  // the Triggers card gets its own top tab
  { const home = $("#trigHome"), rc = $("#rulesCard"); if (home && rc) { home.append(rc); const h = rc.querySelector("h2"); if (h) h.textContent = "⚡ Triggers"; } }
  setTimeout(wireRules, 900);
  ["trig", "keys"].forEach(k => document.querySelector(`.tabs button[data-tab="${k}"]`).addEventListener("click", () => setTimeout(() => { renderRules(); if (k === "trig") loadRewards(); }, 50)));
  document.querySelector('.tabs button[data-tab="live"]').addEventListener("click", () => setTimeout(renderObsList, 300));
  { let was = null; setInterval(() => { const c = !!(window.hubObs && window.hubObs.connected && (window.hubObs.scenes || []).length); if (c !== was) { was = c; renderObsList(); rowStatus(); } }, 2000); }
  setTimeout(() => render(false), 800);
  document.querySelector('.tabs button[data-tab="conn"]') && document.querySelector('.tabs button[data-tab="conn"]').addEventListener("click", () => render(false));
})();
