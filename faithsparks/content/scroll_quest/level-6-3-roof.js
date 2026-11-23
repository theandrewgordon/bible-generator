/* =====================================================================
 * LEVEL 6-3: THROUGH THE ROOF  (Mark 2:1-12)
 * ---------------------------------------------------------------------
 * Capernaum, by the Sea of Galilee. Linear walk toward -z:
 *   Market streets (z 38..-16)  lead the four friends and their sick friend; rooftop route;
 *                               the lake (Fisherman); scaffolding by a tower (Builder)
 *   The house      (z -22..-35) the crowd blocks the door; outside stairs up to the roof
 * One idea: the crowd blocks the door, so find another way: up and through the roof.
 * Tasks: bring the friends to the house, prepare the way up (clear the basket and
 * secure two timber catches) and WATCH the friends climb a little higher after each job;
 * when they reach the roof, open it (lift 3 roof sections aside). That is the payoff.
 * The rooftop route at the start (hop house to house, the camera shows the gaps from the side) teaches
 * the jumps the family needs; the scaffolding and the boat are role secrets.
 * Jesus is inside the house and is never shown: we see the light through the opening
 * and hear His words in the story cards. Jesus forgives and heals; the kids only help.
 * Includes a shared market lift, optional pantry and rope routes. See GEMINI.md and CAMPAIGN.md.
 * ===================================================================== */

const ROOF = {
  friends: null,
  tiles: [],
  crowd: [],
  carriers: [],
  houses: [],
  lowerRopes: [],
  scaffold: [],
  hole: null,
  light: null,
  mat: null,
  healed: null,
  TOP: 4.2,                    // roof height of the house
  HOUSE: { x: 0, z: -30, w: 10, d: 9 },
  STACK: [-3.6, -33.6],        // where the roof sections are piled
  ROOFSPOT: [1.5, -27.6],      // where the friends wait on the roof
  STAIRS: [6.4, -22.5],
  FRONT: [3.5, -20.3],         // where the friends first stop: the door is packed
  baskets: [],
  landings: [],
  steps: [],                   // the two broken steps (shown when the planks are brought)
  path: [],                    // the friends' climb: front -> stair foot -> each step -> roof
  at: -1,                      // last path point reached
  goal: -1,                    // how far up they may go (grows as each job is done)
  onRoof: false,
  // how far up the friends may go: nowhere until they reach the house, the broken step while the
  // baskets are cleared, one step higher per plank, the roof when both steps are mended
  setGoal() {
    if (ROOF.friends.state !== 'parked' && ROOF.friends.state !== 'delivered') return;
    if (!ROOF.baskets.every((it) => it.delivered)) { ROOF.goal = Math.max(ROOF.goal, 0); return; }
    const n = ROOF.landings.filter((it) => it.secured).length;
    ROOF.goal = n === 2 ? ROOF.path.length - 1 : 4 + n;
  }
};

