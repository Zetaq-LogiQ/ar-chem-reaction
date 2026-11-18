// chem.js - two beakers on a bench: pour beaker A into beaker B and watch the reaction (a colour change or a solid forming).
// The glassware is the ZetaQ chem lab kit (lab_glassware.js, unchanged; 1 kit unit = 10 cm). This group works in cm like the bottle demo.
import * as THREE from './vendor/three.module.js';
import './eb_shim.js';
import './lab_glassware.js';

const KIT = self.EB.kits.get('lab_glassware'), lib = { THREE };
const make = (piece, p = {}) => KIT[piece](p, lib);
const CLEAR = '#d6ecf6', POUR = 20, A0 = 100, B0 = 60, CAP = 250;          // mL; both solutions 0.1 M

// every reaction here is a standard CBSE Class 10 one (NCERT Science Ch 1 and Ch 2)
export const REACTIONS = [
  { name: 'Acid + base (with an indicator)', eq: 'NaOH + HCl → NaCl + H₂O',
    A: { name: 'Sodium hydroxide (dilute)', label: 'Sodium hydroxide' }, B: { name: 'Hydrochloric acid (dilute) + phenolphthalein', label: 'Hydrochloric acid' },
    drop: 'Phenolphthalein', kind: 'indicator' },
  { name: 'Lead nitrate + potassium iodide', eq: 'Pb(NO₃)₂ + 2KI → PbI₂ ↓ (yellow) + 2KNO₃',
    A: { name: 'Lead nitrate solution', label: 'Lead nitrate' }, B: { name: 'Potassium iodide solution', label: 'Potassium iodide' },
    kind: 'ppt', ratio: 2, ppt: '#f3c21a', pname: 'lead iodide', pcol: 'Yellow', safe: 'Lead salts are poisonous: a teacher does this one.' },
  { name: 'Sodium sulphate + barium chloride', eq: 'Na₂SO₄ + BaCl₂ → BaSO₄ ↓ (white) + 2NaCl',
    A: { name: 'Sodium sulphate solution', label: 'Sodium sulphate' }, B: { name: 'Barium chloride solution', label: 'Barium chloride' },
    kind: 'ppt', ratio: 1, ppt: '#f6f6f2', pname: 'barium sulphate', pcol: 'White' }
];

