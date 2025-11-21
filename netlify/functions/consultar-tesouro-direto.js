exports.handler = async function(event, context) {
  // Headers CORS
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Content-Type': 'application/json'
  };

  // Handle preflight
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  try {
    const BRAPI_TOKEN = 'oHdh8QdU6rz92ZQEobtwAq';
    
    // Chamar API da Brapi para pegar dados do Tesouro Direto
    const response = await fetch(
      `https://brapi.dev/api/v2/prime-rate?token=${BRAPI_TOKEN}`,
      {
        method: 'GET',
        headers: { 'Accept': 'application/json' }
      }
    );

    if (!response.ok) {
      throw new Error(`Brapi API error: ${response.status}`);
    }

    const data = await response.json();
    
    // Filtrar apenas dados do Tesouro Direto
    const tesouro = data.prime_rate || [];
    
    // Organizar dados de forma mais legível
    const resultado = {
      data_atualizacao: new Date().toISOString().split('T')[0],
      titulos: tesouro.map(titulo => ({
        nome: titulo.name || 'N/A',
        taxa_compra: titulo.buy ? `${titulo.buy}%` : 'N/A',
        taxa_venda: titulo.sell ? `${titulo.sell}%` : 'N/A',
        vencimento: titulo.maturityDate || 'N/A',
        valor_minimo: titulo.minInvestment ? 
          `R$ ${parseFloat(titulo.minInvestment).toLocaleString('pt-BR', {minimumFractionDigits: 2})}` : 
          'N/A'
      })),
      total_titulos: tesouro.length,
      fonte: 'Brapi Pro API'
    };

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify(resultado, null, 2)
    };

  } catch (error) {
    console.error('Erro:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        erro: 'Erro ao consultar Tesouro Direto',
        mensagem: error.message
      })
    };
  }
};
