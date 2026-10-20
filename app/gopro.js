// GoPro over USB, with nothing extra to install.
// When a GoPro (HERO9 and newer) is plugged in over USB and set to "GoPro Connect", Windows sees it as a small
// network adapter. The camera lives at 172.2X.1YZ.51 and takes simple web commands on port 8080 (GoPro's
// published "Open GoPro" commands). In webcam mode it sends its live picture to this computer on UDP port 8554
// as an MPEG transport stream. This file starts and stops webcam mode, unpacks the video from the stream and
// hands the compressed frames to the TOS HUB page, which decodes them with the browser's own video decoder.
const http = require("http");
const dgram = require("dgram");
const os = require("os");

const UDP_PORT = 8554;
const sleep = ms => new Promise(r => setTimeout(r, ms));

function get(ip, path, timeout = 4000) {
  return new Promise((res, rej) => {
    const host = ip.includes(":") && !ip.startsWith("[") ? ip.split(":")[0] : ip;
    const port = ip.includes(":") ? +ip.split(":")[1] : 8080;
    const req = http.get({ host, port, path, timeout }, r => {
      let body = ""; r.setEncoding("utf8");
      r.on("data", d => { body += d; if (body.length > 1e5) req.destroy(); });
      r.on("end", () => { let json = null; try { json = JSON.parse(body); } catch (e) {} res({ status: r.statusCode, body, json }); });
    });
    req.on("timeout", () => req.destroy(new Error("timeout")));
    req.on("error", rej);
  });
}

// every USB GoPro gives this computer an address like 172.2X.1YZ.5n; the camera is .51 on the same network
function candidates() {
  const out = [];
  for (const list of Object.values(os.networkInterfaces())) for (const a of list || []) {
    if (a.family !== "IPv4" && a.family !== 4) continue;
    const m = /^172\.(2\d)\.(1\d\d)\.(\d+)$/.exec(a.address);
    if (m && m[3] !== "51") out.push(`172.${m[1]}.${m[2]}.51`);
  }
  return [...new Set(out)];
}

// MPEG transport stream → one compressed video frame at a time
class TsDemux {
  constructor(onFrame) { this.onFrame = onFrame; this.pmt = -1; this.vid = -1; this.hevc = false; this.pes = []; this.carry = null; this.types = []; this.sync = 0; }
  push(buf) {
    const b = this.carry ? Buffer.concat([this.carry, buf]) : buf;
    let i = 0;
    while (i + 188 <= b.length) {
      if (b[i] !== 0x47) { i++; this.sync++; continue; }
      try { this.packet(b, i); } catch (e) {}
      i += 188;
    }
    this.carry = i < b.length ? Buffer.from(b.subarray(i)) : null;
  }
  packet(b, o) {
    const pusi = b[o + 1] & 0x40, pid = ((b[o + 1] & 0x1f) << 8) | b[o + 2], afc = (b[o + 3] >> 4) & 3, end = o + 188;
    let p = o + 4;
    if (afc & 2) p += 1 + b[p];
    if (!(afc & 1) || p >= end) return;
    if (pid === 0) {   // programme list
      if (!pusi) return;
      p += 1 + b[p];
      const sl = ((b[p + 1] & 0xf) << 8) | b[p + 2], e = Math.min(end, p + 3 + sl - 4);
      for (let q = p + 8; q + 4 <= e; q += 4) { const prog = (b[q] << 8) | b[q + 1]; if (prog) this.pmt = ((b[q + 2] & 0x1f) << 8) | b[q + 3]; }
      return;
    }
    if (pid === this.pmt) {   // which stream is the video
      if (!pusi || this.vid >= 0) return;
      p += 1 + b[p];
      const sl = ((b[p + 1] & 0xf) << 8) | b[p + 2], pil = ((b[p + 10] & 0xf) << 8) | b[p + 11], e = Math.min(end, p + 3 + sl - 4);
      for (let q = p + 12 + pil; q + 5 <= e;) {
        const st = b[q], ep = ((b[q + 1] & 0x1f) << 8) | b[q + 2], il = ((b[q + 3] & 0xf) << 8) | b[q + 4];
        if (!this.types.includes(st) && this.types.length < 8) this.types.push(st);
        if (st === 0x1b || st === 0x24) { this.vid = ep; this.hevc = st === 0x24; break; }
        q += 5 + il;
      }
      return;
    }
    if (pid === this.vid) {
      if (pusi) this.flush();
      if (pusi || this.pes.length) this.pes.push(Buffer.from(b.subarray(p, end)));
    }
  }
  flush() {
    if (!this.pes.length) return;
    const pes = Buffer.concat(this.pes); this.pes = [];
    if (pes.length < 9 || pes[0] !== 0 || pes[1] !== 0 || pes[2] !== 1) return;
    const es = pes.subarray(9 + pes[8]);
    if (es.length) this.onFrame(es, this.hevc);
  }
}

