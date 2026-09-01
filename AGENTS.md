# Instruções para agentes

Estas regras valem para todo o repositório. Instruções mais próximas de um
arquivo podem especializá-las, mas não podem enfraquecer segurança, evidência ou
reprodutibilidade.

## Mapa e fontes de verdade

- O workspace Rust da raiz contém o motor científico (`crates/brain-engine`), a
  ABI Wasm (`crates/brain-wasm`) e o shell Tauri (`src-tauri`).
- `src/` contém a aplicação Web/Worker e `src/wasm/` contém bindings gerados e
  versionados. Não edite esses bindings manualmente; use `npm run build:wasm`.
- `engine/` é um workspace Cargo independente para o renderizador nativo
  PROMETHEUS. Execute Cargo com `--manifest-path engine/Cargo.toml` ou a partir
  desse diretório; não o confunda com `brain-engine`.
- As especificações vigentes ficam em `docs/specifications/`, o plano atual em
  `docs/planning/` e os critérios executáveis em `docs/quality/VALIDATION.md`.
  `docs/legacy/` é histórico, nunca fonte normativa.
- Fixtures e artefatos versionados são evidência. Só os regenere com o comando
  documentado e registre origem, ambiente e motivo.

## Invariantes de implementação

- Preserve determinismo, hashes, schemas, unidades e ordenação. Mudanças de ABI,
  snapshot ou fixture exigem teste de compatibilidade, atualização das
  especificações e migração explícita.
- Não transforme visualização ilustrativa em alegação anatômica, causal,
  diagnóstica ou clínica. Mantenha proveniência e limitações visíveis.
- Entradas externas precisam de schema, cota e rejeição atômica. Não introduza
  código remoto, telemetria implícita, segredo no cliente ou caminho de IPC mais
  amplo que o necessário.
- Evite `unsafe`; ambos os workspaces o proíbem. Não silencie Clippy sem explicar
  o invariante que torna a exceção segura.

## Automação e dependências

- Siga `docs/quality/AUTOMATION.md`. Actions externas devem ficar presas a SHA
  completo, com comentário da versão, permissões mínimas, timeout e checkout sem
  credencial persistida.
- Apenas os dois bots de perfil podem escrever em `main`; ambos compartilham o
  lock `profile-writers-main` e só recebem o token no passo final autenticado.
- Atualize manifesto e lockfile juntos. Dependências da raiz e de `engine/` são
  domínios separados e precisam dos respectivos testes.
- Não edite `assets/activity_flow.svg`, `assets/brain.gif`,
  `assets/brain-gif.json` nem o selo `?v=` do README à mão.

## Validação proporcional

- Mudança Web/documental: `npm run verify:automation`, `npm run verify:docs`,
  testes afetados e, antes de entregar, `npm run check` quando viável.
- Workspace Rust da raiz: `cargo fmt --all -- --check`,
  `cargo test --workspace` e `cargo clippy --workspace --all-targets -- -D warnings`.
- PROMETHEUS: os mesmos três gates dentro de `engine/`, incluindo
  `cargo test --workspace --all-targets`.
- Dependências: `npm audit` e `cargo audit` nos dois lockfiles. Avisos aceitos
  devem ser registrados; vulnerabilidades não podem ser ocultadas.

Preserve mudanças locais alheias, mantenha commits pequenos e coerentes e relate
comandos realmente executados. Não declare um gate aprovado com base em intenção.
