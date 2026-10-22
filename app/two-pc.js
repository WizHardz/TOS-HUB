// Two PCs: TOS HUB on the streaming PC and TOS HUB on the gaming PC, talking over your home network.
// The streaming PC runs everything (OBS, Twitch, chat, webcam, pads). The gaming PC does the things that
// have to happen where the game is: pressing keys into the game, keybinds you press on the gaming keyboard,
// VoiceAttack (if it runs there), and an optional see-through layer that shows the stream's effects over the game.
//
//   streaming PC  ── listens on TCP 47822, answers "is anyone there?" on UDP 47823
//   gaming PC     ── asks "is anyone there?" on the network, connects, pairs once with the 6-digit code
//
// Messages are one JSON object per line. Both PCs prove they know the shared secret (made when pairing),
// so nothing else on the network can press keys on the gaming PC or pretend to be it.
const net = require("net");
const dgram = require("dgram");
const os = require("os");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const LINK_PORT = 47822, FIND_PORT = 47823;
const hmac = (key, text) => crypto.createHmac("sha256", String(key)).update(text).digest("hex");
const same = (a, b) => typeof a === "string" && typeof b === "string" && a.length === b.length && crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
const xorHex = (a, b) => Buffer.from(a, "hex").map((x, i) => x ^ Buffer.from(b, "hex")[i]).toString("hex");

// this PC's network addresses, with the broadcast address of each network ("everyone on this network")
function lanAddresses() {
  const out = [];
  Object.entries(os.networkInterfaces()).forEach(([name, list]) => (list || []).forEach(a => {
    if (a.family !== "IPv4" && a.family !== 4 || a.internal) return;
    const ip = a.address.split(".").map(Number), mask = a.netmask.split(".").map(Number);
    out.push({ name, address: a.address, broadcast: ip.map((n, i) => (n | (~mask[i] & 255))).join(".") });
  }));
  return out;
}

// one JSON-per-line connection, both ways
function lineSocket(sock, onMsg) {
  let buf = "";
  sock.setEncoding("utf8"); sock.setNoDelay(true);
  sock.on("data", d => {
    buf += d;
    if (buf.length > 1e6) { sock.destroy(); return; }   // nothing we send is ever that big
    let i;
    while ((i = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, i); buf = buf.slice(i + 1);
      let m; try { m = JSON.parse(line); } catch (e) { continue; }
      if (m && typeof m.t === "string") onMsg(m);
    }
  });
  return m => { try { if (!sock.destroyed) sock.write(JSON.stringify(m) + "\n"); } catch (e) {} };
}

