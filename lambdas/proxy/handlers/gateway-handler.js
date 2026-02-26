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
    this.accessToken = null;
    this.tokenExpiry = null;
    this.setupAuthentication();
  }

  setupAuthentication() {
    // Efí uses OAuth 2.0 flow, so we'll configure the base client
    // and fetch token when needed
    const { certificatePath } = this.config;

    if (certificatePath) {
      const fs = require('fs');
      const https = require('https');
      try {
        // Tentar carregar como .p12 primeiro, depois como .pem
        let certData;
        if (certificatePath.endsWith('.p12')) {
          certData = fs.readFileSync(certificatePath);
          this.client.defaults.httpsAgent = new https.Agent({
            pfx: certData,
            passphrase: ""
          });
        } else {
          // Para .pem ou outros formatos
          certData = fs.readFileSync(certificatePath);
          this.client.defaults.httpsAgent = new https.Agent({
            cert: certData,
            rejectUnauthorized: false
          });
        }
        logger.info('EFI Certificate loaded', { path: certificatePath });
      } catch (error) {
        logger.warn('Failed to load certificate', { certificatePath, error: error.message });
      }
    }
  }

  /**
   * Obtém access token via OAuth
   * 
   * @private
   * @returns {Promise<string>} Access token
   */
  async getAccessToken() {
    // Verificar se token ainda é válido
    if (this.accessToken && this.tokenExpiry && Date.now() < this.tokenExpiry) {
      return this.accessToken;
    }

    const { clientId, clientSecret, apiBaseUrl } = this.config;
    
    const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
    
    try {
      const response = await this.client.post(`${apiBaseUrl}/oauth/token`, 
        { grant_type: 'client_credentials' },
        {
          headers: {
            'Authorization': `Basic ${credentials}`,
            'Content-Type': 'application/json'
          }
        }
      );
      
      this.accessToken = response.data.access_token;
      // Armazenar expiry com margem de segurança (90% do tempo de expiração)
      this.tokenExpiry = Date.now() + (response.data.expires_in * 900);
      
      logger.info('EFI OAuth token obtained', {
        expiresIn: response.data.expires_in
      });
      
      return this.accessToken;
    } catch (error) {
      logger.error('Failed to obtain EFI access token', {
        error: error.message,
        url: `${apiBaseUrl}/oauth/token`
      });
      throw error;
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
      // DEBUG: mostrar config usado pelo handler
      console.log('EFIHandler.config at runtime', this.config);
      logger.info('Processing EFI payment', {
        gateway: this.gatewayName,
        amount: payload.amount
      });

      // se credenciais estiverem configuradas, realiza chamada real
      if (this.config.clientId && this.config.clientSecret) {
        // Obter access token via OAuth
        const accessToken = await this.getAccessToken();
        
        // montar corpo conforme API Efí
        const body = {
          calendario: { expiracao: payload.expiracao || 3600 },
          devedor: payload.devedor || undefined, // pode ser undefined
          valor: { original: payload.amount.toString() },
          chave: payload.chave || payload.key || null,
          solicitacaoPagador: payload.description || payload.solicitacaoPagador || ''
        };

        const url = `${this.config.apiBaseUrl.replace(/\/+$/,'')}/v2/cob`;
        
        // Fazer requisição com Bearer token
        const response = await this.client.post(url, body, {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
          }
        });

        logger.info('EFI payment processed (real API)', {
          gateway: this.gatewayName,
          status: response.data.status,
          txid: response.data.txid
        });

        return response.data;
      }

      // fallback para simulação local
      const response = await this.simulateEFIPayment(payload);
      logger.info('EFI payment processed (mock)', {
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
