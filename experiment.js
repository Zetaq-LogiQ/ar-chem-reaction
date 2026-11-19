// experiment.js - a real multi-step lab on one bench: make copper sulphate from copper(II) oxide and dilute sulphuric acid
// (warm + stir), filter off the extra oxide, then test the blue filtrate with ammonia solution.
// Glassware: the ZetaQ chem lab kit (lab_glassware.js, unchanged; 1 kit unit = 10 cm). The group works in cm.
// Every action is "pick up, bring it to the glowing target": the piece snaps into the right pose (pour, scoop, stir, drip),
// so a hand that is a few cm off still does the right thing. Touch, mouse and hand tracking all drive the same four calls:
// hover / grab / move / release (+ tap for the lamp).
import * as THREE from './vendor/three.module.js';
import './eb_shim.js';
import './lab_glassware.js';
import { LAYOUT } from './mat.js';

const KIT = self.EB.kits.get('lab_glassware'), lib = { THREE }, U = KIT._util;
const make = (p, o = {}) => KIT[p](o, lib);
const V = (x, y, z) => new THREE.Vector3(x, y, z), UP = V(0, 1, 0);
const clamp = THREE.MathUtils.clamp, lerp = THREE.MathUtils.lerp;
const C = s => new THREE.Color(s), mixC = (a, b, k) => C(a).lerp(C(b), clamp(k, 0, 1));
const CLEAR = '#d6ecf6', BLUE = '#2f86d6', BLACK = '#232325', PALE = '#9fc7ea', DEEP = '#2a35b0';
const ACID_M = .25, NH3_M = 2, CUO_G = 1.0, M_CUO = 79.55, SQUEEZE = .5, PIP_CAP = 3;   // mol/L, g per spatula, g/mol, mL

