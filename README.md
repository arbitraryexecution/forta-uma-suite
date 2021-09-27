# Forta UMA Suite

## Description

This agent monitors various aspects of UMA. The UMA suite currently contains
the following handlers:

- deployer-watch

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
  - Metadata field contains Contract Name, Contract Address and Event Name

## Test Data

To run all the tests for this agent, use the following command: `npm run test`
