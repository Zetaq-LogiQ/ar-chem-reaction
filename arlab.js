// arlab.js - "Lab on my table": room AR with no printed mat (Android Chrome, WebXR).
//  1. Scan your real desk: a lab mat (42 x 30 cm) shows where it will lie. Tap or pinch to put it down, within arm's reach.
//  2. The glassware stands on the mat at true size.
//  3. Hand size: lay your hand flat on the mat once. The app knows exactly where the mat is, so it learns your hand's real
//     size; after that it knows where your hand is in 3D (not just on the screen).
//  4. Work with your real hand where the glassware is: a dot at your pinch with its shadow on the mat shows the hand's
//     height; pinch near a piece to hold it, open your fingers to let go. Your hand hides glassware behind it (3D occlusion).
// Why this works: the room tracking gives true metres, so mat, glassware and your calibrated hand all share one real scale.
import * as THREE from './vendor/three.module.js';
import { createHand } from './hand.js';

const MAT_W = 42, MAT_D = 30, REACH = .8;                                 // cm, cm, metres (mat farther than this is out of reach)
const U = .01;                                                            // world metres per cm

export function createARLab({ renderer, scene, camera, E, $, show, toast, sfx, onStop }) {
  let msg = '';
  const hand = createHand(null, s => msg = s);
  let mode = null, placed = false, hitSrc = null, camOK = false, matY = 0, calNeeded = false;

  // ---- the mat (lives in the lab group, cm) and its preview while you choose a spot (metres)
  const mat = (() => {
    const c = document.createElement('canvas'); c.width = 840; c.height = 600; const g = c.getContext('2d');
    g.fillStyle = '#2f5d50'; g.fillRect(0, 0, 840, 600); g.strokeStyle = 'rgba(255,255,255,.08)'; g.lineWidth = 2;
    for (let x = 0; x <= 840; x += 40) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, 600); g.stroke(); }
    for (let y = 0; y <= 600; y += 40) { g.beginPath(); g.moveTo(0, y); g.lineTo(840, y); g.stroke(); }
    g.strokeStyle = '#ffd36b'; g.lineWidth = 6; g.strokeRect(10, 10, 820, 580);
    g.fillStyle = 'rgba(255,255,255,.55)'; g.font = '600 26px Segoe UI, sans-serif'; g.fillText('ZetaQ Lab', 30, 570);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(MAT_W, MAT_D).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: t }));
    m.position.set(0, .05, 0); m.renderOrder = -2; m.visible = false; return m;
  })();
  E.group.add(mat);
  const preview = new THREE.Group(); preview.matrixAutoUpdate = false; preview.visible = false; scene.add(preview);
  preview.add(new THREE.Mesh(new THREE.PlaneGeometry(MAT_W * U, MAT_D * U).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#ffd36b', transparent: true, opacity: .28, depthWrite: false })));
  const edge = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints([[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([x, z]) => new THREE.Vector3(x * MAT_W * U / 2, .001, z * MAT_D * U / 2))), new THREE.LineBasicMaterial({ color: '#ffd36b' }));
  preview.add(edge);

  // ---- your hand in 3D: a dot at the pinch point, its shadow on the mat, a thin line between (shows the height)
  const cur = new THREE.Group(); cur.visible = false; scene.add(cur);
  const dot = new THREE.Mesh(new THREE.SphereGeometry(.6 * U, 16, 10), new THREE.MeshBasicMaterial({ color: '#6fe0ff', depthTest: false, transparent: true }));
  const shade = new THREE.Mesh(new THREE.RingGeometry(.4 * U, .8 * U, 24).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#08202e', transparent: true, opacity: .5, depthWrite: false }));
  const stick = new THREE.Mesh(new THREE.CylinderGeometry(.05 * U, .05 * U, 1, 6).translate(0, .5, 0), new THREE.MeshBasicMaterial({ color: '#6fe0ff', transparent: true, opacity: .5, depthWrite: false }));
  dot.renderOrder = 30; cur.add(dot, shade, stick);
  // the hand as an invisible depth shape at its real 3D position: glassware behind your hand is hidden, in front stays visible
  const occ = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial({ colorWrite: false, side: THREE.DoubleSide }));
  occ.renderOrder = -10; occ.frustumCulled = false; occ.visible = false; scene.add(occ);
  const BONES = [[0, 1], [1, 2], [2, 3], [3, 4], [0, 5], [5, 6], [6, 7], [7, 8], [5, 9], [9, 10], [10, 11], [11, 12], [9, 13], [13, 14], [14, 15], [15, 16], [13, 17], [0, 17], [17, 18], [18, 19], [19, 20]];
  const occPos = new Float32Array((BONES.length * 6 + 4 * 3) * 3);
  occ.geometry.setAttribute('position', new THREE.BufferAttribute(occPos, 3));
  function buildOccluder(P, eye) {
    let k = 0; const put = v => { occPos[k++] = v.x; occPos[k++] = v.y; occPos[k++] = v.z; };
    for (const [a, b] of BONES) {                                         // each bone: a flat strip 1.9 cm wide, turned to face the camera
      const A = P[a], B = P[b], d = B.clone().sub(A), side = d.clone().cross(eye.clone().sub(A)).normalize().multiplyScalar(.95 * U);
      const a1 = A.clone().add(side), a2 = A.clone().sub(side), b1 = B.clone().add(side), b2 = B.clone().sub(side);
      put(a1); put(a2); put(b1); put(b1); put(a2); put(b2);
    }
    const c = P[0].clone().add(P[5]).add(P[9]).add(P[13]).add(P[17]).multiplyScalar(.2);   // the palm
    for (const [a, b] of [[0, 5], [5, 9], [9, 13], [13, 17]]) { put(c); put(P[a]); put(P[b]); }
    occ.geometry.attributes.position.needsUpdate = true;
  }

  const hint = s => { $('hint').textContent = s || ''; show('hint', !!s); };
  function ui(on) {
    document.body.classList.toggle('arlab', on); show('touch', on); show('bExitAR', on); show('bCalAR', on && placed);
    ['bDesk', 'bARlab', 'bExit', 'bCal', 'bHandT'].forEach(id => $(id) && show(id, false)); if (!on) ['bDesk', 'bARlab'].forEach(id => show(id, true));
    E.bench.forEach(o => o.visible = !on); mat.visible = on && placed; E.group.visible = !on || placed;
  }
  $('bExitAR').onclick = () => renderer.xr.getSession()?.end();
  $('bCalAR').onclick = () => startCal();

  // ---------------------------------------------------------------- start / stop
  async function start() {
    const xrOK = navigator.xr && await Promise.race([navigator.xr.isSessionSupported('immersive-ar').catch(() => false), new Promise(r => setTimeout(() => r(false), 2000))]);
    if (!xrOK) { toast('Room AR needs Chrome on Android. On iPhone, use the printed mat: Desk lab.'); show('help', true); return; }
    try {
      const session = await navigator.xr.requestSession('immersive-ar', { requiredFeatures: ['hit-test'], optionalFeatures: ['dom-overlay', 'camera-access'], domOverlay: { root: $('ui') } });
      renderer.xr.enabled = true; renderer.xr.setReferenceSpaceType('local'); await renderer.xr.setSession(session);
      hitSrc = await session.requestHitTestSource({ space: await session.requestReferenceSpace('viewer') });
      camOK = !!(session.enabledFeatures && session.enabledFeatures.includes('camera-access')); glBind = null; camFB = null;
      session.addEventListener('end', stop);
      mode = 'xr'; placed = false; ui(true); document.body.style.background = 'transparent';
      if (camOK) { hand.load(); show('pip', true); } else toast('This phone cannot share the AR camera with hand tracking: use touch (drag pieces).');
      hint('Point the phone at your table. Move it slowly until the yellow mat appears, then tap or pinch to put it down.');
    } catch (e) { console.warn(e); toast('Could not start AR on this phone.'); }
  }
  function stop() {
    if (!mode) return; mode = null; placed = false; hitSrc = null; preview.visible = false; cur.visible = false; occ.visible = false;
    if (held) drop();
    show('pip', false); show('tag', false); hint(''); E.hover = null;
    E.group.position.set(0, 0, 0); E.group.scale.setScalar(1); E.group.rotation.set(0, 0, 0);
    ui(false); document.body.style.background = ''; const fx = $('fx'); fx.getContext('2d').clearRect(0, 0, fx.width, fx.height); onStop();
  }

  // ---------------------------------------------------------------- placing the mat
  const camPos = new THREE.Vector3(), hitPos = new THREE.Vector3(), hitQ = new THREE.Quaternion(), hitS = new THREE.Vector3();
  let canPlace = false, yaw = 0;
  function placePreview(pose) {
    new THREE.Matrix4().fromArray(pose.transform.matrix).decompose(hitPos, hitQ, hitS);
    viewCam().getWorldPosition(camPos); yaw = Math.atan2(camPos.x - hitPos.x, camPos.z - hitPos.z);
    preview.matrix.compose(hitPos, new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw), new THREE.Vector3(1, 1, 1)); preview.visible = true;
    const far = Math.hypot(camPos.x - hitPos.x, camPos.z - hitPos.z) > REACH, high = camPos.y - hitPos.y < .15;
    canPlace = !far && !high;
    preview.children.forEach(m => m.material.color.set(canPlace ? '#ffd36b' : '#ff7a6b'));
    hint(far ? 'Too far: the mat must be within arm\'s reach. Come closer to the table.' : high ? 'Hold the phone above the table, looking down at it.' : 'Tap or pinch to put the mat here.');
  }
  function place() {
    if (placed || !preview.visible) return;
    if (!canPlace) return toast('Come closer: the mat must be where your hand can reach it.');
    E.group.position.copy(hitPos); E.group.scale.setScalar(U); E.group.rotation.set(0, yaw, 0); matY = hitPos.y;
    placed = true; preview.visible = false; mat.visible = true; E.group.visible = true; show('bCalAR', true); hint(''); sfx('place');
    let s = 0; try { s = +localStorage.getItem('hand_scale_ok'); } catch (e) { }
    if (camOK && !s) startCal(); else toast('Pinch a glowing piece to hold it. Carry the acid bottle to the beaker to pour.');
  }
  // ---------------------------------------------------------------- hand size (lay the hand flat on the mat)
  function startCal() { if (!camOK) return toast('Hand tracking is not available on this phone.'); calNeeded = true; hand.calStart(); hint('Hand size: lay your hand flat on the mat, fingers together, and hold still.'); }

  // ---------------------------------------------------------------- touch (backup): drag a piece along a level above the mat, tap the lamp
  const rc = new THREE.Raycaster();
  const viewCam = () => renderer.xr.getCamera().cameras[0] || camera;
  function rayAt(x, y) { rc.setFromCamera(new THREE.Vector2(x / innerWidth * 2 - 1, -y / innerHeight * 2 + 1), viewCam()); return rc.ray.clone(); }
  const toScreen = v => { const p = v.clone().project(viewCam()); return { x: (p.x + 1) / 2 * innerWidth, y: (1 - p.y) / 2 * innerHeight, z: p.z }; };
  function pickAt(x, y) {
    const cam = viewCam(), right = new THREE.Vector3(1, 0, 0).applyQuaternion(cam.getWorldQuaternion(new THREE.Quaternion())); let best = null, bd = 34;
    for (const c of E.pickables()) {
      const a = toScreen(c.a), b = toScreen(c.c); if (a.z > 1 || b.z > 1) continue;
      const ra = toScreen(c.a.clone().addScaledVector(right, c.r)), r = Math.hypot(ra.x - a.x, ra.y - a.y);
      const dx = b.x - a.x, dy = b.y - a.y, L2 = dx * dx + dy * dy || 1, t = THREE.MathUtils.clamp(((x - a.x) * dx + (y - a.y) * dy) / L2, 0, 1);
      const d = Math.hypot(x - a.x - t * dx, y - a.y - t * dy) - r - (c.hint ? 18 : 0); if (d < bd) { bd = d; best = c.id; }
    }
    return best;
  }
  let held = null, heldBy = null; const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  function drop() { if (!held) return; E.release(); held = heldBy = null; E.hover = null; }
  const tl = $('touch'); let td = null;
  tl.addEventListener('pointerdown', e => { if (!mode || td) return; tl.setPointerCapture(e.pointerId); td = { id: e.pointerId, x: e.clientX, y: e.clientY, t: performance.now(), moved: 0, piece: placed ? pickAt(e.clientX, e.clientY) : null }; });
  tl.addEventListener('pointermove', e => {
    if (!td || td.id !== e.pointerId) return; td.moved = Math.max(td.moved, Math.hypot(e.clientX - td.x, e.clientY - td.y));
    if (!held && td.piece && td.moved > 6 && E.kindOf(td.piece) !== 'tap') {
      const g = E.grabPoint(td.piece); plane.constant = -Math.max(g.y + 3 * U, E.liftFor(td.piece));
      const p = rayAt(td.x, td.y).intersectPlane(plane, new THREE.Vector3()); if (p && E.grab(td.piece, p, 'touch')) { held = td.piece; heldBy = 'touch'; }
    }
    if (held && heldBy === 'touch') { const p = rayAt(e.clientX, e.clientY).intersectPlane(plane, new THREE.Vector3()); if (p) E.move(p); }
  });
  function tup(e) {
    if (!td || td.id !== e.pointerId) return; const t = td; td = null;
    if (held && heldBy === 'touch') return drop();
    if (t.moved <= 6 && performance.now() - t.t < 450) { if (!placed) return place(); if (t.piece && E.kindOf(t.piece) === 'tap') return E.tap(t.piece); E.hover = t.piece; }
  }
  tl.addEventListener('pointerup', tup); tl.addEventListener('pointercancel', tup);
  $('ui').addEventListener('beforexrselect', e => { if (mode) e.preventDefault(); });

  // ---------------------------------------------------------------- the hand, in 3D
  let wasPinch = false, openT = 0, lastT = 0;
  const camObj = { matrixWorld: new THREE.Matrix4() };
  function handFrame(now, cv, view) {
    const dt = Math.min(.2, (now - (lastT || now)) / 1000); lastT = now;
    const f = view.projectionMatrix[0] * camW / 2;                        // focal length in camera-picture pixels
    camObj.matrixWorld.fromArray(view.transform.matrix);
    hand.step(now, { f, W: camW, H: camH }, camObj, cv, U);
    const Hh = hand.H, live = Hh.P && now - Hh.seen < 300;
    $('gl2').textContent = !hand.ready ? msg : !live ? 'Show your hand' : Hh.pinch ? (held ? 'Holding' : 'Pinch') : 'Hand found';
    if (!live) { cur.visible = false; occ.visible = false; if (held && heldBy === 'hand' && now - Hh.seen > 700) drop(); return; }
    occ.visible = true; buildOccluder(Hh.P, new THREE.Vector3().setFromMatrixPosition(camObj.matrixWorld));
    if (calNeeded && hand.calibrating) {                                  // hand-size step: everything else waits
      const r = hand.calStep(camObj, matY + 1.2 * U, 'hand_scale');
      if (r === 'done') { calNeeded = false; try { localStorage.setItem('hand_scale_ok', '1'); } catch (e) { } hint(''); toast('Hand size set. Now pinch a glowing piece to hold it.'); sfx('place'); }
      else hint('Hand size: lay your hand flat on the mat, fingers together. ' + (r || ''));
      cur.visible = false; return;
    }
    const tip = Hh.tip.clone(); if (placed) tip.y = Math.max(tip.y, matY + .2 * U);
    cur.visible = placed; dot.position.copy(tip); shade.position.set(tip.x, matY + .08 * U, tip.z); stick.position.copy(shade.position); stick.scale.y = Math.max(.0001, tip.y - matY);
    dot.material.color.set(Hh.pinch ? '#4fe08a' : '#6fe0ff');
    if (!placed) { if (Hh.pinch && !wasPinch) place(); wasPinch = Hh.pinch; return; }
    if (heldBy === 'touch') { wasPinch = Hh.pinch; return; }
    if (!held) {
      E.hover = E.nearest(tip, 4);                                        // within 4 cm of a piece (in real space)
      if (Hh.pinch && !wasPinch && E.hover) {
        if (E.kindOf(E.hover) === 'tap') E.tap(E.hover);
        else if (E.grab(E.hover, tip, 'hand')) { held = E.hover; heldBy = 'hand'; openT = 0; }
      }
    } else {
      E.move(tip); E.hover = held;
      if (!Hh.pinch) { openT += dt; if (openT > .15) drop(); } else openT = 0;
    }
    wasPinch = Hh.pinch;
  }
  function tagFor(id) {
    if (!id) return show('tag', false);
    const p = toScreen(E.anchor(id).clone().add(new THREE.Vector3(0, 2 * U, 0))); if (p.z > 1) return show('tag', false);
    const t = $('tag'); t.textContent = E.label(id); t.style.left = THREE.MathUtils.clamp(p.x, 70, innerWidth - 70) + 'px'; t.style.top = THREE.MathUtils.clamp(p.y, 90, innerHeight - 120) + 'px'; show('tag', true);
  }

  // ---------------------------------------------------------------- AR camera picture (GPU texture) -> small canvas for the hand tracker
  const gl = renderer.getContext(); let glBind = null, camFB = null, camProg = null, camBuf = null, camPix = null, camCv = null, camCtx = null, camW = 0, camH = 0, camT = 0;
  function camSetup(w, h) {
    camW = 320; camH = Math.max(64, Math.round(320 * h / w));
    const sh = (t, s) => { const x = gl.createShader(t); gl.shaderSource(x, s); gl.compileShader(x); return x; };
    camProg = gl.createProgram();
    gl.attachShader(camProg, sh(gl.VERTEX_SHADER, 'attribute vec2 p; varying vec2 uv; void main(){ uv = p * .5 + .5; gl_Position = vec4(p, 0., 1.); }'));
    gl.attachShader(camProg, sh(gl.FRAGMENT_SHADER, 'precision mediump float; uniform sampler2D t; varying vec2 uv; void main(){ gl_FragColor = texture2D(t, vec2(uv.x, 1. - uv.y)); }'));
    gl.linkProgram(camProg);
    camBuf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, camBuf); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const out = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, out); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, camW, camH, 0, gl.RGBA, gl.UNSIGNED_BYTE, null); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    camFB = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, camFB); gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, out, 0);
    camPix = new Uint8ClampedArray(camW * camH * 4); camCv = document.createElement('canvas'); camCv.width = camW; camCv.height = camH; camCtx = camCv.getContext('2d');
  }
  function xrCamera(now, view) {
    if (!camOK || !view.camera || now - camT < 60) return null; camT = now;
    try {
      glBind = glBind || new XRWebGLBinding(renderer.xr.getSession(), gl);
      const tex = glBind.getCameraImage(view.camera); if (!tex) return null;
      if (!camFB) camSetup(view.camera.width, view.camera.height);
      if (gl.bindVertexArray) gl.bindVertexArray(null);
      gl.bindFramebuffer(gl.FRAMEBUFFER, camFB); gl.viewport(0, 0, camW, camH);
      gl.disable(gl.DEPTH_TEST); gl.disable(gl.BLEND); gl.disable(gl.CULL_FACE); gl.disable(gl.SCISSOR_TEST);
      gl.useProgram(camProg); gl.bindBuffer(gl.ARRAY_BUFFER, camBuf);
      const loc = gl.getAttribLocation(camProg, 'p'); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, tex); gl.uniform1i(gl.getUniformLocation(camProg, 't'), 0);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4); gl.readPixels(0, 0, camW, camH, gl.RGBA, gl.UNSIGNED_BYTE, camPix); gl.disableVertexAttribArray(loc);
    } catch (e) { console.warn(e); renderer.resetState(); camOK = false; toast('No camera picture for hand tracking: use touch.'); return null; }
    renderer.resetState(); camCtx.putImageData(new ImageData(camPix, camW, camH), 0, 0); return camCv;
  }
  // the small window: what the hand tracker sees, with the hand skeleton
  const pc = $('pipc'), p2 = pc.getContext('2d');
  function drawPip() {
    if (!camCv) return; const W = pc.width, Hh = pc.height; p2.drawImage(camCv, 0, 0, W, Hh);
    const L = hand.H.lm; if (!L || performance.now() - hand.H.seen > 300) return;
    p2.strokeStyle = hand.H.pinch ? '#ffd36b' : '#6fe0ff'; p2.lineWidth = 2.5; p2.beginPath();
    for (const [a, b] of BONES) { p2.moveTo(L[a].x * W, L[a].y * Hh); p2.lineTo(L[b].x * W, L[b].y * Hh); } p2.stroke();
  }

  // ---------------------------------------------------------------- each frame
  function frame(now, xrFrame) {
    if (mode !== 'xr' || !xrFrame) return;
    const view = xrFrame.getViewerPose(renderer.xr.getReferenceSpace())?.views[0];
    if (hitSrc && !placed) { const res = xrFrame.getHitTestResults(hitSrc), pose = res.length && res[0].getPose(renderer.xr.getReferenceSpace()); if (pose) placePreview(pose); else { preview.visible = false; hint('Point the phone at your table and move it slowly.'); } }
    if (view) { const cv = xrCamera(now, view); if (cv) handFrame(now, cv, view); }
    tagFor(held || E.hover);
    drawPip();
  }
  return { start, stop, frame, get active() { return !!mode; }, get placed() { return placed; }, hand, get mode() { return mode; } };
}
