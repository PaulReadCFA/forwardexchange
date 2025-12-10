export const state = {
  spotRate: 1.2602,
  domesticRate: 2.360,
  foreignRate: 2.430,
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
