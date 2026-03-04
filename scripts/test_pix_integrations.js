/**
 * Testes de Integração para Sistema de Cobrança Pix
 * 
 * Testa fluxo completo: validação → handler → normalização → resposta
 * Inclui testes para todas as 4 modalidades e operações (create/get/cancel)
 */

const { EFIPixChargeHandler } = require('../lambdas/proxy/handlers/pix-charge-handler');
const { normalizeGatewayResponse } = require('../lambdas/proxy/handlers/response-normalizer');

// Cores para output
const Colors = {
  RESET: '\x1b[0m',
  GREEN: '\x1b[32m',
  RED: '\x1b[31m',
  YELLOW: '\x1b[33m',
  BLUE: '\x1b[36m'
};

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;

/**
 * Executa um teste de forma assíncrona
 * 
 * @param {string} testName - Nome do teste
 * @param {AsyncFunction} testFn - Função de teste
 */
async function test(testName, testFn) {
  totalTests += 1;
  try {
    await testFn();
    console.log(`${Colors.GREEN}✓${Colors.RESET} ${testName}`);
    passedTests += 1;
  } catch (error) {
    console.log(`${Colors.RED}✗${Colors.RESET} ${testName}`);
    console.log(`  ${Colors.RED}Error: ${error.message}${Colors.RESET}`);
    failedTests += 1;
  }
}

/**
 * Afirma que valor é verdadeiro
 * 
 * @param {boolean} condition - Condição a testar
 * @param {string} message - Mensagem de erro
 */
function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

/**
 * Afirma que dois valores são iguais
 * 
 * @param {*} actual - Valor obtido
 * @param {*} expected - Valor esperado
 * @param {string} message - Mensagem de erro
 */
function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(`${message}. Expected: ${expected}, Got: ${actual}`);
  }
}

/**
 * Executa suite de testes de forma sequencial
 * 
 * @param {Array<Array<string|AsyncFunction>>} tests - Tests to run
 */
