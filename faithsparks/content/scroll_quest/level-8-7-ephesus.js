/* =====================================================================
 * LEVEL 8-7: THE UPROAR IN EPHESUS  (Acts 19)
 * ---------------------------------------------------------------------
 * Paul taught about Jesus in Ephesus for two years. North (the disciples' house and the square) to
 * south (the great theatre).
 *   1. People who believed chose to burn their old magic books. Help carry them to the fire.
 *   2. Demetrius the silversmith stirs up the city: "Great is Diana!" Shouting crowds surge through
 *      the streets (they push you along, never harm; the Breastplate stands firm).
 *      Bring Paul's friends Gaius and Aristarchus out of the theatre to the disciples' house.
 *      (Our game's idea: Acts 19:29 says they were rushed into the theatre; the town clerk then
 *      quieted the crowd and dismissed the assembly, Acts 19:35-41. The escort is labelled as made-up.)
 *   3. Paul wants to go in to the crowd; the disciples wouldn't let him (Acts 19:30). Stop him!
 * Then the town clerk calms the people, and Paul goes on his way. Armour of God (Ephesians 6, a
 * letter Paul later wrote to these very believers) lies by the house.
 * Only edit THIS file to change the level. See GEMINI.md and CAMPAIGN.md.
 * ===================================================================== */

const EPH = {
  HOUSE: [-12, 22],
  FIRE: [9, 22],
  THEATRE: [0, -24],
  books: [],
  friends: [],
  crowds: [],
  rioting: false,
  paulStopped: false
};

