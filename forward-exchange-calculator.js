import { state, setState, subscribe } from './exchange-modules/state.js';
import { calculateExchangeMetrics } from './exchange-modules/calculations.js';
import { validateField, updateFieldError, updateValidationSummary, hasErrors } from './exchange-modules/validation.js';
import { $, listen, debounce, formatCurrency, formatPercentage } from './exchange-modules/utils.js';

function init() {
  console.log('Implied Forward Exchange Rate Calculator initializing...');
  setupInputListeners();
  setupViewToggle();
  setupSkipLinks();
  subscribe(handleStateChange);
  updateCalculations();
  
  // Render MathJax after initial load and fix accessibility
  if (window.MathJax) {
    window.MathJax.Hub.Queue(["Typeset", window.MathJax.Hub], function() {
      // Remove tabindex and add role="math" to all MathJax elements
      const spans = document.querySelectorAll('.MathJax');
      spans.forEach(function(span) {
        span.setAttribute('role', 'math');
        span.removeAttribute('tabindex');
      });
    });
  }
  
  runSelfTests();
  console.log('Implied Forward Exchange Rate Calculator ready');
}

function setupSkipLinks() {
  // Handle "Skip to data table" link
  const skipToTableLink = document.querySelector('a[href="#show-table"]');
  if (skipToTableLink) {
    listen(skipToTableLink, 'click', (e) => {
      e.preventDefault();
      const tableBtn = $('#view-table-btn');
      if (tableBtn) {
        // Switch to table view
        switchToTableView();
        // Focus the table button
        setTimeout(() => tableBtn.focus(), 100);
      }
    });
  }
}

function switchToChartView() {
  const chartBtn = $('#view-chart-btn');
  const tableBtn = $('#view-table-btn');
  const chartView = $('#chart-view');
  const tableView = $('#table-view');
  
  if (!chartView || !tableView || !chartBtn || !tableBtn) return;
  
  chartView.style.display = 'block';
  tableView.style.display = 'none';
  chartBtn.classList.add('active');
  tableBtn.classList.remove('active');
  chartBtn.setAttribute('aria-selected', 'true');
  tableBtn.setAttribute('aria-selected', 'false');
}

function switchToTableView() {
  const chartBtn = $('#view-chart-btn');
  const tableBtn = $('#view-table-btn');
  const chartView = $('#chart-view');
  const tableView = $('#table-view');
  
  if (!chartView || !tableView || !chartBtn || !tableBtn) return;
  
  chartView.style.display = 'none';
  tableView.style.display = 'block';
  chartBtn.classList.remove('active');
  tableBtn.classList.add('active');
  chartBtn.setAttribute('aria-selected', 'false');
  tableBtn.setAttribute('aria-selected', 'true');
  renderTable(state.exchangeCalculations, state);
}

