/* =====================================================================
 * LEVEL 8-6: SONGS AT MIDNIGHT  (Acts 16:22-34)
 * ---------------------------------------------------------------------
 * THIS IS THE LEVEL WHERE WE STAND FIRM THROUGH AN EARTHQUAKE, AND NOBODY RUNS AWAY.
 * Night in Philippi, north (z 42) to south (z -42):
 *   The street     (z 40..14)  the whole armour of God laid out (Ephesians 6, written by Paul in prison)
 *   The prison     (z 12..-22) a courtyard, six cells, Paul and Silas in the stocks by the inner prison
 *   The jailer's house (z -26..-40)
 * Story: Paul and Silas pray and sing at midnight; God sends an earthquake; the doors open, but
 * everyone stays ("we are all here", Acts 16:28). The jailer asks how to be saved.
 * Armour matters here: the Shield of Faith blocks falling stones, the Breastplate stands firm when
 * the ground shoves you, the Helmet takes one knock. Shelters (stone arches) keep everyone safe too.
 * Tasks: listen at midnight; gather the 6 prisoners to Paul; bring 3 lamps to the jailer; care for
 * Paul and Silas at the jailer's house (water and food).
 * Only edit THIS file to change the level. See GEMINI.md and CAMPAIGN.md.
 * ===================================================================== */

const NIGHT = {
  doors: [],
  prisoners: [],
  lamps: [],
  care: [],
  stones: [],
  shelters: [[-5, 2], [5, -6], [0, 8]],
  CELLS: [[-12, 6], [-12, -2], [-12, -10], [12, 6], [12, -2], [12, -10]],
  GATHER: [0, -5],
  HOUSE: [0, -31],
  quake: false,
  quakeT: 0,
  shaking: false,
  calmed: false
};

function nightUnderShelter(x, z) { return NIGHT.shelters.some(([sx, sz]) => Math.abs(x - sx) < 1.9 && Math.abs(z - sz) < 1.6); }

