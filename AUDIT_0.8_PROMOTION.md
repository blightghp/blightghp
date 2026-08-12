# Auditoria final de promoção 0.8 · BRAIN PRO

**Data:** 12 de agosto de 2026

**Candidata técnica:** `d9e915fed6c5350c991c41e10131319605e29dbd`

**Gate executável:** `fe6127f`

**Veredito:** `0.8.0` promovida dentro dos contratos e ambientes declarados

## Escopo e rastreabilidade

R08-P4 reuniu as provas independentes de P1–P3 sem alterar equações, fixtures,
ABI ou hashes científicos. O artefato
[`artifacts/promotion-0.8.json`](artifacts/promotion-0.8.json) liga a candidata,
as quatro fases, a matriz executada, os achados residuais e o rollback. O comando
`npm run verify:promotion-0.8` rejeita divergência entre:

- versões npm, Cargo e Tauri;
- protocolo TypeScript e schema da simulação Rust;
- ABI v6, 34 buffers, quatro domínios de hash e lifecycle do Worker;
- relatório headless, baseline físico e arquivos de captura;
- candidata Git e histórico atual;
- achados altos abertos ou limitação sem responsável/fase.

## Resultado dos gates

| Gate | Resultado | Evidência |
| :-- | :-- | :-- |
| R08-P1 · fonte documental | PASSOU | `f70207d`, roadmap e especificações canônicas |
| R08-P2 · ABI v6 | PASSOU | [AUDIT_0.8_ABI_V6.md](AUDIT_0.8_ABI_V6.md) e auditoria headless |
| R08-P3 · gráficos reais | PASSOU | [AUDIT_0.8_GRAPHICS.md](AUDIT_0.8_GRAPHICS.md) e baseline Intel/D3D11 |
| R08-P4 · concordância final | PASSOU | artefato schema 1 e verificador executável |

O baseline físico registrou Intel UHD Graphics 770 via ANGLE/D3D11, 237
amostras, `6,04 ms` de média e `13,70 ms` de p95 no Worker, `3,57 ms` de média e
`8,10 ms` de p95 de CPU por frame, 48 draw calls, 145.778 triângulos e erro
pixel→estado máximo `0,0016828` para tolerância `0,012`. Os 72 objetos `STATE`
possuem binding e pista não cromática; não há proveniência visual ausente.

## Matriz executada

| Comando/prova | Resultado |
| :-- | :-- |
| `npm run check` | PASSOU · 16 arquivos/60 testes, build, Worker real, duas auditorias versionadas e auditoria temporária |
| `npm audit --omit=dev` | PASSOU · 0 vulnerabilidades |
| `npm run verify:brain-gif` | PASSOU · GIF sincronizado com motor Rust-Wasm/ABI 6 |
| `cargo fmt --all -- --check` | PASSOU |
| `cargo test --workspace --all-targets` | PASSOU · 49 testes do núcleo e todas as suítes de replay/integração |
| `cargo clippy --workspace --all-targets -- -D warnings` | PASSOU |
| `cargo check -p brain-wasm --target wasm32-unknown-unknown` | PASSOU |
| bindings Wasm temporários + hashes + shadow replay | PASSOU · três interfaces textuais idênticas e divergência máxima zero no Wasm recém-gerado |

A igualdade byte a byte do binário `.wasm` não é usada entre hosts: o artefato
versionado foi produzido pelo GitHub Actions/Linux e a recompilação desta
auditoria ocorreu no Windows, podendo divergir por codegen mesmo com tamanho e
interface iguais. A prova portátil compara as três interfaces geradas e executa
o replay sombra contra o módulo recém-gerado; ambos passaram. O artefato
versionado passou separadamente no Worker real do navegador.

## Achados e limites aceitos

Não há achado alto aberto. P1–P4, E1–E4, R1–R3 e M3 estão fechados. Os itens
abaixo não são silenciosamente tratados como concluídos; ficam aceitos para a
0.9, com dono e corte explícitos no artefato de promoção:

| IDs | Classe | Responsável/corte | Motivo de não bloquear 0.8 |
| :-- | :-- | :-- | :-- |
| P5 | médio | motor de experimentos · R09-A | é a própria fronteira funcional que inicia 0.9 |
| R4–R5 | médio | interface gráfica · R09-C | a legenda existe; a Prancha Elétrica substitui o glifo e separa as vistas |
| R6–R7 | baixo | desempenho gráfico · R09-C | custo físico foi medido; otimização acompanha a nova camada |
| M1 | escopo de modelo | eventos do motor · R09-B | carimbos por spike precedem animação axonal |
| M2 | escopo de modelo | modelo celular · R09-E | multicompartimentos precedem gradiente dendrítico |

A promoção não afirma validação clínica, anatomia real, universalidade de custo
entre GPUs, calibração fisiológica dos presets ou capacidades planejadas da 0.9.

## Decisão e rollback

Código, contrato, testes, custo e evidência concordam para a candidata. A 0.8.0
passa a ser o baseline promovido, e R09-A pode começar com segurança. Qualquer
divergência futura de versão, ABI, auditoria física ou matriz reabre R08-P4; até
nova correção auditada, o rollback documental e operacional é a baseline 0.7.
