# Roadmap canônico · BRAIN PRO

**Estado documental:** vigente desde 13 de agosto de 2026

**Produto declarado nos manifests:** `0.9.0`

**Estado de promoção:** 0.8 promovida em 12 de agosto de 2026

**Estado de desenvolvimento:** 0.9 em construção; R09-A, R09-B, R09-C e R09-D concluídas

**Próximo gate:** `R09-E` · dendrito multicompartimental

Este é o único roadmap ativo. Planos anteriores permanecem em
[`docs/legacy`](docs/legacy/README.md) apenas como evidência histórica.
Matemática, implementação, aplicação, gráficos e validação pertencem às
respectivas especificações; este arquivo ordena cortes e aponta para seus
contratos, sem duplicá-los.

## Visão do produto

O BRAIN PRO é um simulador local-first, determinístico, educacional e
experimental. Ele conecta modelos neurais e bioquímicos explicitamente
limitados a uma apresentação 3D auditável. Não é instrumento clínico,
diagnóstico ou prognóstico. Geometria detalhada não é evidência biológica.

## Princípios de programa

1. Rust é a única fonte de verdade para equações, estado científico, RNG,
   eventos, solvers, hashes e replay.
2. Wasm e Worker são fronteiras de execução; não são motores alternativos.
3. TypeScript possui protocolo, aplicação, acessibilidade e apresentação. Um
   experimento TypeScript pode codificar entradas, mas não integrar uma segunda
   fisiologia.
4. Renderer, câmera, LOD, corte, raio-X, cor e FPS não alteram `dt`, parâmetros,
   topologia ou estado científico.
5. Todo objeto visual declara `STATE`, `TOPOLOGY` ou `DECORATION` e, quando
   `STATE`, aponta para um campo publicado.
6. Cada aproximação declara unidade, hipótese, regime, limitação e classe
   epistemológica.
7. Um corte só é promovido quando código, contrato, teste, custo e evidência
   reproduzível concordam.
8. A evolução é local-first e offline-capable. Backend, C#, WebGPU e threads
   entram somente por requisito e medição.
9. Acessibilidade e degradação gráfica preservam informação, não apenas layout.
10. A equipe pequena é um requisito arquitetural: uma fonte por assunto, poucos
    contratos e rollback explícito.

## Estado real em 13 de agosto de 2026

| Eixo | Valor verdadeiro | Evidência | Observação |
| :-- | :-- | :-- | :-- |
| produto npm/Cargo/Tauri | `0.9.0` | manifests | versão corrente em desenvolvimento |
| protocolo Worker | `7` | `src/protocol.ts` | hoje acoplado ao schema da ABI |
| ABI Wasm | `7` | `SIMULATION_SCHEMA_VERSION` | rejeição por igualdade no host |
| snapshot | `7` | `NeuralSnapshot.schemaVersion` | 36 buffers transferíveis |
| schema do host Tauri | `1` | `ENGINE_SCHEMA_VERSION` | não é a ABI da simulação |
| modelos | schemas `1` por subsistema | constantes Rust | patch, STP, fenda, solver e trilha química |
| fixtures | `v1` por artefato | `fixtures/` | não implica produto 1.0 |
| hashes | cinco domínios | snapshot/fixtures | rede, corticotalâmico, célula, química e eventos celulares |
| auditoria runtime versionada | schema `2`, captura ABI v6 | `runtime-audit.json` | comprova P2 em Chromium headless/SwiftShader; não é baseline em GPU física |
| baseline gráfico físico | schema `2`, Intel UHD 770/D3D11 | `artifacts/hardware-audit` | comprova P3 no hardware/driver registrados |

### Matriz resumida de capacidades

