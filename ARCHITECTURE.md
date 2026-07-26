# Arquitetura estrutural

Esta arquitetura registra a evolução desde o motor TypeScript da 0.2 até o
núcleo Rust/Wasm iniciado na 0.5. Um módulo só é separado quando passa a ter
estado, ciclo de vida, fronteira de plataforma ou testes próprios.

## Ponto de partida

O baseline promovido da 0.4 tem quatro peças centrais:

- `brain.ts` gera geometria, regiões, tipos de unidade e conexões;
- `simulation.ts` guarda o estado mutável e executa integração, atrasos e STDP;
- `inference.ts` implementa o experimento Bayesiano escalar atual;
- `main.ts` inicializa a aplicação e ainda concentra relógio, cena, renderização, HUD, captura e controles.

Esse baseline permanece temporariamente como oráculo de paridade. A partir da
0.5, `crates/brain-engine` recebe a matemática e `crates/brain-wasm` contém
somente a ABI para o navegador. Nenhuma função nova de cérebro deve ser
implementada primeiro em `simulation.ts`.

## Regras de dependência

```mermaid
flowchart LR
    UI["Interface e captura"] --> IN["Entrada genérica"]
    PERSONAL["Experimento simbólico"] --> IN
    IN --> CLOCK["Relógio e protocolo"]
    CLOCK --> CORE["Núcleo determinístico"]
    TOPO["Topologia e resolução"] --> CORE
    CORE --> SNAP["Snapshots imutáveis"]
    SNAP --> OBS["Observáveis"]
    SNAP --> RENDER["Camadas de render"]
    OBS --> HUD["Instrumentos"]
    RENDER --> FRAME["Frame interpolado"]
```

As dependências seguem oito regras:

1. O núcleo não importa Three.js, DOM, Tauri nem o conteúdo de um experimento.
2. O renderer nunca escreve no estado da simulação.
3. Observáveis leem snapshots ou acumuladores publicados; não alcançam buffers privados do núcleo.
4. Entradas pessoais são convertidas para eventos genéricos antes de cruzarem o protocolo.
5. O relógio de parede decide quantos ticks pedir, mas nunca vira argumento livre de uma equação.
6. `brain-engine` não importa DOM, Web APIs, Tauri, Three.js nem sistema de arquivos.
7. `brain-wasm` adapta erros e buffers, mas não contém equações alternativas.
8. TypeScript não muta estado científico e será removido do laço quente depois da paridade.

## Arquitetura 0.5 · Rust nativo e Wasm

```mermaid
flowchart LR
    PRESET["Preset + eventos"] --> RUST["brain-engine<br/>Rust puro"]
    RUST --> NATIVE["Tauri / testes / lotes"]
    RUST --> ABI["brain-wasm<br/>wasm-bindgen"]
    ABI --> WORKER["Web Worker"]
    WORKER --> SNAP["Snapshot versionado<br/>buffers tipados"]
    SNAP --> SHELL["Shell TypeScript"]
    SHELL --> VIEW["Three.js + abas + HUD"]
```

O mesmo `brain-engine` compila para o host nativo e para
`wasm32-unknown-unknown`. Essa paridade de código-fonte evita manter uma versão
“web” simplificada e outra “científica” nativa.

### Fronteiras

| Fronteira | Formato | Regra |
| :-- | :-- | :-- |
| UI → Worker | comandos versionados | entradas carregam tick e sequência |
| Worker → Wasm | chamadas estreitas e views de memória | sem objeto DOM ou callback de frame |
| engine → snapshot | buffers contíguos + metadados | buffers do núcleo nunca são expostos como mutáveis |
| snapshot → renderer | cópia/transferência ou página de leitura | câmera e LOD não afetam o motor |
| engine → nativo | API Rust | mesma configuração, replay e hashes do Wasm |

O módulo começa serial dentro de um Worker. Threads Wasm e memória
compartilhada só entram atrás de detecção de `crossOriginIsolated`, benchmark e
fusão determinística. O GitHub Pages continua suportado pelo caminho serial.

### Política de linguagem

- **Rust:** modelos, solvers, topologia, RNG, eventos, observáveis, replay e
  validação numérica.
- **TypeScript:** bootstrap do Wasm, protocolo Worker, DOM, acessibilidade e
  renderização até uma migração gráfica ter benefício comprovado.
- **C#:** serviço opcional nativo/offline; nunca integra o laço web e nunca é
  descrito como mecanismo de segurança do cliente.
- **WGSL/WebGPU:** candidato futuro para kernels gráficos ou numéricos
  massivamente paralelos; não substitui validação nem vira requisito da 0.5.

## Estado e tipos

Os tipos abaixo descrevem o wire protocol legado. Na 0.5, seus equivalentes
canônicos vivem em Rust e as declarações TypeScript da ABI devem ser geradas ou
testadas contra a mesma `schemaVersion`.

