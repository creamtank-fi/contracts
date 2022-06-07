import { run, ethers, network } from "hardhat"
import {
  CreamtankLens__factory,
  Unitroller__factory,
  Creamtroller__factory,
  SimplePriceOracle__factory,
  Creamtroller,
} from '../dist/types'
import fs from 'fs'
import { ZERO_ADDRESS } from "../tests/Utils/constants"

type Config = {
  closeFactor: string
  maxAssets: string
  liquidationIncentive: string
}

async function main() {
  await run("compile")

  const config: Config = require(`${process.cwd()}/config/${network.config.chainId}.json`)

  const [deployer] = await ethers.getSigners()

  console.log(`Deploying contracts with from: ${deployer.address}`)

  const Lens = new CreamtankLens__factory(deployer)
  const lens = await Lens.deploy(ZERO_ADDRESS)
  await lens.deployed()
  console.log(`CreamtankLens deployed to ${lens.address}`)

  const Unitroller = new Unitroller__factory(deployer)
  const unitroller = await Unitroller.deploy()
  await unitroller.deployed()
  console.log(`Unitroller deployed to ${unitroller.address}`)

  const PriceOracle = new SimplePriceOracle__factory(deployer)
  const priceOracle = await PriceOracle.deploy(deployer.address)
  await priceOracle.deployed()
  console.log(`SimplePriceOracle deployed to ${priceOracle.address}`)

  const Creamtroller = new Creamtroller__factory(deployer)
  const creamtroller = await Creamtroller.deploy()
  await creamtroller.deployed()
  console.log(`Creamtroller deployed to ${creamtroller.address}`)

  const tx1 = await unitroller._setPendingImplementation(creamtroller.address)
  await tx1.wait()
  console.log(`Unitroller _setPendingImplementation at ${tx1.hash}`)
  
  const tx2 = await creamtroller._become(unitroller.address)
  await tx2.wait()
  console.log(`Creamtroller _become at ${tx2.hash}`)

  const proxtroller = creamtroller.attach(unitroller.address) as Creamtroller
  
  const tx3 = await proxtroller._setPriceOracle(priceOracle.address)
  await tx3.wait()
  console.log(`Unitroller _setPriceOracle at ${tx3.hash}`)

  const tx4 = await proxtroller._setCloseFactor(config.closeFactor)
  await tx4.wait()
  console.log(`Unitroller _setCloseFactor at ${tx4.hash}`)

  const tx5 = await proxtroller._setMaxAssets(config.maxAssets)
  await tx5.wait()
  console.log(`Unitroller _setMaxAssets at ${tx5.hash}`)

  const tx6 = await proxtroller._setLiquidationIncentive(config.liquidationIncentive)
  await tx6.wait()
  console.log(`Unitroller _setLiquidationIncentive at ${tx6.hash}`)

  const coreAddressPath = `${process.cwd()}/networks/${network.config.chainId}/coreAddresses.json`
  const coreAddressBook = {
    deployer: deployer.address,
    lens: lens.address,
    unitroller: unitroller.address,
    creamtroller: creamtroller.address,
    oracle: priceOracle.address,
  }
  fs.writeFileSync(
    coreAddressPath,
    JSON.stringify(coreAddressBook, null, 2)
  )

  const coreTransactionPath = `${process.cwd()}/networks/${network.config.chainId}/coreTransactions.json`
  const coreTransactions = {
    _setPendingImplementation: tx1.hash,
    _become: tx2.hash,
    _setPriceOracle: tx3.hash,
    _setCloseFactor: tx4.hash,
    _setMaxAssets: tx5.hash,
    _setLiquidationIncentive: tx6.hash,
  }
  fs.writeFileSync(
    coreTransactionPath,
    JSON.stringify(coreTransactions, null, 2)
  )
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
