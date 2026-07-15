---
title: "Clone & Bootstrap"
weight: 23
---

## 1. Get the code

{{% notice info %}}
**AWS event (dev machine):** skip this — the repo is already cloned at
`~/gamelift-workshop` and all dependencies are installed. Just open a terminal
and `cd ~/gamelift-workshop`, then jump to step 3.
{{% /notice %}}

**Own account only** — clone and install dependencies:

```bash
git clone https://github.com/aws-samples/sample-gamelift-workshop-pixelrush.git
cd gamelift-workshop
# the workshop/ and workshop-studio/ dirs are the tutorial's own source —
# not needed for the labs; remove them for a cleaner tree (optional)
rm -rf workshop workshop-studio
(cd infra && npm install)
(cd backend && npm install)
(cd frontend && npm install)
```

## 2. Verify your toolchain

Both paths — confirm the tools are ready:

```bash
node --version && cdk --version && aws sts get-caller-identity
```

## 3. Bootstrap CDK

**Everyone does this** — bootstrapping provisions resources *in your AWS
account* (an S3 bucket and the roles CDK deploys through), so it is required
even on the pre-built dev machine. One time per account/region:

```bash
cd infra
npx cdk bootstrap
```

Expected output ends with:

```
 ✅  Environment aws://123456789012/us-east-1 bootstrapped.
```

{{% notice note %}}
Already bootstrapped this account/region before? The command is idempotent —
it prints `(no changes)` and exits.
{{% /notice %}}
