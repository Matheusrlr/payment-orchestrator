/**
 * Normalizador de Respostas de Gateway
 * Padroniza respostas diferentes em um único formato
 */

const logger = require('../../../shared/utils/logger');
const { ValidationError } = require('../../../shared/utils/errors');

/**
 * Normaliza resposta do gateway para formato padrão interno
 * 
 * Transforma respostas específicas de cada gateway em um
 * formato padronizado para uso interno do sistema
 * 
 * @param {string} gateway - Nome do gateway
 * @param {Object} response - Resposta bruta do gateway
 * @param {string} type - Tipo de operação (payment | pix_send | pix_charge)
 * @returns {Object} Resposta normalizada
 * @throws {ValidationError} Se resposta é inválida
 */
function normalizeGatewayResponse(gateway, response, type = 'payment') {
  // Se type é pix_charge, rotear para normalizador específico
  if (type === 'pix_charge') {
    return normalizePixCharge(response, gateway);
  }

  switch (gateway) {
    case 'efi':
      return normalizeEFIResponse(response);
    case 'stripe':
      return normalizeStripeResponse(response);
    default:
      throw new ValidationError(`Unknown gateway: ${gateway}`);
  }
}

/**
 * Normaliza resposta EFI para padrão interno
 * 
 * @private
 * @param {Object} efiResponse - Resposta da EFI
 * @returns {Object} Resposta normalizada
 */
function normalizeEFIResponse(efiResponse) {
  validateEFIResponse(efiResponse);

  return {
    id: generateOrchestrationId(),
    gateway: 'efi',
    gateway_id: efiResponse.txid || efiResponse.id,
    status: efiResponse.status || 'pending',
    payment_type: 'pix',
    created_at: new Date().toISOString(),
    data: {
      txid: efiResponse.txid,
      qr_code_url: efiResponse.location || efiResponse.loc?.location,
      qr_code: efiResponse.brcode || efiResponse.qrcode || efiResponse.pix?.qrcode,
      copy_paste: efiResponse.pixCopiaECola || efiResponse.copiaecola || efiResponse.pix?.copiaecola,
      expires_at: efiResponse.expiracao || efiResponse.pix?.expiresAt,
      devedor: efiResponse.devedor,
      valor: efiResponse.valor,
      calendar_created: efiResponse.calendario?.criacao,
      full_response: efiResponse  // incluir resposta completa para referência
    }
  };
}

/**
 * Normaliza resposta Stripe para padrão interno
 * 
 * @private
 * @param {Object} stripeResponse - Resposta do Stripe
 * @returns {Object} Resposta normalizada
 */
function normalizeStripeResponse(stripeResponse) {
  validateStripeResponse(stripeResponse);

  return {
    id: generateOrchestrationId(),
    gateway: 'stripe',
    gateway_id: stripeResponse.id,
    status: normalizeStripeStatus(stripeResponse.status),
    payment_type: 'card',
    created_at: new Date(stripeResponse.created * 1000).toISOString(),
    data: {
      amount_cents: stripeResponse.amount,
      currency: stripeResponse.currency?.toUpperCase(),
      client_secret: stripeResponse.client_secret
    }
  };
}

/**
 * Valida resposta EFI
 * 
 * @private
 * @param {Object} response - Resposta a validar
 * @throws {ValidationError} Se resposta é inválida
 */
function validateEFIResponse(response) {
  // Efí pode retornar txid ou id
  if (!response.txid && !response.id) {
    throw new ValidationError('EFI response missing txid or id');
  }
  // QR code pode estar em diferentes fields dependendo do tipo de cobrança
  if (!response.brcode && !response.qrcode && !response.pix?.qrcode) {
    logger.warn('EFI response may not have QR code', { response });
  }
}

/**
 * Valida resposta Stripe
 * 
 * @private
 * @param {Object} response - Resposta a validar
 * @throws {ValidationError} Se resposta é inválida
 */
function validateStripeResponse(response) {
  if (!response.id) {
    throw new ValidationError('Stripe response missing id');
  }
  if (!response.status) {
    throw new ValidationError('Stripe response missing status');
  }
}

/**
 * Mapeia status Stripe para status padrão interno
 * 
 * @private
 * @param {string} stripeStatus - Status do Stripe
 * @returns {string} Status normalizado
 */
function normalizeStripeStatus(stripeStatus) {
  const statusMap = {
    'requires_payment_method': 'pending',
    'requires_confirmation': 'pending',
    'requires_action': 'pending',
    'processing': 'processing',
    'requires_capture': 'authorized',
    'canceled': 'canceled',
    'succeeded': 'completed'
  };

  return statusMap[stripeStatus] || 'unknown';
}

/**
 * Normaliza resposta de cobrança Pix
 * 
 * @private
 * @param {Object} response - Resposta bruta do gateway
 * @param {string} gateway - Nome do gateway (efi)
 * @returns {Object} Resposta normalizada
 */
function normalizePixCharge(response, gateway) {
  validatePixChargeResponse(response);

  const normalized = {
    id: response.id || response.txid,
    idCobr: response.txid || response.id,
    modalidade: response.modalidade,
    status: response.status || 'ATIVA',
    valor: response.valor,
    gateway,
    criadoEm: response.createdAt || new Date().toISOString()
  };

  // Adicionar campos opcionais se presentes
  if (response.qrCode) {
    normalized.qrCode = response.qrCode;
  }

  if (response.pixCopiaECola) {
    normalized.pixCopiaECola = response.pixCopiaECola;
  }

  if (response.linkPagamento) {
    normalized.linkPagamento = response.linkPagamento;
  }

  if (response.vencimento) {
    normalized.vencimento = response.vencimento;
    normalized.vencimentoEm = response.vencimento.data;
  }

  if (response.dataPagamento) {
    normalized.dataPagamento = response.dataPagamento;
  }

  if (response.idTransacao) {
    normalized.idTransacao = response.idTransacao;
  }

  return normalized;
}

/**
 * Valida resposta de cobrança Pix
 *
 * @private
 * @param {Object} response - Resposta a validar
 * @throws {ValidationError} Se inválida
 */
function validatePixChargeResponse(response) {
  if (!response.id && !response.txid) {
    throw new ValidationError('Pix charge response missing id or txid');
  }

  if (!response.status) {
    throw new ValidationError('Pix charge response missing status');
  }

  if (!response.valor) {
    throw new ValidationError('Pix charge response missing valor');
  }
}

/**
 * Gera ID de orquestração único
 * Formato: orch_<timestamp>_<random>
 * 
 * @private
 * @returns {string} ID único
 */
function generateOrchestrationId() {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substr(2, 9);
  return `orch_${timestamp}_${random}`;
}

module.exports = { normalizeGatewayResponse };
