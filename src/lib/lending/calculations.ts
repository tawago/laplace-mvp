/**
 * Lending Calculations Module
 *
 * All financial calculations use decimal.js for precision.
 * Formulas:
 * - deltaInterest = principal * annualRate * (elapsedSeconds / 31_536_000)
 * - ltv = debtUsd / collateralUsd
 * - healthFactor = liquidationLtv / ltv
 */

import Decimal from 'decimal.js';

// Configure decimal.js for high precision
Decimal.set({ precision: 20, rounding: Decimal.ROUND_DOWN });

const SECONDS_PER_YEAR = 31_536_000;
const TOKEN_SCALE = 8;
const INDEX_SCALE = 18;

/**
 * Calculate interest accrued since last update
 *
 * @param principal - Current loan principal
 * @param annualRate - Annual interest rate (e.g., 0.05 for 5%)
 * @param lastUpdate - Last interest update timestamp
 * @param now - Current timestamp (default: now)
 * @returns Interest amount accrued
 */
export function calculateInterestAccrued(
  principal: number | string,
  annualRate: number | string,
  lastUpdate: Date,
  now: Date = new Date()
): number {
  const principalDec = new Decimal(principal);
  const rateDec = new Decimal(annualRate);

  if (principalDec.isZero()) {
    return 0;
  }

  const elapsedSeconds = Math.max(0, (now.getTime() - lastUpdate.getTime()) / 1000);
  const elapsedYears = new Decimal(elapsedSeconds).div(SECONDS_PER_YEAR);

  const interest = principalDec.mul(rateDec).mul(elapsedYears);

  // Round to 8 decimal places
  return interest.toDecimalPlaces(8, Decimal.ROUND_DOWN).toNumber();
}

/**
 * Calculate total debt (principal + accrued interest)
 */
export function calculateTotalDebt(principal: number | string, interestAccrued: number | string): number {
  const principalDec = new Decimal(principal);
  const interestDec = new Decimal(interestAccrued);

  return principalDec.add(interestDec).toDecimalPlaces(8, Decimal.ROUND_DOWN).toNumber();
}

/**
 * Calculate Loan-to-Value ratio
 *
 * @param collateralAmount - Amount of collateral
 * @param collateralPriceUsd - Collateral price in USD
 * @param totalDebt - Total debt (principal + interest)
 * @param debtPriceUsd - Debt token price in USD
 * @returns LTV ratio (0-1 range, or higher if underwater)
 */
export function calculateLtv(
  collateralAmount: number | string,
  collateralPriceUsd: number | string,
  totalDebt: number | string,
  debtPriceUsd: number | string
): number {
  const collateralDec = new Decimal(collateralAmount);
  const collateralPrice = new Decimal(collateralPriceUsd);
  const debtDec = new Decimal(totalDebt);
  const debtPrice = new Decimal(debtPriceUsd);

  const collateralValueUsd = collateralDec.mul(collateralPrice);
  const debtValueUsd = debtDec.mul(debtPrice);

  if (collateralValueUsd.isZero()) {
    return debtValueUsd.isZero() ? 0 : Infinity;
  }

  return debtValueUsd.div(collateralValueUsd).toDecimalPlaces(6, Decimal.ROUND_UP).toNumber();
}

/**
 * Calculate health factor
 *
 * healthFactor = liquidationLtv / currentLtv
 * healthFactor > 1 means position is healthy
 * healthFactor < 1 means position is liquidatable
 *
 * @param currentLtv - Current LTV ratio
 * @param liquidationLtv - Liquidation threshold LTV
 * @returns Health factor
 */
export function calculateHealthFactor(currentLtv: number | string, liquidationLtv: number | string): number {
  const ltvDec = new Decimal(currentLtv);
  const liquidationDec = new Decimal(liquidationLtv);

  if (ltvDec.isZero()) {
    return Infinity;
  }

  return liquidationDec.div(ltvDec).toDecimalPlaces(4, Decimal.ROUND_DOWN).toNumber();
}

/**
 * Calculate maximum borrowable amount given collateral
 *
 * maxBorrow = (collateralUsd * maxLtv - currentDebtUsd) / debtPriceUsd
 */
export function calculateMaxBorrowable(
  collateralAmount: number | string,
  collateralPriceUsd: number | string,
  currentDebt: number | string,
  debtPriceUsd: number | string,
  maxLtvRatio: number | string
): number {
  const collateralDec = new Decimal(collateralAmount);
  const collateralPrice = new Decimal(collateralPriceUsd);
  const debtDec = new Decimal(currentDebt);
  const debtPrice = new Decimal(debtPriceUsd);
  const maxLtv = new Decimal(maxLtvRatio);

  const collateralValueUsd = collateralDec.mul(collateralPrice);
  const currentDebtUsd = debtDec.mul(debtPrice);
  const maxDebtUsd = collateralValueUsd.mul(maxLtv);

  const availableDebtUsd = maxDebtUsd.sub(currentDebtUsd);

  if (availableDebtUsd.lte(0) || debtPrice.isZero()) {
    return 0;
  }

  return availableDebtUsd.div(debtPrice).toDecimalPlaces(8, Decimal.ROUND_DOWN).toNumber();
}

