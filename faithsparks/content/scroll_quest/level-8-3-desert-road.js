/* =====================================================================
 * LEVEL 8-3: THE DESERT ROAD  (Acts 8:26-39; Isaiah 53:7)
 * ---------------------------------------------------------------------
 * The road that goes down from Jerusalem toward Gaza, which is desert. Walk toward -z:
 *   The wadi     (z 30..26)  hop the stones over a dry gully (a fall = a bubble)
 *   The road     (z 20..-30) a chariot rolls slowly along the winding road: "Philip ran thither"
 *                            (Acts 8:30). Catch it by jumping onto its back, and ride along
 *   The water    (0, -34)    "See, here is water" (Acts 8:36)
 * The Ethiopian reads Isaiah 53; Philip tells him about Jesus. Baptism follows believing (Acts 8:37):
 * it is never a reward for the game. Thread: 5-4 (Isaiah 53 written down) is fulfilled.
 * Only edit THIS file to change the level. See GEMINI.md and CAMPAIGN.md.
 * ===================================================================== */

const DESERT = {
  ROAD: [[0, 20], [10, 14], [10, 4], [-8, -2], [-8, -14], [4, -22], [0, -29]],
  REST: 3,                      // the chariot waits at this bend if nobody has caught it yet
  WATER: [0, -34],
  s: 0, len: 0, segs: [],
  phase: 'drive',               // drive → wait → told → ride → there
  chariot: null, deco: null,
  steps: [],
  told: false
};

function desertAt(s) {
  let r = s;
  for (const sg of DESERT.segs) {
    if (r <= sg.d) { const k = sg.d ? r / sg.d : 0; return [sg.a[0] + (sg.b[0] - sg.a[0]) * k, sg.a[1] + (sg.b[1] - sg.a[1]) * k, Math.atan2(sg.b[0] - sg.a[0], sg.b[1] - sg.a[1])]; }
    r -= sg.d;
  }
  const last = DESERT.segs[DESERT.segs.length - 1];
  return [last.b[0], last.b[1], Math.atan2(last.b[0] - last.a[0], last.b[1] - last.a[1])];
}
(function () {
  for (let i = 0; i + 1 < DESERT.ROAD.length; i++) {
    const a = DESERT.ROAD[i], b = DESERT.ROAD[i + 1], d = Math.hypot(b[0] - a[0], b[1] - a[1]);
    DESERT.segs.push({ a, b, d }); DESERT.len += d;
    if (i + 1 === DESERT.REST) DESERT.restS = DESERT.len;
  }
})();
function onRoad(x, z) {
  for (const sg of DESERT.segs) {
    const vx = sg.b[0] - sg.a[0], vz = sg.b[1] - sg.a[1], k = Math.max(0, Math.min(1, ((x - sg.a[0]) * vx + (z - sg.a[1]) * vz) / (sg.d * sg.d)));
    if (Math.hypot(x - sg.a[0] - vx * k, z - sg.a[1] - vz * k) < 1.4) return true;
  }
  return false;
}

