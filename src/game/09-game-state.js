/* ---------- game state ---------- */
// mode: 'ai' (vs computer), 'host' (LAN, runs the match), 'guest' (LAN, renders host snapshots)
// score/games are per team. right[t] is the player of team t standing in their right service court.
const S = { mode: 'ai', fmt: 'don', n: 2, court: 0, state: 'menu', paused: false, diff: 'vua', score: [0, 0], games: [0, 0],
  server: 0, receiver: 1, right: [0, 1], resp: [-1, -1], lastWin: 0, gameNo: 1, history: [], rally: 0, best: 0,
  lastHitter: null, lastTeam: null, lastType: null, isServe: false, netFault: false, boxXs: 1, timer: 0, flightT: 0,
  hits: 0, simT: 0, gameOver: false, matchOver: false, showMarker: true, human: [true, false, false, false], roster: [1, 0, 0, 0], names: ['', '', '', ''], looks: [], bots: [false, false, false, false], hostSeat: 0 };
const isTouch = () => document.body.classList.contains('touch');
let me = 0; // which player this screen controls (on LAN any seat, the host included)
// LAN host: the shuttle's recent path (to take a guest's hit back in time), a landing waiting for a guest's screen
// to show it, the wall-clock time the physics is at, and the slide of the drawn shuttle after such a hit (takeGuestHit)
const hostHist = [], shVis = { x: 0, y: 0, z: 0 };
let pendLand = null, simWall = 0, lastHit = null;
const partnerOf = i => S.n === 4 ? i ^ 2 : i;
const members = t => S.n === 4 ? [t, t + 2] : [t];
const isHuman = idx => S.human[idx];
function nameOf(idx) {
  if (idx === me) return 'Bạn';
  if (S.mode !== 'ai' && isHuman(idx) && S.names[idx]) return S.names[idx];
  if (team(idx) === team(me)) return 'Đồng đội';
  return S.mode === 'ai' || !isHuman(idx) ? 'Máy' : 'Đối thủ';
}
function teamName(t) {
  if (t === team(me)) return S.n === 4 ? 'Đội bạn' : 'Bạn';
  if (S.mode === 'ai') return S.n === 4 ? 'Đội máy' : 'Máy';
  return S.n === 4 ? 'Đội kia' : 'Đối thủ';
}
// LAN players' sticks, each in that player's own screen frame (far team sees the court flipped)
// pos: the guest is sending its own position, see update()
// clk/buf: its position reports, drawn a little in the past (see netClock); vt: how far its screen has got (host clock)
const remoteIn = [0, 1, 2, 3].map(() => ({ x: 0, z: 0, run: false, pos: false, vt: 0, rtt: [], lagS: [], clk: netClock(), buf: [] }));
function worldInput(idx) {
  const r = idx === me ? input : remoteIn[idx];
  return team(idx) ? { x: -r.x, z: -r.z, run: r.run } : r;
}
function updateTags() {
  ATH.forEach((a, i) => setTag(a, S.mode !== 'ai' && i !== me && i < S.n && S.roster[i] ? S.names[i] || 'Người chơi' : ''));
}
function setFormat(fmt) {
  S.fmt = fmt === 'doi' ? 'doi' : 'don'; S.n = S.fmt === 'doi' ? 4 : 2;
  ATH[2].g.visible = ATH[3].g.visible = S.n === 4;
  drawSigns(); updateHUD(); updateTags();
}

// Presentation events run locally and, on the LAN host, are mirrored to the guests.
// tm: when it happened in the match (host clock); a guest plays it when its screen, a little behind, gets there.
let evAt = null;
// The host's own screen while it plays guests over the network: drawn as late as theirs (see pvFrame)
const PV = { on: false, L: 0, ts: 0, buf: [], evq: [], patchFrom: 0, late: -1, shownA: null, prevTs: null, drawing: false,
  shRaw: null, shKey: null, lerpTo: null, shOff: { x: 0, y: 0, z: 0 } };
function emit(ev) {
  if (S.mode !== 'host') { handleEv(ev); return; }
  const now = performance.now(), tm = Math.round(evAt ?? (simWall > now - 100 ? simWall : now));
  // On the host's late screen it shows when that screen gets there, except what our own player did just now
  if (PV.on && ev.g !== me) PV.evq.push({ t: tm, m: ev }); else handleEv(ev);
  send({ t: 'ev', ...ev, tm });
}
function handleEv(ev) {
  if (ev.k === 'sfx') sfx(ev.kind);
  else if (ev.k === 'fx') fxEvent(ev);
  else if (ev.k === 'shot') showShot(ev.idx, ev.type);
  else if (ev.k === 'point') showPoint(ev);
  else if (ev.k === 'toast') toast(ev.big, ev.small, ev.dur);
  else if (ev.k === 'fall') toast('Va nhau!', `${nameOf(ev.t | 0)} và ${nameOf((ev.t | 0) + 2)} té ngã`, 1);
  else if (ev.k === 'result') showResult(ev);
  else if (ev.k === 'punish') startPunish(ev);
}
const play = kind => emit({ k: 'sfx', kind });

