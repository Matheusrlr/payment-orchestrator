require('dotenv').config({ path: '../../.env' });

const axios = require('axios');
const logger = require('../../shared/utils/logger');

(async () => {
  try {
    console.log('Testing direct connection to Efí...');
    
    const clientId = process.env.EFI_CLIENT_ID;
    const clientSecret = process.env.EFI_CLIENT_SECRET;
    const apiUrl = process.env.EFI_API_BASE_URL || 'https://pix.api.efipay.com.br';
    
    if (!clientId || !clientSecret) {
      console.error('❌ Missing credentials in .env');
      console.error('EFI_CLIENT_ID:', clientId);
      console.error('EFI_CLIENT_SECRET:', clientSecret);
      return;
    }
    
    console.log('API URL:', apiUrl);
    console.log('ClientId:', clientId.substring(0,20) + '...');
    
    // Criar credencial básica
    const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
    console.log('Authorization header: Basic ' + credentials.substring(0,20) + '...');
    
    const client = axios.create({
      timeout: 10000,
      headers: {
        'Authorization': `Basic ${credentials}`,
        'Content-Type': 'application/json'
      }
    });
    
    const body = {
      calendario: { expiracao: 3600 },
      devedor: {
        cpf: '12345678909',
        nome: 'Francisco da Silva'
      },
      valor: { original: '123.45' },
      chave: '2c5c7441-a91e-4982-8c25-6105581e18ae',
      solicitacaoPagador: 'Cobrança dos serviços prestados.'
    };
    
    console.log('\nSending payload:');
    console.log(JSON.stringify(body, null, 2));
    console.log('\nConnecting...');
    
    const response = await client.post(`${apiUrl}/v2/cob`, body);
    
    console.log('\n✅ SUCCESS!');
    console.log('Status:', response.status);
    console.log('Response:');
    console.log(JSON.stringify(response.data, null, 2));
    
  } catch (error) {
    console.error('\n❌ Error:', error.message);
    if (error.response) {
      console.error('Status:', error.response.status);
      console.error('Status Text:', error.response.statusText);
      console.error('Data:', error.response.data);
    } else if (error.code) {
      console.error('Error Code:', error.code);
      console.error('Error Details:', error);
    }
  }
})();
