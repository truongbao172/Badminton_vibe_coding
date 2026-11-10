/* __hook__ injected at the end of the game IIFE: a test bot and smoothness metrics */
const __M = { athMiss: 0, athN: 0, shMiss: 0, shN: 0, hits: 0, points: 0, dts: [], D: [], athErrs: [], shErrs: [], stalls: 0, presses: 0, myHits: 0, armedNoHit: 0, stallLog: [], acks: 0, rejected: 0, ackMs: [], guestHits: 0, guestRejected: 0 };
window.__t = {
  S, ATH, ath, NET, PV, input, remoteIn, shuttle, shMesh, lanJoin, newMatch, gfx, M: __M,
  get me() { return me; }, get ws() { return ws; },
  leave() { if (ws) { const s = ws; ws = null; s.onclose = null; s.close(); } },
};
let __DBG = new URLSearchParams(location.search).get('dbg') === '1', __dbgAt = 0, __serveAt = 0, __ignore = false, __wasIn = false, __lastHit = 0, __lastHn = -1, __hnAt = -1e9, __lastScore = '', __lastNow = 0;
let __p1 = null, __p2 = null, __t1 = 0, __t2 = 0;
const __IGNORE = +(new URLSearchParams(location.search).get('ignore') || 0.25);
function __drawn() {
  if (S.mode === 'host' && PV.on && PV.shRaw) return PV.shRaw;
  if (S.mode === 'guest' && NET.shRaw) return NET.shRaw;
  return { p: shuttle.p, v: shuttle.v, mode: shuttle.mode };
}
function __hn() { return S.mode === 'guest' ? (NET.shownA ? NET.shownA.hn : -1) : (PV.on && PV.shownA ? PV.shownA.hn : S.hits); }
// Where the drawn shuttle will be when it comes down to racket height on our side
function __meet(q, a) {
  const p = { ...q.p }, v = { ...q.v };
  for (let t = 0; t < 2; t += DT) {
    stepShuttle(p, v, DT);
    if (p.y < 0.1) break;
    if (Math.sign(p.z) !== a.side) continue;
    if (v.y < 0 && p.y < 1.7) return p;
  }
  return Math.sign(p.z) === a.side ? p : null;
}
function __bot(dt) {
  const a = ath(me), q = __drawn(), now = performance.now();
  input.x = input.z = 0; input.run = false;
  if (S.state === 'serve' && S.server === me) {
    if (!__serveAt) __serveAt = now + 700;
    else if (now > __serveAt && !hitHeld) { hitDown(); setTimeout(hitUp, 60); __serveAt = 0; }
    return;
  }
  __serveAt = 0;
  if (S.state !== 'rally' || q.mode !== 'fly') { __wasIn = false; return; }
  const incoming = q.v.z * a.side > 0 || (Math.sign(q.p.z) === a.side && q.v.y < 0);
  if (incoming && !__wasIn) __ignore = Math.random() < __IGNORE; // miss some shots so points get scored
  __wasIn = incoming;
  if (!incoming) return;
  const m = __meet(q, a);
  if (__DBG && now - __dbgAt > 300) { __dbgAt = now; console.log(`[bot ${S.mode} me=${me} side=${a.side}] st=${S.state} sh=(${q.p.x.toFixed(2)},${q.p.y.toFixed(2)},${q.p.z.toFixed(2)}) v=(${q.v.x.toFixed(1)},${q.v.y.toFixed(1)},${q.v.z.toFixed(1)}) meet=${m ? m.x.toFixed(2) + ',' + m.z.toFixed(2) : null} a=(${a.x.toFixed(2)},${a.z.toFixed(2)}) ign=${__ignore} armed=${a.armed} held=${hitHeld}`); }
  if (m) {
    const dx = m.x - a.x, dz = (m.z - a.side * 0.35) - a.z, d = Math.hypot(dx, dz);
    if (d > 0.12) { const w = { x: dx / d, z: dz / d }; input.x = team(me) ? -w.x : w.x; input.z = team(me) ? -w.z : w.z; input.run = d > 1.2; }
  }
  if (__ignore || hitHeld || now - __lastHit < 450) return;
  const hc = hitCenter(a);
  const sp = { ...q.p }, sv = { ...q.v }; for (let t = 0; t < 0.2; t += DT) stepShuttle(sp, sv, DT);
  const near = pp => Math.sign(pp.z) === a.side && pp.y > 0.2 && pp.y < 2.7 && Math.hypot(pp.x - hc.x, pp.z - hc.z) < 1.0;
  if (near(q.p) || near(sp)) {
    __lastHit = now; __M.presses++; hitDown(); setTimeout(hitUp, q.p.y > 1.8 && Math.random() < 0.5 ? 200 : 60);
  }
}
const __onNet = onNet;
onNet = function (m) { if (m.t === 'hitAck' && (m.i | 0) === me && NET.hit && NET.hit.id === m.id) { __M.acks++; if (!m.ok) __M.rejected++; __M.ackMs.push(Math.round(performance.now() - NET.hit.sent)); } __onNet(m); };
const __tgh = takeGuestHit;
takeGuestHit = function (i, m) { const ok = __tgh(i, m); if (i !== me) { __M.guestHits++; if (!ok) __M.guestRejected++; } return ok; };
const __readInput = readInput;
readInput = function (dt) { __readInput(dt); __bot(dt); };
function __sample(now) {
  const live = S.state === 'rally' || S.state === 'point';
  const hn = __hn(); if (hn !== __lastHn) { if (hn > __lastHn && __lastHn >= 0) { __M.hits++; const lt = S.mode === 'guest' ? NET.shownA.lt : (PV.on && PV.shownA ? PV.shownA.lt : S.lastTeam); if (lt === team(me)) __M.myHits++; } __lastHn = hn; __hnAt = now; }
  const sc = S.score.join(':'); if (sc !== __lastScore) { if (__lastScore) __M.points++; __lastScore = sc; }
  if (__lastNow) { __M.dts.push(now - __lastNow); if (now - __lastNow > 60) __M.stallLog.push([Math.round(now), Math.round(now - __lastNow), S.state]); } __lastNow = now;
  if (Math.floor(now / 1000) !== Math.floor((now - 17) / 1000)) __M.D.push(Math.round(S.mode === 'guest' ? NET.clk.D : PV.L));
  const cur = { t: now, a: [], sh: { x: shMesh.position.x, y: shMesh.position.y, z: shMesh.position.z }, fly: shuttle.mode === 'fly' || (S.mode === 'host' && PV.on && PV.shRaw && PV.shRaw.mode === 'fly') };
  for (let i = 0; i < S.n; i++) cur.a.push({ x: ath(i).g.position.x, z: ath(i).g.position.z });
  if (__p1 && __p2 && live && now - __t1 < 100 && __t1 - __t2 < 100) {
    const r = (now - __t1) / (__t1 - __t2);
    for (let i = 0; i < S.n; i++) {
      if (i === me) continue;
      const e = Math.hypot(cur.a[i].x - (__p1.a[i].x + (__p1.a[i].x - __p2.a[i].x) * r), cur.a[i].z - (__p1.a[i].z + (__p1.a[i].z - __p2.a[i].z) * r));
      if (e < 1.0) { __M.athN++; if (e > 0.02) { __M.athMiss++; __M.athErrs.push(Math.round(e * 1000)); } }
    }
    if (cur.fly && __p1.fly && __p2.fly && now - __hnAt > 150) {
      const px = __p1.sh.x + (__p1.sh.x - __p2.sh.x) * r, py = __p1.sh.y + (__p1.sh.y - __p2.sh.y) * r, pz = __p1.sh.z + (__p1.sh.z - __p2.sh.z) * r;
      const e = Math.hypot(cur.sh.x - px, cur.sh.y - py, cur.sh.z - pz);
      if (e < 2) { __M.shN++; if (e > 0.05) { __M.shMiss++; __M.shErrs.push(Math.round(e * 1000)); } }
    }
  } else if (__p1 && live && now - __t1 >= 100) __M.stalls++;
  __p2 = __p1; __t2 = __t1; __p1 = cur; __t1 = now;
}
const __frame = frame, __JIT = +(new URLSearchParams(location.search).get('jit') || 7);
frame = function (now) {
  const e = performance.now() + Math.random() * __JIT; while (performance.now() < e); // uneven frames, like a real machine
  __frame(now);
  __sample(now);
};
