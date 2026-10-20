// A–Z for every list of effects and actions (the emoji in front doesn't count)
window.tosAZ = (list, i) => list.slice().sort((a, b) => String(a[i == null ? 1 : i]).replace(/^[^\p{L}\p{N}]+/u, "").localeCompare(String(b[i == null ? 1 : i]).replace(/^[^\p{L}\p{N}]+/u, ""), undefined, { sensitivity: "base" }));
// effect categories (A–Z), used by every effect list and menu
window.TOS_FX_CATS = [
  ["big", "💥 Big moments", ["shot", "fishtank"]],
  ["face", "😜 Funny face", ["bigeyes", "bighead", "wobble", "googly", "shades", "lasers", "firebreath", "eyesmouth", "rainbow", "crying"]],
  ["hats", "👑 Hats & costumes", ["hat", "halo", "crown", "horns", "cat", "pumpkin", "viking", "wings", "puppy"]],
  ["magic", "⚡ Magic & elements", ["spark", "zap", "fire", "fireball", "frost", "magic", "portal", "meteor", "bubbles", "shield", "powerup"]],
  ["party", "🎉 Party & hype", ["boom", "hearts", "confetti", "handconfetti", "poke", "shake", "afterimage"]],
  ["smoke", "💨 Smoke & weather", ["smoke", "earsmoke", "mouthsmoke", "rain"]],
  ["morph", "🗿 Transform", ["object", "ice", "stone", "holo", "gold", "timewarp", "sketch"]]];
window.tosFxCat = k => (TOS_FX_CATS.find(c => c[2].includes(k)) || ["other"])[0];
window.tosFxGroups = list => {   // [[category name, items A–Z], …]
  const out = TOS_FX_CATS.map(([id, name]) => [name, tosAZ(list.filter(x => tosFxCat(x[0]) === id))]);
  out.push(["✨ More", tosAZ(list.filter(x => tosFxCat(x[0]) === "other"))]);
  return out.filter(g => g[1].length);
};
window.tosFxOptions = (sel, list, val) => tosFxGroups(list).forEach(([name, items]) => { const g = document.createElement("optgroup"); g.label = name; items.forEach(([k, l]) => { const o = new Option(l, k); if (k === val) o.selected = true; g.append(o); }); sel.append(g); });
