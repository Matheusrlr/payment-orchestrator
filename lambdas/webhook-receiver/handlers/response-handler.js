/**
 * Handler de Respostas HTTP para Webhook Receiver
 */

const { PaymentError } = require('../../../shared/utils/errors');

const CONTENT_TYPE = 'application/json';

/**
 * Cria resposta de sucesso (202 Accepted)
 * Webhook foi recebido e enfileirado
 * 
 * @param {Object} data - Dados a retornar
 * @returns {Object} Resposta formatada para Lambda
 */
function createSuccessResponse(data = {}) {
  return {
    statusCode: 202,
    body: JSON.stringify({
      message: 'Webhook accepted for processing',
      ...data
    }),
    headers: { 'Content-Type': CONTENT_TYPE }
  };
}

/**
 * Cria resposta de erro
 * 
 * @param {Error} error - Objeto de erro
 * @returns {Object} Resposta de erro formatada
 */
function createErrorResponse(error) {
  if (error instanceof PaymentError) {
    return {
      statusCode: error.statusCode,
      body: JSON.stringify(error.toJSON()),
      headers: { 'Content-Type': CONTENT_TYPE }
    };
  }

  // Erro genérico
  return {
    statusCode: 500,
    body: JSON.stringify({
      error: 'InternalServerError',
      message: 'An unexpected error occurred processing webhook',
      code: 'INTERNAL_ERROR'
    }),
    headers: { 'Content-Type': CONTENT_TYPE }
  };
}

module.exports = {
  createSuccessResponse,
  createErrorResponse
};
