# Participant IAM policy

## License

Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.

SPDX-License-Identifier: MIT-0

Permission is hereby granted, free of charge, to any person obtaining a copy of
this software and associated documentation files (the "Software"), to deal in
the Software without restriction, including without limitation the rights to
use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of
the Software, and to permit persons to whom the Software is furnished to do so.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS
FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR
COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN
AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION
WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

The MIT-0 notice above covers `participant-policy.json` in this directory. It
lives here because that file is JSON consumed by Workshop Studio, and JSON has
no comment syntax to carry a license header.

## What the policy is

The permission set attached to the Workshop Studio participant role for AWS-run
events (wired up via `participantRole.iamPolicies` in `contentspec.yaml`). It
grants what participants need to deploy and inspect the Pixel Rush stacks:
CloudFormation, Amazon GameLift Servers, Lambda, DynamoDB, API Gateway,
CloudFront, S3, SNS, plus IAM scoped to the `cdk-*` and `PixelRush*` roles — no
blanket administrator access.

## Deliberate workshop trade-offs

Some grants are broader than a production policy would be, and that is on
purpose:

- **`ReadOnlyDiscoveryWildcardRequired` uses `Resource: "*"`.** Participants
  spend much of the workshop reading state in the console (fleet events, game
  sessions, stack outputs, log groups), and those `Describe*` / `List*` / `Get*`
  calls do not accept useful ARN scoping across every service involved. The
  actions are read-only; nothing in this statement can mutate or delete a
  resource. In production, scope the resource field per service where the API
  supports it — for example `arn:aws:cloudformation:*:*:stack/PixelRush*/*`.
- **Mutating actions are scoped** to the workshop's own resource names (see
  `ReadOnlyDataPlaneScopedToPixelRush` and the `PixelRush*` / `cdk-*`
  conditions), so a participant cannot alter unrelated resources in the account.

## Account boundary, and the one deliberate exception

Every statement except one carries `aws:ResourceAccount: ${aws:PrincipalAccount}`,
which keeps it inside the participant's own account. That matters most for Amazon
S3: an S3 ARN carries no account ID, so `arn:aws:s3:::cdk-*` would otherwise match
a similarly-named bucket in *any* account.

The exception is **`ReadOnlyDiscoveryWildcardRequired`**, which deliberately has
**no** such condition — do not "complete" it, that breaks the workshop. It
contains account-level APIs such as `s3:ListAllMyBuckets`,
`sts:GetCallerIdentity` and `cloudformation:ListStacks`, which have no
resource-account context at all, so the condition could never be satisfied.

## No shell access to the development machine

The participant role grants no `ssm:StartSession`, and the instance role carries
no `AmazonSSMManagedInstanceCore`, so there is no Session Manager path onto the
development machine. The browser IDE reached through CloudFront is the only way
in, by design. If you ever need to debug a machine that fails to serve the IDE,
add those permissions temporarily rather than leaving them in the workshop's
baseline.

## GameLift fleet ARNs use the fleet ID

`GameLiftComputeCalls` and `ManageFleetLocations` are scoped to
`arn:aws:gamelift:*:*:fleet/*`, not to a name prefix. A fleet ARN is
`arn:<partition>:gamelift:<region>:<account>:fleet/<fleetId>` — the fleet's
*name* never appears in it, so `fleet/PixelRush*` matches nothing and every call
fails with AccessDenied. The account boundary comes from the `ResourceAccount`
condition instead; in a temporary event account the only fleets present are this
workshop's. Tag-based conditions would allow true per-fleet scoping if the fleet
carried tags.

Event accounts are temporary and wiped after the event, which bounds the blast
radius of the read-only breadth above. Do not copy this policy into a long-lived
account without tightening it first.
