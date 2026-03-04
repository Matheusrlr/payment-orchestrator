/**
 * Serviço de Cobrança Pix
 *
 * Responsável por:
 * 1. Validação de entrada
 * 2. Verificação de idempotência
 * 3. Roteirização para gateway
 * 4. Normalização de respostas
 * 5. Logging e rastreamento
 */

const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, GetCommand, PutCommand } = require('@aws-sdk/lib-dynamodb');

const logger = require('../../shared/utils/logger');
const validators = require('../../shared/utils/validators');
const { ValidationError, IdempotencyError } = require('../../shared/utils/errors');
const { getEFIPixChargeHandler } = require('./handlers/pix-charge-handler');
const { normalizeGatewayResponse } = require('./handlers/response-normalizer');
const pixChargeValidators = require('../../shared/utils/pix-charge-validators');
const circuitBreaker = require('../../shared/utils/circuit-breaker');

const ddbDocClient = DynamoDBDocumentClient.from(new DynamoDBClient({}));

const IDEMPOTENCY_TTL_SECONDS = 24 * 60 * 60; // 24 horas

/**
 * Processa requisição de cobrança Pix
 *
 * @param {Object} event - Evento da API Gateway
 * @returns {Promise<Object>} Resposta HTTP estruturada
 * @throws {ValidationError} Se validação falhar
 */
async function createPixCharge(event) {
  try {
    // 1. Extrair e validar entrada
    const { idempotencyKey, tenantId, gateway, payload } = extractAndValidateInput(event);
    const { idCobr, modalidade = 'COPIA_COLA' } = payload;

    logger.info('Processing Pix charge request', {
      tenantId,
      gateway,
      idCobr,
      modalidade,
      valor: payload.valor
    });

    // Determinar se deve pular idempotência (para testes/local)
    const skipIdempotency = process.env.SKIP_IDEMPOTENCY === 'true' || process.env.SKIP_IDEMPOTENCY === true;

    // 2. Verificar idempotência
    const cachedResponse = skipIdempotency ? null : await checkIdempotency(tenantId, idempotencyKey);
    if (cachedResponse) {
        logger.info('Request fulfilled from cache', {
          tenantId,
          idempotencyKey,
          idCobr
        });
        return {
          statusCode: 201,
          body: JSON.stringify(cachedResponse),
          headers: { 'Content-Type': 'application/json' }
        };
    }

    if (skipIdempotency) {
    }

    // 3. Validar payload da cobrança
    pixChargeValidators.validatePixCharge(modalidade, payload);

    // 4. Verificar circuit breaker (Pix não tem fallback)
    const isEfiOpen = await circuitBreaker.isOpen('efi');
    if (isEfiOpen) {
      logger.warn('Efí circuit breaker is open, no fallback for Pix', { idCobr });
      return {
        statusCode: 503,
        body: JSON.stringify({
          error: 'CIRCUIT_BREAKER_OPEN',
          message: 'Efí gateway temporarily unavailable. No fallback for Pix.'
        }),
        headers: { 'Content-Type': 'application/json' }
      };
    }

    // 5. Processar no gateway
    const handler = getEFIPixChargeHandler();
    const gatewayResponse = await handler.createCharge(modalidade, payload);

    // 6. Normalizar resposta
    const normalizedResponse = normalizeGatewayResponse(gateway, gatewayResponse, 'pix_charge');

    // 7. Salvar para idempotência
    if (!skipIdempotency) {
      await saveIdempotencyRecord(tenantId, idempotencyKey, normalizedResponse);
    }

    logger.info('Pix charge created successfully', {
      tenantId,
      idCobr,
      gateway,
      status: normalizedResponse.status
    });

    return {
      statusCode: 201,
      body: JSON.stringify(normalizedResponse),
      headers: { 'Content-Type': 'application/json' }
    };
  } catch (error) {
    logger.error('Pix charge creation failed', {
      error: error.message,
      type: error.name
    });

    return {
      statusCode: error.statusCode || 400,
      body: JSON.stringify({
        error: error.name,
        message: error.message,
        details: error.details || {}
      }),
      headers: { 'Content-Type': 'application/json' }
    };
  }
}

/**
 * Consulta status de cobrança Pix
 *
 * @param {Object} event - Evento da API Gateway
 * @returns {Promise<Object>} Resposta HTTP estruturada
 */
