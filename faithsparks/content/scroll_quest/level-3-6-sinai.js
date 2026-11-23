/* Exodus 19–20. All play, secrets and courses stay BELOW the boundary.
 * A permanent solid barrier has no score, route or collectible behind it.
 * God's coming and His law are Bible history, not effects triggered by our checkpoints.
 */
const SINAI = { markers:[], assembled:false, told:false, elapsed:0, crowd:[], clouds:[], lamps:[], nextThunder:5.5 };
// Scenery only: this height field ends several metres beyond the marked holy boundary.
function sinaiMountain(api){
  const T=api.THREE,geo=new T.PlaneGeometry(58,42,44,30),p=geo.attributes.position,col=[],uv=[];
  for(let i=0;i<p.count;i++){
    const x=p.getX(i),z=p.getY(i)-46,u=(z+67)/42,edge=Math.pow(Math.max(0,1-Math.pow(Math.abs(x)/29,4)),.6)*Math.pow(Math.max(0,Math.sin(u*Math.PI)),.7);
    const ridge=Math.max(27*Math.max(0,1-Math.abs((x+6)/17))*Math.exp(-Math.pow((z+46)/14,2)),21*Math.max(0,1-Math.abs((x-14)/14))*Math.exp(-Math.pow((z+43)/14,2)),19*Math.max(0,1-Math.abs((x+21)/13))*Math.exp(-Math.pow((z+45)/13,2)));
    const fracture=Math.abs(Math.sin(x*.55+z*.18))*1.8+Math.sin(x*.22-z*.38)*1.1;
    const y=-2+edge*(ridge+fracture),c=new T.Color(0x747b7d).multiplyScalar(.82+.12*Math.sin(y*1.7+Math.sin(x*.19)*1.2)+Math.min(1,y/24)*.12);
    p.setXYZ(i,x,y,z);col.push(c.r,c.g,c.b);uv.push(x/4,z/4);
  }
  const ix=geo.index.array;for(let i=0;i<ix.length;i+=3){const a=ix[i+1];ix[i+1]=ix[i+2];ix[i+2]=a;}
  geo.setAttribute('color',new T.Float32BufferAttribute(col,3));geo.setAttribute('uv',new T.Float32BufferAttribute(uv,2));geo.computeVertexNormals();
  const mat=api.texMat(0xffffff,'stone').clone();mat.vertexColors=true;mat.side=T.DoubleSide;
  const mountain=new T.Mesh(geo,mat);mountain.name='sinai-broken-ridges';mountain.castShadow=true;mountain.receiveShadow=true;api.add(mountain);SINAI.mountain=mountain;
  // Feathered mist layers merge into a cloud silhouette without hard sphere outlines.
  [[-5,21,-46,16,5,7],[8,18,-41,14,4,7],[-15,16,-42,11,4,6]].forEach(([x,y,z,w,h,d],n)=>{
    const points=[],colors=[];
    for(let i=0;i<24;i++){
      const angle=i*2.4+n,r=Math.sqrt((i+.5)/24),yy=Math.cos(angle*1.7)*h*.35;
      points.push(Math.sin(angle)*w*r*.65,yy,Math.cos(angle)*d*r*.5);
      const c=new T.Color(0x566271).lerp(new T.Color(0x89939d),(yy/h+.5)*.65);colors.push(c.r,c.g,c.b);
    }
    const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(points,3));g.setAttribute('color',new T.Float32BufferAttribute(colors,3));
    const m=new T.Points(g,sinaiMistMaterial(api,{size:12,opacity:.42,vertexColors:true,fog:false}));m.name='sinai-cloud-bank';m.frustumCulled=false;m.position.set(x,y,z);api.add(m);SINAI.clouds.push({mesh:m,base:m.position.clone()});
  });
  const pts=new Float32Array(16*3),g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(pts,3));
  const smoke=new T.Points(g,sinaiMistMaterial(api,{color:0xb7b4ad,size:5.5,opacity:.12}));smoke.name='sinai-summit-smoke';smoke.frustumCulled=false;api.add(smoke);SINAI.smoke=smoke;
}
function sinaiMistMaterial(api,options){
  const T=api.THREE;
  if(!SINAI.mistMap){
    const n=64,data=new Uint8Array(n*n*4);
    for(let y=0;y<n;y++)for(let x=0;x<n;x++){const r=Math.hypot((x+.5-n/2)/(n/2),(y+.5-n/2)/(n/2)),k=(y*n+x)*4;data[k]=data[k+1]=data[k+2]=255;data[k+3]=Math.round(Math.exp(-r*r*2.6)*Math.pow(Math.max(0,1-r*r),.7)*255);}
    SINAI.mistMap=new T.DataTexture(data,n,n,T.RGBAFormat);SINAI.mistMap.minFilter=SINAI.mistMap.magFilter=T.LinearFilter;SINAI.mistMap.needsUpdate=true;
  }
  return new T.PointsMaterial(Object.assign({map:SINAI.mistMap,color:0xffffff,transparent:true,depthWrite:false,alphaTest:.005,fog:true},options));
}
function sinaiLamp(api,x,z){
  const T=api.THREE,g=new T.Group();g.name='sinai-camp-lamp';g.position.set(x,0,z);
  const bowl=new T.Mesh(new T.SphereGeometry(.22,10,6),api.texMat(0x866448,'clay'));bowl.scale.y=.48;bowl.position.y=.23;g.add(bowl);
  const stem=new T.Mesh(new T.CylinderGeometry(.035,.05,.95,7),api.texMat(0x6d5945,'wood'));stem.position.y=.55;g.add(stem);
  const cup=new T.Mesh(new T.CylinderGeometry(.16,.11,.16,10),api.texMat(0x9c7854,'clay'));cup.position.y=1.05;g.add(cup);
  const flame=new T.Mesh(new T.SphereGeometry(.065,8,6),new T.MeshBasicMaterial({color:0xffd999}));flame.scale.y=1.7;flame.position.y=1.2;g.add(flame);
  const light=new T.PointLight(0xffcd8b,1.1,7,2);light.position.y=1.4;g.add(light);
  const pool=new T.Mesh(new T.CircleGeometry(2.5,24),new T.MeshBasicMaterial({color:0xd3a95f,transparent:true,opacity:.11,depthWrite:false}));pool.rotation.x=-Math.PI/2;pool.position.y=.018;g.add(pool);
  api.add(g);SINAI.lamps.push({g,light});
}
function sinaiAnimate(api,dt){
  SINAI.elapsed+=dt;const t=api.settings.gentle?0:SINAI.elapsed;
  SINAI.mountain.position.x=Math.sin(t*6)*.018;
  SINAI.clouds.forEach((c,i)=>{c.mesh.position.x=c.base.x+Math.sin(t*.12+i)*.35;c.mesh.position.y=c.base.y+Math.sin(t*.17+i)*.1;});
  const p=SINAI.smoke.geometry.attributes.position;
  for(let i=0;i<p.count;i++){const u=((i/p.count+t*.025)%1+1)%1;p.setXYZ(i,-5+Math.sin(i*2.4+t*.1)*(1+u*2),13+u*15,-46+Math.cos(i*1.7+t*.1)*(1+u*1.5));}p.needsUpdate=true;
  SINAI.lamps.forEach((l,i)=>l.light.intensity=1.1+Math.sin(t*3+i)*.025);
  SINAI.crowd.forEach((m,i)=>{
    const a=m.userData.storyActor;a.rig.rotation.z=api.settings.gentle?0:Math.sin(t*8+i)*.009;
    if(SINAI.gathered)m.rotation.y=Math.PI;
    api.posePerson(m,{dt,expression:SINAI.gathered?'worry':'listen',headPitch:SINAI.gathered?-.1:0});
  });
  const near=api.activePlayers().find(p=>Math.hypot(p.pos.x-SINAI.moses.position.x,p.pos.z-SINAI.moses.position.z)<4);
  if(near&&!SINAI.gathered)SINAI.moses.rotation.y=Math.atan2(near.pos.x-SINAI.moses.position.x,near.pos.z-SINAI.moses.position.z);else SINAI.moses.rotation.y=Math.PI;
  api.posePerson(SINAI.moses,{dt,expression:'listen',headPitch:SINAI.gathered?-.1:0});
  // Weather is present throughout the imagined camp walk, independently of markers or scores.
  if(SINAI.elapsed>=SINAI.nextThunder){SINAI.nextThunder=SINAI.elapsed+22;if(!api.settings.gentle&&SINAI.end===undefined)api.sfx('thunder');}
}

