/* =====================================================================
 * LEVEL 4-6: A HOUSE FOR WORSHIP  (1 Kings 5-8)
 * ---------------------------------------------------------------------
 * Jerusalem, while Solomon builds the house of the LORD. A climbing level. Walk toward -z:
 *   The quarry road (z 81..47)  jump the prepared stones; work the cedar crossing together (or alone)
 *   The timber yard (z 42..26)  hop up the piles of cedar from Lebanon
 *   The works       (z 22..0)   steps, a scaffold, a plank, a slow lift to the high scaffold, crumbling
 *                               planks down to a stone ledge; the last carved cedar boards are picked up
 *                               on the way (the stones were made ready at the quarry, 1 Kings 6:7)
 *   Seven years later           the house is finished: climb the great steps; everyone gathers in the court
 * The priests bring the ark; the glory of the LORD fills the house (told on cards). Nobody in the game
 * carries the ark or goes into the most holy place. Thread: the tabernacle (3-7); Jesus, the true temple.
 * Only edit THIS file to change the level. See GEMINI.md and CAMPAIGN.md.
 * ===================================================================== */

const TEMPLE = {
  boards: [],
  scaffold: [],
  steps: [],
  crowd: [],
  quarryStones: [],
  quarryOpen: false,
  quarryCrossed: false,
  COURT: [0, -3],
  finished: false,
  told: false,
  cloud: null, cloudT: -1
};

