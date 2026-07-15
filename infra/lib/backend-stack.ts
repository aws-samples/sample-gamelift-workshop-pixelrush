import * as cdk from 'aws-cdk-lib';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import * as apigwv2 from 'aws-cdk-lib/aws-apigatewayv2';
import { HttpLambdaIntegration, WebSocketLambdaIntegration } from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as snsSubs from 'aws-cdk-lib/aws-sns-subscriptions';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as cr from 'aws-cdk-lib/custom-resources';
import { Construct } from 'constructs';
import * as path from 'path';
import * as fs from 'fs';

export interface BackendStackProps extends cdk.StackProps {
  resultsSecret: string;
  /** Secret CloudFront adds as x-origin-verify; Lambdas reject other callers. */
  originVerifySecret: string;
  /**
   * How the matchmaking Lambda gets players onto a server:
   *  - 'flexmatch': StartMatchmaking against a config (Module 3 Anywhere, Module 5 EC2)
   *  - 'open':      direct CreateGameSession/CreatePlayerSession, no rules (Module 4)
   */
  placementMode: 'flexmatch' | 'open';
  /** FlexMatch config name prefix (placementMode 'flexmatch'); + size picks the config. */
  matchmakingConfigPrefix: string;
  /** Fleet name to place sessions into directly (placementMode 'open'). */
  openPlacementFleet: string;
  /** All regions the managed fleet spans (deploy region + extras). Used to
   *  backfill LatencyInMs when the client's probe is missing/failed. */
  fleetRegions: string[];
}

export class BackendStack extends cdk.Stack {
  readonly httpApi: apigwv2.HttpApi;
  readonly mainTable: dynamodb.Table;
  readonly leaderboardTable: dynamodb.Table;
  readonly flexMatchTopic: sns.Topic;

