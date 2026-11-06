/* ---------- input ---------- */
const keys = new Set(), stick = { x: 0, y: 0 }, input = { x: 0, z: 0, run: false };
// Key bindings: each action has a main and a second key (KeyboardEvent.code), saved on this machine.
// Esc always pauses (and cancels while picking a key); P pauses too unless it is bound to an action.
const KB_KEY = 'san7-keys';
const KB_ACTS = [['up', 'Lên', 'Về phía lưới'], ['down', 'Xuống', 'Giữ khi đánh mạnh để phông'], ['left', 'Trái', ''], ['right', 'Phải', ''],
  ['jump', 'Nhảy', ''], ['hit', 'Đánh', 'Nhấn: nhẹ · giữ: mạnh']];
const KB_DEF = { up: ['KeyW', 'ArrowUp'], down: ['KeyS', 'ArrowDown'], left: ['KeyA', 'ArrowLeft'], right: ['KeyD', 'ArrowRight'], jump: ['Space', null], hit: ['KeyJ', null] };
const kbCopy = kb => Object.fromEntries(Object.entries(kb).map(([a, v]) => [a, [...v]]));
function loadKB() {
  const kb = kbCopy(KB_DEF), seen = new Set();
  try {
    const saved = JSON.parse(localStorage.getItem(KB_KEY));
    if (saved && typeof saved === 'object') for (const [a] of KB_ACTS) {
      const v = Array.isArray(saved[a]) ? [0, 1].map(i => typeof saved[a][i] === 'string' && saved[a][i] && saved[a][i] !== 'Escape' ? saved[a][i] : null) : null;
      if (v && (v[0] || v[1])) kb[a] = v;
    }
  } catch (e) {}
  // A broken save (the same key twice) falls back to the defaults
  for (const a in kb) for (const c of kb[a]) { if (!c) continue; if (seen.has(c)) return kbCopy(KB_DEF); seen.add(c); }
  return kb;
}
let KB = loadKB();
const actOf = code => { for (const a in KB) if (KB[a].includes(code)) return a; return null; };
const held = a => KB[a].some(c => c && keys.has(c));
const KEY_NAMES = { Space: 'Space', ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→', ShiftLeft: 'Shift', ShiftRight: 'Shift phải',
  ControlLeft: 'Ctrl', ControlRight: 'Ctrl phải', AltLeft: 'Alt', AltRight: 'Alt phải', MetaLeft: 'Cmd', MetaRight: 'Cmd phải', CapsLock: 'Caps',
  Enter: 'Enter', Tab: 'Tab', Backquote: '`', Minus: '-', Equal: '=', BracketLeft: '[', BracketRight: ']', Backslash: '\\', Semicolon: ';',
  Quote: "'", Comma: ',', Period: '.', Slash: '/', NumpadEnter: 'Num Enter' };
