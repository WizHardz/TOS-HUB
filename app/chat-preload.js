// The private on-screen chat window: it only receives chat from TOS HUB, and can ask to be locked or resized.
const { contextBridge, ipcRenderer } = require("electron");
contextBridge.exposeInMainWorld("tosChat", {
  onMsg: cb => ipcRenderer.on("chat-msg", (e, m) => cb(m)),
  lock: () => ipcRenderer.send("screen-chat-lock"),
  resize: (dw, dh, done) => ipcRenderer.send("screen-chat-resize", { dw: +dw || 0, dh: +dh || 0, done: !!done })
});
