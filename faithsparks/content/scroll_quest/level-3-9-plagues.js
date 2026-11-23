/* =====================================================================
 * LEVEL 3-9 (shown as 3-3): LET MY PEOPLE GO  (Exodus 7-10)
 * ---------------------------------------------------------------------
 * Between the Burning Bush and the Passover. Egypt, north to south (walk toward -z):
 *   The river and the city (z 46..12)  frogs everywhere (Exodus 8:6). Bring Moses and Aaron through
 *                                      the hopping frogs to Pharaoh's palace. Frogs bump you back.
 *   The palace (z 4..-4)               the frogs die (8:13), but Pharaoh hardens his heart (8:15).
 *   The fields (z -4..-26)             hail (9:23): watch the shadows, shelter under the roofs, and bring
 *                                      four cattle into the barn, as those who feared God's word did (9:20).
 *   The dark road (z -26..-36)         thick darkness (10:22): follow the lamps to Goshen, where Israel
 *                                      had light in their dwellings (10:23).
 * God sends every plague; players never cause one. They lead, shelter and follow the light.
 * Save id '3-9' (file name too) so older saves keep their numbers; the menu shows it as 3-3.
 * Only edit THIS file to change the level. See GEMINI.md and CAMPAIGN.md.
 * ===================================================================== */

const PLAG = {
  GATE: [0, 9],
  BARN: [-12, -18],
  GOSHEN: [0, -40],
  RIVER: 43,
  frogs: [],
  cows: [],
  leaders: [],
  lamps: [],
  told: {}
};

