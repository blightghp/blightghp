# Revisão arquitetural · adoção do Unrail Motor

**Data:** 21 de agosto de 2026

**Veredito:** aceita como direção subordinada, com correções bloqueantes

**Mudança runtime:** nenhuma; `engine/` e dependências novas não foram criados

## Escopo e método

A revisão confrontou a proposta com a árvore real, manifests Cargo/npm, CI,
`brain-engine`, host Tauri, especificações e roadmap. Premissas de Cargo, Rust,
ABI, `unsafe` e GPU foram checadas em [fontes primárias](../references/unrail/PRIMARY_REFERENCES.md).

Três leituras independentes cobriram arquitetura técnica, governança de roadmap
e organização do repositório. O patch de integração foi validado sintaticamente,
mas rejeitado semanticamente por criar uma segunda governança.

## O que a proposta acerta

- preserva `brain-engine` como único proprietário da ciência;
- mantém a pilha web promovida como baseline e trata o nativo como alvo adicional;
- propõe workspace separado, dependências atrás de fachadas, provenance e
  budgets desde o primeiro corte;
- reconhece honestamente a escala plurianual e o valor de rollback;
- separa determinismo científico, simulação de matéria e apresentação;
- traz segurança, acessibilidade e custo para a arquitetura do motor.

## Correções aplicadas

| Achado | Risco | Resolução vigente |
| :-- | :-- | :-- |
| “seis anéis” com IDs 0–6 | modelo inconsistente | sete anéis; mesmo anel permite DAG, nunca dependência para anel maior |
| UM-002 baseado na gramática de uma frase | explosão artificial de pacotes | crate só nasce por fronteira coesa e evidência de isolamento/reúso |
| 84 bibliotecas tratadas como estrutura final | dezenas de scaffolds vazios | 84 viraram limite superior de capacidades candidatas |
| fatia declarada com 12 nomes | lista contém 13 e o grafo completo alcança mais capacidades | lista preservada como hipótese; `UM0-A0` começa com um runner mínimo |
| dez inversões cronológicas de dependência | fatia não compilável | `UM0-ENTRY` recalcula DAG; plano deixou de autorizar implementação direta |
| `neuro_sim` dependia de “todos acima” | acoplamento total | depende inicialmente só de `brain-engine` e contrato do runner; features entram por corte |
| tabela `DEP-*` sem pacote, versão ou licença | supply chain não auditável | nenhuma dependência é ativa; identidade/lock/SPDX/features/SBOM/advisory são bloqueantes |
| ocultação de nomes e arquivo local secreto no CI | licença/CVE irreproduzível | transparência pública; regra versionada; manifests, SBOM, CVEs e fontes nunca são mascarados |
| proibição absoluta de vendoring | build offline inviável | `cargo vendor` controlado é permitido com origem, licença, hash e atualização |
| autoria própria de crypto/codecs/compressão | risco de segurança e correção | implementação auditada é padrão; autoria exige threat model, fuzzing e valor comprovado |
| orçamento de `unsafe` com nomes/contagens errados | falsa sensação de contenção | inventário por locais/linhas/símbolos, `SAFETY`, Miri e backends corretos |
| determinismo científico cross-platform irrestrito | alegação além da prova | garantia limitada a runtime/plataforma/fixture; matriz explícita para ampliar domínio |
| ABI dinâmica = “mesma toolchain” | contrato binário insuficiente | release/target/features, `repr(C)`, tamanhos, ownership, allocator, panic e handshake explícitos |
| macros procedurais chamadas de tipadas/higiênicas | premissa factual falsa | documentação oficial: token streams, compile time e não higiene; segurança equivalente a build scripts |
| link nativo fecharia C-09 no primeiro corte | config/topologia/hash ausentes | A0 cria fixture headless; C-09 só pode fechar em UM0-F |
| topologia vascular atribuída a `neuro_anatomy` | owner errado | catálogo em `neuro_anatomy`; vascular em `neuro_vascular` |
| dois roadmaps/versionamentos ativos | prioridades concorrentes | um roadmap, WIP global 1, horizonte Unrail sem autoridade |

## Decisões técnicas

O workspace aninhado é uma direção válida: Cargo aceita `exclude` no workspace
raiz, e cada workspace mantém lockfile/target próprios. Isso será provado em
`UM0-ENTRY`, não presumido. O root `cargo test --workspace` continuará cobrindo
apenas ciência/Wasm/Tauri; `engine/` terá CI explícito e path-filtered.

