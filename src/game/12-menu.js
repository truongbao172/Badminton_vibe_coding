/* ---------- menu ---------- */
const menuFmt = () => document.querySelector('input[name="fmt"]:checked').value;
const menuCourt = () => +document.querySelector('input[name="court"]:checked').value;
// Menu backdrop: players in ready stance on the chosen court, shuttle resting on the service line
function placeBackdrop() {
  Object.assign(S, { server: 0, score: [0, 0], right: [0, 1] });
  placeForServe();
  shuttle.mode = 'rest'; shuttle.p = { x: 0.9, y: 0.03, z: C.shortZ + 0.25 };
}
function readMenu() {
  S.diff = document.querySelector('input[name="diff"]:checked').value; S.showMarker = $('optMarker').checked;
  setFormat(menuFmt()); setCourt(menuCourt());
}
for (const el of document.querySelectorAll('input[name="fmt"], input[name="court"]')) {
  el.addEventListener('change', () => { if (S.state === 'menu' && S.mode === 'ai') { readMenu(); placeBackdrop(); } });
}
function backToMenu() {
  clearPunish();
  S.paused = false; S.state = 'menu'; $('pause').hidden = $('result').hidden = true; $('serveHint').hidden = true;
  $('menu').hidden = false; readMenu(); placeBackdrop(); hideRing(); updateHUD(); refreshRooms();
}
$('btnStart').addEventListener('click', () => { readMenu(); newMatch(); });
$('btnGfx').addEventListener('click', cycleGfx);
$('btnPauseGfx').addEventListener('click', cycleGfx);
$('btnResume').addEventListener('click', () => setPaused(false));
$('btnQuit').addEventListener('click', () => { if (S.mode !== 'ai') lanEnd(''); else backToMenu(); });
$('btnAgain').addEventListener('click', () => { if (S.mode === 'guest') send({ t: 'again' }); else newMatch(); });
$('btnMenu').addEventListener('click', () => { if (S.mode !== 'ai') lanEnd(''); else backToMenu(); });
$('btnLan').addEventListener('click', () => lanJoin());
$('btnLobbyCancel').addEventListener('click', () => lanEnd(''));
$('btnLobbyStart').addEventListener('click', () => { if (S.mode === 'host') newMatch(); });
// One mode per page. With the server (LAN, Render, Cloudflare): only "Chơi với người"; playing the computer is joining an
// empty court and putting the computer in the empty seats. The one-file page (no server) can only play the computer:
// it shows the old setup instead, with the difficulty, landing marker and how-to moved over from the people panel.
if (window.SAN7_LAN) { $('lanGroup').hidden = false; $('lanOff').hidden = true; }
else {
  document.querySelector('.tabs').hidden = true; $('panelLan').hidden = true; $('panelAi').hidden = false;
  $('aiStartRow').before($('diffGroup'), $('markerRow')); $('diffHint').hidden = true;
  $('aiSide').append($('howTo'));
}