let toastT = 0, shotT = 0;
function toast(big, small, dur = 1.5) { $('toast').innerHTML = big + (small ? `<small>${small}</small>` : ''); $('toast').classList.add('show'); toastT = dur; }
function showShot(idx, type) {
  $('shot').innerHTML = `<i style="background:var(${team(idx) ? '--cpu' : '--you'})"></i>${nameOf(idx)} · ${SHOTS[type].name}`;
  $('shot').classList.add('show'); shotT = 1.1;
}
function updateHUD() {
  if (S.mode === 'watch') { watchHUD(); return; }
  if (PV.on && !PV.drawing) return; // the host's late screen shows the score as it was then (pvHud)
  const mt = team(me), o = 1 - mt;
  $('pP').textContent = S.score[mt]; $('pA').textContent = S.score[o];
  $('gP').textContent = S.games[mt]; $('gA').textContent = S.games[o];
  $('dotP').classList.toggle('on', team(S.server) === mt); $('dotA').classList.toggle('on', team(S.server) === o);
  $('cP').style.background = `var(${mt ? '--cpu' : '--you'})`; $('cA').style.background = `var(${mt ? '--you' : '--cpu'})`;
  $('nmP').textContent = S.n === 4 ? 'ĐỘI BẠN' : 'BẠN';
  $('nmA').textContent = S.mode === 'ai' ? (S.n === 4 ? 'ĐỘI MÁY · ' : 'MÁY · ') + DIFF[S.diff].label : S.n === 4 ? 'ĐỘI KIA' : 'ĐỐI THỦ';
  const [a, b] = S.score, lead = Math.max(a, b), gp = (lead >= 20 && Math.abs(a - b) >= 1) || lead === 29;
  const leader = a > b ? 0 : 1, matchPt = gp && S.games[leader] === 1;
  $('metaL').innerHTML = gp ? `<b>${matchPt ? 'ĐIỂM TRẬN' : 'ĐIỂM VÁN'}</b>` : `SÂN ${S.court + 1} · VÁN ${S.gameNo} / 3`;
  $('metaR').textContent = `CHẠM ${S.rally}`;
}
function updateServeHint() {
  if (PV.on && !PV.drawing) return;
  const el = $('serveHint');
  el.hidden = !(S.state === 'serve' && S.server === me && !S.paused);
  el.innerHTML = isTouch() ? 'Bạn giao cầu · giữ ĐÁNH: giao cao sâu · chạm ĐÁNH: giao ngắn' : `Bạn giao cầu · giữ <kbd>${key1('hit')}</kbd>: giao cao sâu · nhấn <kbd>${key1('hit')}</kbd>: giao ngắn`;
}

function placeAthlete(a, x, z) { a.x = x; a.z = z; a.vx = a.vz = 0; a.y = a.vy = a.landT = a.fallT = a.fallSafe = 0; }
// Serving side serves from its right court on an even score. In doubles only the diagonal
// opponent may take the serve, and the server's partner stands behind.
function placeForServe() {
  const st = team(S.server), rt = 1 - st, even = S.score[st] % 2 === 0;
  S.receiver = even ? S.right[rt] : partnerOf(S.right[rt]);
  const sa = ath(S.server), ra = ath(S.receiver);
  const sxs = sa.side * (even ? 1 : -1); // server's court in world x
  S.boxXs = -sxs;
  if (S.n === 4) {
    placeAthlete(sa, sxs * 0.45, sa.side * 2.4); placeAthlete(ath(partnerOf(S.server)), -sxs * 0.55, sa.side * 4.3);
    placeAthlete(ra, -sxs * 0.9, ra.side * 2.6); placeAthlete(ath(partnerOf(S.receiver)), sxs * 0.9, ra.side * 4.2);
  } else {
    placeAthlete(sa, sxs * 0.75, sa.side * 3.1); placeAthlete(ra, -sxs * 0.9, ra.side * 3.6);
  }
}
function setupServe() {
  S.state = 'serve'; S.isServe = false; S.netFault = false; S.rally = 0; pendLand = null; S.lastHitter = S.lastTeam = null; S.resp = [-1, -1];
  shuttle.mode = 'held'; hideRing();
  placeForServe();
  for (const a of ATH) { a.armed = null; a.holding = a.serveHold = false; a.plan = null; a.leave = false; }
  S.timer = isHuman(S.server) ? 0 : 1.1;
  holdShuttle(); resetTrail(); updateHUD(); updateServeHint();
}
function holdShuttle() {
  const sa = ath(S.server);
  shuttle.p = { x: sa.x + sa.side * sa.hand * 0.32, y: 1.0, z: sa.z - sa.side * 0.42 }; shuttle.v = { x: 0, y: 0, z: 0 };
}

