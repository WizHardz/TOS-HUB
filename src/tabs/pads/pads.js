  // ---------- pads: grid, remembered buttons, actions ----------
  // grid.cells["row-col"] = { name, color, trigger }   ·   each action in `maps` belongs to a cell via m.cell
  let maps = store.get("maps", []);
  let grid = store.get("grid", null);
  let known = store.get("known", []);           // every MIDI button seen: {kind, ch, num, count, last}
  const flashTimers = {};
  const uid = () => Math.random().toString(36).slice(2, 10);
  const saveMaps = () => store.set("maps", maps);
  const saveGrid = () => store.set("grid", grid);
  const saveKnown = () => store.set("known", known);
  let selected = store.get("selCell", "0-0");
  let learning = null;                          // cell key waiting for a pad press
  let quick = null;                             // { order: [keys], i } while quick setup runs

  // What a pad can do, shown as tiles when you add an action
  const CATALOG = [
    ["Show & hide", [
      ["toggle", "👁️", "Show / hide a source", "Flip something on or off: an image, an alert, a camera…"],
      ["flash", "⏱️", "Show for a few seconds", "Pop something up, then hide it again"],
      ["show", "✅", "Show a source", "Always turns it on"],
      ["hide", "🚫", "Hide a source", "Always turns it off"]
    ]],
    ["Scenes", [
      ["scene", "🎬", "Switch scene", "Jump to another scene"],
      ["scenetoggle", "🔁", "Switch scene & back", "Press again to go back to where you were"]
    ]],
    ["Sound", [
      ["media", "▶️", "Play a sound or video", "Starts a media source from the beginning"],
      ["mute", "🔇", "Mute / unmute", "Your mic or any other audio"]
    ]],
    ["Webcam & effects", [
      ["camfx", "✨", "Cam effect", "Sparkles, meteor, wizard hat…"],
      ["camshape", "🔷", "Change cam shape", "Circle, hexagon, heart…"],
      ["camfollow", "🎯", "Face follow on / off", "Cam keeps your face centred"],
      ["micreact", "🎙️", "Mic reactions on / off", "Claps, snaps and shouts set off effects"],
      ["drawtoggle", "✏️", "Draw mode on / off", "Draw in the air with your finger"],
      ["drawclear", "🧽", "Clear the drawing", "Wipes what you drew in the air"],
      ["campreset", "📐", "Move cam to a preset", "Glide your cam to a saved spot"],
      ["camtoggle", "📷", "Show / hide cam", "Your webcam and its frame"],
      ["filter", "🎨", "Turn a filter on / off", "Colour effects, green screen, blur…"]
    ]],
    ["Other", [
      ["record", "⏺️", "Start / stop recording", "Records to your computer"]
    ]]
  ];
  const ACTION_INFO = {};
  CATALOG.forEach(([, list]) => list.forEach(([k, icon, title, desc]) => { ACTION_INFO[k] = { icon, title, desc }; }));
  const CAM_FX = [["spark", "✨ Sparkles"], ["zap", "⚡ Zap"], ["fire", "🔥 Fire"], ["frost", "❄️ Frost"], ["boom", "💥 Boom"], ["hearts", "💖 Hearts"], ["confetti", "🎉 Confetti"], ["handconfetti", "🎉 Confetti from my hands"], ["magic", "🔮 Magic circle"], ["portal", "🌀 Portal"], ["meteor", "☄️ Meteor"], ["bubbles", "🧪 Potion bubbles"], ["hat", "🧙 Wizard hat"], ["lasers", "👀 Laser eyes"], ["halo", "😇 Halo"], ["bigeyes", "👁️ Big eyes"], ["bighead", "🎈 Big head"], ["wobble", "🫠 Wobbly face"], ["googly", "🤪 Googly eyes"], ["shades", "😎 Pixel shades"], ["firebreath", "🐉 Dragon breath"], ["shield", "🛡️ Magic shield"], ["smoke", "💨 Smoke grenade"], ["object", "🍊 Become an object"], ["earsmoke", "💨 Smoke out of my ears"], ["mouthsmoke", "😮‍💨 Blow smoke"], ["eyesmouth", "🟩 Just eyes & mouth"], ["fireball", "☄️ Fireball"], ["rain", "🌧️ Rain cloud"], ["crown", "👑 Crown"], ["horns", "😈 Devil horns"], ["cat", "🐱 Cat ears"], ["pumpkin", "🎃 Pumpkin head"], ["viking", "⛑️ Viking helmet"], ["wings", "🪽 Wings"], ["powerup", "🌟 Power up"], ["ice", "🧊 Ice statue"], ["stone", "🗿 Turn to stone"], ["holo", "🔷 Hologram"], ["gold", "🪙 Turn to gold"], ["afterimage", "👥 Afterimages"], ["poke", "🫧 Poke the bubbles"], ["shake", "🫨 Shake"], ["shot", "🔫 Shot down"], ["fishtank", "🐟 Fish-tank smash"], ["rainbow", "🌈 Rainbow puke"], ["timewarp", "⏳ Time warp scan"], ["puppy", "🐶 Puppy"], ["sketch", "✏️ Pencil sketch"], ["crying", "😭 Crying"]];
  const CAM_SHAPES = [["square", "Square"], ["round", "Rounded"], ["circle", "Circle"], ["hex", "Hexagon"], ["gem", "Gem"], ["shield", "Shield"], ["heart", "Heart"], ["arch", "Arch"]];
  const camPresetNames = () => { try { return ((JSON.parse(localStorage.getItem("streamhub.cam") || "{}") || {}).presets || []).map(p => p.name); } catch (e) { return []; } };
  const SOURCE_ACTIONS = new Set(["toggle", "show", "hide", "flash"]);
  const AUDIO_KINDS = /wasapi|pulse|alsa|coreaudio|jack|sndio|dshow|av_capture|ffmpeg|vlc|browser|ndi|audio/i;
  const MEDIA_KINDS = /ffmpeg_source|vlc_source/i;
  const COLORS = ["#b14dff", "#2ff3ff", "#ff4fd8", "#3dff8a", "#ffe14d", "#ff8a3d", "#ff4d5e", "#6f8bff"];
  const trigLabel = t => !t ? "No button yet" : (t.kind === "note" ? `Note ${t.num} · Ch ${t.ch}` : `CC ${t.num} · Ch ${t.ch}`);
  const sameTrig = (a, b) => a && b && a.kind === b.kind && a.ch === b.ch && a.num === b.num;
  // short version for the pad tiles (channel only shown when it isn't 1)
  const shortTrig = t => !t ? "No button yet" : `${t.kind === "note" ? "Note" : "CC"} ${t.num}${t.ch !== 1 ? ` · Ch ${t.ch}` : ""}`;
  const tkey = t => `${t.kind}:${t.ch}:${t.num}`;
  const key = (r, c) => `${r}-${c}`;
  const parseKey = k => k.split("-").map(Number);
  const inGrid = k => { const [r, c] = parseKey(k); return r < grid.rows && c < grid.cols; };
  const visibleKeys = () => { const out = []; for (let r = 0; r < grid.rows; r++) for (let c = 0; c < grid.cols; c++) out.push(key(r, c)); return out; };
  const cell = k => grid.cells[k] || (grid.cells[k] = { name: "", color: "", trigger: null });
  const peek = k => grid.cells[k] || { name: "", color: "", trigger: null };
  const actionsOf = k => maps.filter(m => m.cell === k);
  function cellLabel(k) {
    const c = peek(k);
    if (c.name) return c.name;
    const [r, col] = parseKey(k);
    return `Pad ${r * grid.cols + col + 1}`;
  }
  function placeName(k) {
    const [r, c] = parseKey(k);
    const rows = grid.rows, cols = grid.cols;
    const v = rows === 1 ? "" : r === 0 ? "top" : r === rows - 1 ? "bottom" : (rows % 2 && r === (rows - 1) / 2) ? "middle" : `row ${r + 1}`;
    const h = cols === 1 ? "" : c === 0 ? "left" : c === cols - 1 ? "right" : (cols % 2 && c === (cols - 1) / 2) ? "centre" : `column ${c + 1}`;
    return [v, h].filter(Boolean).join("-") || "the pad";
  }

  function remember(t) {
    let k = known.find(x => sameTrig(x, t));
    const isNew = !k;
    if (!k) { k = { kind: t.kind, ch: t.ch, num: t.num, count: 0, last: 0 }; known.push(k); }
    k.count++; k.last = Date.now();
    saveKnown();
    return isNew;
  }

  // ---- first run / migration from the older list of pads ----
  if (!grid || typeof grid !== "object" || !grid.cells) {
    grid = { cols: 2, rows: 3, cells: {} };
    const groups = [];
    maps.forEach(m => {
      if (m.cell) return;
      let g = groups.find(x => (m.trigger ? sameTrig(x.trigger, m.trigger) : !x.trigger));
      if (!g) { g = { trigger: m.trigger || null, name: m.name || "", list: [] }; groups.push(g); }
      g.list.push(m);
    });
    while (grid.rows * grid.cols < groups.length) grid.rows++;
    groups.forEach((g, i) => {
      const k = key(Math.floor(i / grid.cols), i % grid.cols);
      grid.cells[k] = { name: g.name && !/^Pad \d+$/.test(g.name) ? g.name.replace(/\s+[–-]\s+.*$/, "") : "", color: COLORS[i % COLORS.length], trigger: g.trigger };
      g.list.forEach(m => { m.cell = k; delete m.trigger; });
      if (g.trigger) remember(g.trigger);
    });
    saveGrid(); saveMaps();
  }
  if (!inGrid(selected)) selected = "0-0";

  // ---- assigning buttons to pads ----
  function assign(k, t, quiet) {
    const moved = [];
    for (const [ok, c] of Object.entries(grid.cells)) if (ok !== k && sameTrig(c.trigger, t)) { c.trigger = null; moved.push(ok); }
    const c = cell(k);
    c.trigger = { kind: t.kind, ch: t.ch, num: t.num };
    if (!c.color) c.color = COLORS[visibleKeys().indexOf(k) % COLORS.length] || COLORS[0];
    remember(t);
    saveGrid();
    if (!quiet) padMsg(`${trigLabel(t)} is now ${cellLabel(k)}.` + (moved.length ? ` (Moved from ${moved.map(cellLabel).join(", ")}.)` : ""), "ok");
  }
  function swapCells(a, b) {
    if (a === b) return;
    const ca = grid.cells[a], cb = grid.cells[b];
    if (cb) grid.cells[a] = cb; else delete grid.cells[a];
    if (ca) grid.cells[b] = ca; else delete grid.cells[b];
    maps.forEach(m => { if (m.cell === a) m.cell = b; else if (m.cell === b) m.cell = a; });
    if (selected === a) selected = b; else if (selected === b) selected = a;
    saveGrid(); saveMaps();
  }

  // ---- learning / quick setup ----
  let learnHintTimer = null;
  function startLearn(k) {
    learning = k;
    clearTimeout(learnHintTimer);
    if (k) learnHintTimer = setTimeout(() => {
      if (learning === k) padMsg("Nothing yet. Check the pad is set to the MIDI pad type on the Duo, and that you're on the right pad bank.", "err");
    }, 7000);
    renderAll();
  }
  function quickStep() {
    if (!quick) { $("#quickBar").classList.add("hide"); return; }
    if (quick.i >= quick.order.length) {
      quick = null; learning = null;
      $("#quickBar").classList.add("hide");
      padMsg("Quick setup done! Click a pad to choose what it does.", "ok");
      renderAll();
      return;
    }
    const k = quick.order[quick.i];
    selected = k; store.set("selCell", k);
    $("#quickText").innerHTML = "";
    const b = document.createElement("b"); b.textContent = cellLabel(k);
    $("#quickText").append(`Quick setup ${quick.i + 1}/${quick.order.length}: press the ${placeName(k)} pad on your Duo (`, b, ")");
    $("#quickBar").classList.remove("hide");
    startLearn(k);
  }
  $("#quickBtn").onclick = () => { quick = { order: visibleKeys(), i: 0 }; quickStep(); };
  $("#quickSkip").onclick = () => { if (quick) { quick.i++; quickStep(); } };
  $("#quickStop").onclick = () => { quick = null; learning = null; $("#quickBar").classList.add("hide"); padMsg(""); renderAll(); };

  // ---- a pad was pressed on the Duo ----
  function handlePress(t, deviceName) {
    const isNew = remember(t);
    if (learning) {
      const k = learning;
      learning = null; clearTimeout(learnHintTimer);
      assign(k, t, !!quick);
      hitPad(k);
      if (quick) { quick.i++; quickStep(); } else renderAll();
      return;
    }
    const keys = visibleKeys().filter(k => sameTrig(peek(k).trigger, t));
    if (!keys.length) {
      if (isNew) log(`Found a new button: ${trigLabel(t)}. Drag it onto a pad to use it.`);
      renderKnown(); hitChip(t);
      return;
    }
    // follow the press to that pad, unless you're typing in a pad setting
    const typing = document.activeElement && document.activeElement.closest && document.activeElement.closest("#padDetail input, #padDetail select");
    if (!typing && selected !== keys[0]) { selected = keys[0]; store.set("selCell", selected); renderAll(); }
    else renderKnown();
    keys.forEach(k => { hitPad(k); actionsOf(k).forEach(m => fire(m, "pad")); });
    hitChip(t);
  }
  window.hubPads = {   // for voice commands
    list: () => visibleKeys().map(k => ({ key: k, name: (peek(k).name || "").trim() })).filter(p => p.name && actionsOf(p.key).length),
    run: name => { const n = String(name).toLowerCase(); const keys = visibleKeys().filter(k => (peek(k).name || "").trim().toLowerCase() === n); keys.forEach(k => { hitPad(k); actionsOf(k).forEach(m => fire(m, "voice")); }); return keys.length; }
  };
  function hitPad(k) {
    const el = document.querySelector(`.pad[data-key="${k}"]`); if (!el) return;
    el.classList.remove("hit"); void el.offsetWidth; el.classList.add("hit");
    setTimeout(() => el.classList.remove("hit"), 260);
  }
  function hitChip(t) {
    const el = document.querySelector(`.kchip[data-t="${tkey(t)}"]`); if (!el) return;
    el.classList.add("hit"); setTimeout(() => el.classList.remove("hit"), 300);
  }

  // ---- drawing ----
  function padMsg(text, cls) { const m = $("#padMsg"); m.textContent = text || ""; m.className = "note " + (cls || ""); }
  function opt(value, text, selectedOpt) {
    const o = document.createElement("option");
    o.value = value; o.textContent = text; if (selectedOpt) o.selected = true; return o;
  }
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };

  function renderGrid() {
    const g = $("#padGrid");
    g.style.setProperty("--cols", grid.cols);
    g.innerHTML = "";
    visibleKeys().forEach(k => {
      const c = peek(k), n = actionsOf(k).length;
      const b = el("button", "pad");
      b.type = "button"; b.dataset.key = k; b.draggable = true;
      if (!c.trigger && !n) b.classList.add("empty");
      if (k === selected) b.classList.add("sel");
      if (k === learning) b.classList.add("learning");
      if (c.color) b.style.setProperty("--pc", c.color);
      b.append(
        el("span", "pname", cellLabel(k)),
        el("span", "ptrig", k === learning ? "press it now…" : shortTrig(c.trigger)),
        el("span", "pcount", n ? iconsOf(k) : (c.trigger ? "no actions yet" : "click to set up"))
      );
      if (c.trigger || n || c.name) {
        const x = el("span", "pdel", "×"); x.title = "Clear this pad"; x.setAttribute("role", "button");
        x.onclick = e => {
          e.stopPropagation();
          const label = cellLabel(k);
          withUndo(`Cleared ${label}`, () => { maps = maps.filter(m => m.cell !== k); delete grid.cells[k]; if (learning === k) learning = null; });
        };
        b.append(x);
      }
      b.onclick = () => {
        if (quick) return;
        selected = k; store.set("selCell", k);
        padMsg("");
        if (!peek(k).trigger) startLearn(k); else { if (learning) learning = null; renderAll(); }
      };
      b.ondragstart = e => { e.dataTransfer.setData("text/x-cell", k); e.dataTransfer.effectAllowed = "move"; };
      b.ondragover = e => { e.preventDefault(); b.classList.add("dropok"); };
      b.ondragleave = () => b.classList.remove("dropok");
      b.ondrop = e => {
        e.preventDefault(); b.classList.remove("dropok");
        const from = e.dataTransfer.getData("text/x-cell"), tk = e.dataTransfer.getData("text/x-trig");
        if (tk) {
          const [kind, ch, num] = tk.split(":");
          learning = null; selected = k; store.set("selCell", k);
          assign(k, { kind, ch: +ch, num: +num });
          renderAll();
        } else if (from) {
          swapCells(from, k);
          padMsg(`Swapped ${cellLabel(k)} and ${cellLabel(from)}.`, "ok");
          renderAll();
        }
      };
      g.appendChild(b);
    });
    const hidden = Object.keys(grid.cells).filter(k => !inGrid(k) && (grid.cells[k].trigger || actionsOf(k).length));
    $("#gridNote").textContent = hidden.length
      ? `${hidden.length} set-up pad${hidden.length > 1 ? "s are" : " is"} outside this grid size and won't run. Make the grid bigger to get ${hidden.length > 1 ? "them" : "it"} back.`
      : "Tip: drag one pad onto another to swap them.";
    $("#gridCols").value = grid.cols;
    $("#gridRows").value = grid.rows;
  }

  function renderKnown() {
    const box = $("#knownList");
    box.innerHTML = "";
    if (!known.length) {
      box.appendChild(el("span", "note", "Nothing yet. Press any pad or button on your Duo and it'll appear here."));
      return;
    }
    known.forEach(t => {
      const where = visibleKeys().find(k => sameTrig(peek(k).trigger, t));
      const chip = el("button", "kchip" + (where ? " placed" : " free"));
      chip.type = "button"; chip.draggable = true; chip.dataset.t = tkey(t);
      chip.title = where ? `On ${cellLabel(where)}. Drag to another pad to move it.` : "Drag onto a pad, or select a pad and click here";
      chip.append(el("span", "kt", trigLabel(t)), el("span", "kw", where ? "→ " + cellLabel(where) : "not on a pad"));
      const x = el("span", "kx", "×"); x.title = "Forget this button";
      chip.append(x);
      chip.onclick = e => {
        if (e.target === x) {
          withUndo(`Forgot ${trigLabel(t)}`, () => { known = known.filter(k => k !== t); if (where) peek(where).trigger = null; });
          return;
        }
        if (quick) return;
        learning = null; clearTimeout(learnHintTimer);
        assign(selected, t);
        renderAll();
      };
      chip.ondragstart = e => { e.dataTransfer.setData("text/x-trig", tkey(t)); e.dataTransfer.effectAllowed = "copy"; };
      box.appendChild(chip);
    });
  }

  function renderDetail() {
    const k = selected, c = peek(k);
    $("#padTitle").textContent = `${cellLabel(k)} · ${placeName(k)}`;
    const nm = $("#padName");
    if (document.activeElement !== nm) nm.value = c.name || "";
    nm.placeholder = cellLabel(k);
    const sw = $("#padColors"); sw.innerHTML = "";
    COLORS.forEach(col => {
      const b = el("button", "sw" + ((c.color || "") === col ? " sel" : ""));
      b.type = "button"; b.style.background = col; b.title = "Pad colour";
      b.onclick = () => { cell(k).color = col; saveGrid(); renderAll(); };
      sw.appendChild(b);
    });
    const tr = $("#padTrig");
    tr.textContent = learning === k ? "Press the pad on your Duo…" : trigLabel(c.trigger);
    tr.className = "trig" + (c.trigger ? " set" : "") + (learning === k ? " wait" : "");
    $("#padLearn").textContent = learning === k ? "Cancel" : (c.trigger ? "Change button" : "Link a button");
    $("#padUnlink").disabled = !c.trigger;
    renderMaps();
  }
  $("#padName").oninput = () => { cell(selected).name = $("#padName").value.trim(); saveGrid(); renderGrid(); renderKnown(); $("#padTitle").textContent = `${cellLabel(selected)} · ${placeName(selected)}`; };
  $("#padLearn").onclick = () => { if (quick) return; startLearn(learning === selected ? null : selected); if (learning !== selected) padMsg(""); };
  $("#padUnlink").onclick = () => withUndo(`Unlinked the button from ${cellLabel(selected)}`, () => { cell(selected).trigger = null; });
  $("#padTest").onclick = () => {
    const list = actionsOf(selected);
    if (!list.length) { padMsg("This pad has no actions yet. Click “+ Add action”.", "err"); return; }
    hitPad(selected); list.forEach(m => fire(m, "test"));
  };
  $("#padClear").onclick = () => {
    const k = selected, label = cellLabel(k);
    withUndo(`Cleared ${label}`, () => { maps = maps.filter(m => m.cell !== k); delete grid.cells[k]; if (learning === k) learning = null; });
  };

  function setSize() {
    const c = Math.min(8, Math.max(1, parseInt($("#gridCols").value) || 2));
    const r = Math.min(8, Math.max(1, parseInt($("#gridRows").value) || 3));
    if (c === grid.cols && r === grid.rows) return;
    // Keep pads in reading order (left to right, top to bottom) so they reflow into the new shape.
    const oldCols = grid.cols, oldRows = grid.rows;
    const used = new Set(Object.keys(grid.cells).concat(maps.map(m => m.cell)).filter(Boolean));
    const entries = [...used].map(k => { const [rr, cc] = parseKey(k); return { k, idx: cc < oldCols ? rr * oldCols + cc : Infinity, rr, cc }; });
    let next = Math.max(oldCols * oldRows, ...entries.filter(e => e.idx !== Infinity).map(e => e.idx + 1), 0);
    entries.filter(e => e.idx === Infinity).sort((a, b) => a.rr - b.rr || a.cc - b.cc).forEach(e => { e.idx = next++; });
    const move = {};
    entries.forEach(e => { move[e.k] = key(Math.floor(e.idx / c), e.idx % c); });
    const cells = {};
    for (const [k, v] of Object.entries(grid.cells)) cells[move[k] || k] = v;
    grid.cells = cells;
    maps.forEach(m => { if (move[m.cell]) m.cell = move[m.cell]; });
    if (move[selected]) selected = move[selected];
    if (learning && move[learning]) learning = move[learning];
    grid.cols = c; grid.rows = r; saveGrid(); saveMaps(); store.set("selCell", selected);
    if (!inGrid(selected)) { selected = "0-0"; store.set("selCell", selected); }
    if (learning && !inGrid(learning)) learning = null;
    renderAll();
  }
  $("#gridCols").onchange = setSize;
  $("#gridRows").onchange = setSize;

  // A labelled dropdown that keeps a saved value visible even if OBS isn't connected or it's gone missing.
  function pick(labelText, values, current, placeholder, onChange) {
    const l = document.createElement("label"); l.textContent = labelText;
    const s = document.createElement("select");
    s.appendChild(opt("", placeholder, !current));
    values.forEach(v => s.appendChild(opt(v, v, current === v)));
    if (current && !values.includes(current)) s.appendChild(opt(current, current + (obs.connected ? " (not found)" : ""), true));
    s.onchange = () => onChange(s.value);
    l.appendChild(s);
    return l;
  }

  // ---- undo (for deletes and mistakes) ----
  let undoTimer = null;
  function hideToast() { $("#toast").classList.remove("on"); }
  function withUndo(label, change) {
    const snap = JSON.stringify({ grid, maps, known });
    change();
    saveGrid(); saveMaps(); saveKnown(); renderAll();
    const t = $("#toast"); t.innerHTML = "";
    const u = el("button", "primary", "Undo");
    u.onclick = () => {
      const s = JSON.parse(snap);
      grid = s.grid; maps = s.maps; known = s.known;
      saveGrid(); saveMaps(); saveKnown(); renderAll(); hideToast();
    };
    const x = el("button", "ghost", "×"); x.title = "Dismiss"; x.onclick = hideToast;
    t.append(el("span", "", label), u, x);
    t.classList.add("on");
    clearTimeout(undoTimer); undoTimer = setTimeout(hideToast, 9000);
  }

  // ---- actions: tile picker + plain-English cards ----
  let pickerFor = null, pickerCell = null;   // "new" or an action id, and which pad it was opened on
  const NEEDS = {
    toggle: "Pick a source below", show: "Pick a source below", hide: "Pick a source below", flash: "Pick a source below",
    scene: "Pick a scene below", scenetoggle: "Pick a scene below", media: "Pick a sound or video below",
    mute: "Pick an audio source below", filter: "Pick a source and a filter below", campreset: "Pick a preset below"
  };
  function describe(m) {
    const q = s => `“${s}”`;
    switch (m.action) {
      case "toggle": return m.source ? `Turns ${q(m.source)} on or off` : null;
      case "show": return m.source ? `Shows ${q(m.source)}` : null;
      case "hide": return m.source ? `Hides ${q(m.source)}` : null;
      case "flash": return m.source ? `Shows ${q(m.source)} for ${m.seconds || 5} seconds` : null;
      case "scene": return m.scene ? `Switches to ${q(m.scene)}` : null;
      case "scenetoggle": return m.scene ? `Switches to ${q(m.scene)}; press again to go back` : null;
      case "media": return m.input ? `Plays ${q(m.input)} from the start` : null;
      case "mute": return m.input ? `Mutes or unmutes ${q(m.input)}` : null;
      case "filter": return m.fsource && m.filter ? `Turns ${q(m.filter)} on ${q(m.fsource)} on or off` : null;
      case "record": return "Starts recording, or stops it if it's running";
      case "camfx": { const f = CAM_FX.find(x => x[0] === (m.effect || "spark")); return `Plays ${f ? f[1] : "an effect"} on your cam`; }
      case "campreset": return m.preset ? `Glides your cam to ${q(m.preset)}` : null;
      case "camtoggle": return "Shows or hides your webcam";
      case "camshape": { const f = CAM_SHAPES.find(x => x[0] === (m.shape || "circle")); return `Makes your cam ${f ? f[1].toLowerCase() : "a new shape"}`; }
      case "camfollow": return "Turns face follow on or off";
      case "micreact": return "Turns mic reactions on or off";
      case "drawtoggle": return "Turns drawing with your finger on or off";
      case "drawclear": return "Wipes what you drew in the air";
    }
    return null;
  }
  const iconsOf = k => actionsOf(k).map(m => (ACTION_INFO[m.action] || {}).icon || "").join(" ");

  function renderPicker() {
    const box = $("#actPicker");
    box.innerHTML = "";
    if (!pickerFor || pickerCell !== selected) { pickerFor = null; box.classList.add("hide"); $("#addBtn").classList.remove("hide"); return; }
    box.classList.remove("hide"); $("#addBtn").classList.add("hide");
    const head = el("div", "pickhead");
    head.append(el("span", "", pickerFor === "new" ? "What should this pad do?" : "Change this action to…"));
    const cancel = el("button", "ghost", "Cancel"); cancel.onclick = () => { pickerFor = null; renderPicker(); };
    head.append(cancel);
    box.append(head);
    CATALOG.forEach(([group, list]) => {
      box.append(el("div", "pickgroup", group));
      const g = el("div", "picktiles");
      list.forEach(([k, icon, title, desc]) => {
        const t = el("button", "tile"); t.type = "button";
        t.append(el("span", "ti", icon), el("span", "tt", title), el("span", "td", desc));
        t.onclick = () => {
          if (pickerFor === "new") maps.push({ id: uid(), cell: selected, action: k, seconds: 5, effect: "spark" });
          else { const m = maps.find(x => x.id === pickerFor); if (m) m.action = k; }
          pickerFor = null; saveMaps(); renderAll();
        };
        g.append(t);
      });
      box.append(g);
    });
  }

  // one dropdown listing every source, grouped by scene (the live scene first)
  function sourceSelect(m, noObs, onPicked) {
    const l = el("label", "", "Source");
    const s = document.createElement("select");
    const scenes = obs.scenes.slice().sort((a, b) => (b === obs.current) - (a === obs.current));
    const entries = [];
    let found = false;
    s.appendChild(opt("", noObs || "Choose a source", !m.source));
    scenes.forEach(sc => {
      const items = obs.items[sc] || [];
      if (!items.length) return;
      const g = document.createElement("optgroup");
      g.label = sc + (sc === obs.current ? "  (live now)" : "");
      items.forEach(it => {
        const i = entries.push(Object.assign({ scene: sc }, it)) - 1;
        const sel = m.scene === sc && m.source === it.source && (m.itemScene || sc) === it.itemScene;
        if (sel) found = true;
        g.appendChild(opt(String(i), it.label, sel));
      });
      s.appendChild(g);
    });
    if (m.source && !found) s.appendChild(opt("keep", `${m.source} (in ${m.scene})` + (obs.connected ? " – not found" : ""), true));
    s.onchange = () => {
      if (s.value === "keep") return;
      const e = entries[+s.value];
      if (e) { m.scene = e.scene; m.itemScene = e.itemScene; m.source = e.source; } else { m.scene = m.itemScene = m.source = ""; }
      saveMaps(); onPicked();
    };
    l.appendChild(s);
    return l;
  }

  function renderMaps() {
    const box = $("#maps");
    box.innerHTML = "";
    const list = actionsOf(selected);
    if (!list.length) box.appendChild(el("div", "empty", "Nothing yet. Click “+ Add action” to choose what this pad does."));
    const noObs = obs.connected ? null : "Connect OBS first (Connections tab)";
    list.forEach((m, idx) => {
      const info = ACTION_INFO[m.action] || { icon: "❓", title: m.action || "Action" };
      const card = el("div", "map");
      card.dataset.id = m.id;
      const top = el("div", "top");
      const txt = el("div", "atext");
      const sumEl = el("div", "asum");
      const refreshSum = () => { const d = describe(m); sumEl.textContent = d || NEEDS[m.action] || ""; sumEl.className = "asum" + (d ? "" : " need"); renderGrid(); };
      txt.append(el("div", "atitle", (list.length > 1 ? `${idx + 1}. ` : "") + info.title), sumEl);
      const change = el("button", "ghost", "Change"); change.title = "Pick a different kind of action";
      change.onclick = () => { pickerFor = m.id; pickerCell = selected; renderPicker(); $("#actPicker").scrollIntoView({ block: "nearest", behavior: "smooth" }); };
      const test = el("button", "", "Test"); test.onclick = () => fire(m, "test");
      const del = el("button", "danger", "Delete");
      del.onclick = () => withUndo(`Deleted “${info.title}” from ${cellLabel(selected)}`, () => { maps = maps.filter(x => x.id !== m.id); });
      top.append(el("span", "aicon", info.icon), txt, change, test, del);

      const row = el("div", "row");
      const a = m.action;
      if (SOURCE_ACTIONS.has(a)) row.appendChild(sourceSelect(m, noObs, refreshSum));
      if (a === "flash") {
        const sL = el("label", "", "For how many seconds"); sL.style.maxWidth = "170px";
        const s = document.createElement("input");
        s.type = "number"; s.min = "0.5"; s.step = "0.5"; s.value = m.seconds || 5;
        s.oninput = () => { m.seconds = Math.max(0.5, parseFloat(s.value) || 5); saveMaps(); refreshSum(); };
        sL.appendChild(s); row.appendChild(sL);
      }
      if (a === "scene" || a === "scenetoggle")
        row.appendChild(pick("Scene", obs.scenes, m.scene, noObs || "Choose a scene", v => { m.scene = v; saveMaps(); refreshSum(); }));
      if (a === "media" || a === "mute") {
        const re = a === "media" ? MEDIA_KINDS : AUDIO_KINDS;
        let names = obs.inputs.filter(n => re.test((obs.kinds || {})[n] || ""));
        if (!names.length) names = obs.inputs;
        row.appendChild(pick(a === "media" ? "Sound or video" : "Audio source", names, m.input,
          noObs || (a === "media" ? "Choose a media source" : "Choose an audio source"), v => { m.input = v; saveMaps(); refreshSum(); }));
      }
      if (a === "filter") {
        const sources = obs.inputs.concat(obs.scenes.filter(s => !obs.inputs.includes(s)));
        row.appendChild(pick("On this source", sources, m.fsource, noObs || "Choose a source", v => { m.fsource = v; m.filter = ""; saveMaps(); renderMaps(); renderGrid(); }));
        if (m.fsource) obs.loadFilters(m.fsource);
        const fl = obs.filters[m.fsource] || [];
        row.appendChild(pick("Filter", fl, m.filter,
          !m.fsource ? "Pick a source first" : (obs.connected && !fl.length ? "No filters on this source" : (noObs || "Choose a filter")),
          v => { m.filter = v; saveMaps(); refreshSum(); }));
      }
      if (a === "camfx") {
        const l = el("label", "", "Effect"); const s2 = document.createElement("select");
        tosAZ(CAM_FX).forEach(([v, t]) => s2.appendChild(opt(v, t, (m.effect || "spark") === v)));
        s2.onchange = () => { m.effect = s2.value; saveMaps(); refreshSum(); };
        l.appendChild(s2); row.appendChild(l);
      }
      if (a === "camshape") {
        const l = el("label", "", "Shape"); const s2 = document.createElement("select");
        CAM_SHAPES.forEach(([v, t]) => s2.appendChild(opt(v, t, (m.shape || "circle") === v)));
        s2.onchange = () => { m.shape = s2.value; saveMaps(); refreshSum(); };
        l.appendChild(s2); row.appendChild(l);
      }
      if (a === "campreset") {
        const names = camPresetNames();
        row.appendChild(pick("Preset", names, m.preset, names.length ? "Choose a preset" : "Save presets on the Webcam tab first", v => { m.preset = v; saveMaps(); refreshSum(); }));
      }
      const d0 = describe(m);
      sumEl.textContent = d0 || NEEDS[m.action] || ""; sumEl.className = "asum" + (d0 ? "" : " need");
      card.append(top);
      if (row.children.length) card.append(row);
      card.append(el("div", "msg"));
      box.appendChild(card);
    });
    renderPicker();
  }

  function renderAll() { renderGrid(); renderKnown(); renderDetail(); }

  function cardFor(id) { return document.querySelector(`.map[data-id="${id}"]`); }
  function cardMsg(id, text, cls) {
    const c = cardFor(id); if (!c) return;
    const m = c.querySelector(".msg"); m.textContent = text; m.className = "msg " + (cls || "");
  }
  function pulse(id) {
    const c = cardFor(id); if (!c) return;
    c.classList.add("fired"); setTimeout(() => c.classList.remove("fired"), 350);
  }

  async function itemId(m) {
    const r = await obs.request("GetSceneItemId", { sceneName: m.itemScene || m.scene, sourceName: m.source });
    return r.sceneItemId;
  }
  async function setVisible(m, id, on) {
    await obs.request("SetSceneItemEnabled", { sceneName: m.itemScene || m.scene, sceneItemId: id, sceneItemEnabled: on });
  }

  async function fire(m, how) {
    pulse(m.id);
    const label = cellLabel(m.cell);
    const done = text => {
      cardMsg(m.id, text, "ok");
      log(`${label}: ${text}${how === "test" ? " (test)" : ""}`);
    };
    try {
      const a = m.action;

      if (a === "scene" || a === "scenetoggle") {
        if (!m.scene) throw new Error("Choose a scene first");
        let target = m.scene;
        if (a === "scenetoggle" && obs.current === m.scene && obs.previous && obs.previous !== m.scene) target = obs.previous;
        await obs.request("SetCurrentProgramScene", { sceneName: target });
        return done(`switched to “${target}”`);
      }
      if (a === "mute") {
        if (!m.input) throw new Error("Choose an audio source first");
        const r = await obs.request("ToggleInputMute", { inputName: m.input });
        return done(`“${m.input}” ${r.inputMuted ? "muted" : "unmuted"}`);
      }
      if (a === "media") {
        if (!m.input) throw new Error("Choose a media source first");
        await obs.request("TriggerMediaInputAction", { inputName: m.input, mediaAction: "OBS_WEBSOCKET_MEDIA_INPUT_ACTION_RESTART" });
        return done(`“${m.input}” playing from the start`);
      }
      if (a === "filter") {
        if (!m.fsource || !m.filter) throw new Error("Choose a source and filter first");
        const r = await obs.request("GetSourceFilter", { sourceName: m.fsource, filterName: m.filter });
        const on = !r.filterEnabled;
        await obs.request("SetSourceFilterEnabled", { sourceName: m.fsource, filterName: m.filter, filterEnabled: on });
        return done(`filter “${m.filter}” ${on ? "on" : "off"}`);
      }
      if (a === "drawtoggle" || a === "drawclear") {
        if (!window.hubCam || !window.hubCam.drawToggle) throw new Error("Webcam tools aren't ready yet");
        if (a === "drawclear") { await window.hubCam.drawClear(); return done("drawing cleared"); }
        const on = await window.hubCam.drawToggle(); return done(on ? "draw mode on" : "draw mode off");
      }
      if (a === "micreact") {
        if (!window.hubCam || !window.hubCam.micToggle) throw new Error("Webcam tools aren't ready yet");
        const on = await window.hubCam.micToggle(); return done(on ? "mic reactions on" : "mic reactions off");
      }
      if (a === "camshape" || a === "camfollow") {
        if (!window.hubCam) throw new Error("Webcam tools aren't ready yet");
        if (a === "camshape") { const sh = m.shape || "circle"; await window.hubCam.shape(sh); return done(`cam shape: ${(CAM_SHAPES.find(x => x[0] === sh) || [sh, sh])[1]}`); }
        const on = await window.hubCam.follow(); return done(on ? "face follow on" : "face follow off");
      }
      if (a === "camfx" || a === "campreset" || a === "camtoggle") {
        if (!window.hubCam) throw new Error("Webcam tools aren't ready yet");
        if (a === "camfx") { const fx = m.effect || "spark"; await window.hubCam.effect(fx); return done(`cam effect: ${(CAM_FX.find(x => x[0] === fx) || [fx, fx])[1]}`); }
        if (a === "campreset") { if (!m.preset) throw new Error("Choose a preset first"); await window.hubCam.preset(m.preset); return done(`cam moved to “${m.preset}”`); }
        const on = await window.hubCam.toggle(); return done(on ? "cam shown" : "cam hidden");
      }
      if (a === "record") {
        const r = await obs.request("ToggleRecord");
        return done(r.outputActive ? "recording started" : "recording stopped");
      }

      if (!m.scene) throw new Error("Choose a scene first");
      if (!m.source) throw new Error("Choose a source first");
      const id = await itemId(m);
      let on;
      if (a === "toggle") {
        const r = await obs.request("GetSceneItemEnabled", { sceneName: m.itemScene || m.scene, sceneItemId: id });
        on = !r.sceneItemEnabled;
        await setVisible(m, id, on);
      } else if (a === "show" || a === "flash") {
        on = true;
        await setVisible(m, id, true);
        if (a === "flash") {
          clearTimeout(flashTimers[m.id]);
          const secs = m.seconds || 5;
          flashTimers[m.id] = setTimeout(() => {
            setVisible(m, id, false).catch(e => log(`${label}: couldn't hide (${e.message})`, true));
          }, secs * 1000);
        }
      } else {
        on = false;
        await setVisible(m, id, false);
      }
      done(`“${m.source}” ${a === "flash" ? `shown for ${m.seconds || 5}s` : (on ? "shown" : "hidden")}`);
    } catch (e) {
      cardMsg(m.id, e.message, "err");
      log(`${label}: ${e.message}`, true);
    }
  }

