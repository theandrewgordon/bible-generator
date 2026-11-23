/* =====================================================================
 * LEVEL 5-2: THE STILL SMALL VOICE  (1 Kings 18-19)
 * ---------------------------------------------------------------------
 * After God sent fire on Mount Carmel, Queen Jezebel threatened Elijah. He ran, afraid and worn out.
 * North to south:
 *   The wilderness (z 34..6)  lead Elijah to the juniper tree; Jezebel's messengers ride back and
 *                             forth looking for him (a bump: they push you aside, never harm)
 *   The juniper tree           bring him the bread and water God provided
 *   Mount Horeb (z -2..-40)    climb through a great wind, an earthquake and a fire.
 *                             The LORD was not in them. At the top, by the cave: be still and listen.
 * Only edit THIS file to change the level. See GEMINI.md and CAMPAIGN.md.
 * ===================================================================== */

const VOICE = {
  TREE: [0, 6],
  CAVE: [0, -37],
  riders: [],
  food: [],
  fires: [],
  passed: { wind: false, quake: false, fire: false },
  gustT: 0,
  quiet: false,
  elapsed: 0, shell: []
};

function voiceDress(api,top){
  const T=api.THREE,rim=new T.Group();rim.name='horeb-eroded-mouth';rim.position.set(0,top,-37);
  const stone=(x,y,z,sx,sy,sz,color)=>{const m=new T.Mesh(new T.DodecahedronGeometry(.5,0),api.texMat(color,'stone'));m.position.set(x,y,z);m.scale.set(sx,sy,sz);m.castShadow=true;rim.add(m);};
  [-1,1].forEach(sd=>{for(let j=0;j<4;j++)stone(sd*(2.7+(j%2)*.12),j===3?3.4:.65+j*1.0,.02,1.7,j===3?1.2:1.3,.75,j%2?0x8a8274:0x6c685e);});
  [-1.1,0,1.1].forEach((x,i)=>stone(x,4.4+(i%2)*.12,-.03,1.8,.65,.75,0x8b8375));
  api.scenery(rim);api.fadeScenery(rim,2.7);VOICE.rim=rim;
  const bounce=new T.PointLight(0xb7cee0,.8,9,2);bounce.position.set(0,top+2.3,-36.6);api.add(bounce);VOICE.bounce=bounce;
}
function voiceFlame(api){
  const T=api.THREE,g=new T.Group();g.name='horeb-shaped-flame';
  const shape=new T.Shape();shape.moveTo(-.7,-.9);shape.bezierCurveTo(-1,-.25,-.22,-.1,-.35,.3);shape.quadraticCurveTo(.1,.02,.02,.9);shape.bezierCurveTo(.42,.5,.42,.07,.65,-.12);shape.quadraticCurveTo(.95,-.8,.3,-.9);shape.closePath();
  [0,Math.PI/2].forEach((angle,i)=>{const m=new T.Mesh(new T.ShapeGeometry(shape,12),new T.MeshBasicMaterial({color:i?0xffd174:0xe78b45,transparent:true,opacity:.7,side:T.DoubleSide,depthWrite:false}));m.rotation.y=angle;m.scale.setScalar(i?.78:1);g.add(m);});return g;
}
function voiceAct(api,dt){
  VOICE.elapsed+=dt;const e=VOICE.elijah,a=e.mesh.userData.storyActor,rest=VOICE.resting;
  if(VOICE.returnAt!==undefined){const u=Math.min(1,(VOICE.elapsed-VOICE.returnAt)/1.6);e.pos.set(1.4+u,api.terrain(1.4+u,-36.4+u*2.6),-36.4+u*2.6);e.mesh.position.copy(e.pos);e.mesh.rotation.y=Math.atan2(1,2.6);VOICE.returned=u===1;}
  api.posePerson(e.mesh,{dt,stride:e.state==='follow'?.45:VOICE.returnAt!==undefined&&!VOICE.returned?.5:0,headPitch:rest?.12:VOICE.quiet?0:.3,expression:rest?'calm':VOICE.quiet?'listen':'worry',talking:rest?false:undefined});
  const nearTree=api.activePlayers().some(p=>Math.hypot(p.pos.x-VOICE.TREE[0],p.pos.z-VOICE.TREE[1])<10);VOICE.treeShade.traverse(m=>{if(m.isMesh){const want=rest&&nearTree?.25:1;m.material.opacity+=(want-m.material.opacity)*Math.min(1,dt*6);m.material.depthWrite=m.material.opacity>.95;}});
  a.rig.rotation.z=rest?Math.PI/2:0;a.rig.position.set(rest?.25:0,rest?.45:0,0);if(rest)a.eyes.scale.y=.12;
}

