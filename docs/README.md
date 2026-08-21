# Documentação do BRAIN PRO

Este diretório concentra os contratos, planos, evidências e referências do
projeto. A raiz permanece reservada ao README público, código de entrada e
arquivos de configuração da toolchain.

## Direção e planejamento

- [Roadmap canônico](planning/ROADMAP.md) — estado promovido, sequência de gates
  e próximos cortes.
- [Plano executável 0.10](planning/PLAN_0.10.md) — escopo, critérios e rollback
  de cada etapa atual.
- [Plano de assets realistas](planning/PLAN_0.10_ASSET_REALISM.md) — contrato
  específico para ingestão e proveniência de assets.
- [Diretivas da próxima etapa R10-E](planning/NEXT_STAGE_R10_E.md) — branch,
  implementação, referências visuais, auditorias e rollback.
- [Plano candidato UM0](planning/PLAN_UNRAIL_UM0.md) — primeira fatia nativa,
  bloqueada até o gate de entrada do roadmap.

O [backlog de horizontes Unrail](planning/backlog/UNRAIL_HORIZONS.md) preserva
hipóteses U1–U9, sem criar roadmap ou fila paralela.

## Especificações vigentes

- [Arquitetura](specifications/ARCHITECTURE.md)
- [Motor](specifications/ENGINE_SPEC.md)
- [Frontend](specifications/FRONTEND_SPEC.md)
- [Gráficos e VFX](specifications/GRAPHICS_SPEC.md)
- [Modelo científico](specifications/MODEL_SPEC.md)
- [Programa arquitetural Unrail](specifications/unrail/README.md) — direção
  nativa adotada com condicionantes; nenhuma implementação ainda.

Os critérios de teste e promoção ficam no
[guia de validação](quality/VALIDATION.md). As fontes científicas estão em
[referências](references/REFERENCES.md).

## Evidências

As auditorias são organizadas pelo ciclo em que foram produzidas:

- [0.4](audits/0.4/)
- [0.5](audits/0.5/)
- [0.6](audits/0.6/)
- [0.7](audits/0.7/)
- [0.8](audits/0.8/)
- [0.9](audits/0.9/)
- [0.10](audits/0.10/)
- [backlog de migração](audits/migration/AUDIT_MIGRATION_BACKLOG.md)

As comparações estéticas e revisões de captura ficam em [reviews](reviews/).
Artefatos produzidos pelos gates permanecem em `artifacts/`, separados da
documentação narrativa.

A [revisão arquitetural Unrail](reviews/UNRAIL_ARCHITECTURE_REVIEW.md) registra
as correções de anéis, dependências, `unsafe`, ABI, governança e estrutura. As
[fontes técnicas primárias](references/unrail/PRIMARY_REFERENCES.md) sustentam
as decisões de Cargo/Rust/GPU.

## Histórico

Propostas substituídas são preservadas em [legacy](legacy/README.md) apenas para
rastreabilidade. Elas não substituem o roadmap, as especificações ou a validação
vigentes.
