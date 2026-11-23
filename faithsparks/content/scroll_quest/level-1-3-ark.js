/* =====================================================================
 * LEVEL 1-3: TWO BY TWO  (Genesis 6–7)
 * ---------------------------------------------------------------------
 * ONE IDEA: LEAD A PARADE OF ANIMALS UP TO THE ARK. The flock is waiting at the start, so the parade
 * begins in the first seconds; the rest of the level grows it, kind by kind.
 * The ark is built (Genesis 6:22). Each kind of animal has its own (made-up, harmless) habit, which makes a small puzzle:
 *   Meadow (z 40..15)    sheep: a rolling log scares them off, so cross the log lanes at the bottom or the top
 *   Forest (z 15..-8)    a rabbit hides in a thorny bush (the Sword of the Spirit cuts the thorns)
 *   Log slope (-8..-32)  rolling logs (the camera turns to show their lanes); goats like it high: climb onto their rock to call them
 *   Ravine (z -36..-46)  Builder bridge (or 2 helpers together)
 *   Plateau (-46..-70)   lions; sleepy bears sit down if you walk too far ahead; a second hidden rabbit
 *   Ark (z -70..-90)     the parade goes in at the door; Scribe lookout fragment; God shuts the door
 * Only edit THIS file to change the level. See GEMINI.md.
 * ===================================================================== */

// ---------- level-local state (only this file uses it) ----------
const ARK = {
  Z: -82,            // ark centre z
  PLATEAU: 9,        // plateau height
  DECK: 11,          // deck top height
  bridgeBuilt: false,
  lookoutOpen: false,
  logs: [],
  debris: [],
  door: null,
  stakes: null,
  lookout: [],
  sheep: [],
  goats: [],
  bears: [],
  rabbits: [],
  SHELVES: [{ x: 13, z: -27, w: 5, d: 4.4 }, { x: -13, z: -21, w: 5, d: 4.4 }],
  BUSHES: [[6, 4], [-4, -60]],
  floodStart: null
};

