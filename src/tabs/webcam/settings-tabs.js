// ---------- Webcam settings: six tabs, a search box, and each topic in its own card ----------
// Built from the settings already on the page (they keep working exactly as before; they just move into tabs).
(() => {
  "use strict";
  const $ = q => document.querySelector(q);
  const nav = $("#camNav"), adv = $("#secAdv");
  if (!nav || !adv) return;
  const TABS = [["camera", "📷", "Camera"], ["look", "🎨", "Look"], ["track", "🎯", "Tracking"], ["magic", "✨", "Effects"], ["objects", "🍊", "Objects"], ["vtuber", "🧙", "VTuber"], ["stream", "📣", "Stream"]];
  nav.className = "camnav ctab";
  nav.innerHTML = `<div class="ctabs" role="tablist">${TABS.map(([k, i, t]) => `<button type="button" role="tab" data-p="${k}" title="${t}"><span class="ci">${i}</span>${t}<span class="cn"></span></button>`).join("")}</div>
    <div class="cfind"><input id="camFind" type="search" placeholder="🔎 Find a setting (e.g. mirror, crown, GoPro, spells)" autocomplete="off" spellcheck="false"><button type="button" class="ghost hide" id="camFindX">Clear</button><button type="button" class="ghost" id="camAll" title="Everything at once: every settings tab on one screen, in columns (great on a big or second monitor)">▦ All on one screen</button></div>`;
  const wrap = document.createElement("div"); wrap.id = "camPanels"; nav.after(wrap);
  const P = {};
  TABS.forEach(([k, i, t]) => { const d = document.createElement("div"); d.className = "cpanel"; d.dataset.p = k; d.setAttribute("role", "tabpanel"); d.innerHTML = `<div class="ptitle">${i} ${t}</div>`; wrap.append(d); P[k] = d; });
  const none = document.createElement("p"); none.className = "cnone"; none.textContent = "No settings match that. Try another word."; wrap.append(none);
  const card = (title, nodes, id) => {
    const sec = document.createElement("section"); sec.className = "camsec ccard"; if (id) sec.id = id;
    const h = document.createElement("h2"); h.textContent = title; sec.append(h);
    nodes.flat().filter(Boolean).forEach(n => sec.append(n));
    return sec;
  };
  const det = txt => [...adv.querySelectorAll("details.trkmap")].find(d => d.querySelector("summary").textContent.trim().startsWith(txt));
  const inner = d => d ? [...d.childNodes].filter(n => n.nodeName !== "SUMMARY") : [];
  const rowOf = id => { const e = $(id); return e ? e.closest(".row") || e.closest("label") : null; };
  // pieces of the old long "Advanced tracking" section
  const trkMsg = $("#trkMsg"), trkMain = adv.querySelector(".trkmain"), paintRow = rowOf("#trkPaint");
  const behind = $("#trkBehind") ? $("#trkBehind").closest("label") : null;
  const engineRow = rowOf("#trkEngine"), health = $("#healthBox");
  const body = det("Full-body"), poseFx = $("#trkPoseFx") ? $("#trkPoseFx").closest("label") : null, poseGrid = $("#poseGrid"), bodyAv = $("#trkBodyAv") ? $("#trkBodyAv").closest("label") : null;
  if (poseFx) poseFx.remove(); if (poseGrid) poseGrid.remove(); if (bodyAv) bodyAv.remove();
  const note = t => { const p = document.createElement("p"); p.className = "note"; p.style.margin = "4px 0 0"; p.innerHTML = t; return p; };
  const need = note("These work with the <b>✨ TOS HUB camera</b> (Camera tab).");
  // Camera
  P.camera.append($("#secCamera"), $("#secPresets"));
  // Look
  P.look.append($("#secShape"), $("#secFrame"),
    card("Background & face paint", [paintRow, $("#trkBlurRow"), $("#trkBgPick"), $("#trkEmNote"), behind]),
    card("Lighting, colour & head props", inner(det("Look:"))));
  P.objects.append(card("Become an object", inner(det("Become an object")), "objCard"));
  // Tracking
  // Tracking: everything to do with tracking, in one place (Face · Hands · Body · Settings)
  const grp = (el, g) => { if (el) el.dataset.grp = g; return el; };
  P.track.append(grp(card("What to track", [trkMsg, $("#trkMasters"), $("#trkMastersNote"), trkMain]), "set"), grp($("#secFace"), "face"),
    grp(card("Face expression settings", inner(det("Expression triggers"))), "face"),
    grp(card("Mood detection", inner(det("Mood")), "oldMoodCard"), "face"),
    grp(card("Camera operator & two people", inner(det("Camera operator"))), "face set"),
    grp(card("Hand tracking", [inner(det("Hand tracking")), inner(det("Hand gestures"))], "handCard"), "hands"),
    grp(card("Hand controls: which sign does what", [$("#handCtlBox")], "handCtlCard"), "hands"),
    grp(card("My own hand gestures", [$("#myGestBox")], "myGestCard"), "hands"),
    grp(card("Spell & hand prop settings", inner(det("Spells"))), "hands"),
    grp(card("Full-body tracking", inner(body), "bodyCard"), "body"),
    grp(card("My own body poses", [$("#myPoseBox")], "myPoseCard"), "body"),
    grp(card("Body poses", [poseFx, poseGrid], "oldPoseCard"), "body"),
    grp(card("Combos: two moves in a row", inner(det("Combos"))), "set hands body face"),
    grp(card("Smoothing & cut-out", inner(det("Smoothing"))), "set"),
    grp(card("Speed & accuracy", [engineRow, health]), "set"));
  { const bar = document.createElement("div"); bar.className = "trkgrp"; bar.id = "trkGrp";
    [["", "All"], ["face", "🙂 Face"], ["hands", "✋ Hands"], ["body", "🧍 Body"], ["set", "⚙️ Settings"]].forEach(([g, l]) => { const b = document.createElement("button"); b.type = "button"; b.textContent = l; b.dataset.g = g; b.onclick = () => { ["face", "hands", "body", "set"].forEach(x => P.track.classList.toggle("grp-" + x, x === g)); bar.querySelectorAll("button").forEach(x => x.classList.toggle("on", x === b)); try { localStorage.setItem("streamhub.trkgrp", g); } catch (e) {} }; bar.append(b); });
    P.track.querySelector(".ptitle").after(bar);
    let g0 = ""; try { g0 = localStorage.getItem("streamhub.trkgrp") || ""; } catch (e) {}
    (bar.querySelector(`button[data-g="${g0}"]`) || bar.firstChild).click(); }
  // Effects: things that play on your cam
  P.magic.append(card("Triggers", inner(det("Triggers")), "rulesCard"),
    card("Draw in the air", inner(det("Draw in the air")), "drawCard"),
    card("Mic reactions", inner(det("Mic"))));
  // VTuber
  P.vtuber.append(card("VTuber avatar", [inner(det("VTuber")), bodyAv]));
  // Stream
  P.stream.append(card("Full-screen effects", inner(det("Full-screen effects")), "screenCard"), card("Auto clips", inner(det("Auto clips"))), $("#secChat"));
  // anything left over in the old section goes to Tracking, so nothing is lost
  [...adv.children].forEach(c => {
    if (c.tagName === "H2") return;
    if (c.tagName === "DETAILS" && ![...c.childNodes].some(n => n.nodeName !== "SUMMARY" && (n.nodeType === 1 || (n.textContent || "").trim()))) return;   // emptied
    P.track.append(c);
  });
  adv.remove();
  if (health) { health.open = true; }
  P.magic.prepend(need.cloneNode(true)); P.vtuber.prepend(need.cloneNode(true)); P.objects.prepend(need.cloneNode(true));

  // ---- switching tabs ----
  const KEY = "streamhub.camtab";
  let cur = (() => { try { return localStorage.getItem(KEY) || "camera"; } catch (e) { return "camera"; } })();
  if (!P[cur]) cur = "camera";
  const btns = [...nav.querySelectorAll(".ctabs button")];
  function show(k, scroll) {
    cur = k;
    btns.forEach(b => { const on = b.dataset.p === k; b.classList.toggle("on", on); b.setAttribute("aria-selected", on); });
    Object.entries(P).forEach(([key, el]) => el.classList.toggle("on", key === k));
    try { localStorage.setItem(KEY, k); } catch (e) {}
    if (scroll) { const top = nav.getBoundingClientRect().top + scrollY - 10; if (scrollY > top) scrollTo({ top, behavior: "smooth" }); }
  }
  btns.forEach(b => b.onclick = () => { if (find.value) clearFind(); show(b.dataset.p, true); });
  if (window.__camAllTabs) wrap.classList.add("alltabs");   // TOS HUB's own tests see every setting at once
  // "All on one screen": every tab's settings at once, flowing into columns; the tab buttons jump to that part
  const ALLKEY = "streamhub.camall";
  let allOn = (() => { try { return localStorage.getItem(ALLKEY) === "1"; } catch (e) { return false; } })();
  function setAll(on) {
    allOn = on;
    document.body.classList.toggle("camall", on); wrap.classList.toggle("alltabs", on || !!window.__camAllTabs);
    const b = $("#camAll"); b.classList.toggle("on", on); b.textContent = on ? "▤ One tab at a time" : "▦ All on one screen";
    try { localStorage.setItem(ALLKEY, on ? "1" : "0"); } catch (e) {}
  }
  $("#camAll").onclick = () => setAll(!allOn);
  btns.forEach(b => { const tabClick = b.onclick; b.onclick = () => { if (allOn && !find.value) { const p2 = P[b.dataset.p]; const top = p2.getBoundingClientRect().top + scrollY - nav.offsetHeight - 20; scrollTo({ top, behavior: "smooth" }); return; } tabClick(); }; });
  setAll(allOn);
  show(cur);

  // ---- search ----
  const find = $("#camFind"), findX = $("#camFindX");
  const cards = () => [...wrap.querySelectorAll(".cpanel > .camsec")];
  function clearFind() { find.value = ""; runFind(); }
  function runFind() {
    const q = find.value.trim().toLowerCase();
    findX.classList.toggle("hide", !q);
    wrap.querySelectorAll(".hit").forEach(e => e.classList.remove("hit"));
    nav.classList.toggle("finding", !!q);
    if (!q) { wrap.classList.remove("finding", "empty"); cards().forEach(c => { c.hidden = false; }); btns.forEach(b => { b.querySelector(".cn").textContent = ""; }); return; }
    wrap.classList.add("finding");
    const words = q.split(/\s+/);
    let total = 0; const per = {};
    cards().forEach(c => {
      // option lists count too (so "GoPro" finds the camera menu), except the "which effect?" menus, which list every effect
      const opts = el => [...el.querySelectorAll("select")].filter(sl => !sl.closest(".maprow")).map(sl => [...sl.options].map(o => o.textContent.toLowerCase()).join(" ")).join(" ");
      const own = el => [...el.querySelectorAll("*")].length ? (() => { const cl = el.cloneNode(true); cl.querySelectorAll(".maprow select, option").forEach(x => x.remove()); return cl.textContent.toLowerCase(); })() : el.textContent.toLowerCase();
      const text = own(c) + " " + opts(c);
      const hit = words.every(w => text.includes(w));
      c.hidden = !hit;
      if (hit) {
        total++; const k = c.closest(".cpanel").dataset.p; per[k] = (per[k] || 0) + 1;
        // point at the matching controls inside the card
        c.querySelectorAll("label, .maprow, summary, button").forEach(el => { const t = own(el) + " " + opts(el); if (words.every(w => t.includes(w)) && t.length < 400) el.classList.add("hit"); });
        c.querySelectorAll("details").forEach(d => { if (words.every(w => d.textContent.toLowerCase().includes(w))) d.open = true; });
      }
    });
    wrap.classList.toggle("empty", !total);
    btns.forEach(b => { b.querySelector(".cn").textContent = per[b.dataset.p] ? String(per[b.dataset.p]) : ""; });
  }
  find.addEventListener("input", runFind);
  find.addEventListener("keydown", e => { if (e.key === "Escape") clearFind(); });
  findX.onclick = () => { clearFind(); find.focus(); };
})();
