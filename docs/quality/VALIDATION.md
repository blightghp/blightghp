# Estratégia canônica de validação · BRAIN PRO

**Revisão:** 10 · produto observado 0.9.0 · promoção 0.8 concluída · R09-A..R09-F/R10-A..R10-D validadas

Quatro perguntas permanecem separadas: o cálculo é reproduzível, respeita
limites, converge e produz o fenômeno definido pelo experimento? Uma única
comparação de snapshot não responde às quatro. “Há teste” também não significa
“foi executado nesta revisão”; comandos, resultado e ambiente pertencem ao
artefato de promoção.

## Estado da evidência

| Domínio | Código/teste disponível | Evidência versionada atual | Veredito |
| :-- | :-- | :-- | :-- |
| 0.4–0.7 | fixtures, Cargo/Vitest e auditorias | auditorias de promoção | promovido nos limites declarados |
| química nativa 0.8-a..d | testes unitários, replays e convergência | fixtures v1 | implementado e validado no contrato/regime testado |
| trilha/ABI v6 | fixture integrada, testes host/Worker/scripts | auditoria P2 + `runtime-audit.json` schema 2 | validado no navegador e promovido em P4 |
| gráficos 0.8 | bindings estruturais, pixel renderizado, saturação e capturas | headless + baseline físico versionados | validado em P3 |
| hardware real | perfil completo e rejeição de software renderer | Intel UHD 770/ANGLE D3D11 | baseline versionado; não é promessa universal |
| promoção 0.8 | gate agregado de versão, ABI, evidência e achados | `promotion-0.8.json` schema 1 | P1–P4 concluídas; nenhum achado alto aberto |
| experimento de tarefa R09-A | schema/adapters, controle nulo, fixture e replay | `bayesian-observation-v1.json` | posterior isolada do drive; contexto interativo nulo |
| eventos celulares R09-B | fixture exata, ABI/Worker e renderer | `cell-spike-events-v1.json` + auditoria de lifecycle | IDs/offsets carimbados pelo Rust; limite e backpressure provados |
| Prancha Elétrica R09-C | observáveis puros, scene graph, DOM e auditoria | [auditoria R09-C](../audits/0.9/AUDIT_0.9_R09_C.md) | 10/11 draws, equivalente textual, hashes invariantes e zero objeto sem proveniência |
| seleção/vista Neurônio R09-D | seleção convergente, geometria determinística, bindings e auditoria | [auditoria R09-D](../audits/0.9/AUDIT_0.9_R09_D.md) | 10 draws, 8 valores, zero rebuild/frame, foco restaurado e cinco hashes invariantes |
| materialidade e planos de corte R09-F | manifesto PBR, clipping/stencil, sonda, fallback, hash e GIF | [auditoria R09-F](../audits/0.9/AUDIT_0.9_R09_F.md) | 25 materiais elegíveis, 9/18 draws de corte, zero geometria/binding alterado e cinco hashes invariantes |
| catálogo anatômico R10-A | schema/import, hierarquia, bindings de cena, busca, árvore/picking e navegador | [auditoria R10-A](../audits/0.10/AUDIT_0.10_R10_A.md) | 32 entradas, 98 objetos cobertos, zero asset externo/custo gráfico e cinco hashes invariantes |
| vascular topológico R10-B | schema/import, invariantes de grafo, catálogo, cena estática, redundância, busca/picking/isolamento e navegador | [auditoria R10-B](../audits/0.10/AUDIT_0.10_R10_B.md) | 42 segmentos, 44 entradas, 12/17 draws, zero animação/asset externo e cinco hashes invariantes |
| orçamento de apresentação R10-C | três perfis, governador, caches, medição física e 12 capturas | [auditoria R10-C](../audits/0.10/AUDIT_0.10_R10_C.md) | seis vistas × 24 amostras abaixo do teto e cinco hashes invariantes |
| superfície procedural R10-D | determinismo, dois LODs, atributos baked, fallback, corte e medição física | [auditoria R10-D](../audits/0.10/AUDIT_0.10_R10_D.md) | hash `7dfdd64207190121`, 5.780/1.500 triângulos, build 77,9 ms e 12 capturas válidas |

