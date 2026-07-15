---
title: "Hands-on Amazon GameLift"
weight: 1
---

### Deploy Your First Multiplayer Game


Welcome! In roughly **2 hours** you will deploy and operate a complete multiplayer
online game on AWS — a retro pixel-art racing game called **Pixel Rush** — and use it
to learn the core capabilities of **Amazon GameLift Servers**:

- What a dedicated **game server** is and why real-time multiplayer needs one
- The GameLift **Server SDK lifecycle** that every hosted game implements
- **GameLift Anywhere** — register your own machine as fleet compute for fast iteration
- **Managed EC2 fleets** — production hosting with builds, runtime configs and queues
- **FlexMatch** — rule-based matchmaking, tickets and event notifications


![Pixel Rush in action](/static/images/gl-ws-game.png)
At the end you will race against other participants on a shared arena, with every
piece of the pipeline — matchmaking, session placement, realtime state — running on
infrastructure **you deployed yourself**.

```
                    ┌─────────────────┐
                    │  API Gateway +  │
          ┌─ REST ──►    Lambda +     │   Login / Garage /
          │         │    DynamoDB     │   Leaderboard
          │         └─────────────────┘
          │
          │         ┌─────────────────┐
┌─────────┴───┐     │  API Gateway    │
│  Browser    │     │  WebSocket API  │   Match Result
│ (Phaser 3)  ├─ WS ┼─────────────────┤   Notifications
│             │     │      │Lambda    │
│Web Client   │     └──────┼──────────┘
│             │            ▲
└─────────┬───┘            │
          │         ┌──────┼──────────┐
          │         │      │          │
          └─ WS ────► GameLift Go Server  Real-time Combat
                    │                 │   @ 20Hz
                    └─────────────────┘


┌────────────┐      ┌───────┐      ┌──────────┐
│ FlexMatch  │ ───► │  SNS  │ ───► │  Lambda  │ ───► Push to waiting players
└────────────┘      └───────┘      └──────────┘
```

:::alert{type=info}
The game code (Go server, TypeScript backend, Phaser frontend) is provided and ready
to deploy — **you will read key parts of it, but you never need to modify code**.
Every step is a copy-paste command or an AWS console observation.
:::

## Who this is for

Developers, solutions architects, and technical game builders who want a
hands-on introduction to hosting real-time multiplayer games on AWS. You do
**not** need prior game-development or GameLift experience — the game is built
for you.

## Prerequisites

- Basic familiarity with the **AWS console** and a **command line / terminal**
- Comfort reading **TypeScript / Go** at a glance (you read code, never write it)
- One of:
  - **AWS-hosted event**: nothing to install — a browser IDE is provided
  - **Your own AWS account**: an account with admin access, plus Node 20+,
    Go 1.26.2+, AWS CLI v2, and AWS CDK v2 (see *2. Setup → Own Account*)

## Cost

Running this workshop in your own account costs roughly **$0.20–0.50/hour**
(mainly one or two `c5.large` GameLift instances), well under **$1** for a
2-hour sitting **if you complete the cleanup module**. See
[Amazon GameLift pricing](https://aws.amazon.com/gamelift/pricing/) and
[EC2 pricing](https://aws.amazon.com/ec2/pricing/) for details. AWS-hosted
events run in a provided temporary account at no cost to you.

## Agenda

| Module                                                | Duration |
| ----------------------------------------------------- | -------- |
| 1. Introduction — why game servers, GameLift concepts | 10 min   |
| 2. Setup — environment + deploy the game backend      | 20 min   |
| 3. GameLift Anywhere — your machine becomes a fleet   | 25 min   |
| 4. Managed Fleet — production hosting on EC2          | 25 min   |
| 5. FlexMatch — rule-based matchmaking                 | 20 min   |
| 6. Race Day — verify your server, then race everyone  | 15 min   |
| 7. Cleanup                                            | 5 min    |
| 8. Conclusion & next steps                            | 5 min    |
| Appendix. Multi-region fleets (optional challenge)    | 20 min   |

:::alert{type=warning}
The sample code in this workshop is instructional content, not production-ready
software. It demonstrates GameLift integration patterns with deliberate
simplifications (no player identity system, shared workshop passwords, permissive IAM).
:::
