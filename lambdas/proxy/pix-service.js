/**
 * Serviço de Envio de Pix
 * 
 * Responsável por:
 * 1. Validação de entrada para envio de PIX
 * 2. Roteirização para gateway EFI
 * 3. Normalização de respostas
 * 4. Logging e rastreamento
 */

const logger = require('../../shared/utils/logger');
const validators = require('../../shared/utils/validators');
const { ValidationError } = require('../../shared/utils/errors');
const { getEFIPixHandler } = require('./handlers/efi-pix-handler');
const { validatePixSendRequest, validateIdEnvio } = require('../../shared/utils/pix-validators');

/**
 * Processa requisição de envio de Pix
 * 
 * @param {Object} event - Evento da API Gateway
 * @returns {Promise<Object>} Resposta HTTP estruturada
 * @throws {ValidationError} Se validação falhar
 */
async function sendPix(event) {
  try {
    // 1. Extrair e validar entrada
    const { idEnvio, gateway, payload, tenantId } = extractAndValidateInput(event);
    
    // 2. Validar payload do Pix
    validatePixSendRequest(payload);
    validateIdEnvio(idEnvio);

    logger.info('Processing Pix send request', {
      tenantId,
      gateway,
      idEnvio,
      valor: payload.valor
    });

    // 3. Roteirizar para gateway (por enquanto, apenas EFI suporta)
    let gatewayResponse;
    if (gateway === 'efi') {
      const handler = getEFIPixHandler();
      gatewayResponse = await handler.sendPix(idEnvio, payload);
    } else {
      throw new ValidationError(`Gateway ${gateway} does not support Pix send operations`, {
        field: 'gateway'
      });
    }

    // 4. Normalizar resposta
    const normalizedResponse = normalizePixResponse(gateway, gatewayResponse);

    logger.info('Pix send request processed successfully', {
      tenantId,
      gateway,
      idEnvio,
      status: normalizedResponse.status
    });

    return {
      statusCode: 202,
      body: JSON.stringify(normalizedResponse),
      headers: { 'Content-Type': 'application/json' }
    };
  } catch (error) {
    logger.error('Pix send request failed', {
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
 * Consulta status de envio de Pix
 * 
 * @param {Object} event - Evento da API Gateway
 * @returns {Promise<Object>} Resposta HTTP estruturada
 */
async function getPixStatus(event) {
  try {
    const { idEnvio, gateway, tenantId } = extractAndValidateInput(event);
    
    validateIdEnvio(idEnvio);

    logger.info('Processing Pix status request', {
      tenantId,
      gateway,
      idEnvio
    });

    // Consultar status no gateway
    let gatewayResponse;
    if (gateway === 'efi') {
      const handler = getEFIPixHandler();
      gatewayResponse = await handler.getPixStatus(idEnvio);
    } else {
      throw new ValidationError(`Gateway ${gateway} does not support Pix status operations`, {
        field: 'gateway'
      });
    }

    const normalizedResponse = normalizePixResponse(gateway, gatewayResponse);

    logger.info('Pix status request processed successfully', {
      tenantId,
      gateway,
      idEnvio,
      status: normalizedResponse.status
    });

    return {
      statusCode: 200,
      body: JSON.stringify(normalizedResponse),
      headers: { 'Content-Type': 'application/json' }
    };
  } catch (error) {
    logger.error('Pix status request failed', {
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
  // Extrair idEnvio do pathParameters
  const idEnvio = validators.required(
    event.pathParameters?.idEnvio,
    'idEnvio path parameter'
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

  const gateway = authorizer.activeGateway || 'efi'; // Default para EFI

  // Validar body para operações POST/PUT
  let payload = null;
  if (event.body && ['POST', 'PUT'].includes(event.requestContext?.httpMethod || event.httpMethod)) {
    try {
      const body = validators.required(event.body, 'Request body');
      payload = JSON.parse(body);
    } catch (error) {
      throw new ValidationError('Invalid JSON in request body', {
        error: error.message
      });
    }
  }

  return { idEnvio, gateway, payload, tenantId };
}

/**
 * Normaliza resposta de Pix conforme o gateway
 * 
 * @private
 * @param {string} gateway - Nome do gateway
 * @param {Object} response - Resposta do gateway
 * @returns {Object} Resposta normalizada
 */
function normalizePixResponse(gateway, response) {
  // Para EFI, a resposta já está no formato esperado
  if (gateway === 'efi') {
    return {
      id: response.id,
      status: response.status,
      valor: response.valor,
      pagador: response.pagador,
      favorecido: response.favorecido,
      createdAt: response.createdAt,
      updatedAt: response.updatedAt,
      gateway: 'efi'
    };
  }

  // Para outros gateways, retornar como está
  return response;
}

module.exports = { 
  sendPix, 
  getPixStatus 
};
