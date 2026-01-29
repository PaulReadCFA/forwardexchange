export const state = {
  spotRate: 1.26,
  domesticRate: 2.5,
  foreignRate: 3.0,
  errors: {},
  exchangeCalculations: null,
  listeners: []
};

export function setState(updates) {
  Object.assign(state, updates);
  state.listeners.forEach(fn => fn(state));
}

export function subscribe(fn) {
  state.listeners.push(fn);
}