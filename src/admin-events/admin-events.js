const { Finding, FindingSeverity, FindingType } = require('forta-agent');
const { getAbi, getBytecode, getAddress } = require("@uma/contracts-node")
const ethers = require('ethers');

// load config files
const config = require('../../agent-config.json');
const contractAddresses = require('../../contract-addresses.json');
const adminEvents = require('./admin-events.json');

// get contract names for mapping to events
let contractNames = Object.keys(contractAddresses);

// returns the list of events for a given contract
function getEvents(contractName) {
  const events = adminEvents[contractName];
  if (events === undefined) {
    return []; // no events for this contract
  }
  return events;
}

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
    }
  });
}

// prune contract names that don't have any associated events
contractNames = contractNames.filter((name) => (getEvents(name).length !== 0));

// Create the interfaces for each contract that has events we wish to monitor
var ifaces = {};
contractNames.forEach((contractName) => {

  // Get the abi for the contract
  const abi = getAbi(contractName);

  // create ethers interface object
  const iface = new ethers.utils.Interface(abi);

  // Create an association between the contract name and the interface
  ifaces[contractName] = iface;
});

async function handleTransaction(txEvent) {
  const findings = [];

  // iterate over each contract name to get the address and events
  contractNames.forEach((contractName) => {

    // for each contract name, lookup the address, events and interface
    const contractAddress = contractAddresses[contractName].toLowerCase();
    const events = getEvents(contractName);
    const eventNames = Object.keys(events);
    var iface = ifaces[contractName];

    // Filter down to only the events we want to alert on
    const parsedLogs = filterAndParseLogs(txEvent.logs, contractAddress, iface, eventNames);

    // Alert on each item in parsedLogs
    parsedLogs.forEach((log) => {
      findings.push(createAlert(log, contractName, contractAddress, events[log.name].type, events[log.name].severity));
    });
  });

  return findings;
}

module.exports = {
  handleTransaction,
};
