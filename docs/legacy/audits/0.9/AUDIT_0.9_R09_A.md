# Auditoria R09-A · fronteira de experimentos

**Data:** 12 de agosto de 2026

**Baseline:** `0.8.0` promovida e encerrada

**Commits técnicos:** `a187677e50f8fa3a700b962e97d57a6e2e5fe5f9`,
`92144b6b612a970a84ea833aa89d493422782011`

**Veredito:** R09-A concluída dentro do contrato declarado

## Decisão arquitetural

A inferência Bayesiana permanece um modelo de tarefa experimental no shell. Ela
possui schema 1, identidade estável, encoder, decoder, limite de observações,
fixture, replay e controle nulo. Sua posterior pode ser apresentada, mas não
atravessa o comando neural interativo nem altera o drive do motor.

O estímulo interativo é construído por `DirectNeuralStimulus`, limitado a uma
intensidade finita em `[0,1]` e contexto literal zero. O host rejeita qualquer
comando interativo que viole esse limite. Entradas agendadas continuam sendo um
canal distinto para replays explicitamente endereçados.

## Critérios de aceite

| Critério | Evidência | Resultado |
| :-- | :-- | :-- |
| adaptadores explícitos e versionados | `ExperimentEncoder`, `ExperimentDecoder`, schema 1 | passou |
| nenhuma posterior implícita no protocolo | `directNeuralStimulus` e validação no host | passou |
| controle nulo | observação `0,5` conserva a prior | passou |
| replay determinístico | fixture `bayesian-observation-v1.json` e posteriors exatas | passou |
| input seguro | probabilidade, sequência, schema, identidade e teto de 4.096 validados | passou |
| ownership de aplicação | schemas separados de apresentação, execução e seleção científica | passou |
| limite comunicado | painel declara que a posterior não alimenta o motor | passou |

## Matriz executada

| Comando/prova | Resultado |
| :-- | :-- |
| `npm run check` | passou · 17 arquivos/65 testes, typecheck, replay sombra, build, Worker Wasm e auditoria visual |
| replay sombra | passou · três marcos, hashes exatos e divergência máxima zero |
| Worker em navegador | passou · schema 6, 34 buffers, quatro hashes, reset/dispose/reinit e cinco abas |
| promoção 0.8 revalidada | passou · P1–P4 e zero achados altos abertos |
| build de produção | passou · aviso não bloqueante no chunk Three.js de 527,61 kB |

As provas Rust completas da baseline 0.8 também passaram antes da abertura da
R09-A: `cargo fmt`, testes do workspace/all-targets, Clippy com warnings negados e
compilação `brain-wasm` para `wasm32-unknown-unknown`. R09-A não altera Rust,
equações, ABI, buffers, hashes ou fixtures científicos da baseline.

## Limites e próximo gate

O experimento não é alegação de cognição geral, validação biológica ou segundo
motor científico. O produto permanece `0.8.0` enquanto a série 0.9 está em
desenvolvimento. O próximo gate é R09-B: publicar eventos celulares carimbados
com ordem canônica, replay, teto, custo por evento e lifecycle verificado.
