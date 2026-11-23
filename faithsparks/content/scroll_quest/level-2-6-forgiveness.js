/* =====================================================================
 * LEVEL 2-6: THE ROAD TO FORGIVENESS  (Genesis 42-45, 50)
 * ---------------------------------------------------------------------
 * The desert road from Canaan (north, z 42) down to Egypt (south, z -42):
 *   Camp        (z 42..24)  gifts for the ruler of Egypt (Genesis 43:11)
 *   Sand gusts  (z 20..0)   wind blows from the west: shelter behind the stone windbreaks
 *   The oasis   (8, -4)
 *   Mud flats   (z -8..-20) slow going (the Sandals of Peace stride through)
 *   Egypt       (z -26..-42) Joseph's house
 * Tasks: regroup the 5 brothers scattered by the sandstorm; pick up the 3 gifts it scattered along the road.
 * Finale: Joseph forgives his brothers (Genesis 45:4-5, 50:20).
 * Only edit THIS file to change the level. See GEMINI.md and CAMPAIGN.md.
 * ===================================================================== */

const CARAVAN = {
  brothers: [],
  gifts: [],
  breaks: [],
  HOUSE: [0, -30],
  OASIS: [8, -4],
  GUST: [0, 20],          // z range of the windy stretch
  gustT: 0,
  gusting: false
};

