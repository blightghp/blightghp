# Auditoria 0.10 · R10-C · orçamento e reclamação

**Data:** 20 de agosto de 2026

**Estado:** implementado e validado no envelope declarado

**Branch de trabalho:** `blightghp/r10-c-orcamento-e-reclamacao`

**Baseline científico:** produto 0.9.0 · protocolo/ABI/snapshot v8 · 37 buffers · cinco hashes

## Escopo e fronteira

R10-C transforma custo de apresentação em contrato versionado antes de aumentar
a fidelidade geométrica. O corte cria perfis `baseline`, `enhanced` e `cinema`,
governador com downgrade e histerese, telemetria por vista, caches de cena e um
gate reproduzível. Não altera Rust científico, Wasm, Worker, ABI, `dt`,
parâmetros, topologia, snapshot ou hashes.

O perfil interativo inicial é `enhanced`. Depois de 12 frames consecutivos acima
de 20 ms, o governador aplica `baseline`, informa
`frame-budget-exceeded` e exige recuperação manual depois de 90 frames estáveis.
`cinema` é isolado ao modo de captura. O gerador do GIF entra nesse modo e
seleciona o perfil explicitamente; o manifesto schema 3 passa a validar esse
vínculo quando o campo está presente, sem invalidar o artefato legado.

| ID | Entregável | Resultado |
| :-- | :-- | :-- |
| GFX-080 | orçamento versionado por vista | schema 1, seis vistas, draws/triângulos/bytes/p95 e 24 amostras por vista |
| GFX-081 | perfis e governador | `enhanced` inicial, `baseline` automático, `cinema` somente em captura e recuperação com histerese |
| PERF-011 | eliminar trabalho recorrente | buffers de ativação reutilizados, cauda de instâncias limitada e 21 matrizes estáticas congeladas |
| PERF-012 | cachear partições | materialidade, clipping e bloom usam revisão explícita da cena; zero travessia estrutural por frame |
| PERF-013 | reduzir composição | `baseline` pula bloom e render extra quando não há emissão visível |
| QA-112 | gate e evidência | verificador CI, 12 capturas, cinco hashes invariantes e zero erro de navegador |

## Orçamento medido

A captura versionada usou Chromium 150, ANGLE/D3D11 e Intel UHD Graphics no
host i5-10300H. Cada vista recebeu 24 amostras com relógio e câmera controlados.
Os números abaixo são os valores realmente medidos; os tetos completos ficam no
JSON do artefato.

| Vista | p50 (ms) | p95 (ms) | Draws | Triângulos | Textura (bytes) | Geometria (bytes) |
| :-- | --: | --: | --: | --: | --: | --: |
| Visão Geral | 1,90 | 6,30 | 28 | 14.166 | 61.187.040 | 487.164 |
| Lâminas | 8,60 | 19,10 | 50 | 7.496 | 61.182.944 | 204.924 |
| Célula | 0,80 | 1,90 | 6 | 4.892 | 60.920.800 | 96.648 |
| Neurônio | 3,20 | 8,10 | 9 | 2.324 | 60.920.800 | 68.228 |
| Eletricidade | 0,80 | 2,40 | 10 | 1.186 | 60.658.656 | 7.580 |
| Sinapse | 1,30 | 6,20 | 15 | 17.148 | 61.182.944 | 160.664 |

Todas as vistas ficaram abaixo de 33,4 ms p95 e dos tetos estruturais. O maior
p95 foi 19,1 ms em Lâminas. A comparação com R10-B é conservadora: o verificador
exige que nenhum draw, triângulo ou byte exceda a referência mais a tolerância
declarada. Os cinco hashes permaneceram iguais antes e depois da alternância de
perfil e das capturas.

Os caches finais registraram 110 objetos, seis raízes de efeitos, seis camadas
de clipping e partições de bloom com 58 objetos de matéria, 40 de emissão e 12
excluídos. A UI e a sonda de corte foram desacopladas do frame e atualizadas na
cadência de métricas de 0,12 s.

O `audit:runtime` também passou com 102 amostras e p95 de 3.632,10 ms em
SwiftShader. Esse número valida lifecycle no rasterizador de software; não é
baseline de desempenho e não é comparado ao p95 de GPU física.

## Segurança e dependências

`npm audit` e `npm audit --omit=dev` terminaram com zero vulnerabilidades depois
da atualização transitiva do lockfile. `cargo audit` também terminou com código
zero e nenhuma vulnerabilidade bloqueante. A dependência transitiva
`event-listener` foi atualizada de 5.4.1 para 5.4.2, versão corrigida para
RUSTSEC-2026-0221.

