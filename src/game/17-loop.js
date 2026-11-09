/* ---------- loop ---------- */
function resize() {
  const w = innerWidth, h = innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  // Landscape uses a 36° lens, tuned at 16:10 so the whole court fits. On narrower windows the lens widens to keep
  // the same width of court on screen (the sidelines are what gets cut first there). Portrait is unchanged.
  const a = camera.aspect, TAN18 = Math.tan(18 * Math.PI / 180);
  camera.fov = a < 1 ? 50 + (1 - a) * 46 : a >= 1.6 ? 36 : 2 * Math.atan(TAN18 * 1.6 / a) * 180 / Math.PI;
  camera.updateProjectionMatrix();
}
addEventListener('resize', resize); resize();

const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
let last = performance.now(), acc = 0, clock = 0, shownSta = -1;
function update(dt) {
  readInput(dt);
  const playing = S.state === 'rally' || S.state === 'point', D = DIFF[S.diff];
  for (let i = 0; i < S.n; i++) {
    const a = ath(i);
    stepBody(a, dt);
    // On the floor: knocked back, sliding to a stop; nobody steers until back up (a guest's own position reports wait too)
    if (a.fallT > 0) {
      const k = Math.exp(-dt * 7); a.vx *= k; a.vz *= k; a.run = false;
      a.x = clamp(a.x + a.vx * dt, -3.4, 3.4);
      a.z = a.side > 0 ? clamp(a.z + a.vz * dt, 0.35, 8.2) : clamp(a.z + a.vz * dt, -8.2, -0.35);
      continue;
    }
    if (isHuman(i)) {
      const w = worldInput(i), r = i === me ? null : remoteIn[i];
      a.run = playing && w.run && !a.tired && Math.hypot(w.x, w.z) > 0.2;
      // Outside a rally the host places everyone (serve positions); the guest's next position report starts fresh
      if (r && !playing) { r.pos = false; r.buf.length = 0; r.prevRt = null; }
      if (r && r.pos && r.buf.length) {
        // A guest moves its own player on its machine and reports it every frame. It is drawn a little in the
        // past, between two reports already here, so late or bunched reports don't make it jump (see netClock)
        clockTick(r.clk, dt);
        const rt = last - r.clk.D, [A, B] = netPair(r.buf, rt), q = between(A.t, A.d, B ? B.t : 0, B && B.d, rt, 0.1), c = inHalf(a, q[0], q[1]);
        netPlace(a, c.x, c.z, q[2], q[3], dt, r.prevRt == null ? dt : clamp((rt - r.prevRt) / 1000, 0, 0.1)); r.prevRt = rt;
      } else { a.nRaw = null; moveAthlete(a, playing ? w.x : 0, playing ? w.z : 0, a.run ? RUN_SP : WALK_SP, dt, false); }
      continue;
    }
    a.run = false;
    if (S.state !== 'rally') { moveAthlete(a, 0, 0, 5, dt, false); continue; }
    let tx = 0, tz = a.side * 3.6;
    if (a.plan) {
      if (a.delay > 0) { a.delay -= dt; tx = a.x; tz = a.z; } else { tx = a.plan.x; tz = a.plan.z; }
      if (a.plan.jumpAt != null && S.flightT >= a.plan.jumpAt) { a.plan.jumpAt = null; doJump(a); }
    }
    moveAthlete(a, tx - a.x, tz - a.z, D.speed * (S.lastTeam === team(i) ? 0.7 : 1), dt, true);
  }
  if (S.n === 4) { checkFalls(); separatePartners(); }

  for (let i = 0; i < S.n; i++) {
    const a = ath(i);
    a.cool -= dt;
    if (a.fallT > 0) a.fallT = Math.max(0, a.fallT - dt);
    if (a.fallSafe > 0) a.fallSafe -= dt;
    if (a.armed && !a.holding) { a.armT -= dt; if (a.armT <= 0) a.armed = null; }
    // Running drains stamina; once empty you walk until it is back to 30%
    a.sta = clamp(a.sta + (a.run ? -0.3 : 0.16) * dt, 0, 1);
    if (a.sta <= 0) a.tired = true; else if (a.sta > 0.3) a.tired = false;
  }
  if (shuttle.mode === 'fly') S.flightT += dt;

  if (S.state === 'serve') {
    holdShuttle();
    if (!isHuman(S.server)) { S.timer -= dt; if (S.timer <= 0) launchServe(Math.random() < (S.n === 4 ? 0.25 : 0.6) ? 'long' : 'short'); }
  }
  acc += dt; simWall = last;
  while (acc >= DT) { acc -= DT; physicsStep(DT); tryHits(); }
  S.simT += dt; recordHist(simWall, S.simT);
  checkLanding();
  if (S.state === 'point') { S.timer -= dt; if (S.timer <= 0) afterPoint(); }
  pvRecord();
}
function syncVisuals(dt) {
  for (let i = 0; i < S.n; i++) { animateAthlete(ath(i), dt, i); driveModel(ath(i)); }
  // Host: a guest's hit taken back in time moves the shuttle at once; the drawn one slides over instead
  const fv = Math.exp(-dt * 10); shVis.x *= fv; shVis.y *= fv; shVis.z *= fv;
  const p = S.mode === 'host' ? { x: shuttle.p.x + shVis.x, y: Math.max(0.03, shuttle.p.y + shVis.y), z: shuttle.p.z + shVis.z } : shuttle.p;
  shMesh.position.set(p.x, p.y, p.z);
  if (shuttle.mode === 'fly') {
    const sp = Math.hypot(shuttle.v.x, shuttle.v.y, shuttle.v.z);
    if (sp > 0.3) { tmpV.set(-shuttle.v.x / sp, -shuttle.v.y / sp, -shuttle.v.z / sp); shMesh.quaternion.setFromUnitVectors(UP, tmpV); }
    if (stopT <= 0) pushTrail(p); // frozen: keep the streak as it was instead of shrinking it onto the shuttle
  } else if (shuttle.mode === 'held') { shMesh.quaternion.set(0, 0, 0, 1); resetTrail(); }
  else shMesh.quaternion.setFromUnitVectors(UP, LYING);
  trail.visible = shuttle.mode === 'fly';
  if (trail.visible) buildTrail();
  blob.position.x = p.x; blob.position.z = p.z;
  blob.scale.setScalar(1 + p.y * 0.18); blob.material.opacity = 0.35 / (1 + p.y * 0.35);
  if (ring.visible && !reduceMotion) ring.scale.setScalar(1 + Math.sin(clock * 8) * 0.08);

  if (S.mode === 'watch') {
    // Spectator seat behind the near baseline, centred on the court
    const portrait = camera.aspect < 0.9, k = 1 - Math.exp(-dt * 3);
    camera.position.x += (0 - camera.position.x) * k;
    camera.position.y += ((portrait ? 8.6 : 6.0) - camera.position.y) * k;
    camera.position.z += ((portrait ? 14.2 : 15.6) - camera.position.z) * k;
    look.x += (0 - look.x) * k; look.y += ((portrait ? 0.6 : 0) - look.y) * k; look.z += ((portrait ? -0.6 : 1.0) - look.z) * k;
    camera.lookAt(look); meMark.visible = false;
    return;
  }
  const mine = ath(me), s = mine.side;
  meMark.visible = S.n === 4 && S.state !== 'menu';
  meMark.position.x = mine.x; meMark.position.z = mine.z;
  const portrait = camera.aspect < 0.9;
  // Landscape: a long lens (see resize) from 15.6 m back and 6 m up, so the court fills the screen while your own
  // baseline (and you, standing behind it) stays above the key hints and a high smash at the far end still fits.
  // The camera looks down at about 21°, close to the original 22°, so depth reads the same.
  const ty = portrait ? 7.6 : 6.0, tz = portrait ? 13.2 : 15.6, k = 1 - Math.exp(-dt * 3);
  const sway = S.state === 'menu' && !reduceMotion ? Math.sin(clock * 0.25) * 0.8 : 0;
  // The losers acting out their punishment (18-punishment): every screen moves in to watch them from the front and
  // to the side, on their own half so the net isn't in the way
  if (pun && !pun.done) {
    const L = members(pun.lose).map(ath), fx = L.reduce((t, a) => t + a.x, 0) / L.length, fz = L.reduce((t, a) => t + a.z, 0) / L.length, ls = L[0].side;
    const d = portrait ? 1.35 : 1;
    camera.position.x += (fx + 3.4 * d - camera.position.x) * k; camera.position.y += (1.9 - camera.position.y) * k;
    camera.position.z += (fz - ls * 1.9 * d - camera.position.z) * k;
    look.x += (fx - look.x) * k; look.y += (0.55 - look.y) * k; look.z += (fz - look.z) * k;
    camera.lookAt(look); return;
  }
  camera.position.x += (mine.x * (portrait ? 0.25 : 0.35) + sway - camera.position.x) * k;
  camera.position.y += (ty - camera.position.y) * k;
  camera.position.z += (s * tz - camera.position.z) * k;
  look.x += (mine.x * 0.15 - look.x) * k; look.y += ((portrait ? 0.4 : 0) - look.y) * k; look.z += (s * (portrait ? -1.2 : 1.0) - look.z) * k;
  camera.lookAt(look);
}
function frame(now) {
  requestAnimationFrame(frame);
  const raw = now - last, dt = Math.min(0.05, raw / 1000); last = now; clock += dt;
  tuneGfx(raw, now);
  const active = S.state === 'serve' || S.state === 'rally' || S.state === 'point';
  // Hit-stop: for a few hundredths of a second after a smash the match runs at a quarter speed (counted in real time)
  const simDt = stopT > 0 ? dt * 0.25 : dt;
  if (stopT > 0) stopT -= dt;
  if (S.mode === 'guest') guestTick(dt);
  else if (active && !S.paused) update(simDt);
  // A backed-up connection gets no more snapshots until it drains: one fresh snapshot beats a queue of stale ones
  if (S.mode === 'host' && now - lastSent > 14 && !(ws && ws.bufferedAmount > 16384)) { lastSent = now; send(snapshot()); }
  if (S.mode === 'host' && S.state !== 'menu' && now - lastSum > 100) { lastSum = now; send(summary()); }
  const credit = (overlayOpen() || !$('pause').hidden) && !$('custom').classList.contains('open');
  if (credit === $('credit').hidden) $('credit').hidden = !credit;
  updatePower(dt);
  punTick(dt);
  if ((roomsT -= dt) <= 0) { roomsT = 2; refreshRooms(); }
  const st = ath(me).sta;
  if (Math.abs(st - shownSta) > 0.004) { shownSta = st; $('staBar').style.transform = `scaleX(${st})`; $('sta').classList.toggle('low', st < 0.3); }
  if (!pvFrame(S.paused ? 0 : simDt)) syncVisuals(S.paused ? 0 : simDt);
  fxTick(S.paused ? 0 : dt);
  updateGhosts(dt);
  const shaking = shakeOn();
  renderer.render(scene, camera);
  if (shaking) camera.position.sub(shakeOff); // syncVisuals' lookAt resets the roll next frame
  renderPreview();
}

