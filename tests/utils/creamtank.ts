import { ethers } from 'hardhat';
import { BigNumber, BigNumberish, Contract, ContractTransaction } from 'ethers'
import {
  Unitroller__factory,
  Unitroller,
  Creamtroller__factory,
  Creamtroller,
  SimplePriceOracle,
  Ctank,
  JumpRateModelV2,
  ERC20,
  ERC20Harness,
  CErc20Delegate,
  CErc20Delegator,
  ERC20Harness__factory,
  CErc20DelegateHarness,
  CreamtrollerHarness
} from '../../dist/types'
import {
  TEN_25,
  DEFAULT_CLOSE_FACTOR,
  TEN_18
} from './constants'
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';

type CreamtrollerOpts = {
  unitroller?: Unitroller
  priceOracle?: SimplePriceOracle
  ctank?: Ctank
  ctankOwner?: string
  closeFactor?: BigNumberish
}

type InterestRateModelOpts = {
  baseRate?: any
  multiplier?: any
  jump?: any
  kink?: any
  owner?: string
}

type Erc20Opts = {
  name?: string
  symbol?: string
  decimals?: number
  quantity?: BigNumberish
}

type PreApproveOpts = {
  faucet?: boolean
}

type CTokenOpts = {
  creamtroller?: Creamtroller
  interestRateModel?: JumpRateModelV2
  exchangeRate?: any
  decimals?: number
  symbol?: string
  name?: string
  creamtrollerOpts?: CreamtrollerOpts
  underlying?: ERC20 | ERC20Harness
  supportMarket?: boolean
  underlyingPrice?: BigNumberish
  collateralFactor?: BigNumberish
  admin?: SignerWithAddress
  underlyingOpts?: Erc20Opts  
  interestRateModelOpts?: InterestRateModelOpts
} 

export async function getError(tx: Promise<BigNumber[]>) {
  return (await tx)[0]
}

export async function getLogs(tx: Promise<ContractTransaction>) {
  const { events } = await (await tx).wait()
  return events
}

export async function getTrollError(tx: Promise<ContractTransaction>, eventIndex: number = 0) {
  const { events } = await (await tx).wait()
  console.log('events', events)
  if (events) {
    const { data } = events[eventIndex]
    return new ethers.utils.AbiCoder().decode(['uint256'], data)
  }
  return []
}

export async function getTrollErrorAndInfo(tx: Promise<ContractTransaction>, eventIndex: number = 0) {
  const { events } = await (await tx).wait()
  if (events) {
    const { data } = events[eventIndex]
    return new ethers.utils.AbiCoder().decode(['uint256', 'uint256'], data)
  }
  return []
}

export async function getRoot() {
  const [root] = await ethers.getSigners()
  return root
}

export function arrEq(arr1: any[], arr2: any[]) {
  if (arr1.length !== arr2.length) return false;

	for (let i = 0; i < arr1.length; i++) {
		if (arr1[i] !== arr2[i]) return false;
	}

	return true;
}

export async function deploy(contractName: string, args?: any[]): Promise<Contract> {
  const Contract = await ethers.getContractFactory(contractName)
  const contract = args ? await Contract.deploy(...args): await Contract.deploy()
  return contract
}

export async function makeCreamtroller(opts : CreamtrollerOpts = {}): Promise<Creamtroller> {
  const unitrollerRaw = opts.unitroller || await deploy('Unitroller') as Unitroller
  const creamtroller = await deploy('Creamtroller') as Creamtroller

  const root = await getRoot()
  const priceOracle = opts.priceOracle || await deploy('SimplePriceOracle', [root.address]) as SimplePriceOracle
  const closeFactor = opts.closeFactor|| DEFAULT_CLOSE_FACTOR;
  const liquidationIncentive = TEN_18

  await unitrollerRaw._setPendingImplementation(creamtroller.address)
  await creamtroller._become(unitrollerRaw.address)

  const unitroller = creamtroller.attach(unitrollerRaw.address) 
  await unitroller._setLiquidationIncentive(liquidationIncentive);
  await unitroller._setCloseFactor(closeFactor);
  await unitroller._setPriceOracle(priceOracle.address);

  return unitroller;
}