| Capacidade | Estado | Proprietário | Evidência | Limite atual |
| :-- | :-- | :-- | :-- | :-- |
| relógio, RNG, CSR, fila e replay | IMPLEMENTADO E VALIDADO | `brain-engine` | fixtures discretos/entrada | RNG repete após `2^32` ticks |
| campo E/I e acoplamento unilateral | IMPLEMENTADO E VALIDADO | `field`, `simulation` | fixture campo/observáveis | grafo procedural, retorno micro→macro desligado |
| coluna L1–L6, relé e TRN | IMPLEMENTADO E VALIDADO | `lib`, `corticothalamic` | testes e auditoria 0.6 | fenomenológico, sem canais tipo T |
| patch AdEx e quatro correntes | IMPLEMENTADO E VALIDADO | `cell_patch` | replay/convergência 0.7 | um dendrito passivo, sem morfologia |
| recursos e STP | IMPLEMENTADO E VALIDADO NO CONTRATO | `chemical_contract`, `short_term_plasticity` | testes e fixture v1 | preset didático não calibrado |
| fenda, ocupação e solver | IMPLEMENTADO E VALIDADO NO REGIME TESTADO | `cleft_occupancy`, `chemical_solver` | replays e convergência | microdomínio representativo, não população de fendas |
| ABI v6 e aba Sinapse | IMPLEMENTADO, VALIDADO E PROMOVIDO | `brain-wasm`, Worker, `SynapseRenderLayer` | [auditoria de promoção](AUDIT_0.8_PROMOTION.md) | validade restrita ao contrato 0.8 declarado |
| passes matéria/emissão e tokens | IMPLEMENTADO E VALIDADO EM P3 | `src/render` | [auditoria gráfica](AUDIT_0.8_GRAPHICS.md) | validade restrita aos backends/envelopes registrados |
| inferência Bayesiana de tarefa | EXPERIMENTAL E ISOLADA | `experiment.ts`, `inference.ts` | schema 1, fixture, controle nulo e replay | posterior é apenas apresentada; estímulo interativo exige contexto nulo |
| eventos celulares carimbados | IMPLEMENTADO E VALIDADO EM R09-B | `cell_patch`, `simulation`, ABI/Worker | fixture, hash próprio, browser e lifecycle | lote limitado a 4.096; cenário padrão pode legitimamente produzir lote vazio |
| Prancha Elétrica | IMPLEMENTADA E VALIDADA EM R09-C | `ElectricalBoardLayer`, DOM e auditoria | testes estruturais, orçamento e navegador | esquema do patch; atraso/ganho macro aparecem separados e não são atribuídos às células |
| seleção e vista Neurônio | IMPLEMENTADAS E VALIDADAS EM R09-D | `CellRenderLayer`, `NeuronRenderLayer`, DOM e auditoria | raycast/lista, teclado, hash geométrico, navegador e invariância | árvore ilustrativa usa um único valor dendrítico; sem propagação ou tipo celular real |
| cortes, vascular e atlas | DOCUMENTADO, MAS NÃO IMPLEMENTADO | futuro | especificações | depende de estado/proveniência |

## Histórico verificável

| Fase | Resultado | Estado | Evidência principal | Documento histórico |
| :-- | :-- | :-- | :-- | :-- |
| 0.2–0.4 | excitabilidade, Worker, campo e superfície | promovida | `AUDIT_0.4.md` | roadmap 0.7 legado |
| 0.5 | Rust/Wasm torna-se motor padrão | promovida | `AUDIT_0.5_PROMOTION.md` | `MIGRATION-0.5.md` |
| 0.6 | L1–L6, relé/TRN e ABI v4 | promovida | auditorias 0.6 | `PLAN-0.6.md` |
| 0.7 | patch AdEx, quatro receptores e ABI v5 | promovida | auditorias 0.7 | `PLAN-0.7.md` |
| 0.8 | recursos, química local, solver, ABI v6 e Sinapse | promovida | [auditoria final](AUDIT_0.8_PROMOTION.md) | proposta 0.8 legada |

A 0.8 foi promovida após a evidência da ABI v6 em
[R08-P2](AUDIT_0.8_ABI_V6.md), o fechamento de pixel→estado, redundância sem cor
e custo em GPU física em [R08-P3](AUDIT_0.8_GRAPHICS.md), e a concordância final
registrada em [R08-P4](AUDIT_0.8_PROMOTION.md).

## Modelo obrigatório de corte

Cada item abaixo herda este contrato. Uma futura PR deve preencher todos os
campos e apontar para IDs das especificações.