const LEVEL = {
  id: '4-6',
  bibleConnection: {"passage": "1 Kings 5–8", "text": "Solomon built the temple with quarry stones and cedar from Lebanon. God’s glory filled it at the dedication. Even heaven cannot contain Him. Our crossing and scaffold climb are imagined; finishing them does not make His glory appear."},
  world: 'World 4-6',
  title: 'A House for Worship',
  town: true,
  templeArchitecture: true,
  leafIcon: '🪙',
  leafColor: 0xfacc15,
  spawn: [0, 81],
  finishTheme:'temple',
  bounds: { minX: -19, maxX: 19, minZ: -32, maxZ: 84 },
  startMessage: "Jump across the quarry stones. Use the special action at the orange ring to lower the cedar crossing.",

  intro: [
    { text: 'And, behold, I purpose to build an house unto the name of the LORD my God,', ref: '1 Kings 5:5' },
    { text: 'But will God indeed dwell on the earth? behold, the heaven and heaven of heavens cannot contain thee; how much less this house that I have builded?', ref: '1 Kings 8:27' }
  ],

  introStory: [
    { art: '🌲', title: 'Cedars from Lebanon', text: 'King David\'s son Solomon built a house for the LORD in Jerusalem. Cedar trees came from Lebanon, and every stone was cut and made ready at the quarry, so that no hammer or axe was heard at the building (1 Kings 6:7).' },
    { art: '👑', title: 'An house unto the name of the LORD', text: 'And, behold, I purpose to build an house unto the name of the LORD my God,', ref: '1 Kings 5:5' }
  ],

  tasks: [
    { id: 'boards', icon: '🪵', label: 'Pick up the carved cedar boards', total: 4 },
    { id: 'court', icon: '🏛️', label: 'Climb the great steps', total: 1, lockedUntil: 'boards' }
  ],

  memoryVerse: { text: 'But will God indeed dwell on the earth? behold, the heaven and heaven of heavens cannot contain thee; how much less this house that I have builded?', ref: '1 Kings 8:27' },

  ending: {
    verse: { text: 'for the glory of the LORD had filled the house of the LORD.', ref: '1 Kings 8:11' },
    message: 'God filled the house with His glory. Even so, heaven cannot contain Him: one day He came to live among us in Jesus.'
  },

  quiz: [
    { q: 'Where did the cedar trees come from?', ref: '1 Kings 5:6', options: ['Egypt', 'Lebanon', 'Babylon'], answer: 1 },
    { q: 'Why was no hammer heard at the building?', ref: '1 Kings 6:7', options: ['The stones were made ready at the quarry', 'Everyone was asleep', 'There were no stones'], answer: 0 },
    { q: 'What filled the house when the priests came out?', ref: '1 Kings 8:10', options: ['Smoke from the kitchen', 'The cloud: the glory of the LORD', 'Birds'], answer: 1 }
  ],

  music: {
    bpm: 92,
    notes: [62, 66, 69, 74, 73, 69, 66, 69, 71, 67, 64, 67, 69, 0, 0, 0,
            62, 66, 69, 74, 76, 74, 73, 71, 69, 67, 66, 64, 62, 0, 0, 0],
    bass: [50, 50, 43, 43, 45, 45, 50, 50]
  },

  terrain(x, z) {
    if (z > 47) {
      // Cut quarry faces: the solid banks and stones, not an invisible border, mark each crossing.
      for (const [a, b] of [[69.5, 76.5], [56, 64]]) {
        if (z > a && z < b) return -6 * Math.min(1, (z - a) / .35, (b - z) / .35);
      }
      return 0;
    }
    return Math.sin(x * 0.28) * Math.cos(z * 0.2) * 0.06;
  },
  groundColor(x, z, h) {
    if (z > 47) return h < -1 ? 0x88745b : 0xc9b896;
    if (z < 0) return (Math.floor(x / 2) + Math.floor(z / 2)) % 2 ? 0xe2d6bc : 0xd8cbb0;
    return (Math.floor(x / 3) + Math.floor(z / 3)) % 2 ? 0xc4ad86 : 0xb9a17b;
  },

  /* ---------- build ---------- */
  build(api) {
    const T = api.THREE;
    const sc = (o) => { const b = api.box(Object.assign({ color: 0xa0703c, tex: 'wood', house: false }, o)); TEMPLE.scaffold.push(b); return b; };

    // --- a hand-built quarry road, replacing the stock log/crumble entrance ---
    // Broad, permanent cut stones fit the story and give all four players room to land.
    [[-2, 75, .4], [0, 72.5, 1], [2, 70, .4]].forEach(([x, z, top]) => {
      const stone = api.box({ x, z, w: 3, d: 2.2, y: -6, h: 6 + top,
        color: 0xd9cdb1, tex: 'stone', house: false });
      TEMPLE.quarryStones.push(stone);
      // Shallow dressing marks on the prepared stone, without extra collision obstacles.
      const mark = new T.Mesh(new T.BoxGeometry(1.8, .015, .07), api.mat(0x9a8666));
      mark.position.set(x, top + .01, z); api.add(mark);
      api.leaves([[x, z, top + 1]]);
    });
    [[73, 7], [60, 8]].forEach(([z, d]) => api.hazard({ x: 0, z, w: 40, d },
      { maxY: -2.5, msg: 'Watch your footing in the quarry! Use the prepared stones and cedar crossing.' }));

    // A raised cedar crossing visibly lowers when players work its crank. Nobody has to stay behind.
    TEMPLE.quarryBridge = api.box({ x: 0, z: 60, w: 4.6, d: 9.2, y: 0, h: .25,
      color: 0x9a633a, tex: 'wood', hidden: true, house: false });
    const crossing = new T.Group(); crossing.name = 'quarry-cedar-crossing';
    crossing.position.set(0, .125, 64.6); crossing.rotation.x = Math.PI / 2;
    const deck = new T.Mesh(new T.BoxGeometry(4.6, .25, 9.2), api.texMat(0x9a633a, 'wood'));
    deck.position.z = -4.6; deck.castShadow = true; deck.receiveShadow = true; crossing.add(deck);
    for (let k = 0; k < 13; k++) {
      const seam = new T.Mesh(new T.BoxGeometry(4.5, .02, .035), api.mat(0x654527));
      seam.position.set(0, .135, -.35 - k * .7); crossing.add(seam);
    }
    for (const x of [-1.7, 1.7]) {
      const beam = new T.Mesh(new T.BoxGeometry(.18, .3, 9.2), api.texMat(0x765432, 'wood'));
      beam.position.set(x, -.25, -4.6); beam.castShadow = true; crossing.add(beam);
    }
    api.add(crossing); TEMPLE.quarryCrossing = crossing;
    const wheel = new T.Mesh(new T.TorusGeometry(.55, .1, 8, 16), api.texMat(0x8b5e34, 'wood'));
    wheel.position.set(3.4, 1.05, 65.8); api.add(wheel); TEMPLE.quarryWheel = wheel;
    const spoke = new T.Mesh(new T.BoxGeometry(.95, .09, .1), api.mat(0xb08d4a)); wheel.add(spoke);
    const mount = new T.Mesh(new T.BoxGeometry(.25, 1.5, .3), api.texMat(0x765432, 'wood'));
    mount.position.set(3.4, .75, 65.95); api.add(mount);
    const rope = new T.Line(new T.BufferGeometry().setFromPoints([
      new T.Vector3(3.4, 1.05, 65.8), new T.Vector3(2.5, 3.2, 64.6), new T.Vector3(2.1, 9.3, 64.6)
    ]), new T.LineBasicMaterial({ color: 0x725a39 }));
    api.add(rope); TEMPLE.quarryRope = rope;
    const post = new T.Mesh(new T.BoxGeometry(.18, 3.3, .18), api.texMat(0x765432, 'wood'));
    post.position.set(2.5, 1.6, 64.6); api.add(post);
    TEMPLE.quarryCrank = api.zone({ x: 3.4, z: 66.5, y: 0, r: 1.9, vRange: .65, time: 3,
      poseAt:[3.4,1.05,65.8],action: 'Lower the cedar crossing', color: 0xf59e0b,
      onDone(helpers) {
        TEMPLE.quarryOpen = true; TEMPLE.quarryT = 0; this.show(false);
        helpers.forEach((p) => api.servant(p, 2, 'for opening the quarry road!'));
        api.sfx('winch'); api.toast('The cedar crossing is lowering. It stays open for the whole team!', 3200);
      }
    });
    api.leaves([[0, 79], [2, 67.5], [0, 54.5], [0, 50]]);
    // Cut stone and cedar stock make the route readable from the shared camera.
    [[-11, 80, 2.2], [11, 79, 3], [-10, 66.5, 1.8], [11, 52, 1.8]].forEach(([x, z, h]) =>
      api.box({ x, z, w: 4, d: 2.8, h, color: 0xc9b897, tex: 'stone', house: false }));
    api.camZone({ minX: -9, maxX: 9, minZ: 68, maxZ: 83, yaw: -.2, height: 9, back: 13,
      focus: [0, 0, 73], pull: .3 });
    api.camZone({ minX: -8, maxX: 8, minZ: 54, maxZ: 69, yaw: .25, height: 9, back: 13,
      focus: [0, 0, 61], pull: .3 });

    // --- the timber yard: piles of cedar to hop up ---
    [[4, 36, 0.9], [6.4, 33.6, 1.8], [4, 31, 2.7]].forEach(([x, z, h]) => {
      api.box({ x, z, w: 3, d: 1.8, h, color: 0x8b4a2b, tex: 'wood', house: false });
      for (let k = 0; k < 3; k++) { const l = new T.Mesh(new T.CylinderGeometry(0.28, 0.28, 3.1, 10), api.texMat(0x9a5a34, 'bark')); l.rotation.z = Math.PI / 2; l.position.set(x, h - 0.28, z - 0.6 + k * 0.6); api.add(l); }
    });
    [[-9, 34], [-12, 28], [11, 26]].forEach(([x, z], i) => { const m = api.crowdPerson(i + 80, [0x7c2d12, 0x57534e, 0x166534][i], 0xe7e5e4); m.position.set(x, 0, z); api.add(m); });

    // --- the works: scaffolds ---
    sc({ x: -6, z: 20, w: 1.6, d: 1.6, h: 1.1 });
    sc({ x: -6, z: 18.2, w: 1.6, d: 1.6, h: 2.1 });
    sc({ x: -6, z: 15, w: 3, d: 3, h: 3.0 });                                            // scaffold A
    sc({ x: -2.4, z: 15, w: 2, d: 1.6, h: 0.4, y: 3.0 });                                 // a plank
    sc({ x: 1.4, z: 15, w: 3, d: 3, h: 4.0 });                                            // scaffold B
    sc({ x: 8, z: 12, w: 3, d: 3, h: 6.0 });                                              // the high scaffold C
    const returnSteps=[sc({x:5,z:15,w:2,d:1.6,h:.3,y:4.5}),sc({x:5,z:13.5,w:2,d:1.6,h:.3,y:5.1})];returnSteps.forEach(h=>h.show(false));
    TEMPLE.coopLift=api.teamLift({x:5,z:12,bottom:.3,top:6,w:3,d:4.2,control:[3,0,12],release:[8,6,12],releaseLabel:'Unhook the scaffold stairway',onLatch(){returnSteps.forEach(h=>h.show(true));}});
    TEMPLE.lift=TEMPLE.coopLift.mover;
    api.discovery({id:'cedar-scaffold',name:'The high cedar scaffold',x:8,y:6,z:12,r:1.4});

    api.crumble({ x: 8, z: 8.6, top: 4.8 });
    api.crumble({ x: 8, z: 5.8, top: 3.6 });
    api.box({ x: 8, z: 2.6, w: 3, d: 3, h: 2.4, color: 0xd6c9a8, house: false });          // a stone ledge (the stones are ready)
    // poles under the scaffolds
    [[-6, 15, 3], [1.4, 15, 4], [8, 12, 6]].forEach(([x, z, h]) => [[-1.3, -1.3], [1.3, -1.3], [-1.3, 1.3], [1.3, 1.3]].forEach(([dx, dz]) => {
      const p = new T.Mesh(new T.CylinderGeometry(0.07, 0.07, h + 1.2, 6), api.mat(0x6b4f2a)); p.position.set(x + dx, (h + 1.2) / 2, z + dz); api.add(p); TEMPLE.scaffold.push({ mesh: p, pole: true });
    }));
    const board = () => {
      const g = new T.Group();
      const b = new T.Mesh(new T.BoxGeometry(1.2, 0.12, 0.5), api.texMat(0xa0522d, 'wood')); g.add(b);
      const c = new T.Mesh(new T.BoxGeometry(0.5, 0.02, 0.3), api.mat(0xfacc15)); c.position.y = 0.07; g.add(c);   // a carved, gold-covered flower
      return g;
    };
    [[4, 31], [-6, 15], [8, 12], [8, 2.6]].forEach(([x, z]) => TEMPLE.boards.push(api.gatherable({ x, z, mesh: board(), task: 'boards', onGet(p) { api.servant(p, 3, 'for helping build!'); } })));
    api.camZone({ minX: -9, maxX: 4, minZ: 11, maxZ: 22, yaw: -0.4, height: 8, back: 12, focus: [1.4, 4, 15], pull: 0.4 });
    api.camZone({ minX: 4, maxX: 11, minZ: 0, maxZ: 15, yaw: 0.45, height: 9, back: 13, focus: [8, 4, 6], pull: 0.4 });
    api.armor('helmet', 0, 38);

    // --- the house of the LORD: the great steps, the porch, the two bronze pillars ---
    api.box({ x: 0, z: -20, w: 12, d: 18, h: 9, color: 0xe7e0cf, house: false, tex: 'stone' });
    api.box({ x: 0, z: -6.4, w: 14, d: 2.2, h: 1.0, color: 0xe7e0cf, house: false });
    api.box({ x: 0, z: -8.6, w: 13, d: 2.2, h: 2.0, color: 0xe7e0cf, house: false });
    api.box({ x: 0, z: -10.4, w: 12, d: 1.6, h: 3.0, color: 0xe7e0cf, house: false });
    [[-3.2, -10.4], [3.2, -10.4]].forEach(([x, z]) => { const c = new T.Mesh(new T.CylinderGeometry(0.55, 0.55, 5.5, 20), api.texMat(0xb87333,'bronze')); c.position.set(x, 3 + 2.75, z); api.add(c); });
    // A stylized cedar-and-stone exterior. Closed doors mark the limit of play;
    // nobody enters the sanctuary. The original solid shell, roofs and steps stay intact.
    const facade=new T.Group();facade.name='temple-facade';TEMPLE.facade=facade;
    const materials=new Map();
    const material=(c,tex)=>{const key=c+':'+tex;if(!materials.has(key))materials.set(key,api.texMat(c,tex));return materials.get(key);};
    const trim=(x,y,z,w,h,d,c=0xd4c6a9,tex='stone')=>{const m=new T.Mesh(new T.BoxGeometry(w,h,d),material(c,tex));m.position.set(x,y,z);facade.add(m);return m;};
    // Front masonry courses and dressed corners stay below the existing walkable roof.
    [1.1,2.1,3.1,4.1,5.1,6.1,7.1,8.1].forEach((y,i)=>{
      trim(0,y,-10.98,11.95,.035,.045,0xb4a58b);
      [-1,1].forEach(sd=>trim(sd*5.7,y+.38,-10.96,.55,.7,.09,i%2?0xd6c7a8:0xe7dbc4));
    });
    // The closed double doors have cedar boards, a dark reveal and bronze fittings.
    trim(0,5.5,-10.91,4.35,5,.08,0x4b392b,'wood');
    [-1,1].forEach(sd=>{
      trim(sd*1.02,5.48,-10.83,1.99,4.66,.12,0x88552f,'wood');
      for(let i=0;i<4;i++)trim(sd*(.23+i*.49),5.48,-10.76,.025,4.58,.035,0x503b2a,'wood');
      [3.5,7.4].forEach(y=>trim(sd*1.02,y,-10.73,1.92,.12,.05,0xb99048,'bronze'));
      trim(sd*.2,5.25,-10.69,.1,.42,.07,0xc4a15b,'bronze');
      // Carved palm stems and paired leaves, without a sacred figure.
      trim(sd*1.12,5.35,-10.73,.065,2.1,.035,0xc3a16a,'wood');
      [-1,1].forEach(leaf=>[0,1,2].forEach(i=>{const m=trim(sd*1.12+leaf*(.15+i*.06),5.7+i*.22,-10.70,.065,.58,.025,0xc3a16a,'wood');m.rotation.z=leaf*(.5+i*.16);}));
      trim(sd*2.34,5.48,-10.83,.28,4.96,.2,0xab7945,'wood');
    });
    trim(0,8.02,-10.83,5,.28,.2,0xab7945,'wood');
    // Low-relief cedar panels flank the door. The dark center seam stays unmistakably closed.
    [-4.4,4.4].forEach(x=>{
      trim(x,5.5,-10.93,2,3.55,.1,0xa16e43,'wood');
      [-.77,.77].forEach(dx=>trim(x+dx,5.5,-10.85,.08,3.25,.05,0xc1a16a,'wood'));
      [4,7].forEach(y=>trim(x,y,-10.85,1.6,.08,.05,0xc1a16a,'wood'));
    });
    // The porch lintel sits above player headroom; bronze capitals retain the original pillar tops.
    trim(0,8.65,-10.45,8.3,.55,.6,0xd9c9a7);
    [-3.2,3.2].forEach(x=>{
      [3.1,3.35,7.65,8.05,8.35].forEach((y,i)=>{
        const ring=new T.Mesh(new T.CylinderGeometry(i===0?.7:.63,i===0?.74:.63,.16,20),material(0xbc8749,'bronze'));ring.position.set(x,y,-10.4);facade.add(ring);
      });
      for(let i=0;i<8;i++){
        const a=i*Math.PI/4,palm=new T.Mesh(new T.SphereGeometry(.15,8,6),material(0xb8884e,'bronze'));
        palm.scale.set(.8,2.4,.55);palm.position.set(x+Math.sin(a)*.51,8.1,-10.4+Math.cos(a)*.51);palm.rotation.z=-Math.sin(a)*.4;facade.add(palm);
      }
    });
    // Side courses and high latticed windows give depth without suggesting another entrance.
    [-1,1].forEach(sd=>{
      for(let i=0;i<8;i++)trim(sd*6.015,1+i,-20,.035,.035,17.9,0xb4a58b);
      [-15.5,-21,-26.5].forEach(z=>{
        trim(sd*6.03,6.7,z,.06,1.7,.75,0x493e31,'wood');
        for(let i=0;i<4;i++)trim(sd*6.07,6.05+i*.42,z,.045,.06,.72,0xb7a17b,'wood');
      });
    });
    api.scenery(facade);

    const gold = new T.Mesh(new T.BoxGeometry(12.2, 0.6, 18.2), api.texMat(0xeab308, 'gold')); gold.position.set(0, 9.1, -20); gold.visible = false; api.add(gold); TEMPLE.gold = gold;
    TEMPLE.courtZone = api.zone({ x: 0, z: -10.4, y: 3, r: 2.2, time: 0.5, color: 0xfde68a, hidden: true,
      onDone(helpers) { api.task('court'); helpers.forEach((p) => api.servant(p, 3)); } });
    for (let i = 0; i < 14; i++) {
      const x = -12 + (i % 7) * 4, z = -1 - Math.floor(i / 7) * 2.6;
      const m = api.crowdPerson(i + 90, [0x7c2d12, 0x1e3a8a, 0x166534, 0xa16207, 0x6b21a8, 0x9f1239, 0x57534e][i % 7], 0xe7e5e4); m.position.set(x, 0, z); m.rotation.y = Math.PI; m.visible = false; api.add(m); TEMPLE.crowd.push(m);
    }
    const cloud = new T.Group();
    for (let i = 0; i < 9; i++) { const c = new T.Mesh(new T.SphereGeometry(2 + (i % 3) * 0.6, 12, 10), new T.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85, fog: false })); c.position.set(Math.cos(i * 0.8) * 3.5, (i % 2) * 1, -20 + Math.sin(i * 0.8) * 6); cloud.add(c); }
    cloud.position.y = 34; cloud.visible = false; api.add(cloud); TEMPLE.cloud = cloud;
    TEMPLE.glory = new T.PointLight(0xfff1b8, 0, 30, 1.5); TEMPLE.glory.position.set(0, 8, -14); api.add(TEMPLE.glory);

    // --- fragments ---
    const sea = new T.Mesh(new T.CylinderGeometry(2.4, 2.0, 1.2, 24), api.mat(0xb87333)); sea.position.set(-11, 0.6, -6); api.add(sea);       // the molten sea (1 Kings 7:23)
    const wtr = new T.Mesh(new T.CircleGeometry(2.2, 24), new T.MeshLambertMaterial({ color: 0x5aa9e6 })); wtr.rotation.x = -Math.PI / 2; wtr.position.set(-11, 1.15, -6); api.add(wtr);
    api.box({ x: -11, z: -6, w: 4, d: 4, h: 1.2, color: 0xb87333, house: false }).mesh.visible = false;
    api.fragment({ x: -11, z: -6, y: 1.5, net: true });
    api.box({ x: -13, z: 34, w: 3, d: 3, h: 5, color: 0xd6c9a8, house: false });
    api.box({ x: -10.5, z: 36.6, w: 1.6, d: 1.6, h: 2.0, color: 0x8b6b45, house: false });
    api.fragment({ x: -13, z: 34, y: 5 + 1.3 });
    api.box({ x: 12, z: -4, w: 5, d: 5, h: 3.4, color: 0xd1bb92 });                          // a store-house in the court
    [[12, 0, 1.2], [12, -1.4, 2.3]].forEach(([x, z, top]) => TEMPLE.steps.push(api.box({ x, z, w: 1.6, d: 1.4, h: 0.35, y: top - 0.35, hidden: true, color: 0xa0703c })));
    // The same rope path visibly joins each wheel, pulley and storage step.
    TEMPLE.hoistRopes = [];
    TEMPLE.winchPads = [];
    TEMPLE.winchFragment = api.fragment({ x: 12, z: -5, y: 20 });
    TEMPLE.winchFragment.mesh.visible = false;
    const hoistBeam = new T.Mesh(new T.BoxGeometry(7.8,.18,.18),api.texMat(0x8b5e34,'wood')); hoistBeam.position.set(11.9,4.48,-1.4); api.add(hoistBeam);
    const centrePulley = new T.Mesh(new T.TorusGeometry(.2,.055,6,12),api.mat(0xb08d4a)); centrePulley.position.set(12,4.3,-1.4); api.add(centrePulley);
    [[8.2, 1], [15.6, 1]].forEach(([x, z], i) => {
      const pad = api.zone({ x, z, y: 0, r: 1.5, time: 99999, color: 0xf59e0b });
      const wheel = new T.Mesh(new T.TorusGeometry(0.5, 0.1, 8, 16), api.mat(0x8b5e34));
      wheel.position.set(x, 1, z - 1); api.add(wheel);
      const mount = new T.Mesh(new T.BoxGeometry(.2,1.4,.28),api.texMat(0x755236,'wood')); mount.position.set(x,.7,z-1.17); api.add(mount);
      const rubbed = new T.Mesh(new T.TorusGeometry(.18,.05,6,12),api.texMat(0x4a3525,'wood')); rubbed.position.set(x,1,z-1.05); api.add(rubbed);
      const ropeGeometry = new T.BufferGeometry().setFromPoints([new T.Vector3(x,1,z-1), new T.Vector3(x,4.3,-1.4), new T.Vector3(12,4.3,-1.4), new T.Vector3(12,0.2,i ? -1.4 : 0)]);
      const rope = new T.Line(ropeGeometry, new T.LineBasicMaterial({color:0x725a39})); api.add(rope); TEMPLE.hoistRopes.push(rope);
      const beam = new T.Mesh(new T.BoxGeometry(.14,4.4,.14),api.texMat(0x8b5e34,'wood')); beam.position.set(x,2.2,-1.4); api.add(beam);
      const pulley = new T.Mesh(new T.TorusGeometry(.2,.055,6,12),api.mat(0xb08d4a)); pulley.position.set(x,4.3,-1.4); api.add(pulley);
      const spoke = new T.Mesh(new T.BoxGeometry(.8,.08,.08),api.mat(0xb08d4a)); wheel.add(spoke);
      TEMPLE.winchPads.push({ x, z, pad, wheel, latched: false });
      api.interact({ x, z, r: 1.6, label: 'Latch winch ' + (i + 1),
        can: (p) => (api.players().length === 1 && p.role.id === 'builder' ? true : 'Team: stand on both orange winch rings. Solo: the Builder can latch one, then reach the other.'),
        use(p) {
          TEMPLE.winchPads[i].latched = true; this.remove(); wheel.rotation.z = Math.PI / 2;
          p.workT = 0.6; api.sfx('winch');
        }
      });
    });

    api.course([
      { x: 16, z: 42, top: 1, kind: 'block' },
      { x: 17, z: 38.8, top: 2, kind: 'float' },
      { x: 15.5, z: 35.6, top: 3, kind: 'crumble' },
      { x: 17, z: 32.4, top: 4, kind: 'float' },
      { x: 15.5, z: 29.2, top: 5, kind: 'spring' },
      { x: 17, z: 26, top: 9.2, kind: 'float' },
      { x: 15.5, z: 22.8, top: 10, kind: 'crumble' },
      { x: 17, z: 19.6, top: 10.8, kind: 'float' }
    ]);
    api.leaves([[0, 40], [4, 36, 0.9], [6.4, 33.6, 1.8], [0, 26], [-6, 20, 1.1], [-6, 18.2, 2.1], [-2.4, 15, 3.4], [1.4, 15, 4], [5, 12, 1], [8, 8.6, 4.8], [8, 5.8, 3.6], [0, -2]]);
  },

  update(api, dt) {
    const quarry = TEMPLE.quarryCrank;
    TEMPLE.quarryWheel.rotation.z = -quarry.progress * Math.PI * 3;
    if (TEMPLE.quarryOpen && TEMPLE.quarryT < .6) {
      TEMPLE.quarryT = Math.min(.6, TEMPLE.quarryT + dt);
      const k = TEMPLE.quarryT / .6;
      TEMPLE.quarryCrossing.rotation.x = Math.PI / 2 * (1 - k);
      const rope = TEMPLE.quarryRope.geometry.attributes.position;
      rope.setXYZ(2, 2.1, .125 + Math.sin(TEMPLE.quarryCrossing.rotation.x) * 9.2,
        64.6 - Math.cos(TEMPLE.quarryCrossing.rotation.x) * 9.2); rope.needsUpdate = true;
      if (k === 1) {
        TEMPLE.quarryBridge.show(true);
        TEMPLE.quarryBridge.mesh.visible = false; // collision proxy; keep the detailed cedar deck on screen
      }
    }
    if (!TEMPLE.quarryCrossed && TEMPLE.quarryBridge.platform.on && api.activePlayers().some((p) => p.pos.z < 47)) {
      TEMPLE.quarryCrossed = true;
      api.checkpoint({ x: 0, z: 44, label: 'Timber yard checkpoint' });
      api.toast('Into the timber yard! Climb the cedar piles and scaffolds for the carved boards.', 3500);
    }
    TEMPLE.winchPads.forEach((w) => {
      if (!TEMPLE.hoistOpen) api.near(w.x,w.z,1.5).forEach((p) => { if (Math.abs(p.pos.y)<.6) {p.workT = .2;api.gesture(p,'work',[w.x,1,w.z-1],.35);} });
    });
    if (TEMPLE.hoistOpen && TEMPLE.hoistT < 0.22) {
      TEMPLE.hoistT = Math.min(.22, TEMPLE.hoistT + dt); const k = TEMPLE.hoistT/.22;
      TEMPLE.steps.forEach((s,i) => {
        s.mesh.position.y = .18 + (s.mesh.userData.hoistY-.18)*k;
        const a = TEMPLE.hoistRopes[i].geometry.attributes.position;
        a.setY(3,s.mesh.position.y+.18); a.needsUpdate = true;
        if (k===1) s.platform.on = true;
      });
      TEMPLE.winchPads.forEach((w) => { w.wheel.rotation.z = k*Math.PI*2; });
    }
    if (!TEMPLE.hoistOpen && TEMPLE.winchFragment.shadow) TEMPLE.winchFragment.shadow.visible = false;
    if (!TEMPLE.hoistOpen && TEMPLE.winchPads.every((w) => w.latched || api.near(w.x, w.z, 1.5).some((p) => Math.abs(p.pos.y) < 0.6))) {
      TEMPLE.hoistOpen = true;
      TEMPLE.hoistT = 0;
      TEMPLE.steps.forEach((s) => { s.show(true); s.platform.on = false; s.mesh.userData.hoistY = s.mesh.position.y; s.mesh.position.y = 0.18; });
      TEMPLE.winchPads.forEach((w) => w.pad.show(false));
      TEMPLE.winchFragment.y = TEMPLE.winchFragment.baseY = 4.7; TEMPLE.winchFragment.mesh.visible = true;
      api.activePlayers().forEach((p) => api.servant(p, 3, 'for working the two winches!'));
      api.sfx('winch'); api.toast('🪵 The storage steps are ready! Together you worked the winches.', 3000);
    }
    if (!TEMPLE.finished && api.taskDone('boards')) {
      TEMPLE.finished = true;
      api.story([
        { art: '🗓️', title: 'Seven years later', text: 'So was he seven years in building it.', ref: '1 Kings 6:38' }
      ], () => {
        TEMPLE.scaffold.forEach((b) => { if (b.show) b.show(false); else if (b.mesh) b.mesh.visible = false; });
        TEMPLE.lift.mesh.visible = false; TEMPLE.lift.platform.on = false;
        TEMPLE.gold.visible = true; TEMPLE.crowd.forEach((m) => { m.visible = true; });
        api.players().forEach((p, i) => { p.pos.set(-2 + i * 1.4, 0, 2); p.vel.set(0, 0, 0); p.lastSafe.copy(p.pos); });   // the scaffolds are gone: everyone is in the court
        TEMPLE.courtZone.show(true);
        api.toast('🏛️ The house is finished! Climb the great steps; the people gather in the court.', 4000);
      });
    }
    if (TEMPLE.cloudT >= 0) {
      const k = Math.min(1, (api.time - TEMPLE.cloudT) / 4);
      TEMPLE.cloud.position.y = 34 - k * 22; TEMPLE.glory.intensity = k * 2.4; TEMPLE.cloud.rotation.y += dt * 0.08;
    }
  },

  objective(api) {
    const ps = api.activePlayers();
    if (!ps.length) return null;
    if (!TEMPLE.quarryCrossed && ps.every((p) => p.pos.z > 47)) {
      const front = Math.min(...ps.map((p) => p.pos.z));
      if (front > 76.5) return [-2, 1.5, 75];
      if (front > 73.7) return [0, 2, 72.5];
      if (front > 71.2) return [2, 1.5, 70];
      if (!TEMPLE.quarryOpen) return [3.4, 1.5, 66.5];
      return [0, 1.5, 54.5];
    }
    const b = TEMPLE.boards.find((it) => !it.got);
    if (b) return [b.x, b.y + 1, b.z];
    if (!api.taskDone('court')) return [0, 4, -10.4];
    return [TEMPLE.COURT[0], 1.5, TEMPLE.COURT[1]];
  },

  finale: {
    message: '🏛️ Everyone gather in the court with the people!',
    beacon: [0, 3, -3],
    inZone(p) { return Math.hypot(p.pos.x - TEMPLE.COURT[0], p.pos.z - TEMPLE.COURT[1]) < 6 || (p.pos.y > 2.5 && Math.abs(p.pos.z + 10) < 2.5); },
    onUpdate(api, t) {
      if (t > 0.3 && TEMPLE.cloudT < 0) { TEMPLE.cloudT = api.time; TEMPLE.cloud.visible = true; api.sfx('fanfare'); }
      if (t > 4.8 && !TEMPLE.told) {
        TEMPLE.told = true;
        api.story([
          { art: '☁️', title: 'The glory of the LORD', text: 'And it came to pass, when the priests were come out of the holy place, that the cloud filled the house of the LORD, So that the priests could not stand to minister because of the cloud: for the glory of the LORD had filled the house of the LORD.', ref: '1 Kings 8:10–11' },
          ...(api.shownRef('1 Kings 8:27') ? [] : [{ art: '🌌', title: 'Heaven cannot contain thee', text: 'But will God indeed dwell on the earth? behold, the heaven and heaven of heavens cannot contain thee; how much less this house that I have builded?', ref: '1 Kings 8:27' }]),
          { art: '✝️', title: 'God with us', text: 'Solomon knew no building could hold God. Many years later, Jesus said His own body was the temple (John 2:19–21). In Jesus, God came to live among us.' }
        ], () => { TEMPLE.endT = api.time; api.sfx('win'); });
      }
      return TEMPLE.endT !== undefined && api.time - TEMPLE.endT > 2;
    }
  }
};
