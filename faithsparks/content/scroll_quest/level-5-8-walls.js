/* =====================================================================
 * LEVEL 5-8: REBUILD THE WALLS  (Nehemiah 2, 4, 6)
 * ---------------------------------------------------------------------
 * Jerusalem's wall is broken down. North (z 34) is the city; the broken wall runs east to west at
 * z = -4 with six gaps; south of it is the mockers' camp.
 *   1. Three gaps in the wall. Each one's building stone waits up on a builders' scaffold: climb
 *      to it (stone steps with a crumbling top, a spring, a lifting plank), then bring it down to
 *      the gap. The climbing is the work; the carrying is a few steps.
 *   2. A newly set stone needs time to set (the mortar is wet). Sanballat, Tobiah and Geshem come
 *      to knock it loose. When the trumpet sounds, go there and stand watch (Nehemiah 4:20):
 *      a watchman nearby makes them turn back. The Shepherd watches from further away.
 * Nobody fights: they mock, we pray and keep watch, and God gives the work success.
 * Only edit THIS file to change the level. See GEMINI.md and CAMPAIGN.md.
 * ===================================================================== */

const WALL = {
  Z: -4,                       // the line of the wall
  GAPS: [-14, -5, 8],
  SITES: [[-18, 2.5, 3.3], [-8.5, 2.5, 4.2], [12, 2.5, 3.6]],   // [x, z, top] the scaffold where each gap's stone waits
  SET_TIME: 12,                // seconds for new stones to set (long enough for a mocker to come)
  CAMP: [0, -24],
  stones: [],
  sections: [],                // {box, x, state: 'open'|'fresh'|'set', t}
  mockers: [],
  told: {}
};

