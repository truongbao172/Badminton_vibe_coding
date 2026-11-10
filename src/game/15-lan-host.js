// Put the match back to host time `at` (history entry j, match time st), do `apply` there (a hit, a serve) and
// play it forward to now; the computer players start as late as the news reached us. The host's late screen (PV)
// gets the new course from `at` on; if it had already shown past `at`, its shuttle slides over.
function replayFrom(at, j, st, apply) {
  const now = performance.now(), back = clamp(S.simT - st, 0, REWIND_MS / 1000);
  hostHist.length = j + 1; pendLand = null; PV.patchFrom = at;
  evAt = simWall = at; apply();
  for (const k of members(1 - S.lastTeam)) { const b = ath(k); if (!isHuman(k) && b.delay > 0) b.delay = Math.max(0, b.delay - back); }
  for (let s = 0; s + DT <= back && shuttle.mode === 'fly'; s += DT) {
    evAt = simWall = at + (s + DT) * 1000; physicsStep(DT); tryHits(); recordHist(simWall, st + s + DT); pvPatch(simWall);
  }
  S.flightT = back; simWall = last; evAt = null; pvPatch(Infinity);
  if (PV.on && at < PV.ts - 1) PV.late = S.hits;
}
// A human's serve. Our own, while the host draws late, goes off at the moment that screen shows
function serveAs(idx, type) {
  const H = hostHist, at = PV.ts;
  let j = H.length - 1;
  while (j > 0 && H[j].w > at) j--;
  if (!PV.on || idx !== me || !H.length || H[j].w > at || S.simT - H[j].st > REWIND_MS / 1000) { launchServe(type); return; }
  replayFrom(at, j, H[j].st, () => launchServe(type));
}

/* The host's own screen while it plays guests over the network. A guest sees the match a little late (its drawing
   delay plus the trip from here), so if the host drew the present, it would see every landing, every point and every
   computer player's shot before the guest does. Instead the host draws the shuttle, the computer players, the score
   and the sounds just as late as the guests (PV.L, from what they report), from its own snapshots kept per frame.
   Its own player stays in the present, and its own hits are judged on that late screen and put back in time, the
   same way as a guest's (replayFrom). So the same moment shows on every screen at once. */
