const ethers = require('ethers');
const BigNumber = require('bignumber.js');

const {
  Finding, FindingSeverity, FindingType, getJsonRpcUrl,
} = require('forta-agent');

// load required shared types
const { 
  VotingToken: votingTokenAddress,
  Voting: votingAddress
} = require('../../contract-addresses.json');

const { abi: votingTokenAbi } = require('../../abi/VotingToken.json');
const { umaEverestId } = require('../../agent-config.json');

// create ethers interface object for the VotingToken.sol contract
const iface = new ethers.utils.Interface(votingTokenAbi);

// set up an ethers provider
// this provider must have trace support
const jsonRpcProvider = new ethers.providers.JsonRpcProvider(getJsonRpcUrl());

// set up a timeout to allow the JSON-RPC endpoint to respond with trace data
const rpcTimeoutMilliseconds = 15000;

// helper function to create alerts
function createAlert(fromAddress, transactionHash) {
  return Finding.fromObject({
    name: `Unauthorized mint() call on VotingToken contract`,
    description: `Transaction Hash: ${ transactionHash }, Caller Address: ${ fromAddress }`,
    alertId: 'AE-UMA-UNAUTHORIZED-MINT',
    severity: FindingSeverity.Critical,
    type: FindingType.Exploit,
    everestId: umaEverestId,
    metadata: {
      votingTokenAddress,
      fromAddress,
      transactionHash
    },
  });
}

// examples of blocks where .mint() is called
// block number 11942721
// transaction hash 0xbc9d1938c486c327a3c8355e939324f13a344f3e2b3688bbe679c153bc28076b
// block number 13266236
// transaction hash 0x07f7d80be22e12553f61ef9a085b8f4ca7a52b7415053c40c9f8fad7c8e7412b
async function handleBlock(blockEvent) {

  const findings = [];

  // get the current block number
  const params = [ '0x' + (blockEvent.blockNumber).toString(16) ];

  // get all of the traces for the current block
  // reference: https://docs.alchemy.com/alchemy/documentation/enhanced-apis/trace-api#trace_block
  const start = new Date();
  let traces = await jsonRpcProvider.send('trace_block', params);

  // the Alchemy JSON-RPC endpoint does not always respond with trace data for the most recent block
  while ((traces === null) && ((Date.now() - start.getTime()) < rpcTimeoutMilliseconds)) {
    traces = await jsonRpcProvider.send('trace_block', params);
  }

  // if we have received trace data, process the transactions within
  if (traces !== null) {
    traces.forEach((trace) => {

      // use a nested destructor to retrieve the addresses, data, and value for the method call
      const { action: 
        { 
          from: fromAddress,
          to: toAddress,
          input: data,
          value
        },
        transactionHash
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
  handleBlock,
};