| Campo | Obrigação |
| :-- | :-- |
| identidade | ID estável, nome e estado (`planejada`, `experimental`, `implementada`, `validada`, `promovida` ou `bloqueada`) |
| problema e valor | pergunta concreta e benefício observável para o usuário |
| pressupostos | hipóteses, pré-requisitos e dependências |
| fronteira | escopo, fora de escopo e decisão arquitetural |
| ciência | matemática, unidade, estado novo, proprietário e classe epistemológica |
| camadas | mudanças previstas em Rust, ABI, Worker, UI, renderer, assets e persistência |
| qualidade | segurança, acessibilidade, observabilidade e arquivos prováveis |
| prova | testes, critérios mensuráveis, orçamento, artefatos e definição de pronto |
| risco | risco, mitigação, rollback, complexidade e confiança |

Ordem padrão quando o corte atravessa camadas: contrato matemático → tipos Rust
→ solver → testes nativos → fixture/replay → snapshot/hash → ABI → protocolo →
Worker → frontend → renderer → auditoria → documentação → promoção.

## R08-PROMOTION · fechar a versão 0.8

**Estado:** P1–P4 concluídas; 0.8 promovida e oficialmente encerrada. A evolução
0.9 prossegue sob os contratos abaixo.

### R08-P1 · fonte documental única

**Estado:** concluída em `f70207d`.

| Campo | Contrato |
| :-- | :-- |
| problema/valor | eliminar versões 0.7 ativas e roadmaps concorrentes |
| dependências | código 0.8 existente e auditorias históricas |
| escopo | consolidar `ROADMAP`, `ARCHITECTURE`, `MODEL`, `ENGINE`, `FRONTEND`, `GRAPHICS`, `VALIDATION` e legacy |
| fora de escopo | alterar código, fixtures, assets ou claims científicos |
| camadas/arquivos | somente Markdown; nenhum estado/ABI novo |
| qualidade | links locais, headings, IDs e versões coerentes |
| aceite/evidência | um roadmap ativo; links sem alvo ausente; diff somente textual |
| orçamento/risco/rollback | sem custo runtime; risco de perda histórica mitigado por `docs/legacy`; rollback pelo commit |
| complexidade/confiança | média / alta |

### R08-P2 · evidência executável da ABI v6

**Estado:** concluída; evidência em [AUDIT_0.8_ABI_V6.md](AUDIT_0.8_ABI_V6.md).

| Campo | Contrato |
| :-- | :-- |
| problema/valor | provar que os 34 buffers e quatro hashes funcionam no navegador publicado |
| ciência | nenhuma equação nova; preservar fixtures/hashes v5 |
| camadas | CI, Worker e auditoria; sem mudar semântica do snapshot |
| testes | Cargo, Clippy, Wasm, Vitest, Worker real, reset/dispose e replay químico |
| aceite | auditoria de fechamento registra comandos, ambiente, ABI 6, quatro hashes e aba Sinapse |
| orçamento | snapshot, latência p95 e memória observados; sem meta inventada |
| risco/mitigação | bindings ou artefatos defasados; regenerar somente em PR própria e comparar semanticamente |
| rollback | voltar à ABI v5 apenas com feature flag e preservação de fixture; nunca remover química silenciosamente |
| complexidade/confiança | média / alta |

### R08-P3 · fechar os gates gráficos reais

**Estado:** concluída; evidência em [AUDIT_0.8_GRAPHICS.md](AUDIT_0.8_GRAPHICS.md).

| Campo | Contrato |
| :-- | :-- |
| problema/valor | converter alegações de cor/proveniência em prova renderizada |
| escopo | pixel→estado em alvos conhecidos, redundância estrutural, saturação e baseline em hardware real |
| fora de escopo | redesenho anatômico |
| camadas | `src/render`, auditoria runtime e artefatos; motor imutável |
| acessibilidade | monocromia deve preservar forma/padrão/rótulo, não apenas aplicar `grayscale` |
| aceite | erro pixel→estado dentro da tolerância declarada; zero objetos sem proveniência; capturas ABI v6; relatório em GPU real |
| orçamento | CPU/GPU/draw calls/triângulos/bytes por vista registrados antes/depois |
| risco/rollback | tolerância frágil entre GPUs; usar teste estrutural obrigatório e pixel test com envelope por backend |
| complexidade/confiança | alta / média |

### R08-P4 · promoção

**Estado:** concluída; evidência em
[AUDIT_0.8_PROMOTION.md](AUDIT_0.8_PROMOTION.md).

