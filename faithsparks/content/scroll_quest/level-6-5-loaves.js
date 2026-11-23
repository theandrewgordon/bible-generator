/* =====================================================================
 * LEVEL 6-5: ENOUGH FOR EVERYONE  (John 6:1-14, 6:35)
 * ---------------------------------------------------------------------
 * A grassy hillside by the Sea of Galilee. Start at the shore, walk uphill toward -z:
 *   Shore     (z 40..30)   the lake behind (Fisherman fragment, boat ride to an island)
 *   Hillside  (z 30..-30)  five grassy clearings with coloured flags; families wander
 *   Hilltop   (z -32..-44) Jesus teaching (never shown), two disciples, the baskets
 * Tasks, in order: bring the boy with the loaves and fishes up the hill; run through each family's ring
 * on the way and they sit down (no separate errands);
 * then (Jesus gives thanks) ONE serving run downhill: carry a basket that never runs out past every group;
 * then gather the 12 baskets of leftovers along the way back up to the hilltop.
 * Jesus multiplies the food; the kids serve, like the disciples did.
 * Only edit THIS file to change the level. See GEMINI.md and CAMPAIGN.md.
 * ===================================================================== */

const LOAF = {
  boy: null,
  families: [],
  clearings: [],
  baskets: [],
  crumbs: [],
  thanked: false,
  gatherOpen: false,
  HILL: [0, -38],
  COLORS: [0xdc2626, 0x2563eb, 0x16a34a, 0xca8a04, 0x9333ea],
  SPOTS: [[-10, 14], [10, 6], [-9, -8], [9, -16], [-2, -24]]
};

function hillHeight(z) { return z >= 30 ? 0 : Math.min(8.4, (30 - z) * 0.12); }

// after the boy is on the hill and everyone is seated: Jesus gives thanks, food is ready
function loafThanks(api) {
  if (LOAF.thanked || !api.taskDone('lad') || !api.taskDone('seat')) return;
  LOAF.thanked = true;
  LOAF.baskets.forEach((b) => { b.mesh.visible = true; b.inter.alive = true; b.blocked = null; });
  api.sfx('fanfare');
  api.story([
    { art: '🙏', title: 'Jesus gives thanks', text: 'And Jesus took the loaves; and when he had given thanks, he distributed to the disciples, and the disciples to them that were set down; and likewise of the fishes as much as they would.', ref: 'John 6:11' }
  ], () => api.toast('🧺 Pick up a basket and walk down the hill past every group. However much you hand out, the basket stays full! Only Jesus can do that.', 4500));
}

function loafGather(api) {
  if (LOAF.gatherOpen) return;
  LOAF.gatherOpen = true;
  LOAF.crumbs.forEach((c) => { c.g.visible = true; });
  api.story([
    { art: '🍞', title: 'Nothing wasted', text: 'When they were filled, he said unto his disciples, Gather up the fragments that remain, that nothing be lost.', ref: 'John 6:12' }
  ], () => api.toast('⛰️ Gather the leftovers on your way back up the hill to Jesus.', 3500));
}

