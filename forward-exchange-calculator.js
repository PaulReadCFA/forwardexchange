import { state, setState, subscribe } from './exchange-modules/state.js';
import { calculateExchangeMetrics } from './exchange-modules/calculations.js';
import { validateField, updateFieldError, updateValidationSummary, hasErrors } from './exchange-modules/validation.js';
import { $, listen, debounce, formatCurrency, formatPercentage } from './exchange-modules/utils.js';

function init() {
  console.log('Forward Exchange Rate Calculator initializing...');
  setupInputListeners();
  setupViewToggle();
  subscribe(handleStateChange);
  updateCalculations();
  runSelfTests();
  console.log('Forward Exchange Rate Calculator ready');
}

function setupViewToggle() {
  const chartBtn = $('#view-chart-btn');
  const tableBtn = $('#view-table-btn');
  const chartView = $('#chart-view');
  const tableView = $('#table-view');
  
  if (!chartBtn || !tableBtn || !chartView || !tableView) return;
  
  listen(chartBtn, 'click', () => {
    chartView.style.display = 'block';
    tableView.style.display = 'none';
    chartBtn.classList.add('active');
    tableBtn.classList.remove('active');
    chartBtn.setAttribute('aria-pressed', 'true');
    tableBtn.setAttribute('aria-pressed', 'false');
  });
  
  listen(tableBtn, 'click', () => {
    chartView.style.display = 'none';
    tableView.style.display = 'block';
    chartBtn.classList.remove('active');
    tableBtn.classList.add('active');
    chartBtn.setAttribute('aria-pressed', 'false');
    tableBtn.setAttribute('aria-pressed', 'true');
    renderTable(state.exchangeCalculations, state);
  });
}

function setupInputListeners() {
  const inputs = [
    { id: 'spot-rate', field: 'spotRate' },
    { id: 'domestic-rate', field: 'domesticRate' },
    { id: 'foreign-rate', field: 'foreignRate' }
  ];
  
  inputs.forEach(({ id, field }) => {
    const input = $(`#${id}`);
    if (!input) return;
    
    const debouncedUpdate = debounce(() => {
      const value = parseFloat(input.value);
      const error = validateField(field, value);
      updateFieldError(id, error);
      const errors = { ...state.errors };
      if (error) { errors[field] = error; } else { delete errors[field]; }
      setState({ [field]: value, errors });
      updateValidationSummary(errors);
      if (!hasErrors(errors)) { updateCalculations(); }
    }, 300);
    
    listen(input, 'input', debouncedUpdate);
    listen(input, 'change', debouncedUpdate);
  });
}

