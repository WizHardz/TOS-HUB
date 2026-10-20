  // ---------- start ----------
  $("#twChannel").value = cfg.channel;
  $("#twClientId").value = cfg.clientId;
  if (session && Date.now() - (session.last || 0) > SIX_HOURS) session = null;
  if (!session) { session = newSession(); saveSession(); }
  renderAuth();
  renderList();
  renderPending();
  setTw("not connected", "");
  if (!cfg.token) $("#twAuth").open = !cfg.clientId;
  (async () => {
    if (cfg.token) {
      try {
        const u = await helix("users");
        const me = u.data && u.data[0];
        if (me) { cfg.login = me.login; cfg.userId = me.id; saveCfg(); renderAuth(); }
      } catch (e) { /* authExpired handles a dead token; network errors just leave it */ }
    }
    if (cfg.channel) chat.connect();
  })();
})();
