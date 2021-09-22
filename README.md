# Forta UMA Suite

## Description

This agent monitors various aspects of UMA. The UMA suite currently contains
the following handlers:


## Supported Chains

- Ethereum


## Alerts

- AE-UMA-UNAUTHORIZED-MINT
  - Fired when the UMA VotingToken.mint() method is called by any address other than the UMA Voting contract
  - Severity is always critical
  - Type is always set to exploit
  - Metadata field contains VotingToken contract address, caller address, and transaction hash

## Test Data

To run all the tests for this agent, use the following command: `npm run test`
