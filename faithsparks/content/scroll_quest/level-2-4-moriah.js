/* =====================================================================
 * LEVEL 2-4: THE LORD WILL PROVIDE  (Genesis 22)
 * ---------------------------------------------------------------------
 * Mount Moriah: three switchback ramps climb from the foot (north, z 40) to the top (south).
 *   Terraces: foot (h 0), first terrace (h 3.5), second terrace (h 7), the top (h 10.5).
 *   Abraham and Isaac walk slowly up the path ahead of you (they wait for you). Quiet, no rush.
 * Tasks: carry 4 bundles of wood to the top; help build the altar.
 * Told gently: God provides a ram in Isaac's place. Thread: Jesus is the Lamb God provided.
 * Only edit THIS file to change the level. See GEMINI.md and CAMPAIGN.md.
 * ===================================================================== */

const MORIAH = {
  wood: [],
  H: [0, 3.5, 7, 10.5],
  BANDS: [[20, 12, 9, 13], [2, -6, -13, -9], [-16, -24, 9, 13]],   // [north z, south z, lane min x, lane max x]
  ALTAR: [0, -31],
  THICKET: [5, -34.5],
  PATH: [[2, 31], [11, 23], [11, 9], [-11, 4], [-11, -9], [11, -14], [11, -27], [-1.5, -29.5]],
  walkers: null,
  climbed: false,
  built: false
};

function moriahTier(z) {           // which terrace / band a z position is in
  const B = MORIAH.BANDS;
  if (z >= B[0][0]) return { lo: 0 };
  for (let k = 0; k < 3; k++) {
    if (z >= B[k][1]) return { band: k, lo: MORIAH.H[k], hi: MORIAH.H[k + 1], t: (B[k][0] - z) / (B[k][0] - B[k][1]) };
    if (k < 2 && z >= B[k + 1][0]) return { lo: MORIAH.H[k + 1] };
  }
  return { lo: MORIAH.H[3] };
}

