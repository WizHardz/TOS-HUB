(() => {
  "use strict";
  // ---------- back up / restore ALL settings (pads, shoutouts, overlay) ----------
  const $ = s => document.querySelector(s);
  const OURS = k => k.startsWith("padbridge.") || k.startsWith("streamhub.") || k === "wizhardz-chat-overlay";
  $("#allBackup").onclick = () => {
    const data = {};
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (OURS(k)) data[k] = localStorage.getItem(k);
    }
    // Leave out passwords and logins: they stay on this computer. You'll just log in again after restoring.
    try { const c = JSON.parse(data["padbridge.conn"] || "null"); if (c) { c.password = ""; c.remember = false; data["padbridge.conn"] = JSON.stringify(c); } } catch (e) {}
    try { const c = JSON.parse(data["streamhub.cfg"] || "null"); if (c) { c.token = ""; data["streamhub.cfg"] = JSON.stringify(c); } } catch (e) {}
    delete data["streamhub.authState"];
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([JSON.stringify({ app: "stream-hub-all", version: 1, saved: new Date().toISOString(), data }, null, 2)], { type: "application/json" }));
    a.download = "tos-hub-settings.json";
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };
  $("#allRestore").onclick = () => $("#allRestoreFile").click();
  $("#allRestoreFile").onchange = async e => {
    const f = e.target.files[0]; e.target.value = "";
    if (!f) return;
    try {
      const j = JSON.parse(await f.text());
      if (!j || j.app !== "stream-hub-all" || typeof j.data !== "object") throw new Error("That isn't a TOS HUB settings backup.");
      if (!confirm("Replace this copy's pads, shoutout list and overlay settings with the ones in this backup?")) return;
      const keep = {};
      ["padbridge.conn", "streamhub.cfg"].forEach(k => { try { keep[k] = JSON.parse(localStorage.getItem(k) || "null"); } catch (err) {} });
      for (const [k, v] of Object.entries(j.data)) if (OURS(k) && typeof v === "string") localStorage.setItem(k, v);
      // keep any password / Twitch login already saved here
      try { const c = JSON.parse(localStorage.getItem("padbridge.conn") || "null"); if (c && keep["padbridge.conn"] && keep["padbridge.conn"].password) { c.password = keep["padbridge.conn"].password; c.remember = true; localStorage.setItem("padbridge.conn", JSON.stringify(c)); } } catch (err) {}
      try { const c = JSON.parse(localStorage.getItem("streamhub.cfg") || "null"); const k = keep["streamhub.cfg"]; if (c && k && k.token) { c.token = k.token; c.login = k.login; c.userId = k.userId; localStorage.setItem("streamhub.cfg", JSON.stringify(c)); } } catch (err) {}
      location.reload();
    } catch (err) { alert("Couldn't restore: " + err.message); }
  };
})();
