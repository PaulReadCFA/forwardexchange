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
  const skipToTableLink = document.querySelector('a[href="#table-view"]');
  if (skipToTableLink) {
    listen(skipToTableLink, 'click', (e) => {
      e.preventDefault();
      console.log('Skip to table clicked');
      
      // Get the Table button
      const tableBtn = $('#view-table-btn');
      
      if (tableBtn) {
        // If table view is already showing, just focus the button
        if (tableBtn.classList.contains('active')) {
          tableBtn.focus();
          const tableView = $('#table-view');
          if (tableView) {
            tableView.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }
        } else {
          // Click the Table button to switch view
          tableBtn.click();
          
          // Focus the button after a brief delay
          setTimeout(() => {
            tableBtn.focus();
            console.log('Table button focused, active element:', document.activeElement.id);
          }, 100);
        }
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
    { id: 'spot-rate', field: 'spotRate', decimals: 2 },
    { id: 'domestic-rate', field: 'domesticRate', decimals: 1 },
    { id: 'foreign-rate', field: 'foreignRate', decimals: 1 }
  ];
  
  inputs.forEach(({ id, field, decimals }) => {
    const input = $(`#${id}`);
    if (!input) return;
    
    const debouncedUpdate = debounce(() => {
      let value = parseFloat(input.value);
      // Round to prevent floating point precision issues
      value = Math.round(value * Math.pow(10, decimals)) / Math.pow(10, decimals);
      // Force display with correct decimal places
      input.value = value.toFixed(decimals);
      
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
      <h5 class="result-title forward-exchange">Implied Forward Exchange Rate Result</h5>
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
      <h5 class="result-title" style="color: #8b4513;">Foreign Investment Strategy</h5>
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
      <td><span style="color: #0079a6; font-weight: 600;">S:</span> ${params.spotRate.toFixed(4)}</td>
      <td><span style="color: #50037f; font-weight: 600;">F:</span> ${calc.forwardRate.toFixed(4)}</td>
    </tr>
    <tr>
      <th scope="row">Domestic Rate</th>
      <td colspan="2"><span style="color: #5a20cc; font-weight: 600;">r<sub>d</sub>:</span> ${formatPercentage(params.domesticRate)}</td>
    </tr>
    <tr>
      <th scope="row">Foreign Rate</th>
      <td colspan="2"><span style="color: #8b4513; font-weight: 600;">r<sub>f</sub>:</span> ${formatPercentage(params.foreignRate)}</td>
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

function renderChart(calc, params) {
  const canvas = $('#exchange-chart');
  if (!canvas) return;
  
  const ctx = canvas.getContext('2d');
  
  if (window.exchangeChart) {
    window.exchangeChart.destroy();
  }
  
  // Register ChartDataLabels plugin for lines only
  if (window.ChartDataLabels && !Chart.registry.plugins.get('datalabels')) {
    Chart.register(window.ChartDataLabels);
    console.log('ChartDataLabels plugin registered successfully');
  } else if (!window.ChartDataLabels) {
    console.error('ChartDataLabels plugin not loaded from CDN');
  } else {
    console.log('ChartDataLabels already registered');
  }
  
  // Custom plugin to draw bar labels manually
  const barLabelsPlugin = {
    id: 'customBarLabels',
    afterDatasetsDraw(chart) {
      const ctx = chart.ctx;
      const dataset = chart.data.datasets[0]; // Bar dataset
      const meta = chart.getDatasetMeta(0);
      
      // Debug: log chart dimensions and bar coordinates
      console.log('Chart area:', chart.chartArea);
      console.log('Canvas dimensions:', chart.canvas.width, 'x', chart.canvas.height);
      console.log('Bar coordinates:', meta.data.map(b => ({x: b.x, y: b.y, base: b.base})));
      
      ctx.save();
      ctx.font = 'bold 14px Arial';
      ctx.fillStyle = 'white';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      
      meta.data.forEach((bar, index) => {
        const value = dataset.data[index];
        const label = index === 0 ? 'Spot' : 'Forward';
        
        // Use chartArea to position within visible area
        const chartTop = chart.chartArea.top;
        const chartBottom = chart.chartArea.bottom;
        const visibleHeight = chartBottom - chartTop;
        
        // Position in lower third of visible chart area
        const labelY = chartBottom - (visibleHeight * 0.25);
        
        console.log('Drawing label at:', bar.x, labelY, 'for bar', index);
        
        // Draw label and value
        ctx.fillText(label, bar.x, labelY - 10);
        ctx.fillText(value.toFixed(4), bar.x, labelY + 10);
      });
      
      ctx.restore();
    }
  };
  
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
            display: false  // Disable ChartDataLabels for bars
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
            color: '#8b4513',  // Darker orange (saddle brown) for WCAG compliance
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
    plugins: [barLabelsPlugin],  // Register our custom plugin
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        datalabels: {
          // Default: disable for all datasets
          display: false
        },
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
            text: 'Exchange rate',
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
            drawOnChartArea: false,  // Don't draw grid for exchange rate
            color: '#e5e7eb'
          }
        },
        'y-rate': {
          position: 'right',
          title: { 
            display: true, 
            text: 'Interest rate (%)',
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
            color: '#e5e7eb'  // Draw grid for interest rate
          }
        }
      }
    }
  });
  
  // Debug: Log chart configuration
  console.log('Chart created with custom bar labels plugin');
  console.log('Bar dataset:', window.exchangeChart.data.datasets[0]);
  console.log('Custom plugin registered:', window.exchangeChart.config.plugins.length > 0);
  
  // Force update to trigger render
  window.exchangeChart.update('active');
}

function runSelfTests() {
  console.log('Running self-tests...');
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
  console.log('Self-tests complete');
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

export { state, setState, updateCalculations };