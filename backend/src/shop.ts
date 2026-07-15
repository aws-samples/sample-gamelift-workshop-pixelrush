import { GetCommand, QueryCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { ddb, MAIN_TABLE, json, bad, withOriginVerify } from './lib/db.js';
import { broadcastChat } from './lib/broadcast.js';

/**
 * GET  /shop?playerId=    -> full car catalog with owned/affordable flags
 * POST /shop/buy {playerId, carId}
 */
export const handler = withOriginVerify(async (event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> => {
  if (event.requestContext.http.method === 'POST') return buy(event);

  const catalog = await ddb.send(new QueryCommand({
    TableName: MAIN_TABLE,
    KeyConditionExpression: 'pk = :p',
    ExpressionAttributeValues: { ':p': 'CATALOG#CARS' },
  }));
  let owned = new Set<string>();
  let coins = 0;
  const playerId = event.queryStringParameters?.playerId;
  if (playerId) {
    const p = await ddb.send(new GetCommand({
      TableName: MAIN_TABLE, Key: { pk: `PLAYER#${playerId}`, sk: 'PROFILE' },
    }));
    if (p.Item) { owned = new Set(p.Item.ownedCars); coins = p.Item.coins; }
  }
  const cars = (catalog.Items ?? [])
    .sort((a, b) => (a.price as number) - (b.price as number))
    .map(({ pk: _a, sk: _b, ...car }) => ({
      ...car,
      owned: owned.has(car.carId as string),
      affordable: coins >= (car.price as number),
    }));
  return json(200, { cars, coins });
});

async function buy(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
  const { playerId, carId } = JSON.parse(event.body ?? '{}');
  if (!playerId || !carId) return bad('playerId and carId required');

  const car = await ddb.send(new GetCommand({
    TableName: MAIN_TABLE, Key: { pk: 'CATALOG#CARS', sk: `CAR#${carId}` },
  }));
  if (!car.Item) return bad('unknown car', 404);
  const price = car.Item.price as number;

  // Single conditional update: enough coins AND not already owned.
  try {
    const res = await ddb.send(new UpdateCommand({
      TableName: MAIN_TABLE,
      Key: { pk: `PLAYER#${playerId}`, sk: 'PROFILE' },
      UpdateExpression: 'SET coins = coins - :price, ownedCars = list_append(ownedCars, :car)',
      ConditionExpression: 'coins >= :price AND NOT contains(ownedCars, :carId)',
      ExpressionAttributeValues: { ':price': price, ':car': [carId], ':carId': carId },
      ReturnValues: 'ALL_NEW',
    }));
    const { pk: _pk, sk: _sk, ...profile } = res.Attributes!;
    await broadcastChat({
      type: 'chat', kind: 'system',
      text: `${profile.name} 购入了 ${car.Item.name}！`, at: Date.now(),
    }).catch(() => { /* chat is best-effort */ });
    return json(200, { player: profile, bought: carId });
  } catch {
    return bad('not enough coins or already owned', 409);
  }
}
