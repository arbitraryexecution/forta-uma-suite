const ethers = require('ethers');

const {
  Finding, FindingSeverity, FindingType,
} = require('forta-agent');

const { getAbi, getAddress } = require('@uma/contracts-node');

// get the addresses for the voting contract and voting token contract for chain id 1 (eth mainnet)
const chainId = 1;
const votingAddressPromise = getAddress('Voting', chainId);
const votingTokenAddressPromise = getAddress('VotingToken', chainId);

// get the abi for the voting token contract
const votingTokenAbi = getAbi('VotingToken');

const { umaEverestId } = require('../agent-config.json');

// create ethers interface object for the VotingToken.sol contract
const iface = new ethers.utils.Interface(votingTokenAbi);

// helper function to create alerts
function createAlert(fromAddress, votingTokenAddress, transactionHash) {
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

  const votingAddress = await votingAddressPromise;
  const votingTokenAddress = await votingTokenAddressPromise;

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
            findings.push(createAlert(fromAddress, votingTokenAddress, transactionHash));
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
