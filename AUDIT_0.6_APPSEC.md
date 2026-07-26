# Revisão e AppSec · BRAIN PRO 0.6

Data da revisão inicial: 2026-07-26.

Esta auditoria acompanha cada microetapa. O foco não é apenas segurança de rede:
um simulador também precisa proteger integridade numérica, limites de memória,
ordem de eventos e a fronteira Wasm contra entradas hostis ou acidentais.

## 0.6-a · Contrato laminar

Superfície revisada:

- construção de `LaminarConfig`;
- matriz alvo × origem;
- conversão de IDs de camada;
- drives externos;
- crescimento de estado e mensagens de erro.

### Controles confirmados

- números negativos, infinitos e `NaN` são rejeitados;
- IDs fora de L1–L6 são rejeitados;
- projeções não classificadas não entram no solver;
- o estado tem tamanho fixo e não aloca durante `step`;
- a atualização do tick usa soma verificada.

### Achados

| ID | Severidade | Estado | Descrição |
| :-- | :-- | :-- | :-- |
| L06-A-01 | média | fechado | ganhos agora são limitados por `MAX_LAMINAR_GAIN`; o limite e o primeiro valor acima dele possuem testes |
| L06-A-02 | média | fechado | drives externos agora são limitados por `MAX_EXTERNAL_DRIVE`, antes de qualquer multiplicação |

Critério de fechamento: tetos nomeados, erro explícito e testes nos limites e
imediatamente acima deles.

Fechamento: `ParameterOutOfRange` distingue valores finitos excessivos de
`NaN`/infinito/negativo. Nenhum valor fora do envelope chega ao solver.

## 0.6-b · Relé talâmico e TRN

Superfície revisada:

- construção das linhas de atraso;
- ganhos do laço relé–TRN–L6;
- drives sensorial e contextual;
- estados de relé, TRN, rebote e coluna laminar;
- reinicialização dos cursores e buffers.

### Controles confirmados

- o circuito é determinístico e não usa `unsafe`;
- todos os estados dinâmicos passam por relaxação limitada a `[0,1]`;
- os atrasos são buffers privados e reinicializáveis;
- nenhum estado fisiológico é aceito diretamente da apresentação.

### Achados

| ID | Severidade | Estado | Descrição |
| :-- | :-- | :-- | :-- |
| L06-B-01 | alta | aberto | a razão atraso/`dt` ainda pode resultar em alocação excessiva ou divisão por zero quando `dt` é menor que a resolução de `Duration` |
| L06-B-02 | média | aberto | ganhos e drives são finitos e não negativos, mas ainda não possuem teto explícito antes das multiplicações |

Critério de correção: converter atraso em passos sem pânico, rejeitar linhas
acima de um máximo nomeado, limitar ganhos/drives e testar os pontos de
fronteira.
