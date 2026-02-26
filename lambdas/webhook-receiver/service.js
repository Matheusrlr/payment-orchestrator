/**
 * Serviço de Webhook
 * Processa webhooks recebidos dos gateways
 */

const { SQSClient, SendMessageCommand } = require('@aws-sdk/client-sqs');

const logger = require('../../shared/utils/logger');
const validators = require('../../shared/utils/validators');
const { ValidationError, GatewayError } = require('../../shared/utils/errors');
const { isValidGateway } = require('../../shared/constants/payment-gateways');

const sqs = new SQSClient({});

/**
 * Processa webhook recebido de gateway de pagamento
 * 
 * @param {Object} event - Evento da API Gateway
 * @returns {Promise<Object>} Resposta HTTP estruturada
 * @throws {ValidationError} Se validação falhar
 * @throws {GatewayError} Se erro ao enfileirar
 */
async function processWebhook(event) {
  // 1. Extrair e validar entrada
  const { gateway, payload } = extractAndValidateWebhook(event);

  // 2. Enfileirar para processamento assíncrono
  await queueWebhook(gateway, payload);

  return {
    statusCode: 202,
    body: JSON.stringify({
      message: 'Webhook received and queued for processing'
    }),
    headers: { 'Content-Type': 'application/json' }
  };
}

/**
 * Extrai e valida informações do webhook
 * 
 * @private
 * @param {Object} event - Evento da API Gateway
 * @returns {Object} Gateway e payload validados
 * @throws {ValidationError} Se validação falhar
 */
function extractAndValidateWebhook(event) {
  // Extrair gateway da URL
  const gateway = validators.required(
    event.pathParameters?.gateway,
    'Gateway in URL path'
  );

  if (!isValidGateway(gateway)) {
    throw new ValidationError(`Invalid gateway: ${gateway}`, {
      field: 'gateway',
      received: gateway
    });
  }

  // Validar e parsear body
  let payload;
  try {
    const body = validators.required(event.body, 'Request body');
    payload = JSON.parse(body);
  } catch (error) {
    throw new ValidationError('Invalid JSON in webhook body', {
      error: error.message
    });
  }

  // Validar payload não está vazio
  if (!payload || Object.keys(payload).length === 0) {
    throw new ValidationError('Webhook payload is empty');
  }

  return { gateway, payload };
}

/**
 * Enfileira webhook para processamento
 * 
 * @private
 * @param {string} gateway - Nome do gateway
 * @param {Object} payload - Dados do webhook
 * @throws {GatewayError} Se erro ao enviar para SQS
 */
async function queueWebhook(gateway, payload) {
  try {
    const message = {
      gateway,
      payload,
      receivedAt: new Date().toISOString()
    };

    logger.debug('Queuing webhook', {
      gateway,
      messageSize: JSON.stringify(message).length
    });

    await sqs.send(new SendMessageCommand({
      QueueUrl: getWebhookQueueUrl(),
      MessageBody: JSON.stringify(message),
      MessageAttributes: {
        Gateway: {
          StringValue: gateway,
          DataType: 'String'
        }
      }
    }));

    logger.info('Webhook queued', { gateway });
  } catch (error) {
    logger.error('Failed to queue webhook', {
      gateway,
      error
    });

    throw new GatewayError(
      `Failed to queue webhook for ${gateway}`,
      gateway,
      error
    );
  }
}

/**
 * Obtém URL da fila de webhooks
 * 
 * @private
 * @returns {string} URL da fila SQS
 * @throws {Error} Se variável de ambiente não está definida
 */
function getWebhookQueueUrl() {
  const queueUrl = process.env.WEBHOOK_QUEUE_URL;
  if (!queueUrl) {
    throw new Error('WEBHOOK_QUEUE_URL environment variable is not set');
  }
  return queueUrl;
}

module.exports = { processWebhook };
