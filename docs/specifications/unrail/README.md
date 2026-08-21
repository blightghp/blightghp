# Programa arquitetural Unrail Motor

**Estado:** direção arquitetural adotada com condicionantes em 21 de agosto de 2026

**Implementação:** nenhuma; `engine/` ainda não existe

**Governança:** subordinada ao [roadmap canônico](../../planning/ROADMAP.md)

O Unrail Motor é a direção de longo prazo para uma segunda pilha nativa de
simulação e apresentação em Rust. A ciência permanece exclusivamente em
`brain-engine`; a aplicação web promovida continua sendo a baseline pública.

Esta publicação aceita as fronteiras e os princípios do programa, não congela
84 pacotes nem autoriza execução paralela. Cada crate só nasce quando um corte
promovido comprovar isolamento de risco, ownership, compilação ou reúso.

## Ordem de leitura

| # | Documento | Finalidade |
| :-- | :-- | :-- |
| 1 | [Léxico e transparência](GLOSSARY.md) | vocabulário, atribuição e limites de discurso |
| 2 | [Arquitetura](ARCHITECTURE.md) | fronteiras, sete anéis, determinismo, `unsafe` e layout futuro |
| 3 | [Catálogo de capacidades](CAPABILITY_CATALOG.md) | mapa-alvo provisório, sem scaffolding antecipado |
| 4 | [Política de dependências](DEPENDENCY_POLICY.md) | seleção, licença, versão, risco e retirada |
| 5 | [Revisão de referências](../../references/unrail/REFERENCE_TEARDOWN.md) | comparação de problemas e trade-offs, com atribuição |
| 6 | [Plano candidato UM0](../../planning/PLAN_UNRAIL_UM0.md) | fatia nativa a ser saneada no gate de entrada |
| 7 | [Horizontes Unrail](../../planning/backlog/UNRAIL_HORIZONS.md) | backlog U1–U9 sem datas nem autoridade de execução |

## Decisão de integração

| Questão | Decisão vigente |
| :-- | :-- |
| código atual | `crates/`, `src/` e `src-tauri/` permanecem intactos |
| workspace futuro | `engine/` separado e excluído do workspace Cargo raiz |
| primeira prova | runner headless com `SimulationConfig`, entradas e cinco hashes; GPU vem depois |
| dependências | nenhuma selecionada nesta etapa; pacote, versão, SPDX e advisory gate são bloqueantes |
| segurança | `unsafe` por localização/linha e justificativa `SAFETY`; criptografia e codecs não serão reinventados sem threat model |
| desempenho | todo pass e asset entra com ambiente, warm-up, CPU/GPU, resolução e teto medidos |
| visualidade | referência fotográfica/simulação orienta material, luz e escala, mas nunca vira evidência biológica |
| execução | WIP global 1; somente o roadmap canônico abre cortes |

## O que foi rejeitado nesta adoção

- um segundo roadmap, versionamento ou fila de gates soberanos;
- verificador de CI dependente de vocabulário local não versionado;
- promessa de determinismo bit a bit entre plataformas sem matriz de prova;
- criação antecipada de dezenas de crates vazios;
- ocultação de dependências, licenças, advisories ou referências públicas;
- ABI dinâmica baseada apenas em “mesma toolchain”.

A análise completa e as correções aplicadas estão na
[revisão arquitetural](../../reviews/UNRAIL_ARCHITECTURE_REVIEW.md). O próximo
corte executável do projeto continua descrito em
[NEXT_STAGE_R10_E](../../planning/NEXT_STAGE_R10_E.md).
