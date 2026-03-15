#!/bin/bash
set -e

# Start the main server
exec node dist/index.js
