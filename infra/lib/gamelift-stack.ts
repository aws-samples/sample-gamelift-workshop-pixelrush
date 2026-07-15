import * as cdk from 'aws-cdk-lib';
import * as gamelift from 'aws-cdk-lib/aws-gamelift';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as s3assets from 'aws-cdk-lib/aws-s3-assets';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';
import * as path from 'path';
import * as fs from 'fs';

export interface GameLiftStackProps extends cdk.StackProps {
  /** SNS topic FlexMatch publishes events to (from BackendStack). */
  flexMatchTopic: sns.ITopic;
  /** Deploy the managed EC2 fleet too (slow, ~15 min). Off for the Anywhere-only phase. */
  deployEc2Fleet: boolean;
  /**
   * When the EC2 fleet is deployed, whether to also create FlexMatch
   * matchmaking configs for it. Module 4 ("open" placement) leaves this off —
   * the backend places players into sessions directly with no rules. Module 5
   * turns it on to introduce rule-based matchmaking. Ignored unless
   * deployEc2Fleet is true.
   */
  ec2Matchmaking: boolean;
  /** Backend API endpoint + results secret passed to server processes as launch params. */
  apiEndpoint: string;
  resultsSecret: string;
}

/**
 * GameLift resources: Anywhere fleet (local dev) + optional managed EC2 fleet,
 * a queue per fleet, and a FlexMatch config per queue. Modeled on the guidance
 * repo's amazon_gamelift_integration-gamelift-resources.ts, simplified to a
 * single region and no backfill.
 */
export class GameLiftStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: GameLiftStackProps) {
    super(scope, id, props);

    // Extra managed-fleet regions beyond the deploy region (multi-region
    // appendix). e.g. `-c extraRegions=ap-northeast-1,ap-southeast-1`.
    const extraRegions = (this.node.tryGetContext('extraRegions') as string | undefined)
      ?.split(',').map((r) => r.trim()).filter(Boolean) ?? [];

    // One ruleset per match size. Size 1 = Quick Start (matches instantly,
    // server fills the grid with NPC drivers); 2/4/8 = multiplayer sizes.
    const ruleSets = new Map<number, gamelift.CfnMatchmakingRuleSet>();
    for (const size of [1, 2, 3, 4]) {
      ruleSets.set(size, new gamelift.CfnMatchmakingRuleSet(this, `RaceRuleSet${size}`, {
        name: `PixelRushRaceRules${size}`,
        ruleSetBody: JSON.stringify(this.ruleSetBody(size)),
      }));
    }

    // ---- Anywhere fleet (laptop/dev) ----
    const anywhereLocation = new gamelift.CfnLocation(this, 'AnywhereLocation', {
      locationName: 'custom-pixelrush-dev',
    });
    const anywhereFleet = new gamelift.CfnFleet(this, 'AnywhereFleet', {
      name: 'PixelRushAnywhereFleet',
      computeType: 'ANYWHERE',
      locations: [{ location: anywhereLocation.locationName }],
    });
    anywhereFleet.addDependency(anywhereLocation);

    const anywhereQueue = new gamelift.CfnGameSessionQueue(this, 'AnywhereQueue', {
      name: 'PixelRushAnywhereQueue',
      destinations: [{ destinationArn: cdk.Arn.format({ service: 'gamelift', resource: 'fleet', resourceName: anywhereFleet.attrFleetId, region: this.region, account: this.account }, this) }],
      timeoutInSeconds: 60,
    });

    // One matchmaking config per (fleet flavor, match size).
    for (const [size, rs] of ruleSets) {
      this.matchmakingConfig(`Anywhere${size}`, anywhereQueue, rs, props.flexMatchTopic);
    }

