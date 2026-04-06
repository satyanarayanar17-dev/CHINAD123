#!/bin/bash
echo "=== BOOT GUARD VALIDATION ==="

# Function to run container with modified env and capture exit code + logs
test_boot_guard() {
  TEST_NAME=$1
  ENV_VAR=$2
  ENV_VAL=$3
  EXPECTED_MSG=$4

  echo -e "\n--- $TEST_NAME ---"
  
  # Run backend directly using node with NODE_ENV=production to trigger prod guards
  export NODE_ENV=production
  export DB_DIALECT=postgres
  export DATABASE_URL=postgres://local
  export JWT_SECRET=super_secure_crypto_secret_32_characters_long_for_test
  export CORS_ORIGIN=http://localhost
  export PILOT_AUTH_BYPASS=

  # Override the specific variable
  export $ENV_VAR="$ENV_VAL"

  node backend/server.js 2> error.log
  EXIT_CODE=$?
  LOG_OUTPUT=$(cat error.log)

  if [ $EXIT_CODE -ne 0 ]; then
    echo "Result: PASS - Server crashed as expected (Exit code $EXIT_CODE)"
    # Check if the log contains the expected message
    if echo "$LOG_OUTPUT" | grep -q "$EXPECTED_MSG"; then
      echo "Message Match: PASS"
      echo "Log excerpt: "
      echo "$LOG_OUTPUT" | grep "$EXPECTED_MSG"
    else
      echo "Message Match: FAIL (Expected: $EXPECTED_MSG)"
      echo "Actual log: $LOG_OUTPUT"
    fi
  else
    echo "Result: FAIL - Server booted unexpectedly!"
  fi
}

# Test 1: PILOT_AUTH_BYPASS=true
test_boot_guard "Testing PILOT_AUTH_BYPASS=true" "PILOT_AUTH_BYPASS" "true" "PILOT_AUTH_BYPASS cannot be true in production deployment"

# Test 2: Missing JWT_SECRET
test_boot_guard "Testing missing JWT_SECRET" "JWT_SECRET" "" "JWT_SECRET is not set"

# Test 3: Default JWT_SECRET
test_boot_guard "Testing default JWT_SECRET" "JWT_SECRET" "pilot-beta-secure-secret-key" "JWT_SECRET is using the known insecure default value"

# Test 4: Short JWT_SECRET
test_boot_guard "Testing short JWT_SECRET" "JWT_SECRET" "tooshort" "Minimum 32 required"

# Test 5: Missing CORS_ORIGIN
test_boot_guard "Testing missing CORS_ORIGIN" "CORS_ORIGIN" "" "CORS_ORIGIN must be explicitly set"

rm error.log
echo -e "\n=== BOOT GUARD VALIDATION COMPLETE ==="
