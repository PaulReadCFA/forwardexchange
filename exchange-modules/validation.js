import {
  updateFieldError,
  updateValidationSummary,
  hasErrors,
  requiredMessage,
  minMessage,
  maxMessage,
} from '../validation-ui.js';

export { updateFieldError, updateValidationSummary, hasErrors };

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
    return requiredMessage(rules.label);
  }
  
  if (rules.min !== undefined && value < rules.min) {
    return minMessage(rules.label, `${rules.min}${rules.unit || ''}`);
  }
  
  if (rules.max !== undefined && value > rules.max) {
    return maxMessage(rules.label, `${rules.max}${rules.unit || ''}`);
  }
  
  return null;
}

export function validateAll(inputs) {
  const errors = {};
  Object.keys(VALIDATION_RULES).forEach((field) => {
    const error = validateField(field, inputs[field]);
    if (error) errors[field] = error;
  });
  return errors;
}