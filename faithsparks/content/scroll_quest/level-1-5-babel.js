/* Genesis 11:1–9. An imagined observation route, never a job to complete Babel.
 * Rise around the brickwork, cross a counterweight footbridge, then descend outside.
 * Languages, God's judgment and scattering are narrated; player controls stay clear.
 */
const BABEL = { landings: [], pads: [], bridgeOpen: false, told: false, atGate: false };
const LEVEL = {
  id: '1-5',
  bibleConnection: {"passage": "Genesis 11:1–9", "text": "The people sought a great name and resisted being scattered. God confused their language and scattered them. Our scaffold course explores the unfinished city; finishing our route never completes their proud tower."},
  world: 'World 1-5',
  teamPads: false,
  title: 'The Tower of Babel',
  town: true, courseTheme: 'sand', time: 'sunset', leafIcon: '🧱', leafColor: 0xe3ab7b,
  spawn: [0,79], bounds: {minX:-21,maxX:21,minZ:-41,maxZ:82},
  startMessage: 'Just for our game: hop through the brick yard, then explore the unfinished tower.',
  intro:[{text:'So the LORD scattered them abroad from thence upon the face of all the earth: and they left off to build the city.',ref:'Genesis 11:8'}],
  introStory:[
    {art:'🧱',title:'A name for ourselves',text:'After the flood, people settled in Shinar. They wanted a city and tower to make a name for themselves and avoid being scattered. The LORD confused their language and scattered them over the earth. Their proud plan could not overrule God (Genesis 11:1–9).'},
    {art:'🪜',title:'Just for our game',text:"Our scaffold climb and bridge are imagined. Climb the marked landings, then go down the stairs. God scattered the proud builders; climbing does not cause Him to act."}
  ],
  tasks:[{id:'route',icon:'🪜',label:'Reach the three scaffold landings',total:3},{id:'outside',icon:'👣',label:'Descend to the outside meeting place',total:1,lockedUntil:'route'}],
  memoryVerse:{text:'So the LORD scattered them abroad from thence upon the face of all the earth: and they left off to build the city.',ref:'Genesis 11:8'},
  ending:{verse:{text:'Pride goeth before destruction, and an haughty spirit before a fall.',ref:'Proverbs 16:18'},message:'God opposed their pride and scattered them. We depend on Him, not on making a great name for ourselves.'},
  quiz:[
    {q:'Why did the people want the city and tower?',ref:'Genesis 11:4',options:['To obey a command to build a tower','To make a name and avoid being scattered','To rescue someone on a roof'],answer:1, explain: 'They wanted a name for themselves and resisted being scattered across the earth.'},
    {q:'What did the LORD do at Babel?',ref:'Genesis 11:7–9',options:['Confused their language and scattered them','Destroyed the tower with a flood','Rewarded their pride'],answer:0, explain: 'The LORD confused their language and scattered them. Scripture does not say another flood destroyed the tower.'},
    {q:'What happened to the building work?',ref:'Genesis 11:8',options:['The players finished it for God','It reached heaven','They left off building the city'],answer:2, explain: 'They stopped building the city. Our imagined climb never completes their proud project.'}
  ],
  music:{bpm:88,notes:[62,65,67,0,69,67,65,62,60,62,65,0,67,65,62,0],bass:[38,38,43,43,45,45,38,38]},
  terrain(){return 0;}, groundColor(x,z){return Math.abs(x)<8?0xcba77d:0xb9956c;},
  build(api){
    const T=api.THREE;
    // An imagined brick-drying yard, with low stack jumps and an optional kiln overlook.
    // Missed jumps return to dry ground. These are observation paths, never building Babel.
    const entry=BABEL.entry={done:false,route:[],sideRoute:[]};
    const stack=(x,z,h,w=5.4,d=4)=>{api.box({x,z,w,d,h,tex:'brick',color:0xb87950,house:false});return [x,h,z];};
    entry.route.push(stack(0,74,.6),stack(-3,69,1.15),stack(0,64,.75),stack(3,59,.55),stack(0,53,.35));
    entry.sideRoute.push(stack(-7,70,.55,4,4),stack(-10,65,1.1,5,5));
    entry.discovery=api.discovery({id:'brick-yard-overlook',name:'The brick-yard overlook',x:-10,z:65,y:1.1,r:1.6,vRange:.65});
    const yard=new T.Group();yard.name='babel-brick-yard';
    const detail=(x,y,z,w,h,d,c,tex)=>{const m=new T.Mesh(new T.BoxGeometry(w,h,d),api.texMat(c,tex));m.position.set(x,y,z);m.castShadow=true;yard.add(m);return m;};
    // Drying rows stay beside the route; low stack sides show actual brick courses.
    for(const side of [-1,1])for(let row=0;row<5;row++)for(let brick=0;brick<3;brick++)detail(side*(12+brick*.9),.16,76-row*5,.8,.3,1.4,row%2?0xad714f:0xc88d61,'brick');
    const kiln=new T.Mesh(new T.CylinderGeometry(1.7,2.2,2.2,12),api.texMat(0x9a6348,'brick'));kiln.position.set(-15,1.1,63);yard.add(kiln);
    detail(-15,.55,65.04,1.15,1.1,.04,0x382c29,'stone');
    api.scenery(yard);
    api.leaves(entry.route.map(([x,y,z])=>[x,z,y+1]).concat([[-7,70,1.55],[-10,65,2.1],[0,77],[0,47]]));
    api.camZone({minX:-17,maxX:17,minZ:46,maxZ:82,yaw:.2,height:11,back:17,focus:[0,1,64],pull:.12});

    // The tower is a backdrop beside the route; front scaffolds leave landings visible.
    api.box({x:-10,z:10,w:7,d:28,h:12.5,color:0xa66b48,tex:'brick',house:false});
    [3,6,9,12.5].forEach(y=>{const m=new T.Mesh(new T.BoxGeometry(7.4,.18,28.4),api.texMat(0xd7b18a,'brick'));m.position.set(-10,y,10);api.add(m);});
    for(let i=0;i<5;i++){const m=api.crowdPerson(i+80,0x8e6749,0xdfcda9);m.position.set(11+i%2*3,0,36-i*9);api.add(m);}
    const route=[[0,34,1],[-3,30,2],[-4,26,3],[0,22,4],[4,18,5],[5,14,6],[2,10,7],[0,6,8],[0,2,9],
      [0,-2,8],[3,-6,7],[5,-10,6],[3,-14,5],[0,-18,4],[-3,-22,3],[0,-26,2],[0,-30,1]];
    BABEL.steps=route.map(([x,z,top],i)=>api.box({x,z,w:4.6,d:4.6,h:.3,y:top-.3,hidden:i===7,color:i<9?0xc69a62:0xd4b889,tex:i<9?'wood':'stone',house:false}));
    BABEL.bridge=BABEL.steps[7];
    BABEL.bridge.mesh.visible=true;BABEL.bridge.mesh.rotation.x=Math.PI/2;BABEL.bridge.platform.on=false;
    route.slice(0,9).forEach(([x,z,top])=>{
      [-1.9,1.9].forEach(dx=>{const m=new T.Mesh(new T.CylinderGeometry(.1,.13,top,6),api.texMat(0x725234,'wood'));m.position.set(x+dx,top/2,z);api.add(m);});
      // Pale nosings make the playable deck distinct from the background tower.
      const edge=new T.Mesh(new T.BoxGeometry(4.5,.045,.16),api.mat(0xf0d7a3));edge.position.set(x,top+.025,z+2.15);api.add(edge);
    });
    [[-4,26,3],[5,14,6],[0,2,9]].forEach(([x,z,y])=>{
      const ring=api.zone({x,z,y,vRange:.65,r:1.4,time:.65,color:0xd8e8bb,onDone(){api.task('route');}});BABEL.landings.push(ring);
    });
    // Separate stations: two teammates hold them, or a solo Builder latches each.
    [[3.4,14.8],[6.8,13.2]].forEach(([x,z])=>{
      const pad=api.zone({x,z,y:6,r:1,time:999,color:0xe7ba63});
      const station={x,z,y:6,pad,latched:false};BABEL.pads.push(station);
      const post=new T.Mesh(new T.BoxGeometry(.2,2.5,.25),api.texMat(0x715033,'wood'));post.position.set(x,7.25,z-.4);api.add(post);
      const wheel=new T.Mesh(new T.TorusGeometry(.35,.07,7,14),api.texMat(0x9a7a48,'bronze'));wheel.position.set(x,7.15,z-.23);api.add(wheel);station.wheel=wheel;
      const weight=new T.Mesh(new T.BoxGeometry(.6,.8,.6),api.texMat(0xb88661,'brick'));weight.position.set(x,8,z-.6);api.add(weight);station.weight=weight;
      const line=new T.Line(new T.BufferGeometry().setFromPoints([new T.Vector3(x,8.5,z-.4),new T.Vector3(x,9,z-1),new T.Vector3(x<5?-1.5:1.5,9,6)]),new T.LineBasicMaterial({color:0x8d744c}));api.add(line);
      api.interact({x,z,y:6,r:1.15,vRange:1,label:'Latch counterweight',can:p=>p.role.strong?true:'The Builder can latch a station alone; teammates can stand on both rings.',use(){station.latched=true;pad.show(false);this.remove();api.sfx('winch');}});
    });
    // A side fragment is approached from the third landing, not another roof ladder.
    api.box({x:4.6,z:1,w:2.5,d:3,h:.3,y:8.7,color:0xd4b889,house:false});api.fragment({x:4.6,z:1,y:10.2});
    api.box({x:10,z:35,w:3,d:3,h:1.1,color:0xa46943,tex:'brick',house:false});api.fragment({x:10,z:35,y:2.3});
    api.box({x:14,z:-26,w:3,d:3,h:4.6,color:0xa46943,tex:'brick',house:false});
    api.box({x:11.5,z:-23.5,w:2,d:2,h:1.6,color:0xb79362,house:false});api.fragment({x:14,z:-26,y:5.8});
    api.armor('helmet',0,38);api.armor('belt',0,-34);
    // A rising turn around the outer scaffold, not the main route's zigzag.
    api.course([{x:17,z:38,top:1,kind:'block'},{x:14,z:36,top:2,kind:'crumble'},{x:14,z:33,top:3,kind:'float'},
      {x:17,z:31,top:4,kind:'crumble'},{x:19,z:33,top:5,kind:'float'},{x:17,z:35,top:6,kind:'float'}]);
    api.camZone({minX:11,maxX:21,minZ:28,maxZ:41,yaw:-.3,height:10,back:14,focus:[16,3,34],pull:.2});
    api.trail([[0,40],[0,34],[-3,30],[-4,26],[0,22],[4,18],[5,14],[2,10],[0,6],[0,2],[0,-2],[3,-6],[5,-10],[3,-14],[0,-18],[-3,-22],[0,-26],[0,-30],[0,-36]],3);
    [[18,37],[6,25],[-6,8],[-24,-6]].forEach(([a,b],i)=>api.camZone({minX:-6,maxX:9,minZ:Math.min(a,b),maxZ:Math.max(a,b),yaw:i<2?.32:-.25,height:10,back:14,focus:i===0?[0,4,22]:i===1?[0,8,6]:i===2?[3,6,-10]:[0,2,-29],pull:.24}));
  },
  update(api,dt){
    if(BABEL.entry&&!BABEL.entry.done&&api.activePlayers().some(p=>p.pos.z<46)){
      BABEL.entry.done=true;api.checkpoint({x:0,z:44,label:'Unfinished city'});api.toast('Climb the three marked scaffold landings.',2600);
    }
    if(!BABEL.bridgeHint&&api.near(5,14,4.5).some(p=>p.pos.y>5)){BABEL.bridgeHint=true;api.toast('Two teammates hold separate rings. Alone? Switch to Builder and latch each counterweight.',4500);}
    if(BABEL.bridgeOpen&&BABEL.bridgeT<1){BABEL.bridgeT=Math.min(1,BABEL.bridgeT+dt/.45);BABEL.bridge.mesh.rotation.x=Math.PI/2*(1-BABEL.bridgeT);BABEL.pads.forEach(s=>{s.weight.position.y=8-BABEL.bridgeT*.7;s.wheel.rotation.z=BABEL.bridgeT*Math.PI;});if(BABEL.bridgeT===1)BABEL.bridge.platform.on=true;}
    if(!BABEL.bridgeOpen&&BABEL.pads.every(s=>s.latched||api.near(s.x,s.z,1.05).some(p=>Math.abs(p.pos.y-s.y)<.7))){
      BABEL.bridgeOpen=true;BABEL.bridgeT=0;BABEL.bridge.show(true);BABEL.bridge.platform.on=false;BABEL.pads.forEach(s=>s.pad.show(false));api.sfx('bridge');api.toast('The counterweight footbridge is secure. The pale deck leads to the last landing.',3500);
    }
    if(api.taskDone('route')&&!BABEL.atGate&&api.near(0,-36,4).length){BABEL.atGate=true;api.task('outside');}
  },
  objective(api){if(BABEL.entry&&!BABEL.entry.done){const p=api.activePlayers()[0];if(p)return BABEL.entry.route.find(r=>p.pos.z>r[2]+1)||[0,1,44];}const i=BABEL.landings.findIndex(z=>!z.done);if(i<0)return [0,1,-36];if(i===2&&!BABEL.bridgeOpen){const s=BABEL.pads.find(p=>!p.latched&&!api.near(p.x,p.z,1.05).some(q=>Math.abs(q.pos.y-6)<.7))||BABEL.pads.find(p=>!p.latched)||BABEL.pads[0];return [s.x,7,s.z];}const z=BABEL.landings[i];return [z.x,z.y+1,z.z];},
  finale:{message:'Gather outside the unfinished city.',beacon:[0,1,-36],inZone:p=>Math.hypot(p.pos.x,p.pos.z+36)<5,
    onUpdate(api,t){if(t>.4&&!BABEL.told){BABEL.told=true;api.story([
      ...(api.shownRef('Genesis 11:8')?[]:[{art:'🌍',title:'Scattered over the earth',text:'So the LORD scattered them abroad from thence upon the face of all the earth: and they left off to build the city.',ref:'Genesis 11:8'}]),
      {art:'❤️',title:'A name God gives',text:'Pride cannot bring us to God. Later God promised to bless all families through Abraham (Genesis 12:3). Jesus saves people from every nation by grace, not by achievements or points (Ephesians 2:8–9).'}
    ],()=>{BABEL.end=api.time;});}return BABEL.end!==undefined&&api.time-BABEL.end>1.5;}}
};
