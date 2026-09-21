// placement.mjs — regenerate docs/PLACEMENT.md from the survey, so the document
// can never drift away from what the scene actually builds.
import { ORIGIN, LANDMARKS, CITE, ENCEINTE, STREETS, WATER, FAIR, GRID } from '../scene/js/survey.js';
import { writeFileSync } from 'node:fs';

const LAT = 111320, LON = 74050;
const toLL = (p) => [ORIGIN.lat - p.z / LAT, ORIGIN.lon + p.x / LON];
const f = (n, d = 5) => n.toFixed(d);
const bearing = (rot) => {
  // rot is a yaw about +Y applied to a mesh whose local +X is the church's
  // liturgical east; convert to a compass bearing
  let deg = (90 - (-rot * 180 / Math.PI)) % 360;
  if (deg < 0) deg += 360;
  return deg.toFixed(0);
};

const SITES = [
  ['Cathédrale Saint-Pierre-et-Saint-Paul (crossing)', LANDMARKS.cathedral.at, LANDMARKS.cathedral.rot, 'place Saint-Pierre', 'A'],
  ['Bishop\'s palace', LANDMARKS.bishopsPalace.at, LANDMARKS.bishopsPalace.rot, 'Cité du Vitrail / anc. palais épiscopal', 'A'],
  ['Canons\' close & tithe cellar', LANDMARKS.canonsClose.at, LANDMARKS.canonsClose.rot, 'nr Cellier Saint-Pierre', 'B'],
  ['Abbaye Saint-Loup', LANDMARKS.saintLoup.at, LANDMARKS.saintLoup.rot, 'Musée des Beaux-Arts et d\'Archéologie', 'A'],
  ['Saint-Nizier', LANDMARKS.saintNizier.at, LANDMARKS.saintNizier.rot, 'place Saint-Nizier', 'A'],
  ['Palais des comtes de Champagne', LANDMARKS.palace.at, LANDMARKS.palace.rot, 'place du Préau', 'A'],
  ['Collégiale Saint-Étienne', LANDMARKS.saintEtienne.at, LANDMARKS.saintEtienne.rot, 'place du Préau', 'A'],
  ['Hôtel-Dieu-le-Comte', LANDMARKS.hotelDieu.at, LANDMARKS.hotelDieu.rot, 'rue de la Cité', 'A'],
  ['Pons Aulae', LANDMARKS.ponsAulae.at, LANDMARKS.ponsAulae.rot, 'over the Moline channel', 'B'],
  ['Saint-Jean-au-Marché', LANDMARKS.saintJean.at, LANDMARKS.saintJean.rot, 'rue Mignard', 'A'],
  ['Notre-Dame-aux-Nonnains', LANDMARKS.nonnains.at, LANDMARKS.nonnains.rot, 'Préfecture de l\'Aube', 'A'],
  ['Cobbler\'s house (site of Saint-Urbain, 1262)', LANDMARKS.cobblerPantaleon.at, LANDMARKS.cobblerPantaleon.rot, 'place Vernier', 'A'],
  ['Saint-Rémy', LANDMARKS.saintRemy.at, LANDMARKS.saintRemy.rot, 'place Saint-Rémy', 'A'],
  ['Saint-Frobert', LANDMARKS.saintFrobert.at, LANDMARKS.saintFrobert.rot, 'rue Saint-Frobert', 'A'],
  ['Sainte-Madeleine', LANDMARKS.sainteMadeleine.at, LANDMARKS.sainteMadeleine.rot, 'rue de la Madeleine', 'A'],
  ['Saint-Pantaléon', LANDMARKS.saintPantaleon.at, LANDMARKS.saintPantaleon.rot, 'rue de Vauluisant', 'A'],
  ['Saint-Nicolas', LANDMARKS.saintNicolas.at, LANDMARKS.saintNicolas.rot, 'rue du Général Saussier', 'A'],
];

let md = `# Placement — the coordinate frame, and how to check it

Generated from \`scene/js/survey.js\` by \`render/placement.mjs\`. Regenerate with:

\`\`\`bash
node render/placement.mjs
\`\`\`

## Frame of reference

| | |
|---|---|
| Origin (0, 0) | the crossing of Troyes cathedral, taken as **${f(ORIGIN.lat)} N, ${f(ORIGIN.lon)} E** |
| +X | true east, metres |
| +Z | true south, metres (north is −Z) |
| +Y | up, metres |
| Latitude scale | 1° = ${LAT.toLocaleString()} m |
| Longitude scale | 1° = ${LON.toLocaleString()} m (at 48.3° N) |
| Roman grid / cathedral axis | ${bearing(GRID.rot)}° — the apse points 5° north of true east |

The latitude and longitude columns below are the **local metric frame converted
back to degrees**, not independent measurements. They are there so the model can
be dropped onto a map and checked. See the limits in
\`HISTORICAL-NOTES.md\` §10 before trusting them: roughly ±20 m on the churches,
±50 m on the wall lines.

**Class**: A = evidenced on that site; B = reasoned; C = invented to type.

## Landmarks

| Building | x (m E) | z (m S) | lat | lon | axis | Modern site | Class |
|---|--:|--:|--:|--:|--:|---|:--:|
`;

