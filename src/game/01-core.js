const $ = id => document.getElementById(id);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const rnd = (a, b) => a + Math.random() * (b - a);

// Court dimensions in metres (BWF)
const C = { singlesX: 2.59, doublesX: 3.05, baseZ: 6.7, longDZ: 5.94, shortZ: 1.98, netH: 1.55 };
// Shuttle aerodynamics: terminal velocity ~7 m/s, quadratic drag
const G = 9.81, VT = 7.0, KD = G / (VT * VT), DT = 1 / 240, G_ACC = G; // (G_ACC where G names something else)

const DIFF = {
  de:  { label: 'DỄ',  speed: 4.0, react: 0.34, err: 0.85, smash: 0.15, out: 0.07,  judge: 0.35 },
  vua: { label: 'VỪA', speed: 5.0, react: 0.22, err: 0.5,  smash: 0.32, out: 0.035, judge: 0.75 },
  kho: { label: 'KHÓ', speed: 6.0, react: 0.13, err: 0.28, smash: 0.5,  out: 0.012, judge: 0.95 },
};
const SHOTS = {
  smash: { name: 'Đập cầu',       depth: [3.0, 4.6], elevs: [-14, -9, -4, 1, 6, 12], min: 18 },
  jsmash: { name: 'Bật nhảy đập', depth: [2.6, 4.3], elevs: [-22, -17, -12, -8, -4, 0, 5], min: 24 },
  clear: { name: 'Phông cầu',     depth: [5.6, 6.3], elevs: [46, 40, 53, 34, 60] },
  lift:  { name: 'Lốp cầu',       depth: [5.3, 6.2], elevs: [58, 50, 66, 44, 72] },
  drop:  { name: 'Bỏ nhỏ',        depth: [1.5, 2.4], elevs: [4, 12, 20, 28, 36, -4] },
  net:   { name: 'Đẩy sát lưới',  depth: [0.7, 1.3], elevs: [48, 38, 58, 28, 66, 74] },
  long:  { name: 'Giao cao sâu',  depth: [6.0, 6.45], elevs: [58, 52, 64, 46, 70] },
  short: { name: 'Giao ngắn',     depth: [2.15, 2.5], elevs: [18, 26, 34, 42, 10, 50] },
};
// After these shots the hitting pair attacks (front and back); otherwise it defends side by side
const ATTACK = { smash: 1, jsmash: 1, drop: 1, net: 1, short: 1 };

/* ---------- shuttle physics ---------- */
function stepShuttle(p, v, dt) {
  const d = KD * Math.hypot(v.x, v.y, v.z);
  v.x -= d * v.x * dt; v.y -= (G + d * v.y) * dt; v.z -= d * v.z * dt;
  p.x += v.x * dt; p.y += v.y * dt; p.z += v.z * dt;
}
function simulate(p0, v0, wantPath) {
  const p = { x: p0.x, y: p0.y, z: p0.z }, v = { x: v0.x, y: v0.y, z: v0.z };
  let t = 0, netY = null, i = 0; const path = wantPath ? [] : null;
  while (t < 8) {
    const pz = p.z, py = p.y;
    stepShuttle(p, v, DT); t += DT;
    if (netY === null && (pz > 0) !== (p.z > 0)) netY = py + (p.y - py) * (pz / (pz - p.z));
    if (wantPath && (i++ % 4 === 0)) path.push({ x: p.x, y: p.y, z: p.z, t });
    if (p.y <= 0) break;
  }
  return { x: p.x, z: p.z, t, netY, path };
}
// Find a launch velocity from `from` that lands on `target`, trying elevations in order of preference.
function solveShot(from, target, elevs, minSpeed = 0) {
  const dx = target.x - from.x, dz = target.z - from.z, dist = Math.hypot(dx, dz) || 0.01;
  const hx = dx / dist, hz = dz / dist;
  let best = null;
  for (const e of elevs) {
    const er = e * Math.PI / 180, c = Math.cos(er), s = Math.sin(er);
    const velAt = sp => ({ x: hx * c * sp, y: s * sp, z: hz * c * sp });
    let lo = 1, hi = 95;
    for (let i = 0; i < 20; i++) {
      const mid = (lo + hi) / 2, r = simulate(from, velAt(mid));
      if (Math.hypot(r.x - from.x, r.z - from.z) < dist) lo = mid; else hi = mid;
    }
    const vel = velAt(hi), res = simulate(from, vel);
    const err = Math.abs(Math.hypot(res.x - from.x, res.z - from.z) - dist);
    const ok = err < 0.5 && res.netY !== null && res.netY > C.netH + 0.07 && hi >= minSpeed;
    const cand = { vel, res, ok, speed: hi };
    if (ok) return cand;
    if (err < 0.5 && (!best || (res.netY || 0) > (best.res.netY || 0))) best = cand;
  }
  return best || { vel: { x: 0, y: 8, z: -Math.sign(from.z) * 6 }, res: null, ok: false, speed: 10 };
}
// Players: 0 and 2 are the near team (z > 0), 1 and 3 the far team. Singles uses 0 and 1 only.
const team = i => i & 1;
const sideT = t => t === 0 ? 1 : -1;
const sideX = () => S.n === 4 ? C.doublesX : C.singlesX;
const courtOut = (x, z) => Math.max(Math.abs(x) - sideX(), Math.abs(z) - C.baseZ, 0);
function boxOut(x, z) {
  const rs = -sideT(team(S.server));
  if (Math.sign(z) !== rs) return 1;
  const az = Math.abs(z), sx = x * S.boxXs, long = S.n === 4 ? C.longDZ : C.baseZ;
  return Math.max(C.shortZ - az, az - long, -sx, Math.abs(x) - sideX(), 0);
}

