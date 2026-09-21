# Placement — the coordinate frame, and how to check it

Generated from `scene/js/survey.js` by `render/placement.mjs`. Regenerate with:

```bash
node render/placement.mjs
```

## Frame of reference

| | |
|---|---|
| Origin (0, 0) | the crossing of Troyes cathedral, taken as **48.29880 N, 4.08175 E** |
| +X | true east, metres |
| +Z | true south, metres (north is −Z) |
| +Y | up, metres |
| Latitude scale | 1° = 111,320 m |
| Longitude scale | 1° = 74,050 m (at 48.3° N) |
| Roman grid / cathedral axis | 85° — the apse points 5° north of true east |

The latitude and longitude columns below are the **local metric frame converted
back to degrees**, not independent measurements. They are there so the model can
be dropped onto a map and checked. See the limits in
`HISTORICAL-NOTES.md` §10 before trusting them: roughly ±20 m on the churches,
±50 m on the wall lines.

**Class**: A = evidenced on that site; B = reasoned; C = invented to type.

## Landmarks

| Building | x (m E) | z (m S) | lat | lon | axis | Modern site | Class |
|---|--:|--:|--:|--:|--:|---|:--:|
| Cathédrale Saint-Pierre-et-Saint-Paul (crossing) | 0 | 0 | 48.29880 | 4.08175 | 85° | place Saint-Pierre | A |
| Bishop's palace | 40 | 76 | 48.29812 | 4.08229 | 85° | Cité du Vitrail / anc. palais épiscopal | A |
| Canons' close & tithe cellar | -38 | -52 | 48.29927 | 4.08124 | 85° | nr Cellier Saint-Pierre | B |
| Abbaye Saint-Loup | 82 | 118 | 48.29774 | 4.08286 | 85° | Musée des Beaux-Arts et d'Archéologie | A |
| Saint-Nizier | -58 | -178 | 48.30040 | 4.08097 | 85° | place Saint-Nizier | A |
| Palais des comtes de Champagne | -214 | -12 | 48.29891 | 4.07886 | 85° | place du Préau | A |
| Collégiale Saint-Étienne | -232 | 46 | 48.29839 | 4.07862 | 85° | place du Préau | A |
| Hôtel-Dieu-le-Comte | -164 | -34 | 48.29911 | 4.07954 | 85° | rue de la Cité | A |
| Pons Aulae | -292 | 16 | 48.29866 | 4.07781 | 85° | over the Moline channel | B |
| Saint-Jean-au-Marché | -485 | 156 | 48.29740 | 4.07520 | 82° | rue Mignard | A |
| Notre-Dame-aux-Nonnains | -292 | 312 | 48.29600 | 4.07780 | 84° | Préfecture de l'Aube | A |
| Cobbler's house (site of Saint-Urbain, 1262) | -292 | 234 | 48.29670 | 4.07780 | 78° | place Vernier | A |
| Saint-Rémy | -544 | 100 | 48.29790 | 4.07440 | 86° | place Saint-Rémy | A |
| Saint-Frobert | -626 | 45 | 48.29840 | 4.07330 | 80° | rue Saint-Frobert | A |
| Sainte-Madeleine | -707 | 89 | 48.29800 | 4.07220 | 83° | rue de la Madeleine | A |
| Saint-Pantaléon | -707 | 278 | 48.29630 | 4.07220 | 81° | rue de Vauluisant | A |
| Saint-Nicolas | -766 | 468 | 48.29460 | 4.07140 | 85° | rue du Général Saussier | A |

## The Cité

The late-antique castrum, c. 380, a square of about 400 m a side, on the Roman
grid. The *decumanus maximus* survives as the **rue de la Cité**, the *cardo
maximus* as the **rue de la Tour / rue Boucherat**.

| | x | z | note |
|---|--:|--:|---|
| Castrum centre | 80 | -50 | 400 × 400 m, rotated to the Roman grid |
| Decumanus (rue de la Cité) | — | -50 | runs east–west just north of the cathedral |
| Cardo (rue de la Tour) | 80 | — | runs north–south |