function keyName(c) {
  if (!c) return '—';
  if (KEY_NAMES[c]) return KEY_NAMES[c];
  if (/^Key[A-Z]$/.test(c)) return c.slice(3);
  if (/^Digit\d$/.test(c)) return c.slice(5);
  if (c.startsWith('Numpad')) return 'Num ' + c.slice(6);
  return c.replace(/[^\w ]/g, '');
}
const key1 = a => keyName(KB[a][0] || KB[a][1]);
function renderKeyHints() {
  for (const el of document.querySelectorAll('[data-k]')) el.textContent = key1(el.dataset.k);
  updateServeHint();
}
let binding = null, bindSwallow = null, keysFrom = null;
function renderBinds() {
  const list = $('bindList'); list.textContent = '';
  for (const t of ['', 'Phím chính', 'Phím phụ']) { const h = document.createElement('div'); h.className = 'bh'; h.textContent = t; list.append(h); }
  for (const [a, name, sub] of KB_ACTS) {
    const l = document.createElement('div'); l.className = 'bl'; l.textContent = name;
    if (sub) { const sm = document.createElement('small'); sm.textContent = sub; l.append(sm); }
    list.append(l);
    for (const slot of [0, 1]) {
      const b = document.createElement('button'), wait = binding && binding.a === a && binding.slot === slot;
      b.className = 'bind' + (wait ? ' wait' : KB[a][slot] ? '' : ' empty');
      b.textContent = wait ? 'Bấm phím…' : KB[a][slot] ? keyName(KB[a][slot]) : 'Trống';
      b.setAttribute('aria-label', `${name}, phím ${slot ? 'phụ' : 'chính'}: ${KB[a][slot] ? keyName(KB[a][slot]) : 'trống'}`);
      b.addEventListener('click', () => { binding = { a, slot }; $('keysNote').textContent = ''; renderBinds(); list.querySelector('.wait').focus(); });
      list.append(b);
    }
  }
}
function saveKB() {
  try { localStorage.setItem(KB_KEY, JSON.stringify(KB)); } catch (e) {}
  keys.clear(); hitUp(); renderKeyHints(); renderBinds();
}
function captureKey(e) {
  e.preventDefault(); e.stopPropagation();
  if (e.repeat) return;
  const { a, slot } = binding, name = KB_ACTS.find(x => x[0] === a)[1], note = $('keysNote');
  bindSwallow = e.code; binding = null;
  if (e.code === 'Escape') { note.textContent = ''; renderBinds(); return; }
  if (e.code === 'Backspace' || e.code === 'Delete') {
    if (KB[a][1 - slot]) { KB[a][slot] = null; note.textContent = `Đã xoá một phím của ${name}.`; }
    else note.textContent = `${name} cần ít nhất một phím.`;
  } else {
    const prev = KB[a][slot], other = actOf(e.code);
    if (other && other !== a) {
      // Swap: the other action takes this slot's old key, unless that would leave it with no key at all
      const i = KB[other].indexOf(e.code), oname = KB_ACTS.find(x => x[0] === other)[1];
      if (!prev && !KB[other][1 - i]) { note.textContent = `Phím ${keyName(e.code)} đang là phím duy nhất của ${oname}. Đổi phím của ${oname} trước.`; renderBinds(); return; }
      KB[other][i] = prev;
      note.textContent = `${keyName(e.code)} chuyển sang ${name}` + (prev ? `, ${oname} nhận ${keyName(prev)}.` : '.');
    } else {
      if (other === a) KB[a][1 - slot] = prev; // the action's own other slot: swap the two
      note.textContent = `${name}: ${keyName(e.code)}.`;
    }
    KB[a][slot] = e.code;
  }
  for (const k in KB) if (!KB[k][0] && KB[k][1]) KB[k] = [KB[k][1], null];
  saveKB();
}
function openKeys(from) { keysFrom = from; binding = null; $('keysNote').textContent = ''; renderBinds(); $('keysPanel').hidden = false; $('btnKeysDone').focus(); }
function closeKeys() { binding = null; $('keysPanel').hidden = true; if (keysFrom) keysFrom.focus(); }
$('btnKeys').addEventListener('click', () => openKeys($('btnKeys')));
$('btnPauseKeys').addEventListener('click', () => openKeys($('btnPauseKeys')));
$('btnKeysDone').addEventListener('click', closeKeys);
$('btnKeysReset').addEventListener('click', () => { KB = kbCopy(KB_DEF); binding = null; $('keysNote').textContent = 'Đã về phím mặc định.'; saveKB(); });
function readInput(dt = 0) {
  let x = (held('right') ? 1 : 0) - (held('left') ? 1 : 0) + stick.x;
  let z = (held('down') ? 1 : 0) - (held('up') ? 1 : 0) + stick.y;
  const m = Math.hypot(x, z); if (m > 1) { x /= m; z /= m; }
  input.x = x; input.z = z;
  // The hit button: a tap hits soft; held past HOLD_T the swing is charged to a strong hit
  if (hitHeld && !hitCharged) { hitT += dt; if (hitT >= HOLD_T) { hitCharged = true; action('charge'); } }
}
// One hit button (J, left mouse, ĐÁNH). The machine where it is pressed times the hold and tells the
// host 'hit' (pressed), 'charge' (held long enough: strong) and 'release', so latency can't change the shot.
const HOLD_T = 0.16;
let hitHeld = false, hitCharged = false, hitT = 0;
function hitDown() { if (hitHeld) return; hitHeld = true; hitCharged = false; hitT = 0; action('hit'); }
function hitUp() { if (!hitHeld) return; hitHeld = false; powerT = 0.45; action('release'); }
// Power bar: fills while held, turns orange at strong, stays a moment after release to show which hit it was
let powerT = 0, powerKey = '';
function updatePower(dt) {
  const live = (S.state === 'serve' || S.state === 'rally' || S.state === 'point') && !S.paused && S.mode !== 'watch';
  if (!hitHeld && powerT > 0) powerT -= dt;
  const show = live && (hitHeld || powerT > 0), fill = hitCharged ? 1 : Math.min(1, hitT / HOLD_T);
  const k = show ? `${hitCharged ? 'strong' : 'soft'}|${fill.toFixed(2)}` : '';
  if (k === powerKey) return;
  powerKey = k;
  const el = $('power');
  el.classList.toggle('show', show);
  if (!show) return;
  el.classList.toggle('strong', hitCharged); el.classList.toggle('soft', !hitCharged);
  $('powerBar').style.transform = `scaleX(${fill})`;
}
function action(kind, idx = me) {
  ensureAudio();
  if (S.mode === 'guest') { send({ t: 'act', k: kind }); predictAction(kind); return; }
  if (S.paused || !isHuman(idx)) return;
  const a = ath(idx);
  if (kind === 'jump') { if (S.state === 'rally' || S.state === 'point') doJump(a); return; }
  const serving = S.state === 'serve' && S.server === idx;
  if (kind === 'hit') {
    // Serve on release (tap: short) or once the hold is charged (long)
    if (serving) { a.serveHold = true; return; }
    // The swing winds up and waits as a soft hit; 'charge' turns it strong. While held it stays armed.
    // In the air the swing stays armed longer, so Space then J (or J then Space) both give a jump smash
    if (S.state === 'rally' && a.cool <= 0 && !(a.fallT > 0)) { a.swingT = 0; a.swingK = guessKind(a); a.armed = 'soft'; a.armT = a.y > 0 ? 0.42 : 0.3; a.cool = 0.36; a.holding = true; }
    return;
  }
  if (kind === 'charge') {
    if (serving && a.serveHold) { a.serveHold = false; serveAs(idx, 'long'); return; }
    if (a.holding && a.armed) a.armed = 'strong';
    return;
  }
  if (kind === 'release') {
    if (serving && a.serveHold) serveAs(idx, 'short');
    a.serveHold = a.holding = false;
  }
}
// Guest: show the swing and the jump right away on this screen, by the same rules as the host. Only the
// look is local; whether the shuttle is hit is still decided on the host.
let jumpHeard = 0;
function predictAction(kind) {
  if (S.paused) return;
  const a = ath(me), playing = S.state === 'rally' || S.state === 'point';
  if (kind === 'jump') {
    if (!playing || a.y > 0 || a.vy > 0 || a.landT > 0.1 || a.fallT > 0) return;
    a.vy = JUMP_V * (0.72 + 0.28 * a.sta); a.sta = Math.max(0, a.sta - 0.12);
    if (a.armed) a.armT = Math.max(a.armT, 0.42);
    sfx('jump'); jumpHeard = performance.now(); // the host's jump sound for this jump arrives later: skip it
    return;
  }
  if (kind === 'hit') {
    if (S.state === 'rally' && a.cool <= 0 && !(a.fallT > 0)) { a.swingT = 0; a.swingK = guessKind(a); a.armed = 'soft'; a.armT = a.y > 0 ? 0.42 : 0.3; a.cool = 0.36; a.holding = true; a.predT = 0.5; }
    return;
  }
  if (kind === 'charge') { if (a.holding && a.armed) a.armed = 'strong'; return; }
  if (kind === 'release') a.holding = false;
}
const overlayOpen = () => !$('menu').hidden || !$('result').hidden || !$('lobby').hidden;
addEventListener('keydown', e => {
  if (binding) { captureKey(e); return; }
  if (!$('keysPanel').hidden) { if (e.code === 'Escape') { closeKeys(); e.preventDefault(); } return; }
  if (e.code === 'F3' && !actOf(e.code)) { toggleFps(); e.preventDefault(); return; }
  if (S.mode === 'watch') {
    if (e.code === 'Escape') exitWatch('');
    else if (e.code === 'ArrowLeft' || e.code === 'KeyA') cycleWatch(-1);
    else if (e.code === 'ArrowRight' || e.code === 'KeyD') cycleWatch(1);
    e.preventDefault(); return;
  }
  if (overlayOpen()) return;
  const act = actOf(e.code);
  if (e.code === 'Escape' || (e.code === 'KeyP' && !act)) { setPaused(!S.paused); e.preventDefault(); return; }
  if (!act) return;
  keys.add(e.code); e.preventDefault();
  if (e.repeat) return;
  if (act === 'jump') action('jump');
  else if (act === 'hit') hitDown();
});
addEventListener('keyup', e => {
  // The key that was just picked in the key panel must not also press the focused button
  if (e.code === bindSwallow) { bindSwallow = null; e.preventDefault(); }
  keys.delete(e.code);
  if (KB.hit.includes(e.code) && !held('hit')) hitUp();
});
addEventListener('blur', () => { keys.clear(); hitUp(); if (S.mode === 'ai' && S.state !== 'menu' && S.state !== 'over') setPaused(true); });
document.addEventListener('visibilitychange', () => { if (S.mode === 'ai' && document.hidden && S.state !== 'menu' && S.state !== 'over') setPaused(true); });
canvas.addEventListener('pointerdown', e => { if (e.pointerType === 'mouse' && e.button === 0) hitDown(); });
addEventListener('pointerup', e => { if (e.pointerType === 'mouse' && e.button === 0) hitUp(); });
canvas.addEventListener('contextmenu', e => e.preventDefault());

