/**
 * Webhook Receiver Lambda
 * 
 * Recebe webhooks de gateways de pagamento e coloca em fila para processamento
 * Valida origem e autentica requisições antes de enfileirar
 */

const webhookService = require('./service');
const { createErrorResponse } = require('./handlers/response-handler');
const logger = require('../../shared/utils/logger');

/**
 * AWS Lambda handler para webhooks de pagamento
 * 
 * @param {Object} event - Evento da API Gateway
 * @param {Object} context - Contexto da Lambda
 * @returns {Promise<Object>} Resposta HTTP formatada
 */
exports.handler = async (event, context) => {
  const startTime = Date.now();

  try {
    logger.debug('Webhook received', {
      path: event.path,
      source: event.headers['x-webhook-source'],
      requestId: context.requestId
    });

    // Processar webhook
    const response = await webhookService.processWebhook(event);

    const duration = Date.now() - startTime;
    logger.info('Webhook queued successfully', {
      requestId: context.requestId,
      statusCode: response.statusCode,
      durationMs: duration
    });

    return response;
  } catch (error) {
    const duration = Date.now() - startTime;
    logger.error('Webhook processing failed', {
      requestId: context.requestId,
      error,
      durationMs: duration
    });

    return createErrorResponse(error);
  }
};