/* ---------- character customizer ---------- */
const LOOK_OPTS = [
  { pick: 'body', label: 'Dáng người', opts: [['m', 'Nam'], ['f', 'Nữ']] },
  { pick: 'build', label: 'Thân hình', opts: [['n', 'Thường'], ['b', 'Cơ bắp']] },
  // A `pick` row is a switch; a row with `when` only shows while that switch is on that value (or while
  // `when(look)` is true). Shorts and skirt each keep their own colour, and so do the plain racket and the custom one.
  { pick: 'suit', label: 'Trang phục', opts: [['none', 'Áo quần'], ['v', 'Chữ V'], ['bolt', 'Tia chớp'], ['side', 'Sọc hông'], ['star', 'Ngôi sao']] },
  { k: 'shirt', label: l => l.suit === 'none' ? 'Áo' : 'Màu bộ đồ', colors: [0xf0643a, 0x3f9ef0, 0xe8a23a, 0x5b6ff0, 0x2fbf71, 0xe5484d, 0xc056d8, 0x14b8a6, 0xf2f2ee, 0x2b2f36] },
  { pick: 'bt', when: l => l.suit === 'none', label: 'Quần hay váy', opts: [['shorts', 'Quần'], ['skirt', 'Váy']] },
  { k: 'shorts', when: l => l.suit === 'none' && l.bt === 'shorts', label: 'Màu quần', colors: [0x1f2a36, 0x2b2f36, 0xf2f2ee, 0x3f5d8a, 0x7a3d2c, 0x3a6b45] },
  { k: 'skirt', when: l => l.suit === 'none' && l.bt === 'skirt', label: 'Màu váy', colors: [0xf2f2ee, 0xf4a6c0, 0xe5484d, 0xc056d8, 0x3f9ef0, 0x14b8a6, 0xffb547, 0x2b2f36] },
  { pick: 'mask', label: 'Mặt nạ', opts: [['none', 'Không'], ['eye', 'Bịt mắt'], ['full', 'Trùm đầu']] },
  { pick: 'cape', label: 'Áo choàng', opts: [['n', 'Không'], ['y', 'Có']] },
  // Trim of the suit (pattern, gloves, boots, belt), the mask over the eyes and the cape
  { k: 'acc', when: l => l.suit !== 'none' || l.mask === 'eye' || l.cape === 'y', label: 'Màu phụ', colors: [0xffb547, 0xe5484d, 0x3f9ef0, 0x2fbf71, 0xc056d8, 0x14b8a6, 0xf2f2ee, 0x2b2f36] },
  // Natural skin tones, then green, blue and purple for a superhero
  { k: 'skin', label: 'Da', colors: [0xf1d0b5, 0xe0ac8a, 0xc98f6b, 0xa56b46, 0x6f4429, 0x6aa84f, 0x4f7fc4, 0x8a63c9] },
  { k: 'hair', label: 'Tóc', colors: [0x1d1a17, 0x4a2f1d, 0x8a5a2b, 0xd8b45a, 0xb23a2e, 0x9aa0a6] },
  { pick: 'hand', label: 'Tay cầm vợt', opts: [['R', 'Tay phải'], ['L', 'Tay trái']] },
  { pick: 'rk', label: 'Kiểu vợt', opts: [['plain', 'Thường', 'Một màu'], ['custom', 'Custom', 'K520 Pro · 100ZZ']] },
  { k: 'racket', when: ['rk', 'plain'], label: 'Màu vợt', colors: [0xf0643a, 0x3f9ef0, 0xe5484d, 0x2fbf71, 0xffb547, 0xf2f2ee, 0x2b2f36] },
  { k: 'rkv', when: ['rk', 'custom'], label: 'Phiên bản', colors: RACKET_IDS, name: racketName,
    swatch: v => `linear-gradient(135deg, ${RACKETS[v].base} 0 52%, ${RACKETS[v].a1} 52% 72%, ${RACKETS[v].a2} 72%)` },
  // String colours you can actually get strung: white, yellow, lime, orange, red, pink, blue, black
  { k: 'str', label: 'Màu lưới', colors: [0xf4f4f2, 0xf2e14a, 0x9be33a, 0xff8a2a, 0xe5484d, 0xf28cb1, 0x3f9ef0, 0x2b2f36] },
];
const LOOK_KEY = 'san7-look';
let myLook = null;
try { myLook = cleanLook(JSON.parse(localStorage.getItem(LOOK_KEY))); } catch (e) {}
myLook = myLook || { ...DEF_LOOKS[0] };
const hex = c => '#' + c.toString(16).padStart(6, '0');
function buildLookOpts() {
  const box = $('lookOpts'); box.innerHTML = '';
  for (const o of LOOK_OPTS) {
    if (o.when && !(typeof o.when === 'function' ? o.when(myLook) : myLook[o.when[0]] === o.when[1])) continue;
    if (o.pick) { box.append(lookPicker(o)); continue; }
    const label = typeof o.label === 'function' ? o.label(myLook) : o.label;
    const row = document.createElement('div'); row.className = 'opt';
    const lb = document.createElement('span'); lb.className = 'label'; lb.textContent = label;
    const sws = document.createElement('div'); sws.className = 'sws';
    o.colors.forEach((c, i) => {
      const b = document.createElement('button'); b.className = 'swatch'; b.style.background = o.swatch ? o.swatch(c) : hex(c);
      if (o.name) b.title = o.name(c);
      b.setAttribute('aria-label', o.name ? `${label} ${o.name(c)}` : `${label} màu ${i + 1}`); b.setAttribute('aria-pressed', String(myLook[o.k] === c));
      b.addEventListener('click', () => setLook({ ...myLook, [o.k]: c }));
      sws.append(b);
    });
    row.append(lb, sws); box.append(row);
  }
  for (const el of document.querySelectorAll('input[name="hs"]')) el.checked = el.value === myLook.hs;
}
// Switch (Quần / Váy, Thường / Custom, the suit patterns…), placed right above the row it switches.
// Two choices sit side by side; more wrap three to a row.
function lookPicker(o) {
  const row = document.createElement('div'); row.className = 'opt';
  const lb = document.createElement('span'); lb.className = 'label'; lb.textContent = o.label;
  const seg = document.createElement('div'); seg.className = o.opts.length === 2 ? 'seg two' : 'seg many'; seg.setAttribute('role', 'radiogroup');
  for (const [v, t, sub] of o.opts) {
    const id = `${o.pick}-${v}`;
    const inp = document.createElement('input'); inp.type = 'radio'; inp.name = o.pick; inp.id = id; inp.value = v; inp.checked = myLook[o.pick] === v;
    // The panel is rebuilt on every change, so put keyboard focus back on the new radio
    inp.addEventListener('change', () => { setLook({ ...myLook, [o.pick]: v }); $(id).focus(); });
    const l = document.createElement('label'); l.htmlFor = id; const b = document.createElement('b'); b.textContent = t; l.append(b);
    if (sub) { const s = document.createElement('span'); s.textContent = sub; l.append(s); }
    seg.append(inp, l);
  }
  row.append(lb, seg);
  return row;
}
function setLook(l) {
  // Changing the racket zooms the preview in on it for a few seconds
  if (['rk', 'rkv', 'racket', 'str'].some(k => l[k] !== myLook[k])) pv.zoomUntil = clock + 3;
  myLook = l;
  try { localStorage.setItem(LOOK_KEY, JSON.stringify(l)); } catch (e) {}
  buildLookOpts(); applyLook(pv.fig, l); updateLooks();
}
for (const el of document.querySelectorAll('input[name="hs"]')) el.addEventListener('change', () => setLook({ ...myLook, hs: el.value }));
const pick = a => a[Math.floor(Math.random() * a.length)];
$('btnRandom').addEventListener('click', () => {
  const l = { hs: pick(HAIR_STYLES) };
  for (const o of LOOK_OPTS) if (o.pick) l[o.pick] = pick(o.opts)[0]; else l[o.k] = pick(o.colors);
  setLook(l);
});
$('btnCustom').addEventListener('click', () => $('custom').classList.add('open'));
$('btnCustomDone').addEventListener('click', () => $('custom').classList.remove('open'));
// Which look each player wears: yours vs the computer; on LAN whatever each player picked
function lookOf(i) {
  if (S.mode === 'ai') return i === 0 ? myLook : DEF_LOOKS[i];
  // Your own player always wears exactly what you picked here, even if the server drops a field it does not know yet
  if (i === me) return myLook;
  return (S.roster[i] && S.looks[i]) || DEF_LOOKS[i];
}
function updateLooks() { ATH.forEach((a, i) => { const l = lookOf(i); if (a.look !== l) { a.look = l; applyLook(a, l); } }); }

