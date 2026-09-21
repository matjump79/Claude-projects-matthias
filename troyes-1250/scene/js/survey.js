// survey.js — the georeferenced skeleton of Troyes, July 1250.
//
// Everything else in this scene reads its position from this file. Nothing is
// placed "by eye": each landmark below is pinned to a metric coordinate derived
// from the modern site it occupies, so that the reconstruction can be laid over
// a modern map of Troyes and checked.
//
// FRAME OF REFERENCE
//   Origin (0,0) .... the crossing of Troyes cathedral (Saint-Pierre-et-Saint-Paul),
//                     taken as 48.29880 N, 4.08175 E.
//   +X .............. true east, metres
//   +Z .............. true south, metres        (so north is -Z)
//   +Y .............. up, metres
//   Conversion used:  1 deg latitude  = 111_320 m
//                     1 deg longitude =  74_050 m   (at 48.3 N)
//
// THE ROMAN GRID
//   Augustobona's decumanus maximus survives as the rue de la Cite (east-west)
//   and its cardo maximus as the rue de la Tour / rue Boucherat (north-south).
//   The late-antique castrum of c. 380 was a square of roughly 400 m a side.
//   The cathedral sits square on that grid, so the grid angle and the cathedral
//   axis are the same number: GRID_BEARING below.
//
// CONFIDENCE
//   Church and abbey positions: good (each occupies a site still identifiable).
//   Wall and gate lines: approximate, +/- 50 m. The 1250 circuit is not the
//   circuit the 19th-century boulevards replaced; see docs/HISTORICAL-NOTES.md.

export const ORIGIN = { lat: 48.29880, lon: 4.08175, name: 'Troyes cathedral crossing' };
const M_PER_DEG_LAT = 111320;
const M_PER_DEG_LON = 74050;

/** Convert WGS84 degrees to the local metric frame. */
export function ll(lat, lon) {
  return {
    x: (lon - ORIGIN.lon) * M_PER_DEG_LON,
    z: -(lat - ORIGIN.lat) * M_PER_DEG_LAT,
  };
}

// The cathedral's liturgical east is 5 degrees north of true east. Gothic
// churches are rarely oriented exactly; 85 deg is the value adopted here for
// the cathedral and, with it, for the whole Roman grid of the Cite.
export const GRID_BEARING = 85 * Math.PI / 180;      // from +X, counter-clockwise
export const GRID = {
  // unit vector along the Roman decumanus, pointing (liturgical) east
  ex: Math.cos(-5 * Math.PI / 180),
  ez: Math.sin(-5 * Math.PI / 180),
  rot: -5 * Math.PI / 180,                            // yaw to apply to grid-aligned meshes
};

/** Point at (along, across) metres from p, in the Roman grid's frame. */
export function onGrid(p, along, across) {
  const c = Math.cos(GRID.rot), s = Math.sin(GRID.rot);
  return { x: p.x + along * c - across * s, z: p.z + along * s + across * c };
}

// ---------------------------------------------------------------------------
// THE CITE  ("tete du bouchon" - the head of the champagne cork)
// The Gallo-Roman core, still the bishop's and the count's quarter in 1250.
// ---------------------------------------------------------------------------

export const CITE = {
  // Late-antique castrum: a square of c. 400 m, centred on the crossing of the
  // decumanus (rue de la Cite) and the cardo (rue de la Tour / rue Boucherat).
  // Placed so that its west curtain falls between the cathedral and the comital
  // palace, because Saint-Etienne is documented as built OUTSIDE the castrum.
  castrum: { cx: 80, cz: -50, w: 400, d: 400, rot: GRID.rot },
  decumanusZ: -50,          // rue de la Cite runs east-west just north of the cathedral
  cardoX: 80,               // rue de la Tour / rue Boucherat
};

