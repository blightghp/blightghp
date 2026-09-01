# Contexto obrigatório do repositório

Leia e siga `AGENTS.md` antes de propor ou alterar arquivos. O projeto possui
dois workspaces Cargo independentes: a raiz é o BRAIN PRO científico/Web/Tauri;
`engine/` é o PROMETHEUS nativo. Nunca valide apenas um deles quando a mudança
atravessar essa fronteira.

Trate `docs/specifications/` e `docs/quality/VALIDATION.md` como contratos; use
`docs/legacy/` somente como histórico. Preserve determinismo, unidades, hashes,
schemas, acessibilidade, proveniência e o caráter ilustrativo/não clínico da
visualização. Não edite bindings Wasm ou artefatos do perfil manualmente.

Em workflows, exija SHA completo para Actions, comentário de versão, permissão
mínima, timeout, concorrência explícita e `persist-credentials: false`. Não
adicione secrets, serviços externos ou permissões de escrita sem justificar o
fluxo e atualizar `docs/quality/AUTOMATION.md`.
