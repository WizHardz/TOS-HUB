// TOS HUB desktop app: a window that runs stream-hub.html, with no browser around it.
const { app, BrowserWindow, Menu, session, shell, ipcMain, globalShortcut, screen, powerSaveBlocker } = require("electron");
const path = require("path");
const fs = require("fs");

app.setAppUserModelId("TOSHUB.WizHardz");
// Keep using the settings folder from when the app was called "Stream Hub", so nothing is lost.
app.setPath("userData", path.join(app.getPath("appData"), "Stream Hub"));
Menu.setApplicationMenu(null);
// Keep working when the TOS HUB window is minimised or behind a game: Chromium normally slows down or
// pauses pages it thinks you can't see, which can starve the webcam (some cameras then fall asleep).
app.commandLine.appendSwitch("disable-renderer-backgrounding");
app.commandLine.appendSwitch("disable-background-timer-throttling");
app.commandLine.appendSwitch("disable-backgrounding-occluded-windows");
app.commandLine.appendSwitch("disable-background-media-suspend");
app.commandLine.appendSwitch("disable-features", "CalculateNativeWinOcclusion,IntensiveWakeUpThrottling");

// Only one TOS HUB at a time (two would fight over the Duo's MIDI port).
if (!app.requestSingleInstanceLock()) { app.quit(); }

let win = null;

function isTwitchAuth(url) {
  return /^https:\/\/id\.twitch\.tv\/oauth2\/authorize/i.test(url);
}
function isTwitchReply(url) {
  return /^http:\/\/localhost(?::\d+)?\/?([?#]|$)/i.test(url);
}

// Twitch login opens in its own small window; when Twitch sends you back to
// http://localhost, the app catches that address and passes it to TOS HUB.
function openTwitchLogin(url) {
  const auth = new BrowserWindow({
    parent: win, width: 520, height: 760, title: "Log in with Twitch",
    autoHideMenuBar: true, backgroundColor: "#0e0e10",
    webPreferences: { contextIsolation: true, sandbox: true }
  });
  let handled = false;
  const catchReply = (e, target) => {
    if (handled || !target || !isTwitchReply(target)) return false;
    handled = true;
    if (e && e.preventDefault) e.preventDefault();
    win.webContents.executeJavaScript(`window.__twitchAuth && window.__twitchAuth(${JSON.stringify(target)})`).catch(() => {});
    setTimeout(() => { if (!auth.isDestroyed()) auth.close(); }, 50);
    return true;
  };
  auth.webContents.on("will-redirect", (e, target) => catchReply(e, target));
  auth.webContents.on("will-navigate", (e, target) => catchReply(e, target));
  auth.webContents.on("did-navigate", (e, target) => catchReply(null, target));
  auth.webContents.on("did-fail-load", (e, code, desc, target) => catchReply(null, target));
  // links inside the Twitch window that open new windows go to the normal browser
  auth.webContents.setWindowOpenHandler(({ url: u }) => { shell.openExternal(u); return { action: "deny" }; });
  auth.loadURL(url);
}

function createWindow() {
  const gaming = twoPc.role() === "gaming";
  win = new BrowserWindow({
    width: gaming ? 560 : 1280, height: gaming ? 760 : 720, useContentSize: true, minWidth: gaming ? 420 : 640, minHeight: 480,
    title: gaming ? "TOS HUB · Gaming PC" : "TOS HUB", backgroundColor: "#0c0418",
    icon: path.join(__dirname, "tos-hub.ico"),
    autoHideMenuBar: true,
    webPreferences: { contextIsolation: true, sandbox: true, backgroundThrottling: false, preload: path.join(__dirname, "preload.js") }
  });

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (isTwitchAuth(url)) { openTwitchLogin(url); return { action: "deny" }; }
    if (/^https?:/i.test(url)) shell.openExternal(url);
    return { action: "deny" };
  });
  // never let the main window wander off to a website
  win.webContents.on("will-navigate", (e, url) => {
    if (!url.startsWith("file:")) { e.preventDefault(); if (/^https?:/i.test(url)) shell.openExternal(url); }
  });

  win.loadFile(path.join(__dirname, twoPc.role() === "gaming" ? "gaming-pc.html" : "stream-hub.html"));
  win.on("page-title-updated", e => e.preventDefault()); // keep the title "TOS HUB"
  win.on("closed", () => { if (chatWin && !chatWin.isDestroyed()) chatWin.close(); twoPc.stop(); });
}

