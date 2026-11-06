/* ---------- character models: Quaternius "Universal Base Characters" (CC0, assets/characters) ---------- */
// The game keeps posing its own simple skeleton (figure() + animateAthlete). Once the models have loaded,
// every figure gets a skinned model that copies that pose each frame (driveModel) and the simple meshes are
// hidden. If the models cannot load (no server, e.g. the claude.ai artifact) the simple figure stays.
const CHAR_URL = 'assets/characters/';
const CHAR = { ready: false, kinds: {}, hair: {} };
const FIGS = new Set();
// Model bone ← joint of the simple skeleton. Bones not listed keep their own rest rotation.
const BONE_SRC = {
  pelvis: f => f.pelvis, spine_01: f => f.torso, neck_01: f => f.neck,
  upperarm_r: f => f.R.sh, lowerarm_r: f => f.R.el, hand_r: f => f.R.wr,
  upperarm_l: f => f.L.sh, lowerarm_l: f => f.L.el, hand_l: f => f.L.wr,
  thigh_l: f => f.legs[0].hip, calf_l: f => f.legs[0].knee, foot_l: f => f.legs[0].ankle,
  thigh_r: f => f.legs[1].hip, calf_r: f => f.legs[1].knee, foot_r: f => f.legs[1].ankle,
};
// The kit is painted onto the body by height on the model in its rest pose (metres, y up; the model stands
// in a T-pose, so how far the sleeves reach down the arm is a distance along x).
const KIT = {
  m: { neck: 1.47, waist: 0.975, shorts: 0.66, sleeve: 0.37, sock: 0.2, shoe: 0.105, footX: 0.131, foot: 1 },
  f: { neck: 1.43, waist: 0.955, shorts: 0.66, sleeve: 0.31, sock: 0.19, shoe: 0.095, footX: 0.125, foot: 0.95 },
};
// Fingers bend towards the palm about their own x axis: a firm grip on the racket hand, relaxed on the other
const CURL = { r: [1.15, 1.3, 0.9], l: [0.35, 0.5, 0.35] };
// Handshake grip (see attachModel). The racket is built with its butt at the origin and the head along -y,
// strings facing ±z; this turn puts the shaft along S = (0, cos a, sin a) and the strings' normal along +x.
const GRIP_ANGLE = 55 * Math.PI / 180;
const GRIP_Q = (() => {
  const c = Math.cos(GRIP_ANGLE), s = Math.sin(GRIP_ANGLE);
  return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(
    new THREE.Vector3(0, -s, c), new THREE.Vector3(0, -c, -s), new THREE.Vector3(1, 0, 0)));
})();
// Butt of the handle, a couple of centimetres past the heel of the hand (players hold near the end)
const GRIP_AT = new THREE.Vector3(-0.036, 0.03, -0.05).addScaledVector(new THREE.Vector3(0, Math.cos(GRIP_ANGLE), Math.sin(GRIP_ANGLE)), 0.045);
// Sneaker, modelled on the right foot of the male body in its rest pose (side profile: z forward, y up),
// extruded across the foot. The upper and a darker sole are two meshes.
function shoeGeos(kit, side) {
  const spline = pts => { const sh = new THREE.Shape(); sh.moveTo(pts[0][0], pts[0][1]); sh.splineThru(pts.slice(1).map(p => new THREE.Vector2(p[0], p[1]))); return sh; };
  const upper = spline([[-0.135, -0.004], [0.06, -0.004], [0.125, 0.003], [0.147, 0.019], [0.136, 0.037], [0.09, 0.049], [0.02, 0.063], [-0.03, 0.091], [-0.08, 0.099], [-0.122, 0.096], [-0.147, 0.06], [-0.147, 0.018], [-0.135, -0.004]]);
  const sole = spline([[-0.15, -0.014], [0.07, -0.014], [0.14, -0.008], [0.158, 0.008], [0.15, 0.018], [0.06, 0.012], [-0.155, 0.016], [-0.16, 0.0], [-0.15, -0.014]]);
  const make = (shape, depth, bevel) => {
    const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 3, curveSegments: 20 });
    g.translate(0, 0, -depth / 2); g.rotateY(-Math.PI / 2); // profile → z forward, y up; extruded across x
    g.scale(kit.foot * 0.98, kit.foot, kit.foot); g.translate(side * kit.footX, 0, 0);
    g.computeVertexNormals();
    return g;
  };
  return { upper: make(upper, 0.076, 0.012), sole: make(sole, 0.09, 0.009) };
}
const SHOE_MATS = { upper: new THREE.MeshStandardMaterial({ color: 0xf1f2f4, roughness: 0.55 }), sole: new THREE.MeshStandardMaterial({ color: 0x7e858d, roughness: 0.8 }) };
// Hair style → hair model (all four fit both bodies); 'band' adds a sweatband over long hair
const HAIR_MODEL = { short: 'parted', tail: 'buns', band: 'long', bald: 'buzzed' };
// Each hair model was made for one of the two heads; on the other body it is moved to that head and sized
// to it (the male head is about 5% larger).
const HAIR_FOR = { parted: 'm', buzzed: 'm', buns: 'f', long: 'f' }, HEAD_RATIO = 1.05;
const SKIN_REF = new THREE.Color(0xc98f6b).convertSRGBToLinear(); // the default skin swatch leaves the texture as it is
const _q1 = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _v1 = new THREE.Vector3(), _m1 = new THREE.Matrix4();
// Orientation of obj relative to its ancestor `top` (rotations only: nothing in these chains is scaled unevenly)
function quatUpTo(obj, top, out) {
  out.copy(obj.quaternion);
  for (let p = obj.parent; p && p !== top; p = p.parent) out.premultiply(p.quaternion);
  return out;
}
const linColor = hexc => new THREE.Color(hexc).convertSRGBToLinear();

