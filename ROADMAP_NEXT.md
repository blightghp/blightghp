# Roadmap revisado · BRAIN PRO [0.8 → 1.0]

Proposta de substituição para [ROADMAP.md](ROADMAP.md). Ela mantém a espinha do
documento original — descer de escala fechando uma resolução por vez — e
acrescenta o que faltava: a leitura visual como trilha com contrato, condição de
entrada e evidência própria, em vez de consequência acidental de cada fase.

Duas mudanças de fundo justificam a revisão.

A primeira é que a apresentação virou gargalo. O motor publica estado celular em
SI, com quatro receptores separados e sinal correto, e a interface reduz tudo a
quatro medidores sem sinal e a doze esferas brancas. Não é falta de dado: é falta
de contrato de imagem. [VISUAL_SPEC.md](VISUAL_SPEC.md) passa a ser esse
contrato, no mesmo nível de [MODEL_SPEC.md](MODEL_SPEC.md).

A segunda é que o documento anterior excluía, até a 1.0, exatamente as peças que
a leitura visual precisa — atlas, morfologia, tractografia. Era uma boa defesa
contra virar maquete. Só que a defesa correta não é proibir a forma; é exigir
proveniência dela. Os limites deixam de ser exclusões e passam a ser condições
de entrada.

## Princípios

Os treze primeiros continuam valendo sem alteração. Dois entram.

1. Métricas, rótulos, luzes e animações devem nascer de estados calculados pelo motor.
2. A simulação avança por ticks fixos; a renderização apenas interpola snapshots publicados.
3. A mesma semente e o mesmo registro ordenado de entradas devem produzir o mesmo resultado na mesma plataforma numérica.
4. Reduções, eventos e consumo de números aleatórios possuem ordem canônica, inclusive quando o trabalho é distribuído.
5. Campo e spikes descrevem a mesma atividade em resoluções diferentes, mas não são somados como fontes independentes na mesma região.
6. O núcleo é indiferente ao conteúdo do estímulo. Experimentos pessoais entram por adaptadores de entrada.
7. Uma aproximação científica deve declarar unidade, escala, hipótese e limite.
8. Realismo gráfico não pode ocultar perda de legibilidade, desempenho ou validade científica.
9. Web, captura automatizada e aplicativo desktop devem reproduzir a mesma experiência observável.
10. Rust é a única fonte de verdade para estado, integração, aleatoriedade, redução e observáveis científicos.
11. WebAssembly é uma fronteira de execução, não um segundo modelo.
12. TypeScript coordena DOM, acessibilidade e apresentação; não integra equações do cérebro.
13. C# só entra como serviço nativo/offline depois de benchmark reproduzível.
14. **Todo elemento visível declara proveniência: estado, topologia ou decoração.**
    Um elemento decorativo nunca é animado por estado, e um elemento de estado
    aponta para um campo do snapshot pelo nome.
15. **Realismo geométrico não implica realismo de modelo.** Uma forma mais
    detalhada só passa de decorativa a estrutural quando tem origem, licença,
    versão e transformação registradas.

## Sequência de versões

| Versão | Motor | Leitura visual | Evidência de conclusão |
| :-- | :-- | :-- | :-- |
| **0.2 · Excitabilidade** | LIF, atrasos, STDP, inferência escalar | atividade por unidade e envoltórios | concluída |
| **0.3 · Fundação** | relógio, RNG endereçado, CSR, Worker | feixes, instrumentos, LOD, interpolação | concluída |
| **0.4 · Superfície** | domínio cortical, campo E/I atrasado | atividade sobre o envelope, zoom orbital | concluída · [AUDIT_0.4.md](AUDIT_0.4.md) |
| **0.5 · Corredor Rust/Wasm** | crate puro, ABI estreita, paridade | shell consumindo snapshots Rust | concluída · [AUDIT_0.5_ENTRY.md](AUDIT_0.5_ENTRY.md) |
| **0.6 · Lâmina e tálamo** | seis lâminas, relé e TRN | aba Lâminas, coluna explodida | concluída · [AUDIT_0.6.md](AUDIT_0.6.md) |
| **0.7 · Célula e eletricidade** | patch AdEx, quatro receptores em SI | abas Célula e Eletricidade | concluída · [AUDIT_0.7.md](AUDIT_0.7.md) |
| **0.8 · Sinapse e química local** | vesícula, fenda, ocupação, plasticidade curta | fundação da apresentação e aba Sinapse em escala µm | conservação, positividade, rigidez, invertibilidade cor↔estado |
| **0.9 · Neurônio resolvido e corte anatômico** | dendrito em três compartimentos, tempo de evento, condução declarada | vista Neurônio, pilha de películas, planos de corte com tampa e sonda | convergência de cabo, evento carimbado, hash invariante ao recorte |
| **0.10 · Transmissão de volume** | núcleos de projeção com função, reação–difusão de moduladores | plumas por substância e os três mapas separados | conservação de massa, positividade, tortuosidade declarada, orçamento de raymarch |
| **0.11 · Sistemas e comportamento** | memória de trabalho, hipocampo, núcleos da base, leitura motora | abas Sistemas, Experimentos e Comportamento | desempenho estatístico, controles nulos, hipóteses documentadas |
| **1.0 · Atlas experimental** | presets, replay, importação, API estável | superfície derivada de atlas com proveniência; todas as vistas | pacotes reproduzíveis, acessibilidade, ponta a ponta, nenhuma alegação além da evidência |

