// ---------- settings that need a tracker turn grey when that tracker is switched off ----------
(() => {
  "use strict";
  const $ = q => document.querySelector(q);
  const KIND = { face: ["#useFace", "face tracking", "🙂"], hands: ["#useHands", "hand tracking", "✋"], body: ["#useBody", "body tracking", "🧍"], seg: ["#useSeg", "background cut-out", "✂️"] };
  const msg = k => `You need ${KIND[k][1]} for this to work`;
  const cardBy = title => [...document.querySelectorAll("#camPanels .ccard, #camPanels .camsec")].find(c => { const h = c.querySelector(":scope > h2"); return h && h.textContent.trim().startsWith(title); });
  const wrapOf = id => { const e = $(id); return e ? e.closest("label") || e : null; };
  const LIST = [
    ["face", () => [cardBy("Become an object"), cardBy("Face expressions"), cardBy("Mood detection"), cardBy("VTuber avatar"), $("#secFace"), wrapOf("#trkMesh"), wrapOf("#trkExpr"), wrapOf("#trkPaint"), wrapOf("#trkProp")]],
    ["hands", () => [cardBy("Hand tracking"), cardBy("Spell"), cardBy("Draw in the air"), wrapOf("#trkHands")]],
    ["body", () => [cardBy("Full-body tracking"), cardBy("Body poses"), wrapOf("#trkBodyAv")]],
    ["seg", () => [wrapOf("#trkBg"), $("#trkBlurRow"), $("#trkBgPick"), wrapOf("#trkBehind"), wrapOf("#trkCut")]]
  ];
  let marked = false;
  function mark() {
    LIST.forEach(([k, get]) => get().forEach(el => {
      if (!el || el.dataset.needs) return;
      el.dataset.needs = k; el.dataset.needmsg = msg(k);
      if (el.matches(".ccard, .camsec")) {   // a whole card: a note at the top that says why, and how to switch it back on
        const n = document.createElement("p"); n.className = "needsnote";
        n.innerHTML = `${KIND[k][2]} ${msg(k)}. Switch on <b>${KIND[k][1]}</b> in Tracking → What to track. `;
        const go = document.createElement("button"); go.type = "button"; go.className = "ghost"; go.textContent = "Switch it on"; go.style.cssText = "padding:3px 9px;font-size:12px;margin-left:4px";
        go.onclick = () => { const sw = $(KIND[k][0]); if (sw && !sw.checked) sw.click(); };
        n.append(go);
        const h = el.querySelector(":scope > h2"); if (h) h.after(n); else el.prepend(n);
      }
    }));
    marked = true;
  }
  function sync() {
    if (!marked) mark();
    document.querySelectorAll("[data-needs]").forEach(el => {
      const sw = $(KIND[el.dataset.needs][0]), off = !!sw && !sw.checked;
      el.classList.toggle("needsoff", off);
      if (off) el.setAttribute("title", el.dataset.needmsg); else if (el.getAttribute("title") === el.dataset.needmsg) el.removeAttribute("title");
      const ctrls = el.matches("input, select, button, textarea") ? [el] : [...el.querySelectorAll("input, select, button, textarea")].filter(c => !c.closest(".needsnote"));
      ctrls.forEach(c => {
        if (off) { if (!c.disabled) { c.disabled = true; c.dataset.needsDis = "1"; } }
        else if (c.dataset.needsDis) { c.disabled = false; delete c.dataset.needsDis; }
      });
    });
  }
  window.addEventListener("tos-needs", sync);
  ["#useFace", "#useHands", "#useBody", "#useSeg"].forEach(id => { const e = $(id); if (e) e.addEventListener("change", () => setTimeout(sync, 0)); });
  setTimeout(sync, 300); setTimeout(sync, 2000);
  window.__needsSync = sync;   // for TOS HUB's own tests
})();
