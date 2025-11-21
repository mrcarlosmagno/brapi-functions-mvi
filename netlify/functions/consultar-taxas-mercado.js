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
    // Códigos das séries do Banco Central
    const series = {
      cdi: 12,           // CDI diário
      selic_meta: 432,   // SELIC Meta (definida pelo COPOM)
      selic: 11,         // SELIC efetiva
      ipca: 433,         // IPCA mensal
      igpm: 189,         // IGP-M mensal
      poupanca: 195      // Taxa de poupança
    };

    // Buscar dados de todas as séries em paralelo
    const promises = Object.entries(series).map(async ([nome, codigo]) => {
      try {
        const response = await fetch(
          `https://api.bcb.gov.br/dados/serie/bcdata.sgs.${codigo}/dados/ultimos/1?formato=json`,
          { method: 'GET', headers: { 'Accept': 'application/json' } }
        );
        
        if (!response.ok) {
          return { nome, erro: true };
        }
        
        const data = await response.json();
        return { nome, data: data[0] || null };
      } catch (error) {
        return { nome, erro: true };
      }
    });

    const resultados = await Promise.all(promises);

    // Organizar dados
    const taxas = {};
    resultados.forEach(r => {
      if (!r.erro && r.data) {
        taxas[r.nome] = {
          valor: parseFloat(r.data.valor),
          data_referencia: r.data.data
        };
      }
    });

    // Calcular taxas anualizadas
    const cdiAnual = taxas.cdi ? ((Math.pow(1 + taxas.cdi.valor/100, 252) - 1) * 100).toFixed(2) : null;
    const ipca12m = taxas.ipca ? (taxas.ipca.valor * 12).toFixed(2) : null; // Aproximação

    const resultado = {
      data_consulta: new Date().toISOString().split('T')[0],
      taxas_principais: {
        cdi: {
          taxa_dia: taxas.cdi ? `${taxas.cdi.valor.toFixed(4)}%` : 'N/A',
          taxa_anual_estimada: cdiAnual ? `${cdiAnual}%` : 'N/A',
          data_referencia: taxas.cdi?.data_referencia || 'N/A',
          descricao: 'Certificado de Depósito Interbancário - taxa de referência para renda fixa'
        },
        selic: {
          taxa_meta: taxas.selic_meta ? `${taxas.selic_meta.valor.toFixed(2)}%` : 'N/A',
          taxa_efetiva: taxas.selic ? `${taxas.selic.valor.toFixed(4)}%` : 'N/A',
          data_referencia: taxas.selic_meta?.data_referencia || 'N/A',
          descricao: 'Taxa básica de juros da economia brasileira (definida pelo COPOM)'
        },
        ipca: {
          taxa_mes: taxas.ipca ? `${taxas.ipca.valor.toFixed(2)}%` : 'N/A',
          taxa_12m_estimada: ipca12m ? `${ipca12m}%` : 'N/A',
          data_referencia: taxas.ipca?.data_referencia || 'N/A',
          descricao: 'Índice de Preços ao Consumidor Amplo - inflação oficial do Brasil'
        },
        igpm: {
          taxa_mes: taxas.igpm ? `${taxas.igpm.valor.toFixed(2)}%` : 'N/A',
          data_referencia: taxas.igpm?.data_referencia || 'N/A',
          descricao: 'Índice Geral de Preços do Mercado - usado em contratos de aluguel'
        },
        poupanca: {
          taxa_mes: taxas.poupanca ? `${taxas.poupanca.valor.toFixed(2)}%` : 'N/A',
          data_referencia: taxas.poupanca?.data_referencia || 'N/A',
          descricao: 'Rendimento da poupança (0,5% ao mês + TR ou 70% da SELIC)'
        }
      },
      comparacao_investimentos: {
        cdi_vs_selic: taxas.cdi && taxas.selic_meta ? 
          `CDI geralmente acompanha a SELIC. Diferença atual: ${Math.abs(parseFloat(cdiAnual) - taxas.selic_meta.valor).toFixed(2)}%` : 
          'Dados insuficientes',
        renda_fixa_vs_inflacao: taxas.ipca && cdiAnual ?
          `Rendimento real estimado (CDI - IPCA): ${(parseFloat(cdiAnual) - parseFloat(ipca12m)).toFixed(2)}%` :
          'Dados insuficientes'
      },
      orientacoes: [
        'CDI é a taxa de referência para investimentos em renda fixa pós-fixados',
        'SELIC é a taxa básica de juros, influencia toda a economia',
        'IPCA é a inflação oficial - seu investimento deve superar o IPCA para ter ganho real',
        'Tesouro Selic rende próximo a 100% do CDI com liquidez diária',
        'Tesouro IPCA+ garante IPCA + taxa prefixada (proteção contra inflação)'
      ],
      fonte: 'Banco Central do Brasil (BCB) - API Oficial',
      observacao: 'Dados atualizados diariamente pelo Banco Central'
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
        erro: 'Erro ao consultar taxas de mercado',
        mensagem: error.message
      })
    };
  }
};
