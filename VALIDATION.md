# Estratégia de validação · BRAIN PRO [v. 0.7.0]

Enquanto aprendo Rust e cálculo numérico, separo quatro perguntas: meu cálculo é
reproduzível, respeita limites, converge e produz o fenômeno definido pelo
experimento? Uma única comparação de snapshot não responde às quatro.

## Camadas de evidência

### 1. Exatidão

Aplicável a operações discretas cujo resultado deve ser idêntico:

- vetores `uint32` do RNG para endereços conhecidos;
- conversão entre tempo de parede, tick e tick de apresentação;
- ordenação de entradas e eventos com empate;
- construção do CSR e IDs estáveis de sinapse;
- serialização, versão e hash de topologia;
- reset completo e replay de pequenos circuitos sem ruído;
- paridade antes/depois do Worker no mesmo runtime.

Esses testes usam igualdade exata. Não devem depender de um snapshot de toda a rede quando uma tabela pequena revela melhor a regra quebrada.

### 2. Invariantes

Aplicável a propriedades que precisam valer em toda execução:

- nenhum estado finito produz `NaN` ou infinito;
- refratariedade e atrasos nunca são negativos;
- pesos permanecem no intervalo do preset;
- condutâncias são não negativas;
- recursos sinápticos permanecem entre zero e um;
- liberação determinística `uR` nunca excede o recurso disponível;
- a soma dos cinco estoques de transmissor preserva mol equivalente dentro das tolerâncias declaradas;
- toda carga que entra pela membrana sai do compartimento extracelular com mesmo módulo;
- probabilidades permanecem normalizadas;
- IDs e offsets de CSR ficam dentro dos buffers;
- um patch não duplica a contribuição do campo na mesma máscara;
- observáveis declaram unidade e janela;
- o renderer não altera o hash do estado do motor.

Testes de propriedade devem gerar redes pequenas e sementes variadas para exercitar esses limites.

### Contrato químico antes da dinâmica

O gate do 0.8-a é estrutural e roda sem solver:

| Teste | Critério |
| :-- | :-- |
| intervalo | aceita `R,u = 0` e `1`; rejeita o primeiro `f64` acima de `1`, negativos, `NaN` e infinito |
| significado de `uR` | o resultado é fração e mol liberados; nunca é consumido como probabilidade |
| massa | transferir quantidade entre vesícula, fenda, ligado, recapturado e degradado não altera a soma |
| dupla contagem | acrescentar a mesma massa em dois estoques falha no primeiro balanço |
| carga | deltas intra e extracelular são finitos, opostos e expressos em C |
| separação | nenhum teste ou API converte mol de transmissor diretamente em carga |

As tolerâncias absoluta e relativa fazem parte do experimento e aparecem no
relatório. Um clamp que esconda massa negativa ou ajuste o total depois do passo
não satisfaz este gate.

### Dinâmica determinística da 0.8-b

O gate temporal roda isolado da ABI e usa o oráculo versionado
`fixtures/replay/short-term-plasticity-v1.json`:

| Teste | Critério |
| :-- | :-- |
| ordem do evento | primeiro calcula `u⁻R⁻`, incrementa `g`, depleta `R` e só então facilita `u` para o próximo evento |
| primeiro evento | começa em `R=1`, `u=U`, `g=0`; a facilitação não retroage sobre a própria liberação |
| entre eventos | recuperação de `R`, retorno de `u` a `U` e decaimento de `g` coincidem bit a bit com as exponenciais declaradas |
| resposta pareada | presets declarados podem produzir facilitação ou depressão sem trocar de equação |
| positividade | 20.000 eventos mantêm `R,u ∈ [0,1]`, `g ≥ 0` e estado finito sem clamp corretivo |
| determinismo | duas instâncias recebem os mesmos instantes e produzem eventos e hashes idênticos |
| replay | sete eventos e um checkpoint de relaxação reproduzem todos os campos `f64` e hashes do fixture bit a bit |
| compatibilidade | os oráculos e três hashes publicados pela ABI v5 permanecem inalterados após a promoção v6 |

O gerador auditável do oráculo é
`crates/brain-engine/examples/short_term_plasticity_fixture.rs`; o consumidor
independente está em
`crates/brain-engine/tests/short_term_plasticity_replay.rs`.

### Fenda e ocupação da 0.8-c

