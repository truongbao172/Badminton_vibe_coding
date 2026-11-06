/* ---------- computer players ---------- */
const HUMAN_SP = 5.2, HUMAN_REACT = 0.15;
// Earliest point on the shuttle's path that player idx can get to in time
function reachOf(idx, path, top) {
  const a = ath(idx), D = DIFF[S.diff], sp = isHuman(idx) ? HUMAN_SP : D.speed, re = (isHuman(idx) ? HUMAN_REACT : D.react) + a.fallT;
  for (const pt of path) {
    if (pt.t < re || Math.sign(pt.z) !== a.side || Math.abs(pt.z) < 0.25 || pt.y > top || pt.y < 0.3) continue;
    const sx = pt.x - a.side * a.hand * 0.35, sz = pt.z + a.side * 0.28;
    if (Math.hypot(sx - a.x, sz - a.z) / sp * 1.15 + re <= pt.t) return { x: sx, z: sz, t: pt.t, y: pt.y };
  }
  return null;
}
// Where the pair that just hit goes while the shuttle is away
function formation(i) {
  const a = ath(i), s = a.side;
  if (S.n === 2) return { x: 0, z: s * 3.7 };
  const hitter = ath(S.lastHitter), hitterFront = Math.abs(hitter.z) < 2.6;
  if (ATTACK[S.lastType]) {
    const front = (i === S.lastHitter) === hitterFront;
    return front ? { x: clamp(hitter.x * 0.4, -1, 1), z: s * 2.0 } : { x: clamp(a.x * 0.5, -1.2, 1.2), z: s * 4.2 };
  }
  const mate = ath(partnerOf(i)), right = a.x > mate.x || (a.x === mate.x && i < 2);
  return { x: right ? 1.35 : -1.35, z: s * 3.6 };
}
function planRally(res) {
  const D = DIFF[S.diff], ht = S.lastTeam, rt = 1 - ht;
  for (const i of members(ht)) if (!isHuman(i)) ath(i).plan = { ...formation(i), jumpAt: null };
  for (const i of members(ht)) ath(i).delay = 0.1;
  const mem = members(rt);
  if (res.z * sideT(rt) <= 0 || (res.netY !== null && res.netY < C.netH)) {
    S.resp[rt] = -1;
    for (const i of mem) if (!isHuman(i)) { const a = ath(i); a.leave = false; a.plan = { x: a.x, z: a.z, jumpAt: null }; }
    return;
  }
  // One player of the receiving pair takes the shuttle: whoever gets there first (a human partner gets a little priority)
  let resp = -1;
  if (S.isServe) resp = S.receiver;
  else {
    let bt = Infinity;
    for (const i of mem) {
      const a = ath(i), r = reachOf(i, res.path, 2.55);
      const t = (r ? r.t : 5 + Math.hypot(res.x - a.x, res.z - a.z)) - (isHuman(i) ? 0.12 : 0);
      if (t < bt) { bt = t; resp = i; }
    }
  }
  S.resp[rt] = resp;
  const out = (S.isServe ? boxOut(res.x, res.z) : courtOut(res.x, res.z)) > 0.15;
  for (const i of mem) {
    if (isHuman(i)) continue;
    const a = ath(i); a.leave = false; a.delay = D.react;
    if (i !== resp) {
      // Cover the half of the court the responder leaves open
      a.plan = { x: ath(resp).x > 0 ? -1.3 : 1.3, z: a.side * 3.3, jumpAt: null };
      continue;
    }
    if (out && Math.random() < D.judge) { a.leave = true; a.plan = { x: a.x, z: a.z, jumpAt: null }; continue; }
    // Some high shuttles are taken with a jump smash; jumping also buys extra reach
    const wantJump = !S.isServe && Math.random() < D.smash * 0.8;
    const r = reachOf(i, res.path, wantJump ? 3.05 : 2.55);
    a.plan = r ? { x: r.x, z: r.z, jumpAt: wantJump && r.y > 2.2 ? r.t - JUMP_V / G : null }
      : { x: res.x - a.side * a.hand * 0.35, z: res.z + a.side * 0.28, jumpAt: null };
  }
}
function aiShot(idx) {
  const a = ath(idx), D = DIFF[S.diff], r = Math.random(), y = shuttle.p.y, nearNet = Math.abs(shuttle.p.z) < 2.6;
  if (a.y > 0.1 && y >= 2.0) return r < 0.8 ? 'jsmash' : 'drop';
  if (y >= 2.0) return r < D.smash ? 'smash' : r < D.smash + 0.25 ? 'drop' : 'clear';
  if (y < 1.3 && nearNet) return r < 0.5 ? 'net' : 'lift';
  return r < 0.35 ? 'drop' : y >= 1.4 ? 'clear' : 'lift';
}
function humanShot(kind, idx) {
  const y = shuttle.p.y, back = (idx === me ? input.z : remoteIn[idx].z) > 0.5;
  if (kind === 'strong' && ath(idx).y > 0.1 && y >= 2.0 && !back) return 'jsmash';
  if (kind === 'strong') return (y >= 1.95 && !back) ? 'smash' : y >= 1.4 ? 'clear' : 'lift';
  return y >= 1.5 ? 'drop' : 'net';
}

