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
    
    const tema = (params.tema || '').toLowerCase();
    const nivel = (params.nivel || 'iniciante').toLowerCase();

    // Base de conhecimento MVI (pode ser expandida)
    const conteudos = {
      'acoes': {
        iniciante: [
          {
            titulo: 'Módulo 1: Introdução ao Mercado de Ações',
            descricao: 'Aprenda o básico sobre ações, bolsa de valores e como começar a investir',
            topicos: ['O que são ações', 'Como funciona a bolsa', 'Primeiros passos'],
            duracao: '2 horas'
          },
          {
            titulo: 'Módulo 2: Análise Fundamentalista Básica',
            descricao: 'Entenda os principais indicadores para avaliar ações',
            topicos: ['P/L', 'P/VP', 'Dividend Yield', 'ROE'],
            duracao: '3 horas'
          }
        ],
        intermediario: [
          {
            titulo: 'Módulo 5: Análise Fundamentalista Avançada',
            descricao: 'Aprofunde-se em DRE, Balanço Patrimonial e Fluxo de Caixa',
            topicos: ['DRE completo', 'Balanço Patrimonial', 'Valuation'],
            duracao: '4 horas'
          },
          {
            titulo: 'Módulo 6: Estratégias de Investimento',
            descricao: 'Aprenda diferentes estratégias para montar sua carteira',
            topicos: ['Buy and Hold', 'Dividendos', 'Growth vs Value'],
            duracao: '3 horas'
          }
        ],
        avancado: [
          {
            titulo: 'Módulo 10: Valuation Profissional',
            descricao: 'Técnicas avançadas de precificação de ações',
            topicos: ['Fluxo de Caixa Descontado', 'Múltiplos', 'Análise de Cenários'],
            duracao: '5 horas'
          }
        ]
      },
      'fiis': {
        iniciante: [
          {
            titulo: 'Módulo 3: Fundos Imobiliários para Iniciantes',
            descricao: 'Tudo sobre FIIs: o que são, como funcionam e como investir',
            topicos: ['O que são FIIs', 'Tipos de FIIs', 'Dividend Yield'],
            duracao: '2 horas'
          }
        ],
        intermediario: [
          {
            titulo: 'Módulo 7: Análise de FIIs',
            descricao: 'Como analisar fundos imobiliários profissionalmente',
            topicos: ['P/VP', 'Vacância', 'Qualidade dos ativos', 'Gestão'],
            duracao: '3 horas'
          }
        ]
      },
      'renda_fixa': {
        iniciante: [
          {
            titulo: 'Módulo 4: Renda Fixa Descomplicada',
            descricao: 'Entenda Tesouro Direto, CDBs, LCIs e LCAs',
            topicos: ['Tesouro Direto', 'CDB', 'LCI/LCA', 'Tributação'],
            duracao: '2 horas'
          }
        ],
        intermediario: [
          {
            titulo: 'Módulo 8: Estratégias de Renda Fixa',
            descricao: 'Monte uma carteira de renda fixa eficiente',
            topicos: ['Diversificação', 'Marcação a mercado', 'Duration'],
            duracao: '3 horas'
          }
        ]
      },
      'imposto': {
        iniciante: [
          {
            titulo: 'Módulo 9: Impostos para Investidores',
            descricao: 'Aprenda a calcular e declarar IR sobre investimentos',
            topicos: ['IR em ações', 'IR em FIIs', 'DARF', 'Declaração anual'],
            duracao: '2 horas'
          }
        ]
      },
      'geral': {
        iniciante: [
          {
            titulo: 'Trilha Completa MVI - Iniciante',
            descricao: 'Comece do zero e aprenda todos os fundamentos de investimentos',
            topicos: ['Mindset', 'Renda Fixa', 'Ações', 'FIIs', 'Estratégias'],
            duracao: '20 horas'
          }
        ]
      }
    };

    // Determinar recomendações
    let recomendacoes = [];
    
    if (tema && conteudos[tema] && conteudos[tema][nivel]) {
      recomendacoes = conteudos[tema][nivel];
    } else if (tema && conteudos[tema]) {
      // Se não tem conteúdo no nível, pega o iniciante
      recomendacoes = conteudos[tema]['iniciante'] || [];
    } else {
      // Recomendação geral
      recomendacoes = conteudos['geral']['iniciante'];
    }

    const resultado = {
      perfil: {
        tema_interesse: tema || 'geral',
        nivel: nivel
      },
      recomendacoes: recomendacoes,
      proximos_passos: [
        'Assista aos módulos recomendados',
        'Pratique com simulações',
        'Tire dúvidas com a Lucra.AI',
        'Avance para o próximo nível'
      ],
      observacao: 'Conteúdos disponíveis na plataforma MVI',
      contato: 'Para acessar os módulos completos, entre em contato com o suporte MVI'
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
        erro: 'Erro ao recomendar conteúdo',
        mensagem: error.message
      })
    };
  }
};
