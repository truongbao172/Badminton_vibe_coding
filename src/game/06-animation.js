// Near team in orange shades, far team in blue shades; each partner a slightly different tone. Humans can restyle theirs.
const DEF_LOOKS = [0xf0643a, 0x3f9ef0, 0xe8a23a, 0x5b6ff0].map(baseLook);
const ATH = DEF_LOOKS.map((l, i) => makeAthlete(i, l));
// LAN name tags floating above the other human players
function makeTag(a) {
  const cv = document.createElement('canvas'); cv.width = 512; cv.height = 96;
  const tex = new THREE.CanvasTexture(cv); tex.encoding = THREE.sRGBEncoding;
  // Same size on screen however far away the player is
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, depthTest: false, fog: false, sizeAttenuation: false, toneMapped: false }));
  sp.scale.set(0.2, 0.0375, 1); sp.position.y = 2.15; sp.renderOrder = 5; sp.visible = false; a.g.add(sp);
  a.tag = { sp, cv, tex, text: '' };
}
function setTag(a, text) {
  const t = a.tag; t.sp.visible = !!text;
  if (!text || text === t.text) return;
  t.text = text;
  const g = t.cv.getContext('2d'), w = t.cv.width, h = t.cv.height;
  g.clearRect(0, 0, w, h);
  g.font = '600 46px "Be Vietnam Pro", system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  const tw = Math.min(w - 8, g.measureText(text).width + 48), x0 = (w - tw) / 2;
  g.fillStyle = 'rgba(9,20,31,.82)'; g.beginPath(); g.roundRect ? g.roundRect(x0, 8, tw, h - 16, 18) : g.rect(x0, 8, tw, h - 16); g.fill();
  g.fillStyle = team(a.idx) ? '#3f9ef0' : '#f0643a'; g.fillRect(x0 + 14, h / 2 - 7, 14, 14);
  g.fillStyle = '#eef3f1'; g.fillText(text, w / 2 + 12, h / 2 + 2, tw - 52);
  t.tex.needsUpdate = true;
}
const ath = idx => ATH[idx];
// The racket reaches out on the racket-hand side: a.hand is 1 for right-handed, -1 for left-handed (applyLook)
const hitCenter = a => ({ x: a.x + a.side * a.hand * 0.35, z: a.z - a.side * 0.28 });

const ease = u => u * u * (3 - 2 * u);
const basePose = {}, swingPose = {};
function mixPose(out, p, q, u) { for (const k in p) out[k] = p[k] + (q[k] - p[k]) * u; return out; }
// Match context the animation reads: your own match, or another court's match from its summaries
const MAIN = { get state() { return S.state; }, get server() { return S.server; }, get sh() { return shuttle; } };

