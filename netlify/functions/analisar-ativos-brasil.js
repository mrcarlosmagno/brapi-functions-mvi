const fetch = require('node-fetch');

// Cache simples em memória
const cache = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutos

exports.handler = async (event, context) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Content-Type': 'application/json'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  try {
    const ticker = event.queryStringParameters?.ticker?.toUpperCase();
    
    if (!ticker) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ erro: 'Parâmetro "ticker" é obrigatório' })
      };
    }

    console.log(`[INICIO] Analisando ${ticker}...`);
    
    // Verificar cache
    const cacheKey = `brasil_${ticker}`;
    const cached = cache.get(cacheKey);
    if (cached && (Date.now() - cached.timestamp < CACHE_TTL)) {
      console.log(`[CACHE] Retornando dados em cache`);
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ ...cached.data, cache: true })
      };
    }

    // Detectar tipo: FII (termina com 11) ou Ação
    const isFII = ticker.endsWith('11') && ticker.length === 6;
    const tipo = isFII ? 'FII' : 'ACAO';
    
    console.log(`[TIPO] ${tipo} detectado`);

    let resultado;

    if (isFII) {
      // ===== BUSCAR DADOS DE FII =====
      resultado = await buscarDadosFII(ticker);
    } else {
      // ===== BUSCAR DADOS DE AÇÃO =====
      resultado = await buscarDadosAcao(ticker);
    }

    // Salvar no cache
    cache.set(cacheKey, {
      data: resultado,
      timestamp: Date.now()
    });

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify(resultado)
    };

  } catch (error) {
    console.error(`[ERRO] ${error.message}`);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ 
        erro: 'Erro ao buscar dados',
        detalhes: error.message 
      })
    };
  }
};

// ===== FUNÇÃO PARA BUSCAR DADOS DE FII =====
async function buscarDadosFII(ticker) {
  console.log(`[FII] Buscando dados de ${ticker}...`);
  
  const brapiToken = process.env.BRAPI_TOKEN;
  
  // 1. Buscar preço na Brapi
  let precoAtual = null;
  let nomeFII = null;
  
  try {
    const brapiUrl = `https://brapi.dev/api/quote/${ticker}?token=${brapiToken}`;
    const brapiResponse = await fetch(brapiUrl);
    const brapiData = await brapiResponse.json();
    
    if (brapiData.results && brapiData.results.length > 0) {
      precoAtual = brapiData.results[0].regularMarketPrice;
      nomeFII = brapiData.results[0].longName || brapiData.results[0].shortName;
      console.log(`[BRAPI] ✅ Preço: R$ ${precoAtual}`);
    }
  } catch (error) {
    console.log(`[BRAPI] ⚠️ Erro: ${error.message}`);
  }

  // 2. Buscar indicadores do Status Invest
  const statusUrl = `https://statusinvest.com.br/fundos-imobiliarios/${ticker.toLowerCase()}`;
  
  let pvp = null;
  let valorPatrimonial = null;
  let vacanciaFisica = null;
  let patrimonioLiquido = null;
  let liquidezMediaDiaria = null;
  
  try {
    const statusResponse = await fetch(statusUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0' }
    });
    
    const statusHtml = await statusResponse.text();
    
    // P/VP
    const pvpMatch = statusHtml.match(/>P\/VP<[\s\S]*?<strong[^>]*>([0-9,\.]+)<\/strong>/i);
    if (pvpMatch) {
      pvp = parseFloat(pvpMatch[1].replace(',', '.'));
    }
    
    // Valor Patrimonial
    const vpMatch = statusHtml.match(/Val\.?\s*patrimonial\s*p\/cota[\s\S]*?<strong class="value">([0-9,\.]+)<\/strong>/i);
    if (vpMatch) {
      valorPatrimonial = parseFloat(vpMatch[1].replace('.', '').replace(',', '.'));
    }
    
    // Vacância Física
    const vacanciaMatch = statusHtml.match(/<span class="sub-value">Vacância<\/span>[\s\S]*?<strong class="value">([0-9,\.]+).*?%<\/strong>/i);
    if (vacanciaMatch && vacanciaMatch[1] !== '-') {
      vacanciaFisica = parseFloat(vacanciaMatch[1].replace(',', '.'));
    }
    
    // Patrimônio Líquido
    const patrimonioMatch = statusHtml.match(/>PATRIMÔNIO<[\s\S]*?R\$\s*([0-9,\.]+)/i);
    if (patrimonioMatch) {
      patrimonioLiquido = patrimonioMatch[1];
    }
    
    // Liquidez Média Diária
    const liquidezMatch = statusHtml.match(/Liquidez\s*média\s*diária[\s\S]*?<strong class="value">([0-9,\.]+)<\/strong>/i);
    if (liquidezMatch) {
      const valor = parseFloat(liquidezMatch[1].replace(/\./g, '').replace(',', '.'));
      if (valor >= 1000000) {
        liquidezMediaDiaria = `${(valor / 1000000).toFixed(1)} M`;
      } else if (valor >= 1000) {
        liquidezMediaDiaria = `${(valor / 1000).toFixed(1)} K`;
      } else {
        liquidezMediaDiaria = valor.toFixed(2);
      }
    }
    
    console.log(`[STATUS_INVEST] ✅ Indicadores capturados`);
    
  } catch (error) {
    console.log(`[STATUS_INVEST] ⚠️ Erro: ${error.message}`);
  }

  // 3. Buscar dividendos
  const dividendosUrl = `https://statusinvest.com.br/fii/companytickerprovents?ticker=${ticker}&chartProventsType=2`;
  
  const dividendosResponse = await fetch(dividendosUrl, {
    headers: { 'User-Agent': 'Mozilla/5.0' }
  });
  
  const statusData = await dividendosResponse.json();
  
  const dividendos = statusData.assetEarningsModels?.map(div => ({
    data_com: div.ed ? new Date(div.ed).toLocaleDateString('pt-BR') : null,
    data_pagamento: div.pd ? new Date(div.pd).toLocaleDateString('pt-BR') : null,
    valor: div.v || 0,
    tipo: 'Rendimento'
  })) || [];

  // Calcular DY 12M
  const hoje = new Date();
  const umAnoAtras = new Date(hoje.getFullYear() - 1, hoje.getMonth(), hoje.getDate());
  
  const dividendos12m = dividendos.filter(div => {
    if (!div.data_com) return false;
    const [dia, mes, ano] = div.data_com.split('/');
    const data = new Date(ano, mes - 1, dia);
    return data >= umAnoAtras && data <= hoje;
  });

  const totalDividendos12m = dividendos12m.reduce((sum, div) => sum + div.valor, 0);
  const dividendYield12m = precoAtual ? ((totalDividendos12m / precoAtual) * 100).toFixed(2) : null;

  return {
    tipo: 'FII',
    ticker: ticker,
    nome: nomeFII,
    preco_atual: precoAtual,
    dividend_yield_12m: dividendYield12m,
    indicadores: {
      preco_atual: precoAtual,
      pvp: pvp,
      valor_patrimonial: valorPatrimonial,
      vacancia_fisica: vacanciaFisica,
      patrimonio_liquido: patrimonioLiquido,
      liquidez_media_diaria: liquidezMediaDiaria,
      total_dividendos: dividendos.length
    },
    dividendos: dividendos,
    fonte: 'Brapi + Status Invest',
    cache: false
  };
}

