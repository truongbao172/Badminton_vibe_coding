// A buffer entry for drawing a snapshot later (a guest's snapshots, and the host's own while it draws late, PV)
function bufEntry(m, t) {
  const h = m.sh, hx = m.hx || [-1, 0, 0, 0, 0];
  return { t, m, still: !!m.pa, hs: !!m.hs, s: m.s, a: m.a, lt: hx[0], is: !!hx[1], rc: hx[2] | 0, nf: !!hx[3], hn: hx[4] | 0,
    sh: { p: { x: h[0], y: h[1], z: h[2] }, v: { x: h[3], y: h[4], z: h[5] }, mode: MODES[h[6]] || 'rest' } };
}
function applySnap(m) {
  if (m.n !== S.n) setFormat(m.n === 4 ? 'doi' : 'don');
  if (!$('lobby').hidden && m.s !== 'menu') { $('lobby').hidden = true; toast('Vào trận', `Sân ${S.court + 1} · ${team(me) ? 'bạn đứng sân xa' : 'bạn đứng sân gần'}`, 1.6); }
  S.human = m.hu.map(Boolean);
  const now = performance.now(), B = NET.buf;
  let t = clockIn(NET.clk, m.tm, now);
  if (B.length && t < B[B.length - 1].t) t = B[B.length - 1].t;
  B.push(bufEntry(m, t));
  while (B.length > 2 && B[1].t < now - 2000) B.shift();
  NET.he = m.tm; NET.heAt = now; // (echoed back in our reports, for the host to time the round trip)
  // The host has taken our own hit: the snapshots from this one on carry it
  if (NET.hit && NET.hit.ok && NET.hit.until === null) NET.hit.until = t;
  if (m.pa !== S.paused) applyPaused(m.pa);
}
// Score, state and landing ring of the snapshot being drawn (not the newest one): a point shows up when the
// shuttle drawn here lands, not while it is still falling on this screen
function snapState(m) {
  S.state = m.s; S.score = m.sc; S.games = m.g; S.server = m.sv; S.gameNo = m.gn; S.rally = m.ra;
  Object.assign(RD, { vis: !!m.rg[0], x: m.rg[1], z: m.rg[2], out: !!m.rg[3], to: m.rg[4] }); refreshRing();
  if (S.state !== 'over') { $('result').hidden = true; clearPunish(); } // (a new match has begun)
  const k = [m.sc, m.g, m.sv, m.gn, m.ra, m.s, m.pa, m.n].join('|');
  if (k !== hudKey) { hudKey = k; updateHUD(); updateServeHint(); }
}
// A sound, effect or message from the host waits until this screen reaches the moment it happened
function queueEv(m) {
  const c = NET.clk;
  if (!NET.buf.length || c.off === null || !Number.isFinite(m.tm)) { handleEv(m); return; }
  NET.evq.push({ t: m.tm + c.off, m });
}
function playDueEvs(rt, st = NET) {
  const Q = st.evq;
  if (!Q.length || Q.every(e => e.t > rt)) return;
  st.evq = Q.filter(e => e.t > rt);
  for (const e of Q) {
    if (e.t > rt) continue;
    // Long overdue (the tab was in the background): skip the sounds and sparks, keep the messages
    if (e.t < rt - 1000 && (e.m.k === 'sfx' || e.m.k === 'fx' || e.m.k === 'shot' || e.m.k === 'fall')) continue;
    handleEv(e.m);
  }
}
/* Network smoothing. Snapshots never arrive evenly: some frames get two, some none, and over the Internet they
   come in bursts (TCP holds everything back while it resends one lost packet). So nothing is drawn the moment it
   arrives. A guest keeps the last second of snapshots and draws what the host moves a little in the past
   (clk.D, about the worst lateness of the last few seconds), between two snapshots it already has: players
   along a curve through both reports, the shuttle flown on by the same physics as the host. Only our own player
   is drawn in the present, moved right here. The host draws each guest's player the same way from its reports.
   Our own hits are judged on this screen, on what it shows (guestHit); the host takes them back in time to the
   moment we saw (takeGuestHit), so a hit that looked right here counts, however far away the host is. */
