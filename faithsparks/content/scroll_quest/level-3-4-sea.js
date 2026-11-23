/* =====================================================================
 * LEVEL 3-4: THROUGH THE SEA  (Exodus 14–15)
 * ---------------------------------------------------------------------
 * Night. Linear walk, start → finish (players walk toward -z):
 *   West shore  (z 40..26)   the pillar of fire behind; God parts the sea (players watch)
 *   Seabed      (z 24..-60)  dry ground between two walls of water; trenches, rocks
 *   East shore  (z -62..-74) everyone safe; the sea closes; the Song of Moses
 * Tasks: help 10 travellers (families and their animals) across + pick up 4 dropped bundles on the way
 *   (three by running into them; the heavy kneading trough is carried the last stretch).
 * The chase: Pharaoh's chariots follow into the sea behind you, but the pillar of cloud stands
 * between them and the people (Exodus 14:19-20). Nobody is hurt: anyone the army reaches is carried
 * forward by the pillar. Midway God takes off their chariot wheels and they slow down (14:24-25).
 * God acts; players help. The sea opens before the kids do anything, and they walk
 * on DRY ground (Exodus 14:22), so there is no water on the seabed.
 * Only edit THIS file to change the level. See GEMINI.md and CAMPAIGN.md.
 * ===================================================================== */

const SEA = {
  walls: [],          // the two water walls (visual)
  fish: [],
  water: null,        // the sea surface (before it parts / after it closes)
  barrier: null,
  openT: -1,          // time the parting started
  opened: false,
  closing: -1,
  travellers: [],
  bundles: [],
  pebbles: [],
  steps: [],
  SHORE: [0, -69],    // far shore camp
  army: [],           // the chariots
  armyZ: 34,          // the front of Pharaoh's army (it follows the people into the sea)
  ARMY_START: 46,
  wheels: false,
  BED: -3             // seabed height
};

function seaBedHeight(x, z) {
  let h = SEA.BED + Math.sin(x * 0.5) * Math.cos(z * 0.3) * 0.25;      // gentle sand ripples
  const trench = (zc) => Math.abs(z - zc) < 2.3;
  if (trench(-16) && !(x > 3.6 && x < 6.4)) h = -10;                   // trench 1 (rock bridge at x≈5)
  if (trench(-42)) h = -10;                                            // trench 2 (stone slab ferry)
  return h;
}