export function createExperiment(ctx) {
  const group = new THREE.Group(), K = new THREE.Group(); K.scale.setScalar(10); group.add(K);
  const bench = make('bench', { w: 4.0, d: 2.9, shelf: false }); K.add(bench);
  const I = {};
  function add(id, obj, cm, o = {}) {
    obj.position.set(cm[0] / 10, o.y || 0, cm[1] / 10); if (o.rot) obj.rotation.set(...o.rot); K.add(obj);
    const it = I[id] = Object.assign({ id, obj, kind: 'static', name: id, seg: [V(0, 0, 0), V(0, .5, 0)], r: .1, gf: .55, holdQ: new THREE.Quaternion() }, o);
    it.home = obj.position.clone(); it.homeQ = obj.quaternion.clone();
    obj.traverse(m => { m.userData.item = id; });
    return it;
  }
  const L = id => I[id].obj.userData.lab;

  // ---------------------------------------------------------------- the bench
  add('acid', make('bottle', { label: 'Dilute sulphuric acid', color: 'none' }), LAYOUT.acid, { kind: 'pour', name: 'Dilute sulphuric acid', seg: [V(0, .1, 0), V(0, .85, 0)], r: .2, gf: .8, cap: 250, rate: 14 });
  const jar = add('jar', make('jar', { label: 'Copper(II) oxide', color: '#1f1f22', fill: .6 }), LAYOUT.jar, { name: 'Copper(II) oxide powder', seg: [V(0, 0, 0), V(0, .55, 0)], r: .25 });
  jar.obj.children.forEach(c => { if (Math.abs(c.position.y - .55) < 1e-6) c.visible = false; });   // lid off
  add('spatula', make('spatula'), LAYOUT.spatula, { kind: 'tool', name: 'Spatula', y: .01, seg: [V(-.33, .01, 0), V(.48, .01, 0)], r: .05, gf: .2 });
  add('beaker', make('beaker', { ml: 250 }), LAYOUT.beaker, { kind: 'pour', name: 'Beaker', seg: [V(0, .05, 0), V(0, .9, 0)], r: .33, cap: 250, rate: 10 });
  add('tripod', make('tripod'), LAYOUT.tripod, { name: 'Tripod and wire gauze', seg: [V(0, .5, 0), V(0, 1, 0)], r: .4 });
  add('lamp', make('burner', { kind: 'spirit' }), LAYOUT.tripod, { kind: 'tap', name: 'Spirit lamp', seg: [V(0, .05, 0), V(0, .45, 0)], r: .27 });
  add('rod', make('rod', { l: 1.5 }), LAYOUT.rod, { kind: 'tool', name: 'Glass rod', y: .024, rot: [0, 0, -Math.PI / 2], seg: [V(0, 0, 0), V(0, 1.5, 0)], r: .04,
    holdQ: new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, .22)) });
  add('stand', make('stand', { h: 1.72, ring: .3 }), LAYOUT.stand, { name: 'Stand' });
  const fun = add('funnel', make('funnel', { paper: true }), LAYOUT.stand, { name: 'Filter funnel', y: .878, seg: [V(0, 0, 0), V(0, 1, 0)], r: .42 });
  add('flask', make('conical_flask', { ml: 250 }), LAYOUT.stand, { kind: 'pour', name: 'Conical flask', seg: [V(0, .1, 0), V(0, 1.1, 0)], r: .25, gf: .8, cap: 250, rate: 3 });
  add('rack', make('rack', { n: 2 }), LAYOUT.rack, { name: 'Test tube rack' });
  add('tube', make('test_tube', { inrack: true }), [LAYOUT.rack[0] - 1.8, LAYOUT.rack[1]], { name: 'Test tube', y: .08, seg: [V(0, 0, 0), V(0, 1.42, 0)], r: .12 });
  const amm = add('ammonia', make('dropper_bottle', { label: 'Ammonia solution', color: '#e6eef2' }), LAYOUT.ammonia, { name: 'Ammonia solution', seg: [V(0, 0, 0), V(0, .5, 0)], r: .16 });
  amm.obj.children.forEach(c => { if (Math.abs(c.position.y - .52) < 1e-6) c.visible = false; });   // its dropper is the loose one below
  // the dropper (pipette): glass tube with a rubber teat; it rests in the ammonia bottle
  const pip = new THREE.Group();
  const glass = new THREE.Mesh(U.lathe(THREE, [[.006, 0], [.012, .05], [.021, .12], [.021, .5], [.024, .52]], 14), new THREE.MeshBasicMaterial({ color: '#d5ecf5', transparent: true, opacity: .25, depthWrite: false }));
  glass.renderOrder = 3; U.ink(THREE, glass, { color: '#4f7890', w: .007, glass: true }); pip.add(glass);
  const teat = U.solid(THREE, U.lathe(THREE, [[0, .22], [.035, .2], [.055, .12], [.05, .03], [.028, 0]], 12), '#c6463a', { inkW: .006 }); teat.position.y = .5; pip.add(teat);
  const pipLiq = new THREE.Mesh(new THREE.CylinderGeometry(.015, .015, 1, 10).translate(0, .5, 0), new THREE.MeshBasicMaterial({ color: '#cfe0ea', transparent: true, opacity: .6, depthWrite: false }));
  pipLiq.position.y = .03; pipLiq.renderOrder = 2; pip.add(pipLiq);
  add('pipette', pip, LAYOUT.ammonia, { kind: 'tool', name: 'Dropper', y: .08, seg: [V(0, 0, 0), V(0, .74, 0)], r: .05, gf: .85 });
  const tubeIt = I.tube, flaskIt = I.flask;

  // ---------------------------------------------------------------- chemistry state (mL, mmol, g, deg C)
  let S;
  function fresh() {
    S = { acidB: 200, b: { V: 0, acid: 0, cu: 0, sus: 0, sed: 0, T: 25 }, scoops: 0, spatLoad: false, onTripod: false, flame: false, stir: false, boil: false,
      f: { V: 0, cu: 0, res: 0 }, fl: { V: 0, cu: 0 }, tb: { V: 0, cu: 0, nh3: 0 }, pip: PIP_CAP, done: [], said: {}, t: 0 };
  }
  fresh();
  const ACID0 = 40 * ACID_M;                                              // mmol of acid in the 40 mL the recipe uses
  const reacted = () => S.b.V > 30 && S.b.acid < ACID0 * .05 && S.b.cu > 0;
  function tubeMix() {                                                    // copper in the test tube: as Cu2+ (blue), Cu(OH)2 (pale blue solid) or [Cu(NH3)4]2+ (deep blue)
    const c = S.tb.cu, a = S.tb.nh3; if (c <= 1e-9) return { free: 0, ppt: 0, cx: 0 };
    if (a <= 2 * c) return { free: (c - a / 2) / c, ppt: a / 2 / c, cx: 0 };
    const cx = Math.min(c, (a - 2 * c) / 4); return { free: 0, ppt: (c - cx) / c, cx: cx / c };
  }

  // ---------------------------------------------------------------- the steps (guidance only: every action works whenever it makes sense)
  const STEPS = [
    { t: 'Pour about 40 mL of dilute sulphuric acid into the beaker.', why: 'This acid will dissolve the copper oxide. It is colourless.', pick: ['acid'], done: () => S.b.V >= 39.5 },
    { t: 'Add 2 spatulas of black copper(II) oxide powder to the acid.', why: 'We add more than the acid needs, so all the acid gets used up.', pick: ['spatula'], done: () => S.scoops >= 2 },
    { t: 'Put the beaker on the tripod.', why: 'The gauze spreads the heat evenly under the glass.', pick: ['beaker'], done: () => S.onTripod },
    { t: 'Light the spirit lamp (tap it).', why: 'Warming makes the reaction go much faster.', pick: ['lamp'], done: () => S.flame || reacted() },
    { t: 'Stir with the glass rod while it warms. Do not let it boil.', why: 'CuO + H₂SO₄ → CuSO₄ + H₂O. The blue colour is copper sulphate forming. Stirring keeps the powder in contact with the acid.', pick: ['rod'], done: reacted },
    { t: 'The acid is used up. Turn the lamp off (tap it).', why: 'The black powder left over is the extra copper oxide.', pick: ['lamp'], done: () => !S.flame },
    { t: 'Let the beaker cool below 40 °C.', why: 'Never hold hot glass. (Time runs faster in this lab.)', pick: [], done: () => S.b.T < 40 },
    { t: 'Pour the mixture into the filter funnel.', why: 'Filter paper lets the solution through but holds back the solid.', pick: ['beaker'], done: () => S.b.V < 1.5 && S.f.V < .3 && S.fl.V > 20 },
    { t: 'Take the flask and pour about 5 mL of the blue filtrate into the test tube.', why: 'The black copper oxide stayed on the paper. The clear blue liquid (the filtrate) is copper sulphate solution.', pick: ['flask'], done: () => S.tb.V >= 4.9 },
    { t: 'Add ammonia solution with the dropper, a little at a time. Watch closely.', why: 'Ammonia has a strong smell: keep the window open.', pick: ['pipette'], done: () => tubeMix().cx > .95 },
    { t: 'Done! You made copper sulphate and tested it with ammonia.', why: '', pick: [], done: () => false }
  ];
  function step() { for (let i = 0; i < STEPS.length; i++) { if (!S.done[i]) { if (STEPS[i].done()) S.done[i] = true; else return i; } } return STEPS.length - 1; }

  // ---------------------------------------------------------------- what each held piece can be brought to
  function targets(id) {
    const b = S.b;
    switch (id) {
      case 'acid': return S.acidB > .5 ? [['beaker', 'pour']] : [];
      case 'spatula': return S.spatLoad ? [['beaker', 'tip']] : [['jar', 'scoop']];
      case 'beaker': return S.onTripod ? (reacted() || b.cu > 0 ? [['funnel', 'pour']] : []) : [['tripod', 'drop']];
      case 'rod': return S.onTripod && b.V > 1 ? [['beaker', 'stir']] : [];
      case 'flask': return S.fl.V > .5 ? [['tube', 'pour']] : [];
      case 'pipette': return [...(S.pip >= SQUEEZE && S.tb.V > .5 ? [['tube', 'drip']] : []), ...(S.pip < PIP_CAP - .01 ? [['ammonia', 'refill']] : [])];
    }
    return [];
  }
  // how much more a target takes from this source (mL)
  function accept(src, tid) {
    if (src === 'acid') { const k = 40 - S.b.V; if (k <= 0) say('acid40', "That's 40 mL. Enough acid."); return Math.max(0, k); }
    if (tid === 'funnel') { const k = 42 - S.f.V; if (k <= 0) say('funnelfull', 'Wait: let the funnel drain a little. Never fill it above the paper.'); return Math.max(0, k); }
    if (tid === 'tube') { const k = 5 - S.tb.V; if (k <= 0) say('tube5', "That's about 5 mL. Enough."); return Math.max(0, k); }
    return 0;
  }
  function say(k, msg) { if (S.said[k] && S.t - S.said[k] < 4) return; S.said[k] = S.t; ctx.toast(msg); }

  // ---------------------------------------------------------------- liquid inside a tipped vessel: find the level that keeps its volume
  // (volume samples spread through the inside; the level is the height below which the right share of them lies)
  function samples(it) {
    const Lb = it.obj.userData.lab, top = Lb.prof[Lb.prof.length - 1][1], P = [], ny = 22, nr = 4, np = 8; let Wcap = 0;
    for (let j = 0; j < ny; j++) {
      const y = Lb.y0 + (j + .5) / ny * (top - Lb.y0), R = Math.max(.004, U.rAt(Lb.prof, y) - .008), w = R * R;
      for (let k = 0; k < nr; k++) for (let m = 0; m < np; m++) {
        const r = R * Math.sqrt((k + .5) / nr), a = (m + .5) / np * Math.PI * 2 + k * .4; P.push(V(Math.cos(a) * r, y, Math.sin(a) * r)); if (y < Lb.y1) Wcap += w;
      }
      P.push(w);                                                           // the weight of this layer's points follows them
    }
    it.smp = { P, Wcap, n: nr * np }; it.ys = new Float32Array(ny * nr * np); it.ws = new Float32Array(ny * nr * np); it.ord = new Uint16Array(ny * nr * np);
  }
  const tmpV = V(0, 0, 0);
  function levelFor(it, mL) {
    if (!it.smp) samples(it);
    const { P, Wcap, n } = it.smp, m = it.obj.matrixWorld; let i = 0, wSum = 0;
    for (let q = 0; q < P.length; q += n + 1) { const w = P[q + n]; for (let k = 0; k < n; k++) { it.ys[i] = tmpV.copy(P[q + k]).applyMatrix4(m).y; it.ws[i] = w; it.ord[i] = i; i++; } wSum += w * n; }
    const ord = Array.from(it.ord).sort((a, b) => it.ys[a] - it.ys[b]), need = mL / it.cap * Wcap;
    let acc = 0; for (const o of ord) { acc += it.ws[o]; if (acc >= need) return it.ys[o]; }
    return it.ys[ord[ord.length - 1]];
  }

  // ---------------------------------------------------------------- glow: hint (pulsing gold), hover (bright gold), held (green)
  function inkMat(col, w) {
    const m = new THREE.MeshBasicMaterial({ color: col, side: THREE.BackSide });
    m.onBeforeCompile = sh => { sh.uniforms.uInk = { value: w }; sh.vertexShader = 'uniform float uInk;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n transformed += normalize(normal) * uInk;'); };
    m.customProgramCacheKey = () => 'glowink' + w; return m;
  }
  const GL = { hint: inkMat('#ffd36b', .022), hover: inkMat('#ffe27a', .03), held: inkMat('#4fe08a', .03) };
  function setGlow(it, kind) {
    if (it.glow === kind) return; it.glow = kind;
    it.obj.traverse(m => { if (!m.userData.ink) return; if (!m.userData.ink0) m.userData.ink0 = m.material; m.material = kind ? GL[kind] : m.userData.ink0; });
  }
  // the target ring: shows where to bring the piece (gold), green once it has snapped there
  const rings = [0, 1].map(() => { const r = new THREE.Mesh(new THREE.TorusGeometry(1, .06, 6, 40), new THREE.MeshBasicMaterial({ color: '#ffd36b', transparent: true, opacity: .9, depthWrite: false })); r.rotation.x = Math.PI / 2; r.renderOrder = 9; r.visible = false; K.add(r); return r; });

  // ---------------------------------------------------------------- effects: streams, drops, powder, steam, bubbles
  const streamMat = () => new THREE.MeshBasicMaterial({ color: CLEAR, transparent: true, opacity: .75, depthWrite: false });
  const mkStream = () => { const s = new THREE.Mesh(new THREE.CylinderGeometry(.016, .02, 1, 8, 1, true).translate(0, -.5, 0), streamMat()); s.visible = false; s.renderOrder = 2; K.add(s); return s; };
  const stream = mkStream(), drip = mkStream(); drip.scale.x = drip.scale.z = .35;
  const parts = []; const pGeo = new THREE.SphereGeometry(1, 8, 6);
  function spawn(p, v, col, size, life, kind) {
    let q = parts.find(x => !x.on); if (!q) { if (parts.length > 70) return; q = { m: new THREE.Mesh(pGeo, new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false })) }; q.m.renderOrder = 8; K.add(q.m); parts.push(q); }
    Object.assign(q, { on: true, v: v.clone(), t: 0, life, kind, size }); q.m.position.copy(p); q.m.scale.setScalar(size); q.m.material.color.set(col); q.m.material.opacity = kind === 'steam' ? .28 : .95; q.m.visible = true;
  }
  function stepParts(dt) {
    for (const q of parts) {
      if (!q.on) continue; q.t += dt;
      if (q.kind === 'steam') { q.m.position.addScaledVector(q.v, dt); q.m.scale.setScalar(q.size * (1 + q.t * 1.6)); q.m.material.opacity = .28 * (1 - q.t / q.life); }
      else if (q.kind === 'bubble') { q.m.position.addScaledVector(q.v, dt); if (q.m.position.y > q.top) q.t = q.life; }
      else { q.v.y -= 9.8 / 10 * dt * 6; q.m.position.addScaledVector(q.v, dt); if (q.m.position.y < q.floor) q.t = q.life; }
      if (q.t >= q.life) { q.on = false; q.m.visible = false; }
    }
  }
  const mound = new THREE.Mesh(new THREE.SphereGeometry(.05, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshToonMaterial({ color: BLACK }));
  mound.scale.y = .55; mound.position.set(.39, .025, 0); mound.visible = false; I.spatula.obj.add(mound);

  // ---------------------------------------------------------------- holding
  let held = null, hover = null;
  const mouth = id => { const it = I[id], Lb = it.obj.userData.lab; return it.obj.position.clone().add(V(0, Lb && Lb.mouth ? Lb.mouth[1] : (id === 'tripod' ? Lb.topY : .5), 0)); };
  const toK = p => K.worldToLocal(p.clone());
  function grab(id, pWorld, by) {
    const it = I[id]; if (!it || held || !(it.kind === 'pour' || it.kind === 'tool')) return false;
    if (id === 'beaker' && S.b.T > 45) { say('hot', 'Too hot to hold. Let it cool first.'); return false; }
    if (id === 'flask' && S.f.V > .3) { say('drip', 'Wait until the funnel has finished dripping.'); return false; }
    held = { id, by, cur: toK(pWorld), snap: null, b: 0, th: 0, t: 0, phi: 0 }; it.ret = false;
    ctx.sfx('pick'); return true;
  }
  function move(pWorld) { if (held) held.cur = toK(pWorld); }
  function release() {
    if (!held) return; const it = I[held.id], s = held.snap;
    if (s && s.type === 'drop' && held.b > .5) { it.home = I.tripod.obj.position.clone().add(V(0, L('tripod').topY, 0)); S.onTripod = true; ctx.sfx('place'); }
    it.ret = true; held = null; S.stir = false;
  }
  function tap(id) {
    if (id !== 'lamp') return false;
    if (!S.flame && !S.onTripod) { say('notrip', 'Put the beaker on the tripod first: never heat an empty stand.'); return true; }
    S.flame = !S.flame; KIT.setFlame(I.lamp.obj, S.flame); ctx.sfx(S.flame ? 'on' : 'off'); return true;
  }

  // pose of the held piece: free (follows the hand) blended with the snapped pose at its target
  const qA = new THREE.Quaternion(), qB = new THREE.Quaternion(), pA = V(0, 0, 0), pB = V(0, 0, 0);
  function freePose(it, cur) {
    qA.copy(it.holdQ);
    const g = it.seg[0].clone().lerp(it.seg[1], it.gf).applyQuaternion(qA);   // where the hand holds it
    pA.copy(cur).sub(g); pA.y = Math.max(pA.y, it.kind === 'tool' ? .02 : 0);
  }
  function snapPose(it, s) {
    const T = I[s.tid], M = mouth(s.tid), d = V(held.cur.x - M.x, 0, held.cur.z - M.z); if (d.lengthSq() < 1e-6) d.set(1, 0, 0); d.normalize();
    const nd = d.clone().negate(), TL = T.obj.userData.lab;
    if (s.type === 'pour') {
      const Lb = it.obj.userData.lab; qB.setFromAxisAngle(UP.clone().cross(nd).normalize(), held.th);
      const lip = nd.clone().multiplyScalar(Lb.rTop).add(V(0, Lb.mouth[1], 0)).applyQuaternion(qB);
      const at = M.clone().add(d.clone().multiplyScalar((TL.rTop || .1) * .3)).add(V(0, .1 + (s.tid === 'tube' ? .04 : 0), 0));
      pB.copy(at).sub(lip);
    } else if (s.type === 'drop') { qB.identity(); pB.copy(M).add(V(0, .05, 0)); }
    else if (s.type === 'scoop' || s.type === 'tip') {
      const yaw = Math.atan2(d.z, -d.x), dip = s.type === 'scoop' ? Math.sin(Math.min(1, s.t / .7) * Math.PI) * .12 : 0;
      const roll = s.type === 'tip' ? clamp((s.t - .25) / .35, 0, 1) * 1.7 : 0;
      qB.setFromEuler(new THREE.Euler(roll, yaw, s.type === 'scoop' ? -.25 : 0, 'YXZ'));
      const blade = V(.39, .02, 0).applyQuaternion(qB);
      pB.copy(M).add(V(0, s.type === 'scoop' ? -.06 - dip : .1, 0)).sub(blade);
    } else if (s.type === 'stir') {
      const r = .13, c = V(Math.cos(held.phi) * r, 0, Math.sin(held.phi) * r);
      qB.setFromAxisAngle(V(-c.z, 0, c.x).normalize(), -.2);              // leaning in, its top outside the rim
      pB.copy(T.obj.position).add(c).add(V(0, TL.y0 + .02, 0));
    } else if (s.type === 'drip' || s.type === 'refill') {
      qB.identity(); pB.copy(M).add(V(0, s.type === 'drip' ? .1 : -.42, 0));
    }
  }

  // ---------------------------------------------------------------- the frame
  function update(dt, time) {
    S.t += dt; const b = S.b;
    // held piece
    if (held) {
      const it = I[held.id], tg = targets(held.id);
      let s = held.snap;
      if (s && !tg.some(t => t[0] === s.tid)) s = held.snap = null;                // that target is no longer valid (e.g. the spatula is loaded now)
      const near = (tid, r) => { const M = mouth(tid); return Math.hypot(held.cur.x - M.x, held.cur.z - M.z) < r && held.cur.y > M.y - .3; };
      if (s && !near(s.tid, .95)) s = held.snap = null;
      held.cool = Math.max(0, (held.cool || 0) - dt);
      if (!s && !held.cool) {                                              // snap to the nearest valid target within 5 cm
        let bd = .5; for (const [tid, type] of tg) { const M = mouth(tid), d = Math.hypot(held.cur.x - M.x, held.cur.z - M.z); if (d < bd && held.cur.y > M.y - .3) { bd = d; s = held.snap = { tid, type, t: 0 }; } }
        if (s) { held.th = 0; ctx.sfx('snap'); }
      }
      held.b = clamp(held.b + (s ? 4 : -5) * dt, 0, 1);
      if (s) { s.t += dt * held.b; if (s.type === 'stir') held.phi += 5 * dt; }
      freePose(it, held.cur);
      if (s) { snapPose(it, s); pA.lerp(pB, ease(held.b)); qA.slerp(qB, ease(held.b)); }
      const k = 1 - Math.exp(-dt * 16); it.obj.position.lerp(pA, k); it.obj.quaternion.slerp(qA, k);
      it.obj.updateMatrixWorld(true);
      act(it, s, dt);
    } else { stream.visible = false; S.stir = false; }
    // pieces going back home
    for (const id in I) { const it = I[id]; if (!it.ret) continue; const k = 1 - Math.exp(-dt * 9); it.obj.position.lerp(it.home, k); it.obj.quaternion.slerp(it.homeQ, k); if (it.obj.position.distanceTo(it.home) < .002) { it.obj.position.copy(it.home); it.obj.quaternion.copy(it.homeQ); it.ret = false; } }
    if (S.onTripod && !(held && held.id === 'beaker')) I.beaker.home.copy(I.tripod.obj.position).add(V(0, L('tripod').topY, 0));

    // heat, reaction, settling (time runs about 20x faster than a real lab)
    const heating = S.flame && S.onTripod && !(held && held.id === 'beaker');
    const Teq = heating ? 102 : 25, tau = heating ? 14 : 8;
    b.T += (Teq - b.T) * (1 - Math.exp(-dt / tau)); S.boil = b.T > 98 && b.V > 1; if (S.boil) { b.T = Math.min(b.T, 100); say('boil', 'It is boiling and may spit! Turn the lamp off for a moment.'); }
    else if (b.T > 88 && heating) say('hot88', 'Nearly boiling: turn the lamp off for a moment.');
    if (b.V > 1) {
      const nCuO = (b.sus + b.sed) / M_CUO * 1000;
      if (nCuO > 0 && b.acid > 0) {
        const kT = .06 * Math.exp((b.T - 70) / 10), stirF = S.stir ? 2.5 : S.boil ? 1.6 : 1, contact = (b.sus + .3 * b.sed) / (b.sus + b.sed);
        const dn = Math.min(kT * stirF * contact * b.acid * Math.min(1, nCuO / 2) * dt, b.acid, nCuO);
        b.acid -= dn; b.cu += dn; const g = dn * M_CUO / 1000, fs = b.sus / (b.sus + b.sed); b.sus = Math.max(0, b.sus - g * fs); b.sed = Math.max(0, b.sed - g * (1 - fs));
      }
      if (S.stir || S.boil) { const d = b.sed * 2.2 * dt; b.sed -= d; b.sus += d; } else { const d = b.sus * .35 * dt; b.sus -= d; b.sed += d; }
    } else { b.sed += b.sus; b.sus = 0; }
    // the funnel drips into the flask
    if (S.f.V > 0) { const dv = Math.min(S.f.V, 2.6 * dt), c = S.f.cu / S.f.V; S.f.V -= dv; S.f.cu -= c * dv; S.fl.V += dv; S.fl.cu += c * dv; if (S.f.V < 1e-4) { S.f.V = 0; S.f.cu = 0; } }

    draw(time, dt);
    stepParts(dt);
    glows(time);
  }
  const ease = x => x * x * (3 - 2 * x);

  // what the held piece does at its target
  let dripT = 0, steamT = 0, bubT = 0;
  function act(it, s, dt) {
    stream.visible = false; S.stir = false;
    if (!s || held.b < .9) return;
    if (s.type === 'pour') {
      const vol = it.id === 'acid' ? S.acidB : it.id === 'beaker' ? S.b.V : S.fl.V, Lb = it.obj.userData.lab;
      const lipW = it.obj.localToWorld(V(0, 0, 0).add(V(held.cur.x, 0, held.cur.z).sub(mouth(s.tid)).setY(0).normalize().negate().multiplyScalar(Lb.rTop)).add(V(0, Lb.mouth[1], 0)));
      const cut = levelFor(it, vol), room = accept(it.id, s.tid), pouring = vol > .05 && cut >= lipW.y - .05;
      if (room <= 0) held.th = Math.max(0, held.th - .7 * dt);
      else if (!pouring) held.th = Math.min(2.1, held.th + 1.2 * dt);
      if (pouring && room > 0) {
        const dv = Math.min(it.rate * dt, vol, room); transfer(it.id, s.tid, dv);
        const a = toK(lipW), T = I[s.tid], TL = T.obj.userData.lab, surf = T.obj.position.y + (TL.surfaceY != null ? TL.surfaceY : TL.y0);
        stream.position.copy(a); stream.scale.y = Math.max(.01, a.y - surf); stream.visible = true; stream.material.color.copy(liqColour(it.id).c);
      }
    } else if (s.type === 'scoop') { if (s.t > .7 && !S.spatLoad) { S.spatLoad = true; mound.visible = true; ctx.sfx('scoop'); held.cool = .8; } }
    else if (s.type === 'tip') {
      if (s.t > .5 && S.spatLoad) {
        S.spatLoad = false; mound.visible = false; S.scoops++; held.cool = .8; if (S.b.V > 1) S.b.sus += CUO_G; else S.b.sed += CUO_G; ctx.sfx('pour');
        const p = I.spatula.obj.localToWorld(V(.39, .03, 0)), q = toK(p), floor = I.beaker.obj.position.y + (L('beaker').surfaceY || .05);
        for (let i = 0; i < 14; i++) { const pp = q.clone().add(V((Math.random() - .5) * .05, 0, (Math.random() - .5) * .05)); const qq = spawn(pp, V(0, -.1 - Math.random() * .2, 0), BLACK, .008 + Math.random() * .006, 1.2, 'powder'); }
        parts.forEach(x => { if (x.kind === 'powder') x.floor = floor; });
      }
    } else if (s.type === 'stir') S.stir = S.b.V > 1;
    else if (s.type === 'drip') {
      dripT -= dt;
      if (dripT <= 0 && S.pip >= SQUEEZE - 1e-6) {
        dripT = .8; S.pip -= SQUEEZE; S.tb.V += SQUEEZE; S.tb.nh3 += SQUEEZE * NH3_M; ctx.sfx('drop');
        const tip = toK(I.pipette.obj.localToWorld(V(0, 0, 0))), floor = tubeIt.obj.position.y + (tubeIt.obj.userData.lab.surfaceY || .1);
        for (let i = 0; i < 3; i++) spawn(tip.clone().add(V(0, -i * .04, 0)), V(0, -.2, 0), '#e6eef2', .009, 1, 'drop');
        parts.forEach(x => { if (x.kind === 'drop') x.floor = floor; });
        const m = tubeMix(); if (m.ppt > .3 && m.cx < .05) say('ppt', 'A pale blue solid forms: copper hydroxide.'); if (m.cx > .5) say('deep', 'The solid dissolves: deep blue! That is the copper-ammonia complex.');
      } else if (S.pip < SQUEEZE) say('refill', 'The dropper is empty: put it back in the ammonia bottle to refill.');
    } else if (s.type === 'refill') { if (s.t > .6 && S.pip < PIP_CAP) { S.pip = PIP_CAP; ctx.sfx('scoop'); held.cool = .8; } }
  }
  function transfer(src, tid, dv) {
    const b = S.b;
    if (src === 'acid') { S.acidB -= dv; b.V += dv; b.acid += dv * ACID_M; return; }
    if (src === 'beaker') {
      const fr = dv / b.V, cu = b.cu * fr, ac = b.acid * fr, sus = b.sus * fr, sed = Math.min(b.sed, b.sed * fr * (b.V - dv < 8 ? 3 : .15));
      b.V -= dv; b.cu -= cu; b.acid -= ac; b.sus -= sus; b.sed -= sed; S.f.V += dv; S.f.cu += cu; S.f.res += sus + sed;   // the paper keeps every grain of solid
      if (b.V < .3) { S.f.res += b.sus + b.sed; b.sus = b.sed = 0; }
      return;
    }
    if (src === 'flask') { const fr = dv / S.fl.V, cu = S.fl.cu * fr; S.fl.V -= dv; S.fl.cu -= cu; S.tb.V += dv; S.tb.cu += cu; }
  }

  // colours of what is in each vessel
  function liqColour(id) {
    if (id === 'acid') return { c: C(CLEAR), a: .35 };
    if (id === 'beaker') {
      const b = S.b, w = b.V > .5 ? clamp(b.cu / b.V / ACID_M, 0, 1) : 0, k = b.V > .5 ? clamp(b.sus / Math.max(b.V, 10) * 30, 0, .85) : 0;
      return { c: mixC(CLEAR, BLUE, .9 * w).lerp(C(BLACK), k), a: .36 + .3 * w + .5 * k };
    }
    if (id === 'funnel' || id === 'flask') { const o = id === 'funnel' ? S.f : S.fl, w = o.V > .1 ? clamp(o.cu / o.V / ACID_M, 0, 1) : 0; return { c: mixC(CLEAR, BLUE, .9 * w), a: .36 + .3 * w }; }
    if (id === 'tube') {
      const m = tubeMix(), base = S.tb.V > .1 ? clamp(S.tb.cu / S.tb.V / ACID_M, 0, 1) : 0;
      const c = mixC(CLEAR, BLUE, .9 * base).multiplyScalar(m.free).add(C(PALE).multiplyScalar(m.ppt)).add(C(DEEP).multiplyScalar(m.cx));
      if (m.free + m.ppt + m.cx === 0) c.set(CLEAR);
      return { c, a: .4 + .3 * base * m.free + .5 * m.ppt + .4 * m.cx };
    }
    return { c: C(CLEAR), a: .35 };
  }
  const hex = c => '#' + c.getHexString();
  function contents(id, mL, cap, extra = {}) {
    const it = I[id], col = liqColour(id), tipped = it.obj.quaternion.angleTo(it.homeQ) > .03;
    if (tipped && mL > .05) KIT.setContents(it.obj, { layers: [{ from: 0, to: 1, color: hex(col.c), alpha: col.a }], tilt: levelFor(it, mL) }, lib);
    else KIT.setContents(it.obj, Object.assign({ layers: mL > .05 ? [{ from: 0, to: mL / cap, color: hex(col.c), alpha: col.a }] : [] }, extra), lib);
  }
  function draw(time, dt) {
    const b = S.b;
    contents('acid', S.acidB, 250);
    contents('beaker', b.V, 250, { sediment: b.sed > .02 ? { to: Math.min(.06, b.sed * .012), color: BLACK } : null });
    contents('funnel', S.f.V, 60);
    KIT.setResidue(fun.obj, S.f.res > .02 ? { color: BLACK, amount: clamp(S.f.res / 2.5, 0, 1) } : null, lib);
    contents('flask', S.fl.V, 250);
    contents('tube', S.tb.V, 20);
    pipLiq.scale.y = Math.max(.001, S.pip / PIP_CAP * .42); pipLiq.visible = S.pip > .01;
    KIT.flicker(I.lamp.obj, time);
    // the funnel drip
    if (S.f.V > 0) {
      const tipK = fun.obj.position.clone(), fl = flaskIt.obj, surf = fl.position.y + (fl.userData.lab.surfaceY || fl.userData.lab.y0);
      drip.position.copy(tipK); drip.scale.y = Math.max(.01, tipK.y - surf); drip.visible = true; drip.material.color.copy(liqColour('funnel').c);
    } else drip.visible = false;
    // steam above warm liquid, bubbles when boiling
    const bk = I.beaker.obj, top = bk.position.clone().add(V(0, L('beaker').mouth[1], 0));
    steamT -= dt; if (b.T > 60 && b.V > 1 && steamT <= 0) { steamT = S.boil ? .12 : .45 - (b.T - 60) / 100; spawn(top.clone().add(V((Math.random() - .5) * .3, 0, (Math.random() - .5) * .3)), V((Math.random() - .5) * .05, .25, 0), '#ffffff', .03, 2, 'steam'); }
    bubT -= dt; if (S.boil && bubT <= 0) { bubT = .06; const r = Math.random() * .25, a = Math.random() * 6.3; const q = spawn(bk.position.clone().add(V(Math.cos(a) * r, L('beaker').y0 + .02, Math.sin(a) * r)), V(0, .5, 0), '#ffffff', .012, 2, 'bubble'); }
    parts.forEach(x => { if (x.kind === 'bubble') x.top = bk.position.y + (L('beaker').surfaceY || 0); });
  }

  function glows(time) {
    const si = step(), pulse = .5 + .5 * Math.sin(time * 5);
    GL.hint.color.copy(mixC('#c98a1c', '#ffe27a', pulse));
    const hints = held ? [] : STEPS[si].pick;
    for (const id in I) { const it = I[id]; setGlow(it, held && held.id === id ? 'held' : hover === id ? 'hover' : hints.includes(id) ? 'hint' : null); }
    const tg = held ? targets(held.id) : [];
    rings.forEach((r, i) => {
      const t = tg[i]; r.visible = !!t; if (!t) return;
      const T = I[t[0]], TL = T.obj.userData.lab, rad = (TL && TL.rTop ? TL.rTop : t[0] === 'tripod' ? .3 : .2) + .03, snapped = held.snap && held.snap.tid === t[0];
      r.position.copy(mouth(t[0])).add(V(0, .01, 0)); r.scale.setScalar(rad * (snapped ? 1 : 1 + .08 * pulse));
      r.material.color.set(snapped ? '#4fe08a' : '#ffd36b'); r.material.opacity = snapped ? .95 : .55 + .4 * pulse;
    });
  }

  // ---------------------------------------------------------------- finding pieces
  const segW = it => [it.obj.localToWorld(it.seg[0].clone()), it.obj.localToWorld(it.seg[1].clone())];
  // world units per cm: 1 on screen and in the desk lab (cm), 0.01 x size in room AR (metres)
  const wsV = V(0, 0, 0), ws = () => K.getWorldScale(wsV).x / 10;
  const pickable = it => it.kind === 'pour' || it.kind === 'tool' || it.kind === 'tap';
  // the piece nearest to a point in the room (cm), within max cm of its surface
  // (the piece the current step needs - the glowing one - wins a close call)
  function nearest(p, max) {
    const w = ws(); let best = null, bd = max * w; const l = new THREE.Line3(), q = V(0, 0, 0), hints = held ? [] : STEPS[step()].pick;
    for (const id in I) { const it = I[id]; if (!pickable(it) || it.ret) continue; const [a, c] = segW(it); l.set(a, c); l.closestPointToPoint(p, true, q); const d = q.distanceTo(p) - (it.r * 10 + (hints.includes(id) ? 1.5 : 0)) * w; if (d < bd) { bd = d; best = id; } }
    return best;
  }
  // every piece that can be picked, as a segment (world cm) + radius, for picking on screen
  function pickables() { const hints = held ? [] : STEPS[step()].pick; return Object.values(I).filter(it => pickable(it) && !it.ret).map(it => { const [a, c] = segW(it); return { id: it.id, a, c, r: it.r * 10 * ws(), hint: hints.includes(it.id) }; }); }
  // the piece a screen ray points at (a ray passing within tol cm still counts: a finger is wide)
  function pickRay(ray, tol = 2) {
    const w = ws(); let best = null, bd = tol * w;
    for (const id in I) { const it = I[id]; if (!pickable(it)) continue; const [a, c] = segW(it); const d = Math.sqrt(ray.distanceSqToSegment(a, c)) - it.r * 10 * w; if (d < bd) { bd = d; best = id; } }
    return best;
  }
  // how high a touch drag should carry this piece (world cm) so it clears its targets
  const liftFor = id => targets(id).reduce((m, t) => Math.max(m, K.localToWorld(mouth(t[0])).y + 2.5 * ws()), -Infinity);
  const anchor = id => { const [a, c] = segW(I[id]); return a.y > c.y ? a : c; };
  const grabPoint = id => { const it = I[id]; return it.obj.localToWorld(it.seg[0].clone().lerp(it.seg[1], it.gf)); };

  // ---------------------------------------------------------------- the step card
  function card() {
    const si = step(), st = STEPS[si], b = S.b, rows = [];
    if (b.V > .5 || S.scoops) rows.push(['Beaker', `${Math.round(b.V)} mL · ${Math.round(b.T)} °C · ${beakerLooks()}`]);
    if (S.f.V > .2 || S.fl.V > .2) rows.push(['Flask', `${Math.round(S.fl.V)} mL ${S.fl.V > .5 ? '· clear blue' : ''}${S.f.V > .2 ? ' · dripping' : ''}`]);
    if (S.tb.V > .2) { const m = tubeMix(); rows.push(['Test tube', `${S.tb.V.toFixed(1)} mL · ${m.cx > .6 ? 'deep blue solution' : m.ppt > .15 ? 'pale blue solid' : 'blue solution'}${S.tb.nh3 > 0 ? ` · ammonia ${(S.tb.nh3 / NH3_M).toFixed(1)} mL` : ''}`]); }
    let eq = '';
    if (si === 4 || si === 5) eq = 'CuO + H₂SO₄ → CuSO₄ + H₂O';
    if (si >= 9) { const m = tubeMix(); eq = m.cx > .05 ? 'Cu(OH)₂ + 4NH₃ → [Cu(NH₃)₄]²⁺ (deep blue) + 2OH⁻' : 'CuSO₄ + 2NH₃ + 2H₂O → Cu(OH)₂ ↓ (pale blue) + (NH₄)₂SO₄'; }
    const dots = STEPS.slice(0, -1).map((_, i) => `<i class="${S.done[i] ? 'ok' : i === si ? 'now' : ''}"></i>`).join('');
    return `<div class="st"><span class="n">${si < STEPS.length - 1 ? `Step ${si + 1} of ${STEPS.length - 1}` : 'Finished'}</span><span class="dots">${dots}</span></div>` +
      `<div class="tt">${st.t}</div>${st.why ? `<div class="why">${st.why}</div>` : ''}${eq ? `<div class="eq">${eq}</div>` : ''}` +
      (rows.length ? `<table>${rows.map(r => `<tr><th>${r[0]}</th><td>${r[1]}</td></tr>`).join('')}</table>` : '') +
      (si === 0 ? '<div class="safe">Wear safety goggles: acid and ammonia hurt eyes and skin.</div>' : '');
  }
  function beakerLooks() {
    const b = S.b; if (b.V < .5) return b.sed + b.sus > .05 ? 'black powder' : 'empty';
    const blue = b.cu / b.V / ACID_M, dark = b.sus / Math.max(b.V, 10) * 30;
    return `${dark > .3 ? 'cloudy black, ' : ''}${blue > .6 ? 'blue' : blue > .15 ? 'light blue' : 'colourless'}${b.sed > .05 ? ', black powder at the bottom' : ''}${S.boil ? ', boiling' : ''}`;
  }
  function label(id) {
    const it = I[id]; if (!it) return '';
    if (held && held.id === id) { const tg = targets(id); return tg.length ? `${it.name} → ${I[tg[0][0]].name.toLowerCase()}` : it.name; }
    return it.kind === 'tap' ? `${it.name} · tap to ${S.flame ? 'put out' : 'light'}` : `${it.name} · pick up`;
  }

  // ---------------------------------------------------------------- skip a step (for a teacher demo or testing)
  function skip() {
    const si = step(), b = S.b;
    if (held) release();
    if (si === 0) { S.acidB -= 40 - b.V; b.acid += (40 - b.V) * ACID_M; b.V = 40; }
    else if (si === 1) { b.sed += (2 - S.scoops) * CUO_G; S.scoops = 2; }
    else if (si === 2) { S.onTripod = true; I.beaker.home.copy(I.tripod.obj.position).add(V(0, L('tripod').topY, 0)); I.beaker.ret = true; }
    else if (si === 3) { S.flame = true; KIT.setFlame(I.lamp.obj, true); }
    else if (si === 4) { const n = b.acid; b.acid = 0; b.cu += n; b.sed = Math.max(0, b.sed + b.sus - n * M_CUO / 1000); b.sus = 0; b.T = Math.max(b.T, 72); }
    else if (si === 5) { S.flame = false; KIT.setFlame(I.lamp.obj, false); }
    else if (si === 6) b.T = 30;
    else if (si === 7) { S.fl.V += b.V + S.f.V; S.fl.cu += b.cu + S.f.cu; S.f.res += b.sus + b.sed; b.V = b.cu = b.acid = b.sus = b.sed = 0; S.f.V = S.f.cu = 0; }
    else if (si === 8) { const dv = 5 - S.tb.V, c = S.fl.cu / S.fl.V; S.fl.V -= dv; S.fl.cu -= c * dv; S.tb.V += dv; S.tb.cu += c * dv; }
    else if (si === 9) { S.tb.nh3 = S.tb.cu * 6.2; S.tb.V += 4; }
  }
  function restart() {
    if (held) held = null;
    for (const id in I) { const it = I[id]; it.obj.position.copy(it.home0 || (it.home0 = it.home.clone())); it.home.copy(it.home0); it.obj.quaternion.copy(it.homeQ); it.ret = false; }
    KIT.setFlame(I.lamp.obj, false); mound.visible = false; parts.forEach(q => { q.on = false; q.m.visible = false; }); fresh();
  }
  for (const id in I) I[id].home0 = I[id].home.clone();

  return {
    group, bench: [bench], I, get S() { return S; }, get held() { return held && held.id; }, get snapped() { return !!(held && held.snap && held.b > .9); },
    set hover(id) { hover = id; }, get hover() { return hover; },
    grab, move, release, tap, update, nearest, pickables, pickRay, anchor, liftFor, grabPoint, card, label, skip, restart, step, kindOf: id => I[id] && I[id].kind
  };
}
