/* =====================================================================
 * LEVEL 8-1: GOOD NEWS FOR MANY NATIONS  (Acts 2)
 * ---------------------------------------------------------------------
 * Jerusalem on the day of Pentecost. Walk toward -z:
 *   The house     (z 46..38)  the disciples' house: the rushing wind and the tongues like fire (cards first)
 *   Three lanes   (z 34..8)   visitors "out of every nation" (Acts 2:5) are spread through the city:
 *                             left over the rooftops and planks, the middle through the market's turning
 *                             beams, the right up a terrace and a slow lift. Run past a visitor and they
 *                             go to hear the good news.
 *   The temple    (z -6..-20) the lanes meet at the great steps; Peter preaches on a temple porch
 *                             (Acts 2 doesn't say where: the place is our game's choice)
 * God sends the Holy Ghost; the players only help visitors find their way. Jesus is not shown.
 * Only edit THIS file to change the level. See GEMINI.md and CAMPAIGN.md.
 * ===================================================================== */

const PENT = {
  visitors: [],
  flames: [],
  steps: [],
  PORCH: [0, -14],
  told: false
};

const LEVEL = {
  id: '8-1',
  bibleConnection: {"passage": "Acts 2", "text": "God poured out His Holy Spirit, people heard in their own languages, and Peter proclaimed the risen Jesus. Our visitor routes explore that gathering. Directing visitors does not cause Pentecost or give players miraculous speech."},
  world: 'World 8-1',
  title: 'Good News for Many Nations',
  town: true,
  leafIcon: '🕊️',
  leafColor: 0xf8fafc,
  spawn: [0, 40],
  bounds: { minX: -19, maxX: 19, minZ: -24, maxZ: 48 },
  approach: ['stones', 'log', 'crumbles'],   // the way in (engine): a stretch before the level's own start
  startMessage: 'Visitors from every nation are in Jerusalem (Acts 2:5). Our game\'s idea: help them find the way to hear the good news!',

  intro: [
    { text: 'And they were all filled with the Holy Ghost, and began to speak with other tongues, as the Spirit gave them utterance.', ref: 'Acts 2:4' },
    { text: 'And it shall come to pass, that whosoever shall call on the name of the Lord shall be saved.', ref: 'Acts 2:21' }
  ],

  introStory: [
    { art: '🌬️', title: 'A rushing mighty wind', text: 'And when the day of Pentecost was fully come, they were all with one accord in one place. And suddenly there came a sound from heaven as of a rushing mighty wind, and it filled all the house where they were sitting.', ref: 'Acts 2:1–2' },
    { art: '🔥', title: 'Tongues like as of fire', text: 'And there appeared unto them cloven tongues like as of fire, and it sat upon each of them. And they were all filled with the Holy Ghost, and began to speak with other tongues, as the Spirit gave them utterance.', ref: 'Acts 2:3–4' }
  ],

  tasks: [
    { id: 'visitors', icon: '🌍', label: 'Help the visitors find the way', total: 6 },
    { id: 'porch', icon: '🏛️', label: 'Climb the temple steps', total: 1 }
  ],

  memoryVerse: { text: 'And it shall come to pass, that whosoever shall call on the name of the Lord shall be saved.', ref: 'Acts 2:21' },

  ending: {
    verse: { text: 'For the promise is unto you, and to your children, and to all that are afar off, even as many as the Lord our God shall call.', ref: 'Acts 2:39' },
    message: 'God poured out His Spirit, and the good news about Jesus began to go to every nation.'
  },

  quiz: [
    { q: 'What sound came from heaven on the day of Pentecost?', ref: 'Acts 2:2', options: ['Thunder', 'A rushing mighty wind', 'Trumpets'], answer: 1 },
    { q: 'How did the visitors hear the disciples speak?', ref: 'Acts 2:6', options: ['Each in his own language', 'Only in Greek', 'In whispers'], answer: 0 },
    { q: 'About how many people were added that day?', ref: 'Acts 2:41', options: ['Twelve', 'About three thousand', 'Five hundred'], answer: 1 }
  ],

  music: {
    bpm: 120,
    notes: [67, 71, 74, 0, 72, 71, 69, 0, 67, 69, 71, 72, 74, 0, 0, 0,
            76, 74, 72, 0, 71, 72, 74, 0, 72, 71, 69, 71, 67, 0, 0, 0],
    bass: [43, 43, 48, 48, 50, 50, 43, 43]
  },

  /* ---------- ground: city lanes and squares ---------- */
  terrain(x, z) { return Math.sin(x * 0.29) * Math.cos(z * 0.23) * 0.08; },
  groundColor(x, z, h) {
    if (z < -5) return (Math.floor(x / 2) + Math.floor(z / 2)) % 2 ? 0xe2d6bc : 0xd8cbb0;     // temple paving
    return (Math.floor(x / 1.5) + Math.floor(z / 1.5)) % 2 ? 0xc4ad86 : 0xb9a17b;            // city lanes
  },

  /* ---------- build ---------- */
  build(api) {
    const T = api.THREE;
    const house = (x, z, w, d, h) => api.box({ x, z, w, d, h, color: 0xd1bb92 });

    // --- the disciples' house; small flames of light over the twelve (shown at the start) ---
    house(0, 46, 10, 4, 3.4);
    for (let i = 0; i < 6; i++) {
      const x = -5 + i * 2, z = 42.6;
      const m = api.person([0x7c2d12, 0x1e3a8a, 0x166534, 0xa16207, 0x6b21a8, 0x9f1239][i], 0xe7e5e4, 1, { beard: i % 2 === 0 });
      m.position.set(x, 0, z); api.add(m);
      const f = new T.Mesh(new T.ConeGeometry(0.16, 0.42, 8), new T.MeshBasicMaterial({ color: 0xfb923c, transparent: true, opacity: 0.9 }));
      f.position.set(x, 2.55, z); api.add(f); PENT.flames.push(f);
      f.userData.sqHalo={color:0xffaf55,scale:.85,opacity:.22,pulseSpeed:3};
    }
    api.armor('sword', 0, 37);                       // the sword of the Spirit, which is the word of God

    // --- the house rows between the three lanes (alleys let you cross) ---
    [[-5, 30], [-5, 21.5], [-5, 13], [5, 30], [5, 21.5], [5, 13]].forEach(([x, z]) => house(x, z, 3, 6, 3.2));

    // a visitor: stands in the lane; runs off to the temple when someone passes
    const visitor = (x, z, i) => {
      const y = api.groundAt(x, z);
      const m = api.crowdPerson(i + 60, [0xbe123c, 0x0e7490, 0x4d7c0f, 0x7c3aed, 0xb45309, 0x1d4ed8][i], [0xfde68a, 0xf5f5f4, 0xfca5a5, 0xbae6fd, 0xd9f99d, 0xfbcfe8][i]);
      m.position.set(x, y, z); api.add(m);
      const v = { m, x, z, y, heard: false, slot: [-4.5 + i * 1.8, -16.4] };
      PENT.visitors.push(v);
    };

    // --- left lane: rooftops and two planks ---
    house(-11, 28, 6, 5, 3);
    api.box({ x: -7.6, z: 32.4, w: 1.6, d: 1.6, h: 1.1, color: 0x8b6b45 });
    api.box({ x: -9, z: 32.4, w: 1.4, d: 1.6, h: 2.1, color: 0x8b6b45 });
    api.box({ x: -11, z: 23.6, w: 2, d: 2, h: 0.4, y: 2.8, color: 0xb59a6d });
    api.box({ x: -11, z: 20.8, w: 2, d: 2, h: 0.4, y: 3.0, color: 0xb59a6d });
    house(-11, 15.6, 6, 5, 3.2);
    visitor(-11, 28, 0); visitor(-11, 15.6, 1);
    api.camZone({ minX: -15, maxX: -7, minZ: 13, maxZ: 34, yaw: -0.5, height: 8, back: 12, focus: [-11, 3, 21], pull: 0.4 });
    // the alley drop off the far roof: a pile of sacks to land on (no need, but friendly)
    api.box({ x: -8, z: 12, w: 1.6, d: 1.6, h: 1.4, color: 0x9c7a4a });

    // --- middle lane: the market's turning beams ---
    api.sweeper({ x: 0, z: 26, length: 5, speed: 1.3 });
    api.sweeper({ x: 0, z: 15, length: 5, speed: 1.6 });
    [[-2, 30.5], [2, 19.8]].forEach(([x, z]) => {
      api.box({ x, z, w: 1.4, d: 1.2, h: 0.9, color: 0x92400e });
      const awn = new T.Mesh(new T.BoxGeometry(1.8, 0.1, 1.6), api.mat(0xfbbf24)); awn.position.set(x, 2.1, z); api.add(awn);
    });
    visitor(0, 21.5, 2); visitor(0, 10.5, 3);

    // --- right lane: a terrace and a slow lift up a tower ---
    api.box({ x: 8, z: 29.6, w: 1.6, d: 1.6, h: 1.1, color: 0x8b6b45 });
    api.box({ x: 11, z: 26, w: 5, d: 5, h: 2.2, color: 0xc9b089, house: false });
    api.box({ x: 11, z: 15, w: 3, d: 3, h: 3.6, color: 0xb8996e, house: false });
    api.mover({ w: 1.8, h: 0.3, d: 1.8, color: 0xa0703c, path: [[8.4, 0, 15], [8.4, 3.3, 15]], speed: 1.4, wait: 1.2 });
    visitor(11, 26, 4); visitor(11, 15, 5);
    api.camZone({ minX: 7, maxX: 15, minZ: 11, maxZ: 19, yaw: 0.45, height: 8, back: 12, focus: [11, 3.6, 15], pull: 0.4 });

    // --- the temple: great steps up to a porch (Acts 2 doesn't name the place: our game's choice) ---
    api.box({ x: 0, z: -7.6, w: 14, d: 2.4, h: 1.0, color: 0xe7e0cf, house: false });
    api.box({ x: 0, z: -10, w: 12, d: 2.4, h: 2.0, color: 0xe7e0cf, house: false });
    api.box({ x: 0, z: -15.4, w: 14, d: 8.4, h: 3.0, color: 0xe7e0cf, house: false });
    for (let i = 0; i < 6; i++) { const c = new T.Mesh(new T.CylinderGeometry(0.35, 0.35, 3.6, 12), api.mat(0xf5f0e6)); c.position.set(-6 + i * 2.4, 3 + 1.8, -19); api.add(c); }
    const roof = new T.Mesh(new T.BoxGeometry(15, 0.4, 2.4), api.mat(0xe7e0cf)); roof.position.set(0, 6.8, -19); api.add(roof);
    const peter = api.person(0x1e3a8a, 0xe7e5e4, 1.05, { beard: true }); peter.position.set(0, 3, -17.6); api.add(peter);
    PENT.porchZone = api.zone({ x: PENT.PORCH[0], z: PENT.PORCH[1], y: 3, r: 2.2, time: 0.6, color: 0xfde68a,
      onDone(helpers) { api.task('porch'); helpers.forEach((p) => api.servant(p, 3)); } });

    // --- fragments ---
    // 1: the pool of Bethesda (the Fisherman nets it)
    const pool = new T.Mesh(new T.CircleGeometry(2.2, 24), new T.MeshLambertMaterial({ color: 0x3b82c4, transparent: true, opacity: 0.85 }));
    pool.rotation.x = -Math.PI / 2; pool.position.set(-14, 0.06, 2); api.add(pool);
    api.fragment({ x: -14, z: 2, y: 0.5, net: true });
    // 2: a high pillar by the square (only the Scribe jumps that high)
    api.box({ x: 13, z: 2, w: 3, d: 3, h: 5, color: 0xd6c9a8, house: false });
    api.box({ x: 10.5, z: 2, w: 1.6, d: 1.6, h: 2.0, color: 0x8b6b45 });
    api.fragment({ x: 13, z: 2, y: 5 + 1.3 });
    // 3: the Builder makes steps up to the disciples' roof
    [[6.2, 43.4, 1.2], [6.2, 45.4, 2.3]].forEach(([x, z, top]) => PENT.steps.push(api.box({ x, z, w: 1.6, d: 1.6, h: 0.35, y: top - 0.35, hidden: true, color: 0xa0703c })));
    const planks = new T.Mesh(new T.BoxGeometry(1.4, 0.4, 2), api.mat(0xa0703c)); planks.position.set(8, 0.2, 40); api.add(planks);
    api.interact({
      x: 8, z: 40, r: 2.2, label: 'Build steps',
      can: (p) => (p.role.id === 'builder' ? true : 'Some planks. The Builder could make steps up to the roof (Tab / RB to switch).'),
      use(p) { this.remove(); planks.visible = false; PENT.steps.forEach((s) => s.show(true)); api.sfx('build'); api.servant(p, 3); }
    });
    api.fragment({ x: 2.5, z: 46, y: 3.4 + 1.3 });

    // --- Golden Scroll course along the east wall ---
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

    api.leaves([[0, 34], [-7.6, 32.4, 1.1], [-11, 26, 3], [-11, 23.6, 3.2], [-11, 20.8, 3.4], [0, 28], [0, 23.6], [0, 17], [0, 12.6],
      [8, 29.6, 1.1], [11, 24, 2.2], [8.4, 16.6, 1], [0, 4], [0, -2], [0, -7.6, 1], [0, -10, 2]]);
  },

  update(api, dt) {
    PENT.flames.forEach((f, i) => { f.scale.y = 1 + Math.sin(api.time * 9 + i) * 0.15; });
    PENT.visitors.forEach((v) => {
      if (v.heard) {
        if (v.walkT !== undefined) {                     // walk (quickly) to the temple porch
          const k = Math.min(1, (api.time - v.walkT) / 4);
          v.m.position.set(v.x + (v.slot[0] - v.x) * k, k < 1 ? v.y + Math.sin(k * Math.PI) * 6 : 3, v.z + (v.slot[1] - v.z) * k);
          if (k >= 1) v.walkT = undefined;
        }
        return;
      }
      const p = api.near(v.x, v.z, 2.2).find((q) => Math.abs(q.pos.y - v.y) < 2);
      if (!p) return;
      v.heard = true; v.walkT = api.time;
      api.task('visitors'); api.servant(p, 4, 'for helping a visitor find the way!'); api.sfx('coin');
      api.puff(v.x, v.y + 1.4, v.z, 0xfde68a, 10);
      if (api.taskCount('visitors') === 1) api.toast('🌍 "Every man heard them speak in his own language" (Acts 2:6)! Off they go to the temple.', 4000);
    });
  },

  objective(api) {
    const ps = api.activePlayers();
    if (!ps.length) return null;
    const cx = ps.reduce((s, p) => s + p.pos.x, 0) / ps.length, cz = ps.reduce((s, p) => s + p.pos.z, 0) / ps.length;
    const v = PENT.visitors.filter((q) => !q.heard).sort((a, b) => Math.hypot(a.x - cx, a.z - cz) - Math.hypot(b.x - cx, b.z - cz))[0];
    if (v) return [v.x, v.y + 2, v.z];
    return [PENT.PORCH[0], 4.5, PENT.PORCH[1]];
  },

  finale: {
    message: '🏛️ Everyone up the temple steps to hear Peter! (Where he preached is our game\'s guess.)',
    beacon: [0, 5, -14],
    inZone(p) { return Math.hypot(p.pos.x - PENT.PORCH[0], p.pos.z - PENT.PORCH[1]) < 5.5 && p.pos.y > 2.5; },
    onUpdate(api, t) {
      if (t > 0.5 && !PENT.told) {
        PENT.told = true;
        api.story([
          { art: '📣', title: 'Peter preaches', text: 'Then Peter said unto them, Repent, and be baptized every one of you in the name of Jesus Christ for the remission of sins, and ye shall receive the gift of the Holy Ghost.', ref: 'Acts 2:38' },
          { art: '🙌', title: 'Three thousand', text: 'Then they that gladly received his word were baptized: and the same day there were added unto them about three thousand souls.', ref: 'Acts 2:41' },
          { art: '🌍', title: 'For every nation', text: 'That day the good news about Jesus began to go out to people from every nation and every language. God still calls people from all over the world, and children too.' },
          ...(api.shownRef('Acts 2:21') ? [] : [{ art: '🕊️', text: 'And it shall come to pass, that whosoever shall call on the name of the Lord shall be saved.', ref: 'Acts 2:21' }])
        ], () => { PENT.endT = api.time; api.sfx('win'); });
      }
      return PENT.endT !== undefined && api.time - PENT.endT > 2;
    }
  }
};
