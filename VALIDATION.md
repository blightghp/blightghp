# Estratégia de validação

O projeto separa quatro perguntas: o cálculo é reproduzível, respeita seus limites, converge numericamente e produz fenômenos compatíveis com o experimento? Uma única comparação de snapshot não responde às quatro.

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
- probabilidades permanecem normalizadas;
- IDs e offsets de CSR ficam dentro dos buffers;
- um patch não duplica a contribuição do campo na mesma máscara;
- observáveis declaram unidade e janela;
- o renderer não altera o hash do estado do motor.

Testes de propriedade devem gerar redes pequenas e sementes variadas para exercitar esses limites.

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