export async function makeCToken(opts: CTokenOpts = {}): Promise<CErc20DelegateHarness> {
  const creamtroller = opts.creamtroller || await makeCreamtroller(opts.creamtrollerOpts);
  const interestRateModel = opts.interestRateModel || await makeInterestRateModel(opts.interestRateModelOpts);
  const exchangeRate = opts.exchangeRate || TEN_18;
  const decimals = opts.decimals || 8;
  const symbol = opts.symbol || 'cTEST'
  const name = opts.name || `CToken ${symbol}`;
  const admin = opts.admin || await getRoot();

  const underlying = opts.underlying || await makeToken(opts.underlyingOpts);
  const cDelegate = await deploy('CErc20DelegateHarness') as CErc20DelegateHarness;
  const cDelegator = await deploy('CErc20Delegator',
    [
      underlying.address,
      creamtroller.address,
      interestRateModel.address,
      exchangeRate,
      name,
      symbol,
      decimals,
      admin.address,
      cDelegate.address,
      "0x00"
    ]
  ) as CErc20DelegateHarness
  const cToken = cDelegate.attach(cDelegator.address);

  if (opts.supportMarket) {
    await creamtroller._supportMarket(cToken.address);
  }

  if (opts.underlyingPrice) {
    const oracle = await ethers.getContractAt('SimplePriceOracle', await creamtroller.oracle())
    await oracle.setUnderlyingPrice(cToken.address, opts.underlyingPrice);
  }

  if (opts.collateralFactor) {
    await creamtroller._setCollateralFactor(cToken.address, opts.collateralFactor)
  }

  return cToken
}

export async function makeInterestRateModel(opts: InterestRateModelOpts = {}): Promise<JumpRateModelV2> {
  const baseRate = opts.baseRate || 1
  const multiplier = opts.multiplier || 1
  const jump = opts.jump || 1
  const kink = opts.kink || 1
  const owner = opts.owner || (await getRoot()).address
  return await deploy('JumpRateModelV2', [baseRate, multiplier, jump, kink, owner]) as JumpRateModelV2;
}

export async function makeToken(opts: Erc20Opts = {}): Promise<ERC20Harness> {
  const quantity = opts.quantity || TEN_25
  const decimals = opts.decimals || 18;
  const symbol = opts.symbol || 'TEST';
  const name = opts.name || `Erc20 ${symbol}`;
  return await deploy('ERC20Harness', [quantity, name, decimals, symbol]) as ERC20Harness
}

// async function balanceOf(token: ERC20, account: string) {
//   return await token.balanceOf(account);
// }

// async function totalSupply(token: ERC20) {
//   return await token.totalSupply();
// }

// async function borrowSnapshot(cToken, account) {
//   const { principal, interestIndex } = await call(cToken, 'harnessAccountBorrows', [account]);
//   return { principal: etherUnsigned(principal), interestIndex: etherUnsigned(interestIndex) };
// }

// async function totalBorrows(cToken) {
//   return etherUnsigned(await call(cToken, 'totalBorrows'));
// }

// async function totalReserves(cToken) {
//   return etherUnsigned(await call(cToken, 'totalReserves'));
// }

export async function enterMarkets(cTokens: CErc20DelegateHarness[], from: SignerWithAddress) {
  const creamtroller = await ethers.getContractAt('Creamtroller', await cTokens[0].creamtroller()) as Creamtroller
  return await creamtroller.connect(from).enterMarkets(cTokens.map(c => c.address));
}

export async function enterMarketsStatic(cTokens: CErc20DelegateHarness[], from: SignerWithAddress) {
  const creamtroller = await ethers.getContractAt('Creamtroller', await cTokens[0].creamtroller()) as Creamtroller
  return await creamtroller.connect(from).callStatic.enterMarkets(cTokens.map(c => c.address));
}

async function fastForward(cToken: CErc20DelegateHarness, blocks = 5) {
  return await cToken.harnessFastForward(blocks)
}

// async function setBalance(cToken, account, balance) {
//   return await send(cToken, 'harnessSetBalance', [account, balance]);
// }

// async function setEtherBalance(cEther, balance) {
//   const current = await etherBalance(cEther.address);
//   const root = saddle.account;
//   expect(await send(cEther, 'harnessDoTransferOut', [root, current])).toSucceed();
//   expect(await send(cEther, 'harnessDoTransferIn', [root, balance], { value: balance })).toSucceed();
// }

// async function getBalances(cTokens, accounts) {
//   const balances = {};
//   for (let cToken of cTokens) {
//     const cBalances = balances[cToken.address] = {};
//     for (let account of accounts) {
//       cBalances[account] = {
//         eth: await etherBalance(account),
//         cash: cToken.underlying && await balanceOf(cToken.underlying, account),
//         tokens: await balanceOf(cToken, account),
//         borrows: (await borrowSnapshot(cToken, account)).principal
//       };
//     }
//     cBalances[cToken.address] = {
//       eth: await etherBalance(cToken.address),
//       cash: cToken.underlying && await balanceOf(cToken.underlying, cToken.address),
//       tokens: await totalSupply(cToken),
//       borrows: await totalBorrows(cToken),
//       reserves: await totalReserves(cToken)
//     };
//   }
//   return balances;
// }

