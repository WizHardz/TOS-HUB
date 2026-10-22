# TOS HUB

WizHardz's stream control app: RØDECaster pads, Twitch shoutouts, chat overlay, webcam tools, triggers, keybinds and voice commands for OBS. Runs as a Windows desktop app (Electron).

## Where things are

```
src/tabs/<tab>/     one folder per tab: its HTML and its code
src/shared/         code every tab uses: page layout, styles, OBS, Twitch, storage, backup
src/manifest.json   the order the pieces are stitched together in
build.js            stitches src/ into app/stream-hub.html
app/                the app itself (main.js, preload.js, overlays, tracking models, 3D objects)
packaging/          desktop shortcut helpers that ship next to TOS HUB.exe
```

| Tab | Folder |
|---|---|
| Connections | `src/tabs/connections` |
| Pads | `src/tabs/pads` |
| Shoutouts | `src/tabs/shoutouts` |
| Chat overlay (and Chat on my screen) | `src/tabs/chat-overlay` |
| Webcam | `src/tabs/webcam` |
| Triggers | `src/tabs/triggers` |
| Keybinds | `src/tabs/keybinds` (page) and `src/tabs/triggers/triggers.js` (key pressing) |
| Voice (VoiceAttack) | `src/tabs/voice` |
| Stream view | `src/tabs/stream-view` |
| Two PCs (streaming PC + gaming PC) | `src/tabs/two-pcs` (page), `app/two-pc.js` (the link), `app/gaming-pc.html` (gaming PC window); see `docs/two-pcs.md` |

## Making a change

1. Edit the files for your tab in `src/tabs/<tab>/`.
2. Run `node build.js`. It rewrites `app/stream-hub.html`.
3. Copy `app/` over `TOS HUB\resources\app\` next to `TOS HUB.exe` and restart TOS HUB.

Don't edit `app/stream-hub.html` by hand; the next build overwrites it.

Some `.js` files are pieces of a bigger script rather than complete files on their own. For example, `shared/core.js`, `tabs/pads/pads.js`, `tabs/pads/midi.js` and `shared/core-start.js` are stitched into one script and share its variables. `manifest.json` shows which pieces go together.
