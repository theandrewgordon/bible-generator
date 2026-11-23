/* =====================================================================
 * LEVEL 2-5: JOSEPH'S STOREHOUSES  (Genesis 41)
 * ---------------------------------------------------------------------
 * Egypt, north (z 42) to south (z -42):
 *   The fields      (z 40..14)  seven good years: grain sacks to gather
 *   Canal 1         (z 10)      a stone bridge, or a broken bridge the Builder can fix
 *   Canal 2         (z -8)      ride the slow barge, or walk round by the far bridge
 *   The storehouses (z -24..-34) three granaries: match each sack's colour to its storehouse
 * Then the famine: carry bread from the storehouses to hungry travellers from far away.
 * Tasks: store 3 sacks (one heavy), one for each storehouse; share bread with 3 travellers who come to Egypt.
 * Only edit THIS file to change the level. See GEMINI.md and CAMPAIGN.md.
 * ===================================================================== */

const STORE = {
  sacks: [],
  breads: [],
  steps: [],
  travellers: [],
  HOUSES: [[-10, -28, 0xb91c1c, 'red', 'ball'], [0, -28, 0x1d4ed8, 'blue', 'triangle'], [10, -28, 0x15803d, 'green', 'square']],   // colour AND shape, so matching works without telling colours apart
  TRAVELLERS: [[-7, -16], [6, -17], [15, -19]],   // they come to Egypt, so they wait near the storehouses
  famine: false
};

function storeCanal(z) { return Math.abs(z - 10) < 2.5 || Math.abs(z + 8) < 2.5; }

