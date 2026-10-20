  // ---------- MIDI ----------
  let midi = null;
  function setMidiStatus(text, cls) { $("#midiStatus").textContent = "MIDI: " + text; $("#midiDot").className = "dot " + (cls || ""); }

  function onMidi(e) {
    const sel = $("#midiDevice").value;
    if (sel !== "all" && e.target.id !== sel) return;
    const [status, d1 = 0, d2 = 0] = e.data;
    if (status >= 0xF0) return; // clock / system messages
    const type = status & 0xF0, ch = (status & 0x0F) + 1;
    let kind, press;
    if (type === 0x90) { kind = "note"; press = d2 > 0; }
    else if (type === 0x80) { kind = "note"; press = false; }
    else if (type === 0xB0) { kind = "cc"; press = d2 > 0; }
    else return;

    const mon = $("#monitor");
    mon.textContent = `${kind === "note" ? "Note" : "CC"} ${d1} · Ch ${ch} · ${kind === "note" ? "velocity" : "value"} ${d2}${press ? "" : " (release)"}  —  ${e.target.name}`;
    mon.classList.add("hit"); clearTimeout(onMidi.t); onMidi.t = setTimeout(() => mon.classList.remove("hit"), 300);

    if (!press) return;
    handlePress({ kind, ch, num: d1 }, e.target.name);
  }

  function refreshInputs() {
    const sel = $("#midiDevice");
    const prev = store.get("midiDevice", "all");
    sel.innerHTML = "";
    sel.appendChild(opt("all", "All MIDI inputs", prev === "all"));
    let count = 0, rode = false;
    const inputs = [];
    midi.inputs.forEach(input => {
      count++;
      inputs.push(input);
      if (/r[øo]de|midi function/i.test((input.name || "") + " " + (input.manufacturer || ""))) rode = true;
      sel.appendChild(opt(input.id, input.name || "MIDI input", prev === input.id));
      input.onmidimessage = onMidi;
    });
    if (!count) { setMidiStatus("no devices found", "bad"); return; }
    setMidiStatus(rode ? "RØDECaster found" : `${count} device${count > 1 ? "s" : ""}`, rode ? "good" : "warn");
    // Open each port explicitly so we can report if another program is holding it.
    inputs.forEach(input => {
      if (input.connection === "open") return;
      Promise.resolve(input.open ? input.open() : null).then(() => {
        if (input.connection === "open" && !openOk.has(input.id)) {
          openOk.add(input.id);
          log(`Listening to "${input.name}"`);
        }
      }).catch(() => {
        setMidiStatus("in use by another program", "bad");
        log(`Couldn't open "${input.name}". Another program (often OBS with a MIDI plugin, RØDE Central or a DAW) is using it. Close that program, then reload this page.`, true);
        $("#monitor").textContent = `"${input.name}" is in use by another program, so pad presses can't reach this page. Close OBS (or whatever else is using MIDI), reload this page, then reopen OBS.`;
      });
    });
  }
  const openOk = new Set();
  $("#midiDevice").onchange = () => store.set("midiDevice", $("#midiDevice").value);

  async function initMidi() {
    if (!navigator.requestMIDIAccess) { setMidiStatus("not supported — use Chrome or Edge", "bad"); return; }
    try {
      midi = await navigator.requestMIDIAccess({ sysex: false });
      midi.onstatechange = refreshInputs;
      refreshInputs();
    } catch (e) {
      if (e && e.name === "NotAllowedError") {
        setMidiStatus("blocked — allow MIDI access", "bad");
        log("MIDI access was blocked. Allow it from the icon in the address bar, then reload.", true);
      } else {
        setMidiStatus("couldn't start MIDI", "bad");
        log(`MIDI couldn't start (${(e && e.message) || e}). Check the Duo is plugged in by USB, then restart TOS HUB.`, true);
      }
    }
  }

