/* ---------- athletes ---------- */
// Skeleton: pelvis → legs (hip, knee, ankle) and torso → neck, shoulders → elbows → wrists.
// Every limb hangs along -y at rest; rotation.x > 0 swings it forward (towards the net).
const THIGH = 0.44, SHIN = 0.42, HIP_DROP = 0.06, FOOT = 0.07;
const WALK_SP = 5.2, RUN_SP = 6.9, JUMP_V = 3.3, LAND_T = 0.18;
// Doubles: partners who run into each other both fall. FALL_T: down and back up again (s), FALL_R: contact distance,
// FALL_V: least closing speed that knocks them over, FALL_SAFE: grace after getting up so they can step apart,
// FALL_PUSH: how hard the bump throws each one back (m/s, slides about FALL_PUSH / 7 m)
const FALL_T = 0.5, FALL_R = 0.7, FALL_V = 0.6, FALL_SAFE = 0.5, FALL_PUSH = 3.2;
function figure(look) {
  const g = new THREE.Group();
  const m = c => new THREE.MeshStandardMaterial({ color: c, roughness: 0.7 });
  const skin = m(look.skin), top = m(look.shirt), shoe = m(0xf1f1ee), bottom = m(look.shorts), hairM = m(look.hair), frame = m(look.racket);
  bottom.side = THREE.DoubleSide; // the skirt is an open cone, seen from inside too
  const add = (geo, mt, x, y, z, parent) => { const o = new THREE.Mesh(geo, mt); o.position.set(x, y, z); o.castShadow = true; parent.add(o); return o; };
  const joint = (parent, x, y, z) => { const j = new THREE.Group(); j.position.set(x, y, z); parent.add(j); return j; };
  const cyl = (r0, r1, h) => new THREE.CylinderGeometry(r0, r1, h, 10);
  const pelvis = joint(g, 0, HIP_DROP + THIGH + SHIN + FOOT, 0);
  add(new THREE.CylinderGeometry(0.17, 0.16, 0.22, 12), bottom, 0, -0.02, 0, pelvis);
  // Bottoms: shorts cover the top of each thigh and swing with the leg; a skirt flares out from the waist
  const skirt = add(new THREE.CylinderGeometry(0.175, 0.27, 0.3, 18, 1, true), bottom, 0, -0.16, 0, pelvis);
  const shortLegs = [];
  const legs = [-1, 1].map(s => {
    const hip = joint(pelvis, s * 0.1, -HIP_DROP, 0);
    add(cyl(0.075, 0.06, THIGH), skin, 0, -THIGH / 2, 0, hip);
    shortLegs.push(add(cyl(0.088, 0.08, 0.17), bottom, 0, -0.07, 0, hip));
    const knee = joint(hip, 0, -THIGH, 0);
    add(cyl(0.058, 0.045, SHIN), skin, 0, -SHIN / 2, 0, knee);
    const ankle = joint(knee, 0, -SHIN, 0);
    add(new THREE.BoxGeometry(0.11, FOOT, 0.25), shoe, 0, -FOOT / 2, -0.05, ankle);
    return { hip, knee, ankle };
  });
  const torso = joint(pelvis, 0, 0.06, 0);
  add(new THREE.CylinderGeometry(0.2, 0.17, 0.56, 12), top, 0, 0.28, 0, torso);
  const neck = joint(torso, 0, 0.6, 0);
  add(new THREE.SphereGeometry(0.115, 16, 12), skin, 0, 0.08, 0, neck);
  // Hair styles: cap of hair, plus a ponytail or a headband; all hidden for a shaved head
  const cap = add(new THREE.SphereGeometry(0.122, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), hairM, 0, 0.1, 0.01, neck);
  const tail = add(new THREE.CylinderGeometry(0.04, 0.022, 0.2, 8), hairM, 0, 0.06, 0.15, neck); tail.rotation.x = 0.5;
  const band = add(new THREE.TorusGeometry(0.119, 0.018, 8, 24), top, 0, 0.13, 0.005, neck); band.rotation.x = Math.PI / 2;
  const arm = s => {
    const sh = joint(torso, s * 0.235, 0.5, 0);
    add(cyl(0.058, 0.052, 0.14), top, 0, -0.06, 0, sh);
    add(cyl(0.047, 0.042, 0.3), skin, 0, -0.15, 0, sh);
    const el = joint(sh, 0, -0.3, 0);
    add(cyl(0.042, 0.035, 0.27), skin, 0, -0.135, 0, el);
    const wr = joint(el, 0, -0.27, 0);
    add(new THREE.SphereGeometry(0.042, 10, 8), skin, 0, -0.02, 0, wr);
    return { sh, el, wr };
  };
  const R = arm(1), L = arm(-1);
  // Racket: a plain one in the chosen colour, or a custom one (K520 Pro, 100ZZ) with its real paint job (customRacket)
  const plain = joint(R.wr, 0, 0, 0);
  add(new THREE.CylinderGeometry(0.016, 0.016, 0.2, 8), m(0x22252a), 0, -0.1, 0, plain);
  add(new THREE.CylinderGeometry(0.006, 0.006, 0.24, 6), m(0xcfd6dc), 0, -0.32, 0, plain);
  const head = add(new THREE.TorusGeometry(0.1, 0.009, 8, 28), frame, 0, -0.55, 0, plain); head.scale.y = 1.25;
  const str = new THREE.Mesh(new THREE.CircleGeometry(0.1, 24), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.25, side: THREE.DoubleSide }));
  str.position.y = -0.55; str.scale.y = 1.25; plain.add(str);
  const custom = customRacket(R.wr);
  const racket = { plain, custom, center: joint(R.wr, 0, -0.62, 0), strings: [str.material, custom.strMat] };
  const f = { g, pelvis, torso, neck, legs, R, L, mats: { skin, top, bottom, hairM, frame }, hair: { cap, tail, band }, wear: { skirt, shortLegs }, racket };
  f.cape = makeCape(f);
  FIGS.add(f); // gets a character model once the models have loaded (see character models below)
  applyLook(f, look);
  return f;
}
const HAIR_STYLES = ['short', 'tail', 'band', 'bald', 'spiky'];
// Superhero kit: a bodysuit with one of four patterns (or ordinary clothes), a mask, a cape and a muscular build
const SUITS = ['none', 'v', 'bolt', 'side', 'star'], MASKS = ['none', 'eye', 'full'];
// Custom rackets, drawn from product photos. Each version names its model:
// - Kumpoo K520 Pro: matte frame with swirl accents on both shoulders and near the tip, "Kumpoo" and "K520 PRO"
//   printed along the shaft. Four paint versions sold in Vietnam.
// - Yonex Astrox 100ZZ: dark glossy frame with a gold pinstripe along both faces and a lighter band on the
//   shoulders, "YONEX" and "ASTROX 100 ZZ" on the shaft. Dark Navy, Kurenai (red) and the VA edition.
// All have grommet holes along the outer edge, a small black logo under the T-joint and a wrapped grip.
const RACKET_MODELS = {
  k520: { name: 'K520 Pro', brand: 'Kumpoo', label: 'K520 PRO', brandFont: 'italic 600 24px sans-serif', labelFont: 'italic 800 34px sans-serif', gloss: 0.85 },
  zz: { name: '100ZZ', brand: 'YONEX', label: 'ASTROX 100 ZZ', brandFont: '800 24px sans-serif', labelFont: 'italic 700 26px sans-serif', gloss: 0.4 },
};
const RACKETS = {
  xanh: { model: 'k520', name: 'Trắng xanh', base: '#f2f3f5', a1: '#27a9e1', a2: '#1b1f3b', text: '#1f8fd0', grip: '#f4f4f2', line: '#d4d7dc', hole: '#9aa1ab', cap: '#1b1f3b' },
  hong: { model: 'k520', name: 'Trắng hồng', base: '#f4f2f4', a1: '#ec5f9a', a2: '#2a2030', text: '#e0508c', grip: '#f4f4f2', line: '#ddd5da', hole: '#a39aa1', cap: '#2a2030' },
  vang: { model: 'k520', name: 'Trắng vàng', base: '#f3f3f1', a1: '#e8b11f', a2: '#26231f', text: '#cf9a12', grip: '#f4f4f2', line: '#dcd8cf', hole: '#a39f95', cap: '#26231f' },
  den: { model: 'k520', name: 'Đen', base: '#25233a', a1: '#35c4e8', a2: '#e9ebf2', text: '#35c4e8', grip: '#1f1f24', line: '#38383f', hole: '#5a5870', cap: '#111118' },
  zznavy: { model: 'zz', name: 'Dark Navy', base: '#1b2140', a1: '#d4a84a', a2: '#3b4c86', text: '#d4a84a', grip: '#1c1c22', line: '#33333c', hole: '#55597a', cap: '#12152a' },
  zzred: { model: 'zz', name: 'Kurenai', base: '#8c1823', a1: '#d9b45f', a2: '#1d2140', text: '#e2c27a', grip: '#1c1c22', line: '#33333c', hole: '#5e2a30', cap: '#2a0a0e' },
  // Viktor Axelsen signature edition: greyish beige with green accents and "VA" on the shaft
  zzva: { model: 'zz', name: 'VA Greyish Beige', label: 'ASTROX 100 ZZ VA', base: '#c8c1b2', a1: '#2e8a57', a2: '#a39b89', text: '#2e8a57', grip: '#ece8df', line: '#cfc8bb', hole: '#8a8476', cap: '#3a3933' },
};
const RACKET_IDS = Object.keys(RACKETS);
const racketName = id => `${RACKET_MODELS[RACKETS[id].model].name} · ${RACKETS[id].name}`;
// String bed: a fine white grid, see-through between the strings
const stringTex = canvasTex(256, 256, (g, w, h) => {
  g.strokeStyle = '#fff'; g.lineWidth = 2.2; // thick enough to keep its colour when shrunk to a few pixels
  for (let x = 4; x < w; x += 10) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.stroke(); }
  for (let y = 4; y < h; y += 8) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); }
});
const racketSkins = {};
function racketSkin(id) {
  if (racketSkins[id]) return racketSkins[id];
  const P = RACKETS[id], M = RACKET_MODELS[P.model];
  // Frame torus: u (canvas x) runs round the head with the T-joint at u = 0.25, v (canvas y) round the tube:
  // the outer edge is the top and bottom rows, the two faces are at 1/4 and 3/4 of the height.
  const frame = canvasTex(1024, 64, (g, w, h) => {
    g.fillStyle = P.base; g.fillRect(0, 0, w, h);
    g.fillStyle = P.hole;
    for (let i = 0; i < 76; i++) { const x = (i + 0.5) * w / 76; g.fillRect(x - 1.5, 0, 3, 4); g.fillRect(x - 1.5, h - 4, 3, 4); }
    // One swirl stroke, from d0 to d1 degrees away from the T-joint, mirrored on both sides and both faces
    const stroke = (d0, d1, col, wd, yo) => {
      g.fillStyle = col;
      for (const s of [1, -1]) for (const face of [-1, 1]) for (let t = 0; t <= 1; t += 0.002) {
        const x = (((0.25 + s * (d0 + (d1 - d0) * t) / 360) * w) % w + w) % w;
        const y = h / 2 + face * h / 4 + face * (yo + Math.sin(t * Math.PI * 1.6) * 7 * s);
        g.beginPath(); g.arc(x, y, wd * Math.sin(Math.PI * t) + 0.3, 0, Math.PI * 2); g.fill();
      }
    };
    if (P.model === 'zz') {
      // Lighter band over each shoulder, then a gold pinstripe along the middle of both faces, broken at the tip
      for (const s of [1, -1]) for (const face of [-1, 1]) {
        const y = h / 2 + face * h / 4;
        for (let d = 18; d <= 78; d += 0.5) {
          const x = (((0.25 + s * d / 360) * w) % w + w) % w;
          g.globalAlpha = Math.sin(Math.PI * (d - 18) / 60); g.fillStyle = P.a2; g.fillRect(x - 1, y - 7, 2.5, 14);
        }
        g.globalAlpha = 1; g.fillStyle = P.a1;
        for (let d = 6; d <= 168; d += 0.4) {
          const x = (((0.25 + s * d / 360) * w) % w + w) % w;
          g.fillRect(x - 0.8, y - 1, 1.8, 2);
        }
      }
    } else {
      stroke(22, 82, P.a2, 2.2, -5); stroke(30, 96, P.a1, 3.4, 3); stroke(118, 162, P.a1, 2.8, 0); stroke(128, 174, P.a2, 1.6, 6);
    }
  });
  frame.wrapS = THREE.RepeatWrapping; // the isometric head's u runs 0.25 → 1.25
  // Shaft cylinder: canvas top is the grip end. Text runs along the shaft on both sides.
  const shaft = canvasTex(64, 512, (g, w, h) => {
    g.fillStyle = P.base; g.fillRect(0, 0, w, h);
    const label = (txt, y, col, font) => {
      for (const cx of [w * 0.25, w * 0.75]) {
        g.save(); g.translate(cx, y); g.rotate(Math.PI / 2);
        g.fillStyle = col; g.font = font; g.textBaseline = 'middle'; g.fillText(txt, 0, 0); g.restore();
      }
    };
    label(M.brand, 24, P.model === 'zz' ? P.a1 : P.a2, M.brandFont);
    label(P.label || M.label, 210, P.text, M.labelFont);
    g.fillStyle = P.a1; g.fillRect(0, 196, w, 3); g.fillRect(0, 392, w, 3);
  });
  // Grip: wrapped tape, a diagonal line every turn
  const grip = canvasTex(64, 256, (g, w, h) => {
    g.fillStyle = P.grip; g.fillRect(0, 0, w, h);
    g.strokeStyle = P.line; g.lineWidth = 3;
    for (let y = -32; y < h + 32; y += 16) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y + 16); g.stroke(); }
  });
  return (racketSkins[id] = { frame, shaft, grip });
}
function customRacket(parent) {
  const g = new THREE.Group(); g.visible = false; parent.add(g);
  const mk = (geo, mat, y) => { const o = new THREE.Mesh(geo, mat); o.position.y = y; o.castShadow = true; g.add(o); return o; };
  const mats = {
    frame: new THREE.MeshStandardMaterial({ roughness: 0.85 }), // matte paint
    shaft: new THREE.MeshStandardMaterial({ roughness: 0.55 }),
    grip: new THREE.MeshStandardMaterial({ roughness: 0.95 }),
    cap: new THREE.MeshStandardMaterial({ roughness: 0.5 }),
  };
  mk(new THREE.CylinderGeometry(0.0165, 0.0155, 0.2, 16), mats.grip, -0.1);
  mk(new THREE.CylinderGeometry(0.018, 0.017, 0.014, 16), mats.cap, 0.003); // butt cap
  mk(new THREE.CylinderGeometry(0.0105, 0.0058, 0.03, 12), mats.cap, -0.213); // cone from grip to shaft
  mk(new THREE.CylinderGeometry(0.0055, 0.0055, 0.215, 12), mats.shaft, -0.335);
  mk(new THREE.CylinderGeometry(0.0055, 0.011, 0.022, 12), mats.frame, -0.43); // T-joint
  const logo = mk(new THREE.BoxGeometry(0.012, 0.012, 0.016), new THREE.MeshStandardMaterial({ color: 0x15161a, roughness: 0.4 }), -0.448);
  logo.rotation.z = Math.PI / 4;
  // Two head shapes: the K520's oval, and the 100ZZ's isometric head with its deeper frame (isoHead)
  const oval = mk(new THREE.TorusGeometry(0.1, 0.0085, 10, 120), mats.frame, -0.55); oval.scale.y = 1.25;
  const strMat = new THREE.MeshBasicMaterial({ map: stringTex, transparent: true, side: THREE.DoubleSide, depthWrite: false });
  const ovalStr = new THREE.Mesh(new THREE.CircleGeometry(0.099, 48), strMat);
  ovalStr.position.y = -0.55; ovalStr.scale.y = 1.25; g.add(ovalStr);
  const iso = isoGeo || (isoGeo = isoHead()); // one geometry shared by every player
  const isoFrame = mk(iso.frame, mats.frame, -0.55);
  const isoStr = new THREE.Mesh(iso.strings, strMat); isoStr.position.y = -0.55; g.add(isoStr);
  return { g, mats, strMat, heads: { k520: [oval, ovalStr], zz: [isoFrame, isoStr] } };
}
// Isometric head (Yonex 100ZZ): squarer than an oval, with a flat-ish tip, fairly straight sides and shoulders
// that pinch in towards the T-joint. Centred at the origin, throat (T-joint) up at +y like the torus.
// The frame tube is an ellipse deeper than it is wide, and its UVs follow the torus: u runs round the head with
// the T-joint at u = 0.25, v runs round the tube with the outer edge at 0 and 1 and the faces at 1/4 and 3/4,
// so the same frame textures fit both heads.
let isoGeo = null;
function isoHead() {
  const N = 160, R = 12, halfW = 0.0072, halfD = 0.0105, a = 0.104;
  // Outline, starting at the throat (+y) and going clockwise
  const pts = [];
  for (let i = 0; i < N; i++) {
    const t = Math.PI / 2 - (i / N) * Math.PI * 2, c = Math.cos(t), s = Math.sin(t);
    const tip = s < 0, b = tip ? 0.118 : 0.125, n = tip ? 3.2 : 2.2; // squarer towards the tip
    const y = b * Math.sign(s) * Math.abs(s) ** (2 / n);
    const x = a * Math.sign(c) * Math.abs(c) ** (2 / n) * (1 - 0.2 * Math.max(0, y / b) ** 2);
    pts.push(new THREE.Vector2(x, y));
  }
  const len = [0];
  for (let i = 1; i <= N; i++) len.push(len[i - 1] + pts[i % N].distanceTo(pts[i - 1]));
  const pos = [], nor = [], uv = [], idx = [];
  for (let i = 0; i <= N; i++) {
    const p = pts[i % N], tg = pts[(i + 1) % N].clone().sub(pts[(i + N - 1) % N]).normalize();
    let ox = tg.y, oy = -tg.x; if (ox * p.x + oy * p.y < 0) { ox = -ox; oy = -oy; } // outward, in the head's plane
    for (let j = 0; j <= R; j++) {
      const q = (j / R) * Math.PI * 2, c = Math.cos(q), s = Math.sin(q);
      pos.push(p.x + ox * c * halfW, p.y + oy * c * halfW, s * halfD);
      const nx = ox * c / halfW, ny = oy * c / halfW, nz = s / halfD, l = Math.hypot(nx, ny, nz);
      nor.push(nx / l, ny / l, nz / l);
      uv.push(0.25 + len[i] / len[N], j / R); // runs 0.25 → 1.25; the frame texture repeats round
    }
  }
  for (let i = 0; i < N; i++) for (let j = 0; j < R; j++) {
    const A = i * (R + 1) + j, B = A + R + 1;
    idx.push(A, A + 1, B, B, A + 1, B + 1); // counter-clockwise seen from outside the tube
  }
  const frame = new THREE.BufferGeometry();
  frame.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  frame.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  frame.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  frame.setIndex(idx);
  // String bed: the same outline pulled in to sit just under the frame, the grid stretched over its bounding box
  const strings = new THREE.ShapeGeometry(new THREE.Shape(pts.map(p => p.clone().multiplyScalar(0.96))), 1);
  strings.computeBoundingBox();
  const bb = strings.boundingBox, su = strings.attributes.uv, sp = strings.attributes.position;
  for (let i = 0; i < su.count; i++) su.setXY(i, (sp.getX(i) - bb.min.x) / (bb.max.x - bb.min.x), (sp.getY(i) - bb.min.y) / (bb.max.y - bb.min.y));
  return { frame, strings };
}
const SKIRT_DEF = 0xf2f2ee, STR_DEF = 0xf4f4f2, ACC_DEF = 0xffb547; // white skirt and white strings for looks saved before these existed
function applyLook(f, look) {
  f.mats.skin.color.setHex(look.skin); f.mats.top.color.setHex(look.shirt);
  f.mats.bottom.color.setHex(look.bt === 'skirt' ? look.skirt : look.shorts);
  f.mats.hairM.color.setHex(look.hair); f.mats.frame.color.setHex(look.racket);
  f.hair.cap.visible = look.hs !== 'bald'; f.hair.tail.visible = look.hs === 'tail'; f.hair.band.visible = look.hs === 'band';
  const skirt = look.bt === 'skirt' && look.suit === 'none'; // a bodysuit replaces shorts and skirt
  f.wear.skirt.visible = skirt;
  f.cape.mesh.visible = look.cape === 'y'; f.cape.mesh.material.color.copy(linColor(look.acc)); for (const o of f.wear.shortLegs) o.visible = !skirt;
  for (const mt of f.racket.strings) mt.color.setHex(look.str); // tints the white string grid
  // Left-handed: mirror the whole body, so the racket arm, poses and swings all switch sides;
  // the racket itself is mirrored back so the print on it still reads the right way round.
  f.hand = look.hand === 'L' ? -1 : 1;
  f.g.scale.x = f.hand; f.racket.plain.scale.x = f.hand; f.racket.custom.g.scale.x = f.hand;
  const k = look.rk === 'custom', K = f.racket.custom;
  f.racket.plain.visible = !k; K.g.visible = k;
  if (k) {
    const s = racketSkin(look.rkv), P = RACKETS[look.rkv];
    K.mats.frame.map = s.frame; K.mats.shaft.map = s.shaft; K.mats.grip.map = s.grip; K.mats.cap.color.set(P.cap);
    K.mats.frame.roughness = RACKET_MODELS[P.model].gloss;
    for (const [model, meshes] of Object.entries(K.heads)) for (const o of meshes) o.visible = model === P.model;
    for (const mt of [K.mats.frame, K.mats.shaft, K.mats.grip]) mt.needsUpdate = true;
  }
  if (f.model || CHAR.ready) applyModelLook(f, look);
}
// A look is valid only if every colour is a 24-bit number and the hair style is known.
// bt (shorts or skirt) and the skirt colour came later: missing in an older saved look means shorts and a white skirt.
function cleanLook(o) {
  if (!o || typeof o !== 'object') return null;
  const c = v => Number.isInteger(v) && v >= 0 && v <= 0xffffff;
  return ['shirt', 'shorts', 'skin', 'hair', 'racket'].every(k => c(o[k])) && HAIR_STYLES.includes(o.hs)
    ? { shirt: o.shirt, shorts: o.shorts, skirt: c(o.skirt) ? o.skirt : SKIRT_DEF, skin: o.skin, hair: o.hair, racket: o.racket, hs: o.hs, bt: o.bt === 'skirt' ? 'skirt' : 'shorts',
        // 'k520' is what this switch was called before it became 'custom'
        rk: o.rk === 'custom' || o.rk === 'k520' ? 'custom' : 'plain', rkv: RACKET_IDS.includes(o.rkv) ? o.rkv : 'xanh', str: c(o.str) ? o.str : STR_DEF,
        hand: o.hand === 'L' ? 'L' : 'R', body: o.body === 'f' || isSkin(o.body) ? o.body : 'm',
        suit: SUITS.includes(o.suit) ? o.suit : 'none', acc: c(o.acc) ? o.acc : ACC_DEF, mask: MASKS.includes(o.mask) ? o.mask : 'none',
        cape: o.cape === 'y' ? 'y' : 'n', build: o.build === 'b' ? 'b' : 'n' } : null;
}