async function runTests(tests) {
  for (const [name, fn] of tests) {
    await test(name, fn);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// TESTE 1: Handler em Modo Mock (sem credenciais)
// ═══════════════════════════════════════════════════════════════════════════

console.log(`\n${Colors.BLUE}═══ TESTE 1: Mock Mode Handler ===${Colors.RESET}`);

(async () => {
  await runTests([
    [
      'Should create COPIA_COLA charge in mock mode',
      async () => {
        const handler = new EFIPixChargeHandler();
        const payload = {
          idCobr: 'mockcobr001',
          valor: '100.00',
          pagador: {
            chave: 'joao@mock.com',
            nome: 'João Mock'
          }
        };

        const response = await handler.createCharge('COPIA_COLA', payload);

        assert(response.id === 'mockcobr001' || response.txid === 'mockcobr001', 'id/txid should match');
        assert(response.pixCopiaECola, 'pixCopiaECola should be present');
        assert(response.status === 'ATIVA', 'status should be ATIVA');
      }
    ],
    [
      'Should create DINAMICO charge in mock mode',
      async () => {
        const handler = new EFIPixChargeHandler();
        const futureDate = new Date(Date.now() + 86400000).toISOString().split('T')[0];
        const payload = {
          idCobr: 'mockcobr002',
          valor: '250.50',
          vencimento: {
            data: futureDate
          },
          pagador: {
            chave: '98765432100',
            nome: 'Maria Mock'
          }
        };

        const response = await handler.createCharge('DINAMICO', payload);

        assert(response.id === 'mockcobr002' || response.txid === 'mockcobr002', 'id/txid should match');
        assert(response.qrCode, 'qrCode should be present');
        assert(response.status === 'ATIVA', 'status should be ATIVA');
      }
    ],
    [
      'Should create LINK charge in mock mode',
      async () => {
        const handler = new EFIPixChargeHandler();
        const payload = {
          idCobr: 'mockcobr003',
          valor: '75.99',
          pagador: {
            chave: 'pedro@mock.com',
            nome: 'Pedro Mock'
          }
        };

        const response = await handler.createCharge('LINK', payload);

        assert(response.id === 'mockcobr003' || response.txid === 'mockcobr003', 'id/txid should match');
        assert(response.linkPagamento, 'linkPagamento should be present');
        assert(response.status === 'ATIVA', 'status should be ATIVA');
      }
    ],
    [
      'Should create MANUAL charge in mock mode',
      async () => {
        const handler = new EFIPixChargeHandler();
        const payload = {
          idCobr: 'mockcobr004',
          valor: '50.00',
          pagador: {
            chave: '22222222222',
            nome: 'Ana Mock'
          }
        };

        const response = await handler.createCharge('MANUAL', payload);

        assert(response.id === 'mockcobr004' || response.txid === 'mockcobr004', 'id/txid should match');
        assert(response.status, 'status should be present');
      }
    ]
  ]);

  // ═══════════════════════════════════════════════════════════════════════════
  // TESTE 2: Normalização de Respostas
  // ═══════════════════════════════════════════════════════════════════════════

  console.log(`\n${Colors.BLUE}═══ TESTE 2: Response Normalization ===${Colors.RESET}`);

  await runTests([
    [
      'Should normalize COPIA_COLA response',
      async () => {
        const handler = new EFIPixChargeHandler();
        const payload = {
          idCobr: 'normtest001',
          valor: '100.00',
          pagador: {
            chave: 'norm@test.com',
            nome: 'Norm Test'
          }
        };

        const gatewayResponse = await handler.createCharge('COPIA_COLA', payload);
        const normalized = normalizeGatewayResponse(
          'efi',
          gatewayResponse,
          'pix_charge'
        );

        assert(normalized.idCobr === 'normtest001', 'idCobr should match');
        assert(normalized.pixCopiaECola, 'pixCopiaECola should be present');
        assert(normalized.gateway === 'efi', 'gateway should be efi');
      }
    ],
    [
      'Should normalize DINAMICO response with qrCode',
      async () => {
        const handler = new EFIPixChargeHandler();
        const payload = {
          idCobr: 'normtest002',
          valor: '250.50',
          vencimento: {
            data: new Date(Date.now() + 86400000).toISOString().split('T')[0]
          },
          pagador: {
            chave: 'dyn@test.com',
            nome: 'Dyn Test'
          }
        };

        const gatewayResponse = await handler.createCharge('DINAMICO', payload);
        const normalized = normalizeGatewayResponse(
          'efi',
          gatewayResponse,
          'pix_charge'
        );

        assert(normalized.qrCode, 'qrCode should be present');
        assert(normalized.status === 'ATIVA', 'status should match');
      }
    ],
    [
      'Should normalize LINK response with linkPagamento',
      async () => {
        const handler = new EFIPixChargeHandler();
        const payload = {
          idCobr: 'normtest003',
          valor: '75.99',
          pagador: {
            chave: 'link@test.com',
            nome: 'Link Test'
          }
        };

        const gatewayResponse = await handler.createCharge('LINK', payload);
        const normalized = normalizeGatewayResponse(
          'efi',
          gatewayResponse,
          'pix_charge'
        );

        assert(normalized.linkPagamento, 'linkPagamento should be present');
      }
    ]
  ]);

  // ═══════════════════════════════════════════════════════════════════════════
  // TESTE 3: Operações de Status e Cancel
  // ═══════════════════════════════════════════════════════════════════════════

  console.log(`\n${Colors.BLUE}═══ TESTE 3: Status & Cancel Operations ===${Colors.RESET}`);

  await runTests([
    [
      'Should get charge status in mock mode',
      async () => {
        const handler = new EFIPixChargeHandler();
        const response = await handler.getChargeStatus('mockcobr001');

        assert(response.id || response.txid, 'id/txid should be present');
        assert(response.status, 'status should be present');
        assert(response.valor || true, 'valor optional in status response');
      }
    ],
    [
      'Should cancel charge in mock mode',
      async () => {
        const handler = new EFIPixChargeHandler();
        // Criar cobrança DINAMICO para poder cancelar
        const payload = {
          idCobr: 'cancelmock001',
          valor: '100.00',
          vencimento: {
            data: new Date(Date.now() + 86400000).toISOString().split('T')[0]
          },
          pagador: {
            chave: '12345678900',
            nome: 'Test User'
          }
        };

        await handler.createCharge('DINAMICO', payload);
        const cancelResponse = await handler.cancelCharge('cancelmock001');

        assert(cancelResponse.id || cancelResponse.txid, 'id/txid should be present');
        assert(cancelResponse.status === 'REMOVIDA', 'status should be REMOVIDA');
      }
    ]
  ]);

  // ═══════════════════════════════════════════════════════════════════════════
  // TESTE 4: Fluxo Completo (Validação → Handler → Normalização)
  // ═══════════════════════════════════════════════════════════════════════════

  console.log(`\n${Colors.BLUE}═══ TESTE 4: Full Integration Flow ===${Colors.RESET}`);

  await runTests([
    [
      'Should process complete COPIA_COLA flow',
      async () => {
        const handler = new EFIPixChargeHandler();
        const payload = {
          idCobr: 'fullflow001',
          valor: '150.00',
          pagador: {
            chave: 'fullflow@mock.com',
            nome: 'Full Flow Test'
          }
        };

        const handlerResponse = await handler.createCharge('COPIA_COLA', payload);
        const normalized = normalizeGatewayResponse(
          'efi',
          handlerResponse,
          'pix_charge'
        );

        assert(normalized.id === 'fullflow001', 'id should match');
        assert(normalized.idCobr === 'fullflow001', 'idCobr should match');
        assert(normalized.valor === '150.00', 'valor should match');
        assert(normalized.gateway === 'efi', 'gateway should be efi');
        assert(normalized.criadoEm, 'criadoEm should be present');
      }
    ],
    [
      'Should process complete DINAMICO flow with vencimento',
      async () => {
        const handler = new EFIPixChargeHandler();
        const futureDate = new Date(Date.now() + 86400000).toISOString().split('T')[0];
        const payload = {
          idCobr: 'fullflow002',
          valor: '300.50',
          vencimento: {
            data: futureDate,
            multa: 10
          },
          pagador: {
            chave: '98765432100',
            nome: 'Dinamico Test'
          }
        };

        const handlerResponse = await handler.createCharge('DINAMICO', payload);
        const normalized = normalizeGatewayResponse(
          'efi',
          handlerResponse,
          'pix_charge'
        );

        assert(normalized.vencimento, 'vencimento should be present');
        assert(normalized.qrCode, 'qrCode should be present for DINAMICO');
      }
    ]
  ]);

  // ═══════════════════════════════════════════════════════════════════════════
  // RESULTADOS
  // ═══════════════════════════════════════════════════════════════════════════

  console.log(
    `\n${Colors.BLUE}══════════════════════════════════════════${Colors.RESET}`
  );
  console.log(
    `Total:  ${totalTests} | ${Colors.GREEN}Passed: ${passedTests}${Colors.RESET} | ${Colors.RED}Failed: ${failedTests}${Colors.RESET}`
  );
  console.log(
    `${Colors.BLUE}══════════════════════════════════════════${Colors.RESET}\n`
  );

  // Sair com status apropriado
  process.exit(failedTests > 0 ? 1 : 0);
})();
