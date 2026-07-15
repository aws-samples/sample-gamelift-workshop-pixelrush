---
title: "Deploy the Game Backend"
weight: 24
---

## What you're deploying

Two CDK stacks — the *web* half of the game, no GameLift yet:

- **PixelRushBackendStack** — API Gateway + Lambda + DynamoDB (login, garage,
  shop, leaderboard, matchmaking API) and a WebSocket API for notifications
- **PixelRushFrontendStack** — the Phaser web client on CloudFront + private S3

## 1. Deploy the backend

From the `infra/` directory, deploy the backend first — the frontend needs its
WebSocket URL before it can be built:

```bash
npx cdk deploy PixelRushBackendStack --require-approval never
```

Takes ~4 minutes. Note the two outputs at the end:

```
PixelRushBackendStack.ApiUrl      = https://xxxx.execute-api.us-east-1.amazonaws.com
PixelRushBackendStack.WsNotifyUrl = wss://yyyy.execute-api.us-east-1.amazonaws.com/prod
```

:::alert{type=success}
Save **ApiUrl** somewhere — you'll paste it into the game in Module 6 to prove
your deployment works end to end.
:::

## 2. Build the frontend, then deploy it

Write the WebSocket URL into the frontend config, build the site, then deploy
the frontend stack (which uploads the built site to CloudFront):

```bash
echo "{ \"wsNotifyUrl\": \"<PASTE-WsNotifyUrl-HERE>\" }" > ../frontend/public/config.json
(cd ../frontend && npm run build)
npx cdk deploy PixelRushFrontendStack --require-approval never
```

Outputs the site URL:

```
PixelRushFrontendStack.SiteUrl = https://zzzz.cloudfront.net
```

:::alert{type=info}
Building before deploying is why we split this into two steps: the frontend
stack publishes `frontend/dist`, so that folder must exist first. (Deploy the
frontend before building and CDK warns `frontend/dist not found` and uploads
an empty site.)
:::

:::alert{type=warning}
CloudFront is a global CDN — a new distribution takes **5–10 minutes** to fully
deploy to every edge location. Right after the deploy returns, opening
**SiteUrl** may briefly show an error or an old cached page. If so, wait a few
minutes and refresh (a hard refresh, ⌘/Ctrl-Shift-R, helps).
:::

## 3. Checkpoint ★

Open **SiteUrl** in your browser:

1. On the login screen, leave the server set to **☁️ AWS ARENA** (the default).
   On *your own* SiteUrl this means "this site's own backend" — the one you
   just deployed. (The **🔧 MY SERVER** option is for pointing *someone else's*
   frontend at your backend; you'll use it in Module 6, not here.)
2. Enter any racer name + the workshop password `gamelift` → **START ENGINE**
3. You land in the lobby as a level-1 rookie with a random car and coin balance
4. Browse **GARAGE** and **SHOP** — buy a car if you have the coins!

:::alert{type=info}
Try clicking **RACE → a track → 2P**: matchmaking will spin forever. That's
expected — there is no game server anywhere yet. Fixing that is the rest of
this workshop.
:::