O gate químico local usa o oráculo
`fixtures/replay/cleft-occupancy-v1.json` e mantém a ABI fora do escopo:

| Teste | Critério |
| :-- | :-- |
| buffers | concentração por transmissor, ocupação por receptor, matéria ligada e remoção nunca compartilham o mesmo campo |
| seletividade | AMPA/NMDA ligam somente glutamato; GABA-A/GABA-B ligam somente GABA |
| limpeza | o decaimento coincide bit a bit com a solução exponencial e a diferença entra no estoque recuperado |
| ligação | `O_r` permanece em `[0,1]`; ganho e perda de matéria ligada têm transferência oposta na fenda correta |
| atomicidade | demanda de ligação acima da matéria disponível falha sem alterar operação, buffers ou hash |
| conservação | fenda + ligado + removido reproduz a liberação acumulada separadamente para glutamato e GABA |
| treino longo | 15.000 operações permanecem finitas, positivas, conservativas e idênticas em duas instâncias |
| replay | dez operações reproduzem quatro checkpoints, todos os `f64` e hashes bit a bit |
| separação de fases | nenhuma API da 0.8-c escolhe a ordem global do solver nem publica efeito funcional |

O gerador está em `crates/brain-engine/examples/cleft_occupancy_fixture.rs` e o
consumidor em `crates/brain-engine/tests/cleft_occupancy_replay.rs`.

### Solver e rigidez da 0.8-d

O gate composto usa `fixtures/replay/chemical-solver-v1.json`:

| Teste | Critério |
| :-- | :-- |
| ordem | cada subpasso executa as 12 transições da sequência Strang palindrômica declarada |
| positividade | somente mapas exponenciais positivos são compostos; não existe fallback Euler explícito |
| rigidez | `taxa_max × h` observado na entrada de cada subpasso nunca excede `χ_max` |
| adaptação | uma liberação de glutamato força mais subpassos do que o teto temporal nominal quando a exposição exige |
| orçamento | exceder o máximo de subpassos rejeita o intervalo inteiro e preserva snapshot e hash anteriores |
| conservação | treino longo com fontes alternadas mantém massa por transmissor e ocupação em `[0,1]` |
| determinismo | duas instâncias produzem relatórios, buffers e hashes idênticos em 500 intervalos |
| portabilidade | `libm::exp` reproduz os mesmos fixtures químicos em Windows e Linux |
| convergência | erros de `1`, `0,5` e `0,25 ms` caem monotonicamente contra a referência de `0,03125 ms` |
| replay | cinco operações reproduzem tempo, subpassos, exposição, todos os buffers e dois hashes bit a bit |
| compatibilidade | os fixtures do solver permanecem bit a bit idênticos quando o estado passa a ser publicado pela ABI v6 |

O gerador é `crates/brain-engine/examples/chemical_solver_fixture.rs`; o replay
independente está em `crates/brain-engine/tests/chemical_solver_replay.rs`.

### 3. Convergência numérica

O passo temporal será escolhido por evidência. Para cada modelo, roda-se um circuito de referência com uma sequência de passos progressivamente menores. A comparação inclui:

- erro em potencial sub-limiar;
- tempo do primeiro spike e distância entre eventos pareados;
- taxa de disparo por janela;
- pico e integral de corrente sináptica;
- erro de fase e velocidade de onda no campo;
- estabilidade do acoplamento campo/patch.

O menor passo serve de referência apenas depois de também demonstrar convergência. O valor adotado é o maior passo que respeita o orçamento de erro registrado para o preset. AdEx e condutâncias não recebem automaticamente `dt = 0,1 ms`; o integrador, a rigidez e a calibração decidem.

Euler exponencial pode tratar decaimentos lineares de forma eficiente, mas não elimina a necessidade de detectar o evento do termo exponencial do AdEx nem de testar a região próxima do limiar.

### 4. Evidência estatística

Fenômenos emergentes são avaliados em ensembles de sementes e registros de entrada. Cada cenário define previamente:

- população de sementes;
- duração de aquecimento e observação;
- estimador e intervalo esperado;
- tolerância ou intervalo de confiança;
- regra para falhas ocasionais;
- modelo nulo ou alternativa relevante.

Taxa média, variabilidade, retenção, decisão e espectro entram nessa camada. Um único snapshot semeado não é teste estatístico.

