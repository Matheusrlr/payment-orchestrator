/**
 * Webhook Worker Lambda
 * 
 * Consome webhooks da fila SQS e os entrega aos clientes
 * Implementa retry automático e tratamento de erro robusto
 */

const workerService = require('./service');
const logger = require('../../shared/utils/logger');

/**
 * AWS Lambda handler para processamento de webhooks da fila
 * 
 * @param {Object} event - Evento SQS com registros de mensagens
 * @param {Object} context - Contexto da Lambda
 * @returns {Promise<Object>} Resposta com status de cada mensagem
 */
exports.handler = async (event, context) => {
  logger.debug('Worker processing batch', {
    recordCount: event.Records.length,
    requestId: context.requestId
  });

  // Processar cada mensagem da fila
  const batchItemFailures = [];

  for (const record of event.Records) {
    try {
      await workerService.processWebhookRecord(record);
      logger.debug('Webhook processed successfully', {
        messageId: record.messageId
      });
    } catch (error) {
      logger.error('Failed to process webhook', {
        messageId: record.messageId,
        error
      });
      // Marcar para retry (SQS fará retry automático)
      batchItemFailures.push({
        itemId: record.messageId
      });
    }
  }

  logger.info('Batch processing complete', {
    requestId: context.requestId,
    totalRecords: event.Records.length,
    failedRecords: batchItemFailures.length
  });

  // Retornar falhas para SQS fazer retry
  return { batchItemFailures };
};

