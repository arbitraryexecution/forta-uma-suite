const { Finding, FindingSeverity, FindingType } = require('forta-agent');

const addresses = require('./config/deployer-watch.json');
const config = require('../agent-config.json');

const deployerAddress = addresses.Deployer.toLowerCase();
const whitelist = {};

// re-format the whitelist to simplify the logic for checking transactions
// also remove checksums
addresses.Whitelist.forEach((a) => {
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

  // low severity alert if the Deployer was involved
  // txAddresses includes to and from
  // we are using txAddresses instead of explicitly checking against to and from
  // to also catch scenarios where deployer is involved but not the intiator
  if (txAddresses[deployerAddress]) {
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
    if (!whitelist[to]) {
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

module.exports = {
  handleTransaction,
};
