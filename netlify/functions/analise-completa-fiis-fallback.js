// Netlify Function: Análise Completa de FIIs com Fallback Triplo
// Estratégia: Brapi → Dados de Mercado → Status Invest (scraping)

const BRAPI_TOKEN = process.env.BRAPI_TOKEN || 'oHdhsQdU6rz92ZQEobtwAq';
const DADOS_MERCADO_TOKEN = process.env.DADOS_MERCADO_TOKEN || ''; // Aguardando resposta
const CACHE_DURATION = 3600; // 1 hora em segundos

// Cache em memória (persiste entre invocações)
const cache = new Map();

exports.handler = async (event, context) => {
  // Headers CORS
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Content-Type': 'application/json',
  };

  // Preflight
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  try {
    // Pegar ticker do query string ou body
    const ticker = event.queryStringParameters?.ticker || 
                   JSON.parse(event.body || '{}').ticker;

    if (!ticker) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ 
          erro: 'Ticker não fornecido',
          exemplo: '?ticker=XPML11'
        })
      };
    }

    const tickerUpper = ticker.toUpperCase();

    // Verificar cache
    const cacheKey = `fii_${tickerUpper}`;
    const cached = cache.get(cacheKey);
    if (cached && (Date.now() - cached.timestamp) < CACHE_DURATION * 1000) {
      console.log(`[CACHE HIT] ${tickerUpper}`);
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          ...cached.data,
          fonte: cached.data.fonte,
          cache: true
        })
      };
    }

    console.log(`[CACHE MISS] ${tickerUpper} - Iniciando busca com fallback`);

    // 🔥 SEMPRE buscar preço atual da Brapi (é confiável e rápido)
    let precoAtual = null;
    let dadosBrapi = null;
    try {
      console.log(`[BRAPI] Buscando preço atual de ${tickerUpper}...`);
      dadosBrapi = await buscarBrapi(tickerUpper);
      precoAtual = dadosBrapi.preco_atual;
      console.log(`[BRAPI] ✅ Preço atual: R$ ${precoAtual}`);
    } catch (error) {
      console.log(`[BRAPI] ⚠️ Não conseguiu buscar preço: ${error.message}`);
    }

    // 🔥 ESTRATÉGIA 1: Tentar usar dividendos da Brapi se disponíveis
    try {
      console.log(`[BRAPI] Verificando dividendos de ${tickerUpper}...`);
      const brapiData = dadosBrapi || await buscarBrapi(tickerUpper);
      
      if (brapiData && brapiData.dividendos && brapiData.dividendos.length > 0) {
        console.log(`[BRAPI] ✅ Sucesso! ${brapiData.dividendos.length} dividendos encontrados`);
        
        // Salvar no cache
        cache.set(cacheKey, {
          timestamp: Date.now(),
          data: brapiData
        });

        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({
            ...brapiData,
            fonte: 'Brapi Pro',
            cache: false
          })
        };
      }
      
      console.log(`[BRAPI] ⚠️ Sem dados de dividendos, tentando próxima fonte...`);
    } catch (error) {
      console.log(`[BRAPI] ❌ Erro: ${error.message}`);
    }

    // 🔥 ESTRATÉGIA 2: Tentar Dados de Mercado (se tiver token)
    if (DADOS_MERCADO_TOKEN) {
      try {
        console.log(`[DADOS_MERCADO] Tentando ${tickerUpper}...`);
        const dadosMercadoData = await buscarDadosMercado(tickerUpper);
        
        if (dadosMercadoData && dadosMercadoData.dividendos && dadosMercadoData.dividendos.length > 0) {
          console.log(`[DADOS_MERCADO] ✅ Sucesso! ${dadosMercadoData.dividendos.length} dividendos encontrados`);
          
          // Salvar no cache
          cache.set(cacheKey, {
            timestamp: Date.now(),
            data: dadosMercadoData
          });

          return {
            statusCode: 200,
            headers,
            body: JSON.stringify({
              ...dadosMercadoData,
              fonte: 'Dados de Mercado',
              cache: false
            })
          };
        }
        
        console.log(`[DADOS_MERCADO] ⚠️ Sem dados, tentando próxima fonte...`);
      } catch (error) {
        console.log(`[DADOS_MERCADO] ❌ Erro: ${error.message}`);
      }
    }

    // 🔥 ESTRATÉGIA 3: Scraping do Status Invest (última tentativa)
    try {
      console.log(`[STATUS_INVEST] Tentando scraping de ${tickerUpper}...`);
      const statusInvestData = await buscarStatusInvest(tickerUpper, precoAtual);
      
      if (statusInvestData && statusInvestData.dividendos && statusInvestData.dividendos.length > 0) {
        console.log(`[STATUS_INVEST] ✅ Sucesso! ${statusInvestData.dividendos.length} dividendos encontrados`);
        
        // Salvar no cache
        cache.set(cacheKey, {
          timestamp: Date.now(),
          data: statusInvestData
        });

        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({
            ...statusInvestData,
            fonte: 'Status Invest (Scraping)',
            cache: false
          })
        };
      }
      
      console.log(`[STATUS_INVEST] ⚠️ Sem dados encontrados`);
    } catch (error) {
      console.log(`[STATUS_INVEST] ❌ Erro: ${error.message}`);
    }

    // Se chegou aqui, nenhuma fonte funcionou
    return {
      statusCode: 404,
      headers,
      body: JSON.stringify({
        erro: 'Nenhuma fonte de dados disponível retornou informações',
        ticker: tickerUpper,
        tentativas: [
          'Brapi Pro - Sem dados de dividendos',
          DADOS_MERCADO_TOKEN ? 'Dados de Mercado - Sem dados' : 'Dados de Mercado - Token não configurado',
          'Status Invest - Falha no scraping'
        ]
      })
    };

  } catch (error) {
    console.error('[ERRO GERAL]', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        erro: 'Erro interno do servidor',
        detalhes: error.message
      })
    };
  }
};