function pvEntry(t, a) {
  const m = snapshot(); m.sc = [...m.sc]; m.g = [...m.g]; // (copies: the snapshot holds the live arrays)
  if (a) m.a = a;
  return bufEntry(m, t);
}
function pvRecord() {
  if (!PV.on) return;
  const B = PV.buf, L = B[B.length - 1];
  if (L && simWall - L.t > 100) B.push({ ...L, t: simWall - 1, still: true }); // paused meanwhile: hold still
  B.push(pvEntry(simWall));
  while (B.length > 2 && B[1].t < simWall - 1500) B.shift();
}
// After a replay: the kept snapshots from `at` up to `upto` take the new course (the players stay as they were)
function pvPatch(upto) {
  if (!PV.on) return;
  const B = PV.buf;
  for (let k = B.length - 1; k >= 0 && B[k].t > PV.patchFrom; k--) if (B[k].t <= upto) B[k] = pvEntry(B[k].t, B[k].a);
  PV.patchFrom = Math.max(PV.patchFrom, Math.min(upto, performance.now()));
}
// Score, serve hint and landing ring as that screen shows them
function pvHud(m) {
  const keep = { state: S.state, score: S.score, games: S.games, server: S.server, gameNo: S.gameNo, rally: S.rally }, rd = { ...RD };
  Object.assign(S, { state: m.s, score: m.sc, games: m.g, server: m.sv, gameNo: m.gn, rally: m.ra });
  Object.assign(RD, { vis: !!m.rg[0], x: m.rg[1], z: m.rg[2], out: !!m.rg[3], to: m.rg[4] });
  PV.drawing = true;
  refreshRing();
  const k = [m.sc, m.g, m.sv, m.gn, m.ra, m.s, S.paused, m.n].join('|');
  if (k !== hudKey) { hudKey = k; updateHUD(); updateServeHint(); }
  PV.drawing = false;
  Object.assign(S, keep); Object.assign(RD, rd);
}
// Our own hit, judged on the late screen: the shuttle as it shows, our own player as it is now
function pvOwnHit(A, B, ts) {
  const a = ath(me);
  if (!a.armed) return false;
  const q = netShuttleAt(A, B, ts);
  if (!ownHitReady(A, q, a)) return false;
  const keep = { p: shuttle.p, v: shuttle.v }, kind = a.armed;
  shuttle.p = { ...q.p }; shuttle.v = { ...q.v }; // humanShot and aimShot read the shuttle
  const type = humanShot(kind, me), s = aimShot(me, type);
  shuttle.p = keep.p; shuttle.v = keep.v;
  return takeGuestHit(me, { k: type, at: ts, p: [s.from.x, s.from.y, s.from.z], v: [s.vel.x, s.vel.y, s.vel.z], ax: a.x, az: a.z });
}
// How far behind our present guest i's screen is. Each report says which moment that screen shows (vt, on our
// clock); it left there half a round trip before it got here. The quickest of the last second's reports is the one
// that was least held up on the way.
function guestLag(i) {
  const r = remoteIn[i];
  if (!r.lagS.length || !r.rtt.length) return NaN;
  return Math.min(...r.lagS) - Math.min(...r.rtt) / 2;
}
function pvStop() {
  PV.on = false;
  const Q = PV.evq; PV.evq = [];
  for (const e of Q) if (e.m.k !== 'sfx' && e.m.k !== 'fx' && e.m.k !== 'shot') handleEv(e.m);
  PV.buf.length = 0; PV.shownA = PV.prevTs = PV.shRaw = null; PV.late = -1;
  hudKey = ''; updateHUD(); updateServeHint(); refreshRing();
}
// Each frame on the host: draw late if there are guests (true), or leave it to syncVisuals (false)
function pvFrame(dt) {
  if (S.mode !== 'host') { if (PV.on) pvStop(); return false; }
  const guests = [0, 1, 2, 3].filter(i => i !== me && i < S.n && isHuman(i));
  const live = S.state === 'serve' || S.state === 'rally' || S.state === 'point';
  if (!PV.on) {
    if (!guests.length || !live) return false;
    PV.on = true; PV.late = -1; PV.shownA = PV.prevTs = PV.shRaw = null;
    return false; // (its first snapshot is kept next frame)
  }
  // As late as the latest guest screen, changing slowly so that drawn time never jumps
  const lag = guests.map(guestLag).filter(Number.isFinite);
  const want = guests.length ? clamp(lag.length ? Math.max(...lag) : 150, 40, 600) : 0;
  PV.L += clamp(want - PV.L, -dt * 30, dt * 100); // (as fast as a guest's own delay moves, clockTick)
  netWarn(PV.L, performance.now());
  const B = PV.buf, ts = last - PV.L;
  if ((!guests.length && PV.L < 2) || (!live && (!B.length || ts >= B[B.length - 1].t))) { pvStop(); return false; }
  if (!B.length) return false;
  const dtR = PV.prevTs == null ? dt : clamp((ts - PV.prevTs) / 1000, 0, 0.1);
  PV.prevTs = PV.ts = ts;
  let [A, Bn] = netPair(B, ts);
  if (pvOwnHit(A, Bn, ts)) [A, Bn] = netPair(B, ts);
  if (A !== PV.shownA) { PV.shownA = A; pvHud(A.m); }
  playDueEvs(ts, PV);
  // The computer players as they were then (the match itself keeps their real state, put back after drawing)
  const kept = [];
  for (let i = 0; i < S.n; i++) {
    const b = ath(i), d = A.a[i], e = Bn && Bn.a[i];
    if (isHuman(i) || !d) continue;
    if (b.swingT >= 0) { b.swingT += dt; if (b.armed && b.swingT > SW_W) b.swingT = SW_W; if (b.swingT >= SW_END) b.swingT = -1; }
    kept.push([b, { x: b.x, z: b.z, vx: b.vx, vz: b.vz, y: b.y, vy: b.vy, swingT: b.swingT, swingK: b.swingK, armed: b.armed, sta: b.sta, run: b.run, fallT: b.fallT, fdx: b.fdx, fdz: b.fdz }]);
    const q = between(A.t, d, Bn ? Bn.t : 0, e, ts, A.still ? 0 : 0.05), s = A.still ? 0 : clamp((ts - A.t) / 1000, 0, 0.1);
    Object.assign(b, { x: q[0], z: q[1], vx: q[2], vz: q[3], y: d[5] > 0 || d[6] > 0 ? Math.max(0, d[5] + d[6] * s - 0.5 * G * s * s) : 0, vy: d[6],
      swingT: d[4] >= 0 ? d[4] + s : -1, swingK: SWK[d[7]] || 'over', armed: d[8] ? 'strong' : null, sta: d[9], run: !!d[10], fallT: d[11] || 0, fdx: d[12] || 0, fdz: d[13] || 0 });
  }
  // The shuttle as it was then; held by a human server, it stays in that player's hand as it is now
  let q = netShuttleAt(A, Bn, ts);
  if (q.mode === 'held' && shuttle.mode === 'held' && isHuman(S.server)) q = { p: { ...shuttle.p }, v: STILL, mode: 'held', key: q.key };
  const sim = { p: shuttle.p, v: shuttle.v, mode: shuttle.mode };
  showShuttle(q, dt, dtR, PV);
  shVis.x = shVis.y = shVis.z = 0;
  syncVisuals(dt);
  shuttle.p = sim.p; shuttle.v = sim.v; shuttle.mode = sim.mode;
  for (const [b, k] of kept) Object.assign(b, k);
  return true;
}
// F3 meter: how far behind the network pictures are drawn, how uneven the reports arrive (p50/p97 of their
// lateness against the quickest ones) and how many come per second
function lateInfo(c) {
  if (c.late.length < 20) return '';
  const s = c.late.slice().sort((x, y) => x - y);
  return ` · gói đến trễ ${Math.max(0, Math.round(s[s.length >> 1]))}/${Math.max(0, Math.round(s[Math.floor(s.length * 0.97)]))} ms`;
}
function netInfo() {
  if (S.mode === 'guest' && NET.buf.length) return ` · mạng: vẽ trễ ${Math.round(NET.clk.D)} ms${lateInfo(NET.clk)} · ${NET.rate} gói/s`;
  if (S.mode !== 'host') return '';
  const g = remoteIn.filter((r, i) => i !== me && i < S.n && isHuman(i) && r.buf.length);
  const rtt = g.filter(r => r.rtt.length).map(r => Math.round(Math.min(...r.rtt))), late = g.map(r => lateInfo(r.clk)).join('');
  const ping = rtt.length ? ` · ping ${rtt.join('/')} ms` : '';
  if (PV.on) return ` · mạng: chủ sân vẽ trễ ${Math.round(PV.L)} ms cho khớp với khách${ping}${late}`;
  return g.length ? ` · mạng: khách vẽ trễ ${g.map(r => Math.round(r.clk.D)).join('/')} ms${ping}${late}` : '';
}
// A slow connection makes every screen draw far behind the match (D on a guest, PV.L on the host). Past ~320 ms
// the game feels sluggish whatever the smoothing does, so say so once in a while instead of leaving players to
// wonder whether the game is at fault.
const NET_WARN_MS = 320;
function netWarn(lag, now) {
  if (lag < NET_WARN_MS || now - NET.warnAt < 30000 || (S.state !== 'rally' && S.state !== 'serve')) return;
  NET.warnAt = now;
  toast('Mạng chậm', `Hình vẽ trễ ${Math.round(lag)} ms so với trận đấu · bấm F3 để xem số liệu`, 2.2);
}
$('btnPause').addEventListener('click', () => setPaused(!S.paused));
$('btnSound').addEventListener('click', e => { muted = !muted; e.currentTarget.setAttribute('aria-pressed', String(!muted)); if (!muted) ensureAudio(); });