O artefato `../../artifacts/visual-audit/runtime-audit.json` usa schema 2 e está
vinculado ao commit técnico testado. Ele registra 34 buffers, quatro hashes,
reset/replay exato, descarte, reinicialização, cinco abas, 11 capturas e o
ambiente de execução. Seu renderer é SwiftShader; por isso ele fecha P2, mas não
é evidência de desempenho em GPU física. O baseline complementar em
`artifacts/hardware-audit` usa Intel UHD 770/ANGLE D3D11 e fecha P3 dentro do
ambiente e dos envelopes registrados.

## IDs de qualidade

| ID | Regra |
| :-- | :-- |
| QA-001 | igualdade exata somente onde o contrato numérico a exige |
| QA-002 | invariantes rodam em limites, treino longo e primeiro valor inválido |
| QA-003 | solver demonstra erro/convergência, não apenas finitude |
| QA-004 | fixture tem schema, gerador/consumidor e proveniência |
| QA-005 | ABI testa versão, layout, unidades, ordens, transfer e fallback |
| QA-006 | gráficos combinam prova estrutural, renderizada e acessível |
| QA-007 | desempenho registra ambiente, preset, tamanho e percentis |
| QA-008 | promoção exige comandos reais e artefatos reproduzíveis |
| QA-009 | falha é atômica e rollback verificável |
| QA-010 | segurança cobre input malformado, cotas, supply chain e privacidade aplicável |
| QA-090 | modelo de tarefa tem schema, owner, limite, controle nulo e replay; não atravessa a fronteira científica implicitamente |
| QA-091 | evento celular tem carimbo temporal, ordem canônica, teto, hash próprio e transporte sem inferência visual |
| QA-092 | Prancha Elétrica prova origem/unidade, scene graph separado, orçamento, acessibilidade e invariância dos cinco hashes |
| QA-093 | seleção e vista Neurônio provam convergência de ID, teclado/foco, geometria determinística, evento carimbado e invariância dos cinco hashes |
| QA-094 | película 3D prova cobertura das seis vistas, elegibilidade por passe, fallback atômico, acessibilidade, custo e invariância antes da promoção |
| QA-101 | corte prova quatro eixos/laje, opt-in local, tampa stencil, sonda com unidade/domínio, teclado/touch, orçamento e cleanup |
| QA-110 | catálogo anatômico prova schema/cotas, unicidade/hierarquia, fonte/licença/transformação/evidência, cobertura por objeto, busca/picking/acessibilidade, custo e invariância |
| SEC-020 | import de catálogo rejeita JSON malformado, campos desconhecidos, excesso de 256 KiB, referências quebradas e asset externo sem SHA-256 |
| QA-111 | vascular prova schema/cotas, invariantes de grafo, cobertura de catálogo por objeto, redundância sem cor, ausência de animação, orçamento e invariância dos cinco hashes |
| SEC-021 | contrato vascular rejeita JSON malformado, campo desconhecido, acima de 128 KiB, referência quebrada e ID duplicado |
| QA-112 | orçamento prova três perfis, isolamento de captura, downgrade/histerese/recuperação, sete reclamações executáveis, custo por vista, cache por revisão e cinco hashes invariantes |
| QA-113 | superfície procedural prova seed/stream/algoritmo, hash, atributos baked, triângulos, tempo fora do frame, dois LODs, fallback atômico, corte e cinco hashes invariantes |

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
`../../fixtures/replay/short-term-plasticity-v1.json`:

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
`../../fixtures/replay/cleft-occupancy-v1.json` e mantém a ABI fora do escopo:

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

O gate composto usa `../../fixtures/replay/chemical-solver-v1.json`:

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

O código atual de `scripts/audit_runtime.js` captura Visão Geral, Lâminas,
Célula, Eletricidade e Sinapse em `1440×960`, repete a captura móvel em
`390×844`, percorre abas por teclado, mede contraste 4,5:1, saturação, perfil,
proveniência declarada e gera versões monocromáticas.

R08-P3 acrescenta ao round-trip puro um alvo WebGL 7×7 com cinco estados
conhecidos, leitura do pixel central, conversão sRGB→linear e envelope de erro
`0,012`. O maior erro versionado foi `0,00476` em SwiftShader e `0,00169` na
Intel UHD 770. Todos os 72 objetos `STATE` declaram campo, unidade,
transformação e pista não cromática; testes verificam também as geometrias,
proporções, posições, orientações e diâmetros concretos. As capturas
monocromáticas continuam sendo evidência visual complementar, não a única prova.

