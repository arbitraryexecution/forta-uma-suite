const { Finding, FindingSeverity, FindingType } = require('forta-agent');
const { getAbi, getAddress } = require('@uma/contracts-node');
const ethers = require('ethers');

// load config files
const config = require('../../agent-config.json');
const adminEvents = require('./admin-events.json');

// returns the list of events for a given contract
function getEvents(contractName) {
  const events = adminEvents[contractName];
  if (events === undefined) {
    return []; // no events for this contract
  }
  return events;
}

// get contract names for mapping to events
let contractNames = Object.keys(adminEvents);

// Create the interfaces for each contract that has events we wish to monitor
const ifaces = {};
contractNames.forEach((contractName) => {
  // Get the abi for the contract
  const abi = getAbi(contractName);

  // create ethers interface object
  const iface = new ethers.utils.Interface(abi);

  // Create an association between the contract name and the interface
  ifaces[contractName] = iface;
});

// Filters the logs to only events in eventNames
function filterAndParseLogs(logs, address, iface, eventNames) {
  // collect logs only from the contract
  const contractLogs = logs.filter((log) => log.address === address);

  // decode logs and filter on the ones we are interested in
  const parse = (log) => iface.parseLog(log);
  const filter = (log) => eventNames.indexOf(log.name) !== -1;
  const parsedLogs = contractLogs.map(parse).filter(filter);

  return parsedLogs;
}

// helper function to create alerts
function createAlert(log, contractName, contractAddress, eventType, eventSeverity) {
  const eventName = log.name;
  return Finding.fromObject({
    name: 'UMA Admin Event',
    description: `The ${eventName} event was emitted by the ${contractName} contract`,
    alertId: 'AE-UMA-ADMIN-EVENT',
    type: FindingType[eventType],
    severity: FindingSeverity[eventSeverity],
    everestId: config.umaEverestId,
    metadata: {
      contractName,
      contractAddress,
      eventName,
    },
  });
}

async function handleTransaction(txEvent) {
  const findings = [];

  // iterate over each contract name to get the address and events
  contractNames.forEach(async (contractName) => {
    // for each contract name, lookup the address, events and interface
    const chainId = 1;
    const contractAddressPromise = getAddress(contractName, chainId);
    const contractAddress = (await contractAddressPromise).toLowerCase();
    const events = getEvents(contractName);
    const eventNames = Object.keys(events);
    const iface = ifaces[contractName];

    // Filter down to only the events we want to alert on
    const parsedLogs = filterAndParseLogs(txEvent.logs, contractAddress, iface, eventNames);

    // Alert on each item in parsedLogs
    parsedLogs.forEach((log) => {
      findings.push(createAlert(log,
        contractName,
        contractAddress,
        events[log.name].type,
        events[log.name].severity));
    });
  });

  return findings;
}

module.exports = {
  handleTransaction,
};
