# Project Specification: Leveraged Liquidity Provision with Aave & Uniswap V4 via Safe

**Version:** 1.0
**Date:** 2025-05-09

## 1. Overview & Goal

This project aims to create a decentralized application (dApp) that allows users to provide liquidity on Uniswap V4 with leverage obtained by borrowing from Aave V3. The user's Gnosis Safe wallet will be the central point of asset ownership and transaction execution, orchestrated by our application UI using the Safe{Core} SDK. The system will feature an automated mechanism via a Uniswap V4 hook to collect LP fees, repay the Aave loan, and compound ETH collateral.

**Target Pair:** USDC/ETH on Uniswap V4.
**Leverage Source:** Borrow USDC from Aave V3 against ETH collateral.

## 2. Core Architecture

The system comprises the following key components:

1.  **User:** Interacts with the Application UI.
2.  **Application UI/Frontend:**
    *   Guides the user through all processes.
    *   Uses Safe{Core} SDK to construct and propose transactions to the User's Safe.
    *   Displays P&L estimates, current Aave borrow rates, and Uniswap pool info.
3.  **User's Safe Wallet (1/1 Gnosis Safe):**
    *   Created/managed via the App UI & Safe{Core} SDK.
    *   Funded by the user with ETH.
    *   Owns:
        *   ETH collateral in Aave (represented by aTokens).
        *   The Uniswap V4 LP NFT.
        *   Borrowed USDC (briefly, before LPing or after LP withdrawal).
        *   Collected fees (briefly, before processing).
    *   Executes all on-chain transactions (often multi-send transactions).
4.  **`HookContract` (Uniswap V4 Hook):**
    *   A single, stateless (regarding user funds) smart contract deployed once.
    *   Associated with the target Uniswap V4 USDC/ETH pool.
    *   Triggered by Uniswap V4 after swaps on LPs that have opted-in.
    *   Requires approval from the User's Safe to `collect` fees from its LP NFT.
    *   Tracks trade counts per LP position.
    *   On the 10th trade for an LP, collects fees and sends them to `MainLogicContract` along with the `userSafeAddress`.
5.  **`MainLogicContract` (Main DeFi Logic Contract):**
    *   A single smart contract deployed once.
    *   Acts as an authorized operator for the User's Safe for specific DeFi actions.
    *   Receives fees (USDC & ETH) from `HookContract`.
    *   Interacts with Aave V3 on behalf of the User's Safe to:
        *   Borrow USDC (initial setup).
        *   Repay USDC loan (from collected fees).
        *   Supply ETH collateral (from collected fees).
    *   Creates the Uniswap V4 LP position and transfers the LP NFT to the User's Safe.
    *   Manages state related to user positions (e.g., LP NFT ID, initial deposit info for P&L).
    *   Emits events for all significant actions.
6.  **Aave V3 Protocol:** Source of USDC loans and destination for ETH collateral.
7.  **Uniswap V4 Protocol:** Platform for USDC/ETH liquidity provision.

## 3. Key User Flows

### 3.1. User Onboarding & Strategy Initiation

1.  **User Onboarding (App UI):**
    *   User connects their EOA wallet.
    *   App UI uses Safe{Core} SDK to guide the user to create or select an existing 1/1 Gnosis Safe.
    *   User funds this Safe with ETH.

