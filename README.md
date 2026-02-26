
<div align="center">

Plaintext
  _____                               _      ___           _               _             _             
 |  __ \                             | |    / _ \         | |             | |           | |            
 | |__) |_ _ _   _ _ __ ___   ___ _ _| |_  | | | |_ __ ___| |__   ___  ___| |_ _ __ __ _| |_ ___  _ __ 
 |  ___/ _` | | | | '_ ` _ \ / _ \ '_ \ __| | | | | '__/ __| '_ \ / _ \/ __| __| '__/ _` | __/ _ \| '__|
 | |  | (_| | |_| | | | | | |  __/ | | \ |_ | |_| | | | (__| | | |  __/ (__| |_| | | (_| | || (_) | |   
 |_|   \__,_|\__, |_| |_| |_|\___|_| |_|\__| \___/|_|  \___|_| |_|\___|\___|\__|_|  \__,_|\__\___/|_|   
              __/ |                                                                                    
             |___/                                                                                     
Resiliência, Padronização e Orquestração de Pagamentos em Nuvem

</div>

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
