import { GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { randomUUID } from 'node:crypto';
import { ddb, MAIN_TABLE, json, bad, withOriginVerify, type PlayerProfile } from './lib/db.js';

/**
 * POST /login {name, password}
 * Gated by a single workshop password (LOGIN_PASSWORD env). Names are unique:
 * an existing name returns that player's data; a new name deep-copies a
 * random one of the 8 seeded templates (the "random persona" mechanic).
 */
export const handler = withOriginVerify(async (event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> => {
  const body = JSON.parse(event.body ?? '{}');
  const name = (body.name ?? '').trim();
  if (!name || name.length > 20) return bad('name required (max 20 chars)');
  if ((body.password ?? '') !== (process.env.LOGIN_PASSWORD ?? 'gamelift')) {
    return bad('wrong password', 401);
  }

  const mapping = await ddb.send(new GetCommand({
    TableName: MAIN_TABLE,
    Key: { pk: `NAME#${name.toLowerCase()}`, sk: 'MAP' },
  }));
  if (mapping.Item) {
    const existing = await ddb.send(new GetCommand({
      TableName: MAIN_TABLE,
      Key: { pk: `PLAYER#${mapping.Item.playerId}`, sk: 'PROFILE' },
    }));
    if (existing.Item) return json(200, { player: toProfile(existing.Item), isNew: false });
  }

  const templateId = String(1 + Math.floor(Math.random() * 8));
  const tpl = await ddb.send(new GetCommand({
    TableName: MAIN_TABLE,
    Key: { pk: `TEMPLATE#${templateId}`, sk: 'PROFILE' },
  }));
  if (!tpl.Item) return bad('seed data missing; deploy backend stack seed', 500);

  const playerId = randomUUID();
  const profile: PlayerProfile = {
    playerId,
    name,
    // Everyone starts at level 1 so any two new players match immediately
    // (FlexMatch SimilarLevel allows a gap of 3). Car and coins stay random
    // from the template for variety.
    level: 1,
    coins: tpl.Item.coins,
    titles: [...tpl.Item.titles],
    ownedCars: [...tpl.Item.ownedCars],
    selectedCar: tpl.Item.selectedCar,
    completedTracks: [],
  };

  // NAME mapping first with a condition so two same-name logins don't both win.
  try {
    await ddb.send(new PutCommand({
      TableName: MAIN_TABLE,
      Item: { pk: `NAME#${name.toLowerCase()}`, sk: 'MAP', playerId },
      ConditionExpression: 'attribute_not_exists(pk)',
    }));
  } catch {
    return bad('name was just taken, try again', 409);
  }
  await ddb.send(new PutCommand({
    TableName: MAIN_TABLE,
    Item: { pk: `PLAYER#${playerId}`, sk: 'PROFILE', ...profile },
  }));

  return json(200, { player: profile, isNew: true, fromTemplate: templateId });
});

function toProfile(item: Record<string, unknown>): PlayerProfile {
  const { pk: _pk, sk: _sk, ...rest } = item;
  return rest as unknown as PlayerProfile;
}