// Turntable preview of your player, drawn by a small second renderer while the menu is open
const pv = { canvas: $('preview'), w: 0, h: 0, zoomUntil: 0, zoom: 0 };
pv.renderer = new THREE.WebGLRenderer({ canvas: pv.canvas, antialias: true, alpha: true });
pv.renderer.outputEncoding = THREE.sRGBEncoding; pv.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
pv.renderer.toneMapping = renderer.toneMapping; pv.renderer.toneMappingExposure = renderer.toneMappingExposure;
pv.scene = new THREE.Scene();
// The environment map belongs to the main renderer's WebGL context, so the preview gets its own copy of the light
pv.scene.add(new THREE.AmbientLight(0x9fb4c8, 0.25));
pv.scene.add(new THREE.HemisphereLight(0xe6eeff, 0x40301f, 0.85));
const pvSun = new THREE.DirectionalLight(0xfff4e4, 0.9); pvSun.position.set(2, 4, 4); pv.scene.add(pvSun);
pv.cam = new THREE.PerspectiveCamera(28, 1, 0.1, 20); pv.cam.position.set(0, 1.15, 5.2); pv.cam.lookAt(0, 1.05, 0);
pv.fig = figure(myLook); pv.scene.add(pv.fig.g);
pv.fig.cape.idle = 0.35; // a breeze, so the cape moves on the turntable
const pvTmp = new THREE.Vector3();
{ // static ready stance
  const f = pv.fig, q = READY;
  f.R.sh.rotation.set(q.sx, 0, q.sz); f.R.el.rotation.x = q.el; f.R.wr.rotation.x = q.wr;
  f.L.sh.rotation.set(q.lx, 0, q.lz); f.L.el.rotation.x = q.le; f.torso.rotation.x = -0.06;
  let ext = 0;
  f.legs.forEach(l => { l.hip.rotation.x = 0.15; l.knee.rotation.x = -0.3; l.ankle.rotation.x = 0.15; ext = THIGH * Math.cos(0.15) + SHIN * Math.cos(-0.15); });
  f.pelvis.position.y = HIP_DROP + FOOT + ext;
}
// Wide screens show the preview in its own column (#stage); otherwise it sits at the top of the customizer
const stageMQ = matchMedia('(min-width:1200px)'), pvSlot = document.createComment('preview');
pv.canvas.before(pvSlot);
function placePreview() { if (stageMQ.matches) $('stage').append(pv.canvas); else pvSlot.after(pv.canvas); }
stageMQ.addEventListener ? stageMQ.addEventListener('change', placePreview) : stageMQ.addListener(placePreview);
placePreview();
function renderPreview() {
  if ($('menu').hidden || !pv.canvas.offsetWidth) return;
  const w = pv.canvas.clientWidth, h = pv.canvas.clientHeight;
  if (w !== pv.w || h !== pv.h) {
    pv.w = w; pv.h = h; pv.renderer.setSize(w, h, false); pv.cam.aspect = w / h; pv.cam.updateProjectionMatrix();
    // Far enough back to fit 2.3 m of height and 1.2 m of width (body, raised racket, reaching arms)
    const t = 2 * Math.tan(THREE.MathUtils.degToRad(pv.cam.fov / 2));
    pv.dist = Math.max(2.3 / t, 1.2 / (t * pv.cam.aspect));
  }
  pv.fig.g.rotation.y = Math.PI + (reduceMotion ? 0.5 : Math.sin(clock * 0.6) * 0.9);
  // Ease between the full-body view and a close-up of the racket head
  pv.zoom += ((clock < pv.zoomUntil ? 1 : 0) - pv.zoom) * (reduceMotion ? 1 : 0.08);
  driveModel(pv.fig);
  pv.fig.g.updateMatrixWorld(true);
  const t = pv.fig.racket.center.getWorldPosition(pvTmp), z = pv.zoom;
  const D = pv.dist || 5.2;
  pv.cam.position.set(t.x * z, 1.15 + (t.y + 0.05 - 1.15) * z, D + (t.z + 1.25 - D) * z);
  pv.cam.lookAt(t.x * z, 1.05 + (t.y - 1.05) * z, t.z * z);
  pv.renderer.render(pv.scene, pv.cam);
}
buildLookOpts(); updateLooks();