A renumeração é deliberada. O programa visual pedido não cabe como enfeite de
duas fases existentes; ele é trabalho de motor tanto quanto de shader, e merece
seus próprios gates. Chamar isso de 0.8 ampliada seria esconder escopo.

## Estado herdado

As fases 0.2 a 0.7 estão fechadas e auditadas. A fundação entregue permanece:
relógio de passo fixo, RNG endereçado, CSR com redução serial ordenada, campo
E/I atrasado, Worker isolado, cinéticas separadas, contrato laminar com relé e
TRN, patch AdEx com quatro receptores em SI, ABI v5 com 22 buffers e três hashes
independentes.

A auditoria de entrada desta fase está em
[AUDIT_0.8_ENTRY.md](AUDIT_0.8_ENTRY.md). Ela registra dezenove achados; os de
severidade alta e de bloqueio estão distribuídos nos cortes abaixo, e nenhum
corte seguinte pode esconder um achado aberto do anterior.

## 0.8 · Sinapse e química local

A fase desce da célula para a sinapse e, em paralelo, reconstrói o contrato de
apresentação. Os dois trilhos são independentes até o corte final, onde se
encontram na aba Sinapse.

### Trilho de motor

- [x] **0.8-a · Recursos e conservação:** contrato de recurso vesicular,
  unidades, estoques e invariantes de massa e carga congelados antes de qualquer
  código de dinâmica.
- [x] **0.8-b · Plasticidade de curto prazo:** Tsodyks–Markram determinístico,
  com ordem explícita entre evento pré-sináptico, atualização de condutância e
  depleção. Oráculo versionado e replay próprio.
- [x] **0.8-c · Fenda e ocupação:** concentração na fenda com limpeza rápida e
  ocupação por família de receptor em buffer separado da concentração e do
  efeito.
- [x] **0.8-d · Solver e rigidez:** separação de operadores com positividade
  garantida; captação resolvida analiticamente no subpasso. Euler explícito não
  é aceito como recuo silencioso.
- [x] **0.8-e · ABI v6:** estados químicos no snapshot, hash próprio, e os
  hashes anteriores preservados sem alteração.

### Trilho de apresentação

- [x] **0.8-v1 · Fundação:** criar `src/render/` com a interface `RenderLayer`
  já especificada em `ARCHITECTURE.md:404`, mover as três camadas existentes, e
  criar o módulo único de tokens visuais. Elimina os sete hexadecimais
  espalhados por três arquivos.
- [x] **0.8-v2 · Três passes:** separar matéria de emissão, ordenar a
  transparência, aplicar bloom apenas ao alvo de emissão. É o que devolve
  legibilidade à atividade alta e o que torna possível qualquer película
  transparente adiante.
- [x] **0.8-v3 · Corrente com sinal:** substituir a média absoluta dos quatro
  receptores por corrente com sinal e direção, tornando shunt e hiperpolarização
  visualmente distintos.
- [x] **0.8-v4 · Gates:** invertibilidade cor↔estado, modo sem cor, contador de
  proveniência e baseline de desempenho em hardware real, com os campos que
  `VALIDATION.md:96` exige.
- [x] **0.8-v5 · Aba Sinapse:** fenda em escala µm, com vesícula, liberação,
  nuvem de transmissor, ocupação e recaptura — cada etapa presa a um estado
  publicado pelo trilho de motor.

