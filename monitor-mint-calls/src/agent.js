const {
  ethers, Finding, FindingSeverity, FindingType,
} = require('forta-agent');

const { getAbi, getAddress } = require('@uma/contracts-node');

const initializeData = {};

// helper function to create alerts
function createAlert(fromAddress, votingTokenAddress, transactionHash) {
  return Finding.fromObject({
    name: 'Unauthorized mint() call on VotingToken contract',
    description: `Transaction Hash: ${transactionHash}, Caller Address: ${fromAddress}`,
    alertId: 'AE-UMA-UNAUTHORIZED-MINT',
    severity: FindingSeverity.Critical,
    type: FindingType.Exploit,
    protocol: 'uma',
    metadata: {
      votingTokenAddress,
      fromAddress,
      transactionHash,
    },
  });
}

function provideInitialize(data) {
  return async function initialize() {
    /* eslint-disable no-param-reassign */
    // get the addresses for the voting contract and voting token contract
    // for chain id 1 (eth mainnet)
    const CHAIN_ID = 1;
    data.votingAddress = await getAddress('Voting', CHAIN_ID);
    data.votingTokenAddress = await getAddress('VotingToken', CHAIN_ID);

    // get the abi for the voting token contract
    data.votingTokenAbi = getAbi('VotingToken');

    // create ethers interface object for the VotingToken.sol contract
    data.iface = new ethers.utils.Interface(data.votingTokenAbi);
    /* eslint-enable no-param-reassign */
  };
}

function provideHandleTransaction(data) {
  return async function handleTransaction(txEvent) {
    if (!data) throw new Error('handler called before initialization');
    const { votingTokenAddress, iface, votingAddress } = data;

    const findings = [];

    // retrieve the traces from the transactionEvent
    const { traces } = txEvent;

    // if we have received trace data, process the transactions within
    if (traces && traces.length) {
      traces.forEach((trace) => {
        // use a nested destructor to retrieve the addresses, input, and value for the method call
        const {
          action:
          {
            from: fromAddress,
            to: toAddress,
            input,
            value,
          },
          transactionHash,
        } = trace;

        // check if the call is to the VotingToken contract
        if (toAddress === votingTokenAddress.toLowerCase()) {
          // check if the call is for the mint() method
          const transactionDescription = iface.parseTransaction({ data: input, value });

          // parseTransaction may return null
          if (transactionDescription?.name === 'mint') {
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
  };
}

// exports
module.exports = {
  provideInitialize,
  initialize: provideInitialize(initializeData),
  provideHandleTransaction,
  handleTransaction: provideHandleTransaction(initializeData),
  createAlert,
};