SwiftShader/headless continua sendo ambiente funcional. O baseline físico é
válido somente para o host, Chrome, driver, preset e contagens registrados.

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

1. possui unidade, hipótese e limite em `../specifications/MODEL_SPEC.md`;
2. possui contrato de estado em `../specifications/ARCHITECTURE.md`;
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
[AUDIT_0.4.md](../audits/0.4/AUDIT_0.4.md).

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
| navegador | o script exige Worker real, quatro hashes, 34 buffers, reset/dispose/reinit e cinco abas; evidência P2 versionada |
| acessibilidade visual | cinco tabs, Sinapse, viewport móvel e 11 capturas estão no artefato schema 2; prova estrutural sem cor permanece em P3 |
| degradação | fallback químico é inerte e publica `chemicalHash = unavailable` |

### R09-B · eventos celulares carimbados e ABI v7

| Gate | Evidência executável |
| :-- | :-- |
| propriedade | o Rust publica `cellId` e `timeOffsetSeconds`; ABI, Worker e renderer apenas transportam/consomem o lote |
| replay não vazio | `cell-spike-events-v1.json` congela 55 eventos em três intervalos e compara IDs, bits `f64`, ticks e hashes |
| ordem e janela | cada offset pertence ao intervalo publicado e a sequência é canônica por `(timeOffsetSeconds, cellId)` |
| limite | o motor rejeita atomicamente o primeiro evento acima de 4.096 por snapshot |
| hash independente | schema, ticks, tamanho, IDs e bits dos offsets alimentam o quinto FNV-1a; os quatro hashes anteriores não mudam |
| ABI Rust/TypeScript | ambos usam `schemaVersion = 7`; dois buffers SoA elevam o total a 36 |
| validação host | schema de evento 1, comprimentos, finitude, faixa temporal, IDs, ordem e teto são rejeitados no primeiro valor inválido |
| transferência | 36 `ArrayBuffer` distintos incluem `Uint32Array` de IDs e `Float64Array` de offsets |
| apresentação | `CellRenderLayer` marca somente IDs presentes no lote; o flag instantâneo não autoriza inferir eventos perdidos |
| lifecycle | Worker real prova quinto hash, reset/dispose/reinit e 65 respostas sob rajada, com ao menos uma rejeição `worker-backpressure` |
| orçamento | 12 bytes por evento; teto teórico de 49.152 bytes por snapshot |
| lote vazio | é válido no cenário integrado padrão; a fixture não vazia prova separadamente geração, ordenação e replay |

### R09-D · seleção e vista Neurônio

| Gate | Evidência executável |
| :-- | :-- |
| seleção fechada | parser aceita somente IDs inteiros `0..11`; raycast e lista endereçam o mesmo `selectedCellId` |
| teclado e foco | `Tab` percorre a lista sem prender as extremidades; `Enter` amplia; `Escape` retorna à célula e restaura o foco de origem |
| geometria | repetição de `seed + cellId + stream` reproduz arrays e hash FNV-1a de 64 bits; outro ID muda o hash |
| morfologia honesta | toda a árvore usa somente `dendriteVolts[i]`; não existe gradiente proximal/distal nem alegação de tipo celular |
| evento visual | marcador estático aparece somente se `cellSpikeEvents.cellIds` contém a seleção; `cellPatch.spiked` isolado não o autoriza |
| observáveis | soma, dendrito, adaptação e quatro correntes têm unidade, caminho de origem e equivalente tabular |
| invariância | seleção `1 → 4 → 1`, vista e câmera preservam os cinco hashes com relógio congelado |
| orçamento | 10 draws, 8 valores publicados por snapshot e zero reconstrução geométrica por frame |
| acessibilidade visual | seis tabs, 12 controles celulares, captura colorida/monocromática e viewport móvel passam no navegador real |
| rollback | desabilitar a sexta vista mantém o patch de 12 células e não exige migração de ABI ou estado |

### R09-E · dendrito multicompartimental e ABI v8

