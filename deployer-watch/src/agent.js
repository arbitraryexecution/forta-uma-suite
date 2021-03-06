const { Finding, FindingSeverity, FindingType } = require('forta-agent');

const addresses = require('./deployer-watch.json');

const initializeData = {};

function provideInitialize(data) {
  return async function initialize() {
    /* eslint-disable no-param-reassign */
    data.deployerAddress = addresses.Deployer.toLowerCase();

    // re-format the whitelist to simplify the logic for checking transactions
    // also remove checksums
    data.whitelist = {};
    addresses.Whitelist.forEach((a) => {
      data.whitelist[a.toLowerCase()] = true;
    });
    /* eslint-enable no-param-reassign */
  };
}

function provideHandleTransaction(data) {
  return async function handleTransaction(txEvent) {
    if (!data) throw new Error('handler called before initialization');
    const { deployerAddress, whitelist } = data;

    const findings = [];
    const txAddresses = txEvent.addresses;
    const { to, from } = txEvent;

    // the Deployer address is critical to this agent, so it should be in deployer-watch.json
    // in case it gets removed, check and warn
    if (!deployerAddress) {
      console.error('Please add Deployer contract address to deployer-watch.json');
      return findings;
    }

    // low severity alert if the Deployer was involved
    // txEvent.addresses includes txEvent.to and txEvent.from
    // uses txEvent.addresses instead of explicitly checking against txEvent.to and txEvent.from
    // to also catch scenarios where Deployer is involved but is not the initiator
    if (txAddresses[deployerAddress]) {
      findings.push(
        Finding.fromObject({
          name: 'UMA Deployer Watch',
          description: 'UMA Deployer EOA involved in transaction',
          alertId: 'AE-UMA-DEPLOYER-TX',
          severity: FindingSeverity.Low,
          type: FindingType.Unknown,
          protocol: 'uma',
          metadata: {
            to,
            from,
          },
        }),
      );

      // high severity alert if Deployer interacts with an abnormal address
      if (!whitelist[to]) {
        findings.push(
          Finding.fromObject({
            name: 'UMA Deployer Watch - Unexpected Transaction',
            description: 'UMA Deployer transaction with non-whitelist address',
            alertId: 'AE-UMA-DEPLOYER-WHITELIST',
            severity: FindingSeverity.High,
            type: FindingType.Suspicious,
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
