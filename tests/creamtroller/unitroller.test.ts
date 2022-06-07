import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers'
import { expect } from 'chai'
import { ethers } from 'hardhat'
import { EchoTypesCreamtroller, Creamtroller, SimplePriceOracle, Unitroller } from '../../dist/types'
import { FailureInfo, TrollError, ZERO_ADDRESS } from '../Utils/constants'
import { getTrollErrorAndInfo, getLogs, deploy } from '../utils/creamtank'


describe('Unitroller', () => {
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

  describe('constructor', () => {
    it('sets admin to caller and addresses to 0', async () => {
      expect(await unitroller.admin()).to.eq(root.address)
      expect(await unitroller.pendingAdmin()).to.eq(ZERO_ADDRESS)
      expect(await unitroller.pendingCreamtrollerImplementation()).to.eq(ZERO_ADDRESS)
      expect(await unitroller.creamtrollerImplementation()).to.eq(ZERO_ADDRESS)
    })
  })

  describe('_setPendingImplementation', () => {
    it('Checks caller is admin', async () => {
      const [trollError, failInfo] = await getTrollErrorAndInfo(unitroller.connect(accounts[1])._setPendingImplementation(brains.address))
      expect(trollError).to.eq(TrollError.UNAUTHORIZED)
      expect(failInfo).to.eq(FailureInfo.SET_PENDING_IMPLEMENTATION_OWNER_CHECK)

      expect(await unitroller.pendingCreamtrollerImplementation()).to.eq(ZERO_ADDRESS)
    })

    describe('succeeding', () => {
      it('stores pendingCreamtrollerImplementation with value newPendingImplementation', async () => {
        await unitroller.connect(root)._setPendingImplementation(brains.address)
        expect(await unitroller.pendingCreamtrollerImplementation()).to.eq(brains.address)
      })

      it('emits NewPendingImplementation event', async () => {
        const logs = await getLogs(unitroller._setPendingImplementation(brains.address))
        expect(logs![0].event).to.eq('NewPendingImplementation')
        expect(logs![0].args![0]).to.eq(ZERO_ADDRESS)
        expect(logs![0].args![1]).to.eq(brains.address)
      })
    })
  })

  describe('_acceptImplementation', () => {
    it('Checks caller is pendingCreamtrollerImplementation  and pendingCreamtrollerImplementation ≠ address(0) ', async () => {
      await unitroller.connect(root)._setPendingImplementation(unitroller.address)
      const [trollError, failInfo] = await getTrollErrorAndInfo(unitroller._acceptImplementation())

      expect(trollError).to.eq(TrollError.UNAUTHORIZED)
      expect(failInfo).to.eq(FailureInfo.ACCEPT_PENDING_IMPLEMENTATION_ADDRESS_CHECK)

      expect(await unitroller.creamtrollerImplementation()).to.eq(ZERO_ADDRESS)
    })

    it('the brains must accept the responsibility of implementation', async () => {
      await unitroller.connect(root)._setPendingImplementation(brains.address)
      await brains._become(unitroller.address)

      expect(await unitroller.creamtrollerImplementation()).to.eq(brains.address)
      expect(await unitroller.pendingCreamtrollerImplementation()).to.eq(ZERO_ADDRESS)
    })

    describe('fallback delegates to brains', () => {
      let troll0: EchoTypesCreamtroller
      let troll: EchoTypesCreamtroller
      beforeEach(async () => {
        troll0 = await deploy('EchoTypesCreamtroller') as EchoTypesCreamtroller
        unitroller = await deploy('Unitroller') as Unitroller
        await unitroller.connect(root)._setPendingImplementation(troll0.address)
        await troll0.becomeBrains(unitroller.address)
        troll = troll0.attach(unitroller.address) as EchoTypesCreamtroller
      })

      it('forwards reverts', async () => {
        await expect(troll.reverty()).to.be.revertedWith('VM Exception while processing transaction: reverted with reason string "gotcha sucka"')
      })

      it('gets addresses', async () => {
        expect(await troll.addresses(troll.address)).to.eq(troll.address)
      })

      it('gets strings', async () => {
        expect(await troll.stringy('yeet')).to.eq('yeet')
      })

      it('gets bools', async () => {
        expect(await troll.booly(true)).to.eq(true)
      })

      it('gets list of ints', async () => {
        const [one, two, three] = await troll.listOInts([1, 2, 3])
        expect(one).to.eq(1)
        expect(two).to.eq(2)
        expect(three).to.eq(3)
      })
    })
  })
})
