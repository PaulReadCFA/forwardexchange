export function calculateForwardExchange({ spotRate, domesticRate, foreignRate }) {
  const r_d = domesticRate / 100;
  const r_f = foreignRate / 100;
  const initialInvestment = 1000;
  
  // Forward rate using covered interest rate parity: F = S × e^(r_f - r_d)
  const forwardRate = spotRate * Math.exp(r_f - r_d);
  
  // Domestic investment strategy
  const domesticEndingValue = initialInvestment * (1 + r_d);
  
  // Foreign investment strategy
  const foreignCurrencyAmount = initialInvestment * spotRate;
  const foreignEndingValue = foreignCurrencyAmount * (1 + r_f);
  const domesticEquivalent = foreignEndingValue / forwardRate;
  
  // Arbitrage check
  const arbitrageDiff = Math.abs(domesticEndingValue - domesticEquivalent);
  const noArbitrage = arbitrageDiff < 0.01;
  
  return {
    forwardRate,
    domesticEndingValue,
    foreignEndingValue,
    foreignCurrencyAmount,
    domesticEquivalent,
    arbitrageDiff,
    noArbitrage,
    isValid: spotRate > 0 && r_d > -1 && r_f > -1
  };
}

export function calculateExchangeMetrics(params) {
  return calculateForwardExchange(params);
}
