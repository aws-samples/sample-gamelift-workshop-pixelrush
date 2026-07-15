---
title: "Next Steps"
weight: 82
---

## Keep going

| Topic | Why it's the natural next step |
|---|---|
| **Appendix: Multi-region fleets** (this workshop) | Add Tokyo/Singapore locations and latency-based placement — 20 minutes, one CDK edit |
| **Match backfill** | Fill empty slots in running sessions (we deliberately disabled it — races don't take late joiners, but battle royales do) |
| **FleetIQ / Spot** | Cut fleet cost up to 70% with Spot instances managed for viability |
| **Containers fleets** | Package the server as a container image instead of a build |
| **Player identity** | Replace the workshop password with real auth — see the [Custom Game Backend guidance](https://github.com/aws-solutions-library-samples/guidance-for-custom-game-backend-hosting-on-aws) (Steam/Apple/Google sign-in, JWT) |
| **Session metrics & autoscaling** | Target-tracking on `PercentAvailableGameSessions` |

## Reference material

- [Amazon GameLift Servers documentation](https://docs.aws.amazon.com/gamelift/)
- [FlexMatch rule set reference](https://docs.aws.amazon.com/gamelift/latest/flexmatchguide/match-rulesets.html)
- [GameLift Server SDK (Go/C++/C#/Unreal/Unity)](https://github.com/orgs/amazon-gamelift/repositories)
- This workshop's game source — everything you deployed today is readable,
  hackable and yours to extend

Thanks for racing with us! 🏁
