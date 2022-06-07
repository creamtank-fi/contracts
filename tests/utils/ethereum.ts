import { BigNumber, BigNumberish } from 'ethers'
import { ethers } from 'hardhat';
import { TEN_18 } from './constants'

export function etherMantissa(num: number, scale: BigNumberish = TEN_18) {
  if (num < 0) {
    // very hacky solution. Basically you only get 6 figs of significance
    return BigNumber.from((num * 1e6).toFixed(0)).mul(1e12);
  }
  return BigNumber.from(num).mul(scale);
}

export async function etherBalance(addr: string): Promise<BigNumber> {
  return await ethers.provider.getBalance(addr)
}

export function encodeParameters(types: string[], values: any[]) {
  const abi = new ethers.utils.AbiCoder();
  return abi.encode(types, values);
}

export async function getCurrentBlock() {
  return await ethers.provider.getBlock("latest")
}