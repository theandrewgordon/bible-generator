"use strict";
const G = SpeedDieRules;
const TOKEN_CHOICES = ["🐕", "🐎", "🚗", "🚢", "🎩", "🐈", "🦖", "🧱"];
const money = n => `$${Number(n).toLocaleString()}`;
const buildingLabel = p => p.buildings === 5 ? "Hotel" : `${p.buildings} house${p.buildings === 1 ? "" : "s"}`;
function tokenMarkup(p) {
  return p.token?.startsWith("data:image/") ? `<img src="${escapeHTML(p.token)}" alt="" class="token-image">` : escapeHTML(p.token || initials(p.name));
}
function gameBlocked() { return Boolean(state.debts.length || state.auctions.length || G.active(state).length < 2); }
function creditGo(p, times = 1) {
  if (state.moneyMode === "banker") G.transfer(state, "bank", p.id, state.rules.go * times, "GO salary");
}
function commitGame(action) {
  try {
    G.ensurePlaying(state);
    G.captureLanding(state);
    const next = G.run(state, action);
    G.finish(next.state);
    G.validate(next.state);
    state = next.state;
    if (!saveState()) { render(); return false; }
    render();
    return true;
  } catch (error) { alert(error.message); return false; }
}
function bankLandingPending() {
  return state.moneyMode === "banker" && ["landed", "classic-first-stop"].includes(state.phase) && !state.bankLandingResolved && !currentPlayer().inJail;
}
function playerOptions(selected, bank = false) {
  return `${bank ? '<option value="bank">Bank</option><option value="pot">Free Parking pot</option>' : ""}${G.active(state).map(p => `<option value="${p.id}" ${p.id === selected ? "selected" : ""}>${escapeHTML(p.name)}</option>`).join("")}`;
}
function button(label, action, value = "", extra = "") {
  return `<button type="button" class="button secondary" data-action="${action}" data-value="${escapeHTML(value)}" ${extra}>${label}</button>`;
}
function amountField(label, id, value, extra = "") {
  return `<label class="field"><span>${escapeHTML(label)}</span><input id="${id}" type="number" ${extra.includes("min=") ? "" : 'min="0"'} max="100000000" step="1" value="${value}" required ${extra}></label>`;
}
function renderCompanion() {
  const supply = G.stock(state);
  return `<section class="panel companion-toolbar"><div class="players-heading"><div><strong>${state.moneyMode === "banker" ? "Banker mode" : "Physical money"}</strong><p class="muted small">Bank: ${supply.houses} houses · ${supply.hotels} hotels${state.freeParkingRule === "pot" && state.moneyMode === "banker" ? ` · Pot ${money(state.freeParkingPot)}` : ""}</p></div>${button("Undo last action", "undo", "", !undoState ? "disabled" : "")}</div>
    <div class="companion-actions">${button("Manage properties", "properties")}${button("Payment / card", "payment")}${button("History", "history")}</div></section>`;
}
function renderPendingActions() {
  if (state.winnerId) {
    const winner = state.players.find(p => p.id === state.winnerId);
    return `<section class="panel instruction winner-panel"><p class="eyebrow">Game complete</p><h2>${escapeHTML(winner.name)} wins!</h2><p>No more payments or auctions are required. Use Undo to correct the result.</p>${button("View game history", "history")}</section>`;
  }
  if (state.debts.length) {
    const d = state.debts[0], p = G.player(state, d.from);
    const short = Math.max(0, d.amount - p.cash);
    return `<section class="panel instruction debt-panel"><p class="eyebrow">Payment pending</p><h2>${escapeHTML(p.name)} owes ${money(d.amount)}</h2><p>${escapeHTML(d.reason)} · To ${["bank", "pot"].includes(d.to) ? d.to === "pot" ? "Free Parking pot" : "the bank" : escapeHTML(G.player(state, d.to).name)}</p>
      <p>${state.moneyMode === "helper" ? "Resolve this payment using physical money, then record it here." : short ? `Cash: ${money(p.cash)}. Still needed: ${money(short)}. Sell buildings, mortgage, or trade to raise cash.` : "Enough cash is available to settle this bill."}</p>
      <div class="button-stack">${button(state.moneyMode === "helper" ? "Record payment made" : `Pay ${money(d.amount)}`, "settle", "", state.moneyMode === "banker" && short ? "disabled" : "")}${button("Sell / mortgage properties", "properties", p.id)}${button("Trade", "trade")}${button("Review bankruptcy", "bankruptcy", p.id)}${button("Correct / waive this bill", "correct-debt")}</div><p class="muted small">${state.debts.length > 1 ? `${state.debts.length - 1} more payment(s) follow. ` : ""}The turn resumes after outstanding bills and auctions are settled.</p></section>`;
  }
  if (state.auctions.length) {
    const p = state.spaces[state.auctions[0]];
    return `<section class="panel instruction"><p class="eyebrow">Bankruptcy auction · ${state.auctions.length} remaining</p><h2>${escapeHTML(p.name)}</h2><p>Auction this property with the players at the table, then record the winner and bid.</p>${button("Record winning bid", "auction", p.index)}</section>`;
  }
  const alive = G.active(state);
  if (alive.length === 1) return `<section class="panel instruction winner-panel"><p class="eyebrow">Game complete</p><h2>${escapeHTML(alive[0].name)} wins!</h2><p>The last player remaining.</p>${button("View game history", "history")}</section>`;
  return "";
}
function landingAmount() { return state.landingBill?.amount || 0; }
function readAmount(id, allowZero = false) {
  const input = document.querySelector(`#${id}`), raw = input.value.trim();
  G.assert(raw !== "" && input.checkValidity() && G.isMoney(Number(raw)) && (allowZero || Number(raw) > 0), allowZero ? "Enter a whole-dollar amount, including 0 for a waiver." : "Enter a whole-dollar amount greater than zero. Use the waiver action for no payment.");
  return Number(raw);
}
function openDebtCorrection() {
  const debt = state.debts[0];
  showDialog("Correct / waive pending bill", `<p>${escapeHTML(debt.reason)} · currently ${money(debt.amount)}. Enter 0 to waive the bill. The turn resumes through the usual payment button.</p>${amountField("Correct amount", "corrected-amount", debt.amount)}<label class="field"><span>Reason for correction / waiver</span><input id="correction-reason" maxlength="120" required></label><button class="button" type="submit">Save bill correction</button>`, () => commitGame(s => {
    G.assert(JSON.stringify(s.debts[0]) === JSON.stringify(debt), "The bill changed. Reopen the correction.");
    G.correctDebt(s, 0, readAmount("corrected-amount", true), document.querySelector("#correction-reason").value);
  }));
}
function openLandingWaiver() {
  showDialog("Waive this landing payment", `<p>This records a deliberate waiver of ${money(landingAmount())}.</p><label class="field"><span>Reason</span><input id="waiver-reason" maxlength="120" required></label><button class="button" type="submit">Record waiver</button>`, () => commitGame(s => {
    const reason = document.querySelector("#waiver-reason").value.trim(); G.assert(reason, "Enter a waiver reason.");
    G.log(s, `Waived ${s.landingBill.reason}: $${s.landingBill.amount} → $0. ${reason}`); markResolved(s);
  }));
}
function renderBankLanding() {
  const p = currentSpace();
  if (state.bankLandingResolved || currentPlayer().inJail) return `<p class="status-note">This stop is resolved.</p>`;
  if (isProperty(p) && !p.owner && !state.landingBill) return `<div class="landing-card"><h3>${escapeHTML(p.name)} · ${money(p.price)}</h3><div class="button-stack">${button(`Buy for ${money(p.price)}`, "buy", "", currentPlayer().cash < p.price ? "disabled" : "")}${button("Auction property", "auction", p.index)}${button("House rule: leave unowned", "leave")}</div>${currentPlayer().cash < p.price ? '<p class="muted">Raise cash using Manage properties or Trade, or auction this property.</p>' : ""}</div>`;
  const amount = landingAmount();
  if (amount) return `<div class="landing-card"><p>${escapeHTML(state.landingBill.reason)} · owed to ${["bank", "pot"].includes(state.landingBill.to) ? "the bank" : escapeHTML(G.player(state, state.landingBill.to).name)}. Amount recorded on arrival.</p>${amountField(isProperty(p) ? "Rent due (adjust for a card’s special rent)" : "Tax due", "landing-payment", amount, 'min="1"')}${button("Pay / resolve bill", "landing-pay")}${button("Waive payment / correction", "waive-landing")}</div>`;
  if (state.landingBill) return `<p class="status-note">No payment was due when you arrived.</p>${button("Finish this stop", "resolve")}`;
  if ([7, 22, 36, 2, 17, 33].includes(p.index)) return `<p>Draw your physical ${[7, 22, 36].includes(p.index) ? "Chance" : "Community Chest"} card. Record its money effects or move the token, then finish this stop.</p><div class="button-stack">${button("Record card payment", "payment")}${button("Card moved my token", "card-move")}${button("Done with card", "resolve")}</div>`;
  if (p.index === 20 && state.freeParkingRule !== "official") {
    const amount = state.freeParkingRule === "pot" ? state.freeParkingPot : Number(state.freeParkingRule);
    return `<p>Free Parking house rule: collect ${money(amount)}.</p>${button(`Collect ${money(amount)}`, "parking")}`;
  }
  return `<p class="status-note">${p.mortgaged ? "Mortgaged: no rent due." : p.owner ? "You own this property. No rent due." : p.index === 0 ? "GO salary was recorded with the move." : "No payment is due here."}</p>${button("Finish this stop", "resolve")}`;
}
function markResolved(s) { s.landingBill = null; s.bankLandingResolved = true; s.landingResolved = true; s.firstStopResolved = true; }
function settleBill() {
  commitGame(s => {
    const resume = G.settle(s);
    if (resume?.kind === "landing") markResolved(s);
    if (resume?.kind?.startsWith("jail-")) {
      const p = s.players[s.currentPlayer]; p.inJail = false; p.jailAttempts = 0; p.consecutiveDoubles = 0;
      if (resume.kind === "jail-move") {
        p.position += resume.amount;
        s.phase = "landed"; s.extraTurn = false; s.bankLandingResolved = false; s.landingBill = null;
        s.landingResolved = !isProperty(s.spaces[p.position]) || s.spaces[p.position].owner !== null;
        s.message = `Left Jail after paying. Move ${resume.amount} spaces to ${s.spaces[p.position].name}.`;
      } else { s.phase = "ready"; s.message = "Jail fine paid. Roll normally."; }
    }
  });
}
function showDialog(title, contents, onSubmit) {
  const dialog = document.querySelector("#companion-dialog");
  if (dialog.open) dialog.close();
  dialog.innerHTML = `<form id="companion-form"><h2>${escapeHTML(title)}</h2>${contents}<div class="dialog-footer"><button type="button" class="button quiet" id="close-companion">Close</button></div></form>`;
  dialog.querySelector("#close-companion").onclick = () => dialog.close();
  dialog.querySelector("form").onsubmit = async e => { e.preventDefault(); if (onSubmit) { try { if (await onSubmit() !== false) dialog.close(); } catch (error) { alert(error.message); } } };
  bindActions(dialog);
  dialog.showModal();
}
function openProperties(selected = currentPlayer().id) {
  const p = G.active(state).find(p => p.id === selected) || G.active(state)[0];
  showDialog("Manage properties", `<label class="field"><span>Player</span><select id="manage-player">${playerOptions(p.id)}</select></label><p class="muted small">Build or sell evenly. One hotel replaces four houses. You may manage properties between turns and while in Jail.</p><div class="property-grid">${state.spaces.filter(q => q.owner === p.id).map(q => `<article class="property-card" style="border-top-color:${GROUP_COLORS[q.group]}"><h3>${escapeHTML(q.name)}</h3><p>${q.mortgaged ? "Mortgaged" : q.type === "property" ? `${buildingLabel(q)} · Rent ${money(G.rent(state, q))}` : q.type === "railroad" ? `Rent ${money(G.rent(state, q))}` : `Rent ${q.rents.join("× / ")}× dice`}</p><div class="button-stack">${q.type === "property" ? button(`Build · ${money(q.buildCost)}`, "build", q.index, gameBlocked() ? "disabled" : "") + button("Sell one building", "sell", q.index, !q.buildings ? "disabled" : "") : ""}${button(q.mortgaged ? `Unmortgage · ${money(q.mortgage + Math.ceil(q.mortgage / 10))}` : `Mortgage · receive ${money(q.mortgage)}`, "mortgage", q.index)}${button("Details / settings", "property", q.index)}</div></article>`).join("") || '<p class="muted">No properties owned yet.</p>'}</div>`);
  document.querySelector("#manage-player").onchange = e => openProperties(e.target.value);
}
function openProperty(index) {
  const p = state.spaces[index];
  showDialog(p.name, `<p>${escapeHTML(p.group)} · ${p.owner ? escapeHTML(G.player(state, p.owner).name) : "Unowned"} · ${p.mortgaged ? "Mortgaged" : p.type === "property" ? buildingLabel(p) : "Unmortgaged"}</p>
    ${p.owner ? `<div class="button-stack">${p.type === "property" ? button(`Build · ${money(p.buildCost)}`, "build", index) + button("Sell one building", "sell", index) + button("Sell all buildings in this color group", "sell-group", index) + button("Record building auction purchase", "building-auction", index) : ""}${button(p.mortgaged ? "Unmortgage" : "Mortgage", "mortgage", index)}</div>` : button("Record purchase / auction", "auction", index)}
    <details class="edition-details"><summary>Edition values / correction</summary><p class="muted small">Use the amounts on your physical deed. Ownership corrections do not move money; use a purchase or trade for normal play.</p>
    ${amountField("Purchase price", "property-price", p.price)}${amountField("Mortgage value", "property-mortgage", p.mortgage)}${p.type === "property" ? amountField("House / hotel cost", "property-build", p.buildCost) : ""}
    ${p.rents.map((v, i) => amountField(p.type === "property" ? ["Base rent", "1 house", "2 houses", "3 houses", "4 houses", "Hotel rent"][i] : p.type === "railroad" ? `${i + 1} railroad(s)` : `${i + 1} utility multiplier`, `rent-${i}`, v)).join("")}
    <label class="field"><span>Correct owner</span><select id="property-owner"><option value="">Unowned</option>${playerOptions(p.owner)}</select></label><button class="button" type="submit">Save values / correction</button></details>`, () => commitGame(s => {
      G.assert(!s.debts.length && !s.auctions.length, "Settle bills and auctions before editing deed values.");
      const q = s.spaces[index], owner = document.querySelector("#property-owner").value || null;
      if (q.owner !== owner) {
        G.assert(!s.debts.length && !s.auctions.length, "Settle bills and auctions before correcting ownership.");
        G.assert(!G.group(s, q).some(x => x.buildings), "Sell group buildings before changing ownership.");
        q.owner = owner; if (!owner) q.mortgaged = false;
      }
      q.price = Number(document.querySelector("#property-price").value); q.mortgage = Number(document.querySelector("#property-mortgage").value);
      if (q.type === "property") q.buildCost = Number(document.querySelector("#property-build").value);
      q.rents = q.rents.map((_, i) => Number(document.querySelector(`#rent-${i}`).value));
      G.log(s, `Updated deed values / ownership for ${q.name}.`);
    }));
}
function openAuction(index) {
  const p = state.spaces[index];
  if (p.owner) return;
  showDialog(`Auction · ${p.name}`, `<p>Hold the auction at the table. Any active player may bid, including the player who declined the purchase.</p><label class="field"><span>Winning player</span><select id="auction-player">${playerOptions(currentPlayer().id)}</select></label>${amountField("Winning bid", "auction-price", p.price, 'min="1"')}<button class="button" type="submit">Record purchase</button>${button("House rule: no bids, leave unowned", "auction-skip", index)}`, () => commitGame(s => {
    const amount = Number(document.querySelector("#auction-price").value); G.assert(amount > 0, "The winning bid must be at least $1.");
    G.buy(s, index, document.querySelector("#auction-player").value, amount);
  }));
}
function openPayment() {
  showDialog("Payment / physical card", `<p class="muted">Record card effects, fees, bonuses, or a payment between players. Bank payments are unlimited. For “pay each player,” choose everyone else. Multiple bills are resolved in table order.</p>
    <label class="field"><span>Payer</span><select id="payment-from">${playerOptions(currentPlayer().id, true).replace('<option value="pot">Free Parking pot</option>', "")}<option value="everyone">Everyone else</option></select></label>
    <label class="field"><span>Recipient</span><select id="payment-to">${playerOptions("bank", true)}<option value="everyone">Everyone else</option></select></label>
    ${amountField("Amount (per player for everyone)", "payment-amount", 0)}<label class="field"><span>Reason</span><input id="payment-reason" maxlength="120" value="Card payment" required></label><button class="button" type="submit">Record payment / bill</button>`, () => commitGame(s => {
      const from = document.querySelector("#payment-from").value, to = document.querySelector("#payment-to").value;
      const amount = Number(document.querySelector("#payment-amount").value), reason = document.querySelector("#payment-reason").value.trim();
      G.assert(amount > 0 && reason, "Enter an amount greater than zero and a reason.");
      G.assert(from !== to && !(from === "everyone" && ["bank", "pot"].includes(to)) && !(to === "everyone" && from === "bank"), "For everyone payments, select an individual player on the other side.");
      const pairs = from === "everyone" ? G.active(s).filter(p => p.id !== to).map(p => [p.id, to]) : to === "everyone" ? G.active(s).filter(p => p.id !== from).map(p => [from, p.id]) : [[from, to]];
      for (const [a, b] of pairs) {
        if (a === "bank" || s.moneyMode === "helper" || G.player(s, a).cash >= amount) G.transfer(s, a, b, amount, reason);
        else G.owe(s, a, b, amount, reason);
      }
    }));
}
async function imageToken(file) {
  if (!file) return null;
  G.assert(["image/jpeg", "image/png", "image/webp", "image/gif"].includes(file.type) && file.size <= 10000000, "Choose a JPG, PNG, WebP, or GIF image under 10 MB.");
  const url = URL.createObjectURL(file);
  try {
    const img = new Image(); img.src = url; await img.decode();
    const canvas = document.createElement("canvas"); canvas.width = canvas.height = 128;
    const ctx = canvas.getContext("2d"); ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, 128, 128);
    const scale = Math.min(128 / img.width, 128 / img.height);
    ctx.drawImage(img, (128 - img.width * scale) / 2, (128 - img.height * scale) / 2, img.width * scale, img.height * scale);
    return canvas.toDataURL("image/jpeg", .8);
  } finally { URL.revokeObjectURL(url); }
}
function openPlayer(id) {
  const p = state.players.find(p => p.id === id);
  showDialog(`${p.name} · token & details`, `<div class="token-preview">${tokenMarkup(p)}</div><label class="field"><span>Name</span><input id="player-name" maxlength="24" value="${escapeHTML(p.name)}" required></label>
    <label class="field"><span>Token</span><select id="player-token"><option value="keep">Keep current token</option>${TOKEN_CHOICES.map(t => `<option>${t}</option>`).join("")}<option value="">Initials</option></select></label>
    <label class="field"><span>Or upload a picture of your token</span><input id="player-image" type="file" accept="image/jpeg,image/png,image/webp,image/gif"></label><p class="muted small">A dog, horse, LEGO piece, or anything you use at the table. Pictures stay in this browser and in exported game files.</p><button class="button" type="submit">Save player</button>
    ${!p.bankrupt ? `<div class="button-stack edition-details">${button("Correct position", "position", id)}${button("Review bankruptcy", "bankruptcy", id)}</div>` : '<p>This player is out of the game.</p>'}`, async () => {
      const name = document.querySelector("#player-name").value.trim(), chosen = document.querySelector("#player-token").value;
      const image = await imageToken(document.querySelector("#player-image").files[0]);
      return commitGame(s => {
        G.assert(name && !s.players.some(q => q.id !== id && q.name.toLowerCase() === name.toLowerCase()), "Give each player a different name.");
        const q = s.players.find(q => q.id === id); q.name = name; q.token = image || (chosen === "keep" ? q.token : chosen);
        G.log(s, `Updated player: ${name}.`);
      });
    });
}
function openBankruptcy(id) {
  const p = G.player(state, id), debt = state.debts.find(d => d.from === id);
  if (state.moneyMode === "banker" && !debt) { alert("Zero cash is not bankruptcy. Record the bill the player cannot pay first."); return; }
  const creditor = debt ? debt.to === "pot" ? "bank" : debt.to : "bank";
  const assets = state.spaces.filter(q => q.owner === id);
  const sale = assets.reduce((n, q) => n + q.buildingCosts.reduce((total, cost) => total + Math.floor(cost / 2), 0), 0);
  showDialog(`Review bankruptcy · ${p.name}`, `<p>Bankruptcy ends this player’s participation. First try selling buildings, mortgaging, or trading to pay the bill.</p>
    <label class="field"><span>Who is owed?</span><select id="bankrupt-creditor" ${debt ? "disabled" : ""}><option value="bank">Bank</option>${G.active(state).filter(q => q.id !== id).map(q => `<option value="${q.id}" ${q.id === creditor ? "selected" : ""}>${escapeHTML(q.name)}</option>`).join("")}</select></label>
    <p>${assets.length} properties: ${assets.map(q => escapeHTML(q.name)).join(", ") || "none"}.</p><p>Buildings return to the bank (${money(sale)} sale value). A player creditor receives the properties and remaining cash; bank bankruptcy queues the properties for auction.</p>
    <label class="check-card"><input id="bankrupt-lift" type="checkbox"><span>Player creditor will immediately unmortgage inherited properties (principal + 10%). Otherwise 10% is due now.</span></label>
    <p class="muted small">Give physical Get Out of Jail Free cards to the player creditor, or return them to their decks if the bank is owed. This action can be undone.</p><button class="button danger" type="submit">Declare bankruptcy</button>`, () => commitGame(s => G.bankrupt(s, id, document.querySelector("#bankrupt-creditor").value, document.querySelector("#bankrupt-lift").checked ? assets.map(q => q.index) : [])));
}
function openSettings() {
  menuDialog.close();
  showDialog("Money mode & edition settings", `<p class="muted">Defaults match modern US deed values. Confirm your physical board’s amounts. When switching from physical money, enter every player’s actual cash below.</p><label class="field"><span>Money handling</span><select id="money-mode"><option value="helper" ${state.moneyMode === "helper" ? "selected" : ""}>Helper · physical money</option><option value="banker" ${state.moneyMode === "banker" ? "selected" : ""}>Banker · digital balances</option></select></label>
    ${Object.entries({ go: "GO salary", incomeTax: "Income tax (fixed amount)", luxuryTax: "Luxury tax", jail: "Jail fine" }).map(([k, v]) => amountField(v, `setting-${k}`, state.rules[k])).join("")}
    <label class="field"><span>Free Parking</span><select id="setting-parking">${[["official", "Official: no payment"], ["pot", "House rule: collect taxes / fines pot"], ["50", "House rule: $50"], ["100", "House rule: $100"], ["500", "House rule: $500"]].map(([v, label]) => `<option value="${v}" ${v === state.freeParkingRule ? "selected" : ""}>${label}</option>`).join("")}</select></label>${amountField("Free Parking pot balance", "setting-pot", state.freeParkingPot)}
    <details open><summary>Actual player balances / correction</summary>${G.active(state).map(p => amountField(p.name, `balance-${p.id}`, p.cash)).join("")}</details><p class="muted small">Property prices, mortgages, and rent schedules are editable under each property’s Details / settings. For percentage taxes or special card amounts, adjust the bill when resolving the space.</p><button class="button" type="submit">Save settings and balances</button>`, () => commitGame(s => {
      G.assert(!s.debts.length && !s.auctions.length, "Resolve bills and auctions before changing money settings.");
      const mode = document.querySelector("#money-mode").value;
      G.assert(s.moneyMode === mode || s.phase === "ready" && !s.roll, "Finish the current turn before switching money modes so a stop is not paid twice.");
      if (s.moneyMode !== mode) { s.bankLandingResolved = false; G.log(s, `Switched to ${mode} mode; balances entered from physical money.`); }
      s.moneyMode = mode;
      ["go", "incomeTax", "luxuryTax", "jail"].forEach(k => { s.rules[k] = Number(document.querySelector(`#setting-${k}`).value); });
      s.freeParkingRule = document.querySelector("#setting-parking").value; s.freeParkingPot = Number(document.querySelector("#setting-pot").value);
      G.active(s).forEach(p => { const amount = Number(document.querySelector(`#balance-${p.id}`).value); if (amount !== p.cash) G.log(s, `Cash correction for ${p.name}: $${p.cash} → $${amount}.`); p.cash = amount; });
      G.log(s, "Edition settings / cash balances updated.");
    }));
}
function bindActions(root) {
  root.querySelectorAll("[data-action]").forEach(el => el.onclick = () => {
    const action = el.dataset.action, value = el.dataset.value, index = Number(value), dialog = document.querySelector("#companion-dialog");
    if (action === "properties") return openProperties(value || currentPlayer().id);
    if (action === "property") return openProperty(index);
    if (action === "payment") return openPayment();
    if (action === "auction") return openAuction(index);
    if (action === "bankruptcy") return openBankruptcy(value);
    if (action === "trade") return openTradeDialog();
    if (action === "position") { dialog.close(); return openPositionDialog(value); }
    if (action === "card-move") return openPositionDialog(currentPlayer().id, state.phase === "classic-first-stop" ? "card-classic" : "card-normal");
    if (action === "settle") return settleBill();
    if (action === "correct-debt") return openDebtCorrection();
    if (action === "waive-landing") return openLandingWaiver();
    if (action === "history") return showDialog("Game history", `<p class="muted small">Latest 150 money and management actions. Undo restores the most recent saved action, including its board state. Up to ten actions can be undone.</p><ol class="ledger">${state.ledger.map(e => `<li><p>${escapeHTML(e.message)}</p><time>${escapeHTML(new Date(e.time).toLocaleString())}</time></li>`).join("") || "<li>No transactions yet.</li>"}</ol>`);
    if (action === "undo") {
      if (!undoState) return;
      try { const restored = migrateState(snapshotState(undoState)); state = restored; undoStack.shift(); undoState = undoStack[0] || null; saveState(true); render(); } catch (error) { alert(error.message); }
      return;
    }
    if (["build", "sell", "mortgage", "sell-group"].includes(action)) {
      const owner = state.spaces[index].owner;
      if (commitGame(s => action === "mortgage" ? G.mortgage(s, index) : action === "sell-group" ? G.sellGroup(s, index) : G.build(s, index, action === "build" ? 1 : -1))) openProperties(owner);
      return;
    }
    if (action === "building-auction") return showDialog("Building auction", `<p>Use this when players compete for the bank’s remaining houses or hotels. Record the winning bid for one building on ${escapeHTML(state.spaces[index].name)}. Normal building and stock rules still apply.</p>${amountField("Winning bid", "building-bid", state.spaces[index].buildCost)}<button class="button" type="submit">Record building purchase</button>`, () => commitGame(s => G.build(s, index, 1, Number(document.querySelector("#building-bid").value))));
    if (action === "buy") return buyCurrent();
    if (action === "resolve") return commitGame(markResolved);
    if (action === "leave" || action === "auction-skip") {
      if (!confirm("Use the house rule to leave this property unowned?")) return;
      if (commitGame(s => { if (action === "leave" || s.players[s.currentPlayer].position === index) markResolved(s); s.auctions = s.auctions.filter(i => i !== index); G.log(s, `House rule: left ${s.spaces[action === "leave" ? currentSpace().index : index].name} unowned.`); })) dialog.close();
      return;
    }
    if (action === "landing-pay") return commitGame(s => {
      G.assert(!s.bankLandingResolved && !s.debts.length, "This stop already has a payment recorded.");
      const amount = readAmount("landing-payment"), bill = s.landingBill;
      G.assert(bill, "No landing payment is pending.");
      if (amount !== bill.amount) G.log(s, `Landing amount adjusted: ${bill.reason}, $${bill.amount} → $${amount}.`);
      if (s.players[s.currentPlayer].cash >= amount) { G.transfer(s, bill.from, bill.to, amount, bill.reason); markResolved(s); }
      else G.owe(s, bill.from, bill.to, amount, bill.reason, { kind: "landing" });
    });
    if (action === "parking") return commitGame(s => { if (s.bankLandingResolved) return; const amount = s.freeParkingRule === "pot" ? s.freeParkingPot : Number(s.freeParkingRule); G.transfer(s, "bank", currentPlayer().id, amount, "Free Parking house rule"); if (s.freeParkingRule === "pot") s.freeParkingPot = 0; markResolved(s); });
  });
}
function bindCompanionEvents() {
  bindActions(app);
  app.querySelectorAll(".edit-player").forEach(b => b.onclick = () => openPlayer(b.dataset.player));
  if (bankLandingPending()) {
    const end = document.querySelector("#end-turn-button"), finder = document.querySelector("#continue-finder");
    if (end) { end.disabled = true; end.textContent = "Resolve this stop to continue"; }
    if (finder) finder.disabled = true;
  }
  document.querySelector("#bank-settings").disabled = Boolean(state.winnerId);
  if (state.winnerId) {
    app.querySelectorAll("button").forEach(b => { if (!["undo", "history"].includes(b.dataset.action)) b.disabled = true; });
    app.querySelectorAll("input, select").forEach(input => input.disabled = true);
  }
}
function initializeCompanion() {
  document.querySelector("#bank-settings").onclick = openSettings;
  document.querySelectorAll("#trade-cash-a, #trade-cash-b").forEach(input => input.oninput = updateTradeSummary);
}
