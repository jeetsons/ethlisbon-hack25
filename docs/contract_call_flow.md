# Contract Call Flow for Frontend (Dev 1)

This doc lists, for each UI page, the smart contract calls you’ll need to make (using ethers.js or viem) to interact with the DeFi protocol on Base via the user’s Gnosis Pay wallet.  
Each section includes:  
- What contract to call  
- Function name and key parameters  
- Approval/allowance steps  
- Example ethers.js code snippets where useful

---

## 1. Landing & Wallet Connection

- **No contract calls here.**
- Use Gnosis Pay SDK to connect wallet and get the Safe address.

---

## 2. Gnosis Pay Wallet Creation

- **No direct contract calls from frontend.**
- Use Gnosis Pay SDK to create/select Safe wallet.

---

## 3. Funding Page

- **Send ETH to Safe wallet:**
  - Use Gnosis Pay SDK or standard send transaction to fund Safe (not a contract call).
  - Show balance via `provider.getBalance(safeAddress)`.

---

## 4. Strategy Setup & Approval Page

### a) **ERC20 Approvals**
**Purpose:** Allow LeveragedLPManager to spend user's ETH (WETH) and USDC.

- **Contract:** ERC20 (USDC, WETH)
- **Function:** `approve(spender, amount)`
- **Spender:** LeveragedLPManager contract address
- **Token:** USDC and WETH (wrap ETH if necessary)

**Sample (ethers.js):**
```js
const usdcContract = new ethers.Contract(USDC_ADDRESS, ERC20_ABI, signer);
await usdcContract.approve(LEVERAGED_LP_MANAGER_ADDRESS, usdcAmount);

const wethContract = new ethers.Contract(WETH_ADDRESS, ERC20_ABI, signer);
await wethContract.approve(LEVERAGED_LP_MANAGER_ADDRESS, wethAmount);
```

### b) **NFT Approvals (after LP is minted)**
**Purpose:** Allow FeeCollectHook (for fee automation) and LeveragedLPManager (for exit/unwind) to manage the LP NFT.

- **Contract:** Uniswap V4 Position Manager (ERC721)
- **Function:** `approve(spender, tokenId)` (or `setApprovalForAll(spender, true)`)
- **Spender:** FeeCollectHook address, LeveragedLPManager address
- **TokenId:** ID of user's LP NFT

**Sample:**
```js
const lpNftContract = new ethers.Contract(UNIV4_POSITION_MANAGER_ADDRESS, ERC721_ABI, signer);
await lpNftContract.approve(FEE_COLLECT_HOOK_ADDRESS, lpTokenId); // For fee automation
await lpNftContract.approve(LEVERAGED_LP_MANAGER_ADDRESS, lpTokenId); // For exit/unwind
```
*Alternatively, use `setApprovalForAll` if you want to approve the whole contract for all NFTs.*

---

## 5. Start Strategy Page

**Start the leveraged strategy.**

- **Contract:** LeveragedLPManager
- **Function:** `startStrategy(safe, ethAmount, ltv)`
  - `safe`: address of user's Gnosis Pay (Safe) wallet
  - `ethAmount`: amount of ETH to deposit as collateral
  - `ltv`: loan-to-value %, e.g. 50-75

**Sample:**
```js
const manager = new ethers.Contract(LEVERAGED_LP_MANAGER_ADDRESS, MANAGER_ABI, signer);
// Example: 0.5 ETH, 75% LTV
await manager.startStrategy(safeAddress, ethers.utils.parseEther("0.5"), 75);
```
- Wait for transaction receipt.
- After LP NFT is minted, get `lpTokenId` from `StrategyStarted` event.

---

## 6. Dashboard / Monitoring Page

**No direct contract calls for actions, but you will:**
- **Read data:**
  - Query balances (ETH, USDC, WETH) using ERC20 and provider.
  - Get LP NFT info from Uniswap V4 Position Manager.
  - Listen for contract events (StrategyStarted, FeesProcessed, FeesCollected, StrategyExited).
  - Check approval status for both FeeCollectHook and LeveragedLPManager:
    ```js
    const isApprovedForFeeHook = await lpNftContract.getApproved(lpTokenId) === FEE_COLLECT_HOOK_ADDRESS;
    const isApprovedForExit = await lpNftContract.getApproved(lpTokenId) === LEVERAGED_LP_MANAGER_ADDRESS;
    ```

---

## 7. Fee Automation Status Page

**No contract calls from frontend; display event-driven status.**
- Listen for `FeesCollected` and `FeesProcessed` events to show automation status.

---

## 8. Exit/Unwind Confirmation Page

### a) **NFT Approval (for exit)**
- Before allowing exit, check and (if needed) prompt user to:
  - Approve LeveragedLPManager contract for LP NFT.

```js
if (await lpNftContract.getApproved(lpTokenId) !== LEVERAGED_LP_MANAGER_ADDRESS) {
  await lpNftContract.approve(LEVERAGED_LP_MANAGER_ADDRESS, lpTokenId);
}
```

### b) **Execute Exit**
- **Contract:** LeveragedLPManager
- **Function:** `exitStrategy(safe)`
  - `safe`: user's Gnosis Pay (Safe) wallet address

**Sample:**
```js
await manager.exitStrategy(safeAddress);
```
- Wait for `StrategyExited` event and update UI with returned assets.

---

## 9. Error & Troubleshooting Page

- **No contract calls, but:**
  - Display error messages from failed transactions.
  - Specifically catch "not approved" errors and prompt user for required approvals.

---

## **Summary Table**

| UI Page                        | Contract Calls Needed                                                                | Approvals Required?              |
|--------------------------------|-------------------------------------------------------------------------------------|----------------------------------|
| Landing/Wallet                 | --                                                                                  | --                               |
| Wallet Creation                | -- (Gnosis Pay SDK)                                                                 | --                               |
| Funding                        | -- (native transfer or Gnosis Pay SDK)                                              | --                               |
| Strategy Setup & Approval      | `approve()` on ERC20; `approve()` on ERC721 (after LP mint)                         | Yes (ERC20 and ERC721/NFT)       |
| Start Strategy                 | `startStrategy()` on LeveragedLPManager                                             | ERC20 approvals must be set      |
| Dashboard/Monitoring           | Read state/events only                                                              | -- (show approval status)        |
| Fee Automation Status          | Listen for events only                                                              | -- (show approval status)        |
| Exit/Unwind Confirmation       | `approve()` on ERC721 (if not already set), then `exitStrategy()` on manager        | Yes (ERC721 for manager)         |
| Error/Troubleshooting          | -- (display errors and suggest next steps)                                          | --                               |

---

**Tips for Dev 1:**
- Always check for required approvals before calling strategy or exit functions.
- Use event listeners after every transaction to update UI state and confirmations.
- For swaps (startStrategy), the actual on-chain swap may be handled by the contract, but you may need to show the user a quote or simulate slippage using Uniswap API off-chain before calling the contract.

---

**See the main readme and contract ABIs for more details. If you have questions, ask Dev 2 or your tech lead!**