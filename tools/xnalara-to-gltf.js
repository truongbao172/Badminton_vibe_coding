// Convert an XNALara / XPS ASCII model (.mesh.ascii) into a skinned glTF the game can drive.
//
//   node tools/xnalara-to-gltf.js tools/skins/<name>.json "<path to>/generic_Item.mesh.ascii"
//
// The config (see tools/skins/gwen.json) names the output, the base-colour texture and a bone map:
// XNALara bone name → Quaternius bone name (pelvis, spine_01, upperarm_r, hand_r, thigh_l, index_01_r ...).
// Mapped bones take the rest orientation of the same bone in assets/characters/female.gltf, so the code that
// poses the Quaternius bodies (prepareKind, driveModel, the racket grip, the finger curl) works unchanged.
// The model is scaled to metres so its legs are as long as the Quaternius female's.
// No dependencies: Node >= 18.
import fs from 'node:fs';
import path from 'node:path';

const [cfgPath, meshPath] = process.argv.slice(2);
if (!cfgPath || !meshPath) {
  console.error('usage: node tools/xnalara-to-gltf.js <config.json> <model.mesh.ascii>');
  process.exit(1);
}
const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
const REF = 'assets/characters/female.gltf';

/* ---------- small math (quaternions [x, y, z, w], vectors [x, y, z]) ---------- */
const qmul = (a, b) => [
  a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
  a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
  a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
  a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2],
];
const qinv = q => [-q[0], -q[1], -q[2], q[3]];
const qnorm = q => { const l = Math.hypot(...q); return q.map(v => v / l); };
const qrot = (q, v) => { const r = qmul(qmul(q, [...v, 0]), qinv(q)); return [r[0], r[1], r[2]]; };
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
// Column-major 4x4 of R(q) then inverted translation: the inverse of T(p) * R(q)
function invBind(q, p) {
  const [x, y, z, w] = q;
  const r = [ // rotation matrix rows
    [1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)],
    [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)],
    [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)],
  ];
  // inverse = R^T * T(-p): its rotation part is R^T, translation -R^T p
  const t = [0, 1, 2].map(i => -(r[0][i] * p[0] + r[1][i] * p[1] + r[2][i] * p[2]));
  return [r[0][0], r[0][1], r[0][2], 0, r[1][0], r[1][1], r[1][2], 0, r[2][0], r[2][1], r[2][2], 0, t[0], t[1], t[2], 1];
}

/* ---------- reference rest pose: world rotation and position of every Quaternius bone ---------- */
const ref = JSON.parse(fs.readFileSync(REF, 'utf8'));
const refWorld = {};
(function walk(i, pq, pp, ps) {
  const n = ref.nodes[i], q = n.rotation || [0, 0, 0, 1], t = n.translation || [0, 0, 0], s = (n.scale || [1, 1, 1])[0];
  const wq = qnorm(qmul(pq, q)), wp = qrot(pq, t).map((v, k) => pp[k] + v * ps);
  refWorld[n.name] = { q: wq, p: wp };
  for (const c of n.children || []) walk(c, wq, wp, ps * s);
})(ref.scenes[0].nodes[0], [0, 0, 0, 1], [0, 0, 0], 1);

