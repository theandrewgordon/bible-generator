/* =====================================================================
 * LEVEL 3-8: THE WALLS FALL DOWN  (Joshua 2, 6)
 * ---------------------------------------------------------------------
 * Jericho is shut tight. God tells Joshua how He will give them the city: march, keep quiet, shout.
 * North (camp, z 30) to south. The city is a square of walls around (0, -6); the march goes round
 * a loop just outside it.
 *   1. Rahab believed the LORD and hid the spies. Bring her family home, under the scarlet cord.
 *   2. The seventh day: march round the city seven times with the priests and the ark.
 *      The march waits for EVERYONE. After one circuit, an optional short scene represents the rest.
 *      Catch-up: C / L3. X remains Run.
 *   3. Everyone presses Action to shout. GOD brings the walls down. Nobody fights.
 * Rahab's house on the wall stays standing; her family is brought out safe (Joshua 6:23).
 * Only edit THIS file to change the level. See GEMINI.md and CAMPAIGN.md.
 * ===================================================================== */

const JER = {
  C: [0, -6],                  // centre of the city
  HALF: 9,                     // the walls: a square 18 wide
  LOOP: 13.5,                  // the march goes round at this distance from the centre
  RAHAB: [-11.6, 0],           // under the scarlet cord, outside the west wall
  SHOUT: [0, 9.5],
  walls: [],                   // {box, keep}
  family: [],
  procession: [],              // {mesh, back}: how far behind the front each walker is
  ark: null,
  path: [],                    // loop points
  P: 0,                        // loop length
  s: 0,                        // how far the front of the march has gone
  marching: false,
  waiting: false,
  shouted: {},
  banners: [],
  fallT: undefined
};

// position along the march loop (clockwise from the north middle)
function jerAt(s) {
  const P = JER.P, pts = JER.path;
  s = ((s % P) + P) % P;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1], L = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (s <= L) return [a[0] + (b[0] - a[0]) * s / L, a[1] + (b[1] - a[1]) * s / L, Math.atan2(b[0] - a[0], b[1] - a[1])];
    s -= L;
  }
  return [pts[0][0], pts[0][1], 0];
}

function jerStoneWall(api,w){
  const T=api.THREE,p=w.box.platform;w.bottom=p.bottom;w.height=p.top-p.bottom;w.sy=w.box.mesh.scale.y;
  const tower=w.w===w.d,rows=4,cols=Math.max(1,Math.round(Math.max(w.w,w.d)/1.5)),blocks=[];
  for(let row=0;row<rows;row++)for(let i=0;i<cols;i++){
    const along=(i+.5)/cols-.5,wide=w.w>=w.d;
    blocks.push({x:wide?along*w.w:0,z:wide?0:along*w.d,y:(row+.5)*w.height/rows,row,
      sx:wide?w.w/cols-.055:w.w+.025,sy:w.height/rows-.065,sz:wide?w.d+.025:w.d/cols-.055});
  }
  const mesh=new T.InstancedMesh(new T.BoxGeometry(1,1,1),api.texMat(0xcbb58e,'stone'),blocks.length);mesh.name=tower?'jericho-tower-courses':'jericho-wall-courses';mesh.castShadow=true;mesh.receiveShadow=true;mesh.frustumCulled=false;mesh.instanceMatrix.setUsage(T.DynamicDrawUsage);
  blocks.forEach((b,i)=>mesh.setColorAt(i,new T.Color().setScalar(.87+(i%3)*.045)));w.stones={mesh,blocks};api.add(mesh);jerStonePose(api,w,0);
}
function jerStonePose(api,w,k){
  const T=api.THREE,matrix=new T.Matrix4(),q=new T.Quaternion(),v=new T.Vector3(),scale=new T.Vector3();
  w.stones.blocks.forEach((b,i)=>{
    const a=Math.max(0,Math.min(1,(k-(3-b.row)*.035)/.88)),ease=a*a*(3-2*a),rest=.07+b.row*.055;
    // Slight inward settling, with an open floor after collision is released.
    v.set(w.x+b.x*(1-ease*.04),w.bottom+b.y*(1-ease)+rest*ease,w.z+b.z*(1-ease*.04));
    q.setFromEuler(new T.Euler(ease*Math.sin(i*2.1)*.12,0,ease*Math.cos(i*1.7)*.1));
    scale.set(b.sx,b.sy*(1-ease*.86),b.sz);matrix.compose(v,q,scale);w.stones.mesh.setMatrixAt(i,matrix);
  });w.stones.mesh.instanceMatrix.needsUpdate=true;
}
function jerAnimate(api,dt){
  const moving=JER.marching&&!JER.waiting;
  JER.procession.forEach(w=>{api.posePerson(w.mesh,{dt,stride:moving?.7:0,grip:w.mesh.userData.horn?[[-.06,1.1,.38],[.28,1.12,.48]]:null});
    if(w===JER.ark)w.mesh.children.filter(c=>c.userData.storyActor).forEach(c=>api.posePerson(c,{dt,stride:moving?.7:0,grip:[[0,1.21,-.18],[0,1.21,.18]]}));});
  api.posePerson(JER.rahab,{dt,expression:JER.settled?'wonder':'listen'});api.posePerson(JER.joshua,{dt,expression:JER.settled?'wonder':'calm'});
  JER.banners.forEach((b,i)=>{const p=b.mesh.geometry.attributes.position;for(let j=0;j<p.count;j++){const x=b.base[j*3],y=b.base[j*3+1];p.setZ(j,b.base[j*3+2]+Math.sin(api.time*1.8+y*3+i)*.07*(.625-y)/1.25);}p.needsUpdate=true;b.mesh.geometry.computeVertexNormals();b.mesh.visible=!JER.settled;});
}

