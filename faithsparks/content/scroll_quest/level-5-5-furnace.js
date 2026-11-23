/* =====================================================================
 * LEVEL 5-5: THE FIERY FURNACE  (Daniel 3)
 * ---------------------------------------------------------------------
 * The plain of Dura in Babylon. The king's golden image stands at the south end; the furnace is
 * to the east (it is only watched from a distance: nobody plays in the fire).
 *   1. Daily work: pick up the brick stacks left across the square on the way from the kiln to the
 *      builders (God's people sought the good of the city they lived in, Jeremiah 29:7). The route
 *      weaves across the guards' patrol lines: keep out of their way.
 *   2. The music plays and everyone bows to the image... except Shadrach, Meshach and Abed-nego.
 *      Go and stand with them.
 *   3. They are thrown into the furnace (told on cards). The king sees FOUR walking in the fire:
 *      the fourth is shown only as light. Bring the king's officials to see them come out unharmed.
 * Only edit THIS file to change the level. See GEMINI.md and CAMPAIGN.md.
 * ===================================================================== */

const FURN = {
  IMAGE: [0, -20],
  FURNACE: [14, -8],
  BUILD: [-14, 10],
  STAND: [0, -9],              // where the three friends stand
  bricks: [],
  guards: [],
  crowd: [],
  three: [],
  officials: [],
  bowed: false,
  inFire: false,
  out: false
};