| Campo | Contrato |
| :-- | :-- |
| problema/valor | transformar implementação em baseline verificável |
| dependências | P1–P3 completos |
| escopo | criar auditoria de promoção 0.8 e atualizar estado público |
| aceite | código, contrato, teste, custo e evidência concordam; nenhum achado alto aberto |
| rollback | manter 0.7 como baseline promovido se qualquer gate falhar |
| complexidade/confiança | baixa / alta após P1–P3 |

## 0.9 · neurônio resolvido e Prancha Elétrica

### R09-A · fronteira de experimentos

Resolve a posterior Bayesiana antes calculada em TypeScript e enviada como
`confidence`. O corte define `ExperimentEncoder`/`ExperimentDecoder`, classifica
o cálculo como modelo de tarefa e retira sua influência do drive. Não cria
“cognição” genérica.

- **Estado:** concluída; **IDs:** ARC-014, UI-012, MOD-090, QA-090; **evidência:**
  [AUDIT_0.9_R09_A.md](AUDIT_0.9_R09_A.md).
- **Arquivos:** `experiment.ts`, `direct-stimulus.ts`, `inference.ts`, `main.ts`,
  protocolo, schemas de aplicação, fixture e testes.
- **Aceite:** nenhuma posterior atravessa o comando interativo; contexto nulo é
  validado no host; controle nulo, replay e UI explicam hipótese e limite.
- **Desempenho/segurança:** custo fora do laço gráfico; payload validado e
  limitado a 4.096 observações. **Rollback:** manter apenas estímulo direto.
- **Complexidade/confiança:** média / alta.

### R09-B · eventos celulares carimbados

Publica IDs e offsets de tempo de spikes em lote compacto. Rust possui o evento;
ABI/Worker apenas o transportam; renderer nunca infere um spike entre snapshots.

- **Estado:** concluída; **IDs:** ENG-018, ABI-012, GFX-031, QA-091;
  **evidência:** [AUDIT_0.9_R09_B.md](AUDIT_0.9_R09_B.md).
- **Aceite:** ordem canônica, replay, limite de eventos, hash próprio ou regra
  explícita de compatibilidade, reset/dispose e teste de backpressure.
- **Orçamento:** 12 bytes/evento, dois buffers e teto de 4.096 eventos/49.152
  bytes por snapshot. **Rollback:** manter o flag legado e desabilitar o consumo
  do lote no renderer.
- **Complexidade/confiança:** média / alta.

### R09-C · Prancha Elétrica

Cria uma vista esquemática, não uma segunda cena celular. Mostra nós, vias,
direção, atrasos, voltagem, corrente, condutância, excitação, inibição e shunt
com unidades e origem. “Nível de processamento” significa somente escala visual,
conjunto de observáveis ou preset científico explicitamente selecionado.

- **Estado:** implementada e validada em 12 de agosto de 2026; **IDs:**
  ELE-001..006, UI-020, GFX-040, QA-092; **evidência:**
  [auditoria R09-C](AUDIT_0.9_R09_C.md).
- **Fora de escopo:** alterar `dt`, solver, topologia ou compartimentos por zoom.
- **Aceite:** cada número aponta para snapshot/observável; câmera e modo não
  mudam hashes; teclado, equivalente textual e movimento reduzido.
- **Orçamento:** teto de draws e atualização por evento declarado antes do merge.
- **Rollback:** vista textual tabular. **Complexidade/confiança:** alta / média.

O corte fechou com scene graph próprio, 12 nós, quatro vias receptoras,
voltagem, corrente, condutância efetiva derivada, shunt e lote carimbado. O modo
padrão custa 10 draws; o modo de eventos, 11. A prancha reutiliza objetos e
matrizes, só reconstrói marcadores quando o hash do lote muda e mantém tabela
textual operacional como fallback.

### R09-D · seleção e vista Neurônio

Seleciona uma das 12 células por clique e teclado e apresenta soma, dendrito
único, adaptação e correntes publicadas. A geometria inicial é ilustrativa e o
dendrito inteiro usa um único valor; nenhum gradiente é inventado.

- **Estado:** concluída em 13 de agosto de 2026; **IDs:** UI-021, GFX-050,
  AST-010, QA-093; **evidência:** [auditoria R09-D](AUDIT_0.9_R09_D.md).
