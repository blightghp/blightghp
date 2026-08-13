# Auditoria 0.9 · R09-E · dendrito multicompartimental

**Data:** 13 de agosto de 2026

**Corte:** `R09-E`

**IDs:** `MOD-100`, `ENG-025`, `ABI-020`, `QA-100`
**Resultado:** aprovado para publicação

## Escopo entregue

- `CellPatch` schema 2 com `Vs`, `Vp` e `Vd` em SI;
- cabo passivo soma→proximal→distal com matriz tridiagonal implícita;
- `Cs/Cp/Cd = 200/60/40 pF`, `gL,s/gL,p/gL,d = 10/4/2 nS` e
  `gsp/gpd = 6/4 nS`;
- AMPA/NMDA em `Vd`, GABA-A em `Vp` e GABA-B em `Vs`;
- envelope de tensão `[−120,+60] mV` e passo fixo `1/12000 s`;
- hash celular v2 com tags e comprimentos independentes para soma, proximal e
  distal;
- rollback/replay por `CellPatchModel::LegacySingleDendriteV1`;
- fixtures congeladas `cell-patch-v1/v2` e `cell-spike-events-v1/v2`;
- ABI/Worker schema 8 com 37 buffers, incluindo
  `dendriteProximalVolts` e `dendriteDistalVolts`;
- gradiente determinístico no `NeuronRenderLayer`, rótulos redundantes em
  monocromia e atenuação proximal/distal na Prancha Elétrica.

## Critérios de aceite

| Critério | Evidência | Resultado |
| :-- | :-- | :-- |
| convergência | `passive_cable_refinement_reduces_voltage_error` compara 1/6000 e 1/12000 s contra referência 1/96000 s | passou |
| atenuação | drive somático sub-limiar produz `Vs > Vp > Vd > EL` | passou |
| conservação de carga | soma das quatro contribuições axiais pareadas é zero | passou |
| roteamento receptor | teste unitário verifica a força motriz no compartimento declarado | passou |
| envelope SI | todos os três potenciais permanecem finitos em `[−0,120,+0,060] V` | passou |
| replay histórico | solver legado reproduz fixtures v1 bit a bit | passou |
| replay v2 | quatro checkpoints celulares e lotes de eventos v2 reproduzem bits/hashes | passou |
| determinismo | duas simulações igualam tick a tick os cinco hashes por 60 ticks | passou |
| ABI/Worker | navegador real confirma schema 8, 37 buffers distintos e lifecycle exato | passou |
| câmera/material | câmera, detalhe elétrico, seleção e monocromia conservam os cinco hashes | passou |
| Neurônio | 10 draws, 9 valores publicados e 70 vértices de gradiente no preset auditado | passou |
| acessibilidade | soma/proximal/distal têm rótulos e tabela; auditoria monocromática passou | passou |

## Baseline de desempenho

Teste release do lote de 12 células, em `Intel Core i5-10300H`, mediu
`0,849 µs/subpasso`; orçamento: `< 1,0 ms/subpasso`.

A auditoria headless usou Chromium 150 + ANGLE/SwiftShader, 111 amostras,
snapshot de 73.510 bytes e 37 buffers. O perfil completo registrou 48 draws na
cena auditada; o orçamento específico de `NeuronRenderLayer` permaneceu em 10.
Latências headless (`worker p95 = 984,2 ms`, `frame CPU p95 = 917,4 ms`) são
evidência de regressão relativa no backend software, não baseline de GPU física.

## Comandos executados

```text
cargo fmt --all
cargo clippy --workspace --all-targets -- -D warnings
cargo test --release -p brain-engine twelve_cell_batch_stays_within_the_substep_budget -- --nocapture
cargo test --workspace
npm run build:wasm
npm run typecheck
npm run test
npm run build
npm run test:wasm-browser
npm run audit:runtime
npm run check
git diff --check
```

Todos os comandos de gate passaram. `npm run check` confirmou TypeScript,
replay sombra, 86 testes Vitest, build de produção, Worker Wasm v8, promoção
histórica 0.8 e auditoria runtime.

## Riscos e rollback

O solver implícito elimina a restrição de estabilidade do Euler explícito para
a parte passiva, mas não transforma o modelo em árvore espacial nem adiciona
canais dendríticos ativos. Morfologia, axônio e nós continuam ilustrativos.

O rollback científico é `CellPatchModel::LegacySingleDendriteV1`, que preserva
o fixture v1 e copia seu potencial dendrítico para proximal/distal. A ABI e a UI
permanecem v8 para evitar reinterpretação silenciosa de buffers.

## Decisão

R09-E satisfaz o contrato matemático, os gates nativos, a ABI, o Worker, a
apresentação, a acessibilidade e os orçamentos declarados. O corte está pronto
para publicação e o próximo gate canônico é R09-F.
