import { state, setState, subscribe } from './exchange-modules/state.js';
import { calculateExchangeMetrics } from './exchange-modules/calculations.js';
import { validateField, updateFieldError, updateValidationSummary, hasErrors } from './exchange-modules/validation.js';
import { $, listen, debounce, formatCurrency, formatPercentage, announceToScreenReader } from './exchange-modules/utils.js';

function init() {
  setupInputListeners();
  setupViewToggle();
  setupSkipLinks();
  subscribe(handleStateChange);
  updateCalculations();
  applyViewportMode();

  // Re-evaluate on resize (debounced)
  window.addEventListener('resize', debounce(applyViewportMode, 200));
  
  if (window.MathJax) {
    window.MathJax.Hub.Queue(["Typeset", window.MathJax.Hub], function() {
      const spans = document.querySelectorAll('.MathJax');
      spans.forEach(function(span) {
        span.setAttribute('role', 'math');
        span.removeAttribute('tabindex');
      });
    });
  }
  
  runSelfTests();
}

function setupSkipLinks() {
  const skipToTableLink = document.querySelector('a[href="#table-view"]');
  if (skipToTableLink) {
    listen(skipToTableLink, 'click', (e) => {
      e.preventDefault();
      const tableBtn = $('#view-table-btn');
      if (tableBtn) {
        if (tableBtn.classList.contains('active')) {
          tableBtn.focus();
          const tableView = $('#table-view');
          if (tableView) tableView.scrollIntoView({ behavior: 'smooth', block: 'center' });
        } else {
          tableBtn.click();
          setTimeout(() => { tableBtn.focus(); }, 100);
        }
      }
    });
  }
}

const NARROW_BREAKPOINT = 600;

function isNarrow() {
  return window.innerWidth < NARROW_BREAKPOINT;
}

function applyViewportMode() {
  const chartBtn = $('#view-chart-btn');
  const tableBtn = $('#view-table-btn');
  if (!chartBtn || !tableBtn) return;

  if (isNarrow()) {
    chartBtn.disabled = true;
    chartBtn.setAttribute('aria-disabled', 'true');
    chartBtn.title = 'Chart not available at this screen width — use the Table view';
    switchToTableView();
  } else {
    chartBtn.disabled = false;
    chartBtn.removeAttribute('aria-disabled');
    chartBtn.title = '';
    tableBtn.disabled = false;
    tableBtn.removeAttribute('aria-disabled');
    tableBtn.title = '';
    // Re-render chart if it's currently visible, so plugin labels reposition correctly
    if (state.exchangeCalculations && $('#chart-view').style.display !== 'none') {
      renderChart(state.exchangeCalculations, state);
    }
  }
}

function switchToChartView() {
  if (isNarrow()) return;
  const chartBtn = $('#view-chart-btn');
  const tableBtn = $('#view-table-btn');
  const chartView = $('#chart-view');
  const tableView = $('#table-view');
  if (!chartView || !tableView || !chartBtn || !tableBtn) return;
  chartView.style.display = 'block';
  tableView.style.display = 'none';
  const legendSection = $('#chart-legend') && $('#chart-legend').closest('section');
  if (legendSection) legendSection.style.display = 'block';
  chartBtn.classList.add('active');
  chartBtn.setAttribute('aria-pressed', 'true');
  tableBtn.classList.remove('active');
  tableBtn.setAttribute('aria-pressed', 'false');
  announceToScreenReader('Chart view active');
}

function switchToTableView() {
  const chartBtn = $('#view-chart-btn');
  const tableBtn = $('#view-table-btn');
  const chartView = $('#chart-view');
  const tableView = $('#table-view');
  if (!chartView || !tableView || !chartBtn || !tableBtn) return;
  chartView.style.display = 'none';
  tableView.style.display = 'block';
  const legendSection = $('#chart-legend') && $('#chart-legend').closest('section');
  if (legendSection) legendSection.style.display = 'none';
  chartBtn.classList.remove('active');
  chartBtn.setAttribute('aria-pressed', 'false');
  tableBtn.classList.add('active');
  tableBtn.setAttribute('aria-pressed', 'true');
  announceToScreenReader('Table view active');
  renderTable(state.exchangeCalculations, state);
}

