const deployerWatchAgent = require('./deployer-watch');
const adminEventsAgent = require('./admin-events/admin-events');

const handleTransaction = async (txEvent) => {

  const findings = (
    await Promise.all([
      deployerWatchAgent.handleTransaction(txEvent),
      adminEventsAgent.handleTransaction(txEvent),
    ])
  ).flat();

  return findings;
};

module.exports = {
  handleTransaction,
};
