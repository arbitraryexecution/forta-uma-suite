# Forta UMA Admin-Events Handler

## Description

This agent monitors admin events for the protocol.

## Supported Chains

- Ethereum

## Alerts

<!-- -->
- AE-UMA-ADMIN-EVENT
  - Fired on any event in admin-events.json
  - Severity is set to value in admin-events.json
  - Type is set to value in admin-events.json
  - Metadata field contains contract name, contract address, event name and event args

## Test Data

To run all the tests for this agent, use the following command: `npm run test`
