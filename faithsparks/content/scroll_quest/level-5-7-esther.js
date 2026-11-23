/* =====================================================================
 * LEVEL 5-7: FOR SUCH A TIME  (Esther 4-8)
 * ---------------------------------------------------------------------
 * Shushan, the Persian capital. The palace is to the south (z -10..-32), the city to the north.
 * Haman's wicked plan to destroy the Jews is told on story cards (never played).
 *   1. Gather the Jews of Shushan to Mordecai to fast for Esther (Esther 4:16: the verse says fast).
 *   2. Walk with Queen Esther through the palace courts to the king. Going in uninvited could cost
 *      her life... the king holds out the golden sceptre.
 *   3. The king sends a new letter. Pick up the satchel of letters, then run ONE loop past the five
 *      province gates: each rider takes a letter as you pass and gallops off.
 *      (The posts went out "being hastened": a countdown bonus. It never fails the level.)
 * God's name is not written in the book of Esther, but He was at work all the way through.
 * Only edit THIS file to change the level. See GEMINI.md and CAMPAIGN.md.
 * ===================================================================== */

const ESTHER = {
  MORDECAI: [0, 8],
  THRONE: [0, -27],
  TABLE: [-5, -19],
  GATES: [[-19, 22], [19, 22], [-19, -4], [19, -4], [0, 34]],
  people: [],
  letters: [],
  riders: [],
  esther: null
};

