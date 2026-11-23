/* =====================================================================
 * LEVEL 7-3: THE UPPER ROOM  (Luke 22:7-20; John 13:1-17, 34)
 * ---------------------------------------------------------------------
 * Jerusalem at sunset. Walk toward -z:
 *   City gate   (z 40..30)   Scribe reads the gate inscription (hidden steps, fragment)
 *   Streets     (z 30..-30)  follow the man with the water pitcher; the well (Fisherman);
 *                            the olive press with its turning beam (fragment)
 *   The house   (z -32..-44) outside stairs up to the large upper room
 * Tasks: follow the man to the house, picking up 5 things on the way (they go on the table when you
 *   reach the upper room); light 4 lamps.
 * Jesus is never shown. The story cards tell the foot washing, the bread and the cup.
 * Only edit THIS file to change the level. See GEMINI.md and CAMPAIGN.md.
 * ===================================================================== */

const ROOM = {
  guide: null,           // the man carrying a pitcher of water
  path: [[0, 31], [0, 20], [-7, 14], [-7, 2], [4, -4], [4, -18], [-2, -24], [-2, -31.6]],
  seg: 0,
  arrived: false,
  items: [],
  lamps: [],
  steps: [],
  TOP: 3.6,              // floor height of the upper room
  TABLE: [0, -38]
};

function inUpperRoom(p) { return p.pos.y > ROOM.TOP - 0.4 && Math.abs(p.pos.x) < 6 && p.pos.z < -32.8 && p.pos.z > -43.2; }

