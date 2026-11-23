/* =====================================================================
 * LEVEL 5-4: WOUNDED FOR US  (Isaiah 6, 9, 53)
 * ---------------------------------------------------------------------
 * Jerusalem at sunset. Walk toward -z:
 *   The temple   (z 42..16)  climb the great steps to the porch: Isaiah's vision (told on cards,
 *                            God is not shown): "Here am I; send me" (Isaiah 6:8)
 *   The rooftops (z 12..-20) carry God's message (one scroll) over the roofs: the deep valley
 *                            across the city is crossed only on the rooftops and two floating planks;
 *                            light three lamps on the way (Isaiah 9:2)
 *   The scribes  (0, -32)    they write it down "for the time to come" (Isaiah 30:8): Isaiah 53
 * Two different things: the vision (Isaiah 6) and the prophecy, written 700 years before Jesus, of the
 * Servant who would be wounded for us (Isaiah 53). Thread: 7-4 the cross; 8-3 Philip reads Isaiah 53.
 * Only edit THIS file to change the level. See GEMINI.md and CAMPAIGN.md.
 * ===================================================================== */

const ISA = {
  scroll: null,
  lamps: [],
  steps: [],
  PORCH: [0, 23.5],
  SCRIBES: [0, -27.5],
  VALLEY: -9,
  saw: false,
  wrote: false,
  told: false
};

