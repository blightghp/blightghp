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
| L06-B-01 | alta | fechado | a linha de atraso é construída por contagem verificada e rejeitada acima de `MAX_CORTICOTHALAMIC_DELAY_STEPS`, sem depender da resolução de `Duration` |
| L06-B-02 | média | fechado | ganhos e drives possuem tetos públicos e são rejeitados antes das multiplicações |

Correção confirmada: a conversão de atraso não faz cast de ponto flutuante nem
aloca antes de concluir a contagem; os testes cobrem `dt` subnanosegundo, ganho
imediatamente acima do teto e drive excessivo.
