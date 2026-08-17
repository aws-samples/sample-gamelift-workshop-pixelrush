---
title: "Path A: At an AWS Event"
weight: 21
---

{{% notice info %}}
Follow this page only if you're at an AWS-hosted event with a Workshop Studio
access code. Otherwise skip to **Path B: Own Account**.
{{% /notice %}}

## 1. Join the event

1. Open [Workshop Studio](https://catalog.workshops.aws/join) — AWS's official
   platform for hosting hands-on workshops in temporary event accounts — and
   enter the **access code** provided by your instructor.
2. Accept the terms and click **Join event**. You now have a temporary AWS
   account — nothing you do today costs you anything.

## 2. Open your development environment

The event account comes pre-provisioned with a **cloud development machine**
(VS Code in the browser). Both its address and its password are on the event
page — every participant stack gets a different password.

1. On the event page, find **Event Outputs** and open **CodeServerURL** (a
   `cloudfront.net` address).
2. Sign in with the value of **CodeServerPassword** from the same Event Outputs.
   Don't share it — this machine can deploy in your temporary account.
3. VS Code opens with the workshop repository already cloned at
   `~/gamelift-workshop`.

Open a terminal (`Menu → Terminal → New Terminal`) and verify:

```bash
node --version && go version && cdk --version && aws sts get-caller-identity
```

All four commands should print versions / your temporary account ID.

{{% notice tip %}}
The code-server origin is reachable only through CloudFront and also requires
your per-stack password. If login fails, re-copy **CodeServerPassword** from
your own Event Outputs — it differs for every participant.
{{% /notice %}}

{{% notice info %}}
If you take the optional **Appendix A: GameLift Anywhere**, "your machine" there
means **this cloud development machine**. Its game port is closed by default,
and the appendix shows how to temporarily allow TCP/UDP 1935 only from your
current public IPv4 address, then remove those rules after the checkpoint. The
main workshop path never opens that port.
{{% /notice %}}

Continue to **2.3 Bootstrap** (skip Path B).
