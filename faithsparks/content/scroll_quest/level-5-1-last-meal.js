/* The Last Little Meal — 1 Kings 17:8–24.
 * A continuous helper journey: two sticks on the hillside → well → dry ravine → home.
 * God has already provided the flour and oil in the opening account. Neither the water
 * delivery nor a puzzle causes His provision or the later raising of the widow's son.
 */
const MEAL = {
  sticks: [], stones: [], screens: [],
  HOME: [0, -49], WELL: [-5, 30],
  waterDrawn: false, shortcutOpen: false, lidOpen: false, told: false
};

const LEVEL = {
  id: '5-1', world: 'World 5-1', title: 'The Last Little Meal', town: true,
  leafIcon: '🌾', leafColor: 0xe9bc65,
  spawn: [0, 66], bounds: { minX: -20, maxX: 20, minZ: -58, maxZ: 70 },
  teamPads: false,
  bibleConnection: { passage: '1 Kings 17:8–24', text: "The LORD kept the widow’s flour and oil from running out. Later her son died. Elijah prayed, and the LORD brought him back to life. Our well and crossings are imagined helping jobs. God gave both miracles." },
  startMessage: "Gather two sticks. Use the special action at the well, then carry the water home.",
  intro: [
    { text: 'For thus saith the LORD God of Israel, The barrel of meal shall not waste, neither shall the cruse of oil fail, until the day that the LORD sendeth rain upon the earth.', ref: '1 Kings 17:14' }
  ],
  introStory: [
    { art: '🌾', title: 'The last handful', text: 'There was a drought. At Zarephath, Elijah met a widow gathering two sticks. She had only a handful of flour and a little oil. She expected to make one last meal for herself and her son, and then die. Elijah brought the LORD’s promise of provision.' },
    { art: '🏺', title: 'The LORD kept His word', text: 'And the barrel of meal wasted not, neither did the cruse of oil fail, according to the word of the LORD, which he spake by Elijah.', ref: '1 Kings 17:16' },
    { art: '🧩', title: 'Just for our game', text: "Our well and crossings are imagined. Gather two sticks, draw water, then carry the pitcher home. The LORD provided the flour and oil." }
  ],
  tasks: [
    { id: 'sticks', icon: '🪵', label: 'Gather the two sticks along the hillside', total: 2 },
    { id: 'water', icon: '🏺', label: 'Carry water from the well to the home', total: 1, lockedUntil: 'sticks' },
    { id: 'table', icon: '🍞', label: 'Help set the household table', total: 1, lockedUntil: 'water' }
  ],
  memoryVerse: { text: 'And the barrel of meal wasted not, neither did the cruse of oil fail, according to the word of the LORD, which he spake by Elijah.', ref: '1 Kings 17:16' },
  ending: {
    verse: { text: 'And the woman said to Elijah, Now by this I know that thou art a man of God, and that the word of the LORD in thy mouth is truth.', ref: '1 Kings 17:24' },
    message: 'The LORD kept His word. He provided food during the drought, and later heard Elijah’s prayer and restored the widow’s son to life.'
  },
  quiz: [
    { q: 'Why did the widow call this her last meal?', ref: '1 Kings 17:12', options: ['She was leaving on a holiday', 'She expected herself and her son to die after their food ran out', 'She did not like bread'], answer: 1, explain: 'The widow had only a handful of flour and a little oil. She expected hunger and death.' },
    { q: 'Why did the flour and oil keep lasting?', ref: '1 Kings 17:14–16', options: ['Helpers solved the well puzzle', 'Elijah bought a warehouse', 'The LORD kept His promise'], answer: 2, explain: 'The LORD provided according to His word spoken through Elijah. A game task cannot cause His miracle.' },
    { q: 'What happened later to the widow’s son?', ref: '1 Kings 17:17–22', options: ['He died; Elijah prayed, and the LORD restored his life', 'He only pretended to be ill', 'A puzzle gave him life'], answer: 0, explain: 'Her son really died. The LORD heard Elijah’s prayer, and the child revived.' }
  ],
  music: { bpm: 88, notes: [62,0,65,67,69,0,67,65,64,0,62,0,60,62,0,0,65,0,69,72,71,69,67,0,65,64,62,0,62,0,0,0], bass: [38,38,43,43,45,45,38,38] },
  terrain(x, z) {
    for (const [a, b] of [[49, 53], [13, 23], [-16, -10]]) {
      if (z > a && z < b) return -6 * Math.min(1, (z-a)/.35, (b-z)/.35);
    }
    return Math.sin(x*.21)*Math.cos(z*.19)*.05;
  },
  groundColor(x, z, h) {
    if (h < -1) return 0x8e765a;
    if (z < -35) return (Math.floor(x/2)+Math.floor(z/2))%2 ? 0xc4ac86 : 0xbda27b;
    return (Math.floor(x/4)+Math.floor(z/4))%2 ? 0xd5bb89 : 0xcdb17d;
  },
  build(api) {
    const T = api.THREE;
    const stone = (x, z, top, w=3, d=2.2, bottom=-6) => api.box({ x,z,w,d,y:bottom,h:top-bottom,color:0xc6b18c,tex:'stone',house:false });
    const twig = () => {
      const g = new T.Group();
      for (const [dx, angle] of [[0,.2],[.32,-.6]]) {
        const m = new T.Mesh(new T.CylinderGeometry(.055,.075,.95,7),api.texMat(0x795334,'bark'));
        m.rotation.z = Math.PI/2+angle; m.position.x=dx; g.add(m);
      }
      return g;
    };
    // Small early ledges teach the jump before the first real gap.
    api.box({x:2,z:57,w:3,d:2.8,h:.8,color:0xc6b18c,tex:'stone',house:false});
    api.box({x:-4,z:40,w:3,d:2.8,h:1.1,color:0xc6b18c,tex:'stone',house:false});
    [[2,57],[-4,40]].forEach(([x,z])=>MEAL.sticks.push(api.gatherable({x,z,mesh:twig(),task:'sticks',onGet:p=>api.servant(p,2)})));
    stone(0,51,.35,3.6,2.2);
    [[3,21,.4],[0,18,.9],[-3,15,.4]].forEach(([x,z,y])=>MEAL.stones.push(stone(x,z,y,3.2,2.4)));
    // A broad, permanent timber footway crosses the last cut. The route then descends into town.
    MEAL.footway=api.box({x:0,z:-13,w:4.8,d:8,y:0,h:.25,color:0x98613a,tex:'wood',house:false});
    for(let k=0;k<11;k++){
      const seam=new T.Mesh(new T.BoxGeometry(4.7,.02,.035),api.mat(0x63442a));seam.position.set(0,.265,-9.4-k*.7);api.add(seam);
    }
    [[51,4],[18,10],[-13,6]].forEach(([z,d])=>api.hazard({x:0,z,w:42,d},{maxY:-2.5,msg:'Mind the dry ravine! Follow the stones or timber footway.'}));
    // A two-station shortcut is optional: the regular stones always remain playable.
    MEAL.shortcut=api.box({x:-7,z:18,w:3.4,d:12,y:0,h:.25,hidden:true,color:0x98613a,tex:'wood',house:false});
    MEAL.shortcutPanels=[];
    [[-9,25],[-5,25]].forEach(([x,z],i)=>{
      const wheel=new T.Mesh(new T.TorusGeometry(.42,.08,8,14),api.texMat(0x785132,'wood'));wheel.position.set(x,1,z-.7);api.add(wheel);
      const panel={x,z,latched:false,wheel};MEAL.shortcutPanels.push(panel);
      panel.zone=api.zone({x,z,y:0,r:1,time:99999,color:0xf59e0b});
      panel.inter=api.interact({x,z,y:0,r:1.5,vRange:.8,label:'Latch ravine support '+(i+1),
        can:p=>api.players().length===1 ? true : 'Team: stand at both support rings. Alone: latch each support with the special action.',
        use(){panel.latched=true;this.remove();wheel.rotation.z=Math.PI/2;api.sfx('winch');}
      });
    });
    // The water source is a well, not the dry riverbed. One delivery continues toward home.
    const well=new T.Mesh(new T.CylinderGeometry(1,1.15,.9,18),api.texMat(0xaa9270,'stone'));well.position.set(-5,.45,30);api.add(well);
    const wellWater=new T.Mesh(new T.CircleGeometry(.82,24),api.mat(0x497e8b));wellWater.rotation.x=-Math.PI/2;wellWater.position.set(-5,.905,30);api.add(wellWater);
    api.box({x:-5,z:30,w:1.7,d:1.7,h:.8,house:false}).mesh.visible=false;
    for(const x of [-6.1,-3.9]){const post=new T.Mesh(new T.BoxGeometry(.15,2.7,.15),api.texMat(0x785132,'wood'));post.position.set(x,1.35,30);api.add(post);}
    const bar=new T.Mesh(new T.CylinderGeometry(.1,.1,2.5,10),api.texMat(0x785132,'wood'));bar.rotation.z=Math.PI/2;bar.position.set(-5,2.55,30);api.add(bar);
    const bucket=new T.Mesh(new T.CylinderGeometry(.25,.22,.45,12),api.texMat(0x98613a,'wood'));bucket.position.set(-5,.25,30);api.add(bucket);MEAL.bucket=bucket;
    const rope=new T.Line(new T.BufferGeometry().setFromPoints([new T.Vector3(-5,2.55,30),new T.Vector3(-5,.45,30)]),new T.LineBasicMaterial({color:0x72583a}));api.add(rope);MEAL.wellRope=rope;
    const wheel=new T.Mesh(new T.TorusGeometry(.45,.08,8,14),api.texMat(0x785132,'wood'));wheel.position.set(-6.2,1.1,31.6);api.add(wheel);MEAL.wellWheel=wheel;
    const jug=new T.Group();
    const body=new T.Mesh(new T.SphereGeometry(.32,12,10),api.texMat(0x9c5a31,'clay'));body.scale.y=1.2;jug.add(body);
    const neck=new T.Mesh(new T.CylinderGeometry(.12,.18,.25,12),api.texMat(0x9c5a31,'clay'));neck.position.y=.38;jug.add(neck);
    const handle=new T.Mesh(new T.TorusGeometry(.22,.055,8,14),api.texMat(0x9c5a31,'clay'));handle.position.set(.3,.1,0);jug.add(handle);
    MEAL.jug=api.carryable({x:-3,z:30,mesh:jug,name:'water pitcher',to:'the widow’s home',
      deliverTo:{x:MEAL.HOME[0],z:MEAL.HOME[1],r:2.8},
      onDeliver(p){api.task('water');api.servant(p,5,'for bringing water home!');MEAL.table.show(true);}
    });
    MEAL.jug.mesh.visible=false;MEAL.jug.inter.alive=false;
    MEAL.well=api.zone({x:-6.2,z:33,y:0,r:1.7,vRange:.7,time:2.5,hidden:true,action:'Draw water from the well',
      onDone(){MEAL.waterDrawn=true;this.show(false);bucket.visible=false;MEAL.jug.mesh.visible=true;MEAL.jug.inter.alive=true;api.toast('Water drawn! Pick up the pitcher and follow the stones toward the house.',3400);}
    });
    api.armor('sandals',7,34);
    // A warned animal charge can be avoided on either side or by using the broad shelter rock.
    MEAL.goat=api.critter({kind:'goat',x:9,z:-29,r:4,sight:4.5,speed:6,warn:1.2,msg:'An angry goat! Wait for its charge, then pass beside the shelter rock.'});
    api.box({x:3,z:-29,w:4,d:3,h:1.3,color:0xbca582,tex:'stone',house:false});
    api.box({x:-7,z:-25,w:3,d:3,h:.8,color:0xbca582,tex:'stone',house:false});
    // Optional scroll 1: a natural stepped lookout; the Scribe reaches the highest ledge.
    [[13,54,1.2],[14,51,2.2],[12,47.5,5]].forEach(([x,z,top])=>api.box({x,z,w:3,d:3,y:-6,h:top+6,color:0xbca582,tex:'stone',house:false}));
    MEAL.lookoutFragment=api.fragment({x:12,z:47.5,y:6.2});
    // Optional scroll 2: the Fisherman nets a scroll caught on the well's inner rim.
    MEAL.wellFragment=api.fragment({x:-5,z:30,y:.35,net:true});
    // An optional net scroll must not suggest that drawing or carrying water needs the Fisherman.
    MEAL.wellFragment.inter.available=p=>p.role.id==='fisherman'&&!MEAL.well.workers[p.slot];
    // Optional scroll 3: two helpers (or the Builder) slide a store lid, exposing a reachable fragment.
    api.box({x:11,z:-36,w:3,d:3,h:.5,color:0xc0a780,tex:'stone',house:false});
    const lid=new T.Mesh(new T.CylinderGeometry(1.1,1.15,.2,16),api.texMat(0xb8a17f,'stone'));lid.position.set(11,.65,-36);api.add(lid);MEAL.lid=lid;
    MEAL.lidFragment=api.fragment({x:11,z:-36,y:20});MEAL.lidFragment.mesh.visible=false;
    api.interact({x:11,z:-33.6,y:0,r:2,vRange:1,label:'Slide the store lid together',
      can:p=>p.role.strong||api.near(11,-33.6,2).filter(q=>Math.abs(q.pos.y)<.7).length>=2 ? true : 'The Builder can slide the lid, or two helpers can work together.',
      use(p){this.remove();MEAL.lidOpen=true;lid.position.x=13.3;lid.rotation.z=.2;MEAL.lidFragment.y=MEAL.lidFragment.baseY=1.5;MEAL.lidFragment.mesh.visible=true;api.servant(p,3);api.sfx('bridge');}
    });
    // The household is already sustained by God's promise: the barrel and oil stay visibly supplied.
    api.box({x:0,z:-54,w:9,d:6,h:3.4,color:0xd1b68d});
    api.box({x:-12,z:-49,w:5,d:6,h:3,color:0xc3a77f});
    api.box({x:12,z:-50,w:5,d:6,h:3,color:0xc3a77f});
    const widow=api.person(0x6b3d7b,0xe7e5d3,1);widow.position.set(-2.2,0,-49);api.add(widow);
    const son=api.person(0x417d91,0xe7e5d3,.65,{age:'child'});son.position.set(-3.4,0,-48);api.add(son);
    const elijah=api.person(0x79452c,0x8a7250,1,{age:'elder',beard:true});elijah.position.set(3,0,-49);api.add(elijah);
    const table=new T.Mesh(new T.BoxGeometry(2.5,.15,1.4),api.texMat(0x98613a,'wood'));table.position.set(0,.8,-48.8);api.add(table);
    for(const x of [-.9,.9])for(const z of [-49.2,-48.4]){const leg=new T.Mesh(new T.BoxGeometry(.14,.8,.14),api.texMat(0x785132,'wood'));leg.position.set(x,.4,z);api.add(leg);}
    const meal=new T.Mesh(new T.CylinderGeometry(.5,.6,.9,16),api.texMat(0xc7aa79,'wood'));meal.position.set(4.8,.45,-50);api.add(meal);
    const flour=new T.Mesh(new T.CircleGeometry(.44,18),api.mat(0xf2dfb6));flour.rotation.x=-Math.PI/2;flour.position.set(4.8,.91,-50);api.add(flour);
    const oil=new T.Mesh(new T.SphereGeometry(.33,12,10),api.texMat(0x9c5a31,'clay'));oil.scale.y=1.2;oil.position.set(5.7,.4,-50);api.add(oil);
    const bread=new T.Mesh(new T.CylinderGeometry(.35,.4,.15,16),api.texMat(0xe0b16e,'clay'));bread.position.set(0,.97,-48.8);api.add(bread);
    MEAL.table=api.zone({x:0,z:-46.5,y:0,r:2.3,vRange:.8,time:2,hidden:true,action:'Help set the household table',
      onDone(helpers){this.show(false);api.task('table');helpers.forEach(p=>api.servant(p,3));}
    });
    api.course([
      {x:-15,z:61,top:1,kind:'block'},{x:-16,z:58,top:2,kind:'float'},
      {x:-15,z:55,top:3,kind:'crumble'},{x:-16,z:52,top:4,kind:'float'},
      {x:-15,z:49,top:5,kind:'float'},{x:-16,z:46,top:6,kind:'crumble'},
      {x:-15,z:43,top:7,kind:'float'}
    ]);
    api.leaves([[0,63],[1,60],[2,57,1.8],[0,54.5],[0,51,1.35],[0,47.5],[-2,44],[-4,40,2.1],[-4,36],[-6,33],[-3,27],[3,24.5],[3,21,1.4],[0,18,1.9],[-3,15,1.4],[-3,11],[0,6],[0,1],[0,-5],[0,-9],[0,-13,1.25],[0,-17.5],[-2,-22],[-3,-27],[-3,-32],[0,-38],[0,-43]]);
    api.camZone({minX:-8,maxX:8,minZ:44,maxZ:61,yaw:-.2,height:8,back:12,focus:[0,0,51],pull:.3});
    api.camZone({minX:-12,maxX:8,minZ:10,maxZ:34,yaw:.3,height:9,back:13,focus:[-2,0,19],pull:.35});
    api.camZone({minX:-8,maxX:8,minZ:-20,maxZ:-6,yaw:-.2,height:8,back:12,focus:[0,0,-13],pull:.3});
  },
  update(api,dt) {
    if(api.taskDone('sticks')&&!MEAL.wellReady){MEAL.wellReady=true;MEAL.well.show(true);api.toast('Both sticks gathered. Use the well crank, then bring the water home.',3000);}
    const work=MEAL.well.progress;MEAL.wellWheel.rotation.z=-work*Math.PI*4;MEAL.bucket.position.y=.25+work*1.5;
    const rope=MEAL.wellRope.geometry.attributes.position;rope.setY(1,MEAL.bucket.position.y+.2);rope.needsUpdate=true;
    if(!MEAL.shortcutOpen&&MEAL.shortcutPanels.every(q=>q.latched||api.near(q.x,q.z,1).some(p=>p.onGround&&Math.abs(p.pos.y)<.6))){
      MEAL.shortcutOpen=true;MEAL.shortcut.show(true);MEAL.shortcutPanels.forEach(q=>{q.wheel.rotation.z=Math.PI/2;q.zone.show(false);q.inter.remove();});api.sfx('winch');api.toast('The side footway is secured. It stays open for the whole team.',2800);
    }
    if(!MEAL.wellCheckpoint&&MEAL.waterDrawn){MEAL.wellCheckpoint=true;api.checkpoint({x:-3,z:27,label:'Well checkpoint'});}
    if(!MEAL.homeCheckpoint&&api.activePlayers().some(p=>p.pos.z<-38)){MEAL.homeCheckpoint=true;api.checkpoint({x:0,z:-41,label:'Zarephath checkpoint'});}
    if(!MEAL.lidOpen&&MEAL.lidFragment.shadow)MEAL.lidFragment.shadow.visible=false;
  },
  objective(api) {
    const stick=MEAL.sticks.find(q=>!q.got);if(stick)return[stick.x,stick.y+1,stick.z];
    if(!MEAL.waterDrawn)return[-6.2,1.5,33];
    if(!api.taskDone('water')){
      if(!MEAL.jug.holder)return[MEAL.jug.x,MEAL.jug.y+1,MEAL.jug.z];
      const z=MEAL.jug.holder.pos.z;
      if(z>23)return[3,1.4,21];
      if(z>19.3)return[0,1.9,18];
      if(z>16.2)return[-3,1.4,15];
      if(z>-9)return[0,1,-9];
      if(z>-17)return[0,1,-18];
      return[MEAL.HOME[0],1.5,MEAL.HOME[1]];
    }
    return[0,1.5,-46.5];
  },
  finale: {
    message: 'Gather with the household by the flour and oil!', beacon: [0,2.5,-48],
    inZone:p=>Math.hypot(p.pos.x,p.pos.z+48)<5,
    onUpdate(api,t){
      if(t>.4&&!MEAL.told){MEAL.told=true;api.story([
        {art:'💔',title:'Later, her son died',text:'After these things, the widow’s son became so ill that he died. His mother grieved. Elijah carried him upstairs and cried to the LORD, asking that the child’s life return. This was real death, not a game injury.'},
        {art:'🙏',title:'The LORD heard Elijah',text:'And the LORD heard the voice of Elijah; and the soul of the child came into him again, and he revived.',ref:'1 Kings 17:22'},
        {art:'🏠',title:'Alive, back to his mother',text:"Elijah brought the living child back to his mother. She knew the LORD’s word was true (1 Kings 17:23–24). God had provided their food and restored her son’s life."}
      ],()=>{MEAL.endT=api.time;api.sfx('win');});}
      return MEAL.endT!==undefined&&api.time-MEAL.endT>1.8;
    }
  }
};