/**
 * Calculate maximum withdrawable collateral
 *
 * maxWithdraw = collateral - (currentDebtUsd / (maxLtv * collateralPrice))
 */
export function calculateMaxWithdrawable(
  collateralAmount: number | string,
  collateralPriceUsd: number | string,
  currentDebt: number | string,
  debtPriceUsd: number | string,
  maxLtvRatio: number | string
): number {
  const collateralDec = new Decimal(collateralAmount);
  const collateralPrice = new Decimal(collateralPriceUsd);
  const debtDec = new Decimal(currentDebt);
  const debtPrice = new Decimal(debtPriceUsd);
  const maxLtv = new Decimal(maxLtvRatio);

  if (debtDec.isZero()) {
    return collateralDec.toNumber();
  }

  const currentDebtUsd = debtDec.mul(debtPrice);
  const minCollateralUsd = currentDebtUsd.div(maxLtv);
  const minCollateral = minCollateralUsd.div(collateralPrice);

  const maxWithdrawable = collateralDec.sub(minCollateral);

  if (maxWithdrawable.lte(0)) {
    return 0;
  }

  return maxWithdrawable.toDecimalPlaces(8, Decimal.ROUND_DOWN).toNumber();
}

/**
 * Calculate collateral to seize during liquidation
 *
 * seizableCollateral = (debtToRepay * debtPrice * (1 + penalty)) / collateralPrice
 */
export function calculateLiquidationCollateral(
  debtToRepay: number | string,
  debtPriceUsd: number | string,
  collateralPriceUsd: number | string,
  liquidationPenalty: number | string
): number {
  const debtDec = new Decimal(debtToRepay);
  const debtPrice = new Decimal(debtPriceUsd);
  const collateralPrice = new Decimal(collateralPriceUsd);
  const penalty = new Decimal(liquidationPenalty);

  const debtValueUsd = debtDec.mul(debtPrice);
  const totalToSeizeUsd = debtValueUsd.mul(new Decimal(1).add(penalty));
  const collateralToSeize = totalToSeizeUsd.div(collateralPrice);

  return collateralToSeize.toDecimalPlaces(8, Decimal.ROUND_UP).toNumber();
}

/**
 * Allocate repayment between interest and principal
 *
 * Repayment order: interest first, then principal
 */
export function allocateRepayment(
  repayAmount: number | string,
  interestAccrued: number | string,
  principal: number | string
): { interestPaid: number; principalPaid: number; excess: number } {
  const repayDec = new Decimal(repayAmount);
  const interestDec = new Decimal(interestAccrued);
  const principalDec = new Decimal(principal);

  let remaining = repayDec;
  let interestPaid = new Decimal(0);
  let principalPaid = new Decimal(0);

  // Pay interest first
  if (remaining.gt(0) && interestDec.gt(0)) {
    const toInterest = Decimal.min(remaining, interestDec);
    interestPaid = toInterest;
    remaining = remaining.sub(toInterest);
  }

  // Then pay principal
  if (remaining.gt(0) && principalDec.gt(0)) {
    const toPrincipal = Decimal.min(remaining, principalDec);
    principalPaid = toPrincipal;
    remaining = remaining.sub(toPrincipal);
  }

  return {
    interestPaid: interestPaid.toDecimalPlaces(8, Decimal.ROUND_DOWN).toNumber(),
    principalPaid: principalPaid.toDecimalPlaces(8, Decimal.ROUND_DOWN).toNumber(),
    excess: remaining.toDecimalPlaces(8, Decimal.ROUND_DOWN).toNumber(),
  };
}

/**
 * Calculate pool utilization rate (borrowed / supplied).
 */
export function calculateUtilizationRate(
  totalBorrowed: number | string,
  totalSupplied: number | string
): number {
  const borrowed = new Decimal(totalBorrowed);
  const supplied = new Decimal(totalSupplied);

  if (supplied.lte(0)) {
    return 0;
  }

  return borrowed.div(supplied).toDecimalPlaces(8, Decimal.ROUND_DOWN).toNumber();
}

/**
 * Calculate supplier APR from borrow APR, utilization, and reserve factor.
 */
export function calculateSupplyApr(
  borrowApr: number | string,
  utilizationRate: number | string,
  reserveFactor: number | string
): number {
  const borrow = new Decimal(borrowApr);
  const utilization = new Decimal(utilizationRate);
  const reserve = new Decimal(reserveFactor);

  const clampedReserve = Decimal.max(0, Decimal.min(1, reserve));
  const apr = borrow.mul(utilization).mul(new Decimal(1).sub(clampedReserve));

  return apr.toDecimalPlaces(8, Decimal.ROUND_DOWN).toNumber();
}