const LEVEL = {
  id: '5-8',
  bibleConnection: {"passage": "Nehemiah 2–6", "text": "Nehemiah and the people rebuilt Jerusalem’s walls amid threats. They prayed, kept watch and worked together. Our repair sections make that teamwork playable; the tools and timings are game inventions."},
  world: 'World 5-8',
  title: 'Rebuild the Walls',
  town: true,                 // houses get doors, windows, awnings (engine house kit)
  leafIcon: '🧱',
  leafColor: 0xd6b37a,
  leafShape: 'round',
  spawn: [0, 30],
  bounds: { minX: -22, maxX: 22, minZ: -30, maxZ: 36 },
  approach: ['ledge', 'stones', 'crumbles'],   // the way in (engine): a stretch before the level's own start
  startMessage: 'Let us rise up and build! Climb the builders\' scaffolds and bring a stone down to each gap in the wall.',

  intro: [
    { text: 'Then said I unto them, Ye see the distress that we are in, how Jerusalem lieth waste, and the gates thereof are burned with fire: come, and let us build up the wall of Jerusalem, that we be no more a reproach.', ref: 'Nehemiah 2:17' },
    { text: 'In what place therefore ye hear the sound of the trumpet, resort ye thither unto us: our God shall fight for us.', ref: 'Nehemiah 4:20' }
  ],

  introStory: [
    { art: '🏚️', title: 'Broken walls', text: 'And they said unto me, The remnant that are left of the captivity there in the province are in great affliction and reproach: the wall of Jerusalem also is broken down, and the gates thereof are burned with fire.', ref: 'Nehemiah 1:3' },
    { art: '🧱', title: 'Let us build', text: 'Then I told them of the hand of my God which was good upon me; as also the king’s words that he had spoken unto me. And they said, Let us rise up and build. So they strengthened their hands for this good work.', ref: 'Nehemiah 2:18' }
  ],

  tasks: [
    { id: 'repair', icon: '🧱', label: 'Repair the gaps in the wall', total: 3 }
  ],

  memoryVerse: { text: 'Then he said unto them, Go your way, eat the fat, and drink the sweet, and send portions unto them for whom nothing is prepared: for this day is holy unto our Lord: neither be ye sorry; for the joy of the LORD is your strength.', ref: 'Nehemiah 8:10' },

  ending: {
    verse: { text: 'So the wall was finished in the twenty and fifth day of the month Elul, in fifty and two days.', ref: 'Nehemiah 6:15' },
    message: 'They prayed, they kept watch, and they kept building. God gave the work success.'
  },

  quiz: [
    { q: 'What did Tobiah say a fox could do to the wall?', ref: 'Nehemiah 4:3', options: ['Climb over it', 'Break it down', 'Dig under it'], answer: 1 },
    { q: 'What did the builders do when they were mocked?', ref: 'Nehemiah 4:9', options: ['They gave up', 'They prayed and set a watch', 'They mocked back'], answer: 1 },
    { q: 'How long did it take to finish the wall?', ref: 'Nehemiah 6:15', options: ['Fifty-two days', 'Seven years', 'One night'], answer: 0 }
  ],

  music: {
    bpm: 108,
    notes: [60, 0, 64, 67, 72, 0, 71, 67, 69, 0, 65, 0, 67, 0, 0, 0,
            64, 0, 67, 72, 74, 0, 72, 71, 72, 0, 67, 0, 64, 0, 0, 0],
    bass: [36, 36, 41, 41, 43, 43, 36, 36]
  },

  /* ---------- ground shape ---------- */
  terrain(x, z) {
    let h = Math.sin(x * 0.3) * Math.cos(z * 0.22) * 0.1;
    const pd = Math.hypot(x + 13, z - 28);                              // the King's Pool
    if (pd < 3.6) h -= 2.2 * Math.min(1, (3.6 - pd) / 1.2);
    return h;
  },

  groundColor(x, z, h) {
    if (h < -1) return 0x3d8fc4;
    if (z < WALL.Z - 1) return (Math.floor(x / 3) + Math.floor(z / 3)) % 2 ? 0xb49f73 : 0xab966b;   // outside
    return (Math.floor(x / 2) + Math.floor(z / 2)) % 2 ? 0xc2b08a : 0xb8a680;                         // city streets
  },

  /* ---------- build ---------- */
  build(api) {
    const T = api.THREE;
    const wallCol = 0xcdb98f, fresh = 0xe9dcc0, Z = WALL.Z, H = 3.6;
    const person = (robe, scarf, s, o) => api.person(robe, scarf, s, o);   // friendly round townsfolk (engine)

    // --- the wall: solid sections between six gaps; a tall tower in the middle ---
    const edges = [-23].concat(...WALL.GAPS.map((g) => [g - 1.5, g + 1.5]), [23]);
    for (let i = 0; i < edges.length; i += 2) {
      const a = edges[i], b = edges[i + 1], mid = (a + b) / 2;
      api.box({ x: mid, z: Z, w: b - a, d: 1.4, h: a < 0 && b > 0 ? 4.8 : H, color: wallCol });   // (the section over x = 0 is the tall tower)
    }
    // broken bits lying in the gaps
    WALL.GAPS.forEach((gx) => {
      [[-0.6, 0.4, 0.3], [0.7, -0.3, -0.5]].forEach(([dx, dz, r]) => { const m = new T.Mesh(new T.DodecahedronGeometry(0.35, 0), api.mat(0xa8956f)); m.position.set(gx + dx, 0.2, Z + dz); m.rotation.y = r; api.add(m); });
      const sec = { box: api.box({ x: gx, z: Z, w: 3, d: 1.4, h: H, color: fresh, hidden: true }), x: gx, state: 'open', t: 0 };
      sec.box.mesh.material = new T.MeshLambertMaterial({ color: fresh });     // its own material (it changes colour when set)
      const wet = new T.Mesh(new T.RingGeometry(1.9, 2.3, 24), new T.MeshBasicMaterial({ color: 0xfbbf24, transparent: true, opacity: 0.7, side: T.DoubleSide }));
      wet.rotation.x = -Math.PI / 2; wet.position.set(gx, 0.07, Z + 1.6); wet.visible = false; api.add(wet); sec.ring = wet;
      WALL.sections.push(sec);
    });

    // --- the city: ruined houses, Nehemiah, rubble lying in the streets (hop over it) ---
    [[-17, 22, 5], [-6, 20, 4], [7, 16, 4], [-14, 14, 4], [17, 6, 3], [6, 30, 4]].forEach(([x, z, w], i) => api.box({ x, z, w, d: w, h: 2.4 + (i % 3) * 0.6, color: 0xc9b48a }));
    const nehemiah = person(0x1e40af, 0xfde68a, 1, { beard: true }); nehemiah.position.set(1.5, 0, 4); api.add(nehemiah); WALL.nehemiah = nehemiah;
    [[-4, 24, 2.4], [4, 21, 1.8], [-2, 12, 2.2], [3, 9, 1.6]].forEach(([x, z, w]) => api.box({ x, z, w, d: 1.2, h: 0.55, color: 0x8f8068 }));   // low rubble: a hop

    // --- three builders' scaffolds, one for each gap; a different climb to each ---
    const plank = 0x9a6b3c;
    const [s0, s1, s2] = WALL.SITES;
    // 1: stone steps, the top one crumbling
    api.box({ x: s0[0], z: s0[1] + 5, w: 1.8, d: 1.8, h: 1.1, color: 0xb8a37a });
    api.crumble({ x: s0[0], z: s0[1] + 2.8, top: 2.2 });
    // 2: a spring up to the high scaffold
    api.spring({ x: s1[0], z: s1[1] + 3.2 });
    // 3: a plank that lifts up and down
    api.mover({ w: 2, h: 0.3, d: 2, color: plank, path: [[s2[0], 0.05, s2[1] + 3.4], [s2[0], s2[2] - 0.3, s2[1] + 3.4]], speed: 1.4, wait: 1.2 });
    WALL.SITES.forEach(([x, z, top], k) => {
      api.box({ x, z, w: 2.6, d: 2.4, h: top, color: plank, tex: 'wood' });                           // the scaffold
      [[-1.1, -1.0], [1.1, -1.0], [-1.1, 1.0], [1.1, 1.0]].forEach(([dx, dz]) => { const pole = new T.Mesh(new T.CylinderGeometry(0.07, 0.07, top + 1.2, 6), api.mat(0x6b4a2b)); pole.position.set(x + dx, (top + 1.2) / 2, z + dz); api.add(pole); });
      const m = new T.Mesh(new T.BoxGeometry(1.0, 0.7, 0.8), api.mat(0xdccba6));
      const gx = WALL.GAPS[k];
      const it = api.carryable({
        x, z, y: top, mesh: m, name: 'building stone', to: 'its gap in the wall',
        deliverTo: { x: gx, z: Z + 1.7, r: 2.4 },
        onDeliver(p) { LEVEL._place(api, WALL.sections[k], p); }
      });
      it.gap = k;
      WALL.stones.push(it);
    });
    api.camZone({ minX: -21, maxX: -15, minZ: 1, maxZ: 10, yaw: 0.6, height: 9, back: 11, focus: [s0[0], 2, s0[1] + 2], pull: 0.4 });
    api.camZone({ minX: 9, maxX: 15, minZ: 1, maxZ: 10, yaw: -0.6, height: 9, back: 11, focus: [s2[0], 2, s2[1] + 2], pull: 0.4 });

    // --- the mockers' camp (south) and the three mockers ---
    [[-5, -26], [5, -26], [0, -28]].forEach(([x, z]) => { const t = new T.Mesh(new T.ConeGeometry(1.6, 2.1, 4), api.mat(0x6b5b45)); t.position.set(x, api.terrain(x, z) + 1.05, z); t.rotation.y = Math.PI / 4; api.add(t); });
    [['Sanballat', 0x7f1d1d, -3], ['Tobiah', 0x365314, 0], ['Geshem', 0x713f12, 3]].forEach(([name, robe, dx], i) => {
      const m = person(robe, 0x1c1917); m.position.set(WALL.CAMP[0] + dx, 0, WALL.CAMP[1]); api.add(m);
      WALL.mockers.push({ name, m, home: [WALL.CAMP[0] + dx, WALL.CAMP[1]], state: 'home', wait: 2 + i * 2.5, target: null });
    });

    // --- fragments ---
    // 1: the King's Pool (the Fisherman casts a net)
    api.hazard({ x: -13, z: 28, r: 3.2 }, { maxY: -0.6, except: (p) => p.role.id === 'fisherman', msg: 'Splash! The King\'s Pool is deep (the Fisherman can wade).' });
    api.fragment({ x: -13, z: 28, y: 0.3, net: true });
    // 2: crumbling stones up a broken tower inside the walls
    [[19, 12, 1.0], [20.4, 9.8, 2.0], [19, 7.6, 3.0]].forEach(([x, z, t]) => api.crumble({ x, z, top: api.terrain(x, z) + t }));
    api.box({ x: 19.5, z: 4.8, w: 2.4, d: 2.4, h: 3.9, color: 0xb8a37a });
    api.fragment({ x: 19.5, z: 4.8, y: 3.9 + 1.3 });
    // 3: a spring up onto the middle tower of the wall
    api.spring({ x: 0, z: Z + 2.5 });
    api.fragment({ x: 0, z: Z, y: 4.8 + 1.3 });

    // --- Golden Scroll challenge course: along the east side of the city ---
    const plan = [['block', 1.0], ['float', 1.0], ['crumble', 0.9], ['float', 0.8], ['spring', 0.2], ['float', 4.2], ['crumble', 0.6]];
    let ctop = 0;
    api.course(plan.map(([kind, rise], i) => {
      const z = 33 - i * 2.9, x = 20 + (i % 2 ? 0.3 : -0.3);
      ctop = i === 0 ? api.terrain(x, z) + 1.0 : ctop + rise;
      return { x, z, top: ctop, kind };
    }));

    api.leaves([[0, 26], [-8, 26], [2, 17], [-5, 16], [5, 6], [-2, 2], [-18, 12], [14, 14], [-4, 21.4, 1.9],
      [s0[0], s0[1] + 5, 2.0], [s0[0], s0[1] + 2.8, 3.1], [s1[0], s1[1] + 1.6, 5.6], [s2[0], s2[1] + 3.4, 2.4], [20.4, 9.8, 2.9]]);
    // (no challenge corner: building and keeping watch is the whole level)
  },

  // the first stone is set: the mocking begins (and the watch)
  _mocking(api) {
    api.story([
      { art: '🦊', title: 'The mockers laughed', text: 'Now Tobiah the Ammonite was by him, and he said, Even that which they build, if a fox go up, he shall even break down their stone wall.', ref: 'Nehemiah 4:3' },
      { art: '🙏', text: 'Nevertheless we made our prayer unto our God, and set a watch against them day and night, because of them.', ref: 'Nehemiah 4:9' }
    ], () => api.toast('📯 New stones need time to set. When the trumpet sounds, go and stand watch by the wet stone: the mockers turn back when they see a watchman!', 5000));
  },

  // a stone is set in a gap (wet mortar for a few seconds)
  _place(api, sec, p) {
    sec.state = 'fresh'; sec.t = 0;
    sec.box.show(true); sec.box.mesh.material.color.setHex(0xe9dcc0);
    sec.ring.visible = true;
    api.servant(p, 3); api.sfx('build'); api.puff(sec.x, 1.5, WALL.Z, 0xe9dcc0, 10);
    if (!WALL.told.place) { WALL.told.place = true; LEVEL._mocking(api); }   // the first stone: the mocking begins
  },

  // a mocker reached a fresh stone with no watchman: it falls out again
  _knock(api, sec, mk) {
    sec.state = 'open'; sec.box.show(false); sec.ring.visible = false;
    const it = WALL.stones[WALL.sections.indexOf(sec)];
    it.delivered = false; it.x = sec.x + 1.2; it.z = WALL.Z + 2.4; it.y = api.groundAt(it.x, it.z);
    it.mesh.visible = true; it.mesh.position.set(it.x, it.y + 0.3, it.z);
    it.inter.x = it.x; it.inter.z = it.z; it.inter.y = it.y; it.inter.alive = true;
    api.sfx('drop'); api.puff(sec.x, 1, WALL.Z, 0xe9dcc0, 8);
    api.toast('😏 ' + mk.name + ' knocked a wet stone loose! Put it back, and keep watch this time.', 3000);
  },

  update(api, dt) {
    const ps = api.activePlayers();
    // new stones set after a while
    WALL.sections.forEach((sec) => {
      if (sec.state !== 'fresh') return;
      sec.t += dt;
      sec.ring.material.opacity = 0.4 + Math.sin(api.time * 6) * 0.3;
      if (sec.t >= WALL.SET_TIME) {
        sec.state = 'set'; sec.ring.visible = false; sec.box.mesh.material.color.setHex(0xcdb98f);
        api.task('repair'); api.sfx('coin');
        ps.forEach((p) => api.servant(p, 2));
      }
    });
    // the mockers: walk to a fresh stone; turn back from a watchman
    WALL.mockers.forEach((mk) => {
      const pos = mk.m.position;
      const watchR = (p) => (p.role.id === 'shepherd' ? 6.5 : 4.5);
      const watched = ps.find((p) => Math.hypot(p.pos.x - pos.x, p.pos.z - pos.z) < watchR(p));
      if (mk.state === 'home') {
        mk.wait -= dt;
        const freshOnes = WALL.sections.filter((s) => s.state === 'fresh' && !WALL.mockers.some((o) => o !== mk && o.target === s));
        if (mk.wait <= 0 && freshOnes.length) {
          mk.target = freshOnes.sort((a, b) => Math.abs(a.x - pos.x) - Math.abs(b.x - pos.x))[0];
          mk.state = 'go';
          api.sfx('call');
          if (!WALL.told.trumpet) { WALL.told.trumpet = true; api.toast('📯 The trumpet! ' + mk.name + ' is heading for the new stones. Go and keep watch!', 3000); }   // (after that the trumpet sound says it)
        }
        return;
      }
      const tx = mk.state === 'go' ? mk.target.x : mk.home[0], tz = mk.state === 'go' ? WALL.Z - 2.2 : mk.home[1];
      const dx = tx - pos.x, dz = tz - pos.z, d = Math.hypot(dx, dz);
      if (mk.state === 'go') {
        if (mk.target.state !== 'fresh') { mk.state = 'back'; mk.target = null; }
        else if (watched) {
          mk.state = 'back'; mk.target = null;
          api.servant(watched, 3, 'for keeping watch!');
          if (!WALL.told.watch) { WALL.told.watch = true; api.toast('👀 They saw a watchman and turned back!', 2400); }
        } else if (d < 0.4) { LEVEL._knock(api, mk.target, mk); mk.state = 'back'; mk.target = null; }
      }
      if (mk.state === 'back' && d < 0.4) { mk.state = 'home'; mk.wait = 5 + Math.random() * 3; return; }
      const sp = (mk.state === 'go' ? 2.2 : 3) * dt;
      if (d > 0.01) { pos.x += dx / d * Math.min(sp, d); pos.z += dz / d * Math.min(sp, d); mk.m.rotation.y = Math.atan2(dx, dz); }
      pos.y = Math.abs(Math.sin(api.time * 9)) * 0.06;
    });
    WALL.nehemiah.rotation.y = Math.sin(api.time * 0.5) * 0.6;
  },

  objective(api) {
    const ps = api.activePlayers();
    if (!ps.length) return null;
    const held = ps.map((p) => p.holding).find((h) => h && h.deliverTo);
    if (held) return [held.deliverTo.x, 2, held.deliverTo.z];
    const going = WALL.mockers.find((m) => m.state === 'go');
    if (going) return [going.target.x, 2.5, WALL.Z + 1.5];
    const cx = ps[0].pos.x, cz = ps[0].pos.z;
    const it = WALL.stones.filter((x) => !x.delivered && !x.holder).sort((a, b) => Math.hypot(a.x - cx, a.z - cz) - Math.hypot(b.x - cx, b.z - cz))[0];
    if (it) return [it.x, it.y + 1, it.z];
    const wet = WALL.sections.find((s) => s.state === 'fresh');
    return wet ? [wet.x, 2.5, WALL.Z + 1.5] : null;
  },

  finale: {
    message: '🧱 The wall is finished! Everyone gather by Nehemiah.',
    beacon: [1.5, 3, 4],
    inZone(p) { return Math.hypot(p.pos.x - 1.5, p.pos.z - 4) < 6; },
    onUpdate(api, t) {
      if (t > 0.5 && !WALL.done) {
        WALL.done = true;
        api.story([
          { art: '🧱', text: 'So the wall was finished in the twenty and fifth day of the month Elul, in fifty and two days.', ref: 'Nehemiah 6:15' },
          { art: '🙌', text: 'And it came to pass, that when all our enemies heard thereof, and all the heathen that were about us saw these things, they were much cast down in their own eyes: for they perceived that this work was wrought of our God.', ref: 'Nehemiah 6:16' },
          { art: '🤝', title: 'Building together', text: 'Some carried, some built, some kept watch. Nobody fought the mockers: God\'s people prayed and kept working, and everyone could see that God had done it.' },
          ...(api.shownRef('Nehemiah 8:10') ? [] : [{ art: '😊', text: 'neither be ye sorry; for the joy of the LORD is your strength.', ref: 'Nehemiah 8:10' }])
        ], () => { WALL.endT = api.time; });
      }
      return WALL.endT !== undefined && api.time - WALL.endT > 2;
    }
  }
};