// LAN only: who is on each court and how many people have the game open, polled every 2 s
let roomsT = 0, rooms = [];
// One id per browser, kept across reloads, so reloading or opening a second tab does not count you twice
const visitorId = (() => {
  const KEY = 'san7-visitor';
  try { const v = localStorage.getItem(KEY); if (v) return v; } catch (e) {}
  const v = Math.random().toString(36).slice(2, 12);
  try { localStorage.setItem(KEY, v); } catch (e) {}
  return v;
})();
// Closing the tab: tell the server right away instead of waiting for the 8 s timeout
addEventListener('pagehide', () => { if (window.SAN7_LAN) try { navigator.sendBeacon('/rooms?bye=' + visitorId); } catch (e) {} });
function refreshRooms() {
  if (!window.SAN7_LAN) return;
  fetch('/rooms?id=' + visitorId).then(r => r.json()).then(data => {
    rooms = data.rooms || [];
    $('onlineN').textContent = data.online; $('online').hidden = false;
    $('lanStats').textContent = `${data.online} người online · ${data.playing} người trong sân`;
    $('tabLanN').textContent = data.playing; $('tabLanN').hidden = !data.playing;
    renderCourts();
  }).catch(() => {});
}
// Court list on the "Chơi với người" tab: status, head count and names per court; tap to pick
function renderCourts() {
  const box = $('courtList'), sel = menuCourt();
  box.innerHTML = '';
  for (let i = 0; i < COURTS; i++) {
    const r = rooms[i] || { n: 0, cap: 2, fmt: 'don' }, fmt = r.fmt === 'doi' ? 'Đôi' : 'Đơn';
    const el = document.createElement('button');
    el.className = 'court' + (r.n ? ' busy' : '') + (r.full ? ' full' : '');
    el.setAttribute('aria-pressed', String(i === sel));
    const nm = document.createElement('b'); nm.textContent = `Sân ${i + 1}`;
    const st = document.createElement('span'); st.className = 'st';
    st.innerHTML = '<i></i>'; st.append(!r.n ? 'Trống' : `${fmt} · ${r.full ? 'đã đầy' : r.started ? 'đang đấu' : 'đang chờ người'}`);
    const ct = document.createElement('span'); ct.className = 'ct'; ct.textContent = r.n ? `${r.n}/${r.cap}` : '';
    const who = document.createElement('span'); who.className = 'who';
    who.textContent = r.n ? (r.names || []).join(', ') : 'Vào trước để làm chủ sân';
    el.append(nm, st, ct, who);
    el.addEventListener('click', () => { $('c-' + (i + 1)).checked = true; readMenu(); placeBackdrop(); renderCourts(); });
    box.append(el);
  }
  // Joining an occupied court follows the host's format; an empty court lets you pick
  const r = rooms[sel], taken = !!(r && r.n);
  for (const el of document.querySelectorAll('input[name="lfmt"]')) { el.disabled = taken; if (taken) el.checked = el.value === r.fmt; }
  $('lfmtHint').textContent = taken ? `Sân ${sel + 1} đang ${r.fmt === 'doi' ? 'đánh đôi' : 'đánh đơn'}, bạn vào theo thể thức của chủ sân.` : `Sân ${sel + 1} đang trống: bạn sẽ làm chủ sân.`;
  const full = !!(r && r.full);
  $('btnLan').disabled = full; $('btnLan').textContent = full ? `SÂN ${sel + 1} ĐÃ ĐẦY` : `VÀO SÂN ${sel + 1}`;
  const can = live(sel);
  $('btnWatch').disabled = !can; $('btnWatch').textContent = can ? `XEM SÂN ${sel + 1}` : 'XEM';
}
// Display name for LAN, remembered on this device
const NAME_KEY = 'san7-name';
try { $('optName').value = localStorage.getItem(NAME_KEY) || ''; } catch (e) {}
const myName = () => $('optName').value.replace(/[\u0000-\u001f\u007f<>]/g, '').trim().slice(0, 16);
$('optName').addEventListener('change', () => { try { localStorage.setItem(NAME_KEY, myName()); } catch (e) {} });
for (const el of document.querySelectorAll('input[name="court"]')) el.addEventListener('change', () => { if (window.SAN7_LAN) renderCourts(); });

