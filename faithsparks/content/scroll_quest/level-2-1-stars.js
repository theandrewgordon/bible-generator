/* =====================================================================
 * LEVEL 2-1: BENEATH A THOUSAND STARS  (Genesis 12, 15)
 * ---------------------------------------------------------------------
 * A night journey, north (z 44) to south (z -46):
 *   Haran camp  (z 40..22)  pack the bundles onto the camel
 *   The stream  (z 3..-3)   lead the flock across the shallow ford (stepping stones for people)
 *   New camp    (z -22..-44) bring the flock to the pen, set up the tents, gather at the altar
 * Tasks: pack 4 bundles; bring 6 animals across; set up 3 tents.
 * Finale: stillness under a huge field of stars; God's promise (Genesis 15:5-6).
 * Only edit THIS file to change the level. See GEMINI.md and CAMPAIGN.md.
 * ===================================================================== */

const STARS = {
  bundles: [],
  tents: [],
  flock: [],
  tentZones: [],
  oldTents: [],
  FORD: 7,
  PEN: [0, -33],
  ALTAR: [0, -27],
  packed: false,
  crossed: false,
  actors: []
};

function starsStream(z) { return Math.abs(z) < 3.2; }

const LEVEL = {
  id: '2-1',
  bibleConnection: {"passage": "Genesis 12:1–9; 15:1–6", "text": "God called Abram to leave his country, then promised descendants as countless as the stars. Abram believed God. Packing, guiding the flock and setting up camp imagine life on that journey; they do not earn the promise."},
  world: 'World 2-1',
  title: 'Beneath a Thousand Stars',
  time: 'night',
  artDirection: {textureStrength:.28,storyPlants:20,ambientCount:22,checkpointSigns:false,softStars:true,horizon:{bounded:true,color:0x24354d,heightScale:.65}},
  decor: {grass:70,flowers:12,pebbles:12,plants:false},
  leafIcon: '⭐',
  leafColor: 0xfde68a,
  leafShape: 'round',
  spawn: [0, 65],
  bounds: { minX: -19, maxX: 19, minZ: -46, maxZ: 70 },
  startMessage: 'Cross the camp boardwalk. Use the marked ring to roll up the screen, then pack the camel.',

  intro: [
    { text: 'Now the LORD had said unto Abram, Get thee out of thy country, and from thy kindred, and from thy father\'s house, unto a land that I will shew thee:', ref: 'Genesis 12:1' },
    { text: 'And he believed in the LORD; and he counted it to him for righteousness.', ref: 'Genesis 15:6' }
  ],

  introStory: [
    { art: '🏕️', text: 'Now the LORD had said unto Abram, Get thee out of thy country, and from thy kindred, and from thy father\'s house, unto a land that I will shew thee:', ref: 'Genesis 12:1' },
    { art: '🐪', title: 'Time to go', text: 'Abram trusted God and went where He called. Just for our game: help pack, guide the flock and settle camp. God’s promise is His gift.' }
  ],

  tasks: [
    { id: 'pack', icon: '🎒', label: 'Pack the bundles', total: 4 },
    { id: 'flock', icon: '🐑', label: 'Bring the flock across', total: 6, lockedUntil: 'pack' },
    { id: 'camp', icon: '⛺', label: 'Set up the new camp', total: 3, lockedUntil: 'flock' }
  ],

  memoryVerse: { text: 'And he believed in the LORD; and he counted it to him for righteousness.', ref: 'Genesis 15:6' },

  ending: {
    verse: { text: 'And he brought him forth abroad, and said, Look now toward heaven, and tell the stars, if thou be able to number them: and he said unto him, So shall thy seed be.', ref: 'Genesis 15:5' },
    message: 'God keeps His promises. Abram believed Him, and so can we!'
  },

  quiz: [
    { q: 'What did God tell Abram to do?', ref: 'Genesis 12:1', options: ['Build a tower', 'Leave his country for a new land', 'Stay in Haran'], answer: 1 },
    { q: 'What did God tell Abram to count?', ref: 'Genesis 15:5', options: ['The stars', 'His sheep', 'The grains of sand in his tent'], answer: 0 },
    { q: 'What did Abram do when God made the promise?', ref: 'Genesis 15:6', options: ['He laughed', 'He ran away', 'He believed the LORD'], answer: 2 }
  ],

  music: {
    bpm: 84,
    notes: [64, 0, 67, 0, 71, 0, 69, 67, 64, 0, 62, 0, 64, 0, 0, 0,
            67, 0, 71, 0, 74, 0, 72, 71, 69, 0, 67, 0, 64, 0, 0, 0],
    bass: [40, 40, 45, 45, 43, 43, 40, 40]
  },

  onCallText(kind, n) {                                                 // said once; after that the hop and the bleat say it
    if (STARS.saidCall) return '';
    STARS.saidCall = true;
    return 'The flock follows you. Cross at the shallow ford!';
  },

  /* ---------- ground shape ---------- */
  terrain(x, z) {
    let h = Math.sin(x * 0.3) * Math.cos(z * 0.2) * 0.35 + Math.max(0, Math.abs(x) - 15) * 1.1;
    if (starsStream(z)) h = Math.abs(x - STARS.FORD) < 2.2 ? -0.25 : -1.4;   // the stream, with a shallow ford
    return h;
  },

  groundColor(x, z, h) {
    if (starsStream(z)) return Math.abs(x - STARS.FORD) < 2.2 ? 0x8a7a5c : 0x4b5563;
    if(Math.abs(z)<4.25)return 0x686c5c;
    const pathX=7*Math.exp(-z*z/180);
    if(Math.abs(x-pathX)<1.8)return 0x93866b;
    return Math.sin(x*.15+z*.07)>.3?0x79825b:0x68784e;
  },

  /* ---------- build ---------- */
  build(api) {
    const T = api.THREE;
    // Imagined Haran boardwalk: low loads, a woven canopy and one simple screen release.
    STARS.entry={done:false,open:false,route:[]};
    [[0,60,.6],[3,56,1.2],[0,52,.6]].forEach(([x,z,h],i)=>{
      const deck=api.box({x,z,w:5,d:3,h:i===1?.16:h,y:i===1?h-.16:0,tex:i===1?'cloth':'wood',color:i===1?0x806ca5:0xa57f50,house:false});STARS.entry.route.push([x,h,z]);
      if(i===1){deck.platform.bouncy=.35;const cap=deck.mesh.getObjectByName('cap');if(cap)cap.visible=false;
        for(let k=0;k<6;k++){const strip=new T.Mesh(new T.BoxGeometry(5/6,.01,3),api.texMat(k%2?0xe3d2ab:0x806ca5,'cloth'));strip.position.set(-2.5+(k+.5)*5/6,.075,0);deck.mesh.add(strip);}
        for(const dx of [-2.4,2.4])for(const dz of [-1.4,1.4]){const post=new T.Mesh(new T.CylinderGeometry(.07,.1,h-.16,7),api.texMat(0x705039,'wood'));post.position.set(x+dx,(h-.16)/2,z+dz);api.add(post);}
      }
    });
    const screen=api.box({x:0,z:47,w:9,d:.35,h:2.7,tex:'cloth',color:0xb27a62,house:false});
    [-11,11].forEach(x=>api.box({x,z:47,w:13,d:.5,h:3.2,color:0xa07055,tex:'cloth',house:false}));
    for(const x of [-4.7,4.7]){const post=new T.Mesh(new T.CylinderGeometry(.1,.13,3.3,8),api.texMat(0x705039,'wood'));post.position.set(x,1.65,47);api.add(post);}
    const rolled=new T.Mesh(new T.CylinderGeometry(.22,.22,9,12),api.texMat(0xb27a62,'cloth'));rolled.rotation.z=Math.PI/2;rolled.position.set(0,2.65,47);rolled.visible=false;api.add(rolled);
    STARS.entry.screen=screen;STARS.entry.rolled=rolled;
    STARS.entry.release=api.zone({x:0,z:49.2,r:2.2,time:1.2,action:'Roll up camp screen',working:'Rolling up the screen',onDone(){STARS.entry.open=true;screen.show(false);rolled.visible=true;api.sfx('rope');}});
    api.box({x:-7,z:56,w:5,d:4,y:.8,h:.2,tex:'cloth',color:0x806ca5,house:false});
    api.box({x:-7,z:60,w:3,d:2,h:.45,tex:'wood',color:0xa57f50,house:false});
    api.discovery({id:'haran-canopy',name:'The camp canopy',x:-7,z:56,y:1,r:1.6});
    api.leaves([[0,63],[0,60,1.6],[3,56,2.2],[0,52,1.6],[-7,56,2],[0,43]]);
    api.camZone({minX:-10,maxX:10,minZ:40,maxZ:69,yaw:-.25,height:10,back:15,focus:[0,1,49],pull:.2});

    api.follower({ x: 4, z: 37, kind: 'camel', call: false, ride: true, seat: 1.45, rideSpeed: 1.4 });   // Abram had camels (Genesis 12:16): climb on and ride (Y)
    const person=(robe,scarf,size,look)=>{const g=api.storyPerson(robe,scarf,size,look);STARS.actors.push(g);return g;};

    // --- Haran camp: tents to pack, bundles for the camel ---
    [[-9, 38, 0x9a6b3c], [9, 38, 0xb08850], [-11, 28, 0xa57a48], [11, 30, 0x8f6a40]].forEach(([x, z, c]) => {
      const t=api.clothTent({x,z,color:c,glow:true});STARS.oldTents.push(t);
    });
    const camel=api.animalMesh('camel',{kneel:true});
    camel.position.set(0, api.terrain(0, 31), 31); camel.rotation.y = Math.PI / 2; api.add(camel);
    STARS.camel = camel; STARS.load = [];
    [[-8, 34.5], [8, 34], [-7, 25.5], [6.5, 26]].forEach(([x, z], i) => {
      const g = new T.Group();
      const b = new T.Mesh(new T.BoxGeometry(0.8, 0.55, 0.6), api.mat([0x7c2d12, 0x1e3a8a, 0x365314, 0x713f12][i])); g.add(b);
      const r = new T.Mesh(new T.BoxGeometry(0.82, 0.1, 0.1), api.mat(0xd6b98c)); r.position.y = 0.1; g.add(r);
      STARS.bundles.push(api.carryable({
        x, z, mesh: g, name: 'bundle', to: 'the camel',
        deliverTo: { x: 0, z: 31, r: 3 },
        onDeliver(p) {
          api.task('pack');
          api.servant(p, 4, 'for helping pack!');
          const t = STARS.oldTents[api.taskCount('pack') - 1]; if (t) t.visible = false;   // a tent comes down
          const k=STARS.load.length,l=new T.Mesh(new T.BoxGeometry(.5,.35,.6),api.texMat(0x93734e,'cloth'));l.position.set((k%2?1:-1)*.38,STARS.camel.userData.back+.16,Math.floor(k/2)*.65-.32);STARS.camel.add(l);STARS.load.push(l);
          // (the task board counts it: no pop-up)
        }
      }));
    });

    // --- the flock (waits until the camp is packed) ---
    [['sheep', -6, 22], ['sheep', -2, 20], ['goat', 3, 21], ['sheep', 7, 22], ['goat', -9, 19], ['goat', 10, 18]].forEach(([kind, x, z]) => {
      const f = api.follower({
        x, z, kind,
        deliverTo: { x: STARS.PEN[0], z: STARS.PEN[1], r: 3.2 },
        parkAt: (ff) => { const i = STARS.flock.indexOf(ff); return [STARS.PEN[0] - 1.5 + (i % 3) * 1.5, api.terrain(0, STARS.PEN[1] - 2), STARS.PEN[1] - 1.6 - Math.floor(i / 3) * 1.4]; },
        onDeliver(p) {
          api.task('flock');
          api.servant(p, 3, 'for leading the flock!');
          // (the task board counts it: no pop-up)
        }
      });
      f.state = 'parked';
      STARS.flock.push(f);
    });

    // --- the stream: water, stepping stones, rocks ---
    const water = new T.Mesh(new T.PlaneGeometry(40, 6.4), new T.MeshLambertMaterial({ color: 0x2563eb, transparent: true, opacity: 0.7 }));
    water.rotation.x = -Math.PI / 2; water.position.set(0, -0.55, 0); api.add(water);
    const fx = STARS.FORD;
    api.hazard({ x: (-19 + fx - 2.2) / 2, z: 0, w: fx - 2.2 + 19, d: 6.0 }, { maxY: -0.6, except: (p) => p.role.id === 'fisherman', msg: 'Splash! Use the stepping stones or the shallow ford (the Fisherman can wade).' });
    api.hazard({ x: (19 + fx + 2.2) / 2, z: 0, w: 19 - fx - 2.2, d: 6.0 }, { maxY: -0.6, except: (p) => p.role.id === 'fisherman', msg: 'Splash! Use the stepping stones or the shallow ford (the Fisherman can wade).' });
    [-2.3, 0, 2.3].forEach((z) => api.stump(-3, z, 1.7, 0.8));
    [[-10, 3.8], [-1, -3.9], [3, 4], [12, -4], [-16, -3.6]].forEach(([x, z]) => api.rock(x, z, 0.7));
    [[fx - 2.5, 2.2], [fx + 2.5, 2.2], [fx - 2.5, -2.2], [fx + 2.5, -2.2]].forEach(([x, z]) => {    // marker posts at the ford
      const post = new T.Mesh(new T.CylinderGeometry(0.12, 0.12, 1.4), api.mat(0xd6b98c)); post.position.set(x, -0.25 + 0.7, z); api.add(post);
      const glow = new T.Mesh(new T.SphereGeometry(0.16, 8, 6), new T.MeshBasicMaterial({ color: 0xfde68a })); glow.position.set(x, 0.55, z); api.add(glow);
    });

    // --- the new camp: pen, tents, altar ---
    const [px, pz] = STARS.PEN;
    [[0, -4.4, 6, 0.2], [-3, -2.2, 0.2, 4.4], [3, -2.2, 0.2, 4.4]].forEach(([dx, dz, w, d]) => api.box({ x: px + dx, z: pz + dz, w, d, h: 0.9, color: 0x8b5e34 }));
    [[-9, -28], [9, -28], [-8, -40]].forEach(([x, z]) => {
      const t=api.clothTent({x,z,color:0xb6a17e,glow:true});t.visible=false;STARS.tents.push(t);
      const pegs = new T.Mesh(new T.BoxGeometry(1.2, 0.3, 0.8), api.mat(0x9a6b3c)); pegs.position.set(x + 1.6, api.terrain(x, z) + 0.15, z); api.add(pegs);
      STARS.tentZones.push(api.zone({
        x, z, r: 1.8, time: 2.5, color: 0xfacc15, hidden: true, action: 'Pitch tent', working: 'Pitching tent',
        onDone(helpers) {
          t.visible = true; pegs.visible = false;
          api.task('camp'); api.sfx('build');
          helpers.forEach((p) => api.servant(p, 3, 'for setting up camp!'));
        }
      }));
    });
    const [ax, az] = STARS.ALTAR;
    api.rockBox({ x: ax, z: az - 2, w: 1.6, d: 1.2, h: 0.9, color: 0x9ca3af });
    const fire = new T.PointLight(0xffa64d, 1.4, 9, 2); fire.position.set(ax, 1.6, az - 2); api.add(fire);
    const abram = person(0x7c2d12, 0xf5f5f4, 1, { age: 'elder', beard: true }); abram.position.set(ax - 1.6, api.terrain(ax - 1.6, az - 1), az - 1); api.add(abram);STARS.abram=abram;abram.visible=false;
    const sarai = person(0x1e40af, 0xfde68a); sarai.position.set(ax + 1.6, api.terrain(ax + 1.6, az - 1), az - 1); api.add(sarai);STARS.sarai=sarai;sarai.visible=false;

    // --- a thousand stars, shown at the finale ---
    const n = 1400, pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      // mostly in front of the camera (toward -z), low in the sky, so the top-down view can see them
      const a = -Math.PI / 2 + (Math.random() - 0.5) * 2.6, e = 0.03 + Math.pow(Math.random(), 1.6) * 0.9, r = 85;
      pos[i * 3] = Math.cos(a) * Math.cos(e) * r; pos[i * 3 + 1] = Math.sin(e) * r; pos[i * 3 + 2] = Math.sin(a) * Math.cos(e) * r - 20;
    }
    const geo = new T.BufferGeometry(); geo.setAttribute('position', new T.BufferAttribute(pos, 3));
    STARS.skyMat=api.starMaterial({color:0xfff7d6,size:1.15,opacity:0});
    STARS.sky = new T.Points(geo, STARS.skyMat); STARS.sky.visible = false; api.add(STARS.sky);

    // --- fragment 1: the Scribe-jump ledges (one step is too high for anyone but the Scribe) ---
    api.rockBox({ x: -14, z: 14, w: 1.8, d: 1.8, h: 1.0 - api.terrain(-14, 14), color: 0x8a8f98 });
    api.rockBox({ x: -14, z: 11.6, w: 1.8, d: 1.8, h: 4.0 - api.terrain(-14, 11.6), color: 0x8a8f98 });   // a 3.0 rise: only the Scribe's jump reaches
    api.rockBox({ x: -14, z: 9.2, w: 1.8, d: 1.8, h: 0.4, y: 4.4, color: 0x8a8f98 });
    api.fragment({ x: -14, z: 9.2, y: 4.8 + 1.3 });

    // --- fragment 2: deep in the stream (the Fisherman casts a net) ---
    api.fragment({ x: -12, z: 0, y: -1.0, net: true });

    // --- fragment 3: crumbling stones across the stream to a rocky outcrop ---
    [[13, 4.6, 1.0], [14.5, 2.4, 1.6], [13, 0.2, 2.2], [14.5, -2.0, 2.8]].forEach(([x, z, top]) => api.crumble({ x, z, top }));
    api.rockBox({ x: 13.5, z: -4.8, w: 2.2, d: 2.2, h: 3.4 - api.terrain(13.5, -4.8), color: 0x8a8f98 });
    api.fragment({ x: 13.5, z: -4.8, y: 3.4 + 1.3 });

    // --- Golden Scroll challenge course: up the east side ---
    const plan = [['block', 1.0], ['float', 1.0], ['crumble', 0.9], ['float', 0.8], ['spring', 0.2], ['float', 4.2], ['crumble', 0.6]];
    let ctop = 0;
    api.course(plan.map(([kind, rise], i) => {
      const z = 26 - i * 2.9, x = 14.5 + (i % 2 ? 0.3 : -0.3);
      ctop = i === 0 ? api.terrain(x, z) + 1.0 : ctop + rise;
      return { x, z, top: ctop, kind };
    }));

    api.leaves([[0, 34], [-4, 30], [4, 24], [0, 16], [-3, 10], [fx, 6], [fx, -6], [-3, -2.3, 1.7 - 1.4 + 0.9], [0, -12], [-4, -18], [4, -22],
      [-6, -32], [6, -36], [-14, 14, 1.9], [13, 4.6, 1.9]]);

    // camera: frame the ford and the Scribe's ledges
    api.camZone({ minX: 2, maxX: 12, minZ: -4, maxZ: 6, yaw: -0.5, height: 11, back: 12, focus: [STARS.FORD, 0.5, -1], pull: 0.4 });
    api.camZone({ minX: -18, maxX: -10, minZ: 8, maxZ: 17, yaw: 0.6, height: 10, back: 11, focus: [-14, 3, 10.5], pull: 0.5 });
    const helper=person(0x8b6b4c,0xcebd95,1,{beard:true});helper.position.set(-4,api.terrain(-4,37),37);api.add(helper);STARS.helper=helper;
    STARS.conversation=api.conversation({person:helper,speaker:'Camp helper',label:'Ask about the journey',clue(){
      if(!api.taskDone('pack')){const held=api.players().some(p=>STARS.bundles.includes(p.holding)),b=STARS.bundles.find(b=>!b.delivered&&!b.holder);return {text:'God called Abram to leave Haran. These bundles are for the journey.',at:held?[0,2,31]:b?[b.x,b.y+1,b.z]:[0,2,31]};}
      if(!api.taskDone('flock'))return {text:'Lead the flock across the shallow ford. Look for the glowing posts.',at:[STARS.FORD,1,0]};
      return {text:'Abram trusted God. Meet him at the new camp.',at:[STARS.ALTAR[0],1,STARS.ALTAR[1]]};
    }});
    const travelAbram=person(0x7c2d12,0xf5f5f4,1,{age:'elder',beard:true,cane:true});travelAbram.position.set(-4.8,api.terrain(-4.8,32.8),32.8);api.add(travelAbram);STARS.travelAbram=travelAbram;
    STARS.travelConversation=api.conversation({person:travelAbram,speaker:'Abram',label:'Ask Abram about God’s call',clue(){
      const b=STARS.bundles.find(b=>!b.delivered&&!b.holder);return {text:'God told me to go, and I went. These bundles are for our journey.',at:b?[b.x,b.y+1,b.z]:[0,2,31]};
    }});
    STARS.saraiConversation=api.conversation({person:sarai,speaker:'Sarai',label:'Speak with Sarai',clue(){
      const tent=STARS.tentZones.find(t=>!t.done);
      return tent?{text:'The flock is safe. Use the marked rings to pitch our tents.',at:[tent.x,1,tent.z]}:{text:'We can rest here. God’s promise is His gift.',at:[STARS.ALTAR[0],1,STARS.ALTAR[1]]};
    }});
    STARS.promiseConversation=api.conversation({person:abram,speaker:'Abram',label:'Speak with Abram',clue(){
      if(!api.taskDone('pack')){const b=STARS.bundles.find(b=>!b.delivered&&!b.holder);return {text:'God told me to go, and I went. Our helpers are packing for the journey.',at:b?[b.x,b.y+1,b.z]:[0,2,31]};}
      if(!api.taskDone('flock'))return {text:'We are going where God leads us. Bring the flock across the ford.',at:[STARS.FORD,1,0]};
      const tent=STARS.tentZones.find(t=>!t.done);
      if(tent)return {text:'God told me to go, and I went. Help settle the camp.',at:[tent.x,1,tent.z]};
      if(!STARS.told)return {text:'God called me, and I trust Him. Gather with us beside the altar.',at:[STARS.ALTAR[0],1,STARS.ALTAR[1]]};
      return {text:'God promised me descendants as countless as the stars. I believed Him.',at:[STARS.ALTAR[0],1,STARS.ALTAR[1]]};
    }});
    // Practical light follows the tent's own visibility, including packing and pitching.
    [STARS.oldTents[0],STARS.tents[0]].forEach(t=>{const lamp=new T.PointLight(0xffbc72,.65,7,2);lamp.position.set(0,.65,1.4);t.add(lamp);});
    STARS.campView=api.camZone({minX:-15,maxX:15,minZ:-46,maxZ:-23,yaw:.12,height:12,back:18,focus:[0,2,-31],pull:.12});

  },

  update(api, dt) {
    STARS.travelAbram.visible=!api.taskDone('pack');
    STARS.abram.visible=STARS.sarai.visible=api.taskDone('flock');
    starsPeople(api,dt);
    if(STARS.entry&&!STARS.entry.done&&api.players().some(p=>p.pos.z<41)){STARS.entry.done=true;api.checkpoint({x:0,z:39,label:'Haran camp'});}
    if (!STARS.packed && api.taskDone('pack')) {
      STARS.packed = true;
      STARS.flock.forEach((f) => { f.state = 'idle'; });
      api.story([
        { art: '🚶', text: 'So Abram departed, as the LORD had spoken unto him; and Lot went with him: and Abram was seventy and five years old when he departed out of Haran.', ref: 'Genesis 12:4' }
      ]);
      api.toast('🐑 Now call the flock and cross the stream at the shallow ford (the glowing posts).', 4000);
    }
    if (!STARS.crossed && api.taskDone('flock')) {
      STARS.crossed = true;
      STARS.tentZones.forEach((z) => z.show(true));
      api.toast('⛺ The flock is safe! Enter a gold ring and use the shown special-action button to pitch a tent. Stay in the ring to finish.', 3500);
    }
    // a gentle hint for the Scribe-only ledge
    if (!STARS.toldScribe && api.near(-14, 14, 1.4).some((p) => p.role.id !== 'scribe' && p.pos.y > 0.8)) {
      STARS.toldScribe = true;
      api.toast('That ledge is high! The Scribe jumps highest (Tab / RB to switch).', 3500);
    }
    if (STARS.sky.visible && STARS.skyMat.opacity < 1) STARS.skyMat.opacity = Math.min(1, STARS.skyMat.opacity + dt * 0.35);
  },

  objective(api) {
    if(STARS.entry&&!STARS.entry.done)return STARS.entry.open?[0,1,39]:[0,1,49.2];
    const ps = api.activePlayers();
    if (!ps.length) return null;
    const cx = ps.reduce((s, p) => s + p.pos.x, 0) / ps.length, cz = ps.reduce((s, p) => s + p.pos.z, 0) / ps.length;
    const near = (list) => list.sort((a, b) => Math.hypot(a.x - cx, a.z - cz) - Math.hypot(b.x - cx, b.z - cz))[0];
    if (!api.taskDone('pack')) {
      if (ps.some((p) => p.holding && STARS.bundles.indexOf(p.holding) >= 0)) return [0, 3, 31];
      const b = near(STARS.bundles.filter((it) => !it.delivered && !it.holder));
      return b ? [b.x, b.y + 1, b.z] : null;
    }
    if (!api.taskDone('flock')) {
      const idle = STARS.flock.filter((f) => f.state === 'idle').map((f) => ({ x: f.pos.x, z: f.pos.z, y: f.pos.y }));
      if (STARS.flock.some((f) => f.state === 'follow')) return cz > -2 ? [STARS.FORD, 1, 0] : [STARS.PEN[0], 1.5, STARS.PEN[1]];
      const f = near(idle);
      return f ? [f.x, f.y + 2, f.z] : null;
    }
    const z = STARS.tentZones.find((t) => !t.done);
    return z ? [z.x, 1.5, z.z] : null;
  },

  finale: {
    message: '🔥 Everyone gather at the altar, and look up!',
    beacon: [0, 3, -27],
    onStart() { STARS.promiseReady=true; },
    inZone(p) { return Math.hypot(p.pos.x - STARS.ALTAR[0], p.pos.z - STARS.ALTAR[1]) < 6; },
    onUpdate(api, t) {
      if(!STARS.promiseStarted){
        STARS.promiseStarted=true;api.music(false);STARS.sky.visible=true;api.finishCaption(false);
        Object.assign(STARS.campView,{height:5.5,back:20,focus:[0,5,-40],pull:.3});
      }
      if (t > 3.5 && !STARS.told) {
        STARS.told = true;
        api.story([
          { art: '🌙', title: 'Later, under the stars', text: 'Later, the LORD spoke to Abram. Abram still had no child to inherit the promise. God brought him outside.' },
          { art: '✨', text: 'And he brought him forth abroad, and said, Look now toward heaven, and tell the stars, if thou be able to number them: and he said unto him, So shall thy seed be.', ref: 'Genesis 15:5' },
          { art: '🙏', text: 'And he believed in the LORD; and he counted it to him for righteousness.', ref: 'Genesis 15:6' },
          { art: '⭐', title: 'The promised Seed', text: 'Now to Abraham and his seed were the promises made. He saith not, And to seeds, as of many; but as of one, And to thy seed, which is Christ.', ref: 'Galatians 3:16' },
          { art: '💛', title: 'Made right by trusting', text: 'Abram was made right with God by believing God\'s promise, not by being good enough. We are too, when we trust Jesus.' }
        ], () => { STARS.endT = api.time; api.music(true); });
      }
      return STARS.endT !== undefined && api.time - STARS.endT > 2;
    }
  }
};


function starsPeople(api,dt) {
  const ps=api.activePlayers(),blend=Math.min(1,dt*5),watch=!!STARS.promiseStarted;
  for(const g of STARS.actors){
    if(!g.visible)continue;const a=g.userData.storyActor;
    let near=null,distance=5;for(const p of ps){const d=Math.hypot(p.pos.x-g.position.x,p.pos.z-g.position.z);if(d<distance){distance=d;near=p;}}
    const talking=a.talkUntil>api.time&&a.listener&&!a.listener.bubble,target=talking?a.listener:near;
    const sky=watch&&!talking&&(g===STARS.abram||g===STARS.sarai);
    const yaw=sky?-2.4:target?Math.atan2(target.pos.x-g.position.x,target.pos.z-g.position.z):0;
    let delta=yaw-g.rotation.y;while(delta>Math.PI)delta-=Math.PI*2;while(delta< -Math.PI)delta+=Math.PI*2;g.rotation.y+=delta*blend;
    api.posePerson(g,{dt,talking,headPitch:sky?-.28:0,expression:sky?'wonder':near?'listen':'calm'});
  }
}
