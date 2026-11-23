/* Exodus 16–17. ONE continuous loop: west dunes → northern ridge → east camp → home.
 * Manna is present from the start. Serving bowls is imagined; it does not earn God's provision.
 */
const MANNA = { windbreaks:[], windTime:0, entryLedges:[], entryCrossed:false, portions:[], households:[], bridgeOpen:false, saidRule:false, told:false };
const LEVEL = {
  id: '3-5',
  bibleConnection: {"passage": "Exodus 16–17; John 6:35", "text": "God gave Israel manna and water. Daily portions and Sabbath rest taught them to trust Him. Our windbreaks and sharing route are imagined. God supplied the food first."},
  world: 'World 3-6',            // shown one later (the plagues come first in Bible order); the id stays '3-5'
  teamPads: false,
  title: 'Bread in the Wilderness',
  leafIcon:'🍞',leafColor:0xead9ae,courseTheme:'sand',
  spawn:[-5,81],bounds:{minX:-21,maxX:21,minZ:-32,maxZ:84},
  startMessage:"Watch the wind flags. Jump the ledges and use the special action at each windbreak.",
  intro:[{text:'This is the bread which the LORD hath given you to eat.',ref:'Exodus 16:15'}],
  introStory:[
    {art:'🍞',title:'Bread from the LORD',text:'Israel complained about hunger after leaving Egypt. God gave quails in the evening and manna in the morning. He told them to gather each day\'s portion, with twice as much on the sixth day before the Sabbath. The food was God\'s gift, not a reward for their complaints (Exodus 16).'},
    {art:'🏕️',title:'Just for our game',text:"Our windbreaks and sharing route are imagined. Gather food along the dunes, then share it through camp on the way back. God gave the manna before our work."}
  ],
  tasks:[{id:'manna',icon:'🍞',label:'Gather along the six dune stops',total:6},{id:'share',icon:'🥣',label:'Share through camp on the way home',total:3,lockedUntil:'manna'}],
  memoryVerse:{text:'This is the bread which the LORD hath given you to eat.',ref:'Exodus 16:15'},
  ending:{verse:{text:'I am the bread of life: he that cometh to me shall never hunger; and he that believeth on me shall never thirst.',ref:'John 6:35'},message:'God gave daily bread and water to complaining people. We depend on His grace. Jesus is the bread of life.'},
  quiz:[
    {q:'Who gave Israel manna in the wilderness?',ref:'Exodus 16:15',options:['The strongest player','The LORD','Pharaoh'],answer:1, explain: 'Manna was a gift from the LORD to complaining people, not a prize for our teamwork.'},
    {q:'What happened when some people kept ordinary daily manna until morning?',ref:'Exodus 16:19–20',options:['It bred worms and stank','It became gold','Nothing; God had told them to hoard it'],answer:0, explain: 'Some disobeyed the ordinary daily instruction. The sixth-day portion was the exception God commanded.'},
    {q:'Why did they gather twice as much on the sixth day?',ref:'Exodus 16:22–23',options:['To win more points','To sell it','The next day was the Sabbath rest'],answer:2, explain: 'God told them to prepare a double portion before the Sabbath, when no manna was to be gathered.'}
  ],
  music:{bpm:96,notes:[62,66,69,0,71,69,66,64,62,0,66,69,74,71,69,0],bass:[50,50,43,43,45,45,50,50]},
  terrain(x,z){return x<0&&Math.abs(z-18)<1.15?-1.5:0;},
  groundColor(x,z,h){return h<-.6?0x8e806c:x>6?0xc3b08d:0xe0c392;},
  build(api){
    const T=api.THREE;
    // A human-made desert approach replaces the shared lion / pit / crumble sections.
    // Every missed ledge has dry ground beneath it. The original manna already exists below.
    [[-7,77,.55],[-4,73,1.1],[-1,69,.55],[-1,65,.6],[-5,61,1.2],[-8,57,.6],[-5,52,.4]].forEach(([x,z,top])=>{
      MANNA.entryLedges.push(api.box({x,z,w:4.8,d:3.6,y:0,h:top,color:0xc8ae82,tex:'stone',house:false}));
      const edge=new T.Mesh(new T.BoxGeometry(4.3,.035,.14),api.mat(0xf4e3bf));edge.position.set(x,top+.025,z+1.6);api.add(edge);
      api.leaves([[x,z,top+1]]);
    });
    // Low stone lips mark quiet pockets beside each handle. Shelters stay useful for late teammates.
    [[-6.7,73],[-2.3,61]].forEach(([x,z])=>api.box({x,z,w:.45,d:3.8,y:0,h:1.45,color:0xb79e79,tex:'stone',house:false}));
    [[-4,73,1.1,1,0],[-5,61,1.2,-1,3]].forEach(([x,z,y,dir,phase],index)=>{
      const shelter={x,z,y,dir,phase,latched:false,sheltered:false,turn:0,strength:0,state:'calm'};MANNA.windbreaks.push(shelter);
      const poleX=dir>0?-9:0,poleZ=z-.4;
      api.box({x:poleX,z:poleZ,w:.3,d:.3,y:0,h:4.9,color:0x795738,tex:'wood',house:false});
      // The swivel screen hangs above walking height; its mast is the physical obstruction.
      const screen=new T.Group();screen.name='dune-windbreak-'+index;screen.position.set(poleX,3.5,poleZ);
      const cloth=new T.Mesh(new T.BoxGeometry(3.4,1.6,.08),api.texMat(index?0x9a6b4d:0x7e7771,'cloth'));cloth.castShadow=true;screen.add(cloth);
      for(const sy of [-.85,.85]){const rail=new T.Mesh(new T.BoxGeometry(3.6,.12,.14),api.texMat(0x795738,'wood'));rail.position.y=sy;screen.add(rail);}
      api.add(screen);shelter.screen=screen;
      const wheel=new T.Mesh(new T.TorusGeometry(.35,.07,8,16),api.texMat(0x795738,'wood'));wheel.position.set(x+1.7,y+1,z);api.add(wheel);shelter.wheel=wheel;
      const stand=new T.Mesh(new T.BoxGeometry(.16,1.3,.2),api.texMat(0x795738,'wood'));stand.position.set(x+1.7,y+.65,z+.15);api.add(stand);
      const rope=new T.Line(new T.BufferGeometry().setFromPoints([new T.Vector3(x+1.7,y+1,z+.15),new T.Vector3(poleX,4.4,poleZ)]),new T.LineBasicMaterial({color:0x735a3c}));api.add(rope);
      const flag=new T.Mesh(new T.BoxGeometry(1.25,.3,.06),new T.MeshLambertMaterial({color:0x78b6a1}));flag.position.set(poleX+dir*.8,4.65,poleZ);api.add(flag);shelter.flag=flag;
      const dust=new T.InstancedMesh(new T.BoxGeometry(.7,.035,.06),new T.MeshBasicMaterial({color:0xf4dbab,transparent:true,opacity:.6,depthWrite:false}),18);dust.frustumCulled=false;api.add(dust);shelter.dust=dust;shelter.dummy=new T.Object3D();
      shelter.work=api.zone({x,z,y,r:1.75,vRange:.6,time:1.6,color:0xd5a64f,action:'Turn and tie the '+(index?'camp':'outer')+' windbreak',
        onDone(helpers){this.show(false);shelter.latched=true;helpers.forEach(p=>api.servant(p,2,'for sheltering the path!'));api.sfx('rope');api.toast('The screen is turning into the wind. Its sheltered path will stay calm for everyone.',3300);}
      });
    });
    api.leaves([[-5,80],[-5,48]]);
    api.camZone({minX:-15,maxX:6,minZ:67,maxZ:84,yaw:.12,height:10,back:15,focus:[-4,1,73],pull:.2});
    api.camZone({minX:-15,maxX:6,minZ:47,maxZ:67,yaw:-.12,height:10,back:15,focus:[-5,1,59],pull:.2});
    const piece=()=>{const g=new T.Group();for(let i=0;i<5;i++){const m=new T.Mesh(new T.SphereGeometry(.12,7,5),api.mat(0xeee7cf));m.scale.y=.45;m.position.set(Math.cos(i)*.24,0,Math.sin(i)*.24);g.add(m);}return g;};
    [[-5,8,1.2],[-6,4,2.2],[-3,0,3.2],[0,-4,2.2],[4,-8,1.2]].forEach(([x,z,h])=>api.box({x,z,w:4,d:4,h,color:0xc8ae82,tex:'stone',house:false}));
    [[-5,35],[-6,26],[-5,8],[-3,0],[4,-8],[9,-19]].forEach(([x,z])=>MANNA.portions.push(api.gatherable({x,z,mesh:piece(),task:'manna',r:1.35})));
    // A broad dry-wadi crossing. One solo player occupies a ring; a family uses both.
    MANNA.bridge=api.box({x:-5,z:18,w:4,d:4,h:.3,y:-.05,hidden:true,color:0xc39b62,tex:'wood',house:false});
    MANNA.pads=api.teamPads({pads:[[-7.2,22],[-2.8,22]],onOpen(players){MANNA.bridgeOpen=true;MANNA.bridge.show(true);players.forEach(p=>api.servant(p,3));api.sfx('bridge');}});
    api.hazard({x:-10,z:18,w:20,d:2},{maxY:-.9,msg:'The dry wadi is deep. Work the two rings, then cross the broad plank.'});
    [[10,-3],[10,13],[10,29]].forEach(([x,z],i)=>{
      const tent=new T.Mesh(new T.ConeGeometry(2.7,3,4),api.texMat([0x8a6e51,0x9d7956,0x786653][i],'cloth'));tent.position.set(x+4,1.5,z-1);tent.rotation.y=Math.PI/4;api.add(tent);
      const person=api.crowdPerson(120+i,0x657b85,0xe1d1ae);person.position.set(x+2,0,z);api.add(person);
      const bowl=new T.Mesh(new T.SphereGeometry(.42,10,7),api.texMat(0xba855d,'clay'));bowl.scale.y=.45;bowl.position.set(x,.25,z);api.add(bowl);
      const food=piece();food.position.set(x,.45,z);food.visible=false;api.add(food);
      const h={x,z,served:false,food};MANNA.households.push(h);
      api.interact({x,z,r:2,label:'Share at this tent',can:()=>api.taskDone('manna')?true:'Follow the west dune loop first; the six portions are all on the way.',use(p){this.remove();h.served=true;food.visible=true;api.task('share');api.servant(p,4);
        if(!MANNA.saidRule){MANNA.saidRule=true;api.story([{art:'🗓️',title:'Trust God each day',text:'Some disobeyed and kept ordinary daily manna overnight: it bred worms and stank. God commanded a double portion on the sixth day; that portion kept for the Sabbath. On the seventh day there was none to gather (Exodus 16:19–30). Obedience meant trusting what God actually said.'}]);}
      }});
    });
    api.armor('sandals',-5,39);
    // A low wind-carved arch detour, a tall ridge, and a camp mat behind the last tent.
    api.box({x:-13,z:28,w:4,d:3,h:.8,color:0xc8ae82,house:false});api.fragment({x:-13,z:28,y:2});
    api.box({x:-14,z:-15,w:3,d:3,h:4.6,color:0xc8ae82,house:false});api.box({x:-11.5,z:-12.5,w:2,d:2,h:1.6,color:0xc8ae82,house:false});api.fragment({x:-14,z:-15,y:5.8});
    api.fragment({x:17,z:36,y:1.2});
    // A compact horseshoe over the dunes: out, turn, return above the first ledge.
    api.course([{x:-17,z:42,top:1,kind:'block'},{x:-14,z:42,top:1.8,kind:'crumble'},{x:-11,z:42,top:2.6,kind:'float'},
      {x:-11,z:39,top:3.4,kind:'crumble'},{x:-14,z:39,top:4.2,kind:'float'},{x:-17,z:39,top:5,kind:'float'}]);
    api.camZone({minX:-21,maxX:-9,minZ:36,maxZ:46,yaw:-.3,height:10,back:14,focus:[-14,3,40],pull:.2});
    api.trail([[-5,40],[-5,35],[-6,26],[-5,22],[-5,18],[-5,8],[-6,4],[-3,0],[0,-4],[4,-8],[9,-19],[10,-3],[10,13],[10,29],[0,41]],2.8);
    api.camZone({minX:-11,maxX:0,minZ:12,maxZ:25,yaw:.25,height:8,back:12,focus:[-5,0,16],pull:.2});
    api.camZone({minX:-10,maxX:9,minZ:-12,maxZ:11,yaw:.35,height:10,back:14,focus:[0,2,-4],pull:.25});
    api.camZone({minX:4,maxX:19,minZ:-25,maxZ:38,yaw:-.25,height:9,back:13,focus:[10,0,12],pull:.12});
  },
  update(api,dt){
    MANNA.windTime+=dt;
    for(const s of MANNA.windbreaks){
      if(s.latched&&!s.sheltered){s.turn=Math.min(1,s.turn+dt/.6);s.screen.rotation.y=s.dir*Math.PI/2*s.turn;if(s.turn===1)s.sheltered=true;}
      s.wheel.rotation.z=s.dir*s.work.progress*Math.PI*2;
      const cycle=(MANNA.windTime+s.phase)%6;
      s.state=s.sheltered?'sheltered':cycle<.9?'warning':cycle<3.3?'gust':'calm';
      s.strength=s.state==='gust'?Math.min(1,(cycle-.9)/.4,(3.3-cycle)/.4):0;
      s.flag.material.color.setHex(s.state==='warning'?0xf8ba47:s.state==='gust'?0xe7c388:0x78b6a1);
      s.flag.rotation.z=s.dir*s.strength*.25;s.flag.rotation.y=Math.sin(MANNA.windTime*(s.strength?13:2))*s.strength*.3;
      s.dust.visible=s.state==='gust'||s.state==='warning';s.dust.material.opacity=s.state==='warning'?.22:.6;
      for(let i=0;i<18;i++){const d=s.dummy,drift=((MANNA.windTime*(s.strength?6:1)+i*1.37)%22);d.position.set(s.dir>0?-16+drift:6-drift,.3+(i%4)*.18,s.z-4+(i*2.17)%8);d.updateMatrix();s.dust.setMatrixAt(i,d.matrix);}s.dust.instanceMatrix.needsUpdate=true;
      for(const p of api.activePlayers()){
        const inBand=p.pos.x>-16&&p.pos.x<6&&Math.abs(p.pos.z-s.z)<4.5;
        const inPocket=Math.abs(p.pos.x-s.x)<2.15&&Math.abs(p.pos.z-s.z)<2&&p.pos.y<=s.y+.6;
        if(inBand&&!inPocket&&!p.carriedBy&&!p.riding&&!p.seat&&s.strength>0)api.push(p,s.dir*3.5*s.strength,0,dt);
        if(inBand&&!s.warned){s.warned=true;api.toast('Amber flag: a gust is coming. Wait for the lull, or use the special action at the raised shelter ring.',4200);}
      }
    }
    if(!MANNA.entryCrossed&&api.activePlayers().some(p=>p.pos.z<47)){
      MANNA.entryCrossed=true;api.checkpoint({x:-5,z:44,label:'Manna camp checkpoint'});api.toast('One loop: gather along the west dunes, turn east at the far ridge, and share through camp on the way home.',4200);
    }
  },
  objective(api){
    if(!MANNA.entryCrossed&&api.activePlayers().every(p=>p.pos.z>=47)){
      const first=MANNA.windbreaks.find(s=>!s.sheltered);if(first)return[first.x,first.y+1,first.z];return[-5,1.5,44];
    }
    const m=MANNA.portions.find(x=>!x.got);if(m)return [m.x,m.y+1,m.z];const h=MANNA.households.find(x=>!x.served);return h?[h.x,1,h.z]:[0,1,41];},
  finale:{message:'The loop brings us home. Gather by the camp entrance.',beacon:[0,1,41],inZone:p=>Math.hypot(p.pos.x,p.pos.z-41)<5,
    onUpdate(api,t){if(t>.4&&!MANNA.told){MANNA.told=true;api.story([
      {art:'💧',title:'Later, water at Rephidim',text:'Later the people quarreled with Moses because they had no water. At God\'s command Moses struck the rock at Horeb, and God provided water. This was God\'s provision, not a reward for our serving bowls (Exodus 17:1–7).'},
      {art:'🍞',title:'The bread of life',text:'I am the bread of life: he that cometh to me shall never hunger; and he that believeth on me shall never thirst.',ref:'John 6:35'}
    ],()=>{MANNA.end=api.time;});}return MANNA.end!==undefined&&api.time-MANNA.end>1.5;}}
};
