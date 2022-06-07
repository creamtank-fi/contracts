import { ethers } from 'hardhat'
import {
  makeCreamtroller,
  makeCToken,
  enterMarkets,
  enterMarketsStatic,
  deploy,
  getError,
  quickMint,
  getLogs,
  arrEq,
  getTrollError
} from '../Utils/creamtank'
import { expect } from 'chai'
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers'
import { CErc20DelegateHarness, Creamtroller, SimplePriceOracle, ERC20Harness__factory } from '../../dist/types'
import { TEN_18, TrollError } from '../Utils/constants'

describe('assetListTest', () => {
  let root: SignerWithAddress, customer: SignerWithAddress, accounts: SignerWithAddress[]
  let creamtroller: Creamtroller
  let allTokens: CErc20DelegateHarness[],
      OMG: CErc20DelegateHarness,
      ZRX: CErc20DelegateHarness,
      BAT: CErc20DelegateHarness,
      REP: CErc20DelegateHarness,
      DAI: CErc20DelegateHarness,
      SKT: CErc20DelegateHarness

  beforeEach(async () => {
    [root, customer, ...accounts] = await ethers.getSigners()
    creamtroller = await makeCreamtroller()

    OMG = await makeCToken({ creamtroller, name: 'OMG', symbol: 'OMG', supportMarket: true, underlyingPrice: TEN_18.mul(5).div(10) })
    ZRX = await makeCToken({ creamtroller, name: 'ZRX', symbol: 'ZRX', supportMarket: true, underlyingPrice: TEN_18.mul(5).div(10) })
    BAT = await makeCToken({ creamtroller, name: 'BAT', symbol: 'BAT', supportMarket: true, underlyingPrice: TEN_18.mul(5).div(10) })
    REP = await makeCToken({ creamtroller, name: 'REP', symbol: 'REP', supportMarket: true, underlyingPrice: TEN_18.mul(5).div(10) })
    DAI = await makeCToken({ creamtroller, name: 'DAI', symbol: 'DAI', supportMarket: true, underlyingPrice: TEN_18.mul(5).div(10) })
    SKT = await makeCToken({ creamtroller, name: 'SKT', symbol: 'SKT', supportMarket: false, underlyingPrice: TEN_18.mul(5).div(10) })
    
    allTokens = [OMG, ZRX, BAT, REP, DAI, SKT]
  })

  async function checkMarkets(expectedTokens: CErc20DelegateHarness[]) {
    const expectedSymbols = await Promise.all(expectedTokens.map(async (token) => token.symbol()))
    for (let token of allTokens) {
      const symbol = await token.symbol()
      const isExpected = expectedSymbols.some(e => symbol == e)
      expect(await creamtroller.checkMembership(customer.address, token.address)).to.eq(isExpected)
    }
  }

  async function enterAndCheckMarkets(enterTokens: CErc20DelegateHarness[], expectedTokens: CErc20DelegateHarness[], expectedErrors?: TrollError[]) {
    const staticTxs = await enterMarketsStatic(enterTokens, customer)
    const errs = expectedErrors || enterTokens.map(_ => TrollError.NO_ERROR)
    staticTxs.forEach((tokenReply, i) => {
      expect(tokenReply).to.eq(errs[i])
    })
    const tx = await enterMarkets(enterTokens, customer)
    const assetsIn = await creamtroller.getAssetsIn(customer.address)
    expect(arrEq(assetsIn, expectedTokens.map(t => t.address))).to.eq(true)
    await checkMarkets(expectedTokens)

    return tx
  }

  async function exitAndCheckMarkets(exitToken: CErc20DelegateHarness, expectedTokens: CErc20DelegateHarness[], expectedError: TrollError = TrollError.NO_ERROR) {
    const staticTx = await creamtroller.connect(customer).callStatic.exitMarket(exitToken.address)
    expect(staticTx).to.eq(expectedError)

    const tx = await creamtroller.connect(customer).exitMarket(exitToken.address)
    const assetsIn = await creamtroller.getAssetsIn(customer.address)
    
    expect(arrEq(assetsIn, expectedTokens.map(t => t.address))).to.eq(true)
    await checkMarkets(expectedTokens)
    return tx
  }

  describe('enterMarkets', () => {
    it('properly emits events', async () => {
      const result1 = await getLogs(enterAndCheckMarkets([OMG], [OMG]))
      const result2 = await getLogs(enterAndCheckMarkets([OMG], [OMG]))

      const event0 = result1![0]
      expect(event0.event).to.eq('MarketEntered')
      expect(event0.args![0]).to.eq(OMG.address)
      expect(event0.args![1]).to.eq(customer.address)

      expect(arrEq(result2!, [])).to.eq(true)
    })

    it('adds to the asset list only once', async () => {
      await enterAndCheckMarkets([OMG], [OMG])
      await enterAndCheckMarkets([OMG], [OMG])
      await enterAndCheckMarkets([ZRX, BAT, OMG], [OMG, ZRX, BAT])
      await enterAndCheckMarkets([ZRX, OMG], [OMG, ZRX, BAT])
      await enterAndCheckMarkets([ZRX], [OMG, ZRX, BAT])
      await enterAndCheckMarkets([OMG], [OMG, ZRX, BAT])
      await enterAndCheckMarkets([ZRX], [OMG, ZRX, BAT])
      await enterAndCheckMarkets([BAT], [OMG, ZRX, BAT])
    })

    it('the market must be listed for add to succeed', async () => {
      await enterAndCheckMarkets([SKT], [], [TrollError.MARKET_NOT_LISTED])
      await creamtroller._supportMarket(SKT.address)
      await enterAndCheckMarkets([SKT], [SKT])
    })

    it('returns a list of codes mapping to user\'s ultimate membership in given addresses', async () => {
      await enterAndCheckMarkets([OMG, ZRX, BAT], [OMG, ZRX, BAT], [TrollError.NO_ERROR, TrollError.NO_ERROR, TrollError.NO_ERROR])
      await enterAndCheckMarkets([OMG, SKT], [OMG, ZRX, BAT], [TrollError.NO_ERROR, TrollError.MARKET_NOT_LISTED])
    })
  })

  describe('exitMarket', () => {
    it('doesn\'t let you exit if you have a borrow balance', async () => {
      await enterAndCheckMarkets([OMG], [OMG])
      await OMG.harnessSetAccountBorrows(customer.address, 1, 1)
      await exitAndCheckMarkets(OMG, [OMG], TrollError.NONZERO_BORROW_BALANCE)
    })

    it('rejects unless redeem allowed', async () => {
      await enterAndCheckMarkets([OMG, BAT], [OMG, BAT])
      await BAT.harnessSetAccountBorrows(customer.address, 1, 1)

      // BAT has a negative balance and there's no supply, thus account should be underwater
      await exitAndCheckMarkets(OMG, [OMG, BAT], TrollError.REJECTION)
    })

    it('accepts when you\'re not in the market already', async () => {
      await enterAndCheckMarkets([OMG, BAT], [OMG, BAT])

      // Not in ZRX, should exit fine
      await exitAndCheckMarkets(ZRX, [OMG, BAT], TrollError.NO_ERROR)
    })

    it('properly removes when there\'s only one asset', async () => {
      await enterAndCheckMarkets([OMG], [OMG])
      await exitAndCheckMarkets(OMG, [], TrollError.NO_ERROR)
    })

    it('properly removes when there\'s only two assets, removing the first', async () => {
      await enterAndCheckMarkets([OMG, BAT], [OMG, BAT])
      await exitAndCheckMarkets(OMG, [BAT], TrollError.NO_ERROR)
    })

    it('properly removes when there\'s only two assets, removing the second', async () => {
      await enterAndCheckMarkets([OMG, BAT], [OMG, BAT])
      await exitAndCheckMarkets(BAT, [OMG], TrollError.NO_ERROR)
    })

    it('properly removes when there\'s only three assets, removing the first', async () => {
      await enterAndCheckMarkets([OMG, BAT, ZRX], [OMG, BAT, ZRX])
      await exitAndCheckMarkets(OMG, [ZRX, BAT], TrollError.NO_ERROR)
    })

    it('properly removes when there\'s only three assets, removing the second', async () => {
      await enterAndCheckMarkets([OMG, BAT, ZRX], [OMG, BAT, ZRX])
      await exitAndCheckMarkets(BAT, [OMG, ZRX], TrollError.NO_ERROR)
    })

    it('properly removes when there\'s only three assets, removing the third', async () => {
      await enterAndCheckMarkets([OMG, BAT, ZRX], [OMG, BAT, ZRX])
      await exitAndCheckMarkets(ZRX, [OMG, BAT], TrollError.NO_ERROR)
    })
  })

  describe('entering from borrowAllowed', () => {
    it('enters when called by a ctoken', async () => {
      await BAT.connect(customer).harnessCallBorrowAllowed(1)

      const assetsIn = await creamtroller.getAssetsIn(customer.address)

      expect(arrEq([BAT.address], assetsIn)).to.eq(true)

      await checkMarkets([BAT])
    })

    it('reverts when called by not a ctoken', async () => {
      await expect(
        creamtroller.connect(customer).borrowAllowed(BAT.address, customer.address, 1)
      ).to.be.revertedWith('Error: VM Exception while processing transaction: reverted with reason string \'sender must be cToken\'')

      const assetsIn = await creamtroller.getAssetsIn(customer.address)

      expect(arrEq([], assetsIn)).to.eq(true)

      await checkMarkets([])
    })

    it('adds to the asset list only once', async () => {
      await BAT.connect(customer).harnessCallBorrowAllowed(1)

      await enterAndCheckMarkets([BAT], [BAT])

      await BAT.connect(customer).harnessCallBorrowAllowed(1)
      const assetsIn = await creamtroller.getAssetsIn(customer.address)
      expect(arrEq([BAT.address], assetsIn)).to.eq(true)
    })
  })
})
