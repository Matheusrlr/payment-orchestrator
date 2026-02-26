/**
 * Camada de Erros Customizados
 * Define tipos de erro padrão para o projeto
 */

/**
 * Erro base para todas as operações de pagamento
 */
class PaymentError extends Error {
  constructor(message, code, statusCode = 500) {
    super(message);
    this.name = 'PaymentError';
    this.code = code;
    this.statusCode = statusCode;
    this.timestamp = new Date().toISOString();
  }

  /**
   * Serializa o erro para resposta HTTP
   * @returns {Object} Objeto de erro estruturado
   */
  toJSON() {
    return {
      error: this.name,
      message: this.message,
      code: this.code,
      timestamp: this.timestamp
    };
  }
}

/**
 * Erro de validação de entrada
 * Usado quando dados inválidos são fornecidos
 */
class ValidationError extends PaymentError {
  constructor(message, details = {}) {
    super(message, 'VALIDATION_ERROR', 400);
    this.name = 'ValidationError';
    this.details = details;
  }

  toJSON() {
    return {
      ...super.toJSON(),
      details: this.details
    };
  }
}

/**
 * Erro de idempotência
 * Usado quando há conflitos na chave de idempotência
 */
class IdempotencyError extends PaymentError {
  constructor(message, cachedResponse = null) {
    super(message, 'IDEMPOTENCY_ERROR', 409);
    this.name = 'IdempotencyError';
    this.cachedResponse = cachedResponse;
  }

  /**
   * Indica se deve usar cache
   * @returns {boolean}
   */
  hasCache() {
    return this.cachedResponse !== null;
  }
}

/**
 * Erro de autenticação/autorização
 */
class AuthenticationError extends PaymentError {
  constructor(message) {
    super(message, 'AUTHENTICATION_ERROR', 401);
    this.name = 'AuthenticationError';
  }
}

/**
 * Erro de gateway de pagamento
 * Falhas em comunicação ou processamento
 */
class GatewayError extends PaymentError {
  constructor(message, gateway, originalError = null) {
    super(message, 'GATEWAY_ERROR', 502);
    this.name = 'GatewayError';
    this.gateway = gateway;
    this.originalError = originalError?.message || null;
    this.retryable = true;
  }

  toJSON() {
    return {
      ...super.toJSON(),
      gateway: this.gateway,
      retryable: this.retryable
    };
  }
}

/**
 * Erro de timeout
 */
class TimeoutError extends GatewayError {
  constructor(gateway, timeout) {
    super(
      `Request to ${gateway} timed out after ${timeout}ms`,
      gateway
    );
    this.name = 'TimeoutError';
    this.timeout = timeout;
  }
}

/**
 * Erro de circuit breaker
 * Indica que o serviço está temporariamente indisponível
 */
class CircuitBreakerError extends GatewayError {
  constructor(gateway) {
    super(
      `Circuit breaker open for gateway: ${gateway}`,
      gateway
    );
    this.name = 'CircuitBreakerError';
    this.statusCode = 503;
  }
}

module.exports = {
  PaymentError,
  ValidationError,
  IdempotencyError,
  AuthenticationError,
  GatewayError,
  TimeoutError,
  CircuitBreakerError
};
