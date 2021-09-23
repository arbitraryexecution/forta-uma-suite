const deployerWatchAgent = require('./deployer-watch');

const handleTransaction = async (txEvent) => {
  const findings = [];

  const [deployerWatchFindings] = await Promise.all([
    deployerWatchAgent.handleTransaction(txEvent),
  ]);

  findings.push(...deployerWatchFindings);
  return findings;
};

module.exports = {
  handleTransaction,
};
