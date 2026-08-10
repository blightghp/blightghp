# Arquitetura de aprendizagem · BRAIN PRO [v. 0.7.0]

Uso este documento para aprender a decompor um sistema Rust sem esconder as
decisões que ainda estou amadurecendo. Ele registra a evolução desde o motor
TypeScript da 0.2 até o núcleo Rust/Wasm e a leitura laminar da 0.6. Um módulo só
é separado quando consigo explicar seu estado, ciclo de vida, fronteira ou teste.

## Baseline histórico e estado promovido

O baseline promovido da 0.4 tinha quatro peças centrais:

- `brain.ts` gera geometria, regiões, tipos de unidade e conexões;
- `simulation.ts` guardava o estado mutável e executava integração, atrasos e STDP;
- `inference.ts` implementa o experimento Bayesiano escalar atual;
- `main.ts` inicializa a aplicação e ainda concentra relógio, cena, renderização, HUD, captura e controles.

Esse baseline foi usado como oráculo no replay sombra e removido depois da
promoção. `crates/brain-engine` possui a matemática e `crates/brain-wasm`
contém somente a ABI para o navegador. `src/` contém shell, topologia visual,
protocolo e Worker, sem um integrador científico alternativo.

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

## Arquitetura 0.6 · Rust nativo, Wasm e estado laminar

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

O contrato laminar usa IDs estáveis L1–L6 e uma matriz `[alvo][origem]`.
Classificação e ganho canônico são funções separadas: a primeira decide se a
via pertence ao modelo; a segunda fornece somente o preset didático atual.
Assim, trocar um número não cria silenciosamente uma nova hipótese anatômica.

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

### Fronteira química da 0.8

`brain_engine::chemical_contract` é o contrato puro entre o patch 0.7 e a
dinâmica sináptica. `brain_engine::short_term_plasticity` é o primeiro consumidor
temporal desse contrato. Nenhum dos dois participa ainda do laço publicado nem
altera a ABI v5 ou seus três hashes.

| Grandeza | Tipo/estrutura | Unidade | Dono |
| :-- | :-- | :-- | :-- |
| recurso disponível `R` | `UnitFraction` | adimensional `[0,1]` | sinapse |
| utilização `u` | `UnitFraction` | adimensional `[0,1]` | sinapse |
| capacidade e liberação | `VesicularResourceContract` | mol | sinapse |
| estado temporal `R,u,g` | `ShortTermPlasticity` | fração, s, S | sinapse |
| configuração temporal | `ShortTermPlasticityConfig` | fração, s, mol, S | preset |
| evento auditável | `PresynapticReleaseEvent` | fração, mol, S | replay/instrumento |
| estoques químicos | `TransmitterMassLedger` | mol equivalente | solver químico |
| carga transmembrana | `MembraneChargeTransfer` | C | integrador celular |
| tolerância de massa | `ConservationTolerance` | mol absoluto + fração relativa | experimento |

O contrato calcula `uR` sem mutar o recurso. A dinâmica 0.8-b avança entre
instantes por exponenciais exatas e aplica quatro fases públicas e ordenadas:
liberação pelo estado pré-evento, incremento da condutância, depleção e
facilitação para o evento seguinte. Cada snapshot possui hash FNV-1a e versão de
schema; o fixture `short-term-plasticity-v1.json` fixa o replay bit a bit. Massa
química e carga elétrica não compartilham acumulador nem conversão implícita.

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

Na implementação 0.6, `DeterministicInputQueue<T>` usa um `BTreeMap` com chave
`InputAddress`, rejeita endereços duplicados ou passados e limita a fila a 4.096
entradas. O adaptador Wasm expõe estímulo e plasticidade como payloads tipados;
o host converte também o comando interativo compatível nas sequências reservadas
0 e 1. Replays explícitos começam em 2, têm no máximo 256 entradas por mensagem
e compartilham a cota total de 4.096.

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

Na ABI v5, o snapshot preserva o bloco córtico-talâmico da v4 e acrescenta um
bloco de patch celular. O bloco laminar mantém dois
`Float32Array` de seis posições para E/I, cinco escalares de relé/TRN/retorno e
um hash próprio. O patch publica nove arrays de doze posições — tipo, soma,
dendrito, adaptação, quatro correntes receptoras e eventos — além de taxa, razão
E/I, primeiro spike, vértice, blend e hash. O hash legado da rede 0.5 não
incorpora esses blocos; assim, o
replay sombra continua verificando exatamente o baseline promovido enquanto o
novo circuito e o patch ganham provas separadas de determinismo.

Vinte e dois buffers são transferidos ao thread de apresentação. Antes da
construção, o host limita nós, sinapses, vértices e arestas;
o adaptador Rust repete as cotas. Cada comando avança no máximo 600 ticks para
que uma única mensagem não monopolize o Worker. O fallback diagnóstico publica
buffers laminares/celulares zerados e nunca substitui o circuito por equações
TypeScript.

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
  | { type: "fault"; code: string; tick: Tick };