const LEVEL = {
  id: '8-6',
  bibleConnection: {"passage": "Acts 16:16–34", "text": "Paul and Silas were beaten and imprisoned, yet prayed and sang. An earthquake opened the doors; they stayed, and the jailer heard about Jesus. Our lamps and care tasks explore mercy after the crisis, not a way to earn rescue."},
  world: 'World 8-6',
  title: 'Songs at Midnight',
  town: true,                 // houses get doors, windows, awnings (engine house kit)
  time: 'night',
  leafIcon: '🎵',
  leafColor: 0xfde68a,
  leafShape: 'round',
  spawn: [0, 38],
  bounds: { minX: -18, maxX: 18, minZ: -42, maxZ: 42 },
  approach: ['stones', 'log', 'crumbles'],   // the way in (engine): a stretch before the level's own start
  startMessage: '"Take unto you the whole armour of God" (Ephesians 6:13). Put it on, then go to the prison. Listen: someone is singing!',

  intro: [
    { text: 'And at midnight Paul and Silas prayed, and sang praises unto God: and the prisoners heard them.', ref: 'Acts 16:25' },
    { text: 'And they said, Believe on the Lord Jesus Christ, and thou shalt be saved, and thy house.', ref: 'Acts 16:31' }
  ],

  introStory: [
    { art: '⛓️', title: 'Thrown in prison', text: 'Paul and Silas told people in Philippi about Jesus. A crowd turned against them. They were beaten and thrown into prison.' }
  ],

  tasks: [
    { id: 'listen', icon: '🎵', label: 'Listen at midnight', total: 1 },
    { id: 'gather', icon: '👥', label: 'Gather the prisoners to Paul', total: 6, lockedUntil: 'listen' },
    { id: 'light', icon: '🪔', label: 'Bring lamps to the jailer', total: 3, lockedUntil: 'gather' },
    { id: 'care', icon: '🥣', label: 'Care for Paul and Silas', total: 2, lockedUntil: 'light' }
  ],

  memoryVerse: { text: 'Finally, my brethren, be strong in the Lord, and in the power of his might.', ref: 'Ephesians 6:10' },

  ending: {
    verse: { text: 'And they said, Believe on the Lord Jesus Christ, and thou shalt be saved, and thy house.', ref: 'Acts 16:31' },
    message: 'Even in prison at midnight, God\'s people sang. And a whole family was saved!'
  },

  quiz: [
    { q: 'What were Paul and Silas doing at midnight?', ref: 'Acts 16:25', options: ['Praying and singing praises to God', 'Trying to escape', 'Sleeping'], answer: 0 },
    { q: 'What did Paul call out when the doors opened?', ref: 'Acts 16:28', options: ['"Run!"', '"We are all here"', '"Hide!"'], answer: 1 },
    { q: 'What did the jailer need to do to be saved?', ref: 'Acts 16:31', options: ['Work harder', 'Give money', 'Believe on the Lord Jesus Christ'], answer: 2 }
  ],

  music: {
    bpm: 76,
    notes: [62, 0, 66, 0, 69, 0, 71, 69, 66, 0, 64, 0, 62, 0, 0, 0,
            66, 0, 69, 0, 74, 0, 73, 71, 69, 0, 66, 0, 64, 62, 0, 0],
    bass: [38, 38, 43, 43, 45, 45, 38, 38]
  },

  onCallText(kind, n) {                                                 // said once; after that they just come
    if (NIGHT.saidCall) return '';
    NIGHT.saidCall = true;
    return n > 1 ? n + ' prisoners follow you to Paul.' : 'A prisoner follows you to Paul.';
  },

  /* ---------- ground shape ---------- */
  terrain(x, z) {
    return Math.sin(x * 0.3) * Math.cos(z * 0.25) * 0.08 + Math.max(0, Math.abs(x) - 16) * 1.2;
  },

  groundColor(x, z) {
    if (z < 12 && z > -22 && Math.abs(x) < 15) return (Math.floor(x / 2) + Math.floor(z / 2)) % 2 ? 0x8d8574 : 0x857d6c;   // courtyard stones
    if (Math.abs(x) < 3) return 0x9c8e73;
    return 0x7b7059;
  },

  /* ---------- build ---------- */
  build(api) {
    const T = api.THREE;
    const person = (robe, scarf, s, o) => api.person(robe, scarf, s, o);   // friendly round townsfolk (engine)
    const stone = 0x6f6857;

    // --- the street: houses and the armour of God ---
    [[-9, 30], [10, 30], [-9, 22], [10, 19]].forEach(([x, z]) => api.box({ x, z, w: 6, d: 6, h: 3.4, color: 0x8a7f6a }));
    api.armor('shield', -4, 30);
    api.armor('helmet', 4, 30);
    api.armor('breastplate', 0, 25);
    api.armor('sandals', -6, 18);

    // --- the prison: outer wall with a gate, courtyard, six cells, the inner prison ---
    api.box({ x: -9.5, z: 12, w: 15, d: 0.8, h: 3.4, color: stone });
    api.box({ x: 9.5, z: 12, w: 15, d: 0.8, h: 3.4, color: stone });
    api.box({ x: -16.6, z: -5, w: 0.8, d: 34, h: 3.4, color: stone });
    api.box({ x: 16.6, z: -5, w: 0.8, d: 34, h: 3.4, color: stone });
    api.box({ x: 0, z: -19, w: 12, d: 6, h: 4, color: 0x5f5848 });                          // inner prison
    const door = new T.Mesh(new T.BoxGeometry(1.4, 2.2, 0.1), api.mat(0x3f2a14)); door.position.set(0, 1.1, -15.95); api.add(door);
    NIGHT.innerDoor = door;
    // Paul and Silas in the stocks beside the door
    const paul = person(0x7c2d12, 0xe7e5e4, 1, { beard: true }), silas = person(0x1e3a8a, 0xe7e5e4, 1, { beard: true });
    paul.position.set(-1.6, 0, -14.6); silas.position.set(1.6, 0, -14.6); api.add(paul); api.add(silas);
    const stocks = new T.Mesh(new T.BoxGeometry(4.6, 0.35, 0.4), api.mat(0x6b4f2a)); stocks.position.set(0, 0.3, -13.9); api.add(stocks);
    NIGHT.paul = paul; NIGHT.silas = silas; NIGHT.stocks = stocks;
    // a warm glow by them: they are singing
    const song = new T.PointLight(0xfff1c1, 1.2, 9, 2); song.position.set(0, 2, -14); api.add(song);
    // cells, each with a door that opens in the earthquake, and a prisoner inside
    NIGHT.CELLS.forEach(([cx, cz], i) => {
      const s = Math.sign(cx);
      api.box({ x: cx + s * 2.6, z: cz, w: 0.4, d: 5, h: 3, color: stone });               // back wall
      api.box({ x: cx, z: cz - 2.4, w: 5.2, d: 0.4, h: 3, color: stone });
      api.box({ x: cx, z: cz + 2.4, w: 5.2, d: 0.4, h: 3, color: stone });
      const d = api.box({ x: cx - s * 2.5, z: cz, w: 0.3, d: 4.4, h: 3, color: 0x4a3b28 });  // the cell door (bars)
      NIGHT.doors.push(d);
      const pr = api.follower({
        x: cx + s * 0.5, z: cz, kind: 'prisoner', mesh: person([0x57534e, 0x78716c, 0x44403c][i % 3], 0xa8a29e),
        deliverTo: { x: NIGHT.GATHER[0], z: NIGHT.GATHER[1], r: 3.5 },
        parkAt: (f) => { const k = NIGHT.prisoners.indexOf(f), a = k / 6 * Math.PI * 2; return [NIGHT.GATHER[0] + Math.cos(a) * 2.4, api.terrain(0, NIGHT.GATHER[1]), NIGHT.GATHER[1] + Math.sin(a) * 2.4]; },
        onDeliver(p) {
          api.task('gather');
          api.servant(p, 5, 'for keeping everyone together!');
        }
      });
      pr.state = 'parked';
      NIGHT.prisoners.push(pr);
    });
    const ring = new T.Mesh(new T.RingGeometry(3.2, 3.5, 32), new T.MeshBasicMaterial({ color: 0xfde68a, transparent: true, opacity: 0.5, side: T.DoubleSide }));
    ring.rotation.x = -Math.PI / 2; ring.position.set(NIGHT.GATHER[0], 0.06, NIGHT.GATHER[1]); ring.visible = false; api.add(ring); NIGHT.ring = ring;
    // stone arches: shelter from falling stones
    NIGHT.shelters.forEach(([x, z]) => {
      [-1.6, 1.6].forEach((dx) => api.box({ x: x + dx, z, w: 0.5, d: 0.5, h: 2.6, color: 0x9a8f78 }));
      api.box({ x, z, w: 4, d: 3.2, h: 0.4, y: 2.6, color: 0x9a8f78 });
    });
    // falling stones (only during the shaking)
    for (let i = 0; i < 6; i++) {
      const rock = new T.Mesh(new T.DodecahedronGeometry(0.35, 0), api.mat(0x9ca3af));
      const warn = new T.Mesh(new T.RingGeometry(0.4, 0.75, 16), new T.MeshBasicMaterial({ color: 0xef4444, transparent: true, opacity: 0.6, side: T.DoubleSide }));
      warn.rotation.x = -Math.PI / 2; rock.visible = warn.visible = false; api.add(rock); api.add(warn);
      NIGHT.stones.push({ rock, warn, x: 0, z: 0, y: -1 });
    }
    // listening spot at midnight
    NIGHT.listen = api.zone({
      x: 0, z: -11, r: 2.4, time: 2.5, color: 0xfde68a,
      onDone() { api.task('listen'); LEVEL._midnight(api); }
    });

    // --- the jailer, and lamps for him ---
    const jailer = person(0x166534, 0xd6d3d1); jailer.position.set(4, 0, -23.5); jailer.visible = false; api.add(jailer); NIGHT.jailer = jailer;
    [[-8, -24], [-10, -27], [-6, -28]].forEach(([x, z]) => {
      const g = new T.Group();
      const bowl = new T.Mesh(new T.SphereGeometry(0.22, 10, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), api.mat(0xb45309)); g.add(bowl);
      const flame = new T.Mesh(new T.ConeGeometry(0.09, 0.28, 8), new T.MeshBasicMaterial({ color: 0xfbbf24 })); flame.position.set(0.12, 0.12, 0); g.add(flame);
      const it = api.carryable({ x, z, mesh: g, name: 'lamp', to: 'the jailer', deliverTo: { x: 4, z: -23.5, r: 2.4 },
        onDeliver(p) { api.task('light'); api.servant(p, 4, 'for bringing light!'); } });
      it.blocked = () => (NIGHT.calmed ? true : 'A lamp. Wait until the shaking stops.');
      NIGHT.lamps.push(it);
    });

    // --- the jailer's house: water to wash their wounds, and food ---
    const [hx, hz] = NIGHT.HOUSE;
    api.box({ x: hx, z: hz - 6, w: 10, d: 6, h: 3.6, color: 0x9a8f78 });
    const table = new T.Mesh(new T.BoxGeometry(3, 0.15, 1.4), api.mat(0x6b4f2a)); table.position.set(hx, 0.75, hz); api.add(table);
    const homeLight = new T.PointLight(0xffd59e, 1.2, 12, 2); homeLight.position.set(hx, 3, hz); api.add(homeLight);
    [['water', 9, -26], ['bread', 11, -30]].forEach(([kind, x, z]) => {
      const g = new T.Group();
      if (kind === 'water') { const b = new T.Mesh(new T.CylinderGeometry(0.45, 0.3, 0.3, 14), api.mat(0x9a3412)); g.add(b); const w = new T.Mesh(new T.CircleGeometry(0.4, 14), api.mat(0x60a5fa)); w.rotation.x = -Math.PI / 2; w.position.y = 0.14; g.add(w); }
      else { const b = new T.Mesh(new T.CylinderGeometry(0.45, 0.35, 0.3, 12), api.mat(0x92400e)); g.add(b); const l = new T.Mesh(new T.SphereGeometry(0.28, 8, 6), api.mat(0xd4a056)); l.position.y = 0.22; g.add(l); }
      const it = api.carryable({ x, z, mesh: g, name: kind === 'water' ? 'bowl of water' : 'bread', to: 'the jailer\'s table', deliverTo: { x: hx, z: hz, r: 2.6 },
        onDeliver(p) { api.task('care'); api.servant(p, 5, 'for caring for Paul and Silas!'); } });
      it.blocked = () => (api.taskDone('light') ? true : 'Not yet: the jailer needs light first.');
      NIGHT.care.push(it);
    });

    // --- fragments ---
    // 1: crumbling stones along the top of the broken outer wall
    [[-15.2, 14.6, 1.0], [-13.2, 16.4, 1.8], [-15.2, 18.2, 2.6]].forEach(([x, z, top]) => api.crumble({ x, z, top }));
    api.box({ x: -15, z: 20.4, w: 2, d: 1.6, h: 3.4, color: stone });
    api.fragment({ x: -15, z: 20.4, y: 3.4 + 1.3 });
    // 2: deep in the courtyard well (the Fisherman casts a net)
    api.stump(9, 2, 0.9, 1.0);
    api.fragment({ x: 9, z: 2, y: -0.8, net: true });
    // 3: a spring up onto the inner prison roof
    api.spring({ x: 7.4, z: -14.2 });
    api.fragment({ x: 4.5, z: -19, y: 4 + 1.3 });

    // --- Golden Scroll challenge course: along the east of the street ---
    const plan = [['block', 1.0], ['float', 1.0], ['crumble', 0.9], ['float', 0.8], ['spring', 0.2], ['float', 4.2], ['crumble', 0.6]];
    let ctop = 0;
    api.course(plan.map(([kind, rise], i) => {
      const z = 39 - i * 2.9, x = 15 + (i % 2 ? 0.3 : -0.3);
      ctop = i === 0 ? api.terrain(x, z) + 1.0 : ctop + rise;
      return { x, z, top: ctop, kind };
    }));

    api.leaves([[0, 34], [0, 28], [-2, 20], [2, 16], [0, 10], [-6, 4], [6, -2], [-6, -8], [0, -26], [-4, -32], [4, -32],
      [-13.2, 16.4, 2.7], [5, 8], [-8, 26]]);
    // (no challenge corner: the night in prison is the level)
  },

  // midnight: they pray and sing; then God sends the earthquake
  _midnight(api) {
    api.story([
      { art: '🎵', title: 'Singing in the dark', text: 'And at midnight Paul and Silas prayed, and sang praises unto God: and the prisoners heard them.', ref: 'Acts 16:25' },
      { art: '🌍', text: 'And suddenly there was a great earthquake, so that the foundations of the prison were shaken: and immediately all the doors were opened, and every one\'s bands were loosed.', ref: 'Acts 16:26' }
    ], () => { api.toast('🛡️ Stand firm! Shelter under the stone arches when the ground shakes. The doors are open, but nobody should run away: gather every prisoner to Paul.', 4500);
      NIGHT.quake = true; NIGHT.quakeT = 0;
      NIGHT.doors.forEach((d) => d.show(false));
      NIGHT.prisoners.forEach((p) => { p.state = 'idle'; });
      NIGHT.ring.visible = true;
      NIGHT.stocks.visible = false;
      api.sfx('door');
    });
  },

  update(api, dt) {
    // the earthquake: shaking for 4 seconds, calm for 4, until everyone is gathered
    if (NIGHT.quake && !NIGHT.calmed) {
      NIGHT.quakeT += dt;
      const was = NIGHT.shaking;
      NIGHT.shaking = (NIGHT.quakeT % 8) < 4;
      if (NIGHT.shaking && !was) api.sfx('hit');
      if (NIGHT.shaking) {
        api.activePlayers().forEach((p) => {
          if (nightUnderShelter(p.pos.x, p.pos.z)) return;                // safe under an arch
          const a = Math.sin(api.time * 7 + p.slot * 2) * Math.PI;
          api.push(p, Math.cos(a) * 3.5, Math.sin(a) * 3.5, dt);         // the Breastplate stands firm
          if (!NIGHT.toldShake) { NIGHT.toldShake = true; api.toast('🌍 The ground is shaking! Shelter under a stone arch, or stand firm with the armour of God.', 4000); }
        });
        if (Math.random() < 0.02) api.puff((Math.random() - 0.5) * 26, 0.2, -18 + Math.random() * 28, 0x9ca3af, 6);
      }
      // falling stones near players (a red ring shows where; the Shield of Faith blocks them)
      NIGHT.stones.forEach((st, i) => {
        if (!NIGHT.shaking && st.y < 0) { st.rock.visible = st.warn.visible = false; return; }
        if (st.y < 0) {
          const ps = api.activePlayers(); if (!ps.length) return;
          const p = ps[(i + Math.floor(api.time)) % ps.length];
          st.x = p.pos.x + (Math.random() - 0.5) * 7; st.z = p.pos.z + (Math.random() - 0.5) * 7; st.y = 9 + Math.random() * 6;
          if (nightUnderShelter(st.x, st.z)) st.x += 4;
        }
        st.y -= 9 * dt;
        st.rock.visible = st.warn.visible = true;
        st.rock.position.set(st.x, st.y, st.z); st.rock.rotation.x += dt * 4;
        st.warn.position.set(st.x, api.groundAt(st.x, st.z) + 0.06, st.z);
        if (st.y <= api.groundAt(st.x, st.z) + 0.35) {
          api.near(st.x, st.z, 1.3).forEach((p) => { if (!nightUnderShelter(p.pos.x, p.pos.z)) api.hit(p, st.x, st.z, 'falling', 'Bonk! A falling stone. The Shield of Faith 🛡️ blocks those, and the arches keep you safe.'); });
          api.puff(st.x, api.groundAt(st.x, st.z), st.z, 0x9ca3af, 5);
          st.y = -1;
        }
      });
    }
    // everyone gathered: the shaking stops, the jailer comes with a call for light
    if (!NIGHT.calmed && api.taskDone('gather')) {
      NIGHT.calmed = true; NIGHT.shaking = false;
      NIGHT.stones.forEach((st) => { st.rock.visible = st.warn.visible = false; });
      NIGHT.jailer.visible = true;
      api.story([
        { art: '🪔', title: 'Nobody ran away', text: 'Then he called for a light, and sprang in, and came trembling, and fell down before Paul and Silas,', ref: 'Acts 16:29' }
      ], () => api.toast('🪔 Bring lamps to the jailer!', 3000));
    }
    if (!NIGHT.asked && api.taskDone('light')) {
      NIGHT.asked = true;
      api.story([
        { art: '❓', text: 'And brought them out, and said, Sirs, what must I do to be saved?', ref: 'Acts 16:30' },
        { art: '✝️', text: 'And they said, Believe on the Lord Jesus Christ, and thou shalt be saved, and thy house.', ref: 'Acts 16:31' }
      ], () => api.toast('🏠 The jailer took Paul and Silas home. Help care for them: bring water for their wounds and bread to the table.', 4500));
      NIGHT.paul.position.set(-1.2, 0, NIGHT.HOUSE[1] - 1.4); NIGHT.silas.position.set(1.2, 0, NIGHT.HOUSE[1] - 1.4);
    }
  },

  objective(api) {
    const ps = api.activePlayers();
    if (!ps.length) return null;
    const cx = ps.reduce((s, p) => s + p.pos.x, 0) / ps.length, cz = ps.reduce((s, p) => s + p.pos.z, 0) / ps.length;
    const near = (list) => list.sort((a, b) => Math.hypot(a[0] - cx, a[2] - cz) - Math.hypot(b[0] - cx, b[2] - cz))[0];
    const held = ps.map((p) => p.holding).find((h) => h && h.deliverTo);
    if (held) return [held.deliverTo.x, 2, held.deliverTo.z];
    if (!api.taskDone('listen')) return [0, 1.5, -11];
    if (!api.taskDone('gather')) {
      if (NIGHT.prisoners.some((f) => f.state === 'follow')) return [NIGHT.GATHER[0], 1.5, NIGHT.GATHER[1]];
      const idle = NIGHT.prisoners.filter((f) => f.state === 'idle').map((f) => [f.pos.x, f.pos.y + 2, f.pos.z]);
      return idle.length ? near(idle) : null;
    }
    const list = (api.taskDone('light') ? NIGHT.care : NIGHT.lamps).filter((it) => !it.delivered && !it.holder).map((it) => [it.x, it.y + 1, it.z]);
    return list.length ? near(list) : null;
  },

  finale: {
    message: '🏠 Everyone gather at the jailer\'s house!',
    beacon: [0, 3, -31],
    inZone(p) { return Math.hypot(p.pos.x - NIGHT.HOUSE[0], p.pos.z - NIGHT.HOUSE[1]) < 6; },
    onUpdate(api, t) {
      if (t > 0.5 && !NIGHT.told) {
        NIGHT.told = true;
        api.story([
          { art: '🎉', text: 'And when he had brought them into his house, he set meat before them, and rejoiced, believing in God with all his house.', ref: 'Acts 16:34' },
          ...(api.shownRef('Ephesians 6:10') ? [] : [{ art: '💪', title: 'Stand firm', text: 'Finally, my brethren, be strong in the Lord, and in the power of his might.', ref: 'Ephesians 6:10' }]),
        ], () => { NIGHT.endT = api.time; });
      }
      return NIGHT.endT !== undefined && api.time - NIGHT.endT > 2;
    }
  }
};
