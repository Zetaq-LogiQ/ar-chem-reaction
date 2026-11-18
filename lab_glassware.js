/* Kit "lab_glassware": a procedural school chemistry lab (CBSE Classes 6-10). Our own design, built in code, phone-light.
   Units: 1 = 10 cm. The origin of every piece is the centre of its foot on the bench (y = 0).
   Look: soft 2.5D illustration: flat toon tones, a clean ink outline, glass that reads as glass (a see-through body, a
   blue-grey outline, a rim ring and one white highlight streak), liquids with a lighter surface. No words in the world:
   only object markings (scale ticks, blank label bands).

   Pieces (kit:lab_glassware/<piece>?param=..):
     (bottle, jar, dropper_bottle take label=<text>: the name on the paper label; the colour inside must be the real one)
     beaker?ml=100|250|500      conical_flask?ml=100|250     round_flask      test_tube      boiling_tube
     gas_jar    mortar (with pestle)
     cylinder?ml=100            china_dish                   watch_glass      petri_dish     tumbler
     funnel?paper=true          sep_funnel                   bottle?color=..  jar?color=..   dropper_bottle?color=..
     wash_bottle                rack?n=4                     stand?h=1.5&ring=0.3            tripod       burner?kind=spirit|bunsen
     rod    thermometer    spatula    tongs    magnet    sieve    paper?color=..    ph_chart    splint    torch    tester
     tube (delivery tube)       balloon      cork      nail      ribbon      bench?w=7&d=2.6
   Any vessel also takes  liquid=<#hex>&fill=<0..1>  for a still picture in a normal lesson scene.

   For sims: a vessel carries obj.userData.lab = {kind:'vessel', prof, y0, y1, mouth, rTop, cap}. Its contents are drawn by
     EB.kits.get('lab_glassware').setContents(obj, {layers:[{from, to, color, alpha}], sediment:{to, color}, floating:{color, th},
                                                     crystals:{color, n}}, lib)      (from / to = share of the volume, 0..1)
   which rebuilds only what changed and disposes the old geometry. setResidue(funnel, {color, amount}), setFlame(burner, on),
   setPaper(strip, color), setCoat(piece, color), dispose(obj) are the other live hooks.                                    */
