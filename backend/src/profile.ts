import { GetCommand, QueryCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { ddb, MAIN_TABLE, json, bad, withOriginVerify } from './lib/db.js';

/**
 * GET  /profile?playerId=       -> profile
 * GET  /garage?playerId=        -> owned cars joined with catalog stats
 * POST /garage/select {playerId, carId}
 */
export const handler = withOriginVerify(async (event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> => {
  const route = event.requestContext.http.path;
  if (route.endsWith('/garage/select')) return selectCar(event);

  const playerId = event.queryStringParameters?.playerId;
  if (!playerId) return bad('playerId required');
  const res = await ddb.send(new GetCommand({
    TableName: MAIN_TABLE,
    Key: { pk: `PLAYER#${playerId}`, sk: 'PROFILE' },
  }));
  if (!res.Item) return bad('player not found', 404);
  const { pk: _pk, sk: _sk, ...profile } = res.Item;

  if (route.endsWith('/garage')) {
    const catalog = await ddb.send(new QueryCommand({
      TableName: MAIN_TABLE,
      KeyConditionExpression: 'pk = :p',
      ExpressionAttributeValues: { ':p': 'CATALOG#CARS' },
    }));
    const owned = new Set(profile.ownedCars as string[]);
    const cars = (catalog.Items ?? [])
      .filter((c) => owned.has(c.carId))
      .map(({ pk: _a, sk: _b, ...car }) => ({ ...car, selected: car.carId === profile.selectedCar }));
    return json(200, { cars });
  }
  return json(200, { player: profile });
});

async function selectCar(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
  const { playerId, carId } = JSON.parse(event.body ?? '{}');
  if (!playerId || !carId) return bad('playerId and carId required');
  try {
    await ddb.send(new UpdateCommand({
      TableName: MAIN_TABLE,
      Key: { pk: `PLAYER#${playerId}`, sk: 'PROFILE' },
      UpdateExpression: 'SET selectedCar = :c',
      ConditionExpression: 'contains(ownedCars, :c)',
      ExpressionAttributeValues: { ':c': carId },
    }));
  } catch {
    return bad('car not owned', 403);
  }
  return json(200, { selectedCar: carId });
}
