/* Acts 6:1–7. One neighborhood circuit, not repeated warehouse errands.
 * Four finite packed baskets let every player carry food; a household can be served once.
 * The overlooked widows and the appointment of seven are Scripture. The city route is imagined.
 */
const CARE = {
  baskets: [], homes: [], gateOpen: false, hoistOpen: false,
  HOIST: [-12, 2], MEETING: [0, -40], told: false
};

const LEVEL = {
  id: '8-2', world: 'World 8-2', title: 'No One Forgotten', town: true, teamPads: false,
  leafIcon: '🍞', leafColor: 0xe5b778,
  spawn: [0, 54], bounds: { minX: -20, maxX: 20, minZ: -46, maxZ: 62 },
  bibleConnection: { passage: 'Acts 6:1–7', text: "Greek-speaking widows were missing their daily food. The church chose seven honest men, full of the Holy Ghost and wisdom, to help. The apostles kept praying and teaching God’s word. Our delivery route and home visit are imagined." },
  startMessage: "Take a basket. Use the special action to share at all six homes. Check the side courtyard!",
  intro: [
    { text: 'But we will give ourselves continually to prayer, and to the ministry of the word.', ref: 'Acts 6:4' }
  ],
  introStory: [
    { art: '🏘️', title: 'Some widows were being missed', text: 'As the church grew, Greek-speaking believers complained that their widows were being neglected in the daily distribution. This was a real wrong, and the apostles listened. Practical care and the ministry of the word both needed faithful attention.' },
    { art: '🤝', title: 'Seven trustworthy men', text: 'Wherefore, brethren, look ye out among you seven men of honest report, full of the Holy Ghost and wisdom, whom we may appoint over this business. But we will give ourselves continually to prayer, and to the ministry of the word.', ref: 'Acts 6:3–4' },
    { art: '🧩', title: 'Just for our game', text: "Our six homes and rooftop paths are imagined. Everyone has a basket with enough food. Share at each marked door. After Market lane, the Apostle can lead a home visit." }
  ],
  tasks: [
    { id: 'homes', icon: '🧺', label: 'Share food at all six homes, including the side courtyard', total: 6 },
    { id: 'check', icon: '✓', label: 'Check the household list with the helpers', total: 1, lockedUntil: 'homes' }
  ],
  memoryVerse: { text: 'But we will give ourselves continually to prayer, and to the ministry of the word.', ref: 'Acts 6:4' },
  ending: {
    verse: { text: 'And the word of God increased; and the number of the disciples multiplied in Jerusalem greatly; and a great company of the priests were obedient to the faith.', ref: 'Acts 6:7' },
    message: 'The neglected widows mattered. The church appointed trustworthy, Spirit-filled men for this need, and the apostles continued in prayer and the ministry of the word.'
  },
  quiz: [
    { q: 'What complaint did the apostles need to address?', ref: 'Acts 6:1', options: ['The city had too many rooftops', 'Greek-speaking believers’ widows were neglected in the daily distribution', 'Nobody wanted to hear teaching'], answer: 1, explain: 'The widows were really being overlooked. The apostles addressed the problem rather than ignoring it.' },
    { q: 'What kind of men were chosen for this work?', ref: 'Acts 6:3', options: ['The seven strongest runners', 'The seven richest men', 'Seven men of honest report, full of the Holy Ghost and wisdom'], answer: 2, explain: 'The work required trustworthy character, the Holy Ghost and wisdom; game skills were not the qualifications.' },
    { q: 'What did the apostles continue to give themselves to?', ref: 'Acts 6:4', options: ['Prayer and the ministry of the word', 'Winning delivery races', 'Building bigger houses'], answer: 0, explain: 'The apostles continued in prayer and the ministry of the word while the seven oversaw the practical need.' }
  ],
  music: { bpm: 108, notes: [64,66,68,71,69,68,66,64,68,71,73,71,68,66,66,64,64,66,68,71,69,68,69,71,68,71,73,71,68,66,71,64], bass: [40,40,45,45,47,47,40,40] },
  terrain(x,z) { return Math.sin(x*.23)*Math.cos(z*.2)*.035; },
  groundColor(x,z) { return (Math.floor(x/2)+Math.floor(z/2))%2 ? 0xd1ba95 : 0xc5aa82; },
  build(api) {
    const T=api.THREE;
    const block=o=>api.box(Object.assign({color:0xc9b18a,tex:'stone',house:false,y:0},o));
    // Warehouse doors face the start; four separate baskets, no character-exclusive food supply.
    api.box({x:0,z:59,w:12,d:4,h:3.4,color:0xd1bb92});
    [-4.5,-1.5,1.5,4.5].forEach((x,i)=>{
      const mesh=new T.Group();
      const bowl=new T.Mesh(new T.CylinderGeometry(.43,.34,.48,14),api.texMat(0xb18b52,'weave'));mesh.add(bowl);
      const handle=new T.Mesh(new T.TorusGeometry(.4,.055,8,18,Math.PI),api.texMat(0x876035,'weave'));handle.position.y=.2;mesh.add(handle);
      const loaves=[];
      for(let k=0;k<6;k++){
        const loaf=new T.Mesh(new T.SphereGeometry(.14,10,8),api.mat(0xe2b471));loaf.scale.set(1,.65,1.4);loaf.position.set((k%3-1)*.2,.27,Math.floor(k/3)*.25-.125);mesh.add(loaf);loaves.push(loaf);
      }
      const it=api.carryable({x,z:50,mesh,name:'packed food basket '+(i+1),to:'share at the marked doors — 6 portions'});
      it.portions=6;it.loaves=loaves;CARE.baskets.push(it);
    });
    // Homes are ordered along one forward circuit; the fifth turns into a side courtyard.
    const specs=[
      ['Market lane',-8,42,0,0x0e7490],['Upper terrace',7,29,1.8,0xa16207],
      ['Rooftop court',-8,15,3.2,0x6b21a8],['South lane',7,1,0,0x166534],
      ['Side courtyard',13,-12,1,0x9f1239],['Meeting lane',0,-28,0,0x1d4ed8]
    ];
    specs.forEach(([name,x,z,y,color],i)=>{
      const home={name,x,z,y,color,served:false,index:i};CARE.homes.push(home);
      if(y>0)block({x,z,w:6,d:5,h:y});
      api.box({x,z:z-3.8,w:5,d:3.2,h:2.8,y,color:0xd1bb92,
        interior:i===0?{title:'A neighbor’s home',available:()=>home.served,clue:()=>{
          const missed=CARE.homes[4];
          if(!missed.served)return {text:'The household ledger lists a small side courtyard too. Unbar its gate and remember that household.',at:CARE.gateOpen?[13,2.5,-12]:[6,1.3,-9]};
          const next=CARE.homes.find(h=>!h.served);
          return next?{text:'The ledger still lists '+next.name+'. Take a packed basket to that doorway.',at:[next.x,next.y+1.5,next.z]}:{text:'Every household has food. Check the list with the helpers.',at:[0,1.5,-34.5]};
        }}:undefined
      });
      const resident=api.person(color,0xe7e5d4,.95,{age:'elder'});resident.position.set(x-1.4,y,z-.7);api.add(resident);
      const pole=new T.Mesh(new T.CylinderGeometry(.045,.05,2.5,8),api.texMat(0x795736,'wood'));pole.position.set(x+1.9,y+1.25,z);api.add(pole);
      const sign=new T.Mesh(new T.BoxGeometry(.8,.55,.08),api.mat(color));sign.position.set(x+1.9,y+2.3,z);api.add(sign);home.sign=sign;
      const ring=new T.Mesh(new T.RingGeometry(1.5,1.65,28),new T.MeshBasicMaterial({color,side:T.DoubleSide,transparent:true,opacity:.75}));ring.rotation.x=-Math.PI/2;ring.position.set(x,y+.045,z);api.add(ring);home.ring=ring;
      const plate=new T.Group();
      const tray=new T.Mesh(new T.CylinderGeometry(.5,.5,.06,18),api.mat(0xbc8c54));plate.add(tray);
      for(const dx of [-.2,.2]){const bread=new T.Mesh(new T.SphereGeometry(.2,12,8),api.mat(0xe2b471));bread.scale.y=.55;bread.position.set(dx,.12,0);plate.add(bread);}
      plate.position.set(x+1,y+.2,z-.8);plate.visible=false;api.add(plate);home.plate=plate;
      home.inter=api.interact({x,z,y,r:2.1,vRange:.75,whileHolding:true,label:'Share food at '+name,available:()=>!home.served,
        can:p=>CARE.baskets.includes(p.holding)&&p.holding.portions>0 ? true : 'Pick up a packed basket with the item button; use the special action at this door.',
        use(p){
          // Two players pressing together must not spend two portions or count one household twice.
          const basket=p.holding;if(home.served||!CARE.baskets.includes(basket)||basket.portions<=0||Math.abs(p.pos.y-y)>.75)return;
          home.served=true;basket.portions--;basket.loaves[basket.portions].visible=false;
          basket.to='share at the marked doors — '+basket.portions+' portions';this.remove();plate.visible=true;
          ring.material.color.setHex(0x4ade80);sign.material.color.setHex(0x4ade80);api.task('homes');api.servant(p,4,'for remembering this household!');api.sfx('pickup');
        }
      });
    });
    // An imagined neighbor offers practical directions to any role, without adding an errand.
    CARE.neighbor=api.person(0x317c78,0xd3b581,1,{age:'elder',cane:true});
    CARE.neighbor.position.set(1.2,0,-5.5);api.add(CARE.neighbor);
    CARE.neighborClue=()=>{
      const missed=CARE.homes[4];
      if(!missed.served){
        if(!CARE.gateOpen)return {text:'One home is behind the courtyard gate. Lift its wooden bar.',at:[6,1.3,-9]};
        const carried=api.activePlayers().some(p=>CARE.baskets.includes(p.holding)&&p.holding.portions>0);
        const basket=CARE.baskets.find(b=>!b.holder&&b.portions>0);
        if(!carried&&basket)return {text:'Take a packed basket, then bring food to the courtyard.',at:[basket.x,basket.y+1,basket.z]};
        return {text:'The gate is open. Take food up the low step to that home.',at:[13,2.5,-12]};
      }
      const next=CARE.homes.find(h=>!h.served);
      if(next)return {text:'The courtyard has food! Take food to '+next.name+' next.',at:[next.x,next.y+1.5,next.z]};
      return api.taskDone('check')?{text:'No one was missed. Gather with the helpers by the lantern.',at:[0,2.5,-40]}:
        {text:'Every home has food. Check the list with the helpers.',at:[0,1.5,-34.5]};
    };
    CARE.conversation=api.conversation({person:CARE.neighbor,label:'Ask about the courtyard',clue:CARE.neighborClue});
    // First terrace: visible steps. The delivery action checks the actual doorway height.
    block({x:5,z:35,w:3,d:2.5,h:.9});block({x:7,z:32.5,w:3,d:2.5,h:1.8});
    // Rooftop court: broad steps up and a forward set of timber landings down.
    [[-8,23,1.1],[-8,21,2.1],[-8,19,3.2]].forEach(([x,z,h])=>block({x,z,w:3,d:2.2,h}));
    [[-4,12,2.2],[-1,9,1.1],[2,6,.4]].forEach(([x,z,top])=>api.box({x,z,w:3.2,d:2.8,y:top-.3,h:.3,color:0x9f7046,tex:'wood',house:false}));
    api.sweeper({x:0,z:35,length:5,speed:1.15});
    // The closed courtyard is an imagined physical obstruction, not an excluded group to score against.
    block({x:8,z:-5,w:.6,d:6,h:2.8});block({x:8,z:-15.5,w:.6,d:5,h:2.8});
    CARE.gate=api.box({x:8,z:-10,w:.6,d:4,h:2.8,y:0,color:0x815330,tex:'wood',house:false});
    // Keep the existing collision proxy; lighter timber panels make the opening visible.
    CARE.gate.mesh.visible=false;CARE.gatePanels=[];CARE.gateT=0;
    const wood=api.texMat(0x95663b,'wood'),brace=api.texMat(0x6b482d,'wood'),iron=api.mat(0x494842);
    const part=(parent,geometry,material,x,y,z)=>{const m=new T.Mesh(geometry,material);m.position.set(x,y,z);m.castShadow=true;m.receiveShadow=true;parent.add(m);return m;};
    const repeat=(parent,geometry,material,positions,rz=0)=>{
      const m=new T.InstancedMesh(geometry,material,positions.length),pose=new T.Object3D();pose.rotation.z=rz;
      positions.forEach((pos,i)=>{pose.position.set(...pos);pose.updateMatrix();m.setMatrixAt(i,pose.matrix);});
      m.instanceMatrix.needsUpdate=true;m.castShadow=true;m.receiveShadow=true;parent.add(m);return m;
    };
    repeat(api.scene,new T.BoxGeometry(.6,2.95,.35),brace,[-12.15,-7.85].map(z=>[8,1.475,z]));
    part(api.scene,new T.BoxGeometry(.6,.3,4.7),brace,8,2.95,-10);
    for(const [z,dir]of [[-12,1],[-8,-1]]){
      const hinge=new T.Group();hinge.position.set(8.2,0,z);api.add(hinge);CARE.gatePanels.push({hinge,dir});
      repeat(hinge,new T.BoxGeometry(.28,2.8,.35),wood,Array.from({length:5},(_,j)=>[-.2,1.4,dir*(.22+j*.39)])).name='gate-planks';
      repeat(hinge,new T.BoxGeometry(.34,.14,1.91),brace,[.52,2.08].map(y=>[-.2,y,dir]));
      repeat(hinge,new T.BoxGeometry(.035,.13,.65),iron,[.52,2.08].map(y=>[-.39,y,dir*.38]));
      repeat(hinge,new T.CylinderGeometry(.045,.045,.05,8),iron,[.52,2.08].flatMap(y=>[.14,.52].map(dz=>[-.42,y,dir*dz])),Math.PI/2);
    }
    const latch=part(CARE.gatePanels[0].hinge,new T.BoxGeometry(.15,.13,1.1),brace,-.43,1.15,1.65);CARE.latch=latch;
    api.interact({x:6,z:-9,y:0,r:1.8,vRange:.8,whileHolding:true,label:'Unbar the side courtyard',
      use(){this.remove();CARE.gateOpen=true;CARE.gate.show(false);latch.rotation.x=-Math.PI/2;api.sfx('bridge');api.toast('The side courtyard is open. Its household is on the list too.',3000);}
    });
    block({x:10,z:-8.2,w:2.8,d:2.4,h:.5});
    // Optional shared hoist: the Builder alone, or two ordinary teammates, can lower a scroll basket.
    const basket=new T.Group();
    const bucket=new T.Mesh(new T.CylinderGeometry(.5,.4,.5,14),api.texMat(0xaa8650,'weave'));basket.add(bucket);basket.position.set(-12,4,2);api.add(basket);CARE.hoistBasket=basket;
    const beam=new T.Mesh(new T.BoxGeometry(4,.18,.2),api.texMat(0x795736,'wood'));beam.position.set(-12,5.4,2);api.add(beam);
    for(const x of [-13.8,-10.2]){const post=new T.Mesh(new T.BoxGeometry(.18,5.4,.18),api.texMat(0x795736,'wood'));post.position.set(x,2.7,2);api.add(post);}
    const rope=new T.Line(new T.BufferGeometry().setFromPoints([new T.Vector3(-12,5.4,2),new T.Vector3(-12,4.2,2)]),new T.LineBasicMaterial({color:0x72583a}));api.add(rope);CARE.hoistRope=rope;
    CARE.hoistFragment=api.fragment({x:-12,z:2,y:4.7});CARE.hoistFragment.mesh.visible=false;
    api.interact({x:-12,z:4.5,y:0,r:2.2,vRange:.8,whileHolding:true,label:'Work the store hoist together',
      can:p=>p.role.strong||api.near(-12,4.5,2.4).filter(q=>q.onGround&&Math.abs(q.pos.y)<.6).length>=2 ? true : 'The Builder can work the hoist, or two teammates can pull together.',
      use(){this.remove();CARE.hoistOpen=true;CARE.hoistT=0;api.sfx('winch');}
    });
    // Optional Scribe roof extension, then a side-courtyard niche reachable by ordinary jumps.
    block({x:-11,z:13,w:2.2,d:2.6,h:5.8});CARE.roofFragment=api.fragment({x:-11,z:13,y:7});
    [[17,-13.5,2],[17,-17,3]].forEach(([x,z,h])=>block({x,z,w:2.6,d:2.6,h}));
    CARE.courtyardFragment=api.fragment({x:17,z:-17,y:4.1});
    api.armor('breastplate',9,42);
    // Seven visible helpers mark the finish; their appointment is taught, never earned by a player score.
    for(let i=0;i<7;i++){
      const person=api.person([0x7c3f2c,0x1e6386,0x516d32,0x8b6536,0x6c3b7d,0x9a394e,0x35654c][i],0xe7e5d4,.95,{beard:i%2===0});
      person.position.set(-4.5+i*1.5,0,-42);api.add(person);
    }
    const table=new T.Mesh(new T.BoxGeometry(4,.15,1.4),api.texMat(0x98613a,'wood'));table.position.set(0,.8,-36.5);api.add(table);
    for(const x of [-1.6,1.6]){const leg=new T.Mesh(new T.BoxGeometry(.18,.8,.8),api.texMat(0x795736,'wood'));leg.position.set(x,.4,-36.5);api.add(leg);}
    const list=new T.Mesh(new T.PlaneGeometry(1.5,.85),api.mat(0xf3dfb1));list.rotation.x=-Math.PI/2;list.position.set(0,.885,-36.5);api.add(list);
    CARE.review=api.zone({x:0,z:-34.5,y:0,r:2.2,vRange:.8,time:1.6,hidden:true,action:'Check every household is served',
      onDone(helpers){this.show(false);api.task('check');helpers.forEach(p=>api.servant(p,3));}
    });
    CARE.review.inter.whileHolding=true;
    api.course([
      {x:-16,z:51,top:1,kind:'block'},{x:-17,z:48,top:2,kind:'float'},
      {x:-16,z:45,top:3,kind:'crumble'},{x:-17,z:42,top:4,kind:'float'},
      {x:-16,z:39,top:5,kind:'float'},{x:-17,z:36,top:6,kind:'crumble'},
      {x:-16,z:33,top:7,kind:'float'}
    ]);
    api.leaves([[0,52],[-4,47],[-8,44],[-4,40],[1,38],[5,35,1.9],[7,32.5,2.8],[7,29,2.8],[1,27],[0,24],[-8,23,2.1],[-8,21,3.1],[-8,19,4.2],[-8,16,4.2],[-4,12,3.2],[-1,9,2.1],[2,6,1.4],[7,3],[2,0],[3,-5],[6,-9],[10,-10],[13,-12,2],[6,-16],[6,-22],[0,-25],[-3.5,-30],[0,-34.5],[0,-39]]);
    api.camZone({minX:1,maxX:12,minZ:25,maxZ:38,yaw:.25,height:8,back:12,focus:[7,1.8,30],pull:.3});
    api.camZone({minX:-14,maxX:4,minZ:5,maxZ:25,yaw:-.35,height:9,back:13,focus:[-6,2,16],pull:.3});
    api.camZone({minX:3,maxX:18,minZ:-21,maxZ:-4,yaw:.3,height:8,back:12,focus:[11,1,-12],pull:.35});
  },
  update(api,dt) {
    if(CARE.gateOpen&&CARE.gateT<.7){
      CARE.gateT=Math.min(.7,CARE.gateT+dt);const t=CARE.gateT/.7,k=t*t*(3-2*t);
      CARE.gatePanels.forEach(({hinge,dir})=>{hinge.rotation.y=dir*Math.PI*k;});
    }
    if(CARE.hoistOpen&&CARE.hoistT<.6){
      CARE.hoistT=Math.min(.6,CARE.hoistT+dt);const k=CARE.hoistT/.6;
      CARE.hoistBasket.position.y=4-3.4*k;const a=CARE.hoistRope.geometry.attributes.position;a.setY(1,CARE.hoistBasket.position.y+.2);a.needsUpdate=true;
      if(k===1){CARE.hoistFragment.y=CARE.hoistFragment.baseY=1.3;CARE.hoistFragment.mesh.visible=true;}
    }
    if(!CARE.hoistFragment.mesh.visible&&CARE.hoistFragment.shadow)CARE.hoistFragment.shadow.visible=false;
    if(!CARE.terraceCheckpoint&&CARE.homes.slice(0,2).every(h=>h.served)){CARE.terraceCheckpoint=true;api.checkpoint({x:7,z:30,y:1.8,label:'Terrace checkpoint'});}
    if(!CARE.laneCheckpoint&&CARE.homes.slice(0,4).every(h=>h.served)){CARE.laneCheckpoint=true;api.checkpoint({x:2,z:1,label:'South lane checkpoint'});}
    if(api.taskDone('homes')&&!CARE.ready){CARE.ready=true;CARE.review.show(true);api.toast('All six households are served. Check the list with the helpers.',3200);}
    if(!CARE.courtCheckpoint&&CARE.gateOpen&&CARE.homes[4].served){CARE.courtCheckpoint=true;api.checkpoint({x:6,z:-20,label:'Courtyard checkpoint'});}
  },
  objective(api) {
    if(api.taskDone('homes'))return[0,1.5,-34.5];
    const carrying=api.activePlayers().some(p=>CARE.baskets.includes(p.holding)&&p.holding.portions>0);
    if(!carrying){const b=CARE.baskets.find(b=>!b.holder&&b.portions>0);if(b)return[b.x,b.y+1,b.z];}
    const home=CARE.homes.find(h=>!h.served);
    if(home===CARE.homes[4]&&!CARE.gateOpen)return[6,1.3,-9];
    return home?[home.x,home.y+1.5,home.z]:null;
  },
  finale: {
    message:'Everyone gather with the helpers: no household forgotten!',beacon:[0,2.5,-40],
    inZone:p=>Math.hypot(p.pos.x,p.pos.z+40)<5,
    onUpdate(api,t){
      if(t>.4&&!CARE.told){CARE.told=true;api.story([
        {art:'🤝',title:'The seven and the apostles',text:'The church chose Stephen, Philip, Prochorus, Nicanor, Timon, Parmenas and Nicolas. They brought them before the apostles, who prayed and laid their hands on them (Acts 6:5–6). The daily need was taken seriously, while the apostles continued in prayer and the ministry of the word.'},
        {art:'📖',title:'The word of God increased',text:'And the word of God increased; and the number of the disciples multiplied in Jerusalem greatly; and a great company of the priests were obedient to the faith.',ref:'Acts 6:7'},
        {art:'🏘️',title:'Care and the good news',text:'People who were being missed mattered to the church. The Bible tells us about both their care and the spread of God’s word. Our delivery course helps us remember this account; a delivery score does not cause anyone to believe.'}
      ],()=>{CARE.endT=api.time;api.sfx('win');});}
      return CARE.endT!==undefined&&api.time-CARE.endT>1.8;
    }
  }
};
