/* =====================================================================
 * LEVEL 7-2: ZACCHAEUS  (Luke 19:1-10)
 * ---------------------------------------------------------------------
 * The main street of Jericho, north (z 44) to south (z -44):
 *   The crowd   (z 34..14)  busy people jostle you (the Breastplate stands firm)
 *   The sycamore (8.5, 4)   climb the branches to see who is passing by
 *   The market  (z 0..-24)  pick up food and things on the way down the street to Zacchaeus' house
 *   His house   (0, -31)    Zacchaeus gives back fourfold: run the loop past the four neighbours' doors
 * Tasks: climb the sycamore; prepare his house; give back what he took.
 * Jesus is never shown: the cards tell what He said.
 * Only edit THIS file to change the level. See GEMINI.md and CAMPAIGN.md.
 * ===================================================================== */

const ZAC = {
  crowd: [],
  items: [],
  bags: [],
  steps: [],
  climbed: false,
  promised: false,
  TREE: [8.5, 4],
  TOP: 7.4,
  HOUSE: [0, -31],
  NEIGHBOURS: [[-11, -25.5], [11, -27], [-11, -34], [11, -34]]   // the houses round his: one quick loop
};

const LEVEL = {
  id: '7-2',
  bibleConnection: {"passage": "Luke 19:1–10", "text": "Zacchaeus climbed to see Jesus, welcomed Him and promised generous restitution. Jesus came to seek and save the lost. Our tree and repayment tasks explore his response; repayment does not buy salvation."},
  world: 'World 7-2',
  title: 'Zacchaeus',
  time: 'day',
  leafIcon: '🪙',
  leafColor: 0xfacc15,
  leafShape: 'round',
  spawn: [0, 42],
  bounds: { minX: -18, maxX: 18, minZ: -44, maxZ: 45 },
  approach: ['stones', 'log', 'crumbles'],   // the way in (engine): a stretch before the level's own start
  startMessage: 'The streets of Jericho are packed! Find a way to see who is coming.',

  intro: [
    { text: 'And Jesus entered and passed through Jericho.', ref: 'Luke 19:1' },
    { text: 'For the Son of man is come to seek and to save that which was lost.', ref: 'Luke 19:10' }
  ],

  introStory: [
    { art: '💰', title: 'A rich tax collector', text: 'And, behold, there was a man named Zacchæus, which was the chief among the publicans, and he was rich.', ref: 'Luke 19:2' },
    { art: '🌳', text: 'And he ran before, and climbed up into a sycomore tree to see him: for he was to pass that way.', ref: 'Luke 19:4' }
  ],

  tasks: [
    { id: 'climb', icon: '🌳', label: 'Climb the sycamore tree', total: 1 },
    { id: 'prepare', icon: '🍞', label: 'Make his house ready', total: 4, lockedUntil: 'climb' },
    { id: 'restore', icon: '💰', label: 'Give back fourfold', total: 4, lockedUntil: 'prepare' }
  ],

  memoryVerse: { text: 'For the Son of man is come to seek and to save that which was lost.', ref: 'Luke 19:10' },

  ending: {
    verse: { text: 'And Jesus said unto him, This day is salvation come to this house, forsomuch as he also is a son of Abraham.', ref: 'Luke 19:9' },
    message: 'Jesus came looking for Zacchaeus, and He comes looking for us too!'
  },

  quiz: [
    { q: 'Why did Zacchaeus climb a tree?', ref: 'Luke 19:3', options: ['To pick fruit', 'He was short and the crowd was in the way', 'To hide from the soldiers'], answer: 1 },
    { q: 'What did Jesus say to Zacchaeus?', ref: 'Luke 19:5', options: ['"Come down; I must abide at thy house"', '"Stay up there"', '"Go away"'], answer: 0 },
    { q: 'How much did Zacchaeus give back to people he cheated?', ref: 'Luke 19:8', options: ['Nothing', 'The same amount', 'Four times as much'], answer: 2 }
  ],

  music: {
    bpm: 112,
    notes: [67, 0, 69, 71, 72, 0, 71, 69, 67, 0, 64, 0, 67, 0, 0, 0,
            69, 0, 71, 72, 74, 0, 72, 71, 69, 67, 66, 0, 67, 0, 0, 0],
    bass: [43, 43, 48, 48, 50, 50, 43, 43]
  },

  /* ---------- ground shape ---------- */
  terrain(x, z) {
    return Math.sin(x * 0.4) * Math.cos(z * 0.3) * 0.12 + (Math.abs(x) > 15 ? (Math.abs(x) - 15) * 1.2 : 0);
  },

  groundColor(x, z) {
    if (Math.abs(x) < 3.5) return (Math.floor(z / 1.5) + Math.floor(x / 1.5)) % 2 ? 0xcdb48c : 0xc2a87f;   // paved street
    if (Math.abs(x) < 3.9) return 0x9c8865;                                                                // the kerb
    return Math.sin(x * 1.1) * Math.cos(z * 0.9) > 0.35 ? 0xb09968 : 0xb9a274;
  },

  /* ---------- build ---------- */
  build(api) {
    const T = api.THREE;
    const person = (robe, scarf, s, o) => api.person(robe, scarf, s, o);   // friendly round townsfolk (engine)
    const ROBES = [0x9a3412, 0x1d4ed8, 0x15803d, 0x7c3aed, 0xb45309, 0x0e7490, 0xbe123c, 0x4d7c0f];

    // --- houses along the street ---
    ZAC.houses = [[-11, 30], [-11, 6], [-11, -8], [-11, -20], [11, 30], [11, 20], [11, -14], [11, -22]].map(([x, z], i) =>
      ({ x, z, box: api.box({ x, z, w: 5, d: 5, h: 3.2, color: i % 2 ? 0xe2d1ad : 0xd8c39c }) }));
    // palm trees (Jericho, the city of palm trees)
    [[-15, 38], [15, 38], [-15, 0], [15, 8], [15, -32], [-15, -30]].forEach(([x, z]) => api.tree(x, z, 1.1, 0x4d7c0f));

    // --- the crowd: busy people crossing the street ---
    [32, 28, 24, 20, 16].forEach((z, i) => {
      for (let k = 0; k < 2; k++) {
        const m = api.crowdPerson(i * 3 + k, ROBES[(i * 2 + k) % ROBES.length], 0xf5f5f4); api.add(m);
        ZAC.crowd.push({ mesh: m, z: z + (k ? 1.2 : -1.2), phase: i * 1.7 + k * 3.1, speed: 0.7 + ((i + k) % 3) * 0.25 });
      }
    });
    api.armor('breastplate', -6, 36);                                    // stand firm in the crowd

    // --- the sycamore tree: a climbing route up its branches ---
    const [tx, tz] = ZAC.TREE;
    ZAC.trunk = api.box({ x: tx, z: tz, w: 0.9, d: 0.9, h: ZAC.TOP - 0.5, color: 0x6b4f2a });                      // trunk
    ZAC.lookout = api.box({ x: tx, z: tz, w: 2.4, d: 2.4, h: 0.5, y: ZAC.TOP - 0.5, color: 0x7c5a32 });              // the lookout branch
    ZAC.branches = [];
    const branch = [[6.9, 5.6, 1.0, 'block'], [6.7, 3.0, 2.1], [8.5, 1.6, 3.2], [10.7, 2.6, 4.3, 'crumble'], [11.0, 5.6, 5.4], [8.7, 6.4, 6.5]];
    branch.forEach(([x, z, top, kind]) => {
      if (kind === 'crumble') api.crumble({ x, z, top });
      else if (kind === 'block') ZAC.branches.push({ x, z, top, box: api.box({ x, z, w: 1.6, d: 1.6, h: top, color: 0x7c5a32 }) });
      else ZAC.branches.push({ x, z, top, box: api.box({ x, z, w: 1.6, d: 1.6, h: 0.35, y: top - 0.35, color: 0x7c5a32 }) });
    });
    // (the canopy is dressed in LEVEL._dress)
    ZAC.zone = api.zone({
      x: tx, z: tz, y: ZAC.TOP, r: 1.2, time: 1.5, color: 0x22c55e,
      onDone() {
        ZAC.climbed = true;
        ZAC.items.forEach((it) => { it.hidden = false; });
        api.task('climb');
        api.story([
          { art: '👀', text: 'And when Jesus came to the place, he looked up, and saw him, and said unto him, Zacchæus, make haste, and come down; for to day I must abide at thy house.', ref: 'Luke 19:5' }
        ], () => LEVEL._hurryHome(api) || api.toast('🍞 Jesus knew his name! Hurry down the street to his house, picking up food and things from the market on the way.', 4500));
      }
    });

    // --- the market: things to make the house ready ---
    const thing = (kind) => {
      const g = new T.Group();
      if (kind === 'bread') { const b = new T.Mesh(new T.CylinderGeometry(0.45, 0.35, 0.35, 12), api.mat(0xa16207)); g.add(b); const l = new T.Mesh(new T.SphereGeometry(0.3, 8, 6), api.mat(0xd4a056)); l.position.y = 0.25; g.add(l); }
      else if (kind === 'jar') { const j = new T.Mesh(new T.CylinderGeometry(0.35, 0.5, 1.0, 12), api.mat(0xb45309)); g.add(j); }
      else if (kind === 'cushion') { const c = new T.Mesh(new T.BoxGeometry(0.9, 0.3, 0.9), api.mat(0x7c3aed)); g.add(c); }
      else { const f = new T.Mesh(new T.SphereGeometry(0.35, 10, 8), api.mat(0x65a30d)); g.add(f); const f2 = new T.Mesh(new T.SphereGeometry(0.3, 10, 8), api.mat(0x9333ea)); f2.position.set(0.3, 0.1, 0.2); g.add(f2); }
      return g;
    };
    // picked up on the way down the street (no back-and-forth): the house is ready when you get there
    [['bread', 2, -6], ['jar', -2, -14], ['cushion', 4, -18], ['fruit', -1, -22]].forEach(([kind, x, z]) => {
      const it = api.gatherable({ x, z, mesh: thing(kind), task: 'prepare', onGet(p) { api.servant(p, 5, 'for getting ready for a guest!'); } });
      it.hidden = true;                                                   // collectable after the climb
      ZAC.items.push(it);
    });
    ZAC.stalls = [[-4, -4], [5, -12], [-4.5, -17]].map(([x, z], i) => {               // market stalls
      const box = api.box({ x, z, w: 1.6, d: 1.2, h: 0.9, color: 0x92400e });
      const awn = new T.Mesh(new T.BoxGeometry(2, 0.1, 1.6), api.texMat([0xfbbf24, 0xc2410c, 0x0e7490][i], 'cloth')); awn.position.set(x, 2.2, z); api.add(awn);
      return { x, z, box };
    });

    // --- Zacchaeus' house ---
    const [hx, hz] = ZAC.HOUSE;
    ZAC.house = api.box({ x: hx, z: hz - 7, w: 12, d: 6, h: 4, color: 0xf0e2c0 });
    const door = new T.Mesh(new T.BoxGeometry(1.6, 2.4, 0.1), api.mat(0x78350f)); door.position.set(hx, 1.2, hz - 3.95); api.add(door);
    const table = new T.Mesh(new T.BoxGeometry(3, 0.15, 1.4), api.mat(0x8b5e34)); table.position.set(hx, 0.75, hz); api.add(table);

    // --- the money bags: Zacchaeus gives back fourfold ---
    ZAC.NEIGHBOURS.forEach(([nx, nz], i) => {
      const n = api.storyPerson(ROBES[(i * 3 + 1) % ROBES.length], 0xe7e5e4, 0.98, { beard: i % 2 === 0, age: i === 2 ? 'elder' : undefined }); n.position.set(nx, api.terrain(nx, nz), nz); n.rotation.y = nx < 0 ? 1.2 : -1.2; api.add(n);
      (ZAC.neighbours = ZAC.neighbours || []).push(n);
      const g = new T.Group();
      const sack = new T.Mesh(new T.SphereGeometry(0.4, 10, 8), api.mat(0xa16207)); sack.scale.y = 0.85; g.add(sack);
      const tie = new T.Mesh(new T.CylinderGeometry(0.12, 0.2, 0.25, 8), api.mat(0x854d0e)); tie.position.y = 0.38; g.add(tie);
      g.position.set(nx + 0.7, api.terrain(nx, nz) + 0.35, nz + 0.4); g.visible = false; api.add(g);
      ZAC.bags.push({ x: nx, z: nz, y: api.terrain(nx, nz), mesh: g, paid: false });   // paid by running past once he has promised
    });

    // --- fragment 1: the turning market beam ---
    api.sweeper({ x: -10, z: -1.2, length: 6, speed: 1.6 });
    api.fragment({ x: -10, z: -1.2, y: api.terrain(-10, -1.2) + 1.3 });

    // --- fragment 2: the Builder fixes the steps up to a rooftop ---
    const RX = -11, RZ = 18;
    ZAC.roofHouse = api.box({ x: RX, z: RZ, w: 5, d: 5, h: 3.2, color: 0xe2d1ad });
    api.fragment({ x: RX, z: RZ, y: 3.2 + 1.3 });
    [[-6.6, 22.4, 1.1], [-8.8, 22.0, 2.2]].forEach(([x, z, top]) => ZAC.steps.push(api.box({ x, z, w: 1.6, d: 1.6, h: 0.35, y: top - 0.35, hidden: true, color: 0xa0703c })));
    const wood = new T.Mesh(new T.BoxGeometry(1.4, 0.4, 1), api.mat(0xa0703c)); wood.position.set(-6, 0.2, 25.4); api.add(wood);
    api.interact({
      x: -6, z: 25.4, r: 2.2, label: 'Fix steps',
      can: (p) => (p.role.id === 'builder' ? true : 'Broken steps. The Builder could fix them (Tab / RB to switch).'),
      use(p) {
        this.remove(); wood.visible = false;
        ZAC.steps.forEach((s) => s.show(true));
        api.sfx('build'); api.servant(p, 3);
        api.toast('🔨 The Builder fixed the steps up to the roof!', 2500);
      }
    });

    // --- fragment 3: a spring cart up onto a high rooftop ---
    ZAC.highHouse = api.box({ x: 12.5, z: 12, w: 4, d: 4, h: 4.4, color: 0xd8c39c });
    api.spring({ x: 12.5, z: 8.9 });
    api.fragment({ x: 12.5, z: 12, y: 4.4 + 1.3 });

    // --- Golden Scroll challenge course: along the west side of the market ---
    const plan = [['block', 1.0], ['float', 1.0], ['crumble', 0.9], ['float', 0.8], ['spring', 0.2], ['float', 4.2], ['crumble', 0.6], ['float', 0.6]];
    let ctop = 0;
    api.course(plan.map(([kind, rise], i) => {
      const z = -12 - i * 2.9, x = -5.6 + (i % 2 ? 0.3 : -0.3);
      ctop = i === 0 ? api.terrain(x, z) + 1.0 : ctop + rise;
      return { x, z, top: ctop, kind };
    }));

    api.leaves([[0, 36], [-2, 26], [2, 18], [0, 10], [6.7, 3.0, 2.1 + 0.9], [11.0, 5.6, 5.4 + 0.9], [-8, 0], [1, -10], [-1, -18], [3, -28],
      [-6.6, 22.4, 1.1 + 0.9], [8, 30], [-8, -14]]);
    LEVEL._dress(api);
  },

  update(api, dt) {
    // the crowd shuffles back and forth across the street, jostling anyone in the way
    ZAC.crowd.forEach((c) => {
      c.phase += dt * c.speed;
      const x = Math.sin(c.phase) * 3.2;
      c.mesh.position.set(x, api.terrain(x, c.z) + Math.abs(Math.sin(c.phase * 6)) * 0.05, c.z);
      c.mesh.rotation.y = Math.cos(c.phase) > 0 ? Math.PI / 2 : -Math.PI / 2;
      api.activePlayers().forEach((p) => {
        const dx = p.pos.x - x, dz = p.pos.z - c.z, d = Math.hypot(dx, dz);
        if (d < 1.2 && p.pos.y < api.terrain(x, c.z) + 1) {
          api.push(p, (dx / (d || 1)) * 6 + Math.cos(c.phase) * 3, (dz / (d || 1)) * 6 + 2.5, dt);
          if (!ZAC.toldPush) { ZAC.toldPush = true; api.toast('👥 The crowd is pushing! The Breastplate helps you stand firm.', 3000); }
        }
      });
    });
    LEVEL._poses(api, dt);
    // the house is ready: the people grumble, and Zacchaeus makes a promise
    if (!ZAC.promised && api.taskDone('prepare') && api.near(ZAC.HOUSE[0], ZAC.HOUSE[1], 7).length) {
      ZAC.promised = true;
      api.story([
        { art: '💛', title: 'The crowd grumbled, but Zacchaeus changed', text: 'And Zacchæus stood, and said unto the Lord; Behold, Lord, the half of my goods I give to the poor; and if I have taken any thing from any man by false accusation, I restore him fourfold.', ref: 'Luke 19:8' }
      ], () => api.toast('💰 Jesus changed his heart! Run past the four neighbours\' doors to give back four times what he took.', 4500));
    }
    if (ZAC.promised && !api.taskDone('restore')) {
      ZAC.bags.forEach((b) => {
        if (b.paid) return;
        const p = api.near(b.x, b.z, 2.2)[0];
        if (!p) return;
        b.paid = true; b.mesh.visible = true;
        api.task('restore'); api.sfx('coin'); api.puff(b.x, b.y + 1.2, b.z, 0xfacc15, 12);
        api.servant(p, 6, 'for making things right!');
      });
    }
  },

  /* ---------- presentation only: nothing here is solid, and no rule changes. Jesus is never shown. ---------- */
  _dress(api) {
    const T = api.THREE, g = new T.Group();
    const M = (geo, mat, x, y, z, parent) => { const m = new T.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true; (parent || g).add(m); return m; };
    const B = (w, h, d, mat, x, y, z) => M(new T.BoxGeometry(w, h, d), mat, x, y, z);
    const bark = api.texMat(0x6e5236, 'bark'), plaster = api.texMat(0xe2cfa6, 'clay'), plaster2 = api.texMat(0xd6c098, 'clay'), trim = api.texMat(0xb79c72, 'clay'), wood = api.texMat(0x6b4a2c, 'wood'), dark = new T.MeshLambertMaterial({ color: 0x24190f });
    // the sycomore: a thick trunk with spreading limbs out to each branch you can stand on, and a wide canopy
    const [tx, tz] = ZAC.TREE;
    ZAC.trunk.mesh.visible = false;
    M(new T.CylinderGeometry(0.55, 0.95, ZAC.TOP - 0.3, 12), bark, tx, (ZAC.TOP - 0.3) / 2, tz);
    for (let i = 0; i < 5; i++) { const a = i / 5 * Math.PI * 2, r = M(new T.CylinderGeometry(0.12, 0.3, 1.4, 6), bark, tx + Math.cos(a) * 0.9, 0.25, tz + Math.sin(a) * 0.9); r.rotation.set(Math.sin(a) * 1.2, 0, -Math.cos(a) * 1.2); }   // roots
    const limb = (x, y, z) => { const a = new T.Vector3(tx, Math.max(1.2, y - 1.4), tz), b = new T.Vector3(x, y - 0.2, z), v = b.clone().sub(a), m = M(new T.CylinderGeometry(0.16, 0.28, v.length(), 8), bark, 0, 0, 0); m.position.copy(a).addScaledVector(v, 0.5); m.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), v.normalize()); };
    ZAC.branches.forEach((b) => { b.box.mesh.material = bark; if (b.top > 1.5) limb(b.x, b.top, b.z); });
    limb(10.7, 4.3, 2.6); limb(10.8, 6.9, 7.4);
    ZAC.lookout.mesh.material = bark;
    const leaves = [0x35632a, 0x2f5a24, 0x3f7030].map((c) => new T.MeshLambertMaterial({ color: c }));
    ZAC.canopy = [];
    [[5.5, 8.6, 1.5, 1.5], [11.8, 7.8, 0.5, 1.4], [12.6, 8.6, 4, 1.5], [9, 9, -0.6, 1.6], [7, 8.2, -1, 1.3], [4.6, 8.0, 5.2, 1.3], [12.4, 8.2, 7.6, 1.4], [8.4, 9.6, 2.2, 1.7], [10.2, 9.4, 5.4, 1.5]].forEach(([x, y, z, r], i) => {
      const c = new T.Mesh(new T.SphereGeometry(r, 12, 9), leaves[i % 3]); c.scale.y = 0.7; c.position.set(x, y, z); c.castShadow = true; api.add(c); api.fadeScenery(c, 2.2); ZAC.canopy.push(c);
    });
    // houses: plaster, doors, windows, roof edges and a few awnings
    const dress = (x, z, w, d, h, side) => {
      const f = x + side * w / 2;                                      // the face toward the street
      B(w + 0.24, 0.2, d + 0.24, trim, x, h - 0.02, z);
      B(0.06, 1.85, 0.95, wood, f + side * 0.03, 0.93, z - 0.9);
      B(0.18, 0.14, 1.25, wood, f + side * 0.08, 1.92, z - 0.9);
      B(0.05, 0.55, 0.62, dark, f + side * 0.03, 2.05, z + 1.1);
    };
    ZAC.houses.forEach((hh, i) => { hh.box.mesh.material = i % 2 ? plaster : plaster2; dress(hh.x, hh.z, 5, 5, 3.2, hh.x < 0 ? 1 : -1); });
    [ZAC.roofHouse, ZAC.highHouse].forEach((b) => { b.mesh.material = plaster; });
    ZAC.stalls.forEach((st) => { st.box.mesh.material = wood; [-0.9, 0.9].forEach((dx) => [-0.7, 0.7].forEach((dz) => B(0.08, 2.2, 0.08, wood, st.x + dx, 1.1, st.z + dz))); });
    // Zacchaeus' house: a rich man's house, with a parapet, columns and a laid table
    const [hx, hz] = ZAC.HOUSE;
    ZAC.house.mesh.material = api.texMat(0xefe0bd, 'clay');
    B(12.4, 0.5, 6.4, trim, hx, 4.15, hz - 7);
    for (let x = hx - 5.6; x <= hx + 5.7; x += 1.4) B(0.6, 0.45, 0.4, trim, x, 4.6, hz - 4.1);
    [-2.4, 2.4].forEach((dx) => { M(new T.CylinderGeometry(0.22, 0.25, 3.6, 12), api.texMat(0xf3e9d2, 'stone'), hx + dx, 1.8, hz - 3.5); B(0.6, 0.2, 0.6, api.texMat(0xc9a961, 'gold'), hx + dx, 3.7, hz - 3.5); });
    [-4.2, 4.2].forEach((dx) => B(1.0, 0.8, 0.06, dark, hx + dx, 2.4, hz - 3.97));
    B(1.9, 0.12, 2.6, api.texMat(0x8a2d3b, 'cloth'), hx, 0.06, hz - 2.6);                       // a welcome mat of cloth
    const food = [[0xd4a056, -0.9], [0x9333ea, -0.3], [0x65a30d, 0.3], [0xe0b070, 0.9]];
    food.forEach(([c, dx]) => M(new T.SphereGeometry(0.16, 8, 6), new T.MeshLambertMaterial({ color: c }), hx + dx, 0.92, hz));
    [-1.8, 1.8].forEach((dx) => B(0.8, 0.25, 0.8, api.texMat(0x7c3aed, 'cloth'), hx + dx, 0.12, hz + 0.4));   // cushions
    api.scenery(g);
    // Jericho, the city of palm trees
    [['PalmTree_1', -16.2, 26, 7], ['PalmTree_3', 16.4, 26, 6.5], ['PalmTree_2', -16.4, -2, 7], ['PalmTree_4', 16.2, -6, 6.5], ['PalmTree_1', -16, -40, 7], ['PalmTree_3', 16.2, -40, 6.5]].forEach(([n, x, z, h]) => { const m = api.model(n, h); if (!m) return; const t = new T.Group(); t.position.set(x, api.terrain(x, z), z); t.rotation.y = x * 1.3 + z; t.add(m); api.add(t); api.fadeScenery(t, 2.6); });
    // Zacchaeus himself: "little of stature" (Luke 19:3), a rich man's robe
    const zac = api.storyPerson(0x7a1f4a, 0xf3d36b, 0.8, { beard: true, register: false });
    const sash = new T.Mesh(new T.TorusGeometry(0.37, 0.05, 6, 18), api.texMat(0xd4a017, 'gold')); sash.rotation.x = Math.PI / 2; sash.position.y = 0.6; zac.userData.storyActor.body.add(sash);
    zac.position.set(5.0, api.terrain(5.0, 8.6), 8.6); zac.rotation.y = 2.4; api.add(zac); ZAC.zac = zac; ZAC.zacAt = 'street';
    // a fruit seller who knows what is happening (optional; just for our game)
    const seller = api.storyPerson(0x9a3412, 0xfde68a, 1, { beard: true }); seller.position.set(6.6, api.terrain(6.6, -12.6), -12.6); seller.rotation.y = -1.2; api.add(seller); ZAC.seller = seller;
    ZAC.sellerTalk = api.conversation({
      person: seller, speaker: 'Fruit seller', label: 'Talk with the fruit seller',
      clue(api) {
        if (!ZAC.climbed) return { text: 'Everyone wants to see who is coming, but the crowd is so thick! Up in a tree you could see.', at: [ZAC.TREE[0], ZAC.TOP + 1.5, ZAC.TREE[1]] };
        if (!api.taskDone('prepare')) { const it = ZAC.items.find((x) => !x.got); return { text: 'A guest at Zacchaeus\' house! Pick up bread and things on your way down the street.', at: it ? [it.x, it.y + 1, it.z] : undefined }; }
        if (!ZAC.promised) return { text: 'Hurry along to his house, at the end of the street.', at: [ZAC.HOUSE[0], 2, ZAC.HOUSE[1]] };
        const b = ZAC.bags.find((x) => !x.paid);
        return b ? { text: 'Zacchaeus is giving back four times what he took! Run past the neighbours\' doors.', at: [b.x, b.y + 1, b.z] } : { text: 'Zacchaeus is a changed man!' };
      }
    });
  },

  // After "make haste, and come down" (Luke 19:5–6) he is home, welcoming his guest.
  _hurryHome(api) {
    const z = ZAC.zac; if (!z) return false;
    z.position.set(ZAC.HOUSE[0] + 2.4, api.terrain(ZAC.HOUSE[0] + 2.4, ZAC.HOUSE[1] - 2.6), ZAC.HOUSE[1] - 2.6); z.rotation.y = -0.3; ZAC.zacAt = 'home';
    return false;
  },

  _poses(api, dt) {
    const t = api.time, z = ZAC.zac;
    if (z) {
      if (ZAC.zacAt === 'street' && ZAC.climbed) { z.position.set(10.9, 6.85, 7.3); z.rotation.y = 2.9; ZAC.zacAt = 'tree'; }   // up in his tree while the family looks too
      if (ZAC.zacAt === 'street') { z.position.y = api.terrain(z.position.x, z.position.z) + Math.max(0, Math.sin(t * 6)) * 0.3; api.posePerson(z, { dt, expression: 'listen', headPitch: -0.3 }); }   // hopping to see over the crowd
      else if (ZAC.zacAt === 'tree') api.posePerson(z, { dt, expression: 'wonder', headPitch: 0.25 });
      else api.posePerson(z, { dt, expression: ZAC.promised ? 'wonder' : 'calm', cheer: api.taskDone('restore') && t % 6 < 2, talking: ZAC.promised && !api.taskDone('restore') && t % 4 < 2 });
    }
    (ZAC.neighbours || []).forEach((n, i) => api.posePerson(n, { dt, expression: ZAC.bags[i] && ZAC.bags[i].paid ? 'wonder' : ZAC.promised ? 'listen' : 'worry', cheer: ZAC.bags[i] && ZAC.bags[i].paid && t % 7 < 1.6 }));
    if (ZAC.seller) api.posePerson(ZAC.seller, { dt, expression: 'calm' });
  },

  objective(api) {
    const ps = api.activePlayers();
    if (!ps.length) return null;
    const [tx, tz] = ZAC.TREE;
    if (!ZAC.climbed) return [tx, ZAC.TOP + 1.5, tz];
    const list = ZAC.promised ? ZAC.bags.filter((b) => !b.paid) : ZAC.items.filter((i) => !i.got);
    const cx = ps.reduce((s, p) => s + p.pos.x, 0) / ps.length, cz = ps.reduce((s, p) => s + p.pos.z, 0) / ps.length;
    const it = list.sort((a, b) => Math.hypot(a.x - cx, a.z - cz) - Math.hypot(b.x - cx, b.z - cz))[0];
    if (it) return [it.x, it.y + 1, it.z];
    return [ZAC.HOUSE[0], 2, ZAC.HOUSE[1]];
  },

  finale: {
    message: '🏠 Everyone gather at Zacchaeus\' house!',
    beacon: [0, 3, -31],
    inZone(p) { return Math.hypot(p.pos.x - ZAC.HOUSE[0], p.pos.z - ZAC.HOUSE[1]) < 6; },
    onUpdate(api, t) {
      if (t > 0.5 && !ZAC.told) {
        ZAC.told = true;
        api.story([
          { art: '🏠', text: 'And Jesus said unto him, This day is salvation come to this house, forsomuch as he also is a son of Abraham.', ref: 'Luke 19:9' },
          ...(api.shownRef('Luke 19:10') ? [] : [{ art: '🔎', text: 'For the Son of man is come to seek and to save that which was lost.', ref: 'Luke 19:10' }]),
          { art: '✝️', title: 'Found by Jesus', text: 'Zacchaeus did not give money back to earn Jesus\' love. Jesus came to him first, and that changed his heart. Jesus came looking for us too, and He went to the cross to save the lost.' }
        ], () => { ZAC.endT = api.time; });
      }
      return ZAC.endT !== undefined && api.time - ZAC.endT > 2;
    }
  }
};
