const deployerWatchAgent = require('./deployer-watch');
const adminEventsAgent = require('./admin-events/admin-events');

const handleTransaction = async (txEvent) => {
  const findings = [];

  const [deployerWatchFindings] = await Promise.all([
    deployerWatchAgent.handleTransaction(txEvent),
    adminEventsAgent.handleTransaction(txEvent),
  ]);

  findings.push(...deployerWatchFindings);
  return findings;
};

module.exports = {
  handleTransaction,
};