const LEVEL = {
  id: '5-2',
  bibleConnection: {"passage": "1 Kings 18:39; 19:1–18", "text": "Jezebel threatened to kill Elijah. God gave him food and rest, then sent him back to serve. Just for our game: help him and climb toward Horeb. God’s care was His gift."},
  world: 'World 5-2',
  title: 'The Still Small Voice',
  reactive:false,life:false,
  artDirection:{textureStrength:.3,storyPlants:14,checkpointSigns:false},
  decor:{grass:25,flowers:3,pebbles:18,plants:false},
  leafIcon: '🍞',
  leafColor: 0xe9c46a,
  leafShape: 'round',
  spawn: [2, 32],
  bounds: { minX: -20, maxX: 20, minZ: -42, maxZ: 36 },
  approach: ['ledge', 'meadow:lion', 'crumbles'],   // the way in (engine): a stretch before the level's own start
  startMessage: 'Jezebel wanted Elijah dead. Find him and lead him to the juniper tree.',

  intro: [
    { text: 'And after the earthquake a fire; but the LORD was not in the fire: and after the fire a still small voice.', ref: '1 Kings 19:12' },
    { text: 'Be still, and know that I am God: I will be exalted among the heathen, I will be exalted in the earth.', ref: 'Psalm 46:10' }
  ],

  introStory: [
    { art: '🙌', title: 'Fire on Carmel', text: 'And when all the people saw it, they fell on their faces: and they said, The LORD, he is the God; the LORD, he is the God.', ref: '1 Kings 18:39' }
  ],

  tasks: [
    { id: 'tree', icon: '🌳', label: 'Lead Elijah to the juniper tree', total: 1 },
    { id: 'food', icon: '🍞', label: 'Bring the bread and water', total: 2, lockedUntil: 'tree' },
    { id: 'climb', icon: '⛰️', label: 'Climb Mount Horeb: wind, earthquake, fire', total: 3, lockedUntil: 'food' },
    { id: 'listen', icon: '🤫', label: 'Be still and listen', total: 1, lockedUntil: 'climb' }
  ],

  memoryVerse: { text: 'But they that wait upon the LORD shall renew their strength; they shall mount up with wings as eagles; they shall run, and not be weary; and they shall walk, and not faint.', ref: 'Isaiah 40:31' },

  ending: {
    verse: { text: 'And after the earthquake a fire; but the LORD was not in the fire: and after the fire a still small voice.', ref: '1 Kings 19:12' },
    message: 'God cared for Elijah and sent him back to serve. He was not alone. Elisha would follow him as prophet. Jesus invites the weary to come to Him.'
  },

  quiz: [
    { q: 'What did God give Elijah under the juniper tree?', ref: '1 Kings 19:6', options: ['A sword', 'Bread and water', 'A horse'], answer: 1, explain:'God provided food and rest for tired Elijah. His care was a gift.' },
    { q: 'Was the LORD in the great wind?', ref: '1 Kings 19:11', options: ['Yes', 'No'], answer: 1, explain:'The LORD was not in that great wind or the earthquake. After the fire came a still small voice.' },
    { q: 'How did God speak to Elijah on the mountain?', ref: '1 Kings 19:12', options: ['With a still small voice', 'With thunder', 'Through a letter'], answer: 0, explain:'God also sent Elijah back to serve and named Elisha to follow him as prophet (1 Kings 19:15–16).' }
  ],

  music: {
    bpm: 80,
    notes: [62, 0, 66, 0, 69, 0, 67, 66, 64, 0, 62, 0, 59, 0, 0, 0,
            62, 0, 64, 66, 67, 0, 66, 64, 62, 0, 61, 0, 62, 0, 0, 0],
    bass: [38, 38, 43, 43, 45, 45, 38, 38]
  },

  onCallText() {                                                 // said once; after that they just come
    if (VOICE.saidCall) return '';
    VOICE.saidCall = true;
    return 'Elijah walks slowly behind you.';
  },

  /* ---------- ground shape ---------- */
  terrain(x, z) {
    let h = Math.sin(x * 0.3) * Math.cos(z * 0.24) * 0.12;
    if (z < -2) h += Math.min(10, (-2 - z) * 0.29);                       // Mount Horeb rises to the south
    h += Math.max(0, Math.abs(x) - 15) * 1.1;
    const pd = Math.hypot(x + 12, z - 14);                              // a little oasis pool
    if (pd < 2.8) h -= 1.8 * Math.min(1, (2.8 - pd) / 1);
    return h;
  },

  groundColor(x, z, h) {
    if (Math.hypot(x + 12, z - 14) < 2.6 && h < -0.8) return 0x3b82c4;
    if(z< -36&&Math.abs(x)<1.6)return 0x776f65;
    if (z < -2) return 0x928a7c;   // the mountain
    return 0xceba94;                // wilderness sand
  },

  /* ---------- build ---------- */
  build(api) {
    const T = api.THREE;
    const person = (robe, scarf, s, o) => api.person(robe, scarf, s, o);   // friendly round townsfolk (engine)

    // --- Elijah (with his mantle) ---
    const eli=api.storyPerson(0x886248,0xb29570,1,{age:'elder',beard:true});
    const mantle=new T.Mesh(new T.CylinderGeometry(.34,.5,.72,20,1,true,.65,Math.PI*2-1.3),api.texMat(0x68675d,'cloth',{side:T.DoubleSide}));mantle.position.set(0,.78,-.03);eli.userData.storyActor.body.add(mantle);VOICE.mantle=mantle;
    VOICE.elijah = api.follower({ x: 0, z: 30, kind:'Elijah',noSquash:true,mesh:eli,
      deliverTo: { x: VOICE.TREE[0], z: VOICE.TREE[1], r: 2.6 },
      parkAt: [VOICE.TREE[0] + 0.8, api.terrain(0, 6), VOICE.TREE[1] - 0.6],
      onDeliver(p) {
        api.task('tree'); api.servant(p, 5, 'for caring for Elijah!');
        VOICE.resting=true;const a=eli.userData.storyActor;a.rig.rotation.z=Math.PI/2;a.rig.position.set(.25,.45,0);
        api.story([
          { art: '😴', text: 'And as he lay and slept under a juniper tree, behold, then an angel touched him, and said unto him, Arise and eat.', ref: '1 Kings 19:5' }
        ], () => api.toast('🍞 God sent bread baked on hot stones and a jar of water. Bring them to Elijah!', 4000));
      } });

    // --- the juniper tree (a broom bush) ---
    const [tx, tz] = VOICE.TREE;
    const trunk = new T.Mesh(new T.CylinderGeometry(0.18, 0.25, 1.4, 8), api.mat(0x6b4f2a)); trunk.position.set(tx, api.terrain(tx, tz) + 0.7, tz); api.add(trunk);
    const shade=new T.Group();shade.name='juniper-soft-canopy';shade.position.set(tx,api.terrain(tx,tz),tz);
    [[0,1.8,0,1.4],[.8,1.5,.3,1],[-.7,1.6,-.2,1.1]].forEach(([dx,dy,dz,r])=>{const b=new T.Mesh(new T.SphereGeometry(r,14,10),new T.MeshLambertMaterial({color:0x6b8e4e,transparent:true}));b.position.set(dx,dy,dz);shade.add(b);});api.scenery(shade);VOICE.treeShade=shade;
    VOICE.treeView=api.camZone({minX:-7,maxX:7,minZ:1,maxZ:13,yaw:-.5,height:9,back:13,focus:[.8,.5,5.4],pull:.2});
    // the bread on hot stones and the jar of water
    [['bread', 5, 9], ['water', -5, 4]].forEach(([kind, x, z]) => {
      const g = new T.Group();
      if (kind === 'bread') { const b = new T.Mesh(new T.CylinderGeometry(0.4, 0.4, 0.14, 12), api.mat(0xd4a056)); g.add(b); }
      else { const j = new T.Mesh(new T.CylinderGeometry(0.22, 0.3, 0.6, 12), api.mat(0xa16207)); g.add(j); }
      const it = api.carryable({ x, z, mesh: g, name: kind === 'bread' ? 'bread cake' : 'jar of water', to: 'Elijah',
        deliverTo: { x: tx, z: tz, r: 2.4 },
        onDeliver(p) {
          api.task('food'); api.servant(p, 4);
          if (api.taskDone('food')) LEVEL._strength(api);
        } });
      it.blocked = () => (api.taskDone('tree') ? true : 'Food for Elijah. Bring him to the juniper tree first.');
      VOICE.food.push(it);
    });

    // --- Jezebel's messengers riding back and forth (a bump, never harm) ---
    [[24, 13, 3.4], [15, 10, 2.8]].forEach(([z, amp, sp], i) => {
      const g = new T.Group();
      const horse = new T.Mesh(new T.BoxGeometry(0.7, 0.8, 1.8), api.mat(0x3f2a14)); horse.position.y = 0.9; g.add(horse);
      const neck = new T.Mesh(new T.BoxGeometry(0.4, 0.8, 0.4), api.mat(0x3f2a14)); neck.position.set(0, 1.4, 0.8); neck.rotation.x = -0.4; g.add(neck);
      const rider = person(0x7f1d1d, 0x111827, 0.8); rider.position.y = 1.1; g.add(rider);
      api.add(g); VOICE.riders.push({ g, z, amp, sp, t: i * 3 });
    });

    // --- Mount Horeb: fire patches on the slope (only during the fire) ---
    [[-6, -25], [3, -26.5], [9, -25.5], [-2, -28.5], [6, -29.5], [-9, -29]].forEach(([x, z]) => {
      const flame=voiceFlame(api);
      flame.position.set(x, api.terrain(x, z) + 0.9, z); api.add(flame);
      const hz = api.hazard({ x, z, r: 1.1 }, { msg: 'Too hot! Find a way around the fire.' });
      VOICE.fires.push({ flame, hz, x, z });
    });
    // the cave near the top
    const [cx, cz] = VOICE.CAVE;
    const top = api.terrain(cx, cz);
    VOICE.shell.push(api.rockBox({ x: cx - 3.2, z: cz - 1.5, w: 3, d: 3, h: 4, y: top, color: 0x6b6355 }));
    VOICE.shell.push(api.rockBox({ x: cx + 3.2, z: cz - 1.5, w: 3, d: 3, h: 4, y: top, color: 0x6b6355 }));
    [-1,0,1].forEach((side,i)=>{
      const h=[4.45,5,4.6][i],x=cx+side*9.4/3;
      VOICE.shell.push(api.rockBox({x,z:cz-2.4,w:9.4/3,d:1.2,h,y:top,color:0x5f584b}));
      const roof=api.rockBox({x,z:cz-1.5,w:9.4/3,d:3,h:h-4,y:top+4,color:0x6b6355});VOICE.shell.push(roof);api.fadeScenery(roof.mesh,2);
    });
    voiceDress(api,top);
    VOICE.listenZone = api.zone({ x: cx, z: cz + 2, r: 2.6, time: 4, color: 0xe0f2fe, hidden: true,
      onDone(helpers) { api.task('listen'); helpers.forEach((p) => api.servant(p, 5, 'for being still before God!')); } });

    // --- fragments ---
    // 1: the oasis pool (the Fisherman nets it)
    api.hazard({ x: -12, z: 14, r: 2.4 }, { maxY: -0.6, except: (p) => p.role.id === 'fisherman', msg: 'Splash! The pool is deep (the Fisherman can wade).' });
    api.fragment({ x: -12, z: 14, y: 0.2, net: true });
    // 2: crumbling stones up a rock pillar in the wilderness
    [[13, 22, 1.1], [14.4, 19.6, 2.1], [13, 17.4, 3.1]].forEach(([x, z, t]) => api.crumble({ x, z, top: api.terrain(x, z) + t }));
    api.box({ x: 12.6, z: 14.8, w: 2.4, d: 2.4, h: 4.0, color: 0xb59a6d });
    api.fragment({ x: 12.6, z: 14.8, y: api.terrain(12.6, 14.8) + 4.0 + 1.3 });
    // 3: a spring up to a ledge on the mountainside
    const ly = api.terrain(-11, -18);
    api.box({ x: -11, z: -20.6, w: 2.4, d: 2.4, h: 4.0, y: ly, color: 0x7a7060 });
    api.spring({ x: -11, z: -17.4, top: api.terrain(-11, -16.6) + 0.35 });
    api.fragment({ x: -11, z: -20.6, y: ly + 4.0 + 1.3 });

    // --- Golden Scroll challenge course: west of the wilderness ---
    const plan = [['block', 1.0], ['float', 1.0], ['crumble', 0.9], ['float', 0.8], ['spring', 0.2], ['float', 4.2], ['crumble', 0.6]];
    let ctop = 0;
    api.course(plan.map(([kind, rise], i) => {
      const z = 34 - i * 2.9, x = -17 + (i % 2 ? 0.3 : -0.3);
      ctop = i === 0 ? api.terrain(x, z) + 1.0 : ctop + rise;
      return { x, z, top: ctop, kind };
    }));

    api.leaves([[0, 26], [-4, 20], [4, 18], [0, 12], [-6, 8], [6, 2], [0, -6], [-4, -12], [4, -18], [0, -22], [-4, -27], [5, -33], [14.4, 19.6, 2.9]]
      .map(([x, z, y]) => (y !== undefined ? [x, z, y] : [x, z, api.terrain(x, z) + 1])));
    // camera: frame the cave on the mountain where Elijah listens
    VOICE.caveView=api.camZone({ minX: VOICE.CAVE[0] - 6, maxX: VOICE.CAVE[0] + 6, minZ: VOICE.CAVE[1] - 5, maxZ: VOICE.CAVE[1] + 7, yaw: 0.5, height: 10, back: 12, focus: [VOICE.CAVE[0], api.terrain(VOICE.CAVE[0], VOICE.CAVE[1]) + 1, VOICE.CAVE[1]], pull: 0.4 });
    VOICE.conversation=api.conversation({person:eli,label:'Whisper with Elijah',speaker:'Elijah',available:()=>VOICE.quiet,clue(){
      return {text:VOICE.endT===undefined?'Gather beside the cave. The wind, earthquake and fire are over.':'God told me to return. I am not alone; Elisha will follow me as prophet.',at:[VOICE.CAVE[0],api.terrain(...VOICE.CAVE)+1,VOICE.CAVE[1]+2]};
    }});
  },

  _strength(api) {
    api.story([
      { art: '⛰️', text: 'And he arose, and did eat and drink, and went in the strength of that meat forty days and forty nights unto Horeb the mount of God.', ref: '1 Kings 19:8' }
    ], () => { api.toast('🌬️ Climb Mount Horeb. Stay together through what comes: wind, earthquake, fire.', 4000);
      const e = VOICE.elijah; e.state = 'parked';
      VOICE.resting=false;const a=e.mesh.userData.storyActor;a.rig.rotation.z=0;a.rig.position.set(0,0,0);e.mesh.rotation.z=0; e.pos.set(VOICE.CAVE[0] + 1.4, api.terrain(VOICE.CAVE[0], VOICE.CAVE[1]), VOICE.CAVE[1] + 0.6); e.mesh.position.copy(e.pos);
      VOICE.climbing = true;
    });
  },

  update(api, dt) {
    voiceAct(api,dt);
    const ps = api.activePlayers();
    // messengers ride back and forth
    VOICE.riders.forEach((r) => {
      r.t += dt;
      const x = Math.sin(r.t * r.sp / r.amp) * r.amp, dir = Math.cos(r.t * r.sp / r.amp);
      r.g.position.set(x, api.terrain(x, r.z), r.z); r.g.rotation.y = dir > 0 ? Math.PI / 2 : -Math.PI / 2;
      api.near(x, r.z, 1.3).forEach((p) => api.hit(p, x, r.z, 'bump', 'A messenger rides past! Wait for a gap, then go.'));
    });
    // the mountain: wind, earthquake, fire, one after another as you climb
    const lead = ps.length ? Math.min(...ps.map((p) => p.pos.z)) : 99;
    const zone = (a, b) => ps.filter((p) => p.pos.z < a && p.pos.z > b);
    if (VOICE.climbing && !VOICE.quiet) {
      // 1. a great and strong wind (Breastplate stands firm)
      if (!VOICE.passed.wind) {
        VOICE.gustT += dt;
        const gust = (VOICE.gustT % 5) < 2;
        if (gust) zone(-6, -16).forEach((p) => api.push(p, 6, 0, dt));
        if (gust && Math.random() < 0.3) api.puff(-12 + Math.random() * 8, api.terrain(0, -11) + 1, -8 - Math.random() * 8, 0xe5e7eb, 4);
        if (lead < -16.5) LEVEL._passed(api, 'wind');
      } else if (!VOICE.passed.quake) {
        // 2. an earthquake
        const a = Math.sin(api.time * 7) * Math.PI;
        zone(-15, -24).forEach((p) => api.push(p, Math.cos(a + p.slot) * 3.5, Math.sin(a + p.slot) * 3.5, dt));
        if (Math.random() < 0.15) api.puff((Math.random() - 0.5) * 20, api.terrain(0, -20) + 0.3, -17 - Math.random() * 6, 0x9ca3af, 5);
        if (lead < -24.5) LEVEL._passed(api, 'quake');
      } else if (!VOICE.passed.fire) {
        VOICE.fires.forEach((f) => { f.flame.scale.y = 1 + Math.sin(api.time * 10 + f.x) * 0.2; });
        if (lead < -32) LEVEL._passed(api, 'fire');
      }
    }
    if (!VOICE.climbing || VOICE.passed.wind && VOICE.passed.quake && VOICE.passed.fire) VOICE.fires.forEach((f) => { f.flame.visible = false; f.hz.on = false; });
    else if (VOICE.passed.quake) VOICE.fires.forEach((f) => { f.flame.visible = true; f.hz.on = true; });
    else VOICE.fires.forEach((f) => { f.flame.visible = false; f.hz.on = false; });
  },

  _passed(api, what) {
    VOICE.passed[what] = true;
    api.task('climb'); api.sfx('coin');
    api.activePlayers().forEach((p) => api.servant(p, 2));
    if (what === 'wind') api.toast('🌬️ A great wind... but the LORD was not in the wind.', 3000);
    if (what === 'quake') api.toast('🌍 An earthquake... but the LORD was not in the earthquake.', 3000);
    if (what === 'fire') {
      VOICE.quiet=true;VOICE.listenZone.show(true);api.music(false);
      api.story([
        { art: '🌬️', text: 'And he said, Go forth, and stand upon the mount before the LORD. And, behold, the LORD passed by, and a great and strong wind rent the mountains, and brake in pieces the rocks before the LORD; but the LORD was not in the wind: and after the wind an earthquake; but the LORD was not in the earthquake:', ref: '1 Kings 19:11' }
      ], () => api.toast('🤫 After the fire, everything went quiet. Stand still by the cave and listen.', 4500));
    }
  },

  objective(api) {
    const ps = api.activePlayers();
    if (!ps.length) return null;
    const held = ps.map((p) => p.holding).find((h) => h && h.deliverTo);
    if (held) return [held.deliverTo.x, 1.5, held.deliverTo.z];
    const e = VOICE.elijah;
    if (!api.taskDone('tree')) return e.state === 'follow' ? [VOICE.TREE[0], 1.5, VOICE.TREE[1]] : [e.pos.x, e.pos.y + 2, e.pos.z];
    if (!api.taskDone('food')) { const f = VOICE.food.find((it) => !it.delivered && !it.holder); return f ? [f.x, f.y + 1, f.z] : null; }
    const c = VOICE.CAVE, y = api.terrain(c[0], c[1]);
    return api.taskDone('listen') ? null : [c[0], y + 1.5, c[1] + 2];
  },

  finale: {
    message: '⛰️ Everyone gather by the cave with Elijah.',
    beacon: [VOICE.CAVE[0], 13, VOICE.CAVE[1] + 2],
    inZone(p) { return Math.hypot(p.pos.x - VOICE.CAVE[0], p.pos.z - (VOICE.CAVE[1] + 2)) < 6; },
    onUpdate(api, t) {
      if(!VOICE.gathered){const ps=api.players();if(!ps.length||!ps.every(p=>!p.bubble&&LEVEL.finale.inZone(p)))return false;VOICE.gathered=true;api.finishCaption(false,false);Object.assign(VOICE.caveView,{minX:-8,maxX:8,minZ:-42,maxZ:-29,yaw:.35,height:10,back:19,focus:[0,api.terrain(0,-37)+1,-36],pull:.3});}
      if (t > 0.5 && !VOICE.done) {
        VOICE.done = true;
        api.story([
          { art: '🤫', text: 'And after the earthquake a fire; but the LORD was not in the fire: and after the fire a still small voice.', ref: '1 Kings 19:12' },
          { art: '💛', title: 'Not alone', text: 'Yet I have left me seven thousand in Israel, all the knees which have not bowed unto Baal, and every mouth which hath not kissed him.', ref:'1 Kings 19:18',connection:{passage:'1 Kings 19:15–16',text:'God sent Elijah back to serve and named Elisha to follow him as prophet.'} },
          { art: '🫂', title:'Jesus invites the weary', text: 'Come unto me, all ye that labour and are heavy laden, and I will give you rest.', ref:'Matthew 11:28',connection:{passage:'Matthew 11:28',text:'Many years later, Jesus gave this invitation.'} }
        ],()=>{VOICE.endT=api.time;VOICE.returnAt=VOICE.elapsed;api.music(true);});
      }
      return VOICE.endT !== undefined && api.time - VOICE.endT > 2;
    }
  }
};
