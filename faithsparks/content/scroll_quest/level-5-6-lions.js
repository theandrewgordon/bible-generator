/* =====================================================================
 * LEVEL 5-6: THE LIONS' DEN  (Daniel 6)
 * ---------------------------------------------------------------------
 * Night in Babylon, north (Daniel's house) to south (the den).
 *   1. Daniel keeps praying, with his window open toward Jerusalem (even after the decree).
 *   2. He is put in the den (told on cards; the den is sealed with a stone). Light the lanterns
 *      along the way while the king lies awake all night.
 *   3. Very early in the morning, lead the king to the den. The stone is moved: Daniel is safe!
 *      The lions just lie there: God shut their mouths. Bring ropes to lift Daniel out.
 * The lions are never fought or tricked; after God shuts their mouths you can walk calmly past them.
 * Only edit THIS file to change the level. See GEMINI.md and CAMPAIGN.md.
 * ===================================================================== */

const DEN = {
  HOUSE: [0, 30],
  PALACE: [-14, -4],
  C: [8, -22],                 // the den
  MOUTH: [8, -14.6],           // where the king calls and the ropes go
  lamps: [],
  lions: [],
  ropes: [],
  opened: false,
  lifted: false
};

const LEVEL = {
  id: '5-6',
  bibleConnection: {"passage": "Daniel 6", "text": "Daniel kept praying when the law forbade it and was thrown to the lions. God shut their mouths and preserved him. Our lanterns and rescue ropes explore the night and morning; no puzzle tames the lions."},
  world: 'World 5-6',
  title: 'The Lions\' Den',
  time: 'night',
  leafIcon: '🕯️',
  leafColor: 0xfde68a,
  leafShape: 'round',
  spawn: [0, 22],
  bounds: { minX: -22, maxX: 22, minZ: -32, maxZ: 36 },
  approach: ['stones', 'log', 'crumbles'],   // the way in (engine): a stretch before the level's own start
  startMessage: 'Daniel prays every day. Open his window toward Jerusalem.',

  intro: [
    { text: 'Now when Daniel knew that the writing was signed, he went into his house; and his windows being open in his chamber toward Jerusalem, he kneeled upon his knees three times a day, and prayed, and gave thanks before his God, as he did aforetime.', ref: 'Daniel 6:10' },
    { text: 'What time I am afraid, I will trust in thee.', ref: 'Psalm 56:3' }
  ],

  introStory: [
    { art: '😠', title: 'A trap', text: 'Some jealous leaders could find nothing wrong with Daniel. So they tricked King Darius into a new law: for thirty days, nobody could pray to anyone except the king. Whoever broke it would be thrown to the lions. Daniel knew. But he still prayed to God, just as he always did.' }
  ],

  tasks: [
    { id: 'window', icon: '🪟', label: 'Open Daniel\'s window toward Jerusalem', total: 1 },
    { id: 'lamps', icon: '🏮', label: 'Light the lanterns through the night', total: 5, lockedUntil: 'window' },
    { id: 'king', icon: '👑', label: 'Lead the king to the den at dawn', total: 1, lockedUntil: 'lamps' },
    { id: 'rope', icon: '🪢', label: 'Bring ropes to lift Daniel out', total: 2, lockedUntil: 'king' }
  ],

  memoryVerse: { text: 'What time I am afraid, I will trust in thee.', ref: 'Psalm 56:3' },

  ending: {
    verse: { text: 'My God hath sent his angel, and hath shut the lions’ mouths, that they have not hurt me:', ref: 'Daniel 6:22' },
    message: 'Daniel kept praying even when it was against the law. God kept him safe all night long.'
  },

  quiz: [
    { q: 'What did Daniel do after the new law was signed?', ref: 'Daniel 6:10', options: ['Stopped praying', 'Prayed in secret only once', 'Prayed three times a day, as before'], answer: 2 },
    { q: 'Who shut the lions\' mouths?', ref: 'Daniel 6:22', options: ['The king', 'God sent His angel', 'Daniel fought them'], answer: 1 },
    { q: 'How was Daniel when they took him out?', ref: 'Daniel 6:23', options: ['No hurt at all', 'Very hurt', 'Asleep'], answer: 0 }
  ],

  music: {
    bpm: 72,
    notes: [60, 0, 63, 0, 67, 0, 68, 67, 63, 0, 62, 0, 60, 0, 0, 0,
            63, 0, 67, 0, 72, 0, 70, 68, 67, 0, 63, 0, 62, 60, 0, 0],
    bass: [36, 36, 41, 41, 43, 43, 36, 36]
  },

  onCallText() {                                                 // said once; after that they just come
    if (DEN.saidCall) return '';
    DEN.saidCall = true;
    return 'The king hurries along with you to the den!';
  },

  /* ---------- ground shape ---------- */
  terrain(x, z) {
    let h = Math.sin(x * 0.3) * Math.cos(z * 0.25) * 0.08;
    const dx = Math.abs(x - DEN.C[0]), dz = Math.abs(z - DEN.C[1]), d = Math.max(dx, dz);
    if (d < 5.4) h -= 3 * Math.min(1, (5.4 - d) / 1.6);                  // the den: a pit
    const pd = Math.hypot(x + 15, z - 14);                              // a garden pool
    if (pd < 3) h -= 2 * Math.min(1, (3 - pd) / 1);
    return h;
  },

  groundColor(x, z, h) {
    if (h < -1.2 && Math.hypot(x + 15, z - 14) < 3) return 0x1d4f7a;
    if (h < -0.5) return 0x6b5a45;
    // (colour only) a paved street along the lanterns from Daniel's door to the den, a paved palace court, a garden by the pool
    const route = [[0, 27], [2, 19], [-5, 12], [-10, 4], [-4, -7], [3, -11], [8, -15]];
    let d = 99;
    for (let i = 0; i + 1 < route.length; i++) {
      const [ax, az] = route[i], [bx, bz] = route[i + 1], vx = bx - ax, vz = bz - az, t = Math.max(0, Math.min(1, ((x - ax) * vx + (z - az) * vz) / (vx * vx + vz * vz)));
      d = Math.min(d, Math.hypot(x - ax - vx * t, z - az - vz * t));
    }
    const court = x > -19 && x < -9 && z > -1 && z < 4.5;
    if (d < 1.5 || court) return ((Math.floor(x / 1.1) + Math.floor(z / 0.8)) % 2) ? 0xd2bb8e : 0xc5ad7f;
    if (d < 1.9) return 0x6e5f49;                                       // the kerb
    if (Math.hypot(x + 15, z - 14) < 5.5) return Math.sin(x * 2.1) * Math.cos(z * 1.7) > 0.2 ? 0x5f7445 : 0x56693e;
    const n = Math.sin(x * 0.9 + Math.cos(z * 0.7) * 2) * Math.cos(z * 0.8);
    return n > 0.35 ? 0x7a6a50 : n < -0.35 ? 0x6b5c45 : 0x73634a;      // warm packed earth
  },

  /* ---------- build ---------- */
  build(api) {
    const T = api.THREE;
    const person = (robe, scarf, s, o) => api.person(robe, scarf, s, o);   // friendly round townsfolk (engine)
    const stone = 0x8a7f6a;

    // --- Daniel's house with the window toward Jerusalem ---
    const [hx, hz] = DEN.HOUSE;
    DEN.house = api.box({ x: hx, z: hz, w: 7, d: 5, h: 4.2, color: 0xa89878 });
    const shutter = new T.Mesh(new T.BoxGeometry(1.6, 1.2, 0.12), api.mat(0x5c3d22)); shutter.position.set(hx, 3, hz - 2.56); api.add(shutter); DEN.shutter = shutter;
    const winGlow = new T.PointLight(0xffd59e, 0, 9, 2); winGlow.position.set(hx, 3, hz - 3.4); api.add(winGlow); DEN.winGlow = winGlow;
    const daniel = api.storyPerson(0x1e3a8a, 0xfef3c7, 0.85, { beard: true, age: 'elder', register: false });
    daniel.position.set(hx + 0.25, 2.62, hz - 2.3); daniel.rotation.y = Math.PI; daniel.visible = false; api.add(daniel); DEN.daniel = daniel;
    api.interact({
      x: hx, z: hz - 3.6, r: 2.6, label: 'Open the window toward Jerusalem',
      use(p) {
        this.remove(); shutter.rotation.y = 1.3; shutter.position.x += 0.7; winGlow.intensity = 1.4;
        LEVEL._kneel(daniel); daniel.visible = true; if (DEN.windowLit) DEN.windowLit(); api.task('window'); api.servant(p, 4, 'for helping Daniel pray!');
        LEVEL._arrested(api);
      }
    });

    // --- lanterns along the way (house -> palace -> den) ---
    [[2, 19], [-5, 12], [-10, 4], [-4, -7], [3, -11]].forEach(([x, z]) => {
      const post = new T.Mesh(new T.CylinderGeometry(0.08, 0.1, 2.2, 6), api.mat(0x3f2a16)); post.position.set(x, api.terrain(x, z) + 1.1, z); api.add(post);
      const lamp = new T.Mesh(new T.SphereGeometry(0.22, 10, 8), new T.MeshLambertMaterial({ color: 0x57534e, emissive: 0x000000 })); lamp.position.set(x, api.terrain(x, z) + 2.3, z); api.add(lamp);
      const light = new T.PointLight(0xffc56b, 0, 10, 2); light.position.copy(lamp.position); api.add(light);
      const L = { x, z, lamp, light, lit: false };
      L.inter = api.interact({
        x, z, r: 2.2, label: 'Light the lantern',
        can: () => (api.taskDone('window') ? true : 'A lantern for the night.'),
        use(p) {
          this.remove(); L.lit = true; light.intensity = 1.6; lamp.material.emissive.setHex(0xffb347);
          api.task('lamps'); api.servant(p, 2); api.sfx('coin');
          if (api.taskDone('lamps')) LEVEL._dawn(api);                // (the task board counts the others: no pop-up)
        }
      });
      DEN.lamps.push(L);
    });

    // --- the palace and the king ---
    const [px, pz] = DEN.PALACE;
    DEN.palace = api.box({ x: px, z: pz, w: 8, d: 6, h: 4.6, color: 0xb59a6d });
    [-3, 3].forEach((dx) => { const col = new T.Mesh(new T.CylinderGeometry(0.3, 0.3, 4, 10), api.mat(0xd6c39a)); col.position.set(px + dx, 2, pz + 3.4); api.add(col); });
    const king = api.follower({ x: px + 2, z: pz + 5, kind: 'king', mesh: LEVEL._crowned(api, api.storyPerson(0x6d28d9, 0xfacc15, 1, { beard: true, register: false })),
      deliverTo: { x: DEN.MOUTH[0], z: DEN.MOUTH[1] + 1.4, r: 2.4 },
      parkAt: [DEN.MOUTH[0] - 1.6, 0, DEN.MOUTH[1] + 1.2],
      onDeliver(p) { api.task('king'); api.servant(p, 5, 'for bringing the king!'); LEVEL._opened(api); } });
    king.callable = () => (api.taskDone('lamps') ? true : 'King Darius is lying awake, fasting. Not yet.');
    DEN.king = king;
    // ropes by the palace door
    [[px - 4, pz + 5.2], [px - 2.6, pz + 6]].forEach(([x, z]) => {
      const m = new T.Mesh(new T.TorusGeometry(0.32, 0.1, 8, 16), api.mat(0xc8a46a)); m.rotation.x = Math.PI / 2;
      const it = api.carryable({ x, z, mesh: m, name: 'rope', to: 'the mouth of the den',
        deliverTo: { x: DEN.MOUTH[0], z: DEN.MOUTH[1] + 0.6, r: 2.2 },
        onDeliver(p) {
          api.task('rope'); api.servant(p, 4);
          if (api.taskDone('rope')) LEVEL._lift(api);
        } });
      it.blocked = () => (DEN.opened ? true : 'A rope. Not needed yet.');
      DEN.ropes.push(it);
    });

    // --- the den: a stone rim, the mouth sealed with a stone, lions lying inside ---
    const [cx, cz] = DEN.C;
    DEN.rim = [
      api.box({ x: cx, z: cz - 5.8, w: 12.2, d: 0.6, h: 1.2, color: stone }),
      api.box({ x: cx - 5.8, z: cz, w: 0.6, d: 12.2, h: 1.2, color: stone }),
      api.box({ x: cx + 5.8, z: cz, w: 0.6, d: 12.2, h: 1.2, color: stone }),
      api.box({ x: cx - 3.8, z: cz + 5.8, w: 4.6, d: 0.6, h: 1.2, color: stone }),
      api.box({ x: cx + 3.8, z: cz + 5.8, w: 4.6, d: 0.6, h: 1.2, color: stone })
    ];
    DEN.slab = api.box({ x: cx, z: cz + 5.8, w: 3.2, d: 1.0, h: 1.4, color: 0x6f6657 });   // the stone on the mouth of the den
    const seal = new T.Mesh(new T.CylinderGeometry(0.2, 0.2, 0.06, 12), new T.MeshLambertMaterial({ color: 0xb91c1c })); seal.rotation.x = Math.PI / 2; seal.position.set(cx, 1.0, cz + 6.34); api.add(seal); DEN.seal = seal;
    const lion = () => { const g = api.animalMesh('lion', { kneel: true }); g.scale.setScalar(1.35); return g; };   // resting: legs folded under
    [[-3, -2, 0.5], [2.5, -3, -2], [-2, 2.5, 2.4], [3, 1.5, -0.8], [0, -3.6, 1.6]].forEach(([dx, dz, r], i) => {
      const m = lion(); m.position.set(cx + dx, api.terrain(cx + dx, cz + dz), cz + dz); m.rotation.y = r; api.add(m); DEN.lions.push({ m, t: i, head: m.getObjectByName('head'), tail: m.getObjectByName('tail') });
    });
    // Daniel in the den (after the cards), with a soft light: God's angel kept him
    const inDen = api.storyPerson(0x1e3a8a, 0xfef3c7, 1, { beard: true, age: 'elder' }); inDen.position.set(cx, api.terrain(cx, cz), cz); inDen.visible = false; api.add(inDen); DEN.inDen = inDen;
    const angel = new T.PointLight(0xfff7d6, 0, 8, 2); angel.position.set(cx, api.terrain(cx, cz) + 3, cz); api.add(angel); DEN.angel = angel;

    // --- fragments ---
    // 1: the garden pool (the Fisherman nets it)
    api.hazard({ x: -15, z: 14, r: 2.6 }, { maxY: -0.6, except: (p) => p.role.id === 'fisherman', msg: 'Splash! The pool is deep (the Fisherman can wade).' });
    api.fragment({ x: -15, z: 14, y: 0.2, net: true });
    // 2: crumbling stones up onto the palace roof
    [[px + 5.8, pz - 4.6, 1.2], [px + 5.8, pz - 7, 2.4], [px + 3.4, pz - 4.6, 3.6]].forEach(([x, z, t]) => api.crumble({ x, z, top: api.terrain(x, z) + t }));
    api.fragment({ x: px + 2, z: pz - 1.5, y: 4.6 + 1.3 });
    // 3: down in the den, among the calm lions (only after the stone is moved)
    api.fragment({ x: cx + 2.4, z: cz - 1, y: api.terrain(cx + 2.4, cz - 1) + 1.3 });

    // --- Golden Scroll challenge course: east side ---
    const plan = [['block', 1.0], ['float', 1.0], ['crumble', 0.9], ['float', 0.8], ['spring', 0.2], ['float', 4.2], ['crumble', 0.6]];
    let ctop = 0;
    api.course(plan.map(([kind, rise], i) => {
      const z = 33 - i * 2.9, x = 19 + (i % 2 ? 0.3 : -0.3);
      ctop = i === 0 ? api.terrain(x, z) + 1.0 : ctop + rise;
      return { x, z, top: ctop, kind };
    }));

    api.leaves([[0, 25], [2, 19], [-5, 12], [-10, 4], [-4, -7], [3, -11], [-8, 20], [6, 12], [-16, 6], [12, -6], [-6, -16], [px + 5.8, pz - 7, 3.3]]);
    // (no challenge corner: the night at the den is the heart of the level)
    LEVEL._dress(api);
  },

  _arrested(api) {
    api.story([
      { art: '🙏', text: 'Now when Daniel knew that the writing was signed, he went into his house; and his windows being open in his chamber toward Jerusalem, he kneeled upon his knees three times a day, and prayed, and gave thanks before his God, as he did aforetime.', ref: 'Daniel 6:10' },
      { art: '🦁', text: 'Then the king commanded, and they brought Daniel, and cast him into the den of lions. Now the king spake and said unto Daniel, Thy God whom thou servest continually, he will deliver thee.', ref: 'Daniel 6:16' }
    ], () => { api.toast('🏮 A long, dark night. Light the lanterns on the way to the den, ready for the morning.', 4000); DEN.daniel.visible = false; DEN.inDen.visible = true; DEN.angel.intensity = 1.2; });
  },

  _dawn(api) {
    api.story([
      { art: '🌅', text: 'Then the king arose very early in the morning, and went in haste unto the den of lions.', ref: 'Daniel 6:19' }
    ], () => api.toast('👑 The king is at the palace door. Call him and lead him along the lanterns to the den!', 4000));
  },

  _opened(api) {
    DEN.slab.show(false); DEN.seal.visible = false; DEN.opened = true;
    api.sfx('door'); api.puff(DEN.C[0], 0.8, DEN.C[1] + 5.8, 0x9ca3af, 12);
    api.story([
      { art: '🦁', title: 'Daniel was safe!', text: 'My God hath sent his angel, and hath shut the lions’ mouths, that they have not hurt me: forasmuch as before him innocency was found in me; and also before thee, O king, have I done no hurt.', ref: 'Daniel 6:22' }
    ], () => api.toast('🪢 Bring ropes from the palace to lift Daniel out. (The lions are calm: you can walk past them.)', 4500));
  },

  _lift(api) {
    DEN.lifted = true; DEN.liftT = api.time;
    api.story([
      { art: '🎉', text: 'Then was the king exceeding glad for him, and commanded that they should take Daniel up out of the den. So Daniel was taken up out of the den, and no manner of hurt was found upon him, because he believed in his God.', ref: 'Daniel 6:23' }
    ]);
  },

  /* ---------- presentation only: nothing below is solid, and no rule changes ---------- */
  // Kneeling in prayer, hands lifted (Daniel 6:10).
  _kneel(g) {
    const a = g.userData.storyActor; if (!a) return;
    a.rig.position.y = -0.3; a.feet.forEach((f) => { f.visible = false; });
    a.head.rotation.x = 0.28;
    a.arms.forEach((arm, i) => { arm.rotation.x = -1.25; arm.rotation.z = (i ? 1 : -1) * -0.22; });
    a.praying = true;
  },

  // A simple gold crown for King Darius.
  _crowned(api, g) {
    const T = api.THREE, a = g.userData.storyActor, gold = api.texMat(0xe0a92e, 'gold');
    const band = new T.Mesh(new T.CylinderGeometry(0.31, 0.33, 0.16, 16, 1, true), gold); band.material = gold.clone(); band.material.side = T.DoubleSide; band.position.y = 0.6; a.head.add(band);
    for (let i = 0; i < 6; i++) { const t = new T.Mesh(new T.ConeGeometry(0.05, 0.14, 6), gold); const an = (i / 6) * Math.PI * 2; t.position.set(Math.sin(an) * 0.31, 0.74, Math.cos(an) * 0.31); a.head.add(t); }
    return g;
  },

  _dress(api) {
    const T = api.THREE, scenery = new T.Group();
    const M = (geo, mat, x, y, z, parent) => { const m = new T.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true; (parent || scenery).add(m); return m; };
    const B = (w, h, d, mat, x, y, z, parent) => M(new T.BoxGeometry(w, h, d), mat, x, y, z, parent);
    const clay = api.texMat(0xc4ad86, 'clay'), clayDark = api.texMat(0x9c845f, 'clay'), wood = api.texMat(0x5c3d22, 'wood');
    const blue = api.texMat(0x2456a6, 'brick'), gold = api.texMat(0xe2ad3e, 'gold'), stoneTex = api.texMat(0x857b6b, 'stone');
    const dark = new T.MeshLambertMaterial({ color: 0x1a120b });

    // --- Daniel's house: plastered walls, a door, and an upstairs window bay ---
    const [hx, hz] = DEN.HOUSE, front = hz - 2.5;
    DEN.house.mesh.material = clay;
    B(7.3, 0.2, 5.3, clayDark, hx, 4.08, hz);                                    // roof edge
    B(1.0, 1.95, 0.06, wood, hx - 2.3, 0.98, front - 0.03);                      // the door
    B(1.3, 0.16, 0.25, wood, hx - 2.3, 2.03, front - 0.1);
    B(2.6, 0.13, 0.75, wood, hx, 2.37, front - 0.33);                            // the window sill, with posts and a little roof
    [-1.22, 1.22].forEach((dx) => B(0.12, 1.45, 0.12, wood, hx + dx, 3.1, front - 0.66));
    B(2.8, 0.14, 0.9, clayDark, hx, 3.88, front - 0.4);
    const win = new T.Mesh(new T.PlaneGeometry(1.5, 1.1), new T.MeshLambertMaterial({ color: 0x24170e, emissive: 0x000000 }));
    win.position.set(hx, 3, front - 0.01); win.rotation.y = Math.PI; win.scale.x = -1; api.add(win);
    DEN.windowLit = () => { win.material.color.setHex(0x8a5a2b); win.material.emissive.setHex(0xc77a2e); };   // warm lamplight inside
    [[-3.0, 0.5], [-1.5, 0.45]].forEach(([dx, r]) => {                           // water jars by the door
      const pts = [[0, 0], [r * 0.7, 0.05], [r, 0.35], [r * 0.85, 0.7], [r * 0.45, 0.85], [r * 0.5, 0.95]].map(([a, b]) => new T.Vector2(a, b));
      M(new T.LatheGeometry(pts, 14), api.texMat(0xa8603a, 'clay'), hx + dx, api.terrain(hx + dx, front - 0.6), front - 0.6);
    });

    // --- the palace: blue glazed bricks with gold lions, a gold doorway, crenellations ---
    const [px, pz] = DEN.PALACE, pf = pz + 3;
    DEN.palace.mesh.material = api.texMat(0xc9b083, 'brick');
    B(8.06, 1.2, 6.06, blue, px, 3.2, pz);                                       // the glazed band, all the way round
    [2.55, 3.85].forEach((y) => B(8.12, 0.1, 6.12, gold, px, y, pz));
    B(8.3, 0.18, 6.3, clayDark, px, 4.49, pz);                                   // roof edge (its top stays just below the roof you can stand on)
    for (let x = px - 3.75; x <= px + 3.8; x += 1.05) B(0.5, 0.32, 0.4, clayDark, x, 4.75, pf - 0.12);   // crenellations: front edge
    for (let z = pz - 2.6; z <= pf - 0.6; z += 1.05) B(0.4, 0.32, 0.5, clayDark, px - 3.88, 4.75, z);   // and the west edge (the climb comes from the east)
    const lionShape = new T.Shape();
    [[-0.8, 0.62], [-0.72, 0.6], [-0.62, 0.48], [0.35, 0.5], [0.45, 0.64], [0.62, 0.68], [0.8, 0.55], [0.75, 0.44], [0.6, 0.41], [0.55, 0.3], [0.5, 0], [0.38, 0], [0.36, 0.22], [-0.34, 0.22], [-0.38, 0], [-0.52, 0], [-0.58, 0.36], [-0.68, 0.46], [-0.76, 0.56]]
      .forEach(([x, y], i) => (i ? lionShape.lineTo(x, y) : lionShape.moveTo(x, y)));
    const lionGeo = new T.ExtrudeGeometry(lionShape, { depth: 0.05, bevelEnabled: false }), lionGold = api.texMat(0xf2bd4c, 'gold');
    [[px - 2.4, 1], [px + 2.4, -1]].forEach(([x, dir]) => { const l = M(lionGeo, lionGold, x, 2.78, pf + 0.03); l.scale.set(dir * 1.05, 1.05, 1); });   // walking toward the door
    B(1.9, 2.7, 0.06, dark, px, 1.35, pf + 0.01);                                // the doorway
    [-1, 1].forEach((sd) => B(0.14, 2.8, 0.1, gold, px + sd * 1.0, 1.4, pf + 0.04));
    B(2.2, 0.16, 0.12, gold, px, 2.8, pf + 0.05);
    [-3, 3].forEach((dx) => { B(0.8, 0.22, 0.8, gold, px + dx, 4.0, pf + 0.4); B(0.8, 0.2, 0.8, stoneTex, px + dx, 0.1, pf + 0.4); });   // column tops and feet

    // --- the den: dressed stone, straw on the floor ---
    DEN.rim.concat([DEN.slab]).forEach((h) => { h.mesh.material = api.texMat(h === DEN.slab ? 0x6f6657 : 0x8a7f6a, 'stone'); });
    const [cx, cz] = DEN.C, fy = api.terrain(cx, cz);
    const straw = api.texMat(0xb89a54, 'weave');
    [[-2.6, -1.4, 1.2], [2.0, -3.4, 1.0], [-1.6, 3.0, 0.9], [3.2, 1.8, 1.1], [0.4, -0.2, 0.8]].forEach(([dx, dz, r]) => { const m = M(new T.CircleGeometry(r, 14), straw, cx + dx, fy + 0.03, cz + dz); m.rotation.x = -Math.PI / 2; m.scale.y = 0.7; });
    [[-4.6, -4.6], [4.6, -4.6], [-4.7, 3.4]].forEach(([dx, dz]) => { const r = api.model('Rock_Medium_2', 0.7); if (r) { r.position.set(cx + dx, fy, cz + dz); scenery.add(r); } });

    // --- lanterns: a stone foot and an iron cage round each lamp ---
    const iron = api.texMat(0x3a3530, 'bronze');
    DEN.lamps.forEach((L) => {
      const y0 = api.terrain(L.x, L.z), y = y0 + 2.3;
      M(new T.CylinderGeometry(0.22, 0.28, 0.3, 10), stoneTex, L.x, y0 + 0.15, L.z);
      for (let i = 0; i < 4; i++) { const an = i * Math.PI / 2 + Math.PI / 4; M(new T.CylinderGeometry(0.018, 0.018, 0.5, 4), iron, L.x + Math.sin(an) * 0.24, y, L.z + Math.cos(an) * 0.24); }
      M(new T.ConeGeometry(0.34, 0.24, 4), iron, L.x, y + 0.36, L.z).rotation.y = Math.PI / 4;
      M(new T.CylinderGeometry(0.3, 0.3, 0.04, 4), iron, L.x, y - 0.25, L.z).rotation.y = Math.PI / 4;
    });

    // --- far across the river: Babylon's walls and its great stepped tower, dark against the night ---
    const far = new T.MeshLambertMaterial({ color: 0x3b3a4a }), farLit = new T.MeshBasicMaterial({ color: 0xf2b45c });
    const wz = -50;
    B(84, 6, 3, far, 0, 3, wz);
    for (let x = -40; x <= 40; x += 8) { B(3, 9, 3.6, far, x, 4.5, wz + 0.2); B(0.5, 0.7, 0.05, farLit, x + 0.7, 5.5 + (x % 16 ? 1 : 0), wz + 2.05); }
    [[34, 6], [26, 5], [18, 4.5], [10, 4]].forEach(([w, h], i) => B(w, h, w * 0.8, far, -26, [0, 6, 11, 15.5][i] + h / 2, -76));   // the stepped tower
    [[-30, -40], [-12, -44], [9, -41], [27, -45]].forEach(([x, z]) => { B(6, 4 + (x & 3), 5, far, x, 2, z); B(0.5, 0.6, 0.05, farLit, x + 1, 2.6, z + 2.55); });

    api.scenery(scenery);

    // --- palms by the garden pool and the house (soft when they block the view) ---
    [['PalmTree_1', -20.4, 9.6, 7], ['PalmTree_3', -19.6, 18.6, 6], ['PalmTree_2', -10.6, 18.8, 6.5], ['PalmTree_4', 5.4, 29.6, 6], ['PalmTree_1', -5.6, 31.2, 7], ['PalmTree_3', -20.8, -11, 6.5], ['PalmTree_2', 13.5, 27, 6]]
      .forEach(([name, x, z, h]) => { const m = api.model(name, h); if (!m) return; const g = new T.Group(); g.position.set(x, api.terrain(x, z), z); g.rotation.y = x * 1.7; g.add(m); api.add(g); api.fadeScenery(g, 2.6); });

    // --- a palace servant who knows the way (optional; just for our game) ---
    const servant = api.storyPerson(0xc2a878, 0x7c5a3a, 1, { beard: true });
    servant.position.set(-3.6, api.terrain(-3.6, 1.8), 1.8); servant.rotation.y = -1.2; api.add(servant); DEN.servant = servant;
    DEN.servantTalk = api.conversation({
      person: servant, speaker: 'Palace servant', label: 'Talk with the servant',
      clue(api) {
        if (!api.taskDone('window')) return { text: 'Daniel prays at his upstairs window, three times a day. The new law will not stop him.', at: [DEN.HOUSE[0], 2, DEN.HOUSE[1] - 3.6] };
        if (!api.taskDone('lamps')) {
          const l = DEN.lamps.find((x) => !x.lit);
          return { text: 'The king cannot sleep. Light the lanterns along the street, ready for the morning.', at: l ? [l.x, 3, l.z] : undefined };
        }
        if (!api.taskDone('king')) return { text: 'Morning! The king is hurrying out. Walk with him to the den.', at: [DEN.king.pos.x, 2.5, DEN.king.pos.z] };
        if (!api.taskDone('rope')) { const r = DEN.ropes.find((it) => !it.delivered && !it.holder); return { text: 'The ropes are by the palace door. Carry them to the den.', at: r ? [r.x, r.y + 1, r.z] : undefined }; }
        return { text: 'Daniel is safe! His God kept him all night.' };
      }
    });
  },

  // Jointed people move gently; the king walks, worries through the night and rejoices in the morning.
  _poses(api, dt) {
    const k = DEN.king;
    if (k && k.mesh) api.posePerson(k.mesh, { dt, stride: k.walkAmt || 0, expression: DEN.lifted ? 'calm' : DEN.opened ? 'wonder' : 'worry', cheer: DEN.lifted && api.time - DEN.liftT < 6 });
    if (DEN.inDen && DEN.inDen.visible) api.posePerson(DEN.inDen, { dt, expression: DEN.opened ? 'calm' : 'listen', cheer: DEN.lifted && api.time - DEN.liftT > 3 && api.time - DEN.liftT < 8, headPitch: DEN.opened && !DEN.lifted ? -0.25 : 0 });
    if (DEN.servant) api.posePerson(DEN.servant, { dt, expression: 'calm' });
  },

  update(api, dt) {
    // the lions lie quietly, breathing; now and then one yawns (God has shut their mouths: no harm)
    DEN.lions.forEach((l) => {
      l.t += dt;
      l.m.scale.y = 1.35 * (1 + Math.sin(l.t * 1.6) * 0.025);          // slow breathing
      const near = api.near(l.m.position.x, l.m.position.z, 2.2).length > 0;
      if (l.head) l.head.rotation.x += ((near ? -0.3 : 0.12) - l.head.rotation.x) * Math.min(1, dt * 3);   // looks up lazily, then dozes
      if (l.tail) l.tail.rotation.z = Math.sin(l.t * 0.9) * 0.25;
    });
    LEVEL._poses(api, dt);
    if (DEN.angel.intensity > 0) DEN.angel.intensity = 1.1 + Math.sin(api.time * 2) * 0.2;
    // Daniel is lifted out
    if (DEN.liftT !== undefined) {
      const k = Math.min(1, (api.time - DEN.liftT) / 3);
      const [cx, cz] = DEN.C, my = DEN.MOUTH;
      DEN.inDen.position.set(cx, api.terrain(cx, cz) + (0 - api.terrain(cx, cz)) * k, cz + (my[1] + 1.2 - cz) * k);
    }
  },

  objective(api) {
    const ps = api.activePlayers();
    if (!ps.length) return null;
    const held = ps.map((p) => p.holding).find((h) => h && h.deliverTo);
    if (held) return [held.deliverTo.x, 2, held.deliverTo.z];
    if (!api.taskDone('window')) return [DEN.HOUSE[0], 2, DEN.HOUSE[1] - 3.6];
    const c = ps[0].pos;
    if (!api.taskDone('lamps')) {
      const l = DEN.lamps.filter((x) => !x.lit).sort((a, b) => Math.hypot(a.x - c.x, a.z - c.z) - Math.hypot(b.x - c.x, b.z - c.z))[0];
      return l ? [l.x, 3, l.z] : null;
    }
    const k = DEN.king;
    if (k.state === 'idle') return [k.pos.x, 2.5, k.pos.z];
    if (k.state === 'follow') return [DEN.MOUTH[0], 2, DEN.MOUTH[1] + 1.4];
    const r = DEN.ropes.find((it) => !it.delivered && !it.holder);
    return r ? [r.x, r.y + 1, r.z] : null;
  },

  finale: {
    message: '🦁 Everyone gather at the den: Daniel is safe!',
    beacon: [DEN.MOUTH[0], 3, DEN.MOUTH[1] + 2],
    inZone(p) { return Math.hypot(p.pos.x - DEN.MOUTH[0], p.pos.z - (DEN.MOUTH[1] + 2)) < 6; },
    onUpdate(api, t) {
      if (t > 0.5 && !DEN.done) {
        DEN.done = true;
        api.story([
          { art: '✨', text: 'He delivereth and rescueth, and he worketh signs and wonders in heaven and in earth, who hath delivered Daniel from the power of the lions.', ref: 'Daniel 6:27' },
          ...(api.shownRef('Psalm 56:3') ? [] : [{ art: '🙏', title: 'Keep praying', text: 'What time I am afraid, I will trust in thee.', ref: 'Psalm 56:3' }])
        ], () => { DEN.endT = api.time; });
      }
      return DEN.endT !== undefined && api.time - DEN.endT > 2;
    }
  }
};
