/* Market Shift — simulation engine (no DOM). Works in the browser and in Node. */
(function (root) {
  'use strict';

  const ROUNDS = 6;
  const TEAM_COUNT = 8;
  const PLAYER_ID = 3;
  const CAP = 60000;            // max chips per team per market once fully established
  const RAMP = [0.5, 0.8, 1.0]; // share of CAP in the 1st, 2nd and 3rd+ consecutive round in a market
  const UNIT_COST = 20;         // base $ per chip produced (cost shocks move it)
  const DEV_COST = 0.30e6;      // fixed development cost per round
  const REPORT_COST = 0.05e6;
  const PENALTY_BASE = 0.20e6;  // switching market: base cost…
  const PENALTY_STEP = 0.10e6;  // …plus this per round you were established in the old market
  const LOYALTY_STEP = 0.06;    // customer appeal per consecutive round already spent in a market
  const MAX_STREAK = 4;
  const OUTSIDE = 1.2;          // customers' "outside option" (incumbent suppliers, not buying)
  const UPGRADE_STEP = 0.20;    // appeal per research level, stacks while you stay
  const RESEARCH_ROUNDS = [1, 3, 5];
  const DEMAND_NOISE = 0.08;    // realised demand is ±8% around the forecast
  const INCIDENT_CHANCE = 0.25;
  const OVERPRICE = 2.5;        // extra elasticity per 100% above the reference price
  const AI_PRICE_STEPS = [0.9, 1.0, 1.1, 1.2, 1.3];

  // trend: demand change per round; vol: random drift per round; entryMk: how much marketing helps a newcomer.
  const MARKETS = [
    { id: 'EV',   code: 'EV',   name: 'EV Manufacturers',   sub: 'Vehicle battery systems',    tag: 'Mature rivalry',
      demand: 105000, ref: 55, e: 1.3, trend: 0.00, vol: 0.10, entryMk: 0.9,
      rewards: 'Big and steady, but volatile. Rewards a sharp price.' },
    { id: 'ESS',  code: 'ESS',  name: 'Stationary Storage', sub: 'Grid and backup storage',    tag: 'Slow builder',
      demand: 85000,  ref: 54, e: 1.2, trend: 0.06, vol: 0.05, entryMk: 0.9,
      rewards: 'Grows every round. Rewards getting in early and staying.' },
    { id: 'PC',   code: 'PC',   name: 'Computers',          sub: 'Consumer and enterprise',    tag: 'Volume, thin margin',
      demand: 150000, ref: 42, e: 1.8, trend: -0.02, vol: 0.06, entryMk: 0.9,
      rewards: 'Huge volume, very price driven. Rewards big runs at low prices.' },
    { id: 'UAV',  code: 'UAV',  name: 'Drones',             sub: 'Commercial and industrial',  tag: 'Growing niche',
      demand: 56000,  ref: 72, e: 0.8, trend: 0.07, vol: 0.08, entryMk: 0.9,
      rewards: 'Small but fast-growing. Premium prices for a good fit.' },
    { id: 'GRID', code: 'GRID', name: 'Power Plants',       sub: 'Energy generation systems',  tag: 'Hard to enter',
      demand: 50000,  ref: 82, e: 0.6, trend: 0.00, vol: 0.04, entryMk: 0.45,
      rewards: 'Small, loyal buyers. Marketing barely helps newcomers.' },
    { id: 'DC',   code: 'DC',   name: 'Data Centers',       sub: 'High-density compute sites', tag: 'Hot, crowded',
      demand: 112000, ref: 52, e: 1.5, trend: -0.03, vol: 0.06, entryMk: 0.9,
      rewards: 'Big now but cooling off, and rivals love it. Watch the crowd.' },
  ];

  const CHIPS = [
    { id: 'BM', name: 'Battery Management', group: 'Energy storage', sub: 'Monitor and protect battery systems',
      caps: ['Cell monitoring', 'Charge balancing', 'Safety controls'],
      fit: { EV: 1.0, ESS: 1.0, PC: 0.4, UAV: 0.6, GRID: 0.6, DC: 0.5 } },
    { id: 'PM', name: 'Power Management', group: 'Energy storage', sub: 'Control and distribute electrical power',
      caps: ['Power conversion', 'Voltage regulation', 'Energy efficiency'],
      fit: { EV: 0.5, ESS: 0.6, PC: 1.0, UAV: 0.4, GRID: 1.0, DC: 1.0 } },
    { id: 'MC', name: 'Motor Control', group: 'Motion systems', sub: 'Manage speed and motion precision',
      caps: ['Drive control', 'Speed response', 'Precision control'],
      fit: { EV: 0.85, ESS: 0.3, PC: 0.3, UAV: 1.0, GRID: 0.4, DC: 0.3 } },
  ];

  // fx keys are market ids or ALL. duration > 1 makes a multi-round trend. cost moves the per-chip production cost.
  // minor events are rolled as an optional second event on top of the round's major one.
  const EVENTS = [
    { id: 'ai',      title: 'AI compute boom',            text: 'Hyperscalers race to build capacity.',             duration: 3, fx: { DC: { demand: 1.3 } } },
    { id: 'evcut',   title: 'EV subsidy cut',             text: 'Car buyers hesitate; makers squeeze suppliers.',    fx: { EV: { demand: 0.75, e: 1.2 } } },
    { id: 'drone',   title: 'Drone delivery approved',    text: 'Regulators open the skies to commercial fleets.',   duration: 2, fx: { UAV: { demand: 1.4 } } },
    { id: 'tender',  title: 'Grid modernisation tender',  text: 'Utilities fund a wave of new power plants.',        fx: { GRID: { demand: 1.5, ref: 1.05 } } },
    { id: 'pcslump', title: 'PC sales slump',             text: 'Consumers delay upgrades.',                         fx: { PC: { demand: 0.7, e: 1.15 } } },
    { id: 'heat',    title: 'Heatwave blackouts',         text: 'Homes and businesses rush to buy backup storage.',  fx: { ESS: { demand: 1.4 } } },
    { id: 'short',   title: 'Global chip shortage',       text: 'Buyers accept higher prices everywhere.',           fx: { ALL: { ref: 1.1 } } },
    { id: 'abroad',  title: 'Low-cost rivals from abroad', text: 'Computer and car makers become more price-driven.', duration: 2, fx: { PC: { e: 1.25, ref: 0.92 }, EV: { ref: 0.95 } } },
    { id: 'dccap',   title: 'Data center power caps',     text: 'New efficiency rules slow data-center growth.',     duration: 2, fx: { DC: { demand: 0.75 } } },
    { id: 'evsurge', title: 'EV demand surge',            text: 'A new affordable model sells out instantly.',       fx: { EV: { demand: 1.35 } } },
    { id: 'mandate', title: 'Utility battery mandate',    text: 'New rules require storage on every solar farm.',    duration: 3, fx: { ESS: { demand: 1.25 } } },
    { id: 'ban',     title: 'Drone airspace restrictions', text: 'A near-miss near an airport freezes new permits.',  fx: { UAV: { demand: 0.7 } } },
    { id: 'rates',   title: 'Interest rate hike',         text: 'Every customer trims their budget.',                fx: { ALL: { demand: 0.9 } } },
    { id: 'school',  title: 'Back-to-school rush',        text: 'Laptop orders spike for the season.',               fx: { PC: { demand: 1.3 } } },
    { id: 'outage',  title: 'Major power plant outage',   text: 'Operators replace ageing control systems fast.',    fx: { GRID: { demand: 1.3 } } },
    { id: 'lith',    title: 'Lithium price spike',        text: 'Production costs +$4 per chip this round.',         minor: true, cost: 4, fx: {} },
    { id: 'glut',    title: 'Fab overcapacity',           text: 'Foundries cut prices: production −$3 per chip.',    minor: true, cost: -3, fx: {} },
    { id: 'energy',  title: 'Energy price surge',         text: 'Production costs +$3 per chip for 2 rounds.',       minor: true, cost: 3, duration: 2, fx: {} },
    { id: 'ship',    title: 'Shipping disruption',        text: 'Costs +$2 per chip and some orders slip.',          minor: true, cost: 2, fx: { ALL: { demand: 0.95 } } },
  ];

  // Random things that happen to a single team during a round.
  const INCIDENTS = [
    { id: 'supply',   title: 'Supplier delay',     text: 'A late component batch made 20% of your production run unsellable.' },
    { id: 'viral',    title: 'Viral review',       text: 'A glowing review made your chips 15% more attractive this round.' },
    { id: 'factory',  title: 'Factory incident',   text: 'Repairs after a small fire cost an extra $0.10M.' },
    { id: 'customer', title: 'Key customer win',   text: 'A large customer placed an extra order of 5,000 chips.' },
  ];

  const PERSONALITIES = [
    { id: 'cutter',   label: 'Price cutter',  price: 0.85, mk: 0.08, noise: 0.20, sticky: 1.0 },
    { id: 'premium',  label: 'Premium',       price: 1.15, mk: 0.25, noise: 0.20, sticky: 1.0 },
    { id: 'follower', label: 'Follower',      price: 1.00, mk: 0.15, noise: 0.15, sticky: 1.2 },
    { id: 'explorer', label: 'Explorer',      price: 0.95, mk: 0.20, noise: 0.40, sticky: 0.5 },
  ];

  // --- seeded RNG ---
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const range = (rng, lo, hi) => lo + (hi - lo) * rng();
  function shuffle(rng, arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
    return a;
  }

  const marketById = id => MARKETS.find(m => m.id === id);
  const chipById = id => CHIPS.find(c => c.id === id);
  const bestChipFor = marketId => CHIPS.reduce((b, c) => (c.fit[marketId] > b.fit[marketId] ? c : b));

  // --- commitment rules ---
  // Rounds already spent in this market (0 if the team would be entering it fresh).
  const streakIn = (team, marketId) => (team.market === marketId ? team.streak : 0);
  const loyaltyFor = streak => 1 + LOYALTY_STEP * Math.min(streak, MAX_STREAK);
  const capFor = (team, marketId) => Math.round(CAP * RAMP[Math.min(streakIn(team, marketId), RAMP.length - 1)]);
  const switchPenalty = (team, marketId) =>
    team.market && team.market !== marketId ? PENALTY_BASE + PENALTY_STEP * Math.min(team.streak, MAX_STREAK) : 0;

  // --- game setup ---
  function createGame(seed) {
    seed = seed == null ? Math.floor(Math.random() * 1e9) : seed;
    const rng = mulberry32(seed);

    // Pre-generate events and conditions for every round so "market growth" reports are truthful.
    const majors = shuffle(rng, EVENTS.filter(e => !e.minor));
    const minors = shuffle(rng, EVENTS.filter(e => e.minor));
    const scheduled = [];
    for (let r = 1; r < ROUNDS; r++) {
      [majors.pop()].concat(minors.length && rng() < 0.4 ? [minors.pop()] : []).forEach(ev =>
        scheduled.push({ ev, start: r, end: Math.min(ROUNDS - 1, r + (ev.duration || 1) - 1) }));
    }
    const events = [];
    for (let r = 0; r < ROUNDS; r++) {
      events.push(scheduled.filter(s => s.start <= r && s.end >= r)
        .map(s => Object.assign({}, s.ev, { isNew: s.start === r, roundsLeft: s.end - r + 1 })));
    }

    const conditions = [], unitCost = [];
    const base = {}; MARKETS.forEach(m => (base[m.id] = m.demand));
    for (let r = 0; r < ROUNDS; r++) {
      const round = {};
      MARKETS.forEach(m => {
        if (r > 0) base[m.id] *= (1 + m.trend) * (1 + range(rng, -m.vol, m.vol));
        const mul = { demand: 1, ref: 1, e: 1 };
        const titles = [];
        events[r].forEach(ev => {
          const fx = ev.fx[m.id] || ev.fx.ALL;
          if (!fx) return;
          Object.keys(mul).forEach(k => (mul[k] *= fx[k] || 1));
          titles.push(ev.title);
        });
        round[m.id] = {
          baseDemand: base[m.id],
          demand: Math.round(base[m.id] * mul.demand),
          ref: +(m.ref * mul.ref).toFixed(2),
          e: +(m.e * mul.e).toFixed(2),
          entryMk: m.entryMk,
          events: titles,
        };
      });
      conditions.push(round);
      unitCost.push(UNIT_COST + events[r].reduce((s, ev) => s + (ev.cost || 0), 0));
    }

    const personalities = shuffle(rng, PERSONALITIES.concat(PERSONALITIES));
    const teams = [];
    for (let id = 1; id <= TEAM_COUNT; id++) {
      const isPlayer = id === PLAYER_ID;
      teams.push({
        id, isPlayer,
        name: isPlayer ? 'You (Team ' + id + ')' : 'Team ' + id,
        persona: isPlayer ? null : personalities.pop(),
        market: null, chip: null, upgrade: null, streak: 0,
        profit: 0, rounds: [],
      });
    }

    const state = { seed, rng, round: 1, conditions, unitCost, events, teams, history: [], plans: null, signals: null, over: false };
    beginRound(state);
    return state;
  }

  // --- demand model ---
  // streak: rounds the team has already spent in this market (0 = entering).
  function score(cond, price, fit, marketing, streak) {
    const ratio = price / cond.ref;
    // Elasticity escalates when you price far above the market reference.
    const eEff = cond.e + OVERPRICE * Math.max(0, ratio - 1);
    const priceFactor = Math.pow(1 / ratio, eEff);
    const mkCoef = streak > 0 ? 0.45 : cond.entryMk; // marketing matters more when entering a market
    const mkFactor = 1 + mkCoef * Math.sqrt(marketing / 1e6);
    return fit * priceFactor * mkFactor * loyaltyFor(streak);
  }

  function upgradeLevel(team, chipId, marketId) {
    const u = team.upgrade;
    return u && u.market === marketId && u.chip === chipId ? u.level : 0;
  }

  function fitFor(team, chipId, marketId) {
    return chipById(chipId).fit[marketId] * (1 + UPGRADE_STEP * upgradeLevel(team, chipId, marketId));
  }

  // --- AI planning, done at the start of a round (independent of the player's choice) ---
  function beginRound(state) {
    const { rng } = state;
    const r = state.round;
    const cond = state.conditions[r - 1];
    const cost = state.unitCost[r - 1];
    const counts = {}; MARKETS.forEach(m => (counts[m.id] = 0));
    const plans = {};

    shuffle(rng, state.teams.filter(t => !t.isPlayer)).forEach(t => {
      const p = t.persona;
      let best = null;
      MARKETS.forEach(m => {
        const c = cond[m.id];
        const chip = bestChipFor(m.id);
        const streak = streakIn(t, m.id);
        const n = counts[m.id] + 1.5; // assume roughly one more rival (incl. the player) shows up
        // Pick the most profitable price around the persona's usual pricing.
        let price = 0, ev = -Infinity;
        AI_PRICE_STEPS.forEach(k => {
          const pr = c.ref * p.price * k;
          const s = score(c, pr, fitFor(t, chip.id, m.id), p.mk * 1e6, streak);
          // Judge markets on long-run capacity: the entry ramp-up is a temporary cost, not a reason to avoid a market.
          const sales = Math.min(CAP, (c.demand * s) / (s * n + OUTSIDE));
          const v = sales * (pr - cost) - DEV_COST - p.mk * 1e6;
          if (v > ev) { ev = v; price = pr; }
        });
        ev *= 1 + (rng() * 2 - 1) * p.noise;
        // Leaving also throws away research and next round's loyalty and capacity.
        if (t.market && t.market !== m.id) ev -= (switchPenalty(t, m.id) + (t.upgrade ? 0.3e6 * t.upgrade.level : 0) + 0.2e6) * p.sticky;
        if (!best || ev > best.ev) best = { market: m.id, chip: chip.id, price, ev };
      });
      counts[best.market]++;
      plans[t.id] = best;
    });

    // Finalise prices, marketing and production with knowledge of how crowded each market is.
    state.teams.filter(t => !t.isPlayer).forEach(t => {
      const pl = plans[t.id];
      const c = cond[pl.market];
      pl.price = Math.round(pl.price * range(rng, 0.95, 1.05));
      pl.marketing = Math.round((t.persona.mk * range(rng, 0.7, 1.3)) * 100) / 100 * 1e6;
      const s = score(c, pl.price, fitFor(t, pl.chip, pl.market), pl.marketing, streakIn(t, pl.market));
      const est = (c.demand * s) / (s * (counts[pl.market] + 0.5) + OUTSIDE);
      pl.prediction = Math.min(capFor(t, pl.market), Math.round((est * range(rng, 0.9, 1.2)) / 1000) * 1000);
      pl.upgrade = RESEARCH_ROUNDS.includes(r);
    });

    // Free board signals (noisy).
    const level = (v, hi, med) => (v >= hi ? 2 : v >= med ? 1 : 0);
    const jitter = l => { const x = rng(); return Math.max(0, Math.min(2, l + (x < 0.15 ? -1 : x > 0.85 ? 1 : 0))); };
    const signals = {};
    MARKETS.forEach(m => {
      const c = cond[m.id];
      signals[m.id] = {
        demand: level(c.demand * range(rng, 0.88, 1.12), 110000, 65000),
        pressure: jitter(level(c.e, 1.6, 1.0)),
        rivals: jitter(level(counts[m.id], 3, 2)),
      };
    });

    state.plans = plans;
    state.counts = counts;
    state.signals = signals;
  }

  function lastAvgPrice(state, marketId) {
    const last = state.history[state.history.length - 1];
    if (!last) return null;
    const rows = last.results.filter(x => x.market === marketId);
    if (!rows.length) return null;
    return Math.round(rows.reduce((s, x) => s + x.price, 0) / rows.length);
  }

  function report(state, type, marketId) {
    const r = state.round;
    const c = state.conditions[r - 1][marketId];
    const m = marketById(marketId);
    if (type === 'rivals') {
      return {
        title: 'Rival targets',
        counts: Object.assign({}, state.counts),
        headline: state.counts[marketId] + ' of ' + (TEAM_COUNT - 1) + ' rival teams are targeting ' + m.name + ' this round.',
        limitation: 'Shows targets only, not their prices.',
      };
    }
    if (type === 'price') {
      const lbl = c.e >= 1.6 ? 'HIGH' : c.e >= 1.0 ? 'MEDIUM' : 'LOW';
      const avg = lastAvgPrice(state, marketId);
      return {
        title: 'Price sensitivity',
        headline: m.name + ' customers have ' + lbl + ' price sensitivity: a 10% price rise loses about ' +
          Math.round((1 - Math.pow(1 / 1.1, c.e * 1.1)) * 100) + '% of your buyers.',
        detail: 'Reference price customers expect: $' + c.ref.toFixed(0) + (avg ? '  •  rivals averaged $' + avg + ' last round' : ''),
        limitation: 'Does not reveal what rivals will charge this round.',
      };
    }
    // growth
    const now = 'Total demand this round ≈ ' + fmtUnits(c.demand) + ' chips.';
    if (r < ROUNDS) {
      const next = state.conditions[r][marketId];
      const pct = Math.round((next.demand / c.demand - 1) * 100);
      return {
        title: 'Market growth',
        headline: now + ' Next round: ≈ ' + (pct >= 0 ? '+' : '') + pct + '%  (' + fmtUnits(next.demand) + ' chips).',
        detail: (next.events.length ? 'Drivers: ' + next.events.join(', ') + '.' : 'No major shock expected.') + '  Long-run trend: ' + trendLabel(m) + '.',
        limitation: 'Covers your selected market only. Real demand can still land about ±8% off.',
      };
    }
    return {
      title: 'Market growth',
      headline: 'Final round. ' + now,
      limitation: 'Covers your selected market only. Real demand can still land about ±8% off.',
    };
  }

  function trendLabel(m) {
    return m.trend >= 0.05 ? 'growing' : m.trend <= -0.02 ? 'shrinking' : 'flat';
  }

  function fmtUnits(n) { return Math.round(n).toLocaleString('en-US'); }

  // decision: { market, chip, upgrade:boolean, price, marketing ($), prediction (chips), report: type|null }
  function resolveRound(state, decision) {
    const { rng } = state;
    const r = state.round;
    const cond = state.conditions[r - 1];
    const cost = state.unitCost[r - 1];
    const decisions = {};

    state.teams.forEach(t => {
      const d = t.isPlayer ? decision : state.plans[t.id];
      const streak = streakIn(t, d.market);
      const penalty = switchPenalty(t, d.market);
      const cap = capFor(t, d.market);
      // Switching market or chip family invalidates an old upgrade; staying lets research stack.
      let lostUpgrade = 0;
      if (t.upgrade && (t.upgrade.market !== d.market || t.upgrade.chip !== d.chip)) { lostUpgrade = t.upgrade.level; t.upgrade = null; }
      if (d.upgrade && RESEARCH_ROUNDS.includes(r)) {
        t.upgrade = { market: d.market, chip: d.chip, level: (t.upgrade ? t.upgrade.level : 0) + 1, round: r };
      }
      const incident = rng() < INCIDENT_CHANCE ? INCIDENTS[Math.floor(rng() * INCIDENTS.length)] : null;
      decisions[t.id] = {
        team: t, d, streak, penalty, cap, lostUpgrade, incident,
        switched: penalty > 0,
        fit: fitFor(t, d.chip, d.market),
      };
    });

    MARKETS.forEach(m => {
      const c = cond[m.id];
      const actual = c.demand * range(rng, 1 - DEMAND_NOISE, 1 + DEMAND_NOISE);
      const here = Object.values(decisions).filter(x => x.d.market === m.id);
      here.forEach(x => (x.s = score(c, x.d.price, x.fit, x.d.marketing, x.streak) * (x.incident && x.incident.id === 'viral' ? 1.15 : 1)));
      const total = here.reduce((s, x) => s + x.s, 0) + OUTSIDE;
      here.forEach(x => (x.demand = (actual * x.s) / total + (x.incident && x.incident.id === 'customer' ? 5000 : 0)));
    });

    const results = state.teams.map(t => {
      const x = decisions[t.id];
      const d = x.d;
      const inc = x.incident && x.incident.id;
      const production = Math.min(x.cap, Math.max(0, Math.round(d.prediction)));
      const sellable = inc === 'supply' ? Math.round(production * 0.8) : production;
      const sold = Math.round(Math.min(x.demand, x.cap, sellable));
      const revenue = sold * d.price;
      const costs = {
        production: production * cost,
        development: DEV_COST,
        marketing: d.marketing,
        report: d.report ? REPORT_COST : 0,
        penalty: x.penalty,
        incident: inc === 'factory' ? 0.1e6 : 0,
      };
      const totalCost = Object.values(costs).reduce((a, b) => a + b, 0);
      const profit = revenue - totalCost;
      t.streak = x.streak + 1;
      const row = {
        team: t.id, name: t.name, isPlayer: t.isPlayer, persona: t.persona && t.persona.label,
        market: d.market, chip: d.chip, price: d.price, marketing: d.marketing,
        prediction: production, demand: Math.round(x.demand), sold, revenue, costs, totalCost, profit,
        switched: x.switched, lostUpgrade: x.lostUpgrade,
        upgraded: upgradeLevel(t, d.chip, d.market), // research level that applied this round
        cap: x.cap, unitCost: cost, streak: t.streak, loyalty: loyaltyFor(x.streak),
        incident: x.incident,
        unmet: Math.max(0, Math.round(Math.min(x.demand, x.cap) - sellable)),
        unsold: Math.max(0, sellable - sold),
      };
      t.market = d.market; t.chip = d.chip;
      t.profit += profit;
      t.rounds.push(row);
      return row;
    });

    const entry = { round: r, events: state.events[r - 1], results };
    state.history.push(entry);
    if (r >= ROUNDS) state.over = true;
    else { state.round++; beginRound(state); }
    return entry;
  }

  function standings(state) {
    return state.teams.slice().sort((a, b) => b.profit - a.profit)
      .map((t, i) => ({ rank: i + 1, id: t.id, name: t.name, isPlayer: t.isPlayer, profit: t.profit, persona: t.persona && t.persona.label, rounds: t.rounds }));
  }

  const api = {
    ROUNDS, TEAM_COUNT, PLAYER_ID, CAP, RAMP, UNIT_COST, DEV_COST, REPORT_COST, PENALTY_BASE, PENALTY_STEP,
    LOYALTY_STEP, MAX_STREAK, RESEARCH_ROUNDS, UPGRADE_STEP, DEMAND_NOISE,
    MARKETS, CHIPS, EVENTS, INCIDENTS, marketById, chipById, bestChipFor,
    streakIn, loyaltyFor, capFor, switchPenalty, upgradeLevel, trendLabel,
    createGame, report, resolveRound, standings, lastAvgPrice,
    player: state => state.teams.find(t => t.isPlayer),
  };
  root.MSEngine = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