- **Aceite:** seleção não muta motor; `Tab`/`Enter`/`Escape`; hash de geometria
  determinístico; evento visual consome exclusivamente o lote carimbado em R09-B.
- **Rollback:** voltar ao patch de 12 células. **Complexidade/confiança:** média / alta.

O corte fechou com seleção local por raycast e lista de 12 células, navegação
`Tab`/`Enter`/`Escape`, foco restaurado e scene graph próprio. A morfologia usa
stream de apresentação, `seed + cellId` e hash FNV-1a de 64 bits. A vista custa
10 draws, lê oito valores celulares por snapshot e mantém um marcador estático
somente quando o lote carimbado contém a célula; nenhum hash científico muda.

### R09-E · dendrito multicompartimental

Somente após pergunta científica e convergência de cabo, acrescenta estados
proximal/distal ao Rust, novo preset/schema e gradiente autorizado.

- **Estado:** planejada; **IDs:** MOD-100, ENG-025, ABI-020, QA-100.
- **Aceite:** unidades/condições de contorno, referência refinada, invariantes,
  sensibilidade, replay e orçamento de 12 células.
- **Risco:** escopo numérico alto. **Rollback:** preset pontual permanece
  suportado e a UI rotula compartimento único. **Complexidade/confiança:** alta / média.

### R09-F · películas e planos de corte

Implementa isolamento, opacidade, raio-X e corte coronal/sagital/axial/oblíquo
com tampa e sonda. Camadas sem fonte são `DECORATION`; a sonda só mostra campos
publicados.

- **Estado:** planejada; **IDs:** GFX-060..068, AST-020, UI-024, QA-101.
- **Assets:** nenhum atlas é incluído neste corte.
- **Aceite:** hash invariante a câmera/corte/LOD, operação por teclado/touch,
  legenda de unidade e custo de clipping medido.
- **Rollback:** desabilitar clipping e manter isolamento. **Complexidade/confiança:** alta / média.

## 0.10 · anatomia com proveniência e transmissão de volume

| Corte | Estado | Contrato e dependências | Aceite principal | Risco/rollback |
| :-- | :-- | :-- | :-- | :-- |
| R10-A · catálogo anatômico | planejada | IDs semânticos, hierarquia, busca, lado, fonte, licença e transformação; depende de GRAPHICS/REFERENCES | cada objeto possui proveniência e nível de evidência | asset/licença; rejeitar importação e manter procedural |
| R10-B · vascular topológico | planejada | artérias/veias/capilares somente como topologia educacional | isolamento, direção e orçamento; sem fluxo inventado | aparência clínica; rotular `TOPOLOGY/ILUSTRATIVO` |
| R10-C · núcleos funcionais | pesquisa | origem/alvo/receptor antes de qualquer pluma | circuito, controle nulo e observável publicados | excesso de escopo; não renderizar fonte ausente |
| R10-D · reação–difusão | pesquisa | contrato matemático, domínio com unidade, IMEX/implícito, positividade e massa | solução simples, convergência e custo | rigidez; manter apenas química local |
| R10-E · mapas químicos | planejada após C/D | concentração, ocupação e efeito em camadas separadas | nenhuma camada deriva as outras no renderer | custo volumétrico; fallback 2D/superfície |

Cada corte herda o modelo obrigatório: Rust possui novo estado; ABI incrementa
somente se o wire mudar; Worker limita memória e cancelamento; UI fornece busca,
legenda e equivalentes textuais; renderer respeita proveniência; assets exigem
licença/hash; persistência versiona IDs; segurança rejeita arquivos malformados;
observabilidade mede CPU/GPU/memória; complexidade é alta e confiança baixa até
existirem dados/fontes concretos.

## 0.11 · experimentos, comparação e observáveis

