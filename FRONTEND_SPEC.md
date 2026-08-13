# Especificação da aplicação e UX · BRAIN PRO

**Revisão:** 4 · produto observado 0.9.0

Este documento regula o shell TypeScript, DOM, fluxos, acessibilidade e consumo
do Worker. Não regula equações nem materiais 3D.

## Requisitos normativos

| ID | Requisito |
| :-- | :-- |
| UI-001 | frontend trata snapshots como somente leitura. |
| UI-002 | estado científico, apresentação, seleção, navegação, configuração, persistência, efêmero e auditoria são separados. |
| UI-003 | todo número científico exibido tem unidade, origem e escala. |
| UI-004 | uma preferência visual nunca cruza a ABI como parâmetro científico. |
| UI-005 | mudança de preset científico é explícita, versionada e confirma reset/migração. |
| UI-006 | erro degradado informa que o motor não está rodando; não simula sucesso. |
| UI-007 | toda interação gráfica relevante tem equivalente por teclado e texto. |
| UI-008 | movimento reduzido conserva informação. |
| UI-009 | cor nunca é a única pista semântica. |
| UI-010 | controles e imports são validados e limitados antes do Worker. |
| UI-011 | UI modular/DOM direto permanece enquanto for testável e compreensível. |
| UI-012 | experimentos usam `ExperimentEncoder`/`ExperimentDecoder` explícitos. |
| UI-020 | Prancha Elétrica possui scene graph próprio, níveis apenas de apresentação, teclado e equivalente tabular com unidade/origem. |
| UI-021 | seleção celular por raycast e lista converge no mesmo ID; `Tab` percorre, `Enter` amplia, `Escape` retorna o foco e nenhuma ação cruza o protocolo científico. |
| UI-022 | perfil de material é preferência de apresentação com fallback esquemático; não altera texto, foco, seleção, snapshot ou hashes. |
| UI-024 | plano de corte possui controles por teclado/touch, feedback numérico, unidade/interpolação da sonda e indisponibilidade explícita fora do domínio válido. |
| UX-001 | ampliar muda enquadramento/resolução mostrada, não equação por câmera. |
| UX-002 | cada vista mostra “o que vejo”, modelo, unidade, hipótese e limite. |

## Arquitetura atual

```text
DOMContentLoaded
  └─ main.ts:init
      ├─ cria scene/camera/renderer/pipeline
      ├─ generateBrainData()
      ├─ monta seis RenderLayers
      ├─ cria simulation.worker.ts
      ├─ initialize → ready/fallback
      ├─ liga DOM e controles
      └─ inicia requestAnimationFrame
```

`main.ts` ainda concentra composição, bindings de UI, métricas, captura e
controle do frame. Isso é dívida de organização, não autorização para uma classe
global maior. Extrações futuras devem seguir responsabilidades observáveis:

- `engine-client`: request/response, filas, lifecycle e diagnósticos;
- `app-state`: seleção, vista, modo e preferências;
- `view-controller`: tabs, painéis e foco;
- `metrics-controller`: unidades e instrumentos;
- `capture-controller`: captura/replay de apresentação;
- `experiment-controller`: adaptadores de tarefa.

Uma migração para React/Vue/Svelte exige demonstrar redução de complexidade,
melhor acessibilidade/testabilidade, integração segura com o ciclo Three.js e
custo aceitável de bundle/migração. Não há evidência atual para fazê-la.

## Separação de estados

| Classe | Exemplos atuais/alvo | Dono | Persistência | Pode alterar ciência? |
| :-- | :-- | :-- | :-- | :-- |
| científico | snapshot, hashes, tick, preset | Rust/Worker | replay versionado | é a ciência |
| apresentação | bloom, monocromia, LOD, visibilidade, material, corte, raio-X, opacidade e isolamento | UI/renderer | preferências | não |
| seleção | região/célula/sinapse escolhida | app state | opcional | não |
| navegação | aba, câmera, escala, breadcrumbs | app state | opcional | não |
| configuração científica | seed, preset e parâmetros permitidos | contrato de experimento | projeto/replay | sim, explicitamente |
| efêmero | hover, transição, menu aberto | componente | não | não |
| auditoria | perfil, contraste, proveniência, faults | ferramentas | artefato | não |

