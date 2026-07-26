# Auditoria de promoção · 0.4 Superfície

Data do gate: 26 de julho de 2026.

## Decisão

**Aprovada para abrir o planejamento da 0.5 · Lâmina.**

A revisão inicial não aprovou o commit que declarava a 0.4 concluída: os atrasos
do campo eram apenas calculados, os buffers de histórico não participavam da
integração, o domínio incluía estruturas não corticais e os testes não cobriam
convergência, conservação da projeção ou dupla contagem visual. Esses bloqueios
foram corrigidos antes desta promoção.

## Evidência do gate

| Critério | Evidência |
| :-- | :-- |
| Domínio cortical explícito | `BrainData.corticalField`: vértices externos, projeção nó→vértice, adjacência CSR simétrica e comprimentos positivos |
| Atraso efetivo | histórico circular E/I lido por aresta em `PopulationField.step`; teste demonstra ausência antes e chegada depois do atraso |
| Acoplamento conservativo | cada spike cortical entra em exatamente um vértice; cerebelo e tronco são excluídos; somas de impulso são testadas |
| Invariantes | E/I finitos, não negativos e limitados; `waveActivity ∈ [0,1]`; passo variável e buffers incompatíveis são rejeitados |
| Convergência | cenário de propagação atrasada em `1/120 s` aproxima mais a referência `1/480 s` que `1/60 s` |
| Determinismo e reset | baseline fixo, execuções iguais, histórico limpo e reseed preservando o tamanho original da topologia |
| Renderer fiel | interpolação limitada a snapshots e composição por envelope máximo, sem somar campo e spikes |
| Aplicação integrada | inicialização WebGL/Worker, HUD, controles e foco regional verificados sem erros de console |
| Segurança/offline | dependências web externas removidas do shell e CSP do Tauri deixou de ser nula |
| Orçamento web | aplicação isolada em 75,36 kB (23,55 kB gzip) e Three.js core em 518,36 kB (130,79 kB gzip); Worker em 54,17 kB |

Comandos do gate:

```bash
npm ci
npm run check
npm audit --omit=dev
cargo fmt --manifest-path src-tauri/Cargo.toml -- --check
cargo test --manifest-path src-tauri/Cargo.toml
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings
```

## Limites aceitos

- A superfície é um grafo k-NN procedural, não uma triangulação cortical
  anatômica, atlas parcelado, geodésica ou discretização de Laplace–Beltrami.
- `E`, `I`, estado LIF e `waveActivity` usam unidades arbitrárias; a interface
  não os rotula como milivolts ou potencial extracelular.
- A evidência demonstra propagação atrasada e convergência numérica do cenário
  testado. Ela não demonstra ondas fisiológicas, velocidade biológica calibrada
  ou validade estatística de um fenômeno emergente.
- O foco regional e o zoom são decisões de apresentação e não alteram o motor.
  LODs com orçamento de GPU pertencem ao escopo da 0.5.
- Campo e spikes ainda coexistem no modelo híbrido global. A substituição por
  máscara de resolução, sem sobreposição micro/macro, continua reservada à 0.6.
- Replay de entradas, perfil contínuo, convergência específica de AMPA/GABA-A e
  snapshots visuais automatizados permanecem no backlog transversal. Eles não
  alteram o contrato do campo, mas bloqueiam qualquer nova alegação científica
  que dependa dessas evidências.

## Contrato de entrada da 0.5

A etapa laminar deve começar sem alterar silenciosamente o significado do campo
promovido. O primeiro corte de planejamento precisa definir:

1. IDs e enumeração das seis lâminas;
2. populações por lâmina e unidades de seus estados;
3. matriz permitida de projeções feedforward, feedback e intralaminares;
4. regra explícita de projeção lâmina↔vértice cortical;
5. presença de tálamo/núcleo reticular somente para tarefas que os exijam;
6. testes de conectividade por camada e orçamento gráfico por nível de detalhe.

Qualquer troca do grafo superficial por malha triangular ou atlas é uma mudança
de modelo e reabre os testes de topologia, atraso e convergência da 0.4.
