// Netlify Function: Análise Completa de FIIs (VERSÃO SIMPLIFICADA)
// Estratégia: Preço da Brapi + Dividendos do Status Invest

const BRAPI_TOKEN = process.env.BRAPI_TOKEN || 'oHdhsQdU6rz92ZQEobtwAq';
const CACHE_DURATION = 3600; // 1 hora em segundos

// Cache em memória
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
    const cacheKey = `fii_simples_${tickerUpper}`;
    const cached = cache.get(cacheKey);
    if (cached && (Date.now() - cached.timestamp) < CACHE_DURATION * 1000) {
      console.log(`[CACHE HIT] ${tickerUpper}`);
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          ...cached.data,
          cache: true
        })
      };
    }

    console.log(`[INICIO] Buscando dados de ${tickerUpper}...`);

    // 🔥 PASSO 1: Buscar preço atual na Brapi (rápido e confiável)
    let precoAtual = null;
    let nomeFii = tickerUpper;
    
    try {
      console.log(`[BRAPI] Buscando preço de ${tickerUpper}...`);
      const brapiUrl = `https://brapi.dev/api/quote/${tickerUpper}?token=${BRAPI_TOKEN}`;
      const brapiResponse = await fetch(brapiUrl);
      
      if (brapiResponse.ok) {
        const brapiData = await brapiResponse.json();
        if (brapiData.results && brapiData.results.length > 0) {
          const fii = brapiData.results[0];
          precoAtual = fii.regularMarketPrice;
          nomeFii = fii.longName || fii.shortName || tickerUpper;
          console.log(`[BRAPI] ✅ Preço: R$ ${precoAtual}`);
        }
      }
    } catch (error) {
      console.log(`[BRAPI] ⚠️ Erro ao buscar preço: ${error.message}`);
    }

    // 🔥 PASSO 2: Buscar dividendos no Status Invest
    console.log(`[STATUS_INVEST] Buscando dividendos de ${tickerUpper}...`);
    const statusUrl = `https://statusinvest.com.br/fii/companytickerprovents?ticker=${tickerUpper}&chartProventsType=2`;
    
    const statusResponse = await fetch(statusUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'application/json'
      }
    });

    if (!statusResponse.ok) {
      throw new Error(`Status Invest retornou erro ${statusResponse.status}`);
    }

    const statusData = await statusResponse.json();

    if (!statusData.assetEarningsModels || statusData.assetEarningsModels.length === 0) {
      return {
        statusCode: 404,
        headers,
        body: JSON.stringify({
          erro: 'FII não encontrado ou sem histórico de dividendos',
          ticker: tickerUpper
        })
      };
    }

    // 🔥 PASSO 3: Processar dividendos
    const dividendos = statusData.assetEarningsModels.map(div => ({
      data_com: div.ed,
      data_pagamento: div.pd,
      valor: div.v,
      tipo: div.et
    }));

    // Ordenar por data (mais recente primeiro)
    dividendos.sort((a, b) => {
      const dateA = parseDataBR(a.data_com);
      const dateB = parseDataBR(b.data_com);
      return dateB - dateA;
    });

    console.log(`[STATUS_INVEST] ✅ ${dividendos.length} dividendos encontrados`);

    // 🔥 PASSO 4: Calcular Dividend Yield 12M
    const dividendYield12m = calcularDY12M(dividendos, precoAtual);

    // 🔥 PASSO 5: Montar resposta final
    const resultado = {
      ticker: tickerUpper,
      nome: nomeFii,
      preco_atual: precoAtual,
      dividend_yield_12m: dividendYield12m,
      dividendos: dividendos,
      indicadores: {
        preco_atual: precoAtual,
        total_dividendos: dividendos.length,
        rendimento_ano_atual: statusData.earningsThisYear ? 
          parseFloat(statusData.earningsThisYear.replace(',', '.')) : null,
        rendimento_ano_anterior: statusData.earningsLastYear ? 
          parseFloat(statusData.earningsLastYear.replace(',', '.')) : null
      },
      fonte_preco: 'Brapi Pro',
      fonte_dividendos: 'Status Invest',
      cache: false
    };

    // Salvar no cache
    cache.set(cacheKey, {
      timestamp: Date.now(),
      data: resultado
    });

    console.log(`[SUCESSO] Dados completos de ${tickerUpper} retornados!`);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify(resultado)
    };

  } catch (error) {
    console.error('[ERRO]', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        erro: 'Erro ao buscar dados do FII',
        detalhes: error.message,
        ticker: event.queryStringParameters?.ticker
      })
    };
  }
};

// ========================================
// FUNÇÕES AUXILIARES
// ========================================

function calcularDY12M(dividendos, preco) {
  if (!preco || !dividendos || dividendos.length === 0) return null;

  const hoje = new Date();
  const umAnoAtras = new Date(hoje.getFullYear() - 1, hoje.getMonth(), hoje.getDate());

  const dividendos12m = dividendos.filter(div => {
    const dataCom = parseDataBR(div.data_com);
    return dataCom >= umAnoAtras && dataCom <= hoje;
  });

  const totalDividendos = dividendos12m.reduce((sum, div) => sum + div.valor, 0);
  return ((totalDividendos / preco) * 100).toFixed(2);
}

function parseDataBR(dataStr) {
  // Converte "17/11/2025" para Date
  const [dia, mes, ano] = dataStr.split('/');
  return new Date(ano, mes - 1, dia);
}
