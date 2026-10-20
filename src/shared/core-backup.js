  // ---------- backup / restore ----------
  $("#backupBtn").onclick = () => {
    const blob = new Blob([JSON.stringify({ app: "stream-hub-pads", version: 2, grid, maps, known }, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "tos-hub-pads-backup.json";
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    log(`Backup saved (${visibleKeys().filter(k => peek(k).trigger || actionsOf(k).length).length} pads, ${maps.length} actions)`);
  };
  $("#restoreBtn").onclick = () => $("#restoreFile").click();
  $("#restoreFile").onchange = async e => {
    const f = e.target.files[0]; e.target.value = "";
    if (!f) return;
    try {
      const data = JSON.parse(await f.text());
      const list = Array.isArray(data) ? data : data.maps;
      if (!Array.isArray(list) || list.some(x => !x || typeof x !== "object")) throw new Error("not a TOS HUB / Pad Bridge backup");
      if (maps.length && !confirm("Replace your current pads with the ones in this backup?")) return;
      maps = list.map(x => Object.assign({ id: uid(), action: "toggle" }, x));
      if (data.grid && data.grid.cells) {
        grid = data.grid;
        known = Array.isArray(data.known) ? data.known : [];
      } else {
        // an older Pad Bridge backup: lay its pads out on a fresh grid
        store.set("grid", null); store.set("maps", maps);
        location.reload(); return;
      }
      learning = null; quick = null; selected = "0-0";
      saveMaps(); saveGrid(); saveKnown(); renderAll();
      log(`Restored ${maps.length} action${maps.length === 1 ? "" : "s"} from backup`);
    } catch (err) {
      log("Couldn't restore: " + err.message, true);
    }
  };

  $("#addBtn").onclick = () => { pickerFor = "new"; pickerCell = selected; renderPicker(); $("#actPicker").scrollIntoView({ block: "nearest", behavior: "smooth" }); };
  $("#refreshBtn").onclick = () => obs.connected ? obs.refresh() : log("Connect to OBS first", true);
  document.addEventListener("keydown", e => {
    if (e.key !== "Escape") return;
    if (quick) { $("#quickStop").click(); return; }
    if (learning) { learning = null; padMsg(""); renderAll(); }
  });

