// A safe controls/traversal yard, outside the chronological Bible campaign.
const YARD={};
const LEVEL={id:'practice-yard',world:'Practice yard',title:'Run, Jump, Explore',practice:true,town:false,teamPads:false,props:false,trails:false,decor:false,
 spawn:[0,22],bounds:{minX:-22,maxX:22,minZ:-24,maxZ:28},terrain(){return 0;},groundColor(){return 0x91ac72;},finishTheme:'welcome',
 startMessage:'Run and jump on the low steps. Ride the lift; open its upper latch. Try a rope and explore!',
 intro:[],introStory:[{art:'🌱',title:'Practice together',text:'This is our game’s practice yard. There are unlimited retries. Use the same run, jump and special-action buttons as the adventure. You can leave through the pause menu any time.'}],
 tasks:[{id:'lift',icon:'🪜',label:'Open the lift’s upper latch',total:1},{id:'room',icon:'🔎',label:'Explore the little store',total:1}],
 ending:{message:'Good work, team! Return whenever you want to practice.'},quiz:[],
 build(api){
  [[0,16,.7],[0,13,1.4],[0,10,2.1]].forEach(([x,z,h])=>api.box({x,z,w:4,d:2.2,h,color:0xac8650,tex:'wood',house:false}));
  api.box({x:0,z:7,w:5,d:3,h:2.1,color:0xac8650,tex:'wood',house:false});
  api.box({x:5,z:3,w:4,d:5,h:4.2,color:0xac8650,tex:'wood',house:false});
  YARD.lift=api.teamLift({x:0,z:3,bottom:2.1,top:4.2,w:5,d:4.2,control:[-2,2.1,7],release:[5,4.2,3],onLatch(){api.task('lift');api.checkpoint({x:5,y:4.2,z:3,label:'Practice lift'});}});
  api.box({x:5,z:-3,w:4,d:4,y:2.5,h:.3,color:0xb88dba,tex:'cloth',house:false});
  api.box({x:5,z:-8,w:4,d:3,h:1.4,color:0xbfa16b,tex:'wood',house:false});
  api.ropeKit({x:11,z:14});
  YARD.room=api.secretPocket({id:'practice-store',name:'The practice store',x:13,z:2,y:1,w:6,d:5});YARD.room.found.onFind=()=>api.task('room');
  api.box({x:13,z:6,w:3,d:2,h:.5,color:0xbfa16b,tex:'wood',house:false});
  YARD.rope=api.ropeAnchor({from:[11,0,10],to:[13,1,2],arc:3.5,label:'Swing to the little store'});
  api.ropeAnchor({from:[13,1,2],to:[11,0,10],arc:3.5,label:'Swing back to the stand'});
  api.spring({x:-9,z:12});api.box({x:-9,z:8,w:4,d:4,y:3.6,h:.4,color:0xbfa16b,tex:'wood',house:false});
  api.leaves([[0,19],[0,16,1.7],[0,13,2.4],[0,10,3.1],[5,3,5.2],[5,-3,3.8],[11,14],[11,10],[13,2,2],[-9,8,5]]);
  const helper=api.person(0x397b77,0xead5ad,1,{age:'elder'});helper.position.set(-4,0,20);api.add(helper);
  api.conversation({person:helper,label:'Ask about the practice yard',clue(){return{text:'Hold run for speed. Tap jump for a low hop; hold it for a higher jump. Use the lift’s upper latch to help friends follow.',at:[0,3.1,7]};}});
  YARD.dash=api.teamTrial({id:'practice-hops',start:[0,0,20],stages:[[0,.7,16,1.9],[0,1.4,13,1.9],[0,2.1,10,1.9]],seconds:24,label:'Try the optional jump dash'});
  api.camZone({minX:-5,maxX:10,minZ:-10,maxZ:20,yaw:.55,height:10,back:15,focus:[2,2,5],pull:.25});
 },
 finale:{message:'Gather by the practice lantern!',beacon:[0,2,-16],inZone:p=>Math.hypot(p.pos.x,p.pos.z+16)<4}
};