Uma camada gráfica candidata não foi escolhida. A API consultada de `wgpu`
expõe `Surface` com lifetime associado à janela e continua evoluindo; portanto a
fachada precisa provar ordem `Window > Surface > Device` e fixar versão/features
antes de qualquer código. Página “latest” não é lock.

## Arquitetura de pastas adotada agora

```text
docs/
├── specifications/unrail/
│   ├── README.md
│   ├── ARCHITECTURE.md
│   ├── CAPABILITY_CATALOG.md
│   ├── DEPENDENCY_POLICY.md
│   └── GLOSSARY.md
├── planning/
│   ├── ROADMAP.md
│   ├── NEXT_STAGE_R10_E.md
│   ├── PLAN_UNRAIL_UM0.md
│   └── backlog/UNRAIL_HORIZONS.md
├── references/unrail/
│   ├── PRIMARY_REFERENCES.md
│   └── REFERENCE_TEARDOWN.md
└── reviews/UNRAIL_ARCHITECTURE_REVIEW.md
```

Não foram movidos `src/`, `scripts/`, `fixtures/` ou `artifacts/`: imports,
workflows, `include_str!` e verificadores dependem dos caminhos promovidos. A
organização deve seguir cortes funcionais, não uma limpeza cosmética arriscada.

## Layout futuro condicionado

```text
engine/
├── Cargo.toml, Cargo.lock, rust-toolchain.toml
├── policy/
├── crates/{foundation,data,render,simulation,framework,autonomy,tools}/
├── products/neuro/{crates,apps/neuro_sim}/
├── fixtures/{contracts,golden,replays,synthetic}/
└── xtask/
```

Shaders ficam junto do crate que os possui. Fixtures espelhadas carregam origem,
schema e hash: catálogo pertence a `neuro_anatomy`; vascular a
`neuro_vascular`. `engine/target/` e workflow separado entram atomicamente com o
workspace, nunca antes.

## Segurança e desempenho

Como esta etapa é documental, não abriu superfície runtime nem mudou o bundle.
Os riscos futuros bloqueiam `UM0-ENTRY`: lock/SBOM/licenças/advisories,
`unsafe`, FFI, input limits, fuzz/Miri, backend headless, métricas de build/RSS e
rollback conjunto. FNV-1a permanece fingerprint de regressão, não digest seguro.

O orçamento gráfico original de 8 ms não distinguia CPU, GPU e apresentação.
O plano corrigido exige backend, adaptador, driver, resolução, energia, warm-up,
amostras e timestamps; vsync `Fifo` não conta como prova de custo.

## Consequência visual

A arquitetura nativa não resolve a dívida estética atual. A inspeção das
capturas R10-D confirma macroforma reconhecível, mas material azul plástico,
relevo pouco separado, cerebelo bulboso e vasos competindo com o tecido. O
próximo corte continua sendo [R10-E](../planning/NEXT_STAGE_R10_E.md), com
comparação contra fotografia/seção e viewers 3D atribuídos. Unrail só herda um
contrato visual depois que o baseline web estiver medido e estável.

## Verificação desta publicação

| Gate local | Resultado em 21 ago 2026 |
| :-- | :-- |
| documentação | 59 arquivos e 236 links locais válidos; checker JavaScript sintaticamente válido; uma única fonte com `ROADMAP` no nome |
| frontend | `npm run check` aprovado: 28 arquivos/144 testes Vitest, TypeScript, build, Wasm/browser e auditorias visuais/de orçamento |
| Rust | `cargo fmt --check`, 83 testes, `clippy -- -D warnings` e `brain-wasm` para `wasm32-unknown-unknown` aprovados |
| dependências JavaScript | `npm audit --omit=dev`: zero vulnerabilidades |
| dependências Rust | `cargo audit`: zero vulnerabilidades em 463 dependências; 17 avisos permitidos já existentes — 16 sem manutenção e `RUSTSEC-2024-0429` de soundness em `glib 0.18.5` via GTK3/Tauri |
| desempenho/build | nenhum arquivo runtime mudou; build manteve o aviso conhecido do chunk `three-core` em 567,63 kB (143,97 kB gzip), que R10-E não pode ampliar sem orçamento promovido |
| higiene | `git diff --check` limpo e nenhum padrão de credencial literal no diff |

Os avisos RustSec foram promovidos a dívida explícita de R11, não ignorados. A
publicação e o CI remoto continuam sendo verificados pelo commit de `main`.
Nenhuma afirmação de implementação Unrail é permitida até existir auditoria de
um corte promovido.
