  // ================= TWO PCs: this PC is the streaming PC, the gaming PC, or just one PC =================
  (() => {
    "use strict";
    const $ = q => document.querySelector(q), H = window.tosHub;
    const esc = t => String(t).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
    if (!$("#pcsSec")) return;
    if (!(H && H.twoPc)) { $("#pcsRoleMsg").textContent = "Two PCs needs the TOS HUB desktop app (this is the browser preview)."; $("#pcsRoleMsg").className = "note warn"; return; }
    // a pill next to OBS / MIDI / Twitch at the top, only while this is the streaming PC
    const pill = document.createElement("span"); pill.className = "pill hide"; pill.innerHTML = '<span class="dot" id="gpDot"></span><span id="gpStatus">Gaming PC</span>';
    pill.style.cursor = "pointer"; pill.onclick = () => { const b = document.querySelector('header .tabs button[data-tab="pcs"]'); if (b) b.click(); };
    { const p = $("header .pills"); if (p) p.append(pill); }
    function render(s) {
      document.querySelectorAll("#pcsRoles button").forEach(b => { const on = b.dataset.role === s.role; b.classList.toggle("primary", on); b.classList.toggle("ghost", !on); });
      const streaming = s.role === "streaming";
      $("#pcsLinkSec").classList.toggle("hide", !streaming);
      pill.classList.toggle("hide", !streaming);
      if (!streaming) return;
      const dot = s.up ? "good" : s.paired ? "warn" : "";
      $("#pcsDot").className = "dot " + dot; $("#gpDot").className = "dot " + dot;
      $("#gpStatus").textContent = "Gaming PC: " + (s.up ? "linked" : s.paired ? "not here" : "not paired");
      $("#pcsState").textContent = s.up ? `Linked to ${s.peer} (${s.peerHost}) ✓` : s.paired ? `Paired with ${s.peer || "your gaming PC"}. Waiting for it to come online…` : "Waiting for your gaming PC…";
      $("#pcsPair").classList.toggle("hide", s.paired);
      $("#pcsLinked").classList.toggle("hide", !s.paired);
      $("#pcsCode").textContent = s.code ? s.code.slice(0, 3) + " " + s.code.slice(3) : "";
      $("#pcsAddr").textContent = s.addresses.length ? `This PC's address (if the gaming PC asks): ${s.addresses.join(" or ")}` : "This PC doesn't seem to be on a network.";
      $("#pcsErr").textContent = s.err || "";
      $("#pcsLog").innerHTML = s.log.slice(0, 5).map(l => `<li>${new Date(l.at).toLocaleTimeString()} · ${esc(l.text)}</li>`).join("");
    }
    // switching restarts TOS HUB; a second click makes sure you meant it
    document.querySelectorAll("#pcsRoles button").forEach(b => {
      const label = b.textContent; let armed = 0;
      b.onclick = () => {
        if (b.classList.contains("primary")) return;
        if (Date.now() - armed < 4000) { H.twoPc("role", { role: b.dataset.role }); return; }
        armed = Date.now(); b.textContent = "Click again to restart TOS HUB";
        $("#pcsRoleMsg").textContent = b.dataset.role === "gaming" ? "This PC then shows the small gaming PC window instead of the full hub. Your settings stay here for when you switch back." : "TOS HUB restarts to switch.";
        setTimeout(() => { b.textContent = label; $("#pcsRoleMsg").textContent = ""; }, 4000);
      };
    });
    $("#pcsNewCode").onclick = () => H.twoPc("code");
    $("#pcsForget").onclick = () => H.twoPc("forget");
    // the gaming PC's effects layer connects straight to OBS here, so it needs the same OBS address and password
    function shareObs() {
      let c = {}; try { c = JSON.parse(localStorage.getItem("padbridge.conn") || "{}") || {}; } catch (e) {}
      const box = id => { const e = $(id); return e ? e.value.trim() : ""; };
      H.twoPc("obs", { host: box("#host") || c.host || "localhost", port: box("#port") || c.port || "4455", pw: box("#password") || c.password || "" });
    }
    H.onTwoPc(render);
    const poll = async () => { try { const s = await H.twoPc("info"); render(s); if (s.role === "streaming") shareObs(); } catch (e) {} };
    poll(); setInterval(poll, 5000);
  })();