function updateCalculations() {
  const { spotRate, domesticRate, foreignRate, errors } = state;
  if (hasErrors(errors)) {
    setState({ exchangeCalculations: null });
    return;
  }
  
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

function renderResults(calc, params) {
  const container = $('#results-content');
  if (!container) return;
  
  container.innerHTML = `
    <div class="result-box forward-exchange">
      <h5 class="result-title forward-exchange">Forward Exchange Rate</h5>
      <div class="result-value" aria-live="polite">${calc.forwardRate.toFixed(4)}</div>
      <div class="result-description" style="font-size: 0.875rem; margin-top: 0.5rem;">
        No-arbitrage forward rate
      </div>
      <div style="margin-top: 0.75rem; padding-top: 0.75rem; border-top: 1px solid #e5e7eb; font-size: 0.75rem; color: #6b7280;">
        <div><strong>Formula:</strong> F = S × e<sup>(r<sub>f</sub> − r<sub>d</sub>)</sup></div>
        <div style="color: ${calc.noArbitrage ? '#15803d' : '#b91c1c'}; font-weight: 600; margin-top: 0.5rem;">
          ${calc.noArbitrage ? '✓ No arbitrage condition satisfied' : '⚠ Arbitrage difference: USD ' + calc.arbitrageDiff.toFixed(2)}
        </div>
      </div>
    </div>
    
    <div class="result-box domestic-strategy">
      <h5 class="result-title" style="color: #15803d; font-size: 1rem; font-weight: 600;">Domestic Investment</h5>
      <div class="strategy-details">
        <div>Invest USD 1,000 at ${formatPercentage(params.domesticRate)}</div>
        <div style="font-weight: 600; padding-top: 0.5rem; border-top: 1px solid #d1fae5; margin-top: 0.5rem;">
          Final: ${formatCurrency(calc.domesticEndingValue)}
        </div>
      </div>
    </div>
    
    <div class="result-box foreign-strategy">
      <h5 class="result-title" style="color: #7a46ff; font-size: 1rem; font-weight: 600;">Foreign Investment</h5>
      <div class="strategy-details">
        <div>Convert → invest at ${formatPercentage(params.foreignRate)} → convert back</div>
        <div style="font-size: 0.75rem; color: #9ca3af; margin-top: 0.25rem;">
          Foreign: ${calc.foreignCurrencyAmount.toFixed(2)} @ ${formatPercentage(params.foreignRate)} = ${calc.foreignEndingValue.toFixed(2)}
        </div>
        <div style="font-weight: 600; padding-top: 0.5rem; border-top: 1px solid #ede9fe; margin-top: 0.5rem;">
          Final: ${formatCurrency(calc.domesticEquivalent)}
        </div>
      </div>
    </div>
  `;
}

function renderDynamicEquation(calc, params) {
  const container = $('#dynamic-mathml-equation');
  if (!container) return;
  
  const rd = (params.domesticRate / 100).toFixed(5);
  const rf = (params.foreignRate / 100).toFixed(5);
  
  const mathML = `
    <math xmlns="http://www.w3.org/1998/Math/MathML" display="block">
      <mrow>
        <mi mathcolor="#50037f" mathvariant="bold">F</mi>
        <mo>=</mo>
        <mi mathcolor="#00bbff">S</mi>
        <mo>×</mo>
        <msup>
          <mi>e</mi>
          <mrow>
            <mo>(</mo>
            <msub><mi mathcolor="#ea792d">r</mi><mi>f</mi></msub>
            <mo>−</mo>
            <msub><mi mathcolor="#7a46ff">r</mi><mi>d</mi></msub>
            <mo>)</mo>
          </mrow>
        </msup>
      </mrow>
    </math>
    
    <div style="text-align: center; margin-top: 1rem; font-size: 0.875rem; color: #374151; font-family: monospace; background: #f3f4f6; padding: 0.75rem; border-radius: 0.375rem;">
      <div style="margin-bottom: 0.5rem;"><strong>Substituting values:</strong></div>
      <div style="color: #4b5563;">
        F = <span style="color: #00bbff; font-weight: 600;">${params.spotRate.toFixed(4)}</span> × e<sup>(<span style="color: #ea792d; font-weight: 600;">${rf}</span> − <span style="color: #7a46ff; font-weight: 600;">${rd}</span>)</sup>
      </div>
      <div style="margin-top: 0.5rem; color: #50037f; font-weight: 700; font-size: 1rem;">
        = ${calc.forwardRate.toFixed(4)}
      </div>
    </div>
    
    <div style="text-align: center; margin-top: 1rem; font-size: 0.8125rem; color: #6b7280;">
      <div><strong>Where:</strong></div>
      <div style="margin-top: 0.25rem;">
        <span style="color: #00bbff; font-weight: 600;">S = ${params.spotRate.toFixed(4)}</span> (spot rate),
        <span style="color: #ea792d; font-weight: 600;">r<sub>f</sub> = ${formatPercentage(params.foreignRate)}</span>,
        <span style="color: #7a46ff; font-weight: 600;">r<sub>d</sub> = ${formatPercentage(params.domesticRate)}</span>
      </div>
    </div>
  `;
  
  container.innerHTML = mathML;
}

function renderTable(calc, params) {
  const tableBody = $('#table-body');
  if (!tableBody || !calc) return;
  
  tableBody.innerHTML = `
    <tr>
      <th scope="row">Exchange Rate</th>
      <td>${params.spotRate.toFixed(4)}</td>
      <td>${calc.forwardRate.toFixed(4)}</td>
    </tr>
    <tr>
      <th scope="row">Domestic Rate</th>
      <td>${formatPercentage(params.domesticRate)}</td>
      <td>${formatPercentage(params.domesticRate)}</td>
    </tr>
    <tr>
      <th scope="row">Foreign Rate</th>
      <td>${formatPercentage(params.foreignRate)}</td>
      <td>${formatPercentage(params.foreignRate)}</td>
    </tr>
    <tr>
      <th scope="row">Domestic Investment</th>
      <td>USD 1,000</td>
      <td>${formatCurrency(calc.domesticEndingValue)}</td>
    </tr>
    <tr>
      <th scope="row">Foreign Investment (converted)</th>
      <td>USD 1,000</td>
      <td>${formatCurrency(calc.domesticEquivalent)}</td>
    </tr>
  `;
}

function renderChart(calc, params) {
  const canvas = $('#exchange-chart');
  if (!canvas) return;
  
  const ctx = canvas.getContext('2d');
  
  if (window.exchangeChart) {
    window.exchangeChart.destroy();
  }
  
  const minRate = Math.min(params.domesticRate, params.foreignRate);
  const maxRate = Math.max(params.domesticRate, params.foreignRate);
  const ratePadding = Math.max((maxRate - minRate) * 0.5, 0.5);
  
  const minEx = Math.min(params.spotRate, calc.forwardRate);
  const maxEx = Math.max(params.spotRate, calc.forwardRate);
  const exPadding = Math.max((maxEx - minEx) * 0.3, 0.1);
  
  window.exchangeChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: ['t = 0', 't = 1'],
      datasets: [
        {
          label: 'Exchange Rate',
          data: [params.spotRate, calc.forwardRate],
          backgroundColor: ['#00bbff', '#50037f'],
          borderColor: ['#06005a', '#06005a'],
          borderWidth: 2,
          yAxisID: 'y-exchange',
          order: 2
        },
        {
          label: 'Domestic Rate',
          data: [params.domesticRate, params.domesticRate],
          type: 'line',
          borderColor: '#7a46ff',
          backgroundColor: '#7a46ff',
          borderWidth: 3,
          pointRadius: 6,
          yAxisID: 'y-rate',
          order: 1
        },
        {
          label: 'Foreign Rate',
          data: [params.foreignRate, params.foreignRate],
          type: 'line',
          borderColor: '#ea792d',
          backgroundColor: '#ea792d',
          borderWidth: 3,
          pointRadius: 6,
          yAxisID: 'y-rate',
          order: 1
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (context) => {
              if (context.dataset.label === 'Exchange Rate') {
                return `${context.dataset.label}: ${context.parsed.y.toFixed(4)}`;
              }
              return `${context.dataset.label}: ${context.parsed.y.toFixed(3)}%`;
            }
          }
        }
      },
      scales: {
        x: {
          ticks: {
            color: '#374151',
            font: { weight: 600 }
          },
          grid: {
            color: '#e5e7eb'
          }
        },
        'y-exchange': {
          position: 'left',
          title: { 
            display: true, 
            text: 'Exchange Rate',
            color: '#374151',
            font: { weight: 600 }
          },
          min: Math.max(0, minEx - exPadding),
          max: maxEx + exPadding,
          ticks: { 
            callback: (v) => v.toFixed(2),
            color: '#374151',
            font: { weight: 500 }
          },
          grid: {
            color: '#e5e7eb'
          }
        },
        'y-rate': {
          position: 'right',
          title: { 
            display: true, 
            text: 'Interest Rate (%)',
            color: '#374151',
            font: { weight: 600 }
          },
          min: Math.max(0, minRate - ratePadding),
          max: maxRate + ratePadding,
          ticks: { 
            callback: (v) => v.toFixed(2),
            color: '#374151',
            font: { weight: 500 }
          },
          grid: {
            drawOnChartArea: false,
            color: '#e5e7eb'
          }
        }
      }
    }
  });
}

function runSelfTests() {
  console.log('Running self-tests...');
  const tests = [
    {
      name: 'Forward exchange calculation',
      inputs: { spotRate: 1.2602, domesticRate: 2.360, foreignRate: 2.430 },
      expected: { forwardApprox: 1.2611 }
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
  console.log('Self-tests complete');
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

export { state, setState, updateCalculations };