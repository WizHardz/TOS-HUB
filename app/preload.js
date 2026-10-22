// Gives the TOS HUB page a few small, safe extras: saving the webcam shape picture for OBS, reading the
// tracking files that ship with the app, and controlling the private on-screen chat window.
const { contextBridge, ipcRenderer } = require("electron");
contextBridge.exposeInMainWorld("tosHub", {
  saveMask: (name, dataUrl) => ipcRenderer.invoke("save-mask", { name, dataUrl }),
  readAsset: name => ipcRenderer.invoke("read-asset", name),
  screenChat: (cmd, data) => ipcRenderer.invoke("screen-chat", cmd, data),
  onScreenChat: cb => ipcRenderer.on("screen-chat-state", (e, s) => cb(s)),
  showFile: file => ipcRenderer.invoke("show-file", file),
  gopro: (cmd, opts) => ipcRenderer.invoke("gopro", cmd, opts),
  onGoproFrame: cb => { ipcRenderer.removeAllListeners("gopro-frame"); ipcRenderer.on("gopro-frame", (e, f) => cb(f)); },
  voiceInfo: () => ipcRenderer.invoke("voice-info"),
  setKeybinds: list => ipcRenderer.invoke("set-keybinds", list),
  pressKeys: (acc, hold) => ipcRenderer.invoke("press-keys", { acc, hold }),
  saveVoiceProfile: xml => ipcRenderer.invoke("save-voice-profile", xml),
  onVoice: cb => { ipcRenderer.removeAllListeners("voice-cmd"); ipcRenderer.on("voice-cmd", (e, c) => cb(c)); },
  twoPc: (cmd, a) => ipcRenderer.invoke("two-pc", cmd, a),
  onTwoPc: cb => { ipcRenderer.removeAllListeners("two-pc-state"); ipcRenderer.on("two-pc-state", (e, s) => cb(s)); },
  onGoproStatus: cb => { ipcRenderer.removeAllListeners("gopro-status"); ipcRenderer.on("gopro-status", (e, s) => cb(s)); }
});
