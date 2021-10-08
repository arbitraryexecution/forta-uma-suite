const { Finding, FindingSeverity, FindingType } = require('forta-agent');
const { getAbi, getAddress } = require('@uma/contracts-node');
const ethers = require('ethers');

// load config files
const { umaEverestId } = require('../../agent-config.json');
const adminEvents = require('./admin-events.json');

// Stores information about each contract
const contracts = [];

// returns the list of events for a given contract
function getEvents(contractName) {
  const events = adminEvents[contractName];
  if (events === undefined) {
    return {}; // no events for this contract
  }
  return events;
}

// Filters the logs to only events in eventNames
function filterAndParseLogs(logs, address, iface, eventNames) {
  // collect logs only from the contract
  const contractLogs = logs.filter((log) => log.address === address);
  if (contractLogs.length === 0) {
    return [];
  }

  // decode logs and filter on the ones we are interested in
  const parse = (log) => iface.parseLog(log);
  const filter = (log) => eventNames.indexOf(log.name) !== -1;
  const parsedLogs = contractLogs.map(parse).filter(filter);

  return parsedLogs;
}

// Helper function that converts the args so they can be in the metadata
// Removed fields that are not named.  They have numeric names in Object.keys()
// Converts all values to strings so that BigNumbers are readable
function extractArgs(args) {
  const strippedArgs = Object();
  Object.keys(args).forEach((k) => {
    if (Number.isNaN(Number(k))) { strippedArgs[k] = args[k].toString(); }
  });
  return strippedArgs;
}

// helper function to create alerts
function createAlert(eventName, contractName, contractAddress, eventType, eventSeverity, args) {
  const strippedArgs = extractArgs(args);
  return Finding.fromObject({
    name: 'UMA Admin Event',
    description: `The ${eventName} event was emitted by the ${contractName} contract`,
    alertId: 'AE-UMA-ADMIN-EVENT',
    type: FindingType[eventType],
    severity: FindingSeverity[eventSeverity],
    everestId: umaEverestId,
    protocol: 'uma',
    metadata: {
      contractName,
      contractAddress,
      eventName,
      strippedArgs,
    },
  });
}

// Populates the contracts array
async function initialize() {
  // Constant for getAddress
  const CHAIN_ID = 1;

  // Clear the contracts array
  contracts.length = 0;

  // Get the contract names that have events we wish to monitor
  const contractNames = Object.keys(adminEvents);

  // Get and store the information about each contract
  await Promise.all(contractNames.map(async (name) => {
    const abi = getAbi(name);
    const iface = new ethers.utils.Interface(abi);
    const address = (await getAddress(name, CHAIN_ID)).toLowerCase();

    const contract = {
      name,
      address,
      iface,
    };
    contracts.push(contract);
  }));
}

function handleTransaction(txEvent) {
  const findings = [];

  // iterate over each contract name to get the address and events
  contracts.forEach((contract) => {
    // for each contract lookup the event events
    const events = getEvents(contract.name);
    const eventNames = Object.keys(events);

    // Filter down to only the events we want to alert on
    const parsedLogs = filterAndParseLogs(txEvent.logs,
      contract.address,
      contract.iface,
      eventNames);

    // Alert on each item in parsedLogs
    parsedLogs.forEach((parsedLog) => {
      findings.push(createAlert(parsedLog.name,
        contract.name,
        contract.address,
        events[parsedLog.name].type,
        events[parsedLog.name].severity,
        parsedLog.args));
    });
  });

  return findings;
}

module.exports = {
  handleTransaction,
  initialize,
};
