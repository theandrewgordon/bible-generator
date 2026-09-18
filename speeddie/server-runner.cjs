// JSON stdin/stdout bridge; clients cannot submit executable code.
const crypto=require('node:crypto');
const G=require('./rules.js'), E=require('./engine.js');
let input='';process.stdin.setEncoding('utf8');process.stdin.on('data',d=>input+=d);process.stdin.on('end',()=>{
 try {
  const req=JSON.parse(input), random=()=>crypto.randomInt(0,0x100000000)/0x100000000;
  let state=req.state;
  if(req.operation==='create'||req.operation==='draft') {
    if(req.operation==='draft'){state.started=false;state.players=[];state.currentPlayer=0;}
    delete state.undo;delete state.undoStack;delete state.tradeOffer;
    G.upgrade(state);G.validate(state);G.assert((state.started||req.operation==='draft')&&state.moneyMode==='banker'&&state.cardMode==='digital','Online play requires a started game with digital banking and in-app cards.');
    if(!state.decks)G.initDecks(state,random);
    // Fresh games use a server shuffle; continuing games preserve their deck.
    if(!state.history?.length&&!state.ledger?.length)G.initDecks(state,random);
  }else state=E.command(state,req.action,req.args,req.seats,{random});
  process.stdout.write(JSON.stringify({state}));
 }catch(e){process.stdout.write(JSON.stringify({error:e.message}));}
});
