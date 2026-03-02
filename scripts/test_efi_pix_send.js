/**
 * Script de Teste para Envio de Pix via EFI
 * 
 * Suporta:
 * - Teste com mock (modo local padrão)
 * - Teste com API real (se credenciais configuradas)
 * 
 * Uso:
 *   node test_efi_pix_send.js              # modo mock
 *   node test_efi_pix_send.js --real       # tenta API real (precisa credenciais)
 *   node test_efi_pix_send.js --validate   # apenas valida payload
 */

// Carregar variáveis de ambiente
try {
  require('dotenv').config();
} catch (err) {
  logWarning('dotenv not available');
}

// Parse command line arguments ANTES de vários requires
const args = process.argv.slice(2);
const useRealApi = args.includes('--real');
const validateOnly = args.includes('--validate');
const forceLocalMode = args.includes('--mock') || !args.includes('--real'); // Mock é padrão

// Se forceLocalMode está ativo, limpar credenciais ANTES de carregá-las
if (forceLocalMode) {
  process.env.EFI_CLIENT_ID = undefined;
  process.env.EFI_CLIENT_SECRET = undefined;
}

// Configurar variáveis de ambiente padrão para testes
process.env.IDEMPOTENCY_TABLE = process.env.IDEMPOTENCY_TABLE || 'local-idempotency';
process.env.METRICS_TABLE = process.env.METRICS_TABLE || 'local-metrics';
process.env.SKIP_IDEMPOTENCY = process.env.SKIP_IDEMPOTENCY || 'true';
process.env.AWS_REGION = process.env.AWS_REGION || 'us-east-1';

const logger = require('../shared/utils/logger');
const { getEFIPixHandler } = require('../lambdas/proxy/handlers/efi-pix-handler');
const { validatePixSendRequest, validateIdEnvio } = require('../shared/utils/pix-validators');
const { ValidationError } = require('../shared/utils/errors');

/**
 * Casos de teste para envio de Pix
 */
const testCases = [
  {
    name: 'Envio básico via Pix (chave)',
    idEnvio: 'testpix001',
    payload: {
      valor: '12.34',
      pagador: {
        chave: '19974764017',
        infoPagador: 'Segue o pagamento da conta'
      },
      favorecido: {
        chave: 'joao@meuemail.com'
      }
    }
  },
  {
    name: 'Envio com dados bancários do favorecido',
    idEnvio: 'testpix002',
    payload: {
      valor: '150.00',
      pagador: {
        chave: 'email@example.com',
        infoPagador: 'Pagamento referente NF 001'
      },
      favorecido: {
        contaBanco: {
          nome: 'João da Silva',
          cpf: '12345678901',
          codigoBanco: '00000001',
          agencia: '0001',
          conta: '123456',
          tipoConta: 'cacc'
        }
      }
    }
  },
  {
    name: 'Envio sem infoPagador',
    idEnvio: 'testpix003',
    payload: {
      valor: '99.99',
      pagador: {
        chave: 'chave.pix@banco.com'
      },
      favorecido: {
        chave: 'outra.chave@banco.com'
      }
    }
  },
  {
    name: 'Envio com CPF do favorecido',
    idEnvio: 'testpix004',
    payload: {
      valor: '500.50',
      pagador: {
        chave: '12345678901'
      },
      favorecido: {
        chave: 'chave.favorecido@banco.com',
        cpf: '98765432100'
      }
    }
  },
  {
    name: 'Teste de erro: valor inválido',
    idEnvio: 'testerror1',
    payload: {
      valor: '12,34',  // Vírgula em vez de ponto - INVÁLIDO
      pagador: {
        chave: '19974764017'
      },
      favorecido: {
        chave: 'joao@meuemail.com'
      }
    },
    expectError: true
  },
  {
    name: 'Teste de erro: idEnvio muito longo',
    idEnvio: 'testerroridmuitolongoqueeexcede35chars',
    payload: {
      valor: '12.34',
      pagador: {
        chave: '19974764017'
      },
      favorecido: {
        chave: 'joao@meuemail.com'
      }
    },
    expectError: true
  },
  {
    name: 'Teste de erro: pagador sem chave Pix',
    idEnvio: 'testerror2',
    payload: {
      valor: '12.34',
      pagador: {
        infoPagador: 'Sem chave Pix'
      },
      favorecido: {
        chave: 'joao@meuemail.com'
      }
    },
    expectError: true
  }
];

