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
| **0.4 · Superfície** | Malha cortical adequada, campo populacional E/I, atrasos de condução e primeiro acoplamento campo/spikes | Sulcos e giros coerentes com a malha, ondas superficiais e zoom contínuo até um circuito selecionado | Convergência da discretização, conservação no acoplamento, regressão visual e ausência de atividade gráfica inventada |
| **0.5 · Lâmina** | Populações laminares, circuitos feedforward/feedback, tálamo e núcleo reticular quando exigidos pela tarefa | Coluna cortical explodida, seis lâminas legíveis e projeções tálamo-corticais | Testes de conectividade por camada, ritmos reproduzíveis apenas nos circuitos que os sustentam e metas de GPU por LOD |
| **0.6 · Microscopia** | Patches AdEx, AMPA/NMDA/GABA-A/GABA-B, plasticidade de curto prazo e modulação dependente de receptor | Tipos celulares selecionados, dendritos, terminais, vesículas e inspeção sináptica local | Convergência de disparos e correntes, recursos sinápticos limitados, balanço E/I e ensembles de sementes |
| **0.7 · Cognição** | Memória de trabalho, tarefas preditivas hierárquicas, hipocampo apenas em tarefas episódicas/espaciais e entrada simbólica pessoal sobre o núcleo genérico | Comparação espacial entre previsão, erro e atividade; trajetória guiada ligada à tarefa | Desempenho sob evidência ambígua, retenção/recuperação reproduzíveis e controles contra interpretações antecipadas |
| **0.8 · Comportamento** | Leitura motora, acumulação de evidência e núcleos da base em modelos explícitos de seleção de ação | Ação observável, hesitação e retorno visual da escala comportamental ao circuito | Distribuições de escolha e tempo de reação em bandas estatísticas; hipóteses anatômicas documentadas |
| **0.9 · Núcleo compartilhado** | Migração do laço quente para Rust/WASM somente se o perfil justificar, com protocolo de snapshot versionado | Buffers compactos e interpolação idêntica no navegador e no Tauri | Paridade numérica declarada, benchmarks públicos e replay cruzado dentro da tolerância escolhida |
| **1.0 · Atlas vivo** | Presets, gravação, reprodução, importação de estímulos e API estável | Tecidos calibrados, transparência multicamada, pós-processamento adaptativo e descida guiada completa | Documentação de referência, acessibilidade, testes end-to-end e pacotes reproduzíveis |

## Versão Atual: 0.3 · Fundação Concluída (Próxima: 0.4 · Superfície)

### Estado da implementação (0.3 · Fundação)

- [x] **0.3-a · Relógio e contrato:** ticks inteiros, separação passo/frame, captura exata, protocolo versionado e snapshots com arrays tipados.
- [x] **0.3-b · Memória e isolamento:** RNG endereçado, CSR, observáveis online, Worker serial e cinética AMPA/GABA-A.
- [x] **0.3-c · Renderização:** snapshots interpolados, camadas de render extraídas em `render-layers.ts`, foco de circuito / LOD e HUD com instrumentos e unidades nomeadas.

### Motor

- Extrair do `main.ts` o relógio de passo fixo e representar o tempo do motor por um tick inteiro.
- Agendar toda entrada para um tick e desempatar eventos por um número de sequência monotônico.
- Substituir o ruído derivado de ordem de chamada por um RNG indexado por semente, fluxo, entidade, tick e ordinal do evento.
- Ordenar arestas por origem e destino, armazená-las em CSR e definir a ordem de toda acumulação sináptica.
- Executar inicialmente um único laço determinístico no Worker. Paralelismo interno só entra com partições e fusão ordenadas.
- Publicar snapshots compactos em frequência menor que a integração, sem expor buffers mutáveis do núcleo ao renderer.
- Introduzir AMPA e GABA-A depois que os testes de convergência definirem o maior passo temporal aceitável. NMDA, GABA-B e AdEx permanecem na escala microscópica da 0.6.
- Manter a inferência atual como experimento legado até existir o contrato genérico de tarefas; ela não será transformada artificialmente em uma força física do motor.

### Gráficos

- Substituir segmentos longos por curvas axonais e indicar direção e natureza da conexão por forma, movimento e cor.
- Interpolar os dois snapshots mais recentes sem avançar a simulação durante o frame.
- Separar tecido, campo, conectividade, unidades, eventos e instrumentos em camadas de render com ciclos de vida próprios.
- Adicionar foco de circuito com redução gradual de contexto e níveis de detalhe para pontos, linhas, envoltórios e pulsos.
- Substituir no HUD grandezas ambíguas por sinais nomeados, com unidade, janela temporal e método de cálculo.
- Entregar a primeira estação da descida guiada: do cérebro inteiro a um circuito, ainda sem prometer detalhe celular inexistente.

### Qualidade

- Fixar vetores de referência para o RNG, o relógio, a ordenação de eventos e pequenos circuitos sem ruído.
- Testar invariantes físicos e numéricos separadamente dos fenômenos emergentes.
- Escolher o passo de integração por estudo de convergência, não por um valor decidido de antemão.
- Comparar replay, snapshots e métricas antes e depois da passagem para o Worker.
- Medir CPU, GPU, memória, latência de publicação e tamanho do bundle em configurações de hardware identificadas.
- Capturar vistas de referência e testar teclado, contraste e preferência por movimento reduzido.

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
