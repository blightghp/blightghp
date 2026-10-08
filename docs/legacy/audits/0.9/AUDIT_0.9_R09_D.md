# Auditoria R09-D · seleção e vista Neurônio

**Data:** 13 de agosto de 2026

**Baseline:** `0.8.0` promovida; R09-A, R09-B e R09-C concluídas

**Produto observado:** `0.9.0` em desenvolvimento

**Base Git de entrada:** `168fa5df40645b3f6b37a0f02f4d65a50e7c1a4b`

**Veredito:** R09-D concluída dentro do contrato declarado

## Decisão arquitetural

`NeuronRenderLayer` é um scene graph próprio e lê somente a célula endereçada
por `selectedCellId`. Seleção vive na aplicação: raycast nos somata e lista de 12
botões convergem para o mesmo ID, sem comando novo ao Worker. A sexta vista
apresenta soma, dendrito único, adaptação, AMPA, NMDA, GABA-A, GABA-B e os
eventos carimbados daquela célula.

A morfologia é ilustração procedural. `seed + cellId` endereçam um stream
exclusivo de apresentação e dendritos, axônio e nós recebem hash FNV-1a de 64
bits. Toda a árvore usa um único `dendriteVolts[i]`; não há gradiente, tipo
celular anatômico ou propagação axonal reivindicada. O axônio mostra somente um
marcador estático se o lote R09-B contém a célula selecionada.

## Critérios de aceite

| Critério | Evidência | Resultado |
| :-- | :-- | :-- |
| seleção fechada | parser `0..11`; lista e raycast usam o mesmo ID | passou |
| seleção não muta motor | ciclo `1 → 4 → 1` com relógio congelado preserva os cinco hashes | passou |
| teclado/foco | `Tab` percorre; `Enter` amplia; `Escape` retorna e restaura foco | passou |
| geometria determinística | mesma seed/célula reproduz arrays e hash; outro ID diverge | passou |
| dendrito honesto | todos os ramos usam somente `dendriteVolts[i]` | passou |
| evento não inferido | `cellPatch.spiked` isolado não acende marcador; lote carimbado acende | passou |
| unidade/origem | oito linhas tabulares apontam para patch, eventos ou stream geométrico | passou |
| proveniência | todo objeto renderizável declara STATE, TOPOLOGY ou DECORATION | passou |
| redundância sem cor | soma E/I muda forma; correntes usam sentido, tamanho, posição e rótulo | passou |
| orçamento | 10 draws, oito valores por snapshot e zero rebuild geométrico por frame | passou |
| navegador | seis abas, 12 seletores, modo monocromático, desktop e mobile | passou |

## Matriz executada

| Comando/prova | Resultado |
| :-- | :-- |
| `npm run typecheck` | passou |
| `npm run test -- --run` | passou · 20 arquivos/81 testes |
| `npm run build` | passou |
| `npm run test:wasm-browser` | passou · ABI v7, 36 buffers, cinco hashes, lifecycle e seis abas |
| `npm run audit:runtime` | passou · 13 capturas, teclado/foco, geometria, orçamento e invariância |
| `npm run check` | passou · replay sombra, testes, build, Worker Wasm, promoção 0.8 e auditoria runtime |
| `cargo test --workspace --all-targets` | passou · 53 testes unitários e todas as integrações/replays |
| `cargo fmt --all -- --check` | passou |
| `cargo clippy --workspace --all-targets -- -D warnings` | passou |
| `cargo check -p brain-wasm --target wasm32-unknown-unknown` | passou |
| inspeção de `cell-desktop.png` e `neuron-desktop.png` | passou · seleção, árvore, unidades e painel legíveis |
| inspeção de `neuron-monochrome.png` | passou · forma, direção, posição e tabela preservam informação |

O build preserva o aviso não bloqueante já conhecido do chunk Three.js. O linker
MSVC emite apenas a mensagem normal de criação da biblioteca de importação do
host Tauri. A auditoria headless usa SwiftShader e não substitui o baseline de
GPU física da promoção 0.8.

## Limites e próximo gate

R09-D não adiciona compartimentos, canais, espinhas, sítios pós-sinápticos,
velocidade de condução, mielina funcional, química por célula ou morfologia de
tipo biológico. Seleção não é persistida e a Prancha Elétrica continua sem probe
próprio. O rollback é ocultar a sexta vista e conservar o patch de 12 células;
ABI, Worker, snapshots, buffers e replays não exigem migração.

O próximo gate é R09-E: dendrito multicompartimental. Ele só entra após pergunta
científica, condições de contorno, convergência de cabo e novo contrato Rust/ABI;
até lá, a árvore inteira permanece ligada a um único potencial publicado.