/* ---------- parse the .mesh.ascii ---------- */
// Lines may end with "# comment"; blank lines are skipped
const lines = fs.readFileSync(meshPath, 'utf8').split(/\r?\n/).map(l => l.replace(/#.*$/, '').trim()).filter(l => l.length);
let li = 0;
const next = () => lines[li++], nums = () => next().split(/\s+/).map(Number);
const bones = [];
for (let n = +next(), i = 0; i < n; i++) bones.push({ name: next(), parent: +next(), pos: nums() });
const meshes = [];
for (let n = +next(), m = 0; m < n; m++) {
  const name = next(), uvLayers = +next(), tex = [];
  for (let t = +next(), i = 0; i < t; i++) { tex.push(next()); next(); }
  const nv = +next(), pos = [], nor = [], uv = [], joints = [], weights = [];
  for (let i = 0; i < nv; i++) {
    pos.push(nums()); nor.push(nums()); next(); // vertex colour unused
    const u = nums(); uv.push([u[0], u[1]]);
    for (let k = 1; k < uvLayers; k++) next();
    joints.push(nums()); weights.push(nums());
  }
  const faces = [];
  for (let f = +next(), i = 0; i < f; i++) faces.push(nums());
  meshes.push({ name, tex, pos, nor, uv, joints, weights, faces });
}
console.log(`${bones.length} bones, ${meshes.length} meshes:`, meshes.map(m => `${m.name} (${m.pos.length} v, ${m.faces.length} f)`).join(', '));

/* ---------- bones: rename, scale to metres, rest orientation from the reference ---------- */
const map = cfg.bones;
for (const want of ['root', 'pelvis', 'spine_01', 'neck_01', 'Head', 'thigh_l', 'calf_l', 'foot_l', 'thigh_r', 'calf_r', 'foot_r',
  'upperarm_l', 'lowerarm_l', 'hand_l', 'upperarm_r', 'lowerarm_r', 'hand_r'])
  if (!Object.values(map).includes(want)) throw new Error(`bone map has no "${want}"`);
const byName = Object.fromEntries(bones.map((b, i) => [b.name, i]));
for (const k of Object.keys(map)) if (!(k in byName)) throw new Error(`model has no bone "${k}"`);
const thighIdx = byName[Object.keys(map).find(k => map[k] === 'thigh_l')];
const S = refWorld.thigh_l.p[1] / bones[thighIdx].pos[1];
console.log(`scale ${S.toFixed(5)} (model thigh at ${bones[thighIdx].pos[1]}, reference ${refWorld.thigh_l.p[1].toFixed(4)} m)`);
const used = new Set();
for (const b of bones) {
  b.p = b.pos.map(v => v * S);
  const to = map[b.name];
  b.out = to || b.name.replace(/[^\w]+/g, '_');
  if (used.has(b.out)) throw new Error(`duplicate bone name ${b.out}`);
  used.add(b.out);
  if (to && !refWorld[to]) throw new Error(`reference has no bone "${to}"`);
}
// World rotation: the reference bone's for mapped bones, the parent's (no local turn) for the rest
bones.forEach(b => { b.q = map[b.name] ? refWorld[map[b.name]].q : b.parent < 0 ? [0, 0, 0, 1] : bones[b.parent].q; });
bones.forEach((b, i) => { if (b.parent >= i) throw new Error('bones must come after their parent'); });

/* ---------- glTF ---------- */
const chunks = [];
let byteLen = 0;
const bufferViews = [], accessors = [];
function addView(typed, target) {
  const pad = (4 - (byteLen % 4)) % 4;
  if (pad) { chunks.push(Buffer.alloc(pad)); byteLen += pad; }
  const buf = Buffer.from(typed.buffer, typed.byteOffset, typed.byteLength);
  bufferViews.push({ buffer: 0, byteOffset: byteLen, byteLength: buf.length, ...(target ? { target } : {}) });
  chunks.push(buf); byteLen += buf.length;
  return bufferViews.length - 1;
}
function addAccessor(typed, componentType, type, count, target, minmax) {
  accessors.push({ bufferView: addView(typed, target), componentType, count, type, ...minmax });
  return accessors.length - 1;
}

const primitives = [];
for (const m of meshes) {
  const n = m.pos.length;
  const P = new Float32Array(n * 3), N = new Float32Array(n * 3), T = new Float32Array(n * 2), J = new Uint16Array(n * 4), W = new Float32Array(n * 4);
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < n; i++) {
    for (let k = 0; k < 3; k++) {
      const v = m.pos[i][k] * S; P[i * 3 + k] = v; min[k] = Math.min(min[k], v); max[k] = Math.max(max[k], v);
    }
    const l = Math.hypot(...m.nor[i]) || 1;
    for (let k = 0; k < 3; k++) N[i * 3 + k] = m.nor[i][k] / l;
    // XPS UVs have their origin top-left, as glTF does: kept as they are. Values outside 0..1 (u up to 2,
    // v down to -1 here) rely on the sampler repeating the texture, as XNALara does.
    T[i * 2] = m.uv[i][0]; T[i * 2 + 1] = m.uv[i][1];
    let ws = 0;
    for (let k = 0; k < 4; k++) ws += Math.max(0, m.weights[i][k] || 0);
    for (let k = 0; k < 4; k++) {
      const w = ws > 0 ? Math.max(0, m.weights[i][k] || 0) / ws : k === 0 ? 1 : 0;
      J[i * 4 + k] = w > 0 ? m.joints[i][k] : 0; W[i * 4 + k] = w;
    }
  }
  // Front faces must wind counter-clockwise; XNALara models are often clockwise. Vote with the normals.
  let vote = 0;
  for (const [a, b, c] of m.faces) {
    const fn = cross(sub(m.pos[b], m.pos[a]), sub(m.pos[c], m.pos[a]));
    vote += Math.sign(dot(fn, m.nor[a]) + dot(fn, m.nor[b]) + dot(fn, m.nor[c]));
  }
  const flip = vote < 0;
  const I = new (n > 65535 ? Uint32Array : Uint16Array)(m.faces.length * 3);
  m.faces.forEach(([a, b, c], i) => { I[i * 3] = a; I[i * 3 + 1] = flip ? c : b; I[i * 3 + 2] = flip ? b : c; });
  console.log(`${m.name}: winding ${flip ? 'flipped' : 'kept'} (vote ${vote})`);
  primitives.push({
    attributes: {
      POSITION: addAccessor(P, 5126, 'VEC3', n, 34962, { min, max }),
      NORMAL: addAccessor(N, 5126, 'VEC3', n, 34962),
      TEXCOORD_0: addAccessor(T, 5126, 'VEC2', n, 34962),
      JOINTS_0: addAccessor(J, 5123, 'VEC4', n, 34962),
      WEIGHTS_0: addAccessor(W, 5126, 'VEC4', n, 34962),
    },
    indices: addAccessor(I, n > 65535 ? 5125 : 5123, 'SCALAR', I.length, 34963),
    material: 0,
  });
}

const ibm = new Float32Array(bones.length * 16);
bones.forEach((b, i) => ibm.set(invBind(b.q, b.p), i * 16));
const ibmAcc = addAccessor(ibm, 5126, 'MAT4', bones.length);

const nodes = bones.map((b, i) => {
  const pq = b.parent < 0 ? [0, 0, 0, 1] : bones[b.parent].q, pp = b.parent < 0 ? [0, 0, 0] : bones[b.parent].p;
  const node = { name: b.out, rotation: qnorm(qmul(qinv(pq), b.q)), translation: qrot(qinv(pq), sub(b.p, pp)) };
  const children = bones.map((c, j) => (c.parent === i ? j : -1)).filter(j => j >= 0);
  if (children.length) node.children = children;
  return node;
});
const meshNode = nodes.length, rootNode = meshNode + 1;
nodes.push({ name: cfg.name, mesh: 0, skin: 0 });
nodes.push({ name: 'Armature', children: [bones.findIndex(b => b.parent < 0), meshNode] });

const outDir = path.dirname(cfg.out), base = path.basename(cfg.out);
const gltf = {
  asset: { version: '2.0', generator: 'tools/xnalara-to-gltf.js' },
  scene: 0,
  scenes: [{ nodes: [rootNode] }],
  nodes,
  meshes: [{ name: cfg.name, primitives }],
  skins: [{ joints: bones.map((_, i) => i), inverseBindMatrices: ibmAcc, skeleton: bones.findIndex(b => b.parent < 0) }],
  // The material name starts with "Skin_": the game shows its texture as it is (no painted kit)
  materials: [{ name: `Skin_${cfg.name}`, doubleSided: true,
    pbrMetallicRoughness: { baseColorTexture: { index: 0 }, metallicFactor: 0, roughnessFactor: cfg.roughness ?? 0.6 } }],
  textures: [{ source: 0, sampler: 0 }],
  samplers: [{ magFilter: 9729, minFilter: 9987, wrapS: 10497, wrapT: 10497 }],
  images: [{ uri: cfg.texture }],
  buffers: [{ uri: `${base}.bin`, byteLength: byteLen }],
  bufferViews,
  accessors,
};
fs.writeFileSync(path.join(outDir, `${base}.bin`), Buffer.concat(chunks));
fs.writeFileSync(path.join(outDir, `${base}.gltf`), JSON.stringify(gltf));
console.log(`wrote ${path.join(outDir, base)}.gltf + .bin (${(byteLen / 1024).toFixed(0)} KB)`);