2.  **Strategy Initiation (App UI proposes multi-send transaction to User's Safe):**
    The User's Safe executes a batch transaction with the following calls:
    *   **Tx 1 (Approve Aave for ETH):** `User's Safe` calls `approve(AAVE_POOL_ADDRESS, WETH_ADDRESS, ETH_AMOUNT_TO_COLLATERALIZE)` on the WETH contract (assuming WETH).
    *   **Tx 2 (Supply ETH to Aave):** `User's Safe` calls `supply(WETH_ADDRESS, ETH_AMOUNT_TO_COLLATERALIZE, User's Safe Address, 0)` on Aave's `Pool` contract. aTokens are minted to the User's Safe.
    *   **Tx 3 (Delegate Aave Borrow Power):** `User's Safe` calls `approveDelegation(MAIN_LOGIC_CONTRACT_ADDRESS, USDC_DEBT_TOKEN_ADDRESS, MAX_BORROW_AMOUNT)` on Aave's USDC Debt Token contract. This allows `MainLogicContract` to borrow USDC on behalf of the Safe.
        *   *(Alternative: If Aave's `borrow` allows `onBehalfOf` with general `msg.sender` authorization by the user, this might be simpler than full credit delegation. Investigate Aave V3's exact mechanism for third-party borrow on behalf of another address).*
    *   **Tx 4 (Approve `MainLogicContract` for Aave Repay/Supply on Behalf):**
        *   The User's Safe needs to grant `MainLogicContract` permissions to repay USDC and supply ETH to Aave on its behalf. This typically involves the Safe approving the Aave Pool contract to spend tokens (USDC, WETH) that are sent *to* or held *by* the `MainLogicContract` when `MainLogicContract` calls Aave's `repay` or `supply` with `onBehalfOf = User's Safe Address`.
    *   **Tx 5 (Call `MainLogicContract` to Borrow & LP):** `User's Safe` calls `borrowAndCreateLP(USER_SAFE_ADDRESS, USDC_AMOUNT_TO_BORROW, UNISWAP_POOL_KEY_PARAMS, LP_RANGE_PARAMS)` on `MainLogicContract`.
        *   `MainLogicContract` then:
            1.  Calls Aave `borrow(USDC_ADDRESS, USDC_AMOUNT_TO_BORROW, INTEREST_RATE_MODE, 0, USER_SAFE_ADDRESS)`. Borrowed USDC is sent to `MainLogicContract`.
            2.  Approves Uniswap V4 Router/Position Manager for the borrowed USDC and an equivalent value of ETH (which it should receive or be authorized to use from the User's Safe if not providing full range). For simplicity, assume full-range USDC/ETH LP with ETH sourced from the user's initial collateral implicitly via the leverage ratio. The `MainLogicContract` will need the ETH portion for LPing.
                *   *Clarification Needed:* How does `MainLogicContract` get the ETH for LPing if it only borrowed USDC? The ETH for LPing must also come from the User's Safe. This might require an additional ETH transfer to `MainLogicContract` in Tx5 or `MainLogicContract` being approved to pull it.
                *   *Simpler for hackathon:* Assume the strategy uses a portion of the initial ETH collateral directly for LPing alongside the borrowed USDC. The `borrowAndCreateLP` function would need to manage this. Or, the LP is primarily USDC, and the ETH side is small, or the user provides additional ETH. For a standard leveraged LP, the ETH portion of the LP comes from the initial collateral. `MainLogicContract` would need access to this ETH from the Safe.
                *   *Revised Tx5 Logic:* `User's Safe` calls `borrowAndCreateLP(...)` on `MainLogicContract`, also sending the ETH required for the LP position (or approving `MainLogicContract` to pull it).
            3.  Calls Uniswap V4 to create the liquidity position (e.g., `mint` on the position manager).
            4.  Transfers the newly minted Uniswap V4 LP NFT to `USER_SAFE_ADDRESS`.
            5.  Emits `StrategyInitiated` event.
    *   **Tx 6 (Approve `HookContract` for LP Fee Collection):** `User's Safe` calls `setApprovalForAll(HOOK_CONTRACT_ADDRESS, true)` or `approve(HOOK_CONTRACT_ADDRESS, LP_NFT_ID)` on the Uniswap V4 LP NFT contract.

### 3.2. Automated Fee Processing (via `HookContract` & `MainLogicContract`)

1.  A swap occurs on Uniswap V4 involving the User's Safe's LP position.
2.  Uniswap V4 calls the registered `HookContract` (e.g., `afterSwap` hook).
3.  **`HookContract` Logic:**
    *   Identifies the `lpOwnerAddress` (User's Safe).
    *   Increments an internal trade counter for this `lpOwnerAddress` (or `lpNftId`).
    *   If `tradeCounter % 10 == 0`:
        1.  Calls Uniswap V4 `collect(lpOwnerAddress, hookContractAddress, ...)` for the LP position. Fees (USDC & ETH) are sent to `HookContract`.
        2.  `HookContract` transfers the collected USDC and ETH to `MainLogicContract` by calling `MainLogicContract.processFees(lpOwnerAddress, usdcCollected, ethCollected)`.
        3.  Resets `tradeCounter` for the LP to 0.
4.  **`MainLogicContract.processFees(userSafeAddress, usdcAmount, ethAmount)` Logic:**
    *   Receives USDC and ETH from `HookContract`.
    *   Calls Aave `repay(USDC_ADDRESS, usdcAmount, INTEREST_RATE_MODE, userSafeAddress)` using the received USDC.
    *   Calls Aave `supply(WETH_ADDRESS, ethAmount, userSafeAddress, 0)` using the received ETH.
    *   Emits `FeesProcessed` event.

### 3.3. User Closing Position

1.  **User Initiates Close (App UI):**
    *   App UI fetches `currentDebtAmount` from Aave and `currentCollateralAmount` for the User's Safe.
    *   App UI constructs a multi-send transaction for the User's Safe.

2.  **Unwind Multi-Send Transaction (executed by User's Safe):**
    *   **Tx 1 (Withdraw Liquidity from Uniswap V4):** `User's Safe` calls Uniswap V4 (e.g., `decreaseLiquidity` or `burn` + `collect`) to withdraw 100% of liquidity. Withdrawn USDC and ETH are sent to `User's Safe Address`.
    *   **Tx 2 (Approve Aave Pool for USDC Repayment):** `User's Safe` calls `approve(AAVE_POOL_ADDRESS, USDC_ADDRESS, currentDebtAmount)` on the USDC token contract.
    *   **Tx 3 (Repay Aave USDC Debt):** `User's Safe` calls `repay(USDC_ADDRESS, currentDebtAmount, INTEREST_RATE_MODE, User's Safe Address)` on Aave's Pool contract.
    *   **Tx 4 (Withdraw ETH Collateral from Aave):** `User's Safe` calls `withdraw(WETH_ADDRESS, currentCollateralAmount_OR_MAX_UINT, User's Safe Address)` on Aave's Pool contract. All ETH collateral is sent to `User's Safe Address`.
    *   **Tx 5 (Signal Closure to `MainLogicContract`):** `User's Safe` calls `userManuallyClosedPosition()` on `MainLogicContract`.
        *   `MainLogicContract` marks the position as closed internally and emits `PositionClosed` event.
    *   **(Optional) Tx 6+ (Revoke Approvals):** Revoke approvals given to `HookContract` and `MainLogicContract` (e.g., Aave delegation).

3.  **Final Fund Transfer (App UI - Separate Standard Safe Transaction):**
    *   App UI displays the consolidated ETH and any remaining USDC balances in the User's Safe.
    *   User uses standard Safe functionality (guided by App UI) to transfer these funds to their desired EOA wallet.

## 4. Smart Contract Details

### 4.1. `MainLogicContract.sol`

**State Variables:**

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
// Interfaces for Aave, Uniswap V4, etc.
// import {IPool} from "aave-v3-core/contracts/interfaces/IPool.sol";
// import {IPoolAddressesProvider} from "aave-v3-core/contracts/interfaces/IPoolAddressesProvider.sol";
// import {IUniswapV4Factory} from "v4-core/interfaces/IUniswapV4Factory.sol";
// import {IUniswapV4Pool} from "v4-core/interfaces/IUniswapV4Pool.sol";
// import {PoolKey} from "v4-core/types/PoolKey.sol";
// import {IPositionManager} from "v4-periphery/interfaces/IPositionManager.sol"; // Or equivalent for LP NFTs

contract MainLogicContract is IERC721Receiver {
    address public immutable owner; // Deployer
    address public immutable hookContractAddress;
    address public immutable wethAddress; // WETH for Aave
    address public immutable usdcAddress; // USDC for Aave & LP
    // IPoolAddressesProvider public immutable aaveAddressesProvider;
    // IPool public immutable aavePool;
    // IPositionManager public immutable uniswapV4PositionManager; // Or equivalent

    struct UserPosition {
        address userSafeAddress;
        uint256 uniswapLpNftId;
        // PoolKey uniswapPoolKey; // If needed
        uint256 initialEthSuppliedToAave;
        uint256 initialUsdcBorrowed;
        bool isActive;
    }

    mapping(address => UserPosition) public userPositions; // userSafeAddress => UserPosition
    mapping(uint256 => address) public lpNftIdToUserSafe; // uniswapLpNftId => userSafeAddress

    // Modifiers
    modifier onlyOwner() {
        require(msg.sender == owner, "Caller is not the owner");
        _;
    }

    modifier onlyHook() {
        require(msg.sender == hookContractAddress, "Caller is not the hook contract");
        _;
    }

    modifier onlyUserSafe(address _userSafeAddress) {
        require(msg.sender == _userSafeAddress, "Caller is not the specified User Safe");
        _;
    }

    // Events
    event StrategyInitiated(
        address indexed userSafeAddress,
        uint256 initialEthSuppliedToAave,
        uint256 usdcBorrowedFromAave,
        uint256 indexed uniswapLpNftId,
        // PoolKey uniswapPoolKey, // If using PoolKey struct
        bytes32 indexed uniswapPoolIdBytes, // Or a bytes32 representation
        uint256 timestamp
    );

    event FeesProcessed(
        address indexed userSafeAddress,
        uint256 usdcFeesCollected,
        uint256 ethFeesCollected,
        uint256 usdcRepaidToAave,
        uint256 ethAddedToAaveCollateral,
        uint256 timestamp
    );

    event PositionClosed(
        address indexed userSafeAddress,
        uint256 indexed uniswapLpNftId,
        uint256 timestamp
    );

    constructor(
        address _hookContractAddress,
        address _wethAddress,
        address _usdcAddress
        // address _aaveAddressesProviderAddress,
        // address _uniswapV4PositionManagerAddress
    ) {
        owner = msg.sender;
        hookContractAddress = _hookContractAddress;
        wethAddress = _wethAddress;
        usdcAddress = _usdcAddress;
        // aaveAddressesProvider = IPoolAddressesProvider(_aaveAddressesProviderAddress);
        // aavePool = IPool(aaveAddressesProvider.getPool());
        // uniswapV4PositionManager = IPositionManager(_uniswapV4PositionManagerAddress);
    }

    // Function to receive LP NFT - part of IERC721Receiver
    function onERC721Received(
        address operator,
        address from,
        uint256 tokenId,
        bytes calldata data
    ) external override returns (bytes4) {
        // Ensure this is called during LP minting to this contract, before transfer to user.
        // Or, if LP is minted directly to user, this might not be needed here.
        // For the described flow where MainLogicContract mints and then transfers,
        // this callback would be on the User's Safe if it were receiving.
        // If MainLogicContract is the minter, it just needs to know the tokenId.
        return IERC721Receiver.onERC721Received.selector;
    }
}


Key Functions in MainLogicContract:

borrowAndCreateLP(address _userSafeAddress, uint256 _usdcAmountToBorrow, /* Uniswap params */)

Access Control: onlyUserSafe(_userSafeAddress) (or called by Safe via delegatecall if logic is complex).
Logic:
Verify !userPositions[_userSafeAddress].isActive.
Interact with Aave Pool to borrow _usdcAmountToBorrow USDC on behalf of _userSafeAddress. Ensure USDC is sent to this MainLogicContract.
(Developer Note: Ensure this contract receives/is approved for the ETH portion for the LP from _userSafeAddress).
Approve Uniswap V4 Position Manager for USDC and ETH.
Call Uniswap V4 Position Manager to mint new LP position.
Transfer the received LP NFT to _userSafeAddress.
Store UserPosition data (LP NFT ID, initial amounts, isActive = true).
Map lpNftIdToUserSafe[lpNftId] = _userSafeAddress.
Emit StrategyInitiated.
Sample Snippet (Conceptual):

```
function borrowAndCreateLP(
    address _userSafeAddress,
    uint256 _usdcAmountToBorrow,
    uint256 _ethAmountForLP, // ETH provided by user for LP
    // PoolKey memory _poolKey, // Uniswap V4 pool identifier
    // int24 _tickLower, // For LP range
    // int24 _tickUpper, // For LP range
    uint256 _minAmount0, // Slippage protection
    uint256 _minAmount1  // Slippage protection
) external payable /* if ETH is sent directly */ {
    require(msg.sender == _userSafeAddress, "Caller must be the User Safe");
    require(!userPositions[_userSafeAddress].isActive, "Position already active");
    // Potentially require msg.value == _ethAmountForLP if ETH is sent with call

    // 1. Borrow USDC from Aave on behalf of _userSafeAddress
    // IERC20(usdcAddress).approve(address(aavePool), _usdcAmountToBorrow); // Should be done by user on MainLogic for 'onBehalfOf'
    // aavePool.borrow(usdcAddress, _usdcAmountToBorrow, VARIABLE_RATE_MODE, 0, _userSafeAddress);
    // --> This sends USDC to MainLogicContract if MainLogicContract is the borrower on behalf of user.

    // 2. Approve Uniswap for USDC and WETH (from msg.value or pulled from user)
    // IERC20(usdcAddress).approve(address(uniswapV4PositionManager), _usdcAmountToBorrow);
    // IERC20(wethAddress).approve(address(uniswapV4PositionManager), _ethAmountForLP);

    // 3. Mint Uniswap LP
    // (uint256 tokenId, uint128 liquidity, uint256 amount0, uint256 amount1) =
    //     uniswapV4PositionManager.mint(IPositionManager.MintParams(...));
    uint256 tempLpNftId = 123; // Placeholder for actual tokenId from mint

    // 4. Transfer LP NFT to _userSafeAddress
    // IERC721(address(uniswapV4PositionManager)).safeTransferFrom(address(this), _userSafeAddress, tempLpNftId);

    // 5. Store position data
    userPositions[_userSafeAddress] = UserPosition({
        userSafeAddress: _userSafeAddress,
        uniswapLpNftId: tempLpNftId,
        // uniswapPoolKey: _poolKey,
        initialEthSuppliedToAave: 0, // This should be recorded from initial Aave supply step
        initialUsdcBorrowed: _usdcAmountToBorrow,
        isActive: true
    });
    lpNftIdToUserSafe[tempLpNftId] = _userSafeAddress;

    // Emit StrategyInitiated event
}
```

processFees(address _userSafeAddress, uint256 _usdcAmount, uint256 _ethAmount)

Access Control: onlyHook().
Logic:
Verify userPositions[_userSafeAddress].isActive.
Approve Aave Pool for _usdcAmount and _ethAmount (WETH).
Call Aave Pool.repay(USDC_ADDRESS, _usdcAmount, RATE_MODE, _userSafeAddress).
Call Aave Pool.supply(WETH_ADDRESS, _ethAmount, _userSafeAddress, 0).
Emit FeesProcessed.

Sample concept code:

```
function processFees(
    address _userSafeAddress,
    uint256 _usdcAmount,
    uint256 _ethAmount
) external onlyHook {
    require(userPositions[_userSafeAddress].isActive, "Position not active");

    // Transfer received fees to this contract if Hook doesn't send them directly
    // IERC20(usdcAddress).transferFrom(hookContractAddress, address(this), _usdcAmount);
    // payable(address(this)).transfer(_ethAmount); // Or WETH transferFrom

    // Approve Aave Pool to pull these amounts from this contract
    // IERC20(usdcAddress).approve(address(aavePool), _usdcAmount);
    // IERC20(wethAddress).approve(address(aavePool), _ethAmount); // Assuming ETH is wrapped

    // aavePool.repay(usdcAddress, _usdcAmount, VARIABLE_RATE_MODE, _userSafeAddress);
    // aavePool.supply(wethAddress, _ethAmount, _userSafeAddress, 0);

    // Emit FeesProcessed event
}
```


userManuallyClosedPosition()

Access Control: onlyUserSafe(msg.sender). (Assumes msg.sender is the User's Safe).
Logic:
Fetch userPosition = userPositions[msg.sender].
Verify userPosition.isActive.
Mark userPosition.isActive = false.
Clean up lpNftIdToUserSafe[userPosition.uniswapLpNftId].
Emit PositionClosed.

```
function userManuallyClosedPosition() external {
    address userSafe = msg.sender; // Caller must be the User's Safe
    require(userPositions[userSafe].isActive, "Position not active or does not exist");

    UserPosition storage position = userPositions[userSafe];
    position.isActive = false;
    delete lpNftIdToUserSafe[position.uniswapLpNftId];

    // Emit PositionClosed event
}
```


4.2. HookContract.sol (Uniswap V4 Hook)
State Variables (Conceptual):

```
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

// import {IHooks} from "v4-core/interfaces/IHooks.sol";
// import {PoolKey} from "v4-core/types/PoolKey.sol";
// import {IPoolManager} from "v4-core/interfaces/IPoolManager.sol"; // For collect
// import {BalanceDelta} from "v4-core/types/BalanceDelta.sol";

contract HookContract /* is IHooks - actual interface TBD */ {
    address public immutable mainLogicContractAddress;
    // IPoolManager public immutable poolManager; // Uniswap V4 PoolManager

    // Mapping: LP Owner Address (User's Safe) => Trade Count
    mapping(address => uint256) public tradeCounts;
    // OR Mapping: LP NFT ID => Trade Count if hook is generic for multiple LPs
    // mapping(uint256 => uint256) public lpTradeCounts;

    uint256 constant TARGET_TRADE_COUNT = 10;

    constructor(address _mainLogicContractAddress /*, address _poolManagerAddress */) {
        mainLogicContractAddress = _mainLogicContractAddress;
        // poolManager = IPoolManager(_poolManagerAddress);
    }

    // Actual hook functions (e.g., afterSwap) will depend on Uniswap V4's final IHooks interface.
    // function afterSwap(
    //     address sender,
    //     PoolKey calldata key,
    //     IPoolManager.SwapParams calldata params,
    //     BalanceDelta delta,
    //     bytes calldata hookData
    // ) external override returns (bytes4) {
    //     // How to get lpOwnerAddress or lpNftId from these params is crucial.
    //     // Assume lpOwnerAddress can be derived or is implicitly known if hook is registered per position.
    //     address lpOwnerAddress = deriveLpOwner(key, hookData); // Placeholder

    //     tradeCounts[lpOwnerAddress]++;

    //     if (tradeCounts[lpOwnerAddress] % TARGET_TRADE_COUNT == 0) {
    //         // 1. Collect fees:
    //         // poolManager.collect(key, lpOwnerAddress, address(this), tickLower, tickUpper, amount0Requested, amount1Requested);
    //         // Fees (USDC, ETH) are now in this HookContract.

    //         // uint256 usdcCollected = IERC20(USDC_ADDRESS).balanceOf(address(this));
    //         // uint256 ethCollected = address(this).balance; // (or WETH balance)

    //         // 2. Approve MainLogicContract to spend these fees
    //         // IERC20(USDC_ADDRESS).approve(mainLogicContractAddress, usdcCollected);
    //         // if using WETH: IERC20(WETH_ADDRESS).approve(mainLogicContractAddress, ethCollected);

    //         // 3. Call MainLogicContract to process fees
    //         // IMainLogicContract(mainLogicContractAddress).processFees{value: ethCollected}(lpOwnerAddress, usdcCollected, ethCollected);
    //         // Or if using WETH, just call without value and MainLogicContract pulls WETH.

    //         tradeCounts[lpOwnerAddress] = 0;
    //     }
    //     return this.afterSwap.selector; // Or appropriate success code
    // }
}
```

Key Logic: The hook needs a way to identify the specific LP position and its owner (the User's Safe) from the arguments passed by the Uniswap pool. The collect function on Uniswap V4 will require the LP owner's address and potentially the specific position ID/NFT ID. The hook must have approval from the User's Safe to perform this collect action.
5. Safe Integration
1/1 Safe Model: Each user operates through their own Gnosis Safe (1 owner, 1 threshold).
Safe{Core} SDK: The frontend uses this SDK to:
Facilitate Safe creation/connection.
Construct and propose multi-send transactions for all key user flows (initiation, closing).
Facilitate standard token transfers from the Safe (e.g., final withdrawal to EOA).
Ownership: The User's Safe is the direct owner of Aave aTokens and the Uniswap V4 LP NFT.
Permissions:
User's Safe approves MainLogicContract for Aave borrow delegation and on-behalf-of actions (repay/supply).
User's Safe approves HookContract to collect fees from its Uniswap LP NFT.
6. P&L and Analytics (Hackathon Scope)
On-Chain Data:
MainLogicContract records initialEthSuppliedToAave and initialUsdcBorrowed in UserPosition struct.
Comprehensive events (StrategyInitiated, FeesProcessed, PositionClosed) are emitted by MainLogicContract.
Frontend P&L Calculation (Snapshot):
At deposit: UI fetches current ETH price, calculates initialEthValueAtDepositUsd.
At close (after unwind multi-call): UI fetches current ETH and USDC balances in the User's Safe, fetches current prices.
P&L Estimation: finalAssetsValueUsd = (finalEthInSafe * currentEthPrice) + (finalUsdcInSafe * currentUsdcPrice).
Display finalAssetsValueUsd - initialEthValueAtDepositUsd.
Rate Display (Frontend):
Current Aave USDC borrow APY (fetched from Aave direct view function or reliable oracle).
Current Uniswap V4 Pool fee tier. Actual LP APY is complex; link to external analytics if available, otherwise, focus on fee collection events.
Historical Data: Relies on emitted events for future indexing via TheGraph or similar services. The hackathon product will not feature deep historical analytics.
Fee Tracking: UI can display a list of FeesProcessed events for the connected user's Safe by querying the contract or a simple event indexer if built.
7. Security Considerations (Basic)
Access Control:
MainLogicContract:
borrowAndCreateLP: Called by User's Safe.
processFees: Called only by HookContract.
userManuallyClosedPosition: Called by User's Safe.
Administrative functions (if any): onlyOwner.
Reentrancy: Review critical functions for reentrancy risks, though interactions are mostly with trusted external protocols (Aave, Uniswap).
Approvals: Ensure approvals are specific and necessary. Consider approve with exact amounts where possible, or use increaseAllowance/decreaseAllowance.
Slippage: borrowAndCreateLP should include parameters for slippage protection when adding liquidity to Uniswap.
Oracle Risk: The strategy relies on Aave's and Uniswap's operational integrity. Price oracle risks are inherent in Aave.
Impermanent Loss: Users should be made aware of IL risks in LPs.
8. Assumptions & Limitations (Hackathon Scope)
Happy Path Focus: Assumes Aave and Uniswap V4 protocols are functioning correctly.
Single Pair: Focuses only on USDC/ETH.
Full Range Liquidity: For simplicity in LP creation, might default to full-range, though Uniswap V4 encourages concentrated liquidity. Parameters for range can be added if time permits.
Developer Note: The borrowAndCreateLP needs ETH for the LP. This spec assumes it's handled. Clarify if this ETH is part of the initial Aave collateral or a separate user contribution.
Gas Costs: Automated fee processing incurs gas. The 10-trade threshold is a heuristic.
Uniswap V4 Hook Interface: Based on anticipated design; actual implementation must match the final V4 hook interface.
Error Handling: Robust error handling in UI for transaction failures. Smart contract errors will revert.
No Emergency Withdraw/Pause: MainLogicContract does not currently feature global emergency pause or individual emergency withdrawal logic beyond the standard close flow.
9. Next Steps / Open Questions for Developer
Finalize Uniswap V4 Hook Interface: Obtain the exact interface and callback signatures for afterSwap (or relevant hook type) and collect functionality.
Aave V3 onBehalfOf Mechanics: Confirm the precise mechanism for MainLogicContract to borrow, repay, and supply on behalf of the User's Safe (Credit Delegation vs. simple onBehalfOf parameter with msg.sender authorization).
ETH Handling for LP Creation: Clarify the source and flow of the ETH component required by MainLogicContract to create the Uniswap LP alongside the borrowed USDC.
Gas Optimization: Review for gas efficiency, especially in the hook.
Frontend Details: UI mockups/designs will guide frontend development.
This specification should provide a strong foundation for development.
