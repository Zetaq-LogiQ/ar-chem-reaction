// main.js - ZetaQ desk chemistry lab. Two ways in:
//   3D view   : the bench on screen; drag a piece to its glowing target (touch or mouse), drag the background to turn the view.
//   Desk lab  : phone on a stand looking at the printed mat; the glassware stands on the mat at true size and you work it
//               with your real hand (pinch = hold, open = let go) or with touch. See desk.js (camera + mat) and hand.js.
import * as THREE from './vendor/three.module.js';
import { createExperiment } from './experiment.js';
import { createDesk } from './desk.js';
import { createHand } from './hand.js';
import { createARLab } from './arlab.js';

const $ = id => document.getElementById(id), V = (x, y, z) => new THREE.Vector3(x, y, z);
const clamp = THREE.MathUtils.clamp;
const show = (id, on) => $(id).classList.toggle('hide', !on);

// ------------------------------------------------------------------ renderer / scene
const canvas = $('cv');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(2, devicePixelRatio || 1)); renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.setClearColor(0, 0);
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const scene = new THREE.Scene();
scene.add(new THREE.HemisphereLight('#fff6e8', '#8a7a68', 1.6));
const sun = new THREE.DirectionalLight('#ffffff', 1.6); sun.position.set(-20, 45, 25); sun.castShadow = true; sun.shadow.mapSize.set(1024, 1024);
Object.assign(sun.shadow.camera, { left: -30, right: 30, top: 30, bottom: -30, near: 5, far: 120 }); sun.shadow.bias = -.0005; scene.add(sun, sun.target);
const camera = new THREE.PerspectiveCamera(32, 1, 1, 600);