Evidência obrigatória: conservação de massa e carga, positividade em toda
execução, estabilidade no regime de uso, replay químico versionado, testes Cargo
e Vitest, alvo Wasm, e os quatro gates visuais novos passando nas cinco vistas.

## 0.9 · Neurônio resolvido e corte anatômico

A fase entrega o pedido central: um neurônio ampliado e em funcionamento, dentro
de uma anatomia que se pode abrir, cortar e tornar transparente.

- [ ] **0.9-a · Dendrito em três compartimentos:** soma, proximal e distal, com
  estudo de convergência de cabo. É o que autoriza desenhar gradiente dendrítico
  sem inventá-lo.
- [ ] **0.9-b · Tempo de evento na ABI:** carimbo de tempo por spike, na forma
  compacta já usada por `SignalBatch`. Sem isso, propagação axonal animada
  violaria a regra de não criar evento entre snapshots.
- [ ] **0.9-c · Vista Neurônio:** seleção por clique e por teclado na aba
  Célula, palco de célula única, morfologia determinística por semente, axônio
  com nós de Ranvier, propagação saltatória lançada por evento real, e as quatro
  correntes com matiz, direção e cinética próprias.
- [ ] **0.9-d · Pilha de películas:** oito películas ordenadas, com opacidade
  contínua, modo raio-X, isolamento em um gesto e classe de proveniência
  declarada. Substitui as quatro caixas de tudo-ou-nada.
- [ ] **0.9-e · Planos de corte:** coronal, sagital, axial e oblíquo, com tampa
  por estêncil, modo de laje entre dois planos, e sonda de estado pintada na
  face cortada com unidade rotulada.
- [ ] **0.9-f · Superfície dobrada:** substituir a casca convexa por superfície
  com giros e sulcos, gerada do mesmo campo procedural e classificada como
  decorativa até ter proveniência anatômica. A projeção nó→vértice é preservada.

Evidência obrigatória: convergência do cabo dendrítico, igualdade de hash sob
qualquer recorte ou câmera, hash de geometria estável para a mesma semente,
banda de propagação sempre pareada a um evento publicado, orçamento medido antes
e depois, e o gate de invertibilidade estendido às duas vistas novas.

## 0.10 · Transmissão de volume e mapas químicos

A fase responde a "onde a química surge, para onde vai e por onde se espalha" na
escala em que a pergunta é interessante — a do modulador que sai de um núcleo e
banha território.

- [ ] **0.10-a · Núcleos de projeção com função:** nenhuma pluma antes da fonte.
  Cada núcleo entra com circuito, alvo e consequência declarados, seguindo a
  regra da trilha de anatomia.
- [ ] **0.10-b · Reação–difusão no grafo cortical:** laplaciano do grafo CSR
  existente, difusão implícita ou IMEX, captação de Michaelis–Menten analítica
  no subpasso, tortuosidade declarada.
- [ ] **0.10-c · Três mapas separados:** concentração, ocupação e efeito em
  buffers e sobreposições independentes, alternáveis, como
  `MODEL_SPEC.md` já exige do modelo.
- [ ] **0.10-d · Plumas volumétricas:** glifo de fonte, superfície de nível e
  integração no passe de emissão, com resolução de volume escolhida por medição
  de custo.
- [ ] **0.10-e · Substâncias:** tabela única de matiz, glifo, cinética,
  reversão, origem e alvo, consumida pela UI e pelo motor, com teste que rejeita
  divergência entre as duas leituras.

Evidência obrigatória: positividade em toda execução, conservação de massa com
captação desligada, estudo de rigidez no regime de uso, comparação com solução
analítica em domínio simples, e orçamento de raymarch medido.

## 0.11 · Sistemas e comportamento

Sem alteração de escopo em relação à 0.9 original: memória de trabalho, tarefas
preditivas, hipocampo, núcleos da base e leitura motora apenas em tarefas
explícitas, com abas Sistemas, Experimentos e Comportamento.

Um item herdado entra aqui: o experimento bayesiano de `inference.ts` é portado
para o contrato `ExperimentEncoder`/`ExperimentDecoder` de
`ARCHITECTURE.md:357` ou aposentado do painel principal. Hoje ele calcula em
TypeScript uma posterior que entra no drive do motor, ocupa o espaço nobre da
Visão Geral e não tem cobertura de validação. É a última peça de ciência fora do
motor.

## 1.0 · Atlas experimental

Sem alteração de escopo, com um acréscimo: a superfície derivada de atlas passa
a ser entrega desta fase, e não item excluído. Ela entra com registro de origem,
licença, versão e transformação, e com repetição do estudo de convergência do
campo — trocar o domínio muda o operador, e isso não passa como detalhe gráfico.

