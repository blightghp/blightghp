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

## 0.6-c · ABI Wasm e Worker

Superfície revisada:

- quinze buffers de topologia recebidos pelo construtor Wasm;
- alvo de tick recebido em cada comando;
- treze buffers transferíveis do snapshot;
- hashes legado e córtico-talâmico;
- fallback diagnóstico e descarte da instância Wasm.

### Controles confirmados

- comprimentos paralelos de sinapses são comparados antes do `zip`;
- tipos de neurônio fora do contrato são rejeitados;
- o snapshot laminar tem tamanho fixo em Rust;
- cada `ArrayBuffer` transferido aparece uma única vez;
- o fallback publica zeros e informa degradação;
- o hash 0.5 permanece separado do novo hash córtico-talâmico.

### Achados

| ID | Severidade | Estado | Descrição |
| :-- | :-- | :-- | :-- |
| L06-C-01 | alta | aberto | o construtor aceita quantidades arbitrárias de nós, sinapses e arestas antes de alocar o motor |
| L06-C-02 | alta | aberto | uma mensagem `advance` pode solicitar um salto de tick muito grande e monopolizar o Worker |

Critério de correção: cotas públicas para topologia e trabalho por comando,
rejeição antes da alocação/loop e testes exatamente no limite e acima dele.