function setupViewToggle() {
  const chartBtn = $('#view-chart-btn');
  const tableBtn = $('#view-table-btn');
  if (!chartBtn || !tableBtn) return;
  listen(chartBtn, 'click', () => { if (!isNarrow()) { switchToChartView(); chartBtn.focus(); } });
  listen(tableBtn, 'click', () => { switchToTableView(); tableBtn.focus(); });
  listen(chartBtn, 'keydown', (e) => {
    if (e.key === 'ArrowRight') { e.preventDefault(); switchToTableView(); tableBtn.focus(); }
  });
  listen(tableBtn, 'keydown', (e) => {
    if (e.key === 'ArrowLeft') { e.preventDefault(); switchToChartView(); chartBtn.focus(); }
  });
}

function setupInputListeners() {
  const inputs = [
    { id: 'spot-rate',     field: 'spotRate',     decimals: 2 },
    { id: 'domestic-rate', field: 'domesticRate',  decimals: 1 },
    { id: 'foreign-rate',  field: 'foreignRate',   decimals: 1 }
  ];
  
  inputs.forEach(({ id, field, decimals }) => {
    const input = $(`#${id}`);
    if (!input) return;
    
    const debouncedUpdate = debounce(() => {
      let value = parseFloat(input.value);
      value = Math.round(value * Math.pow(10, decimals)) / Math.pow(10, decimals);
      input.value = value.toFixed(decimals);
      
      const error = validateField(field, value);
      updateFieldError(id, error);
      const errors = { ...state.errors };
      if (error) { errors[field] = error; } else { delete errors[field]; }
      setState({ [field]: value, errors });
      updateValidationSummary(errors);
      if (!hasErrors(errors)) updateCalculations();
    }, 300);
    
    listen(input, 'input', debouncedUpdate);
    listen(input, 'change', debouncedUpdate);
  });
}

function updateCalculations() {
  const { spotRate, domesticRate, foreignRate, errors } = state;
  if (hasErrors(errors)) { setState({ exchangeCalculations: null }); return; }
  try {
    const calculations = calculateExchangeMetrics({ spotRate, domesticRate, foreignRate });
    setState({ exchangeCalculations: calculations });
  } catch (error) {
    console.error('Calculation error:', error);
    setState({ exchangeCalculations: null });
  }
}

function handleStateChange(newState) {
  const { exchangeCalculations } = newState;
  if (!exchangeCalculations) return;
  renderResults(exchangeCalculations, newState);
  renderDynamicEquation(exchangeCalculations, newState);
  renderChart(exchangeCalculations, newState);
}

// ── Results ──────────────────────────────────────────────────────────────────
function renderResults(calc, params) {
  const container = $('#results-content');
  if (!container) return;
  
  // item 8: Announce only the key result to screen readers via persistent live region
  const liveRegion = $('#results-live');
  if (liveRegion) {
    liveRegion.textContent = `Implied forward exchange rate: ${calc.forwardRate.toFixed(4)}`;
  }
  
  // item 11: @ replaced with "at"
  // item 15: no space between USD and number (formatCurrency now returns "USD1,234.56")
  // item 16: "Result" removed from the purple card title
  container.innerHTML = `
    <div class="result-box forward-exchange">
      <h3 class="result-title forward-exchange">Implied Forward Exchange Rate</h3>
      <div class="result-value" style="color: #50037f;">${calc.forwardRate.toFixed(4)}</div>
    </div>
    
    <div class="result-box domestic-strategy">
      <h3 class="result-title" style="color: #5a20cc;">Domestic Investment Strategy</h3>
      <div class="strategy-details">
        <div style="color: #1f2937;">Invest USD1,000 at ${formatPercentage(params.domesticRate)}</div>
        <div style="font-weight: 600; padding-top: 0.5rem; border-top: 1px solid #e9d5ff; margin-top: 0.5rem; color: #1f2937;">
          Final: ${formatCurrency(calc.domesticEndingValue)}
        </div>
      </div>
    </div>
    
    <div class="result-box foreign-strategy">
      <h3 class="result-title" style="color: #8b4513;">Foreign Investment Strategy</h3>
      <div class="strategy-details">
        <div style="color: #1f2937;">Convert &rarr; invest at ${formatPercentage(params.foreignRate)} &rarr; convert back</div>
        <div style="font-size: 0.75rem; color: #4b5563; margin-top: 0.25rem;">
          Foreign: ${calc.foreignCurrencyAmount.toFixed(2)} at ${formatPercentage(params.foreignRate)} = ${calc.foreignEndingValue.toFixed(2)}
        </div>
        <div style="font-weight: 600; padding-top: 0.5rem; border-top: 1px solid #fed7aa; margin-top: 0.5rem; color: #1f2937;">
          Final: ${formatCurrency(calc.domesticEquivalent)}
        </div>
      </div>
    </div>
  `;
}

