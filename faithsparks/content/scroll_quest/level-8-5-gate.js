/* =====================================================================
 * LEVEL 8-5: KNOCKING AT THE GATE  (Acts 12:1-17)
 * ---------------------------------------------------------------------
 * Night in Jerusalem. Peter is in prison, and the church is praying. North to south:
 *   Mary's house (z 30..18)   gather the believers to pray (Acts 12:5, 12:12)
 *   The prison   (z -6..-30)  God sends His angel (shown only as light). Stay with the light: it
 *                             waits for everyone, and every door opens by itself.
 * Then bring Peter to Mary's gate... where Rhoda is so happy she forgets to open it!
 * Get there before dawn for a bonus (never a fail).
 * Only edit THIS file to change the level. See GEMINI.md and CAMPAIGN.md.
 * ===================================================================== */

const GATE = {
  HOUSE: [0, 24],
  GATEPOS: [0, 18.4],          // Mary's courtyard gate
  CELL: [0, -26],
  PATH: [[0, -26], [0, -20.5], [0, -15], [0, -9.5], [0, -4], [2, 2]],   // the light's way out
  doors: [],                   // ward 1, ward 2, the iron gate
  believers: [],
  seg: 0,
  lit: false,
  free: false
};

const LEVEL = {
  id: '8-5',
  bibleConnection: {"passage": "Acts 12:1–19", "text": "Herod killed James and imprisoned Peter. While believers prayed, God sent an angel to release Peter, who surprised them at Mary’s gate. Our light-following and door task explore the rescue; players do not open the prison by magic."},
  world: 'World 8-5',
  title: 'Knocking at the Gate',
  town: true,                 // houses get doors, windows, awnings (engine house kit)
  time: 'night',
  leafIcon: '🕯️',
  leafColor: 0xfde68a,
  leafShape: 'round',
  spawn: [3, 30],
  bounds: { minX: -20, maxX: 20, minZ: -32, maxZ: 34 },
  approach: ['stones', 'crumbles', 'ledge'],   // the way in (engine): a stretch before the level's own start
  startMessage: 'Peter is in prison. Gather the believers to Mary\'s house to pray.',

  intro: [
    { text: 'Peter therefore was kept in prison: but prayer was made without ceasing of the church unto God for him.', ref: 'Acts 12:5' },
    { text: 'Confess your faults one to another, and pray one for another, that ye may be healed. The effectual fervent prayer of a righteous man availeth much.', ref: 'James 5:16' }
  ],

  introStory: [
    { art: '⛓️', title: 'Peter in prison', text: 'King Herod arrested Peter and put him in prison, guarded by soldiers, planning to bring him out after the feast.' },
    { art: '🙏', text: 'Peter therefore was kept in prison: but prayer was made without ceasing of the church unto God for him.', ref: 'Acts 12:5' }
  ],

  tasks: [
    { id: 'pray', icon: '🙏', label: 'Gather the believers to pray', total: 4 },
    { id: 'light', icon: '✨', label: 'Stay with the light out of the prison', total: 3, lockedUntil: 'pray' },
    { id: 'knock', icon: '🚪', label: 'Bring Peter to Mary\'s gate', total: 1, lockedUntil: 'light' },
    { id: 'open', icon: '🔓', label: 'Open the gate for Peter!', total: 1, lockedUntil: 'knock' }
  ],

  memoryVerse: { text: 'Confess your faults one to another, and pray one for another, that ye may be healed. The effectual fervent prayer of a righteous man availeth much.', ref: 'James 5:16' },

  ending: {
    verse: { text: 'But he, beckoning unto them with the hand to hold their peace, declared unto them how the Lord had brought him out of the prison.', ref: 'Acts 12:17' },
    message: 'God\'s people prayed, and God answered: so wonderfully that they could hardly believe it!'
  },

  quiz: [
    { q: 'What was the church doing while Peter was in prison?', ref: 'Acts 12:5', options: ['Sleeping', 'Praying without ceasing', 'Packing to leave'], answer: 1 },
    { q: 'What happened to the iron gate?', ref: 'Acts 12:10', options: ['It opened of its own accord', 'Peter broke it', 'It stayed shut'], answer: 0 },
    { q: 'What did Rhoda do when she heard Peter\'s voice?', ref: 'Acts 12:14', options: ['Opened the gate', 'Ran in to tell, and left him knocking', 'Went to sleep'], answer: 1 }
  ],

  music: {
    bpm: 84,
    notes: [60, 0, 64, 0, 67, 0, 69, 67, 64, 0, 62, 0, 60, 0, 0, 0,
            64, 0, 67, 69, 72, 0, 69, 67, 65, 0, 64, 0, 62, 60, 0, 0],
    bass: [36, 36, 41, 41, 43, 43, 36, 36]
  },

  onCallText(kind, n) {
    if (kind === 'Peter') return 'Peter walks with you to Mary\'s house.';
    return n > 1 ? n + ' believers come to pray.' : 'A believer comes to pray.';
  },

  /* ---------- ground shape ---------- */
  terrain(x, z) {
    let h = Math.sin(x * 0.3) * Math.cos(z * 0.22) * 0.08 + Math.max(0, Math.abs(x) - 17.5) * 1.2;
    if (Math.hypot(x + 6, z - 27) < 1.1) h -= 2.4;                        // the courtyard well
    return h;
  },

  groundColor(x, z) {
    if (z < -6 && Math.abs(x) < 7) return (Math.floor(x / 2) + Math.floor(z / 2)) % 2 ? 0x6e675a : 0x666052;   // prison floor
    return (Math.floor(x / 2) + Math.floor(z / 2)) % 2 ? 0x8a8070 : 0x827868;
  },

  /* ---------- build ---------- */
  build(api) {
    const T = api.THREE;
    const person = (robe, scarf, s, o) => api.person(robe, scarf, s, o);   // friendly round townsfolk (engine)
    const stone = 0x5f584b;

    // --- Mary's house with its courtyard wall and gate ---
    const [hx, hz] = GATE.HOUSE;
    api.box({ x: hx, z: hz + 6.5, w: 12, d: 4, h: 3.6, color: 0xa89878 });
    api.box({ x: -6.5, z: hz, w: 1, d: 13, h: 2.6, color: 0x9c8f78 });
    api.box({ x: 6.5, z: hz, w: 1, d: 13, h: 2.6, color: 0x9c8f78 });
    api.box({ x: -4, z: GATE.GATEPOS[1], w: 6, d: 0.8, h: 2.6, color: 0x9c8f78 });
    api.box({ x: 4, z: GATE.GATEPOS[1], w: 6, d: 0.8, h: 2.6, color: 0x9c8f78 });
    GATE.gate = api.box({ x: 0, z: GATE.GATEPOS[1], w: 2, d: 0.5, h: 2.4, color: 0x5c3d22, hidden: true });   // shut for the night later
    const warm = new T.PointLight(0xffd59e, 1.3, 12, 2); warm.position.set(hx, 2.5, hz + 2); api.add(warm);
    const rhoda = person(0xbe185d, 0xfde68a, 0.8); rhoda.position.set(1.4, 0, GATE.GATEPOS[1] + 1.2); api.add(rhoda); GATE.rhoda = rhoda;
    const ring = new T.Mesh(new T.RingGeometry(3, 3.3, 30), new T.MeshBasicMaterial({ color: 0xfde68a, transparent: true, opacity: 0.45, side: T.DoubleSide }));
    ring.rotation.x = -Math.PI / 2; ring.position.set(hx, 0.06, hz + 1); api.add(ring);
    // believers around the city
    [[-14, 12], [14, 10], [-15, -2], [15, -6]].forEach(([x, z], i) => {
      GATE.believers.push(api.follower({ x, z, kind: 'believer', mesh: person([0x57534e, 0x1e3a8a, 0x9a3412, 0x4d7c0f][i], 0xd6d3d1),
        deliverTo: { x: hx, z: hz + 1, r: 3 },
        parkAt: (f) => { const k = GATE.believers.indexOf(f), a = k / 4 * Math.PI * 2; return [hx + Math.cos(a) * 2, 0, hz + 1 + Math.sin(a) * 2]; },
        onDeliver(p, f) {
          api.task('pray'); api.servant(p, 4, 'for gathering the church to pray!'); f.mesh.scale.y = 0.8;
          if (api.taskDone('pray')) LEVEL._angel(api);   // (the task board counts the others: no pop-up)
        } }));
    });

    // --- the prison: outer walls, two wards with doors, the iron gate ---
    api.box({ x: -7, z: -18, w: 1, d: 18, h: 4.4, color: stone });
    api.box({ x: 7, z: -18, w: 1, d: 18, h: 4.4, color: stone });
    api.box({ x: 0, z: -27.6, w: 15, d: 1, h: 4.4, color: stone });
    [[-20.5, 0x4a3b28, 'ward'], [-15, 0x4a3b28, 'ward'], [-9.5, 0x3b3b3b, 'iron']].forEach(([z, col]) => {
      api.box({ x: -4.3, z, w: 4.4, d: 0.8, h: 4.4, color: stone });
      api.box({ x: 4.3, z, w: 4.4, d: 0.8, h: 4.4, color: stone });
      GATE.doors.push(api.box({ x: 0, z, w: 2.4, d: 0.5, h: 3.2, color: col }));
    });
    // Peter asleep between two soldiers, chained (they all sleep on)
    const peter = person(0x92400e, 0xe7e5e4, 1, { beard: 0x57534e }); peter.position.set(0, 0, GATE.CELL[1]); api.add(peter); GATE.peterNPC = peter;
    [-1.2, 1.2].forEach((dx) => { const s = person(0x374151, 0x9ca3af); s.position.set(dx, 0, GATE.CELL[1] - 0.4); s.rotation.z = dx * 0.4; api.add(s); });
    const chains = new T.Mesh(new T.TorusGeometry(0.4, 0.05, 6, 16), api.mat(0x9ca3af)); chains.position.set(0, 0.9, GATE.CELL[1]); api.add(chains); GATE.chains = chains;
    [[-3, -12], [3, -18]].forEach(([x, z]) => { const k = person(0x374151, 0x9ca3af); k.position.set(x, 0, z); k.rotation.x = 0.3; api.add(k); });   // keepers, fast asleep
    // the angel: shown only as light
    const glow = new T.Mesh(new T.SphereGeometry(0.7, 16, 12), new T.MeshBasicMaterial({ color: 0xfffbea, transparent: true, opacity: 0.85 }));
    const halo = new T.PointLight(0xfff7d6, 0, 12, 2);
    glow.visible = false; api.add(glow); api.add(halo); GATE.glow = glow; GATE.halo = halo;

    // Peter (the follower, after the light leaves)
    GATE.peter = api.follower({ x: 2, z: 2, kind: 'Peter', mesh: person(0x92400e, 0xe7e5e4, 1, { beard: 0x57534e }),
      deliverTo: { x: GATE.GATEPOS[0], z: GATE.GATEPOS[1] - 1.6, r: 2.2 },
      parkAt: [GATE.GATEPOS[0], 0, GATE.GATEPOS[1] - 1.4],
      onDeliver(p) { api.task('knock'); api.servant(p, 4); LEVEL._rhoda(api); } });
    GATE.peter.state = 'parked'; GATE.peter.mesh.visible = false;
    GATE.openI = api.interact({ x: GATE.GATEPOS[0], z: GATE.GATEPOS[1] + 1, r: 2.6, label: 'Open the gate for Peter!', priority: 2,
      use(p) {
        this.remove(); GATE.gate.show(false); api.task('open'); api.servant(p, 5, 'for opening the gate!'); api.sfx('door');
        api.story([{ art: '😮', text: 'But Peter continued knocking: and when they had opened the door, and saw him, they were astonished.', ref: 'Acts 12:16' }]);
      } });
    GATE.openI.alive = false;

    // --- fragments ---
    // 1: the courtyard well (the Fisherman nets it)
    api.stump(-6, 27, 0.9, 1.0);
    api.fragment({ x: -6, z: 27, y: -1.4, net: true });
    // 2: crumbling stones up onto the prison wall
    [[-10, -8, 1.2], [-11.4, -10.4, 2.3], [-10, -12.8, 3.4]].forEach(([x, z, t]) => api.crumble({ x, z, top: t }));
    api.fragment({ x: -7, z: -16, y: 4.4 + 1.3 });
    // 3: a spring onto a city rooftop
    api.box({ x: 13, z: 22, w: 4, d: 4, h: 4.2, color: 0x8a7f6a });
    api.spring({ x: 13, z: 18.6 });
    api.fragment({ x: 13, z: 22, y: 4.2 + 1.3 });

    // --- Golden Scroll challenge course: west side ---
    const plan = [['block', 1.0], ['float', 1.0], ['crumble', 0.9], ['float', 0.8], ['spring', 0.2], ['float', 4.2], ['crumble', 0.6]];
    let ctop = 0;
    api.course(plan.map(([kind, rise], i) => {
      const z = 32 - i * 2.9, x = -16.5 + (i % 2 ? 0.3 : -0.3);
      ctop = i === 0 ? api.terrain(x, z) + 1.0 : ctop + rise;
      return { x, z, top: ctop, kind };
    }));

    api.leaves([[0, 14], [-6, 10], [6, 6], [0, 2], [-10, -4], [10, -2], [0, -12], [0, -18], [0, -23], [-11.4, -10.4, 3.1], [12, 14], [-12, 20]]);
    // (no challenge corner: the night rescue is the level)
  },

  _angel(api) {
    api.story([
      { art: '✨', text: 'And, behold, the angel of the Lord came upon him, and a light shined in the prison: and he smote Peter on the side, and raised him up, saying, Arise up quickly. And his chains fell off from his hands.', ref: 'Acts 12:7' }
    ], () => { api.toast('🕯️ The angel led Peter out. In our game, you walk along beside him: follow the light! It waits for everyone, and the doors open by themselves.', 5000);
      GATE.gate.show(true);
      GATE.lit = true; GATE.seg = 0; GATE.glowPos = GATE.PATH[0].slice();
      GATE.glow.visible = true; GATE.halo.intensity = 1.8; GATE.chains.visible = false;
      api.activePlayers().forEach((p, i) => { p.pos.set(-1.5 + i * 1.2, api.groundAt(0, GATE.CELL[1] + 2), GATE.CELL[1] + 2); p.vel.set(0, 0, 0); p.lastSafe.copy(p.pos); });
      GATE.cd = api.countdown({ seconds: 150, label: '🌅 Before dawn', onEnd: () => api.toast('Dawn is coming. Keep going: God is with Peter!', 2600) });
    });
  },

  _rhoda(api) {
    api.story([
      { art: '🏃‍♀️', title: 'Peter knocked, and Rhoda ran to tell', text: 'And when she knew Peter’s voice, she opened not the gate for gladness, but ran in, and told how Peter stood before the gate.', ref: 'Acts 12:14' }
    ], () => { api.toast('😄 Everyone inside said, "You must be dreaming!" Meanwhile Peter is still knocking outside. Somebody open the gate!', 4500); GATE.rhoda.position.set(0, 0, GATE.HOUSE[1] + 3); GATE.openI.alive = true; });
  },

  update(api, dt) {
    if (!GATE.lit || GATE.free) return;
    const ps = api.activePlayers();
    const g = GATE.glowPos, next = GATE.PATH[GATE.seg + 1];
    const near = ps.every((p) => Math.hypot(p.pos.x - g[0], p.pos.z - g[1]) < 7);
    if (near && next) {
      const dx = next[0] - g[0], dz = next[1] - g[1], d = Math.hypot(dx, dz), st = 2.6 * dt;
      if (d <= st) {
        g[0] = next[0]; g[1] = next[1]; GATE.seg++;
        const door = GATE.doors[GATE.seg - 1];
        if (door && door.platform.on) {                                    // the door opens of its own accord
          door.show(false); api.sfx('door'); api.task('light');
          ps.forEach((p) => api.servant(p, 2));
          if (GATE.seg === 3) api.story([{ art: '🚪', text: 'When they were past the first and the second ward, they came unto the iron gate that leadeth unto the city; which opened to them of his own accord: and they went out, and passed on through one street; and forthwith the angel departed from him.', ref: 'Acts 12:10' }]);
        }
      } else { g[0] += dx / d * st; g[1] += dz / d * st; }
    } else if (!near && !GATE.toldWait) { GATE.toldWait = true; api.toast('✨ The light waits for everyone. Stay close!', 2200); }
    // Peter walks right behind the light
    GATE.peterNPC.position.set(g[0], api.terrain(g[0], g[1]), g[1] - 1.2);
    GATE.glow.position.set(g[0], 1.6 + Math.sin(api.time * 3) * 0.15, g[1]);
    GATE.halo.position.copy(GATE.glow.position);
    if (!next) {                                                          // out in the street: the light departs
      GATE.free = true; GATE.glow.visible = false; GATE.halo.intensity = 0;
      GATE.peterNPC.visible = false;
      const pe = GATE.peter; pe.mesh.visible = true; pe.pos.set(g[0], api.terrain(g[0], g[1]), g[1] - 1.2); pe.mesh.position.copy(pe.pos); pe.state = 'idle'; pe.home.copy(pe.pos);
      api.toast('🚶 The light is gone. Call Peter and take him to Mary\'s house!', 2800);
    }
  },

  objective(api) {
    const ps = api.activePlayers();
    if (!ps.length) return null;
    const c = ps[0].pos;
    if (!api.taskDone('pray')) {
      if (GATE.believers.some((f) => f.state === 'follow')) return [GATE.HOUSE[0], 1.5, GATE.HOUSE[1] + 1];
      const f = GATE.believers.filter((x) => x.state === 'idle').sort((a, b) => Math.hypot(a.pos.x - c.x, a.pos.z - c.z) - Math.hypot(b.pos.x - c.x, b.pos.z - c.z))[0];
      return f ? [f.pos.x, f.pos.y + 2, f.pos.z] : null;
    }
    if (!GATE.free) return GATE.glowPos ? [GATE.glowPos[0], 2.5, GATE.glowPos[1]] : null;
    const pe = GATE.peter;
    if (!api.taskDone('knock')) return pe.state === 'follow' ? [GATE.GATEPOS[0], 1.5, GATE.GATEPOS[1] - 1.6] : [pe.pos.x, pe.pos.y + 2, pe.pos.z];
    if (!api.taskDone('open')) return [GATE.GATEPOS[0], 1.5, GATE.GATEPOS[1] + 1];
    return null;
  },

  finale: {
    message: '🏠 Everyone into Mary\'s house: Peter is free!',
    beacon: [GATE.HOUSE[0], 3, GATE.HOUSE[1] + 1],
    inZone(p) { return Math.hypot(p.pos.x - GATE.HOUSE[0], p.pos.z - (GATE.HOUSE[1] + 1)) < 5; },
    onUpdate(api, t) {
      if (t > 0.3 && !GATE.in) { GATE.in = true; const pe = GATE.peter; pe.pos.set(GATE.HOUSE[0], 0, GATE.HOUSE[1] + 1); pe.mesh.position.copy(pe.pos); GATE.believers.forEach((f) => { f.mesh.scale.y = 1; }); }
      if (t > 0.5 && !GATE.done) {
        GATE.done = true;
        if (GATE.cd && !GATE.cd.over) { GATE.cd.stop(); api.activePlayers().forEach((p) => api.servant(p, 4, 'home before dawn!')); }
        api.story([
          { art: '🙏', title: 'God answers prayer', text: 'They had been praying for Peter all night, and when God answered, they could hardly believe it! God hears His people when they pray.' },
          ...(api.shownRef('James 5:16') ? [] : [{ art: '💛', text: 'Confess your faults one to another, and pray one for another, that ye may be healed. The effectual fervent prayer of a righteous man availeth much.', ref: 'James 5:16' }]),
        ], () => { GATE.endT = api.time; });
      }
      return GATE.endT !== undefined && api.time - GATE.endT > 2;
    }
  }
};
