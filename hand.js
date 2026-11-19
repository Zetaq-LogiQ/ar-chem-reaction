// hand.js - your real hand in the desk lab, in true 3D. MediaPipe gives 21 hand points in the picture plus the hand's own 3D shape
// (in metres). Knowing the camera exactly (from the mat), we solve where that 3D hand must be so it lands on those picture points:
// that gives the hand's distance from the camera, so the pinch point is a real position over the mat (cm).
// "Calibrate": a child's hand is smaller than the model's average hand; one look at your hand flat on the mat fixes the scale.
import * as THREE from './vendor/three.module.js';

const MP = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14';
const MODEL = 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';

export function createHand(video, onStatus) {
  const H = { lm: null, wl: null, P: null, pinch: false, gap: 1, seen: 0, scale: 1, tip: null, ok: false, busy: false, cpu: false, err: 0, lastT: 0 };
  let hl = null;
  try { const s = +localStorage.getItem('hand_scale'); if (s > .5 && s < 1.5) H.scale = s; } catch (e) { }

  async function load() {
    if (hl || H.busy) return; H.busy = true; onStatus('Loading hand tracking…');
    try {
      const { FilesetResolver, HandLandmarker } = await import(MP + '/vision_bundle.mjs');
      const fs = await FilesetResolver.forVisionTasks(MP + '/wasm');
      const opts = d => ({ baseOptions: { modelAssetPath: MODEL, delegate: d }, runningMode: 'VIDEO', numHands: 1, minHandDetectionConfidence: .5, minHandPresenceConfidence: .5, minTrackingConfidence: .5 });
      hl = H.cpu ? await HandLandmarker.createFromOptions(fs, opts('CPU')) : await HandLandmarker.createFromOptions(fs, opts('GPU')).catch(() => { H.cpu = true; return HandLandmarker.createFromOptions(fs, opts('CPU')); });
      H.ok = true; onStatus('Show your hand');
    } catch (e) { console.warn(e); onStatus('Hand tracking could not load: use touch'); }
    H.busy = false;
  }

  // where the hand is: picture points (normalised) + its 3D shape (metres, picture-aligned) -> 3D points in the camera (cm, OpenCV axes)
  function solve(lm, wl, f, W, Hh, s) {
    const cx = W / 2, cy = Hh / 2; const A = [[0, 0, 0], [0, 0, 0], [0, 0, 0]], b = [0, 0, 0];
    const addRow = (r, v) => { for (let i = 0; i < 3; i++) { b[i] += r[i] * v; for (let j = 0; j < 3; j++) A[i][j] += r[i] * r[j]; } };
    for (let i = 0; i < 21; i++) {
      const u = lm[i].x * W - cx, v = lm[i].y * Hh - cy, X = wl[i].x * s, Y = wl[i].y * s, Z = wl[i].z * s;
      addRow([f, 0, -u], u * Z - f * X); addRow([0, f, -v], v * Z - f * Y);   // u (Z + Tz) = f (X + Tx), same for v
    }
    const T = solve3(A, b); if (!T || T[2] <= .05) return null;
    return wl.map(p => new THREE.Vector3((p.x * s + T[0]) * 100, (p.y * s + T[1]) * 100, (p.z * s + T[2]) * 100));
  }
  function solve3(A, b) {
    const d = (m) => m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1]) - m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0]) + m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0]);
    const D0 = d(A); if (Math.abs(D0) < 1e-12) return null;
    return [0, 1, 2].map(k => d(A.map((row, i) => row.map((x, j) => j === k ? b[i] : x))) / D0);
  }

  // one look at the camera picture (about 20 times a second). cam = three.js camera (matches the phone camera), desk = createDesk()
  // desk = {f, W, H}: the camera's focal length (px) for a W x H picture; cam.matrixWorld = where the camera is.
  // src = the picture (the <video>, or a canvas holding the AR camera picture); unit = world units per cm (1 desk, 0.01 room AR)
  function step(now, desk, cam, src = video, unit = 1) {
    if (!hl || (src === video && video.readyState < 2) || now - H.lastT < 45) return false;
    H.lastT = now;
    let r; try { r = hl.detectForVideo(src, now); H.err = 0; }
    catch (e) { console.warn(e); if (++H.err > 5 && !H.cpu) { H.cpu = true; try { hl.close(); } catch (_) { } hl = null; H.ok = false; load(); } return false; }
    const lm = r.landmarks && r.landmarks[0], wl = r.worldLandmarks && r.worldLandmarks[0];
    if (!lm || !wl) { if (now - H.seen > 300) { H.lm = null; H.P = null; } return true; }
    const pts = solve(lm, wl, desk.f, desk.W, desk.H, H.scale); if (!pts) return true;
    H.seen = now; H.lm = lm; H.wl = wl;
    // camera (cv axes, cm) -> world: three camera axes are (x, -y, -z)
    const toW = p => new THREE.Vector3(p.x, -p.y, -p.z).multiplyScalar(unit).applyMatrix4(cam.matrixWorld);
    H.P = pts.map(toW); H.camZ = pts.map(p => p.z);
    const gap = Math.hypot(wl[4].x - wl[8].x, wl[4].y - wl[8].y, wl[4].z - wl[8].z) * H.scale * 100;   // cm between thumb tip and index tip: does not change with distance
    H.gap = gap;
    if (!H.pinch && gap < 2.6) H.pinch = true; else if (H.pinch && gap > 4.5) H.pinch = false;
    const tip = H.P[4].clone().add(H.P[8]).multiplyScalar(.5);             // the pinch point
    H.tip = H.tip ? H.tip.lerp(tip, .55) : tip;
    return true;
  }

  // calibration: hand flat on the mat. The wrist and knuckles then lie about 1.2 cm above the paper: compare that true depth with ours.
  let cal = null;
  function calStart() { cal = { t0: performance.now(), k: [] }; }
  // planeY: world height of the knuckles when the hand lies flat (mat surface + 1.2 cm)
  function calStep(cam, planeY = 1.2, key = 'hand_scale') {
    if (!cal || !H.P) return cal ? 'Lay your hand flat on the mat' : null;
    const o = new THREE.Vector3().setFromMatrixPosition(cam.matrixWorld);
    for (const i of [0, 5, 9, 13, 17]) {
      const p = H.P[i], d = p.clone().sub(o), t = (planeY - o.y) / d.y; if (!(t > 0)) continue;
      const truth = o.clone().addScaledVector(d, t); cal.k.push(truth.distanceTo(o) / p.distanceTo(o));
    }
    const el = performance.now() - cal.t0;
    if (el > 2200 && cal.k.length > 20) {
      const s = [...cal.k].sort((a, b) => a - b), m = s[s.length >> 1]; H.scale = THREE.MathUtils.clamp(H.scale * m, .55, 1.4);
      try { localStorage.setItem(key, H.scale); } catch (e) { } cal = null; return 'done';
    }
    return 'Hold still… ' + Math.max(0, Math.ceil((2200 - el) / 1000));
  }
  return { H, load, step, solve, calStart, calStep, get calibrating() { return !!cal; }, get ready() { return !!hl; } };
}