const LEVEL = {
  id: '3-6',
  bibleConnection: {"passage": "Exodus 19–20", "text": "God rescued Israel before giving His commandments. He is holy; His law shows our sin. Our imagined camp route stays below the forbidden mountain."},
  world: 'World 3-7',            // shown one later (the plagues come first in Bible order); the id stays '3-6'
  teamPads: false, rim: false, reactive:false,
  artDirection:{textureStrength:.3,storyPlants:10,checkpointSigns:false,horizon:{bounded:true,color:0x717b87,heightScale:.7}},
  decor:{grass:0,flowers:0,pebbles:22,plants:false},
  title: 'At Mount Sinai',
  time:'storm',ambient:.95,exposure:1.08,courseTheme:'sand',leafIcon:'🪨',leafColor:0xc6d5dd,
  spawn:[0,42],bounds:{minX:-21,maxX:21,minZ:-23,maxZ:46},
  approach: ['ledge', 'crumbles', 'stones'],   // the way in (engine): a stretch before the level's own start
  startMessage:'Follow the pale camp ledges. Stay below the mountain rope.',
  intro:[{text:'Thou shalt have no other gods before me.',ref:'Exodus 20:3'}],
  introStory:[
    {art:'⛰️',title:'The holy LORD',text:'God rescued Israel from Egypt. At Sinai He commanded them to stay below the mountain boundary. Anyone who touched the mountain would be put to death. Thunder, lightning, cloud and a loud trumpet came; the people trembled (Exodus 19–20).'},
    {art:'🪨',title:'Just for our game',text:"Our camp paths are imagined. Follow the markers below the boundary. Stay on the camp side: the holy mountain is forbidden."}
  ],
  tasks:[{id:'route',icon:'👣',label:'Follow the three camp route markers',total:3},{id:'assembly',icon:'👂',label:'Gather below the mountain boundary',total:1,lockedUntil:'route'}],
  memoryVerse:{text:'Therefore by the deeds of the law there shall no flesh be justified in his sight: for by the law is the knowledge of sin.',ref:'Romans 3:20'},
  ending:{verse:{text:'Thou shalt have no other gods before me.',ref:'Exodus 20:3'},message:'God rescued Israel before giving His commands. His law shows our sin and our need for a Saviour. Jesus saves by grace.'},
  quiz:[
    {q:'What were the people commanded to do at the boundary?',ref:'Exodus 19:12',options:['Stay below it and not touch the mountain','Climb it for a secret prize','Vote on whether God meant it'],answer:0, explain: 'God commanded a boundary and warned of death for touching the mountain. Our game places no reward beyond it.'},
    {q:'Who spoke the Ten Commandments?',ref:'Exodus 20:1–3',options:['A player who finished the course','The LORD God who brought them out of Egypt','Pharaoh'],answer:1, explain: 'God rescued Israel from slavery before He spoke His law. A completed game route cannot make Him speak.'},
    {q:'What does God\'s law show us?',ref:'Romans 3:20',options:['That enough points forgive sin','That sin does not matter','Our sin and our need for a Saviour'],answer:2, explain: 'The law reveals sin; it cannot justify us. We need the Saviour and salvation by grace, not points.'}
  ],
  music:{bpm:80,notes:[57,0,60,62,64,0,62,60,57,0,55,57,60,0,57,0],bass:[45,45,41,41,38,38,45,45]},
  terrain(){return 0;},groundColor(x,z){return z< -8?0xb6b0a1:Math.abs(x)<7?0xcebf9f:0xad9d82;},
  build(api){
    const T=api.THREE;
    SINAI.boundary=api.box({x:0,z:-20.7,w:48,d:1,h:18,color:0x736c61,tex:'stone',house:false,ao:false});
    SINAI.boundary.mesh.visible=false; // collision enforces the marked holy boundary; the mountain supplies the silhouette.
    // Sagging rope and pale stones make the marked boundary visible before the solid safety barrier.
    const border=new T.Group();border.name='sinai-boundary-rope';
    const ropePoints=[];
    for(let x=-20;x<=20;x+=4){
      const post=new T.Mesh(new T.CylinderGeometry(.09,.12,1,7),api.texMat(0x8c6541,'wood'));post.position.set(x,.5,-20.2);border.add(post);
      if(x<20)for(let k=0;k<8;k++){const u=k/8;ropePoints.push(new T.Vector3(x+u*4,.8-Math.sin(u*Math.PI)*.18,-20.2));}
    }
    ropePoints.push(new T.Vector3(20,.8,-20.2));border.add(new T.Line(new T.BufferGeometry().setFromPoints(ropePoints),new T.LineBasicMaterial({color:0xd8bb7e})));api.scenery(border);
    for(let x=-20;x<=20;x+=2){const m=new T.Mesh(new T.DodecahedronGeometry(.65,0),api.texMat(0xd6c7a8,'stone'));m.scale.set(1,.48,.62);m.position.set(x,.24,-19.95);m.rotation.y=x*.2;api.add(m);}
    sinaiMountain(api);
    [[-12,37],[13,30],[-13,19],[13,10],[-13,-6]].forEach(([x,z],i)=>{
      const tent=api.clothTent({x,z,color:i%2?0xb4a17e:0x9c886e,glow:true});tent.scale.set(1.2,1.15,1.2);
      if(i===0||i===2||i===4)sinaiLamp(api,x+(x<0?2:-2),z+.8);
      const look=[{beard:true,skin:0xb98259},{beard:false,skin:0xd4a476},{age:'child',skin:0xb98259},{age:'elder',beard:true},{beard:false,skin:0x8d5c3e}][i];
      const m=api.storyPerson([0x698095,0x8b705d,0x7a8070,0x897052,0x78637b][i],0xe5d7b9,1,look);m.position.set(x+(x<0?3:-3),0,z-1);m.rotation.y=Math.PI;api.add(m);SINAI.crowd.push(m);
    });
    SINAI.campClue=api.conversation({person:SINAI.crowd[0],label:'Ask about the camp',speaker:'An Israelite',clue(){
      const next=SINAI.markers.find(s=>!s.done);
      return {text:next?'Follow the pale ledges to the next camp marker. Stay on our side of the mountain rope.':'We are gathering below the rope. God brought us out of slavery in Egypt.',at:next?[next.x,next.y+1,next.z]:[0,1,-14]};
    }});
    const moses=api.storyPerson(0x8d7d63,0xdacdb1,1.12,{age:'elder',beard:true,staff:true,skin:0xb98259});moses.position.set(-5.5,0,-12.5);api.add(moses);SINAI.moses=moses;
    SINAI.mosesClue=api.conversation({person:moses,label:'Talk with Moses',speaker:'Moses',clue(){return {text:SINAI.end===undefined?'God rescued us from Egypt before He gave His commands. Stay below the mountain rope.':'God’s law shows our sin. We need the Saviour; we cannot earn forgiveness.',at:[0,1,-14]};}});
    [[-4,15,1.1],[-4,11,2.2],[0,7,2.2],[4,3,1.1],[4,-1,1.1]].forEach(([x,z,h])=>{
      api.rockBox({x,z,w:4.4,d:4.4,h,color:0xb9b29f});
      const edge=new T.Mesh(new T.BoxGeometry(3.8,.05,.15),api.mat(0xf3e3bf));edge.position.set(x,h+.03,z+2);api.add(edge);
    });
    [[0,31,0],[-4,11,2.2],[4,-1,1.1]].forEach(([x,z,y])=>SINAI.markers.push(api.zone({x,z,y,vRange:.65,r:1.5,time:.65,color:0xc9d8e2,onDone(){api.task('route');}})));
    // The optional crossing is a people-made camp device, far below the boundary.
    SINAI.side=api.box({x:10,z:20,w:3,d:4,h:1.2,hidden:true,color:0x9e7c53,tex:'wood',house:false});
    api.teamPads({pads:[[6,25],[10,25]],onOpen(players){SINAI.side.show(true);api.sfx('bridge');players.forEach(p=>api.servant(p,3));}});
    api.box({x:10,z:16,w:4,d:3,h:1.2,color:0xb5b0a1,house:false});api.fragment({x:10,z:16,y:2.4});
    [[-12,6,.9],[-14,3,1.8],[-12,0,2.7],[-14,-3,3.6]].forEach(([x,z,h])=>api.box({x,z,w:2.8,d:2.8,h,color:0xb5b0a1,house:false}));api.fragment({x:-14,z:-3,y:4.8});
    api.fragment({x:15,z:-9,y:1.2});api.armor('helmet',0,38);
    // A quiet, permanent stepped ridge in the camp, far from the holy boundary.
    api.course([{x:-17,z:41,top:1,kind:'block'},{x:-17,z:37.8,top:1.9,kind:'float'},{x:-17,z:34.6,top:2.8,kind:'float'},
      {x:-17,z:31.4,top:3.7,kind:'float'},{x:-17,z:28.2,top:4.6,kind:'float'},{x:-17,z:25,top:5.5,kind:'float'}]);
    api.camZone({minX:-21,maxX:-13,minZ:22,maxZ:45,yaw:.3,height:10,back:14,focus:[-17,3,32],pull:.2});
    api.trail([[0,40],[0,31],[-4,22],[-4,15],[-4,11],[0,7],[4,3],[4,-1],[0,-8],[0,-14]],2.8);
    api.camZone({minX:-8,maxX:8,minZ:1,maxZ:22,yaw:.25,height:10,back:14,focus:[0,2,7],pull:.25});
    api.camZone({minX:-18,maxX:-9,minZ:-2,maxZ:8,yaw:-.3,height:9,back:13,focus:[-14,4,2],pull:.2});
    SINAI.gatherView=api.camZone({minX:-17,maxX:17,minZ:-18,maxZ:-7,yaw:0,height:5.5,back:25,focus:[0,6,-26],pull:.16});
  },
  update(api,dt){sinaiAnimate(api,dt);if(!SINAI.assembled&&api.taskDone('route')&&api.near(0,-14,3).length){SINAI.assembled=true;api.task('assembly');}},
  objective(api){const z=SINAI.markers.find(s=>!s.done);return z?[z.x,z.y+1,z.z]:[0,1,-14];},
  finale:{message:'Gather below the boundary to hear God\'s commandments.',beacon:[0,1,-14],inZone:p=>Math.hypot(p.pos.x,p.pos.z+14)<4&&p.pos.z>-18,
    onUpdate(api,t){
      if(!SINAI.gathered){
        const ps=api.players();if(!ps.length||!ps.every(p=>!p.bubble&&LEVEL.finale.inZone(p)))return false;
        SINAI.gathered=true;SINAI.gatherAt=SINAI.elapsed;api.music(false);api.finishCaption(false,false);
        Object.assign(SINAI.gatherView,{height:8,back:42,focus:[0,10,-35],pull:.28});
      }
      if(SINAI.elapsed-SINAI.gatherAt>1.1&&!SINAI.told){SINAI.told=true;api.story([
      {art:'⛰️',title:'The people trembled',text:'And mount Sinai was altogether on a smoke, because the LORD descended upon it in fire: and the smoke thereof ascended as the smoke of a furnace, and the whole mount quaked greatly.',ref:'Exodus 19:18'},
      {art:'📜',title:'The God who rescued Israel',text:'I am the LORD thy God, which have brought thee out of the land of Egypt, out of the house of bondage. Thou shalt have no other gods before me.',ref:'Exodus 20:2–3'},
      {art:'📜',title:'The Ten Commandments',text:'God commanded: worship no other gods; make no idols; do not misuse His name; keep the Sabbath; honour father and mother; do not murder, commit adultery, steal, bear false witness, or covet. This is a summary: read His full words in Exodus 20:1–17 together.'},
      ...(api.shownRef('Romans 3:20')?[]:[{art:'✝️',title:'Why we need a Saviour',text:'Therefore by the deeds of the law there shall no flesh be justified in his sight: for by the law is the knowledge of sin.',ref:'Romans 3:20'}])
    ],()=>{SINAI.end=api.time;api.music(true);});}return SINAI.end!==undefined&&api.time-SINAI.end>1.5;}}
};
