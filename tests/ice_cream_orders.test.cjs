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
