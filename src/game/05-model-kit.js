// Clothes painted on the body by a shader: shirt, shorts, socks and shoes by height on the rest pose,
// with the muscle detail of the normal map flattened under fabric and a duller, rougher surface there.
function kitMaterial(base, kit, u) {
  const m = base.clone();
  m.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, u);
    // Muscular build: before skinning, push the surface out along its normal over the deltoids, biceps,
    // forearms, chest, back, trapezius, thighs and calves (rest-pose model space, metres). The waist, hands
    // and head stay as they are, which gives the V shape.
    sh.vertexShader = `varying vec3 vRest, vRestN;
uniform vec4 uSuit, uArm, uKitA;
float gs(float x, float c, float w) { float t = (x - c) / w; return exp(-t * t); }
float bulk(vec3 p) {
  float ax = abs(p.x), y = p.y, sh = uArm.x, wr = uArm.z, neck = uKitA.x, waist = uKitA.y;
  float armW = smoothstep(sh - 0.06, sh + 0.02, ax) * smoothstep(uArm.w - 0.2, uArm.w - 0.1, y);
  float t = clamp((ax - sh) / (wr - sh), 0.0, 1.0);
  float arm = (0.026 * gs(t, 0.3, 0.2) + 0.015 * gs(t, 0.72, 0.14) + 0.018 * gs(ax, sh + 0.01, 0.075)) * (1.0 - smoothstep(wr - 0.07, wr - 0.025, ax));
  float chest = 0.024 * smoothstep(waist + 0.08, waist + 0.3, y) * (1.0 - smoothstep(neck - 0.06, neck + 0.01, y));
  float traps = 0.014 * gs(y, neck - 0.01, 0.045) * smoothstep(0.03, 0.08, ax);
  float legs = 0.018 * gs(y, waist - 0.22, 0.13) + 0.011 * gs(y, 0.4, 0.08);
  return armW * arm + (1.0 - armW) * (chest + traps + legs);
}
` + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
vRest = position; vRestN = normal;
transformed += normal * bulk(position) * uSuit.w;`);
    sh.fragmentShader = `varying vec3 vRest, vRestN;
