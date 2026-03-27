#!/usr/bin/env bash
set -euo pipefail

# Generates secrets for Supabase self-hosted deployment.
# Requires: openssl, python3 (for JWT generation)

POSTGRES_PASSWORD=$(openssl rand -base64 32 | tr -d '/+=' | head -c 32)
JWT_SECRET=$(openssl rand -base64 48 | tr -d '/+=' | head -c 48)

# Generate anon key (JWT with role=anon, expires in 5 years)
ANON_KEY=$(python3 -c "
import json, base64, hmac, hashlib, time
header = base64.urlsafe_b64encode(json.dumps({'alg':'HS256','typ':'JWT'}).encode()).rstrip(b'=').decode()
payload = base64.urlsafe_b64encode(json.dumps({
    'role': 'anon',
    'iss': 'supabase',
    'iat': int(time.time()),
    'exp': int(time.time()) + 157680000
}).encode()).rstrip(b'=').decode()
sig = base64.urlsafe_b64encode(hmac.new(
    '${JWT_SECRET}'.encode(), f'{header}.{payload}'.encode(), hashlib.sha256
).digest()).rstrip(b'=').decode()
print(f'{header}.{payload}.{sig}')
")

# Generate service_role key (JWT with role=service_role, expires in 5 years)
SERVICE_ROLE_KEY=$(python3 -c "
import json, base64, hmac, hashlib, time
header = base64.urlsafe_b64encode(json.dumps({'alg':'HS256','typ':'JWT'}).encode()).rstrip(b'=').decode()
payload = base64.urlsafe_b64encode(json.dumps({
    'role': 'service_role',
    'iss': 'supabase',
    'iat': int(time.time()),
    'exp': int(time.time()) + 157680000
}).encode()).rstrip(b'=').decode()
sig = base64.urlsafe_b64encode(hmac.new(
    '${JWT_SECRET}'.encode(), f'{header}.{payload}'.encode(), hashlib.sha256
).digest()).rstrip(b'=').decode()
print(f'{header}.{payload}.{sig}')
")

DASHBOARD_PASSWORD=$(openssl rand -base64 24 | tr -d '/+=' | head -c 24)

cat <<EOF

# Generated secrets for HouseOps Supabase deployment
# Copy these into infra/ansible/vars/secrets.yml

postgres_password: "${POSTGRES_PASSWORD}"
jwt_secret: "${JWT_SECRET}"
anon_key: "${ANON_KEY}"
service_role_key: "${SERVICE_ROLE_KEY}"
dashboard_username: "admin"
dashboard_password: "${DASHBOARD_PASSWORD}"
domain: "FILL_IN_YOUR_DOMAIN"

EOF

echo "--- Save these somewhere safe. They cannot be recovered. ---"
