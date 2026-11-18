// mat.js - the printed ZetaQ lab mat: an A4 sheet (landscape) with 6 square markers. Shared by the print page and the camera tracking.
// Paper coordinates are mm from the top-left corner. The child sits at the bottom edge. World (cm): x right, y up, z toward the child,
// origin at the centre of the sheet.
export const PAGE = { w: 297, h: 210 };
export const MARK = 36;                                                 // the black square of each marker, mm (its white margin is extra)
// marker id -> top-left corner of its black square (mm). Corners and the middle of the long edges, so a hand never hides them all.
export const MARKERS = { 1: [14, 14], 2: [247, 14], 3: [247, 160], 4: [14, 160], 5: [130.5, 14], 6: [130.5, 160] };
export const DICT = 'ARUCO_MIP_36h12';

export const toWorld = (X, Y) => [(X - PAGE.w / 2) / 10, (Y - PAGE.h / 2) / 10];   // paper mm -> world x, z (cm)

// the 4 corners of each marker's black square, world x, z, in the order the detector reports them (top-left, clockwise)
export function markerCorners(id) {
  const p = MARKERS[id]; if (!p) return null; const [x, y] = p, s = MARK;
  return [[x, y], [x + s, y], [x + s, y + s], [x, y + s]].map(q => toWorld(q[0], q[1]));
}

// where each piece of equipment stands (world cm, x, z), for both the mat and the 3D bench. The child sits at +z.
export const LAYOUT = {
  acid: [-14, -4.5], jar: [-14, 3.5], spatula: [-9.5, 10.5], beaker: [-5.5, 5], tripod: [1.5, -4], rod: [-4, 11.8],
  stand: [13, -3], rack: [5.5, 7], ammonia: [13.5, 7.5]
};
