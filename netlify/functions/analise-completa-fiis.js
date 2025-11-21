// Netlify Function: Análise Completa de FIIs (PREMIUM)
// Retorna indicadores específicos de Fundos Imobiliários + histórico de dividendos

const BRAPI_TOKEN = 'oHdhsQdU6rz92ZQEobtwAq';

exports.handler = async (event, context) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Content-Type': 'application/json'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  try {
    const ticker = event.queryStringParameters?.ticker;

    if (!ticker) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          error: 'Parâmetro "ticker" é obrigatório',
          exemplo: '?ticker=KNRI11'
        })
      };
    }

    // Chamar Brapi Pro com módulos relevantes para FIIs
    const brapiUrl = `https://brapi.dev/api/quote/${ticker}?token=${BRAPI_TOKEN}&fundamental=true&dividends=true&range=5y`;
    
    console.log(`[FIIs] Consultando: ${ticker}`);
    const response = await fetch(brapiUrl);
    
    if (!response.ok) {
      throw new Error(`Brapi API retornou status ${response.status}`);
    }

    const data = await response.json();

    if (!data.results || data.results.length === 0) {
      return {
        statusCode: 404,
        headers,
        body: JSON.stringify({
          error: 'Ticker não encontrado',
          ticker: ticker
        })
      };
    }

    const fii = data.results[0];

    // ============================================
    // PROCESSAR DIVIDENDOS (últimos 5 anos)
    // ============================================
    const currentYear = new Date().getFullYear();
    const dividendsHistory = fii.dividendsData?.cashDividends
      ? fii.dividendsData.cashDividends
          .filter(div => {
            const year = new Date(div.paymentDate).getFullYear();
            return year >= currentYear - 5;
          })
          .map(div => ({
            dataPagamento: div.paymentDate,
            dataAprovacao: div.approvedOn,
            valor: div.rate,
            tipo: div.type,
            mes: new Date(div.paymentDate).toLocaleString('pt-BR', { month: 'long', year: 'numeric' })
          }))
          .sort((a, b) => new Date(b.dataPagamento) - new Date(a.dataPagamento))
      : [];

    // ============================================
    // CALCULAR ESTATÍSTICAS DE DIVIDENDOS
    // ============================================
    
    // Total por ano
    const dividendosPorAno = {};
    dividendsHistory.forEach(div => {
      const year = new Date(div.dataPagamento).getFullYear();
      if (!dividendosPorAno[year]) {
        dividendosPorAno[year] = {
          ano: year,
          totalPago: 0,
          numeroPagamentos: 0,
          mediaMensal: 0
        };
      }
      dividendosPorAno[year].totalPago += div.valor;
      dividendosPorAno[year].numeroPagamentos += 1;
    });

    // Calcular média mensal por ano
    Object.keys(dividendosPorAno).forEach(year => {
      const dados = dividendosPorAno[year];
      dados.mediaMensal = dados.totalPago / dados.numeroPagamentos;
      dados.totalPago = parseFloat(dados.totalPago.toFixed(4));
      dados.mediaMensal = parseFloat(dados.mediaMensal.toFixed(4));
    });

    // Últimos 12 meses
    const umAnoAtras = new Date();
    umAnoAtras.setFullYear(umAnoAtras.getFullYear() - 1);
    
    const dividendosUltimos12Meses = dividendsHistory
      .filter(div => new Date(div.dataPagamento) >= umAnoAtras)
      .reduce((sum, div) => sum + div.valor, 0);

    // Calcular Dividend Yield manualmente (se não vier da API)
    const dividendYieldCalculado = fii.regularMarketPrice 
      ? ((dividendosUltimos12Meses / fii.regularMarketPrice) * 100).toFixed(2)
      : null;

    // Média mensal dos últimos 12 meses
    const mediaMensalUltimos12 = dividendsHistory
      .filter(div => new Date(div.dataPagamento) >= umAnoAtras)
      .length > 0
      ? (dividendosUltimos12Meses / dividendsHistory.filter(div => new Date(div.dataPagamento) >= umAnoAtras).length).toFixed(4)
      : 0;

    // ============================================
    // PROCESSAR HISTÓRICO DE PREÇOS (5 anos)
    // ============================================
    const historicoPrecos = fii.historicalDataPrice
      ? fii.historicalDataPrice
          .slice(0, 60) // Últimos 60 pontos (aprox. 5 anos se for mensal)
          .map(item => ({
            data: new Date(item.date * 1000).toISOString().split('T')[0],
            preco: item.close,
            volume: item.volume
          }))
      : [];

    // Calcular valorização em diferentes períodos
    const calcularValorizacao = (meses) => {
      if (!historicoPrecos || historicoPrecos.length < meses) return null;
      const precoAtual = fii.regularMarketPrice;
      const precoAntigo = historicoPrecos[meses - 1]?.preco;
      if (!precoAtual || !precoAntigo) return null;
      return (((precoAtual - precoAntigo) / precoAntigo) * 100).toFixed(2);
    };

    // ============================================
    // MONTAR RESPOSTA FILTRADA (FII PREMIUM)
    // ============================================
    const filteredResponse = {
      // === IDENTIFICAÇÃO ===
      ticker: fii.symbol,
      nome: fii.longName || fii.shortName,
      tipo: fii.type || 'FII',
      cnpj: fii.cnpj,
      site: fii.website,
      
      // === DADOS DE MERCADO ATUAIS ===
      precoAtual: fii.regularMarketPrice,
      variacao: fii.regularMarketChangePercent,
      variacaoDinheiro: fii.regularMarketChange,
      volume: fii.regularMarketVolume,
      volumeMedio: fii.averageDailyVolume3Month,
      valorMercado: fii.marketCap,
      
      // === INDICADORES FUNDAMENTALISTAS FII ===
      indicadoresFII: {
        // Valuation
        pvp: fii.priceToBook,
        valorPatrimonial: fii.bookValue,
        valorPatrimonialPorCota: fii.bookValue,
        
        // Dividendos
        dividendYield: fii.dividendYield || dividendYieldCalculado,
        dividendYieldCalculado: dividendYieldCalculado,
        ultimoDividendo: dividendsHistory[0]?.valor || null,
        dataUltimoDividendo: dividendsHistory[0]?.dataPagamento || null,
        
        // Liquidez
        liquidezDiaria: fii.averageDailyVolume10Day,
        liquidezMedia3Meses: fii.averageDailyVolume3Month,
        
        // Patrimônio
        patrimonioLiquido: fii.totalAssets,
        numeroCotistas: fii.numberOfShareholders,
        
        // Vacância (se disponível)
        vacancia: fii.vacancyRate || null,
        
        // Outros
        beta: fii.beta,
        cotasEmitidas: fii.sharesOutstanding
      },
      
      // === ANÁLISE DE DIVIDENDOS ===
      dividendos: {
        ultimos12Meses: {
          totalPago: parseFloat(dividendosUltimos12Meses.toFixed(4)),
          numeroPagamentos: dividendsHistory.filter(div => new Date(div.dataPagamento) >= umAnoAtras).length,
          mediaMensal: parseFloat(mediaMensalUltimos12),
          dividendYield: dividendYieldCalculado + '%'
        },
        porAno: Object.values(dividendosPorAno).sort((a, b) => b.ano - a.ano),
        historico: dividendsHistory.slice(0, 24) // Últimos 24 pagamentos
      },
      
      // === ANÁLISE DE PREÇO ===
      desempenhoPreco: {
        precoAtual: fii.regularMarketPrice,
        minimo52Semanas: fii.fiftyTwoWeekLow,
        maximo52Semanas: fii.fiftyTwoWeekHigh,
        media50Dias: fii.fiftyDayAverage,
        media200Dias: fii.twoHundredDayAverage,
        valorizacao1Ano: calcularValorizacao(12),
        valorizacao2Anos: calcularValorizacao(24),
        valorizacao5Anos: calcularValorizacao(60)
      },
      
      // === HISTÓRICO DE PREÇOS (últimos 5 anos) ===
      historicoPrecos: historicoPrecos,
      
      // === METADADOS ===
      dataConsulta: new Date().toISOString(),
      fonte: 'Brapi Pro API',
      tipoAtivo: 'FII'
    };

    console.log(`[FIIs] Sucesso: ${ticker} - ${filteredResponse.nome}`);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify(filteredResponse, null, 2)
    };

  } catch (error) {
    console.error('[FIIs] Erro:', error);
    
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        error: 'Erro ao processar requisição',
        mensagem: error.message,
        dica: 'Verifique se o ticker é de um FII (ex: KNRI11, HGLG11, MXRF11)'
      })
    };
  }
};
