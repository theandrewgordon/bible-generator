/* =====================================================================
 * LEVEL 8-9: THE TREE OF LIFE  (Revelation 21-22)
 * ---------------------------------------------------------------------
 * A promise, shown to John in a vision: all things made new. Bright, joyful, and NO hazards at all.
 * Walk toward -z along the pure river (shallow: you can wade anywhere):
 *   The promenade (z 42..-18) six landmarks from the whole journey, each with a broad, friendly climb:
 *                             the rainbow (1-4), the ark (1-3), Jacob's well country (2-2), Jericho's
 *                             fallen stones (3-8), a Galilee boat (6-5), the empty tomb (7-5)
 *   The gate      (0, -24)    the way to the tree of life, shut since Genesis 3:24, stands open
 *   The tree      (0, -34)    the tree of life on either side of the river (Revelation 22:2)
 * The open gate and the tree are God's gift, never unlocked by points. God is shown only as light.
 * Only edit THIS file to change the level. See GEMINI.md and CAMPAIGN.md.
 * ===================================================================== */

const LIFE = {
  marks: [],
  steps: [],
  boat: null,
  GATE: [0, -24],
  TREE: [0, -34],
  told: false
};

const LEVEL = {
  id: '8-9',
  bibleConnection: {"passage": "Revelation 21–22", "text": "God promises a new creation with no death or curse. The tree of life grows in His city. Our garden pictures His promise. Collecting things does not earn eternal life."},
  world: 'World 8-9',
  title: 'The Tree of Life',
  leafIcon: '🌸',
  leafColor: 0xf9a8d4,
  leafShape: 'round',
  trails: true,
  spawn: [0, 44],
  bounds: { minX: -19, maxX: 19, minZ: -42, maxZ: 48 },
  startMessage: 'All things made new! Walk the river path and see the places from your whole journey.',

  intro: [
    { text: 'And God shall wipe away all tears from their eyes; and there shall be no more death, neither sorrow, nor crying, neither shall there be any more pain: for the former things are passed away.', ref: 'Revelation 21:4' },
    { text: 'And he that sat upon the throne said, Behold, I make all things new.', ref: 'Revelation 21:5' }
  ],

  introStory: [
    { art: '🌅', title: 'A promise, shown to John', text: 'At the end of the Bible, God showed John what He will do one day. This is not a dream we made up: it is God\'s promise. Everything sin spoiled will be made new.' },
    { art: '💧', title: 'No more tears', text: 'And God shall wipe away all tears from their eyes; and there shall be no more death, neither sorrow, nor crying, neither shall there be any more pain: for the former things are passed away.', ref: 'Revelation 21:4' }
  ],

  tasks: [
    { id: 'marks', icon: '🗺️', label: 'Visit the places from the journey', total: 6 },
    { id: 'gate', icon: '🚪', label: 'Walk through the open gate', total: 1 }
  ],

  memoryVerse: { text: 'And God shall wipe away all tears from their eyes; and there shall be no more death, neither sorrow, nor crying, neither shall there be any more pain: for the former things are passed away.', ref: 'Revelation 21:4' },

  ending: {
    verse: { text: 'And there shall be no more curse:', ref: 'Revelation 22:3' },
    message: 'From the garden to the garden: the way to the tree of life is open, because of Jesus. Come, Lord Jesus!'
  },

  quiz: [
    { q: 'What will God wipe away?', ref: 'Revelation 21:4', options: ['All tears', 'All the rivers', 'All the trees'], answer: 0 },
    { q: 'Where is the tree of life?', ref: 'Revelation 22:2', options: ['On a mountain top', 'On either side of the river', 'Inside a cave'], answer: 1 },
    { q: 'Why is the way to the tree of life open?', ref: 'Ephesians 2:8', options: ['We collected enough points', 'Because of Jesus: it is God\'s gift', 'The gate broke'], answer: 1 }
  ],

  music: {
    bpm: 112,
    notes: [72, 76, 79, 84, 83, 79, 76, 79, 81, 77, 74, 77, 79, 0, 0, 0,
            72, 76, 79, 84, 86, 84, 83, 81, 79, 77, 76, 74, 72, 0, 0, 0],
    bass: [48, 48, 53, 53, 55, 55, 48, 48]
  },

  /* ---------- ground: the garden made new; a shallow, clear river down the middle ---------- */
  terrain(x, z) {
    let h = Math.sin(x * 0.25) * Math.cos(z * 0.2) * 0.12;
    const r = Math.abs(x);
    if (r < 2) h -= 0.55 * Math.min(1, (2 - r) / 0.6);                  // shallow everywhere: wade across
    return h;
  },

  groundColor(x, z, h) {
    if (Math.abs(x) < 1.7 && h < -0.35) return 0x7dd3fc;
    return (Math.floor(x / 3) + Math.floor(z / 3)) % 2 ? 0x7ccf63 : 0x72c45a;
  },

  /* ---------- build ---------- */
  build(api) {
    const T = api.THREE;
    const water = new T.Mesh(new T.PlaneGeometry(3.6, 96), new T.MeshLambertMaterial({ color: 0x7dd3fc, transparent: true, opacity: 0.7 }));
    water.rotation.x = -Math.PI / 2; water.position.set(0, -0.32, 2); api.add(water);
    // broad stepping stones and little bridges across the river, everywhere (no need to wade)
    [36, 24, 12, 0, -12, -20].forEach((z) => api.box({ x: 0, z, w: 4.4, d: 2.2, h: 0.3, y: -0.05, color: 0xe7e0cf, house: false }));

    const mark = (x, z, r, minY, name) => { LIFE.marks.push({ x, z, r, minY, name, seen: false }); };

    // 1. the rainbow (1-4): walk under it; springs up to its top for a fragment
    const bow = new T.Group();
    [0xef4444, 0xf97316, 0xfacc15, 0x22c55e, 0x3b82f6, 0x8b5cf6].forEach((c, i) => {
      const a = new T.Mesh(new T.TorusGeometry(7 - i * 0.35, 0.18, 8, 40, Math.PI), new T.MeshBasicMaterial({ color: c }));
      bow.add(a);
    });
    bow.position.set(-6, 0, 32); api.add(bow);
    mark(-6, 32, 3.2, -1, 'rainbow');
    // 2. the ark (1-3), resting on the grass: broad steps up onto the deck
    api.box({ x: -11, z: 20, w: 5, d: 10, h: 2.4, color: 0x8b5e34, tex: 'wood', house: false });
    api.box({ x: -7.6, z: 23.4, w: 1.8, d: 2, h: 0.8, color: 0xa0703c, house: false });
    api.box({ x: -7.6, z: 21.4, w: 1.8, d: 2, h: 1.6, color: 0xa0703c, house: false });
    const cabin = new T.Mesh(new T.BoxGeometry(3, 1.6, 4), api.texMat(0x7a4a24, 'wood')); cabin.position.set(-11, 3.2, 17); api.add(cabin);
    mark(-11, 21, 2.6, 2.0, 'ark');
    [['sheep', -13, 22], ['lamb', -12, 24], ['dove', -10, 16]].forEach(([k, x, z]) => { const a = api.animalMesh(k); a.position.set(x, 2.4, z); api.add(a); });
    // 3. the well (2-2)
    const well = new T.Mesh(new T.CylinderGeometry(1.1, 1.2, 1, 16), api.texMat(0x9a8f80, 'stone')); well.position.set(9, 0.5, 14); api.add(well);
    api.box({ x: 9, z: 14, w: 2, d: 2, h: 1, color: 0x9a8f80, house: false }).mesh.visible = false;
    [['camel', 12, 16], ['camel', 12.6, 12]].forEach(([k, x, z]) => { const a = api.animalMesh(k, { kneel: true }); a.position.set(x, 0, z); api.add(a); });
    mark(9, 14, 3, -1, 'well');
    // 4. Jericho's fallen stones (3-8): a friendly heap to climb
    [[-9, 2, 0.8, 3], [-10.6, 0.4, 1.6, 2.4], [-9.2, -1.4, 2.4, 2.2]].forEach(([x, z, h, s]) => api.box({ x, z, w: s, d: s, h, color: 0xc8a97a, house: false }));
    mark(-9.2, -1.4, 1.6, 1.8, 'Jericho');
    // 5. a Galilee boat (6-5) drifting slowly up and down the river: hop in
    LIFE.boat = api.mover({ w: 2.2, h: 0.5, d: 3.6, color: 0x8b5e34, path: [[0, -0.3, -4], [0, -0.3, -10]], speed: 1.2, wait: 1.6 });
    mark(0, -4, 1.5, 0, 'boat');
    // 6. the empty tomb (7-5): the stone rolled away
    api.box({ x: -10, z: -16, w: 5, d: 4, h: 3.2, color: 0x8b8178, house: false });
    const hole = new T.Mesh(new T.CircleGeometry(1, 20), new T.MeshBasicMaterial({ color: 0x1c1917 })); hole.position.set(-10, 1.1, -13.97); api.add(hole);
    const stone = new T.Mesh(new T.CylinderGeometry(1.2, 1.2, 0.4, 20), api.mat(0x78716c)); stone.rotation.x = Math.PI / 2; stone.position.set(-7.2, 1.2, -13.6); api.add(stone);
    mark(-10, -12.6, 2.6, -1, 'tomb');
    api.camZone({ minX: -4, maxX: 4, minZ: -12, maxZ: -2, yaw: 0.35, height: 7, back: 11, focus: [0, 0, -8], pull: 0.35 });

    // --- the gate, open (Genesis 3:24 closed it; now it stands open) ---
    const [gx, gz] = LIFE.GATE;
    [[-4, gz], [4, gz]].forEach(([x, z]) => api.box({ x, z, w: 1.6, d: 1.6, h: 5, color: 0xfde68a, house: false }));
    const lintel = new T.Mesh(new T.BoxGeometry(9.6, 0.8, 1.8), api.mat(0xfde68a)); lintel.position.set(gx, 5.4, gz); api.add(lintel);
    [[-3.2, -1], [3.2, 1]].forEach(([x, s]) => { const d = new T.Mesh(new T.BoxGeometry(0.2, 4.2, 3), api.mat(0xeab308)); d.position.set(gx + x, 2.1, gz - 1.6); d.rotation.y = s * 0.15; api.add(d); });
    [[-17, gz, 26], [17, gz, 26]].forEach(([x, z, w]) => api.box({ x: x > 0 ? 11.5 : -11.5, z, w: 13.4, d: 1, h: 2.2, color: 0xfef3c7, house: false }));
    LIFE.gateZone = api.zone({ x: gx, z: gz - 1, r: 3, time: 0.3, color: 0xfde68a, hidden: true,
      onDone(helpers) { api.task('gate'); helpers.forEach((p) => api.servant(p, 3)); } });

    // --- the tree of life, on either side of the river; light from the throne beyond ---
    const [tx, tz] = LIFE.TREE;
    [-2.6, 2.6].forEach((dx) => { const tr = new T.Mesh(new T.CylinderGeometry(0.6, 0.9, 5, 12), api.texMat(0x7a5230, 'bark')); tr.position.set(tx + dx, 2.5, tz); api.add(tr); });
    const crown = new T.Mesh(new T.SphereGeometry(5.2, 20, 14), api.texMat(0x3f9a3a, 'leaves')); crown.position.set(tx, 7.4, tz); crown.scale.y = 0.62; api.add(crown);
    for (let i = 0; i < 12; i++) {                            // twelve manner of fruits
      const f = new T.Mesh(new T.SphereGeometry(0.28, 10, 8), api.mat([0xef4444, 0xf97316, 0xfacc15, 0xa855f7, 0xec4899, 0x22c55e][i % 6]));
      const a = i / 12 * Math.PI * 2; f.position.set(tx + Math.cos(a) * 4.2, 6 + (i % 3) * 0.6, tz + Math.sin(a) * 2.6); api.add(f);
    }
    const throneLight = new T.Mesh(new T.SphereGeometry(4, 20, 14), new T.MeshBasicMaterial({ color: 0xfffbe6, transparent: true, opacity: 0.55, fog: false }));
    throneLight.position.set(0, 6, -46); api.add(throneLight);
    throneLight.userData.sqHalo={color:0xffefc5,scale:11,opacity:.2};
    throneLight.userData.sqRay={position:{x:0,y:16,z:-40},height:15,bottomRadius:4,opacity:.09};
    const glow = new T.PointLight(0xfff4c2, 1.2, 40, 1.2); glow.position.set(0, 6, -40); api.add(glow);

    // --- fragments ---
    // 1: the Fisherman nets one from the river
    api.fragment({ x: 0, z: 30, y: 0.2, net: true });
    // 2: Jacob's pillar (only the Scribe jumps that high), near the start
    api.box({ x: 12, z: 32, w: 2.4, d: 2.4, h: 5, color: 0x9a8f80, house: false });
    api.box({ x: 9.6, z: 34.4, w: 1.6, d: 1.6, h: 2.0, color: 0x8b6b45, house: false });
    api.fragment({ x: 12, z: 32, y: 5 + 1.3 });
    // 3: the Builder makes steps up onto the tomb
    [[-10, -11.4, 1.2], [-12.6, -12.6, 2.2]].forEach(([x, z, top]) => LIFE.steps.push(api.box({ x, z, w: 1.6, d: 1.6, h: 0.35, y: top - 0.35, hidden: true, color: 0xa0703c })));
    const planks = new T.Mesh(new T.BoxGeometry(1.4, 0.4, 2), api.mat(0xa0703c)); planks.position.set(-14, 0.2, -9); api.add(planks);
    api.interact({
      x: -14, z: -9, r: 2.2, label: 'Build steps',
      can: (p) => (p.role.id === 'builder' ? true : 'Some planks. The Builder could make steps up onto the tomb (Tab / RB to switch).'),
      use(p) { this.remove(); planks.visible = false; LIFE.steps.forEach((s) => s.show(true)); api.sfx('build'); api.servant(p, 3); }
    });
    api.fragment({ x: -10, z: -16.6, y: 3.2 + 1.3 });

    // --- Golden Scroll course: a garden of floating islands on the east ---
    api.course([
      { x: 16.4, z: 26, top: 1.1, kind: 'block' },
      { x: 17.0, z: 22.8, top: 2.1, kind: 'float' },
      { x: 16.4, z: 19.6, top: 3.0, kind: 'float' },
      { x: 17.0, z: 16.4, top: 3.8, kind: 'float' },
      { x: 16.4, z: 13.2, top: 4.6, kind: 'crumble' },
      { x: 17.0, z: 10.0, top: 5.0, kind: 'spring' },
      { x: 16.4, z: 6.8, top: 9.2, kind: 'float' },
      { x: 17.0, z: 3.6, top: 9.8, kind: 'float' },
      { x: 16.4, z: 0.4, top: 10.4, kind: 'float' }
    ]);

    [[-14, 40], [14, 42], [-15, 8], [14, -4], [-15, -30], [14, -32], [-6, 42], [6, 26]].forEach(([x, z], i) => api.tree(x, z, 1 + (i % 3) * 0.15, [0x4ade80, 0xf9a8d4, 0x86efac][i % 3]));
    api.leaves([[0, 40], [-3, 36], [-6, 32], [-7.6, 23.4, 0.8], [-7.6, 21.4, 1.6], [-11, 24, 2.4], [-3, 18], [6, 15], [3, 8], [-9, 2, 0.8],
      [-10.6, 0.4, 1.6], [0, -2], [0, -8, 0.5], [-5, -12], [0, -18], [0, -22], [-2, -28], [2, -28]]);
  },

  update(api, dt) {
    LIFE.marks.forEach((m) => {
      if (m.seen) return;
      if (m.name === 'boat') { m.x = LIFE.boat.pos.x; m.z = LIFE.boat.pos.z; }   // (you have to be in the boat)
      const p = api.activePlayers().find((q) => Math.hypot(q.pos.x - m.x, q.pos.z - m.z) < m.r && q.pos.y > m.minY);
      if (!p) return;
      m.seen = true;
      api.task('marks'); api.servant(p, 3); api.sfx('coin');
      api.puff(m.x, (m.minY > 0 ? m.minY : 0) + 1.5, m.z, 0xfde68a, 16);
      if (api.taskCount('marks') === 1) api.toast('🗺️ Remember? God kept every promise, all the way through the Bible.', 3800);
    });
    if (!LIFE.sawGate && api.near(LIFE.GATE[0], LIFE.GATE[1] + 5, 4).length) {
      LIFE.sawGate = true;
      LIFE.gateZone.show(true);
      api.story([
        { art: '🚪', title: 'All things new', text: 'And he that sat upon the throne said, Behold, I make all things new.', ref: 'Revelation 21:5' }
      ], () => api.toast('🚪 The way to the tree of life was shut since the garden (Genesis 3:24). Now it stands open. Walk through!', 4500));
    }
  },

  objective(api) {
    const ps = api.activePlayers();
    if (!ps.length) return null;
    const cx = ps.reduce((s, p) => s + p.pos.x, 0) / ps.length, cz = ps.reduce((s, p) => s + p.pos.z, 0) / ps.length;
    const m = LIFE.marks.filter((k) => !k.seen && k.z < cz + 6).sort((a, b) => b.z - a.z)[0] || LIFE.marks.filter((k) => !k.seen)[0];
    if (m) return [m.x, Math.max(0, m.minY) + 2, m.z];
    if (!api.taskDone('gate')) return [LIFE.GATE[0], 1.5, LIFE.GATE[1]];
    return [LIFE.TREE[0], 1.5, LIFE.TREE[1] + 4];
  },

  finale: {
    message: '🌳 Everyone gather at the tree of life!',
    beacon: [0, 3, -30],
    inZone(p) { return Math.hypot(p.pos.x - LIFE.TREE[0], p.pos.z - (LIFE.TREE[1] + 3)) < 6; },
    onUpdate(api, t) {
      if (t > 0.5 && !LIFE.told) {
        LIFE.told = true;
        api.story([
          { art: '🌳', title: 'The river and the tree', text: 'And he shewed me a pure river of water of life, clear as crystal, proceeding out of the throne of God and of the Lamb. In the midst of the street of it, and on either side of the river, was there the tree of life, which bare twelve manner of fruits, and yielded her fruit every month: and the leaves of the tree were for the healing of the nations.', ref: 'Revelation 22:1–2' },
          { art: '💛', title: 'From the garden to the garden', text: 'In the first garden the way to the tree of life was shut. Jesus, the Lamb, opened it. We don\'t earn it with points: it is God\'s gift to everyone who trusts Him.' },
          { art: '✨', title: 'No more curse', text: 'And there shall be no more curse: but the throne of God and of the Lamb shall be in it; and his servants shall serve him:', ref: 'Revelation 22:3' },
          { art: '🙏', title: 'Come, Lord Jesus', text: 'He which testifieth these things saith, Surely I come quickly. Amen. Even so, come, Lord Jesus.', ref: 'Revelation 22:20' },
          { art: '💛', title: 'For God so loved the world', text: 'For God so loved the world, that he gave his only begotten Son, that whosoever believeth in him should not perish, but have everlasting life.', ref: 'John 3:16' }
        ], () => { LIFE.endT = api.time; api.sfx('win'); });
      }
      return LIFE.endT !== undefined && api.time - LIFE.endT > 2;
    }
  }
};
