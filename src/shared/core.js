(() => {
  "use strict";
  const $ = s => document.querySelector(s);

  // ---------- storage ----------
  const store = {
    get(k, d) { try { const v = localStorage.getItem("padbridge." + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem("padbridge." + k, JSON.stringify(v)); } catch (e) {} }
  };

  // ---------- SHA-256 (uses browser crypto, with a fallback) ----------
  function sha256js(bytes) {
    const K = [0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,
      0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,
      0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,
      0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,
      0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,
      0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,
      0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,
      0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2];
    const H = [0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19];
    const len = bytes.length, bitLen = len * 8;
    const total = ((len + 9 + 63) >> 6) << 6;
    const m = new Uint8Array(total);
    m.set(bytes); m[len] = 0x80;
    const dv = new DataView(m.buffer);
    dv.setUint32(total - 4, bitLen >>> 0);
    dv.setUint32(total - 8, Math.floor(bitLen / 0x100000000));
    const w = new Uint32Array(64);
    const r = (x, n) => (x >>> n) | (x << (32 - n));
    for (let o = 0; o < total; o += 64) {
      for (let i = 0; i < 16; i++) w[i] = dv.getUint32(o + i * 4);
      for (let i = 16; i < 64; i++) {
        const s0 = r(w[i-15],7) ^ r(w[i-15],18) ^ (w[i-15] >>> 3);
        const s1 = r(w[i-2],17) ^ r(w[i-2],19) ^ (w[i-2] >>> 10);
        w[i] = (w[i-16] + s0 + w[i-7] + s1) >>> 0;
      }
      let [a,b,c,d,e,f,g,h] = H;
      for (let i = 0; i < 64; i++) {
        const t1 = (h + (r(e,6) ^ r(e,11) ^ r(e,25)) + ((e & f) ^ (~e & g)) + K[i] + w[i]) >>> 0;
        const t2 = ((r(a,2) ^ r(a,13) ^ r(a,22)) + ((a & b) ^ (a & c) ^ (b & c))) >>> 0;
        h = g; g = f; f = e; e = (d + t1) >>> 0; d = c; c = b; b = a; a = (t1 + t2) >>> 0;
      }
      H[0]=(H[0]+a)>>>0; H[1]=(H[1]+b)>>>0; H[2]=(H[2]+c)>>>0; H[3]=(H[3]+d)>>>0;
      H[4]=(H[4]+e)>>>0; H[5]=(H[5]+f)>>>0; H[6]=(H[6]+g)>>>0; H[7]=(H[7]+h)>>>0;
    }
    const out = new Uint8Array(32);
    const odv = new DataView(out.buffer);
    H.forEach((v, i) => odv.setUint32(i * 4, v));
    return out;
  }
  function toB64(bytes) { let s = ""; for (const b of bytes) s += String.fromCharCode(b); return btoa(s); }
  async function sha256b64(str) {
    const data = new TextEncoder().encode(str);
    try {
      if (window.crypto && crypto.subtle) return toB64(new Uint8Array(await crypto.subtle.digest("SHA-256", data)));
    } catch (e) {}
    return toB64(sha256js(data));
  }

  // ---------- activity log ----------
  const logEl = $("#log");
  let logStarted = false;
  function log(text, isErr) {
    if (!logStarted) { logEl.innerHTML = ""; logStarted = true; }
    const d = document.createElement("div");
    const t = new Date().toLocaleTimeString();
    d.textContent = `${t}  ${text}`;
    if (isErr) d.className = "err";
    logEl.prepend(d);
    while (logEl.children.length > 40) logEl.lastChild.remove();
  }

  // ---------- OBS WebSocket v5 ----------
  const SCENE_EVENTS = new Set(["SceneCreated","SceneRemoved","SceneNameChanged","SceneItemCreated","SceneItemRemoved","InputNameChanged","SceneListChanged","InputCreated","InputRemoved"]);
  const FILTER_EVENTS = new Set(["SourceFilterCreated","SourceFilterRemoved","SourceFilterNameChanged"]);
  // plain-English help under the OBS connection box
  function obsNote(text, cls, openHelp) {
    const m = $("#obsMsg"); if (!m) return;
    m.textContent = text || ""; m.className = "note " + (cls || "");
    if (openHelp === true) $("#obsHelp").open = true;
    if (openHelp === false) $("#obsHelp").open = false;
  }
  const obs = {
    ws: null, connected: false, wantConnect: false, retryTimer: null,
    pending: new Map(), nextId: 1,
    scenes: [],            // ["Scene A", ...]
    items: {},             // sceneName -> [{label, itemScene, source}]
    inputs: [],            // ["Mic", "Alert video", ...]
    filters: {},           // sourceName -> ["Filter A", ...]
    current: "", previous: "",
    refreshTimer: null,

    async loadFilters(source) {
      if (!this.connected || !source || this.filters[source]) return;
      this.filters[source] = [];
      try {
        const r = await this.request("GetSourceFilterList", { sourceName: source });
        this.filters[source] = (r.filters || []).map(f => f.filterName);
      } catch (e) { delete this.filters[source]; }
      renderMaps();
    },

    setStatus(text, cls) {
      $("#obsStatus").textContent = "OBS: " + text;
      $("#obsDot").className = "dot " + (cls || "");
      $("#connectBtn").textContent = this.connected || this.wantConnect ? "Disconnect" : "Connect";
    },

    connect() {
      this.disconnect(true);
      this.wantConnect = true;
      const host = $("#host").value.trim() || "localhost";
      const port = $("#port").value.trim() || "4455";
      const password = $("#password").value;
      saveConn();
      this.setStatus("connecting…", "warn");
      if (!this.retrying) obsNote(`Connecting to OBS at ${host}:${port}…`);
      let ws, gotHello = false;
      try { ws = new WebSocket(`ws://${host}:${port}`); }
      catch (e) { this.setStatus("bad address", "bad"); this.wantConnect = false; obsNote("That Host or Port doesn't look right. Use localhost and 4455 unless OBS is on another computer.", "err", true); return; }
      this.ws = ws;

      ws.onmessage = async ev => {
        let msg; try { msg = JSON.parse(ev.data); } catch (e) { return; }
        const d = msg.d || {};
        if (msg.op === 0) {
          gotHello = true;
          const ident = { rpcVersion: 1, eventSubscriptions: this.subs() };
          if (d.authentication) {
            if (!password) {
              this.setStatus("needs password", "bad"); this.wantConnect = false; ws.close();
              obsNote("OBS found! It needs its password: in OBS go to Tools → WebSocket Server Settings → Show Connect Info, click Copy next to Server Password, paste it above and click Connect.", "err", true);
              return;
            }
            const secret = await sha256b64(password + d.authentication.salt);
            ident.authentication = await sha256b64(secret + d.authentication.challenge);
          }
          ws.send(JSON.stringify({ op: 1, d: ident }));
        } else if (msg.op === 2) {
          this.connected = true; this.retrying = false;
          this.setStatus("connected", "good");
          log("Connected to OBS");
          obsNote("Connected to OBS ✓", "ok", false);
          this.request("GetVersion").then(v => { if (this.connected && v.obsVersion) obsNote(`Connected to OBS ${v.obsVersion} ✓`, "ok"); }).catch(() => {});
          this.refresh();
        } else if (msg.op === 7) {
          const p = this.pending.get(d.requestId);
          if (!p) return;
          this.pending.delete(d.requestId);
          clearTimeout(p.timer);
          if (d.requestStatus && d.requestStatus.result) p.res(d.responseData || {});
          else p.rej(new Error((d.requestStatus && d.requestStatus.comment) || "OBS refused the request"));
        } else if (msg.op === 5) {
          const ed = d.eventData || {};
          if (d.eventType === "CustomEvent" && ed.wizcamPong) {
            window.dispatchEvent(new Event("wizcam-pong"));
          } else if (d.eventType === "InputVolumeMeters") {
            window.dispatchEvent(new CustomEvent("obs-meters", { detail: ed.inputs || [] }));
          } else if (d.eventType === "InputMuteStateChanged") {
            window.dispatchEvent(new CustomEvent("obs-mute", { detail: ed }));
          } else if (d.eventType === "ReplayBufferSaved") {
            window.dispatchEvent(new CustomEvent("obs-replay-saved", { detail: ed.savedReplayPath || "" }));
          } else if (d.eventType === "CustomEvent" && ed.wizcam && /^rtc-(hello|answer)$/.test(ed.type || "")) {
            window.dispatchEvent(new CustomEvent("wizcam-rtc", { detail: ed }));
          } else if (d.eventType === "CurrentProgramSceneChanged") {
            if (this.current && this.current !== ed.sceneName) this.previous = this.current;
            this.current = ed.sceneName;
          } else if (FILTER_EVENTS.has(d.eventType)) {
            delete this.filters[ed.sourceName];
            renderMaps();
          } else if (SCENE_EVENTS.has(d.eventType)) {
            clearTimeout(this.refreshTimer);
            this.refreshTimer = setTimeout(() => this.refresh(), 400);
          }
        }
      };

      ws.onclose = ev => {
        if (this.ws !== ws) return;
        const was = this.connected;
        this.connected = false;
        this.ws = null;
        for (const p of this.pending.values()) { clearTimeout(p.timer); p.rej(new Error("OBS disconnected")); }
        this.pending.clear();
        if (ev.code === 4009) {
          this.wantConnect = false; this.retrying = false;
          this.setStatus("wrong password", "bad");
          log("OBS rejected the password", true);
          obsNote("That password didn't match. In OBS open Tools → WebSocket Server Settings → Show Connect Info, click Copy next to Server Password, paste it above (replacing what's there) and click Connect.", "err", true);
          return;
        }
        if (was) { log("Lost connection to OBS", true); obsNote("Lost the connection to OBS (was it closed?). Reconnecting by itself…", "warn"); }
        else if (!gotHello && this.wantConnect && !this.retrying) {
          const h = $("#host").value.trim() || "localhost", pt = $("#port").value.trim() || "4455";
          obsNote(`Can't reach OBS at ${h}:${pt}. Check OBS is open and “Enable WebSocket server” is ticked (steps above), and that the port matches. TOS HUB keeps trying every few seconds.`, "err", true);
        }
        if (this.wantConnect) {
          this.retrying = true;
          this.setStatus("reconnecting…", "warn");
          clearTimeout(this.retryTimer);
          this.retryTimer = setTimeout(() => { if (this.wantConnect) this.connect(); }, 3000);
        } else {
          this.setStatus("not connected", "");
        }
      };
      ws.onerror = () => {};
    },

    disconnect(silent) {
      this.wantConnect = false; this.retrying = false;
      if (!silent) obsNote("Disconnected from OBS.");
      clearTimeout(this.retryTimer);
      if (this.ws) { const w = this.ws; this.ws = null; try { w.close(); } catch (e) {} }
      this.connected = false;
      if (!silent) this.setStatus("not connected", "");
    },

    // which OBS events to hear; audio meters (20 a second) only while something is showing them
    subs() { return (1 << 0) | (1 << 2) | (1 << 3) | (1 << 5) | (1 << 6) | (1 << 7) | (this.wantMeters ? 1 << 16 : 0); },
    meters(on) {
      on = !!on; if (on === !!this.wantMeters) return;
      this.wantMeters = on;
      if (this.connected && this.ws) try { this.ws.send(JSON.stringify({ op: 3, d: { eventSubscriptions: this.subs() } })); } catch (e) {}
    },

    request(type, data) {
      return new Promise((res, rej) => {
        if (!this.connected || !this.ws) return rej(new Error("OBS not connected"));
        const id = String(this.nextId++);
        const timer = setTimeout(() => { if (this.pending.delete(id)) rej(new Error("OBS didn't answer")); }, 5000);
        this.pending.set(id, { res, rej, timer });
        this.ws.send(JSON.stringify({ op: 6, d: { requestType: type, requestId: id, requestData: data || {} } }));
      });
    },

    async refresh() {
      if (!this.connected) return;
      try {
        const { scenes } = await this.request("GetSceneList");
        const ordered = (scenes || []).slice().sort((a, b) => b.sceneIndex - a.sceneIndex).map(s => s.sceneName);
        const items = {};
        for (const sc of ordered) {
          const list = [];
          const r = await this.request("GetSceneItemList", { sceneName: sc });
          const its = (r.sceneItems || []).slice().sort((a, b) => b.sceneItemIndex - a.sceneItemIndex);
          for (const it of its) {
            list.push({ label: it.sourceName, itemScene: sc, source: it.sourceName });
            if (it.isGroup) {
              try {
                const g = await this.request("GetGroupSceneItemList", { sceneName: it.sourceName });
                (g.sceneItems || []).slice().sort((a, b) => b.sceneItemIndex - a.sceneItemIndex).forEach(c => {
                  list.push({ label: `${it.sourceName} › ${c.sourceName}`, itemScene: it.sourceName, source: c.sourceName });
                });
              } catch (e) {}
            }
          }
          items[sc] = list;
        }
        this.scenes = ordered;
        this.items = items;
        try {
          const ins = await this.request("GetInputList");
          this.inputs = (ins.inputs || []).map(i => i.inputName).sort((a, b) => a.localeCompare(b));
          this.kinds = {}; (ins.inputs || []).forEach(i => { this.kinds[i.inputName] = i.inputKind; });
        } catch (e) {}
        try {
          const cur = await this.request("GetCurrentProgramScene");
          this.current = cur.currentProgramSceneName || cur.sceneName || this.current;
        } catch (e) {}
        this.filters = {};
        renderMaps();
      } catch (e) {
        log("Couldn't read scenes: " + e.message, true);
      }
    }
  };

  window.hubObs = obs; // shared with the Chat Overlay tab

  // ---------- connection settings ----------
  function saveConn() {
    const remember = $("#remember").checked;
    store.set("conn", {
      host: $("#host").value.trim(), port: $("#port").value.trim(),
      remember, password: remember ? $("#password").value : ""
    });
  }
  function loadConn() {
    const c = store.get("conn", null);
    if (!c) return false;
    if (c.host) $("#host").value = c.host;
    if (c.port) $("#port").value = c.port;
    $("#remember").checked = !!c.remember;
    if (c.remember && c.password) $("#password").value = c.password;
    return true;
  }
  $("#connectBtn").onclick = () => { if (obs.connected || obs.wantConnect) obs.disconnect(); else obs.connect(); };
  $("#remember").onchange = saveConn;
  $("#password").addEventListener("keydown", e => { if (e.key === "Enter") obs.connect(); });