module.exports = function twoPc({ app, BrowserWindow, screen, getWin, local }) {
  const cfgFile = () => path.join(app.getPath("userData"), "two-pc.json");
  const cfg = Object.assign({ role: "single", secret: "", peerName: "", peerHost: "", hud: { on: false, sound: false, display: 0 } },
    (() => { try { return JSON.parse(fs.readFileSync(cfgFile(), "utf8")); } catch (e) { return {}; } })());
  cfg.hud = Object.assign({ on: false, sound: false, display: 0 }, cfg.hud || {});
  const save = () => { try { fs.mkdirSync(app.getPath("userData"), { recursive: true }); fs.writeFileSync(cfgFile(), JSON.stringify(cfg, null, 2)); } catch (e) {} };
  const myName = os.hostname();

  // what the page shows
  const st = { up: false, peer: "", peerHost: "", code: "", found: [], err: "", log: [] };
  const note = text => { st.log.unshift({ at: Date.now(), text }); st.log.length = Math.min(st.log.length, 12); push(); };
  function info() {
    return { role: cfg.role, name: myName, paired: !!cfg.secret, up: st.up, peer: st.peer || cfg.peerName, peerHost: st.peerHost || cfg.peerHost,
      code: cfg.role === "streaming" ? st.code : "", found: st.found, err: st.err, log: st.log, hud: cfg.hud,
      addresses: lanAddresses().map(a => a.address), port: LINK_PORT,
      displays: screen.getAllDisplays().map((d, i) => ({ i, label: `Screen ${i + 1} (${d.size.width}×${d.size.height})${d.id === screen.getPrimaryDisplay().id ? " · main" : ""}` })) };
  }
  let pushT = null;
  function push() {
    clearTimeout(pushT);
    pushT = setTimeout(() => { const w = getWin(); if (w && !w.isDestroyed()) w.webContents.send("two-pc-state", info()); }, 30);
  }

  let send = () => {}, sock = null, pingT = null, lastHeard = 0, upHooks = [];
  const pending = new Map();
  let reqSeq = 0;
  function request(t, data, ms) {
    return new Promise(res => {
      if (!st.up) return res(null);
      const id = ++reqSeq;
      const timer = setTimeout(() => { pending.delete(id); res(null); }, ms || 5000);
      pending.set(id, v => { clearTimeout(timer); res(v); });
      send(Object.assign({ t, id }, data));
    });
  }
  function linkUp(s, sendFn, peer, host) {
    sock = s; send = sendFn; st.up = true; st.peer = peer; st.peerHost = host; st.err = "";
    if (cfg.peerName !== peer || cfg.peerHost !== host) { cfg.peerName = peer; cfg.peerHost = host; save(); }
    lastHeard = Date.now();
    clearInterval(pingT);
    pingT = setInterval(() => { if (Date.now() - lastHeard > 15000) { s.destroy(); return; } send({ t: "ping" }); }, 5000);
    note(`Linked to ${peer} ✓`);
    upHooks.forEach(f => { try { f(true); } catch (e) {} });
  }
  function linkDown(s, why) {
    if (s !== sock) return;
    sock = null; send = () => {}; clearInterval(pingT);
    pending.forEach(f => f(null)); pending.clear();
    if (st.up) { st.up = false; note(why || "Lost the link to the other PC. Trying again…"); upHooks.forEach(f => { try { f(false); } catch (e) {} }); }
    push();
  }
  // messages both sides understand; the rest depends on which PC this is
  function common(m) {
    lastHeard = Date.now();
    if (m.t === "ping") { send({ t: "pong" }); return true; }
    if (m.t === "pong") return true;
    if (m.t === "re" && pending.has(m.id)) { const f = pending.get(m.id); pending.delete(m.id); f(m.res); return true; }
    return false;
  }

  // ================= streaming PC: waits for the gaming PC =================
  let server = null, finder = null, obsConn = null, wrongCodes = 0;
  const newCode = () => { st.code = String(crypto.randomInt(0, 1e6)).padStart(6, "0"); };
  function startStreaming() {
    if (!cfg.secret) newCode();
    server = net.createServer(s => {
      const sn = crypto.randomBytes(16).toString("hex");
      let authed = false;
      const out = lineSocket(s, m => {
        if (!authed) {
          if (m.t !== "auth" && m.t !== "pair" || typeof m.cn !== "string") return s.destroy();
          const msg = sn + m.cn, peer = String(m.name || "Gaming PC").slice(0, 60);
          if (m.t === "auth") {
            if (!cfg.secret || !same(m.proof, hmac(cfg.secret, "c" + msg))) { out({ t: "denied", why: "pair" }); return s.end(); }
            out({ t: "ready", name: myName, proof: hmac(cfg.secret, "s" + msg) });
          } else {
            if (!st.code || !same(m.proof, hmac(st.code, "c" + msg))) {
              out({ t: "denied", why: "code" }); note(`${peer} tried a wrong code`);
              if (++wrongCodes >= 5) { wrongCodes = 0; newCode(); note("Too many wrong codes, so here's a new one"); }   // no guessing all million codes
              return s.end();
            }
            wrongCodes = 0;
            const secret = crypto.randomBytes(32).toString("hex");
            out({ t: "paired", name: myName, proof: hmac(st.code, "s" + msg), box: xorHex(secret, hmac(st.code, "k" + msg)) });
            cfg.secret = secret; st.code = ""; save();
          }
          authed = true;
          if (sock) sock.destroy();   // only one gaming PC at a time: the newest wins
          linkUp(s, out, peer, s.remoteAddress.replace(/^::ffff:/, ""));
          sendHud();
          return;
        }
        if (common(m)) return;
        if (m.t === "cmd" && typeof m.cmd === "string") { const w = getWin(); if (w && !w.isDestroyed()) w.webContents.send("voice-cmd", m.cmd); }
      });
      out({ t: "hello", name: myName, sn });   // the streaming PC speaks first
      s.setTimeout(20000, () => { if (!authed) s.destroy(); });
      s.on("close", () => linkDown(s));
      s.on("error", () => {});
    });
    server.on("error", e => { st.err = e.code === "EADDRINUSE" ? `Another program is using port ${LINK_PORT}.` : String(e.message || e); push(); });
    server.listen(LINK_PORT, "0.0.0.0");
    // answer "is there a streaming PC here?" from gaming PCs on the network
    finder = dgram.createSocket({ type: "udp4", reuseAddr: true });
    finder.on("message", (b, r) => {
      let m; try { m = JSON.parse(b.toString()); } catch (e) { return; }
      if (m && m.tos === "find") finder.send(JSON.stringify({ tos: "here", name: myName, port: LINK_PORT, paired: !!cfg.secret }), r.port, r.address);
    });
    finder.on("error", () => {});
    finder.bind(FIND_PORT);
  }
  // the see-through effects layer on the gaming PC connects straight to OBS on this PC
  function sendHud() {
    if (cfg.role !== "streaming" || !st.up || !obsConn) return;
    send({ t: "obs", port: obsConn.port, pw: obsConn.pw, host: obsConn.host });
  }

  // ================= gaming PC: finds the streaming PC and does what it asks =================
  let findT = null, seeker = null, retryT = null, hud = null, hudObs = null;
  function seek() {
    if (st.up) return;
    if (!seeker) {
      seeker = dgram.createSocket({ type: "udp4", reuseAddr: true });
      seeker.on("message", (b, r) => {
        let m; try { m = JSON.parse(b.toString()); } catch (e) { return; }
        if (!m || m.tos !== "here") return;
        const f = { name: String(m.name || "Streaming PC").slice(0, 60), host: r.address, port: +m.port || LINK_PORT, paired: !!m.paired, seen: Date.now() };
        st.found = st.found.filter(x => x.host !== f.host && Date.now() - x.seen < 15000).concat(f);
        push();
        if (cfg.secret && !st.up && !sock && (!cfg.peerHost || cfg.peerHost === f.host || cfg.peerName === f.name)) connect(f.host, f.port);
      });
      seeker.on("error", () => {});
      seeker.bind(0, () => { try { seeker.setBroadcast(true); } catch (e) {} });
    }
    const msg = Buffer.from(JSON.stringify({ tos: "find", name: myName }));
    new Set(["255.255.255.255"].concat(lanAddresses().map(a => a.broadcast))).forEach(to => { try { seeker.send(msg, FIND_PORT, to); } catch (e) {} });
  }
  function connect(host, port, code) {
    if (sock && !sock.destroyed) { if (!code) return; sock.destroy(); }
    const s = net.connect({ host, port: port || LINK_PORT });
    sock = s;
    const cn = crypto.randomBytes(16).toString("hex");
    let sn = "", ok = false;
    const out = lineSocket(s, m => {
      if (!ok) {
        if (m.t === "hello" && typeof m.sn === "string" && !sn) {
          sn = m.sn;
          if (code) out({ t: "pair", name: myName, cn, proof: hmac(code, "c" + sn + cn) });
          else if (cfg.secret) out({ t: "auth", name: myName, cn, proof: hmac(cfg.secret, "c" + sn + cn) });
          else s.destroy();
        } else if (m.t === "paired" && code && same(m.proof, hmac(code, "s" + sn + cn)) && /^[0-9a-f]{64}$/.test(m.box || "")) {
          cfg.secret = xorHex(m.box, hmac(code, "k" + sn + cn)); save(); ok = true;
          linkUp(s, out, String(m.name || host), host);
        } else if (m.t === "ready" && cfg.secret && same(m.proof, hmac(cfg.secret, "s" + sn + cn))) {
          ok = true; linkUp(s, out, String(m.name || host), host);
        } else if (m.t === "denied") {
          st.err = m.why === "code" ? "That code didn't match. Check the code on the streaming PC's Two PCs tab." : "The streaming PC doesn't know this PC any more. Pair again with its code.";
          if (m.why !== "code") { cfg.secret = ""; save(); }
          push(); s.destroy();
        } else s.destroy();   // anything else before we trust each other: hang up
        return;
      }
      if (common(m)) return;
      if (m.t === "press") local.pressKeys({ acc: m.acc, hold: m.hold }).then(res => { send({ t: "re", id: m.id, res }); if (res && res.ok) note(`Pressed ${m.acc}`); });
      else if (m.t === "keys") send({ t: "re", id: m.id, res: local.setKeybinds(Array.isArray(m.list) ? m.list : [], cmd => send({ t: "cmd", cmd })) });
      else if (m.t === "obs") { hudObs = { host: m.host && !/^(localhost|127\.)/.test(m.host) ? m.host : host, port: String(m.port || "4455"), pw: String(m.pw || "") }; showHud(); }
    });
    s.on("connect", () => { st.err = ""; });
    s.setTimeout(20000, () => { if (!ok) s.destroy(); });
    s.on("close", () => { linkDown(s); if (sock === s) sock = null; local.setKeybinds([], () => {}); if (cfg.role === "gaming") { clearTimeout(retryT); retryT = setTimeout(() => cfg.peerHost && cfg.secret && connect(cfg.peerHost), 4000); } });
    s.on("error", e => { if (code || !st.found.length) { st.err = e.code === "ECONNREFUSED" ? `Nothing answered at ${host}. Is TOS HUB open there, set to Streaming PC?` : e.code === "ETIMEDOUT" || e.code === "EHOSTUNREACH" ? `Couldn't reach ${host}. Check the address, and that Windows Firewall lets TOS HUB through on the streaming PC.` : String(e.message || e); push(); } });
  }
  function startGaming() {
    seek(); findT = setInterval(seek, 3000);
    if (cfg.secret && cfg.peerHost) connect(cfg.peerHost);
  }

  // ---- the see-through effects layer over the game ----
  function hudUrl() {
    const q = new URLSearchParams({ layer: "screen", style: "none", cam: "", testCard: "0", name: "", sub: "", sound: cfg.hud.sound ? "1" : "0",
      host: hudObs.host, port: hudObs.port, pw: hudObs.pw });
    return "file:///" + path.join(__dirname, "cam-frame.html").replace(/\\/g, "/").replace(/^\/+/, "") + "?" + q.toString();
  }
  function showHud() {
    const want = cfg.role === "gaming" && cfg.hud.on && hudObs;
    if (!want) { if (hud && !hud.isDestroyed()) hud.close(); hud = null; push(); return; }
    const ds = screen.getAllDisplays(), d = ds[cfg.hud.display] || screen.getPrimaryDisplay(), b = d.bounds;
    if (!hud || hud.isDestroyed()) {
      hud = new BrowserWindow({ x: b.x, y: b.y, width: b.width, height: b.height, frame: false, transparent: true, backgroundColor: "#00000000",
        hasShadow: false, resizable: false, movable: false, focusable: false, skipTaskbar: true, alwaysOnTop: true, show: false, title: "TOS HUB effects",
        webPreferences: { contextIsolation: true, sandbox: true, backgroundThrottling: false } });
      hud.setAlwaysOnTop(true, "screen-saver");
      hud.setIgnoreMouseEvents(true);   // clicks go straight through to the game
      hud.setVisibleOnAllWorkspaces(true);
      hud.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
      hud.webContents.on("will-navigate", e => e.preventDefault());
      hud.once("ready-to-show", () => hud && !hud.isDestroyed() && hud.showInactive());
      hud.on("closed", () => { hud = null; });
    } else hud.setBounds(b);
    hud.loadURL(hudUrl());
    push();
  }

  // ================= what main.js and the pages call =================
  function start() {
    if (cfg.role === "streaming") startStreaming();
    else if (cfg.role === "gaming") startGaming();
  }
  function stop() {
    try { server && server.close(); } catch (e) {} try { finder && finder.close(); } catch (e) {} try { seeker && seeker.close(); } catch (e) {}
    clearInterval(findT); clearTimeout(retryT); if (sock) sock.destroy();
    if (hud && !hud.isDestroyed()) hud.close();
  }
  return {
    role: () => cfg.role,
    up: () => st.up,
    info, start, stop, request,
    onLink: f => upHooks.push(f),
    setRole(role) {
      if (!["single", "streaming", "gaming"].includes(role) || role === cfg.role) return false;
      cfg.role = role; cfg.secret = ""; cfg.peerName = ""; cfg.peerHost = ""; save();
      return true;
    },
    forget() { cfg.secret = ""; cfg.peerName = ""; cfg.peerHost = ""; save(); if (sock) sock.destroy(); if (cfg.role === "streaming") newCode(); push(); },
    newCode() { if (cfg.role === "streaming") { newCode(); push(); } },
    pair(host, port, code) {
      code = String(code || "").replace(/\D/g, "");
      if (cfg.role !== "gaming" || code.length !== 6 || !host) return false;
      st.err = ""; connect(String(host).trim(), +port || LINK_PORT, code); return true;
    },
    setObs(c) {   // the streaming page tells us how to reach OBS (so the gaming PC's effects layer can too)
      const n = c && { host: String(c.host || "localhost"), port: String(c.port || "4455"), pw: String(c.pw || "") };
      if (!n || JSON.stringify(n) === JSON.stringify(obsConn)) return;
      obsConn = n; sendHud();
    },
    setHud(h) { cfg.hud = Object.assign(cfg.hud, h || {}); cfg.hud.display = +cfg.hud.display || 0; save(); showHud(); },
    testHud() {
      if (!hud || hud.isDestroyed()) return false;
      hud.webContents.executeJavaScript(`window.wizcam && window.wizcam({ type: "fx", effect: "confetti", target: "screen", by: "Test" })`).catch(() => {});
      return true;
    },
    // the gaming PC passes its own VoiceAttack commands along to the streaming PC
    toHub(cmd) { if (cfg.role === "gaming" && st.up) { send({ t: "cmd", cmd }); return true; } return false; }
  };
};