const LEVEL = {
  id: '2-4',
  bibleConnection: {"passage": "Genesis 22:1–14", "text": "God tested Abraham, stopped him from killing Isaac, and provided a ram in Isaac’s place. Our wood and altar tasks explore the climb. The rescue is God’s provision, not a reward for completing the course."},
  world: 'World 2-2',            // shown as 2-2 (Genesis 22, before the well in 24); the id stays '2-4'
  title: 'The LORD Will Provide',
  time: 'day',
  leafIcon: '🌿',
  leafColor: 0x84cc16,
  spawn: [0, 36],
  bounds: { minX: -18, maxX: 18, minZ: -40, maxZ: 40 },
  approach: ['ledge', 'stones', 'crumbles'],   // the way in (engine): a stretch before the level's own start
  startMessage: 'Walk with Abraham and Isaac up the mountain, and bring wood. There is no rush.',

  intro: [
    { text: 'And Abraham said, My son, God will provide himself a lamb for a burnt offering: so they went both of them together.', ref: 'Genesis 22:8' },
    { text: 'The next day John seeth Jesus coming unto him, and saith, Behold the Lamb of God, which taketh away the sin of the world.', ref: 'John 1:29' }
  ],

  introStory: [
    { art: '⛰️', title: 'A hard test', text: 'God tested Abraham, to show whether Abraham trusted Him completely, even with Isaac, the son God had promised.' },
    { art: '💔', text: 'And he said, Take now thy son, thine only son Isaac, whom thou lovest, and get thee into the land of Moriah; and offer him there for a burnt offering upon one of the mountains which I will tell thee of.', ref: 'Genesis 22:2' }
  ],

  tasks: [
    { id: 'wood', icon: '🪵', label: 'Gather wood on the way up', total: 4 },
    { id: 'altar', icon: '🪨', label: 'Help build the altar', total: 1, lockedUntil: 'wood' }
  ],

  memoryVerse: { text: 'The next day John seeth Jesus coming unto him, and saith, Behold the Lamb of God, which taketh away the sin of the world.', ref: 'John 1:29' },

  ending: {
    verse: { text: 'And Abraham called the name of that place Jehovah-jireh: as it is said to this day, In the mount of the LORD it shall be seen.', ref: 'Genesis 22:14' },
    message: 'God provided a ram in Isaac\'s place. He gave Jesus, the Lamb, in ours.'
  },

  quiz: [
    { q: 'What did Isaac ask his father on the way?', ref: 'Genesis 22:7', options: ['"Where is the lamb?"', '"Are we lost?"', '"Can we go home?"'], answer: 0 },
    { q: 'What did God provide instead of Isaac?', ref: 'Genesis 22:13', options: ['A dove', 'A ram caught in a thicket', 'A golden calf'], answer: 1 },
    { q: 'Who is the Lamb of God?', ref: 'John 1:29', options: ['Isaac', 'Abraham', 'Jesus'], answer: 2 }
  ],

  music: {
    bpm: 72,
    notes: [62, 0, 0, 65, 64, 0, 62, 0, 60, 0, 0, 62, 57, 0, 0, 0,
            62, 0, 0, 65, 67, 0, 69, 0, 67, 0, 65, 64, 62, 0, 0, 0],
    bass: [38, 38, 41, 41, 36, 36, 38, 38]
  },

  /* ---------- ground shape ---------- */
  terrain(x, z) {
    const tr = moriahTier(z);
    let h = tr.lo;
    if (tr.band !== undefined) {
      const B = MORIAH.BANDS[tr.band];
      h = (x > B[2] && x < B[3]) ? tr.lo + (tr.hi - tr.lo) * tr.t : tr.hi;   // the ramp lane, or the cliff
    }
    return h + Math.sin(x * 0.5) * Math.cos(z * 0.4) * 0.12 + Math.max(0, Math.abs(x) - 15.5) * 1.5;
  },

  groundColor(x, z, h) {
    const tr = moriahTier(z);
    if (tr.band !== undefined) { const B = MORIAH.BANDS[tr.band]; return (x > B[2] && x < B[3]) ? 0xb59a6d : 0x8a7f6e; }
    if (h > 9) return Math.hypot(x - MORIAH.ALTAR[0], z - MORIAH.ALTAR[1]) < 3.2 ? 0xa59c7a : 0x9c9a6a;   // the top, worn bare round the altar place
    if (Math.abs(z - 31 + (x - 2) * 0.9) < 1.3 && z > 20) return 0xa8946a;                                // the track from the foot to the first ramp
    return Math.sin(x * 1.3) * Math.cos(z * 1.1) > 0.4 ? 0x7d8c52 : 0x86955a;
  },

  /* ---------- build ---------- */
  build(api) {
    const T = api.THREE, H = MORIAH.H;
    const person = (robe, scarf, s, o) => api.storyPerson(robe, scarf, s, o);   // jointed story people (engine)
    const woodMesh = (big) => {
      const g = new T.Group();
      for (let i = 0; i < (big ? 5 : 3); i++) { const l = new T.Mesh(new T.CylinderGeometry(0.1, 0.1, 1.1, 6), api.mat(0x8b5e34)); l.rotation.z = Math.PI / 2; l.position.set(0, (i % 2) * 0.16, (i - 1) * 0.18); g.add(l); }
      const rope = new T.Mesh(new T.BoxGeometry(0.08, 0.4, 0.6), api.mat(0xd6b98c)); g.add(rope);
      return g;
    };

    // --- the cliffs between terraces: stone walls, open only at the ramp lanes ---
    MORIAH.cliffs = [];
    MORIAH.BANDS.forEach(([zn, zs, l0, l1], k) => {
      const lo = H[k] - 0.5, top = H[k + 1] + 0.3, hgt = top - lo;
      MORIAH.cliffs.push(api.box({ x: (-18 + l0) / 2, z: zn - 0.3, w: l0 + 18, d: 0.6, h: hgt, y: lo, color: 0x9a8f80 }));
      MORIAH.cliffs.push(api.box({ x: (18 + l1) / 2, z: zn - 0.3, w: 18 - l1, d: 0.6, h: hgt, y: lo, color: 0x9a8f80 }));
      MORIAH.cliffs.push(api.box({ x: l0 - 0.3, z: (zn + zs) / 2, w: 0.6, d: zn - zs, h: hgt, y: lo, color: 0x9a8f80 }));
      MORIAH.cliffs.push(api.box({ x: l1 + 0.3, z: (zn + zs) / 2, w: 0.6, d: zn - zs, h: hgt, y: lo, color: 0x9a8f80 }));
    });
    [[-13, 36], [14, 30], [-15, 8], [15, 4], [-15.5, -14], [6, -20], [-15, -37], [14, -34]].forEach(([x, z]) => api.tree(x, z, 0.9, 0x557a32));
    [[-4, 26], [6, 16], [-6, 6], [4, -2], [-2, -12], [-8, -14]].forEach(([x, z]) => api.rock(x, z, 0.5));

    // --- Abraham and Isaac (they walk ahead and wait for you) ---
    const abraham = person(0x7c2d12, 0xf5f5f4, 1, { age: 'elder', beard: true });
    const isaac = person(0x1d4ed8, 0xfde68a, 0.75);
    const iw = woodMesh(false); iw.position.set(0, 0.95, -0.42); iw.scale.setScalar(0.8); isaac.userData.storyActor.body.add(iw);   // "laid it upon Isaac his son" (Genesis 22:6)
    api.add(abraham); api.add(isaac);
    MORIAH.walkers = { abraham, isaac, i: 0, x: MORIAH.PATH[0][0], z: MORIAH.PATH[0][1] };

    // --- bundles of wood along the way up: gather each as you pass (one climb, not four trips) ---
    [[-6, 29], [11, 16], [-11, -2], [11, -20]].forEach(([x, z]) => {
      MORIAH.wood.push(api.gatherable({
        x, z, mesh: woodMesh(false), task: 'wood',
        onGet(p) {
          api.servant(p, 5, 'for gathering wood!');
          MORIAH.pile.children[Math.min(3, api.taskCount('wood') - 1)].visible = true;   // the pile on top grows
        }
      }));
    });

    // --- the top: wood pile, altar, the thicket ---
    const [ax, az] = MORIAH.ALTAR;
    const pile = new T.Group();
    for (let i = 0; i < 4; i++) { const w = woodMesh(false); w.position.set(-1.6 + (i % 2) * 0.6, 0.15 + Math.floor(i / 2) * 0.3, 1.4); w.visible = false; pile.add(w); }
    pile.position.set(ax, H[3], az); api.add(pile); MORIAH.pile = pile;
    const altar = new T.Group();
    // a rough altar of field stones, with the wood laid in order on top (Genesis 22:9)
    for (let i = 0; i < 14; i++) { const row = i < 6 ? 0 : i < 11 ? 1 : 2, n = [6, 5, 3][row], k = i - [0, 6, 11][row]; const st = new T.Mesh(new T.DodecahedronGeometry(0.34, 0), api.texMat([0x9c9584, 0x8f8878, 0xa8a090][i % 3], 'stone')); st.scale.set(1.2, 0.75, 1); st.position.set((k - (n - 1) / 2) * 0.55, 0.22 + row * 0.38, (i % 2) * 0.18 - 0.09); st.rotation.set(i, i * 1.7, 0); altar.add(st); }
    for (let i = 0; i < 5; i++) { const l = new T.Mesh(new T.CylinderGeometry(0.09, 0.1, 1.5, 6), api.texMat(0x8b5e34, 'bark')); l.rotation.z = Math.PI / 2; l.rotation.y = (i % 2) * 0.25; l.position.set(0, 1.2 + (i > 2 ? 0.17 : 0), (i % 3 - 1) * 0.22); altar.add(l); }
    altar.position.set(ax, H[3], az - 1); altar.visible = false; api.add(altar); MORIAH.altar = altar;
    MORIAH.altarZone = api.zone({
      x: ax, z: az, r: 2, time: 3, color: 0xfacc15, hidden: true,
      onDone(helpers) {
        MORIAH.built = true; altar.visible = true;
        api.task('altar'); api.sfx('build');
        helpers.forEach((p) => api.servant(p, 4, 'for helping build the altar!'));
        LEVEL._provide(api);
      }
    });
    const thicket = new T.Group();
    // a tangled thicket: dark leafy clumps and bare thorny branches
    for (let i = 0; i < 7; i++) { const b = new T.Mesh(new T.SphereGeometry(0.62 + (i % 3) * 0.12, 9, 7), api.mat([0x3f6212, 0x365314, 0x4d6b1f][i % 3])); b.scale.y = 0.75; b.position.set(Math.cos(i * 0.9) * 1.0, 0.45 + (i % 2) * 0.35, Math.sin(i * 0.9) * 0.65); thicket.add(b); }
    for (let i = 0; i < 9; i++) { const tw = new T.Mesh(new T.CylinderGeometry(0.025, 0.04, 1.3, 4), api.texMat(0x5b4630, 'bark')); tw.position.set(Math.cos(i * 1.7) * 0.9, 0.9 + (i % 3) * 0.2, Math.sin(i * 1.7) * 0.7); tw.rotation.set(Math.sin(i) * 0.9, i, Math.cos(i * 2) * 0.9); thicket.add(tw); }
    thicket.position.set(MORIAH.THICKET[0], H[3], MORIAH.THICKET[1]); api.add(thicket);
    // the ram: a woolly sheep with curled horns, caught in the thicket by his horns (Genesis 22:13)
    const ram = api.animalMesh('sheep'); ram.scale.setScalar(1.15);
    const head = ram.getObjectByName('head') || ram, hornMat = api.texMat(0xcbb994, 'bark');
    [-1, 1].forEach((sd) => { const h = new T.Mesh(new T.TorusGeometry(0.16, 0.055, 6, 12, Math.PI * 1.6), hornMat); h.position.set(sd * 0.22, 0.95, 0.42); h.rotation.set(0, sd * Math.PI / 2, 0.6); ram.add(h); });
    [[0.4, 1.05, 0.55, 0.8], [-0.35, 1.0, 0.6, -0.7]].forEach(([x, y, z, r]) => { const tw = new T.Mesh(new T.CylinderGeometry(0.025, 0.035, 1.0, 4), api.texMat(0x5b4630, 'bark')); tw.position.set(x, y, z); tw.rotation.set(0.3, 0, r); ram.add(tw); });   // branches round his horns
    ram.position.set(MORIAH.THICKET[0] - 0.4, H[3], MORIAH.THICKET[1] + 1.2); ram.rotation.y = -0.6; ram.visible = false; api.add(ram); MORIAH.ram = ram;

    // --- fragment 1: a rock pillar at the foot (only the Scribe jumps that high) ---
    api.box({ x: -14, z: 28.6, w: 1.8, d: 1.8, h: 0.8 - api.terrain(-14, 28.6) + 0.2, y: api.terrain(-14, 28.6) - 0.2, color: 0x8a8f98 });
    api.box({ x: -14, z: 26.2, w: 1.8, d: 1.8, h: 3.8 + 0.2 - api.terrain(-14, 26.2), y: api.terrain(-14, 26.2) - 0.2, color: 0x8a8f98 });
    api.fragment({ x: -14, z: 26.2, y: 3.8 + 1.3 });

    // --- fragment 2: crumbling ledges on the first terrace ---
    [[-14, 10, 1.0], [-12.2, 8, 1.8], [-14, 6, 2.6]].forEach(([x, z, r]) => api.crumble({ x, z, top: H[1] + r }));
    api.box({ x: -14, z: 3.8, w: 2, d: 1.6, h: 3.4, y: H[1], color: 0x8a8f98 });
    api.fragment({ x: -14, z: 3.8, y: H[1] + 3.4 + 1.3 });

    // --- fragment 3: a spring to a high rock on the second terrace ---
    const sp = api.spring({ x: -12, z: -9 });
    api.box({ x: -12, z: -11.6, w: 2.4, d: 2.4, h: 0.4, y: sp.platform.top + 4.2 - 0.4, color: 0x8a8f98 });
    api.fragment({ x: -12, z: -11.6, y: sp.platform.top + 4.2 + 1.3 });

    // --- Golden Scroll challenge course: from the foot up toward the first cliff ---
    const plan = [['block', 1.0], ['float', 1.0], ['crumble', 0.9], ['float', 0.8], ['spring', 0.2], ['float', 4.2], ['crumble', 0.6]];
    let ctop = 0;
    api.course(plan.map(([kind, rise], i) => {
      const z = 36 - i * 2.9, x = -9 + (i % 2 ? 0.3 : -0.3);
      ctop = i === 0 ? api.terrain(x, z) + 1.0 : ctop + rise;
      return { x, z, top: ctop, kind };
    }));

    api.leaves([[0, 30], [11, 18], [11, 14], [0, 8], [-11, -2], [-11, -4], [0, -10], [11, -20], [11, -22], [-6, -28], [6, -27],
      [-14, 10, H[1] + 1.9], [-12, -11.6, sp.platform.top + 5.1], [-14, 28.6, 1.7]]);
    // camera: from the side on the ramps between the terraces, so the climb reads clearly
    api.camZone({ minX: 7, maxX: 15, minZ: 11, maxZ: 21, yaw: 0.8, height: 10, back: 12, focus: [11, H[1], 11], pull: 0.4 });
    api.camZone({ minX: -15, maxX: -7, minZ: -7, maxZ: 3, yaw: -0.8, height: 10, back: 12, focus: [-11, H[2], -7], pull: 0.4 });
    api.camZone({ minX: 7, maxX: 15, minZ: -25, maxZ: -15, yaw: 0.8, height: 10, back: 12, focus: [11, H[3], -26], pull: 0.4 });
    LEVEL._dress(api);
  },

  /* ---------- presentation only: nothing here is solid, and no rule changes ---------- */
  _dress(api) {
    const T = api.THREE, g = new T.Group(), H = MORIAH.H;
    const M = (geo, mat, x, y, z) => { const m = new T.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true; g.add(m); return m; };
    MORIAH.cliffs.forEach((c) => { c.mesh.material = api.texMat(0x9a8f80, 'stone'); });
    // loose stones along the outer edge of each ramp lane, so the way up reads at a glance
    MORIAH.BANDS.forEach(([zn, zs, l0, l1], k) => { for (let z = zn - 1; z > zs + 0.5; z -= 1.6) [l0 + 0.55, l1 - 0.55].forEach((x, j) => { const t = (zn - z) / (zn - zs), y = H[k] + (H[k + 1] - H[k]) * t; const st = M(new T.DodecahedronGeometry(0.2 + ((z * 7 + j) % 3) * 0.04, 0), api.texMat(0xa39a88, 'stone'), x, y + 0.1, z); st.scale.y = 0.6; }); });
    // the land of Moriah: far hills all round
    [[-40, 14, 44, 40, 5], [40, -4, 46, 44, 6], [-36, -58, 60, 34, 7], [34, -60, 52, 36, 6], [0, -78, 80, 36, 8]].forEach(([x, z, w, d, h], i) => { const m = api.rockMass({ x, z, w, d, h, color: [0x7f845a, 0x8a8660, 0x77805a][i % 3], seed: i * 1.7 }); m.position.y = -2.5; });   // low rolling hills, not peaks
    // the place at the top: a few rocks and one gnarled tree beside the altar place
    [[-3.6, -33.2], [3.2, -28.4], [-4.2, -28.6]].forEach(([x, z], i) => { const r = M(new T.DodecahedronGeometry(0.45 + i * 0.1, 0), api.texMat(0x9c9584, 'stone'), x, H[3] + 0.2, z); r.scale.y = 0.6; });
    api.scenery(g);
    const tree = api.model('CommonTree_5', 4.2); if (tree) { const t = new T.Group(); t.position.set(-6.2, H[3], -35.4); t.add(tree); api.add(t); api.fadeScenery(t, 2.4); }
    // Abraham carries the fire (a little pot of coals, 22:6)
    const a = MORIAH.walkers.abraham.userData.storyActor, pot = new T.Group();
    pot.add(new T.Mesh(new T.CylinderGeometry(0.12, 0.09, 0.16, 10), api.texMat(0x8a4a2a, 'clay')));
    const coal = new T.Mesh(new T.SphereGeometry(0.08, 8, 6), new T.MeshBasicMaterial({ color: 0xff8a3a })); coal.position.y = 0.08; pot.add(coal);
    pot.position.set(0, -0.12, 0.08); a.hands[1].add(pot);
    // the two young men wait at the foot with the donkey (22:3, 22:5); one is happy to talk (optional; just for our game)
    const donkey = api.animalMesh('donkey'); donkey.position.set(6.4, api.terrain(6.4, 37.6), 37.6); donkey.rotation.y = -2.2; api.add(donkey); MORIAH.donkey = donkey;
    MORIAH.servants = [[4.8, 36.4, 0x6b5a3a], [7.4, 35.6, 0x4f5f6b]].map(([x, z, robe], i) => { const m = api.storyPerson(robe, 0xe6d8b6, 1, { beard: i === 0 }); m.position.set(x, api.terrain(x, z), z); m.rotation.y = Math.PI - 0.4; api.add(m); return m; });
    MORIAH.servantTalk = api.conversation({
      person: MORIAH.servants[0], speaker: 'Abraham\'s young man', label: 'Talk with the young man',
      clue(api) {
        if (!api.taskDone('wood')) { const w = MORIAH.wood.find((x) => !x.got); return { text: 'Abraham told us to wait here with the donkey. Go up with them, and gather wood on the way.', at: w ? [w.x, api.terrain(w.x, w.z) + 1.5, w.z] : undefined }; }
        if (!api.taskDone('altar')) return { text: 'The wood is at the top now. Abraham is building the altar.', at: [MORIAH.ALTAR[0], MORIAH.H[3] + 1.5, MORIAH.ALTAR[1]] };
        return { text: 'They are coming back down together!' };
      }
    });
  },

  _poses(api, dt, moved) {
    const W = MORIAH.walkers, t = api.time, walking = moved > 0.4, provided = MORIAH.ram && MORIAH.ram.visible;
    [W.abraham, W.isaac].forEach((m, i) => {
      api.posePerson(m, { dt, stride: walking ? 0.8 : 0, expression: provided ? 'wonder' : i ? 'listen' : 'calm', headPitch: provided ? -0.25 : 0 });
      if (i === 1 && !provided) { const a = m.userData.storyActor; a.arms.forEach((arm) => { arm.rotation.x = -2.6; arm.rotation.z *= 0.3; }); }   // both hands up, steadying the wood on his back
    });
    if (provided && MORIAH.endT === undefined) { const a = W.abraham.userData.storyActor; a.arms[0].rotation.x = -2.2; }   // Abraham lifts a hand to the LORD
    (MORIAH.servants || []).forEach((m) => api.posePerson(m, { dt, expression: 'calm' }));
  },

  // God provides: told gently on story cards
  _provide(api) {
    api.music(false);
    api.story([
      { art: '✋', text: 'And he said, Lay not thine hand upon the lad, neither do thou any thing unto him: for now I know that thou fearest God, seeing thou hast not withheld thy son, thine only son from me.', ref: 'Genesis 22:12' },
      { art: '🐏', text: 'And Abraham lifted up his eyes, and looked, and behold behind him a ram caught in a thicket by his horns: and Abraham went and took the ram, and offered him up for a burnt offering in the stead of his son.', ref: 'Genesis 22:13' }
    ], () => { api.music(true); });
    MORIAH.ram.visible = true;
  },

  update(api, dt) {
    // Abraham and Isaac walk slowly up the path, waiting when nobody is near
    const W = MORIAH.walkers, P = MORIAH.PATH;
    P.forEach(([px, pz], k) => { if (k > (MORIAH.reached || 0) && api.near(px, pz, 4).length) MORIAH.reached = k; });   // how far up anyone has walked
    if (W.i < P.length - 1) {
      const ahead = (MORIAH.reached || 0) > W.i;
      if (ahead || api.near(W.x, W.z, 11).length > 0) {
        const [tx, tz] = P[W.i + 1], dx = tx - W.x, dz = tz - W.z, d = Math.hypot(dx, dz);
        const sp = ((MORIAH.reached || 0) > W.i + 1 ? 6 : 2.4) * dt;      // hurry to catch up if you are far ahead
        if (d <= sp) { W.x = tx; W.z = tz; W.i++; } else { W.x += dx / d * sp; W.z += dz / d * sp; }
        W.face = Math.atan2(dx, dz);
      }
    }
    const fx = Math.sin(W.face || Math.PI), fz = Math.cos(W.face || Math.PI);
    const moved = W.lastX === undefined ? 0 : Math.hypot(W.x - W.lastX, W.z - W.lastZ) / Math.max(dt, 1e-3); W.lastX = W.x; W.lastZ = W.z;
    W.abraham.position.set(W.x, api.terrain(W.x, W.z), W.z); W.abraham.rotation.y = W.face || 0;
    const ix = W.x - fx * 1.2 + fz * 0.6, iz = W.z - fz * 1.2 - fx * 0.6;
    W.isaac.position.set(ix, api.terrain(ix, iz), iz); W.isaac.rotation.y = W.face || 0;
    LEVEL._poses(api, dt, moved);
    // on the first terrace: Isaac's question
    if (!MORIAH.climbed && api.activePlayers().some((p) => p.pos.y > MORIAH.H[1] - 0.3 && p.pos.z < 12)) {
      MORIAH.climbed = true;
      api.story([
        { art: '❓', text: 'And Isaac spake unto Abraham his father, and said, My father: and he said, Here am I, my son. And he said, Behold the fire and the wood: but where is the lamb for a burnt offering?', ref: 'Genesis 22:7' },
        { art: '🐑', text: 'And Abraham said, My son, God will provide himself a lamb for a burnt offering: so they went both of them together.', ref: 'Genesis 22:8' }
      ]);
    }
    if (!MORIAH.zoneShown && api.taskDone('wood')) {
      MORIAH.zoneShown = true; MORIAH.altarZone.show(true);
      api.toast('🪨 All the wood is here. Help Abraham build the altar (stand in the gold ring).', 3500);
    }
  },

  objective(api) {
    const ps = api.activePlayers();
    if (!ps.length) return null;
    const [ax, az] = MORIAH.ALTAR;
    if (!api.taskDone('wood')) {
      const cz = ps.reduce((s, p) => s + p.pos.z, 0) / ps.length;
      const free = MORIAH.wood.filter((it) => !it.got);
      const target = free.length ? [free[0].x, free[0].z] : [ax, az];
      // point to the next ramp lane on the way up, if the target is on a higher terrace
      for (const [zn, zs, l0, l1] of MORIAH.BANDS) if (cz > zs && target[1] < zs) return [(l0 + l1) / 2, api.terrain((l0 + l1) / 2, (zn + zs) / 2) + 2, (zn + zs) / 2];
      return [target[0], api.terrain(target[0], target[1]) + 1.5, target[1]];
    }
    if (!api.taskDone('altar')) return [ax, MORIAH.H[3] + 1.5, az];
    return null;
  },

  finale: {
    message: '🐏 Everyone gather at the altar on the mountain top.',
    beacon: [0, 13, -31],
    inZone(p) { return Math.hypot(p.pos.x - MORIAH.ALTAR[0], p.pos.z - MORIAH.ALTAR[1]) < 6; },
    onUpdate(api, t) {
      if (t > 0.5 && !MORIAH.told) {
        MORIAH.told = true;
        api.story([
          { art: '✝️', title: 'The Lamb God provided', text: 'Jehovah-jireh means "the LORD will provide." God provided a ram in Isaac\'s place. Many years later God gave His own Son: Jesus is the Lamb who took our place, for our sin.' },
          ...(api.shownRef('John 1:29') ? [] : [{ art: '🐑', text: 'The next day John seeth Jesus coming unto him, and saith, Behold the Lamb of God, which taketh away the sin of the world.', ref: 'John 1:29' }])
        ], () => { MORIAH.endT = api.time; });
      }
      return MORIAH.endT !== undefined && api.time - MORIAH.endT > 2;
    }
  }
};
