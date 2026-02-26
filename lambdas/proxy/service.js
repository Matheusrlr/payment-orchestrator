/**
 * Serviço de Processamento de Pagamentos
 * 
 * Responsável por:
 * 1. Orquestração do fluxo de pagamento
 * 2. Validação de entrada
 * 3. Verificação de idempotência
 * 4. Roteirização para gateways
 * 5. Normalização de respostas
 */

const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, GetCommand, PutCommand } = require('@aws-sdk/lib-dynamodb');

const logger = require('../../shared/utils/logger');
const validators = require('../../shared/utils/validators');
const { ValidationError, IdempotencyError } = require('../../shared/utils/errors');
const { GATEWAY_NAMES, isValidGateway } = require('../../shared/constants/payment-gateways');

const { validatePaymentRequest } = require('./validators/payment-validator');
const { getGatewayHandler } = require('./handlers/gateway-handler');
const { normalizeGatewayResponse } = require('./handlers/response-normalizer');

const ddbDocClient = DynamoDBDocumentClient.from(new DynamoDBClient({}));

const IDEMPOTENCY_TTL_SECONDS = 24 * 60 * 60; // 24 horas

/**
 * Processa uma requisição de pagamento
 * 
 * @param {Object} event - Evento da API Gateway
 * @returns {Promise<Object>} Resposta HTTP estruturada
 * @throws {ValidationError} Se validação falhar
 * @throws {IdempotencyError} Se houver conflito de idempotência
 */
async function processPayment(event) {
  // 1. Extrair e validar entrada
  const { idempotencyKey, tenantId, gateway, payload } = extractAndValidateInput(event);

  // 2. Verificar idempotência
  const cachedResponse = await checkIdempotency(tenantId, idempotencyKey);
  if (cachedResponse) {
    logger.info('Request fulfilled from cache', {
      tenantId,
      idempotencyKey
    });
    return {
      statusCode: 200,
      body: JSON.stringify(cachedResponse),
      headers: { 'Content-Type': 'application/json' }
    };
  }

  // 3. Validar payload do pagamento
  validatePaymentRequest(payload);

  // 4. Processar no gateway
  const gatewayResponse = await processWithGateway(gateway, payload);

  // 5. Normalizar resposta
  const normalizedResponse = normalizeGatewayResponse(gateway, gatewayResponse);

  // 6. Salvar para idempotência
  await saveIdempotencyRecord(tenantId, idempotencyKey, normalizedResponse);

  return {
    statusCode: 201,
    body: JSON.stringify(normalizedResponse),
    headers: { 'Content-Type': 'application/json' }
  };
}

/**
 * Extrai e valida informações de entrada
 * 
 * @private
 * @param {Object} event - Evento da API Gateway
 * @returns {Object} Informações extraídas validadas
 * @throws {ValidationError} Se validação falhar
 */
function extractAndValidateInput(event) {
  // Validar headers
  const idempotencyKey = validators.required(
    event.headers['x-idempotency-key'] || event.headers['X-Idempotency-Key'],
    'Idempotency-Key header'
  );

  // Validar contexto de autorização
  const authorizer = event.requestContext?.authorizer;
  if (!authorizer) {
    throw new ValidationError('Authorization context missing', {
      field: 'requestContext.authorizer'
    });
  }

  const tenantId = validators.required(
    authorizer.tenantId,
    'Tenant ID'
  );

  const gateway = validators.required(
    authorizer.activeGateway,
    'Active Gateway'
  );

  if (!isValidGateway(gateway)) {
    throw new ValidationError(`Invalid gateway: ${gateway}`, {
      field: 'activeGateway',
      allowed: Object.values(GATEWAY_NAMES)
    });
  }

  // Validar body
  let payload;
  try {
    const body = validators.required(event.body, 'Request body');
    payload = JSON.parse(body);
  } catch (error) {
    throw new ValidationError('Invalid JSON in request body', {
      error: error.message
    });
  }

  return { idempotencyKey, tenantId, gateway, payload };
}

/**
 * Verifica se requisição já foi processada (idempotência)
 * 
 * @private
 * @param {string} tenantId - ID do tenant
 * @param {string} idempotencyKey - Chave de idempotência
 * @returns {Promise<Object|null>} Resposta em cache ou null
 */
async function checkIdempotency(tenantId, idempotencyKey) {
  try {
    const result = await ddbDocClient.send(new GetCommand({
      TableName: getIdempotencyTable(),
      Key: createIdempotencyKey(tenantId, idempotencyKey)
    }));

    if (result.Item?.response) {
      return JSON.parse(result.Item.response);
    }
    return null;
  } catch (error) {
    logger.error('Failed to check idempotency', {
      tenantId,
      error
    });
    throw error;
  }
}

/**
 * Processa pagamento com o gateway apropriado
 * 
 * @private
 * @param {string} gateway - Nome do gateway
 * @param {Object} payload - Dados do pagamento
 * @returns {Promise<Object>} Resposta do gateway
 */
async function processWithGateway(gateway, payload) {
  const handler = getGatewayHandler(gateway);
  return handler.processPayment(payload);
}

/**
 * Salva resultado da requisição para reutilização
 * 
 * @private
 * @param {string} tenantId - ID do tenant
 * @param {string} idempotencyKey - Chave de idempotência
 * @param {Object} response - Resposta a armazenar
 */
async function saveIdempotencyRecord(tenantId, idempotencyKey, response) {
  try {
    await ddbDocClient.send(new PutCommand({
      TableName: getIdempotencyTable(),
      Item: {
        ...createIdempotencyKey(tenantId, idempotencyKey),
        response: JSON.stringify(response),
        ttl: getCurrentTimestamp() + IDEMPOTENCY_TTL_SECONDS
      }
    }));
  } catch (error) {
    logger.error('Failed to save idempotency record', {
      tenantId,
      error
    });
    throw error;
  }
}

/**
 * Cria chave primária para tabela de idempotência
 * 
 * @private
 * @param {string} tenantId - ID do tenant
 * @param {string} idempotencyKey - Chave fornecida pelo cliente
 * @returns {Object} Objeto com pk e sk
 */
function createIdempotencyKey(tenantId, idempotencyKey) {
  return {
    pk: `TENANT#${tenantId}`,
    sk: `IDEM#${idempotencyKey}`
  };
}

/**
 * Obtém nome da tabela de idempotência
 * 
 * @private
 * @returns {string} Nome da tabela
 * @throws {Error} Se variável de ambiente não está definida
 */
function getIdempotencyTable() {
  const tableName = process.env.IDEMPOTENCY_TABLE;
  if (!tableName) {
    throw new Error('IDEMPOTENCY_TABLE environment variable is not set');
  }
  return tableName;
}

/**
 * Obtém timestamp atual em segundos
 * 
 * @private
 * @returns {number}
 */
function getCurrentTimestamp() {
  return Math.floor(Date.now() / 1000);
}

module.exports = { processPayment };
