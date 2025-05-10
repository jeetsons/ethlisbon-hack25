declare module '../config' {
  const config: {
    addresses: {
      leveragedLPManager: string;
      feeCollectHook: string;
      usdc: string;
      weth: string;
      uniswapPositionManager: string;
      aaveDataProvider: string;
    };
  };
  export default config;
}
