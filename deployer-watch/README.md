# Forta UMA Deployer Watch Handler

## Description

This agent monitors for transactions in which the UMA Deployer contract is involved.

## Supported Chains

- Ethereum

## Alerts

<!-- -->
- AE-UMA-DEPLOYER-TX
  - Fired when the UMA Deployer contract is part of a transaction
  - Severity is always set to "low"
  - Type is always set to "unknown"
  - Metadata field contains to and from addresses

<!-- -->
- AE-UMA-DEPLOYER-WHITELIST
  - Fired when the UMA Deployer interacts with a non-whitelisted address
  - Severity is always set to "high"
  - Type is always set to "suspicious"
  - Metadata field contains to and from addresses

## Test Data

To run all the tests for this agent, use the following command: `npm run test`
