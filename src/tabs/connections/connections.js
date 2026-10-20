(() => {
  "use strict";
  // ---------- Connections tab: status tiles, jumping to a connection, reconnect all ----------
  const $ = s => document.querySelector(s);
  function goConn(id) {
    const t = document.querySelector('.tabs button[data-tab="conn"]'); if (t) t.click();
    setTimeout(() => {
      const sec = document.getElementById(id); if (!sec) return;
      sec.scrollIntoView({ behavior: "smooth", block: "center" });
      sec.classList.remove("flashsec"); void sec.offsetWidth; sec.classList.add("flashsec");
      if (id === "twAuthSec") { const d = $("#twAuth"); if (d) d.open = true; }
    }, 40);
  }
  window.goConn = goConn;
  document.querySelectorAll(".ctile, .golink").forEach(el => el.addEventListener("click", e => { e.preventDefault(); goConn(el.dataset.go); }));
  [["#midiStatus", "midiSec"], ["#twStatus", "twChatSec"]].forEach(([sel, id]) => {
    const pill = $(sel) && $(sel).closest(".pill"); if (!pill) return;
    pill.classList.add("clickable"); pill.title = "Open on the Connections tab";
    pill.onclick = () => goConn(id);
  });
  const lvl = dot => /\bgood\b/.test(dot.className) ? "good" : /\bbad\b/.test(dot.className) ? "bad" : /\bwarn\b/.test(dot.className) ? "warn" : "";
  const after = t => t.replace(/^[^:]*:\s*/, "");
  function tile(textId, level, text) {
    const el = document.getElementById(textId);
    el.closest(".ctile").className = "ctile " + (level || "");
    el.textContent = text;
  }
  function update() {
    const obsTxt = after($("#obsStatus").textContent);
    tile("ctObs", lvl($("#obsDot")), obsTxt === "connected" ? "Connected ✓" : obsTxt === "not connected" ? "Not connected. Click to set up" : obsTxt);
    tile("ctMidi", lvl($("#midiDot")), after($("#midiStatus").textContent));
    const chatTxt = after($("#twStatus").textContent);
    const chatOk = chatTxt === "connected" || chatTxt === "reading chat";
    tile("ctChat", chatOk ? "good" : lvl($("#twDot")), chatTxt === "not connected" ? "Not connected. Click to set up" : chatTxt === "reading chat" ? "Reading chat ✓" : chatTxt === "connected" ? "Connected ✓" : chatTxt);
    const loggedIn = !$("#twLoggedIn").classList.contains("hide");
    let who = ""; try { who = (JSON.parse(localStorage.getItem("streamhub.cfg") || "{}") || {}).login || ""; } catch (e) {}
    tile("ctAuth", loggedIn ? "good" : "", loggedIn ? `Logged in${who ? " as " + who : ""} ✓` : "Not logged in (optional, for posting shoutouts)");
    const st = $("#soChatState");
    if (st) st.textContent = `Twitch chat: ${chatTxt}${chatTxt === "connected" || chatTxt === "reading chat" ? " ✓" : ""}.`;
  }
  setInterval(update, 1000); update();
  $("#connAll").onclick = () => {
    if (window.hubObs && !window.hubObs.connected) window.hubObs.connect();
    if (window.hubChat && !window.hubChat.joined && ($("#twChannel").value || "").trim()) window.hubChat.connect();
    setTimeout(update, 300);
  };
})();