| Gate | Evidência executável |
| :-- | :-- |
| equações/unidades | Rust integra `Vs/Vp/Vd` em V com `Cs/Cp/Cd` em F e fuga/acoplamento em S; envelope `[−120,+60] mV` |
| estabilidade/convergência | fuga e acoplamentos usam matriz tridiagonal implícita; erro de `dt=1/12000 s` cai contra referência `1/96000 s` |
| conservação de carga | correntes `gsp(Vp−Vs)` e `gpd(Vd−Vp)` somam zero entre os três compartimentos antes das correntes de membrana |
| roteamento | AMPA/NMDA usam `Vd`, GABA-A usa `Vp` e GABA-B usa `Vs`, com teste de força motriz por receptor |
| replay | `cell-patch-v1.json` e `cell-spike-events-v1.json` permanecem exatos em `LegacySingleDendriteV1`; fixtures v2 congelam o padrão multicompartimental |
| determinismo | duas simulações com mesma semente igualam tick a tick os hashes de rede, corticotalâmico, célula, química e eventos |
| hash celular | schema/tag/comprimento separam soma, proximal e distal; perturbar qualquer compartimento muda um domínio distinto de bytes |
| ABI/Worker | schema 8 substitui o dendrito único por `dendriteProximalVolts` e `dendriteDistalVolts`; 37 buffers são transferidos uma vez cada |
| renderer | `NeuronRenderLayer` interpola por coordenada de caminho determinística, mantém 10 draws e não reconstrói geometria por frame |
| Prancha Elétrica | condutância usa a força motriz do compartimento roteado e a tabela publica V proximal, V distal e `Δ prox→dist` com origem |
| acessibilidade | soma/proximal/distal aparecem como rótulos independentes e equivalentes tabulares no modo monocromático |
| invariância visual | câmera, detalhe elétrico, seleção e modo visual preservam os cinco hashes com relógio congelado |
| orçamento | teste nativo mede 12 células abaixo de `1 ms/subpasso`; navegador confirma lifecycle e ABI sem buffer duplicado |
| rollback | `CellPatchModel::LegacySingleDendriteV1` preserva o solver/fixture v1; a ABI/UI permanece v8 |

### R09-F · película 3D e planos de corte

`materialProfileAudit()` retorna exatamente as seis vistas, ao menos um objeto
renderizável por vista, zero objeto sem proveniência e zero binding `STATE`
ausente. `presentationAudit()` acrescenta o perfil ativo, 25 elegíveis/PBR,
contagem de transmissão, zero troca geométrica, clipping e sonda.

O gate executa: quatro normais canônicas e laje; opt-in/exclusão local;
compartilhamento de geometria e descarte de materiais/geometrias auxiliares;
fallback atômico em alto contraste/perda de contexto/shader; três normal maps
canvas determinísticos e `RoomEnvironment`/PMREM com dispose; equivalente textual;
invariância dos cinco hashes com o relógio congelado; manifesto GIF schema 3;
captura comparativa, teclado/touch, monocromia, movimento reduzido e orçamento
GPU e cinco hashes invariantes. Qualquer falha mantém ou restaura o esquemático.

### R10-A · catálogo anatômico com proveniência

O gate executa schema 1 estrito, cota de 256 KiB, IDs únicos, raiz única,
hierarquia acíclica, referências fechadas de fonte/licença/transformação e
SHA-256 obrigatório para eventual asset externo. O artefato embutido possui 32
entradas, cinco fontes internas, cinco transformações, zero asset externo e
fingerprint FNV-1a `c7ae661e5b2570cb`.

Nas seis vistas, `anatomyCatalogAudit()` percorre 98 objetos renderizáveis: 58
possuem binding direto e 40 declaram explicitamente que são estado/overlay não
anatômico. Zero objeto fica sem declaração, ID conhecido, afirmação permitida ou
limitação. Busca acento-insensível, árvore, breadcrumbs, API de auditoria e
picking convergem no mesmo ID.

O navegador real testa seleção entre Visão Geral, Lâminas, Neurônio e Sinapse,
live region, viewport `390×844`, ausência de overflow e cinco hashes congelados.
O catálogo não cria geometria, material, textura, render target ou draw call; o
relatório exige delta zero antes/depois. Evidência versionada:
[AUDIT_0.10_R10_A.md](../audits/0.10/AUDIT_0.10_R10_A.md) e
`../../artifacts/anatomy-audit/anatomy-audit.json`.

### R10-B · vascular topológico

