/**
 * Handlers de Gateway de Pagamento
 * Implementações específicas para cada gateway
 */

const axios = require('axios');
const logger = require('../../../shared/utils/logger');
const { GatewayError, TimeoutError } = require('../../../shared/utils/errors');
const { getGatewayConfig } = require('../../../shared/constants/payment-gateways');

/**
 * Handler base para gateways
 */
class GatewayHandler {
  constructor(gatewayName) {
    this.gatewayName = gatewayName;
    this.config = getGatewayConfig(gatewayName);
    this.client = axios.create({
      baseURL: this.config.apiBaseUrl,
      timeout: this.config.timeout
    });
  }

  /**
   * Processa pagamento no gateway
   * Implementado pelas subclasses
   * 
   * @param {Object} payload - Dados do pagamento
   * @returns {Promise<Object>} Resposta do gateway
   */
  async processPayment(payload) {
    throw new Error('processPayment must be implemented');
  }

  /**
   * Trata erros de forma consistente
   * 
   * @protected
   * @param {Error} error - Erro original
   * @throws {GatewayError} Erro formatado
   */
  handleError(error) {
    if (error.code === 'ECONNABORTED') {
      throw new TimeoutError(this.gatewayName, this.config.timeout);
    }

    if (error.response) {
      throw new GatewayError(
        `Gateway returned status ${error.response.status}`,
        this.gatewayName,
        error
      );
    }

    throw new GatewayError(
      error.message,
      this.gatewayName,
      error
    );
  }
}

/**
 * Handler para EFI (Pix)
 */
class EFIHandler extends GatewayHandler {
  constructor() {
    super('efi');
    this.setupAuthentication();
  }

  setupAuthentication() {
    // Configurar autenticação OAuth com EFI
    // Em produção, isso vem de variáveis de ambiente seguras
    const apiKey = process.env.EFI_API_KEY;
    if (apiKey) {
      this.client.defaults.headers.common['Authorization'] = `Bearer ${apiKey}`;
    }
  }

  /**
   * Processa pagamento via EFI (Pix)
   * 
   * @param {Object} payload - Dados do pagamento
   * @returns {Promise<Object>} Resposta EFI
   */
  async processPayment(payload) {
    try {
      logger.info('Processing EFI payment', {
        gateway: this.gatewayName,
        amount: payload.amount
      });

      // Simulação: Em produção, fazer POST para /v2/cob
      const response = await this.simulateEFIPayment(payload);

      logger.info('EFI payment processed', {
        gateway: this.gatewayName,
        efiId: response.id
      });

      return response;
    } catch (error) {
      this.handleError(error);
    }
  }

  /**
   * Simula resposta EFI
   * 
   * @private
   * @param {Object} payload - Dados do pagamento
   * @returns {Promise<Object>} Resposta simulada
   */
  async simulateEFIPayment(payload) {
    // Simular chamada à API
    return {
      id: `efi_${Date.now()}`,
      status: 'ATIVA',
      pix: {
        qrcode: '00020126580014br.gov.bcb.pix0136xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx5204000053039865802BR5913Test Shop6009Sao Paulo62410503***63041D3D',
        copiaecola: '00020126580014br.gov.bcb.pix0136xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx5204000053039865802BR5913Test Shop6009Sao Paulo62410503***63041D3D'
      },
      createdAt: new Date().toISOString()
    };
  }
}

/**
 * Handler para Stripe
 */
class StripeHandler extends GatewayHandler {
  constructor() {
    super('stripe');
    this.setupAuthentication();
  }

  setupAuthentication() {
    // Configurar autenticação Stripe
    const apiKey = process.env.STRIPE_API_KEY;
    if (apiKey) {
      this.client.defaults.headers.common['Authorization'] = `Bearer ${apiKey}`;
    }
  }

  /**
   * Processa pagamento via Stripe
   * 
   * @param {Object} payload - Dados do pagamento
   * @returns {Promise<Object>} Resposta Stripe
   */
  async processPayment(payload) {
    try {
      logger.info('Processing Stripe payment', {
        gateway: this.gatewayName,
        amount: payload.amount
      });

      // Simulação: Em produção, fazer POST para /v1/payment_intents
      const response = await this.simulateStripePayment(payload);

      logger.info('Stripe payment processed', {
        gateway: this.gatewayName,
        stripeId: response.id
      });

      return response;
    } catch (error) {
      this.handleError(error);
    }
  }

  /**
   * Simula resposta Stripe
   * 
   * @private
   * @param {Object} payload - Dados do pagamento
   * @returns {Promise<Object>} Resposta simulada
   */
  async simulateStripePayment(payload) {
    // Simular chamada à API
    return {
      id: `pi_${Date.now()}`,
      status: 'requires_payment_method',
      amount: Math.round(payload.amount * 100),
      currency: payload.currency.toLowerCase(),
      created: Math.floor(Date.now() / 1000),
      client_secret: `pi_${Date.now()}_secret_xxxxxxxxxxxx`
    };
  }
}

/**
 * Factory para obter handler de gateway
 * 
 * @param {string} gatewayName - Nome do gateway
 * @returns {GatewayHandler} Instância do handler
 */
function getGatewayHandler(gatewayName) {
  switch (gatewayName) {
    case 'efi':
      return new EFIHandler();
    case 'stripe':
      return new StripeHandler();
    default:
      throw new Error(`Unknown gateway: ${gatewayName}`);
  }
}

module.exports = { getGatewayHandler, GatewayHandler };
