/**
 * Circuit Breaker para Gateways de Pagamento
 * Monitora falhas e desativa automaticamente gateways problemáticos
 * 
 * Padrão implementado: Circuit Breaker Pattern
 * - Conta falhas em janela de tempo
 * - Abre o circuito quando limite é atingido
 * - Redireciona para gateway alternativo
 */

const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, UpdateCommand, GetCommand } = require('@aws-sdk/lib-dynamodb');
const logger = require('./logger');
const { CircuitBreakerError } = require('./errors');

const client = new DynamoDBClient({});
const ddbDocClient = DynamoDBDocumentClient.from(client);

// Constantes
const FAILURE_THRESHOLD = 5; // Falhas antes de abrir circuito
const MONITOR_WINDOW_SECONDS = 300; // 5 minutos de janela de monitoramento
const TTL_SECONDS = 3600; // 1 hora para expiração do item

/**
 * Registra uma falha para um gateway
 * 
 * @param {string} gatewayName - Nome do gateway (ex: 'efi', 'stripe')
 * @returns {Promise<boolean>} true se circuito deve abrir, false caso contrário
 * @throws {Error} Se houver erro ao atualizar métricas
 */
async function recordFailure(gatewayName) {
  try {
    const timestamp = getCurrentTimestamp();
    const windowKey = calculateWindowKey(timestamp);
    
    // Incrementar contador de falhas
    await incrementFailureCount(gatewayName, windowKey, timestamp);
    
    // Verificar se deve abrir o circuito
    const failureCount = await getFailureCount(gatewayName, windowKey);
    
    if (failureCount >= FAILURE_THRESHOLD) {
      logger.warn('Circuit breaker opening', {
        gateway: gatewayName,
        failureCount,
        threshold: FAILURE_THRESHOLD
      });
      return true;
    }
    
    return false;
  } catch (error) {
    logger.error('Failed to record gateway failure', {
      gateway: gatewayName,
      error
    });
    throw error;
  }
}

/**
 * Obtém o contador de falhas atual para um gateway
 * 
 * @param {string} gatewayName - Nome do gateway
 * @returns {Promise<number>} Número de falhas na janela atual
 */
async function getFailureCount(gatewayName) {
  try {
    const timestamp = getCurrentTimestamp();
    const windowKey = calculateWindowKey(timestamp);
    
    const result = await ddbDocClient.send(new GetCommand({
      TableName: getMetricsTableName(),
      Key: createMetricsKey(gatewayName, windowKey)
    }));
    
    return result.Item?.failures || 0;
  } catch (error) {
    logger.error('Failed to get failure count', {
      gateway: gatewayName,
      error
    });
    throw error;
  }
}

/**
 * Incrementa o contador de falhas no DynamoDB
 * 
 * @private
 * @param {string} gatewayName - Nome do gateway
 * @param {number} windowKey - Chave da janela de tempo
 * @param {number} timestamp - Timestamp atual
 */
async function incrementFailureCount(gatewayName, windowKey, timestamp) {
  await ddbDocClient.send(new UpdateCommand({
    TableName: getMetricsTableName(),
    Key: createMetricsKey(gatewayName, windowKey),
    UpdateExpression: 'SET failures = if_not_exists(failures, :zero) + :one, ttl = :ttl',
    ExpressionAttributeValues: {
      ':one': 1,
      ':zero': 0,
      ':ttl': timestamp + TTL_SECONDS
    }
  }));
}

/**
 * Calcula a chave da janela de tempo baseada no timestamp
 * 
 * @private
 * @param {number} timestamp - Timestamp em segundos
 * @returns {number} Chave da janela
 */
function calculateWindowKey(timestamp) {
  return Math.floor(timestamp / MONITOR_WINDOW_SECONDS);
}

/**
 * Obtém timestamp atual em segundos
 * 
 * @private
 * @returns {number} Timestamp em segundos
 */
function getCurrentTimestamp() {
  return Math.floor(Date.now() / 1000);
}

/**
 * Cria chave de métricas para DynamoDB
 * 
 * @private
 * @param {string} gatewayName - Nome do gateway
 * @param {number} windowKey - Chave da janela
 * @returns {Object} Objeto com pk e sk
 */
function createMetricsKey(gatewayName, windowKey) {
  return {
    pk: `GW#${gatewayName}`,
    sk: `WINDOW#${windowKey}`
  };
}

/**
 * Obtém nome da tabela de métricas
 * 
 * @private
 * @returns {string} Nome da variável de ambiente
 */
function getMetricsTableName() {
  const tableName = process.env.METRICS_TABLE;
  if (!tableName) {
    throw new Error('METRICS_TABLE environment variable is not set');
  }
  return tableName;
}

module.exports = {
  recordFailure,
  getFailureCount
};
