/* =====================================================================
 * LEVEL 3-7: A PLACE TO MEET GOD  (Exodus 25-26, 35-36, 40)
 * ---------------------------------------------------------------------
 * The camp at the foot of Mount Sinai, by day. Walk toward -z:
 *   The camp    (z 40..10)  the people bring their gifts willingly (Exodus 35:21): pick them up on
 *                           the way (rock steps, a cart, a floating ledge)
 *   The court   (z 6..-28)  linen walls; help raise the gold-covered boards of the tent from three
 *                           scaffolds: a spring, a slow lift, crumbling steps
 *   The tent    (0, -12)    the holy place; inside, the vail keeps everyone out of the most holy place
 * God's glory fills the tabernacle (Exodus 40:34): God comes to dwell among His people; the players
 * only helped build. Thread: the vail (Exodus 26:33) → torn in two at the cross (7-4).
 * Only edit THIS file to change the level. See GEMINI.md and CAMPAIGN.md.
 * ===================================================================== */

const TAB = {
  gifts: [],
  boards: [],
  zones: [],
  steps: [],
  TENT: [0, -12],
  GATE: [0, 8],
  sawVail: false,
  told: false,
  cloud: null,
  cloudT: -1
};

const LEVEL = {
  id: '3-7',
  bibleConnection: {"passage": "Exodus 25:1–9; 40:16–38", "text": "God instructed Israel to build the tabernacle, and His glory filled it. Our gifts and boards explore the people’s work. Completing a building puzzle cannot cause God to dwell among His people."},
  world: 'World 3-8',            // shown one later (the plagues come first in Bible order); the id stays '3-7'
  title: 'A Place to Meet God',
  leafIcon: '🪙',
  leafColor: 0xfacc15,
  spawn: [0, 42],
  bounds: { minX: -19, maxX: 19, minZ: -34, maxZ: 46 },
  approach: ['stones', 'mover', 'ledge'],   // the way in (engine): a stretch before the level's own start
  startMessage: 'God wants to live among His people! Pick up the gifts on the way to the building place.',

  intro: [
    { text: 'And let them make me a sanctuary; that I may dwell among them.', ref: 'Exodus 25:8' },
    { text: 'Then a cloud covered the tent of the congregation, and the glory of the LORD filled the tabernacle.', ref: 'Exodus 40:34' }
  ],

  introStory: [
    { art: '⛰️', title: 'A tent for God', text: 'On the mountain God showed Moses the pattern for a special tent, the tabernacle, where He would meet with His people. Everyone who wanted to help could bring a gift.' },
    { art: '🏕️', title: 'That I may dwell among them', text: 'And let them make me a sanctuary; that I may dwell among them.', ref: 'Exodus 25:8' }
  ],

  tasks: [
    { id: 'gifts', icon: '🎁', label: 'Pick up the gifts on the way', total: 4 },
    { id: 'raise', icon: '🪵', label: 'Help raise the gold boards', total: 3 }
  ],

  memoryVerse: { text: 'And the Word was made flesh, and dwelt among us, (and we beheld his glory, the glory as of the only begotten of the Father,) full of grace and truth.', ref: 'John 1:14' },

  ending: {
    verse: { text: 'Then a cloud covered the tent of the congregation, and the glory of the LORD filled the tabernacle.', ref: 'Exodus 40:34' },
    message: 'God came to live among His people. One day Jesus would come to live among us too.'
  },

  quiz: [
    { q: 'Why did God want the tabernacle made?', ref: 'Exodus 25:8', options: ['To keep the gold safe', 'So He could dwell among His people', 'For the people to sleep in'], answer: 1 },
    { q: 'What did the vail divide?', ref: 'Exodus 26:33', options: ['The holy place and the most holy', 'The camp and the desert', 'The boys and the girls'], answer: 0 },
    { q: 'What filled the tabernacle when it was finished?', ref: 'Exodus 40:34', options: ['Smoke from a fire', 'The glory of the LORD', 'Water'], answer: 1 }
  ],

  music: {
    bpm: 96,
    notes: [62, 0, 66, 69, 71, 0, 69, 66, 64, 0, 66, 0, 62, 0, 0, 0,
            62, 0, 66, 69, 74, 0, 71, 69, 67, 66, 64, 0, 62, 0, 0, 0],
    bass: [50, 50, 47, 47, 43, 43, 45, 45]
  },

  /* ---------- ground: desert camp, Sinai beyond ---------- */
  terrain(x, z) {
    let h = Math.sin(x * 0.27) * Math.cos(z * 0.19) * 0.12;
    if (z < -30) h += (-30 - z) * 0.9;                       // the foot of the mountain
    return h;
  },

  groundColor(x, z, h) {
    if (Math.abs(x) < 11 && z < 6 && z > -28) return 0xd9c7a0;   // the court, swept sand
    return (Math.floor(x / 3) + Math.floor(z / 3)) % 2 ? 0xd2b48c : 0xc9aa80;
  },

  /* ---------- build ---------- */
  build(api) {
    const T = api.THREE;

    // --- the camp: tents and people, gifts lying along the way ---
    [[-12, 40], [-14, 31], [12, 26], [-13, 20], [11, 16], [13, 42]].forEach(([x, z], i) => {
      const t = new T.Mesh(new T.ConeGeometry(2.2, 2.6, 4), api.texMat([0x7c5a3a, 0x9a6b42, 0x6b4f2a][i % 3], 'cloth'));
      t.position.set(x, api.terrain(x, z) + 1.3, z); t.rotation.y = Math.PI / 4; api.add(t);
      api.box({ x, z, w: 2.6, d: 2.6, h: 1.2, color: 0x7c5a3a, house: false }).mesh.visible = false;   // (solid base under the tent)
    });
    [[-4, 38], [5, 35], [-7, 27], [6, 18], [-4, 14]].forEach(([x, z], i) => {
      const m = api.crowdPerson(i + 10, [0x7c2d12, 0x1e40af, 0x166534, 0xa16207, 0x6b21a8][i], 0xe7e5e4); m.position.set(x, api.terrain(x, z), z); m.rotation.y = Math.PI; api.add(m);
    });
    const gift = (kind) => {
      const g = new T.Group();
      if (kind === 'gold') { const b = new T.Mesh(new T.CylinderGeometry(0.4, 0.25, 0.3, 14), api.mat(0xfacc15)); g.add(b); }
      else if (kind === 'blue') { const c = new T.Mesh(new T.BoxGeometry(0.9, 0.35, 0.6), api.mat(0x1d4ed8)); g.add(c); const s = new T.Mesh(new T.BoxGeometry(0.92, 0.08, 0.2), api.mat(0x9f1239)); s.position.y = 0.2; g.add(s); }
      else if (kind === 'wood') { [-0.15, 0.15].forEach((dz) => { const l = new T.Mesh(new T.CylinderGeometry(0.12, 0.12, 1.3, 8), api.mat(0x8b5e34)); l.rotation.z = Math.PI / 2; l.position.z = dz; g.add(l); }); }
      else { const j = new T.Mesh(new T.CylinderGeometry(0.25, 0.32, 0.6, 12), api.mat(0xb45309)); g.add(j); }
      return g;
    };
    // gold: up two rock steps
    api.box({ x: -6, z: 36.6, w: 1.6, d: 1.6, h: 1.1, color: 0x9a8f80 });
    api.box({ x: -6, z: 34.6, w: 1.8, d: 1.8, h: 2.1, color: 0x9a8f80 });
    // blue cloth: on a loaded cart
    api.box({ x: 6, z: 30, w: 2.4, d: 1.6, h: 1.2, color: 0x8b5e34 });
    // oil: on a ledge, from a crate
    api.box({ x: 4, z: 21.6, w: 1.6, d: 1.6, h: 1.2, color: 0x8b6b45 });
    api.box({ x: 5.6, z: 19.6, w: 2, d: 2, h: 0.4, y: 2.0, color: 0xb59a6d });
    [['gold', -6, 34.6], ['blue', 6, 30], ['wood', -5, 24], ['oil', 5.6, 19.6]].forEach(([kind, x, z]) =>
      TAB.gifts.push(api.gatherable({ x, z, mesh: gift(kind), task: 'gifts', onGet(p) { api.servant(p, 3, 'for a willing gift!'); } })));
    api.armor('helmet', 0, 37);
    api.camZone({ minX: 1, maxX: 9, minZ: 17, maxZ: 24, yaw: -0.4, height: 7, back: 11, focus: [5.6, 2, 19.6], pull: 0.4 });

    // --- the court: linen walls with a gate, the altar and the laver ---
    const linen = (x, z, w, d) => api.box({ x, z, w, d, h: 2.9, color: 0xf5f3ea, tex: null, house: false, ao: false });
    linen(-7.5, 6, 7, 0.3); linen(7.5, 6, 7, 0.3);                 // front, with the gate gap between
    linen(-11, -11, 0.3, 34); linen(11, -11, 0.3, 34); linen(0, -28, 22.3, 0.3);
    [[-4.6, 6], [4.6, 6]].forEach(([x, z]) => api.box({ x, z, w: 1.2, d: 1.2, h: 3.6, color: 0xb08d57, house: false }));
    const gateCloth = new T.Mesh(new T.PlaneGeometry(7.8, 0.7), api.mat(0x1d4ed8)); gateCloth.position.set(0, 3.3, 6); api.add(gateCloth);
    api.box({ x: 0, z: 1, w: 2.4, d: 2.4, h: 1.4, color: 0xb87333, house: false });   // the bronze altar
    const laver = new T.Mesh(new T.CylinderGeometry(0.8, 0.5, 0.9, 16), api.mat(0xc08a4a)); laver.position.set(0, api.terrain(0, -3.2) + 0.45, -3.2); api.add(laver);
    const bezaleel = api.person(0x92400e, 0xfde68a, 1, { beard: true }); bezaleel.position.set(2.6, 0, 8.6); api.add(bezaleel);

    // --- the tent: gold boards raised from three scaffolds ---
    const [tx, tz] = TAB.TENT;
    api.box({ x: tx, z: tz, w: 6, d: 12, h: 3.4, color: 0x8b6b45, tex: 'wood', house: false });
    const gold = api.mat(0xeab308);
    const board = (x, z, w, d) => { const m = new T.Mesh(new T.BoxGeometry(w, 3.3, d), gold); m.position.set(x, 1.65, z); m.visible = false; api.add(m); TAB.boards.push(m); return m; };
    board(tx - 3.05, tz, 0.12, 11.8); board(tx + 3.05, tz, 0.12, 11.8); board(tx, tz - 6.05, 5.9, 0.12);
    const cover = new T.Mesh(new T.BoxGeometry(6.6, 0.3, 12.6), api.texMat(0x7f1d1d, 'cloth')); cover.position.set(tx, 3.55, tz); cover.visible = false; api.add(cover); TAB.cover = cover;
    const doorHang = new T.Mesh(new T.PlaneGeometry(5.8, 3.2), api.mat(0x6d28d9)); doorHang.position.set(tx, 1.6, tz + 6.03); api.add(doorHang);
    const raised = (i, helpers) => {
      TAB.boards[i].visible = true;
      api.task('raise'); helpers.forEach((p) => api.servant(p, 5, 'for helping build!')); api.sfx('build');
      api.puff(TAB.boards[i].position.x, 3, TAB.boards[i].position.z, 0xfde047, 14);
      if (api.taskDone('raise')) TAB.cover.visible = true;
    };
    // 1. left: a spring up to the scaffold
    const sp = api.spring({ x: -6.5, z: -9.6 });
    const topL = sp.platform.top + 4.0;
    api.box({ x: -6.5, z: -12, w: 2.2, d: 2.2, h: topL, color: 0xa0703c, tex: 'wood', house: false });
    // 2. right: a slow lift
    const topR = 3.6;
    api.box({ x: 6.5, z: -12, w: 2.2, d: 2.2, h: topR, color: 0xa0703c, tex: 'wood', house: false });
    api.mover({ w: 1.8, h: 0.3, d: 1.8, color: 0xb59a6d, path: [[6.5, 0, -9.4], [6.5, topR - 0.3, -9.4]], speed: 1.4, wait: 1.2 });
    // 3. back: crumbling steps up to the scaffold behind the tent
    api.crumble({ x: -5, z: -20.6, top: 1.2 });
    api.crumble({ x: -3.2, z: -22.2, top: 2.3 });
    const topB = 3.4;
    api.box({ x: 0, z: -22.2, w: 2.2, d: 2.2, h: topB, color: 0xa0703c, tex: 'wood', house: false });
    [[-6.5, -12, topL], [6.5, -12, topR], [0, -22.2, topB]].forEach(([x, z, top], i) => {
      TAB.zones.push(api.zone({ x, z, y: top, r: 1.0, time: 1.5, color: 0xfacc15, onDone(helpers) { raised(i, helpers); } }));
    });
    api.camZone({ minX: -11, maxX: -2, minZ: -15, maxZ: -6, yaw: -0.5, height: 8, back: 12, focus: [-6.5, topL, -12], pull: 0.4 });
    api.camZone({ minX: 2, maxX: 11, minZ: -15, maxZ: -6, yaw: 0.5, height: 8, back: 12, focus: [6.5, topR, -12], pull: 0.4 });
    api.camZone({ minX: -8, maxX: 3, minZ: -26, maxZ: -18.5, yaw: -0.35, height: 8, back: 12, focus: [0, topB, -22.2], pull: 0.4 });

    // --- fragments ---
    // 1: a rock pillar in the camp (only the Scribe jumps that high)
    api.box({ x: 12.5, z: 34, w: 3, d: 3, h: 5, color: 0x9a8f80, house: false });
    api.box({ x: 10, z: 34, w: 1.6, d: 1.6, h: 2.0, color: 0x8b6b45 });
    api.fragment({ x: 12.5, z: 34, y: 5 + 1.3 });
    // 2: a floating plank above the left scaffold (anyone who gets up there)
    api.box({ x: -6.5, z: -14.6, w: 1.8, d: 1.8, h: 0.4, y: topL + 0.7, color: 0xb59a6d });
    api.fragment({ x: -6.5, z: -14.6, y: topL + 1.1 + 1.3 });
    // 3: the Builder makes steps up the gate post
    [[-4.6, 9.6, 1.2], [-4.6, 7.8, 2.4]].forEach(([x, z, top]) => TAB.steps.push(api.box({ x, z, w: 1.6, d: 1.6, h: 0.35, y: top - 0.35, hidden: true, color: 0xa0703c })));
    const planks = new T.Mesh(new T.BoxGeometry(1.4, 0.4, 2), api.mat(0xa0703c)); planks.position.set(-8, 0.2, 11); api.add(planks);
    api.interact({
      x: -8, z: 11, r: 2.2, label: 'Build steps',
      can: (p) => (p.role.id === 'builder' ? true : 'Some planks. The Builder could make steps up the gate post (Tab / RB to switch).'),
      use(p) { this.remove(); planks.visible = false; TAB.steps.forEach((s) => s.show(true)); api.sfx('build'); api.servant(p, 3); }
    });
    api.fragment({ x: -4.6, z: 6, y: 3.6 + 1.3 });

    // --- the cloud of God's glory (comes down at the end) ---
    const cloud = new T.Group();
    for (let i = 0; i < 9; i++) {
      const c = new T.Mesh(new T.SphereGeometry(1.6 + (i % 3) * 0.5, 12, 10), new T.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85, fog: false }));
      c.position.set(Math.cos(i * 0.8) * 2.4, (i % 2) * 0.8, Math.sin(i * 0.8) * 4.5); cloud.add(c);
    }
    cloud.position.set(tx, 30, tz); cloud.visible = false; api.add(cloud); TAB.cloud = cloud;
    const glory = new T.PointLight(0xfff1b8, 0, 26, 1.6); glory.position.set(tx, 5, tz); api.add(glory); TAB.glory = glory;

    // --- Golden Scroll course along the east edge of the camp ---
    api.course([
      { x: 16.4, z: 38, top: 1.1, kind: 'block' },
      { x: 17.0, z: 34.8, top: 2.1, kind: 'float' },
      { x: 16.4, z: 31.6, top: 3.0, kind: 'crumble' },
      { x: 17.0, z: 28.4, top: 3.8, kind: 'float' },
      { x: 16.4, z: 25.2, top: 4.6, kind: 'crumble' },
      { x: 17.0, z: 22.0, top: 5.0, kind: 'spring' },
      { x: 16.4, z: 18.8, top: 9.2, kind: 'float' },
      { x: 17.0, z: 15.6, top: 9.8, kind: 'crumble' },
      { x: 16.4, z: 12.4, top: 10.4, kind: 'float' }
    ]);

    api.leaves([[0, 39], [-3, 33], [-6, 36.6, 1.1], [0, 30], [3, 26], [4, 21.6, 1.2], [0, 16], [0, 11], [-2.5, 3], [2.5, 3],
      [-4, -4], [-6.5, -9.6, 2.6], [4, -6], [6.5, -9.4, 1.4], [-5, -20.6, 1.2], [-3.2, -22.2, 2.3], [0, -25]]);
  },

  update(api, dt) {
    if (!TAB.saidGifts && api.taskDone('gifts')) {
      TAB.saidGifts = true;
      api.toast('🎁 "The people bring much more than enough" (Exodus 36:5)! Now help raise the gold boards of the tent.', 4500);
    }
    // the vail, told when someone first comes to the front of the tent
    const [tx, tz] = TAB.TENT;
    if (!TAB.sawVail && api.near(tx, tz + 8, 3.5).length) {
      TAB.sawVail = true;
      api.story([
        { art: '🟪', title: 'The vail', text: 'And thou shalt hang up the vail under the taches, that thou mayest bring in thither within the vail the ark of the testimony: and the vail shall divide unto you between the holy place and the most holy.', ref: 'Exodus 26:33' }
      ], () => api.toast('🟪 Inside the tent, a thick curtain kept everyone out of the most holy place. Only God could open the way.', 4000));
    }
    // the cloud comes down
    if (TAB.cloudT >= 0) {
      const k = Math.min(1, (api.time - TAB.cloudT) / 4);
      TAB.cloud.position.y = 30 - k * 25;
      TAB.glory.intensity = k * 2.2;
      TAB.cloud.rotation.y += dt * 0.1;
    }
  },

  objective(api) {
    const ps = api.activePlayers();
    if (!ps.length) return null;
    const cx = ps.reduce((s, p) => s + p.pos.x, 0) / ps.length, cz = ps.reduce((s, p) => s + p.pos.z, 0) / ps.length;
    const near = (list) => list.sort((a, b) => Math.hypot(a[0] - cx, a[2] - cz) - Math.hypot(b[0] - cx, b[2] - cz))[0];
    const g = TAB.gifts.filter((it) => !it.got).map((it) => [it.x, it.y + 1, it.z]);
    if (g.length) return near(g);
    const zs = [[-6.5, -12], [6.5, -12], [0, -22.2]].filter((_, i) => !TAB.boards[i].visible).map(([x, z]) => [x, 4, z]);
    if (zs.length) return zs[0];
    return [TAB.GATE[0], 1.5, TAB.GATE[1]];
  },

  finale: {
    message: '🏕️ Everyone gather at the court gate and watch!',
    beacon: [0, 3, 8],
    inZone(p) { return Math.hypot(p.pos.x - TAB.GATE[0], p.pos.z - TAB.GATE[1]) < 4.5; },
    onUpdate(api, t) {
      if (t > 0.3 && TAB.cloudT < 0) { TAB.cloudT = api.time; TAB.cloud.visible = true; api.sfx('fanfare'); }
      if (t > 4.8 && !TAB.told) {
        TAB.told = true;
        api.story([
          { art: '☁️', title: 'The glory of the LORD', text: 'Then a cloud covered the tent of the congregation, and the glory of the LORD filled the tabernacle.', ref: 'Exodus 40:34' },
          { art: '🟪', title: 'The way was closed', text: 'The glory was so great that even Moses could not go in (Exodus 40:35). And inside, the vail kept everyone out of the most holy place, because of sin. Many years later, when Jesus died on the cross, the vail in the temple was torn in two, from the top to the bottom (Matthew 27:51). Now anyone can come to God through Jesus.' },
          ...(api.shownRef('John 1:14') ? [] : [{ art: '✨', title: 'God with us', text: 'And the Word was made flesh, and dwelt among us, (and we beheld his glory, the glory as of the only begotten of the Father,) full of grace and truth.', ref: 'John 1:14' }])
        ], () => { TAB.endT = api.time; api.sfx('win'); });
      }
      return TAB.endT !== undefined && api.time - TAB.endT > 2;
    }
  }
};