const LEVEL = {
  id: '1-3',
  bibleConnection: {"passage": "Genesis 6–7", "text": "God judged a violent, sinful world with a flood; people and land animals outside the ark died. He preserved Noah’s household and the animals inside. Our animal route explores that account; God Himself shut the door."},
  world: 'World 1-3',
  title: 'Two by Two',
  keepArmor: ['sword'],         // the Sword cuts the thorns, so falls and bumps never take it
  sky: 0x8aa0b8,
  ambient: 0.8,
  leafIcon: '🌿',
  leafColor: 0x84cc16,
  spawn: [0, 38],
  bounds: { minX: -21, maxX: 21, minZ: -92, maxZ: 44 },
  approach: ['stones', 'crumbles'],   // the way in (engine): a stretch before the level's own start
  startMessage: 'Call the sheep with B on a controller (E on the keyboard) and lead the parade to the ark!',

  intro: [
    { text: 'Make thee an ark of gopher wood; rooms shalt thou make in the ark, and shalt pitch it within and without with pitch.', ref: 'Genesis 6:14' },
    { text: 'Of every clean beast thou shalt take to thee by sevens, the male and his female: and of beasts that are not clean by two, the male and his female.', ref: 'Genesis 7:2' }
  ],

  // story cards shown after Start (with ref = exact KJV, without = narration)
  introStory: [
    { art: '🌧️', title: 'Two by Two', text: 'But Noah found grace in the eyes of the LORD.', ref: 'Genesis 6:8' },
    { art: '🐾', text: 'The earth was filled with wickedness and violence (Genesis 6:5, 6:11). God warned Noah that He would judge it with a flood. Noah built the ark as God commanded. Our game\'s helping job: lead the animals up the trail.' }
  ],

  tasks: [
    { id: 'sheep', icon: '🐑', label: 'Sheep aboard (by sevens)', total: 7 },
    { id: 'goats', icon: '🐐', label: 'Goats aboard (by sevens)', total: 7 },
    { id: 'pairs', icon: '🦁', label: 'Pairs aboard (two by two)', total: 6 }
  ],

  memoryVerse: { text: 'Thus did Noah; according to all that God commanded him, so did he.', ref: 'Genesis 6:22' },

  ending: {
    verse: { text: 'And they that went in, went in male and female of all flesh, as God had commanded him: and the LORD shut him in.', ref: 'Genesis 7:16' },
    message: 'Everyone is safe inside the ark. God Himself shut the door!'
  },

  quiz: [
    { q: 'Why did God send the flood?', ref: 'Genesis 6:5–7', options: ['To make a lake for boating', 'To judge the wickedness of mankind', 'Because Noah wanted rain'], answer: 1 },
    { q: 'How did the clean animals come into the ark?', ref: 'Genesis 7:2', options: ['By sevens', 'One at a time', 'By tens'], answer: 0 },
    { q: 'Who shut the door of the ark?', ref: 'Genesis 7:16', options: ['Noah', "Noah's sons", 'The LORD'], answer: 2 }
  ],

  // Optional: write your own tune! midi note numbers, 0 = rest (60 = middle C)
  music: {
    bpm: 108,
    notes: [67, 0, 72, 0, 76, 74, 72, 0, 69, 0, 72, 0, 67, 0, 0, 0,
            67, 0, 72, 0, 76, 77, 79, 0, 77, 76, 74, 0, 72, 0, 0, 0],
    bass: [48, 48, 53, 53, 48, 48, 43, 43, 48, 48, 53, 53, 55, 55, 48, 48]
  },

  /* ---------- ground shape: height at (x, z) ---------- */
  terrain(x, z) {
    let h = Math.min(9, Math.max(0, (15 - z) * 0.2));                    // trail climbs toward the ark
    if (z > 15) h += Math.sin(x * 0.35) * 0.25 + Math.cos(z * 0.3) * 0.25; // gentle meadow bumps
    h += Math.max(0, Math.abs(x) - 17) * 1.6;                            // hills on both sides
    const dz = Math.abs(z + 41);                                          // ravine centred at z = -41
    if (dz < 5) h -= 10 * Math.min(1, (5 - dz) / 0.6);
    const dp = Math.hypot(x - 13, z + 55);                               // pond
    if (dp < 4.5) h -= 2.5 * Math.min(1, (4.5 - dp) / 1.2);
    return h;
  },

  groundColor(x, z, h) {
    if (Math.abs(z + 41) < 5.3) return h < 4 ? 0x27272a : 0x57534e;   // ravine rock (dark at the bottom)
    if (Math.hypot(x - 13, z + 55) < 4.5) return 0x1e40af;  // pond bed
    if (Math.abs(x) > 18) return 0x4d7c3a;                   // side hills
    if (z > 15) return Math.abs(x) < 2.5 ? 0x9a8458 : 0x6fbf55; // meadow + path
    if (z > -8) return 0x3f7d3a;                             // forest floor
    if (z > -32) return Math.min(Math.abs(x - 4), Math.abs(x + 4)) < 1.4 ? 0x5e4329 : 0x7a5a35;   // muddy slope (the two log lanes are worn darker)
    if (Math.abs(x) < 2.2 && z > -70) return 0x9a8458;       // the trodden path to the ark
    if (z < -70 && Math.abs(x) < 16) return Math.sin(x * 1.3) * Math.cos(z * 1.1) > 0.3 ? 0xb39a6a : 0xa58c5e;   // the ark yard: wood chips and packed earth
    return Math.sin(x * 0.6) * Math.cos(z * 0.5) > 0.3 ? 0x86b453 : 0x8fbf5a;   // plateau
  },

  /* ---------- build everything once ---------- */
  build(api) {
    const T = api.THREE;
    const P = ARK.PLATEAU;

    // --- MEADOW ---
    [[-12, 40], [14, 41], [-16, 22], [17, 18], [-18, 34]].forEach(([x, z]) => api.tree(x, z, 1.1, 0x4f8f3a));
    api.stump(-4, 26, 0.8);
    api.stump(4, 22, 1.2);
    api.stump(-3, 18, 0.9);
    // stump tower -> fragment 1 (platforming)
    api.stump(12, 24, 1.0);
    api.stump(15, 27.5, 2.2);
    api.stump(12.5, 31, 3.4);
    api.stump(15.5, 34, 4.6);
    api.fragment({ x: 15.5, z: 34, y: api.terrain(15.5, 34) + 4.6 + 1.4 });
    api.leaves([[0, 34], [0, 31], [0, 28], [4, 22, api.terrain(4, 22) + 2.4], [-4, 26, api.terrain(-4, 26) + 2.0], [-3, 18, api.terrain(-3, 18) + 2.1],
      [12, 24, api.terrain(12, 24) + 2.2], [15, 27.5, api.terrain(15, 27.5) + 3.4], [12.5, 31, api.terrain(12.5, 31) + 4.6]]);
    for (let i = 0; i < 7; i++) {
      ARK.sheep.push(api.follower({ x: -9 + (i % 3) * 1.6, z: 34 + Math.floor(i / 3) * 1.6, kind: 'sheep', ...ARK_DELIVER }));
    }

    // --- FOREST ---
    [[-17, 13], [16, 12], [-15, 4], [17, 2], [-18, -4], [15, -6], [-9, 9], [10, 0], [-3, -1], [7, 13]]
      .forEach(([x, z], i) => api.tree(x, z, 1.0 + (i % 3) * 0.15));
    api.armor('sword', -14, 1);
    // bushes where rabbits hide (the forest one is wrapped in thorns)
    ARK.BUSHES.forEach(([x, z], i) => {
      const bush = new T.Group();
      for (let k = 0; k < 5; k++) { const b = new T.Mesh(new T.SphereGeometry(0.75, 8, 6), api.mat(0x3f7d2a)); b.position.set(Math.cos(k * 1.3) * 0.7, 0.55 + (k % 2) * 0.3, Math.sin(k * 1.3) * 0.5); bush.add(b); }
      bush.position.set(x, api.terrain(x, z), z); api.add(bush);
      const r = api.follower({ x, z: z + 0.3, kind: 'rabbit', ...ARK_DELIVER });
      r.state = 'parked'; r.mesh.visible = false; r.bush = [x, z]; r.thorns = i === 0;
      ARK.rabbits.push(r);
      if (i === 0) {
        const vines = new T.Group();
        for (let k = 0; k < 4; k++) {
          const c = new T.Mesh(new T.TorusGeometry(1.2 + (k % 2) * 0.2, 0.14, 6, 14), api.mat(0x365314));
          c.rotation.set(Math.PI / 2 + (k - 1.5) * 0.3, k * 0.8, 0); c.position.y = 0.3 + k * 0.25; vines.add(c);
        }
        for (let k = 0; k < 8; k++) {
          const sp = new T.Mesh(new T.ConeGeometry(0.1, 0.35, 5), api.mat(0x991b1b));
          const a = (k / 8) * Math.PI * 2;
          sp.position.set(Math.cos(a) * 1.3, 0.6 + (k % 2) * 0.3, Math.sin(a) * 1.3); vines.add(sp);
        }
        vines.position.set(x, api.terrain(x, z), z); api.add(vines);
        api.interact({
          x, z, r: 3, priority: 1, label: 'Cut thorns',
          can: (p) => (p.armor.sword ? true : 'Thorny vines! Something is rustling inside. Find the Sword of the Spirit 📖 to cut them.'),
          use(p) { vines.visible = false; r.thorns = false; this.remove(); api.sfx('build'); api.puff(x, api.terrain(x, z), z, 0x365314, 12); }
        });
      }
    });
    api.leaves([[-12, 9], [-9, 6], [12, 4], [8, -2], [0, 2], [0, -4], [-6, 0]]);

    // --- MUD SLOPE with rolling logs ---
    api.armor('breastplate', -7, -8);                 // stand firm: rolling logs can't knock you down
    api.camZone({ minX: -14, maxX: 14, minZ: -33, maxZ: -9, yaw: 0.6, height: 10.5, back: 14, focus: [0, api.terrain(0, -22), -22], pull: 0.3 });   // see the log lanes from the side
    [-4, 4].forEach((lx, i) => {                     // two log lanes; the bottom (z > -13.5), the sides and the top are calm
      const m = new T.Mesh(new T.CylinderGeometry(0.5, 0.5, 4, 12), api.mat(0x4a3525));
      m.rotation.z = Math.PI / 2; m.castShadow = true;
      api.add(m);
      ARK.logs.push({ mesh: m, x: lx, z: -32 - i * 7, speed: 6 + i, wait: i * 1.5 });
    });
    // little signs that show an animal's habit without reading anything
    const zzz = () => { const g = new T.Group(); const m = new T.MeshBasicMaterial({ color: 0xffffff });
      [[0, 0.3, 0.5, 0], [0, -0.3, 0.5, 0], [0, 0, 0.62, Math.PI / 4]].forEach(([x, y, w, r]) => { const b = new T.Mesh(new T.BoxGeometry(w, 0.1, 0.1), m); b.position.set(x, y, 0); b.rotation.z = r; g.add(b); });
      g.scale.setScalar(0.6); g.visible = false; api.add(g); return g; };
    const bang = () => { const g = new T.Group(); const m = new T.MeshBasicMaterial({ color: 0xef4444 });
      const bar = new T.Mesh(new T.BoxGeometry(0.14, 0.45, 0.14), m); bar.position.y = 0.2; g.add(bar);
      const dot = new T.Mesh(new T.BoxGeometry(0.14, 0.14, 0.14), m); dot.position.y = -0.14; g.add(dot);
      g.visible = false; api.add(g); return g; };
    ARK.icons = { zzz, bang };
    // goats like it high: two rocky shelves, each with a step up
    ARK.SHELVES.forEach((sh, k) => {
      sh.top = api.terrain(sh.x, sh.z) + 2.0;
      api.box({ x: sh.x, z: sh.z, w: sh.w, d: sh.d, h: sh.top - api.terrain(sh.x, sh.z) + 0.3, y: api.terrain(sh.x, sh.z) - 0.3, color: 0x8a8f98 });
      const sz = sh.z + sh.d / 2 + 1.0;
      api.box({ x: sh.x, z: sz, w: 1.8, d: 1.8, h: sh.top - 1.0 - api.terrain(sh.x, sz) + 0.3, y: api.terrain(sh.x, sz) - 0.3, color: 0x8a8f98 });
      const n = k === 0 ? 4 : 3;
      for (let i = 0; i < n; i++) {
        const g = api.follower({ x: sh.x - 1.5 + i * 1.0, z: sh.z - 0.6 + (i % 2) * 1.2, kind: 'goat', ...ARK_DELIVER });
        g.shelf = sh; ARK.goats.push(g);
        g.callable = (p) => (Math.abs(p.pos.x - sh.x) < sh.w / 2 + 0.6 && Math.abs(p.pos.z - sh.z) < sh.d / 2 + 0.6 && p.pos.y > sh.top - 0.5
          ? true : 'The goats like it up high! Climb onto their rock (step up at the front), then call them.');
      }
      // a golden calling spot on top of the rock
      sh.spot = new T.Mesh(new T.RingGeometry(0.7, 0.95, 24), new T.MeshBasicMaterial({ color: 0xfacc15, transparent: true, opacity: 0.8, side: T.DoubleSide }));
      sh.spot.rotation.x = -Math.PI / 2; sh.spot.position.set(sh.x + 1.2, sh.top + 0.06, sh.z + 1.2); api.add(sh.spot);
    });
    api.leaves([[-4, -12], [4, -16], [-4, -20], [4, -24], [0, -28]]);

    // --- RAVINE + Builder's bridge ---
    const stream = new T.Mesh(new T.PlaneGeometry(60, 6), new T.MeshLambertMaterial({ color: 0x1d4ed8 }));
    stream.rotation.x = -Math.PI / 2; stream.position.set(0, -0.6, -41);
    api.add(stream);
    const bridge = api.box({ x: 0, z: -41, w: 6, h: 0.4, d: 11.5, y: P - 0.4, color: 0xa47442, hidden: true });
    api.hazard({ x: 0, z: -41, w: 50, d: 10 }, { maxY: P - 2, msg: 'Down the ravine! A teammate can float down to pop the bubble.' });
    const stakes = new T.Group();
    [-3, 3].forEach((x) => {
      const post = new T.Mesh(new T.CylinderGeometry(0.15, 0.15, 1.6, 6), api.mat(0x5c3d22));
      post.position.set(x, 0.8, 0); stakes.add(post);
    });
    const planksPile = new T.Mesh(new T.BoxGeometry(2, 0.6, 1.2), api.mat(0xa47442));
    planksPile.position.set(5, 0.3, 0); stakes.add(planksPile);
    stakes.position.set(0, P, -34.5);
    api.add(stakes);
    // rope posts along the near rim so kids can see the edge
    for (let x = -17; x <= 17; x += 2.5) {
      if (Math.abs(x) < 4) continue;
      const post = new T.Mesh(new T.CylinderGeometry(0.1, 0.1, 1.0, 6), api.mat(0x5c3d22));
      post.position.set(x, P + 0.5, -35.4); api.add(post);
    }
    [-1, 1].forEach((s) => {
      const rope = new T.Mesh(new T.BoxGeometry(13.5, 0.06, 0.06), api.mat(0xd6b07a));
      rope.position.set(s * 10.5, P + 0.85, -35.4); api.add(rope);
    });
    ARK.stakes = api.interact({
      x: 0, z: -34.5, r: 4, label: 'Build bridge',
      can(p) {
        if (p.role.strong) return true;
        if (api.near(0, -34.5, 4.5).length >= 2) return true;
        return 'The Builder can lay this bridge — or two helpers together! (Alone? Press Tab to switch.)';
      },
      use(p) {
        ARK.bridgeBuilt = true;
        bridge.show(true);
        stakes.remove(planksPile);
        this.remove();
        api.sfx('build');
        api.puff(0, P, -38, 0xa47442, 16);
        api.near(0, -34.5, 4.5).forEach((q) => api.servant(q, 5, 'for building the bridge!'));
        // (the planks and the puff show it)
      }
    });

    // --- PLATEAU ---
    [[-17, -50], [16, -48], [-16, -66], [17, -68]].forEach(([x, z]) => api.tree(x, z, 1.2, 0x4f8f3a));
    api.rock(-6, -48, 1.0);
    api.rock(5, -62, 0.9);
    // pond + fisherman fragment
    const pond = new T.Mesh(new T.CircleGeometry(4.3, 28), new T.MeshLambertMaterial({ color: 0x3b82f6, transparent: true, opacity: 0.8 }));
    pond.rotation.x = -Math.PI / 2; pond.position.set(13, P - 0.6, -55);
    api.add(pond);
    api.hazard({ x: 13, z: -55, r: 3.6 }, { except: (p) => p.role.id === 'fisherman', msg: 'Splash! Only the Fisherman can wade in the pond.' });
    api.fragment({ x: 13, z: -55, y: P + 0.6, net: true });
    api.follower({ x: -11, z: -56, kind: 'lion', ...ARK_DELIVER });
    api.follower({ x: -9.5, z: -57, kind: 'lion', ...ARK_DELIVER });
    ARK.bears.push(api.follower({ x: 7, z: -49, kind: 'bear', ...ARK_DELIVER }));
    ARK.bears.push(api.follower({ x: 9, z: -48, kind: 'bear', ...ARK_DELIVER }));
    // --- Golden Scroll challenge course (up past the ark deck): blocks, crumbling platforms, a spring ---
    api.course([
      { x: -14.6, z: -50, top: 10, kind: 'block' },
      { x: -13.4, z: -53.4, top: 11, kind: 'float' },
      { x: -14.6, z: -56.8, top: 11.9, kind: 'crumble' },
      { x: -13.4, z: -60.2, top: 12.7, kind: 'crumble' },
      { x: -14.6, z: -63.6, top: 12.9, kind: 'float' },
      { x: -13.4, z: -67, top: 13.2, kind: 'spring' },
      { x: -14.6, z: -70.4, top: 17.4, kind: 'float' },
      { x: -13.4, z: -73.8, top: 18, kind: 'crumble' },
      { x: -14.6, z: -77.2, top: 18.6, kind: 'float' }
    ]);

    api.leaves([[0, -50], [-4, -54], [4, -58], [0, -62], [-13, -60]]);

    // --- THE ARK ---
    buildArk(api);
    api.camZone({ minX: -6, maxX: 6, minZ: -40, maxZ: -31, yaw: 0, height: 13, back: 13, focus: [0, ARK.PLATEAU, -47], pull: 0.4 });   // across the ravine: see the far side
  },

  /* ---------- runs every frame ---------- */
  update(api, dt) {
    const P = ARK.PLATEAU;
    // rolling logs on the slope (roll toward +z, downhill)
    ARK.logs.forEach((L) => {
      if (L.wait > 0) { L.wait -= dt; L.mesh.visible = false; return; }
      L.mesh.visible = true;
      L.z += L.speed * dt;
      if (L.z > -13.5) { L.z = -32; L.wait = 1 + Math.random() * 2; }   // stop before the wood cart at z -9
      const y = api.terrain(L.x, L.z) + 0.5;
      L.mesh.position.set(L.x, y, L.z);
      L.mesh.rotation.x += L.speed * dt * 2;
      api.activePlayers().forEach((p) => {
        if (Math.abs(p.pos.x - L.x) < 2.2 && Math.abs(p.pos.z - L.z) < 0.8 && p.pos.y - y < 0.6) {
          api.hit(p, p.pos.x, L.z - 1, 'bump', ARK.logTold ? '' : 'Bowled over by a log! Jump over them, or cross at the top or bottom of the slope.');   // (said once)
          ARK.logTold = true;
        }
      });
    });
    // flood: stays low until the finale, then rises over the valley
    if (ARK.floodStart !== null) {
      const t = api.time - ARK.floodStart;
      api.water(Math.min(P - 2.5, -3 + t * 0.6));
    } else {
      const prog = (api.taskCount('sheep') + api.taskCount('goats') + api.taskCount('pairs')) / 20;
      api.water(-3 + prog * 2.4);
    }
    LEVEL._habits(api, dt);
    LEVEL._poses(api, dt);
  },

  // made-up animal habits (gameplay only, not part of the Bible account)
  _habits(api, dt) {
    const once = (key, msg) => { if (!ARK['told_' + key]) { ARK['told_' + key] = true; api.toast(msg, 4000); } };
    // sheep: a rolling log scares them off
    ARK.sheep.forEach((f) => {
      if (f.calm > 0) f.calm -= dt;
      if (f.state === 'follow' && f._prev !== 'follow') f.calm = Math.max(f.calm || 0, 3);   // a moment to catch up after being called
      f._prev = f.state;
      if (f.state !== 'follow' || f.calm > 0) return;
      for (const L of ARK.logs) {
        if (!L.mesh.visible || L.z < -26) continue;               // the top of the slope (z < -27), by the bridge, stays calm
        if (f.leader && Math.hypot(f.leader.pos.x - f.pos.x, f.leader.pos.z - f.pos.z) < 3) continue;   // sheep close to their shepherd stay calm
        if (f.leader && Math.abs(f.leader.pos.x - L.x) > 3.2) continue;   // the family walks beside the lane, not in it: the tail of the parade stays calm too
        if (Math.abs(f.pos.x - L.x) < 2.4 && Math.abs(f.pos.z - L.z) < 1.2) {
          f.state = 'idle'; f.leader = null; f.home.copy(f.pos); f.home.x += f.pos.x < L.x ? -2.5 : 2.5; f.calm = 4;
          f.scaredT = 2.5;   // calm for a moment after being called back
          api.puff(f.pos.x, f.pos.y, f.pos.z, 0xffffff, 6); api.sfx('bleat');
          once('sheep', '🐑 A rolling log scared the sheep! Call them again. Cross the log lanes at the bottom or the top of the slope, where the logs don\'t roll.');
          break;
        }
      }
    });
    ARK.sheep.forEach((f) => {
      if (!f.bang) f.bang = ARK.icons.bang();
      if (f.scaredT > 0) f.scaredT -= dt;
      f.bang.visible = f.scaredT > 0 && f.state === 'idle';
      if (f.bang.visible) f.bang.position.set(f.pos.x, f.pos.y + 1.6 + Math.abs(Math.sin(api.time * 8)) * 0.15, f.pos.z);
    });
    ARK.SHELVES.forEach((sh) => { sh.spot.visible = ARK.goats.some((g) => g.shelf === sh && g.state === 'idle'); sh.spot.material.opacity = 0.55 + Math.sin(api.time * 4) * 0.3; });
    // goats: they only come if you climb up onto their rock to call them; they stay on it otherwise
    ARK.goats.forEach((f) => {
      const sh = f.shelf;
      const onShelf = (q) => q && Math.abs(q.pos.x - sh.x) < sh.w / 2 + 0.6 && Math.abs(q.pos.z - sh.z) < sh.d / 2 + 0.6 && q.pos.y > sh.top - 0.5;
      if (f.state === 'follow' && f._prev === 'idle' && !onShelf(f.leader)) {
        f.state = 'idle'; f.leader = null;
        once('goats', '🐐 The goats like it up high! Climb onto their rock, then call them.');
      }
      if (f.state === 'idle') {
        f.pos.x = Math.max(sh.x - sh.w / 2 + 0.5, Math.min(sh.x + sh.w / 2 - 0.5, f.pos.x));
        f.pos.z = Math.max(sh.z - sh.d / 2 + 0.5, Math.min(sh.z + sh.d / 2 - 0.5, f.pos.z));
        f.pos.y = sh.top; f.home.set(sh.x, sh.top, sh.z);
        f.mesh.position.copy(f.pos);
      }
      f._prev = f.state;
    });
    // rabbits: hiding in bushes until someone comes close (the thorny one needs the Sword first)
    ARK.rabbits.forEach((f) => {
      if (f.state !== 'parked' || f.mesh.visible || f.thorns) return;
      if (api.near(f.bush[0], f.bush[1], 3).length) {
        f.state = 'idle'; f.mesh.visible = true; f.home.copy(f.pos);
        api.puff(f.pos.x, f.pos.y + 0.5, f.pos.z, 0x3f7d2a, 8);
        api.sfx('pop');                                                   // (the puff and the pop say it)
      }
    });
    // bears: slow and sleepy, they sit down for a rest if you walk too far ahead
    ARK.bears.forEach((f) => {
      if (f.state === 'follow' && f._lp) {
        const dx = f.pos.x - f._lp.x, dz = f.pos.z - f._lp.z, d = Math.hypot(dx, dz), max = 7 * dt;
        if (d > max) { f.pos.x = f._lp.x + dx / d * max; f.pos.z = f._lp.z + dz / d * max; f.pos.y = api.groundAt(f.pos.x, f.pos.z); f.mesh.position.set(f.pos.x, f.pos.y, f.pos.z); }
        const L = f.leader;
        const nearArk = Math.hypot(f.pos.x, f.pos.z + 70) < 14;              // almost home: they keep going
        if (L && !nearArk && Math.hypot(L.pos.x - f.pos.x, L.pos.z - f.pos.z) > 14) {
          f.state = 'idle'; f.leader = null; f.home.copy(f.pos); f.sat = true;
          once('bears', '🐻 The sleepy bear sat down for a rest. Go back, call it, and walk a little slower.');
        }
      }
      f._lp = { x: f.pos.x, z: f.pos.z };
      if (!f.zzz) f.zzz = ARK.icons.zzz();
      f.zzz.visible = f.state === 'idle' && f.sat;                      // resting: a floating Z until called again
      if (f.state === 'follow') f.sat = false;
      if (f.zzz.visible) f.zzz.position.set(f.pos.x + 0.3, f.pos.y + 1.9 + Math.sin(api.time * 2) * 0.15, f.pos.z);
    });
    // animals resting or wandering stay off the steep side hills
    api.followers().forEach((f) => { if (f.state === 'idle' && Math.abs(f.pos.x) > 15.5) { f.pos.x = Math.sign(f.pos.x) * 15.5; f.home.x = Math.sign(f.home.x) * Math.min(Math.abs(f.home.x), 14); } });
    // a big parade gets a cheer
    const n = api.followers().filter((f) => f.state === 'follow').length;
    if (n >= 8) if (!ARK.paradeCheer) { ARK.paradeCheer = true; api.sfx('cheer'); }   // (a cheer, no pop-up)
  },

  /* ---------- presentation only: nothing here is solid, and no rule changes ---------- */
  _dress(api) {
    const T = api.THREE, P = ARK.PLATEAU, D = ARK.DECK, Z = ARK.Z, g = new T.Group();
    const pitch = api.texMat(0x3b2817, 'wood'), plank = api.texMat(0x7d5430, 'wood'), light = api.texMat(0xb08250, 'wood'), roofMat = api.texMat(0x6b4a2c, 'wood');
    const M = (geo, mat, x, y, z) => { const m = new T.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true; g.add(m); return m; };
    const B = (w, h, d, mat, x, y, z) => M(new T.BoxGeometry(w, h, d), mat, x, y, z);
    ARK.hull.mesh.material = pitch;                                   // "pitch it within and without with pitch" (Genesis 6:14)
    ARK.rails.forEach((r) => { r.mesh.material = light; });
    ARK.stairs.forEach((s) => { s.mesh.material = plank; });
    // hull sides: a long boat shape, rising to a raised bow and stern, with a gap for the door
    const side = (x0, x1) => {
      const sh = new T.Shape(), top = D + 1.25, bow = (x) => Math.max(0, Math.abs(x) - 11.5) / 3.7;
      const xs = []; for (let x = x0; x <= x1 + 1e-6; x += (x1 - x0) / 24) xs.push(x);
      sh.moveTo(x0, P - 0.25);
      xs.forEach((x) => sh.lineTo(x, top + bow(x) * bow(x) * 2.4));
      sh.lineTo(x1, P - 0.25); sh.lineTo(x0, P - 0.25);
      return new T.ExtrudeGeometry(sh, { depth: 0.28, bevelEnabled: false });
    };
    [[-15.2, -2.2], [2.2, 15.2]].forEach(([a, b]) => M(side(a, b), pitch, 0, 0, Z + 6.05));
    M(side(-15.2, 15.2), pitch, 0, 0, -92.4);
    [-1, 1].forEach((sd) => {                                          // bow and stern, closing the ends
      B(0.3, D + 1.25 - P + 0.25, 16.7, pitch, sd * 14.45, (P - 0.25 + D + 1.25) / 2, -84.05);
      const post = B(0.5, 4.2, 0.5, pitch, sd * 15.0, D + 1.6, Z + 6.2); post.rotation.z = -sd * 0.35;
      const post2 = B(0.5, 4.2, 0.5, pitch, sd * 15.0, D + 1.6, -92.3); post2.rotation.z = -sd * 0.35;
    });
    for (let k = 0; k < 3; k++) [[-15.2, -2.2], [2.2, 15.2]].forEach(([a, b]) => B(b - a - 0.4, 0.07, 0.06, plank, (a + b) / 2, P + 0.7 + k * 0.8, Z + 6.37));   // plank seams
    B(30.6, 0.18, 0.4, light, 0, D + 1.32, -92.25);
    // the house on the ark: walls, little windows under the roof (Genesis 6:16), a pitched roof
    B(25, 7.1, 4.2, plank, 0, D + 3.55, -89.85);
    for (let x = -11; x <= 11; x += 2.2) B(1.1, 0.5, 0.06, new T.MeshLambertMaterial({ color: 0x1c140c }), x, D + 6.5, -87.4);
    [-1, 1].forEach((sd) => { const r = B(26.4, 0.28, 3.4, roofMat, 0, D + 7.95, -89.85 + sd * 1.45); r.rotation.x = sd * 0.42; });
    B(26.4, 0.3, 0.35, light, 0, D + 8.65, -89.85);
    // gopher wood, a pot of pitch and tools in the yard (low, beside the path)
    [[15.6, -74.2], [-15.8, -77.2]].forEach(([x, z]) => { for (let i = 0; i < 6; i++) { const l = M(new T.CylinderGeometry(0.22, 0.22, 3, 8), api.texMat(0x8a6338, 'bark'), x + (i % 3) * 0.46 - 0.46, P + 0.22 + Math.floor(i / 3) * 0.4, z); l.rotation.x = Math.PI / 2; } });
    M(new T.CylinderGeometry(0.45, 0.38, 0.6, 12), api.texMat(0x2b211a, 'clay'), 14.6, P + 0.3, -71.2);
    M(new T.CylinderGeometry(0.38, 0.38, 0.05, 12), new T.MeshLambertMaterial({ color: 0x0d0a08 }), 14.6, P + 0.6, -71.2);
    api.scenery(g);

    // Noah's household: eight people went into the ark (Genesis 7:13; 1 Peter 3:20)
    const look = [[0x8a6d4a, 0xf5f0e6, { beard: true, age: 'elder', staff: true }], [0x9b5c4a, 0xe9d8b4, { age: 'elder' }],
      [0x4b6b8a, 0xe7dcc4, { beard: true }], [0x7a5b8f, 0xd9c49a, {}], [0x6b7f45, 0xe2d2a9, { beard: true }], [0xa0624a, 0xcdb48a, {}], [0x8a5a3a, 0xf0e2c2, { beard: true }], [0x4f7a76, 0xe6d6b0, {}]];
    const spots = [[5.4, P, -72.4, -0.6], [-5.4, P, -72.6, 0.6], [12.6, D, -78.4, -0.3], [12.4, D, -80.8, -0.2], [12.6, D, -83.2, -0.4], [-12.8, D, -78.4, 0.3], [-12.6, D, -80.8, 0.2], [12.4, D, -85.6, -0.5]];
    ARK.family = look.map(([robe, scarf, o], i) => {
      const m = api.storyPerson(robe, scarf, 1, o), [x, y, z, r] = spots[i];
      m.position.set(x, y, z); m.rotation.y = r; api.add(m); return m;
    });
    ARK.noah = ARK.family[0];
    ARK.noahTalk = api.conversation({
      person: ARK.noah, speaker: 'Noah', label: 'Talk with Noah',
      clue(api) {
        const left = (kind) => api.followers().filter((f) => f.kind === kind && f.state !== 'delivered' && f.state !== 'parked').map((f) => [f.pos.x, f.pos.y + 1.2, f.pos.z]);
        const sheep = left('sheep'), goats = left('goat'), pairs = left('lion').concat(left('bear'), left('rabbit'));
        if (sheep.length) return { text: 'Some sheep are still out in the meadow. Cross the log lanes at the bottom or the top of the slope.', at: sheep[0] };
        if (goats.length) return { text: 'The goats are up on their rocks by the slope. Climb up beside them, then call.', at: goats[0] };
        if (!ARK.bridgeBuilt) return { text: 'Lay planks across the ravine first. The Builder can, or two helpers together.', at: [0, P + 1, -34.5] };
        if (pairs.length) return { text: 'Look for the lions and the bears out on the hilltop, and a rabbit hiding in a bush.', at: pairs[0] };
        return { text: 'Everyone is here. Come up onto the deck!', at: [0, D + 1, -80] };
      }
    });
  },

  _poses(api, dt) {
    (ARK.family || []).forEach((m, i) => api.posePerson(m, { dt, expression: ARK.floodStart !== null ? 'wonder' : 'calm', cheer: ARK.paradeCheer && i > 1 && api.time % 9 < 1.5 }));
  },

  /* ---------- golden arrow: where should the kids go next? ---------- */
  objective(api) {
    const ps = api.activePlayers();
    if (!ps.length) return null;
    const c = ps.reduce((a, p) => [a[0] + p.pos.x / ps.length, a[1] + p.pos.z / ps.length], [0, 0]);
    const nearest = (list) => list.sort((a, b) => Math.hypot(a.x - c[0], a.z - c[1]) - Math.hypot(b.x - c[0], b.z - c[1]))[0];
    const following = api.followers().some((f) => f.state === 'follow');
    const behind = nearest(api.followers().filter((f) => f.state === 'idle' && f.wasFollowing && f.mesh.visible).map((f) => ({ x: f.pos.x, z: f.pos.z, y: f.pos.y })));
    if (behind) return [behind.x, behind.y + 1.5, behind.z];        // someone was left behind: go back for them first
    const groupZ = c[1];
    if (!ARK.bridgeBuilt && (following || groupZ < -10)) return [0, ARK.PLATEAU + 1, -34.5];
    if (following) return [0, ARK.PLATEAU + 1, -70];
    const idle = api.followers().filter((f) => f.state === 'idle').map((f) => ({ x: f.pos.x, z: f.pos.z, y: f.pos.y }))
      .concat(ARK.rabbits.filter((r) => r.state === 'parked' && !r.mesh.visible).map((r) => ({ x: r.bush[0], z: r.bush[1], y: api.terrain(r.bush[0], r.bush[1]) + 1 })));
    const t = nearest(idle);
    return t ? [t.x, t.y + 1, t.z] : null;
  },

  onCallText(kind, n) {                                                 // said once each; after that the hop and the bleat say it
    const k = kind === 'sheep' || kind === 'goat' ? 'sevens' : 'two';
    if (ARK['said_' + k]) return '';
    ARK['said_' + k] = true;
    return k === 'sevens' ? '🐑 They join the parade! Clean animals came by sevens.' : '🐾 They join the parade, two by two!';
  },

  /* ---------- the ending: rain, everyone on deck, God shuts the door ---------- */
  finale: {
    message: '🌧️ The rain begins! Everyone get onto the ark deck!',
    beacon: [0, 11, -80],
    onStart(api) {
      api.rain(true);
      ARK.floodStart = api.time;                                        // (the rain and the rising water tell it: no card here)
    },
    inZone(p) {
      return Math.abs(p.pos.x) < 13.5 && p.pos.z < -76 && p.pos.z > -88 && p.pos.y > ARK.DECK - 0.5;
    },
    onUpdate(api, t) {
      // the door swings shut by itself
      const k = Math.min(1, t / 2.5);
      ARK.door.rotation.x = (Math.PI / 2 - 0.25) * (1 - k);
      if (t > 2.5 && !ARK.doorSlammed) {
        ARK.doorSlammed = true;
        api.sfx('door');
        api.verse('God shut the door', 'And they that went in, went in male and female of all flesh, as God had commanded him: and the LORD shut him in.', 'Genesis 7:16');
      }
      if (t > 3.5 && !ARK.doorCard) {
        ARK.doorCard = true;
        api.story([
          { art: '🚪', title: 'One door', text: 'The flood was God\'s judgment on sin. The people and land animals outside the ark died; Noah and those with him in the ark survived (Genesis 7:21–23). God Himself shut the door. Jesus said He is the door through whom we are saved.' },
          { art: '✝️', text: 'I am the door: by me if any man enter in, he shall be saved, and shall go in and out, and find pasture.', ref: 'John 10:9' }
        ], () => { ARK.endT = t; });
      }
      return ARK.endT !== undefined && t > ARK.endT + 2;
    }
  }
};

