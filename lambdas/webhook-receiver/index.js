const { SQSClient, SendMessageCommand } = require("@aws-sdk/client-sqs");
const sqs = new SQSClient({});

exports.handler = async (event) => {
    // 1. Identificar Gateway pela URL ou Header
    const gateway = event.pathParameters?.gateway; // ex: /webhooks/efi
    const payload = JSON.parse(event.body);

    console.log(`Webhook received from ${gateway}:`, payload);

    // 2. Enfileirar para processamento assíncrono
    await sqs.send(new SendMessageCommand({
        QueueUrl: process.env.WEBHOOK_QUEUE_URL,
        MessageBody: JSON.stringify({
            gateway,
            payload,
            receivedAt: new Date().toISOString()
        })
    }));

    return {
        statusCode: 200,
        body: JSON.stringify({ message: "Webhook received and queued" })
    };
};
