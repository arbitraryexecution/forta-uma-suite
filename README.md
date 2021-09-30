# Forta UMA Suite

## Description

This agent monitors various aspects of UMA. The UMA suite currently contains
the following handlers:

- deployer-watch
- monitor-mint-calls
- optimistic-oracle

## Supported Chains

- Ethereum

## Alerts

- AE-UMA-DEPLOYER-TX
  - Fired when the UMA Deployer contract is part of a transaction
  - Severity is always set to "low"
  - Type is always set to "unknown"
  - Metadata field contains to and from addresses

- AE-UMA-DEPLOYER-WHITELIST
  - Fired when the UMA Deployer interacts with a non-whitelisted address
  - Severity is always set to "high"
  - Type is always set to "suspicious"
  - Metadata field contains to and from addresses

- AE-UMA-ADMIN-EVENT
  - Fired on any event in admin-events.json
  - Severity is set to value in admin-events.json
  - Type is set to value in admin-events.json
  - Metadata field contains contract name, contract address and event name

- AE-UMA-UNAUTHORIZED-MINT
  - Fired when the UMA VotingToken.mint() method is called by any address other than the UMA Voting contract
  - Severity is always "critical"
  - Type is always set to "exploit"
  - Metadata field contains VotingToken contract address, caller address, and transaction hash
  - Must have traces enabled for this to operate correctly
  
- AE-UMA-OO-REQUESTPRICE
  - Fired when the RequestPrice event is emitted by the Optimistic Oracle contract
  - Severity is always set to "low"
  - Type is always set to "unknown"
  - Metadata field contains requester, currency, and price
    - Requester is an EOA decoded from the event 
    - Currency is the ERC-20 token address decoded from the event
    - Price is obtained for the token address from an external price feed (CoinGecko)

- AE-UMA-OO-PROPOSEPRICE
  - Fired when the ProposePrice event is emitted by the Optimistic Oracle contract
  - Severity is always set to "low"
  - Type is always set to "unknown"
  - Metadata field contains requester, proposer, currency, proposed price, and price
    - Requester and proposer are EOAs decoded from the event 
    - Currency is the ERC-20 token address decoded from the event
    - Proposed price is decoded from the event, then adjusted to be denominated in USD
    - Price is obtained for the token address from an external price feed (CoinGecko)

## Test Data

To run all the tests for this agent, use the following command: `npm run test`

AE-UMA-OO-PROPOSEPRICE can be tested against a mainnet transaction with the following command:

`npx forta-agent run --tx 0x76ff352b2665886a2a3d3b16fe0fa41f61e4ffc0824b3a6734383d397187f53f`