async function getPixChargeStatus(event) {
  try {
    const { idCobr, gateway, tenantId } = extractAndValidateInput(event);

    logger.info('Processing Pix charge status request', {
      tenantId,
      gateway,
      idCobr
    });

    // Consultar status no gateway
    const handler = getEFIPixChargeHandler();
    const gatewayResponse = await handler.getChargeStatus(idCobr);

    const normalizedResponse = normalizeGatewayResponse(gateway, gatewayResponse, 'pix_charge');

    logger.info('Pix charge status retrieved', {
      tenantId,
      idCobr,
      status: normalizedResponse.status
    });

    return {
      statusCode: 200,
      body: JSON.stringify(normalizedResponse),
      headers: { 'Content-Type': 'application/json' }
    };
  } catch (error) {
    logger.error('Pix charge status request failed', {
      error: error.message,
      type: error.name
    });

    return {
      statusCode: error.statusCode || 400,
      body: JSON.stringify({
        error: error.name,
        message: error.message,
        details: error.details || {}
      }),
      headers: { 'Content-Type': 'application/json' }
    };
  }
}

/**
 * Cancela cobrança Pix (apenas DINAMICO)
 *
 * @param {Object} event - Evento da API Gateway
 * @returns {Promise<Object>} Resposta HTTP estruturada
 */
async function cancelPixCharge(event) {
  try {
    const { idCobr, gateway, tenantId } = extractAndValidateInput(event);

    logger.info('Processing Pix charge cancellation', {
      tenantId,
      gateway,
      idCobr
    });

    const handler = getEFIPixChargeHandler();
    const gatewayResponse = await handler.cancelCharge(idCobr);

    const normalizedResponse = normalizeGatewayResponse(gateway, gatewayResponse, 'pix_charge');

    logger.info('Pix charge canceled', {
      tenantId,
      idCobr,
      status: normalizedResponse.status
    });

    return {
      statusCode: 200,
      body: JSON.stringify(normalizedResponse),
      headers: { 'Content-Type': 'application/json' }
    };
  } catch (error) {
    logger.error('Pix charge cancellation failed', {
      error: error.message,
      type: error.name
    });

    return {
      statusCode: error.statusCode || 400,
      body: JSON.stringify({
        error: error.name,
        message: error.message,
        details: error.details || {}
      }),
      headers: { 'Content-Type': 'application/json' }
    };
  }
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
  // Extrair idempotência key dos headers
  const idempotencyKey = validators.required(
    event.headers['x-idempotency-key'] || event.headers['X-Idempotency-Key'],
    'Idempotency-Key header'
  );

  // Extrair idCobr do pathParameters
  const idCobr = validators.required(
    event.pathParameters?.idCobr,
    'idCobr path parameter'
  );

  // Validar contexto de autorização
  const authorizer = event.requestContext?.authorizer;
  if (!authorizer) {
    throw new ValidationError('Authorization context missing', {
      field: 'requestContext.authorizer'
    });
  }

  const tenantId = validators.required(authorizer.tenantId, 'Tenant ID');

  const gateway = authorizer.activeGateway || 'efi'; // Default para EFI

  // Extrair body para create (POST)
  const extractPayload = () => {
    if (event.body && event.httpMethod === 'POST') {
      try {
        const body = validators.required(event.body, 'Request body');
        return JSON.parse(body);
      } catch (error) {
        throw new ValidationError('Invalid JSON in request body', {
          error: error.message
        });
      }
    }
    return null;
  };
  const payload = extractPayload();

  return { idempotencyKey, tenantId, gateway, payload, idCobr };
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
    const result = await ddbDocClient.send(
      new GetCommand({
        TableName: getIdempotencyTable(),
        Key: createIdempotencyKey(tenantId, idempotencyKey)
      })
    );

    if (result.Item?.response) {
      return JSON.parse(result.Item.response);
    }
    return null;
  } catch (error) {
    logger.error('Failed to check idempotency', {
      tenantId,
      error: error.message
    });
    throw error;
  }
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
  if (process.env.SKIP_IDEMPOTENCY === 'true') {
    logger.debug('Skipping save idempotency record (local mode)');
    return;
  }

  try {
    await ddbDocClient.send(
      new PutCommand({
        TableName: getIdempotencyTable(),
        Item: {
          ...createIdempotencyKey(tenantId, idempotencyKey),
          response: JSON.stringify(response),
          ttl: getCurrentTimestamp() + IDEMPOTENCY_TTL_SECONDS
        }
      })
    );
  } catch (error) {
    logger.error('Failed to save idempotency record', {
      tenantId,
      error: error.message
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

module.exports = {
  createPixCharge,
  getPixChargeStatus,
  cancelPixCharge
};
