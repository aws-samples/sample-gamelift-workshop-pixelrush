---
title: "3. Managed Fleet"
chapter: true
weight: 30
---
*Duration: ~30 minutes (including ~15 min fleet activation — used for reading)*

Your first hosted game session, and it goes straight to production-style
hosting: upload your server build and let Amazon GameLift Servers run it on
managed EC2 instances — with a GameLift-issued TLS certificate — then **race
another player** for real.

You kick off the deploy first, then spend the activation wait reading what is
being built: the fleet configuration, the Server SDK code GameLift is about to
run, and how the queue chooses a location.

To keep the focus on the fleet, this module places players into sessions
**directly, with no matchmaking rules** — whoever picks a track shares a session
with whoever picks it next. Rule-based matchmaking is Module 4.
