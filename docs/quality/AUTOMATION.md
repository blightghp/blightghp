# Automação, bots, agentes e dependências

Este documento é a política operacional do repositório. Ele separa validação,
publicação, escrita automatizada, atualização de dependências e assistência por
agentes para que uma automação não seja tratada como prova de outra.

## Topologia vigente

| Componente | Gatilho | Permissão efetiva | Responsabilidade |
| :-- | :-- | :-- | :-- |
| `ci.yml` | push, pull request, manual | `contents: read` | Web/Wasm/Tauri e PROMETHEUS em Linux e Windows |
| `deploy.yml` | push em `main`, manual | leitura; Pages e OIDC apenas no deploy | validar, empacotar e publicar `dist/` |
| `security.yml` | mudanças de lock/config, semanal, manual | `contents: read` | `npm audit` completo e RustSec nos dois lockfiles |
| `sync-brain-gif.yml` | mudanças Web/Wasm selecionadas, manual | escrita apenas no job | recompilar, capturar, verificar e versionar GIF/manifesto/bindings |
| `update-graph.yml` | push em `main`, diário, manual | escrita apenas no job | consultar GitHub GraphQL e versionar SVG autocontido |
| Dependabot | agenda semanal escalonada | pull requests | npm, Cargo raiz, Cargo `engine/` e GitHub Actions |

Os dois escritores compartilham `profile-writers-main` com
`cancel-in-progress: false`. O checkout não persiste credenciais; `GH_TOKEN` só
existe no passo final que faz `git pull --rebase` e `git push`. Instalação,
compilação, teste, captura e parsing de dados externos executam sem a credencial
de escrita no ambiente.

Commits feitos pelo `GITHUB_TOKEN` não disparam uma segunda cadeia de workflows.
Por isso cada bot valida integralmente o artefato antes do próprio commit e não
depende de um CI posterior para tornar a escrita segura.

## Política de workflows

1. Toda Action externa usa SHA completo imutável e comentário de versão.
2. Todo workflow declara `permissions`; escrita é exceção por job.
3. Todo job tem `timeout-minutes`; toda operação repetível tem `concurrency`.
4. `pull_request_target` e interpolação direta de payload de evento em shell são
   proibidos.
5. Checkouts usam `persist-credentials: false`. Um escritor autentica somente o
   passo final e nunca executa dependência de terceiros depois disso.
6. Novo writer precisa compartilhar ou justificar outro lock, limitar arquivos
   no `git add` e ser incluído em `scripts/verify_automation_policy.js`.

Execute `npm run verify:automation` para verificar essas invariantes e a
cobertura de Dependabot, agentes e toolchains.

## Dependabot e supply chain

As agendas são separadas para reduzir concorrência e facilitar diagnóstico:

- segunda: npm;
- terça: Cargo da raiz;
- quarta: Cargo de `engine/`;
- quinta: GitHub Actions e a auditoria semanal.

Minor e patch são agrupados por ecossistema; major permanece isolado para revisão
de migração. Pull requests de dependência precisam passar pelo CI completo do
domínio afetado. O job RustSec falha em vulnerabilidades; avisos de crate
descontinuado ou não mantido permanecem visíveis e devem ser reavaliados, não
silenciados globalmente.

O arquivo `dependabot.yml` habilita atualizações de versão quando chegar à branch
padrão. Alertas e atualizações automáticas de segurança são settings remotos
separados e estão habilitados no GitHub, assim como a proteção de push de secrets.

## Agentes

`AGENTS.md` fornece o contrato portátil. `.github/copilot-instructions.md` cobre
clientes que usam instrução específica do Copilot. Perfis em `.github/agents/`
têm escopo deliberadamente distinto:

- `workflow-guardian`: pode analisar e implementar automação, mas não muda
  settings remotos nem faz push sem autorização;
- `scientific-contract-reviewer`: revisão independente, sem ferramenta de edição.

Perfis não recebem secrets nem MCP externo próprio. Sua saída não substitui
testes, revisão humana, ruleset ou evidência versionada.

## Operação e recuperação

- Falha do gráfico: execute manualmente após confirmar acesso à API do GitHub. O
  último SVG válido permanece no repositório; não restaure o serviço agregador
  externo sem análise de disponibilidade e conteúdo.
- Conflito de writer: não force push. Reexecute depois de integrar `main`; o
  `git add` limitado impede commit acidental de outros arquivos.
- Falha de captura: preserve o GIF/manifesto anterior. Nunca faça commit parcial.
- Dependabot ruidoso: ajuste grupos ou limite de PRs; não desabilite auditorias.
- Action nova: fixe SHA, atualize a allowlist remota de Actions e valide a origem
  antes de fazer merge.

## Settings remotos verificados

Itens abaixo não são controlados por Git e precisam de auditoria periódica:

- permissões padrão de workflow em leitura e sem aprovação de PR;
- allowlist apenas das Actions pinadas realmente usadas;
- exigência de SHA completo na política de Actions (habilitada);
- Dependabot alerts, security updates e automated security fixes habilitados;
- secret scanning e push protection habilitados;
- Pages limitado à branch `main` pelo ambiente `github-pages`;
- ruleset `main-protection` ativo em `main`, exigindo PR/aprovação/CODEOWNERS,
  resolução de threads e os quatro checks CI; o único bypass é o usuário
  `github-actions[bot]` (`actor_id=41898282`), e os checks usam a integração
  GitHub Actions (`integration_id=15368`), compatível com os dois writers.

Referências operacionais: [Dependabot](https://docs.github.com/en/code-security/how-tos/secure-your-supply-chain/secure-your-dependencies/configure-version-updates),
[uso seguro de Actions](https://docs.github.com/en/actions/reference/security/secure-use),
[concorrência](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/control-workflow-concurrency) e
[custom agents](https://docs.github.com/en/copilot/reference/custom-agents-configuration).