// Saves the webcam shape picture (a PNG) where OBS can read it. Only the main window may ask,
// only PNGs, only these file names, only into TOS HUB's own "masks" folder.
ipcMain.handle("save-mask", async (e, msg) => {
  if (!win || e.sender !== win.webContents) throw new Error("not allowed");
  const name = String((msg && msg.name) || "");
  const data = String((msg && msg.dataUrl) || "");
  if (!/^cam-mask-[ab]\.png$/.test(name)) throw new Error("bad name");
  if (!data.startsWith("data:image/png;base64,") || data.length > 12e6) throw new Error("bad image");
  const dir = path.join(app.getPath("userData"), "masks");
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, name);
  fs.writeFileSync(file, Buffer.from(data.slice(22), "base64"));
  return file;
});

// Lets the page read the face/hand/background tracking files that ship with the app (in its "vision" and
// "seg" folders). Only the main window, only those two folders, only these kinds of file.
ipcMain.handle("read-asset", async (e, name) => {
  if (!win || e.sender !== win.webContents) throw new Error("not allowed");
  const n = String(name || "");
  if (!/^(vision|seg)\/[a-z0-9_-]+\.(wasm|task|tflite|binarypb|onnx|mjs)$/.test(n)) throw new Error("bad name");
  return fs.promises.readFile(path.join(__dirname, n));
});