function netClock() { return { off: null, min: null, late: [], D: 60 }; }
// When a report was made, on this machine's clock: the quickest delivery seen (min) counts as no delay.
// The offset actually used (off) follows min smoothly: a new quickest delivery comes every second or so, and moving
// every later report a few ms at once made the other players hitch (2-8 cm) each time.
function clockIn(c, tm, now) {
  if (!Number.isFinite(tm)) return now;
  const s = now - tm;
  if (c.min === null) c.min = c.off = s;
  else if (s < c.min) c.min = s; else c.min += (s - c.min) * 0.002;
  c.off += (c.min - c.off) * 0.02;
  const t = tm + c.off;
  c.late.push(now - t); if (c.late.length > 360) c.late.shift();
  return t;
}
// How far behind to draw: 97% of the last ~6 s of reports arrive within it, plus one report interval. Through
// Render a report is often 100-300 ms late (measured from here: p90 100-230 ms, p98 200-370 ms, now and then over
// a second), and every report that comes after its time makes the picture guess ahead and then correct: that is the
// stutter. So it waits for nearly all of them (up to 0.4 s). It changes slowly, so drawn time never jumps; the
// host draws its own screen just as late (PV), so both still show the same moment.
function clockTick(c, dt, gap = 20, hi = 400) {
  if (c.late.length < 20) return;
  const s = c.late.slice().sort((x, y) => x - y), want = clamp(s[Math.floor(s.length * 0.97)] + gap, 30, hi);
  c.D += clamp(want - c.D, -dt * 30, dt * 100);
}
const NET = { clk: netClock(), buf: [], evq: [], he: null, heAt: 0, hit: null, hid: 0, shownA: null, shRaw: null, shKey: null, shOff: { x: 0, y: 0, z: 0 } };
function resetNet() {
  Object.assign(NET, { clk: netClock(), buf: [], evq: [], he: null, heAt: 0, hit: null, shownA: null, shRaw: null, shKey: null, lerpTo: null, prevRt: null });
  NET.shOff.x = NET.shOff.y = NET.shOff.z = 0; jumpHeard = 0;
  hostHist.length = 0; pendLand = null; shVis.x = shVis.y = shVis.z = 0;
  for (const a of ATH) { a.nRaw = null; a.predT = 0; }
  for (const r of remoteIn) Object.assign(r, { clk: netClock(), buf: [], vt: 0, seen: null, rtt: [], lagS: [], pos: false });
}
// The report at or before time rt, and the one after it (null when rt is past the newest)
function netPair(buf, rt) {
  let i = buf.length - 1;
  while (i > 0 && buf[i].t > rt) i--;
  return [buf[i], buf[i + 1] || null];
}
// Cubic Hermite between p0 (velocity v0) at u = 0 and p1 (v1) at u = 1, T seconds apart
function herm(p0, v0, p1, v1, u, T) { const u2 = u * u, u3 = u2 * u; return (2 * u3 - 3 * u2 + 1) * p0 + (u3 - 2 * u2 + u) * T * v0 + (3 * u2 - 2 * u3) * p1 + (u3 - u2) * T * v1; }
// A player at time rt from reports a/b ([x, z, vx, vz] at times ta/tb): between the two, or carried on along
// its velocity for at most `max` seconds past the newest
function between(ta, a, tb, b, rt, max) {
  if (b && tb > ta) {
    const T = (tb - ta) / 1000, u = clamp((rt - ta) / (tb - ta), 0, 1);
    return [herm(a[0], a[2], b[0], b[2], u, T), herm(a[1], a[3], b[1], b[3], u, T), lerp(a[2], b[2], u), lerp(a[3], b[3], u)];
  }
  const s = clamp((rt - ta) / 1000, 0, max);
  return [a[0] + a[2] * s, a[1] + a[3] * s, a[2], a[3]];
}
const inHalf = (a, x, z) => ({ x: clamp(x, -3.4, 3.4), z: a.side > 0 ? clamp(z, 0.35, 8.2) : clamp(z, -8.2, -0.35) });
// Put a player drawn from the network at x, z without visible jumps: a sudden gap (a late report, the end of a
// guess) is closed over a few frames; a big one (placed for a new point) is jumped straight away. dtR: how far
// the drawn time moved this frame (it runs a little faster or slower than dt while the delay adjusts).
// Real running moves a player at most ~1 cm off its straight line in a frame, so anything over 4 cm is a gap.
function netPlace(a, x, z, vx, vz, dt, dtR) {
  const o = a.nOff || (a.nOff = { x: 0, z: 0 });
  if (a.nRaw) {
    const ex = a.nRaw.x + a.nRaw.vx * dtR, ez = a.nRaw.z + a.nRaw.vz * dtR, j = Math.hypot(x - ex, z - ez);
    if (j > 1.5) o.x = o.z = 0; else if (j > 0.04) { o.x += ex - x; o.z += ez - z; }
  } else { o.x = a.x - x; o.z = a.z - z; if (Math.hypot(o.x, o.z) > 1.5) o.x = o.z = 0; }
  a.nRaw = { x, z, vx, vz };
  const f = Math.exp(-dt * 10); o.x *= f; o.z *= f;
  a.x = x + o.x; a.z = z + o.z; a.vx = vx; a.vz = vz;
}
function flyFor(p0, v0, s) {
  const p = { ...p0 }, v = { ...v0 };
  for (let t = s; t > 1e-6; t -= DT) stepShuttle(p, v, Math.min(DT, t));
  return { p, v };
}
const STILL = { x: 0, y: 0, z: 0 };
// The shuttle at time rt from snapshots A and B. key: the hit count it is flying on (a new key is a new hit)
function netShuttleAt(A, B, rt) {
  const sh = A.sh;
  if (B && (B.hn !== A.hn || (sh.mode === 'held' && B.sh.mode === 'held'))) {
    // Hit between the two snapshots, or held in the server's hand: straight from one to the other
    const u = clamp((rt - A.t) / Math.max(1, B.t - A.t), 0, 1), q = B.sh.p;
    return { p: { x: lerp(sh.p.x, q.x, u), y: lerp(sh.p.y, q.y, u), z: lerp(sh.p.z, q.z, u) }, v: { ...B.sh.v }, mode: B.sh.mode, key: A.hn, to: B.hn };
  }
  if (sh.mode !== 'fly' || A.still) return { p: { ...sh.p }, v: sh.mode === 'fly' ? { ...sh.v } : STILL, mode: sh.mode, key: A.hn };
  // (during the host's hit-stop the shuttle flies at a quarter speed, as it does there)
  const f = flyFor(sh.p, sh.v, clamp((rt - A.t) / 1000, 0, 0.3) * (A.hs ? 0.25 : 1));
  if (f.p.y < 0.03) f.p.y = 0.03;
  return { p: f.p, v: f.v, mode: 'fly', key: A.hn };
}
// Our own hit, flown on here from where we hit it
function hitFlight(H, rt) {
  const f = flyFor(H.p, H.v, clamp((rt - H.t) / 1000, 0, 3));
  return f.p.y < 0.03 ? { p: { ...f.p, y: 0.03 }, v: STILL, mode: 'rest', key: 'me' } : { p: f.p, v: f.v, mode: 'fly', key: 'me' };
}
function showShuttle(q, dt, dtR, st = NET) {
  const o = st.shOff, r = st.shRaw;
  if (r && q.mode !== 'held' && r.mode !== 'held') {
    // Where last frame's shuttle would be now by its own flight; any gap to that is closed over a few frames.
    // Except a hit by someone else that was drawn on time (between the snapshots before and after it,
    // netShuttleAt): that turn is real and shown as it is. A hit that arrived late slides over instead.
    // (a hit the host took in after its late screen had passed that moment, PV.late, slides over too)
    const newHit = typeof q.key === 'number' && q.key !== st.shKey && q.key === st.lerpTo && q.key !== st.late;
    const e = r.mode === 'fly' ? flyFor(r.p, r.v, dtR).p : r.p, j = Math.hypot(q.p.x - e.x, q.p.y - e.y, q.p.z - e.z);
    if (j > 2.5) o.x = o.y = o.z = 0;
    else if (j > 0.02 && !newHit) { o.x += e.x - q.p.x; o.y += e.y - q.p.y; o.z += e.z - q.p.z; }
  } else o.x = o.y = o.z = 0;
  st.shRaw = q; st.shKey = q.key; st.lerpTo = q.to ?? null;
  const f = Math.exp(-dt * 12); o.x *= f; o.y *= f; o.z *= f;
  shuttle.p = { x: q.p.x + o.x, y: Math.max(0.03, q.p.y + o.y), z: q.p.z + o.z }; shuttle.v = q.v; shuttle.mode = q.mode;
}
// Swing, stamina and falls from the snapshot being drawn
function athFromSnap(b, i, d) {
  b.fallT = d[11] || 0; b.fdx = d[12] || 0; b.fdz = d[13] || 0; b.sta = d[9];
  if (i !== me) b.run = !!d[10];
  if (b.fallT > 0) b.predT = 0;
  if (i === me && b.predT > 0) {
    // Our own swing started here when the button was pressed: follow the host's only once its swing goes
    // past the wind-up
    if (b.swingT >= 0 && b.swingT <= SW_W + 0.005 && d[4] > SW_W + 0.005 && d[4] < SW_F) { b.swingT = d[4]; b.swingK = SWK[d[7]] || b.swingK; }
  } else {
    b.swingK = SWK[d[7]] || 'over';
    if (i !== me) b.armed = d[8] ? 'strong' : null; // ours is armed here, by our own button
    if (d[4] >= 0 && (b.swingT < 0 || Math.abs(b.swingT - d[4]) > 0.1)) b.swingT = d[4];
  }
}
// Same rules as tryHits, on what this screen shows: the shuttle at time rt, our own player now
function ownHitReady(A, q, a) {
  if (S.state !== 'rally' || S.paused || A.s !== 'rally' || !a.armed || a.fallT > 0 || q.mode !== 'fly') return false;
  if (A.lt === team(me) || (A.is && A.rc !== me) || A.nf) return false;
  const p = q.p;
  if (Math.sign(p.z) !== a.side || Math.abs(p.z) < 0.05 || p.y < 0.12 || p.y > 2.75 + a.y) return false;
  const hc = hitCenter(a);
  return Math.hypot(p.x - hc.x, p.z - hc.z) <= 1.1;
}
function guestHit(q, rt) {
  const a = ath(me), kind = a.armed; a.armed = null;
  shuttle.p = { ...q.p }; shuttle.v = { ...q.v }; // humanShot and aimShot read the shuttle
  const type = humanShot(kind, me), s = aimShot(me, type);
  const p = { x: r3(s.from.x), y: r3(s.from.y), z: r3(s.from.z) }, v = { x: r3(s.vel.x), y: r3(s.vel.y), z: r3(s.vel.z) }, id = ++NET.hid;
  // `at`: the moment this screen shows, on the host's clock
  send({ t: 'hit', id, at: Math.round(rt - NET.clk.off), k: type, p: [p.x, p.y, p.z], v: [v.x, v.y, v.z], ax: r3(a.x), az: r3(a.z) });
  NET.hit = { id, t: rt, p, v, sent: performance.now(), ok: null, until: null };
  // Swing, sound and sparks right away; the host's copies of them are skipped (they carry our seat as g)
  const h = p.y - a.y;
  a.swingK = h > 1.75 ? 'over' : h < 1.05 ? 'under' : 'side';
  if (!(a.swingT >= SW_W && a.swingT < SW_C)) a.swingT = SW_W + 0.01;
  sfx(type === 'smash' || type === 'jsmash' ? 'smash' : 'hit');
  fxEvent({ kind: 'hit', type, x: p.x, y: p.y, z: p.z, vx: v.x, vy: v.y, vz: v.z });
  showShot(me, type);
}
function guestTick(dt) {
  readInput(dt);
  const now = performance.now(), a = ath(me), playing = (S.state === 'rally' || S.state === 'point') && !S.paused;
  // Move our own player right here, same rules as the host, so it reacts without waiting on the network
  if (playing && !(a.fallT > 0)) {
    if (a.sta <= 0) a.tired = true; else if (a.sta > 0.3) a.tired = false;
    const w = worldInput(me);
    a.run = w.run && !a.tired && Math.hypot(w.x, w.z) > 0.2;
    moveAthlete(a, w.x, w.z, a.run ? RUN_SP : WALK_SP, dt, false);
  }
  // Our own swing and jump, started here when pressed
  if (!S.paused) {
    a.cool -= dt;
    if (a.armed && !a.holding) { a.armT -= dt; if (a.armT <= 0) a.armed = null; }
    if (a.predT > 0 && (a.holding || a.armed)) a.predT = 0.5; else if (a.predT > 0) a.predT -= dt;
  }
  let vt = 0;
  if (NET.buf.length) {
    clockTick(NET.clk, dt);
    // (the frame's own time, not the moment this code happens to run, so each frame moves by an even step)
    const rt = last - NET.clk.D, [A, B] = netPair(NET.buf, rt), fresh = A !== NET.shownA;
    const dtR = NET.prevRt == null ? dt : clamp((rt - NET.prevRt) / 1000, 0, 0.1);
    NET.shownA = A; NET.prevRt = rt; vt = Math.round(rt - NET.clk.off);
    if (fresh) snapState(A.m);
    playDueEvs(rt);
    // Everyone the host moves (and our own player between points or while down), as they were at time rt
    for (let i = 0; i < S.n; i++) {
      const b = ath(i), d = A.a[i];
      if (!d) continue;
      if (fresh) athFromSnap(b, i, d);
      if (i === me && (S.state === 'rally' || S.state === 'point') && !(b.fallT > 0)) { b.nRaw = null; if (!S.paused) stepBody(b, dt); continue; }
      const q = A.still ? between(A.t, d, 0, null, rt, 0) : between(A.t, d, B ? B.t : 0, B && B.a[i], rt, 0.15), c = inHalf(b, q[0], q[1]);
      netPlace(b, c.x, c.z, q[2], q[3], dt, dtR);
      // Height: a jump is a parabola from the earlier report
      const s = A.still ? 0 : clamp((rt - A.t) / 1000, 0, 0.6), y = d[5] > 0 || d[6] > 0 ? Math.max(0, d[5] + d[6] * s - 0.5 * G * s * s) : 0;
      if (b.y > 0 && y <= 0) b.landT = LAND_T; else if (b.landT > 0) b.landT -= dt;
      b.y = y; b.vy = y > 0 ? d[6] - G * s : 0;
    }
    // The shuttle at time rt. After our own hit it flies on here from where we hit it, until the host's
    // snapshots carry that hit (or the host turns it down)
    const H = NET.hit;
    if (H && (H.ok === false || now - H.sent > (H.ok ? 3000 : 1500) || (H.until !== null && rt >= H.until))) NET.hit = null;
    let q = NET.hit ? hitFlight(NET.hit, rt) : netShuttleAt(A, B, rt);
    if (!NET.hit && ownHitReady(A, q, a)) { guestHit(q, rt); q = hitFlight(NET.hit, rt); }
    showShuttle(q, dt, dtR);
  }
  for (const b of ATH) if (b.fallT > 0) b.fallT = Math.max(0, b.fallT - dt);
  // Report stick and position to the host: every frame during a rally (the host draws us from these, and waits
  // for vt, how far this screen has got, before giving a point on our side), otherwise only when they change
  const msg = { t: 'in', x: +input.x.toFixed(2), z: +input.z.toFixed(2), r: input.run ? 1 : 0, tm: Math.round(last), vt };
  if (Number.isFinite(NET.he)) msg.he = Math.round(NET.he + now - NET.heAt);
  if (playing) Object.assign(msg, { px: r3(a.x), pz: r3(a.z), vx: r3(a.vx), vz: r3(a.vz) });
  const k = [msg.x, msg.z, msg.r, msg.px, msg.pz].join(',');
  if ((playing || k !== lastIn) && now - lastInAt >= 14 && !(ws && ws.bufferedAmount > 4096)) { lastIn = k; lastInAt = now; send(msg); }
}
/* Host: a guest's own hit (guestHit). The guest saw the match at `at` (host clock). Check the shuttle really was
   there then and nobody has hit it since, put it back to that moment with the guest's shot, and play the match
   forward to now. The host's own screen slides the shuttle over instead of jumping. */
