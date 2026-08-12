# Auditoria R08-P2 · ABI v6 executável

**Data:** 12 de agosto de 2026

**Produto:** 0.8.0

**Implementação auditada:** `eaaeb6e8d461ebda62658da09f0d55517cb55c45`

**Veredito:** R08-P2 concluída; a promoção 0.8 permanece pendente de P3 e P4

## Escopo e decisão

Esta auditoria verifica a fronteira Rust/Wasm/Worker/TypeScript já implementada.
Ela não adiciona equação, estado científico ou significado ao snapshot. O
layout de buffers foi centralizado para que transferência, medição de bytes e
auditoria consumam a mesma ordem canônica.

## Resultado executável

| Gate | Resultado | Evidência |
| :-- | :-- | :-- |
| protocolo/ABI/snapshot | `6` nas três fronteiras observadas | `runtime-audit.json` |
| transferência | 34 buffers nomeados e distintos | teste Vitest + navegador |
| hashes | rede, corticotalâmico, célula e química válidos | relatório schema 2 |
| replay químico | hashes exatos depois de `reset` | lifecycle no Worker real |
| descarte | avanço após `dispose` retorna fault explícito | lifecycle no Worker real |
| reinicialização | replay volta aos quatro hashes exatos | lifecycle no Worker real |
| apresentação | cinco abas; Sinapse publica mol/m³ e ocupação | DOM + captura |
| evidência visual | 11 PNGs desktop/mobile/monocromáticos | `artifacts/visual-audit/` |
| supply chain npm | nenhuma vulnerabilidade de produção | `npm audit --omit=dev` |

O artefato versionado observou 73.501 bytes no snapshot, 69 amostras, latência
Worker p95 de 1.200,0 ms, frame CPU p95 de 1.084,6 ms, 48 draw calls e 145.778
triângulos. Esses números descrevem Chromium headless sobre SwiftShader no host
registrado; não são meta de desempenho nem baseline de GPU física.

## Comandos executados

```text
cargo fmt --all -- --check
cargo test --workspace
cargo clippy --workspace --all-targets -- -D warnings
cargo check -p brain-wasm --target wasm32-unknown-unknown
npm run typecheck
npx vitest run
npm run build
npm run check:shadow-replay
npm run test:wasm-browser
BRAIN_AUDIT_DIR=artifacts/visual-audit npm run audit:runtime
npm run verify:runtime-audit
npm audit --omit=dev
```

Todos os comandos passaram na revisão. O CI repete o conjunto aplicável e
também verifica que os bindings Wasm versionados coincidem com a geração atual.

## Revisão visual

Foram inspecionadas a aba Sinapse colorida, sua versão monocromática e a captura
móvel. Conteúdo, unidades, seleção de aba e limites da viewport estão legíveis.
O modo monocromático desta fase ainda usa filtro e declarações estruturais; ele
não comprova sozinho que toda distinção semântica sobrevive sem cor.

## Limites e próximo gate

- o ambiente registrado é SwiftShader, não GPU física;
- invertibilidade atual cobre codificador/decodificador puro, não pixel
  renderizado de estado conhecido;
- redundância visual possui formas e rótulos declarados, mas sua prova
  automatizada ainda é incompleta;
- P2 não promove a versão inteira.

Esses limites são o escopo explícito de R08-P3. Até P3 e P4 fecharem, a frase
correta continua sendo: **0.8 implementada; promoção pendente**.
