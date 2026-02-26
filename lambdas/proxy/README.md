# Payment Proxy Lambda

Proxy de pagamentos que orquestra requisições entre múltiplos gateways de pagamento.

## Responsabilidades

- ✅ Validar integridade e autenticação de requisições
- ✅ Verificar idempotência para evitar duplicação
- ✅ Rotear para o gateway de pagamento apropriado
- ✅ Normalizar respostas de diferentes gateways
- ✅ Armazenar resultados para recuperação

## Fluxo de Processamento

```
1. Receber requisição
   ├─ Validar headers (Idempotency-Key)
   ├─ Validar contexto de autorização (Tenant, Gateway)
   └─ Validar payload JSON

2. Verificar Idempotência
   ├─ Buscar em DynamoDB
   ├─ Se encontrado → retornar cached
   └─ Se não encontrado → continuar

3. Validar Dados de Pagamento
   ├─ Verificar campos obrigatórios
   ├─ Validar tipos e ranges
   └─ Validar enums

4. Processar no Gateway
   ├─ Rotear para handler específico
   ├─ Fazer chamada à API
   └─ Tratar erros

5. Normalizar Resposta
   ├─ Mapear campos gateway-específicos
   ├─ Gerar ID de orquestração
   └─ Estruturar resposta padrão

6. Salvar para Idempotência
   ├─ Armazenar em DynamoDB
   ├─ Configurar TTL de 24h
   └─ Retornar resposta normalizando
```

## Estrutura de Arquivos

```
lambdas/proxy/
├── index.js                    # Handler Lambda (entry point)
├── service.js                  # Orquestração principal
├── handlers/
│   ├── gateway-handler.js      # Implementações de gateways
│   ├── response-handler.js     # Formatação de respostas HTTP
│   └── response-normalizer.js  # Padronizar respostas
├── validators/
│   └── payment-validator.js    # Validação de payload
├── package.json                # Dependências
└── README.md                   # Este arquivo
```

## Dependências

```json
{
  "axios": "^1.6.0",
  "@aws-sdk/client-dynamodb": "^3.0.0",
  "@aws-sdk/lib-dynamodb": "^3.0.0"
}
```

## Variáveis de Ambiente

| Variável | Descrição | Exemplo |
|----------|-----------|---------|
| `IDEMPOTENCY_TABLE` | Tabela DynamoDB para idempotência | `payment-idempotency` |
| `METRICS_TABLE` | Tabela DynamoDB para métricas | `gateway-metrics` |
| `EFI_API_KEY` | Chave API da EFI | `oauth_token_...` |
| `STRIPE_API_KEY` | Chave API do Stripe | `sk_live_...` |
| `DEBUG` | Ativar logs de debug | `true` / `false` |

## Códigos de Erro

### 400 Bad Request
- **VALIDATION_ERROR**: Payload inválido ou campos faltando
- **MISSING_HEADER**: Cabeçalho obrigatório ausente

### 401 Unauthorized
- **AUTHENTICATION_ERROR**: Tenant não autorizado

### 409 Conflict
- **IDEMPOTENCY_ERROR**: Requisição duplicada (cache de resposta anterior)

### 502 Bad Gateway
- **GATEWAY_ERROR**: Erro ao comunicar com gateway
- **GATEWAY_TIMEOUT**: Timeout na requisição

### 503 Service Unavailable
- **CIRCUIT_BREAKER_OPEN**: Gateway indisponível (muitas falhas)

### 500 Internal Server Error
- **INTERNAL_ERROR**: Erro não tratado no sistema

## Exemplos

### Requisição

```bash
curl -X POST https://api.example.com/payments \
  -H "Content-Type: application/json" \
  -H "X-Idempotency-Key: 550e8400-e29b-41d4-a716-446655440000" \
  -H "Authorization: Bearer token" \
  -d '{
    "amount": 99.99,
    "currency": "BRL",
    "description": "Compra de produto XYZ",
    "customerId": "cust_123",
    "metadata": {
      "orderId": "order_456"
    }
  }'
```

### Resposta de Sucesso (201 Created)

```json
{
  "id": "orch_1v9b1q5_a1b2c3d4e",
  "gateway": "efi",
  "gateway_id": "efi_1702000000000",
  "status": "pending",
  "payment_type": "pix",
  "created_at": "2024-02-26T10:30:00Z",
  "data": {
    "qr_code": "00020126580014br.gov.bcb.pix...",
    "copy_paste": "00020126580014br.gov.bcb.pix...",
    "expires_at": "2024-02-26T11:30:00Z"
  }
}
```

### Resposta de Erro (400)

```json
{
  "error": "ValidationError",
  "message": "amount is required",
  "code": "VALIDATION_ERROR",
  "timestamp": "2024-02-26T10:30:00Z",
  "details": {
    "field": "amount"
  }
}
```

## Implementação de Novo Gateway

Para adicionar suporte a um novo gateway:

1. **Criar handler em `handlers/gateway-handler.js`**:
   ```javascript
   class NewGatewayHandler extends GatewayHandler {
     constructor() {
       super('new-gateway');
     }
     async processPayment(payload) { /* ... */ }
   }
   ```

2. **Adicionar normalização em `handlers/response-normalizer.js`**:
   ```javascript
   function normalizeNewGatewayResponse(response) { /* ... */ }
   ```

3. **Registrar na fábrica**:
   ```javascript
   function getGatewayHandler(gatewayName) {
     case 'new-gateway':
       return new NewGatewayHandler();
   }
   ```

4. **Atualizar validações em `shared/constants/payment-gateways.js`**

## Clean Code Principles Aplicados

- ✅ **Single Responsibility**: Cada arquivo tem uma responsabilidade
- ✅ **Dependency Injection**: Dependências são injetadas
- ✅ **Error Handling**: Erros customizados estruturados
- ✅ **Logging**: Logs estruturados em JSON
- ✅ **Validation**: Entrada validada em múltiplas camadas
- ✅ **DRY**: Código duplicado refatorado
- ✅ **SOLID Principles**: Arquitetura extensível
- ✅ **Documentation**: JSDoc em funções públicas

## Testes

```bash
# Unit tests
npm test

# Integration tests  
npm run test:integration

# Load tests
npm run test:load
```

## Monitoramento

Métricas disponíveis em CloudWatch:

- `PaymentProcessed`: Pagamentos processados com sucesso
- `PaymentFailed`: Falhas no processamento
- `GatewayLatency`: Latência de cada gateway
- `CircuitBreakerTriggered`: Aberturas do circuit breaker

## Referências

- [AWS Lambda Best Practices](https://docs.aws.amazon.com/lambda/latest/dg/best-practices.html)
- [Clean Code Principles](../../STANDARDS.md)
- [Payment Processing Patterns](https://martinfowler.com/articles/patterns-of-distributed-systems/)
