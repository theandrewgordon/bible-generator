/* Exodus 3–4. Climbing is the play; the small flock walks by itself.
 * God is already calling Moses in the story. Nothing is collected or switched to light the bush.
 */
const BUSH = { landings:[], flock:[], bridges:[], bridgeOpen:false, listening:false, told:false };
const LEVEL = {
  id: '3-2',
  bibleConnection: {"passage": "Exodus 2:11–15; 3–4", "text": "Moses killed an Egyptian and fled. Later God spoke from a bush that burned without burning up, and sent him to lead Israel out. Our ridge climb is imagined."},
  world: 'World 3-2',
  teamPads: false, rim: false,
  title: 'The Burning Bush',
  leafIcon:'🌿',leafColor:0xbdd594,courseTheme:'sand',
  spawn:[0,42],bounds:{minX:-21,maxX:21,minZ:-38,maxZ:46},
  approach: ['stones', 'ledge', 'crumbles'],   // the way in (engine): a stretch before the level's own start
  startMessage:'Our climbing route is imagined. Follow the pale ridge ledges to three markers, then stop below the burning bush.',
  intro:[{text:'Certainly I will be with thee;',ref:'Exodus 3:12'}],
  introStory:[
    {art:'🔥',title:'God calls Moses',text:'Moses had killed an Egyptian and fled to Midian (Exodus 2:11–15). Years later he was keeping Jethro\'s flock near Horeb. The angel of the LORD appeared in a bush that burned but was not consumed. God called Moses and told him to remove his shoes: this was holy ground. God had heard His people suffering in Egypt (Exodus 3:1–7).'},
    {art:'⛰️',title:'Just for our game',text:"Our ridge climb and bridge are imagined. Climb to the three markers while the flock walks below. God calls Moses; our puzzles do not make Him speak."}
  ],
  tasks:[{id:'ridge',icon:'⛰️',label:'Climb the three ridge landings',total:3},{id:'listen',icon:'👂',label:'Stop at the overlook below the bush',total:1,lockedUntil:'ridge'}],
  memoryVerse:{text:'And God said unto Moses, I AM THAT I AM: and he said, Thus shalt thou say unto the children of Israel, I AM hath sent me unto you.',ref:'Exodus 3:14'},
  ending:{verse:{text:'Certainly I will be with thee;',ref:'Exodus 3:12'},message:'The holy LORD saw His people\'s suffering and sent Moses. Moses\' weakness did not make God weak.'},
  quiz:[
    {q:'What was unusual about the burning bush?',ref:'Exodus 3:2',options:['It was not consumed by the fire','A puzzle lit it','It was made of gold'],answer:0, explain: 'The bush burned but was not consumed. God was already acting before our imagined climb.'},
    {q:'Why did God tell Moses to take off his shoes?',ref:'Exodus 3:5',options:['To jump higher','The ground was holy','To earn a reward'],answer:1, explain: 'God is holy; Moses was to remove his shoes, not earn a reward for crossing closer.'},
    {q:'What name did God give Moses to tell Israel?',ref:'Exodus 3:14',options:['The great builder','The king of Egypt','I AM'],answer:2, explain: 'God named Himself I AM and sent Moses to Israel. His presence, not Moses\' strength, was the promise.'}
  ],
  music:{bpm:84,notes:[57,0,60,62,64,0,62,60,57,0,55,57,60,62,57,0],bass:[45,45,41,41,43,43,45,45]},
  terrain(x,z){return Math.min(6,Math.max(0,(-10-z)*.75));},
  groundColor(x,z,h){return h>4?0xb3a58e:Math.abs(x)<7?0xd9bd8d:0xc3a16f;},
  build(api){
    const T=api.THREE;
    const route=[[0,34,1],[-3,30,2],[-4,26,3],[0,22,4],[4,18,5],[4,14,6],[0,10,6],[-3,6,6],[0,2,6],[0,-2,6],[0,-6,6],[0,-10,6]];
    BUSH.steps=route.map(([x,z,top])=>api.box({x,z,w:4.6,d:4.6,h:.4,y:top-.4,color:0xb5a58a,tex:'stone',house:false}));
    route.forEach(([x,z,top])=>{const edge=new T.Mesh(new T.BoxGeometry(3.8,.045,.16),api.mat(0xf1dfb7));edge.position.set(x,top+.025,z+2.1);api.add(edge);});
    [[-4,26,3],[4,14,6],[0,-6,6]].forEach(([x,z,y])=>BUSH.landings.push(api.zone({x,z,y,vRange:.65,r:1.4,time:.6,color:0xd9cf9f,onDone(){api.task('ridge');}})));
    // No follower API: these sheep are scenery, not another collection/escort task.
    for(let i=0;i<5;i++){const mesh=api.animalMesh('sheep');api.add(mesh);BUSH.flock.push({mesh,phase:i*1.4});}
    const bush=new T.Group();bush.position.set(-7,6,-27);
    for(let i=0;i<6;i++){const m=new T.Mesh(new T.SphereGeometry(.7,9,6),api.mat(0x658346));m.position.set(Math.cos(i)*.8,.65+i%2*.5,Math.sin(i)*.6);bush.add(m);}
    BUSH.flames=[];for(let i=0;i<7;i++){const f=new T.Mesh(new T.ConeGeometry(.28,1.4,6),new T.MeshBasicMaterial({color:i%2?0xffc33c:0xf0782e,transparent:true,opacity:.9}));f.position.set(Math.cos(i)*1.15,1.7+i%3*.25,Math.sin(i)*1.15);bush.add(f);BUSH.flames.push(f);}
    api.add(bush);
    bush.userData.sqHalo={color:0xffa34a,scale:4.6,offsetY:1.8,opacity:.3};
    [[-15,-34,1.6],[12,-34,1.5],[16,-30,1.1]].forEach(([x,z,scale])=>api.rock(x,z,scale));
    const glow=new T.PointLight(0xffbc61,1,9,2);glow.position.set(-7,8,-27);api.add(glow);
    const moses=api.person(0x77664c,0xd7c4a0,1,{age:'elder',beard:true,cane:true});moses.position.set(-3.2,6,-25);api.add(moses);
    // The branch footbridge is optional and opens away from the holy-ground scene.
    [9,12].forEach(x=>BUSH.bridges.push(api.box({x,z:14,w:3.4,d:3,h:.25,y:5.75,hidden:true,color:0xb49160,tex:'wood',house:false})));
    api.box({x:15,z:14,w:3,d:3,h:.4,y:5.6,color:0xb5a58a,house:false});api.fragment({x:15,z:14,y:7.2});
    api.interact({x:4,z:17.2,y:5,r:2,vRange:1.4,label:'Brace the ridge footbridge',can:p=>(p.role.strong||api.near(4,17.2,2.5).filter(q=>Math.abs(q.pos.y-5)<1.2).length>=2)?true:'The Builder can secure the bridge, or two teammates can brace it.',use(){this.remove();BUSH.bridgeOpen=true;BUSH.bridges.forEach(b=>b.show(true));api.sfx('bridge');}});
    api.box({x:11,z:33,w:4,d:4,h:1,color:0xb5a58a,house:false});api.fragment({x:11,z:33,y:2.2});
    api.box({x:-6,z:2,w:3,d:3,h:9,color:0xb5a58a,house:false});api.fragment({x:-6,z:2,y:10.2});
    api.armor('helmet',0,38);
    // A spring launches onto a high ridge, followed by a short turning ledge traverse.
    api.course([{x:-16,z:39,top:.45,kind:'spring'},{x:-13.5,z:36.5,top:4.4,kind:'float'},{x:-16,z:34,top:5.3,kind:'crumble'},
      {x:-16,z:30.5,top:6.1,kind:'float'},{x:-12.8,z:29,top:6.8,kind:'float'}]);
    api.camZone({minX:-20,maxX:-10,minZ:26,maxZ:43,yaw:.3,height:11,back:15,focus:[-15,4,34],pull:.2});
    api.trail([[0,40],...route.map(q=>[q[0],q[1],q[2]]),[0,-18],[0,-24]],3);
    api.camZone({minX:-7,maxX:8,minZ:19,maxZ:37,yaw:.3,height:10,back:14,focus:[0,4,22],pull:.25});
    api.camZone({minX:-7,maxX:18,minZ:8,maxZ:20,yaw:-.3,height:10,back:14,focus:[4,6,12],pull:.2});
    api.camZone({minX:-7,maxX:8,minZ:-12,maxZ:8,yaw:.15,height:9,back:13,focus:[0,6,-8],pull:.2});
    api.camZone({minX:-16,maxX:7,minZ:-35,maxZ:-18,yaw:-.3,height:9,back:13,focus:[-5,7,-26],pull:.25});
  },
  update(api,dt){
    BUSH.flock.forEach(f=>{const s=(api.time*.6+f.phase)%24,z=38-s;f.mesh.position.set(-11+Math.sin(s*.35+f.phase),api.terrain(-11,z),z);f.mesh.rotation.y=Math.PI;});
    BUSH.flames.forEach((f,i)=>{f.scale.y=.9+Math.sin(api.time*2+i)*.12;});
    if(!BUSH.listening&&api.taskDone('ridge')&&api.near(0,-24,3).length){BUSH.listening=true;api.task('listen');}
  },
  objective(api){const s=BUSH.landings.find(z=>!z.done);return s?[s.x,s.y+1,s.z]:[0,7,-24];},
  finale:{message:'Stop at the overlook and hear the Bible story.',beacon:[0,7,-24],inZone:p=>Math.hypot(p.pos.x,p.pos.z+24)<4&&p.pos.y>5,
    onUpdate(api,t){if(t>.4&&!BUSH.told){BUSH.told=true;api.story([
      ...(api.shownRef('Exodus 3:14')?[]:[{art:'🔥',title:'I AM',text:'And God said unto Moses, I AM THAT I AM: and he said, Thus shalt thou say unto the children of Israel, I AM hath sent me unto you.',ref:'Exodus 3:14'}]),
      {art:'👣',title:'Sent to Pharaoh',text:'God sent Moses to bring Israel out of Egypt. Moses made excuses, and the LORD was angry at his refusal, yet appointed Aaron to speak with him (Exodus 4:10–16). God promised His presence. He is holy, faithful and able to save.'}
    ],()=>{BUSH.end=api.time;});}return BUSH.end!==undefined&&api.time-BUSH.end>1.5;}}
};
