import { QueryCommand } from '@aws-sdk/lib-dynamodb';
import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { ddb, LEADERBOARD_TABLE, json, bad, withOriginVerify } from './lib/db.js';

/** GET /leaderboard?trackId=&limit=10 -> best times ascending. */
export const handler = withOriginVerify(async (event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> => {
  const trackId = event.queryStringParameters?.trackId;
  if (!trackId) return bad('trackId required');
  const limit = Math.min(50, Number(event.queryStringParameters?.limit ?? 10));

  const res = await ddb.send(new QueryCommand({
    TableName: LEADERBOARD_TABLE,
    IndexName: 'ByTime',
    KeyConditionExpression: 'trackId = :t',
    ExpressionAttributeValues: { ':t': trackId },
    ScanIndexForward: true, // fastest first
    Limit: limit,
  }));
  const entries = (res.Items ?? []).map((it, i) => ({
    rank: i + 1,
    playerId: it.playerId,
    playerName: it.playerName,
    bestTimeMs: it.bestTimeMs,
  }));
  return json(200, { trackId, entries });
});
