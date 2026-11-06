/* ---------- shuttle, shadow, marker, trail ---------- */
const shuttle = { p: { x: 0, y: 0.03, z: 2 }, v: { x: 0, y: 0, z: 0 }, mode: 'rest' };
const shMesh = new THREE.Group();
const white = new THREE.MeshStandardMaterial({ color: 0xf6f3ec, roughness: 0.6, side: THREE.DoubleSide });
const cork = new THREE.Mesh(new THREE.SphereGeometry(0.0145, 12, 10), white); shMesh.add(cork);
const band = new THREE.Mesh(new THREE.CylinderGeometry(0.0148, 0.0148, 0.01, 12), new THREE.MeshStandardMaterial({ color: 0xffb547 })); band.position.y = 0.012; shMesh.add(band);
const skirt = new THREE.Mesh(new THREE.CylinderGeometry(0.034, 0.013, 0.062, 16, 1, true), white); skirt.position.y = 0.047; shMesh.add(skirt);
shMesh.scale.setScalar(2.4); shMesh.traverse(o => { o.castShadow = true; }); scene.add(shMesh);
const blob = new THREE.Mesh(new THREE.CircleGeometry(0.12, 20), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.35, depthWrite: false }));
blob.rotation.x = -Math.PI / 2; blob.position.y = 0.012; scene.add(blob);
const ring = new THREE.Mesh(new THREE.RingGeometry(0.2, 0.27, 40), new THREE.MeshBasicMaterial({ color: 0xffb547, transparent: true, opacity: 0.85, depthWrite: false, toneMapped: false }));
ring.rotation.x = -Math.PI / 2; ring.position.y = 0.015; ring.visible = false; scene.add(ring);
// White circle under your own player in doubles, so you can tell yourself from your partner
const meMark = new THREE.Mesh(new THREE.RingGeometry(0.36, 0.42, 40), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.5, depthWrite: false, toneMapped: false }));
meMark.rotation.x = -Math.PI / 2; meMark.position.y = 0.013; meMark.visible = false; scene.add(meMark);
// Trail: a ribbon that always faces the camera, widest and brightest at the shuttle and tapering to nothing
// behind it. Additive, so it glows against the dark hall. A smash leaves a wider, hot orange streak.
const TRAIL = 26, trailPos = new Float32Array(TRAIL * 3);
const ribPos = new Float32Array(TRAIL * 6), ribCol = new Float32Array(TRAIL * 6), ribIdx = [];
for (let i = 0; i < TRAIL - 1; i++) { const a = i * 2; ribIdx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
const trailGeo = new THREE.BufferGeometry();
trailGeo.setAttribute('position', new THREE.BufferAttribute(ribPos, 3));
trailGeo.setAttribute('color', new THREE.BufferAttribute(ribCol, 3));
trailGeo.setIndex(ribIdx);
const trail = new THREE.Mesh(trailGeo, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false,
  blending: THREE.AdditiveBlending, side: THREE.DoubleSide, toneMapped: false, fog: false }));
trail.frustumCulled = false; scene.add(trail);
let trailHot = 0; // 1 for a smash, 0 for every other shot
function resetTrail() { for (let i = 0; i < TRAIL; i++) { trailPos[i * 3] = shuttle.p.x; trailPos[i * 3 + 1] = shuttle.p.y; trailPos[i * 3 + 2] = shuttle.p.z; } }
function pushTrail(p = shuttle.p) { trailPos.copyWithin(3, 0, (TRAIL - 1) * 3); trailPos[0] = p.x; trailPos[1] = p.y; trailPos[2] = p.z; }
const ribP = new THREE.Vector3(), ribD = new THREE.Vector3(), ribS = new THREE.Vector3();
function buildTrail() {
  const h = trailHot, w0 = 0.04 + h * 0.04, lum = 0.5 + h * 0.5, cr = lum, cg = lum * (1 - h * 0.38), cb = lum * (1 - h * 0.75);
  for (let i = 0; i < TRAIL; i++) {
    const j = Math.min(i, TRAIL - 2) * 3;
    ribD.set(trailPos[j + 3] - trailPos[j], trailPos[j + 4] - trailPos[j + 1], trailPos[j + 5] - trailPos[j + 2]);
    ribP.set(trailPos[i * 3], trailPos[i * 3 + 1], trailPos[i * 3 + 2]);
    ribS.subVectors(camera.position, ribP).cross(ribD); // sideways, across the view
    const f = 1 - i / (TRAIL - 1), len = ribS.length();
    if (len > 1e-7) ribS.multiplyScalar(w0 * f / len); else ribS.set(0, 0, 0);
    const o = i * 6, c = f * f;
    ribPos[o] = ribP.x + ribS.x; ribPos[o + 1] = ribP.y + ribS.y; ribPos[o + 2] = ribP.z + ribS.z;
    ribPos[o + 3] = ribP.x - ribS.x; ribPos[o + 4] = ribP.y - ribS.y; ribPos[o + 5] = ribP.z - ribS.z;
    ribCol[o] = ribCol[o + 3] = cr * c; ribCol[o + 1] = ribCol[o + 4] = cg * c; ribCol[o + 2] = ribCol[o + 5] = cb * c;
  }
  trailGeo.attributes.position.needsUpdate = trailGeo.attributes.color.needsUpdate = true;
}
const UP = new THREE.Vector3(0, 1, 0), tmpV = new THREE.Vector3(), LYING = new THREE.Vector3(0.92, 0.38, 0).normalize();

