// transaction handlers
const adminEvents = require('./admin-events/admin-events');
const deployerWatch = require('./deployer-watch/deployer-watch');
const monitorMintCalls = require('./monitor-mint-calls/monitor-mint-calls');

// block handlers
// <empty>

const txHandlers = [
  adminEvents,
  deployerWatch,
  monitorMintCalls,
];

const blockHandlers = [
];

// returns findings over all txHandler's handleTransaction functions
function provideHandleTransaction(agents) {
  return async function handleTransaction(txEvent) {
    const findings = (
      await Promise.all(
        agents.map((agent) => agent.handleTransaction(txEvent)),
      )
    ).flat();

    return findings;
  };
}

// returns findings over all blockHandler's handleBlock functions
function provideHandleBlock(agents) {
  return async function handleBlock(blockEvent) {
    const findings = (
      await Promise.all(
        agents.map((agent) => agent.handleBlock(blockEvent)),
      )
    ).flat();

    return findings;
  };
}

// returns a promise of all the async initialize calls
function provideInitialize(agents) {
  return async function initialize() {
    return Promise.all(agents.map(async (agent) => {
      if (typeof agent.initialize === 'function') {
        return agent.initialize();
      }
      return Promise.resolve();
    }));
  };
}

module.exports = {
  provideInitialize,
  initialize: provideInitialize([...txHandlers, ...blockHandlers]),
  provideHandleTransaction,
  handleTransaction: provideHandleTransaction(txHandlers),
  provideHandleBlock,
  handleBlock: provideHandleBlock(blockHandlers),
};
