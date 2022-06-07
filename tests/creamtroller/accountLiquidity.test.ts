import { ethers } from 'hardhat'
import {
  makeCreamtroller,
  makeCToken,
  enterMarkets,
  deploy,
  getError,
  quickMint,
} from '../Utils/creamtank'
import { expect } from 'chai'
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers'
import { Creamtroller, SimplePriceOracle, ERC20Harness__factory } from '../../dist/types'
import { TEN_18, TrollError } from '../Utils/constants'

describe('Comptroller', () => {
  let root: SignerWithAddress, accounts: SignerWithAddress[]
  let creamtroller: Creamtroller
  let priceOracle: SimplePriceOracle

  beforeEach(async () => {
    [root, ...accounts] = await ethers.getSigners()
    priceOracle = await deploy('SimplePriceOracle', [root.address]) as SimplePriceOracle
    creamtroller = await makeCreamtroller({ priceOracle })
  })

  describe('liquidity', () => {
    it("fails if a price has not been set", async () => {
      const cToken = await makeCToken({ creamtroller, supportMarket: true })
      await enterMarkets([cToken], accounts[1])
       expect(
        await getError(creamtroller.getAccountLiquidity(accounts[1].address))
      ).to.eq(TrollError.PRICE_ERROR)
    })

    it("allows a borrow up to collateralFactor, but not more", async () => {
      const collateralFactor = TEN_18.mul(5).div(10),  // 0.5 normalized to e18
            underlyingPrice = TEN_18, // 1
            user = accounts[1],
            amount = 1e6
      const cToken = await makeCToken({
        supportMarket: true,
        collateralFactor,
        underlyingPrice,
        creamtroller,
      })

      // not in market yet, hypothetical borrow should have no effect
      const [,liquidity0, shortfall0] = await creamtroller.getHypotheticalAccountLiquidity(user.address, cToken.address, 0, amount)
      expect(liquidity0).to.eq(0)
      expect(shortfall0).to.eq(0)

      await enterMarkets([cToken], user)
      await quickMint(cToken, user, amount)

      // total account liquidity after supplying `amount`
      const [,liquidity1, shortfall1] = await creamtroller.getAccountLiquidity(user.address)
      expect(liquidity1).to.eq(collateralFactor.mul(amount).div(TEN_18))
      expect(shortfall1).to.eq(0)

      // hypothetically borrow `amount`, should shortfall over collateralFactor
      const [,liquidity2, shortfall2] = await creamtroller.getHypotheticalAccountLiquidity(user.address, cToken.address, 0, amount)
      expect(liquidity2).to.eq(0)
      expect(shortfall2).to.eq(TEN_18.sub(collateralFactor).mul(amount).div(TEN_18)) // amount * (1 - collateralFactor) (normalized)

      // // hypothetically redeem `amount`, should be back to even
      const [,liquidity3, shortfall3] = await creamtroller.getHypotheticalAccountLiquidity(user.address, cToken.address, amount, 0)
      expect(liquidity3).to.eq(0)
      expect(shortfall3).to.eq(0)
    })

    it("allows entering 3 markets, supplying to 2 and borrowing up to collateralFactor in the 3rd", async () => {
      const amount1 = 1e6,
            amount2 = 1e3,
            user = accounts[1]
      const cf1 = TEN_18.mul(5).div(10), // 0.5
            cf2 = TEN_18.mul(666).div(1000), // 0.666
            cf3 = 0,
            up1 = TEN_18.mul(3), // 3
            up2 = TEN_18.mul(2718).div(1000), // 2.718
            up3 = TEN_18 // 1
      const c1 = cf1.mul(up1).mul(amount1).div(TEN_18).div(TEN_18), // amount1 * cf1 * up1
            c2 = cf2.mul(up2).mul(amount2).div(TEN_18).div(TEN_18), // amount2 * cf2 * up2
            collateral = c1.add(c2)
      const cToken1 = await makeCToken({ supportMarket: true, creamtroller, collateralFactor: cf1, underlyingPrice: up1 })
      const cToken2 = await makeCToken({ supportMarket: true, creamtroller, collateralFactor: cf2, underlyingPrice: up2 })
      const cToken3 = await makeCToken({ supportMarket: true, creamtroller, collateralFactor: cf3, underlyingPrice: up3 })

      await enterMarkets([cToken1, cToken2, cToken3], user)
      await quickMint(cToken1, user, amount1)
      await quickMint(cToken2, user, amount2)

      const [error0, liquidity0, shortfall0] = await creamtroller.getAccountLiquidity(user.address)
      expect(error0).to.eq(0)
      expect(liquidity0).to.eq(collateral)
      expect(shortfall0).to.eq(0)

      const [, liquidity1, shortfall1] = await creamtroller.getHypotheticalAccountLiquidity(user.address, cToken3.address, c2, 0)
      expect(liquidity1).to.eq(collateral)
      expect(shortfall1).to.eq(0)

      const [, liquidity2, shortfall2] = await creamtroller.getHypotheticalAccountLiquidity(user.address, cToken3.address, 0, c2)
      expect(liquidity2).to.eq(c1)
      expect(shortfall2).to.eq(0)

      const [, liquidity3, shortfall3] = await creamtroller.getHypotheticalAccountLiquidity(user.address, cToken3.address, 0, collateral.add(c1))
      expect(liquidity3).to.eq(0)
      expect(shortfall3).to.eq(c1)

      const [, liquidity4, shortfall4] = await creamtroller.getHypotheticalAccountLiquidity(user.address, cToken1.address, amount1, 0)
      expect(liquidity4).to.eq(c2)
      expect(shortfall4).to.eq(0)
    })
  })

  describe("getAccountLiquidity", () => {
    it("returns 0 if not 'in' any markets", async () => {
      const [error, liquidity, shortfall] = await creamtroller.getAccountLiquidity(accounts[0].address)
      expect(error).to.eq(0)
      expect(liquidity).to.eq(0)
      expect(shortfall).to.eq(0)
    })
  })

  describe("getHypotheticalAccountLiquidity", () => {
    it("returns 0 if not 'in' any markets", async () => {
      const cToken = await makeCToken()
      const [error, liquidity, shortfall] = await creamtroller.getHypotheticalAccountLiquidity(accounts[0].address, cToken.address, 0, 0)
      expect(error).to.eq(0)
      expect(liquidity).to.eq(0)
      expect(shortfall).to.eq(0)
    })

    it("returns collateral factor times dollar amount of tokens minted in a single market", async () => {
      const collateralFactor = TEN_18.mul(5).div(10), // 0.5
            exchangeRate = TEN_18, // 1
            underlyingPrice = TEN_18 // 1
      const cToken = await makeCToken({ supportMarket: true, collateralFactor, exchangeRate, underlyingPrice, creamtroller })
      const from = accounts[0], balance = 1e7, amount = 1e6
      await enterMarkets([cToken], from)
      
      const underlying = ERC20Harness__factory.connect(await cToken.underlying(), from)
      await underlying.harnessSetBalance(from.address, balance)
      await underlying.approve(cToken.address, balance)
      await cToken.connect(from).mint(amount)

      const [error, liquidity, shortfall] = await creamtroller.getHypotheticalAccountLiquidity(from.address, cToken.address, 0, 0)
      expect(error).to.eq(0)
      expect(liquidity).to.eq(collateralFactor.mul(exchangeRate).mul(underlyingPrice).mul(amount).div(TEN_18.pow(3))) // amount * collateralFactor * exchangeRate * underlyingPrice
      expect(shortfall).to.eq(0)
    })
  })
})
