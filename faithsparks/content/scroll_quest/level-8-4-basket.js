/* =====================================================================
 * LEVEL 8-4: OVER THE WALL  (Acts 9:1-27)
 * ---------------------------------------------------------------------
 * Saul hated the followers of Jesus, until a light from heaven stopped him on the road. Jesus spoke
 * to him (only the light is shown). North to south:
 *   The Damascus road (z 34..12)  Saul is blind: lead him through the gate to the house on the
 *                                 street called Straight.
 *   Damascus (z 10..-32)          Saul now preaches Jesus. Some plot against him and watch the
 *                                 gates, so the disciples help him by night: bring a rope and a big
 *                                 basket up onto the wall, and lower him down together.
 * Only edit THIS file to change the level. See GEMINI.md and CAMPAIGN.md.
 * ===================================================================== */

const WALLBASKET = {
  STRAIGHT: [6, -10],          // Judas' house on the street called Straight
  WINDOW: [-14, -18],          // on the wall walk by the house: where the basket goes down
  OUT: [-18.5, -18],           // outside the wall, where Barnabas waits
  WALLX: -14,
  TOP: 4.6,
  items: [],
  lowered: false
};

const LEVEL = {
  id: '8-4',
  bibleConnection: {"passage": "Acts 9:1–25", "text": "The risen Jesus confronted Saul, who was led blind into Damascus. Later his friends lowered him in a basket to escape a murder plot. Our rope teamwork explores that escape; the basket puzzle did not convert him."},
  world: 'World 8-4',
  title: 'Over the Wall',
  town: true,                 // houses get doors, windows, awnings (engine house kit)
  time: 'sunset',
  leafIcon: '🧺',
  leafColor: 0xd6a35c,
  leafShape: 'round',
  spawn: [2, 31],
  bounds: { minX: -21, maxX: 21, minZ: -34, maxZ: 36 },
  approach: ['stones', 'log', 'crumbles'],   // the way in (engine): a stretch before the level's own start
  startMessage: 'Saul cannot see! Walk up to him and lead him into Damascus.',

  intro: [
    { text: 'Therefore if any man be in Christ, he is a new creature: old things are passed away; behold, all things are become new.', ref: '2 Corinthians 5:17' },
    { text: 'Then the disciples took him by night, and let him down by the wall in a basket.', ref: 'Acts 9:25' }
  ],

  introStory: [
    { art: '😠', title: 'Saul', text: 'Saul hated the followers of Jesus. He was on his way to Damascus to arrest them.' },
    { art: '🗣️', text: 'And he fell to the earth, and heard a voice saying unto him, Saul, Saul, why persecutest thou me?', ref: 'Acts 9:4' },
    { art: '✨', text: 'And he said, Who art thou, Lord? And the Lord said, I am Jesus whom thou persecutest: it is hard for thee to kick against the pricks.', ref: 'Acts 9:5' }
  ],

  tasks: [
    { id: 'lead', icon: '🤝', label: 'Lead blind Saul to the street called Straight', total: 1 },
    { id: 'basket', icon: '🧺', label: 'Bring a rope and a basket up onto the wall', total: 2, lockedUntil: 'lead' },
    { id: 'lower', icon: '🪢', label: 'Lower the basket together', total: 1, lockedUntil: 'basket' }
  ],

  memoryVerse: { text: 'Therefore if any man be in Christ, he is a new creature: old things are passed away; behold, all things are become new.', ref: '2 Corinthians 5:17' },

  ending: {
    verse: { text: 'This is a faithful saying, and worthy of all acceptation, that Christ Jesus came into the world to save sinners; of whom I am chief.', ref: '1 Timothy 1:15' },
    message: 'Jesus changed Saul\'s heart completely. Nobody is too far away for Jesus to save.'
  },

  quiz: [
    { q: 'What stopped Saul on the road to Damascus?', ref: 'Acts 9:3', options: ['A storm', 'A light from heaven', 'An army'], answer: 1 },
    { q: 'Who spoke to Saul?', ref: 'Acts 9:5', options: ['Jesus', 'A soldier', 'His father'], answer: 0 },
    { q: 'How did Saul get out of Damascus?', ref: 'Acts 9:25', options: ['On a camel through the gate', 'Down the wall in a basket', 'Through a tunnel'], answer: 1 }
  ],

  music: {
    bpm: 94,
    notes: [62, 0, 66, 69, 71, 0, 69, 66, 67, 0, 64, 0, 62, 0, 0, 0,
            66, 0, 69, 71, 74, 0, 71, 69, 67, 0, 66, 0, 64, 62, 0, 0],
    bass: [38, 38, 43, 43, 45, 45, 38, 38]
  },

  onCallText() {                                                 // said once; after that they just come
    if (WALLBASKET.saidCall) return '';
    WALLBASKET.saidCall = true;
    return 'Saul holds your arm. Lead him gently into the city.';
  },

  /* ---------- ground shape ---------- */
  terrain(x, z) {
    let h = Math.sin(x * 0.3) * Math.cos(z * 0.22) * 0.1 + Math.max(0, x - 18.5) * 1.2;
    const pd = Math.hypot(x - 12, z - 24);                              // a pool by the road
    if (pd < 2.6) h -= 1.8 * Math.min(1, (2.6 - pd) / 0.9);
    return h;
  },

  groundColor(x, z, h) {
    if (h < -0.8) return 0x3b82c4;
    if (z > 11) return (Math.floor(x / 3) + Math.floor(z / 3)) % 2 ? 0xc9b48a : 0xbfaa80;   // the road country
    if (x < WALLBASKET.WALLX) return 0xa89b78;
    if (Math.abs(z - WALLBASKET.STRAIGHT[1]) < 1.6) return 0xd8c9a2;                         // the street called Straight
    return (Math.floor(x / 2) + Math.floor(z / 2)) % 2 ? 0xc2b08c : 0xb8a682;
  },

  /* ---------- build ---------- */
  build(api) {
    const T = api.THREE;
    const person = (robe, scarf, s, o) => api.person(robe, scarf, s, o);   // friendly round townsfolk (engine)
    const W = WALLBASKET, TOP = W.TOP, wallC = 0xcbb38a;

    // --- the walls of Damascus: north wall with a gate, the west wall (a walkway on top) ---
    api.box({ x: -8, z: 10, w: 12, d: 1.4, h: TOP, color: wallC });
    api.box({ x: 11, z: 10, w: 18, d: 1.4, h: TOP, color: wallC });
    W.gate = api.box({ x: 0, z: 10, w: 4, d: 1.2, h: 3.4, color: 0x5c3d22, hidden: true });    // shut when the gates are watched
    api.box({ x: W.WALLX, z: -11, w: 1.6, d: 42, h: TOP, color: wallC });
    // stairs up to the wall walk (inside the city)
    for (let i = 0; i < 8; i++) api.box({ x: W.WALLX + 1.6, z: -4 - i * 1.0, w: 1.6, h: (i + 1) * TOP / 8, d: 1.0, color: 0xb59a6d });   // 0.58 per step: walkable
    // the house built on the wall, with a window over the outside
    api.box({ x: W.WALLX + 2.6, z: W.WINDOW[1] - 3, w: 3.6, d: 3, h: TOP + 2.4, color: 0xd6c09a });
    const win = new T.Mesh(new T.BoxGeometry(0.1, 0.9, 1.1), api.mat(0x3f2a16)); win.position.set(W.WALLX - 0.82, TOP + 1, W.WINDOW[1]); api.add(win);
    const spot = new T.Mesh(new T.RingGeometry(1.4, 1.7, 24), new T.MeshBasicMaterial({ color: 0xfacc15, transparent: true, opacity: 0.6, side: T.DoubleSide }));
    spot.rotation.x = -Math.PI / 2; spot.position.set(W.WINDOW[0], TOP + 0.06, W.WINDOW[1]); api.add(spot); W.spot = spot;

    // --- the city: houses, the street called Straight ---
    [[2, 2, 5], [12, 2, 5], [-6, -2, 4], [14, -18, 5], [4, -22, 5], [-6, -26, 4], [16, -4, 3]].forEach(([x, z, w]) => api.box({ x, z, w, d: w, h: 3.2, color: 0xd2bd92 }));
    const [sx, sz] = W.STRAIGHT;
    api.box({ x: sx + 4, z: sz - 3.2, w: 6, d: 3.6, h: 3.4, color: 0xd9c49a });           // Judas' house
    const ananias = person(0x1e3a8a, 0xf5f5f4, 1, { age: 'elder', beard: true }); ananias.position.set(sx + 1.5, 0, sz - 1); ananias.visible = false; api.add(ananias); W.ananias = ananias;

    // --- Saul (blind at first) ---
    const saul = person(0x7c2d12, 0xe7e5e4, 1, { beard: true });
    const band = new T.Mesh(new T.TorusGeometry(0.24, 0.05, 6, 16), api.mat(0x111827)); band.rotation.x = Math.PI / 2; band.position.set(0, 1.4, 0); saul.add(band); W.band = band;
    W.saul = api.follower({ x: 0, z: 27, kind: 'Saul', mesh: saul,
      deliverTo: { x: sx, z: sz, r: 2.4 },
      parkAt: [sx, 0, sz - 0.4],
      onDeliver(p) { api.task('lead'); api.servant(p, 6, 'for helping Saul!'); LEVEL._ananias(api); } });
    const light = new T.PointLight(0xfffbea, 2.5, 18, 2); light.position.set(0, 6, 27); api.add(light); W.light = light;
    const beam = new T.Mesh(new T.CylinderGeometry(1.2, 2.2, 12, 14, 1, true), new T.MeshBasicMaterial({ color: 0xfffbea, transparent: true, opacity: 0.25, side: T.DoubleSide, depthWrite: false }));
    beam.position.set(0, 6, 27); api.add(beam); W.beam = beam;

    // --- the rope and the big basket (in the disciples' house) ---
    [['rope', -4, -12], ['big basket', -2, -14]].forEach(([name, x, z]) => {
      const m = name === 'rope' ? new T.Mesh(new T.TorusGeometry(0.32, 0.1, 8, 16), api.mat(0xc8a46a)) : new T.Mesh(new T.CylinderGeometry(0.55, 0.42, 0.6, 14), api.mat(0xb7864a));
      if (name === 'rope') m.rotation.x = Math.PI / 2;
      const it = api.carryable({ x, z, mesh: m, name, to: 'the window on the wall',
        deliverTo: { x: W.WINDOW[0], z: W.WINDOW[1], r: 1.8, y: TOP },
        onDeliver(p) { api.task('basket'); api.servant(p, 4); if (api.taskDone('basket')) { W.lowerZone.show(true); api.toast('🪢 Everyone on the wall: hold the rope together!', 2600); } } });
      it.blocked = () => (api.taskDone('lead') ? true : 'Not needed yet.');
      W.items.push(it);
    });
    W.lowerZone = api.zone({ x: W.WINDOW[0], z: W.WINDOW[1] + 0.2, y: TOP, r: 2.2, time: 3, color: 0xfde68a, hidden: true,
      onDone(helpers) {
        api.task('lower'); helpers.forEach((p) => api.servant(p, 4, 'for lowering Saul safely!'));
        W.lowered = true; W.lowerT = api.time; W.saul.state = 'parked';
        W.basketMesh.visible = true;
      } });
    const bm = new T.Group();
    const bk = new T.Mesh(new T.CylinderGeometry(0.6, 0.45, 0.7, 14), api.mat(0xb7864a)); bm.add(bk);
    const rider = person(0x7c2d12, 0xe7e5e4, 0.8, { beard: true }); rider.position.y = -0.1; bm.add(rider);
    const rope = new T.Mesh(new T.CylinderGeometry(0.03, 0.03, 4, 5), api.mat(0xc8a46a)); rope.position.y = 2.3; bm.add(rope);
    bm.visible = false; api.add(bm); W.basketMesh = bm;
    const barnabas = person(0x15803d, 0xfde68a, 1, { beard: true }); barnabas.position.set(W.OUT[0] - 1, 0, W.OUT[1] + 1.4); api.add(barnabas);

    // --- fragments ---
    // 1: a pool by the road (the Fisherman nets it)
    api.hazard({ x: 12, z: 24, r: 2.3 }, { maxY: -0.6, except: (p) => p.role.id === 'fisherman', msg: 'Splash! The pool is deep (the Fisherman can wade).' });
    api.fragment({ x: 12, z: 24, y: 0.2, net: true });
    // 2: walk along the wall top to its far corner
    api.fragment({ x: W.WALLX, z: -30.6, y: TOP + 1.3 });
    // 3: a spring up onto Judas' roof
    api.spring({ x: sx + 4, z: sz - 0.4 });
    api.fragment({ x: sx + 4, z: sz - 3.2, y: 3.4 + 1.3 });

    // --- Golden Scroll challenge course: east of the road ---
    const plan = [['block', 1.0], ['float', 1.0], ['crumble', 0.9], ['float', 0.8], ['spring', 0.2], ['float', 4.2], ['crumble', 0.6]];
    let ctop = 0;
    api.course(plan.map(([kind, rise], i) => {
      const z = 33 - i * 2.9, x = 17.5 + (i % 2 ? 0.3 : -0.3);
      ctop = i === 0 ? api.terrain(x, z) + 1.0 : ctop + rise;
      return { x, z, top: ctop, kind };
    }));

    api.leaves([[0, 22], [-4, 16], [4, 14], [0, 6], [4, -4], [-2, -8], [10, -10], [W.WALLX, -8, TOP + 1], [W.WALLX, -24, TOP + 1], [-18, -10], [-18, -26], [8, 30]]);
    // (no challenge corner: the night escape is the level)
  },

  _ananias(api) {
    const W = WALLBASKET;
    W.ananias.visible = true;
    api.story([
      { art: '👁️', title: 'God sent Ananias, and Saul could see', text: 'And immediately there fell from his eyes as it had been scales: and he received sight forthwith, and arose, and was baptized.', ref: 'Acts 9:18' },
      { art: '🧺', title: 'A plot! Down the wall by night', text: 'Then the disciples took him by night, and let him down by the wall in a basket.', ref: 'Acts 9:25' }
    ], () => { api.toast('🪢 Bring a rope and a big basket up the stairs onto the wall, to the window.', 4500);
      W.band.visible = false;
      W.gate.show(true);
      W.saul.state = 'parked';
      W.saul.pos.set(W.WALLX, W.TOP, W.WINDOW[1] + 1.6); W.saul.mesh.position.copy(W.saul.pos);
    });
  },

  update(api, dt) {
    const W = WALLBASKET;
    if (W.beam.material.opacity > 0) {
      W.beam.material.opacity = Math.max(0, 0.25 - api.time * 0.01);
      W.light.intensity = Math.max(0, 2.5 - api.time * 0.1);
    }
    if (W.lowerT !== undefined) {
      const k = Math.min(1, (api.time - W.lowerT) / 4);
      W.basketMesh.position.set(W.WALLX - 1.4, W.TOP - 0.2 - k * (W.TOP - 0.5), W.WINDOW[1]);
      W.saul.mesh.visible = false;
      if (k >= 1 && !W.down) {
        W.down = true; W.basketMesh.visible = false;
        const s = W.saul; s.mesh.visible = true; s.pos.set(W.OUT[0], 0, W.OUT[1]); s.mesh.position.copy(s.pos);
        api.toast('🧺 Saul is safely down! Jump down off the wall to join him outside.', 3000);
      }
    }
  },

  objective(api) {
    const ps = api.activePlayers();
    if (!ps.length) return null;
    const W = WALLBASKET;
    const held = ps.map((p) => p.holding).find((h) => h && h.deliverTo);
    if (held) return [held.deliverTo.x, W.TOP + 1, held.deliverTo.z];
    if (!api.taskDone('lead')) return W.saul.state === 'follow' ? [W.STRAIGHT[0], 1.5, W.STRAIGHT[1]] : [W.saul.pos.x, 2, W.saul.pos.z];
    if (!api.taskDone('basket')) { const it = W.items.find((x) => !x.delivered && !x.holder); return it ? [it.x, it.y + 1, it.z] : null; }
    if (!api.taskDone('lower')) return [W.WINDOW[0], W.TOP + 1.5, W.WINDOW[1]];
    return null;
  },

  finale: {
    message: '🧺 Jump down outside the wall and gather with Saul and Barnabas!',
    beacon: [WALLBASKET.OUT[0], 3, WALLBASKET.OUT[1]],
    inZone(p) { return Math.hypot(p.pos.x - WALLBASKET.OUT[0], p.pos.z - WALLBASKET.OUT[1]) < 4.5 && p.pos.y < 2; },
    onUpdate(api, t) {
      if (t > 0.5 && !WALLBASKET.done) {
        WALLBASKET.done = true;
        api.story([
          ...(api.shownRef('2 Corinthians 5:17') ? [] : [{ art: '🌱', text: 'Therefore if any man be in Christ, he is a new creature: old things are passed away; behold, all things are become new.', ref: '2 Corinthians 5:17' }]),
          { art: '✝️', title: 'Paul', text: 'Saul became known as Paul. He told people about Jesus all over the world and wrote many books of the New Testament.' },
          { art: '💛', text: 'This is a faithful saying, and worthy of all acceptation, that Christ Jesus came into the world to save sinners; of whom I am chief.', ref: '1 Timothy 1:15' }
        ], () => { WALLBASKET.endT = api.time; });
      }
      return WALLBASKET.endT !== undefined && api.time - WALLBASKET.endT > 2;
    }
  }
};
