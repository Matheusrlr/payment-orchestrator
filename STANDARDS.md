# Padrões de Desenvolvimento - Payment Orchestrator

Baseado na estrutura de skills do projeto, este documento padroniza as práticas de desenvolvimento para o Payment Orchestrator.

## Índice

1. [Estrutura de Módulos](#estrutura-de-módulos)
2. [Convenções de Código](#convenções-de-código)
3. [Tratamento de Erros](#tratamento-de-erros)
4. [Logging e Observabilidade](#logging-e-observabilidade)
5. [Validação de Entrada](#validação-de-entrada)
6. [Documentação](#documentação)
7. [Clean Code Principles](#clean-code-principles)

---

## Estrutura de Módulos

### Organização de Arquivos

Cada Lambda e utilitário deve seguir esta estrutura:

```
lambdas/
├── proxy/
│   ├── index.js (handler)
│   ├── service.js (lógica de negócio)
│   ├── handlers/ (funções específicas)
│   ├── validators/ (validação)
│   ├── errors/ (erros customizados)
│   └── package.json
└── ...

shared/
├── utils/
│   ├── logger.js
│   ├── validators.js
│   ├── errors.js
│   ├── circuit-breaker.js
│   └── http-client.js
└── constants/
    ├── payment-gateways.js
    ├── error-codes.js
    └── http-status.js
```

### Responsabilidade Única

Cada arquivo deve ter **uma única responsabilidade**:

- **index.js**: Apenas o handler AWS Lambda
- **service.js**: Lógica de negócio principal
- **handlers/**: Funções específicas de cada gateway
- **validators/**: Validação de entrada
- **errors/**: Definição de erros customizados

---

## Convenções de Código

### Nomenclatura

```javascript
// ✅ BONS NOMES
const paymentGatewayClient = new PaymentGatewayClient();
const idempotencyKey = event.headers['x-idempotency-key'];
const processedTransaction = normalizePaymentResponse(response);

// ❌ RUINS
const client = new PaymentGatewayClient();
const key = event.headers['x-idempotency-key'];
const data = normalizePaymentResponse(response);
```

### Formato de Código

```javascript
// ✅ Use const por padrão
const value = "immutable";

// ❌ Evite var
var value = "mutable";

// ✅ Use arrow functions para callbacks
array.map(item => item * 2);

// ✅ Template literals
const message = `Payment failed: ${reason}`;

// ✅ Desestruturação
const { tenantId, paymentId } = event.requestContext;
```

### Tamanho e Complexidade

- **Funções**: Máximo 20 linhas (regra dos 3-5 linhas para funções pequenas)
- **Métodos**: Uma coisa bem feita
- **Arquivos**: Máximo 200 linhas

---

## Tratamento de Erros

### Erros Customizados

```javascript
// shared/utils/errors.js
class PaymentError extends Error {
  constructor(message, code, statusCode = 500) {
    super(message);
    this.name = 'PaymentError';
    this.code = code;
    this.statusCode = statusCode;
    this.timestamp = new Date().toISOString();
  }

  toJSON() {
    return {
      error: this.name,
      message: this.message,
      code: this.code,
      timestamp: this.timestamp
    };
  }
}

class ValidationError extends PaymentError {
  constructor(message, details = {}) {
    super(message, 'VALIDATION_ERROR', 400);
    this.name = 'ValidationError';
    this.details = details;
  }
}

class IdempotencyError extends PaymentError {
  constructor(message) {
    super(message, 'IDEMPOTENCY_ERROR', 409);
    this.name = 'IdempotencyError';
  }
}

module.exports = { PaymentError, ValidationError, IdempotencyError };
```

### Tratamento em Handlers

```javascript
// ✅ Sempre retorne resposta estruturada
const handler = async (event) => {
  try {
    const result = await processPayment(event);
    return {
      statusCode: 200,
      body: JSON.stringify(result),
      headers: { 'Content-Type': 'application/json' }
    };
  } catch (error) {
    logger.error('Payment processing failed', { error, event });
    return errorResponse(error);
  }
};

// ✅ Função de resposta de erro centralizada
function errorResponse(error) {
  const statusCode = error.statusCode || 500;
  return {
    statusCode,
    body: JSON.stringify(error.toJSON()),
    headers: { 'Content-Type': 'application/json' }
  };
}
```

---

## Logging e Observabilidade

### Logger Estruturado

```javascript
// shared/utils/logger.js
const logger = {
  info: (message, context = {}) => {
    console.log(JSON.stringify({
      level: 'INFO',
      timestamp: new Date().toISOString(),
      message,
      ...context
    }));
  },

  error: (message, context = {}) => {
    console.error(JSON.stringify({
      level: 'ERROR',
      timestamp: new Date().toISOString(),
      message,
      ...context
    }));
  },

  warn: (message, context = {}) => {
    console.warn(JSON.stringify({
      level: 'WARN',
      timestamp: new Date().toISOString(),
      message,
      ...context
    }));
  }
};

module.exports = logger;
```

### Uso de Logger

```javascript
// ✅ Log estruturado com contexto
logger.info('Payment processed', {
  tenantId,
  paymentId,
  gateway,
  amount: transaction.amount,
  duration: endTime - startTime
});

logger.error('Gateway unavailable', {
  gateway,
  statusCode: response.status,
  error: error.message,
  retryCount
});

// ❌ Evite console.log simples
console.log('Payment processed');
```

---

## Validação de Entrada

### Validadores Reutilizáveis

```javascript
// shared/utils/validators.js
const validators = {
  // ✅ Validar presença de campo
  required: (value, fieldName) => {
    if (!value) throw new ValidationError(`${fieldName} is required`);
    return value;
  },

  // ✅ Validar contra padrão
  matches: (value, pattern, fieldName) => {
    if (!pattern.test(value)) {
      throw new ValidationError(`${fieldName} is invalid`);
    }
    return value;
  },

  // ✅ Validar tipo
  isString: (value, fieldName) => {
    if (typeof value !== 'string') {
      throw new ValidationError(`${fieldName} must be a string`);
    }
    return value;
  },

  // ✅ Validar dentro de um conjunto
  isOneOf: (value, allowed, fieldName) => {
    if (!allowed.includes(value)) {
      throw new ValidationError(`${fieldName} must be one of: ${allowed.join(', ')}`);
    }
    return value;
  }
};

module.exports = validators;
```

### Uso de Validadores

```javascript
// ✅ Validar na entrada do handler
const handler = async (event) => {
  try {
    const idempotencyKey = validators.required(
      event.headers['x-idempotency-key'],
      'Idempotency-Key'
    );

    const tenantId = validators.required(
      event.requestContext.authorizer?.tenantId,
      'Tenant ID'
    );

    const body = validators.required(event.body, 'Request body');
    const payload = JSON.parse(body);

    // Validação de schema
    validatePaymentSchema(payload);

    return await processPayment({ tenantId, idempotencyKey, payload });
  } catch (error) {
    return errorResponse(error);
  }
};
```

---

## Documentação

### Comentários Úteis

```javascript
// ✅ EXPLIQUE O "POR QUÊ", não o "O QUÊ"
// O circuit breaker é necessário porque o gateway EFI pode ter latência
// alta durante períodos de pico. Após 5 falhas em 5 minutos, redireciona
// para Stripe por 1 minuto
if (stats.Item?.failures >= FAILURE_THRESHOLD) {
  await switchGateway(tenantId, 'stripe');
}

// ❌ DON'T: Comentário redundante
// Incrementar o contador de falhas
failureCount++;

// ✅ JSDoc para funções públicas
/**
 * Normaliza resposta do gateway de pagamento para padrão interno
 * 
 * @param {string} gateway - Nome do gateway (efi, stripe)
 * @param {Object} response - Resposta bruta do gateway
 * @returns {Object} Resposta normalizada com estrutura padrão
 * @throws {ValidationError} Se os dados de resposta são inválidos
 */
function normalizeGatewayResponse(gateway, response) {
  // implementação
}
```

### README em cada módulo

Cada Lambda deve ter um README.md:

```markdown
# Payment Proxy Lambda

## Responsabilidade
Proxy de pagamentos que:
- Valida idempotência
- Roteia para o gateway correto
- Normaliza respostas

## Fluxo
1. Verifica chave de idempotência
2. Escolhe gateway baseado no tenant
3. Chama handler específico
4. Normaliza resposta
5. Salva resultado para idempotência

## Variáveis de Ambiente
- IDEMPOTENCY_TABLE: Tabela DynamoDB
- EFI_API_KEY: Chave API EFI
- STRIPE_API_KEY: Chave API Stripe

## Erros
- 400: Payload inválido ou chave de idempotência faltando
- 401: Tenant não autorizado
- 500: Erro ao processar
```

---

## Clean Code Principles

### SOLID Principles

#### Single Responsibility
```javascript
// ✅ Cada classe/função faz uma coisa
class IdempotencyChecker {
  async check(key) { /* ... */ }
}

class PaymentProcessor {
  async process(payload) { /* ... */ }
}

// ❌ Múltiplas responsabilidades
class PaymentHandler {
  async checkIdempotencyAndProcessPayment() { /* ... */ }
}
```

#### Open/Closed Principle
```javascript
// ✅ Extensível sem modificar código existente
const gatewayHandlers = {
  efi: new EFIHandler(),
  stripe: new StripeHandler(),
  // Fácil adicionar novos gateways
};

function getHandler(gateway) {
  return gatewayHandlers[gateway];
}

// ❌ Requer modificar a função
function routePayment(gateway, data) {
  if (gateway === 'efi') { /* ... */ }
  else if (gateway === 'stripe') { /* ... */ }
  else if (gateway === 'paypal') { /* ... */ } // Modificação
}
```

#### Dependency Injection
```javascript
// ✅ Injete dependências
class PaymentService {
  constructor(dynamoClient, stripClient, logger) {
    this.dynamoClient = dynamoClient;
    this.stripClient = stripClient;
    this.logger = logger;
  }

  async process(payload) {
    this.logger.info('Processing payment');
    // Usa dependências injetadas
  }
}

// ❌ Hardcode de dependências
class PaymentService {
  constructor() {
    this.dynamoClient = new DynamoDBClient();
    this.stripClient = new StripeClient();
  }
}
```

### Functions

```javascript
// ✅ Funções pequenas e focadas
const validatePaymentAmount = (amount) => {
  if (amount <= 0) throw new ValidationError('Amount must be positive');
  if (amount > 999999) throw new ValidationError('Amount exceeds limit');
};

// ✅ Sem side effects não intencionais
const processRefund = async (paymentId) => {
  const payment = await db.getPayment(paymentId);
  return await gateway.refund(payment);
};

// ❌ Função faz muitas coisas
const processPaymentAndNotify = (payload) => {
  // Validar
  // Processar
  // Salvar
  // Enviar email
  // Log
  // Retry
  // Tudo em uma função de 100 linhas
};
```

### DRY (Don't Repeat Yourself)

```javascript
// ✅ Abstraía código duplicado
function createDynamoCommand(table, key, data) {
  return {
    TableName: table,
    Key: key,
    Item: { ...data, timestamp: new Date().toISOString() }
  };
}

// ❌ Repetição
const idempotencyCommand = {
  TableName: process.env.IDEMPOTENCY_TABLE,
  Key: { pk: `TENANT#${id}`, sk: `IDEM#${key}` },
  Item: { response, timestamp: new Date().toISOString() }
};

const metricsCommand = {
  TableName: process.env.METRICS_TABLE,
  Key: { pk: `GATEWAY#${name}`, sk: `WINDOW#${window}` },
  Item: { failures: 5, timestamp: new Date().toISOString() }
};
```

---

## Checklist de Código

Antes de fazer commit, verifique:

- [ ] Sem console.log (use logger)
- [ ] Sem variáveis soltas (const por padrão)
- [ ] Funções < 20 linhas
- [ ] Nomes descritivos (tenantId não id)
- [ ] Erros customizados usados
- [ ] Entrada validada
- [ ] Logging estruturado
- [ ] JSDoc em funções públicas
- [ ] README.md em módulos
- [ ] Sem duplicação de código
- [ ] Responsabilidade única
- [ ] Tratamento de erros robusto

---

## Referências

- [Robert C. Martin - Clean Code](https://www.oreilly.com/library/view/clean-code-a/9780136083238/)
- [AWS Lambda Best Practices](https://docs.aws.amazon.com/lambda/latest/dg/best-practices.html)
- [Node.js Best Practices](https://github.com/goldbergyoni/nodebestpractices)
- [12-Factor App](https://12factor.net/)
