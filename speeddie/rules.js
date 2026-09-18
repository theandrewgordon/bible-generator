/* Shared, DOM-free rules for the physical-board companion. */
(function (root) {
  "use strict";
  const prices = {
    1: [60, 50, 2, 10, 30, 90, 160, 250], 3: [60, 50, 4, 20, 60, 180, 320, 450],
    6: [100, 50, 6, 30, 90, 270, 400, 550], 8: [100, 50, 6, 30, 90, 270, 400, 550], 9: [120, 50, 8, 40, 100, 300, 450, 600],
    11: [140, 100, 10, 50, 150, 450, 625, 750], 13: [140, 100, 10, 50, 150, 450, 625, 750], 14: [160, 100, 12, 60, 180, 500, 700, 900],
    16: [180, 100, 14, 70, 200, 550, 750, 950], 18: [180, 100, 14, 70, 200, 550, 750, 950], 19: [200, 100, 16, 80, 220, 600, 800, 1000],
    21: [220, 150, 18, 90, 250, 700, 875, 1050], 23: [220, 150, 18, 90, 250, 700, 875, 1050], 24: [240, 150, 20, 100, 300, 750, 925, 1100],
    26: [260, 150, 22, 110, 330, 800, 975, 1150], 27: [260, 150, 22, 110, 330, 800, 975, 1150], 29: [280, 150, 24, 120, 360, 850, 1025, 1200],
    31: [300, 200, 26, 130, 390, 900, 1100, 1275], 32: [300, 200, 26, 130, 390, 900, 1100, 1275], 34: [320, 200, 28, 150, 450, 1000, 1200, 1400],
    37: [350, 200, 35, 175, 500, 1100, 1300, 1500], 39: [400, 200, 50, 200, 600, 1400, 1700, 2000]
  };
  const isMoney = n => Number.isSafeInteger(n) && n >= 0 && n <= 100000000;
  const assert = (ok, message) => { if (!ok) throw new Error(message); };
  function defaults(space) {
    const row = prices[space.index];
    const price = row ? row[0] : space.type === "railroad" ? 200 : space.type === "utility" ? 150 : 0;
    return { price, mortgage: price / 2, buildCost: row ? row[1] : 0,
      rents: row ? row.slice(2) : space.type === "railroad" ? [25, 50, 100, 200] : space.type === "utility" ? [4, 10] : [], buildings: 0 };
  }
  const active = s => s.players.filter(p => !p.bankrupt);
  const player = (s, id) => { const p = s.players.find(p => p.id === id && !p.bankrupt); assert(p, "Choose an active player."); return p; };
  const group = (s, space) => s.spaces.filter(p => p.type === "property" && p.group === space.group);
  const stock = s => ({ houses: 32 - s.spaces.reduce((n, p) => n + (p.buildings < 5 ? p.buildings : 0), 0), hotels: 12 - s.spaces.filter(p => p.buildings === 5).length });
  function upgrade(s) {
    s.moneyMode ||= "helper";
    s.rules = { startingCash: 2500, go: 200, incomeTax: 200, luxuryTax: 100, jail: 50, ...s.rules };
    s.players.forEach(p => { p.cash ??= s.rules.startingCash; p.bankrupt = Boolean(p.bankrupt); p.token ||= ""; });
    s.spaces = s.spaces.map(p => { const q = { ...defaults(p), ...p }; assert(Number.isInteger(q.buildings) && q.buildings >= 0 && q.buildings <= 5, "Invalid building count."); q.buildingCosts ||= Array(q.buildings).fill(q.buildCost); return q; });
    s.debts ||= []; s.auctions ||= []; s.ledger ||= []; s.freeParkingPot ??= 0;
    s.bankLandingResolved ??= false;
    s.version = 6;
    s.landingBill ??= null;
    finish(s);
    captureLanding(s);
    return s;
  }
  function finish(s) {
    if (!s.started || active(s).length !== 1) { s.winnerId = null; return; }
    const winner = active(s)[0];
    if (!s.winnerId) log(s, `${winner.name} wins. No further payments or auctions are required.`);
    s.winnerId = winner.id; s.auction = null; s.pendingCard = null; s.debts = []; s.auctions = []; s.landingBill = null;
    s.currentPlayer = s.players.indexOf(winner); s.phase = "ready"; s.roll = null; s.extraTurn = false;
  }
  function ensurePlaying(s) { assert(!s.winnerId, "The game is complete. Undo an action to resume play."); }
  function captureLanding(s) {
    if (s.winnerId || s.moneyMode !== "banker" || s.bankLandingResolved || !["landed", "classic-first-stop"].includes(s.phase)) return;
    const p = s.players[s.currentPlayer], space = s.spaces[p.position];
    if (p.inJail || s.landingBill) return;
    const dice = s.roll ? s.roll.d1 + s.roll.d2 + (typeof s.roll.speed === "number" ? s.roll.speed : 0) : 0;
    const owned = ["property", "railroad", "utility"].includes(space.type) && space.owner;
    const amount = owned ? (space.owner === p.id ? 0 : rent(s, space, dice)) : space.index === 4 ? s.rules.incomeTax : space.index === 38 ? s.rules.luxuryTax : 0;
    if (owned || space.index === 4 || space.index === 38) s.landingBill = {
      from: p.id, to: owned ? space.owner : s.freeParkingRule === "pot" ? "pot" : "bank",
      amount, reason: `${owned ? "Rent" : "Tax"}: ${space.name}`, index: space.index
    };
  }
  function correctDebt(s, index, amount, reason) {
    const d = s.debts[index]; assert(d, "This bill is no longer pending.");
    assert(isMoney(amount) && typeof reason === "string" && reason.trim().length > 0 && reason.length <= 120, "Enter a valid amount and a correction reason.");
    log(s, `Bill correction: ${d.reason}, $${d.amount} → $${amount}. ${reason.trim()}`);
    d.amount = amount;
    // A zeroed bill still settles through the normal continuation (Jail/mortgage/landing).
  }
  function rent(s, space, dice = 0) {
    if (!space.owner || space.mortgaged) return 0;
    if (space.type === "property") {
      if (space.buildings) return space.rents[space.buildings];
      return space.rents[0] * (group(s, space).every(p => p.owner === space.owner) ? 2 : 1);
    }
    const count = s.spaces.filter(p => p.type === space.type && p.owner === space.owner).length;
    return space.type === "railroad" ? space.rents[count - 1] : space.rents[count - 1] * dice;
  }
  function log(s, message) { s.ledger.unshift({ message, time: new Date().toISOString() }); s.ledger = s.ledger.slice(0, 150); }
  function transfer(s, from, to, amount, reason) {
    ensurePlaying(s);
    assert(isMoney(amount), "Enter a whole-dollar amount from 0 to 100,000,000.");
    assert(from !== to, "Choose different payer and recipient.");
    const payer = from === "bank" ? null : player(s, from);
    const recipient = ["bank", "pot"].includes(to) ? null : player(s, to);
    if (s.moneyMode === "banker") {
      assert(!payer || payer.cash >= amount, "Not enough cash. Sell buildings, mortgage, or trade first.");
      if (payer) payer.cash -= amount;
      if (recipient) { assert(isMoney(recipient.cash + amount), "Balance is too large."); recipient.cash += amount; }
      if (to === "pot") s.freeParkingPot += amount;
    }
    log(s, `${reason}: ${payer ? payer.name : "Bank"} → ${recipient ? recipient.name : to === "pot" ? "Free Parking pot" : "Bank"}, $${amount}${s.moneyMode === "helper" ? " (physical money)" : ""}.`);
  }
  function owe(s, from, to, amount, reason, resume = null) {
    ensurePlaying(s);
    assert(isMoney(amount), "Invalid bill amount.");
    player(s, from); if (!["bank", "pot"].includes(to)) player(s, to);
    assert(from !== to, "A player cannot owe themselves.");
    s.debts.push({ from, to, amount, reason, resume });
    log(s, `${player(s, from).name} owes $${amount}: ${reason}.`);
  }
  function build(s, index, direction, auctionPrice) {
    ensurePlaying(s);
    const p = s.spaces[index]; assert(p?.type === "property" && p.owner, "Choose an owned street.");
    const owner = player(s, p.owner), siblings = group(s, p), supply = stock(s);
    if (direction === 1) {
      assert(!s.debts.length && !s.auctions.length, "Settle outstanding bills and auctions before building.");
      assert(siblings.every(q => q.owner === p.owner && !q.mortgaged), "Own the entire color group with no mortgages before building.");
      assert(p.buildings < 5 && p.buildings === Math.min(...siblings.map(q => q.buildings)), "Build evenly across the color group (maximum one hotel).");
      assert(p.buildings === 4 ? supply.hotels > 0 : supply.houses > 0, "The bank has no building of this type available.");
      const cost = auctionPrice ?? p.buildCost;
      assert(isMoney(cost) && (auctionPrice === undefined || cost > 0), "Enter a valid building auction price.");
      transfer(s, p.owner, "bank", cost, `${auctionPrice === undefined ? "Build" : "Building auction"} on ${p.name}`);
      p.buildingCosts.push(cost); p.buildings++;
    } else {
      assert(p.buildings > 0 && p.buildings === Math.max(...siblings.map(q => q.buildings)), "Sell evenly across the color group.");
      assert(p.buildings !== 5 || supply.houses >= 4, "The bank needs four houses to downgrade a hotel. Sell all buildings in this group instead.");
      transfer(s, "bank", owner.id, Math.floor(p.buildingCosts.pop() / 2), `Sell building on ${p.name}`);
      p.buildings--;
    }
  }
  function sellGroup(s, index) {
    ensurePlaying(s);
    const p = s.spaces[index]; assert(p?.type === "property" && p.owner, "Choose an owned street.");
    const siblings = group(s, p); assert(siblings.every(q => q.owner === p.owner), "This group has inconsistent ownership.");
    const value = siblings.reduce((n, q) => n + q.buildingCosts.reduce((total, cost) => total + Math.floor(cost / 2), 0), 0);
    assert(siblings.some(q => q.buildings), "This group has no buildings.");
    transfer(s, "bank", p.owner, value, `Sell all ${p.group} buildings`);
    siblings.forEach(q => { q.buildings = 0; q.buildingCosts = []; });
  }
  function mortgage(s, index) {
    ensurePlaying(s);
    const p = s.spaces[index]; assert(p?.owner, "Choose an owned property."); player(s, p.owner);
    assert(!group(s, p).some(q => q.buildings), "Sell every building in the color group before mortgaging.");
    if (p.mortgaged) {
      assert(!s.debts.length, "Settle bills before unmortgaging.");
      transfer(s, p.owner, "bank", p.mortgage + Math.ceil(p.mortgage / 10), `Unmortgage ${p.name}`);
    } else transfer(s, "bank", p.owner, p.mortgage, `Mortgage ${p.name}`);
    p.mortgaged = !p.mortgaged;
  }
  function buy(s, index, id, amount) {
    ensurePlaying(s);
    const p = s.spaces[index]; assert(p && ["property", "railroad", "utility"].includes(p.type) && !p.owner, "This property is not available.");
    assert(!s.debts.length, "Settle outstanding bills before buying.");
    transfer(s, id, "bank", amount ?? p.price, `Buy ${p.name}`);
    p.owner = id; p.mortgaged = false; p.buildings = 0; p.buildingCosts = [];
    s.auctions = s.auctions.filter(i => i !== index);
    if (s.players[s.currentPlayer]?.position === index) { s.landingResolved = true; s.firstStopResolved = true; s.bankLandingResolved = true; }
  }
  function trade(s, a, b, fromA, fromB, cashA, cashB, lift = []) {
    ensurePlaying(s);
    player(s, a); player(s, b); assert(a !== b, "Choose two different players.");
    assert(isMoney(cashA) && isMoney(cashB), "Enter valid trade amounts.");
    assert(fromA.length + fromB.length + cashA + cashB > 0, "Choose something to trade.");
    const ids = [...fromA, ...fromB]; assert(new Set(ids).size === ids.length, "A property cannot be offered twice.");
    for (const [list, owner] of [[fromA, a], [fromB, b]]) for (const index of list) {
      const p = s.spaces[index]; assert(p?.owner === owner, "A selected property changed owners.");
      assert(!group(s, p).some(q => q.buildings), "Sell all buildings in a color group before trading its properties.");
    }
    // Net cash exchange is atomic: each side can use the cash received in this trade.
    if (cashA > cashB) transfer(s, a, b, cashA - cashB, "Trade cash");
    if (cashB > cashA) transfer(s, b, a, cashB - cashA, "Trade cash");
    for (const [list, recipient] of [[fromA, b], [fromB, a]]) for (const index of list) {
      const p = s.spaces[index]; p.owner = recipient;
      if (p.mortgaged) owe(s, recipient, "bank", Math.ceil(p.mortgage / 10) + (lift.includes(index) ? p.mortgage : 0), `Mortgage transfer: ${p.name}`, lift.includes(index) ? { kind: "unmortgage", index } : null);
    }
    log(s, `Trade completed between ${player(s, a).name} and ${player(s, b).name}: ${ids.map(i => s.spaces[i].name).join(", ") || "cash only"}.`);
  }
  function bankrupt(s, id, creditor, lift = []) {
    const p = player(s, id); assert(active(s).length > 1, "The last player has won; the game is complete."); assert(id !== creditor, "Choose another creditor.");
    if (creditor !== "bank") player(s, creditor);
    const assets = s.spaces.filter(q => q.owner === id);
    const proceeds = assets.reduce((n, q) => n + q.buildingCosts.reduce((total, cost) => total + Math.floor(cost / 2), 0), 0);
    if (s.moneyMode === "banker") {
      const debt = s.debts.find(d => d.from === id);
      assert(debt, "Record the unpaid bill before declaring bankruptcy.");
      assert((debt.to === "pot" ? "bank" : debt.to) === creditor, "The creditor must match the unpaid bill.");
      const available = p.cash + proceeds + assets.reduce((n, q) => n + (q.mortgaged ? 0 : q.mortgage), 0);
      assert(available < debt.amount, "This player can cover the bill by selling buildings and mortgaging. Raise the cash first.");
      if (creditor !== "bank") player(s, creditor).cash += p.cash + proceeds;
    }
    s.debts = s.debts.filter(d => d.from !== id);
    s.debts.forEach(d => { if (d.to === id) d.to = creditor; });
    s.debts = s.debts.filter(d => d.from !== d.to);
    assets.forEach(q => {
      q.buildings = 0; q.buildingCosts = [];
      q.owner = creditor === "bank" ? null : creditor;
      if (creditor === "bank") { q.mortgaged = false; if (!s.auctions.includes(q.index)) s.auctions.push(q.index); }
      else if (q.mortgaged) owe(s, creditor, "bank", Math.ceil(q.mortgage / 10) + (lift.includes(q.index) ? q.mortgage : 0), `Inherited mortgage: ${q.name}`, lift.includes(q.index) ? { kind: "unmortgage", index: q.index } : null);
    });
    if (s.landingBill?.to === id) {
      s.landingBill.to = creditor;
      if (s.landingBill.from === creditor) s.landingBill.amount = 0;
    }
    p.cash = 0; p.bankrupt = true; p.inJail = false; p.consecutiveDoubles = 0;
    if (s.players[s.currentPlayer].id === id) advance(s);
    log(s, `${p.name} is bankrupt to ${creditor === "bank" ? "the bank" : player(s, creditor).name}. Buildings returned; ${assets.length} properties ${creditor === "bank" ? "queued for auction" : "transferred"}. Hand over any physical Get Out of Jail Free cards to the creditor, or return them to their decks for bank bankruptcy.`);
    finish(s);
  }
  function advance(s) {
    if (active(s).length) do { s.currentPlayer = (s.currentPlayer + 1) % s.players.length; } while (s.players[s.currentPlayer].bankrupt);
    s.roll = null; s.phase = "ready"; s.extraTurn = false; s.pendingFinderTarget = null;
    s.firstStopResolved = false; s.landingResolved = true; s.bankLandingResolved = false; s.landingBill = null; s.message = "";
  }
  function settle(s) {
    const d = s.debts[0]; assert(d, "No payment is pending.");
    transfer(s, d.from, d.to, d.amount, d.reason); s.debts.shift();
    if (d.resume?.kind === "unmortgage") s.spaces[d.resume.index].mortgaged = false;
    return d.resume;
  }
  function run(state, action) { const next = structuredClone(state); const result = action(next); return { state: next, result }; }
  function validate(s) {
    assert(s && s.version === 6 && ["helper", "banker"].includes(s.moneyMode), "Invalid game format.");
    assert(Array.isArray(s.players) && s.players.length <= 8 && (!s.started || s.players.length >= 2), "A game needs 2–8 players.");
    const ids = s.players.map(p => p.id); assert(new Set(ids).size === ids.length, "Duplicate player IDs.");
    s.players.forEach(p => {
      assert(typeof p.id === "string" && /^[\w-]{1,100}$/.test(p.id) && !["bank", "pot"].includes(p.id), "Invalid player ID.");
      assert(typeof p.name === "string" && p.name.length <= 24 && isMoney(p.cash), "Invalid player details.");
      assert(Number.isInteger(p.position) && p.position >= 0 && p.position < 40, "Invalid player position.");
      assert(/^#[0-9a-f]{6}$/i.test(p.color), "Invalid player color.");
      assert(typeof p.token === "string" && (p.token.length < 20 || /^data:image\/(jpeg|png|webp);base64,[a-z0-9+/=]+$/i.test(p.token) && p.token.length < 60000), "Invalid token image.");
    });
    assert(Array.isArray(s.spaces) && s.spaces.length === 40, "Invalid board.");
    s.spaces.forEach((p, i) => {
      assert(p.index === i && typeof p.name === "string" && p.name.length <= 40, "Invalid board space.");
      assert(p.owner === null || ids.includes(p.owner) && !s.players.find(q => q.id === p.owner).bankrupt, "Invalid property owner.");
      assert([p.price, p.mortgage, p.buildCost].every(isMoney) && Array.isArray(p.rents) && p.rents.every(isMoney), "Invalid property values.");
      assert(p.rents.length === (p.type === "property" ? 6 : p.type === "railroad" ? 4 : p.type === "utility" ? 2 : 0), "Invalid rent schedule.");
      assert(Number.isInteger(p.buildings) && p.buildings >= 0 && p.buildings <= 5 && (!p.buildings || p.type === "property" && p.owner && !p.mortgaged), "Invalid buildings.");
      assert(Array.isArray(p.buildingCosts) && p.buildingCosts.length === p.buildings && p.buildingCosts.every(isMoney), "Invalid building purchase history.");
      if (p.buildings) { const siblings = group(s, p); assert(siblings.every(q => q.owner === p.owner && !q.mortgaged) && Math.max(...siblings.map(q => q.buildings)) - Math.min(...siblings.map(q => q.buildings)) <= 1, "Buildings must be even in an unmortgaged color group."); }
    });
    assert(stock(s).houses >= 0 && stock(s).hotels >= 0, "Too many buildings on the board.");
    assert(Object.values(s.rules).every(isMoney) && isMoney(s.freeParkingPot), "Invalid bank settings.");
    assert(Number.isInteger(s.currentPlayer) && s.currentPlayer >= 0 && (!s.started || s.currentPlayer < s.players.length && active(s).length > 0 && !s.players[s.currentPlayer].bankrupt), "Invalid current player.");
    assert(["ready", "landed", "bus", "triples", "classic-first-stop"].includes(s.phase), "Invalid turn phase.");
    assert(!["bus", "triples", "classic-first-stop"].includes(s.phase) || s.roll, "This turn phase needs saved dice.");
    if (s.roll) assert([s.roll.d1, s.roll.d2].every(n => Number.isInteger(n) && n >= 1 && n <= 6) && [null, 1, 2, 3, "Bus", "Property Finder"].includes(s.roll.speed), "Invalid saved dice.");
    if (s.landingBill) {
      const d = s.landingBill;
      assert(isMoney(d.amount) && typeof d.reason === "string" && d.reason.length < 500 && d.from === s.players[s.currentPlayer]?.id && d.index === s.players[s.currentPlayer]?.position, "Invalid landing bill.");
      player(s, d.from); if (!["bank", "pot"].includes(d.to)) player(s, d.to);
    }
    assert(Array.isArray(s.debts) && s.debts.length <= 100 && Array.isArray(s.auctions), "Invalid pending actions.");
    s.debts.forEach(d => { assert(isMoney(d.amount) && typeof d.reason === "string" && d.reason.length < 500, "Invalid bill."); player(s, d.from); if (!["bank", "pot"].includes(d.to)) player(s, d.to); assert(d.from !== d.to, "Invalid creditor.");
      if (d.resume) { assert(["landing", "jail-roll", "jail-move", "unmortgage"].includes(d.resume.kind), "Invalid continuation."); if (d.resume.kind === "unmortgage") assert(Number.isInteger(d.resume.index) && s.spaces[d.resume.index]?.owner === d.from, "Invalid mortgage continuation."); if (d.resume.kind === "jail-move") assert(Number.isInteger(d.resume.amount) && d.resume.amount >= 2 && d.resume.amount <= 12, "Invalid jail move."); }
    });
    assert(new Set(s.auctions).size === s.auctions.length && s.auctions.every(i => Number.isInteger(i) && ["property", "railroad", "utility"].includes(s.spaces[i]?.type) && !s.spaces[i].owner), "Invalid auction queue.");
    assert(Array.isArray(s.ledger) && s.ledger.length <= 150 && s.ledger.every(e => typeof e.message === "string" && e.message.length < 5000 && typeof e.time === "string"), "Invalid ledger.");
    return true;
  }
  const api = { finish, ensurePlaying, captureLanding, correctDebt, defaults, upgrade, rent, stock, group, active, player, isMoney, assert, log, transfer, owe, build, sellGroup, mortgage, buy, trade, bankrupt, advance, settle, run, validate };
  root.SpeedDieRules = api;
  if (typeof module !== "undefined") module.exports = api;
})(globalThis);

/* Card effects are concise gameplay summaries, not reproductions of card artwork. */
(function(G) {
  const c = (type, values={}) => ({type,...values});
  const decks = {
    chance: [c('move',{target:0}),c('move',{target:24}),c('move',{target:11}),c('utility'),c('railroad'),c('railroad'),c('collect',{amount:50}),c('keep'),c('back',{amount:3}),c('jail'),c('repairs',{house:25,hotel:100}),c('pay',{amount:15}),c('move',{target:5}),c('move',{target:39}),c('pay-each',{amount:50}),c('collect',{amount:150})],
    chest: [c('move',{target:0}),c('collect',{amount:200}),c('pay',{amount:50}),c('collect',{amount:50}),c('keep'),c('jail'),c('collect',{amount:100}),c('collect',{amount:100}),c('collect',{amount:20}),c('collect-each',{amount:10}),c('collect',{amount:100}),c('pay',{amount:100}),c('pay',{amount:50}),c('collect',{amount:25}),c('repairs',{house:40,hotel:115}),c('collect',{amount:10})]
  };
  function cardText(e) {
    return ({collect:`Collect $${e.amount} from the bank.`,pay:`Pay the bank $${e.amount}.`,'collect-each':`Collect $${e.amount} from each other player.`,'pay-each':`Pay each other player $${e.amount}.`,move:`Advance to ${({0:'GO',5:'Reading Railroad',11:'St. Charles Place',24:'Illinois Avenue',39:'Boardwalk'})[e.target] || `space ${e.target}`}. Collect GO salary if you pass GO.`,back:`Move backward ${e.amount} spaces. Do not collect GO.`,railroad:'Advance to the nearest railroad. If owned by another player, pay double its normal rent.',utility:'Advance to the nearest utility. If owned by another player, roll two fresh dice and pay ten times their total.',jail:'Go directly to Jail. Do not collect GO. Your turn ends.',keep:'Keep a Get Out of Jail Free card until used or traded.',repairs:`Pay $${e.house} per house and $${e.hotel} per hotel. Hotels count only as hotels.`})[e.type];
  }
  function initDecks(s, random=Math.random) {
    s.decks = Object.fromEntries(Object.entries(decks).map(([name,list])=>{
      const ids=list.map((_,i)=>i);for(let i=ids.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[ids[i],ids[j]]=[ids[j],ids[i]];}return [name,ids];
    }));
    s.heldCards=[];s.pendingCard=null;
  }
  function drawCard(s, deck) {
    G.assert(!s.pendingCard && decks[deck], 'A card is already drawn or this deck is unavailable.');
    if (!s.decks) initDecks(s);
    const id=s.decks[deck].shift();G.assert(id !== undefined,'No card available.');
    s.pendingCard={deck,id,effect:structuredClone(decks[deck][id])};
    G.log(s,`Drew ${deck === 'chance' ? 'Chance' : 'Community Chest'}: ${cardText(s.pendingCard.effect)}`);
  }
  function resolved(s) {s.bankLandingResolved=true;s.landingResolved=true;s.firstStopResolved=true;s.landingBill=null;}
  function applyCard(s, die=()=>Math.floor(Math.random()*6)+1) {
    G.ensurePlaying(s);
    const card=s.pendingCard;G.assert(card,'Draw or enter a card first.');
    const e=card.effect,p=s.players[s.currentPlayer], reason=cardText(e);
    G.assert(reason,'Unknown card consequence.');
    if (['collect','pay','collect-each','pay-each'].includes(e.type)) G.assert(G.isMoney(e.amount),'Invalid card amount.');
    s.pendingCard=null; resolved(s);
    if (!card.physical && e.type !== 'keep') s.decks[card.deck].push(card.id);
    const pay=(from,to,amount)=>G.owe(s,from,to,amount,reason);
    if (e.type==='collect') G.transfer(s,'bank',p.id,e.amount,reason);
    if (e.type==='pay') pay(p.id,'bank',e.amount);
    if (e.type==='pay-each') G.active(s).filter(q=>q.id!==p.id).forEach(q=>pay(p.id,q.id,e.amount));
    if (e.type==='collect-each') G.active(s).filter(q=>q.id!==p.id).forEach(q=>pay(q.id,p.id,e.amount));
    if (e.type==='repairs') {
      G.assert(G.isMoney(e.house)&&G.isMoney(e.hotel),'Invalid repair rates.');
      const amount=s.spaces.filter(q=>q.owner===p.id).reduce((n,q)=>n+(q.buildings===5?e.hotel:q.buildings*e.house),0);
      if(amount) pay(p.id,'bank',amount);
    }
    if (e.type==='keep') {s.heldCards ||= []; G.assert(!s.heldCards.some(c=>c.deck===card.deck), 'This deck’s Jail card is already held. Check the physical card or undo the earlier entry.'); s.heldCards.push({deck:card.deck,id:card.physical?null:card.id,physical:!!card.physical,owner:p.id});}
    if (e.type==='jail') {p.position=10;p.inJail=true;p.jailAttempts=0;p.consecutiveDoubles=0;s.extraTurn=false;s.phase='landed';s.pendingFinderTarget=null;}
    if (['move','back','railroad','utility'].includes(e.type)) {
      const old=p.position;
      if(e.type==='move') {G.assert(Number.isInteger(e.target)&&e.target>=0&&e.target<40,'Invalid destination.');p.position=e.target;}
      if(e.type==='back') {G.assert(Number.isInteger(e.amount)&&e.amount>0&&e.amount<40,'Choose 1–39 spaces.');p.position=(old-e.amount+40)%40;}
      if(e.type==='railroad'||e.type==='utility') {const targets=e.type==='railroad'?[5,15,25,35]:[12,28];p.position=targets.find(i=>i>old)??targets[0];}
      if(e.type!=='back' && p.position<=old) {p.passedGo=true;G.transfer(s,'bank',p.id,s.rules.go,'Card passes GO');}
      s.bankLandingResolved=false;s.landingResolved=false;s.firstStopResolved=false;s.landingBill=null;
      if(p.position===30){p.position=10;p.inJail=true;p.jailAttempts=0;p.consecutiveDoubles=0;s.extraTurn=false;s.phase='landed';resolved(s);}
      else {
        G.captureLanding(s);
        const q=s.spaces[p.position];
        if(q.owner && q.owner!==p.id && !q.mortgaged && ['railroad','utility'].includes(e.type)) {
          let amount;
          if(e.type==='railroad') amount=G.rent(s,q)*2;
          else {const a=die(),b=die();G.assert([a,b].every(n=>Number.isInteger(n)&&n>=1&&n<=6),'Invalid utility dice.');amount=(a+b)*10;G.log(s,`Utility card dice: ${a} + ${b}; pay $${amount}.`);}
          s.landingBill={from:p.id,to:q.owner,amount,index:q.index,reason:`Card rent: ${q.name}`};
        }
      }
    }
    s.message=reason;G.log(s,`Applied card: ${reason}`);
  }
  function useHeldCard(s,id) {
    const i=(s.heldCards||[]).findIndex(c=>c.owner===id);G.assert(i>=0,'This player has no recorded Get Out of Jail Free card.');
    const [card]=s.heldCards.splice(i,1);if(!card.physical)s.decks[card.deck].push(card.id);
    G.log(s,`${G.player(s,id).name} used a Get Out of Jail Free card.`);
  }
  function startAuction(s,index) {
    G.assert(!s.auction&&!s.debts.length&&!s.pendingCard,'Finish the pending action first.');
    G.assert(['property','railroad','utility'].includes(s.spaces[index]?.type)&&!s.spaces[index].owner,'Property unavailable.');
    s.auction={index,bid:0,leader:null,turn:s.players[s.currentPlayer].id,remaining:G.active(s).map(p=>p.id)};
  }
  function auctionTurn(s,amount) {
    const a=s.auction;G.assert(a,'No auction in progress.');
    const bidder=G.player(s,a.turn),order=G.active(s).map(p=>p.id), old=order.indexOf(a.turn);
    if(amount===null) a.remaining=a.remaining.filter(id=>id!==a.turn);
    else {G.assert(G.isMoney(amount)&&amount>a.bid,'Bid must exceed the current bid.');G.assert(s.moneyMode!=='banker'||bidder.cash>=amount,'Bid exceeds available cash.');a.bid=amount;a.leader=bidder.id;}
    G.log(s,`${bidder.name} ${amount===null?'passed':`bid $${amount}`} on ${s.spaces[a.index].name}.`);
    const challengers=a.remaining.filter(id=>id!==a.leader);
    if(!challengers.length){
      if(a.leader) G.buy(s,a.index,a.leader,a.bid);
      else {s.auctions=s.auctions.filter(i=>i!==a.index);if(s.players[s.currentPlayer].position===a.index)resolved(s);G.log(s,'No bids: property remains in the bank.');}
      s.auction=null;return;
    }
    for(let n=1;n<=order.length;n++){const id=order[(old+n)%order.length];if(challengers.includes(id)){a.turn=id;break;}}
  }
  const bankrupt=G.bankrupt;
  G.bankrupt=function(s,id,creditor,lift){
    bankrupt(s,id,creditor,lift);
    (s.heldCards||[]).filter(c=>c.owner===id).forEach(c=>{if(creditor==='bank'){if(!c.physical)s.decks[c.deck].push(c.id);}else c.owner=creditor;});
    s.heldCards=(s.heldCards||[]).filter(c=>c.owner!==id);
  };
  const validate=G.validate;
  G.validate=function(s){
    validate(s);
    if(s.cardMode!==undefined)G.assert(['physical','digital'].includes(s.cardMode),'Invalid card mode.');
    if(s.gameName!==undefined)G.assert(typeof s.gameName==='string'&&s.gameName.length<=50,'Invalid game name.');
    if(s.pendingCard){
      const {effect:e,deck,id,physical}=s.pendingCard;
      G.assert(e&&cardText(e)&&decks[deck],'Invalid saved card.');
      G.assert(['landed','classic-first-stop'].includes(s.phase)&&[2,7,17,22,33,36].includes(s.players[s.currentPlayer].position)&&!s.bankLandingResolved,'Invalid pending card location.');
      if(!physical)G.assert(s.decks&&decks[deck][id]&&Object.entries(decks[deck][id]).every(([k,v])=>e[k]===v),'Card effect does not match the deck.');
      if(['collect','pay','collect-each','pay-each'].includes(e.type))G.assert(G.isMoney(e.amount),'Invalid card amount.');
      if(e.type==='move')G.assert(Number.isInteger(e.target)&&e.target>=0&&e.target<40,'Invalid card destination.');
      if(e.type==='back')G.assert(Number.isInteger(e.amount)&&e.amount>0&&e.amount<40,'Invalid backward movement.');
      if(e.type==='repairs')G.assert(G.isMoney(e.house)&&G.isMoney(e.hotel),'Invalid repair prices.');
    }
    if(s.decks){for(const name of ['chance','chest']){
      G.assert(Array.isArray(s.decks[name]),'Invalid card deck.');
      const ids=[...s.decks[name],...(s.heldCards||[]).filter(c=>!c.physical&&c.deck===name).map(c=>c.id),...(s.pendingCard&&!s.pendingCard.physical&&s.pendingCard.deck===name?[s.pendingCard.id]:[])];
      G.assert(ids.length===16&&new Set(ids).size===16&&ids.every(i=>Number.isInteger(i)&&i>=0&&i<16),'Cards are duplicated or missing.');
    }}
    (s.heldCards||[]).forEach(c=>{G.player(s,c.owner);G.assert(decks[c.deck]&&(c.physical||decks[c.deck][c.id]?.type==='keep'),'Invalid held card.');});
    if(s.auction){const a=s.auction;G.assert(!s.spaces[a.index]?.owner&&['property','railroad','utility'].includes(s.spaces[a.index]?.type)&&G.isMoney(a.bid)&&Array.isArray(a.remaining)&&a.remaining.includes(a.turn)&&a.turn!==a.leader,'Invalid auction.');G.assert(new Set(a.remaining).size===a.remaining.length && a.remaining.length>0,'Invalid auction participants.');a.remaining.forEach(id=>G.player(s,id));if(a.leader){G.player(s,a.leader);G.assert(a.remaining.includes(a.leader)&&a.bid>0,'Invalid auction leader.');}}
    return true;
  };
  Object.assign(G,{cardText,initDecks,drawCard,applyCard,useHeldCard,startAuction,auctionTurn,cardDecks:decks});
})(globalThis.SpeedDieRules);
