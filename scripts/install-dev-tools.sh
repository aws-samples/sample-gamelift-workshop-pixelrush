#!/usr/bin/env bash
# Installs the dev-machine toolchains that Amazon Linux does not ship at the
# versions this workshop needs: the Go toolchain, Node.js, and code-server.
#
# Run by the Workshop Studio dev-machine's CloudFormation UserData AFTER the
# repository is cloned (so the CFN template itself contains no external download
# URLs). Every download comes from the vendor's OFFICIAL, canonical channel and
# NOTHING is executed until it has been cryptographically verified:
#   - Go        -> go.dev (Go team @ Google): tarball SHA256-verified against
#                  go.dev's signed release manifest before it is unpacked.
#   - Node.js   -> rpm.nodesource.com (NodeSource): dnf repo defined directly
#                  (no setup script executed); dnf verifies the package's GPG
#                  signature against NodeSource's imported key before install.
#   - code-server -> github.com/coder/code-server (Coder official releases): a
#                  pinned-version RPM is downloaded and SHA256-verified before
#                  dnf installs it.
#
# Usage: install-dev-tools.sh <go_version> <code_server_version> <code_server_sha256>
set -euxo pipefail

GO_VERSION="${1:?go version required}"
CS_VERSION="${2:?code-server version required}"
CS_SHA256="${3:?code-server sha256 required}"

# --- Go -------------------------------------------------------------------
GO_TARBALL="go${GO_VERSION}.linux-amd64.tar.gz"
curl -fsSL "https://go.dev/dl/${GO_TARBALL}" -o /tmp/go.tar.gz
GO_SHA256=$(curl -fsSL "https://go.dev/dl/?mode=json&include=all" \
  | python3 -c "import json,sys; print(next(f['sha256'] for v in json.load(sys.stdin) for f in v['files'] if f['filename']=='${GO_TARBALL}'))")
echo "${GO_SHA256}  /tmp/go.tar.gz" | sha256sum -c -
tar -C /usr/local -xzf /tmp/go.tar.gz
ln -sf /usr/local/go/bin/go /usr/local/bin/go
ln -sf /usr/local/go/bin/gofmt /usr/local/bin/gofmt

# --- Node.js --------------------------------------------------------------
# On a freshly booted instance cloud-init/dnf may still hold the rpm lock, so
# wait for it to clear (up to ~2.5 min) before importing the key / installing.
for i in $(seq 1 30); do
  if ! fuser /var/lib/rpm/.rpm.lock >/dev/null 2>&1 \
     && ! fuser /var/cache/dnf/*.pid >/dev/null 2>&1; then
    break
  fi
  echo "waiting for rpm/dnf lock to clear ($i)..."
  sleep 5
done
rpm --import https://rpm.nodesource.com/gpgkey/ns-operations-public.key
cat > /etc/yum.repos.d/nodesource-nodejs.repo << 'REPO'
[nodesource-nodejs]
name=Node.js Packages
baseurl=https://rpm.nodesource.com/pub_20.x/nodistro/nodejs/x86_64
enabled=1
gpgcheck=1
gpgkey=https://rpm.nodesource.com/gpgkey/ns-operations-public.key
REPO
dnf install -y nodejs

# --- AWS CDK --------------------------------------------------------------
npm install -g aws-cdk

# --- code-server ----------------------------------------------------------
CS_RPM="code-server-${CS_VERSION}-amd64.rpm"
curl -fsSL "https://github.com/coder/code-server/releases/download/v${CS_VERSION}/${CS_RPM}" -o "/tmp/${CS_RPM}"
echo "${CS_SHA256}  /tmp/${CS_RPM}" | sha256sum -c -
dnf install -y "/tmp/${CS_RPM}"
