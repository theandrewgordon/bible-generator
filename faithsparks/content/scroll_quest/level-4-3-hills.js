/* =====================================================================
 * LEVEL 4-3: THE SHEPHERD'S HILLS  (1 Samuel 16-17)
 * ---------------------------------------------------------------------
 * God chose the youngest son, the shepherd boy David. North to south:
 *   Jesse's house and the sheepfold (z 34..22)
 *   A stream (z 18) with stepping stones; the pasture beyond (z 16..4): gather the sheep
 *   The road down to the valley of Elah (z 2..-30): Israel's camp, the brook, and far across the
 *   valley the giant Goliath (scenery only).
 * Tasks: sheep into the fold; carry the food Jesse sends to the brothers; choose five smooth stones.
 * A lion (pasture) and a bear (road down) charge at anyone nearby: dodge at the red sign or climb a rock (1 Samuel 17:34).
 * David and Goliath is told on story cards, never played: "the battle is the LORD's".
 * Only edit THIS file to change the level. See GEMINI.md and CAMPAIGN.md.
 * ===================================================================== */

const HILLS = {
  FOLD: [-10, 27],
  HOUSE: [6, 30],
  CAMP: [0, -22],
  STREAM: 18,
  sheep: [],
  food: [],
  stones: [],
  actors: [],
  tents: []
};

// These rigs and props belong to this episode. They never add collision, tasks or controls.
function hillsPerson(api,robe,scarf,scale=1,look={}) {
  const g=api.storyPerson(robe,scarf,scale,look),actor=g.userData.storyActor;
  actor.phase=HILLS.actors.length*1.17;g.userData.hillsActor=actor;HILLS.actors.push(actor);return g;
}
function hillsTalk(api,options) { return api.conversation(options); }
function hillsTent(api,x,z,color,distant) { const g=api.clothTent({x,z,color,distant});HILLS.tents.push(g);return g; }

function hillsDress(api) {
  const T=api.THREE,g=new T.Group();g.name='camp-and-fold-details';
  const add=(geo,mat,x,y,z)=>{const m=new T.Mesh(geo,mat);m.position.set(x,api.terrain(x,z)+y,z);m.castShadow=true;g.add(m);return m;};
  // Supplies stay against the camp edge, clear of the food destination and fragment routes.
  [9.8,10.6].forEach((x,i)=>{const jar=add(new T.SphereGeometry(.35,12,8),api.texMat(i?0x98744f:0xb08660,'clay'),x,.38,-25.5);jar.scale.y=1.15;add(new T.TorusGeometry(.16,.045,6,12),api.texMat(0x806043,'clay'),x,.72,-25.5).rotation.x=Math.PI/2;});
  [-10.1,-9.1].forEach(x=>{const shield=add(new T.CylinderGeometry(.47,.47,.09,16),api.texMat(0x807156,'wood'),x,.56,-26);shield.rotation.set(Math.PI/2-.18,0,.12);const boss=add(new T.SphereGeometry(.13,10,8),api.texMat(0x9b855e,'bronze'),x,.56,-25.9);boss.scale.z=.4;});
  // Two practical lamps: warm landmarks, never collectible or a puzzle requirement.
  [[-12.2,29.5],[7.3,-25.3]].forEach(([x,z])=>{
    add(new T.CylinderGeometry(.035,.05,.8,8),api.texMat(0x765b3c,'wood'),x,.4,z);
    const bowl=add(new T.SphereGeometry(.17,10,8),api.texMat(0x94744d,'clay'),x,.84,z);bowl.scale.y=.45;
    const light=new T.PointLight(0xffd89b,.65,7,2);light.position.set(x,api.terrain(x,z)+1.15,z);api.add(light);
    const wick=add(new T.SphereGeometry(.06,8,6),new T.MeshBasicMaterial({color:0xffdf9e}),x,.94,z);wick.scale.y=1.5;
  });
  api.scenery(g);
}

