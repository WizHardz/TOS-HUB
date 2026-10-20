  // ================= face tracking =================
  // Finds your face in the webcam picture (on this computer, with a small built-in face model).
  // "Keep my face centred" adds an OBS Crop filter to the cam, before the shape mask, and slides it
  // to follow you, so the shape and the frame stay put while the picture inside them follows your face.
  const FRAMING = "TOS HUB framing";
  const fcMsg = (t, cls) => { const m = $("#fcMsg"); m.textContent = t; m.className = "note " + (cls || ""); };
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  let faceApi = null, faceLoading = null, faceFatal = "";
  let faceNorm = null, faceNormAt = 0;      // face in the shown cam (0..1), for aiming effects
  let streamUntil = 0, faceRunning = false, lastSeenAt = 0;
  let rawW = 0, rawH = 0;                   // the camera's own size (before the follow crop)
  let fcGoal = null, fcSending = false, followBusy = false;

  function loadScript(src) {
    return new Promise((res, rej) => { const sc = document.createElement("script"); sc.src = src; sc.onload = res; sc.onerror = () => rej(new Error("missing")); document.head.appendChild(sc); });
  }
  async function loadFace() {
    if (faceApi) return faceApi;
    if (faceFatal) throw new Error(faceFatal);
    if (!faceLoading) faceLoading = (async () => {
      if (!window.faceapi) await loadScript("face/face-api.js");
      if (!window.TOS_FACE_MODELS) await loadScript("face/face-models.js");
      const fa = window.faceapi, M = window.TOS_FACE_MODELS;
      try { await fa.tf.setBackend("webgl"); } catch (e) { try { await fa.tf.setBackend("cpu"); } catch (e2) {} }
      await fa.tf.ready();
      const loadNet = (net, name) => {
        const manifest = JSON.parse(M[name + "-weights_manifest.json"]);
        const bin = Uint8Array.from(atob(M[name + ".bin"]), c => c.charCodeAt(0));
        net.loadFromWeightMap(fa.tf.io.decodeWeights(bin.buffer, manifest.flatMap(g => g.weights)));
      };
      loadNet(fa.nets.tinyFaceDetector, "tiny_face_detector_model");
      loadNet(fa.nets.faceLandmark68TinyNet, "face_landmark_68_tiny_model");
      faceApi = fa;
      return fa;
    })().catch(e => {
      faceLoading = null;
      faceFatal = "Face tracking is part of the TOS HUB desktop app (it isn't in this preview copy).";
      fcMsg(faceFatal, "warn");
      throw new Error(faceFatal);
    });
    return faceLoading;
  }

  const avgPt = pts => pts.reduce((a, q) => ({ x: a.x + q.x / pts.length, y: a.y + q.y / pts.length }), { x: 0, y: 0 });
  // one look at the cam; returns the face in the shown cam (0..1) or null
  async function detectOnce() {
    if (C.trk.useFace === false) return null;   // face tracking switched off
    const fa = await loadFace();
    if (C.tos.on) return detectTos(fa);
    if (!ready() || !C.camSrc) return null;
    if (!camT) { const cam = await findItem(C.camSrc); if (!cam) return null; camT = await getT(cam); }
    const fcAt = fc ? Object.assign({}, fc) : null, t = camT;
    const r = await req("GetSourceScreenshot", { sourceName: C.camSrc, imageFormat: "jpg", imageWidth: 480, imageCompressionQuality: 75 });
    if (!r.imageData) return null;
    const im = new Image(); im.src = r.imageData; await im.decode();
    const det = await fa.detectSingleFace(im, new fa.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: .4 })).withFaceLandmarks(true);
    if (!det) { onNoFace(); return null; }
    const iw = im.naturalWidth, ih = im.naturalHeight, b = det.detection.box;
    const le = avgPt(det.landmarks.getLeftEye()), re = avgPt(det.landmarks.getRightEye());
    // the screenshot is the cam after OBS filters (so after the follow crop), in source pixels:
    const sw = t.sourceWidth, sh = t.sourceHeight, kx = sw / iw, ky = sh / ih;
    const src = { x: b.x * kx, y: b.y * ky, w: b.width * kx, h: b.height * ky, le: { x: le.x * kx, y: le.y * ky }, re: { x: re.x * kx, y: re.y * ky } };
    // ...in the part of the cam that's on stream (what the frame covers), 0..1
    const vx = t.cropLeft || 0, vy = t.cropTop || 0, vw = Math.max(1, sw - vx - (t.cropRight || 0)), vh = Math.max(1, sh - vy - (t.cropBottom || 0));
    const N = q => ({ x: (q.x - vx) / vw, y: (q.y - vy) / vh });
    const f = { x: (src.x - vx) / vw, y: (src.y - vy) / vh, w: src.w / vw, h: src.h / vh, le: N(src.le), re: N(src.re) };
    ["x", "y", "w", "h"].forEach(k => { f[k] = +f[k].toFixed(4); });
    faceNorm = f; faceNormAt = Date.now(); lastSeenAt = Date.now();
    faceBox = f; faceBoxAt = Date.now();
    if (Date.now() < streamUntil) sendFace(f);
    if (C.face.follow && fcAt && rawW) {
      // ...and in the camera's own pixels, to decide where the follow crop should go
      const cx = fcAt.l + src.x + src.w / 2, cy = fcAt.t + src.y + src.h / 2;
      aimFollow(cx, cy, src.h);
    }
    return f;
  }
  function onNoFace() {
    if (C.face.follow && rawW && Date.now() - lastSeenAt > 2500 && fc) aimFollow(rawW / 2, rawH / 2, 0);  // lost you: drift back to the middle
  }
  function sendFace(f) {
    toPreview({ type: "face", f });
    if (ready()) req("BroadcastCustomEvent", { eventData: { wizcam: true, type: "face", f } }).catch(() => {});
  }
  // the face right now, for an effect: a recent one, or a quick look
  async function faceNow() {
    if (faceNorm && Date.now() - faceNormAt < 1200) return faceNorm;
    if (C.tos.on) {   // the advanced tracker keeps this fresh
      if (!tosStream) return null;
      trkKick();
      for (let i = 0; i < 6 && !(faceNorm && Date.now() - faceNormAt < 400); i++) await sleep(60);
      return faceNorm && Date.now() - faceNormAt < 1200 ? faceNorm : null;
    }
    if (faceFatal || !ready() || !C.camSrc) return null;
    try { return await Promise.race([detectOnce(), sleep(700).then(() => null)]); } catch (e) { return null; }
  }
  function streamFace(ms) { streamUntil = Math.max(streamUntil, Date.now() + ms); if (C.tos.on) { if (typeof trkKick === "function") trkStart().catch(() => {}); } else faceLoop(); }
  const wantFace = () => !faceFatal && !C.tos.on && ready() && !!C.camSrc && (C.face.follow || Date.now() < streamUntil);   // TOS HUB camera mode has its own tracker
  async function faceLoop() {
    if (faceRunning || !wantFace()) return;
    faceRunning = true;
    try {
      while (wantFace()) {
        const t0 = performance.now();
        try { await detectOnce(); } catch (e) { if (faceFatal) break; await sleep(500); }
        await sleep(Math.max(15, (C.tos.on ? 66 : 110) - (performance.now() - t0)));   // 8 looks a second (15 with the TOS HUB camera)
      }
    } finally { faceRunning = false; }
  }
  setInterval(() => { if (wantFace()) faceLoop(); }, 1500);

  // ---- face follow (the moving crop) ----
  const SPEED = { slow: .05, normal: .1, fast: .2 };
  function followSize() {
    const z = clamp((C.face.zoom || 150) / 100, 1.05, 3);
    return [Math.round(rawW / z / 2) * 2, Math.round(rawH / z / 2) * 2];
  }
  function aimFollow(cx, cy, faceH) {
    const [cw, ch] = followSize();
    const l = clamp(cx - cw / 2, 0, rawW - cw), t = clamp(cy - ch * .45, 0, rawH - ch);
    if (fcGoal && Math.hypot(l - fcGoal.l, t - fcGoal.t) < cw * .03) return;   // small wobbles: stay still
    fcGoal = { l, t };
  }
  const cropSettings = q => ({ relative: true, left: q.l, top: q.t, right: q.r, bottom: q.b });
  // keeps the cam the same size on screen when the follow crop changes the picture's size
  async function keepSize(oldW, oldH, newW, newH) {
    const cam = await findItem(C.camSrc); if (!cam) return;
    const t = await getT(cam), fx = newW / oldW, fy = newH / oldH;
    const n = Object.assign({}, t, { cropLeft: t.cropLeft * fx, cropRight: t.cropRight * fx, cropTop: t.cropTop * fy, cropBottom: t.cropBottom * fy });
    if (!hasBounds(t)) { n.scaleX = t.scaleX / fx; n.scaleY = t.scaleY / fy; }
    await setT(cam, n);
    camT = Object.assign({}, t, clean(n), { sourceWidth: newW, sourceHeight: newH });
  }
  // move the crop a little towards where it should be, 25 times a second
  setInterval(async () => {
    if (!C.face.follow || !fc || !fcGoal || fcSending || !ready()) return;
    const k = SPEED[C.face.speed] || SPEED.normal;
    const cw = rawW - fc.l - fc.r, ch = rawH - fc.t - fc.b;   // size only changes in followZoomChanged
    let l = fc.l + (fcGoal.l - fc.l) * k, t = fc.t + (fcGoal.t - fc.t) * k;
    l = Math.round(clamp(l, 0, rawW - cw)); t = Math.round(clamp(t, 0, rawH - ch));
    if (l === fc.l && t === fc.t) return;
    const next = { l, t, r: rawW - cw - l, b: rawH - ch - t };
    fcSending = true;
    try { await req("SetSourceFilterSettings", { sourceName: C.camSrc, filterName: FRAMING, filterSettings: cropSettings(next) }); fc = next; }
    catch (e) {} finally { fcSending = false; }
  }, 40);

  async function filterList() { return ((await req("GetSourceFilterList", { sourceName: C.camSrc })).filters || []); }
  async function removeFraming() {
    const list = await filterList();
    const f = list.find(x => x.filterName === FRAMING);
    if (!f) { fc = null; return; }
    const cam = await findItem(C.camSrc);
    const before = cam ? await getT(cam) : null;
    const s = f.filterSettings || {};
    const l = s.left || 0, r = s.right || 0, t = s.top || 0, b = s.bottom || 0;
    await req("RemoveSourceFilter", { sourceName: C.camSrc, filterName: FRAMING });
    if (before && (l + r || t + b)) await keepSize(before.sourceWidth, before.sourceHeight, before.sourceWidth + l + r, before.sourceHeight + t + b);
    fc = null;
  }
  async function setFollow(on) {
    if (followBusy) return C.face.follow;
    if (C.tos.on) {   // in the TOS HUB camera, following is just a moving zoom inside it
      let err = "";
      C.face.follow = !!on;
      try { if (on) await trkStart(); } catch (e) { on = false; err = e.message; }
      C.face.follow = !!on; save(); $("#fcFollow").checked = C.face.follow;
      tosAim = null; sendView();
      if (on) fcMsg("Face follow is on ✓ Move around and the cam follows you.", "ok"); else fcMsg(err || "Face follow is off.", err ? "err" : "");
      return C.face.follow;
    }
    if (on && !ready()) { fcMsg("Connect OBS first (click the OBS badge at the top).", "err"); $("#fcFollow").checked = false; return false; }
    if (on && !C.camSrc) { fcMsg("Pick your webcam source first.", "err"); $("#fcFollow").checked = false; return false; }
    followBusy = true;
    try {
      if (on) {
        await loadFace();
        const cam = await findItem(C.camSrc);
        if (!cam) throw new Error("Your webcam isn't in the scene that's live right now.");
        await removeFraming();
        const t = await getT(cam);
        rawW = t.sourceWidth; rawH = t.sourceHeight;
        if (!rawW || !rawH) throw new Error("OBS isn't getting a picture from your webcam.");
        zoomBase = null; setZoomUi(100);
        const [cw, ch] = followSize();
        const start = { l: Math.round((rawW - cw) / 2), t: Math.round((rawH - ch) / 2) };
        start.r = rawW - cw - start.l; start.b = rawH - ch - start.t;
        await req("CreateSourceFilter", { sourceName: C.camSrc, filterName: FRAMING, filterKind: "crop_filter", filterSettings: cropSettings(start) });
        try { await req("SetSourceFilterIndex", { sourceName: C.camSrc, filterName: FRAMING, filterIndex: 0 }); } catch (e) {}  // before the shape mask
        fc = start; fcGoal = null; lastSeenAt = Date.now();
        await keepSize(rawW, rawH, cw, ch);
        C.face.follow = true; save();
        lastMaskKey = ""; scheduleShape(true);
        fcMsg("Face follow is on ✓ Move around and the cam follows you.", "ok");
        faceLoop();
      } else {
        C.face.follow = false; save();
        if (ready() && C.camSrc) await removeFraming();
        fc = null; fcGoal = null;
        lastMaskKey = ""; scheduleShape(true);
        fcMsg("Face follow is off.", "");
      }
    } catch (e) {
      C.face.follow = false; save();
      if (!faceFatal) fcMsg("Couldn't start face follow: " + e.message, "err");
    } finally { followBusy = false; $("#fcFollow").checked = !!C.face.follow; layoutStage(); }
    return C.face.follow;
  }
  // new follow zoom: resize the crop around where it is now
  async function followZoomChanged() {
    if (C.tos.on) { sendView(); return; }
    if (!C.face.follow || !fc || !ready()) return;
    const oldW = rawW - fc.l - fc.r, oldH = rawH - fc.t - fc.b;
    const [cw, ch] = followSize();
    if (cw === oldW && ch === oldH) return;
    const cx = fc.l + oldW / 2, cy = fc.t + oldH / 2;
    const l = Math.round(clamp(cx - cw / 2, 0, rawW - cw)), t = Math.round(clamp(cy - ch / 2, 0, rawH - ch));
    const next = { l, t, r: rawW - cw - l, b: rawH - ch - t };
    fcSending = true;
    try {
      await req("SetSourceFilterSettings", { sourceName: C.camSrc, filterName: FRAMING, filterSettings: cropSettings(next) });
      fc = next; fcGoal = null;
      await keepSize(oldW, oldH, cw, ch);
      lastMaskKey = ""; scheduleShape(true);
    } catch (e) {} finally { fcSending = false; }
  }
  // when OBS connects: pick up a follow crop that's already there, or clear a leftover one
  async function syncFollow() {
    if (!ready() || !C.camSrc) return;
    try {
      const f = (await filterList()).find(x => x.filterName === FRAMING);
      if (!f) { fc = null; if (C.face.follow) { C.face.follow = false; save(); setFollow(true); } return; }
      if (!C.face.follow) { await removeFraming(); scheduleShape(true); return; }
      const s = f.filterSettings || {}, cam = await findItem(C.camSrc); if (!cam) return;
      const t = await getT(cam);
      fc = { l: s.left || 0, t: s.top || 0, r: s.right || 0, b: s.bottom || 0 };
      rawW = t.sourceWidth + fc.l + fc.r; rawH = t.sourceHeight + fc.t + fc.b;
      faceLoop();
    } catch (e) {}
  }
  let followSynced = false;
  setInterval(() => { if (!ready()) { followSynced = false; return; } if (!followSynced && C.camSrc) { followSynced = true; syncFollow(); } }, 1500);

  function bindFace() {
    const F = C.face;
    $("#fcFollow").checked = !!F.follow;
    $("#fcFollow").onchange = () => setFollow($("#fcFollow").checked);
    const zv = () => { $("#fcZoomV").textContent = (F.zoom / 100).toFixed(2).replace(/0$/, "") + "×"; };
    $("#fcZoom").value = F.zoom; zv();
    let zt = null;
    $("#fcZoom").oninput = () => { F.zoom = +$("#fcZoom").value; zv(); save(); clearTimeout(zt); zt = setTimeout(followZoomChanged, 250); };
    $("#fcSpeed").value = F.speed; $("#fcSpeed").onchange = () => { F.speed = $("#fcSpeed").value; save(); };
    $("#fcAim").checked = !!F.aim; $("#fcAim").onchange = () => { F.aim = $("#fcAim").checked; save(); };
    $("#fcBox").checked = !!F.box; $("#fcBox").onchange = () => { F.box = $("#fcBox").checked; save(); draw(); };
  }
  bindFace();

  // ================= reset camera =================
  // Undoes everything TOS HUB did to the cam: shape mask, face follow crop, zoom and crop.
  let resetArm = 0;
  $("#camReset").onclick = async () => {
    const b = $("#camReset");
    if (Date.now() - resetArm > 3000) { resetArm = Date.now(); b.textContent = "Click again to reset"; setTimeout(() => { if (Date.now() - resetArm >= 2900) b.textContent = "Reset camera"; }, 3000); return; }
    resetArm = 0; b.textContent = "Reset camera";
    if (C.tos.on) {
      tosZoom = 1; setZoomUi(100);
      if (C.face.follow) await setFollow(false);
      C.look.shape = "square"; save(); syncShapeUi(); pushLook();
      if (ready()) { try { await tosResize(false); } catch (e) {} }
      sendView(true);
      frMsg("Camera reset ✓ Shape, face follow and zoom are back to normal.");
      return;
    }
    if (!ready()) { frMsg("Connect OBS on the Connections tab first.", true); return; }
    const cam = await findItem(C.camSrc);
    if (!cam) { frMsg("Pick your webcam source first (it needs to be in the live scene).", true); return; }
    b.disabled = true;
    try {
      if (C.face.follow) await setFollow(false); else await removeFraming();
      const list = await filterList();
      if (list.some(f => f.filterName === SHAPE_FILTER)) await req("RemoveSourceFilter", { sourceName: C.camSrc, filterName: SHAPE_FILTER });
      const t = await getT(cam), [w0] = shown(t);
      const n = Object.assign({}, t, { cropLeft: 0, cropRight: 0, cropTop: 0, cropBottom: 0 });
      if (hasBounds(t)) { if (t.boundsType === "OBS_BOUNDS_STRETCH") n.boundsHeight = t.boundsWidth * t.sourceHeight / Math.max(1, t.sourceWidth); }
      else { const s = w0 / Math.max(1, t.sourceWidth); n.scaleX = s; n.scaleY = s; }   // same width as before, no squashing
      await setT(cam, n);
      zoomBase = null; setZoomUi(100);
      C.look.shape = "square"; save(); syncShapeUi(); pushLook();
      lastMaskKey = ""; scheduleShape(true);   // makes sure no shape mask comes back
      camT = await getT(cam);
      await frameFollow(camT, { resize: true });
      layoutStage();
      shpMsg("Square corners.");
      frMsg("Camera reset ✓ Shape, face follow, zoom and crop are back to normal.");
    } catch (e) { frMsg("OBS said: " + e.message, true); }
    finally { b.disabled = false; }
  };

