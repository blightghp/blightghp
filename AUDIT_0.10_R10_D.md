# Auditoria 0.10 · R10-D · superfície procedural

**Data:** 21 de agosto de 2026

**Commit técnico medido:** `d7ddff8`

**Branch de trabalho:** `blightghp/r10-d-superficie-procedural`
**Resultado:** implementada e validada no envelope declarado

## Resultado

R10-D substitui quatro `ConvexGeometry` por superfícies indexadas determinísticas
derivadas da topologia existente. Não muda Rust, Worker, ABI ou os cinco domínios
de hash. A única nova identidade persistida é o hash de apresentação
`7dfdd64207190121`.

| Contrato | Evidência | Resultado |
| :-- | :-- | :-- |
| ARC-021 / GFX-082 | seed, stream regional, algoritmo, índices, atributos quantizados e hash FNV-1a 64 bits | aceito; duas inicializações produziram o mesmo hash |
| GFX-083 | `aoFactor`, `curvature`, `thickness` em oito geometrias | assados uma vez e incluídos no hash |
| AST-035 | catálogo 1.2.0, quatro entradas regionais, fonte procedural | nenhuma estrutura de sulco/giro/área foi nomeada |
| QA-113 | unitários, navegador, LOD, tempo, fallback, corte e hashes | aceito |

## Implementação e rollback

`src/render/procedural-surface.ts` produz uma icosfera indexada por região,
ajusta a macroforma à nuvem de pontos, aplica simplex 3D com domain warp e três
oitavas e achata a face medial. O cerebelo usa bandas quase paralelas. Os LODs
`high`/`low` são construídos na inicialização; o perfil troca apenas a geometria
da mesma `presentationGeometryFamily`, sem reconstrução por frame.

Qualquer input inválido, excesso de 4.096 pontos, coordenada fora do envelope,
LOD desconhecido, estouro de triângulos ou tempo descarta o lote inteiro. O
`BrainRenderLayers` então recria as quatro cascas convexas anteriores, com
atributos neutros compatíveis. Esse é o rollback executável.

## Desempenho físico

Artefato: `artifacts/procedural-surface/procedural-surface.json`.

| Métrica | Medido | Teto |
| :-- | --: | --: |
| construção + baking | 77,9 ms | 120 ms |
| triângulos `high` | 5.780 | 52.000 |
| triângulos `low` | 1.500 | 14.000 |
| geometria `high` / `low` | 196.968 / 51.448 bytes | orçamento por vista 24/32 MiB |
| `baseline` overview p95 | 5,2 ms | 33,4 ms |
| `cinema` overview p95 | 6,9 ms | 50 ms |
| draws `baseline` / `cinema` | 28 / 59 | 54 / 72 |

A medição usou Intel UHD/ANGLE Direct3D11 declarada como GPU física, 24 amostras
por perfil. `baseline` selecionou `low`; `cinema`, `high`. A auditoria verificou
zero `semanticGeometryChanges` e zero CPU adicional da superfície por frame.

## Determinismo, corte e cobertura

- oito hashes regionais e um hash agregado de 64 bits;
- repetição em uma segunda página/nova inicialização;
- cinco hashes científicos iguais antes/depois de LOD, câmera, material e corte;
- corte coronal com sonda disponível, unidade `normalized field activity`, 98
  amostras na execução aceita;
- 12 PNGs com cobertura de pixel validada: LOD baixo, quatro ângulos altos, seis
  vistas e corte coronal.

A análise das imagens e das referências públicas está em
[`docs/VISUAL_REVIEW_R10_D.md`](docs/VISUAL_REVIEW_R10_D.md). O ganho é de
macroforma; tecido, luz, cor e formas celulares ainda são rudimentares e ficam
sob responsabilidade de R10-E ou cortes posteriores.

## Segurança e supply chain

- parser não foi criado; nenhum asset, URL, arquivo ou dependência de runtime foi
  acrescentado;
- validação rejeita seed não `u32`, pontos não finitos, magnitude acima de 16,
  menos de 4/mais de 4.096 pontos e orçamento inválido;
- `npm audit --audit-level=high`: 0 vulnerabilidades;
- RustSec `cargo-audit 0.22.2`: 0 vulnerabilidades e 17 avisos permitidos. O
  conjunto inclui bindings GTK3 transitivos não mantidos, crates `unic-*`,
  `proc-macro-error` e o aviso de soundness `RUSTSEC-2024-0429` em `glib 0.18.5`;
  nenhuma dessas crates foi introduzida por R10-D.

## Gates executados

- Vitest: 28 arquivos, 144 testes;
- Cargo: 83 testes;
- `cargo clippy --workspace --all-targets -- -D warnings`;
- TypeScript sem emissão e build Vite de produção;
- auditoria/validador R10-D em GPU física;
- auditorias npm e RustSec.

**Veredito:** GFX-082/083, AST-035 e QA-113 estão fechados. R10-E é a próxima
etapa canônica. R10-D não autoriza alegação de atlas, sulcos nomeados,
fotorrealismo ou validade clínica.
