const { Finding, FindingSeverity, FindingType } = require('forta-agent');

const addressList = require('./deployer-watch.json');
const config = require('../../agent-config.json');

let deployerAddress;
const whitelist = {};
(Object.keys(addressList)).forEach((a) => {
  if (addressList[a] === 'Deployer') {
    deployerAddress = a.toLowerCase();
  }
  whitelist[a.toLowerCase()] = true;
});

const handleTransaction = async (txEvent) => {
  const findings = [];
  const txAddresses = txEvent.addresses;
  const { to, from } = txEvent;

  // the Deployer address is critical to this agent, so it should be in deployer-watch.json
  // in case it gets removed, check and warn
  if (!deployerAddress) {
    console.error('Please add Deployer contract address to deployer-watch.json');
    return findings;
  }

  if (txAddresses[deployerAddress]) {
    // low severity alert if the Deployer was involved
    findings.push(
      Finding.fromObject({
        name: 'UMA Deployer watch',
        description: 'UMA Deployer EOA involved in transaction',
        alertId: 'AE-UMA-DEPLOYER-TX',
        severity: FindingSeverity.Low,
        type: FindingType.Unknown,
        everestId: config.umaEverestId,
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
          name: 'UMA Deployer watch',
          description: 'UMA Deployer interacting with non-whitelist address',
          alertId: 'AE-UMA-DEPLOYER-WHITELIST',
          severity: FindingSeverity.High,
          type: FindingType.Suspicious,
          everestId: config.umaEverestId,
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

module.exports = {
  handleTransaction,
};