// Flat landing caps and all collision stay in the original volumes.
function hillsLanding(api,o) {
  const h=api.rockBox(o),T=api.THREE;
  const cap=new T.Mesh(new T.PlaneGeometry(o.w-.08,o.d-.08),api.texMat(0xc5c3ad,'paving'));
  cap.rotation.x=-Math.PI/2;cap.position.y=o.h/2+.006;cap.receiveShadow=true;cap.name='hills-landing-cap';h.mesh.add(cap);
  return h;
}
function hillsWatchtower(api,o) {
  const h=api.rockBox(o),T=api.THREE,g=new T.Group();g.name='watchtower-stone-courses';
  const stone=api.texMat(0xc4b494,'stone');
  const piece=(w,d,hh,x,y,z,mat)=>{const m=new T.Mesh(new T.BoxGeometry(w,hh,d),mat);m.position.set(x,y,z);g.add(m);};
  // The eroded face supplies the courses; a shallow rim stays inside the original landing.
  [-1,1].forEach(sd=>{piece(o.w-.04,.05,.13,0,o.h/2-.09,sd*(o.d/2-.035),stone);piece(.05,o.d-.04,.13,sd*(o.w/2-.035),o.h/2-.09,0,stone);});
  api.scenery(g);h.mesh.add(g);h.mesh.name='hills-watchtower';HILLS.watchtower=h;return h;
}
function hillsChampion(api) {
  const T=api.THREE,g=api.storyPerson(0x514b44,0x4c4338,2.4,{beard:0x352d28,skin:0xb9845f}),a=g.userData.storyActor;
  g.name='goliath-champion';g.position.set(1,api.terrain(1,-31),-31);
  // The bronze helmet, coat of scales, greaves and iron spearhead follow 1 Samuel 17:5–7.
  // A distant witness model, never an enemy controller or attack target.
  const bronze=api.texMat(0x9b7944,'bronze'),iron=api.texMat(0x625e57,'bronze'),wood=api.texMat(0x685038,'wood');
  const gear=new T.Group();gear.name='champion-coat';
  const mesh=(parent,geo,mat,x,y,z)=>{const m=new T.Mesh(geo,mat);m.position.set(x,y,z);m.castShadow=true;m.receiveShadow=true;parent.add(m);return m;};
  // Shorter tunic exposes the separate greaves, rather than hiding armor under a floor-length robe.
  a.body.children[0].geometry=new T.CylinderGeometry(.26,.42,.7,20,3);a.body.children[0].position.y=.65;
  a.body.children[2].position.y=.30;
  mesh(gear,new T.CylinderGeometry(.285,.43,.66,18),bronze,0,.66,0);
  for(let row=0;row<5;row++)for(let col=0;col<12;col++){
    const y=.39+row*.12,r=.423-row*.026,angle=(col+(row%2)*.5)/12*Math.PI*2;
    const scale=mesh(gear,new T.SphereGeometry(.05,6,4),bronze,Math.sin(angle)*r,y,Math.cos(angle)*r);
    scale.scale.set(1,1.25,.28);scale.rotation.y=angle;
  }
  api.scenery(gear);a.body.add(gear);
  // Helmet clears the pupils; cheek guards sit beside, never in front of, the face.
  const helm=mesh(a.head,new T.SphereGeometry(.37,16,10,0,Math.PI*2,0,Math.PI*.43),bronze,0,.29,0);helm.name='champion-helmet';
  [-1,1].forEach(sd=>{mesh(a.head,new T.BoxGeometry(.065,.19,.16),bronze,sd*.32,.17,0);const greave=mesh(a.rig,new T.CylinderGeometry(.1,.125,.27,10),bronze,sd*.14,.18,.085);greave.name='champion-greave';});
  const spear=new T.Group();spear.name='champion-spear';
  mesh(spear,new T.CylinderGeometry(.033,.04,2.15,8),wood,0,.66,0);
  mesh(spear,new T.ConeGeometry(.085,.29,8),iron,0,1.88,0);
  api.scenery(spear);a.hands[1].add(spear);spear.position.set(.015,0,.035);
  a.arms[1].rotation.set(-.05,0,-.1);a.arms[0].rotation.z=-.22;
  a.smile.visible=false;a.mouthOpen.visible=false;a.brows.forEach((b,i)=>b.rotation.z=Math.PI/2+(i?-.17:.17));
  g.userData.champion={actor:a,spear,helm};api.add(g);return g;
}
function hillsDavidGear(api,g) {
  const T=api.THREE,a=g.userData.storyActor,gear=new T.Group();gear.name='david-scrip-and-sling';
  const leather=api.texMat(0x795333,'cloth'),cord=api.mat(0x9d8661);
  const bag=new T.Mesh(new T.SphereGeometry(.16,12,8),leather);bag.position.set(-.30,.49,.18);bag.scale.set(1,1.3,.55);gear.add(bag);
  // A looped sling hangs at the belt; no weapon input or new task is added.
  const sling=new T.Mesh(new T.TorusGeometry(.11,.012,5,14),cord);sling.scale.y=1.7;sling.position.set(.29,.45,.22);gear.add(sling);
  api.scenery(gear);a.body.add(gear);
}

