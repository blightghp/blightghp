# Especificação do motor · BRAIN PRO

**Revisão:** 3 · produto 0.9.0 · ABI/snapshot 7

Este é o manual de implementação do motor científico e de sua fronteira de
execução. A matemática pertence a [MODEL_SPEC.md](MODEL_SPEC.md); este documento
define ownership, ordem, memória, falha, ABI e procedimento de evolução.

## Requisitos normativos

| ID | Requisito |
| :-- | :-- |
| ENG-001 | `brain-engine` não depende de DOM, Web APIs, Tauri, Three.js, rede ou filesystem. |
| ENG-002 | toda equação científica executável tem uma única implementação Rust. |
| ENG-003 | estado mutável pertence ao subsistema que preserva seus invariantes. |
| ENG-004 | avanço científico usa tick inteiro e passo/preset explícito. |
| ENG-005 | falha de um intervalo composto não publica estado parcial. |
| ENG-006 | RNG, eventos, reduções, IDs e serialização têm ordem canônica. |
| ENG-007 | snapshots não expõem buffers internos mutáveis. |
| ENG-008 | `f64` interno e quantização `f32` precisam de contrato por bloco. |
| ENG-009 | hashes são detectores de regressão, não autenticação criptográfica. |
| ENG-010 | renderer/FPS/LOD nunca alteram solver ou `dt`. |
| ENG-019 | perfil de material, iluminação, textura, clipping e pós-processamento nunca entram em comando, snapshot, replay ou hash científico. |
| ABI-001 | protocolo, ABI e snapshot são eixos distintos, ainda que hoje valham 7. |
| ABI-002 | mudança de layout, unidade, ordem ou significado exige decisão de compatibilidade. |
| ABI-003 | arrays paralelos têm comprimento/ordem validados antes do uso. |
| ABI-004 | campos frequentes são compactados; não há mensagem por spike. |
| WRK-001 | comandos são processados em ordem e limitados por recursos. |
| WRK-002 | fallback permanece inerte e anuncia degradação. |
| WRK-003 | filas têm backpressure explícito; cancelamento e timeout entram antes de importações/lotes longos. |

## Organização e direção de dependências

```text
brain-engine
├── tipos e contratos puros
├── kernels/subsistemas
├── NeuralSimulation (composição)
└── testes, exemplos e fixtures
        ↑
brain-wasm (adaptação wasm-bindgen)
        ↑
WasmEngineHost + Web Worker + protocolo TypeScript
        ↑
aplicação e renderer somente leitura
```

| Módulo Rust | Dono do estado/comportamento |
| :-- | :-- |
| `clock` | ticks seguros e agendamento temporal |
| `random` | RNG endereçado |
| `network` | CSR canônico |
| `input_queue` | entradas ordenadas por `(tick, sequence)` |
| `field` | campo E/I, histórico atrasado e projeção |
| `lib` | contrato laminar L1–L6 |
| `corticothalamic` | relé, TRN, rebote e atrasos |
| `cell_patch` | 12 células AdEx, dendrito passivo, quatro correntes e origem dos spikes carimbados |
| `chemical_contract` | frações, ledgers de massa/carga e tolerâncias |
| `short_term_plasticity` | `R`, `u`, `g` e ordem de liberação |
| `cleft_occupancy` | fenda, concentração, ligação, ocupação e remoção |
| `chemical_solver` | composição Strang, adaptação e atomicidade |
| `chemical_track` | microdomínio químico integrado e hash público |
| `observables` | leituras baratas que não realimentam por padrão |
| `simulation` | composição, tick global, lote de eventos, snapshot e hashes |

Dependências permitidas apontam de composição para kernels e de kernels para
tipos/contratos. `brain-wasm` depende do engine; o engine nunca depende do
adaptador. Estado global fora de `NeuralSimulation` é proibido.

## Configuração, presets e erros

- configuração é validada antes de alocar estruturas grandes;
- presets nomeiam pergunta, schema, parâmetros, fontes e regime;
- erro distingue valor não finito, fora de envelope, overflow, regressão de
  tick, topologia inválida, orçamento esgotado e falha de solver;
