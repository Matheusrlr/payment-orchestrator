# Payment Orchestrator

Orquestrador de pagamentos serverless com suporte a múltiplos gateways, implementado seguindo Clean Code Principles e melhores práticas de AWS.

## 📋 Visão Geral

**Payment Orchestrator** é uma arquitetura serverless que gerencia requisições de pagamento em tempo real e processa webhooks de forma assíncrona.

### Características

- ✅ **Multi-gateway**: Suporte a EFI (Pix) e Stripe com extensibilidade fácil
- ✅ **Idempotência garantida**: Cache de requisições para evitar duplicação
- ✅ **Processamento assíncrono**: Webhooks enfileirados em SQS
- ✅ **Clean Code**: Aplicação de SOLID, DRY, responsabilidade única
- ✅ **Logging estruturado**: JSON em CloudWatch para observabilidade
- ✅ **Tratamento de erro robusto**: Erros customizados e recovery automático
- ✅ **Circuit breaker**: Proteção contra gateways problemáticos
- ✅ **Validação em múltiplas camadas**: Entrada, schema, tipos

## 🏗️ Arquitetura

```
┌─────────────────┐
│  API Gateway    │
└────────┬────────┘
         │
    ┌────▼─────────────────┐
    │  Proxy Lambda         │
    │  (Payment Handler)    │
    ├──────────────────────┤
    │ - Validação          │
    │ - Idempotência       │
    │ - Roteirização       │
    │ - Normalização       │
    └────┬──────────┬──────┘
         │          │
    ┌────▼──┐  ┌───▼────┐
    │  EFI  │  │ Stripe │
    │Gateway│  │Gateway │
    └───────┘  └────────┘

            ↓ Webhook Response ↓

    ┌────────────────────┐
    │   API Gateway      │
    │  /webhooks/{id}    │
    └────────┬───────────┘
             │
    ┌────────▼────────────┐
    │ Webhook Receiver     │
    │ Lambda              │
    ├─────────────────────┤
    │ - Validação         │
    │ - Enfileiramento    │
    └────────┬────────────┘
             │
    ┌────────▼────────────┐
    │   SQS Queue         │
    │ (Event Batching)    │
    └────────┬────────────┘
             │
    ┌────────▼────────────┐
    │ Worker Lambda       │
    │ (Async Processing)  │
    ├─────────────────────┤
    │ - Normalização      │
    │ - Resolução Cliente │
    │ - Entrega c/ Retry  │
    └────────┬────────────┘
             │
    ┌────────▼────────────┐
    │ Cliente Callback    │
    │ URL                 │
    └─────────────────────┘
```

## 📁 Estrutura do Projeto

```
payment-orchestrator/
├── STANDARDS.md                    # Padrões de desenvolvimento
├── README.md                       # Este arquivo
│
├── lambdas/
│   ├── proxy/                      # Handler de pagamento em tempo real
│   │   ├── index.js                # Entry point
│   │   ├── service.js              # Orquestração principal
│   │   ├── README.md               # Documentação
│   │   ├── package.json
│   │   ├── handlers/
│   │   │   ├── gateway-handler.js  # Implementações de gateways
│   │   │   ├── response-handler.js # Formatação HTTP
│   │   │   └── response-normalizer.js
│   │   └── validators/
│   │       └── payment-validator.js
│   │
│   ├── webhook-receiver/           # Recebe webhooks
│   │   ├── index.js
│   │   ├── service.js
│   │   ├── README.md
│   │   ├── package.json
│   │   └── handlers/
│   │       └── response-handler.js
│   │
│   └── worker/                     # Processa webhooks
│       ├── index.js
│       ├── service.js
│       ├── README.md
│       ├── package.json
│       ├── handlers/
│       │   ├── webhook-normalizer.js
│       │   └── client-resolver.js
│       └── ...
│
├── shared/
│   ├── utils/
│   │   ├── errors.js               # Erros customizados
│   │   ├── logger.js               # Logging estruturado
│   │   ├── validators.js           # Funções de validação
│   │   └── circuit-breaker.js      # Pattern circuit breaker
│   │
│   └── constants/
│       ├── payment-gateways.js     # Config de gateways
│       └── error-codes.js          # Códigos de erro
│
├── docs/
│   ├── openapi.yaml                # Documentação API
│   └── skills-registry.json        # Registro de skills
│
└── skills-catalog/                 # Catálogo de skills (referência)
    └── ...
```

## 🚀 Quick Start

### Instalação

```bash
# Instalar dependências de cada Lambda
cd lambdas/proxy && npm install
cd ../webhook-receiver && npm install
cd ../worker && npm install
```

### Variáveis de Ambiente

```bash
# Lambda: Proxy
IDEMPOTENCY_TABLE=payment-idempotency
METRICS_TABLE=gateway-metrics
EFI_API_KEY=oauth_token_xxx
STRIPE_API_KEY=sk_live_xxx

# Lambda: Webhook Receiver
WEBHOOK_QUEUE_URL=https://sqs.us-east-1.amazonaws.com/123/webhook-queue

# Todos (Opcional)
DEBUG=false
```

