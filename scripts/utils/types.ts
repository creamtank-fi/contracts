export type InterestRateModel = {
  type: string,
  address: string,
  baseRatePerYear: string,
  multiplierPerYear: string,
  jumpMultiplierPerYear: string,
  kink: string,
  owner: string
}

export type Token = {
  address: string
  name: string
  symbol: string
  decimals: number
  initialExchangeRateMantissa: string
  collateralFactor: string
  interestRateModel: InterestRateModel
}

export type Config = {
  closeFactor: string
  maxAssets: string
  liquidationIncentive: string
  tokens: Token[]
}

export type Core = {
  deployer: string
  unitroller: string
  creamtroller: string
  oracle: string
}