function tryHits() {
  if (S.state !== 'rally' || shuttle.mode !== 'fly' || S.netFault) return;
  const p = shuttle.p; let aiPick = -1;
  for (let i = 0; i < S.n; i++) {
    const t = team(i);
    if (S.lastTeam === t) continue; // a side gets one hit, partners can't hit twice in a row
    if (S.isServe && i !== S.receiver) continue;
    const a = ath(i);
    if (a.fallT > 0) continue; // down on the floor
    if (Math.sign(p.z) !== a.side || Math.abs(p.z) < 0.05 || p.y < 0.12 || p.y > 2.75 + a.y) continue;
    const hc = hitCenter(a);
    if (Math.hypot(p.x - hc.x, p.z - hc.z) > (isHuman(i) ? 1.1 : 0.95)) continue;
    // A LAN guest judges its own hits on its own screen (guestHit); the host only takes them in (takeGuestHit)
    if (isHuman(i)) { if (S.mode === 'host' && (i !== me || PV.on)) continue; if (a.armed) { const k = a.armed; a.armed = null; doHit(i, humanShot(k, i)); return; } continue; }
    // A computer player hits if it is the responder, or covers for a computer partner that is out of position
    const r = S.resp[t];
    if (aiPick < 0 && r >= 0 && !ath(r).leave && (r === i || !isHuman(r))) aiPick = i;
  }
  if (aiPick >= 0) doHit(aiPick, aiShot(aiPick));
}

function physicsStep(dt) {
  if (shuttle.mode !== 'fly') return;
  const p = shuttle.p, v = shuttle.v, pz = p.z, py = p.y, px = p.x;
  stepShuttle(p, v, dt);
  if (!S.netFault && (pz > 0) !== (p.z > 0)) {
    const f = pz / (pz - p.z), yc = py + (p.y - py) * f, xc = px + (p.x - px) * f;
    if (yc < C.netH && Math.abs(xc) < C.doublesX) {
      S.netFault = true; p.z = pz > 0 ? 0.07 : -0.07; p.y = yc;
      v.x *= 0.1; v.z = 0; v.y = Math.min(v.y, 0) * 0.3; hideRing(); play('net');
      emit({ k: 'fx', kind: 'net', x: r3(xc), y: r3(yc), z: 0 });
    }
  }
  if (p.y <= 0) { p.y = 0.03; shuttle.mode = 'rest'; touchDown(p.x, p.z); }
}

