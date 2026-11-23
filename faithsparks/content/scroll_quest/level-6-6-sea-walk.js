/* =====================================================================
 * LEVEL 6-6: BE NOT AFRAID  (Matthew 14:22-33; Mark 6:45-52)
 * ---------------------------------------------------------------------
 * One imagined, enlarged deck course on the Sea of Galilee after the feeding of the five thousand:
 *   Aft deck   (z 74..30)  tie the barrels; hop / weave past cargo; climb to tie the rolled sail
 *   Stern      (z 30..14)  sheltered landing, optional rigging route
 *   Midships   a moving plank crosses the gap between the two decks
 *   Bow        (z 4..-10)  tie the nets, then gather under the shelter
 * Jesus comes on the water, Peter steps out and is caught, the wind stops: all told on cards. The players
 * never leave the boat and never walk on the water. Jesus is shown only as a far light on the waves.
 * Only edit THIS file to change the level. See GEMINI.md and CAMPAIGN.md.
 * ===================================================================== */

const WAVES = {
  ties: [],
  steps: [],
  SHELTER: [0, -1],
  DECK: 1.2,
  gustT: 0, gustOn: 0, saidGust: false,
  calm: false,
  told: false,
  light: null,
  sternReached: false, bowReached: false
};

const LEVEL = {
  id: '6-6',
  bibleConnection: {"passage": "Matthew 14:22–33", "text": "Jesus walked on the sea and saved Peter when he began to sink. Our big deck course and tie-down jobs are imagined. Jesus is shown as a far light."},
  world: 'World 6-6',
  title: 'Be Not Afraid',
  time: 'storm',
  leafIcon: '⭐',
  leafColor: 0xfde68a,
  spawn: [0, 70],
  bounds: { minX: -12, maxX: 12, minZ: -14, maxZ: 76 },
  rim: false,
  decor: false,
  startMessage: 'Follow the stars. Use the special action to tie three loads, then meet at the bow shelter.',

  intro: [
    { text: 'But the ship was now in the midst of the sea, tossed with waves: for the wind was contrary.', ref: 'Matthew 14:24' },
    { text: 'Be of good cheer; it is I; be not afraid.', ref: 'Matthew 14:27' }
  ],

  introStory: [
    { art: '⛰️', title: 'Jesus went up to pray', text: 'After feeding the five thousand, Jesus sent His disciples across the lake. He went up the mountain alone to pray (Matthew 14:22–23).' },
    { art: '🌊', title: 'The wind was contrary', text: 'But the ship was now in the midst of the sea, tossed with waves: for the wind was contrary.', ref: 'Matthew 14:24' },
    { art: '🪢', title: 'Just for our game', text: 'Hop the cargo and tie three loads. Our deck course is imagined. Jesus walked on the sea and saved Peter.' }
  ],

  tasks: [
    { id: 'tie', icon: '🪢', label: 'Tie down the loose supplies', total: 3 },
    { id: 'shelter', icon: '⛺', label: 'Gather under the shelter', total: 1, lockedUntil: 'tie' }
  ],

  memoryVerse: { text: 'But straightway Jesus spake unto them, saying, Be of good cheer; it is I; be not afraid.', ref: 'Matthew 14:27' },

  ending: {
    verse: { text: 'Of a truth thou art the Son of God.', ref: 'Matthew 14:33' },
    message: 'In the storm, Jesus came to His friends. When Peter began to sink, Jesus caught him. He is with us when we are afraid.'
  },

  quiz: [
    { q: 'What did Jesus say to the frightened disciples?', ref: 'Matthew 14:27', options: ['"Row harder"', '"Be of good cheer; it is I; be not afraid"', '"Go home"'], answer: 1, explain: 'Jesus said, “It is I; be not afraid.” They could trust Him.' },
    { q: 'What happened when Peter saw the wind?', ref: 'Matthew 14:30', options: ['He was afraid and began to sink', 'He flew', 'He fell asleep'], answer: 0, explain: 'Peter saw the wind, was afraid and began to sink. He cried, “Lord, save me.”' },
    { q: 'What did Jesus do when Peter cried "Lord, save me"?', ref: 'Matthew 14:31', options: ['He stretched forth His hand and caught him', 'He walked away', 'He waited'], answer: 0, explain: 'Jesus immediately reached out and caught Peter.' }
  ],

  music: {
    bpm: 88,
    notes: [57, 0, 60, 64, 62, 0, 60, 59, 57, 0, 55, 0, 57, 0, 0, 0,
            57, 0, 60, 64, 65, 0, 64, 62, 60, 59, 57, 0, 57, 0, 0, 0],
    bass: [45, 45, 41, 41, 43, 43, 40, 40]
  },

  // The solid wooden hull supplies the deck. Keep seabed terrain below it to avoid flickering blue faces.
  terrain() { return -3; },
  groundColor() { return 0x1e3a5f; },

  /* ---------- build ---------- */
  build(api) {
    const T = api.THREE;
    const D = WAVES.DECK;
    const water = new T.Mesh(new T.PlaneGeometry(80, 140), new T.MeshLambertMaterial({ color: 0x24507a, transparent: true, opacity: 0.92 }));
    water.rotation.x = -Math.PI / 2; water.position.set(0, -0.2, 30); api.add(water); WAVES.water = water;
    api.hazard({ x: 0, z: 31, w: 40, d: 106 }, { maxY: -0.5, msg: 'Overboard! Your friends pull you back in.' });

    // --- one long aft / stern deck, the bow and the moving plank between ---
    // Thin solid decks stay opaque: a tall api.box hull would use the engine's wall fade
    // and turn see-through under the lower four-player camera. The submerged hull is decoration.
    const deck = (z, d) => {
      api.box({ x: 0, z, w: 9, d, y: D - 0.5, h: 0.5, color: 0x7a4a24, tex: 'wood', house: false });
      const hull = new T.Mesh(new T.BoxGeometry(9, 3 + D - 0.5, d), api.texMat(0x7a4a24, 'wood'));
      hull.position.set(0, (-3 + D - 0.5) / 2, z); hull.castShadow = true; hull.receiveShadow = true; api.add(hull);
    };
    deck(44, 60);   // aft / stern deck z 14..74
    deck(-3, 14);   // bow deck z -10..4
    const rail = (x, z, w, d) => api.box({ x, z, w, d, y: D, h: 0.9, color: 0x5b3a1e, tex: 'wood', house: false });
    rail(-4.4, 44, 0.25, 60); rail(4.4, 47, 0.25, 54); rail(0, 73.9, 9, 0.25);                    // (a gap on the right of the stern: the course)
    rail(-4.4, -3, 0.25, 14); rail(4.4, -3, 0.25, 14); rail(-2.6, -9.9, 4, 0.25); rail(2.6, -9.9, 4, 0.25);   // (a gap at the very bow)
    WAVES.plank = api.mover({ w: 3, h: 0.4, d: 10.6, color: 0x8b5e34, path: [[-2.4, D - 0.4, 9], [2.4, D - 0.4, 9]], speed: 1.2, wait: 1.4 });
    api.camZone({ minX: -5, maxX: 5, minZ: 3, maxZ: 15, yaw: 0.35, height: 8, back: 12, focus: [0, D, 6], pull: 0.4 });
    const mast = new T.Mesh(new T.CylinderGeometry(0.16, 0.2, 9, 8), api.mat(0x5b3a1e)); mast.position.set(0, D + 4.5, 18); api.add(mast);

    // Longer deck route: low cargo, two clear lanes and one broad raised sail station.
    // A missed cargo jump lands on deck. The glow of each lantern marks the next safe landing.
    [[-1.7, 57, 5.1, 2.4, 1.05], [1.7, 50, 5.1, 2.4, 1.05],
     [1.9, 44.5, 3.4, 3, 0.5], [0, 39.5, 8.4, 5, 1.1], [-1.9, 34.5, 3.4, 3, 0.5]]
      .forEach(([x, z, w, d, h]) => api.box({ x, z, w, d, y: D, h, color: 0x876039, tex: 'wood', house: false }));
    const lantern = (x, z, top) => {
      const base = new T.Mesh(new T.BoxGeometry(0.45, 0.12, 0.45), api.mat(0x543a21));
      base.position.set(x, top + 0.12, z); api.add(base);
      const lamp = new T.Mesh(new T.SphereGeometry(0.18, 8, 6), new T.MeshBasicMaterial({ color: 0xffd482 }));
      lamp.position.set(x, top + 0.4, z); api.add(lamp);
    };
    [[-3.7, 68, D], [3.5, 57, D], [-3.5, 50, D], [3.3, 39.5, D + 1.1], [-3.3, 31, D]]
      .forEach(([x, z, top]) => lantern(x, z, top));
    api.camZone({ minX: -5, maxX: 5, minZ: 31, maxZ: 74, yaw: 0.15, height: 9, back: 13, pull: 0.35 });

    // A small streamer warns before each gust; the tied-load rings are calm work spots.
    WAVES.flag = new T.Mesh(new T.PlaneGeometry(0.8, 0.3), new T.MeshBasicMaterial({ color: 0x92c1d1, side: T.DoubleSide }));
    WAVES.flag.position.set(-3.8, D + 2.4, 60); api.add(WAVES.flag);
    const flagPole = new T.Mesh(new T.CylinderGeometry(0.05, 0.05, 2.6, 6), api.mat(0x694b2a));
    flagPole.position.set(-4.15, D + 1.3, 60); api.add(flagPole);

    // --- three things to tie down ---
    const tie = (x, z, top, what) => {
      const g = new T.Group();
      if (what === 'barrels') [-0.4, 0.4].forEach((dx) => { const b = new T.Mesh(new T.CylinderGeometry(0.35, 0.35, 0.8, 10), api.texMat(0x8b5e34, 'wood')); b.position.set(dx, top + 0.4, 0); g.add(b); });
      else if (what === 'sail') { const s = new T.Mesh(new T.BoxGeometry(1.4, 0.3, 0.9), api.texMat(0xe7e5e4, 'cloth')); s.position.y = top + 0.15; g.add(s); }
      else { const n = new T.Mesh(new T.SphereGeometry(0.5, 10, 8), api.texMat(0xd6cfc0, 'weave')); n.scale.y = 0.5; n.position.y = top + 0.25; g.add(n); }
      g.position.set(x, 0, z); api.add(g);
      const Tt = { x, z, top, done: false, g };
      Tt.zone = api.zone({ x, z, y: top, r: 1.6, vRange: 0.6, time: 1.4, action: 'Tie the '+what, color: 0xfacc15, onDone(helpers) { Tt.done = true; api.task('tie'); helpers.forEach((p) => api.servant(p, 3, 'for keeping the boat safe!')); api.sfx('build'); } });
      WAVES.ties.push(Tt);
    };
    tie(0, 64, D, 'barrels');
    api.box({ x: -2.4, z: 0.6, w: 2.6, d: 2.6, y: D, h: 1.0, color: 0x6b4f2a, tex: 'wood', house: false });   // the cargo hatch
    api.box({ x: -0.6, z: 2.6, w: 1.4, d: 1.2, y: D, h: 0.5, color: 0x8b6b45, house: false });
    tie(0, 39.5, D + 1.1, 'sail');
    tie(0, -8.6, D, 'nets');
    // the shelter in the middle of the bow deck
    const roof = new T.Mesh(new T.BoxGeometry(4, 0.15, 3), api.texMat(0xd6cfc0, 'cloth')); roof.position.set(WAVES.SHELTER[0] + 1.6, D + 2.4, WAVES.SHELTER[1] - 2.4); api.add(roof);
    WAVES.shelterZone = api.zone({ x: WAVES.SHELTER[0] + 1.6, z: WAVES.SHELTER[1] - 2.4, y: D, r: 1.6, time: 0.4, color: 0xfde68a, hidden: true,
      onDone(helpers) { api.task('shelter'); helpers.forEach((p) => api.servant(p, 2)); } });
    // the disciples aboard
    [[-2.6, 20], [2.6, 16], [-2, -6], [2.6, -4]].forEach(([x, z], i) => { const m = api.crowdPerson(i + 150, [0x7c2d12, 0x166534, 0x1e3a8a, 0x57534e][i], 0xe7e5e4); m.position.set(x, D, z); api.add(m); });
    // a far light on the waves (shown only in the finale)
    const L = new T.Mesh(new T.SphereGeometry(0.9, 14, 10), new T.MeshBasicMaterial({ color: 0xfffbe6, transparent: true, opacity: 0.85, fog: false }));
    L.position.set(-14, 0.8, -26); L.visible = false; api.add(L); WAVES.light = L;
    WAVES.glow = new T.PointLight(0xfff4c2, 0, 22, 1.4); api.add(WAVES.glow);

    // --- fragments ---
    api.fragment({ x: 6.6, z: -2, y: 0.2, net: true });                                       // in the water by the bow (the Fisherman's net)
    api.box({ x: -2.6, z: 10.6, w: 1.6, d: 1.6, y: D, h: 1.0, color: 0x6b4f2a, house: false });   // (from the stern: a crate, then the lookout: only the Scribe)
    api.box({ x: -2.6, z: 15.6, w: 2, d: 2, y: D, h: 5.0, color: 0x5b3a1e, tex: 'wood', house: false });
    api.box({ x: -2.6, z: 13.4, w: 1.6, d: 1.6, y: D, h: 2.0, color: 0x6b4f2a, house: false });
    api.fragment({ x: -2.6, z: 15.6, y: D + 5 + 1.3 });
    [[2.8, -6.6, D + 1.2], [2.8, -4.6, D + 2.3]].forEach(([x, z, top]) => WAVES.steps.push(api.box({ x, z, w: 1.4, d: 1.4, h: 0.35, y: top - 0.35, hidden: true, color: 0xa0703c })));
    api.box({ x: 2.8, z: -2.2, w: 1.6, d: 1.6, y: D, h: 3.4, color: 0x5b3a1e, tex: 'wood', house: false });   // the bow lookout
    const planks = new T.Mesh(new T.BoxGeometry(1.2, 0.3, 1.6), api.mat(0xa0703c)); planks.position.set(-2.8, D + 0.15, -6); api.add(planks);
    api.interact({
      x: -2.8, z: -6, y: D, r: 2.0, label: 'Build steps',
      can: (p) => (p.role.id === 'builder' ? true : 'Some planks. The Builder could make steps up the bow lookout (Tab / RB to switch).'),
      use(p) { this.remove(); planks.visible = false; WAVES.steps.forEach((s) => s.show(true)); api.sfx('build'); api.servant(p, 3); }
    });
    api.fragment({ x: 2.8, z: -2.2, y: D + 3.4 + 1.3 });

    // --- Golden Scroll course: out over the waves from the stern and up the rigging ---
    api.course([
      { x: 3.4, z: 17.4, top: D + 1.1, kind: 'block' }, { x: 6.2, z: 17.4, top: D + 2.1, kind: 'float' }, { x: 8.8, z: 19.4, top: D + 3.0, kind: 'crumble' },
      { x: 8.8, z: 22.6, top: D + 3.8, kind: 'float' }, { x: 6.4, z: 24.8, top: D + 4.6, kind: 'crumble' }, { x: 6.4, z: 28, top: D + 5.0, kind: 'spring' },
      { x: 3.6, z: 29.6, top: D + 9.2, kind: 'float' }, { x: 0.8, z: 28.2, top: D + 9.8, kind: 'crumble' }, { x: 0, z: 25, top: D + 10.4, kind: 'float' }
    ]);
    api.leaves([[0, 68, D], [0, 66, D], [0, 61, D], [2.8, 57, D], [0, 54, D], [-2.8, 50, D],
      [1.9, 44.5, D + 0.5], [0, 41, D + 1.1], [-1.9, 34.5, D + 0.5], [0, 31, D], [0, 28, D], [0, 24, D], [0, 20, D], [0, 15, D], [0, 9, D], [0, 2, D], [-0.6, 2.6, D + 0.5], [0, -4, D], [0, -8, D]]);
  },

  update(api, dt) {
    // the wind: a gust every few seconds pushes across the deck (Breastplate stands firm; railings hold you)
    if (!WAVES.calm) {
      WAVES.gustT += dt;
      if (WAVES.gustT > 4.5) { WAVES.gustT = 0; WAVES.gustOn = 1.4; if (!WAVES.saidGust) { WAVES.saidGust = true; api.toast('🌬️ A gust! The railings hold you.', 2500); } }
      if (WAVES.gustOn > 0) {
        WAVES.gustOn -= dt;
        api.activePlayers().forEach((p) => { const working = WAVES.ties.some((t) => !t.done && Math.hypot(p.pos.x - t.x, p.pos.z - t.z) < 1.8 && Math.abs(p.pos.y - t.top) < 0.6);
          if (p.pos.y > WAVES.DECK - 0.3 && !working) api.push(p, -2.4, 0, dt); });
      }
      const warning = WAVES.gustT > 3.7 && WAVES.gustOn <= 0;
      WAVES.flag.material.color.setHex(warning ? 0xfbbf24 : 0x92c1d1);
      WAVES.flag.rotation.y = WAVES.gustOn > 0 ? Math.sin(api.time * 12) * 0.5 : 0;
      WAVES.water.position.y = -0.2 + Math.sin(api.time * 1.3) * 0.08;
    }
    // Progress checkpoints only advance on real visits to dry, stable deck.
    const grounded = api.activePlayers().filter((p) => p.onGround && !p.carriedBy && Math.abs(p.pos.x) < 3.4 && Math.abs(p.pos.y - WAVES.DECK) < 0.3);
    if (!WAVES.sternReached && grounded.some((p) => p.pos.z < 31 && p.pos.z > 20)) {
      WAVES.sternReached = true; api.checkpoint({ x: 0, z: 28, y: WAVES.DECK, label: 'Stern deck' });
    }
    if (!WAVES.bowReached && grounded.some((p) => p.pos.z < 3 && p.pos.z > -2)) {
      WAVES.bowReached = true; api.checkpoint({ x: 0, z: 2.5, y: WAVES.DECK, label: 'Bow deck' });
    }
    if (!WAVES.saidTied && api.taskDone('tie')) { WAVES.saidTied = true; WAVES.shelterZone.show(true); api.toast('⛺ All tied! Meet at the bow shelter.', 3000); }
    if (WAVES.light.visible) {
      const k = Math.min(1, (api.time - WAVES.lightT) / 5);
      WAVES.light.position.set(-14 + k * 8, 0.8 + Math.sin(api.time * 2) * 0.1, -26 + k * 14);
      WAVES.glow.position.copy(WAVES.light.position); WAVES.glow.position.y += 1.5; WAVES.glow.intensity = 1.8;
    }
  },

  objective(api) {
    const t = WAVES.ties.find((k) => !k.done);
    if (t) return [t.x, t.top + 1.5, t.z];
    return [WAVES.SHELTER[0] + 1.6, WAVES.DECK + 1.5, WAVES.SHELTER[1] - 2.4];
  },

  finale: {
    message: '⛺ Meet at the bow shelter.',
    beacon: [1.6, 3, -3.4],
    inZone(p) { return Math.hypot(p.pos.x - (WAVES.SHELTER[0] + 1.6), p.pos.z - (WAVES.SHELTER[1] - 2.4)) < 4 && p.pos.y > WAVES.DECK - 0.3; },
    onUpdate(api, t) {
      if (t > 0.3 && !WAVES.light.visible) { WAVES.light.visible = true; WAVES.lightT = api.time; }
      if (t > 2.5 && !WAVES.told) {
        WAVES.told = true;
        api.story([
          { art: '🌊', title: 'Walking on the sea', text: 'And in the fourth watch of the night Jesus went unto them, walking on the sea. And when the disciples saw him walking on the sea, they were troubled, saying, It is a spirit; and they cried out for fear.', ref: 'Matthew 14:25–26' },
          ...(api.shownRef('Matthew 14:27') ? [] : [{ art: '💛', title: 'It is I', text: 'But straightway Jesus spake unto them, saying, Be of good cheer; it is I; be not afraid.', ref: 'Matthew 14:27' }]),
          { art: '🤝', title: 'Lord, save me', text: 'Peter walked toward Jesus on the sea. He saw the wind, was afraid and began to sink. He cried, "Lord, save me." Jesus immediately caught him and asked why he doubted (Matthew 14:28–31).' },
          { art: '🙏', title: 'The Son of God', text: 'And when they were come into the ship, the wind ceased. Then they that were in the ship came and worshipped him, saying, Of a truth thou art the Son of God.', ref: 'Matthew 14:32–33' }
        ], () => { WAVES.calm = true; WAVES.endT = api.time; api.sfx('win'); });
      }
      return WAVES.endT !== undefined && api.time - WAVES.endT > 2;
    }
  }
};
