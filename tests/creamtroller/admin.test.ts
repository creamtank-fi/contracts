import { ethers } from 'hardhat'
import {
  deploy,
  getLogs,
  getTrollErrorAndInfo
} from '../Utils/creamtank'
import { expect } from 'chai'
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers'
import { SimplePriceOracle, Unitroller } from '../../dist/types'
import { TrollError, ZERO_ADDRESS, FailureInfo } from '../Utils/constants'

describe('admin / _setPendingAdmin / _acceptAdmin', () => {
  let root: SignerWithAddress, accounts: SignerWithAddress[]
  let creamtroller: Unitroller
  let priceOracle: SimplePriceOracle

  beforeEach(async () => {
    [root, ...accounts] = await ethers.getSigners()
    priceOracle = await deploy('SimplePriceOracle', [root.address]) as SimplePriceOracle
    creamtroller = await deploy('Unitroller') as Unitroller
  })

  describe('admin()', () => {
    it('should return correct admin', async () => {
      expect(await creamtroller.admin()).to.eq(root.address)
    })
  })

  describe('pendingAdmin()', () => {
    it('should return correct pending admin', async () => {
      expect(await creamtroller.pendingAdmin()).to.eq(ZERO_ADDRESS)
    })
  })

  describe('_setPendingAdmin()', () => {
    it('should only be callable by admin', async () => {
      const logs = await getLogs(
        creamtroller.connect(accounts[0])._setPendingAdmin(accounts[0].address)
      )
      const [trollError, failInfo] = new ethers.utils.AbiCoder().decode(['uint256', 'uint256'], logs![0].data)
      
      expect(trollError).to.eq(TrollError.UNAUTHORIZED)
      expect(failInfo).to.eq(FailureInfo.SET_PENDING_ADMIN_OWNER_CHECK)


      // Check admin stays the same
      expect(await creamtroller.admin()).to.eq(root.address)
      expect(await creamtroller.pendingAdmin()).to.eq(ZERO_ADDRESS)
    })

    it('should properly set pending admin', async () => {
      await creamtroller._setPendingAdmin(accounts[0].address)

      // Check admin stays the same
      expect(await creamtroller.admin()).to.eq(root.address)
      expect(await creamtroller.pendingAdmin()).to.eq(accounts[0].address)
    })

    it('should properly set pending admin twice', async () => {
      await creamtroller._setPendingAdmin(accounts[0].address)
      await creamtroller._setPendingAdmin(accounts[1].address)

      // Check admin stays the same
      expect(await creamtroller.admin()).to.eq(root.address)
      expect(await creamtroller.pendingAdmin()).to.eq(accounts[1].address)
    })

    it('should emit event', async () => {
      const result = await getLogs(creamtroller._setPendingAdmin(accounts[0].address))
      const event = result![0]

      expect(event.event).to.eq('NewPendingAdmin')
      expect(event.args![0]).to.eq(ZERO_ADDRESS)
      expect(event.args![1]).to.eq(accounts[0].address)
    })
  })

  describe('_acceptAdmin()', () => {
    it('should fail when pending admin is zero', async () => {
      const logs = await getLogs(
        creamtroller._acceptAdmin()
      )
      const [trollError, failInfo] = await getTrollErrorAndInfo(creamtroller._acceptAdmin())
      
      expect(trollError).to.eq(TrollError.UNAUTHORIZED)
      expect(failInfo).to.eq(FailureInfo.ACCEPT_ADMIN_PENDING_ADMIN_CHECK)
      
      // Check admin stays the same
      expect(await creamtroller.admin()).to.eq(root.address)
      expect(await creamtroller.pendingAdmin()).to.eq(ZERO_ADDRESS)
    })

    it('should fail when called by another account (e.g. root)', async () => {
      await creamtroller._setPendingAdmin(accounts[0].address)
      const [trollError, failInfo] = await getTrollErrorAndInfo(creamtroller._acceptAdmin())
      expect(trollError).to.eq(TrollError.UNAUTHORIZED)
      expect(failInfo).to.eq(FailureInfo.ACCEPT_ADMIN_PENDING_ADMIN_CHECK)

      // Check admin stays the same
      expect(await creamtroller.admin()).to.eq(root.address)
      expect(await creamtroller.pendingAdmin()).to.eq(accounts[0].address)
    })

    it('should succeed and set admin and clear pending admin', async () => {
      await creamtroller._setPendingAdmin(accounts[0].address)
      await creamtroller.connect(accounts[0])._acceptAdmin()

      // Check admin stays the same
      expect(await creamtroller.admin()).to.eq(accounts[0].address)
      expect(await creamtroller.pendingAdmin()).to.eq(ZERO_ADDRESS)
    })

    it('should emit log on success', async () => {
      await creamtroller._setPendingAdmin(accounts[0].address)
      const result = await getLogs(creamtroller.connect(accounts[0])._acceptAdmin())
      
      const event0 = result![0]
      expect(event0.event).to.eq('NewAdmin')
      expect(event0.args![0]).to.eq(root.address)
      expect(event0.args![1]).to.eq(accounts[0].address)

      const event1 = result![1]
      expect(event1.event).to.eq('NewPendingAdmin')
      expect(event1.args![0]).to.eq(accounts[0].address)
      expect(event1.args![1]).to.eq(ZERO_ADDRESS)
    })
  })
})
