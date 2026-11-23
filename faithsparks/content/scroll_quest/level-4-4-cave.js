/* =====================================================================
 * LEVEL 4-4: MERCY IN THE CAVE  (1 Samuel 24)
 * ---------------------------------------------------------------------
 * King Saul is hunting David among the rocks of En-gedi. North to south:
 *   The hills (z 34..-18)  gather David's four men from their hiding places. Saul's soldiers search
 *                          with watchful eyes (a yellow cone). Keep behind the rocks: if they see you,
 *                          you just slip back to the last rocks (never caught, never hurt).
 *   The cave  (z -24..-34) Saul comes in to rest. David's men say "now's your chance". David only
 *                          cuts a corner off Saul's robe, and then even feels bad about that.
 * The lesson: mercy, not revenge. "Overcome evil with good."
 * Only edit THIS file to change the level. See GEMINI.md and CAMPAIGN.md.
 * ===================================================================== */

const CAVE = {
  MOUTH: [0, -24],
  INSIDE: [0, -29],
  CHECKS: [[0, 31], [0, 16], [0, 1], [0, -15]],   // safe spots to slip back to
  rocks: [],                   // cover: [minX, maxX, minZ, maxZ]
  men: [],
  soldiers: [],
  spotted: 0,
  elapsed: 0, shell: []
};

// is the line from a to b blocked by a rock?
function caveBlocked(ax, az, bx, bz) {
  for (let k = 1; k < 8; k++) {
    const x = ax + (bx - ax) * k / 8, z = az + (bz - az) * k / 8;
    if (CAVE.rocks.some((r) => x > r[0] && x < r[1] && z > r[2] && z < r[3])) return true;
  }
  return false;
}

function caveDress(api){
  const T=api.THREE,rim=new T.Group();rim.name='engedi-eroded-mouth';rim.position.set(0,0,-24);
  const pebble=(x,y,z,sx,sy,sz,color)=>{const m=new T.Mesh(new T.DodecahedronGeometry(.5,0),api.texMat(color,'stone'));m.position.set(x,y,z);m.scale.set(sx,sy,sz);m.castShadow=true;rim.add(m);};
  [-1,1].forEach(sd=>{for(let j=0;j<5;j++)pebble(sd*(2.95+(j%2)*.12),.8+j*1.1,.6,1.7,1.6,.85,j%2?0xa39074:0x8a7a65);});
  for(let j=0;j<3;j++)pebble(-1.25+j*1.25,4.6+(j%2)*.16,.6,1.65,1.6,.85,j%2?0xa59276:0x8e7d65);
  api.scenery(rim);api.fadeScenery(rim,3);CAVE.rim=rim;
  // Low, non-solid stones hug the back wall and never conceal a landing or clue.
  const back=new T.Group();back.name='engedi-back-stones';back.position.set(0,0,-32.6);
  [-3.5,-2.9,2.8,3.5].forEach((x,i)=>{const m=new T.Mesh(new T.DodecahedronGeometry(.38,0),api.texMat(0x766d60,'stone'));m.position.set(x,.12,(i%2)*.12);m.scale.set(1,.35,.7);back.add(m);});api.scenery(back);
}
function caveAct(api,dt){
  CAVE.elapsed+=dt;const david=CAVE.david,saul=CAVE.saul;
  if(CAVE.depart){const w=CAVE.depart;w.t=Math.min(2,w.t+dt);const a=w.t/2;saul.position.set(w.from.x*(1-a),api.terrain(w.from.x*(1-a),w.from.z+(-14-w.from.z)*a),w.from.z+(-14-w.from.z)*a);saul.rotation.y=Math.atan2(-w.from.x,-14-w.from.z);if(a===1)saul.rotation.y=Math.PI;}
  if(CAVE.davidWalk){const w=CAVE.davidWalk;w.t=Math.min(2.2,w.t+dt);const a=w.t/2.2,first=a<.6,u=first?a/.6:(a-.6)/.4,x=first?w.from.x*(1-u):-2.4*u,z=first?w.from.z+(-22.7-w.from.z)*u:-22.7+3.7*u;david.position.set(x,api.terrain(x,z),z);david.rotation.y=first?Math.atan2(-w.from.x,-22.7-w.from.z):Math.atan2(-2.4,3.7);CAVE.davidOutside=a===1;if(a===1)david.rotation.y=Math.atan2(saul.position.x-david.position.x,saul.position.z-david.position.z);}
  api.posePerson(david,{dt,stride:CAVE.davidWalk&&!CAVE.davidOutside?.65:0,expression:CAVE.cut&&!CAVE.out?'worry':'listen',headPitch:CAVE.cut&&!CAVE.out?.18:0,grip:CAVE.cut?[null,[.3,.53,.25]]:null});
  api.posePerson(saul,{dt,stride:CAVE.depart&&CAVE.depart.t<2?.8:0,expression:CAVE.out?'worry':'calm',headPitch:CAVE.out?.16:0});
  CAVE.men.forEach(f=>api.posePerson(f.mesh,{dt,stride:f.state==='follow'?.55:f.state==='delivered'?.25:0,expression:api.taskDone('men')?'worry':'listen',headPitch:api.taskDone('men')?.08:0}));
}

