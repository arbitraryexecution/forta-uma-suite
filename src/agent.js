const deployerWatchAgent = require('./deployer-watch');
const monitorMintCallsAgent = require('./monitor-mint-calls');

const handleTransaction = async (txEvent) => {
  const findings = [];

  const [deployerWatchFindings] = await Promise.all([
    deployerWatchAgent.handleTransaction(txEvent),
  ]);

  const [monitorMintCallsFindings] = await Promise.all([
    monitorMintCallsAgent.handleTransaction(txEvent),
  ]);

  findings.push(...deployerWatchFindings);
  findings.push(...monitorMintCallsFindings);

  return findings;
};

module.exports = {
  handleTransaction,
};