const LEVEL = {
  id: '2-5',
  bibleConnection: {"passage": "Genesis 41:25–57", "text": "God revealed the coming plenty and famine, and Joseph stored grain to preserve lives. Our storehouse and bread tasks explore that wise care. God’s purpose was greater than Joseph’s suffering or our game score."},
  world: 'World 2-5',
  title: 'Joseph\'s Storehouses',
  time: 'day',
  leafIcon: '🌾',
  leafColor: 0xeab308,
  spawn: [0, 38],
  bounds: { minX: -19, maxX: 19, minZ: -42, maxZ: 42 },
  approach: ['stones', 'mover', 'meadow:ox'],   // the way in (engine): a stretch before the level's own start
  startMessage: 'Seven good years! Carry each grain sack to the storehouse with the same colour and shape.',

  intro: [
    { text: 'And let them gather all the food of those good years that come, and lay up corn under the hand of Pharaoh, and let them keep food in the cities.', ref: 'Genesis 41:35' },
    { text: 'And Jesus said unto them, I am the bread of life: he that cometh to me shall never hunger; and he that believeth on me shall never thirst.', ref: 'John 6:35' }
  ],

  introStory: [
    { art: '😢', title: 'Sold, but not forgotten', text: 'Joseph\'s jealous brothers sold him as a slave. He was taken to Egypt and even put in prison. But God was with Joseph.' },
    { art: '🌾', text: 'Behold, there come seven years of great plenty throughout all the land of Egypt:', ref: 'Genesis 41:29' },
    { art: '🏜️', text: 'And there shall arise after them seven years of famine; and all the plenty shall be forgotten in the land of Egypt; and the famine shall consume the land;', ref: 'Genesis 41:30' }
  ],

  tasks: [
    { id: 'store', icon: '🌾', label: 'Store the grain', total: 3 },
    { id: 'share', icon: '🍞', label: 'Share bread in the famine', total: 3, lockedUntil: 'store' }
  ],

  memoryVerse: { text: 'But as for you, ye thought evil against me; but God meant it unto good, to bring to pass, as it is this day, to save much people alive.', ref: 'Genesis 50:20' },

  ending: {
    verse: { text: 'And all countries came into Egypt to Joseph for to buy corn; because that the famine was so sore in all lands.', ref: 'Genesis 41:57' },
    message: 'God used Joseph to save many lives. Jesus is the Bread of Life!'
  },

  quiz: [
    { q: 'What came after the seven good years?', ref: 'Genesis 41:30', options: ['Seven years of famine', 'A great flood', 'Seven more good years'], answer: 0 },
    { q: 'How much grain did Joseph gather?', ref: 'Genesis 41:49', options: ['Just one barn', 'As the sand of the sea', 'Only a little'], answer: 1 },
    { q: 'Who came to Egypt to buy food?', ref: 'Genesis 41:57', options: ['Only Egyptians', 'Nobody', 'All countries'], answer: 2 }
  ],

  music: {
    bpm: 100,
    notes: [64, 0, 65, 68, 69, 0, 68, 65, 64, 0, 62, 0, 64, 0, 0, 0,
            69, 0, 71, 72, 74, 0, 72, 71, 69, 68, 65, 0, 64, 0, 0, 0],
    bass: [40, 40, 45, 45, 41, 41, 40, 40]
  },

  /* ---------- ground shape ---------- */
  terrain(x, z) {
    if (storeCanal(z)) return -1.4;
    return Math.sin(x * 0.3) * Math.cos(z * 0.25) * 0.15 + Math.max(0, Math.abs(x) - 16.5) * 1.2;
  },

  groundColor(x, z) {
    if (storeCanal(z)) return 0x3f5f7a;
    if (z > 14) return STORE.famine ? 0xbfa877 : ((Math.floor(x / 2) % 2) ? 0xc9b458 : 0xbfa94c);
    if (Math.abs(Math.abs(z - 10) - 2.9) < 0.5 || Math.abs(Math.abs(z + 8) - 2.9) < 0.5) return 0x7d7046;   // damp banks along the canals
    if (z < -22 && z > -36) return (Math.floor(x / 1.6) + Math.floor(z / 1.6)) % 2 ? 0xd8c290 : 0xcfb985;   // the paved granary yard
    return 0xcfb47e;
  },

  /* ---------- build ---------- */
  build(api) {
    const T = api.THREE;
    const person = (robe, scarf, s, o) => api.person(robe, scarf, s, o);   // friendly round townsfolk (engine)

    // --- wheat in the fields (gone in the famine) ---
    const wheat = new T.InstancedMesh(new T.ConeGeometry(0.12, 0.9, 5), api.mat(0xe2c044), 360);
    const m4 = new T.Matrix4();
    for (let i = 0; i < 360; i++) {
      const x = -16 + (i % 30) * 1.1 + Math.sin(i) * 0.3, z = 16 + Math.floor(i / 30) * 2 + Math.cos(i) * 0.4;
      m4.makeTranslation(x, api.terrain(x, z) + 0.45, z); wheat.setMatrixAt(i, m4);
    }
    api.add(wheat); STORE.wheat = wheat;

    // --- the storehouses ---
    const emblem = (shape, col, size) => {
      const m = new T.MeshBasicMaterial({ color: 0xfff7e0 });
      const e = shape === 'ball' ? new T.Mesh(new T.SphereGeometry(size * 0.5, 12, 8), m)
        : shape === 'triangle' ? new T.Mesh(new T.ConeGeometry(size * 0.55, size, 3), m)
        : new T.Mesh(new T.BoxGeometry(size * 0.9, size * 0.9, size * 0.9), m);
      const g = new T.Group(); g.add(e);
      const back = new T.Mesh(new T.CylinderGeometry(size * 0.85, size * 0.85, 0.06, 16), api.mat(col)); back.rotation.x = Math.PI / 2; back.position.z = -size * 0.5; g.add(back);
      return g;
    };
    STORE.emblem = emblem;
    STORE.houseBoxes = [];
    STORE.HOUSES.forEach(([x, z, col, cname, shape]) => {
      STORE.houseBoxes.push(api.box({ x, z, w: 6, d: 6, h: 4, color: 0xe8d8b0 }));
      // an Egyptian granary: a mud-plaster dome with a wide painted band in its colour (the colour still says which sack goes here)
      const roof = new T.Mesh(new T.SphereGeometry(3, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2), api.texMat(0xd9c49a, 'clay')); roof.scale.y = 1.25; roof.position.set(x, 4, z); api.add(roof);
      const band = new T.Mesh(new T.CylinderGeometry(2.95, 3.05, 0.9, 20, 1, true), api.texMat(col, 'clay')); band.material = band.material.clone(); band.material.side = T.DoubleSide; band.position.set(x, 4.45, z); api.add(band);
      const hatch = new T.Mesh(new T.CylinderGeometry(0.45, 0.5, 0.35, 12), api.texMat(0x8a6a44, 'wood')); hatch.position.set(x, 7.75, z); api.add(hatch);   // the loading hole at the top
      const door = new T.Mesh(new T.BoxGeometry(1.6, 2.4, 0.1), api.texMat(0x5b3a1a, 'wood')); door.position.set(x, 1.2, z + 3.05); api.add(door);
      [-1, 1].forEach((sd) => { const post = new T.Mesh(new T.BoxGeometry(0.22, 2.7, 0.16), api.texMat(col, 'clay')); post.position.set(x + sd * 0.92, 1.35, z + 3.08); api.add(post); });
      const lintel = new T.Mesh(new T.BoxGeometry(2.1, 0.22, 0.18), api.texMat(col, 'clay')); lintel.position.set(x, 2.68, z + 3.08); api.add(lintel);
      const flag = new T.Mesh(new T.BoxGeometry(1.2, 0.8, 0.08), api.texMat(col, 'cloth')); flag.position.set(x + 1.8, 3.2, z + 3.1); api.add(flag);
      const em = emblem(shape, col, 1.4); em.position.set(x, 3.15, z + 3.75); api.add(em);    // big sign over the door
    });
    // Joseph in fine linen with a gold chain about his neck (Genesis 41:42)
    const joseph = api.storyPerson(0xf5f5f4, 0xeab308, 1.04, {}); joseph.position.set(0, api.terrain(0, -20), -20); api.add(joseph); STORE.joseph = joseph;
    const collar = new T.Mesh(new T.TorusGeometry(0.33, 0.06, 6, 16), api.texMat(0xeab308, 'gold')); collar.rotation.x = Math.PI / 2; collar.position.y = 0.98; joseph.userData.storyActor.body.add(collar);

    // --- grain sacks: the band shows which storehouse it goes to ---
    const sackMesh = (col, big, shape) => {
      const g = new T.Group(); const s = big ? 1.3 : 1;
      const b = new T.Mesh(new T.CylinderGeometry(0.32 * s, 0.4 * s, 0.75 * s, 10), api.mat(0xc8a46a)); g.add(b);
      const band = new T.Mesh(new T.CylinderGeometry(0.36 * s, 0.37 * s, 0.14 * s, 10), api.mat(col)); band.position.y = 0.12; g.add(band);
      const tag = STORE.emblem(shape, col, 0.34 * s); tag.position.set(0, 0.12, 0.42 * s); g.add(tag);
      const top = new T.Mesh(new T.ConeGeometry(0.2 * s, 0.25 * s, 8), api.mat(0xc8a46a)); top.position.y = 0.48 * s; g.add(top);
      return g;
    };
    // one sack for each storehouse, each from a different corner of the fields: three crossings, not six errands
    [[-12, 34, 0, false], [4, 36, 1, true], [12, 24, 2, false]].forEach(([x, z, h, heavy]) => {
      const [hx, hz, col, name, shape] = STORE.HOUSES[h];
      STORE.sacks.push(api.carryable({
        x, z, mesh: sackMesh(col, heavy, shape), heavy, house: name, name: name + ' ' + shape + ' sack', to: 'the ' + name + ' ' + shape + ' storehouse',
        deliverTo: { x: hx, z: hz + 4.5, r: 2.4 },
        onDeliver(p) {
          api.task('store');
          api.servant(p, 4, 'for storing food for hard times!');
          // (the task board counts it: no pop-up)
        }
      }));
    });

    // --- canal 1: water, a stone bridge, and a broken bridge ---
    [10, -8].forEach((cz) => {
      const water = new T.Mesh(new T.PlaneGeometry(40, 5), new T.MeshLambertMaterial({ color: 0x2b7bb9, transparent: true, opacity: 0.78 }));
      water.rotation.x = -Math.PI / 2; water.position.set(0, -0.55, cz); api.add(water);
      api.hazard({ x: 0, z: cz, w: 40, d: 4.6 }, { maxY: -0.6, except: (p) => p.role.id === 'fisherman', msg: 'Splash! Use a bridge or the barge (the Fisherman can wade).' });
    });
    STORE.bridges = [api.box({ x: -10, z: 10, w: 3, d: 6.6, h: 1.7, y: -1.4, color: 0xcbb994 })];
    const planks = new T.Mesh(new T.BoxGeometry(1.6, 0.4, 1.2), api.mat(0xa0703c)); planks.position.set(8, 0.2, 14.4); api.add(planks);
    [12, 10, 8].forEach((z) => STORE.steps.push(api.box({ x: 8, z, w: 2.4, d: 2.1, h: 0.3, y: 0, hidden: true, color: 0xa0703c })));
    STORE.bridge = STORE.steps.slice();
    api.interact({
      x: 8, z: 14.4, r: 2.2, label: 'Fix bridge',
      can: (p) => (p.role.id === 'builder' ? true : 'A broken bridge. The Builder could fix it (Tab / RB to switch).'),
      use(p) {
        this.remove(); planks.visible = false;
        STORE.bridge.forEach((b) => b.show(true));
        api.sfx('build'); api.servant(p, 3);
        api.toast('🔨 The Builder fixed the bridge!', 2500);
      }
    });

    // --- canal 2: the slow barge, and a far bridge ---
    STORE.barge = api.mover({ w: 3, h: 0.35, d: 3, color: 0x8b5e34, path: [[0, -0.5, -5.4], [0, -0.5, -10.6]], speed: 2, wait: 1.4 });
    STORE.bridges.push(api.box({ x: -15, z: -8, w: 3, d: 6.6, h: 1.7, y: -1.4, color: 0xcbb994 }));

    // --- the travellers who come in the famine ---
    STORE.TRAVELLERS.forEach(([x, z], i) => {
      const t = api.storyPerson([0x7c3aed, 0x0e7490, 0x9a3412, 0x4d7c0f][i], [0xf5f5f4, 0xfde68a, 0xe5e7eb, 0xfecaca][i], 1, { beard: i !== 1, staff: i === 0, cane: i === 2, age: i === 2 ? 'elder' : undefined });
      t.position.set(x, api.terrain(x, z), z); t.rotation.y = Math.atan2(-x, -28 - z); t.visible = false; api.add(t); STORE.travellers.push(t);
    });
    // bread baskets at the storehouse doors, for the famine
    STORE.TRAVELLERS.forEach(([tx, tz], i) => {
      const [hx, hz] = STORE.HOUSES[i % 3];
      const g = new T.Group();
      const b = new T.Mesh(new T.CylinderGeometry(0.42, 0.32, 0.32, 12), api.mat(0x92400e)); g.add(b);
      [[-0.15, 0], [0.15, 0.05], [0, -0.15]].forEach(([dx, dz]) => { const l = new T.Mesh(new T.SphereGeometry(0.16, 8, 6), api.mat(0xd4a056)); l.position.set(dx, 0.2, dz); g.add(l); });
      const bread = api.carryable({
        x: hx - 1.6 + Math.floor(i / 3) * 3.2, z: hz + 5.6, mesh: g, name: 'bread', to: 'a hungry traveller',
        deliverTo: { x: tx, z: tz, r: 2.2 },
        onDeliver(p) {
          api.task('share');
          api.servant(p, 6, 'for feeding the hungry!');
          // (the task board counts it: no pop-up)
        }
      });
      bread.blocked = () => (STORE.famine ? true : 'Bread for later. Store the grain first.');
      bread.mesh.visible = false;
      STORE.breads.push(bread);
    });

    // --- fragment 1: in canal 1 (the Fisherman casts a net) ---
    api.fragment({ x: 2, z: 10, y: -1.0, net: true });

    // --- fragment 2: the Scribe reads the obelisk; steps appear up its side ---
    STORE.obelisk = api.box({ x: -14, z: 0, w: 2, d: 2, h: 5.5, color: 0xd6c08a });
    const glyphs = new T.Mesh(new T.BoxGeometry(0.05, 1.6, 1.2), api.mat(0x92400e)); glyphs.position.set(-12.97, 1.6, 0); api.add(glyphs);
    [[-11.8, 2.4, 1.1], [-11.8, 0, 2.2], [-11.8, -2.4, 3.3], [-14, -3.2, 4.4]].forEach(([x, z, top]) => STORE.steps.push(api.box({ x, z, w: 1.8, d: 1.8, h: 0.35, y: top - 0.35, hidden: true, color: 0xcbb994 })));
    STORE.glyphSteps = STORE.steps.slice(3);
    api.fragment({ x: -14, z: 0, y: 5.5 + 1.3 });
    api.interact({
      x: -12.4, z: 0, r: 2, label: 'Read inscription',
      can: (p) => (p.role.id === 'scribe' ? true : 'Writing carved in the stone. The Scribe could read it (Tab / RB to switch).'),
      use(p) {
        this.remove();
        STORE.glyphSteps.forEach((b) => b.show(true));
        api.sfx('door'); api.servant(p, 3);
        api.toast('📜 The Scribe reads: "Climb to see the whole land." Steps appear!', 3000);
      }
    });

    // --- fragment 3: crumbling stepping stones over canal 2 ---
    [[12, -4.6, 0.8], [12.6, -6.8, 1.6], [12, -9.0, 2.4], [12.6, -11.2, 1.6]].forEach(([x, z, top]) => api.crumble({ x, z, top }));
    api.fragment({ x: 12, z: -9.0, y: 2.4 + 1.3 });

    // --- Golden Scroll challenge course: along the east of the fields ---
    const plan = [['block', 1.0], ['float', 1.0], ['crumble', 0.9], ['float', 0.8], ['spring', 0.2], ['float', 4.2], ['crumble', 0.6]];
    let ctop = 0;
    api.course(plan.map(([kind, rise], i) => {
      const z = 38 - i * 2.9, x = 16 + (i % 2 ? 0.3 : -0.3);
      ctop = i === 0 ? api.terrain(x, z) + 1.0 : ctop + rise;
      return { x, z, top: ctop, kind };
    }));

    [[-17, 40], [17, 14], [-17, -2], [17, 0], [-17, -20], [17, -38], [-6, -16], [6, -16]].forEach(([x, z]) => api.tree(x, z, 1.0, 0x4d7c0f));
    api.leaves([[0, 32], [-8, 28], [6, 28], [0, 20], [-10, 13.4], [-10, 6.6], [8, 10, 1.2], [0, 0], [0, -8, 0.9], [-15, -8, 1.2], [0, -16], [-10, -21], [10, -21],
      [-11.8, 0, 3.1], [12.6, -6.8, 2.5]]);
    // camera: frame the broken bridge and the obelisk steps
    api.camZone({ minX: 5, maxX: 11, minZ: 6, maxZ: 17, yaw: -0.6, height: 10, back: 12, focus: [8, 0, 9], pull: 0.4 });
    api.camZone({ minX: -16, maxX: -10, minZ: -5, maxZ: 4, yaw: 0.7, height: 10, back: 11, focus: [-13, 3, -1], pull: 0.45 });
    LEVEL._dress(api);
  },

  update(api, dt) {
    LEVEL._poses(api, dt);
    if (!STORE.famine && api.taskDone('store')) {
      STORE.famine = true;
      STORE.wheat.visible = false;
      STORE.travellers.forEach((t) => { t.visible = true; });
      STORE.breads.forEach((b) => { b.mesh.visible = true; });
      api.story([
        { art: '🌾', text: 'And Joseph gathered corn as the sand of the sea, very much, until he left numbering; for it was without number.', ref: 'Genesis 41:49' },
        { art: '🚪', text: 'And the famine was over all the face of the earth: and Joseph opened all the storehouses, and sold unto the Egyptians; and the famine waxed sore in the land of Egypt.', ref: 'Genesis 41:56' }
      ], () => api.toast('🍞 Hungry people are coming from far away! Carry bread from the storehouse doors to each traveller.', 4000));
    }
  },

  /* ---------- presentation only: nothing here is solid, and no rule changes ---------- */
  _dress(api) {
    const T = api.THREE, g = new T.Group();
    const M = (geo, mat, x, y, z) => { const m = new T.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true; g.add(m); return m; };
    const B = (w, h, d, mat, x, y, z) => M(new T.BoxGeometry(w, h, d), mat, x, y, z);
    STORE.houseBoxes.forEach((b) => { b.mesh.material = api.texMat(0xe2cfa2, 'brick'); });
    STORE.bridges.forEach((b) => { b.mesh.material = api.texMat(0xcbb994, 'stone'); });
    // the obelisk: a gold-capped point and carved signs
    STORE.obelisk.mesh.material = api.texMat(0xd6c08a, 'stone');
    M(new T.ConeGeometry(1.3, 0.9, 4), api.texMat(0xe7b62f, 'gold'), -14, 5.95, 0).rotation.y = Math.PI / 4;
    const glyph = new T.MeshLambertMaterial({ color: 0x7a4b1e });
    for (let k = 0; k < 5; k++) B(0.04, 0.22, 0.5 - (k % 2) * 0.2, glyph, -12.98, 3.0 + k * 0.42, (k % 3 - 1) * 0.25);
    // papyrus along the canals
    const pap = new T.MeshLambertMaterial({ color: 0x5f8a3a }), head = new T.MeshLambertMaterial({ color: 0x8fb04a });
    [10, -8].forEach((cz) => [-1, 1].forEach((sd) => { for (let x = -17; x <= 17; x += 2.6) { if (Math.abs(x + 10) < 2.4 || Math.abs(x + 15) < 2.4 || Math.abs(x - 8) < 2 || Math.abs(x) < 2.4 || Math.abs(x - 12.3) < 1.6) continue; const z = cz + sd * 2.75, y = api.terrain(x, z); M(new T.CylinderGeometry(0.03, 0.04, 1.6, 4), pap, x, y + 0.8, z); const h = M(new T.ConeGeometry(0.28, 0.35, 7), head, x, y + 1.7, z); h.rotation.x = Math.PI; } }));
    // grain heaped by the granaries ("as the sand of the sea", 41:49) and the scribe's table
    [[-14.2, -24.6], [4.2, -23.6], [14.6, -24.4]].forEach(([x, z]) => M(new T.ConeGeometry(0.9, 0.7, 14), api.texMat(0xd9b65a, 'weave'), x, 0.35, z));
    B(1.4, 0.12, 0.7, api.texMat(0x7a5530, 'wood'), -4.4, 0.75, -21.6);
    [-0.5, 0.5].forEach((dx) => B(0.08, 0.7, 0.08, api.texMat(0x7a5530, 'wood'), -4.4 + dx, 0.35, -21.6));
    B(0.5, 0.03, 0.35, new T.MeshLambertMaterial({ color: 0xe8dcb5 }), -4.4, 0.82, -21.6);
    // the pyramids, far beyond the granaries
    const sand = api.texMat(0xd8bf86, 'stone');
    [[-26, -88, 34], [8, -96, 46], [34, -84, 26]].forEach(([x, z, w]) => { const p = M(new T.ConeGeometry(w * 0.72, w * 0.62, 4), sand, x, w * 0.31 - 2, z); p.rotation.y = Math.PI / 4; });
    api.scenery(g);
    [['PalmTree_1', -17.4, 30, 7], ['PalmTree_2', 17.6, 4.4, 6.5], ['PalmTree_3', -17.6, -32, 7], ['PalmTree_4', 17.4, -30, 6.5]].forEach(([n, x, z, h]) => { const m = api.model(n, h); if (!m) return; const t = new T.Group(); t.position.set(x, api.terrain(x, z), z); t.rotation.y = x + z; t.add(m); api.add(t); api.fadeScenery(t, 2.6); });
    // a scribe counts the grain until it is past counting (41:49); an overseer knows the way (optional; just for our game)
    const scribe = api.storyPerson(0xf1ead6, 0x2d2a26, 0.98, {}); scribe.position.set(-4.4, api.terrain(-4.4, -20.8), -20.8); scribe.rotation.y = Math.PI; api.add(scribe); STORE.scribe = scribe;
    const overseer = api.storyPerson(0xf3eee2, 0x1f3a5f, 1, {}); overseer.position.set(-3.6, api.terrain(-3.6, 37.4), 37.4); overseer.rotation.y = 2.4; api.add(overseer); STORE.overseer = overseer;
    STORE.overseerTalk = api.conversation({
      person: overseer, speaker: 'Overseer', label: 'Talk with the overseer',
      clue(api) {
        if (!api.taskDone('store')) { const sk = STORE.sacks.find((x) => !x.delivered && !x.holder); return { text: 'Each sack has a colour and a sign. Carry it to the storehouse with the same colour and sign. Cross by a bridge or the barge.', at: sk ? [sk.x, sk.y + 1, sk.z] : undefined }; }
        if (!api.taskDone('share')) { const b = STORE.breads.find((x) => !x.delivered && !x.holder); return { text: 'The famine has come. People from far away are hungry. Carry bread from the storehouse doors to them.', at: b ? [b.x, b.y + 1, b.z] : undefined }; }
        return { text: 'There was bread in Egypt for everyone who came.' };
      }
    });
  },

  _poses(api, dt) {
    const t = api.time;
    if (STORE.joseph) api.posePerson(STORE.joseph, { dt, expression: 'calm', talking: STORE.famine && t % 5 < 2 });
    if (STORE.scribe) { const a = STORE.scribe.userData.storyActor; api.posePerson(STORE.scribe, { dt, expression: 'listen', headPitch: 0.35 }); a.arms[1].rotation.x = -0.9 + Math.sin(t * 4) * 0.08; }   // writing
    if (STORE.overseer) api.posePerson(STORE.overseer, { dt, expression: 'calm' });
    STORE.travellers.forEach((m, i) => { if (m.visible) { const fed = STORE.breads[i] && STORE.breads[i].delivered; api.posePerson(m, { dt, expression: fed ? 'wonder' : 'worry', cheer: fed && t % 6 < 1.8 }); } });
  },

  objective(api) {
    const ps = api.activePlayers();
    if (!ps.length) return null;
    const held = ps.map((p) => p.holding).find((h) => h && (STORE.sacks.indexOf(h) >= 0 || STORE.breads.indexOf(h) >= 0));
    if (held) return [held.deliverTo.x, 2.5, held.deliverTo.z];
    const list = STORE.famine ? STORE.breads : STORE.sacks;
    const cx = ps.reduce((s, p) => s + p.pos.x, 0) / ps.length, cz = ps.reduce((s, p) => s + p.pos.z, 0) / ps.length;
    const it = list.filter((i) => !i.delivered && !i.holder).sort((a, b) => Math.hypot(a.x - cx, a.z - cz) - Math.hypot(b.x - cx, b.z - cz))[0];
    return it ? [it.x, it.y + 1, it.z] : null;
  },

  finale: {
    message: '🌾 Everyone gather with Joseph by the storehouses!',
    beacon: [0, 3, -20],
    inZone(p) { return Math.hypot(p.pos.x, p.pos.z + 20) < 6; },
    onUpdate(api, t) {
      if (t > 0.5 && !STORE.told) {
        STORE.told = true;
        api.story([
          ...(api.shownRef('Genesis 50:20') ? [] : [{ art: '💛', text: 'But as for you, ye thought evil against me; but God meant it unto good, to bring to pass, as it is this day, to save much people alive.', ref: 'Genesis 50:20' }]),
          { art: '✝️', title: 'Bread for the world', text: 'God used Joseph to save many people from hunger (Genesis 50:20). God sent Jesus to save the world from sin.' },
          { art: '🍞', text: 'And Jesus said unto them, I am the bread of life: he that cometh to me shall never hunger; and he that believeth on me shall never thirst.', ref: 'John 6:35' }
        ], () => { STORE.endT = api.time; });
      }
      return STORE.endT !== undefined && api.time - STORE.endT > 2;
    }
  }
};
