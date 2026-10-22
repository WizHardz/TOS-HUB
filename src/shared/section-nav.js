// ---------- main sections (Stream · Webcam · Controls · Chat) with their sub-tabs underneath ----------
(() => {
  "use strict";
  const $ = q => document.querySelector(q);
  const header = $("header"), tabs = $("header .tabs"); if (!header || !tabs) return;
  // VoiceAttack gets its own sub-tab under Controls
  { const home = $("#voiceHome"); ["#voiceSec", "#trigSec"].forEach(q => { const e = $(q); if (home && e) home.append(e); }); }
  const SECTIONS = [["stream", "🎥 Stream", ["live", "conn", "pcs"]], ["cam", "📷 Webcam", ["cam"]], ["ctl", "⚡ Controls", ["trig", "keys", "voice", "pads"]], ["chat", "💬 Chat", ["overlay", "shout"]]];
  const NAMES = { live: "Stream view", conn: "Connections", pcs: "Two PCs", trig: "Triggers", keys: "Keybinds", voice: "Voice (VoiceAttack)", pads: "Pads", overlay: "Chat overlay", shout: "Shoutouts" };
  const secOf = t => (SECTIONS.find(x => x[2].includes(t)) || SECTIONS[0])[0];
  const sec = document.createElement("nav"); sec.className = "secnav";
  SECTIONS.forEach(([k, l]) => { const b = document.createElement("button"); b.type = "button"; b.dataset.sec = k; b.textContent = l; sec.append(b); });
  tabs.before(sec);
  const sub = document.createElement("div"); sub.className = "subnav"; header.append(sub); sub.append(tabs);
  const camsub = document.createElement("div"); camsub.className = "camsub"; sub.append(camsub);
  // order the sub-tab buttons by section, with friendlier names
  SECTIONS.forEach(([, , list]) => list.forEach(t => { const b = tabs.querySelector(`button[data-tab="${t}"]`); if (b) { tabs.append(b); if (NAMES[t]) b.textContent = NAMES[t]; } }));
  const lastKey = k => "streamhub.sec." + k;
  const cur = () => (tabs.querySelector("button.active") || {}).dataset ? tabs.querySelector("button.active").dataset.tab : "conn";
  // webcam: its own sub-tabs (Camera, Look, Tracking…) shown up here too
  function camProxies() {
    camsub.innerHTML = "";
    document.querySelectorAll(".ctabs button[data-p]").forEach(src => {
      const b = document.createElement("button"); b.type = "button"; b.dataset.p = src.dataset.p;
      b.innerHTML = src.querySelector(".ci").textContent + " " + src.childNodes[1].textContent + '<span class="cn"></span>';
      b.onclick = () => src.click(); camsub.append(b);
    });
    syncCam();
  }
  function syncCam() {
    document.querySelectorAll(".ctabs button[data-p]").forEach(src => { const b = camsub.querySelector(`button[data-p="${src.dataset.p}"]`); if (!b) return; b.classList.toggle("on", src.classList.contains("on")); const n = src.querySelector(".cn"); b.querySelector(".cn").textContent = n && document.querySelector(".camnav.finding") ? n.textContent : ""; });
  }
  function sync() {
    const t = cur(), k = secOf(t);
    sec.querySelectorAll("button").forEach(b => b.classList.toggle("active", b.dataset.sec === k));
    tabs.querySelectorAll("button[data-tab]").forEach(b => b.classList.toggle("offsec", secOf(b.dataset.tab) !== k || k === "cam"));
    camsub.style.display = k === "cam" ? "" : "none";
    document.body.classList.toggle("secCam", k === "cam");
    try { localStorage.setItem(lastKey(k), t); } catch (e) {}
    syncCam();
  }
  sec.addEventListener("click", e => {
    const b = e.target.closest("button[data-sec]"); if (!b) return;
    const S = SECTIONS.find(x => x[0] === b.dataset.sec); let want = S[2][0];
    try { const l = localStorage.getItem(lastKey(S[0])); if (l && S[2].includes(l)) want = l; } catch (e) {}
    const tb = tabs.querySelector(`button[data-tab="${want}"]`); if (tb) tb.click();
  });
  tabs.querySelectorAll("button[data-tab]").forEach(b => b.addEventListener("click", () => setTimeout(sync, 0)));
  new MutationObserver(sync).observe(tabs, { subtree: true, attributes: true, attributeFilter: ["class"] });
  setTimeout(() => { camProxies(); const ct = document.querySelector(".ctabs"); if (ct) new MutationObserver(syncCam).observe(ct, { subtree: true, attributes: true, childList: true, characterData: true }); sync(); }, 300);
  sync();
  window.hubSection = k => { const b = sec.querySelector(`button[data-sec="${k}"]`); if (b) b.click(); };
})();
