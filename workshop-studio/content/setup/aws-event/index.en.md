---
title: "Path A: At an AWS Event"
weight: 21
---

:::alert{type=info}
Follow this page only if you're at an AWS-hosted event with a Workshop Studio
access code. Otherwise skip to **Path B: Own Account**.
:::

## 1. Join the event

1. Open [Workshop Studio](https://catalog.workshops.aws/join) and enter the
   **access code** provided by your instructor.
2. Accept the terms and click **Join event**. You now have a temporary AWS
   account — nothing you do today costs you anything.

## 2. Open your development environment

The event account comes pre-provisioned with a **cloud development machine**
(VS Code in the browser) that already has every tool installed:

1. On the event page, find the **Event Outputs** section.
2. Open the **CodeServerURL** link (a `cloudfront.net` address) and enter
   the **CodeServerPassword**.
3. You'll see VS Code in your browser with the workshop repository already
   cloned at `~/gamelift-workshop`.

Open a terminal inside it (`Menu → Terminal → New Terminal`) and verify:

```bash
node --version && go version && cdk --version && aws sts get-caller-identity
```

All four commands should print versions / your temporary account ID.

:::alert{type=success}
In this path, "your machine" for the GameLift Anywhere module (Module 3) means
**this cloud development machine** — its security group already allows the game
port, so your browser can connect to game sessions running on it.
:::

Continue to **2.3 Bootstrap** (skip Path B).
