// carregar variáveis de ambiente de um arquivo .env quando executado localmente
try {
  require('dotenv').config();
} catch (err) {
  // dotenv não está instalado globalmente, não é obrigatório
}

// variáveis necessárias pelo serviço; usamos defaults locais quando não fornecidas
process.env.IDEMPOTENCY_TABLE = process.env.IDEMPOTENCY_TABLE || 'local-idempotency';
process.env.METRICS_TABLE = process.env.METRICS_TABLE || 'local-metrics';
process.env.SKIP_IDEMPOTENCY = process.env.SKIP_IDEMPOTENCY || 'true';
// garantir região AWS para evitar erro no SDK
process.env.AWS_REGION = process.env.AWS_REGION || 'us-east-1';

const paymentService = require('../lambdas/proxy/service');
// para depuração: mostrar configuração do gateway
const { getGatewayConfig } = require('../shared/constants/payment-gateways');
const debugConfig = getGatewayConfig('efi');
console.log('DEBUG gateway config:', debugConfig);

(async () => {
  try {
    // exemplo de evento API Gateway mínimo
    const event = {
      headers: {
        'x-idempotency-key': 'test-' + Date.now()
      },
      requestContext: {
        authorizer: {
          tenantId: 'tenant_test',
          activeGateway: 'efi'
        }
      },
      body: JSON.stringify({
        // estrutura compatível com Efí / v2/cob
        expiracao: 3600,
        devedor: {
          cpf: '12345678909',
          nome: 'Francisco da Silva'
        },
        amount: 123.45,                 // usado para criar "valor.original"
        currency: 'BRL',               // exigido pelo validador
        chave: '2c5c7441-a91e-4982-8c25-6105581e18ae',
        description: 'Cobrança dos serviços prestados.'
      })
    };

    const result = await paymentService.processPayment(event);
    console.log('Resultado:', result);
  } catch (err) {
    console.error('Falha ao criar cobrança PIX:', err);
  }
})();