for (const [name, at, rot, modern, cls] of SITES) {
  const [la, lo] = toLL(at);
  md += `| ${name} | ${at.x.toFixed(0)} | ${at.z.toFixed(0)} | ${f(la)} | ${f(lo)} | ${bearing(rot)}° | ${modern} | ${cls} |\n`;
}

md += `
## The Cité

The late-antique castrum, c. 380, a square of about 400 m a side, on the Roman
grid. The *decumanus maximus* survives as the **rue de la Cité**, the *cardo
maximus* as the **rue de la Tour / rue Boucherat**.

| | x | z | note |
|---|--:|--:|---|
| Castrum centre | ${CITE.castrum.cx} | ${CITE.castrum.cz} | ${CITE.castrum.w} × ${CITE.castrum.d} m, rotated to the Roman grid |
| Decumanus (rue de la Cité) | — | ${CITE.decumanusZ} | runs east–west just north of the cathedral |
| Cardo (rue de la Tour) | ${CITE.cardoX} | — | runs north–south |

The west curtain is placed so that it falls **between the cathedral and the
comital palace**, because Saint-Étienne is documented as having been built
outside the castrum. That constraint is what fixes the wall; it is good to
perhaps ±50 m and no better.

## Gates

| Gate | x | z | lat | lon | Road to |
|---|--:|--:|--:|--:|---|
`;
for (const g of ENCEINTE.gates) {
  const [la, lo] = toLL(g.at);
  md += `| ${g.name} | ${g.at.x} | ${g.at.z} | ${f(la)} | ${f(lo)} | ${g.road} |\n`;
}

md += `
Gate positions are **indicative**. The names are attested Troyes gate names, but
not all of them are securely attested for 1250 in these positions.

## Water

The Seine is split south of the town into four channels from the second half of
the 12th century. Courses are reasoned, not surveyed — the Canal de la
Haute-Seine has overwritten the central one.

| Channel | width (m) | mills | first attested |
|---|--:|--:|---|
`;
for (const ch of WATER.channels) {
  const dates = {
    'canal de la Moline (Planche-Clement)': '1134',
    'canal des Trevois': 'attributed to Henri le Libéral (1152–81)',
    'canal de Jaillard': 'its mill attested 1152',
  };
  md += `| ${ch.name} | ${ch.w} | ${ch.mills} | ${dates[ch.name] || '—'} |\n`;
}

md += `
## Streets

Names marked **(M)** are attested medieval names the street still carries today.
The rest are ordinary topographic names of the quarter and are reasoned, not
documented in that form for 1250.

| Street | character | width (m) |
|---|---|--:|
`;
for (const s of STREETS) md += `| ${s.name} | ${s.tag} | ${s.w} |\n`;

md += `
## The fair pitches

Specialised by street and square, as the sources describe. Individual stalls are
invented to type.

| Pitch | x | z | extent (m) |
|---|--:|--:|---|
`;
for (const p of FAIR.fields) {
  md += `| ${p.name} | ${p.at.x.toFixed(0)} | ${p.at.z.toFixed(0)} | ${p.w} × ${p.d} |\n`;
}

md += `
## Checking this against a modern map

1. Open a map of Troyes and find **place Saint-Pierre**, in front of the
   cathedral. The crossing, a little east of it, is the origin.
2. The cathedral's apse should point **east, about 5° north of true east**, with
   the west front toward place Saint-Pierre.
3. Walk west along the **rue de la Cité** — the Roman decumanus — to the canal.
   The **Hôtel-Dieu-le-Comte** is on the left before the water, and **place du
   Préau**, where the comital palace and Saint-Étienne stood, is just beyond it.
4. Cross the canal into the Bourg. **Saint-Jean-au-Marché** is about 300 m
   west-south-west; **rue Champeaux** runs west from beside it, with the
   **ruelle des Chats** off its south side.
5. **Sainte-Madeleine** is about 230 m further west again, **Saint-Pantaléon**
   about 190 m south of Sainte-Madeleine, and **Saint-Nicolas** in the
   south-west corner of the old town.
6. The **Préfecture de l'Aube** is Notre-Dame-aux-Nonnains; the **Musée des
   Beaux-Arts** is the abbey of Saint-Loup; the **Basilique Saint-Urbain**
   stands where the cobbler's house is in this render.

If those relationships hold on the map, the reconstruction's arrangement is
right, whatever the residual error on the absolute coordinates.
`;

writeFileSync(new URL('../docs/PLACEMENT.md', import.meta.url), md);
console.log('wrote docs/PLACEMENT.md');
