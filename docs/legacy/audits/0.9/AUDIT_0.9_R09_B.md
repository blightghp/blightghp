# Auditoria R09-B · eventos celulares carimbados

**Data:** 12 de agosto de 2026

**Baseline:** `0.8.0` promovida e encerrada; R09-A concluída

**Produto observado:** `0.9.0` em desenvolvimento

**Commits técnicos:** `a2202329479466472f98a92e563527b09548c761`,
`547e2402cf12d4b0ed909e73994c8ef11578179f`,
`554910d4d9ce64f06a0df449721c03f2219a8884`,
`237eff289e80bcb07b66333a2588d1b3555a9521`

**Veredito:** R09-B concluída dentro do contrato declarado

## Decisão arquitetural

O Rust é o único proprietário dos spikes celulares publicados. Cada evento
carrega `cellId` e `timeOffsetSeconds`; o lote cobre o intervalo entre os ticks
inicial e final do snapshot. ABI, Worker e renderer não reconstroem eventos a
partir de flags instantâneos.

O wire usa schema de evento 1 e dois arrays paralelos: `Uint32Array` para IDs e
`Float64Array` para offsets. A ABI sobe para 7 e 36 buffers. A ordem canônica é
`(timeOffsetSeconds, cellId)`, o teto é 4.096 eventos e o custo máximo do lote é
49.152 bytes por snapshot. Um quinto hash FNV-1a cobre schema, janela, tamanho,
IDs e bits `f64` sem alterar os quatro domínios anteriores.

## Critérios de aceite

| Critério | Evidência | Resultado |
| :-- | :-- | :-- |
| evento pertencente ao Rust | `CellSpikeEvent` nasce em `cell_patch` e é agregado por `simulation` | passou |
| carimbo e ordem canônica | validação Rust/host e replay de três intervalos | passou |
| replay não vazio | `cell-spike-events-v1.json`, 55 eventos com IDs e bits exatos | passou |
| limite e atomicidade | primeiro lote acima de 4.096 é rejeitado antes da publicação | passou |
| hash independente | quinto domínio cobre somente o lote e sua janela | passou |
| transporte compacto | schema 7, 36 buffers distintos e 12 bytes/evento | passou |
| consumo sem inferência | `CellRenderLayer` usa somente `cellSpikeEvents.cellIds` | passou |
| lifecycle | reset/dispose/reinit preservam replay e cinco hashes | passou |
| backpressure | teto de 64 comandos; rajada real produz 65 respostas e ao menos uma rejeição explícita | passou |
| compatibilidade 0.8 | gate histórico ABI v6/34 buffers/quatro hashes continua reproduzível | passou |

## Matriz executada

| Comando/prova | Resultado |
| :-- | :-- |
| `npm run check` | passou · 18 arquivos/69 testes, typecheck, replay sombra, build, Worker Wasm e auditoria visual |
| Worker em navegador | passou · schema 7, 36 buffers, cinco hashes, reset/dispose/reinit e cinco abas |
| backpressure em navegador | passou · 65 respostas sob rajada e rejeição `worker-backpressure` |
| `cargo test --workspace --all-targets` | passou · 53 testes unitários do motor e todas as integrações/replays |
| `cargo fmt --all -- --check` | passou |
| `cargo clippy --workspace --all-targets -- -D warnings` | passou |
| `cargo check -p brain-wasm --target wasm32-unknown-unknown` | passou |
| promoção 0.8 revalidada | passou · P1–P4 e zero achados altos abertos |

O build de produção mantém apenas o aviso não bloqueante do chunk Three.js de
527,61 kB. O linker MSVC também informa a criação normal da biblioteca de
importação do host Tauri; não há warning de código no Clippy.

## Limites e próximo gate

Um lote vazio é válido quando nenhum spike ocorre no intervalo. O cenário
integrado de auditoria pode legitimamente produzir zero eventos; a fixture de
alta atividade existe para provar de forma independente a geração não vazia,
a ordenação e o replay exato. O lote não afirma resolução subcelular nem cria
um segundo relógio.

R09-B não implementa seleção de neurônio, nova vista ou novo modelo de membrana.
O próximo gate é R09-C: construir a Prancha Elétrica consumindo apenas estados e
eventos publicados, com orçamento gráfico declarado antes do merge.