Criticalidade não é uma meta de ajuste. Análises de avalanche devem comparar distribuições alternativas, controlar limiar, binning, tamanho finito e subamostragem e relatar incerteza. Expoente próximo de `-3/2` ou razão de ramificação próxima de um não aprovam uma versão isoladamente.

## Testes do acoplamento campo/spikes

| Teste | Critério |
| :-- | :-- |
| agregação | spikes conhecidos produzem a taxa esperada por vértice |
| máscara | pesos macro e micro somam um em cada vértice apresentado |
| não duplicação | ativar o patch não aumenta atividade apenas por sobreposição de resoluções |
| contorno | drive uniforme do campo produz entrada microscópica prevista |
| retorno | média do patch retorna ao campo na janela e ordem definidas |
| estabilidade | acoplamento desligado, unilateral e bilateral possuem envelopes documentados |
| independência da câmera | mudar zoom ou LOD não altera o hash do motor |

## Observáveis

Cada instrumento terá ao menos três testes:

1. sinal sintético com resposta analítica conhecida;
2. ausência de sinal e limites de janela;
3. integração com um circuito pequeno.

Para pseudo-LFP, o teste registra posição do eletrodo, correntes incluídas, kernel e convenção de sinal. Para fase, a entrada inclui ondas sintéticas com frequência e singularidade conhecidas. Para dimensionalidade, matrizes de posto conhecido precedem qualquer interpretação de dados neurais.

Homologia persistente e outras análises pesadas rodam sobre conjuntos reduzidos e artefatos versionados. Elas não participam do orçamento de um frame.

## Desempenho

Desempenho é medido sem relaxar a dinâmica silenciosamente. Cada relatório inclui hardware, navegador/runtime, preset, número de unidades, sinapses, vértices, passo e cadência de snapshots.

As primeiras métricas são:

- tempo por tick e percentis;
- ticks simulados por segundo;
- latência entre comando e snapshot;
- tempo de frame por camada;
- cópias e bytes transferidos por snapshot;
- memória estável depois do aquecimento;
- tamanho do bundle.

O alvo visual é manter interação fluida em 60 Hz quando o hardware permitir. Se o motor ficar atrasado, a interface reduz LOD ou frequência de snapshots; não aumenta `dt` sem trocar de preset e registrar a mudança.

## Validação gráfica

- capturas determinísticas em tamanhos de viewport definidos;
- comparação das vistas cérebro, circuito e patch quando disponíveis;
- teste de oclusão e transição entre LODs;
- legibilidade sem depender apenas de cor;
- contraste, teclado e movimento reduzido;
- confirmação de que cada pulso visível aponta para um evento publicado;
- confirmação de que interpolação não antecipa spike ou chegada sináptica.

Mudanças de shader podem usar tolerância perceptual. Mudanças de posição, contagem de objetos e associação entre estado e cor exigem também testes estruturais.

O gate contínuo `scripts/audit_runtime.js` captura Visão Geral, Lâminas, Célula,
Eletricidade e Sinapse em
`1440×960`, repete a captura móvel em `390×844`, percorre as abas por teclado,
mede os textos críticos contra o fundo mais claro do painel e exige razão mínima
de 4,5:1. O mesmo gate rejeita overflow horizontal, perfil incompleto, objeto
renderizado sem proveniência, rampa material não invertível, saturação acima do
teto e distinção que desapareça no modo monocromático. O relatório registra CPU,
memória, navegador, plataforma WebGL, preset, unidades, sinapses, vértices, passo
e cadência de snapshots; as cinco vistas também são capturadas sem cor.

## Pirâmide de testes no `src/`

```text
testes unitários
├── clock, RNG, CSR, integradores e observáveis
testes de modelo
├── circuito mínimo, receptor, plasticidade e campo
testes de protocolo
├── Worker, transferência, reset, replay e captura
testes estatísticos
├── ensembles curtos e cenários versionados
testes visuais
└── snapshots de cenas e acessibilidade
```

Testes estatísticos longos e análises topológicas podem ficar fora do ciclo rápido, mas devem produzir artefatos e versões de parâmetros reproduzíveis.

## Critério de promoção

Uma função passa de experimental para padrão quando:

1. possui unidade, hipótese e limite em `MODEL_SPEC.md`;
2. possui contrato de estado em `ARCHITECTURE.md`;
3. passa pelas camadas de validação aplicáveis;
4. tem custo medido;
5. aparece graficamente apenas por dados publicados;
6. mantém replay e captura reproduzíveis.