// The shuttle is down. A guest on that side sees the match a little late and may still hit it on its screen
// (takeGuestHit). Wait only while one of them really could (at most 1 s); otherwise judge it at once.
function touchDown(x, z) {
  const half = z > 0 ? 0 : 1, w = simWall;
  if (S.mode === 'host' && S.state === 'rally' && !S.netFault && half !== S.lastTeam && members(half).some(i => isHuman(i) && (i !== me || PV.on) && mayStillHit(i, w))) {
    pendLand = { x, z, half, w, until: performance.now() + 1000 }; return;
  }
  landFx(x, z); landed(x, z);
}
// Could guest i still hit the shuttle that landed at host time w? Its screen has got as far as s.vt, with its
// player at s.x, s.z running at s.vx, s.vz. From there it can only speed up the way moveAthlete allows, so by
// the time its screen shows host time e.w the player is within a known circle. The shuttle is out of reach
// unless, somewhere in the flight that screen hasn't shown yet, it passes hittable and within that circle.
function mayStillHit(i, w) {
  const r = remoteIn[i], a = ath(i);
  // (our own late screen: how far it has got, with our own player as it is now)
  const s = i === me ? { vt: PV.ts, x: a.x, z: a.z, vx: a.vx, vz: a.vz } : r.seen;
  if (!s) return r.vt <= w + 10;
  if (s.vt > w + 10) return false;
  for (let k = hostHist.length - 1; k >= 0 && hostHist[k].w > s.vt; k--) {
    const e = hostHist[k];
    if (e.w > w || e.mode !== 'fly' || e.p.y < 0.12) continue;
    const tau = (e.w - s.vt) / 1000, te = (1 - Math.exp(-11 * tau)) / 11;
    const hc = hitCenter({ x: s.x + s.vx * te, z: s.z + s.vz * te, side: a.side, hand: a.hand });
    if (Math.hypot(e.p.x - hc.x, e.p.z - hc.z) <= 1.1 + RUN_SP * (tau - te) + 0.25) return true;
  }
  return false;
}
function landFx(x, z) { play('land'); emit({ k: 'fx', kind: 'land', x: r3(x), z: r3(z) }); }
function checkLanding() {
  const q = pendLand;
  if (!q) return;
  if (members(q.half).some(i => isHuman(i) && (i !== me || PV.on) && mayStillHit(i, q.w)) && performance.now() <= q.until) return;
  // Stamped with the landing moment: the guests' screens are already past it, so they show the point at once
  pendLand = null; evAt = q.w; landFx(q.x, q.z); landed(q.x, q.z); evAt = null;
}
function landed(x, z) {
  if (S.state !== 'rally') return;
  const ht = S.lastTeam; let winner, reason;
  if (S.netFault) { winner = 1 - ht; reason = 'Chạm lưới'; }
  else {
    const half = z > 0 ? 0 : 1;
    const inB = S.isServe ? boxOut(x, z) <= 0.02 : courtOut(x, z) <= 0.02;
    if (half === ht) { winner = 1 - ht; reason = 'Cầu không qua lưới'; }
    else if (inB) { winner = ht; reason = 'Trong sân!'; }
    else { winner = 1 - ht; reason = S.isServe ? 'Giao cầu hỏng' : 'Ra ngoài'; }
  }
  awardPoint(winner, reason);
}
// w is the team that won the rally
function awardPoint(w, reason) {
  S.state = 'point'; S.timer = 1.7; hideRing(); for (const a of ATH) a.armed = null;
  const st = team(S.server);
  S.score[w]++; S.lastWin = w;
  // Serving side wins: same server, swaps court with partner. Receiving side wins: it serves,
  // from the court matching its new score, nobody swaps.
  if (w === st) S.right[w] = partnerOf(S.right[w]);
  else S.server = S.score[w] % 2 === 0 ? S.right[w] : partnerOf(S.right[w]);
  const a = S.score[w], b = S.score[1 - w];
  let gameEnd = false;
  if ((a >= 21 && a - b >= 2) || a === 30) {
    S.games[w]++; S.history.push([S.score[0], S.score[1]]); S.gameOver = true;
    S.matchOver = S.games[w] === 2;
    S.timer = 2.4; gameEnd = true;
  }
  emit({ k: 'point', w, reason, sc: [...S.score], gameEnd, gameNo: S.gameNo, dur: S.timer - 0.2 });
  updateHUD();
}
function showPoint(ev) {
  const mt = team(me), sc = `${ev.sc[mt]} – ${ev.sc[1 - mt]}`, nm = teamName(ev.w);
  toast(ev.reason, ev.gameEnd ? `${nm} thắng ván ${ev.gameNo} · ${sc}` : `${nm} được điểm · ${sc}`, ev.dur);
  sfx(ev.w === mt ? 'win' : 'lose');
}
function afterPoint() {
  // (over at once: a host drawing late (PV) shows the result a little later, and must not send it again meanwhile)
  if (S.matchOver) { S.state = 'over'; emit({ k: 'result', games: [...S.games], history: S.history.map(g => [...g]), best: S.best }); return; }
  if (S.gameOver) {
    // New game: winners serve first, everyone back to their starting courts
    S.gameOver = false; S.score = [0, 0]; S.gameNo++; S.right = [0, 1]; S.server = S.lastWin; setupServe();
    emit({ k: 'toast', big: `Ván ${S.gameNo}`, small: S.gameNo === 3 ? 'Ván quyết định' : '', dur: 1.4 }); return;
  }
  setupServe();
}
function showResult(ev) {
  S.state = 'over'; $('serveHint').hidden = true; $('pause').hidden = true;
  const mt = team(me), o = 1 - mt, won = ev.games[mt] > ev.games[o];
  $('resTitle').textContent = won ? `${teamName(mt)} thắng trận` : `${teamName(o)} thắng trận`;
  $('resEyebrow').textContent = `Kết thúc · ${ev.games[mt]} – ${ev.games[o]} · ` + (S.n === 4 ? 'Đánh đôi · ' : '') + (S.mode === 'ai' ? `Trình độ ${DIFF[S.diff].label.toLowerCase()}` : `Chơi LAN sân ${S.court + 1}`);
  $('resSub').textContent = `Pha cầu dài nhất: ${ev.best} lần chạm cầu.`;
  $('resGames').innerHTML = ev.history.map((g, i) => `<div><span>Ván ${i + 1}</span><span><b>${g[mt]}</b> – ${g[o]}</span></div>`).join('');
  $('btnMenu').textContent = S.mode === 'ai' ? 'Đổi trình độ' : 'Rời sân';
  $('result').hidden = false; $('btnAgain').focus();
  playClip(won ? 'victory' : 'defeat'); // each screen hears its own side's result
  punishOffer(ev); // the winners pick a punishment for the losers (18-punishment)
}
function newMatch() {
  clearPunish();
  Object.assign(S, { score: [0, 0], games: [0, 0], server: 0, right: [0, 1], gameNo: 1, history: [], best: 0, gameOver: false, matchOver: false, paused: false });
  for (const r of remoteIn) { r.x = r.z = 0; r.run = false; r.pos = false; }
  for (const a of ATH) { a.sta = 1; a.tired = false; a.swingT = -1; }
  $('menu').hidden = $('result').hidden = $('pause').hidden = $('lobby').hidden = true;
  if (S.mode === 'host') send({ t: 'meta', started: true });
  ensureAudio(); setupServe();
}
function setPaused(on) {
  if (S.state === 'menu' || S.state === 'over') return;
  if (S.mode === 'guest') { send({ t: 'pause', on }); return; }
  applyPaused(on);
}
function applyPaused(on) {
  S.paused = on; $('pause').hidden = !on;
  const mt = team(me);
  $('pauseInfo').textContent = `Sân ${S.court + 1} · Ván ${S.gameNo} · ${S.score[mt]} – ${S.score[1 - mt]}`;
  updateServeHint();
  if (on) $('btnResume').focus();
}

