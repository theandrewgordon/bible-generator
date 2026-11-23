/* =====================================================================
 * LEVEL 3-3: THE PASSOVER  (Exodus 11-12)
 * ---------------------------------------------------------------------
 * Night in Goshen, the Israelite part of Egypt. Walk toward -z:
 *   The rooftops (z 36..9)   get ready to leave in haste: pick up the travel things on the flat
 *                            roofs (steps, a jump across the alley, a slow lift) and in the yard
 *   The lanes    (z 7..-20)  hop the stepping stones over the canal; run past three families
 *                            waiting outside, and they go in and shut the door (Exodus 12:22)
 *   The house    (0, -33)    the blood is on the door posts, as God said (Exodus 12:7): everyone inside
 * God passes over at midnight (told on cards, gently and plainly). Players never cause the rescue:
 * the blood of the lamb is the sign, and God keeps His word. Thread: Christ our passover (7-3, 7-4).
 * Only edit THIS file to change the level. See GEMINI.md and CAMPAIGN.md.
 * ===================================================================== */

const PASS = {
  things: [],
  families: [],
  steps: [],
  HOUSE: [0, -33],
  DOOR: [0, -28.6],
  CANAL: -3.2,
  saw7: false,
  told: false
};

const LEVEL = {
  id: '3-3',
  bibleConnection: {"passage": "Exodus 12:1–32", "text": "God judged Egypt: the firstborn died, but He passed over houses marked with the lamb’s blood. Our packing and gathering tasks explore the urgent departure. The blood, not our equipment or score, marked those houses."},
  world: 'World 3-4',            // shown one later (the plagues come first in Bible order); the id stays '3-3'
  title: 'The Passover',
  time: 'night',
  town: true,                  // mud-brick houses get doors, windows and lamps
  leafIcon: '⭐',
  leafColor: 0xfde68a,
  spawn: [0, 40],
  bounds: { minX: -19, maxX: 19, minZ: -42, maxZ: 44 },
  approach: ['stones', 'log', 'crumbles'],   // the way in (engine): a stretch before the level's own start
  startMessage: 'Get ready to leave Egypt tonight! Pick up the travel things on the roofs and in the yard.',

  intro: [
    { text: 'And the LORD said unto Moses, Yet will I bring one plague more upon Pharaoh, and upon Egypt; afterwards he will let you go hence:', ref: 'Exodus 11:1' },
    { text: 'when I see the blood, I will pass over you,', ref: 'Exodus 12:13' }
  ],

  introStory: [
    { art: '🐑', title: 'One more night', text: 'Pharaoh still would not let God\'s people go. So God told Moses what would happen at midnight. Every family was to take a lamb, put its blood on the door posts, eat the meal dressed for a journey, and stay inside until morning.' },
    { art: '👣', title: 'Ready to go', text: 'And thus shall ye eat it; with your loins girded, your shoes on your feet, and your staff in your hand; and ye shall eat it in haste: it is the LORD\'s passover.', ref: 'Exodus 12:11' }
  ],

  tasks: [
    { id: 'pack', icon: '🎒', label: 'Pick up the travel things', total: 4 },
    { id: 'home', icon: '🚪', label: 'Tell the families to go inside', total: 3 }
  ],

  memoryVerse: { text: 'For even Christ our passover is sacrificed for us:', ref: '1 Corinthians 5:7' },

  ending: {
    verse: { text: 'when I see the blood, I will pass over you,', ref: 'Exodus 12:13' },
    message: 'God kept His word: He passed over every house with the blood of the lamb. That same night Pharaoh let God\'s people go (Exodus 12:31).'
  },

  quiz: [
    { q: 'What did God tell each family to put on the door posts?', ref: 'Exodus 12:7', options: ['Paint', 'The blood of the lamb', 'Flowers'], answer: 1 },
    { q: 'What did God say He would do when He saw the blood?', ref: 'Exodus 12:13', options: ['Knock on the door', 'Pass over them', 'Wait until morning'], answer: 1 },
    { q: 'Who is our Passover Lamb?', ref: '1 Corinthians 5:7', options: ['Moses', 'Christ', 'Pharaoh'], answer: 1 }
  ],

  music: {
    bpm: 84,
    notes: [57, 0, 60, 0, 64, 0, 62, 60, 59, 0, 57, 0, 0, 0, 0, 0,
            57, 0, 60, 0, 65, 0, 64, 62, 60, 0, 59, 0, 57, 0, 0, 0],
    bass: [45, 45, 41, 41, 43, 43, 40, 40]
  },

  /* ---------- ground: flat village, the canal across the lane ---------- */
  terrain(x, z) {
    let h = Math.sin(x * 0.3) * Math.cos(z * 0.21) * 0.08;
    const c = Math.abs(z - PASS.CANAL);
    if (c < 2.2) h -= 1.6 * Math.min(1, (2.2 - c) / 0.5);
    return h;
  },

  groundColor(x, z, h) {
    if (h < -1.2) return 0x2f5f86;
    if (Math.abs(x) < 2.6) return (Math.floor(z / 1.4)) % 2 ? 0xb39a72 : 0xab926a;                  // the lane through the village (colour only)
    return (Math.floor(x / 2) + Math.floor(z / 2)) % 2 ? 0xa48a64 : 0x9a8160;   // packed earth
  },

  /* ---------- build ---------- */
  build(api) {
    const T = api.THREE;
    const red = 0x9f1239;
    PASS.houses = [];
    const house = (x, z, w, d, h, color) => { const b = api.box({ x, z, w, d, h, color: color || 0xc9b089 }); PASS.houses.push(b); return b; };
    // the blood on the two side posts and the upper door post (shown on the family's own door)
    const marks = (x, zFront, top) => {
      [[-0.85, top / 2, 0.16, top], [0.85, top / 2, 0.16, top], [0, top, 1.9, 0.18]].forEach(([dx, y, w, h]) => {
        const m = new T.Mesh(new T.BoxGeometry(w, h, 0.06), new T.MeshLambertMaterial({ color: 0x7f1d1d })); m.position.set(x + dx, y, zFront + 0.04); m.scale.x = 0.85; api.add(m);   // brushed on with hyssop (12:22)
      });
    };

    // --- the rooftops: travel things to pick up on the way (Exodus 12:11, 12:34) ---
    const thing = (kind) => {
      const g = new T.Group();
      if (kind === 'bread') { const b = new T.Mesh(new T.CylinderGeometry(0.42, 0.42, 0.14, 14), api.mat(0xe7c58a)); g.add(b); const c = new T.Mesh(new T.BoxGeometry(0.9, 0.08, 0.9), api.mat(0xf5f0e6)); c.position.y = -0.1; g.add(c); }
      else if (kind === 'staff') { const s = new T.Mesh(new T.CylinderGeometry(0.06, 0.07, 1.6, 8), api.mat(0x6b4f2a)); s.rotation.z = Math.PI / 2.4; g.add(s); }
      else if (kind === 'cloak') { const c = new T.Mesh(new T.BoxGeometry(0.9, 0.3, 0.6), api.mat(0x1e40af)); g.add(c); const s = new T.Mesh(new T.BoxGeometry(0.92, 0.06, 0.12), api.mat(0xfacc15)); s.position.y = 0.16; g.add(s); }
      else { const s = new T.Mesh(new T.SphereGeometry(0.36, 10, 8), api.mat(0x7c4a1e)); s.scale.set(1, 0.8, 1.3); g.add(s); }
      return g;
    };
    // house 1 (left): two steps up from the lane, then the flat roof
    house(-8, 30, 6, 6, 3);
    api.box({ x: -2.6, z: 32, w: 1.6, d: 1.6, h: 1.1, color: 0x8b6b45 });
    api.box({ x: -4.2, z: 32, w: 1.6, d: 1.6, h: 2.1, color: 0x8b6b45 });
    // house 2 (left): a jump across the narrow alley from roof to roof
    house(-8, 21.5, 6, 6.4, 3);
    // the yard (right): a low cart; house 3 with a slow lift up to its roof
    api.box({ x: 7, z: 23, w: 2.2, d: 1.6, h: 1.0, color: 0x8b5e34 });
    house(8, 12, 6, 6, 3);
    api.mover({ w: 1.8, h: 0.3, d: 1.8, color: 0xa0703c, path: [[3.4, 0, 12], [3.4, 2.7, 12]], speed: 1.4, wait: 1.2 });
    [['bread', -8, 31], ['staff', -8, 20.5], ['cloak', 7, 23], ['skin', 8.5, 12]].forEach(([kind, x, z]) =>
      PASS.things.push(api.gatherable({ x, z, mesh: thing(kind), task: 'pack', onGet(p) { api.servant(p, 3, 'for getting ready!'); } })));
    api.camZone({ minX: -12, maxX: -1, minZ: 17, maxZ: 35, yaw: 0.45, height: 8, back: 12, focus: [-8, 3, 21], pull: 0.4 });
    api.camZone({ minX: 1, maxX: 12, minZ: 8, maxZ: 16, yaw: -0.4, height: 8, back: 12, focus: [7, 3, 12], pull: 0.4 });
    api.armor('sandals', 0, 35);            // "your shoes on your feet" (Exodus 12:11)

    // --- the canal across the lane: stepping stones (the Fisherman can wade) ---
    const water = new T.Mesh(new T.PlaneGeometry(40, 4.2), new T.MeshLambertMaterial({ color: 0x3b6e99, transparent: true, opacity: 0.85 }));
    water.rotation.x = -Math.PI / 2; water.position.set(0, -0.9, PASS.CANAL); api.add(water);
    api.hazard({ x: 0, z: PASS.CANAL, w: 40, d: 3.8 }, { maxY: -0.7, except: (p) => p.role.id === 'fisherman', msg: 'Splash! Hop across on the stepping stones.' });
    [[0.7, -1.7], [-0.6, -3.2], [0.6, -4.7]].forEach(([x, z]) => api.stump(x, z, 1.75, 0.75));
    api.camZone({ minX: -5, maxX: 5, minZ: -7, maxZ: 1, yaw: 0.35, height: 7, back: 11, focus: [0, 0, -5], pull: 0.4 });
    api.fragment({ x: 11, z: PASS.CANAL, y: -0.5, net: true });

    // --- three families waiting outside their doors: run past and they go in ---
    [[-10, 2, -9, 5.8], [10, -11, 9, -7.4], [-10, -17, -9, -13.2]].forEach(([hx, hz, fx, fz], i) => {
      house(hx, hz, 6, 5, 3);
      // dressed for the journey: belt, sandals and staff in hand (12:11), a bundle on the child's back
      const grown = api.storyPerson([0x7c2d12, 0x166534, 0x6b21a8][i], 0xe7e5e4, 1, Object.assign({ staff: true, register: false }, i === 1 ? { beard: true } : {}));
      const child = api.storyPerson([0xca8a04, 0x0e7490, 0xbe123c][i], 0xf5f5f4, 1, { age: 'child', register: false });
      const pack = new T.Mesh(new T.SphereGeometry(0.25, 10, 8), api.texMat(0xc9ab7a, 'cloth')); pack.scale.set(1, 0.8, 0.7); pack.position.set(0, 0.8, -0.32); child.userData.storyActor.body.add(pack);
      grown.rotation.y = child.rotation.y = fx < 0 ? 0.9 : -0.9;
      const g = new T.Group(); grown.position.set(-0.45, 0, 0); child.position.set(0.5, 0, 0.2); g.add(grown); g.add(child);
      g.position.set(fx, api.terrain(fx, fz), fz); api.add(g);
      PASS.families.push({ g, x: fx, z: fz, y: api.terrain(fx, fz), home: false, people: [grown, child] });
    });

    // --- the family's house: the blood on the door, as God said (Exodus 12:7) ---
    const [hx, hz] = PASS.HOUSE;
    house(hx, hz, 10, 6, 3.4);
    const door = new T.Mesh(new T.BoxGeometry(1.5, 2.2, 0.08), api.texMat(0x3f2a16, 'wood')); door.position.set(hx, 1.1, hz + 3.02); api.add(door);
    marks(hx, hz + 3.02, 2.3);
    const lamp = new T.PointLight(0xffb347, 0.9, 9, 2); lamp.position.set(hx, 2.6, hz + 4.2); api.add(lamp);
    // the Builder can make steps up to the roof (fragment 3)
    [[-6.4, -28.6, 1.2], [-6.4, -30.6, 2.3]].forEach(([x, z, top]) => PASS.steps.push(api.box({ x, z, w: 1.6, d: 1.6, h: 0.35, y: top - 0.35, hidden: true, color: 0xa0703c })));
    const planks = new T.Mesh(new T.BoxGeometry(1.4, 0.4, 2), api.texMat(0xa0703c, 'wood')); planks.position.set(-7, 0.2, -25); api.add(planks);
    api.interact({
      x: -7, z: -25, r: 2.2, label: 'Build steps',
      can: (p) => (p.role.id === 'builder' ? true : 'Some planks. The Builder could make steps up to the roof (Tab / RB to switch).'),
      use(p) {
        this.remove(); planks.visible = false;
        PASS.steps.forEach((s) => s.show(true));
        api.sfx('build'); api.servant(p, 3);
      }
    });
    api.fragment({ x: -2.5, z: -34, y: 3.4 + 1.3 });

    // --- the granary in the yard (fragment 1: only the Scribe jumps that high) ---
    api.box({ x: 13, z: 31, w: 3, d: 3, h: 5, color: 0xb8996e, house: false });
    api.box({ x: 10.4, z: 31, w: 1.6, d: 1.6, h: 2.0, color: 0x8b6b45 });
    api.fragment({ x: 13, z: 31, y: 5 + 1.3 });

    // more houses so it feels like a village
    [[-13, 40, 5, 5, 3.2], [12, 40, 5, 5, 3.4], [12, 0, 6, 5, 3.2], [-12, -26, 5, 5, 3], [12, -24, 6, 6, 3.4], [-12, -38, 5, 5, 3.2], [12, -38, 5, 5, 3]].forEach(([x, z, w, d, h]) => {
      house(x, z, w, d, h);
    });
    [[-3.2, 26], [3.6, 30], [-3, 6], [3.4, -18]].forEach(([x, z]) => api.jars([[x, z]], 'jar'));

    // --- Golden Scroll course along the east edge (palm trunks and rooftops) ---
    api.course([
      { x: 16.4, z: 38, top: 1.1, kind: 'block' },
      { x: 17.0, z: 34.8, top: 2.1, kind: 'float' },
      { x: 16.4, z: 31.6, top: 3.0, kind: 'crumble' },
      { x: 17.0, z: 28.4, top: 3.8, kind: 'float' },
      { x: 16.4, z: 25.2, top: 4.6, kind: 'crumble' },
      { x: 17.0, z: 22.0, top: 5.0, kind: 'spring' },
      { x: 16.4, z: 18.8, top: 9.2, kind: 'float' },
      { x: 17.0, z: 15.6, top: 9.8, kind: 'crumble' },
      { x: 16.4, z: 12.4, top: 10.4, kind: 'float' }
    ]);

    api.leaves([[0, 37], [0, 33], [-2.6, 32, 1.1], [-4.2, 32, 2.1], [-8, 28, 3], [-8, 25.6, 3.8], [-8, 23, 3],
      [3, 20], [5, 17], [3.4, 13, 2], [8, 10, 3], [0, 8], [0.7, -1.7, 1.75], [-0.6, -3.2, 1.75], [0.6, -4.7, 1.75],
      [-4, 3], [4, -8], [-4, -13], [0, -20], [0, -24]]);
    LEVEL._dress(api);
  },

  update(api, dt) {
    LEVEL._poses(api, dt);
    // families go in as someone runs past (Exodus 12:22: none go out until the morning)
    PASS.families.forEach((f) => {
      if (f.home) return;
      const p = api.near(f.x, f.z, 2.4)[0];
      if (!p) return;
      f.home = true; f.g.visible = false;
      api.task('home'); api.servant(p, 4, 'for keeping a family safe!'); api.sfx('door');
      api.puff(f.x, f.y + 1, f.z, 0xfde68a, 10);
    });
    if (!PASS.saidHome && api.taskDone('pack')) {
      PASS.saidHome = true;
      if (!api.taskDone('home')) api.toast('🚪 Ready! Now run past the families still outside: they go in and shut the door (Exodus 12:22).', 4000);
    }
    // the blood on the door posts, seen when the family reaches their house
    if (!PASS.saw7 && api.near(PASS.DOOR[0], PASS.DOOR[1], 6).length) {
      PASS.saw7 = true;
      api.story([
        { art: '🚪', title: 'The blood on the door', text: 'And they shall take of the blood, and strike it on the two side posts and on the upper door post of the houses, wherein they shall eat it.', ref: 'Exodus 12:7' }
      ], () => api.toast('🏠 Everyone come inside and stay in until the morning.', 3500));
    }
  },

  /* ---------- presentation only: nothing here is solid, and no rule changes ---------- */
  _dress(api) {
    const T = api.THREE, g = new T.Group(), [hx, hz] = PASS.HOUSE;
    const M = (geo, mat, x, y, z) => { const m = new T.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true; g.add(m); return m; };
    PASS.houses.forEach((b, i) => { b.mesh.material = api.texMat(i % 2 ? 0xc9b089 : 0xc2a880, 'brick'); });
    // the family's house: warm lamplight in the windows
    [-3, 3].forEach((dx) => { const w = M(new T.PlaneGeometry(0.9, 0.7), new T.MeshBasicMaterial({ color: 0xffc46b }), hx + dx, 2.0, hz + 3.03); w.userData.lit = true; });
    // a donkey loaded for the journey, waiting by the house
    api.scenery(g);
    const donkey = api.animalMesh('donkey'); donkey.position.set(hx + 6.4, api.terrain(hx + 6.4, hz + 4.6), hz + 4.6); donkey.rotation.y = -1.9; api.add(donkey); PASS.donkey = donkey;
    [-1, 1].forEach((sd) => { const b = new T.Mesh(new T.SphereGeometry(0.3, 10, 8), api.texMat(0xc9ab7a, 'cloth')); b.scale.set(0.8, 1, 1.1); b.position.set(sd * 0.42, 1.05, 0); donkey.add(b); });
    // the family at the door, dressed to go (12:11); at midnight they are inside
    PASS.home = [[-1.4, 0x7a4e2c, { beard: true, staff: true }], [1.3, 0x9d174d, {}], [-0.2, 0x0e7490, { age: 'child' }], [2.4, 0xca8a04, { age: 'child' }]].map(([dx, robe, o]) => {
      const m = api.storyPerson(robe, 0xe9dcc0, 1, Object.assign({ register: false }, o)); m.position.set(hx + dx, api.terrain(hx + dx, hz + 4.1), hz + 4.1); api.add(m); return m;
    });
    // palms between the houses
    [['PalmTree_1', -16.6, 10, 6.5], ['PalmTree_3', 16.8, 22, 6], ['PalmTree_2', -16.4, -8, 7], ['PalmTree_4', 16.6, -14, 6.5]].forEach(([n, x, z, h]) => { const m = api.model(n, h); if (!m) return; const t = new T.Group(); t.position.set(x, api.terrain(x, z), z); t.rotation.y = x + z; t.add(m); api.add(t); api.fadeScenery(t, 2.6); });
    // a neighbour at the end of the lane knows what to do (optional; just for our game)
    const neighbour = api.storyPerson(0x5b4636, 0xe9dcc0, 1, { beard: true, age: 'elder', cane: true }); neighbour.position.set(-5.4, api.terrain(-5.4, 38), 38); neighbour.rotation.y = 2.4; api.add(neighbour); PASS.neighbour = neighbour;
    PASS.neighbourTalk = api.conversation({
      person: neighbour, speaker: 'A neighbour', label: 'Talk with the neighbour',
      clue(api) {
        const t = PASS.things.find((x) => !x.got);
        if (t) return { text: 'We leave tonight, in a hurry! The travel things are up on the roofs and in the yard.', at: [t.x, t.y + 1, t.z] };
        const f = PASS.families.find((x) => !x.home);
        if (f) return { text: 'Some families are still outside. Run past and tell them to go in and shut the door.', at: [f.x, f.y + 2, f.z] };
        return { text: 'Go home to the house with the blood on the door, and stay inside until morning.', at: [PASS.DOOR[0], 1.5, PASS.DOOR[1]] };
      }
    });
  },

  _poses(api, dt) {
    PASS.families.forEach((f) => { if (f.g.visible) f.people.forEach((m) => api.posePerson(m, { dt, expression: 'listen' })); });
    const inside = PASS.told;
    (PASS.home || []).forEach((m) => { m.visible = !inside; if (!inside) api.posePerson(m, { dt, expression: 'calm' }); });
    if (PASS.neighbour) api.posePerson(PASS.neighbour, { dt, expression: 'calm' });
  },

  objective(api) {
    const ps = api.activePlayers();
    if (!ps.length) return null;
    const cx = ps.reduce((s, p) => s + p.pos.x, 0) / ps.length, cz = ps.reduce((s, p) => s + p.pos.z, 0) / ps.length;
    const near = (list) => list.sort((a, b) => Math.hypot(a[0] - cx, a[2] - cz) - Math.hypot(b[0] - cx, b[2] - cz))[0];
    const t = PASS.things.filter((it) => !it.got).map((it) => [it.x, it.y + 1, it.z]);
    if (t.length) return near(t);
    const f = PASS.families.filter((q) => !q.home).map((q) => [q.x, q.y + 2, q.z]);
    if (f.length) return near(f);
    return [PASS.DOOR[0], 1.5, PASS.DOOR[1]];
  },

  finale: {
    message: '🏠 Everyone come inside the house!',
    beacon: [0, 3, -29],
    inZone(p) { return Math.hypot(p.pos.x - PASS.DOOR[0], p.pos.z - PASS.DOOR[1]) < 3.4; },
    onUpdate(api, t) {
      if (t > 0.5 && !PASS.told) {
        PASS.told = true;
        api.music(false);
        api.story([
          { art: '🌙', title: 'Midnight', text: 'At midnight the LORD passed through Egypt. In the houses with no blood on the door, the firstborn died, even Pharaoh\'s firstborn son (Exodus 12:29). It was a night of great sorrow. But wherever God saw the blood of the lamb, He passed over. The lamb died, and the firstborn in that house lived.' },
          { art: '🩸', title: 'When I see the blood', text: 'And the blood shall be to you for a token upon the houses where ye are: and when I see the blood, I will pass over you,', ref: 'Exodus 12:13' },
          ...(api.shownRef('1 Corinthians 5:7') ? [] : [{ art: '✝️', title: 'Christ our passover', text: 'For even Christ our passover is sacrificed for us:', ref: '1 Corinthians 5:7' }]),
          { art: '🐑', title: 'The Lamb of God', text: 'Many years later, at the Passover, Jesus gave His life for us. John called Him "the Lamb of God, which taketh away the sin of the world" (John 1:29). Everyone who trusts Him is saved.' }
        ], () => { PASS.endT = api.time; api.music(true); api.sfx('win'); });
      }
      return PASS.endT !== undefined && api.time - PASS.endT > 2;
    }
  }
};
