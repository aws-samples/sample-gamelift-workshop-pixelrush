---
title: "Path B: Own Account"
weight: 22
---

{{% notice warning %}}
**Cost estimate**: while the managed fleet is running it costs about
**$0.11/hour** (one c5.large Amazon GameLift Servers instance in us-east-1);
the serverless components are pay-per-request and negligible. The fleet only
exists for the second half of the workshop, and the Cleanup module removes
everything — a full 2-hour run typically costs well under $1.
{{% /notice %}}

## 1. AWS account & credentials

You need an account with **administrator-level access** (CDK creates IAM roles,
GameLift fleets, CloudFront distributions). Configure credentials locally:

```bash
aws configure   # or aws sso login / environment variables
aws sts get-caller-identity   # verify — should print your account ID
```

Pick a GameLift-supported region; this workshop assumes **us-east-1**. If you
want a different one, check it against
[Amazon GameLift Servers supported locations](https://docs.aws.amazon.com/gameliftservers/latest/developerguide/gamelift-regions.html)
first. Set and verify the region before deploying:

```bash
aws configure set region us-east-1
aws configure get region   # expected: us-east-1
```

## 2. Install tools

| Tool | Version | Check |
|---|---|---|
| Node.js | 20+ | `node --version` |
| Go | 1.26.2+ | `go version` |
| AWS CLI | v2 | `aws --version` |
| AWS CDK | v2 | `npx cdk --version` (no install needed — `npx` fetches it) |

macOS one-liner (Homebrew): `brew install node go awscli`
Windows: install from each tool's official site, or use WSL2.

After installing, run each command in the **Check** column above — all four
should print a version number without errors before you continue.

{{% notice tip %}}
If you take the optional **Appendix A: GameLift Anywhere**, "your machine" there
is **your laptop** — Mac and Windows both work. The game server runs locally and
your browser connects to `127.0.0.1`, so no firewall changes are needed.
{{% /notice %}}

Continue to **2.3 Bootstrap**.
