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
    // Pegar parâmetros da query string
    const params = event.queryStringParameters || {};
    
    const valorInicial = parseFloat(params.valor_inicial || 0);
    const aportesMensais = parseFloat(params.aportes_mensais || 0);
    const taxaAnual = parseFloat(params.taxa_anual || 0);
    const prazoMeses = parseInt(params.prazo_meses || 12);

    // Validações
    if (valorInicial < 0 || aportesMensais < 0 || taxaAnual < 0 || prazoMeses <= 0) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          erro: 'Parâmetros inválidos',
          mensagem: 'Todos os valores devem ser positivos e prazo maior que zero'
        })
      };
    }

    // Converter taxa anual para mensal
    const taxaMensal = Math.pow(1 + (taxaAnual / 100), 1/12) - 1;

    // Calcular montante final com juros compostos
    let montante = valorInicial;
    let totalInvestido = valorInicial;
    const evolucao = [];

    for (let mes = 1; mes <= prazoMeses; mes++) {
      // Aplicar juros sobre o montante atual
      montante = montante * (1 + taxaMensal);
      
      // Adicionar aporte mensal
      montante += aportesMensais;
      totalInvestido += aportesMensais;

      // Guardar evolução a cada 12 meses ou no último mês
      if (mes % 12 === 0 || mes === prazoMeses) {
        evolucao.push({
          mes: mes,
          ano: Math.floor(mes / 12) + (mes % 12 > 0 ? ` (${mes % 12} meses)` : ''),
          montante: parseFloat(montante.toFixed(2)),
          total_investido: parseFloat(totalInvestido.toFixed(2)),
          rendimento: parseFloat((montante - totalInvestido).toFixed(2))
        });
      }
    }

    const rendimentoTotal = montante - totalInvestido;
    const rentabilidadePercentual = (rendimentoTotal / totalInvestido) * 100;

    const resultado = {
      parametros: {
        valor_inicial: `R$ ${valorInicial.toLocaleString('pt-BR', {minimumFractionDigits: 2})}`,
        aportes_mensais: `R$ ${aportesMensais.toLocaleString('pt-BR', {minimumFractionDigits: 2})}`,
        taxa_anual: `${taxaAnual}%`,
        prazo: `${prazoMeses} meses (${Math.floor(prazoMeses/12)} anos e ${prazoMeses%12} meses)`
      },
      resultado_final: {
        montante_final: `R$ ${montante.toLocaleString('pt-BR', {minimumFractionDigits: 2})}`,
        total_investido: `R$ ${totalInvestido.toLocaleString('pt-BR', {minimumFractionDigits: 2})}`,
        rendimento_total: `R$ ${rendimentoTotal.toLocaleString('pt-BR', {minimumFractionDigits: 2})}`,
        rentabilidade_percentual: `${rentabilidadePercentual.toFixed(2)}%`
      },
      evolucao_anual: evolucao.map(e => ({
        periodo: e.ano,
        montante: `R$ ${e.montante.toLocaleString('pt-BR', {minimumFractionDigits: 2})}`,
        investido: `R$ ${e.total_investido.toLocaleString('pt-BR', {minimumFractionDigits: 2})}`,
        rendimento: `R$ ${e.rendimento.toLocaleString('pt-BR', {minimumFractionDigits: 2})}`
      }))
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
        erro: 'Erro ao simular investimento',
        mensagem: error.message
      })
    };
  }
};