// ── Dynamic Equation ──────────────────────────────────────────────────────────
function renderDynamicEquation(calc, params) {
  const container = $('#dynamic-mathml-equation');
  const srDescription = $('#equation-sr-description');
  if (!container) return;
  
  const rd = (params.domesticRate / 100).toFixed(3);
  const rf = (params.foreignRate / 100).toFixed(3);
  
  if (srDescription) {
    srDescription.textContent = `Forward rate equals spot rate ${params.spotRate.toFixed(4)} times e to the power of foreign rate ${rf} minus domestic rate ${rd}, which equals ${calc.forwardRate.toFixed(4)}`;
  }
  
  // Lock height and hide — prevents both layout jump and LaTeX flash
  const currentHeight = container.offsetHeight;
  container.style.height = `${currentHeight}px`;
  container.style.visibility = 'hidden';

  container.innerHTML = `
    <div style="font-size: 1.25rem; padding: 0.5rem; text-align: center;">
      $$\\color{#50037f}{F_{0,f/d}} = \\color{#0079a6}{${params.spotRate.toFixed(4)}} \\times e^{(\\color{#ea792d}{${rf}} - \\color{#7a46ff}{${rd}})} = \\color{#50037f}{${calc.forwardRate.toFixed(4)}}$$
    </div>
  `;
  
  if (window.MathJax) {
    window.MathJax.Hub.Queue(["Typeset", window.MathJax.Hub, container], function() {
      const spans = container.querySelectorAll('.MathJax');
      spans.forEach(function(span) {
        span.setAttribute('role', 'math');
        span.removeAttribute('tabindex');
      });
      // Update section aria-label so SR users hear the result on first load
      // and after every recalculation — no input change needed
      const equationCard = $('#equation-card');
      if (equationCard) {
        equationCard.setAttribute('aria-label',
          `Implied forward exchange rate equation. ` +
          `Forward rate equals spot rate ${params.spotRate.toFixed(4)} ` +
          `times e to the power of foreign rate ${rf} minus domestic rate ${rd}. ` +
          `Result: ${calc.forwardRate.toFixed(4)}`
        );
      }
      // Release fixed height then reveal
      container.style.height = '';
      container.style.visibility = 'visible';
    });
  } else {
    container.style.height = '';
    container.style.visibility = 'visible';
  }
}

// ── Table ─────────────────────────────────────────────────────────────────────
// item 17: single-letter variables italicised in table body
function renderTable(calc, params) {
  const tableBody = $('#table-body');
  if (!tableBody || !calc) return;
  
  tableBody.innerHTML = `
    <tr>
      <th scope="row">Exchange Rate</th>
      <td><span style="color: #0079a6; font-weight: 600;"><em>S</em>:</span> ${params.spotRate.toFixed(4)}</td>
      <td><span style="color: #50037f; font-weight: 600;"><em>F</em>:</span> ${calc.forwardRate.toFixed(4)}</td>
    </tr>
    <tr>
      <th scope="row">Domestic Interest Rate</th>
      <td colspan="2"><span style="color: #5a20cc; font-weight: 600;"><em>r</em><sub><em>d</em></sub>:</span> ${formatPercentage(params.domesticRate)}</td>
    </tr>
    <tr>
      <th scope="row">Foreign Interest Rate</th>
      <td colspan="2"><span style="color: #8b4513; font-weight: 600;"><em>r</em><sub><em>f</em></sub>:</span> ${formatPercentage(params.foreignRate)}</td>
    </tr>
    <tr>
      <th scope="row">Domestic Investment (USD)</th>
      <td>1,000.00</td>
      <td>${formatCurrency(calc.domesticEndingValue, false, false)}</td>
    </tr>
    <tr>
      <th scope="row">Foreign Investment (USD)</th>
      <td>1,000.00</td>
      <td>${formatCurrency(calc.domesticEquivalent, false, false)}</td>
    </tr>
  `;
}

