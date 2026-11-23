/* =====================================================================
 * LEVEL 1-4: THE RAINBOW PROMISE  (Genesis 8–9)
 * ---------------------------------------------------------------------
 * Linear walk, start → finish (players walk toward -z, downhill):
 *   Mountaintop  (z 44..30)  the ark rests on Ararat; Breastplate of Righteousness
 *   Windy ridge  (z 30..2)   a narrow winding ridge; gusts blow sideways
 *   Valley       (z 2..-44)  the flood water is going down; rainbow crystals, altar stones
 * One idea: the windy ridge (the camera looks down on it so the edges are clear). Tasks happen on the
 * way: light 7 rainbow crystals by running through them + carry 3 stones to build an altar of thanks
 * (Genesis 8:20).
 * The crystals are just a game activity. The rainbow is God's sign: He sets it in the
 * sky at the finale (Genesis 9:13); the kids do not make it.
 * Only edit THIS file to change the level. See GEMINI.md.
 * ===================================================================== */

const RAIN = {
  crystals: [],
  stones: [],
  streaks: [],
  rainbow: null,
  rainbowShown: false,
  gustSeen: 0,
  warned: 0,
  lastWarn: -1,
  gust: 0,            // current gust strength (signed: + blows toward +x)
  ALTAR: [0, -38],
  TOP: 14             // mountaintop height
};

// centre line of the winding ridge (used by terrain, crystals and the test)
function ridgeX(z) { return 5 * Math.sin((z - 2) * 0.2); }
function ridgeTop(z) { return z >= 30 ? RAIN.TOP : z <= 2 ? 0 : RAIN.TOP * (z - 2) / 28; }