const opponents = t => members(1 - t).map(ath);
// x on the far court that is furthest from the defenders, with some randomness
function bestGap(t, depth, jitter) {
  const tz = -sideT(t) * depth, opp = opponents(t);
  let best = 0, bs = -1;
  for (const x of [-2.3, -1.2, 0, 1.2, 2.3]) {
    const s = Math.min(...opp.map(o => Math.hypot(x - o.x, (tz - o.z) * 0.5))) + rnd(0, jitter);
    if (s > bs) { bs = s; best = x; }
  }
  return best;
}
// Where a hit sends the shuttle: from where it is, at a target picked for the shot
function aimShot(idx, type) {
  const a = ath(idx), t = team(idx), from = { x: shuttle.p.x, y: shuttle.p.y, z: shuttle.p.z }, opp = -a.side, sh = SHOTS[type];
  const serve = type === 'long' || type === 'short', dbl = S.n === 4;
  const range = serve && type === 'long' && dbl ? [5.45, 5.85] : sh.depth; // doubles long serve must beat the long service line
  let depth = rnd(range[0], range[1]), tx;
  if (serve) tx = S.boxXs * (type === 'long' ? rnd(1.0, dbl ? 2.3 : 1.9) : rnd(0.35, 1.1));
  else if (isHuman(idx)) {
    const ix = worldInput(idx).x, wide = dbl ? 2.5 : 2.05;
    tx = ix < -0.35 ? -wide : ix > 0.35 ? wide : dbl ? bestGap(t, depth, 0) * 0.7 : clamp(-ath(1 - t).x * 0.7, -1.4, 1.4);
  } else if (dbl) tx = bestGap(t, depth, 1.0) + rnd(-0.3, 0.3);
  else {
    const away = ath(1 - t).x > 0 ? -1 : 1;
    tx = (type === 'net' || type === 'drop') ? (Math.random() < 0.65 ? away : -away) * rnd(0.6, 2.0) : away * rnd(1.0, 2.2);
  }
  if (!isHuman(idx)) {
    const D = DIFF[S.diff];
    tx += rnd(-1, 1) * D.err * 0.7; depth += rnd(-1, 1) * D.err * 0.5;
    if (Math.random() < D.out) {
      if (Math.random() < 0.5) tx = Math.sign(tx || 1) * (dbl ? rnd(3.2, 3.5) : rnd(2.75, 3.1));
      else depth = serve && type === 'short' ? rnd(1.4, 1.85) : serve && dbl ? rnd(6.05, 6.4) : rnd(6.85, 7.2);
    }
  }
  if (serve) tx = S.boxXs * Math.abs(tx);
  const target = { x: clamp(tx, -3.5, 3.5), z: opp * clamp(depth, 0.5, 7.3) };
  return { from, vel: solveShot(from, target, sh.elevs, sh.min || 0).vel };
}
function doHit(idx, type) { const s = aimShot(idx, type); finishHit(idx, type, s.from, s.vel); }
// g: the seat of a LAN guest whose own screen already showed this hit (it skips its copies of the sound and sparks)
function finishHit(idx, type, from, vel, g) {
  const a = ath(idx), t = team(idx), serve = type === 'long' || type === 'short';
  shuttle.p = { ...from }; shuttle.v = { ...vel }; shuttle.mode = 'fly';
  S.lastHitter = idx; S.lastTeam = t; S.lastType = type; S.isServe = serve; S.netFault = false; S.hits++;
  S.rally++; S.best = Math.max(S.best, S.rally); S.flightT = 0;
  lastHit = { w: Math.round(evAt ?? simWall), hn: S.hits, p: { ...from }, v: { ...vel } }; // for spectators (summary)
  const h = from.y - a.y;
  a.swingK = serve ? 'under' : h > 1.75 ? 'over' : h < 1.05 ? 'under' : 'side';
  if (!(a.swingT >= SW_W && a.swingT < SW_C)) a.swingT = SW_W + 0.01;
  emit({ k: 'sfx', kind: type === 'smash' || type === 'jsmash' ? 'smash' : 'hit', g });
  emit({ k: 'fx', kind: 'hit', type, x: r3(from.x), y: r3(from.y), z: r3(from.z), vx: r3(vel.x), vy: r3(vel.y), vz: r3(vel.z), g });
  emit({ k: 'shot', idx, type, g });
  const pred = simulate(shuttle.p, shuttle.v, true);
  Object.assign(RD, { vis: pred.z * a.side < 0 && (pred.netY === null || pred.netY >= C.netH), x: pred.x, z: pred.z,
    out: (serve ? boxOut(pred.x, pred.z) : courtOut(pred.x, pred.z)) > 0.02, to: 1 - t });
  refreshRing();
  planRally(pred);
  updateHUD();
}
// Predicted landing spot, shown to whichever team is about to receive the shuttle
const RD = { vis: false, x: 0, z: 0, out: false, to: 0 };
function refreshRing() {
  if (PV.on && !PV.drawing) return;
  ring.visible = S.showMarker && RD.vis && RD.to === team(me);
  if (ring.visible) { ring.position.x = RD.x; ring.position.z = RD.z; ring.material.color.set(RD.out ? 0x8aa0a6 : 0xffb547); }
}
function hideRing() { RD.vis = false; refreshRing(); }
function launchServe(type) { S.state = 'rally'; for (const a of ATH) a.armed = null; ath(S.server).swingT = 0; doHit(S.server, type); $('serveHint').hidden = true; }

