/**
 * Testes para Validadores de Cobrança Pix
 * 
 * Testa todas as 4 modalidades de cobrança (COPIA_COLA, DINAMICO, LINK, MANUAL)
 * Inclui validação de campos, regras específicas, e tratamento de erros
 */

const pixChargeValidators = require('../shared/utils/pix-charge-validators');
const pixSendValidators = require('../shared/utils/pix-validators');
const { ValidationError } = require('../shared/utils/errors');

// Cores para output (opcional)
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
 * Executa um teste e valida resultado
 * 
 * @param {string} testName - Nome do teste
 * @param {Function} testFn - Função de teste
 */
function test(testName, testFn) {
  totalTests += 1;
  try {
    testFn();
    console.log(`${Colors.GREEN}✓${Colors.RESET} ${testName}`);
    passedTests += 1;
  } catch (error) {
    console.log(`${Colors.RED}✗${Colors.RESET} ${testName}`);
    console.log(`  ${Colors.RED}Error: ${error.message}${Colors.RESET}`);
    failedTests += 1;
  }
}

/**
 * Testa forma de exceção
 * 
 * @param {string} message - Mensagem esperada
 * @param {Function} fn - Função que deve lançar exceção
 */
function expectError(message, fn) {
  try {
    fn();
    throw new Error(`Expected error with message: ${message}`);
  } catch (error) {
    if (!error.message.includes(message)) {
      throw new Error(`Expected "${message}" but got "${error.message}"`);
    }
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

// ═══════════════════════════════════════════════════════════════════════════
// TESTE 1: Validação COPIA_COLA
// ═══════════════════════════════════════════════════════════════════════════

console.log(`\n${Colors.BLUE}═══ TESTE 1: COPIA_COLA ===${Colors.RESET}`);

test('Should validate COPIA_COLA with required fields', () => {
  const payload = {
    idCobr: 'cobr001',
    modalidade: 'COPIA_COLA',
    valor: '100.00',
    pagador: {
      chave: 'joao@example.com',
      nome: 'João Silva'
    }
  };
  pixChargeValidators.validatePixCharge('COPIA_COLA', payload);
  assert(true, 'Should not throw error');
});

test('Should fail COPIA_COLA with invalid idCobr', () => {
  const payload = {
    idCobr: 'cobr-001', // Has hyphen
    modalidade: 'COPIA_COLA',
    valor: '100.00',
    pagador: { chave: 'joao@example.com', nome: 'João' }
  };
  expectError('idCobr must contain only alphanumeric characters', () => {
    pixChargeValidators.validatePixCharge('COPIA_COLA', payload);
  });
});

test('Should fail COPIA_COLA with invalid valor', () => {
  const payload = {
    idCobr: 'cobr001',
    modalidade: 'COPIA_COLA',
    valor: '100', // Missing cents
    pagador: { chave: 'joao@example.com', nome: 'João' }
  };
  expectError('valor must be in format', () => {
    pixChargeValidators.validatePixCharge('COPIA_COLA', payload);
  });
});

test('Should fail COPIA_COLA with missing pagador', () => {
  const payload = {
    idCobr: 'cobr001',
    modalidade: 'COPIA_COLA',
    valor: '100.00'
  };
  expectError('pagador is required', () => {
    pixChargeValidators.validatePixCharge('COPIA_COLA', payload);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// TESTE 2: Validação DINAMICO
// ═══════════════════════════════════════════════════════════════════════════

console.log(`\n${Colors.BLUE}═══ TESTE 2: DINAMICO ===${Colors.RESET}`);

test('Should validate DINAMICO with vencimento', () => {
  const futureDate = new Date(Date.now() + 86400000).toISOString().split('T')[0];
  const payload = {
    idCobr: 'cobr002',
    modalidade: 'DINAMICO',
    valor: '250.99',
    vencimento: {
      data: futureDate
    },
    pagador: {
      chave: '98765432100',
      nome: 'Maria Silva'
    }
  };
  pixChargeValidators.validatePixCharge('DINAMICO', payload);
  assert(true, 'Should not throw error');
});

test('Should fail DINAMICO with past vencimento', () => {
  const pastDate = new Date(Date.now() - 86400000).toISOString().split('T')[0];
  const payload = {
    idCobr: 'cobr002',
    modalidade: 'DINAMICO',
    valor: '250.99',
    vencimento: {
      data: pastDate
    },
    pagador: { chave: '98765432100', nome: 'Maria' }
  };
  expectError('vencimento.data must be in the future', () => {
    pixChargeValidators.validatePixCharge('DINAMICO', payload);
  });
});

test('Should fail DINAMICO with invalid multa percentage', () => {
  const futureDate = new Date(Date.now() + 86400000).toISOString().split('T')[0];
  const payload = {
    idCobr: 'cobr002',
    modalidade: 'DINAMICO',
    valor: '250.99',
    vencimento: {
      data: futureDate,
      multa: 25 // > 20%
    },
    pagador: { chave: '98765432100', nome: 'Maria' }
  };
  expectError('multa must be between 0 and 20', () => {
    pixChargeValidators.validatePixCharge('DINAMICO', payload);
  });
});

test('Should validate DINAMICO with multa and juros', () => {
  const futureDate = new Date(Date.now() + 86400000).toISOString().split('T')[0];
  const payload = {
    idCobr: 'cobr002',
    modalidade: 'DINAMICO',
    valor: '250.99',
    vencimento: {
      data: futureDate,
      multa: 10,
      juros: 5
    },
    pagador: { chave: '98765432100', nome: 'Maria' }
  };
  pixChargeValidators.validatePixCharge('DINAMICO', payload);
  assert(true, 'Should not throw error');
});

// ═══════════════════════════════════════════════════════════════════════════
// TESTE 3: Validação LINK
// ═══════════════════════════════════════════════════════════════════════════

console.log(`\n${Colors.BLUE}═══ TESTE 3: LINK ===${Colors.RESET}`);

test('Should validate LINK with minimal payload', () => {
  const payload = {
    idCobr: 'cobr003',
    modalidade: 'LINK',
    valor: '99.99',
    pagador: {
      chave: 'pedro@example.com',
      nome: 'Pedro Costa'
    }
  };
  pixChargeValidators.validatePixCharge('LINK', payload);
  assert(true, 'Should not throw error');
});

test('Should fail LINK with invalid valor', () => {
  const payload = {
    idCobr: 'cobr003',
    modalidade: 'LINK',
    valor: '0.00', // Zero
    pagador: { chave: 'pedro@example.com', nome: 'Pedro' }
  };
  expectError('valor must be greater than zero', () => {
    pixChargeValidators.validatePixCharge('LINK', payload);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// TESTE 4: Validação MANUAL
// ═══════════════════════════════════════════════════════════════════════════

console.log(`\n${Colors.BLUE}═══ TESTE 4: MANUAL ===${Colors.RESET}`);

test('Should validate MANUAL with required fields', () => {
  const payload = {
    idCobr: 'cobr004',
    modalidade: 'MANUAL',
    valor: '50.00',
    pagador: {
      chave: '12345678900',
      nome: 'Ana Santos'
    }
  };
  pixChargeValidators.validatePixCharge('MANUAL', payload);
  assert(true, 'Should not throw error');
});

// ═══════════════════════════════════════════════════════════════════════════
// TESTE 5: Validação de CPF/CNPJ
// ═══════════════════════════════════════════════════════════════════════════

console.log(`\n${Colors.BLUE}═══ TESTE 5: CPF/CNPJ ===${Colors.RESET}`);

test('Should validate valid CPF', () => {
  pixChargeValidators.validateCPF('12345678900');
  assert(true, 'Should not throw error');
});

test('Should fail with invalid CPF format', () => {
  expectError('CPF must contain exactly 11 digits', () => {
    pixChargeValidators.validateCPF('123456789'); // Too short
  });
});

test('Should validate valid CNPJ', () => {
  pixChargeValidators.validateCNPJ('12345678000123');
  assert(true, 'Should not throw error');
});

// ═══════════════════════════════════════════════════════════════════════════
// TESTE 6: Validação de Refund
// ═══════════════════════════════════════════════════════════════════════════

console.log(`\n${Colors.BLUE}═══ TESTE 6: REFUND (Pix Send) ===${Colors.RESET}`);

test('Should validate Pix refund with valid fields', () => {
  const payload = {
    idDevolucao: 'dev001',
    idEnvioOrigem: 'envio001',
    valor: '100.00',
    motivo: 'SOLICITACAO_PAYER'
  };
  pixSendValidators.validatePixRefund(payload);
  assert(true, 'Should not throw error');
});

test('Should fail refund with invalid motivo', () => {
  const payload = {
    idDevolucao: 'dev001',
    idEnvioOrigem: 'envio001',
    valor: '100.00',
    motivo: 'MOTIVO_INVALIDO'
  };
  expectError('motivo must be one of', () => {
    pixSendValidators.validatePixRefund(payload);
  });
});

test('Should validate refund with SOLICITACAO_CREDOR motivo', () => {
  const payload = {
    idDevolucao: 'dev002',
    idEnvioOrigem: 'envio002',
    valor: '250.50',
    motivo: 'SOLICITACAO_CREDOR'
  };
  pixSendValidators.validatePixRefund(payload);
  assert(true, 'Should not throw error');
});

test('Should validate refund with FALHA_NA_ENTREGA motivo', () => {
  const payload = {
    idDevolucao: 'dev003',
    idEnvioOrigem: 'envio003',
    valor: '75.25',
    motivo: 'FALHA_NA_ENTREGA'
  };
  pixSendValidators.validatePixRefund(payload);
  assert(true, 'Should not throw error');
});

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
