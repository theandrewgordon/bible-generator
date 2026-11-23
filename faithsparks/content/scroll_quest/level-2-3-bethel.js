/* =====================================================================
 * LEVEL 2-3: THE DREAM AT BETHEL  (Genesis 28)
 * ---------------------------------------------------------------------
 * Sunset in the hill country, north (z 42, low) to south (z -40, hilltop):
 *   The climb   (z 40..-20)  Jacob's supplies are scattered on stone ledges: climb to each on the way up
 *   The hilltop (z -24..-40) the resting place: lie down with a stone for a pillow
 * Then the dream, told as a vision: a ladder from earth to heaven (Genesis 28:12-15).
 * Tasks: recover 4 supplies; rest; set up the stone as a pillar.
 * Only edit THIS file to change the level. See GEMINI.md and CAMPAIGN.md.
 * ===================================================================== */

const BETH = {
  supplies: [],
  steps: [],
  angels: [],
  REST: [0, -30],
  PILLAR: [3.5, -27],
  TOP: 8,
  dreamed: false,
  dreamT: -1
};

function bethHill(z) { return BETH.TOP * Math.max(0, Math.min(1, (34 - z) / 58)); }

const LEVEL = {
  id: '2-3',
  bibleConnection: {"passage": "Genesis 28:10–22", "text": "God met the fleeing Jacob in a dream and promised His presence. Jacob set up a stone pillar. Our supplies and hill climb are imagined preparations; no puzzle builds a ladder to God or earns His promise."},
  world: 'World 2-4',            // shown as 2-4 (after Moriah and the well, Bible order); the id stays '2-3'
  title: 'The Dream at Bethel',
  time: 'sunset',
  leafIcon: '🌾',
  leafColor: 0xfbbf24,
  spawn: [0, 39],
  bounds: { minX: -19, maxX: 19, minZ: -42, maxZ: 43 },
  approach: ['crumbles', 'meadow:bear', 'stones'],   // the way in (engine): a stretch before the level's own start
  startMessage: 'Jacob\'s things are scattered on the rocky ledges. Gather them before dark!',

  intro: [
    { text: 'And Jacob went out from Beer-sheba, and went toward Haran.', ref: 'Genesis 28:10' },
    { text: 'And, behold, I am with thee, and will keep thee in all places whither thou goest, and will bring thee again into this land; for I will not leave thee, until I have done that which I have spoken to thee of.', ref: 'Genesis 28:15' }
  ],

  introStory: [
    { art: '😔', title: 'Running away', text: 'Jacob had lied to his old father and tricked his brother to get the blessing. Now he had to run far from home, all alone.' }
  ],

  tasks: [
    { id: 'supplies', icon: '🎒', label: 'Gather Jacob\'s supplies', total: 4 },
    { id: 'rest', icon: '🪨', label: 'Rest at the hilltop', total: 1, lockedUntil: 'supplies' },
    { id: 'pillar', icon: '🗿', label: 'Set up the stone pillar', total: 1, lockedUntil: 'rest' }
  ],

  memoryVerse: { text: 'And, behold, I am with thee, and will keep thee in all places whither thou goest, and will bring thee again into this land; for I will not leave thee, until I have done that which I have spoken to thee of.', ref: 'Genesis 28:15' },

  ending: {
    verse: { text: 'And Jacob awaked out of his sleep, and he said, Surely the LORD is in this place; and I knew it not.', ref: 'Genesis 28:16' },
    message: 'God came to Jacob with a promise, even when Jacob did not deserve it. Jesus is the way to God!'
  },

  quiz: [
    { q: 'What did Jacob use for a pillow?', ref: 'Genesis 28:11', options: ['A bag of wool', 'Stones', 'His coat'], answer: 1 },
    { q: 'What did Jacob see in his dream?', ref: 'Genesis 28:12', options: ['A ladder reaching to heaven', 'A great flood', 'Seven fat cows'], answer: 0 },
    { q: 'What did God promise Jacob?', ref: 'Genesis 28:15', options: ['"You will be king"', '"You will never be tired"', '"I am with thee, and will keep thee"'], answer: 2 }
  ],

  music: {
    bpm: 80,
    notes: [60, 0, 64, 0, 67, 0, 69, 67, 65, 0, 64, 0, 62, 0, 0, 0,
            64, 0, 67, 0, 72, 0, 71, 69, 67, 0, 65, 64, 60, 0, 0, 0],
    bass: [36, 36, 41, 41, 43, 43, 36, 36]
  },

  /* ---------- ground shape ---------- */
  terrain(x, z) {
    return bethHill(z) + Math.sin(x * 0.45) * Math.cos(z * 0.33) * 0.3 + Math.max(0, Math.abs(x) - 15.5) * 1.3;
  },

  groundColor(x, z, h) {
    const rel = h - bethHill(z);
    if (rel > 1) return 0x8a7a62;
    if (z < -22) return Math.hypot(x - BETH.REST[0], z - BETH.REST[1]) < 2.6 ? 0x8f8670 : 0x9a8f62;   // the hilltop, bare rock where Jacob lies down
    return Math.abs(x) < 2.2 ? 0xa89366 : Math.sin(x * 1.4) * Math.cos(z * 1.2) > 0.4 ? 0x74814a : 0x7d8a4e;
  },

  /* ---------- build ---------- */
  build(api) {
    const T = api.THREE;
    const ground = (x, z) => api.terrain(x, z);
    BETH.rocks = [];
    const rockBlock = (x, z, top, w, d) => { const b = api.box({ x, z, w: w || 1.8, d: d || 1.8, h: top - ground(x, z) + 0.2, y: ground(x, z) - 0.2, color: 0x8a8f98 }); BETH.rocks.push(b); return b; };
    const ledge = (x, z, top, w, d) => { const b = api.box({ x, z, w: w || 1.8, d: d || 1.8, h: 0.45, y: top - 0.45, color: 0x8a8f98 }); BETH.rocks.push(b); return b; };

    // --- scenery: boulders and a few trees along the climb ---
    [[-6, 30], [7, 24], [-5, 12], [6, 2], [-7, -10], [8, -20], [-9, 16], [13, -4]].forEach(([x, z], i) => api.rock(x, z, 0.6 + (i % 3) * 0.2));
    [[-8, 41], [15, 35], [-16, -18], [16, 14]].forEach(([x, z]) => api.tree(x, z, 1.0, 0x6b8e23));

    // --- Jacob's scattered supplies ---
    const item = (kind) => {
      const g = new T.Group();
      if (kind === 'skin') { const s = new T.Mesh(new T.SphereGeometry(0.38, 10, 8), api.mat(0x7c4a1e)); s.scale.set(1, 0.8, 1.3); g.add(s); }
      else if (kind === 'bread') { const b = new T.Mesh(new T.CylinderGeometry(0.4, 0.4, 0.22, 12), api.mat(0xc68a3e)); g.add(b); }
      else if (kind === 'blanket') { const b = new T.Mesh(new T.BoxGeometry(0.9, 0.3, 0.6), api.mat(0x9f1239)); g.add(b); const s = new T.Mesh(new T.BoxGeometry(0.92, 0.06, 0.12), api.mat(0xfacc15)); s.position.y = 0.16; g.add(s); }
      else { const s = new T.Mesh(new T.CylinderGeometry(0.06, 0.07, 1.6, 8), api.mat(0x6b4f2a)); s.rotation.z = Math.PI / 2; g.add(s); }
      return g;
    };
    // supply 1: on a low rock
    rockBlock(-10, 22, ground(-10, 22) + 1.0, 2.2, 2.2);
    // supply 2: up two rock steps
    rockBlock(8.6, 10.4, ground(8.6, 10.4) + 1.0); rockBlock(10.4, 8.4, ground(8.6, 10.4) + 2.1, 2.2, 2.2);
    // supply 3: across crumbling ledges
    const c3 = ground(-8, -2);
    [[-7.4, -1.4, 1.0], [-9.6, -2.6, 1.8], [-11.8, -3.8, 2.6]].forEach(([x, z, r]) => api.crumble({ x, z, top: c3 + r }));
    rockBlock(-14, -5, c3 + 3.2, 2.2, 2.2);
    // supply 4: a spring up to a high ledge
    api.spring({ x: 12, z: -10.6 });
    ledge(12, -13.2, ground(12, -10.6) + 0.35 + 4.2, 2.4, 2.4);
    [['skin', -10, 22], ['bread', 10.4, 8.4], ['blanket', -14, -5], ['staff', 12, -13.2]].forEach(([kind, x, z]) => {
      // picked up where it lies (climb to it), then keep going up the hill: no trips back and forth
      BETH.supplies.push(api.gatherable({ x, z, mesh: item(kind), task: 'supplies', onGet(p) { api.servant(p, 4, 'for helping a traveller!'); } }));
    });

    // --- the resting place on the hilltop ---
    const [rx, rz] = BETH.REST;
    const stones = new T.Group();
    [[-0.5, 0], [0.4, 0.2], [0, -0.4]].forEach(([dx, dz]) => { const s = new T.Mesh(new T.DodecahedronGeometry(0.28, 0), api.mat(0x9ca3af)); s.position.set(dx, 0.2, dz); stones.add(s); });
    stones.position.set(rx - 1.4, ground(rx - 1.4, rz), rz); api.add(stones);
    const mat = new T.Mesh(new T.BoxGeometry(1.0, 0.08, 2.0), api.mat(0x9f1239)); mat.position.set(rx, ground(rx, rz) + 0.05, rz); mat.visible = false; api.add(mat);
    BETH.mat = mat;
    BETH.restZone = api.zone({
      x: rx, z: rz, r: 1.8, time: 3, color: 0x93c5fd, hidden: true,
      onDone() { api.task('rest'); BETH.mat.visible = true; LEVEL._dream(api); }
    });

    // --- the dream: a ladder of light from earth to heaven, with angels (only in the dream) ---
    const ladder = new T.Group();
    const stepMat = new T.MeshBasicMaterial({ color: 0xffe3a0, transparent: true, opacity: 0 });
    for (let i = 0; i < 26; i++) {
      const s = new T.Mesh(new T.BoxGeometry(2.4, 0.12, 0.5), stepMat);
      s.position.set(0, 1 + i * 2.2, -i * 1.6); ladder.add(s);
    }
    [-1.25, 1.25].forEach((dx) => {
      const rail = new T.Mesh(new T.BoxGeometry(0.14, 0.14, 70), stepMat);
      rail.position.set(dx, 1 + 12.5 * 2.2, -12.5 * 1.6); rail.rotation.x = Math.atan2(2.2, 1.6); ladder.add(rail);
    });
    const angelMat = new T.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0 });
    // angels: soft figures of light with folded wings, going up and coming down
    for (let i = 0; i < 8; i++) {
      const a = new T.Group();
      const robe = new T.Mesh(new T.ConeGeometry(0.32, 0.95, 10), angelMat); robe.position.y = -0.1; a.add(robe);
      const head = new T.Mesh(new T.SphereGeometry(0.17, 10, 8), angelMat); head.position.y = 0.48; a.add(head);
      [-1, 1].forEach((sd) => { const w = new T.Mesh(new T.SphereGeometry(0.3, 8, 6), angelMat); w.scale.set(0.25, 0.9, 0.55); w.position.set(sd * 0.28, 0.12, -0.08); w.rotation.z = sd * 0.35; a.add(w); });
      ladder.add(a); BETH.angels.push({ mesh: a, k: i / 8, dir: i % 2 ? 1 : -1 });
    }
    const halo = new T.Mesh(new T.CylinderGeometry(1.8, 2.4, 1.6, 20, 1, true), new T.MeshBasicMaterial({ color: 0xfff3c4, transparent: true, opacity: 0, depthWrite: false, side: T.DoubleSide })); halo.position.y = 0.8; ladder.add(halo); BETH.halo = halo;
    ladder.position.set(rx, ground(rx, rz), rz - 1.5); ladder.visible = false; api.add(ladder);
    BETH.ladder = ladder; BETH.stepMat = stepMat; BETH.angelMat = angelMat;

    // --- the pillow stone, set up as a pillar after the dream (heavy: the Builder carries it best) ---
    const pillow = new T.Mesh(new T.DodecahedronGeometry(0.5, 0), api.mat(0x9ca3af));
    const pg = new T.Group(); pg.add(pillow);
    BETH.stone = api.carryable({
      x: rx - 1.4, z: rz + 1.4, mesh: pg, heavy: true, name: 'stone', to: 'the pillar spot',
      deliverTo: { x: BETH.PILLAR[0], z: BETH.PILLAR[1], r: 1.8 },
      onDeliver(p) {
        api.task('pillar');
        api.servant(p, 6, 'for remembering what God did!');
        BETH.pillar.visible = true; api.sfx('build');
      }
    });
    BETH.stone.blocked = () => (BETH.dreamed ? true : 'A stone for a pillow. Rest here first.');
    // a rough standing stone, glistening with oil on top (Genesis 28:18)
    const pillarGeo = new T.CylinderGeometry(0.32, 0.45, 2.2, 7, 4), pp = pillarGeo.attributes.position;
    for (let i = 0; i < pp.count; i++) { const y = pp.getY(i), k = 1 + Math.sin(i * 2.3 + y * 3) * 0.08; pp.setX(i, pp.getX(i) * k); pp.setZ(i, pp.getZ(i) * k * 0.85); }
    pillarGeo.computeVertexNormals();
    const pillar = new T.Mesh(pillarGeo, api.texMat(0xa8a29e, 'stone')); pillar.castShadow = true; pillar.position.set(BETH.PILLAR[0], ground(BETH.PILLAR[0], BETH.PILLAR[1]) + 1.1, BETH.PILLAR[1]); pillar.visible = false; api.add(pillar);
    const oil = new T.Mesh(new T.CylinderGeometry(0.3, 0.33, 0.06, 12), new T.MeshLambertMaterial({ color: 0xe8b830, emissive: 0x6b4f00, transparent: true, opacity: 0.9 })); oil.position.y = 1.12; pillar.add(oil);
    BETH.pillar = pillar;

    // --- fragment 1: crumbling ledges up to a rock pillar ---
    const f1 = ground(-14, 12);
    [[-14, 12, 1.0], [-12.4, 9.8, 1.8], [-14, 7.6, 2.6], [-12.4, 5.4, 3.4]].forEach(([x, z, r]) => api.crumble({ x, z, top: f1 + r }));
    rockBlock(-14, 3, f1 + 4.2, 2, 2);
    api.fragment({ x: -14, z: 3, y: f1 + 4.2 + 1.3 });

    // --- fragment 2: the Builder clears fallen rocks to make steps up a cliff ---
    const f2 = ground(14, 26);
    const rubble = new T.Group();
    [[0, 0], [0.6, 0.3], [-0.5, 0.4]].forEach(([dx, dz]) => { const r = new T.Mesh(new T.DodecahedronGeometry(0.45, 0), api.mat(0x78716c)); r.position.set(dx, 0.35, dz); rubble.add(r); });
    rubble.position.set(13.5, f2, 28); api.add(rubble);
    [[15.2, 25, 1.1], [15.2, 22.6, 2.2]].forEach(([x, z, r]) => BETH.steps.push(api.box({ x, z, w: 1.8, d: 1.8, h: 0.4, y: f2 + r - 0.4, hidden: true, color: 0x9ca3af })));
    rockBlock(15.2, 20.2, f2 + 3.2, 2, 2);
    api.fragment({ x: 15.2, z: 20.2, y: f2 + 3.2 + 1.3 });
    api.interact({
      x: 13.5, z: 28, r: 2.2, label: 'Stack rocks into steps',
      can: (p) => (p.role.id === 'builder' ? true : 'Fallen rocks. The Builder could stack them into steps (Tab / RB to switch).'),
      use(p) {
        this.remove(); rubble.visible = false;
        BETH.steps.forEach((s) => s.show(true));
        api.sfx('build'); api.servant(p, 3);
        api.toast('🔨 The Builder stacked the rocks into steps!', 2500);
      }
    });

    // --- fragment 3: a spinning log on a hilltop rock ---
    const f3 = ground(-11, -34) + 1.0;
    api.box({ x: -11, z: -34, w: 6.4, d: 6.4, h: f3 - ground(-11, -34) + 0.3, y: ground(-11, -34) - 0.3, color: 0x8a8f98 });
    api.sweeper({ x: -11, z: -34, y: f3, length: 5.2, speed: 1.5 });
    api.fragment({ x: -11, z: -34, y: f3 + 1.3 });

    // --- Golden Scroll challenge course: up the west side ---
    const plan = [['block', 1.0], ['float', 1.0], ['crumble', 0.9], ['float', 0.8], ['spring', 0.2], ['float', 4.2], ['crumble', 0.6]];
    let ctop = 0;
    api.course(plan.map(([kind, rise], i) => {
      const z = 37 - i * 2.9, x = -13.5 + (i % 2 ? 0.3 : -0.3);
      ctop = i === 0 ? ground(x, z) + 1.0 : ctop + rise;
      return { x, z, top: ctop, kind };
    }));

    api.leaves([[0, 34], [0, 26], [-2, 18], [2, 10], [0, 2], [-2, -6], [2, -14], [0, -22], [-10, 22, ground(-10, 22) + 1.9],
      [-9.6, -2.6, c3 + 2.7], [12, -13.2, ground(12, -10.6) + 5.45], [8.6, 10.4, ground(8.6, 10.4) + 1.9], [6, -32], [-4, -36]]);
    // camera: frame the Builder's rock steps
    api.camZone({ minX: 10, maxX: 18, minZ: 18, maxZ: 31, yaw: -0.6, height: 10, back: 11, focus: [15.2, f2 + 2, 22], pull: 0.45 });
    LEVEL._dress(api);
  },

  /* ---------- presentation only: nothing here is solid, and no rule changes ---------- */
  _dress(api) {
    const T = api.THREE, g = new T.Group(), [rx, rz] = BETH.REST, ground = (x, z) => api.terrain(x, z);
    const M = (geo, mat, x, y, z) => { const m = new T.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true; g.add(m); return m; };
    BETH.rocks.forEach((b) => { b.mesh.material = api.texMat(0x8f8a80, 'stone'); });
    // "he took of the stones of that place" (28:11): stones lying round the resting place
    [[-2.4, 1.6], [2.2, 1.2], [1.8, -2.2], [-2.6, -1.8], [3.0, -0.4], [-0.6, -2.8]].forEach(([dx, dz], i) => { const st = M(new T.DodecahedronGeometry(0.28 + (i % 3) * 0.08, 0), api.texMat([0x9c9584, 0x8f8878, 0xa8a090][i % 3], 'stone'), rx + dx, ground(rx + dx, rz + dz) + 0.15, rz + dz); st.scale.y = 0.65; st.rotation.y = i; });
    // the far hills turning dark in the evening
    [[-36, -10, 50, 40, 6], [36, -20, 50, 40, 7], [0, -70, 80, 40, 9]].forEach(([x, z, w, d, h], i) => { const m = api.rockMass({ x, z, w, d, h, color: [0x6f6a52, 0x66644e, 0x5e5c48][i], seed: i * 2.3 }); m.position.y = BETH.TOP - 4; });
    api.scenery(g);
    [['CommonTree_5', -15.4, -26, 4.2], ['CommonTree_3', 15.6, -30, 4.6], ['CommonTree_1', -15.8, 26, 4.4]].forEach(([n, x, z, h]) => { const m = api.model(n, h); if (!m) return; const t = new T.Group(); t.position.set(x, ground(x, z), z); t.add(m); api.add(t); api.fadeScenery(t, 2.4); });
    // stars for the night of the dream only (they fade with it)
    const pts = []; for (let i = 0; i < 360; i++) { const a = i * 2.39996, r = 60 + (i % 7) * 4, y = 22 + (i * 37 % 40); pts.push(Math.cos(a) * r, y, Math.sin(a) * r - 20); }
    const sg = new T.BufferGeometry(); sg.setAttribute('position', new T.Float32BufferAttribute(pts, 3));
    const stars = new T.Points(sg, api.starMaterial({ color: 0xfff6dc, size: 2.2, sizeAttenuation: false })); stars.material.transparent = true; stars.material.opacity = 0; stars.material.fog = false; BETH.ladder.parent.add(stars); BETH.stars = stars;
    // Jacob: waiting, tired, at the hilltop until his things are brought; then he lies down with his head on the stones
    const jacob = api.storyPerson(0x6b4a2c, 0xe8dcc0, 1, { beard: true, register: false });
    jacob.position.set(rx - 2.6, ground(rx - 2.6, rz + 1.2), rz + 1.2); jacob.rotation.y = 0.9; api.add(jacob); BETH.jacob = jacob; BETH.jacobAt = 'waiting';
    // a shepherd on the lower slopes knows the way (optional; just for our game)
    const shep = api.storyPerson(0x8a6d4a, 0xece2c8, 1, { beard: true, staff: true }); shep.position.set(3.2, ground(3.2, 36.4), 36.4); shep.rotation.y = -2.6; api.add(shep); BETH.shepherd = shep;
    BETH.shepherdTalk = api.conversation({
      person: shep, speaker: 'A shepherd', label: 'Talk with the shepherd',
      clue(api) {
        const it = BETH.supplies.find((x) => !x.got);
        if (it) return { text: 'A traveller came by alone, in a hurry. His things are lying up on the rocks. Climb up and gather them.', at: [it.x, it.y + 1, it.z] };
        if (!api.taskDone('rest')) return { text: 'The sun is going down. He will rest on the hilltop tonight.', at: [BETH.REST[0], api.terrain(BETH.REST[0], BETH.REST[1]) + 1.5, BETH.REST[1]] };
        return { text: 'He says this place is Bethel now: the house of God.' };
      }
    });
  },

  _poses(api, dt) {
    const J = BETH.jacob; if (!J) return;
    const a = J.userData.storyActor, [rx, rz] = BETH.REST, ground = (x, z) => api.terrain(x, z);
    if (BETH.jacobAt === 'waiting' && api.taskDone('rest')) {                                  // asleep, his head on the stones
      BETH.jacobAt = 'asleep'; J.position.set(rx + 0.2, ground(rx, rz) + 0.32, rz); J.rotation.set(0, 0, Math.PI / 2); a.eyes.scale.y = 0.15;
    }
    if (BETH.jacobAt === 'asleep' && BETH.dreamed) {                                          // awake: "Surely the LORD is in this place" (28:16)
      BETH.jacobAt = 'awake'; J.rotation.set(0, -0.6, 0); J.position.set(BETH.PILLAR[0] - 1.6, ground(BETH.PILLAR[0] - 1.6, BETH.PILLAR[1] - 0.6), BETH.PILLAR[1] - 0.6); a.eyes.scale.y = 1;
    }
    if (BETH.jacobAt === 'asleep') { a.body.position.y = Math.sin(api.time * 1.2) * 0.01; return; }
    api.posePerson(J, { dt, expression: BETH.jacobAt === 'awake' ? 'wonder' : 'worry', headPitch: BETH.jacobAt === 'waiting' ? 0.3 : -0.15 });
    if (BETH.jacobAt === 'awake' && api.taskDone('pillar')) { a.arms.forEach((arm) => { arm.rotation.x = -1.3; }); }   // pouring oil on the pillar
    if (BETH.shepherd) api.posePerson(BETH.shepherd, { dt, expression: 'calm' });
  },

  // the dream, told as a vision: first watch it for a few seconds, then the cards
  _dream(api) {
    api.music(false);
    BETH.ladder.visible = true; BETH.dreamT = 0; api.darkness(0.72);                 // night falls for the dream (presentation)
    api.toast('💤 Jacob lies down with a stone for his pillow... and God gives him a dream.', 4000);
  },

  _dreamCards(api) {
    api.story([
      { art: '💭', title: 'A dream from God', text: 'That night God gave Jacob a dream. What you see now is the dream (a vision), not a real ladder to climb.' },
      { art: '🪜', text: 'And he dreamed, and behold a ladder set up on the earth, and the top of it reached to heaven: and behold the angels of God ascending and descending on it.', ref: 'Genesis 28:12' },
      { art: '🤝', text: 'And, behold, I am with thee, and will keep thee in all places whither thou goest, and will bring thee again into this land; for I will not leave thee, until I have done that which I have spoken to thee of.', ref: 'Genesis 28:15' },
      { art: '💛', title: 'Grace', text: 'Jacob had lied and run away. He did not earn this promise. God gave it as a gift. That is grace!' },
    ], () => { BETH.dreamed = true; BETH.fadeOut = true; api.darkness(0); api.music(true); api.toast('🗿 Morning! Set up Jacob\'s pillow stone as a pillar (heavy: the Builder carries it best).', 4500); });
  },

  update(api, dt) {
    LEVEL._poses(api, dt);
    if (!BETH.restShown && api.taskDone('supplies')) {
      BETH.restShown = true; BETH.restZone.show(true);
      api.toast('🪨 All his things are back! Rest at the hilltop (stand in the blue ring).', 3500);
    }
    if (BETH.ladder.visible) {
      BETH.dreamT += dt;
      if (BETH.dreamT > 4.5 && !BETH.cardsShown) { BETH.cardsShown = true; LEVEL._dreamCards(api); }
      const target = BETH.fadeOut ? 0 : 0.85;
      BETH.stepMat.opacity += (target - BETH.stepMat.opacity) * Math.min(1, dt * 1.5);
      BETH.angelMat.opacity = BETH.stepMat.opacity;
      if (BETH.halo) BETH.halo.material.opacity = BETH.stepMat.opacity * 0.22;
      if (BETH.stars) BETH.stars.material.opacity = BETH.stepMat.opacity;
      BETH.angels.forEach((a) => {
        a.k = (a.k + a.dir * dt * 0.05 + 1) % 1;
        a.mesh.position.set(Math.sin(a.k * 40) * 0.5, 1.4 + a.k * 25 * 2.2, -a.k * 25 * 1.6);
        a.mesh.rotation.x = a.dir > 0 ? 0 : Math.PI * 0.08;
      });
      if (BETH.fadeOut && BETH.stepMat.opacity < 0.02) BETH.ladder.visible = false;
    }
  },

  objective(api) {
    const ps = api.activePlayers();
    if (!ps.length) return null;
    const [rx, rz] = BETH.REST;
    if (!api.taskDone('supplies')) {
      const cx = ps.reduce((s, p) => s + p.pos.x, 0) / ps.length, cz = ps.reduce((s, p) => s + p.pos.z, 0) / ps.length;
      const s = BETH.supplies.filter((it) => !it.got).sort((a, b) => Math.hypot(a.x - cx, a.z - cz) - Math.hypot(b.x - cx, b.z - cz))[0];
      return s ? [s.x, s.y + 1, s.z] : null;
    }
    if (!api.taskDone('rest')) return [rx, api.terrain(rx, rz) + 1.5, rz];
    if (!api.taskDone('pillar')) {
      if (BETH.stone.holder) return [BETH.PILLAR[0], api.terrain(BETH.PILLAR[0], BETH.PILLAR[1]) + 1.5, BETH.PILLAR[1]];
      return [BETH.stone.x, BETH.stone.y + 1, BETH.stone.z];
    }
    return null;
  },

  finale: {
    message: '🗿 Everyone gather at the pillar: Bethel, the house of God!',
    beacon: [3.5, 10, -27],
    inZone(p) { return Math.hypot(p.pos.x - BETH.PILLAR[0], p.pos.z - BETH.PILLAR[1]) < 6; },
    onUpdate(api, t) {
      if (t > 0.5 && !BETH.told) {
        BETH.told = true;
        api.story([
          { art: '🗿', text: 'And Jacob rose up early in the morning, and took the stone that he had put for his pillows, and set it up for a pillar, and poured oil upon the top of it.', ref: 'Genesis 28:18' },
          { art: '🪜', title: 'The real Ladder', text: 'And he saith unto him, Verily, verily, I say unto you, Hereafter ye shall see heaven open, and the angels of God ascending and descending upon the Son of man.', ref: 'John 1:51' },
        ], () => { BETH.endT = api.time; });
      }
      return BETH.endT !== undefined && api.time - BETH.endT > 2;
    }
  }
};
