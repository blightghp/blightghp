# Auditoria de entrada da 0.5

**Data:** 26 de julho de 2026
**Escopo:** coerência científica, arquitetura Rust/Wasm, matemática, qualidade
executável e publicação do GIF de perfil.

## Veredito

O projeto está **apto a abrir o desenvolvimento da 0.5**. A fundação 0.4
permanece como oráculo executável e os dois primeiros cortes da migração já
possuem código: workspace Rust/Wasm e contrato laminar mínimo.

Isso não significa que o motor Rust já possa substituir o motor TypeScript. A
promoção continua bloqueada, de propósito, até relógio, RNG, CSR, campo e
observáveis demonstrarem paridade nativa↔Wasm↔oráculo e até o módulo rodar em um
Worker de navegador real.

## Incoerências encontradas e resolvidas

| Achado | Risco | Resolução |
| :-- | :-- | :-- |
| 0.5 misturava nova fisiologia com troca de runtime | reescrita sem oráculo e regressões silenciosas | 0.5 agora é exclusivamente o corredor Rust/Wasm; lâminas completas começam na 0.6 |
| Rust existia apenas como host Tauri | duas fontes de verdade para web e desktop | criado `brain-engine` puro e reutilizado pelo host; `brain-wasm` é apenas a ABI |
| C# podia ser interpretado como proteção do cálculo no cliente | falsa promessa de segurança e segundo runtime no browser | C# foi limitado a booster externo, opcional e condicionado a benchmark |
| o plano matemático nomeava modelos sem governança numérica suficiente | resultados finitos, porém não necessariamente corretos | adotados contratos de unidade, convergência, invariantes, sensibilidade e solvers por classe |
| o GIF era manual e o termo “instantâneo” ignorava runner/cache | perfil divergente do simulador | captura determinística, commit conjunto e chave de cache derivada do SHA; consistência declarada como eventual |
| o CI Rust cobria somente `src-tauri` | regressão no motor ou no alvo Wasm sem gate | CI ampliado para workspace, formatação, testes, Clippy e compilação `wasm32-unknown-unknown` |

## Evidência executada

| Gate | Resultado |
| :-- | :-- |
| `cargo fmt --all -- --check` | aprovado |
| `cargo test --workspace` | 11 testes aprovados |
| `cargo clippy --workspace --all-targets -- -D warnings` | aprovado |
| `cargo check -p brain-wasm --target wasm32-unknown-unknown` | aprovado |
| Clippy de `brain-wasm` no alvo Wasm | aprovado |
| `npm run check` | typecheck, 65 testes e build aprovados |
| `npm run generate:brain-gif` | 60 frames; 760×430; 3,66 MiB |
| `git diff --check` | aprovado |

O kernel laminar testado garante IDs estáveis L1–L6, rejeição de parâmetros
inválidos, determinismo, estado finito/limitado, propagação de drive da L4 e
reset completo. Seus pesos ainda são procedurais e não calibrados; o modelo
existe para validar a fronteira e não para sustentar uma alegação fisiológica.

## Estado operacional do GitHub

Em 26 de julho de 2026:

- `main` não possui proteção que impeça o commit automatizado;
- GitHub Actions está desabilitado no repositório;
- `sync-brain-gif.yml` está pronto, mas não executará enquanto Actions estiver
  desabilitado;
- nenhum PAT é necessário para a sincronização dentro do mesmo repositório;
- o commit feito pelo `GITHUB_TOKEN` não deve ser usado para encadear outro
  workflow ou outro build de Pages.

Habilitar Actions é uma decisão administrativa externa, não um ajuste de código.
O desenvolvimento local da 0.5 pode começar sem ela; a sincronização efetiva do
perfil não.

## Gate de saída da 0.5

A 0.5 só termina quando:

1. relógio, RNG e CSR forem portados com vetores exatos;
2. o campo 0.4 e seus observáveis passarem por replay e convergência cruzados;
3. a ABI publicar snapshots compactos e versionados;
4. o Wasm rodar no Worker em navegador real, incluindo reset e descarte;
5. memória, cópias, latência e tamanho do bundle estiverem dentro do orçamento;
6. o modo sombra não revelar divergência fora dos envelopes registrados;
7. Rust/Wasm se tornar padrão e as equações TypeScript duplicadas forem removidas.

O próximo trabalho autorizado pelo roadmap é, portanto, **0.5-c: paridade de
campo e observáveis**. O corte 0.5-c1 já portou relógio, RNG endereçado e CSR
canônico, usando um único artefato de vetores em Rust e TypeScript, antes de
acrescentar nova fisiologia.