const LEVEL = {
  id: '6-3',
  bibleConnection: {"passage": "Mark 2:1–12", "text": "Friends opened a roof to bring a paralyzed man to Jesus. Jesus forgave his sins and healed him, showing His authority. Our stairs and roof puzzle explore the friends’ effort; Jesus’ saving and healing power is His own."},
  world: 'World 6-4',
  title: 'Through the Roof',
  artDirection:{textureStrength:.32,storyPlants:18,ambientCount:20,checkpointSigns:false,doorColors:[0x527477,0x80624c,0x697456],clothColors:[0xa3654f,0x527586,0x72815a,0xbc9a61]},
  decor:{grass:45,flowers:8,pebbles:12,plants:false},
  town: true,                 // houses get doors, windows, awnings (engine house kit)
  leafIcon: '🍞',
  leafColor: 0xd6a35c,
  leafShape: 'round',
  spawn: [-2, 76],
  bounds: { minX: -19, maxX: 19, minZ: -40, maxZ: 80 },
  finishTheme: 'rooftop',
  startMessage: 'Climb the market crates. Ride the timber lift and open the stairway for friends.',
  onCallText() { if (ROOF.saidCall) return ''; ROOF.saidCall = true; return 'The four friends follow you with their friend on his mat!'; },

  intro: [
    { text: 'And straightway many were gathered together, insomuch that there was no room to receive them, no, not so much as about the door: and he preached the word unto them.', ref: 'Mark 2:2' },
    { text: 'When Jesus saw their faith, he said unto the sick of the palsy, Son, thy sins be forgiven thee.', ref: 'Mark 2:5' }
  ],

  introStory: [
    { art: '🏘️', title: 'Jesus is in Capernaum', text: 'And again he entered into Capernaum after some days; and it was noised that he was in the house.', ref: 'Mark 2:1' },
    { art: '🤝', text: 'A man could not walk. Four friends carried him to Jesus, but the doorway was packed. Stay together and help them find a way up!' },
    {art:'🧩',title:'Just for our game',text:'Our market roofs, lift and timber catches are imagined. The friends brought the man to Jesus. Jesus forgave and healed him by His own authority.'}
  ],

  tasks: [
    { id: 'friends', icon: '🛏️', label: 'Bring the friends to the house, then the roof', total: 2 },
    { id: 'way', icon: '🪜', label: 'Clear the stairs and secure both landings', total: 3 },
    { id: 'roof', icon: '🧱', label: 'Open the roof', total: 3 }
  ],

  memoryVerse: { text: 'When Jesus heard it, he saith unto them, They that are whole have no need of the physician, but they that are sick: I came not to call the righteous, but sinners to repentance.', ref: 'Mark 2:17' },

  ending: {
    verse: { text: 'When Jesus saw their faith, he said unto the sick of the palsy, Son, thy sins be forgiven thee.', ref: 'Mark 2:5' },
    message: 'Jesus has authority to forgive sins. The man got up, carried his bed and walked out.'
  },

  quiz: [
    { q: 'Why couldn\'t the friends go in through the door?', ref: 'Mark 2:2', options: ['The door was locked', 'There was no room: the crowd was too big', 'Jesus was asleep'], answer: 1 },
    { q: 'What did Jesus say FIRST to the sick man?', ref: 'Mark 2:5', options: ['"Son, thy sins be forgiven thee"', '"Go home"', '"Wait outside"'], answer: 0 },
    { q: 'What did the man do after Jesus healed him?', ref: 'Mark 2:12', options: ['He stayed lying down', 'He took up his bed and went out', 'He climbed back onto the roof'], answer: 1 }
  ],

  music: {
    bpm: 104,
    notes: [64, 0, 67, 69, 71, 0, 69, 67, 64, 0, 62, 0, 64, 0, 0, 0,
            67, 0, 71, 72, 74, 0, 72, 71, 69, 0, 67, 0, 64, 0, 0, 0],
    bass: [40, 40, 45, 45, 43, 43, 40, 40]
  },


  /* ---------- ground shape ---------- */
  terrain(x, z) {
    let h = Math.sin(x * 0.4) * Math.cos(z * 0.3) * 0.1;
    if (x > 12 && z < 30 && z > -14) h -= 2.6 * Math.min(1, (x - 12) / 1.5);   // the Sea of Galilee
    return h;
  },

  groundColor(x, z, h) {
    if (h < -1) return 0x2b7bc0;
    if (x > 11 && z < 30 && z > -14) return 0xd9c79b;                    // shore
    if(Math.abs(x)<5)return 0xb8a681;
    return Math.sin(x*.14+z*.07)>.2?0xc2b18d:0xb5a380;   // broad plaster and worn paving tones
  },

  /* ---------- build ---------- */
  build(api) {
    const T = api.THREE;
    // A forward market-roof approach: climb, operate the lift, jump the awnings, explore a pantry.
    const step=(x,z,top,w=4,d=2.6)=>api.box({x,z,y:0,w,d,h:top,color:0xa97b48,tex:'wood',house:false});
    [[-2,69,.8],[-2,66.5,1.6],[-2,64,2.4]].forEach(([x,z,h])=>step(x,z,h));
    step(-2,62,2.4,5,3);step(3,59,4.8,4,5);
    ROOF.liftShortcut=[step(2,63,3.2,2.5,2.2),step(3,61,4,2.5,2.2)];ROOF.liftShortcut.forEach(h=>h.show(false));
    ROOF.marketLift=api.teamLift({x:-2,z:59,bottom:2.4,top:4.8,w:5,d:4.2,control:[-4,2.4,62],release:[3,4.8,59],releaseLabel:'Unhook the market stairway',
      onLatch(){ROOF.liftShortcut.forEach(h=>h.show(true));ROOF.marketGate.show(false);api.checkpoint({x:3,y:4.8,z:59,label:'Market rooftop'});}
    });
    api.box({x:3,z:52.5,w:4,d:5,y:3.8,h:.3,color:0xa45772,tex:'cloth',house:false});
    step(0,46,3.3,5,5);step(0,40,2.1,5,3);step(0,37,1,5,2.5);
    for(const x of [-12,12])api.box({x,z:38.5,w:14,d:.5,h:5.5,color:0xc9b38d,tex:'brick',house:false});
    ROOF.marketGate=api.box({x:0,z:38.5,w:10,d:.4,h:5.5,color:0x956b3f,tex:'wood',house:false});
    ROOF.ropeKit=api.ropeKit({x:4,z:57.5,y:4.8});
    ROOF.pantry=api.secretPocket({id:'market-pantry',name:'The market pantry',x:-7,z:46,y:3.3,w:5,d:5,fragment:true});
    // Both a short swing and a harder ordinary jump route lead to the optional room.
    api.box({x:-7,z:50,w:3,d:2,y:2.7,h:.3,color:0xb88953,tex:'wood',house:false});
    api.box({x:-3.5,z:50,w:3,d:2,y:2.7,h:.3,color:0xb88953,tex:'wood',house:false});
    ROOF.pantryRope=api.ropeAnchor({from:[0,3.3,46],to:[-7,3.3,46],arc:3.5,label:'Swing into the pantry'});
    api.ropeAnchor({from:[-7,3.3,46],to:[0,3.3,46],arc:3.5,label:'Swing back to the rooftops'});
    api.leaves([[-2,72],[-2,69,1.8],[-2,66.5,2.6],[-2,64,3.4],[3,59,5.8],[3,52.5,5.1],[0,46,4.3],[0,40,3.1],[0,37,2]]);
    ROOF.dash=api.teamTrial({id:'market-dash',start:[3,4.1,52.5],stages:[[0,3.3,46,2.3],[0,2.1,40,2.2],[0,api.terrain(0,34),34,2.3]],seconds:24,label:'Try the optional rooftop dash',available:()=>ROOF.marketLift.latched});
    api.camZone({minX:-13,maxX:8,minZ:36,maxZ:80,yaw:.55,height:10,back:15,focus:[-1,3,54],pull:.35});

    const sand = 0xd6c4a0, roofCol = 0xb8a07a;

    // --- village houses along the street (solid; the left row is the rooftop route) ---
    const house = (x, z, w, d, h) => {
      const b = api.box({ x, z, w, d, h, color: sand });
      const lip = new T.Mesh(new T.BoxGeometry(w + 0.2, 0.2, d + 0.2), api.texMat(roofCol,'paving'));
      lip.position.set(x, api.terrain(x, z) + h, z); api.add(lip);
      const door = new T.Mesh(new T.BoxGeometry(1, 1.8, 0.1), api.texMat(0x6a5541,'wood'));
      door.position.set(x + (x < 0 ? w / 2 + 0.01 : -w / 2 - 0.01), 0.9, z); door.rotation.y = Math.PI / 2; api.add(door);
      roofHouseTrim(api,b,{x,z,w,d,h});ROOF.houses.push(b);return b;
    };
    [[30, 2.4], [22.5, 3.4], [15, 4.4], [7.5, 5.4]].forEach(([z, h]) => house(-11, z, 5, 6, h));   // rooftop route (gaps of 1.5)
    api.camZone({ minX: -14.5, maxX: -7.5, minZ: 5, maxZ: 36, yaw: 0.95, height: 8.5, back: 13, focus: [-11, 4, 12], pull: 0.25 });   // the gaps from the side
    house(-11, -3, 5, 7, 3.5);
    house(8, 30, 5, 6, 3.2);
    house(8, -8, 5, 6, 3.2);
    api.box({ x: -8, z: 35.5, w: 1.4, h: 1.2, d: 1.4, color: 0x9c6b36 });   // crates to start the rooftop climb
    api.box({ x: -9.2, z: 34.2, w: 1.4, h: 2.0, d: 1.4, color: 0x8b5e34 });
    api.discovery({id:'street-rooftops',name:'The high street route',x:-11,y:api.terrain(-11,7.5)+5.4,z:7.5,r:2});

    // market stalls make the street zig-zag
    [[3,20,0xa3654f],[-3,11,0x527586],[3.5,2,0x72815a],[-3,-8,0xbc9a61]].forEach(([x, z, cloth]) => {
      api.box({ x, z, w: 4, h: 1, d: 1.6, color: 0x8b5e34 });
      const cg=new T.PlaneGeometry(4.4,2.2,12,6),cp=cg.attributes.position;for(let i=0;i<cp.count;i++)cp.setZ(i,-.14*Math.cos(cp.getX(i)*Math.PI/4.4));cg.computeVertexNormals();
      const cm=api.texMat(cloth,'cloth').clone();cm.side=T.DoubleSide;const awning=new T.Mesh(cg,cm);awning.rotation.x=-Math.PI/2;awning.castShadow=true;awning.position.set(x,2.3,z);api.add(awning);
      [-1.9, 1.9].forEach((dx) => { const pole = new T.Mesh(new T.CylinderGeometry(0.06, 0.06, 2.3, 5), api.mat(0x5c3d22)); pole.position.set(x + dx, 1.15, z + 0.9); api.add(pole); });
    });

    // --- the lake and a fishing boat (Fisherman nets fragment 2) ---
    const lake = new T.Mesh(new T.PlaneGeometry(8, 44), new T.MeshLambertMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.8 }));
    lake.rotation.x = -Math.PI / 2; lake.position.set(16, -0.7, 8); api.add(lake);
    api.hazard({ x: 16, z: 8, w: 8, d: 44 }, { maxY: -0.6, except: (p) => p.role.id === 'fisherman', msg: 'Splash! The Sea of Galilee is deep here (the Fisherman can wade).' });
    const boat = new T.Mesh(new T.BoxGeometry(2, 0.7, 4.5), api.mat(0x7a5230));
    boat.position.set(16.5, -0.4, 4); api.add(boat);
    api.fragment({ x: 16.5, z: 4, y: 0.6, net: true });

    // --- tower with scaffolding the Builder can put up (fragment 3) ---
    api.box({ x: -12, z: -16, w: 3, h: 6.2, d: 3, color: 0xcbb994 });
    api.fragment({ x: -12, z: -16, y: 6.2 + 1.3 });
    [[-9.4, -14, 1.1], [-9.4, -16.4, 2.4], [-9.4, -18.8, 3.7], [-11.6, -19.2, 5.0]].forEach(([x, z, top]) =>
      ROOF.scaffold.push(api.box({ x, z, w: 1.8, h: 0.35, d: 1.8, y: top - 0.35, hidden: true, color: 0xa0703c })));
    const planks = new T.Mesh(new T.BoxGeometry(1.4, 0.4, 2), api.mat(0xa0703c));
    planks.position.set(-8, 0.2, -12.5); api.add(planks);
    api.interact({
      x: -8, z: -12.5, r: 2.4, vRange: 3, label: 'Build scaffolding',
      can: (p) => (p.role.id === 'builder' ? true : 'A pile of planks. The Builder could put up scaffolding here (Tab / RB to switch).'),
      use(p) {
        this.remove(); planks.visible = false;
        ROOF.scaffold.forEach((s) => s.show(true));
        api.sfx('build'); api.puff(-9.4, 2, -16.4, 0xa0703c, 12);
        api.servant(p, 3);                                               // (the planks appear: no pop-up)
      }
    });

    // --- the house where Jesus is ---
    const H = ROOF.HOUSE;
    const houseBody=api.box({x:H.x,z:H.z,w:H.w,d:H.d,h:ROOF.TOP,color:sand});ROOF.houseBody=houseBody;
    roofHouseTrim(api,houseBody,{x:H.x,z:H.z,w:H.w,d:H.d,h:ROOF.TOP});ROOF.houses.push(houseBody);
    const parapet = (x, z, w, d) => api.box({ x, z, w, d, h: 0.5, y: ROOF.TOP, color: roofCol });
    parapet(0, H.z - H.d / 2 + 0.15, H.w, 0.3);                        // back
    parapet(-H.w / 2 + 0.15, H.z, 0.3, H.d);                           // left
    parapet(-1.5, H.z + H.d / 2 - 0.15, 7, 0.3);                       // front (gap on the right for the stairs)
    const door = new T.Mesh(new T.BoxGeometry(1.4, 2.2, 0.1), api.mat(0x3f2a16));
    door.position.set(0, 1.1, H.z + H.d / 2 + 0.02); api.add(door);
    // outside stairs up the right side
    for (let i = 0; i < 8; i++) {      // 0.53 per step: walkable (friends can't jump); steps 4 and 5 are broken
      const b = api.box({ x: 6.3, z: -22.4 - i * 0.95, w: 1.8, h: (i + 1) * ROOF.TOP / 8, d: 0.95, color: i === 3 || i === 4 ? 0xd9b98a : 0xc2ad84, hidden: i === 3 || i === 4 });
      if (i === 3 || i === 4) ROOF.steps.push(b);
    }
    // broken bits lying under the gap
    [[7.6, -25.4, 0.5], [7.9, -26.3, -0.7]].forEach(([x, z, r]) => { const m = new T.Mesh(new T.BoxGeometry(0.9, 0.12, 0.3), api.mat(0x8b6b46)); m.position.set(x, 0.08, z); m.rotation.y = r; api.add(m); });
    // the friends' climb, point by point
    const gy = (x, z) => api.terrain(x, z);
    ROOF.path = [[ROOF.FRONT[0], gy(ROOF.FRONT[0], ROOF.FRONT[1]), ROOF.FRONT[1]], [6.3, gy(6.3, -21.2), -21.2]];
    for (let i = 0; i < 8; i++) ROOF.path.push([6.3, (i + 1) * ROOF.TOP / 8, -22.4 - i * 0.95]);
    ROOF.path.push([4.0, ROOF.TOP, -28.9], [ROOF.ROOFSPOT[0], ROOF.TOP, ROOF.ROOFSPOT[1]]);

    // job 1: baskets piled at the foot of the stairs (carry them to the wall across the alley)
    [[6.3, -21.1]].forEach(([x, z]) => {                               // a big basket of bread on the bottom step
      const g = new T.Group();
      const b = new T.Mesh(new T.CylinderGeometry(0.42, 0.32, 0.6, 10), api.mat(0xb7864a)); b.position.y = 0.05; g.add(b);
      const top = new T.Mesh(new T.SphereGeometry(0.34, 8, 6, 0, Math.PI * 2, 0, Math.PI / 2), api.mat(0xe0b354)); top.position.y = 0.3; g.add(top);
      ROOF.baskets.push(api.carryable({
        x, z, mesh: g, name: 'basket', dy: 1,
        deliverTo: { x: 10.2, z: -19.5, r: 1.8 },
        onDeliver(p) {
          api.task('way'); api.servant(p, 3); api.sfx('build');
          if (ROOF.baskets.every((it) => it.delivered)) ROOF.setGoal();      // (watch them start up: no pop-up)
        }
      }));
    });
    // Secure two timber catches during one climb instead of fetching two planks.
    [[6.3,-24.3,1.575],[6.3,-27.15,3.15]].forEach(([x,z,y],i)=>{
      const landing={secured:false,x,z,y};ROOF.landings.push(landing);
      const catchMesh=new T.Mesh(new T.BoxGeometry(.65,.16,.4),api.mat(0xcba25e));catchMesh.position.set(x+.45,y+.2,z);api.add(catchMesh);
      landing.inter=api.interact({x,z,y,r:1.25,vRange:.6,whileHolding:true,label:i?'Secure the upper landing':'Secure the lower landing',
        can:p=>!p.onGround?'Land on the step first.':i&&!ROOF.landings[0].secured?'Secure the lower landing first.':true,
        use(p){if(landing.secured)return;landing.secured=true;this.remove();ROOF.steps[i].show(true);catchMesh.rotation.z=Math.PI/2;api.task('way');api.sfx('build');ROOF.setGoal();}
      });
    });
    // the opening (shown when the roof sections are moved): dark hole with light from inside
    const hole = new T.Mesh(new T.PlaneGeometry(2.6, 2.6), new T.MeshBasicMaterial({ color: 0x1c1208 }));
    hole.rotation.x = -Math.PI / 2; hole.position.set(0, ROOF.TOP + 0.02, H.z); hole.visible = false; api.add(hole);
    ROOF.hole = hole;
    const beam = new T.Mesh(new T.CylinderGeometry(1.1, 1.3, 7, 12, 1, true), new T.MeshBasicMaterial({ color: 0xfff7d6, transparent: true, opacity: 0, side: T.DoubleSide, depthWrite: false }));
    beam.position.set(0, ROOF.TOP + 3.5, H.z); api.add(beam);
    ROOF.light = beam;
    // low rope fence around the opening so nobody falls in
    [[0, -31.6, 3.2, 0.1], [0, -28.4, 3.2, 0.1], [-1.6, -30, 0.1, 3.2], [1.6, -30, 0.1, 3.2]].forEach(([x, z, w, d]) => {
      const r = api.box({ x, z, w, d, h: 0.5, y: ROOF.TOP, color: 0xe7d8b0, hidden: true });
      roofRopeRail(api,r,w,d);   // appears when the roof is open
      ROOF.rope = (ROOF.rope || []).concat(r);
    });

    // roof sections (branches and clay) to carry to the pile in the corner
    const pile = [];
    for (let i = 0; i < 3; i++) {
      const s = new T.Mesh(new T.BoxGeometry(1.5, 0.2, 1.3), api.mat(0x9c7b52));
      s.position.set(ROOF.STACK[0], ROOF.TOP + 0.11 + i * 0.21, ROOF.STACK[1]); s.visible = false; api.add(s);
      pile.push(s);
    }
    [[0, -31.2], [-1.2, -29.4], [1.2, -29.4]].forEach(([x, z]) => {        // three big sections of branches and clay
      const g = new T.Group();
      const slab = new T.Mesh(new T.BoxGeometry(1.5, 0.22, 1.3), api.mat(0x9c7b52)); g.add(slab);
      for (let k = 0; k < 4; k++) { const stick = new T.Mesh(new T.CylinderGeometry(0.05, 0.05, 1.5, 4), api.mat(0x6b4a2b)); stick.rotation.z = Math.PI / 2; stick.position.set(0, 0.13, -0.45 + k * 0.3); g.add(stick); }
      ROOF.tiles.push(api.carryable({
        x, z, mesh: g, dy: ROOF.TOP + 1,
        blocked: () => (ROOF.onRoof ? true : 'Wait! Help the friends get up here first, then open the roof.'),
        deliverTo: { x: ROOF.STACK[0], z: ROOF.STACK[1], r: 1.8 },
        onDeliver(p) {
          api.task('roof');
          pile[api.taskCount('roof') - 1].visible = true;
          api.servant(p, 5);
          api.sfx('build');
          if (api.taskDone('roof')) {                                        // light shines up from the room below
            ROOF.hole.visible = true;
            ROOF.light.material.opacity = 0.35;
            ROOF.rope.forEach((r) => r.show(true));
          }
        }
      }));
    });

    const neighbor=api.storyPerson(0x397b77,0xdcc89f,1,{beard:true});neighbor.position.set(3.5,0,22.5);api.add(neighbor);
    ROOF.neighborPerson=neighbor;
    ROOF.neighbor=api.conversation({person:neighbor,label:'Ask about the roof route',speaker:'A neighbor',clue(){
      const f=ROOF.friends;
      if(f.state==='idle')return{text:'Call the friends. They are carrying their friend to Jesus.',at:[f.pos.x,f.pos.y+1.5,f.pos.z]};
      if(f.state==='follow')return{text:'The door is crowded. Lead the friends to the house.',at:[ROOF.FRONT[0],1.5,ROOF.FRONT[1]]};
      const basket=ROOF.baskets.find(b=>!b.delivered);
      if(basket)return{text:'Move the basket beside the stairs to the wall.',at:[basket.x,basket.y+1,basket.z]};
      const landing=ROOF.landings.find(l=>!l.secured);
      if(landing)return{text:'Jump up the stairs and secure each timber catch.',at:[landing.x,landing.y+1,landing.z]};
      return ROOF.onRoof?{text:'The friends are up. Move the roof sections aside.',at:[0,ROOF.TOP+1,-30]}:{text:'The way is ready. The friends are climbing.',at:[f.pos.x,f.pos.y+1.5,f.pos.z]};
    }});
    // the crowd blocking the door (solid; they step aside at the end)
    const person=(robe,scarf,size,look)=>api.storyPerson(robe,scarf,size,look);   // friendly round townsfolk (engine)
    ROOF.person = person;
    const robes=[0x766184,0x9b4d41,0x4c7d84,0xa48a4c,0x677c52,0x875b6b,0x606c78,0x936d49];
    for (let i = 0; i < 14; i++) {
      const a = Math.PI * (0.08 + 0.84 * (i / 13));
      const x = Math.cos(a) * 4.4, z = -25.2 + Math.sin(a) * 2.6 - (i % 2) * 0.6;
      const m=i<6?api.storyPerson(robes[i%robes.length],i%3?0xe2d6bd:0xd4bd8c,1,{beard:i%2===0}):api.crowdPerson(i,robes[i%robes.length],i%3?0xe2d6bd:0xd4bd8c);
      m.position.set(x, 0, z); m.rotation.y = Math.PI; api.add(m);
      const blocker = api.box({ x, z, w: 0.9, h: 2, d: 0.9, color: 0x000000 });
      blocker.mesh.visible = false;
      ROOF.crowd.push({ m, blocker, x, z });
    }
    ROOF.witness=api.conversation({person:ROOF.crowd[4].m,speaker:'A listener',label:'Ask about the crowded house',clue(){
      if(ROOF.walkT!==undefined)return {text:'He is walking with his bed! Glory to God.',at:[0,1,-19]};
      return {text:'Jesus is teaching. The doorway is full. Look for the outside stairs.',at:[ROOF.STAIRS[0],1,ROOF.STAIRS[1]]};
    }});
    api.interact({
      x: 0, z: -22.5, r: 2.6, vRange: 3, label: 'Try the door',
      use() { api.toast('So many people! There is no room at the door. Is there another way up?', 2600); }
    });

    // --- the four friends carrying the man on his mat (one follower) ---
    const group = new T.Group();
    const mat = new T.Mesh(new T.BoxGeometry(1.1, 0.12, 2.1), api.mat(0xe7d3a8)); mat.position.y = 0.9; group.add(mat);
    const patient=api.storyPerson(0xf1e6cf,0xeadfc9,1,{register:false,beard:true});patient.rotation.x=-Math.PI/2;patient.scale.z=.55;patient.position.set(0,1.15,.85);group.add(patient);ROOF.patient=patient;
    [[-.7,-1],[.7,-1],[-.7,1],[.7,1]].forEach(([dx,dz],i)=>{
      const f=person(robes[(i+2)%robes.length],0xe7dfce,.85,{register:false,beard:[0x3b2412,0x1c1917,0x5a3a1e,0x2a1a0e][i],hair:[0x3b2412,0x1c1917,0x5a3a1e,0x2a1a0e][i]});f.position.set(dx,0,dz);group.add(f);ROOF.carriers.push({g:f,dx,dz});
      const line=new T.Line(new T.BufferGeometry().setFromPoints([new T.Vector3(),new T.Vector3()]),new T.LineBasicMaterial({color:0x9b7d4d}));line.visible=false;group.add(line);ROOF.lowerRopes.push(line);
    });
    ROOF.mat={mesh:mat,man:patient};
    ROOF.friends = api.follower({
      x: 2, z: 33, kind: 'friends', mesh: group,
      deliverTo: { x: ROOF.FRONT[0], z: ROOF.FRONT[1], r: 2.0 },
      parkAt: (f) => [f.pos.x, f.pos.y, f.pos.z],                 // the level walks them up (update)
      onDeliver(p) {
        api.task('friends');
        api.servant(p, 5, 'for bringing a friend to Jesus!');
        ROOF.setGoal();
        api.toast('🚪 No room at the door! Clear the outside stairs so they can carry him up.', 3200);
        ROOF.stairView=api.camZone({ minX: -2, maxX: 12, minZ: -29, maxZ: -15, yaw: 0.75, height: 9, back: 13, focus: [6.3, 2.5, -25], pull: 0.35 });   // now watch the stairs
      }
    });

    ROOF.houseView=api.camZone({minX:-6,maxX:10,minZ:-36,maxZ:-29,yaw:.45,height:12,back:18,focus:[0,3,-30],pull:.25});
    roofTownDetails(api);
    api.armor('sandals',0,26);

    // --- Golden Scroll challenge course (over the edge of the lake): blocks, crumbling platforms, a spring ---
    api.course([
      { x: 12.1, z: 24, top: 0.77, kind: 'block' },
      { x: 12.9, z: 20.6, top: 1.77, kind: 'float' },
      { x: 12.1, z: 17.2, top: 2.67, kind: 'crumble' },
      { x: 12.9, z: 13.8, top: 3.47, kind: 'crumble' },
      { x: 12.1, z: 10.4, top: 3.67, kind: 'float' },
      { x: 12.9, z: 7, top: 3.97, kind: 'spring' },
      { x: 12.1, z: 3.6, top: 8.17, kind: 'float' },
      { x: 12.9, z: 0.2, top: 8.77, kind: 'crumble' },
      { x: 12.1, z: -3.2, top: 9.37, kind: 'float' }
    ]);

    api.leaves([[-2, 30], [0, 24], [0, 16], [1, 8], [-1, -2], [0, -12], [-11, 30, 3.4], [-11, 22.5, 4.4], [-11, 15, 5.4],
      [12, 14], [12, 0], [-9.4, -16.4, 3.3], [6.3, -26, 3.4], [-3, -27, ROOF.TOP + 1], [3, -33, ROOF.TOP + 1]]);

  },

  update(api, dt) {
    if(!ROOF.entryCheckpoint&&api.activePlayers().some(p=>p.pos.z<35&&p.onGround)){ROOF.entryCheckpoint=true;api.checkpoint({x:0,z:34,label:'Capernaum street'});}
    // the friends climb as far as the prepared way lets them (players watch them go up)
    const f = ROOF.friends;
    if (f.state === 'parked' && ROOF.lowerT === undefined && ROOF.at < ROOF.goal) {
      const t = ROOF.path[ROOF.at + 1];
      const dx = t[0] - f.pos.x, dy = t[1] - f.pos.y, dz = t[2] - f.pos.z, d = Math.hypot(dx, dy, dz);
      const st = 2.4 * dt;
      if (d <= st) { f.pos.set(t[0], t[1], t[2]); ROOF.at++; }
      else { f.pos.x += dx / d * st; f.pos.y += dy / d * st; f.pos.z += dz / d * st; }
      if (Math.hypot(dx, dz) > 0.05) f.mesh.rotation.y = Math.atan2(dx, dz);
      f.mesh.position.copy(f.pos);
      if (ROOF.at === ROOF.path.length - 1 && !ROOF.onRoof) {
        ROOF.onRoof = true;api.checkpoint({x:3.5,y:ROOF.TOP,z:-31.5,label:'House rooftop'});
        api.task('friends'); api.sfx('win');
        api.servant(api.activePlayers()[0], 5, 'for helping them up!');
        api.toast('🛏️ They are on the roof! Now open it above Jesus.', 2600);
      }
    }
    roofPeople(api,dt);
    // the crowd shuffles a little
    ROOF.crowd.forEach((c, i) => { c.m.position.y=api.terrain(c.m.position.x,c.m.position.z)+Math.abs(Math.sin(api.time*2+i))*.035; });
    if (ROOF.light.material.opacity > 0) ROOF.light.material.opacity = 0.28 + Math.sin(api.time * 2) * 0.07;
    // finale animations
    if (ROOF.lowerT !== undefined) {                                   // the mat is let down through the roof
      const k = Math.min(1, (api.time - ROOF.lowerT) / 3);
      const f = ROOF.friends;
      f.pos.x += (0 - f.pos.x) * Math.min(1, dt * 3);
      f.pos.z += (-30 - f.pos.z) * Math.min(1, dt * 3);
      f.pos.y = ROOF.TOP; f.mesh.position.copy(f.pos);
      f.mesh.rotation.y*=Math.max(0,1-dt*4);
      ROOF.mat.mesh.position.set(0,.9-k*4.4,0);ROOF.patient.position.set(0,1.15-k*4.4,.85);
      ROOF.lowerRopes.forEach((line,i)=>{const c=ROOF.carriers[i],a=line.geometry.attributes.position;line.visible=k<1;a.setXYZ(0,c.g.position.x-Math.sign(c.dx)*.22,1,c.g.position.z);a.setXYZ(1,Math.sign(c.dx)*.5,.9-k*4.4,Math.sign(c.dz)*.85);a.needsUpdate=true;line.geometry.computeBoundingSphere();});
      if(k>=1)ROOF.mat.mesh.visible=ROOF.patient.visible=false;
    }
    if (ROOF.walkT !== undefined) {                                    // the healed man walks out, carrying his bed
      const k = Math.min(1, (api.time - ROOF.walkT) / 5);
      const z=-25+k*14;ROOF.healed.position.set(0,api.terrain(0,z),z);ROOF.healed.rotation.y=0;for(const view of [ROOF.houseView,ROOF.stairView])if(view)view.focus[2]=z;
      api.posePerson(ROOF.healed,{dt,stride:k<1?1:0,grip:[[-.32,.95,.38],[.32,.95,.38]]});
      ROOF.crowd.forEach((c) => { c.m.position.x = c.x + Math.sign(c.x || 1) * Math.min(1, k * 3) * 2.5; });
    }
  },

  objective(api) {
    const ps = api.activePlayers();
    if (!ps.length) return null;
    const f = ROOF.friends;
    if(ps.every(p=>p.pos.z>35))return ROOF.marketLift.latched?[0,4.3,46]:[3,5.8,59];
    const h = ps.find((p) => p.holding && p.holding.deliverTo);
    if (h) { const d = h.holding.deliverTo; return [d.x, h.holding.dy || 1, d.z]; }
    if (f.state === 'idle') return [f.pos.x, f.pos.y + 2, f.pos.z];
    if (f.state === 'follow') return [ROOF.FRONT[0], 1.5, ROOF.FRONT[1]];
    const next = ROOF.baskets.find((it) => !it.delivered && !it.holder);
    const landing=ROOF.landings.find(l=>!l.secured);
    if (next) return [next.x, next.y + 1, next.z];
    if (landing) return [landing.x,landing.y+1,landing.z];
    if (!ROOF.onRoof) return [f.pos.x, f.pos.y + 2.5, f.pos.z];        // watch them climb
    const onRoof = ps.some((p) => p.pos.y > ROOF.TOP - 0.5 && Math.abs(p.pos.x) < 5 && Math.abs(p.pos.z - ROOF.HOUSE.z) < 4.5);
    const t = ROOF.tiles.find((it) => !it.delivered && !it.holder);
    if (t && !onRoof) return [ROOF.STAIRS[0], 1.5, ROOF.STAIRS[1]];
    if (t) return [t.x, t.y + 1, t.z];
    return null;
  },

  finale: {
    message: '☀️ Everyone gather on the roof by the opening!',
    beacon: [3.4,ROOF.TOP+2,-31.5],
    inZone(p) { return p.pos.y > ROOF.TOP - 0.5 && Math.abs(p.pos.x) < 5 && Math.abs(p.pos.z - ROOF.HOUSE.z) < 4.5; },
    onUpdate(api, t) {
      if(t>.5&&ROOF.lowerT===undefined){ROOF.lowerT=api.time;api.music(false);api.finishCaption(false);api.sfx('drop');}
      if (t > 4 && !ROOF.told) {
        ROOF.told = true;
        api.story([
          { art: '🙌', title: 'Through the roof', text: 'And when they could not come nigh unto him for the press, they uncovered the roof where he was: and when they had broken it up, they let down the bed wherein the sick of the palsy lay.', ref: 'Mark 2:4' },
          { art: '💛', title: 'Jesus forgives', text: 'When Jesus saw their faith, he said unto the sick of the palsy, Son, thy sins be forgiven thee.', ref: 'Mark 2:5' },
          { art: '🤔', text: 'Jesus forgave the man’s sins first. His healing showed His authority to forgive.' },
          { art: '🛏️', title: 'Jesus heals', text: 'But that ye may know that the Son of man hath power on earth to forgive sins, (he saith to the sick of the palsy,) I say unto thee, Arise, and take up thy bed, and go thy way into thine house.', ref: 'Mark 2:10–11' },
          { art: '🎉', text: 'And immediately he arose, took up the bed, and went forth before them all; insomuch that they were all amazed, and glorified God, saying, We never saw it on this fashion.', ref: 'Mark 2:12' }
        ], () => {
          const T = api.THREE;
          const g = ROOF.person(0xf1e6cf, 0xffffff, 1, { beard: true });
          const bed=new T.Mesh(new T.CylinderGeometry(.17,.17,1.18,16),api.texMat(0xd9c69d,'weave'));bed.rotation.z=Math.PI/2;bed.position.set(0,1,.38);g.add(bed);ROOF.rolledBed=bed;
          api.add(g);ROOF.healed=g;api.music(true);
          for(const view of [ROOF.houseView,ROOF.stairView])if(view)Object.assign(view,{minX:-6,maxX:10,minZ:-36,maxZ:-20,yaw:.38,height:11,back:23,focus:[0,1,-19],pull:.65});
          ROOF.crowd.forEach((c) => { c.blocker.show(false); });
          ROOF.walkT = api.time; api.sfx('win');
          ROOF.endT = api.time;
        });
      }
      return ROOF.endT !== undefined && api.time - ROOF.endT > 5;
    }
  }
};

