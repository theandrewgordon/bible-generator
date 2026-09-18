/* Shared command engine. No DOM, networking or storage; randomness is injected. */
(function(root){
'use strict';
const G=root.SpeedDieRules || require('./rules.js');
const property=p=>['property','railroad','utility'].includes(p.type);
const card=i=>[2,7,17,22,33,36].includes(i);
function command(input,action,args={},seats=[],options={}) {
  const s=structuredClone(input), random=options.random||Math.random, die=options.die||(()=>Math.floor(random()*6)+1);
  const p=()=>s.players[s.currentPlayer], space=()=>s.spaces[p().position];
  const own=id=>G.assert(seats.includes(id),'This player belongs to another device.');
  const phase=(...allowed)=>G.assert(allowed.includes(s.phase),'This action is not available now.');
  const unblocked=()=>G.assert(!s.debts.length&&!s.auctions.length&&!s.auction&&!s.pendingCard,'Finish the pending action first.');
  const resolved=()=>{s.bankLandingResolved=true;s.landingResolved=true;s.firstStopResolved=true;s.landingBill=null;};
  const clear=()=>{s.bankLandingResolved=false;s.landingBill=null;s.landingResolved=false;s.firstStopResolved=false;};
  const go=()=>{p().passedGo=true;if(s.moneyMode==='banker')G.transfer(s,'bank',p().id,s.rules.go,'GO salary');};
  const jail=()=>{Object.assign(p(),{position:10,inJail:true,jailAttempts:0,consecutiveDoubles:0});s.phase='landed';s.extraTurn=false;s.pendingFinderTarget=null;resolved();s.message='Go directly to Jail. Do not collect GO.';};
  const land=()=>{if(p().position===30)jail();else {s.landingResolved=!property(space())||!!space().owner;G.captureLanding(s);}};
  const move=n=>{clear();if(p().position+n>=40)go();p().position=(p().position+n)%40;land();};
  const history=()=>{s.history ||= [];if(s.roll)s.history.unshift({player:p().name,...s.roll,message:s.message,time:new Date().toISOString()});s.history=s.history.slice(0,30);};
  const target=()=>{
    const props=s.spaces.filter(property), unowned=props.filter(q=>!q.owner), available=unowned.length?unowned:props.filter(q=>q.owner!==p().id&&!q.mortgaged);
    return available.sort((a,b)=>((a.index-p().position+40)%40||40)-((b.index-p().position+40)%40||40))[0]?.index;
  };
  const finder=(fallback=false)=>{const i=target();if(i===undefined){s.phase='landed';if(fallback){move(s.roll.d1+s.roll.d2);s.message=`No eligible Property Finder destination. Move to ${space().name}.`;}else s.message='No eligible Property Finder destination.';return;}s.phase='landed';move((i-p().position+40)%40||40);s.message=`Property Finder: ${space().name}.`;};
  const stopDone=()=>G.assert(p().inJail || (s.moneyMode==='banker'?s.bankLandingResolved:(!card(p().position)||s.bankLandingResolved)&&(!property(space())||!!space().owner||s.landingResolved)),'Resolve this stop first.');
  G.ensurePlaying(s);
  if(s.tradeOffer && !['trade-accept','trade-reject'].includes(action))throw Error('Respond to the proposed trade first.');
  if(['build','sell','sell-group','mortgage'].includes(action)) {
    G.assert(!s.auction&&!s.pendingCard,'Finish the pending action first.');const q=s.spaces[args.index];G.assert(q?.owner,'Choose an owned property.');own(q.owner);
    if(action==='mortgage')G.mortgage(s,args.index);else if(action==='sell-group')G.sellGroup(s,args.index);else G.build(s,args.index,action==='build'?1:-1);
  } else if(action==='trade-propose') {
    G.assert(!s.auction&&!s.pendingCard,'Finish the pending action first.');own(args.a);G.player(s,args.b);
    G.assert(args.a!==args.b,'Choose another player.');const offer={a:args.a,b:args.b,fromA:args.fromA||[],fromB:args.fromB||[],cashA:args.cashA||0,cashB:args.cashB||0,cardsA:args.cardsA||[],cardsB:args.cardsB||[]};
    const probe=structuredClone(s);trade(probe,offer);s.tradeOffer=offer;
  } else if(action==='trade-accept'||action==='trade-reject') {
    const offer=s.tradeOffer;G.assert(offer,'No trade is pending.');
    if(action==='trade-accept'){own(offer.b);trade(s,offer);}else G.assert(seats.includes(offer.a)||seats.includes(offer.b),'Only the trading players may decline.');
    s.tradeOffer=null;
  } else if(action==='auction-bid'||action==='auction-pass') {
    G.assert(s.auction,'No auction is active.');own(s.auction.turn);G.auctionTurn(s,action==='auction-pass'?null:args.amount);
  } else if(action==='settle') {
    G.assert(s.debts.length,'No bill is pending.');own(s.debts[0].from);const resume=G.settle(s);
    if(resume?.kind==='landing')resolved();
    if(resume?.kind?.startsWith('jail-')) {Object.assign(p(),{inJail:false,jailAttempts:0,consecutiveDoubles:0});s.extraTurn=false;if(resume.kind==='jail-move'){s.phase='landed';move(resume.amount);s.message=`Leave Jail and move ${resume.amount}.`;}else {s.phase='ready';s.roll=null;}}
  } else if(action==='bankrupt') {
    G.assert(s.debts.length,'Record a bill first.');const d=s.debts[0];own(d.from);G.bankrupt(s,d.from,d.to==='pot'?'bank':d.to);
  } else {
    own(p().id);
    if(action==='apply-card'){G.assert(s.pendingCard,'No card is drawn.');G.applyCard(s,die);}
    else if(action==='auction-start') {
      G.assert(!s.debts.length&&!s.pendingCard&&!s.auction,'Finish the pending action first.');
      G.assert((s.auctions.length?args.index===s.auctions[0]:['landed','classic-first-stop'].includes(s.phase)&&args.index===p().position&&!s.bankLandingResolved),'Auction the current property.');G.startAuction(s,args.index);
    } else {
      unblocked();
      if(action==='roll'||action==='jail-roll') {
        phase('ready');G.assert(action==='jail-roll'?p().inJail:!p().inJail,'Use the Jail controls.');clear();
        const d1=die(),d2=die(),speedActive=!p().inJail&&(s.activation==='immediate'||p().passedGo);
        const speed=speedActive?[1,2,3,'Bus','Property Finder','Property Finder'][Math.floor(random()*6)]:null;
        p().familyStats ||= {};p().familyStats.rolls=(p().familyStats.rolls||0)+1;
        s.roll={d1,d2,speed,speedActive};s.extraTurn=false;
        if(action==='jail-roll') {
          s.roll.jailAttempt=true;p().consecutiveDoubles=0;
          if(d1===d2){p().inJail=false;p().jailAttempts=0;s.phase='landed';move(d1+d2);s.message='Doubles: leave Jail.';}
          else if(++p().jailAttempts>=3){if(s.moneyMode==='banker')G.owe(s,p().id,s.freeParkingRule==='pot'?'pot':'bank',s.rules.jail,'Third Jail attempt',{kind:'jail-move',amount:d1+d2});else {p().inJail=false;p().jailAttempts=0;s.phase='landed';move(d1+d2);s.message='Pay the Jail fine, then move.';}}
          else {s.phase='landed';s.message='No doubles. Stay in Jail.';}
        } else if(typeof speed==='number'&&d1===d2&&d2===speed){p().consecutiveDoubles=0;s.phase='triples';s.message='Triples: choose any space.';}
        else {
          p().consecutiveDoubles=d1===d2?(p().consecutiveDoubles||0)+1:0;s.extraTurn=d1===d2;
          if(p().consecutiveDoubles>=3)jail();
          else if(speed==='Bus'){s.phase='bus';s.message='Choose your Bus move.';}
          else if(speed==='Property Finder'&&s.mode==='streets')finder(true);
          else {s.phase=speed==='Property Finder'?'classic-first-stop':'landed';move(d1+d2+(typeof speed==='number'?speed:0));if(!p().inJail)s.message=`Move to ${space().name}.`;}
        }history();
      } else if(action==='bus') {phase('bus');G.assert([s.roll.d1,s.roll.d2,s.roll.d1+s.roll.d2].includes(args.amount),'Choose a white die or their sum.');s.phase='landed';move(args.amount);s.message=`Move to ${space().name}.`;history();}
      else if(action==='triples') {phase('triples');G.assert(Number.isInteger(args.index)&&args.index>=0&&args.index<40,'Choose a board space.');clear();if(args.index!==30&&(args.index===0||args.index<p().position))go();p().position=args.index;s.phase='landed';s.extraTurn=false;land();s.message=`Triples: ${space().name}.`;history();}
      else if(action==='jail-pay'||action==='jail-card') {phase('ready');G.assert(p().inJail,'Not in Jail.');if(action==='jail-card'){G.useHeldCard(s,p().id);Object.assign(p(),{inJail:false,jailAttempts:0,consecutiveDoubles:0});s.roll=null;}else {G.assert(p().jailAttempts<2,'Try the third Jail roll first.');G.owe(s,p().id,s.freeParkingRule==='pot'?'pot':'bank',s.rules.jail,'Leave Jail',{kind:'jail-roll'});}}
      else if(action==='end'||action==='finder') {phase(action==='finder'?'classic-first-stop':'landed');stopDone();if(action==='finder')finder();else {if(!s.extraTurn){p().consecutiveDoubles=0;G.advance(s);}s.roll=null;s.phase='ready';s.extraTurn=false;s.message='';s.landingBill=null;s.bankLandingResolved=false;} }
      else {
        phase('landed','classic-first-stop');G.assert(!s.bankLandingResolved&&!p().inJail,'This stop is already resolved.');
        if(action==='buy') {G.assert(property(space())&&!space().owner,'This space is not available.');G.buy(s,p().position,p().id);}
        else if(action==='leave') {G.assert(s.allowLeaveUnowned&&property(space())&&!space().owner,'Leaving unowned is not enabled.');resolved();}
        else if(action==='draw-card') {G.assert(card(p().position),'No card is due.');G.drawCard(s,[7,22,36].includes(p().position)?'chance':'chest');}
        else if(action==='pay') {G.captureLanding(s);const bill=s.landingBill;G.assert(bill&&bill.amount>0,'No bill is due.');if(p().cash>=bill.amount){G.transfer(s,bill.from,bill.to,bill.amount,bill.reason);resolved();}else G.owe(s,bill.from,bill.to,bill.amount,bill.reason,{kind:'landing'});}
        else if(action==='parking') {G.assert(p().position===20&&s.freeParkingRule!=='official','No reward due.');G.transfer(s,'bank',p().id,s.freeParkingRule==='pot'?s.freeParkingPot:Number(s.freeParkingRule),'Free Parking');if(s.freeParkingRule==='pot')s.freeParkingPot=0;resolved();}
        else if(action==='resolve') {G.assert(!card(p().position)&&!(property(space())&&!space().owner)&&!s.landingBill?.amount&&!(p().position===20&&s.freeParkingRule!=='official'),'Resolve the required action first.');resolved();}
        else throw Error('Unknown game action.');
      }
    }
  }
  G.finish(s);G.captureLanding(s);G.validate(s);return s;
}
function trade(s,o){
  G.assert(Array.isArray(o.cardsA)&&Array.isArray(o.cardsB),'Invalid cards.');
  for(const [list,from,to] of [[o.cardsA,o.a,o.b],[o.cardsB,o.b,o.a]])for(const deck of list){const held=(s.heldCards||[]).find(c=>c.deck===deck&&c.owner===from);G.assert(held,'Card is not held by this player.');held.owner=to;}
  if(o.fromA.length+o.fromB.length+o.cashA+o.cashB)G.trade(s,o.a,o.b,o.fromA,o.fromB,o.cashA,o.cashB);
  else G.assert(o.cardsA.length+o.cardsB.length,'Choose something to trade.');
}
root.SpeedDieEngine={command};if(typeof module!=='undefined')module.exports=root.SpeedDieEngine;
})(globalThis);
