/* Exodus 1:15–22; 2:1–10. The basket stays fixed among the flags.
 * The family explores an imagined riverbank route alongside Miriam; nobody steers a baby.
 */
const REEDS = { ferry:null, entryCrossed:false, dockReached:false, farReached:false, markers: [], pads: [], bridgeOpen:false, watching:false, told:false };
const LEVEL = {
  id: '3-1',
  bibleConnection: {"passage": "Exodus 1:22; 2:1–10", "text": "Pharaoh ordered Hebrew baby boys killed. Moses’ mother hid him among the reeds, his sister watched, and Pharaoh’s daughter spared him. Our boardwalk and family reed ferry are imagined bank crossings; nobody steers his basket or earns his rescue."},
  world: 'World 3-1',
  teamPads: false, rim: false,
  title: 'Among the Reeds',
  leafIcon:'🪷',leafColor:0xe8b9bf,courseTheme:'water',
  spawn:[0,80],bounds:{minX:-20,maxX:20,minZ:-39,maxZ:83},
  startMessage:"Gather on the ferry. Use the special action once to cross; it waits for friends.",
  intro:[{text:'And his sister stood afar off, to wit what would be done to him.',ref:'Exodus 2:4'}],
  introStory:[
    {art:'🧺',title:'A cruel command; a child spared',text:'Pharaoh ordered Hebrew baby boys killed. Moses\' mother hid him for three months, then put him in a waterproof basket among the reeds at the river\'s edge. His sister watched. Pharaoh\'s daughter found him crying and had compassion (Exodus 1:22; 2:1–6).'},
    {art:'🌿',title:'Just for our game',text:"Our ferry and footbridge are imagined. Gather aboard, then use the special action to cross. You can wade out of the shallows. Moses stays in his separate basket."}
  ],
  tasks:[{id:'bank',icon:'🌿',label:'Follow the three riverbank markers',total:3},{id:'watch',icon:'👀',label:'Reach Miriam\'s quiet lookout',total:1,lockedUntil:'bank'}],
  memoryVerse:{text:'And his sister stood afar off, to wit what would be done to him.',ref:'Exodus 2:4'},
  ending:{verse:{text:'And Pharaoh\'s daughter said to her, Go. And the maid went and called the child\'s mother.',ref:'Exodus 2:8'},message:'Pharaoh\'s cruel command did not stop God\'s care. Moses was spared, and his own mother nursed him.'},
  quiz:[
    {q:'Where did Moses\' mother put the basket?',ref:'Exodus 2:3',options:['Among the reeds by the river\'s edge','In a race down dangerous rapids','On top of a tower'],answer:0, explain: 'The basket was placed among the flags at the riverbank; it was not sent through rapids.'},
    {q:'Who watched from a distance?',ref:'Exodus 2:4',options:['A soldier','Moses\' sister','A fisherman'],answer:1, explain: 'His sister watched from a distance, then spoke to Pharaoh\'s daughter.'},
    {q:'Whom did Moses\' sister fetch to nurse the baby?',ref:'Exodus 2:7–9',options:['A boat builder','A palace guard','The child\'s own mother'],answer:2, explain: 'She fetched the baby\'s own mother, who was paid to nurse him.'}
  ],
  music:{bpm:88,notes:[69,0,72,74,76,74,72,0,69,67,69,72,74,72,69,0],bass:[45,45,41,41,43,43,45,45]},
  terrain(x,z){if(x<-9)return -1.8;if(z>46){const edge=Math.min(x+7,7-x,z-57,71-z);return edge>0?-.65*Math.min(1,edge/1.5):0;} if((Math.abs(z-17)<1.1||Math.abs(z+5)<1.1)&&x<10)return -1.45;return Math.sin(x*.2)*Math.sin(z*.15)*.04;},
  groundColor(x,z,h){return h<-.5?0x9e987c:Math.abs(x)<5?0xd5c698:0x7eaa73;},
  build(api){
    const T=api.THREE;
    const pool=(x,z,w,d,y=-.55)=>{const m=new T.Mesh(new T.PlaneGeometry(w,d),new T.MeshPhongMaterial({color:0x4a9eb5,transparent:true,opacity:.8,shininess:25}));m.rotation.x=-Math.PI/2;m.position.set(x,y,z);api.add(m);};
    // The family ferry is an imagined exploration device, far from Moses' fixed basket.
    // All ordinary roles can wade out of this shallow inlet if they miss or leave the deck.
    pool(0,64,14,14,-.3);
    [[-2,78,3.8,2.8,.45],[0,76,7,4,.45],[0,52,7,4,.45],[3,49,3.8,2.8,.75],[0,46.5,3.8,2.8,.35]].forEach(([x,z,w,d,h])=>{
      const b=api.box({x,z,w,d,h,y:0,color:0xbcab83,tex:'wood',house:false});
      const strips=new T.Group();strips.position.set(x,h+.02,z);
      for(let k=-d/2+.3;k<d/2;k+=.55){const seam=new T.Mesh(new T.BoxGeometry(w-.1,.025,.035),api.mat(0x795c3d));seam.position.z=k;strips.add(seam);}api.add(strips);
    });
    const f=REEDS.ferry={z:71.5,target:71.5,near:71.5,far:56.5,state:'idle',mode:'party',origin:71.5,ready:true,warned:false};
    f.mover=api.mover({w:6.8,d:4.8,h:.35,color:0x9d8050,path:()=>[0,.1,f.z]});f.mover.mesh.material=api.texMat(0x9d8050,'weave');f.mover.mesh.name='family-reed-ferry';
    const reedMat=api.texMat(0xaf975e,'bark'),ferryDummy=new T.Object3D(),bundles=new T.InstancedMesh(new T.CylinderGeometry(.3,.3,6.7,10),reedMat,8);
    for(let k=0;k<8;k++){ferryDummy.position.set(0,-.35,-2.1+k*.6);ferryDummy.rotation.set(0,0,Math.PI/2);ferryDummy.updateMatrix();bundles.setMatrixAt(k,ferryDummy.matrix);}f.mover.mesh.add(bundles);
    for(const x of [-2.5,2.5]){const tie=new T.Mesh(new T.BoxGeometry(.08,.045,4.65),api.texMat(0x6f5538,'wood'));tie.position.set(x,.2,0);f.mover.mesh.add(tie);}
    const wheel=new T.Mesh(new T.TorusGeometry(.3,.065,8,16),api.texMat(0x6f5538,'wood'));wheel.position.set(2.5,.85,0);f.mover.mesh.add(wheel);f.wheel=wheel;
    const mast=new T.Mesh(new T.CylinderGeometry(.065,.075,.9,8),api.texMat(0x6f5538,'wood'));mast.position.set(2.5,.45,0);f.mover.mesh.add(mast);
    const rope=new T.Line(new T.BufferGeometry().setFromPoints([new T.Vector3(3.6,1.1,77.5),new T.Vector3(2.5,1.1,71.5),new T.Vector3(3.6,1.1,50.5)]),new T.LineBasicMaterial({color:0x6f5538}));api.add(rope);f.rope=rope;
    for(const z of [77.5,50.5])api.box({x:3.6,z,w:.25,d:.25,h:1.4,color:0x6f5538,tex:'wood',house:false});
    const above=p=>!p.bubble&&!p.carriedBy&&Math.abs(p.pos.x)<3.25&&Math.abs(p.pos.z-f.mover.pos.z)<2.25&&p.pos.y>-.1&&p.pos.y<3.6;
    f.above=above;
    const aboard=p=>above(p)&&p.onGround&&p.standingOn===f.mover.platform&&!p.riding&&!p.seat;
    f.aboard=aboard;
    // Dry land beyond either dock also counts: scouts never have to walk back to an exact ring.
    f.onBank=(p,z)=>{const foot=p.carriedBy||p;return !p.bubble&&!foot.bubble&&foot.onGround&&foot.pos.y>-.1&&(z===f.far?foot.pos.z<54.2:foot.pos.z>73.8);};
    f.atDestination=p=>f.onBank(p,f.target);
    f.safe=p=>above(p)||(p.carriedBy&&above(p.carriedBy))||f.atDestination(p);
    f.boarded=p=>aboard(p)||(p.carriedBy&&aboard(p.carriedBy))||f.atDestination(p);
    f.action=api.interact({x:0,z:f.z,y:.45,r:3.7,vRange:3.3,label:'Cross the inlet',
      status(){
        if(f.state==='moving')return 'Crossing the inlet…';
        if(f.state==='waiting'){const missing=api.players().filter(p=>!f.boarded(p)).map(p=>'P'+(p.slot+1));return 'Waiting for '+(missing.join(', ')||'friends')+'. Climb aboard.';}
        return !f.ready?'Arrived. Step ashore.':null;
      },
      can:p=>above(p)&&(f.state!=='idle'||!f.ready)||aboard(p)?true:'Climb onto the reed deck.',
      use(){
        // One request starts a trip. Waiting and continuing are automatic; repeated presses are harmless.
        if(f.state!=='idle'||!f.ready)return;
        f.origin=Math.abs(f.z-f.far)<.05?f.far:f.near;f.target=f.origin===f.near?f.far:f.near;
        f.mode='party';f.state='waiting';f.warned=false;api.sfx('rope');
      }
    });
    f.calls=[];
    [[2.4,76,f.near],[-2.4,52,f.far]].forEach(([x,z,target])=>{
      const call=new T.Mesh(new T.TorusGeometry(.3,.065,8,16),api.texMat(0x6f5538,'wood'));call.position.set(x,1.25,z);api.add(call);
      const post=new T.Mesh(new T.BoxGeometry(.13,1,.13),api.texMat(0x6f5538,'wood'));post.position.set(x,.8,z+.1);api.add(post);
      f.calls.push(api.interact({x,z,y:.45,r:2.6,vRange:.7,label:'Call ferry',available:p=>!above(p)&&Math.abs(f.z-target)>.1,
        status:()=>f.state==='moving'&&f.mode==='empty'&&f.target===target?'The ferry is coming…':null,
        can:()=>api.players().some(above)?'Friends are riding. Wait for the ferry.':f.state==='moving'&&f.target!==target?'Wait for the ferry to arrive.':true,
        use(){if(f.state==='moving')return;f.target=target;f.mode='empty';f.state='moving';api.sfx('rope');}
      }));
    });
    api.leaves([[-2,78,1.45],[0,76,1.45],[0,52,1.45],[3,49,1.75],[0,46.5,1.35],[0,43]]);
    api.camZone({minX:-9,maxX:10,minZ:68,maxZ:83,yaw:-.15,height:9,back:14,focus:[0,0,70],pull:.25});
    api.camZone({minX:-9,maxX:10,minZ:48,maxZ:68,yaw:.2,height:9,back:14,focus:[0,0,58],pull:.25});
    pool(-26,3,34,180);[17,-5].forEach(z=>pool(.5,z,19,1.9));
    api.hazard({x:-15,z:22,w:12,d:130},{maxY:-.8,msg:'Splash! Stay on the riverbank; the basket is safe among the reeds.'});
    [17,-5].forEach(z=>api.hazard({x:.5,z,w:19,d:1.8},{maxY:-.85,msg:'Hop the pale bank stones, or switch to the Fisherman to wade.',except:p=>p.role.id==='fisherman'}));
    [17,-5].forEach(z=>api.box({x:0,z,w:2.4,d:1.8,h:.45,y:-.2,color:0xd7d0b4,tex:'stone',house:false}));
    api.box({x:2,z:7,w:4.2,d:4,h:.9,color:0xc2b696,house:false});
    api.box({x:-1,z:-20.3,w:3.2,d:2.4,h:.9,color:0xc2b696,house:false});
    api.box({x:-3,z:-24,w:5,d:4,h:1.8,color:0xc2b696,house:false});
    [[0,32,0],[2,7,.9],[-3,-24,1.8]].forEach(([x,z,y])=>REEDS.markers.push(api.zone({x,z,y,vRange:.65,r:1.5,time:.6,color:0xbce3b0,onDone(){api.task('bank');}})));
    // Reeds are batched; the open bank keeps the next landing visible.
    const stalks=[],heads=[];for(let z=80;z>-35;z-=2)for(let k=0;k<3;k++){stalks.push([-8.7-k*.65,z+k*.4]);}
    const batch=new T.InstancedMesh(new T.CylinderGeometry(.035,.05,1.8,5),api.texMat(0x709455,'bark'),stalks.length),dummy=new T.Object3D();
    stalks.forEach(([x,z],i)=>{dummy.position.set(x,.35,z);dummy.rotation.set(0,0,Math.sin(i)*.09);dummy.updateMatrix();batch.setMatrixAt(i,dummy.matrix);});api.add(batch);
    const basket=new T.Mesh(new T.SphereGeometry(.65,14,9),api.texMat(0xb68c52,'weave'));basket.scale.set(1,.5,.8);basket.position.set(-11.4,-.2,-29);api.add(basket);REEDS.basket=basket;
    const cloth=new T.Mesh(new T.SphereGeometry(.49,12,8),api.texMat(0xf2e7cd,'cloth'));cloth.scale.set(1,.18,.8);cloth.position.set(-11.4,.03,-29);api.add(cloth);
    const daughter=api.person(0x9c6e9e,0xe6cf8e,1);daughter.position.set(-7.6,0,-31);api.add(daughter);
    const miriam=api.person(0x48798b,0xe4d8bc,1,{age:'child'});miriam.position.set(-4.5,0,34);api.add(miriam);REEDS.miriam=miriam;
    api.tree(13,31,1.2);api.tree(14,-25,1.4);api.armor('sandals',0,38);
    api.fragment({x:-12,z:18,y:-.2,net:true});
    // Optional shared reed footbridge; solo Builder can pin the two separate supports.
    REEDS.bridge=api.box({x:7,z:-5,w:3.2,d:4.6,h:.22,y:.1,hidden:true,color:0xbc9c62,tex:'wood',house:false});
    [[5.3,-1],[8.7,-1]].forEach(([x,z])=>{const pad=api.zone({x,z,r:1,time:999,color:0xe7ba63});const s={x,z,pad,latched:false};REEDS.pads.push(s);
      api.interact({x,z,r:1.2,label:'Pin reed bridge support',can:p=>p.role.strong?true:'The Builder can pin a support; teammates can stand on both rings.',use(){s.latched=true;pad.show(false);this.remove();api.sfx('rope');}});});
    api.fragment({x:7,z:-5,y:1.5});
    // Every role can hop the low lookout; the Scribe reads the tucked scroll there.
    api.stump(10,7,.7,1.1);api.stump(12.3,5,1.5,1.1);
    api.box({x:14.8,z:2.8,w:3.2,d:3.2,h:2.3,color:0xc2b696,house:false});
    REEDS.note=api.fragment({x:14.8,z:2.8,y:20});REEDS.note.mesh.visible=false;
    const note=new T.Mesh(new T.BoxGeometry(.6,.08,.5),api.mat(0xf0dfb5));note.position.set(14.8,2.42,2.8);api.add(note);
    api.interact({x:14.8,z:2.8,y:2.3,r:1.5,vRange:.8,label:'Read the tucked scroll',can:p=>p.role.id==='scribe'?true:'The Scribe can read the tucked scroll on this imagined lookout.',use(){this.remove();note.visible=false;REEDS.note.y=REEDS.note.baseY=3.5;REEDS.note.mesh.visible=true;api.sfx('page');}});
    // The optional course crosses the river on log-islands, starting on the dry bank.
    api.course([{x:-8,z:35,top:1,kind:'block'},{x:-11,z:33,top:1.4,kind:'float'},{x:-14,z:31,top:2.2,kind:'float'},
      {x:-16,z:28,top:3,kind:'crumble'},{x:-13,z:26,top:3.8,kind:'float'}]);
    api.camZone({minX:-19,maxX:-4,minZ:23,maxZ:39,yaw:-.25,height:9,back:13,focus:[-12,2,31],pull:.22});
    api.trail([[0,40],[0,32],[0,22],[0,17],[0,13],[2,7],[0,0],[0,-5],[-1,-14],[-1,-20.3],[-3,-24],[-5,-29]],2.8);
    api.camZone({minX:-7,maxX:10,minZ:12,maxZ:23,yaw:.25,height:8,back:12,focus:[0,0,14],pull:.25});
    api.camZone({minX:-7,maxX:10,minZ:-10,maxZ:1,yaw:-.25,height:8,back:12,focus:[0,0,-8],pull:.25});
    api.camZone({minX:-9,maxX:3,minZ:-35,maxZ:-16,yaw:-.4,height:9,back:13,focus:[-9,0,-29],pull:.22});
  },
  update(api,dt){
    const f=REEDS.ferry;
    if(f.state==='idle'&&!f.ready&&!api.players().some(f.above))f.ready=true;
    if(f.state==='moving'&&f.mode==='empty'&&api.players().some(f.above)){f.mode='party';f.state='waiting';}
    if(f.mode==='party'&&(f.state==='moving'||f.state==='waiting')){
      if(api.players().every(f.state==='waiting'?f.boarded:f.safe))f.state='moving';
      else {
        if(f.state==='moving'&&!f.warned){f.warned=true;api.toast('Climb back aboard. The ferry will wait.',2600);}
        f.state='waiting';
        // A whole party recovering back at its departure dock gets the empty ferry back automatically.
        if(!api.players().some(f.above)&&api.players().every(p=>f.onBank(p,f.origin))){f.target=f.origin;f.mode='empty';f.state='moving';}
      }
    }
    if(f.state==='moving'){
      const step=Math.min(Math.abs(f.target-f.z),dt*3.6);f.z+=Math.sign(f.target-f.z)*step;
      f.wheel.rotation.z-=Math.sign(f.target-f.mover.pos.z)*dt*3;
      api.players().filter(f.above).forEach(p=>p.workT=.2);
      if(Math.abs(f.target-f.z)<.001){f.z=f.target;f.ready=f.mode==='empty';f.state='idle';}
    }
    f.action.z=f.mover.pos.z;
    const cable=f.rope.geometry.attributes.position;cable.setZ(1,f.mover.pos.z);cable.needsUpdate=true;
    if(!REEDS.dockReached&&api.activePlayers().some(p=>p.onGround&&Math.abs(p.pos.x)<3&&p.pos.z>74&&p.pos.z<77)){
      REEDS.dockReached=true;api.checkpoint({x:0,z:76,y:.45,label:'Reed ferry checkpoint'});
    }
    if(!REEDS.farReached&&api.activePlayers().some(p=>p.onGround&&Math.abs(p.pos.x)<3&&p.pos.z>50&&p.pos.z<54)){
      REEDS.farReached=true;api.checkpoint({x:0,z:52,y:.45,label:'Far bank checkpoint'});
    }
    if(!REEDS.entryCrossed&&api.activePlayers().some(p=>p.pos.z<46)){
      REEDS.entryCrossed=true;api.checkpoint({x:0,z:43.5,label:'Riverbank checkpoint'});api.toast('Follow the pale stones past three lookout markers. Moses stays safe in his separate basket.',3400);
    }
    if(!REEDS.bridgeOpen&&REEDS.pads.every(s=>s.latched||api.near(s.x,s.z,1.05).some(p=>Math.abs(p.pos.y)<.6))){REEDS.bridgeOpen=true;REEDS.bridge.show(true);REEDS.pads.forEach(s=>s.pad.show(false));api.sfx('bridge');}
    const n=api.taskCount('bank'),targets=[[ -4.5,34],[ -4.5,12],[ -5,-14],[ -5.5,-29]],q=targets[Math.min(3,n)],m=REEDS.miriam;
    const dx=q[0]-m.position.x,dz=q[1]-m.position.z,d=Math.hypot(dx,dz);if(d>.1){m.position.x+=dx/d*Math.min(d,dt*2.5);m.position.z+=dz/d*Math.min(d,dt*2.5);m.position.y=api.terrain(m.position.x,m.position.z);m.rotation.y=Math.atan2(dx,dz);}
    if(!REEDS.watching&&api.taskDone('bank')&&api.near(-5,-29,3).length){REEDS.watching=true;api.task('watch');}
  },
  objective(api){
    if(!REEDS.entryCrossed&&api.activePlayers().every(p=>p.pos.z>=46)){
      const front=Math.min(...api.activePlayers().map(p=>p.pos.z));
      if(front>77)return[-2,1.5,78];
      if(!REEDS.farReached)return Math.abs(REEDS.ferry.z-REEDS.ferry.near)>.1&&front>74?[2.4,1.6,76]:[0,1.6,REEDS.ferry.mover.pos.z];
      return front>50?[3,1.8,49]:[0,1.4,43.5];
    }
    const z=REEDS.markers.find(s=>!s.done);return z?[z.x,z.y+1,z.z]:[-5,1,-29];},
  finale:{message:'Gather quietly at Miriam\'s lookout on the bank.',beacon:[-5,1,-29],inZone:p=>Math.hypot(p.pos.x+5,p.pos.z+29)<4,
    onUpdate(api,t){if(t>.4&&!REEDS.told){REEDS.told=true;api.story([
      {art:'👩‍🍼',title:'His own mother',text:'And Pharaoh\'s daughter said to her, Go. And the maid went and called the child\'s mother.',ref:'Exodus 2:8'},
      {art:'🌿',title:'Moses is spared',text:'Moses\' mother nursed him. Later he became Pharaoh\'s daughter\'s son, and she named him Moses (Exodus 2:9–10). Pharaoh commanded death, but God preserved the child He would later send to lead Israel out of slavery.'}
    ],()=>{REEDS.end=api.time;});}return REEDS.end!==undefined&&api.time-REEDS.end>1.5;}}
};
