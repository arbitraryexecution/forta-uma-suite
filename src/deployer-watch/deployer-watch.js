const { Finding, FindingSeverity, FindingType } = require('forta-agent');

const addressList = require('./deployer-watch.json');
const config = require('../../agent-config.json');

const whitelist = {};
(Object.keys(addressList)).forEach((a) => { whitelist[a.toLowerCase()] = true; });
const deployerAddress = Object.keys(whitelist)[0];

const handleTransaction = async (txEvent) => {
  const findings = [];
  const txAddresses = txEvent.addresses;
  const { to } = txEvent;
  const { from } = txEvent;

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