/**
 * Executa um caso de teste
 */
async function runTestCase(testCase, handler) {
  const { name, idEnvio, payload, expectError } = testCase;
  
  console.log(`\n${'='.repeat(70)}`);
  console.log(`TEST: ${name}`);
  console.log(`${'='.repeat(70)}`);
  console.log(`ID Envio: ${idEnvio}`);
  console.log(`Payload:`, JSON.stringify(payload, null, 2));

  try {
    // Validar payload
    console.log('\n[Validação]');
    validatePixSendRequest(payload);
    validateIdEnvio(idEnvio);
    console.log('✓ Validação OK');

    if (validateOnly) {
      console.log('(Modo validação apenas)');
      return { success: true };
    }

    // Executar envio
    console.log('\n[Envio]');
    const result = await handler.sendPix(idEnvio, payload);
    
    if (expectError) {
      console.log('✗ ERRO: Esperava erro, mas sucedeu');
      return { success: false, result };
    }

    console.log('✓ Envio realizado com sucesso');
    console.log('Resposta:', JSON.stringify(result, null, 2));
    
    return { success: true, result };
  } catch (error) {
    if (expectError) {
      console.log('✓ Erro esperado capturado (correto)');
      console.log(`Mensagem: ${error.message}`);
      if (error.details) {
        console.log('Detalhes:', JSON.stringify(error.details, null, 2));
      }
      return { success: true, error };
    }

    console.log('✗ ERRO:');
    console.log(`Tipo: ${error.name}`);
    console.log(`Mensagem: ${error.message}`);
    if (error.details) {
      console.log('Detalhes:', JSON.stringify(error.details, null, 2));
    }
    
    return { success: false, error };
  }
}

/**
 * Executa todos os testes e exibe resumo
 */
async function runAllTests() {
  console.log('\n');
  console.log('╔' + '═'.repeat(68) + '╗');
  console.log('║' + ' '.repeat(68) + '║');
  console.log('║' + '  TESTE DE ENVIO DE PIX - EFI'.padEnd(70) + '║');
  console.log('║' + ' '.repeat(68) + '║');
  console.log('╚' + '═'.repeat(68) + '╝');
  
  if (validateOnly) {
    console.log('\n[MODO] Validação apenas (sem executar envios)');
  } else if (useRealApi) {
    console.log('\n[MODO] API Real (usar com cuidado - pode gerar transações reais!)');
  } else {
    console.log('\n[MODO] Mock local (sem chamar API real)');
  }
  
  console.log(`\nTotal de testes: ${testCases.length}`);

  const handler = getEFIPixHandler();
  const results = [];

  for (const testCase of testCases) {
    const result = await runTestCase(testCase, handler);
    results.push({
      name: testCase.name,
      ...result
    });
  }

  // Exibir resumo
  console.log(`\n\n${'═'.repeat(70)}`);
  console.log('RESUMO DOS TESTES');
  console.log(`${'═'.repeat(70)}`);

  let passed = 0;
  let failed = 0;

  results.forEach((result, idx) => {
    const status = result.success ? '✓ PASS' : '✗ FAIL';
    console.log(`${(idx + 1).toString().padStart(2)}. ${status} - ${result.name}`);
    if (!result.success && result.error) {
      console.log(`    ${result.error.message}`);
    }
    result.success ? passed++ : failed++;
  });

  console.log(`${'═'.repeat(70)}`);
  console.log(`Passou: ${passed}/${results.length}`);
  console.log(`Falhou: ${failed}/${results.length}`);
  console.log(`Taxa de sucesso: ${((passed / results.length) * 100).toFixed(1)}%`);
  
  process.exit(failed > 0 ? 1 : 0);
}

/**
 * Log de aviso simples
 */
function logWarning(msg) {
  console.warn(`⚠️  ${msg}`);
}

// Executar testes
(async () => {
  try {
    await runAllTests();
  } catch (err) {
    console.error('Erro fatal ao executar testes:', err);
    process.exit(1);
  }
})();