function hillsAnimate(api,dt) {
  const t=api.time,ps=api.activePlayers(),blend=Math.min(1,dt*6);
  for(const a of HILLS.actors){
    const g=a.g;if(!g.visible)continue;
    if(!a.home)a.home=g.position.clone();
    let near=null,dist=5;
    for(const p of ps){const d=Math.hypot(p.pos.x-g.position.x,p.pos.z-g.position.z);if(d<dist){dist=d;near=p;}}
    const talk=a.talkUntil>t&&a.listener&&!a.listener.bubble;
    const walking=a.walk&&!near&&!talk&&!api.taskDone('sheep');
    const arrived=g===HILLS.david&&HILLS.endT!==undefined;
    let stride=0;
    if(walking){a.walkClock=(a.walkClock||0)+dt;const u=Math.sin(a.walkClock*.65);g.position.z=a.home.z+u*.75;stride=Math.cos(a.walkClock*.65)*.48;}
    if(arrived){const u=Math.min(1,(t-HILLS.endT)/2.4);g.position.x=a.home.x+u*2;g.position.z=a.home.z-u*1.5;stride=u<1?1.04:0;}
    g.position.y=api.terrain(g.position.x,g.position.z)+Math.abs(Math.sin(t*7))*Math.abs(stride)*.035;
    const target=talk?a.listener:near;
    let yaw=target?Math.atan2(target.pos.x-g.position.x,target.pos.z-g.position.z):walking?(stride>0?0:Math.PI):arrived?Math.atan2(2,-1.5):a.brother&&HILLS.challenge&&!arrived?Math.PI:0;
    let d=yaw-g.rotation.y;while(d>Math.PI)d-=Math.PI*2;while(d< -Math.PI)d+=Math.PI*2;g.rotation.y+=d*blend;
    api.posePerson(g,{dt,stride,talking:talk,cheer:HILLS.endT!==undefined&&a.brother,expression:a.brother&&HILLS.challenge&&HILLS.endT===undefined?'worry':'calm'});
  }
}

