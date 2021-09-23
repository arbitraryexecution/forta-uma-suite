const ethers = require('ethers');

const {
  Finding, FindingSeverity, FindingType,
} = require('forta-agent');

// load required shared types
const {
  VotingToken: votingTokenAddress,
  Voting: votingAddress,
} = require('../contract-addresses.json');

const { abi: votingTokenAbi } = require('../abi/VotingToken.json');
const { umaEverestId } = require('../agent-config.json');

// create ethers interface object for the VotingToken.sol contract
const iface = new ethers.utils.Interface(votingTokenAbi);

// helper function to create alerts
function createAlert(fromAddress, transactionHash) {
  return Finding.fromObject({
    name: 'Unauthorized mint() call on VotingToken contract',
    description: `Transaction Hash: ${transactionHash}, Caller Address: ${fromAddress}`,
    alertId: 'AE-UMA-UNAUTHORIZED-MINT',
    severity: FindingSeverity.Critical,
    type: FindingType.Exploit,
    everestId: umaEverestId,
    metadata: {
      votingTokenAddress,
      fromAddress,
      transactionHash,
    },
  });
}

async function handleTransaction(txEvent) {
  const findings = [];

  // retrieve the traces from the transactionEvent
  const { traces } = txEvent;

  // if we have received trace data, process the transactions within
  if (traces && traces.length) {
    traces.forEach((trace) => {
      // use a nested destructor to retrieve the addresses, data, and value for the method call
      const {
        action:
        {
          from: fromAddress,
          to: toAddress,
          input: data,
          value,
        },
        transactionHash,
      } = trace;

      // check if the call is to the VotingToken contract
      if (toAddress === votingTokenAddress.toLowerCase()) {
        // check if the call is for the mint() method
        const transactionDescription = iface.parseTransaction({ data, value });

        if (transactionDescription.name === 'mint') {
          // check if the call originated from the Voting contract
          if (fromAddress !== votingAddress.toLowerCase()) {
            // create alert
            findings.push(createAlert(fromAddress, transactionHash));
          }
        }
      }
    });
  }
  return findings;
}

// exports
module.exports = {
  handleTransaction,
  createAlert,
};
