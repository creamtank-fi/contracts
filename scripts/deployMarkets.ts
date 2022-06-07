import { run, ethers, network } from "hardhat"
import {
  JumpRateModelV2__factory,
  CErc20Delegate__factory,
  CErc20Delegator__factory,
  Creamtroller__factory,
  Unitroller__factory,
  Creamtroller
} from '../dist/types'
import fs from 'fs'
import {
  Core,
  Config,
} from './utils/types'

async function main() {
  await run("compile")

  const coreAddresses: Core = require(`${process.cwd()}/networks/${network.config.chainId}/coreAddresses.json`)
  const config: Config = require(`${process.cwd()}/config/${network.config.chainId}.json`)

  const [deployer] = await ethers.getSigners()

  console.log(`Deploying contracts with from: ${deployer.address}`)

  const creamtroller = new Creamtroller__factory(deployer).attach(coreAddresses.creamtroller)
  const unitroller = new Unitroller__factory(deployer).attach(coreAddresses.unitroller)
  const proxtroller = creamtroller.attach(unitroller.address) as Creamtroller 

  const marketAddressBook: any = {}

  for (let token of config.tokens) {
    const JumpRateModel = new JumpRateModelV2__factory(deployer)
    const jumpRateModel = await JumpRateModel.deploy(
      token.interestRateModel.baseRatePerYear,
      token.interestRateModel.multiplierPerYear,
      token.interestRateModel.jumpMultiplierPerYear,
      token.interestRateModel.kink,
      token.interestRateModel.owner,
    )
    await jumpRateModel.deployed()
    console.log(`JumpRateModelV2 for c${token.symbol} deployed to ${jumpRateModel.address}`)
    token.interestRateModel.address = jumpRateModel.address

    const Delegate = new CErc20Delegate__factory(deployer)
    const delegate = await Delegate.deploy()
    await delegate.deployed()
    console.log(`CErc20Delegate deployed to ${delegate.address}`)
  
    const Delegator = new CErc20Delegator__factory(deployer)
    const delegator = await Delegator.deploy(
      token.address,
      coreAddresses.creamtroller,
      jumpRateModel.address,
      token.initialExchangeRateMantissa,
      `CToken ${token.name}`,
      `c${token.symbol}`,
      8, // always use 8
      deployer.address,
      delegate.address,
      "0x00"
    )
    await delegator.deployed()
    console.log(`CErc20Delegator deployed to ${delegator.address}`)
    
    const tx0 = await proxtroller._supportMarket(delegator.address)
    await tx0.wait()
    console.log(`Creamtroller _supportMarket for c${token.symbol} at ${tx0.hash}`)

    const tx1 = await proxtroller._setCollateralFactor(delegator.address, token.collateralFactor)
    await tx1.wait()
    console.log(`Creamtroller _setCollateralFactor for c${token.symbol} to ${token.collateralFactor} at ${tx0.hash}`)

    marketAddressBook[`c${token.symbol}`] = {
      deployer: deployer.address,
      delegate: delegate.address,
      delegator: delegator.address,
      underlying: token.address,
      interestRateModel: token.interestRateModel,
      initialExchangeRate: token.initialExchangeRateMantissa,
      collateralFactor: token.collateralFactor,
      supportMarketTx: tx0.hash,
      collateralFactorTx: tx1.hash
    }
  }

  const marketAddressPath = `${process.cwd()}/networks/${network.config.chainId}/marketAddresses.json`

  fs.writeFileSync(
    marketAddressPath,
    JSON.stringify(marketAddressBook, null, 2)
  )
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