```ts
type Tick = number;
type EntityId = number;
type SynapseId = number;
type FieldVertexId = number;

interface SimulationConfig {
  seed: number;
  dtSeconds: number;
  snapshotEveryTicks: number;
  model: "lif" | "conductance" | "hybrid";
}

interface ScheduledDrive {
  tick: Tick;
  sequence: number;
  target: EntityId;
  amplitude: number;
  channel: "external" | "task" | "boundary";
}

interface EngineSnapshot {
  schemaVersion: number;
  tick: Tick;
  previousTick: Tick;
  stateHash: number;
  potentials: Float32Array;
  activity: Float32Array;
  field?: FieldSnapshot;
  events: EventSnapshot;
  observables: ObservableSnapshot;
}
```

`Tick`, IDs e índices permanecem inteiros. Valores com unidades diferentes não compartilham um campo chamado apenas `value`; configurações futuras usarão nomes como `dtSeconds`, `membraneVolts` e `conductanceSiemens` quando a unidade não estiver determinada pelo tipo do bloco.

### Donos dos buffers

| Estado | Dono | Pode ser transferido? | Pode ser alterado pelo renderer? |
| :-- | :-- | :-- | :-- |
| potenciais, adaptação e refratariedade | núcleo | não diretamente | não |
| condutâncias e recursos sinápticos | núcleo | não diretamente | não |
| filas de eventos | núcleo | não | não |
| campo E/I | núcleo do campo | somente em snapshot | não |
| snapshot publicado | protocolo | sim | não |
| buffers interpolados de posição/cor | camada de render | não precisa | sim |
| histórico de instrumentos | observáveis/UI | somente sua própria cópia | não se aplica |

Snapshots usam buffers próprios. O Worker alterna dois ou três conjuntos de buffers para que nunca recicle memória ainda utilizada pelo frame atual.

## Laço de simulação

O frame deixa de chamar `simulation.step(delta)`. O relógio converte tempo real em um tick-alvo e envia esse alvo ao motor:

```ts
function onFrame(nowMs: number): void {
  const targetTick = clock.observe(nowMs, speed);
  engine.advanceTo(targetTick);

  const view = snapshots.interpolate(clock.renderTick());
  renderLayers.update(view);
  instruments.update(view.observables);
  composer.render();
}
```

No Worker, o núcleo só conhece passos inteiros:

```ts
function advanceTo(targetTick: Tick): void {
  while (state.tick < targetTick) {
    applyInputsFor(state.tick);
    decayContinuousState();
    deliverEventsInCanonicalOrder();
    integrateUnits();
    registerSpikes();
    updatePlasticity();
    publishIfDue();
    state.tick += 1;
  }
}
```

O relógio possui três políticas explícitas:

- em interação, limita o atraso acumulado e registra quando precisou descartar tempo de parede;
- em captura, nunca descarta ticks e só renderiza depois de atingir o tempo solicitado;
- em replay, ignora o relógio de parede e consome o registro de entradas até o tick final.

A velocidade da interface altera a relação entre tempo real e tick-alvo. Ela não altera `dt` nem as constantes fisiológicas.

## Determinismo

### Entradas

Toda entrada recebe `tick` e `sequence`. A ordenação é `(tick, sequence)`. Controles contínuos são amostrados e registrados como eventos; o núcleo não consulta diretamente o estado atual do DOM.

O replay guarda:

- versão do protocolo;
- configuração validada;
- semente;
- hash da topologia;
- eventos em ordem;
- versão do preset do modelo.

### Números aleatórios

O RNG é baseado em contador:

```text
random(seed, stream, entityId, tick, eventOrdinal) -> uint32
```

O endereço, e não a ordem da chamada, escolhe a amostra. Fluxos distintos
separam topologia, ruído de canal, liberação sináptica e experimentos. A
implementação Rust usa as mesmas operações `u32` com overflow modular do
TypeScript e ambos consomem `fixtures/parity/discrete-v1.json`.

O contrato legado reduz `tick` aos 32 bits baixos antes da avalanche. Isso
repete o endereço depois de `2^32` ticks; a 60 Hz, após mais de dois anos
contínuos. Qualquer ampliação desse endereço exige nova versão de fixture,
protocolo e replay — nunca uma mudança silenciosa.

### Arestas e reduções

A topologia atribui um ID estável a cada sinapse. O CSR de saída é ordenado por `(origem, destino, id)` e o índice de entrada por `(destino, origem, id)`. A implementação Rust rejeita endpoints fora do buffer e produz exatamente os mesmos offsets e IDs do fixture TypeScript.

Na primeira implementação, o laço quente permanece serial. Se houver paralelismo posterior:

