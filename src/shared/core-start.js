  // ---------- start ----------
  const hadConn = loadConn();
  if (!hadConn) { $("#help").open = true; $("#obsHelp").open = true; obsNote("Not connected yet. Follow the steps above, then click Connect.", "warn"); }
  // clicking the OBS badge (on any tab) jumps to this box
  const obsPill = $("#obsStatus").closest(".pill");
  obsPill.classList.add("clickable"); obsPill.title = "OBS connection settings";
  obsPill.onclick = () => window.goConn && window.goConn("obsSec");
  renderAll();
  initMidi();
  if (hadConn) obs.connect();
})();