const LEVEL = {
  id: '3-4',
  bibleConnection: {"passage": "Exodus 14:13–31", "text": "The LORD opened a path through the sea for Israel and brought the waters back over Pharaoh’s pursuing army. Our crossings and bundles explore the journey on dry ground; players do not part the sea."},
  world: 'World 3-5',            // shown one later (the plagues come first in Bible order); the id stays '3-4'
  title: 'Through the Sea',
  time: 'night',
  leafIcon: '🐚',
  leafColor: 0xf9a8d4,
  leafShape: 'round',
  spawn: [0, 36],
  bounds: { minX: -19, maxX: 19, minZ: -76, maxZ: 42 },
  rim: false,                                                          // (the sea floor: no grassy bank at the edges)
  startMessage: 'Help the travellers and pick up the bundles they dropped on the way! Follow the golden arrow ↓',

  intro: [
    { text: 'Fear ye not, stand still, and see the salvation of the LORD, which he will shew to you to day:', ref: 'Exodus 14:13' },
    { text: 'The LORD shall fight for you, and ye shall hold your peace.', ref: 'Exodus 14:14' }
  ],

  introStory: [
    { art: '🏃', title: 'Trapped at the sea', text: 'God brought Israel out of Egypt. But Pharaoh changed his mind and chased them with his chariots. Now the sea was in front of them, and the army was behind them.' },
    { art: '📜', text: 'Fear ye not, stand still, and see the salvation of the LORD, which he will shew to you to day:', ref: 'Exodus 14:13' }
  ],

  tasks: [
    { id: 'travellers', icon: '👪', label: 'Help the travellers across', total: 10 },
    { id: 'bundles', icon: '🎒', label: 'Pick up their bundles', total: 4 }
  ],

  memoryVerse: { text: 'The LORD shall fight for you, and ye shall hold your peace.', ref: 'Exodus 14:14' },

  ending: {
    verse: { text: 'The LORD is my strength and song, and he is become my salvation: he is my God, and I will prepare him an habitation; my father\'s God, and I will exalt him.', ref: 'Exodus 15:2' },
    message: 'God made a way through the sea when there was no way.'
  },

  quiz: [
    { q: 'What did God use to push back the sea?', ref: 'Exodus 14:21', options: ['An earthquake', 'A strong east wind', 'A giant boat'], answer: 1 },
    { q: 'How did Israel cross the sea?', ref: 'Exodus 14:22', options: ['On dry ground', 'By swimming', 'On a bridge'], answer: 0 },
    { q: 'What did Moses tell the people when they were afraid?', ref: 'Exodus 14:13', options: ['"Run away!"', '"Fear ye not, stand still, and see the salvation of the LORD"', '"Build some boats"'], answer: 1 }
  ],

  music: {
    bpm: 92,
    notes: [62, 0, 65, 0, 69, 0, 67, 65, 64, 0, 62, 0, 65, 0, 0, 0,
            69, 0, 72, 0, 70, 69, 67, 0, 65, 0, 64, 0, 62, 0, 0, 0],
    bass: [38, 38, 41, 41, 43, 43, 38, 38]
  },

  onCallText(kind, n) {                                                 // said once; after that they just come
    if (SEA.saidCall) return '';
    SEA.saidCall = true;
    return n + (n > 1 ? ' travellers are' : ' traveller is') + ' following you!';
  },

  /* ---------- ground shape ---------- */
  terrain(x, z) {
    if (z > 30) return 2 + Math.sin(x * 0.4) * 0.15;                    // west shore
    if (z > 24) return 2 + (SEA.BED - 2) * (30 - z) / 6;               // beach slope down
    if (z > -60) return seaBedHeight(x, z);
    if (z > -66) return SEA.BED + (2 - SEA.BED) * (-60 - z) / 6;       // beach slope up
    return 2 + Math.sin(x * 0.4) * 0.15;                               // east shore
  },

  groundColor(x, z, h) {
    if (h < -6) return 0x1c140c;                                       // trench (dark so it reads at night)
    if (z > 26 || z < -62) return (Math.floor(x / 3) + Math.floor(z / 3)) % 2 ? 0xd8c690 : 0xcfbd85;
    if (Math.abs(x) > 7.6) return 0x8f7b56;                                   // darker sand at the foot of the walls
    const ripple = Math.sin(z * 1.7 + Math.sin(x * 0.45) * 2.2);                // ripple marks the water left behind
    return ripple > 0.55 ? 0xc4ae7c : (Math.floor(x / 2.5) + Math.floor(z / 2.5)) % 2 ? 0xb9a372 : 0xae976a;   // sand, but dry ground
  },

  /* ---------- build ---------- */
  build(api) {
    const T = api.THREE;

    // --- the pillar of fire behind the people (Exodus 14:19-20) ---
    const pillar = new T.Mesh(new T.CylinderGeometry(1.2, 2, 16, 14, 1, true), new T.MeshBasicMaterial({ color: 0xfb923c, transparent: true, opacity: 0.55, side: T.DoubleSide, depthWrite: false }));
    pillar.position.set(-11, 10, 39); api.add(pillar);           // beside and behind the people (not in front of the camera)
    const core = new T.Mesh(new T.CylinderGeometry(0.6, 1.1, 16, 10), new T.MeshBasicMaterial({ color: 0xfde047, transparent: true, opacity: 0.6, depthWrite: false }));
    core.position.set(-11, 10, 39); api.add(core);
    const glow = new T.PointLight(0xffa94d, 1.4, 40, 2); glow.position.set(-6, 6, 35); api.add(glow);
    SEA.pillar = pillar;

    // --- the walls of water (solid to players; they rise when God parts the sea) ---
    [-1, 1].forEach((side) => {
      const wall = new T.Mesh(new T.BoxGeometry(10, 13, 90), new T.MeshLambertMaterial({ color: 0x163f9e, emissive: 0x0a2260, transparent: true, opacity: 0.78 }));
      wall.position.set(side * 14, SEA.BED - 6.5, -18);
      wall.scale.y = 0.01;
      api.add(wall);
      LEVEL._waterFace(api, wall, side);                                  // a moving face of water and a foaming crest (presentation)
      SEA.walls.push(wall);
      api.box({ x: side * 14, z: -18, w: 10, h: 14, d: 90, y: SEA.BED - 7, color: 0x1d4ed8 }).mesh.visible = false;
      for (let i = 0; i < 8; i++) {                                    // fish swimming in the wall
        const fish = new T.Group();
        const body = new T.Mesh(new T.SphereGeometry(0.35, 8, 6), api.mat([0x0f172a, 0x1e3a8a, 0x334155][i % 3]));
        body.scale.set(0.5, 0.7, 1.5); fish.add(body);
        const tail = new T.Mesh(new T.ConeGeometry(0.25, 0.4, 4), api.mat(0x0f172a));
        tail.rotation.x = -Math.PI / 2; tail.position.z = 0.6; fish.add(tail);
        fish.visible = false; api.add(fish);
        SEA.fish.push({ mesh: fish, x: side * (9.4 + Math.random() * 0.4), y: SEA.BED + 1 + Math.random() * 8, z0: Math.random() * 90, speed: 1 + Math.random() * 1.5 });
      }
    });

    // --- the sea surface before it parts ---
    const water = new T.Mesh(new T.PlaneGeometry(40, 92), new T.MeshLambertMaterial({ color: 0x1e40af, emissive: 0x0b1f5c, transparent: true, opacity: 0.85 }));
    water.rotation.x = -Math.PI / 2; water.position.set(0, 1.3, -18); api.add(water);
    SEA.water = water;
    // nobody walks into the sea before God opens it
    SEA.barrier = api.box({ x: 0, z: 27.5, w: 20, h: 9, d: 1, y: SEA.BED, color: 0x1d4ed8 });
    SEA.barrier.mesh.visible = false;

    // --- trenches: falling in puts you in a bubble ---
    const trenchMsg = 'Oops, a deep trench! Use the rock bridge, the stone slab, or jump across.';
    api.hazard({ x: 0, z: -16, w: 18, d: 4.6 }, { maxY: -6, msg: trenchMsg });
    api.hazard({ x: 0, z: -42, w: 18, d: 4.6 }, { maxY: -6, msg: trenchMsg });
    api.mover({ w: 2.6, h: 0.4, d: 2.6, color: 0x8b8178, path: [[-5, SEA.BED - 0.4, -38.4], [-5, SEA.BED - 0.4, -45.6]], speed: 2, wait: 1.0 });

    // seabed rocks and coral (decoration + obstacles)
    [[-6, 14], [6, 10], [-2, 4], [7, -2], [-7, -6], [2, -26], [-3, -33], [7, -36], [-7, -50], [3, -56]].forEach(([x, z], i) => api.rock(x, z, 0.7 + (i % 3) * 0.25));
    [[-8, 18], [8, -10], [-8.2, -22], [8.2, -48]].forEach(([x, z], i) => {
      const coral = new T.Mesh(new T.ConeGeometry(0.4, 1.6, 5), api.mat([0xf472b6, 0xfb923c, 0xa78bfa][i % 3]));
      coral.position.set(x, SEA.BED + 0.8, z); api.add(coral);
    });

    // --- travellers: families resting on the seabed, and their animals ---
    const person = (robe, scarf, small) => LEVEL._traveller(api, robe, scarf, small);   // jointed travellers with a bundle on the back
    const deliver = { x: SEA.SHORE[0], z: SEA.SHORE[1], r: 7 };
    const park = () => [-8 + Math.random() * 16, api.terrain(0, -71), -70 - Math.random() * 3];
    const arrive = (p) => {
      api.task('travellers');
      api.servant(p, 4);
      // (the task board counts it: no pop-up)
    };
    [[0x7c3aed, 0xfde68a, false, -4, 12], [0xb91c1c, 0xffffff, true, -3, 13], [0x0e7490, 0xfef3c7, false, 5, -4],
      [0xca8a04, 0x7c2d12, true, 6, -5], [0x15803d, 0xe5e7eb, false, -5, -30], [0x9d174d, 0xfde047, false, 4, -52]]
      .forEach(([robe, scarf, small, x, z]) => SEA.travellers.push(api.follower({ x, z, kind: 'traveller', mesh: person(robe, scarf, small), deliverTo: deliver, parkAt: park, onDeliver: arrive })));
    [['sheep', -1, 8], ['goat', 1, 7], ['sheep', -6, -24], ['cow', 6, -28]]
      .forEach(([kind, x, z]) => SEA.travellers.push(api.follower({ x, z, kind, deliverTo: deliver, parkAt: park, onDeliver: arrive })));

    // --- bundles to carry (one heavy kneading trough, Exodus 12:34) ---
    [[3, 16, false], [-6, 0, false], [6, -24, false], [-2, -48, true]].forEach(([x, z, heavy]) => {
      const g = new T.Group();
      if (heavy) {
        const trough = new T.Mesh(new T.BoxGeometry(1.6, 0.5, 0.9), api.mat(0x7a5230)); g.add(trough);
        const cloth = new T.Mesh(new T.BoxGeometry(1.7, 0.2, 1.0), api.mat(0xe7e5e4)); cloth.position.y = 0.3; g.add(cloth);
      } else {
        const sack = new T.Mesh(new T.SphereGeometry(0.45, 10, 8), api.mat(0xd6b98c)); sack.scale.y = 0.8; g.add(sack);
        const tie = new T.Mesh(new T.CylinderGeometry(0.12, 0.2, 0.25, 8), api.mat(0x92400e)); tie.position.y = 0.38; g.add(tie);
      }
      // the dropped bundles lie along the way: pick each one up as you pass. The heavy kneading trough
      // (near the far shore) is carried the last stretch: the Builder's job.
      if (!heavy) { SEA.bundles.push(api.gatherable({ x, z, mesh: g, task: 'bundles', onGet(p) { api.servant(p, 6, 'for picking up a family\'s bundle!'); } })); return; }
      SEA.bundles.push(api.carryable({
        x, z, mesh: g, heavy,
        deliverTo: { x: SEA.SHORE[0], z: SEA.SHORE[1], r: 4.5 },
        onDeliver(p) { api.task('bundles'); api.servant(p, 6, 'for carrying the kneading trough!'); }
      }));
    });

    // --- armor ---
    api.armor('shield', 4, 21);
    api.armor('sandals', -4, 2);

    // --- fragments ---
    // 1: the Fisherman nets it from inside the wall of water
    api.fragment({ x: -10.4, z: -8, y: 1.5, net: true });
    // 2: coral pillars by the right wall, with loose pebbles falling (Shield of Faith helps)
    api.stump(5.5, -29.5, 1.2, 0.8);
    api.stump(7, -31.5, 2.4, 0.8);
    api.stump(8, -34, 3.6, 0.8);
    api.fragment({ x: 8, z: -34, y: SEA.BED + 3.6 + 1.4 });
    for (let i = 0; i < 3; i++) {
      const rock = new T.Mesh(new T.DodecahedronGeometry(0.35, 0), api.mat(0x94a3b8));
      const ring = new T.Mesh(new T.RingGeometry(0.4, 0.7, 16), new T.MeshBasicMaterial({ color: 0xef4444, transparent: true, opacity: 0.5, side: T.DoubleSide }));
      ring.rotation.x = -Math.PI / 2;
      api.add(rock); api.add(ring);
      SEA.pebbles.push({ rock, ring, x: 0, z: 0, y: 30 + i * 9, speed: 9 });
    }
    // 3: the Scribe reads a marker stone; hidden steps appear up a tall rock
    const marker = new T.Mesh(new T.BoxGeometry(1, 1.4, 0.3), api.mat(0xa8a29e));
    marker.position.set(4.5, SEA.BED + 0.7, -51.5); api.add(marker);
    api.box({ x: 7.6, z: -56, w: 2.6, h: 4.8, d: 2.6, y: SEA.BED, color: 0x78716c });
    [[5.2, -54.4, -1.8], [6, -56.8, -0.6], [5.6, -58.6, 0.6]].forEach(([x, z, top]) => SEA.steps.push(api.box({ x, z, w: 1.8, h: 0.5, d: 1.8, y: top - 0.5, hidden: true, color: 0xd6d3d1 })));
    api.fragment({ x: 7.6, z: -56, y: SEA.BED + 4.8 + 1.4 });
    api.interact({
      x: 4.5, z: -51, r: 2.4, vRange: 4, label: 'Read inscription',
      can: (p) => (p.role.id === 'scribe' ? true : 'Old writing on the stone. Only the Scribe can read it (press Tab / RB to switch).'),
      use(p) {
        this.remove();
        SEA.steps.forEach((s) => s.show(true));
        api.puff(6, SEA.BED + 1, -56, 0xfde047, 14);
        api.sfx('build');
        api.toast('📜 The Scribe read the stone: steps appeared beside the tall rock!', 3000);
      }
    });

    // --- Golden Scroll challenge course (coral steps along the seabed): blocks, crumbling platforms, a spring ---
    api.course([
      { x: -4.6, z: 18, top: -2.12, kind: 'block' },
      { x: -3.4, z: 14.6, top: -1.12, kind: 'float' },
      { x: -4.6, z: 11.2, top: -0.22, kind: 'crumble' },
      { x: -3.4, z: 7.8, top: 0.58, kind: 'crumble' },
      { x: -4.6, z: 4.4, top: 0.78, kind: 'float' },
      { x: -3.4, z: 1, top: 1.08, kind: 'spring' },
      { x: -4.6, z: -2.4, top: 5.28, kind: 'float' },
      { x: -3.4, z: -5.8, top: 5.88, kind: 'crumble' },
      { x: -4.6, z: -9.2, top: 6.48, kind: 'float' }
    ]);

    api.leaves([[0, 33], [0, 22], [-2, 16], [2, 10], [0, 4], [-3, -2], [3, -8], [5, -16, SEA.BED + 1], [0, -22], [-3, -28],
      [0, -36], [-5, -42, SEA.BED + 1.2], [2, -48], [-2, -54], [0, -60], [7.6, -56, SEA.BED + 5.6]]);

    // --- bonus challenge corner: spinning log and spring tower with extra leaves ---
    // camera: from the side over the two trenches, so the rock bridge and the stone ferry are easy to see
    api.camZone({ minX: -12, maxX: 12, minZ: -20, maxZ: -9, yaw: 0.55, height: 12, back: 12, focus: [5, SEA.BED, -17], pull: 0.4 });
    api.camZone({ minX: -12, maxX: 12, minZ: -46, maxZ: -35, yaw: -0.55, height: 12, back: 12, focus: [0, SEA.BED, -43], pull: 0.4 });

    // --- Pharaoh's chariots (they follow into the sea; the pillar of cloud holds them back) ---
    const chariot = (k) => {
      const g = new T.Group();
      const horse = new T.Group();
      const hm = api.animalMesh('horse'); hm.rotation.y = Math.PI; hm.scale.setScalar(1.15); horse.add(hm);   // (facing the way the chariot drives)
      horse.position.z = -1.8; g.add(horse);
      const carShape = new T.Shape(); carShape.moveTo(-0.7, 0); carShape.lineTo(0.7, 0); carShape.lineTo(0.7, 0.55); carShape.quadraticCurveTo(0, 1.1, -0.7, 0.55); carShape.lineTo(-0.7, 0);
      const car = new T.Mesh(new T.ExtrudeGeometry(carShape, { depth: 1.0, bevelEnabled: false }), api.texMat(0xb45309, 'wood')); car.position.set(0, 0.5, -0.1); g.add(car);
      const rim = new T.Mesh(new T.BoxGeometry(1.45, 0.12, 1.05), api.mat(0xfacc15)); rim.position.set(0, 1.32, 0.4); g.add(rim);
      g.wheels = [];
      [-0.8, 0.8].forEach((wx) => { const wh = new T.Mesh(new T.TorusGeometry(0.42, 0.08, 6, 14), api.mat(0x3f2a1d)); wh.rotation.y = Math.PI / 2; wh.position.set(wx, 0.45, 0.4); g.add(wh); g.wheels.push(wh); });
      const rider = api.storyPerson(0xf5f5f4, k % 3 ? 0x1d4ed8 : 0xb91c1c, 0.85, { register: false }); rider.rotation.y = Math.PI; rider.position.set(0, 0.5, 0.4);
      const ra = rider.userData.storyActor; ra.feet.forEach((f) => { f.visible = false; }); ra.arms.forEach((a) => { a.rotation.x = -1.0; });
      const helm = new T.Mesh(new T.CylinderGeometry(0.3, 0.36, 0.3, 12), api.mat(k % 3 ? 0x1d4ed8 : 0xb91c1c)); helm.position.y = 0.55; ra.head.add(helm);
      g.add(rider);
      api.add(g); return g;
    };
    for (let k = 0; k < 6; k++) SEA.army.push({ mesh: chariot(k), x: -7.5 + k * 3, dz: (k % 2) * 2.2, bob: k });
    // the pillar of cloud: between the army and the people (dark to them, light to Israel: Exodus 14:20)
    const cloud = new T.Group();
    for (let k = 0; k < 9; k++) { const c = new T.Mesh(new T.SphereGeometry(2.2 + (k % 3) * 0.5, 12, 10), new T.MeshLambertMaterial({ color: 0x9ca3af, emissive: 0x3b3b3b, transparent: true, opacity: 0.55, depthWrite: false })); c.position.set(-8 + k * 2, 2 + (k % 2) * 1.5, 0); cloud.add(c); }
    const col = new T.Mesh(new T.CylinderGeometry(2.2, 3, 22, 16, 1, true), new T.MeshBasicMaterial({ color: 0xe5e7eb, transparent: true, opacity: 0.35, side: T.DoubleSide, depthWrite: false }));
    col.position.y = 11; cloud.add(col);
    cloud.visible = false; api.add(cloud); SEA.cloud = cloud;
    LEVEL._dress(api);
  },

  /* ---------- presentation only: nothing here is solid, and no rule changes ---------- */
  // The inside face of a wall of water: deep blue at the foot, lighter toward the top, gently moving, with a foaming crest.
  _waterFace(api, wall, side) {
    const T = api.THREE, geo = new T.PlaneGeometry(90, 13, 45, 13), pos = geo.attributes.position, col = [];
    for (let i = 0; i < pos.count; i++) { const k = (pos.getY(i) + 6.5) / 13, c = new T.Color(0x0b2a6b).lerp(new T.Color(0x3fa7c9), k * k); col.push(c.r, c.g, c.b); }
    geo.setAttribute('color', new T.Float32BufferAttribute(col, 3));
    const face = new T.Mesh(geo, new T.MeshLambertMaterial({ vertexColors: true, transparent: true, opacity: 0.72, depthWrite: false, side: T.DoubleSide, emissive: 0x08204f }));
    face.userData.baseOpacity = 0.72; face.rotation.y = side < 0 ? Math.PI / 2 : -Math.PI / 2; face.position.set(-side * 5.1, 0, 0); wall.add(face);
    face.userData.base = Float32Array.from(pos.array);
    const foam = new T.Group(), fm = new T.MeshLambertMaterial({ color: 0xe8f6ff, emissive: 0x6c8aa8, transparent: true, opacity: 0.85 });
    for (let i = 0; i < 30; i++) { const b = new T.Mesh(new T.SphereGeometry(0.55 + (i % 3) * 0.15, 8, 6), fm); b.position.set(-side * (4.6 + (i % 2) * 0.4), 6.5, -44 + i * 3.05); b.scale.y = 0.5; foam.add(b); }
    foam.userData.baseOpacity = 0.85; wall.add(foam);
    (SEA.faces = SEA.faces || []).push({ face, foam, side });
  },

  _traveller(api, robe, scarf, small) {
    const T = api.THREE, m = api.storyPerson(robe, scarf, small ? 0.7 : 1, { register: false, beard: !small && robe % 3 === 0 }), a = m.userData.storyActor;
    const pack = new T.Mesh(new T.SphereGeometry(0.3, 10, 8), api.texMat(0xc9ab7a, 'cloth')); pack.scale.set(1, 0.8, 0.7); pack.position.set(0, 0.85, -0.38); a.body.add(pack);
    return m;
  },

  _dress(api) {
    const T = api.THREE, g = new T.Group(), B = SEA.BED;
    const M = (geo, mat, x, y, z) => { const m = new T.Mesh(geo, mat); m.position.set(x, y, z); m.receiveShadow = true; g.add(m); return m; };
    // seaweed left lying on the dry seabed, shells and starfish
    const weed = [0x6b5a2a, 0x4f5f2c, 0x7a5c32].map((c) => new T.MeshLambertMaterial({ color: c }));
    for (let i = 0; i < 26; i++) {
      const side = i % 2 ? 1 : -1, x = side * (7.4 + (i % 3) * 0.5), z = 20 - i * 3.1;
      if (Math.abs(z + 16) < 3 || Math.abs(z + 42) < 3) continue;
      for (let k = 0; k < 3; k++) { const w = M(new T.ConeGeometry(0.08, 0.9 + k * 0.25, 4), weed[(i + k) % 3], x + k * 0.18 - 0.18, api.terrain(x, z) + 0.4, z + k * 0.12); w.rotation.set(0.5 * side, 0, (k - 1) * 0.35); }
    }
    const shellMat = [0xf5e1c8, 0xf4b6c2, 0xe8d5b0].map((c) => new T.MeshLambertMaterial({ color: c })), star = new T.MeshLambertMaterial({ color: 0xe0773b });
    for (let i = 0; i < 22; i++) {
      const x = Math.sin(i * 7.3) * 6.5, z = 20 - i * 3.6; if (Math.abs(z + 16) < 3 || Math.abs(z + 42) < 3) continue;
      const y = api.terrain(x, z) + 0.06;
      if (i % 4 === 0) { for (let a = 0; a < 5; a++) { const arm = M(new T.ConeGeometry(0.07, 0.32, 4), star, x + Math.sin(a * 1.257) * 0.13, y, z + Math.cos(a * 1.257) * 0.13); arm.rotation.set(Math.PI / 2, 0, -a * 1.257); arm.rotation.order = 'ZXY'; } }
      else { const sh = M(new T.SphereGeometry(0.12, 8, 6, 0, Math.PI * 2, 0, Math.PI / 2), shellMat[i % 3], x, y, z); sh.scale.set(1, 0.6, 1.2); }
    }
    api.scenery(g);
    // Moses: he stretches out his hand over the sea (Exodus 14:21), and again from the far side when it returns (14:27)
    const moses = api.storyPerson(0x7c5a3a, 0xe7dcc2, 1.05, { beard: true, age: 'elder', staff: true, register: false });
    moses.position.set(-3.4, api.terrain(-3.4, 33.2), 33.2); moses.rotation.y = Math.PI; api.add(moses); SEA.moses = moses;
    // Miriam and the women wait on the far shore with timbrels (Exodus 15:20)
    SEA.women = [[-5.5, -72.5, 0x9d174d], [-3.8, -73.4, 0x0e7490], [-7.2, -73.6, 0xb45309]].map(([x, z, robe], i) => {
      const w = api.storyPerson(robe, 0xf3e7c8, 0.96, { register: false }); w.position.set(x, api.terrain(x, z), z); w.rotation.y = 0.2; api.add(w);
      if (i === 0) { const t = new T.Mesh(new T.CylinderGeometry(0.22, 0.22, 0.06, 14), api.texMat(0xc9a46a, 'wood')); t.rotation.x = Math.PI / 2; t.position.set(0, -0.05, 0.12); w.userData.storyActor.hands[1].add(t); }
      return w;
    });
    // a family elder who knows what to do (optional; just for our game)
    const elder = api.storyPerson(0x5b4636, 0xe9dcc0, 1, { beard: true, age: 'elder', cane: true }); elder.position.set(3.4, api.terrain(3.4, 33.6), 33.6); elder.rotation.y = -2.6; api.add(elder); SEA.elder = elder;
    SEA.elderTalk = api.conversation({
      person: elder, speaker: 'A family elder', label: 'Talk with the elder',
      clue(api) {
        if (!SEA.opened) return { text: 'Stand still and watch what the LORD will do.' };
        const t = SEA.travellers.find((f) => f.state === 'idle');
        if (t) return { text: 'Tired families are resting on the seabed. Call them and lead them across to the far shore.', at: [t.pos.x, t.pos.y + 1.5, t.pos.z] };
        const b = SEA.bundles.find((x) => !x.delivered && !x.got && !x.holder);
        if (b) return { text: 'Some bundles were dropped on the way. Pick them up as you go.', at: [b.x, b.y + 1, b.z] };
        return { text: 'Everyone is across! Up onto the far shore.', at: [SEA.SHORE[0], api.terrain(0, SEA.SHORE[1]) + 1, SEA.SHORE[1]] };
      }
    });
  },

  _poses(api, dt, k) {
    const t = api.time;
    (SEA.faces || []).forEach(({ face, foam }, j) => {
      const p = face.geometry.attributes.position, base = face.userData.base;
      for (let i = 0; i < p.count; i++) p.setZ(i, base[i * 3 + 2] + Math.sin(base[i * 3] * 0.35 + t * 1.4 + j) * Math.cos(base[i * 3 + 1] * 0.5 + t) * 0.18);
      p.needsUpdate = true;
      foam.children.forEach((b, i) => { b.position.y = 6.5 + Math.sin(t * 2 + i * 1.3) * 0.18; });
    });
    SEA.travellers.forEach((f) => { if (f.mesh.userData.storyActor) api.posePerson(f.mesh, { dt, stride: f.walkAmt || 0, expression: f.state === 'idle' ? 'worry' : 'calm' }); });
    SEA.army.forEach((c) => { const r = c.mesh.children.find((o) => o.userData && o.userData.storyActor); if (r) { r.userData.storyActor.body.rotation.z = SEA.wheels ? Math.sin(t * 5 + c.bob) * 0.15 : 0; } });
    const m = SEA.moses; if (!m) return;
    const ps = api.activePlayers();
    if (!SEA.mosesAcross && SEA.opened && ps.length && ps.every((p) => p.pos.z < 0)) { SEA.mosesAcross = true; m.position.set(-2.6, api.terrain(-2.6, -66.4), -66.4); m.rotation.y = 0; }   // (out of sight, behind the family)
    const a = m.userData.storyActor, raise = (!SEA.opened && k < 1) || SEA.closing >= 0;
    api.posePerson(m, { dt, expression: raise ? 'wonder' : 'calm' });
    if (raise) { a.arms[1].rotation.x = -2.5; a.arms[1].rotation.z = 0.2; }                   // his hand (and rod) stretched out over the sea
    (SEA.women || []).forEach((w, i) => api.posePerson(w, { dt, expression: SEA.closing >= 0 ? 'wonder' : 'calm', cheer: SEA.closing >= 0 && t % 3 < 1.5 + i * 0.3 }));
    if (SEA.elder) api.posePerson(SEA.elder, { dt, expression: SEA.opened ? 'wonder' : 'worry' });
  },

  update(api, dt) {
    const T = api.THREE;
    // God parts the sea as soon as the story cards are closed (players only watch)
    if (SEA.openT < 0) SEA.openT = api.time;
    const k = Math.min(1, (api.time - SEA.openT) / 3);
    if (!SEA.opened) {
      SEA.walls.forEach((w) => { w.scale.y = Math.max(0.01, k); w.position.y = SEA.BED - 6.5 + 13 * k; });
      SEA.water.position.y = 1.3 - k * 6;
      if (k >= 1) {
        SEA.opened = true;
        SEA.water.visible = false;
        SEA.barrier.show(false);
        SEA.fish.forEach((f) => { f.mesh.visible = true; });
        api.sfx('door');
        api.story([
          { art: '🌊', title: 'God parted the sea', text: 'And Moses stretched out his hand over the sea; and the LORD caused the sea to go back by a strong east wind all that night, and made the sea dry land, and the waters were divided.', ref: 'Exodus 14:21' },
          { art: '🚶', text: 'And the children of Israel went into the midst of the sea upon the dry ground: and the waters were a wall unto them on their right hand, and on their left.', ref: 'Exodus 14:22' }
        ], () => api.toast('🤝 Help the tired families and pick up the bundles they dropped on the way. Keep moving: the pillar of cloud stands between you and the army.', 4500));
      }
    }
    // --- the chase: the army follows into the sea; the pillar of cloud stays between ---
    if (SEA.opened && SEA.closing < 0) {
      if (!SEA.chaseOn) { SEA.chaseOn = true; SEA.armyZ = SEA.ARMY_START; SEA.cloud.visible = true; }
      // a steady pace; slower once God troubles their wheels; never right on top of the slowest family
      const speed = SEA.wheels ? 0.22 : 0.42;
      SEA.armyZ = Math.max(-58, SEA.armyZ - speed * dt);
      const front = SEA.armyZ;
      SEA.army.forEach((c) => {
        const z = front + 6 + c.dz, y = api.terrain(c.x, z);
        c.mesh.position.set(c.x + Math.sin(api.time * 0.7 + c.bob) * 0.3, y + Math.abs(Math.sin(api.time * 6 + c.bob)) * (SEA.wheels ? 0.18 : 0.06), z);
        c.mesh.rotation.z = SEA.wheels ? Math.sin(api.time * 5 + c.bob) * 0.12 : 0;   // wobbling, wheels coming off
        c.mesh.wheels.forEach((w) => { w.rotation.x += dt * (SEA.wheels ? 1 : 4); });
      });
      SEA.cloud.position.set(0, api.terrain(0, front + 2.5), front + 2.5);
      // anyone the army reaches is carried forward by the pillar (no harm, no lost progress)
      api.activePlayers().forEach((p) => {
        if (p.pos.z > front) {
          const lead = api.activePlayers().filter((q) => q !== p && q.pos.z < front - 4).sort((a, b) => a.pos.z - b.pos.z)[0];
          if (p.holding) { /* carrying something: keep it, just move forward */ }
          p.pos.z = front - 3; p.pos.y = api.groundAt(p.pos.x, p.pos.z) + 0.2; p.vel.set(0, 0, 0);
          if (lead) { p.pos.x = lead.pos.x + 1; p.pos.z = Math.min(front - 3, lead.pos.z + 1.5); p.pos.y = api.groundAt(p.pos.x, p.pos.z) + 0.2; }
          api.puff(p.pos.x, p.pos.y + 1, p.pos.z, 0xe5e7eb, 10);
          if (!SEA.toldCaught) { SEA.toldCaught = true; api.toast('☁️ The pillar of cloud carried you forward! Keep going: the army is behind you.', 3800); }
        }
      });
      SEA.travellers.forEach((f) => {
        if (f.state !== 'idle' || f.pos.z < front) return;
        f.pos.z = front - 4; f.home.z = front - 4; f.pos.y = api.terrain(f.pos.x, f.pos.z); f.mesh.position.copy(f.pos);
        api.puff(f.pos.x, f.pos.y + 1, f.pos.z, 0xe5e7eb, 8);
      });
      SEA.bundles.forEach((b) => {
        if (b.delivered || b.got || b.holder || b.z < front) return;
        b.z = front - 4; b.y = api.groundAt(b.x, b.z); b.mesh.position.set(b.x, b.y + 0.3, b.z);
        if (b.shadow) b.shadow.position.set(b.x, b.y + 0.025, b.z);
        if (b.inter) { b.inter.x = b.x; b.inter.z = b.z; b.inter.y = b.y; }
      });
      // a warning, once, when the army is close behind someone
      if (!SEA.toldNear && api.activePlayers().some((p) => p.pos.z > front - 8)) {
        SEA.toldNear = true;
        api.toast('🐎 Pharaoh\'s chariots are coming! The pillar of cloud holds them back. Keep moving!', 4000);
      }
      // God troubles the chariots (Exodus 14:24-25)
      if (!SEA.wheels && front < -16) {
        SEA.wheels = true;
        api.toast('🛞 God took off their chariot wheels, so they drove heavily (Exodus 14:25)!', 4000);
      }
    }
    LEVEL._poses(api, dt, k);
    // fish swim along the walls
    SEA.fish.forEach((f) => {
      const z = 26 - ((f.z0 + api.time * f.speed) % 88);
      f.mesh.position.set(f.x, f.y + Math.sin(api.time * 2 + f.z0) * 0.2, z);
    });
    SEA.pillar.rotation.y += dt * 0.5;
    // loose pebbles fall near the coral pillars (only when someone is close)
    const near = api.activePlayers().some((p) => Math.hypot(p.pos.x - 7, p.pos.z + 32) < 8);
    SEA.pebbles.forEach((d) => {
      d.rock.visible = d.ring.visible = near;
      if (!near) return;
      if (d.x === 0) { d.x = 5 + Math.random() * 4; d.z = -36 + Math.random() * 8; }
      d.y -= d.speed * dt;
      const gy = api.groundAt(d.x, d.z);
      d.rock.position.set(d.x, d.y, d.z); d.rock.rotation.x += dt * 5;
      d.ring.position.set(d.x, gy + 0.06, d.z);
      if (d.y <= gy + 0.4) {
        api.near(d.x, d.z, 1.4).forEach((p) => api.hit(p, d.x, d.z, 'falling', 'Bonk! A loose pebble. The Shield of Faith 🛡️ blocks those.'));
        api.puff(d.x, gy, d.z, 0x94a3b8, 5);
        d.x = 5 + Math.random() * 4; d.z = -36 + Math.random() * 8; d.y = 24 + Math.random() * 10;
      }
    });
    // the sea closes during the finale
    if (SEA.closing >= 0) {
      const c = Math.min(1, (api.time - SEA.closing) / 3);
      SEA.water.visible = true;
      SEA.water.position.y = -4.7 + c * 6;
      SEA.walls.forEach((w) => { w.material.opacity = 0.78 * (1 - c); w.children.forEach((m) => { if (m.material && m.material.transparent) m.material.opacity = (m.userData.baseOpacity || 0.6) * (1 - c); }); });
    }
  },

  objective(api) {
    const ps = api.activePlayers();
    if (!ps.length || !SEA.opened) return null;
    if (ps.some((p) => p.holding)) return [SEA.SHORE[0], api.terrain(0, SEA.SHORE[1]) + 1, SEA.SHORE[1]];
    const cx = ps.reduce((s, p) => s + p.pos.x, 0) / ps.length;
    const cz = ps.reduce((s, p) => s + p.pos.z, 0) / ps.length;
    const todo = [];
    SEA.travellers.forEach((f) => { if (f.state === 'idle') todo.push([f.pos.x, f.pos.y + 1.5, f.pos.z]); });
    SEA.bundles.forEach((b) => { if (!b.delivered && !b.got && !b.holder) todo.push([b.x, b.y + 1, b.z]); });
    if (!todo.length) return [SEA.SHORE[0], api.terrain(0, SEA.SHORE[1]) + 1, SEA.SHORE[1]];   // lead followers home
    todo.sort((a, b) => Math.hypot(a[0] - cx, a[2] - cz) - Math.hypot(b[0] - cx, b[2] - cz));
    return todo[0];
  },

  finale: {
    message: '🏖️ Everyone up onto the far shore!',
    beacon: [0, 4, -69],
    inZone(p) { return p.pos.z < -65; },
    onUpdate(api, t) {
      if (t > 0.5 && SEA.closing < 0) { SEA.closing = api.time; api.sfx('door'); }
      if (t > 3.5 && !SEA.toldEnd) {
        SEA.toldEnd = true;
        api.story([
          { art: '✝️', title: 'God makes a way', text: 'The LORD saved Israel. When the sea returned, Pharaoh\'s pursuing army drowned; none of that army survived (Exodus 14:28–30). God judged Egypt and rescued His people. Through Jesus, God makes the way for us back to Him.' },
          { art: '📜', text: 'Jesus saith unto him, I am the way, the truth, and the life: no man cometh unto the Father, but by me.', ref: 'John 14:6' }
        ], () => { SEA.endT = api.time; });
      }
      return SEA.endT !== undefined && api.time - SEA.endT > 2;
    }
  }
};
