/**
 * Validadores para Cobranças Pix
 * Validações específicas por modalidade (COPIA_COLA, DINAMICO, LINK, MANUAL)
 */

const validators = require('./validators');
const { ValidationError } = require('./errors');

/**
 * Valida requisição de cobrança Pix conforme modalidade
 *
 * @param {string} modalidade - COPIA_COLA | DINAMICO | LINK | MANUAL
 * @param {object} payload - Dados da cobrança
 * @throws {ValidationError} Se validação falhar
 */
function validatePixCharge(modalidade, payload) {
  // Validações comuns a todas modalidades
  validateCommon(payload);

  // Validações específicas por modalidade
  switch (modalidade) {
    case 'COPIA_COLA':
      validateCopiaCola(payload);
      break;
    case 'DINAMICO':
      validateDinamico(payload);
      break;
    case 'LINK':
      validateLink(payload);
      break;
    case 'MANUAL':
      validateManual(payload);
      break;
    default:
      throw new ValidationError(`Unsupported modalidade: ${modalidade}`, {
        field: 'modalidade',
        allowed: ['COPIA_COLA', 'DINAMICO', 'LINK', 'MANUAL']
      });
  }
}

/**
 * Validações comuns a todas modalidades de cobrança
 *
 * @private
 * @param {object} payload - Dados da cobrança
 * @throws {ValidationError} Se validação falhar
 */
function validateCommon(payload) {
  validators.isObject(payload, 'Pix charge payload');

  // Validar idCobr
  validators.required(payload.idCobr, 'idCobr');
  validators.isString(payload.idCobr, 'idCobr');
  validateIdCobr(payload.idCobr);

  // Validar valor
  validators.required(payload.valor, 'valor');
  validators.isString(payload.valor, 'valor');
  validateValor(payload.valor);

  // Validar pagador
  validators.required(payload.pagador, 'pagador');
  validators.isObject(payload.pagador, 'pagador');
  validatePagador(payload.pagador);

  // Validar descricao se presente
  if (payload.descricao) {
    validators.isString(payload.descricao, 'descricao');
    validators.maxLength(payload.descricao, 140, 'descricao');
  }
}

/**
 * Valida idCobr
 * Padrão: ^[a-zA-Z0-9]{1,35}$
 *
 * @private
 * @param {string} idCobr - Identificador da cobrança
 * @throws {ValidationError} Se inválido
 */
function validateIdCobr(idCobr) {
  if (!/^[a-zA-Z0-9]{1,35}$/.test(idCobr)) {
    throw new ValidationError(
      'idCobr must contain only alphanumeric characters (1-35)',
      {
        field: 'idCobr',
        pattern: '^[a-zA-Z0-9]{1,35}$',
        received: idCobr
      }
    );
  }
}

/**
 * Valida valor
 * Padrão: ^\d{1,10}\.\d{2}$
 *
 * @private
 * @param {string} valor - Valor em R$
 * @throws {ValidationError} Se inválido
 */
function validateValor(valor) {
  if (!/^\d{1,10}\.\d{2}$/.test(valor)) {
    throw new ValidationError(
      'valor must be in format "xx.xx" with exactly 2 decimal places',
      {
        field: 'valor',
        pattern: '^\\d{1,10}\\.\\d{2}$',
        received: valor
      }
    );
  }

  const amount = parseFloat(valor);
  if (amount <= 0) {
    throw new ValidationError('valor must be greater than zero', {
      field: 'valor',
      received: valor
    });
  }

  if (amount > 9999999999.99) {
    throw new ValidationError('valor exceeds maximum allowed (9999999999.99)', {
      field: 'valor',
      received: valor
    });
  }
}

/**
 * Valida objeto pagador
 *
 * @private
 * @param {object} pagador - Dados do pagador
 * @throws {ValidationError} Se inválido
 */
function validatePagador(pagador) {
  validators.required(pagador.chave, 'pagador.chave');
  validators.isString(pagador.chave, 'pagador.chave');
  validators.maxLength(pagador.chave, 77, 'pagador.chave');

  // Validar nome se presente
  if (pagador.nome) {
    validators.isString(pagador.nome, 'pagador.nome');
    validators.maxLength(pagador.nome, 200, 'pagador.nome');
  }

  // Validar CPF se presente
  if (pagador.cpf) {
    validateCPF(pagador.cpf, 'pagador.cpf');
  }

  // Validar CNPJ se presente
  if (pagador.cnpj) {
    validateCNPJ(pagador.cnpj, 'pagador.cnpj');
  }
}

/**
 * Valida CPF
 * Padrão: ^\d{11}$
 *
 * @private
 * @param {string} cpf - CPF
 * @param {string} fieldName - Nome do campo para erro
 * @throws {ValidationError} Se inválido
 */