O gate valida `brain-pro-vascular` schema 1 sob cota de 128 KiB: IDs e referências
únicos, relações montante/jusante simétricas, classes e ordens válidas, alcance
arterial até capilar, alcance venoso até sumidouro e exatamente um ciclo
conectado para a anastomose declarada. O artefato embutido contém 42 segmentos
(21 arteriais, dois capilares e 19 venosos) e hash geométrico FNV-1a
`46b9ddf9cd6510d4`.

O catálogo 1.1.0 fecha com 76 entradas, das quais 44 são vasculares e
`ILLUSTRATIVE`; não há asset externo. O módulo monta subgrupos estáticos nas seis
raízes existentes e totaliza 12 draw calls contra teto 17, 6.600 triângulos e
172.780 bytes de geometria própria. Auditorias estruturais exigem `matter`,
`TOPOLOGY`, binding direto, clipping incluído, bloom excluído, construção única
e zero objeto vascular animado.

O navegador SwiftShader testa busca, seleção, `faceIndex`/`instanceId`, legenda
redundante, modo esqueleto, monocromia e viewport `390×844`. Seis capturas e o
relatório versionado ficam em `artifacts/vascular-audit`; os cinco hashes
científicos permanecem exatamente iguais. A geometria é somente ilustrativa e
não publica fluxo, perfusão, pulso ou oxigenação. Evidência versionada:
[AUDIT_0.10_R10_B.md](../audits/0.10/AUDIT_0.10_R10_B.md) e
`../../artifacts/vascular-audit/vascular-audit.json`.

### R10-C · orçamento, governador e reclamação

O contrato `presentation-budget` schema 1 fecha `baseline`, `enhanced` e
`cinema`; o último é rejeitado fora de `captureMode`. Doze frames consecutivos
acima do teto de `enhanced` causam downgrade com motivo
`frame-budget-exceeded`. O retorno é manual e só fica disponível após 90 frames
na janela de recuperação, evitando oscilação automática.

O artefato mede 24 frames em cada uma das seis vistas e registra ambiente, GPU,
draws, triângulos, bytes de textura/geometria e p50/p95. O verificador compara
`baseline` com o custo R10-B e tolerâncias versionadas. A auditoria em ANGLE
Direct3D11/Intel UHD mediu p95 de 1,9 a 19,1 ms, 6 a 50 draws e preservou os
cinco hashes.

As sete reclamações são provadas por buffer cortical reutilizado; limpeza só da
cauda instanciada; partições matter/emission/excluded em cache; cache de
materiais por raiz/revisão; cache de clipping por camada/invalidação; 21 matrizes
estáticas congeladas; e UI/sonda na cadência de 8,3 Hz. Evidência:
[AUDIT_0.10_R10_C.md](../audits/0.10/AUDIT_0.10_R10_C.md),
`../../artifacts/presentation-budget/presentation-budget.json` e
[revisão visual](../reviews/VISUAL_REVIEW_R10_C.md).

### R10-D · superfície procedural

`procedural-surface.test.ts` constrói o lote duas vezes para a mesma seed,
congela o hash `7dfdd64207190121`, separa domínios de seed/região e rejeita ponto,
coordenada e orçamento inválidos com descarte atômico. Cada uma das oito
geometrias (quatro regiões × dois LODs) possui `aoFactor`, `curvature` e
`thickness` com a mesma contagem de vértices.

`audit:procedural-surface` usa GPU física, mede 24 frames em `baseline` e
`cinema`, alterna LOD, reabre a aplicação para comparar o hash, ativa o corte
coronal e valida a sonda `field.waveActivity`. O artefato registra build de 77,9
ms, 5.780/1.500 triângulos, p95 de 5,2/6,9 ms, zero troca de identidade
geométrica, catálogo 1.2.0, 12 capturas não vazias e invariância dos cinco hashes
científicos. Evidência: [AUDIT_0.10_R10_D.md](../audits/0.10/AUDIT_0.10_R10_D.md),
`../../artifacts/procedural-surface/procedural-surface.json` e
[revisão visual](../reviews/VISUAL_REVIEW_R10_D.md).

Os contratos executáveis atuais são:

- `discrete-v1.json`: relógio, RNG e ordenação CSR;
- `field-observables-v1.json`: projeção de spikes, seis passos do campo E/I,
  buffers `f32`, peso absoluto médio e taxa populacional em janela;
