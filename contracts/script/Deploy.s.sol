// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Script, console} from "forge-std/Script.sol";
import {LeveragedLPManager} from "../src/LeveragedLPManager.sol";
import {FeeCollectHook} from "../src/FeeCollectHook.sol";

/**
 * @title DeployScript
 * @dev Script to deploy the LeveragedLPManager and FeeCollectHook contracts to Base network
 */
contract DeployScript is Script {
    // Base mainnet network addresses
    address constant AAVE_POOL = 0xA238Dd80C259a72e81d7e4664a9801593F98d1c5; // Aave V3 Pool address on Base
    address constant POSITION_MANAGER = 0x7C5f5A4bBd8fD63184577525326123B519429bDc; // Uniswap V4 Position Manager address on Base
    address constant USDC = 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913; // USDC address on Base
    address constant WETH = 0x4200000000000000000000000000000000000006; // WETH address on Base
    address constant UNISWAP_ROUTER = 0x6fF5693b99212Da76ad316178A184AB56D299b43; // Uniswap V4 Router address on Base
    uint24 constant POOL_FEE = 3000; // 0.3% fee tier

    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        vm.startBroadcast(deployerPrivateKey);

        // First deploy LeveragedLPManager without a hook
        LeveragedLPManager manager = new LeveragedLPManager(
            AAVE_POOL,
            POSITION_MANAGER,
            USDC,
            WETH,
            address(0), // Temporary hook address
            UNISWAP_ROUTER,
            POOL_FEE
        );
        
        // Then deploy the FeeCollectHook with the manager address
        FeeCollectHook hook = new FeeCollectHook(
            POSITION_MANAGER,
            address(manager),
            USDC,
            WETH
        );
        
        // Update the hook address in the manager using the new setFeeHook function
        manager.setFeeHook(address(hook));
        
        // Authorize the Uniswap V4 pool to use the hook
        // Note: You'll need to authorize each pool that will use this hook
        // This is just an example for the ETH/USDC pool with the specified fee tier
        bytes32 poolKey = keccak256(abi.encode(WETH, USDC, POOL_FEE));
        hook.setPoolAuthorization(address(uint160(uint256(poolKey))), true);
        
        // Transfer ownership of the hook to the manager for proper access control
        hook.transferOwnership(address(manager));
        
        vm.stopBroadcast();
        
        // Log the deployed contract addresses
        console.log("LeveragedLPManager deployed at:", address(manager));
        console.log("FeeCollectHook deployed at:", address(hook));
    }
}
