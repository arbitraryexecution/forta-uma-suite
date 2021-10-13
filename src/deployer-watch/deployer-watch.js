const { Finding, FindingSeverity, FindingType } = require('forta-agent');

const addresses = require('./deployer-watch.json');
const config = require('../../agent-config.json');

const initializeData = {};

function provideInitialize(data) {
  return async function initialize() {
    // eslint-disable-next-line no-param-reassign
    data.deployerAddress = addresses.Deployer.toLowerCase();

    // re-format the whitelist to simplify the logic for checking transactions
    // also remove checksums
    // eslint-disable-next-line no-param-reassign
    data.whitelist = {};
    addresses.Whitelist.forEach((a) => {
      // eslint-disable-next-line no-param-reassign
      data.whitelist[a.toLowerCase()] = true;
    });
  };
}

function provideHandleTransaction(data) {
  return async function handleTransaction(txEvent) {
    const findings = [];
    const txAddresses = txEvent.addresses;
    const { to, from } = txEvent;

    // the Deployer address is critical to this agent, so it should be in deployer-watch.json
    // in case it gets removed, check and warn
    if (!data.deployerAddress) {
      console.error('Please add Deployer contract address to deployer-watch.json');
      return findings;
    }

    // low severity alert if the Deployer was involved
    // txEvent.addresses includes txEvent.to and txEvent.from
    // uses txEvent.addresses instead of explicitly checking against txEvent.to and txEvent.from
    // to also catch scenarios where Deployer is involved but is not the initiator
    if (txAddresses[data.deployerAddress]) {
      findings.push(
        Finding.fromObject({
          name: 'UMA Deployer Watch',
          description: 'UMA Deployer EOA involved in transaction',
          alertId: 'AE-UMA-DEPLOYER-TX',
          severity: FindingSeverity.Low,
          type: FindingType.Unknown,
          everestId: config.umaEverestId,
          protocol: 'uma',
          metadata: {
            to,
            from,
          },
        }),
      );

      // high severity alert if Deployer interacts with an abnormal address
      if (!data.whitelist[to]) {
        findings.push(
          Finding.fromObject({
            name: 'UMA Deployer Watch - Unexpected Transaction',
            description: 'UMA Deployer transaction with non-whitelist address',
            alertId: 'AE-UMA-DEPLOYER-WHITELIST',
            severity: FindingSeverity.High,
            type: FindingType.Suspicious,
            everestId: config.umaEverestId,
            protocol: 'uma',
            metadata: {
              to,
              from,
            },
          }),
        );
      }
    }
    return findings;
  };
}

module.exports = {
  provideInitialize,
  initialize: provideInitialize(initializeData),
  provideHandleTransaction,
  handleTransaction: provideHandleTransaction(initializeData),
};
