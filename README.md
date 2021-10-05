# Forta UMA Suite

## Description

This agent monitors various aspects of UMA. The UMA suite currently contains
the following handlers:

- deployer-watch
- liquidator
- monitor-mint-calls

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

- AE-UMA-LIQUIDATABLE-POSITION
  - Fired when a monitored contract has a liquidatable position due to price changes or invalid withdrawls
  - Severity is always set to "medium"
  - type is always set to "degraded"
  - Metadata field contains position details and the returned price from the price feed

- AE-UMA-UNAUTHORIZED-MINT
  - Fired when the UMA VotingToken.mint() method is called by any address other than the UMA Voting contract
  - Severity is always "critical"
  - Type is always set to "exploit"
  - Metadata field contains VotingToken contract address, caller address, and transaction hash
  - Must have traces enabled for this to operate correctly

## Test Data

To run all the tests for this agent, use the following command: `npm run test`