let toastT = 0;
function toast(msg) { const t = $('toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), 2600); }
let actx = null;
function sfx(k) {
  try {
    actx = actx || new AudioContext(); const o = actx.createOscillator(), g = actx.createGain(), t = actx.currentTime;
    const f = { pick: 520, snap: 760, place: 330, on: 220, off: 180, scoop: 640, pour: 300, drop: 980 }[k] || 440;
    o.frequency.setValueAtTime(f, t); o.frequency.exponentialRampToValueAtTime(f * .6, t + .09);
    g.gain.setValueAtTime(.08, t); g.gain.exponentialRampToValueAtTime(.001, t + .14); o.connect(g).connect(actx.destination); o.start(t); o.stop(t + .15);
  } catch (e) { }
}

const E = createExperiment({ toast, sfx }); scene.add(E.group);
const ar = createARLab({ renderer, scene, camera, E, $, show: (id, on) => show(id, on), toast, sfx, onStop: () => layout() });
const catcher = new THREE.Mesh(new THREE.PlaneGeometry(120, 120), new THREE.ShadowMaterial({ opacity: .28 }));
catcher.rotation.x = -Math.PI / 2; catcher.position.y = .02; catcher.receiveShadow = true; catcher.visible = false; scene.add(catcher);

// the hand cursor: a dot at your pinch point, its shadow on the table and a thin line between (so you can see its height)
const cur = new THREE.Group(); cur.visible = false; scene.add(cur);
const curDot = new THREE.Mesh(new THREE.SphereGeometry(.55, 16, 10), new THREE.MeshBasicMaterial({ color: '#6fe0ff', transparent: true, opacity: .9, depthTest: false }));
const curShadow = new THREE.Mesh(new THREE.RingGeometry(.35, .7, 24).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#08202e', transparent: true, opacity: .45, depthWrite: false }));
const curLine = new THREE.Mesh(new THREE.CylinderGeometry(.05, .05, 1, 6).translate(0, .5, 0), new THREE.MeshBasicMaterial({ color: '#6fe0ff', transparent: true, opacity: .45, depthWrite: false }));
curDot.renderOrder = 20; cur.add(curDot, curShadow, curLine); curShadow.renderOrder = 19;

// ------------------------------------------------------------------ 3D view camera: framed on the bench, drag to turn, pinch / wheel to zoom
const orb = { yaw: 14, pitch: 42, zoom: 1, t: V(0, 6, 2) };
function view() { const top = $('card').offsetHeight + 16, bot = $('bar').offsetHeight + 24; return { top, bot, h: Math.max(120, innerHeight - top - bot) }; }
function orbitCamera() {
  const v = view(), tf = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)), aspect = innerWidth / innerHeight;
  const dist = Math.max(30 / 2 / (tf * v.h / innerHeight), 42 / 2 / (tf * aspect)) * orb.zoom;
  const y = THREE.MathUtils.degToRad(orb.yaw), p = THREE.MathUtils.degToRad(orb.pitch);
  camera.fov = 32; camera.aspect = aspect; camera.near = 1; camera.far = 600;
  camera.position.set(orb.t.x + dist * Math.sin(y) * Math.cos(p), orb.t.y + dist * Math.sin(p), orb.t.z + dist * Math.cos(y) * Math.cos(p)); camera.lookAt(orb.t);
  camera.setViewOffset(innerWidth, innerHeight, 0, -(v.top - v.bot) / 2, innerWidth, innerHeight); camera.updateProjectionMatrix();
}
function layout() { renderer.setSize(innerWidth, innerHeight, false); }
addEventListener('resize', layout); layout();

// ------------------------------------------------------------------ modes
const vid = $('vid'), desk = createDesk(vid), hand = createHand(vid, s => handMsg = s);
let mode = '3d', mirror = false, handMsg = '', handOn = true;
$('bDesk').onclick = () => show('help', true);
$('bHelpX').onclick = () => show('help', false);
$('bBack').onclick = () => startDesk('environment');
$('bFront').onclick = () => startDesk('user');
async function startDesk(facing) {
  show('help', false);
  try { await desk.start(facing); } catch (e) { console.warn(e); return toast('Could not open the camera. Allow camera access and try again.'); }
  mode = 'desk'; mirror = facing === 'user'; document.body.classList.toggle('mirror', mirror); document.body.classList.add('desk');
  E.bench.forEach(o => o.visible = false); catcher.visible = true; E.group.visible = false; show('vid', true);
  camera.clearViewOffset(); show('bDesk', false); ['bCal', 'bHandT', 'bExit'].forEach(id => show(id, true));
  hand.load();
}
function stopDesk() {
  desk.stop(); mode = '3d'; mirror = false; document.body.classList.remove('mirror', 'desk');
  E.bench.forEach(o => o.visible = true); catcher.visible = false; E.group.visible = true; show('vid', false); cur.visible = false; if (handHolding) { E.release(); handHolding = false; }
  show('bDesk', true); ['bCal', 'bHandT', 'bExit'].forEach(id => show(id, false)); layout();
}
$('bExit').onclick = stopDesk;
$('bARlab').onclick = () => { show('help', false); ar.start(); };
$('bSkip').onclick = () => E.skip();
$('bRestart').onclick = () => E.restart();
$('bCal').onclick = () => { if (!hand.ready) return toast('Hand tracking is still loading.'); hand.calStart(); };
$('bHandT').onclick = () => { handOn = !handOn; $('bHandT').textContent = handOn ? 'Hand: on' : 'Hand: off'; if (!handOn) { cur.visible = false; if (handHolding) { E.release(); handHolding = false; } } };

// ------------------------------------------------------------------ touch / mouse: drag a piece to its target, tap the lamp
const ray = new THREE.Raycaster(), ptr = new Map(); let touch = null, orbitDrag = null, pinch0 = 0;
const sx = x => mirror ? innerWidth - x : x;                            // the front camera picture is shown mirrored
function rayAt(x, y) { ray.setFromCamera(new THREE.Vector2(sx(x) / innerWidth * 2 - 1, -y / innerHeight * 2 + 1), camera); return ray.ray; }
const plane = new THREE.Plane(V(0, 1, 0), 0), hit = V(0, 0, 0);
// the piece nearest the finger on screen (within 34 px of its outline); the glowing piece the step needs wins a close call
function pickScreen(x, y) {
  const px = v => { const p = v.clone().project(camera); return { x: (p.x + 1) / 2 * innerWidth, y: (1 - p.y) / 2 * innerHeight, z: p.z }; };
  const right = V(1, 0, 0).applyQuaternion(camera.quaternion); let best = null, bd = 34;
  for (const c of E.pickables()) {
    const a = px(c.a), b = px(c.c); if (a.z > 1 || b.z > 1) continue;
    const r = Math.hypot(px(c.a.clone().addScaledVector(right, c.r)).x - a.x, px(c.a.clone().addScaledVector(right, c.r)).y - a.y);
    const dx = b.x - a.x, dy = b.y - a.y, L2 = dx * dx + dy * dy || 1, t = clamp(((x - a.x) * dx + (y - a.y) * dy) / L2, 0, 1);
    const d = Math.hypot(x - a.x - t * dx, y - a.y - t * dy) - r - (c.hint ? 18 : 0);
    if (d < bd) { bd = d; best = c.id; }
  }
  return best;
}
function planeHit(x, y) { return rayAt(x, y).intersectPlane(plane, hit) ? hit.clone() : null; }
canvas.addEventListener('pointerdown', e => {
  canvas.setPointerCapture(e.pointerId); ptr.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (ptr.size === 2) { orbitDrag = null; const [a, b] = [...ptr.values()]; pinch0 = Math.hypot(a.x - b.x, a.y - b.y); return; }
  if (mode === 'desk' && !desk.ok) return;
  const id = E.held ? null : pickScreen(sx(e.clientX), e.clientY);
  if (id && E.kindOf(id) === 'tap') { E.tap(id); return; }
  if (id) {
    const g = E.grabPoint(id); plane.constant = -Math.max(g.y + 3, E.liftFor(id));   // carried just high enough to clear its targets
    const p = planeHit(e.clientX, e.clientY);
    if (p && E.grab(id, p, 'touch')) { touch = { id: e.pointerId }; E.hover = id; return; }
  }
  if (mode === '3d') orbitDrag = { x: e.clientX, y: e.clientY };
});
canvas.addEventListener('pointermove', e => {
  const q = ptr.get(e.pointerId);
  if (!q) { if (mode === '3d' && !E.held && e.pointerType === 'mouse') E.hover = pickScreen(e.clientX, e.clientY); return; }
  const dx = e.clientX - q.x, dy = e.clientY - q.y; q.x = e.clientX; q.y = e.clientY;
  if (touch && touch.id === e.pointerId) { const p = planeHit(e.clientX, e.clientY); if (p) E.move(p); return; }
  if (ptr.size === 2 && mode === '3d') { const [a, b] = [...ptr.values()], d = Math.hypot(a.x - b.x, a.y - b.y); if (pinch0) orb.zoom = clamp(orb.zoom * pinch0 / d, .45, 1.8); pinch0 = d; return; }
  if (orbitDrag) { orb.yaw -= dx * .3; orb.pitch = clamp(orb.pitch + dy * .25, 8, 80); }
});
function up(e) {
  ptr.delete(e.pointerId); if (ptr.size < 2) pinch0 = 0;
  if (touch && touch.id === e.pointerId) { E.release(); touch = null; E.hover = null; }
  if (!ptr.size) orbitDrag = null;
}
canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', up);
canvas.addEventListener('wheel', e => { e.preventDefault(); if (mode === '3d') orb.zoom = clamp(orb.zoom * Math.exp(e.deltaY * .001), .45, 1.8); }, { passive: false });

// ------------------------------------------------------------------ your hand: pinch near a piece to hold it, open your fingers to let go
let handHolding = false, openT = 0, wasPinch = false;
function handFrame(now, dt) {
  const H = hand.H, live = handOn && H.P && now - H.seen < 250;
  cur.visible = !!live && desk.ok;
  if (hand.calibrating) { const s = hand.calStep(camera); if (s === 'done') toast('Hand size set. Thank you!'); else handMsg = s; if (handHolding) { E.release(); handHolding = false; } return; }
  if (!live) {
    if (handHolding && now - H.seen > 600) { E.release(); handHolding = false; }
    if (!touch && !handHolding) E.hover = null;
    if (hand.ready && handOn) handMsg = H.P ? handMsg : 'Show your hand';
    return;
  }
  const tip = H.tip;
  curDot.position.copy(tip); curShadow.position.set(tip.x, .06, tip.z); curLine.position.set(tip.x, .06, tip.z); curLine.scale.y = Math.max(.01, tip.y - .06);
  curDot.material.color.set(H.pinch ? '#4fe08a' : '#6fe0ff'); curDot.scale.setScalar(H.pinch ? .8 : 1);
  if (touch) return;
  if (!handHolding) {
    E.hover = E.nearest(tip, 3.5);
    if (H.pinch && !wasPinch && E.hover) {
      if (E.kindOf(E.hover) === 'tap') E.tap(E.hover);
      else if (E.grab(E.hover, tip, 'hand')) { handHolding = true; openT = 0; }
    }
    handMsg = E.hover ? 'Pinch to ' + (E.kindOf(E.hover) === 'tap' ? 'use it' : 'pick it up') : 'Move your fingers to a glowing piece';
  } else {
    E.move(tip); E.hover = E.held;
    if (!H.pinch) { openT += dt; if (openT > .15) { E.release(); handHolding = false; E.hover = null; } } else openT = 0;
    handMsg = E.snapped ? 'Hold it there…' : 'Bring it to the glowing ring. Open your fingers to let go';
  }
  wasPinch = H.pinch;
}

// your real hand drawn in front of the glassware (cut out of the camera picture), unless the hand is behind the piece it is near
const fx = $('fx'), fx2 = fx.getContext('2d'), mk = document.createElement('canvas'), mk2 = mk.getContext('2d');
const BONES = [[0, 1], [1, 2], [2, 3], [3, 4], [0, 5], [5, 6], [6, 7], [7, 8], [9, 10], [10, 11], [11, 12], [13, 14], [14, 15], [15, 16], [0, 17], [17, 18], [18, 19], [19, 20], [5, 9], [9, 13], [13, 17]];
function drawHand() {
  const W = innerWidth, Hh = innerHeight;
  if (fx.width !== W || fx.height !== Hh) { fx.width = mk.width = W; fx.height = mk.height = Hh; }
  fx2.clearRect(0, 0, W, Hh);
  if (mode === 'desk' && desk.D.marks && performance.now() - (desk.D.lastSeen || 0) < 300) {   // the squares the camera can see: green outlines
    fx2.strokeStyle = '#4fe08a'; fx2.lineWidth = 3;
    for (const c of desk.D.marks) { fx2.beginPath(); c.forEach((q, i) => { const s = desk.toScreen(q.x / desk.W, q.y / desk.H, W, Hh); i ? fx2.lineTo(s.x, s.y) : fx2.moveTo(s.x, s.y); }); fx2.closePath(); fx2.stroke(); }
  }
  const H = hand.H; if (mode !== 'desk' || !handOn || !H.lm || !desk.ok || performance.now() - H.seen > 250) return;
  const near = E.held || E.hover;
  if (near && !E.held) { const g = E.grabPoint(near).applyMatrix4(camera.matrixWorldInverse); if (H.camZ[9] > -g.z + 3) return; }   // the hand is behind it
  const s = Math.max(W / desk.W, Hh / desk.H), fs = desk.f * s, pts = H.lm.map(l => desk.toScreen(l.x, l.y, W, Hh));
  mk2.clearRect(0, 0, W, Hh); mk2.fillStyle = mk2.strokeStyle = '#fff'; mk2.lineCap = mk2.lineJoin = 'round';
  mk2.beginPath(); [0, 1, 5, 9, 13, 17].forEach((i, k) => k ? mk2.lineTo(pts[i].x, pts[i].y) : mk2.moveTo(pts[i].x, pts[i].y)); mk2.closePath(); mk2.fill();
  for (const [a, b] of BONES) { mk2.lineWidth = fs * 1.9 / ((H.camZ[a] + H.camZ[b]) / 2); mk2.beginPath(); mk2.moveTo(pts[a].x, pts[a].y); mk2.lineTo(pts[b].x, pts[b].y); mk2.stroke(); }
  const vw = vid.videoWidth, vh = vid.videoHeight, vs = Math.max(W / vw, Hh / vh);
  fx2.drawImage(vid, (W - vw * vs) / 2, (Hh - vh * vs) / 2, vw * vs, vh * vs);
  fx2.globalCompositeOperation = 'destination-in'; fx2.drawImage(mk, 0, 0); fx2.globalCompositeOperation = 'source-over';
}

// the name tag over the piece you are pointing at / holding
function drawTag() {
  const id = E.held || E.hover; if (!id || (mode === 'desk' && !desk.ok)) return show('tag', false);
  const p = E.anchor(id).add(V(0, 2.5, 0)).project(camera); if (p.z > 1) return show('tag', false);
  const t = $('tag'); t.textContent = E.label(id); show('tag', true);
  const x = (p.x + 1) / 2 * innerWidth, y = (1 - p.y) / 2 * innerHeight;
  t.style.left = clamp(sx(x), 70, innerWidth - 70) + 'px'; t.style.top = clamp(y, 90, innerHeight - 90) + 'px';
}

// ------------------------------------------------------------------ loop
let last = performance.now(), cardT = 0;
function frame(now, xrFrame) {
  const dt = Math.min(.05, (now - last) / 1000); last = now;
  if (ar.active) {                                                       // the lab on a virtual table in your room
    ar.frame(now, xrFrame); E.update(dt, now / 1000); show('st', false);
    cardT -= dt; if (cardT <= 0) { $('card').innerHTML = E.card(); cardT = .25; }
    renderer.render(scene, camera); fx2.clearRect(0, 0, fx.width, fx.height); return;
  }
  if (mode === 'desk') {
    desk.step(now);
    if (desk.ok) { desk.apply(camera, innerWidth, innerHeight); E.group.visible = true; }
    if (handOn && hand.ready) hand.step(now, desk, camera);
    handFrame(now, dt);
    const D = desk.D, n = D.ids.length, lost = now - (D.lastSeen || D.t0 || (D.t0 = now)) > 4000;
    $('st').textContent = desk.ok ? (n ? `Mat ✓ (${n} squares)` : 'Mat (held)') + (handOn && handMsg ? ' · ' + handMsg : '')
      : n ? `Mat: ${n} square${n > 1 ? 's' : ''} seen, locking…` : lost ? 'No mat seen. Print the mat (or open it on another screen) and show all 6 squares' : 'Point the camera at the mat';
    show('st', true);
  } else { orbitCamera(); show('st', false); }
  E.update(dt, now / 1000);
  cardT -= dt; if (cardT <= 0) { $('card').innerHTML = E.card(); cardT = .25; }
  renderer.render(scene, camera);
  drawHand(); drawTag();
}
renderer.setAnimationLoop(frame);
window.__lab = { E, camera, desk, hand, THREE, startDesk, stopDesk, ar, get mode() { return mode; } };
