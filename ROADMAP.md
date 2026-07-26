# Roadmap · Sinapse Formalista

O experimento evolui em dois eixos inseparáveis: desce da atividade global até a sinapse e sobe da excitabilidade até a cognição e o comportamento. Cada entrega fecha uma escala antes de acrescentar outra e combina avanço do motor, ganho gráfico e evidência de validação.

O objetivo não é fazer todas as escalas rodarem com o mesmo modelo. É representar o mesmo fenômeno em resoluções compatíveis, com uma regra explícita para trocar ou acoplar uma resolução à outra.

## Princípios

1. Métricas, rótulos, luzes e animações devem nascer de estados calculados pelo motor.
2. A simulação avança por ticks fixos; a renderização apenas interpola snapshots publicados.
3. A mesma semente e o mesmo registro ordenado de entradas devem produzir o mesmo resultado na mesma plataforma numérica.
4. Reduções, eventos e consumo de números aleatórios possuem ordem canônica, inclusive quando o trabalho é distribuído.
5. Campo e spikes descrevem a mesma atividade em resoluções diferentes, mas não são somados como fontes independentes na mesma região.
6. O núcleo é indiferente ao conteúdo do estímulo. Experimentos pessoais, como sequências simbólicas, entram por adaptadores de entrada.
7. Uma aproximação científica deve declarar unidade, escala, hipótese e limite. Código preditivo é um modelo de tarefa, não uma lei universal do motor.
8. Realismo gráfico não pode ocultar perda de legibilidade, desempenho ou validade científica.
9. Web, captura automatizada e aplicativo desktop devem reproduzir a mesma experiência observável.

## Sequência de versões

| Versão | Motor | Realismo gráfico | Evidência de conclusão |
| :-- | :-- | :-- | :-- |
| **0.2 · Excitabilidade** | LIF fenomenológico, atrasos, sinapses direcionadas, excitação, inibição, STDP e inferência Bayesiana escalar | Atividade por unidade, pulsos ligados a eventos, envoltórios anatômicos e traçado de disparos | Determinismo serial, pesos limitados, inferência normalizada e invariantes do grafo |
| **0.3 · Fundação** | Relógio desacoplado do frame, ticks inteiros, RNG indexado, CSR, redução ordenada, Worker serial e transição validada para AMPA/GABA-A | Feixes direcionais, instrumentos com unidade, foco progressivo, LOD e interpolação entre snapshots | Vetores exatos do RNG, replay de entradas, convergência temporal, paridade antes/depois do Worker e orçamento medido |
| **0.4 · Superfície** | Domínio cortical procedural, campo populacional E/I, atrasos de condução e primeiro acoplamento campo/spikes | Atividade sobre o envelope cortical, zoom orbital e foco regional | Convergência da discretização, conservação na projeção, regressão estrutural e ausência de atividade gráfica inventada |
| **0.5 · Lâmina** | Populações laminares, circuitos feedforward/feedback, tálamo e núcleo reticular quando exigidos pela tarefa | Coluna cortical explodida, seis lâminas legíveis e projeções tálamo-corticais | Testes de conectividade por camada, ritmos reproduzíveis apenas nos circuitos que os sustentam e metas de GPU por LOD |
| **0.6 · Microscopia** | Patches AdEx, AMPA/NMDA/GABA-A/GABA-B, plasticidade de curto prazo e modulação dependente de receptor | Tipos celulares selecionados, dendritos, terminais, vesículas e inspeção sináptica local | Convergência de disparos e correntes, recursos sinápticos limitados, balanço E/I e ensembles de sementes |
| **0.7 · Cognição** | Memória de trabalho, tarefas preditivas hierárquicas, hipocampo apenas em tarefas episódicas/espaciais e entrada simbólica pessoal sobre o núcleo genérico | Comparação espacial entre previsão, erro e atividade; trajetória guiada ligada à tarefa | Desempenho sob evidência ambígua, retenção/recuperação reproduzíveis e controles contra interpretações antecipadas |
| **0.8 · Comportamento** | Leitura motora, acumulação de evidência e núcleos da base em modelos explícitos de seleção de ação | Ação observável, hesitação e retorno visual da escala comportamental ao circuito | Distribuições de escolha e tempo de reação em bandas estatísticas; hipóteses anatômicas documentadas |
| **0.9 · Núcleo compartilhado** | Migração do laço quente para Rust/WASM somente se o perfil justificar, com protocolo de snapshot versionado | Buffers compactos e interpolação idêntica no navegador e no Tauri | Paridade numérica declarada, benchmarks públicos e replay cruzado dentro da tolerância escolhida |
| **1.0 · Atlas vivo** | Presets, gravação, reprodução, importação de estímulos e API estável | Tecidos calibrados, transparência multicamada, pós-processamento adaptativo e descida guiada completa | Documentação de referência, acessibilidade, testes end-to-end e pacotes reproduzíveis |

## Versão atual: 0.4 · Superfície promovida (0.5 pronta para abertura)

### Gate auditado da 0.4 · Superfície

- [x] **0.4-a · Domínio cortical:** grafo k-NN simétrico, separado dos nós internos,
  com CSR, comprimentos de aresta e projeção estável nó→vértice.
