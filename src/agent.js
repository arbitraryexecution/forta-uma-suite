const adminEvents = require('./admin-events/admin-events');
const deployerWatch = require('./deployer-watch');
const monitorMintCalls = require('./monitor-mint-calls');

function provideHandleTransaction(adminEventsAgent, deployerWatchAgent, monitorMintCallsAgent) {
  return async function handleTransaction(txEvent) {
    const findings = [];

    const [adminEventsFindings,
      deployerWatchFindings,
      monitorMintCallsFindings] = await Promise.all([
      adminEventsAgent.handleTransaction(txEvent),
      deployerWatchAgent.handleTransaction(txEvent),
      monitorMintCallsAgent.handleTransaction(txEvent),
    ]);

    findings.push(...adminEventsFindings);
    findings.push(...deployerWatchFindings);
    findings.push(...monitorMintCallsFindings);
    return findings;
  };
}

module.exports = {
  provideHandleTransaction,
  handleTransaction: provideHandleTransaction(
    adminEvents,
    deployerWatch,
    monitorMintCalls,
  ),
};