Permanecem 17 avisos informativos permitidos pelo RustSec: 16 pacotes não
mantidos da árvore transitiva e um aviso de soundness em `glib` 0.18.5
(RUSTSEC-2024-0429). `glib` entra pela pilha GTK3/Linux do Tauri, não pelo alvo
Windows auditado, e a correção exige `glib >= 0.20`, incompatível com a linha
GTK3 transitiva atual. O risco é registrado e deve ser reavaliado quando a pilha
upstream migrar; não foi escondido por exceção local.

Entradas do perfil são reduzidas a uma união fechada; `cinema` é rejeitado fora
de captura; medições inválidas não promovem transição; nenhuma nova entrada de
rede, parser de asset ou superfície de IPC foi criada.

## Revisão estética

A revisão comparou as 12 capturas com MRI, superfícies corticais, histologia,
cortes anatômicos e reconstrução microscópica públicas. Nenhum asset de
referência foi incorporado. O resultado melhora profundidade, oclusão e
materialidade e torna a tentativa 3D consistente entre as seis vistas, mas não
atinge foto-realismo ou anatomia calibrada.

O bloqueio dominante é geométrico: a Visão Geral ainda usa casca facetada sem
giros/sulcos; Lâminas e Célula dependem de cilindros/elipsoides repetidos; o
Neurônio tem arborização esparsa e exposição excessiva; Sinapse mistura escalas
didáticas; Eletricidade deve permanecer uma prancha legível. O parecer completo,
notas por vista, referências e ownership dos próximos gates estão em
[`../../reviews/VISUAL_REVIEW_R10_C.md`](../../reviews/VISUAL_REVIEW_R10_C.md). R10-D possui a
superfície procedural e R10-E, luz/materialidade; R10-H continua sendo a única
entrada permitida para atlas/assets externos com proveniência.

## Comandos e evidência

| Comando | Resultado |
| :-- | :-- |
| `npm run check` | passou; tipagem, replay, 27 arquivos/139 testes, build, Worker/Wasm, promoção 0.8, orçamento e runtime |
| `npm run audit:presentation-budget` | passou; seis vistas, 144 amostras, 12 capturas, GPU física e zero erro de navegador |
| `npm run verify:presentation-budget` | passou; schema, tetos, referência R10-B, isolamento de cinema e hashes |
| `npm run audit:material` | passou em diretório temporário; 37 elegíveis e 18 capturas |
| `npm run audit:anatomy` | passou em diretório temporário; 76 entradas e cinco capturas |
| `npm run audit:vascular` | passou em diretório temporário; 42 segmentos e seis capturas |
| `cargo test --workspace` | passou; 83 testes Rust, zero falha |
| `cargo clippy --workspace --all-targets -- -D warnings` | passou |
| `cargo fmt --all -- --check` | passou |
| `npm audit` | passou; zero vulnerabilidades |
| `cargo audit --file Cargo.lock` | passou; zero vulnerabilidades, 17 avisos informativos documentados |
| `git diff --check` | passou |

Artefatos versionados em `artifacts/presentation-budget/`:

- `presentation-budget.json` schema 1;
- seis capturas `baseline-*.png`;
- seis capturas `visual-*-enhanced.png`.

Cada PNG nasce de `canvas.toDataURL()` no mesmo callback do render, evitando o
descarte tardio do framebuffer. `captureCoverage` amostra 96×64 pixels e o gate
rejeita menos de oito pixels visíveis; as 12 capturas finais registraram de 128
a 2.814 pixels visíveis.

O workflow CI verifica o artefato versionado. A geração ao vivo permanece um
comando explícito porque exige GPU/driver declarados; SwiftShader não pode
substituir silenciosamente a baseline física.

## Riscos, rollback e veredito

Riscos residuais: a baseline depende do conjunto GPU/driver registrado; o chunk
`three-core` permanece com aviso de 567,63 kB; o governador reage ao tempo total
observado e não diagnostica sozinho a origem da pressão; o realismo visual ainda
é limitado pela geometria procedural existente; a pilha GTK3 transitiva exige
acompanhamento upstream.

Rollback: restaurar o perfil inicial esquemático e remover o governador/UI
desliga a política sem tocar no motor. Os caches podem ser substituídos pelas
travessias anteriores mantendo as APIs das seis camadas. O verificador aceita o
artefato somente se a referência e os limites permanecerem explícitos.

**Veredito:** R10-C está implementada e validada no envelope declarado. Não há
achado bloqueante. A etapa estabelece a baseline técnica e estética honesta para
R10-D; não autoriza alegação de foto-realismo, atlas ou validação clínica.
