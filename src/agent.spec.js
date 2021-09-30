const { provideHandleTransaction } = require("./agent");

describe("agents", () => {
  let handleTransaction;
  const mockAdminEventsAgent = {
    handleTransaction: jest.fn(),
  };
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
        mockAdminEventsAgent,
        mockDeployerWatchAgent,
        mockMonitorMintCallsAgent
    );
  });

  describe("handleTransaction", () => {
    it("invokes admin-events, deployer-watch and monitor-mint-calls agents and returns their findings", async () => {
      const mockFinding = { some: "finding" };
      mockAdminEventsAgent.handleTransaction.mockReturnValueOnce([mockFinding]);
      mockDeployerWatchAgent.handleTransaction.mockReturnValueOnce([mockFinding]);
      mockMonitorMintCallsAgent.handleTransaction.mockReturnValueOnce([mockFinding]);

      const findings = await handleTransaction(mockTxEvent);

      expect(findings).toStrictEqual([mockFinding, mockFinding, mockFinding]);
      expect(mockAdminEventsAgent.handleTransaction).toHaveBeenCalledTimes(1);
      expect(mockAdminEventsAgent.handleTransaction).toHaveBeenCalledWith(
        mockTxEvent
      );
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