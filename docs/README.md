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
- [Plano candidato PROMETHEUS (UM0)](planning/PLAN_UNRAIL_UM0.md) — primeira fatia nativa implementada na Fase Φ-0 (Genesis).

O [backlog de horizontes Unrail](planning/backlog/UNRAIL_HORIZONS.md) e [documentações teóricas](specifications/prometheus/README.md) guiam o desenvolvimento nativo ativo.

## Especificações vigentes

- [Arquitetura](specifications/ARCHITECTURE.md)
- [Motor Científico](specifications/ENGINE_SPEC.md)
- [Frontend (Web)](specifications/FRONTEND_SPEC.md)
- [Gráficos e VFX](specifications/GRAPHICS_SPEC.md)
- [Modelo científico](specifications/MODEL_SPEC.md)
- [Projeto PROMETHEUS (Motor Nativo)](specifications/prometheus/README.md) — especificações de Fases Φ-0 a Φ-5 (arquitetura wgpu L0-L4 importada do laboratório).

Os critérios de teste e promoção ficam no
[guia de validação](quality/VALIDATION.md). As fontes científicas estão em
[referências](references/REFERENCES.md).

A operação de workflows, bots, agentes e Dependabot é definida na
[política de automação](quality/AUTOMATION.md). A fotografia inicial e os riscos
residuais estão na
[auditoria de 2026-09-01](audits/AUTOMATION_AUDIT_2026-09-01.md).

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

A [revisão arquitetural Unrail](reviews/UNRAIL_ARCHITECTURE_REVIEW.md) e as
[fontes técnicas primárias](references/unrail/PRIMARY_REFERENCES.md) sustentam
as decisões de Cargo/Rust/GPU que agora formam a fundação do PROMETHEUS.

## Histórico

Propostas substituídas são preservadas em [legacy](legacy/README.md) apenas para
rastreabilidade. Elas não substituem o roadmap, as especificações ou a validação
vigentes.
