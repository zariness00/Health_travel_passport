#!/bin/bash
set -e

echo "Generating Swagger documentation..."
/Users/bit-wizzard/go/bin/swag init -g cmd/api/main.go

echo "Done! Swagger UI available at /swagger/index.html when the server is running."
