#!/bin/bash

# Load environment variables
source .env

# Run the deployment script
echo "Running deployment script..."
forge script script/Deploy.s.sol:DeployScript \
  --rpc-url "$BASE_RPC_URL" \
  --private-key "$PRIVATE_KEY" \
  --broadcast \
  --verify true
