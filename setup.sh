#!/bin/bash
set -e

ENV_FILE="apps/scheduler/.env"

if [ -f "$ENV_FILE" ]; then
  echo "apps/scheduler/.env already exists. Delete it first to regenerate."
  exit 1
fi

read -rsp "Admin password: " PASSWORD
echo

OUTPUT=$(PASSWORD="$PASSWORD" docker run --rm -i \
  -e PASSWORD \
  node:22-slim \
  node --input-type=module <<'EOF'
import crypto from 'node:crypto'
import { promisify } from 'node:util'
const scrypt = promisify(crypto.scrypt)
const salt = crypto.randomBytes(16).toString('hex')
const hash = (await scrypt(process.env.PASSWORD, salt, 64)).toString('hex')
const jwtSecret = crypto.randomBytes(32).toString('hex')
process.stdout.write(`JWT_SECRET=${jwtSecret}\nPASSWORD_HASH=${hash}\nPASSWORD_SALT=${salt}\nPORT=3001\n`)
EOF
)

echo "$OUTPUT" > "$ENV_FILE"
echo "Created $ENV_FILE — run 'docker compose up' to start."
