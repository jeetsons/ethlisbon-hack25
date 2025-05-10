#!/bin/bash

# Load environment variables
source .env

# Rebuild the contracts
echo "Building contracts..."
forge build

# Run the deployment script and capture the output
echo "Running deployment script..."
DEPLOY_OUTPUT=$(forge script script/Deploy.s.sol:DeployScript \
  --rpc-url "$BASE_RPC_URL" \
  --private-key "$PRIVATE_KEY" \
  --broadcast)

# Save output to a file for debugging
echo "$DEPLOY_OUTPUT" > deploy-output.txt

# Extract the LeveragedLPManager address from the deployment output
echo "Extracting LeveragedLPManager address..."
LEVERAGED_LP_MANAGER_ADDRESS=$(echo "$DEPLOY_OUTPUT" | grep "LeveragedLPManager deployed at:" | grep -oE '0x[a-fA-F0-9]{40}')

if [ -z "$LEVERAGED_LP_MANAGER_ADDRESS" ]; then
  echo "Could not extract LeveragedLPManager address from deployment output."
  echo "Please check the deploy-output.txt file and update the address manually in TestEndToEnd.js."
  exit 1
fi

echo "LeveragedLPManager deployed at: $LEVERAGED_LP_MANAGER_ADDRESS"

# Update the TestEndToEnd.js file with the new address
echo "Updating TestEndToEnd.js with the new LeveragedLPManager address..."
sed -i '' "s/leveragedLPManager: \"0x[a-fA-F0-9]\{40\}\"/leveragedLPManager: \"$LEVERAGED_LP_MANAGER_ADDRESS\"/g" script/TestEndToEnd.js

# Run the TestEndToEnd.js script
echo "Running TestEndToEnd.js..."
node script/TestEndToEnd.js $PRIVATE_KEY_E2E
