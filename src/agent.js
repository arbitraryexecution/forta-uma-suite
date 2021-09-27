const adminEventsAgent = require('./admin-events/admin-events');
const deployerWatchAgent = require('./deployer-watch');
const monitorMintCallsAgent = require('./monitor-mint-calls');

const handleTransaction = async (txEvent) => {
  const findings = (
    await Promise.all([
      adminEventsAgent.handleTransaction(txEvent),
      deployerWatchAgent.handleTransaction(txEvent),
      monitorMintCallsAgent.handleTransaction(txEvent),
    ])
  ).flat();

  return findings;
};

module.exports = {
  handleTransaction,
};
