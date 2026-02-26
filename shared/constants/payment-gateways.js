/**
 * Constantes de Gateways de Pagamento
 * Configurações e metadados de cada gateway
 */

const GATEWAYS = {
  EFI: {
    name: 'efi',
    displayName: 'EFI Pagamentos',
    // permite sobrescrever via variável de ambiente para testes locais
    apiBaseUrl: process.env.EFI_API_BASE_URL || 'https://api.efi.com.br',
    timeout: 5000,
    maxRetries: 3,
    // credenciais específicas do Efí (opcionais, usadas pelo handler)
    clientId: process.env.EFI_CLIENT_ID || null,
    clientSecret: process.env.EFI_CLIENT_SECRET || null,
    sandbox: process.env.EFI_SANDBOX === 'true',
    certificatePath: process.env.EFI_CERTIFICATE || null
  },
  STRIPE: {
    name: 'stripe',
    displayName: 'Stripe',
    apiBaseUrl: 'https://api.stripe.com',
    timeout: 10000,
    maxRetries: 3
  }
};

const GATEWAY_NAMES = {
  EFI: 'efi',
  STRIPE: 'stripe'
};

const VALID_GATEWAYS = Object.values(GATEWAY_NAMES);

/**
 * Valida se um nome de gateway é válido
 * @param {string} gateway - Nome do gateway
 * @returns {boolean}
 */
function isValidGateway(gateway) {
  return VALID_GATEWAYS.includes(gateway);
}

/**
 * Obtém configuração de um gateway
 * @param {string} gateway - Nome do gateway
 * @returns {Object} Configuração do gateway
 */
function getGatewayConfig(gateway) {
  const config = Object.values(GATEWAYS).find(g => g.name === gateway);
  if (!config) {
    throw new Error(`Unknown gateway: ${gateway}`);
  }
  return config;
}

module.exports = {
  GATEWAYS,
  GATEWAY_NAMES,
  VALID_GATEWAYS,
  isValidGateway,
  getGatewayConfig
};
