# Módulo de Envio de Pix - Documentação

## Visão Geral

Este módulo implementa a funcionalidade de **envio direto de Pix** via EFI Pagamentos, conforme especificação da API EFI v3.

### Endpoint Suportado

```
PUT /v3/gn/pix/:idEnvio
```

### Características

- ✅ Validação completa de payload conforme especificação EFI
- ✅ Suporte a chave Pix ou dados bancários do favorecido
- ✅ Consulta de status de envios
- ✅ Mock para testes locais
- ✅ Integração com OAuth 2.0 para credenciais reais
- ✅ Logging estruturado e tratamento de erros robusto

---

## Estrutura de Arquivos

```
shared/
├── utils/
│   └── pix-validators.js       # Validadores específicos para Pix

lambdas/proxy/
├── handlers/
│   └── efi-pix-handler.js      # Handler para operações Pix na EFI
├── pix-service.js              # Serviço orquestrador de Pix

scripts/
├── send_pix.js                 # Script de teste via serviço
└── test_efi_pix_send.js        # Script de teste em nível de handler
```

---

## Uso

### 1. Teste Local (Mock)

```bash
# Executar suite de testes com validações
node scripts/test_efi_pix_send.js

# Executar testes de integração via serviço
node scripts/send_pix.js
```

### 2. Teste com API Real

Para testar com a API real do EFI, configure as variáveis de ambiente:

```bash
# Arquivo .env ou variáveis do sistema
EFI_CLIENT_ID=seu_client_id
EFI_CLIENT_SECRET=seu_client_secret
EFI_CERTIFICATE=/caminho/para/certificado.p12
EFI_SANDBOX=false  # true para sandbox
```

Depois, execute com a flag `--real`:

```bash
node scripts/send_pix.js --real
node scripts/test_efi_pix_send.js --real
```

### 3. Integração via Lambda

O módulo pode ser invocado via API Gateway Lambda:

```javascript
const { sendPix, getPixStatus } = require('./lambdas/proxy/pix-service');

// Enviar Pix
const response = await sendPix(event);

// Consultar status
const statusResponse = await getPixStatus(event);
```

---

## Request/Response

### Envio de Pix

**Request:**
```http
PUT /v3/gn/pix/pix-001 HTTP/1.1
Content-Type: application/json
Authorization: Bearer <token>

{
  "valor": "12.34",
  "pagador": {
    "chave": "19974764017",
    "infoPagador": "Segue o pagamento da conta"
  },
  "favorecido": {
    "chave": "joao@meuemail.com"
  }
}
```

**Response (202 Accepted):**
```json
{
  "id": "pix-001",
  "status": "EM_PROCESSAMENTO",
  "valor": "12.34",
  "pagador": {
    "chave": "19974764017"
  },
  "favorecido": {
    "chave": "joao@meuemail.com"
  },
  "createdAt": "2026-03-02T10:30:45Z",
  "updatedAt": "2026-03-02T10:30:45Z",
  "gateway": "efi"
}
```

### Consulta de Status

**Request:**
```http
GET /v3/gn/pix/pix-001 HTTP/1.1
Authorization: Bearer <token>
```

**Response (200 OK):**
```json
{
  "id": "pix-001",
  "status": "REALIZADO",
  "valor": "12.34",
  "pagador": {
    "chave": "19974764017"
  },
  "favorecido": {
    "chave": "joao@meuemail.com"
  },
  "createdAt": "2026-03-02T10:30:45Z",
  "updatedAt": "2026-03-02T10:30:50Z",
  "gateway": "efi"
}
```

---

## Validações

### Campo: `idEnvio`
- **Tipo:** String
- **Tamanho:** 1-35 caracteres
- **Padrão:** `^[a-zA-Z0-9]{1,35}$`
- **Obrigatório:** Sim

### Campo: `valor`
- **Tipo:** String (formato monetário)
- **Padrão:** `\d{1,10}\.\d{2}`
- **Exemplo:** `"12.34"`, `"1500.00"`
- **Obrigatório:** Sim

### Campo: `pagador.chave`
- **Tipo:** String
- **Tamanho:** ≤ 77 caracteres
- **Descrição:** Chave DICT do pagador
- **Obrigatório:** Sim

### Campo: `pagador.infoPagador`
- **Tipo:** String
- **Tamanho:** ≤ 140 caracteres
- **Obrigatório:** Não

### Campo: `favorecido.chave`
- **Tipo:** String
- **Tamanho:** ≤ 77 caracteres
- **Descrição:** Chave DICT do recebedor
- **Obrigatório:** Se não usar `contaBanco`

### Campo: `favorecido.cpf`
- **Tipo:** String
- **Padrão:** `^[0-9]{11}$`
- **Obrigatório:** Não (validação opcional)

