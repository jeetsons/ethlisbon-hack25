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
    // Base network addresses (to be replaced with actual addresses)
    address constant AAVE_POOL = address(0); // Replace with actual Aave V3 Pool address on Base
    address constant POSITION_MANAGER = address(0); // Replace with actual Uniswap V4 Position Manager address on Base
    address constant USDC = address(0); // Replace with actual USDC address on Base
    address constant WETH = address(0); // Replace with actual WETH address on Base

    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        vm.startBroadcast(deployerPrivateKey);

        // Deploy LeveragedLPManager with a temporary hook address (will be updated later)
        LeveragedLPManager manager = new LeveragedLPManager(
            AAVE_POOL,
            POSITION_MANAGER,
            USDC,
            WETH,
            address(0) // Temporary hook address
        );

        // Deploy FeeCollectHook with the manager address
        FeeCollectHook hook = new FeeCollectHook(
            POSITION_MANAGER,
            address(manager),
            USDC,
            WETH
        );

        // Update the hook address in the manager
        // Note: In a production environment, you would need a setter function in the manager contract
        // or deploy the contracts in a different way to handle this circular dependency

        vm.stopBroadcast();

        // Log the deployed contract addresses
        console.log("LeveragedLPManager deployed at:", address(manager));
        console.log("FeeCollectHook deployed at:", address(hook));
    }
}