- cada sinapse atualiza apenas seu próprio estado;
- cada alvo pertence a uma partição fixa e soma seu CSR de entrada em ordem canônica;
- métricas globais usam blocos fixos e fundem os parciais pela ordem do ID do bloco;
- estruturas como `Promise.race`, atomics de soma e iteração sobre resultados na ordem de chegada não entram no caminho determinístico.

Essa disciplina evita depender da associatividade de ponto flutuante. Igualdade bit a bit é exigida no mesmo runtime e na mesma arquitetura numérica; paridade TypeScript/Rust terá contrato explícito de exatidão ou tolerância por grandeza.

## Protocolo do Worker

O Worker entra antes do paralelismo. Seu objetivo inicial é isolar o laço fixo do frame.

Mensagens de controle:

```ts
type EngineCommand =
  | { type: "initialize"; config: SimulationConfig; topology: SerializedTopology }
  | { type: "schedule"; inputs: ScheduledDrive[] }
  | { type: "advance"; targetTick: Tick }
  | { type: "reset"; seed: number }
  | { type: "dispose" };

type EngineEvent =
  | { type: "ready"; tick: Tick }
  | { type: "snapshot"; snapshot: EngineSnapshot }
  | { type: "profile"; sample: EngineProfile }
  | { type: "fault"; code: string; tick: Tick };
```

Não haverá uma mensagem por spike. Eventos de alta frequência são compactados no snapshot em arrays de IDs, offsets temporais e amplitudes.

## Campo e patches microscópicos

O acoplamento será introduzido em três passos.

### 0.3 — campo derivado

O estado atual de spikes é agregado por região ou por vértice apenas para instrumentos e visualização. Não existe um segundo integrador.

### 0.4 — campo macroscópico

O campo E/I é o estado macroscópico cortical fora de patches. `BrainData`
publica `corticalField`, um grafo CSR simétrico sobre os pontos corticais
externos, com comprimentos de aresta e uma projeção `vertexByNode`. Pontos
corticais internos são associados ao vértice externo mais próximo; cerebelo e
tronco ficam fora do domínio.

`PopulationField` possui os buffers E/I, o histórico circular consumido pelos
atrasos de condução e a composição `waveActivity`. O snapshot do protocolo v2
leva arrays por vértice e `nodeIndices`; o renderer usa a projeção da topologia
e combina campo e spikes pelo envelope máximo. Ele não soma as duas resoluções
como fontes independentes.

O domínio atual é uma aproximação k-NN procedural. Não é uma malha triangular
anatômica, e seus comprimentos euclidianos não são descritos como geodésicas.

### 0.7 — patch resolvido

Um `ResolutionMap` define:

```ts
interface ResolutionMap {
  patchId: number;
  fieldVertices: Uint32Array;
  cells: Uint32Array;
  cellToFieldWeights: Float32Array;
  boundaryWeights: Float32Array;
  blendByVertex: Float32Array;
}
```

O campo alimenta as condições de contorno do patch. A atividade agregada dos spikes substitui o campo dentro da máscara `blendByVertex`. O retorno microscópico para o campo começa desativado; quando ativado, ocorre em janelas de acoplamento e passa por testes de conservação e estabilidade.

Assim, a troca de resolução acompanha o zoom sem fazer a dinâmica depender da câmera. A câmera escolhe o que mostrar, nunca qual equação executar.

## Núcleo genérico e entrada pessoal

O motor recebe drives agendados e expõe canais de leitura. Ele não conhece letras, palavras, gramática ou o significado de uma hipótese.

```ts
interface ExperimentEncoder<Action> {
  reset(seed: number): void;
  encode(action: Action, at: Tick): ScheduledDrive[];
}

interface ExperimentDecoder<Result> {
  read(snapshot: EngineSnapshot): Result;
}
```

O experimento Bayesiano atual continua isolado em `inference.ts` até ser substituído por esse contrato. Na 0.9, uma entrada pessoal poderá morar em `experiments/symbolic-sequence.ts`: ela codifica tokens em drives genéricos e interpreta canais de saída, sem importar nem modificar internamente `simulation.ts`.

Presets guardam parâmetros; adaptadores guardam significado. Essa separação permite executar tarefas perceptivas ou simbólicas sobre o mesmo núcleo e comparar resultados sem ramificações pessoais dentro do motor.

## Observáveis

Os observáveis têm duas classes:

- **online:** baratos, atualizados em blocos durante a simulação, como taxa, corrente média e dispersão;
- **analíticos:** executados em snapshots selecionados ou offline, como homologia persistente, ajuste de avalanches e dimensionalidade em janelas longas.

Cada observável declara:

```ts
interface ObservableDefinition {
  id: string;
  unit: string;
  windowSeconds: number;
  source: "state" | "events" | "currents" | "field";
  cadenceTicks: number;
  approximation?: string;
}
```

