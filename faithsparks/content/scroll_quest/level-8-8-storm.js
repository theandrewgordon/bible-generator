/* =====================================================================
 * LEVEL 8-8: THROUGH THE STORM  (Acts 27-28)
 * ---------------------------------------------------------------------
 * THIS IS THE LEVEL WHERE WE KEEP EVERYONE TOGETHER THROUGH THE STORM UNTIL ALL ARE SAFE ON LAND.
 * North (z 44) to south (z -44):
 *   The ship   (deck z 42..14, height 3)  wind gusts (Breastplate), a slippery deck (Sandals),
 *              falling rigging (Shield); lighten the ship; gather everyone to Paul for bread
 *   The wreck  the ship runs aground; floating boards lead to the beach (z 4..-4)
 *   Malta      (z -6..-44) rain and cold; gather sticks for the fire; the viper (Paul is unharmed)
 * God keeps His promise: not one person is lost (Acts 27:22, 27:44).
 * Only edit THIS file to change the level. See GEMINI.md and CAMPAIGN.md.
 * ===================================================================== */

const STORM = {
  crates: [],
  passengers: [],
  sticks: [],
  rigging: [],
  boards: [],
  DECK: 3,
  MAST: [0, 28],
  FIRE: [0, -24],
  BEACH: [0, -2],
  aground: false,
  fed: false,
  gustT: 0,
  gusting: false,
  fireDone: false
};

