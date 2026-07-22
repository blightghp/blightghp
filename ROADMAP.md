# Roadmap · Sinapse Formalista

O experimento evolui em duas frentes inseparáveis: o comportamento do motor e a forma como esse comportamento aparece na tela. Uma versão só é considerada concluída quando a melhoria visual representa dados reais da simulação e possui testes proporcionais ao risco introduzido.

## Princípios

1. Métricas, rótulos e animações devem corresponder ao estado calculado pelo motor.
2. A mesma semente e a mesma sequência de entradas devem produzir o mesmo resultado.
3. Ganhos de realismo visual não podem esconder perda de legibilidade ou de desempenho.
4. Aproximações científicas devem ser descritas como aproximações, com seus limites visíveis na documentação.
5. Web, captura automatizada e aplicativo desktop devem compartilhar a mesma experiência.

## Versões

| Versão | Motor | Realismo gráfico | Evidência de conclusão |
| :-- | :-- | :-- | :-- |
| **0.2 · Excitabilidade** | Potencial de membrana, limiar, refratariedade, sinapses direcionadas, atrasos, excitação, inibição, STDP e atualização Bayesiana | Atividade por neurônio, intensidade por conexão, pulsos sinápticos reais, envoltórios anatômicos, legenda funcional e traçado de disparos | Determinismo, pesos limitados, caminhos simples, inferência normalizada e métricas extraídas do grafo |
| **0.3 · Circuitos** | Comunidades funcionais, projeções de longa distância, entrada e leitura explícitas, armazenamento CSR e execução em Web Worker | Feixes axonais curvos, direção visível do sinal, seleção de circuitos, profundidade atmosférica e níveis de detalhe | Orçamento de frame em três classes de GPU, teste de conectividade por circuito e comparação antes/depois do Worker |
| **0.4 · Memória** | Memória de trabalho recorrente, traços de elegibilidade, homeostase e tarefas curtas de retenção | Superfície cortical com sulcos procedurais, mapa térmico temporal, histórico de pesos e câmera guiada por eventos | Cenários reproduzíveis de retenção, esquecimento e recuperação; regressão visual das vistas principais |
| **0.5 · Predição** | Codificação preditiva, erro por camada, hipóteses concorrentes e leitura de decisão | Camadas anatômicas explodidas, comparação entre previsão e erro, iluminação volumétrica e composição cinematográfica | Experimentos documentados, calibração dos parâmetros e testes de decisão sob evidência ambígua |
| **0.6 · Núcleo compartilhado** | Crate Rust para topologia e simulação, compilado nativamente no Tauri e para WebAssembly no navegador | Interpolação entre snapshots, buffers compactos e renderização desacoplada da frequência do motor | Paridade numérica web/desktop, benchmarks públicos e protocolo de serialização versionado |
| **1.0 · Atlas vivo** | Presets de experimento, gravação e reprodução, importação de estímulos e API estável | Materiais de tecido calibrados, transparência multicamada, pós-processamento adaptativo, acessibilidade e modo de apresentação | Documentação de referência, metas de desempenho, testes end-to-end e pacote desktop reproduzível |

## Próxima versão: 0.3 · Circuitos

### Motor

- Separar nós sensoriais, interneurônios e unidades de leitura sem confundir essas funções com regiões anatômicas.
- Trocar listas de adjacência por armazenamento CSR com arrays tipados.
- Levar os passos fixos para um Web Worker e transferir apenas snapshots compactos.
- Criar projeções de longa distância com orçamento próprio de atraso e peso.
- Medir atividade por circuito, sincronização e custo de cada etapa da simulação.

### Gráficos

- Substituir segmentos retos de longa distância por curvas axonais suaves.
- Indicar direção e tipo da sinapse sem depender apenas de cor.
- Adicionar foco de circuito com redução gradual de contexto, em vez de ocultação abrupta.
- Introduzir profundidade atmosférica leve e bloom adaptativo à exposição.
- Criar níveis de detalhe para pontos, linhas, envoltórios e pulsos.

### Qualidade

- Definir orçamentos de tempo de CPU, GPU, memória e tamanho do bundle.
- Capturar vistas de referência em desktop, tablet e celular.
- Testar navegação por teclado, contraste e preferência por movimento reduzido.
- Registrar no HUD apenas métricas calculadas, com unidade e janela temporal explícitas.

## Limites atuais

- As regiões representam volumes anatômicos gerais, não um atlas cortical parcelado.
- A dinâmica é uma aproximação visual de neurônios pulsados, não uma simulação biofísica multicompartimental.
- A atualização Bayesiana trabalha com duas hipóteses e uma observação escalar.
- A plasticidade modifica sinapses excitatórias, mas ainda não possui homeostase de longo prazo.
- O runtime Rust empacota a aplicação; o cálculo neural permanece no navegador até a versão 0.6.