const LEVEL = {
  id: '1-4',
  bibleConnection: {"passage": "Genesis 8:20–22; 9:8–17", "text": "Noah built an altar after the flood, and God gave the rainbow as His covenant sign. The ridge and colored crystals are game activities. They do not make God’s promise or create His rainbow."},
  world: 'World 1-4',
  title: 'The Rainbow Promise',
  sky: 0xa5d8ff,
  ambient: 0.85,
  leafIcon: '🫒',
  leafColor: 0x65a30d,
  spawn: [-3, 40],
  bounds: { minX: -19, maxX: 19, minZ: -54, maxZ: 46 },
  approach: ['stones', 'meadow:ox', 'mover'],   // the way in (engine): a stretch before the level's own start
  startMessage: 'Climb down the windy mountain! Run through the crystals to light them ↓',

  intro: [
    { text: 'And the ark rested in the seventh month, on the seventeenth day of the month, upon the mountains of Ararat.', ref: 'Genesis 8:4' },
    { text: 'I do set my bow in the cloud, and it shall be for a token of a covenant between me and the earth.', ref: 'Genesis 9:13' }
  ],

  introStory: [
    { art: '🕊️', text: 'And the dove came in to him in the evening; and, lo, in her mouth was an olive leaf pluckt off: so Noah knew that the waters were abated from off the earth.', ref: 'Genesis 8:11' },
    { art: '⛰️', title: 'Out of the Ark!', text: 'The flood is over! Climb down the windy mountain, light the seven rainbow crystals, and build an altar to thank God.' }
  ],

  tasks: [
    { id: 'crystals', icon: '💎', label: 'Light the rainbow crystals', total: 7 },
    { id: 'altar', icon: '🪨', label: 'Build the altar of thanks', total: 3 }
  ],

  memoryVerse: { text: 'While the earth remaineth, seedtime and harvest, and cold and heat, and summer and winter, and day and night shall not cease.', ref: 'Genesis 8:22' },

  ending: {
    verse: { text: 'I do set my bow in the cloud, and it shall be for a token of a covenant between me and the earth.', ref: 'Genesis 9:13' },
    message: 'God keeps His promises. Every rainbow reminds us!'
  },

  quiz: [
    { q: 'What sign did God set in the cloud?', ref: 'Genesis 9:13', options: ['A star', 'A rainbow', 'A dove'], answer: 1 },
    { q: 'What did the dove bring back to Noah?', ref: 'Genesis 8:11', options: ['An olive leaf', 'A fish', 'A flower'], answer: 0 },
    { q: 'Where did the ark come to rest?', ref: 'Genesis 8:4', options: ['On a beach', 'In Egypt', 'On the mountains of Ararat'], answer: 2 }
  ],

  music: {
    bpm: 112,
    notes: [72, 0, 76, 0, 79, 0, 84, 0, 83, 0, 79, 0, 76, 0, 0, 0,
            77, 0, 81, 0, 79, 77, 76, 0, 74, 0, 76, 0, 72, 0, 0, 0],
    bass: [48, 48, 53, 53, 55, 55, 48, 48]
  },

  /* ---------- ground shape ---------- */
  terrain(x, z) {
    if (z > 2) {                                                       // mountain + ridge
      const top = ridgeTop(z);
      const half = z >= 30 ? 9 : 3.2;                                  // wide top, narrow ridge
      const cx = z >= 30 ? 0 : ridgeX(z);
      const d = Math.abs(x - cx);
      const bump = Math.sin(x * 0.7) * Math.cos(z * 0.5) * 0.15;
      if (d < half) return top + bump;
      return Math.max(-3, top - (d - half) * 30) + bump;               // sheer cliffs: falling always ends in a bubble
    }
    let h = Math.sin(x * 0.3) * 0.3 + Math.cos(z * 0.23) * 0.3;        // valley
    h += Math.max(0, Math.abs(x) - 15) * 1.6;
    const lake = Math.hypot((x - 12) / 6, (z + 16) / 10);              // the flood water still going down
    if (lake < 1) h -= 2.8 * Math.min(1, (1 - lake) * 4);
    return h;
  },

  groundColor(x, z, h) {
    if (z > 2 && h < ridgeTop(z) - 1) return h < -1.5 ? 0x475569 : 0x78716c;   // cliffs
    if (z <= 2 && h < -0.8) return 0x2563eb;
    if (z > 30) return (Math.floor(x / 3) + Math.floor(z / 3)) % 2 ? 0x84a95b : 0x7a9f52;
    if (z > 2) return Math.abs(x - ridgeX(z)) < 1.2 ? 0xa8a27e : Math.sin(x * 2.1 + z * 1.3) > 0.4 ? 0x8f9a6c : 0x97a172;   // the ridge: a worn track along the middle
    if (z <= 2 && h < -0.2) return 0x6e6248;                                        // mud the flood water left behind
    return (Math.floor(x / 3) + Math.floor(z / 3)) % 2 ? 0x6cc65f : 0x60b954;
  },

  /* ---------- build ---------- */
  build(api) {
    const T = api.THREE;

    // --- the ark resting on the mountain ---
    // (beside the path, not behind the players, so it never blocks the camera)
    const AX = 6, AZ = 37;
    LEVEL._ark(api, AX, AZ);                                            // a boat-shaped hull, a house with windows, the door open (presentation)
    api.box({ x: AX, z: AZ, w: 5, h: 3, d: 12, y: RAIN.TOP, color: 0x7a5230 }).mesh.visible = false;   // collision only

    // animals stretching their legs (they wander; calling them is just for fun)
    [['sheep', -6, 38], ['sheep', -7, 36], ['goat', 1, 41], ['dove', 1, 35]].forEach(([kind, x, z]) => api.follower({ x, z, kind }));

    // Breastplate of Righteousness: stand firm in the wind
    api.armor('breastplate', -1, 35);

    // old flood water around the mountain + hazard (falling off the ridge)
    const flood = new T.Mesh(new T.PlaneGeometry(60, 46), new T.MeshLambertMaterial({ color: 0x3b82f6, transparent: true, opacity: 0.7 }));
    flood.rotation.x = -Math.PI / 2; flood.position.set(0, -1.7, 24); api.add(flood);   // (all round the mountain top too: falling off is always a bubble)
    api.hazard({ x: 0, z: 24, w: 60, d: 44 }, { maxY: -1.4, msg: 'Whoosh! Blown off the ridge. Lean into the wind, or wear the Breastplate 🦺' });

    // the lake in the valley (Fisherman can wade)
    const lake = new T.Mesh(new T.CircleGeometry(1, 32), new T.MeshLambertMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.75 }));
    lake.rotation.x = -Math.PI / 2; lake.scale.set(6, 10, 1); lake.position.set(12, -0.7, -16); api.add(lake);
    api.hazard({ x: 12, z: -16, w: 12, d: 20 }, { maxY: -0.6, except: (p) => p.role.id === 'fisherman', msg: 'Splash! The flood water is still deep here (the Fisherman can wade).' });

    // --- rainbow crystals: stand on the pad until it lights ---
    const colors = [0xef4444, 0xf97316, 0xfacc15, 0x22c55e, 0x3b82f6, 0x6366f1, 0xa855f7];
    const names = ['red', 'orange', 'yellow', 'green', 'blue', 'indigo', 'violet'];
    const spots = [
      [-6, 33, RAIN.TOP],                       // red: mountaintop
      [ridgeX(22), 22, ridgeTop(22)],           // orange: windy ridge
      [ridgeX(11), 11, ridgeTop(11)],           // yellow: windy ridge
      [-8, -6, null],                           // green: valley
      [3, -30, null],                           // blue: valley
      [-12, -20, 6],                            // indigo: top of the tall rock (ride the lift)
      [10, -34, null]                           // violet: valley
    ];
    spots.forEach(([x, z, y], i) => {
      const gy = y === null ? api.terrain(x, z) : y;
      const pedestal = new T.Mesh(new T.CylinderGeometry(0.5, 0.7, 0.6, 8), api.texMat(0xd6d3d1, 'stone'));
      pedestal.position.set(x, gy + 0.3, z); api.add(pedestal);
      const gem = new T.Mesh(new T.OctahedronGeometry(0.55), new T.MeshLambertMaterial({ color: colors[i], transparent: true, opacity: 0.55 }));
      gem.position.set(x, gy + 1.4, z); api.add(gem);
      const c = { x, z, y: gy, gem, lit: false, name: names[i] };
      c.zone = api.zone({
        x, z, y: gy, r: 1.8, time: 0.3, color: colors[i],
        onDone(helpers) {
          c.lit = true;
          gem.material.opacity = 1; gem.material.emissive = new T.Color(colors[i]).multiplyScalar(0.6);
          api.puff(x, gy + 1.4, z, colors[i], 14);
          api.sfx('coin');
          api.task('crystals');
          helpers.forEach((p) => api.servant(p, 3));
          // (it shines: the board counts it)
        }
      });
      RAIN.crystals.push(c);
    });

    // tall rock with a lift beside it (indigo crystal on top)
    RAIN.tallRock = api.box({ x: -12, z: -20, w: 3.4, h: 6 - api.terrain(-12, -20), d: 3.4, y: api.terrain(-12, -20), color: 0x8b8178 });
    api.mover({ w: 2.4, h: 0.4, d: 2.4, path: [[-9, api.terrain(-9, -20) - 0.1, -20], [-9, 5.6, -20]], speed: 1.8, wait: 1.2 });

    // --- altar of thanks: carry 4 stones to it ---
    const ax = RAIN.ALTAR[0], az = RAIN.ALTAR[1];
    const base = new T.Mesh(new T.CylinderGeometry(2, 2.2, 0.3, 10), api.texMat(0xa8a29e, 'stone'));
    base.position.set(ax, api.terrain(ax, az) + 0.15, az); api.add(base);
    const pile = [];
    for (let i = 0; i < 3; i++) {
      const s = new T.Mesh(new T.BoxGeometry(1.3 - i * 0.2, 0.6, 1.1 - i * 0.16), api.texMat(0x9ca3af, 'stone'));
      s.position.set(ax, api.terrain(ax, az) + 0.55 + i * 0.55, az); s.rotation.y = i * 0.5; s.visible = false; api.add(s);
      pile.push(s);
    }
    [[-6, -12, false], [2, -8, false], [7, -30, true]].forEach(([x, z, heavy]) => {
      const rock = new T.Mesh(new T.DodecahedronGeometry(heavy ? 0.75 : 0.5, 0), api.mat(heavy ? 0x6b7280 : 0x9ca3af));
      rock.castShadow = true;
      const g = new T.Group(); g.add(rock);
      RAIN.stones.push(api.carryable({
        x, z, mesh: g, heavy,
        deliverTo: { x: ax, z: az, r: 3.2 },
        onDeliver(p) {
          api.task('altar');
          pile[api.taskCount('altar') - 1].visible = true;
          api.servant(p, 8, 'for building the altar!');
          api.sfx('build');
          // (the altar grows: you can see it)
        }
      }));
    });

    // --- fragments ---
    // 1: a rocky outcrop beside the windy ridge (jump across the gap)
    const oz = 17, ox = ridgeX(oz) + 5.6, otop = ridgeTop(oz) + 0.3;
    api.stump(ox, oz, otop - api.terrain(ox, oz), 1.2);
    api.fragment({ x: ox, z: oz, y: otop + 1.4 });
    // 2: the Fisherman nets it from the lake
    api.fragment({ x: 12, z: -11, y: 0.6, net: true });
    // 3: climb the stumps in the valley corner
    api.stump(-11, -29, 1.2);
    api.stump(-13, -31.5, 2.4);
    api.stump(-14, -34.5, 3.6);
    api.fragment({ x: -14, z: -34.5, y: api.terrain(-14, -34.5) + 3.6 + 1.4 });

    // --- a few olive trees in the valley ---
    [[-14, -4], [14, -2], [-15, -14], [15, -36], [-6, -44], [8, -44]].forEach(([x, z]) => api.tree(x, z, 0.9, 0x65a30d));

    // --- wind streaks (only visible during gusts) ---
    for (let i = 0; i < 14; i++) {
      const s = new T.Mesh(new T.BoxGeometry(2.4, 0.06, 0.06), new T.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0 }));
      api.add(s);
      RAIN.streaks.push({ mesh: s, off: Math.random() * 20, y: Math.random() * 3, z: (Math.random() - 0.5) * 12 });
    }

    // --- the rainbow (appears when all crystals are lit) ---
    const bow = new T.Group();
    colors.forEach((c, i) => {
      const arc = new T.Mesh(new T.TorusGeometry(15 - i * 0.6, 0.32, 6, 64, Math.PI), new T.MeshBasicMaterial({ color: c, transparent: true, opacity: 0, depthWrite: false }));
      bow.add(arc);
    });
    bow.position.set(0, -2, -50);
    bow.rotation.x = -0.55;                                            // lean toward the camera so kids can see it
    api.add(bow);
    RAIN.rainbow = bow;

    // --- Golden Scroll challenge course (across the valley sky): blocks, crumbling platforms, a spring ---
    api.course([
      { x: 14, z: -39.4, top: 0.46, kind: 'block' },
      { x: 10.6, z: -40.6, top: 1.46, kind: 'float' },
      { x: 7.2, z: -39.4, top: 2.36, kind: 'crumble' },
      { x: 3.8, z: -40.6, top: 3.16, kind: 'crumble' },
      { x: 0.4, z: -39.4, top: 3.36, kind: 'float' },
      { x: -3, z: -40.6, top: 3.66, kind: 'spring' },
      { x: -6.4, z: -39.4, top: 7.86, kind: 'float' },
      { x: -9.8, z: -40.6, top: 8.46, kind: 'crumble' },
      { x: -13.2, z: -39.4, top: 9.06, kind: 'float' }
    ]);

    api.leaves([[-3, 36], [-2, 32], [ridgeX(27), 27], [ridgeX(19), 19], [ridgeX(15), 15], [ridgeX(7), 7], [ridgeX(4), 4],
      [0, -2], [-4, -10], [4, -14], [0, -20], [-2, -28], [5, -34], [0, -42], [-9, -20, 7.2]]);

    // --- camera: look down on the windy ridge (both edges in view); low and wide at the altar to see the rainbow ---
    api.camZone({ minX: -12, maxX: 12, minZ: 2, maxZ: 30, yaw: 0, height: 14, back: 10, pull: 0 });
    api.camZone({ minX: -8, maxX: 8, minZ: -44, maxZ: -32, yaw: 0, height: 6.5, back: 13, focus: [0, 6, -48], pull: 0.35 });
    LEVEL._dress(api);
  },

  /* ---------- presentation only: nothing here is solid, and no rule changes ---------- */
  _ark(api, AX, AZ) {
    const T = api.THREE, g = new T.Group(), TOP = RAIN.TOP;
    const pitch = api.texMat(0x3b2817, 'wood'), plank = api.texMat(0x8a5f36, 'wood'), roofMat = api.texMat(0x6b4a2c, 'wood'), dark = new T.MeshLambertMaterial({ color: 0x1c140c });
    const M = (geo, mat, x, y, z) => { const m = new T.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true; g.add(m); return m; };
    const sh = new T.Shape(), lift = (u) => Math.max(0, Math.abs(u) - 4.2) / 2.0;
    sh.moveTo(-6.4, TOP + 0.6); for (let u = -6.4; u <= 6.41; u += 0.4) sh.lineTo(u, TOP + 3 + lift(u) * lift(u) * 1.2);
    sh.lineTo(6.4, TOP + 0.6); sh.quadraticCurveTo(0, TOP - 0.4, -6.4, TOP + 0.6);
    const hull = M(new T.ExtrudeGeometry(sh, { depth: 5, bevelEnabled: false }), pitch, AX - 2.5, 0, AZ); hull.rotation.y = Math.PI / 2;   // pitched within and without (Genesis 6:14)
    for (let k = 0; k < 3; k++) [-1, 1].forEach((sd) => M(new T.BoxGeometry(0.05, 0.08, 11.4), plank, AX + sd * 2.53, TOP + 1.0 + k * 0.7, AZ));
    M(new T.BoxGeometry(3.6, 2.1, 7.4), plank, AX, TOP + 4.05, AZ);
    for (let z = -2.8; z <= 2.9; z += 1.4) [-1, 1].forEach((sd) => M(new T.BoxGeometry(0.06, 0.4, 0.8), dark, AX + sd * 1.83, TOP + 4.8, AZ + z));   // the window under the roof (6:16)
    [-1, 1].forEach((sd) => { const r = M(new T.BoxGeometry(2.6, 0.22, 8.2), roofMat, AX + sd * 1.0, TOP + 5.55, AZ); r.rotation.z = -sd * 0.5; });
    M(new T.BoxGeometry(1.5, 1.8, 0.08), dark, AX - 2.54, TOP + 2.0, AZ + 1.2).rotation.y = Math.PI / 2;   // the open door in the side (6:16)
    const ramp = M(new T.BoxGeometry(1.4, 0.15, 3.4), plank, AX - 3.75, TOP + 0.8, AZ + 1.2); ramp.rotation.z = 0.5;   // the door let down: they went forth (8:18)
    api.scenery(g);
  },

  _dress(api) {
    const T = api.THREE, g = new T.Group();
    const M = (geo, mat, x, y, z) => { const m = new T.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true; g.add(m); return m; };
    RAIN.tallRock.mesh.material = api.texMat(0x8b8178, 'stone');
    // driftwood the flood left in the valley, and fresh flowers
    [[-3.6, -4.6, 0.6], [6.6, -24, 2.1], [-9.4, -36, 1.2], [13.6, -30, 0.3]].forEach(([x, z, r]) => { const l = M(new T.CylinderGeometry(0.18, 0.24, 2.6, 7), api.texMat(0x8c7a64, 'bark'), x, api.terrain(x, z) + 0.18, z); l.rotation.set(Math.PI / 2, 0, r); });
    const petals = [0xf9a8d4, 0xfde68a, 0xffffff, 0xc4b5fd].map((c) => new T.MeshLambertMaterial({ color: c }));
    for (let i = 0; i < 40; i++) { const x = Math.sin(i * 5.1) * 13, z = -3 - (i * 1.07) % 40; if (Math.hypot((x - 12) / 6, (z + 16) / 10) < 1.15 || Math.hypot(x, z + 38) < 3.6) continue; M(new T.SphereGeometry(0.12, 6, 4), petals[i % 4], x, api.terrain(x, z) + 0.12, z); }
    api.scenery(g);
    // Noah's household went forth from the ark (Genesis 8:18) and wait by the place for the altar
    const look = [[0x8a6d4a, 0xf5f0e6, { beard: true, age: 'elder', staff: true }], [0x9b5c4a, 0xe9d8b4, { age: 'elder' }],
      [0x4b6b8a, 0xe7dcc4, { beard: true }], [0x7a5b8f, 0xd9c49a, {}], [0x6b7f45, 0xe2d2a9, { beard: true }], [0xa0624a, 0xcdb48a, {}], [0x8a5a3a, 0xf0e2c2, { beard: true }], [0x4f7a76, 0xe6d6b0, {}]];
    const [ax, az] = RAIN.ALTAR, spots = [[-1.4, -43], [1.6, -43.2], [-5.6, -42.6], [5.2, -42.6], [-6.2, -36.4], [6.2, -36.6], [-7.4, -39.6], [7.4, -39.8]];
    RAIN.family = look.map(([robe, scarf, o], i) => { const [x, z] = spots[i], m = api.storyPerson(robe, scarf, 1, o); m.position.set(ax + x, api.terrain(ax + x, az + z - az), z); m.rotation.y = Math.atan2(ax - (ax + x), az - z); api.add(m); return m; });
    RAIN.noah = RAIN.family[0];
    // one of Noah's sons on the mountaintop knows the way down (optional; just for our game)
    const son = api.storyPerson(0x4b6b8a, 0xe7dcc4, 1, { beard: true }); son.position.set(1.8, RAIN.TOP, 43.4); son.rotation.y = -2.6; api.add(son); RAIN.son = son;
    RAIN.sonTalk = api.conversation({
      person: son, speaker: 'Shem, Noah\'s son', label: 'Talk with Shem',
      clue(api) {
        const c = RAIN.crystals.find((x) => !x.lit);
        if (c) return { text: 'Down the windy ridge to the valley! Stand by each crystal to light it. Hold steady when the wind blows.', at: [c.x, c.y + 1, c.z] };
        const st = RAIN.stones.find((x) => !x.delivered && !x.holder);
        if (st) return { text: 'My father wants to thank God. Carry stones to the altar in the valley.', at: [st.x, st.y + 1, st.z] };
        return { text: 'Go to the altar. Everyone is gathering there!', at: [RAIN.ALTAR[0], api.terrain(RAIN.ALTAR[0], RAIN.ALTAR[1]) + 1, RAIN.ALTAR[1]] };
      }
    });
  },

  _poses(api, dt) {
    const t = api.time, built = api.taskDone('altar'), bow = RAIN.rainbowShown;
    (RAIN.family || []).forEach((m, i) => {
      api.posePerson(m, { dt, expression: bow ? 'wonder' : 'calm', cheer: bow && i > 1 && t % 6 < 2, headPitch: bow ? -0.35 : 0 });
      if (i === 0 && built && !bow) { const a = m.userData.storyActor; a.arms.forEach((arm) => { arm.rotation.x = -2.3; }); }   // Noah lifts his hands in thanks (8:20)
    });
    if (RAIN.son) api.posePerson(RAIN.son, { dt, expression: 'calm' });
  },

  update(api, dt) {
    // gusts on the ridge: 1 s warning, then 1.2 s of wind, every 6 s, alternating sides
    const cyc = api.time % 6, side = Math.floor(api.time / 6) % 2 ? 1 : -1;
    const warn = cyc > 3.8 && cyc < 4.8, blow = cyc >= 4.8;
    RAIN.gust = blow ? side * 2.2 : 0;   // 2.2 × 1.2 s ≈ 2.6 units: from the middle you stay on
    const onRidge = api.activePlayers().filter((p) => p.pos.z < 30 && p.pos.z > 2);
    if (blow && onRidge.length) {
      onRidge.forEach((p) => api.push(p, RAIN.gust, 0, dt));
      if (RAIN.gustSeen === 0) {
        RAIN.gustSeen = 1;
        api.verse('A wind over the earth', 'And God remembered Noah, and every living thing, and all the cattle that was with him in the ark: and God made a wind to pass over the earth, and the waters asswaged;', 'Genesis 8:1');
      }
    }
    const cycleNo = Math.floor(api.time / 6);
    if (warn && onRidge.length && RAIN.warned < 2 && RAIN.lastWarn !== cycleNo) {
      RAIN.lastWarn = cycleNo; RAIN.warned++;
      api.toast('💨 Wind coming from the ' + (side > 0 ? 'left' : 'right') + '! Hold steady!', 1500);
    }
    // streaks follow the group on the ridge
    const c = onRidge[0];
    RAIN.streaks.forEach((s, i) => {
      const show = c && (warn || blow);
      s.mesh.material.opacity = show ? (blow ? 0.7 : 0.25) : 0;
      if (!show) return;
      const t = (api.time * 14 + s.off) % 20 - 10;
      s.mesh.position.set(c.pos.x + t * side, c.pos.y + 0.5 + s.y, c.pos.z + s.z);
    });
    if (api.taskDone('crystals') && !RAIN.crystalsSaid) {
      RAIN.crystalsSaid = true;
      if (!api.taskDone('altar')) api.toast('💎 All seven crystals shine! Now build the altar to thank God.', 3000);
    }
    // the rainbow fades in during the finale, when God sets it in the cloud
    if (RAIN.rainbowShown) RAIN.rainbow.children.forEach((a) => { a.material.opacity = Math.min(0.85, a.material.opacity + dt * 0.4); });
    LEVEL._poses(api, dt);
  },

  objective(api) {
    const ps = api.activePlayers();
    if (!ps.length) return null;
    if (ps.some((p) => p.holding)) return [RAIN.ALTAR[0], api.terrain(RAIN.ALTAR[0], RAIN.ALTAR[1]) + 1, RAIN.ALTAR[1]];
    const cx = ps.reduce((s, p) => s + p.pos.x, 0) / ps.length;
    const cz = ps.reduce((s, p) => s + p.pos.z, 0) / ps.length;
    const todo = [];
    RAIN.crystals.forEach((c) => { if (!c.lit) todo.push([c.x, c.y + 1, c.z]); });
    RAIN.stones.forEach((s) => { if (!s.delivered && !s.holder) todo.push([s.x, s.y + 1, s.z]); });
    if (!todo.length) return null;
    // prefer what is downhill-next (larger z first), then nearest
    todo.sort((a, b) => Math.hypot(a[0] - cx, a[2] - cz) - Math.hypot(b[0] - cx, b[2] - cz));
    return todo[0];
  },

  finale: {
    message: '🌈 Everyone gather at the altar to thank God!',
    beacon: [0, 3, -38],
    inZone(p) { return Math.hypot(p.pos.x - RAIN.ALTAR[0], p.pos.z - RAIN.ALTAR[1]) < 6; },
    onUpdate(api, t) {
      if (t > 0.5 && !RAIN.rainbowShown) { RAIN.rainbowShown = true; api.sfx('fanfare'); }   // God sets His bow in the cloud
      if (t > 2.5 && !RAIN.saidPromise) {
        RAIN.saidPromise = true;
        api.sfx('win');
        api.story([
          { art: '🌈', title: 'God\'s promise', text: 'I do set my bow in the cloud, and it shall be for a token of a covenant between me and the earth.', ref: 'Genesis 9:13' },
          { art: '🌍', text: 'And I will remember my covenant, which is between me and you and every living creature of all flesh; and the waters shall no more become a flood to destroy all flesh.', ref: 'Genesis 9:15' },
          { art: '🙏', text: 'The rainbow is God\'s sign, not ours. He made a promise, and God always keeps His promises. Every time you see a rainbow, remember!' }
        ], () => { RAIN.endT = api.time; });
      }
      return RAIN.endT !== undefined && api.time - RAIN.endT > 2;
    }
  }
};
