/* =====================================================================
 * LEVEL 2-2: WATER AT THE WELL  (Genesis 24)
 * ---------------------------------------------------------------------
 * Evening outside the city of Nahor, north (z 40) to south (z -40):
 *   The camels (z 20..10)   ten thirsty camels kneel by the trough
 *   The well   (pit, z 6..-4) go DOWN to the well by the winding ramp or the slow lift
 *   The city   (z -16..-40) lead camels to Laban's house
 * Tasks: carry 5 jars of water up to the trough; lead 3 camels to Laban's house.
 * Only edit THIS file to change the level. See GEMINI.md and CAMPAIGN.md.
 * ===================================================================== */

const WELL = {
  jars: [],
  camels: [],
  FLOOR: -4,
  TROUGH: [0, 12],
  HOUSE: [-6, -30],
  sawWell: false,
  watered: false
};

function wellPit(x, z) { return x > -6.2 && x < 6.2 && z > -4.4 && z < 6.2; }
function wellTrench(x, z) { return x > -9.2 && x < -6.2 && z > -4.4 && z < 8; }
function wellShaft(x, z) { return x > 6.2 && x < 8.2 && z > -0.2 && z < 2.6; }

const LEVEL = {
  id: '2-2',
  bibleConnection: {"passage": "Genesis 24:10–27", "text": "Abraham’s servant prayed for guidance, and Rebekah willingly drew water for him and his camels. Our well and camel tasks let us practise generous service while remembering that God guided the meeting."},
  world: 'World 2-3',
  title: 'Water at the Well',
  town: true,                 // houses get doors, windows, awnings (engine house kit)
  time: 'sunset',
  leafIcon: '💧',
  leafColor: 0x60a5fa,
  leafShape: 'round',
  spawn: [0, 36],
  finishTheme:'welcome',
  bounds: { minX: -19, maxX: 19, minZ: -40, maxZ: 40 },
  approach: ['stones', 'meadow:ox', 'crumbles'],   // the road into Nahor (engine: the way in)
  startMessage: 'Ten tired camels need water! Go down to the well.',

  intro: [
    { text: 'And when she had done giving him drink, she said, I will draw water for thy camels also, until they have done drinking.', ref: 'Genesis 24:19' },
    { text: 'For even the Son of man came not to be ministered unto, but to minister, and to give his life a ransom for many.', ref: 'Mark 10:45' }
  ],

  introStory: [
    { art: '🙏', text: 'And he said, O LORD God of my master Abraham, I pray thee, send me good speed this day, and shew kindness unto my master Abraham.', ref: 'Genesis 24:12' },
    { art: '🏺', text: 'And it came to pass, before he had done speaking, that, behold, Rebekah came out, who was born to Bethuel, son of Milcah, the wife of Nahor, Abraham\'s brother, with her pitcher upon her shoulder.', ref: 'Genesis 24:15' }
  ],

  tasks: [
    { id: 'water', icon: '🏺', label: 'Water the camels', total: 5 },
    { id: 'camels', icon: '🐪', label: 'Lead or ride camels to Laban\'s house', total: 3, lockedUntil: 'water' }
  ],

  memoryVerse: { text: 'For even the Son of man came not to be ministered unto, but to minister, and to give his life a ransom for many.', ref: 'Mark 10:45' },

  ending: {
    verse: { text: 'And they called Rebekah, and said unto her, Wilt thou go with this man? And she said, I will go.', ref: 'Genesis 24:58' },
    message: 'Rebekah served gladly, and God led the way. Serve others with joy!'
  },

  quiz: [
    { q: 'What did the servant ask God for?', ref: 'Genesis 24:12', options: ['Good speed and kindness for Abraham', 'A faster camel', 'Gold and silver'], answer: 0 },
    { q: 'What did Rebekah offer to do?', ref: 'Genesis 24:19', options: ['Sell him bread', 'Draw water for his camels too', 'Show him the way home'], answer: 1 },
    { q: 'What did Rebekah say when they asked if she would go?', ref: 'Genesis 24:58', options: ['"Maybe tomorrow"', '"No"', '"I will go"'], answer: 2 }
  ],

  music: {
    bpm: 92,
    notes: [62, 0, 66, 0, 69, 0, 67, 66, 64, 0, 62, 0, 61, 0, 62, 0,
            66, 0, 69, 0, 71, 69, 67, 66, 64, 0, 66, 0, 62, 0, 0, 0],
    bass: [38, 38, 45, 45, 43, 43, 38, 38]
  },

  onCallText() {                                                       // said once; after that the camel's walk says it
    if (WELL.saidCall) return '';
    WELL.saidCall = true;
    return 'The camel gets up and follows you to Laban\'s house!';
  },

  /* ---------- ground shape ---------- */
  terrain(x, z) {
    if (wellPit(x, z) || wellShaft(x, z)) return WELL.FLOOR;
    if (wellTrench(x, z)) return WELL.FLOOR * Math.max(0, Math.min(1, (8 - z) / 10));   // the winding ramp down
    return Math.sin(x * 0.35) * Math.cos(z * 0.25) * 0.2 + Math.max(0, Math.abs(x) - 16) * 1.2;
  },

  groundColor(x, z, h) {
    if (wellPit(x, z) || wellShaft(x, z)) return 0x9c8a6e;
    if (wellTrench(x, z)) return (Math.floor(z) % 2) ? 0xb8a27e : 0xae9874;
    if (z < -16) return 0xc9b48a;
    return 0xb9a46f;
  },

  /* ---------- build ---------- */
  build(api) {
    const T = api.THREE;
    const F = WELL.FLOOR;
    const person = (robe, scarf, s, o) => api.person(robe, scarf, s, o);   // friendly round townsfolk (engine)
    const camelMesh = (kneel) => api.animalMesh('camel', { kneel });     // friendly round camels (engine); resting ones fold their legs
    const wall = (x, z, w, d) => api.box({ x, z, w, d, h: 0.3 - (F - 0.5), y: F - 0.5, color: 0xa8a29e });   // stone walls, a low curb at the top

    // --- the well courtyard: walls, ramp, lift ---
    wall(0.9, 6.4, 15.0, 0.4);                 // north wall of the pit (and shaft)
    wall(-0.5, -4.6, 17.8, 0.4);               // south wall (pit, trench and shaft)
    wall(6.4, -2.2, 0.4, 4.0);                 // east wall, below the lift opening
    wall(6.4, 4.4, 0.4, 3.6);                  // east wall, above the lift opening
    wall(7.3, -0.4, 1.8, 0.4); wall(7.3, 2.8, 1.8, 0.4); wall(8.4, 1.2, 0.4, 3.6);   // lift shaft
    wall(-9.4, 1.8, 0.4, 12.4);                // outer wall of the ramp
    wall(-6.4, 2.2, 0.4, 8.0);                 // between the ramp and the pit (open at the bottom)
    WELL.lift = api.mover({ w: 1.8, h: 0.35, d: 2.6, color: 0x8b5e34, path: [[7.3, F - 0.35, 1.2], [7.3, -0.05, 1.2]], speed: 2, wait: 1.4 });
    api.stump(0, 1, 1.0, 1.1);                 // the well
    const water = new T.Mesh(new T.CircleGeometry(0.85, 16), new T.MeshLambertMaterial({ color: 0x2563eb })); water.rotation.x = -Math.PI / 2; water.position.set(0, F + 0.7, 1); api.add(water);
    const beam = new T.Mesh(new T.BoxGeometry(2.6, 0.15, 0.15), api.mat(0x6b4f2a)); beam.position.set(0, F + 2.3, 1); api.add(beam);
    [-1.2, 1.2].forEach((dx) => { const post = new T.Mesh(new T.BoxGeometry(0.15, 2.3, 0.15), api.mat(0x6b4f2a)); post.position.set(dx, F + 1.15, 1); api.add(post); });
    const reb = person(0xbe185d, 0xfde68a); reb.position.set(-1.8, F, 2.4); api.add(reb); WELL.rebekah = reb;

    // --- water jars at the bottom of the well courtyard ---
    const jarMesh = (big) => { const g = new T.Group(); const j = new T.Mesh(new T.CylinderGeometry(big ? 0.38 : 0.28, big ? 0.5 : 0.38, big ? 0.95 : 0.7, 12), api.mat(big ? 0x9a3412 : 0xc2410c)); g.add(j); return g; };
    [[-4, 4.4, false], [-3.8, -2.6, true], [-1, 4.8, false], [2.2, 4.8, false], [-1.8, -3, true]].forEach(([x, z, heavy]) => {
      WELL.jars.push(api.carryable({
        x, z, mesh: jarMesh(heavy), heavy, name: 'water jar', to: 'the camels\' trough',
        deliverTo: { x: WELL.TROUGH[0], z: WELL.TROUGH[1], r: 3 },
        onDeliver(p) {
          api.task('water');
          api.servant(p, 5, 'for serving thirsty camels!');
          WELL.troughWater.scale.y = Math.min(1, api.taskCount('water') / 5); WELL.troughWater.visible = true;
          // (the task board counts it: no pop-up)
        }
      }));
    });

    // --- the trough and the ten camels ---
    const [tx, tz] = WELL.TROUGH;
    api.box({ x: tx, z: tz - 1.6, w: 5, d: 1, h: 0.7, color: 0x78716c });
    WELL.troughWater = new T.Mesh(new T.BoxGeometry(4.6, 0.5, 0.6), new T.MeshLambertMaterial({ color: 0x3b82f6 }));
    WELL.troughWater.position.set(tx, 0.45, tz - 1.6); WELL.troughWater.visible = false; api.add(WELL.troughWater);
    const servant = person(0x4d7c0f, 0xf5f5f4, 1, { beard: 0x57534e, belt: 0x6b4a2b }); servant.position.set(tx + 3.4, api.terrain(tx + 3.4, tz), tz); api.add(servant);
    [[-6, 15], [-3, 17], [3, 17], [6, 15], [-7, 19], [7, 19], [-4, 21]].forEach(([x, z]) => {
      const c = camelMesh(true); c.position.set(x, api.terrain(x, z), z); c.rotation.y = Math.atan2(tx - x, tz - z); api.add(c);
    });
    [[0, 18.5], [4, 21], [-1, 22.5]].forEach(([x, z]) => {
      const c = api.follower({
        x, z, kind: 'camel', mesh: camelMesh(false), ride: true, seat: 1.45, rideSpeed: 1.4,   // climb on and ride (Y), or call it to follow (B)
        deliverTo: { x: WELL.HOUSE[0], z: WELL.HOUSE[1] + 5, r: 3.2 },
        parkAt: (f) => { const i = WELL.camels.indexOf(f); return [WELL.HOUSE[0] + 4 + i * 1.6, api.terrain(0, WELL.HOUSE[1] + 4), WELL.HOUSE[1] + 4]; },
        onDeliver(p) {
          api.task('camels');
          api.servant(p, 4, 'for caring for the camels!');
          // (the task board counts it: no pop-up)
        }
      });
      c.state = 'parked';
      WELL.camels.push(c);
    });

    // --- the city of Nahor ---
    api.box({ x: -11, z: -16, w: 16, d: 0.8, h: 3.2, color: 0xd6c39c });
    api.box({ x: 11, z: -16, w: 16, d: 0.8, h: 3.2, color: 0xd6c39c });
    [[-3.6, -16], [3.6, -16]].forEach(([x, z]) => api.box({ x, z, w: 1.4, d: 1.4, h: 4.2, color: 0xc9b48a }));   // gate towers
    const [hx, hz] = WELL.HOUSE;
    api.box({ x: hx, z: hz - 4, w: 8, d: 5, h: 3.6, color: 0xe7d6b0 });
    const door = new T.Mesh(new T.BoxGeometry(1.4, 2.2, 0.1), api.mat(0x78350f)); door.position.set(hx, 1.1, hz - 1.45); api.add(door);
    const laban = person(0x7c3aed, 0xf5f5f4, 1, { beard: true, stripes: 0xf5f5f4 }); laban.position.set(hx - 2.6, api.terrain(hx - 2.6, hz - 0.6), hz - 0.6); api.add(laban);
    [[8, -26], [-14, -24], [10, -34], [-14, -36], [4, -38]].forEach(([x, z]) => api.box({ x, z, w: 4.4, d: 4.4, h: 3, color: 0xd8c39c }));
    [[-10, 38], [15, 26], [-16, 6], [16, 8], [-10, 27]].forEach(([x, z]) => api.tree(x, z, 1.1, 0x4d7c0f));

    // An imagined caravan helper explains the next task without requiring a particular role.
    const guide=api.person(0x47847b,0xe2cc99,.95,{beard:true});guide.position.set(-3.8,api.terrain(-3.8,12),12);api.add(guide);
    WELL.guide=api.conversation({person:guide,label:'Ask about the water jars',speaker:'A caravan helper',clue(){
      if(!api.taskDone('water')){const j=WELL.jars.find(j=>!j.delivered&&!j.holder);return j?{text:'Take a water jar up the ramp to the camels’ trough.',at:[j.x,j.y+1,j.z]}:{text:'Carry the jars to the camels’ trough.',at:[WELL.TROUGH[0],1.5,WELL.TROUGH[1]]};}
      const camel=WELL.camels.find(c=>c.state==='idle');return camel?{text:'The camels have water. Call them, or ride one, to the house.',at:[camel.pos.x,camel.pos.y+1,camel.pos.z]}:{text:'Guide the camels to the house ahead.',at:[WELL.HOUSE[0],2,WELL.HOUSE[1]+5]};
    }});
    WELL.ropeKit=api.ropeKit({x:-3.8,z:17,y:api.terrain(-3.8,17)});
    WELL.travelPocket=api.secretPocket({id:'caravan-store',name:'The caravan storeroom',x:-11,z:18,y:1,w:5,d:5});
    api.box({x:-11,z:22,w:3,d:2.5,h:.5,color:0xb99259,tex:'wood',house:false});
    WELL.storeRope=api.ropeAnchor({from:[-3.8,api.terrain(-3.8,20),20],to:[-11,1,18],arc:3.5,label:'Swing to the caravan store'});
    api.ropeAnchor({from:[-11,1,18],to:[-3.8,api.terrain(-3.8,20),20],arc:3.5,label:'Swing back to the road'});
    api.leaves([[-11,20,2],[-11,18,2],[-11.8,17,2]]);

    // --- fragment 1: the turning beam of a water-wheel by the road (kept away from the jar routes) ---
    api.sweeper({ x: 10, z: -8, length: 5.4, speed: 1.5 });
    api.fragment({ x: 10, z: -8, y: api.terrain(10, -8) + 1.3 });

    // --- fragment 2: at the bottom of the well (the Fisherman casts a net) ---
    api.fragment({ x: 0, z: 1, y: F - 1.5, net: true });

    // --- fragment 3: a spring, a ledge and a crumbling step up to the gate tower ---
    api.spring({ x: 13, z: -13.6 });
    api.box({ x: 13, z: -16.4, w: 2.2, d: 2.2, h: 0.4, y: 4.1, color: 0xb59a6d });
    api.crumble({ x: 13, z: -18.8, top: 4.8 });
    api.box({ x: 13, z: -21.4, w: 2.4, d: 2.4, h: 5.0 - api.terrain(13, -21.4), color: 0xc9b48a });
    api.fragment({ x: 13, z: -21.4, y: 5.0 + 1.3 });

    // --- Golden Scroll challenge course: up the west side ---
    const plan = [['block', 1.0], ['float', 1.0], ['crumble', 0.9], ['float', 0.8], ['spring', 0.2], ['float', 4.2], ['crumble', 0.6]];
    let ctop = 0;
    api.course(plan.map(([kind, rise], i) => {
      const z = 32 - i * 2.9, x = -14.5 + (i % 2 ? 0.3 : -0.3);
      ctop = i === 0 ? api.terrain(x, z) + 1.0 : ctop + rise;
      return { x, z, top: ctop, kind };
    }));

    api.leaves([[0, 30], [4, 26], [-3, 26], [-7.8, 6], [-7.8, 2, -2.4 + 1], [-7.8, -2, F + 1], [7.3, 1.2, 1], [-4.5, 1, F + 1], [4.5, 4, F + 1],
      [0, -8], [0, -20], [-6, -22], [6, -24], [13, -16.4, 5.4], [-14.8, 32, 1.9]]);
    // camera: look down into the well and along the ramp
    api.camZone({ minX: -10, maxX: 9, minZ: -5, maxZ: 8, yaw: 0, height: 13, back: 10, focus: [-2, WELL.FLOOR, 1], pull: 0.35 });
  },

  update(api, dt) {
    // reaching the bottom of the well: Rebekah's kindness
    if (!WELL.sawWell && api.activePlayers().some((p) => wellPit(p.pos.x, p.pos.z) && p.pos.y < WELL.FLOOR + 0.5)) {
      WELL.sawWell = true;
      api.story([
        { art: '💛', text: 'And when she had done giving him drink, she said, I will draw water for thy camels also, until they have done drinking.', ref: 'Genesis 24:19' }
      ], () => api.toast('🐪 Ten thirsty camels! Help Rebekah carry the jars up the ramp, or ride the slow lift.', 4000));
    }
    // Rebekah hurries back and forth by the well
    WELL.rebekah.position.x = -1.8 + Math.sin(api.time * 0.8) * 1.2;
    if (!WELL.watered && api.taskDone('water')) {
      WELL.watered = true;
      WELL.camels.forEach((c) => { c.state = 'idle'; });
      api.story([
        { art: '🙌', text: 'And he said, Blessed be the LORD God of my master Abraham, who hath not left destitute my master of his mercy and his truth: I being in the way, the LORD led me to the house of my master\'s brethren.', ref: 'Genesis 24:27' },
      ], () => api.toast('🏠 God answered the prayer! Now bring three camels through the city gate to Laban\'s house. Climb on one and ride it (Y); call the others to follow (B). Rebekah rode a camel too (Genesis 24:61).', 5500));
    }
  },

  objective(api) {
    const ps = api.activePlayers();
    if (!ps.length) return null;
    const cx = ps.reduce((s, p) => s + p.pos.x, 0) / ps.length, cz = ps.reduce((s, p) => s + p.pos.z, 0) / ps.length;
    if (!api.taskDone('water')) {
      const held = ps.find((p) => p.holding && WELL.jars.indexOf(p.holding) >= 0);
      if (held) return held.pos.y < -1 ? [-7.8, 1, 7] : [WELL.TROUGH[0], 2, WELL.TROUGH[1]];
      const j = WELL.jars.filter((it) => !it.delivered && !it.holder).sort((a, b) => Math.hypot(a.x - cx, a.z - cz) - Math.hypot(b.x - cx, b.z - cz))[0];
      if (!j) return null;
      return cz > 6 && ps.every((p) => p.pos.y > -1) ? [-7.8, 1, 7.5] : [j.x, j.y + 1, j.z];
    }
    if (WELL.camels.some((c) => c.state === 'follow' || c.state === 'ridden')) return [WELL.HOUSE[0], 2, WELL.HOUSE[1] + 5];
    const c = WELL.camels.find((cc) => cc.state === 'idle');
    return c ? [c.pos.x, c.pos.y + 3, c.pos.z] : null;
  },

  finale: {
    message: '🏠 Everyone gather at Laban\'s house!',
    beacon: [-6, 3, -25],
    inZone(p) { return Math.hypot(p.pos.x - WELL.HOUSE[0], p.pos.z - (WELL.HOUSE[1] + 4)) < 6; },
    onUpdate(api, t) {
      if (t > 0.5 && !WELL.told) {
        WELL.told = true;
        api.story([
          { art: '🚶‍♀️', text: 'And they called Rebekah, and said unto her, Wilt thou go with this man? And she said, I will go.', ref: 'Genesis 24:58' },
          { art: '✝️', title: 'God keeps His promise', text: 'God was building Abraham\'s family, just as He promised. Many years later, Jesus would be born into this very family.' },
          { art: '💛', text: 'For even the Son of man came not to be ministered unto, but to minister, and to give his life a ransom for many.', ref: 'Mark 10:45' }
        ], () => { WELL.endT = api.time; });
      }
      return WELL.endT !== undefined && api.time - WELL.endT > 2;
    }
  }
};