export const LANDMARKS = {

  // --- the cathedral, a building site in 1250 -----------------------------
  // Choir begun c. 1200 under Bp Garnier de Trainel; radiating chapels of the
  // ambulatory first; upper walls thrown down by the cyclone of Nov 1228 and
  // rebuilt 1235-40 with a glazed triforium. Transept not vaulted until c.1310,
  // nave 14th-15th c. So: a finished, brand-new chevet, a transept in build,
  // and the patched older nave still in use to the west.
  cathedral: {
    at: { x: 0, z: 0 },                 // the crossing
    rot: GRID.rot,
    // Gothic proportions are narrow and very tall: the central vessel at Troyes
    // is about 13.5 m across between the piers and 29.5 m to the crown of the
    // vault. It is the AISLES that take the building out to some 30 m overall.
    chevetLength: 50,                   // crossing to the outer wall of the apse
    choirWidth: 13.5,                   // the central vessel alone
    aisleWidth: 8.4,                    // each aisle, either side
    transeptReach: 23,                  // each arm, from the crossing
    transeptWidth: 13.5,
    naveLength: 54,                     // the surviving older nave, west of the crossing
    naveWidth: 13,
    vaultHeight: 29.5,                  // the new choir
    naveHeight: 16,                     // the old nave: lower, Romanesque
    aisleHeight: 14,
  },

  // The bishop's palace on the south flank of the cathedral (the site of today's
  // Cite du Vitrail / former palais episcopal).
  bishopsPalace: { at: { x: 40, z: 76 }, rot: GRID.rot, w: 46, d: 20, h: 12 },

  // The canons' close, north-west of the choir. The cathedral chapter's tithe
  // cellar stands here: the surviving Cellier Saint-Pierre, whose roof is
  // dendro-dated to c.1256 - six years AFTER this view. Its predecessor is
  // modelled in its place.
  canonsClose: { at: { x: -38, z: -52 }, rot: GRID.rot, w: 62, d: 38 },

  // Benedictine abbey of Saint-Loup, south-east of the cathedral; the site is
  // today's Musee des Beaux-Arts et d'Archeologie.
  saintLoup: { at: { x: 82, z: 118 }, rot: GRID.rot, church: { l: 52, w: 11.5, h: 17 }, cloister: 34 },

  // Saint-Nizier, on the site of a late-Roman oratory, north of the cathedral.
  saintNizier: { at: { x: -58, z: -178 }, rot: GRID.rot, l: 34, w: 9.5, h: 13, tower: 21 },

  // --- the comital complex, on the Cite/Bourg boundary ---------------------
  // Henri I "le Liberal" built palace, chapel, collegiate church and hospital
  // as one architectural programme from 1157, on and around what is now the
  // place du Preau. The palace (the Aula) had two storeys and its own bridge,
  // the Pons Aulae, over the channel.
  palace: { at: { x: -214, z: -12 }, rot: GRID.rot, w: 52, d: 19, h: 15 },
  saintEtienne: {
    at: { x: -232, z: 46 }, rot: GRID.rot,
    length: 72,                         // documented maximum length, outside measure
    width: 12, h: 19, towerH: 34,
  },
  hotelDieu: { at: { x: -164, z: -34 }, rot: GRID.rot, w: 54, d: 22, h: 11 },
  ponsAulae: { at: { x: -292, z: 16 }, rot: GRID.rot, span: 34 },

  // ---------------------------------------------------------------------------
  // THE BOURG  ("corps du bouchon" - the body of the cork)
  // The merchants' town west of the water, rebuilt after the fire of 23 July 1188
  // which burned during the fair itself. In 1250 this fabric is barely 50 years old.
  // ---------------------------------------------------------------------------

  // Saint-Jean-au-Marche: the parish on whose ground the fairs were held, its
  // walls hung with logettes "the size of half a stained-glass window" let to
  // merchants. Site: between today's rue Mignard and the Hotel de Ville.
  saintJean: {
    at: ll(48.29740, 4.07520), rot: -8 * Math.PI / 180,
    l: 44, w: 11.5, h: 15, tower: 27,   // tower at the south-west corner
  },

  // Notre-Dame-aux-Nonnains, the great Benedictine nunnery, burnt in 1188 and
  // rebuilt. Its abbess outranked the town. Site: today's Prefecture de l'Aube.
  nonnains: {
    at: ll(48.29600, 4.07780), rot: -6 * Math.PI / 180,
    church: { l: 58, w: 13, h: 18 }, cloister: 42, precinct: 120,
  },

  // The house of a Troyes cobbler, whose son Jacques Pantaleon is in 1250 a papal
  // chaplain abroad. In 1261 he becomes Urban IV; in 1262 he pulls this house down
  // and builds Saint-Urbain on the spot. In 1250 it is simply a shop in a street.
  cobblerPantaleon: { at: ll(48.29670, 4.07780), rot: -12 * Math.PI / 180 },

  saintRemy:      { at: ll(48.29790, 4.07440), rot: -4 * Math.PI / 180, l: 36, w: 10, h: 14, tower: 24 },
  saintFrobert:   { at: ll(48.29840, 4.07330), rot: -10 * Math.PI / 180, l: 26, w: 8, h: 11, tower: 16 },
  sainteMadeleine:{ at: ll(48.29800, 4.07220), rot: -7 * Math.PI / 180, l: 38, w: 10, h: 15, tower: 20 },
  saintPantaleon: { at: ll(48.29630, 4.07220), rot: -9 * Math.PI / 180, l: 30, w: 9, h: 12, tower: 17 },
  saintNicolas:   { at: ll(48.29460, 4.07140), rot: -5 * Math.PI / 180, l: 28, w: 8.5, h: 11, tower: 15 },
};