O input inicial continua plano por compatibilidade de URL e controles, mas R09-A
passou a compô-lo a partir de três schemas e tipos distintos:
`PresentationPreferences`, `RunControls` e `ScientificPresetSelection`. Essa
separação impede que validação de aparência seja confundida com parâmetro
científico; uma futura persistência pode armazená-los independentemente.

## Relação com o Worker

Frontend envia apenas comandos tipados e recebe eventos fechados. O cliente
mantém no máximo uma requisição de avanço ativa; o Worker rejeita a primeira
mensagem acima de 64 pendentes. Cancelamento ainda é futuro. Schema incompatível
é rejeitado antes de montar métricas.

`window.__BRAIN_ENGINE__` é hook de auditoria/captura, não API pública estável.
Ele expõe captura, modo, vista, agenda, diagnóstico, perfil, cor e auditoria
visual. Novas funções exigem teste e não podem furar a validação do protocolo.

## Vistas atuais

| Vista | Estado consumido | Função | Limite |
| :-- | :-- | :-- | :-- |
| Visão Geral | rede, campo, sinais e hashes | orientação macro e saúde | topologia procedural, não atlas |
| Lâminas | L1–L6, relé, TRN, rebote | circuito didático | massa neural fenomenológica |
| Célula | patch, contorno e eventos carimbados | 12 células × soma/proximal/distal | cabo passivo; sem canais dendríticos ativos |
| Neurônio | uma célula do patch e seus eventos carimbados | soma, proximal, distal, adaptação e quatro correntes | morfologia ilustrativa; sem condução ativa ou tipo celular real |
| Eletricidade | patch, eventos e topologia macro rotulada | Prancha Elétrica com V/A/S, atenuação, direção e origem | esquema didático; atraso/ganho macro não pertencem ao patch |
| Sinapse | química v6 | vesícula, fenda, ocupação/remoção | microdomínio representativo |

### Materialidade e planos de corte

R09-F acrescenta `realistic-illustrative` como preferência visual global,
aplicada por vista sem remontar o scene graph. A troca conserva equivalente
textual, ordem de foco, alvo de picking, modo monocromático e movimento reduzido.
Falha de contexto/material ou alto contraste retorna atomicamente a
`schematic`; nenhum fallback visual é enviado ao Worker.

O painel `R09-F · apresentação local` oferece coronal, sagital, axial, oblíquo,
laje, posição, espessura, azimute/elevação, raio-X, opacidade, isolamento e reset
de câmera. `C`, `[`, `]`, `X`, `I` e `R` são equivalentes de teclado; selects,
checkboxes e ranges são operáveis por touch. A live region da sonda enuncia
campo, valor, unidade e regra de amostragem. Fora da Visão Geral, ela informa que
não existe mapeamento macroscópico em vez de inferir química microscópica.

## Modos de uso alvo

Os três modos usam o mesmo motor e snapshot.

### Modo guiado

- sequência curta, termos definidos e controles essenciais;
- painel “O que estou vendo?” com modelo, unidade, hipótese e limite;
- histórias/experimentos predefinidos com seed e resultado esperado como
  observação, não como certeza;
- linguagem não clínica e avisos metodológicos visíveis.

### Modo explorador

- navegação livre, busca, breadcrumbs, isolamento e comparação;
- personalização acessível, câmeras salvas e bookmarks;
- painel causal: estado anterior, atual e entrada que mudou.

### Modo laboratório

