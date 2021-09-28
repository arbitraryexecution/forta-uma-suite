const deployerWatchAgent = require('./deployer-watch');
const monitorMintCallsAgent = require('./monitor-mint-calls');
const optimisticOracleAgent = require('./optimistic-oracle');

const handleTransaction = async (txEvent) => {
  const findings = (
    await Promise.all([
      deployerWatchAgent.handleTransaction(txEvent),
      monitorMintCallsAgent.handleTransaction(txEvent),
      optimisticOracleAgent.handleTransaction(txEvent),
    ])
  ).flat();

  return findings;
};

module.exports = {
  handleTransaction,
};
