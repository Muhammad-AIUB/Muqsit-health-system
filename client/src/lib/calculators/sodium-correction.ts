interface SodiumCorrectionInput {
  sodium: number;    // mEq/L (= mmol/L)
  glucose: number;   // mg/dL
}

export function calculateSodiumCorrection(input: SodiumCorrectionInput): {
  katz: number;
  hillier: number;
} {
  const { sodium, glucose } = input;
  // Both formulas require glucose in mg/dL
  const katz    = sodium + 0.016 * (glucose - 100);
  const hillier = sodium + 0.024 * (glucose - 100);
  return {
    katz:    Math.round(katz    * 10) / 10,
    hillier: Math.round(hillier * 10) / 10,
  };
}