// House trim stays beneath the old landing edges, and shares each house's camera fade.
function roofHouseTrim(api,handle,o) {
  const T=api.THREE,g=new T.Group();g.name='capernaum-plaster-trim';
  const block=(w,h,d,x,y,z,color,texture)=>{const m=new T.Mesh(new T.BoxGeometry(w,h,d),api.texMat(color,texture||'stone'));m.position.set(x,y,z);g.add(m);return m;};
  block(o.w-.18,.025,o.d-.18,0,o.h/2-.012,0,0xd3c3a2,'paving');
  for(const sd of [-1,1]){
    block(o.w,.25,.055,0,-o.h/2+.19,sd*(o.d/2+.015),0x9c8c70);
    block(.055,.25,o.d,sd*(o.w/2+.015),-o.h/2+.19,0,0x9c8c70);
    for(const x of [-o.w/2+.12,o.w/2-.12])block(.24,o.h-.3,.065,x,0,sd*(o.d/2+.02),0xe0d1af);
  }
  api.scenery(g);handle.mesh.add(g);
}

function roofTownDetails(api) {
  const T=api.THREE,g=new T.Group();g.name='capernaum-authored-details';
  const box=(x,y,z,w,h,d,color,texture)=>{const m=new T.Mesh(new T.BoxGeometry(w,h,d),api.texMat(color,texture||'wood'));m.position.set(x,y,z);m.castShadow=true;g.add(m);return m;};
  // The pantry stays open from the rope/ordinary landing. Its shelf hugs the back wall.
  box(-7,4.6,43.78,3.2,.12,.38,0x8c7150);
  [-8.1,-7.4,-6.5,-5.9].forEach((x,i)=>{const jar=new T.Mesh(new T.SphereGeometry(.16,10,8),api.texMat(i%2?0xb08863:0xa67550,'clay'));jar.scale.y=1.3;jar.position.set(x,4.84,43.8);g.add(jar);});
  box(-7,3.315,46,2.6,.018,2.6,0x9c7563,'cloth');
  // A few ordinary wares belong on counters; the center street and stair mouth stay clear.
  [[3,20],[-3,11],[3.5,2],[-3,-8]].forEach(([x,z],i)=>{
    for(let j=0;j<3;j++){const loaf=new T.Mesh(new T.SphereGeometry(.2,10,8),api.texMat(0xc5a374,'clay'));loaf.scale.set(1.3,.5,.75);loaf.position.set(x-.7+j*.45,1.12,z-.2);g.add(loaf);}
    box(x+.9,1.08,z+.15,.6,.12,.7,i%2?0x978776:0x7e8675,'weave');
  });
  // Door frame and light remain outside: Jesus is not modeled inside the house.
  const H=ROOF.HOUSE;for(const x of [-.88,.88])box(x,1.14,H.z+H.d/2+.08,.18,2.28,.16,0xd8c8a4,'stone');
  box(0,2.32,H.z+H.d/2+.08,1.95,.18,.2,0x826747);
  api.scenery(g);
}