// ---------- chat on my screen ----------
// A see-through window that floats over your game showing Twitch chat. Clicks go straight through it,
// and it's hidden from screen capture (so OBS can't put it on stream). Only TOS HUB's main window
// controls it.
let chatWin = null, chatUnlocked = false, chatCfg = { hideFromCapture: true }, chatBacklog = [];
const chatStateFile = () => path.join(app.getPath("userData"), "screen-chat.json");
function loadChatBounds() {
  try { const b = JSON.parse(fs.readFileSync(chatStateFile(), "utf8")).bounds; if (b && b.width > 100) return b; } catch (e) {}
  const wa = screen.getPrimaryDisplay().workArea;
  return { width: 380, height: 520, x: wa.x + wa.width - 400, y: wa.y + Math.round(wa.height * .25) };
}
function saveChatBounds() {
  if (!chatWin || chatWin.isDestroyed()) return;
  try { fs.writeFileSync(chatStateFile(), JSON.stringify({ bounds: chatWin.getBounds() })); } catch (e) {}
}
function chatSend(m) { if (chatWin && !chatWin.isDestroyed()) chatWin.webContents.send("chat-msg", m); }
function setChatUnlocked(on) {
  chatUnlocked = !!on;
  if (!chatWin || chatWin.isDestroyed()) return;
  chatWin.setIgnoreMouseEvents(!chatUnlocked, { forward: true });
  chatWin.setFocusable(chatUnlocked);
  if (chatUnlocked) { chatWin.showInactive(); chatWin.focus(); }
  chatSend({ type: "mode", unlocked: chatUnlocked });
  if (!chatUnlocked) saveChatBounds();
  if (win && !win.isDestroyed()) win.webContents.send("screen-chat-state", chatState());
}
const chatState = () => ({ open: !!(chatWin && !chatWin.isDestroyed()), visible: !!(chatWin && !chatWin.isDestroyed() && chatWin.isVisible()), unlocked: chatUnlocked, keys: chatKeys });
let chatKeys = { toggle: false, move: false };
function registerChatKeys() {
  globalShortcut.unregister("CommandOrControl+Shift+C"); globalShortcut.unregister("CommandOrControl+Shift+L");
  chatKeys.toggle = globalShortcut.register("CommandOrControl+Shift+C", () => {
    if (!chatWin || chatWin.isDestroyed()) return;
    if (chatWin.isVisible()) chatWin.hide(); else chatWin.showInactive();
    if (win && !win.isDestroyed()) win.webContents.send("screen-chat-state", chatState());
  });
  chatKeys.move = globalShortcut.register("CommandOrControl+Shift+L", () => setChatUnlocked(!chatUnlocked));
}
function openChatWin() {
  if (chatWin && !chatWin.isDestroyed()) { chatWin.showInactive(); return; }
  chatWin = new BrowserWindow(Object.assign(loadChatBounds(), {
    frame: false, transparent: true, backgroundColor: "#00000000", hasShadow: false, resizable: false,
    alwaysOnTop: true, skipTaskbar: true, focusable: false, show: false, title: "TOS HUB Chat",
    minWidth: 200, minHeight: 140,
    webPreferences: { contextIsolation: true, sandbox: true, backgroundThrottling: false, preload: path.join(__dirname, "chat-preload.js") }
  }));
  chatWin.setAlwaysOnTop(true, "screen-saver");
  chatWin.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  chatWin.setContentProtection(chatCfg.hideFromCapture !== false);
  chatWin.setIgnoreMouseEvents(true, { forward: true });
  chatWin.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  chatWin.webContents.on("will-navigate", e => e.preventDefault());
  chatWin.loadFile(path.join(__dirname, "screen-chat.html"));
  chatWin.webContents.on("did-finish-load", () => {
    chatSend({ type: "cfg", cfg: chatCfg });
    chatBacklog.forEach(m => chatSend(m));
    chatSend({ type: "mode", unlocked: chatUnlocked });
    chatWin.showInactive();
    if (win && !win.isDestroyed()) win.webContents.send("screen-chat-state", chatState());
  });
  chatWin.on("moved", saveChatBounds);
  chatWin.on("closed", () => { chatWin = null; chatUnlocked = false; if (win && !win.isDestroyed()) win.webContents.send("screen-chat-state", chatState()); });
  registerChatKeys();
}
ipcMain.handle("screen-chat", (e, cmd, data) => {
  if (!win || e.sender !== win.webContents) throw new Error("not allowed");
  switch (cmd) {
    case "open": if (data) chatCfg = Object.assign(chatCfg, data); openChatWin(); break;
    case "close": if (chatWin && !chatWin.isDestroyed()) { saveChatBounds(); chatWin.close(); } globalShortcut.unregister("CommandOrControl+Shift+C"); globalShortcut.unregister("CommandOrControl+Shift+L"); break;
    case "cfg":
      chatCfg = Object.assign(chatCfg, data || {});
      if (chatWin && !chatWin.isDestroyed()) chatWin.setContentProtection(chatCfg.hideFromCapture !== false);
      chatSend({ type: "cfg", cfg: chatCfg });
      break;
    case "msg": {
      const m = { type: "msg", m: data };
      chatBacklog.push(m); if (chatBacklog.length > 60) chatBacklog.shift();
      chatSend(m); break;
    }
    case "clear": chatSend(Object.assign({ type: "clear" }, data || {})); break;
    case "unlock": setChatUnlocked(!!data); break;
    case "show": if (chatWin && !chatWin.isDestroyed()) { if (data) chatWin.showInactive(); else chatWin.hide(); } break;
  }
  return chatState();
});
ipcMain.on("screen-chat-lock", e => { if (chatWin && e.sender === chatWin.webContents) setChatUnlocked(false); });
ipcMain.on("screen-chat-resize", (e, d) => {
  if (!chatWin || e.sender !== chatWin.webContents || !chatUnlocked) return;
  const b = chatWin.getBounds();
  chatWin.setBounds({ x: b.x, y: b.y, width: Math.max(200, Math.min(2000, b.width + (d.dw | 0))), height: Math.max(140, Math.min(2000, b.height + (d.dh | 0))) });
  if (d.done) saveChatBounds();
});
app.on("will-quit", () => globalShortcut.unregisterAll());

