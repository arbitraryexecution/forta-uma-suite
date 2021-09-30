// forta-uma-suite agent is a collection of sub-agents
const deployerWatchAgent = require('./deployer-watch/deployer-watch');
const liquidatorAgent = require('./bot-handlers/liquidator');
const monitorMintCallsAgent = require('./monitor-mint-calls/monitor-mint-calls');

const handleTransaction = async (txEvent) => {
  const findings = (
    await Promise.all([
      deployerWatchAgent.handleTransaction(txEvent),
      monitorMintCallsAgent.handleTransaction(txEvent),
    ])
  ).flat();

  return findings;
};

const handleBlock = async (blockEvent) => {
  const findings = (
    await Promise.all([
      liquidatorAgent.handleBlock(blockEvent),
    ])
  ).flat();

  return findings;
};

module.exports = {
  handleTransaction,
  handleBlock,
};