function recordHist(w, st) {
  if (S.mode !== 'host') return;
  hostHist.push({ w, st, p: { x: shuttle.p.x, y: shuttle.p.y, z: shuttle.p.z }, mode: shuttle.mode, hn: S.hits });
  while (hostHist.length > 2 && hostHist[0].w < w - 1300) hostHist.shift();
}
function takeGuestHit(i, m) {
  if (S.paused || S.state !== 'rally' || S.netFault || !(m.k in SHOTS) || m.k === 'long' || m.k === 'short') return false;
  const a = ath(i), t = team(i);
  if (S.lastTeam === t || (S.isServe && i !== S.receiver) || a.fallT > 0) return false;
  const vec = q => Array.isArray(q) && q.length === 3 && q.every(Number.isFinite) ? { x: q[0], y: q[1], z: q[2] } : null;
  const p = vec(m.p), v = vec(m.v);
  if (!p || !v || Math.sign(p.z) !== a.side || p.y < 0.1 || p.y > 3.8 || v.z * a.side >= 0 || Math.hypot(v.x, v.y, v.z) > 80) return false;
  const now = performance.now(), at = +m.at, H = hostHist;
  if (!Number.isFinite(at) || at < now - 1100 || !H.length || H[0].w > at) return false;
  let j = H.length - 1;
  while (j > 0 && H[j].w > at) j--;
  const e0 = H[j], e1 = H[j + 1] || e0;
  if (e0.hn !== S.hits || e0.mode !== 'fly') return false; // someone hit it since, or it wasn't flying then
  const u = e1 === e0 || e1.mode !== 'fly' ? 0 : clamp((at - e0.w) / Math.max(1, e1.w - e0.w), 0, 1);
  if (Math.hypot(p.x - lerp(e0.p.x, e1.p.x, u), p.y - lerp(e0.p.y, e1.p.y, u), p.z - lerp(e0.p.z, e1.p.z, u)) > 0.9) return false;
  const hc = hitCenter({ x: +m.ax || 0, z: +m.az || 0, side: a.side, hand: a.hand });
  if (Math.hypot(p.x - hc.x, p.z - hc.z) > 1.5) return false;
  const shown = { x: shuttle.p.x + shVis.x, y: shuttle.p.y + shVis.y, z: shuttle.p.z + shVis.z };
  a.armed = null;
  replayFrom(at, j, lerp(e0.st, e1.st, u), () => finishHit(i, m.k, p, v, i));
  // (a host drawing in the present slides its shuttle over; a late one, PV, gets the new course in its buffer)
  const dx = shown.x - shuttle.p.x, dy = shown.y - shuttle.p.y, dz = shown.z - shuttle.p.z;
  if (!PV.on && Math.hypot(dx, dy, dz) < 4) Object.assign(shVis, { x: dx, y: dy, z: dz }); else shVis.x = shVis.y = shVis.z = 0;
  return true;
}