const LEVEL = {
  id: '5-5',
  bibleConnection: {"passage": "Daniel 3", "text": "The three friends refused the king’s idol even under threat of death. They were thrown into the furnace, and God delivered them. Our brickwork and gathering tasks explore the setting; their trust did not depend on a promise of an easy escape."},
  world: 'World 5-5',
  title: 'The Fiery Furnace',
  leafIcon: '🔥',
  leafColor: 0xfb923c,
  leafShape: 'round',
  spawn: [0, 28],
  bounds: { minX: -23, maxX: 23, minZ: -28, maxZ: 34 },
  approach: ['stones', 'log', 'crumbles'],   // the way in (engine): a stretch before the level's own start
  startMessage: "God told His people to seek the city’s peace (Jeremiah 29:7). Collect bricks for the builders. Watch the guards!",

  intro: [
    { text: 'If it be so, our God whom we serve is able to deliver us from the burning fiery furnace, and he will deliver us out of thine hand, O king.', ref: 'Daniel 3:17' },
    { text: 'When thou passest through the waters, I will be with thee; and through the rivers, they shall not overflow thee: when thou walkest through the fire, thou shalt not be burned; neither shall the flame kindle upon thee.', ref: 'Isaiah 43:2' }
  ],

  introStory: [
    { art: '🏛️', title: 'Far from home', text: 'God\'s people had been carried away to Babylon. Three young men, Shadrach, Meshach and Abed-nego, served there, but they still worshipped only the LORD.' }
  ],

  tasks: [
    { id: 'bricks', icon: '🧱', label: 'Pick up bricks on the way to the builders', total: 4 },
    { id: 'stand', icon: '🧍', label: 'Stand with the three friends', total: 1, lockedUntil: 'bricks' },
    { id: 'see', icon: '👀', label: 'Bring the officials to see', total: 4, lockedUntil: 'stand' }
  ],

  memoryVerse: { text: 'When thou passest through the waters, I will be with thee; and through the rivers, they shall not overflow thee: when thou walkest through the fire, thou shalt not be burned; neither shall the flame kindle upon thee.', ref: 'Isaiah 43:2' },

  ending: {
    verse: { text: 'Blessed be the God of Shadrach, Meshach, and Abed-nego, who hath sent his angel, and delivered his servants that trusted in him,', ref: 'Daniel 3:28' },
    message: 'They would not bow to anyone but God, even if it cost them everything. And God was with them in the fire.'
  },

  quiz: [
    { q: 'What did everyone have to do when the music played?', ref: 'Daniel 3:5', options: ['Dance', 'Bow down to the golden image', 'Go home'], answer: 1 },
    { q: 'What did the three friends say?', ref: 'Daniel 3:18', options: ['"We will bow just once"', '"We will not serve thy gods"', '"Let us run away"'], answer: 1 },
    { q: 'How many men did the king see walking in the fire?', ref: 'Daniel 3:25', options: ['Three', 'Four', 'None'], answer: 1 }
  ],

  music: {
    bpm: 100,
    notes: [62, 0, 65, 69, 70, 0, 69, 65, 67, 0, 64, 0, 65, 0, 0, 0,
            69, 0, 70, 72, 74, 0, 72, 70, 69, 0, 65, 0, 62, 0, 0, 0],
    bass: [38, 38, 43, 43, 41, 41, 38, 38]
  },

  onCallText(kind, n) {                                                 // said once; after that they just come
    if (FURN.saidCall) return '';
    FURN.saidCall = true;
    return n > 1 ? n + ' officials come with you to see.' : 'An official comes with you to see.';
  },

  /* ---------- ground shape ---------- */
  terrain(x, z) {
    let h = Math.sin(x * 0.27) * Math.cos(z * 0.21) * 0.1;
    if (x < -19) h -= 2.4 * Math.min(1, (-19 - x) / 1.5);                // a canal of the river
    return h;
  },

  groundColor(x, z, h) {
    if (h < -1) return 0x2f7fb8;
    if (Math.abs(x) < 2.4 && z > -17 && z < 20) return (Math.floor(z / 1.2)) % 2 ? 0xe2cfa4 : 0xd8c497;                 // the processional way to the image
    if (Math.abs(x) < 16 && z > -16 && z < 20) return (Math.floor(x / 2) + Math.floor(z / 2)) % 2 ? 0xd2b98b : 0xc8af81;   // the square
    return 0xbfa678;
  },

  /* ---------- build ---------- */
  build(api) {
    const T = api.THREE;
    const person = (robe, scarf, s, o) => api.person(robe, scarf, s, o);   // friendly round townsfolk (engine)

    // --- the golden image (an idol: only scenery) ---
    const [ix, iz] = FURN.IMAGE;
    FURN.base = api.box({ x: ix, z: iz, w: 6, d: 6, h: 1.6, color: 0xb8a37a });
    // (the tall, narrow image: "threescore cubits, and the breadth thereof six cubits", Daniel 3:1)
    // musicians by the image: horn, harp, pipe and drum (Daniel 3:5)
    FURN.musicians = [[-5, -15, 'horn'], [5, -15, 'harp'], [-6.5, -16.5, 'pipe'], [6.5, -16.5, 'drum']].map(([x, z, kind], i) => {
      const m = api.storyPerson([0x7c3aed, 0x9d174d, 0x0e7490, 0x854d0e][i], 0xfde68a, 1, { beard: i % 2 === 0 }); m.position.set(x, 0, z); m.rotation.y = Math.atan2(-x, 4); api.add(m);
      LEVEL._instrument(api, m, kind); return m;
    });

    // --- the furnace (watched from a distance; the heat keeps everyone back) ---
    const [fx, fz] = FURN.FURNACE;
    const body=api.box({ x: fx + 2, z: fz, w: 5, d: 6, h: 5, color: 0x7c4a2d });body.mesh.visible=false;
    // A barrel-vault kiln with masonry rings; the existing solid and heat boundary remain.
    const profile=new T.Shape();profile.moveTo(-3,0);profile.lineTo(3,0);profile.lineTo(3,2);profile.absellipse(0,2,3,3,0,Math.PI,false);profile.closePath();
    const vent=new T.Path();vent.moveTo(-1.1,.1);vent.lineTo(-1.1,1.4);vent.absellipse(0,1.4,1.1,1.1,Math.PI,0,true);vent.lineTo(1.1,.1);vent.closePath();profile.holes.push(vent);
    const kilnGeo=new T.ExtrudeGeometry(profile,{depth:5,bevelEnabled:false,curveSegments:16});const kiln=new T.Mesh(kilnGeo,api.texMat(0x975c3d,'brick'));kiln.position.set(fx-.5,0,fz);kiln.rotation.y=Math.PI/2;kiln.castShadow=true;kiln.receiveShadow=true;kiln.userData.landmark='vaulted-kiln';api.add(kiln);
    [-2.5,2.5].forEach(dz=>{const buttress=new T.Mesh(new T.BoxGeometry(4.8,2.2,.38),api.texMat(0x75432e,'brick'));buttress.position.set(fx+2,1.1,fz+dz);api.add(buttress);});
    const mouthShape=new T.Shape();mouthShape.moveTo(-1.1,-1.2);mouthShape.lineTo(1.1,-1.2);mouthShape.lineTo(1.1,.1);mouthShape.absellipse(0,.1,1.1,1.1,0,Math.PI,false);mouthShape.closePath();
    const mouth = new T.Mesh(new T.ShapeGeometry(mouthShape), new T.MeshBasicMaterial({ color: 0xff8a1f,transparent:true,opacity:.32,depthWrite:false })); mouth.position.set(fx - 0.52, 1.3, fz); mouth.rotation.y = -Math.PI / 2; api.add(mouth); FURN.mouth = mouth;
    const back=new T.Mesh(new T.ShapeGeometry(mouthShape),new T.MeshBasicMaterial({color:0x2b160e}));back.position.set(fx+4.4,1.3,fz);back.rotation.y=-Math.PI/2;api.add(back);
    const glow = new T.PointLight(0xff7a18, 2.2, 14, 2); glow.position.set(fx - 1.5, 1.6, fz); api.add(glow); FURN.glow = glow;
    api.hazard({ x: fx - 1.6, z: fz, r: 2.2 }, { msg: 'Too hot! Stay back from the furnace.' });
    const heatRing = new T.Mesh(new T.RingGeometry(2.0, 2.3, 28), new T.MeshBasicMaterial({ color: 0xef4444, transparent: true, opacity: 0.5, side: T.DoubleSide }));
    heatRing.rotation.x = -Math.PI / 2; heatRing.position.set(fx - 1.6, 0.07, fz); api.add(heatRing);
    // the four in the fire (hidden until then): three friends, and a fourth shown only as light
    const inFire = new T.Group();
    [-0.8, 0, 0.8].forEach((dz, i) => { const m = api.storyPerson([0x1d4ed8, 0x15803d, 0xb91c1c][i], 0xfef3c7, 0.7, { register: false }); m.position.set(0, 0, dz); m.rotation.y = -Math.PI / 2; inFire.add(m); });
    const fourth = new T.Mesh(new T.CylinderGeometry(0.35, 0.35, 1.6, 12, 1, true), new T.MeshBasicMaterial({ color: 0xfffbea, transparent: true, opacity: 0.85, depthWrite: false }));
    fourth.position.set(0.5, 0.8, 0.4); inFire.add(fourth);
    inFire.position.set(fx - 0.2, 0.3, fz); inFire.visible = false; api.add(inFire); FURN.inFire = inFire; FURN.fourth = fourth;

    // --- the three friends ---
    [['Shadrach', 0x1d4ed8, -1.4], ['Meshach', 0x15803d, 0], ['Abed-nego', 0xb91c1c, 1.4]].forEach(([name, robe, dx]) => {
      const m = api.storyPerson(robe, 0xfef3c7, 1, { register: false }); m.position.set(FURN.STAND[0] + dx, 0, FURN.STAND[1]); m.rotation.y = Math.PI; api.add(m); FURN.three.push(m);
    });
    // the crowd (they bow when the music plays)
    const robes = [0xb91c1c, 0x0e7490, 0xca8a04, 0x15803d, 0x9d174d, 0x475569, 0x92400e, 0x7c3aed];
    for (let i = 0; i < 16; i++) {
      const x = -10 + (i % 8) * 2.9, z = -4 + Math.floor(i / 8) * 2.6 + (i % 2) * 0.5;
      if (Math.abs(x) < 3) continue;
      const m = api.crowdPerson(i, robes[i % robes.length], 0xf5f5f4); m.position.set(x, api.terrain(x, z), z); m.rotation.y = Math.PI; api.add(m); FURN.crowd.push(m);
    }
    FURN.standZone = api.zone({ x: FURN.STAND[0], z: FURN.STAND[1] + 2.2, r: 2.4, time: 3, color: 0x93c5fd, hidden: true,
      onDone(helpers) { api.task('stand'); helpers.forEach((p) => api.servant(p, 5, 'for standing with them!')); LEVEL._stood(api); } });

    // --- daily work: bricks to the builders ---
    const [bx, bz] = FURN.BUILD;
    FURN.stacks = [[-16, 8, 1.2], [-12, 8, 1.6], [-16, 12, 2.0], [-12, 12, 1.0]].map(([x, z, h]) => api.box({ x, z, w: 1.8, d: 1.8, h, color: 0xb45309 }));
    const builder = api.storyPerson(0x92400e, 0xfde68a, 1, { beard: true }); builder.position.set(bx, 0, bz + 3); api.add(builder); FURN.builder = builder;
    // the stacks lie on a weaving route kiln → builders, across the patrol lines (z 14 and 4)
    [[12, 24], [8, 12], [0, 6], [-6, 16]].forEach(([x, z]) => {
      const g = new T.Group();
      for (let k = 0; k < 3; k++) { const b = new T.Mesh(new T.BoxGeometry(0.7, 0.22, 0.38), api.mat(0xc2410c)); b.position.y = k * 0.24; b.rotation.y = k * 0.4; g.add(b); }
      FURN.bricks.push(api.gatherable({ x, z, mesh: g, task: 'bricks', onGet(p) { api.servant(p, 3, 'for helping the city!'); } }));
    });

    // --- guards on patrol across the square (a bump, never harm) ---
    [[4, -14, 3.2], [14, 14, 2.6], [-2, 13, 3.6]].forEach(([z, x0, sp], i) => {
      const m = api.storyPerson(0x1f2937, 0x9ca3af, 1.04, { beard: true, register: false }); api.add(m);
      const a = m.userData.storyActor, spear = new T.Mesh(new T.CylinderGeometry(0.035, 0.035, 2.4, 6), api.texMat(0x6b4f2a, 'wood')); spear.position.set(0, 0.55, 0.05); a.hands[1].add(spear);
      const tip = new T.Mesh(new T.ConeGeometry(0.07, 0.26, 6), api.texMat(0x9a958c, 'bronze')); tip.position.set(0, 1.85, 0.05); a.hands[1].add(tip);
      const helm = new T.Mesh(new T.SphereGeometry(0.37, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.5), api.texMat(0x8c8678, 'bronze')); helm.position.y = 0.3; a.head.add(helm);
      FURN.guards.push({ m, z, x0, sp, t: i * 2 });
    });

    // --- the king's officials (after the fire): bring them to see ---
    [[-14, 22], [17, 4], [-14, -10], [15, 28]].forEach(([x, z], i) => {
      const f = api.follower({ x, z, kind: 'official', mesh: api.storyPerson([0x6d28d9, 0x0f766e, 0x9f1239, 0x854d0e][i], 0xfacc15, 1, { beard: true, register: false }),
        deliverTo: { x: fx - 5.5, z: fz + 1, r: 3 },
        parkAt: (fo) => { const k = FURN.officials.indexOf(fo); return [fx - 6.5 - (k % 2) * 1.3, 0, fz - 1.5 + k * 1.1]; },
        onDeliver(p) { api.task('see'); api.servant(p, 4); } });
      f.callable = () => (FURN.out ? true : 'An official of the king. Not now.');
      FURN.officials.push(f);
    });

    // --- fragments ---
    // 1: the canal (the Fisherman nets it)
    api.hazard({ x: -21.5, z: 3, w: 5, d: 62 }, { maxY: -0.6, except: (p) => p.role.id === 'fisherman', msg: 'Splash! The canal is deep (the Fisherman can wade).' });
    api.fragment({ x: -21, z: -2, y: 0.2, net: true });
    // 2: crumbling stones up a stepped tower (ziggurat) in the south-west
    [[-14, -18, 1.1], [-16, -20, 2.1], [-14, -22, 3.1]].forEach(([x, z, t]) => api.crumble({ x, z, top: api.terrain(x, z) + t }));
    FURN.tower = api.box({ x: -16.4, z: -24.4, w: 2.6, d: 2.6, h: 4.0, color: 0xc0a06c });
    api.fragment({ x: -16.4, z: -24.4, y: 4.0 + 1.3 });
    // 3: a spring onto a watchtower
    FURN.watch = api.box({ x: -8, z: 27, w: 2.4, d: 2.4, h: 4.3, color: 0xb59a6d });
    api.spring({ x: -8, z: 23.8 });
    api.fragment({ x: -8, z: 27, y: 4.3 + 1.3 });

    // --- Golden Scroll challenge course: east edge ---
    const plan = [['block', 1.0], ['float', 1.0], ['crumble', 0.9], ['float', 0.8], ['spring', 0.2], ['float', 4.2], ['crumble', 0.6]];
    let ctop = 0;
    api.course(plan.map(([kind, rise], i) => {
      const z = 32 - i * 2.9, x = 21 + (i % 2 ? 0.3 : -0.3);
      ctop = i === 0 ? api.terrain(x, z) + 1.0 : ctop + rise;
      return { x, z, top: ctop, kind };
    }));

    api.leaves([[0, 22], [6, 18], [-6, 18], [0, 10], [8, 8], [-8, 6], [12, 0], [-12, -2], [4, -12], [-4, -12], [-16, -20, 3.0], [-14, 22], [17, 4], [-14, -10]]);
    // (no challenge corner: the level is about the three who stood)
    LEVEL._dress(api);
  },

  /* ---------- presentation only: nothing here is solid, and no rule changes ---------- */
  _instrument(api, m, kind) {
    const T = api.THREE, a = m.userData.storyActor, brass = api.texMat(0xd4a017, 'gold'), wood = api.texMat(0x7a4e2c, 'wood');
    const g = new T.Group(); a.hands[1].add(g);
    if (kind === 'horn') { const h = new T.Mesh(new T.ConeGeometry(0.13, 0.8, 10, 1, true), brass); h.material = brass.clone(); h.material.side = T.DoubleSide; h.rotation.x = -1.3; h.position.set(0, 0.05, 0.35); g.add(h); }
    if (kind === 'pipe') { const h = new T.Mesh(new T.CylinderGeometry(0.03, 0.05, 0.6, 8), wood); h.rotation.x = -1.2; h.position.set(0, 0.05, 0.28); g.add(h); }
    if (kind === 'harp') { const f = new T.Mesh(new T.TorusGeometry(0.28, 0.035, 6, 16, Math.PI * 1.3), wood); f.position.set(0, 0.1, 0.25); f.rotation.y = Math.PI / 2; g.add(f); const st = new T.Mesh(new T.BoxGeometry(0.01, 0.4, 0.3), new T.MeshLambertMaterial({ color: 0xf5e6c8, transparent: true, opacity: 0.6 })); st.position.set(0, 0.1, 0.25); g.add(st); }
    if (kind === 'drum') { const d = new T.Mesh(new T.CylinderGeometry(0.26, 0.26, 0.3, 14), wood); d.position.set(-0.1, -0.05, 0.3); g.add(d); }
    a.instrument = kind;
  },

  _dress(api) {
    const T = api.THREE, g = new T.Group();
    const M = (geo, mat, x, y, z, parent) => { const m = new T.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true; (parent || g).add(m); return m; };
    const B = (w, h, d, mat, x, y, z, parent) => M(new T.BoxGeometry(w, h, d), mat, x, y, z, parent);
    const gold = new T.MeshLambertMaterial({ color: 0xf2c230, emissive: 0x5a4000 }), stone = api.texMat(0xc2ad84, 'stone'), brick = api.texMat(0xb05a2c, 'brick'), mud = api.texMat(0xc9ac7a, 'brick');
    const [ix, iz] = FURN.IMAGE;
    // the golden image: a tall, narrow figure on a stepped base (an idol: scenery only)
    FURN.base.mesh.material = stone;
    B(4.6, 0.8, 4.6, stone, ix, 2.0, iz); B(3.4, 0.7, 3.4, api.texMat(0xd2bd92, 'stone'), ix, 2.75, iz);
    const statue = new T.Group(); statue.position.set(ix, 3.1, iz); api.add(statue); FURN.image = statue;      // (its own few meshes, not batched)
    const robe = [[0, 0], [1.25, 0], [1.05, 2], [0.85, 5], [0.8, 7.6], [0.95, 8.6], [0.62, 9.3], [0, 9.35]].map(([r, y]) => new T.Vector2(r, y));
    M(new T.LatheGeometry(robe, 18), gold, 0, 0, 0, statue).userData.landmark = 'golden-image';
    B(2.5, 0.55, 0.9, gold, 0, 8.55, 0, statue);                                               // shoulders
    [-1, 1].forEach((sd) => { const arm = M(new T.CylinderGeometry(0.22, 0.28, 3.2, 10), gold, sd * 1.15, 7.2, 0.15, statue); arm.rotation.z = sd * 0.08; });
    M(new T.SphereGeometry(0.72, 16, 12), gold, 0, 10.0, 0, statue);
    M(new T.CylinderGeometry(0.62, 0.52, 0.65, 12), gold, 0, 10.8, 0, statue);                    // a tall crown
    M(new T.CylinderGeometry(0.5, 0.55, 0.9, 12), gold, 0, 8.7 + 0.9, 0.38, statue).scale.set(1, 1, 0.5);   // beard
    // the furnace: firewood, flames in the mouth, a chimney
    const [fx, fz] = FURN.FURNACE;
    B(1.1, 2.4, 1.1, brick, fx + 3.6, 5.6, fz);
    for (let i = 0; i < 9; i++) { const l = M(new T.CylinderGeometry(0.14, 0.14, 1.8, 7), api.texMat(0x6b4426, 'bark'), fx + 4.9 + (i % 3) * 0.3, 0.16 + Math.floor(i / 3) * 0.27, fz + 3.6 + (i % 2) * 0.1); l.rotation.x = Math.PI / 2; }
    // Babylon's walls far beyond the image, with a blue glazed gate
    const far = api.texMat(0xb79d73, 'brick'), blue = api.texMat(0x2456a6, 'brick');
    B(90, 7, 3, far, 0, 3.5, -46);
    for (let x = -42; x <= 42; x += 9) B(3.4, 10, 3.8, far, x, 5, -45.8);
    B(9, 12, 4.2, blue, 0, 6, -45.6); B(3.2, 6, 4.4, new T.MeshLambertMaterial({ color: 0x1b140d }), 0, 3, -45.5);
    [-1, 1].forEach((sd) => B(3, 13, 4.6, blue, sd * 5.2, 6.5, -45.6));
    for (let x = -3.5; x <= 3.6; x += 1.4) B(0.6, 0.5, 0.06, gold, x, 9.5, -43.35);
    // dressing on the existing solids
    FURN.stacks.forEach((h) => { h.mesh.material = brick; });
    [FURN.tower, FURN.watch].forEach((h) => { h.mesh.material = mud; });
    B(3.0, 0.3, 3.0, api.texMat(0x9c7f55, 'brick'), -16.4, 3.85, -24.4); B(2.8, 0.3, 2.8, api.texMat(0x9c7f55, 'brick'), -8, 4.15, 27);
    api.scenery(g);
    // flames: a few bright tongues that flicker in the mouth (no light added)
    FURN.flames = [];
    const flameMat = [0xffb347, 0xff7a18, 0xffe08a].map((c) => new T.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.85, depthWrite: false }));
    for (let i = 0; i < 7; i++) { const f = new T.Mesh(new T.ConeGeometry(0.28 + (i % 3) * 0.08, 1.2 + (i % 2) * 0.5, 8), flameMat[i % 3]); f.position.set(fx - 0.2, 0.6, fz - 0.8 + i * 0.27); api.add(f); FURN.flames.push(f); }
    // palms along the canal
    [['PalmTree_1', -18.2, 18, 7], ['PalmTree_3', -18.6, 2, 6.5], ['PalmTree_2', -18.2, -14, 7], ['PalmTree_4', 19.2, -18, 6.5], ['PalmTree_1', 17.6, 24, 6]].forEach(([n, x, z, h]) => { const m = api.model(n, h); if (!m) return; const t = new T.Group(); t.position.set(x, api.terrain(x, z), z); t.rotation.y = x * 1.3; t.add(m); api.add(t); api.fadeScenery(t, 2.6); });
    // King Nebuchadnezzar by the image, then at the furnace (Daniel 3:24)
    const king = api.storyPerson(0x7e22ce, 0xfacc15, 1.08, { beard: true, register: false });
    const a = king.userData.storyActor, crown = new T.Mesh(new T.CylinderGeometry(0.31, 0.34, 0.24, 14, 1, true), api.texMat(0xe0a92e, 'gold')); crown.material = crown.material.clone(); crown.material.side = T.DoubleSide; crown.position.y = 0.62; a.head.add(crown);
    king.position.set(2.8, 0, -13.6); king.rotation.y = 0.2; api.add(king); FURN.king = king;
    // a builder who knows the work (optional; just for our game)
    FURN.builderTalk = api.conversation({
      person: FURN.builder, speaker: 'Builder', label: 'Talk with the builder',
      clue(api) {
        if (!api.taskDone('bricks')) { const b = FURN.bricks.find((it) => !it.got); return { text: 'Bricks are stacked across the square. Pick them up on your way here, and keep clear of the guards.', at: b ? [b.x, b.y + 1, b.z] : undefined }; }
        if (!api.taskDone('stand')) return { text: 'Everyone bowed... but three men are still standing. Go and stand with them.', at: [FURN.STAND[0], 1.5, FURN.STAND[1] + 2.2] };
        if (!FURN.out) return { text: 'Stay back from the furnace. Watch!' };
        const o = FURN.officials.find((f) => f.state === 'idle');
        return o ? { text: 'The king wants his officials to see. Bring them to the furnace.', at: [o.pos.x, o.pos.y + 2, o.pos.z] } : { text: 'The fire did not hurt them at all!' };
      }
    });
  },

  _poses(api, dt) {
    const t = api.time;
    (FURN.flames || []).forEach((f, i) => { f.scale.set(1, 0.8 + Math.abs(Math.sin(t * (7 + i) + i)) * 0.6, 1); f.position.x = FURN.FURNACE[0] - 0.2 + Math.sin(t * 5 + i) * 0.08; });
    const playing = FURN.musicStarted && !FURN.bowed;
    (FURN.musicians || []).forEach((m, i) => {
      const a = m.userData.storyActor;
      if (FURN.bowed && !FURN.inFireT) { a.body.rotation.x += (0.9 - a.body.rotation.x) * Math.min(1, dt * 4); return; }   // they bow with the crowd
      a.body.rotation.x += (0 - a.body.rotation.x) * Math.min(1, dt * 4);
      api.posePerson(m, { dt, expression: 'calm' });
      if (playing || !FURN.musicStarted) { a.arms[1].rotation.x = -1.2 + (a.instrument === 'drum' ? Math.abs(Math.sin(t * 6)) * 0.5 : Math.sin(t * 3 + i) * 0.08); a.arms[0].rotation.x = a.instrument === 'drum' ? -0.6 - Math.abs(Math.sin(t * 6 + 1.5)) * 0.5 : -1.1; }
    });
    FURN.three.forEach((m) => api.posePerson(m, { dt, expression: FURN.out ? 'wonder' : 'calm', cheer: FURN.out && FURN.endT === undefined && t % 5 < 1.6 }));
    if (FURN.builder) api.posePerson(FURN.builder, { dt, expression: 'calm' });
    FURN.officials.forEach((f) => api.posePerson(f.mesh, { dt, stride: f.walkAmt || 0, expression: FURN.out ? 'wonder' : 'calm' }));
    const k = FURN.king;
    if (k) {
      if (FURN.inFireT !== undefined && !k.moved) { k.moved = true; k.position.set(FURN.FURNACE[0] - 5.4, 0, FURN.FURNACE[1] - 3.6); k.rotation.y = Math.PI / 2 + 0.3; }   // the king comes to the furnace
      api.posePerson(k, { dt, expression: FURN.inFireT !== undefined ? 'wonder' : 'calm', talking: FURN.out && t % 4 < 2 });
    }
  },

  // the bricks are done: the music plays, everyone must bow
  _music(api) {
    if (FURN.musicStarted) return; FURN.musicStarted = true;
    api.story([
      { art: '🎺', title: 'The king\'s golden image', text: 'That at what time ye hear the sound of the cornet, flute, harp, sackbut, psaltery, dulcimer, and all kinds of musick, ye fall down and worship the golden image that Nebuchadnezzar the king hath set up:', ref: 'Daniel 3:5' }
    ], () => { api.toast('🧍 Everyone bowed down... except three young men. They would not worship anyone but the LORD. Go and stand with them!', 4500);
      FURN.bowed = true;
      FURN.crowd.forEach((m) => { m.rotation.x = -0.9; m.position.y = -0.2; });
      FURN.standZone.show(true);
      api.sfx('fanfare');
    });
  },

  // they stood firm; the furnace; four in the fire
  _stood(api) {
    FURN.standZone.show(false);
    api.story([
      { art: '🙏', text: 'If it be so, our God whom we serve is able to deliver us from the burning fiery furnace, and he will deliver us out of thine hand, O king.', ref: 'Daniel 3:17' },
      { art: '✋', text: 'But if not, be it known unto thee, O king, that we will not serve thy gods, nor worship the golden image which thou hast set up.', ref: 'Daniel 3:18' },
      { art: '✨', title: 'Thrown into the fire... and four men!', text: 'He answered and said, Lo, I see four men loose, walking in the midst of the fire, and they have no hurt; and the form of the fourth is like the Son of God.', ref: 'Daniel 3:25' }
    ], () => {
      FURN.three.forEach((m) => { m.visible = false; });
      FURN.inFire.visible = true; FURN.inFireT = api.time;
      FURN.crowd.forEach((m) => { m.rotation.x = 0; m.position.y = 0; });
    });
  },

  update(api, dt) {
    if (!FURN.musicStarted && api.taskDone('bricks') && api.near(FURN.BUILD[0], FURN.BUILD[1], 4).length) LEVEL._music(api);
    // guards march back and forth across the square
    FURN.guards.forEach((g) => {
      g.t += dt;
      const x = Math.sin(g.t * g.sp / 12) * g.x0;
      const dir = Math.cos(g.t * g.sp / 12);
      g.m.position.set(x, api.terrain(x, g.z) + Math.abs(Math.sin(g.t * 7)) * 0.05, g.z);
      g.m.rotation.y = dir > 0 ? Math.PI / 2 : -Math.PI / 2;
      api.posePerson(g.m, { dt, stride: 0.7, expression: 'calm' });
      api.near(x, g.z, 0.95).forEach((p) => api.hit(p, x, g.z, 'bump', 'Oops! Out of the guards\' way.'));
    });
    // the furnace roars
    FURN.glow.intensity = 2 + Math.sin(api.time * 9) * 0.5;
    LEVEL._poses(api, dt);
    if (Math.random() < 0.15) api.puff(FURN.FURNACE[0] + 2, 5.2, FURN.FURNACE[1], 0x9ca3af, 3);
    // the four walk in the fire; then the king calls them out
    if (FURN.inFireT !== undefined && !FURN.out) {
      const t = api.time - FURN.inFireT;
      FURN.inFire.children.forEach((m, i) => { m.position.x = Math.sin(t * 0.8 + i) * 0.4; if (m.userData.storyActor) api.posePerson(m, { dt, stride: 0.6, expression: 'calm' }); });
      FURN.fourth.material.opacity = 0.65 + Math.sin(t * 3) * 0.2;
      if (t > 4) {
        FURN.out = true; FURN.inFire.visible = false;
        FURN.three.forEach((m, i) => { m.visible = true; m.position.set(FURN.FURNACE[0] - 4.2, 0, FURN.FURNACE[1] - 1.4 + i * 1.4); m.rotation.y = -Math.PI / 2; });
        api.story([
          { art: '🚪', text: 'Then Nebuchadnezzar came near to the mouth of the burning fiery furnace, and spake, and said, Shadrach, Meshach, and Abed-nego, ye servants of the most high God, come forth, and come hither. Then Shadrach, Meshach, and Abed-nego, came forth of the midst of the fire.', ref: 'Daniel 3:26' }
        ], () => api.toast('👀 Bring the king\'s officials to see: the fire did not hurt them at all!', 4000));
      }
    }
  },

  objective(api) {
    const ps = api.activePlayers();
    if (!ps.length) return null;
    const c = ps[0].pos;
    const near = (list) => list.sort((a, b) => Math.hypot(a[0] - c.x, a[2] - c.z) - Math.hypot(b[0] - c.x, b[2] - c.z))[0];
    if (!api.taskDone('bricks')) return near(FURN.bricks.filter((it) => !it.got).map((it) => [it.x, it.y + 1, it.z])) || null;
    if (!FURN.musicStarted) return [FURN.BUILD[0], 2, FURN.BUILD[1]];
    if (!api.taskDone('stand')) return [FURN.STAND[0], 1.5, FURN.STAND[1] + 2.2];
    if (!FURN.out) return null;
    if (FURN.officials.some((f) => f.state === 'follow')) return [FURN.FURNACE[0] - 5.5, 1.5, FURN.FURNACE[1] + 1];
    return near(FURN.officials.filter((f) => f.state === 'idle').map((f) => [f.pos.x, f.pos.y + 2, f.pos.z])) || null;
  },

  finale: {
    message: '✨ Everyone gather by the three friends!',
    beacon: [FURN.FURNACE[0] - 4.2, 3, FURN.FURNACE[1]],
    inZone(p) { return Math.hypot(p.pos.x - (FURN.FURNACE[0] - 5), p.pos.z - FURN.FURNACE[1]) < 6; },
    onUpdate(api, t) {
      if (t > 0.5 && !FURN.done) {
        FURN.done = true;
        api.story([
          { art: '👑', text: 'Then Nebuchadnezzar spake, and said, Blessed be the God of Shadrach, Meshach, and Abed-nego, who hath sent his angel, and delivered his servants that trusted in him,', ref: 'Daniel 3:28' },
          ...(api.shownRef('Isaiah 43:2') ? [] : [{ art: '💛', title: 'God was with them IN the fire', text: 'When thou passest through the waters, I will be with thee; and through the rivers, they shall not overflow thee: when thou walkest through the fire, thou shalt not be burned; neither shall the flame kindle upon thee.', ref: 'Isaiah 43:2' }])
        ], () => { FURN.endT = api.time; });
      }
      return FURN.endT !== undefined && api.time - FURN.endT > 2;
    }
  }
};