    // ---- Managed EC2 fleet (gated behind -c stage=ec2) ----
    if (props.deployEc2Fleet) {
      const buildDir = path.join(__dirname, '../../server/dist/linux');
      if (!fs.existsSync(path.join(buildDir, 'pixelrush-server'))) {
        throw new Error(`server linux build missing: run scripts/build-server-linux.sh first (${buildDir})`);
      }
      const buildAsset = new s3assets.Asset(this, 'ServerBuildAsset', {
        path: buildDir,
      });

      const buildRole = new iam.Role(this, 'BuildAccessRole', {
        assumedBy: new iam.ServicePrincipal('gamelift.amazonaws.com'),
      });
      buildAsset.grantRead(buildRole);

      const build = new gamelift.CfnBuild(this, 'ServerBuild', {
        name: 'PixelRushServer',
        operatingSystem: 'AMAZON_LINUX_2023',
        serverSdkVersion: '5.5.0', // must match the Go server SDK version in server/go.mod
        storageLocation: {
          bucket: buildAsset.s3BucketName,
          key: buildAsset.s3ObjectKey,
          roleArn: buildRole.roleArn,
        },
        version: buildAsset.assetHash.slice(0, 12),
      });
      // GameLift validates S3 access at create time; wait for the role's
      // inline policy (grantRead) to exist or creation 400s.
      build.node.addDependency(buildRole.node.findChild('DefaultPolicy'));

      const launchParams = (port: number) =>
        `--port ${port} --api-url ${props.apiEndpoint} --results-secret ${props.resultsSecret} --log /local/game/logs/server-${port}.log`;

      const ec2Fleet = new gamelift.CfnFleet(this, 'Ec2Fleet', {
        name: 'PixelRushFleet',
        buildId: build.attrBuildId,
        ec2InstanceType: 'c5.large',
        fleetType: 'ON_DEMAND',
        // TLS cert so browsers on the HTTPS CloudFront page can use wss://
        certificateConfiguration: { certificateType: 'GENERATED' },
        // Browser WebSocket = TCP; the WebRTC unreliable DataChannel = UDP on
        // the same port numbers. GameLift forbids ports <=1025. Egress-
        // filtered user networks (measured): 7777/1935/9443/8080 blocked;
        // 8443 (alt-HTTPS) and 2083 (Cloudflare HTTPS) pass.
        ec2InboundPermissions: [
          { fromPort: 8443, toPort: 8443, ipRange: '0.0.0.0/0', protocol: 'TCP' },
          { fromPort: 2083, toPort: 2083, ipRange: '0.0.0.0/0', protocol: 'TCP' },
          { fromPort: 8443, toPort: 8443, ipRange: '0.0.0.0/0', protocol: 'UDP' },
          { fromPort: 2083, toPort: 2083, ipRange: '0.0.0.0/0', protocol: 'UDP' },
        ],
        // Single region by default (fast, cheap). The optional multi-region
        // appendix adds locations via `-c extraRegions=ap-northeast-1,ap-southeast-1`;
        // the queue then places each match in the lowest-latency location for
        // its players (clients report LatencyInMs).
        locations: [
          { location: this.region, locationCapacity: { desiredEc2Instances: 1, minSize: 1, maxSize: 2 } },
          ...extraRegions.map((r) => ({
            location: r, locationCapacity: { desiredEc2Instances: 1, minSize: 1, maxSize: 2 },
          })),
        ],
        runtimeConfiguration: {
          gameSessionActivationTimeoutSeconds: 300,
          serverProcesses: [
            { launchPath: '/local/game/pixelrush-server', parameters: launchParams(8443), concurrentExecutions: 1 },
            { launchPath: '/local/game/pixelrush-server', parameters: launchParams(2083), concurrentExecutions: 1 },
          ],
        },
      });

      const ec2Queue = new gamelift.CfnGameSessionQueue(this, 'Ec2Queue', {
        name: 'PixelRushQueue',
        destinations: [{ destinationArn: cdk.Arn.format({ service: 'gamelift', resource: 'fleet', resourceName: ec2Fleet.attrFleetId, region: this.region, account: this.account }, this) }],
        timeoutInSeconds: 60,
        // Latency-first placement: put each match in the location with the
        // lowest AVERAGE latency across the matched players (from the client's
        // LatencyInMs on StartMatchmaking, backfilled per region in the
        // matchmaking Lambda). Without this the queue falls back to destination
        // order and always lands in the deploy region — the reason a Singapore
        // + Korea match was placed in us-east-1 despite both being closer to
        // ap-southeast-1. Only meaningful with multi-region locations.
        // LATENCY first; LOCATION requires an explicit locationOrder (deploy
        // region preferred, then extras) as the latency tie-breaker; then
        // DESTINATION order last.
        priorityConfiguration: {
          priorityOrder: ['LATENCY', 'LOCATION', 'DESTINATION'],
          locationOrder: [this.region, ...extraRegions],
        },
        // Guardrail: reject placements where any player would exceed the cap.
        // Start strict, then relax so nobody waits forever on a bad network.
        playerLatencyPolicies: [
          { maximumIndividualPlayerLatencyMilliseconds: 100, policyDurationSeconds: 30 },
          { maximumIndividualPlayerLatencyMilliseconds: 200 },
        ],
      });

      new cdk.CfnOutput(this, 'Ec2FleetId', { value: ec2Fleet.attrFleetId });
      new cdk.CfnOutput(this, 'Ec2QueueName', { value: ec2Queue.name! });

      // Module 5 only: rule-based matchmaking on top of the same fleet/queue.
      // Module 4 places players directly (no configs), so the backend runs in
      // "open placement" mode against the queue above.
      if (props.ec2Matchmaking) {
        for (const [size, rs] of ruleSets) {
          this.matchmakingConfig(`Ec2${size}`, ec2Queue, rs, props.flexMatchTopic);
        }
        new cdk.CfnOutput(this, 'Ec2MatchmakingConfig', { value: 'PixelRushMatchEc2{1|2|3|4}' });
      }
    }