/* ---------- hit feedback: sparks, shock rings, screen shake, hit-stop ---------- */
// Feedback scales with the shot: a drop or net shot puffs a few sparks, a clear adds a light shake, a smash
// adds a bright burst, a shock ring, a hard shake and a short freeze. It is all presentation: the shake moves
// only the rendered camera, and the freeze slows the match clock on the machine that runs the match (LAN
// guests see it in the host's snapshots). prefers-reduced-motion turns off the shake and the freeze.
const FX_TIER = { net: 0, drop: 0, short: 0, long: 1, clear: 1, lift: 1, smash: 2, jsmash: 3 };
// Kept short on purpose: a longer freeze plus a long shake read as the player getting stuck after a jump smash
const FX = [
  { n: 6, speed: 1.6, shake: 0, stop: 0, ring: 0 },
  { n: 10, speed: 2.4, shake: 0.12, stop: 0, ring: 0 },
  { n: 20, speed: 3.6, shake: 0.3, stop: 0.035, ring: 0.9 },
  { n: 28, speed: 4.4, shake: 0.4, stop: 0.05, ring: 1.25 },
];
let trauma = 0, shakeT = 0, stopT = 0, shPop = 0;
const shakeOff = new THREE.Vector3();
// Spark pool: one Points object, 200 particles, faded by darkening their colour (additive: black is invisible)
const PN = 200, pPos = new Float32Array(PN * 3), pCol = new Float32Array(PN * 3), pVel = new Float32Array(PN * 3),
  pBase = new Float32Array(PN * 3), pLife = new Float32Array(PN), pMax = new Float32Array(PN), pGrav = new Float32Array(PN);
let pNext = 0;
const sparkTex = canvasTex(64, 64, (g, w, h) => {
  const r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.3, 'rgba(255,255,255,.6)'); r.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = r; g.fillRect(0, 0, w, h);
});
const sparkGeo = new THREE.BufferGeometry();
sparkGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3));
sparkGeo.setAttribute('color', new THREE.BufferAttribute(pCol, 3));
const sparks = new THREE.Points(sparkGeo, new THREE.PointsMaterial({ size: 0.13, map: sparkTex, vertexColors: true, transparent: true,
  depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, fog: false }));
