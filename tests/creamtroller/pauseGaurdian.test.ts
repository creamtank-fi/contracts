import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers'
import { expect } from 'chai'
import { ethers } from 'hardhat'
import { CErc20DelegateHarness, Creamtroller } from '../../dist/types'
import { FailureInfo, TrollError, ZERO_ADDRESS } from '../Utils/constants'
import { makeCreamtroller, makeCToken, getTrollErrorAndInfo, getLogs } from '../utils/creamtank'

describe('Creamtroller', () => {
  let creamtroller: Creamtroller, cToken: CErc20DelegateHarness
  let root: SignerWithAddress, accounts: SignerWithAddress[]

  beforeEach(async () => {
    [root, ...accounts] = await ethers.getSigners()
  })

  describe("_setPauseGuardian", () => {
    beforeEach(async () => {
      creamtroller = await makeCreamtroller()
    })

    describe("failing", () => {
      it("emits a failure log if not sent by admin", async () => {
        const [trollError, failInfo] = await getTrollErrorAndInfo(creamtroller.connect(accounts[1])._setPauseGuardian(root.address))
        expect(trollError).to.eq(TrollError.UNAUTHORIZED)
        expect(failInfo).to.eq(FailureInfo.SET_PAUSE_GUARDIAN_OWNER_CHECK)
      })

      it("does not change the pause guardian", async () => {
        let pauseGuardian = await creamtroller.pauseGuardian()
        expect(pauseGuardian).to.eq(ZERO_ADDRESS)

        await creamtroller.connect(accounts[1])._setPauseGuardian(root.address)

        pauseGuardian = await creamtroller.pauseGuardian()
        expect(pauseGuardian).to.eq(ZERO_ADDRESS)
      })
    })


    describe('succesfully changing pause guardian', () => {
      it('emits new pause guardian event and changes the pending pause guardian', async () => {
        const creamtroller = await makeCreamtroller()

        const logs = await getLogs(creamtroller._setPauseGuardian(accounts[1].address))

        expect(logs![0].event).to.eq('NewPauseGuardian')
        expect(logs![0].args![0]).to.eq(ZERO_ADDRESS)
        expect(logs![0].args![1]).to.eq(accounts[1].address)

        const pauseGuardian = await creamtroller.pauseGuardian()
        expect(pauseGuardian).to.eq(accounts[1].address)
      })
    })
  })

  describe('setting paused', () => {
    beforeEach(async () => {
      cToken = await makeCToken({ supportMarket: true })
      creamtroller = await ethers.getContractAt('Creamtroller', await cToken.creamtroller()) as Creamtroller
    })

    describe('succeeding', () => {
      let pauseGuardian: SignerWithAddress
      beforeEach(async () => {
        pauseGuardian = accounts[1]
        await creamtroller.connect(root)._setPauseGuardian(accounts[1].address)
      })

      describe('Global Methods: Transfer', () => {
        it('only pause guardian or admin can pause Transfer', async () => {
          await expect(
            creamtroller.connect(accounts[2])._setTransferPaused(true)
          ).to.be.revertedWith('Error: VM Exception while processing transaction: reverted with reason string \'only pause guardian and admin can pause\'')
          await expect(
            creamtroller.connect(accounts[2])._setTransferPaused(false)
          ).to.be.revertedWith('Error: VM Exception while processing transaction: reverted with reason string \'only pause guardian and admin can pause\'')
        })

        it('PauseGuardian can pause of TransferGuardianPaused', async () => {
          const logs0 = await getLogs(creamtroller.connect(pauseGuardian)._setTransferPaused(true))
          expect(logs0![0].event).to.eq('ActionPaused')
          expect(logs0![0].args![0]).to.eq('Transfer')
          expect(logs0![0].args![1]).to.eq(true)
          expect(await creamtroller.transferGuardianPaused()).to.eq(true)

          const logs1 = await getLogs(creamtroller._setTransferPaused(false))
          expect(logs1![0].event).to.eq('ActionPaused')
          expect(logs1![0].args![0]).to.eq('Transfer')
          expect(logs1![0].args![1]).to.eq(false)
          expect(await creamtroller.transferGuardianPaused()).to.eq(false)
        })

        it('pauses Transfer', async() => {
          await creamtroller.connect(pauseGuardian)._setTransferPaused(true)
          await expect(
            creamtroller.transferAllowed(ZERO_ADDRESS, ZERO_ADDRESS, ZERO_ADDRESS, 1)
          ).to.be.revertedWith('Error: VM Exception while processing transaction: reverted with reason string \'transfer is paused\'')
        })
      })


      describe('Global Methods: Seize', () => {
        it('only pause guardian or admin can pause Seize', async () => {
          await expect(
            creamtroller.connect(accounts[2])._setSeizePaused(true)
          ).to.be.revertedWith('Error: VM Exception while processing transaction: reverted with reason string \'only pause guardian and admin can pause\'')
          await expect(
            creamtroller.connect(accounts[2])._setSeizePaused(false)
          ).to.be.revertedWith('Error: VM Exception while processing transaction: reverted with reason string \'only pause guardian and admin can pause\'')
        })

        it('PauseGuardian can pause of TransferGuardianPaused', async () => {
          const logs0 = await getLogs(creamtroller.connect(pauseGuardian)._setSeizePaused(true))
          expect(logs0![0].event).to.eq('ActionPaused')
          expect(logs0![0].args![0]).to.eq('Seize')
          expect(logs0![0].args![1]).to.eq(true)
          expect(await creamtroller.seizeGuardianPaused()).to.eq(true)

          const logs1 = await getLogs(creamtroller._setSeizePaused(false))
          expect(logs1![0].event).to.eq('ActionPaused')
          expect(logs1![0].args![0]).to.eq('Seize')
          expect(logs1![0].args![1]).to.eq(false)
          expect(await creamtroller.seizeGuardianPaused()).to.eq(false)
        })

        it(`pauses Seize`, async() => {
          await creamtroller.connect(pauseGuardian)._setSeizePaused(true)
          await expect(
            creamtroller.seizeAllowed(ZERO_ADDRESS, ZERO_ADDRESS, ZERO_ADDRESS, ZERO_ADDRESS, 1)
          ).to.be.revertedWith('Error: VM Exception while processing transaction: reverted with reason string \'seize is paused\'')

        })
      })
    })

    describe('succeeding', () => {
      let pauseGuardian: SignerWithAddress
      beforeEach(async () => {
        pauseGuardian = accounts[1]
        await creamtroller.connect(root)._setPauseGuardian(accounts[1].address)
      })

      describe('Market Methods: Borrow', () => {
        it('only pause guardian or admin can pause Borrow', async () => {
          await expect(
            creamtroller.connect(accounts[2])._setBorrowPaused(cToken.address, true)
          ).to.be.revertedWith('Error: VM Exception while processing transaction: reverted with reason string \'only pause guardian and admin can pause\'')
          await expect(
            creamtroller.connect(accounts[2])._setBorrowPaused(cToken.address, false)
          ).to.be.revertedWith('Error: VM Exception while processing transaction: reverted with reason string \'only pause guardian and admin can pause\'')
        })

        it('PauseGuardian can pause of BorrowGuardianPaused', async () => {
          const logs0 = await getLogs(creamtroller.connect(pauseGuardian)._setBorrowPaused(cToken.address, true))
          expect(logs0![0].event).to.eq('ActionPaused')
          expect(logs0![0].args![0]).to.eq(cToken.address)
          expect(logs0![0].args![1]).to.eq('Borrow')
          expect(logs0![0].args![2]).to.eq(true)
          expect(await creamtroller.borrowGuardianPaused(cToken.address)).to.eq(true)

          await expect(
            creamtroller.connect(pauseGuardian)._setBorrowPaused(cToken.address, false)
          ).to.be.revertedWith('Error: VM Exception while processing transaction: reverted with reason string \'only admin can unpause\'')
          
          const logs1 = await getLogs(creamtroller._setBorrowPaused(cToken.address, false))
          expect(logs1![0].event).to.eq('ActionPaused')
          expect(logs1![0].args![0]).to.eq(cToken.address)
          expect(logs1![0].args![1]).to.eq('Borrow')
          expect(logs1![0].args![2]).to.eq(false)
          expect(await creamtroller.borrowGuardianPaused(cToken.address)).to.eq(false)
        })

        it('pauses Borrow', async() => {
          await creamtroller.connect(pauseGuardian)._setBorrowPaused(cToken.address, true)

          await expect(
            creamtroller.borrowAllowed(cToken.address, ZERO_ADDRESS, 1)
          ).to.be.revertedWith('Error: VM Exception while processing transaction: reverted with reason string \'borrow is paused\'')
        })
      })

      describe('Market Methods: Mint', () => {
        it('only pause guardian or admin can pause Borrow', async () => {
          await expect(
            creamtroller.connect(accounts[2])._setMintPaused(cToken.address, true)
          ).to.be.revertedWith('Error: VM Exception while processing transaction: reverted with reason string \'only pause guardian and admin can pause\'')
          await expect(
            creamtroller.connect(accounts[2])._setMintPaused(cToken.address, false)
          ).to.be.revertedWith('Error: VM Exception while processing transaction: reverted with reason string \'only pause guardian and admin can pause\'')
        })

        it('PauseGuardian can pause of BorrowGuardianPaused', async () => {
          const logs0 = await getLogs(creamtroller.connect(pauseGuardian)._setMintPaused(cToken.address, true))
          expect(logs0![0].event).to.eq('ActionPaused')
          expect(logs0![0].args![0]).to.eq(cToken.address)
          expect(logs0![0].args![1]).to.eq('Mint')
          expect(logs0![0].args![2]).to.eq(true)
          expect(await creamtroller.mintGuardianPaused(cToken.address)).to.eq(true)

          await expect(
            creamtroller.connect(pauseGuardian)._setMintPaused(cToken.address, false)
          ).to.be.revertedWith('Error: VM Exception while processing transaction: reverted with reason string \'only admin can unpause\'')
          
          const logs1 = await getLogs(creamtroller._setMintPaused(cToken.address, false))
          expect(logs1![0].event).to.eq('ActionPaused')
          expect(logs1![0].args![0]).to.eq(cToken.address)
          expect(logs1![0].args![1]).to.eq('Mint')
          expect(logs1![0].args![2]).to.eq(false)
          expect(await creamtroller.borrowGuardianPaused(cToken.address)).to.eq(false)
        })

        it(`pauses Mint`, async() => {
          await creamtroller.connect(pauseGuardian)._setMintPaused(cToken.address, true)
          await expect(
            creamtroller.mintAllowed(cToken.address, ZERO_ADDRESS, 1)
          ).to.be.revertedWith('Error: VM Exception while processing transaction: reverted with reason string \'mint is paused\'')
        })
      })
    })
  })
})