```

O perfil não atravessa a ABI científica: `RuntimeProfiler` mede no shell a
latência de ida e volta do Worker, o custo de CPU do frame, contadores acumulados
do renderer, heap quando disponível e bytes dos 22 buffers. A cadência
configurável decide quando pedir o próximo snapshot, sem mudar o tick do motor.

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
atrasos de condução e a composição `waveActivity`. O snapshot do protocolo v3
leva arrays por vértice e `nodeIndices`; o renderer usa a projeção da topologia
e combina campo e spikes pelo envelope máximo. Ele não soma as duas resoluções
como fontes independentes.

O domínio atual é uma aproximação k-NN procedural. Não é uma malha triangular
anatômica, e seus comprimentos euclidianos não são descritos como geodésicas.

### 0.5-c2 — espelho Rust validado

`brain-engine::PopulationField` reproduz o contrato 0.4 sem importar tipos web:
CSR de vértices, projeção nó→vértice, pesos de kernel normalizados, atraso
`u16`, histórico circular, buffers E/I e `wave_activity`. Parâmetros e
integração permanecem em `f64`; toda escrita de estado publicado é quantizada
explicitamente em `f32`, como ocorre nos `Float32Array` do oráculo.

`fixtures/parity/field-observables-v1.json` contém topologia mínima, sequência
de spikes, snapshots e observáveis. O gerador executa o TypeScript 0.4; os
testes Cargo consomem o mesmo artefato. A validação da topologia ocorre na
construção, não no laço quente.

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

O preset `learning_patch` mapeia doze células para o primeiro vértice com pesos
`1/12`, peso de contorno 1 e blend 1. A validação rejeita comprimentos divergentes,
IDs fora da sequência, números não finitos e pesos não conservativos. O campo
alimenta uma corrente de contorno limitada; a atividade agregada dos spikes
substitui o campo dentro da máscara `blendByVertex`. O retorno microscópico para
o campo permanece desativado na 0.7 e só poderá entrar em janelas explícitas,
depois de testes de conservação e estabilidade.

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

Na 0.5-c2, `mean_absolute_weight` e `PopulationFiringRate` já existem no
`brain-engine` e reproduzem o fixture do oráculo. Eles ainda não alimentam o
HUD: essa troca pertence ao replay sombra e ao Worker, para não promover uma
implementação apenas porque os valores unitários coincidem.

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

Na 0.8-v3, `CellRenderLayer` mantém a convenção publicada pelo motor
`g·(E_rev − V)`: corrente positiva é despolarizante e corrente negativa é
hiperpolarizante. O halo elétrico codifica direção tanto por matiz quanto pelo
plano do toro. A condição de shunt é derivada da corrente GABA-A e do potencial
dendrítico publicados, recuperando a condutância pela mesma equação; não existe
estado químico inventado no renderer.

Na 0.8-v4, `window.__BRAIN_ENGINE__.visualAudit()` expõe somente evidência de
apresentação: contagem de proveniência, erro da rampa invertível e codificações
redundantes. `profile()` acrescenta navegador, hardware WebGL, preset, contagens
da topologia e passo fixo. Nenhum desses relatórios escreve no motor ou participa
do hash da simulação.

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

Historicamente, `simulation.ts` era o núcleo. `clock.ts` recebeu o acumulador e
`protocol.ts` passou a conter comandos, snapshots e entradas.

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

Nesse corte histórico, `network.ts` serializava a topologia, `random.ts`
implementava o RNG endereçado e `observables.ts` mantinha métricas online.

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

`field.ts` apareceu com o primeiro estado populacional real e foi removido após
a promoção de sua implementação Rust. Um diretório `models/` só se justifica
quando LIF, campo e AdEx coexistirem no motor.

### Workspace a partir da 0.5

```text
.
├── Cargo.toml                  # workspace e políticas comuns
├── crates/
│   ├── brain-engine/           # Rust puro, nativo + Wasm
│   └── brain-wasm/             # ABI wasm-bindgen
├── src/                        # shell TS, Worker, protocolo e ABI gerada
├── src-tauri/                  # host desktop
└── scripts/                    # captura e artefatos reproduzíveis
```

`src-tauri` já consome o schema de `brain-engine`; a execução científica nativa
completa entra quando o desktop precisar operar sem o shell web. O `Cargo.lock`
único fica na raiz do workspace.

## Sequência concluída da migração 0.5

1. [x] Manter os vetores e replays da 0.4 congelados como oráculo.
2. [x] Fixar tipos Rust de camada, tick, unidade, configuração, erro e snapshot.
3. [x] Portar relógio e RNG com igualdade exata.
4. [x] Portar CSR/topologia e comparar IDs, offsets e hashes.
5. [x] Portar campo e sinapses por blocos com convergência por grandeza.
6. [x] Gerar bindings Wasm e carregar o engine no Worker.
7. [x] Rodar TS e Rust em replay sombra, sem renderizar duas atividades.
8. [x] Promover Rust/Wasm após paridade, custo e teste em navegador.
9. [x] Remover equações TypeScript e conservar somente o shell/protocolo.

Cada corte deve ser reversível e publicar qual parte ainda depende do oráculo.
Uma nova função fisiológica não entra enquanto o mesmo subsistema estiver
duplicado e sem paridade.

## Comentários e documentação

Comentários de código explicam unidade, invariante, escolha numérica ou motivo não evidente. Eles não narram a edição, repetem a linha seguinte nem registram ferramentas usadas para produzir o arquivo. Decisões mais longas pertencem a estes documentos ou a um registro técnico próprio.

Arquivos gerados, licenças, atribuições e referências científicas preservam seus avisos originais. A revisão editorial remove metalinguagem do processo sem fabricar autoria ou apagar procedência.