(function (G) {
  'use strict';
  var EB = G.EB;
  var INK = '#4a2e22', GINK = '#4f7890', INKW = 0.016, GINKW = 0.02;
  var COL = { wood: '#c79a6b', woodD: '#9a6c45', top: '#b98a5e', iron: '#4b4f57', steel: '#9aa3ad', steelL: '#c5ccd3', brass: '#c9a13f', porcelain: '#f4f1ea', paper: '#fbfaf5',
    rubber: '#c6463a', cork: '#b98a5a', plastic: '#eef2f4', label: '#f3ead4', red: '#d9463e', blue: '#3a62c9', black: '#2a2c31', glassRim: '#8fb1c2', spirit: '#8e7fe0' };
  var store = null;   // shared materials + textures (one THREE per page)
  function S(T) {
    if (store && store.T === T) return store;
    var d = new Uint8Array([150, 150, 150, 255, 208, 208, 208, 255, 255, 255, 255, 255]);
    var ramp = new T.DataTexture(d, 3, 1, T.RGBAFormat); ramp.minFilter = ramp.magFilter = T.NearestFilter; ramp.generateMipmaps = false; ramp.needsUpdate = true;
    store = { T: T, ramp: ramp, mats: {}, inks: {} }; return store;
  }
  function toon(T, col, o) {
    var s = S(T), k = 't' + col + (o ? JSON.stringify(o) : ''); if (s.mats[k]) return s.mats[k];
    return (s.mats[k] = new T.MeshToonMaterial(Object.assign({ color: col, gradientMap: s.ramp }, o || {})));
  }
  function flat(T, col, o) { var s = S(T), k = 'b' + col + (o ? JSON.stringify(o) : ''); return s.mats[k] || (s.mats[k] = new T.MeshBasicMaterial(Object.assign({ color: col }, o || {}))); }
  function glassMat(T) { var s = S(T); return s.mats.glass || (s.mats.glass = new T.MeshBasicMaterial({ color: '#d5ecf5', transparent: true, opacity: 0.15, side: T.DoubleSide })); }
  /* the ink outline: an inverted hull pushed out along the normals (the stage keeps materials of meshes marked userData.outline) */
  function inkMat(T, col, w, glass) {
    var s = S(T), k = col + w + (glass ? 'g' : ''); if (s.inks[k]) return s.inks[k];
    var m = new T.MeshBasicMaterial({ color: col, side: T.BackSide, transparent: !!glass, opacity: glass ? 0.9 : 1 });
    m.onBeforeCompile = function (sh) { sh.uniforms.uInk = { value: w }; sh.vertexShader = 'uniform float uInk;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n transformed += normalize(normal) * uInk;'); };
    m.customProgramCacheKey = function () { return 'labink' + k; };
    return (s.inks[k] = m);
  }
  function ink(T, mesh, o) {
    o = o || {}; var h = new T.Mesh(mesh.geometry, inkMat(T, o.color || INK, o.w || INKW, !!o.glass));
    h.userData.outline = true; h.userData.ink = [o.color || INK, o.w || INKW, !!o.glass]; h.castShadow = false; h.receiveShadow = false; if (o.glass) h.renderOrder = 4; mesh.add(h); return mesh;
  }
  /* an opaque toon piece with its outline */
  function solid(T, geo, col, o) {
    o = o || {}; var m = new T.Mesh(geo, o.mat || toon(T, col, o.side ? { side: o.side } : null)); m.castShadow = o.shadow !== false; m.receiveShadow = true;
    if (o.ink !== false) ink(T, m, { w: o.inkW }); return m;
  }
  function lathe(T, pts, seg, ps, pl) { return new T.LatheGeometry(pts.map(function (p) { return new T.Vector2(Math.max(0.0005, p[0]), p[1]); }), seg || 28, ps || 0, pl == null ? Math.PI * 2 : pl); }
  function cyl(T, r0, r1, h, seg, y) { var g = new T.CylinderGeometry(r0, r1, h, seg || 16); g.translate(0, (y || 0) + h / 2, 0); return g; }
  function box(T, w, h, d, x, y, z) { var g = new T.BoxGeometry(w, h, d); g.translate(x || 0, (y || 0) + h / 2, z || 0); return g; }
  function mix(a, b, k, T) { var x = new T.Color(a), y = new T.Color(b); return x.lerp(y, k); }
  var blobTex = null;
  function blob(T, r) {   // a soft contact shadow under a piece
    if (typeof document === 'undefined') return new T.Group();
    if (!blobTex) { var c = document.createElement('canvas'); c.width = c.height = 64; var g = c.getContext('2d'), gr = g.createRadialGradient(32, 32, 4, 32, 32, 32); gr.addColorStop(0, 'rgba(60,36,20,0.42)'); gr.addColorStop(1, 'rgba(60,36,20,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); blobTex = new T.CanvasTexture(c); }
    var m = new T.Mesh(new T.PlaneGeometry(r * 2.7, r * 2.7), new T.MeshBasicMaterial({ map: blobTex, transparent: true, depthWrite: false })); m.rotation.x = -Math.PI / 2; m.position.y = 0.004; m.renderOrder = 0; m.userData.noPick = true; return m;
  }

  /* a paper label with the name of what is inside (an object marking, like the label on a real reagent bottle) */
  function labelMat(T, text, stripe) {
    if (typeof document === 'undefined') return flat(T, COL.label);
    var c = document.createElement('canvas'); c.width = 256; c.height = 128; var g = c.getContext('2d');
    g.fillStyle = COL.label; g.fillRect(0, 0, 256, 128); g.strokeStyle = '#6b4a30'; g.lineWidth = 6; g.strokeRect(5, 5, 246, 118);
    if (stripe) { g.fillStyle = stripe; g.fillRect(8, 96, 240, 22); }
    var words = String(text || '').split(' '), lines = [text];
    if (words.length > 1 && String(text).length > 7) { var best = 1, bd = 1e9; for (var i = 1; i < words.length; i++) { var d = Math.abs(words.slice(0, i).join(' ').length - words.slice(i).join(' ').length); if (d < bd) { bd = d; best = i; } } lines = [words.slice(0, best).join(' '), words.slice(best).join(' ')]; }
    var size = lines.length > 1 ? 40 : 52; g.fillStyle = '#2b2118'; g.textAlign = 'center'; g.textBaseline = 'middle';
    do { g.font = '700 ' + size + 'px "Segoe UI", "Helvetica Neue", Arial, sans-serif'; size -= 2; } while (size > 16 && Math.max.apply(null, lines.map(function (l) { return g.measureText(l).width; })) > 226);
    var mid = stripe ? 50 : 64; lines.forEach(function (l, i) { g.fillText(l, 128, mid + (i - (lines.length - 1) / 2) * (size + 8)); });
    var t = new T.CanvasTexture(c); t.colorSpace = T.SRGBColorSpace; t.anisotropy = 4; 
    return new T.MeshBasicMaterial({ map: t });
  }
  function labelBand(T, r, y0, y1, text, stripe, arc) { var a = arc || 1.5, m = new T.Mesh(lathe(T, [[r, y0], [r, y1]], 12, -a / 2, a), labelMat(T, text, stripe)); m.renderOrder = 5; m.castShadow = false; return m; }

  // ---------- glass vessels ----------
  /* o: {outer:[[r,y]..] bottom centre -> rim, wall, floor, fill (share of the height that counts as full), cap (mL), streak:[y0,y1,r]} */
  function vessel(T, o) {
    var g = new T.Group(), outer = o.lift === false ? o.outer : o.outer.map(function (q) { return [q[0], q[1] + 0.008]; }), top = outer[outer.length - 1], wall = o.wall || 0.014, y0 = outer[0][1] + (o.floor || 0.03);
    var body = new T.Mesh(lathe(T, outer, o.seg), o.mat || glassMat(T)); body.renderOrder = 3; body.castShadow = false; body.receiveShadow = false;
    if (!o.mat) ink(T, body, { color: GINK, glass: true, w: GINKW }); else ink(T, body);
    g.add(body);
    if (!o.mat && o.rim !== false) { var rim = new T.Mesh(new T.TorusGeometry(top[0], 0.011, 6, 36), flat(T, COL.glassRim)); rim.rotation.x = Math.PI / 2; rim.position.y = top[1]; rim.renderOrder = 4; rim.castShadow = false; g.add(rim); }
    if (!o.mat && o.streak !== false) {   // one white highlight streak on the left
      var st = o.streak || [outer[1][1] + 0.06, top[1] - 0.08], pts = [];
      outer.forEach(function (p) { if (p[1] >= st[0] && p[1] <= st[1]) pts.push([p[0] + 0.003, p[1]]); });
      if (pts.length < 2) pts = [[rAt(outer, st[0]) + 0.003, st[0]], [rAt(outer, st[1]) + 0.003, st[1]]];
      var hl = new T.Mesh(lathe(T, pts, 3, -0.95, 0.2), flat(T, '#ffffff', { transparent: true, opacity: 0.55, depthWrite: false })); hl.renderOrder = 5; hl.castShadow = false; hl.userData.noPick = true; g.add(hl);
    }
    // the inner profile (where contents go): the outer wall moved in
    var prof = [[0, y0]];
    outer.forEach(function (p) { if (p[1] >= y0 - 1e-6 && p[0] > wall) prof.push([p[0] - wall, p[1]]); });
    if (prof.length > 1 && prof[1][1] > y0 + 1e-6) prof.splice(1, 0, [rAt(outer, y0) - wall, y0]);
    var yTop = y0 + (top[1] - y0) * (o.fill || 0.9);
    g.userData.lab = { kind: 'vessel', prof: prof, y0: y0, y1: yTop, mouth: [0, top[1], 0], rTop: top[0], cap: o.cap || 100, opaque: !!o.mat };
    g.userData.lab.vol = volTable(prof, y0, yTop);
    if (o.shadow !== false) { var bl = blob(T, Math.max.apply(null, outer.map(function (p) { return p[0]; }))); g.add(bl); g.userData.lab.blob = bl; }
    return g;
  }
  function rAt(prof, y) {
    for (var i = 1; i < prof.length; i++) { var a = prof[i - 1], b = prof[i]; if (y <= b[1] + 1e-9 && b[1] > a[1]) { var k = (y - a[1]) / (b[1] - a[1]); return a[0] + (b[0] - a[0]) * Math.max(0, Math.min(1, k)); } }
    return prof[prof.length - 1][0];
  }
  function volTable(prof, y0, y1) { var n = 48, t = [0], v = 0; for (var i = 1; i <= n; i++) { var ya = y0 + (y1 - y0) * (i - 0.5) / n, r = rAt(prof, ya); v += r * r; t.push(v); } return t.map(function (x) { return x / v; }); }
  function yFor(L, f) {   // height of the surface when a share f of the volume is filled
    f = Math.max(0, Math.min(1, f)); var t = L.vol, n = t.length - 1;
    for (var i = 1; i <= n; i++) if (f <= t[i] + 1e-12) { var k = (f - t[i - 1]) / Math.max(1e-12, t[i] - t[i - 1]); return L.y0 + (L.y1 - L.y0) * (i - 1 + k) / n; }
    return L.y1;
  }
  function slab(T, L, ya, yb, inset) {   // a solid of revolution filling the vessel between two heights
    var pts = [[0, ya], [Math.max(0.002, rAt(L.prof, ya) - inset), ya]];
    L.prof.forEach(function (p) { if (p[1] > ya + 1e-4 && p[1] < yb - 1e-4) pts.push([Math.max(0.002, p[0] - inset), p[1]]); });
    pts.push([Math.max(0.002, rAt(L.prof, yb) - inset), yb], [0, yb]);
    return lathe(T, pts, 24);
  }
  function setGeo(m, g) { if (m.geometry) m.geometry.dispose(); m.geometry = g; }
  /* draw the contents of a vessel. c = {layers:[{from, to, color, alpha}], sediment:{to, color}, floating:{color, th}, crystals:{color, n}} */
  function setContents(obj, c, lib) {
    var T = lib.THREE, L = obj.userData.lab; if (!L || L.kind !== 'vessel') return;
    var F = L.fx; c = c || {};
    if (!F) {
      F = L.fx = { g: new T.Group(), liq: [], key: '' }; F.g.userData.labFx = true; obj.add(F.g);
      for (var i = 0; i < 3; i++) { var m = new T.Mesh(new T.BufferGeometry(), new T.MeshBasicMaterial({ color: '#9fd0ea', transparent: true, opacity: 0.6, depthWrite: false })); m.renderOrder = 1; m.visible = false; m.castShadow = false; F.g.add(m); F.liq.push(m); }
      F.surf = new T.Mesh(new T.BufferGeometry(), new T.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.5, depthWrite: false })); F.surf.renderOrder = 2; F.surf.visible = false; F.g.add(F.surf);
      F.sed = new T.Mesh(new T.BufferGeometry(), new T.MeshToonMaterial({ color: '#d6bf8c', gradientMap: S(T).ramp })); F.sed.visible = false; F.sed.castShadow = false; F.g.add(F.sed);
      F.flo = new T.Mesh(new T.BufferGeometry(), new T.MeshToonMaterial({ color: '#c9a66b', gradientMap: S(T).ramp })); F.flo.visible = false; F.flo.castShadow = false; F.g.add(F.flo);
      F.xt = new T.InstancedMesh(new T.BoxGeometry(0.035, 0.03, 0.035), new T.MeshToonMaterial({ color: '#f4f4f1', gradientMap: S(T).ramp }), 40); F.xt.count = 0; F.xt.castShadow = false; F.xt.frustumCulled = false; F.g.add(F.xt);
      if (obj.userData.partId) F.g.traverse(function (x) { x.userData.partId = obj.userData.partId; });
    }
    if (c.tilt != null && (c.layers || []).length) {   // the vessel is tipped: one liquid body, cut off level at world height c.tilt
      if (!F.tilt) {
        var u = { value: 0 }, tm = new T.MeshBasicMaterial({ color: '#9fd0ea', transparent: true, opacity: 0.8, side: T.DoubleSide, depthWrite: false });
        tm.onBeforeCompile = function (sh) { sh.uniforms.uCutY = u;
          sh.vertexShader = 'varying float vLabY;\n' + sh.vertexShader.replace('#include <project_vertex>', '#include <project_vertex>\n vLabY = (modelMatrix * vec4(transformed, 1.0)).y;');
          sh.fragmentShader = 'uniform float uCutY;\nvarying float vLabY;\n' + sh.fragmentShader.replace('#include <clipping_planes_fragment>', '#include <clipping_planes_fragment>\n if (vLabY > uCutY) discard;'); };
        tm.customProgramCacheKey = function () { return 'labtilt'; };
        var top2 = L.prof[L.prof.length - 1][1];
        F.tilt = new T.Mesh(slab(T, L, L.y0, top2 - 0.004, L.opaque ? 0.004 : 0.008), tm); F.tilt.renderOrder = 1; F.tilt.castShadow = false; F.tilt.userData.outline = true; F.tilt.userData.cut = u;
        if (obj.userData.partId) F.tilt.userData.partId = obj.userData.partId; F.g.add(F.tilt);
      }
      F.tilt.visible = true; F.tilt.userData.cut.value = c.tilt; F.tilt.material.color.set(c.layers[0].color); F.tilt.material.opacity = c.layers[0].alpha != null ? c.layers[0].alpha : 0.7;
      F.liq.forEach(function (m) { m.visible = false; }); F.surf.visible = false; F.sed.visible = false; F.flo.visible = false; return;
    }
    if (F.tilt) F.tilt.visible = false;
    var inset = L.opaque ? 0.004 : 0.008, layers = (c.layers || []).filter(function (l) { return l.to - l.from > 0.004; }), top = 0, shape = '';
    F.liq.forEach(function (m, i) {
      var l = layers[i]; m.visible = !!l; if (!l) return;
      var k = l.from.toFixed(3) + '-' + l.to.toFixed(3); shape += k;
      if (m.userData.k !== k) { setGeo(m, slab(T, L, yFor(L, l.from), yFor(L, l.to), inset)); m.userData.k = k; }
      m.material.color.set(l.color); m.material.opacity = l.alpha != null ? l.alpha : 0.6; top = Math.max(top, l.to);
    });
    var tl = layers[layers.length - 1]; F.surf.visible = !!tl;
    if (tl) { var ys = yFor(L, tl.to), rs = Math.max(0.004, rAt(L.prof, ys) - inset - 0.004), ks = ys.toFixed(3); if (F.surf.userData.k !== ks) { var cg = new T.CircleGeometry(rs, 28); cg.rotateX(-Math.PI / 2); cg.translate(0, ys + 0.002, 0); setGeo(F.surf, cg); F.surf.userData.k = ks; } F.surf.material.color.copy(mix(tl.color, '#ffffff', 0.3, T)); F.surf.material.opacity = Math.min(0.92, (tl.alpha != null ? tl.alpha : 0.6) + 0.2); }
    var sd = c.sediment && c.sediment.to > 0.003 ? c.sediment : null; F.sed.visible = !!sd;
    if (sd) { var kd = sd.to.toFixed(3); if (F.sed.userData.k !== kd) { setGeo(F.sed, slab(T, L, L.y0, yFor(L, Math.min(1, sd.to)), inset + 0.002)); F.sed.userData.k = kd; } F.sed.material.color.set(sd.color); }
    var fl = c.floating && top > 0 ? c.floating : null; F.flo.visible = !!fl;
    if (fl) { var yf = yFor(L, top), kf = yf.toFixed(3) + (fl.th || 0.02); if (F.flo.userData.k !== kf) { var fg = cyl(T, Math.max(0.01, rAt(L.prof, yf) - inset - 0.01), Math.max(0.01, rAt(L.prof, yf) - inset - 0.01), fl.th || 0.02, 20, yf - 0.004); setGeo(F.flo, fg); F.flo.userData.k = kf; } F.flo.material.color.set(fl.color); }
    var xc = c.crystals && c.crystals.n > 0 ? c.crystals : null, nx = xc ? Math.min(40, Math.round(xc.n)) : 0;
    if (F.xt.count !== nx || (xc && F.xt.userData.col !== xc.color)) {
      var mt = new T.Matrix4(), q = new T.Quaternion(), e = new T.Euler(), base = yFor(L, sd ? sd.to : 0) + 0.012, R = Math.max(0.02, rAt(L.prof, base) - 0.05);
      for (var j = 0; j < nx; j++) { var a = j * 2.399963, rr = R * Math.sqrt((j + 0.5) / 40) * 1.05; e.set(j * 0.7, j * 1.3, j * 0.4); q.setFromEuler(e); var sc = 0.7 + ((j * 37) % 10) / 14; mt.compose(new T.Vector3(Math.cos(a) * Math.min(rr, R), base, Math.sin(a) * Math.min(rr, R)), q, new T.Vector3(sc, sc, sc)); F.xt.setMatrixAt(j, mt); }
      F.xt.count = nx; F.xt.instanceMatrix.needsUpdate = true; if (xc) { F.xt.material.color.set(xc.color); F.xt.userData.col = xc.color; }
    }
    L.surfaceY = top > 0 ? yFor(L, top) : (sd ? yFor(L, sd.to) : L.y0);
  }
  function stillFill(obj, p, lib) { if (p.liquid || p.fill) setContents(obj, { layers: [{ from: 0, to: p.fill != null ? +p.fill : 0.6, color: p.liquid || '#bfe3f2', alpha: p.alpha != null ? +p.alpha : 0.55 }] }, lib); return obj; }
  function ticks(T, r, y0, y1, n, major) {   // scale marks on glass (object markings, no words)
    var g = new T.Group();
    for (var i = 0; i <= n; i++) { var big = i % (major || 5) === 0, len = big ? 0.34 : 0.2, t = new T.Mesh(lathe(T, [[r + 0.004, y0 + (y1 - y0) * i / n - 0.004], [r + 0.004, y0 + (y1 - y0) * i / n + 0.004]], 4, 0.25, len), flat(T, '#6d8ea3')); t.renderOrder = 5; t.userData.noPick = true; g.add(t); }
    return g;
  }
  var PROF = {
    beaker: function (ml) { var r = ml <= 100 ? 0.25 : ml >= 500 ? 0.42 : 0.33, h = ml <= 100 ? 0.66 : ml >= 500 ? 1.1 : 0.9; return [[0, 0], [r - 0.04, 0], [r - 0.012, 0.012], [r, 0.045], [r, h - 0.05], [r + 0.012, h - 0.02], [r + 0.04, h]]; },
    conical: function (ml) { var k = ml <= 100 ? 0.76 : 1, r = 0.4 * k, h = 1.12 * k; return [[0, 0], [r - 0.04, 0], [r - 0.01, 0.012], [r, 0.05], [r - 0.012, 0.1], [0.13 * k + 0.03, 0.76 * k], [0.125 * k + 0.012, 0.82 * k], [0.125 * k + 0.012, h - 0.05], [0.125 * k + 0.05, h]]; },
    tube: function (r, h) { var p = [[0, 0]]; for (var i = 1; i <= 6; i++) { var a = i / 6 * Math.PI / 2; p.push([r * Math.sin(a), r - r * Math.cos(a)]); } p.push([r, h - 0.03], [r + 0.022, h]); return p; },
    round: function () { var p = [[0, 0]], R = 0.4; for (var i = 1; i <= 11; i++) { var a = i / 12 * Math.PI * 0.86; p.push([R * Math.sin(a), R - R * Math.cos(a)]); } p.push([0.115, 0.86], [0.115, 1.22], [0.15, 1.27]); return p; },
    cylinder: function () { return [[0, 0.05], [0.15, 0.05], [0.16, 0.07], [0.16, 1.62], [0.19, 1.68]]; }
  };
  var K = {
    palette: COL,
    setContents: setContents,
    beaker: function (p, lib) { var T = lib.THREE, ml = +p.ml || 250, pr = PROF.beaker(ml), g = vessel(T, { outer: pr, cap: ml, fill: 0.86 }), h = pr[pr.length - 1][1]; if (p.marks !== false) g.add(ticks(T, pr[3][0], h * 0.2, h * 0.74, 4, 2)); return stillFill(g, p, lib); },
    tumbler: function (p, lib) { var T = lib.THREE, g = vessel(T, { outer: [[0, 0], [0.24, 0], [0.26, 0.02], [0.33, 0.86], [0.335, 0.9]], cap: 250, fill: 0.9, floor: 0.05 }); return stillFill(g, p, lib); },
    conical_flask: function (p, lib) { var T = lib.THREE, ml = +p.ml || 250; return stillFill(vessel(T, { outer: PROF.conical(ml), cap: ml, fill: 0.62, streak: [0.14, 0.62 * (ml <= 100 ? 0.76 : 1)] }), p, lib); },
    round_flask: function (p, lib) { var T = lib.THREE; return stillFill(vessel(T, { outer: PROF.round(), cap: 250, fill: 0.5, streak: [0.16, 0.62] }), p, lib); },
    test_tube: function (p, lib) { var T = lib.THREE; return stillFill(vessel(T, { outer: PROF.tube(0.105, 1.42), cap: 20, fill: 0.8, floor: 0.02, shadow: p.shadow !== false && !p.inrack, seg: 20 }), p, lib); },
    boiling_tube: function (p, lib) { var T = lib.THREE; return stillFill(vessel(T, { outer: PROF.tube(0.15, 1.55), cap: 50, fill: 0.8, floor: 0.02, shadow: !p.inrack, seg: 20 }), p, lib); },
    cylinder: function (p, lib) {
      var T = lib.THREE, g = vessel(T, { outer: PROF.cylinder(), cap: +p.ml || 100, fill: 0.9, floor: 0.02 });
      var base = solid(T, cyl(T, 0.3, 0.32, 0.05, 6), '#dbe9ee'); g.add(base); g.add(ticks(T, 0.16, 0.2, 1.48, 20, 5)); return stillFill(g, p, lib);
    },
    gas_jar: function (p, lib) { var T = lib.THREE; return stillFill(vessel(T, { outer: [[0, 0], [0.27, 0], [0.3, 0.02], [0.3, 1.22], [0.36, 1.25], [0.36, 1.28]], cap: 250, fill: 0.9 }), p, lib); },
    /* mortar with its pestle (porcelain) */
    mortar: function (p, lib) {
      var T = lib.THREE, g = vessel(T, { outer: [[0, 0], [0.24, 0], [0.3, 0.05], [0.4, 0.22], [0.44, 0.4], [0.45, 0.44]], cap: 100, fill: 0.7, mat: toon(T, COL.porcelain, { side: T.DoubleSide }), wall: 0.03, floor: 0.06 });
      var pe = solid(T, lathe(T, [[0, 0], [0.06, 0.01], [0.075, 0.08], [0.05, 0.16], [0.035, 0.6], [0.045, 0.66], [0, 0.68]], 12), COL.porcelain); pe.position.set(0.1, 0.1, 0); pe.rotation.z = -0.5; g.add(pe); g.userData.lab.pestle = pe; return stillFill(g, p, lib);
    },
    china_dish: function (p, lib) {
      var T = lib.THREE, pr = [[0, 0], [0.2, 0], [0.3, 0.035], [0.42, 0.13], [0.5, 0.26], [0.52, 0.29]];
      var g = vessel(T, { outer: pr, cap: 80, fill: 0.78, mat: toon(T, COL.porcelain, { side: T.DoubleSide }), wall: 0.02, floor: 0.035 }); return stillFill(g, p, lib);
    },
    watch_glass: function (p, lib) { var T = lib.THREE; return stillFill(vessel(T, { outer: [[0, 0], [0.12, 0.004], [0.26, 0.03], [0.38, 0.075], [0.43, 0.105]], cap: 15, fill: 0.7, floor: 0.012, wall: 0.008, streak: false }), p, lib); },
    petri_dish: function (p, lib) { var T = lib.THREE; return stillFill(vessel(T, { outer: [[0, 0], [0.4, 0], [0.42, 0.015], [0.42, 0.13]], cap: 50, fill: 0.8, floor: 0.015, streak: false }), p, lib); },
    /* funnel: origin at the tip of the stem. paper=true puts a folded filter-paper cone in it */
    funnel: function (p, lib) {
      var T = lib.THREE, g = vessel(T, { outer: [[0.035, 0], [0.04, 0.02], [0.045, 0.5], [0.07, 0.56], [0.4, 0.96], [0.42, 0.99]], cap: 60, fill: 0.86, floor: 0.56, wall: 0.012, streak: [0.62, 0.92], shadow: false });
      g.userData.lab.tip = [0, 0, 0]; g.userData.lab.kind = 'vessel'; g.userData.lab.funnel = true;
      if (p.paper !== false && p.paper !== 'false') {
        var pp = new T.Mesh(lathe(T, [[0.03, 0.555], [0.39, 0.985], [0.405, 1.03]], 28), toon(T, COL.paper, { side: T.DoubleSide })); pp.castShadow = false; ink(T, pp, { w: 0.01 });
        var fold = new T.Mesh(lathe(T, [[0.032, 0.557], [0.392, 0.987], [0.407, 1.032]], 2, 0.6, 0.05), flat(T, '#d9d2c2')); fold.userData.noPick = true;
        g.add(pp, fold); g.userData.lab.paper = pp;
        // the paper cone is the inside wall now
        g.userData.lab.prof = [[0, 0.575], [0.03, 0.575], [0.38, 0.985]]; g.userData.lab.y0 = 0.575; g.userData.lab.y1 = 0.94; g.userData.lab.vol = volTable(g.userData.lab.prof, 0.575, 0.94); g.userData.lab.opaque = true;
      }
      return g;
    },
    setResidue: function (obj, c, lib) {   // solid left on the filter paper: c = {color, amount 0..1} or null
      var T = lib.THREE, L = obj.userData.lab; if (!L) return;
      if (!L.res) { L.res = new T.Mesh(new T.BufferGeometry(), new T.MeshToonMaterial({ color: '#8a6a45', gradientMap: S(T).ramp })); L.res.castShadow = false; L.res.visible = false; if (obj.userData.partId) L.res.userData.partId = obj.userData.partId; obj.add(L.res); }
      var on = !!(c && c.amount > 0.01); L.res.visible = on; if (!on) return;
      var yb = L.y0 + (L.y1 - L.y0) * Math.min(0.75, 0.22 + 0.5 * c.amount), k = yb.toFixed(3);
      if (L.res.userData.k !== k) { setGeo(L.res, slab(T, L, L.y0, yb, 0.006)); L.res.userData.k = k; } L.res.material.color.set(c.color);
    },
    sep_funnel: function (p, lib) {
      var T = lib.THREE, pr = [[0.03, 0], [0.035, 0.36], [0.05, 0.44], [0.2, 0.74], [0.27, 0.98], [0.27, 1.12], [0.2, 1.32], [0.09, 1.42], [0.08, 1.52], [0.1, 1.55]];
      var g = vessel(T, { outer: pr, cap: 100, fill: 0.86, floor: 0.44, streak: [0.8, 1.25], shadow: false });
      var cock = solid(T, cyl(T, 0.045, 0.045, 0.2, 10), COL.plastic); cock.rotation.z = Math.PI / 2; cock.position.set(0.1, 0.4, 0); g.add(cock);
      var handle = solid(T, box(T, 0.04, 0.16, 0.05, 0, -0.08, 0), COL.blue); handle.position.set(0.12, 0.4, 0); g.add(handle); g.userData.lab.tapHandle = handle;
      var stop = solid(T, cyl(T, 0.07, 0.09, 0.1, 12), COL.plastic); stop.position.y = 1.53; g.add(stop);
      g.userData.lab.tip = [0, 0, 0]; return stillFill(g, p, lib);
    },
    /* stock bottle with a stopper; color = the liquid inside (null = empty), band = the label stripe */
    bottle: function (p, lib) {
      var T = lib.THREE, g = vessel(T, { outer: [[0, 0], [0.2, 0], [0.225, 0.02], [0.225, 0.5], [0.19, 0.6], [0.09, 0.68], [0.085, 0.8], [0.105, 0.83]], cap: 250, fill: 0.62 });
      var st = solid(T, cyl(T, 0.07, 0.085, 0.07, 12), p.cap || COL.cork); st.position.y = 0.81; g.add(st); var knob = solid(T, new T.SphereGeometry(0.075, 12, 8), p.cap || COL.cork); knob.position.y = 0.92; g.add(knob);
      g.add(labelBand(T, 0.231, 0.14, 0.46, p.label, p.band, 1.7));
      if (p.color && p.color !== 'none') setContents(g, { layers: [{ from: 0, to: 0.82, color: p.color, alpha: p.alpha != null ? +p.alpha : 0.6 }] }, lib);
      return g;
    },
    /* jar of a solid with a lid; color = the powder */
    jar: function (p, lib) {
      var T = lib.THREE, g = vessel(T, { outer: [[0, 0], [0.22, 0], [0.245, 0.02], [0.245, 0.46], [0.22, 0.52], [0.21, 0.56]], cap: 200, fill: 0.8 });
      var lid = solid(T, cyl(T, 0.235, 0.235, 0.09, 20), p.lid || '#d9a441'); lid.position.y = 0.55; g.add(lid);
      g.add(labelBand(T, 0.251, 0.1, 0.4, p.label, p.band, 1.7));
      if (p.color && p.color !== 'none') setContents(g, { sediment: { to: p.fill != null ? +p.fill : 0.7, color: p.color } }, lib);
      return g;
    },
    dropper_bottle: function (p, lib) {
      var T = lib.THREE, g = vessel(T, { outer: [[0, 0], [0.13, 0], [0.15, 0.02], [0.15, 0.3], [0.12, 0.38], [0.07, 0.42], [0.07, 0.48]], cap: 30, fill: 0.7, mat: null });
      var collar = solid(T, cyl(T, 0.08, 0.08, 0.05, 12), COL.black); collar.position.y = 0.47; g.add(collar);
      var teat = solid(T, lathe(T, [[0, 0.22], [0.035, 0.2], [0.06, 0.12], [0.055, 0.03], [0.04, 0]], 12), COL.rubber); teat.position.y = 0.52; g.add(teat);
      g.add(labelBand(T, 0.156, 0.07, 0.27, p.label, null, 2.0));
      setContents(g, { layers: [{ from: 0, to: 0.8, color: p.color || '#8a5aa8', alpha: 0.8 }] }, lib); return g;
    },
    wash_bottle: function (p, lib) {
      var T = lib.THREE, g = new T.Group(), body = solid(T, lathe(T, [[0, 0], [0.2, 0], [0.22, 0.03], [0.22, 0.55], [0.16, 0.68], [0.08, 0.72], [0.08, 0.8]], 20), '#f2f6f7'); g.add(body);
      var cap = solid(T, cyl(T, 0.095, 0.095, 0.08, 14), COL.blue); cap.position.y = 0.78; g.add(cap);
      var c = new T.CatmullRomCurve3([new T.Vector3(0, 0.84, 0), new T.Vector3(0, 0.98, 0), new T.Vector3(0.1, 1.04, 0), new T.Vector3(0.3, 0.96, 0)]);
      g.add(solid(T, new T.TubeGeometry(c, 12, 0.018, 6, false), COL.blue, { inkW: 0.008 })); g.add(blob(T, 0.22));
      g.userData.lab = { kind: 'stock', mouth: [0.3, 0.96, 0] }; return g;
    },
    /* wooden rack for n test tubes: the tubes stand at x = (i - (n-1)/2) * 0.36, y = 0.1 */
    rack: function (p, lib) {
      var T = lib.THREE, n = +p.n || 4, w = n * 0.36 + 0.14, g = new T.Group();
      g.add(solid(T, box(T, w, 0.07, 0.42), COL.wood)); var topb = solid(T, box(T, w, 0.05, 0.42, 0, 0.72), COL.wood); g.add(topb);
      [-1, 1].forEach(function (s) { g.add(solid(T, box(T, 0.06, 0.72, 0.42, s * (w / 2 - 0.03), 0.04), COL.woodD)); });
      for (var i = 0; i < n; i++) { var hole = new T.Mesh(new T.CircleGeometry(0.125, 16), flat(T, '#6b4a30')); hole.rotation.x = -Math.PI / 2; hole.position.set((i - (n - 1) / 2) * 0.36, 0.772, 0); hole.userData.noPick = true; g.add(hole); }
      g.add(blob(T, w * 0.42)); g.userData.lab = { kind: 'rack', n: n, slots: Array.from({ length: n }, function (_, i) { return [(i - (n - 1) / 2) * 0.36, 0.08, 0]; }) }; return g;
    },
    /* ring stand: a base, a rod at the back and a ring at height h (the funnel sits in the ring) */
    stand: function (p, lib) {
      var T = lib.THREE, h = +p.h || 1.5, rr = +p.ring || 0.3, g = new T.Group();
      g.add(solid(T, box(T, 0.95, 0.06, 0.62, 0, 0, -0.08), '#5d6470'));
      var RX = -0.34, RZ = -0.3, dl = Math.hypot(RX, RZ), ang = Math.atan2(RX, RZ);   // the rod stands at the back left, clear of what is poured in
      var rod = solid(T, cyl(T, 0.026, 0.026, 2.5, 10), COL.steelL); rod.position.set(RX, 0.06, RZ); g.add(rod);
      var boss = solid(T, box(T, 0.1, 0.1, 0.1, 0, h - 0.05, 0), COL.steel); boss.position.set(RX, 0, RZ); boss.rotation.y = ang; g.add(boss);
      var arm = solid(T, box(T, 0.035, 0.035, dl - rr + 0.02, 0, h - 0.018, -(dl - rr + 0.02) / 2), COL.steel, { inkW: 0.008 }); arm.position.set(RX, 0, RZ); arm.rotation.y = ang; g.add(arm);
      if (rr > 0) { var ring = solid(T, new T.TorusGeometry(rr, 0.02, 8, 32), COL.steel, { inkW: 0.008 }); ring.rotation.x = Math.PI / 2; ring.position.y = h; g.add(ring); }
      g.add(blob(T, 0.5)); g.userData.lab = { kind: 'stand', ringY: h }; return g;
    },
    /* tripod with a wire gauze: a vessel stands on it at y = 0.98 */
    tripod: function (p, lib) {
      var T = lib.THREE, g = new T.Group(), H = 0.95;
      var ring = solid(T, new T.TorusGeometry(0.34, 0.022, 8, 28), COL.iron, { inkW: 0.008 }); ring.rotation.x = Math.PI / 2; ring.position.y = H; g.add(ring);
      for (var i = 0; i < 3; i++) { var a = i * Math.PI * 2 / 3 + Math.PI / 6, leg = solid(T, cyl(T, 0.02, 0.02, H + 0.02, 6), COL.iron, { inkW: 0.008 }); leg.position.set(Math.sin(a) * 0.34, 0, Math.cos(a) * 0.34); leg.rotation.set(Math.cos(a) * -0.16, 0, Math.sin(a) * 0.16); g.add(leg); }
      var gz = solid(T, box(T, 0.86, 0.012, 0.86, 0, H + 0.012), '#8d939b', { inkW: 0.008 }); g.add(gz);
      var pad = new T.Mesh(new T.CircleGeometry(0.26, 24), flat(T, '#e3dfd2')); pad.rotation.x = -Math.PI / 2; pad.position.y = H + 0.027; pad.userData.noPick = true; g.add(pad);
      g.add(blob(T, 0.5)); g.userData.lab = { kind: 'tripod', topY: H + 0.03 }; return g;
    },
    /* burner: a spirit lamp (default) or a Bunsen burner; its flame is hidden until setFlame(obj, true) */
    burner: function (p, lib) {
      var T = lib.THREE, g = new T.Group(), top;
      if (p.kind === 'bunsen') {
        g.add(solid(T, cyl(T, 0.24, 0.27, 0.06, 20), COL.iron)); var tube = solid(T, cyl(T, 0.05, 0.05, 0.52, 12), COL.steelL); tube.position.y = 0.06; g.add(tube);
        var col = solid(T, cyl(T, 0.07, 0.07, 0.1, 12), COL.brass); col.position.y = 0.14; g.add(col); top = 0.58;
      } else {
        var lamp = vessel(T, { outer: [[0, 0], [0.2, 0], [0.26, 0.05], [0.27, 0.16], [0.2, 0.28], [0.08, 0.33], [0.08, 0.36]], cap: 100, fill: 0.7, rim: false, streak: [0.08, 0.24] });
        setContents(lamp, { layers: [{ from: 0, to: 0.75, color: COL.spirit, alpha: 0.7 }] }, lib); g.add(lamp);
        var neck = solid(T, cyl(T, 0.085, 0.085, 0.07, 14), COL.brass); neck.position.y = 0.34; g.add(neck);
        var wick = solid(T, cyl(T, 0.03, 0.035, 0.07, 8), '#f1ede2', { inkW: 0.006 }); wick.position.y = 0.41; g.add(wick); top = 0.47;
      }
      var fl = new T.Group(); fl.position.y = top; fl.visible = false; fl.userData.noPick = true;
      var outer = new T.Mesh(lathe(T, [[0, 0], [0.06, 0.03], [0.085, 0.12], [0.06, 0.26], [0.02, 0.4], [0, 0.46]], 14), new T.MeshBasicMaterial({ color: p.kind === 'bunsen' ? '#6aa8ff' : '#ffb54a', transparent: true, opacity: 0.85, depthWrite: false }));
      var inner = new T.Mesh(lathe(T, [[0, 0], [0.03, 0.03], [0.04, 0.09], [0.02, 0.2], [0, 0.26]], 12), new T.MeshBasicMaterial({ color: p.kind === 'bunsen' ? '#d6ecff' : '#fff1b8', transparent: true, opacity: 0.95, depthWrite: false }));
      outer.renderOrder = 6; inner.renderOrder = 7; fl.add(outer, inner); g.add(fl);
      g.userData.lab = { kind: 'burner', flame: fl, flameY: top }; return g;
    },
    setFlame: function (obj, on) { var L = obj.userData.lab; if (L && L.flame) L.flame.visible = !!on; },
    flicker: function (obj, t) { var L = obj.userData.lab; if (!L || !L.flame || !L.flame.visible) return false; var s = 1 + 0.08 * Math.sin(t * 17) + 0.05 * Math.sin(t * 29.3); L.flame.scale.set(1 + 0.05 * Math.sin(t * 23), s, 1 + 0.05 * Math.sin(t * 23)); L.flame.rotation.z = 0.05 * Math.sin(t * 7.1); return true; },
    rod: function (p, lib) { var T = lib.THREE, g = new T.Group(), m = new T.Mesh(cyl(T, 0.024, 0.024, +p.l || 1.5, 8), flat(T, '#dff1f8')); ink(T, m, { color: GINK, w: 0.012 }); g.add(m); var hl = new T.Mesh(cyl(T, 0.006, 0.006, (+p.l || 1.5) * 0.8, 4, 0.1), flat(T, '#ffffff')); hl.position.x = -0.012; hl.position.z = 0.02; g.add(hl); g.userData.lab = { kind: 'tool' }; return g; },
    thermometer: function (p, lib) {
      var T = lib.THREE, g = new T.Group(); g.add(solid(T, cyl(T, 0.024, 0.024, 1.5, 8, 0.05), '#f3f7f8', { inkW: 0.007 }));
      var bulb = solid(T, new T.SphereGeometry(0.045, 10, 8), COL.red, { inkW: 0.007 }); bulb.position.y = 0.045; g.add(bulb);
      var colm = new T.Mesh(box(T, 0.012, 1, 0.012, 0, 0, 0), flat(T, COL.red)); colm.position.set(0, 0.08, 0.02); colm.scale.y = 0.3; g.add(colm);
      for (var i = 0; i <= 12; i++) { var t = new T.Mesh(box(T, i % 2 ? 0.014 : 0.024, 0.005, 0.004), flat(T, '#3d566b')); t.position.set(0.012, 0.3 + i * 0.09, 0.024); t.userData.noPick = true; g.add(t); }
      g.userData.lab = { kind: 'tool', column: colm, set: function (deg) { colm.scale.y = Math.max(0.05, Math.min(1.35, 0.22 + (deg / 110) * 1.08)); } }; return g;
    },
    spatula: function (p, lib) { var T = lib.THREE, g = new T.Group(); var h = solid(T, box(T, 0.6, 0.02, 0.05), COL.steelL, { inkW: 0.007 }); g.add(h); var b = solid(T, box(T, 0.2, 0.014, 0.09, 0.38), COL.steelL, { inkW: 0.007 }); g.add(b); var w = solid(T, box(T, 0.26, 0.04, 0.06, -0.2, -0.01), COL.woodD, { inkW: 0.007 }); g.add(w); g.userData.lab = { kind: 'tool' }; return g; },
    tongs: function (p, lib) { var T = lib.THREE, g = new T.Group(); [-1, 1].forEach(function (s) { var a = solid(T, box(T, 1.0, 0.025, 0.035), COL.steel, { inkW: 0.007 }); a.rotation.y = s * 0.09; a.position.z = s * 0.02; g.add(a); }); var piv = solid(T, cyl(T, 0.03, 0.03, 0.04, 8), COL.iron, { inkW: 0.006 }); g.add(piv); g.position.y = 0.02; var o = new T.Group(); o.add(g); o.userData.lab = { kind: 'tool' }; return o; },
    magnet: function (p, lib) {
      var T = lib.THREE, g = new T.Group(), arc = solid(T, new T.TorusGeometry(0.16, 0.055, 8, 16, Math.PI), COL.red); arc.position.y = 0.3; g.add(arc);
      [-1, 1].forEach(function (s) { var leg = solid(T, box(T, 0.11, 0.2, 0.11, s * 0.16, 0.1), COL.red); g.add(leg); var tip = solid(T, box(T, 0.11, 0.1, 0.11, s * 0.16, 0), COL.steelL); g.add(tip); });
      g.add(blob(T, 0.2)); g.userData.lab = { kind: 'tool' }; return g;
    },
    sieve: function (p, lib) {
      var T = lib.THREE, g = new T.Group(), ring = solid(T, lathe(T, [[0.4, 0], [0.42, 0], [0.42, 0.16], [0.4, 0.16]], 24), COL.wood, { side: T.DoubleSide }); g.add(ring);
      var mesh = new T.Mesh(new T.CircleGeometry(0.4, 24), flat(T, '#b9bfc6', { transparent: true, opacity: 0.75 })); mesh.rotation.x = -Math.PI / 2; mesh.position.y = 0.02; g.add(mesh);
      for (var i = -4; i <= 4; i++) { var l = new T.Mesh(box(T, Math.sqrt(0.16 - Math.pow(i * 0.085, 2)) * 2, 0.004, 0.008, 0, 0.021, i * 0.085), flat(T, '#7d848c')); l.userData.noPick = true; var l2 = l.clone(); l2.rotation.y = Math.PI / 2; g.add(l, l2); }
      g.userData.lab = { kind: 'vessel', prof: [[0, 0.025], [0.39, 0.025], [0.39, 0.15]], y0: 0.025, y1: 0.14, mouth: [0, 0.16, 0], rTop: 0.4, cap: 60, opaque: true, sieve: true }; g.userData.lab.vol = volTable(g.userData.lab.prof, 0.025, 0.14); return g;
    },
    /* test paper strip: litmus, turmeric or pH paper. setPaper(obj, color) colours the dipped end */
    paper: function (p, lib) {
      var T = lib.THREE, g = new T.Group(), a = new T.Mesh(box(T, 0.11, 0.008, 0.5), new T.MeshToonMaterial({ color: p.color || COL.blue, gradientMap: S(T).ramp })); ink(T, a, { w: 0.006 }); g.add(a);
      var tip = new T.Mesh(box(T, 0.112, 0.01, 0.2, 0, 0, 0.15), new T.MeshBasicMaterial({ color: p.color || COL.blue })); tip.visible = false; g.add(tip);
      g.userData.lab = { kind: 'tool', tip: tip, base: a }; return g;
    },
    setPaper: function (obj, col) { var L = obj.userData.lab; if (!L || !L.tip) return; L.tip.visible = !!col; if (col) L.tip.material.color.set(col); },
    ph_chart: function (p, lib) {
      var T = lib.THREE, g = new T.Group(), cols = ['#d9302c', '#ee7b2a', '#efd23a', '#56a84a', '#2f9aa8', '#3558c0', '#6a3aa8'];
      g.add(solid(T, box(T, 0.9, 0.012, 0.3), '#fbfaf5', { inkW: 0.007 }));
      cols.forEach(function (c, i) { var s = new T.Mesh(box(T, 0.105, 0.004, 0.2, -0.36 + i * 0.12, 0.012), flat(T, c)); s.userData.noPick = true; g.add(s); });
      g.userData.lab = { kind: 'tool' }; return g;
    },
    splint: function (p, lib) { var T = lib.THREE, g = new T.Group(); g.add(solid(T, box(T, 0.7, 0.025, 0.025), COL.wood, { inkW: 0.006 })); var tip = new T.Mesh(new T.SphereGeometry(0.03, 8, 6), flat(T, '#ff9a3a')); tip.position.set(0.36, 0.012, 0); g.add(tip); g.userData.lab = { kind: 'tool', glow: tip }; return g; },
    torch: function (p, lib) { var T = lib.THREE, g = new T.Group(), b = solid(T, cyl(T, 0.06, 0.06, 0.5, 12), '#3a62c9'); b.rotation.z = -Math.PI / 2; b.position.set(-0.25, 0.07, 0); g.add(b); var h = solid(T, cyl(T, 0.085, 0.06, 0.1, 12), COL.steelL); h.rotation.z = -Math.PI / 2; h.position.set(0.25, 0.07, 0); g.add(h); g.add(blob(T, 0.25)); g.userData.lab = { kind: 'tool' }; return g; },
    /* conductivity tester: a cell, a small bulb and two probes. lab.bulb glows through setGlow(obj, 0..1) */
    tester: function (p, lib) {
      var T = lib.THREE, g = new T.Group(); g.add(solid(T, box(T, 0.6, 0.05, 0.34), '#e9e4d8'));
      var cell = solid(T, cyl(T, 0.07, 0.07, 0.36, 12), '#1f2f4a'); cell.rotation.z = Math.PI / 2; cell.position.set(0.18, 0.12, 0.05); g.add(cell);
      var sock = solid(T, cyl(T, 0.05, 0.06, 0.1, 10), COL.steel); sock.position.set(-0.16, 0.05, 0); g.add(sock);
      var bulb = new T.Mesh(new T.SphereGeometry(0.075, 14, 10), new T.MeshStandardMaterial({ color: '#f3f7f8', transparent: true, opacity: 0.6, emissive: '#000000', roughness: 0.2 })); bulb.position.set(-0.16, 0.22, 0); bulb.renderOrder = 3; g.add(bulb);
      [-1, 1].forEach(function (s) { var pr = solid(T, cyl(T, 0.012, 0.012, 0.3, 6), '#3b3f46', { inkW: 0.005 }); pr.position.set(0.02 + s * 0.06, 0.05, -0.2); pr.rotation.x = -1.2; g.add(pr); });
      g.add(blob(T, 0.32)); g.userData.lab = { kind: 'tool', bulb: bulb }; return g;
    },
    setGlow: function (obj, k) { var L = obj.userData.lab; if (!L || !L.bulb) return; L.bulb.material.emissive.set(k > 0 ? '#ffd36b' : '#000000'); L.bulb.material.emissiveIntensity = 1.6 * k; L.bulb.material.opacity = 0.6 + 0.35 * Math.min(1, k); },
    /* delivery tube: from the mouth of one vessel over to the next (dx = distance, h0 / h1 = mouth heights, dip = how deep it dips) */
    tube: function (p, lib) {
      var T = lib.THREE, dx = +p.dx || 1, h0 = +p.h0 || 1.1, h1 = +p.h1 || 0.9, dip = p.dip != null ? +p.dip : 0.45, top = Math.max(h0, h1) + 0.28;
      var c = new T.CatmullRomCurve3([new T.Vector3(0, h0 - 0.1, 0), new T.Vector3(0, top - 0.06, 0), new T.Vector3(0.07, top, 0), new T.Vector3(dx - 0.07, top, 0), new T.Vector3(dx, top - 0.06, 0), new T.Vector3(dx, h1 - dip, 0)], false, 'catmullrom', 0.1);
      var g = new T.Group(), m = solid(T, new T.TubeGeometry(c, 40, 0.022, 7, false), '#cfe6ee', { inkW: 0.007 }); g.add(m);
      var cork = solid(T, cyl(T, 0.1, 0.085, 0.1, 12), COL.cork); cork.position.y = h0 - 0.06; g.add(cork);
      g.userData.lab = { kind: 'tool', end: [dx, h1 - dip, 0] }; return g;
    },
    cork: function (p, lib) { var T = lib.THREE, g = new T.Group(); g.add(solid(T, cyl(T, +p.r || 0.1, (+p.r || 0.1) * 0.85, 0.1, 12), COL.cork)); return g; },
    balloon: function (p, lib) { var T = lib.THREE, g = new T.Group(), b = solid(T, lathe(T, [[0.03, 0], [0.05, 0.05], [0.16, 0.2], [0.2, 0.36], [0.15, 0.5], [0, 0.56]], 16), p.color || '#e8553d'); g.add(b); g.userData.lab = { kind: 'tool', body: b }; return g; },
    nail: function (p, lib) { var T = lib.THREE, g = new T.Group(), m = new T.Mesh(cyl(T, 0.014, 0.004, 0.42, 6), new T.MeshToonMaterial({ color: p.color || '#8d939b', gradientMap: S(T).ramp })); ink(T, m, { w: 0.006 }); var hd = new T.Mesh(cyl(T, 0.035, 0.035, 0.012, 8, 0.42), m.material); g.add(m, hd); g.userData.lab = { kind: 'piece', mat: m.material }; return g; },
    ribbon: function (p, lib) { var T = lib.THREE, g = new T.Group(), m = new T.Mesh(box(T, 0.05, 0.4, 0.006), new T.MeshToonMaterial({ color: p.color || '#c9ced3', gradientMap: S(T).ramp })); ink(T, m, { w: 0.006 }); g.add(m); g.userData.lab = { kind: 'piece', mat: m.material }; return g; },
    setCoat: function (obj, col) { obj.traverse(function (m) { if (m.isMesh && !m.userData.outline && m.material.color) m.material.color.set(col); }); },
    /* the bench: a wooden table top (the top surface is y = 0) with a low shelf at the back (shelf top y = 0.62, z = -d/2 + 0.32) */
    bench: function (p, lib) {
      var T = lib.THREE, w = +p.w || 7, d = +p.d || 2.6, g = new T.Group();
      var top = solid(T, box(T, w, 0.14, d, 0, -0.14, 0), COL.top, { shadow: false }); g.add(top);
      var apron = solid(T, box(T, w - 0.3, 0.3, 0.08, 0, -0.44, d / 2 - 0.2), COL.woodD, { shadow: false }); g.add(apron);
      for (var i = 1; i < 4; i++) { var ln = new T.Mesh(box(T, w - 0.06, 0.002, 0.012, 0, 0.001, -d / 2 + i * d / 4), flat(T, '#a67a50')); ln.userData.noPick = true; g.add(ln); }
      if (p.shelf !== false && p.shelf !== 'false') {
        var sz = -d / 2 + 0.32; g.add(solid(T, box(T, w - 0.3, 0.06, 0.6, 0, 0.56, sz), COL.wood));
        [-1, 1].forEach(function (s) { g.add(solid(T, box(T, 0.07, 0.56, 0.56, s * (w / 2 - 0.3), 0, sz), COL.woodD)); });
        g.add(solid(T, box(T, w - 0.3, 0.62, 0.04, 0, 0, -d / 2 + 0.04), '#d9b88e', { shadow: false }));
      }
      g.traverse(function (m) { m.userData.noPick = true; if (m.isMesh) m.receiveShadow = true; });
      g.userData.lab = { kind: 'bench', shelfY: 0.62, shelfZ: -d / 2 + 0.32 }; return g;
    },
    /* a stage that clones every part material drops the outline shader: call this after the scene is loaded to put it back */
    fixInk: function (obj, lib) { var T = lib.THREE; obj.traverse(function (m) { if (m.userData.outline && m.userData.ink) m.material = inkMat(T, m.userData.ink[0], m.userData.ink[1], m.userData.ink[2]); }); },
    /* free a piece that is not coming back (the stage disposes whole scenes by itself) */
    dispose: function (obj) { obj.traverse(function (m) { if (m.geometry && !m.userData.outline) m.geometry.dispose(); }); if (obj.parent) obj.parent.remove(obj); }
  };
  K._util = { rAt: rAt, yFor: yFor, toon: toon, flat: flat, solid: solid, lathe: lathe, cyl: cyl, box: box, ink: ink, mix: mix, COL: COL };
  if (EB.kits && EB.kits.register) EB.kits.register('lab_glassware', K);
})(typeof self !== 'undefined' ? self : this);