// "Show" next to a saved clip: opens its folder with the file selected (video files only)
ipcMain.handle("show-file", (e, file) => {
  if (!win || e.sender !== win.webContents) throw new Error("not allowed");
  const f = String(file || "");
  if (!/\.(mp4|mkv|mov|flv|ts|m4v|webm)$/i.test(f) || !fs.existsSync(f)) return false;
  shell.showItemInFolder(f); return true;
});

// ---- voice commands (VoiceAttack and the like): a tiny web address on THIS PC only ----
// e.g. curl http://127.0.0.1:47821/<key>/fx/fire   (the key stops other programs or websites from poking it)
const VOICE_PORT = 47821;
const voiceKeyFile = () => path.join(app.getPath("userData"), "voice-key.txt");
function voiceKey() {
  try { const k = fs.readFileSync(voiceKeyFile(), "utf8").trim(); if (/^[a-z0-9]{8,}$/.test(k)) return k; } catch (e) {}
  const k = require("crypto").randomBytes(6).toString("hex");
  try { fs.mkdirSync(app.getPath("userData"), { recursive: true }); fs.writeFileSync(voiceKeyFile(), k); } catch (e) {}
  return k;
}
let voiceState = { ok: false, port: VOICE_PORT, key: "", err: "" };
// a tiny helper VoiceAttack can run without any window popping up (wscript has no console)
function writeVoiceHelper() {
  const file = path.join(app.getPath("userData"), "tos-voice.vbs");
  const vbs = [
    "' TOS HUB voice command helper: VoiceAttack runs this with what to do, e.g.  fx/fire",
    "On Error Resume Next",
    "Dim h : Set h = CreateObject(\"MSXML2.ServerXMLHTTP.6.0\")",
    "h.setTimeouts 1000, 1000, 2000, 2000",
    `h.Open "GET", "http://127.0.0.1:${VOICE_PORT}/${voiceState.key}/" & WScript.Arguments(0), False`,
    "h.Send", ""].join("\r\n");
  try { fs.writeFileSync(file, vbs); voiceState.vbs = file; } catch (e) { voiceState.vbs = ""; }
}
ipcMain.handle("save-voice-profile", (e, xml) => {
  const file = path.join(app.getPath("downloads"), "TOS HUB voice commands.vap");
  fs.writeFileSync(file, String(xml || ""), "utf8");
  shell.showItemInFolder(file);
  return file;
});
function startVoiceServer() {
  voiceState.key = voiceKey();
  writeVoiceHelper();
  const http = require("http");
  const srv = http.createServer((req, res) => {
    const parts = decodeURIComponent((req.url || "").split("?")[0]).split("/").filter(Boolean);
    if (parts[0] !== voiceState.key) { res.writeHead(403, { "Content-Type": "text/plain" }); return res.end("wrong key\n"); }
    const cmd = parts.slice(1).join("/");
    if (!cmd) { res.writeHead(200, { "Content-Type": "text/plain" }); return res.end("TOS HUB is listening\n"); }
    if (!twoPc.toHub(cmd) && win && !win.isDestroyed()) win.webContents.send("voice-cmd", cmd);
    res.writeHead(200, { "Content-Type": "text/plain" }); res.end("ok\n");
  });
  srv.on("error", e => { voiceState.ok = false; voiceState.err = e.code === "EADDRINUSE" ? "in use" : String(e.message || e); });
  srv.listen(VOICE_PORT, "127.0.0.1", () => { voiceState.ok = true; voiceState.err = ""; });
}
ipcMain.handle("voice-info", () => voiceState);

