# Auditoria 0.9 · R09-F · materialidade, películas e planos de corte

**Data:** 13 de agosto de 2026

**Estado:** concluído e validado no envelope local Chromium/SwiftShader

**IDs:** GFX-060..075, AST-020, UI-024, PERF-010, QA-101

**ABI científica:** v8, inalterada; 37 buffers e cinco hashes independentes

## Veredito

R09-F está concluído no envelope declarado. A implementação acrescenta somente
estado de apresentação TypeScript/Three.js. Nenhum comando Worker, `dt`,
parâmetro, topologia, equação, buffer, fixture ou hash Rust/Wasm mudou.

O perfil `realistic-illustrative` substitui 25 materiais `matter` elegíveis
sobre o mesmo scene graph. Um `RoomEnvironment` convertido por PMREM fornece a
iluminação baseada em imagem; três normal maps determinísticos de 256² são
fabricados por canvas e compartilhados. Emissão mantém materiais aditivos e
`depthWrite: false`; linhas, pontos, labels e overlays permanecem esquemáticos.
UUIDs geométricos e bindings semânticos não mudam.
Malhas sem UV recebem coordenadas esféricas de apresentação enquanto o manager
está ativo; o atributo é removido no dispose e nunca altera posição, índice ou
UUID da geometria.

O sistema de corte mantém coronal, sagital, axial, oblíquo e laje, com opt-in
por layer, exclusão por objeto, tampa stencil e sonda limitada ao campo
macroscópico publicado. O depth-mask do bloom replica os mesmos
`clippingPlanes`, `clipIntersection` e depth contract do passe base, impedindo
vazamento de emissão pela face cortada.

## Estado dos entregáveis

| Entregável | IDs | Estado e evidência |
| :-- | :-- | :-- |
| perfil PBR por superfície | GFX-069..073 | 25 `MeshPhysicalMaterial`; manifesto completo das seis vistas |
| reflection/refraction environment | GFX-071, GFX-075 | `RoomEnvironment` + PMREM procedural; ativo só no perfil realista |
| normal maps procedurais | GFX-071 | cortical, membrane e vesicle; seeds fixos; cache/dispose testados |
| fallback atômico | GFX-074 | criação parcial, alto contraste, contexto e erro de shader retornam a `schematic` |
| corte e laje | GFX-060..068, AST-020 | quatro orientações, 1/2 planos, tampa stencil e limite de 18 draws |
| sonda da face | GFX-068 | somente `field.waveActivity`, unidade e interpolação publicadas |
| UI e acessibilidade | UI-024 | mm orientativos, slab/oblíquo, ARIA sliders/live region, atalhos/touch |
| invariância/cleanup | QA-101 | cinco hashes idênticos, dispose explícito e 110 testes Vitest |

## Parâmetros PBR aplicados

| Superfície | Roughness | Transmission | Thickness | Clearcoat | Clearcoat roughness | Sheen | Sheen roughness | Sheen color | IOR | Normal map / escala |
| :-- | --: | --: | --: | --: | --: | --: | --: | :-- | --: | :-- |
| membrane | 0,32 | 0,22 | 0,06 | 0,28 | 0,35 | 0,18 | 0,75 | `#e8d4c0` | 1,40 | membrane 0,15; vesicle 0,15 no reservatório |
| tissue | 0,52 | 0,10 | 0,12 | 0,12 | 0,55 | 0,25 | 0,85 | `#d4a080` | 1,38 | cortical 0,30 |
| substrate | 0,72 | 0 | 0 | 0,06 | 0,85 | 0 | 0 | `#000000` | 1,50 | nenhum |

Todos preservam `metalness: 0`, cor/opacidade dinâmica, vertex colors quando a
geometria os possui e o contrato de blending/depth/stencil/clipping/tone
mapping do material original. Sombras permanecem desativadas.

## Orçamento GPU medido

Ambiente: Chromium headless, ANGLE/Vulkan, SwiftShader Device (Subzero), viewport
1440×960. Esta é evidência funcional determinística, não baseline de GPU física.
Os números incluem os dois passes do `SelectiveBloomPipeline`; portanto são
comparáveis somente dentro desta auditoria.

| Vista | Draws schematic | Draws realistic | Δ material | Triângulos realistic | Geometrias | Texturas |
| :-- | --: | --: | --: | --: | --: | --: |
| Visão Geral | 48 | 56 | +8 | 147.542 | 77 | 20 |
| Lâminas | 92 | 98 | +6 | 13.630 | 68 | 20 |
| Célula | 22 | 22 | 0 | 8.558 | 22 | 20 |
| Neurônio | 32 | 32 | 0 | 4.662 | 77 | 20 |
| Eletricidade | 34 | 34 | 0 | 2.386 | 32 | 20 |
| Sinapse | 36 | 36 | 0 | 32.774 | 88 | 21 |

