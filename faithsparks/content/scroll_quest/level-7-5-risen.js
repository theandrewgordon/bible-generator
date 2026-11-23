/* =====================================================================
 * LEVEL 7-5: HE IS RISEN!  (Luke 24:1-12; Matthew 28:1-8; 1 Corinthians 15)
 * ---------------------------------------------------------------------
 * Dawn, then bright morning. Walk toward -z:
 *   The garden  (z 44..10)   carry spices to the tomb; the stone is already rolled away
 *   The valley  (z 8..-14)   the brook (Fisherman), stepping stones
 *   Jerusalem   (z -16..-44) the city wall (Builder's ladder), the disciples' house
 * Tasks: bring 3 jars of spices to the tomb; then run and tell the disciples.
 * God raised Jesus; the kids carry spices and run with the news. Jesus is not shown.
 * Only edit THIS file to change the level. See GEMINI.md and CAMPAIGN.md.
 * ===================================================================== */

const RISEN = {
  elapsed: 0,
  spices: [],
  angels: [],
  ladder: [],
  news: false,
  dawnT: -1,
  sunLight: null,
  sun: null,
  told: false,
  fireworks: 0,
  TOMB: [-9, 22.6],
  HOUSE: [0, -36],
  JOY: {
    bpm: 132,
    notes: [72, 76, 79, 84, 79, 76, 72, 76, 77, 81, 84, 81, 79, 0, 79, 0,
            72, 76, 79, 84, 86, 84, 81, 79, 77, 76, 74, 76, 72, 0, 0, 0],
    bass: [48, 48, 53, 53, 55, 55, 48, 48]
  }
};

function risenGround(z) {
  if (z > 10) return 0.4;
  if (z > -2) return 0.4 - (10 - z) * 0.12;           // down toward the brook
  if (z > -10) return -1;
  if (z > -18) return -1 + (-10 - z) * 0.3;          // up to the city
  return 1.4;
}

