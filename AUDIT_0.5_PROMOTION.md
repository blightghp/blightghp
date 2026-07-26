# Auditoria de promoção 0.5 · Rust/Wasm

## Veredito

Os cortes 0.5-c3, 0.5-d, 0.5-e e 0.5-f estão aprovados. Rust/Wasm é o motor
padrão no navegador, roda dentro de um Web Worker e publica o protocolo v3 por
buffers transferíveis. O renderer não integra equações e o antigo motor
TypeScript foi removido.

## Replay sombra

Antes da remoção do oráculo TypeScript, o cenário curto comum foi executado nos
dois motores nos ticks 30, 75 e 120. Em todos:

- a divergência absoluta máxima foi `0`;
- os hashes FNV-1a de 64 bits foram, respectivamente,
  `1650c853c33b0f62`, `14b74aa951d61769` e `abee641df0a43d0c`;
- o envelope exigia divergência máxima de `1e-7` e hash exato;
- no ensaio curto registrado, Wasm/TypeScript custou aproximadamente `0,2023`.

Essa razão não é apresentada como benchmark de capacidade: o cenário é pequeno
e mede também a fronteira. Os dados brutos e o SHA-256 do fixture estão em
`AUDIT_0.5_SHADOW.json`. `npm run check:shadow-replay` repete o lado Wasm contra
o oráculo congelado; Cargo repete o mesmo caso no motor nativo.

## Worker e protocolo

- `brain-wasm` recebe a topologia em arrays tipados, sem JSON na ABI;
- o módulo é inicializado dentro de `simulation.worker.ts`;
- comandos são serializados por uma fila Promise, preservando ordem;
- cada snapshot transfere onze `ArrayBuffer`s por `postMessage`, liberando o
  thread de apresentação de cópias e de cálculo científico;
- Puppeteer abre a aplicação, espera um snapshot real e exige runtime
  `rust-wasm`, schema v3, estado não degradado e hash válido.

## Promoção e fallback

O antigo LIF/AMPA/GABA-A/STDP, campo E/I, RNG, CSR e observáveis TypeScript
foram removidos. O fallback temporário é intencionalmente diagnóstico: publica
arrays zerados, marca `degraded: true`, conserva a causa da falha e nunca
pretende substituir o modelo científico. Isso evita uma segunda fonte de
verdade silenciosa.

## Perfil vivo

`sync-brain-gif.yml` executa a validação completa, captura o mesmo simulador,
valida assinatura e teto de 5 MiB, atualiza `assets/brain.gif` e grava os doze
primeiros caracteres do SHA na URL do README. A atualização ocorre após o tempo
de runner e cache do GitHub; ela é automática, não instantânea.

## Gates obrigatórios

```text
npm run check
cargo fmt --all -- --check
cargo test --workspace
cargo clippy --workspace --all-targets -- -D warnings
cargo build -p brain-wasm --release --target wasm32-unknown-unknown
```

A CI também regenera a ABI com `wasm-bindgen-cli` 0.2.126 e compara texto e
binário com `src/wasm`, impedindo que o artefato comprometido se desalinhe da
crate.