- [x] **0.4-b · Campo E/I atrasado:** histórico circular, atraso derivado de
  comprimento/velocidade, populações separadas e limites finitos.
- [x] **0.4-c · Acoplamento:** cada spike cortical é agregado uma vez; a
  realimentação E−I usa a mesma projeção e não alcança cerebelo/tronco.
- [x] **0.4-d · Apresentação fiel:** snapshots independentes no protocolo v2,
  interpolação limitada aos estados publicados e composição sem dupla contagem.
- [x] **0.4-e · Evidência:** testes de topologia, atraso efetivo, conservação da
  projeção, invariantes, convergência temporal, reset/reseed e regressão
  estrutural do renderer.

O relatório de promoção e as limitações aceitas estão em
[AUDIT_0.4.md](AUDIT_0.4.md). A etapa 0.5 pode começar pelo contrato laminar;
ela não deve reinterpretar o grafo k-NN atual como anatomia parcelada.

### Fundação entregue

- [x] relógio de passo fixo e tempo do motor representado por tick inteiro;
- [x] RNG endereçado por semente, fluxo, entidade, tick e ordinal;
- [x] sinapses direcionadas em CSR e redução serial ordenada;
- [x] laço determinístico isolado em Worker e snapshots com cópias próprias;
- [x] cinéticas AMPA/GABA-A separadas e inferência legada fora das equações do motor.

### Gráficos

- [x] interpolação entre snapshots sem avanço da simulação no frame;
- [x] tecido, conectividade, unidades e eventos com buffers de render próprios;
- [x] foco regional e zoom orbital sem alterar o motor;
- [x] HUD com taxa em Hz/nó e estados adimensionais identificados como `u.a.`.

### Backlog transversal não bloqueador

Estes itens não mudam o contrato superficial promovido e podem entrar na trilha
de qualidade da 0.5, antes de qualquer demonstração científica nova:

- [ ] fila genérica de entradas por `(tick, sequence)` e artefato de replay;
- [ ] cadência configurável de snapshots e perfil de CPU/GPU/memória/latência;
- [ ] estudo de convergência específico das correntes AMPA/GABA-A;
- [ ] curvas axonais e ciclos de vida independentes para todas as camadas;
- [ ] capturas visuais automatizadas e auditoria contínua de teclado/contraste.

## Trilhas que atravessam as versões

### Anatomia

A anatomia entra quando existe função para sustentá-la. Tálamo e núcleo reticular acompanham os circuitos tálamo-corticais; hipocampo acompanha memória episódica ou espacial; núcleos da base acompanham seleção de ação. A árvore anatômica completa permanece como vocabulário de expansão, não como obrigação de representar cada estrutura sem comportamento associado.

### Neuroquímica

A progressão parte de receptores ionotrópicos rápidos, passa por receptores lentos e plasticidade de curto prazo e só então alcança neuromodulação. ACh, DA, NE e 5-HT não serão dials globais universais: cada efeito deve declarar origem, projeção, família de receptor, localização, cinética e consequência no circuito. Concentração, ocupação de receptor e efeito funcional permanecem grandezas distintas.

### Topologia e dinâmica coletiva

- Métricas de grafo — modularidade, participação, small-world e rich-club — ficam no domínio da ciência de redes.
- Dimensionalidade e variedade neural entram como instrumentos medidos, sem codificar que atenção necessariamente reduz dimensão.
- Singularidades de fase só entram depois de existir um campo de fase contínuo, estreito em banda e validado.
- Homologia persistente opera em circuitos selecionados ou janelas reduzidas, fora do laço de frame.
- Criticalidade permanece hipótese exploratória. Leis de potência e razão de ramificação não são critérios isolados de aceite.

### Estados globais

Sono e vigília não serão tratados como simples variação de ganho. A exploração desses regimes depende de circuito tálamo-cortical, modulação por receptor, múltiplas escalas de tempo e critérios próprios de validação; por isso permanece uma trilha de pesquisa posterior à fundação fisiológica.

## Limites assumidos

- As regiões atuais são volumes procedurais gerais, não um atlas parcelado.
- Os 1.890 nós atuais são unidades abstratas; quando surgirem patches microscópicos, eles não serão reinterpretados como neurônios individuais de todo o encéfalo.
- `ConvexGeometry` fornece envoltórios visuais e não constitui uma variedade cortical adequada para geodésicas ou Laplace–Beltrami.
- AdEx é um modelo pontual com limiar e reset; não reproduz a forma completa do potencial de ação nem dendritos multicompartimentais.
- Potencial de membrana, potencial extracelular, taxa de disparo e sinal hemodinâmico são observáveis diferentes.
- O LFP inicial será identificado como pseudo-LFP e derivado de uma aproximação documentada de correntes sinápticas.
- Neurônios multicompartimentais, atlas externos e tractografia detalhada não fazem parte do caminho crítico até a 1.0.

As equações e convenções ficam em [MODEL_SPEC.md](MODEL_SPEC.md), a tradução para o código em [ARCHITECTURE.md](ARCHITECTURE.md) e os critérios de evidência em [VALIDATION.md](VALIDATION.md).
