/* Market Shift — simulation engine (no DOM). Works in the browser and in Node. */
(function (root) {
  'use strict';

  const ROUNDS = 4;
  const TEAM_COUNT = 8;
  const PLAYER_ID = 3;
  const CAP = 60000;            // max chips per team per market
  const UNIT_COST = 20;         // $ per chip produced
  const DEV_COST = 0.30e6;      // fixed development cost per round
  const REPORT_COST = 0.05e6;
  const SWITCH_PENALTY = 0.30e6;
  const OUTSIDE = 1.2;          // customers' "outside option" (incumbent suppliers, not buying)
  const UPGRADE_MULT = 1.35;
  const RESEARCH_ROUNDS = [1, 3];

  const MARKETS = [
    { id: 'EV',   code: 'EV',   name: 'EV Manufacturers',   sub: 'Vehicle battery systems',    tag: 'Mature rivalry',    demand: 140000, ref: 55, e: 1.3 },
    { id: 'ESS',  code: 'ESS',  name: 'Stationary Storage', sub: 'Grid and backup storage',    tag: 'Growing need',      demand: 115000, ref: 50, e: 1.1 },
    { id: 'PC',   code: 'PC',   name: 'Computers',          sub: 'Consumer and enterprise',    tag: 'Price sensitive',   demand: 110000, ref: 40, e: 2.1 },
    { id: 'UAV',  code: 'UAV',  name: 'Drones',             sub: 'Commercial and industrial',  tag: 'Niche segment',     demand: 65000,  ref: 68, e: 0.8 },
    { id: 'GRID', code: 'GRID', name: 'Power Plants',       sub: 'Energy generation systems',  tag: 'Long sales cycle',  demand: 45000,  ref: 80, e: 0.6 },
    { id: 'DC',   code: 'DC',   name: 'Data Centers',       sub: 'High-density compute sites', tag: 'High opportunity',  demand: 165000, ref: 55, e: 1.3 },
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

  const EVENTS = [
    { title: 'AI compute boom',            text: 'Hyperscalers race to build capacity.',          fx: { DC: { demand: 1.4 } } },
    { title: 'EV subsidy cut',             text: 'Car buyers hesitate; makers squeeze suppliers.', fx: { EV: { demand: 0.7, e: 1.25 } } },
    { title: 'Drone delivery approved',    text: 'Regulators open the skies to commercial fleets.', fx: { UAV: { demand: 1.6 } } },
    { title: 'Grid modernisation tender',  text: 'Utilities fund a wave of new power plants.',     fx: { GRID: { demand: 1.8, ref: 1.05 } } },
    { title: 'PC sales slump',             text: 'Consumers delay upgrades.',                     fx: { PC: { demand: 0.65, e: 1.15 } } },
    { title: 'Heatwave blackouts',         text: 'Homes and businesses rush to buy backup storage.', fx: { ESS: { demand: 1.45 } } },
    { title: 'Global chip shortage',       text: 'Buyers accept higher prices everywhere.',        fx: { EV: { ref: 1.12 }, ESS: { ref: 1.12 }, PC: { ref: 1.12 }, UAV: { ref: 1.12 }, GRID: { ref: 1.12 }, DC: { ref: 1.12 } } },
    { title: 'Low-cost rivals from abroad', text: 'Computer makers become even more price-driven.', fx: { PC: { e: 1.3, ref: 0.9 } } },
    { title: 'Data center power caps',     text: 'New efficiency rules slow data-center growth.',  fx: { DC: { demand: 0.75 } } },
    { title: 'EV demand surge',            text: 'A new affordable model sells out instantly.',    fx: { EV: { demand: 1.35 } } },
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

  // --- game setup ---
  function createGame(seed) {
    seed = seed == null ? Math.floor(Math.random() * 1e9) : seed;
    const rng = mulberry32(seed);

    // Pre-generate conditions for every round so "market growth" reports are truthful.
    const events = [null].concat(shuffle(rng, EVENTS).slice(0, ROUNDS - 1));
    const conditions = [];
    for (let r = 0; r < ROUNDS; r++) {
      const prev = conditions[r - 1];
      const ev = events[r];
      const round = {};
      MARKETS.forEach(m => {
        const base = prev ? prev[m.id] : { demand: m.demand, ref: m.ref, e: m.e };
        const drift = r === 0 ? 1 : range(rng, 0.92, 1.1);
        // Events are temporary shocks on top of the drifting base.
        const fx = (ev && ev.fx[m.id]) || {};
        round[m.id] = {
          baseDemand: base.baseDemand ? base.baseDemand * drift : m.demand,
          demand: 0, ref: m.ref, e: m.e,
          event: fx.demand || fx.ref || fx.e ? ev.title : null,
          fx,
        };
        const c = round[m.id];
        c.demand = Math.round(c.baseDemand * (fx.demand || 1));
        c.ref = +(m.ref * (fx.ref || 1)).toFixed(2);
        c.e = +(m.e * (fx.e || 1)).toFixed(2);
      });
      conditions.push(round);
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

    const state = { seed, rng, round: 1, conditions, events, teams, history: [], plans: null, signals: null, over: false };
    beginRound(state);
    return state;
  }

  // --- demand model ---
  function score(cond, price, fit, marketing, incumbent) {
    const ratio = price / cond.ref;
    // Elasticity escalates when you price far above the market reference.
    const eEff = cond.e * (1 + Math.max(0, ratio - 1));
    const priceFactor = Math.pow(1 / ratio, eEff);
    const mkCoef = incumbent ? 0.45 : 0.9;     // marketing matters more when entering a market
    const mkFactor = 1 + mkCoef * Math.sqrt(marketing / 1e6);
    const loyalty = incumbent ? 1.12 : 1;
    return fit * priceFactor * mkFactor * loyalty;
  }

  function fitFor(team, chipId, marketId) {
    let f = chipById(chipId).fit[marketId];
    if (team.upgrade && team.upgrade.market === marketId && team.upgrade.chip === chipId) f *= UPGRADE_MULT;
    return f;
  }

  // --- AI planning, done at the start of a round (independent of the player's choice) ---
  function beginRound(state) {
    const { rng } = state;
    const r = state.round;
    const cond = state.conditions[r - 1];
    const counts = {}; MARKETS.forEach(m => (counts[m.id] = 0));
    const plans = {};

    shuffle(rng, state.teams.filter(t => !t.isPlayer)).forEach(t => {
      const p = t.persona;
      let best = null;
      MARKETS.forEach(m => {
        const c = cond[m.id];
        const chip = bestChipFor(m.id);
        const n = counts[m.id] + 1.5; // assume roughly one more rival (incl. the player) shows up
        const price = c.ref * p.price;
        const s = score(c, price, chip.fit[m.id], p.mk * 1e6, t.market === m.id);
        const sales = Math.min(CAP, (c.demand * s) / (s * n + OUTSIDE));
        let ev = sales * (price - UNIT_COST) - DEV_COST - p.mk * 1e6;
        ev *= 1 + (rng() * 2 - 1) * p.noise;
        if (t.market && t.market !== m.id) ev -= (SWITCH_PENALTY + (t.upgrade ? 0.4e6 : 0)) * p.sticky;
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
      const s = score(c, pl.price, chipById(pl.chip).fit[pl.market], pl.marketing, t.market === pl.market);
      const est = (c.demand * s) / (s * (counts[pl.market] + 0.5) + OUTSIDE);
      pl.prediction = Math.min(CAP, Math.round((est * range(rng, 0.9, 1.2)) / 1000) * 1000);
      pl.upgrade = RESEARCH_ROUNDS.includes(r);
    });

    // Free board signals (noisy).
    const level = (v, hi, med) => (v >= hi ? 2 : v >= med ? 1 : 0);
    const jitter = l => { const x = rng(); return Math.max(0, Math.min(2, l + (x < 0.15 ? -1 : x > 0.85 ? 1 : 0))); };
    const signals = {};
    MARKETS.forEach(m => {
      const c = cond[m.id];
      signals[m.id] = {
        demand: level(c.demand * range(rng, 0.88, 1.12), 115000, 70000),
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
    if (r < ROUNDS) {
      const next = state.conditions[r][marketId];
      const pct = Math.round((next.demand / c.demand - 1) * 100);
      return {
        title: 'Market growth',
        headline: m.name + ' demand next round: ' + (pct >= 0 ? '+' : '') + pct + '%  (' + fmtUnits(c.demand) + ' → ' + fmtUnits(next.demand) + ' chips).',
        detail: next.event ? 'Driver: ' + next.event : 'No major shock expected.',
        limitation: 'Covers your selected market only.',
      };
    }
    return {
      title: 'Market growth',
      headline: 'Final round: total ' + m.name + ' demand this round is ' + fmtUnits(c.demand) + ' chips.',
      limitation: 'Covers your selected market only.',
    };
  }

  function fmtUnits(n) { return Math.round(n).toLocaleString('en-US'); }

  // decision: { market, chip, upgrade:boolean, price, marketing ($), prediction (chips), report: type|null }
  function resolveRound(state, decision) {
    const r = state.round;
    const cond = state.conditions[r - 1];
    const decisions = {};

    state.teams.forEach(t => {
      const d = t.isPlayer ? decision : state.plans[t.id];
      const switched = !!t.market && t.market !== d.market;
      const incumbent = t.market === d.market;
      // Switching market or chip family invalidates an old upgrade.
      if (t.upgrade && (t.upgrade.market !== d.market || t.upgrade.chip !== d.chip)) t.upgrade = null;
      if (d.upgrade && RESEARCH_ROUNDS.includes(r)) t.upgrade = { market: d.market, chip: d.chip, round: r };
      decisions[t.id] = {
        team: t, d, switched, incumbent,
        fit: fitFor(t, d.chip, d.market),
      };
    });

    MARKETS.forEach(m => {
      const c = cond[m.id];
      const here = Object.values(decisions).filter(x => x.d.market === m.id);
      here.forEach(x => (x.s = score(c, x.d.price, x.fit, x.d.marketing, x.incumbent)));
      const total = here.reduce((s, x) => s + x.s, 0) + OUTSIDE;
      here.forEach(x => (x.demand = (c.demand * x.s) / total));
    });

    const results = state.teams.map(t => {
      const x = decisions[t.id];
      const d = x.d;
      const production = Math.min(CAP, Math.max(0, Math.round(d.prediction)));
      const sold = Math.round(Math.min(x.demand, CAP, production));
      const revenue = sold * d.price;
      const costs = {
        production: production * UNIT_COST,
        development: DEV_COST,
        marketing: d.marketing,
        report: d.report ? REPORT_COST : 0,
        penalty: x.switched ? SWITCH_PENALTY : 0,
      };
      const totalCost = Object.values(costs).reduce((a, b) => a + b, 0);
      const profit = revenue - totalCost;
      const row = {
        team: t.id, name: t.name, isPlayer: t.isPlayer, persona: t.persona && t.persona.label,
        market: d.market, chip: d.chip, price: d.price, marketing: d.marketing,
        prediction: production, demand: Math.round(x.demand), sold, revenue, costs, totalCost, profit,
        switched: x.switched, upgraded: !!(t.upgrade && t.upgrade.market === d.market),
        unmet: Math.max(0, Math.round(Math.min(x.demand, CAP) - production)),
        unsold: Math.max(0, production - sold),
      };
      t.streak = x.incumbent ? t.streak + 1 : 1;
      t.market = d.market; t.chip = d.chip;
      t.profit += profit;
      t.rounds.push(row);
      return row;
    });

    const entry = { round: r, event: state.events[r - 1], results };
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
    ROUNDS, TEAM_COUNT, PLAYER_ID, CAP, UNIT_COST, DEV_COST, REPORT_COST, SWITCH_PENALTY, RESEARCH_ROUNDS, UPGRADE_MULT,
    MARKETS, CHIPS, marketById, chipById, bestChipFor,
    createGame, report, resolveRound, standings, lastAvgPrice,
    player: state => state.teams.find(t => t.isPlayer),
  };
  root.MSEngine = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
