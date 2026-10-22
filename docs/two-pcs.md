# Two PCs: streaming PC + gaming PC

TOS HUB can run on both PCs of a two-PC stream setup. You install the same app on both and choose what each PC is on the **Stream → Two PCs** tab. Until you choose, TOS HUB works exactly as before on one PC.

## What runs where

| Streaming PC (the full hub) | Gaming PC (a small window) |
|---|---|
| OBS, Twitch login, chat, shoutouts, chat overlay | Pressing keys into the game (⌨️ Press keys actions) |
| Webcam, tracking, effects, the full-screen FX layer | Keybinds you press on the gaming keyboard (⌨️ Keyboard triggers) |
| Pads (RØDECaster Duo), triggers list, voice command list | VoiceAttack, if it runs on the gaming PC (its commands are passed to the streaming PC) |
| Every setting | Optional: the stream's whole-screen effects shown over the game, so you see what chat sees |

The streaming PC still decides everything. The gaming PC only presses keys when the streaming PC asks, reports which keybinds you pressed, and shows effects.

## How the two PCs connect

- The streaming PC listens on **TCP 47822** and answers "is a streaming PC here?" on **UDP 47823**.
- The gaming PC asks on the network every few seconds, lists any streaming PC it finds, and you pair once by typing the 6-digit code the streaming PC shows. If it isn't found (some routers block this), type the streaming PC's address instead.
- Pairing makes a shared secret that both PCs keep. Every later connection proves both sides know it, so nothing else on the network can press keys on the gaming PC. After 5 wrong codes, the streaming PC picks a new code.
- If the link drops, key presses and keybinds go back to the streaming PC until the gaming PC is back, and the gaming PC reconnects by itself.
- Windows Firewall asks once on the streaming PC: allow TOS HUB on **Private networks**.

## Effects over the game

The gaming PC opens a see-through, click-through window over the chosen screen. It loads the same `cam-frame.html?layer=screen` page as the **TOS HUB Full-screen FX** browser source in OBS, and connects straight to OBS on the streaming PC (OBS's address and password come over the link). So it plays exactly the effects sent to the whole screen, at the same moment as the stream. Effects drawn on the cam frame aren't shown, because the cam isn't on the gaming PC's screen. Sounds are off by default. It works with games in borderless or windowed mode; exclusive fullscreen hides windows on top.

## Where the code is

| File | What it does |
|---|---|
| `app/two-pc.js` | The link: which PC this is, finding each other, pairing, messages, the effects window |
| `app/main.js` | Sends `press-keys` and `set-keybinds` to the gaming PC while linked; opens `gaming-pc.html` on the gaming PC |
| `app/gaming-pc.html` | The gaming PC window |
| `src/tabs/two-pcs/` | The Two PCs tab on the streaming PC |

The other tabs didn't need changes. They keep calling `tosHub.pressKeys` and `tosHub.setKeybinds`, and the main process decides which PC does it. Settings live in `two-pc.json` in TOS HUB's settings folder.

## Later ideas

- Show the cam-frame effects on the gaming PC too, at the cam's spot on screen.
- A "game state" channel from the gaming PC (e.g. Game Mood DJ or Wizard Royale) so triggers can react to the game.
- The offline giveaway could run its in-person screen from either PC over the same link.