- seed, preset, parâmetros permitidos, step, replay, logs e observáveis;
- exportação versionada, custo e classificação epistemológica;
- controles avançados não aparecem sem unidade/envelope;
- falha/invariante interrompe o experimento e preserva evidência.

O modo é estado de apresentação/permissão de controles, não fork do solver.

## Jornadas

### Inicialização e recuperação

1. carregar shell e indicar progresso do Wasm;
2. validar ABI/capacidades;
3. mostrar preset, seed, passo e runtime;
4. em falha, exibir modo degradado, causa segura e ação de retry/reset;
5. nunca apresentar zeros do fallback como atividade científica.

### Execução

1. selecionar preset/seed;
2. iniciar, pausar ou avançar por tick;
3. alterar velocidade de parede sem mudar `dt`;
4. observar fila, snapshot e estado;
5. reset confirma descarte do estado não exportado;
6. replay usa registro ordenado e verifica versão/hash.

### Escada de escalas

Encéfalo → região → coluna → patch → neurônio → sinapse. Breadcrumb e selo de
resolução mostram qual estado é autoritativo. `Escape` volta; foco retorna ao
elemento de origem. Zoom orbital isolado não troca modelo.

### Seleção anatômica/celular

- busca/árvore e picking convergem para o mesmo `selectionId`;
- clique, teclado e touch produzem o mesmo resultado;
- painel anuncia nome, classe de proveniência e nível de evidência;
- seleção não altera motor; um preset científico separado pode, com confirmação.

R09-D implementa o recorte celular: a lista de 12 botões e o raycast nos somata
endereçam o mesmo `selectedCellId`. Foco sobre a lista seleciona; `Enter` abre a
vista Neurônio; `Escape` retorna à vista Célula e ao elemento de origem. O estado
fica em `main.ts`, atualiza apenas apresentação e é auditado contra os cinco
hashes científicos com o relógio congelado.

### Erro

Mensagens incluem ação, domínio (`input`, `resource`, `solver`, `ABI`, `Worker`,
`renderer`), tick quando seguro, possibilidade de retry e impacto no estado.
Stack trace não é exibida ao usuário final. Reset/dispose não deixam promessa
pendente resolver sobre uma instância nova.

## Prancha Elétrica

A vista própria implementada em R09-C oferece:

- esquema abstrato do patch em scene graph distinto da vista Célula;
- 12 nós E/I, quatro vias receptoras, direção, V somático/proximal/distal, A,
  S efetiva, atenuação proximal→distal, excitação, inibição, shunt e eventos
  celulares carimbados;
- atraso e ganho médios da rede em linhas próprias, rotulados como topologia
  macro para não fingir que são atributos das células do patch;
- níveis agregado, celular e eventos, além de equivalente tabular com caminho
  de origem e unidade.

Overlay anatômico, circuito laminar, probe, timeline, comparação, seleção e
observáveis químicos continuam futuros; R09-C não os reivindica.

“Nível de processamento” só significa agregação visual, escala, conjunto de
observáveis ou preset explicitamente selecionado. Nunca altera silenciosamente
`dt`, solver, topologia, parâmetros ou compartimentos.

## Aprendizagem e encantamento

A experiência deve usar coerência causal, transições significativas, continuidade
espacial, detalhamento sob demanda e feedback preciso. Pulsos, brilho e movimento
sem causa não são “encantamento”; são ruído epistemológico.

Recursos priorizados:

- glossário e equação/unidade associada;
- painel de proveniência e limite;
- “o que mudou quando alterei isto?”;
- comparação anterior/atual;
- histórias e experimentos reproduzíveis;
- bookmarks, anotações e relatório somente após persistência segura.

Som é opcional, desligado por padrão, pausável e com equivalente visual/textual.

## Acessibilidade

### Teclado e foco

- tabs: roving tabindex, setas, Home/End;
- seleção de cena: lista/árvore equivalente, `Enter` abre, `Escape` volta;
- foco visível e restaurado após diálogo/transição;
- ordem do DOM acompanha ordem lógica, não posição visual;
- atalhos documentados e não conflitantes.

