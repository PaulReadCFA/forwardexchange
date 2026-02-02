import { $ } from './utils.js';

const VALIDATION_RULES = {
  spotRate: {
    min: 0.1,
    max: 10,
    required: true,
    label: 'Spot exchange rate'
  },
  domesticRate: {
    min: -99,
    max: 50,
    required: true,
    label: 'Domestic interest rate',
    unit: '%'
  },
  foreignRate: {
    min: -99,
    max: 50,
    required: true,
    label: 'Foreign interest rate',
    unit: '%'
  }
};

export function validateField(field, value) {
  const rules = VALIDATION_RULES[field];
  if (!rules) return null;
  
  if (rules.required && (value === '' || value == null || isNaN(value))) {
    return `${rules.label} is required`;
  }
  
  if (rules.min !== undefined && value < rules.min) {
    return `${rules.label} must be at least ${rules.min}${rules.unit || ''}`;
  }
  
  if (rules.max !== undefined && value > rules.max) {
    return `${rules.label} cannot exceed ${rules.max}${rules.unit || ''}`;
  }
  
  return null;
}

export function updateFieldError(fieldId, errorMessage) {
  const input = $(`#${fieldId}`);
  if (!input) return;
  
  if (errorMessage) {
    input.setAttribute('aria-invalid', 'true');
    input.classList.add('error');
  } else {
    input.removeAttribute('aria-invalid');
    input.classList.remove('error');
  }
}

export function updateValidationSummary(errors) {
  const summary = $('#validation-summary');
  const list = $('#validation-list');

  if (!summary || !list) return;

  if (hasErrors(errors)) {
    list.innerHTML = Object.entries(errors)
      .map(([field, message]) => `<li>${message}</li>`)
      .join('');
    summary.style.display = 'block';
  } else {
    summary.style.display = 'none';
  }
}

export function hasErrors(errors) {
  return Object.keys(errors).length > 0;
}