const LEVEL = {
  id: '8-3',
  bibleConnection: {"passage": "Acts 8:26–40", "text": "Philip explained that Isaiah’s suffering servant passage points to Jesus. The Ethiopian believed, was baptized and went on rejoicing. Our chariot chase and ride explore their meeting; speed and puzzle success do not create faith."},
  world: 'World 8-3',
  title: 'The Desert Road',
  leafIcon: '🪙',
  leafColor: 0xfacc15,
  spawn: [0, 42],
  bounds: { minX: -19, maxX: 19, minZ: -40, maxZ: 46 },
  approach: ['stones', 'meadow:ox', 'mover'],   // the way in (engine): a stretch before the level's own start
  startMessage: 'Philip, go south on the desert road! Catch up with the chariot ahead.',

  intro: [
    { text: 'Then the Spirit said unto Philip, Go near, and join thyself to this chariot.', ref: 'Acts 8:29' },
    { text: 'Then Philip opened his mouth, and began at the same scripture, and preached unto him Jesus.', ref: 'Acts 8:35' }
  ],

  introStory: [
    { art: '🛣️', title: 'Toward the south', text: 'And the angel of the Lord spake unto Philip, saying, Arise, and go toward the south unto the way that goeth down from Jerusalem unto Gaza, which is desert.', ref: 'Acts 8:26' },
    { art: '🐎', title: 'Join thyself to this chariot', text: 'Then the Spirit said unto Philip, Go near, and join thyself to this chariot.', ref: 'Acts 8:29' }
  ],

  tasks: [
    { id: 'catch', icon: '🏃', label: 'Catch up with the chariot', total: 1 },
    { id: 'ride', icon: '🐎', label: 'Ride along to the water', total: 1, lockedUntil: 'catch' }
  ],

  memoryVerse: { text: 'Then Philip opened his mouth, and began at the same scripture, and preached unto him Jesus.', ref: 'Acts 8:35' },

  ending: {
    verse: { text: 'and he went on his way rejoicing.', ref: 'Acts 8:39' },
    message: 'Isaiah wrote about the Lamb; Philip told who He is: Jesus. The man from Ethiopia believed and went home rejoicing.'
  },

  quiz: [
    { q: 'Which prophet was the man in the chariot reading?', ref: 'Acts 8:30', options: ['Jonah', 'Esaias (Isaiah)', 'Moses'], answer: 1 },
    { q: 'Who did Philip say the scripture was about?', ref: 'Acts 8:35', options: ['Jesus', 'King David', 'Philip himself'], answer: 0 },
    { q: 'What did the man say he believed?', ref: 'Acts 8:37', options: ['That he was rich', 'That Jesus Christ is the Son of God', 'That the road was long'], answer: 1 }
  ],

  music: {
    bpm: 104,
    notes: [62, 0, 65, 67, 69, 0, 67, 65, 62, 0, 60, 0, 62, 0, 0, 0,
            62, 0, 65, 67, 72, 0, 69, 67, 65, 64, 62, 0, 62, 0, 0, 0],
    bass: [50, 50, 46, 46, 48, 48, 45, 45]
  },

  /* ---------- ground: desert, the wadi, the oasis ---------- */
  terrain(x, z) {
    let h = Math.sin(x * 0.23) * Math.cos(z * 0.17) * 0.25;
    const w = Math.abs(z - 28);
    if (w < 2.4) h -= 2.6 * Math.min(1, (2.4 - w) / 0.6);
    const o = Math.hypot(x - DESERT.WATER[0], z - DESERT.WATER[1]);
    if (o < 3.6) h -= 0.9 * Math.min(1, (3.6 - o) / 0.8);
    return h;
  },

  groundColor(x, z, h) {
    if (Math.hypot(x - DESERT.WATER[0], z - DESERT.WATER[1]) < 4.6) return 0x7fa35a;   // green round the water
    if (onRoad(x, z)) return 0xb89466;
    return (Math.floor(x / 3) + Math.floor(z / 3)) % 2 ? 0xe3c58e : 0xdcbc84;
  },

  /* ---------- build ---------- */
  build(api) {
    const T = api.THREE;

    // --- the wadi: stepping stones ---
    api.hazard({ x: 0, z: 28, w: 40, d: 4 }, { maxY: -1.3, msg: 'Down in the dry gully! Hop across on the stones.' });
    [[0.6, 29.6], [-0.6, 28], [0.6, 26.4]].forEach(([x, z]) => api.stump(x, z, 2.9, 0.75));
    api.camZone({ minX: -5, maxX: 5, minZ: 23, maxZ: 33, yaw: 0.35, height: 7, back: 11, focus: [0, 0, 25], pull: 0.4 });
    api.armor('sandals', 0, 36);            // feet shod with the gospel of peace: Philip ran

    // --- the chariot: a moving platform you can jump onto, with horses and the man from Ethiopia ---
    DESERT.chariot = api.mover({ w: 2.6, h: 0.4, d: 2.6, color: 0x7a4a2a, path: () => { const q = desertAt(DESERT.s); return [q[0], 0.6, q[1]]; } });
    const deco = new T.Group();
    [[-1.4, 0], [1.4, 0]].forEach(([dx]) => { const wl = new T.Mesh(new T.TorusGeometry(0.55, 0.1, 8, 18), api.mat(0x5b3a1e)); wl.rotation.y = Math.PI / 2; wl.position.set(dx, 0.55, 0); deco.add(wl); });
    [[-0.7, 3.2], [0.7, 3.2]].forEach(([dx, dz]) => { const h = api.animalMesh('horse'); h.position.set(dx, 0, dz); deco.add(h); });
    const man = api.person(0x6d28d9, 0xfacc15, 1, { skin: 0x6b3f22, band: true }); man.position.set(0, 1.0, 0.7); man.rotation.y = Math.PI; deco.add(man);
    const roll = new T.Mesh(new T.CylinderGeometry(0.1, 0.1, 0.6, 8), api.mat(0xf5e6c4)); roll.rotation.z = Math.PI / 2; roll.position.set(0, 1.7, 0.3); deco.add(roll);
    const shade = new T.Mesh(new T.ConeGeometry(1.3, 0.5, 12), api.mat(0xfacc15)); shade.position.set(0, 3.0, 0.8); deco.add(shade);
    const pole = new T.Mesh(new T.CylinderGeometry(0.04, 0.04, 2, 6), api.mat(0x5b3a1e)); pole.position.set(0, 1.9, 0.8); deco.add(pole);
    api.add(deco); DESERT.deco = deco;
    const q0 = desertAt(0); deco.position.set(q0[0], 0.2, q0[1]);
    api.camZone({ minX: -12, maxX: 13, minZ: -6, maxZ: 17, yaw: 0.25, height: 9, back: 13, focus: [0, 1, 0], pull: 0.25 });

    // --- palms and rocks along the way ---
    [[-6, 18], [14, 8], [-13, -4], [8, -12], [-12, -20], [-6.2, -36], [6.2, -37], [-5.6, -29.8]].forEach(([x, z], i) => api.tree(x, z, 0.9 + (i % 3) * 0.12, 0x4f8a3a));
    [[6, 30], [-9, 12], [14, -2], [-14, -26]].forEach(([x, z]) => api.rock(x, z, 1.1));

    // --- the water ---
    const pool = new T.Mesh(new T.CircleGeometry(3.4, 28), new T.MeshLambertMaterial({ color: 0x3b82c4, transparent: true, opacity: 0.85 }));
    pool.rotation.x = -Math.PI / 2; pool.position.set(DESERT.WATER[0], -0.75, DESERT.WATER[1]); api.add(pool);
    api.fragment({ x: DESERT.WATER[0] + 2, z: DESERT.WATER[1] - 1, y: -0.3, net: true });

    // --- fragments ---
    // 2: a rock pillar overlook (only the Scribe jumps that high)
    api.box({ x: -13, z: 36, w: 3, d: 3, y: -0.4, h: 5.4, color: 0xb08d63, house: false });
    api.box({ x: -10.5, z: 39, w: 1.6, d: 1.6, y: -0.4, h: 2.4, color: 0x9a8f80, house: false });
    api.fragment({ x: -13, z: 36, y: 5 + 1.3 });
    // 3: the Builder makes steps up a broken watchtower
    api.box({ x: 13, z: -24, w: 3, d: 3, y: -0.4, h: 3.8, color: 0xb08d63, house: false });
    [[13, -19.6, 1.2], [13, -21.6, 2.3]].forEach(([x, z, top]) => DESERT.steps.push(api.box({ x, z, w: 1.6, d: 1.6, h: 0.35, y: top - 0.35, hidden: true, color: 0xa0703c })));
    const planks = new T.Mesh(new T.BoxGeometry(1.4, 0.4, 2), api.mat(0xa0703c)); planks.position.set(15.6, 0.2, -17); api.add(planks);
    api.interact({
      x: 15.6, z: -17, r: 2.2, label: 'Build steps',
      can: (p) => (p.role.id === 'builder' ? true : 'Some planks. The Builder could make steps up the watchtower (Tab / RB to switch).'),
      use(p) { this.remove(); planks.visible = false; DESERT.steps.forEach((s) => s.show(true)); api.sfx('build'); api.servant(p, 3); }
    });
    api.fragment({ x: 13, z: -24, y: 3.4 + 1.3 });

    // --- Golden Scroll course: a rocky ridge along the west ---
    api.course([
      { x: -16.4, z: 22, top: 0.95, kind: 'block' },
      { x: -17.0, z: 18.8, top: 2.1, kind: 'float' },
      { x: -16.4, z: 15.6, top: 3.0, kind: 'crumble' },
      { x: -17.0, z: 12.4, top: 3.8, kind: 'float' },
      { x: -16.4, z: 9.2, top: 4.6, kind: 'crumble' },
      { x: -17.0, z: 6.0, top: 5.0, kind: 'spring' },
      { x: -16.4, z: 2.8, top: 9.2, kind: 'float' },
      { x: -17.0, z: -0.4, top: 9.8, kind: 'crumble' },
      { x: -16.4, z: -3.6, top: 10.4, kind: 'float' }
    ]);

    api.leaves([[0, 39], [0, 33], [0.6, 29.6, 2.9], [-0.6, 28, 2.9], [0.6, 26.4, 2.9], [0, 22], [5, 17], [10, 10], [4, 1], [-3, -0.5], [-8, -8], [-2, -18], [2, -25]]);
  },

  update(api, dt) {
    const D = DESERT, ch = D.chariot;
    const aboard = api.activePlayers().filter((p) => p.onGround && Math.abs(p.pos.x - ch.pos.x) < 1.35 && Math.abs(p.pos.z - ch.pos.z) < 1.35 && p.pos.y > ch.platform.top - 0.3);
    if (D.phase === 'drive') {
      D.s = Math.min(D.restS, D.s + dt * 1.5);
      if (D.s >= D.restS) D.phase = 'wait';
    }
    if ((D.phase === 'drive' || D.phase === 'wait') && aboard.length) {
      D.phase = 'told';
      api.task('catch'); aboard.forEach((p) => api.servant(p, 5, 'for running to the chariot!'));
      api.sfx('fanfare');
      api.story([
        { art: '📜', title: 'He was reading Isaiah', text: 'The place of the scripture which he read was this, He was led as a sheep to the slaughter; and like a lamb dumb before his shearer, so opened he not his mouth:', ref: 'Acts 8:32' },
        { art: '💬', title: 'He preached unto him Jesus', text: 'Then Philip opened his mouth, and began at the same scripture, and preached unto him Jesus.', ref: 'Acts 8:35' }
      ], () => { D.phase = 'ride'; api.toast('🐎 "Philip ran thither" (Acts 8:30) and sat with him. Ride along! The chariot moves while someone is on it.', 4500); });
    }
    if (D.phase === 'ride') {
      if (aboard.length) D.s = Math.min(D.len, D.s + dt * 2.4);
      if (D.s >= D.len) { D.phase = 'there'; api.task('ride'); api.activePlayers().forEach((p) => api.servant(p, 3)); }
    }
    const q = desertAt(D.s);
    D.deco.position.set(ch.pos.x, 0.2, ch.pos.z);
    D.deco.rotation.y += ((q[2] - D.deco.rotation.y + Math.PI * 3) % (Math.PI * 2) - Math.PI) * Math.min(1, dt * 3);
  },

  objective(api) {
    const ch = DESERT.chariot;
    if (!api.taskDone('catch') || DESERT.phase === 'ride') return [ch.pos.x, 2.4, ch.pos.z];
    return [DESERT.WATER[0], 1, DESERT.WATER[1] + 3.5];
  },

  finale: {
    message: '💧 Everyone come to the water!',
    beacon: [0, 2, -30],
    inZone(p) { return Math.hypot(p.pos.x - DESERT.WATER[0], p.pos.z - DESERT.WATER[1]) < 6.5; },
    onUpdate(api, t) {
      if (t > 0.5 && !DESERT.told) {
        DESERT.told = true;
        api.story([
          { art: '💧', title: 'See, here is water', text: 'And as they went on their way, they came unto a certain water: and the eunuch said, See, here is water; what doth hinder me to be baptized? And Philip said, If thou believest with all thine heart, thou mayest. And he answered and said, I believe that Jesus Christ is the Son of God.', ref: 'Acts 8:36–37' },
          { art: '🙌', title: 'He believed', text: 'He believed first, then Philip baptized him in the water (Acts 8:38). Baptism is not a prize to earn: it follows trusting Jesus, the Lamb Isaiah wrote about.' },
          { art: '😊', title: 'On his way rejoicing', text: 'And when they were come up out of the water, the Spirit of the Lord caught away Philip, that the eunuch saw him no more: and he went on his way rejoicing.', ref: 'Acts 8:39' }
        ], () => { DESERT.endT = api.time; api.sfx('win'); });
      }
      return DESERT.endT !== undefined && api.time - DESERT.endT > 2;
    }
  }
};