// ---- keybinds: keys that work anywhere (even while your game is in front) ----
const RESERVED = new Set(["CommandOrControl+Shift+C", "CommandOrControl+Shift+L", "Ctrl+Shift+C", "Ctrl+Shift+L"]);   // the on-screen chat's own keys
let boundKeys = [];
function setKeybindsHere(list, onHit) {   // onHit(cmd): what to do when one is pressed
  boundKeys.forEach(k => { try { globalShortcut.unregister(k); } catch (x) {} });
  boundKeys = [];
  return (Array.isArray(list) ? list : []).map(({ acc, cmd }) => {
    if (!acc || !cmd) return { acc, ok: false, why: "empty" };
    if (RESERVED.has(acc)) return { acc, ok: false, why: "chat" };
    if (boundKeys.includes(acc)) return { acc, ok: false, why: "twice" };
    let ok = false;
    try { ok = globalShortcut.register(acc, () => { if (Date.now() < selfPressUntil) return; onHit(cmd); }); } catch (x) { return { acc, ok: false, why: "bad" }; }
    if (ok) boundKeys.push(acc);
    return { acc, ok, why: ok ? "" : "taken" };
  });
}
// with two PCs linked, keybinds listen on the gaming PC's keyboard instead of this one
let keybindList = [];
const toPage = cmd => { if (win && !win.isDestroyed()) win.webContents.send("voice-cmd", cmd); };
async function applyKeybinds() {
  if (twoPc.role() === "streaming" && twoPc.up()) {
    setKeybindsHere([], toPage);
    const res = await twoPc.request("keys", { list: keybindList });
    if (res) return res;
  }
  return setKeybindsHere(keybindList, toPage);
}
ipcMain.handle("set-keybinds", (e, list) => { keybindList = Array.isArray(list) ? list : []; return applyKeybinds(); });

// ---- pressing keys for you (the "⌨️ Press keys" action): a small helper that types into whatever window is in front ----
// Windows only. It sends real scan codes (like a keyboard does), so most games see them too.
let selfPressUntil = 0;   // TOS HUB's own key presses never set off TOS HUB's own keybinds (no loops)
const VK = { Ctrl: 0xA2, Alt: 0xA4, Shift: 0xA0, Super: 0x5B, Space: 0x20, Enter: 0x0D, Tab: 0x09, Backspace: 0x08, Delete: 0x2E, Insert: 0x2D, Home: 0x24, End: 0x23, PageUp: 0x21, PageDown: 0x22,
  Up: 0x26, Down: 0x28, Left: 0x25, Right: 0x27, "-": 0xBD, "=": 0xBB, "[": 0xDB, "]": 0xDD, ";": 0xBA, "'": 0xDE, "`": 0xC0, "\\": 0xDC, ",": 0xBC, ".": 0xBE, "/": 0xBF,
  numadd: 0x6B, numsub: 0x6D, nummult: 0x6A, numdiv: 0x6F, numdec: 0x6E, Pause: 0x13, Scrolllock: 0x91, PrintScreen: 0x2C, Esc: 0x1B };