const base = $('stick'), knob = $('knob'); let stickId = null;
function moveStick(e) {
  const r = base.getBoundingClientRect(), R = r.width * 0.38;
  let dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2);
  const m = Math.hypot(dx, dy); if (m > R) { dx *= R / m; dy *= R / m; }
  stick.x = dx / R; stick.y = dy / R; knob.style.transform = `translate(${dx}px,${dy}px)`;
}
base.addEventListener('pointerdown', e => { e.preventDefault(); stickId = e.pointerId; base.setPointerCapture(e.pointerId); moveStick(e); ensureAudio(); });
base.addEventListener('pointermove', e => { if (e.pointerId === stickId) moveStick(e); });
const endStick = e => { if (e.pointerId === stickId) { stickId = null; stick.x = stick.y = 0; knob.style.transform = ''; } };
base.addEventListener('pointerup', endStick); base.addEventListener('pointercancel', endStick);
$('bHit').addEventListener('pointerdown', e => { e.preventDefault(); $('bHit').setPointerCapture(e.pointerId); hitDown(); });
for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) $('bHit').addEventListener(ev, hitUp);
$('bJump').addEventListener('pointerdown', e => { e.preventDefault(); action('jump'); });
function setTouch(on) { document.body.classList.toggle('touch', on); updateServeHint(); }
setTouch(matchMedia('(pointer: coarse)').matches);
addEventListener('touchstart', () => setTouch(true), { passive: true, once: true });

