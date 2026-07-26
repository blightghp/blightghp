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