function roofPeople(api,dt) {
  const ps=api.activePlayers(),f=ROOF.friends,previous=ROOF.lastFriendPos||f.pos.clone(),speed=Math.min(1.3,f.pos.distanceTo(previous)/Math.max(.001,dt)/2.4);
  ROOF.lastFriendPos=f.pos.clone();const lowering=ROOF.lowerT!==undefined,healed=ROOF.walkT!==undefined,blend=Math.min(1,dt*5);
  ROOF.carriers.forEach(c=>{
    const targetX=lowering?Math.sign(c.dx)*1.85:c.dx,targetZ=lowering?Math.sign(c.dz)*.9:c.dz;
    c.g.position.x+=(targetX-c.g.position.x)*blend;c.g.position.z+=(targetZ-c.g.position.z)*blend;
    const hand=c.dx<0?1:0,grip=[null,null];
    grip[hand]=lowering?[-Math.sign(c.dx)*.22/.85,1/.85,0]:[(Math.sign(c.dx)*.5-c.dx)/.85,.9/.85,(c.dz*.78-c.dz)/.85];
    api.posePerson(c.g,{dt,stride:lowering?0:speed,talking:false,grip:healed?null:grip,cheer:healed,expression:healed?'wonder':'calm'});
  });
  if(ROOF.patient.visible){const a=ROOF.patient.userData.storyActor;a.eyes.scale.y=Math.sin(api.time*1.1)>.995?.15:1;}
  ROOF.crowd.forEach((c,i)=>{
    const target=ROOF.healed&&healed?ROOF.healed.position:null,want=target?Math.atan2(target.x-c.m.position.x,target.z-c.m.position.z):Math.PI;
    let d=want-c.m.rotation.y;while(d>Math.PI)d-=Math.PI*2;while(d< -Math.PI)d+=Math.PI*2;c.m.rotation.y+=d*blend;
    api.posePerson(c.m,{dt,talking:false,expression:healed?'wonder':'listen',cheer:healed});
  });
  const g=ROOF.neighborPerson,a=g.userData.storyActor,talking=a.talkUntil>api.time&&a.listener&&!a.listener.bubble;
  let near=talking?a.listener:null,distance=4.5;if(!near)for(const p of ps){const d=Math.hypot(p.pos.x-g.position.x,p.pos.z-g.position.z);if(d<distance){near=p;distance=d;}}
  if(near){let d=Math.atan2(near.pos.x-g.position.x,near.pos.z-g.position.z)-g.rotation.y;while(d>Math.PI)d-=Math.PI*2;while(d< -Math.PI)d+=Math.PI*2;g.rotation.y+=d*blend;}
  api.posePerson(g,{dt,talking,expression:near?'listen':'calm'});
}


function roofRopeRail(api,handle,w,d) {
  const T=api.THREE,g=new T.Group();g.name='roof-rope-rail';
  handle.mesh.material=handle.mesh.material.clone();handle.mesh.material.transparent=true;handle.mesh.material.opacity=0;handle.mesh.material.depthWrite=false;handle.mesh.castShadow=false;
  const cap=handle.mesh.getObjectByName('cap');if(cap)cap.visible=false;
  const alongX=w>d,length=Math.max(w,d)-.16,wood=api.texMat(0x8b7150,'wood'),rope=api.texMat(0xc6b28b,'weave');
  for(const sd of [-1,1]){const post=new T.Mesh(new T.CylinderGeometry(.045,.055,.5,8),wood);post.position.set(alongX?sd*length/2:0,0,alongX?0:sd*length/2);g.add(post);}
  for(const y of [-.08,.15]){const line=new T.Mesh(new T.CylinderGeometry(.025,.025,length,8),rope);line.position.y=y;if(alongX)line.rotation.z=Math.PI/2;else line.rotation.x=Math.PI/2;g.add(line);}
  api.scenery(g);handle.mesh.add(g);
}