### Semântica

- landmarks, headings e nomes acessíveis;
- status do motor em live region com parcimônia;
- canvas possui resumo e tabela equivalente atualizável;
- erros identificam campo e correção;
- unidades são pronunciáveis e não codificadas só em símbolos.

### Visão, cor e movimento

- contraste de texto ≥ 4,5:1 no gate atual;
- alto contraste, monocromia e paletas para deficiências de visão de cor;
- forma, padrão, direção ou rótulo redundante;
- `prefers-reduced-motion` remove movimento ornamental e converte eventos em
  marcadores estáticos equivalentes;
- tamanho de texto/responsividade sem overflow a 390×844 e perfis adicionais.

### Touch e responsividade

Alvos mínimos e gestos precisam de alternativa de botão/teclado. Orientação e
redimensionamento não escondem controles críticos. Painéis sobre o canvas não
devem bloquear navegação ou leitores de tela.

## Personalização de cores

Tokens semânticos vêm de GRAPHICS_SPEC. Preferências:

- escolhem presets validados e restauráveis;
- preservam contraste e invertibilidade;
- impedem combinações ilegíveis;
- distinguem matéria, emissão, seleção, advertência e degradação;
- não enviam cor ao Worker;
- armazenam somente tokens/escolhas, não snapshot.

O modo monocromático atual usa filtro no canvas e pistas geométricas declaradas.
Isso é implementação parcial: o gate futuro deve provar cada distinção por
estrutura/rótulo, e não apenas confirmar que o filtro foi aplicado.

## Persistência alvo

| Dado | Armazenamento | Schema | Privacidade |
| :-- | :-- | :-- | :-- |
| preferências/câmera | IndexedDB/local; Tauri config | UI independente | sem dados pessoais por padrão |
| presets científicos | projeto exportável | modelo/preset | validação e confirmação |
| replay/checkpoints | IndexedDB/filesystem Tauri | ABI + fixture + hashes | cotas e recuperação |
| anotações | projeto local | conteúdo | sanitização/importação |

Importação nunca executa código, valida tamanho antes do parse, limita
topologia/eventos/strings e conserva o original para diagnóstico quando seguro.
Migração falha de modo recuperável e oferece exportação.

## Experimento Bayesiano de tarefa

`BayesianObservationExperiment` encapsula `BayesianBelief.observe` como modelo
de tarefa schema 1. Encoder e decoder validam identificação, sequência,
probabilidades e o limite de 4.096 observações; fixture, replay e controle nulo
demonstram o contrato. A posterior permanece no shell e é exibida no painel.

O comando interativo usa `DirectNeuralStimulus`: intensidade direta e contexto
literal zero, também rejeitado no host se divergente. Portanto a posterior não
altera o drive, não sustenta alegação cognitiva geral e não é evidência de
validade do núcleo. Qualquer influência científica futura exigirá novo contrato
Rust/ABI, hipótese, preset e replay próprios.

## Testes necessários

| Camada | Cobertura mínima |
| :-- | :-- |
| unitária | parsers, reducers/state, unidades, preferências e erros |
| protocolo | schema, comandos, faults, reset/dispose e buffers destacados |
| Worker | inicialização, fila, limites, fallback forçado e recovery |
| fluxo | iniciar/pausar/step/reset, seleção, escala, comparação e import/export |
| teclado/a11y | foco, tabs, árvore, live regions, contraste, movimento reduzido e equivalente do canvas |
| persistência | migração, cota, corrupção, recuperação e round-trip |
| E2E | navegador real e Tauri nos ambientes declarados |
| interação 3D | picking e seleção idênticos à árvore/lista |

Pixels não substituem testes de estado/DOM. Testes estruturais não substituem
inspeção visual. Os gates e ambientes estão em [VALIDATION.md](VALIDATION.md).
