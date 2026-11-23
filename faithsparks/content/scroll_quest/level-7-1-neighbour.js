/* =====================================================================
 * LEVEL 7-1: A NEIGHBOUR ON THE ROAD  (Luke 10:25-37, a parable Jesus told)
 * ---------------------------------------------------------------------
 * The winding road down from Jerusalem (top, z 44) to Jericho (bottom, z -44):
 *   Upper road (z 44..12)   rolling boulders cross the road; supplies for the journey
 *   The bend   (z 12..-12)  the hurt man by the road; the priest and the Levite pass by
 *   Lower road (z -12..-44) the donkey carries him to the inn in Jericho
 * Tasks: carry oil, wine and bandages to the hurt man; then lead the donkey to the inn.
 * This is a story Jesus told (a parable), and the level says so.
 * Only edit THIS file to change the level. See GEMINI.md and CAMPAIGN.md.
 * ===================================================================== */

const ROAD = {
  supplies: [],
  boulders: [],
  walkers: [],
  bridge: [],
  donkey: null,
  lamb: null,
  pen: null,
  cared: false,
  MAN: [0, -2],
  INN: [0, -38],
  TOP: 10
};

function roadX(z) { return 6 * Math.sin(z * 0.11); }
function roadBase(z) { return ROAD.TOP * Math.max(0, Math.min(1, (z + 40) / 82)); }