| Corte | Valor | Dependências | Evidência/aceite | Fora de escopo |
| :-- | :-- | :-- | :-- | :-- |
| R11-A · timeline/replay | play, pause, step, bookmarks e scrub por checkpoints | ABI/replay versionados | retorno determinístico e limites de interpolação visíveis | editar o passado do motor sem reset |
| R11-B · comparação | seed/preset/controle lado a lado | dois runners isolados e orçamento | câmeras/timeline sincronizadas, diff numérico com unidade | misturar estados entre execuções |
| R11-C · catálogo de experimentos | hipótese, controle, duração, observáveis e relatório | R09-A | reprodução por seed/hash/versão | afirmar causalidade sem controle |
| R11-D · observáveis | pseudo-LFP, espectro, sincronização e dimensionalidade | contratos em MODEL/VALIDATION | unidade, janela, cadência, custo e teste sintético | rodar análises pesadas por frame |
| R11-E · persistência local | preferências, presets, replays e anotações | schemas/migração | import/export validado, cotas e recuperação | backend obrigatório |

Persistência começa em IndexedDB e filesystem Tauri controlado. Dados pessoais,
contas, colaboração ou telemetria exigem plano separado de privacidade e
autorização. Complexidade média/alta; rollback é exportação e armazenamento
somente em memória.

## 1.0 · estabilização experimental

Entra somente depois de 0.8 promovida e dos cortes escolhidos de 0.9–0.11.
Entrega presets versionados, API/replay estáveis, documentação de limites,
acessibilidade ponta a ponta, matriz de ambientes, pacote web/Tauri reproduzível
e proveniência de assets. Atlas, PWA, mobile dedicado, VR/AR, WebGPU compute,
backend e C# não são requisitos automáticos da 1.0.

Critério de pronto: zero requisito crítico sem teste; migração documentada para
schemas; baseline em hardware integrado e intermediário; importações abusivas
limitadas; release assinável; nenhuma alegação além do regime validado.

## Riscos transversais

| ID | Risco | Probabilidade/impacto | Indicador | Mitigação/dono | Fase | Residual |
| :-- | :-- | :-- | :-- | :-- | :-- | :-- |
| RSK-01 | documentação divergir do código | alta/alta | versão ou campo sem contrato | links por símbolo/IDs; arquitetura | todas | médio |
| RSK-02 | segunda ciência em TS/C#/GPU | média/alta | equação fora de Rust | revisão de dependência; engine | todas | baixo |
| RSK-03 | quebra de determinismo | média/alta | hash/replay divergente | ordem canônica e fixtures; engine | toda ABI | médio |
| RSK-04 | ABI crescer sem controle | alta/média | bytes/cópias/fila | orçamento e compatibilidade; boundary | 0.9+ | médio |
| RSK-05 | realismo parecer validação | alta/alta | asset sem classe/fonte | proveniência e legenda; graphics | 0.9+ | médio |
| RSK-06 | saturação/inacessibilidade | média/alta | estado não recuperável sem cor | gates estruturais/pixel; UX | promoção+ | baixo |
| RSK-07 | asset sem licença/transformação | média/alta | manifesto incompleto | pipeline de assets; graphics | 0.10 | baixo |
| RSK-08 | backend prematuro/dados pessoais | baixa/alta | conta/telemetria sem requisito | local-first e privacy gate; security | 0.11+ | baixo |
| RSK-09 | hardware avançado obrigatório | média/alta | queda sem fallback | WebGL baseline/LOD; performance | todas | médio |
| RSK-10 | escopo incompatível com equipe pequena | alta/alta | fases longas e paralelas | cortes revisáveis e WIP limitado; programa | todas | médio |

## Definição global de pronto

Uma fase só muda para **promovida** quando:

- contrato científico e proprietário do estado estão identificados;
- código, ABI, frontend e renderer respeitam as fronteiras;
- testes, fixture/replay e evidência de ambiente aplicáveis existem;
- desempenho, acessibilidade, segurança e rollback foram avaliados;
- hashes anteriores só mudam por decisão explícita;
- documentação canônica e índice legacy estão coerentes;
- não há efeito visual sem `STATE`, `TOPOLOGY` ou `DECORATION` declarado.

Veja [ARCHITECTURE.md](ARCHITECTURE.md), [MODEL_SPEC.md](MODEL_SPEC.md),
[ENGINE_SPEC.md](ENGINE_SPEC.md), [FRONTEND_SPEC.md](FRONTEND_SPEC.md),
[GRAPHICS_SPEC.md](GRAPHICS_SPEC.md) e [VALIDATION.md](VALIDATION.md).