// ---------------------------------------------------------------------------
// STREETS
// Names marked (M) are attested medieval names still carried by the street today.
// The rest are the ordinary topographic names of the quarter.
// Each entry: name, polyline of points, width in metres, and a character tag
// that drives what kind of house is built along it.
// ---------------------------------------------------------------------------

const P = (lat, lon) => ll(lat, lon);

export const STREETS = [
  // --- the Cite -----------------------------------------------------------
  { name: 'rue de la Cite',              tag: 'cite',   w: 7.5, pts: [P(48.29925, 4.07640), P(48.29925, 4.08300), P(48.29930, 4.08560)] },
  { name: 'rue de la Tour',              tag: 'cite',   w: 5.5, pts: [P(48.30100, 4.08060), P(48.29925, 4.08050)] },
  { name: 'rue Boucherat',               tag: 'cite',   w: 5.5, pts: [P(48.29925, 4.08050), P(48.29760, 4.08040)] },
  { name: 'rue du Cloitre Saint-Pierre', tag: 'close',  w: 5.0, pts: [P(48.29900, 4.08100), P(48.29900, 4.08260)] },
  { name: 'rue Saint-Loup',              tag: 'close',  w: 5.0, pts: [P(48.29870, 4.08230), P(48.29800, 4.08250)] },

  // --- the crossing to the Bourg ------------------------------------------
  { name: 'pont de l\'Aula',             tag: 'bridge', w: 8.0, pts: [P(48.29885, 4.07940), P(48.29885, 4.07700)] },

  // --- the fair quarter ----------------------------------------------------
  { name: 'rue Champeaux (M)',           tag: 'fair',   w: 6.0, pts: [P(48.29765, 4.07480), P(48.29770, 4.07380), P(48.29775, 4.07290)] },
  { name: 'ruelle des Chats (M)',        tag: 'alley',  w: 2.2, pts: [P(48.29775, 4.07360), P(48.29742, 4.07356)] },
  { name: 'rue de la Montee des Changes (M)', tag: 'money', w: 5.0, pts: [P(48.29735, 4.07560), P(48.29700, 4.07615)] },
  { name: 'rue de la Pierre (M)',        tag: 'fair',   w: 5.0, pts: [P(48.29725, 4.07470), P(48.29660, 4.07455)] },
  { name: 'rue des Anciennes Tanneries (M)', tag: 'tanners', w: 5.0, pts: [P(48.29680, 4.07330), P(48.29625, 4.07300)] },
  { name: 'rue du Paon',                 tag: 'juiverie', w: 4.0, pts: [P(48.29845, 4.07360), P(48.29830, 4.07290)] },
  { name: 'rue Hennequin',               tag: 'juiverie', w: 4.5, pts: [P(48.29860, 4.07350), P(48.29815, 4.07345)] },

  // --- the main axes of the Bourg -----------------------------------------
  { name: 'grand rue du Bourg',          tag: 'main',   w: 8.0, pts: [P(48.29860, 4.07650), P(48.29800, 4.07450), P(48.29800, 4.07230), P(48.29790, 4.06980)] },
  { name: 'rue de la Madeleine',         tag: 'burgess',w: 6.0, pts: [P(48.29800, 4.07230), P(48.29840, 4.07160)] },
  { name: 'rue Saint-Pantaleon',         tag: 'burgess',w: 5.5, pts: [P(48.29760, 4.07230), P(48.29620, 4.07215)] },
  { name: 'rue de Croncels',             tag: 'main',   w: 7.0, pts: [P(48.29700, 4.07420), P(48.29520, 4.07330), P(48.29420, 4.07290)] },
  { name: 'rue Saint-Nicolas',           tag: 'poor',   w: 5.0, pts: [P(48.29560, 4.07200), P(48.29440, 4.07140)] },
  { name: 'rue du Marche au Ble',        tag: 'fair',   w: 9.0, pts: [P(48.29720, 4.07570), P(48.29715, 4.07690)] },
  { name: 'rue des Quinze-Vingts',       tag: 'burgess',w: 5.0, pts: [P(48.29880, 4.07520), P(48.29880, 4.07330)] },
  { name: 'rue de la Trinite',           tag: 'poor',   w: 4.5, pts: [P(48.29640, 4.07540), P(48.29560, 4.07480)] },
];