const LEVEL = {
  id: '6-5',
  bibleConnection: {"passage": "John 6:1–13", "text": "Jesus fed a great crowd with a boy’s five loaves and two fish, and twelve baskets remained. Our seating, serving and gathering tasks explore helping the crowd. Jesus supplies the food; players do not multiply it."},
  world: 'World 6-5',
  title: 'Enough for Everyone',
  leafIcon: '🌾',
  leafColor: 0xeab308,
  leafShape: 'round',
  spawn: [-2, 35],
  bounds: { minX: -19, maxX: 19, minZ: -46, maxZ: 52 },
  startMessage: 'Find the boy with the loaves and fishes and bring him up the hill to the disciples!',

  intro: [
    { text: 'There is a lad here, which hath five barley loaves, and two small fishes: but what are they among so many?', ref: 'John 6:9' },
    { text: 'And Jesus said unto them, I am the bread of life: he that cometh to me shall never hunger; and he that believeth on me shall never thirst.', ref: 'John 6:35' }
  ],

  introStory: [
    { art: '⛰️', title: 'A great crowd', text: 'When Jesus then lifted up his eyes, and saw a great company come unto him, he saith unto Philip, Whence shall we buy bread, that these may eat?', ref: 'John 6:5' },
    { art: '🧺', text: 'There is a lad here, which hath five barley loaves, and two small fishes: but what are they among so many?', ref: 'John 6:9' }
  ],

  tasks: [
    { id: 'lad', icon: '🧒', label: 'Bring the boy up the hill', total: 1 },
    { id: 'seat', icon: '🌿', label: 'Help the families sit on the grass', total: 5 },
    { id: 'serve', icon: '🧺', label: 'Walk the food past every group', total: 5, lockedUntil: 'seat' },
    { id: 'gather', icon: '🍞', label: 'Gather up the leftovers', total: 12, lockedUntil: 'serve' }
  ],

  memoryVerse: { text: 'And Jesus said unto them, I am the bread of life: he that cometh to me shall never hunger; and he that believeth on me shall never thirst.', ref: 'John 6:35' },

  ending: {
    verse: { text: 'And Jesus said unto them, I am the bread of life: he that cometh to me shall never hunger; and he that believeth on me shall never thirst.', ref: 'John 6:35' },
    message: 'A small lunch in Jesus\' hands fed thousands, with twelve baskets left over.'
  },

  quiz: [
    { q: 'What did the boy have?', ref: 'John 6:9', options: ['Five barley loaves and two small fishes', 'Ten loaves and five fishes', 'A basket of apples'], answer: 0 },
    { q: 'What did Jesus do before the food was handed out?', ref: 'John 6:11', options: ['He sent everyone home', 'He gave thanks', 'He bought more bread'], answer: 1 },
    { q: 'How many baskets of leftovers were gathered?', ref: 'John 6:13', options: ['Two', 'Five', 'Twelve'], answer: 2 }
  ],

  music: {
    bpm: 108,
    notes: [67, 0, 69, 71, 72, 0, 71, 69, 67, 0, 64, 0, 67, 0, 0, 0,
            72, 0, 74, 76, 77, 0, 76, 74, 72, 0, 71, 0, 72, 0, 0, 0],
    bass: [43, 43, 48, 48, 45, 45, 43, 43]
  },

  onCallText(kind) { return kind === 'boy' ? 'The boy follows you with his lunch! Run through the coloured rings on the way up: the families will sit down.' : ''; },

  /* ---------- ground shape ---------- */
  terrain(x, z) {
    let h = hillHeight(z) + Math.sin(x * 0.35) * Math.cos(z * 0.25) * 0.25;
    for (const [cx, cz] of LOAF.SPOTS) {                               // flat grassy clearings
      const d = Math.hypot(x - cx, z - cz);
      if (d < 4.5) { const flat = hillHeight(cz); const k = Math.min(1, (4.5 - d) / 1.5); h = h * (1 - k) + flat * k; }
    }
    const dh = Math.hypot(x - LOAF.HILL[0], z - LOAF.HILL[1]);          // the hilltop (ramps up gently)
    if (dh < 9) h = Math.max(h, 8.4 - Math.max(0, dh - 4) * 0.5);
    if (z > 40) h -= 2.6 * Math.min(1, (z - 40) / 1.5);                // the lake
    if (Math.hypot(x - 12, z - 47.5) < 2.6) h = 0.5;                   // a little island
    return h;
  },

  groundColor(x, z, h) {
    if (h < -1) return 0x2b7bc0;
    if (z > 37) return 0xd9c79b;                                       // shore
    for (const [cx, cz] of LOAF.SPOTS) if (Math.hypot(x - cx, z - cz) < 3.6) return 0x7ed957;
    return (Math.floor(x / 3) + Math.floor(z / 3)) % 2 ? 0x5fb94e : 0x56ad46;
  },

  /* ---------- build ---------- */
  build(api) {
    const T = api.THREE;
    const person = (robe, scarf, s, o) => api.person(robe, scarf, s, o);   // friendly round townsfolk (engine)

    // --- the lake behind the start ---
    const lake = new T.Mesh(new T.PlaneGeometry(60, 14), new T.MeshLambertMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.8 }));
    lake.rotation.x = -Math.PI / 2; lake.position.set(0, -0.7, 47); api.add(lake);
    api.hazard({ x: 0, z: 47, w: 60, d: 13 }, { maxY: -0.6, except: (p) => p.role.id === 'fisherman', msg: 'Splash! The lake is deep (the Fisherman can wade). Ride the boat to the island.' });
    api.fragment({ x: -10, z: 46, y: 0.6, net: true });                 // fragment 1: the Fisherman nets it
    api.mover({ w: 2.2, h: 0.4, d: 3.2, color: 0x7a5230, path: [[3, -0.25, 41.4], [9.6, -0.25, 46.4]], speed: 1.6, wait: 1.4 });
    api.fragment({ x: 12, z: 47.5, y: 0.5 + 1.3 });                     // fragment 2: on the island

    // --- the hilltop: Jesus is teaching here (soft light; never shown), two disciples ---
    const hx = LOAF.HILL[0], hz = LOAF.HILL[1];
    const seat = new T.Mesh(new T.CylinderGeometry(1.2, 1.4, 0.6, 10), api.mat(0xa8a29e));
    seat.position.set(hx, 8.7, hz - 3); api.add(seat);
    const glow = new T.Mesh(new T.CylinderGeometry(1.4, 1.8, 9, 14, 1, true), new T.MeshBasicMaterial({ color: 0xfff7d6, transparent: true, opacity: 0.22, side: T.DoubleSide, depthWrite: false }));
    glow.position.set(hx, 13, hz - 3); api.add(glow);
    LOAF.glow = glow;
    [[-2.6, 0x0e7490], [2.6, 0x92400e]].forEach(([dx, robe]) => {
      const d = person(robe, 0xf5f5f4); d.position.set(hx + dx, 8.4, hz); d.rotation.y = Math.PI; api.add(d);
    });

    // --- the boy with his lunch ---
    const boy = person(0x65a30d, 0xfef3c7, 0.7);
    const lunch = new T.Mesh(new T.CylinderGeometry(0.22, 0.18, 0.2, 10), api.mat(0xb45309)); lunch.position.set(0.3, 0.6, 0.2); boy.add(lunch);
    LOAF.boy = api.follower({
      x: 7, z: 31, kind: 'boy', mesh: boy,
      deliverTo: { x: hx, z: hz, r: 4.5 },
      parkAt: [hx - 1, 8.4, hz - 1.2],
      onDeliver(p) {
        api.task('lad');
        api.servant(p, 8, 'for bringing the boy to Jesus!');
        api.toast('🧒 The boy brings his five loaves and two fishes to Jesus.', 3000);
        loafThanks(api);
      }
    });

    // --- the grassy clearings and the families ---
    const flagFor = (i) => {
      const [x, z] = LOAF.SPOTS[i];
      const y = api.terrain(x, z);
      const pole = new T.Mesh(new T.CylinderGeometry(0.06, 0.06, 3, 6), api.mat(0x5c3d22)); pole.position.set(x + 3, y + 1.5, z); api.add(pole);
      const flag = new T.Mesh(new T.BoxGeometry(1.1, 0.7, 0.05), api.mat(LOAF.COLORS[i])); flag.position.set(x + 3.55, y + 2.6, z); api.add(flag);
      const ring = new T.Mesh(new T.RingGeometry(3.2, 3.5, 32), new T.MeshBasicMaterial({ color: LOAF.COLORS[i], transparent: true, opacity: 0.5, side: T.DoubleSide }));
      ring.rotation.x = -Math.PI / 2; ring.position.set(x, y + 0.05, z); api.add(ring);
      LOAF.clearings.push({ x, z, y, seated: false, fed: false, color: LOAF.COLORS[i], i });
    };
    for (let i = 0; i < 5; i++) flagFor(i);
    // each family waits just beside its own clearing: run through the ring on your way up and they come and sit
    const starts = LOAF.SPOTS.map(([cx, cz]) => [cx + (cx < 0 ? -4.4 : 4.4), cz + 1.2]);
    starts.forEach(([x, z], i) => {
      const g = new T.Group();
      [[0, 0, 1], [0.7, 0.3, 0.8], [-0.6, 0.4, 0.65]].forEach(([dx, dz, s], k) => {
        const m = person(LOAF.COLORS[i], k ? 0xf5f5f4 : 0xfde68a, s, k ? { hair: 0x2a1a0e } : { beard: true });   // a father and two children
        m.position.set(dx, 0, dz); g.add(m);
      });
      const c = LOAF.clearings[i];
      LOAF.families.push(api.follower({
        x, z, kind: 'family', mesh: g, call: false,
        deliverTo: { x: c.x, z: c.z, r: 3 },
        parkAt: [c.x, c.y, c.z],
        onDeliver(p) {
          c.seated = true;
          g.children.forEach((m) => { m.scale.y = 0.7; });           // sitting down on the grass
          api.task('seat');
          api.servant(p, 5);
          if (api.taskCount('seat') === 1) {
            api.verse('Sit down on the grass', 'And Jesus said, Make the men sit down. Now there was much grass in the place. So the men sat down, in number about five thousand.', 'John 6:10');
          }                                                             // (the task board counts the others: no pop-up)
          loafThanks(api);
        }
      }));
    });

    // --- two baskets of food that never run out (appear after Jesus gives thanks) ---
    LOAF.baskets = [0, 1].map((i) => {
      const g = new T.Group();
      const b = new T.Mesh(new T.CylinderGeometry(0.62, 0.46, 0.55, 14), api.mat(0xb45309)); g.add(b);
      [[0, 0], [0.22, 0.12], [-0.2, 0.14], [0.05, -0.22]].forEach(([dx, dz], k) => { const bread = new T.Mesh(k === 3 ? new T.BoxGeometry(0.5, 0.12, 0.16) : new T.SphereGeometry(0.24, 8, 6), api.mat(k === 3 ? 0x94a3b8 : 0xe8b86d)); bread.scale.y = k === 3 ? 1 : 0.6; bread.position.set(dx, 0.32, dz); g.add(bread); });
      const it = api.carryable({ x: LOAF.HILL[0] - 1.5 + i * 3, z: LOAF.HILL[1] + 3.2, mesh: g, name: 'basket of food', to: 'walk it past every group' });
      it.mesh.visible = false; it.inter.alive = false;
      it.blocked = () => 'Wait: Jesus has not given thanks yet.';
      return it;
    });

    // --- leftover pieces to gather (appear after everyone has eaten): 12 small baskets ---
    // they lie along the trail from the lowest group back up to the hilltop: one walk, not twelve errands
    const trail = LOAF.SPOTS.map(([x, z]) => [x, z]).concat([[LOAF.HILL[0], LOAF.HILL[1] + 5]]);
    const segs = []; let total = 0;
    for (let k = 0; k < trail.length - 1; k++) { const d = Math.hypot(trail[k + 1][0] - trail[k][0], trail[k + 1][1] - trail[k][1]); segs.push([trail[k], trail[k + 1], d]); total += d; }
    for (let i = 0; i < 12; i++) {
      let t = (i + 0.5) / 12 * total, x = 0, z = 0;
      for (const [a0, a1, d] of segs) { if (t <= d) { x = a0[0] + (a1[0] - a0[0]) * t / d; z = a0[1] + (a1[1] - a0[1]) * t / d; break; } t -= d; }
      const g = new T.Group();
      const b = new T.Mesh(new T.CylinderGeometry(0.28, 0.22, 0.28, 10), api.mat(0xa16207)); g.add(b);
      const piece = new T.Mesh(new T.SphereGeometry(0.18, 8, 6), api.mat(0xe8b86d)); piece.position.y = 0.18; g.add(piece);
      g.position.set(x, api.terrain(x, z) + 0.3, z); g.visible = false; api.add(g);
      LOAF.crumbs.push({ g, x, z, got: false });
    }

    // --- rock climb on the hillside (fragment 3) ---
    [[-14, -14, 1.2], [-15.5, -17, 2.4], [-14, -20, 3.6]].forEach(([x, z, h]) => api.stump(x, z, h, 0.9));
    api.fragment({ x: -14, z: -20, y: api.terrain(-14, -20) + 3.6 + 1.4 });

    // rocks and a few trees for shape
    [[-6, 26], [6, 12], [-4, 4], [5, -6], [-12, -24], [12, -28]].forEach(([x, z], i) => api.rock(x, z, 0.6 + (i % 3) * 0.2));
    [[-16, 30], [16, 24], [-17, 0], [17, -10], [-16, -30], [15, -36]].forEach(([x, z]) => api.tree(x, z, 1.0, 0x3f8f3a));

    api.armor('sandals', -6, 32);

    // --- Golden Scroll challenge course (above the hillside): blocks, crumbling platforms, a spring ---
    api.course([
      { x: -16, z: 19.4, top: 2.29, kind: 'block' },
      { x: -12.6, z: 20.6, top: 3.29, kind: 'float' },
      { x: -9.2, z: 19.4, top: 4.19, kind: 'crumble' },
      { x: -5.8, z: 20.6, top: 4.99, kind: 'crumble' },
      { x: -2.4, z: 19.4, top: 5.19, kind: 'float' },
      { x: 1, z: 20.6, top: 5.49, kind: 'spring' },
      { x: 4.4, z: 19.4, top: 9.69, kind: 'float' },
      { x: 7.8, z: 20.6, top: 10.29, kind: 'crumble' },
      { x: 11.2, z: 19.4, top: 10.89, kind: 'float' }
    ]);

    api.leaves([[0, 30], [2, 24], [-2, 18], [0, 12], [3, 6], [-3, 0], [0, -6], [3, -12], [-1, -18], [0, -30], [-15.5, -17],
      [5, 40.3, 1], [8, 44, 1], [-6, 38], [14, 0], [-15, 10]]);

    // --- bonus challenge corner: spinning log and spring tower with extra leaves ---
    // (no challenge corner: serving the crowd is the level)
  },

  update(api, dt) {
    LOAF.glow.material.opacity = 0.18 + Math.sin(api.time * 1.5) * 0.05;
    // run through a family's ring: they come in and sit down on the grass
    LOAF.families.forEach((f, i) => {
      const c = LOAF.clearings[i];
      if (f.state !== 'idle' || c.seated) return;
      const p = api.activePlayers().find((q) => Math.hypot(q.pos.x - c.x, q.pos.z - c.z) < 3.6);
      if (p) { f.state = 'follow'; f.leader = p; f.joyT = api.time; }
    });
    // the serving run: whoever carries a basket feeds a seated group by walking into its ring
    if (LOAF.thanked && !api.taskDone('serve')) {
      api.activePlayers().forEach((p) => {
        if (!p.holding || LOAF.baskets.indexOf(p.holding) < 0) return;
        LOAF.clearings.forEach((c) => {
          if (c.fed || !c.seated || Math.hypot(p.pos.x - c.x, p.pos.z - c.z) > 3.6) return;
          c.fed = true;
          api.task('serve'); api.servant(p, 6, 'for serving food!'); api.sfx('coin');
          api.puff(c.x, c.y + 1, c.z, 0xe8b86d, 14);
          if (api.taskCount('serve') === 1) api.toast('🧺 Everyone in that group eats, and the basket is still full!', 3000);   // (said once: the miracle)
          if (api.taskDone('serve')) loafGather(api);
        });
      });
    }
    if (!LOAF.gatherOpen) return;
    LOAF.crumbs.forEach((c, i) => {
      if (c.got) return;
      c.g.rotation.y += dt * 2;
      c.g.position.y = api.terrain(c.x, c.z) + 0.3 + Math.sin(api.time * 3 + i) * 0.08;
      const p = api.near(c.x, c.z, 1.3)[0];
      if (!p) return;
      c.got = true; c.g.visible = false;
      api.task('gather'); api.sfx('coin'); api.puff(c.x, c.g.position.y, c.z, 0xe8b86d, 8);
      api.servant(p, 1);
    });
  },

  objective(api) {
    const ps = api.activePlayers();
    if (!ps.length) return null;
    const cx = ps.reduce((s, p) => s + p.pos.x, 0) / ps.length;
    const cz = ps.reduce((s, p) => s + p.pos.z, 0) / ps.length;
    const near = (list) => list.sort((a, b) => Math.hypot(a[0] - cx, a[2] - cz) - Math.hypot(b[0] - cx, b[2] - cz))[0];
    const hill = [LOAF.HILL[0], 9.5, LOAF.HILL[1]];
    const holder = ps.find((p) => p.holding && LOAF.baskets.indexOf(p.holding) >= 0);
    if (holder && !api.taskDone('serve')) { const c = LOAF.clearings.filter((k) => !k.fed).map((k) => [k.x, k.y + 1, k.z]); if (c.length) return near(c); }
    const b = LOAF.boy;
    if (b.state === 'idle') return [b.pos.x, b.pos.y + 1.5, b.pos.z];
    const rings = LOAF.clearings.filter((c) => !c.seated);
    const ahead = rings.filter((c) => c.z < cz + 3).map((c) => [c.x, c.y + 1, c.z]);   // the next ring on the way up
    if (b.state === 'follow') return ahead.length ? near(ahead) : hill;
    if (rings.length) return near(rings.map((c) => [c.x, c.y + 1, c.z]));
    if (LOAF.thanked && !api.taskDone('serve')) {
      const bk = LOAF.baskets.filter((it) => !it.delivered && !it.holder).map((it) => [it.x, it.y + 1, it.z]);
      if (bk.length) return near(bk);
    }
    if (LOAF.gatherOpen) {
      const cr = LOAF.crumbs.filter((c) => !c.got).map((c) => [c.x, api.terrain(c.x, c.z) + 1, c.z]);
      if (cr.length) return near(cr);
    }
    return hill;
  },

  finale: {
    message: '⛰️ Everyone gather on the hilltop!',
    beacon: [0, 10, -38],
    inZone(p) { return Math.hypot(p.pos.x - LOAF.HILL[0], p.pos.z - LOAF.HILL[1]) < 6.5 && p.pos.y > 7.5; },
    onUpdate(api, t) {
      if (t > 0.5 && !LOAF.told) {
        LOAF.told = true;
        api.sfx('win');
        api.story([
          { art: '🧺', title: 'Twelve baskets left over', text: 'Therefore they gathered them together, and filled twelve baskets with the fragments of the five barley loaves, which remained over and above unto them that had eaten.', ref: 'John 6:13' },
          ...(api.shownRef('John 6:35') ? [] : [{ art: '✝️', title: 'The bread of life', text: 'And Jesus said unto them, I am the bread of life: he that cometh to me shall never hunger; and he that believeth on me shall never thirst.', ref: 'John 6:35' }]),
          { art: '💛', text: 'Bread fills us for a day. Jesus gives what we need most and forever: Himself. Anyone who comes to Him is welcome.' }
        ], () => { LOAF.endT = api.time; });
      }
      return LOAF.endT !== undefined && api.time - LOAF.endT > 2;
    }
  }
};