// Punishments the winners pick for the losers after a match (18-punishment). Each is a kneeling pose acted out
// over time (t: seconds into it): p arm and torso pose (keys as READY; lean < 0 bends forward), th/kn thigh and
// knee angles of both legs (th 0 / kn -1.57: kneeling upright, shins flat on the floor), neck: head pitch.
const PUNISH = {
  cha: { name: 'Quỳ gối gọi cha', say: ['Cha ơi!', 'Con thua rồi cha ơi!'] },
  bo: { name: 'Làm con bò', say: ['Ụm bòòò!', 'Bò đây ạ!'] },
  lay: { name: 'Quỳ lạy xin tha', say: ['Xin tha cho con!', 'Con lạy các anh!'] },
};
let pun = null, punPick = null; // the punishment being acted out, and the sides of the match just won (18-punishment)
const PK = { p: {}, th: [0, 0], kn: [0, 0], neck: 0 };
const BOW_UP = { sx: 1.0, sz: 0.1, el: 1.9, wr: 0, lx: 1.0, lz: -0.1, le: 1.9, tw: 0, lean: -0.15 };
const BOW_DOWN = { sx: 2.9, sz: 0.15, el: 0.15, wr: 0, lx: 2.9, lz: -0.15, le: 0.15, tw: 0, lean: -1.3 };
function punishPose(a) {
  const t = a.punT, s = Math.sin, P = PK;
  if (a.pun === 'cha') {
    // Kneeling upright, hands cupped round the mouth, leaning back to shout up at the sky
    Object.assign(P.p, { sx: 1.75, sz: 0.12, el: 2.15, wr: 0, lx: 1.75, lz: -0.12, le: 2.15, tw: 0, lean: 0.18 + 0.07 * s(t * 6) });
    P.th[0] = P.th[1] = 0; P.kn[0] = P.kn[1] = -1.57; P.neck = 0.45 + 0.1 * s(t * 6);
  } else if (a.pun === 'bo') {
    // On all fours, arms straight down to the floor, rocking from side to side, head up and nodding
    Object.assign(P.p, { sx: 1.45, sz: 0.12, el: 0.05, wr: 0, lx: 1.45, lz: -0.12, le: 0.05, tw: 0.1 * s(t * 3), lean: -1.42 + 0.04 * s(t * 6) });
    P.th[0] = 0.1 + 0.08 * s(t * 3); P.th[1] = 0.1 - 0.08 * s(t * 3); P.kn[0] = P.kn[1] = -1.62; P.neck = 1.0 + 0.2 * s(t * 2.2);
  } else {
    // Sitting back on the heels, bowing down to the floor and back up again, hands together
    const b = 0.5 - 0.5 * Math.cos(t * 2.4);
    mixPose(P.p, BOW_UP, BOW_DOWN, ease(b));
    P.th[0] = P.th[1] = 1.35; P.kn[0] = P.kn[1] = -2.95; P.neck = -0.25 * b;
  }
  return P;
}
function poseTarget(a, idx, ctx) {
  if (a.pun) return punishPose(a).p;
  if (a.fallT > 0) return fallKey(fallU(a)).p;
  const sh = ctx.sh;
  if (ctx.state === 'serve' && ctx.server === idx) mixPose(basePose, SERVE, SERVE, 0);
  else {
    // Racket comes up early when a high shuttle is heading this way
    const incoming = sh.mode === 'fly' && sh.v.z * a.side > 0;
    mixPose(basePose, READY, HIGH, incoming ? clamp((sh.p.y - a.y - 1.8) / 0.8, 0, 1) : 0);
  }
  const t = a.swingT, K = SWINGS[a.swingK];
  if (t < 0) return basePose;
  if (t < SW_W) return mixPose(swingPose, basePose, K.w, ease(t / SW_W));
  if (t < SW_C) return mixPose(swingPose, K.w, K.c, ease((t - SW_W) / (SW_C - SW_W)));
  if (t < SW_F) return mixPose(swingPose, K.c, K.f, ease((t - SW_C) / (SW_F - SW_C)));
  return mixPose(swingPose, K.f, basePose, ease((t - SW_F) / (SW_END - SW_F)));
}
function guessKind(a) {
  const h = shuttle.p.y + shuttle.v.y * 0.15 - a.y;
  return h > 1.85 ? 'over' : h < 1.1 ? 'under' : 'side';
}