/**
 * Convert supplier APR to APY using daily compounding.
 */
export function calculateSupplyApy(supplyApr: number | string): number {
  const apr = new Decimal(supplyApr);

  if (apr.lte(0)) {
    return 0;
  }

  const apy = new Decimal(1).add(apr.div(365)).pow(365).sub(1);
  return apy.toDecimalPlaces(8, Decimal.ROUND_DOWN).toNumber();
}

/**
 * Progress the global yield index over elapsed time.
 */
export function calculateGlobalYieldIndex(
  currentGlobalYieldIndex: number | string,
  supplyApr: number | string,
  lastIndexUpdate: Date,
  now: Date = new Date()
): number {
  const currentIndex = new Decimal(currentGlobalYieldIndex);
  const apr = new Decimal(supplyApr);
  const elapsedSeconds = Math.max(0, (now.getTime() - lastIndexUpdate.getTime()) / 1000);

  if (elapsedSeconds <= 0 || apr.lte(0)) {
    return currentIndex.toDecimalPlaces(INDEX_SCALE, Decimal.ROUND_DOWN).toNumber();
  }

  const elapsedYears = new Decimal(elapsedSeconds).div(SECONDS_PER_YEAR);
  const growthFactor = new Decimal(1).add(apr.mul(elapsedYears));
  const nextIndex = currentIndex.mul(growthFactor);

  return nextIndex.toDecimalPlaces(INDEX_SCALE, Decimal.ROUND_DOWN).toNumber();
}

/**
 * Calculate accrued supplier yield from index delta.
 */
export function calculateAccruedSupplyYield(
  supplyAmount: number | string,
  globalYieldIndex: number | string,
  positionYieldIndex: number | string
): number {
  const supplied = new Decimal(supplyAmount);
  const globalIndex = new Decimal(globalYieldIndex);
  const positionIndex = new Decimal(positionYieldIndex);

  if (supplied.lte(0) || globalIndex.lte(positionIndex) || positionIndex.lte(0)) {
    return 0;
  }

  const accrued = supplied.mul(globalIndex.div(positionIndex).sub(1));
  return accrued.toDecimalPlaces(TOKEN_SCALE, Decimal.ROUND_DOWN).toNumber();
}

/**
 * Derive the position yield index needed to preserve a target accrued yield amount.
 */
export function deriveYieldIndexFromAccrued(
  globalYieldIndex: number | string,
  supplyAmount: number | string,
  accruedYield: number | string
): number {
  const globalIndex = new Decimal(globalYieldIndex);
  const supplied = new Decimal(supplyAmount);
  const accrued = new Decimal(accruedYield);

  if (supplied.lte(0) || accrued.lte(0)) {
    return globalIndex.toDecimalPlaces(INDEX_SCALE, Decimal.ROUND_DOWN).toNumber();
  }

  const denominator = new Decimal(1).add(accrued.div(supplied));
  const nextPositionIndex = globalIndex.div(denominator);

  return nextPositionIndex.toDecimalPlaces(INDEX_SCALE, Decimal.ROUND_DOWN).toNumber();
}

/**
 * Check if a position is liquidatable
 */
export function isLiquidatable(currentLtv: number, liquidationLtv: number): boolean {
  return currentLtv >= liquidationLtv;
}

/**
 * Validate borrow against LTV limits
 *
 * @returns true if borrow is allowed
 */
export function validateBorrow(
  currentCollateralAmount: number | string,
  collateralPriceUsd: number | string,
  currentDebt: number | string,
  additionalBorrow: number | string,
  debtPriceUsd: number | string,
  maxLtvRatio: number | string
): boolean {
  const newTotalDebt = new Decimal(currentDebt).add(new Decimal(additionalBorrow));

  const newLtv = calculateLtv(
    currentCollateralAmount,
    collateralPriceUsd,
    newTotalDebt.toString(),
    debtPriceUsd
  );

  return newLtv <= Number(maxLtvRatio);
}

/**
 * Validate withdrawal against LTV limits
 *
 * @returns true if withdrawal is allowed
 */
export function validateWithdrawal(
  currentCollateralAmount: number | string,
  withdrawAmount: number | string,
  collateralPriceUsd: number | string,
  currentDebt: number | string,
  debtPriceUsd: number | string,
  maxLtvRatio: number | string
): boolean {
  const newCollateral = new Decimal(currentCollateralAmount).sub(new Decimal(withdrawAmount));

  if (newCollateral.lt(0)) {
    return false;
  }

  // If no debt, withdrawal is always allowed
  if (new Decimal(currentDebt).isZero()) {
    return true;
  }

  const newLtv = calculateLtv(newCollateral.toString(), collateralPriceUsd, currentDebt, debtPriceUsd);

  return newLtv <= Number(maxLtvRatio);
}
