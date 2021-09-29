const deployerWatchAgent = require('./deployer-watch');
const monitorMintCallsAgent = require('./monitor-mint-calls');

function provideHandleTransaction(deployerWatchAgent, monitorMintCallsAgent) {
  return async function handleTransaction(txEvent) {
    const findings = [];

    const [deployerWatchFindings, monitorMintCallsFindings] = await Promise.all([
      deployerWatchAgent.handleTransaction(txEvent),
      monitorMintCallsAgent.handleTransaction(txEvent),
    ]);

    findings.push(...deployerWatchFindings);
    findings.push(...monitorMintCallsFindings);
    return findings;
  };
}

module.exports = {
  provideHandleTransaction,
  handleTransaction: provideHandleTransaction(
    deployerWatchAgent,
    monitorMintCallsAgent
  ),
};