O delta +8/+6 decorre dos materiais transparentes `DoubleSide` que Three.js
renderiza em dois lados; não há geometria semântica nova. O perfil cria três
normal maps RGBA 256² com mipmaps, estimados em 1.048.576 bytes no total. O
PMREM auditado possui imagem interna 768×1024 HalfFloat, estimada em 6.291.456
bytes; o total de texturas próprias estimado é 7.340.032 bytes. Um corte simples
com quatro cap sources adiciona 9 draws; a laje permanece limitada a 18.

## Capturas comparativas

As 18 capturas e o relatório estruturado estão em
[`artifacts/material-audit`](artifacts/material-audit/material-audit.json).
O diff schematic→realistic alterou 27,15% dos pixels da captura canônica.

| Cenário | Evidência |
| :-- | :-- |
| schematic | [`01-schematic.png`](artifacts/material-audit/01-schematic.png) |
| realistic-illustrative | [`02-realistic-illustrative.png`](artifacts/material-audit/02-realistic-illustrative.png) |
| realistic + corte coronal | [`03-realistic-coronal-clipping.png`](artifacts/material-audit/03-realistic-coronal-clipping.png) |
| realistic + corte + raio-X | [`04-realistic-coronal-xray.png`](artifacts/material-audit/04-realistic-coronal-xray.png) |
| realistic + corte + opacidade 50% | [`05-realistic-coronal-opacity-50.png`](artifacts/material-audit/05-realistic-coronal-opacity-50.png) |
| realistic + corte + monocromia | [`06-realistic-coronal-monochrome.png`](artifacts/material-audit/06-realistic-coronal-monochrome.png) |

Também há pares schematic/realistic para Visão Geral, Lâminas, Célula,
Neurônio, Eletricidade e Sinapse. A inspeção visual confirmou reflexão,
transmissão, relevo procedural, corte/tampa, raio-X e redundância monocromática.

## Hash invariância comprovada

Com o relógio congelado, a auditoria aplicou perfil, corte, raio-X, opacidade e
monocromia e comparou os cinco domínios após cada operação:

| Domínio | Hash antes e depois |
| :-- | :-- |
| rede (`stateHash`) | `b342793f3d23c6ae` |
| córtico-talâmico | `28cb2c021f56dbf7` |
| patch celular | `cff663ed3fc20880` |
| química | `d6f6b8dd06975c24` |
| eventos celulares | `602d9181b8d246dc` |

O relatório marca `hashInvariance.invariant = true` e
`semanticGeometryChanges = 0`.

## Dispose e fallback

- cada `MeshPhysicalMaterial` é descartado exatamente uma vez;
- o cache descarta os três `CanvasTexture` e recusa uso após dispose;
- o PMREM gerado, `RoomEnvironment` intermediário e `PMREMGenerator` possuem
  owner/cleanup explícitos;
- materiais stencil e geometrias de cap são descartados sem tocar a geometria
  fonte compartilhada;
- render targets dos dois composers preservam depth/stencil e são descartados;
- `PresentationMaterialEffects.afterRender()` restaura opacidade,
  transparência e `depthWrite` exatamente;
- falha parcial de material, shader, contexto ou alto contraste restaura a
  vista inteira ao perfil esquemático.

## Comandos executados

```text
npm run typecheck
npm run test -- --reporter=dot
npm run build
npm run audit:material
```

Resultado desta revisão: TypeScript estrito aprovado; 23 arquivos/111 testes
Vitest aprovados; build Vite aprovado; auditoria de material aprovada com 18
capturas, 25 objetos elegíveis e zero erro de shader/página relevante.

## Limites e rollback

- A aparência é realista-ilustrativa, não anatômica, histológica ou clínica.
- “mm” na UI é somente escala orientativa: 1 unidade procedural = 40 mm. A nota
  visível impede tratar a conversão como calibração anatômica.
- O acabamento não implementa SSS físico; sheen + transmission + clearcoat são
  aproximações perceptuais WebGL.
- O orçamento é do backend/viewport registrados; GPU física exige baseline
  separado.
- Para rollback, `setClipping({ enabled: false })` remove planos/tampas e mantém
  opacidade/isolamento. `setMaterialProfile("schematic")` remove PMREM/luzes do
  uso ativo. Falha WebGL faz o rollback automaticamente sem tocar no Worker.