- `input-queue-v1.json`: entradas deliberadamente fora de ordem e a ordem
  canônica esperada por `(tick, sequence)`;
- `cell-patch-v1.json`: replay legado de 60 intervalos macro do patch de um
  dendrito; `cell-patch-v2.json` congela soma/proximal/distal e o hash v2 em
  quatro checkpoints exatos;
- `short-term-plasticity-v1.json`, `cleft-occupancy-v1.json` e
  `chemical-solver-v1.json`: trilha química congelada em três fronteiras
  independentes antes de sua composição na ABI v6;
- `chemical-track-v1.json`: composição integrada de vesículas, solver e buffers
  públicos da ABI v6, com gerador e consumidor Rust independentes;
- `abi-v5-hash-preservation-v1.json`: registra os três hashes da captura 0.8 no
  cenário de entrada congelado; capturas de outro cenário validam proveniência e
  seus quatro hashes próprios, sem comparação entre entradas distintas;
- `cell-spike-events-v1.json`: congela três intervalos legados não vazios;
  `cell-spike-events-v2.json` congela os lotes do modelo multicompartimental;
  ambos com IDs, offsets e ticks exatos e gerador Rust em `examples/`;
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

1. equação, unidade e domínio válidos em `../specifications/MODEL_SPEC.md`;
2. solução analítica, referência refinada ou benchmark independente;
3. estudo de convergência temporal e, quando aplicável, espacial;
4. invariantes de positividade, conservação, normalização e limites;
5. sensibilidade a parâmetros e condição inicial;
6. custo nativo, Wasm, transferência e memória;
7. paridade do replay e proveniência do preset.

Um solver rígido não é aprovado apenas por permanecer finito. Deve demonstrar
erro e estabilidade no regime em que será usado.

## Matriz requisito → evidência

| Requisito | Prova obrigatória | Artefato/comando |
| :-- | :-- | :-- |
| ENG-004/010 tempo independente do frame | relógio, captura e hash sob LOD/câmera | Vitest + teste de integração |
| ENG-005/QA-009 atomicidade | snapshot/hash idênticos após falha | Cargo por solver |
| ENG-006 determinismo | repetição, fixture e ordem empatada | Cargo + replay |
| ABI-001..004/012/020 | schema 8, 37 buffers, ordens/unidades, eventos e fixtures celulares v1/v2 | Cargo, Vitest, Wasm browser |
| WRK-001..003 | fila serial, cotas, backpressure, fallback inerte, reset/dispose | Vitest + navegador forçando falha |
| UI-001..010 | estado, unidades, controles e acessibilidade | unitário/DOM/E2E |
| UI-021/QA-093 | seleção celular, `Tab`/`Enter`/`Escape`, foco e hashes invariantes | Vitest + auditoria de navegador |
| GFX-001..010 | hash invariável, proveniência e estado→pixel | testes estruturais + render target + capturas |
| GFX-050/AST-010 | geometria determinística, origem visual e ausência de evento inventado | Vitest + auditoria de navegador |
| MOD-100/ENG-025/QA-100 | cabo de três compartimentos, conservação, convergência, determinismo e orçamento | Cargo + replay + auditoria R09-E |
| AST/VAS | fonte/licença/sem animação sem estado | manifesto de asset + auditoria visual |
| AST-030..034/UI-030/SEC-020/QA-110 | catálogo, binding/exclusão, busca/picking, import seguro, custo e invariância | Vitest + `npm run audit:anatomy` + auditoria R10-A |
| AST-036/VAS-002..008/SEC-021/QA-111 | catálogo vascular, grafo, cena estática, redundância, isolamento, custo e invariância | Vitest + `npm run audit:vascular` + auditoria R10-B |
| SEC | inputs/cotas/CSP/dependências/import | unitário, fuzz/property, SCA e revisão |
| PERF | custo por subsistema/ambiente | relatório versionado |

## ABI e Worker

Além dos testes existentes, cada promoção de wire cobre:

- mismatch de versão e feature desconhecida;
- comprimentos divergentes, ordem errada, buffer destacado e safe integers;
- mensagem malformada, duplicada, passada e acima de cota;
- fila, backpressure, cancelamento, timeout e retry idempotente quando existirem;
- reset/dispose com comandos pendentes;
- falha forçada de Wasm e fallback explicitamente degradado;
- memória estável e reciclagem sem use-after-transfer.

