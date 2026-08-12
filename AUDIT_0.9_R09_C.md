# Auditoria R09-C · Prancha Elétrica

**Data:** 12 de agosto de 2026

**Baseline:** `0.8.0` promovida e encerrada; R09-A e R09-B concluídas

**Produto observado:** `0.9.0` em desenvolvimento

**Commit técnico:** `b767aebc74a440a4c71a825a02c31f20408033b9`

**Veredito:** R09-C concluída dentro do contrato declarado

## Decisão arquitetural

`ElectricalBoardLayer` é um scene graph próprio. A aba Eletricidade deixa de
reutilizar a cena celular e passa a projetar 12 nós E/I, quatro vias receptoras,
voltagem, corrente, condutância efetiva, shunt e eventos carimbados. O renderer
não integra equações nem cria um segundo relógio.

Condutância efetiva é a soma `Iᵣ/(Eᵣ−Vd)` para AMPA, NMDA, GABA-A e GABA-B,
calculada somente a partir de correntes/potencial publicados e reversões já
declaradas pelo modelo. Atraso e ganho vêm de `topology.synapses` e aparecem
explicitamente como média macro; não são atribuídos às células do patch.

## Critérios de aceite

| Critério | Evidência | Resultado |
| :-- | :-- | :-- |
| scene graph próprio | `ElectricalBoardLayer`; aba Célula mantém `CellRenderLayer` isolado | passou |
| número com unidade/origem | V/mV, A/pA, S/nS, segundos/ms e tabela de caminhos | passou |
| direção sem depender de cor | orientação/tamanho/posição das setas; círculos E e quadrados I | passou |
| shunt operacional | GABA-A efetiva ≥ 10 pS e força motriz ≤ 3 mV | passou |
| evento não inferido | anéis usam apenas `cellSpikeEvents` e reciclam por hash | passou |
| nível de processamento seguro | agregado/celular/eventos só mudam objetos visíveis | passou |
| invariância científica | câmera, vista e detalhe preservam os cinco hashes | passou |
| acessibilidade | tabs por teclado, equivalente tabular e modo monocromático | passou |
| proveniência | todo objeto renderizável declara STATE, TOPOLOGY ou DECORATION | passou |
| orçamento | 6 draws agregado, 10 celular e 11 eventos; 96 valores já publicados | passou |
| redução de churn | vetores/matrizes reutilizados; visibilidade deixa o loop de frame | passou |

## Matriz executada

| Comando/prova | Resultado |
| :-- | :-- |
| `npm run typecheck` | passou |
| `npm run test -- --run` | passou · 19 arquivos/74 testes |
| `npm run build` | passou |
| `npm run audit:runtime` | passou · cinco vistas desktop/monocromáticas, móvel, teclado, tabela e orçamento |
| `npm run check` | passou · replay sombra, 74 testes, build, Worker Wasm, promoção 0.8 e auditoria visual agregados |
| `cargo test --workspace --all-targets` | passou · 53 testes unitários e todas as integrações/replays |
| `cargo fmt --all -- --check` | passou |
| `cargo clippy --workspace --all-targets -- -D warnings` | passou |
| `cargo check -p brain-wasm --target wasm32-unknown-unknown` | passou |
| captura Eletricidade `1440×960` | passou · nós, vias, unidades e painel legíveis |

O build preserva o aviso não bloqueante já conhecido do chunk Three.js; o linker
MSVC informa apenas a criação normal da biblioteca de importação do host Tauri.
R09-C não altera Rust, ABI, Worker, buffers, passo, solver, topologia ou os
cinco domínios de hash.

## Limites e próximo gate

A prancha é um esquema didático do patch. Ela não implementa seleção, probe,
timeline, comparação, overlay anatômico, feedforward/feedback, recorrência,
relé/TRN nem novos observáveis químicos. A média macro de atraso/ganho serve
como contexto topológico rotulado e não como parâmetro das 12 células.

O próximo gate é R09-D: seleção e vista Neurônio sobre uma das 12 células, sem
mutar o motor e consumindo exclusivamente os eventos carimbados em R09-B.
