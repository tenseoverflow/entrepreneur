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
    { id: 'growth', name: 'Market growth', desc: 'Demand trend for next round' },
  ];

  let G, step, draft, lastEntry;

  // ---------- formatting ----------
  const pad = n => String(n).padStart(2, '0');
  const units = n => Math.round(n).toLocaleString('en-US');
  function money(v, signed) {
    const s = (Math.abs(v) / 1e6).toFixed(2);
    const sign = v < 0 ? '−' : signed && v > 0 ? '+' : '';
    return sign + '$ ' + s + 'M';
  }
  const mName = id => E.marketById(id).name;
  const cName = id => E.chipById(id).name;
  const cond = (id, round) => G.conditions[(round || G.round) - 1][id];
  const player = () => E.player(G);
  const isResearchRound = () => E.RESEARCH_ROUNDS.includes(G.round);

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
      start: 'PROTOTYPE UI  •  SYNTHETIC SCENARIO DATA',
      scan: 'CONDITIONS CHANGE EVERY ROUND  •  SWITCHING MARKET LATER = PENALTY',
      lab: researchFooter(),
      compete: 'CHANGING MARKET NEXT ROUND COSTS A $0.30M PENALTY  •  UPGRADES FOR THIS MARKET LOSE THEIR VALUE',
      review: 'HIGHEST CUMULATIVE PROFIT AFTER ROUND 04 WINS',
      final: 'CAMPAIGN COMPLETE',
    }[step];
    $('#footer').textContent = foot;
  }

  function researchFooter() {
    const next = E.RESEARCH_ROUNDS.find(r => r > G.round);
    return 'RESEARCH POINT EVERY 2 ROUNDS: UPGRADE YOUR CHIP FOR ONE MARKET' + (isResearchRound() ? '  (AVAILABLE NOW)' : next ? '  (NEXT: ROUND ' + next + ')' : '  (NONE LEFT)');
  }

  // ---------- START ----------
  function renderStart() {
    const nodes = [['EV', 70, 60], ['DATA', 330, 50], ['STORAGE', 360, 230], ['DRONES', 60, 240], ['GRID', 210, 290], ['PC', 210, 20]];
    const svg = `
      <svg viewBox="0 0 420 320" aria-hidden="true">
        ${nodes.map(([, x, y]) => `<line x1="210" y1="160" x2="${x}" y2="${y}" stroke="#34566B" stroke-width="1.2" stroke-dasharray="4 4"/>`).join('')}
        ${nodes.map(([, x, y], i) => i < nodes.length - 1 ? `<line x1="${x}" y1="${y}" x2="${nodes[i + 1][1]}" y2="${nodes[i + 1][2]}" stroke="#1B3548" stroke-width="1"/>` : '').join('')}
        <circle cx="210" cy="160" r="46" fill="#0F2739" stroke="#35D7E8" stroke-width="2"/>
        <circle cx="210" cy="160" r="60" fill="none" stroke="#35D7E8" stroke-opacity=".25"><animate attributeName="r" values="50;80;50" dur="4s" repeatCount="indefinite"/><animate attributeName="stroke-opacity" values=".4;0;.4" dur="4s" repeatCount="indefinite"/></circle>
        <text x="210" y="167" text-anchor="middle" fill="#35D7E8" font-weight="800" font-size="20" letter-spacing="2">MS</text>
        ${nodes.map(([t, x, y]) => `<g><circle cx="${x}" cy="${y}" r="26" fill="#102538" stroke="#294152"/><text x="${x}" y="${y + 4}" text-anchor="middle" fill="#9CB0BE" font-size="9.5" letter-spacing="1">${t}</text></g>`).join('')}
      </svg>`;
    return `
      <div class="hero">
        <div>
          <div class="eyebrow">NEW CAMPAIGN</div>
          <h1>MARKET<br><span>SHIFT</span></h1>
          <p class="tagline">Read the market. <em>Build the advantage.</em></p>
          <p class="lead">A competitive chip-business simulation where the smartest market choice can matter more than the biggest production run.</p>
          <div class="actions" style="justify-content:flex-start">
            <button class="primary-btn" id="start-btn">START ROUND ▶</button>
            <button class="secondary-btn" id="how-btn">HOW TO PLAY</button>
          </div>
          <p class="note" style="margin-top:14px">SESSION SETUP  •  ${E.TEAM_COUNT} TEAMS  •  ${E.ROUNDS} ROUNDS  •  YOU ARE TEAM ${E.PLAYER_ID}</p>
        </div>
        <div class="panel network">
          <div class="label">MARKET INTELLIGENCE NETWORK</div>
          <div style="font-weight:700;margin:4px 0 0">One chip business.<br>Multiple markets.</div>
          ${svg}
        </div>
      </div>
      <div class="label" style="margin-top:22px">YOUR ROUND STARTS HERE</div>
      <div class="loop">
        <div><b>01</b><span>SCAN</span><p>Compare six markets on demand, price pressure and rivals.</p></div>
        <div><b>02</b><span>DEVELOP</span><p>Pick the chip family that fits your target market.</p></div>
        <div><b>03</b><span>COMPETE</span><p>Buy one report, set price, marketing and production.</p></div>
        <div><b>04</b><span>REVIEW</span><p>Compare profit and predictions with your rivals.</p></div>
      </div>`;
  }

  // ---------- SCAN ----------
  function meter(label, lvl, warn) {
    return `<div class="meter"><div class="label">${label}</div><b>${LEVEL[lvl]}</b><div class="bars l${lvl}${warn ? ' warn' : ''}"><i></i><i></i><i></i></div></div>`;
  }

  function renderScan() {
    const ev = G.events[G.round - 1];
    const p = player();
    const cards = E.MARKETS.map(m => {
      const s = G.signals[m.id];
      const c = cond(m.id);
      const badges = [];
      if (p.market === m.id) badges.push('<span class="badge cur">Current market</span>');
      if (c.event) badges.push(`<span class="badge">${c.event}</span>`);
      return `
        <button class="card${draft.market === m.id ? ' selected' : ''}" data-market="${m.id}" type="button">
          <span class="tag">${m.tag}</span>
          <span class="code">${m.code}</span>
          <h3>${m.name}</h3>
          <div class="sub">${m.sub}</div>
          ${badges.join(' ')}
          <div class="meters">
            ${meter('Demand', s.demand)}
            ${meter('Price press.', s.pressure, true)}
            ${meter('Rival act.', s.rivals, true)}
          </div>
        </button>`;
    }).join('');

    return `
      <div class="eyebrow">01 / MARKET SCAN</div>
      <h1 class="title">Choose your market</h1>
      <p class="lead">Compare demand, price pressure and rival activity before committing your focus. These free signals are rough estimates. Buy a report in the Compete step for hard numbers.</p>
      ${ev ? `<div class="event-banner"><b>MARKET NEWS</b><span><strong>${ev.title}.</strong> ${ev.text}</span></div>` : ''}
      <div class="panel-head"><div class="label">ROUND ${pad(G.round)} MARKET BOARD</div><div class="note">SYNTHETIC ROUND ${pad(G.round)} SIGNALS  •  ILLUSTRATIVE ONLY</div></div>
      <div class="grid markets">${cards}</div>
      <div class="selected-bar" id="sel-bar">${selectedBar()}</div>`;
  }

  function selectedBar() {
    const p = player();
    if (!draft.market) return `<div><div class="label">SELECTED MARKET</div><h3>None yet</h3><p>Click a market card to set your focus for this round.</p></div><button class="primary-btn" disabled>CONTINUE TO CHIP LAB →</button>`;
    const s = G.signals[draft.market];
    const switching = p.market && p.market !== draft.market;
    return `
      <div>
        <div class="label">SELECTED MARKET</div>
        <h3>${mName(draft.market)}</h3>
        <p>${LEVEL[s.demand].toLowerCase()} simulated demand  •  ${LEVEL[s.pressure].toLowerCase()} price pressure  •  ${LEVEL[s.rivals].toLowerCase()} rival activity</p>
        ${switching ? `<p class="warn">Switching from ${mName(p.market)} costs a $0.30M penalty${p.upgrade ? ' and your chip upgrade is lost' : ''}. You also lose your loyal customers there.</p>` : p.market ? '<p class="good">Staying put: no penalty, and your loyal customers stay with you.</p>' : ''}
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
    const keeps = p.upgrade && p.upgrade.market === draft.market && p.upgrade.chip === draft.chip;
    const loses = p.upgrade && !keeps;
    const status = keeps ? `<p class="good">Active upgrade: ${cName(p.upgrade.chip)} tuned for ${mName(p.upgrade.market)} (+35% customer appeal).</p>`
      : loses ? `<p class="warn">Your upgrade for ${cName(p.upgrade.chip)} in ${mName(p.upgrade.market)} will be lost with this choice.</p>` : '';
    if (isResearchRound()) {
      return `
        <div class="research${draft.upgrade ? ' on' : ''}">
          <div>
            <div class="label">RESEARCH POINT AVAILABLE</div>
            <div style="font-weight:700;margin:2px 0">Upgrade ${cName(draft.chip)} for ${mName(draft.market)}</div>
            <div class="sub" style="color:var(--muted2);font-size:13px">More likely to be bought in that market (+35% appeal). The upgrade is lost if you later switch market or chip family.</div>
            ${status}
          </div>
          <label class="toggle"><input type="checkbox" id="upgrade" ${draft.upgrade ? 'checked' : ''}> USE RESEARCH POINT</label>
        </div>`;
    }
    const next = E.RESEARCH_ROUNDS.find(r => r > G.round);
    return `<div class="research"><div><div class="label">RESEARCH POINT</div><div class="sub" style="color:var(--muted2);font-size:13px">${next ? 'Next research point arrives in round ' + next + '.' : 'No research points left this campaign.'}</div>${status}</div></div>`;
  }

  // ---------- COMPETE ----------
  function refPriceHint() {
    const avg = E.lastAvgPrice(G, draft.market);
    return avg ? { price: avg, text: 'Market average last round: $ ' + avg } : { price: Math.round(cond(draft.market).ref), text: 'No sales history yet. Typical asking price is about $ ' + Math.round(cond(draft.market).ref * (0.9 + 0.2 * Math.random())) };
  }

  function renderCompete() {
    const hint = refPriceHint();
    if (draft.price == null || draft._priceMarket !== draft.market) { draft.price = hint.price; draft._priceMarket = draft.market; }
    draft._hint = draft._hint && draft._hintMarket === draft.market ? draft._hint : hint.text;
    draft._hintMarket = draft.market;

    const reports = REPORTS.map(r => {
      const bought = draft.report === r.id;
      return `<button class="report-btn${bought ? ' bought' : ''}" data-report="${r.id}" type="button" ${draft.report && !bought ? 'disabled' : ''}>
        <div><b>${r.name}</b><span>${r.desc}</span></div><em>${bought ? 'PURCHASED' : 'BUY $0.05M'}</em></button>`;
    }).join('');

    return `
      <div class="eyebrow">03 / COMPETE</div>
      <h1 class="title">Set your price and predict</h1>
      <p class="lead">Buy up to one report, set your price and marketing budget to outbid rivals, then predict your sales. Your prediction is your production run.</p>
      <div class="ctx">MARKET FOCUS: ${mName(draft.market).toUpperCase()}  •  CHIP: ${cName(draft.chip).toUpperCase()}${draft.upgrade || (player().upgrade && player().upgrade.market === draft.market && player().upgrade.chip === draft.chip) ? '  •  UPGRADED' : ''}<a id="back-lab">change chip</a><a id="back-scan2">change market</a></div>
      <div class="compete">
        <div class="panel">
          <div class="panel-head"><div class="label">MARKET REPORT</div><div class="note">BUY UP TO ONE REPORT THIS ROUND  •  COST $ 0.05M</div></div>
          <div class="reports">${reports}</div>
          <div id="report-out">${reportOut()}</div>
          <div class="rule">
            <b>MARKET RULE</b><br>
            Changing market next round costs a $ 0.30M penalty, and upgrades made for this market lose their value.<br>
            <span style="color:var(--muted2)">Committing to a market is a strategic choice, not a free pivot.</span>
          </div>
        </div>
        <div class="panel">
          <div class="label">YOUR DECISION</div>
          <div class="field">
            <div class="field-top"><span class="label">Price per chip</span><span class="big" id="v-price"></span></div>
            <input type="range" id="price" min="25" max="120" step="1" value="${draft.price}">
            <div class="hint">${draft._hint}  •  higher price = higher margin, fewer buyers  •  <span id="v-margin"></span></div>
          </div>
          <div class="field">
            <div class="field-top"><span class="label">Marketing budget</span><span class="big" id="v-mk"></span></div>
            <input type="range" id="mk" min="0" max="0.5" step="0.01" value="${draft.marketing / 1e6}">
            <div class="hint">Helps win customers, especially when entering a new market. Returns diminish.</div>
          </div>
          <div class="field">
            <div class="field-top"><span class="label">Sales prediction = production run</span><span class="big" id="v-pred"></span></div>
            <input type="range" id="pred" min="0" max="${E.CAP}" step="1000" value="${draft.prediction}">
            <div class="hint">Max ${units(E.CAP)} chips per team per market. You pay $${E.UNIT_COST} for every chip produced, sold or not. You can't sell more than you produce.</div>
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
    return `<div class="report-out"><div class="label">REPORT: ${d.title.toUpperCase()}${d.forMarket ? ' • ' + mName(d.forMarket).toUpperCase() : ''}</div><p>${d.headline}</p>${extra}${d.detail ? `<p style="color:var(--muted2);font-size:13px">${d.detail}</p>` : ''}<p class="lim">Limitation: ${d.limitation}</p></div>`;
  }

  function projectedCosts() {
    const p = player();
    const switching = p.market && p.market !== draft.market;
    return {
      production: draft.prediction * E.UNIT_COST,
      development: E.DEV_COST,
      marketing: draft.marketing,
      report: draft.report ? E.REPORT_COST : 0,
      penalty: switching ? E.SWITCH_PENALTY : 0,
    };
  }

  function updateCompete() {
    $('#v-price').textContent = '$ ' + draft.price;
    $('#v-mk').textContent = money(draft.marketing);
    $('#v-pred').textContent = units(draft.prediction) + ' chips';
    const margin = draft.price - E.UNIT_COST;
    $('#v-margin').textContent = 'margin $' + margin + '/chip';
    const c = projectedCosts();
    const total = Object.values(c).reduce((a, b) => a + b, 0);
    const rev = draft.prediction * draft.price;
    const fixed = total - c.production;
    const be = margin > 0 ? Math.ceil((fixed + c.production) / draft.price) : Infinity;
    $('#costs').innerHTML = `
      <tr><td>Production (${units(draft.prediction)} × $${E.UNIT_COST})</td><td>${money(c.production)}</td></tr>
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
    const W = 420, H = 200, padL = 10, padB = 26, top = 22;
    const vals = [0, 1, 2, 3].map(i => (rows[i] ? rows[i].profit : null));
    const max = Math.max(0.5e6, ...vals.filter(v => v != null).map(Math.abs));
    const hasNeg = vals.some(v => v != null && v < 0);
    const zeroY = hasNeg ? top + (H - top - padB) / 2 : H - padB;
    const scale = (hasNeg ? (H - top - padB) / 2 : H - top - padB) / max;
    const bw = 56, gap = (W - padL * 2 - bw * 4) / 3;
    const bars = vals.map((v, i) => {
      const x = padL + i * (bw + gap);
      const label = `<text x="${x + bw / 2}" y="${H - 6}" text-anchor="middle" fill="#91A9B8" font-size="11" letter-spacing="1">R${i + 1}</text>`;
      if (v == null) return `<rect x="${x}" y="${zeroY - 3}" width="${bw}" height="3" fill="#294152"/>${label}`;
      const h = Math.max(2, Math.abs(v) * scale);
      const y = v >= 0 ? zeroY - h : zeroY;
      const col = v >= 0 ? (i === rows.length - 1 ? '#35D7E8' : '#26a9b6') : '#FF704A';
      return `<rect x="${x}" y="${y}" width="${bw}" height="${h}" rx="4" fill="${col}"><animate attributeName="height" from="0" to="${h}" dur=".5s"/></rect>
        <text x="${x + bw / 2}" y="${v >= 0 ? y - 6 : y + h + 13}" text-anchor="middle" fill="#F4F8FB" font-size="11.5" font-weight="700">${money(v).replace('$ ', '$')}</text>${label}`;
    }).join('');
    return `<svg viewBox="0 0 ${W} ${H}"><line x1="0" x2="${W}" y1="${zeroY}" y2="${zeroY}" stroke="#34566B"/>${bars}</svg>`;
  }

  function insights(me, entry) {
    const out = [];
    const rivals = entry.results.filter(r => r.market === me.market && !r.isPlayer);
    if (!rivals.length) out.push(`You had ${mName(me.market)} to yourself this round. Uncontested markets let you charge more.`);
    else {
      const avg = Math.round(rivals.reduce((s, r) => s + r.price, 0) / rivals.length);
      out.push(`${rivals.length} rival team${rivals.length > 1 ? 's' : ''} shared ${mName(me.market)} with you. Their average price was $${avg}; yours was $${me.price}.`);
    }
    if (me.unmet >= 1000) out.push(`Customers wanted about ${units(me.unmet)} more chips than you produced. That is roughly ${money(me.unmet * me.price)} of revenue left on the table.`);
    if (me.unsold >= 1000) out.push(`${units(me.unsold)} chips went unsold, wasting ${money(me.unsold * E.UNIT_COST)} of production.`);
    if (me.switched) out.push(`Switching markets cost you a ${money(E.SWITCH_PENALTY)} penalty.`);
    if (me.upgraded) out.push(`Your chip upgrade gave you an edge in ${mName(me.market)}.`);
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

    return `
      <div class="eyebrow">04 / REVIEW</div>
      <h1 class="title">Track your performance</h1>
      <p class="lead">Review revenue, costs and profit to understand whether your market strategy is paying off.</p>
      <div class="panel-head"><div class="label">ROUND ${pad(entry.round)} SNAPSHOT${entry.event ? '  •  ' + entry.event.title.toUpperCase() : ''}</div><div class="note">ILLUSTRATIVE GAME DATA</div></div>
      <div class="tiles">
        <div class="panel tile"><div class="label">Revenue</div><div class="val">${money(me.revenue)}</div><div class="sub">${units(me.sold)} chips × $${me.price} in ${mName(me.market)}</div></div>
        <div class="panel tile"><div class="label">Operating costs</div><div class="val">${money(me.totalCost)}</div><div class="sub">Production ${money(me.costs.production)} • Dev ${money(me.costs.development)} • Mkt ${money(me.costs.marketing)}${me.costs.report ? ' • Report ' + money(me.costs.report) : ''}${me.costs.penalty ? ' • <span class="warn">Penalty ' + money(me.costs.penalty) + '</span>' : ''}</div></div>
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
          <div class="sub" style="text-align:center;color:var(--muted);font-size:12px;margin-top:6px">Real customer demand for your chips: ${units(me.demand)}${me.demand > E.CAP ? ' (above the 60k cap)' : ''}</div>
          <ul class="insights">${insights(me, entry).map(x => `<li>${x}</li>`).join('')}</ul>
        </div>
      </div>
      <div class="panel" style="margin-top:14px">
        <div class="panel-head"><div class="label">Competitor results</div><div class="note">YOUR MARKET FIRST</div></div>
        <div style="overflow-x:auto"><table class="results">
          <thead><tr><th>Team</th><th>Market</th><th>Chip</th><th class="num">Price</th><th class="num">Marketing</th><th class="num">Sold</th><th class="num">Round profit</th><th class="num">Total</th></tr></thead>
          <tbody>${rows.map(r => `<tr class="${r.isPlayer ? 'me' : r.market === me.market ? 'same' : ''}">
            <td>${r.name}</td><td>${mName(r.market)}${r.switched ? ' <span class="warn" title="Switched market">↺</span>' : ''}</td><td>${r.chip}${r.upgraded ? '+' : ''}</td>
            <td class="num">$ ${r.price}</td><td class="num">${money(r.marketing)}</td>
            <td class="num">${units(r.sold)}${r.sold >= E.CAP ? ' (max)' : ''}</td>
            <td class="num ${r.profit < 0 ? 'bad' : ''}">${money(r.profit)}</td>
            <td class="num">${money(G.teams.find(t => t.id === r.team).rounds.slice(0, entry.round).reduce((s, x) => s + x.profit, 0))}</td></tr>`).join('')}</tbody>
        </table></div>
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
    const best = rounds.reduce((b, r, i) => (r.profit > rounds[b].profit ? i : b), 0);
    const worst = rounds.reduce((b, r, i) => (r.profit < rounds[b].profit ? i : b), 0);
    const reports = rounds.filter(r => r.costs.report).length;
    const verdict = me.rank === 1 ? 'You won the campaign!' : me.rank <= 3 ? 'A podium finish.' : 'The market got the better of you this time.';

    const lessons = [];
    lessons.push(`Your average prediction gap was ${avgGap}%. ${avgGap <= 10 ? 'Sharp forecasting kept waste low.' : 'Better forecasts mean less wasted production and fewer missed sales.'}`);
    lessons.push(switches ? `You switched market ${switches} time${switches > 1 ? 's' : ''}, paying ${money(switches * E.SWITCH_PENALTY)} in penalties.` : 'You never paid a switching penalty. Commitment built customer loyalty.');
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
          <table class="results">
            <thead><tr><th></th><th>Team</th><th>Strategy</th><th>Markets R1→R4</th><th class="num">Cumulative profit</th></tr></thead>
            <tbody>${st.map(s => `<tr class="${s.isPlayer ? 'me' : ''}"><td><span class="medal m${s.rank}">${s.rank}</span></td><td>${s.name}</td><td>${s.persona || 'You'}</td>
              <td>${s.rounds.map(r => E.marketById(r.market).code).join(' → ')}</td><td class="num">${money(s.profit)}</td></tr>`).join('')}</tbody>
          </table>
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
          b.querySelector('em').textContent = mine ? 'PURCHASED' : 'BUY $0.05M';
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

  $('#help-btn').onclick = () => $('#help').showModal();
  newGame();
})();