    new cdk.CfnOutput(this, 'AnywhereFleetId', { value: anywhereFleet.attrFleetId });
    new cdk.CfnOutput(this, 'AnywhereLocationName', { value: anywhereLocation.locationName });
    new cdk.CfnOutput(this, 'AnywhereMatchmakingConfig', { value: 'PixelRushMatchAnywhere{1|2|3|4}' });
  }

  private matchmakingConfig(
    suffix: string,
    queue: gamelift.CfnGameSessionQueue,
    ruleSet: gamelift.CfnMatchmakingRuleSet,
    topic: sns.ITopic,
  ): gamelift.CfnMatchmakingConfiguration {
    const config = new gamelift.CfnMatchmakingConfiguration(this, `Matchmaking${suffix}`, {
      name: `PixelRushMatch${suffix}`,
      acceptanceRequired: false,
      requestTimeoutSeconds: 90, // must exceed the 45s minPlayers expansion

      ruleSetName: ruleSet.name,
      gameSessionQueueArns: [queue.attrArn],
      backfillMode: 'MANUAL', // no backfill by design: races don't take late joiners
      flexMatchMode: 'WITH_QUEUE',
      notificationTarget: topic.topicArn,
      description: `Pixel Rush 1-8 player race matchmaking (${suffix})`,
    });
    config.addDependency(ruleSet);
    return config;
  }

  /**
   * Exactly `size` racers on one team (size 1 = Quick Start vs NPCs — matches
   * immediately); similar level (relaxed after 10s); same chosen track.
   * Multiplayer sizes relax minPlayers after 45s so nobody waits forever —
   * the server tops the grid up with NPC drivers anyway.
   */
  private ruleSetBody(size: number): object {
    const body: Record<string, unknown> = {
      name: `PixelRushRaceRules${size}`,
      ruleLanguageVersion: '1.0',
      playerAttributes: [
        { name: 'level', type: 'number', default: 1 },
        { name: 'trackId', type: 'string', default: 'track-1' },
      ],
      teams: [{ name: 'racers', minPlayers: size, maxPlayers: size }],
      rules: size === 1 ? [] : [
        {
          name: 'SimilarLevel',
          type: 'distance',
          measurements: ['teams[racers].players.attributes[level]'],
          referenceValue: 'avg(teams[racers].players.attributes[level])',
          maxDistance: 3,
        },
        {
          name: 'SameTrack',
          type: 'comparison',
          operation: '=',
          measurements: ['flatten(teams[*].players.attributes[trackId])'],
        },
      ],
    };
    if (size > 1) {
      body.expansions = [
        {
          target: 'rules[SimilarLevel].maxDistance',
          steps: [{ waitTimeSeconds: 10, value: 100 }],
        },
        {
          target: 'teams[racers].minPlayers',
          steps: [{ waitTimeSeconds: 45, value: 1 }],
        },
      ];
    }
    return body;
  }
}
