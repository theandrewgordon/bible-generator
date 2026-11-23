/* =====================================================================
 * LEVEL 4-1: RUTH'S HARVEST  (Ruth 1:16; 2; 4:13-17)
 * ---------------------------------------------------------------------
 * The barley fields of Bethlehem at harvest. Walk toward -z:
 *   The low field   (z 42..4)   glean along the rows behind the reapers; hop the irrigation channel;
 *                               Boaz notices Ruth and is kind to her (Ruth 2:8-12)
 *   The upper field (z 0..-16)  two broad terrace steps up; more gleaning
 *   The way home    (z -18..-34) hop the second channel; the threshing floor; carry the ephah to Naomi
 * One continuous gleaning walk (handfuls are picked up on the way), then one carry home: no errands.
 * Thread: Boaz the kinsman-redeemer; Obed → Jesse → David (4-3) → Jesus.
 * Only edit THIS file to change the level. See GEMINI.md and CAMPAIGN.md.
 * ===================================================================== */

const RUTH = {
  handfuls: [],
  reapers: [],
  steps: [],
  ephah: null,
  BOAZ: [3, 27],
  NAOMI: [0, -30.5],
  FLOOR: [0, -24],
  metBoaz: false,
  told: false
};

const LEVEL = {
  id: '4-1',
  bibleConnection: {"passage": "Ruth 2–4", "text": "Ruth gleaned to feed Naomi, and Boaz showed kindness and later acted as a redeemer. Their family line led to David and Jesus. Our field crossings and harvest bridge are imagined ways to explore that care."},
  world: 'World 4-1',
  title: 'Ruth\'s Harvest',
  town: true,
  leafIcon: '🌾',
  leafColor: 0xeab308,
  spawn: [0, 42],
  finishTheme:'harvest',
  bounds: { minX: -19, maxX: 19, minZ: -40, maxZ: 46 },
  approach: ['stones', 'meadow:ox', 'crumbles'],   // the way in (engine): a stretch before the level's own start
  startMessage: 'Ruth gleans to feed Naomi. Our game adds field crossings and a harvest bridge: collect the grain along the route!',

  intro: [
    { text: 'whither thou goest, I will go; and where thou lodgest, I will lodge: thy people shall be my people, and thy God my God:', ref: 'Ruth 1:16' },
    { text: 'The LORD recompense thy work, and a full reward be given thee of the LORD God of Israel, under whose wings thou art come to trust.', ref: 'Ruth 2:12' }
  ],

  introStory: [
    { art: '🌾', title: 'Back to Bethlehem', text: 'Naomi came home to Bethlehem poor and sad. Her daughter-in-law Ruth came with her, from the land of Moab. God\'s law said the poor could pick up the grain the reapers left behind: that is called gleaning.' },
    { art: '🤝', title: 'Thy God my God', text: 'And Ruth said, Intreat me not to leave thee, or to return from following after thee: for whither thou goest, I will go; and where thou lodgest, I will lodge: thy people shall be my people, and thy God my God:', ref: 'Ruth 1:16' }
  ],

  tasks: [
    { id: 'glean', icon: '🌾', label: 'Glean the barley along the field', total: 8 },
    { id: 'home', icon: '🏠', label: 'Carry the barley home to Naomi', total: 1, lockedUntil: 'glean' }
  ],

  memoryVerse: { text: 'whither thou goest, I will go; and where thou lodgest, I will lodge: thy people shall be my people, and thy God my God:', ref: 'Ruth 1:16' },

  ending: {
    verse: { text: 'Blessed be the LORD, which hath not left thee this day without a kinsman,', ref: 'Ruth 4:14' },
    message: 'God took care of Ruth and Naomi through Boaz\'s kindness. Their family line led to King David, and to Jesus.'
  },

  quiz: [
    { q: 'What did Ruth say to Naomi?', ref: 'Ruth 1:16', options: ['"Go home without me"', '"Whither thou goest, I will go"', '"I will go back to Moab"'], answer: 1 },
    { q: 'What did Boaz tell his young men to do for Ruth?', ref: 'Ruth 2:16', options: ['Send her away', 'Let fall some handfuls on purpose for her', 'Make her pay'], answer: 1 },
    { q: 'Who was Ruth\'s great-grandson?', ref: 'Ruth 4:17', options: ['Moses', 'King David', 'Samuel'], answer: 1 }
  ],

  music: {
    bpm: 100,
    notes: [67, 0, 71, 72, 74, 0, 72, 71, 69, 0, 67, 0, 69, 0, 0, 0,
            67, 0, 71, 72, 76, 0, 74, 72, 71, 69, 67, 0, 67, 0, 0, 0],
    bass: [43, 43, 48, 48, 50, 50, 43, 43]
  },

  /* ---------- ground: barley field, two irrigation channels ---------- */
  terrain(x, z) {
    let h = Math.sin(x * 0.27) * Math.cos(z * 0.21) * 0.08;
    [20, -20].forEach((c) => { const d = Math.abs(z - c); if (d < 1.2) h -= 1.4 * Math.min(1, (1.2 - d) / 0.35); });
    return h;
  },

  groundColor(x, z, h) {
    if (h < -0.6) return 0x3b82c4;
    if (z < -27) return (Math.floor(x / 1.5) + Math.floor(z / 1.5)) % 2 ? 0xc4ad86 : 0xb9a17b;   // the town
    if (Math.abs(x) < 1.7 && z > -16) return 0xb8975e;                                          // the path through the field
    const row = Math.floor((x + 100) / 4) % 2;
    return row ? 0xd9b45a : 0xc9a24c;                                                            // harvested and standing rows
  },

  /* ---------- build ---------- */
  build(api) {
    const T = api.THREE;

    // --- barley rows (standing stalks: decoration you walk between) ---
    const stalk = new T.CylinderGeometry(0.025, 0.035, 0.9, 4), head = new T.SphereGeometry(0.08, 6, 4);
    head.scale(0.8, 2.1, 0.8);
    const points = [];
    for (let rx = -14; rx <= 14; rx += 4) {
      if (Math.abs(rx) < 2) continue;
      for (let z = 38; z > -16; z -= 0.8) {
        if (Math.abs(z - 20) < 1.6 || (z < 1 && z > -2)) continue;
        for (let k = 0; k < 2; k++) points.push([rx + 1.2 + k * 0.5 + Math.sin(z * 3 + k) * 0.15, z > -2 ? 0 : 2, z]);
      }
    }
    // Two draws for the whole authored crop, rather than a draw for every stalk/head.
    [[stalk, 0xcaa04a, 0.45], [head, 0xe6c66a, 0.95]].forEach(([geo, color, dy]) => {
      const m = new T.InstancedMesh(geo, api.mat(color), points.length), dummy = new T.Object3D();
      points.forEach(([x, y, z], i) => { dummy.position.set(x, y + dy, z); dummy.updateMatrix(); m.setMatrixAt(i, dummy.matrix); });
      m.receiveShadow = true; m.name = 'barley-rows'; api.add(m);
    });

    // --- reapers working ahead, and Boaz ---
    [[-9, 31], [6, 23], [-5, 14], [9, 8]].forEach(([x, z], i) => {
      const m = api.storyPerson([0x7c2d12, 0x57534e, 0x166534, 0x92400e][i], 0xe7e5e4, 0.96 + (i % 2) * 0.06, { beard: i % 2 === 0 }); m.position.set(x, 0, z); m.rotation.y = Math.PI; api.add(m);
      RUTH.reapers.push({ m, x, z, t: i });
    });
    const boaz = api.storyPerson(0x1e3a8a, 0xf5f5f4, 1.05, { beard: true }); boaz.position.set(RUTH.BOAZ[0], 0, RUTH.BOAZ[1]); boaz.rotation.y = 0.4; api.add(boaz); RUTH.boaz = boaz;

    // --- the handfuls, all along the way (the last ones up on the terrace and past it) ---
    const handful = () => {
      const b = new T.Group();
      for (let k = 0; k < 5; k++) { const s = new T.Mesh(new T.CylinderGeometry(0.04, 0.04, 0.7, 4), api.mat(0xd4a54a)); s.rotation.z = Math.PI / 2 + (k - 2) * 0.15; s.position.y = k * 0.03; b.add(s); }
      const tie = new T.Mesh(new T.TorusGeometry(0.1, 0.03, 6, 10), api.mat(0x7c4a1e)); tie.rotation.y = Math.PI / 2; b.add(tie);
      return b;
    };
    [[-2, 36], [5, 31], [-6, 26], [2, 15], [-7, 9], [6, -6], [-5, -12], [3, -26]].forEach(([x, z]) =>
      RUTH.handfuls.push(api.gatherable({ x, z, mesh: handful(), task: 'glean', onGet(p) { api.servant(p, 2); } })));
    api.armor('belt', 0, 38);

    // --- the irrigation channels (hop over; the Fisherman can wade) ---
    [20, -20].forEach((c) => {
      const wtr = new T.Mesh(new T.PlaneGeometry(40, 1.8), new T.MeshLambertMaterial({ color: 0x3b82c4, transparent: true, opacity: 0.85 }));
      wtr.rotation.x = -Math.PI / 2; wtr.position.set(0, -0.75, c); api.add(wtr);
      api.hazard({ x: 0, z: c, w: 40, d: 1.6 }, { maxY: -0.55, except: (p) => p.role.id === 'fisherman', msg: 'Splash! Jump over the channel.' });
    });
    api.fragment({ x: 12, z: 20, y: -0.4, net: true });
    api.camZone({ minX: -6, maxX: 6, minZ: 16, maxZ: 24, yaw: 0.3, height: 7, back: 11, focus: [0, 0, 18], pull: 0.35 });

    // --- the upper field: two broad terrace steps ---
    api.box({ x: 0, z: -0.8, w: 30, d: 2.4, h: 1.0, color: 0xa88a5a, house: false, tex: 'stone' });
    api.box({ x: 0, z: -9, w: 30, d: 14, h: 2.0, color: 0xc9a24c, house: false, tex: null, ao: false });
    api.camZone({ minX: -15, maxX: 15, minZ: -4, maxZ: 3, yaw: -0.2, height: 8, back: 12, focus: [0, 2, -4], pull: 0.3 });

    // --- the threshing floor and Naomi's house in town ---
    const floor = new T.Mesh(new T.CylinderGeometry(2.2, 2.3, 0.15, 24), api.texMat(0xb8a080, 'stone')); floor.position.set(RUTH.FLOOR[0], 0.08, RUTH.FLOOR[1]); api.add(floor);
    const sack = new T.Group();
    const s1 = new T.Mesh(new T.SphereGeometry(0.42, 12, 10), api.texMat(0xd6b98a, 'cloth')); s1.scale.y = 0.9; sack.add(s1);
    const tie = new T.Mesh(new T.CylinderGeometry(0.12, 0.2, 0.22, 8), api.mat(0x7c4a1e)); tie.position.y = 0.42; sack.add(tie);
    RUTH.ephah = api.carryable({ x: RUTH.FLOOR[0] + 1, z: RUTH.FLOOR[1], mesh: sack, name: 'barley (an ephah)', to: 'Naomi',
      deliverTo: { x: RUTH.NAOMI[0], z: RUTH.NAOMI[1], r: 2.4 },
      onDeliver(p) { api.task('home'); api.servant(p, 6, 'for bringing food home!'); } });
    RUTH.ephah.blocked = () => 'The barley beaten out on the threshing floor. Glean the field first.';
    RUTH.ephah.mesh.visible = false;
    RUTH.house = api.box({ x: 0, z: -35, w: 9, d: 5, h: 3.2, color: 0xd1bb92 });
    const naomi = api.storyPerson(0x6b21a8, 0xe7e5e4, 1, { age: 'elder' }); naomi.position.set(-1.8, 0, -32); api.add(naomi); RUTH.naomi = naomi;
    RUTH.town = [[-11, -33, 5, 5, 3.2], [11, -34, 6, 5, 3.4]].map(([x, z, w, d, h]) => ({ x, z, w, d, h, box: api.box({ x, z, w, d, h, color: 0xd1bb92 }) }));

    // Optional harvest pocket: an ordinary stepped route and a short rope crossing.
    api.ropeKit({x:6,z:33,y:api.terrain(6,33)});
    RUTH.harvestPocket=api.secretPocket({id:'gleaners-shelter',name:'The gleaners’ shelter',x:12,z:29,y:1.2,w:5,d:5});
    api.box({x:12,z:33,w:3,d:2,h:.6,color:0xb4935e,tex:'wood',house:false});
    api.ropeAnchor({from:[6,api.terrain(6,30),30],to:[12,1.2,29],arc:3.4,label:'Swing to the harvest shelter'});
    api.ropeAnchor({from:[12,1.2,29],to:[6,api.terrain(6,30),30],arc:3.4,label:'Swing back to the field'});
    api.leaves([[12,31,2.2],[12,29,2.2],[11.3,28,2.2]]);

    RUTH.dash=api.teamTrial({id:'harvest-dash',start:[-4,api.terrain(-4,31),31],stages:[[0,api.terrain(0,25),25,2.4],[0,api.terrain(0,17),17,2.4],[0,api.terrain(0,10),10,2.4]],seconds:24,label:'Try the optional harvest dash'});

    // --- fragments ---
    // 2: a stone granary by the field (only the Scribe jumps that high)
    api.box({ x: -13, z: 34, w: 3, d: 3, h: 5, color: 0xb8996e, house: false, tex: 'stone' });
    api.box({ x: -10.5, z: 36.6, w: 1.6, d: 1.6, h: 2.0, color: 0x8b6b45, house: false });
    api.fragment({ x: -13, z: 34, y: 5 + 1.3 });
    // 3: a harvest footbridge puzzle, rather than another roof ladder.
    // One Builder can secure it alone; two teammates can brace the crank together in co-op.
    RUTH.bridge = api.box({ x: 0, z: -20, w: 3.2, d: 4.4, h: 0.25, y: -0.15, hidden: true, color: 0xa0703c, house: false });
    RUTH.bridgeFragment = api.fragment({ x: 0, z: -20, y: 20 });
    RUTH.bridgeFragment.mesh.visible = false;
    const crank = new T.Mesh(new T.TorusGeometry(0.55, 0.1, 8, 16), api.mat(0x8b5e34));
    crank.position.set(3.8, 1.1, -17); api.add(crank);
    const mount = new T.Mesh(new T.BoxGeometry(.22,1.6,.28),api.texMat(0x8b6541,'wood')); mount.position.set(3.8,.8,-17.17); api.add(mount);
    const wornHub = new T.Mesh(new T.TorusGeometry(.18,.06,6,12),api.texMat(0x4b3526,'wood')); wornHub.position.set(3.8,1.1,-17.04); api.add(wornHub);
    RUTH.crank = crank;
    const folded = new T.Group(); folded.position.set(0, -0.025, -17.8); folded.rotation.x = Math.PI / 2;
    const deck = new T.Mesh(new T.BoxGeometry(3.2, 0.25, 4.4), api.texMat(0xa0703c, 'wood')); deck.position.z = -2.2; folded.add(deck);
    for (let k = 0; k < 8; k++) {
      const seam = new T.Mesh(new T.BoxGeometry(3.15, 0.018, 0.025), api.mat(0x6b4a2c)); seam.position.set(0, 0.134, -0.3-k*0.54); folded.add(seam);
    }
    api.add(folded); RUTH.folded = folded;
    const ropeGeo = new T.BufferGeometry().setFromPoints([new T.Vector3(3.8,1.1,-17), new T.Vector3(1.7,2.5,-17.8), new T.Vector3(1.5,2.5,-20)]);
    const rope = new T.Line(ropeGeo, new T.LineBasicMaterial({color:0x725a39})); api.add(rope); RUTH.rope = rope;
    const post = new T.Mesh(new T.CylinderGeometry(.09,.1,2.7,8),api.texMat(0x735231,'wood')); post.position.set(1.7,1.2,-17.8); api.add(post);
    api.interact({
      x: 3.8, z: -17, r: 2.4, label: 'Secure the harvest bridge',
      can: (p) => (p.role.id === 'builder' || api.near(3.8, -17, 2.8).length >= 2 ? true : 'The Builder can lock the crank, or two teammates can brace it together.'),
      use(p) {
        this.remove(); RUTH.bridgeOpen = true; RUTH.bridgeT = 0;
        api.near(3.8, -17, 2.8).forEach((q) => { q.workT = 0.6; });
        RUTH.bridgeFragment.y = RUTH.bridgeFragment.baseY = 1.4; RUTH.bridgeFragment.mesh.visible = true;
        api.near(3.8, -17, 2.8).forEach((q) => api.servant(q, 3, 'for making a crossing!'));
        api.sfx('bridge');
      }
    });

    // --- Golden Scroll course: up onto a raised threshing floor on the east ---
    api.course([
      { x: 15.4, z: 40, top: 1.0, kind: 'block' },
      { x: 17, z: 37.5, top: 1.8, kind: 'float' },
      { x: 15.4, z: 35, top: 2.6, kind: 'crumble' },
      { x: 17, z: 32.5, top: 3.4, kind: 'float' },
      { x: 15.4, z: 30, top: 4.2, kind: 'crumble' },
      { x: 17, z: 27.5, top: 5, kind: 'float' },
      { x: 15.4, z: 25, top: 5.8, kind: 'float' }
    ]);

    api.leaves([[0, 40], [0, 33], [-3, 29], [0, 23], [0, 17], [-3, 12], [0, 5], [0, 2], [0, -0.8, 1], [-2, -6, 2], [2, -10, 2], [0, -14, 2], [0, -18], [0, -22]]);
    LEVEL._dress(api);
  },

  update(api, dt) {
    if (RUTH.bridgeOpen && RUTH.bridgeT < 0.18) {
      RUTH.bridgeT = Math.min(0.18, RUTH.bridgeT + dt);
      const k = RUTH.bridgeT / 0.18;
      RUTH.folded.rotation.x = Math.PI / 2 * (1 - k);
      RUTH.crank.rotation.z = k * Math.PI * 2;
      const a = RUTH.rope.geometry.attributes.position;
      a.setXYZ(2, 1.5, 0.1 + 2.4 * (1-k), -17.8 - 2.2*k); a.needsUpdate = true;
      if (k === 1) { RUTH.folded.visible = false; RUTH.bridge.show(true); }
    }
    if (!RUTH.bridgeOpen && RUTH.bridgeFragment.shadow) RUTH.bridgeFragment.shadow.visible = false;
    LEVEL._poses(api, dt);
    if (!RUTH.metBoaz && api.near(RUTH.BOAZ[0], RUTH.BOAZ[1], 3.6).length) {
      RUTH.metBoaz = true; RUTH.boaz.userData.storyActor.talkUntil = api.time + 6;
      api.story([
        { art: '🧔', title: 'Boaz is kind to Ruth', text: 'The LORD recompense thy work, and a full reward be given thee of the LORD God of Israel, under whose wings thou art come to trust.', ref: 'Ruth 2:12' }
      ], () => api.toast('🌾 Boaz tells his young men: "let fall also some of the handfuls of purpose for her" (Ruth 2:16).', 4000));
    }
    if (!RUTH.saidDone && api.taskDone('glean')) {
      RUTH.saidDone = true;
      RUTH.ephah.blocked = null; RUTH.ephah.mesh.visible = true;
      api.puff(RUTH.FLOOR[0], 0.8, RUTH.FLOOR[1], 0xeab308, 16);
      api.toast('🏠 She "beat out that she had gleaned: and it was about an ephah of barley" (Ruth 2:17). Carry it home to Naomi!', 4500);
    }
  },

  /* ---------- presentation only: nothing here is solid, and no rule changes ---------- */
  _dress(api) {
    const T = api.THREE, g = new T.Group();
    const M = (geo, mat, x, y, z, parent) => { const m = new T.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true; (parent || g).add(m); return m; };
    const B = (w, h, d, mat, x, y, z, parent) => M(new T.BoxGeometry(w, h, d), mat, x, y, z, parent);
    const plaster = api.texMat(0xdcc7a0, 'clay'), trim = api.texMat(0xb79c72, 'clay'), wood = api.texMat(0x6b4a2c, 'wood'), dark = new T.MeshLambertMaterial({ color: 0x24190f });
    const straw = api.texMat(0xd8b25a, 'weave'), strawDark = api.texMat(0xb48f3e, 'weave');

    // sheaves standing in the harvested rows ("among the sheaves", Ruth 2:7)
    const sheaf = (x, z, lean) => {
      const sh = new T.Group(); sh.position.set(x, api.terrain(x, z) + (z < -2 && z > -16 ? 2 : 0), z); sh.rotation.set(lean, x * 3.1, lean * 0.6); g.add(sh);
      M(new T.CylinderGeometry(0.16, 0.3, 0.95, 8), straw, 0, 0.48, 0, sh);
      M(new T.ConeGeometry(0.3, 0.42, 8), strawDark, 0, 1.12, 0, sh).rotation.x = Math.PI;
      M(new T.TorusGeometry(0.19, 0.035, 6, 10), wood, 0, 0.62, 0, sh).rotation.x = Math.PI / 2;
    };
    for (let rx = -12; rx <= 12; rx += 8) for (let z = 36; z > -15; z -= 5.3) {
      if (Math.abs(z - 20) < 2.2 || (z < 2 && z > -3) || Math.abs(rx) < 2) continue;
      sheaf(rx + 0.4, z + (rx % 3), 0.06); sheaf(rx + 0.85, z + (rx % 3) + 0.4, -0.08);
    }
    // field edges: low stone walls along both sides
    for (let z = 42; z > -26; z -= 2.1) [-1, 1].forEach((sd) => { if (Math.abs(z - 20) < 1.6 || Math.abs(z + 20) < 1.6) return; const st = B(0.7, 0.45 + (Math.abs(z * 7) % 3) * 0.06, 1.9, api.texMat(0xa89a82, 'stone'), sd * 18.6, api.terrain(sd * 18.6, z) + 0.2, z); st.rotation.y = (z % 2) * 0.05; });

    // Naomi's house and the town: doors, windows, flat-roof edges
    const dress = (x, z, w, d, h, door) => {
      const f = z + d / 2;
      B(w + 0.24, 0.2, d + 0.24, trim, x, h - 0.02, z);
      B(0.95, 1.85, 0.06, wood, x + door, 0.93, f + 0.03);
      B(1.25, 0.14, 0.18, wood, x + door, 1.92, f + 0.08);
      [-1, 1].forEach((sd) => { if (Math.abs(sd * w * 0.28 - door) > 1) B(0.62, 0.55, 0.05, dark, x + sd * w * 0.28, 2.05, f + 0.03); });
    };
    RUTH.house.mesh.material = plaster; dress(0, -35, 9, 5, 3.2, 1.6);
    RUTH.town.forEach((t) => { t.box.mesh.material = plaster; dress(t.x, t.z, t.w, t.d, t.h, t.x < 0 ? 1.2 : -1.4); });
    [[-3.6, 0.42], [-2.9, 0.34]].forEach(([x, r]) => {                     // water jars by Naomi's door
      const pts = [[0, 0], [r * 0.7, 0.05], [r, 0.35], [r * 0.85, 0.7], [r * 0.45, 0.85], [r * 0.5, 0.95]].map(([a, b]) => new T.Vector2(a, b));
      M(new T.LatheGeometry(pts, 14), api.texMat(0xa8603a, 'clay'), x, 0, -32.1);
    });
    // the threshing floor: a ring of stones, a winnowing fork and a heap of grain
    for (let i = 0; i < 18; i++) { const a = i / 18 * Math.PI * 2; B(0.4, 0.2, 0.3, api.texMat(0x9c8f78, 'stone'), RUTH.FLOOR[0] + Math.cos(a) * 2.45, 0.1, RUTH.FLOOR[1] + Math.sin(a) * 2.45).rotation.y = -a; }
    M(new T.ConeGeometry(0.8, 0.5, 14), straw, RUTH.FLOOR[0] - 1, 0.4, RUTH.FLOOR[1] - 0.6);
    const fork = B(0.06, 2.0, 0.06, wood, RUTH.FLOOR[0] - 2.75, 0.95, RUTH.FLOOR[1] + 1.2); fork.rotation.z = 0.25;
    // Bethlehem on its hill, beyond the town
    const far = api.texMat(0xcbb48a, 'clay'), hill = api.texMat(0x8f8a5a, 'stone');
    M(new T.CylinderGeometry(26, 34, 6, 18), hill, 0, -1, -66);
    [[-14, -50, 5, 3.5], [-7, -48, 4, 3], [0, -51, 6, 4.2], [7, -48.5, 4.5, 3.2], [14, -51, 5, 3.6], [-10, -55, 5, 4], [4, -56, 6, 4.4], [12, -57, 4, 3.4], [-3, -60, 7, 5]]
      .forEach(([x, z, w, h]) => { B(w, h, 4, far, x, 2 + h / 2, z); B(0.7, 0.8, 0.05, dark, x - w * 0.2, 2 + h * 0.6, z + 2.03); });
    api.scenery(g);
    [['CommonTree_3', -6.6, -29.6, 4.2], ['CommonTree_1', 7.2, -29.4, 3.8], ['CommonTree_5', -16.2, -27.5, 4.5]].forEach(([name, x, z, h]) => { const m = api.model(name, h); if (!m) return; const t = new T.Group(); t.position.set(x, 0, z); t.add(m); api.add(t); api.fadeScenery(t, 2.4); });

    // the reapers' sickles; Ruth gleaning behind them; Naomi waiting at home
    const blade = api.texMat(0x8d8a84, 'bronze');
    RUTH.reapers.forEach((r) => {
      const a = r.m.userData.storyActor, k = new T.Group(); k.position.set(0, -0.05, 0.08); a.hands[1].add(k);
      const handle = new T.Mesh(new T.CylinderGeometry(0.025, 0.025, 0.28, 6), wood); handle.rotation.x = Math.PI / 2; handle.position.z = 0.1; k.add(handle);
      const curve = new T.Mesh(new T.TorusGeometry(0.17, 0.02, 4, 12, Math.PI * 1.2), blade); curve.position.set(0, 0, 0.36); curve.rotation.y = Math.PI / 2; k.add(curve);
    });
    const ruth = api.storyPerson(0x8a4b6b, 0xead6a8, 0.97, {}); ruth.position.set(-3.4, api.terrain(-3.4, 33.5), 33.5); ruth.rotation.y = Math.PI * 0.85; api.add(ruth); RUTH.ruth = ruth;
    const bundle = new T.Group(); for (let k = 0; k < 6; k++) { const st = new T.Mesh(new T.CylinderGeometry(0.02, 0.02, 0.6, 4), straw); st.rotation.z = Math.PI / 2 + (k - 2.5) * 0.08; st.position.y = k * 0.02; bundle.add(st); }
    bundle.position.set(0, -0.05, 0.12); ruth.userData.storyActor.hands[0].add(bundle);
    RUTH.stations = [[-3.4, 33.5], [-3.6, 11.5], [-3.2, -8.5], [1.8, -31.4]];
    RUTH.station = 0;

    // a reaper who knows where the gleaning is (optional; just for our game)
    RUTH.reaperTalk = api.conversation({
      person: RUTH.reapers[0].m, speaker: 'Reaper', label: 'Talk with the reaper',
      clue(api) {
        if (!api.taskDone('glean')) {
          const h = RUTH.handfuls.filter((it) => !it.got)[0];
          return { text: 'Boaz told us to leave handfuls behind for Ruth. Pick them up along the rows!', at: h ? [h.x, h.y + 1, h.z] : undefined };
        }
        if (!api.taskDone('home')) return { text: 'Ruth beat out her barley on the threshing floor. Carry it home to Naomi in town.', at: [RUTH.ephah.x, 1, RUTH.ephah.z] };
        return { text: 'Naomi will have bread tonight!' };
      }
    });
  },

  // Reapers bend and swing; Ruth gleans a little way behind them and goes ahead (out of sight) as the family moves on.
  _poses(api, dt) {
    const t = api.time;
    RUTH.reapers.forEach((r, i) => {
      const a = r.m.userData.storyActor, near = api.near(r.x, r.z, 3.2).length > 0;
      if (near || (a.talkUntil || 0) > t) { a.body.rotation.x += (0 - a.body.rotation.x) * Math.min(1, dt * 5); api.posePerson(r.m, { dt, expression: 'calm' }); return; }   // straighten up to say hello
      a.body.rotation.x += (0.42 - a.body.rotation.x) * Math.min(1, dt * 4);
      a.head.rotation.x = 0.25;
      a.arms[1].rotation.x = -0.75 + Math.sin(t * 3 + i) * 0.55; a.arms[1].rotation.z = 0.2;
      a.arms[0].rotation.x = -0.9; a.arms[0].rotation.z = -0.15;
    });
    const R = RUTH.ruth; if (!R) return;
    const ps = api.activePlayers();
    if (RUTH.station < 2 && ps.length && ps.every((p) => p.pos.z < RUTH.stations[RUTH.station][1] - 12)) RUTH.station++;   // well behind everyone (off screen): she goes on ahead
    if (RUTH.station < 3 && api.taskDone('glean') && ps.length && ps.every((p) => p.pos.z < -18)) RUTH.station = 3;     // home with Naomi
    const [sx, sz] = RUTH.stations[RUTH.station];
    if (R.position.x !== sx || R.position.z !== sz) { R.position.set(sx, api.terrain(sx, sz) + (sz < -2 && sz > -16 ? 2 : 0), sz); R.rotation.y = RUTH.station === 3 ? 0.3 : Math.PI * 0.85; }
    const a = R.userData.storyActor;
    if (RUTH.station === 3) { a.body.rotation.x += (0 - a.body.rotation.x) * Math.min(1, dt * 4); api.posePerson(R, { dt, expression: 'calm', cheer: api.taskDone('home') && t % 6 < 2 }); }
    else {
      a.body.rotation.x += (0.5 - a.body.rotation.x) * Math.min(1, dt * 4); a.head.rotation.x = 0.35;
      a.arms[1].rotation.x = -0.4 - Math.max(0, Math.sin(t * 1.6)) * 0.9; a.arms[1].rotation.z = 0.1;   // reaching down to pick up stalks
      a.arms[0].rotation.x = -1.0; a.arms[0].rotation.z = -0.25;
    }
    if (RUTH.boaz) api.posePerson(RUTH.boaz, { dt, expression: RUTH.metBoaz ? 'calm' : 'listen' });
    if (RUTH.naomi) api.posePerson(RUTH.naomi, { dt, expression: api.taskDone('home') ? 'wonder' : 'worry', cheer: api.taskDone('home') && t % 7 < 2.5 });
  },

  objective(api) {
    const ps = api.activePlayers();
    if (!ps.length) return null;
    if (!api.taskDone('glean')) {
      const cz = ps.reduce((s, p) => s + p.pos.z, 0) / ps.length;
      const h = RUTH.handfuls.filter((it) => !it.got).sort((a, b) => Math.abs(a.z - cz) - Math.abs(b.z - cz) + (b.z > cz + 4 ? -50 : 0) - (a.z > cz + 4 ? -50 : 0))[0];
      return h ? [h.x, h.y + 1, h.z] : null;
    }
    if (ps.some((p) => p.holding === RUTH.ephah)) return [RUTH.NAOMI[0], 1.5, RUTH.NAOMI[1]];
    if (!RUTH.ephah.delivered) return [RUTH.ephah.x, 1, RUTH.ephah.z];
    return [RUTH.NAOMI[0], 1.5, RUTH.NAOMI[1]];
  },

  finale: {
    message: '🏠 Everyone gather at Naomi\'s house!',
    beacon: [0, 3, -30],
    inZone(p) { return Math.hypot(p.pos.x - RUTH.NAOMI[0], p.pos.z - RUTH.NAOMI[1]) < 4.5; },
    onUpdate(api, t) {
      if (t > 0.5 && !RUTH.told) {
        RUTH.told = true;
        api.story([
          { art: '🏠', title: 'Home to Naomi', text: 'And she took it up, and went into the city: and her mother in law saw what she had gleaned:', ref: 'Ruth 2:18' },
          { art: '💍', title: 'Later: a redeemer', text: 'Later Boaz married Ruth. As the close relative, he bought back Naomi\'s family land and took care of them (Ruth 4:9–13). He is called a redeemer: a picture of Jesus, who buys us back.' },
          { art: '👶', title: 'Obed, Jesse, David', text: 'And the women her neighbours gave it a name, saying, There is a son born to Naomi; and they called his name Obed: he is the father of Jesse, the father of David.', ref: 'Ruth 4:17' }
        ], () => { RUTH.endT = api.time; api.sfx('win'); });
      }
      return RUTH.endT !== undefined && api.time - RUTH.endT > 2;
    }
  }
};