const LEVEL = {
  id: '5-4',
  bibleConnection: {"passage": "Isaiah 53", "text": "Isaiah foretold the Servant who would suffer and bear sins. Christians recognize this fulfilled in Jesus’ death and victory. Our lamps, rooftops and scroll delivery are imagined ways of carrying the message; they do not cause the prophecy."},
  world: 'World 5-4',
  title: 'Wounded for Us',
  time: 'sunset',
  town: true,
  leafIcon: '🕯️',
  leafColor: 0xfde68a,
  spawn: [0, 43],
  bounds: { minX: -19, maxX: 19, minZ: -40, maxZ: 46 },
  approach: ['stones', 'crumbles', 'log'],   // the way in (engine): a stretch before the level's own start
  startMessage: 'Climb the great steps of the temple in Jerusalem, where Isaiah the prophet worshipped.',

  intro: [
    { text: 'In the year that king Uzziah died I saw also the Lord sitting upon a throne, high and lifted up, and his train filled the temple.', ref: 'Isaiah 6:1' },
    { text: 'But he was wounded for our transgressions, he was bruised for our iniquities: the chastisement of our peace was upon him; and with his stripes we are healed.', ref: 'Isaiah 53:5' }
  ],

  introStory: [
    { art: '🏛️', title: 'Isaiah, God\'s messenger', text: 'Long ago a man named Isaiah lived in Jerusalem. God gave him a vision, and then many messages for His people, even about a Saviour who would come hundreds of years later.' },
    { art: '👑', title: 'High and lifted up', text: 'In the year that king Uzziah died I saw also the Lord sitting upon a throne, high and lifted up, and his train filled the temple.', ref: 'Isaiah 6:1' }
  ],

  tasks: [
    { id: 'vision', icon: '🏛️', label: 'Go up to the temple porch', total: 1 },
    { id: 'lamps', icon: '🪔', label: 'Light the lamps on the way', total: 3 },
    { id: 'scroll', icon: '📜', label: 'Carry God\'s message to the scribes', total: 1, lockedUntil: 'vision' }
  ],

  memoryVerse: { text: 'But he was wounded for our transgressions, he was bruised for our iniquities: the chastisement of our peace was upon him; and with his stripes we are healed.', ref: 'Isaiah 53:5' },

  ending: {
    verse: { text: 'All we like sheep have gone astray; we have turned every one to his own way; and the LORD hath laid on him the iniquity of us all.', ref: 'Isaiah 53:6' },
    message: 'Hundreds of years before Jesus was born, God told Isaiah that His Servant would be wounded for our sins. Jesus did it, for us.'
  },

  quiz: [
    { q: 'What did Isaiah say when God asked "Whom shall I send"?', ref: 'Isaiah 6:8', options: ['"Not me"', '"Here am I; send me"', '"Send my brother"'], answer: 1 },
    { q: 'Isaiah 53 says the Servant was wounded for what?', ref: 'Isaiah 53:5', options: ['For our transgressions', 'For a battle', 'For gold'], answer: 0 },
    { q: 'Who did the Servant of Isaiah 53 turn out to be?', ref: '1 Peter 2:24', options: ['King Uzziah', 'Jesus', 'Isaiah'], answer: 1 }
  ],

  music: {
    bpm: 80,
    notes: [64, 0, 67, 0, 71, 0, 69, 67, 64, 0, 62, 0, 64, 0, 0, 0,
            64, 0, 67, 0, 72, 0, 71, 69, 67, 0, 66, 0, 64, 0, 0, 0],
    bass: [52, 52, 48, 48, 45, 45, 47, 47]
  },

  /* ---------- ground: the city, a deep valley across it ---------- */
  terrain(x, z) {
    let h = Math.sin(x * 0.31) * Math.cos(z * 0.23) * 0.08;
    const v = Math.abs(z - ISA.VALLEY);
    if (v < 3) h -= 3.2 * Math.min(1, (3 - v) / 0.8);
    return h;
  },

  groundColor(x, z, h) {
    if (h < -1.5) return 0x5b4a3a;                                         // the valley floor
    if (z > 14) return (Math.floor(x / 2) + Math.floor(z / 2)) % 2 ? 0xe2d6bc : 0xd8cbb0;   // temple paving
    return (Math.floor(x / 1.5) + Math.floor(z / 1.5)) % 2 ? 0xc4ad86 : 0xb9a17b;        // city street
  },

  /* ---------- build ---------- */
  build(api) {
    const T = api.THREE;

    // --- the temple: great steps up to the porch, the house beyond ---
    api.box({ x: 0, z: 30, w: 14, d: 3, h: 1.0, color: 0xe7e0cf, house: false });
    api.box({ x: 0, z: 27.5, w: 12, d: 2.2, h: 2.0, color: 0xe7e0cf, house: false });
    api.box({ x: 0, z: 23.4, w: 10, d: 6, h: 3.0, color: 0xe7e0cf, house: false });
    api.box({ x: 0, z: 15.4, w: 12, d: 10, h: 8, color: 0xd6c9a8, house: false, tex: 'stone' });
    [[-2.6, 20.6], [2.6, 20.6]].forEach(([x, z]) => {                    // the two bronze pillars
      const c = new T.Mesh(new T.CylinderGeometry(0.5, 0.5, 4.4, 14), api.mat(0xb87333)); c.position.set(x, 3 + 2.2, z); api.add(c);
    });
    const isaiah = api.person(0x1e3a8a, 0xe7e5e4, 1, { beard: true }); isaiah.position.set(-2.2, 3, 24.6); api.add(isaiah);
    ISA.visionZone = api.zone({
      x: ISA.PORCH[0], z: ISA.PORCH[1] + 1, y: 3, r: 1.8, time: 1.2, color: 0xfde68a,
      onDone(helpers) { api.task('vision'); helpers.forEach((p) => api.servant(p, 3)); LEVEL._vision(api); }
    });

    // --- God's message: one scroll, carried over the rooftops ---
    const sc = new T.Group();
    const roll = new T.Mesh(new T.CylinderGeometry(0.16, 0.16, 0.8, 10), api.mat(0xf5e6c4)); roll.rotation.z = Math.PI / 2; sc.add(roll);
    [-0.44, 0.44].forEach((x) => { const k = new T.Mesh(new T.CylinderGeometry(0.06, 0.06, 0.5, 8), api.mat(0x6e4720)); k.position.x = x; sc.add(k); });
    ISA.scroll = api.carryable({
      x: 1.4, z: 23, mesh: sc, name: 'scroll', to: 'the scribes',
      deliverTo: { x: ISA.SCRIBES[0], z: ISA.SCRIBES[1], r: 2.6 },
      onDeliver(p) { api.task('scroll'); api.servant(p, 6, 'for carrying God\'s word!'); LEVEL._write(api); }
    });
    ISA.scroll.blocked = () => 'Go up to the temple porch first.';
    ISA.scroll.mesh.visible = false;

    // --- the rooftops over the valley ---
    const house = (x, z, w, d, h) => api.box({ x, z, w, d, h, color: 0xd1bb92 });
    house(-9, -2.5, 6, 5, 3);                                    // north of the valley
    api.box({ x: -4.6, z: 0.6, w: 1.6, d: 1.6, h: 1.1, color: 0x8b6b45 });
    api.box({ x: -4.6, z: -1.4, w: 1.6, d: 1.6, h: 2.1, color: 0x8b6b45 });
    api.box({ x: -9, z: -7.6, w: 2, d: 2, h: 0.4, y: 2.8, color: 0xb59a6d });   // two planks over the valley
    api.box({ x: -9, z: -10.6, w: 2, d: 2, h: 0.4, y: 2.8, color: 0xb59a6d });
    house(-9, -15.5, 6, 5, 3);                                   // south of the valley
    api.box({ x: -4.6, z: -17, w: 1.6, d: 1.6, h: 1.6, color: 0x8b6b45 });   // a step down
    api.hazard({ x: 0, z: ISA.VALLEY, w: 40, d: 5 }, { maxY: -1.4, msg: 'Down in the valley! Cross on the rooftops and the planks.' });
    api.camZone({ minX: -14, maxX: -3, minZ: -19, maxZ: 2, yaw: -0.55, height: 9, back: 13, focus: [-9, 3, -9], pull: 0.45 });
    // lamps on the way (Isaiah 9:2)
    [[-9, -2.5, 3], [-9, -15.5, 3], [6, -22, 1.4]].forEach(([x, z, top], i) => {
      if (i === 2) api.box({ x, z, w: 2.2, d: 2.2, h: top, color: 0xb8996e, house: false });
      const stand = new T.Mesh(new T.CylinderGeometry(0.08, 0.12, 1.1, 6), api.mat(0x6b4a2b)); stand.position.set(x + 0.7, top + 0.55, z); api.add(stand);
      const flame = new T.Mesh(new T.SphereGeometry(0.17, 8, 6), new T.MeshBasicMaterial({ color: 0x57534e })); flame.position.set(x + 0.7, top + 1.2, z); api.add(flame);
      const L = { x, z, lit: false, flame };
      L.zone = api.zone({ x, z, y: top, r: 1.3, time: 0.8, color: 0xfacc15, onDone(helpers) {
        L.lit = true; flame.material.color.setHex(0xffb347);
        const light = new T.PointLight(0xffb347, 0.9, 8, 2); light.position.set(x + 0.7, top + 1.4, z); api.add(light);
        api.task('lamps'); helpers.forEach((p) => api.servant(p, 2)); api.sfx('coin');
        if (api.taskCount('lamps') === 1) api.toast('🪔 "The people that walked in darkness have seen a great light" (Isaiah 9:2).', 3800);
      } });
      ISA.lamps.push(L);
    });
    // more houses along the street
    [[10, 6, 6, 6, 3.4], [-12, 8, 5, 6, 3.2], [11, -16, 6, 5, 3.2], [-12, -26, 5, 5, 3], [12, -32, 5, 5, 3.4]].forEach(([x, z, w, d, h]) => house(x, z, w, d, h));
    [[4, 2], [-3, -21], [3, -25]].forEach(([x, z]) => api.jars([[x, z]], 'jar'));

    // --- the scribes' house ---
    api.box({ x: 0, z: -33, w: 10, d: 6, h: 3.4, color: 0xd8c39c });
    const table = new T.Mesh(new T.BoxGeometry(2.6, 0.12, 1.1), api.mat(0x7a5230)); table.position.set(0, 0.8, -28.3); api.add(table);
    [[-2.4, -28.6], [2.4, -28.6]].forEach(([x, z], i) => { const m = api.person(i ? 0x57534e : 0x7c2d12, 0xe7e5e4, 1, { beard: true, age: i ? 'elder' : undefined }); m.position.set(x, 0, z); api.add(m); });

    // --- fragments ---
    // 1: the pool of Siloam (the Fisherman nets it)
    const pool = new T.Mesh(new T.CircleGeometry(2.2, 24), new T.MeshLambertMaterial({ color: 0x3b82c4, transparent: true, opacity: 0.85 }));
    pool.rotation.x = -Math.PI / 2; pool.position.set(12, 0.06, 30); api.add(pool);
    api.fragment({ x: 12, z: 30, y: 0.5, net: true });
    // 2: a high terrace of the temple wall (only the Scribe jumps that high)
    api.box({ x: -10.5, z: 26, w: 3, d: 3, h: 5, color: 0xd6c9a8, house: false });
    api.box({ x: -8, z: 28.6, w: 1.6, d: 1.6, h: 2.0, color: 0x8b6b45 });
    api.fragment({ x: -10.5, z: 26, y: 5 + 1.3 });
    // 3: the Builder makes steps up to the scribes' roof
    [[-6.4, -28.6, 1.2], [-6.4, -30.6, 2.3]].forEach(([x, z, top]) => ISA.steps.push(api.box({ x, z, w: 1.6, d: 1.6, h: 0.35, y: top - 0.35, hidden: true, color: 0xa0703c })));
    const planks = new T.Mesh(new T.BoxGeometry(1.4, 0.4, 2), api.mat(0xa0703c)); planks.position.set(-7.4, 0.2, -24.6); api.add(planks);
    api.interact({
      x: -7.4, z: -24.6, r: 2.2, label: 'Build steps',
      can: (p) => (p.role.id === 'builder' ? true : 'Some planks. The Builder could make steps up to the roof (Tab / RB to switch).'),
      use(p) { this.remove(); planks.visible = false; ISA.steps.forEach((s) => s.show(true)); api.sfx('build'); api.servant(p, 3); }
    });
    api.fragment({ x: -2.5, z: -34, y: 3.4 + 1.3 });

    // --- Golden Scroll course along the east side of the temple ---
    api.course([
      { x: 16.4, z: 40, top: 1.1, kind: 'block' },
      { x: 17.0, z: 36.8, top: 2.1, kind: 'float' },
      { x: 16.4, z: 33.6, top: 3.0, kind: 'crumble' },
      { x: 17.0, z: 30.4, top: 3.8, kind: 'float' },
      { x: 16.4, z: 27.2, top: 4.6, kind: 'crumble' },
      { x: 17.0, z: 24.0, top: 5.0, kind: 'spring' },
      { x: 16.4, z: 20.8, top: 9.2, kind: 'float' },
      { x: 17.0, z: 17.6, top: 9.8, kind: 'crumble' },
      { x: 16.4, z: 14.4, top: 10.4, kind: 'float' }
    ]);

    api.leaves([[0, 39], [0, 34], [0, 30, 1], [0, 27.5, 2], [-4, 21, 3], [-7, 14], [-6, 8], [-4.6, 0.6, 1.1], [-4.6, -1.4, 2.1],
      [-9, -5, 3], [-9, -7.6, 3.2], [-9, -10.6, 3.2], [-9, -13, 3], [-4.6, -17, 1.6], [0, -20], [3, -23]]);
  },

  // Isaiah's vision (told, God is not shown): then the scroll can be carried
  _vision(api) {
    api.sfx('fanfare');
    api.story([
      { art: '✨', title: 'Holy, holy, holy', text: 'And one cried unto another, and said, Holy, holy, holy, is the LORD of hosts: the whole earth is full of his glory.', ref: 'Isaiah 6:3' },
      { art: '🙋', title: 'Here am I; send me', text: 'Also I heard the voice of the Lord, saying, Whom shall I send, and who will go for us? Then said I, Here am I; send me.', ref: 'Isaiah 6:8' }
    ], () => {
      ISA.scroll.blocked = null; ISA.scroll.mesh.visible = true;
      api.toast('📜 God gave Isaiah messages to write down (Isaiah 30:8). Our game\'s idea: carry this scroll over the rooftops to the scribes, and light the lamps on the way.', 4500);
    });
  },

  // the scribes write it down: Isaiah 53, the Servant who would be wounded for us
  _write(api) {
    if (ISA.wrote) return; ISA.wrote = true;
    api.story([
      { art: '📜', title: 'Written for the time to come', text: 'But he was wounded for our transgressions, he was bruised for our iniquities: the chastisement of our peace was upon him; and with his stripes we are healed.', ref: 'Isaiah 53:5' },
      { art: '🐑', title: 'Like sheep', text: 'All we like sheep have gone astray; we have turned every one to his own way; and the LORD hath laid on him the iniquity of us all.', ref: 'Isaiah 53:6' }
    ]);
  },

  update(api, dt) {},

  objective(api) {
    const ps = api.activePlayers();
    if (!ps.length) return null;
    if (!api.taskDone('vision')) return [ISA.PORCH[0], 4.5, ISA.PORCH[1] + 1];
    if (ps.some((p) => p.holding === ISA.scroll)) {
      const L = ISA.lamps.find((l) => !l.lit);
      if (L) return [L.x, 4, L.z];
      return [ISA.SCRIBES[0], 1.5, ISA.SCRIBES[1]];
    }
    if (!ISA.scroll.delivered) return [ISA.scroll.x, ISA.scroll.y + 1, ISA.scroll.z];
    const L = ISA.lamps.find((l) => !l.lit);
    if (L) return [L.x, 4, L.z];
    return [ISA.SCRIBES[0], 1.5, ISA.SCRIBES[1]];
  },

  finale: {
    message: '📜 Everyone gather at the scribes\' house!',
    beacon: [0, 3, -27],
    inZone(p) { return Math.hypot(p.pos.x - ISA.SCRIBES[0], p.pos.z - ISA.SCRIBES[1]) < 4.5; },
    onUpdate(api, t) {
      if (t > 0.5 && !ISA.told) {
        ISA.told = true;
        api.story([
          { art: '✝️', title: 'Seven hundred years later', text: 'Isaiah never met the Servant he wrote about. About 700 years later, Jesus came. He took the punishment for our sins on the cross, just as God had said.' },
          { art: '💛', title: 'By His stripes', text: 'Who his own self bare our sins in his own body on the tree, that we, being dead to sins, should live unto righteousness: by whose stripes ye were healed.', ref: '1 Peter 2:24' }
        ], () => { ISA.endT = api.time; api.sfx('win'); });
      }
      return ISA.endT !== undefined && api.time - ISA.endT > 2;
    }
  }
};
