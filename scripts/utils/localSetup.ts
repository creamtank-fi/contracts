import { run, ethers, network } from "hardhat"
import {
  StandardToken__factory
} from '../../dist/types'
import fs from 'fs'
import {
  Config,
} from './types'

async function main() {
  await run("compile")

  const config: Config = require(`${process.cwd()}/config/${network.config.chainId}.json`)

  const [deployer] = await ethers.getSigners()

  console.log(`Deploying contracts with from: ${deployer.address}`)

  for (let i=0; i < config.tokens.length; i++) {
    const token = config.tokens[i]
    const StandardToken = new StandardToken__factory(deployer)
    const standardToken = await StandardToken.deploy(100, token.name, token.decimals, token.symbol)
    await standardToken.deployed()
    console.log(`StandardToken deployed to ${standardToken.address}`)

    config.tokens[i].address = standardToken.address
  }

  const marketAddressPath = `${process.cwd()}/config/${network.config.chainId}.json`

  fs.writeFileSync(
    marketAddressPath,
    JSON.stringify(config, null, 2)
  )
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
