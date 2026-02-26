/**
 * Serviço de Processamento de Webhooks
 * Processa webhooks recebidos e os entrega aos clientes
 */

const axios = require('axios');

const logger = require('../../shared/utils/logger');
const { normalizeWebhookFromGateway } = require('./handlers/webhook-normalizer');
const { getClientCallbackUrl } = require('./handlers/client-resolver');

const DELIVERY_TIMEOUT_MS = 5000;
const MAX_RETRIES = 3;

/**
 * Processa um registro de webhook da fila SQS
 * 
 * @param {Object} record - Registro SQS com webhook
 * @throws {Error} Se falha na entrega e deve fazer retry
 */
async function processWebhookRecord(record) {
  try {
    // 1. Parsear mensagem
    const { gateway, payload, receivedAt } = JSON.parse(record.body);

    logger.debug('Processing webhook record', {
      messageId: record.messageId,
      gateway,
      receivedAt
    });

    // 2. Normalizar webhook
    const normalizedData = normalizeWebhookFromGateway(gateway, payload);

    // 3. Obter URL de callback do cliente
    const callbackUrl = await getClientCallbackUrl(gateway, payload);

    if (!callbackUrl) {
      logger.warn('No callback URL found for gateway', {
        gateway,
        messageId: record.messageId
      });
      return;
    }

    // 4. Entregar webhook ao cliente
    await deliverWebhook(callbackUrl, normalizedData, gateway);

    logger.info('Webhook delivered successfully', {
      messageId: record.messageId,
      gateway,
      deliveryUrl: maskSensitiveUrl(callbackUrl)
    });
  } catch (error) {
    logger.error('Failed to process webhook record', {
      messageId: record.messageId,
      error
    });
    throw error;
  }
}

/**
 * Entrega webhook ao cliente com retry
 * 
 * @private
 * @param {string} url - URL de callback do cliente
 * @param {Object} data - Dados do webhook normalizado
 * @param {string} gateway - Nome do gateway
 * @throws {Error} Se falha após retries
 */
async function deliverWebhook(url, data, gateway) {
  let lastError;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const startTime = Date.now();

      const response = await axios.post(url, data, {
        timeout: DELIVERY_TIMEOUT_MS,
        headers: {
          'Content-Type': 'application/json',
          'X-Webhook-Source': gateway
        }
      });

      const duration = Date.now() - startTime;

      logger.info('Webhook delivered to client', {
        gateway,
        statusCode: response.status,
        deliveryTimeMs: duration
      });

      return;
    } catch (error) {
      lastError = error;

      logger.warn('Webhook delivery attempt failed', {
        gateway,
        attempt,
        maxRetries: MAX_RETRIES,
        error: error.message
      });

      // Só fazer retry se erro for temporário
      if (!isRetryableError(error) || attempt === MAX_RETRIES) {
        break;
      }

      // Aguardar antes de tentar novamente (backoff exponencial)
      await sleep(Math.pow(2, attempt) * 1000);
    }
  }

  // Falha após todos os retries
  throw new Error(
    `Failed to deliver webhook to ${url} after ${MAX_RETRIES} attempts: ${lastError.message}`
  );
}

/**
 * Verifica se erro é temporário e pode fazer retry
 * 
 * @private
 * @param {Error} error - Erro a avaliar
 * @returns {boolean} true se deve fazer retry
 */
function isRetryableError(error) {
  // Erros de conexão e timeout são retentáveis
  if (error.code === 'ECONNREFUSED' ||
      error.code === 'ETIMEDOUT' ||
      error.code === 'ECONNABORTED') {
    return true;
  }

  // Erros 5xx são retentáveis
  if (error.response?.status >= 500 && error.response?.status < 600) {
    return true;
  }

  // Erro 429 (Rate Limited) é retentável
  if (error.response?.status === 429) {
    return true;
  }

  return false;
}

/**
 * Aguarda por tempo específico
 * 
 * @private
 * @param {number} ms - Milissegundos a aguardar
 * @returns {Promise<void>}
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Mascara URL para não expor segredos em logs
 * 
 * @private
 * @param {string} url - URL a mascarar
 * @returns {string} URL com segredos mascarados
 */
function maskSensitiveUrl(url) {
  try {
    const parsed = new URL(url);
    if (parsed.password) {
      parsed.password = '***';
    }
    return parsed.toString();
  } catch {
    return url.replace(/([&?][^=]*=)[^&]*/g, '$1***');
  }
}

module.exports = { processWebhookRecord };
