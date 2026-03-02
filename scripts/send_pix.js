/**
 * Script de teste para Envio de Pix via Serviço
 * 
 * Simula uma requisição completa de envio de Pix através do serviço
 * incluindo validações, autenticação mockada e gateway routing.
 * 
 * Uso:
 *   node send_pix.js              # Teste padrão
 *   node send_pix.js --real       # Com credenciais reais (se configuradas)
 */

// Carregar variáveis de ambiente de um arquivo .env quando executado localmente
try {
  require('dotenv').config();
} catch (err) {
  // dotenv não está instalado globalmente, não é obrigatório
}

// Variáveis necessárias pelo serviço; usamos defaults locais quando não fornecidas
process.env.IDEMPOTENCY_TABLE = process.env.IDEMPOTENCY_TABLE || 'local-idempotency';
process.env.METRICS_TABLE = process.env.METRICS_TABLE || 'local-metrics';
process.env.SKIP_IDEMPOTENCY = process.env.SKIP_IDEMPOTENCY || 'true';
// Garantir região AWS para evitar erro no SDK
process.env.AWS_REGION = process.env.AWS_REGION || 'us-east-1';

const pixService = require('../lambdas/proxy/pix-service');
const { getGatewayConfig } = require('../shared/constants/payment-gateways');

// Parse command line arguments
const useRealApi = process.argv.includes('--real');

// Exibir config do gateway para debug
const debugConfig = getGatewayConfig('efi');
console.log('DEBUG gateway config:', {
  ...debugConfig,
  clientSecret: debugConfig.clientSecret ? '***' : null // Não exibir secret
});

/**
 * Exemplos de payloads para teste
 */
const testPayloads = [
  {
    name: 'Envio básico conforme documentação Efí',
    idEnvio: 'pixtest001iapagamento',
    payload: {
      valor: '00.01',
      pagador: {
        chave: '2c5c7441-a91e-4982-8c25-6105581e18ae',
        infoPagador: 'Segue o pagamento da conta'
      },
      favorecido: {
        chave: 'email@example.com'
      }
    }
  },
  {
    name: 'Envio com dados bancários completos',
    idEnvio: 'pix-test-002',
    payload: {
      valor: '250.50',
      pagador: {
        chave: 'email@example.com',
        infoPagador: 'Pagamento NF #2025001'
      },
      favorecido: {
        contaBanco: {
          nome: 'Empresa XYZ Ltda',
          cnpj: '12345678000195',
          codigoBanco: '00000001',
          agencia: '0001',
          conta: '123456789',
          tipoConta: 'cacc'
        }
      }
    }
  },
  {
    name: 'Envio simples sem infoPagador',
    idEnvio: 'pix-test-003',
    payload: {
      valor: '100.00',
      pagador: {
        chave: 'chave.pix@banco.com'
      },
      favorecido: {
        chave: 'recebedor@banco.com'
      }
    }
  }
];

/**
 * Executa um teste de envio
 */
async function runTest(testPayload) {
  const { name, idEnvio, payload } = testPayload;
  
  console.log(`\n${'═'.repeat(70)}`);
  console.log(`Teste: ${name}`);
  console.log(`${'═'.repeat(70)}`);
  console.log(`ID do Envio: ${idEnvio}`);
  console.log('Payload:', JSON.stringify(payload, null, 2));

  try {
    // Construir evento conforme API Gateway
    const event = {
      httpMethod: 'PUT',
      pathParameters: {
        idEnvio
      },
      headers: {
        'content-type': 'application/json'
      },
      requestContext: {
        httpMethod: 'PUT',
        authorizer: {
          tenantId: 'tenant_test_' + Date.now(),
          activeGateway: 'efi'
        }
      },
      body: JSON.stringify(payload)
    };

    console.log('\nProcessando...');
    const result = await pixService.sendPix(event);
    
    console.log('\nResultado:');
    console.log(`Status Code: ${result.statusCode}`);
    console.log('Resposta:', JSON.stringify(JSON.parse(result.body), null, 2));

    return { success: result.statusCode === 202 || result.statusCode === 200, result };
  } catch (err) {
    console.log('❌ Erro ao processar:', err.message);
    return { success: false, error: err };
  }
}

/**
 * Teste de consulta de status
 */
async function runStatusTest(idEnvio) {
  console.log(`\n${'═'.repeat(70)}`);
  console.log(`Consulta de Status: ${idEnvio}`);
  console.log(`${'═'.repeat(70)}`);

  try {
    const event = {
      httpMethod: 'GET',
      pathParameters: {
        idEnvio
      },
      requestContext: {
        httpMethod: 'GET',
        authorizer: {
          tenantId: 'tenant_test_' + Date.now(),
          activeGateway: 'efi'
        }
      }
    };

    console.log('\nConsultando status...');
    const result = await pixService.getPixStatus(event);
    
    console.log('\nResultado:');
    console.log(`Status Code: ${result.statusCode}`);
    console.log('Resposta:', JSON.stringify(JSON.parse(result.body), null, 2));

    return { success: result.statusCode === 200, result };
  } catch (err) {
    console.log('❌ Erro ao consultar status:', err.message);
    return { success: false, error: err };
  }
}

/**
 * Executa todos os testes
 */
(async () => {
  try {
    console.log('\n');
    console.log('╔' + '═'.repeat(68) + '╗');
    console.log('║' + ' '.repeat(68) + '║');
    console.log('║' + '  TESTE DE ENVIO DE PIX - INTEGRAÇÃO COM SERVIÇO'.padEnd(70) + '║');
    console.log('║' + ' '.repeat(68) + '║');
    console.log('╚' + '═'.repeat(68) + '╝');

    if (useRealApi) {
      console.log('\n⚠️  MODO: Usando API Real (CUIDADO: pode gerar transações reais!)');
    } else {
      console.log('\n✓ MODO: Mock local (sem chamar API real)');
    }

    console.log(`\nTotal de testes: ${testPayloads.length}`);

    const results = [];
    for (const testPayload of testPayloads) {
      const result = await runTest(testPayload);
      results.push({
        name: testPayload.name,
        ...result
      });
    }

    // Testar consulta de status com o último ID
    if (results.length > 0) {
      const lastTestId = testPayloads[testPayloads.length - 1].idEnvio;
      const statusResult = await runStatusTest(lastTestId);
      results.push({
        name: 'Consulta de Status',
        ...statusResult
      });
    }

    // Resumo
    console.log(`\n\n${'═'.repeat(70)}`);
    console.log('RESUMO');
    console.log(`${'═'.repeat(70)}`);

    let passed = 0;
    results.forEach((result, idx) => {
      const status = result.success ? '✓' : '✗';
      console.log(`${status} ${(idx + 1).toString().padStart(2)}. ${result.name}`);
      passed += result.success ? 1 : 0;
    });

    console.log(`${'═'.repeat(70)}`);
    console.log(`Sucesso: ${passed}/${results.length}`);
    console.log(`Taxa de sucesso: ${((passed / results.length) * 100).toFixed(1)}%`);

    process.exit(passed === results.length ? 0 : 1);
  } catch (err) {
    console.error('❌ Erro fatal:', err);
    process.exit(1);
  }
})();
