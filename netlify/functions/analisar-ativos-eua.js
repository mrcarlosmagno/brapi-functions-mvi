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

    console.log(`[INICIO] Analisando ${ticker} (EUA)...`);
    
    // Verificar cache
    const cacheKey = `eua_${ticker}`;
    const cached = cache.get(cacheKey);
    if (cached && (Date.now() - cached.timestamp < CACHE_TTL)) {
      console.log(`[CACHE] Retornando dados em cache`);
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ ...cached.data, cache: true })
      };
    }

    const finnhubToken = process.env.FINNHUB_TOKEN;
    
    // 1. Buscar cotação
    console.log(`[FINNHUB] Buscando cotação de ${ticker}...`);
    const quoteUrl = `https://finnhub.io/api/v1/quote?symbol=${ticker}&token=${finnhubToken}`;
    const quoteResponse = await fetch(quoteUrl);
    const quoteData = await quoteResponse.json();
    
    if (!quoteData.c || quoteData.c === 0) {
      return {
        statusCode: 404,
        headers,
        body: JSON.stringify({ erro: `Ação ${ticker} não encontrada` })
      };
    }
    
    console.log(`[FINNHUB] ✅ Cotação: $${quoteData.c}`);

    // 2. Buscar informações da empresa
    console.log(`[FINNHUB] Buscando perfil de ${ticker}...`);
    const profileUrl = `https://finnhub.io/api/v1/stock/profile2?symbol=${ticker}&token=${finnhubToken}`;
    const profileResponse = await fetch(profileUrl);
    const profileData = await profileResponse.json();
    
    console.log(`[FINNHUB] ✅ Perfil obtido`);

    // 3. Buscar métricas fundamentalistas
    console.log(`[FINNHUB] Buscando fundamentos de ${ticker}...`);
    const metricsUrl = `https://finnhub.io/api/v1/stock/metric?symbol=${ticker}&metric=all&token=${finnhubToken}`;
    const metricsResponse = await fetch(metricsUrl);
    const metricsData = await metricsResponse.json();
    
    console.log(`[FINNHUB] ✅ Fundamentos obtidos`);

    // 4. Buscar dividendos
    const hoje = new Date();
    const cincoAnosAtras = new Date(hoje.getFullYear() - 5, hoje.getMonth(), hoje.getDate());
    const dataInicio = cincoAnosAtras.toISOString().split('T')[0];
    const dataFim = hoje.toISOString().split('T')[0];
    
    console.log(`[FINNHUB] Buscando dividendos de ${ticker}...`);
    const dividendsUrl = `https://finnhub.io/api/v1/stock/dividend?symbol=${ticker}&from=${dataInicio}&to=${dataFim}&token=${finnhubToken}`;
    const dividendsResponse = await fetch(dividendsUrl);
    const dividendsData = await dividendsResponse.json();
    
    const dividendos = Array.isArray(dividendsData) ? dividendsData.map(div => ({
      data: div.date,
      valor: div.amount,
      moeda: div.currency || 'USD'
    })) : [];
    
    console.log(`[FINNHUB] ✅ ${dividendos.length} dividendos encontrados`);

    // Calcular variação
    const variacaoDia = quoteData.c && quoteData.pc ? 
      (((quoteData.c - quoteData.pc) / quoteData.pc) * 100).toFixed(2) : null;

    // Montar resposta
    const resultado = {
      tipo: 'ACAO_US',
      ticker: ticker,
      nome: profileData.name || ticker,
      preco_atual: quoteData.c,
      variacao_dia: variacaoDia,
      moeda: profileData.currency || 'USD',
      empresa: {
        nome: profileData.name,
        setor: profileData.finnhubIndustry,
        pais: profileData.country,
        site: profileData.weburl,
        logo: profileData.logo,
        ipo: profileData.ipo,
        market_cap: profileData.marketCapitalization
      },
      cotacao: {
        preco_atual: quoteData.c,
        preco_anterior: quoteData.pc,
        abertura: quoteData.o,
        maxima: quoteData.h,
        minima: quoteData.l,
        variacao_percentual: variacaoDia
      },
      indicadores: {
        // Valuation
        p_l: metricsData.metric?.peBasicExclExtraTTM,
        p_vp: metricsData.metric?.pbQuarterly,
        p_s: metricsData.metric?.psQuarterly,
        ev_ebitda: metricsData.metric?.enterpriseValueEbitdaTTM,
        
        // Rentabilidade
        roe: metricsData.metric?.roeTTM,
        roa: metricsData.metric?.roaTTM,
        roic: metricsData.metric?.roicTTM,
        margem_bruta: metricsData.metric?.grossMarginTTM,
        margem_operacional: metricsData.metric?.operatingMarginTTM,
        margem_liquida: metricsData.metric?.netProfitMarginTTM,
        
        // Dividendos
        dividend_yield: metricsData.metric?.dividendYieldIndicatedAnnual,
        payout_ratio: metricsData.metric?.payoutRatioTTM,
        
        // Crescimento
        crescimento_receita_5anos: metricsData.metric?.revenueGrowth5Y,
        crescimento_eps_5anos: metricsData.metric?.epsGrowth5Y,
        
        // Preço
        preco_52sem_min: metricsData.metric?.['52WeekLow'],
        preco_52sem_max: metricsData.metric?.['52WeekHigh'],
        beta: metricsData.metric?.beta
      },
      dividendos: dividendos,
      fonte: 'Finnhub',
      cache: false
    };

    // Salvar no cache
    cache.set(cacheKey, {
      data: resultado,
      timestamp: Date.now()
    });

    console.log(`[SUCESSO] Dados completos de ${ticker} retornados!`);

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