// delivery settings shared by every animal
const ARK_DELIVER = {
  deliverTo: { x: 0, z: -70, r: 4.5 },
  parkAt: () => [-10 + Math.random() * 20, ARK.DECK, -86 + Math.random() * 7],
  onDeliver(p, f) {
    const task = f.kind === 'sheep' ? 'sheep' : f.kind === 'goat' ? 'goats' : 'pairs';
    SQ.api.task(task);
    SQ.api.servant(p, 3);
    SQ.api.sfx('bleat');
    const n = SQ.api.taskCount('sheep') + SQ.api.taskCount('goats') + SQ.api.taskCount('pairs');
    SQ.api.puff(f.pos.x, f.pos.y + 1, f.pos.z, 0xfde047, 6);                 // safe aboard: a sparkle (the count is on the board)
  }
};

/* ---------- the ark itself ---------- */
function buildArk(api) {
  const T = api.THREE;
  const P = ARK.PLATEAU, D = ARK.DECK, Z = ARK.Z;
  // hull / deck (solid: you can stand on it)
  ARK.hull = api.box({ x: 0, z: Z, w: 28, h: D - P, d: 12, y: P, color: 0x6e4720 });
  // low rails on the deck so nobody falls off (gap in the front for the stairs)
  ARK.rails = [
    api.box({ x: 0, z: Z - 5.8, w: 28, h: 1.2, d: 0.4, y: D, color: 0x9c6b36 }),
    api.box({ x: -13.8, z: Z, w: 0.4, h: 1.2, d: 12, y: D, color: 0x9c6b36 }),
    api.box({ x: 13.8, z: Z, w: 0.4, h: 1.2, d: 12, y: D, color: 0x9c6b36 }),
    api.box({ x: -8.25, z: Z + 5.8, w: 11.5, h: 1.2, d: 0.4, y: D, color: 0x9c6b36 }),
    api.box({ x: 8.25, z: Z + 5.8, w: 11.5, h: 1.2, d: 0.4, y: D, color: 0x9c6b36 })
  ];
  // stairs up to the deck
  ARK.stairs = [0.5, 1.0, 1.5].map((h, i) => api.box({ x: 0, z: Z + 6.6 + (2 - i) * 1.2, w: 4, h, d: 1.2, y: P, color: 0xb0834c }));
  // the front wall of the ark's house, along the back of the deck (decoration; the house is dressed in LEVEL._dress)
  for (let row = 0; row < 6; row++) {
    const m = new T.Mesh(new T.BoxGeometry(26, 1.0, 0.3), api.texMat(row % 2 ? 0x8f6236 : 0x9a6b3c, 'wood'));
    m.position.set(0, D + 1.6 + row * 1.0, Z - 5.6);
    api.add(m);
  }
  // the door (lies open as a ramp, swings shut in the finale)
  const doorPivot = new T.Group();
  const door = new T.Mesh(new T.BoxGeometry(4, 5, 0.3), api.texMat(0x4a3525, 'wood'));
  door.position.y = 2.5;
  doorPivot.add(door);
  doorPivot.position.set(0, D, Z + 6.1);
  doorPivot.rotation.x = Math.PI / 2 - 0.25;   // lying open over the stairs
  api.add(doorPivot);
  ARK.door = doorPivot;
  // drop-off marker for animals
  const ring = new T.Mesh(new T.RingGeometry(3.6, 4.4, 32), new T.MeshBasicMaterial({ color: 0xfacc15, transparent: true, opacity: 0.6, side: T.DoubleSide }));
  ring.rotation.x = -Math.PI / 2; ring.position.set(0, P + 0.06, -70);
  api.add(ring);

  // Scribe inscription -> lookout stairs on the deck -> fragment 3
  const stone = new T.Mesh(new T.BoxGeometry(1.4, 1.6, 0.4), api.mat(0xd6d3d1));
  stone.position.set(-16, P + 0.8, -73);
  api.add(stone);
  const steps = [];
  for (let i = 0; i < 5; i++) {
    steps.push(api.box({ x: -12 + i * 1.7, z: -86.5, w: 1.4, h: 1.2 * (i + 1), d: 1.4, y: D, color: 0xd6b07a, hidden: true }));
  }
  api.interact({
    x: -16, z: -73, r: 2.6, label: 'Read inscription',
    can: (p) => (p.role.id === 'scribe' ? true : 'Only the Scribe can read this old inscription.'),
    use(p) {
      steps.forEach((s) => s.show(true));
      this.remove();
      api.sfx('fanfare');
      api.toast('📜 The Scribe read the inscription — a lookout appeared on the ark deck!');
      api.servant(p, 5, 'for reading the inscription!');
    }
  });
  api.fragment({ x: -12 + 4 * 1.7, z: -86.5, y: D + 6 + 1.4 });
  LEVEL._dress(api);
}