// is this frame a fresh starting point (keyframe) for the decoder?
function isKey(es, hevc) {
  for (let i = 0; i + 3 < es.length; i++) {
    if (es[i] === 0 && es[i + 1] === 0 && es[i + 2] === 1) {
      const t = hevc ? (es[i + 3] >> 1) & 0x3f : es[i + 3] & 0x1f;
      if (hevc ? (t === 19 || t === 20 || t === 32) : (t === 5 || t === 7)) return true;
      i += 2;
    }
  }
  return false;
}

module.exports = function setupGoPro(ipcMain, getWin) {
  const st = { ip: "", sock: null, demux: null, timer: null, frames: 0, keys: 0, lastFrame: 0, opts: null, busy: false, pkts: 0, bytes: 0, from: "", startReply: "", lastErr: "" };
  const send = (ch, d) => { const w = getWin(); if (w && !w.isDestroyed()) w.webContents.send(ch, d); };

  async function find(ip) {
    const list = ip ? [ip] : candidates();
    if (!list.length) return "";
    for (const c of list) { try { const r = await get(c, "/gopro/webcam/status", 2500); if (r.status === 200) return c; } catch (e) {} }
    return ip ? "" : list[0];
  }
  function openSocket() {
    return new Promise((res, rej) => {
      if (st.sock) return res();
      const s = dgram.createSocket({ type: "udp4", reuseAddr: true });
      st.demux = new TsDemux((es, hevc) => {
        st.frames++; st.lastFrame = Date.now(); if (isKey(es, hevc)) st.keys++;
        send("gopro-frame", { d: es, k: isKey(es, hevc), h: hevc });
      });
      s.on("message", (m, rinfo) => { st.pkts++; st.bytes += m.length; st.from = rinfo && rinfo.address || st.from; if (st.demux) st.demux.push(m); });
      s.on("error", e => { try { s.close(); } catch (x) {} if (st.sock === s) st.sock = null; rej(e); });
      s.bind(UDP_PORT, () => { try { s.setRecvBufferSize(8 * 1024 * 1024); } catch (e) {} st.sock = s; res(); });
    });
  }
  function closeSocket() { if (st.sock) { try { st.sock.close(); } catch (e) {} } st.sock = null; st.demux = null; }

  // GoPro's webcam answers: https://gopro.github.io/OpenGoPro (error codes)
  const WEBCAM_ERR = { 1: "couldn't switch preset", 2: "couldn't set the size", 3: "couldn't start the stream", 4: "it's recording", 5: "it timed out",
    6: "it didn't accept the settings", 7: "webcam mode isn't available right now", 8: "it was leaving webcam mode" };
  const okReply = r => r && r.status === 200 && !(r.json && r.json.error);
  // Newer GoPros (HERO11+) use /gopro/webcam/…; HERO8–10 also have GoPro's older /gp/gpWebcam/… commands (what GoPro's own
  // webcam app uses on those). Try the newer ones first, then the older ones, and remember what each said for the GoPro check.
  async function startWebcam() {
    const o = st.opts || {}, attempts = st.attempts = [];
    const tryGet = async (path, ms = 8000, ip = st.ip) => {
      try { const r = await get(ip, path, ms); attempts.push(`${path} → ${r.status} ${String(r.body || "").replace(/\s+/g, " ").slice(0, 60)}`); return r; }
      catch (e) { attempts.push(`${path} → no answer (${e.code || e.message})`); return null; }
    };
    // Webcam mode won't start while the camera is under "USB control" (GoPro's own examples switch it OFF first), so make sure
    // it's off, and clear any half-started webcam
    await tryGet("/gopro/camera/control/wired_usb?p=0", 3000);
    try { const s = await get(st.ip, "/gopro/webcam/status", 2500); if (s.json && s.json.status >= 2) { await get(st.ip, "/gopro/webcam/stop", 3000).catch(() => {}); } } catch (e) {}
    await tryGet("/gopro/webcam/exit", 4000);
    await sleep(1000);
    const res = o.res || 12, fov = o.fov != null && o.fov !== "" ? +o.fov : null;
    const modern = [
      fov != null ? `/gopro/webcam/start?res=${res}&fov=${fov}` : null,
      `/gopro/webcam/start?res=${res}`,
      "/gopro/webcam/start",
      "/gopro/webcam/start?port=8554",
      "PREVIEW",
      "TOGGLE",
      res !== 7 ? "/gopro/webcam/start?res=7" : null
    ].filter(Boolean);
    let last = null;
    for (const p of modern) {
      if (p === "PREVIEW") { await tryGet("/gopro/webcam/preview", 5000); await sleep(800); last = await tryGet("/gopro/webcam/start"); }
      else if (p === "TOGGLE") {   // reported workaround for a camera stuck refusing commands: USB control on, then off again
        await tryGet("/gopro/camera/control/wired_usb?p=1", 3000); await sleep(800);
        await tryGet("/gopro/camera/control/wired_usb?p=0", 3000); await sleep(1200);
        last = await tryGet(`/gopro/webcam/start?res=${res}${fov != null ? "&fov=" + fov : ""}`);
      }
      else last = await tryGet(p);
      if (okReply(last)) { st.startReply = attempts[attempts.length - 1]; st.style = "new"; return; }
      await sleep(400);
    }
    // the older commands (HERO8, HERO9, HERO10)
    const lres = res === 7 ? 720 : 1080, lfov = fov == null ? null : fov === 2 ? 6 : fov;   // older narrow = 6
    const host = st.ip.split(":")[0], hosts = st.ip.includes(":") ? [st.ip] : [st.ip, host + ":80"];
    for (const ip of hosts) {
      await tryGet("/gp/gpWebcam/STOP", 3000, ip);
      for (const p of [`/gp/gpWebcam/START?res=${lres}`, "/gp/gpWebcam/START"]) {
        const r = await tryGet(p, 8000, ip);
        if (r && r.status === 200 && !(r.json && r.json.error)) {
          if (lfov != null) await tryGet(`/gp/gpWebcam/SETTINGS?fov=${lfov}`, 4000, ip);
          st.startReply = attempts[attempts.length - 1]; st.style = "old"; st.oldIp = ip; return;
        }
        if (r) last = r;
        await sleep(400);
      }
    }
    st.startReply = attempts.join(" | ");
    const code = last && last.json && last.json.error;
    throw new Error("The GoPro said no to webcam mode" + (code ? ` (code ${code}: ${WEBCAM_ERR[code] || "unknown"})` : "") + ". Put the camera on its normal photo/video screen (not a menu), make sure it isn't recording or too hot, then click Restart camera. If it still says no, its software may need updating in the GoPro Quik phone app.");
  }

  // keeps the camera awake and restarts webcam mode if the picture stops
  function watch() {
    clearInterval(st.timer);
    st.timer = setInterval(async () => {
      if (!st.ip || st.busy) return;
      try { await get(st.ip, "/gopro/camera/keep_alive", 2000); } catch (e) {}
      if (Date.now() - st.lastFrame > 6000) {
        st.busy = true;
        try { await startWebcam(); send("gopro-status", { msg: "GoPro picture stopped. Restarted it." }); }
        catch (e) { send("gopro-status", { msg: "GoPro not answering. Is it still plugged in and switched on?", err: true }); }
        finally { st.lastFrame = Date.now(); st.busy = false; }
      }
    }, 3000);
  }

  ipcMain.handle("gopro", async (e, cmd, opts) => {
    const w = getWin();
    if (!w || e.sender !== w.webContents) throw new Error("not allowed");
    if (cmd === "find") { const ip = await find(String((opts && opts.ip) || "").trim()); return { ok: !!ip, ip }; }
    if (cmd === "start") {
      st.opts = { res: +(opts && opts.res) === 7 ? 7 : 12, fov: opts && opts.fov != null ? String(+opts.fov) : "" };
      const ip = await find(String((opts && opts.ip) || "").trim());
      if (!ip) return { ok: false, error: "No GoPro found on USB. Switch it on and plug it in with a USB-C cable that carries data (the one that came with it is best), then give Windows about 10 seconds to see it. A HERO10 or newer needs no settings changed. A HERO9 needs Preferences → Connections → USB Connection set to “GoPro Connect”. If it still isn't found, try another USB port on the back of the PC." };
      st.ip = ip;
      try { await openSocket(); }
      catch (err) { return { ok: false, error: "Couldn't listen for the GoPro picture (port 8554 is in use, maybe by the GoPro Webcam app). Close that app and try again." }; }
      try { st.lastFrame = Date.now(); st.busy = true; await startWebcam(); }
      catch (err) { st.busy = false; st.lastErr = err.message; return { ok: false, error: /timeout|ECONN|EHOST|ENET/.test(err.message) ? `Found a GoPro network at ${ip} but the camera didn't answer. Unplug it, plug it back in and try again.` : err.message }; }
      st.busy = false; st.lastFrame = Date.now(); watch();
      return { ok: true, ip };
    }
    if (cmd === "stop") {
      clearInterval(st.timer); st.timer = null;
      const ip = st.ip; st.ip = "";
      closeSocket();
      if (ip) {
        if (st.style === "old") { try { await get(st.oldIp || ip, "/gp/gpWebcam/STOP", 3000); } catch (e) {} }
        else { try { await get(ip, "/gopro/webcam/stop", 3000); } catch (e) {} try { await get(ip, "/gopro/webcam/exit", 3000); } catch (e) {} }
      }
      return { ok: true };
    }
    if (cmd === "diag") {   // the GoPro check button: where does the chain stop?
      const nets = [];
      for (const [name, list] of Object.entries(os.networkInterfaces())) for (const a of list || []) if ((a.family === "IPv4" || a.family === 4) && !a.internal) nets.push(`${name}: ${a.address}`);
      const want = String((opts && opts.ip) || "").trim(), cands = want ? [want] : candidates();
      const replies = [];
      for (const c of cands.slice(0, 3)) {
        for (const p of ["/gopro/webcam/status", "/gp/gpWebcam/STATUS", "/gp/gpControl/info", "/gopro/version"]) {
          try { const r = await get(c, p, 2500); replies.push(`${c}${p} → ${r.status} ${String(r.body || "").replace(/\s+/g, " ").slice(0, 160)}`); }
          catch (err) { replies.push(`${c}${p} → no answer (${err.code || err.message})`); }
        }
      }
      return {
        nets, cands, replies, listening: !!st.sock, ip: st.ip, startReply: st.startReply, lastErr: st.lastErr, attempts: st.attempts || [], style: st.style || "",
        pkts: st.pkts, bytes: st.bytes, from: st.from, sync: st.demux ? st.demux.sync : 0,
        types: st.demux ? st.demux.types.map(x => "0x" + x.toString(16)) : [], videoPid: st.demux ? st.demux.vid : -1,
        frames: st.frames, keys: st.keys, age: st.lastFrame ? Date.now() - st.lastFrame : -1
      };
    }
    if (cmd === "status") return { on: !!st.ip, ip: st.ip, frames: st.frames, age: st.lastFrame ? Date.now() - st.lastFrame : -1 };
    throw new Error("unknown");
  });
  return { stop: () => { clearInterval(st.timer); closeSocket(); if (st.ip) { get(st.ip, "/gopro/webcam/stop", 1500).catch(() => {}); } } };
};
module.exports.TsDemux = TsDemux;
module.exports.isKey = isKey;
