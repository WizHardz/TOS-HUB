  // ================= TOS HUB camera =================
  // TOS HUB opens the webcam itself and sends it to a "TOS HUB Camera" browser source in OBS over a
  // direct local video link (WebRTC; the two sides find each other through OBS's own connection).
  // That source draws the camera, the frame and the effects together, on every frame.
  const tosMsg = (t, cls) => { const m = $("#tosMsg"); m.textContent = t || ""; m.className = "note " + (cls || ""); };
  const peers = new Map();   // one per TOS HUB Camera source in OBS
  let tosZoom = 1, tosAim = null, tosBusy = false, tosStarting = null;
  const camHealth = { dark: 0, gaveUp: false, resting: false };   // filled in by the camera watchdog
  tosVid.muted = true; tosVid.playsInline = true;
  // the browser only hands out new frames for a video that's on the page, so it sits there, invisible
  tosVid.style.cssText = "position:fixed;left:0;top:0;width:2px;height:2px;opacity:0;pointer-events:none;z-index:-1";
  document.body.appendChild(tosVid);

  function camLook() {
    if (!C.tos.on) return C.look;
    const T = C.trk || {};
    return Object.assign({}, C.look, { cam: "tos", mirror: !!C.tos.mirror, bg: T.useSeg === false ? "none" : T.bg || "none", blur: T.blur || 14, paint: T.useFace === false ? "none" : T.paint || "none", behind: T.behind !== false,
      both: T.both !== false, prop: T.useFace === false ? "none" : T.prop || "none", grade: T.grade || "none", light: T.light || 0, avatar: T.avatar || "off", avCol: T.avCol || "purple", avSkin: T.avSkin || "#f2c9a0", cut: T.cut || 0, testCard: C.tos.testCard !== false, bodyFx: (T.body && T.useBody !== false) || /^wings_/.test(T.bodyFx || "") ? T.bodyFx || "none" : "none", predict: T.predict !== false,
      bodyCol: T.bodyCol || "theme", bodyC1: T.bodyC1 || "#2ff3ff", bodyC2: T.bodyC2 || "#b14dff", bodyStr: T.bodyStr == null ? 100 : T.bodyStr, bodySize: T.bodySize == null ? 100 : T.bodySize, bodyPulse: T.bodyPulse == null ? 50 : T.bodyPulse,
      obj: T.obj || "", objBg: T.objBg || "clear", objSize: T.objSize || 100, objFeat: T.objFeat || 160, objNeck: T.objNeck !== false, objNeckAmt: T.objNeckAmt == null ? 100 : T.objNeckAmt, objFollow: T.objFollow !== false, objBlend: T.objBlend == null ? 30 : T.objBlend,
      draw: !!T.draw && T.useHands !== false, drawCol: T.drawCol || "rainbow", drawStyle: T.drawStyle || "neon", drawSize: T.drawSize || 8, drawFade: +T.drawFade || 0, drawPalm: T.drawPalm !== false });
  }
  function toCam(msg) {
    toPreview(msg);
    const s = JSON.stringify(msg);
    peers.forEach(p => { if (p.dc && p.dc.readyState === "open") { try { p.dc.send(s); } catch (e) {} } });
  }
  const livePeers = () => [...peers.values()].filter(p => p.pc.connectionState === "connected").length;
  function viewMsg(snap) {
    const z = Math.max(tosZoom, C.face.follow ? (tosAim && tosAim.z ? tosAim.z : (C.face.zoom || 150) / 100) : 1);
    const m = { type: "view", zoom: z, cx: .5, cy: .5, speed: { slow: .05, normal: .1, fast: .2 }[C.face.speed] || .1 };
    if (C.face.follow && tosAim) { m.cx = tosAim.cx; m.cy = tosAim.cy; }
    if (snap) m.snap = true;
    return m;
  }
  const sendView = snap => toCam(viewMsg(snap));

  // ---- GoPro over USB ----
  // The desktop app talks to the GoPro (see gopro.js) and passes on its compressed video one frame at a time;
  // here the browser's own decoder turns it back into pictures on a canvas, and that canvas becomes the camera.
  const gp = { dec: null, cv: null, g: null, track: null, stream: null, ts: 0, frames: 0, waitKey: true, codec: "" };
  const gpAvail = () => !!(window.tosHub && window.tosHub.gopro);
  function gpCodec(es, hevc) {
    if (hevc) return "hev1.1.6.L120.B0";
    for (let i = 0; i + 6 < es.length; i++) if (es[i] === 0 && es[i + 1] === 0 && es[i + 2] === 1 && (es[i + 3] & 0x1f) === 7) return "avc1." + [es[i + 4], es[i + 5], es[i + 6]].map(v => v.toString(16).padStart(2, "0")).join("");
    return "";
  }
  function gpDecoder(codec) {
    if (gp.dec) { try { gp.dec.close(); } catch (e) {} }
    gp.dec = new VideoDecoder({
      output: f => {
        try {
          if (gp.cv) {
            if (gp.cv.width !== f.displayWidth || gp.cv.height !== f.displayHeight) { gp.cv.width = f.displayWidth; gp.cv.height = f.displayHeight; }
            gp.g.drawImage(f, 0, 0); gp.frames++; gp.decoded = (gp.decoded || 0) + 1;
            if (gp.track && gp.track.requestFrame) gp.track.requestFrame();
          }
        } finally { f.close(); }
      },
      error: e => { gp.waitKey = true; gp.codec = ""; gp.decErr = (e && e.message) || String(e); }
    });
    gp.dec.configure({ codec, optimizeForLatency: true });
    gp.codec = codec;
  }
  function gpFeed(f) {
    if (!gp.cv || !f || !f.d) return;
    const es = f.d instanceof Uint8Array ? f.d : new Uint8Array(f.d);
    try {
      if (gp.waitKey) {   // (re)start on a keyframe
        if (!f.k) return;
        const codec = gpCodec(es, f.h) || gp.codec; if (!codec) return;
        if (!gp.dec || gp.dec.state !== "configured" || codec !== gp.codec) gpDecoder(codec);
        gp.waitKey = false;
      }
      if (!gp.dec || gp.dec.state !== "configured") { gp.waitKey = true; return; }
      if (gp.dec.decodeQueueSize > 10) { gp.waitKey = true; return; }   // falling behind: skip ahead to the next keyframe
      gp.dec.decode(new EncodedVideoChunk({ type: f.k ? "key" : "delta", timestamp: (gp.ts += 33333), data: es }));
    } catch (e) { gp.waitKey = true; gp.codec = ""; gp.decErr = e.message; }
  }
  async function goproStream() {
    if (!gpAvail()) throw new Error(window.tosHub ? "This copy of the TOS HUB app is older than GoPro support. Unzip the newest TOS-HUB-App.zip and open TOS HUB.exe from that folder (and remake the desktop shortcut so it points there)." : "The GoPro only works in the TOS HUB desktop app (TOS HUB.exe from the ZIP), not in the HTML file in a browser. A web page isn't allowed to talk to the camera over USB.");
    if (typeof VideoDecoder === "undefined") throw new Error("This copy of TOS HUB can't decode GoPro video. Update the desktop app.");
    gp.cv = document.createElement("canvas"); gp.cv.width = 1920; gp.cv.height = 1080;
    gp.g = gp.cv.getContext("2d"); gp.g.fillStyle = "#000"; gp.g.fillRect(0, 0, 1920, 1080);
    gp.stream = gp.cv.captureStream(0); gp.track = gp.stream.getVideoTracks()[0];
    gp.waitKey = true; gp.frames = 0; gp.codec = "";
    window.tosHub.onGoproFrame(gpFeed);
    window.tosHub.onGoproStatus(m => { if (C.tos.on && C.tos.dev === "gopro") tosMsg(m.msg, m.err ? "err" : "warn"); });
    tosMsg("Looking for your GoPro on USB…", "");
    const r = await window.tosHub.gopro("start", { res: (+C.tos.size || 1080) >= 1080 ? 12 : 7, fov: C.tos.gpFov != null ? C.tos.gpFov : 4, ip: C.tos.gpIp || "" });
    if (!r || !r.ok) { gpStop(); throw new Error((r && r.error) || "Couldn't start the GoPro."); }
    tosMsg(`Found your GoPro (${r.ip}). Waiting for its picture…`, "");
    const t0 = performance.now();
    while (!gp.frames) {
      if (!gp.cv) throw new Error("GoPro stopped.");
      if (performance.now() - t0 > 15000) { gpStop(); throw new Error("The GoPro is in webcam mode but no picture is reaching TOS HUB. If Windows asked whether TOS HUB can use networks, click Allow. If you missed that question, open Windows Security → Firewall & network protection → Allow an app through firewall, tick TOS HUB (Private and Public), then click Restart camera."); }
      await sleep(200);
    }
    return gp.stream;
  }
  function gpStop() {
    if (gpAvail()) window.tosHub.gopro("stop").catch(() => {});
    if (gp.dec) { try { gp.dec.close(); } catch (e) {} }
    if (gp.stream) gp.stream.getTracks().forEach(t => t.stop());
    gp.dec = null; gp.cv = null; gp.g = null; gp.stream = null; gp.track = null; gp.codec = "";
  }
  window.addEventListener("beforeunload", () => { if (gp.cv) gpStop(); });
  // "GoPro check": finds where the picture gets stuck, in plain words, with the details to copy
  $("#gpCheck").onclick = async () => {
    const box = $("#gpDiag"), v = $("#gpVerdict"), rep = $("#gpReport");
    box.classList.remove("hide"); v.textContent = "Checking…"; rep.textContent = "";
    if (!gpAvail()) { v.textContent = window.tosHub ? "This copy of the TOS HUB app is older than GoPro support. Open TOS HUB.exe from the newest ZIP." : "This is the HTML file in a browser. The GoPro only works in the TOS HUB desktop app."; return; }
    let d; try { d = await window.tosHub.gopro("diag", { ip: C.tos.gpIp || "" }); } catch (e) { v.textContent = "Check failed: " + e.message; return; }
    const usbNet = d.nets.some(n => /: 172\.2\d\.1\d\d\./.test(n)) || !!C.tos.gpIp;
    const answers = d.replies.some(r => / → 200 /.test(r));
    let say;
    if (!usbNet) say = "❌ Windows can't see the GoPro yet. Check it's switched on and showing that it's connected by USB, then try the cable that came with it (some USB-C cables only charge) and a USB port on the back of the PC. Wait 10 seconds after plugging in.";
    else if (!answers) say = "❌ Windows can see the GoPro's USB connection, but the camera isn't answering. Unplug it, turn it off and on, plug it back in, wait 10 seconds and check again. Close the GoPro Webcam or Quik desktop apps if they're open.";
    else if (!d.pkts && /code 7/.test(d.lastErr || tosErr || "")) say = "❌ The GoPro is connected ✓ but says webcam mode isn't available (code 7) to every request. On the camera: 1) swipe down → Connections → turn Wireless Connections OFF, and close GoPro Quik on your phone. 2) Back out of all menus to the normal video screen. 3) Unplug the USB, wait 5 seconds, plug back in, then Restart camera. Still code 7? Go to Preferences → Connections → Reset Connections (you'll have to pair your phone again afterwards), and check for a camera update in GoPro Quik.";
    else if (!d.listening && (d.lastErr || tosErr)) say = "❌ The GoPro is answering ✓ but wouldn't start webcam mode. " + (d.lastErr || tosErr) + " Copy the details below and send them to me if it keeps happening.";
    else if (!d.listening) say = "ℹ️ The GoPro is answering ✓. Pick it as the camera and click “Switch to the TOS HUB camera” (or Restart camera), then run this check again.";
    else if (!d.pkts) say = "❌ The GoPro is answering and in webcam mode, but no video is reaching TOS HUB. That's almost always Windows Firewall. Open Windows Security → Firewall & network protection → Allow an app through firewall → Change settings, tick TOS HUB for both Private and Public (use “Allow another app…” → TOS HUB.exe if it isn't listed), then click Restart camera. If that doesn't do it, add a port rule: search Start for “Windows Defender Firewall with Advanced Security” → Inbound Rules → New Rule → Port → UDP, port 8554 → Allow the connection → tick all three → name it GoPro.";
    else if (!d.frames) say = "⚠️ Video is arriving from the GoPro but TOS HUB can't unpack it. Copy the details below and send them to me.";
    else if (!gp.decoded) say = "⚠️ Video is arriving and unpacked, but the picture won't decode. Copy the details below and send them to me.";
    else say = `✓ The GoPro picture is working (${gp.cv ? gp.cv.width + "×" + gp.cv.height : "?"}). If the preview still looks empty, set the preview's Show menu to “Camera direct”.`;
    v.textContent = say;
    rep.textContent = [
      "USB/network: " + (d.nets.join(" | ") || "none"),
      "Camera address tried: " + (d.cands.join(", ") || "none found"),
      ...d.replies,
      `Webcam start reply: ${d.startReply || "(not started)"} ${d.style ? "(" + d.style + " commands)" : ""}`,
      ...(d.attempts || []).map(a => "  tried " + a), `Last error: ${d.lastErr || tosErr || "-"}`,
      `Listening: ${d.listening} · packets ${d.pkts} (${Math.round(d.bytes / 1024)} KB) from ${d.from || "-"} · bad sync ${d.sync}`,
      `Streams seen: ${d.types.join(",") || "-"} · video pid ${d.videoPid} · frames ${d.frames} · keyframes ${d.keys} · last ${d.age}ms ago`,
      `Decoder: ${gp.codec || "-"} · state ${gp.dec ? gp.dec.state : "-"} · decoded ${gp.decoded || 0} · error ${gp.decErr || "-"}`,
      `TOS camera on: ${!!C.tos.on} · stream: ${!!tosStream} · video ${tosVid.videoWidth}×${tosVid.videoHeight} · preview: ${C.view}`
    ].join("\n");
  };
  $("#gpCopy").onclick = () => { try { navigator.clipboard.writeText($("#gpVerdict").textContent + "\n" + $("#gpReport").textContent); $("#gpCopy").textContent = "Copied ✓"; setTimeout(() => { $("#gpCopy").textContent = "Copy the details"; }, 1500); } catch (e) {} };

  // ---- the camera ----
  async function listDevices() {
    const sel = $("#tosDev");
    try {
      const all = (await navigator.mediaDevices.enumerateDevices()).filter(d => d.kind === "videoinput");
      sel.innerHTML = "";
      sel.append(opt("", "Same camera as OBS (automatic)", !C.tos.dev));
      all.forEach((d, i) => sel.append(opt(d.deviceId, d.label || `Camera ${i + 1}`, d.deviceId === C.tos.dev)));
    } catch (e) {}
    if (!sel.querySelector('option[value="gopro"]')) sel.append(opt("gopro", "📷 GoPro over USB (HERO9 and newer)", C.tos.dev === "gopro"));
    sel.value = C.tos.dev || "";
  }
  function stopTosCam() {
    if (gp.cv) gpStop();
    if (tosStream) tosStream.getTracks().forEach(t => t.stop());
    tosStream = null; window.__tosCamStream = null; tosVid.srcObject = null;
  }
  async function startTosCam() {
    if (tosStream) return tosStream;
    if (tosStarting) return tosStarting;
    tosStarting = (async () => {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) throw new Error("This copy of TOS HUB can't open cameras. Use the desktop app.");
      let id = C.tos.dev;
      if (id === "gopro") {
        const s = await goproStream(), tr = s.getVideoTracks()[0];
        tr.contentHint = "motion";
        tosStream = s; window.__tosCamStream = s; tosErr = "";
        tosVid.srcObject = s; await tosVid.play().catch(() => {});
        if (!packLive) peers.forEach(p => { p.pc.getSenders().forEach(sd => { if (sd.track && sd.track.kind === "video") sd.replaceTrack(tr).catch(() => {}); }); });
        setTimeout(preloadTracking, 1500);
        return s;
      }
      if (!id && C.tos.oldCam && ready()) {   // find the camera OBS was using
        const want = (await obsCamName(C.tos.oldCam)).toLowerCase();
        const cams = (await navigator.mediaDevices.enumerateDevices()).filter(d => d.kind === "videoinput" && d.label);
        const hit = want && cams.find(d => { const l = d.label.toLowerCase().replace(/\s*\([0-9a-f]{4}:[0-9a-f]{4}\)\s*$/, ""); return l === want || l.includes(want) || want.includes(l); });
        if (hit) id = hit.deviceId;
      }
      const h = +C.tos.size || 1080;
      const want = { audio: false, video: Object.assign({ width: { ideal: Math.round(h * 16 / 9) }, height: { ideal: h }, frameRate: { ideal: +C.tos.fps || 30 } }, id ? { deviceId: { exact: id } } : {}) };
      let lastErr = null;
      for (let i = 0; i < 5; i++) {   // OBS can take a moment to let go of the camera
        try {
          const s = await navigator.mediaDevices.getUserMedia(want);
          const tr = s.getVideoTracks()[0];
          tr.contentHint = "motion";
          tr.onended = () => { if (tosStream === s) { stopTosCam(); tosErr = "The camera stopped (unplugged?). Trying again…"; tosMsg(tosErr, "err"); setTimeout(() => { if (C.tos.on) startTosCam().catch(() => {}); }, 2000); } };
          tosStream = s; window.__tosCamStream = s; tosErr = "";
          tosVid.srcObject = s; await tosVid.play().catch(() => {});
          setTimeout(preloadTracking, 1500);
          if (!packLive) peers.forEach(p => { p.pc.getSenders().forEach(sd => { if (sd.track && sd.track.kind === "video") sd.replaceTrack(tr).catch(() => {}); }); });
          listDevices();
          return s;
        } catch (e) {
          lastErr = e;
          if (e && e.name === "OverconstrainedError" && id) { id = ""; delete want.video.deviceId; continue; }
          if (!(e && (e.name === "NotReadableError" || e.name === "AbortError" || e.name === "TrackStartError"))) break;
          await sleep(900);
        }
      }
      const busy = lastErr && (lastErr.name === "NotReadableError" || lastErr.name === "AbortError" || lastErr.name === "TrackStartError");
      throw new Error(busy ? (ready() ? "The camera is still busy. Another app (or OBS, in another scene) is using it. Close that app, or hide the webcam in every OBS scene, then try again."
          : "The camera is busy: OBS (or another app) is using it. Connect OBS on the Connections tab and TOS HUB will take the camera over by itself, or close OBS and try again.")
        : lastErr && lastErr.name === "NotAllowedError" ? "Camera access was blocked." : "Couldn't open the camera: " + ((lastErr && lastErr.message) || "unknown problem"));
    })();
    try { return await tosStarting; } catch (e) { tosErr = e.message; throw e; } finally { tosStarting = null; }
  }

  // ---- the video link to OBS ----
  const iceDone = p => new Promise(res => {
    if (p.iceGatheringState === "complete") return res();
    const t = setTimeout(res, 2500);
    p.addEventListener("icegatheringstatechange", () => { if (p.iceGatheringState === "complete") { clearTimeout(t); res(); } });
  });
  // ---- auto performance: how busy the PC is (0 = free, 1 = busy, 2 = very busy) ----
  const perf = { ms: 0, lag: 0, level: 0, calm: 0, tick: performance.now(), linkPress: 0, still: 0 };
  setInterval(() => { const now = performance.now(), lag = Math.max(0, now - perf.tick - 250); perf.lag = perf.lag * .8 + lag * .2; perf.tick = now; }, 250);
  // the link into OBS: sharpest when there's power to spare, lighter when the game needs the PC
  async function sharpen(pc) {
    const load = Math.min(2, perf.level + perf.linkPress);
    for (const s of pc.getSenders()) {
      try {
        const p = s.getParameters();
        if (!p.encodings || !p.encodings.length) p.encodings = [{}];
        const base = ((+C.tos.size || 1080) >= 1080 ? 16 : 9) * 1e6 * ((+C.tos.fps || 30) > 30 ? 1.4 : 1);
        p.encodings[0].maxBitrate = Math.round(base * [1.3, 1, .6][load]);
        p.encodings[0].maxFramerate = +C.tos.fps || 30;
        p.encodings[0].scaleResolutionDownBy = 1;
        p.degradationPreference = load >= 2 ? "balanced" : "maintain-resolution";
        await s.setParameters(p);
      } catch (e) {}
    }
  }
  // every few seconds: is the video encoder struggling? (Chrome reports why it's holding quality back)
  setInterval(async () => {
    if (!C.tos.on) return;
    let press = 0;
    for (const p of peers.values()) {
      if (p.pc.connectionState !== "connected") continue;
      try { (await p.pc.getStats()).forEach(r => { if (r.type === "outbound-rtp" && r.kind === "video" && (r.qualityLimitationReason === "cpu" || r.qualityLimitationReason === "bandwidth")) press = 1; }); } catch (e) {}
    }
    if (press !== perf.linkPress) { perf.linkPress = press; peers.forEach(p => sharpen(p.pc)); }
  }, 4000);
  async function offerTo(id) {
    if (!C.tos.on || !id) return;
    const old = peers.get(id);
    if (old && Date.now() - old.at < 6000 && old.pc.connectionState !== "failed") return;   // already linking
    if (old) { try { old.pc.close(); } catch (e) {} peers.delete(id); }
    if (camHealth.gaveUp) return;
    camHealth.resting = false;
    try { await startTosCam(); } catch (e) { tosMsg(e.message, "err"); return; }
    const pc = new RTCPeerConnection({ iceServers: [] });
    const entry = { pc, dc: null, at: Date.now() };
    peers.set(id, entry);
    const track = packLive && packTrack ? packTrack : tosStream.getVideoTracks()[0];
    const tx = pc.addTransceiver(track, { direction: "sendonly", streams: [packLive && packStream ? packStream : tosStream] });
    try {   // H.264 first (usually done by the graphics card), then VP8
      const codecs = RTCRtpSender.getCapabilities("video").codecs;
      const rank = c => /h264/i.test(c.mimeType) ? (/packetization-mode=1/.test(c.sdpFmtpLine || "") ? 0 : 1) : /vp8/i.test(c.mimeType) ? 2 : /vp9/i.test(c.mimeType) ? 3 : 4;
      tx.setCodecPreferences([...codecs].sort((a, b) => rank(a) - rank(b)));
    } catch (e) {}
    const dc = entry.dc = pc.createDataChannel("tos");
    dc.onopen = () => {
      try {
        dc.send(JSON.stringify({ type: "cfg", cfg: camLook() })); dc.send(JSON.stringify(viewMsg(true)));
        dc.send(JSON.stringify({ type: "pack", on: !!packLive, ratio: tosVid.videoHeight / Math.max(1, tosVid.videoWidth) }));
        if (C.trk.bg === "image" && C.trk.bgImage) dc.send(JSON.stringify({ type: "bgimg", data: C.trk.bgImage }));
      } catch (e) {}
    };
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === "connected") { sharpen(pc); tosStatus(); }
      if (["failed", "closed", "disconnected"].includes(pc.connectionState)) { if (peers.get(id) === entry && pc.connectionState !== "disconnected") peers.delete(id); tosStatus(); }
    };
    try {
      await pc.setLocalDescription(await pc.createOffer());
      await iceDone(pc);
      await req("BroadcastCustomEvent", { eventData: { wizcam: true, type: "rtc-offer", to: id, sdp: pc.localDescription.sdp } });
    } catch (e) { peers.delete(id); try { pc.close(); } catch (x) {} }
  }
  window.addEventListener("wizcam-rtc", e => {
    const m = e.detail || {};
    if (m.type === "rtc-hello") offerTo(m.id);
    else if (m.type === "rtc-answer") {
      const p = peers.get(m.id);
      if (p && p.pc.signalingState === "have-local-offer") p.pc.setRemoteDescription({ type: "answer", sdp: m.sdp }).catch(() => {});
    }
  });

  // ---- face tracking on the camera itself (every frame is right here) ----
  async function detectTos(fa) {
    if (!tosStream || tosVid.readyState < 2 || !tosVid.videoWidth) return null;
    const VW = tosVid.videoWidth, VH = tosVid.videoHeight;
    const det = await fa.detectSingleFace(tosVid, new fa.TinyFaceDetectorOptions({ inputSize: C.tos.dev === "gopro" ? 608 : 320, scoreThreshold: .4 })).withFaceLandmarks(true);
    if (!det) {
      if (C.face.follow && tosAim && Date.now() - lastSeenAt > 2500) { tosAim = null; sendView(); }   // lost you: back to the middle
      return null;
    }
    const b = det.detection.box, le = avgPt(det.landmarks.getLeftEye()), re = avgPt(det.landmarks.getRightEye());
    const f = { raw: true, x: +(b.x / VW).toFixed(4), y: +(b.y / VH).toFixed(4), w: +(b.width / VW).toFixed(4), h: +(b.height / VH).toFixed(4),
      le: { x: le.x / VW, y: le.y / VH }, re: { x: re.x / VW, y: re.y / VH } };
    faceNorm = f; faceNormAt = Date.now(); lastSeenAt = Date.now();
    if (Date.now() < streamUntil) toCam({ type: "face", f });
    if (C.face.follow) {
      const z = Math.max(tosZoom, (C.face.zoom || 150) / 100);
      const cx = f.x + f.w / 2, cy = f.y + f.h / 2 + .08 / z;
      if (!tosAim || Math.hypot(cx - tosAim.cx, cy - tosAim.cy) > .025 / z) { tosAim = { cx, cy }; sendView(); }
    }
    return f;
  }

  // ---- switching modes ----
  async function tosItemSize(square) {
    const cam = await findItem(C.tos.src); if (!cam) return;
    const t = await getT(cam);
    const h = +C.tos.size || 1080, w = square ? h : Math.round(h * (tosVid.videoWidth && tosVid.videoHeight ? tosVid.videoWidth / tosVid.videoHeight : 16 / 9) / 2) * 2;
    const [sw, sh] = shown(t), disp = square ? Math.min(sw, sh) : sw;
    await req("SetInputSettings", { inputName: C.tos.src, inputSettings: { width: w, height: h } });
    const n = Object.assign({}, t, { boundsType: "OBS_BOUNDS_SCALE_INNER", boundsAlignment: 0, boundsWidth: disp, boundsHeight: disp * h / w, cropLeft: 0, cropRight: 0, cropTop: 0, cropBottom: 0 });
    await setT(cam, n);
    camT = await getT(cam); layoutStage();
  }
  async function tosResize(square) { C.tos.square = !!square; save(); await tosItemSize(square); }
  function tosLink() {
    const q = new URL(frameLink());
    q.searchParams.set("cam", "tos"); q.searchParams.set("mirror", C.tos.mirror ? "1" : "0");
    return q.href;
  }
  // which OBS webcam source the TOS HUB camera replaces (if there is one), and where it sits
  async function oldCamItem() {
    let name = C.tos.oldCam || (C.camSrc && C.camSrc !== C.tos.src ? C.camSrc : "");
    if (!name) {
      try { const all = ((await req("GetInputList")).inputs || []).filter(i => CAM_KINDS.test(i.inputKind || "")); for (const i of all) { if (await findItem(i.inputName)) { name = i.inputName; break; } } } catch (e) {}
    }
    const it = name ? await findItem(name) : null;
    return { name, it };
  }
  // step 1 (needs OBS): stop OBS using the webcam so TOS HUB can open it
  async function obsLetGo() {
    const { name, it } = await oldCamItem();
    if (!it) return null;
    const t = await getT(it);
    tosMsg("Asking OBS to let go of the camera…");
    try { await req("SetInputSettings", { inputName: name, inputSettings: { deactivate_when_not_showing: true } }); } catch (e) {}
    await req("SetSceneItemEnabled", { sceneName: it.sceneName, sceneItemId: it.id, sceneItemEnabled: false });
    if (C.frameSrc && C.frameSrc !== name && C.frameSrc !== C.tos.src) {
      const fr = await findItem(C.frameSrc);
      if (fr) await req("SetSceneItemEnabled", { sceneName: fr.sceneName, sceneItemId: fr.id, sceneItemEnabled: false });
    }
    if (!C.tos.oldCam) { C.tos.oldCam = name; C.tos.oldFrame = C.frameSrc !== C.tos.src ? C.frameSrc : ""; C.tos.oldFollow = C.follow; }
    return { sceneName: it.sceneName, t };
  }
  // step 2 (needs OBS): the TOS HUB Camera source, made once and then reused
  async function tosIntoObs(spot) {
    if (!spot) spot = await obsLetGo().catch(() => null);
    let sceneName = spot && spot.sceneName, t = spot && spot.t, w, h;
    if (t) [w, h] = shown(t);
    else {   // no webcam source to replace: bottom-right corner of the live scene
      sceneName = await liveScene();
      let bw = 1920, bh = 1080; try { const v = await req("GetVideoSettings"); bw = v.baseWidth || bw; bh = v.baseHeight || bh; } catch (e) {}
      w = Math.round(bw * .25); h = Math.round(w * 9 / 16);
      t = { positionX: bw - w - Math.round(bw * .02), positionY: bh - h - Math.round(bh * .03), rotation: 0, alignment: 5 };
    }
    const inputs = ((await req("GetInputList")).inputs || []).map(i => i.inputName);
    const name = C.tos.src && inputs.includes(C.tos.src) ? C.tos.src : "";
    const vw = tosVid.videoWidth || 16, vh = tosVid.videoHeight || 9, ph = +C.tos.size || 1080;
    const pw = C.tos.square ? ph : Math.round(ph * vw / vh / 2) * 2;
    const settings = { is_local_file: false, url: tosLink(), width: pw, height: ph, fps_custom: true, fps: +C.tos.fps || 30, reroute_audio: false, shutdown: false, restart_when_active: false };
    const place = Object.assign({}, t, { boundsType: "OBS_BOUNDS_SCALE_INNER", boundsAlignment: 0, boundsWidth: w, boundsHeight: w * ph / pw, cropLeft: 0, cropRight: 0, cropTop: 0, cropBottom: 0 });
    if (!name) {
      let n2 = "TOS HUB Camera", k = 2; while (inputs.includes(n2)) n2 = `TOS HUB Camera ${k++}`;
      C.tos.src = n2;
      const r = await req("CreateInput", { sceneName, inputName: n2, inputKind: "browser_source", sceneItemEnabled: true, inputSettings: settings });
      await setT({ sceneName, id: r.sceneItemId }, place);
    } else {
      await req("SetInputSettings", { inputName: name, inputSettings: settings });
      let it = await findItem(name);
      if (!it) { await req("CreateSceneItem", { sceneName, sourceName: name, sceneItemEnabled: true }); await O().refresh(); it = await findItem(name); }
      if (it) { await req("SetSceneItemEnabled", { sceneName: it.sceneName, sceneItemId: it.id, sceneItemEnabled: true }); if (spot) await setT(it, place); }
    }
    C.camSrc = C.tos.src; C.frameSrc = C.tos.src; C.follow = false; C.tos.pendingObs = false;
    save();
    await O().refresh();
    await refreshSources();
    setTimeout(checkFrame, 3500);
  }
  async function switchToTos() {
    if (tosBusy) return;
    if (!fileUrl("x")) { tosMsg("The TOS HUB camera needs the desktop app.", "err"); return; }
    tosBusy = true; $("#tosGo").disabled = true;
    try {
      if (!C.tos.on && C.face.follow && ready()) { try { await removeFraming(); } catch (e) {} }   // the OBS-side follow crop isn't needed any more (face follow stays on)
      let spot = null;
      if (ready()) { spot = await obsLetGo().catch(() => null); await sleep(700); }
      tosMsg("Opening the camera…");
      camHealth.gaveUp = false; camHealth.resting = false;
      await startTosCam();
      C.tos.on = true; C.tos.pendingObs = true;
      zoomBase = null; tosZoom = 1; setZoomUi(100); tosAim = null;
      save();
      loadFrame(); syncTosUi();
      if (ready()) {
        await tosIntoObs(spot);
        tosMsg("Switched ✓ Your cam in OBS now comes from TOS HUB. Keep TOS HUB open while you stream.", "ok");
      } else tosMsg("Camera on ✓ You can try effects and tracking in the preview now. When you connect OBS, TOS HUB puts it into your scene by itself.", "ok");
      await refreshSources();
    } catch (e) {
      tosMsg(e.message, "err");
    } finally { tosBusy = false; $("#tosGo").disabled = false; }
  }
  // OBS connected later: finish putting the camera into OBS
  setInterval(async () => {
    if (!C.tos.on || !C.tos.pendingObs || !ready() || tosBusy || !tosStream) return;
    tosBusy = true;
    try { await tosIntoObs(null); tosMsg("OBS connected ✓ Your TOS HUB camera is now in your scene.", "ok"); }
    catch (e) { tosMsg("Couldn't put the camera into OBS: " + e.message, "err"); C.tos.pendingObs = false; save(); }
    finally { tosBusy = false; }
  }, 2000);
  async function switchToObs() {
    if (tosBusy) return;
    tosBusy = true; $("#tosGo").disabled = true;
    try {
      peers.forEach(p => { try { p.pc.close(); } catch (e) {} }); peers.clear();
      stopTosCam();
      const wasFollow = C.face.follow;
      C.face.follow = false;
      if (ready()) {
        const tc = await findItem(C.tos.src);
        if (tc) await req("SetSceneItemEnabled", { sceneName: tc.sceneName, sceneItemId: tc.id, sceneItemEnabled: false });
        const oc = await findItem(C.tos.oldCam);
        if (oc) await req("SetSceneItemEnabled", { sceneName: oc.sceneName, sceneItemId: oc.id, sceneItemEnabled: true });
        if (C.tos.oldFrame) { const of = await findItem(C.tos.oldFrame); if (of) await req("SetSceneItemEnabled", { sceneName: of.sceneName, sceneItemId: of.id, sceneItemEnabled: true }); }
      }
      C.tos.on = false;
      C.camSrc = C.tos.oldCam || ""; C.frameSrc = C.tos.oldFrame || ""; C.follow = C.tos.oldFollow !== false;
      save();
      loadFrame(); camT = null; await refreshSources(); syncTosUi();
      lastMaskKey = ""; scheduleShape(true);
      if (wasFollow) setFollow(true);
      tosMsg("Back to the OBS webcam ✓ The TOS HUB Camera source is hidden, not deleted, so switching again is quick.", "ok");
      setTimeout(checkFrame, 2500);
    } catch (e) { tosMsg(e.message, "err"); }
    finally { tosBusy = false; $("#tosGo").disabled = false; }
  }
  function tosStatus() {
    if (!C.tos.on) return;
    const n = livePeers();
    if (camHealth.gaveUp) return tosMsg("The camera's picture stayed black after 3 tries, so TOS HUB has stopped poking it. It may be too hot or asleep: give it a rest, then click Restart camera.", "err");
    if (camHealth.resting && !tosStream) return tosMsg("Camera resting 💤 OBS isn't showing it, so TOS HUB let it cool off. It starts again by itself when OBS needs it.", "");
    if (tosErr) return tosMsg(tosErr, "err");
    if (camHealth.dark >= 2) return tosMsg("The camera's picture is black. It may be asleep, covered, or its privacy mode is on. TOS HUB keeps trying to wake it.", "warn");
    tosMsg(!tosStream ? "Starting the camera…" : n ? `✓ Live in OBS${n > 1 ? ` (${n} places)` : ""}. ${tosVid.videoWidth}×${tosVid.videoHeight} ${C.tos.dev === "gopro" ? "GoPro" : "camera"}.` : ready() ? "Camera is on. Waiting for OBS to pick it up…" : "Camera is on. Connect OBS to send it to your stream.", n ? "ok" : "");
  }
  function syncTosUi() {
    document.querySelectorAll("#tosMode button").forEach(b => b.classList.toggle("on", (b.dataset.m === "tos") === !!C.tos.on));
    $("#tosGo").textContent = C.tos.on ? "Switch back to the OBS webcam" : "Switch to the TOS HUB camera";
    $("#tosGo").className = C.tos.on ? "ghost" : "primary";
    $("#tosRestart").classList.toggle("hide", !C.tos.on);
    $("#tosBox").classList.toggle("hide", !C.tos.on && !tosPicking);
    $("#camSrcRow").classList.toggle("hide", !!C.tos.on);
    $("#gpHint").classList.toggle("hide", !!C.tos.on || tosPicking);
    $("#frPlace").classList.toggle("hide", !!C.tos.on);
    $("#frTosNote").classList.toggle("hide", !C.tos.on);
    $("#tosDev").value = C.tos.dev || ""; $("#tosSize").value = String(C.tos.size); $("#tosFps").value = String(C.tos.fps); $("#tosMirror").checked = !!C.tos.mirror;
    $("#tosCard").checked = C.tos.testCard !== false;
    const isGp = C.tos.dev === "gopro";
    $("#gpRow").classList.toggle("hide", !isGp); $("#gpNote").classList.toggle("hide", !isGp); $("#tosFpsL").classList.toggle("hide", isGp);
    $("#gpFov").value = String(C.tos.gpFov != null ? C.tos.gpFov : 4); $("#gpIp").value = C.tos.gpIp || "";
    layoutStage(); placeholder();
  }
  let tosPicking = false;
  document.querySelectorAll("#tosMode button").forEach(b => b.onclick = () => {
    tosPicking = b.dataset.m === "tos";
    if (!tosPicking && C.tos.on) { $("#tosBox").classList.remove("hide"); tosMsg("Click “Switch back to the OBS webcam” to go back.", ""); return; }
    syncTosUi(); if (tosPicking) listDevices();
  });
  $("#tosGo").onclick = () => C.tos.on ? switchToObs() : switchToTos();
  const restartCam = async () => {
    save();
    if (!C.tos.on) return;
    stopTosCam();
    try { await startTosCam(); tosStatus(); } catch (e) { tosMsg(e.message, "err"); }
    peers.forEach(p => sharpen(p.pc));
  };
  $("#tosDev").onchange = () => { C.tos.dev = $("#tosDev").value; syncTosUi(); if (!C.tos.on) { save(); tosMsg("Now click “Switch to the TOS HUB camera” to start it. The preview shows it once it's on.", "warn"); } else restartCam(); };
  $("#gpFov").onchange = () => { C.tos.gpFov = +$("#gpFov").value; restartCam(); };
  $("#gpIp").onchange = () => { C.tos.gpIp = $("#gpIp").value.trim(); restartCam(); };
  $("#tosCard").onchange = () => { C.tos.testCard = $("#tosCard").checked; save(); pushLook(); };
  $("#tosRestart").onclick = async () => { camHealth.gaveUp = false; camHealth.resting = false; camHealth.dark = 0; await restartCam(); };
  $("#tosSize").onchange = async () => { C.tos.size = +$("#tosSize").value; await restartCam(); if (C.tos.on && ready()) { try { await tosItemSize(!!C.tos.square); } catch (e) {} } };
  $("#tosFps").onchange = async () => { C.tos.fps = +$("#tosFps").value; await restartCam(); if (C.tos.on && ready()) { try { await req("SetInputSettings", { inputName: C.tos.src, inputSettings: { fps_custom: true, fps: C.tos.fps } }); } catch (e) {} } };
  $("#tosMirror").onchange = () => { C.tos.mirror = $("#tosMirror").checked; save(); pushLook(); };
  listDevices();
  // start the camera straight away if TOS HUB was left in this mode
  if (C.tos.on) startTosCam().then(tosStatus).catch(e => tosMsg(e.message, "err"));
  setInterval(() => { if (C.tos.on) tosStatus(); }, 3000);
  // GoPro unplugged or switched off: keep looking for it, so it comes back by itself when it's plugged in again
  setInterval(() => {
    if (C.tos.on && C.tos.dev === "gopro" && !tosStream && !tosStarting && !/said no/.test(tosErr || "") && !(typeof camHealth !== "undefined" && camHealth.resting))
      startTosCam().then(tosStatus).catch(e => tosMsg(e.message, "err"));
  }, 6000);

  // ---- camera watchdog ----
  // Some webcams (like the OBSBOT Meet 2) can drift off to sleep or stall: the picture freezes or goes
  // black. TOS HUB watches for that and restarts the camera, which wakes it up again.
  let camFrames = 0, camLastFrames = 0, camStallSince = 0, camDarkCount = 0, camRestarts = 0, camLastRestart = 0, camWatchBusy = false;
  const peek = document.createElement("canvas"); peek.width = 32; peek.height = 18;
  const peekX = peek.getContext("2d", { willReadFrequently: true });
  (function countFrames() {
    const tick = () => { camFrames++; if (tosVid.requestVideoFrameCallback) tosVid.requestVideoFrameCallback(tick); };
    if (tosVid.requestVideoFrameCallback) tosVid.requestVideoFrameCallback(tick);
    tosVid.addEventListener("playing", () => { if (tosVid.requestVideoFrameCallback) tosVid.requestVideoFrameCallback(tick); });
  })();
  let lastTime = -1;
  let idleSince = 0, darkRestarts = 0;
  setInterval(async () => {
    // rest the camera when nothing's using it: no OBS link and the Webcam tab isn't open (for 90 seconds)
    if (C.tos.on && !tosBusy && !camWatchBusy) {
      const unused = livePeers() === 0 && !tabVisible() && Date.now() > streamUntil;
      if (tosStream && unused) {
        idleSince = idleSince || Date.now();
        if (Date.now() - idleSince > 90000) { stopTosCam(); camHealth.resting = true; idleSince = 0; tosStatus(); }
      } else idleSince = 0;
      if (!tosStream && camHealth.resting && tabVisible()) { camHealth.resting = false; startTosCam().then(tosStatus).catch(e => tosMsg(e.message, "err")); }
    }
    if (!C.tos.on || !tosStream || camWatchBusy || tosBusy || camHealth.gaveUp) { camStallSince = 0; camDarkCount = 0; return; }
    const now = Date.now(), track = tosStream.getVideoTracks()[0];
    // new frames arriving? (frame callbacks, or the video clock moving on)
    const moving = camFrames !== camLastFrames || tosVid.currentTime !== lastTime;
    camLastFrames = camFrames; lastTime = tosVid.currentTime;
    if (tosVid.paused) tosVid.play().catch(() => {});
    const stalled = !moving || (track && (track.muted || track.readyState !== "live"));
    camStallSince = stalled ? (camStallSince || now) : 0;
    // or is the picture pitch black (how sleeping cameras usually look)?
    let dark = false;
    if (!stalled && tosVid.videoWidth) {
      try {
        peekX.drawImage(tosVid, 0, 0, 32, 18);
        const d = peekX.getImageData(0, 0, 32, 18).data; let sum = 0;
        for (let i = 0; i < d.length; i += 4) sum += d[i] + d[i + 1] + d[i + 2];
        dark = sum / (d.length / 4) / 3 < 3;
      } catch (e) {}
    }
    camDarkCount = dark ? camDarkCount + 1 : 0; camHealth.dark = camDarkCount;
    if (!dark && !stalled) darkRestarts = 0;
    const wait = Math.min(60000, 4000 * Math.pow(2, Math.min(4, camRestarts)));   // don't hammer it
    if (((camStallSince && now - camStallSince > 3000) || camDarkCount >= 4) && now - camLastRestart > wait) {
      if (camDarkCount >= 4 && darkRestarts >= 3) { camHealth.gaveUp = true; tosStatus(); return; }   // stop poking a camera that won't wake (it may be overheating)
      if (camDarkCount >= 4) darkRestarts++;
      camWatchBusy = true; camLastRestart = now; camRestarts++;
      tosMsg(camDarkCount >= 4 ? "The camera's picture went black (it may have gone to sleep). Waking it up…" : "The camera stopped sending pictures. Restarting it…", "warn");
      stopTosCam();
      await sleep(600);
      try { await startTosCam(); tosMsg("Camera back ✓", "ok"); } catch (e) { tosMsg(e.message, "err"); }
      peers.forEach(p => sharpen(p.pc));
      camStallSince = 0; camDarkCount = 0; camWatchBusy = false;
    }
    if (now - camLastRestart > 120000) camRestarts = 0;   // calm again: reset the back-off
  }, 1000);
  syncTosUi();