// ========================================
// FUNÇÃO 1: Buscar na Brapi Pro
// ========================================
async function buscarBrapi(ticker) {
  const url = `https://brapi.dev/api/quote/${ticker}?range=5y&interval=1mo&fundamental=true&dividends=true&token=${BRAPI_TOKEN}`;
  
  const response = await fetch(url);
  
  if (!response.ok) {
    throw new Error(`Brapi retornou ${response.status}`);
  }

  const data = await response.json();
  
  if (!data.results || data.results.length === 0) {
    throw new Error('FII não encontrado na Brapi');
  }

  const fii = data.results[0];

  // Processar dividendos
  const dividendos = (fii.dividendsData?.cashDividends || []).map(div => ({
    data_com: div.date,
    data_pagamento: div.paymentDate || div.date,
    valor: div.rate,
    tipo: 'Rendimento'
  }));

  return {
    ticker: fii.symbol,
    nome: fii.longName || fii.shortName,
    preco_atual: fii.regularMarketPrice,
    variacao_dia: fii.regularMarketChangePercent,
    dividend_yield_12m: calcularDY12M(dividendos, fii.regularMarketPrice),
    dividendos: dividendos.sort((a, b) => 
      new Date(b.data_com) - new Date(a.data_com)
    ),
    indicadores: {
      preco_atual: fii.regularMarketPrice,
      variacao_dia: fii.regularMarketChangePercent,
      volume: fii.regularMarketVolume,
      market_cap: fii.marketCap
    }
  };
}

