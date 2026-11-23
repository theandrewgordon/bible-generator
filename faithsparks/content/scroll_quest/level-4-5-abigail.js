/* =====================================================================
 * LEVEL 4-5: ABIGAIL'S PEACE MISSION  (1 Samuel 25)
 * ---------------------------------------------------------------------
 * Carmel's hills. Walk toward -z, downhill:
 *   The household (z 42..26)  Abigail makes haste: load the provisions as you pass (a table, a cart,
 *                             a roof step, the corn sacks); they go onto the donkeys
 *   The hill path (z 24..-28) the donkey train walks down the winding path while someone is near it
 *                             (it waits for you); run ahead to clear the way: a gate latch, a stone,
 *                             planks over a gully, each up on a little ledge
 *   The meeting   (0, -32)    Abigail meets David and asks for peace (told on cards)
 * Nobody fights: David's anger and the danger stay in the story cards. The peacemaker is Abigail; the
 * players help her provisions get there.
 * Only edit THIS file to change the level. See GEMINI.md and CAMPAIGN.md.
 * ===================================================================== */

const ABI = {
  goods: [],
  donkeys: [],
  blocks: [],
  steps: [],
  PATH: [[0, 24], [9, 15], [-8, 3], [8, -9], [-6, -19], [0, -28]],
  segs: [], len: 0,
  s: 0, moving: false,
  MEET: [0, -31],
  told: false
};
(function () {
  for (let i = 0; i + 1 < ABI.PATH.length; i++) {
    const a = ABI.PATH[i], b = ABI.PATH[i + 1], d = Math.hypot(b[0] - a[0], b[1] - a[1]);
    ABI.segs.push({ a, b, d, s0: ABI.len }); ABI.len += d;
  }
})();
function abiAt(s) {
  s = Math.max(0, Math.min(ABI.len, s));
  for (const g of ABI.segs) if (s <= g.s0 + g.d) { const k = (s - g.s0) / g.d; return [g.a[0] + (g.b[0] - g.a[0]) * k, g.a[1] + (g.b[1] - g.a[1]) * k, Math.atan2(g.b[0] - g.a[0], g.b[1] - g.a[1])]; }
  const g = ABI.segs[ABI.segs.length - 1]; return [g.b[0], g.b[1], 0];
}
// Project onto the actual winding path: a scout ahead is allowed, a family member behind is not.
function abiProgress(x, z) {
  let best = { s: 0, distance: Infinity };
  for (const g of ABI.segs) {
    const dx = g.b[0] - g.a[0], dz = g.b[1] - g.a[1];
    const k = Math.max(0, Math.min(1, ((x - g.a[0]) * dx + (z - g.a[1]) * dz) / (g.d * g.d)));
    const distance = Math.hypot(x - g.a[0] - dx * k, z - g.a[1] - dz * k);
    if (distance < best.distance) best = { s: g.s0 + k * g.d, distance };
  }
  return best;
}
function abiHill(z) { return z > 24 ? 3 : z < -28 ? 0 : (z + 28) / 52 * 3; }

