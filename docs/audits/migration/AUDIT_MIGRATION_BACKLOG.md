# Auditoria do backlog transversal da migração

Data de fechamento: 2026-08-02.

Estado: **concluído sem regressão do BRAIN PRO 0.6.0**.

## Resultado

| Frente | Implementação | Evidência contínua |
| :-- | :-- | :-- |
| entradas e replay | `DeterministicInputQueue<T>` limitada, ordenada por `(tick, sequence)`, integrada ao motor e exposta no Worker/Wasm | `input-queue-v1.json`, testes Rust e replay no Chromium |
| cadência e perfil | snapshots configuráveis em 60/30/15/10 Hz sem mudar `dt`; janela móvel de CPU, GPU, memória e latência | `performance-profile.test.ts` e `audit_runtime.js` |
| AMPA/GABA-A | constantes centralizadas e estudo contra a integral analítica da resposta exponencial | `synaptic_convergence.rs` exige erro decrescente e ordem observada maior que 0,90 |
| axônios laminares | seis recorrências L1–L6 e nove vias já declaradas usam curvas cúbicas e pulsos com fase própria | teste estrutural, LOD de cena 26/36/44 draw calls e captura laminar |
| visual e acessibilidade | três capturas em dois viewports, teclado roving, ausência de overflow móvel e contraste mínimo 4,5:1 | `npm run audit:runtime` e `../../../artifacts/visual-audit/runtime-audit.json` |

## Revisão de qualidade da 0.6

- A ABI permanece em `schemaVersion = 4`; foram acrescentados métodos, sem
  reinterpretar os treze buffers publicados.
- O comando interativo anterior continua aceito. O host agora o traduz para a
  mesma fila Rust usada por replays, com sequências canônicas 0 e 1.
- O hash da rede 0.5 e o hash córtico-talâmico continuam separados; o replay
  sombra conserva os três marcos exatos.
- A cadência reduz apenas a frequência de publicação. O passo fixo, o alvo de
  tick e as constantes AMPA/GABA-A não são alterados.
- `renderer.info` é acumulado por frame completo, incluindo os passes do
  compositor, para evitar relatar somente o último quad de pós-processamento.
- A coluna foi reenquadrada para impedir conflito visual entre L1 e as abas.

### Convergência temporal das condutâncias

A grandeza comparada é a área, em segundos, da resposta unitária até `8τ`. O
erro absoluto contra `τ(1 - exp(-T/τ))` foi:

| Receptor | `dt = 1 ms` | `0,5 ms` | `0,25 ms` | `0,125 ms` |
| :-- | --: | --: | --: | --: |
| AMPA (`τ = 5 ms`) | 5,1648e-4 | 2,5408e-4 | 1,2600e-4 | 6,2739e-5 |
| GABA-A (`τ = 10 ms`) | 5,0816e-4 | 2,5200e-4 | 1,2548e-4 | 6,2609e-5 |

Cada refinamento aproximadamente divide o erro por dois, compatível com a
quadratura de primeira ordem usada pelo instrumento de estudo.

## Limites

O perfil de CPU/GPU é operacional, não um benchmark universal. Tempo de frame e
latência dependem do navegador e do hardware; draw calls, triângulos, buffers,
heap e bytes de snapshot identificam o custo observado sem prometer uma taxa
fixa. Em renderizadores por software, os tempos não representam uma GPU física.

O estudo AMPA/GABA-A valida a convergência temporal da área de uma resposta
unitária com decaimento exponencial. Ele não calibra amplitudes, potenciais de
reversão, farmacologia ou correntes biológicas completas. O passo preservado de
`1/60 s` da rede 0.6 é mais grosso que `τ_AMPA` e `τ_GABAA`; portanto, os traços
atuais continuam classificados como proxies adimensionais estáveis, não como
cinéticas receptoras temporalmente resolvidas. Corrigir essa resolução pertence
a um preset 0.7 com novo replay, não a uma alteração silenciosa dos hashes 0.6.

As curvas axonais são uma leitura do contrato de projeções do modelo. Não são
tractografia, morfologia neuronal nem evidência anatômica.

## Gates

```text
cargo test --workspace
cargo clippy --workspace --all-targets -- -D warnings
cargo check -p brain-wasm --target wasm32-unknown-unknown
npm run check
```

O gate web falha se o Worker/Wasm não iniciar ou se o replay agendado não
atravessar a fronteira. `npm run audit:runtime` falha se a navegação por teclado divergir, se o contraste
medido cair abaixo de 4,5:1, se houver overflow móvel ou se faltar qualquer eixo
do perfil.
