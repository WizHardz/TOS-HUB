  // ================= advanced tracking (TOS HUB camera) =================
  // Google's MediaPipe tracking, built into the app (nothing downloads): 478 points on your face with
  // expressions, 21 points on each hand, and a cut-out of you from your room. It runs on every camera
  // frame and the results are sent to the TOS HUB Camera source in OBS.
  const EXPR = [
    ["mouth", "😮 Mouth wide open", b => b.jawOpen, .5, 300],
    ["blink", "😑 Long blink", b => Math.min(b.eyeBlinkLeft, b.eyeBlinkRight), .55, 650],
    ["brows", "🤨 Eyebrows up", b => b.browInnerUp, .55, 300],
    ["smile", "😁 Big smile", b => (b.mouthSmileLeft + b.mouthSmileRight) / 2, .65, 450],
    ["kiss", "😗 Kiss face", b => b.mouthPucker, .7, 400],
    ["puff", "🐡 Cheek puff", b => b.cheekPuff, .45, 400],
    ["wink", "😉 Wink", b => Math.max(b.eyeBlinkLeft - b.eyeBlinkRight, b.eyeBlinkRight - b.eyeBlinkLeft), .5, 250]
  ];
  const GEST = [["palm", "✋ Open palm", 350], ["gun", "👉 Finger gun", 220], ["fist", "✊ Fist", 400], ["pinch", "🤏 Pinch", 0], ["peace", "✌️ Peace sign", 400],
    ["thumbsup", "👍 Thumbs up", 400], ["thumbsdown", "👎 Thumbs down", 400], ["palmup", "🫴 Hand facing up", 450], ["lips", "🤫 Fingers to lips (needs face tracking too)", 250]];
  const TRK_DEF = { smooth: 50, soft: 4, cut: 0, framing: "hs", lean: true, faces: 1, both: true,
    spells: false, spellSens: 50, spellMap: { circle: "portal", zigzag: "zap", star: "spark", heart: "hearts", triangle: "magic", swipe: "shield" },
    wand: false, fireball: false, mood: false, moodCd: 12, moodMap: { surprised: "bigeyes", happy: "hearts", angry: "fire", sad: "rain" },
    mic: { on: false, dev: "", ch: "all", profile: "", picked: false, thr: -16, shout: "punch", bang: "boom", laugh: "confetti", clap: "spark", click: "zap" },
    clip: { on: false, loud: true, spell: true, raid: true, delay: 4 },
    light: 0, grade: "none", prop: "none", avatar: "off", avCol: "purple", avSkin: "#f2c9a0", avFollow: true,
    engine: "auto", mesh: true, expr: false, hands: false, bg: "none", blur: 14, behind: true, paint: "none", sens: 50, cd: 5,
    exprMap: { mouth: "firebreath", blink: "lasers", brows: "spark", smile: "hearts", kiss: "", puff: "bubbles", wink: "" },
    gestMap: { palm: "shield", gun: "zap", fist: "boom", pinch: "trail", peace: "hearts", thumbsup: "spark", thumbsdown: "rain", palmup: "handconfetti" }, palmBoth: false, palmFlip: false,
    bodyCol: "theme", bodyC1: "#2ff3ff", bodyC2: "#b14dff", bodyStr: 100, bodySize: 100, bodyPulse: 50, bgImage: "", obj: "", objBg: "clear", objSize: 100, objFeat: 160, objFollow: true, objBlend: 30, objTimed: "random", objAdj: {}, useFace: true, useHands: true, useBody: true, useSeg: true, draw: false, drawCol: "rainbow", drawStyle: "neon", drawSize: 8, drawFade: 0, drawPalm: true,
    body: false, bodyAv: true, bodyFx: "none", poseFx: false, poseMap: { up: "confetti", tpose: "shield", flex: "fire", dab: "zap", cross: "boom", wave: "hearts", salute: "spark" },
    quality: "fast", predict: true, autoPerf: true,
    combosOn: true, combos: [{ a: "mic:clap", b: "pose:up", fx: "powerup" }, { a: "pose:salute", b: "mic:clap", fx: "gold" }, { a: "mic:click", b: "pose:tpose", fx: "ice" }] };
  C.trk = Object.assign({}, TRK_DEF, C.trk || {});
  C.trk.exprMap = Object.assign({}, TRK_DEF.exprMap, C.trk.exprMap || {});
  C.trk.gestMap = Object.assign({}, TRK_DEF.gestMap, C.trk.gestMap || {});
  if (C.trk.pinchTrail == null) C.trk.pinchTrail = !!(C.trk.hands && C.trk.gestMap.pinch === "trail");   // the pinch trail is its own switch now
  ["spellMap", "moodMap", "mic", "clip", "poseMap"].forEach(k => { C.trk[k] = Object.assign({}, TRK_DEF[k], C.trk[k] || {}); });
  const trkMsg = (t, cls) => { const m = $("#trkMsg"); m.textContent = t; m.className = "note " + (cls || ""); };

  let poseLM = null, poseQ = "";
  let V = null, faceLM = null, handLM = null, seg = null, trkLoading = null, trkFatal = "", trkEngine = "";
  let trkRunning = false, lastTs = 0, frameNo = 0, fpsN = 0, fpsT = performance.now(), trkFps = 0, segFps = 0, segN = 0;
  let lastFace = null, lastHands = [], blend = {}, lastFaces = [], handsRunning = false;
  const asset = async n => new Uint8Array(await window.tosHub.readAsset(n));
  const blobUrl = async (n, type) => URL.createObjectURL(new Blob([await asset(n)], type ? { type } : {}));
  function loadScript2(src) { return new Promise((res, rej) => { const sc = document.createElement("script"); sc.src = src; sc.onload = res; sc.onerror = () => rej(new Error("missing " + src)); document.head.appendChild(sc); }); }
  async function trkLoad() {
    if (V) return V;
    if (trkFatal) throw new Error(trkFatal);
    if (!trkLoading) trkLoading = (async () => {
      if (!window.tosHub || !window.tosHub.readAsset) throw new Error("Advanced tracking is part of the TOS HUB desktop app.");
      if (!window.Vision) await loadScript2("vision/vision_bundle.js");
      const fileset = { wasmLoaderPath: new URL("vision/vision_wasm_internal.js", location.href).href, wasmBinaryPath: await blobUrl("vision/vision_wasm_internal.wasm", "application/wasm") };
      V = { fileset };
      return V;
    })().catch(e => { trkLoading = null; trkFatal = e.message; throw e; });
    return trkLoading;
  }
  // graphics card first, then the processor if the graphics card can't do it
  async function makeTask(Kind, opts) {
    let lastErr = null;
    for (const delegate of C.trk.engine === "cpu" ? ["CPU"] : ["GPU", "CPU"]) {
      try {
        const t = await Kind.createFromOptions(V.fileset, Object.assign({}, opts, { baseOptions: Object.assign({}, opts.baseOptions, { delegate }) }));
        trkEngine = trkEngine === "CPU" || delegate === "CPU" ? "CPU" : "GPU";
        return t;
      } catch (e) { lastErr = e; }
    }
    throw lastErr;
  }
  let faceN = 1;
  let faceImg = null;   // the memory-free face finder (fills frames the tracker misses)
  const faceImgLM = () => faceImg;
  async function ensureFace() {
    const want = C.trk.faces === 2 ? 2 : 1;
    if (faceLM && faceN !== want) { try { faceLM.close(); } catch (e) {} faceLM = null; try { if (faceImg) faceImg.close(); } catch (e) {} faceImg = null; }
    if (faceLM) return faceLM;
    faceN = want;
    await trkLoad();
    faceLM = await makeTask(window.Vision.FaceLandmarker, { baseOptions: { modelAssetBuffer: await asset("vision/face_landmarker.task") }, runningMode: "VIDEO", numFaces: faceN, outputFaceBlendshapes: true, minFaceDetectionConfidence: .4, minFacePresenceConfidence: .35, minTrackingConfidence: .35 });
    if (!faceImg) { try { faceImg = await makeTask(window.Vision.FaceLandmarker, { baseOptions: { modelAssetBuffer: await asset("vision/face_landmarker.task") }, runningMode: "IMAGE", numFaces: faceN, outputFaceBlendshapes: true, minFaceDetectionConfidence: .35, minFacePresenceConfidence: .3 }); } catch (e) { faceImg = null; } };
    return faceLM;
  }
  async function ensureHands() {
    if (handLM) return handLM;
    await trkLoad();
    handLM = await makeTask(window.Vision.HandLandmarker, { baseOptions: { modelAssetBuffer: await asset("vision/hand_landmarker.task") }, runningMode: "VIDEO", numHands: 2, minHandDetectionConfidence: .55 });
    return handLM;
  }

  // body: 33 points (Google's pose tracker). "Accurate" uses the bigger model.
  async function ensurePose() {
    const want = C.trk.quality === "accurate" ? "full" : "lite";
    if (poseLM && poseQ !== want) { try { poseLM.close(); } catch (e) {} poseLM = null; }
    if (poseLM) return poseLM;
    await trkLoad();
    poseLM = await makeTask(window.Vision.PoseLandmarker, { baseOptions: { modelAssetBuffer: await asset(`vision/pose_landmarker_${want}.task`) }, runningMode: "VIDEO", numPoses: 1, minPoseDetectionConfidence: .5, minPosePresenceConfidence: .5, minTrackingConfidence: .5 });
    poseQ = want;
    return poseLM;
  }

  // ---- background cut-out: the picture and its mask travel together in one video frame ----
  const packCv = document.createElement("canvas"), packX = packCv.getContext("2d");
  const maskCv = document.createElement("canvas"), maskX = maskCv.getContext("2d");
  const maskNew = document.createElement("canvas"), maskNX = maskNew.getContext("2d"), maskOld = document.createElement("canvas"), maskOX = maskOld.getContext("2d");
  let packStream = null, packTrack = null, segBusy = false, packLive = false;
  const segWanted = () => C.tos.on && !!tosStream && C.trk.useSeg !== false && !!C.trk.bg && C.trk.bg !== "none" && C.trk.avatar === "off";
  async function ensureSeg() {
    if (seg) return seg;
    await trkLoad();
    if (!window.SelfieSegmentation) await loadScript2("seg/selfie_segmentation.js");
    const urls = {};
    for (const f of ["selfie_segmentation_solution_simd_wasm_bin.wasm", "selfie_segmentation_solution_wasm_bin.wasm", "selfie_segmentation.binarypb", "selfie_segmentation_landscape.tflite", "selfie_segmentation.tflite"])
      urls[f] = await blobUrl("seg/" + f, f.endsWith(".wasm") ? "application/wasm" : "");
    const s = new window.SelfieSegmentation({ locateFile: f => urls[f] || new URL("seg/" + f, location.href).href });
    s.setOptions({ modelSelection: 1, selfieMode: false });
    s.onResults(onSeg);
    await s.initialize();
    seg = s;
    return s;
  }
  function onSeg(r) {
    const img = r.image, VW = img.width || tosVid.videoWidth, VH = img.height || tosVid.videoHeight;
    if (!VW || !VH) return;
    const PH = Math.round(VH * 1.25);
    if (packCv.width !== VW || packCv.height !== PH) { packCv.width = VW; packCv.height = PH; }
    const mw = Math.round(VW / 4), mh = Math.round(VH / 4);
    if (maskCv.width !== mw || maskCv.height !== mh) { maskCv.width = mw; maskCv.height = mh; }
    packX.drawImage(img, 0, 0, VW, VH);
    packX.fillStyle = "#000"; packX.fillRect(0, VH, VW, PH - VH);
    // this frame's mask, with soft edges
    if (maskNew.width !== mw || maskNew.height !== mh) { maskNew.width = mw; maskNew.height = mh; maskOld.width = mw; maskOld.height = mh; }
    maskNX.globalCompositeOperation = "source-over"; maskNX.clearRect(0, 0, mw, mh);
    maskNX.filter = `blur(${Math.max(0, +C.trk.soft || 0) * mw / 640}px)`; maskNX.drawImage(r.segmentationMask, 0, 0, mw, mh); maskNX.filter = "none";
    maskNX.globalCompositeOperation = "source-in"; maskNX.fillStyle = "#fff"; maskNX.fillRect(0, 0, mw, mh);
    // blended with the last frame's, so the edges don't flicker
    const keep = .15 + (C.trk.smooth == null ? 50 : C.trk.smooth) / 100 * .45;
    maskX.globalCompositeOperation = "source-over"; maskX.clearRect(0, 0, mw, mh);
    maskX.globalAlpha = keep; maskX.drawImage(maskOld, 0, 0);
    maskX.globalCompositeOperation = "lighter"; maskX.globalAlpha = 1 - keep; maskX.drawImage(maskNew, 0, 0);
    maskX.globalAlpha = 1; maskX.globalCompositeOperation = "source-over";
    maskOX.clearRect(0, 0, mw, mh); maskOX.drawImage(maskCv, 0, 0);
    packX.drawImage(maskCv, 0, VH);
    if (packTrack && packTrack.requestFrame) packTrack.requestFrame();
    segN++;
    if (!packLive) usePacked(true);
  }
  // swap what TOS HUB sends: the plain camera, or picture + mask
  function usePacked(on) {
    if (on && !packStream) { packStream = packCv.captureStream(0); packTrack = packStream.getVideoTracks()[0]; packTrack.contentHint = "motion"; }
    const track = on ? packTrack : tosStream && tosStream.getVideoTracks()[0];
    if (!track) return;
    packLive = on;
    peers.forEach(p => p.pc.getSenders().forEach(s => { if (s.track && s.track.kind === "video" && s.track !== track) s.replaceTrack(track).catch(() => {}); }));
    window.__tosCamStream = on ? packStream : tosStream;
    toCam({ type: "pack", on, ratio: tosVid.videoHeight / Math.max(1, tosVid.videoWidth) });
    pushLook();
  }
  function sendTrackFor(pc) { return packLive ? packTrack : tosStream && tosStream.getVideoTracks()[0]; }

  // ---- hands: which gesture is this? ----
  function gesture(p, side) {
    const d = (a, b) => Math.hypot(p[a].x - p[b].x, p[a].y - p[b].y);
    const size = d(0, 9) || 1e-6;
    const ext = (tip, pip) => d(tip, 0) > d(pip, 0) * 1.15;
    const idx = ext(8, 6), mid = ext(12, 10), ring = ext(16, 14), pky = ext(20, 18);
    const thumb = d(4, 5) > size * .55 && d(4, 17) > d(3, 17) * 1.05;
    if (d(4, 8) < size * .28 && !ring) return "pinch";
    // thumbs up / down: four fingers curled, thumb sticking straight up (or down)
    if (!idx && !mid && !ring && !pky) {
      const tx = p[4].x - p[2].x, ty = p[4].y - p[2].y;
      if (d(4, 5) > size * .6 && Math.abs(ty) > Math.abs(tx) * 1.3) { if (ty < 0 && p[4].y < p[5].y - size * .3) return "thumbsup"; if (ty > 0 && p[4].y > p[17].y + size * .3) return "thumbsdown"; }
    }
    // hand facing up (like you're holding something out on your palm): needs the hand's depth too
    if (p[0].z != null && (idx + mid + ring + pky) >= 3) {
      const A = 16 / 9, v3 = (a, b) => [(p[b].x - p[a].x) * A, p[b].y - p[a].y, ((p[b].z || 0) - (p[a].z || 0)) * A];
      const u = v3(17, 5), v = v3(0, 9), n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]], nl = Math.hypot(n[0], n[1], n[2]) || 1;
      // which way your palm faces (checked against a real picture: a hand MediaPipe calls "Right" has its palm along u × v here)
      const right = /right/i.test(side || "") !== !!C.trk.palmFlip, palm = right ? n : n.map(x => -x);
      const vl = Math.hypot(v[0], v[1], v[2]) || 1;
      if (v[1] / vl > .6) return "";   // fingers hanging down: a resting hand, not one held out
      (window.__palmN = window.__palmN || {})[side] = { up: +(-palm[1] / nl).toFixed(2), facing: +(-palm[2] / nl).toFixed(2), wrist: [+p[0].x.toFixed(2), +p[0].y.toFixed(2)] };   // for TOS HUB's own tests
      if (-palm[1] / nl > .62 && -palm[2] / nl > -.55) return "palmup";
    }
    if (idx && mid && ring && pky && thumb) return "palm";
    if (idx && mid && !ring && !pky) return "peace";
    if (idx && !mid && !ring && !pky) return thumb ? "gun" : "point";
    if (!idx && !mid && !ring && !pky && d(4, 9) < size * .9) return "fist";
    return "";
  }
  window.__gesture = gesture;   // for TOS HUB's own tests
  // ---- hand controls: which sign is the pen, clears the drawing, traces spells, holds/throws the fireball… (you choose) ----
  const HAND_CTL_DEF = { draw: "point", clear: "palm", spell: "point", hold: "palm", throw: "fist", trail: "pinch", wand: "point" };
  const hc = k => (C.trk.handCtl && C.trk.handCtl[k]) || HAND_CTL_DEF[k];
  const isRole = (g, k) => { const w = hc(k); return !!g && (w === "point" ? g === "point" || g === "gun" : g === w); };
  const roleStr = g => [["draw", "d"], ["clear", "c"], ["trail", "t"], ["wand", "w"], ["hold", "f"]].filter(([k]) => isRole(g, k)).map(x => x[1]).join("");
  window.__handRoles = { isRole, roleStr, hc };   // for TOS HUB's own tests
  // every trigger now goes through the Triggers list (Magic tab): does a rule use it, and set it off
  const ruleWants = id => !!(window.hubRules && window.hubRules.has(id));
  const ruleFire = (id, extra) => window.hubRules ? window.hubRules.fire(id, extra) : false;
  const gestState = {};   // per hand side + gesture: since, fired
  let gestLast = {};
  function gestures(hands) {
    const now = Date.now(), seen = new Set();
    hands.forEach(h => {
      const g = h.g; if (!g) return;
      if (C.trk.draw && isRole(g, "draw")) return;   // that's the pen while drawing
      const key = h.side + ":" + g; seen.add(key);
      const st = gestState[key] || (gestState[key] = { since: now, fired: false });
      const tip = h.pts[8];
      if (st.tip && Math.hypot(tip.x - st.tip.x, tip.y - st.tip.y) > .015) st.since = now;   // moving = drawing, not aiming
      st.tip = { x: tip.x, y: tip.y };
      if (C.trk.fireball && isRole(g, "hold")) return;   // that hand is holding the fireball
      const def = gDef(g), want = ruleWants("gest:" + g);
      if (!def) return;
      if (st.fired || (!want && !comboUses("gest:" + g))) return;
      if (now - st.since < def[2] || now - (gestLast[g] || 0) < 1200) return;
      st.fired = true; gestLast[g] = now; noteTrigger("gest:" + g);
      if (!want) return;
      const p = h.pts, at = g === "gun" || g === "lips" ? p[8] : g === "pinch" ? { x: (p[4].x + p[8].x) / 2, y: (p[4].y + p[8].y) / 2 } : p[9];
      const extra = { at: { x: at.x, y: at.y } };
      if (g === "palmup") {   // confetti from the hand(s) facing up, or from both hands
        extra.hands = hands.filter(o => o.g === "palmup").map(o => ({ x: (o.pts[0].x + o.pts[9].x * 2) / 3, y: (o.pts[0].y + o.pts[9].y * 2) / 3 }));
        if (C.trk.palmBoth) extra.both = true;
      }
      if (g === "gun") extra.to = { x: p[8].x + (p[8].x - p[5].x) * 3, y: p[8].y + (p[8].y - p[5].y) * 3 };
      ruleFire("gest:" + g, extra);
    });
    Object.keys(gestState).forEach(k => { if (!seen.has(k)) delete gestState[k]; });
  }
  // ---- expressions ----
  const exprState = {};
  function expressions(b) {
    const now = Date.now(), sens = (C.trk.sens || 50) / 100;
    EXPR.forEach(([k, , fn, thr, hold]) => {
      const want = ruleWants("expr:" + k);
      if (!want && !comboUses("expr:" + k)) return;
      const v = fn(b) || 0, th = thr * (1.35 - sens * .7);
      const st = exprState[k] || (exprState[k] = { since: 0, fired: false, last: 0 });
      if (v >= th) {
        if (!st.since) st.since = now;
        if (!st.fired && now - st.since >= hold && now - st.last > 1500) { st.fired = true; st.last = now; noteTrigger("expr:" + k); if (want) ruleFire("expr:" + k); }
      } else if (v < th * .75) { st.since = 0; st.fired = false; }
    });
  }

  // ---- the loop: runs on every new camera frame ----
  const q = v => Math.max(0, Math.min(10000, Math.round(v * 1e4)));
  const trkWanted = () => C.tos.on && !!tosStream && (C.trk.mesh || C.trk.expr || C.trk.hands || C.trk.handsAlways || C.trk.draw || C.trk.paint !== "none" || !!C.trk.obj || C.face.follow || Date.now() < streamUntil || segWanted()
    || C.trk.spells || C.trk.wand || C.trk.fireball || C.trk.mood || C.trk.mic.on || C.trk.prop !== "none" || C.trk.avatar !== "off" || C.trk.light > 0 || C.trk.body || Date.now() < interactUntil);
  async function trkStart() {
    if (!C.tos.on) throw new Error("Advanced tracking works with the TOS HUB camera. Switch to it at the top of the Camera section.");
    await trkLoad();
    if (!tosStream) await startTosCam();
    await ensureFace();
    trkKick();
  }
  let trkGen = 0;
  function trkKick() {
    if (trkRunning || !trkWanted() || trkFatal) return;
    trkRunning = true;
    const gen = ++trkGen;
    let lastMedia = -1, busy = false;
    // runs once per new camera frame (with a timer as a backup, in case frames aren't announced)
    const step = async (now, meta) => {
      if (gen !== trkGen || busy) return;
      if (!trkWanted()) { trkRunning = false; trkGen++; if (packLive) usePacked(false); trkStatus(); return; }
      const mt = meta && meta.mediaTime != null ? meta.mediaTime : tosVid.currentTime;
      if (mt !== lastMedia) {
        lastMedia = mt; busy = true;
        try { await trkFrame(meta); } catch (e) { trkMsg("Tracking hiccup: " + e.message, "err"); }
        busy = false;
      }
      if (tosVid.requestVideoFrameCallback) tosVid.requestVideoFrameCallback(step);
    };
    if (tosVid.requestVideoFrameCallback) tosVid.requestVideoFrameCallback(step);
    const backup = setInterval(() => { if (gen !== trkGen) return clearInterval(backup); step(performance.now(), null); }, 1000 / Math.max(15, +C.tos.fps || 30));
  }
  // ---- finding small, far-away faces (wide lenses like a GoPro's) ----
  // The face finder works best when a face fills a good part of the picture. So it looks at a close-up around you, which follows
  // you as you move. When it loses you, it sweeps zoomed-in parts of the room until it finds you again.
  const zoomCv = document.createElement("canvas"), zoomX = zoomCv.getContext("2d");
  const zr = { x: 0, y: 0, w: 1, h: 1, miss: 0, scan: 0, hold: 0 };
  const SCAN = [{ x: 0, y: 0, w: 1, h: 1 }, { x: .25, y: .1, w: .5, h: .5 }, { x: 0, y: .1, w: .5, h: .5 }, { x: .5, y: .1, w: .5, h: .5 },
    { x: 0, y: 0, w: 1, h: 1 }, { x: .25, y: .4, w: .5, h: .5 }, { x: 0, y: .4, w: .5, h: .5 }, { x: .5, y: .4, w: .5, h: .5 }];
  let zoomOn = false;
  window.__zoomFind = zr;   // for TOS HUB's own tests
  function zoomDraw(z) {
    const VW = tosVid.videoWidth, VH = tosVid.videoHeight;
    const sx = Math.round(z.x * VW), sy = Math.round(z.y * VH), sw = Math.max(16, Math.round(z.w * VW)), sh = Math.max(16, Math.round(z.h * VH));
    const dw = capW(sw, C.trk.quality === "accurate" ? 1280 : 960), dh = Math.round(dw * sh / sw);
    if (zoomCv.width !== dw || zoomCv.height !== dh) { zoomCv.width = dw; zoomCv.height = dh; }
    zoomX.drawImage(tosVid, sx, sy, sw, sh, 0, 0, dw, dh);
  }
  const toWhole = (r, z) => { if (z.w < .999) (r.faceLandmarks || []).forEach(pts => pts.forEach(p => { p.x = z.x + p.x * z.w; p.y = z.y + p.y * z.h; p.z *= z.w; })); return r; };
  // The main face tracker remembers where your face was last frame. A second finder with no memory steps in on frames the
  // tracker misses (fast moves, motion blur, the close-up moving), so a miss is filled the same frame instead of a gap.
  function rescueFind(z) {
    const fi = typeof faceImgLM === "function" ? faceImgLM() : null; if (!fi) return null;
    zoomDraw(z);
    let r = null; try { r = fi.detect(zoomCv); } catch (e) { return null; }
    return (r.faceLandmarks || []).length ? toWhole(r, z) : null;
  }
  function detectFacesZoomed(fl, ts) {
    if (window.__tosTest && window.__tosTest.noFace) return { faceLandmarks: [], faceBlendshapes: [] };   // tests: pretend the face turned away
    zoomDraw(zr);
    let r = toWhole(fl.detectForVideo(zoomCv, ts), zr), L = r.faceLandmarks || [];
    const full = zr.w >= .999;
    if (!L.length && !(bodyFresh() && headFromBody())) {
      // where you're probably heading (a wider close-up, moved along with you)
      const ahead = () => { const dt = Math.max(.03, Math.min(.3, (performance.now() - (zr.lt || 0)) / 1000)), w = Math.min(1, zr.w * 1.25), cx = zr.x + zr.w / 2 + (zr.vx || 0) * dt, cy = zr.y + zr.h * .45 + (zr.vy || 0) * dt; return { x: Math.min(1 - w, Math.max(0, cx - w / 2)), y: Math.min(1 - w, Math.max(0, cy - w * .45)), w, h: w }; };
      const pz = !full && zr.lt ? ahead() : null;
      const r2 = rescueFind(zr) || (pz ? rescueFind(pz) : null) || (!full ? rescueFind({ x: 0, y: 0, w: 1, h: 1 }) : null);
      if (r2) { r = r2; L = r2.faceLandmarks; zr.rescued = (zr.rescued || 0) + 1; }
    }
    if (L.length) {
      zr.miss = 0;
      let best = null;
      L.forEach(pts => { let x0 = 1, x1 = 0, y0 = 1, y1 = 0; pts.forEach(p => { if (p.x < x0) x0 = p.x; if (p.x > x1) x1 = p.x; if (p.y < y0) y0 = p.y; if (p.y > y1) y1 = p.y; }); if (!best || y1 - y0 > best.h) best = { cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, h: y1 - y0 }; });
      // how fast you're moving (picture-widths per second), so a new close-up can lead you and be a bit wider
      const now = performance.now(), dtv = Math.max(.016, Math.min(.5, (now - (zr.lt || now)) / 1000));
      if (zr.lc && zr.lt) { const vx = (best.cx - zr.lc[0]) / dtv, vy = (best.cy - zr.lc[1]) / dtv; zr.vx = (zr.vx || 0) * .5 + vx * .5; zr.vy = (zr.vy || 0) * .5 + vy * .5; }
      zr.lc = [best.cx, best.cy]; zr.lt = now;
      const speed = Math.hypot(zr.vx || 0, zr.vy || 0);
      let h = Math.min(1, Math.max(.4, best.h * 3.2));   // (not wider when you move: a wider view makes a small face too small to find)
      if (h > .9 || +C.trk.faces === 2) h = 1;   // two people: keep the whole picture so nobody gets cropped out
      // follow your face exactly, aiming where it will be next frame: your face then stays in the same spot of the close-up,
      // so the tracker's memory of where it was stays right even when you move fast. The zoom only changes when it has to.
      const lead = Math.min(.1, dtv);
      let w = zr.w;
      if (full || zr.hold || Math.abs(h - zr.w) / zr.w > .25) w = h;
      const pcx = best.cx + (zr.vx || 0) * lead, pcy = best.cy + (zr.vy || 0) * lead;
      zr.x = Math.min(1 - w, Math.max(0, pcx - w / 2)); zr.y = Math.min(1 - w, Math.max(0, pcy - w * .45)); zr.w = zr.h = w; zr.base = w;
      zr.hold = 0; zoomOn = zr.w < .999;
    } else if (bodyFresh() && headFromBody()) {
      // turned away: keep the close-up on your head (from the body tracker), so your face is picked up the moment you turn back
      const hd = headFromBody(), w = zr.w >= .999 ? 1 : zr.w;
      if (w < .999) { zr.x += (Math.min(1 - w, Math.max(0, hd.x - w / 2)) - zr.x) * .3; zr.y += (Math.min(1 - w, Math.max(0, hd.y - w * .45)) - zr.y) * .3; }
      zr.miss = 0;
    } else if (!full && zr.lt && zr.miss < 7) {
      // lost for a moment (fast move, blur): carry the close-up on along your path (slowing, as you'll be stopping or turning),
      // only a little wider (too wide and a small face gets too small to find), and look again
      zr.miss++; zr.vx = (zr.vx || 0) * .7; zr.vy = (zr.vy || 0) * .7;
      const dt = Math.max(.03, Math.min(.3, (performance.now() - zr.lt) / 1000)), w = Math.min(1, zr.w * 1.08, (zr.base || zr.w) * 1.5), cx = zr.x + zr.w / 2 + (zr.vx || 0) * dt, cy = zr.y + zr.h * .45 + (zr.vy || 0) * dt;
      zr.x = Math.min(1 - w, Math.max(0, cx - w / 2)); zr.y = Math.min(1 - w, Math.max(0, cy - w * .45)); zr.w = zr.h = w; zr.lt = performance.now(); zoomOn = w < .999;
    } else if (++zr.miss > (full ? 2 : 3)) {
      // lost: sweep the picture (the whole thing, then zoomed-in parts) until a face turns up
      const a = SCAN[zr.scan++ % SCAN.length]; Object.assign(zr, a, { miss: 0, hold: 1 }); zoomOn = a.w < .999; zr.lt = 0; zr.vx = zr.vy = 0;
    }
    return r;
  }

  // ---- faster startup: load the tracking models in the background as soon as the camera's on ----
  let preloaded = false;
  function preloadTracking() {
    if (preloaded || !window.tosHub || !window.tosHub.readAsset || trkFatal) return;
    preloaded = true;
    const idle = window.requestIdleCallback || (f => setTimeout(f, 200));
    idle(async () => {
      try {
        await trkLoad(); await ensureFace();
        const T = C.trk;
        if (T.useHands !== false && (T.hands || T.handsAlways || T.spells || T.wand || T.fireball || T.draw)) await ensureHands();
        if (T.body) await ensurePose();
      } catch (e) { preloaded = false; }
    });
  }
  // ---- auto performance: decide how much work to do this frame ----
  function perfUpdate() {
    if (C.trk.autoPerf === false) { if (perf.level) { perf.level = 0; peers.forEach(p => sharpen(p.pc)); } return; }
    const budget = 1000 / (+C.tos.fps || 30), old = perf.level;
    const busy = perf.ms > budget * 1.1 || perf.lag > 45, free = perf.ms < budget * .55 && perf.lag < 15;
    if (busy) { perf.level = Math.min(2, perf.level + 1); perf.calm = 0; }
    else if (free && ++perf.calm >= 3) { perf.level = Math.max(0, perf.level - 1); perf.calm = 0; }
    if (perf.level !== old) peers.forEach(p => sharpen(p.pc));
  }
  const every = n => n <= 1 || frameNo % n === 0;
  // smaller copies of the picture for the trackers: they shrink what they're given anyway, so this is free speed
  const capW = (want, max) => Math.min(want, max);
  const poseCv = document.createElement("canvas"), poseX = poseCv.getContext("2d");
  function poseInput() {
    const VW = tosVid.videoWidth, VH = tosVid.videoHeight, w = capW(VW, C.trk.quality === "accurate" ? 960 : 640), h = Math.round(w * VH / VW);
    if (poseCv.width !== w || poseCv.height !== h) { poseCv.width = w; poseCv.height = h; }
    poseX.drawImage(tosVid, 0, 0, w, h);
    return poseCv;
  }

  // ---- tracking health: how fast each part runs and how often it finds you ----
  const health = { face: { ms: 0, n: 0, hit: 0, rate: 0, found: 0 }, hands: { ms: 0, n: 0, hit: 0, rate: 0, found: 0 }, body: { ms: 0, n: 0, hit: 0, rate: 0, found: 0 }, seg: { ms: 0, n: 0, hit: 0, rate: 0, found: 0 } };
  const timeIt = (k, ms, found) => { const h = health[k]; h.ms = h.ms ? h.ms * .85 + ms * .15 : ms; h.n++; if (found) h.hit++; };
  function healthTick(secs) {
    Object.values(health).forEach(h => { h.rate = h.n / secs; h.found = h.n ? h.hit / h.n : h.found; h.n = 0; h.hit = 0; });
    const box = $("#healthBox"); if (!box || !box.offsetParent || (box.tagName === "DETAILS" && !box.open)) return;
    const T = C.trk, on = { face: T.useFace !== false && (T.mesh || T.expr || T.mood || T.paint !== "none" || !!T.obj || T.prop !== "none" || C.face.follow || T.avatar !== "off"),
      hands: T.useHands !== false && (T.hands || T.handsAlways || T.spells || T.wand || T.fireball || T.draw), body: T.useBody !== false && !!T.body, seg: segWanted() };
    const NAMES = { face: "Face", hands: "Hands", body: "Body", seg: "Background cut-out" };
    const rows = Object.keys(NAMES).map(k => {
      const h = health[k];
      if (!on[k]) return `<tr><td>${NAMES[k]}</td><td colspan="3" style="color:var(--muted)">off</td></tr>`;
      const sp = h.rate >= 15 ? "ok" : h.rate >= 8 ? "warn" : "bad", fd = h.found >= .8 ? "ok" : h.found >= .4 ? "warn" : "bad";
      return `<tr><td>${NAMES[k]}</td><td class="${sp}">${h.rate.toFixed(0)} / sec</td><td>${h.ms.toFixed(0)} ms</td><td class="${k === "seg" ? "" : fd}">${k === "seg" ? "–" : Math.round(h.found * 100) + "%"}</td></tr>`;
    }).join("");
    const tips = [];
    if (trkFps && trkFps < 12) tips.push("Tracking is running slowly. " + (C.trk.quality === "accurate" ? "Switch to “Fast” models, or turn" : "Turn") + " off parts you don't need, or use 720p for the camera.");
    if (trkEngine === "CPU" && C.trk.engine !== "cpu") tips.push("Your graphics card couldn't run the tracking, so it's on the processor (slower). Updating your graphics driver can help.");
    if (on.face && health.face.found < .5) tips.push("Your face is often lost: more light on your face from the front, or move a little closer." + (C.tos.dev === "gopro" ? " On the GoPro, the Linear lens helps." : ""));
    if (on.face && zoomOn) tips.push("The camera is wide, so TOS HUB is zooming in to find your face ✓.");
    if (on.hands && health.hands.found < .3) tips.push("Hands are rarely seen: keep them in the picture and in good light." + (handZoomOn ? "" : " Turning on full-body tracking helps TOS HUB find them."));
    if (on.body && health.body.found < .5) tips.push("Your body is often lost: sit or stand back so you're visible from at least the waist up.");
    if (on.seg && health.seg.rate && health.seg.rate < 10) tips.push("The background cut-out is slow. “Keep my room” or blur is lighter than full removal.");
    if (!tips.length) tips.push("All good ✓");
    $("#trkHealth").innerHTML = `<table><tr><th>Part</th><th>Speed</th><th>Time</th><th>Found you</th></tr>${rows}</table>
      <p class="note" style="margin:6px 0 0">Overall ${Math.round(trkFps)} frames a second on your ${trkEngine === "GPU" ? "graphics card" : "processor"} · ${C.trk.quality === "accurate" ? "Accurate" : "Fast"} models · auto performance: ${C.trk.autoPerf === false ? "off" : ["full speed", "easing off (PC busy)", "saving power (PC very busy)"][perf.level]}${perf.linkPress ? " · OBS link lightened" : ""}${zoomOn ? " · face zoom on" : ""}${handZoomOn ? " · hand zoom on" : ""}</p><ul>${tips.map(t => "<li>" + t + "</li>").join("")}</ul>`;
  }

  // ---- hands: zoom in on where your hands are (from your body, your last hands, or below your face) ----
  const handCv = document.createElement("canvas"), handX = handCv.getContext("2d");
  const hz = { x: 0, y: 0, w: 1, h: 1 };
  let handZoomOn = false, handsAt = 0;
  function handRegion() {
    const now = performance.now(); let b = null;
    const add = (x, y) => { if (!b) b = { x0: x, x1: x, y0: y, y1: y }; else { b.x0 = Math.min(b.x0, x); b.x1 = Math.max(b.x1, x); b.y0 = Math.min(b.y0, y); b.y1 = Math.max(b.y1, y); } };
    if (lastBody && now - lastBody.at < 500) [15, 16, 17, 18, 19, 20].forEach(i => { const p = lastBody.pts[i]; if (p.v > .4) add(p.x, p.y); });
    if (!b && lastHands.length && now - handsAt < 800) lastHands.forEach(h => h.pts.forEach(p => add(p.x, p.y)));
    if (!b && lastFace && now - faceNormAt < 800) { const f = lastFace; add(f.x - f.w * 1.6, f.y - f.h * .4); add(f.x + f.w * 2.6, f.y + f.h * 3.4); }
    if (!b) return { x: 0, y: 0, w: 1, h: 1 };
    const sz = Math.max(C.trk.quality === "accurate" ? .35 : .45, Math.max(b.x1 - b.x0, b.y1 - b.y0) + .26);
    if (sz > .85) return { x: 0, y: 0, w: 1, h: 1 };
    const cx = (b.x0 + b.x1) / 2, cy = (b.y0 + b.y1) / 2;
    return { x: Math.min(1 - sz, Math.max(0, cx - sz / 2)), y: Math.min(1 - sz, Math.max(0, cy - sz / 2)), w: sz, h: sz };
  }
  function detectHandsZoomed(hl, ts) {
    const t = handRegion(), k = t.w >= .999 || hz.w >= .999 ? 1 : .35;
    hz.x += (t.x - hz.x) * k; hz.y += (t.y - hz.y) * k; hz.w += (t.w - hz.w) * k; hz.h = hz.w;
    const VW = tosVid.videoWidth, VH = tosVid.videoHeight;
    const sw = Math.max(16, Math.round(hz.w * VW)), sh = Math.max(16, Math.round(hz.h * VH));
    const dw = capW(sw, C.trk.quality === "accurate" ? 960 : 640), dh = Math.round(dw * sh / sw);
    if (handCv.width !== dw || handCv.height !== dh) { handCv.width = dw; handCv.height = dh; }
    handX.drawImage(tosVid, Math.round(hz.x * VW), Math.round(hz.y * VH), sw, sh, 0, 0, dw, dh);
    const r = hl.detectForVideo(handCv, ts);
    handZoomOn = hz.w < .999;
    if (handZoomOn) (r.landmarks || []).forEach(pts => pts.forEach(p => { p.x = hz.x + p.x * hz.w; p.y = hz.y + p.y * hz.h; p.z *= hz.w; }));
    if ((r.landmarks || []).length) handsAt = performance.now();
    return r;
  }

  // ---- body: smoothing, poses, framing ----
  let bodyF = null;
  let lastBody = null;
  const bodyFresh = () => !!lastBody && performance.now() - lastBody.at < 1200;
  function bodyUpdate(r, now) {
    const L = r.landmarks && r.landmarks[0];
    if (!L) { if (lastBody && now - lastBody.at > 1200) lastBody = null; return; }
    const v = new Float32Array(66); L.forEach((p, k) => { v[2 * k] = p.x; v[2 * k + 1] = p.y; });
    bodyF = bodyF || new OneEuro();
    const P = bodyF.run(v, now), old = lastBody, vis = new Float32Array(33), pts = [], p = [];
    for (let k = 0; k < 33; k++) {
      const vv = L[k].visibility == null ? 1 : L[k].visibility;
      vis[k] = old ? old.vis[k] * .55 + vv * .45 : vv;
      pts.push({ x: P[2 * k], y: P[2 * k + 1], v: vis[k] });
      p.push(q(P[2 * k]), q(P[2 * k + 1]), Math.round(vis[k] * 100));
    }
    lastBody = { pts, vis, p, at: now };
  }
  // your head from the body tracker (nose, eyes, ears): works side-on, where the face tracker can't
  function headFromBody() {
    if (!lastBody) return null;
    const P = lastBody.pts; let x = 0, y = 0, n = 0;
    [0, 2, 5, 7, 8].forEach(i => { if (P[i].v > .5) { x += P[i].x; y += P[i].y; n++; } });
    if (!n || P[0].v < .3) return null;
    // which way you're facing: one ear hidden = turned that way
    const le = P[7].v > .5, re = P[8].v > .5;
    return { x: x / n, y: y / n, nose: { x: P[0].x, y: P[0].y }, yaw: le && !re ? -.9 : re && !le ? .9 : 0 };
  }
  // when your face turns away: the last face, moved along with your head, so props and paint stay on you (up to 10 seconds)
  const ghost = { pts: null, nose: null, yaw: 0, pitch: 0, at: 0, on: false };

  const POSES = [["up", "🙌 Both arms up"], ["tpose", "✈️ T-pose (arms straight out)"], ["flex", "💪 Double flex"], ["dab", "🕺 Dab"], ["cross", "❌ Arms crossed in an X"], ["salute", "🫡 Salute"], ["wave", "👋 Wave"]];
  const poseSt = { cur: "", since: 0, fired: false, last: {}, any: 0, wave: [], lastName: "" };
  function poseOf(b) {
    const A = (tosVid.videoWidth || 16) / (tosVid.videoHeight || 9);
    const P = b.pts, ok = i => P[i].v > .5, g = i => ({ x: P[i].x * A, y: P[i].y });
    if (!ok(11) || !ok(12)) return "";
    const S = [g(11), g(12)], sw = Math.hypot(S[0].x - S[1].x, S[0].y - S[1].y) || .01, sy = (S[0].y + S[1].y) / 2;
    const head = ok(0) ? g(0).y : sy - sw * .9;
    const arm = side => { const [s, e, w] = side ? [12, 14, 16] : [11, 13, 15]; return ok(e) && ok(w) ? { s: g(s), e: g(e), w: g(w) } : null; };
    const L = arm(0), R = arm(1);
    if (!L || !R) return "";
    const dist = (a, c) => Math.hypot(a.x - c.x, a.y - c.y);
    const straight = a => dist(a.s, a.w) > .85 * (dist(a.s, a.e) + dist(a.e, a.w));
    // dab: one arm straight up and out, the other bent across your face
    for (const [st, bent] of [[L, R], [R, L]]) {
      if (st.w.y < st.s.y - .3 * sw && Math.abs(st.w.x - st.s.x) > .9 * sw && straight(st) && ok(0) && dist(bent.w, g(0)) < .95 * sw && bent.e.y < bent.s.y + .3 * sw) return "dab";
    }
    if (L.w.y < head - .25 * sw && R.w.y < head - .25 * sw) return "up";
    // salute: one hand at your forehead with the elbow out to the side, the other arm down
    if (ok(0)) for (const [hi, lo] of [[L, R], [R, L]]) {
      const nose = g(0);
      if (hi.w.y < nose.y - .05 * sw && hi.w.y > head - .9 * sw && Math.abs(hi.w.x - nose.x) < .9 * sw && Math.abs(hi.e.x - hi.s.x) > .35 * sw && hi.e.y < hi.s.y + .35 * sw && lo.w.y > lo.s.y) return "salute";
    }
    const out = a => Math.abs(a.w.x - a.s.x) > 1.25 * sw && Math.abs(a.w.y - a.s.y) < .45 * sw && Math.abs(a.e.y - a.s.y) < .35 * sw;
    if (out(L) && out(R)) return "tpose";
    const flex = a => Math.abs(a.e.y - a.s.y) < .6 * sw && Math.abs(a.e.x - a.s.x) > .5 * sw && a.w.y < a.e.y - .4 * sw && a.w.y > head - .7 * sw;
    if (flex(L) && flex(R)) return "flex";
    const crossed = Math.sign(L.w.x - R.w.x) !== Math.sign(S[0].x - S[1].x) && Math.abs(L.w.x - R.w.x) < 1.2 * sw;
    if (crossed && L.w.y > sy - .2 * sw && R.w.y > sy - .2 * sw && L.w.y < sy + 1.7 * sw && R.w.y < sy + 1.7 * sw) return "cross";
    return "";
  }
  function waveCheck(b, now) {
    const A = (tosVid.videoWidth || 16) / (tosVid.videoHeight || 9), P = b.pts;
    const sw = Math.abs(P[11].x - P[12].x) * A || .01;
    let up = null;
    for (const [s, e, w] of [[11, 13, 15], [12, 14, 16]]) if (P[w].v > .5 && P[e].v > .5 && P[w].y < P[s].y && P[w].y < P[e].y) up = w;
    if (up == null) { poseSt.wave = []; return false; }
    poseSt.wave.push([now, P[up].x * A]); poseSt.wave = poseSt.wave.filter(([t]) => now - t < 1500);
    let turns = 0, dir = 0, ref = poseSt.wave[0] ? poseSt.wave[0][1] : 0;
    for (const [, x] of poseSt.wave) { const d = x - ref; if (Math.abs(d) > .12 * sw) { const sd = Math.sign(d); if (dir && sd !== dir) turns++; dir = sd; ref = x; } }
    return turns >= 3;
  }
  function poses(b, now) {
    let k = myPoseOf(b) || poseOf(b);
    if (!k && waveCheck(b, now)) k = "wave";
    if (k !== poseSt.cur) { poseSt.cur = k; poseSt.since = now; poseSt.fired = false; }
    if (!k || poseSt.fired) return;
    if (now - poseSt.since < (k === "wave" ? 0 : 350)) return;
    if (now - (poseSt.last[k] || 0) < 2000 || now - poseSt.any < 1200) return;
    const want = ruleWants("pose:" + k); poseSt.fired = true; noteTrigger("pose:" + k);
    if (!want) return;
    poseSt.last[k] = poseSt.any = now; poseSt.lastName = k; if (k === "wave") poseSt.wave = [];
    const P = b.pts, at = { x: (P[11].x + P[12].x) / 2, y: (P[11].y + P[12].y) / 2 + .05 };
    ruleFire("pose:" + k, { at });
  }
  // ================= your own gestures and poses: record them, then use them like the built-in ones =================
  // A hand is stored as its 20 finger points around the wrist (sized by the palm, left hands mirrored so either hand works);
  // a pose as your nose, elbows and wrists around your shoulders (sized by shoulder width). Matching = how close the live shape is.
  const CUS = { rec: null, live: {}, handsUntil: 0, bodyUntil: 0 };
  const myG = () => C.trk.myGest || (C.trk.myGest = []);
  const myP = () => C.trk.myPose || (C.trk.myPose = []);
  const vidA = () => tosVid && tosVid.videoWidth ? tosVid.videoWidth / tosVid.videoHeight : 16 / 9;
  function handVec(sp, side) {
    const A = vidA(), w = sp[0], s = Math.hypot((sp[9].x - w.x) * A, sp[9].y - w.y) || 1e-6, mir = /left/i.test(side || "") ? -1 : 1, v = [];
    for (let k = 1; k < 21; k++) v.push(+(mir * (sp[k].x - w.x) * A / s).toFixed(3), +((sp[k].y - w.y) / s).toFixed(3));
    return v;
  }
  const BODY_PTS = [0, 13, 14, 15, 16];
  function bodyVec(b) {
    const P = b.pts, ok = i => P[i] && P[i].v > .5; if (!ok(11) || !ok(12) || ![13, 14, 15, 16].every(ok)) return null;
    const A = vidA(), cx = (P[11].x + P[12].x) / 2 * A, cy = (P[11].y + P[12].y) / 2, s = Math.hypot((P[11].x - P[12].x) * A, P[11].y - P[12].y) || .01, v = [];
    BODY_PTS.forEach(i => { if (ok(i)) v.push(+((P[i].x * A - cx) / s).toFixed(3), +((P[i].y - cy) / s).toFixed(3)); else v.push(null, null); });
    return v;
  }
  // how different two shapes are: the worst-matching part counts most (one finger or one arm in the wrong place = no match)
  function vdist(a, b, keys) {
    let worst = 0, t = 0, n = 0;
    for (let i = 0; i < a.length; i += 2) {
      if (a[i] == null || b[i] == null) continue;
      const d = Math.hypot(a[i] - b[i], a[i + 1] - b[i + 1]); t += d; n++;
      if (!keys || keys.includes(i / 2)) worst = Math.max(worst, d);
    }
    return n ? worst * .8 + (t / n) * .2 : 9;
  }
  const TIPS = [3, 7, 11, 15, 19, 2, 6, 10, 14, 18];   // fingertips and the joints just below them (indexes in the hand shape)
  const ARMS = [1, 2, 3, 4];                          // elbows and wrists (indexes in the pose shape)
  const gThr = g => .78 - .5 * ((g.sens == null ? 50 : g.sens) / 100);   // more sensitive = matches looser versions
  const pThr = g => .95 - .5 * ((g.sens == null ? 50 : g.sens) / 100);
  function bestOf(list, v, thr, keys) {
    let best = null, bd = 9;
    list.forEach(g => { let d = 9; (g.samples || []).forEach(s => { d = Math.min(d, vdist(v, s, keys)); }); CUS.live[g.id] = { d, t: Date.now(), thr: thr(g) }; if (d < bd) { bd = d; best = g; } });
    return best && bd < thr(best) ? best : null;
  }
  function myGestOf(sp, side) {
    if (CUS.rec && CUS.rec.kind === "hand") CUS.rec.frames.push(handVec(sp, side));
    if (!myG().length) return "";
    const g = bestOf(myG(), handVec(sp, side), gThr, TIPS);
    return g ? "my_" + g.id : "";
  }
  function myPoseOf(b) {
    const v = bodyVec(b); if (!v) return "";
    if (CUS.rec && CUS.rec.kind === "body") CUS.rec.frames.push(v);
    if (!myP().length) return "";
    const g = bestOf(myP(), v, pThr, ARMS);
    return g ? "my_" + g.id : "";
  }
  const gDef = g => GEST.find(x => x[0] === g) || (/^my_/.test(g) && myG().some(x => "my_" + x.id === g) ? [g, (myG().find(x => "my_" + x.id === g) || {}).name, 280] : null);
  window.hubCustom = { CUS, myG, myP, handVec, bodyVec, vdist };   // for TOS HUB's own tests
  // ---- hand controls panel ----
  const HC_ROWS = [["draw", "✏️ Draw in the air", "the pen"], ["clear", "🧽 Clear the drawing", "wipe it across the cam"], ["spell", "🪄 Spells", "trace the shape with"], ["hold", "☄️ Fireball: hold it", "it sits in this hand"], ["throw", "☄️ Fireball: throw it", "switch to this to throw"], ["wand", "🪄 Magic wand", "the wand appears in"], ["trail", "✨ Sparkle trail", "sparkles follow this"]];
  function hcOptions() { return [["point", "☝️ Pointing (index finger)"]].concat(GEST.filter(g => g[0] !== "lips").map(g => [g[0], g[1]])).concat(myG().map(g => ["my_" + g.id, "⭐ " + g.name])); }
  function hcUi() {
    const box = $("#hcGrid"); if (!box) return;
    box.innerHTML = ""; const opts = hcOptions();
    HC_ROWS.forEach(([k, l, sub]) => {
      const lab = el("span", "hcl", l); lab.append(el("small", "", sub));
      const s2 = document.createElement("select"); s2.dataset.k = k;
      opts.forEach(([v, t]) => s2.append(new Option(t, v)));
      if (![...s2.options].some(o => o.value === hc(k))) s2.append(new Option("(a gesture you removed)", hc(k)));
      s2.value = hc(k);
      s2.onchange = () => { C.trk.handCtl = Object.assign({}, C.trk.handCtl || {}, { [k]: s2.value }); save(); hcCheck(); };
      box.append(lab, s2);
    });
    hcCheck();
  }
  function hcCheck() {
    // the same sign doing two jobs that are on at the same time = trouble (drawing and spells taking turns is fine)
    const pairs = [["draw", "clear"], ["hold", "throw"]];   // these can't work on the same sign (spells with a wand, etc. are meant to go together)
    const bad = pairs.filter(([a, b]) => hc(a) === hc(b));
    document.querySelectorAll("#hcGrid select").forEach(s2 => s2.classList.toggle("clash", bad.some(p => p.includes(s2.dataset.k))));
    const w = $("#hcWarn"); if (!w) return;
    const nm = k => (HC_ROWS.find(r => r[0] === k) || [, k])[1];
    w.textContent = bad.length ? "⚠ The same sign does two jobs: " + bad.map(([a, b]) => nm(a) + " + " + nm(b)).join(", ") + ". That sign would do both at once, so one of them can't work. Pick a different sign for one." : "";
    w.className = "note" + (bad.length ? " warn" : "");
  }
  setTimeout(() => {
    hcUi();
    document.querySelectorAll("[data-hcrule]").forEach(b => b.onclick = () => { if (!window.hubRules || !window.hubRules.add) return; const r = window.hubRules.add("track", b.dataset.hcrule, "", "hands"); if (r && window.hubOpenRule) window.hubOpenRule(r.id); });
  }, 650);
  // ---- the panels: record, list, live match meters ----
  function myUi(kind) {
    const H = kind === "hand", list = H ? myG() : myP(), box = $(H ? "#mgList" : "#mpList"); if (!box) return;
    box.innerHTML = "";
    if (!list.length) { box.append(el("p", "note", H ? "None yet. Your recorded gestures show here with a live meter, so you can see when TOS HUB spots them." : "None yet. Your recorded poses show here with a live meter.")); return; }
    list.forEach(g => {
      const row = el("div", "myrow"); row.dataset.id = g.id;
      const nm = el("span", "mn", g.name);
      const meter = el("span", "mm"); meter.append(el("i"), el("b")); meter.title = "How close you are right now. Past the white line = it counts.";
      const sl = el("label", "", "Sensitivity"); const sens = el("input"); sens.type = "range"; sens.min = 0; sens.max = 100; sens.step = 5; sens.value = g.sens == null ? 50 : g.sens; sens.title = "Higher = it matches looser versions of your " + (H ? "gesture" : "pose"); sens.oninput = () => { g.sens = +sens.value; save(); }; sl.append(sens);
      const more = el("button", "ghost", "＋ Example"); more.type = "button"; more.title = "Record it again (another angle, the other hand…) so it's spotted more reliably"; more.onclick = () => myRecord(kind, g);
      const use = el("button", "ghost", "⚡ Use it"); use.type = "button"; use.title = "Make a trigger for it: pick what it sets off"; use.onclick = () => { if (!window.hubRules || !window.hubRules.add) return; const r = window.hubRules.add("track", "", "my_" + g.id, H ? "hands" : "body"); if (r && window.hubOpenRule) window.hubOpenRule(r.id); };
      const del = el("button", "ghost", "✕"); del.type = "button"; del.title = "Forget it"; del.onclick = () => { const L = H ? myG() : myP(); L.splice(L.indexOf(g), 1); save(); myUi(kind); hcUi(); };
      row.append(nm, meter, sl, el("span", "ms", (g.samples || []).length + " frames"), more, use, del);
      box.append(row);
    });
  }
  async function myRecord(kind, into) {
    const H = kind === "hand", msg = $(H ? "#mgMsg" : "#mpMsg"), btn = $(H ? "#mgRec" : "#mpRec"), T = C.trk;
    const say = (t, cls) => { msg.textContent = t; msg.className = "note " + (cls || ""); };
    if (CUS.rec || btn.disabled) return;
    if (!C.tos.on) return say("This needs the ✨ TOS HUB camera (Camera tab) so TOS HUB can see you.", "err");
    if (H ? T.useHands === false : T.useBody === false) return say(`Switch on ${H ? "hand" : "body"} tracking first (Tracking → Settings → What to track).`, "err");
    btn.disabled = true;
    CUS[H ? "handsUntil" : "bodyUntil"] = Date.now() + 12000; if (!trkRunning) try { trkChanged(); } catch (e) {}   // already running: the next frame picks it up, no restart
    for (let n = 3; n > 0; n--) { say(`Get ready… ${n}  (${H ? "hold your hand sign up to the camera" : "strike your pose, arms in shot"})`, "myrec"); await new Promise(r => setTimeout(r, 1000)); }
    say("⏺ Hold it…", "myrec");
    CUS.rec = { kind, frames: [] };
    { const t0 = Date.now(); while (Date.now() - t0 < 5000 && (Date.now() - t0 < 1200 || CUS.rec.frames.length < 8)) await new Promise(r => setTimeout(r, 100)); }   // about a second, longer on a slow PC until it has enough
    const frames = CUS.rec.frames; CUS.rec = null; btn.disabled = false;
    if (frames.length < 3) return say(H ? "I couldn't see your hand. Check hand tracking is on and your whole hand is in shot, then try again." : "I couldn't see your arms. Step back so your shoulders, elbows and hands are in shot, then try again.", "err");
    const step = Math.max(1, Math.ceil(frames.length / 8)), pick = frames.filter((_, i) => i % step === 0).slice(0, 8);
    let g = into;
    if (g) g.samples = (g.samples || []).concat(pick).slice(-40);
    else {
      const L = H ? myG() : myP(), nameIn = $(H ? "#mgName" : "#mpName");
      g = { id: Date.now().toString(36), name: (nameIn.value || "").trim() || (H ? "My gesture " : "My pose ") + (L.length + 1), samples: pick, sens: 50 };
      L.push(g); nameIn.value = "";
    }
    save(); myUi(kind); hcUi();
    say(`Learned “${g.name}” ✓ Click ⚡ Use it to link it to an effect, a key press or an OBS action. If it's missed sometimes, add another example or turn up sensitivity.`, "ok");
  }
  // live meters while a panel is on screen (and keep that tracking running so you can try your moves)
  setInterval(() => {
    const now = Date.now();
    [["hand", "#mgList", "handsUntil"], ["body", "#mpList", "bodyUntil"]].forEach(([kind, sel, key]) => {
      const box = $(sel); if (!box || !box.offsetParent) return;
      if (CUS[key] < now + 1500) { const was = CUS[key] < now; CUS[key] = now + 2500; if (was && !trkRunning) try { trkChanged(); } catch (e) {} }
      box.querySelectorAll(".myrow").forEach(row => {
        const L = CUS.live[row.dataset.id], m = row.querySelector(".mm"), i = m.querySelector("i"), b = m.querySelector("b");
        const fresh = L && now - L.t < 1500, pc = fresh ? Math.max(0, Math.min(1, 1 - L.d / (L.thr * 2))) : 0;
        i.style.width = Math.round(pc * 100) + "%"; b.style.left = "50%"; m.classList.toggle("hit", fresh && L.d < L.thr);
      });
    });
  }, 120);
  setTimeout(() => { if (!$("#mgRec")) return; $("#mgRec").onclick = () => myRecord("hand"); $("#mpRec").onclick = () => myRecord("body"); myUi("hand"); myUi("body"); }, 600);

  // camera operator, "upper body" framing: head to hips (or a guess at the hips) in shot
  function followBody() {
    if (!bodyFresh()) return false;
    const P = lastBody.pts, vis = i => P[i].v > .5;
    if (!vis(11) || !vis(12)) return false;
    const sy = (P[11].y + P[12].y) / 2, ny = vis(0) ? P[0].y : sy - .12;
    let y0 = ny - (sy - ny) * 1.1, y1 = vis(23) && vis(24) ? (P[23].y + P[24].y) / 2 : sy + (sy - ny) * 2.4;
    let x0 = Math.min(P[11].x, P[12].x), x1 = Math.max(P[11].x, P[12].x);
    [13, 14, 15, 16].forEach(i => { if (vis(i)) { x0 = Math.min(x0, P[i].x); x1 = Math.max(x1, P[i].x); y0 = Math.min(y0, P[i].y); } });
    let z = Math.min(.86 / Math.max(.05, y1 - y0), .86 / Math.max(.05, x1 - x0));
    z *= (C.face.zoom || 150) / 150;
    z = Math.max(1, Math.min(3.5, z));
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
    if (!tosAim || !tosAim.z || Math.abs(cx - tosAim.cx) > .05 / z || Math.abs(cy - tosAim.cy) > .05 / z || Math.abs(z - tosAim.z) / tosAim.z > .07) { tosAim = { cx, cy, z }; sendView(); }
    return true;
  }

  async function trkFrame(meta) {
    if (tosVid.readyState < 2 || !tosVid.videoWidth) return;
    let ts = meta && meta.mediaTime ? meta.mediaTime * 1000 : performance.now();
    if (ts <= lastTs) ts = lastTs + 1;
    lastTs = ts; frameNo++;
    const now = performance.now(), T = C.trk, tFrame = performance.now(), lvl = T.autoPerf === false ? 0 : perf.level;
    const wantFace = T.useFace !== false && (T.mesh || T.lipsFace || T.expr || T.mood || T.paint !== "none" || !!T.obj || T.prop !== "none" || C.face.follow || T.avatar !== "off" || T.mic.on || Date.now() < streamUntil);
    const msg = { type: "track" };
    let faces = [];
    // auto performance: when the PC is busy (or you're sitting still), the face is checked every other frame and the gaps are glided over
    const objLive = !!T.obj || Date.now() < (window.__objTimedUntil || 0);
    const faceEvery = objLive ? 1 : lvl >= 2 || (lvl >= 1 && perf.still > 45) ? 2 : 1;   // as an object: your eyes and mouth need every frame
    if (wantFace && !every(faceEvery) && lastFaces.length) faces = lastFaces;
    else if (wantFace) {
      const fl = await ensureFace(), tF = performance.now();
      const r = detectFacesZoomed(fl, ts);
      timeIt("face", performance.now() - tF, !!(r.faceLandmarks && r.faceLandmarks.length));
      const list = (r.faceLandmarks || []).map((L, i) => ({ L, bs: r.faceBlendshapes && r.faceBlendshapes[i] }));
      list.sort((x, y) => Math.abs(y.L[454].x - y.L[234].x) - Math.abs(x.L[454].x - x.L[234].x));   // biggest (nearest) face first
      faces = smoothFaces(list, now); faceCount = faces.length;
      if (faces[0] && lastFaces[0]) { const a = faces[0].box, b = lastFaces[0].box; perf.still = Math.abs(a.x - b.x) + Math.abs(a.y - b.y) + Math.abs(a.w - b.w) < .004 ? perf.still + 1 : 0; } else perf.still = 0;
      lastFaces = faces;
      if (faces.length) {
        const f0 = faces[0];
        msg.f = { p: f0.pts, yaw: +f0.yaw.toFixed(3), pitch: +f0.pitch.toFixed(3) };
        ghost.pts = f0.pts; ghost.nose = { x: f0.pts[2] / 1e4, y: f0.pts[3] / 1e4 }; ghost.yaw = f0.yaw; ghost.pitch = f0.pitch; ghost.at = now; ghost.on = false;
        if (faces[1]) msg.f2 = { p: faces[1].pts, yaw: +faces[1].yaw.toFixed(3), pitch: +faces[1].pitch.toFixed(3) };
        faceNorm = f0.box; faceNormAt = Date.now(); lastSeenAt = Date.now(); lastFace = f0.box;
        blend = f0.blend;
        if (C.face.follow && !(T.framing === "body" && bodyFresh())) followFrame(faces);
        if (T.expr) expressions(blend);
        if (T.mood) moodUpdate(blend, Date.now());
      } else {
        // face lost: if the body tracker can see your head, keep everything on it
        const hd = bodyFresh() ? headFromBody() : null;
        if (hd && ghost.pts && now - ghost.at < 10000) {
          const dx = Math.round((hd.nose.x - ghost.nose.x) * 1e4), dy = Math.round((hd.nose.y - ghost.nose.y) * 1e4);
          const p = new Array(ghost.pts.length); for (let k = 0; k < p.length; k += 2) { p[k] = ghost.pts[k] + dx; p[k + 1] = ghost.pts[k + 1] + dy; }
          ghost.yaw += ((hd.yaw || ghost.yaw) - ghost.yaw) * .3;
          msg.f = { p, yaw: +ghost.yaw.toFixed(3), pitch: +ghost.pitch.toFixed(3), g: 1 };
          ghost.on = true; lastSeenAt = Date.now(); faceNormAt = Date.now();
          if (C.face.follow && T.framing !== "body") { const z = tosAim && tosAim.z || 1.5; const cx = hd.x, cy = hd.y + .5 / z / 6; if (!tosAim || Math.abs(cx - tosAim.cx) > .05 / z || Math.abs(cy - tosAim.cy) > .05 / z) { tosAim = { cx, cy, z }; sendView(); } }
        } else ghost.on = false;
        if (!ghost.on && C.face.follow && tosAim && Date.now() - lastSeenAt > 2500) { tosAim = null; sendView(); }
      }
    }
    const handsWanted = T.useHands !== false && (T.hands || T.handsAlways || T.spells || T.wand || T.fireball || T.draw || Date.now() < interactUntil || Date.now() < CUS.handsUntil);
    handsRunning = handsWanted;
    if (handsWanted && (T.quality === "accurate" ? every(lvl >= 2 ? 2 : 1) : T.spells || T.draw ? every(lvl >= 2 ? 2 : 1) : every([2, 2, 3][lvl]))) {
      const hl = await ensureHands(), tH = performance.now();
      const fakeH = window.__tosTest && window.__tosTest.hands;   // TOS HUB's own tests feed in exact hand shapes
      const hr = fakeH ? { landmarks: fakeH.map(h => h.pts.map(([x, y, z]) => ({ x, y, z: z || 0 }))), handednesses: fakeH.map(h => [{ categoryName: h.side }]) } : detectHandsZoomed(hl, ts);
      timeIt("hands", performance.now() - tH, !!(hr.landmarks && hr.landmarks.length));
      lastHands = handsUpdate(hr, now);
      if (T.hands) gestures(lastHands);
    }
    if (handsWanted) {
      msg.h = lastHands.map(h => ({ p: h.p, g: h.g, s: h.side, r: roleStr(h.g) }));
      msg.trail = !!T.pinchTrail;
      msg.props = { wand: !!T.wand, fireball: !!T.fireball };
      const st = T.draw ? null : spellsUpdate(lastHands, now); if (st) msg.st = st;   // drawing: spells take a break
    }
    const rescue = T.useBody !== false && !T.body && wantFace && T.avatar !== "vrm" && !faces.length && ghost.pts && now - ghost.at < 10000;
    const bodyCustom = Date.now() < CUS.bodyUntil && T.useBody !== false;
    if ((T.body && T.useBody !== false) || rescue || bodyCustom) {
      if (!lastBody || rescue || (T.quality === "accurate" ? every(lvl >= 2 ? 2 : 1) : every([2, 3, 4][lvl]))) {
        const pl = await ensurePose(), tB = performance.now();
        const fake = window.__tosTest && window.__tosTest.body;   // TOS HUB's own tests feed in exact poses
        const br = fake ? { landmarks: [fake.map(([x, y, v]) => ({ x, y, z: 0, visibility: v }))] } : pl.detectForVideo(poseInput(), ts);
        timeIt("body", performance.now() - tB, !!(br.landmarks && br.landmarks.length));
        bodyUpdate(br, now);
      }
      if (bodyFresh() && bodyCustom && !(T.body && T.poseFx)) myPoseOf(lastBody);   // recording / live meters
      if (bodyFresh() && T.body) {
        msg.b = lastBody.p;
        if (T.poseFx) poses(lastBody, now);
        if (C.face.follow && T.framing === "body") followBody();
      }
    } else if (!T.body && faces.length) lastBody = null;
    if (T.avatar === "vrm") {
      try { await vrmFromStore(); vrmDrive(faces[0], Math.min(.1, (now - (vr.lastT || now)) / 1000) || .016, T.bodyAv !== false && bodyFresh() ? lastBody : null); vr.lastT = now; vrmPack(); }
      catch (e) { avMsg(e.message, "err"); }
    } else if (segWanted()) {
      if (!segBusy && (lvl < 2 || frameNo % 2 === 0)) {
        segBusy = true;
        const tS = performance.now();
        ensureSeg().then(s2 => s2.send({ image: tosVid })).then(() => timeIt("seg", performance.now() - tS, true)).catch(e => trkMsg("Background removal couldn't start: " + e.message, "err")).finally(() => { segBusy = false; });
      }
    } else if (packLive) usePacked(false);
    if (T.avatar === "vrm") delete msg.f, delete msg.f2, delete msg.b;   // a 3D avatar's face isn't where yours is
    if (msg.f || msg.h || msg.b) toCam(msg);
    if (dbgOn) toPreview({ type: "dbg", z: { f: [zr.x, zr.y, zr.w, zr.h], h: [hz.x, hz.y, hz.w, hz.h], fo: zoomOn, ho: handZoomOn }, b: bodyFresh() ? lastBody.p : null, ghost: ghost.on, fps: Math.round(trkFps) });
    fpsN++;
    perf.ms = perf.ms ? perf.ms * .85 + (performance.now() - tFrame) * .15 : performance.now() - tFrame;
    if (now - fpsT > 1000) { perfUpdate(); const secs = (now - fpsT) / 1000; trkFps = fpsN / secs; segFps = segN / secs; fpsN = 0; segN = 0; fpsT = now; healthTick(secs); trkStatus(); }
  }
  function trkStatus() {
    if (!C.tos.on) { trkMsg("Advanced tracking works with the TOS HUB camera (switch to it at the top of the Camera section).", "warn"); return; }
    if (trkFatal) { trkMsg(trkFatal, "err"); return; }
    if (!trkRunning) { trkMsg("Ready. Turn something on below.", ""); return; }
    const parts = [`${Math.round(trkFps)} fps on your ${trkEngine === "GPU" ? "graphics card" : "processor"}`];
    if (lastFace && Date.now() - faceNormAt < 1500) parts.push(ghost.on ? "face turned away (following your head)" : (faceCount > 1 ? "2 faces ✓" : "face ✓") + (zoomOn ? " (zoomed in to find you)" : "")); else if (C.trk.mesh || C.trk.expr) parts.push("no face");
    if (C.trk.mood && moodState.cur) parts.push("mood: " + moodState.cur);
    if (C.trk.spells && spell.lastName) parts.push(spell.lastName === "?" ? "spell not recognised" : "last spell: " + spell.lastName);
    if (comboName) parts.push("last combo: " + comboName);
    if (C.trk.body) parts.push(bodyFresh() ? "body ✓" + (poseSt.lastName && C.trk.poseFx ? " (last pose: " + poseSt.lastName + ")" : "") : "no body");
    if (C.trk.hands) parts.push(lastHands.length ? `${lastHands.length} hand${lastHands.length > 1 ? "s" : ""}${lastHands.some(h => h.g) ? " (" + lastHands.map(h => h.g).filter(Boolean).join(", ") + ")" : ""}` : "no hands");
    if (segWanted()) parts.push(packLive ? `background ${Math.round(segFps)} fps` : "background starting…");
    trkMsg("Tracking: " + parts.join(" · "), "ok");
  }

  // ================= smoothing (One Euro filter) =================
  // Steady when you're still, quick when you move: each point is smoothed more when it's slow.
  class OneEuro {
    constructor() { this.x = null; this.dx = null; this.t = 0; }
    run(v, t) {
      const s = (C.trk.smooth == null ? 50 : C.trk.smooth) / 100;
      const minCut = 4.4 - 4.0 * s, beta = 10 * (1 - s * .75);
      if (!this.x || this.x.length !== v.length || t - this.t > 600) { this.x = Float32Array.from(v); this.dx = new Float32Array(v.length); this.t = t; return this.x; }
      const dt = Math.max(1e-3, Math.min(.2, (t - this.t) / 1000)); this.t = t;
      const al = cut => { const r = 2 * Math.PI * cut * dt; return r / (r + 1); }, aD = al(1.2);
      for (let i = 0; i < v.length; i++) {
        const d = (v[i] - this.x[i]) / dt; this.dx[i] += aD * (d - this.dx[i]);
        this.x[i] += al(minCut + beta * Math.abs(this.dx[i])) * (v[i] - this.x[i]);
      }
      return this.x;
    }
  }
  const faceSlots = [{ f: new OneEuro(), c: null }, { f: new OneEuro(), c: null }];
  const handFilters = {};
  const OVAL_IDX = [10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288, 397, 365, 379, 378, 400, 377, 152, 148, 176, 149, 150, 136, 172, 58, 132, 93, 234, 127, 162, 21, 54, 103, 67, 109];
  const centreOf = L => ({ x: (L[234].x + L[454].x) / 2, y: (L[10].y + L[152].y) / 2 });
  // detected faces → smoothed faces, each kept on its own filter even if the order changes
  function smoothFaces(list, now) {
    const used = [];
    if (list.length === 2 && faceSlots[0].c && faceSlots[1].c) {
      const c0 = centreOf(list[0].L), c1 = centreOf(list[1].L), d = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
      const keep = d(c0, faceSlots[0].c) + d(c1, faceSlots[1].c), swap = d(c0, faceSlots[1].c) + d(c1, faceSlots[0].c);
      used.push(...(swap < keep ? [1, 0] : [0, 1]));
    } else if (list.length === 1 && faceSlots[0].c && faceSlots[1].c) {
      const c = centreOf(list[0].L), d = s => Math.hypot(c.x - s.c.x, c.y - s.c.y);
      used.push(d(faceSlots[0]) <= d(faceSlots[1]) ? 0 : 1);
    } else list.forEach((_, i) => used.push(i));
    return list.map((it, i) => {
      const slot = faceSlots[used[i]], L = it.L, v = new Float32Array(L.length * 2);
      for (let k = 0; k < L.length; k++) { v[2 * k] = L[k].x; v[2 * k + 1] = L[k].y; }
      const P = slot.f.run(v, now);
      slot.c = centreOf(L);
      const g = k => ({ x: P[2 * k], y: P[2 * k + 1] });
      const nose = g(1), lc = g(234), rc = g(454), eyeY = (g(33).y + g(263).y) / 2, chin = g(152);
      const half = Math.max(1e-4, Math.abs(rc.x - lc.x) / 2);
      const yaw = Math.max(-1, Math.min(1, (nose.x - (lc.x + rc.x) / 2) / half));
      const pitch = Math.max(-1, Math.min(1, ((nose.y - eyeY) / Math.max(1e-4, chin.y - eyeY) - .42) * 2.5));
      const ea = g(33), eb = g(263), roll = Math.atan2(eb.y - ea.y, eb.x - ea.x);
      let x0 = 1, y0 = 1, x1 = 0, y1 = 0;
      for (const k of OVAL_IDX) { const p = g(k); if (p.x < x0) x0 = p.x; if (p.y < y0) y0 = p.y; if (p.x > x1) x1 = p.x; if (p.y > y1) y1 = p.y; }
      const ie = L.length > 470 ? [g(468), g(473)] : [g(159), g(386)];
      const pts = new Array(P.length); for (let k = 0; k < P.length; k++) pts[k] = q(P[k]);
      const blend = {};
      if (it.bs && it.bs.categories) it.bs.categories.forEach(c => { blend[c.categoryName] = c.score; });
      // where the eyes look (−1 left … 1 right), from the iris inside each eye
      let gx = 0, gy = 0;
      if (L.length > 470) {
        const ga = (c, a, b) => (g(c).x - g(a).x) / ((g(b).x - g(a).x) || 1e-4) - .5;
        gx = Math.max(-1, Math.min(1, (ga(468, 33, 133) + ga(473, 362, 263)) * 2.2));
        const gyA = (g(468).y - (g(159).y + g(145).y) / 2) / Math.max(1e-4, Math.abs(g(145).y - g(159).y));
        gy = Math.max(-1, Math.min(1, gyA * 1.5));
      }
      return { pts, yaw, pitch, roll, blend, gx, gy,
        box: { raw: true, x: +x0.toFixed(4), y: +(y0 + (y1 - y0) * .12).toFixed(4), w: +(x1 - x0).toFixed(4), h: +((y1 - y0) * .88).toFixed(4), le: ie[0], re: ie[1] },
        eyeY: (ie[0].y + ie[1].y) / 2, x0, y0, x1, y1 };
    });
  }

  // ================= auto camera operator =================
  let opBase = 0, faceCount = 0;
  function followFrame(faces) {
    if (!faces.length) return;
    let x0 = 1, y0 = 1, x1 = 0, y1 = 0;
    faces.forEach(f => { x0 = Math.min(x0, f.x0); y0 = Math.min(y0, f.y0); x1 = Math.max(x1, f.x1); y1 = Math.max(y1, f.y1); });
    const main = faces[0], fh = main.y1 - main.y0;
    const frac = { close: .52, hs: .32, wide: .18 }[C.trk.framing] || .32;
    let z = frac / Math.max(.04, fh);
    if (faces.length > 1) z = Math.min(z, .78 / Math.max(.05, x1 - x0), .7 / Math.max(.05, y1 - y0));   // keep both people in shot
    const sz = main.x1 - main.x0;
    opBase = opBase ? opBase + (sz - opBase) * .008 : sz;
    if (C.trk.lean !== false) z *= Math.pow(Math.max(.5, Math.min(2, sz / opBase)), 1.5);   // lean in = punch in, sit back = pull out
    z *= (C.face.zoom || 150) / 150;
    z = Math.max(1, Math.min(3.5, z));
    const vh = 1 / z, cx = (x0 + x1) / 2, cy = faces.length > 1 ? (y0 + y1) / 2 + vh * .05 : main.eyeY + vh / 6;   // eyes a third of the way down
    if (!tosAim || !tosAim.z || Math.abs(cx - tosAim.cx) > .05 / z || Math.abs(cy - tosAim.cy) > .05 / z || Math.abs(z - tosAim.z) / tosAim.z > .07) { tosAim = { cx, cy, z }; sendView(); }
  }

  // ================= spells drawn in the air =================
  const SPELLS = [["circle", "⭕ Circle"], ["zigzag", "⚡ Zigzag"], ["star", "⭐ Star"], ["heart", "❤️ Heart"], ["triangle", "🔺 Triangle"], ["swipe", "➖ Swipe"]];
  const SN = 48;
  function resample(pts, n) {
    const out = [pts[0].slice()]; let D = 0, total = 0;
    for (let i = 1; i < pts.length; i++) total += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    const I = total / (n - 1); const p = pts.map(a => a.slice());
    for (let i = 1; i < p.length; i++) {
      const d = Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1]);
      if (D + d >= I && d > 0) { const t = (I - D) / d, q2 = [p[i - 1][0] + t * (p[i][0] - p[i - 1][0]), p[i - 1][1] + t * (p[i][1] - p[i - 1][1])]; out.push(q2); p.splice(i, 0, q2); D = 0; }
      else D += d;
    }
    while (out.length < n) out.push(p[p.length - 1].slice());
    return out.slice(0, n);
  }
  function normShape(pts) {
    const r = resample(pts, SN); let cx = 0, cy = 0; r.forEach(([x, y]) => { cx += x; cy += y; }); cx /= SN; cy /= SN;
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9; r.forEach(([x, y]) => { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); });
    const sz = Math.max(x1 - x0, y1 - y0) || 1;
    return r.map(([x, y]) => [(x - cx) / sz, (y - cy) / sz]);
  }
  const shapeDist = (a, b) => { let d = 0; for (let i = 0; i < SN; i++) d += Math.hypot(a[i][0] - b[i][0], a[i][1] - b[i][1]); return d / SN; };
  const SPELL_TEMPLATES = (() => {
    const T = [], addT = (name, pts) => { const n = normShape(pts); T.push([name, n]); T.push([name, normShape(pts.slice().reverse())]); };
    const closed = (name, poly, starts) => { for (let s = 0; s < starts; s++) { const k = Math.floor(s * poly.length / starts); addT(name, poly.slice(k).concat(poly.slice(0, k + 1))); } };
    const circle = []; for (let i = 0; i < 40; i++) { const a = i / 40 * Math.PI * 2; circle.push([Math.cos(a), Math.sin(a)]); }
    closed("circle", circle, 16);
    const heart = []; for (let i = 0; i < 48; i++) { const t = i / 48 * Math.PI * 2; heart.push([16 * Math.pow(Math.sin(t), 3) / 16, -(13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t)) / 16]); }
    closed("heart", heart, 4);
    const star = []; for (let i = 0; i < 5; i++) { const a = -Math.PI / 2 + i * 4 * Math.PI / 5; star.push([Math.cos(a), Math.sin(a)]); }
    const starDense = []; for (let i = 0; i < 5; i++) { const A = star[i], B = star[(i + 1) % 5]; for (let k = 0; k < 8; k++) starDense.push([A[0] + (B[0] - A[0]) * k / 8, A[1] + (B[1] - A[1]) * k / 8]); }
    closed("star", starDense, 5);
    const tri = [[0, -1], [.9, .6], [-.9, .6]], triDense = []; for (let i = 0; i < 3; i++) { const A = tri[i], B = tri[(i + 1) % 3]; for (let k = 0; k < 12; k++) triDense.push([A[0] + (B[0] - A[0]) * k / 12, A[1] + (B[1] - A[1]) * k / 12]); }
    closed("triangle", triDense, 3);
    addT("zigzag", [[0, 0], [1, 1], [2, 0], [3, 1], [4, 0]]);
    addT("zigzag", [[0, 0], [.8, 1], [.2, 1.2], [1, 2.4]]);   // lightning bolt
    addT("zigzag", [[1, 0], [.2, 1], [.8, 1.2], [0, 2.4]]);
    return T;
  })();
  function recognise(pts) {
    let len = 0; for (let i = 1; i < pts.length; i++) len += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    const chord = Math.hypot(pts[pts.length - 1][0] - pts[0][0], pts[pts.length - 1][1] - pts[0][1]);
    if (len > .12 && chord / len > .88) return { name: "swipe", score: 1 };
    const n = normShape(pts); let best = null;
    SPELL_TEMPLATES.forEach(([name, t]) => { const d = shapeDist(n, t); if (!best || d < best.d) best = { name, d }; });
    return best ? { name: best.name, score: Math.max(0, 1 - best.d / .32) } : null;
  }
  const spell = { pts: [], drawing: false, lastAt: 0, start: 0, lastCast: 0, lastName: "" };
  function spellsUpdate(hands, now) {
    if (!C.trk.spells) { spell.drawing = false; spell.pts = []; return null; }
    const h = hands.find(x => isRole(x.g, "spell"));
    if (h) {
      const tip = h.pts[8];
      if (!spell.drawing) { spell.drawing = true; spell.pts = []; spell.start = now; }
      const last = spell.pts[spell.pts.length - 1];
      if (!last || Math.hypot(tip.x - last[0], tip.y - last[1]) > .004) spell.pts.push([tip.x, tip.y]);
      spell.lastAt = now;
      if (spell.pts.length > 160) spell.pts.shift();
      if (now - spell.start > 4000) spellFinish(now);
    } else if (spell.drawing && now - spell.lastAt > 300) spellFinish(now);
    if (!spell.drawing || spell.pts.length < 2) return null;
    const out = []; spell.pts.slice(-70).forEach(([x, y]) => out.push(q(x), q(y)));
    return out;
  }
  function spellFinish(now) {
    spell.drawing = false;
    const pts = spell.pts; spell.pts = [];
    if (pts.length < 8 || now - spell.lastCast < 1200) return;
    let len = 0; for (let i = 1; i < pts.length; i++) len += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    if (len < .15) return;
    const r = recognise(pts), need = .38 + (1 - (C.trk.spellSens == null ? 50 : C.trk.spellSens) / 100) * .3;
    if (!r || r.score < need) { spell.lastName = "?"; return; }
    spell.lastCast = now; spell.lastName = r.name;
    let cx = 0, cy = 0; pts.forEach(([x, y]) => { cx += x; cy += y; }); cx /= pts.length; cy /= pts.length;
    noteTrigger("spell:" + r.name);
    ruleFire("spell:" + r.name, { at: { x: cx, y: cy } });
    clipMoment("spell");
  }

  // ================= hands: smoothing, gestures, fireball throw =================
  const throwState = {};
  function handsUpdate(r, now) {
    return (r.landmarks || []).map((pts, i) => {
      const side = (r.handednesses && r.handednesses[i] && r.handednesses[i][0] && r.handednesses[i][0].categoryName) || String(i);
      const f = handFilters[side] || (handFilters[side] = new OneEuro());
      const v = new Float32Array(42); pts.forEach((p, k) => { v[2 * k] = p.x; v[2 * k + 1] = p.y; });
      const P = f.run(v, now), sp = []; for (let k = 0; k < 21; k++) sp.push({ x: P[2 * k], y: P[2 * k + 1] });
      const p = new Array(42); for (let k = 0; k < 42; k++) p[k] = q(P[k]);
      let g = gesture(sp.map((q2, k) => ({ x: q2.x, y: q2.y, z: pts[k].z })), side);
      const mine = myGestOf(sp, side); if (mine) g = mine;   // your own recorded gestures win
      // fingers to your lips: a fingertip right at your mouth (uses the face too)
      const fp = ghost.pts;
      if (fp && !ghost.on && now - ghost.at < 600) {
        const A = tosVid && tosVid.videoWidth ? tosVid.videoWidth / tosVid.videoHeight : 16 / 9, d = (ax, ay, bx, by) => Math.hypot((ax - bx) * A, ay - by);
        const mx = (fp[26] + fp[28]) / 2e4, my = (fp[27] + fp[29]) / 2e4, fw = d(fp[468] / 1e4, fp[469] / 1e4, fp[908] / 1e4, fp[909] / 1e4) || .2;
        if ([8, 12].some(i => d(sp[i].x, sp[i].y, mx, my) < fw * .32)) g = "lips";
      }
      // fireball: open hand (holding it) then a fist = throw
      if (C.trk.fireball) {
        const st = throwState[side] || (throwState[side] = { palmAt: 0, last: 0, at: null });
        if (isRole(g, "hold")) { st.palmAt = now; st.at = { x: (sp[0].x + sp[9].x) / 2, y: (sp[0].y + sp[9].y) / 2 }; }
        else if (isRole(g, "throw") && now - st.palmAt < 600 && now - st.last > 1500 && st.at) { st.last = now; playEffect("fireball", "", { at: st.at }); clipMoment("spell"); }
      }
      return { side, pts: sp, g, p };
    });
  }

  // ================= combos: two moves in a row set off something bigger =================
  const trigLast = {}, comboLast = {};
  let comboName = "";
  const comboUses = id => C.trk.combosOn !== false && (C.trk.combos || []).some(c => c.a === id || c.b === id);
  function noteTrigger(id) {
    const now = Date.now();
    if (C.trk.combosOn !== false) (C.trk.combos || []).forEach((c, i) => {
      if (!c.fx || c.b !== id || !trigLast[c.a] || c.a === id && trigLast[c.a] === now) return;
      if (now - trigLast[c.a] > 2500 || now - trigLast[c.a] < 120) return;   // within 2.5 seconds, and really one after the other
      if (now - (comboLast[i] || 0) < 5000) return;
      comboLast[i] = now; trigLast[c.a] = 0;
      comboName = `${trigName(c.a)} → ${trigName(c.b)}`;
      setTimeout(() => playEffect(c.fx, ""), 350);   // just after the second move's own effect
      clipMoment("spell");
    });
    trigLast[id] = now;
  }
  function trigList() {
    return [
      ...[["clap", "👏 Clap"], ["click", "🫰 Snap / click"], ["shout", "🗣️ Shout"], ["bang", "💥 Bang"], ["laugh", "😂 Laugh"]].map(([k, l]) => ["mic:" + k, l]),
      ...POSES.map(([k, l]) => ["pose:" + k, l]),
      ...GEST.map(([k, l]) => ["gest:" + k, l]),
      ...SPELLS.map(([k, l]) => ["spell:" + k, "Spell: " + l]),
      ...EXPR.map(([k, l]) => ["expr:" + k, l])
    ];
  }
  const trigName = id => { const t = trigList().find(x => x[0] === id); return t ? t[1] : id; };
  function renderCombos() {
    const box = $("#comboList"); if (!box) return;
    box.innerHTML = "";
    const T = C.trk; T.combos = T.combos || [];
    T.combos.forEach((c, i) => {
      const row = el("div", "comborow");
      const mk = (val, key) => { const s2 = document.createElement("select"); tosAZ(trigList()).forEach(([k, l]) => s2.append(opt(k, l, k === val))); s2.onchange = () => { c[key] = s2.value; save(); }; return s2; };
      const fxs = document.createElement("select"); fxs.append(opt("", "Nothing", !c.fx)); tosFxOptions(fxs, EFFECTS.filter(([e]) => e !== "shake"), c.fx); fxs.onchange = () => { c.fx = fxs.value; save(); };
      const del = el("button", "ghost", "✕"); del.type = "button"; del.title = "Remove this combo"; del.onclick = () => { T.combos.splice(i, 1); save(); renderCombos(); };
      row.append(mk(c.a, "a"), el("span", "cthen", "then"), mk(c.b, "b"), el("span", "cthen", "→"), fxs, del);
      box.append(row);
    });
  }

  // ================= mood =================
  const MOODS = [
    ["surprised", "😲 Surprised", b => ((b.browInnerUp || 0) + ((b.eyeWideLeft || 0) + (b.eyeWideRight || 0)) / 2 + (b.jawOpen || 0) * .7) / 1.8, .5],
    ["happy", "😄 Happy", b => ((b.mouthSmileLeft || 0) + (b.mouthSmileRight || 0)) / 2, .6],
    ["angry", "😠 Angry", b => ((b.browDownLeft || 0) + (b.browDownRight || 0)) / 2 * .75 + ((b.noseSneerLeft || 0) + (b.noseSneerRight || 0)) / 2 * .6, .42],
    ["sad", "😢 Sad", b => (((b.mouthFrownLeft || 0) + (b.mouthFrownRight || 0)) / 2 + (b.browInnerUp || 0) * .35) / 1.1, .4]
  ];
  const moodState = { cur: "", since: 0, last: 0, fired: "" };
  let lastReactionAt = 0;
  function moodUpdate(b, now) {
    let best = null;
    MOODS.forEach(([k, , fn, thr]) => { const v = fn(b) / thr; if (v >= 1 && (!best || v > best.v)) best = { k, v }; });
    const k = best ? best.k : "";
    if (k !== moodState.cur) { moodState.cur = k; moodState.since = now; moodState.fired = ""; return; }
    if (!k || moodState.fired === k || now - moodState.since < 900 || now - moodState.last < 3000) return;
    moodState.fired = k; moodState.last = now; lastReactionAt = now;
    noteTrigger("mood:" + k); ruleFire("mood:" + k);
  }