O HUD recebe valor e metadados juntos. Um rótulo não pode reutilizar “intensidade” ou “volume” para grandezas fisicamente diferentes.

## Camadas de render

As camadas consomem a mesma visão interpolada:

```ts
interface RenderLayer {
  mount(context: RenderContext, topology: RenderTopology): void;
  update(view: InterpolatedSnapshot): void;
  setDetail(level: number): void;
  setVisible(visible: boolean): void;
  dispose(): void;
}
```

| Ordem | Camada | Fonte permitida |
| :-- | :-- | :-- |
| 1 | tecido e superfície | topologia, materiais e atividade composta |
| 2 | campo macroscópico | snapshot do campo |
| 3 | conectividade | topologia, pesos e atrasos publicados |
| 4 | unidades e microcircuito | snapshot do patch selecionado |
| 5 | eventos | spikes e chegadas sinápticas compactadas |
| 6 | seleção e orientação | estado da interface |
| 7 | instrumentos | observáveis com unidade |
| 8 | pós-processamento | exposição, bloom e preferências visuais |

Pulsos visuais representam eventos reais. Interpolação pode suavizar posição e intensidade, mas não criar spikes entre snapshots. LOD reduz geometria e amostragem visual; não altera o motor.

## Histórico do `src/` e workspace 0.5

### Corte 0.3-a — relógio e contrato

```text
src/
├── main.ts
├── clock.ts
├── protocol.ts
├── simulation.ts
├── brain.ts
├── inference.ts
└── schema.ts
```

`simulation.ts` continua sendo o núcleo. `clock.ts` recebe o acumulador que hoje está em `main.ts`; `protocol.ts` contém comandos, snapshots e entradas. Esse corte já permite testar passo/frame sem mover a cena.

### Corte 0.3-b — memória e isolamento

```text
src/
├── main.ts
├── simulation.worker.ts
├── simulation.ts
├── network.ts
├── random.ts
├── observables.ts
└── ...arquivos existentes
```

`network.ts` serializa a topologia e cria CSR. `random.ts` implementa o RNG endereçado. `simulation.worker.ts` é apenas o adaptador do protocolo. `observables.ts` começa com as métricas online; não incorpora análises topológicas pesadas.

### Corte 0.3-c — renderização com donos claros

O diretório `render/` só nasce quando ao menos três camadas forem extraídas de `main.ts`:

```text
src/render/
├── brain-layer.ts
├── connection-layer.ts
├── event-layer.ts
└── render-types.ts
```

O `main.ts` permanece como composição: cria dependências, liga controles e inicia frame/Worker. Não será substituído por uma classe central que volte a possuir tudo.

### 0.4 em diante

`field.ts` aparece com o primeiro estado populacional real. Um diretório `models/` só se justifica quando LIF, campo e AdEx coexistirem. Da mesma forma, `experiments/` nasce quando houver mais de uma tarefa. A organização segue a diversidade real do código.

### Workspace a partir da 0.5

```text
.
├── Cargo.toml                  # workspace e políticas comuns
├── crates/
│   ├── brain-engine/           # Rust puro, nativo + Wasm
│   └── brain-wasm/             # ABI wasm-bindgen
├── src/                        # shell e oráculo TS temporário
├── src-tauri/                  # host desktop
└── scripts/                    # captura e artefatos reproduzíveis
```

`src-tauri` passa a consumir `brain-engine` quando o engine nativo substituir a
ponte informativa atual. O `Cargo.lock` único fica na raiz do workspace.

## Sequência de migração 0.5

1. Manter os vetores e replays da 0.4 congelados como oráculo.
2. Fixar tipos Rust de camada, tick, unidade, configuração, erro e snapshot.
3. Portar relógio e RNG com igualdade exata.
4. Portar CSR/topologia e comparar IDs, offsets e hashes.
5. Portar campo e sinapses por blocos com convergência por grandeza.
6. Gerar bindings Wasm e carregar o engine no Worker existente.
7. Rodar TS e Rust em modo sombra, sem renderizar duas atividades.
8. Promover Rust/Wasm quando paridade, memória e latência passarem.
9. Remover equações TypeScript e conservar somente o shell/protocolo.

Cada corte deve ser reversível e publicar qual parte ainda depende do oráculo.
Uma nova função fisiológica não entra enquanto o mesmo subsistema estiver
duplicado e sem paridade.

## Comentários e documentação

Comentários de código explicam unidade, invariante, escolha numérica ou motivo não evidente. Eles não narram a edição, repetem a linha seguinte nem registram ferramentas usadas para produzir o arquivo. Decisões mais longas pertencem a estes documentos ou a um registro técnico próprio.

Arquivos gerados, licenças, atribuições e referências científicas preservam seus avisos originais. A revisão editorial remove metalinguagem do processo sem fabricar autoria ou apagar procedência.
