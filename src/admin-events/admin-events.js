const { Finding, FindingSeverity, FindingType } = require('forta-agent');
const { getAbi, getBytecode, getAddress } = require("@uma/contracts-node")
const ethers = require('ethers');

// load config files
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
  const { hash } = txEvent.transaction;

  // iterate over each contract name to get the address and events
  contractNames.forEach((contractName) => {
    // for each contract name, lookup the address
    const contractAddress = contractAddresses[contractName].toLowerCase();
    const events = getEvents(contractName);

    // for each contract address, check for event matches
    events.forEach((event) => {
      var eventName = event["name"];
      var eventType = event["type"];
      var eventSeverity = event["severity"];
      var iface = ifaces[contractName];

      // console.log("DEBUG: contract=" + contractAddress + ", event=" + eventName, " type=" + eventType + " severity=" + eventSeverity);
      const eventLog = txEvent.filterEvent(eventName, contractAddress);
      if (eventLog.length !== 0) {
        findings.push(
          Finding.fromObject({
            name: 'UMA Admin Event',
            description: `The ${eventName} event was emitted by the ${contractName} contract`,
            alertId: 'AE-UMA-ADMIN-EVENT',
            type: FindingType[eventType],
            severity: FindingSeverity[eventSeverity],
            metadata: {
              hash,
              contractName,
              contractAddress,
              eventName,
            },
            everestId: '0x9ed51155fa709f1bc3b26b8fec03df7010177362',
          }),
        );
      }
    });
  });

  return findings;
}

module.exports = {
  handleTransaction,
};
