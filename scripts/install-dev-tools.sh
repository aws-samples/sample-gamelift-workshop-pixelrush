#!/usr/bin/env bash
# Installs the dev-machine toolchains that Amazon Linux does not ship at the
# versions this workshop needs: the Go toolchain, Node.js, and code-server.
#
# Run by the Workshop Studio dev-machine's CloudFormation UserData AFTER the
# repository is cloned. Keeping these downloads in a repo script (not inline in
# the CloudFormation template) means the template itself references no external
# software URLs. Each toolchain is fetched from its vendor's OFFICIAL channel:
#   - Go        -> go.dev (Go team @ Google): tarball SHA256-verified against
#                  go.dev's signed release manifest before it is unpacked.
#   - Node.js   -> rpm.nodesource.com (NodeSource): official setup script that
#                  configures NodeSource's GPG-signed dnf repo; dnf then
#                  verifies the package signature before install.
#   - code-server -> code-server.dev (Coder): official install script, which on
#                  RPM hosts installs Coder's GPG-signed package via dnf.
#
# Usage: install-dev-tools.sh <go_version> <code_server_version>
set -euxo pipefail

GO_VERSION="${1:?go version required}"
CS_VERSION="${2:?code-server version required}"

# A freshly booted AL2023 instance runs background dnf/rpm work (cloud-init
# package stage, dnf makecache timer) that competes for the rpm lock and makes
# `rpm --import` / `dnf install` fail intermittently. Stop those timers, then
# wait until nothing else holds the lock before we start.
systemctl stop dnf-makecache.timer dnf-makecache.service 2>/dev/null || true
for i in $(seq 1 60); do
  if ! fuser /var/lib/rpm/.rpm.lock >/dev/null 2>&1; then
    break
  fi
  echo "waiting for rpm lock to clear ($i)..."
  sleep 5
done

# Run a package command, retrying while the rpm lock is contended (background
# dnf activity on a fresh instance can grab it between our steps).
retry_rpm() {
  local n
  for n in $(seq 1 20); do
    if "$@"; then
      return 0
    fi
    echo "package step failed (attempt $n), waiting for rpm lock..."
    for _ in $(seq 1 12); do
      fuser /var/lib/rpm/.rpm.lock >/dev/null 2>&1 || break
      sleep 5
    done
    sleep 3
  done
  return 1
}

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
# NodeSource's official setup script configures their GPG-signed dnf repo;
# dnf verifies the nodejs package signature before installing.
curl -fsSL https://rpm.nodesource.com/setup_20.x -o /tmp/nodesource_setup.sh
retry_rpm bash /tmp/nodesource_setup.sh
retry_rpm dnf install -y nodejs

# --- AWS CDK --------------------------------------------------------------
npm install -g aws-cdk

# --- code-server ----------------------------------------------------------
# Coder's official installer; on RPM hosts it installs a GPG-signed package
# via dnf. CS_VERSION pins the release for reproducibility.
curl -fsSL https://code-server.dev/install.sh -o /tmp/code-server-install.sh
retry_rpm sh /tmp/code-server-install.sh --version "${CS_VERSION}"
