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
    
    const rendimento = parseFloat(params.rendimento || 0);
    const prazoMeses = parseInt(params.prazo_meses || 0);
    const tipoInvestimento = (params.tipo || 'renda_fixa').toLowerCase();

    // Validações
    if (rendimento <= 0) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          erro: 'Rendimento inválido',
          mensagem: 'O rendimento deve ser maior que zero'
        })
      };
    }

    // Tabela regressiva de IR para Renda Fixa
    const tabelaRendaFixa = [
      { prazo_max: 6, aliquota: 22.5, descricao: 'Até 6 meses' },
      { prazo_max: 12, aliquota: 20.0, descricao: 'De 6 a 12 meses' },
      { prazo_max: 24, aliquota: 17.5, descricao: 'De 12 a 24 meses' },
      { prazo_max: Infinity, aliquota: 15.0, descricao: 'Acima de 24 meses' }
    ];

    // Tabela para Ações (Day Trade e Swing Trade)
    const tabelaAcoes = {
      day_trade: { aliquota: 20.0, descricao: 'Day Trade' },
      swing_trade: { aliquota: 15.0, descricao: 'Swing Trade (acima de 1 dia)' },
      isento: { aliquota: 0, descricao: 'Isento (vendas até R$ 20.000/mês)' }
    };

    // FIIs são isentos de IR sobre ganho de capital
    const tabelaFII = {
      aliquota: 0,
      descricao: 'Isento de IR sobre ganho de capital',
      observacao: 'Dividendos de FIIs são isentos de IR'
    };

    let aliquota = 0;
    let descricao = '';
    let observacoes = [];

    // Determinar alíquota baseado no tipo de investimento
    if (tipoInvestimento === 'renda_fixa') {
      const faixa = tabelaRendaFixa.find(f => prazoMeses <= f.prazo_max);
      aliquota = faixa.aliquota;
      descricao = faixa.descricao;
      observacoes.push('Tabela regressiva de IR para Renda Fixa');
      observacoes.push('Quanto maior o prazo, menor o imposto');
      
    } else if (tipoInvestimento === 'acoes' || tipoInvestimento === 'day_trade') {
      if (tipoInvestimento === 'day_trade') {
        aliquota = tabelaAcoes.day_trade.aliquota;
        descricao = tabelaAcoes.day_trade.descricao;
      } else {
        aliquota = tabelaAcoes.swing_trade.aliquota;
        descricao = tabelaAcoes.swing_trade.descricao;
      }
      observacoes.push('Vendas até R$ 20.000/mês são isentas de IR');
      observacoes.push('IR deve ser pago via DARF até último dia útil do mês seguinte');
      
    } else if (tipoInvestimento === 'fii' || tipoInvestimento === 'fundos_imobiliarios') {
      aliquota = tabelaFII.aliquota;
      descricao = tabelaFII.descricao;
      observacoes.push(tabelaFII.observacao);
      observacoes.push('Apenas ganho de capital é isento');
      
    } else {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          erro: 'Tipo de investimento inválido',
          mensagem: 'Use: renda_fixa, acoes, day_trade ou fii'
        })
      };
    }

    const valorIR = rendimento * (aliquota / 100);
    const rendimentoLiquido = rendimento - valorIR;

    const resultado = {
      parametros: {
        rendimento_bruto: `R$ ${rendimento.toLocaleString('pt-BR', {minimumFractionDigits: 2})}`,
        prazo: prazoMeses > 0 ? `${prazoMeses} meses` : 'N/A',
        tipo_investimento: tipoInvestimento
      },
      calculo_ir: {
        aliquota: `${aliquota}%`,
        faixa: descricao,
        valor_ir: `R$ ${valorIR.toLocaleString('pt-BR', {minimumFractionDigits: 2})}`,
        rendimento_liquido: `R$ ${rendimentoLiquido.toLocaleString('pt-BR', {minimumFractionDigits: 2})}`
      },
      observacoes: observacoes,
      tabela_completa: tipoInvestimento === 'renda_fixa' ? 
        tabelaRendaFixa.map(f => ({
          prazo: f.descricao,
          aliquota: `${f.aliquota}%`
        })) : null
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
        erro: 'Erro ao calcular Imposto de Renda',
        mensagem: error.message
      })
    };
  }
};
