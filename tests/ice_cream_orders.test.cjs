const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const source=fs.readFileSync('faithsparks/content/lab_games/gordon-ice-cream-town.html','utf8');
function fn(name){const start=source.lastIndexOf('function '+name+'(');const end=source.indexOf('\nfunction ',start+10);return source.slice(start,end<0?source.length:end);}
function context(){const c={level:1,levelServed:0,ruleForLevel:()=>({scoopOnly:c.level===1}),plainOrder:()=>({random:'scoop'}),drinkOrder:()=>({random:'drink'}),randInt:()=>1};vm.createContext(c);vm.runInContext(fn('buildOrder'),c);return c;}
test('new containers and toppings get guaranteed introductory orders',()=>{
 const c=context();
 assert.equal(c.buildOrder().random,'scoop');
 c.level=2;assert.equal(c.buildOrder().container,'CONE');
 c.level=3;assert.equal(c.buildOrder().toppings[0],'Whipped Cream');
 c.level=4;assert.equal(c.buildOrder().container,'BOWL');assert.equal(c.buildOrder().toppings[0],'Cone on Top');
 c.levelServed=1;assert.equal(c.buildOrder().random,'drink');
 c.levelServed=0;assert.equal(c.buildOrder(1).random,'drink');
 c.level=5;assert.equal(c.buildOrder().random,'drink');
});
test('whipped cream remains required for completing an order',()=>{
 const c={order:{toppings:['Whipped Cream']},addedToppings:[]};vm.createContext(c);
 vm.runInContext(fn('exactList')+fn('toppingsComplete'),c);
 assert.equal(c.toppingsComplete(),false);
 c.addedToppings=['Whipped Cream'];assert.equal(c.toppingsComplete(),true);
 c.addedToppings.push('Cherry');assert.equal(c.toppingsComplete(),false);
});
test('random topping pool includes cream, with cone-on-top restricted to bowls',()=>{
 const c={TOPPINGS:['Rainbow Sprinkles','Chocolate Sprinkles','Whipped Cream','Cherry','Cone on Top'].map(name=>({name})),min:Math.min,randInt:()=>5};vm.createContext(c);vm.runInContext(fn('randomToppings'),c);
 assert.ok(c.randomToppings(5,'BOWL').includes('Cone on Top'));
 for(const container of ['CUP','CONE']){const tops=c.randomToppings(5,container);assert.ok(tops.includes('Whipped Cream'));assert.ok(!tops.includes('Cone on Top'));}
});

function guidedContext(kind='SCOOP',toppings=[]){
 const c={order:{name:'Test order',kind,container:kind==='SCOOP'?'BOWL':'CUP',need:['Vanilla Ice Cream','Milk'].slice(0,kind==='SCOOP'?1:2),toppings},
  tray:[],addedToppings:[],waitingForNext:false,guestPhase:'active',guestName:'Ada',needsReset:false,
  holdingContainer:'',holdingCup:false,holdingScoop:false,holdingMilk:false,scoopLoaded:false,scoopFlavor:'',
  prepared:false,containerFilled:false,blenderRunning:false,blenderTimer:{set(){}},
  PANTRY:[{name:'Vanilla Ice Cream'},{name:'Milk'}],TOPPINGS:toppings.map(name=>({name})),
  pantryLabel:name=>name.replace(' Ice Cream',''),isScoopFlavor:item=>item.name.includes('Ice Cream'),
  playSfx(){},saveSession(){},sndScoop:0,sndPour:0,sndPrep:0,sndMix:0,servedCount:0,
  addTopping(t){if(c.containerFilled)c.addedToppings.push(t.name);},serve(){c.servedCount++;c.waitingForNext=true;}};
 vm.createContext(c);
 for(const name of ['exactList','ingredientsComplete','syncGuidedAssembly','guidedStep','guidedChoices','guidedAddIngredient','guidedPrimaryAction'])vm.runInContext(fn(name),c);
 c.syncGuidedAssembly();
 return c;
}
test('guided bowl requires its explicit toppings before the Give action',()=>{
 const c=guidedContext('SCOOP',['Whipped Cream','Rainbow Sprinkles']);
 assert.equal(c.holdingContainer,'BOWL');
 assert.equal(c.guidedStep().label,'Add Vanilla');
 c.guidedPrimaryAction();
 assert.equal(c.containerFilled,true);
 assert.equal(c.guidedStep().label,'Add Whipped Cream');
 assert.equal(c.servedCount,0);
 c.guidedPrimaryAction();
 assert.equal(c.guidedStep().label,'Add Rainbow Sprinkles');
 c.guidedPrimaryAction();
 assert.equal(c.guidedStep().label,'Give to Ada');
 c.guidedPrimaryAction();
 c.guidedPrimaryAction();
 assert.equal(c.servedCount,1);
 assert.equal(c.guidedChoices().length,0);
});
test('guided drinks must prepare, pour, and finish toppings before serving',()=>{
 for(const kind of ['BLEND','MIX']){
  const c=guidedContext(kind,['Chocolate Sprinkles']);
  c.guidedPrimaryAction();c.guidedPrimaryAction();
  assert.equal(c.guidedStep().kind,'prepare');
  assert.equal(c.containerFilled,false);
  c.guidedPrimaryAction();
  if(kind==='BLEND'){
   assert.equal(c.guidedStep().kind,'wait');
   c.guidedPrimaryAction();assert.equal(c.containerFilled,false);
   c.blenderRunning=false;c.prepared=true;
  }
  assert.equal(c.guidedStep().kind,'fill');
  c.guidedPrimaryAction();
  assert.equal(c.guidedStep().label,'Add Chocolate Sprinkles');
  c.guidedPrimaryAction();c.guidedPrimaryAction();
  assert.equal(c.servedCount,1);
 }
});
test('old carried ingredients migrate once into the fixed assembly spot',()=>{
 const c=guidedContext('BLEND');
 c.holdingScoop=true;c.scoopLoaded=true;c.scoopFlavor='Vanilla Ice Cream';c.holdingMilk='Milk';
 c.syncGuidedAssembly();c.syncGuidedAssembly();
 assert.deepEqual(Array.from(c.tray),['Vanilla Ice Cream','Milk']);
 assert.equal(c.holdingScoop,false);assert.equal(c.holdingMilk,false);
 assert.equal(c.guidedStep().kind,'prepare');
});
test('guided ingredient choices reject duplicates and unrelated ingredients',()=>{
 const c=guidedContext();
 assert.deepEqual(Array.from(c.guidedChoices(),item=>item.name),['Vanilla Ice Cream']);
 c.guidedAddIngredient('Milk');assert.equal(c.tray.length,0);
 c.guidedAddIngredient('Vanilla Ice Cream');c.guidedAddIngredient('Vanilla Ice Cream');
 assert.equal(c.tray.length,1);assert.equal(c.guidedStep().kind,'serve');
 assert.equal(c.guidedChoices().length,0);
});