readMenu(); placeBackdrop(); renderKeyHints();
if (window.SAN7_LAN) renderCourts();
if (document.fonts && document.fonts.load) document.fonts.load('700 150px "Chakra Petch"').then(drawSigns).catch(() => {});

// Compile every shader up front, hidden objects included (shock rings, the landing marker, doubles players),
// so the first smash or first doubles point never waits on the GPU driver mid-rally.
function warmShaders() {
  const hidden = [];
  scene.traverse(o => { if (!o.visible) { hidden.push(o); o.visible = true; } });
  try { renderer.compile(scene, camera); } catch (e) {}
  for (const o of hidden) o.visible = false;
}
function start(data) {
  warmShaders();
  loadCharacters();
  if (data && data.started && Array.isArray(data.score)) {
    setFormat(data.fmt || 'don'); setCourt(data.court || 0);
    Object.assign(S, { diff: data.diff || 'vua', score: data.score, games: data.games, server: data.server, right: data.right || [0, 1], gameNo: data.gameNo, history: data.history || [], best: data.best || 0, showMarker: data.showMarker !== false });
    $('menu').hidden = true; setupServe(); setPaused(true);
  }
  updateHUD();
  requestAnimationFrame(t => { last = t; frame(t); });
}
window.claude?.hot?.snapshot?.(() => ({ started: S.mode === 'ai' && S.state !== 'menu' && S.state !== 'over', diff: S.diff, fmt: S.fmt, court: S.court, score: S.score, games: S.games, server: S.server, right: S.right, gameNo: S.gameNo, history: S.history, best: S.best, showMarker: S.showMarker }));
window.claude?.hot?.ready ? window.claude.hot.ready(start) : start(window.claude?.hot?.data ?? {});