The west curtain is placed so that it falls **between the cathedral and the
comital palace**, because Saint-Étienne is documented as having been built
outside the castrum. That constraint is what fixes the wall; it is good to
perhaps ±50 m and no better.

## Gates

| Gate | x | z | lat | lon | Road to |
|---|--:|--:|--:|--:|---|
| porte de la Madeleine | -1155 | 60 | 48.29826 | 4.06615 | Paris |
| porte de Croncels | -840 | 592 | 48.29348 | 4.07041 | Sens et Lyon |
| porte Saint-Jacques | -1122 | 340 | 48.29575 | 4.06660 | Saint-Jacques |
| porte de Preize | -700 | -290 | 48.30141 | 4.07230 | Chalons, Flandre |
| porte de Chaillouet | -430 | -276 | 48.30128 | 4.07594 | nord |
| porte Comtale | -332 | 16 | 48.29866 | 4.07727 | la Cite |
| porte de la Girouarde | 280 | 40 | 48.29844 | 4.08553 | Bar-sur-Aube |

Gate positions are **indicative**. The names are attested Troyes gate names, but
not all of them are securely attested for 1250 in these positions.

## Water

The Seine is split south of the town into four channels from the second half of
the 12th century. Courses are reasoned, not surveyed — the Canal de la
Haute-Seine has overwritten the central one.

| Channel | width (m) | mills | first attested |
|---|--:|--:|---|
| canal des Trevois | 15 | 1 | attributed to Henri le Libéral (1152–81) |
| Ru Corde | 9 | 2 | — |
| canal de la Moline (Planche-Clement) | 22 | 3 | 1134 |
| la Pielle | 13 | 1 | — |
| le Meldancon | 11 | 0 | — |
| canal de Jaillard | 9 | 1 | its mill attested 1152 |

## Streets

Names marked **(M)** are attested medieval names the street still carries today.
The rest are ordinary topographic names of the quarter and are reasoned, not
documented in that form for 1250.

| Street | character | width (m) |
|---|---|--:|
| rue de la Cite | cite | 7.5 |
| rue de la Tour | cite | 5.5 |
| rue Boucherat | cite | 5.5 |
| rue du Cloitre Saint-Pierre | close | 5 |
| rue Saint-Loup | close | 5 |
| pont de l'Aula | bridge | 8 |
| rue Champeaux (M) | fair | 6 |
| ruelle des Chats (M) | alley | 2.2 |
| rue de la Montee des Changes (M) | money | 5 |
| rue de la Pierre (M) | fair | 5 |
| rue des Anciennes Tanneries (M) | tanners | 5 |
| rue du Paon | juiverie | 4 |
| rue Hennequin | juiverie | 4.5 |
| grand rue du Bourg | main | 8 |
| rue de la Madeleine | burgess | 6 |
| rue Saint-Pantaleon | burgess | 5.5 |
| rue de Croncels | main | 7 |
| rue Saint-Nicolas | poor | 5 |
| rue du Marche au Ble | fair | 9 |
| rue des Quinze-Vingts | burgess | 5 |
| rue de la Trinite | poor | 4.5 |

## The fair pitches

Specialised by street and square, as the sources describe. Individual stalls are
invented to type.

| Pitch | x | z | extent (m) |
|---|--:|--:|---|
| la draperie | -467 | 139 | 70 × 46 |
| la mercerie | -485 | 178 | 52 × 40 |
| le marche au ble | -396 | 180 | 60 × 44 |
| la friperie | -552 | 114 | 44 × 30 |
| la poulaillerie | -500 | 95 | 34 × 26 |
| les changes | -426 | 184 | 30 × 22 |
| le marche au sel | -515 | 212 | 36 × 26 |
| les pelleteries | -455 | 89 | 38 × 28 |

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
