// Netlify Function: Análise Completa de Ações Brasileiras (PREMIUM)
// Retorna 15+ indicadores fundamentalistas + histórico de 5 anos

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
          exemplo: '?ticker=PETR4'
        })
      };
    }

    // Chamar Brapi Pro com TODOS os módulos históricos
    const brapiUrl = `https://brapi.dev/api/quote/${ticker}?token=${BRAPI_TOKEN}&modules=incomeStatementHistory,balanceSheetHistory,defaultKeyStatisticsHistory,financialDataHistory&fundamental=true&dividends=true`;
    
    console.log(`[AÇÕES] Consultando: ${ticker}`);
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

    const stock = data.results[0];

    // ============================================
    // FUNÇÃO AUXILIAR: Últimos 5 anos
    // ============================================
    const getLast5Years = (historyArray) => {
      if (!historyArray || !Array.isArray(historyArray)) return [];
      return historyArray.slice(0, 5);
    };

    // ============================================
    // FILTRAR INCOME STATEMENT HISTORY (DRE)
    // ============================================
    const incomeHistory = getLast5Years(stock.incomeStatementHistory || [])
      .map(item => ({
        ano: item.year,
        receitaTotal: item.totalRevenue,
        receitaOperacional: item.totalOperatingRevenue,
        custoReceita: item.costOfRevenue,
        lucroLiquido: item.netIncome,
        ebitda: item.ebitda,
        lucroOperacional: item.operatingIncome,
        lucroAntesImpostos: item.incomeBeforeTax,
        despesasOperacionais: item.totalOperatingExpenses,
        despesasJuros: item.interestExpense
      }));

    // ============================================
    // FILTRAR BALANCE SHEET HISTORY (BALANÇO)
    // ============================================
    const balanceHistory = getLast5Years(stock.balanceSheetHistory || [])
      .map(item => ({
        ano: item.year,
        ativoTotal: item.totalAssets,
        ativoCirculante: item.totalCurrentAssets,
        caixa: item.cash,
        passivoTotal: item.totalLiab,
        passivoCirculante: item.totalCurrentLiabilities,
        dividaTotal: item.totalDebt,
        dividaCurtoPrazo: item.shortTermDebt,
        dividaLongoPrazo: item.longTermDebt,
        patrimonioLiquido: item.totalStockholderEquity
      }));

    // ============================================
    // FILTRAR DEFAULT KEY STATISTICS HISTORY
    // ============================================
    const statsHistory = getLast5Years(stock.defaultKeyStatisticsHistory || [])
      .map(item => ({
        ano: item.year,
        roe: item.returnOnEquity,
        roa: item.returnOnAssets,
        margemLiquida: item.profitMargins,
        margemOperacional: item.operatingMargins,
        margemBruta: item.grossMargins,
        receitaPorAcao: item.revenuePerShare,
        lucroPorAcao: item.trailingEps,
        valorPatrimonial: item.bookValue,
        pvp: item.priceToBook,
        dividaPatrimonio: item.debtToEquity
      }));

    // ============================================
    // FILTRAR FINANCIAL DATA HISTORY
    // ============================================
    const financialHistory = getLast5Years(stock.financialDataHistory || [])
      .map(item => ({
        ano: item.year,
        receitaTotal: item.totalRevenue,
        crescimentoReceita: item.revenueGrowth,
        margemLiquida: item.profitMargins,
        margemOperacional: item.operatingMargins,
        roe: item.returnOnEquity,
        roa: item.returnOnAssets,
        fluxoCaixaOperacional: item.operatingCashflow,
        fluxoCaixaLivre: item.freeCashflow,
        dividaTotal: item.totalDebt,
        caixa: item.totalCash,
        dividaLiquida: item.totalDebt && item.totalCash ? item.totalDebt - item.totalCash : null,
        ebitda: item.ebitda,
        dividaEbitda: item.totalDebt && item.ebitda ? (item.totalDebt / item.ebitda).toFixed(2) : null
      }));

    // ============================================
    // FILTRAR DIVIDENDOS (últimos 5 anos)
    // ============================================
    const currentYear = new Date().getFullYear();
    const dividendsHistory = stock.dividendsData?.cashDividends
      ? stock.dividendsData.cashDividends
          .filter(div => {
            const year = new Date(div.paymentDate).getFullYear();
            return year >= currentYear - 5;
          })
          .map(div => ({
            dataPagamento: div.paymentDate,
            valor: div.rate,
            tipo: div.type
          }))
      : [];

    // Calcular total de dividendos por ano
    const dividendsPorAno = {};
    dividendsHistory.forEach(div => {
      const year = new Date(div.dataPagamento).getFullYear();
      if (!dividendsPorAno[year]) dividendsPorAno[year] = 0;
      dividendsPorAno[year] += div.valor;
    });

    // ============================================
    // MONTAR RESPOSTA FILTRADA (PREMIUM)
    // ============================================
    const filteredResponse = {
      // === IDENTIFICAÇÃO ===
      ticker: stock.symbol,
      nome: stock.longName || stock.shortName,
      setor: stock.sector,
      industria: stock.industry,
      site: stock.website,
      descricao: stock.longBusinessSummary,
      
      // === DADOS DE MERCADO ATUAIS ===
      precoAtual: stock.regularMarketPrice,
      variacao: stock.regularMarketChangePercent,
      variacaoDinheiro: stock.regularMarketChange,
      volume: stock.regularMarketVolume,
      volumeMedio: stock.averageDailyVolume3Month,
      valorMercado: stock.marketCap,
      
      // === INDICADORES FUNDAMENTALISTAS ATUAIS (15+) ===
      indicadoresAtuais: {
        // Valuation
        pl: stock.priceEarnings,
        pvp: stock.priceToBook,
        psr: stock.priceToSalesTrailing12Months,
        evEbitda: stock.enterpriseToEbitda,
        
        // Rentabilidade
        roe: stock.returnOnEquity,
        roa: stock.returnOnAssets,
        roic: stock.returnOnCapital,
        
        // Margens
        margemLiquida: stock.profitMargins,
        margemOperacional: stock.operatingMargins,
        margemBruta: stock.grossMargins,
        margemEbitda: stock.ebitdaMargins,
        
        // Crescimento
        crescimentoReceita: stock.revenueGrowth,
        crescimentoLucro: stock.earningsGrowth,
        
        // Endividamento
        dividaPatrimonio: stock.debtToEquity,
        dividaEbitda: stock.totalDebt && stock.ebitda ? (stock.totalDebt / stock.ebitda).toFixed(2) : null,
        
        // Dividendos
        dividendYield: stock.dividendYield,
        payoutRatio: stock.payoutRatio,
        
        // Eficiência
        lucroPorAcao: stock.trailingEps,
        valorPatrimonialPorAcao: stock.bookValue,
        receitaPorAcao: stock.revenuePerShare,
        
        // Liquidez
        liquidezCorrente: stock.currentRatio,
        liquidezSeca: stock.quickRatio
      },
      
      // === HISTÓRICOS (5 anos) ===
      historicoDRE: incomeHistory,
      historicoBalanco: balanceHistory,
      historicoIndicadores: statsHistory,
      historicoFinanceiro: financialHistory,
      historicoDividendos: dividendsHistory,
      dividendosPorAno: dividendsPorAno,
      
      // === METADADOS ===
      dataConsulta: new Date().toISOString(),
      fonte: 'Brapi Pro API',
      tipoAtivo: 'ACAO'
    };

    console.log(`[AÇÕES] Sucesso: ${ticker} - ${filteredResponse.nome}`);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify(filteredResponse, null, 2)
    };

  } catch (error) {
    console.error('[AÇÕES] Erro:', error);
    
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        error: 'Erro ao processar requisição',
        mensagem: error.message,
        dica: 'Verifique se o ticker é de uma AÇÃO (ex: PETR4, VALE3, ITSA4)'
      })
    };
  }
};
