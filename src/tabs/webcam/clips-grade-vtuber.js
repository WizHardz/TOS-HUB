  // ================= auto clips (OBS replay buffer) =================
  let clipLast = 0, clipWhy = "";
  const clipList = ls.get("streamhub.clips", []) || [];
  function clipMoment(why) {
    const c = C.trk.clip;
    if (!c.on || !ready() || !c[why === "loud" ? "loud" : why === "spell" ? "spell" : "raid"]) return;
    if (Date.now() - clipLast < 30000) return;
    clipLast = Date.now(); clipWhy = why;
    setTimeout(async () => {   // wait a few seconds so the clip shows what happened next too
      try { await req("SaveReplayBuffer"); clipMsg("Saving a clip…", "ok"); }
      catch (e) { clipMsg("OBS couldn't save a clip: turn on the replay buffer (button below).", "err"); }
    }, (c.delay || 4) * 1000);
  }
  window.addEventListener("obs-replay-saved", e => {
    const path = e.detail || "";
    clipList.unshift({ at: Date.now(), path, why: clipWhy || "manual" }); clipWhy = "";
    clipList.splice(20); ls.set("streamhub.clips", clipList); renderClips();
    clipMsg("Clip saved ✓", "ok");
  });
  const clipMsg = (t, cls) => { const m = $("#clipMsg"); if (m) { m.textContent = t; m.className = "note " + (cls || ""); } };
  function renderClips() {
    const box = $("#clipList"); if (!box) return; box.innerHTML = "";
    if (!clipList.length) { box.append(el("span", "note", "No clips yet.")); return; }
    const WHY = { loud: "🔊 big moment", spell: "🪄 spell", raid: "🚀 raid", manual: "🎬 saved by you" };
    clipList.forEach(c => {
      const row = el("div", "cliprow");
      row.append(el("span", "", new Date(c.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })), el("span", "", WHY[c.why] || c.why), el("span", "clipname", (c.path || "").split(/[\\/]/).pop()));
      if (window.tosHub && window.tosHub.showFile && c.path) { const b = el("button", "ghost", "Show"); b.onclick = () => window.tosHub.showFile(c.path); row.append(b); }
      box.append(row);
    });
  }
  async function clipStatus() {
    if (!ready()) { clipMsg("Connect OBS to use auto clips.", "warn"); return; }
    try { const r = await req("GetReplayBufferStatus"); $("#clipBuf").textContent = r.outputActive ? "Replay buffer is on ✓" : "Turn on OBS replay buffer"; $("#clipBuf").disabled = !!r.outputActive; }
    catch (e) { $("#clipBuf").textContent = "Turn on OBS replay buffer"; $("#clipBuf").disabled = false; }
  }
  (window.hubChatHooks = window.hubChatHooks || []).push(m => { if (m.command === "USERNOTICE" && (m.tags || {})["msg-id"] === "raid") clipMoment("raid"); });

  // ================= colour grade in normal (OBS webcam) mode =================
  const GRADE_FILTER = "TOS HUB grade";
  const OBS_GRADES = {
    cine: { contrast: .15, saturation: -.15, brightness: -.02, color_multiply: 0xFFE8F0FF },
    vhs: { contrast: .08, saturation: .35, gamma: .1 },
    neon: { contrast: .15, saturation: .8, brightness: .03 },
    bw: { contrast: .25, saturation: -1 },
    warm: { saturation: .2, hue_shift: -6, color_multiply: 0xFFD6E6FF },
    cool: { saturation: -.05, hue_shift: 8, color_multiply: 0xFFFFEAD6 }
  };
  async function obsGrade() {
    if (C.tos.on || !ready() || !C.camSrc) return;
    try {
      const list = ((await req("GetSourceFilterList", { sourceName: C.camSrc })).filters || []);
      const has = list.some(f => f.filterName === GRADE_FILTER), g = OBS_GRADES[C.trk.grade];
      if (!g) { if (has) await req("RemoveSourceFilter", { sourceName: C.camSrc, filterName: GRADE_FILTER }); return; }
      const settings = Object.assign({ gamma: 0, contrast: 0, brightness: 0, saturation: 0, hue_shift: 0, opacity: 1, color_multiply: 0xFFFFFFFF }, g);
      if (has) await req("SetSourceFilterSettings", { sourceName: C.camSrc, filterName: GRADE_FILTER, filterSettings: settings, overlay: false });
      else await req("CreateSourceFilter", { sourceName: C.camSrc, filterName: GRADE_FILTER, filterKind: "color_filter_v2", filterSettings: settings });
    } catch (e) { trkMsg("Couldn't set the colour grade in OBS: " + e.message, "err"); }
  }

  // ================= VTuber: your own 3D avatar (VRM) =================
  const vr = { lib: null, renderer: null, scene: null, camera: null, vrm: null, canvas: null, name: "", clock: 0, head: { x: 0, y: 0, z: 0 }, loading: null };
  function idb() {
    return new Promise((res, rej) => { const r = indexedDB.open("tos-hub", 1); r.onupgradeneeded = () => r.result.createObjectStore("files"); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
  }
  async function idbPut(key, val) { const db = await idb(); return new Promise((res, rej) => { const t = db.transaction("files", "readwrite"); t.objectStore("files").put(val, key); t.oncomplete = res; t.onerror = () => rej(t.error); }); }
  async function idbGet(key) { const db = await idb(); return new Promise((res, rej) => { const t = db.transaction("files", "readonly"); const r = t.objectStore("files").get(key); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }); }
  const avMsg = (t, cls) => { const m = $("#avMsg"); if (m) { m.textContent = t; m.className = "note " + (cls || ""); } };
  let vrmQueue = Promise.resolve();
  function vrmLoad(buf, name) {   // one at a time, so two loads can't both end up on screen
    const job = vrmQueue.then(() => vrmLoadNow(buf, name));
    vrmQueue = job.catch(() => {});
    return job;
  }
  async function vrmLoadNow(buf, name) {
    if (!window.TOSVRM) await loadScript2("vtuber/vrm-bundle.js");
    const { THREE, GLTFLoader, VRMLoaderPlugin, VRMUtils } = window.TOSVRM;
    if (!vr.renderer) {
      vr.canvas = document.createElement("canvas");
      vr.renderer = new THREE.WebGLRenderer({ canvas: vr.canvas, alpha: true, antialias: true, preserveDrawingBuffer: true });
      vr.renderer.setClearColor(0x000000, 0);
      vr.renderer.outputColorSpace = THREE.SRGBColorSpace;
      vr.scene = new THREE.Scene();
      vr.camera = new THREE.PerspectiveCamera(24, 16 / 9, .05, 20);
      const sun = new THREE.DirectionalLight(0xffffff, 2.2); sun.position.set(.6, 1.4, 2); vr.scene.add(sun);
      vr.scene.add(new THREE.AmbientLight(0xffffff, .9));
    }
    const loader = new GLTFLoader(); loader.register(p => new VRMLoaderPlugin(p));
    const gltf = await loader.parseAsync(buf, "");
    const vrm = gltf.userData.vrm;
    if (!vrm) throw new Error("That file isn't a VRM avatar.");
    if (vr.vrm) { vr.scene.remove(vr.vrm.scene); try { VRMUtils.deepDispose(vr.vrm.scene); } catch (e) {} vr.vrm = null; }
    try { VRMUtils.removeUnnecessaryVertices(gltf.scene); } catch (e) {}
    try { (VRMUtils.combineSkeletons || VRMUtils.removeUnnecessaryJoints)(gltf.scene); } catch (e) {}
    VRMUtils.rotateVRM0(vrm);
    vr.scene.add(vrm.scene); vr.vrm = vrm; vr.name = name || "avatar";
    // arms down from the T-pose, and frame head and shoulders
    const hb = n => vrm.humanoid && vrm.humanoid.getNormalizedBoneNode(n);
    // arms down from the T-pose; models differ in which way is "down", so try it and check where the hand ended up
    const wp = o => { const v = new THREE.Vector3(); o.getWorldPosition(v); return v; };
    [["leftUpperArm", "leftLowerArm", "leftHand", -1], ["rightUpperArm", "rightLowerArm", "rightHand", 1]].forEach(([up, low, hand, sgn]) => {
      const U = hb(up); if (!U) return;
      const raw = n => (vrm.humanoid.getRawBoneNode && vrm.humanoid.getRawBoneNode(n)) || hb(n);
      const handY = z => { U.rotation.set(0, 0, z); if (hb(low)) hb(low).rotation.set(0, 0, 0); vrm.humanoid.update(); vrm.scene.updateMatrixWorld(true); const H = raw(hand) || raw(low); return H ? wp(H).y : 0; };
      const z = handY(sgn * 1.15) <= handY(-sgn * 1.15) ? sgn * 1.15 : -sgn * 1.15;
      U.rotation.set(0, 0, z);
      if (hb(low)) hb(low).rotation.z = Math.sign(z) * .15;
      vr.arms = vr.arms || {}; vr.arms[up] = U.rotation.z;
    });
    vrm.humanoid.update(); vrm.scene.updateMatrixWorld(true);
    const hp = new THREE.Vector3(); (hb("head") || vrm.scene).getWorldPosition(hp);
    vr.camera.position.set(0, hp.y - .02, 1.6); vr.camera.lookAt(0, hp.y - .07, 0);   // head and shoulders, head in the top third
    if (vrm.lookAt) vrm.lookAt.autoUpdate = false;
    return vrm;
  }
  async function vrmFromStore() {
    if (vr.vrm) return vr.vrm;
    if (vr.loading) return vr.loading;
    vr.loading = (async () => { await vrmQueue; if (vr.vrm) return vr.vrm; const it = await idbGet("avatar.vrm"); if (!it) throw new Error("Load a VRM file first."); return vrmLoad(it.buf, it.name); })().finally(() => { vr.loading = null; });
    return vr.loading;
  }
  function vrmDrive(face, dt, body) {
    const vrm = vr.vrm; if (!vrm) return;
    const { THREE } = window.TOSVRM;
    const VW = tosVid.videoWidth || 1280, VH = tosVid.videoHeight || 720;
    if (vr.canvas.width !== VW || vr.canvas.height !== VH) { vr.renderer.setSize(VW, VH, false); vr.camera.aspect = VW / VH; vr.camera.updateProjectionMatrix(); }
    const b = face ? face.blend : {}, mir = !!C.tos.mirror, k = Math.min(1, dt * 12);
    const em = vrm.expressionManager, set = (n, v) => { try { em && em.setValue(n, Math.max(0, Math.min(1, v || 0))); } catch (e) {} };
    if (face) {
      const L = mir ? "Right" : "Left", Rr = mir ? "Left" : "Right";
      set("blinkLeft", b["eyeBlink" + Rr] * 1.15); set("blinkRight", b["eyeBlink" + L] * 1.15);   // the avatar faces you, like a mirror
      set("aa", (b.jawOpen || 0) * 1.3); set("ou", (b.mouthPucker || 0) * .9); set("oh", (b.mouthFunnel || 0) * .9);
      set("ee", ((b.mouthStretchLeft || 0) + (b.mouthStretchRight || 0)) * .6);
      set("happy", ((b.mouthSmileLeft || 0) + (b.mouthSmileRight || 0)) / 2 * .9);
      set("angry", ((b.browDownLeft || 0) + (b.browDownRight || 0)) / 2 * .8);
      set("sad", ((b.mouthFrownLeft || 0) + (b.mouthFrownRight || 0)) / 2);
      set("surprised", ((b.browInnerUp || 0) + ((b.eyeWideLeft || 0) + (b.eyeWideRight || 0)) / 2) / 2);
      const want = { x: -face.pitch * .55, y: (mir ? 1 : -1) * face.yaw * .9, z: (mir ? 1 : -1) * face.roll };
      ["x", "y", "z"].forEach(a => { vr.head[a] += (want[a] - vr.head[a]) * k; });
      if (vrm.lookAt) { vrm.lookAt.yaw = (mir ? 1 : -1) * face.gx * 18; vrm.lookAt.pitch = -face.gy * 10; }
    }
    const hb = n => vrm.humanoid && vrm.humanoid.getNormalizedBoneNode(n);
    const head = hb("head"), neck = hb("neck"), spine = hb("spine"), chest = hb("chest") || hb("upperChest");
    if (head) head.rotation.set(vr.head.x * .65, vr.head.y * .65, vr.head.z * .65);
    if (neck) neck.rotation.set(vr.head.x * .35, vr.head.y * .35, vr.head.z * .35);
    vr.clock += dt;
    if (spine) spine.rotation.set(Math.sin(vr.clock * 1.4) * .015, vr.head.y * .12, vr.head.z * .1);
    if (chest) chest.rotation.x = Math.sin(vr.clock * 1.6) * .012;   // breathing
    vrmBody(vrm, body, hb, Math.min(1, dt * 10), chest);
    if (face && C.trk.avFollow !== false) vrm.scene.position.x = (mir ? -1 : 1) * -((face.box.x + face.box.w / 2) - .5) * .25;
    if (em) em.update();
    vrm.update(dt);
    vr.renderer.render(vr.scene, vr.camera);
  }
  // full-body tracking → the avatar's arms and shoulder lean. Worked out as the picture is shown (mirrored or not),
  // so the avatar moves like your reflection when "Mirror the picture" is on.
  function vrmBody(vrm, body, hb, k, chest) {
    vr.bodyT = vr.bodyT || {};
    const ease = (key, want) => { const cur = vr.bodyT[key] == null ? want : vr.bodyT[key]; return (vr.bodyT[key] = cur + (want - cur) * k); };
    const A = (tosVid.videoWidth || 16) / (tosVid.videoHeight || 9), mir = !!C.tos.mirror;
    const P = body && body.pts, ok = i => P && P[i].v > .5;
    const X = i => (mir ? 1 - P[i].x : P[i].x) * A, Y = i => P[i].y;
    // which of your arms shows on the left of the picture (the avatar's right arm faces that way)
    let leftChain = [12, 14, 16], rightChain = [11, 13, 15];
    if (P && ok(11) && ok(12) && X(11) < X(12)) [leftChain, rightChain] = [rightChain, leftChain];
    [["rightUpperArm", "rightLowerArm", leftChain, 1], ["leftUpperArm", "leftLowerArm", rightChain, -1]].forEach(([up, low, [s, e, w], sgn]) => {
      const U = hb(up), Lw = hb(low); if (!U) return;
      const rest = (vr.arms && vr.arms[up]) || sgn * 1.15, flip = Math.sign(rest) === sgn ? 1 : -1;
      let zu = rest, zl = Math.sign(rest) * .15;
      const ang = (a, b) => { const dx = X(b) - X(a), dy = -(Y(b) - Y(a)); return sgn > 0 ? Math.atan2(-dy, -dx) : Math.atan2(dy, dx); };
      if (ok(s) && ok(e)) {
        const au = ang(s, e); zu = au * flip;
        if (ok(w)) { let rel = ang(e, w) - au; rel = Math.atan2(Math.sin(rel), Math.cos(rel)); zl = rel * flip; }
      }
      U.rotation.set(0, 0, ease(up, zu));
      if (Lw) Lw.rotation.set(0, 0, ease(low, zl));
    });
    // shoulders tilting = the avatar leans the same way
    let tilt = 0;
    if (P && ok(11) && ok(12)) { const [a, b] = X(11) < X(12) ? [11, 12] : [12, 11]; tilt = Math.max(-.4, Math.min(.4, Math.atan2(-(Y(b) - Y(a)), X(b) - X(a)) * .8)); }
    if (chest) chest.rotation.z = ease("chestZ", tilt);
  }

  // the avatar travels to OBS the same way the background cut-out does: picture + see-through mask
  function vrmPack() {
    const VW = vr.canvas.width, VH = vr.canvas.height, PH = Math.round(VH * 1.25);
    if (packCv.width !== VW || packCv.height !== PH) { packCv.width = VW; packCv.height = PH; }
    const mw = Math.round(VW / 4), mh = Math.round(VH / 4);
    if (maskCv.width !== mw || maskCv.height !== mh) { maskCv.width = mw; maskCv.height = mh; }
    packX.fillStyle = "#000"; packX.fillRect(0, 0, VW, PH);
    packX.drawImage(vr.canvas, 0, 0, VW, VH);
    maskX.globalCompositeOperation = "source-over"; maskX.clearRect(0, 0, mw, mh);
    maskX.drawImage(vr.canvas, 0, 0, mw, mh);
    maskX.globalCompositeOperation = "source-in"; maskX.fillStyle = "#fff"; maskX.fillRect(0, 0, mw, mh);
    packX.drawImage(maskCv, 0, VH);
    if (packTrack && packTrack.requestFrame) packTrack.requestFrame();
    if (!packLive) usePacked(true);
  }

  // ---- settings ----
  function bindTrk() {
    const T = C.trk;
    const chk = (id, k, after) => { const i = $(id); i.checked = !!T[k]; i.onchange = () => { T[k] = i.checked; save(); if (after) after(); trkChanged(); }; };
    chk("#trkMesh", "mesh"); chk("#trkExpr", "expr"); chk("#trkHands", "hands"); chk("#trkBehind", "behind", pushLook);
    $("#trkBg").value = T.bg; $("#trkBg").onchange = () => { T.bg = $("#trkBg").value; save(); pushLook(); syncBgUi(); trkChanged(); };
    $("#trkBlur").value = T.blur; $("#trkBlurV").textContent = T.blur + "px";
    $("#trkBlur").oninput = () => { T.blur = +$("#trkBlur").value; $("#trkBlurV").textContent = T.blur + "px"; save(); pushLook(); };
    const emNote = () => $("#trkEmNote").classList.toggle("hide", !/^em/.test(T.paint));
    $("#trkPaint").value = T.paint; emNote(); $("#trkPaint").onchange = () => { T.paint = $("#trkPaint").value; save(); pushLook(); trkChanged(); emNote(); };
    $("#trkEngine").value = T.engine || "auto";
    $("#trkEngine").onchange = () => { T.engine = $("#trkEngine").value; save(); trkReset(); trkChanged(); };
    $("#trkSens").value = T.sens; $("#trkSens").oninput = () => { T.sens = +$("#trkSens").value; save(); };
    $("#trkCd").value = T.cd; $("#trkCd").oninput = () => { T.cd = Math.max(1, +$("#trkCd").value || 5); save(); };
    const fxOpts = (sel, val, extra) => { sel.innerHTML = ""; sel.append(opt("", "Nothing", !val)); (extra || []).forEach(([v, t]) => sel.append(opt(v, t, val === v))); tosFxOptions(sel, EFFECTS.filter(([e]) => e !== "shake"), val); };
    const eg = $("#exprGrid"); eg.innerHTML = "";
    EXPR.forEach(([k, label]) => { const row = el("div", "maprow"); row.append(el("span", "", label)); const s2 = document.createElement("select"); fxOpts(s2, T.exprMap[k]); s2.onchange = () => { T.exprMap[k] = s2.value; save(); }; row.append(s2); eg.append(row); });
    const gg = $("#gestGrid"); gg.innerHTML = "";
    GEST.forEach(([k, label]) => { const row = el("div", "maprow"); row.append(el("span", "", label)); const s2 = document.createElement("select"); fxOpts(s2, T.gestMap[k], k === "pinch" ? [["trail", "✨ Sparkle trail (follows your fingers)"]] : []); s2.onchange = () => { T.gestMap[k] = s2.value; save(); }; row.append(s2); gg.append(row); });
    $("#trkBgFile").onchange = async () => {
      const f = $("#trkBgFile").files[0]; if (!f) return;
      const im = new Image(); im.src = URL.createObjectURL(f); await im.decode().catch(() => {});
      const c = document.createElement("canvas"), k = Math.min(1, 1280 / Math.max(im.width, im.height));
      c.width = Math.round(im.width * k); c.height = Math.round(im.height * k); c.getContext("2d").drawImage(im, 0, 0, c.width, c.height);
      T.bgImage = c.toDataURL("image/jpeg", .85); T.bg = "image"; $("#trkBg").value = "image"; save(); pushLook(); sendBgImage(); syncBgUi(); trkChanged();
      $("#trkBgFile").value = "";
    };
    $("#trkBgBtn").onclick = () => $("#trkBgFile").click();
    const rng2 = (id, get, setv, out, fmt, after) => { const i = $(id); i.value = get(); const show = () => { if (out) $(out).textContent = fmt(get()); }; show(); i.oninput = () => { setv(+i.value); show(); save(); if (after) after(); }; };
    const chk2 = (id, get, setv, after) => { const i = $(id); i.checked = !!get(); i.onchange = () => { setv(i.checked); save(); if (after) after(); trkChanged(); }; };
    const sel2 = (id, get, setv, after) => { const i = $(id); i.value = String(get()); i.onchange = () => { setv(i.value); save(); if (after) after(); trkChanged(); }; };
    rng2("#trkSmooth", () => T.smooth, v => T.smooth = v, "#trkSmoothV", v => v + "%");
    rng2("#trkSoft", () => T.soft, v => T.soft = v, "#trkSoftV", v => v + "px");
    rng2("#trkCut", () => T.cut, v => T.cut = v, "#trkCutV", v => (v > 0 ? "+" : "") + v, pushLook);
    sel2("#trkFraming", () => T.framing, v => T.framing = v, () => { tosAim = null; });
    sel2("#trkFaces", () => T.faces, v => T.faces = +v);
    chk2("#trkLean", () => T.lean, v => T.lean = v); chk2("#trkBoth", () => T.both, v => T.both = v, pushLook);
    chk2("#trkSpells", () => T.spells, v => T.spells = v); rng2("#trkSpellSens", () => T.spellSens, v => T.spellSens = v);
    chk2("#trkFireball", () => T.fireball, v => T.fireball = v); chk2("#trkWand", () => T.wand, v => T.wand = v);
    chk2("#trkMood", () => T.mood, v => T.mood = v);
    chk2("#trkBody", () => T.body, v => T.body = v, pushLook); chk2("#trkBodyAv", () => T.bodyAv !== false, v => T.bodyAv = v);
    chk2("#trkPoseFx", () => T.poseFx, v => T.poseFx = v);
    [["#useFace", "useFace"], ["#useHands", "useHands"], ["#useBody", "useBody"], ["#useSeg", "useSeg"]].forEach(([id, k]) => chk2(id, () => T[k] !== false, v => T[k] = v, () => { pushLook(); window.dispatchEvent(new Event("tos-needs")); }));
    chk2("#drawOn", () => !!T.draw, v => T.draw = v, () => { pushLook(); if (T.draw && !C.tos.on) frMsg("Drawing in the air needs the TOS HUB camera: switch to it at the top of the Camera section.", true); });
    sel2("#drawCol", () => T.drawCol || "rainbow", v => T.drawCol = v, pushLook);
    sel2("#drawStyle", () => T.drawStyle || "neon", v => T.drawStyle = v, pushLook);
    sel2("#drawFade", () => String(+T.drawFade || 0), v => T.drawFade = +v, pushLook);
    rng2("#drawSize", () => T.drawSize || 8, v => T.drawSize = v, "#drawSizeV", v => v + "px", pushLook);
    chk2("#drawPalm", () => T.drawPalm !== false, v => T.drawPalm = v, pushLook);
    $("#drawClear").onclick = () => toCam({ type: "drawclear" });
    objWire();
    $("#scrAdd").onclick = () => screenAdd(false); $("#scrAll").onclick = () => screenAdd(true);
    const bodyCustom = () => $("#trkBodyCustom").classList.toggle("hide", T.bodyCol !== "custom");
    sel2("#trkBodyCol", () => T.bodyCol || "theme", v => T.bodyCol = v, () => { bodyCustom(); pushLook(); }); bodyCustom();
    ["C1", "C2"].forEach(k => { const i = $("#trkBody" + k); i.value = T["body" + k] || (k === "C1" ? "#2ff3ff" : "#b14dff"); i.oninput = () => { T["body" + k] = i.value; save(); pushLook(); }; });
    rng2("#trkBodyStr", () => T.bodyStr == null ? 100 : T.bodyStr, v => T.bodyStr = v, "#trkBodyStrV", v => v + "%", pushLook);
    rng2("#trkBodySize", () => T.bodySize == null ? 100 : T.bodySize, v => T.bodySize = v, "#trkBodySizeV", v => v + "%", pushLook);
    rng2("#trkBodyPulse", () => T.bodyPulse == null ? 50 : T.bodyPulse, v => T.bodyPulse = v, "#trkBodyPulseV", v => v ? v + "%" : "steady", pushLook);
    $("#trkPalmBoth").value = T.palmBoth ? "1" : ""; $("#trkPalmBoth").onchange = () => { T.palmBoth = !!$("#trkPalmBoth").value; save(); };
    chk2("#trkPalmFlip", () => !!T.palmFlip, v => T.palmFlip = v);
    chk2("#trkPinchTrail", () => !!T.pinchTrail, v => { T.pinchTrail = v; if (v) T.hands = true; });
    chk2("#trkHandsAlways", () => !!T.handsAlways, v => T.handsAlways = v);
    $("#handView").onclick = () => { $("#camDbg").click(); };
    $("#handRules").onclick = () => { if (window.hubGoRules) window.hubGoRules("track"); };
    setInterval(() => {
      const st = $("#handStat"); if (!st || !st.offsetParent) return;
      const name = g => g === "point" ? "☝️ pointing" : /^my_/.test(g) ? "⭐ " + (((window.hubCustom && window.hubCustom.myG().find(x => "my_" + x.id === g)) || {}).name || "yours") : ((GEST.find(x => x[0] === g) || [, ""])[1] || "").toLowerCase();
      let t, cls = "";
      if (T.useHands === false) { t = "✋ Hand tracking is switched off (What to track, above)."; cls = "warn"; }
      else if (!C.tos.on) { t = "Hand tracking works with the ✨ TOS HUB camera (Camera tab)."; cls = "warn"; }
      else if (!handsRunning) t = "💤 Resting: nothing needs your hands right now. Add a hand trigger, turn on drawing, or tick “Keep tracking my hands all the time”.";
      else if (!lastHands.length) t = "👀 Looking for your hands… hold them up where the camera can see them.";
      else { t = `✋ ${lastHands.length} hand${lastHands.length > 1 ? "s" : ""} seen: ` + lastHands.map(h => `${/left/i.test(h.side) ? "left hand" : /right/i.test(h.side) ? "right hand" : "hand"}${h.g ? " (" + name(h.g) + ")" : ""}`).join(" · "); cls = "ok"; }
      st.textContent = t; st.className = "note hstat " + cls;
    }, 500);
    sel2("#trkBodyFx", () => T.bodyFx, v => T.bodyFx = v, () => { if (T.bodyFx !== "none" && !T.body) { T.body = true; $("#trkBody").checked = true; save(); } pushLook(); });
    sel2("#trkQuality", () => T.quality || "fast", v => T.quality = v);
    chk2("#trkPredict", () => T.predict !== false, v => T.predict = v, pushLook);
    chk2("#trkAuto", () => T.autoPerf !== false, v => T.autoPerf = v, () => perfUpdate());
    $("#trkMoodCd").value = T.moodCd; $("#trkMoodCd").oninput = () => { T.moodCd = Math.max(3, +$("#trkMoodCd").value || 12); save(); };
    const grid = (box, rows, map, extra) => { const g = $(box); g.innerHTML = ""; rows.forEach(([k, label]) => { const row = el("div", "maprow"); row.append(el("span", "", label)); const s2 = document.createElement("select"); fxOpts(s2, map[k], extra); s2.onchange = () => { map[k] = s2.value; save(); }; row.append(s2); g.append(row); }); };
    grid("#spellGrid", SPELLS, T.spellMap);
    grid("#poseGrid", POSES, T.poseMap);
    chk2("#comboOn", () => T.combosOn !== false, v => T.combosOn = v);
    renderCombos();
    $("#comboAdd").onclick = () => { T.combos = T.combos || []; T.combos.push({ a: "mic:clap", b: "pose:up", fx: "confetti" }); save(); renderCombos(); };
    grid("#moodGrid", MOODS.map(([k, l]) => [k, l]), T.moodMap);
    grid("#micGrid", [["shout", "🗣️ Shouting"], ["bang", "💥 Sudden bang"], ["laugh", "😂 Laughing"], ["clap", "👏 Clapping"], ["click", "🫰 Finger snap / click"]], T.mic, [["punch", "🎥 Punch in + shake the cam"]]);
    chk2("#micOn", () => T.mic.on, v => T.mic.on = v, micSync);
    rng2("#micThr", () => T.mic.thr, v => T.mic.thr = v, "#micThrV", v => v + " dB", micMark);
    micMark(); $("#micCal").onclick = micCalibrate;
    $("#micDev").onchange = () => { T.mic.dev = $("#micDev").value; T.mic.picked = true; save(); micStop(); micSync(); micHint(); };
    $("#micCh").value = T.mic.ch || "all";
    $("#micCh").onchange = () => { T.mic.ch = $("#micCh").value; save(); if (mic.stream) { micStop(); micSync(); } else micChNote(); };
    $("#micProfile").value = T.mic.profile || "";
    $("#micProfile").onchange = () => {
      T.mic.profile = $("#micProfile").value; save();
      micMsg(T.mic.profile === "sm7b" ? "Tuned for an SM7B through a RØDECaster: the start of a word and desk knocks won't count as claps or bangs. Now click “Set from my voice” so the shout level matches your gain." : "Back to the settings for any mic.", "ok");
    };
    renderRodeGuide(); micTestWire();
    $("#micRefresh").onclick = () => micRefresh(false);
    micList();
    chk2("#clipOn", () => T.clip.on, v => T.clip.on = v, clipStatus); chk2("#clipLoud", () => T.clip.loud, v => T.clip.loud = v);
    chk2("#clipSpell", () => T.clip.spell, v => T.clip.spell = v); chk2("#clipRaid", () => T.clip.raid, v => T.clip.raid = v);
    $("#clipBuf").onclick = async () => { if (!ready()) { clipMsg("Connect OBS first.", "err"); return; } try { await req("StartReplayBuffer"); clipMsg("Replay buffer on ✓", "ok"); } catch (e) { clipMsg("OBS said: " + e.message + ". Turn on Replay Buffer in OBS → Settings → Output first.", "err"); } setTimeout(clipStatus, 800); };
    $("#clipNow").onclick = async () => { if (!ready()) { clipMsg("Connect OBS first.", "err"); return; } clipWhy = "manual"; try { await req("SaveReplayBuffer"); clipMsg("Saving a clip…", "ok"); } catch (e) { clipMsg("OBS couldn't save a clip: turn on the replay buffer first.", "err"); } };
    renderClips();
    rng2("#trkLight", () => T.light, v => T.light = v, "#trkLightV", v => v + "%", () => { pushLook(); trkChanged(); });
    sel2("#trkGrade", () => T.grade, v => T.grade = v, () => { pushLook(); obsGrade(); });
    sel2("#trkProp", () => T.prop, v => T.prop = v, pushLook);
    const avUi = () => { $("#avWizRow").classList.toggle("hide", T.avatar !== "wizard"); $("#avVrmRow").classList.toggle("hide", T.avatar !== "vrm"); };
    sel2("#avMode", () => T.avatar, v => T.avatar = v, () => { avUi(); pushLook(); if (T.avatar === "vrm") vrmFromStore().then(() => avMsg(`Avatar “${vr.name}” ready ✓`, "ok")).catch(e => avMsg(e.message, "warn")); if (T.avatar !== "vrm" && packLive && !segWanted()) usePacked(false); });
    sel2("#avCol", () => T.avCol, v => T.avCol = v, pushLook); sel2("#avSkin", () => T.avSkin, v => T.avSkin = v, pushLook);
    avUi();
    idbGet("avatar.vrm").then(it => { if (it) $("#avName").textContent = it.name; }).catch(() => {});
    $("#avLoad").onclick = () => $("#avFile").click();
    $("#avFile").onchange = async () => {
      const f = $("#avFile").files[0]; if (!f) return;
      avMsg("Loading your avatar…", "");
      try { const buf = await f.arrayBuffer(); await vrmLoad(buf, f.name); await idbPut("avatar.vrm", { name: f.name, buf }); $("#avName").textContent = f.name; avMsg(`Avatar “${f.name}” ready ✓`, "ok"); }
      catch (e) { avMsg("Couldn't load that avatar: " + e.message, "err"); }
      $("#avFile").value = "";
    };
    syncBgUi();
  }
  // start the models again (after changing graphics card / processor)
  function trkReset() {
    trkGen++; trkRunning = false;
    [faceLM, handLM, poseLM].forEach(t => { try { t && t.close(); } catch (e) {} });
    faceLM = null; handLM = null; poseLM = null; trkEngine = "";
  }
  function syncBgUi() {
    $("#trkBlurRow").classList.toggle("hide", C.trk.bg !== "blur");
    $("#trkBgPick").classList.toggle("hide", C.trk.bg !== "image");
  }
  function sendBgImage() { toCam({ type: "bgimg", data: C.trk.bg === "image" ? C.trk.bgImage || "" : "" }); }
  async function trkChanged() {
    if (!C.tos.on) { trkStatus(); return; }
    if (trkWanted()) { try { await trkStart(); } catch (e) { trkMsg(e.message, "err"); } }
    trkStatus();
  }
  bindTrk();
  if (C.trk.mic.on) micSync();
  setInterval(() => { if (C.trk.clip.on) clipStatus(); }, 15000);
  setInterval(() => { if (C.tos.on && trkWanted() && !trkRunning && !trkFatal && tosStream) trkStart().catch(() => {}); trkStatus(); }, 2000);

  // for pads
  window.hubCam = {
    EFFECTS,
    effect: (k, by, extra) => playEffect(k, by, extra),
    punch: () => { toCam({ type: "kick", z: .32 }); shakeCam(); return true; },
    triggerLists: () => ({ gest: GEST.map(g => [g[0], g[1]]).concat(myG().map(g => ["my_" + g.id, "⭐ " + g.name])), pose: POSES.map(p => [p[0], p[1]]).concat(myP().map(g => ["my_" + g.id, "⭐ " + g.name])), _x: POSES.map(p => [p[0], p[1]]), expr: EXPR.map(e => [e[0], e[1]]), mood: MOODS.map(m => [m[0], m[1]]), spell: SPELLS.map(x => [x[0], x[1]]),
      mic: [["clap", "👏 Clap"], ["click", "🫰 Snap / click"], ["shout", "🗣️ Shout"], ["bang", "💥 Bang"], ["laugh", "😂 Laugh"]] }),
    // the Triggers list switches on only the detectors it needs
    setNeeds: n => {
      const T = C.trk, before = JSON.stringify([T.hands, T.poseFx, T.expr, T.mood, T.spells, T.body, T.lipsFace]);
      T.hands = !!n.gest || !!T.pinchTrail; T.poseFx = !!n.pose; T.expr = !!n.expr; T.mood = !!n.mood; T.spells = !!n.spell; T.lipsFace = !!n.lips;
      if (n.pose && !T.body) { T.body = true; const b = $("#trkBody"); if (b) b.checked = true; pushLook(); }
      if (JSON.stringify([T.hands, T.poseFx, T.expr, T.mood, T.spells, T.body, T.lipsFace]) !== before) { save(); trkChanged(); }
    },
    micOn: () => !!C.trk.mic.on,
    trkSettings: () => JSON.parse(JSON.stringify(C.trk)),
    preset: name => applyPreset(name),
    toggle: () => camVisible(),
    shape: async name => { setShape(name); return name; },
    follow: async () => { await setFollow(!C.face.follow); return C.face.follow; },
    presetNames: () => C.presets.map(p => p.name),
    loadAvatar: async (buf, name) => { await vrmLoad(buf, name); await idbPut("avatar.vrm", { name, buf }); $("#avName").textContent = name; return true; },
    recogniseSpell: pts => recognise(pts),
    drawToggle: async () => { C.trk.draw = !C.trk.draw; save(); const b = $("#drawOn"); if (b) b.checked = C.trk.draw; pushLook(); trkChanged(); return C.trk.draw; },
    drawClear: async () => { toCam({ type: "drawclear" }); return true; },
    become: async name => { await playEffect("object", "", name ? { name } : undefined); return true; },
    objects: () => objNames().map(n => [n, objInfo(n).label]),
    stayAs: name => { objSet(name || ""); return true; },
    camToggle: () => camVisible(),
    followToggle: async () => { await setFollow(!C.face.follow); return C.face.follow; },
    micToggle: async () => { C.trk.mic.on = !C.trk.mic.on; save(); const b = $("#micOn"); if (b) b.checked = C.trk.mic.on; await micSync(); trkChanged && trkChanged(); return C.trk.mic.on; },
    micState: () => ({ on: !!C.trk.mic.on, db: mic.stream ? mic.db : null, label: mic.label || "" })
  };
})();
