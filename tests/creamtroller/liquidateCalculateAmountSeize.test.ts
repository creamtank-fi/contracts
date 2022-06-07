// TODO: last test is not done

import {
  makeCreamtroller,
  makeCToken,
  deploy,
  getTrollErrorAndInfo
} from '../utils/creamtank'
import { CErc20DelegateHarness, Creamtroller, CToken, factories, SimplePriceOracle } from '../../dist/types'
import { BigNumberish, BigNumber } from 'ethers'
import { ethers } from 'hardhat'
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers'
import { TEN_18, TrollError } from '../Utils/constants'
import { expect } from 'chai'

const borrowedPrice = 2e10
const collateralPrice = TEN_18
const repayAmount = TEN_18

function rando(min: number, max: number) {
  return Math.floor(Math.random() * (max - min)) + min
}

describe('Creamtroller', () => {
  let root: SignerWithAddress, accounts: SignerWithAddress[]
  let creamtroller: Creamtroller,
      cTokenBorrowed: CErc20DelegateHarness,
      cTokenCollateral: CErc20DelegateHarness,
      priceOracle: SimplePriceOracle

  beforeEach(async () => {
    [root, ...accounts] = await ethers.getSigners()
    priceOracle = await deploy('SimplePriceOracle', [root.address]) as SimplePriceOracle
    creamtroller = await makeCreamtroller({ priceOracle })
    cTokenBorrowed = await makeCToken({ creamtroller: creamtroller, underlyingPrice: 0 })
    cTokenCollateral = await makeCToken({ creamtroller: creamtroller, underlyingPrice: 0 })
  })

  beforeEach(async () => {
    await priceOracle.setUnderlyingPrice(cTokenBorrowed.address, borrowedPrice)
    await priceOracle.setUnderlyingPrice(cTokenCollateral.address, collateralPrice)
    await cTokenCollateral.harnessExchangeRateDetails(8e10, 4e10, 0)
  })

  describe('liquidateCalculateAmountSeize', () => {
    it('fails if either asset price is 0', async () => {
      await priceOracle.setUnderlyingPrice(cTokenBorrowed.address, 0)
      const [trollError, failInfo] = await creamtroller.liquidateCalculateSeizeTokens(cTokenBorrowed.address, cTokenCollateral.address, repayAmount)
      expect(trollError).to.eq(TrollError.PRICE_ERROR)
      expect(failInfo).to.eq(0)

      await priceOracle.setUnderlyingPrice(cTokenCollateral.address, 0)
      const [trollError2, failInfo2] = await creamtroller.liquidateCalculateSeizeTokens(cTokenBorrowed.address, cTokenCollateral.address, repayAmount)
      expect(trollError2).to.eq(TrollError.PRICE_ERROR)
      expect(failInfo2).to.eq(0)
    })

    it('fails if the repayAmount causes overflow ', async () => {
      const [trollError, failInfo] = await creamtroller.liquidateCalculateSeizeTokens(cTokenBorrowed.address, cTokenCollateral.address, ethers.constants.MaxUint256)
      expect(trollError).to.eq(TrollError.MATH_ERROR)
      expect(failInfo).to.eq(0)
    })

    it('fails if the borrowed asset price causes overflow ', async () => {
      await priceOracle.setUnderlyingPrice(cTokenBorrowed.address, ethers.constants.MaxUint256)
      const [trollError, failInfo] = await creamtroller.liquidateCalculateSeizeTokens(cTokenBorrowed.address, cTokenCollateral.address, repayAmount)
      expect(trollError).to.eq(TrollError.MATH_ERROR)
      expect(failInfo).to.eq(0)
    })

    it('reverts if it fails to calculate the exchange rate', async () => {
      await cTokenCollateral.harnessExchangeRateDetails(1, 0, 10) // (1 - 10) -> underflow
      await expect(
        creamtroller.liquidateCalculateSeizeTokens(cTokenBorrowed.address, cTokenCollateral.address, repayAmount)
      ).to.be.revertedWith('exchangeRateStored: exchangeRateStoredInternal failed')
    })

    describe('cases tests', () => {
      let testCase: BigNumber[]

      it('first', async () => {
        testCase = [TEN_18, TEN_18, TEN_18, TEN_18, TEN_18]
        const [exchangeRate, borrowedPrice, collateralPrice, liquidationIncentive, repayAmount] = testCase
        
        await priceOracle.setUnderlyingPrice(cTokenCollateral.address, collateralPrice)
        await priceOracle.setUnderlyingPrice(cTokenBorrowed.address, borrowedPrice)
        await creamtroller._setLiquidationIncentive(liquidationIncentive)
        await cTokenCollateral.harnessSetExchangeRate(exchangeRate)

        const seizeAmount = repayAmount.mul(liquidationIncentive).mul(borrowedPrice).div(collateralPrice)
        const seizeTokens = seizeAmount.mul(exchangeRate)
        const [trollError, info] = await creamtroller.liquidateCalculateSeizeTokens(cTokenBorrowed.address, cTokenCollateral.address, repayAmount)
        expect(trollError).to.eq(TrollError.NO_ERROR)
        expect(info).to.eq(seizeTokens)
      })
    })

    it('returns the correct value for many test cases', async () => {
      const cases = [
        [TEN_18, TEN_18, TEN_18, TEN_18, TEN_18],
        [TEN_18.mul(2), TEN_18, TEN_18, TEN_18, TEN_18],
        // [2e18, 2e18, 1.42e18, 1.3e18, 2.45e18],
        // [2.789e18, 5.230480842e18, 771.32e18, 1.3e18, 10002.45e18],
        // [7.009232529961056e+24, 2.5278726317240445e+24, 2.6177112093242585e+23, 1179713989619784000, 7.790468414639561e+24],
        // [rando(0, 1e25), rando(0, 1e25), rando(1, 1e25), rando(1e18, 1.5e18), rando(0, 1e25)]
      ]
      
      cases.forEach(async (testCase) => {
        const [exchangeRate, borrowedPrice, collateralPrice, liquidationIncentive, repayAmount] = testCase

        // TODO: for some reason the tests won't go here. FIX! Async??
        await priceOracle.setUnderlyingPrice(cTokenCollateral.address, collateralPrice)
        await priceOracle.setUnderlyingPrice(cTokenBorrowed.address, borrowedPrice)
        await creamtroller._setLiquidationIncentive(liquidationIncentive)
        await cTokenCollateral.harnessSetExchangeRate(exchangeRate)

        const seizeAmount = repayAmount.mul(liquidationIncentive).mul(borrowedPrice).div(collateralPrice)
        const seizeTokens = seizeAmount.mul(exchangeRate)
        const asdf = await creamtroller.liquidateCalculateSeizeTokens(cTokenBorrowed.address, cTokenCollateral.address, repayAmount)

        // expect(
        //   await calculateSeizeTokens(comptroller, cTokenBorrowed, cTokenCollateral, repayAmount)
        // ).toHaveTrollErrorTuple(
        //   ['NO_ERROR', Number(seizeTokens)],
        //   (x, y) => Math.abs(x - y) < 1e7
        // );
      })
    })
  })
})
