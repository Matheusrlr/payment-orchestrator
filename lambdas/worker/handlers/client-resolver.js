/**
 * Resolvedor de URLs de Callback de Cliente
 * Localiza e retorna URL de callback para entregar webhook
 */

const logger = require('../../../shared/utils/logger');

/**
 * Obtém URL de callback do cliente para receber webhook
 * 
 * Em produção, isso deveria consultar um banco de dados ou cache
 * para encontrar a URL de callback registrada pelo cliente
 * 
 * @param {string} gateway - Nome do gateway
 * @param {Object} payload - Payload do webhook (para extrair metadados)
 * @returns {Promise<string|null>} URL de callback ou null se não encontrada
 */
async function getClientCallbackUrl(gateway, payload) {
  try {
    // 1. Extrair identificador do cliente (ex: customerId, clientId)
    const clientId = extractClientIdFromPayload(gateway, payload);

    if (!clientId) {
      logger.warn('Could not extract client ID from webhook', {
        gateway
      });
      return null;
    }

    // 2. Buscar URL de callback registrada
    // Em produção: consultar DynamoDB, Redis, ou API
    const callbackUrl = await lookupCallbackUrl(clientId, gateway);

    if (!callbackUrl) {
      logger.warn('No callback URL registered for client', {
        clientId,
        gateway
      });
      return null;
    }

    return callbackUrl;
  } catch (error) {
    logger.error('Failed to resolve callback URL', {
      gateway,
      error
    });
    throw error;
  }
}

/**
 * Extrai ID do cliente do payload do webhook
 * 
 * @private
 * @param {string} gateway - Nome do gateway
 * @param {Object} payload - Payload do webhook
 * @returns {string|null} ID do cliente ou null
 */
function extractClientIdFromPayload(gateway, payload) {
  switch (gateway) {
    case 'efi':
      // EFI: extrair do txid ou metadata
      return payload.pix?.[0]?.clientId || payload.clientId || null;

    case 'stripe':
      // Stripe: extrair de metadata ou description
      return payload.data?.object?.metadata?.clientId ||
             payload.data?.object?.description?.match(/client_(\w+)/)?.[1] ||
             null;

    default:
      return null;
  }
}

/**
 * Busca URL de callback registrada para um cliente
 * 
 * IMPLEMENTAÇÃO STUB: Em produção, seria consultado um banco de dados
 * 
 * @private
 * @param {string} clientId - ID do cliente
 * @param {string} gateway - Nome do gateway
 * @returns {Promise<string|null>} URL de callback
 */
async function lookupCallbackUrl(clientId, gateway) {
  // Stub: Implementar consulta ao banco de dados
  // Exemplo:
  // const client = await dynamodb.getClient(clientId);
  // return client?.webhookUrl || null;

  logger.debug('Looking up callback URL', {
    clientId,
    gateway
  });

  // Para este exemplo, simular lookup
  // Em produção, seria consultado DynamoDB ou cache Redis
  try {
    // Simular busca em database
    // Exemplo: clients[clientId]?.callbackUrls[gateway]
    return null; // Stub
  } catch (error) {
    logger.error('Failed to lookup callback URL in database', {
      clientId,
      error
    });
    throw error;
  }
}

module.exports = { getClientCallbackUrl };
