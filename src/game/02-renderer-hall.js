/* ---------- renderer & scene ---------- */
const canvas = $('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.outputEncoding = THREE.sRGBEncoding;
renderer.shadowMap.enabled = true; // resolution and shadow quality are set by applyGfx below
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0d1b29);
scene.fog = new THREE.Fog(0x0d1b29, 22, 46);
const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
camera.position.set(0, 5, 12.4);
const look = new THREE.Vector3(0, 0.9, -2.2);

const hemi = new THREE.HemisphereLight(0xe6eeff, 0x40301f, 0.7); scene.add(hemi);
const sun = new THREE.DirectionalLight(0xfff4e4, 0.85);
sun.position.set(3, 14, 5); sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -9, right: 9, top: 11, bottom: -11, near: 1, far: 40 });
sun.shadow.bias = -0.0005;
scene.add(sun);
const fill = new THREE.DirectionalLight(0xbcd6ff, 0.3); fill.position.set(-5, 8, -8); scene.add(fill);

/* ---------- graphics quality ---------- */
// Measured on an M1 Pro: drawing the frame costs the GPU ~7.8 ms at 2× resolution and ~4.6 ms at 1×, while the
// game logic costs ~1 ms. So quality is mostly resolution. 'auto' starts sharp and, while frames keep running
// slower than ~50 FPS, steps the resolution down by 0.25 (never back up in the same session, so it cannot flicker).
const GFX_KEY = 'san7-gfx', FPS_KEY = 'san7-fps', DPR = window.devicePixelRatio || 1;
const GFX_ORDER = ['auto', 'cao', 'vua', 'thap'];
const GFX_NAMES = { auto: 'Tự động', cao: 'Cao', vua: 'Vừa', thap: 'Thấp' };
const GFX_PRESETS = { auto: { pr: 2, shadow: 2048, soft: true }, cao: { pr: 2, shadow: 2048, soft: true }, vua: { pr: 1.5, shadow: 2048, soft: false }, thap: { pr: 1, shadow: 1024, soft: false } };
const gfx = { mode: 'auto', pr: 1, hold: 0, sum: 0, n: 0, show: false, fSum: 0, fN: 0, fT: 0 };
try { const v = localStorage.getItem(GFX_KEY); if (GFX_NAMES[v]) gfx.mode = v; gfx.show = localStorage.getItem(FPS_KEY) === '1'; } catch (e) {}
function applyGfx() {
  const p = GFX_PRESETS[gfx.mode];
  gfx.pr = Math.min(DPR, p.pr);
  renderer.setPixelRatio(gfx.pr);
  const type = p.soft ? THREE.PCFSoftShadowMap : THREE.PCFShadowMap;
  if (renderer.shadowMap.type !== type) {
    renderer.shadowMap.type = type;
    scene.traverse(o => { if (o.material) [].concat(o.material).forEach(m => { m.needsUpdate = true; }); }); // rebuild shaders for the new filter
  }
  if (sun.shadow.mapSize.x !== p.shadow) {
    sun.shadow.mapSize.set(p.shadow, p.shadow);
    if (sun.shadow.map) { sun.shadow.map.dispose(); sun.shadow.map = null; }
  }
  gfx.hold = performance.now() + 3000; gfx.sum = gfx.n = 0; // let the new setting settle before judging it
  gfxLabels();
}
function gfxLabels() {
  const t = `Đồ hoạ: ${GFX_NAMES[gfx.mode]}`;
  for (const id of ['btnGfx', 'btnPauseGfx']) { const b = $(id); if (b) b.textContent = t; }
  $('fpsMeter').hidden = !gfx.show;
}
function cycleGfx() {
  gfx.mode = GFX_ORDER[(GFX_ORDER.indexOf(gfx.mode) + 1) % GFX_ORDER.length];
  try { localStorage.setItem(GFX_KEY, gfx.mode); } catch (e) {}
  applyGfx();
}
function toggleFps() {
  gfx.show = !gfx.show; gfx.fSum = gfx.fN = 0;
  try { localStorage.setItem(FPS_KEY, gfx.show ? '1' : '0'); } catch (e) {}
  gfxLabels();
}
// Called every frame with the real time since the last one (ms)
function tuneGfx(ms, now) {
  if (ms <= 0) return;
  if (gfx.show) {
    gfx.fSum += ms; gfx.fN++;
    if (now - gfx.fT > 500) {
      $('fpsMeter').textContent = `${Math.round(1000 * gfx.fN / gfx.fSum)} FPS · ${(gfx.fSum / gfx.fN).toFixed(1)} ms · ${GFX_NAMES[gfx.mode]} ×${gfx.pr}${netInfo()}`;
      gfx.fSum = gfx.fN = 0; gfx.fT = now;
    }
  }
  if (gfx.mode !== 'auto' || gfx.pr <= 1 || now < gfx.hold) return;
  // A stall or a hidden tab says nothing about how heavy the drawing is
  if (ms > 250 || document.hidden) { gfx.sum = gfx.n = 0; return; }
  gfx.sum += ms; gfx.n++;
  if (gfx.sum < 2000) return;
  if (gfx.sum / gfx.n > 20) { gfx.pr = Math.max(1, gfx.pr - 0.25); renderer.setPixelRatio(gfx.pr); gfx.hold = now + 3000; }
  gfx.sum = gfx.n = 0;
}
applyGfx();

