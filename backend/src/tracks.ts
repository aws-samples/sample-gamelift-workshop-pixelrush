import { GetCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { ddb, MAIN_TABLE, json, bad, withOriginVerify } from './lib/db.js';

/**
 * GET /tracks?playerId= -> track catalog with unlocked flags.
 * Track N is unlocked iff it has no prerequisite or the prerequisite track
 * is in the player's completedTracks.
 */
export const handler = withOriginVerify(async (event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> => {
  const playerId = event.queryStringParameters?.playerId;
  if (!playerId) return bad('playerId required');

  const [player, catalog] = await Promise.all([
    ddb.send(new GetCommand({ TableName: MAIN_TABLE, Key: { pk: `PLAYER#${playerId}`, sk: 'PROFILE' } })),
    ddb.send(new QueryCommand({
      TableName: MAIN_TABLE,
      KeyConditionExpression: 'pk = :p',
      ExpressionAttributeValues: { ':p': 'CATALOG#TRACKS' },
    })),
  ]);
  if (!player.Item) return bad('player not found', 404);
  const completed = new Set<string>(player.Item.completedTracks);

  const tracks = (catalog.Items ?? [])
    .sort((a, b) => (a.order as number) - (b.order as number))
    .map(({ pk: _a, sk: _b, ...t }) => ({
      ...t,
      unlocked: !t.requiresTrackId || completed.has(t.requiresTrackId as string),
      completed: completed.has(t.trackId as string),
    }));
  return json(200, { tracks });
});