export function createChem(ctx) {
  const group = new THREE.Group();                                       // cm
  const K = new THREE.Group(); K.scale.setScalar(10); group.add(K);      // kit units
  const bench = make('bench', { w: 4.4, d: 2.2, shelf: false }); K.add(bench);
  const A = make('beaker', { ml: 250 }), Bk = make('beaker', { ml: 250 });
  const AX = -0.75, BX = 0.75; A.position.x = AX; Bk.position.x = BX; K.add(A, Bk);
  const LA = A.userData.lab, LB = Bk.userData.lab;
  const stream = new THREE.Mesh(new THREE.CylinderGeometry(.024, .03, 1, 10, 1, true).translate(0, -.5, 0),
    new THREE.MeshBasicMaterial({ color: '#a9d6ee', transparent: true, opacity: .8, depthWrite: false }));
  stream.visible = false; stream.renderOrder = 2; K.add(stream);
  let extras = [];
  const S = { r: 0, vA: A0, vB: B0, nA: 0, nB: 0, pours: 0, cloud: 0, sed: 0, made: 0, flash: 0, busy: 0, msg: '' };

  function setup(r) {
    S.r = r; const R = REACTIONS[r];
    extras.forEach(o => KIT.dispose(o)); extras = [];
    const ba = make('bottle', { label: R.A.label, color: CLEAR, alpha: .35 }), bb = make('bottle', { label: R.B.label, color: CLEAR, alpha: .35 });
    ba.position.set(AX - .45, 0, -.7); bb.position.set(BX + .45, 0, -.7); extras.push(ba, bb);
    if (R.drop) { const d = make('dropper_bottle', { label: R.drop, color: '#eef2f4' }); d.position.set(BX - .25, 0, -.85); extras.push(d); }
    extras.forEach(o => K.add(o));
    reset();
  }
  function reset() {
    S.vA = A0; S.vB = B0; S.nA = 0; S.nB = B0 * .1; S.pours = 0; S.cloud = 0; S.sed = 0; S.made = 0; S.flash = 0; S.busy = 0; S.anim = null;
    A.position.set(AX, 0, 0); A.rotation.set(0, 0, 0); stream.visible = false;
    S.msg = 'Tap a beaker to pour 20 mL from A into B.'; draw();
  }

  // the chemistry: nA = mmol of A's reactant added to B so far, nB = mmol of B's reactant there at the start (all 0.1 M)
  function pH() {
    const acid = S.nB - S.nA, V = S.vB / 1000;
    if (Math.abs(acid) < 1e-9) return 7;
    return acid > 0 ? -Math.log10(acid / 1000 / V) : 14 + Math.log10(-acid / 1000 / V);
  }
  const pinkK = p => THREE.MathUtils.clamp((p - 8.2) / 1.8, 0, 1);        // phenolphthalein: colourless below pH 8.2, pink above, full by 10
  function mixed(dn) {                                                    // dn mmol of A's reactant has just gone into B
    const R = REACTIONS[S.r]; S.nA += dn;
    if (R.kind === 'indicator') {
      const p = pH();
      if (p < 6.99) { S.flash = 1; S.msg = 'Pink flashes where it lands, then fades: there is still acid in B.'; }
      else if (p < 8.2) S.msg = 'Now neutral (pH 7): all the acid has been used up.';
      else S.msg = 'B turns pink and stays pink: there is now more base than acid.';
    } else {
      const form = Math.max(0, Math.min(S.nA, S.nB / R.ratio) - S.made);    // the solid stops forming once B's reactant is used up
      S.made += form; S.cloud += form;
      S.msg = form > 1e-6 ? `A ${R.pcol.toLowerCase()} solid (${R.pname}) forms at once and slowly settles.`
                          : `No more ${R.pname} forms: all the ${R.B.label.toLowerCase()} in B is used up.`;
    }
  }
  function colourB() {
    const R = REACTIONS[S.r];
    if (R.kind === 'indicator') { const k = Math.max(pinkK(pH()), S.flash * .8); return { c: new THREE.Color(CLEAR).lerp(new THREE.Color('#e5318c'), k), a: .35 + .4 * k }; }
    const k = Math.min(1, S.cloud / .5); return { c: new THREE.Color(CLEAR).lerp(new THREE.Color(R.ppt), k), a: .35 + .55 * k };
  }
  function draw() {
    const b = colourB(), R = REACTIONS[S.r];
    KIT.setContents(Bk, { layers: [{ from: 0, to: S.vB / CAP, color: '#' + b.c.getHexString(), alpha: b.a }],
      sediment: R.kind === 'ppt' && S.sed > .01 ? { to: Math.min(.1, S.sed * .025), color: R.ppt } : null }, lib);
    if (!S.anim || S.anim.t < .3) KIT.setContents(A, { layers: [{ from: 0, to: S.vA / CAP, color: CLEAR, alpha: .38 }] }, lib);
  }

  // pouring: A lifts over B, tips, a stream runs for a moment, then A goes back
  const lipL = new THREE.Vector3(), tmp = new THREE.Vector3(), TMAX = 1.3;
  function pour() {
    if (S.anim) return false;
    if (S.vA < 1) { ctx.toast('Beaker A is empty. Tap Reset to start again.'); return false; }
    S.anim = { t: 0, give: Math.min(POUR, S.vA), done: 0 }; ctx.sfx('poke'); return true;
  }
  const ease = x => x * x * (3 - 2 * x);
  function animate(dt) {
    const a = S.anim; if (!a) return; a.t += dt;
    const t = a.t, up = ease(Math.min(1, t / .6)), tip = t < .6 ? up * .4 : t < 1 ? .4 + ease((t - .6) / .4) * (TMAX - .4) : t < 2 ? TMAX : t < 2.4 ? TMAX * (1 - ease((t - 2) / .4)) : 0;
    const back = t > 2.4 ? ease(Math.min(1, (t - 2.4) / .6)) : 0;
    A.rotation.z = -tip;
    lipL.set(LA.rTop, LA.mouth[1], 0).applyAxisAngle(new THREE.Vector3(0, 0, 1), -TMAX);      // the lip when fully tipped
    const over = new THREE.Vector3(BX - .08 - lipL.x, LB.mouth[1] + .22 - lipL.y, 0);          // where A sits so that lip is just over B's mouth
    const k = up * (1 - back);
    A.position.set(AX + (over.x - AX) * k, over.y * k, 0);
    // the stream: while fully tipped, from the lip down to B's surface
    const pouring = t > 1 && t < 2.1;
    if (pouring) {
      const share = Math.min(1, (t - 1) / 1), want = a.give * share, dv = want - a.done;
      if (dv > 0) { a.done = want; S.vA -= dv; S.vB += dv; mixed(dv * .1); }
      A.updateMatrixWorld(true); tmp.set(LA.rTop, LA.mouth[1], 0); A.localToWorld(tmp); K.worldToLocal(tmp);
      const surf = LB.surfaceY != null ? LB.surfaceY : LB.y0;
      stream.position.copy(tmp); stream.scale.set(1, Math.max(.01, tmp.y - surf), 1); stream.visible = true;
    } else stream.visible = false;
    // A's own liquid: level with the world while tipped (the kit cuts the tipped liquid at a world height)
    if (t > .3 && t < 2.6 && S.vA > .5) {
      A.updateMatrixWorld(true);
      const lip = A.localToWorld(tmp.set(LA.rTop, LA.mouth[1], 0)).y;
      KIT.setContents(A, { layers: [{ from: 0, to: 1, color: CLEAR, alpha: .38 }], tilt: lip - .002 * group.scale.y }, lib);
    } else if (t >= 2.6) KIT.setContents(A, { layers: [{ from: 0, to: S.vA / CAP, color: CLEAR, alpha: .38 }] }, lib);
    if (t > 3) { S.anim = null; A.position.set(AX, 0, 0); A.rotation.set(0, 0, 0); S.pours++; draw(); }
  }

  function update(dt) {
    animate(dt);
    const R = REACTIONS[S.r];
    if (S.flash > 0 && !(S.anim && S.anim.t < 2.1)) S.flash = Math.max(0, S.flash - dt * .9);   // the pink fades once the pour stops (the acid wins)
    if (R.kind === 'ppt' && S.cloud > 0) { const d = S.cloud * .1 * dt; S.cloud -= d; S.sed += d; if (S.cloud < .01) { S.sed += S.cloud; S.cloud = 0; } }
    draw();
  }

  // which beaker a world ray points at (a ray passing up to 3 cm beside a beaker still counts: a finger is wide)
  const inv = new THREE.Matrix4(), v0 = new THREE.Vector3(), v1 = new THREE.Vector3();
  function aim(ray) {
    K.updateMatrixWorld(true); inv.copy(K.matrixWorld).invert();
    const r = ray.clone().applyMatrix4(inv); r.direction.normalize();
    let best = null, bd = 1e9;
    for (const [id, o, L] of [['A', A, LA], ['B', Bk, LB]]) {
      v0.set(o.position.x, o.position.y + .05, 0); v1.set(o.position.x, o.position.y + L.mouth[1], 0);
      const d = Math.sqrt(r.distanceSqToSegment(v0, v1)) - L.rTop;
      if (d < .3 && d < bd) { bd = d; best = id; }
    }
    return best;
  }
  const act = () => pour();

  function readout() {
    const R = REACTIONS[S.r], b = colourB(), rows = [
      ['Beaker A', `${R.A.name} · ${Math.round(S.vA)} mL`],
      ['Beaker B', `${R.B.name} · ${Math.round(S.vB)} mL`]];
    if (R.kind === 'indicator') { const p = pH(); rows.push(['B colour', pinkK(p) > .05 ? (pinkK(p) > .6 ? 'Pink' : 'Light pink') : 'Colourless'], ['pH of B', p.toFixed(1)]); }
    else rows.push(['B looks', S.made < 1e-6 ? 'Clear, colourless' : S.cloud > .15 ? `Cloudy ${R.pcol.toLowerCase()}` : `${R.pcol} solid at the bottom`], [R.pname[0].toUpperCase() + R.pname.slice(1), `${(S.made).toFixed(1)} mmol`]);
    return `<div class="rt"><b>Reaction ${S.r + 1} of ${REACTIONS.length}:</b> ${R.name}</div><table>${rows.map(r => `<tr><th>${r[0]}</th><td>${r[1]}</td></tr>`).join('')}</table>` +
      `<div class="rs">${S.msg}</div><div class="rs eq">${R.eq}</div>${R.safe ? `<div class="rs">${R.safe}</div>` : ''}`;
  }

  setup(0);
  return { group, bench: [bench], S, update, readout, aim, act, pour, reset, next: () => setup((S.r + 1) % REACTIONS.length), setReaction: setup };
}