const LEVEL = {
  id: '4-4',
  bibleConnection: {"passage": "1 Samuel 24", "text": "Saul wanted David dead. David refused to kill him, and even cutting Saul’s robe troubled his conscience. Just for our game: lead the men to shelter. David left judgment with the LORD."},
  world: 'World 4-4',
  title: 'Mercy in the Cave',
  artDirection:{textureStrength:.3,storyPlants:16,checkpointSigns:false},
  decor:{grass:35,flowers:4,pebbles:18,plants:false},
  leafIcon: '🐐',
  life:false,
  reactive: false,                    // soldiers searching: nobody turns to look at you (stealth stays clear)
  leafColor: 0xe7d3a8,
  leafShape: 'round',
  spawn: [0, 69],
  bounds: { minX: -21, maxX: 21, minZ: -36, maxZ: 74 },
  startMessage: "Just for our game: hop the ledges through the rocks. Miss a jump? Land on the ground and try again.",

  intro: [
    { text: 'The LORD forbid that I should do this thing unto my master, the LORD’s anointed, to stretch forth mine hand against him, seeing he is the anointed of the LORD.', ref: '1 Samuel 24:6' },
    { text: 'Be not overcome of evil, but overcome evil with good.', ref: 'Romans 12:21' }
  ],

  introStory: [
    { art: '👑', title: 'A jealous king', text: 'God had chosen David to be the next king. King Saul was jealous and angry, and he hunted David to kill him (1 Samuel 24:11).' },
    { art: '🐐', text: 'Then Saul took three thousand chosen men out of all Israel, and went to seek David and his men upon the rocks of the wild goats.', ref: '1 Samuel 24:2' }
  ],

  tasks: [
    { id: 'men', icon: '👥', label: 'Bring David\'s men to the cave', total: 4 },
    { id: 'robe', icon: '✂️', label: 'Only cut a corner of Saul\'s robe', total: 1, lockedUntil: 'men' },
    { id: 'call', icon: '📣', label: 'Go out and call to Saul', total: 1, lockedUntil: 'robe' }
  ],

  memoryVerse: { text: 'Be not overcome of evil, but overcome evil with good.', ref: 'Romans 12:21' },

  ending: {
    verse: { text: 'And he said to David, Thou art more righteous than I: for thou hast rewarded me good, whereas I have rewarded thee evil.', ref: '1 Samuel 24:17' },
    message: 'David’s conscience troubled him even over cutting the robe. He refused to kill Saul and left judgment with the LORD.'
  },

  quiz: [
    { q: 'Where did Saul go while David was hiding?', ref: '1 Samuel 24:3', options: ['Into the same cave', 'Back home', 'Up a tree'], answer: 0, explain:'Saul entered the cave where David and his men were hiding.' },
    { q: 'What did David cut?', ref: '1 Samuel 24:4–6', options: ['A rope', 'A corner (skirt) of Saul\'s robe', 'A tree branch'], answer: 1, explain:'David cut a robe corner, but afterward his conscience troubled him. He refused to kill Saul.' },
    { q: 'What did Saul say about David?', ref: '1 Samuel 24:17', options: ['"Thou art more righteous than I"', '"I will catch you"', '"Go away"'], answer: 0, explain:'Saul admitted that David had repaid his evil with good.' }
  ],

  music: {
    bpm: 86,
    notes: [62, 0, 65, 0, 69, 0, 67, 65, 64, 0, 60, 0, 62, 0, 0, 0,
            65, 0, 67, 69, 70, 0, 69, 67, 65, 0, 64, 0, 62, 0, 0, 0],
    bass: [38, 38, 41, 41, 36, 36, 38, 38]
  },

  onCallText(kind, n) {                                                 // said once; after that they just come
    if (CAVE.saidCall) return '';
    CAVE.saidCall = true;
    return n > 1 ? n + ' of David\'s men follow you quietly.' : 'One of David\'s men follows you quietly.';
  },

  /* ---------- ground shape ---------- */
  terrain(x, z) {
    let h = Math.sin(x * 0.35) * Math.cos(z * 0.28) * 0.25;
    h += Math.max(0, Math.abs(x) - 17) * 1.2;
    const pd = Math.hypot(x - 13, z + 10);                              // the spring of En-gedi
    if (pd < 2.8) h -= 1.8 * Math.min(1, (2.8 - pd) / 1);
    return h;
  },

  groundColor(x, z, h) {
    if (h < -0.8) return 0x3b82c4;
    if(Math.abs(x)<4&&z< -24&&z> -33.2)return z< -29?0x82776a:0x9d8c76;
    return 0xbca785;
  },

  /* ---------- build ---------- */
  build(api) {
    const T = api.THREE;
    const person = (robe, scarf, s, o) => api.person(robe, scarf, s, o);   // friendly round townsfolk (engine)
    const rockC = 0x9c8b6e;

    // An imagined En-gedi approach: grounded ledges and rock gaps, with safe ground below.
    CAVE.entry={done:false,route:[],sideRoute:[]};
    const entry=CAVE.entry;
    const shelf=(x,z,rise,w=6,d=4.5)=>{const y=api.terrain(x,z);const h=api.rockBox({x,z,y,w,d,h:rise,color:0x9c8b6e});return [x,y+rise,z];};
    entry.route.push(shelf(0,65,.65),shelf(-4,60,1.1),shelf(0,55,.65));
    entry.route.push([0,api.terrain(0,51.8),51.8,false],shelf(4,49,1.05));
    entry.route.push([0,api.terrain(0,42),42,false]);
    // Broad gaps require a hop, without pits, fetch errands or a moving raft.
    [[-4,60],[4,49]].forEach(([cx,z])=>{
      const left=cx-3,right=cx+3;
      if(z===60){
        api.rockBox({x:-16.75,z,w:8.5,d:1.8,h:3.1,color:0x887a65});
        api.rockBox({x:-10,z,w:5,d:1.8,h:1.4,color:0xa89579});
        api.rockBox({x:-7.25,z,w:.5,d:1.8,h:3.1,color:0x887a65});
      }else api.rockBox({x:(-21+left)/2,z,w:left+21,d:1.8,h:3.1,color:0x887a65});
      api.rockBox({x:(right+21)/2,z,w:21-right,d:1.8,h:2.8,color:0x93836c});
    });
    const shelterLanding=shelf(-10,58,1,5.5,5);shelterLanding[2]=58;
    entry.sideRoute.push(shelf(-7,63,.55,4.5,4),[-10,api.terrain(-10,60)+1.4,60],shelterLanding);
    const sy=api.terrain(-10,58)+1;
    api.rockBox({x:-10,z:55.5,w:6,d:.6,h:4.5,color:0x877b68});
    const roof=api.rockBox({x:-10,z:55.9,w:6,d:.8,h:.5,y:sy+3.4,color:0x877b68});api.fadeScenery(roof.mesh,3);
    const goat=api.animalMesh('goat');goat.position.set(-11.3,sy,56.7);goat.rotation.y=.7;api.add(goat);entry.goat=goat;
    entry.discovery=api.discovery({id:'engedi-shelter',name:'The wild-goat shelter',x:-9.5,z:58,y:sy,r:1.5,vRange:.65});
    api.leaves([[0,68],[0,65,api.terrain(0,65)+1.7],[-4,60,api.terrain(-4,60)+2.1],[0,55,api.terrain(0,55)+1.7],[4,49,api.terrain(4,49)+2.1],[0,42],[-7,63,api.terrain(-7,63)+1.6],[-10,58,sy+1]]);
    api.trail([[0,70],[0,65],[-4,60],[0,55],[0,51.8],[4,49],[0,42],[0,34]],2.3);
    api.camZone({minX:-16,maxX:16,minZ:37,maxZ:73,yaw:.2,height:12,back:18,focus:[0,1,55],pull:.12});

    // --- big rocks: cover to hide behind ---
    const rock = (x, z, w, d, h) => { api.rockBox({ x, z, w, d, h, color: rockC }); CAVE.rocks.push([x - w / 2, x + w / 2, z - d / 2, z + d / 2]); };
    [[-6, 26, 4, 2.4, 2.6], [6, 25, 4, 2.4, 2.4], [-12, 18, 3, 3, 2.8], [10, 16, 4, 2.2, 2.6], [-3, 13, 5, 2, 2.4], [-10, 4, 4, 2.4, 2.6],
     [8, 4, 3, 3, 2.8], [2, -2, 5, 2, 2.4], [-14, -8, 3, 3, 2.6], [6, -12, 4, 2.4, 2.6], [-5, -14, 4, 2.4, 2.4], [14, 24, 3, 3, 2.6]].forEach(([x, z, w, d, h]) => rock(x, z, w, d, h));

    // --- the cliff and the cave ---
    const [mx, mz] = CAVE.MOUTH;
    // Uneven rock shoulders keep a clear four-metre mouth and solid, matching tops.
    [-1,1].forEach(side=>[6.6,7,6.3,5.3,4.4].forEach((h,i)=>api.rockBox({x:side*(3.9+i*3.8),z:mz,w:3.8,d:1.6,h,color:i%2?0x8c7c66:0x857660})));
    CAVE.frontRoof=api.rockBox({ x: 0, z: mz, w: 4, d: 1.6, h: 3.4, y: 3.6, color: 0x857660 });          // above the mouth
    api.rockBox({ x: -4.5, z: -29, w: 1, d: 9, h: 4, color: 0x6f6350 });
    api.rockBox({ x: 4.5, z: -29, w: 1, d: 9, h: 4, color: 0x6f6350 });
    api.rockBox({ x: 0, z: -33.6, w: 10, d: 1, h: 4, color: 0x6f6350 });
    CAVE.roof=api.rockBox({ x: 0, z: -29, w: 10, d: 9.2, h: 0.6, y: 4, color: 0x6f6350 });          // the cave roof
    CAVE.roof.mesh.name='engedi-cave-roof';api.fadeScenery(CAVE.roof.mesh,5.2);api.fadeScenery(CAVE.frontRoof.mesh,2.6);
    caveDress(api);
    const dark=new T.PointLight(0xa6b9ce,.65,11,2);dark.position.set(0,2.6,-29);api.add(dark);
    const daylight=new T.PointLight(0xffd9a0,1.25,11,2);daylight.position.set(0,3.1,-23);api.add(daylight);CAVE.daylight=daylight;
    // Saul resting inside (appears when the men are in)
    const saul=api.storyPerson(0x6e567f,0xd7bd75,1.08,{beard:true}); saul.position.set(2.6, 0, -26.4); saul.rotation.y = -Math.PI / 2; saul.visible = false; api.add(saul); CAVE.saul = saul;
    const corner=new T.Mesh(new T.PlaneGeometry(.36,.32,3,3),api.texMat(0x6e567f,'cloth',{side:T.DoubleSide})); corner.position.set(2.2, 0.15, -26.1); corner.visible = false; api.add(corner); CAVE.corner = corner;
    CAVE.robeI = api.interact({
      x:2.2,z:-26.4,y:api.terrain(2.2,-26.4),r:2,label: 'Quietly cut a corner of his robe', priority: 2,
      can: () => (api.taskDone('men') ? true : 'Not yet.'),
      use(p) {
        this.remove();CAVE.cut=true;corner.visible=true;const hand=CAVE.david.userData.storyActor.hands[1];hand.add(corner);corner.position.set(0,-.13,.04);corner.rotation.set(.12,0,0);
        api.task('robe');
        api.story([
          { art: '✂️', text: 'And the men of David said unto him, Behold the day of which the LORD said unto thee, Behold, I will deliver thine enemy into thine hand, that thou mayest do to him as it shall seem good unto thee. Then David arose, and cut off the skirt of Saul’s robe privily.', ref: '1 Samuel 24:4' },
          { art: '🙏', title:'David’s conscience', text: 'And it came to pass afterward, that David’s heart smote him, because he had cut off Saul’s skirt. And he said unto his men, The LORD forbid that I should do this thing unto my master, the LORD’s anointed, to stretch forth mine hand against him, seeing he is the anointed of the LORD.', ref: '1 Samuel 24:5–6', connection:{passage:'1 Samuel 24:5–6',text:'Even cutting Saul’s robe troubled David. He would not kill him.'} }
        ], () => {
          api.toast('Saul is leaving. Go outside and call to him.',3500);
          CAVE.saul.visible=true;CAVE.depart={from:CAVE.saul.position.clone(),t:0};
          CAVE.callZone.show(true);
        });
      }
    });
    CAVE.robeI.alive = false;
    CAVE.callZone = api.zone({ x: 0, z: -20, r: 2.4, time: 2, color: 0xfde68a, hidden: true,
      onDone(helpers) { api.task('call'); helpers.forEach((p) => api.servant(p, 4)); } });

    // --- David's men, hiding among the rocks ---
    [[-14, 22], [14, 20], [-13, 7], [13, 1]].forEach(([x, z], i) => {
      CAVE.men.push(api.follower({ x, z, kind:'man',noSquash:true,mesh:api.storyPerson([0x57534e,0x4d7c0f,0x9a3412,0x1e3a8a][i],0xd6d3d1,1,{register:false,beard:i%2===0}),
        deliverTo: { x: CAVE.INSIDE[0], z: CAVE.INSIDE[1], r: 3 },
        parkAt: (f) => { const k = CAVE.men.indexOf(f); return [-3.4, 0, -31 + k * 1.3]; },
        onDeliver(p) {
          api.task('men'); api.servant(p, 4, 'for keeping David\'s men safe!');
          if (api.taskDone('men')) LEVEL._saulComes(api);             // (the task board counts the others: no pop-up)
        } }));
    });
    // David waits in the cave
    const david=api.storyPerson(0x9c6138,0xdbc692,1,{beard:false}); david.position.set(-2.4, 0, -27); api.add(david); CAVE.david = david;

    CAVE.conversation=api.conversation({person:david,label:'Whisper with David',speaker:'David',clue(){
      if(!api.taskDone('men'))return {text:'Saul wants me dead. I will not kill him. Bring the men to this shelter.',at:[0,1,-29]};
      if(!api.taskDone('robe'))return {text:'We will not kill Saul. Stay quiet beside the corner of his robe.',at:[2.2,1,-26.4]};
      return {text:'Even cutting his robe troubled me. I will leave judgment with the LORD.',at:[0,1,-20]};
    }});
    CAVE.insideView=api.camZone({minX:-4,maxX:4,minZ:-33,maxZ:-24,yaw:.15,height:7.5,back:13,focus:[0,1,-28],pull:.24});
    CAVE.endView=api.camZone({minX:-7,maxX:7,minZ:-24,maxZ:-12,yaw:.65,height:8,back:18,focus:[0,1,-17],pull:.3});

    // --- Saul's soldiers on patrol, with eyes like a yellow cone ---
    [[22, 13, 2.4], [8, 11, 2.0], [-7, 13, 2.6], [-19, 12, 2.2]].forEach(([z, amp, sp], i) => {
      const m = person(0x374151, 0x9ca3af); api.add(m);
      const spear = new T.Mesh(new T.CylinderGeometry(0.04, 0.04, 2.4, 5), api.mat(0x6b4f2a)); spear.position.set(0.45, 1.2, 0); m.add(spear);
      const cone = new T.Mesh(new T.CircleGeometry(6, 18, -0.6, 1.2), new T.MeshBasicMaterial({ color: 0xfde047, transparent: true, opacity: 0.28, side: T.DoubleSide, depthWrite: false }));
      cone.rotation.x = -Math.PI / 2; api.add(cone);
      CAVE.soldiers.push({ m, cone, z, amp, sp, t: i * 2.3, x: 0, dir: 1 });
    });

    // --- fragments ---
    // 1: the spring of En-gedi (the Fisherman nets it)
    api.hazard({ x: 13, z: -10, r: 2.4 }, { maxY: -0.6, except: (p) => p.role.id === 'fisherman', msg: 'Splash! The spring pool is deep (the Fisherman can wade).' });
    api.fragment({ x: 13, z: -10, y: 0.2, net: true });
    // 2: crumbling stones up to a high goat ledge
    [[-17, 28, 1.2], [-18.4, 25.6, 2.3], [-17, 23.2, 3.4]].forEach(([x, z, t]) => api.crumble({ x, z, top: api.terrain(x, z) + t }));
    api.box({ x: -17.6, z: 20.6, w: 2.4, d: 2.4, h: 4.4, color: 0xa8957a });
    api.fragment({ x: -17.6, z: 20.6, y: api.terrain(-17.6, 20.6) + 4.4 + 1.3 });
    // 3: a spring up to a ledge on the cliff beside the cave
    api.spring({ x: -9, z: -19.8 });
    api.box({ x: -9, z: -22.6, w: 2.4, d: 1.2, h: 0.4, y: 4.2, color: 0x857660 });
    api.fragment({ x: -9, z: -22.6, y: 4.6 + 1.3 });

    // --- Golden Scroll challenge course: east side ---
    const plan = [['block', 1.0], ['float', 1.0], ['crumble', 0.9], ['float', 0.8], ['spring', 0.2], ['float', 4.2], ['crumble', 0.6]];
    let ctop = 0;
    api.course(plan.map(([kind, rise], i) => {
      const z = 10 - i * 2.9, x = 19 + (i % 2 ? 0.3 : -0.3);
      ctop = i === 0 ? api.terrain(x, z) + 1.0 : ctop + rise;
      return { x, z, top: ctop, kind };
    }));

    api.leaves([[0, 29], [-6, 23], [6, 22], [-3, 10], [8, 1], [-10, 1], [2, -5], [-5, -11], [6, -15], [0, -30], [-18.4, 25.6, api.terrain(-18.4, 25.6) + 3.2], [14, 28]]);
    // (no camera zone at the cave: the usual view, with the cave wall fading, shows the way in best)
  },

  _saulComes(api) {
    api.story([
      { art: '⛰️', text: 'And he came to the sheepcotes by the way, where was a cave; and Saul went in to cover his feet: and David and his men remained in the sides of the cave.', ref: '1 Samuel 24:3' }
    ], () => {
      api.toast('Saul entered the cave. David will not kill him.',3500);
      CAVE.saul.visible = true; CAVE.robeI.alive = true;
      CAVE.soldiers.forEach((s) => { s.m.visible = false; s.cone.visible = false; s.off = true; });
    });
  },

  update(api, dt) {
    caveAct(api,dt);
    const ps = api.activePlayers();
    if(CAVE.entry&&!CAVE.entry.done&&ps.some(p=>p.pos.z<35)){
      CAVE.entry.done=true;api.checkpoint({x:0,z:33,label:'En-gedi rocks'});
      api.toast('Saul’s soldiers patrol ahead. Hide behind rocks and bring David’s men to the cave.',4000);
    }
    if(CAVE.entry&&CAVE.entry.goat)CAVE.entry.goat.rotation.y=.7+Math.sin(api.time*.55)*.12;
    const seen = {};
    CAVE.soldiers.forEach((s) => {
      if (s.off) return;
      s.t += dt;
      const x = Math.sin(s.t * s.sp / s.amp) * s.amp, v = Math.cos(s.t * s.sp / s.amp);
      s.x = x; s.dir = v >= 0 ? 1 : -1;
      const a = s.dir > 0 ? Math.PI / 2 : -Math.PI / 2;                 // facing along the patrol
      s.m.position.set(x, api.terrain(x, s.z), s.z); s.m.rotation.y = a;
      s.cone.position.set(x, api.terrain(x, s.z) + 0.08, s.z); s.cone.rotation.z = s.dir > 0 ? 0 : Math.PI;
      // anyone inside the cone, with no rock in between, slips back to the last safe rocks
      ps.forEach((p) => {
        const dx = p.pos.x - x, dz = p.pos.z - s.z, d = Math.hypot(dx, dz);
        if (d > 6 || d < 0.01) return;
        const ang = Math.acos(Math.max(-1, Math.min(1, (dx * s.dir) / d)));
        if (ang > 0.6 || caveBlocked(x, s.z, p.pos.x, p.pos.z)) return;
        seen[p.slot] = s;
      });
    });
    LEVEL._watch(api, ps, seen, dt);
  },

  // gentle: a soldier has to see you for most of a second (his cone turns orange: hide!) before you slip back
  _watch(api, ps, seen, dt) {
    CAVE.soldiers.forEach((s) => { s.cone.material.color.setHex(0xfde047); s.cone.material.opacity = 0.28; });
    ps.forEach((p) => {
      const s = seen[p.slot];
      if (!s) { p._seen = 0; return; }
      if (!p._seen && !CAVE.toldLook) { CAVE.toldLook = true; api.toast('👀 Careful! When a cone turns orange, he is looking your way: duck behind something!', 3000); }
      p._seen = (p._seen || 0) + dt;
      s.cone.material.color.setHex(0xf97316); s.cone.material.opacity = 0.45;
      if (p._seen > (api.settings.gentle ? 1.8 : 0.8)) { p._seen = 0; LEVEL._spotted(api, p); }   // gentler sneaking: more time to hide
    });
  },

  _spotted(api, p) {
    const back = CAVE.CHECKS.filter((c) => c[1] > p.pos.z + 1).sort((a, b) => a[1] - b[1])[0] || CAVE.CHECKS[0];
    p.pos.set(back[0], api.groundAt(back[0], back[1]), back[1]); p.vel.set(0, 0, 0); p.lastSafe.copy(p.pos);
    CAVE.men.forEach((f) => { if (f.state === 'follow' && f.leader === p) { f.pos.set(back[0] - 1, api.groundAt(back[0], back[1]), back[1] + 1.5); f.mesh.position.copy(f.pos); } });
    CAVE.spotted++;
    api.sfx('bubble');
    api.toast('👀 A soldier looked your way! You slipped back behind the rocks. Wait until he looks away.', 2600);
  },

  objective(api) {
    const ps = api.activePlayers();
    if (!ps.length) return null;
    if(CAVE.entry&&!CAVE.entry.done){const p=ps[0],next=CAVE.entry.route.find(r=>p.pos.z>r[2]+1);return next||[0,api.terrain(0,33)+1,33];}
    const c = ps[0].pos;
    if (!api.taskDone('men')) {
      if (CAVE.men.some((f) => f.state === 'follow')) return [CAVE.INSIDE[0], 1.5, CAVE.INSIDE[1]];
      const idle = CAVE.men.filter((f) => f.state === 'idle').sort((a, b) => Math.hypot(a.pos.x - c.x, a.pos.z - c.z) - Math.hypot(b.pos.x - c.x, b.pos.z - c.z))[0];
      return idle ? [idle.pos.x, idle.pos.y + 2, idle.pos.z] : null;
    }
    if (!api.taskDone('robe')) return [2.2, 1.5, -26.4];
    if (!api.taskDone('call')) return [0, 1.5, -20];
    return null;
  },

  finale: {
    message: '📣 Everyone gather where David calls to Saul.',
    beacon: [0, 3, -19],
    inZone(p) { return Math.hypot(p.pos.x, p.pos.z + 19) < 6; },
    onUpdate(api, t) {
      if(!CAVE.out){const ps=api.players();if(!ps.length||!ps.every(p=>!p.bubble&&LEVEL.finale.inZone(p)))return false;}
      if(t>.3&&!CAVE.out){CAVE.out=true;CAVE.davidWalk={from:CAVE.david.position.clone(),t:0};api.finishCaption(false,false);}
      if(t>.5&&CAVE.davidOutside&&!CAVE.done) {
        CAVE.done = true;
        api.story([
          { art: '😢', text: 'And he said to David, Thou art more righteous than I: for thou hast rewarded me good, whereas I have rewarded thee evil.', ref: '1 Samuel 24:17' },
          { art: '💛', title: 'Mercy', text: 'But I say unto you which hear, Love your enemies, do good to them which hate you,', ref: 'Luke 6:27' }
        ], () => { CAVE.endT = api.time; });
      }
      return CAVE.endT !== undefined && api.time - CAVE.endT > 2;
    }
  }
};