const LEVEL = {
  id: '7-3',
  bibleConnection: {"passage": "Luke 22:7–20; John 13:1–17", "text": "Jesus shared the Passover meal, spoke of His body and blood, and washed His disciples’ feet. Our table route and lamps imagine preparing the room. His service points ahead to His willing death for us."},
  world: 'World 7-3',
  title: 'The Upper Room',
  town: true,                 // houses get doors, windows, awnings (engine house kit)
  time: 'sunset',
  leafIcon: '🌿',
  leafColor: 0x4d7c0f,
  spawn: [0, 39],
  bounds: { minX: -19, maxX: 19, minZ: -48, maxZ: 44 },
  approach: ['stones', 'crumbles', 'ledge'],   // the way in (engine): a stretch before the level's own start
  startMessage: 'Follow the man carrying the water pitcher. He will lead you to the house!',

  intro: [
    { text: 'And he sent Peter and John, saying, Go and prepare us the passover, that we may eat.', ref: 'Luke 22:8' },
    { text: 'A new commandment I give unto you, That ye love one another; as I have loved you, that ye also love one another.', ref: 'John 13:34' }
  ],

  introStory: [
    { art: '🏙️', title: 'Getting ready', text: 'And he sent Peter and John, saying, Go and prepare us the passover, that we may eat.', ref: 'Luke 22:8' }
  ],

  tasks: [
    { id: 'follow', icon: '🏺', label: 'Follow the man with the water pitcher', total: 1 },
    { id: 'prepare', icon: '🧺', label: 'Pick up things for the table on the way', total: 5 },
    { id: 'lamps', icon: '🪔', label: 'Light the lamps', total: 4 }
  ],

  memoryVerse: { text: 'For I have given you an example, that ye should do as I have done to you.', ref: 'John 13:15' },

  ending: {
    verse: { text: 'A new commandment I give unto you, That ye love one another; as I have loved you, that ye also love one another.', ref: 'John 13:34' },
    message: 'Jesus, the Lord of all, served His friends, and then gave His life for them.'
  },

  quiz: [
    { q: 'Who did the disciples follow to find the house?', ref: 'Luke 22:10', options: ['A Roman soldier', 'A man bearing a pitcher of water', 'A shepherd with his sheep'], answer: 1 },
    { q: 'What did Jesus do with a towel and a basin?', ref: 'John 13:5', options: ['He cleaned the table', 'He fed the animals', 'He washed the disciples\' feet'], answer: 2 },
    { q: 'What did Jesus say about the bread?', ref: 'Luke 22:19', options: ['"This is my body which is given for you"', '"Save it for tomorrow"', '"Give it to the birds"'], answer: 0 }
  ],

  music: {
    bpm: 88,
    notes: [64, 0, 67, 0, 69, 0, 71, 69, 67, 0, 64, 0, 62, 0, 0, 0,
            64, 0, 67, 69, 71, 0, 72, 71, 69, 0, 67, 0, 64, 0, 0, 0],
    bass: [40, 40, 45, 45, 43, 43, 40, 40]
  },

  /* ---------- ground shape ---------- */
  terrain(x, z) { return Math.sin(x * 0.3) * Math.cos(z * 0.2) * 0.12; },

  groundColor(x, z, h) {
    if (Math.abs(x) < 3.5 || (z > 26 && z < 34)) return (Math.floor(x / 1.5) + Math.floor(z / 1.5)) % 2 ? 0xb8a07a : 0xae956e;   // paved street
    return (Math.floor(x / 2) + Math.floor(z / 2)) % 2 ? 0xc7b08a : 0xbca57f;
  },

  /* ---------- build ---------- */
  build(api) {
    const T = api.THREE;
    const stone = 0xd8c39c, dark = 0xb59f78;
    const person = (robe, scarf, s, o) => api.person(robe, scarf, s, o);   // friendly round townsfolk (engine)

    // --- city gate (Scribe reads the inscription: hidden steps up the right tower) ---
    [-8, 8].forEach((x) => api.box({ x, z: 36, w: 4, d: 4, h: 6, color: dark }));
    const arch = new T.Mesh(new T.BoxGeometry(12, 1.2, 4), api.mat(dark)); arch.position.set(0, 6.6, 36); api.add(arch);
    const plaque = new T.Mesh(new T.BoxGeometry(1.6, 1, 0.15), api.mat(0xa8a29e)); plaque.position.set(5.9, 1.8, 33.9); api.add(plaque);
    [[11.4, 34.6, 1.2], [11.4, 37.2, 2.4], [11.4, 39.8, 3.6], [8.8, 40.4, 4.8]].forEach(([x, z, top]) =>
      ROOM.steps.push(api.box({ x, z, w: 1.8, h: 0.4, d: 1.8, y: top - 0.4, hidden: true, color: 0xcbb994 })));
    api.fragment({ x: 8, z: 36, y: 6 + 1.3 });
    api.interact({
      x: 5.9, z: 33.4, r: 2.4, vRange: 3, label: 'Read inscription',
      can: (p) => (p.role.id === 'scribe' ? true : 'Old writing on the gate. Only the Scribe can read it (Tab / RB to switch).'),
      use(p) {
        this.remove();
        ROOM.steps.forEach((s) => s.show(true));
        api.sfx('build'); api.puff(11, 3, 37, 0xfde047, 12); api.servant(p, 3);
        api.toast('📜 The Scribe read the inscription: steps appeared up the gate tower!', 3000);
      }
    });

    // --- houses and stalls along the streets ---
    const house = (x, z, w, d, h) => {
      api.box({ x, z, w, d, h, color: stone });
      const lip = new T.Mesh(new T.BoxGeometry(w + 0.2, 0.2, d + 0.2), api.mat(dark)); lip.position.set(x, h, z); api.add(lip);
    };
    [[-14, 24, 6, 7, 4], [-14, 6, 6, 8, 3.6], [-14, -10, 6, 7, 4.2], [14, 26, 6, 6, 3.4], [14, 8, 6, 8, 4], [12, -26, 6, 7, 3.8], [-13, -28, 6, 6, 3.4]]
      .forEach(([x, z, w, d, h]) => house(x, z, w, d, h));
    [[6, 14, 0xb45309], [-6, 22, 0x2563eb], [7, 0, 0x16a34a], [-5, -16, 0x9333ea]].forEach(([x, z, cloth]) => {
      api.box({ x, z, w: 3.4, h: 1, d: 1.5, color: 0x8b5e34 });
      const aw = new T.Mesh(new T.BoxGeometry(3.8, 0.1, 2), api.mat(cloth)); aw.position.set(x, 2.2, z); api.add(aw);
    });

    // --- the well (the Fisherman nets a fragment from the bottom) ---
    api.stump(9, -12, 0.9, 1.1);
    const water = new T.Mesh(new T.CircleGeometry(0.85, 16), new T.MeshBasicMaterial({ color: 0x0c1a2e })); water.rotation.x = -Math.PI / 2; water.position.set(9, 0.92, -12); api.add(water);
    api.fragment({ x: 9, z: -12, y: -1.6, net: true });

    // --- the olive press: a turning beam (sweeper) guards a fragment beside the millstone ---
    const mill = new T.Mesh(new T.CylinderGeometry(1.4, 1.4, 0.5, 16), api.mat(0x9ca3af)); mill.position.set(-10, 0.25, -14); api.add(mill);
    api.sweeper({ x: -10, z: -14, length: 7, speed: 1.5 });
    api.fragment({ x: -10, z: -11.8, y: 1.1 });

    // --- the house with the large upper room ---
    api.box({ x: 0, z: -38, w: 12, d: 10, h: ROOM.TOP, color: stone });
    const door = new T.Mesh(new T.BoxGeometry(1.4, 2.2, 0.1), api.mat(0x3f2a16)); door.position.set(-2, 1.1, -32.95); api.add(door);
    for (let i = 0; i < 8; i++) api.box({ x: -6.9, z: -33.6 - i * 0.9, w: 1.6, d: 0.9, h: (i + 1) * ROOM.TOP / 8, color: 0xc2ad84 });
    const wall = (x, z, w, d) => api.box({ x, z, w, d, h: 1.1, y: ROOM.TOP, color: dark });
    wall(0, -42.8, 12, 0.4);                                           // back
    wall(5.8, -38, 0.4, 10);                                           // right
    wall(-5.8, -36.2, 0.4, 6.4);                                       // left (gap near the stairs)
    [[-5.8, -33.2], [5.8, -33.2], [-5.8, -42.8], [5.8, -42.8]].forEach(([x, z]) => {
      const pillar = new T.Mesh(new T.BoxGeometry(0.5, 2.8, 0.5), api.mat(dark)); pillar.position.set(x, ROOM.TOP + 1.4, z); api.add(pillar);
    });
    api.box({ x: ROOM.TABLE[0], z: ROOM.TABLE[1], w: 5, d: 1.4, h: 0.55, y: ROOM.TOP, color: 0x7a5230 });
    for (let i = 0; i < 6; i++) {
      [-1.3, 1.3].forEach((dz) => {
        const c = new T.Mesh(new T.BoxGeometry(0.7, 0.2, 0.7), api.mat([0xb91c1c, 0x1d4ed8, 0x15803d][i % 3])); c.position.set(-2.1 + i * 0.84, ROOM.TOP + 0.1, ROOM.TABLE[1] + dz); api.add(c);
      });
    }
    // things that appear on the table as they are brought
    const onTable = [];
    [[-1.8, 0x2563eb], [-0.9, 0xf5f5f4], [0, 0xd6a35c], [0.9, 0x7f1d1d], [1.8, 0xca8a04]].forEach(([dx, col]) => {
      const m = new T.Mesh(new T.CylinderGeometry(0.2, 0.18, 0.35, 10), api.mat(col)); m.position.set(dx, ROOM.TOP + 0.75, ROOM.TABLE[1]); m.visible = false; api.add(m); onTable.push(m);
    });

    // --- the five things to carry up ---
    const makeItem = (kind) => {
      const g = new T.Group();
      if (kind === 'jar') { const j = new T.Mesh(new T.CylinderGeometry(0.35, 0.5, 1.0, 12), api.mat(0xb45309)); g.add(j); }
      else if (kind === 'basin') { const b = new T.Mesh(new T.CylinderGeometry(0.55, 0.4, 0.3, 14), api.mat(0x94a3b8)); g.add(b); const tw = new T.Mesh(new T.BoxGeometry(0.9, 0.08, 0.4), api.mat(0xf5f5f4)); tw.position.y = 0.2; g.add(tw); }
      else if (kind === 'bread') { const b = new T.Mesh(new T.CylinderGeometry(0.5, 0.38, 0.35, 12), api.mat(0xa16207)); g.add(b); const l = new T.Mesh(new T.SphereGeometry(0.3, 8, 6), api.mat(0xe8b86d)); l.scale.y = 0.5; l.position.y = 0.22; g.add(l); }
      else if (kind === 'cup') { const c = new T.Mesh(new T.CylinderGeometry(0.22, 0.12, 0.4, 12), api.mat(0xa8a29e)); g.add(c); }
      else { const o = new T.Mesh(new T.SphereGeometry(0.35, 10, 8), api.mat(0xca8a04)); o.scale.y = 1.2; g.add(o); }
      return g;
    };
    const names = { jar: 'water jar', basin: 'basin and towel', bread: 'bread', cup: 'cup', oil: 'lamp oil' };
    [['jar', 10.6, -12.2, true], ['basin', -4, 8, false], ['bread', 6, 12, false], ['cup', -11.6, -3, false], ['oil', 3, -24, false]].forEach(([kind, x, z, heavy], i) => {
      const it = api.gatherable({ x, z, mesh: makeItem(kind), task: 'prepare', onGet(p) { api.servant(p, 5, 'for getting the room ready!'); } });
      it.slot = onTable[i];                                         // set on the table once someone is in the upper room
      ROOM.items.push(it);
    });

    // --- lamps in the upper room ---
    [[-4.4, -34.6], [4.4, -34.6], [-4.4, -41.4], [4.4, -41.4]].forEach(([x, z]) => {
      const stand = new T.Mesh(new T.CylinderGeometry(0.08, 0.12, 1.2, 6), api.mat(0x6b4a2b)); stand.position.set(x, ROOM.TOP + 0.6, z); api.add(stand);
      const flame = new T.Mesh(new T.SphereGeometry(0.16, 8, 6), new T.MeshBasicMaterial({ color: 0x57534e })); flame.position.set(x, ROOM.TOP + 1.32, z); api.add(flame);
      const L = { x, z, flame, lit: false };
      L.zone = api.zone({
        x, z, y: ROOM.TOP, r: 1.3, time: 1.2, color: 0xfacc15,
        onDone(helpers) {
          L.lit = true; flame.material.color.setHex(0xfde047); flame.scale.set(1, 1.6, 1);
          api.puff(x, ROOM.TOP + 1.3, z, 0xfde047, 8); api.task('lamps');
          helpers.forEach((p) => api.servant(p, 2));
        }
      });
      ROOM.lamps.push(L);
    });

    // --- the man with the water pitcher ---
    const man = person(0x854d0e, 0xf5f5f4, 1, { beard: true });
    const pitcher = new T.Mesh(new T.CylinderGeometry(0.22, 0.3, 0.55, 10), api.mat(0x1d4ed8)); pitcher.position.set(0, 1.9, 0); man.add(pitcher);
    man.position.set(ROOM.path[0][0], api.terrain(ROOM.path[0][0], ROOM.path[0][1]), ROOM.path[0][1]);
    api.add(man);
    ROOM.guide = { mesh: man, x: ROOM.path[0][0], z: ROOM.path[0][1] };

    // --- Golden Scroll challenge course up the side alley ---
    api.course([
      { x: -9, z: 19, top: 1.04, kind: 'block' },
      { x: -8.2, z: 15.6, top: 2.04, kind: 'float' },
      { x: -9, z: 12.2, top: 2.94, kind: 'crumble' },
      { x: -8.2, z: 8.8, top: 3.74, kind: 'crumble' },
      { x: -9, z: 5.4, top: 3.94, kind: 'float' },
      { x: -8.2, z: 2, top: 4.24, kind: 'spring' },
      { x: -9, z: -1.4, top: 8.44, kind: 'float' },
      { x: -8.2, z: -4.8, top: 9.04, kind: 'crumble' },
      { x: -9, z: -8.2, top: 9.64, kind: 'float' }
    ]);

    api.leaves([[0, 34], [0, 26], [-3, 18], [-7, 10], [-6, 4], [2, -2], [4, -10], [3, -16], [0, -22], [-2, -28],
      [8.8, 40.4, 5.8], [-10, -16.5], [-12, -11], [12, -16], [-7, -38, 2.2]]);
  },

  update(api, dt) {
    // the man walks ahead along the street, waits for the group, then goes into the house
    ROOM.items.forEach((it) => { if (it.got && !it.slot.visible && api.activePlayers().some(inUpperRoom)) { it.slot.visible = true; api.puff(it.slot.position.x, it.slot.position.y, it.slot.position.z, 0xfde68a, 6); } });
    const G = ROOM.guide;
    if (!ROOM.arrived) {
      const near = api.activePlayers().some((p) => Math.hypot(p.pos.x - G.x, p.pos.z - G.z) < 7);
      const tgt = ROOM.path[Math.min(ROOM.seg + 1, ROOM.path.length - 1)];
      const dx = tgt[0] - G.x, dz = tgt[1] - G.z, d = Math.hypot(dx, dz);
      if (near && d > 0.05) {
        const step = Math.min(d, 3.4 * dt);
        G.x += dx / d * step; G.z += dz / d * step;
        G.mesh.rotation.y = Math.atan2(dx, dz);
        G.mesh.position.y = api.terrain(G.x, G.z) + Math.abs(Math.sin(api.time * 8)) * 0.06;
      } else if (!near) {
        G.mesh.rotation.y += dt * 1.5;                                 // looks around for you
      }
      if (d <= 0.05 && ROOM.seg < ROOM.path.length - 2) ROOM.seg++;
      G.mesh.position.x = G.x; G.mesh.position.z = G.z;
      if (ROOM.seg >= ROOM.path.length - 2 && d <= 0.05 && near) {
        ROOM.arrived = true;
        G.mesh.visible = false;
        api.task('follow');
        api.activePlayers().forEach((p) => api.servant(p, 3));
        api.sfx('door');
        api.verse('The large upper room', 'And he shall shew you a large upper room furnished: there make ready.', 'Luke 22:12');
      }
    }
  },

  objective(api) {
    const ps = api.activePlayers();
    if (!ps.length) return null;
    const G = ROOM.guide;
    if (!ROOM.arrived) return [G.x, api.terrain(G.x, G.z) + 2.6, G.z];
    const cx = ps.reduce((s, p) => s + p.pos.x, 0) / ps.length, cz = ps.reduce((s, p) => s + p.pos.z, 0) / ps.length;
    const it = ROOM.items.filter((i) => !i.got).sort((a, b) => Math.hypot(a.x - cx, a.z - cz) - Math.hypot(b.x - cx, b.z - cz))[0];
    if (it) return [it.x, it.y + 1, it.z];
    const L = ROOM.lamps.find((l) => !l.lit);
    if (L) return ps.some(inUpperRoom) ? [L.x, ROOM.TOP + 0.5, L.z] : [-6.9, 2, -36];
    return null;
  },

  finale: {
    message: '🕯️ Everyone come into the upper room!',
    beacon: [0, 5.5, -38],
    inZone: inUpperRoom,
    onUpdate(api, t) {
      if (t > 0.5 && !ROOM.told) {
        ROOM.told = true;
        api.story([
          { art: '🧺', title: 'Jesus washes their feet', text: 'He riseth from supper, and laid aside his garments; and took a towel, and girded himself. After that he poureth water into a bason, and began to wash the disciples\' feet, and to wipe them with the towel wherewith he was girded.', ref: 'John 13:4–5' },
          ...(api.shownRef('John 13:15') ? [] : [{ art: '📜', title: 'Jesus did a servant\'s job', text: 'If I then, your Lord and Master, have washed your feet; ye also ought to wash one another\'s feet. For I have given you an example, that ye should do as I have done to you.', ref: 'John 13:14–15' }]),
          { art: '🍞', title: 'The bread', text: 'And he took bread, and gave thanks, and brake it, and gave unto them, saying, This is my body which is given for you: this do in remembrance of me.', ref: 'Luke 22:19' },
          { art: '🍷', title: 'The cup', text: 'Likewise also the cup after supper, saying, This cup is the new testament in my blood, which is shed for you.', ref: 'Luke 22:20' },
          { art: '🐑', title: 'The true Passover Lamb', text: 'Remember the Passover lamb in Egypt? Its blood on the door meant God\'s people were safe. Jesus is the true Lamb: "Christ our passover is sacrificed for us" (1 Corinthians 5:7). He was about to give His life for us.' },
          { art: '❤️', text: 'A new commandment I give unto you, That ye love one another; as I have loved you, that ye also love one another.', ref: 'John 13:34' }
        ], () => { ROOM.endT = api.time; });
      }
      return ROOM.endT !== undefined && api.time - ROOM.endT > 2;
    }
  }
};