function canvasTex(w, h, draw) {
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  draw(cv.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(cv);
  t.encoding = THREE.sRGBEncoding; t.anisotropy = renderer.capabilities.getMaxAnisotropy();
  return t;
}

// The hall holds 5 courts side by side. The match is always played at the origin,
// so choosing a court slides the whole hall sideways instead of moving the game.
const COURTS = 5, SPACING = 8.6, HALL_W = COURTS * SPACING + 8;
const hallG = new THREE.Group(); scene.add(hallG);

// Hall floor: maple planks
const wood = canvasTex(512, 512, (g, w, h) => {
  const n = 8, ph = h / n;
  for (let i = 0; i < n; i++) {
    const l = 36 + Math.random() * 9;
    g.fillStyle = `hsl(28,42%,${l}%)`; g.fillRect(0, i * ph, w, ph);
    for (let k = 0; k < 40; k++) { g.fillStyle = `hsla(28,40%,${l - 9}%,.2)`; g.fillRect(Math.random() * w, i * ph + Math.random() * ph, 40 + Math.random() * 120, 1.5); }
    g.fillStyle = 'rgba(0,0,0,.28)'; g.fillRect(0, i * ph, w, 2); g.fillRect(Math.random() * w, i * ph, 2, ph);
  }
});
wood.wrapS = wood.wrapT = THREE.RepeatWrapping; wood.repeat.set(HALL_W / 4, 8);
const floor = new THREE.Mesh(new THREE.PlaneGeometry(HALL_W, 32), new THREE.MeshStandardMaterial({ map: wood, roughness: 0.42 })); // varnished: catches the lamps
floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; hallG.add(floor);

// Court mat with full BWF line markings (singles + doubles)
const MAT_W = 7.6, MAT_L = 15, PX = 128;
const courtTex = canvasTex(Math.round(MAT_W * PX), Math.round(MAT_L * PX), (g, w, h) => {
  g.fillStyle = '#1c6a4f'; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 9000; i++) { g.fillStyle = Math.random() < .5 ? 'rgba(0,0,0,.05)' : 'rgba(255,255,255,.03)'; g.fillRect(Math.random() * w, Math.random() * h, 2, 2); }
  const X = x => (x + MAT_W / 2) * PX, Z = z => (z + MAT_L / 2) * PX, lw = 0.04 * PX;
  g.fillStyle = '#eef2ee';
  const vline = (x, z0, z1) => g.fillRect(X(x) - lw / 2, Z(z0) - lw / 2, lw, Z(z1) - Z(z0) + lw);
  const hline = (z, x0, x1) => g.fillRect(X(x0) - lw / 2, Z(z) - lw / 2, X(x1) - X(x0) + lw, lw);
  for (const s of [-1, 1]) {
    vline(s * C.doublesX, -C.baseZ, C.baseZ); vline(s * C.singlesX, -C.baseZ, C.baseZ);
    hline(s * C.baseZ, -C.doublesX, C.doublesX); hline(s * C.longDZ, -C.doublesX, C.doublesX); hline(s * C.shortZ, -C.doublesX, C.doublesX);
  }
  vline(0, -C.baseZ, -C.shortZ); vline(0, C.shortZ, C.baseZ);
});
const matMat = new THREE.MeshStandardMaterial({ map: courtTex, roughness: 0.78 });
const netTex = canvasTex(64, 64, (g, w, h) => { g.strokeStyle = 'rgba(16,20,24,.95)'; g.lineWidth = 4; g.strokeRect(0, 0, w, h); });
netTex.wrapS = netTex.wrapT = THREE.RepeatWrapping; netTex.repeat.set(6.1 / 0.06, 0.76 / 0.06);
const netMat = new THREE.MeshBasicMaterial({ map: netTex, transparent: true, side: THREE.DoubleSide, depthWrite: false });
const tapeMat = new THREE.MeshStandardMaterial({ color: 0xf4f4f0, roughness: 0.6 });
const postMat = new THREE.MeshStandardMaterial({ color: 0x24443a, roughness: 0.5 });
const lampMat = new THREE.MeshBasicMaterial({ color: 0xfff2d4, toneMapped: false });
const courtX = i => (i - (COURTS - 1) / 2) * SPACING;
const signs = [], courtG = [];
for (let i = 0; i < COURTS; i++) {
  const cg = new THREE.Group(); cg.position.x = courtX(i); hallG.add(cg); courtG.push(cg);
  const mat = new THREE.Mesh(new THREE.PlaneGeometry(MAT_W, MAT_L), matMat);
  mat.rotation.x = -Math.PI / 2; mat.position.y = 0.004; mat.receiveShadow = true; cg.add(mat);
  const net = new THREE.Mesh(new THREE.PlaneGeometry(6.1, 0.76), netMat);
  net.position.set(0, C.netH - 0.38, 0); cg.add(net);
  const tape = new THREE.Mesh(new THREE.BoxGeometry(6.1, 0.07, 0.014), tapeMat);
  tape.position.set(0, C.netH - 0.035, 0); tape.castShadow = true; cg.add(tape);
  for (const s of [-1, 1]) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, C.netH, 12), postMat);
    post.position.set(s * C.doublesX, C.netH / 2, 0); post.castShadow = true; cg.add(post);
    const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.15, 0.06, 18), postMat);
    foot.position.set(s * C.doublesX, 0.03, 0); cg.add(foot);
  }
  for (let z = -12; z <= 12; z += 4) for (const x of [-2.2, 2.2]) {
    const lamp = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.08, 0.45), lampMat); lamp.position.set(x, 9.7, z); cg.add(lamp);
  }
  // Court number board on both end walls
  const tex = canvasTex(1024, 256, () => {});
  const sg = new THREE.Mesh(new THREE.PlaneGeometry(6.4, 1.6), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }));
  sg.position.set(0, 4.4, -15.9); cg.add(sg);
  const sg2 = sg.clone(); sg2.position.z = 15.9; sg2.rotation.y = Math.PI; cg.add(sg2);
  signs.push(tex);
}

