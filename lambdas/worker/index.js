const axios = require("axios");

exports.handler = async (event) => {
    for (const record of event.Records) {
        const { gateway, payload } = JSON.parse(record.body);
        
        // 1. Normalizar o status para o formato do SaaS
        const normalizedData = normalizeWebhook(gateway, payload);
        
        // 2. Buscar URL de callback do cliente (No DB real)
        const clientCallbackUrl = "https://client-api.com/webhooks/payments"; 

        try {
            await axios.post(clientCallbackUrl, normalizedData, { timeout: 5000 });
            console.log(`Successfully delivered webhook for gateway ${gateway}`);
        } catch (error) {
            console.error(`Failed to deliver webhook: ${error.message}`);
            // O SQS fará o retry automático se lançarmos erro
            throw error; 
        }
    }
};

function normalizeWebhook(gateway, payload) {
    if (gateway === 'efi') {
        return {
            event: "payment.updated",
            orch_id: payload.pix[0].txid, // Exemplo simplificado
            status: payload.pix[0].horario ? "paid" : "pending",
            amount: payload.pix[0].valor,
            gateway: "efi"
        };
    }
    return payload;
}
