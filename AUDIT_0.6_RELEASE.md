# Evidência de consolidação · BRAIN PRO [v. 0.6.0]

Data: 2026-07-26.

## Identidade e proveniência

- título visível: `BRAIN PRO [v. 0.6.0]`;
- pacotes npm, workspace Cargo e Tauri: `0.6.0`;
- pacote desktop: `brain-pro`;
- 2025 é identificado como início do percurso pessoal de estudo;
- o histórico Git é identificado a partir de 2026-07-20;
- Kandel é projeto de leitura, não fonte automática de calibração;
- busca em arquivos versionados e metadados locais não encontra ferramentas de
  autoria ou nomes de ambientes de desenvolvimento.

## Motor e protocolo

- `brain-engine` é a fonte de verdade matemática;
- ABI Wasm/Worker usa schema 4;
- replay sombra: três marcos, hashes exatos, divergência máxima `0`;
- circuito córtico-talâmico possui hash separado;
- Worker limita topologia e avanço por comando;
- fallback diagnóstico não executa equações alternativas.

## Apresentação

- Visão Geral e Lâminas leem o mesmo snapshot;
- L1–L6, relé e TRN aparecem na coluna explodida;
- LODs possuem 17, 21 e 23 draw calls;
- abas passam por teclado e movimento reduzido;
- teste Chromium ativa Lâminas e confirma métricas finitas.

## Artefatos do perfil

| Artefato | Tamanho | Evidência |
| :-- | --: | :-- |
| `assets/brain.gif` | 2.661.714 bytes | GIF89a; 36 frames gerais + 24 laminares |
| `src/wasm/brain_wasm_bg.wasm` | 169.932 bytes | módulo comprometido e exercitado no navegador |
| `assets/activity_flow.svg` | gerado sob demanda | conteúdo estrangeiro removido; padrões ativos rejeitados |

SHA-256 do GIF:

```text
067f2b7054bde52277ee8e6acc6fefdc1197df9cc292b770e832ca2c8f42e8b0
```

## Gates executados

- `cargo test --workspace`;
- `cargo clippy --workspace --all-targets -- -D warnings`;
- `cargo check -p brain-wasm --target wasm32-unknown-unknown`;
- `npm run typecheck`;
- `npm run check:shadow-replay`;
- Vitest: 9 arquivos, 32 testes;
- `npm run build`;
- `npm run test:wasm-browser`;
- `npm audit --omit=dev`: 0 vulnerabilidades conhecidas;
- validação de assinatura/tamanho do GIF;
- auditoria de Actions fixadas por SHA;
- auditoria de resíduos de autoria.

Resultado: **consolidação aprovada**. Falta apenas o commit de fechamento, a
publicação em `main` e a confirmação dos workflows remotos.
