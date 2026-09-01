# Auditoria de automação — 2026-09-01

## Escopo e evidência

Foram inspecionados workflows, scripts chamados por Actions, lockfiles, dois
workspaces Cargo, configurações e runs reais do repositório
`blightghp/blightghp`. O estado remoto foi lido pela API do GitHub em 2026-09-01;
nenhum setting remoto foi alterado durante esta auditoria.

Comandos principais: `git fetch --prune`, `gh run list`, `gh run view --log-failed`,
APIs de Actions/Pages/branch protection/security, `npm audit`, `cargo audit`,
`cargo fmt`, `cargo test` e `cargo clippy` em ambos os workspaces.

## Achados e tratamento

| Gravidade | Achado comprovado | Tratamento neste corte |
| :-- | :-- | :-- |
| alta | `update-graph.yml` falhava repetidamente com HTTP 402 do agregador externo desde 25/08 | substituído por consulta autenticada à API GraphQL do GitHub e renderer SVG local, validado e autocontido |
| alta | PROMETHEUS não existia no CI; `fmt --check` e `clippy -D warnings` falhavam localmente | dívida de formato/código corrigida e matrix Linux/Windows adicionada |
| alta | Dependabot alerts/security updates estavam desativados e não havia `dependabot.yml` | cobertura versionada criada para npm, dois Cargo e Actions; settings remotos continuam ação pós-merge |
| média | os dois bots escreviam em `main` em grupos de concorrência distintos | lock compartilhado sem cancelamento e rebase antes do push |
| média | jobs de escrita mantinham credencial no checkout durante instalação/build/parsing | checkout sem persistência e token exposto somente no passo final |
| média | não havia auditoria RustSec nem npm completa agendada | workflow semanal/read-only adicionado; nenhuma vulnerabilidade ativa foi encontrada localmente |
| média | toolchain raiz seguia `stable` enquanto PROMETHEUS fixava 1.97.1 | ambos fixados em Rust 1.97.1 |
| média | não havia contrato portátil nem agentes especializados | `AGENTS.md`, instrução Copilot, dois perfis com ferramentas limitadas e CODEOWNERS adicionados |
| baixa | alguns jobs não tinham timeout explícito | timeouts adicionados e política automatizada criada |

## Estado remoto observado

- `main` sem branch protection e sem ruleset;
- Actions habilitadas por allowlist; todas as Actions usadas estavam fixadas em
  SHAs existentes, mas `sha_pinning_required` estava desativado;
- permissão padrão de workflow em leitura e sem aprovação de PR;
- Pages por workflow, HTTPS obrigatório e ambiente restrito a `main`;
- secret scanning e push protection habilitados;
- Dependabot security updates desabilitado e code scanning sem análise.

Os settings não versionados devem ser reconciliados após o merge conforme
`docs/quality/AUTOMATION.md`. Proteger `main` imediatamente sem bypass compatível
quebraria os dois writers; a escolha deve ser ruleset com ator de automação
restrito ou migração para PR/GitHub App.

## Risco residual aceito

O perfil ainda usa commits diretos do `github-actions[bot]` em `main`. A
superfície foi reduzida por token tardio, `git add` limitado e serialização, mas
branch protection continua sendo controle remoto pendente. `cargo audit` também
reporta avisos permitidos de crates não mantidos/unsound transitivos (17 na raiz,
1 em `engine/`) sem vulnerabilidade ativa; atualizações futuras devem reduzir
essa dívida sem ignorá-la globalmente.