## Trilhas que atravessam as versões

### Apresentação e anatomia

Trilha nova. A fidelidade anatômica sobe em três degraus, e cada degrau declara
o que é:

- **A0 · envoltório procedural** — casca convexa atual; decorativo; permanece
  como nível de detalhe distante;
- **A1 · superfície dobrada** — giros e sulcos gerados do mesmo campo
  procedural; decorativo, entra na 0.9;
- **A2 · superfície derivada de atlas** — malha externa com proveniência
  registrada; estrutural, entra na 1.0.

Nenhum degrau altera o motor. Todos alteram o que o leitor pode inspecionar. O
contrato completo, incluindo pipeline, cor, animação e gates, está em
[VISUAL_SPEC.md](VISUAL_SPEC.md).

### Anatomia funcional

Regra preservada: a anatomia entra quando existe função para sustentá-la. Tálamo
e núcleo reticular acompanharam os circuitos tálamo-corticais; hipocampo
acompanha memória episódica ou espacial; núcleos da base acompanham seleção de
ação; núcleos de projeção monoaminérgicos acompanham a 0.10. A árvore anatômica
completa continua sendo vocabulário de expansão.

A trilha de apresentação não contorna esta regra. Ela permite desenhar forma
decorativa antes da função; não permite animá-la com estado inventado.

### Neuroquímica

Progressão preservada: receptores ionotrópicos rápidos, depois lentos e
plasticidade de curto prazo, e só então neuromodulação. ACh, DA, NE e 5-HT não
serão controles globais: cada efeito declara origem, projeção, família de
receptor, localização, cinética e consequência. Concentração, ocupação e efeito
funcional permanecem grandezas distintas — e, a partir da 0.10, permanecem
distintas também na imagem.

### Topologia e dinâmica coletiva

Sem alteração. Métricas de grafo, dimensionalidade, singularidades de fase,
homologia persistente e criticalidade seguem com as mesmas condições e reservas.

### Estados globais

Sem alteração. Sono e vigília dependem de circuito tálamo-cortical, modulação por
receptor e múltiplas escalas de tempo; a 0.10 aproxima o requisito de modulação,
mas não o completa.

## Limites, com condição de entrada

O documento anterior listava exclusões até a 1.0. Aqui elas viram condições, e o
que permanece proibido permanece proibido por razão explícita.

| Limite atual | Condição para deixar de valer |
| :-- | :-- |
| regiões são volumes procedurais, não atlas parcelado | A2 na 1.0, com proveniência e novo estudo de convergência |
| casca convexa não é variedade cortical | A1 na 0.9 melhora a leitura sem mudar essa afirmação; só A2 a altera |
| os 1.890 nós são unidades abstratas | não muda; patches microscópicos nunca serão reinterpretados como neurônios de todo o encéfalo |
| AdEx é modelo pontual, sem forma completa do potencial de ação | não muda; a propagação axonal desenhada é apresentação declarada |
| dendrito é compartimento único | 0.9-a, com convergência de cabo testada |
| não há tempo de evento por célula | 0.9-b |
| não há vesícula, concentração, ocupação nem cascata | 0.8 |
| retorno do patch para o campo desligado | só com gate de estabilidade bilateral; sem data |
| LFP inicial é pseudo-LFP | não muda enquanto o modelo for pontual |
| tractografia detalhada | fora do caminho crítico; feixes principais entram como topologia na 0.10 |

Potencial de membrana, potencial extracelular, taxa de disparo e sinal
hemodinâmico continuam sendo observáveis diferentes, com buffers e rótulos
diferentes.

## Ordem de trabalho autorizada

1. **0.8-v1** e **0.8-v2** — a fundação da apresentação destrava tudo o mais e
   não depende de física nova;
2. **0.8-a** — o contrato de recursos precede qualquer código de dinâmica
   química;
3. **0.8-v3** e **0.8-v4** — correção de sinal e gates, antes de acrescentar
   superfície visual;
4. daí em diante, os cortes na ordem listada.

As equações e convenções ficam em [MODEL_SPEC.md](MODEL_SPEC.md), a tradução
para o código em [ARCHITECTURE.md](ARCHITECTURE.md), os critérios de evidência
em [VALIDATION.md](VALIDATION.md) e o contrato de imagem em
[VISUAL_SPEC.md](VISUAL_SPEC.md).
