const adminEvents = require('./admin-events/admin-events');
const deployerWatch = require('./deployer-watch');
const monitorMintCalls = require('./monitor-mint-calls');
const optimisticOracle = require('./optimistic-oracle/optimistic-oracle');

function provideHandleTransaction(agents) {
  return async function handleTransaction(txEvent) {
    const findings = (await Promise.all(
      agents.map((agent) => agent.handleTransaction(txEvent)),
    )).flat();

    return findings;
  };
}

module.exports = {
  provideHandleTransaction,
  handleTransaction: provideHandleTransaction([
    adminEvents,
    deployerWatch,
    monitorMintCalls,
    optimisticOracle,
  ]),
};
