/**
 * Normalizador de Webhooks
 * Converte webhooks de diferentes gateways para formato padrão
 */

const logger = require('../../../shared/utils/logger');
const { ValidationError } = require('../../../shared/utils/errors');

/**
 * Normaliza webhook recebido para formato padrão interno
 * 
 * @param {string} gateway - Nome do gateway
 * @param {Object} payload - Payload do webhook
 * @returns {Object} Webhook normalizado
 * @throws {ValidationError} Se webhook é inválido
 */
function normalizeWebhookFromGateway(gateway, payload) {
  switch (gateway) {
    case 'efi':
      return normalizeEFIWebhook(payload);
    case 'stripe':
      return normalizeStripeWebhook(payload);
    default:
      throw new ValidationError(`Unknown gateway: ${gateway}`);
  }
}

/**
 * Normaliza webhook EFI (Pix)
 * 
 * @private
 * @param {Object} payload - Payload EFI
 * @returns {Object} Webhook normalizado
 */
function normalizeEFIWebhook(payload) {
  validateEFIPayload(payload);

  const pixRecord = payload.pix[0];

  return {
    event: 'payment.updated',
    gateway: 'efi',
    gateway_event_id: pixRecord.txid,
    payment_id: pixRecord.txid,
    status: mapEFIStatus(pixRecord),
    amount: pixRecord.valor,
    currency: 'BRL',
    timestamp: pixRecord.horario || new Date().toISOString(),
    metadata: {
      gateway_specific: pixRecord
    }
  };
}

/**
 * Normaliza webhook Stripe
 * 
 * @private
 * @param {Object} payload - Payload Stripe
 * @returns {Object} Webhook normalizado
 */
function normalizeStripeWebhook(payload) {
  validateStripePayload(payload);

  const stripeObject = payload.data?.object;

  return {
    event: mapStripeEventType(payload.type),
    gateway: 'stripe',
    gateway_event_id: payload.id,
    payment_id: stripeObject.id,
    status: mapStripeStatus(stripeObject.status),
    amount: stripeObject.amount ? stripeObject.amount / 100 : null,
    currency: stripeObject.currency?.toUpperCase() || 'USD',
    timestamp: new Date(stripeObject.created * 1000).toISOString(),
    metadata: {
      gateway_specific: stripeObject
    }
  };
}

/**
 * Valida payload EFI
 * 
 * @private
 * @param {Object} payload - Payload a validar
 * @throws {ValidationError} Se inválido
 */
function validateEFIPayload(payload) {
  if (!payload.pix || !Array.isArray(payload.pix) || payload.pix.length === 0) {
    throw new ValidationError('Invalid EFI webhook: missing pix array');
  }

  const pixRecord = payload.pix[0];
  if (!pixRecord.txid || pixRecord.valor === undefined) {
    throw new ValidationError('Invalid EFI webhook: missing required fields');
  }
}

/**
 * Valida payload Stripe
 * 
 * @private
 * @param {Object} payload - Payload a validar
 * @throws {ValidationError} Se inválido
 */
function validateStripePayload(payload) {
  if (!payload.type || !payload.data?.object) {
    throw new ValidationError('Invalid Stripe webhook: missing required fields');
  }
}

/**
 * Mapeia status EFI para status padrão
 * 
 * @private
 * @param {Object} pixRecord - Registro PIX
 * @returns {string} Status normalizado
 */
function mapEFIStatus(pixRecord) {
  if (!pixRecord.horario) {
    return 'pending';
  }
  return 'completed';
}

/**
 * Mapeia status Stripe para status padrão
 * 
 * @private
 * @param {string} stripeStatus - Status do Stripe
 * @returns {string} Status normalizado
 */
function mapStripeStatus(stripeStatus) {
  const statusMap = {
    'succeeded': 'completed',
    'processing': 'processing',
    'requires_action': 'pending',
    'requires_capture': 'authorized',
    'requires_confirmation': 'pending',
    'requires_payment_method': 'pending',
    'canceled': 'canceled'
  };

  return statusMap[stripeStatus] || 'unknown';
}

/**
 * Mapeia tipo de evento Stripe para tipo padrão
 * 
 * @private
 * @param {string} stripeEventType - Tipo de evento do Stripe
 * @returns {string} Tipo normalizado
 */
function mapStripeEventType(stripeEventType) {
  const eventMap = {
    'payment_intent.succeeded': 'payment.completed',
    'payment_intent.payment_failed': 'payment.failed',
    'payment_intent.canceled': 'payment.canceled',
    'charge.captured': 'payment.captured',
    'charge.refunded': 'payment.refunded'
  };

  return eventMap[stripeEventType] || `payment.${stripeEventType.split('.')[0]}`;
}

module.exports = { normalizeWebhookFromGateway };