### Deployment

```bash
# Com CDK
cdk deploy

# Com SAM
sam deploy --guided

# Com Terraform
terraform apply
```

## 📚 Documentação

### Cada Lambda tem seu próprio README:

- [Proxy Lambda](lambdas/proxy/README.md) - Processamento em tempo real
- [Webhook Receiver](lambdas/webhook-receiver/README.md) - Recepção de webhooks
- [Worker Lambda](lambdas/worker/README.md) - Processamento assíncrono

### Padrões de Desenvolvimento

Veja [STANDARDS.md](STANDARDS.md) para:

- ✅ Estrutura de módulos
- ✅ Convenções de código
- ✅ Tratamento de erros
- ✅ Logging e observabilidade
- ✅ Validação de entrada
- ✅ Clean Code principles
- ✅ SOLID principles

## 🔧 Clean Code Aplicado

### Single Responsibility Principle

Cada arquivo tem **uma** responsabilidade:

```javascript
// ✅ BOM: Cada coisa em seu lugar
- index.js: Handler AWS Lambda
- service.js: Lógica de negócio
- handlers/:arquivo.js: Funcionalidades específicas
- validators/:arquivo.js: Validação

// ❌ RUIM: Tudo em um arquivo
- index.js com 200+ linhas fazendo tudo
```

### Dependency Injection

```javascript
// ✅ Injetar dependências
class PaymentService {
  constructor(logger, validators, db) {
    this.logger = logger;
    this.validators = validators;
    this.db = db;
  }
}

// ❌ Hardcode
class PaymentService {
  constructor() {
    this.logger = new Logger();
    this.db = new DynamoDB();
  }
}
```

### Error Handling

```javascript
// ✅ Erros customizados estruturados
try {
  validateInput(request);
} catch (error) {
  if (error instanceof ValidationError) {
    return { statusCode: 400, body: error.toJSON() };
  }
}

// ❌ Tratamento genérico
if (!request.amount) {
  return { statusCode: 500, body: "error" };
}
```

### Logging Estruturado

```javascript
// ✅ Contexto estruturado em JSON
logger.error('Payment failed', {
  tenantId,
  paymentId,
  gateway,
  error: error.message,
  statusCode: error.statusCode
});

// ❌ Mensagem simples
console.log('Payment failed: ' + error.message);
```

### DRY (Don't Repeat Yourself)

```javascript
// ✅ Abstração reutilizável
function createDynamoKey(tenantId, idempotencyKey) {
  return {
    pk: `TENANT#${tenantId}`,
    sk: `IDEM#${idempotencyKey}`
  };
}

// ❌ Repetição
const key1 = { pk: `TENANT#${id}`, sk: `IDEM#${key}` };
const key2 = { pk: `TENANT#${id}`, sk: `IDEM#${key}` };
```

## 🧪 Testes

```bash
# Unit tests
npm test

# Integration tests
npm run test:integration

# Load tests
npm run test:load

# Coverage
npm run test:coverage
```

## 📊 Monitoramento

### CloudWatch Metrics

- `PaymentProcessed`: Pagamentos processados
- `PaymentFailed`: Falhas no processamento
- `WebhookReceived`: Webhooks recebidos
- `WebhookDelivered`: Webhooks entregues
- `GatewayLatency`: Latência por gateway
- `CircuitBreakerTriggered`: Aberturas de circuit breaker

### CloudWatch Logs

Logs estruturados em JSON com:

```json
{
  "level": "INFO",
  "timestamp": "2024-02-26T10:30:00Z",
  "message": "Payment processed",
  "tenantId": "tenant_123",
  "paymentId": "pay_456",
  "durationMs": 245
}
```

### X-Ray Tracing

Rastreamento distribuído habilitado para:

- Chamadas entre Lambdas
- Chamadas a serviços AWS
- Chamadas a gateways

## 🔐 Segurança

### Implementado

- ✅ Validação em múltiplas camadas
- ✅ Idempotência para evitar duplicação
- ✅ Mascaramento de segredos em logs
- ✅ Timeout em requisições HTTP
- ✅ Circuit breaker contra cascata de falhas
- ✅ Separação de responsabilidades (hard to exploit)

### Recomendado

- Incluir autenticação OAuth2 em webhooks
- Validar assinatura HMAC
- Rate limiting por tenant
- WAF na API Gateway
- Encriptação em rest e em trânsito
- Auditoria de alterações críticas

## 🛠️ Extensibilidade

### Adicionar Novo Gateway

1. Criar handler em `lambdas/proxy/handlers/gateway-handler.js`
2. Adicionar normalização em `lambdas/proxy/handlers/response-normalizer.js`
3. Adicionar normalização de webhook em `lambdas/worker/handlers/webhook-normalizer.js`
4. Registrar em constantes `shared/constants/payment-gateways.js`
5. Adicionar testes

### Adicionar Novo Tipo de Webhook

1. Estender `normalizeWebhookFromGateway()` em worker
2. Adicionar mapeamento de status
3. Adicionar validação de payload
4. Documentar formato

## 📈 Performance

### Latência

- Proxy: ~100-500ms (pode variar com gateway)
- Webhook Receiver: ~50ms
- Worker: ~100-1000ms (depende de callback)

### Throughput

- Proxy: ~100 requests/segundo (scalável)
- Webhook Receiver: ~200 requests/segundo
- Worker: ~10-50 webhooks/segundo

### Custo

- Lambda: ~$0.0000002 por invocação
- DynamoDB: ~$1.25/GB de storage
- SQS: ~$0.40 por 1 milhão de requisiços

## 🚨 Troubleshooting

### Pagamento lento

1. Verificar latência do gateway
2. Aumentar timeout em `service.js`
3. Verificar limits de DynamoDB
4. Verificar network connectivity

### Webhooks não chegando

1. Verificar fila SQS
2. Verificar logs do worker
3. Validar URL de callback
4. Verificar firewall/SG

### Muitos erros de validation

1. Verificar formato do payload
2. Comparar com esquema esperado
3. Validar tipos de dados
4. Verificar campos obrigatórios

## 📝 Licença

MIT

## 🤝 Contribuindo

1. Leia [STANDARDS.md](STANDARDS.md)
2. Siga Clean Code principles
3. Adicione testes
4. Documente mudanças
5. Faça PR com descrição clara

## 📞 Suporte

- Documentação: Veja [STANDARDS.md](STANDARDS.md)
- Issues: Crie issue com template
- Discussions: Perguntas em Discussions
- Email: tech@example.com


```text
 ____                               _   
