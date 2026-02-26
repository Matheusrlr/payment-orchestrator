/**
 * Handler de Respostas HTTP
 * Padroniza formação de respostas para Lambda
 */

const { PaymentError, ValidationError } = require('../../../shared/utils/errors');

const CONTENT_TYPE = 'application/json';

/**
 * Cria resposta de sucesso
 * 
 * @param {Object} data - Dados a retornar
 * @param {number} statusCode - Status HTTP (padrão 200)
 * @returns {Object} Resposta formatada para Lambda
 */
function createSuccessResponse(data, statusCode = 200) {
  return {
    statusCode,
    body: JSON.stringify(data),
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
      message: 'An unexpected error occurred',
      code: 'INTERNAL_ERROR'
    }),
    headers: { 'Content-Type': CONTENT_TYPE }
  };
}

module.exports = {
  createSuccessResponse,
  createErrorResponse
};
