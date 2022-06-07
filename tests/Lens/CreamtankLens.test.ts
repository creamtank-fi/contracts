import { ethers } from 'hardhat'
import { expect } from 'chai'
import {
  makeCreamtroller,
  deploy,
  arrEq,
  makeCToken
} from '../Utils/creamtank'
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers'
import { CreamtankLens, Ctank } from '../../dist/types'
import { TEN_18, ZERO_ADDRESS } from '../Utils/constants'
import { getCurrentBlock } from '../utils/ethereum'

  
describe('creamtankLens', () => {
  let creamtankLens: CreamtankLens
  let acct: SignerWithAddress
  
  beforeEach(async () => {
    const [...accounts] = await ethers.getSigners()
    creamtankLens = await deploy('CreamtankLens', [ZERO_ADDRESS]) as CreamtankLens
    acct = accounts[0]
  })
  
  describe('cTokenMetadata', () => {
    it('is correct for a cErc20', async () => {
      let cErc20 = await makeCToken()
      const result = await creamtankLens.callStatic.cTokenMetadata(cErc20.address)
      expect(result.cToken).to.eq(cErc20.address)
      expect(result.exchangeRateCurrent).to.eq(TEN_18)
      expect(result.supplyRatePerBlock).to.eq(0)
      expect(result.borrowRatePerBlock).to.eq(0)
      expect(result.reserveFactorMantissa).to.eq(0)
      expect(result.totalBorrows).to.eq(0)
      expect(result.totalReserves).to.eq(0)
      expect(result.totalSupply).to.eq(0)
      expect(result.totalCash).to.eq(0)
      expect(result.isListed).to.eq(false)
      expect(result.collateralFactorMantissa).to.eq(0)
      expect(result.underlyingAssetAddress).to.eq(await cErc20.underlying())
      expect(result.cTokenDecimals).to.eq(8)
      expect(result.underlyingDecimals).to.eq(18)
      expect(result.borrowCap).to.eq(0)
      expect(result.supplyCtankRewardsPerSecond).to.eq(0)
      expect(result.borrowCtankRewardsPerSecond).to.eq(0)
    })
  
    it('is correct for cErc20 with set ctank speeds', async () => {
    //   let creamtroller = await makecreamtroller()
    //   let cErc20 = await makeCToken({creamtroller, supportMarket: true})
    //   await send(creamtroller, '_setCtankSpeeds', [[cErc20.address], [etherExp(0.25)], [etherExp(0.75)]])
    //   expect(
    //     cullTuple(await call(creamtankLens, 'cTokenMetadata', [cErc20.address]))
    //   ).toEqual(
    //     {
    //       cToken: cErc20.address,
    //       exchangeRateCurrent: "1000000000000000000",
    //       supplyRatePerBlock: "0",
    //       borrowRatePerBlock: "0",
    //       reserveFactorMantissa: "0",
    //       totalBorrows: "0",
    //       totalReserves: "0",
    //       totalSupply: "0",
    //       totalCash: "0",
    //       isListed: true,
    //       collateralFactorMantissa: "0",
    //       underlyingAssetAddress: await call(cErc20, 'underlying', []),
    //       cTokenDecimals: "8",
    //       underlyingDecimals: "18",
    //       ctankSupplySpeed: "250000000000000000",
    //       ctankBorrowSpeed: "750000000000000000",
    //       borrowCap: "0",
    //     }
    //   )
    })
  })
  
  describe('cTokenMetadataAll', () => {
    it('is correct for two cErc20s', async () => {
      let firstCErc20 = await makeCToken()
      let secondCErc20 = await makeCToken()

      const [md1, md2] = await creamtankLens.callStatic.cTokenMetadataAll([firstCErc20.address, secondCErc20.address])

      expect(md1.cToken).to.eq(firstCErc20.address)
      expect(md1.exchangeRateCurrent).to.eq(TEN_18)
      expect(md1.supplyRatePerBlock).to.eq(0)
      expect(md1.borrowRatePerBlock).to.eq(0)
      expect(md1.reserveFactorMantissa).to.eq(0)
      expect(md1.totalBorrows).to.eq(0)
      expect(md1.totalReserves).to.eq(0)
      expect(md1.totalSupply).to.eq(0)
      expect(md1.totalCash).to.eq(0)
      expect(md1.isListed).to.eq(false)
      expect(md1.collateralFactorMantissa).to.eq(0)
      expect(md1.underlyingAssetAddress).to.eq(await firstCErc20.underlying())
      expect(md1.cTokenDecimals).to.eq(8)
      expect(md1.underlyingDecimals).to.eq(18)
      expect(md1.borrowCap).to.eq(0)
      expect(md1.supplyCtankRewardsPerSecond).to.eq(0)
      expect(md1.borrowCtankRewardsPerSecond).to.eq(0)

      expect(md2.cToken).to.eq(secondCErc20.address)
      expect(md2.exchangeRateCurrent).to.eq(TEN_18)
      expect(md2.supplyRatePerBlock).to.eq(0)
      expect(md2.borrowRatePerBlock).to.eq(0)
      expect(md2.reserveFactorMantissa).to.eq(0)
      expect(md2.totalBorrows).to.eq(0)
      expect(md2.totalReserves).to.eq(0)
      expect(md2.totalSupply).to.eq(0)
      expect(md2.totalCash).to.eq(0)
      expect(md2.isListed).to.eq(false)
      expect(md2.collateralFactorMantissa).to.eq(0)
      expect(md2.underlyingAssetAddress).to.eq(await secondCErc20.underlying())
      expect(md2.cTokenDecimals).to.eq(8)
      expect(md2.underlyingDecimals).to.eq(18)
      expect(md2.borrowCap).to.eq(0)
      expect(md2.supplyCtankRewardsPerSecond).to.eq(0)
      expect(md2.borrowCtankRewardsPerSecond).to.eq(0)
    })
  })
  
  describe('cTokenBalances', () => {
    it('is correct for cERC20', async () => {
      let cErc20 = await makeCToken()
      const result = await creamtankLens.callStatic.cTokenBalances(cErc20.address, acct.address)

      expect(result.cToken).to.eq(cErc20.address)
      expect(result.balanceOf).to.eq(0)
      expect(result.borrowBalanceCurrent).to.eq(0)
      expect(result.balanceOfUnderlying).to.eq(0)
      expect(result.tokenBalance).to.eq(TEN_18.mul(10_000_000))
      expect(result.tokenAllowance).to.eq(0)
    })
  })
  
  describe('cTokenBalancesAll', () => {
    it('is correct for two and cErc20s', async () => {
      let firstCErc20 = await makeCToken()
      let secondCErc20 = await makeCToken()
      
      const [b1, b2] = await creamtankLens.callStatic.cTokenBalancesAll([firstCErc20.address, secondCErc20.address], acct.address)

      expect(b1.cToken).to.eq(firstCErc20.address)
      expect(b1.balanceOf).to.eq(0)
      expect(b1.borrowBalanceCurrent).to.eq(0)
      expect(b1.balanceOfUnderlying).to.eq(0)
      expect(b1.tokenBalance).to.eq(TEN_18.mul(10_000_000))
      expect(b1.tokenAllowance).to.eq(0)

      expect(b2.cToken).to.eq(secondCErc20.address)
      expect(b2.balanceOf).to.eq(0)
      expect(b2.borrowBalanceCurrent).to.eq(0)
      expect(b2.balanceOfUnderlying).to.eq(0)
      expect(b2.tokenBalance).to.eq(TEN_18.mul(10_000_000))
      expect(b2.tokenAllowance).to.eq(0)
    })
  })
  
  describe('cTokenUnderlyingPrice', () => {
    it('gets correct price for cErc20', async () => {
      let cErc20 = await makeCToken()
      const result = await creamtankLens.callStatic.cTokenUnderlyingPrice(cErc20.address)

      expect(result.cToken).to.eq(cErc20.address)
      expect(result.underlyingPrice).to.eq(0)
    })
  })
  
  describe('cTokenUnderlyingPriceAll', () => {
    it('gets correct price for both', async () => {
      let firstCErc20 = await makeCToken()
      let secondCErc20 = await makeCToken()

      const [u1, u2] = await creamtankLens.callStatic.cTokenUnderlyingPriceAll([firstCErc20.address, secondCErc20.address])

      expect(u1.cToken).to.eq(firstCErc20.address)
      expect(u1.underlyingPrice).to.eq(0)
      
      expect(u2.cToken).to.eq(secondCErc20.address)
      expect(u2.underlyingPrice).to.eq(0)
    })
  })
  
  describe('getAccountLimits', () => {
    it('gets correct values', async () => {
      let creamtroller = await makeCreamtroller()

      const result = await creamtankLens.callStatic.getAccountLimits(creamtroller.address, acct.address)

      expect(result.liquidity).to.eq(0)
      expect(result.shortfall).to.eq(0)
      expect(arrEq(result.markets, [])).to.eq(true)
    })
  })
  
  // describe('governance', () => {
  //   let ctank: Ctank, gov: Governa
  //   let targets, values, signatures, callDatas
  //   let proposalBlock, proposalId

  //   beforeEach(async () => {
  //     ctank = await deploy('Ctank', [acct]) as Ctank
  //     gov = await deploy('GovernorAlpha', [address(0), ctank.address, address(0)])
  //     targets = [acct]
  //     values = ["0"]
  //     signatures = ["getBalanceOf(address)"]
  //     callDatas = [encodeParameters(['address'], [acct])]
  //     await send(ctank, 'delegate', [acct])
  //     await send(gov, 'propose', [targets, values, signatures, callDatas, "do nothing"])
  //     proposalBlock = +(await web3.eth.getBlockNumber())
  //     proposalId = await call(gov, 'latestProposalIds', [acct])
  //   })

  //   describe('getGovReceipts', () => {
  //     it('gets correct values', async () => {
  //       expect(
  //         (await call(creamtankLens, 'getGovReceipts', [gov.address, acct, [proposalId]])).map(cullTuple)
  //       ).toEqual([
  //         {
  //           hasVoted: false,
  //           proposalId: proposalId,
  //           support: false,
  //           votes: "0",
  //         }
  //       ])
  //     })
  //   })

  //   describe('getGovProposals', () => {
  //     it('gets correct values', async () => {
  //       expect(
  //         (await call(creamtankLens, 'getGovProposals', [gov.address, [proposalId]])).map(cullTuple)
  //       ).toEqual([
  //         {
  //           againstVotes: "0",
  //           calldatas: callDatas,
  //           canceled: false,
  //           endBlock: (Number(proposalBlock) + 17281).toString(),
  //           eta: "0",
  //           executed: false,
  //           forVotes: "0",
  //           proposalId: proposalId,
  //           proposer: acct,
  //           signatures: signatures,
  //           startBlock: (Number(proposalBlock) + 1).toString(),
  //           targets: targets
  //         }
  //       ])
  //     })
  //   })
  // })

  describe('ctank', () => {
    let ctank: Ctank, currentBlock: number

    beforeEach(async () => {
      const block = await getCurrentBlock()
      currentBlock = +(block.number)
      ctank = await deploy('Ctank', [acct.address]) as Ctank
    })

    describe('getCtankBalanceMetadata', () => {
      it('gets correct values', async () => {
        const result = await creamtankLens.getCtankBalanceMetadata(ctank.address, acct.address)
        
        expect(result.balance).to.eq(TEN_18.mul(10_000_000))
        expect(result.delegate).to.eq(ZERO_ADDRESS)
        expect(result.votes).to.eq(0)
      })
    })

    describe('getCtankBalanceMetadataExt', () => {
      it('gets correct values', async () => {
        let creamtroller = await makeCreamtroller()
        // await send(creamtroller, 'setCtankAccrued', [acct, 5]) // harness only

        // expect(
        //   cullTuple(await call(creamtankLens, 'getCtankBalanceMetadataExt', [ctank.address, creamtroller.address, acct]))
        // ).toEqual({
        //   balance: "10000000000000000000000000",
        //   delegate: "0x0000000000000000000000000000000000000000",
        //   votes: "0",
        //   allocated: "5"
        // })
      })
    })

    describe('getCtankVotes', () => {
      it('gets correct values', async () => {
        const [r1, r2] = await creamtankLens.getCtankVotes(ctank.address, acct.address, [currentBlock, currentBlock - 1])
        
        expect(r1.blockNumber).to.eq(currentBlock)
        expect(r1.votes).to.eq(0)
        expect(r2.blockNumber).to.eq(currentBlock-1)
        expect(r2.votes).to.eq(0)
      })

      it('reverts on future value', async () => {
        await expect(
          creamtankLens.getCtankVotes(ctank.address, acct.address, [currentBlock + 1])
        ).to.be.revertedWith('Ctank::getPriorVotes: not yet determined')
      })
    })
  })
})
  