sparks.frustumCulled = false; scene.add(sparks);
function spawnSparks(x, y, z, n, speed, col, o = {}) {
  const up = o.up || 0, life = o.life || 0.4, grav = o.grav ?? 5, dir = o.dir;
  for (let k = 0; k < n; k++) {
    const i = pNext; pNext = (pNext + 1) % PN;
    // Random direction, pushed up for dust and partly along the shuttle's new flight for hits
    let dx = Math.random() * 2 - 1, dy = Math.random() * 2 - 1 + up, dz = Math.random() * 2 - 1;
    const l = Math.hypot(dx, dy, dz) || 1, s = speed * (0.35 + Math.random() * 0.65);
    dx = dx / l * s; dy = dy / l * s; dz = dz / l * s;
    if (dir) { dx += dir.x * 0.25; dy += dir.y * 0.25; dz += dir.z * 0.25; }
    pPos[i * 3] = x; pPos[i * 3 + 1] = y; pPos[i * 3 + 2] = z;
    pVel[i * 3] = dx; pVel[i * 3 + 1] = dy; pVel[i * 3 + 2] = dz;
    const c = Array.isArray(col[0]) ? col[k % col.length] : col;
    pBase[i * 3] = c[0]; pBase[i * 3 + 1] = c[1]; pBase[i * 3 + 2] = c[2];
    pMax[i] = pLife[i] = life * (0.6 + Math.random() * 0.4); pGrav[i] = grav;
  }
}
// Shock rings: a small pool of flat rings that grow and fade in a quarter of a second
const shocks = [0, 1, 2, 3].map(() => {
  const m = new THREE.Mesh(new THREE.RingGeometry(0.86, 1, 48), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0,
    depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, toneMapped: false, fog: false }));
  m.visible = false; scene.add(m);
  return { m, t: 1, dur: 0.25, size: 1, a: 1 };
});
let shockNext = 0;
const Z_AXIS = new THREE.Vector3(0, 0, 1);
function shock(x, y, z, size, color, a, dir) {
  const s = shocks[shockNext]; shockNext = (shockNext + 1) % shocks.length;
  s.m.position.set(x, y, z); s.m.material.color.setHex(color); s.t = 0; s.size = size; s.a = a; s.m.visible = true;
  if (dir) { tmpV.set(dir.x, dir.y, dir.z).normalize(); s.m.quaternion.setFromUnitVectors(Z_AXIS, tmpV); } // facing the flight
  else s.m.quaternion.setFromAxisAngle(tmpV.set(1, 0, 0), -Math.PI / 2); // flat on the floor
}
const WARM = [[1, 0.78, 0.42], [1, 0.62, 0.25], [1, 0.95, 0.85]], COOL = [[0.8, 0.86, 0.95], [0.95, 0.97, 1]], DUST = [[0.42, 0.36, 0.3], [0.5, 0.46, 0.4]];
function fxEvent(ev) {
  const shake = amt => { if (!reduceMotion) trauma = Math.min(1, trauma + amt); };
  if (ev.kind === 'hit') {
    if (ev.type === 'jsmash') shout();
    const tier = FX_TIER[ev.type] ?? 0, P = FX[tier], dir = { x: ev.vx || 0, y: ev.vy || 0, z: ev.vz || 0 };
    spawnSparks(ev.x, ev.y, ev.z, P.n, P.speed, tier >= 2 ? WARM : COOL, { dir, life: tier >= 2 ? 0.45 : 0.32, grav: 4 });
    if (P.ring) shock(ev.x, ev.y, ev.z, P.ring, 0xffc070, 0.9, dir);
    trailHot = tier >= 2 ? 1 : 0; shPop = 1;
    shake(P.shake);
    // (not for a LAN guest's hit: the host takes it in after the fact, and the guest has already drawn it at full speed)
    // (nor while the host plays guests over the network: every screen there shows the match at its own moment)
    if (P.stop && !reduceMotion && S.mode !== 'guest' && ev.g == null && !PV.on) stopT = Math.max(stopT, P.stop);
  } else if (ev.kind === 'land') {
    spawnSparks(ev.x, 0.04, ev.z, 12, 1.3, DUST, { up: 1.4, life: 0.55, grav: 3 });
    shock(ev.x, 0.02, ev.z, 0.55, 0xdde6ee, 0.5);
    shake(0.1);
  } else if (ev.kind === 'net') {
    spawnSparks(ev.x, ev.y, ev.z, 8, 1.2, COOL, { life: 0.3, grav: 3 });
    shake(0.12);
  }
}
// Called every rendered frame with real (unfrozen) time
function fxTick(dt) {
  for (let i = 0; i < PN; i++) {
    if (pLife[i] <= 0) continue;
    pLife[i] -= dt;
    const o = i * 3;
    if (pLife[i] <= 0) { pCol[o] = pCol[o + 1] = pCol[o + 2] = 0; continue; }
    const drag = Math.exp(-dt * 3.5);
    pVel[o] *= drag; pVel[o + 1] = pVel[o + 1] * drag - pGrav[i] * dt; pVel[o + 2] *= drag;
    pPos[o] += pVel[o] * dt; pPos[o + 1] = Math.max(0.01, pPos[o + 1] + pVel[o + 1] * dt); pPos[o + 2] += pVel[o + 2] * dt;
    const k = pLife[i] / pMax[i], f = k * k;
    pCol[o] = pBase[o] * f; pCol[o + 1] = pBase[o + 1] * f; pCol[o + 2] = pBase[o + 2] * f;
  }
  sparkGeo.attributes.position.needsUpdate = sparkGeo.attributes.color.needsUpdate = true;
  for (const s of shocks) {
    if (!s.m.visible) continue;
    s.t += dt / s.dur;
    if (s.t >= 1) { s.m.visible = false; continue; }
    const e = 1 - (1 - s.t) * (1 - s.t) * (1 - s.t); // ease-out cubic: bursts out, then settles
    s.m.scale.setScalar(0.08 + s.size * e); s.m.material.opacity = s.a * (1 - s.t) * (1 - s.t);
  }
  // The shuttle swells for an instant when struck and springs back
  shPop = Math.max(0, shPop - dt * 7);
  shMesh.scale.setScalar(2.4 * (1 + 0.55 * shPop * shPop));
  trauma = Math.max(0, trauma - dt * 2.8); shakeT += dt; // the hardest shake is over in about 0.15 s
}
// Shake = trauma²: light hits barely move the view, smashes punch. Smooth sines, not random jitter.
// Applied to the camera just for the render, so the camera's own follow smoothing never sees it.
function shakeOn() {
  if (trauma <= 0) return false;
  const s = trauma * trauma, t = shakeT * 20;
  shakeOff.set(0.22 * s * Math.sin(t * 1.7), 0.15 * s * Math.sin(t * 2.3 + 1), 0.08 * s * Math.sin(t * 1.3 + 2));
  camera.position.add(shakeOff); camera.rotateZ(0.018 * s * Math.sin(t * 1.1 + 0.5));
  return true;
}