// Body poses. Right (racket) arm: sx/sz shoulder, el elbow, wr wrist. Left arm: lx/lz shoulder, le elbow.
// tw twists the torso (negative turns the racket shoulder back), lean tilts it (negative leans forward).
const READY = { sx: 0.9, sz: 0.35, el: 1.2, wr: 0.3, lx: 0.7, lz: -0.3, le: 1.0, tw: 0, lean: -0.12 };
const HIGH  = { sx: 2.5, sz: 0.55, el: 1.7, wr: 0.3, lx: 2.3, lz: -0.3, le: 0.2, tw: -0.4, lean: 0.05 };
const SERVE = { sx: -0.3, sz: 0.35, el: 0.4, wr: -0.7, lx: 1.25, lz: 0.15, le: 0.25, tw: -0.25, lean: -0.15 };
const SWINGS = {
  over: {
    w: { sx: 3.35, sz: 0.5, el: 2.0, wr: 0.5, lx: 2.7, lz: -0.25, le: 0.1, tw: -0.65, lean: 0.12 },
    c: { sx: 2.95, sz: 0.15, el: 0.1, wr: -0.1, lx: 1.0, lz: -0.3, le: 0.8, tw: 0.15, lean: -0.15 },
    f: { sx: 0.6, sz: -0.4, el: 0.6, wr: 0.4, lx: 0.4, lz: -0.2, le: 1.2, tw: 0.55, lean: -0.4 },
  },
  under: {
    w: { sx: -0.45, sz: 0.4, el: 0.35, wr: -0.9, lx: 1.2, lz: -0.3, le: 0.6, tw: -0.45, lean: -0.3 },
    c: { sx: 0.75, sz: 0.3, el: 0.15, wr: 0.2, lx: 0.9, lz: -0.4, le: 0.8, tw: 0.05, lean: -0.3 },
    f: { sx: 2.3, sz: 0.05, el: 0.9, wr: 0.3, lx: 0.5, lz: -0.3, le: 1.0, tw: 0.4, lean: -0.15 },
  },
  side: {
    w: { sx: 1.0, sz: 1.2, el: 1.7, wr: 0.6, lx: 1.3, lz: -0.9, le: 0.4, tw: -0.75, lean: -0.1 },
    c: { sx: 1.4, sz: 0.9, el: 0.25, wr: 0, lx: 0.9, lz: -0.5, le: 0.7, tw: 0.05, lean: -0.15 },
    f: { sx: 1.7, sz: -0.35, el: 1.0, wr: 0.3, lx: 0.5, lz: -0.3, le: 1.0, tw: 0.6, lean: -0.2 },
  },
};
const SWK = ['over', 'under', 'side'];
// Swing timeline (s): ready → windup (held while armed) → contact → follow-through → ready
const SW_W = 0.08, SW_C = 0.14, SW_F = 0.24, SW_END = 0.5;