// async function adjustBalances(balances, deltas) {
//   for (let delta of deltas) {
//     let cToken, account, key, diff;
//     if (delta.length == 4) {
//       ([cToken, account, key, diff] = delta);
//     } else {
//       ([cToken, key, diff] = delta);
//       account = cToken.address;
//     }
//     balances[cToken.address][account][key] = new BigNumber(balances[cToken.address][account][key]).plus(diff);
//   }
//   return balances;
// }


async function preApprove(cToken: CErc20DelegateHarness, from: SignerWithAddress, amount: BigNumberish, opts: PreApproveOpts = {}) {
  const underlying = ERC20Harness__factory.connect(await cToken.underlying(), from)
  if (opts.faucet) {
    await underlying.connect(from).harnessSetBalance(from.address, amount)
  }

  await underlying.connect(from).approve(cToken.address, amount);
}

export async function quickMint(
  cToken: CErc20DelegateHarness,
  minter: SignerWithAddress,
  mintAmount: BigNumberish,
  opts: {
    approve?: boolean
    exchangeRate?: BigNumberish
    preApproveOpts?: PreApproveOpts
  } = {
    approve: true,
    preApproveOpts: { faucet: true }
  }) {
  // make sure to accrue interest
  await fastForward(cToken, 1);

  if (opts.approve) {
    await preApprove(cToken, minter, mintAmount, opts.preApproveOpts)
  }
  if (opts.exchangeRate) {
    await cToken.harnessSetExchangeRate(opts.exchangeRate)
  }
  return cToken.connect(minter).mint(mintAmount)
}

// async function quickBorrow(cToken, minter, borrowAmount, opts = {}) {
//   // make sure to accrue interest
//   await fastForward(cToken, 1);

//   if (dfn(opts.exchangeRate))
//     expect(await send(cToken, 'harnessSetExchangeRate', [etherMantissa(opts.exchangeRate)])).toSucceed();

//   return send(cToken, 'borrow', [borrowAmount], { from: minter });
// }


// async function preSupply(cToken, account, tokens, opts = {}) {
//   if (dfn(opts.total, true)) {
//     expect(await send(cToken, 'harnessSetTotalSupply', [tokens])).toSucceed();
//   }
//   return send(cToken, 'harnessSetBalance', [account, tokens]);
// }

// async function quickRedeem(cToken, redeemer, redeemTokens, opts = {}) {
//   await fastForward(cToken, 1);

//   if (dfn(opts.supply, true)) {
//     expect(await preSupply(cToken, redeemer, redeemTokens, opts)).toSucceed();
//   }
//   if (dfn(opts.exchangeRate)) {
//     expect(await send(cToken, 'harnessSetExchangeRate', [etherMantissa(opts.exchangeRate)])).toSucceed();
//   }
//   return send(cToken, 'redeem', [redeemTokens], { from: redeemer });
// }

// async function quickRedeemUnderlying(cToken, redeemer, redeemAmount, opts = {}) {
//   await fastForward(cToken, 1);

//   if (dfn(opts.exchangeRate)) {
//     expect(await send(cToken, 'harnessSetExchangeRate', [etherMantissa(opts.exchangeRate)])).toSucceed();
//   }
//   return send(cToken, 'redeemUnderlying', [redeemAmount], { from: redeemer });
// }

// async function setOraclePrice(cToken, price) {
//   return send(cToken.creamtroller.priceOracle, 'setUnderlyingPrice', [cToken.address, etherMantissa(price)]);
// }

// async function setBorrowRate(cToken, rate) {
//   return send(cToken.interestRateModel, 'setBorrowRate', [etherMantissa(rate)]);
// }

// async function getBorrowRate(interestRateModel, cash, borrows, reserves) {
//   return call(interestRateModel, 'getBorrowRate', [cash, borrows, reserves].map(etherUnsigned));
// }

// async function getSupplyRate(interestRateModel, cash, borrows, reserves, reserveFactor) {
//   return call(interestRateModel, 'getSupplyRate', [cash, borrows, reserves, reserveFactor].map(etherUnsigned));
// }

// async function pretendBorrow(cToken, borrower, accountIndex, marketIndex, principalRaw, blockNumber = 2e7) {
//   await send(cToken, 'harnessSetTotalBorrows', [etherUnsigned(principalRaw)]);
//   await send(cToken, 'harnessSetAccountBorrows', [borrower, etherUnsigned(principalRaw), etherMantissa(accountIndex)]);
//   await send(cToken, 'harnessSetBorrowIndex', [etherMantissa(marketIndex)]);
//   await send(cToken, 'harnessSetAccrualBlockNumber', [etherUnsigned(blockNumber)]);
//   await send(cToken, 'harnessSetBlockNumber', [etherUnsigned(blockNumber)]);
// }