// desk.js - "desk lab": the phone stands still on a stand and looks at the printed mat. The markers on the mat tell us exactly
// where the camera is (and its zoom), so the glassware is drawn at true size, standing on the mat, where your hands are.
// Marker detection: js-aruco2 (vendor/aruco.js, global AR). Pose: homography from all visible marker corners -> camera pose.
import * as THREE from './vendor/three.module.js';
import { DICT, MARKERS, markerCorners } from './mat.js';

const DET_W = 640;                                                       // marker detection works on a 640 px wide copy of the camera picture

export function createDesk(video) {
  const det = new AR.Detector({ dictionaryName: DICT, maxHammingDistance: 4 });
  const cv = document.createElement('canvas'), g = cv.getContext('2d', { willReadFrequently: true });
  const D = { on: false, facing: 'environment', W: DET_W, H: 360, f: 0, fSamples: [], ok: false, seen: 0, lastT: 0, ids: [], err: 0, R: null, t: null, view: new THREE.Matrix4(), have: false };

  async function start(facing) {
    D.facing = facing;
    const st = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: facing }, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false });
    video.srcObject = st; await video.play();
    D.on = true; D.have = false; D.ok = false; D.fSamples = [];
    const key = 'desk_f_' + facing; let fr = 0; try { fr = +localStorage.getItem(key); } catch (e) { }
    D.fFrac = fr > .3 && fr < 3 ? fr : null;                             // focal length as a share of the picture's long side, learned before
  }
  function stop() { const st = video.srcObject; st && st.getTracks().forEach(t => t.stop()); video.srcObject = null; D.on = false; D.ok = false; }

  function sizes() {
    const vw = video.videoWidth || 1280, vh = video.videoHeight || 720;
    D.W = DET_W; D.H = Math.round(DET_W * vh / vw); cv.width = D.W; cv.height = D.H;
    if (!D.f) { const long = Math.max(D.W, D.H), fov = D.facing === 'user' ? 72 : 66; D.f = D.fFrac ? D.fFrac * long : long / 2 / Math.tan(fov / 2 * Math.PI / 180); }
  }

  // ---- maths: homography (plane x,z in cm -> picture px), focal length from it, camera pose from it
  function homography(P, Q) {                                             // P: [[x,z]], Q: [[u,v]] -> 3x3 (row-major), with Hartley normalisation
    const norm = A => { let mx = 0, my = 0; A.forEach(p => { mx += p[0]; my += p[1]; }); mx /= A.length; my /= A.length; let d = 0; A.forEach(p => { d += Math.hypot(p[0] - mx, p[1] - my); }); d = d / A.length || 1; const s = Math.SQRT2 / d; return { s, mx, my, T: [s, 0, -s * mx, 0, s, -s * my, 0, 0, 1] }; };
    const np = norm(P), nq = norm(Q), M = [], b = [];
    for (let i = 0; i < P.length; i++) {
      const x = (P[i][0] - np.mx) * np.s, y = (P[i][1] - np.my) * np.s, u = (Q[i][0] - nq.mx) * nq.s, v = (Q[i][1] - nq.my) * nq.s;
      M.push([x, y, 1, 0, 0, 0, -u * x, -u * y]); b.push(u); M.push([0, 0, 0, x, y, 1, -v * x, -v * y]); b.push(v);
    }
    const h = lsq(M, b); if (!h) return null; const Hn = [...h, 1];
    // H = Tq^-1 * Hn * Tp
    const Tq_inv = [1 / nq.s, 0, nq.mx, 0, 1 / nq.s, nq.my, 0, 0, 1];
    return mul3(mul3(Tq_inv, Hn), np.T);
  }
  function lsq(M, b) {                                                     // least squares via the normal equations, Gauss-Jordan
    const n = M[0].length, A = Array.from({ length: n }, () => new Array(n + 1).fill(0));
    for (let r = 0; r < M.length; r++) for (let i = 0; i < n; i++) { A[i][n] += M[r][i] * b[r]; for (let j = 0; j < n; j++) A[i][j] += M[r][i] * M[r][j]; }
    for (let c = 0; c < n; c++) {
      let p = c; for (let r = c + 1; r < n; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r;
      if (Math.abs(A[p][c]) < 1e-12) return null; [A[c], A[p]] = [A[p], A[c]];
      for (let r = 0; r < n; r++) if (r !== c) { const k = A[r][c] / A[c][c]; for (let j = c; j <= n; j++) A[r][j] -= k * A[c][j]; }
    }
    return A.map((row, i) => row[n] / row[i]);
  }
  const mul3 = (a, b) => { const r = new Array(9).fill(0); for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) for (let k = 0; k < 3; k++) r[i * 3 + j] += a[i * 3 + k] * b[k * 3 + j]; return r; };
  // focal length from the homography (square pixels, centre of the picture as the principal point); null when the view is too face-on to tell
  function focalFrom(H) {
    const cx = D.W / 2, cy = D.H / 2;
    const a = [H[0] - cx * H[6], H[3] - cy * H[6], H[6]], c = [H[1] - cx * H[7], H[4] - cy * H[7], H[7]];
    const A1 = a[0] * c[0] + a[1] * c[1], B1 = a[2] * c[2], A2 = a[0] * a[0] + a[1] * a[1] - c[0] * c[0] - c[1] * c[1], B2 = a[2] * a[2] - c[2] * c[2];
    const w = -(A1 * B1 + A2 * B2) / (A1 * A1 + A2 * A2); if (!(w > 0)) return null;
    const f = 1 / Math.sqrt(w), long = Math.max(D.W, D.H), fov = 2 * Math.atan(long / 2 / f) * 180 / Math.PI;
    return fov > 40 && fov < 105 ? f : null;
  }
  function poseFrom(H, f) {
    const cx = D.W / 2, cy = D.H / 2, Ki = [1 / f, 0, -cx / f, 0, 1 / f, -cy / f, 0, 0, 1], B = mul3(Ki, H);
    let b1 = new THREE.Vector3(B[0], B[3], B[6]), b2 = new THREE.Vector3(B[1], B[4], B[7]), b3 = new THREE.Vector3(B[2], B[5], B[8]);
    let lam = 2 / (b1.length() + b2.length()); if (b3.z * lam < 0) lam = -lam;   // the mat is in front of the camera
    const r1 = b1.multiplyScalar(lam), r2 = b2.multiplyScalar(lam), t = b3.multiplyScalar(lam);
    const x = r1.clone().normalize(), y = r2.clone().sub(x.clone().multiplyScalar(x.dot(r2))).normalize(), z = x.clone().cross(y);
    return { x, y, z, t };                                                // camera (OpenCV axes) = [x y z] * (plane x, plane z, -up) + t
  }
  // world (x right, y up, z toward you; cm) -> three.js view matrix
  function viewMatrix(p) {
    // plane coords: (X = x, Y = z, Z = -y). cv = R * plane + t. three camera = diag(1,-1,-1) * cv
    const R = new THREE.Matrix4().set(p.x.x, p.y.x, p.z.x, p.t.x, p.x.y, p.y.y, p.z.y, p.t.y, p.x.z, p.y.z, p.z.z, p.t.z, 0, 0, 0, 1);
    const Mw = new THREE.Matrix4().set(1, 0, 0, 0, 0, 0, 1, 0, 0, -1, 0, 0, 0, 0, 0, 1);
    const Cf = new THREE.Matrix4().makeScale(1, -1, -1);
    return Cf.multiply(R).multiply(Mw);
  }

  // ---- each frame: look for the mat about 8 times a second
  function step(now) {
    if (!D.on || video.readyState < 2 || now - D.lastT < 120) return D.ok;
    D.lastT = now; sizes();
    g.drawImage(video, 0, 0, D.W, D.H);
    const ms = det.detect(g.getImageData(0, 0, D.W, D.H)).filter(m => MARKERS[m.id]);
    D.ids = ms.map(m => m.id); D.marks = ms.map(m => m.corners); if (ms.length) D.lastSeen = now;
    if (ms.length < 1) { D.ok = D.have && now - D.seen < 1e9; return D.ok; }   // a hand over the mat: keep the last pose (the phone is still)
    const P = [], Q = [];
    for (const m of ms) { const w = markerCorners(m.id); m.corners.forEach((c, i) => { P.push(w[i]); Q.push([c.x, c.y]); }); }
    const H = homography(P, Q); if (!H) return D.ok;
    if (ms.length >= 2) { const f = focalFrom(H); if (f) { D.fSamples.push(f); if (D.fSamples.length > 40) D.fSamples.shift(); if (D.fSamples.length >= 6) { const s = [...D.fSamples].sort((a, b) => a - b); D.f = s[s.length >> 1]; try { localStorage.setItem('desk_f_' + D.facing, D.f / Math.max(D.W, D.H)); } catch (e) { } } } }
    // until the zoom is known well, try zooms from 40 to 100 degrees and keep the one whose pose lands the corners best
    if (D.fSamples.length < 6) {
      const long = Math.max(D.W, D.H); let best = D.f, be = reproj(poseFrom(H, D.f), P, Q, D.f);
      for (let fov = 40; fov <= 100; fov += 2) { const f = long / 2 / Math.tan(fov / 2 * Math.PI / 180), e = reproj(poseFrom(H, f), P, Q, f); if (e < be - .05) { be = e; best = f; } }
      D.f = best;
    }
    const p = poseFrom(H, D.f), V = viewMatrix(p);
    D.err = reproj(p, P, Q, D.f); if (D.err > 12) return D.ok;            // a bad read: ignore it
    // smooth: small changes are sensor noise (blend slowly), a big jump means the phone was moved (follow at once)
    const pos = new THREE.Vector3(), q = new THREE.Quaternion(), sc = new THREE.Vector3(); new THREE.Matrix4().copy(V).invert().decompose(pos, q, sc);
    if (!D.have) { D.pos = pos; D.q = q; D.have = true; }
    else { const jump = D.pos.distanceTo(pos) > 3 || D.q.angleTo(q) > .08, k = jump ? 1 : ms.length >= 3 ? .35 : .2; D.pos.lerp(pos, k); D.q.slerp(q, k); }
    D.seen = now; D.ok = true; return true;
  }

  // how far (px) the corners land from where a pose puts them
  function reproj(p, P, Q, f) {
    const V = viewMatrix(p); let e = 0;
    P.forEach((w, i) => { const c = new THREE.Vector3(w[0], 0, w[1]).applyMatrix4(V); const u = D.W / 2 + f * c.x / -c.z, v = D.H / 2 - f * c.y / -c.z; e += Math.hypot(u - Q[i][0], v - Q[i][1]); });
    return e / P.length;
  }
  // three.js camera = the phone camera, for a picture shown "cover" on a screen of sw x sh px
  function apply(camera, sw, sh) {
    if (!D.have) return;
    const s = Math.max(sw / D.W, sh / D.H);
    camera.fov = 2 * Math.atan(sh / 2 / (D.f * s)) * 180 / Math.PI; camera.aspect = sw / sh; camera.near = 1; camera.far = 500; camera.updateProjectionMatrix();
    camera.position.copy(D.pos); camera.quaternion.copy(D.q); camera.updateMatrixWorld();
  }
  // picture (0..1 of the detection copy) -> screen px, and the camera ray through a picture point (cv camera axes)
  function toScreen(nx, ny, sw, sh) { const s = Math.max(sw / D.W, sh / D.H), dw = D.W * s, dh = D.H * s; return { x: (sw - dw) / 2 + nx * dw, y: (sh - dh) / 2 + ny * dh }; }
  return { D, start, stop, step, apply, toScreen, get ok() { return D.ok; }, get f() { return D.f; }, get W() { return D.W; }, get H() { return D.H; } };
}