const LEVEL = {
  id: '2-6',
  bibleConnection: {"passage": "Genesis 45:1–15; 50:15–21", "text": "Joseph’s brothers had sold him, but he forgave them and saw how God had preserved many lives. Our regrouping and road gifts are imagined travel activities. Gifts cannot buy forgiveness."},
  world: 'World 2-6',
  title: 'The Road to Forgiveness',
  time: 'day',
  leafIcon: '🌰',
  leafColor: 0xb45309,
  leafShape: 'round',
  spawn: [0, 38],
  bounds: { minX: -19, maxX: 19, minZ: -42, maxZ: 42 },
  approach: ['meadow:lion', 'stones', 'crumbles'],   // the way in (engine): a stretch before the level's own start
  startMessage: "Call the scattered brothers together. Gather the gifts along the road, then head to Egypt with Benjamin.",

  intro: [
    { text: 'And they said one to another, We are verily guilty concerning our brother, in that we saw the anguish of his soul, when he besought us, and we would not hear; therefore is this distress come upon us.', ref: 'Genesis 42:21' },
    { text: 'And be ye kind one to another, tenderhearted, forgiving one another, even as God for Christ\'s sake hath forgiven you.', ref: 'Ephesians 4:32' }
  ],

  introStory: [
    { art: '💔', title: 'What the brothers did', text: 'Years ago, Joseph\'s brothers hated him. They sold him as a slave and told their father he was dead. They never forgot it.' },
    { art: '😔', text: 'And they said one to another, We are verily guilty concerning our brother, in that we saw the anguish of his soul, when he besought us, and we would not hear; therefore is this distress come upon us.', ref: 'Genesis 42:21' }
  ],

  tasks: [
    { id: 'brothers', icon: '👥', label: 'Regroup the brothers', total: 5 },
    { id: 'gifts', icon: '🎁', label: 'Pick up the gifts on the road', total: 3 }
  ],

  memoryVerse: { text: 'And be ye kind one to another, tenderhearted, forgiving one another, even as God for Christ\'s sake hath forgiven you.', ref: 'Ephesians 4:32' },

  ending: {
    verse: { text: 'Now therefore be not grieved, nor angry with yourselves, that ye sold me hither: for God did send me before you to preserve life.', ref: 'Genesis 45:5' },
    message: 'Joseph forgave his brothers. God forgives us in Jesus, so we can forgive too!'
  },

  quiz: [
    { q: 'What had the brothers done to Joseph long ago?', ref: 'Genesis 45:4', options: ['Sold him into Egypt', 'Gave him a coat', 'Made him king'], answer: 0 },
    { q: 'What did Judah offer to do for Benjamin?', ref: 'Genesis 44:33', options: ['Run away', 'Stay as a servant in his place', 'Pay with gold'], answer: 1 },
    { q: 'What did Joseph do when he told them who he was?', ref: 'Genesis 45:15', options: ['Put them in prison', 'Sent them away hungry', 'Kissed them and wept, and forgave'], answer: 2 }
  ],

  music: {
    bpm: 90,
    notes: [62, 0, 64, 65, 69, 0, 67, 65, 64, 0, 62, 0, 61, 0, 62, 0,
            65, 0, 67, 69, 72, 0, 70, 69, 67, 65, 64, 0, 62, 0, 0, 0],
    bass: [38, 38, 43, 43, 45, 45, 38, 38]
  },

  onCallText(kind, n) {                                                 // said once; after that they just come
    if (CARAVAN.saidCall) return '';
    CARAVAN.saidCall = true;
    return (n > 1 ? n + ' brothers join you!' : 'A brother joins you!') + ' Stay together.';
  },

  /* ---------- ground shape ---------- */
  terrain(x, z) {
    const dune = Math.max(0, Math.sin(x * 0.28 + z * 0.12)) * Math.max(0, Math.abs(x) - 4) * 0.12;   // dunes beside the road
    const [ox, oz] = CARAVAN.OASIS;
    if (Math.hypot(x - ox, z - oz) < 2.6) return -1.2;
    return dune + Math.max(0, Math.abs(x) - 16.5) * 1.2;
  },

  groundColor(x, z, h) {
    const [ox, oz] = CARAVAN.OASIS;
    const d = Math.hypot(x - ox, z - oz);
    if (d < 2.6) return 0x2f6f8f;
    if (d < 4.5) return 0x7aa04a;
    if (z < -26) return 0xcdb07c;
    return Math.abs(x) < 2.5 ? 0xc49f66 : 0xd2b07a;
  },

  /* ---------- build ---------- */
  build(api) {
    const T = api.THREE;
    api.follower({ x: 4, z: 36, kind: 'donkey', call: false, ride: true, seat: 0.95, rideSpeed: 1.3 });   // the brothers' asses carried the corn (Genesis 42:26): climb on and ride (Y)
    const person = (robe, scarf, s, o) => api.person(robe, scarf, s, o);   // friendly round townsfolk (engine)
    const [hx, hz] = CARAVAN.HOUSE;

    // --- the scattered brothers (Benjamin is the youngest) ---
    [[-14, 30, 0x9a3412, 1], [12, 25, 0x1d4ed8, 1], [-12, 10, 0x15803d, 1], [14, 3, 0x7c3aed, 1], [-5, -13, 0x0e7490, 0.8]].forEach(([x, z, robe, s], i) => {
      const f = api.follower({
        x, z, kind: i === 4 ? 'Benjamin' : 'brother', mesh: person(robe, 0xf5f5f4, s),
        deliverTo: { x: hx, z: hz, r: 3.5 },
        parkAt: (ff) => { const k = CARAVAN.brothers.indexOf(ff); return [hx - 4 + k * 2, api.terrain(hx - 4 + k * 2, hz - 2.6), hz - 2.6]; },
        onDeliver(p) {
          api.task('brothers');
          api.servant(p, 4, 'for keeping the family together!');
          // (the task board counts it: no pop-up)
        }
      });
      CARAVAN.brothers.push(f);
    });

    // --- gifts for the ruler of Egypt (balm, honey, nuts and almonds) ---
    const gift = (kind) => {
      const g = new T.Group();
      if (kind === 'honey') { const j = new T.Mesh(new T.CylinderGeometry(0.3, 0.36, 0.55, 12), api.mat(0xd97706)); g.add(j); }
      else if (kind === 'balm') { const j = new T.Mesh(new T.CylinderGeometry(0.16, 0.28, 0.65, 10), api.mat(0x65a30d)); g.add(j); }
      else { const b = new T.Mesh(new T.CylinderGeometry(0.5, 0.4, 0.4, 12), api.mat(0x92400e)); g.add(b); for (let i = 0; i < 5; i++) { const n = new T.Mesh(new T.SphereGeometry(0.12, 6, 5), api.mat(0xb45309)); n.position.set(Math.cos(i * 1.3) * 0.25, 0.25, Math.sin(i * 1.3) * 0.25); g.add(n); } }
      return g;
    };
    // the sandstorm scattered the gifts along the road: pick each one up as you pass (no trips back)
    [['honey', -5, 26], ['balm', 6, 4], ['nuts', -3, -14]].forEach(([kind, x, z]) => {
      CARAVAN.gifts.push(api.gatherable({
        x, z, mesh: gift(kind), task: 'gifts',
        onGet(p) { api.servant(p, 4, 'for finding a gift!'); }
      }));
    });
    const tent = new T.Mesh(new T.ConeGeometry(1.8, 2.4, 4), api.mat(0x9a6b3c)); tent.position.set(-8, 1.2, 38); tent.rotation.y = Math.PI / 4; api.add(tent);
    api.armor('breastplate', 8, 30);

    // --- the windy stretch: stone windbreaks to shelter behind ---
    [[-7, 17], [3, 14], [-5, 9], [6, 6], [-2, 2]].forEach(([x, z]) => {
      api.box({ x, z, w: 0.8, d: 3.2, h: 2.2, color: 0xa8a29e });
      CARAVAN.breaks.push([x, z]);
    });
    const sand = new T.Group();
    for (let i = 0; i < 40; i++) { const s = new T.Mesh(new T.BoxGeometry(1.6, 0.04, 0.04), new T.MeshBasicMaterial({ color: 0xf5deb3, transparent: true, opacity: 0.6 })); s.position.set(Math.random() * 38 - 19, 0.4 + Math.random() * 2.2, Math.random() * 20); sand.add(s); }
    sand.visible = false; api.add(sand); CARAVAN.sand = sand;

    // --- the oasis ---
    const [ox, oz] = CARAVAN.OASIS;
    const pool = new T.Mesh(new T.CircleGeometry(2.6, 20), new T.MeshLambertMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.8 }));
    pool.rotation.x = -Math.PI / 2; pool.position.set(ox, -0.4, oz); api.add(pool);
    api.hazard({ x: ox, z: oz, r: 2.4 }, { maxY: -0.5, except: (p) => p.role.id === 'fisherman', msg: 'Splash! Walk around the oasis pool (the Fisherman can wade).' });
    [[ox - 3.6, oz - 2], [ox + 3.6, oz + 1.5], [ox + 1, oz - 4]].forEach(([x, z]) => api.tree(x, z, 1.1, 0x4d7c0f));

    // --- the mud flats, with a dry path that zig-zags through ---
    [[-9, -9, 14, 3], [6, -9, 10, 3], [-4, -14, 12, 3.6], [10, -14, 8, 3.6], [-10, -19, 10, 3], [5, -19, 12, 3]].forEach(([x, z, w, d]) => api.mud({ x, z, w, d }));
    api.armor('sandals', -14, -4);

    // --- Egypt: Joseph's house ---
    api.box({ x: hx, z: hz - 8, w: 10, d: 6, h: 4, color: 0xf0e2c0 });
    [-4, 4].forEach((dx) => { const col = new T.Mesh(new T.CylinderGeometry(0.35, 0.35, 4, 10), api.mat(0xeab308)); col.position.set(hx + dx, 2, hz - 4.8); api.add(col); });
    const door = new T.Mesh(new T.BoxGeometry(1.8, 2.6, 0.1), api.mat(0x5b3a1a)); door.position.set(hx, 1.3, hz - 4.95); api.add(door);
    const joseph = person(0xf5f5f4, 0xeab308); joseph.position.set(hx + 2, api.terrain(hx + 2, hz - 3.8), hz - 3.8); api.add(joseph);
    const collar = new T.Mesh(new T.TorusGeometry(0.33, 0.06, 6, 16), api.mat(0xeab308)); collar.rotation.x = Math.PI / 2; collar.position.y = 1.12; joseph.add(collar);
    [[12, -38], [-14, -28], [14, -30]].forEach(([x, z]) => api.box({ x, z, w: 4, d: 4, h: 3, color: 0xe2d1ad }));

    // --- fragment 1: a spring up to a high rock ---
    const sp = api.spring({ x: 14, z: -21.6 });
    api.box({ x: 14, z: -24.2, w: 2.4, d: 2.4, h: 0.4, y: sp.platform.top + 4.2 - 0.4, color: 0xa8a29e });
    api.fragment({ x: 14, z: -24.2, y: sp.platform.top + 4.2 + 1.3 });

    // --- fragment 2: crumbling ledges up to a rock above the mud ---
    [[-11, -9.6, 1.0], [-12.8, -11.4, 1.8], [-14.6, -13.2, 2.6]].forEach(([x, z, r]) => api.crumble({ x, z, top: api.terrain(x, z) + r }));
    const f2top = api.terrain(-14.6, -13.2) + 3.4;
    api.box({ x: -14.6, z: -15.6, w: 2, d: 2, h: f2top - api.terrain(-14.6, -15.6), color: 0xa8a29e });
    api.fragment({ x: -14.6, z: -15.6, y: f2top + 1.3 });

    // --- fragment 3: in the oasis pool (the Fisherman casts a net) ---
    api.fragment({ x: ox, z: oz, y: -1.0, net: true });

    // --- Golden Scroll challenge course: by the camp ---
    const plan = [['block', 1.0], ['float', 1.0], ['crumble', 0.9], ['float', 0.8], ['spring', 0.2], ['float', 4.2], ['crumble', 0.6]];
    let ctop = 0;
    api.course(plan.map(([kind, rise], i) => {
      const z = 39 - i * 2.9, x = -15.5 + (i % 2 ? 0.3 : -0.3);
      ctop = i === 0 ? api.terrain(x, z) + 1.0 : ctop + rise;
      return { x, z, top: ctop, kind };
    }));

    api.leaves([[0, 26], [-3, 20], [2, 16], [-2, 11], [4, 8], [0, 4], [0, -2], [-2, -6], [2, -11.4], [-2, -16], [0, -22], [-6, -26], [6, -26],
      [14, -24.2, sp.platform.top + 5.1], [-12.8, -11.4, api.terrain(-12.8, -11.4) + 2.7]]);
    // camera: through the windy stretch, look further ahead to the next stone wall
    api.camZone({ minX: -19, maxX: 19, minZ: 0, maxZ: 20, yaw: 0, height: 13, back: 12, focus: [0, 0, -2], pull: 0.3 });
  },

  update(api, dt) {
    // sand gusts: 3 seconds calm, 2 seconds of wind from the west
    CARAVAN.gustT += dt;
    const cyc = CARAVAN.gustT % 5;
    CARAVAN.gusting = cyc > 3;
    CARAVAN.sand.visible = CARAVAN.gusting;
    if (CARAVAN.gusting) {
      CARAVAN.sand.children.forEach((s) => { s.position.x += dt * 22; if (s.position.x > 19) s.position.x = -19; });
      const [z0, z1] = CARAVAN.GUST;
      api.activePlayers().forEach((p) => {
        if (p.pos.z < z0 || p.pos.z > z1) return;
        const sheltered = CARAVAN.breaks.some(([bx, bz]) => p.pos.x > bx && p.pos.x - bx < 3.6 && Math.abs(p.pos.z - bz) < 1.9);
        if (sheltered) return;
        api.push(p, 6.5, 0, dt);
        if (!CARAVAN.toldGust) { CARAVAN.toldGust = true; api.toast('💨 Sand gusts! Hide behind the stone walls when the wind blows (the Breastplate stands firm).', 3800); }
      });
    }
  },

  objective(api) {
    const ps = api.activePlayers();
    if (!ps.length) return null;
    const [hx, hz] = CARAVAN.HOUSE;
    if (CARAVAN.brothers.some((b) => b.state === 'follow')) return [hx, 2.5, hz];
    const cx = ps.reduce((s, p) => s + p.pos.x, 0) / ps.length, cz = ps.reduce((s, p) => s + p.pos.z, 0) / ps.length;
    const targets = CARAVAN.brothers.filter((b) => b.state === 'idle').map((b) => [b.pos.x, b.pos.y + 2.2, b.pos.z])
      .concat(CARAVAN.gifts.filter((it) => !it.got).map((it) => [it.x, it.y + 1, it.z]));
    targets.sort((a, b) => Math.hypot(a[0] - cx, a[2] - cz) - Math.hypot(b[0] - cx, b[2] - cz));
    return targets[0] || null;
  },

  finale: {
    message: '🏛️ Everyone gather at Joseph\'s house!',
    beacon: [0, 3, -30],
    inZone(p) { return Math.hypot(p.pos.x - CARAVAN.HOUSE[0], p.pos.z - CARAVAN.HOUSE[1]) < 6; },
    onUpdate(api, t) {
      if (t > 0.5 && !CARAVAN.told) {
        CARAVAN.told = true;
        api.story([
          { art: '🤝', title: 'Judah\'s offer', text: 'Now therefore, I pray thee, let thy servant abide instead of the lad a bondman to my lord; and let the lad go up with his brethren.', ref: 'Genesis 44:33' },
          { art: '😭', text: 'And Joseph said unto his brethren, Come near to me, I pray you. And they came near. And he said, I am Joseph your brother, whom ye sold into Egypt.', ref: 'Genesis 45:4' },
          { art: '💛', text: 'Now therefore be not grieved, nor angry with yourselves, that ye sold me hither: for God did send me before you to preserve life.', ref: 'Genesis 45:5' },
          { art: '🫂', text: 'Moreover he kissed all his brethren, and wept upon them: and after that his brethren talked with him.', ref: 'Genesis 45:15' },
          { art: '✝️', title: 'Forgiven', text: 'Joseph forgave the brothers who hurt him. On the cross, Jesus forgave too. He took our place, as Judah offered to take Benjamin\'s.' }
        ], () => { CARAVAN.endT = api.time; });
      }
      return CARAVAN.endT !== undefined && api.time - CARAVAN.endT > 2;
    }
  }
};