- clamps só implementam parte declarada do modelo; não corrigem conservação ou
  escondem instabilidade;
- reset restaura estado, filas, cursores, acumuladores e hashes coerentes;
- serialização futura inclui versão de preset, modelo, ABI e fixture, sem usar
  somente a versão do produto.

## Tempo

| Conceito | Contrato atual |
| :-- | :-- |
| tick científico | inteiro seguro; passo macro padrão `1/60 s` |
| subpasso celular | `1/12000 s`, 200 por tick macro |
| subpasso químico | adaptativo, máximo de preset e exposição `χ` |
| tempo físico | derivado de tick/passo ou relógio próprio do solver |
| tempo de parede | observado somente pelo `FixedStepClock` do shell |
| snapshot | publicado segundo cadência; não define integração |
| frame | interpola snapshots; não gera evento |
| replay | ignora parede e consome entradas ordenadas |
| captura | avança ticks exatos e só desenha depois do alvo |

Modo interativo pode descartar atraso de parede e registrar o descarte; não
pode aumentar `dt`. Mudar velocidade altera quantos ticks são solicitados por
segundo real. Trocar preset científico é operação explícita, versionada e pode
exigir reset.

## Estado e memória

### Política numérica

- estados/integração novos: `f64` salvo justificativa medida;
- índices, IDs e ticks: inteiros com conversão verificada;
- snapshots gráficos legados: `f32` por contrato e teste de quantização;
- química v6: `f64` em `Float64Array` para preservar o contrato publicado;
- SoA é preferível para kernels e transferência; AoS somente quando ownership
  e acesso justificarem;
- alinhamento/SIMD só após benchmark e sem alterar ordem numérica silenciosa.

### Layout publicado v7

| Bloco | Buffers |
| :-- | :-- |
| rede | `potentials`, `activations`, `weights` |
| sinais | IDs, progresso, força, inibitório |
| campo | IDs de nós, E, I, atividade composta |
| coluna | E e I L1–L6 |
| patch | tipo, soma, dendrito, adaptação, AMPA, NMDA, GABA-A, GABA-B, spike |
| eventos celulares | IDs `u32` e offsets temporais `f64` |
| química | índice de evento, contagem de spikes, R, u, última liberação, tempo da última liberação, liberação total, mol na fenda, concentração, mol ligado, ocupação, remoção |

Total: 36 `ArrayBuffer`s. Escalares e diagnósticos não fazem parte da contagem.
Cada ordem canônica é fixa: transmissores `[glutamato, GABA]`; receptores
`[AMPA, NMDA, GABA-A, GABA-B]`; lâminas L1–L6; eventos celulares por
`(timeOffsetSeconds, cellId)`.

O lote celular schema 1 cobre `[startTick,endTick]`, admite vazio e contém no
máximo 4.096 pares. Cada evento ocupa 12 bytes, totalizando teto de 49.152 bytes
nos dois buffers. O hash próprio inclui schema, intervalo, tamanho, IDs e bits
`f64` dos offsets. O renderer só marca IDs publicados; não reconstrói eventos.

### Vida útil

1. Rust possui buffers privados.
2. `brain-wasm` devolve arrays para o host.
3. host monta `NeuralSnapshot` e cria a transfer list.
4. `postMessage` transfere ownership dos buffers.
5. thread principal mantém atual/anterior para interpolação.
6. renderer lê; nunca escreve.

Pooling/duplo buffer ainda não foi comprovado. Qualquer reciclagem deve impedir
reuso enquanto um frame ou auditoria possuir referência.

## Determinismo

### RNG e endereços

`random(seed, stream, entity, tick, ordinal)` escolhe a amostra. O tick é
reduzido aos 32 bits baixos por compatibilidade; a repetição após `2^32` ticks é
limitação conhecida. Corrigir exige novo fixture e decisão de replay.

### Ordem canônica