Se uma hipótese ainda não possui evidência suficiente, ela permanece disponível em modo Laboratório e não é usada como demonstração fisiológica no modo Apresentação.

### Promoção da 0.4

A evidência executável original da superfície foi congelada nos fixtures antes
da remoção do integrador TypeScript. A topologia e o renderer continuam cobertos
por `brain.test.ts` e `render-layers.test.ts`; dinâmica, campo e observáveis são
reexecutados pelos testes Cargo. O resultado da auditoria, incluindo os limites
que não foram promovidos a afirmações fisiológicas, está em
[AUDIT_0.4.md](AUDIT_0.4.md).

## Matriz de validação Rust/Wasm da 0.5

O motor Rust substituiu o oráculo TypeScript por subsistema; a promoção exigiu
um artefato versionado em cada linha:

| Comparação | Contrato |
| :-- | :-- |
| Rust nativo × repetição nativa | igualdade exata de ticks, IDs, eventos e buffers determinísticos |
| Rust nativo × Wasm no mesmo preset | exatidão para inteiros; tolerância declarada por grandeza em ponto flutuante |
| Rust × TypeScript legado | vetores exatos para relógio/RNG/CSR; envelopes e eventos pareados para integradores |
| Worker Wasm × chamada direta | mesmo estado e hash depois da mesma fila de entradas |
| `f64` interno × snapshot `f32` | erro de quantização abaixo do orçamento do observável |
| serial × paralelo futuro | mesma ordem lógica e tolerância previamente registrada |

### Extensão 0.6 · snapshot córtico-talâmico

| Gate | Evidência executável |
| :-- | :-- |
| baseline 0.5 preservado | `scripts/shadow_replay.js` continua exigindo os três hashes exatos e divergência máxima zero |
| ABI Rust/TypeScript | ambos usam `schemaVersion = 4`; o navegador rejeita qualquer versão diferente |
| estado laminar compacto | E/I chegam como dois `Float32Array` de seis posições |
| transferência | teste lista treze `ArrayBuffer` distintos, incluindo E/I laminar |
| determinismo novo | hash córtico-talâmico muda com o tick e é publicado separadamente |
| recursos | testes aceitam a cota exata e rejeitam o primeiro valor acima para topologia e ticks por comando |
| degradação | fallback publica somente zeros e `corticothalamicHash = unavailable` |

### Extensão 0.7 · patch celular

| Gate | Evidência executável |
| :-- | :-- |
| passo e SI | `CellPatchConfig` adota `1/12000 s`; snapshots publicam volts, amperes, hertz e segundos |
| convergência de evento | primeiro spike é comparado em `1/6000`, `1/12000` e `1/24000 s`, com erro decrescente |
| receptores | AMPA/NMDA/GABA-A/GABA-B possuem estados, reversões e constantes temporais separados |
| mapa de resolução | pesos de célula e contorno somam um; blend fica em `[0,1]` e substitui o campo no vértice |
| ensemble | oito sementes mantêm estados finitos, taxa limitada e variação não nula |
| replay | `cell-patch-v1.json` congela quatro marcos, hashes, voltagens e primeiro spike |
| ABI Rust/TypeScript | ambos usam `schemaVersion = 5`; nove buffers celulares elevam o total a 22 |
| navegador | Worker real publica três hashes válidos e as quatro abas exibem unidades esperadas |
| acessibilidade visual | teclado percorre quatro tabs; cinco capturas, contraste e viewport móvel são auditados |
| degradação | fallback celular é inerte e publica `cellPatchHash = unavailable` |

### Extensão 0.8 · ABI v6 e aba Sinapse