// ===== FUNÇÃO PARA BUSCAR DADOS DE AÇÃO =====
async function buscarDadosAcao(ticker) {
  console.log(`[ACAO] Buscando dados de ${ticker}...`);
  
  const brapiToken = process.env.BRAPI_TOKEN;
  const brapiUrl = `https://brapi.dev/api/quote/${ticker}?fundamental=true&dividends=true&token=${brapiToken}`;
  
  const brapiResponse = await fetch(brapiUrl);
  const brapiData = await brapiResponse.json();
  
  if (!brapiData.results || brapiData.results.length === 0) {
    throw new Error(`Ação ${ticker} não encontrada`);
  }

  const acao = brapiData.results[0];
  
  console.log(`[BRAPI] ✅ Dados completos de ${ticker}`);

  return {
    tipo: 'ACAO',
    ticker: ticker,
    nome: acao.longName || acao.shortName,
    preco_atual: acao.regularMarketPrice,
    variacao_dia: acao.regularMarketChangePercent,
    indicadores: {
      preco_atual: acao.regularMarketPrice,
      preco_minimo_52sem: acao.fiftyTwoWeekLow,
      preco_maximo_52sem: acao.fiftyTwoWeekHigh,
      volume: acao.regularMarketVolume,
      market_cap: acao.marketCap,
      // Fundamentos
      p_l: acao.priceEarnings,
      p_vp: acao.priceToBook,
      dividend_yield: acao.dividendYield,
      roe: acao.returnOnEquity,
      roic: acao.returnOnInvestedCapital,
      margem_liquida: acao.profitMargin,
      divida_liquida_ebitda: acao.debtToEbitda,
      divida_liquida_patrimonio: acao.debtToEquity,
      crescimento_receita_5anos: acao.revenueGrowth
    },
    dividendos: acao.dividendsData?.cashDividends || [],
    fonte: 'Brapi',
    cache: false
  };
}
