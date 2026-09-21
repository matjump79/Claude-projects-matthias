// Captions. Deliberately sparse: each one states something that is actually
// visible in the shot it sits under, and every claim is one the notes in
// docs/HISTORICAL-NOTES.md sources.
export const CUES = [
  // Each cue sits where the thing it names is actually on screen: the timings
  // were checked against the rendered film, not against the camera script.
  { t0: 1.0, t1: 9.0, kind: 'title', title: 'U L M', sub: 'an der Donau &nbsp;·&nbsp; Anno Domini 1500', note: 'A flight over the Free Imperial City' },
  { t0: 12, t1: 21, text: 'A Free Imperial City <i>(Reichsstadt)</i> — subject to the Emperor alone, and to no lord in between. Ten to fifteen thousand people inside the walls.' },
  { t0: 24, t1: 32, text: 'The Danube. From Ulm the river is navigable: cloth, iron and salt go downstream towards Vienna and Hungary.' },
  { t0: 35, t1: 43, text: 'The Herdbrucke — the only bridge, and the road out to Bavaria.' },
  { t0: 45, t1: 53, text: 'The Metzgerturm, the butchers’ tower of about 1340 — already out of plumb, and leaning still.' },
  { t0: 55, t1: 64, text: 'In 1480 the wall was driven down to the water itself. Iron rings set in the brick moored the boats.' },
  { t0: 67, t1: 76, text: 'The Blau, coming out of the Alb. Fishermen, tanners, dyers and millers crowd both its arms.' },
  { t0: 82, t1: 91, text: 'The Minster of Our Lady. Begun 1377 — built and paid for by the townspeople themselves, not by a bishop. It is a parish church.' },
  { t0: 93, t1: 104, text: 'In 1492 stones fell from the tower vault during a sermon. Work stopped. The square was closed in 1494 at about 70 metres; the octagon above it broke off after five metres and was roofed over provisionally.' },
  { t0: 106, t1: 114, text: 'That makeshift roof will stay for four centuries. The spire is finished only in 1890.' },
  { t0: 117, t1: 125, text: 'The choir towers are stumps too. Master mason Burkhard Engelberg is about to rebuild the aisles — from 1502 the three naves become five.' },
  { t0: 128, t1: 138, text: 'The town hall: a merchants’ hall of 1370, the council’s seat since 1419. No painted façade yet, and no astronomical clock — those come after 1520.' },
  { t0: 145, t1: 154, text: 'Beyond the ditch, the city’s own countryside: strip fields <i>(Gewanne)</i> in the three-field rotation — winter corn, spring corn, fallow.' },
  { t0: 158, t1: 168, text: 'Ulm stands at its height: after Nuremberg, the largest territory of any imperial city in the Empire.' },
  { t0: 184, t1: 195, text: 'White on the meadows by the water: fustian <i>(Barchent)</i>, linen warp and cotton weft, laid out to bleach. Some 60,000 pieces a year — the wealth behind the stone.' },
  { t0: 204, t1: 212, kind: 'end', title: 'Ulm, 1500', sub: 'Within a lifetime: the Reformation, and the shift of trade to the Atlantic.<br>This is the summit.', note: 'Reconstructed from documented building history and topography — conjectural in detail. See the accompanying notes.' },
];

export function makeOverlay(doc) {
  const root = doc.createElement('div');
  root.id = 'overlay';
  root.innerHTML = `
    <div class="vignette"></div>
    <div id="capbg" class="capbg"></div>
    <div id="cap" class="cap"></div>
    <div id="card" class="card">
      <div class="ctitle"></div><div class="csub"></div><div class="cnote"></div>
    </div>`;
  doc.body.appendChild(root);
  const cap = root.querySelector('#cap');
  const capbg = root.querySelector('#capbg');
  const card = root.querySelector('#card');
  const ct = card.querySelector('.ctitle'), cs = card.querySelector('.csub'), cn = card.querySelector('.cnote');

  return function update(t) {
    let capText = '', capA = 0, cardA = 0, cardData = null;
    for (const c of CUES) {
      if (t < c.t0 - 1.2 || t > c.t1 + 1.2) continue;
      const fade = Math.min(
        Math.max(0, (t - (c.t0 - 1.2)) / 1.2),
        Math.max(0, ((c.t1 + 1.2) - t) / 1.2),
        1,
      );
      if (c.kind === 'title' || c.kind === 'end') { cardA = Math.max(cardA, fade); cardData = c; }
      else if (fade > capA) { capA = fade; capText = c.text; }
    }
    if (capText) cap.innerHTML = capText;
    cap.style.opacity = capA.toFixed(3);
    capbg.style.opacity = (capA * 0.9).toFixed(3);
    if (cardData) {
      ct.innerHTML = cardData.title;
      cs.innerHTML = cardData.sub || '';
      cn.innerHTML = cardData.note || '';
      card.classList.toggle('end', cardData.kind === 'end');
    }
    card.style.opacity = cardA.toFixed(3);
  };
}