const LEVEL = {
  id: '7-5',
  bibleConnection: {"passage": "Luke 24; John 20", "text": "Jesus had already risen bodily from the dead. His followers found the empty tomb and saw Him alive. Our spice deliveries and messenger route are just for our game; they do not bring Him back to life."},
  world: 'World 7-5',
  title: 'He Is Risen!',
  decor: { grass: 100, flowers: 24, pebbles: 35 },
  reactive: false,
  life: false,
  artDirection: { textureStrength: .24, storyPlants: 14, ambientCount: 0, checkpointSigns: false },
  time: 'sunset',                     // early dawn colours; the level brightens to full morning
  leafIcon: '🌸',
  leafColor: 0xfbcfe8,
  leafShape: 'round',
  spawn: [0, 79],
  bounds: { minX: -18, maxX: 18, minZ: -44, maxZ: 84 },
  startMessage: 'Our garden path is imagined. Hop the two stone gates, then bring the spices to the tomb.',

  intro: [
    { text: 'Now upon the first day of the week, very early in the morning, they came unto the sepulchre, bringing the spices which they had prepared, and certain others with them.', ref: 'Luke 24:1' },
    { text: 'Jesus said unto her, I am the resurrection, and the life: he that believeth in me, though he were dead, yet shall he live:', ref: 'John 11:25' }
  ],

  introStory: [
    { art: '🌄', title: 'Very early in the morning', text: 'Now upon the first day of the week, very early in the morning, they came unto the sepulchre, bringing the spices which they had prepared, and certain others with them.', ref: 'Luke 24:1' }
  ],

  tasks: [
    { id: 'spices', icon: '🫙', label: 'Carry the spices to the tomb', total: 3 },
    { id: 'tell', icon: '🏃', label: 'Run and tell the disciples!', total: 1, lockedUntil: 'spices' }
  ],

  memoryVerse: { text: 'Jesus said unto her, I am the resurrection, and the life: he that believeth in me, though he were dead, yet shall he live:', ref: 'John 11:25' },

  ending: {
    verse: { text: 'He is not here, but is risen:', ref: 'Luke 24:6' },
    message: 'Jesus is alive! He beat sin and death, and anyone who trusts Him is forgiven, forever.'
  },

  quiz: [
    { q: 'What did the women find at the tomb?', ref: 'Luke 24:2–3', options: ['The tomb was still closed', 'The stone rolled away, and Jesus was not there', 'A sleeping soldier'], answer: 1, explain: 'The stone was already rolled away, and the tomb was empty. Jesus had risen.' },
    { q: 'What is the good news about Jesus?', ref: '1 Corinthians 15:3–4', options: ['He died for our sins, was buried, and rose again the third day', 'He only pretended to die', 'His friends earned His resurrection'], answer: 0, explain: 'Jesus truly died for our sins, was buried and rose bodily on the third day.' },
    { q: 'How do we receive God\'s forgiveness?', ref: 'Ephesians 2:8', options: ['By earning enough points', 'By being better than others', 'By grace through faith: it is the gift of God'], answer: 2, explain: 'Forgiveness is God’s gift, received through faith. Our game points cannot earn it.' }
  ],

  music: {
    bpm: 76,
    notes: [60, 0, 64, 0, 67, 0, 0, 0, 65, 0, 64, 0, 62, 0, 0, 0,
            60, 0, 64, 0, 69, 0, 67, 0, 65, 0, 64, 0, 60, 0, 0, 0],
    bass: [48, 48, 45, 45, 41, 41, 43, 43]
  },

  /* ---------- ground shape ---------- */
  terrain(x, z) {
    let h = risenGround(z) + Math.sin(x * 0.35) * Math.cos(z * 0.27) * 0.15;
    h += Math.max(0, Math.abs(x) - 14) * 1.2;
    if (Math.abs(z + 6) < 2.2) h -= 2.6 * Math.min(1, (2.2 - Math.abs(z + 6)) / 0.6);   // the brook
    return h;
  },

  groundColor(x, z, h) {
    if (Math.abs(z + 6) < 2.2 && h < -2) return 0x3b82c4;
    if (Math.hypot(x+9,z-22)<3.4)return 0x9d9078;
    if (z < -18) return Math.abs(x)<4.5?0xb8a584:0xa99c7e;   // city street
    return Math.abs(x)<3.3?0xb3ad83:Math.sin(x*.13+z*.08)>.25?0x81996c:0x799067;   // garden
  },

  /* ---------- build ---------- */
  build(api) {
    const T = api.THREE;

    // A dawn garden walk before the original spice route. Jesus has already risen.
    RISEN.entry={done:false,gateOpen:false,route:[],sideRoute:[]};
    const entry=RISEN.entry;
    const step=(x,z,rise,w=6,d=4.5)=>{const y=api.terrain(x,z);api.rockBox({x,z,y,w,d,h:rise,color:0xc7b797});return [x,y+rise,z];};
    entry.route.push(step(0,75,.85),step(-3,70,1.25),step(0,65,.65));
    entry.route.push([-1,api.terrain(-1,61.8),61.8,false],step(3,60,.95),step(0,54,.55));
    [[0,74],[3,60]].forEach(([cx,z])=>{
      const left=cx-3,right=cx+3;
      api.rockBox({x:(-18+left)/2,z,w:left+18,d:1,h:2.1,color:0xc3b293});
      api.rockBox({x:(right+18)/2,z,w:18-right,d:1,h:2.1,color:0xc3b293});
    });
    entry.sideRoute.push(step(4.6,69,.45,4,4),step(10,66,1,5,5));
    const base=api.terrain(10,66),floor=base+1;
    // An optional side gate opens once for everyone; the route back stays open.
    const gate=api.box({x:7.4,z:66,w:.25,d:5,h:1.6,y:base,color:0x8b6b44,tex:'wood',house:false});entry.gate=gate;
    entry.latch=api.interact({x:6,z:67.5,y:api.terrain(6,67.5),r:2,vRange:1.4,whileHolding:true,label:'Open the garden side gate',
      can:p=>p.onGround?true:'Land beside the latch.',use(){if(entry.gateOpen)return;entry.gateOpen=true;this.remove();gate.mesh.rotation.y=Math.PI/2;gate.mesh.position.set(9.9,base+.8,68.5);Object.assign(gate.platform,{minX:7.4,maxX:12.4,minZ:68.375,maxZ:68.625});api.sfx('door');api.toast('Side gate open. Everyone can explore!',2600);}});
    [[7,63.2],[13,63.2],[7,69.2],[13,69.2]].forEach(([x,z])=>api.box({x,z,w:.18,d:.18,h:4.5,y:base,color:0x7d623e,tex:'wood',house:false}));
    const roof=api.box({x:10,z:66,w:6.5,d:6.5,h:.18,y:base+4.5,color:0x527646,tex:'leaves',house:false});api.fadeScenery(roof.mesh,3.5);
    entry.discovery=api.discovery({id:'garden-shade',name:'The shaded garden',x:10,z:66,y:floor,r:1.6,vRange:.65});
    [[-10,77],[11,76],[-11,64],[12,56],[-10,49]].forEach(([x,z],i)=>risenOlive(api,x,z,.8+(i%2)*.15));
    [[8.8,65],[11,65.5],[9,67.5]].forEach(([x,z])=>{const flower=new T.Group();for(let i=0;i<5;i++){const petal=new T.Mesh(new T.SphereGeometry(.14,6,4),api.mat(i%2?0xf8c1d0:0xffe0a8));petal.scale.y=.45;petal.position.set(Math.cos(i*1.256)*.15,.25,Math.sin(i*1.256)*.15);flower.add(petal);}flower.position.set(x,floor,z);api.add(flower);});
    api.leaves([[0,78],[0,75,api.terrain(0,75)+1.9],[-3,70,api.terrain(-3,70)+2.3],[0,65,api.terrain(0,65)+1.7],[3,60,api.terrain(3,60)+2],[0,54,api.terrain(0,54)+1.6],[0,47],[4.6,69,api.terrain(4.6,69)+1.5],[10,66,floor+1]]);
    api.trail([[0,80],[0,75],[-3,70],[0,65],[-1,61.8],[3,60],[0,54],[0,43]],2.6);
    api.camZone({minX:-16,maxX:16,minZ:47,maxZ:83,yaw:-.15,height:11,back:17,focus:[0,1,64],pull:.12});

    // --- the tomb, carved in a rock hill; the great stone is already rolled away ---
    api.rockBox({ x: -9, z: 16, w: 7, d: 8, h: 2.6, color: 0x8b8178 });
    api.rockBox({ x: -9.3, z: 15.8, w: 5.8, d: 6.6, y:api.terrain(-9,16)+2.6,h:1.4,color:0x918579 });
    api.rockBox({ x: -9.6, z: 15.6, w: 4, d: 4.8, y:api.terrain(-9,16)+4,h:1,color:0x8b8178 });
    risenTomb(api);
    // The old stone's collision stays exactly where it was, beside the open doorway.
    api.box({ x: -5.6, z: 20.6, w: 3, d: 1, h: 2.4, color: 0x78716c }).mesh.visible = false;
    // Luke describes two men in shining garments: articulated people, without added wings or a glowing ball.
    [[-10.6,21.2],[-7.4,21.2]].forEach(([x,z],i)=>{
      const g=new T.Group(),m=api.storyPerson(0xfdfcf7,0xffffff,1.08,{register:false,skin:i?0xc18d63:0xd6aa7b});
      m.rotation.y=i?-.35:.35;g.add(m);g.userData.man=m;
      m.traverse(o=>{if(o.isMesh&&o.material&&o.material.color&&o.material.color.getHex()>0xf0f0f0){o.material=o.material.clone();o.material.emissive=new T.Color(0xfff6dc);o.material.emissiveIntensity=.35;}});
      g.position.set(x,api.terrain(x,z),z);g.visible=false;g.name='resurrection-messenger';api.add(g);RISEN.angels.push(g);
      g.userData.sqHalo={color:0xffedbe,scale:3.3,offsetY:1.3,opacity:.18};
    });
    RISEN.women=[[-4.4,25.6,0x7c3a5a],[-3.6,23.6,0x4f6b8a],[-13.4,24.4,0x8a6d3a]].map(([x,z,robe],i)=>{
      const m=api.storyPerson(robe,0xece2c8,.96,{register:false,age:i===2?'elder':undefined});m.position.set(x,api.terrain(x,z),z);m.rotation.y=Math.atan2(-9-x,20-z);api.add(m);return m;
    });
    RISEN.womenPlaces=[[-4.6,-31.8],[-6,-33.2],[6.6,-32.4]];
    RISEN.tombView=api.camZone({minX:-17,maxX:5,minZ:17,maxZ:31,yaw:-.18,height:8,back:16,focus:[-9,1.8,20.8],pull:.3});
    api.camZone({minX:-17,maxX:17,minZ:-12,maxZ:0,yaw:.25,height:10,back:17,focus:[0,-.3,-6],pull:.2});

    // --- three jars of spices to carry ---
    [[-6, 34], [7, 29], [3, 22]].forEach(([x, z]) => {
      const g = new T.Group();
      const jar = new T.Mesh(new T.CylinderGeometry(0.28, 0.38, 0.7, 12), api.mat(0xd6a35c)); g.add(jar);
      const lid = new T.Mesh(new T.CylinderGeometry(0.2, 0.2, 0.1, 10), api.mat(0x7a5230)); lid.position.y = 0.4; g.add(lid);
      risenJarDetail(api,g);
      RISEN.spices.push(api.carryable({
        x, z, mesh: g,
        deliverTo: { x: RISEN.TOMB[0], z: RISEN.TOMB[1], r: 3.2 },
        onDeliver(p) {
          api.task('spices');
          api.servant(p, 4);
          // (the task board counts it: no pop-up)
        }
      }));
    });

    // garden trees and flowers
    [[-14, 36], [13, 38], [-13, 26], [14, 22], [10, 12], [-16.8, 9], [13, 2]].forEach(([x, z], i) => risenOlive(api,x,z,.9+(i%2)*.15));

    // --- the brook (Fisherman nets fragment 1) ---
    const brook = new T.Mesh(new T.PlaneGeometry(40, 4.4), new T.MeshLambertMaterial({ color: 0x5aa9e6, transparent: true, opacity: 0.8 }));
    brook.rotation.x = -Math.PI / 2; brook.position.set(0, -1.7, -6); api.add(brook);
    api.hazard({ x: 0, z: -6, w: 40, d: 4.2 }, { maxY: -1.6, except: (p) => p.role.id === 'fisherman', msg: 'Splash! Hop across on the stepping stones.' });
    [[0.8, -4.4], [-0.8, -6], [0.6, -7.6]].forEach(([x, z]) => api.stump(x, z, 2.7, 0.9));
    api.fragment({ x: 11, z: -6, y: -0.6, net: true });

    // --- the city wall with a gate; the Builder can put up a ladder to fragment 2 on top ---
    RISEN.walls=[[-11, -20, 12], [11, -20, 12]].map(([x, z, w]) => api.box({ x, z, w, d: 1.6, h: 4.6, color: 0xb59f78 }));
    const arch = new T.Mesh(new T.BoxGeometry(10, 1, 1.8), api.mat(0xb59f78)); arch.position.set(0, api.terrain(0, -20) + 5, -20); api.add(arch);
    api.fragment({ x: -13, z: -20, y: api.terrain(-13, -20) + 4.6 + 1.3 });
    [[-8, -17.6, 1.2], [-10, -17.6, 2.4], [-12, -17.6, 3.6]].forEach(([x, z, top]) =>
      RISEN.ladder.push(api.box({ x, z, w: 1.6, h: 0.35, d: 1.6, y: api.terrain(x, z) + top - 0.35, hidden: true, color: 0xa0703c })));
    const planks = new T.Mesh(new T.BoxGeometry(1.4, 0.4, 2), api.mat(0xa0703c)); planks.position.set(-6, api.terrain(-6, -15) + 0.2, -15); api.add(planks);
    api.interact({
      x: -6, z: -15, r: 2.4, vRange: 3, label: 'Build steps',
      can: (p) => (p.role.id === 'builder' ? true : 'Some planks. The Builder could make steps up the wall (Tab / RB to switch).'),
      use(p) {
        this.remove(); planks.visible = false;
        RISEN.ladder.forEach((s) => s.show(true));
        api.sfx('build'); api.servant(p, 3);
        api.toast('🔨 The Builder made steps up the city wall!', 2500);
      }
    });

    // --- garden terrace stumps (fragment 3) ---
    [[11, 34, 1.2], [13, 31, 2.4], [11.5, 28, 3.6]].forEach(([x, z, h]) => api.stump(x, z, h, 0.9));
    api.fragment({ x: 11.5, z: 28, y: api.terrain(11.5, 28) + 3.6 + 1.4 });

    // --- the disciples' house in the city ---
    const hx = RISEN.HOUSE[0], hz = RISEN.HOUSE[1];
    RISEN.house=api.box({ x: hx, z: hz - 4, w: 10, d: 6, h: 4, color: 0xd8c39c });
    const door = new T.Mesh(new T.BoxGeometry(1.4, 2.2, 0.1), api.mat(0x3f2a16)); door.position.set(hx, api.terrain(hx, hz) + 1.1, hz - 0.95); api.add(door);
    RISEN.town=[[-12, -30, 6, 6, 3.6], [12, -28, 6, 7, 3.4], [-12, -40, 6, 6, 4]].map(([x,z,w,d,h])=>({x,z,w,d,h,box:api.box({x,z,w,d,h,color:0xd1bb92})}));
    RISEN.doorZone = api.zone({
      x: hx, z: hz + 1.2, r: 1.8, time: 0.4, color: 0xfacc15, hidden: true,
      onDone(helpers) {
        api.task('tell');
        helpers.forEach((p) => api.servant(p, 6, 'for running to tell the good news!'));
        api.toast('🏠 "He is risen!" The disciples hear the news!', 3000);
      }
    });

    risenCity(api);
    risenClaudeDetails(api);
    RISEN.houseView=api.camZone({minX:-17,maxX:17,minZ:-44,maxZ:-23,yaw:.18,height:9,back:18,focus:[0,2,-36],pull:.25});

    // Dawn belongs to the morning, independently of any delivered jar or task.
    const sun = new T.Mesh(new T.SphereGeometry(6, 20, 14), new T.MeshBasicMaterial({ color: 0xffe08a, fog: false }));
    sun.position.set(30, -8, -120); api.add(sun);
    RISEN.sun = sun;
    RISEN.sunLight=new T.HemisphereLight(0xfff0d3,0x6c775f,0);api.add(RISEN.sunLight);
    RISEN.dawnT=0;

    // --- Golden Scroll challenge course along the valley side, over the brook ---
    api.course([
      { x: -14.4, z: 14, top: 1.77, kind: 'block' },
      { x: -13.6, z: 10.6, top: 2.77, kind: 'float' },
      { x: -14.4, z: 7.2, top: 3.67, kind: 'crumble' },
      { x: -13.6, z: 3.8, top: 4.47, kind: 'crumble' },
      { x: -14.4, z: 0.4, top: 4.67, kind: 'float' },
      { x: -13.6, z: -3, top: 4.97, kind: 'spring' },
      { x: -14.4, z: -6.4, top: 9.17, kind: 'float' },
      { x: -13.6, z: -9.8, top: 9.77, kind: 'crumble' },
      { x: -14.4, z: -13.2, top: 10.37, kind: 'float' }
    ]);

    api.leaves([[0, 36], [-2, 30], [2, 26], [0, 18], [2, 12], [0, 6], [-2, 0], [0, -2], [0.8, -4.4, 0.4], [0.6, -7.6, 0.4],
      [0, -14], [0, -24], [-2, -30], [13, 31, 3.2], [-12, -17.6, 3.6]]);
  },

  update(api, dt) {
    RISEN.elapsed+=dt;
    risenPoses(api,dt);
    if(RISEN.entry&&!RISEN.entry.done&&api.activePlayers().some(p=>p.pos.z<44)){
      RISEN.entry.done=true;api.checkpoint({x:0,z:42,label:'Tomb garden'});api.toast('Follow the spice jars to the empty tomb.',3000);
    }
    // the news at the empty tomb
    if (!RISEN.news && api.taskDone('spices') && api.players().every(p=>!p.bubble&&Math.hypot(p.pos.x-RISEN.TOMB[0],p.pos.z-RISEN.TOMB[1])<8)) {
      RISEN.news = true;
      RISEN.angels.forEach((a) => { a.visible = true; });
      RISEN.cloth.visible=true;
      api.music(false);
      api.posePerson(RISEN.angels[0].userData.man,{dt:0,expression:'listen',grip:[null,[.44,.92,.32]]});
      RISEN.women.forEach(m=>api.posePerson(m,{dt:0,expression:'wonder',headPitch:0}));
      api.story([
        { scene:'tomb', art: '🪨', title: 'The stone was rolled away', text: 'And they found the stone rolled away from the sepulchre. And they entered in, and found not the body of the Lord Jesus.', ref: 'Luke 24:2–3' },
        { scene:'tomb', art: '🎉', title: 'He is risen!', text: 'Why seek ye the living among the dead? He is not here, but is risen:', ref: 'Luke 24:5–6' },
        { scene:'tomb', art: '🙌', title: 'JESUS IS ALIVE!', text: 'Jesus really died on the cross and was buried. On the third day He rose bodily from the dead, just as He promised. He appeared to His disciples and showed them His hands and feet (Luke 24:36–40).' }
      ], () => { api.toast('📣 Run! Tell the disciples the good news! Follow the golden arrow to their house in the city.', 4000);
        RISEN.doorZone.show(true);
        LEVEL.music = RISEN.JOY; LEVEL.musicFile = 'sounds/music-7-5-joy.ogg'; api.music(false); api.music(true);    // joyful music
        RISEN.readNews=true;
      });
    }
    // morning comes: the sun climbs and the light grows
    if (RISEN.dawnT >= 0) {
      const k = Math.min(1, RISEN.elapsed / 8);
      RISEN.sun.position.y = -8 + k * 40;
      RISEN.sunLight.intensity = k * 0.55;
    }

    // celebration at the end
    if (RISEN.fireworks > 0) {
      RISEN.fireworks -= dt;
      if (Math.random() < dt * 6) {
        const cols = [0xf43f5e, 0xfacc15, 0x22c55e, 0x3b82f6, 0xa855f7, 0xffffff];
        api.puff(RISEN.HOUSE[0] - 8 + Math.random() * 16, 8 + Math.random() * 6, RISEN.HOUSE[1] - 4 + Math.random() * 4, cols[Math.floor(Math.random() * cols.length)], 14);
        api.sfx('pop');
      }
    }
  },

  storyScene(api,page) {
    RISEN.readingScene=page&&page.scene||null;
    if(RISEN.tombView)Object.assign(RISEN.tombView,page&&page.scene==='tomb'?{yaw:-.18,height:8,back:18,focus:[0,1.8,20.8],pull:.45}:{yaw:-.18,height:8,back:16,focus:[-9,1.8,20.8],pull:.3});
  },

  objective(api) {
    const ps = api.activePlayers();
    if (!ps.length) return null;
    if(RISEN.entry&&!RISEN.entry.done){const p=ps[0],next=RISEN.entry.route.find(r=>p.pos.z>r[2]+1);return next||[0,api.terrain(0,42)+1,42];}
    if (ps.some((p) => p.holding)) return [RISEN.TOMB[0], 1.5, RISEN.TOMB[1]];
    const cx = ps.reduce((s, p) => s + p.pos.x, 0) / ps.length, cz = ps.reduce((s, p) => s + p.pos.z, 0) / ps.length;
    const jar = RISEN.spices.filter((j) => !j.delivered && !j.holder).sort((a, b) => Math.hypot(a.x - cx, a.z - cz) - Math.hypot(b.x - cx, b.z - cz))[0];
    if (jar) return [jar.x, jar.y + 1, jar.z];
    if(!RISEN.news&&api.taskDone('spices'))return [RISEN.TOMB[0],api.terrain(...RISEN.TOMB)+1.5,RISEN.TOMB[1]];
    return [RISEN.HOUSE[0], api.terrain(RISEN.HOUSE[0], RISEN.HOUSE[1]) + 1.5, RISEN.HOUSE[1] + 1];
  },

  finale: {
    message: '🏠 Everyone gather at the disciples\' house!',
    beacon: [0, 4, -35],
    inZone(p) { return Math.hypot(p.pos.x - RISEN.HOUSE[0], p.pos.z - (RISEN.HOUSE[1] + 2)) < 5.5; },
    onUpdate(api, t) {
      if(!RISEN.gathered){const ps=api.players();if(!ps.length||!ps.every(p=>!p.bubble&&LEVEL.finale.inZone(p)))return false;RISEN.gathered=true;api.finishCaption(false,false);}
      if (t > 0.5 && !RISEN.told) {
        RISEN.told = true;
        RISEN.fireworks = api.settings.gentle?0:8;
        RISEN.disciples.forEach(m=>api.posePerson(m,{dt:0,expression:'wonder'}));
        api.story([
          { scene:'house', art: '🏠', title: 'They told the disciples', text: 'And returned from the sepulchre, and told all these things unto the eleven, and to all the rest.', ref: 'Luke 24:9' },
          { art: '📜', title: 'The good news', text: 'For I delivered unto you first of all that which I also received, how that Christ died for our sins according to the scriptures; And that he was buried, and that he rose again the third day according to the scriptures:', ref: '1 Corinthians 15:3–4' },
          { art: '🐍', title: 'The first promise kept', text: 'Remember God\'s very first promise in the garden, that a Son of Eve would crush the serpent\'s head? Jesus did it! He beat sin and death.' },
          ...(api.shownRef('John 11:25') ? [] : [{ art: '🌱', text: 'Jesus said unto her, I am the resurrection, and the life: he that believeth in me, though he were dead, yet shall he live:', ref: 'John 11:25' }]),
          { art: '💛', title: 'Good news for you', text: 'Anyone who trusts Jesus is forgiven and becomes part of God\'s family, forever. It is a gift. We can never earn it, not with points or good deeds.' },
          { art: '🎁', text: 'For by grace are ye saved through faith; and that not of yourselves: it is the gift of God:', ref: 'Ephesians 2:8' }
        ], () => { RISEN.endT = api.time; api.sfx('win'); });
      }
      return RISEN.endT !== undefined && api.time - RISEN.endT > 3;
    }
  }
};