function animateAthlete(a, dt, idx, ctx = MAIN) {
  if (a.swingT >= 0) {
    a.swingT += dt;
    if (a.armed && a.swingT > SW_W) a.swingT = SW_W;
    if (a.swingT >= SW_END) a.swingT = -1;
  }
  if (a.pun) a.punT += dt;
  const tgt = poseTarget(a, idx, ctx), q = a.pose, ka = 1 - Math.exp(-dt * (a.pun ? 8 : 30)); // (kneels down slowly)
  for (const k in tgt) q[k] += (tgt[k] - q[k]) * ka;

  // Legs: athletic crouch in a rally, stride while moving, tuck in the air (scissor kick on an overhead jump)
  // While knocked down the body follows the fall keyframes; fw is how far it is down (0 standing, 1 on the floor)
  const fu = fallU(a), down = fu >= 0, fw = fallWeight(fu);
  const sp = down ? 0 : Math.hypot(a.vx, a.vz), air = a.y > 0.005, run = Math.min(1, sp / 3.5);
  a.phase += dt * (5 + sp * 1.8);
  let th, kn, tuck = 0;
  if (a.pun) { th = PK.th; kn = PK.kn; }
  else if (down) { const F = fallKey(fu); th = F.th; kn = F.kn; }
  else if (air) {
    // How far through the jump we are (0 = take-off, 1 = touch-down), from the speed and height alone so it
    // also works for remote players: take-off speed v0 = √(vy² + 2·G·y)
    const v0 = Math.sqrt(a.vy * a.vy + 2 * G * a.y) || 1, u = clamp((1 - a.vy / v0) / 2, 0, 1);
    // Legs push off straight, knees draw up to a tuck around the top, then reach down again for the landing
    tuck = u < 0.42 ? ease(u / 0.42) : 1 - 0.8 * ease((u - 0.42) / 0.58);
    const scissor = a.swingK === 'over' && a.swingT >= 0;
    // Overhead jump: front knee driven up, back heel kicked towards the seat (scissor); otherwise both knees tucked
    const T = scissor ? [1.05, -0.25] : [1.15, 0.95], K = scissor ? [-1.5, -1.95] : [-2.0, -1.75];
    th = T.map(v => v * tuck); kn = K.map(v => v * tuck);
  } else {
    const crouch = (ctx.state === 'rally' ? 1 : 0.4) * (1 - run * 0.5) + (a.landT > 0 ? a.landT / LAND_T : 0);
    th = [0, 1].map(i => 0.32 * crouch + Math.sin(a.phase + i * Math.PI) * 0.6 * run);
    kn = [0, 1].map(i => -(0.62 * crouch + (1 - Math.cos(a.phase + i * Math.PI)) * 0.45 * run));
  }
  const kl = 1 - Math.exp(-dt * (a.pun ? 6 : 22));
  let ext = 0;
  a.legs.forEach((l, i) => {
    const t0 = a.leg.th[i] += (th[i] - a.leg.th[i]) * kl, k0 = a.leg.kn[i] += (kn[i] - a.leg.kn[i]) * kl;
    // Feet flat on the ground; in the air the toes point down as the legs tuck; sitting, the heels rest on the floor
    const an = air ? -(t0 + k0) * 0.5 - 0.25 - 0.45 * tuck : -(t0 + k0) * (1 - 0.5 * fw);
    l.ankle.rotation.x = a.leg.an[i] += (an - a.leg.an[i]) * (air ? kl : 1 - Math.exp(-dt * 40));
    l.hip.rotation.x = t0; l.knee.rotation.x = k0;
    ext = Math.max(ext, THIGH * Math.cos(t0) + SHIN * Math.cos(t0 + k0));
  });
  // In the air the hips ride at standing height and the feet lift up under them, so the tuck shows
  a.pelvis.position.y = HIP_DROP + FOOT + (air ? THIGH + SHIN - 0.03 : ext);

  // Torso leans into the run, arms follow the pose, left arm pumps while running
  const lvx = a.vx * a.side * (1 - fw), lvz = a.vz * a.side * (1 - fw);
  // (sideways lean and head turn are in world terms, so they flip back for a mirrored left-hander)
  a.torso.rotation.set(q.lean + lvz * 0.035 - (a.run && sp > 4 ? 0.12 : 0), q.tw, -lvx * 0.03 * a.hand);
  a.R.sh.rotation.set(q.sx, 0, q.sz); a.R.el.rotation.x = q.el; a.R.wr.rotation.x = q.wr;
  a.L.sh.rotation.set(q.lx + (a.swingT < 0 ? Math.sin(a.phase) * 0.45 * run : 0), 0, q.lz); a.L.el.rotation.x = q.le;

  // Eyes on the shuttle; while down the head stays level with the ground instead
  const p = ctx.sh.p, dx = (p.x - a.x) * a.side, dz = (p.z - a.z) * a.side, dy = p.y - a.y - 1.6;
  const pitch = clamp(Math.atan2(dy, Math.hypot(dx, dz)) - q.lean, -0.5, 0.9), yaw = clamp(a.hand * Math.atan2(-dx, -dz) - q.tw, -1.1, 1.1);
  if (a.pun) a.neck.rotation.set(PK.neck, 0, 0);
  else a.neck.rotation.set(pitch + (-0.8 * q.lean - 0.1 - pitch) * fw, yaw * (1 - fw), 0);
  // The bump spins the body round so it sits down with its back to the way it falls (at most ~70°), facing
  // the partner it ran into, then turns back to the net while getting up
  const face = a.side < 0 ? Math.PI : 0;
  if (fw > 0) {
    const d = Math.atan2(a.fdx, a.fdz) - face, twist = clamp(Math.atan2(Math.sin(d), Math.cos(d)), -1.2, 1.2);
    a.g.rotation.set(0, face + twist * fw, 0); a.tilted = true;
  } else if (a.tilted) { a.tilted = false; a.g.rotation.set(0, face, 0); }
  a.g.position.set(a.x, a.y, a.z);
}
// The fall, in fractions of FALL_T: knocked back with the arms flung out, the knees give and it sits down hard
// catching itself on its hands, then rolls forward into a crouch and stands back up into the ready stance.
// p: arm and torso pose (same keys as READY; lean > 0 is backwards), th/kn: thigh and knee angle of each leg
const FALL_KEYS = [
  { u: 0.08, p: { sx: 1.7, sz: 1.15, el: 0.7, wr: 0.3, lx: 1.5, lz: -1.15, le: 0.6, tw: 0.25, lean: 0.4 }, th: [0.25, -0.15], kn: [-0.55, -0.25] },
  { u: 0.18, p: { sx: 0.6, sz: 1.0, el: 0.4, wr: 0.1, lx: 0.4, lz: -1.0, le: 0.4, tw: 0.2, lean: 0.5 }, th: [0.9, 1.1], kn: [-1.3, -1.6] },
  { u: 0.30, p: { sx: -0.55, sz: 0.65, el: 0.25, wr: 0, lx: -0.65, lz: -0.65, le: 0.25, tw: 0.1, lean: 0.6 }, th: [1.5, 2.1], kn: [-0.4, -2.3] },
  { u: 0.36, p: { sx: -0.7, sz: 0.6, el: 0.15, wr: 0, lx: -0.8, lz: -0.6, le: 0.15, tw: 0.05, lean: 0.78 }, th: [1.6, 2.2], kn: [-0.3, -2.4] },
  { u: 0.48, p: { sx: -0.6, sz: 0.6, el: 0.2, wr: 0, lx: -0.7, lz: -0.6, le: 0.2, tw: 0, lean: 0.68 }, th: [1.65, 2.25], kn: [-0.35, -2.45] },
  { u: 0.66, p: { sx: 0.7, sz: 0.45, el: 1.0, wr: 0.3, lx: 0.6, lz: -0.5, le: 1.0, tw: 0, lean: -0.65 }, th: [1.9, 1.7], kn: [-2.5, -2.4] },
  { u: 0.84, p: { ...READY, lean: -0.32 }, th: [0.85, 0.75], kn: [-1.45, -1.35] },
  { u: 1.00, p: READY, th: [0.32, 0.32], kn: [-0.62, -0.62] },
];
const fallU = a => a.fallT > 0 ? clamp(1 - a.fallT / FALL_T, 0, 1) : -1;
// How far down the body is, for blending the twist and head: drops in quickly, back up over the last 40%
const fallWeight = u => u < 0 ? 0 : u < 0.2 ? ease(u / 0.2) : u < 0.6 ? 1 : 1 - ease((u - 0.6) / 0.4);
const FK = { p: {}, th: [0, 0], kn: [0, 0] };
function fallKey(u) {
  const K = FALL_KEYS; let i = 0;
  while (i < K.length - 1 && K[i + 1].u <= u) i++;
  const A = K[i], B = K[Math.min(i + 1, K.length - 1)], w = u <= A.u || A === B ? 0 : ease((u - A.u) / (B.u - A.u));
  mixPose(FK.p, A.p, B.p, w);
  for (let j = 0; j < 2; j++) { FK.th[j] = A.th[j] + (B.th[j] - A.th[j]) * w; FK.kn[j] = A.kn[j] + (B.kn[j] - A.kn[j]) * w; }
  return FK;
}
function stepBody(a, dt) {
  if (a.y > 0 || a.vy > 0) {
    a.vy -= G * dt; a.y += a.vy * dt;
    if (a.y <= 0) { a.y = 0; a.vy = 0; a.landT = LAND_T; }
  } else if (a.landT > 0) a.landT -= dt;
}
function doJump(a) {
  if (a.y > 0 || a.vy > 0 || a.landT > 0.1 || a.fallT > 0) return;
  a.vy = JUMP_V * (0.72 + 0.28 * a.sta); a.sta = Math.max(0, a.sta - 0.12);
  if (a.armed) a.armT = Math.max(a.armT, 0.42);
  const ev = { k: 'sfx', kind: 'jump' };
  if (S.mode === 'host' && a === ath(me)) ev.g = me; // our own jump sounds at once, also on a late screen (PV)
  emit(ev);
}
function moveAthlete(a, ix, iz, maxSp, dt, arrive) {
  let tx = ix * maxSp, tz = iz * maxSp;
  if (arrive) { const d = Math.hypot(ix, iz); if (d > 0.001) { const sp = Math.min(maxSp, d * 6); tx = ix / d * sp; tz = iz / d * sp; } else { tx = tz = 0; } }
  // Little steering in the air, sluggish for a moment after landing
  const k = Math.min(1, dt * (a.y > 0 ? 1.5 : a.landT > 0 ? 6 : 11));
  a.vx += (tx - a.vx) * k; a.vz += (tz - a.vz) * k;
  a.x = clamp(a.x + a.vx * dt, -3.4, 3.4);
  a.z = a.side > 0 ? clamp(a.z + a.vz * dt, 0.35, 8.2) : clamp(a.z + a.vz * dt, -8.2, -0.35);
}
// Partners who run into each other on the ground both fall over, away from each other
function checkFalls() {
  if (S.state !== 'rally') return;
  for (const t of [0, 1]) {
    const a = ath(t), b = ath(t + 2);
    if (a.fallT > 0 || b.fallT > 0 || a.fallSafe > 0 || b.fallSafe > 0 || a.y > 0.05 || b.y > 0.05) continue;
    const dx = b.x - a.x, dz = b.z - a.z, d = Math.hypot(dx, dz);
    if (d >= FALL_R) continue;
    const nx = d > 1e-4 ? dx / d : 1, nz = d > 1e-4 ? dz / d : 0;
    // Only a real bump: they are moving towards each other, not just standing side by side
    if (d > 1e-4 && (a.vx - b.vx) * nx + (a.vz - b.vz) * nz < FALL_V) continue;
    knockDown(a, -nx, -nz); knockDown(b, nx, nz);
    play('fall');
    emit({ k: 'fall', t }); // names are worded on each screen ("Bạn" is whoever reads it)
  }
}
function knockDown(a, fx, fz) {
  a.fallT = FALL_T; a.fallSafe = FALL_T + FALL_SAFE; a.fdx = fx; a.fdz = fz;
  a.vx = fx * FALL_PUSH; a.vz = fz * FALL_PUSH; a.run = false; a.armed = null; a.holding = false; a.swingT = -1;
}
// Partners can't stand inside each other
function separatePartners() {
  for (const t of [0, 1]) {
    const a = ath(t), b = ath(t + 2), dx = b.x - a.x, dz = b.z - a.z, d = Math.hypot(dx, dz);
    if (d < 0.7 && d > 1e-4) { const k = (0.7 - d) / d / 2; a.x -= dx * k; a.z -= dz * k; b.x += dx * k; b.z += dz * k; }
  }
}