const LEVEL = {
  id: '5-7',
  bibleConnection: {"passage": "Esther 4–9", "text": "Haman plotted the Jews’ destruction. Esther risked her life, her people fasted, and the plot was overturned. Our palace journey and letters explore that danger and courage; Esther’s request was far more serious than winning a race."},
  world: 'World 5-7',
  title: 'For Such a Time',
  town: true,                 // houses get doors, windows, awnings (engine house kit)
  leafIcon: '👑',
  leafColor: 0xfacc15,
  leafShape: 'round',
  spawn: [2, 18],
  bounds: { minX: -21, maxX: 21, minZ: -34, maxZ: 36 },
  approach: ['stones', 'mover', 'crumbles'],   // the way in (engine): a stretch before the level's own start
  startMessage: 'Gather the Jews of Shushan to Mordecai, to fast for Queen Esther.',

  intro: [
    { text: 'For if thou altogether holdest thy peace at this time, then shall there enlargement and deliverance arise to the Jews from another place; but thou and thy father’s house shall be destroyed: and who knoweth whether thou art come to the kingdom for such a time as this?', ref: 'Esther 4:14' },
    { text: 'The king’s heart is in the hand of the LORD, as the rivers of water: he turneth it whithersoever he will.', ref: 'Proverbs 21:1' }
  ],

  introStory: [
    { art: '😠', title: 'A wicked plan', text: 'A proud man named Haman hated Mordecai, Esther\'s cousin, because Mordecai would not bow down to him. So Haman tricked the king into a law to destroy all the Jews.' },
    { art: '📜', title: 'For such a time as this', text: 'For if thou altogether holdest thy peace at this time, then shall there enlargement and deliverance arise to the Jews from another place; but thou and thy father’s house shall be destroyed: and who knoweth whether thou art come to the kingdom for such a time as this?', ref: 'Esther 4:14' },
    { art: '🙏', text: 'Go, gather together all the Jews that are present in Shushan, and fast ye for me, and neither eat nor drink three days, night or day: I also and my maidens will fast likewise; and so will I go in unto the king, which is not according to the law: and if I perish, I perish.', ref: 'Esther 4:16' }
  ],

  tasks: [
    { id: 'gather', icon: '🙏', label: 'Gather the Jews to Mordecai to fast', total: 5 },
    { id: 'court', icon: '👑', label: 'Walk with Esther to the king', total: 1, lockedUntil: 'gather' },
    { id: 'letters', icon: '📜', label: 'Run the king\'s letter to every gate', total: 5, lockedUntil: 'court' }
  ],

  memoryVerse: { text: 'And we know that all things work together for good to them that love God, to them who are the called according to his purpose.', ref: 'Romans 8:28' },

  ending: {
    verse: { text: 'The Jews had light, and gladness, and joy, and honour.', ref: 'Esther 8:16' },
    message: 'Esther was brave, God\'s people fasted, and God turned a terrible plan into a day of joy.'
  },

  quiz: [
    { q: 'What did Esther ask everyone to do before she went to the king?', ref: 'Esther 4:16', options: ['Hide', 'Fast for three days', 'Bring presents'], answer: 1 },
    { q: 'What did the king hold out to Esther?', ref: 'Esther 5:2', options: ['A golden sceptre', 'A sword', 'A scroll'], answer: 0 },
    { q: 'What did Mordecai say Esther might be queen for?', ref: 'Esther 4:14', options: ['Riches', 'Such a time as this', 'Fun'], answer: 1 }
  ],

  music: {
    bpm: 98,
    notes: [64, 0, 68, 71, 73, 0, 71, 68, 69, 0, 66, 0, 64, 0, 0, 0,
            68, 0, 71, 73, 76, 0, 73, 71, 69, 0, 68, 0, 66, 64, 0, 0],
    bass: [40, 40, 45, 45, 47, 47, 40, 40]
  },

  onCallText(kind, n) {
    if (kind === 'Queen Esther') return 'Queen Esther walks with you, bravely, to the king.';
    if (ESTHER.saidCall) return '';                                    // (said once; after that they just come)
    ESTHER.saidCall = true;
    return n > 1 ? n + ' people follow you to Mordecai.' : 'Someone follows you to Mordecai.';
  },

  /* ---------- ground shape ---------- */
  terrain(x, z) {
    let h = Math.sin(x * 0.3) * Math.cos(z * 0.22) * 0.08;
    const pd = Math.hypot(x - 9, z + 20);                                // the palace garden pool
    if (pd < 2.6) h -= 1.8 * Math.min(1, (2.6 - pd) / 0.9);
    return h;
  },

  groundColor(x, z, h) {
    if (h < -0.8) return 0x3b82c4;
    if (z < -10 && Math.abs(x) < 12) return (Math.floor(x / 2) + Math.floor(z / 2)) % 2 ? 0xe5d3a8 : 0xd9c79c;   // palace courts
    return (Math.floor(x / 3) + Math.floor(z / 3)) % 2 ? 0xc6b088 : 0xbca67e;
  },

  /* ---------- build ---------- */
  build(api) {
    const T = api.THREE;
    const person = (robe, scarf, s, o) => api.person(robe, scarf, s, o);   // friendly round townsfolk (engine)
    const wallC = 0xd8c39a;

    // --- the palace: outer court wall with a gate, the throne room ---
    api.box({ x: -7.5, z: -10, w: 9, d: 1, h: 3.6, color: wallC });
    api.box({ x: 7.5, z: -10, w: 9, d: 1, h: 3.6, color: wallC });
    api.box({ x: -12, z: -21, w: 1, d: 23, h: 3.6, color: wallC });
    api.box({ x: 12, z: -21, w: 1, d: 23, h: 3.6, color: wallC });
    api.box({ x: 0, z: -32, w: 25, d: 1.4, h: 5.5, color: 0xcbb38a });
    // inner court gate posts
    [-2.4, 2.4].forEach((dx) => api.box({ x: dx, z: -22, w: 0.8, d: 0.8, h: 3.2, color: 0xb59a6d }));
    [-9, -5.5, 5.5, 9].forEach((x) => api.box({ x, z: -22, w: 3.5, d: 0.6, h: 2.2, color: 0xcbb38a }));
    // the throne and the king
    const [kx, kz] = ESTHER.THRONE;
    const dais = new T.Mesh(new T.BoxGeometry(4, 0.4, 3), api.mat(0x7c3aed)); dais.position.set(kx, 0.2, kz - 2.2); api.add(dais);
    const throne = new T.Mesh(new T.BoxGeometry(1.6, 2.2, 1), api.mat(0xd4a017)); throne.position.set(kx, 1.3, kz - 3); api.add(throne);
    const king = person(0x6d28d9, 0xfacc15); king.position.set(kx, 0.4, kz - 2.4); api.add(king); ESTHER.king = king;
    const sceptre = new T.Mesh(new T.CylinderGeometry(0.05, 0.05, 1.4, 6), new T.MeshLambertMaterial({ color: 0xfacc15, emissive: 0x5a4500 }));
    sceptre.position.set(0.45, 1.0, 0.2); sceptre.rotation.x = 0.2; king.add(sceptre); ESTHER.sceptre = sceptre;
    // royal garden pool
    const pool = new T.Mesh(new T.CircleGeometry(2.5, 24), new T.MeshLambertMaterial({ color: 0x60a5fa, transparent: true, opacity: 0.8 }));
    pool.rotation.x = -Math.PI / 2; pool.position.set(9, -0.5, -20); api.add(pool);

    // --- Queen Esther ---
    const est = person(0xbe185d, 0xfde68a);
    const crown = new T.Mesh(new T.CylinderGeometry(0.2, 0.22, 0.16, 8), new T.MeshLambertMaterial({ color: 0xfacc15, emissive: 0x5a4500 })); crown.position.y = 1.66; est.add(crown);
    ESTHER.esther = api.follower({ x: -7, z: -15, kind: 'Queen Esther', mesh: est,
      deliverTo: { x: kx, z: kz + 1, r: 2.2 },
      parkAt: [kx, 0, kz + 0.4],
      onDeliver(p) { api.task('court'); api.servant(p, 6, 'for standing with Esther!'); LEVEL._sceptre(api); } });
    ESTHER.esther.callable = () => (api.taskDone('gather') ? true : 'Queen Esther is fasting. Gather the people first.');

    // --- the city: houses, Mordecai at the king's gate, the people to gather ---
    [[-12, 28, 4], [10, 30, 4], [-15, 8, 4], [14, 10, 3.5], [-6, 22, 3], [6, 20, 3], [-9, 0, 3.5], [8, 0, 3]].forEach(([x, z, w]) => api.box({ x, z, w, d: w, h: 3, color: 0xd2bd92 }));
    const mord = person(0x1e3a8a, 0x57534e, 1, { age: 'elder', beard: true }); mord.position.set(ESTHER.MORDECAI[0] + 1.6, 0, ESTHER.MORDECAI[1] - 1.4); api.add(mord);
    const ring = new T.Mesh(new T.RingGeometry(3.1, 3.4, 30), new T.MeshBasicMaterial({ color: 0xfde68a, transparent: true, opacity: 0.5, side: T.DoubleSide }));
    ring.rotation.x = -Math.PI / 2; ring.position.set(ESTHER.MORDECAI[0], 0.06, ESTHER.MORDECAI[1]); api.add(ring);
    [[-16, 24], [15, 26], [-17, 2], [17, 5], [3, 31]].forEach(([x, z], i) => {
      ESTHER.people.push(api.follower({ x, z, kind: 'person', mesh: person([0x57534e, 0x9a3412, 0x0e7490, 0x4d7c0f, 0x7c3aed][i], 0xd6d3d1),
        deliverTo: { x: ESTHER.MORDECAI[0], z: ESTHER.MORDECAI[1], r: 3.2 },
        parkAt: (f) => { const k = ESTHER.people.indexOf(f), a = k / 5 * Math.PI * 2; return [ESTHER.MORDECAI[0] + Math.cos(a) * 2.2, 0, ESTHER.MORDECAI[1] + Math.sin(a) * 2.2]; },
        onDeliver(p, f) {
          api.task('gather'); api.servant(p, 4, 'for gathering God\'s people!');
          f.mesh.scale.y = 0.8;                                         // kneeling in prayer
          if (api.taskDone('gather')) api.toast('🙏 For three days God\'s people fasted. Then Esther put on her royal clothes. Walk with her to the king!', 4500);   // (the task board counts the others)
        } }));
    });

    // --- the king's letters on the scribes' table, and the five gates with riders ---
    const [ttx, ttz] = ESTHER.TABLE;
    const table = new T.Mesh(new T.BoxGeometry(2.6, 0.15, 1.2), api.mat(0x6b4f2a)); table.position.set(ttx, 0.8, ttz); api.add(table);
    // one satchel of sealed letters; each rider takes one as you run past the gate (a loop, not five round trips)
    const sat = new T.Group();
    const bag = new T.Mesh(new T.BoxGeometry(0.7, 0.5, 0.3), api.mat(0x7c4a1e)); sat.add(bag);
    for (let k = 0; k < 3; k++) { const sc = new T.Mesh(new T.CylinderGeometry(0.09, 0.09, 0.55, 8), api.mat(0xf5e6c4)); sc.rotation.z = Math.PI / 2; sc.position.set(0, 0.32, -0.1 + k * 0.1); sat.add(sc); }
    const seal = new T.Mesh(new T.CylinderGeometry(0.08, 0.08, 0.04, 8), api.mat(0xb91c1c)); seal.rotation.x = Math.PI / 2; seal.position.set(0, 0, 0.16); sat.add(seal);
    ESTHER.satchel = api.gatherable({ x: ttx, z: ttz + 1.6, mesh: sat, onGet() { api.sfx('coin'); } });
    ESTHER.satchel.hidden = true; sat.visible = false;                 // the letter is not written yet
    ESTHER.GATES.forEach(([gx, gz]) => ESTHER.letters.push({ x: gx * 0.86, z: gz + (gz === 34 ? -2 : 0), delivered: false }));
    ESTHER.GATES.forEach(([gx, gz]) => {
      const side = gz === 34;
      api.box({ x: gx + (side ? -2.2 : 0), z: gz + (side ? 0 : -2.2), w: side ? 1 : 1, d: 1, h: 3.4, color: 0xb59a6d });
      api.box({ x: gx + (side ? 2.2 : 0), z: gz + (side ? 0 : 2.2), w: 1, d: 1, h: 3.4, color: 0xb59a6d });
      const g = new T.Group();
      const horse = new T.Mesh(new T.BoxGeometry(0.7, 0.8, 1.8), api.mat(0x7c5a3a)); horse.position.y = 0.9; g.add(horse);
      const neck = new T.Mesh(new T.BoxGeometry(0.4, 0.8, 0.4), api.mat(0x7c5a3a)); neck.position.set(0, 1.4, 0.8); neck.rotation.x = -0.4; g.add(neck);
      const rider = person(0x0f766e, 0xf5f5f4, 0.8); rider.position.y = 1.1; g.add(rider);
      const rx = gx * 0.86, rz = gz + (side ? -2 : 0);
      g.position.set(rx, 0, rz); g.rotation.y = side ? 0 : (gx > 0 ? Math.PI / 2 : -Math.PI / 2); api.add(g);
      ESTHER.riders.push({ g, x: rx, z: rz, dx: side ? 0 : Math.sign(gx), dz: side ? 1 : 0, go: undefined });
    });

    // --- fragments ---
    // 1: the palace garden pool (the Fisherman nets it)
    api.hazard({ x: 9, z: -20, r: 2.3 }, { maxY: -0.6, except: (p) => p.role.id === 'fisherman', msg: 'Splash! The garden pool is deep (the Fisherman can wade).' });
    api.fragment({ x: 9, z: -20, y: 0.2, net: true });
    // 2: crumbling stones up onto the palace wall
    [[-15, -12, 1.2], [-15, -14.4, 2.4], [-14.4, -16.8, 3.4]].forEach(([x, z, t]) => api.crumble({ x, z, top: t }));
    api.fragment({ x: -12, z: -19, y: 3.6 + 1.3 });
    // 3: a spring up onto a city tower
    api.box({ x: 16, z: 16, w: 2.4, d: 2.4, h: 4.2, color: 0xc0a679 });
    api.spring({ x: 16, z: 12.8 });
    api.fragment({ x: 16, z: 16, y: 4.2 + 1.3 });

    // --- Golden Scroll challenge course: west side of the city ---
    const plan = [['block', 1.0], ['float', 1.0], ['crumble', 0.9], ['float', 0.8], ['spring', 0.2], ['float', 4.2], ['crumble', 0.6]];
    let ctop = 0;
    api.course(plan.map(([kind, rise], i) => {
      const z = 18 - i * 2.4, x = -19.5 + (i % 2 ? 0.3 : -0.3);
      ctop = i === 0 ? api.terrain(x, z) + 1.0 : ctop + rise;
      return { x, z, top: ctop, kind };
    }));

    api.leaves([[0, 24], [-4, 16], [4, 14], [0, 2], [-6, -6], [6, -6], [0, -14], [-6, -26], [6, -26], [-15, -14.4, 3.3], [12, 22], [-12, 14]]);
    // camera: the palace court, where Esther walks up to the king
    api.camZone({ minX: kx - 7, maxX: kx + 7, minZ: kz - 4, maxZ: kz + 10, yaw: 0, height: 9, back: 11, focus: [kx, 1, kz - 2], pull: 0.4 });

    // BEGIN PALACE THEATER ART
    // Shallow painted masonry and capitals stay on the existing palace walls/posts.
    // These are stylized scenery, not an archaeological reconstruction or new entrances.
    const palaceMaterials={stone:api.texMat(0xe5d5ae,'stone'),blue:api.texMat(0x356d89,'clay'),gold:api.texMat(0xb28b3b,'bronze'),cloth:api.texMat(0x6d426e,'cloth')};
    const palaceParts=[];
    const part=(name,x,y,z,r)=>{const g=new T.Group();g.name=name;g.position.set(x,y,z);g.userData.landmark='shushan-palace';palaceParts.push({g,r});return g;};
    const piece=(g,geo,m,x,y,z)=>{const mesh=new T.Mesh(geo,m);mesh.position.set(x-g.position.x,y-g.position.y,z-g.position.z);mesh.castShadow=true;g.add(mesh);return mesh;};
    const trim=(g,x,y,z,w,h,d,m)=>piece(g,new T.BoxGeometry(w,h,d),m,x,y,z);
    [-7.5,7.5].forEach(x=>{
      const base=api.terrain(x,-10),g=part('palace-outer-wing',x,base+1.8,-10,4),face=-9.44;
      // The six-metre opening between the wings remains completely clear.
      trim(g,x,base+.5,face,8.75,.38,.09,palaceMaterials.blue);
      trim(g,x,base+2.92,face,8.75,.36,.09,palaceMaterials.blue);
      trim(g,x,base+3.18,face+.015,8.8,.075,.1,palaceMaterials.gold);
      for(const dx of [-3.85,3.85]){
        trim(g,x+dx,base+1.8,face,.42,3.5,.14,palaceMaterials.stone);
        trim(g,x+dx,base+3.36,face+.015,.67,.25,.16,palaceMaterials.gold);
      }
      for(let i=-3;i<=3;i++){
        const rosette=piece(g,new T.CylinderGeometry(.12,.12,.035,8),palaceMaterials.gold,x+i,base+2.92,face+.07);rosette.rotation.x=Math.PI/2;
        trim(g,x+i,base+.5,face+.06,.14,.14,.035,palaceMaterials.stone);
      }
    });
    // A framed royal backdrop behind the king, painted onto the solid rear wall.
    const rearBase=api.terrain(0,-32),rear=part('palace-throne-backdrop',0,rearBase+2.75,-32,4),rearFace=-31.25;
    trim(rear,0,rearBase+.55,rearFace,24.5,.55,.08,palaceMaterials.blue);
    trim(rear,0,rearBase+5.12,rearFace,24.5,.36,.08,palaceMaterials.blue);
    trim(rear,0,rearBase+5.38,rearFace+.015,24.5,.1,.1,palaceMaterials.gold);
    trim(rear,0,rearBase+2.55,rearFace,4.7,3.6,.09,palaceMaterials.cloth);
    for(const x of [-10,-5,5,10]){
      trim(rear,x,rearBase+2.8,rearFace,.42,5.1,.16,palaceMaterials.stone);
      trim(rear,x,rearBase+4.95,rearFace+.02,.7,.3,.18,palaceMaterials.gold);
    }
    for(const x of [-2.45,2.45])trim(rear,x,rearBase+2.55,rearFace+.02,.14,3.85,.12,palaceMaterials.gold);
    trim(rear,0,rearBase+4.43,rearFace+.02,5.05,.16,.12,palaceMaterials.gold);
    for(let i=-10;i<=10;i+=2){const flower=piece(rear,new T.CylinderGeometry(.14,.14,.035,8),palaceMaterials.gold,i,rearBase+5.12,rearFace+.065);flower.rotation.x=Math.PI/2;}
    // Capitals and painted plinths fit inside the original square inner-gate piers.
    for(const x of [-2.4,2.4]){
      const base=api.terrain(x,-22),g=part('palace-inner-pier',x,base+1.6,-22,.55);
      trim(g,x,base+.22,-21.57,.72,.38,.08,palaceMaterials.blue);
      trim(g,x,base+2.82,-21.57,.72,.26,.08,palaceMaterials.blue);
      trim(g,x,base+1.55,-21.56,.4,2.1,.08,palaceMaterials.stone);
      piece(g,new T.CylinderGeometry(.37,.31,.24,12),palaceMaterials.gold,x,base+3.05,-22);
    }
    // Side-wall bands leave the walkable 3.6m wall tops exposed.
    for(const x of [-12,12]){
      const base=api.terrain(x,-21),g=part('palace-court-side',x,base+1.8,-21,4),face=x-Math.sign(x)*.56;
      trim(g,face,base+.5,-21,.08,.35,21.8,palaceMaterials.blue);
      trim(g,face,base+3.08,-21,.08,.22,21.8,palaceMaterials.blue);
      for(const z of [-29,-25,-17,-13])trim(g,face-Math.sign(x)*.02,base+1.85,z,.09,1.5,.16,palaceMaterials.gold);
    }
    palaceParts.forEach(({g,r})=>{api.scenery(g);api.fadeScenery(g,r);});
    ESTHER.palaceArt=palaceParts.map(p=>p.g);
    // END PALACE THEATER ART
  },

  _sceptre(api) {
    ESTHER.sceptre.rotation.x = 1.2; ESTHER.sceptre.position.set(0.3, 1.1, 0.7);
    api.sfx('fanfare');
    api.story([
      { art: '👑', text: 'And it was so, when the king saw Esther the queen standing in the court, that she obtained favour in his sight: and the king held out to Esther the golden sceptre that was in his hand. So Esther drew near, and touched the top of the sceptre.', ref: 'Esther 5:2' },
      { art: '🗣️', title: 'Esther speaks up', text: 'At a special dinner, Esther bravely told the king about Haman\'s wicked plan to destroy her people. The king was angry with Haman, and Haman\'s plan was stopped.' }
    ], () => { api.toast('🏇 The king sent a new letter by riders on horseback (Esther 8:10) so God\'s people can be safe. Grab the satchel of letters from the scribes\' table and run past the riders at all five gates. Hurry!', 4500);
      ESTHER.satchel.hidden = false; ESTHER.satchel.mesh.visible = true;
      ESTHER.cd = api.countdown({ seconds: 100, label: '🏇 The posts are hastened!', onEnd: () => api.toast('The riders still went out. Keep running the letters!', 2600) });
    });
  },

  update(api, dt) {
    if (ESTHER.satchel.got && !api.taskDone('letters')) {
      ESTHER.letters.forEach((L, k) => {
        if (L.delivered) return;
        const p = api.near(L.x, L.z, 2.8)[0];
        if (!p) return;
        L.delivered = true;
        api.task('letters'); api.servant(p, 4, 'for running the good news!');
        ESTHER.riders[k].go = api.time; api.sfx('coin');
        if (api.taskDone('letters') && ESTHER.cd && !ESTHER.cd.over) { ESTHER.cd.stop(); api.activePlayers().forEach((q) => api.servant(q, 5, 'the posts were hastened!')); }
      });
    }
    ESTHER.riders.forEach((r) => {
      if (r.go === undefined) return;
      const k = Math.min(1, (api.time - r.go) / 3);
      r.g.position.set(r.x + r.dx * k * 14, Math.abs(Math.sin(api.time * 14)) * 0.15, r.z + r.dz * k * 14);
      if (k >= 1) r.g.visible = false;
    });
  },

  objective(api) {
    const ps = api.activePlayers();
    if (!ps.length) return null;
    const c = ps[0].pos;
    const near = (list) => list.sort((a, b) => Math.hypot(a[0] - c.x, a[2] - c.z) - Math.hypot(b[0] - c.x, b[2] - c.z))[0];
    if (!api.taskDone('gather')) {
      if (ESTHER.people.some((f) => f.state === 'follow')) return [ESTHER.MORDECAI[0], 1.5, ESTHER.MORDECAI[1]];
      return near(ESTHER.people.filter((f) => f.state === 'idle').map((f) => [f.pos.x, f.pos.y + 2, f.pos.z])) || null;
    }
    const e = ESTHER.esther;
    if (!api.taskDone('court')) return e.state === 'follow' ? [ESTHER.THRONE[0], 1.5, ESTHER.THRONE[1] + 1] : [e.pos.x, e.pos.y + 2, e.pos.z];
    if (!ESTHER.satchel.got) return [ESTHER.satchel.x, ESTHER.satchel.y + 1, ESTHER.satchel.z];
    return near(ESTHER.letters.filter((L) => !L.delivered).map((L) => [L.x, 2, L.z])) || null;
  },

  finale: {
    message: '🎉 Everyone gather with Mordecai: a day of joy!',
    beacon: [ESTHER.MORDECAI[0], 3, ESTHER.MORDECAI[1]],
    inZone(p) { return Math.hypot(p.pos.x - ESTHER.MORDECAI[0], p.pos.z - ESTHER.MORDECAI[1]) < 6; },
    onUpdate(api, t) {
      if (t > 0.5 && !ESTHER.done) {
        ESTHER.done = true;
        ESTHER.people.forEach((f) => { f.mesh.scale.y = 1; });
        api.story([
          { art: '🎉', text: 'The Jews had light, and gladness, and joy, and honour.', ref: 'Esther 8:16' },
          { art: '🤲', title: 'God was there', text: 'The book of Esther never says God\'s name. But God was at work the whole time: putting Esther in the palace, giving her courage, and turning the king\'s heart.' },
          ...(api.shownRef('Romans 8:28') ? [] : [{ art: '💛', text: 'And we know that all things work together for good to them that love God, to them who are the called according to his purpose.', ref: 'Romans 8:28' }])
        ], () => { ESTHER.endT = api.time; });
      }
      return ESTHER.endT !== undefined && api.time - ESTHER.endT > 2;
    }
  }
};
