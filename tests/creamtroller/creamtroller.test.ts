import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers'
import {
  makeCreamtroller,
  makeCToken,
  makeToken,
  getLogs,
  deploy,
  getTrollErrorAndInfo
} from '../utils/creamtank'
import { ethers } from 'hardhat'
import { expect } from 'chai'
import { ZERO_ADDRESS, DEFAULT_CLOSE_FACTOR, TEN_18, TrollError, FailureInfo } from '../Utils/constants'
import { Creamtroller, SimplePriceOracle } from '../../dist/types'

describe('Creamtroller', () => {
  let root: SignerWithAddress, accounts: SignerWithAddress[]

  beforeEach(async () => {
    [root, ...accounts] = await ethers.getSigners()
  })

  describe('constructor', () => {
    it('on success it sets admin to creator and pendingAdmin is unset', async () => {
      const creamtroller = await makeCreamtroller()
      expect(await creamtroller.admin()).to.eq(root.address)
      expect(await creamtroller.pendingAdmin()).to.eq(ZERO_ADDRESS)
    })

    it('on success it sets closeFactor as specified', async () => {
      const creamtroller = await makeCreamtroller()
      expect(await creamtroller.closeFactorMantissa()).to.eq(DEFAULT_CLOSE_FACTOR)
    })
  })

  describe('_setLiquidationIncentive', () => {
    const initialIncentive = TEN_18
    const validIncentive = TEN_18.mul(11).div(10)
    const tooSmallIncentive = TEN_18.mul(99999).div(100000)
    const tooLargeIncentive = TEN_18.mul(150_000_001).div(100_000_000)

    let creamtroller: Creamtroller
    beforeEach(async () => {
      creamtroller = await makeCreamtroller()
    })

    it('fails if called by non-admin', async () => {
      const staticTx = await creamtroller.connect(accounts[0]).callStatic._setLiquidationIncentive(initialIncentive)
      expect(staticTx).to.eq(TrollError.UNAUTHORIZED)

      const tx = await creamtroller.connect(accounts[0])._setLiquidationIncentive(initialIncentive)
      // expect(receipt).toHaveTrollFailure('UNAUTHORIZED', 'SET_LIQUIDATION_INCENTIVE_OWNER_CHECK')
      expect(await creamtroller.liquidationIncentiveMantissa()).to.eq(initialIncentive)
    })

    it('accepts a valid incentive and emits a NewLiquidationIncentive event', async () => {
      const staticTx = await creamtroller.callStatic._setLiquidationIncentive(validIncentive)
      expect(staticTx).to.eq(TrollError.NO_ERROR)

      const logs = await getLogs(creamtroller._setLiquidationIncentive(validIncentive))

      expect(logs![0].event).to.eq('NewLiquidationIncentive')
      expect(logs![0].args![0]).to.eq(initialIncentive)
      expect(logs![0].args![1]).to.eq(validIncentive)
      expect(await creamtroller.liquidationIncentiveMantissa()).to.eq(validIncentive)
    })
  })

  describe('_setPriceOracle', () => {
    let creamtroller: Creamtroller, oldOracle: SimplePriceOracle, newOracle: SimplePriceOracle
    beforeEach(async () => {
      creamtroller = await makeCreamtroller()
      oldOracle = await ethers.getContractAt('SimplePriceOracle', await creamtroller.oracle()) as SimplePriceOracle
      newOracle = await deploy('SimplePriceOracle', [root.address]) as SimplePriceOracle
    })

    it('fails if called by non-admin', async () => {
      const staticTx = await creamtroller.connect(accounts[0]).callStatic._setPriceOracle(newOracle.address)
      expect(staticTx).to.eq(TrollError.UNAUTHORIZED)
      expect(await creamtroller.oracle()).to.eq(oldOracle.address)
    })

    it('accepts a valid price oracle and emits a NewPriceOracle event', async () => {
      const logs = await getLogs(creamtroller._setPriceOracle(newOracle.address))

      expect(logs![0].event).to.eq('NewPriceOracle')
      expect(logs![0].args![0]).to.eq(oldOracle.address)
      expect(logs![0].args![1]).to.eq(newOracle.address)
      expect(await creamtroller.oracle()).to.eq(newOracle.address)
    })
  })

  describe('_setCloseFactor', () => {
    it('fails if not called by admin', async () => {
      const cToken = await makeCToken()
      const creamtroller = await ethers.getContractAt('Creamtroller', await cToken.creamtroller()) as Creamtroller

      const staticTx = await creamtroller.connect(accounts[0]).callStatic._setCloseFactor(1)
      expect(staticTx).to.eq(TrollError.UNAUTHORIZED)

      const tx = await creamtroller.connect(accounts[0])._setCloseFactor(1)
      expect(await creamtroller.closeFactorMantissa()).to.eq(DEFAULT_CLOSE_FACTOR)
    })
  })

  describe('_setCollateralFactor', () => {
    const half = TEN_18.mul(5).div(10)
    const one = TEN_18

    it('fails if not called by admin', async () => {
      const cToken = await makeCToken()
      const creamtroller = await ethers.getContractAt('Creamtroller', await cToken.creamtroller()) as Creamtroller
      const [trollError, failInfo] = await getTrollErrorAndInfo(creamtroller.connect(accounts[0])._setCollateralFactor(cToken.address, half))
      expect(trollError).to.eq(TrollError.UNAUTHORIZED)
      expect(failInfo).to.eq(FailureInfo.SET_COLLATERAL_FACTOR_OWNER_CHECK)
    })

    it('fails if asset is not listed', async () => {
      const cToken = await makeCToken()
      const creamtroller = await ethers.getContractAt('Creamtroller', await cToken.creamtroller()) as Creamtroller
      const [trollError, failInfo] = await getTrollErrorAndInfo(creamtroller._setCollateralFactor(cToken.address, half))
      expect(trollError).to.eq(TrollError.MARKET_NOT_LISTED)
      expect(failInfo).to.eq(FailureInfo.SET_COLLATERAL_FACTOR_NO_EXISTS)
    })

    it('fails if factor is set without an underlying price', async () => {
      const cToken = await makeCToken({ supportMarket: true })
      const creamtroller = await ethers.getContractAt('Creamtroller', await cToken.creamtroller()) as Creamtroller
      const [trollError, failInfo] = await getTrollErrorAndInfo(creamtroller._setCollateralFactor(cToken.address, half))
      expect(trollError).to.eq(TrollError.PRICE_ERROR)
      expect(failInfo).to.eq(FailureInfo.SET_COLLATERAL_FACTOR_WITHOUT_PRICE)
    })

    it('succeeds and sets market', async () => {
      const cToken = await makeCToken({ supportMarket: true, underlyingPrice: 1 })
      const creamtroller = await ethers.getContractAt('Creamtroller', await cToken.creamtroller()) as Creamtroller
      const logs = await getLogs(creamtroller._setCollateralFactor(cToken.address, half))
      expect(logs![0].event).to.eq('NewCollateralFactor')
      expect(logs![0].args![0]).to.eq(cToken.address)
      expect(logs![0].args![1]).to.eq(0)
      expect(logs![0].args![2]).to.eq(half)
    })
  })

  describe('_supportMarket', () => {
    it('fails if not called by admin', async () => {
      const cToken = await makeCToken()
      const creamtroller = await ethers.getContractAt('Creamtroller', await cToken.creamtroller()) as Creamtroller
      const [trollError, failInfo] = await getTrollErrorAndInfo(creamtroller.connect(accounts[0])._supportMarket(cToken.address))
      expect(trollError).to.eq(TrollError.UNAUTHORIZED)
      expect(failInfo).to.eq(FailureInfo.SUPPORT_MARKET_OWNER_CHECK)
    })

    it('fails if asset is not a CToken', async () => {
      const creamtroller = await makeCreamtroller()
      const asset = await makeToken()
      await expect(
        creamtroller._supportMarket(asset.address)
      ).to.be.revertedWith('')
    })

    it('succeeds and sets market', async () => {
      const cToken = await makeCToken()
      const creamtroller = await ethers.getContractAt('Creamtroller', await cToken.creamtroller()) as Creamtroller
      const logs = await getLogs(creamtroller._supportMarket(cToken.address))
      expect(logs![0].event).to.eq('MarketListed')
      expect(logs![0].args![0]).to.eq(cToken.address)
    })

    it('cannot list a market a second time', async () => {
      const cToken = await makeCToken()
      const creamtroller = await ethers.getContractAt('Creamtroller', await cToken.creamtroller()) as Creamtroller
      await creamtroller._supportMarket(cToken.address)
      const [trollError, failInfo] = await getTrollErrorAndInfo(creamtroller._supportMarket(cToken.address))
      expect(trollError).to.eq(TrollError.MARKET_ALREADY_LISTED)
      expect(failInfo).to.eq(FailureInfo.SUPPORT_MARKET_EXISTS)
    })

    it('can list two different markets', async () => {
      const cToken1 = await makeCToken()
      const creamtroller = await ethers.getContractAt('Creamtroller', await cToken1.creamtroller()) as Creamtroller
      const cToken2 = await makeCToken({ creamtroller })
      const logs1 = await getLogs(creamtroller._supportMarket(cToken1.address))
      const logs2 = await getLogs(creamtroller._supportMarket(cToken2.address))
      expect(logs1![0].event).to.eq('MarketListed')
      expect(logs1![0].args![0]).to.eq(cToken1.address)
      expect(logs2![0].event).to.eq('MarketListed')
      expect(logs2![0].args![0]).to.eq(cToken2.address)
    })
  })

  describe('redeemVerify', () => {
    it('should allow you to redeem 0 underlying for 0 tokens', async () => {
      const creamtroller = await makeCreamtroller()
      const cToken = await makeCToken({ creamtroller })
      await creamtroller.redeemVerify(cToken.address, accounts[0].address, 0, 0)
    })

    it('should allow you to redeem 5 underlyig for 5 tokens', async () => {
      const creamtroller = await makeCreamtroller()
      const cToken = await makeCToken({ creamtroller: creamtroller })
      await creamtroller.redeemVerify(cToken.address, accounts[0].address, 5, 5)
    })

    it('should not allow you to redeem 5 underlying for 0 tokens', async () => {
      const creamtroller = await makeCreamtroller()
      const cToken = await makeCToken({ creamtroller: creamtroller })
      await expect(
        creamtroller.redeemVerify(cToken.address, accounts[0].address, 5, 0)
      ).to.be.revertedWith('Error: VM Exception while processing transaction: reverted with reason string \'redeemTokens zero\'')
    })
  })
})
