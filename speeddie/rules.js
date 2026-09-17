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
    s.winnerId = winner.id; s.debts = []; s.auctions = []; s.landingBill = null;
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
