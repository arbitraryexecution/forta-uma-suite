const deployerWatchAgent = require('./deployer-watch');
const monitorMintCallsAgent = require('./monitor-mint-calls');
const liquidatorAgent = require('./bot-handlers/liquidator');

const handleTransaction = async (txEvent) => {
  const findings = (
    await Promise.all([
      //deployerWatchAgent.handleTransaction(txEvent),
      //monitorMintCallsAgent.handleTransaction(txEvent),
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
  //handleTransaction,
  handleBlock,
};