// ---------------------------------------------------------------------------
// WATER
// The Seine arrives from the south-east and is split, from the second half of
// the 12th century, into four channels - canal des Trevois, Ru Corde, canal de
// la Moline (or Planche-Clement) and the Pielle - dug to drain the marsh, drive
// mills, and flood the ditches. The Moline is mentioned in 1134; the Trevois is
// attributed to Henri le Liberal. Downstream of the town the Planche-Clement
// divides again into the Meldancon, running north, and the canal de Jaillard,
// which drives the Jaillard mill, attested in 1152.
// ---------------------------------------------------------------------------

export const WATER = {
  seineIn: [{ x: 120, z: 1250 }, { x: -20, z: 980 }, { x: -110, z: 820 }],
  split:   { x: -150, z: 760 },

  channels: [
    { name: 'canal des Trevois', w: 15, mills: 1,
      pts: [{ x: -150, z: 760 }, { x: -420, z: 690 }, { x: -760, z: 655 }, { x: -1080, z: 630 }, { x: -1290, z: 560 }, { x: -1420, z: 420 }] },

    { name: 'Ru Corde', w: 9, mills: 2,
      pts: [{ x: -150, z: 760 }, { x: -380, z: 610 }, { x: -560, z: 470 }, { x: -700, z: 330 }, { x: -860, z: 200 }, { x: -1010, z: 60 }, { x: -1160, z: -70 }] },

    { name: 'canal de la Moline (Planche-Clement)', w: 22, mills: 3,
      pts: [{ x: -150, z: 760 }, { x: -240, z: 560 }, { x: -286, z: 330 }, { x: -292, z: 90 }, { x: -288, z: -140 }, { x: -262, z: -330 }, { x: -190, z: -470 }] },

    { name: 'la Pielle', w: 13, mills: 1,
      pts: [{ x: -150, z: 760 }, { x: 60, z: 700 }, { x: 250, z: 590 }, { x: 350, z: 380 }, { x: 372, z: 120 }, { x: 350, z: -150 }, { x: 260, z: -330 }] },

    { name: 'le Meldancon', w: 11, mills: 0,
      pts: [{ x: -190, z: -470 }, { x: -230, z: -640 }, { x: -320, z: -830 }] },

    { name: 'canal de Jaillard', w: 9, mills: 1,
      pts: [{ x: -190, z: -470 }, { x: -40, z: -520 }, { x: 140, z: -500 }, { x: 270, z: -430 }] },
  ],

  // the arms come back together north-west of the town and run on as the Seine
  seineOut: [{ x: -320, z: -830 }, { x: -520, z: -960 }, { x: -820, z: -1080 }, { x: -1200, z: -1160 }],
};

