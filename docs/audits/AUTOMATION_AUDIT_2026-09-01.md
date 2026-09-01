# Auditoria de automação — 2026-09-01

## Escopo e evidência

Foram inspecionados workflows, scripts chamados por Actions, lockfiles, dois
workspaces Cargo, configurações e runs reais do repositório
`blightghp/blightghp`. O estado remoto foi lido pela API do GitHub em 2026-09-01.
Após a análise local e o primeiro push, os settings de segurança e a exigência
de SHA foram habilitados explicitamente; em seguida foi aplicado o ruleset de
`main` descrito abaixo.

Comandos principais: `git fetch --prune`, `gh run list`, `gh run view --log-failed`,
APIs de Actions/Pages/branch protection/security, `npm audit`, `cargo audit`,
`cargo fmt`, `cargo test` e `cargo clippy` em ambos os workspaces.

## Achados e tratamento

| Gravidade | Achado comprovado | Tratamento neste corte |
| :-- | :-- | :-- |
| alta | `update-graph.yml` falhava repetidamente com HTTP 402 do agregador externo desde 25/08 | substituído por consulta autenticada à API GraphQL do GitHub e renderer SVG local, validado e autocontido |
| alta | PROMETHEUS não existia no CI; `fmt --check` e `clippy -D warnings` falhavam localmente | dívida de formato/código corrigida e matrix Linux/Windows adicionada |
| alta | Dependabot alerts/security updates estavam desativados e não havia `dependabot.yml` | cobertura versionada criada para npm, dois Cargo e Actions; alerts e security updates habilitados após o push |
| média | os dois bots escreviam em `main` em grupos de concorrência distintos | lock compartilhado sem cancelamento e rebase antes do push |
| média | jobs de escrita mantinham credencial no checkout durante instalação/build/parsing | checkout sem persistência e token exposto somente no passo final |
| média | não havia auditoria RustSec nem npm completa agendada | workflow semanal/read-only adicionado; nenhuma vulnerabilidade ativa foi encontrada localmente |
| média | toolchain raiz seguia `stable` enquanto PROMETHEUS fixava 1.97.1 | ambos fixados em Rust 1.97.1 |
| média | não havia contrato portátil nem agentes especializados | `AGENTS.md`, instrução Copilot, dois perfis com ferramentas limitadas e CODEOWNERS adicionados |
| baixa | alguns jobs não tinham timeout explícito | timeouts adicionados e política automatizada criada |

## Estado remoto observado

- ruleset ativo `main-protection` aplicado a `refs/heads/main`;
- Actions habilitadas por allowlist; todas as Actions usadas estavam fixadas em
  SHAs existentes e `sha_pinning_required` está habilitado;
- permissão padrão de workflow em leitura e sem aprovação de PR;
- Pages por workflow, HTTPS obrigatório e ambiente restrito a `main`;
- secret scanning e push protection habilitados;
- Dependabot alerts e security updates habilitados (com automated security fixes
  ativos); code scanning continua sem análise, fora do escopo deste corte.

O ruleset exige PR, uma aprovação, revisão de CODEOWNERS, resolução de threads,
checks de CI estritos, e bloqueia deleção/force-push. O único bypass é a
integração oficial GitHub Actions (`actor_id=15368`), usado pelos dois writers;
isso preserva a escrita direta serializada sem abrir bypass para usuários.

## Risco residual aceito

O perfil ainda usa commits diretos do `github-actions[bot]` em `main`, por meio do
bypass restrito do ruleset. A superfície foi reduzida por token tardio, `git add`
limitado e serialização. `cargo audit` também
reporta avisos permitidos de crates não mantidos/unsound transitivos (17 na raiz,
1 em `engine/`) sem vulnerabilidade ativa; atualizações futuras devem reduzir
essa dívida sem ignorá-la globalmente.
