# Auditoria 0.9 · R09-F · materialidade, películas e planos de corte

**Data:** 13 de agosto de 2026

**Estado:** implementado e validado no envelope local/CI declarado

**IDs:** GFX-001, GFX-060..075, AST-020, UI-024, PERF-010, QA-101

**ABI científica:** v8, inalterada; 37 buffers e cinco hashes independentes

## Veredito

R09-F está apto para integração. A implementação acrescenta apenas estado de
apresentação TypeScript/Three.js: nenhum comando, buffer, equação, passo,
fixture ou hash Rust/Wasm foi alterado.

O perfil `realistic-illustrative` troca materiais sobre o mesmo scene graph. O
manifesto aceita 25 objetos `matter` com proveniência, normal e limite local;
emissão, linhas, pontos, labels e overlays continuam esquemáticos. A auditoria
mediu zero mudança de UUID geométrico/binding e zero draw de objeto adicional
pela troca. Vinte e três objetos usam transmissão moderada, agrupada em um passe
de refração, com três luzes explicitamente `DECORATION`.

O sistema de corte implementa coronal, sagital, axial, oblíquo e laje. Clipping
é opt-in por `RenderLayer` e pode ser excluído por objeto. As tampas usam
incremento/decremento de stencil sobre cópias rasas que compartilham a geometria
original. O corte encefálico simples custa 9 draws adicionais; a laje tem teto
de 18. Alto contraste, perda de contexto ou falha material retornam
atomicamente ao perfil `schematic`. O rollback operacional desliga o clipping e
mantém opacidade/isolamento.

## Contrato da sonda

A face não inventa um volume. Somente a Visão Geral possui o mapeamento
posição→campo necessário e lê `field.waveActivity`, em `normalized field
activity`, por média dos vértices corticais publicados na faixa ±0,08 unidade
procedural da face. O valor usa interpolação linear declarada entre os dois
snapshots adjacentes. Lâminas, Célula, Neurônio, Eletricidade e Sinapse retornam
indisponibilidade explícita; química microscópica nunca é projetada no corte
encefálico.

## Elegibilidade e limites

| Vista | Objetos elegíveis | Objetos protegidos |
| :-- | --: | :-- |
| Visão Geral | 4 cascas procedurais | pontos, conexões e pulsos |
| Lâminas | 12 populações + relé + TRN | vias e pulsos |
| Célula | somata e contorno | dendritos, halos e seleção |
| Neurônio | soma | dendritos, axônio, correntes, nós e evento |
| Eletricidade | substrato | grid, nós, vias, barras, anéis e evento |
| Sinapse | botão, membrana e vesículas | fenda, nuvens, release/recapture e receptores |

Não há atlas, imagem, normal map, textura anatômica ou asset externo novo. A
materialidade é procedural e ilustrativa; não sustenta alegação clínica,
anatômica calibrada ou biológica adicional.

## Prova executável

| Gate | Resultado |
| :-- | :-- |
| tipos | `npm run typecheck` aprovado |
| renderer | 22 arquivos / 93 testes Vitest aprovados |
| navegador Wasm | ABI 8, 37 buffers, seis vistas, 25 PBR, 9 draws de corte e lifecycle aprovados |
| auditoria runtime | 107 amostras; captura `r09-f-realistic-coronal.png`; sonda com 98 vértices no frame auditado |
| hashes | rede, córtico-talâmico, célula, química e eventos idênticos antes/depois de material/corte/opacidade |
| fallback | alto contraste retorna `schematic` para todos os 25 objetos; teste unitário cobre perda de contexto |
| cleanup | materiais PBR, materiais stencil, planos de tampa, render targets, luzes e listeners possuem owner/dispose |
| GIF | gerador e manifesto schema 3 exigem película R09-F, corte coronal na Visão Geral e `externalAtlasAssets = 0` |

O perfil headless usa Chromium/SwiftShader e serve como prova funcional, não
como baseline de GPU física. Na execução desta auditoria, o frame CPU p95 e a
latência do Worker refletem o backend de software e não são promovidos como meta
de hardware. O orçamento determinístico de R09-F é estrutural: 0 draws extras
por troca material, 9 por plano simples e no máximo 18 por laje no catálogo
atual.

## Comandos executados

```text
npm run typecheck
npm run test -- --reporter=dot
npm run build
npm run test:wasm-browser
npm run audit:runtime
npm run check
cargo fmt --all -- --check
cargo clippy --workspace --all-targets -- -D warnings
cargo test --workspace
npm run generate:brain-gif
npm run stamp:brain-gif
npm run verify:brain-gif
```

## Critérios de aceite

- [x] quatro orientações e laje determinísticas;
- [x] clipping local opt-in e exclusão de overlay;
- [x] tampa stencil sem ownership indevido da geometria científica;
- [x] sonda limitada ao campo macroscópico publicado, com unidade e interpolação;
- [x] teclado, ranges touch e reset de câmera;
- [x] mesma geometria, IDs, bindings e eventos após a troca material;
- [x] fallback esquemático atômico e alto contraste;
- [x] `DECORATION` explícito para luzes, stencil e tampas;
- [x] zero atlas externo;
- [x] cinco hashes invariantes;
- [x] dispose e teto de draw calls testados;
- [x] README e GIF vinculados ao gerador/manifesto atualizado.

## Limites aceitos e rollback

- `MeshPhysicalMaterial` aproxima tecido/membrana; não implementa SSS físico nem
  calibração histológica.
- A unidade espacial do corte continua procedural, rotulada `u.c.`; não é mm.
- A tampa é válida para as malhas fechadas listadas no manifesto. Linhas,
  pontos e overlays são recortados quando opt-in, mas não recebem tampa.
- Em perda de performance, `setClipping({ enabled: false })` remove planos e
  passes auxiliares; opacidade/isolamento continuam disponíveis.
- Em falha WebGL/alto contraste, todos os materiais voltam a `schematic` em uma
  transação visual e a ciência segue no Worker sem alteração.