const LEVEL = {
  id: '8-8',
  bibleConnection: {"passage": "Acts 27–28:10", "text": "God promised Paul that everyone aboard would survive, though the ship would be wrecked. They reached Malta, where God continued His work through Paul. Our cargo, shore and fire tasks explore their ordeal; teamwork does not create God’s promise."},
  world: 'World 8-8',
  title: 'Through the Storm',
  time: 'storm',
  seaHorizon: { side: 1 },
  leafIcon: '🐚',
  leafColor: 0x93c5fd,
  leafShape: 'round',
  spawn: [0, 38],
  bounds: { minX: -18, maxX: 18, minZ: -44, maxZ: 44 },
  startMessage: 'A great storm! Put on the armour of God, lighten the ship, and gather everyone to Paul.',

  intro: [
    { text: 'And now I exhort you to be of good cheer: for there shall be no loss of any man\'s life among you, but of the ship.', ref: 'Acts 27:22' },
    { text: 'When thou passest through the waters, I will be with thee; and through the rivers, they shall not overflow thee: when thou walkest through the fire, thou shalt not be burned; neither shall the flame kindle upon thee.', ref: 'Isaiah 43:2' }
  ],

  introStory: [
    { art: '🌧️', title: 'Paul, a prisoner, sailing to Rome', text: 'And when neither sun nor stars in many days appeared, and no small tempest lay on us, all hope that we should be saved was then taken away.', ref: 'Acts 27:20' }
  ],

  tasks: [
    { id: 'lighten', icon: '📦', label: 'Lighten the ship', total: 4 },
    { id: 'gather', icon: '👥', label: 'Gather everyone to Paul', total: 6 },
    { id: 'shore', icon: '🏝️', label: 'Get safely to shore', total: 1, lockedUntil: 'gather' },
    { id: 'sticks', icon: '🔥', label: 'Gather sticks for the fire', total: 5, lockedUntil: 'shore' }
  ],

  memoryVerse: { text: 'When thou passest through the waters, I will be with thee; and through the rivers, they shall not overflow thee: when thou walkest through the fire, thou shalt not be burned; neither shall the flame kindle upon thee.', ref: 'Isaiah 43:2' },

  ending: {
    verse: { text: 'Preaching the kingdom of God, and teaching those things which concern the Lord Jesus Christ, with all confidence, no man forbidding him.', ref: 'Acts 28:31' },
    message: 'God kept His promise: everyone was safe. Nothing could stop the good news!'
  },

  quiz: [
    { q: 'What did Paul promise everyone on the ship?', ref: 'Acts 27:22', options: ['No one would lose their life', 'The ship would be fine', 'The storm would stop at once'], answer: 0 },
    { q: 'How did everyone get to land?', ref: 'Acts 27:44', options: ['In a big boat', 'Some on boards and broken pieces of the ship', 'They flew'], answer: 1 },
    { q: 'What happened when the viper bit Paul\'s hand?', ref: 'Acts 28:5', options: ['He got very sick', 'He ran away', 'He shook it off and felt no harm'], answer: 2 }
  ],

  music: {
    bpm: 100,
    notes: [57, 0, 60, 62, 64, 0, 62, 60, 57, 0, 55, 0, 57, 0, 0, 0,
            60, 0, 64, 65, 67, 0, 65, 64, 62, 0, 60, 0, 57, 0, 0, 0],
    bass: [33, 33, 36, 36, 38, 38, 33, 33]
  },

  onCallText(kind, n) {                                                 // said once; after that they just come
    if (STORM.saidCall) return '';
    STORM.saidCall = true;
    return n > 1 ? n + ' people follow you to Paul.' : 'Someone follows you to Paul.';
  },

  /* ---------- ground shape ---------- */
  terrain(x, z) {
    if (z > 4) return -2.2;                                            // the sea floor
    if (z > -4) return -2.2 + (2.7 * (4 - z) / 8);                     // the beach
    return 0.5 + Math.sin(x * 0.35) * Math.cos(z * 0.3) * 0.25 + Math.max(0, Math.abs(x) - 15.5) * 1.3;   // Malta
  },

  groundColor(x, z, h) {
    if (z > 4) return 0x1e3a5f;
    if (z > -6) return 0xcdb98c;
    return (Math.floor(x / 3) + Math.floor(z / 3)) % 2 ? 0x5c7a3c : 0x557336;
  },

  /* ---------- build ---------- */
  build(api) {
    const T = api.THREE, D = STORM.DECK;
    const person = (robe, scarf, s, o) => api.person(robe, scarf, s, o);   // friendly round townsfolk (engine)
    api.rain(true);

    // --- the sea ---
    const sea = new T.Mesh(new T.PlaneGeometry(60, 50, 30, 25), new T.MeshLambertMaterial({ color: 0x1e40af, emissive: 0x0b1f4a, transparent: true, opacity: 0.85 }));
    sea.rotation.x = -Math.PI / 2; sea.position.set(0, -0.5, 25); api.add(sea); STORM.sea = sea;
    api.hazard({ x: 0, z: 25, w: 60, d: 42 }, { maxY: -0.6, except: (p) => p.role.id === 'fisherman', msg: 'Splash! Into the waves (the Fisherman can swim). A friend can pop your bubble.' });

    // --- the ship: deck, rails, mast, sails ---
    api.box({ x: 0, z: 28, w: 10, d: 28, h: D + 2.2, y: -2.2, color: 0x6b4423 });
    const rail = (x, z, w, d) => api.box({ x, z, w, d, h: 1.2, y: D, color: 0x8b5a2b });
    rail(-5.2, 28, 0.4, 28); rail(5.2, 28, 0.4, 28); rail(0, 42.2, 10.8, 0.4);
    STORM.bow = rail(0, 13.8, 10.8, 0.4);                               // the bow rail (breaks when the ship runs aground)
    api.box({ x: STORM.MAST[0], z: STORM.MAST[1], w: 0.6, d: 0.6, h: 9, y: D, color: 0x5c3d22 });   // the mast
    const sail = new T.Mesh(new T.PlaneGeometry(7, 5), new T.MeshLambertMaterial({ color: 0xe7e0cc, side: T.DoubleSide })); sail.position.set(0, D + 6, 28.4); api.add(sail); api.fadeScenery(sail,3.5); STORM.sail = sail;
    const hull = new T.Mesh(new T.BoxGeometry(10.6, 1.4, 29), api.mat(0x4a2f17)); hull.position.set(0, -1.0, 28); api.add(hull);
    STORM.hull = hull;
    // a slippery, wet deck (the Sandals of Peace stride through)
    api.mud({ x: -2, z: 33, w: 5, d: 3 }); api.mud({ x: 2, z: 22, w: 5, d: 3 }); api.mud({ x: -2, z: 18, w: 5, d: 2.5 });
    // the armour of God on the deck
    api.armor('breastplate', 1, 40); api.armor('shield', 3.4, 40); api.armor('sandals', 1, 36.5); api.armor('helmet', 3.4, 36.5);
    // Paul by the mast
    const paul = person(0x7c2d12, 0xe7e5e4, 1, { beard: true }); paul.position.set(STORM.MAST[0] + 1.2, D, STORM.MAST[1]); api.add(paul); STORM.paul = paul;

    // --- cargo to throw overboard (Acts 27:18-19) ---
    [[-3, 31], [3, 26], [-3, 20], [2.5, 17]].forEach(([x, z]) => {
      const g = new T.Group();
      const c = new T.Mesh(new T.BoxGeometry(0.9, 0.7, 0.9), api.mat(0x8b5a2b)); g.add(c);
      const band = new T.Mesh(new T.BoxGeometry(0.95, 0.12, 0.95), api.mat(0x3f2a14)); g.add(band);
      STORM.crates.push(api.carryable({ x, z, mesh: g, name: 'cargo', to: 'the side of the ship',
        deliverTo: { x: 4.2, z: 24, r: 1.6, y: D },
        onDeliver(p, it) {
          api.task('lighten'); api.servant(p, 4, 'for helping save the ship!'); api.sfx('drop');
          api.puff(5.8, 0, 24, 0xbfdbfe, 10);
          // (the task board counts it: no pop-up)
        } }));
    });
    const chute = new T.Mesh(new T.RingGeometry(1.2, 1.5, 24), new T.MeshBasicMaterial({ color: 0xfacc15, transparent: true, opacity: 0.6, side: T.DoubleSide }));
    chute.rotation.x = -Math.PI / 2; chute.position.set(4.2, D + 0.06, 24); api.add(chute);

    // --- the people on board ---
    [[-1, 31], [2.5, 33], [-3.5, 25], [3, 20], [-2, 15.5], [-0.5, 38]].forEach(([x, z], i) => {
      STORM.passengers.push(api.follower({
        x, z, kind: 'passenger', mesh: person([0x57534e, 0x9a3412, 0x1e3a8a, 0x4d7c0f, 0x7c3aed, 0x0e7490][i], 0xd6d3d1),
        deliverTo: { x: STORM.MAST[0], z: STORM.MAST[1], r: 3 },
        parkAt: (f) => { const k = STORM.passengers.indexOf(f), a = k / 6 * Math.PI * 2; return [STORM.MAST[0] + Math.cos(a) * 2, D, STORM.MAST[1] + Math.sin(a) * 2]; },
        onDeliver(p) {
          api.task('gather'); api.servant(p, 4, 'for keeping everyone together!');
          // (the task board counts it: no pop-up)
        }
      }));
    });

    // --- falling rigging (during gusts; the Shield of Faith blocks it) ---
    for (let i = 0; i < 3; i++) {
      const r = new T.Mesh(new T.BoxGeometry(0.2, 1.2, 0.2), api.mat(0x8b5a2b));
      const warn = new T.Mesh(new T.RingGeometry(0.4, 0.7, 16), new T.MeshBasicMaterial({ color: 0xef4444, transparent: true, opacity: 0.6, side: T.DoubleSide }));
      warn.rotation.x = -Math.PI / 2; r.visible = warn.visible = false; api.add(r); api.add(warn);
      STORM.rigging.push({ r, warn, x: 0, z: 0, y: -1 });
    }

    // --- floating boards to the beach (appear when the ship runs aground) ---
    [[0.5, 11.2, 2.3], [-1, 8.6, 1.7], [0.8, 6.0, 1.2], [-0.5, 3.6, 0.7]].forEach(([x, z, top], i) => {
      const b = api.mover({ w: 2.2, h: 0.3, d: 1.8, color: 0xa0703c, path: (t) => [x + Math.sin(t * 0.8 + i) * 0.25, top - 0.3 + Math.sin(t * 1.6 + i) * 0.12, z], speed: 1 });
      b.mesh.visible = false; b.platform.on = false;
      STORM.boards.push(b);
    });
    STORM.shoreZone = api.zone({ x: STORM.BEACH[0], z: STORM.BEACH[1], r: 3, time: 1.5, color: 0xfde68a, hidden: true,
      onDone() { api.task('shore'); LEVEL._ashore(api); } });

    // --- Malta: the islanders' fire and sticks to gather ---
    const [fx, fz] = STORM.FIRE;
    const pit = new T.Mesh(new T.CylinderGeometry(1.2, 1.3, 0.3, 14), api.mat(0x57534e)); pit.position.set(fx, api.terrain(fx, fz) + 0.15, fz); api.add(pit);
    const flames = new T.Group();
    for (let i = 0; i < 5; i++) { const f = new T.Mesh(new T.ConeGeometry(0.3, 1, 8), new T.MeshBasicMaterial({ color: i % 2 ? 0xf97316 : 0xfacc15, transparent: true, opacity: 0.85 })); f.position.set(Math.cos(i * 1.3) * 0.4, 0.6, Math.sin(i * 1.3) * 0.4); flames.add(f); }
    flames.position.set(fx, api.terrain(fx, fz) + 0.2, fz); flames.scale.setScalar(0.4); api.add(flames); STORM.flames = flames;
    const fireLight = new T.PointLight(0xff9a3c, 0.6, 14, 2); fireLight.position.set(fx, 2, fz); api.add(fireLight); STORM.fireLight = fireLight;
    [[-3, -21], [3, -21.5], [-2.5, -27], [2.6, -26.8]].forEach(([dx, dz], i) => { const m = api.crowdPerson(i + 3, [0x7c2d12, 0x166534, 0xa16207, 0x6b21a8][i], 0xe7e5e4); m.position.set(dx, api.terrain(dx, dz), dz); m.rotation.y = Math.atan2(fx - dx, fz - dz); api.add(m); });
    [[-10, -10], [11, -14], [-12, -30], [10, -36], [0, -40]].forEach(([x, z]) => {
      const g = new T.Group();
      for (let k = 0; k < 4; k++) { const st = new T.Mesh(new T.CylinderGeometry(0.06, 0.07, 1.1, 6), api.mat(0x6b4f2a)); st.rotation.z = Math.PI / 2; st.position.set(0, k * 0.08, (k - 1.5) * 0.12); g.add(st); }
      // a bundle of sticks (Acts 28:3): picked up on a loop round the beach, laid on the fire when you get there
      const it = api.gatherable({ x, z, mesh: g, task: 'sticks', onGet(p) { api.servant(p, 4, 'for helping make a fire!'); } });
      it.hidden = true; g.visible = false;                              // on the island, after the shore
      STORM.sticks.push(it);
    });
    const viper = new T.Group();
    for (let k = 0; k < 6; k++) { const seg = new T.Mesh(new T.SphereGeometry(0.12 - k * 0.012, 8, 6), api.mat(k ? 0x3f6212 : 0x365314)); seg.position.set(k * 0.16, 0, Math.sin(k) * 0.08); viper.add(seg); }
    viper.visible = false; api.add(viper); STORM.viper = viper;
    [[-10, -42], [15, -20], [-16, -38], [15, -42]].forEach(([x, z]) => api.tree(x, z, 1.1, 0x3f6212));

    // --- fragments ---
    // 1: up the rigging in the stern corner to a lookout (kept out of the walkways)
    [[-4, 40.6, D + 1.1], [-3.8, 38.2, D + 2.2], [-4, 35.8, D + 3.3]].forEach(([x, z, top]) => api.box({ x, z, w: 1.4, d: 1.4, h: 0.3, y: top - 0.3, color: 0x8b5a2b }));
    api.box({ x: -3.8, z: 33.4, w: 2, d: 2, h: 0.3, y: D + 4.1, color: 0x8b5a2b });
    api.fragment({ x: -3.8, z: 33.4, y: D + 4.4 + 1.2 });
    // 2: in the waves beside the ship (the Fisherman nets it from the deck)
    api.fragment({ x: -8, z: 30, y: -1.0, net: true });
    // 3: crumbling rocks up a cliff on Malta
    [[12, -26, 1.0], [13.8, -28.4, 1.8], [12, -30.8, 2.6]].forEach(([x, z, r]) => api.crumble({ x, z, top: api.terrain(x, z) + r }));
    const ct = api.terrain(13.6, -33.2) + 3.4;
    api.box({ x: 13.6, z: -33.2, w: 2, d: 2, h: ct - api.terrain(13.6, -33.2), color: 0x78716c });
    api.fragment({ x: 13.6, z: -33.2, y: ct + 1.3 });

    // --- Golden Scroll challenge course: on Malta ---
    const plan = [['block', 1.0], ['float', 1.0], ['crumble', 0.9], ['float', 0.8], ['spring', 0.2], ['float', 4.2], ['crumble', 0.6]];
    let ctop = 0;
    api.course(plan.map(([kind, rise], i) => {
      const z = -10 - i * 2.9, x = -14 + (i % 2 ? 0.3 : -0.3);
      ctop = i === 0 ? api.terrain(x, z) + 1.0 : ctop + rise;
      return { x, z, top: ctop, kind };
    }));

    api.leaves([[0, 40, D + 1], [0, 34, D + 1], [-3, 28, D + 1], [3, 30, D + 1], [0, 22, D + 1], [0, 16, D + 1], [-1, 8.6, 2.6], [0, -8], [-5, -14], [5, -18], [0, -32], [-6, -36], [6, -40],
      [-3.8, 38.2, D + 3.1]]);
    // (no challenge corner: the storm and the shipwreck are the level)
  },

  // the ship runs aground; boards appear; God keeps everyone safe
  _aground(api) {
    STORM.aground = true;
    STORM.bow.show(false);
    STORM.boards.forEach((b) => { b.mesh.visible = true; b.platform.on = true; });
    STORM.shoreZone.show(true);
    STORM.sail.rotation.z = 0.5;
    api.sfx('door');
    api.story([
      { art: '💥', text: 'And falling into a place where two seas met, they ran the ship aground; and the forepart stuck fast, and remained unmoveable, but the hinder part was broken with the violence of the waves.', ref: 'Acts 27:41' }
    ], () => { api.toast('🪵 Cross the floating boards to the beach. God promised that everyone will be safe!', 4000);
      // an urgent moment (never a fail): reach the beach before the stern breaks apart, for a bonus
      STORM.cd = api.countdown({ seconds: 45, label: '⛵ The stern is breaking up!', onEnd: () => api.toast('The stern broke apart, but God kept His promise: nobody was lost.', 3000) });
    });
    // everyone else floats to shore on boards and broken pieces (God keeps His promise)
    STORM.passengers.forEach((f, k) => { f.toShore = { t: -k * 0.5, from: f.pos.clone(), to: new api.THREE.Vector3(-5 + k * 2, api.terrain(-5 + k * 2, -5), -5) }; });
  },

  _ashore(api) {
    if (STORM.cd && !STORM.cd.over) { STORM.cd.stop(); api.activePlayers().forEach((p) => api.servant(p, 3, 'for reaching the beach in time!')); }
    api.story([
      { art: '🏝️', text: 'And the rest, some on boards, and some on broken pieces of the ship. And so it came to pass, that they escaped all safe to land.', ref: 'Acts 27:44' }
    ], () => api.toast('🔥 The islanders showed great kindness and kindled a fire (Acts 28:2). Gather sticks for it!', 4000));
  },

  update(api, dt) {
    const D = STORM.DECK;
    // the ship bobs and the sea heaves (just to look at; the deck stays steady to stand on)
    STORM.hull.position.y = -1.0 + Math.sin(api.time * 1.2) * 0.12;
    STORM.sail.position.x = Math.sin(api.time * 0.9) * 0.3;
    STORM.sea.position.y = -0.5 + Math.sin(api.time * 0.8) * 0.08;
    // wind gusts across the deck: 4 s calm, 2.5 s gust (rails keep you on board; the Breastplate stands firm)
    if (!STORM.aground) {
      STORM.gustT += dt;
      const was = STORM.gusting;
      STORM.gusting = STORM.gustT % 6.5 > 4;
      if (STORM.gusting && !was) api.sfx('hit');
      api.activePlayers().forEach((p) => {
        if (!STORM.gusting || p.pos.z < 14 || p.pos.y < D - 0.5) return;
        api.push(p, 5, 0, dt);
        if (!STORM.toldGust) { STORM.toldGust = true; api.toast('🌬️ A gust of wind! Hold on: the Breastplate helps you stand firm.', 3800); }
      });
      // nobody goes overboard while the ship is afloat: a gust plus a knock from the rigging could
      // otherwise toss someone over the rail
      api.activePlayers().forEach((p) => {
        if (p.pos.z < 14 || p.pos.z > 42 || p.pos.y < D - 0.6 || Math.abs(p.pos.x) <= 4.85) return;
        p.pos.x = Math.sign(p.pos.x) * 4.85; p.vel.x = 0;
      });
      // falling rigging during gusts
      STORM.rigging.forEach((rg, i) => {
        if (!STORM.gusting && rg.y < 0) { rg.r.visible = rg.warn.visible = false; return; }
        if (rg.y < 0) {
          const ps = api.activePlayers().filter((p) => p.pos.z > 14); if (!ps.length) return;
          const p = ps[(i + Math.floor(api.time)) % ps.length];
          rg.x = Math.max(-4.5, Math.min(4.5, p.pos.x + (Math.random() - 0.5) * 5)); rg.z = p.pos.z + (Math.random() - 0.5) * 5; rg.y = D + 9;
        }
        rg.y -= 9 * dt;
        rg.r.visible = rg.warn.visible = true;
        rg.r.position.set(rg.x, rg.y, rg.z); rg.r.rotation.z += dt * 5;
        rg.warn.position.set(rg.x, api.groundAt(rg.x, rg.z) + 0.06, rg.z);
        if (rg.y <= api.groundAt(rg.x, rg.z) + 0.4) {
          api.near(rg.x, rg.z, 1.2).forEach((p) => api.hit(p, rg.x, rg.z, 'falling', 'Bonk! Falling rigging. The Shield of Faith 🛡️ blocks it.'));
          api.puff(rg.x, api.groundAt(rg.x, rg.z), rg.z, 0x8b5a2b, 4);
          rg.y = -1;
        }
      });
    }
    // everyone gathered with Paul and the ship lightened: bread, then the ship runs aground
    if (!STORM.fed && api.taskDone('gather') && api.taskDone('lighten')) {
      STORM.fed = true;
      api.story([
        { art: '😊', title: 'Be of good cheer', text: 'Wherefore, sirs, be of good cheer: for I believe God, that it shall be even as it was told me.', ref: 'Acts 27:25' }
      ], () => LEVEL._aground(api));
    }
    // people following you on deck stay inside the rails (they never walk off into the sea)
    if (!STORM.aground) STORM.passengers.forEach((f) => {
      if (f.state !== 'follow' && f.state !== 'idle') return;
      f.pos.x = Math.max(-4.4, Math.min(4.4, f.pos.x)); f.pos.z = Math.max(14.6, Math.min(41.6, f.pos.z)); f.pos.y = D;
      f.home.x = Math.max(-4, Math.min(4, f.home.x)); f.home.y = D;
      f.mesh.position.copy(f.pos);
    });
    // the others float to shore on boards
    STORM.passengers.forEach((f) => {
      if (!f.toShore) return;
      const s = f.toShore; s.t += dt;
      const k = Math.max(0, Math.min(1, s.t / 5));
      f.state = 'parked';
      f.pos.lerpVectors(s.from, s.to, k); f.pos.y = Math.max(s.to.y, (1 - k) * s.from.y + k * s.to.y + Math.sin(k * Math.PI) * 0.6 - (k > 0.15 && k < 0.85 ? 1.4 : 0));
      f.mesh.position.copy(f.pos);
      if (k >= 1) f.toShore = null;
    });
    // the fire is ready: the viper (Paul is unharmed)
    if (api.taskDone('shore') && STORM.sticks[0].hidden) STORM.sticks.forEach((it) => { it.hidden = false; it.mesh.visible = true; });
    if (!STORM.fireDone && api.taskDone('sticks') && api.near(STORM.FIRE[0], STORM.FIRE[1], 4).length) {
      STORM.flames.scale.setScalar(1.4); STORM.fireLight.intensity = 2.1; api.sfx('build');
      STORM.fireDone = true;
      STORM.paul.position.set(STORM.FIRE[0] + 1.6, api.terrain(STORM.FIRE[0] + 1.6, STORM.FIRE[1] + 1), STORM.FIRE[1] + 1);
      STORM.viper.visible = true; STORM.viper.position.set(STORM.FIRE[0] + 1.9, 1.2, STORM.FIRE[1] + 1.1);
      api.story([
        { art: '🙌', title: 'A viper bit Paul\'s hand!', text: 'And he shook off the beast into the fire, and felt no harm.', ref: 'Acts 28:5' }
      ], () => { STORM.viper.visible = false; api.puff(STORM.FIRE[0], 1, STORM.FIRE[1], 0xf97316, 12); });
    }
  },

  objective(api) {
    const ps = api.activePlayers();
    if (!ps.length) return null;
    const cx = ps.reduce((s, p) => s + p.pos.x, 0) / ps.length, cz = ps.reduce((s, p) => s + p.pos.z, 0) / ps.length;
    const near = (list) => list.sort((a, b) => Math.hypot(a[0] - cx, a[2] - cz) - Math.hypot(b[0] - cx, b[2] - cz))[0];
    const held = ps.map((p) => p.holding).find((h) => h && h.deliverTo);
    if (held) return [held.deliverTo.x, (held.deliverTo.y || 0) + 1.5, held.deliverTo.z];
    if (!STORM.aground) {
      if (STORM.passengers.some((f) => f.state === 'follow')) return [STORM.MAST[0], STORM.DECK + 2, STORM.MAST[1]];
      const list = STORM.passengers.filter((f) => f.state === 'idle').map((f) => [f.pos.x, f.pos.y + 2, f.pos.z])
        .concat(STORM.crates.filter((c) => !c.delivered && !c.holder).map((c) => [c.x, c.y + 1, c.z]));
      return list.length ? near(list) : [STORM.MAST[0], STORM.DECK + 2, STORM.MAST[1]];
    }
    if (!api.taskDone('shore')) return [STORM.BEACH[0], 1.5, STORM.BEACH[1]];
    const st = STORM.sticks.filter((s) => !s.got).map((s) => [s.x, s.y + 1, s.z]);
    return st.length ? near(st) : [STORM.FIRE[0], 2, STORM.FIRE[1]];
  },

  finale: {
    message: '🔥 Everyone gather around the fire!',
    beacon: [0, 3, -24],
    inZone(p) { return Math.hypot(p.pos.x - STORM.FIRE[0], p.pos.z - STORM.FIRE[1]) < 6; },
    onUpdate(api, t) {
      if (t > 0.5 && !STORM.told) {
        STORM.told = true;
        api.rain(false);
        api.story([
          { art: '🙏', title: 'Not one was lost', text: 'God promised that everyone on the ship would live, and He kept His promise. Every single person reached land.' },
          { art: '📣', title: 'Nothing can stop the good news', text: 'Preaching the kingdom of God, and teaching those things which concern the Lord Jesus Christ, with all confidence, no man forbidding him.', ref: 'Acts 28:31' }
        ], () => { STORM.endT = api.time; });
      }
      return STORM.endT !== undefined && api.time - STORM.endT > 2;
    }
  }
};