|  _ \ __ _ _   _ _ __ ___   ___ _ _| |_ 
| |_) / _` | | | | '_ ` _ \ / _ \ '_ \ __|
|  __/ (_| | |_| | | | | | |  __/ | | |_ 
|_|   \__,_|\__, |_| |_| |_|\___|_|  \__|
            |___/                        
  ___          _               _             _             
 / _ \ _ __ __| |__   ___  ___| |_ _ __ __ _| |_ ___  _ __ 
| | | | '__/ __| '_ \ / _ \/ __| __| '__/ _` | __/ _ \| '__|
| |_| | | | (__| | | |  __/ (__| |_| | | (_| | || (_) | |   
 \___/|_|  \___|_| |_|\___|\___|\__|_|  \__,_|\__\___/|_|


O Payment Orchestrator é um Backend as a Service (BaaS) projetado para abstrair e centralizar integrações com múltiplos gateways de pagamento.

Através de uma SDK unificada, o sistema oferece um mecanismo inteligente de Circuit Breaker que detecta instabilidades na API principal do cliente e roteia a transação automaticamente para um gateway de fallback, garantindo que nenhuma venda seja perdida por falhas de infraestrutura de terceiros.

 Funcionalidades Principais (O Diferencial)
🔄 Hot-Swap Automático (Circuit Breaker): O sistema monitora erros (4XX/5XX) do provedor de pagamento. Ao atingir um limite crítico, "abre o circuito" e roteia as próximas cobranças para um provedor secundário de forma invisível para o cliente final.

🔀 Switch Manual: Alterne o gateway principal a qualquer momento com um clique via Dashboard, sem alterar uma linha de código no seu sistema.

 Webhooks Normalizados: Recebemos os webhooks de confirmação da Efí, Stripe ou Asaas, convertemos para um JSON padrão único e enviamos para a sua aplicação.

 Entrega de Webhook Garantida: Se o seu servidor estiver fora do ar, nossa mensageria (AWS SQS) retém e tenta reenviar a notificação de pagamento até que seu sistema responda com sucesso.

📊 Dashboard de Observabilidade: Acompanhe métricas de requisições, uptime das APIs, custos e faturamento através de um painel intuitivo.

 Arquitetura Serverless
A infraestrutura foi desenhada para ter alta disponibilidade e custo base próximo a zero (Pay-per-use), utilizando os seguintes serviços:

SDKs: Node.js e Python (Apenas um ponto de integração no cliente).

API / Core: AWS API Gateway + AWS Lambda (Serverless e escalável).

Mensageria: AWS SQS (Fila para processamento seguro de Webhooks).

Estado do Disjuntor: Amazon DynamoDB (NoSQL de ultra-baixa latência para controle do Circuit Breaker em tempo real).

Banco de Dados: PostgreSQL (Armazenamento relacional e seguro das transações para faturamento mensal).

Frontend (Dashboard): Ruby on Rails.

💻 Fluxo de Integração (Como Funciona)
O cliente cria uma conta no Dashboard  e cadastra suas credenciais do Efí, Stripe e Asaas (guardadas de forma criptografada).

O cliente instala a SDK (Node/Python) em seu servidor.

A SDK envia uma solicitação de pagamento padronizada para a nossa API na AWS.

O nosso Orquestrador (Lambda) verifica a saúde do gateway principal. Se estiver online, repassa a cobrança. Se estiver instável, o Circuit Breaker ativa o provedor reserva automaticamente.

O cliente recebe o link de pagamento ou o payload Pix.

Assim que o cliente final paga, recebemos o webhook, normalizamos via Worker e entregamos para o sistema de origem via SQS.