- entradas: `(tick, sequence)`;
- CSR de saída: `(origem, destino, id)`;
- CSR de entrada: `(destino, origem, id)`;
- eventos celulares simultâneos: offset crescente e `cellId` crescente no empate;
- redução futura paralela: partições fixas e fusão por ID do bloco;
- operações químicas: sequência palindrômica publicada;
- aleatoriedade nunca depende da ordem física das chamadas.

### Hash e replay

Os hashes atuais cobrem rede, circuito, patch, química e eventos celulares
separadamente. Hash
inclui schema/configuração relevante ao domínio. Compatibilidade v5 exige que
os três hashes anteriores permaneçam exatos ao acrescentar química v6.

Igualdade bit a bit vale no runtime/plataforma declarados e nos fixtures que a
exigem. Paridade cross-platform usa `libm::exp` no domínio químico já congelado.
Outros modelos devem declarar exatidão ou tolerância por grandeza.

## Solvers atuais

| Solver | Estado/entrada/saída | Método/passo | Invariantes/falha | Evidência |
| :-- | :-- | :-- | :-- | :-- |
| rede abstrata | potenciais, traços, pesos e estímulo | tick macro serial | finito, pesos limitados, ordem | replay sombra/campo |
| campo E/I | E/I + histórico/impulsos | decaimento exato + propagação explícita atrasada | `[0,u_max]`, topologia válida | fixture/convergência |
| laminar | E/I L1–L6 + drives | relaxação exponencial por tick | `[0,1]`, vias permitidas | testes de contrato |
| córtico-talâmico | relé/TRN/rebote + atrasos | relaxação exponencial | `[0,1]`, atraso≤4096 | controle de laço |
| AdEx | soma/dendrito/adaptação/correntes | subpasso fixo 83,3 µs + evento/reset | finito, limites, orçamento | replay/convergência/ensemble |
| STP | `R,u,g` + evento | soluções exponenciais exatas | frações/condutância não negativas | fixture v1 |
| fenda/ocupação | mol/concentração/ocupação | mapas exponenciais atômicos | massa, seletividade, positividade | fixture v1 |
| químico | fenda + intervalo | Strang 12 transições, `h` adaptativo por `χ` | atomicidade, massa, ocupação | fixture/convergência |

Cada novo solver declara rigidez, estabilidade, referência, erro aceitável,
orçamento de subpassos, instrumentação e rollback de passo. Permanecer finito
não basta para promoção.

## ABI e compatibilidade

Incrementar o eixo aplicável quando ocorrer:

- novo/removido/reordenado buffer ou campo;
- mudança de tipo, unidade, domínio, optionalidade ou semântica;
- novo comando/evento incompatível;
- alteração de hash/replay;
- mudança de limites que invalida consumidor.

Adições compatíveis futuras podem usar campos opcionais e feature negotiation;
hoje a inicialização exige igualdade `schema_version() == 7`. Depreciação deve
ter janela, teste de consumidor antigo e rollback. Nenhum fallback reinterpreta
um campo desconhecido.

Erros cruzam a fronteira como código fechado e mensagem segura. Payloads
malformados, arrays divergentes e contadores acima de `Number.MAX_SAFE_INTEGER`
são rejeitados antes da apresentação.

O comando interativo `advance` recebe somente `DirectNeuralStimulus`, com
intensidade finita em `[0,1]` e contexto literal zero. Modelos de tarefa podem
produzir observáveis no shell, mas não reutilizam esse campo para influenciar o
motor. Entradas futuras contextualizadas exigem comando, versão e replay
explícitos; a fila agendada existente continua reservada a replays endereçados.

## Worker

### Estado atual

- inicialização lazy do módulo Wasm;
- fila Promise serial;
- cotas duplicadas no host/adaptador;
- transfer list de 36 buffers;
- no máximo 64 mensagens pendentes; a seguinte recebe `worker-backpressure`;
- reset com possível regeneração da topologia;
- dispose libera Wasm;
- fallback inerte em falha de inicialização.

### Lacunas obrigatórias antes de escalar

