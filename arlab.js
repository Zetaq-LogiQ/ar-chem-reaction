// arlab.js - the lab on a virtual table in your room, no mat. Place the table on the floor, then work at it:
//   hand  : one finger (point / open hand) aims - the piece glows and shows its name; pinch (thumb + index) grabs it,
//           move to carry it, open your fingers to put it down. Carry a bottle over the beaker and it pours.
//   touch : drag a piece to carry it, tap to see its name, tap the lamp to light it.
// Pieces are carried along a level just above the tabletop, following the screen point under your pinch (or finger),
// so the hand never has to reach "into" the scene.
// Android: WebXR (true room tracking; the hand tracker reads the AR camera picture). iPhone: back camera + motion sensor.
import * as THREE from './vendor/three.module.js';
import { createGestures } from './gesture.js';

const TABLE_H = 75;                                                       // cm, a normal lab table

export function createARLab({ renderer, scene, camera, E, $, show, toast, sfx, onStop }) {
  const vid = $('vid'), H = createGestures(vid);
  let mode = null, placed = false, size = 1, hitSrc = null, camOK = false;
  const S = () => .01 * size;                                             // the lab works in cm; the room in metres

  // the table: the bench top from the lab + four legs, and a soft shadow on the floor
  const legs = new THREE.Group(); legs.visible = false; E.group.add(legs);
  const legMat = new THREE.MeshToonMaterial({ color: '#8a5f3d' });
  for (const x of [-18.5, 18.5]) for (const z of [-13, 13]) { const l = new THREE.Mesh(new THREE.BoxGeometry(2.4, TABLE_H - 1.4, 2.4), legMat); l.position.set(x, -(TABLE_H + 1.4) / 2, z); l.castShadow = true; legs.add(l); }
  const rail = new THREE.Mesh(new THREE.BoxGeometry(36, 2, 24), legMat); rail.position.y = -TABLE_H + 12; legs.add(rail);
  const shadowTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d'), gr = g.createRadialGradient(32, 32, 4, 32, 32, 32); gr.addColorStop(0, 'rgba(0,0,0,.45)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(c); })();
  const floorShadow = new THREE.Mesh(new THREE.PlaneGeometry(60, 48), new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false }));
  floorShadow.rotation.x = -Math.PI / 2; floorShadow.position.y = -TABLE_H + .2; legs.add(floorShadow);
  const reticle = new THREE.Mesh(new THREE.RingGeometry(.12, .15, 48).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#ffd36b' }));
  reticle.matrixAutoUpdate = false; reticle.visible = false; scene.add(reticle);

  function hint(s) { $('hint').textContent = s || ''; show('hint', !!s); }
  function ui(on) {
    document.body.classList.toggle('arlab', on); show('touch', on); show('bExitAR', on); show('bBig', on && placed); show('bSmall', on && placed);
    ['bDesk', 'bARlab', 'bExit', 'bCal', 'bHandT'].forEach(id => $(id) && show(id, false)); if (!on) ['bDesk', 'bARlab'].forEach(id => show(id, true));
    E.bench.forEach(o => o.visible = true); legs.visible = on && placed; E.group.visible = !on || placed;
  }
  function placeAt(p, faceFrom) {
    E.group.position.set(p.x, p.y + TABLE_H * S(), p.z); E.group.scale.setScalar(S());
    E.group.rotation.set(0, Math.atan2(faceFrom.x - p.x, faceFrom.z - p.z), 0);   // the side with the labels faces you
    placed = true; legs.visible = true; E.group.visible = true; reticle.visible = false; hint(''); show('bBig', true); show('bSmall', true);
    toast(camOK || mode === 'gyro' ? 'Point at a piece to see it. Pinch to pick it up, carry the acid over the beaker, open your fingers to put it down.' : 'Drag the acid bottle over the beaker to pour.');
    sfx('place');
  }
  function resize(k) {
    if (!placed) return; const floor = E.group.position.y - TABLE_H * S(); size = THREE.MathUtils.clamp(size * k, .6, 3);
    E.group.scale.setScalar(S()); E.group.position.y = floor + TABLE_H * S(); toast('Size: ' + size.toFixed(1) + '× real');
  }
  $('bBig').onclick = () => resize(1.25); $('bSmall').onclick = () => resize(1 / 1.25);
  $('bExitAR').onclick = () => mode === 'xr' ? renderer.xr.getSession()?.end() : stop();

  // ---------------------------------------------------------------- start / stop
  async function start() {
    const xrOK = navigator.xr && await Promise.race([navigator.xr.isSessionSupported('immersive-ar').catch(() => false), new Promise(r => setTimeout(() => r(false), 2000))]);
    if (xrOK) {
      try {
        const session = await navigator.xr.requestSession('immersive-ar', { requiredFeatures: ['hit-test'], optionalFeatures: ['dom-overlay', 'camera-access'], domOverlay: { root: $('ui') } });
        renderer.xr.enabled = true; renderer.xr.setReferenceSpaceType('local'); await renderer.xr.setSession(session);
        hitSrc = await session.requestHitTestSource({ space: await session.requestReferenceSpace('viewer') });
        camOK = !!(session.enabledFeatures && session.enabledFeatures.includes('camera-access')); glBind = null; camFB = null;
        session.addEventListener('end', stop);
        mode = 'xr'; placed = false; size = 1; ui(true); document.body.style.background = 'transparent';
        if (camOK) { H.load(); H.G.map = p => ({ x: p.x, y: p.y }); show('pip', true); }
        hint('Move the phone slowly over the floor. When the yellow ring appears, tap (or pinch) to place the table.'); return;
      } catch (e) { console.warn(e); }
    }
    // iPhone and phones without AR: back camera + motion sensor
    try {
      if (typeof DeviceOrientationEvent !== 'undefined' && DeviceOrientationEvent.requestPermission && await DeviceOrientationEvent.requestPermission() !== 'granted') return toast('Motion access is needed so the table stays in place.');
      await H.start('environment');
    } catch (e) { console.warn(e); return toast('Could not open the camera. Allow camera access and try again.'); }
    addEventListener('deviceorientation', onOri); startSensor();
    H.G.map = p => { const W = innerWidth, Hh = innerHeight, vw = vid.videoWidth, vh = vid.videoHeight, s = Math.max(W / vw, Hh / vh); return { x: ((W - vw * s) / 2 + p.x * vw * s) / W, y: ((Hh - vh * s) / 2 + p.y * vh * s) / Hh }; };
    mode = 'gyro'; placed = false; size = 1; ui(true); show('vid', true); show('pip', true); document.body.style.background = '#000';
    camera.clearViewOffset(); camera.position.set(0, EYE, 0); camera.near = .02; camera.far = 50;
    hint('Point the middle of the screen at the floor where the table should stand, then tap (or pinch).');
  }
  function stop() {
    if (!mode) return; const was = mode; mode = null; placed = false; hitSrc = null; reticle.visible = false;
    if (held) { E.release(); held = null; }
    if (was === 'gyro') { removeEventListener('deviceorientation', onOri); ori = null; try { sensor && sensor.stop(); } catch (e) { } sensor = sensQ = null; H.stop(); }
    H.G.map = null; show('vid', false); show('pip', false); show('cur', false); show('tag', false); hint('');
    E.group.position.set(0, 0, 0); E.group.scale.setScalar(1); E.group.rotation.set(0, 0, 0); camera.quaternion.identity(); camera.near = 1; camera.far = 600;
    ui(false); document.body.style.background = ''; E.hover = null; onStop();
  }

  // ---------------------------------------------------------------- iPhone view: motion sensor turns the camera (stand in one place)
  const EYE = 1.3; let ori = null, sensor = null, sensQ = null, longFov = 63;
  try { const f = +localStorage.getItem('pb_fov'); if (f >= 45 && f <= 85) longFov = f; } catch (e) { }
  const onOri = e => { if (e.alpha != null) ori = e; };
  const qFix = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2), qT = new THREE.Quaternion(), qX = new THREE.Quaternion(-Math.SQRT1_2, 0, 0, Math.SQRT1_2), qS = new THREE.Quaternion(), eul = new THREE.Euler();
  function startSensor() { if (typeof RelativeOrientationSensor === 'undefined') return; try { sensor = new RelativeOrientationSensor({ frequency: 60, referenceFrame: 'screen' }); sensor.addEventListener('reading', () => sensQ = sensor && sensor.quaternion); sensor.addEventListener('error', () => { sensor = null; sensQ = null; }); sensor.start(); } catch (e) { sensor = null; } }
  function gyroFrame() {
    let got = false;
    if (sensQ) { qT.fromArray(sensQ).premultiply(qFix); got = true; }
    else if (ori) { const D = THREE.MathUtils.degToRad, o = D(screen.orientation?.angle ?? window.orientation ?? 0); eul.set(D(ori.beta), D(ori.alpha), -D(ori.gamma), 'YXZ'); qT.setFromEuler(eul).multiply(qX).multiply(qS.setFromAxisAngle(new THREE.Vector3(0, 0, 1), -o)); got = true; }
    if (got) { if (camera.quaternion.angleTo(qT) > .5) camera.quaternion.copy(qT); else camera.quaternion.slerp(qT, sensQ ? .85 : .5); }
    const vw = vid.videoWidth || 720, vh = vid.videoHeight || 1280, f = Math.max(vw, vh) / 2 / Math.tan(THREE.MathUtils.degToRad(longFov / 2)), s = Math.max(innerWidth / vw, innerHeight / vh);
    camera.fov = THREE.MathUtils.radToDeg(2 * Math.atan(innerHeight / 2 / s / f)); camera.aspect = innerWidth / innerHeight; camera.position.set(0, EYE, 0); camera.updateProjectionMatrix(); camera.updateMatrixWorld();
    if (!placed) { const r = rayAt(innerWidth / 2, innerHeight / 2), p = r.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), new THREE.Vector3()); reticle.visible = !!p && p.distanceTo(camera.position) < 5; if (p) reticle.matrix.makeTranslation(p.x, .002, p.z); }
  }

  // ---------------------------------------------------------------- screen point -> ray (works for both views)
  const rc = new THREE.Raycaster();
  const viewCam = () => mode === 'xr' ? (renderer.xr.getCamera().cameras[0] || camera) : camera;
  function rayAt(x, y) { rc.setFromCamera(new THREE.Vector2(x / innerWidth * 2 - 1, -y / innerHeight * 2 + 1), viewCam()); return rc.ray.clone(); }
  function toScreen(v) { const p = v.clone().project(viewCam()); return { x: (p.x + 1) / 2 * innerWidth, y: (1 - p.y) / 2 * innerHeight, z: p.z }; }
  // the piece nearest the screen point (within 34 px of its outline; the glowing piece the step needs wins a close call)
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
  // carrying: a held piece moves on a level just above whatever it is being taken to
  let held = null, heldBy = null; const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  function grabAt(id, x, y, by = 'touch') {
    if (!placed || !id) return false;
    if (E.kindOf(id) === 'tap') { E.tap(id); return false; }
    const g = E.grabPoint(id); plane.constant = -Math.max(g.y + 3 * S(), E.liftFor(id));
    const p = rayAt(x, y).intersectPlane(plane, new THREE.Vector3()); if (!p || !E.grab(id, p, 'ar')) return false;
    held = id; heldBy = by; E.hover = id; return true;
  }
  function carryTo(x, y) { if (!held) return; const p = rayAt(x, y).intersectPlane(plane, new THREE.Vector3()); if (p) E.move(p); }
  function drop() { if (!held) return; E.release(); held = heldBy = null; E.hover = null; }
  function place() {
    if (placed || !reticle.visible) return;
    const p = new THREE.Vector3().setFromMatrixPosition(reticle.matrix), c = new THREE.Vector3(); viewCam().getWorldPosition(c);
    placeAt(p, c);
  }

  // ---------------------------------------------------------------- touch: drag a piece to carry it, tap to see a name / light the lamp
  const tl = $('touch'); let td = null;
  tl.addEventListener('pointerdown', e => {
    if (!mode || td) return; tl.setPointerCapture(e.pointerId);
    td = { id: e.pointerId, x: e.clientX, y: e.clientY, t: performance.now(), moved: 0, piece: placed ? pickAt(e.clientX, e.clientY) : null };
  });
  tl.addEventListener('pointermove', e => {
    if (!td || td.id !== e.pointerId) return; td.moved = Math.max(td.moved, Math.hypot(e.clientX - td.x, e.clientY - td.y));
    if (!held && td.piece && td.moved > 6 && E.kindOf(td.piece) !== 'tap') grabAt(td.piece, td.x, td.y);
    if (held) carryTo(e.clientX, e.clientY);
  });
  function tup(e) {
    if (!td || td.id !== e.pointerId) return; const t = td; td = null;
    if (held) return drop();
    if (t.moved <= 6 && performance.now() - t.t < 450) {
      if (!placed) return place();
      if (t.piece && E.kindOf(t.piece) === 'tap') return E.tap(t.piece);
      E.hover = t.piece; tagFor(t.piece);
    }
  }
  tl.addEventListener('pointerup', tup); tl.addEventListener('pointercancel', tup);
  $('ui').addEventListener('beforexrselect', e => { if (mode === 'xr') e.preventDefault(); });   // all touches go to the touch layer

  // ---------------------------------------------------------------- hand: point = aim, pinch = grab / carry, open = put down
  let prev = 'none', openT = 0, last = 0; const aimHist = [];
  function handFrame(now, src) {
    const G = H.G, fresh = H.step(now, src), dt = Math.min(.2, (now - (last || now)) / 1000); last = now;
    const live = G.lm && now - G.seen < 300, g = live ? G.gesture : 'none';
    $('gl2').textContent = G.ready ? ({ open: 'Open hand: aim', point: 'Pointing: aim', pinch: held ? 'Holding' : 'Pinch', fist: 'Fist', none: 'No hand' })[g] : G.msg;
    if (!live) { show('cur', false); if (held && heldBy === 'hand' && now - G.seen > 700) drop(); prev = 'none'; return; }
    const tx = G.tip.x * innerWidth, ty = G.tip.y * innerHeight - 40, px = G.pinchPt.x * innerWidth, py = G.pinchPt.y * innerHeight;
    const cx = held || g === 'pinch' ? px : tx, cy = held || g === 'pinch' ? py : ty, c = $('cur');
    c.style.transform = `translate(${cx}px, ${cy}px)`; c.setAttribute('class', 'g-' + (held ? 'pinch' : g)); show('cur', true);
    if (!held && (g === 'open' || g === 'point') && fresh && placed) {
      const id = pickAt(tx, ty); E.hover = id; tagFor(id);
      aimHist.push({ t: now, id, x: px, y: py }); while (aimHist.length && now - aimHist[0].t > 600) aimHist.shift();
    }
    if (heldBy === 'touch') { prev = g; return; }                        // a finger on the screen is carrying something: the hand waits
    if (g === 'pinch' && prev !== 'pinch' && !held) {                    // pinch closes: place the table, or grab what was aimed at a moment ago
      if (!placed) { place(); prev = g; return; }
      const a = aimHist.filter(h => now - h.t > 100).pop() || aimHist[aimHist.length - 1];
      if (a && a.id) { if (E.kindOf(a.id) === 'tap') E.tap(a.id); else if (grabAt(a.id, px, py, 'hand')) { sfx('pick'); openT = 0; } }
    }
    if (held) {
      if (g === 'pinch' || g === 'fist') { carryTo(px, py); openT = 0; tagFor(held); }
      else { openT += dt; if (openT > .18) drop(); }                     // fingers open for a moment: put it down
    }
    prev = g;
  }
  function tagFor(id) {
    if (!id) return show('tag', false);
    const p = toScreen(E.anchor(id)); if (p.z > 1) return show('tag', false);
    const t = $('tag'); t.textContent = E.label(id); t.style.left = THREE.MathUtils.clamp(p.x, 70, innerWidth - 70) + 'px'; t.style.top = THREE.MathUtils.clamp(p.y - 14, 90, innerHeight - 120) + 'px'; show('tag', true);
  }

  // ---------------------------------------------------------------- the AR camera picture (GPU texture) -> a small canvas for the hand tracker
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
  function xrCamera(now, frame) {
    if (!camOK || now - camT < 70) return null;
    const view = frame.getViewerPose(renderer.xr.getReferenceSpace())?.views[0]; if (!view || !view.camera) return null; camT = now;
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
    } catch (e) { console.warn(e); renderer.resetState(); camOK = false; $('gl2').textContent = 'No camera picture in AR: use touch'; return null; }
    renderer.resetState(); camCtx.putImageData(new ImageData(camPix, camW, camH), 0, 0); return camCv;
  }

  // the small camera window with the hand skeleton (so you can see the tracker sees your hand)
  const pc = $('pipc'), p2 = pc.getContext('2d');
  const BONES = [[0, 1], [1, 2], [2, 3], [3, 4], [0, 5], [5, 6], [6, 7], [7, 8], [5, 9], [9, 10], [10, 11], [11, 12], [9, 13], [13, 14], [14, 15], [15, 16], [13, 17], [0, 17], [17, 18], [18, 19], [19, 20]];
  function drawPip(src) {
    const W = pc.width, Hh = pc.height; if (src && (src.readyState >= 2 || src.width)) p2.drawImage(src, 0, 0, W, Hh); else { p2.fillStyle = '#111'; p2.fillRect(0, 0, W, Hh); }
    const L = H.G.lm; if (!L || performance.now() - H.G.seen > 300) return;
    const P = L.map(p => [p.x * W, p.y * Hh]), col = { pinch: '#ffd36b', fist: '#ff8a6b', point: '#6fe0ff', open: '#ffffff' }[H.G.gesture] || '#fff';
    p2.strokeStyle = col; p2.lineWidth = 2.5; p2.beginPath(); for (const [a, b] of BONES) { p2.moveTo(...P[a]); p2.lineTo(...P[b]); } p2.stroke();
  }

  // ---------------------------------------------------------------- each frame (called by main.js while active)
  function frame(now, xrFrame) {
    let src = vid;
    if (mode === 'xr' && xrFrame) {
      if (hitSrc && !placed) { const res = xrFrame.getHitTestResults(hitSrc), pose = res.length && res[0].getPose(renderer.xr.getReferenceSpace()); reticle.visible = !!pose; if (pose) reticle.matrix.fromArray(pose.transform.matrix); }
      const cv = xrCamera(now, xrFrame); src = camCv; if (cv) handFrame(now, cv);
    } else if (mode === 'gyro') { gyroFrame(); handFrame(now, vid); }
    if (held && !td && !(H.G.lm && performance.now() - H.G.seen < 300)) { /* carried by touch or waiting for the hand */ }
    if (!$('pip').classList.contains('hide')) drawPip(src);
  }
  return { start, stop, frame, get active() { return !!mode; }, get placed() { return placed; }, H, pickAt, grabAt, carryTo, drop, place, placeAt, get mode() { return mode; } };
}
