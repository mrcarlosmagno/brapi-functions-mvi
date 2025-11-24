const fetch = require('node-fetch');

// Cache simples em memória
const cache = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutos

exports.handler = async (event, context) => {
  // Configurar headers CORS
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Content-Type': 'application/json'
  };

  // Tratar OPTIONS (preflight)
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  try {
    // Pegar ticker dos parâmetros
    const ticker = event.queryStringParameters?.ticker?.toUpperCase();
    
    if (!ticker) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ erro: 'Parâmetro "ticker" é obrigatório' })
      };
    }

    console.log(`[INICIO] Buscando dados de ${ticker}...`);
    
    // Verificar cache
    const cacheKey = `fii_${ticker}`;
    const cached = cache.get(cacheKey);
    if (cached && (Date.now() - cached.timestamp < CACHE_TTL)) {
      console.log(`[CACHE] Retornando dados em cache de ${ticker}`);
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ ...cached.data, cache: true })
      };
    }

    const tickerUpper = ticker.toUpperCase();
    
    // 🔥 PASSO 1: Buscar preço na Brapi
    let precoAtual = null;
    let nomeFii = null;
    
    try {
      console.log(`[BRAPI] Buscando preço de ${tickerUpper}...`);
      const brapiToken = process.env.BRAPI_TOKEN;
      const brapiUrl = `https://brapi.dev/api/quote/${tickerUpper}?token=${brapiToken}`;
      
      const brapiResponse = await fetch(brapiUrl);
      const brapiData = await brapiResponse.json();
      
      if (brapiData.results && brapiData.results.length > 0) {
        precoAtual = brapiData.results[0].regularMarketPrice;
        nomeFii = brapiData.results[0].longName || brapiData.results[0].shortName;
        console.log(`[BRAPI] ✅ Preço: R$ ${precoAtual}`);
      }
    } catch (error) {
      console.log(`[BRAPI] ⚠️ Erro ao buscar preço: ${error.message}`);
    }

    // 🔥 PASSO 2: Buscar indicadores do Status Invest
    console.log(`[STATUS_INVEST] Buscando indicadores de ${tickerUpper}...`);
    const statusUrl = `https://statusinvest.com.br/fundos-imobiliarios/${tickerUpper.toLowerCase()}`;
    
    let pvp = null;
    let valorPatrimonial = null;
    let vacanciaFisica = null;
    let patrimonioLiquido = null;
    let liquidezMediaDiaria = null;
    
    try {
      const statusResponse = await fetch(statusUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      });
      
      const statusHtml = await statusResponse.text();
      
      // P/VP
      const pvpMatch = statusHtml.match(/>P\/VP<[\s\S]*?<strong[^>]*>([0-9,\.]+)<\/strong>/i);
      if (pvpMatch) {
        pvp = parseFloat(pvpMatch[1].replace(',', '.'));
        console.log(`[STATUS_INVEST] ✅ P/VP: ${pvp}`);
      }
      
      // Valor Patrimonial
      const vpMatch = statusHtml.match(/Val\.?\s*patrimonial\s*p\/cota[\s\S]*?<strong class="value">([0-9,\.]+)<\/strong>/i);
      if (vpMatch) {
        valorPatrimonial = parseFloat(vpMatch[1].replace('.', '').replace(',', '.'));
        console.log(`[STATUS_INVEST] ✅ Valor Patrimonial: R$ ${valorPatrimonial}`);
      }
      
      // Vacância Física
      const vacanciaMatch = statusHtml.match(/<span class="sub-value">Vacância<\/span>[\s\S]*?<strong class="value">([0-9,\.]+).*?%<\/strong>/i);
      if (vacanciaMatch && vacanciaMatch[1] !== '-') {
        vacanciaFisica = parseFloat(vacanciaMatch[1].replace(',', '.'));
        console.log(`[STATUS_INVEST] ✅ Vacância Física: ${vacanciaFisica}%`);
      }
      
      // Patrimônio Líquido
      const patrimonioMatch = statusHtml.match(/>PATRIMÔNIO<[\s\S]*?R\$\s*([0-9,\.]+)/i);
      if (patrimonioMatch) {
        patrimonioLiquido = patrimonioMatch[1];
        console.log(`[STATUS_INVEST] ✅ Patrimônio Líquido: R$ ${patrimonioLiquido}`);
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
        console.log(`[STATUS_INVEST] ✅ Liquidez Média Diária: R$ ${liquidezMediaDiaria}`);
      }
      
    } catch (error) {
      console.log(`[STATUS_INVEST] ⚠️ Erro ao buscar indicadores: ${error.message}`);
    }

    // 🔥 PASSO 3: Buscar dividendos no Status Invest
    console.log(`[STATUS_INVEST] Buscando dividendos de ${tickerUpper}...`);
    const dividendosUrl = `https://statusinvest.com.br/fii/companytickerprovents?ticker=${tickerUpper}&chartProventsType=2`;
    
    const dividendosResponse = await fetch(dividendosUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });
    
    const statusData = await dividendosResponse.json();
    
    if (!statusData.assetEarningsModels || statusData.assetEarningsModels.length === 0) {
      return {
        statusCode: 404,
        headers,
        body: JSON.stringify({ 
          erro: `Nenhum dividendo encontrado para ${ticker}`,
          ticker: tickerUpper
        })
      };
    }

    console.log(`[STATUS_INVEST] ✅ ${statusData.assetEarningsModels.length} dividendos encontrados`);

    // Processar dividendos
    const dividendos = statusData.assetEarningsModels.map(div => ({
      data_com: div.ed ? new Date(div.ed).toLocaleDateString('pt-BR') : null,
      data_pagamento: div.pd ? new Date(div.pd).toLocaleDateString('pt-BR') : null,
      valor: div.v || 0,
      tipo: 'Rendimento'
    }));

    // Calcular Dividend Yield 12M
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

    // Montar resposta
    const resultado = {
      ticker: tickerUpper,
      nome: nomeFii,
      preco_atual: precoAtual,
      dividend_yield_12m: dividendYield12m,
      dividendos: dividendos,
      indicadores: {
        preco_atual: precoAtual,
        pvp: pvp,
        valor_patrimonial: valorPatrimonial,
        vacancia_fisica: vacanciaFisica,
        patrimonio_liquido: patrimonioLiquido,
        liquidez_media_diaria: liquidezMediaDiaria,
        total_dividendos: dividendos.length,
        rendimento_ano_atual: statusData.earningsThisYear ? 
          parseFloat(statusData.earningsThisYear.replace(',', '.')) : null,
        rendimento_ano_anterior: statusData.earningsLastYear ? 
          parseFloat(statusData.earningsLastYear.replace(',', '.')) : null
      },
      fonte_preco: 'Brapi Pro',
      fonte_dividendos: 'Status Invest',
      fonte_indicadores: 'Status Invest',
      cache: false
    };

    // Salvar no cache
    cache.set(cacheKey, {
      data: resultado,
      timestamp: Date.now()
    });

    console.log(`[SUCESSO] Dados completos de ${tickerUpper} retornados!`);

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
        erro: 'Erro ao buscar dados do FII',
        detalhes: error.message 
      })
    };
  }
};