// Hall shell and venue banner
// Walls: 4 m acoustic panels, darker towards the unlit ceiling, with a lighter band at eye level
const wallTex = canvasTex(256, 640, (g, w, h) => {
  const gr = g.createLinearGradient(0, 0, 0, h);
  gr.addColorStop(0, '#08121c'); gr.addColorStop(0.45, '#12263a'); gr.addColorStop(0.8, '#1a3550'); gr.addColorStop(1, '#152c42');
  g.fillStyle = gr; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 26; i++) { g.fillStyle = i % 2 ? 'rgba(255,255,255,.025)' : 'rgba(0,0,0,.06)'; g.fillRect(8 + i * 9.5, h * 0.32, 6, h * 0.52); } // slats
  g.fillStyle = 'rgba(0,0,0,.45)'; g.fillRect(0, 0, 3, h); g.fillRect(0, h * 0.32 - 2, w, 3); g.fillRect(0, h * 0.84, w, 3); // panel seams
  g.fillStyle = 'rgba(120,170,210,.10)'; g.fillRect(0, h * 0.84 + 3, w, 4); // light catching the bottom edge
});
wallTex.wrapS = THREE.RepeatWrapping;
const wallLong = wallTex, wallEnd = wallTex.clone(); wallEnd.needsUpdate = true;
wallLong.repeat.set(HALL_W / 4, 1); wallEnd.repeat.set(32 / 4, 1);
const wallMat = t => new THREE.MeshStandardMaterial({ map: t, roughness: 0.92, side: THREE.BackSide });
const ceilMat = new THREE.MeshStandardMaterial({ color: 0x070d14, roughness: 1, side: THREE.BackSide });
// Box faces: +x, -x, +y (ceiling), -y (under the floor), +z, -z
const hall = new THREE.Mesh(new THREE.BoxGeometry(HALL_W, 10, 32), [wallMat(wallEnd), wallMat(wallEnd), ceilMat, ceilMat, wallMat(wallLong), wallMat(wallLong)]);
hall.position.y = 4.98; hallG.add(hall);
const kick = new THREE.Mesh(new THREE.BoxGeometry(HALL_W, 0.9, 0.05), new THREE.MeshStandardMaterial({ color: 0x13283b, roughness: 0.9 }));
kick.position.set(0, 0.45, -15.95); hallG.add(kick);
const kick2 = kick.clone(); kick2.position.z = 15.95; hallG.add(kick2);
const bannerTex = canvasTex(2048, 256, () => {});
const banner = new THREE.Mesh(new THREE.PlaneGeometry(16, 2), new THREE.MeshBasicMaterial({ map: bannerTex, toneMapped: false }));
banner.position.set(0, 7.6, -15.9); hallG.add(banner);
const banner2 = banner.clone(); banner2.position.z = 15.9; banner2.rotation.y = Math.PI; hallG.add(banner2);

