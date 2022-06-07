import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers'
import { ethers } from 'hardhat'
import { expect } from 'chai'
import { CErc20DelegateHarness, Creamtroller, SimplePriceOracle, Unitroller } from '../../dist/types'
import { DEFAULT_CLOSE_FACTOR, FailureInfo, TEN_18, TrollError, ZERO_ADDRESS } from '../Utils/constants'
import { deploy, makeCToken, getTrollErrorAndInfo, getLogs } from '../utils/creamtank'

describe('CreamtrollerV1', function () {
  let root: SignerWithAddress, accounts: SignerWithAddress[]
  let unitroller: Unitroller
  let brains: Creamtroller
  let oracle: SimplePriceOracle

  beforeEach(async () => {
    [root, ...accounts] = await ethers.getSigners()
    oracle = await deploy('SimplePriceOracle', [root.address]) as SimplePriceOracle
    brains = await deploy('Creamtroller') as Creamtroller
    unitroller = await deploy('Unitroller') as Unitroller
  })

  let initializeBrains = async () => {
    await unitroller._setPendingImplementation(brains.address)
    await brains._become(unitroller.address)
    return brains.attach(unitroller.address) as Creamtroller
  }

  describe('delegating to creamtroller v1', () => {
    const closeFactor = DEFAULT_CLOSE_FACTOR
    const maxAssets = 10
    let unitrollerAsCreamtroller: Creamtroller, cToken: CErc20DelegateHarness

    beforeEach(async () => {
      unitrollerAsCreamtroller = await initializeBrains()
      cToken = await makeCToken({ creamtroller: unitrollerAsCreamtroller })
    })

    describe('becoming brains sets initial state', () => {
      it('reverts if this is not the pending implementation', async () => {
        await expect(
          brains._become(unitroller.address)
        ).to.be.revertedWith('Error: VM Exception while processing transaction: reverted with reason string \'change not authorized\'')
      })

      it('on success it sets admin to caller of constructor', async () => {
        expect(await unitrollerAsCreamtroller.admin()).to.eq(root.address)
        expect(await unitrollerAsCreamtroller.pendingAdmin()).to.eq(ZERO_ADDRESS)
      })
    })

    describe('_setCollateralFactor', () => {
      const half = TEN_18.mul(5).div(10),
            one = TEN_18

      it('fails if not called by admin', async () => {
        const [trollError, failInfo] = await getTrollErrorAndInfo(unitrollerAsCreamtroller.connect(accounts[1])._setCollateralFactor(cToken.address, half))
        expect(trollError).to.eq(TrollError.UNAUTHORIZED)
        expect(failInfo).to.eq(FailureInfo.SET_COLLATERAL_FACTOR_OWNER_CHECK)
      })

      it('fails if asset is not listed', async () => {
        const [trollError, failInfo] = await getTrollErrorAndInfo(unitrollerAsCreamtroller._setCollateralFactor(cToken.address, half))
        expect(trollError).to.eq(TrollError.MARKET_NOT_LISTED)
        expect(failInfo).to.eq(FailureInfo.SET_COLLATERAL_FACTOR_NO_EXISTS)
      })

      it('fails if factor is too high', async () => {
        const cToken = await makeCToken({ supportMarket: true, creamtroller: unitrollerAsCreamtroller })
        const [trollError, failInfo] = await getTrollErrorAndInfo(unitrollerAsCreamtroller._setCollateralFactor(cToken.address, one))
        expect(trollError).to.eq(TrollError.INVALID_COLLATERAL_FACTOR)
        expect(failInfo).to.eq(FailureInfo.SET_COLLATERAL_FACTOR_VALIDATION)
      })

      // failing idk why
      it('fails if factor is set without an underlying price', async () => {
        const cToken = await makeCToken({ supportMarket: true, creamtroller: unitrollerAsCreamtroller })
        const [trollError, failInfo] = await getTrollErrorAndInfo(unitrollerAsCreamtroller._setCollateralFactor(cToken.address, half))
        expect(trollError).to.eq(TrollError.PRICE_ERROR)
        expect(failInfo).to.eq(FailureInfo.SET_COLLATERAL_FACTOR_WITHOUT_PRICE)
      })

      // failing idk why
      it('succeeds and sets market', async () => {
        const cToken = await makeCToken({ supportMarket: true, creamtroller: unitrollerAsCreamtroller })
        await oracle.setUnderlyingPrice(cToken.address, 1)
        const logs = await getLogs(unitrollerAsCreamtroller._setCollateralFactor(cToken.address, half))
        expect(logs![0].event).to.eq('NewCollateralFactor')
        expect(logs![0].args![0]).to.eq(cToken.address)
        expect(logs![0].args![1]).to.eq(0)      
        expect(logs![0].args![2]).to.eq(half)        
      })
    })

    describe('_supportMarket', () => {
      it('fails if not called by admin', async () => {
        const [trollError, failInfo] = await getTrollErrorAndInfo(unitrollerAsCreamtroller.connect(accounts[1])._supportMarket(cToken.address))
        expect(trollError).to.eq(TrollError.UNAUTHORIZED)
        expect(failInfo).to.eq(FailureInfo.SUPPORT_MARKET_OWNER_CHECK)
      })

      it('fails if asset is not a CToken', async () => {
        const notACToken = await deploy('SimplePriceOracle', [root.address])
        await expect(
          unitrollerAsCreamtroller._supportMarket(notACToken.address)
        ).to.be.revertedWith('')
      })

      it('succeeds and sets market', async () => {
        const logs = await getLogs(unitrollerAsCreamtroller._supportMarket(cToken.address))
        expect(logs![0].event).to.eq('MarketListed')
        expect(logs![0].args![0]).to.eq(cToken.address)
      })

      it('cannot list a market a second time', async () => {
        await unitrollerAsCreamtroller._supportMarket(cToken.address)
        const [trollError, failInfo] = await getTrollErrorAndInfo(unitrollerAsCreamtroller._supportMarket(cToken.address))
        expect(trollError).to.eq(TrollError.MARKET_ALREADY_LISTED)
        expect(failInfo).to.eq(FailureInfo.SUPPORT_MARKET_EXISTS)
      })

      it('can list two different markets', async () => {
        const cToken1 = await makeCToken({ creamtroller: unitrollerAsCreamtroller })
        const cToken2 = await makeCToken({ creamtroller: unitrollerAsCreamtroller })
        const logs1 = await getLogs(unitrollerAsCreamtroller._supportMarket(cToken1.address))
        const logs2 = await getLogs(unitrollerAsCreamtroller._supportMarket(cToken2.address))

        expect(logs1![0].event).to.eq('MarketListed')
        expect(logs1![0].args![0]).to.eq(cToken1.address)
        expect(logs2![0].event).to.eq('MarketListed')
        expect(logs2![0].args![0]).to.eq(cToken2.address)
      })
    })
  })
})