  constructor(scope: Construct, id: string, props: BackendStackProps) {
    super(scope, id, props);

    // ---- Tables ----
    this.mainTable = new dynamodb.Table(this, 'MainTable', {
      tableName: 'PixelRushMain',
      partitionKey: { name: 'pk', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'sk', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      timeToLiveAttribute: 'ttl',
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    this.leaderboardTable = new dynamodb.Table(this, 'LeaderboardTable', {
      tableName: 'PixelRushLeaderboard',
      partitionKey: { name: 'trackId', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'playerId', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });
    this.leaderboardTable.addGlobalSecondaryIndex({
      indexName: 'ByTime',
      partitionKey: { name: 'trackId', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'bestTimeMs', type: dynamodb.AttributeType.NUMBER },
    });

    // ---- Seed data (idempotent BatchWrite on every deploy) ----
    this.seedData();

    // ---- Lambdas ----
    const backendDir = path.join(__dirname, '../../backend/src');
    const fn = (name: string, entry: string, extraEnv: Record<string, string> = {}) =>
      new NodejsFunction(this, name, {
        entry: path.join(backendDir, entry),
        depsLockFilePath: path.join(backendDir, '../package-lock.json'),
        runtime: lambda.Runtime.NODEJS_20_X,
        timeout: cdk.Duration.seconds(10),
        memorySize: 256,
        environment: {
          MAIN_TABLE: this.mainTable.tableName,
          LEADERBOARD_TABLE: this.leaderboardTable.tableName,
          ORIGIN_VERIFY_SECRET: props.originVerifySecret,
          ...extraEnv,
        },
      });

    // Workshop-wide login password; override with -c loginPassword=...
    // WORKSHOP-ONLY default. Production should source this from Secrets Manager
    // or SSM Parameter Store (SecureString) with rotation, not a static value.
    const loginFn = fn('LoginFn', 'login.ts', {
      LOGIN_PASSWORD: this.node.tryGetContext('loginPassword') ?? 'gamelift',
    });
    const profileFn = fn('ProfileFn', 'profile.ts');
    const shopFn = fn('ShopFn', 'shop.ts');
    const tracksFn = fn('TracksFn', 'tracks.ts');
    const leaderboardFn = fn('LeaderboardFn', 'leaderboard.ts');
    const resultsFn = fn('ReportResultsFn', 'report-results.ts', { RESULTS_SECRET: props.resultsSecret });
    const raceRewardFn = fn('RaceRewardFn', 'race-reward.ts');

    for (const f of [loginFn, profileFn, shopFn, tracksFn, resultsFn, raceRewardFn]) {
      this.mainTable.grantReadWriteData(f);
    }
    this.leaderboardTable.grantReadData(leaderboardFn);
    this.leaderboardTable.grantReadWriteData(resultsFn);

    // ---- HTTP API ----
    this.httpApi = new apigwv2.HttpApi(this, 'HttpApi', {
      apiName: 'PixelRushApi',
      corsPreflight: {
        allowOrigins: ['*'],
        allowMethods: [apigwv2.CorsHttpMethod.GET, apigwv2.CorsHttpMethod.POST, apigwv2.CorsHttpMethod.OPTIONS],
        // x-origin-verify lets the unified frontend (served from the official
        // CloudFront) call a STUDENT's execute-api directly cross-origin
        allowHeaders: ['Content-Type', 'x-origin-verify'],
      },
    });
    // All player-facing routes live under /api so a single CloudFront behavior
    // (/api/*) can proxy them. /internal/results is called by the game server
    // directly (protected by its own shared secret), not through CloudFront.
    const routes: [string, apigwv2.HttpMethod, NodejsFunction][] = [
      ['/api/login', apigwv2.HttpMethod.POST, loginFn],
      ['/api/profile', apigwv2.HttpMethod.GET, profileFn],
      ['/api/garage', apigwv2.HttpMethod.GET, profileFn],
      ['/api/garage/select', apigwv2.HttpMethod.POST, profileFn],
      ['/api/shop', apigwv2.HttpMethod.GET, shopFn],
      ['/api/shop/buy', apigwv2.HttpMethod.POST, shopFn],
      ['/api/tracks', apigwv2.HttpMethod.GET, tracksFn],
      ['/api/leaderboard', apigwv2.HttpMethod.GET, leaderboardFn],
      ['/api/race-reward', apigwv2.HttpMethod.POST, raceRewardFn],
      ['/internal/results', apigwv2.HttpMethod.POST, resultsFn],
    ];
    for (const [p, method, handler] of routes) {
      this.httpApi.addRoutes({
        path: p,
        methods: [method],
        integration: new HttpLambdaIntegration(`${method}${p.replace(/\//g, '-')}`, handler),
      });
    }

    // ---- FlexMatch events topic (GameLift service principal publishes) ----
    this.flexMatchTopic = new sns.Topic(this, 'FlexMatchEventsTopic');
    this.flexMatchTopic.addToResourcePolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      principals: [new iam.ServicePrincipal('gamelift.amazonaws.com')],
      actions: ['sns:Publish'],
      resources: [this.flexMatchTopic.topicArn],
    }));

    // ---- WebSocket API: matchmaking notifications + world chat ----
    const wsConnectFn = fn('WsConnectFn', 'ws-connect.ts');
    this.mainTable.grantReadWriteData(wsConnectFn);
    const wsApi = new apigwv2.WebSocketApi(this, 'NotifyWsApi', {
      apiName: 'PixelRushNotify',
      connectRouteOptions: { integration: new WebSocketLambdaIntegration('WsConnect', wsConnectFn) },
      disconnectRouteOptions: { integration: new WebSocketLambdaIntegration('WsDisconnect', wsConnectFn) },
      defaultRouteOptions: { integration: new WebSocketLambdaIntegration('WsDefault', wsConnectFn) },
    });
    const wsStage = new apigwv2.WebSocketStage(this, 'NotifyWsStage', {
      webSocketApi: wsApi, stageName: 'prod', autoDeploy: true,
    });

    // World-chat broadcasters: any Lambda that emits system chat messages
    // needs the WS management endpoint + PostToConnection rights.
    const wsEndpoint = `https://${wsApi.apiId}.execute-api.${this.region}.amazonaws.com/${wsStage.stageName}`;
    for (const f of [wsConnectFn, shopFn, resultsFn]) {
      f.addEnvironment('WS_API_ENDPOINT', wsEndpoint);
      wsStage.grantManagementApiAccess(f);
    }

    // ---- FlexMatch event processor: SNS -> push to WS connection ----
    const eventsFn = fn('ProcessMatchEventsFn', 'process-matchmaking-events.ts', {
      WS_API_ENDPOINT: wsEndpoint,
    });
    this.mainTable.grantReadWriteData(eventsFn);
    this.flexMatchTopic.addSubscription(new snsSubs.LambdaSubscription(eventsFn));
    wsStage.grantManagementApiAccess(eventsFn);

    // ---- Matchmaking request Lambda ----
    const matchmakingFn = fn('RequestMatchmakingFn', 'request-matchmaking.ts', {
      // Module 4 places directly ('open'); Module 3/5 use FlexMatch. Prefix +
      // match size (1/2/3/4) selects the FlexMatch config.
      PLACEMENT_MODE: props.placementMode,
      MATCHMAKING_CONFIG_PREFIX: props.matchmakingConfigPrefix,
      OPEN_PLACEMENT_FLEET: props.openPlacementFleet,
      FLEET_REGIONS: props.fleetRegions.join(','),
      WS_API_ENDPOINT: wsEndpoint, // debug traces to the world channel
    });
    this.mainTable.grantReadWriteData(matchmakingFn);
    wsStage.grantManagementApiAccess(matchmakingFn);
    matchmakingFn.addToRolePolicy(new iam.PolicyStatement({
      actions: [
        // FlexMatch path (Module 3 Anywhere, Module 5 EC2)
        'gamelift:StartMatchmaking', 'gamelift:DescribeMatchmaking', 'gamelift:StopMatchmaking',
        // Open-placement path (Module 4): find the fleet, find or create a
        // session, seat the player
        'gamelift:DescribeFleetAttributes',
        'gamelift:SearchGameSessions', 'gamelift:DescribeGameSessions',
        'gamelift:CreateGameSession', 'gamelift:CreatePlayerSession',
      ],
      resources: ['*'], // config/fleet ARNs are cross-stack; '*' is fine for a workshop
    }));
    this.httpApi.addRoutes({
      path: '/api/matchmaking/request',
      methods: [apigwv2.HttpMethod.POST],
      integration: new HttpLambdaIntegration('PostMatchmaking', matchmakingFn),
    });
    this.httpApi.addRoutes({
      path: '/api/matchmaking/status',
      methods: [apigwv2.HttpMethod.GET],
      integration: new HttpLambdaIntegration('GetMatchStatus', matchmakingFn),
    });

    new cdk.CfnOutput(this, 'ApiUrl', { value: this.httpApi.apiEndpoint });
    // Arena discovery endpoint: the unified frontend needs only the ApiUrl —
    // it learns the notify-WS URL (and arena name) from here.
    const infoFn = fn('InfoFn', 'info.ts', {
      ARENA_NAME: this.node.tryGetContext('arenaName') ?? 'my-arena',
      WS_NOTIFY_URL: wsStage.url,
      FLEET_REGIONS: props.fleetRegions.join(','),
    });
    this.httpApi.addRoutes({
      path: '/api/info',
      methods: [apigwv2.HttpMethod.GET],
      integration: new HttpLambdaIntegration('GetInfo', infoFn),
    });

    new cdk.CfnOutput(this, 'WsNotifyUrl', { value: wsStage.url });
  }

  /** Loads infra/seed/*.json into the main table via a custom resource. */
  private seedData(): void {
    const seedDir = path.join(__dirname, '../seed');
    const players = JSON.parse(fs.readFileSync(path.join(seedDir, 'players.json'), 'utf8'));
    const cars = JSON.parse(fs.readFileSync(path.join(seedDir, 'cars.json'), 'utf8'));
    const tracks = JSON.parse(fs.readFileSync(path.join(seedDir, 'tracks.json'), 'utf8'));

    const items = [
      ...players.map((p: Record<string, unknown>) => ({
        pk: `TEMPLATE#${p.templateId}`, sk: 'PROFILE', ...p,
      })),
      ...cars.map((c: Record<string, unknown>) => ({
        pk: 'CATALOG#CARS', sk: `CAR#${c.carId}`, ...c,
      })),
      ...tracks.map((t: Record<string, unknown>) => ({
        pk: 'CATALOG#TRACKS', sk: `TRACK#${t.trackId}`, ...t,
      })),
    ];

    // BatchWrite in chunks of 25 (DynamoDB limit). Runs on create AND update
    // so seed edits ship with a redeploy.
    const chunks: (typeof items)[] = [];
    for (let i = 0; i < items.length; i += 25) chunks.push(items.slice(i, i + 25));

    chunks.forEach((chunk, i) => {
      const call: cr.AwsSdkCall = {
        service: 'DynamoDB',
        action: 'batchWriteItem',
        parameters: {
          RequestItems: {
            [this.mainTable.tableName]: chunk.map((item) => ({
              PutRequest: { Item: marshall(item) },
            })),
          },
        },
        physicalResourceId: cr.PhysicalResourceId.of(`seed-${i}-${hash(JSON.stringify(chunk))}`),
      };
      new cr.AwsCustomResource(this, `Seed${i}`, {
        onCreate: call,
        onUpdate: call,
        policy: cr.AwsCustomResourcePolicy.fromSdkCalls({ resources: [this.mainTable.tableArn] }),
      });
    });
  }
}

/** Minimal marshaller for seed items (strings, numbers, nulls, string arrays). */
function marshall(obj: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v === null || v === undefined) out[k] = { NULL: true };
    else if (typeof v === 'number') out[k] = { N: String(v) };
    else if (typeof v === 'string') out[k] = { S: v };
    else if (Array.isArray(v)) out[k] = { L: v.map((x) => (typeof x === 'number' ? { N: String(x) } : { S: String(x) })) };
    else out[k] = { S: JSON.stringify(v) };
  }
  return out;
}

function hash(s: string): string {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  return Math.abs(h).toString(36);
}