function loadCharacters() {
  if (!THREE.GLTFLoader || !THREE.SkeletonUtils) return;
  const loader = new THREE.GLTFLoader(), get = name => new Promise((ok, fail) => loader.load(CHAR_URL + name, ok, undefined, fail));
  Promise.all([get('male.gltf'), get('female.gltf'), ...Object.values(HAIR_MODEL).map(n => get(`hair_${n}.gltf`))]).then(([m, f, ...hair]) => {
    CHAR.kinds.m = prepareKind(m.scene); CHAR.kinds.f = prepareKind(f.scene);
    Object.values(HAIR_MODEL).forEach((n, i) => { CHAR.hair[n] = hair[i].scene; });
    CHAR.ready = true;
    for (const f of FIGS) applyLook(f, f.look || lookOfFig(f));
    warmShaders();
  }).catch(e => console.warn('Không tải được model nhân vật, dùng nhân vật đơn giản.', e));
}
const lookOfFig = f => f === pv.fig ? myLook : DEF_LOOKS[0];
// Everything about a body that is the same for every player using it
function prepareKind(src) {
  src.updateMatrixWorld(true);
  const bone = n => src.getObjectByName(n);
  const P0 = HIP_DROP + THIGH + SHIN + FOOT; // the simple skeleton's pelvis height at rest
  // Scale so the model's legs are as long as the simple skeleton's: feet then meet the floor in every pose
  const s = (THIGH + SHIN + FOOT) / bone('thigh_l').getWorldPosition(_v1).y;
  // Rest pose of every bone, relative to a figure group (the model turned to face -z like the figure).
  // A T-pose arm is aimed straight down, as the simple skeleton's arms hang at rest.
  const holder = new THREE.Group(), inst = THREE.SkeletonUtils.clone(src);
  inst.rotation.y = Math.PI; inst.scale.setScalar(s); holder.add(inst); holder.updateMatrixWorld(true);
  const rest = {};
  for (const name of Object.keys(BONE_SRC)) {
    const b = inst.getObjectByName(name), q = quatUpTo(b, holder, new THREE.Quaternion());
    if (/arm|hand/.test(name)) {
      const up = quatUpTo(inst.getObjectByName(name.replace(/lowerarm|hand/, 'upperarm')), holder, new THREE.Quaternion());
      const dir = new THREE.Vector3(0, 1, 0).applyQuaternion(up);
      q.premultiply(new THREE.Quaternion().setFromUnitVectors(dir, new THREE.Vector3(0, -1, 0)));
    }
    rest[name] = q;
  }
  // Where the model's pelvis bone sits relative to the simple pelvis at rest
  const pel = holder.worldToLocal(inst.getObjectByName('pelvis').getWorldPosition(new THREE.Vector3()));
  const pelvisOff = pel.sub(new THREE.Vector3(0, P0, 0));
  // Head bone in model space at rest: hair and the sweatband are modelled there
  const headInv = bone('Head').matrixWorld.clone().invert(), headPos = bone('Head').getWorldPosition(new THREE.Vector3());
  const footInv = { l: bone('foot_l').matrixWorld.clone().invert(), r: bone('foot_r').matrixWorld.clone().invert() };
  // Superhero kit, measured on the rest pose (model space, faces +z):
  // arm = shoulder, elbow and wrist distance along x plus the arm's height (T-pose); eye = centre of one eye
  // and the height where the head starts (the suit's collar). The cape hangs from the upper back.
  const ax = n => Math.abs(bone(n).getWorldPosition(_v1).x);
  let eyes = null, body = null;
  src.traverse(o => { if (o.isMesh && /Eyes/i.test(o.material.name)) eyes = o; if (o.isMesh && /Superhero/i.test(o.material.name)) body = o; });
  eyes.geometry.computeBoundingBox();
  const eb = eyes.geometry.boundingBox, neckY = bone('neck_01').getWorldPosition(_v1).y;
  const arm = new THREE.Vector4(ax('upperarm_r'), ax('lowerarm_r'), ax('hand_r'), bone('upperarm_r').getWorldPosition(_v1).y);
  const eye = new THREE.Vector4(eb.max.x - 0.017, (eb.min.y + eb.max.y) / 2, eb.max.z, neckY + 0.03);
  const topY = neckY - 0.045, bp = body.geometry.attributes.position;
  let back = 0;
  for (let i = 0; i < bp.count; i++) if (Math.abs(bp.getX(i)) < 0.05 && Math.abs(bp.getY(i) - topY) < 0.02) back = Math.min(back, bp.getZ(i));
  // In the torso joint's frame (the figure faces -z, so the back is +z)
  const capeTop = new THREE.Vector3(0, topY * s - (P0 + 0.06), -back * s + 0.012);
  return { src, s, rest, pelvisOff, headInv, headPos, footInv, shoes: null, spiky: null, hero: { arm, eye, capeTop, capeHW: arm.x * s * 0.72 } };
}
