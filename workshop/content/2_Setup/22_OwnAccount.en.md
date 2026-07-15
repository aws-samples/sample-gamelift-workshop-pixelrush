---
title: "Path B: Own Account"
weight: 22
---

{{% notice warning %}}
**Cost estimate**: the resources deployed today cost roughly **$0.20/hour** while
running (one c5.large GameLift instance + serverless components). The Cleanup
module removes everything; a full 2-hour run typically costs under $1.
{{% /notice %}}

## 1. AWS account & credentials

You need an account with **administrator-level access** (CDK creates IAM roles,
GameLift fleets, CloudFront distributions). Configure credentials locally:

```bash
aws configure   # or aws sso login / environment variables
aws sts get-caller-identity   # verify — should print your account ID
```

Pick a GameLift-supported region; this workshop assumes **us-east-1**.

## 2. Install tools

| Tool | Version | Check |
|---|---|---|
| Node.js | 20+ | `node --version` |
| Go | 1.26.2+ | `go version` |
| AWS CLI | v2 | `aws --version` |
| AWS CDK | v2 | `npx cdk --version` (no install needed — `npx` fetches it) |

macOS one-liner (Homebrew): `brew install node go awscli`
Windows: install from each tool's official site, or use WSL2.

{{% notice tip %}}
In this path, "your machine" for the GameLift Anywhere module (Module 3) is
**your laptop** — Mac and Windows both work. The game server will run locally
and your browser connects to `127.0.0.1`, so no firewall changes are needed.
{{% /notice %}}

Continue to **2.3 Bootstrap**.