const LEVEL = {
  id: '3-8',
  bibleConnection: {"passage": "Joshua 2; 6", "text": "God judged Jericho and spared Rahab’s family. Just for our game: gather her family first. The walls’ fall and her rescue are God’s work, not powers earned by players."},
  world: 'World 3-9',            // shown one later (the plagues come first in Bible order); the id stays '3-8'
  title: 'The Walls Fall Down',
  town: true,                 // houses get doors, windows, awnings (engine house kit)
  artDirection: {textureStrength:.3,storyPlants:16,ambientCount:12,checkpointSigns:false,doorColors:[0x6e5136,0x856744],clothColors:[0xb4a17d,0x948b72]},
  decor: {grass:55,flowers:6,pebbles:16,plants:false},
  leafIcon: '📯',
  leafColor: 0xfbbf24,
  leafShape: 'round',
  spawn: [0, 30],
  bounds: { minX: -27, maxX: 27, minZ: -30, maxZ: 36 },
  approach: ['stones', 'crumbles', 'meadow:ox'],   // the way in (engine): a stretch before the level's own start
  startMessage: "Find Rahab’s red cord. Bring her family to her house on the wall.",

  intro: [
    { text: 'Now Jericho was straitly shut up because of the children of Israel: none went out, and none came in.', ref: 'Joshua 6:1' },
    { text: 'By faith the walls of Jericho fell down, after they were compassed about seven days.', ref: 'Hebrews 11:30' }
  ],

  introStory: [
    { art: '🙏', text: 'And the LORD said unto Joshua, See, I have given into thine hand Jericho, and the king thereof, and the mighty men of valour.', ref: 'Joshua 6:2' },
    { art: '🟥', title: 'Rahab believed', text: 'for the LORD your God, he is God in heaven above, and in earth beneath.', ref: 'Joshua 2:11' }
  ],

  tasks: [
    { id: 'family', icon: '🟥', label: 'Bring Rahab\'s family home', total: 4 },
    { id: 'march', icon: '📯', label: 'March round the city together', total: 7, lockedUntil: 'family' },
    { id: 'shout', icon: '📣', label: 'Everyone shout!', total: 1, lockedUntil: 'march' }
  ],

  memoryVerse: { text: 'Have not I commanded thee? Be strong and of a good courage; be not afraid, neither be thou dismayed: for the LORD thy God is with thee whithersoever thou goest.', ref: 'Joshua 1:9' },

  ending: {
    verse: { text: 'By faith the walls of Jericho fell down, after they were compassed about seven days.', ref: 'Hebrews 11:30' },
    message: 'God\'s way looked strange: walk, be quiet, shout. They trusted and obeyed, and God brought the walls down.'
  },

  quiz: [
    { q: 'How many times did they march round Jericho on the seventh day?', ref: 'Joshua 6:15', options: ['Once', 'Seven times', 'Twelve times'], answer: 1 },
    { q: 'What hung in Rahab\'s window?', ref: 'Joshua 2:18', options: ['A scarlet thread (cord)', 'A golden bell', 'A blue flag'], answer: 0 },
    { q: 'Who made the walls fall down?', ref: 'Joshua 6:16', options: ['The soldiers', 'The LORD', 'An earthquake machine'], answer: 1 }
  ],

  music: {
    bpm: 96,
    notes: [62, 0, 62, 65, 69, 0, 67, 65, 62, 0, 60, 0, 62, 0, 0, 0,
            65, 0, 69, 72, 74, 0, 72, 69, 67, 0, 65, 0, 62, 0, 0, 0],
    bass: [38, 38, 41, 41, 43, 43, 38, 38]
  },

  onCallText(kind, n) {                                                 // said once; after that they just come
    if (JER.saidCall) return '';
    JER.saidCall = true;
    return n > 1 ? n + ' of Rahab\'s family follow you.' : 'Rahab\'s family member follows you home.';
  },

  /* ---------- ground shape ---------- */
  terrain(x, z) {
    let h = Math.sin(x * 0.25) * Math.cos(z * 0.2) * 0.12;
    if (x > 22) h -= 2.4 * Math.min(1, (x - 22) / 1.5);                  // the Jordan
    return h;
  },

  groundColor(x, z, h) {
    if (h < -1) return 0x3b82c4;
    if (x > 21) return 0xc9b98a;
    const dx = Math.abs(x - JER.C[0]), dz = Math.abs(z - JER.C[1]);
    if (Math.max(dx, dz) > JER.LOOP - 1.2 && Math.max(dx, dz) < JER.LOOP + 1.2) return 0xc4ad80;   // the march path
    if (Math.max(dx, dz) < JER.HALF) return 0xa8957a;
    return 0x9eaa7c;
  },

  /* ---------- build ---------- */
  build(api) {
    const T = api.THREE;
    const [cx, cz] = JER.C, H = JER.HALF, wallH = 4.0, stone = 0xcbb38a;
    const person = (robe, scarf, s, o) => api.person(robe, scarf, s, o);   // friendly round townsfolk (engine)

    // --- the walls of Jericho: 3 sections per side, corner towers; Rahab's section stays standing ---
    const seg = (x, z, w, d, keep) => JER.walls.push({ box: api.box({ x, z, w, d, h: wallH, color: 0xa88e6c, tex:'stone', house:false }), keep: !!keep, x, z, w, d });
    [-6, 0, 6].forEach((o) => { seg(cx + o, cz + H, 6, 1.4); seg(cx + o, cz - H, 6, 1.4); seg(cx + H, cz + o, 1.4, 6); seg(cx - H, cz + o, 1.4, 6, o === 6); });
    [[1, 1], [1, -1], [-1, 1], [-1, -1]].forEach(([sx, sz]) => seg(cx + sx * H, cz + sz * H, 2.4, 2.4));
    JER.walls.slice(-4).forEach((w) => { w.box.mesh.scale.y = 4.6 / wallH; w.box.mesh.position.y = 2.3; w.box.platform.top = 4.6; });   // towers a little taller
    // Batched masonry follows each original solid wall; no decorative block creates a new ledge.
    JER.walls.forEach(w=>jerStoneWall(api,w));
    // Shut timber gates on both approaches, with inset beams and bronze studs.
    const gate=new T.Group();gate.name='jericho-shut-gates';api.add(gate);JER.gate=gate;
    [-1,1].forEach(sd=>{
      const face=new T.Group();face.position.set(cx,0,cz+sd*(H+.73));gate.add(face);
      const piece=(w,h,d,x,y,z,c,tex)=>{const m=new T.Mesh(new T.BoxGeometry(w,h,d),api.texMat(c,tex));m.position.set(x,y,z);face.add(m);return m;};
      for(let i=0;i<6;i++)piece(.38,2.9,.12,-1+i*.4,1.45,0,0x705036,'wood');
      [.55,2.15].forEach(y=>piece(2.45,.17,.18,0,y,sd*.06,0x433323,'wood'));
      [-1.42,1.42].forEach(x=>piece(.3,3.25,.28,x,1.625,0,0xd5c09a,'stone'));
      piece(3.15,.32,.3,0,3.32,0,0xd5c09a,'stone');
      [-.85,.85].forEach(x=>[.55,2.15].forEach(y=>{const m=new T.Mesh(new T.SphereGeometry(.065,6,4),api.mat(0xab864b));m.position.set(x,y,sd*.17);face.add(m);}));
      api.scenery(face);gate.add(face);
    });
    // Cloth is scenery. Four short banners keep the silhouette clear without hiding the march.
    [[-9,-15],[9,-15],[-9,3],[9,3]].forEach(([x,z],i)=>{
      const g=new T.PlaneGeometry(.65,1.25,3,6),m=new T.Mesh(g,api.texMat(i%2?0x71817c:0x998054,'cloth',{side:T.DoubleSide}));
      m.position.set(x,3.35,z+(z<0?-1.24:1.24));m.rotation.y=0;api.add(m);
      JER.banners.push({mesh:m,base:Float32Array.from(g.attributes.position.array)});
    });
    // Imagined escape steps: a missed wall jump must never trap a player in the city.
    JER.escapeSteps=[[6.6,-7,1],[6.6,-4.5,2],[6.6,-2,3],[6.6,.5,3.6]].map(([x,z,top])=>{
      const h=api.box({x,z,y:0,w:2.4,d:2.1,h:top,color:0xe5d5ac,tex:'stone',house:false});return {x,z,top,box:h};
    });
    // A second approach reaches the same top step from the north side of the houses.
    JER.escapeNorth=[[2.2,1,1],[4.4,1,2]].map(([x,z,top])=>{const h=api.box({x,z,y:0,w:2.4,d:1.6,h:top,color:0xe5d5ac,tex:'stone',house:false});return {x,z,top,box:h};}).concat(JER.escapeSteps.slice(-1));
    const exitArrow=new T.Mesh(new T.ConeGeometry(.25,.7,3),new T.MeshBasicMaterial({color:0x297f80}));exitArrow.rotation.x=Math.PI/2;exitArrow.position.set(6.6,1.06,-7);api.add(exitArrow);
    api.camZone({minX:4.5,maxX:8.4,minZ:-8.5,maxZ:3,yaw:-.45,height:11,back:16,focus:[6.6,3,.5],pull:.18});
    // houses inside the city (rooftops peek over the walls)
    [[-4, -10, 3, 5.0], [3, -11, 4, 5.6], [-3, -2, 4, 5.2], [4, -3, 3, 4.6], [0, -6, 2.5, 6.4]].forEach(([x, z, w, h]) =>
      api.box({ x: cx + x, z, w, d: w, h, color: 0xd9c7a0 }));
    // Rahab's house built into the west wall, the scarlet cord hanging from the window
    api.box({ x: cx - H, z: cz + 6, w: 2.6, d: 3.2, h: 1.8, y: wallH, color: 0xd6c09a, solid: false });
    const win = new T.Mesh(new T.BoxGeometry(0.1, 0.7, 0.8), api.mat(0x3f2a16)); win.position.set(cx - H - 1.32, wallH + 1.0, cz + 6); api.add(win);
    const cord = new T.Mesh(new T.CylinderGeometry(0.06, 0.06, wallH + 0.8, 6), new T.MeshLambertMaterial({ color: 0xdc2626, emissive: 0x5a0a0a }));
    cord.position.set(cx - H - 1.4, (wallH + 0.8) / 2, cz + 6); api.add(cord);
    const rahab = api.storyPerson(0x9d4b42, 0xe5d5b1,1,{beard:false}); rahab.position.set(cx - H - 0.6, wallH, cz + 6); rahab.rotation.y = -Math.PI / 2; api.add(rahab); JER.rahab = rahab;
    const ring = new T.Mesh(new T.RingGeometry(2.2, 2.5, 28), new T.MeshBasicMaterial({ color: 0xdc2626, transparent: true, opacity: 0.55, side: T.DoubleSide }));
    ring.rotation.x = -Math.PI / 2; ring.position.set(JER.RAHAB[0], api.terrain(JER.RAHAB[0], JER.RAHAB[1]) + 0.06, JER.RAHAB[1]); api.add(ring);

    // --- Rahab's family, out in the fields: bring them home ---
    [[-20, 22, 0x7c2d12], [14, 18, 0x1e3a8a], [-17, -24, 0x166534], [13, -25, 0x6b21a8]].forEach(([x, z, robe], i) => {
      const f = api.follower({
        x, z, kind: 'family', mesh: person(robe, i % 2 ? 0xf5f5f4 : 0xfca5a5),
        deliverTo: { x: JER.RAHAB[0], z: JER.RAHAB[1], r: 2.6 },
        parkAt: (fo) => { const k = JER.family.indexOf(fo); return [JER.RAHAB[0] + 0.3 - (k % 2) * 0.9, api.terrain(JER.RAHAB[0], JER.RAHAB[1]), JER.RAHAB[1] - 1.6 + k * 1.05]; },
        onDeliver(p) {
          api.task('family');
          api.servant(p, 5, 'for bringing a family home!');
          if (api.taskCount('family') >= 4) LEVEL._seventhDay(api);   // (the task board counts the others: no pop-up)
        }
      });
      JER.family.push(f);
    });

    // --- the camp of Israel (north) ---
    [[-8,24],[-3,27],[4,26],[9,23],[-12,29],[12,29]].forEach(([x,z],i)=>api.clothTent({x,z,color:i%2?0xb7a285:0x9e8b70}));
    const joshua=api.storyPerson(0x756c4d,0xe5d7b9,1,{beard:true});joshua.position.set(5,api.terrain(5,13),13);api.add(joshua);JER.joshua=joshua;
    JER.guide=api.conversation({person:joshua,speaker:'Joshua',clue(){
      if(!api.taskDone('family'))return {text:'Find the red cord on the west wall. Bring the family to that house.',at:[JER.RAHAB[0],2,JER.RAHAB[1]]};
      if(!api.taskDone('march'))return {text:api.taskCount('march')<1?'Stay with the priests. The procession waits for everyone.':'One circuit is done. Use the action beside the ark to see the rest.',at:[JER.ark.mesh.position.x,2,JER.ark.mesh.position.z]};
      return {text:api.taskDone('shout')?'God brought down the walls. Rahab’s family was spared.':'Wait for Joshua’s command. Then everyone shout together.',at:[JER.SHOUT[0],1.5,JER.SHOUT[1]]};
    }});

    // --- the march loop, and the procession (priests with rams' horns, then the ark, then the people) ---
    const L = JER.LOOP, top = cz + L, bot = cz - L;
    JER.path = [[cx, top], [cx + L, top], [cx + L, bot], [cx - L, bot], [cx - L, top], [cx, top]];
    for (let i = 0; i < JER.path.length - 1; i++) JER.P += Math.hypot(JER.path[i + 1][0] - JER.path[i][0], JER.path[i + 1][1] - JER.path[i][1]);
    for (let k = 0; k < 7; k++) {                                       // seven priests, seven trumpets
      const m = api.storyPerson(0xece7d9,0xd7ccb4,1,{register:false,beard:true});
      const curve=new T.CatmullRomCurve3([[.08,1.2,.36],[-.06,1.1,.38],[.28,1.12,.48],[.45,1.27,.7]].map(v=>new T.Vector3(...v)));
      const horn=new T.Mesh(new T.TubeGeometry(curve,10,.085,6,false),api.texMat(0xbba06d,'wood'));m.add(horn);m.userData.horn=true;
      api.add(m); JER.procession.push({ mesh: m, back: k * 1.5 });
    }
    const ark = new T.Group();
    const chest = new T.Mesh(new T.BoxGeometry(0.9, 0.7, 1.4), new T.MeshLambertMaterial({ color: 0xc9a653, emissive: 0x302409 })); chest.position.y = 1.35; ark.add(chest);
    const lid=new T.Mesh(new T.BoxGeometry(1.02,.1,1.52),api.mat(0xd4b36d));lid.position.y=1.74;ark.add(lid);
    [-0.6, 0.6].forEach((dx) => { const pole = new T.Mesh(new T.CylinderGeometry(0.05, 0.05, 3, 6), api.mat(0xb8860b)); pole.rotation.x = Math.PI / 2; pole.position.set(dx, 1.15, 0); ark.add(pole); });
    [[-0.6, -1.2], [0.6, -1.2], [-0.6, 1.2], [0.6, 1.2]].forEach(([dx, dz]) => { const pr = api.storyPerson(0xece7d9,0xd6d3d1,.95,{register:false,beard:true}); pr.position.set(dx, 0, dz); ark.add(pr); });
    api.add(ark); JER.ark = { mesh: ark, back: 12 }; JER.procession.push(JER.ark);
    [0x7c3aed, 0xb91c1c, 0x0e7490, 0xca8a04, 0x15803d, 0x92400e].forEach((robe, k) => { const m = api.storyPerson(robe,0xe7dec9,1,{register:false}); api.add(m); JER.procession.push({ mesh: m, back: 15.5 + k * 1.6 }); });
    LEVEL._placeMarch(api);

    // things on the loop to hop and wade through (the march keeps going; you keep up)
    [[cx + 4, bot + 0.6], [cx - 3, bot - 0.5], [cx - 8, bot + 0.4], [cx + L + 0.5, cz - 4], [cx + L - 0.4, cz + 2]].forEach(([x, z]) => api.stump(x, z, 0.55, 0.5));
    api.mud({ x: cx - L, z: cz - 6, w: 4, d: 8 });
    const shoutSpot = new T.Mesh(new T.RingGeometry(5.5, 6, 36), new T.MeshBasicMaterial({ color: 0xfbbf24, transparent: true, opacity: 0.5, side: T.DoubleSide }));
    shoutSpot.rotation.x = -Math.PI / 2; shoutSpot.position.set(JER.SHOUT[0], api.terrain(JER.SHOUT[0], JER.SHOUT[1]) + 0.07, JER.SHOUT[1]); shoutSpot.visible = false; api.add(shoutSpot);
    JER.shoutRing = shoutSpot;
    JER.collapseView=api.camZone({minX:0,maxX:0,minZ:0,maxZ:0,yaw:.22,height:14,back:26,focus:[0,1.5,-6],pull:.7});
    JER.shoutI = api.interact({
      x: JER.SHOUT[0], z: JER.SHOUT[1], r: 6, vRange: 4, label: 'Shout!', priority: 2,
      can: (p) => (JER.shouted[p.slot] ? 'You shouted! Waiting for everyone…' : true),
      use(p) {
        JER.shouted[p.slot] = true; api.sfx('coin');
        const ps = api.activePlayers(), left = ps.filter((q) => !JER.shouted[q.slot]);
        if (left.length) { api.toast('📣 P' + (p.slot + 1) + ' shouted! Waiting for ' + left.map((q) => 'P' + (q.slot + 1)).join(', '), 2400); return; }
        api.task('shout'); JER.shoutI.alive = false;
        api.servant(p, 5, 'for trusting God!');
        JER.fallT = api.time; JER.shoutRing.visible = false;
        api.music(false);api.sfx('hit');
        Object.assign(JER.collapseView,{minX:-18,maxX:18,minZ:-24,maxZ:20});
        JER.walls.forEach((w) => { if (!w.keep) w.box.platform.on = false; });
        api.toast('God brought the walls down. Rahab’s family was spared.',3500);
      }
    });

    // This is a story abbreviation, not a different biblical count or a new run binding.
    JER.quickMarch=api.interact({x:0,z:0,r:4.5,vRange:2,priority:0,label:'See the remaining circuits',
      available:p=>JER.marching&&api.taskCount('march')>=1&&!JER.shortened&&!p.riding&&!p.seat&&!p.carrying&&!p.carriedBy,
      can:()=>JER.waiting||api.players().some(p=>p.bubble)?'Let everyone catch up to the procession first.':true,
      use(){if(!JER.marching||api.taskCount('march')<1||JER.shortened)return;JER.shortened=true;JER.marching=false;this.remove();
        api.story([{art:'📯',title:'The remaining circuits',text:'Israel completed all seven circuits on the seventh day. This short scene stands for the remaining circuits. They kept quiet until Joshua gave the command to shout.'}],()=>{
          api.task('march',7-api.taskCount('march'));JER.s=7*JER.P;LEVEL._placeMarch(api);LEVEL._endMarch(api);
        });
      }
    });

    JER.shoutI.alive = false;                                          // only once the seventh time round is done

    // --- fragments ---
    // 1: the Fisherman nets one from the Jordan
    api.hazard({ x: 25, z: 3, w: 6, d: 66 }, { maxY: -0.6, except: (p) => p.role.id === 'fisherman', msg: 'Splash! The Jordan is deep here (the Fisherman can wade).' });
    api.fragment({ x: 24.5, z: -4, y: 0.4, net: true });
    // 2: crumbling stones up a rocky outcrop in the south-west
    [[-21, -14.4, 1.0], [-22.6, -16.8, 2.0], [-21, -19.2, 3.0]].forEach(([x, z, t]) => api.crumble({ x, z, top: api.terrain(x, z) + t }));
    api.box({ x: -21.5, z: -22, w: 2.4, d: 2.4, h: 3.8, color: 0x9c8b6e });
    api.fragment({ x: -21.5, z: -22, y: 3.8 + 1.3 });
    // 3: a spring up onto the north-east tower
    api.spring({ x: cx + H + 2.2, z: cz + H + 1.6 });
    api.fragment({ x: cx + H, z: cz + H, y: 4.6 + 1.3 });

    // --- Golden Scroll challenge course: through the west fields ---
    const plan = [['block', 1.0], ['float', 1.0], ['crumble', 0.9], ['float', 0.8], ['spring', 0.2], ['float', 4.2], ['crumble', 0.6], ['float', 0.4]];
    let ctop = 0;
    api.course(plan.map(([kind, rise], i) => {
      const z = 31 - i * 2.9, x = -22 + (i % 2 ? 0.3 : -0.3);
      ctop = i === 0 ? api.terrain(x, z) + 1.0 : ctop + rise;
      return { x, z, top: ctop, kind };
    }));

    api.leaves([[0, 25], [-6, 19], [6, 19], [-14, 14], [14, 12], [cx + L, cz + 6], [cx + L, cz - 10], [cx + 8, cz - L], [cx - 6, cz - L],
      [cx - L, cz - 12], [cx - L, cz + 4], [-20, 22], [14, 18], [-17, -24], [13, -25], [cx - 8, bot + 0.4, 1.4]]);
    // camera: frame Rahab's house on the wall, with the scarlet cord
    api.camZone({ minX: -18, maxX: -8, minZ: -6, maxZ: 6, yaw: -0.7, height: 9, back: 12, focus: [JER.RAHAB[0], 3, JER.RAHAB[1]], pull: 0.4 });
  },

  // place everyone in the march along the loop
  _placeMarch(api) {
    JER.procession.forEach((w) => {
      const [x, z, a] = jerAt(JER.s - w.back);
      w.mesh.position.set(x, api.terrain(x, z), z);
      w.mesh.rotation.y = a;
    });
  },

  // the family is home: the seventh day begins
  _seventhDay(api) {
    api.story([
      { art: '📯', title: 'The seventh day', connection:{passage:'Joshua 6:3–4, 15',text:'Six days: once each day. Seventh day: seven circuits. After one circuit, you may watch the rest.'}, text: 'And it came to pass on the seventh day, that they rose early about the dawning of the day, and compassed the city after the same manner seven times: only on that day they compassed the city seven times.', ref: 'Joshua 6:15' }
    ], () => { JER.marching = true; api.toast('🤫 March with the priests and the ark, and keep quiet (Joshua 6:10). The march waits for everyone!', 4500); });
  },

  _inside(p){return JER.fallT===undefined&&Math.abs(p.pos.x-JER.C[0])<JER.HALF-.75&&Math.abs(p.pos.z-JER.C[1])<JER.HALF-.75&&p.pos.y<3.6;},
  _endMarch(api){
    JER.marching=false;JER.shoutRing.visible=true;JER.shoutI.alive=true;if(JER.quickMarch)JER.quickMarch.remove();
    api.story([{art:'📯',text:'And it came to pass at the seventh time, when the priests blew with the trumpets, Joshua said unto the people, Shout; for the LORD hath given you the city.',ref:'Joshua 6:16'}],()=>api.toast('📣 Everyone stand in the golden ring and press Action to SHOUT!',4000));
  },

  update(api, dt) {
    jerAnimate(api,dt);
    if(!JER.insideHinted&&api.activePlayers().some(LEVEL._inside)){JER.insideHinted=true;api.toast('Inside the wall? Climb the pale steps to the north wall, then jump back to the grass.',4200);}
    if(JER.quickMarch){const a=JER.ark.mesh.position;JER.quickMarch.x=a.x;JER.quickMarch.y=a.y;JER.quickMarch.z=a.z;}

    // the march: moves only while everyone is close to it
    if (JER.marching) {
      const ps = api.activePlayers();
      const pts = [0, 12, 24].map((b) => jerAt(JER.s - b));
      const far = ps.filter((p) => Math.min(...pts.map(([x, z]) => Math.hypot(p.pos.x - x, p.pos.z - z))) > 9);
      const wasWaiting = JER.waiting;
      JER.waiting = far.length > 0;
      if (JER.waiting && !wasWaiting) api.toast('⏸️ The march waits for ' + far.map((p) => 'P' + (p.slot + 1)).join(', ') + '. Keep together! (C / L3 to catch up)', 2600);
      if (!JER.waiting) {
        const lap = Math.floor(JER.s / JER.P);
        JER.s = Math.min(JER.s + 7 * dt, 7 * JER.P);
        const now = Math.floor(JER.s / JER.P);
        if (now > lap) {
          api.task('march');
          ps.forEach((p) => api.servant(p, 2));
          if(now===1)api.toast('One circuit complete. Use the nearby action for a short scene of the rest, or keep marching.',4000);
          else if (now === 6) api.toast('📯 Six times round. One more time, quietly!', 2200);   // (the task board counts the others)
        }
        if (JER.s >= 7 * JER.P) {
          LEVEL._endMarch(api);
        }
      }
      LEVEL._placeMarch(api);
      // walkers bob as they march
      JER.procession.forEach((w, i) => { if (!JER.waiting) w.mesh.position.y += Math.abs(Math.sin(api.time * 8 + i)) * 0.08; });
    }
    // A staged visual collapse stays inside the former wall footprint; rubble never hurts or traps players.
    if(JER.fallT!==undefined){
      const elapsed=api.time-JER.fallT,k=Math.min(1,elapsed/2.2);
      JER.walls.forEach((w,i)=>{
        if(w.keep)return;
        const m=w.box.mesh;m.scale.y=Math.max(.05,w.sy*(1-k));m.position.y=w.bottom+w.height*(1-k)/2;
        jerStonePose(api,w,k);
        if(!w.dusted&&elapsed>.12+(i%4)*.28){w.dusted=true;api.puff(w.x,w.bottom+.35,w.z,0xcbbda5,6);}
      });
      if(JER.gate)JER.gate.visible=k<.45;
      JER.banners.forEach(b=>{b.mesh.position.y=3.35*(1-k);b.mesh.visible=k<.85;});
      if(k===1&&!JER.settled){JER.settled=true;api.sfx('block');api.music(true);}
      if(elapsed>3)Object.assign(JER.collapseView,{minX:0,maxX:0,minZ:0,maxZ:0});
    }

  },

  objective(api) {
    const ps = api.activePlayers();
    if (!ps.length) return null;
    const inside=ps.find(LEVEL._inside);if(inside){const route=inside.pos.z> -1.5?JER.escapeNorth:JER.escapeSteps;const st=route.find(s=>inside.pos.y<s.top-.45);return st?[st.x,st.top+1,st.z]:[6.6,4.8,3];}
    if (!api.taskDone('family')) {
      if (JER.family.some((f) => f.state === 'follow')) return [JER.RAHAB[0], 1.5, JER.RAHAB[1]];
      const cx = ps[0].pos.x, cz = ps[0].pos.z;
      const idle = JER.family.filter((f) => f.state === 'idle').sort((a, b) => Math.hypot(a.pos.x - cx, a.pos.z - cz) - Math.hypot(b.pos.x - cx, b.pos.z - cz))[0];
      return idle ? [idle.pos.x, idle.pos.y + 2, idle.pos.z] : null;
    }
    if (!api.taskDone('march')) { const a = JER.ark.mesh.position; return [a.x, a.y + 2.5, a.z]; }
    if (!api.taskDone('shout')) return [JER.SHOUT[0], 1.5, JER.SHOUT[1]];
    return null;
  },

  isComplete(api){return api.taskDone('family')&&api.taskDone('march')&&api.taskDone('shout')&&!!JER.settled;},

  finale: {
    message: '🟥 Everyone go to Rahab\'s house: her family is safe!',
    beacon: [JER.RAHAB[0], 3, JER.RAHAB[1]],
    inZone(p) { return Math.hypot(p.pos.x - JER.RAHAB[0], p.pos.z - JER.RAHAB[1]) < 5; },
    onUpdate(api, t) {
      if (t > 0.5 && JER.settled && !JER.told) {
        JER.told = true;
        api.story([
          { art: '🧱', text: 'So the people shouted when the priests blew with the trumpets: and it came to pass, when the people heard the sound of the trumpet, and the people shouted with a great shout, that the wall fell down flat,', ref: 'Joshua 6:20' },
          { art: '🟥', text: 'And the young men that were spies went in, and brought out Rahab, and her father, and her mother, and her brethren, and all that she had; and they brought out all her kindred, and left them without the camp of Israel.', ref: 'Joshua 6:23' },
          { art: '👑', title: 'Rahab in Jesus\' family', text: 'Israel destroyed Jericho, killing its people and animals (Joshua 6:21). God judged sin. Rahab believed Him; she and her family were spared (Hebrews 11:31). She lived among Israel and is in Jesus’ family line (Joshua 6:25; Matthew 1:5–6).' }
        ], () => { JER.endT = api.time; });
      }
      return JER.endT !== undefined && api.time - JER.endT > 2;
    }
  }
};
