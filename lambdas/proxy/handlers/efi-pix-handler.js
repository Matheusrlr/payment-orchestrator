/**
 * Handler para Operações de Pix via EFI
 * Inclui criar cobrança (cob), envio de pix direto, etc.
 */

const axios = require('axios');
const logger = require('../../../shared/utils/logger');
const { GatewayError, TimeoutError } = require('../../../shared/utils/errors');
const { getGatewayConfig } = require('../../../shared/constants/payment-gateways');
const { validateIdEnvio } = require('../../../shared/utils/pix-validators');

/**
 * Handler para operações Pix via EFI
 */
class EFIPixHandler {
  constructor() {
    this.gatewayName = 'efi';
    this.config = getGatewayConfig('efi');
    this.client = axios.create({
      baseURL: this.config.apiBaseUrl,
      timeout: this.config.timeout
    });
    this.accessToken = null;
    this.tokenExpiry = null;
    this.setupAuthentication();
  }

  setupAuthentication() {
    // Efí usa OAuth 2.0, so we'll configure the base client
    // e fetch token quando necessário
    const { certificatePath } = this.config;

    if (certificatePath) {
      const fs = require('fs');
      const https = require('https');
      try {
        const certData = certificatePath.endsWith('.p12')
          ? fs.readFileSync(certificatePath)
          : fs.readFileSync(certificatePath);

        if (certificatePath.endsWith('.p12')) {
          this.client.defaults.httpsAgent = new https.Agent({
            pfx: certData,
            passphrase: ""
          });
        } else {
          this.client.defaults.httpsAgent = new https.Agent({
            cert: certData,
            rejectUnauthorized: false
          });
        }
        logger.info('EFI Pix Certificate loaded', { path: certificatePath });
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
    
    if (!clientId || !clientSecret) {
      throw new GatewayError('EFI credentials not configured (clientId/clientSecret)', this.gatewayName);
    }

    const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
    
    try {
      const response = await this.client.post(
        `${apiBaseUrl}/oauth/token`, 
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
      
      logger.info('EFI OAuth token obtained for Pix operations', {
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
   * Envia Pix direto (envio imediato)
   * Endpoint: PUT /v3/gn/pix/:idEnvio
   * 
   * @param {string} idEnvio - Identificador da transação (1-35 caracteres alphanumericos)
   * @param {Object} payload - Dados do Pix a enviar
   * @param {string} payload.valor - Valor em formato "12.34"
   * @param {Object} payload.pagador - Dados do pagador
   * @param {string} payload.pagador.chave - Chave Pix do pagador
   * @param {string} [payload.pagador.infoPagador] - Informação adicional (até 140 caracteres)
   * @param {Object} payload.favorecido - Dados do favorecido (recebedor)
   * @param {string} [payload.favorecido.chave] - Chave Pix do recebedor
   * @param {Object} [payload.favorecido.contaBanco] - Dados bancários alternativos
   * @returns {Promise<Object>} Resposta da API EFI
   * @throws {GatewayError} Se houver erro na operação
   */
  async sendPix(idEnvio, payload) {
    try {
      // Validar idEnvio
      validateIdEnvio(idEnvio);

      logger.info('Sending Pix via EFI', {
        gateway: this.gatewayName,
        idEnvio,
        valor: payload.valor,
        pagadorChave: payload.pagador?.chave,
        favorecidoChave: payload.favorecido?.chave
      });

      // Se credenciais estiverem configuradas, realiza chamada real
      if (this.config.clientId && this.config.clientSecret) {
        return await this.sendPixReal(idEnvio, payload);
      }

      // Fallback para simulação local
      const response = await this.simulatePixSend(idEnvio, payload);
      logger.info('Pix send processed (mock)', {
        gateway: this.gatewayName,
        idEnvio,
        status: response.status
      });

      return response;
    } catch (error) {
      this.handleError(error);
    }
  }

  /**
   * Envia Pix para API real do EFI
   * 
   * @private
   * @param {string} idEnvio - Identificador da transação
   * @param {Object} payload - Dados do Pix
   * @returns {Promise<Object>} Resposta da API
   */
  async sendPixReal(idEnvio, payload) {
    try {
      const accessToken = await this.getAccessToken();
      
      const url = `${this.config.apiBaseUrl}/v3/gn/pix/${idEnvio}`;
      
      // Construir body conforme especificação
      const body = {
        valor: payload.valor,
        pagador: {
          chave: payload.pagador.chave
        },
        favorecido: payload.favorecido
      };

      // Adicionar infoPagador se presente
      if (payload.pagador.infoPagador) {
        body.pagador.infoPagador = payload.pagador.infoPagador;
      }

      // Adicionar status opcional se presente
      if (payload.status) {
        body.status = payload.status;
      }

      const response = await this.client.put(url, body, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        }
      });

      logger.info('Pix send processed (real API)', {
        gateway: this.gatewayName,
        idEnvio,
        status: response.data.status,
        statusCode: response.status
      });

      return response.data;
    } catch (error) {
      this.handleError(error);
    }
  }

  /**
   * Simula envio de Pix para testes locais
   * 
   * @private
   * @param {string} idEnvio - Identificador da transação
   * @param {Object} payload - Dados do Pix
   * @returns {Object} Resposta simulada
   */
  simulatePixSend(idEnvio, payload) {
    return {
      id: idEnvio,
      status: 'EM_PROCESSAMENTO',
      valor: payload.valor,
      pagador: {
        chave: payload.pagador.chave
      },
      favorecido: payload.favorecido,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
  }

  /**
   * Consulta status de um envio de Pix
   * Endpoint: GET /v3/gn/pix/:idEnvio
   * 
   * @param {string} idEnvio - Identificador da transação
   * @returns {Promise<Object>} Dados do envio de Pix
   */
  async getPixStatus(idEnvio) {
    try {
      validateIdEnvio(idEnvio);

      logger.info('Getting Pix status', {
        gateway: this.gatewayName,
        idEnvio
      });

      if (this.config.clientId && this.config.clientSecret) {
        return await this.getPixStatusReal(idEnvio);
      }

      return this.simulateGetPixStatus(idEnvio);
    } catch (error) {
      this.handleError(error);
    }
  }

  /**
   * Faz devolução de Pix (refund)
   * Endpoint: POST /v3/gn/pix/{idEnvio}/devolucao/{reTxId}
   * 
   * @param {string} idEnvio - Identificador do envio original
   * @param {Object} payload - Dados da devolução
   * @param {string} payload.idDevolucao - ID da devolução
   * @param {string} payload.valor - Valor em formato "12.34"
   * @param {string} payload.motivo - Motivo: SOLICITACAO_PAYER, SOLICITACAO_CREDOR, FALHA_NA_ENTREGA
   * @returns {Promise<Object>} Resposta da API EFI
   * @throws {GatewayError} Se houver erro na operação
   */
  async refundPix(idEnvio, payload) {
    try {
      validateIdEnvio(idEnvio);

      logger.info('Refunding Pix via EFI', {
        gateway: this.gatewayName,
        idEnvio,
        motivo: payload.motivo,
        valor: payload.valor
      });

      if (this.config.clientId && this.config.clientSecret) {
        return await this.refundPixReal(idEnvio, payload);
      }

      return this.simulateRefundPix(idEnvio, payload);
    } catch (error) {
      this.handleError(error);
    }
  }

  /**
   * Faz devolução real via API EFI
   * 
   * @private
   * @param {string} idEnvio - Identificador do envio
   * @param {Object} payload - Dados da devolução
   * @returns {Promise<Object>} Resposta da API
   */
  async refundPixReal(idEnvio, payload) {
    try {
      const accessToken = await this.getAccessToken();
      const { idDevolucao, valor, motivo } = payload;
      const url = `${this.config.apiBaseUrl}/v3/gn/pix/${idEnvio}/devolucao/${idDevolucao}`;

      const body = {
        valor,
        motivo
      };

      const response = await this.client.post(url, body, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        }
      });

      logger.info('Pix refund processed (real API)', {
        gateway: this.gatewayName,
        idEnvio,
        idDevolucao,
        status: response.data.status || 'PENDENTE'
      });

      return response.data;
    } catch (error) {
      this.handleError(error);
    }
  }

  /**
   * Simula devolução de Pix (mock)
   * 
   * @private
   * @param {string} idEnvio - Identificador do envio
   * @param {Object} payload - Dados da devolução
   * @returns {Object} Resposta simulada
   */
  simulateRefundPix(idEnvio, payload) {
    const { idDevolucao, valor, motivo } = payload;

    logger.debug('Simulating Pix refund (mock mode)', {
      gateway: this.gatewayName,
      idEnvio,
      idDevolucao,
      valor
    });

    return {
      id: idDevolucao,
      idEnvioOrigem: idEnvio,
      valor,
      motivo,
      status: 'PENDENTE',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
  }

  /**
   * Consulta status real via API EFI
   * 
   * @private
   * @param {string} idEnvio - Identificador da transação
   * @returns {Promise<Object>} Dados do envio
   */
  async getPixStatusReal(idEnvio) {
    try {
      const accessToken = await this.getAccessToken();
      const url = `${this.config.apiBaseUrl}/v3/gn/pix/${idEnvio}`;

      const response = await this.client.get(url, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        }
      });

      logger.info('Pix status retrieved (real API)', {
        gateway: this.gatewayName,
        idEnvio,
        status: response.data.status
      });

      return response.data;
    } catch (error) {
      this.handleError(error);
    }
  }

  /**
   * Simula consulta de status
   * 
   * @private
   * @param {string} idEnvio - Identificador da transação
   * @returns {Object} Dados simulados
   */
  simulateGetPixStatus(idEnvio) {
    const statuses = ['EM_PROCESSAMENTO', 'REALIZADO', 'NAO_REALIZADO'];
    const randomStatus = statuses[Math.floor(Math.random() * statuses.length)];

    return {
      id: idEnvio,
      status: randomStatus,
      createdAt: new Date(Date.now() - 3600000).toISOString(),
      updatedAt: new Date().toISOString()
    };
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
        `Gateway returned status ${error.response.status}: ${JSON.stringify(error.response.data)}`,
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
 * Factory para obter handler de Pix
 * 
 * @returns {EFIPixHandler} Instância do handler
 */
function getEFIPixHandler() {
  return new EFIPixHandler();
}

module.exports = { 
  getEFIPixHandler, 
  EFIPixHandler 
};
