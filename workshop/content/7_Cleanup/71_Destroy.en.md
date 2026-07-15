---
title: "Destroy the Stacks"
weight: 71
---

{{% notice info %}}
**AWS event path**: skip this page — temporary accounts are wiped automatically
after the event.
{{% /notice %}}

## One command

```bash
cd infra
npx cdk destroy PixelRushGameLiftStack PixelRushFrontendStack PixelRushBackendStack --force
```

Takes ~10 minutes (fleet termination dominates). You can close the terminal —
deletion continues server-side.

## Verify (the bill-safe checklist)

The only resource with a meaningful hourly cost is the fleet instance. Confirm:

1. Console → **GameLift → Fleets**: `PixelRushFleet` is *Deleting* or gone
2. Console → **CloudFormation**: all three `PixelRush*` stacks show
   *DELETE_COMPLETE* (or are absent)
3. Optional: **GameLift → Builds** — builds are retained by default and cost
   nothing to keep, but you can delete `PixelRushServer` manually

{{% notice tip %}}
Everything else (Lambda, DynamoDB on-demand, API Gateway, CloudFront) is
pay-per-request — zero traffic means zero cost even if deletion lags.
{{% /notice %}}