uniform vec3 uShirt, uShorts, uSkin, uSock, uShoe, uAcc;
uniform vec4 uKitA, uKitB, uSuit, uArm, uEye;
float band(float lo, float hi, float x) { return smoothstep(lo - 0.004, lo + 0.004, x) * (1.0 - smoothstep(hi - 0.004, hi + 0.004, x)); }
float tri(float x) { return abs(fract(x) - 0.5) * 4.0 - 1.0; }
// Signed distance to a five-pointed star (outer radius r, inner/outer ratio rf), after Inigo Quilez
float sdStar(vec2 p, float r, float rf) {
  const vec2 k1 = vec2(0.809016994, -0.587785252), k2 = vec2(-0.809016994, -0.587785252);
  p.x = abs(p.x); p -= 2.0 * max(dot(k1, p), 0.0) * k1; p -= 2.0 * max(dot(k2, p), 0.0) * k2; p.x = abs(p.x); p.y -= r;
  vec2 ba = rf * vec2(-k1.y, k1.x) - vec2(0.0, 1.0);
  float h = clamp(dot(p, ba) / dot(ba, ba), 0.0, r);
  return length(p - ba * h) * sign(p.y * ba.x - p.x * ba.y);
}
` + sh.fragmentShader
      .replace('#include <map_fragment>', `#include <map_fragment>
  float ax = abs(vRest.x), front = step(0.0, vRest.z);
  // Crew neck: the shirt covers the shoulders and the slope up to the neck, leaving just the neck bare.
  // The collar sits a little higher at the back and dips slightly at the front.
  float collar = uKitA.x + 0.03 * (1.0 - front) - 0.03 * front * (1.0 - smoothstep(0.0, 0.08, ax));
  float neckline = mix(collar, 1.62, smoothstep(0.072, 0.098, ax));
  float shirtM = band(uKitA.y, neckline, vRest.y) * (1.0 - smoothstep(uKitA.w - 0.005, uKitA.w + 0.005, ax));
  float shortsM = (1.0 - shirtM) * band(uKitA.z, uKitA.y + 0.05, vRest.y) * step(ax, 0.42);
  float shoeM = 1.0 - smoothstep(uKitB.y - 0.004, uKitB.y + 0.004, vRest.y);
  float sockM = (1.0 - shoeM) * (1.0 - smoothstep(uKitB.x - 0.004, uKitB.x + 0.004, vRest.y));
  float cloth = clamp(shirtM + shortsM + sockM + shoeM, 0.0, 1.0);
  vec3 sole = uShoe * mix(0.45, 1.0, smoothstep(0.018, 0.026, vRest.y));
  vec3 clothCol = shirtM * uShirt + shortsM * uShorts + sockM * uSock + shoeM * sole;
  // Superhero kit. uSuit: x bodysuit on, y pattern (1 V, 2 lightning, 3 side stripes, 4 star), z mask
  // (1 over the eyes, 2 the whole head), w muscle. The suit is the shirt colour, its trim the accent colour.
  float headM = smoothstep(uEye.w - 0.004, uEye.w + 0.004, vRest.y);
  float suitM = 0.0, accM = 0.0, lens = 0.0, rim = 0.0, dom = 0.0, trunks = 0.0;
  if (uSuit.x > 0.5) {
    float y = vRest.y; vec3 n = normalize(vRestN);
    suitM = (1.0 - headM) * (1.0 - shoeM);
    float onArm = smoothstep(uArm.x - 0.01, uArm.x + 0.01, ax) * step(uArm.w - 0.2, y);
    float glove = smoothstep(uArm.z - 0.04, uArm.z - 0.03, ax) * step(uArm.w - 0.2, y);
    float bootTop = uKitB.x * 1.9, boot = 1.0 - smoothstep(bootTop - 0.004, bootTop + 0.004, y);
    // Trunks over the suit, cut higher at the sides, with the belt as their waistband
    trunks = band(uKitA.y - 0.16 + 0.35 * ax, uKitA.y + 0.028, y) * (1.0 - onArm) * step(ax, 0.3);
    float torso = (1.0 - onArm) * band(uKitA.y + 0.03, uEye.w, y);
    float pat = 0.0;
    if (uSuit.y < 1.5) { float ly = uKitA.x - 0.27 + ax; pat = band(ly, ly + 0.06, y) * torso; }
    else if (uSuit.y < 2.5) { float ly = uKitA.x - 0.2 - 0.3 * vRest.x + 0.028 * tri(vRest.x / 0.075); pat = band(ly - 0.02, ly + 0.02, y) * torso * front; }
    else if (uSuit.y < 3.5) pat = max(smoothstep(0.7, 0.76, abs(n.x)) * (1.0 - onArm) * band(bootTop, uKitA.x - 0.05, y), smoothstep(0.62, 0.68, n.y) * onArm * (1.0 - glove));
    else { vec2 p = vec2(vRest.x, y - (uKitA.x - 0.16)); pat = (1.0 - smoothstep(0.076, 0.082, length(p))) * front * smoothstep(-0.002, 0.002, sdStar(p, 0.058, 0.45)); }
    accM = max(max(glove, boot), max(trunks, pat));
  }
  if (uSuit.z > 1.5) {
    // Hood over the whole head, with two white lenses swept up at the outer corners
    suitM = uSuit.x > 0.5 ? 1.0 - shoeM : headM; // no seam at the collar when worn with the suit
    vec2 d = vec2(ax - uEye.x, vRest.y - uEye.y); d.y -= 0.35 * d.x; d /= vec2(0.026, 0.0135);
    float e = dot(d, d), fr = step(0.02, vRest.z) * headM;
    lens = (1.0 - smoothstep(0.8, 1.0, e)) * fr; rim = (1.0 - smoothstep(1.1, 1.6, e)) * fr - lens;
  } else if (uSuit.z > 0.5) dom = headM * band(uEye.y - 0.021, uEye.y + 0.022, vRest.y);
  clothCol = mix(clothCol, mix(uShirt, uAcc, accM), suitM); cloth = max(cloth, suitM);
  clothCol = mix(clothCol, uAcc, dom); cloth = max(cloth, dom);
  clothCol = mix(mix(clothCol, vec3(0.9), lens), vec3(0.012), max(rim, 0.0));
  diffuseColor.rgb = mix(diffuseColor.rgb * uSkin, clothCol, cloth);`)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n  roughnessFactor = mix(mix(mix(roughnessFactor, 0.88, cloth), 0.5, suitM), 0.2, lens);')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n  totalEmissiveRadiance += lens * 0.3;')
      .replace('#include <normal_fragment_begin>', '#include <normal_fragment_begin>\n  vec3 restNormal = normal;')
      // Fabric hides the muscle detail; a bodysuit is tight enough to show most of it
      .replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\n  normal = normalize(mix(normal, restNormal, clamp(cloth * 0.8 - suitM * 0.55 + trunks * 0.55, 0.0, 1.0)));');
  };
  m.customProgramCacheKey = () => 'san7-kit';
  u.uKitA.value.set(kit.neck, kit.waist, kit.shorts, kit.sleeve); u.uKitB.value.set(kit.sock, kit.shoe, 0, 0);
  return m;
}
// Hair and eyebrows: the texture's light and shade, in the player's hair colour
function hairMaterial(base, u) {
  const m = base.clone();
  m.onBeforeCompile = sh => {
    sh.uniforms.uHair = u.uHair;
    sh.fragmentShader = 'uniform vec3 uHair;\n' + sh.fragmentShader.replace('#include <map_fragment>', `#include <map_fragment>
  float lum = dot(diffuseColor.rgb, vec3(0.2126, 0.7152, 0.0722));
  diffuseColor.rgb = uHair * clamp(0.35 + lum * 2.6, 0.0, 1.8);`);
  };
  m.customProgramCacheKey = () => 'san7-hair';
  return m;
}
// Give figure f the model for body kind ('m' or 'f'), replacing the one it has
function attachModel(f, kind) {
  const K = CHAR.kinds[kind], old = f.model;
  const inst = THREE.SkeletonUtils.clone(K.src);
  inst.rotation.y = Math.PI; inst.scale.setScalar(K.s);
  const u = { uShirt: { value: new THREE.Color() }, uShorts: { value: new THREE.Color() }, uSkin: { value: new THREE.Color(1, 1, 1) },
    uSock: { value: linColor(0xf4f4f0) }, uShoe: { value: linColor(0xeceef0) }, uHair: { value: new THREE.Color() },
    uKitA: { value: new THREE.Vector4() }, uKitB: { value: new THREE.Vector4() },
    uAcc: { value: new THREE.Color() }, uSuit: { value: new THREE.Vector4() }, uArm: { value: K.hero.arm }, uEye: { value: K.hero.eye } };
  const face = {};
  inst.traverse(o => {
    if (!o.isMesh) return;
    o.castShadow = true; o.frustumCulled = false; // bones move the mesh beyond its rest bounds
    if (/Superhero/i.test(o.material.name)) o.material = kitMaterial(o.material, KIT[kind], u);
    else if (/Hair/i.test(o.material.name)) { o.material = hairMaterial(o.material, u); face.brows = o; } // eyebrows
    else if (/Eyes/i.test(o.material.name)) face.eyes = o;
  });
  // Bones in parent-before-child order, each with the simple-skeleton joint that drives it (or none)
  const order = [], src = [], parentIdx = [];
  const root = inst.getObjectByName('root');
  (function walk(b, pi) {
    if (!b.isBone) return;
    const i = order.length; order.push(b); parentIdx.push(pi);
    src.push(BONE_SRC[b.name] ? { joint: BONE_SRC[b.name](f), rest: K.rest[b.name] } : null);
    for (const c of b.children) walk(c, i);
  })(root, -1);
  const head = inst.getObjectByName('Head');
  // Hair: every style is built once per player and shown or hidden by the look
  const hair = {};
  const headHolder = new THREE.Group(); headHolder.matrixAutoUpdate = false; headHolder.matrix.copy(K.headInv); head.add(headHolder);
  for (const [n, scn] of Object.entries(CHAR.hair)) {
    const h = scn.clone();
    h.traverse(o => { if (o.isMesh) { o.castShadow = true; o.material = hairMaterial(o.material, u); } });
    const author = HAIR_FOR[n];
    if (author !== kind) {
      // Made for the other head: move it from that head onto this one and size it to fit
      const from = CHAR.kinds[author].headPos, r = kind === 'm' ? HEAD_RATIO : 1 / HEAD_RATIO;
      const fit = new THREE.Group(); fit.matrixAutoUpdate = false;
      fit.matrix.makeTranslation(K.headPos.x, K.headPos.y, K.headPos.z).multiply(_m1.makeScale(r, r, r)).multiply(new THREE.Matrix4().makeTranslation(-from.x, -from.y, -from.z));
      fit.add(h); headHolder.add(fit);
    } else headHolder.add(h);
    hair[n] = h;
  }
  // Spiky hair: worn over the buzzed hair, in the hair colour
  if (!K.spiky) K.spiky = spikyGeo(K.headPos);
  const spiky = new THREE.Mesh(K.spiky, new THREE.MeshStandardMaterial({ roughness: 0.6, flatShading: true }));
  spiky.castShadow = true; headHolder.add(spiky);
  // Sweatband round the forehead, tipped down a little at the front (rest-pose head, model faces +z)
  const band = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.014, 8, 32), f.mats.top);
  band.rotation.x = Math.PI / 2 - 0.22; band.scale.set(0.98, 1.12, 1.4); band.castShadow = true;
  band.position.set(0, kind === 'f' ? 1.692 : 1.738, -0.012);
  headHolder.add(band);
  // Fingers: a grip on the racket hand, a loose curl on the other
  for (const side of ['r', 'l']) for (const fg of ['index', 'middle', 'ring', 'pinky']) CURL[side].forEach((a, j) => {
    const b = inst.getObjectByName(`${fg}_0${j + 1}_${side}`); if (b) b.quaternion.multiply(_q2.setFromAxisAngle(_v1.set(1, 0, 0), a));
  });
  for (const [n, a] of [['thumb_02_r', 0.45], ['thumb_03_r', 0.5]]) { const b = inst.getObjectByName(n); if (b) b.quaternion.multiply(_q2.setFromAxisAngle(_v1.set(1, 0, 0), a)); }
  // Shoes, fixed to the foot bones (shared geometry per body)
  if (!K.shoes) { const kit = KIT[kind]; K.shoes = { r: shoeGeos(kit, -1), l: shoeGeos(kit, 1) }; }
  for (const side of ['l', 'r']) {
    const h = new THREE.Group(); h.matrixAutoUpdate = false; h.matrix.copy(K.footInv[side]);
    for (const part of ['upper', 'sole']) { const o = new THREE.Mesh(K.shoes[side][part], SHOE_MATS[part]); o.castShadow = true; h.add(o); }
    inst.getObjectByName('foot_' + side).add(h);
  }
  // The racket goes in the model's hand with a handshake grip. In the hand bone's frame +y runs along the
  // fingers, +z is the thumb side and -x the palm. The handle lies diagonally across the palm, butt at the
  // heel of the hand on the little-finger side; the shaft leaves between thumb and index finger, turned
  // GRIP_ANGLE from the fingers towards the thumb, with the strings parallel to the palm.
  const grip = new THREE.Group();
  grip.quaternion.copy(GRIP_Q); grip.scale.setScalar(1 / K.s); grip.position.copy(GRIP_AT);
  inst.getObjectByName('hand_r').add(grip);
  grip.add(f.racket.plain, f.racket.custom.g, f.racket.center);
  if (old) f.g.remove(old.inst);
  f.g.add(inst);
  // The simple body is hidden (the skirt and cape stay: they hang from the simple pelvis and torso, which the model follows)
  const keep = new Set([f.wear.skirt, f.cape.mesh]);
  const hidden = old ? old.hidden : [];
  if (!old) f.g.traverse(o => { if (o.isMesh && !keep.has(o) && !isRacketPart(f, o) && !inst.getObjectById(o.id)) hidden.push(o); });
  f.model = { kind, inst, order, src, parentIdx, u, hair, band, spiky, face, hidden, pelvisParent: root, base: new THREE.Quaternion(), G: order.map(() => new THREE.Quaternion()) };
  f.model.pelvisBone = inst.getObjectByName('pelvis');
}
function isRacketPart(f, o) { for (let p = o; p; p = p.parent) if (p === f.racket.plain || p === f.racket.custom.g) return true; return false; }
function applyModelLook(f, look) {
  const kind = look.body === 'f' ? 'f' : 'm';
  if (!f.model || f.model.kind !== kind) attachModel(f, kind);
  const M = f.model, u = M.u;
  for (const o of M.hidden) o.visible = false;
  u.uShirt.value.copy(linColor(look.shirt));
  u.uShorts.value.copy(linColor(look.bt === 'skirt' ? look.skirt : look.shorts));
  const sk = linColor(look.skin); u.uSkin.value.setRGB(sk.r / SKIN_REF.r, sk.g / SKIN_REF.g, sk.b / SKIN_REF.b);
  u.uHair.value.copy(linColor(look.hair));
  // Superhero kit (a full mask hides the hair, eyes and eyebrows; a mask over the eyes hides the eyebrows)
  const hood = look.mask === 'full';
  u.uAcc.value.copy(linColor(look.acc));
  u.uSuit.value.set(SUITS.indexOf(look.suit) > 0 ? 1 : 0, SUITS.indexOf(look.suit), MASKS.indexOf(look.mask), look.build === 'b' ? 1 : 0);
  const hm = look.hs === 'spiky' ? 'buzzed' : HAIR_MODEL[look.hs] || 'parted';
  for (const [n, h] of Object.entries(M.hair)) h.visible = n === hm && !hood;
  M.band.visible = look.hs === 'band' && !hood;
  M.spiky.visible = look.hs === 'spiky' && !hood; M.spiky.material.color.copy(u.uHair.value).multiplyScalar(0.9);
  M.face.eyes.visible = !hood; M.face.brows.visible = look.mask === 'none';
  // The cape hangs from this body's upper back, a little further out over the muscles
  const H = CHAR.kinds[kind].hero, big = look.build === 'b';
  f.cape.top.copy(H.capeTop); f.cape.top.z += big ? 0.03 : 0; f.cape.hw0 = H.capeHW + (big ? 0.03 : 0);
  f.cape.len = kind === 'f' ? 0.9 : 0.95;
}
// Spiky hair: faceted cones round the crown, swept up and back, shorter over the forehead.
// head = the head bone's rest position (model space, faces +z); the skull is centred a little above it.
function spikyGeo(head) {
  const c = head.clone().add(new THREE.Vector3(0, 0.112, 0)), up = new THREE.Vector3(0, 1, 0), parts = [];
  const dir = new THREE.Vector3(), axis = new THREE.Vector3(), m = new THREE.Matrix4(), q = new THREE.Quaternion(), one = new THREE.Vector3(1, 1, 1);
  const ring = (theta, n, len, rad, off) => {
    for (let i = 0; i < n; i++) {
      const phi = off + i / n * Math.PI * 2;
      dir.set(Math.sin(theta) * Math.sin(phi), Math.cos(theta), Math.sin(theta) * Math.cos(phi)); // phi 0 = front
      const front = Math.max(0, dir.z);
      if (theta > 1.3 && front > 0.45) continue; // keep the face clear
      axis.copy(dir).addScaledVector(up, 0.8 + front).add(_v1.set(0, 0, -0.35)).normalize();
      const L = len * (1 - 0.5 * front), g = new THREE.ConeGeometry(rad, L, 5, 1);
      g.translate(0, L / 2, 0);
      g.applyMatrix4(m.compose(_v1.copy(c).addScaledVector(dir, 0.08), q.setFromUnitVectors(up, axis), one));
      parts.push(g);
    }
  };
  ring(0, 1, 0.16, 0.045, 0); ring(0.55, 5, 0.16, 0.045, 0.3); ring(1.0, 7, 0.14, 0.042, 0); ring(1.4, 8, 0.11, 0.036, 0.4);
  let nv = 0; for (const g of parts) nv += g.attributes.position.count;
  const pos = new Float32Array(nv * 3), nor = new Float32Array(nv * 3), idx = [];
  let o = 0;
  for (const g of parts) {
    pos.set(g.attributes.position.array, o * 3); nor.set(g.attributes.normal.array, o * 3);
    for (const i of g.index.array) idx.push(i + o);
    o += g.attributes.position.count; g.dispose();
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); geo.setIndex(idx);
  return geo;
}
// Cape: a cloth strip hung from the upper back (in the torso joint's frame), drawn back by how fast the player
// runs, lifted as they fall, swaying sideways and fluttering more with speed. Reshaped on the CPU every frame.
const CAPE_C = 6, CAPE_R = 10;
function makeCape(f) {
  const geo = new THREE.BufferGeometry(), n = (CAPE_C + 1) * (CAPE_R + 1), idx = [];
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
  for (let r = 0; r < CAPE_R; r++) for (let c = 0; c < CAPE_C; c++) { const a = r * (CAPE_C + 1) + c, b = a + CAPE_C + 1; idx.push(a, a + 1, b, a + 1, b + 1, b); }
  geo.setIndex(idx);
  const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ roughness: 0.65, side: THREE.DoubleSide }));
  mesh.castShadow = true; mesh.frustumCulled = false; mesh.visible = false;
  f.torso.add(mesh);
  // Until a model is attached it hangs from the simple torso's back
  return { mesh, top: new THREE.Vector3(0, 0.5, 0.2), hw0: 0.16, hw1: 0.3, len: 0.95, idle: 0.1, wind: 0, windV: 0, sway: 0, prev: null, t: 0 };
}
const _cq = new THREE.Quaternion(), _cg = new THREE.Vector3(), _cv = new THREE.Vector3(), _cd = new THREE.Vector3(), _cp = new THREE.Vector3();
function updateCape(f) {
  const C = f.cape;
  if (!C.mesh.visible || !f.g.visible) { C.prev = null; return; }
  const now = performance.now() / 1000, dt = Math.min(0.05, now - C.t); C.t = now;
  quatUpTo(f.torso, f.g, _cq).invert(); // figure frame → torso frame
  // How the player moves, in the torso's frame (the figure faces -z: running forward is -z)
  const pos = _cp.set(f.g.position.x, f.g.position.y + f.pelvis.position.y, f.g.position.z);
  let wt = C.idle, st = 0;
  if (C.prev && dt > 0) {
    _cv.subVectors(pos, C.prev).divideScalar(dt);
    if (_cv.lengthSq() < 400) { // not a teleport (new point, court change)
      const vy = _cv.y; _cv.y = 0;
      _cv.applyQuaternion(_q1.copy(f.g.quaternion).invert()); _cv.x *= f.g.scale.x; _cv.y = vy;
      _cv.applyQuaternion(_cq);
      wt += THREE.MathUtils.clamp(-_cv.z * 0.32, 0, 1.4) + THREE.MathUtils.clamp(-vy * 0.2, 0, 0.8);
      st = THREE.MathUtils.clamp(-_cv.x * 0.2, -0.5, 0.5);
    }
  }
  C.prev = (C.prev || new THREE.Vector3()).copy(pos);
  // A springy follow: the cape lags behind a change of speed and overshoots a little
  C.windV += ((wt - C.wind) * 40 - C.windV * 7) * dt; C.wind += C.windV * dt;
  C.sway += (st - C.sway) * Math.min(1, dt * 5);
  _cg.set(0, -1, 0).applyQuaternion(_cq); // gravity in the torso's frame
  const a = C.mesh.geometry.attributes.position.array, W = Math.max(0, C.wind), seg = C.len / CAPE_R;
  let y = C.top.y, z = C.top.z, x = 0;
  for (let r = 0; r <= CAPE_R; r++) {
    const s = r / CAPE_R, hw = C.hw0 + (C.hw1 - C.hw0) * Math.sqrt(s);
    for (let c = 0; c <= CAPE_C; c++) {
      const u = c / CAPE_C * 2 - 1, i = (r * (CAPE_C + 1) + c) * 3;
      const flutter = Math.sin(now * (6 + 5 * W) - s * 6 + u * 1.7) * 0.035 * s * (0.25 + W);
      a[i] = x + u * hw;
      a[i + 1] = y + flutter * 0.3;
      // The top corners wrap round the shoulders; soft folds deepen towards the hem
      a[i + 2] = z - 0.07 * u * u * (1 - s) * (1 - s) + flutter + Math.sin(u * Math.PI * 2.5) * 0.018 * Math.sqrt(s);
    }
    // Next row: down along gravity, pushed back by the wind, never into the body
    _cd.copy(_cg); _cd.z += 0.2 + W * (0.5 + 1.1 * s); _cd.x += C.sway * s; _cd.normalize();
    if (_cd.z < 0.15) { _cd.z = 0.15; _cd.normalize(); }
    x += _cd.x * seg; y += _cd.y * seg; z += _cd.z * seg;
  }
  C.mesh.geometry.attributes.position.needsUpdate = true;
  C.mesh.geometry.computeVertexNormals();
}
// Copy the simple skeleton's pose onto the model: each driven bone takes its joint's orientation (relative to
// the figure) times the bone's rest offset; the rest keep their own rotation under their parent.
function driveModel(f) {
  updateCape(f);
  const M = f.model;
  if (!M || !f.g.visible) return;
  const G = M.G;
  quatUpTo(M.order[0].parent, f.g, M.base);
  for (let i = 0; i < M.order.length; i++) {
    const b = M.order[i], s = M.src[i], PG = M.parentIdx[i] < 0 ? M.base : G[M.parentIdx[i]];
    if (s) {
      quatUpTo(s.joint, f.g, G[i]).multiply(s.rest);
      b.quaternion.copy(_q1.copy(PG).invert()).multiply(G[i]);
    } else G[i].multiplyQuaternions(PG, b.quaternion);
  }
  // Pelvis position: the simple pelvis plus the rest offset between the two, turned with the pelvis
  const K = CHAR.kinds[M.kind];
  _v1.copy(K.pelvisOff).applyQuaternion(f.pelvis.quaternion).add(f.pelvis.position);
  M.pelvisParent.updateWorldMatrix(true, false);
  f.g.updateWorldMatrix(true, false);
  _v1.applyMatrix4(f.g.matrixWorld);
  M.pelvisBone.position.copy(M.pelvisParent.worldToLocal(_v1));
}

const baseLook = shirt => ({ shirt, shorts: 0x1f2a36, skirt: 0xf2f2ee, skin: 0xc98f6b, hair: 0x1d1a17, racket: shirt, hs: 'short', bt: 'shorts', rk: 'plain', rkv: 'xanh', str: 0xf4f4f2, hand: 'R', body: 'm', suit: 'none', acc: ACC_DEF, mask: 'none', cape: 'n', build: 'n' });
function makeAthlete(idx, look, parent = scene) {
  const f = figure(look), side = sideT(team(idx));
  if (side < 0) f.g.rotation.y = Math.PI;
  parent.add(f.g);
  makeTag(f);
  return Object.assign(f, { idx, side, x: 0, z: side * 3.5, vx: 0, vz: 0, y: 0, vy: 0, landT: 0, sta: 1, tired: false, run: false,
    swingT: -1, swingK: 'over', armed: null, armT: 0, holding: false, serveHold: false, cool: 0, phase: 0, plan: null, delay: 0, leave: false,
    fallT: 0, fdx: 0, fdz: 1, fallSafe: 0, tilted: false,
    look, pose: { ...READY }, leg: { th: [0, 0], kn: [0, 0], an: [0, 0] } });
}
