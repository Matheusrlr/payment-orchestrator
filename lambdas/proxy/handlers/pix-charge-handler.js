/**
 * Handler para Operações de Cobrança Pix
 * Implementa 4 modalidades: COPIA_COLA, DINAMICO, LINK, MANUAL
 */

const axios = require('axios');
const logger = require('../../../shared/utils/logger');
const { GatewayError, TimeoutError } = require('../../../shared/utils/errors');
const { getGatewayConfig } = require('../../../shared/constants/payment-gateways');

/**
 * Handler para operações de cobrança Pix via EFI
 */
class EFIPixChargeHandler {
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
            passphrase: ''
          });
        } else {
          this.client.defaults.httpsAgent = new https.Agent({
            cert: certData,
            rejectUnauthorized: false
          });
        }
        logger.info('EFI Pix Charge Certificate loaded', { path: certificatePath });
      } catch (error) {
        logger.warn('Failed to load certificate', {
          certificatePath,
          error: error.message
        });
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
    if (this.accessToken && this.tokenExpiry && Date.now() < this.tokenExpiry) {
      return this.accessToken;
    }

    const { clientId, clientSecret, apiBaseUrl } = this.config;

    if (!clientId || !clientSecret) {
      throw new GatewayError(
        'EFI credentials not configured (clientId/clientSecret)',
        this.gatewayName
      );
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
      this.tokenExpiry = Date.now() + response.data.expires_in * 900;

      logger.info('EFI OAuth token obtained for Pix Charge', {
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
   * Cria cobrança Pix
   *
   * @param {string} modalidade - COPIA_COLA | DINAMICO | LINK | MANUAL
   * @param {object} payload - Dados validados da cobrança
   * @returns {Promise<object>} Resposta da API Efí
   * @throws {GatewayError}
   */
  async createCharge(modalidade, payload) {
    try {
      logger.info(`Creating ${modalidade} charge`, {
        gateway: this.gatewayName,
        idCobr: payload.idCobr,
        valor: payload.valor
      });

      if (this.config.clientId && this.config.clientSecret) {
        return await this._createEfiCharge(modalidade, payload);
      }

      return this._simulateCharge(modalidade, payload);
    } catch (error) {
      this.handleError(error);
    }
  }

  /**
   * Cria cobrança via API real EFI
   *
   * @private
   * @param {string} modalidade - Tipo de cobrança
   * @param {object} payload - Dados da cobrança
   * @returns {Promise<object>}
   */
  async _createEfiCharge(modalidade, payload) {
    const accessToken = await this.getAccessToken();
    const endpoint = this._mapModalityToEndpoint(modalidade);
    const url = `${this.config.apiBaseUrl}${endpoint}`;

    const body = this._buildEfiRequestBody(modalidade, payload);

    logger.debug(`Calling Efí ${endpoint}`, { body });

    const response = await this.client.post(url, body, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    });

    logger.info(`${modalidade} charge created`, {
      gateway: this.gatewayName,
      idCobr: payload.idCobr,
      status: response.data.status
    });

    return response.data;
  }

  /**
   * Mapeia modalidade para endpoint EFI
   *
   * @private
   * @param {string} modalidade - Tipo de cobrança
   * @returns {string} Endpoint da API
   */
  _mapModalityToEndpoint(modalidade) {
    const endpoints = {
      COPIA_COLA: '/v3/cob',
      DINAMICO: '/v3/cob',
      LINK: '/v3/cobv',
      MANUAL: 'local'
    };
    return endpoints[modalidade];
  }

  /**
   * Constói body da requisição conforme especificação EFI
   *
   * @private
   * @param {string} modalidade - Tipo de cobrança
   * @param {object} payload - Dados da cobrança
   * @returns {object} Body para API Efí
   */
  _buildEfiRequestBody(modalidade, payload) {
    const body = {
      valor: payload.valor,
      pagador: {
        chave: payload.pagador.chave
      }
    };

    // Adicionar campo opcional infoPagador se presente
    if (payload.pagador.infoPagador) {
      body.pagador.infoPagador = payload.pagador.infoPagador;
    }

    // Adicionar vencimento para DINAMICO e LINK
    if ((modalidade === 'DINAMICO' || modalidade === 'LINK') && payload.vencimento) {
      body.vencimento = {
        data: payload.vencimento.data
      };

      if (payload.vencimento.multa) {
        body.vencimento.multa = payload.vencimento.multa;
      }
      if (payload.vencimento.juros) {
        body.vencimento.juros = payload.vencimento.juros;
      }
      if (payload.vencimento.desconto) {
        body.vencimento.desconto = payload.vencimento.desconto;
      }
    }

    // Adicionar txid para idempotência
    body.txid = payload.idCobr;

    return body;
  }

  /**
   * Consulta status de cobrança
   *
   * @param {string} idCobr - ID da cobrança
   * @returns {Promise<object>}
   * @throws {GatewayError}
   */
  async getChargeStatus(idCobr) {
    try {
      logger.info(`Fetching charge status`, {
        gateway: this.gatewayName,
        idCobr
      });

      if (this.config.clientId && this.config.clientSecret) {
        return await this._getEfiChargeStatus(idCobr);
      }

      return this._simulateChargeStatus(idCobr);
    } catch (error) {
      this.handleError(error);
    }
  }

  /**
   * Consulta status via API real EFI
   *
   * @private
   * @param {string} idCobr - ID da cobrança
   * @returns {Promise<object>}
   */
  async _getEfiChargeStatus(idCobr) {
    const accessToken = await this.getAccessToken();
    const url = `${this.config.apiBaseUrl}/v3/cob/${idCobr}`;

    const response = await this.client.get(url, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    });

    logger.info(`Charge status retrieved`, {
      gateway: this.gatewayName,
      idCobr,
      status: response.data.status
    });

    return response.data;
  }

  /**
   * Cancela cobrança DINAMICO
   *
   * @param {string} idCobr - ID da cobrança
   * @returns {Promise<object>}
   * @throws {GatewayError}
   */
  async cancelCharge(idCobr) {
    try {
      logger.info(`Canceling charge`, {
        gateway: this.gatewayName,
        idCobr
      });

      if (this.config.clientId && this.config.clientSecret) {
        return await this._cancelEfiCharge(idCobr);
      }

      return this._simulateCancelCharge(idCobr);
    } catch (error) {
      this.handleError(error);
    }
  }

  /**
   * Cancela cobrança via API real EFI
   *
   * @private
   * @param {string} idCobr - ID da cobrança
   * @returns {Promise<object>}
   */
  async _cancelEfiCharge(idCobr) {
    const accessToken = await this.getAccessToken();
    const url = `${this.config.apiBaseUrl}/v3/cob/${idCobr}`;

    const response = await this.client.delete(url, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    });

    logger.info(`Charge canceled`, {
      gateway: this.gatewayName,
      idCobr,
      status: response.data.status
    });

    return response.data;
  }

  /**
   * Simula criação de cobrança para testes locais
   *
   * @private
   * @param {string} modalidade - Tipo de cobrança
   * @param {object} payload - Dados da cobrança
   * @returns {object}
   */
  _simulateCharge(modalidade, payload) {
    const response = {
      id: payload.idCobr,
      txid: payload.idCobr,
      status: 'ATIVA',
      valor: payload.valor,
      pagador: payload.pagador,
      modalidade,
      createdAt: new Date().toISOString()
    };

    if (modalidade === 'DINAMICO' || modalidade === 'LINK') {
      response.vencimento = payload.vencimento;
    }

    if (modalidade === 'COPIA_COLA' || modalidade === 'DINAMICO') {
      response.qrCode = Buffer.from('mock-qr-code-image').toString('base64');
      response.pixCopiaECola = '00020126580014br.gov.bcb.pix...mock...';
    }

    if (modalidade === 'LINK') {
      response.linkPagamento = `https://pix.efibank.com.br/pagar/${payload.idCobr}`;
    }

    return response;
  }

  /**
   * Simula consulta de status
   *
   * @private
   * @param {string} idCobr - ID da cobrança
   * @returns {object}
   */
  _simulateChargeStatus(idCobr) {
    const statuses = ['ATIVA', 'ATIVA', 'RECEBIDA'];
    const randomStatus = statuses[Math.floor(Math.random() * statuses.length)];

    return {
      id: idCobr,
      txid: idCobr,
      status: randomStatus,
      createdAt: new Date(Date.now() - 3600000).toISOString()
    };
  }

  /**
   * Simula cancelamento
   *
   * @private
   * @param {string} idCobr - ID da cobrança
   * @returns {object}
   */
  _simulateCancelCharge(idCobr) {
    return {
      id: idCobr,
      txid: idCobr,
      status: 'REMOVIDA',
      canceledAt: new Date().toISOString()
    };
  }

  /**
   * Trata erros de forma consistente
   *
   * @protected
   * @param {Error} error - Erro original
   * @throws {GatewayError}
   */
  handleError(error) {
    if (error.code === 'ECONNABORTED') {
      throw new TimeoutError(this.gatewayName, this.config.timeout);
    }

    if (error.response) {
      throw new GatewayError(
        `Gateway returned status ${error.response.status}: ${JSON.stringify(
          error.response.data
        )}`,
        this.gatewayName,
        error
      );
    }

    throw new GatewayError(error.message, this.gatewayName, error);
  }
}

/**
 * Factory para obter handler de Pix Charge
 *
 * @returns {EFIPixChargeHandler} Instância do handler
 */
function getEFIPixChargeHandler() {
  return new EFIPixChargeHandler();
}

module.exports = {
  getEFIPixChargeHandler,
  EFIPixChargeHandler
};
