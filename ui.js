/* Market Shift — UI layer */
(function () {
  'use strict';
  const E = window.MSEngine;
  const $ = sel => document.querySelector(sel);
  const screenEl = $('#screen');

  const STEPS = ['start', 'scan', 'lab', 'compete', 'review'];
  const STEP_LABEL = { start: 'START MENU', scan: 'MARKET SELECT', lab: 'CHIP DEVELOPMENT', compete: 'COMPETE', review: 'REVIEW', final: 'FINAL RESULTS' };
  const LEVEL = ['LOW', 'MED', 'HIGH'];
  const REPORTS = [
    { id: 'rivals', name: 'Rival targets', desc: 'Where other teams are focusing' },
    { id: 'price', name: 'Price sensitivity', desc: 'How customers react to price' },
    { id: 'growth', name: 'Market growth', desc: 'Demand now and next round' },
  ];
  const TREND_ARROW = { growing: '↑', flat: '→', shrinking: '↓' };

  let G, step, draft, lastEntry;

  // ---------- formatting ----------
  const pad = n => String(n).padStart(2, '0');
  const units = n => Math.round(n).toLocaleString('en-US');
  const pct = x => Math.round(x * 100) + '%';
  function money(v, signed) {
    const s = (Math.abs(v) / 1e6).toFixed(2);
    const sign = v < 0 ? '−' : signed && v > 0 ? '+' : '';
    return sign + '$ ' + s + 'M';
  }
  const mName = id => E.marketById(id).name;
  const cName = id => E.chipById(id).name;
  const mCode = id => `<span class="mcode m-${id}">${E.marketById(id).code}</span>`;
  const cond = (id, round) => G.conditions[(round || G.round) - 1][id];
  const unitCost = () => G.unitCost[G.round - 1];
  const player = () => E.player(G);
  const isResearchRound = () => E.RESEARCH_ROUNDS.includes(G.round);
  const penaltyRule = () => money(E.PENALTY_BASE) + ' + ' + money(E.PENALTY_STEP) + ' per round you spent there';

  // Loyalty pips: one per consecutive round already spent in a market.
  function pips(streak) {
    const n = Math.min(streak, E.MAX_STREAK);
    return `<span class="pips" title="Loyalty +${pct(E.LOYALTY_STEP * n)}">${Array.from({ length: E.MAX_STREAK }, (_, i) => `<i class="${i < n ? 'on' : ''}"></i>`).join('')}</span>`;
  }

  function capacityText(marketId) {
    const p = player();
    const s = E.streakIn(p, marketId);
    const cap = E.capFor(p, marketId);
    if (s === 0) return `Entry round: max ${units(cap)} chips. Capacity grows to ${units(E.CAP * E.RAMP[1])} next round and ${units(E.CAP)} after that.`;
    if (s === 1) return `Second round here: max ${units(cap)} chips. Full ${units(E.CAP)} from next round.`;
    return `Fully established: max ${units(cap)} chips.`;
  }

  // ---------- flow ----------
  function newGame() {
    G = E.createGame();
    lastEntry = null;
    go('start');
  }

  function startRound() {
    const p = player();
    draft = {
      market: p.market, chip: p.chip, upgrade: false,
      report: null, reportData: null,
      price: null, marketing: 0.15e6, prediction: 30000,
    };
    if (draft.market && !draft.chip) draft.chip = E.bestChipFor(draft.market).id;
    go('scan');
  }

  function go(s) {
    step = s;
    renderChrome();
    const fn = { start: renderStart, scan: renderScan, lab: renderLab, compete: renderCompete, review: renderReview, final: renderFinal }[s];
    screenEl.innerHTML = fn();
    screenEl.classList.remove('screen'); void screenEl.offsetWidth; screenEl.classList.add('screen');
    bind[s] && bind[s]();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function renderChrome() {
    const shownRound = step === 'review' || step === 'final' ? lastEntry.round : G.round;
    $('#round-num').textContent = pad(shownRound);
    $('#round-total').textContent = pad(E.ROUNDS);
    $('#screen-label').textContent = STEP_LABEL[step];
    const cash = $('#cash');
    cash.textContent = money(player().profit);
    cash.classList.toggle('neg', player().profit < 0);
    const idx = step === 'final' ? 99 : STEPS.indexOf(step);
    document.querySelectorAll('[data-step]').forEach(el => {
      const i = STEPS.indexOf(el.dataset.step);
      el.classList.toggle('active', i === idx);
      el.classList.toggle('done', i < idx);
    });
    const foot = {
      start: 'PROTOTYPE  •  SYNTHETIC SCENARIO DATA',
      scan: 'CONDITIONS CHANGE EVERY ROUND  •  A NEW MARKET STARTS AT ' + pct(E.RAMP[0]) + ' CAPACITY',
      lab: researchFooter(),
      compete: 'LEAVING A MARKET COSTS ' + penaltyRule().toUpperCase() + '  •  UPGRADES ARE LOST',
      review: 'HIGHEST CUMULATIVE PROFIT AFTER ROUND ' + pad(E.ROUNDS) + ' WINS',
      final: 'CAMPAIGN COMPLETE',
    }[step];
    $('#footer').textContent = foot;
  }

  function researchFooter() {
    const next = E.RESEARCH_ROUNDS.find(r => r > G.round);
    return 'RESEARCH POINT EVERY 2 ROUNDS: UPGRADES STACK WHILE YOU STAY' + (isResearchRound() ? '  (AVAILABLE NOW)' : next ? '  (NEXT: ROUND ' + next + ')' : '  (NONE LEFT)');
  }

  // ---------- HELP ----------
  function renderHelp() {
    const rows = E.MARKETS.map(m => `<tr><td>${mCode(m.id)} ${m.name}</td><td class="num">≈${Math.round(m.demand / 1000)}k</td><td class="num">$${m.ref}</td><td>${TREND_ARROW[E.trendLabel(m)]} ${E.trendLabel(m)}</td><td>${E.bestChipFor(m.id).id}</td></tr>`).join('');
    $('#help-body').innerHTML = `
      <p>You run <b>Team ${E.PLAYER_ID}</b>, a chip business competing with ${E.TEAM_COUNT - 1} rival teams over <b>${E.ROUNDS} rounds</b>. The team with the highest <b>cumulative profit</b> wins.</p>
      <ol>
        <li><b>Scan:</b> compare six markets. Each has its own size, price level and long-run trend. The demand, price sensitivity and rival meters are rough estimates that change every round.</li>
        <li><b>Develop:</b> choose a chip family. Chips fit some markets far better than others. In rounds ${E.RESEARCH_ROUNDS.join(', ')} you get a <b>research point</b>. Each point adds +${pct(E.UPGRADE_STEP)} appeal for your chip in your market, and points <b>stack</b> while you stay.</li>
        <li><b>Compete:</b> buy up to one report (${money(E.REPORT_COST)}), then set price, marketing and production. Production costs about $${E.UNIT_COST} per chip, sold or not.</li>
        <li><b>Review:</b> see revenue, costs, profit and how your prediction compared with real sales.</li>
      </ol>
      <p><b>Commitment pays.</b> Building a position in a market takes time:</p>
      <ul>
        <li><b>Ramp-up:</b> in a new market you can make at most ${pct(E.RAMP[0])} of the ${units(E.CAP)}-chip cap, then ${pct(E.RAMP[1])}, then 100% from your third round.</li>
        <li><b>Loyalty:</b> customers like you +${pct(E.LOYALTY_STEP)} more for every round you stay (up to +${pct(E.LOYALTY_STEP * E.MAX_STREAK)}).</li>
        <li><b>Switching:</b> leaving a market costs ${penaltyRule()}, and you lose your upgrades and loyalty.</li>
      </ul>
      <p><b>Surprises.</b> Market news hits most rounds. Some news lasts several rounds, and some changes production costs. Each round your own team may also have an incident: a supplier delay, a viral review, a factory repair or a surprise big order.</p>
      <table class="results guide"><thead><tr><th>Market</th><th class="num">Typical size</th><th class="num">Typical price</th><th>Trend</th><th>Best chip</th></tr></thead><tbody>${rows}</tbody></table>
      <p>Each round also costs a fixed ${money(E.DEV_COST)} in development.</p>`;
  }

  // ---------- START ----------
  function renderStart() {
    const nodes = [['EV', 70, 60], ['DC', 330, 50], ['ESS', 360, 230], ['UAV', 60, 240], ['GRID', 210, 290], ['PC', 210, 20]];
    const svg = `
      <svg viewBox="0 0 420 320" aria-hidden="true">
        ${nodes.map(([, x, y]) => `<line class="net-spoke" x1="210" y1="160" x2="${x}" y2="${y}"/>`).join('')}
        ${nodes.map(([, x, y], i) => i < nodes.length - 1 ? `<line class="net-ring" x1="${x}" y1="${y}" x2="${nodes[i + 1][1]}" y2="${nodes[i + 1][2]}"/>` : '').join('')}
        <circle class="net-core" cx="210" cy="160" r="46"/>
        <circle class="net-pulse" cx="210" cy="160" r="60"><animate attributeName="r" values="50;80;50" dur="4s" repeatCount="indefinite"/><animate attributeName="stroke-opacity" values=".4;0;.4" dur="4s" repeatCount="indefinite"/></circle>
        <text class="net-core-text" x="210" y="167" text-anchor="middle">MS</text>
        ${nodes.map(([t, x, y]) => `<g class="net-node m-${t}"><circle cx="${x}" cy="${y}" r="26"/><text x="${x}" y="${y + 4}" text-anchor="middle">${t}</text></g>`).join('')}
      </svg>`;
    return `
      <div class="hero">
        <div>
          <div class="eyebrow">NEW CAMPAIGN</div>
          <h1>MARKET<br><span>SHIFT</span></h1>
          <p class="tagline">Read the market. <em>Build the advantage.</em></p>
          <p class="lead">A competitive chip-business simulation. Pick a market, commit to it, and outlast your rivals. Positions take rounds to build and are expensive to abandon.</p>
          <div class="actions" style="justify-content:flex-start">
            <button class="primary-btn" id="start-btn">START ROUND ▶</button>
            <button class="secondary-btn" id="how-btn">HOW TO PLAY</button>
          </div>
          <p class="note" style="margin-top:14px">SESSION SETUP  •  ${E.TEAM_COUNT} TEAMS  •  ${E.ROUNDS} ROUNDS  •  YOU ARE TEAM ${E.PLAYER_ID}</p>
        </div>
        <div class="panel network">
          <div class="label">MARKET INTELLIGENCE NETWORK</div>
          <div style="font-weight:700;margin:4px 0 0">One chip business.<br>Six markets.</div>
          ${svg}
        </div>
      </div>
      <div class="label" style="margin-top:22px">EVERY ROUND</div>
      <div class="loop">
        <div><b>01</b><span>SCAN</span><p>Compare six markets on size, trend, price pressure and rivals.</p></div>
        <div><b>02</b><span>DEVELOP</span><p>Pick the chip family that fits your market, and stack upgrades.</p></div>
        <div><b>03</b><span>COMPETE</span><p>Buy one report, set price, marketing and production.</p></div>
        <div><b>04</b><span>REVIEW</span><p>See what happened, including surprises, and plan ahead.</p></div>
      </div>`;
  }

  // ---------- SCAN ----------
  function meter(label, lvl, warn) {
    return `<div class="meter"><div class="label">${label}</div><b>${LEVEL[lvl]}</b><div class="bars l${lvl}${warn ? ' warn' : ''}"><i></i><i></i><i></i></div></div>`;
  }

  function newsBanners(events) {
    return events.map(ev => `
      <div class="event-banner${ev.cost ? ' cost' : ''}">
        <b>${ev.isNew ? 'MARKET NEWS' : 'ONGOING'}</b>
        <span><strong>${ev.title}.</strong> ${ev.text}${ev.roundsLeft > 1 ? ` <em class="left">${ev.roundsLeft} rounds left</em>` : ''}</span>
      </div>`).join('');
  }

  function renderScan() {
    const p = player();
    const cards = E.MARKETS.map(m => {
      const s = G.signals[m.id];
      const c = cond(m.id);
      const trend = E.trendLabel(m);
      const badges = [];
      if (p.market === m.id) badges.push(`<span class="badge cur">Your market ${pips(p.streak)}</span>`);
      c.events.forEach(t => badges.push(`<span class="badge">${t}</span>`));
      return `
        <button class="card market m-${m.id}${draft.market === m.id ? ' selected' : ''}" data-market="${m.id}" type="button">
          <span class="tag">${m.tag}</span>
          <span class="code">${m.code}</span>
          <h3>${m.name}</h3>
          <div class="sub">${m.sub}</div>
          <dl class="facts">
            <div><dt>Typical size</dt><dd>≈${Math.round(m.demand / 1000)}k</dd></div>
            <div><dt>Typical price</dt><dd>$${m.ref}</dd></div>
            <div><dt>Outlook</dt><dd class="trend ${trend}">${TREND_ARROW[trend]} ${trend}</dd></div>
            <div><dt>Best chip</dt><dd>${E.bestChipFor(m.id).id}</dd></div>
          </dl>
          <p class="rewards">${m.rewards}</p>
          ${badges.length ? `<div class="badges">${badges.join(' ')}</div>` : ''}
          <div class="meters">
            ${meter('Demand now', s.demand)}
            ${meter('Price sensitivity', s.pressure, true)}
            ${meter('Rival activity', s.rivals, true)}
          </div>
        </button>`;
    }).join('');

    return `
      <div class="eyebrow">01 / MARKET SCAN</div>
      <h1 class="title">Choose your market</h1>
      <p class="lead">Each market has its own size, price level and long-run outlook. The meters show rough, noisy estimates for this round only. Buy a report in the Compete step for hard numbers. Think several rounds ahead: a new market takes time to build.</p>
      ${newsBanners(G.events[G.round - 1])}
      ${unitCost() !== E.UNIT_COST ? `<div class="note" style="margin-bottom:12px">PRODUCTION COST THIS ROUND: $${unitCost()} PER CHIP (NORMALLY $${E.UNIT_COST})</div>` : ''}
      <div class="panel-head"><div class="label">ROUND ${pad(G.round)} OF ${pad(E.ROUNDS)}  •  MARKET BOARD</div><div class="note">SYNTHETIC SIGNALS  •  ILLUSTRATIVE ONLY</div></div>
      <div class="grid markets">${cards}</div>
      <div class="selected-bar" id="sel-bar">${selectedBar()}</div>`;
  }

  function selectedBar() {
    const p = player();
    if (!draft.market) return `<div><div class="label">SELECTED MARKET</div><h3>None yet</h3><p>Click a market card to set your focus. You will build your position there over the coming rounds.</p></div><button class="primary-btn" disabled>CONTINUE TO CHIP LAB →</button>`;
    const pen = E.switchPenalty(p, draft.market);
    const staying = p.market === draft.market;
    let commit = '';
    if (pen) {
      commit = `<p class="warn">Leaving ${mName(p.market)} after ${p.streak} round${p.streak > 1 ? 's' : ''} costs a ${money(pen)} penalty${p.upgrade ? `, throws away your level ${p.upgrade.level} upgrade` : ''} and resets your loyalty.</p>`;
    } else if (staying) {
      commit = `<p class="good">Staying put: no penalty. Loyalty ${pips(p.streak)} +${pct(E.LOYALTY_STEP * Math.min(p.streak, E.MAX_STREAK))}${p.upgrade ? `, level ${p.upgrade.level} upgrade kept` : ''}.</p>`;
    }
    return `
      <div>
        <div class="label">SELECTED MARKET</div>
        <h3>${mName(draft.market)}</h3>
        <p>${capacityText(draft.market)}</p>
        ${commit}
      </div>
      <button class="primary-btn" id="to-lab">CONTINUE TO CHIP LAB →</button>`;
  }

  // ---------- LAB ----------
  function renderLab() {
    const best = E.bestChipFor(draft.market).id;
    const cards = E.CHIPS.map(c => {
      const fits = E.MARKETS.map(m => {
        const f = c.fit[m.id];
        return `<span class="fit ${f >= 0.95 ? 'f2' : f >= 0.6 ? 'f1' : ''}${m.id === draft.market ? ' focus' : ''}">${m.code}</span>`;
      }).join('');
      const f = c.fit[draft.market];
      return `
        <button class="card${draft.chip === c.id ? ' selected' : ''}" data-chip="${c.id}" type="button">
          <span class="tag">${draft.chip === c.id ? 'ACTIVE' : ''}</span>
          <div class="group">${c.group.toUpperCase()}</div>
          <span class="code" style="margin-top:8px">${c.id}</span>
          <h3>${c.name}</h3>
          <div class="sub">${c.sub}</div>
          <div class="label" style="margin-top:12px">Development capabilities</div>
          <ul>${c.caps.map(x => `<li>${x}</li>`).join('')}</ul>
          <div class="label">Market fit</div>
          <div class="fitrow">${fits}</div>
          <div class="sub" style="margin-top:8px">Fit for ${mName(draft.market)}: <b class="${f >= 0.95 ? 'good' : f < 0.6 ? 'bad' : ''}">${f >= 0.95 ? 'Strong' : f >= 0.6 ? 'Partial' : 'Poor'}</b></div>
          ${c.id === best ? `<div class="reco">★ RECOMMENDED FOR ${mName(draft.market).toUpperCase()}</div>` : ''}
        </button>`;
    }).join('');

    return `
      <div class="eyebrow">02 / DEVELOPMENT LAB</div>
      <h1 class="title">Choose your chip focus</h1>
      <p class="lead">Select a chip family to shape which market needs your product can serve best. A poor fit means customers prefer your rivals, even at the same price.</p>
      <div class="ctx">MARKET FOCUS: ${mName(draft.market).toUpperCase()}<a id="back-scan">change market</a></div>
      <div class="label" style="margin-bottom:10px">CHOOSE ONE DEVELOPMENT PATH FOR THIS ROUND</div>
      <div class="grid chips">${cards}</div>
      <div id="research">${researchBox()}</div>
      <div class="actions"><button class="primary-btn" id="to-compete">CONFIRM CHIP →</button></div>`;
  }

  function researchBox() {
    const p = player();
    const level = E.upgradeLevel(p, draft.chip, draft.market);
    const loses = p.upgrade && !level;
    const status = level ? `<p class="good">Active upgrade: ${cName(p.upgrade.chip)} for ${mName(p.upgrade.market)}, level ${level} (+${pct(E.UPGRADE_STEP * level)} customer appeal).</p>`
      : loses ? `<p class="warn">Your level ${p.upgrade.level} upgrade for ${cName(p.upgrade.chip)} in ${mName(p.upgrade.market)} will be lost with this choice.</p>` : '';
    if (isResearchRound()) {
      return `
        <div class="research${draft.upgrade ? ' on' : ''}">
          <div>
            <div class="label">RESEARCH POINT AVAILABLE</div>
            <div style="font-weight:700;margin:2px 0">Upgrade ${cName(draft.chip)} for ${mName(draft.market)} to level ${level + 1}</div>
            <div class="sub muted">+${pct(E.UPGRADE_STEP)} appeal per level. Levels stack while you keep the same market and chip, and are all lost if you switch.</div>
            ${status}
          </div>
          <label class="toggle"><input type="checkbox" id="upgrade" ${draft.upgrade ? 'checked' : ''}> USE RESEARCH POINT</label>
        </div>`;
    }
    const next = E.RESEARCH_ROUNDS.find(r => r > G.round);
    return `<div class="research"><div><div class="label">RESEARCH POINT</div><div class="sub muted">${next ? 'Next research point arrives in round ' + next + '.' : 'No research points left this campaign.'}</div>${status}</div></div>`;
  }

  // ---------- COMPETE ----------
  function refPriceHint() {
    const avg = E.lastAvgPrice(G, draft.market);
    return avg ? { price: avg, text: 'Market average last round: $ ' + avg } : { price: Math.round(cond(draft.market).ref), text: 'No sales history yet. Typical asking price is about $ ' + Math.round(cond(draft.market).ref * (0.9 + 0.2 * Math.random())) };
  }

  function renderCompete() {
    const p = player();
    const hint = refPriceHint();
    if (draft.price == null || draft._priceMarket !== draft.market) { draft.price = hint.price; draft._priceMarket = draft.market; }
    draft._hint = draft._hint && draft._hintMarket === draft.market ? draft._hint : hint.text;
    draft._hintMarket = draft.market;
    const cap = E.capFor(p, draft.market);
    draft.prediction = Math.min(draft.prediction, cap);
    const level = E.upgradeLevel(p, draft.chip, draft.market) + (draft.upgrade ? 1 : 0);
    const streak = E.streakIn(p, draft.market);

    const reports = REPORTS.map(r => {
      const bought = draft.report === r.id;
      return `<button class="report-btn${bought ? ' bought' : ''}" data-report="${r.id}" type="button" ${draft.report && !bought ? 'disabled' : ''}>
        <div><b>${r.name}</b><span>${r.desc}</span></div><em>${bought ? 'PURCHASED' : 'BUY ' + money(E.REPORT_COST).replace(' ', '')}</em></button>`;
    }).join('');

    return `
      <div class="eyebrow">03 / COMPETE</div>
      <h1 class="title">Set your price and predict</h1>
      <p class="lead">Buy up to one report, set your price and marketing budget to win customers from rivals, then predict your sales. Your prediction is your production run.</p>
      <div class="ctx">MARKET FOCUS: ${mName(draft.market).toUpperCase()} ${pips(streak)}  •  CHIP: ${cName(draft.chip).toUpperCase()}${level ? '  •  UPGRADE LV ' + level : ''}<a id="back-lab">change chip</a><a id="back-scan2">change market</a></div>
      <div class="compete">
        <div class="panel">
          <div class="panel-head"><div class="label">MARKET REPORT</div><div class="note">BUY UP TO ONE REPORT THIS ROUND  •  COST ${money(E.REPORT_COST)}</div></div>
          <div class="reports">${reports}</div>
          <div id="report-out">${reportOut()}</div>
          <div class="rule">
            <b>MARKET RULE</b><br>
            Leaving a market later costs ${penaltyRule()}. Upgrades and loyalty built here are lost.<br>
            <span class="muted">The longer you stay, the stronger your position, and the more it costs to walk away.</span>
          </div>
        </div>
        <div class="panel">
          <div class="label">YOUR DECISION</div>
          <div class="field">
            <div class="field-top"><span class="label">Price per chip</span><span class="big" id="v-price"></span></div>
            <input type="range" id="price" min="25" max="130" step="1" value="${draft.price}">
            <div class="hint">${draft._hint}  •  higher price = higher margin, fewer buyers  •  <span id="v-margin"></span></div>
          </div>
          <div class="field">
            <div class="field-top"><span class="label">Marketing budget</span><span class="big" id="v-mk"></span></div>
            <input type="range" id="mk" min="0" max="0.5" step="0.01" value="${draft.marketing / 1e6}">
            <div class="hint">Helps win customers, especially when entering a new market${E.marketById(draft.market).entryMk < 0.9 ? ' (less so here: these buyers stick with suppliers they know)' : ''}. Returns diminish.</div>
          </div>
          <div class="field">
            <div class="field-top"><span class="label">Sales prediction = production run</span><span class="big" id="v-pred"></span></div>
            <input type="range" id="pred" min="0" max="${cap}" step="1000" value="${draft.prediction}">
            <div class="hint">${capacityText(draft.market)} You pay $${unitCost()} for every chip produced${unitCost() !== E.UNIT_COST ? ' this round' : ''}, sold or not. You can't sell more than you produce.</div>
          </div>
          <table class="costs" id="costs"></table>
          <div class="actions"><button class="primary-btn" id="submit">SUBMIT DECISION →</button></div>
        </div>
      </div>`;
  }

  function reportOut() {
    const d = draft.reportData;
    if (!d) return '<p class="note" style="margin-top:12px">NO REPORT PURCHASED. YOU ARE RELYING ON THE FREE MARKET BOARD SIGNALS.</p>';
    let extra = '';
    if (d.counts) {
      extra = `<div class="mini-counts">${E.MARKETS.map(m => `<div class="${m.id === draft.market ? 'me' : ''}"><span>${m.code}</span><b>${d.counts[m.id]}</b></div>`).join('')}</div>`;
    }
    return `<div class="report-out"><div class="label">REPORT: ${d.title.toUpperCase()}${d.forMarket ? ' • ' + mName(d.forMarket).toUpperCase() : ''}</div><p>${d.headline}</p>${extra}${d.detail ? `<p class="muted" style="font-size:13px">${d.detail}</p>` : ''}<p class="lim">Limitation: ${d.limitation}</p></div>`;
  }

  function projectedCosts() {
    return {
      production: draft.prediction * unitCost(),
      development: E.DEV_COST,
      marketing: draft.marketing,
      report: draft.report ? E.REPORT_COST : 0,
      penalty: E.switchPenalty(player(), draft.market),
    };
  }

  function updateCompete() {
    $('#v-price').textContent = '$ ' + draft.price;
    $('#v-mk').textContent = money(draft.marketing);
    $('#v-pred').textContent = units(draft.prediction) + ' chips';
    const margin = draft.price - unitCost();
    $('#v-margin').textContent = 'margin $' + margin + '/chip';
    const c = projectedCosts();
    const total = Object.values(c).reduce((a, b) => a + b, 0);
    const rev = draft.prediction * draft.price;
    const be = margin > 0 ? Math.ceil(total / draft.price) : Infinity;
    $('#costs').innerHTML = `
      <tr><td>Production (${units(draft.prediction)} × $${unitCost()})</td><td>${money(c.production)}</td></tr>
      <tr><td>Development (fixed)</td><td>${money(c.development)}</td></tr>
      <tr><td>Marketing</td><td>${money(c.marketing)}</td></tr>
      ${c.report ? `<tr><td>Market report</td><td>${money(c.report)}</td></tr>` : ''}
      ${c.penalty ? `<tr><td class="warn">Market switch penalty</td><td class="warn">${money(c.penalty)}</td></tr>` : ''}
      <tr class="total"><td>Projected costs</td><td>${money(total)}</td></tr>
      <tr><td>Profit if every chip sells</td><td class="${rev - total >= 0 ? 'good' : 'bad'}">${money(rev - total, true)}</td></tr>
      <tr><td>Break-even sales</td><td>${isFinite(be) && be <= draft.prediction ? units(be) + ' chips' : '<span class="bad">not reachable</span>'}</td></tr>`;
  }

  // ---------- REVIEW ----------
  function profitChart(rows) {
    const n = E.ROUNDS;
    const W = 420, H = 200, padL = 10, padB = 26, top = 22, gap = 10;
    const vals = Array.from({ length: n }, (_, i) => (rows[i] ? rows[i].profit : null));
    const max = Math.max(0.5e6, ...vals.filter(v => v != null).map(Math.abs));
    const hasNeg = vals.some(v => v != null && v < 0);
    const zeroY = hasNeg ? top + (H - top - padB) / 2 : H - padB;
    const scale = (hasNeg ? (H - top - padB) / 2 : H - top - padB) / max;
    const bw = (W - padL * 2 - gap * (n - 1)) / n;
    const bars = vals.map((v, i) => {
      const x = padL + i * (bw + gap);
      const label = `<text class="axis" x="${x + bw / 2}" y="${H - 6}" text-anchor="middle">R${i + 1}</text>`;
      if (v == null) return `<rect class="bar-empty" x="${x}" y="${zeroY - 3}" width="${bw}" height="3"/>${label}`;
      const h = Math.max(2, Math.abs(v) * scale);
      const y = v >= 0 ? zeroY - h : zeroY;
      const cls = v < 0 ? 'bar-neg' : i === rows.length - 1 ? 'bar-pos last' : 'bar-pos';
      return `<rect class="${cls}" x="${x}" y="${y}" width="${bw}" height="${h}" rx="4"><animate attributeName="height" from="0" to="${h}" dur=".5s"/></rect>
        <text class="val" x="${x + bw / 2}" y="${v >= 0 ? y - 6 : y + h + 13}" text-anchor="middle">${money(v).replace('$ ', '$')}</text>${label}`;
    }).join('');
    return `<svg viewBox="0 0 ${W} ${H}"><line class="zero" x1="0" x2="${W}" y1="${zeroY}" y2="${zeroY}"/>${bars}</svg>`;
  }

  function insights(me, entry) {
    const out = [];
    const rivals = entry.results.filter(r => r.market === me.market && !r.isPlayer);
    if (!rivals.length) out.push(`You had ${mName(me.market)} to yourself this round. Uncontested markets let you charge more.`);
    else {
      const avg = Math.round(rivals.reduce((s, r) => s + r.price, 0) / rivals.length);
      out.push(`${rivals.length} rival team${rivals.length > 1 ? 's' : ''} shared ${mName(me.market)} with you. Their average price was $${avg}; yours was $${me.price}.`);
    }
    if (me.streak >= E.RAMP.length) out.push(`You are established in ${mName(me.market)}: full capacity and +${pct(E.LOYALTY_STEP * Math.min(me.streak, E.MAX_STREAK))} loyalty from next round.`);
    else out.push(`Round ${me.streak} in ${mName(me.market)}: your capacity cap was ${units(me.cap)} chips while you build up. Next round you can make up to ${units(E.CAP * E.RAMP[me.streak])}.`);
    if (me.unmet >= 1000) out.push(`Customers wanted about ${units(me.unmet)} more chips than you could deliver. That is roughly ${money(me.unmet * me.price)} of revenue left on the table${me.prediction >= me.cap && me.cap < E.CAP ? ' because of your ramp-up limit' : ''}.`);
    if (me.unsold >= 1000) out.push(`${units(me.unsold)} chips went unsold, wasting ${money(me.unsold * me.unitCost)} of production.`);
    if (me.switched) out.push(`Switching markets cost you a ${money(me.costs.penalty)} penalty${me.lostUpgrade ? ` and a level ${me.lostUpgrade} upgrade` : ''}.`);
    if (me.upgraded) out.push(`Your level ${me.upgraded} chip upgrade gave you +${pct(E.UPGRADE_STEP * me.upgraded)} appeal in ${mName(me.market)}.`);
    const crowd = {}; entry.results.forEach(r => (crowd[r.market] = (crowd[r.market] || 0) + 1));
    const empty = E.MARKETS.filter(m => !crowd[m.id]).map(m => m.name);
    if (empty.length) out.push(`Nobody targeted: ${empty.join(', ')}.`);
    return out;
  }

  function renderReview() {
    const entry = lastEntry;
    const me = entry.results.find(r => r.isPlayer);
    const gap = me.prediction ? Math.round(((me.sold - me.prediction) / me.prediction) * 100) : 0;
    const rows = entry.results.slice().sort((a, b) => (a.market === me.market ? -1 : 0) - (b.market === me.market ? -1 : 0) || a.market.localeCompare(b.market) || b.sold - a.sold);
    const myRounds = player().rounds;
    const last = G.over;
    const extra = [
      me.costs.report ? 'Report ' + money(me.costs.report) : '',
      me.costs.penalty ? '<span class="warn">Penalty ' + money(me.costs.penalty) + '</span>' : '',
      me.costs.incident ? '<span class="warn">Repairs ' + money(me.costs.incident) + '</span>' : '',
    ].filter(Boolean).map(x => ' • ' + x).join('');
    const rivalIncidents = entry.results.filter(r => r.incident && !r.isPlayer);

    return `
      <div class="eyebrow">04 / REVIEW</div>
      <h1 class="title">Track your performance</h1>
      <p class="lead">Review revenue, costs and profit to understand whether your market strategy is paying off.</p>
      <div class="panel-head"><div class="label">ROUND ${pad(entry.round)} SNAPSHOT${entry.events.length ? '  •  ' + entry.events.map(e => e.title.toUpperCase()).join('  •  ') : ''}</div><div class="note">ILLUSTRATIVE GAME DATA</div></div>
      ${me.incident ? `<div class="incident ${['viral', 'customer'].includes(me.incident.id) ? 'up' : 'down'}"><b>SURPRISE</b><span><strong>${me.incident.title}.</strong> ${me.incident.text}</span></div>` : ''}
      <div class="tiles">
        <div class="panel tile"><div class="label">Revenue</div><div class="val">${money(me.revenue)}</div><div class="sub">${units(me.sold)} chips × $${me.price} in ${mName(me.market)}</div></div>
        <div class="panel tile"><div class="label">Operating costs</div><div class="val">${money(me.totalCost)}</div><div class="sub">Production ${money(me.costs.production)} • Dev ${money(me.costs.development)} • Mkt ${money(me.costs.marketing)}${extra}</div></div>
        <div class="panel tile profit"><div class="label">Round profit</div><div class="val ${me.profit >= 0 ? 'good' : 'bad'}">${money(me.profit, true)}</div><div class="sub">Revenue minus costs  •  cumulative ${money(player().profit)}</div></div>
      </div>
      <div class="review-grid">
        <div class="panel chart">
          <div class="panel-head"><div class="label">Profit by round</div><div class="note">CUMULATIVE ${money(player().profit)}</div></div>
          ${profitChart(myRounds)}
        </div>
        <div class="panel">
          <div class="label">Prediction vs actual</div>
          <div class="pva">
            <div><span class="label">Predicted</span><b>${units(me.prediction)}</b></div>
            <div><span class="label">Sold</span><b>${units(me.sold)}</b></div>
            <div><span class="label">Gap</span><b class="${Math.abs(gap) <= 10 ? 'good' : 'bad'}">${gap > 0 ? '+' : gap < 0 ? '−' : ''}${Math.abs(gap)}%</b></div>
          </div>
          <div class="sub muted" style="text-align:center;font-size:12px;margin-top:6px">Real customer demand for your chips: ${units(me.demand)}${me.demand > me.cap ? ` (above your ${units(me.cap)} capacity)` : ''}</div>
          <ul class="insights">${insights(me, entry).map(x => `<li>${x}</li>`).join('')}</ul>
        </div>
      </div>
      <div class="panel" style="margin-top:14px">
        <div class="panel-head"><div class="label">Competitor results</div><div class="note">YOUR MARKET FIRST  •  ↺ SWITCHED  •  +N UPGRADE LEVEL</div></div>
        <div style="overflow-x:auto"><table class="results">
          <thead><tr><th>Team</th><th>Market</th><th>Chip</th><th class="num">Price</th><th class="num">Marketing</th><th class="num">Sold</th><th class="num">Round profit</th><th class="num">Total</th></tr></thead>
          <tbody>${rows.map(r => `<tr class="${r.isPlayer ? 'me' : r.market === me.market ? 'same' : ''}">
            <td>${r.name}${r.incident && !r.isPlayer ? ` <span class="muted" title="${r.incident.title}">⚑</span>` : ''}</td><td>${mCode(r.market)} ${pips(r.streak - 1)}${r.switched ? ' <span class="warn" title="Switched market">↺</span>' : ''}</td><td>${r.chip}${r.upgraded ? '+' + r.upgraded : ''}</td>
            <td class="num">$ ${r.price}</td><td class="num">${money(r.marketing)}</td>
            <td class="num">${units(r.sold)}${r.sold >= r.cap ? ' (max)' : ''}</td>
            <td class="num ${r.profit < 0 ? 'bad' : ''}">${money(r.profit)}</td>
            <td class="num">${money(G.teams.find(t => t.id === r.team).rounds.slice(0, entry.round).reduce((s, x) => s + x.profit, 0))}</td></tr>`).join('')}</tbody>
        </table></div>
        ${rivalIncidents.length ? `<p class="note" style="margin:10px 0 0">⚑ RIVAL SURPRISES: ${rivalIncidents.map(r => r.name.toUpperCase() + ' — ' + r.incident.title.toUpperCase()).join('  •  ')}</p>` : ''}
      </div>
      <div class="actions"><button class="primary-btn" id="next">${last ? 'SEE FINAL RESULTS →' : 'START ROUND ' + pad(G.round) + ' →'}</button></div>`;
  }

  // ---------- FINAL ----------
  function renderFinal() {
    const st = E.standings(G);
    const me = st.find(s => s.isPlayer);
    const rounds = me.rounds;
    const avgGap = Math.round(rounds.reduce((s, r) => s + (r.prediction ? Math.abs(r.sold - r.prediction) / r.prediction : 1), 0) / rounds.length * 100);
    const switches = rounds.filter(r => r.switched).length;
    const penalties = rounds.reduce((s, r) => s + r.costs.penalty, 0);
    const longest = rounds.reduce((b, r) => (r.streak > b.streak ? r : b), rounds[0]);
    const best = rounds.reduce((b, r, i) => (r.profit > rounds[b].profit ? i : b), 0);
    const worst = rounds.reduce((b, r, i) => (r.profit < rounds[b].profit ? i : b), 0);
    const reports = rounds.filter(r => r.costs.report).length;
    const verdict = me.rank === 1 ? 'You won the campaign!' : me.rank <= 3 ? 'A podium finish.' : 'The market got the better of you this time.';

    const lessons = [];
    lessons.push(`Your average prediction gap was ${avgGap}%. ${avgGap <= 10 ? 'Sharp forecasting kept waste low.' : 'Better forecasts mean less wasted production and fewer missed sales.'}`);
    lessons.push(switches
      ? `You switched market ${switches} time${switches > 1 ? 's' : ''}, paying ${money(penalties)} in penalties and restarting your ramp-up each time. Your longest stay was ${longest.streak} rounds in ${mName(longest.market)}.`
      : `You never switched. ${longest.streak} rounds in ${mName(longest.market)} built full capacity and maximum loyalty.`);
    lessons.push(`You bought ${reports} report${reports === 1 ? '' : 's'}. ${reports >= 3 ? 'Evidence-driven play.' : 'Research is cheap compared with a wrong market choice.'}`);
    lessons.push(`Best round: R${best + 1} in ${mName(rounds[best].market)} (${money(rounds[best].profit)}). Worst round: R${worst + 1} in ${mName(rounds[worst].market)} (${money(rounds[worst].profit)}).`);
    const winner = st[0];
    if (!winner.isPlayer) lessons.push(`${winner.name} (${winner.persona}) won by playing ${winner.rounds.map(r => r.market).join(' → ')}.`);

    return `
      <div class="final-hero">
        <div class="eyebrow">CAMPAIGN COMPLETE  •  ${E.ROUNDS} ROUNDS</div>
        <div class="rank">#${me.rank}</div>
        <h1 class="title">${verdict}</h1>
        <p class="lead" style="margin:0 auto 18px">You finished ${me.rank} of ${E.TEAM_COUNT} with a cumulative profit of <b>${money(me.profit)}</b>.</p>
      </div>
      <div class="review-grid">
        <div class="panel">
          <div class="label" style="margin-bottom:8px">Final leaderboard</div>
          <div style="overflow-x:auto"><table class="results">
            <thead><tr><th></th><th>Team</th><th>Strategy</th><th>Markets R1→R${E.ROUNDS}</th><th class="num">Cumulative profit</th></tr></thead>
            <tbody>${st.map(s => `<tr class="${s.isPlayer ? 'me' : ''}"><td><span class="medal m${s.rank}">${s.rank}</span></td><td>${s.name}</td><td>${s.persona || 'You'}</td>
              <td class="path">${s.rounds.map(r => mCode(r.market)).join('')}</td><td class="num">${money(s.profit)}</td></tr>`).join('')}</tbody>
          </table></div>
        </div>
        <div class="panel">
          <div class="label">Debrief</div>
          <ul class="insights">${lessons.map(x => `<li>${x}</li>`).join('')}</ul>
          <div class="chart" style="margin-top:10px">${profitChart(rounds)}</div>
        </div>
      </div>
      <div class="actions"><button class="primary-btn" id="again">NEW CAMPAIGN ▶</button></div>`;
  }

  // ---------- event binding ----------
  const bind = {
    start() {
      $('#start-btn').onclick = startRound;
      $('#how-btn').onclick = () => $('#help').showModal();
    },
    scan() {
      screenEl.querySelectorAll('[data-market]').forEach(el => (el.onclick = () => {
        if (draft.market !== el.dataset.market) {
          draft.market = el.dataset.market;
          const p = player();
          draft.chip = p.market === draft.market && p.chip ? p.chip : E.bestChipFor(draft.market).id;
        }
        screenEl.querySelectorAll('[data-market]').forEach(c => c.classList.toggle('selected', c === el));
        $('#sel-bar').innerHTML = selectedBar();
        bindToLab();
      }));
      bindToLab();
    },
    lab() {
      screenEl.querySelectorAll('[data-chip]').forEach(el => (el.onclick = () => { draft.chip = el.dataset.chip; go('lab'); }));
      $('#back-scan').onclick = () => go('scan');
      const up = $('#upgrade');
      if (up) up.onchange = () => { draft.upgrade = up.checked; $('#research').innerHTML = researchBox(); bind.lab(); };
      $('#to-compete').onclick = () => go('compete');
    },
    compete() {
      $('#back-lab').onclick = () => go('lab');
      $('#back-scan2').onclick = () => go('scan');
      screenEl.querySelectorAll('[data-report]').forEach(el => (el.onclick = () => {
        if (draft.report) return;
        draft.report = el.dataset.report;
        draft.reportData = Object.assign(E.report(G, draft.report, draft.market), { forMarket: draft.report === 'rivals' ? null : draft.market });
        screenEl.querySelectorAll('[data-report]').forEach(b => {
          const mine = b.dataset.report === draft.report;
          b.classList.toggle('bought', mine);
          b.disabled = !mine;
          b.querySelector('em').textContent = mine ? 'PURCHASED' : 'BUY ' + money(E.REPORT_COST).replace(' ', '');
        });
        $('#report-out').innerHTML = reportOut();
        updateCompete();
      }));
      $('#price').oninput = e => { draft.price = +e.target.value; updateCompete(); };
      $('#mk').oninput = e => { draft.marketing = Math.round(+e.target.value * 100) / 100 * 1e6; updateCompete(); };
      $('#pred').oninput = e => { draft.prediction = +e.target.value; updateCompete(); };
      $('#submit').onclick = () => {
        lastEntry = E.resolveRound(G, {
          market: draft.market, chip: draft.chip, upgrade: draft.upgrade,
          price: draft.price, marketing: draft.marketing, prediction: draft.prediction, report: draft.report,
        });
        go('review');
      };
      updateCompete();
    },
    review() {
      $('#next').onclick = () => (G.over ? go('final') : startRound());
    },
    final() {
      $('#again').onclick = newGame;
    },
  };

  function bindToLab() {
    const b = $('#to-lab');
    if (b) b.onclick = () => go('lab');
  }

  renderHelp();
  $('#help-btn').onclick = () => $('#help').showModal();
  newGame();
})();