const LEVEL = {
  id: '4-5',
  bibleConnection: {"passage": "1 Samuel 25", "text": "Abigail brought food and urged David to stop his planned bloodshed against Nabal’s household. David listened and thanked God for sending her. Our path-clearing and donkey journey imagine that mission of wise peacemaking."},
  world: 'World 4-5',
  title: 'Abigail\'s Peace Mission',
  leafIcon: '🌸',
  leafColor: 0xf9a8d4,
  leafShape: 'round',
  spawn: [0, 42],
  bounds: { minX: -19, maxX: 19, minZ: -38, maxZ: 46 },
  approach: ['stones', 'meadow:ox', 'mover'],   // the way in (engine): a stretch before the level's own start
  startMessage: 'Abigail makes haste! Load the food onto the donkeys as you pass through the house.',

  intro: [
    { text: 'Then Abigail made haste, and took two hundred loaves, and two bottles of wine, and five sheep ready dressed, and five measures of parched corn, and an hundred clusters of raisins, and two hundred cakes of figs, and laid them on asses.', ref: '1 Samuel 25:18' },
    { text: 'Blessed are the peacemakers: for they shall be called the children of God.', ref: 'Matthew 5:9' }
  ],

  introStory: [
    { art: '😠', title: 'Trouble is coming', text: 'David and his men had protected Nabal\'s shepherds. But when David asked for food, Nabal answered rudely and sent his men away. David was angry and set out to take revenge. A servant ran to tell Nabal\'s wife, Abigail.' },
    { art: '🫏', title: 'Abigail made haste', text: 'Then Abigail made haste, and took two hundred loaves, and two bottles of wine, and five sheep ready dressed, and five measures of parched corn, and an hundred clusters of raisins, and two hundred cakes of figs, and laid them on asses.', ref: '1 Samuel 25:18' }
  ],

  tasks: [
    { id: 'load', icon: '🧺', label: 'Load the food onto the donkeys', total: 4 },
    { id: 'way', icon: '🪨', label: 'Clear the way down the hill', total: 3, lockedUntil: 'load' }
  ],

  memoryVerse: { text: 'Blessed are the peacemakers: for they shall be called the children of God.', ref: 'Matthew 5:9' },

  ending: {
    verse: { text: 'A soft answer turneth away wrath:', ref: 'Proverbs 15:1' },
    message: 'Abigail\'s humble, wise words turned David away from revenge. God sent her to make peace.'
  },

  quiz: [
    { q: 'What did Abigail do when she heard David was coming?', ref: '1 Samuel 25:18', options: ['She hid', 'She made haste and brought food', 'She ran away'], answer: 1 },
    { q: 'What did Abigail keep David from doing?', ref: '1 Samuel 25:33', options: ['Avenging himself with his own hand', 'Becoming king', 'Eating'], answer: 0 },
    { q: 'Who are called the children of God?', ref: 'Matthew 5:9', options: ['The strongest', 'The peacemakers', 'The richest'], answer: 1 }
  ],

  music: {
    bpm: 96,
    notes: [65, 0, 69, 72, 70, 0, 69, 67, 65, 0, 64, 0, 65, 0, 0, 0,
            65, 0, 69, 72, 74, 0, 72, 70, 69, 67, 65, 0, 65, 0, 0, 0],
    bass: [41, 41, 46, 46, 48, 48, 41, 41]
  },

  terrain(x, z) { return abiHill(z) + Math.sin(x * 0.3) * Math.cos(z * 0.22) * 0.1; },
  groundColor(x, z, h) {
    for (const g of ABI.segs) {
      const vx = g.b[0] - g.a[0], vz = g.b[1] - g.a[1], k = Math.max(0, Math.min(1, ((x - g.a[0]) * vx + (z - g.a[1]) * vz) / (g.d * g.d)));
      if (Math.hypot(x - g.a[0] - vx * k, z - g.a[1] - vz * k) < 1.5) return 0xb89466;      // the path
    }
    return (Math.floor(x / 3) + Math.floor(z / 3)) % 2 ? 0x8fbf5a : 0x86b552;
  },

  /* ---------- build ---------- */
  build(api) {
    const T = api.THREE;
    const H = (x, z) => api.terrain(x, z);

    // --- the household: provisions picked up on the way ---
    api.box({ x: -11, z: 38, w: 6, d: 6, h: 3.2, color: 0xd1bb92 });
    api.box({ x: 11, z: 36, w: 6, d: 6, h: 3.4, color: 0xd1bb92 });
    api.box({ x: -6, z: 36, w: 2.2, d: 1.4, h: 1.1, color: 0x8b5e34 });                         // a table
    api.box({ x: 6, z: 33, w: 2.4, d: 1.6, h: 1.2, color: 0x7a5230 });                          // a cart
    api.box({ x: -7.6, z: 31, w: 1.6, d: 1.6, h: 1.1, color: 0x8b6b45 });                       // a step up to a roof shelf
    api.box({ x: -10.4, z: 30, w: 3, d: 3, h: 2.2, color: 0xc9b089, house: false });
    const food = (kind) => {
      const g = new T.Group();
      if (kind === 'loaves') for (let k = 0; k < 3; k++) { const b = new T.Mesh(new T.SphereGeometry(0.22, 8, 6), api.mat(0xd4a056)); b.scale.y = 0.6; b.position.set(k * 0.3 - 0.3, 0, 0); g.add(b); }
      else if (kind === 'raisins') { const b = new T.Mesh(new T.SphereGeometry(0.3, 10, 8), api.mat(0x6b21a8)); g.add(b); }
      else if (kind === 'figs') { const b = new T.Mesh(new T.CylinderGeometry(0.3, 0.3, 0.2, 12), api.mat(0x9a3412)); g.add(b); }
      else { const b = new T.Mesh(new T.SphereGeometry(0.34, 10, 8), api.texMat(0xd6b98a, 'cloth')); g.add(b); }
      return g;
    };
    [['loaves', -6, 36], ['raisins', 6, 33], ['figs', -10.4, 30], ['corn', 4, 27]].forEach(([k, x, z]) =>
      ABI.goods.push(api.gatherable({ x, z, mesh: food(k), task: 'load', onGet(p) { api.servant(p, 3, 'for making haste to help!'); ABI.loads.forEach((l, i) => { if (i < api.taskCount('load')) l.visible = true; }); } })));
    api.armor('sandals', 0, 38);                       // feet shod with the gospel of peace

    // --- the donkey train and Abigail ---
    ABI.loads = [];
    for (let i = 0; i < 3; i++) {
      const g = new T.Group();
      const d = api.animalMesh('donkey'); g.add(d);
      const pack = new T.Mesh(new T.BoxGeometry(0.9, 0.45, 0.7), api.texMat([0xa16207, 0x7c2d12, 0x166534][i], 'cloth')); pack.position.set(0, 1.25, 0); pack.visible = false; g.add(pack);
      ABI.loads.push(pack);
      api.add(g); ABI.donkeys.push(g);
    }
    { const pack = ABI.loads[2]; ABI.loads.push(pack); }               // (the fourth load goes on the last donkey too)
    const abigail = api.person(0x0e7490, 0xfde68a, 1, { belt: true }); api.add(abigail); ABI.abigail = abigail;

    // --- the way down: three things to clear, each reached from a little ledge ---
    const block = (name, x, z, mk, lx, lz, label, verb) => {
      const m = mk(); m.position.set(x, H(x, z), z); api.add(m);
      api.box({ x: lx, z: lz + 1.8, w: 1.6, d: 1.6, h: 1.1, color: 0x9a8f80, house: false });
      api.box({ x: lx, z: lz, w: 2, d: 2, h: 2.2, color: 0x9a8f80, house: false });
      const top = H(lx, lz) + 2.2;
      const b = { name, x, z, m, open: false, s: 0 };
      b.inter = api.interact({ x: lx, z: lz, y: top, r: 1.8, vRange: 1.0, label,
        can: () => (api.taskDone('load') ? true : 'Load the donkeys first.'),
        use(p) { this.remove(); b.open = true; verb(m); api.task('way'); api.servant(p, 4, 'for clearing the way!'); api.sfx('build'); api.puff(x, H(x, z) + 1, z, 0xd6d3d1, 12); } });
      ABI.blocks.push(b);
      api.camZone({ minX: Math.min(x, lx) - 4, maxX: Math.max(x, lx) + 4, minZ: Math.min(z, lz) - 3, maxZ: Math.max(z, lz) + 4, yaw: lx < x ? -0.4 : 0.4, height: 8, back: 12, focus: [lx, top, lz], pull: 0.35 });
    };
    block('gate', 0.5, 9, () => { const g = new T.Group(); [-1.4, 1.4].forEach((dx) => { const p = new T.Mesh(new T.BoxGeometry(0.3, 1.6, 0.3), api.mat(0x6b4f2a)); p.position.set(dx, 0.8, 0); g.add(p); }); const bar = new T.Mesh(new T.BoxGeometry(2.8, 0.2, 0.15), api.mat(0x8b5e34)); bar.position.y = 1.1; bar.name = 'bar'; g.add(bar); g.rotation.y = -0.6; return g; },
      4.4, 10.6, 'Lift the latch', (m) => { m.children[2].rotation.z = 1.2; m.children[2].position.set(-1.2, 1.6, 0); });
    block('stone', 0, -3, () => { const s = new T.Mesh(new T.DodecahedronGeometry(1.1), api.texMat(0x8a8178, 'stone')); s.position.y = 0.8; const g = new T.Group(); g.add(s); return g; },
      -4.6, -1.4, 'Lever the stone aside', (m) => { m.position.x -= 2.6; m.position.z += 1.2; });
    block('planks', 1, -14, () => { const g = new T.Group(); const gap = new T.Mesh(new T.BoxGeometry(2.6, 0.05, 1.6), api.mat(0x3f2a1a)); gap.position.y = 0.03; g.add(gap); const pl = new T.Mesh(new T.BoxGeometry(2.6, 0.18, 1.8), api.mat(0xa0703c)); pl.position.y = 0.12; pl.visible = false; g.add(pl); return g; },
      5.6, -15.6, 'Lay the planks', (m) => { m.children[1].visible = true; });
    // where each one stops the train
    ABI.blocks.forEach((b) => {
      let best = 0, bd = 1e9;
      for (let s = 0; s <= ABI.len; s += 0.25) { const q = abiAt(s), d = Math.hypot(q[0] - b.x, q[1] - b.z); if (d < bd) { bd = d; best = s; } }
      b.s = best;
    });

    // --- David and his men below (the meeting) ---
    const david = api.person(0x7f1d1d, 0xe7e5e4, 1.05, { beard: 0x7c4a1e, band: true }); david.position.set(0, H(0, -35), -35); david.rotation.y = 0; api.add(david);
    for (let i = 0; i < 7; i++) { const m = api.crowdPerson(i + 70, [0x57534e, 0x44403c, 0x78350f][i % 3], 0xd6d3d1); const x = -6 + i * 2, z = -37.5 - (i % 2); m.position.set(x, H(x, z), z); api.add(m); }

    // --- fragments ---
    api.box({ x: 13, z: 22, w: 3, d: 3, h: 5, color: 0x9a8f80, house: false });               // a high rock (only the Scribe)
    api.box({ x: 10.6, z: 24.6, w: 1.6, d: 1.6, h: 2.0, color: 0x8b6b45, house: false });
    api.fragment({ x: 13, z: 22, y: H(13, 22) + 5 + 1.3 });
    const spring = new T.Mesh(new T.CircleGeometry(1.6, 20), new T.MeshLambertMaterial({ color: 0x3b82c4, transparent: true, opacity: 0.85 }));   // a spring on the hillside
    spring.rotation.x = -Math.PI / 2; spring.position.set(-13, H(-13, -8) + 0.05, -8); api.add(spring);
    api.fragment({ x: -13, z: -8, y: H(-13, -8) + 0.3, net: true });
    [[11, 40.6, 1.2], [8.6, 40.6, 2.3]].forEach(([x, z, top]) => ABI.steps.push(api.box({ x, z, w: 1.6, d: 1.6, h: 0.35, y: H(x, z) + top - 0.35, hidden: true, color: 0xa0703c })));
    const planks = new T.Mesh(new T.BoxGeometry(1.4, 0.4, 2), api.mat(0xa0703c)); planks.position.set(15, H(15, 41) + 0.2, 41); api.add(planks);
    api.interact({
      x: 15, z: 41, r: 2.2, label: 'Build steps',
      can: (p) => (p.role.id === 'builder' ? true : 'Some planks. The Builder could make steps up the roof (Tab / RB to switch).'),
      use(p) { this.remove(); planks.visible = false; ABI.steps.forEach((s) => s.show(true)); api.sfx('build'); api.servant(p, 3); }
    });
    api.fragment({ x: 10, z: 36, y: H(10, 36) + 3.4 + 1.3 });

    const c = (x, z, top, kind) => ({ x, z, top: top + abiHill(z), kind });
    api.course([c(-16, 22, 1.0, 'block'), c(-13.8, 19, 1.8, 'float'), c(-16, 16, 2.6, 'crumble'),
      c(-13.8, 13, 3.4, 'float'), c(-16, 10, 4.2, 'float'), c(-13.8, 7, 5.0, 'spring'),
      c(-16, 4, 9.2, 'float'), c(-13.8, 1, 10.0, 'float')]);
    api.leaves([[0, 40], [-3, 34], [3, 30], [0, 26], [5, 19], [0, 10], [-4, 5], [0, 0], [4, -6], [6, -10], [0, -15], [-4, -19], [-2, -24]]);
    LEVEL._place(api);
  },

  _place(api) {
    ABI.donkeys.forEach((g, i) => { const q = abiAt(ABI.s - 2 - i * 2.4); g.position.set(q[0], api.terrain(q[0], q[1]), q[1]); g.rotation.y = q[2]; });
    const q = abiAt(ABI.s); ABI.abigail.position.set(q[0], api.terrain(q[0], q[1]), q[1]); ABI.abigail.rotation.y = q[2];
  },

  update(api, dt) {
    if (!ABI.saidReady && api.taskDone('load')) {
      ABI.saidReady = true;
      api.toast('🫏 The donkeys are loaded! They wait for the family. Stay beside them while a teammate scouts ahead to clear the way.', 4500);
    }
    if (api.taskDone('load') && ABI.s < ABI.len) {
      const lead = abiAt(ABI.s);
      const family = api.players();
      const near = api.activePlayers().some((p) => Math.hypot(p.pos.x - lead[0], p.pos.z - lead[1]) < 9);
      const waiting = family.filter((p) => {
        const progress = abiProgress(p.pos.x, p.pos.z);
        const beside = Math.hypot(p.pos.x - lead[0], p.pos.z - lead[1]) < 10;
        const scouting = progress.s > ABI.s + 2 && progress.distance < 12;
        return p.bubble || (!beside && !scouting);
      });
      if (waiting.length && !ABI.saidWait) { ABI.saidWait = true; api.toast('🫏 The donkeys wait for the family. Bring everyone along, or help a teammate out of a bubble.', 3500); }
      ABI.waiting = waiting.length > 0;
      const stop = ABI.blocks.filter((b) => !b.open && b.s > ABI.s - 0.01).reduce((m, b) => Math.min(m, b.s - 2.2), ABI.len);
      if (near && !ABI.waiting && ABI.s < stop) ABI.s = Math.min(stop, ABI.s + dt * 2.6);
      LEVEL._place(api);
    }
  },

  objective(api) {
    const ps = api.activePlayers();
    if (!ps.length) return null;
    const cx = ps.reduce((s, p) => s + p.pos.x, 0) / ps.length, cz = ps.reduce((s, p) => s + p.pos.z, 0) / ps.length;
    const g = ABI.goods.filter((it) => !it.got).sort((a, b) => Math.hypot(a.x - cx, a.z - cz) - Math.hypot(b.x - cx, b.z - cz))[0];
    if (g) return [g.x, g.y + 1, g.z];
    const b = ABI.blocks.find((k) => !k.open);
    if (b) return [b.inter.x, b.inter.y + 1, b.inter.z];
    if (ABI.s < ABI.len - 0.1) { const q = abiAt(ABI.s); return [q[0], api.terrain(q[0], q[1]) + 2, q[1]]; }
    return [ABI.MEET[0], 1.5, ABI.MEET[1]];
  },

  isComplete(api) { return api.taskDone('load') && api.taskDone('way') && ABI.s >= ABI.len - 0.1; },

  finale: {
    message: '🤝 Everyone come down to where Abigail meets David.',
    beacon: [0, 3, -30],
    inZone(p) { return Math.hypot(p.pos.x - ABI.MEET[0], p.pos.z - ABI.MEET[1]) < 5.5; },
    onUpdate(api, t) {
      if (t > 0.5 && !ABI.told) {
        ABI.told = true;
        api.story([
          { art: '🙇', title: 'Abigail asks for peace', text: 'Abigail got down, bowed before David and spoke humbly. She asked him to forgive, and reminded him that the LORD would make him king one day. She begged him not to take revenge and shed blood (1 Samuel 25:23–31).' },
          { art: '🕊️', title: 'Kept from revenge', text: 'And David said to Abigail, Blessed be the LORD God of Israel, which sent thee this day to meet me: And blessed be thy advice, and blessed be thou, which hast kept me this day from coming to shed blood, and from avenging myself with mine own hand.', ref: '1 Samuel 25:32–33' },
          ...(api.shownRef('Matthew 5:9') ? [] : [{ art: '💛', text: 'Blessed are the peacemakers: for they shall be called the children of God.', ref: 'Matthew 5:9' }])
        ], () => { ABI.endT = api.time; api.sfx('win'); });
      }
      return ABI.endT !== undefined && api.time - ABI.endT > 2;
    }
  }
};
