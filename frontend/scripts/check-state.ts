/**
 * What does the exchange think this account is allowed to do?
 *
 * The trace's buy reverted with an undecodable selector. Rather than guess at
 * error names, this reads the three pieces of state the app's "enable trading"
 * flow sets up, so the missing one names itself.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { privateKeyToAccount } from "viem/accounts";

import {
  fetchMarket,
  USDSO_ADDRESS,
  SPOT_POOL_ABI,
  ERC20_ABI,
  OPERATOR_SELECTORS,
  operatorRegistryFor,
} from "@/lib/dreamdex";
import { createTradingClients, readVaultBalance } from "@/lib/orders";

const SYMBOL = process.argv[2] ?? "SOMI:USDso";

function loadKey(): `0x${string}` {
  const envPath = path.resolve(
    import.meta.dirname, "..", "..", "hardhat-contracts", ".env"
  );
  const line = readFileSync(envPath, "utf8")
    .split("\n")
    .find((l) => l.trim().startsWith("PRIVATE_KEY="));
  if (!line) throw new Error("no PRIVATE_KEY");
  const raw = line.slice(line.indexOf("=") + 1).trim().replace(/^["']|["']$/g, "");
  return (raw.startsWith("0x") ? raw : `0x${raw}`) as `0x${string}`;
}

const key = loadKey();
const owner = privateKeyToAccount(key).address;
const clients = createTradingClients(key);
const market = await fetchMarket(SYMBOL, "testnet");
if (!market) throw new Error("market not found");

console.log(`\naccount ${owner}`);
console.log(`pool    ${market.pool}`);
console.log(`chain   ${await clients.publicClient.getChainId()}`);

const gas = await clients.publicClient.getBalance({ address: owner });
console.log(`\nnative gas balance : ${Number(gas) / 1e18} STT`);

const wallet = await clients.publicClient.readContract({
  address: USDSO_ADDRESS, abi: ERC20_ABI, functionName: "balanceOf", args: [owner],
});
console.log(`USDso in wallet    : ${Number(wallet) / 1e18}`);

const vault = await readVaultBalance(clients, market, owner, USDSO_ADDRESS);
console.log(`USDso in vault     : ${vault}`);

const allowance = await clients.publicClient.readContract({
  address: USDSO_ADDRESS, abi: ERC20_ABI, functionName: "allowance",
  args: [owner, market.pool],
});
console.log(`allowance to pool  : ${Number(allowance) / 1e18}`);

// The two things "enable trading" turns on, read back.
for (const [name, selector] of Object.entries(OPERATOR_SELECTORS)) {
  const ok = await clients.publicClient.readContract({
    address: market.pool,
    abi: SPOT_POOL_ABI,
    functionName: "isOperatorAuthorized",
    args: [owner, owner, selector as `0x${string}`],
  });
  console.log(`operator ${name.padEnd(14)}: ${ok}`);
}

console.log(`\noperator registry  : ${operatorRegistryFor(await clients.publicClient.getChainId())}`);