// ── Chart ─────────────────────────────────────────────────────────────────────
// items 12-14: narrower bars at t=0 and t=1 with a blank middle category;
//              domestic and foreign lines pass between them; labels no longer overlap.
// item 6: prefers-reduced-motion disables chart animation.
// Chart.js font changes: all scale fonts updated to size 13, system-font family, weight 600.
function renderChart(calc, params) {
  const canvas = $('#exchange-chart');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  
  if (window.exchangeChart) window.exchangeChart.destroy();
  
  if (window.ChartDataLabels && !Chart.registry.plugins.get('datalabels')) {
    Chart.register(window.ChartDataLabels);
  }
  
  // item 6: respect prefers-reduced-motion (Chart.js 4 — use { duration: 0 }, not false)
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  
  const systemFont = "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif";
  
  const rd = params.domesticRate;
  const rf = params.foreignRate;
  const minRate = Math.min(rd, rf);
  const maxRate = Math.max(rd, rf);
  // Generous padding so line labels have headroom above/below chart area
  const ratePadding = Math.max((maxRate - minRate) * 0.8, 2.0);
  
  const minEx = Math.min(params.spotRate, calc.forwardRate);
  const maxEx = Math.max(params.spotRate, calc.forwardRate);
  const exPadding = Math.max((maxEx - minEx) * 0.5, 0.15);

  // Round axis maxima up to a clean number so the top tick is never a strange decimal
  function niceMax(rawMax, step) {
    return Math.ceil(rawMax / step) * step;
  }
  const exMax   = niceMax(maxEx   + exPadding,   0.05);
  const rateMax = niceMax(maxRate + ratePadding,  0.5);
  
  // Custom plugin: draws rate lines exactly from the right edge of the spot bar
  // to the left edge of the forward bar, with labels at each end.
  // This avoids Chart.js snapping line endpoints to bar centres.
  const rateLinesPlugin = {
    id: 'rateLines',
    afterDatasetsDraw(chart) {
      const { ctx } = chart;
      const yScale = chart.scales['y-rate'];
      const meta0 = chart.getDatasetMeta(0); // bar dataset
      if (!meta0.data[0] || !meta0.data[2]) return;

      const bar0 = meta0.data[0];
      const bar2 = meta0.data[2];
      const gap = 6; // px gap between line end and bar edge
      const x1 = bar0.x + (bar0.width / 2) + gap;  // right edge of spot bar
      const x2 = bar2.x - (bar2.width / 2) - gap;  // left edge of forward bar
      const midX = (x1 + x2) / 2;

      const rdY = yScale.getPixelForValue(rd);
      const rfY = yScale.getPixelForValue(rf);

      // How many px apart are the two lines? Used to decide label stacking
      const lineSep = Math.abs(rdY - rfY);
      const labelHeight = 20; // approximate px height of a label pill
      const tooClose = lineSep < labelHeight * 2.2;

      ctx.save();

      // ── Draw domestic line ──
      ctx.beginPath();
      ctx.moveTo(x1, rdY);
      ctx.lineTo(x2, rdY);
      ctx.strokeStyle = '#7a46ff';
      ctx.lineWidth = 2.5;
      ctx.stroke();

      // Small dot at each end
      ctx.beginPath();
      ctx.arc(x1, rdY, 4, 0, Math.PI * 2);
      ctx.arc(x2, rdY, 4, 0, Math.PI * 2);
      ctx.fillStyle = '#7a46ff';
      ctx.fill();

      // ── Draw foreign line ──
      ctx.beginPath();
      ctx.moveTo(x1, rfY);
      ctx.lineTo(x2, rfY);
      ctx.strokeStyle = '#ea792d';
      ctx.lineWidth = 2.5;
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(x1, rfY, 4, 0, Math.PI * 2);
      ctx.arc(x2, rfY, 4, 0, Math.PI * 2);
      ctx.fillStyle = '#ea792d';
      ctx.fill();

      // ── Draw labels ──
      // Domestic label: always left-of-centre, above its line.
      // Foreign label: always right-of-centre, below its line.
      // When lines are very close, add extra vertical offset so pills don't touch.
      const extraOffset = tooClose ? (labelHeight * 1.2 - lineSep / 2) : 0;

      drawRateLabel(ctx, 'd', rd, x1, rdY, 'above', 0, '#5a20cc', '#7a46ff', systemFont, 'left');
      drawRateLabel(ctx, 'f', rf, x2, rfY, 'below', 0, '#8b4513', '#ea792d', systemFont, 'right');

      ctx.restore();
    }
  };

  // Draws a rate label pill with a manually rendered subscript.
  // "r" is drawn at fontSize, then the subscript letter at subSize shifted down by subShift.
  function drawRateLabel(ctx, subLetter, value, x, lineY, side, extraOffset, textColor, borderColor, fontFamily, anchor = 'centre') {
    const pad = { h: 7, v: 3 };
    const fontSize = 11;
    const subSize  = 8;
    const subShift = 3; // px downward shift for subscript

    // Measure each piece to calculate total pill width
    ctx.font = `italic 700 ${fontSize}px ${fontFamily}`;
    const rW = ctx.measureText('r').width;
    ctx.font = `italic 700 ${subSize}px ${fontFamily}`;
    const subW = ctx.measureText(subLetter).width;
    ctx.font = `700 ${fontSize}px ${fontFamily}`;
    const valW = ctx.measureText(` = ${value.toFixed(2)}%`).width;

    const textW = rW + subW + valW;
    const boxW  = textW + pad.h * 2;
    const boxH  = fontSize + pad.v * 2;
    const baseOffset = 10;
    const yOffset = side === 'above'
      ? -(baseOffset + boxH + extraOffset)
      :  (baseOffset + extraOffset);

    let bx;
    if (anchor === 'left')       bx = x;
    else if (anchor === 'right') bx = x - boxW;
    else                         bx = x - boxW / 2;

    const by      = lineY + yOffset;
    const textY   = by + boxH / 2;  // vertical centre of pill
    let   cursor  = bx + pad.h;     // current x drawing position

    // ── Draw pill background ──
    ctx.beginPath();
    ctx.roundRect(bx, by, boxW, boxH, 4);
    ctx.fillStyle = 'rgba(255,255,255,0.95)';
    ctx.fill();
    ctx.strokeStyle = borderColor;
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.textBaseline = 'middle';
    ctx.fillStyle = textColor;

    // ── "r" italic ──
    ctx.font = `italic 700 ${fontSize}px ${fontFamily}`;
    ctx.textAlign = 'left';
    ctx.fillText('r', cursor, textY);
    cursor += rW;

    // ── subscript letter italic, shifted down ──
    ctx.font = `italic 700 ${subSize}px ${fontFamily}`;
    ctx.fillText(subLetter, cursor, textY + subShift);
    cursor += subW;

    // ── " = value%" normal weight ──
    ctx.font = `700 ${fontSize}px ${fontFamily}`;
    ctx.fillText(` = ${value.toFixed(2)}%`, cursor, textY);
  }

  window.exchangeChart = new Chart(ctx, {
    type: 'bar',
    plugins: [rateLinesPlugin],
    data: {
      // Three x-axis positions: bars at 0 and 2, lines pass through middle gap (1)
      labels: ['t\u2009=\u20090', '\u00a0', 't\u2009=\u20091'],
      datasets: [
        {
          // Single bar dataset — spot at index 0, forward at index 2; different colours per bar
          type: 'bar',
          label: 'Exchange rate',
          data: [params.spotRate, null, calc.forwardRate],
          backgroundColor: ['#0079a6', 'transparent', '#50037f'],
          borderColor: 'transparent',
          borderWidth: 0,
          yAxisID: 'y-exchange',
          order: 2,
          categoryPercentage: 0.25,
          barPercentage: 0.95,
          datalabels: {
            display: (context) => context.dataset.data[context.dataIndex] != null,
            anchor: 'end',
            align: 'end',
            offset: 4,
            formatter: (value, context) => {
              if (value == null) return null;
              const varName = context.dataIndex === 0 ? 'S' : 'F';
              return `${varName} = ${value.toFixed(4)}`;
            },
            color: (context) => context.dataIndex === 0 ? '#005f82' : '#3a0060',
            font: { weight: '700', size: 12, family: systemFont },
            backgroundColor: 'rgba(255,255,255,0.92)',
            borderRadius: 3,
            padding: { top: 3, bottom: 3, left: 5, right: 5 }
          }
        },
        {
          // Invisible domestic line — kept only so tooltips work on hover
          type: 'line',
          label: 'Domestic rate',
          data: [rd, rd, rd],
          borderColor: 'transparent',
          backgroundColor: 'transparent',
          borderWidth: 0,
          pointRadius: 0,
          pointHoverRadius: 6,
          pointHoverBackgroundColor: '#7a46ff',
          yAxisID: 'y-rate',
          order: 1,
          datalabels: { display: false }
        },
        {
          // Invisible foreign line — kept only so tooltips work on hover
          type: 'line',
          label: 'Foreign rate',
          data: [rf, rf, rf],
          borderColor: 'transparent',
          backgroundColor: 'transparent',
          borderWidth: 0,
          pointRadius: 0,
          pointHoverRadius: 6,
          pointHoverBackgroundColor: '#ea792d',
          yAxisID: 'y-rate',
          order: 1,
          datalabels: { display: false }
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      // item 6 + chart-font item 5: correct Chart.js 4 syntax for disabling animation
      animation: prefersReducedMotion ? { duration: 0 } : {},
      plugins: {
        legend: { display: false },
        datalabels: { display: false }, // default off; overridden per dataset above
        // item 17: tooltip labels use variable names; plain text only (no HTML in tooltips)
        tooltip: {
          callbacks: {
            label: (context) => {
              if (context.dataset.label === 'Exchange rate') {
                const label = context.dataIndex === 0 ? 'Spot rate (S)' : 'Forward rate (F)';
                return `${label}: ${context.parsed.y.toFixed(4)}`;
              }
              if (context.dataset.label === 'Domestic rate') {
                return `Domestic interest rate (r_d): ${context.parsed.y.toFixed(3)}%`;
              }
              if (context.dataset.label === 'Foreign rate') {
                return `Foreign interest rate (r_f): ${context.parsed.y.toFixed(3)}%`;
              }
              return `${context.dataset.label}: ${context.parsed.y}`;
            }
          }
        }
      },
      scales: {
        // Chart-font item 1: all scale fonts updated
        x: {
          ticks: {
            color: '#374151',
            font: { size: 13, weight: '600', family: systemFont }
          },
          grid: { color: '#e5e7eb' }
        },
        'y-exchange': {
          position: 'left',
          title: {
            display: true,
            text: 'Exchange rate',
            color: '#374151',
            font: { size: 13, weight: '600', family: systemFont }
          },
          min: Math.max(0, minEx - exPadding),
          max: exMax,
          ticks: {
            callback: (v) => v.toFixed(2),
            color: '#374151',
            font: { size: 13, weight: '600', family: systemFont }
          },
          grid: { drawOnChartArea: false }
        },
        'y-rate': {
          position: 'right',
          title: {
            display: true,
            text: 'Interest rate (%)',
            color: '#374151',
            font: { size: 13, weight: '600', family: systemFont }
          },
          min: Math.max(0, minRate - ratePadding),
          max: rateMax,
          ticks: {
            callback: (v) => v.toFixed(2),
            color: '#374151',
            font: { size: 13, weight: '600', family: systemFont }
          },
          grid: { color: '#e5e7eb' }
        }
      }
    }
  });
}

// ── Self-tests ────────────────────────────────────────────────────────────────
function runSelfTests() {
  const tests = [
    {
      name: 'Forward exchange calculation',
      inputs: { spotRate: 1.25, domesticRate: 2.5, foreignRate: 3.0 },
      expected: { forwardApprox: 1.2563 }
    }
  ];
  tests.forEach(test => {
    try {
      const result = calculateExchangeMetrics(test.inputs);
      if (test.expected.forwardApprox) {
        const diff = Math.abs(result.forwardRate - test.expected.forwardApprox);
        if (diff <= 0.001) {
          console.log(`✓ ${test.name} passed`);
        } else {
          console.warn(`✗ ${test.name} failed: expected ~${test.expected.forwardApprox}, got ${result.forwardRate.toFixed(4)}`);
        }
      }
    } catch (error) {
      console.error(`✗ ${test.name} threw error:`, error);
    }
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

export { state, setState, updateCalculations };