/**
 * Payment Proxy Lambda Handler
 * 
 * Responsabilidades:
 * 1. Validar request
 * 2. Verificar idempotência
 * 3. Rotear para gateway apropriado
 * 4. Retornar resposta normalizada
 * 
 * Este arquivo contém APENAS o handler Lambda
 * Lógica de negócio está em service.js
 */

const paymentService = require('./service');
const { createErrorResponse } = require('./handlers/response-handler');
const logger = require('../../shared/utils/logger');

/**
 * AWS Lambda handler para requisições de pagamento
 * 
 * @param {Object} event - Evento da API Gateway
 * @param {Object} context - Contexto da Lambda
 * @returns {Promise<Object>} Resposta HTTP formatada
 */
exports.handler = async (event, context) => {
  const startTime = Date.now();

  try {
    logger.debug('Payment request received', {
      path: event.path,
      method: event.httpMethod,
      requestId: context.requestId
    });

    // Processar pagamento
    const response = await paymentService.processPayment(event);

    const duration = Date.now() - startTime;
    logger.info('Payment processed successfully', {
      requestId: context.requestId,
      statusCode: response.statusCode,
      durationMs: duration
    });

    return response;
  } catch (error) {
    const duration = Date.now() - startTime;
    logger.error('Payment processing failed', {
      requestId: context.requestId,
      error,
      durationMs: duration
    });

    return createErrorResponse(error);
  }
};
