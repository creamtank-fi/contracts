import { BigNumber } from 'ethers'

export const TEN_25 = BigNumber.from('10000000000000000000000000')
export const TEN_18 = BigNumber.from('1000000000000000000')
export const DEFAULT_CLOSE_FACTOR = BigNumber.from('51000000000000000') // 0.051 * 10**18
export const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000'

export enum TrollError {
  NO_ERROR,
  UNAUTHORIZED,
  COMPTROLLER_MISMATCH,
  INSUFFICIENT_SHORTFALL,
  INSUFFICIENT_LIQUIDITY,
  INVALID_CLOSE_FACTOR,
  INVALID_COLLATERAL_FACTOR,
  INVALID_LIQUIDATION_INCENTIVE,
  MARKET_NOT_ENTERED, // no longer possible
  MARKET_NOT_LISTED,
  MARKET_ALREADY_LISTED,
  MATH_ERROR,
  NONZERO_BORROW_BALANCE,
  PRICE_ERROR,
  REJECTION,
  SNAPSHOT_ERROR,
  TOO_MANY_ASSETS,
  TOO_MUCH_REPAY
}

export enum FailureInfo {
  ACCEPT_ADMIN_PENDING_ADMIN_CHECK,
  ACCEPT_PENDING_IMPLEMENTATION_ADDRESS_CHECK,
  EXIT_MARKET_BALANCE_OWED,
  EXIT_MARKET_REJECTION,
  SET_CLOSE_FACTOR_OWNER_CHECK,
  SET_CLOSE_FACTOR_VALIDATION,
  SET_COLLATERAL_FACTOR_OWNER_CHECK,
  SET_COLLATERAL_FACTOR_NO_EXISTS,
  SET_COLLATERAL_FACTOR_VALIDATION,
  SET_COLLATERAL_FACTOR_WITHOUT_PRICE,
  SET_IMPLEMENTATION_OWNER_CHECK,
  SET_LIQUIDATION_INCENTIVE_OWNER_CHECK,
  SET_LIQUIDATION_INCENTIVE_VALIDATION,
  SET_MAX_ASSETS_OWNER_CHECK,
  SET_PENDING_ADMIN_OWNER_CHECK,
  SET_PENDING_IMPLEMENTATION_OWNER_CHECK,
  SET_PRICE_ORACLE_OWNER_CHECK,
  SUPPORT_MARKET_EXISTS,
  SUPPORT_MARKET_OWNER_CHECK,
  SET_PAUSE_GUARDIAN_OWNER_CHECK
}