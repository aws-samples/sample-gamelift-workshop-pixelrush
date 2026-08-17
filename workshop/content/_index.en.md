---
title: "Hands-on Amazon GameLift Servers"
chapter: true
weight: 1
---

## Deploy Your First Multiplayer Game


Welcome! In roughly **2 hours** you will deploy and operate a complete multiplayer
online game on AWS — a retro pixel-art racing game called **Pixel Rush** — and use it
to learn the core capabilities of **Amazon GameLift Servers**:

- What a dedicated **game server** is and why real-time multiplayer needs one
- The GameLift **Server SDK lifecycle** that every hosted game implements
- **Managed EC2 fleets** — production hosting with builds, runtime configs and queues
- **FlexMatch** — rule-based matchmaking, tickets and event notifications
- Optionally, **GameLift Anywhere** — register your own machine as fleet compute
  for fast iteration (Appendix A)


![Top-down pixel-art race: the red player car ahead of two grey rivals, with NPC cars labelled Speedy-Bot, Drift-Bot and Nitro-Bot behind, and a HUD reading POS 1/4](/images/gl-ws-game.png)
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

{{% notice info %}}
The game code (Go server, TypeScript backend, Phaser frontend) is provided and ready
to deploy — **you will read key parts of it, but you never need to modify code**.
Every step is a copy-paste command or an AWS console observation.
{{% /notice %}}

## Who this is for

Developers, solutions architects, and technical game builders who want a
hands-on introduction to hosting real-time multiplayer games on AWS. You do
**not** need prior game-development or GameLift Servers experience — the game is built
for you.

## Prerequisites

- Basic familiarity with the **AWS console** and a **command line / terminal**
- Comfort reading **TypeScript / Go** at a glance (you read code, never write it)
- One of:
  - **AWS-hosted event**: nothing to install — a browser IDE is provided
  - **Your own AWS account**: an account with admin access, plus Node 20+,
    Go 1.26.2+, AWS CLI v2, and AWS CDK v2 (see *2. Setup → Own Account*)

## Cost

Almost all of the cost is the managed fleet: one `c5.large` GameLift instance at
**$0.109/hour** in us-east-1 (the fleet may scale to two). The fleet only exists
for the second half of the workshop, so a 2-hour sitting typically costs around
**$0.15** and stays well under **$1** — **provided you complete the cleanup
module**. Everything else (Lambda, DynamoDB, API Gateway, CloudFront) is
pay-per-request and rounds to zero at workshop traffic. See
[Amazon GameLift Servers pricing](https://aws.amazon.com/gamelift/pricing/) and
[EC2 pricing](https://aws.amazon.com/ec2/pricing/) for details. AWS-hosted
events run in a provided temporary account at no cost to you.

## Agenda

| Module                                                | Duration |
| ----------------------------------------------------- | -------- |
| 1. Introduction — why game servers, GameLift concepts | 10 min   |
| 2. Setup — environment + deploy the game backend      | 20 min   |
| 3. Managed Fleet — production hosting on EC2 + Server SDK | 30 min |
| 4. FlexMatch — rule-based matchmaking                 | 20 min   |
| 5. Race Day — verify your server, then race everyone  | 15 min   |
| 6. Cleanup                                            | 5 min    |
| 7. Conclusion & next steps                            | 5 min    |
| Appendix A. GameLift Anywhere — your machine becomes fleet compute (optional) | 15 min |
| Appendix B. Multi-region fleets (optional challenge)  | 20 min   |

The core path is Modules 1–7 (~1 h 45 min). Both appendices are optional, build
on the fleet you deploy in Module 3, and can be taken in either order — or
skipped entirely.

{{% notice warning %}}
The sample code in this workshop is instructional content, not production-ready
software. It demonstrates GameLift integration patterns with deliberate
simplifications (no player identity system, shared workshop passwords, permissive IAM).
{{% /notice %}}