const LEVEL = {
  id: '3-9',
  bibleConnection: {"passage": "Exodus 7–10", "text": "God sent plagues because Pharaoh would not let Israel go. Pharaoh kept hardening his heart. Our frog route, cattle shelter and lamp trail are imagined. God sends the plagues."},
  world: 'World 3-3',            // shown between the Burning Bush and the Passover (Bible order); the id stays '3-9'
  title: 'Let My People Go',
  time: 'day',
  town: true,
  leafIcon: '🐸',
  leafColor: 0x84cc16,
  spawn: [0, 36],
  bounds: { minX: -19, maxX: 19, minZ: -44, maxZ: 46 },
  startMessage: 'Frogs everywhere! Call Moses and Aaron (B or E) and bring them to Pharaoh\'s palace.',

  intro: [
    { text: 'And the LORD spake unto Moses, Go unto Pharaoh, and say unto him, Thus saith the LORD, Let my people go, that they may serve me.', ref: 'Exodus 8:1' },
    { text: 'God is our refuge and strength, a very present help in trouble.', ref: 'Psalm 46:1' }
  ],

  introStory: [
    { art: '🐸', text: 'And Aaron stretched out his hand over the waters of Egypt; and the frogs came up, and covered the land of Egypt.', ref: 'Exodus 8:6' },
    { art: '🎮', title: 'Just for our game', text: "God sent every plague. Our frog route, cattle shelter and lamp trail are imagined ways to explore what happened." }
  ],

  tasks: [
    { id: 'lead', icon: '🧔', label: 'Bring Moses and Aaron to Pharaoh\'s palace', total: 2 },
    { id: 'cattle', icon: '🐄', label: 'Bring the cattle into the barn, out of the hail', total: 4, lockedUntil: 'lead' },
    { id: 'home', icon: '🏮', label: 'Follow the lamps to Goshen', total: 1, lockedUntil: 'cattle' }
  ],

  memoryVerse: { text: 'God is our refuge and strength, a very present help in trouble.', ref: 'Psalm 46:1' },

  ending: {
    verse: { text: 'but all the children of Israel had light in their dwellings.', ref: 'Exodus 10:23' },
    message: 'Again and again God showed His power, and again and again Pharaoh hardened his heart. One more plague was coming, and then God would bring His people out (Exodus 11:1).'
  },

  quiz: [
    { q: 'What did God tell Moses to say to Pharaoh?', ref: 'Exodus 8:1', options: ['Build more cities', 'Let my people go, that they may serve me', 'Give us gold'], answer: 1 },
    { q: 'Where was there no hail?', ref: 'Exodus 9:26', options: ['In Pharaoh\'s palace', 'In the land of Goshen, where Israel lived', 'By the river'], answer: 1, explain: 'Only in the land of Goshen, where the children of Israel were, was there no hail.' },
    { q: 'During the thick darkness, who had light?', ref: 'Exodus 10:23', options: ['The Egyptians', 'Nobody', 'All the children of Israel, in their dwellings'], answer: 2 }
  ],

  music: {
    bpm: 96,
    notes: [62, 0, 65, 0, 69, 68, 65, 0, 62, 0, 61, 62, 65, 0, 0, 0,
            69, 0, 70, 69, 65, 0, 62, 61, 62, 0, 65, 0, 62, 0, 0, 0],
    bass: [38, 38, 41, 41, 37, 37, 38, 38]
  },

  onCallText(kind) {
    if (PLAG.saidCall) return '';
    PLAG.saidCall = true;
    return 'Moses and Aaron walk with you. Mind the frogs!';
  },

  /* ---------- ground: the river in the north, flat city and fields, Goshen in the south ---------- */
  terrain(x, z) {
    let h = Math.sin(x * 0.27) * Math.cos(z * 0.19) * 0.07;
    const r = z - PLAG.RIVER;
    if (r > -2.4) h -= 1.7 * Math.min(1, (r + 2.4) / 0.6);
    return h;
  },

  groundColor(x, z, h) {
    if (h < -1.2) return 0x3b6e8f;
    if (z < -27) return (Math.floor(x / 2) + Math.floor(z / 2)) % 2 ? 0x8a9a5b : 0x7f9152;              // Goshen's green
    if (z < -4) return Math.abs(Math.sin(x * 1.3)) > 0.5 ? 0xb9a35a : 0xa99550;                          // barley and flax (9:31)
    return (Math.floor(x / 2) + Math.floor(z / 2)) % 2 ? 0xc4ab80 : 0xb9a077;                            // city streets
  },

  /* ---------- build ---------- */
  build(api) {
    const T = api.THREE;
    const person = (robe, scarf, s, o) => api.person(robe, scarf, s, o);

    // --- the river (the Fisherman can wade) ---
    const river = new T.Mesh(new T.PlaneGeometry(44, 6), new T.MeshLambertMaterial({ color: 0x3f7ea6, transparent: true, opacity: 0.85 }));
    river.rotation.x = -Math.PI / 2; river.position.set(0, -0.9, PLAG.RIVER + 1.5); api.add(river);
    api.hazard({ x: 0, z: PLAG.RIVER + 1.5, w: 44, d: 5.4 }, { maxY: -0.7, except: (p) => p.role.id === 'fisherman', msg: 'Splash! The river is full of frogs (the Fisherman can wade).' });
    api.fragment({ x: -12, z: PLAG.RIVER + 0.6, y: -0.5, net: true });

    // --- the city: houses along the streets ---
    [[-12, 32, 6, 5, 3.2], [12, 31, 6, 6, 3.4], [-13, 22, 5, 6, 3], [13, 21, 5, 5, 3.2], [-12, 13, 6, 5, 3.4], [12, 13, 6, 5, 3],
     [-6.5, 27, 3.2, 3.2, 2.8], [6.5, 17, 3.2, 3.2, 2.8]].forEach(([x, z, w, d, h]) => api.box({ x, z, w, d, h, color: 0xcdb48c }));

    // --- Moses and Aaron (call them; they follow you to the palace) ---
    const moses = person(0x7c2d12, 0xe7e5e4, 1.05, { age: 'elder', beard: 0xe7e5e4, cane: true });
    const aaron = person(0x1e3a8a, 0xf5f5f4, 1.0, { beard: 0x57534e });
    [[moses, 'Moses', -1.4], [aaron, 'Aaron', 1.4]].forEach(([mesh, kind, dx]) => {
      PLAG.leaders.push(api.follower({ x: dx, z: 33, kind, mesh,
        deliverTo: { x: PLAG.GATE[0], z: PLAG.GATE[1], r: 3.2 },
        parkAt: [PLAG.GATE[0] + dx, api.terrain(PLAG.GATE[0] + dx, PLAG.GATE[1] - 1), PLAG.GATE[1] - 1],
        onDeliver(p) { api.task('lead'); api.servant(p, 4); if (api.taskDone('lead')) LEVEL._palace(api); } }));
    });

    // --- frogs: everywhere in the streets (Exodus 8:3). They hop about and bump you back ---
    const frogMesh = () => {
      const g = new T.Group(), skin = api.mat(0x4d7c0f), belly = api.mat(0xbef264);
      const b = new T.Mesh(new T.SphereGeometry(0.3, 12, 8), skin); b.scale.set(1, 0.62, 1.15); b.position.y = 0.19; g.add(b);
      const bb = new T.Mesh(new T.SphereGeometry(0.27, 10, 6), belly); bb.scale.set(0.9, 0.4, 1); bb.position.set(0, 0.12, 0.04); g.add(bb);
      [-1, 1].forEach((sd) => {
        const e = new T.Mesh(new T.SphereGeometry(0.09, 8, 6), skin); e.position.set(sd * 0.13, 0.36, 0.2); g.add(e);
        const pu = new T.Mesh(new T.SphereGeometry(0.045, 6, 4), api.mat(0x111111)); pu.position.set(sd * 0.14, 0.39, 0.27); g.add(pu);
        const leg = new T.Mesh(new T.SphereGeometry(0.13, 8, 6), skin); leg.scale.set(0.7, 0.5, 1.4); leg.position.set(sd * 0.27, 0.1, -0.12); g.add(leg);
      });
      return g;
    };
    for (let i = 0; i < 26; i++) {
      const x = -8 + (i * 37 % 17), z = 14 + (i * 23 % 19);
      PLAG.frogs.push(api.critter({ kind: 'frog', mode: 'hop', x, z, r: 4.5, mesh: frogMesh(), msg: '🐸 Boing! A frog bumped you back. Hop over them or go round.' }));
    }

    // --- Pharaoh's palace ---
    api.box({ x: 0, z: 0, w: 14, d: 7, h: 4.5, color: 0xe2cfa6, house: false });
    [-5.6, -2.8, 0, 2.8, 5.6].forEach((x) => {
      const col = new T.Mesh(new T.CylinderGeometry(0.42, 0.5, 4.4, 14), api.texMat(0xf1e4c6, 'stone')); col.position.set(x, 2.2, 4.1); api.add(col);
      const cap = new T.Mesh(new T.CylinderGeometry(0.7, 0.45, 0.4, 14), api.mat(0x2f6f73)); cap.position.set(x, 4.5, 4.1); api.add(cap);
    });
    api.box({ x: 0, z: 4.4, w: 4, d: 1.6, h: 0.6, color: 0xd6c39c, house: false });   // the dais
    const pharaoh = person(0xfafaf9, 0xfacc15, 1.1, { band: 0xfacc15, beard: 0x1c1917 }); pharaoh.position.set(0, 0.6, 4.3); api.add(pharaoh); PLAG.pharaoh = pharaoh;
    // steps up the east side to the palace roof (fragment 2)
    [[9.2, 2.6, 1.1], [11.2, 0.6, 2.2], [9.2, -1.6, 3.3]].forEach(([x, z, top]) => api.box({ x, z, w: 1.8, d: 1.8, h: top, color: 0xbfa77e, house: false }));
    api.fragment({ x: 5.2, z: -1.6, y: 4.5 + 1.3 });

    // --- the fields: shelters from the hail, the barn, the God-fearing servant (Exodus 9:20) ---
    const shelter = (x, z, w, d, top) => {
      api.box({ x, z, w, d, h: 0.4, y: top, color: 0x8b6b45, house: false });
      [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([sx, sz]) => { const post = new T.Mesh(new T.CylinderGeometry(0.12, 0.14, top, 8), api.texMat(0x6b4a2b, 'wood')); post.position.set(x + sx * (w / 2 - 0.25), top / 2, z + sz * (d / 2 - 0.25)); api.add(post); });
    };
    [[7, -9, 4, 4], [-3, -12, 4, 4], [10, -21, 4, 4], [-14, -7, 4, 4]].forEach(([x, z, w, d]) => shelter(x, z, w, d, 2.7));
    const [bx, bz] = PLAG.BARN;
    shelter(bx, bz, 8, 6, 3.2);
    [[bx, bz - 3.1, 8, 0.4], [bx - 4.1, bz, 0.4, 6.4]].forEach(([x, z, w, d]) => api.box({ x, z, w, d, h: 3.2, color: 0xa47b4f, house: false }));   // back and side walls
    const servant = person(0xd6d3d1, 0x0e7490, 1, { beard: 0x57534e }); servant.position.set(bx + 3.5, 0, bz + 3.6); api.add(servant);
    api.spring({ x: bx + 5.6, z: bz + 1 });
    api.fragment({ x: bx, z: bz, y: 3.6 + 1.3 });
    [[13, -4.5], [-7, -9], [14, -15], [3, -20]].forEach(([x, z]) => {
      const f = api.follower({ x, z, kind: 'cow',
        deliverTo: { x: bx, z: bz, r: 3.4 },
        parkAt: (ff) => { const k = PLAG.cows.indexOf(ff); return [bx - 2.4 + k * 1.6, api.terrain(bx, bz), bz - 1]; },
        onDeliver(p) { api.task('cattle'); api.servant(p, 3, 'for sheltering the cattle!'); if (api.taskDone('cattle')) LEVEL._darkness(api); } });
      f.state = 'parked';
      PLAG.cows.push(f);
    });
    PLAG.hail = api.hail({ minX: -19, maxX: 19, minZ: -26, maxZ: -3, every: 0.4, near: 0.6, msg: 'Hail! Watch for the growing shadows, or shelter under a roof.' });
    PLAG.hail.on = false;

    // --- the dark road and Goshen: lamps light the way (Exodus 10:23) ---
    [[-3, -27], [3, -30], [-2.5, -33], [2.5, -36]].forEach(([x, z], i) => {
      const post = new T.Mesh(new T.CylinderGeometry(0.08, 0.1, 2.2, 8), api.texMat(0x5c3d22, 'wood')); post.position.set(x, 1.1, z); api.add(post);
      const glow = new T.Mesh(new T.SphereGeometry(0.22, 10, 8), new T.MeshBasicMaterial({ color: 0xffd27a })); glow.position.set(x, 2.3, z); api.add(glow);
      const l = new T.PointLight(0xffc56b, 0, 10, 2); l.position.set(x, 2.4, z); api.add(l); PLAG.lamps.push(l);
    });
    [[-9, -40, 6, 5, 3], [9, -40, 6, 5, 3.2], [-12, -32, 5, 5, 3], [12, -32, 5, 5, 3]].forEach(([x, z, w, d, h]) => api.box({ x, z, w, d, h, color: 0xc9b089 }));
    { const l = new T.PointLight(0xffc56b, 0, 14, 2); l.position.set(0, 3, -40); api.add(l); PLAG.lamps.push(l); }

    // --- Golden Scroll course: along the east edge of the fields, under the hail ---
    const plan = [['block', 1.0], ['float', 1.0], ['crumble', 0.9], ['float', 0.8], ['spring', 0.2], ['float', 4.2], ['crumble', 0.6], ['float', 0.4]];
    let ctop = 0;
    api.course(plan.map(([kind, rise], i) => {
      const z = -4 - i * 2.3, x = 17 + (i % 2 ? 0.3 : -0.3);
      ctop = i === 0 ? api.terrain(x, z) + 1.0 : ctop + rise;
      return { x, z, top: ctop, kind };
    }));

    api.leaves([[0, 30], [-3, 26], [3, 22], [-2, 18], [2, 14], [0, 11], [9.2, 2.6, 1.1], [11.2, 0.6, 2.2], [9.2, -1.6, 3.3],
      [-14, -7, 2.7], [7, -9, 2.7], [-3, -12, 2.7], [10, -21, 2.7], [-6, -16], [4, -16], [-3, -27], [3, -30], [-2.5, -33], [2.5, -36]]);
    api.camZone({ minX: -16, maxX: -6, minZ: -24, maxZ: -12, yaw: 0.45, height: 10, back: 13, focus: [bx, 1, bz], pull: 0.3 });
  },

  // At the palace: the frogs die (8:13), but Pharaoh hardens his heart (8:15). Then hail.
  _palace(api) {
    api.story([
      { art: '🐸', text: 'And the LORD did according to the word of Moses; and the frogs died out of the houses, out of the villages, and out of the fields.', ref: 'Exodus 8:13' },
      { art: '👑', text: 'But when Pharaoh saw that there was respite, he hardened his heart, and hearkened not unto them; as the LORD had said.', ref: 'Exodus 8:15' }
    ], () => {
      PLAG.frogs.forEach((f) => { f.off = true; });
      PLAG.cows.forEach((c) => { c.state = 'idle'; });
      PLAG.hail.on = true;
      api.rain(true); api.sfx('roar');
      api.toast('🧊 Still Pharaoh said no, and God sent hail. Bring the cattle in from the field (Exodus 9:19)! Watch for shadows; shelter under the roofs.', 5000);
    });
  },

  // The hail stops (9:33); thick darkness (10:22); Israel has light (10:23)
  _darkness(api) {
    PLAG.hail.on = false; api.rain(false);
    api.story([
      { art: '🌑', text: 'And Moses stretched forth his hand toward heaven; and there was a thick darkness in all the land of Egypt three days:', ref: 'Exodus 10:22' }
    ], () => {
      api.darkness(0.85); PLAG.dark = true;
      api.toast('🏮 Follow the lamps to Goshen: God\'s people had light in their homes (Exodus 10:23).', 4000);
    });
  },

  update(api, dt) {
    if (PLAG.pharaoh) PLAG.pharaoh.rotation.y = Math.sin(api.time * 0.5) * 0.25;
    if (PLAG.dark) PLAG.lamps.forEach((l, i) => { l.base = Math.min(1.6, (l.base || 0) + dt); l.intensity = l.base * (0.92 + Math.sin(api.time * 7 + i) * 0.08); });   // the lamps glow up and flicker
    if (api.taskDone('cattle') && !api.taskDone('home') && PLAG.dark && api.near(PLAG.GOSHEN[0], PLAG.GOSHEN[1], 5).length) api.task('home');
  },

  objective(api) {
    const ps = api.activePlayers();
    if (!ps.length) return null;
    const c = ps[0].pos;
    const near = (list) => list.sort((a, b) => Math.hypot(a[0] - c.x, a[2] - c.z) - Math.hypot(b[0] - c.x, b[2] - c.z))[0];
    if (!api.taskDone('lead')) {
      const idle = PLAG.leaders.filter((f) => f.state === 'idle');
      if (idle.length) return near(idle.map((f) => [f.pos.x, f.pos.y + 2.5, f.pos.z]));
      return [PLAG.GATE[0], 2, PLAG.GATE[1]];
    }
    if (!api.taskDone('cattle')) {
      if (PLAG.cows.some((f) => f.state === 'follow' || f.state === 'ridden')) return [PLAG.BARN[0], 2, PLAG.BARN[1]];
      return near(PLAG.cows.filter((f) => f.state === 'idle').map((f) => [f.pos.x, f.pos.y + 2, f.pos.z])) || null;
    }
    const next = PLAG.lamps.slice(0, 4).find((l) => l.position.z < c.z - 1.5);
    return next ? [next.position.x, 2.4, next.position.z] : [PLAG.GOSHEN[0], 2, PLAG.GOSHEN[1]];
  },

  finale: {
    message: '🏮 Everyone gather in Goshen, in the light.',
    beacon: [0, 3, -40],
    inZone(p) { return Math.hypot(p.pos.x - PLAG.GOSHEN[0], p.pos.z - PLAG.GOSHEN[1]) < 6; },
    onUpdate(api, t) {
      if (t > 0.5 && !PLAG.done) {
        PLAG.done = true;
        api.story([
          { art: '🏠', text: 'They saw not one another, neither rose any from his place for three days: but all the children of Israel had light in their dwellings.', ref: 'Exodus 10:23' },
          { art: '💡', title: 'God keeps His people', text: 'Frogs, hail and darkness: God showed Egypt that there is none like Him. He kept His people safe in Goshen, and He was getting ready to bring them out. Jesus said He is the light of the world, so whoever follows Him will not walk in darkness (John 8:12).' }
        ], () => { PLAG.endT = api.time; api.darkness(0.3); });
      }
      return PLAG.endT !== undefined && api.time - PLAG.endT > 2;
    }
  }
};
