/**
 * Validação de Requisição de Pagamento
 * Valida schema e dados de pagamento
 */

const validators = require('../../../shared/utils/validators');

/**
 * Valida estrutura e conteúdo de requisição de pagamento
 * 
 * @param {Object} payload - Payload de pagamento
 * @throws {ValidationError} Se validação falhar
 */
function validatePaymentRequest(payload) {
  validators.isObject(payload, 'Payment payload');

  // Validar campos obrigatórios
  validators.required(payload.amount, 'amount');
  validators.required(payload.currency, 'currency');
  validators.required(payload.description, 'description');

  // Validar tipos e valores
  validators.isNumber(payload.amount, 'amount');
  validators.inRange(payload.amount, 0.01, 999999.99, 'amount');

  validators.isString(payload.currency, 'currency');
  validators.isOneOf(payload.currency, ['BRL', 'USD', 'EUR'], 'currency');

  validators.isString(payload.description, 'description');
  validators.minLength(payload.description, 1, 'description');
  validators.maxLength(payload.description, 255, 'description');

  // Validar campos opcionais se presentes
  if (payload.customerId) {
    validators.isString(payload.customerId, 'customerId');
  }

  if (payload.metadata) {
    validators.isObject(payload.metadata, 'metadata');
  }
}

module.exports = { validatePaymentRequest };
