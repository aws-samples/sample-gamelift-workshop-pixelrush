#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { BackendStack } from '../lib/backend-stack';
import { FrontendStack } from '../lib/frontend-stack';
import { GameLiftStack } from '../lib/gamelift-stack';
import { DocsStack } from '../lib/docs-stack';

const app = new cdk.App();

// Shared secrets. Override with -c resultsSecret=... -c originVerifySecret=...
// WORKSHOP-ONLY defaults: these static values keep the lab simple and are NOT
// production-grade credentials. In production, source them from AWS Secrets
// Manager or SSM Parameter Store (SecureString) with rotation enabled.
const resultsSecret = app.node.tryGetContext('resultsSecret') ?? 'pixelrush-workshop-secret';
const originVerifySecret = app.node.tryGetContext('originVerifySecret') ?? 'pixelrush-origin-verify';

// Deployment stage drives how players reach a game server:
//   (unset)   Module 3 — Anywhere fleet only
//   ec2       Module 4 — managed EC2 fleet, OPEN placement (no matchmaking rules)
//   ec2-match Module 5 — managed EC2 fleet, FlexMatch rule-based matchmaking
const stage = app.node.tryGetContext('stage');
const deployEc2Fleet = stage === 'ec2' || stage === 'ec2-match';
const ec2Matchmaking = stage === 'ec2-match';

// Module 4 (stage=ec2) places players directly into the EC2 queue with no
// rules; everything else uses FlexMatch (Anywhere configs, or EC2 configs at
// stage=ec2-match).
const placementMode = stage === 'ec2' ? 'open' : 'flexmatch';
const matchmakingConfigPrefix = ec2Matchmaking ? 'PixelRushMatchEc2' : 'PixelRushMatchAnywhere';

// Regions the managed fleet spans: deploy region + optional extras. The
// backend backfills LatencyInMs for these when a client's probe is missing,
// so a latency-aware queue can always find a common region for two players.
const deployRegion = process.env.CDK_DEFAULT_REGION ?? 'us-east-1';
const extraRegions = (app.node.tryGetContext('extraRegions') as string | undefined)
  ?.split(',').map((r) => r.trim()).filter(Boolean) ?? [];
const fleetRegions = [deployRegion, ...extraRegions];

const backend = new BackendStack(app, 'PixelRushBackendStack', {
  resultsSecret,
  originVerifySecret,
  placementMode,
  matchmakingConfigPrefix,
  openPlacementFleet: 'PixelRushFleet', // EC2 fleet name (created at stage=ec2/ec2-match)
  fleetRegions,
  description: 'Pixel Rush workshop: player data, shop, leaderboard, matchmaking APIs',
});

new FrontendStack(app, 'PixelRushFrontendStack', {
  apiEndpoint: backend.httpApi.apiEndpoint,
  originVerifySecret,
  description: 'Pixel Rush workshop: CloudFront (sole public entry) + private S3 + API proxy',
});

new GameLiftStack(app, 'PixelRushGameLiftStack', {
  flexMatchTopic: backend.flexMatchTopic,
  deployEc2Fleet,
  ec2Matchmaking,
  apiEndpoint: backend.httpApi.apiEndpoint,
  resultsSecret,
  description: 'Pixel Rush workshop: GameLift fleets, queues, FlexMatch',
});

new DocsStack(app, 'PixelRushDocsStack', {
  description: 'Pixel Rush workshop: self-hosted tutorial site (Hugo) via CloudFront + private S3',
});
