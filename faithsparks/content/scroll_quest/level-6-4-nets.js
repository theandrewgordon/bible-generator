/* Luke 5:1–11. The miraculous catch is told BEFORE the imagined harbor course.
 * Players secure landing ramps and cross small boats; their work never creates fish.
 * Main route: shore → low quay → two broad boats → far quay → shore meeting place.
 */
const NETS = { ramps: [], wheels: [], opened: 0, arrived: false, told: false };
const LEVEL = {
  id: '6-4',
  bibleConnection: {"passage": "Luke 5:1–11", "text": "Jesus gave the miraculous catch, then called Simon and his partners to follow Him. They left everything. Our harbor ramps and boats come after the narrated catch; solving them never produces the miracle."},
  world: 'World 6-3',
  teamPads: false, rim: false,
  title: 'Leave Your Nets',
  town: false, courseTheme: 'water', leafIcon: '🐟', leafColor: 0x65c7c1,
  spawn: [0, 66], bounds: { minX: -20, maxX: 20, minZ: -39, maxZ: 71 },
  startMessage: 'Our harbor course comes after Jesus gave the catch. Cross the workyard and lower the net rack.',
  intro: [{ text: 'Fear not; from henceforth thou shalt catch men.', ref: 'Luke 5:10' }],
  introStory: [
    { art: '🐟', title: 'At the word of Jesus', text: 'Simon and his partners caught nothing all night. Jesus told Simon to let down the nets. He obeyed, and Jesus gave so many fish that the nets broke and both boats began to sink. Peter confessed that he was a sinful man. Jesus called him to follow Him (Luke 5:1–11).' },
    { art: '🪢', title: 'Just for our game', text: "Jesus gave the catch. Our ramps, boat crossings and harbor puzzles are imagined helping jobs afterward. We do not make the fish appear." }
  ],
  tasks: [
    { id: 'ramps', icon: '🪢', label: 'Secure both harbor ramps', total: 2 },
    { id: 'shore', icon: '👣', label: 'Reach the meeting place on shore', total: 1, lockedUntil: 'ramps' }
  ],
  memoryVerse: { text: 'And when they had brought their ships to land, they forsook all, and followed him.', ref: 'Luke 5:11' },
  ending: { verse: { text: 'Fear not; from henceforth thou shalt catch men.', ref: 'Luke 5:10' }, message: 'Jesus called sinful people to follow Him. Simon, James and John left everything and followed.' },
  quiz: [
    { q: 'Who provided the great catch of fish?', ref: 'Luke 5:4–7', options: ['Jesus, when Simon obeyed His word', 'Our harbor puzzle', 'A lucky new net'], answer: 0, explain: 'Jesus provided the catch at His word; our imagined harbor work did not create it.' },
    { q: 'What did Peter confess to Jesus?', ref: 'Luke 5:8', options: ['That he deserved more fish', 'That he was a sinful man', 'That he had never done wrong'], answer: 1, explain: 'Peter confessed his sin. Jesus called him by grace, not because he was sinless.' },
    { q: 'What did the fishermen do when they reached land?', ref: 'Luke 5:11', options: ['Built a larger shop', 'Forgot what happened', 'Left everything and followed Jesus'], answer: 2, explain: 'They forsook all and followed Jesus; the catch was not their greatest treasure.' }
  ],
  music: { bpm: 96, notes: [65,69,72,0,74,72,69,67,65,0,69,72,77,74,72,0], bass: [41,41,46,46,48,48,41,41] },
  terrain(x,z) { return z < 16 && z > -9 ? -2.3 : 0; },
  groundColor(x,z,h) { return h < -1 ? 0x929b95 : Math.abs(x)<8 ? 0xd9caa4 : 0x9fb17e; },
  build(api) {
    const T=api.THREE;
    // A dry harbor workyard after the narrated catch. Our net rack is a game invention.
    NETS.entry={done:false,open:false,route:[]};
    [[0,61,.65],[-3,57,.65],[0,53,.65]].forEach(([x,z,h])=>{api.box({x,z,w:5,d:5.4,h,tex:'wood',color:0xa27748,house:false});NETS.entry.route.push([x,h,z]);});
    const rack=api.box({x:0,z:48,w:9,d:.35,h:2.6,tex:'weave',color:0x9b8a63,house:false});NETS.entry.rack=rack;
    // Open rope lattice on a timber frame; the visible net matches the blocking rack.
    rack.mesh.material=rack.mesh.material.clone();rack.mesh.material.visible=false;rack.mesh.castShadow=false;
    [[0,-1.24,8.9,.12],[0,1.24,8.9,.12],[-4.4,0,.12,2.6],[4.4,0,.12,2.6]].forEach(([x,y,w,h])=>{const rail=new T.Mesh(new T.BoxGeometry(w,h,.2),api.texMat(0x765338,'wood'));rail.position.set(x,y,0);rail.castShadow=true;rack.mesh.add(rail);});
    const netPoints=[];for(let x=-4;x<=4.01;x+=.4)netPoints.push(new T.Vector3(x,-1.2,0),new T.Vector3(x,1.2,0));for(let y=-.8;y<1;y+=.4)netPoints.push(new T.Vector3(-4.3,y,0),new T.Vector3(4.3,y,0));
    const dryingNet=new T.LineSegments(new T.BufferGeometry().setFromPoints(netPoints),new T.LineBasicMaterial({color:0xb8a67b}));rack.mesh.add(dryingNet);

    [-11,11].forEach(x=>api.box({x,z:48,w:13,d:.5,h:2.8,tex:'wood',color:0x93714a,house:false}));
    const wheel=new T.Mesh(new T.TorusGeometry(.5,.09,8,16),api.texMat(0xa78349,'bronze'));wheel.position.set(0,1.3,50.5);api.add(wheel);NETS.entry.wheel=wheel;
    NETS.entry.release=api.zone({x:0,z:50.5,r:2.2,time:1.2,action:'Lower the net rack',working:'Lowering the rack',onDone(){NETS.entry.open=true;rack.mesh.rotation.x=-Math.PI/2;rack.mesh.position.y=.175;
        Object.assign(rack.platform,{minZ:46.7,maxZ:49.3,bottom:0,top:.35});wheel.rotation.z+=Math.PI;api.sfx('winch');}});
    [[-6,62],[6,57],[-6,52]].forEach(([x,z])=>{const coil=new T.Mesh(new T.TorusGeometry(.5,.1,6,14),api.texMat(0xb9a781,'weave'));coil.rotation.x=Math.PI/2;coil.position.set(x,.15,z);api.add(coil);});
    api.discovery({id:'harbor-workyard',name:'The net-drying yard',x:6,z:57,r:1.8});
    api.leaves([[0,64],[0,61,1.65],[-3,57,2.3],[0,53,1.65],[6,57],[0,44]]);
    api.camZone({minX:-10,maxX:10,minZ:40,maxZ:70,yaw:.28,height:10,back:15,focus:[0,1,50],pull:.2});

    const water=new T.Mesh(new T.PlaneGeometry(140,25),new T.MeshPhongMaterial({color:0x3996b1,transparent:true,opacity:.8,shininess:35}));
    water.rotation.x=-Math.PI/2; water.position.set(0,-.65,3.5); api.add(water);
    api.hazard({x:0,z:3.5,w:42,d:25},{maxY:-.85,msg:'Splash! The wide boat decks and pale quay edges show the crossing.'});
    // Dry quays and roomy decks, not another storm-survival level.
    api.box({x:0,z:15,w:11,d:8,h:.45,y:-.15,color:0xc8bea3,tex:'stone',house:false});
    api.box({x:0,z:-8,w:11,d:8,h:.45,y:-.15,color:0xc8bea3,tex:'stone',house:false});
    NETS.boats=[api.mover({w:5.4,d:5.4,h:.45,color:0x96683f,path:t=>[-1.2,.05+Math.sin(t*.7)*.08,7.5],speed:1}),
      api.mover({w:5.4,d:5.4,h:.45,color:0x96683f,path:t=>[1.2,.05+Math.sin(t*.7+.7)*.08,.6],speed:1})];
    NETS.boats.forEach((b,i)=>{
      const hull=new T.Mesh(new T.SphereGeometry(1,14,9),api.texMat(0x795237,'wood'));hull.scale.set(2.85,.7,3.25);hull.position.y=-.35;b.mesh.add(hull);
      const net=new T.Mesh(new T.TorusGeometry(.55,.12,7,14),api.texMat(0xbda174,'weave'));net.rotation.x=Math.PI/2;net.position.set(-1.2,.3,1.2);b.mesh.add(net);
      const mast=new T.Mesh(new T.CylinderGeometry(.09,.13,4.2,8),api.texMat(0x705137,'wood')); mast.position.set(i?-1.8:1.8,2.25,-1.6); b.mesh.add(mast);
      // Side trim leaves the forward jump path open.
      [-2.5,2.5].forEach(x=>{const trim=new T.Mesh(new T.BoxGeometry(.13,.22,4.8),api.texMat(0xe0b97c,'wood'));trim.position.set(x,.33,0);b.mesh.add(trim);});
    });
    // First and last gaps have a visual ramp, opened by one Builder or two helpers.
    [[0,10.4,-5,20],[0,-3.3,5,-10]].forEach(([x,z,cx,cz],i)=>{
      const ramp=api.box({x,z,w:3.6,d:3.4,h:.22,y:.15,hidden:true,color:0xc79658,tex:'wood',house:false}); NETS.ramps.push(ramp);
      const wheel=new T.Mesh(new T.TorusGeometry(.5,.09,8,16),api.texMat(0xa78349,'bronze'));wheel.position.set(cx,1.1,cz);api.add(wheel);NETS.wheels.push(wheel);
      const post=new T.Mesh(new T.BoxGeometry(.25,1.4,.3),api.texMat(0x705137,'wood'));post.position.set(cx,.7,cz-.2);api.add(post);
      api.interact({x:cx,z:cz,r:2.3,label:'Secure landing ramp',can:p=>(p.role.strong||api.near(cx,cz,2.8).length>=2)?true:'The Builder locks the ramp alone, or two teammates brace it together.',
        use(p){this.remove();ramp.show(true);wheel.rotation.z+=Math.PI;NETS.opened++;api.task('ramps');api.sfx('rope');api.near(cx,cz,2.8).forEach(q=>{q.workT=.5;api.servant(q,3);});}});
    });
    const peter=api.person(0x4c668b,0xe4d8b7,1,{beard:true});peter.position.set(-3,0,-29);api.add(peter);
    [[-13,33],[13,-20],[-12,-32]].forEach(([x,z])=>api.box({x,z,w:5,d:5,h:3.2,color:0xd1b993,house:true}));
    api.armor('sandals',0,36);api.armor('helmet',-4,-15);
    // A shoreline net secret, a high boathouse ledge, and an ordinary side-pier walk.
    api.box({x:8,z:6,w:4,d:4,h:.3,y:.05,color:0xb78a53,tex:'wood',house:false});
    api.fragment({x:13,z:5,y:-.2,net:true});
    api.box({x:12,z:29,w:3,d:3,h:4.6,color:0xc4af88,house:true});
    api.box({x:9.5,z:31.5,w:2,d:2,h:1.6,color:0x96704b,house:false});api.fragment({x:12,z:29,y:5.8});
    api.box({x:-12,z:-15,w:5,d:3,h:.5,color:0xb78a53,house:false});api.fragment({x:-12,z:-15,y:1.7});
    api.course([{x:-16,z:36,top:1,kind:'block'},{x:-14,z:33.4,top:1.8,kind:'float'},{x:-16,z:30.8,top:2.6,kind:'crumble'},
      {x:-14,z:28.2,top:3.4,kind:'float'},{x:-16,z:25.6,top:4.2,kind:'float'}]);
    api.trail([[0,40],[0,27],[-5,20],[0,15],[-1.2,7.5],[1.2,.6],[0,-8],[5,-10],[0,-20],[0,-29]],2.7);
    api.camZone({minX:-8,maxX:8,minZ:-12,maxZ:23,yaw:.22,height:10,back:14,focus:[0,0,1],pull:.23});
    api.camZone({minX:7,maxX:16,minZ:26,maxZ:35,yaw:-.3,height:8,back:12,focus:[12,4,29],pull:.3});
    api.camZone({minX:-17,maxX:-10,minZ:23,maxZ:39,yaw:.15,height:9,back:13,focus:[-15,3,29],pull:.25});
  },
  update(api) {
    if(NETS.entry&&!NETS.entry.done&&api.players().some(p=>p.pos.z<44)){NETS.entry.done=true;api.checkpoint({x:0,z:42,label:'Harbor shore'});} if(!NETS.arrived&&api.taskDone('ramps')&&api.near(0,-27,4).length){NETS.arrived=true;api.task('shore');} },
  objective(api) {
    if(NETS.entry&&!NETS.entry.done)return NETS.entry.open?[0,1,42]:[0,1,50.5];
    if(!NETS.ramps[0].platform.on)return [-5,1,20];
    const lead=api.activePlayers()[0];
    if(!NETS.ramps[1].platform.on)return lead&&lead.pos.z>14?[0,1,14]:lead&&lead.pos.z>4?[-1.2,1,7.5]:lead&&lead.pos.z>-4?[1.2,1,.6]:[5,1,-10];
    return [0,1,-27];
  },
  finale:{message:'Meet Simon and his partners on shore.',beacon:[0,1,-27],inZone:p=>Math.hypot(p.pos.x,p.pos.z+27)<5,
    onUpdate(api,t){if(t>.4&&!NETS.told){NETS.told=true;api.story([
      ...(api.shownRef('Luke 5:11')?[]:[{art:'👣',title:'They followed Him',text:'And when they had brought their ships to land, they forsook all, and followed him.',ref:'Luke 5:11'}]),
      {art:'✝️',title:'Called by grace',text:'Peter knew he was sinful. Jesus still called him. Following Jesus is a response to His grace, not a prize earned by fish, teamwork or points.'}
    ],()=>{NETS.end=api.time;});}return NETS.end!==undefined&&api.time-NETS.end>1.5;}}
};
