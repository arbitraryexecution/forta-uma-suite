const { provideHandleTransaction } = require("./agent");

describe("deployer watch agent", () => {
  let handleTransaction;
  const mockDeployerWatchAgent = {
    handleTransaction: jest.fn(),
  };
  const mockMonitorMintCallsAgent = {
    handleTransaction: jest.fn(),
  };
  const mockTxEvent = {
    some: "event",
  };

  beforeAll(() => {
    handleTransaction = provideHandleTransaction(
        mockDeployerWatchAgent,
        mockMonitorMintCallsAgent
    );
  });

  describe("handleTransaction", () => {
    it("invokes deployer-watch and monitor-mint-calls agents and returns their findings", async () => {
      const mockFinding = { some: "finding" };
      mockDeployerWatchAgent.handleTransaction.mockReturnValueOnce([mockFinding]);
      mockMonitorMintCallsAgent.handleTransaction.mockReturnValueOnce([mockFinding]);

      const findings = await handleTransaction(mockTxEvent);

      expect(findings).toStrictEqual([mockFinding, mockFinding]);
      expect(mockDeployerWatchAgent.handleTransaction).toHaveBeenCalledTimes(1);
      expect(mockDeployerWatchAgent.handleTransaction).toHaveBeenCalledWith(
        mockTxEvent
      );
      expect(mockMonitorMintCallsAgent.handleTransaction).toHaveBeenCalledTimes(1);
      expect(mockMonitorMintCallsAgent.handleTransaction).toHaveBeenCalledWith(
        mockTxEvent
      );
    });
  });
});