function vkOf(k) {
  if (VK[k] != null) return VK[k];
  if (/^[A-Z]$/.test(k)) return k.charCodeAt(0);
  if (/^[0-9]$/.test(k)) return k.charCodeAt(0);
  if (/^F([1-9]|1\d|2[0-4])$/.test(k)) return 0x6F + +k.slice(1);
  if (/^num[0-9]$/.test(k)) return 0x60 + +k.slice(3);
  return 0;
}
const KEYS_PS = String.raw`$ErrorActionPreference = "Stop"
Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public static class TosKeys {
  [StructLayout(LayoutKind.Sequential)] public struct KEYBDINPUT { public ushort wVk; public ushort wScan; public uint dwFlags; public uint time; public IntPtr dwExtraInfo; }
  [StructLayout(LayoutKind.Sequential)] public struct MOUSEINPUT { public int dx; public int dy; public uint mouseData; public uint dwFlags; public uint time; public IntPtr dwExtraInfo; }
  [StructLayout(LayoutKind.Explicit)] public struct INPUTUNION { [FieldOffset(0)] public MOUSEINPUT mi; [FieldOffset(0)] public KEYBDINPUT ki; }
  [StructLayout(LayoutKind.Sequential)] public struct INPUT { public uint type; public INPUTUNION u; }
  [DllImport("user32.dll", SetLastError = true)] static extern uint SendInput(uint n, INPUT[] inputs, int size);
  [DllImport("user32.dll")] static extern uint MapVirtualKey(uint code, uint mapType);
  static readonly int[] EXT = { 0x21, 0x22, 0x23, 0x24, 0x25, 0x26, 0x27, 0x28, 0x2D, 0x2E, 0x6F, 0x5B, 0x5C, 0xA3, 0xA5, 0x2C };
  public static uint Key(int vk, bool up) {
    INPUT i = new INPUT();
    i.type = 1;
    ushort sc = (ushort)MapVirtualKey((uint)vk, 0);
    uint f = 0;
    if (sc != 0) { f = 0x0008; if (Array.IndexOf(EXT, vk) >= 0) f |= 0x0001; } else { i.u.ki.wVk = (ushort)vk; }
    if (up) f |= 0x0002;
    i.u.ki.wScan = sc;
    i.u.ki.dwFlags = f;
    return SendInput(1, new INPUT[] { i }, Marshal.SizeOf(typeof(INPUT)));
  }
}
"@
[Console]::Out.WriteLine("ready")
while ($true) {
  $l = [Console]::In.ReadLine()
  if ($l -eq $null) { break }
  $p = $l.Split(" ")
  if ($p.Length -lt 2) { continue }
  [void][TosKeys]::Key([int]$p[1], $p[0] -eq "u")
}
`;
let keyProc = null, keyReady = null;
function keyHelper() {
  if (keyProc && !keyProc.killed && keyProc.exitCode == null) return keyReady;
  const file = path.join(app.getPath("userData"), "tos-keys.ps1");
  try { fs.mkdirSync(app.getPath("userData"), { recursive: true }); fs.writeFileSync(file, KEYS_PS); } catch (e) {}
  keyProc = require("child_process").spawn("powershell.exe", ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", file], { windowsHide: true, stdio: ["pipe", "pipe", "pipe"] });
  keyReady = new Promise(res => {
    let out = "", err = "";
    const t = setTimeout(() => res(false), 15000);
    keyProc.stdout.on("data", d => { out += d; if (out.includes("ready")) { clearTimeout(t); res(true); } });
    keyProc.stderr.on("data", d => { err += d; keyProc.lastErr = err.slice(-400); });
    keyProc.on("exit", () => { clearTimeout(t); res(false); });
    keyProc.on("error", () => { clearTimeout(t); res(false); });
  });
  return keyReady;
}
const wait = ms => new Promise(r => setTimeout(r, ms));
async function pressKeysHere({ acc, hold } = {}) {
  if (process.platform !== "win32") return { ok: false, why: "Pressing keys only works on Windows." };
  const parts = String(acc || "").split("+").filter(Boolean), vks = parts.map(vkOf);
  if (!parts.length || vks.some(v => !v)) return { ok: false, why: "TOS HUB can't press “" + acc + "”." };
  if (!(await keyHelper())) { const why = (keyProc && keyProc.lastErr) || ""; keyProc = null; return { ok: false, why: "The key helper didn't start" + (why ? ": " + why.split("\n")[0] : ".") }; }
  const ms = Math.max(40, Math.min(30000, +hold || 0));
  selfPressUntil = Date.now() + ms + 400;
  const send = (d, v) => keyProc.stdin.write(d + " " + v + "\n");
  for (const v of vks) { send("d", v); await wait(12); }
  await wait(ms);
  for (const v of vks.slice().reverse()) { send("u", v); await wait(12); }
  selfPressUntil = Date.now() + 300;
  return { ok: true };
}
// with two PCs linked, keys are pressed on the gaming PC (where the game is in front)
ipcMain.handle("press-keys", async (e, { acc, hold } = {}) => {
  if (twoPc.role() === "streaming" && twoPc.up()) {
    const res = await twoPc.request("press", { acc, hold }, Math.max(40, Math.min(30000, +hold || 0)) + 8000);
    return res || { ok: false, why: "The gaming PC didn't answer." };
  }
  return pressKeysHere({ acc, hold });
});
app.on("will-quit", () => { try { if (keyProc) keyProc.kill(); } catch (e) {} });

// ---- two PCs: streaming PC + gaming PC (see two-pc.js) ----
const twoPc = require("./two-pc")({ app, BrowserWindow, screen, getWin: () => win, local: { pressKeys: pressKeysHere, setKeybinds: setKeybindsHere } });
twoPc.onLink(() => { if (twoPc.role() === "streaming") applyKeybinds(); });
const fromMain = e => !!(win && e.sender === win.webContents);
ipcMain.handle("two-pc", (e, cmd, a = {}) => {
  if (!fromMain(e)) return null;
  if (cmd === "info") return twoPc.info();
  if (cmd === "role") { if (twoPc.setRole(a.role)) { app.relaunch(); app.quit(); } return true; }
  if (cmd === "pair") return twoPc.pair(a.host, a.port, a.code);
  if (cmd === "forget") return twoPc.forget();
  if (cmd === "code") return twoPc.newCode();
  if (cmd === "obs") return twoPc.setObs(a);
  if (cmd === "hud") return twoPc.setHud(a);
  if (cmd === "hud-test") return twoPc.testHud();
  return null;
});
app.on("will-quit", () => twoPc.stop());

// GoPro webcam over USB (see gopro.js)
const gopro = require("./gopro")(ipcMain, () => win);
app.on("before-quit", () => gopro.stop());

app.on("second-instance", () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });

