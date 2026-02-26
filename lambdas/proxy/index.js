const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, GetCommand, PutCommand } = require("@aws-sdk/lib-dynamodb");
const axios = require("axios");

const client = new DynamoDBClient({});
const ddbDocClient = DynamoDBDocumentClient.from(client);

exports.handler = async (event) => {
    const idempotencyKey = event.headers['x-idempotency-key'] || event.headers['X-Idempotency-Key'];
    const tenantId = event.requestContext.authorizer.tenantId; // Injetado pelo Lambda Authorizer

    if (!idempotencyKey) {
        return { statusCode: 400, body: JSON.stringify({ error: "Missing Idempotency Key" }) };
    }

    // 1. Verificar Idempotência
    const checkIdempotency = await ddbDocClient.send(new GetCommand({
        TableName: process.env.IDEMPOTENCY_TABLE,
        Key: { pk: `TENANT#${tenantId}`, sk: `IDEM#${idempotencyKey}` }
    }));

    if (checkIdempotency.Item) {
        return { statusCode: 200, body: checkIdempotency.Item.response };
    }

    try {
        const body = JSON.parse(event.body);
        const gateway = event.requestContext.authorizer.activeGateway; // e.g., 'efi'

        let gatewayResponse;
        
        // 2. Proxy para o Gateway
        if (gateway === 'efi') {
            gatewayResponse = await handleEfiPayment(body);
        } else if (gateway === 'stripe') {
            gatewayResponse = await handleStripePayment(body);
        }

        const normalizedResponse = normalizeResponse(gateway, gatewayResponse);

        // 3. Salvar Idempotência
        await ddbDocClient.send(new PutCommand({
            TableName: process.env.IDEMPOTENCY_TABLE,
            Item: {
                pk: `TENANT#${tenantId}`,
                sk: `IDEM#${idempotencyKey}`,
                response: JSON.stringify(normalizedResponse),
                ttl: Math.floor(Date.now() / 1000) + (24 * 60 * 60) // 24h TTL
            }
        }));

        return {
            statusCode: 201,
            body: JSON.stringify(normalizedResponse)
        };

    } catch (error) {
        console.error(error);
        return {
            statusCode: error.response?.status || 500,
            body: JSON.stringify({ error: "Payment processing failed", details: error.message })
        };
    }
};

async function handleEfiPayment(data) {
    // Lógica simplificada Efí (Pix)
    // Aqui entraria a autenticação OAuth da Efí e o POST /v2/cob
    return { id: "efi_tx_123", status: "ATIVA", pix: { qrcode: "...", copiaecola: "..." } };
}

async function handleStripePayment(data) {
    // Lógica simplificada Stripe
    return { id: "pi_123", status: "requires_payment_method" };
}

function normalizeResponse(gateway, data) {
    if (gateway === 'efi') {
        return {
            id: `orch_${Date.now()}`,
            gateway_id: data.id,
            status: "pending",
            payment_data: {
                qr_code: data.pix.qrcode,
                copy_paste: data.pix.copiaecola
            }
        };
    }
    // Adicionar normalização para outros gateways...
    return data;
}