function validateCPF(cpf, fieldName) {
  validators.isString(cpf, fieldName);

  if (!/^\d{11}$/.test(cpf)) {
    throw new ValidationError('CPF must contain exactly 11 digits', {
      field: fieldName,
      pattern: '^\\d{11}$',
      received: cpf
    });
  }
}

/**
 * Valida CNPJ
 * Padrão: ^\d{14}$
 *
 * @private
 * @param {string} cnpj - CNPJ
 * @param {string} fieldName - Nome do campo para erro
 * @throws {ValidationError} Se inválido
 */
function validateCNPJ(cnpj, fieldName) {
  validators.isString(cnpj, fieldName);

  if (!/^\d{14}$/.test(cnpj)) {
    throw new ValidationError('CNPJ must contain exactly 14 digits', {
      field: fieldName,
      pattern: '^\\d{14}$',
      received: cnpj
    });
  }
}

/**
 * Validações específicas para COPIA_COLA
 * Mínimos campos obrigatórios, sem vencimento
 *
 * @private
 * @param {object} payload - Dados da cobrança
 */
function validateCopiaCola(payload) {
  // COPIA_COLA não requer vencimento
  // Apenas campos comuns já validados
}

/**
 * Validações específicas para DINAMICO
 * Obrigatório: vencimento.data (futuro)
 *
 * @private
 * @param {object} payload - Dados da cobrança
 * @throws {ValidationError} Se validação falhar
 */
function validateDinamico(payload) {
  validators.required(payload.vencimento, 'vencimento');
  validators.isObject(payload.vencimento, 'vencimento');

  // Validar data de vencimento
  validators.required(payload.vencimento.data, 'vencimento.data');
  validateVencimentoData(payload.vencimento.data);

  // Validar multa se presente
  if (payload.vencimento.multa !== undefined) {
    validatePercentage(
      payload.vencimento.multa,
      'vencimento.multa',
      0,
      20
    );
  }

  // Validar juros se presente
  if (payload.vencimento.juros !== undefined) {
    validatePercentage(
      payload.vencimento.juros,
      'vencimento.juros',
      0,
      20
    );
  }

  // Validar desconto se presente
  if (payload.vencimento.desconto !== undefined) {
    validatePercentage(
      payload.vencimento.desconto,
      'vencimento.desconto',
      0,
      100
    );
  }
}

/**
 * Valida data de vencimento
 *
 * @private
 * @param {string} data - Data no formato YYYY-MM-DD
 * @throws {ValidationError} Se data é inválida ou no passado
 */
function validateVencimentoData(data) {
  validators.isString(data, 'vencimento.data');

  if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) {
    throw new ValidationError(
      'vencimento.data must be in format YYYY-MM-DD',
      {
        field: 'vencimento.data',
        pattern: '^\\d{4}-\\d{2}-\\d{2}$',
        received: data
      }
    );
  }

  const vencimentoDate = new Date(data);
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  if (vencimentoDate <= today) {
    throw new ValidationError('vencimento.data must be in the future', {
      field: 'vencimento.data',
      received: data,
      today: today.toISOString().split('T')[0]
    });
  }
}

/**
 * Valida percentual (multa, juros, desconto)
 *
 * @private
 * @param {number} value - Valor a validar
 * @param {string} fieldName - Nome do campo
 * @param {number} min - Mínimo
 * @param {number} max - Máximo
 * @throws {ValidationError} Se inválido
 */
function validatePercentage(value, fieldName, min, max) {
  if (typeof value !== 'number') {
    throw new ValidationError(`${fieldName} must be a number`, {
      field: fieldName,
      received: typeof value
    });
  }

  if (value < min || value > max) {
    throw new ValidationError(
      `${fieldName} must be between ${min} and ${max}`,
      {
        field: fieldName,
        min,
        max,
        received: value
      }
    );
  }
}

/**
 * Validações específicas para LINK
 * Similar a DINAMICO (vencimento recomendado mas opcional)
 *
 * @private
 * @param {object} payload - Dados da cobrança
 */
function validateLink(payload) {
  // LINK é similar a DINAMICO mas vencimento é opcional
  if (payload.vencimento) {
    validators.isObject(payload.vencimento, 'vencimento');
    if (payload.vencimento.data) {
      validateVencimentoData(payload.vencimento.data);
    }
  }
}

/**
 * Validações específicas para MANUAL
 * Similar a COPIA_COLA (sem vencimento)
 *
 * @private
 * @param {object} payload - Dados da cobrança
 */
function validateManual(payload) {
  // MANUAL não requer vencimento
  // Apenas campos comuns já validados
}

module.exports = {
  validatePixCharge,
  validateCommon,
  validateIdCobr,
  validateValor,
  validatePagador,
  validateCPF,
  validateCNPJ,
  validateDinamico,
  validateLink,
  validateCopiaCola,
  validateManual,
  validateVencimentoData,
  validatePercentage
};