app.whenReady().then(() => {
  // stops Windows putting TOS HUB to sleep in the background while it's running your camera and chat
  powerSaveBlocker.start("prevent-app-suspension");
  // Allow what TOS HUB needs (MIDI from the Duo, copying to the clipboard, the webcam for the preview); refuse everything else.
  // Electron files every Web MIDI request under "midiSysex", even though TOS HUB only ever
  // asks for plain MIDI (sysex: false), so both names are allowed here.
  // "media" is for the camera (TOS HUB camera, "Camera direct" preview) and the mic level for mic reactions.
  const allowed = new Set(["midi", "midiSysex", "clipboard-sanitized-write", "clipboard-read", "speaker-selection"]);   // speaker-selection: the private chat sound plays through the output you pick
  const fromApp = wc => !!(win && wc === win.webContents);
  session.defaultSession.setPermissionRequestHandler((wc, permission, cb, details) => {
    if (permission === "media") {   // the camera, and the mic (TOS HUB only measures how loud it is)
      const types = (details && details.mediaTypes) || [];
      return cb(fromApp(wc) && types.length > 0 && types.every(t => t === "video" || t === "audio"));
    }
    cb(allowed.has(permission));
  });
  session.defaultSession.setPermissionCheckHandler((wc, permission, origin, details) => {
    if (permission === "media") return fromApp(wc) && (!details || !details.mediaType || details.mediaType === "video" || details.mediaType === "audio");
    return allowed.has(permission);
  });
  createWindow();
  startVoiceServer();
  twoPc.start();
});

app.on("window-all-closed", () => app.quit());