const LEVEL = {
  id: '8-7',
  bibleConnection: {"passage": "Acts 19:11–41", "text": "People turned from magic to the Lord Jesus, while the gospel threatened the idol trade and a riot followed. Our gathering and theatre routes explore that conflict. God’s power and the spread of His word are not game spells."},
  world: 'World 8-7',
  title: 'The Uproar in Ephesus',
  town: true,                 // houses get doors, windows, awnings (engine house kit)
  leafIcon: '📜',
  leafColor: 0xe9d5a1,
  leafShape: 'round',
  spawn: [-6, 30],
  bounds: { minX: -21, maxX: 21, minZ: -34, maxZ: 35 },
  approach: ['stones', 'meadow:ox', 'crumbles'],   // the way in (engine): a stretch before the level's own start
  startMessage: 'Many believed in Jesus! Help carry their old magic books to the fire.',

  intro: [
    { text: 'So mightily grew the word of God and prevailed.', ref: 'Acts 19:20' },
    { text: 'Put on the whole armour of God, that ye may be able to stand against the wiles of the devil.', ref: 'Ephesians 6:11' }
  ],

  introStory: [
    { art: '📖', text: 'And this continued by the space of two years; so that all they which dwelt in Asia heard the word of the Lord Jesus, both Jews and Greeks.', ref: 'Acts 19:10' },
    { art: '🔥', title: 'A fresh start', text: 'Some of them had used magic books. Now they followed Jesus, so they chose to burn those books, even though they cost a lot of money.' }
  ],

  tasks: [
    { id: 'books', icon: '🔥', label: 'Carry the old magic books to the fire', total: 4 },
    { id: 'friends', icon: '👥', label: 'Bring Gaius and Aristarchus out of the theatre', total: 2, lockedUntil: 'books' },
    { id: 'paul', icon: '✋', label: 'Stop Paul from going into the uproar', total: 1, lockedUntil: 'books' }
  ],

  memoryVerse: { text: 'Put on the whole armour of God, that ye may be able to stand against the wiles of the devil.', ref: 'Ephesians 6:11' },

  ending: {
    verse: { text: 'So mightily grew the word of God and prevailed.', ref: 'Acts 19:20' },
    message: 'Even when a whole city shouted against them, God kept His people safe, and His word kept growing.'
  },

  quiz: [
    { q: 'What did the new believers do with their magic books?', ref: 'Acts 19:19', options: ['Sold them', 'Burned them', 'Hid them'], answer: 1 },
    { q: 'What did the crowd shout?', ref: 'Acts 19:34', options: ['"Great is Diana of the Ephesians"', '"Hosanna"', '"Go home"'], answer: 0 },
    { q: 'What did the disciples do when Paul wanted to go into the theatre?', ref: 'Acts 19:30', options: ['Went with him', 'Did not let him go', 'Ran away'], answer: 1 }
  ],

  music: {
    bpm: 112,
    notes: [64, 0, 66, 68, 69, 0, 68, 66, 64, 0, 61, 0, 64, 0, 0, 0,
            69, 0, 71, 73, 71, 0, 69, 68, 66, 0, 64, 0, 61, 64, 0, 0],
    bass: [40, 40, 45, 45, 47, 47, 40, 40]
  },

  onCallText(kind) {                                                 // said once; after that they just come
    if (EPH.saidCall) return '';
    EPH.saidCall = true;
    return kind === 'Paul' ? 'Paul listens to you.' : 'Paul\'s friend follows you to safety.';
  },

  /* ---------- ground shape ---------- */
  terrain(x, z) {
    let h = Math.sin(x * 0.3) * Math.cos(z * 0.22) * 0.08;
    if (x > 18.5) h -= 2.4 * Math.min(1, (x - 18.5) / 1.2);              // the harbour
    const dz = z - EPH.THEATRE[1];
    if (dz < 0) h += Math.min(5, Math.max(0, Math.hypot(x, dz) - 6) * 0.6);   // theatre seats rise behind the stage
    return h;
  },

  groundColor(x, z, h) {
    if (h < -1) return 0x2f7fb8;
    if (z < -18 && Math.abs(x) < 16) return (Math.floor(Math.hypot(x, z + 24) / 1.2)) % 2 ? 0xd8cbb0 : 0xcfc1a4;   // theatre
    return (Math.floor(x / 2) + Math.floor(z / 2)) % 2 ? 0xd6c8a8 : 0xccbe9e;   // marble street
  },

  /* ---------- build ---------- */
  build(api) {
    const T = api.THREE;
    const person = (robe, scarf, s, o) => api.person(robe, scarf, s, o);   // friendly round townsfolk (engine)

    // --- the disciples' house, the armour of God beside it ---
    const [hx, hz] = EPH.HOUSE;
    api.box({ x: hx, z: hz + 4, w: 7, d: 4, h: 3.4, color: 0xe2d3b0 });
    const ring = new T.Mesh(new T.RingGeometry(2.6, 2.9, 28), new T.MeshBasicMaterial({ color: 0xfde68a, transparent: true, opacity: 0.5, side: T.DoubleSide }));
    ring.rotation.x = -Math.PI / 2; ring.position.set(hx, 0.06, hz); api.add(ring);
    api.armor('breastplate', -4, 28); api.armor('sandals', -1, 26); api.armor('shield', -3, 24);
    const paul = person(0x7c2d12, 0xe7e5e4, 1, { beard: true });
    EPH.paul = api.follower({ x: hx + 2, z: hz - 1, kind: 'Paul', mesh: paul });
    EPH.paul.state = 'parked';
    EPH.paulI = api.interact({ x: 0, z: 0, r: 2.4, label: 'Stop Paul: "Please don\'t go in!"', priority: 3,
      use(p) {
        this.alive = false; EPH.paulStopped = true; api.task('paul'); api.servant(p, 5, 'for looking after Paul!');
        api.story([
          { art: '✋', text: 'And when Paul would have entered in unto the people, the disciples suffered him not.', ref: 'Acts 19:30' }
        ], () => {
          const pa = EPH.paul; pa.pos.set(hx + 1.5, 0, hz - 0.5); pa.mesh.position.copy(pa.pos); pa.state = 'parked';
        });
      } });
    EPH.paulI.alive = false;

    // --- the square and the fire ---
    const [fx, fz] = EPH.FIRE;
    const pit = new T.Mesh(new T.CylinderGeometry(1.3, 1.4, 0.35, 16), api.mat(0x57534e)); pit.position.set(fx, 0.17, fz); api.add(pit);
    const flame = new T.Mesh(new T.ConeGeometry(0.8, 1.6, 10), new T.MeshBasicMaterial({ color: 0xf97316 })); flame.position.set(fx, 1, fz); flame.scale.setScalar(0.4); api.add(flame); EPH.flame = flame;
    const fl = new T.PointLight(0xff9a3c, 1.2, 10, 2); fl.position.set(fx, 2, fz); api.add(fl);
    [[-2, 14], [14, 13], [16, 28], [2, 32]].forEach(([x, z]) => {
      const g = new T.Group();
      for (let k = 0; k < 3; k++) { const b = new T.Mesh(new T.BoxGeometry(0.6, 0.16, 0.45), api.mat([0x7c2d12, 0x4c1d95, 0x14532d][k])); b.position.y = k * 0.17; b.rotation.y = k * 0.5; g.add(b); }
      EPH.books.push(api.carryable({ x, z, mesh: g, name: 'old magic books', to: 'the fire',
        deliverTo: { x: fx, z: fz, r: 2.4 },
        onDeliver(p) {
          api.task('books'); api.servant(p, 3); api.puff(fx, 1.5, fz, 0xfbbf24, 12);
          EPH.flame.scale.setScalar(0.4 + api.taskCount('books') * 0.2);
          if (api.taskDone('books')) LEVEL._uproar(api);   // (the task board counts the others: no pop-up)
        } }));
    });

    // --- streets: columns and shops ---
    [[-16, 6, 4], [14, 4, 4], [-15, -8, 4], [13, -10, 4], [-8, 10, 3], [7, 12, 3]].forEach(([x, z, w]) => api.box({ x, z, w, d: w, h: 3.2, color: 0xe2d3b0 }));
    [-5, 5].forEach((x) => [16, 8, 0, -8].forEach((z) => { const c = new T.Mesh(new T.CylinderGeometry(0.28, 0.32, 4, 10), api.mat(0xf1e7d0)); c.position.set(x, 2, z); api.add(c); }));

    // --- the theatre: a stage, rising rows of seats; Gaius and Aristarchus caught in the crowd ---
    const [tx, tz] = EPH.THEATRE;
    const stage = new T.Mesh(new T.BoxGeometry(10, 0.3, 4), api.mat(0xe7dcc4)); stage.position.set(tx, 0.15, tz + 1); api.add(stage);
    const seated = [];
    for (let i = 0; i < 18; i++) { const a = Math.PI * (0.1 + 0.8 * i / 17), r = 9 + (i % 3) * 2; const x = tx + Math.cos(a) * r, z = tz - Math.sin(a) * r * 0.7; const m = api.crowdPerson(i, [0xb91c1c, 0x0e7490, 0xca8a04, 0x15803d, 0x9d174d, 0x475569][i % 6], 0xf5f5f4); m.position.set(x, api.terrain(x, z), z); m.rotation.y = Math.atan2(tx - x, tz - z); api.add(m); seated.push(m); }
    EPH.seated = seated;
    [['Gaius', 0x1e3a8a, -2], ['Aristarchus', 0x4d7c0f, 2]].forEach(([name, robe, dx]) => {
      const f = api.follower({ x: tx + dx, z: tz, kind: name, mesh: person(robe, 0xd6d3d1),
        deliverTo: { x: hx, z: hz, r: 2.8 },
        parkAt: (fo) => [hx - 1.2 + EPH.friends.indexOf(fo) * 2.4, 0, hz - 1],
        onDeliver(p) { api.task('friends'); api.servant(p, 6, 'for bringing ' + name + ' to safety!'); } });
      f.callable = () => (EPH.rioting ? true : name + ' is listening in the theatre.');
      EPH.friends.push(f);
    });

    // --- the shouting crowds (they surge back and forth across the streets; a push, never harm) ---
    [[6, 13, 3.2], [-3, 12, 2.6], [-12, 12, 3.6]].forEach(([z, amp, sp], i) => {
      const g = new T.Group();
      for (let k = 0; k < 7; k++) { const m = person([0xb91c1c, 0xca8a04, 0x9d174d, 0x92400e][k % 4], 0xf5f5f4); m.position.set((k % 4) * 0.9 - 1.4, 0, Math.floor(k / 4) * 1.0 - 0.5); g.add(m); }
      g.visible = false; api.add(g);
      EPH.crowds.push({ g, z, amp, sp, t: i * 2, x: 0, v: 0 });
    });

    // --- fragments ---
    // 1: the harbour (the Fisherman nets it)
    api.hazard({ x: 20.5, z: 0, w: 4, d: 70 }, { maxY: -0.6, except: (p) => p.role.id === 'fisherman', msg: 'Splash! The harbour is deep (the Fisherman can swim).' });
    api.fragment({ x: 20.4, z: 16, y: 0.2, net: true });
    // 2: crumbling stones up a broken column
    [[-17, 30, 1.2], [-18.4, 27.6, 2.3], [-17, 25.2, 3.4]].forEach(([x, z, t]) => api.crumble({ x, z, top: t }));
    api.box({ x: -17.6, z: 22.6, w: 2.2, d: 2.2, h: 4.4, color: 0xf1e7d0 });
    api.fragment({ x: -17.6, z: 22.6, y: 4.4 + 1.3 });
    // 3: a spring up onto a shop roof
    api.spring({ x: 13, z: 7.8 });
    api.fragment({ x: 14, z: 4, y: 3.2 + 1.3 });

    // --- Golden Scroll challenge course: on the theatre's top rows (west) ---
    const plan = [['block', 1.0], ['float', 1.0], ['crumble', 0.9], ['float', 0.8], ['spring', 0.2], ['float', 4.2], ['crumble', 0.6]];
    let ctop = 0;
    api.course(plan.map(([kind, rise], i) => {
      const z = 2 - i * 2.4, x = -19.5 + (i % 2 ? 0.3 : -0.3);
      ctop = i === 0 ? api.terrain(x, z) + 1.0 : ctop + rise;
      return { x, z, top: ctop, kind };
    }));

    api.leaves([[-6, 20], [0, 18], [4, 26], [0, 10], [-2, 2], [3, -4], [-4, -10], [2, -16], [12, 18], [-18.4, 27.6, 3.2], [10, -2], [-10, -2]]);
    // (no challenge corner: the uproar is the level)

    // BEGIN PALACE THEATER ART
    // Curved stone seating bands lie on the authored raked ground: no false steps.
    const theatreArt=new T.Group();theatreArt.name='ephesus-curved-seating';theatreArt.userData.landmark='ephesus-theatre';
    const rowMats=[api.texMat(0xc5b493,'stone'),api.texMat(0xa79b86,'stone')],edgeMat=api.texMat(0x746b5d,'stone');
    const band=(r,width,a0,a1,material,lift=.055)=>{
      const pos=[],uv=[],index=[],count=Math.max(3,Math.ceil((a1-a0)*r/.45));
      for(let i=0;i<=count;i++)for(const radius of [r,r+width]){
        const a=a0+(a1-a0)*i/count,x=tx+Math.cos(a)*radius,z=tz-Math.sin(a)*radius*.7;
        pos.push(x,api.terrain(x,z)+lift,z);uv.push(x/2,z/2);
      }
      for(let i=0;i<count;i++){const a=i*2;index.push(a,a+1,a+2,a+1,a+3,a+2);}
      const geo=new T.BufferGeometry();geo.setAttribute('position',new T.Float32BufferAttribute(pos,3));geo.setAttribute('uv',new T.Float32BufferAttribute(uv,2));geo.setIndex(index);geo.computeVertexNormals();
      const mesh=new T.Mesh(geo,material);mesh.receiveShadow=true;theatreArt.add(mesh);
    };
    for(let row=0;row<7;row++){
      const r=6.7+row*1.15;
      // Four seating blocks with a broad central aisle and two narrower side aisles.
      [[.08,.67],[.74,1.43],[1.71,2.4],[2.47,Math.PI-.08]].forEach(([a,b])=>{
        band(r,.63,a,b,rowMats[row%2]);band(r,.055,a,b,edgeMat,.065);
      });
    }
    api.scenery(theatreArt);EPH.theatreArt=theatreArt;
    // Column bases/capitals and restrained shop edging distinguish the street from the theatre.
    const street=new T.Group();street.name='ephesus-street-detail';street.userData.landmark='ephesus-street';
    const marble=api.texMat(0xe9dfc9,'stone'),paint=api.texMat(0x477d83,'clay'),stone=api.texMat(0xb9a98b,'stone');
    const streetBox=(x,y,z,w,h,d,m)=>{const mesh=new T.Mesh(new T.BoxGeometry(w,h,d),m);mesh.position.set(x,y,z);street.add(mesh);return mesh;};
    for(const x of [-5,5])for(const z of [16,8,0,-8]){
      const base=new T.Mesh(new T.CylinderGeometry(.42,.44,.18,12),marble);base.position.set(x,.09,z);street.add(base);
      const capital=new T.Mesh(new T.CylinderGeometry(.41,.3,.25,12),marble);capital.position.set(x,3.81,z);street.add(capital);
      streetBox(x,3.97,z,.85,.06,.85,stone);
    }
    [[-16,6,4],[14,4,4],[-15,-8,4],[13,-10,4],[-8,10,3],[7,12,3]].forEach(([x,z,w],i)=>{
      const base=api.terrain(x,z),face=z+w/2+.06;
      // Flush trim keeps the existing shop doors, awnings and rooftop landings usable.
      for(const side of [-1,1])streetBox(x+side*(w/2-.18),base+1.5,face,.18,2.8,.08,marble);
      streetBox(x,base+2.97,face,w-.18,.16,.08,i%2?paint:stone);
    });
    api.scenery(street);EPH.streetArt=street;
    // END PALACE THEATER ART
  },

  _uproar(api) {
    api.story([
      { art: '🔥', text: 'Many of them also which used curious arts brought their books together, and burned them before all men: and they counted the price of them, and found it fifty thousand pieces of silver.', ref: 'Acts 19:19' },
      { art: '📣', title: 'Demetrius the silversmith stirred up the city', text: 'And when they heard these sayings, they were full of wrath, and cried out, saying, Great is Diana of the Ephesians.', ref: 'Acts 19:28' }
    ], () => { api.toast('🛡️ (Our game\'s idea) Bring Paul\'s friends out of the theatre to the disciples\' house. Watch out for the crowds (the Breastplate helps you stand firm). And Paul wants to go in... stop him!', 5000);
      EPH.rioting = true;
      EPH.crowds.forEach((c) => { c.g.visible = true; });
      const pa = EPH.paul; pa.state = 'parked'; EPH.paulWalk = true;
      EPH.paulI.alive = true;
    });
  },

  update(api, dt) {
    EPH.flame.rotation.y += dt * 3;
    if (!EPH.rioting) return;
    const ps = api.activePlayers();
    // the crowds surge back and forth across the street
    const calm = api.taskDone('friends') && api.taskDone('paul');
    EPH.crowds.forEach((c) => {
      if (calm) { c.g.visible = false; return; }
      c.t += dt;
      const x = Math.sin(c.t * c.sp / c.amp) * c.amp;
      c.v = Math.cos(c.t * c.sp / c.amp) * c.sp;
      c.x = x;
      c.g.position.set(x, Math.abs(Math.sin(api.time * 8)) * 0.08, c.z); c.g.rotation.y = c.v > 0 ? 0 : Math.PI;
      ps.forEach((p) => {
        if (Math.abs(p.pos.x - x) < 2.6 && Math.abs(p.pos.z - c.z) < 1.8) api.push(p, Math.sign(c.v || 1) * 6, (p.pos.z > c.z ? 1 : -1) * 1.5, dt);
      });
    });
    if (!EPH.toldShout && ps.some((p) => EPH.crowds.some((c) => Math.abs(p.pos.x - c.x) < 3 && Math.abs(p.pos.z - c.z) < 2))) {
      EPH.toldShout = true;
      api.story([{ art: '📣', text: 'But when they knew that he was a Jew, all with one voice about the space of two hours cried out, Great is Diana of the Ephesians.', ref: 'Acts 19:34' }]);
    }
    // Paul heads toward the theatre until someone stops him
    if (EPH.paulWalk && !EPH.paulStopped) {
      const pa = EPH.paul, target = [0, -14];
      const dx = target[0] - pa.pos.x, dz = target[1] - pa.pos.z, d = Math.hypot(dx, dz);
      if (d > 0.3) { pa.pos.x += dx / d * 1.1 * dt; pa.pos.z += dz / d * 1.1 * dt; pa.mesh.rotation.y = Math.atan2(dx, dz); }
      pa.pos.y = api.terrain(pa.pos.x, pa.pos.z); pa.mesh.position.copy(pa.pos);
      EPH.paulI.x = pa.pos.x; EPH.paulI.z = pa.pos.z; EPH.paulI.y = pa.pos.y;
    }
    EPH.seated.forEach((m, i) => { m.position.y = api.terrain(m.position.x, m.position.z) + (calm ? 0 : Math.abs(Math.sin(api.time * 6 + i)) * 0.15); });
  },

  objective(api) {
    const ps = api.activePlayers();
    if (!ps.length) return null;
    const held = ps.map((p) => p.holding).find((h) => h && h.deliverTo);
    if (held) return [held.deliverTo.x, 2, held.deliverTo.z];
    const c = ps[0].pos;
    if (!api.taskDone('books')) {
      const b = EPH.books.filter((it) => !it.delivered && !it.holder).sort((a, b2) => Math.hypot(a.x - c.x, a.z - c.z) - Math.hypot(b2.x - c.x, b2.z - c.z))[0];
      return b ? [b.x, b.y + 1, b.z] : null;
    }
    if (!api.taskDone('paul')) return [EPH.paul.pos.x, EPH.paul.pos.y + 2.2, EPH.paul.pos.z];
    if (EPH.friends.some((f) => f.state === 'follow')) return [EPH.HOUSE[0], 1.5, EPH.HOUSE[1]];
    const f = EPH.friends.find((x) => x.state === 'idle');
    return f ? [f.pos.x, f.pos.y + 2, f.pos.z] : null;
  },

  finale: {
    message: '🏠 Everyone gather at the disciples\' house.',
    beacon: [EPH.HOUSE[0], 3, EPH.HOUSE[1]],
    inZone(p) { return Math.hypot(p.pos.x - EPH.HOUSE[0], p.pos.z - EPH.HOUSE[1]) < 5.5; },
    onUpdate(api, t) {
      if (t > 0.5 && !EPH.done) {
        EPH.done = true;
        api.toast('🏛️ The town clerk quieted the crowd and sent everyone home (Acts 19:41). Later Paul wrote these believers a letter: Ephesians!', 5000);
        api.story([
          { art: '💛', title: 'The word of God grew', text: 'So mightily grew the word of God and prevailed.', ref: 'Acts 19:20' }
        ], () => { EPH.endT = api.time; });
      }
      return EPH.endT !== undefined && api.time - EPH.endT > 2;
    }
  }
};