## Frontend e acessibilidade

- reducer/estado de UI e separação de preferências/preset;
- teclado, foco, leitor de tela e equivalente textual do canvas;
- alto contraste, monocromia estrutural, movimento reduzido e zoom de texto;
- touch, responsividade, orientação e erros recuperáveis;
- persistência/import/export: schema, cota, corrupção, migração e sanitização;
- modos Guiado/Explorador/Laboratório usam o mesmo motor;
- seleção por cena e árvore produz o mesmo ID.

## Segurança e supply chain

- cotas em host e Rust/Wasm, com primeiro valor acima do limite;
- CSP/Tauri capabilities/IPC mínimo e ausência de código remoto;
- labels, URLs, SVG/assets e paths sanitizados;
- replay/topologia/import malformados e excessivos;
- `npm audit`/SCA Cargo, licenças, Actions pinadas e SBOM no release;
- secrets ausentes do cliente/log; telemetria opt-in;
- plano de privacidade antes de usuários, projetos compartilhados ou anotações.

## Ambientes

| Ambiente | Função | Mínimo de prova |
| :-- | :-- | :-- |
| Chromium headless/SwiftShader | gate determinístico funcional | Worker/Wasm, DOM, capturas e contratos |
| Chromium/Firefox/WebKit suportados | compatibilidade web | smoke, acessibilidade e performance observada |
| Windows/Linux | nativo/CI | Cargo, Wasm e replay cross-platform |
| macOS | aplicável ao release | build/smoke quando suportado |
| Tauri | desktop | IPC/capabilities, mesmo comportamento observável |
| GPU integrada | baseline baixo | frame/LOD/memória e fallback WebGL |
| GPU intermediária | baseline de apresentação | orçamento por vista |
| WebGPU | somente se adotado | paridade WebGL + fallback |
| touch/DPR/movimento reduzido | UX | interação e informação equivalentes |

## Comandos de gate

Use conforme o corte, sem afirmar execução futura:

```text
cargo fmt --all -- --check
cargo test --workspace
cargo clippy --workspace --all-targets -- -D warnings
cargo check -p brain-wasm --target wasm32-unknown-unknown
npm run typecheck
npx vitest run
npm run build
npm run check:shadow-replay
npm run test:wasm-browser
npm run audit:runtime
npm run verify:runtime-audit
npm run verify:hardware-audit
npm run verify:promotion-0.8
npm run audit:presentation-budget
npm run verify:presentation-budget
npm run audit:procedural-surface
npm run verify:procedural-surface
```

`npm run check` inclui build, navegador, verificação do artefato versionado e
uma auditoria temporária. Defina `BRAIN_AUDIT_DIR` para escolher onde uma nova
captura será escrita; a atualização versionada exige revisão visual e commit
separado da implementação testada.

## Gate de promoção 0.8 · concluído

A 0.8 foi promovida porque:

1. todos os replays nativos químicos e a compatibilidade v5 passarem;
2. bindings gerados, ABI 6, 34 buffers e quatro hashes passarem no Worker real;
3. fallback forçado, reset e dispose forem exercitados;
4. auditoria visual atual produzir Sinapse, monocromia, proveniência e perfil;
5. pixel→estado e redundância estrutural fecharem E3/E4;
6. existir baseline em hardware real, com ambiente/preset/contagens;
7. achados P/R/M estiverem fechados ou aceitos com owner/fase;
8. auditoria de promoção registrar comandos e resultados reais.

O fechamento executável e os limites aceitos estão em
[AUDIT_0.8_PROMOTION.md](../audits/0.8/AUDIT_0.8_PROMOTION.md) e
[`../../artifacts/promotion-0.8.json`](../../artifacts/promotion-0.8.json). Alterar versão,
ABI, evidência física ou um achado aceito reabre este gate.

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
- manifesto schema 3 cobre as seis vistas, reserva quadros para `neuron` e
  declara película/corte R09-F sem atlas externo;
- GIF permanece abaixo do orçamento de tamanho;
- commit contém somente GIF e referência do README;
- falha de captura nunca substitui o último GIF válido.

A sincronização é eventual: sucesso do workflow e atualização da URL são
observáveis; “mudança instantânea” não é critério de aceite.
