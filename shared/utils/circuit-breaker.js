const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, UpdateCommand, GetCommand } = require("@aws-sdk/lib-dynamodb");

const client = new DynamoDBClient({});
const ddbDocClient = DynamoDBDocumentClient.from(client);

const FAILURE_THRESHOLD = 5;
const MONITOR_WINDOW_SECONDS = 300; // 5 minutos

async function recordFailure(gatewayName) {
    const timestamp = Math.floor(Date.now() / 1000);
    const windowKey = Math.floor(timestamp / MONITOR_WINDOW_SECONDS);

    await ddbDocClient.send(new UpdateCommand({
        TableName: process.env.METRICS_TABLE,
        Key: { pk: `GW#${gatewayName}`, sk: `WINDOW#${windowKey}` },
        UpdateExpression: "SET failures = if_not_exists(failures, :zero) + :one, ttl = :ttl",
        ExpressionAttributeValues: { ":one": 1, ":zero": 0, ":ttl": timestamp + 3600 }
    }));

    // Verificar se deve abrir o disjuntor
    const stats = await ddbDocClient.send(new GetCommand({
        TableName: process.env.METRICS_TABLE,
        Key: { pk: `GW#${gatewayName}`, sk: `WINDOW#${windowKey}` }
    }));

    if (stats.Item?.failures >= FAILURE_THRESHOLD) {
        console.log(`CIRCUIT BREAKER: Opening for ${gatewayName}`);
        return true; // Deve trocar o gateway
    }
    return false;
}

module.exports = { recordFailure };
