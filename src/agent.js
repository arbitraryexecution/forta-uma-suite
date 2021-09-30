// forta-uma-suite agent is a collection of sub-agents
const adminEventsAgent = require('./admin-events/admin-events');
const deployerWatchAgent = require('./deployer-watch/deployer-watch');
const monitorMintCallsAgent = require('./monitor-mint-calls/monitor-mint-calls');
const optimisticOracleAgent = require('./optimistic-oracle/optimistic-oracle');

const handleTransaction = async (txEvent) => {
  const findings = (
    await Promise.all([
      adminEventsAgent.handleTransaction(txEvent),
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
