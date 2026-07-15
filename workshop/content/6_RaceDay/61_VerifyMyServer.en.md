---
title: "Verify Your Own Server"
weight: 61
---

## The unified frontend

The Pixel Rush client has a built-in server selector. On the login screen:

- **☁️ AWS ARENA** — the official workshop server (instructor's deployment)
- **🔧 MY SERVER** — *any* Pixel Rush backend, identified by its API URL

Under the hood, MY SERVER calls the target backend's `/api/info` discovery
endpoint, verifies it's a Pixel Rush arena, and wires the whole client
(login, matchmaking, notifications) to that deployment.

## Prove your deployment

This is the graduation exercise — the full pipeline **you** built, verified in
one flow:

![Login screen with MY SERVER selected and your ApiUrl pasted](/images/gl-ws-myserver.png)

1. Open the **official workshop site** (URL provided by your instructor —
   *not* your own SiteUrl this time)
2. On the login screen click **🔧 MY SERVER**
3. Paste **your** `ApiUrl` (saved in Module 2, or re-read it:
   `aws cloudformation describe-stacks --stack-name PixelRushBackendStack --query "Stacks[0].Outputs"`)
4. Enter a racer name + password `gamelift` → **START ENGINE**
5. The lobby subtitle shows you're on your arena. Now **RACE → 2P** (second
   tab again) → the race runs **on your EC2 fleet**

What just happened: a frontend served by *someone else's* CloudFront talked to
**your** API Gateway, matched through **your** FlexMatch, and raced on **your**
GameLift fleet.

## Checkpoint ★

Lobby subtitle shows `🔧` (your arena) and a 2P race completes. Console
double-check: the game session appeared under **your** account's PixelRushFleet.