- cancelamento de avanço/lote que ainda não iniciou;
- timeout distinto de falha numérica;
- códigos de fault por versão, recurso, input, solver e runtime;
- diagnóstico de fila/bytes/reciclagem;
- teste forçado do fallback no navegador publicado;
- negociação de features/capacidades.

Retries só são permitidos para operações idempotentes e nunca repetem um evento
sem endereço único. `reset`/`dispose` devem drenar ou invalidar comandos antigos.

## Execução nativa

O mesmo `brain-engine` deve servir:

- testes e geradores de fixtures;
- benchmarks nativos;
- futuro runner CLI/headless;
- Tauri para lotes/arquivos locais;
- eventual serviço remoto Rust.

O host Tauri atual só expõe metadados; não é runner científico completo. Um
runner futuro recebe preset/seed/replay e produz checkpoints/hashes/relatório,
sem importar UI. C# ou outro serviço chama esse contrato ou consome artefatos;
nunca reimplementa equações.

## Procedimento para nova funcionalidade

- [ ] registrar pergunta, classe epistemológica, variáveis, unidades e fonte em MODEL_SPEC;
- [ ] definir estado, proprietário, configuração, limites e erros Rust;
- [ ] escolher método, referência, erro, invariantes e atomicidade;
- [ ] implementar kernel sem dependências proibidas;
- [ ] criar testes unitários, propriedades e convergência;
- [ ] gerar fixture/replay auditável e congelar versão;
- [ ] decidir hash: preservar, estender domínio ou criar novo;
- [ ] estimar memória/CPU e testar primeiro valor acima das cotas;
- [ ] alterar ABI/snapshot somente após o contrato nativo passar;
- [ ] atualizar protocolo/host/Worker, transfer list e fallback inerte;
- [ ] publicar metadados/unidades para frontend;
- [ ] autorizar visual `STATE` e equivalente textual;
- [ ] executar gates de VALIDATION e produzir evidência de promoção;
- [ ] documentar rollback e compatibilidade.

## Pseudocódigo normativo

### Inicialização

```text
validate(config, topology, quotas)
allocate candidate subsystems
verify schemas and canonical orders
commit NeuralSimulation(candidate)
publish ready(schema, capabilities)
```

### Avanço

```text
require current_tick <= target_tick <= current_tick + quota
while tick < target_tick:
  inputs = drain(tick + 1, sequence order)
  candidate = clone_or_transaction(state)
  candidate.apply(inputs)
  candidate.advance_subsystems_in_declared_order()
  candidate.verify_invariants()
  commit(candidate)
  tick += 1
return immutable_snapshot()
```

### Evento e snapshot

```text
event_address = (tick, sequence, entity, ordinal)
reject duplicate or past address
apply event in canonical phase order
append to bounded compact event block
when cadence authorizes:
  quantize only declared blocks
  compute independent hashes
  copy/views into snapshot-owned arrays
  publish metadata + arrays
```

### Rollback atômico

```text
candidate = copy(current)
result = candidate.advance(interval)
if result exceeds budget or violates invariant:
  discard(candidate)
  return typed error
current = candidate
```

### Atualização da ABI

```text
freeze native contract and fixture
classify compatibility axis
increment schema if required
add Rust getters -> generated bindings -> TS type
validate lengths, units, order and safe integer conversions
extend transfer list, fallback, tests and replay
reject old/new mismatch at initialize
```

### Consumo pelo frontend

```text
receive snapshot(schema == supported)
store current and previous as read-only
derive UI labels with explicit units
interpolate continuous published values only
render events only from published event records
never write back into snapshot arrays
```

### Fronteira da futura materialidade 3D

O motor não recebe conhecimento de PBR, normal map, SSS, transmissão, luz ou
película visual. A futura fabricação gráfica reutiliza IDs e bindings já
publicados e deve demonstrar os mesmos cinco hashes antes/depois de cada troca de
perfil. Se uma aparência exigir espessura, compartimento, condução, concentração
ou evento ainda ausente, primeiro entra um modelo e uma ABI próprios; o renderer
não pode preencher essa lacuna.

Os critérios de prova e promoção estão em [VALIDATION.md](VALIDATION.md).