const LEVEL = {
  id: '7-1',
  bibleConnection: {"passage": "Luke 10:25–37", "text": "Jesus told of a Samaritan who cared for a beaten man when others passed by. Our oil, bandages and inn journey explore that mercy. This is Jesus’ parable, not a claim that our playable characters were there."},
  world: 'World 7-1',
  title: 'A Neighbour on the Road',
  town: true,                 // houses get doors, windows, awnings (engine house kit)
  time: 'sunset',
  leafIcon: '🪙',
  leafColor: 0xfacc15,
  leafShape: 'round',
  spawn: [roadX(40), 40],
  bounds: { minX: -19, maxX: 19, minZ: -46, maxZ: 46 },
  approach: ['meadow:lion', 'stones', 'crumbles'],   // the way in (engine): a stretch before the level's own start
  startMessage: 'Jesus told a story about a traveller on this road. Follow the road down toward Jericho.',

  intro: [
    { text: 'But he, willing to justify himself, said unto Jesus, And who is my neighbour?', ref: 'Luke 10:29' },
    { text: 'Then said Jesus unto him, Go, and do thou likewise.', ref: 'Luke 10:37' }
  ],

  introStory: [
    { art: '❓', title: 'Who is my neighbour?', text: 'But he, willing to justify himself, said unto Jesus, And who is my neighbour?', ref: 'Luke 10:29' },
    { art: '🛣️', title: 'Jesus told a story', text: 'And Jesus answering said, A certain man went down from Jerusalem to Jericho, and fell among thieves, which stripped him of his raiment, and wounded him, and departed, leaving him half dead.', ref: 'Luke 10:30' }
  ],

  tasks: [
    { id: 'care', icon: '🩹', label: 'Bring oil, wine and bandages', total: 3 },
    { id: 'inn', icon: '🫏', label: 'Take him to the inn', total: 1, lockedUntil: 'care' }
  ],

  memoryVerse: { text: 'And he answering said, Thou shalt love the Lord thy God with all thy heart, and with all thy soul, and with all thy strength, and with all thy mind; and thy neighbour as thyself.', ref: 'Luke 10:27' },

  ending: {
    verse: { text: 'Then said Jesus unto him, Go, and do thou likewise.', ref: 'Luke 10:37' },
    message: 'A neighbour is anyone who needs our help. Go, and show mercy!'
  },

  quiz: [
    { q: 'Who stopped to help the hurt man?', ref: 'Luke 10:33', options: ['The priest', 'A Samaritan', 'The Levite'], answer: 1 },
    { q: 'What did the Samaritan pour on his wounds?', ref: 'Luke 10:34', options: ['Oil and wine', 'Water and salt', 'Honey and milk'], answer: 0 },
    { q: 'What did Jesus say at the end of the story?', ref: 'Luke 10:37', options: ['"Only help your friends"', '"Stay at home"', '"Go, and do thou likewise"'], answer: 2 }
  ],

  music: {
    bpm: 96,
    notes: [62, 0, 65, 0, 67, 69, 67, 65, 62, 0, 60, 0, 62, 0, 0, 0,
            65, 0, 69, 0, 72, 70, 69, 67, 65, 0, 64, 0, 62, 0, 0, 0],
    bass: [38, 38, 43, 43, 41, 41, 38, 38]
  },

  onCallText(kind) {                                                 // said once; after that they just come
    if (ROAD.saidCall) return '';
    ROAD.saidCall = true;
    return kind === 'lamb' ? 'The little lamb follows you!' : 'The donkey follows you, carrying the hurt man gently.';
  },

  /* ---------- ground shape ---------- */
  terrain(x, z) {
    const d = Math.abs(x - roadX(z));
    let h = roadBase(z) + Math.sin(x * 0.5) * Math.cos(z * 0.4) * 0.15;
    if (d > 5) h += (d - 5) * 1.4;                                     // rocky hills either side of the road
    if (Math.abs(z - 16) < 1.8 && x > 7.6 && x < 15) h = roadBase(z) - 3;   // a dry wadi (Builder's bridge)
    return h;
  },

  groundColor(x, z, h) {
    const d = Math.abs(x - roadX(z));
    if (d < 2.2) return (Math.floor(z / 2)) % 2 ? 0xc9a879 : 0xc19f70;   // the road
    if (h < roadBase(z) - 2) return 0x8a6b4a;
    return d > 5 ? 0xa88a62 : 0xb89a6e;
  },

  /* ---------- build ---------- */
  build(api) {
    const T = api.THREE;
    const person = (robe, scarf, s, o) => api.person(robe, scarf, s, o);   // friendly round townsfolk (engine)

    // --- the hurt man, lying by the road ---
    const mx = roadX(ROAD.MAN[1]) + 3.2, mz = ROAD.MAN[1];
    ROAD.MAN = [mx, mz];
    const man = api.storyPerson(0xd6d3d1, 0xe7e5e4, 1, { beard: true, register: false });   // "half dead" by the road (10:30); shown gently, eyes closed
    man.rotation.z = Math.PI / 2; man.position.set(mx, api.terrain(mx, mz) + 0.32, mz); man.userData.storyActor.eyes.scale.y = 0.15; api.add(man);
    ROAD.manMesh = man;
    api.rock(mx + 2.2, mz - 1, 0.9);

    // --- care supplies along the upper road ---
    const supply = (kind) => {
      const g = new T.Group();
      if (kind === 'bandage') { const b = new T.Mesh(new T.CylinderGeometry(0.28, 0.28, 0.5, 12), api.mat(0xf5f5f4)); b.rotation.z = Math.PI / 2; g.add(b); }
      else { const j = new T.Mesh(new T.CylinderGeometry(0.25, 0.35, 0.65, 12), api.mat(kind === 'oil' ? 0xca8a04 : 0x7f1d1d)); g.add(j); }
      return g;
    };
    [['oil', 33, 2.4], ['wine', 21, -2.6], ['bandage', 9, 2.6]].forEach(([kind, z, off]) => {
      const x = roadX(z) + off;
      ROAD.supplies.push(api.carryable({
        x, z, mesh: supply(kind), name: kind === 'bandage' ? 'bandages' : kind, to: 'the hurt man',
        deliverTo: { x: mx, z: mz, r: 3 },
        onDeliver(p) {
          api.task('care');
          api.servant(p, 6, 'for caring for a stranger!');
        }
      }));
    });

    // --- rolling boulders across the road (jump them or wait) ---
    [24, 4, -18].forEach((z, i) => {
      const b = new T.Mesh(new T.DodecahedronGeometry(0.85, 0), api.mat(0x8b7d6b)); b.castShadow = true; api.add(b);
      ROAD.boulders.push({ mesh: b, z, x: -16, speed: 4.5 + i * 0.6, wait: i * 1.3 });
    });

    // --- the priest and the Levite (they pass by on the other side) ---
    [[0xfafafa, 0x7c3aed], [0xe5e7eb, 0x0e7490]].forEach(([robe, scarf], i) => {
      const w = api.storyPerson(robe, scarf, 1, { beard: true, register: false }); w.visible = false; api.add(w);
      const sash = new T.Mesh(new T.TorusGeometry(0.37, 0.05, 6, 18), api.mat(scarf)); sash.rotation.x = Math.PI / 2; sash.position.y = 0.6; w.userData.storyActor.body.add(sash);
      ROAD.walkers.push({ mesh: w, t: -1, delay: i * 4 });
    });

    const ix = roadX(ROAD.INN[1]), iz = ROAD.INN[1];
    ROAD.INN = [ix, iz];                                                 // set before the donkey's deliverTo
    // --- the donkey (carries the man to the inn once he is cared for) ---
    const donkey = new T.Group();
    const beast = api.animalMesh('donkey'); donkey.add(beast);                // a round donkey with walking legs
    const rider = api.storyPerson(0xd6d3d1, 0xf5f5f4, 0.8, { beard: true, register: false }); rider.position.y = (beast.userData.back || 1.12) - 0.05; rider.visible = false; donkey.add(rider);
    rider.userData.storyActor.feet.forEach((f) => { f.visible = false; }); LEVEL._bandage(api, rider);   // bound up, sitting on the beast (10:34)
    ROAD.rider = rider;
    ROAD.donkey = api.follower({
      x: mx - 2, z: mz - 3, kind: 'donkey', mesh: donkey,
      deliverTo: { x: ROAD.INN[0], z: ROAD.INN[1] + 3, r: 3 },
      parkAt: [ROAD.INN[0] + 2.5, api.terrain(ROAD.INN[0] + 2.5, ROAD.INN[1] + 3), ROAD.INN[1] + 3],
      onDeliver(p) {
        api.task('inn');
        api.servant(p, 10, 'for bringing him to safety!');
        api.toast('🏠 At the inn, the Samaritan paid the host and said, "Take care of him" (Luke 10:35).', 4500);
      }
    });
    ROAD.donkey.state = 'parked';                                      // waits until the man is cared for

    // --- the inn in Jericho ---
    api.box({ x: ix, z: iz - 4, w: 9, d: 5, h: 3.6, color: 0xd8c39c });
    const sign = new T.Mesh(new T.BoxGeometry(1.6, 0.8, 0.1), api.texMat(0x92400e, 'wood')); sign.position.set(ix + 3, 2.6, iz - 1.4); api.add(sign);
    const keeper = api.storyPerson(0x166534, 0xf5f5f4, 1, { beard: true }); keeper.position.set(ix - 2, api.terrain(ix - 2, iz - 1), iz - 1); api.add(keeper); ROAD.keeper = keeper;
    [[-8.5, -41], [8, -34], [-9, -31], [8, -43]].forEach(([dx, z]) => { const x = roadX(z) + dx * 0.75; api.box({ x, z, w: 4.4, d: 4.4, h: 3.2, color: 0xd1bb92 }); });

    // --- fragment 1: the crumbling ledges (an optional shortcut down the cliff) ---
    [[-4.5, 13.5, 1], [-6, 11, 2], [-4.5, 8.5, 3]].forEach(([x, z, i]) => api.crumble({ x: roadX(z) + x, z, top: api.terrain(roadX(z), z) + 1.2 + i * 0.6 }));
    api.fragment({ x: roadX(8.5) - 4.5, z: 8.5, y: api.terrain(roadX(8.5), 8.5) + 3 + 1.3 });

    // --- fragment 2: the Builder repairs the bridge over the dry wadi ---
    for (let i = 0; i < 4; i++) ROAD.bridge.push(api.box({ x: 8 + i * 1.9, z: 16, w: 1.9, d: 2.2, h: 0.35, y: roadBase(16) + 0.6 + i * 0.15, hidden: true, color: 0xa0703c }));
    api.box({ x: 15.9, z: 16, w: 2.2, d: 3.4, h: 6, y: roadBase(16) - 3.5, color: 0x9a8a72 });   // rock pillar across the wadi (top = road + 2.5)
    api.fragment({ x: 15.9, z: 16, y: roadBase(16) + 2.5 + 1.3 });
    api.hazard({ x: 11.3, z: 16, w: 7.4, d: 3.6 }, { maxY: roadBase(16) - 2, msg: 'Down in the wadi! The Builder can fix the bridge.' });
    const planks = new T.Mesh(new T.BoxGeometry(1.4, 0.4, 2), api.mat(0xa0703c)); planks.position.set(roadX(19) + 3, api.terrain(roadX(19) + 3, 19) + 0.2, 19); api.add(planks);
    api.interact({
      x: roadX(19) + 3, z: 19, r: 2.4, vRange: 3, label: 'Fix bridge',
      can: (p) => (p.role.id === 'builder' ? true : 'Planks for a bridge. The Builder could fix it (Tab / RB to switch).'),
      use(p) {
        this.remove(); planks.visible = false;
        ROAD.bridge.forEach((b) => b.show(true));
        api.sfx('build'); api.servant(p, 3);
        api.toast('🔨 The Builder fixed the bridge over the wadi!', 2500);
      }
    });

    // --- fragment 3: a lost lamb on the hillside (the Shepherd calls it home to its pen) ---
    const penX = roadX(-26) - 4.5, penZ = -26;
    [[0, -1.6, 3.4, 0.2], [-1.6, 0, 0.2, 3.4], [1.6, 0, 0.2, 3.4]].forEach(([dx, dz, w, d]) => api.box({ x: penX + dx, z: penZ + dz, w, d, h: 3.4, color: 0x8b5e34 }));   // too tall to jump
    ROAD.pen = api.box({ x: penX, z: penZ + 1.6, w: 3.4, d: 0.2, h: 3.4, color: 0x8b5e34 });
    api.fragment({ x: penX, z: penZ, y: api.terrain(penX, penZ) + 1.2 });
    ROAD.lamb = api.follower({
      x: roadX(-8) - 9.5, z: -8, kind: 'lamb',
      deliverTo: { x: penX, z: penZ + 3.2, r: 2.2 },
      parkAt: [penX + 2.6, api.terrain(penX + 2.6, penZ + 3), penZ + 3],
      onDeliver(p) {
        ROAD.pen.show(false);
        api.servant(p, 4, 'for finding the lost lamb!');
        api.toast('🐑 The lamb is home. The pen gate opens!', 2500);
      }
    });

    // --- Golden Scroll challenge course: along the left shoulder of the lower road ---
    const plan = [['block', 1.0], ['float', 1.0], ['crumble', 0.9], ['crumble', 0.8], ['float', 0.2], ['spring', 0.3], ['float', 4.2], ['crumble', 0.6], ['float', 0.6]];
    let ctop = 0;
    api.course(plan.map(([kind, rise], i) => {
      const z = 2.4 - i * 3.0, x = roadX(z) - 4.2 + (i % 2 ? 0.3 : -0.3);
      ctop = i === 0 ? api.terrain(x, z) + 1.0 : ctop + rise;
      return { x, z, top: ctop, kind };
    }));

    api.leaves([[roadX(36), 36], [roadX(28), 28], [roadX(20), 20], [roadX(14), 14], [roadX(6), 6], [roadX(-6), -6], [roadX(-12), -12],
      [roadX(-20), -20], [roadX(-28), -28], [roadX(-34), -34], [roadX(11), 11, api.terrain(roadX(11), 11) + 3.2]]);
    LEVEL._dress(api);
  },

  update(api, dt) {
    LEVEL._poses(api, dt);
    // rolling boulders cross the road again and again
    ROAD.boulders.forEach((b) => {
      if (b.wait > 0) { b.wait -= dt; b.mesh.visible = false; return; }
      b.mesh.visible = true;
      b.x += b.speed * dt;
      if (b.x > 16) { b.x = -16; b.wait = 1.5 + Math.random() * 1.5; }
      const y = api.terrain(b.x, b.z) + 0.8;
      b.mesh.position.set(b.x, y, b.z);
      b.mesh.rotation.z -= b.speed * dt * 1.2;
      api.activePlayers().forEach((p) => {
        if (Math.hypot(p.pos.x - b.x, p.pos.z - b.z) < 1.3 && p.pos.y - y < 0.5) api.hit(p, b.x - 1, p.pos.z, 'bump', 'Look out for rolling rocks! Jump over them, or wait for them to pass.');
      });
    });
    // when someone reaches the hurt man: the priest and the Levite pass by on the other side
    const near = api.near(ROAD.MAN[0], ROAD.MAN[1], 9).length > 0;
    if (near && !ROAD.sawMan) {
      ROAD.sawMan = true;
      ROAD.walkers.forEach((w) => { w.t = 0; w.mesh.visible = true; });
      api.story([
        { art: '🚶', text: 'And by chance there came down a certain priest that way: and when he saw him, he passed by on the other side.', ref: 'Luke 10:31' },
        { art: '🚶', text: 'And likewise a Levite, when he was at the place, came and looked on him, and passed by on the other side.', ref: 'Luke 10:32' },
        { art: '💛', text: 'But a certain Samaritan, as he journeyed, came where he was: and when he saw him, he had compassion on him,', ref: 'Luke 10:33' }
      ], () => api.toast('🤝 Jews and Samaritans did not get along. But the Samaritan stopped to help. Help him: bring oil, wine and bandages!', 5000));
    }
    ROAD.walkers.forEach((w) => {
      if (w.t < 0) return;
      w.t += dt;
      const k = Math.max(0, w.t - w.delay) / 14;
      if (k >= 1) { w.mesh.visible = false; return; }
      const z = ROAD.MAN[1] - 10 + k * 34;
      const x = roadX(z) - 3.2;                                        // the other side of the road
      w.mesh.position.set(x, api.terrain(x, z), z);
      w.mesh.rotation.y = 0;
      const a = w.mesh.userData.storyActor; if (a) { api.posePerson(w.mesh, { dt, stride: 0.8, expression: 'calm' }); a.head.rotation.y = -0.5; }   // looking away as he passes
    });
    // cared for: he is set on the donkey
    if (!ROAD.cared && api.taskDone('care')) {
      ROAD.cared = true;
      ROAD.manMesh.visible = false; ROAD.rider.visible = true; if (ROAD.samaritan) ROAD.samaritanAt = 'walking';
      ROAD.donkey.state = 'idle';
      api.toast('🫏 He bound up his wounds and set him on his own beast (Luke 10:34). Lead the donkey gently down to the inn in Jericho. Watch out for the rolling rocks!', 5000);
    }
  },

  /* ---------- presentation only: nothing here is solid, and no rule changes. This is Jesus' story (a parable). ---------- */
  _bandage(api, m) {
    const T = api.THREE, a = m.userData.storyActor, white = api.texMat(0xf8f5ee, 'cloth');
    const head = new T.Mesh(new T.TorusGeometry(0.33, 0.06, 6, 16), white); head.rotation.x = Math.PI / 2; head.position.y = 0.32; a.head.add(head);
    const arm = new T.Mesh(new T.CylinderGeometry(0.12, 0.12, 0.16, 10), white); arm.position.y = -0.2; a.arms[0].add(arm);
  },

  _dress(api) {
    const T = api.THREE, g = new T.Group();
    const M = (geo, mat, x, y, z) => { const m = new T.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true; g.add(m); return m; };
    // the steep, rocky road down to Jericho: scrub and loose stones on the shoulders
    const scrub = [0x7a7a46, 0x6b6e3e, 0x8a8350].map((c) => new T.MeshLambertMaterial({ color: c }));
    for (let i = 0; i < 40; i++) { const z = 42 - i * 2.1, sd = i % 2 ? 1 : -1, x = roadX(z) + sd * (3.4 + (i % 3) * 0.6); if (Math.abs(z - 16) < 2.5 && x > 7) continue; const b = M(new T.SphereGeometry(0.35 + (i % 3) * 0.1, 8, 6), scrub[i % 3], x, api.terrain(x, z) + 0.2, z); b.scale.y = 0.6; }
    for (let i = 0; i < 24; i++) { const z = 40 - i * 3.4, x = roadX(z) + (i % 2 ? 2.6 : -2.7); const st = M(new T.DodecahedronGeometry(0.18 + (i % 3) * 0.05, 0), api.texMat(0xa09382, 'stone'), x, api.terrain(x, z) + 0.1, z); st.scale.y = 0.6; }
    // the inn's yard: a trough, hay and a hitching post
    const [ix, iz] = ROAD.INN;
    M(new T.BoxGeometry(1.6, 0.5, 0.6), api.texMat(0x9a8a72, 'stone'), ix + 4.2, api.terrain(ix + 4.2, iz - 0.6) + 0.25, iz - 0.6);
    M(new T.ConeGeometry(0.7, 0.8, 10), api.texMat(0xd2b25a, 'weave'), ix - 4.4, api.terrain(ix - 4.4, iz - 1) + 0.4, iz - 1);
    M(new T.CylinderGeometry(0.08, 0.1, 1.3, 8), api.texMat(0x6b4a2c, 'wood'), ix + 3.4, api.terrain(ix + 3.4, iz + 0.8) + 0.65, iz + 0.8);
    api.scenery(g);
    [['PalmTree_1', roadX(-40) - 7, -40, 7], ['PalmTree_3', roadX(-30) + 7.4, -30, 6.5], ['PalmTree_2', roadX(-44) + 6, -44, 7]].forEach(([n, x, z, h]) => { const m = api.model(n, h); if (!m) return; const t = new T.Group(); t.position.set(x, api.terrain(x, z), z); t.rotation.y = x + z; t.add(m); api.add(t); api.fadeScenery(t, 2.6); });
    // the Samaritan (10:33): he comes after the priest and the Levite, kneels by the man, walks beside his donkey, and pays the innkeeper (10:35)
    const sam = api.storyPerson(0x1f6f6a, 0xeadcb8, 1.02, { beard: true, register: false }); sam.visible = false; api.add(sam); ROAD.samaritan = sam; ROAD.samaritanAt = 'away';
    const coins = new T.Group(); [0, 1].forEach((k) => { const c = new T.Mesh(new T.CylinderGeometry(0.07, 0.07, 0.02, 10), api.texMat(0xd8c070, 'gold')); c.position.set(0, -0.08 + k * 0.03, 0.06); coins.add(c); }); coins.visible = false; sam.userData.storyActor.hands[1].add(coins); ROAD.coins = coins;   // "two pence"
    // a traveller at the top of the road knows the way (optional; just for our game)
    const trav = api.storyPerson(0x8a6d4a, 0xece2c8, 1, { beard: true, staff: true }); const tx = roadX(40) + 3.6; trav.position.set(tx, api.terrain(tx, 41.4), 41.4); trav.rotation.y = -2.4; api.add(trav); ROAD.traveller = trav;
    ROAD.travellerTalk = api.conversation({
      person: trav, speaker: 'A traveller', label: 'Talk with the traveller',
      clue(api) {
        const s = ROAD.supplies.find((it) => !it.delivered && !it.holder);
        if (!ROAD.sawMan) return { text: 'Be careful on this road: rocks roll across it. Pick up the oil, wine and bandages on your way down.', at: s ? [s.x, s.y + 1, s.z] : undefined };
        if (s) return { text: 'A man is hurt down the road. Bring him oil, wine and bandages.', at: [s.x, s.y + 1, s.z] };
        if (!api.taskDone('inn')) return { text: 'Lead the donkey gently down to the inn in Jericho.', at: [ROAD.INN[0], api.terrain(ROAD.INN[0], ROAD.INN[1]) + 1.5, ROAD.INN[1] + 2] };
        return { text: 'He showed mercy to a stranger.' };
      }
    });
  },

  _poses(api, dt) {
    const S = ROAD.samaritan, [mx, mz] = ROAD.MAN;
    if (S) {
      if (ROAD.samaritanAt === 'away' && ROAD.sawMan && ROAD.walkers.every((w) => w.t > w.delay + 2)) {   // after the other two have passed
        ROAD.samaritanAt = 'kneeling'; S.visible = true; S.position.set(mx - 1.2, api.terrain(mx - 1.2, mz) , mz + 0.4); S.rotation.y = Math.PI / 2;
      }
      const a = S.userData.storyActor;
      if (ROAD.samaritanAt === 'kneeling') { a.rig.position.y = -0.3; a.feet.forEach((f) => { f.visible = false; }); api.posePerson(S, { dt, expression: 'worry', headPitch: 0.4 }); a.arms.forEach((arm) => { arm.rotation.x = -0.9; }); }
      if (ROAD.samaritanAt === 'walking') {
        a.rig.position.y = 0; a.feet.forEach((f) => { f.visible = true; });
        const d = ROAD.donkey, side = 1.1, x = d.pos.x + Math.cos(d.mesh.rotation.y) * side, z = d.pos.z - Math.sin(d.mesh.rotation.y) * side;
        S.position.set(x, api.terrain(x, z), z); S.rotation.y = d.mesh.rotation.y;
        api.posePerson(S, { dt, stride: d.walkAmt || 0, expression: 'calm' });
        if (api.taskDone('inn')) { ROAD.samaritanAt = 'paying'; S.position.set(ROAD.INN[0] - 0.8, api.terrain(ROAD.INN[0] - 0.8, ROAD.INN[1] - 1), ROAD.INN[1] - 1); S.rotation.y = -Math.PI / 2; ROAD.coins.visible = true; }
      }
      if (ROAD.samaritanAt === 'paying') { api.posePerson(S, { dt, expression: 'calm', talking: true }); a.arms[1].rotation.x = -1.3; }   // "Take care of him" (10:35)
    }
    if (ROAD.rider && ROAD.rider.visible) api.posePerson(ROAD.rider, { dt, expression: 'calm', headPitch: 0.2 });
    if (ROAD.keeper) api.posePerson(ROAD.keeper, { dt, expression: 'calm', talking: ROAD.samaritanAt === 'paying' && api.time % 4 < 2 });
    if (ROAD.traveller) api.posePerson(ROAD.traveller, { dt, expression: 'calm' });
  },

  objective(api) {
    const ps = api.activePlayers();
    if (!ps.length) return null;
    if (ps.some((p) => p.holding && ROAD.supplies.indexOf(p.holding) >= 0)) return [ROAD.MAN[0], api.terrain(ROAD.MAN[0], ROAD.MAN[1]) + 1.5, ROAD.MAN[1]];
    const cx = ps.reduce((s, p) => s + p.pos.x, 0) / ps.length, cz = ps.reduce((s, p) => s + p.pos.z, 0) / ps.length;
    const s = ROAD.supplies.filter((it) => !it.delivered && !it.holder).sort((a, b) => Math.hypot(a.x - cx, a.z - cz) - Math.hypot(b.x - cx, b.z - cz))[0];
    if (s) return [s.x, s.y + 1, s.z];
    const d = ROAD.donkey;
    if (d.state === 'idle') return [d.pos.x, d.pos.y + 2, d.pos.z];
    return [ROAD.INN[0], api.terrain(ROAD.INN[0], ROAD.INN[1]) + 1.5, ROAD.INN[1] + 2];
  },

  finale: {
    message: '🏠 Everyone gather at the inn!',
    beacon: [roadX(-38), 3, -35.5],
    inZone(p) { return Math.hypot(p.pos.x - ROAD.INN[0], p.pos.z - (ROAD.INN[1] + 2.5)) < 6; },
    onUpdate(api, t) {
      if (t > 0.5 && !ROAD.told) {
        ROAD.told = true;
        api.story([
          { art: '💛', title: 'Who was the neighbour?', text: 'And he said, He that shewed mercy on him. Then said Jesus unto him, Go, and do thou likewise.', ref: 'Luke 10:37' },
          { art: '✝️', title: 'The best Neighbour', text: 'We were like that hurt man: we could not save ourselves from sin. Jesus came all the way to us, paid what it cost, and made us whole. He is the best Neighbour of all.' }
        ], () => { ROAD.endT = api.time; });
      }
      return ROAD.endT !== undefined && api.time - ROAD.endT > 2;
    }
  }
};
