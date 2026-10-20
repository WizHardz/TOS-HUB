  // ================= mic reactions =================
  const mic = { stream: null, actx: null, an: null, buf: null, timer: null, db: -100, prev: -100, floor: -55, loudSince: 0, laughSince: 0, last: {} };
  window.__mic = mic;   // for TOS HUB's own tests
  async function micStart() {
    if (mic.stream) return;
    const dev = C.trk.mic.dev;
    try {
      mic.stream = await navigator.mediaDevices.getUserMedia({ audio: Object.assign({ echoCancellation: false, noiseSuppression: false, autoGainControl: false }, /^p\d+$/.test(C.trk.mic.ch || "") ? { channelCount: { ideal: 20 } } : {}, dev ? { deviceId: { exact: dev } } : {}), video: false });
    } catch (e) {
      if (dev && (e.name === "OverconstrainedError" || e.name === "NotFoundError")) throw new Error("the microphone you picked isn't connected or switched on. Plug it in or switch it on (TOS HUB will pick it up), or choose another one.");
      if (e.name === "NotFoundError") throw new Error("no microphone found. Plug one in or switch it on, and TOS HUB will pick it up.");
      if (e.name === "NotReadableError") throw new Error("the microphone is busy or just switched on. TOS HUB will try again in a moment.");
      throw e;
    }
    const tr = mic.stream.getAudioTracks()[0];
    mic.label = tr ? tr.label : "";
    if (tr) tr.onended = () => { if (mic.stream && mic.stream.getAudioTracks()[0] === tr) { micStop(); micMsg("The microphone disconnected. TOS HUB will reconnect when it's back.", "warn"); micList(); } };
    mic.actx = new (window.AudioContext || window.webkitAudioContext)();
    const src = mic.actx.createMediaStreamSource(mic.stream);
    mic.an = mic.actx.createAnalyser(); mic.an.fftSize = 1024; mic.an.smoothingTimeConstant = 0; mic.buf = new Float32Array(mic.an.fftSize); mic.fbuf = new Float32Array(mic.an.frequencyBinCount);
    micRoute(src, tr);   // only measured: never played back, recorded or sent anywhere
    mic.timer = setInterval(micTick, 20);
  }
  // which channels to listen to: all of them, one side, or one fader's pair of tracks on a multitrack input
  const micChans = ch => ch === "L" ? [0] : ch === "R" ? [1] : /^p\d+$/.test(ch || "") ? [(+ch.slice(1)) * 2 - 2, (+ch.slice(1)) * 2 - 1] : null;
  function micRoute(src, tr) {
    const set = (tr && tr.getSettings && tr.getSettings()) || {};
    const n = Math.max(1, set.channelCount || src.channelCount || 2), want = micChans(C.trk.mic.ch);
    mic.chans = n; mic.chFallback = false;
    if (!want) { src.connect(mic.an); micChNote(); return; }
    if (Math.max(...want) >= n) { mic.chFallback = true; src.connect(mic.an); micChNote(); return; }
    const split = mic.actx.createChannelSplitter(n), sum = mic.actx.createGain();
    sum.channelCount = 1; sum.channelCountMode = "explicit"; sum.gain.value = 1 / want.length;
    src.connect(split); want.forEach(i => split.connect(sum, i, 0)); sum.connect(mic.an);
    micChNote();
  }
  function micChNote() {
    const el2 = $("#micChNote"); if (!el2) return;
    const sel = $("#micCh"), name = sel && sel.selectedOptions[0] ? sel.selectedOptions[0].textContent : "";
    if (!mic.stream) { el2.textContent = ""; el2.className = "note"; return; }
    if (mic.chFallback) { el2.textContent = `This input only gives TOS HUB ${mic.chans} channel${mic.chans > 1 ? "s" : ""}, so “${name}” isn't on it. Listening to every channel instead. Pick a fader's own input in “Microphone” instead (see the setup guide below).`; el2.className = "note warn"; return; }
    el2.textContent = `This input gives TOS HUB ${mic.chans} channel${mic.chans > 1 ? "s" : ""}.` + (C.trk.mic.ch !== "all" ? ` Listening to: ${name} ✓` : "");
    el2.className = "note";
  }
  // RØDECaster inputs: which one hears only your mic, and which ones hear everything
  const isRode = l => /r[øo]de|rodecaster/i.test(l || "");
  function rodeScore(l) {
    if (!isRode(l)) return 0;
    if (/main|system|stream|chat|mix\b/i.test(l)) return 1;          // the whole mix: has game and music in it too
    if (/(fader|mic(rophone)?|input|channel)\s*0?1\b/i.test(l)) return 4;   // fader / input 1: where an SM7B usually goes
    if (/(fader|mic(rophone)?|input|channel)\s*0?2\b/i.test(l)) return 3;
    if (/fader|mic\b|microphone/i.test(l)) return 2;
    return 1;
  }
  function micHint(ins) {
    const h = $("#micDevHint"); if (!h) return;
    const sel = $("#micDev"), cur = sel && sel.selectedOptions[0], label = (cur && cur.value ? cur.textContent : "") || mic.label || "";
    const anyRode = (ins || []).some(d => isRode(d.label));
    let t = "", cls = "";
    if (isRode(label)) {
      if (/chat/i.test(label)) { t = "⚠ This is the Duo's Chat mix: it has your game, music and alerts in it too, so those can set off reactions. Choose the input for your SM7B's fader instead (setup guide below)."; cls = "warn"; }
      else if (rodeScore(label) >= 2) { t = "✓ Only your mic's fader: game sounds, music and alerts can't set off reactions."; cls = "ok"; }
      else if (C.trk.mic.ch !== "all" && C.trk.mic.ch !== "p1" && !mic.chFallback && mic.stream) { t = "✓ Listening to one fader's tracks only, so game sounds can't set off reactions."; cls = "ok"; }
      else { t = "⚠ This is the Duo's whole mix, so game sounds, music and alerts can set off reactions too. For your mic only, turn on the Duo's multitrack output and pick your SM7B's fader (setup guide below)."; cls = "warn"; }
    } else if (anyRode && !C.trk.mic.dev) { t = "Tip: your RØDECaster is plugged in. Pick it above (the input for your SM7B's fader) so only your mic is heard."; }
    h.textContent = t; h.className = "note " + cls;
  }
  function micStop() {
    clearInterval(mic.timer); mic.timer = null;
    if (mic.stream) mic.stream.getTracks().forEach(t => t.stop());
    if (mic.actx) mic.actx.close().catch(() => {});
    mic.stream = mic.actx = mic.an = null; mic.db = -100; mic.peak = -100;
    const m = $("#micMeter"); if (m) m.style.width = "0%";
    const pk = $("#micPeak"); if (pk) pk.style.left = "0"; const dbt = $("#micDb"); if (dbt) dbt.textContent = "Mic off";
  }
  // the level meter on the Mic reactions card
  const pctOf = db => Math.max(0, Math.min(100, (db + 70) / 70 * 100));
  function micMark() { const t = C.trk.mic.thr == null ? -16 : C.trk.mic.thr, mk = $("#micThrMark"); if (mk) mk.style.left = pctOf(t) + "%"; }
  function micDraw(db, thr, now) {
    if (mic.cal) mic.cal.push(db);
    if (now - (mic.drawAt || 0) < 40) return; mic.drawAt = now;
    mic.peak = Math.max(db, (mic.peak == null ? -100 : mic.peak) - .4);
    const m = $("#micMeter"); if (!m || !m.offsetParent) return;
    m.style.width = pctOf(db) + "%"; m.style.background = db > thr ? "var(--bad)" : db > thr - 8 ? "var(--warn)" : "var(--good)";
    $("#micPeak").style.left = `calc(${pctOf(mic.peak)}% - 2px)`;
    $("#micDb").textContent = db < -69 ? "silent" : Math.round(db) + " dB";
    if (mic.heardAt && now - mic.heardAt > 2500) { $("#micHeard").textContent = ""; mic.heardAt = 0; }
  }
  const HEARD = { shout: "🗣️ shout", bang: "💥 bang", laugh: "😂 laugh", clap: "👏 clap", click: "🫰 snap / click" };
  function micHeard(kind) { const h = $("#micHeard"); if (h) h.textContent = "Heard: " + (HEARD[kind] || kind); mic.heardAt = Date.now(); }
  // "Set from my voice": listen for 4 seconds of normal talking, put the shout line a little above it
  async function micCalibrate() {
    const btn = $("#micCal"), wasOn = !!mic.stream;
    try { await micStart(); } catch (e) { micMsg("Couldn't open the mic: " + e.message, "err"); return; }
    mic.cal = []; btn.disabled = true;
    for (let i = 4; i > 0; i--) { btn.textContent = `🎙 Talk normally… ${i}`; await new Promise(r => setTimeout(r, 1000)); }
    const vals = (mic.cal || []).filter(v => v > -65).sort((a, b) => a - b); mic.cal = null;
    btn.disabled = false; btn.textContent = "🎙 Set from my voice";
    if (vals.length < 20) { micMsg("Didn't hear much. Try again and talk a bit closer to the mic.", "warn"); }
    else {
      const talk = vals[Math.floor(vals.length * .9)], thr = Math.max(-40, Math.min(-3, Math.round(talk + 8)));
      C.trk.mic.thr = thr; $("#micThr").value = thr; $("#micThrV").textContent = thr + " dB"; save(); micMark();
      micMsg(`Your normal talking peaks around ${Math.round(talk)} dB, so shouting now counts above ${thr} dB ✓`, "ok");
    }
    if (!wasOn && !C.trk.mic.on) setTimeout(() => { if (!C.trk.mic.on) { micStop(); $("#micDb").textContent = "Mic off"; } }, 4000);
  }
  function micReact(kind) {
    micHeard(kind); (mic.log = mic.log || []).push(kind); if (mic.log.length > 50) mic.log.shift();
    if (mic.practice || mic.test) { micPracticeLog(kind); return; }   // testing: show what was heard, but no effects
    if (!C.trk.mic.on) return;   // just showing the level (e.g. while setting it up): no effects
    if (mic.noted !== kind || Date.now() - (mic.notedAt || 0) > 600) { mic.noted = kind; mic.notedAt = Date.now(); noteTrigger("mic:" + kind); }
    const now = Date.now();
    if (!ruleWants("mic:" + kind) || now - (mic.last[kind] || 0) < 1000) return;
    mic.last[kind] = now;
    ruleFire("mic:" + kind);
    if (now - lastReactionAt < 2500 || kind === "shout") clipMoment("loud");
  }
  // how "bright" the sound is right now (its average pitch, in Hz): snaps and clicks are brighter than claps, claps brighter than bangs
  function micBright() {
    mic.an.getFloatFrequencyData(mic.fbuf);
    const hz = mic.actx.sampleRate / 2 / mic.fbuf.length; let num = 0, den = 0, low = 0;
    for (let i = Math.ceil(150 / hz); i < Math.min(mic.fbuf.length, 12000 / hz); i++) { const m = Math.pow(10, mic.fbuf[i] / 20); num += m * i * hz; den += m; if (i * hz < 1500) low += m; }
    mic.lowShare = den ? low / den : 0;   // how much of it is lower-pitched: claps have plenty, snaps hardly any
    return den ? num / den : 0;
  }
  // a short sharp sound: wait ~150 ms to see how long it rings, then decide what it was
  function micOnset(db, now) {
    const o = mic.onset, L = C.trk.mic.learn || null;
    if (!o) {
      const dyn = C.trk.mic.profile === "sm7b", floor = dyn ? Math.max(mic.floor, -60) : mic.floor;
      const rise = mic.test ? 8 : (L && L.rise) || 14;   // the mic test listens extra closely so it catches quiet claps
      if (db - mic.prev > rise && db > floor + rise) {
        // with a gated, close-up dynamic mic, the start of a word jumps up out of silence too: skip it while you're mid-sentence
        if (dyn && !mic.test && micRecent(now) > (C.trk.mic.thr == null ? -16 : C.trk.mic.thr) - 14) return;
        const b = micBright(); mic.onset = { at: now, max: db, bright: b, low: mic.lowShare, end: 0, floor, rise: db - mic.prev, from: mic.prev, bs: b, ls: mic.lowShare, n: 1 };
      }
      return;
    }
    if (db > o.max) { o.max = db; const b = micBright(); if (b > o.bright) { o.bright = b; o.low = mic.lowShare; } }
    if (!o.end && db >= o.max - 12 && o.n < 6) { const b = micBright(); o.bs += b; o.ls += mic.lowShare; o.n++; }   // its overall sound, not just the very first crack
    if (!o.end && db < o.max - 12) o.end = now;
    else if (o.end && now - o.end >= 30) o.tail = Math.max(o.tail == null ? -100 : o.tail, db);   // what's left after the hit
    if (now - o.at < 150) return;
    mic.onset = null;
    const thr = C.trk.mic.thr == null ? -16 : C.trk.mic.thr, fl = o.floor == null ? mic.floor : o.floor;
    const snd = { dur: (o.end || now) - o.at, bright: Math.round(o.bright), low: +o.low.toFixed(2), ab: Math.round(o.bs / o.n), al: +(o.ls / o.n).toFixed(2), max: Math.round(o.max), rise: Math.round(o.rise), lift: Math.round(o.max - Math.max(fl, o.from)),
      // the SM7B setting: a clap or snap dies away; a word keeps going (the vowel after the first sound)
      talk: C.trk.mic.profile === "sm7b" && ((o.max <= thr && db > o.max - 24 && db > fl + 18) || (o.end && o.tail != null && o.tail > o.max - 20)) };
    mic.lastSound = snd;
    if (mic.test && mic.test.sounds) mic.test.sounds.push(Object.assign({ step: mic.test.step }, snd));
    const kind = micKind(snd, thr, fl);
    if (kind) micReact(kind);
  }
  // what a short sound was: your own learned claps and snaps first (from the mic test), then the built-in rules
  function micKind(s, thr, fl) {
    const L = C.trk.mic.learn || null, dyn = C.trk.mic.profile === "sm7b";
    if (s.talk) return "";
    const short = s.dur <= 90, minLift = L && L.rise ? Math.max(8, L.rise - 2) : 14;
    if (short && L && (L.clap || L.snap) && s.lift >= minLift) {
      const d = r => r ? Math.abs(Math.log2((s.ab + 50) / (r.bright + 50))) + Math.abs(s.al - r.low) * 3 : 99;
      const dc = d(L.clap), ds = d(L.snap);
      if (Math.min(dc, ds) < 1.3) return dc <= ds ? "clap" : "click";
    }
    const snap = s.bright >= 6500 || (s.bright >= 2500 && s.low < .08);
    if (short && snap && s.max > fl + 14) return "click";
    if (short && s.bright >= 700 && s.max > fl + 20) return "clap";
    if (dyn) return s.max > thr + 2 ? "bang" : "";   // a bang has to be louder than your shout line (desk knocks aren't)
    return s.max > thr - 6 ? "bang" : "";   // longer or deeper: a bang
  }
  // the loudest it was 60–400 ms ago (were you talking just before this sound?)
  function micRecent(now) { let m = -100; (mic.hist || []).forEach(([t, d]) => { if (now - t >= 60 && now - t <= 400 && d > m) m = d; }); return m; }
  function micTick() {
    if (!mic.an) return;
    mic.an.getFloatTimeDomainData(mic.buf);
    let sum = 0; for (let i = 0; i < mic.buf.length; i++) sum += mic.buf[i] * mic.buf[i];
    const db = 20 * Math.log10(Math.sqrt(sum / mic.buf.length) + 1e-9), now = Date.now();
    mic.prev = mic.db; mic.db = db;
    (mic.hist = mic.hist || []).push([now, db]); while (mic.hist.length > 20) mic.hist.shift();
    const thr = C.trk.mic.thr == null ? -16 : C.trk.mic.thr;
    if (db < thr - 10) mic.floor += (db - mic.floor) * .02;
    micDraw(db, thr, now);
    if ((C.trk.obj || now < (window.__objTimedUntil || 0)) && now - (mic.lvlSent || 0) > 50) { mic.lvlSent = now; try { toCam({ type: "lvl", v: Math.max(0, Math.min(1, (db - mic.floor - 6) / Math.max(8, thr - mic.floor))) }); } catch (e) {} }   // makes the object bounce when you're loud
    if (mic.test && mic.test.step) mic.test.levels.push([mic.test.step, db]);
    if (db > thr) { if (!mic.loudSince) mic.loudSince = now; if (now - mic.loudSince > 300) micReact("shout"); } else mic.loudSince = 0;
    micOnset(db, now);   // claps, snaps and bangs
    const smiling = ((blend.mouthSmileLeft || 0) + (blend.mouthSmileRight || 0)) / 2 > .45;
    if (db > thr - 9 && smiling) { if (!mic.laughSince) mic.laughSince = now; if (now - mic.laughSince > 700) micReact("laugh"); } else if (db < thr - 14) mic.laughSince = 0;
  }
  async function micSync() {
    if (C.trk.mic.on) {
      try { await micStart(); micMsg(`Listening to ${mic.label ? "“" + mic.label + "”" : "your mic"} ✓ (only the level; nothing is recorded or sent anywhere)`, "ok"); micList(); micChNote(); }
      catch (e) { micMsg("Couldn't open the mic: " + e.message, "err"); }
    } else { micStop(); micMsg("", ""); }
  }
  // the list of microphones (names show once TOS HUB has been allowed to use one)
  async function micList() {
    const sel = $("#micDev"); if (!sel || !navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) return [];
    let ins = [];
    try { ins = (await navigator.mediaDevices.enumerateDevices()).filter(d => d.kind === "audioinput" && d.deviceId !== "default" && d.deviceId !== "communications"); } catch (e) { return []; }
    const want = C.trk.mic.dev || "";
    sel.innerHTML = ""; sel.append(opt("", "Default microphone", !want));
    ins.forEach((d, i) => sel.append(opt(d.deviceId, d.label || "Microphone " + (i + 1), d.deviceId === want)));
    if (want && !ins.some(d => d.deviceId === want)) sel.append(opt(want, "Your chosen mic (not connected right now)", true));
    // a RØDECaster is plugged in and you haven't chosen a mic yet: pick the input that only hears your mic
    if (!want && !C.trk.mic.picked) {
      const best = ins.filter(d => d.label).map(d => ({ d, sc: rodeScore(d.label) })).sort((x, y) => y.sc - x.sc)[0];
      if (best && best.sc >= 2) {
        C.trk.mic.dev = best.d.deviceId; C.trk.mic.picked = true; save(); sel.value = best.d.deviceId;
        micMsg(`Found your RØDECaster and picked “${best.d.label}” so only your mic sets off reactions ✓`, "ok");
        if (mic.stream) { micStop(); micSync(); }
      }
    }
    micHint(ins);
    return ins;
  }
  // reconnect: look again, then start fresh
  async function micRefresh(quiet) {
    await micList();
    if (!C.trk.mic.on) { if (!quiet) micMsg("Microphone list updated ✓", "ok"); return; }
    micStop(); await micSync();
  }
  // a mic plugged in or switched on later (or unplugged): Windows tells us, so pick it up by itself
  let micDevT = null;
  if (navigator.mediaDevices && navigator.mediaDevices.addEventListener) navigator.mediaDevices.addEventListener("devicechange", () => {
    clearTimeout(micDevT);
    micDevT = setTimeout(async () => {   // give a newly switched-on mic a moment to be ready
      const ins = await micList();
      if (!C.trk.mic.on) return;
      const tr = mic.stream && mic.stream.getAudioTracks()[0], live = tr && tr.readyState === "live";
      const want = C.trk.mic.dev, onWanted = !want || (tr && tr.getSettings && tr.getSettings().deviceId === want);
      if (!live || (!onWanted && ins.some(d => d.deviceId === want))) micRefresh(true);
    }, 1200);
  });
  // still not connected? keep trying quietly every few seconds while mic reactions are on
  setInterval(() => { if (C.trk.mic.on && !mic.stream && !document.hidden) micSync(); }, 5000);
  // ---- the mic test: check your levels and learn what your claps and snaps sound like ----
  const MT_STEPS = [
    ["quiet", "🤫", "Stay quiet", 3, "Checking the background noise…"],
    ["talk", "🗣️", "Talk normally", 5, "Say anything, the way you talk on stream…"],
    ["clap", "👏", "Clap 3 times", 6, "Clap like you would on stream, with gaps between…"],
    ["snap", "🫰", "Snap your fingers 3 times", 6, "Snap near the mic, with gaps between…"],
    ["shout", "📢", "Shout (or cheer) once", 4, "Like you just won a round…"]
  ];
  const mtState = {};
  function mtRender(cur) {
    const ol = $("#mtSteps"); if (!ol) return; ol.innerHTML = "";
    MT_STEPS.forEach(([k, ic, title, secs, how]) => {
      const st = mtState[k] || {};
      const li = el("li", (cur === k ? "now " : "") + (st.cls || ""));
      li.append(el("span", "ic", ic));
      const tx = el("div"); tx.append(el("b", "", title + (cur === k && st.left != null ? ` · ${st.left}s` : "")), el("span", "st", cur === k ? how : (st.text || `${secs} seconds`)));
      li.append(tx); ol.append(li);
    });
  }
  const median = a => { const b = a.slice().sort((x, y) => x - y); return b.length ? b[Math.floor(b.length / 2)] : null; };
  const pctile = (a, p) => { const b = a.slice().sort((x, y) => x - y); return b.length ? b[Math.min(b.length - 1, Math.floor(b.length * p))] : null; };
  async function micTest() {
    const go = $("#mtGo"), wasOn = !!mic.stream;
    try { await micStart(); } catch (e) { micMsg("Couldn't open the mic: " + e.message, "err"); return; }
    Object.keys(mtState).forEach(k => delete mtState[k]);
    $("#mtRes").innerHTML = ""; go.disabled = true; go.textContent = "Testing…";
    mic.test = { step: "", levels: [], sounds: [] };
    for (const [k, , , secs] of MT_STEPS) {
      mic.test.step = k; mtState[k] = { left: secs }; mtRender(k);
      for (let i = secs; i > 0; i--) { mtState[k].left = i; mtRender(k); await new Promise(r => setTimeout(r, 1000)); if (!mic.test) return; }
      await new Promise(r => setTimeout(r, 250));   // let the last sound finish
      mtState[k] = { text: "Done ✓ (results at the end)" };
    }
    const T = mic.test; mic.test = null;
    go.disabled = false; go.textContent = "Run the test again";
    mtAnalyse(T);
    if (!wasOn && !C.trk.mic.on && !mic.practice) setTimeout(() => { if (!C.trk.mic.on && !mic.practice && !mic.test) micStop(); }, 1500);
  }
  function mtAnalyse(T) {
    const lv = k => T.levels.filter(x => x[0] === k).map(x => x[1]);
    const snd = k => T.sounds.filter(x => x.step === k && !x.talk);
    const set = (k, cls, text) => { mtState[k] = { cls, text }; };
    const tips = [];
    // background
    const quiet = median(lv("quiet"));
    if (quiet == null) set("quiet", "bad", "Heard nothing at all: is the mic on and the right one picked?");
    else if (quiet > -45) { set("quiet", "warn", `Background is loud (${Math.round(quiet)} dB). Turn game/music down, or turn on the Duo's noise gate.`); tips.push("lower background noise"); }
    else set("quiet", "ok", `Nice and quiet (${quiet < -90 ? "silent: the Duo's gate is closed" : Math.round(quiet) + " dB"}) ✓`);
    // talking: sets the shout line
    const talkL = lv("talk").filter(v => v > -65), talk = talkL.length > 20 ? pctile(talkL, .9) : null;
    let thr = C.trk.mic.thr == null ? -16 : C.trk.mic.thr;
    if (talk == null) set("talk", "bad", "Didn't hear you talking. Talk closer to the mic, or turn the gain up on the Duo.");
    else {
      thr = Math.max(-40, Math.min(-3, Math.round(talk + 8)));
      if (talk > -6) set("talk", "warn", `Very hot (${Math.round(talk)} dB): close to clipping. Turn the SM7B's gain down a little on the Duo.`);
      else if (talk < -40) set("talk", "warn", `Quiet (${Math.round(talk)} dB). Turn the gain up on the Duo, or get closer to the mic.`);
      else set("talk", "ok", `Talking around ${Math.round(talk)} dB ✓ Shout line set to ${thr} dB.`);
    }
    // the shout: does it get past the line? if not, bring the line down to just under it
    const shoutL = lv("shout"), shoutPk = shoutL.length ? pctile(shoutL, .93) : null;
    if (shoutPk == null || shoutPk < -60) set("shout", "bad", "Didn't hear a shout.");
    else if (shoutPk > thr) set("shout", "ok", `Shout reached ${Math.round(shoutPk)} dB, past the line (${thr} dB) ✓`);
    else if (talk != null && shoutPk > talk + 3) { thr = Math.round(shoutPk - 2); set("shout", "ok", `Your shout (${Math.round(shoutPk)} dB) was under the line, so the line is now ${thr} dB ✓`); }
    else set("shout", "warn", `Your shout (${Math.round(shoutPk)} dB) was barely louder than talking. The Duo's compressor may be squashing it; shouting will be hard to tell apart, so the line stays at ${thr} dB.`);
    C.trk.mic.thr = thr; const r = $("#micThr"); if (r) { r.value = thr; $("#micThrV").textContent = thr + " dB"; } micMark();
    // claps and snaps: learn what yours sound like
    const learnFrom = arr => { const a = arr.filter(x => x.dur <= 120).sort((x, y) => y.max - x.max).slice(0, 4); return a.length ? { bright: median(a.map(x => x.ab)), low: +median(a.map(x => x.al)).toFixed(2), n: a.length, lift: Math.min(...a.map(x => x.lift)) } : null; };
    const claps = snd("clap"), snaps = snd("snap"), cl = learnFrom(claps), sn = learnFrom(snaps);
    const L = Object.assign({}, C.trk.mic.learn || {});
    if (cl) L.clap = { bright: cl.bright, low: cl.low };
    if (sn) L.snap = { bright: sn.bright, low: sn.low };
    const lifts = [cl, sn].filter(Boolean).map(x => x.lift);
    if (lifts.length) L.rise = Math.max(8, Math.min(14, Math.min(...lifts) - 2));
    C.trk.mic.learn = (L.clap || L.snap) ? L : null;
    save();
    const score = (arr, want) => { const a = arr.filter(x => x.dur <= 120).sort((x, y) => y.max - x.max).slice(0, 3); return [a.filter(x => micKind(x, thr, quiet == null ? -60 : Math.max(quiet, -60)) === want).length, a.length]; };
    const showS = (k, arr, want, word) => {
      if (!arr.length) { set(k, "bad", `Didn't hear any ${word}s. Do them closer to the mic, or turn the gain up a little.`); return; }
      const [hit, n] = score(arr, want), of = Math.min(3, n);
      const good = hit === of && of >= 2;
      set(k, good ? "ok" : hit ? "warn" : "bad", `Heard ${of} of 3 ${word}s` + (good ? `, and recognises ${hit === of && of === 3 ? "all of them" : "each one"} ✓` : `, and recognises ${hit} of them as ${word}s. Try the test again a bit closer to the mic${want === "click" ? ", snapping right by it" : ""}.`));
    };
    showS("clap", claps, "clap", "clap"); showS("snap", snaps, "click", "snap");
    if (L.clap && L.snap) {
      const gap = Math.abs(Math.log2((L.clap.bright + 50) / (L.snap.bright + 50))) + Math.abs(L.clap.low - L.snap.low) * 3;
      if (gap < .6) tips.push("your claps and snaps sound very alike to the mic, so they may get mixed up: try snapping closer to the mic");
    }
    mtRender("");
    $("#mtRes").innerHTML = "";
    const res = $("#mtRes");
    res.append(el("b", "", "Saved ✓ "), document.createTextNode(`Shout line ${thr} dB${C.trk.mic.learn ? ", and TOS HUB now knows your claps and snaps" : ""}. Try them with 🎯 Practice, then switch Mic reactions on.` + (tips.length ? " Tip: " + tips.join("; ") + "." : "")));
    window.__mtLast = { thr, learn: C.trk.mic.learn, claps, snaps, quiet, talk, shoutPk };
  }
  // practice: clap, snap or shout and see what's heard, with no effects
  function micPracticeLog(kind) {
    const box = $("#mtLog"); if (!box) return;
    const now = Date.now(); if (mic.plLast === kind && now - (mic.plAt || 0) < 1200) { mic.plAt = now; return; }
    mic.plLast = kind; mic.plAt = now;
    box.querySelectorAll("span.new").forEach(x => x.classList.remove("new"));
    const ls2 = mic.lastSound && kind !== "shout" && kind !== "laugh" ? ` (${mic.lastSound.max} dB)` : "";
    const sp = el("span", "new", (HEARD[kind] || kind) + ls2); box.prepend(sp);
    while (box.children.length > 10) box.lastChild.remove();
  }
  async function micPractice() {
    const b = $("#mtPractice");
    if (mic.practice) { mic.practice = false; b.textContent = "🎯 Practice (no effects)"; b.classList.remove("on"); if (!C.trk.mic.on) micStop(); micMsg(C.trk.mic.on ? "Practice over: effects are back on." : "Practice over.", "ok"); return; }
    try { await micStart(); } catch (e) { micMsg("Couldn't open the mic: " + e.message, "err"); return; }
    mic.practice = true; b.textContent = "⏹ Stop practising"; b.classList.add("on");
    $("#mtLog").innerHTML = "";
    micMsg("Practising: clap, snap, bang or shout. What TOS HUB hears shows below the buttons. No effects play.", "ok");
  }
  function micTestWire() {
    $("#micTestBtn").onclick = () => { const box = $("#micTest"); box.classList.toggle("hide"); if (!box.classList.contains("hide")) { mtRender(""); box.scrollIntoView({ block: "nearest", behavior: "smooth" }); } };
    $("#mtClose").onclick = () => { $("#micTest").classList.add("hide"); if (mic.practice) micPractice(); if (mic.test) { mic.test = null; $("#mtGo").disabled = false; $("#mtGo").textContent = "Start the test"; } };
    $("#mtGo").onclick = micTest;
    $("#mtPractice").onclick = micPractice;
    $("#mtForget").onclick = () => { C.trk.mic.learn = null; save(); micMsg("Forgot your claps and snaps: back to the built-in detection.", "ok"); };
    mtRender("");
  }
  // ---- SM7B + RØDECaster Duo setup guide (a checklist) ----
  const RODE_GUIDE = [
    ["On the RØDECaster Duo", [
      ["in", "Plug the SM7B into combo input 1 with an XLR cable. Phantom power isn't needed (the SM7B is a dynamic mic)."],
      ["dyn", "Set that input to <b>Dynamic</b> in the channel's settings on the Duo's screen."],
      ["gain", "Talk normally and turn the gain up until the meter sits in the green, with loud laughs just touching amber. Around 60 dB is normal for an SM7B. The Duo goes up to 76 dB, so you don't need a Cloudlifter."],
      ["proc", "In that channel's processing: high-pass filter around 80–120 Hz (cuts desk thumps and rumble), a gentle compressor (around 3:1, or the APHEX Compellor), de-esser on (around 5.5 kHz)."],
      ["gate", "Noise gate: off, or gentle. A hard gate cuts off quiet claps and finger snaps, so mic reactions miss them."]
    ]],
    ["On the SM7B", [
      ["sw", "Switches on the back: bass rolloff on flat (the Duo's high-pass already does that job). Presence boost only if your voice sounds dull on stream."],
      ["dist", "Talk from about 2.5–15 cm (1–6 in) away. Closer gives more bass and less room sound. Use the bigger A7WS foam if P and B sounds pop."]
    ]],
    ["So mic reactions hear only you", [
      ["drv", "Install the RØDECaster Virtual Devices driver from RØDE's website, and update the Duo (Settings → System → Info → Check for update)."],
      ["mt", "On the Duo: Settings → Outputs → Multitrack → USB 1 Output → <b>Post-fader</b> (muting your mic on the Duo then stops reactions too). Set USB 1 Input to <b>Expanded</b>."],
      ["pick", "In TOS HUB click ↻ Refresh, then pick the input for your SM7B's fader under Microphone (TOS HUB picks it by itself if you haven't chosen one). Set “My mic” to SM7B, then click “Set from my voice”."]
    ]],
    ["Private chat alert sound", [
      ["dv", "In Chat &amp; alerts, play the alert through one of the Duo's spare virtual outputs (for example “B”) that has its own fader."],
      ["route", "On the Duo: Settings → Outputs → Routing → choose the USB 1 output (what OBS and the stream get) → Custom → take that fader out. Leave it on your headphones."],
      ["hear", "Check it in Stream view → Audio with “Can the stream hear my alert?”."]
    ]],
    ["In OBS", [
      ["obs1", "Add the Duo once as your audio source (its main or system mix already has your mic, game and music). Adding the mic fader again as well doubles your voice."],
      ["obs2", "Connect TOS HUB to OBS. Stream view then shows your audio meters and warns you if the mic is muted or too loud."]
    ]]
  ];
  function renderRodeGuide() {
    const box = $("#rgSteps"); if (!box) return;
    const done = ls.get("streamhub.rodeGuide", {}) || {};
    box.innerHTML = "";
    RODE_GUIDE.forEach(([head, steps]) => {
      const h = document.createElement("h4"); h.textContent = head; box.append(h);
      steps.forEach(([k, html]) => {
        const l = document.createElement("label"); l.className = "rg" + (done[k] ? " done" : "");
        const c = document.createElement("input"); c.type = "checkbox"; c.checked = !!done[k];
        c.onchange = () => { done[k] = c.checked; ls.set("streamhub.rodeGuide", done); l.classList.toggle("done", c.checked); };
        const sp = document.createElement("span"); sp.innerHTML = html;
        l.append(c, sp); box.append(l);
      });
    });
  }
  const micMsg = (t, cls) => { const m = $("#micMsg"); if (m) { m.textContent = t; m.className = "note " + (cls || ""); } };