// ---------------------------------------------------------------------------
// THE CIRCUIT
// In 1250 the ramparts are NOT yet the full "champagne cork". The counts have
// walled the Bourg and the Cite; the circuit reaches its greatest extent only at
// the end of the 13th century. What is drawn here is the mid-century line:
// the castrum curtain around the Cite, and a comital wall with a wet ditch
// around the Bourg. Treat as +/- 50 m.
// ---------------------------------------------------------------------------

export const ENCEINTE = {
  bourg: [
    { x: -338, z: -252 }, { x: -520, z: -284 }, { x: -760, z: -292 }, { x: -960, z: -264 },
    { x: -1090, z: -182 }, { x: -1152, z: -30 }, { x: -1164, z: 160 }, { x: -1142, z: 360 },
    { x: -1062, z: 502 }, { x: -900, z: 580 }, { x: -700, z: 602 }, { x: -500, z: 590 },
    { x: -372, z: 540 }, { x: -336, z: 420 }, { x: -330, z: 200 }, { x: -334, z: -20 },
  ],
  bourgTowerEvery: 62,
  wallH: 8.5,
  towerH: 12.5,

  gates: [
    { name: 'porte de la Madeleine', at: { x: -1155, z: 60 },  road: 'Paris',            out: { x: -1500, z: 30 } },
    { name: 'porte de Croncels',     at: { x: -840, z: 592 },  road: 'Sens et Lyon',     out: { x: -900, z: 940 } },
    { name: 'porte Saint-Jacques',   at: { x: -1122, z: 340 }, road: 'Saint-Jacques',    out: { x: -1440, z: 470 } },
    { name: 'porte de Preize',       at: { x: -700, z: -290 }, road: 'Chalons, Flandre', out: { x: -720, z: -640 } },
    { name: 'porte de Chaillouet',   at: { x: -430, z: -276 }, road: 'nord',             out: { x: -430, z: -560 } },
    { name: 'porte Comtale',         at: { x: -332, z: 16 },   road: 'la Cite',          out: { x: -250, z: 16 } },
    { name: 'porte de la Girouarde', at: { x: 280, z: 40 },    road: 'Bar-sur-Aube',     out: { x: 640, z: 120 } },
  ],
};

// The fairground: the Hot Fair of Saint-Jean opened on 24 June and the stalls
// stood in the streets and squares around Saint-Jean-au-Marche, each pitch
// specialised - drapery, mercery, old clothes, poultry, spices, salt - with the
// money-changers' benches up the Montee des Changes.
export const FAIR = {
  centre: LANDMARKS.saintJean.at,
  fields: [
    { name: 'la draperie',        at: ll(48.29755, 4.07545), w: 70, d: 46, kind: 'cloth' },
    { name: 'la mercerie',        at: ll(48.29720, 4.07520), w: 52, d: 40, kind: 'mercery' },
    { name: 'le marche au ble',   at: ll(48.29718, 4.07640), w: 60, d: 44, kind: 'grain' },
    { name: 'la friperie',        at: ll(48.29778, 4.07430), w: 44, d: 30, kind: 'clothes' },
    { name: 'la poulaillerie',    at: ll(48.29795, 4.07500), w: 34, d: 26, kind: 'poultry' },
    { name: 'les changes',        at: ll(48.29715, 4.07600), w: 30, d: 22, kind: 'money' },
    { name: 'le marche au sel',   at: ll(48.29690, 4.07480), w: 36, d: 26, kind: 'salt' },
    { name: 'les pelleteries',    at: ll(48.29800, 4.07560), w: 38, d: 28, kind: 'furs' },
  ],
};
