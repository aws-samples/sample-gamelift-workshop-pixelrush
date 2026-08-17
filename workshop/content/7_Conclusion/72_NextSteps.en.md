---
title: "Next Steps"
weight: 72
---

## Keep going

| Topic | Why it's the natural next step |
|---|---|
| **Appendix B: Multi-region fleets** (this workshop) | Add a remote location and see latency-based placement pick it — 20 minutes, a few console clicks |
| **Appendix A: GameLift Anywhere** (this workshop) | Host a session on your own laptop or on-premises hardware — the fast-iteration and hybrid-hosting path, 15 minutes |
| **Match backfill** | Fill empty slots in running sessions (we deliberately disabled it — races don't take late joiners, but battle royales do) |
| **FleetIQ / Spot** | Cut fleet cost up to 70% with Spot instances managed for viability |
| **Containers fleets** | Package the server as a container image instead of a build |
| **Player identity** | Replace the workshop password with real auth — see the [Custom Game Backend guidance](https://github.com/aws-solutions-library-samples/guidance-for-custom-game-backend-hosting-on-aws), an AWS Solutions Library reference implementation for game backends with player identity (Steam/Apple/Google sign-in, JWT) |
| **Session metrics & autoscaling** | Target-tracking on `PercentAvailableGameSessions` |

{{% notice info %}}
**Production note — IAM least privilege:** the workshop's cloud dev machine gets
no blanket managed policy. Look at `workshop-studio.yaml` for a worked example of
scoping a deployment role: `DevInstanceCdkDeployPolicy` restricts every write to
the `CDKToolkit` / `PixelRush*` stacks and the `cdk-*` staging resources, and
relies on the fact that `cdk deploy` assumes the bootstrap roles — so the machine
itself needs no GameLift, Lambda or DynamoDB write permissions at all. Two
`Resource: "*"` grants remain, and both are deliberate: three CloudFormation APIs
that have no resource-level authorization, and cross-service read-only discovery
so participants can inspect state from the terminal. In production, tighten that
read-only breadth per service where the API supports ARN scoping.
{{% /notice %}}

## Reference material

- [Amazon GameLift Servers documentation](https://docs.aws.amazon.com/gamelift/) —
  the official service docs: fleets, queues, FlexMatch, the Server SDK and API reference
- [FlexMatch rule set reference](https://docs.aws.amazon.com/gamelift/latest/flexmatchguide/match-rulesets.html) —
  the full rule-set schema (rule types, expansions, team definitions) for authoring your own matchmaking
- [GameLift Server SDK (Go/C++/C#/Unreal/Unity)](https://github.com/orgs/amazon-gamelift/repositories) —
  the official Amazon GameLift SDK repositories, with the server integration library for each language/engine
- This workshop's game source — everything you deployed today is readable,
  hackable and yours to extend

Thanks for racing with us! 🏁