function setupViewToggle() {
  const chartBtn = $('#view-chart-btn');
  const tableBtn = $('#view-table-btn');
  
  if (!chartBtn || !tableBtn) return;
  
  // Click handlers
  listen(chartBtn, 'click', () => {
    switchToChartView();
    chartBtn.focus();
  });
  
  listen(tableBtn, 'click', () => {
    switchToTableView();
    tableBtn.focus();
  });
  
  // Keyboard navigation - arrow keys
  listen(chartBtn, 'keydown', (e) => {
    if (e.key === 'ArrowRight') {
      e.preventDefault();
      switchToTableView();
      tableBtn.focus();
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      // Already on leftmost button
    }
  });
  
  listen(tableBtn, 'keydown', (e) => {
    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      switchToChartView();
      chartBtn.focus();
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      // Already on rightmost button
    }
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
      <h5 class="result-title forward-exchange">Forward Exchange Rate Result</h5>
      <div class="result-value" style="color: #50037f;" aria-live="polite">${calc.forwardRate.toFixed(4)}</div>
    </div>
    
    <div class="result-box domestic-strategy">
      <h5 class="result-title" style="color: #5a20cc;">Domestic Investment Strategy</h5>
      <div class="strategy-details">
        <div style="color: #1f2937;">Invest USD 1,000 at ${formatPercentage(params.domesticRate)}</div>
        <div style="font-weight: 600; padding-top: 0.5rem; border-top: 1px solid #e9d5ff; margin-top: 0.5rem; color: #1f2937;">
          Final: ${formatCurrency(calc.domesticEndingValue)}
        </div>
      </div>
    </div>
    
    <div class="result-box foreign-strategy">
      <h5 class="result-title" style="color: #a84f15;">Foreign Investment Strategy</h5>
      <div class="strategy-details">
        <div style="color: #1f2937;">Convert → invest at ${formatPercentage(params.foreignRate)} → convert back</div>
        <div style="font-size: 0.75rem; color: #4b5563; margin-top: 0.25rem;">
          Foreign: ${calc.foreignCurrencyAmount.toFixed(2)} @ ${formatPercentage(params.foreignRate)} = ${calc.foreignEndingValue.toFixed(2)}
        </div>
        <div style="font-weight: 600; padding-top: 0.5rem; border-top: 1px solid #fed7aa; margin-top: 0.5rem; color: #1f2937;">
          Final: ${formatCurrency(calc.domesticEquivalent)}
        </div>
      </div>
    </div>
  `;
}

function renderDynamicEquation(calc, params) {
  const container = $('#dynamic-mathml-equation');
  if (!container) return;
  
  const rd = (params.domesticRate / 100).toFixed(3);
  const rf = (params.foreignRate / 100).toFixed(3);
  
  const mathJax = `
    <div style="text-align: center;">
      $$\\color{#50037f}{F_{0,f/d}} = \\color{#0079a6}{${params.spotRate.toFixed(4)}} \\times e^{(\\color{#ea792d}{${rf}} - \\color{#7a46ff}{${rd}})} = \\color{#50037f}{${calc.forwardRate.toFixed(4)}}$$
    </div>
  `;
  
  container.innerHTML = mathJax;
  
  // Typeset the new MathJax content and fix accessibility
  if (window.MathJax) {
    window.MathJax.Hub.Queue(["Typeset", window.MathJax.Hub, container], function() {
      // Remove tabindex and add role after typesetting
      const spans = container.querySelectorAll('.MathJax');
      spans.forEach(function(span) {
        span.setAttribute('role', 'math');
        span.removeAttribute('tabindex');
      });
    });
  }
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
  
  // Register the datalabels plugin
  Chart.register(ChartDataLabels);
  
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
          backgroundColor: ['#0079a6', '#50037f'],
          borderColor: 'transparent',
          borderWidth: 0,
          yAxisID: 'y-exchange',
          order: 2,
          datalabels: {
            anchor: 'center',
            align: 'center',
            formatter: (value, context) => {
              const label = context.dataIndex === 0 ? 'Spot' : 'Forward';
              return label + '\n' + value.toFixed(4);
            },
            color: '#ffffff',
            font: {
              weight: 'bold',
              size: 13,
              lineHeight: 1.4
            },
            textStrokeColor: 'rgba(0,0,0,0.3)',
            textStrokeWidth: 1,
            padding: 0
          }
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
          order: 1,
          datalabels: {
            display: function(context) {
              // Only show on first point
              return context.dataIndex === 0;
            },
            anchor: 'end',
            align: 'end',
            offset: 10,
            formatter: (value) => 'Domestic: ' + value.toFixed(2) + '%',
            color: '#5a20cc',  // Darker purple for WCAG compliance
            font: {
              weight: 'bold',
              size: 12
            },
            backgroundColor: '#ffffff',
            borderColor: '#7a46ff',
            borderWidth: 2,
            borderRadius: 4,
            padding: 8
          }
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
          order: 1,
          datalabels: {
            display: function(context) {
              return context.dataIndex === 1;  // Show on second point
            },
            anchor: 'start',
            align: 'start',
            offset: 10,
            formatter: (value) => 'Foreign: ' + value.toFixed(2) + '%',
            color: '#a84f15',  // Darker orange for WCAG compliance
            font: {
              weight: 'bold',
              size: 12
            },
            backgroundColor: '#ffffff',
            borderColor: '#ea792d',
            borderWidth: 2,
            borderRadius: 4,
            padding: 8
          }
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
      inputs: { spotRate: 1.26, domesticRate: 2.5, foreignRate: 3.0 },
      expected: { forwardApprox: 1.2663 }
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