| Gate | Evidência executável |
| :-- | :-- |
| compatibilidade de hashes | `abi-v5-hash-preservation-v1.json`, `field-observables-v1.json`, `cell-patch-v1.json` e o replay sombra continuam exigindo os valores anteriores |
| hash químico | `ChemicalSignal.state_hash` cobre solver, duas reservas vesiculares, contagens e último evento sem entrar nos três hashes legados |
| replay integrado | `chemical-track-v1.json` reproduz seis ticks e todos os buffers/hash da trilha bit a bit |
| ABI Rust/TypeScript | ambos usam `schemaVersion = 6`; 12 buffers químicos elevam o total a 34 |
| unidades e ordens | transmissores seguem `[glutamato, GABA]`; receptores seguem `[AMPA, NMDA, GABA-A, GABA-B]`; matéria, concentração e tempo ficam em SI |
| proveniência do evento | sem spike publicado não há novo índice ou liberação; uma contagem positiva autoriza no máximo um evento no microdomínio representativo |
| apresentação | vesícula lê `R`; fusão lê último evento; nuvem lê concentração; receptores leem ocupação; recaptura lê delta da remoção publicada |
| transferência | teste lista 34 `ArrayBuffer` distintos, incluindo evento, concentração, ocupação e remoção química |
| navegador | Worker real publica quatro hashes válidos e as cinco abas exibem unidades esperadas |
| acessibilidade visual | teclado percorre cinco tabs; Sinapse participa das capturas em cor, monocromia, saturação e proveniência |
| degradação | fallback químico é inerte e publica `chemicalHash = unavailable` |

Os contratos executáveis atuais são:

- `discrete-v1.json`: relógio, RNG e ordenação CSR;
- `field-observables-v1.json`: projeção de spikes, seis passos do campo E/I,
  buffers `f32`, peso absoluto médio e taxa populacional em janela;
- `input-queue-v1.json`: entradas deliberadamente fora de ordem e a ordem
  canônica esperada por `(tick, sequence)`;
- `cell-patch-v1.json`: replay de 60 intervalos macro do patch, com quatro
  checkpoints exatos e gerador Rust versionado em `examples/`;
- `short-term-plasticity-v1.json`, `cleft-occupancy-v1.json` e
  `chemical-solver-v1.json`: trilha química congelada em três fronteiras
  independentes antes de sua composição na ABI v6;
- `chemical-track-v1.json`: composição integrada de vesículas, solver e buffers
  públicos da ABI v6, com gerador e consumidor Rust independentes;
- `abi-v5-hash-preservation-v1.json`: os três hashes da captura determinística
  v5 que a captura v6 deve reproduzir antes de acrescentar o hash químico;
- `scripts/shadow_replay.js`: recompõe o replay no Wasm e exige os hashes do
  oráculo congelado e o SHA-256 auditado do fixture;
- testes Cargo: reproduzem o artefato, inclusive o replay neural completo, e
  comprovam que o erro do passo médio é
  menor que o do passo grosso no cenário de refinamento.

O teste `synaptic_convergence.rs` trata AMPA (`τ = 5 ms`) e GABA-A
(`τ = 10 ms`) separadamente. Ele compara a quadratura temporal da resposta
unitária com sua integral analítica em quatro passos, exige erro estritamente
decrescente, ordem observada maior que 0,90 e erro relativo final abaixo de
1,3% do valor de `τ`.

Testes da ABI executam no alvo `wasm32-unknown-unknown` e em navegador real.
Compilar não basta: o módulo precisa ser carregado dentro do Worker, receber um
replay, publicar buffers e sobreviver a reset/dispose.

### Gate numérico por subsistema

1. equação, unidade e domínio válidos em `MODEL_SPEC.md`;
2. solução analítica, referência refinada ou benchmark independente;
3. estudo de convergência temporal e, quando aplicável, espacial;
4. invariantes de positividade, conservação, normalização e limites;
5. sensibilidade a parâmetros e condição inicial;
6. custo nativo, Wasm, transferência e memória;
7. paridade do replay e proveniência do preset.

Um solver rígido não é aprovado apenas por permanecer finito. Deve demonstrar
erro e estabilidade no regime em que será usado.

### C# e aceleradores externos

Um booster C# precisa vencer ou complementar a alternativa Rust em um benchmark
publicado e resolver uma necessidade fora do navegador. O relatório inclui
serialização, cópias, latência de rede/processo e operação. C# não recebe acesso
a segredos no cliente e não é apresentado como camada de segurança do Wasm.

### GIF sincronizado

O workflow de perfil valida o shell, usa captura determinística, atualiza
`assets/brain.gif` e carimba a referência com o SHA do simulador. O gate verifica:

- captura nasce do mesmo entry point publicado;
- seed, tempo, câmera, viewport e número de frames são fixos;
- GIF permanece abaixo do orçamento de tamanho;
- commit contém somente GIF e referência do README;
- falha de captura nunca substitui o último GIF válido.

A sincronização é eventual: sucesso do workflow e atualização da URL são
observáveis; “mudança instantânea” não é critério de aceite.