// ========================================
// FUNÇÃO 2: Buscar no Dados de Mercado
// ========================================
async function buscarDadosMercado(ticker) {
  if (!DADOS_MERCADO_TOKEN) {
    throw new Error('Token Dados de Mercado não configurado');
  }

  // Endpoint para dividendos de FIIs
  const url = `https://api.dadosdemercado.com.br/v1/tickers/${ticker}/dividends`;
  
  const response = await fetch(url, {
    headers: {
      'Authorization': `Bearer ${DADOS_MERCADO_TOKEN}`
    }
  });

  if (!response.ok) {
    throw new Error(`Dados de Mercado retornou ${response.status}`);
  }

  const data = await response.json();

  if (!data || !data.dividends || data.dividends.length === 0) {
    throw new Error('Sem dados de dividendos');
  }

  // Processar dividendos
  const dividendos = data.dividends.map(div => ({
    data_com: div.date,
    data_pagamento: div.payment_date || div.date,
    valor: div.value,
    tipo: div.type || 'Rendimento'
  }));

  return {
    ticker: ticker,
    nome: data.name || ticker,
    preco_atual: data.price || null,
    dividend_yield_12m: calcularDY12M(dividendos, data.price),
    dividendos: dividendos.sort((a, b) => 
      new Date(b.data_com) - new Date(a.data_com)
    ),
    indicadores: {
      preco_atual: data.price
    }
  };
}

// ========================================
// FUNÇÃO 3: Scraping do Status Invest
// ========================================
async function buscarStatusInvest(ticker, precoAtualBrapi = null) {
  // API não-oficial do Status Invest
  const url = `https://statusinvest.com.br/fii/companytickerprovents?ticker=${ticker}&chartProventsType=2`;
  
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Accept': 'application/json'
    }
  });

  if (!response.ok) {
    throw new Error(`Status Invest retornou ${response.status}`);
  }

  const data = await response.json();

  if (!data.assetEarningsModels || data.assetEarningsModels.length === 0) {
    throw new Error('Sem dados de dividendos no Status Invest');
  }

  // Processar dividendos
  const dividendos = data.assetEarningsModels.map(div => ({
    data_com: div.ed,
    data_pagamento: div.pd,
    valor: div.v,
    tipo: div.et
  }));

  // Usar preço da Brapi se disponível, senão tentar buscar do Status Invest
  let precoAtual = precoAtualBrapi;
  
  if (!precoAtual) {
    try {
      const urlPreco = `https://statusinvest.com.br/fii/tickerprice?ticker=${ticker}&type=4`;
      const responsePreco = await fetch(urlPreco, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept': 'application/json'
        }
      });
      
      if (responsePreco.ok) {
        const dataPreco = await responsePreco.json();
        precoAtual = dataPreco.price || dataPreco[0]?.price || null;
      }
    } catch (error) {
      console.log('[STATUS_INVEST] Não conseguiu buscar preço atual');
    }
  }

  return {
    ticker: ticker,
    nome: ticker,
    preco_atual: precoAtual,
    dividend_yield_12m: calcularDY12M(dividendos, precoAtual),
    dividendos: dividendos.sort((a, b) => {
      const dateA = parseDataBR(a.data_com);
      const dateB = parseDataBR(b.data_com);
      return dateB - dateA;
    }),
    indicadores: {
      preco_atual: precoAtual,
      rendimento_ano_atual: data.earningsThisYear ? 
        parseFloat(data.earningsThisYear.replace(',', '.')) : null,
      rendimento_ano_anterior: data.earningsLastYear ? 
        parseFloat(data.earningsLastYear.replace(',', '.')) : null
    }
  };
}

// ========================================
// FUNÇÕES AUXILIARES
// ========================================

function calcularDY12M(dividendos, preco) {
  if (!preco || !dividendos || dividendos.length === 0) return null;

  const hoje = new Date();
  const umAnoAtras = new Date(hoje.getFullYear() - 1, hoje.getMonth(), hoje.getDate());

  const dividendos12m = dividendos.filter(div => {
    const dataCom = typeof div.data_com === 'string' && div.data_com.includes('/') 
      ? parseDataBR(div.data_com)
      : new Date(div.data_com);
    return dataCom >= umAnoAtras;
  });

  const totalDividendos = dividendos12m.reduce((sum, div) => sum + div.valor, 0);
  return ((totalDividendos / preco) * 100).toFixed(2);
}

function parseDataBR(dataStr) {
  // Converte "17/11/2025" para Date
  const [dia, mes, ano] = dataStr.split('/');
  return new Date(ano, mes - 1, dia);
}
