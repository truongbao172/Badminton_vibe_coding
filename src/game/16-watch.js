/* ---------- other courts: live matches around the hall, and watching one ---------- */
// The host of every court sends a light summary about 10 times a second. Every open page keeps a "watch"
// connection that receives them for all courts, and draws each match with its own players on its own court.
const GC = [];
let watchWs = null, lastSum = 0, sumN = 0;
const live = c => !!GC[c] && clock - GC[c].seen < 3;
const liveCourts = () => [...Array(COURTS).keys()].filter(live);
function ghostCourt(c) {
  if (GC[c]) return GC[c];
  const root = new THREE.Group(); courtG[c].add(root);
  const ctx = { state: 'rally', server: 0, sh: { p: { x: 0, y: 0.03, z: 0 }, v: { x: 0, y: 0, z: 0 }, mode: 'rest' } };
  const players = DEF_LOOKS.map((l, i) => Object.assign(makeAthlete(i, l, root), { tgt: null }));
  const sh = shMesh.clone(); root.add(sh);
  const clk = netClock(); clk.D = 160;
  return (GC[c] = { c, root, ctx, players, sh, n: 2, seen: -1e9, names: [], hu: [], sc: [0, 0], g: [0, 0], gn: 1,
    clk, buf: [], shownA: null, prevRt: null, shRaw: null, shKey: null, shOff: { x: 0, y: 0, z: 0 } });
}
function summary() {
  const p = shuttle.p, v = shuttle.v, r2 = x => Math.round(x * 100) / 100;
  // tm: when (host clock), hn: hits so far, lh: the latest hit [when, x, y, z, vx, vy, vz], so a spectator can
  // draw the match a little in the past between two summaries, with every hit where it really happened
  const L = lastHit && lastHit.hn === S.hits ? lastHit : null;
  const m = { t: 'sum', tm: Math.round(last), hn: S.hits,
    lh: L && [L.w, r2(L.p.x), r2(L.p.y), r2(L.p.z), r2(L.v.x), r2(L.v.y), r2(L.v.z)],
    s: S.state, n: S.n, sc: S.score, g: S.games, gn: S.gameNo, sv: S.server,
    a: ATH.slice(0, S.n).map(a => [r2(a.x), r2(a.z), r2(a.y), r2(a.vx), r2(a.vz), r3(a.swingT), SWK.indexOf(a.swingK), r2(a.vy), r2(a.fallT), r2(a.fdx), r2(a.fdz)]),
    sh: [r2(p.x), r2(p.y), r2(p.z), r2(v.x), r2(v.y), r2(v.z), MODES.indexOf(shuttle.mode)] };
  // Names and looks change rarely: send them every 2 s
  if (sumN++ % 20 === 0) m.info = { names: S.names.slice(0, S.n), hu: S.human.slice(0, S.n).map(Number), looks: ATH.slice(0, S.n).map(a => a.look) };
  return m;
}
function onSum(m) {
  const c = (m.c | 0) - 1;
  if (c < 0 || c >= COURTS) return;
  const G = ghostCourt(c), now = performance.now(), B = G.buf;
  if (!Array.isArray(m.a) || !Array.isArray(m.sh)) return;
  // Kept, and drawn a little in the past (updateGhosts), like a guest's snapshots
  if (!live(c)) { B.length = 0; G.clk = netClock(); G.clk.D = 160; G.shownA = G.prevRt = null; }
  let t = clockIn(G.clk, m.tm, now);
  if (B.length && t < B[B.length - 1].t) t = B[B.length - 1].t;
  const lh = Array.isArray(m.lh) && m.lh.every(Number.isFinite) ? { t: m.lh[0] + G.clk.off, p: { x: m.lh[1], y: m.lh[2], z: m.lh[3] }, v: { x: m.lh[4], y: m.lh[5], z: m.lh[6] } } : null;
  B.push({ t, m, hn: m.hn | 0, lh });
  while (B.length > 2 && B[1].t < now - 2000) B.shift();
  G.seen = clock; G.n = m.n === 4 ? 4 : 2;
  if (m.info) {
    G.names = (m.info.names || []).map(String); G.hu = m.info.hu || [];
    G.players.forEach((a, i) => {
      const l = cleanLook((m.info.looks || [])[i]) || DEF_LOOKS[i];
      if (JSON.stringify(l) !== JSON.stringify(a.look)) { a.look = l; applyLook(a, l); }
    });
    if (S.mode === 'watch' && c === S.court) watchHUD();
  }
}
// Score and state of the summary being drawn, so a point shows when the shuttle drawn here lands
function sumState(G, m) {
  G.ctx.state = m.s; G.ctx.server = m.sv | 0; G.sc = m.sc || [0, 0]; G.g = m.g || [0, 0]; G.gn = m.gn || 1;
  m.a.forEach((d, i) => { const a = G.players[i]; if (!a) return; a.tgt = d; a.fallT = d[8] || 0; a.fdx = d[9] || 0; a.fdz = d[10] || 0; });
  if (S.mode === 'watch' && G.c === S.court) watchHUD();
}
// The shuttle at time rt from summaries A and B (100 ms apart): flown on from A by the host's physics, or, once
// past the latest hit, from where that hit happened. key: the hit count; exact: a hit drawn where it happened.
function sumShuttleAt(A, B, rt) {
  const h = A.m.sh, mode = MODES[h[6]] || 'rest', p = { x: h[0], y: h[1], z: h[2] }, v = { x: h[3], y: h[4], z: h[5] };
  if (B && B.hn !== A.hn) {
    const L = B.lh;
    if (L && L.t >= A.t - 1 && L.t <= rt) return flown(L.p, L.v, (rt - L.t) / 1000, B.hn, true);
    if (!L || L.t < A.t - 1) {
      const u = clamp((rt - A.t) / Math.max(1, B.t - A.t), 0, 1), q = B.m.sh;
      return { p: { x: lerp(p.x, q[0], u), y: lerp(p.y, q[1], u), z: lerp(p.z, q[2], u) }, v: { x: q[3], y: q[4], z: q[5] }, mode: MODES[q[6]] || 'rest', key: B.hn };
    }
  }
  if (mode === 'held' && B && B.m.sh[6] === 0) {
    const u = clamp((rt - A.t) / Math.max(1, B.t - A.t), 0, 1), q = B.m.sh;
    return { p: { x: lerp(p.x, q[0], u), y: lerp(p.y, q[1], u), z: lerp(p.z, q[2], u) }, v: STILL, mode, key: A.hn };
  }
  if (mode !== 'fly') return { p, v: STILL, mode, key: A.hn };
  return flown(p, v, (rt - A.t) / 1000, A.hn, false);
}
function flown(p, v, s, key, exact) {
  const f = flyFor(p, v, clamp(s, 0, 0.4));
  return f.p.y < 0.03 ? { p: { ...f.p, y: 0.03 }, v: STILL, mode: 'rest', key, exact } : { p: f.p, v: f.v, mode: 'fly', key, exact };
}
function onSumEnd(court) {
  const c = (court | 0) - 1, G = GC[c];
  if (G) G.seen = -1e9;
  if (S.mode === 'watch' && c === S.court) {
    const next = liveCourts()[0];
    if (next != null) startWatch(next); else exitWatch(`Trận ở sân ${c + 1} đã kết thúc.`);
  }
}
function watchConnect() {
  if (!window.SAN7_LAN) return;
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  let sock;
  try { sock = new WebSocket(`${proto}://${location.host}/ws?watch=1`); } catch (e) { return; }
  watchWs = sock;
  sock.onmessage = e => {
    let m; try { m = JSON.parse(e.data); } catch (_) { return; }
    if (m.t === 'sum') onSum(m); else if (m.t === 'sumEnd') onSumEnd(m.c);
    else if (m.t === 'hb' && sock.readyState === 1) sock.send('{"t":"hb"}'); // (still here: see lobby.js heartbeat)
  };
  sock.onclose = () => { if (watchWs === sock) { watchWs = null; setTimeout(watchConnect, 3000); } };
}
function updateGhosts(dt) {
  for (const G of GC) {
    if (!G) continue;
    // Your own court shows your own match, unless you are only watching it
    const show = live(G.c) && (G.c !== S.court || S.mode === 'watch');
    G.root.visible = show;
    if (!show) continue;
    if (!G.buf.length) continue;
    // Drawn a little in the past (about one summary interval plus the network's worst lateness), between two
    // summaries already here, so they can arrive late or bunched without the picture jumping
    clockTick(G.clk, dt, 110, 500);
    const rt = last - G.clk.D, [A, B] = netPair(G.buf, rt), dtR = G.prevRt == null ? dt : clamp((rt - G.prevRt) / 1000, 0, 0.1);
    G.prevRt = rt;
    // For a new serve the host puts everyone straight in place: so does this, instead of sliding them there
    let placed = false;
    if (A !== G.shownA) { const was = G.ctx.state; G.shownA = A; sumState(G, A.m); placed = A.m.s === 'serve' && was !== 'serve'; }
    const still = A.m.s !== 'rally' && A.m.s !== 'point' && A.m.s !== 'serve', cut = B && B.m.s === 'serve' && A.m.s !== 'serve';
    G.players.forEach((a, i) => {
      a.g.visible = i < G.n && !!a.tgt;
      if (!a.g.visible) return;
      const d = A.m.a[i], e = !cut && B && B.m.a[i];
      if (!d) return;
      const q = between(A.t, [d[0], d[1], d[3], d[4]], e ? B.t : 0, e && [e[0], e[1], e[3], e[4]], rt, still || cut ? 0 : 0.15);
      netPlace(a, q[0], q[1], q[2], q[3], dt, dtR);
      if (placed) { a.nOff.x = a.nOff.z = 0; a.x = q[0]; a.z = q[1]; }
      // Height: a jump is a parabola from the earlier summary
      const s = clamp((rt - A.t) / 1000, 0, 0.6), y = d[2] > 0 || d[7] > 0 ? Math.max(0, d[2] + (d[7] || 0) * s - 0.5 * G_ACC * s * s) : 0;
      if (a.y > 0 && y <= 0) a.landT = LAND_T; else if (a.landT > 0) a.landT -= dt;
      a.y = y; a.vy = y > 0 ? (d[7] || 0) - G_ACC * s : 0;
      if (a.fallT > 0) a.fallT = Math.max(0, a.fallT - dt);
      if (d[5] >= 0 && (a.swingT < 0 || Math.abs(a.swingT - d[5]) > 0.15)) a.swingT = d[5];
      a.swingK = SWK[d[6]] || 'over';
      animateAthlete(a, dt, i, G.ctx); driveModel(a);
      setTag(a, G.hu[i] ? G.names[i] || 'Người chơi' : '');
    });
    // The shuttle: any gap to where last frame's would be by now is closed over a few frames, except a hit drawn
    // where it happened (that turn is real)
    const q = sumShuttleAt(A, B, rt), o = G.shOff, r = G.shRaw;
    if (r && q.mode !== 'held' && r.mode !== 'held') {
      const ex = r.mode === 'fly' ? flyFor(r.p, r.v, dtR).p : r.p, j = Math.hypot(q.p.x - ex.x, q.p.y - ex.y, q.p.z - ex.z);
      if (j > 2.5) o.x = o.y = o.z = 0;
      else if (j > 0.02 && !(q.exact && q.key !== G.shKey)) { o.x += ex.x - q.p.x; o.y += ex.y - q.p.y; o.z += ex.z - q.p.z; }
    } else o.x = o.y = o.z = 0;
    G.shRaw = q; G.shKey = q.key;
    const fo = Math.exp(-dt * 12); o.x *= fo; o.y *= fo; o.z *= fo;
    const sh = G.ctx.sh;
    sh.p = { x: q.p.x + o.x, y: Math.max(0.03, q.p.y + o.y), z: q.p.z + o.z }; sh.v = q.v; sh.mode = q.mode;
    G.sh.position.set(sh.p.x, sh.p.y, sh.p.z);
    const sp = Math.hypot(sh.v.x, sh.v.y, sh.v.z);
    if (sh.mode === 'fly' && sp > 0.3) { tmpV.set(-sh.v.x / sp, -sh.v.y / sp, -sh.v.z / sp); G.sh.quaternion.setFromUnitVectors(UP, tmpV); }
    else if (sh.mode === 'rest') G.sh.quaternion.setFromUnitVectors(UP, LYING);
  }
}
// Watching: the camera moves to that court as a spectator; you can flip between live courts
function startWatch(c) {
  if (!live(c)) return;
  S.mode = 'watch'; S.state = 'menu'; S.paused = false;
  $('menu').hidden = true; document.body.classList.add('watching'); $('watchBar').hidden = false;
  for (const a of ATH) a.g.visible = false;
  shMesh.visible = blob.visible = false; hideRing();
  setCourt(c);
}
function exitWatch(msg) {
  S.mode = 'ai'; document.body.classList.remove('watching'); $('watchBar').hidden = true;
  ATH[0].g.visible = ATH[1].g.visible = true; shMesh.visible = blob.visible = true;
  backToMenu();
  if (msg) { $('menuNote').textContent = msg; $('menuNote').hidden = false; showTab(true); }
}
function cycleWatch(dir) {
  const list = liveCourts();
  if (list.length < 2) return;
  const i = list.indexOf(S.court);
  startWatch(list[(i + dir + list.length) % list.length]);
}
function watchHUD() {
  const G = GC[S.court];
  if (!G) return;
  const side = t => [t, t + 2].filter(i => i < G.n).map(i => G.hu[i] ? G.names[i] || 'Người chơi' : 'Máy').join(' · ').toUpperCase();
  $('nmP').textContent = side(0); $('nmA').textContent = side(1);
  $('pP').textContent = G.sc[0]; $('pA').textContent = G.sc[1]; $('gP').textContent = G.g[0]; $('gA').textContent = G.g[1];
  $('dotP').classList.toggle('on', team(G.ctx.server) === 0); $('dotA').classList.toggle('on', team(G.ctx.server) === 1);
  $('cP').style.background = 'var(--you)'; $('cA').style.background = 'var(--cpu)';
  $('metaL').textContent = `ĐANG XEM SÂN ${S.court + 1}`; $('metaR').textContent = `VÁN ${G.gn} / 3`;
  $('watchTitle').textContent = `Đang xem sân ${S.court + 1} · ${G.n === 4 ? 'đánh đôi' : 'đánh đơn'}`;
  $('watchPrev').disabled = $('watchNext').disabled = liveCourts().length < 2;
}
$('btnWatch').addEventListener('click', () => startWatch(menuCourt()));
$('watchExit').addEventListener('click', () => exitWatch(''));
$('watchPrev').addEventListener('click', () => cycleWatch(-1));
$('watchNext').addEventListener('click', () => cycleWatch(1));
watchConnect();