/* ---------- look: tone mapping, light reflected from the hall, a lamp over the match court ---------- */
// ACES tone mapping rolls bright areas off like film instead of clipping them. Signs, banner, lamps and
// the on-court markers opt out (toneMapped: false) so they keep their exact colours.
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
// Image-based light: a small stand-in hall (dark walls, wood floor, rows of bright ceiling lamps) is
// rendered once into a blurred environment map. Every MeshStandardMaterial then picks up soft light and
// reflections from it: a sheen on the varnished floor, highlights on rackets, shirts and shoes.
{
  const env = new THREE.Scene(), basic = (c, k = 1) => new THREE.MeshBasicMaterial({ color: new THREE.Color(c).multiplyScalar(k), side: THREE.BackSide });
  const room = new THREE.Mesh(new THREE.BoxGeometry(50, 10, 32), [basic(0x12263a), basic(0x12263a), basic(0x070d14), basic(0x6a4a30, 0.6), basic(0x12263a), basic(0x12263a)]);
  room.position.y = 4; env.add(room); // the cube camera sits at the origin, about player height above the floor
  const lamp = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xfff2d4).multiplyScalar(3.5) });
  for (let x = -20; x <= 20; x += 4.3) for (let z = -12; z <= 12; z += 4) {
    const l = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.1, 0.45), lamp); l.position.set(x, 8.6, z); env.add(l);
  }
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(env, 0.04).texture;
  pmrem.dispose();
  env.traverse(o => { if (o.geometry) o.geometry.dispose(); });
}
// The environment now supplies most of the fill, so the old flat fill lights step back
hemi.intensity = 0.26; fill.intensity = 0.15; sun.intensity = 0.6;
// One soft lamp right above the match court (the match is always at the origin): the court you play on is
// a pool of light and the neighbouring courts and walls fall off into the dark, which gives the scene depth.
const courtLamp = new THREE.SpotLight(0xfff1dc, 1.5, 34, 0.56, 0.9, 1);
courtLamp.position.set(0, 13, 0); courtLamp.target.position.set(0, 0, 0);
scene.add(courtLamp, courtLamp.target);
// Format shown on the chosen court's board: the watched match while watching, otherwise your own
const shownN = () => S.mode === 'watch' && GC[S.court] ? GC[S.court].n : S.n;
function drawSigns() {
  const font = (w, px) => `${w} ${px}px "Chakra Petch", "Arial Narrow", sans-serif`;
  signs.forEach((tex, i) => {
    const g = tex.image.getContext('2d'), on = i === S.court;
    g.fillStyle = on ? '#10222f' : '#0e1c27'; g.fillRect(0, 0, 1024, 256);
    g.textBaseline = 'middle';
    g.fillStyle = on ? '#ffb547' : '#55707c'; g.font = font(700, 150); g.fillText(`SÂN ${i + 1}`, 48, 136);
    g.fillStyle = on ? '#9db1b6' : '#3d5560'; g.font = font(600, 38);
    g.fillText('CẦU LÔNG · ' + (on ? (shownN() === 4 ? 'ĐÁNH ĐÔI' : 'ĐÁNH ĐƠN') : 'TỰ DO'), 560, 108, 440);
    g.fillText(on ? '21 ĐIỂM · 3 VÁN' : 'NHÀ THI ĐẤU TERRALOGIC', 560, 162, 440);
    tex.needsUpdate = true;
  });
  const g = bannerTex.image.getContext('2d');
  g.fillStyle = '#10222f'; g.fillRect(0, 0, 2048, 256);
  g.fillStyle = '#eef3f1'; g.font = font(700, 150); g.textBaseline = 'middle'; g.textAlign = 'center';
  g.fillText('SÂN CẦU TERRALOGIC', 1024, 136, 1960); g.textAlign = 'left';
  bannerTex.needsUpdate = true;
}
function setCourt(i) { S.court = clamp(i | 0, 0, COURTS - 1); hallG.position.x = -courtX(S.court); drawSigns(); updateHUD(); }