### Campo: `favorecido.cnpj`
- **Tipo:** String
- **Padrão:** `^[0-9]{14}$`
- **Obrigatório:** Não (validação opcional)

### Objeto: `favorecido.contaBanco`
Se fornecido, todos os campos abaixo são obrigatórios:

- `nome`: String, ≤ 200 caracteres
- `codigoBanco` (ISPB): String, exatamente 8 dígitos
- `agencia`: String, 1-4 dígitos (sem dígito verificador)
- `conta`: String, dígitos (com dígito verificador, sem traço)
- `tipoConta`: `"cacc"` (corrente) ou `"svgs"` (poupança)
- `cpf` (opcional): `^[0-9]{11}$`
- `cnpj` (opcional): `^[0-9]{14}$`

---

## Status de Resposta

| Status | Descrição |
|--------|-----------|
| `EM_PROCESSAMENTO` | Pix sendo processado |
| `REALIZADO` | Pix enviado com sucesso |
| `NAO_REALIZADO` | Pix não foi realizado (falha) |

---

## Exemplos de Uso

### Exemplo 1: Envio Simples (Chave Pix)

```javascript
const { getEFIPixHandler } = require('./lambdas/proxy/handlers/efi-pix-handler');

const handler = getEFIPixHandler();

const result = await handler.sendPix('pix-123', {
  valor: '150.50',
  pagador: {
    chave: 'seu.email@banco.com'
  },
  favorecido: {
    chave: 'recebedor@banco.com'
  }
});

console.log(result);
// {
//   id: 'pix-123',
//   status: 'EM_PROCESSAMENTO',
//   valor: '150.50',
//   ...
// }
```

### Exemplo 2: Envio com Dados Bancários

```javascript
const result = await handler.sendPix('pix-124', {
  valor: '500.00',
  pagador: {
    chave: '12345678901',
    infoPagador: 'Pagamento de serviços'
  },
  favorecido: {
    contaBanco: {
      nome: 'João da Silva',
      cpf: '12345678901',
      codigoBanco: '00000001',
      agencia: '0001',
      conta: '123456789',
      tipoConta: 'cacc'
    }
  }
});
```

### Exemplo 3: Consulta de Status

```javascript
const status = await handler.getPixStatus('pix-123');

console.log(status);
// {
//   id: 'pix-123',
//   status: 'REALIZADO',
//   ...
// }
```

---

## Tratamento de Erros

O módulo lança exceções estruturadas:

```javascript
try {
  await handler.sendPix('invalid id with spaces', payload);
} catch (error) {
  console.error(error.name);      // "ValidationError"
  console.error(error.message);   // "idEnvio must contain only alphanumeric..."
  console.error(error.details);   // { field: "idEnvio", ... }
}
```

### Tipos de Erro

- **ValidationError**: Validação de entrada falhou
- **GatewayError**: Erro na comunicação com EFI
- **TimeoutError**: Timeout na requisição

---

## Testes

### Suite de Testes Unitários

```bash
node scripts/test_efi_pix_send.js
```

Testa:
- ✓ Envios básicos via chave
- ✓ Envios com dados bancários
- ✓ Campos opcionais
- ✓ Validações de erro
- ✓ Formatos inválidos

### Testes de Integração

```bash
node scripts/send_pix.js
```

Testa:
- ✓ Fluxo completo via serviço
- ✓ Roteirização para gateway
- ✓ Respostas HTTP normalizadas
- ✓ Consulta de status

---

## Variáveis de Ambiente

```bash
# Credenciais EFI
EFI_CLIENT_ID=seu_client_id
EFI_CLIENT_SECRET=seu_client_secret

# Certificado (p12 ou pem)
EFI_CERTIFICATE=/caminho/para/certificado.p12

# Configuração
EFI_SANDBOX=false                      # Usar sandbox
EFI_API_BASE_URL=https://api.efi.com.br  # Base URL (padrão)

# Modo de execução
SKIP_IDEMPOTENCY=true                  # Pular verificação de idempotência (local)
```

---

## Arquitetura

```
API Gateway
    ↓
pix-service.js (orquestração)
    ├── Validação (pix-validators.js)
    ├── Roteirização
    └── efi-pix-handler.js (EFI Pagamentos)
         ├── OAuth (token management)
         ├── sendPix() → PUT /v3/gn/pix/:idEnvio
         ├── getPixStatus() → GET /v3/gn/pix/:idEnvio
         └── Simulação local (mock)
```

---

## Próximos Passos

- [ ] Suporte a webhooks para notificação de status
- [ ] Retry automático com circuit breaker
- [ ] Dashboard de rastreamento de Pix
- [ ] Suporte a outros gateways (Stripe, etc.)
- [ ] Testes de carga e performance

---

## Referências

- [Documentação API EFI v3](https://doc.efi.com.br/)
- [Spec Pix BCB](https://www.bcb.gov.br/estabilidadefinanceira/pix)