function risenOlive(api,x,z,s) {
  const T=api.THREE,t=api.tree(x,z,s,0x758664);t.clear();t.scale.setScalar(1);const g=new T.Group(),wood=api.texMat(0x7e745f,'wood'),leaf=api.texMat(0x7c916b,'leaves');
  for(const [a,b,r]of [[[0,0,0],[.1,2,0],.28],[[.1,1.3,0],[-.9,2.7,.2],.16],[[.1,1.6,0],[1,2.9,-.2],.15],[[.1,1.8,0],[0,3.3,.6],.14]]){const v=new T.Vector3(...b).sub(new T.Vector3(...a)),m=new T.Mesh(new T.CylinderGeometry(r*.45,r,v.length(),8),wood);m.position.copy(new T.Vector3(...a).add(new T.Vector3(...b)).multiplyScalar(.5));m.quaternion.setFromUnitVectors(new T.Vector3(0,1,0),v.normalize());g.add(m);}
  [[-.9,2.9,.2],[1,3,-.2],[0,3.5,.6],[.1,3,-.7]].forEach(([a,b,c])=>{const m=new T.Mesh(new T.SphereGeometry(1.3,12,8),leaf);m.scale.set(1,.48,.85);m.position.set(a,b,c);g.add(m);});g.scale.setScalar(s);api.scenery(g);t.add(g);return t;
}
function risenTomb(api) {
  const T=api.THREE,g=new T.Group();g.name='recessed-empty-tomb';g.position.set(-9,api.terrain(-9,16),20);
  const rock=api.texMat(0xb2a58e,'stone'),dark=api.mat(0x302f2b);
  const box=(x,y,z,w,h,d,mat)=>{const m=new T.Mesh(new T.BoxGeometry(w,h,d),mat);m.position.set(x,y,z);g.add(m);return m;};
  // An actual shallow reveal in front of the original solid hill. The door is a view, not a new passage.
  box(0,1.12,.035,2.25,2.24,.035,dark);box(0,.035,.42,2.25,.07,.8,api.texMat(0x9e947f,'stone'));
  for(const sd of [-1,1]){box(sd*1.13,.55,.42,.16,1.1,.8,rock);for(let i=0;i<3;i++)box(sd*1.5,.25+i*.42,.22,.65,.38,.42,rock);}
  // Vault segments reveal their depth. No black disc painted over the facade.
  for(let i=0;i<11;i++){const a=i*Math.PI/11,b=(i+1)*Math.PI/11,sh=new T.Shape();sh.moveTo(Math.cos(a)*1.08,1.12+Math.sin(a)*1.08);sh.lineTo(Math.cos(b)*1.08,1.12+Math.sin(b)*1.08);sh.lineTo(Math.cos(b)*1.48,1.12+Math.sin(b)*1.48);sh.lineTo(Math.cos(a)*1.48,1.12+Math.sin(a)*1.48);sh.closePath();const m=new T.Mesh(new T.ExtrudeGeometry(sh,{steps:1,depth:.8,bevelEnabled:false}),rock);m.position.z=.04;g.add(m);}
  // Larger limestone shoulders stay inside the old climbable hill footprint.
  for(const [x,y,z,sx,sy,sz]of [[-2.6,1.4,.1,.8,1.6,.5],[2.6,1.35,.1,.8,1.55,.5],[-2,2.7,-.1,1,.6,.5],[1.9,2.7,-.1,1,.6,.5],[0,3.15,-.3,1.8,.45,.6]]){const m=new T.Mesh(new T.DodecahedronGeometry(1,1),rock);m.scale.set(sx,sy,sz);m.position.set(x,y,z);g.add(m);}
  [[-2,3.25,-.9,.65,.65,.38],[1.9,3.35,-.9,.65,.6,.38],[-1.3,4.15,-2,.65,.6,.38],[1.25,4.25,-2,.6,.55,.38],[0,4.8,-2.05,1.4,.55,.45]].forEach(([x,y,z,a,b,c])=>{const m=new T.Mesh(new T.DodecahedronGeometry(1,1),rock);m.scale.set(a,b,c);m.position.set(x,y,z);g.add(m);});
  // A small visible linen fold points to the empty tomb without showing a body.
  const cloth=new T.Group();cloth.name='grave-clothes';cloth.position.copy(g.position);for(const[x,y,z,w,h,d,c]of [[.22,.22,.08,1.15,.18,.15,0xd9d1bc],[.48,.33,.11,.45,.08,.19,0xe9e1ce]]){const m=new T.Mesh(new T.BoxGeometry(w,h,d),api.texMat(c,'cloth'));m.position.set(x,y,z);cloth.add(m);}api.scenery(cloth);cloth.visible=false;RISEN.cloth=cloth;
  api.scenery(g);RISEN.tombDress=g;
  const stone=new T.Mesh(new T.CylinderGeometry(1.5,1.5,.5,28),api.texMat(0xb3a58b,'stone'));stone.rotation.x=Math.PI/2;stone.position.set(-5.6,1.5,20.6);stone.name='rolled-tomb-stone';stone.userData.landmark='rolled-stone';stone.castShadow=true;api.add(stone);RISEN.stone=stone;
  const rim=new T.Mesh(new T.TorusGeometry(1.27,.025,5,32),api.mat(0x93856f));rim.position.set(-5.6,1.5,20.86);api.add(rim);
  const light=new T.PointLight(0xffe9ba,.3,7,2);light.position.set(-9,3,23);api.add(light);
}
function risenJarDetail(api,g) {
  const T=api.THREE,details=new T.Group(),mat=api.texMat(0xb88d61,'clay');
  for(const sd of [-1,1]){const h=new T.Mesh(new T.TorusGeometry(.17,.045,6,12),mat);h.position.set(sd*.31,.05,0);h.rotation.y=Math.PI/2;details.add(h);}
  const band=new T.Mesh(new T.TorusGeometry(.31,.025,5,18),api.texMat(0x927355,'weave'));band.rotation.x=Math.PI/2;band.position.y=.18;details.add(band);api.scenery(details);g.add(details);
}
function risenCity(api) {
  const T=api.THREE,g=new T.Group();g.name='jerusalem-morning-stonework';const stone=api.texMat(0xc5b494,'stone'),wood=api.texMat(0x866a49,'wood');
  const box=(x,y,z,w,h,d,m=stone)=>{const mesh=new T.Mesh(new T.BoxGeometry(w,h,d),m);mesh.position.set(x,y,z);g.add(mesh);return mesh;};
  for(const side of [-1,1])for(let row=0;row<6;row++)for(let i=0;i<7;i++){const x=side*(5.1+i*1.7+.8);if(Math.abs(x)>16.7)continue;box(x,api.terrain(side*11,-20)+.4+row*.73,-19.16,1.62,.67,.10);}
  for(const x of [-5.15,5.15])box(x,api.terrain(x,-20)+2.3,-19.08,.25,4.6,.18);
  // Roof trim lies on the old roofs; windows and doors hug their original walls.
  [[-12,-30,6,6,3.6],[12,-28,6,7,3.4],[-12,-40,6,6,4],[0,-40,10,6,4]].forEach(([x,z,w,d,h])=>{const y=api.terrain(x,z);box(x,y+h+.04,z,w-.12,.08,d-.12);for(const sd of [-1,1])box(x+sd*(w/2-.35),y+h-.28,z+d/2+.04,.22,.5,.1);if(x){box(x,y+1.3,z+d/2+.035,1.3,2.6,.06,wood);for(const dx of [-w*.28,w*.28])box(x+dx,y+2.5,z+d/2+.04,.65,.75,.08,wood);}});
  for(const x of [-.86,.86])box(x,api.terrain(0,-36)+1.15,-36.94,.2,2.3,.17);box(0,api.terrain(0,-36)+2.4,-36.94,1.94,.2,.17);
  for(let i=0;i<8;i++)for(let j=0;j<4;j++){const x=(j-1.5)*1.8,z=-23-i*1.65;box(x,api.terrain(x,z)+.018,z,1.73,.025,1.57,api.texMat((i+j)%3?0xb7a789:0xc2b397,'paving'));}
  api.scenery(g);RISEN.cityDress=g;
  RISEN.disciples=[[3.6,-33.4,0x6b5a45],[5.2,-34.6,0x4b5f6b],[-3.8,-33.6,0x7a4e2c]].map(([x,z,robe])=>{const m=api.storyPerson(robe,0xe2d6b8,1.02,{beard:true,register:false});m.position.set(x,api.terrain(x,z),z);m.rotation.y=Math.atan2(-x,6);api.add(m);return m;});
}
function risenPoses(api,dt) {
  const joy=!!RISEN.readNews,ps=api.activePlayers();
  if(joy&&!RISEN.womenGone&&ps.length&&ps.every(p=>p.pos.z<-12)){RISEN.womenGone=true;RISEN.women.forEach((m,i)=>{const[x,z]=RISEN.womenPlaces[i];m.position.set(x,api.terrain(x,z),z);m.rotation.y=Math.atan2(-x,-2);});}
  RISEN.women.forEach(m=>api.posePerson(m,{dt,expression:joy?'wonder':'worry',headPitch:joy?0:.2}));
  RISEN.angels.forEach((m,i)=>api.posePerson(m.userData.man,{dt,expression:'listen',grip:RISEN.news&&i===0?[null,[.44,.92,.32]]:null}));
  RISEN.disciples.forEach(m=>api.posePerson(m,{dt,expression:api.taskDone('tell')?'wonder':'worry',headPitch:api.taskDone('tell')?0:.06}));
  if(RISEN.guide)api.posePerson(RISEN.guide,{dt,expression:joy?'wonder':'calm'});
}
function risenClaudeDetails(api) {
  const T=api.THREE,g=new T.Group();g.name='resurrection-retained-details';
  const box=(x,y,z,w,h,d,c,tex)=>{const m=new T.Mesh(new T.BoxGeometry(w,h,d),api.texMat(c,tex||'stone'));m.position.set(x,y,z);g.add(m);};
  const ty=api.terrain(-9,20);box(-7.2,ty+.08,20.6,6.2,.18,.7,0x7f7466);
  [[-11.8,4.1,13],[-6.4,4.1,17.6],[-9.6,5.1,14.2],[-12,2.7,18.6],[-6.2,2.7,13.4]].forEach(([x,y,z],i)=>{const m=new T.Mesh(new T.SphereGeometry(.45+(i%2)*.15,8,6),api.mat(0x5e8a46));m.position.set(x,ty+y,z);m.scale.y=.6;g.add(m);});
  const wy=api.terrain(-11,-20)+4.6;for(let x=-16.5;x<=16.6;x+=1.5)if(Math.abs(x)>5.2)box(x,wy+.27,-20,.7,.55,1.6,0xa8916a);
  RISEN.house.mesh.material=api.texMat(0xdcc7a0,'clay');RISEN.town.forEach(t=>t.box.mesh.material=api.texMat(0xdcc7a0,'clay'));
  api.scenery(g);
  [['CommonTree_3',-15.6,31,4.4],['CommonTree_1',15.4,16,4.2],['CommonTree_5',-15.4,-28,4.6]].forEach(([name,x,z,h])=>{const m=api.model(name,h);if(!m)return;const t=new T.Group();t.position.set(x,api.terrain(x,z),z);t.add(m);api.add(t);api.fadeScenery(t,2.4);});
  const guide=api.storyPerson(0x5a6b3a,0xe9dcbc,.96,{});guide.position.set(4.6,api.terrain(4.6,40),40);guide.rotation.y=-.6;api.add(guide);RISEN.guide=guide;
  RISEN.guideTalk=api.conversation({person:guide,speaker:'A woman with spices',label:'Talk with her',clue(api){
    if(!api.taskDone('spices')){const j=RISEN.spices.find(x=>!x.delivered&&!x.holder);return{text:'We are bringing spices to the tomb. Can you help carry a jar?',at:j?[j.x,j.y+1,j.z]:[RISEN.TOMB[0],1.5,RISEN.TOMB[1]]};}
    if(!RISEN.readNews)return{text:'Gather everyone beside the empty tomb to hear the news.',at:[RISEN.TOMB[0],1.5,RISEN.TOMB[1]]};
    if(!api.taskDone('tell'))return{text:'He is not here: He is risen! Run and tell the disciples in the city!',at:[RISEN.HOUSE[0],api.terrain(...RISEN.HOUSE)+1.5,RISEN.HOUSE[1]+1]};
    return{text:'He is risen!'};
  }});
}