const LEVEL = {
  id: '4-3',
  bibleConnection: {"passage": "1 Samuel 16–17", "text": "God chose David, a shepherd, and David killed Goliath while trusting the LORD. Our sheep, food delivery and brook stones explore events around that victory. The killing is told plainly in the story, not made into a player attack task."},
  world: 'World 4-3',
  title: 'The Shepherd\'s Hills',
  sky: 0xbacbd1,
  ambient: .86,
  artDirection: {textureStrength:.35,storyPlants:14,ambientCount:12,checkpointSigns:false},
  decor: {grass:54,flowers:8,pebbles:18,plants:false},
  leafIcon: '🐑',
  leafColor: 0xf5f5f4,
  leafShape: 'round',
  spawn: [0, 31],
  bounds: { minX: -21, maxX: 21, minZ: -34, maxZ: 36 },
  approach: ['stones', 'crumbles'],   // the way in (engine): a stretch before the level's own start
  startMessage: 'Bring the sheep safely into the fold. Jesse and David can help you find the way.',

  intro: [
    { text: 'But the LORD said unto Samuel, Look not on his countenance, or on the height of his stature; because I have refused him: for the Lord seeth not as man seeth; for man looketh on the outward appearance, but the LORD looketh on the heart.', ref: '1 Samuel 16:7' },
    { text: 'The LORD is my shepherd; I shall not want.', ref: 'Psalm 23:1' }
  ],

  introStory: [
    { art: '🫒', title: 'A shepherd chosen', text: 'God chose David, Jesse’s youngest son, and sent Samuel to anoint him as the next king. David cared for the sheep.\n\nJust for our game: explore his hills and help with the flock and food.' },
    { art: '💛', text: 'But the LORD said unto Samuel, Look not on his countenance, or on the height of his stature; because I have refused him: for the Lord seeth not as man seeth; for man looketh on the outward appearance, but the LORD looketh on the heart.', ref: '1 Samuel 16:7' }
  ],

  tasks: [
    { id: 'sheep', icon: '🐑', label: 'Bring the sheep into the fold', total: 6 },
    { id: 'food', icon: '🧺', label: 'Take food to the brothers at the camp', total: 1, lockedUntil: 'sheep' },
    { id: 'stones', icon: '🪨', label: 'Choose five smooth stones from the brook', total: 5, lockedUntil: 'food' }
  ],

  memoryVerse: { text: 'The LORD is my shepherd; I shall not want.', ref: 'Psalm 23:1' },

  ending: {
    verse: { text: 'And all this assembly shall know that the LORD saveth not with sword and spear: for the battle is the LORD’s, and he will give you into our hands.', ref: '1 Samuel 17:47' },
    message: 'David killed Goliath. The LORD gave Israel the victory. God looks at the heart, and we can trust Him.'
  },

  quiz: [
    { q: 'What does the LORD look at?', ref: '1 Samuel 16:7', options: ['How tall you are', 'The heart', 'Your clothes'], answer: 1 },
    { q: 'What does the Bible say David did to Goliath?', ref: '1 Samuel 17:50', options: ['Only frightened him', 'Killed him with a sling and a stone', 'Made friends with him'], answer: 1 },
    { q: 'Whose battle did David say it was?', ref: '1 Samuel 17:47', options: ['The king\'s', 'His own', 'The LORD\'s'], answer: 2 }
  ],

  music: {
    bpm: 104,
    notes: [67, 0, 71, 0, 74, 72, 71, 0, 69, 0, 67, 69, 71, 0, 0, 0,
            72, 0, 74, 76, 74, 0, 72, 71, 69, 0, 67, 0, 66, 67, 0, 0],
    bass: [43, 43, 48, 48, 50, 50, 43, 43]
  },

  onCallText(kind, n) {                                                 // said once; after that the bleat says it
    if (HILLS.saidCall) return '';
    HILLS.saidCall = true;
    return n > 1 ? n + ' sheep follow the shepherd.' : 'A sheep follows you.';
  },

  /* ---------- ground shape ---------- */
  terrain(x, z) {
    let h = Math.sin(x * 0.25) * Math.cos(z * 0.2) * 0.5 + 0.5;
    if (Math.abs(z - HILLS.STREAM) < 2.2) h -= 2.4 * Math.min(1, (2.2 - Math.abs(z - HILLS.STREAM)) / 0.9);   // the stream
    if (z < 0) h -= Math.min(2.2, -z * 0.12);                             // down into the valley
    if (Math.abs(z + 14) < 1.6) h -= 0.25;                                // the brook bed (shallow)
    h += Math.max(0, Math.abs(x) - 17) * 1.2;
    return h;
  },

  groundColor(x, z, h) {
    if (Math.abs(z - HILLS.STREAM) < 1.6) return 0x3b82c4;
    if (Math.abs(z + 14) < 1.3) return 0x9fb7c9;
    if (z < -26) return 0xb59d73;
    // A quiet worn path links the left crossing, pasture and camp; the brook remains distinct.
    const trail=z>14?-2:Math.sin(z*.12);
    if(z<23&&z>-26&&Math.abs(x-trail)<1.6)return 0xbcae8d;
    return Math.sin(x*.13+Math.cos(z*.11))>.2?0x96a573:0x849762;
  },

  /* ---------- build ---------- */
  build(api) {
    const T = api.THREE;
    const person = (robe, scarf, s, o) => hillsPerson(api, robe, scarf, s, o);

    // --- Jesse's house and the sheepfold (a stone ring with a gap) ---
    const [hx, hz] = HILLS.HOUSE;
    api.box({ x: hx + 2, z: hz + 2.5, w: 6, d: 4, h: 3, color: 0xcdb98f, house: true });
    const jesse = person(0x57534e, 0xe7e5e4, 1, { age: 'elder', beard: true, cane: true }); jesse.position.set(2.5, api.terrain(2.5,31), 31); api.add(jesse); HILLS.jesse=jesse;
    const [fx, fz] = HILLS.FOLD;
    [[0, 3, 7, 0.6], [-3.3, 0, 0.6, 6.6], [3.3, 1.6, 0.6, 3.4], [-2, -3, 3, 0.6], [2.4, -3, 2.4, 0.6]].forEach(([dx, dz, w, d]) => api.rockBox({ x: fx + dx, z: fz + dz, w, d, h: 1.1, color: 0xa8957a }));
    const shepherdDavid=person(0xa66d45,0xc9b78b,.95,{hair:0x4d3022,staff:true});
    shepherdDavid.position.set(-5.2,api.terrain(-5.2,25),25);api.add(shepherdDavid);HILLS.shepherdDavid=shepherdDavid;
    shepherdDavid.userData.hillsActor.walk=true;
    HILLS.pastureConversation=hillsTalk(api,{person:shepherdDavid,speaker:'David',label:'Ask David about the sheep',clue(){
      const f=HILLS.sheep.find(f=>f.state==='idle');return {text:'I care for my father’s sheep. Call them, then lead them through the gap in the fold.',at:f?[f.pos.x,f.pos.y+1,f.pos.z]:[fx,1,fz]};
    }});

    // --- the stream with stepping stones ---
    const water = new T.Mesh(new T.PlaneGeometry(42, 3.4), new T.MeshLambertMaterial({ color: 0x60a5fa, transparent: true, opacity: 0.85 }));
    water.rotation.x = -Math.PI / 2; water.position.set(0, -0.6, HILLS.STREAM); api.add(water);
    api.hazard({ x: 0, z: HILLS.STREAM, w: 44, d: 3.2 }, { maxY: -0.6, except: (p) => p.role.id === 'fisherman', msg: 'Splash! Use the stepping stones (the Fisherman can wade).' });
    [[-2, 19.6], [0.2, 18], [-1.4, 16.4], [8, 19.4], [9.8, 17.8], [8.4, 16.4]].forEach(([x, z]) => hillsLanding(api,{ x, z, w: 1.3, d: 1.3, h: 0.5, y: -0.1, color: 0x9ca3af }));

    // --- the sheep, scattered in the pasture ---
    [[-12, 12], [-5, 9], [3, 13], [10, 10], [14, 5], [-15, 5]].forEach(([x, z]) => {
      HILLS.sheep.push(api.follower({ x, z, kind: 'sheep',
        deliverTo: { x: fx, z: fz, r: 2.6 },
        parkAt: (f) => { const k = HILLS.sheep.indexOf(f); return [fx - 1.8 + (k % 3) * 1.8, api.terrain(fx, fz), fz - 1 + Math.floor(k / 3) * 1.8]; },
        onDeliver(p) {
          api.task('sheep'); api.servant(p, 3);
          if (api.taskDone('sheep')) {                                  // (the task board counts the others: no pop-up)
            api.toast('🧺 Jesse sends David with food for his brothers in King Saul\'s army (1 Samuel 17:17). Carry it down to the camp!', 4500);
          }
        } }));
    });

    // --- a lion and a bear (1 Samuel 17:34): dodge them, never fight them. Jump aside at the red sign, or climb up high ---
    HILLS.lion = api.critter({ kind: 'lion', x: 13, z: 8, r: 7, sight: 6.5, speed: 8.5, msg: '🦁 A lion came for the flock (1 Samuel 17:34)! Watch for the red sign and jump aside, or climb up high.' });
    HILLS.bear = api.critter({ kind: 'bear', x: -7, z: -5, r: 7, sight: 6.5, speed: 8, msg: '🐻 A bear! Watch for the red sign and jump aside: rocks and ledges are safe.' });
    [[16.5, 12.5], [9, 3.5], [-11, -1.5], [-3, -9]].forEach(([x, z]) => api.rockBox({ x, z, w: 2.2, d: 2.2, h: 1.6, color: 0x9c8b6e, house: false }));   // safe rocks to climb

    // --- food from Jesse's house ---
    // one basket (parched corn, ten loaves, ten cheeses: 1 Samuel 17:17–18), one trip down the hills
    [['the corn, loaves and cheeses', 0xc68a3c, hx, hz - 2]].forEach(([name, col, x, z]) => {
      const g = new T.Group();
      const basket = new T.Mesh(new T.CylinderGeometry(0.42, 0.32, 0.4, 12), api.mat(0x8b5e34)); g.add(basket);
      const top = new T.Mesh(new T.SphereGeometry(0.34, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), api.mat(col)); top.position.y = 0.18; g.add(top);
      const it = api.carryable({ x, z, mesh: g, name, to: 'the brothers at the camp',
        deliverTo: { x: HILLS.CAMP[0], z: HILLS.CAMP[1], r: 3 },
        onDeliver(p) {
          api.task('food'); api.servant(p, 4, 'for serving your brothers!');
          if (api.taskDone('food')) LEVEL._giant(api);                // (the task board counts the others)
        } });
      it.blocked = () => (api.taskDone('sheep') ? true : 'Food for David\'s brothers. Get the sheep safe first.');
      HILLS.food.push(it);
    });

    // --- the camp of Israel; across the valley, the Philistines and the giant ---
    const [cx, cz] = HILLS.CAMP;
    [[-6, -20], [-2, -24], [5, -21], [9, -24], [-10, -24]].forEach(([x, z],i)=>hillsTent(api,x,z,i%2?0x9b8768:0xb9a583,false));
    HILLS.brothers=[];
    [[-2, -19.4, 0x934e37], [1.6, -19.6, 0x4d6479], [3.4, -18.6, 0x657249]].forEach(([x, z, r]) => { const b = person(r, 0xd6c9ad, 1, { beard: true }); b.position.set(x, api.terrain(x, z), z); b.userData.hillsActor.brother=true; api.add(b);HILLS.brothers.push(b); });
    [[-8, -33], [6, -33], [14, -33]].forEach(([x,z])=>hillsTent(api,x,z,0x81544a,true));
    const giant=hillsChampion(api);HILLS.giant=giant;
    api.rockBox({ x: 0, z: -28.5, w: 42, d: 0.8, h: 1.2, color: 0x9c8b6e });  // the edge of the valley floor (stay on Israel's side)
    // five smooth stones in the brook (shown after the giant's challenge)
    [[-8, -14], [-4, -13.6], [0, -14.3], [4, -13.8], [8, -14.2]].forEach(([x, z]) => {
      const m = new T.Mesh(new T.SphereGeometry(0.22, 10, 8), api.mat(0xd6d3d1)); m.scale.y = 0.6; m.position.set(x, api.terrain(x, z) + 0.12, z); m.visible = false; api.add(m);
      const st = { m, x, z, got: false };
      st.inter = api.interact({ x, z, r: 1.8, label: 'Choose a smooth stone',
        can: () => (api.taskDone('food') ? true : 'A smooth stone in the brook.'),
        use(p) { this.remove(); m.visible = false; st.got = true; api.task('stones'); api.servant(p, 2); api.sfx('coin');
        } });
      st.inter.alive = false;
      HILLS.stones.push(st);
    });

    // --- fragments ---
    // 1: in the stream (the Fisherman nets it)
    api.fragment({ x: -14, z: HILLS.STREAM, y: 0.1, net: true });
    // 2: crumbling stones up a rocky hill
    [[15, 30, 1.2], [16.4, 27.6, 2.3], [15, 25.2, 3.4]].forEach(([x, z, t]) => api.crumble({ x, z, top: api.terrain(x, z) + t }));
    api.rockBox({ x: 15.6, z: 22.6, w: 2.4, d: 2.4, h: 4.4, color: 0x9c8b6e });
    api.fragment({ x: 15.6, z: 22.6, y: api.terrain(15.6, 22.6) + 4.4 + 1.3 });
    // 3: a spring up onto a watchtower over the camp
    const ty = api.terrain(-14, -18);
    hillsWatchtower(api,{ x: -14, z: -18, w: 2.4, d: 2.4, h: 4.2, y: ty, color: 0xb59a6d });
    api.spring({ x: -14, z: -14.8 });
    api.fragment({ x: -14, z: -18, y: ty + 4.2 + 1.3 });

    // --- Golden Scroll challenge course: on the west hills ---
    const plan = [['block', 1.0], ['float', 1.0], ['crumble', 0.9], ['float', 0.8], ['spring', 0.2], ['float', 4.2], ['crumble', 0.6]];
    let ctop = 0;
    api.course(plan.map(([kind, rise], i) => {
      const z = 12 - i * 2.9, x = -19 + (i % 2 ? 0.3 : -0.3);
      ctop = i === 0 ? api.terrain(x, z) + 1.0 : ctop + rise;
      return { x, z, top: ctop, kind };
    }));

    api.leaves([[0, 26], [-6, 22], [4, 22], [-8, 10], [6, 8], [0, 4], [-4, -2], [4, -6], [0, -10], [-6, -16], [6, -17], [12, 14], [16.4, 27.6, api.terrain(16.4, 27.6) + 3.2]]);
    // Give the high west-hill route room before the stream's closer, sideways view.
    api.camZone({ minX: -21, maxX: -17.5, minZ: -8, maxZ: 15, yaw: -0.12, height: 16, back: 22, focus: [-19, 7, 2], pull: 0.3 });
    // camera: from the side at the stepping stones, and over the brook where the stones are
    api.camZone({ minX: -19, maxX: 19, minZ: HILLS.STREAM - 4, maxZ: HILLS.STREAM + 4, yaw: 0.5, height: 11, back: 12, focus: [0, 0, HILLS.STREAM], pull: 0.35 });
    HILLS.conversation=hillsTalk(api,{person:jesse,speaker:'Jesse',label:'Ask Jesse about David',clue(){
      if(!api.taskDone('sheep')){const sheep=HILLS.sheep.find(f=>f.state==='idle');return {text:'God chose David, our shepherd. Bring the scattered sheep back to the fold.',at:sheep?[sheep.pos.x,sheep.pos.y+1,sheep.pos.z]:[HILLS.FOLD[0],1,HILLS.FOLD[1]]};}
      if(!api.taskDone('food')){const held=api.players().some(p=>HILLS.food.includes(p.holding)),food=HILLS.food.find(f=>!f.delivered&&!f.holder);return {text:'Take this food to David’s brothers at the camp.',at:held?[HILLS.CAMP[0],1,HILLS.CAMP[1]]:food?[food.x,food.y+1,food.z]:[HILLS.CAMP[0],1,HILLS.CAMP[1]]};}
      return {text:'David trusted the LORD. Look for five smooth stones in the brook.',at:[0,1,-14]};
    }});
    const david=person(0xa66d45,0xc9b78b,.95,{hair:0x4d3022});david.position.set(-4,api.terrain(-4,-18),-18);david.visible=false;api.add(david);HILLS.david=david;hillsDavidGear(api,david);
    HILLS.davidConversation=hillsTalk(api,{person:david,speaker:'David',label:'Speak with David',clue(){
      if(HILLS.endT!==undefined)return {text:'The LORD gave Israel the victory. We can trust Him.',at:[HILLS.CAMP[0],1,HILLS.CAMP[1]]};
      if(!api.taskDone('food')){const food=HILLS.food.find(f=>!f.delivered&&!f.holder);return {text:'My father sent food for my brothers. Look for the basket by our house.',at:food?[food.x,food.y+1,food.z]:[HILLS.CAMP[0],1,HILLS.CAMP[1]]};}
      const stone=HILLS.stones.find(s=>!s.got);
      if(stone)return {text:'The LORD delivered me from the lion and bear. The battle is His.',at:[stone.x,1,stone.z]};
      return {text:'The battle is the LORD’s. Gather with us at the camp.',at:[HILLS.CAMP[0],1,HILLS.CAMP[1]]};
    }});
    HILLS.campView=api.camZone({minX:-13,maxX:13,minZ:-28,maxZ:-16,yaw:.15,height:10,back:17,focus:[0,1,-25],pull:.18});
    hillsDress(api);

  },

  _giant(api) {
    HILLS.challenge=true;
    api.story([
      { art: '🛡️', scene:'champion', text: 'And there went out a champion out of the camp of the Philistines, named Goliath, of Gath, whose height was six cubits and a span.', ref: '1 Samuel 17:4' },
      { art: '🦁', scene:'trust', text: 'David said moreover, The LORD that delivered me out of the paw of the lion, and out of the paw of the bear, he will deliver me out of the hand of this Philistine. And Saul said unto David, Go, and the LORD be with thee.', ref: '1 Samuel 17:37' }
    ], () => { HILLS.stones.forEach((s) => { s.m.visible = true; s.inter.alive = true; }); api.toast('🪨 Go down to the brook and choose five smooth stones.', 3500); });
  },

  update(api,dt) {
    // Keep the distant challenge grounded rather than using a friendly passerby’s greeting hop.
    HILLS.giant.position.y=api.terrain(1,-31);
    HILLS.giant.rotation.y = Math.sin(api.time * 0.4) * 0.12;
    const champion=HILLS.giant.userData.champion.actor;
    champion.body.position.y=Math.sin(api.time*1.4)*.008;
    champion.head.rotation.y=Math.sin(api.time*.35)*.035;
    HILLS.david.visible=api.taskDone('food')||!!HILLS.done;
    HILLS.shepherdDavid.visible=!api.taskDone('sheep');
    hillsAnimate(api,dt);
  },

  // Story views use the existing reading layout; no player moves or extra page/task is added.
  storyScene(api,page) {
    if(!HILLS.campView)return;
    const scene=page&&page.scene;
    HILLS.readingScene=scene||null;
    if(scene==='victory')HILLS.giant.visible=false;
    Object.assign(HILLS.campView,scene==='champion'
      ?{yaw:0,height:7,back:16,focus:[7,2,-30],pull:.82}
      :scene==='trust'||scene==='victory'
        ?{yaw:.08,height:8,back:16,focus:[3,1,-22],pull:.65}
        :{yaw:.15,height:10,back:17,focus:[0,1,-25],pull:.18});
  },

  objective(api) {
    const ps = api.activePlayers();
    if (!ps.length) return null;
    const held = ps.map((p) => p.holding).find((h) => h && h.deliverTo);
    if (held) return [held.deliverTo.x, 2, held.deliverTo.z];
    const c = ps[0].pos;
    const near = (list) => list.sort((a, b) => Math.hypot(a[0] - c.x, a[2] - c.z) - Math.hypot(b[0] - c.x, b[2] - c.z))[0];
    if (!api.taskDone('sheep')) {
      if (HILLS.sheep.some((f) => f.state === 'follow')) return [HILLS.FOLD[0], 2, HILLS.FOLD[1]];
      return near(HILLS.sheep.filter((f) => f.state === 'idle').map((f) => [f.pos.x, f.pos.y + 1.5, f.pos.z])) || null;
    }
    if (!api.taskDone('food')) return near(HILLS.food.filter((it) => !it.delivered && !it.holder).map((it) => [it.x, it.y + 1, it.z])) || null;
    return near(HILLS.stones.filter((s) => !s.got).map((s) => [s.x, 1.5, s.z])) || null;
  },

  finale: {
    message: '🏕️ Everyone gather at the camp with David.',
    beacon: [HILLS.CAMP[0], 3, HILLS.CAMP[1]],
    inZone(p) { return Math.hypot(p.pos.x - HILLS.CAMP[0], p.pos.z - HILLS.CAMP[1]) < 6; },
    onUpdate(api, t) {
      if (t > 0.5 && !HILLS.done) {
        HILLS.done = true;
        api.story([
          { art: '🪨', text: 'And he took his staff in his hand, and chose him five smooth stones out of the brook, and put them in a shepherd’s bag which he had, even in a scrip; and his sling was in his hand: and he drew near to the Philistine.', ref: '1 Samuel 17:40' },
          { art: '⚔️', text: 'And all this assembly shall know that the LORD saveth not with sword and spear: for the battle is the LORD’s, and he will give you into our hands.', ref: '1 Samuel 17:47' },
          { art: '🏆', scene:'victory', title: 'God gave the victory', text: 'David struck Goliath with a stone from his sling and killed him. Then he cut off Goliath\'s head with the giant\'s own sword (1 Samuel 17:49–51). David trusted the LORD, who gave Israel the victory.' },
          { art: '💬', title: 'Just for our game', text: 'David: “The LORD gave Israel the victory. We can trust Him.”' }
        ], () => { HILLS.endT = api.time; HILLS.giant.visible=false; HILLS.david.visible=true; });
      }
      return HILLS.endT !== undefined && api.time - HILLS.endT > 4;
    }
  }
};
