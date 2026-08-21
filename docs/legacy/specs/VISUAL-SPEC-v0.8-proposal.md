# LEGACY — Contrato de apresentação da proposta 0.8

> **LEGACY — documento preservado para rastreabilidade histórica. Foi incorporado a [GRAPHICS_SPEC.md](../../specifications/GRAPHICS_SPEC.md). Não deve ser utilizado como instrução vigente de implementação.**

Este documento faz para a imagem o que [MODEL_SPEC.md](../../specifications/MODEL_SPEC.md) faz para a
matemática: declara o que cada elemento visível significa, de onde vem seu valor
e o que ele não afirma. Ele nasce de uma dificuldade concreta — quero mostrar
anatomia, corte, película transparente, um neurônio ampliado em funcionamento e
a química se espalhando, sem que nada disso vire encenação.

A regra que organiza tudo é uma só: **a câmera escolhe o que mostrar, nunca qual
equação executar** (`../../specifications/ARCHITECTURE.md:351`). Ampliar não resolve mais física.
Ampliar revela a resolução que o motor já calcula, e diz qual é.

## 1. Proveniência de cada elemento

Todo objeto na cena pertence a exatamente uma classe, declarada no código e
verificada no gate visual.

| Classe | Significado | Pode ser animado por | Exemplo |
| :-- | :-- | :-- | :-- |
| **E · estado** | valor lido de um snapshot publicado | o próprio estado, com interpolação limitada aos valores publicados | cor do soma por `membraneVolts[i]` |
| **T · topologia** | estrutura fixa vinda da geração ou do preset | nada; muda só quando a topologia muda | traçado de uma via L4→L2/L3 |
| **D · decoração** | forma que existe para orientar o olho | tempo e câmera, jamais estado | dobra giral da superfície, névoa, grade ambiente |

Três consequências diretas:

- um elemento **D** que pulsa com atividade vira uma alegação falsa; o gate
  rejeita;
- um elemento **E** precisa apontar para um campo do snapshot pelo nome, e esse
  apontamento é testável;
- a legenda de cada vista lista quantos elementos de cada classe estão visíveis.
  O leitor sabe o que está olhando sem ler o código.

Realismo geométrico nunca implica realismo de modelo. Uma superfície dobrada é
mais bonita e não é mais verdadeira; ela é **D** até existir proveniência
anatômica declarada, e nesse dia vira **T**.

## 2. Pipeline de apresentação

O pipeline atual tem um defeito estrutural: quase todo material usa mistura
aditiva sem escrita de profundidade, e o bloom cobre a cena inteira. Com isso,
atividade alta satura para branco e a codificação morre. Nenhuma transparência
entre películas é confiável nesse regime, porque não existe ordem.

O pipeline passa a ter três passes.

```text
1. MATÉRIA     alfa, escrita de profundidade, ordenada de trás para frente
               películas anatômicas, membranas, corpo celular, axônio
2. EMISSÃO     aditivo, sem escrita de profundidade, testado contra 1
               correntes, pulsos, campos, química
3. COMPOSIÇÃO  bloom aplicado somente ao alvo de emissão; exposição e
               mapeamento de tom aplicados ao conjunto
```

Ordenação da transparência: as películas anatômicas são cascas aninhadas, então
ordenam-se trivialmente por raio, do exterior para o interior. Isso dispensa
transparência independente de ordem no caso geral. A vista de neurônio, onde
árvore dendrítica e axônio se cruzam, usa mistura ponderada em alvo separado; o
custo é medido antes de ser adotado.

Consequência para o bloom: ele deixa de ser um controle global de estética e
passa a ter teto. A luminância codifica intensidade, e um bloom que estoura o
teto apaga a informação. O gate de invertibilidade (§9) é o que impede isso de
voltar.

## 3. Pilha de películas

A anatomia entra como uma pilha ordenada de películas, cada uma com opacidade
contínua, e não como quatro caixas de tudo-ou-nada.

| Ordem | Película | Classe | Entra em |
| :-- | :-- | :-- | :-- |
| 0 | crânio e escalpo | D | opcional, desligada por padrão |
| 1 | meninges | D | opcional |
| 2 | superfície pial com giros e sulcos | D → T | 0.9 |
| 3 | manto cortical com espessura laminar L1–L6 | E | 0.9 |
| 4 | substância branca e feixes principais | T | 0.10 |
| 5 | núcleos profundos: tálamo, TRN, e os que ganharem função | E | conforme a função existir |
| 6 | ventrículos | D | opcional |
| 7 | coluna e patch microscópico | E | já existe |

Cada película expõe quatro controles:

- `opacidade` contínua de 0 a 1;
- `raio-X`, que mantém apenas a borda de silhueta e o realce de aresta,
  deixando o interior visível sem apagar a referência de forma;
- `recorte`, que decide se a película participa dos planos de corte;
- `isolar`, que leva as demais para uma opacidade residual em um gesto só.

O modo raio-X é o que responde ao pedido de "deixar transparente certa película
para ver outra funcionando". Ele não é opacidade baixa: opacidade baixa some com
a forma e deixa o leitor perdido. A borda preservada mantém a referência
espacial enquanto o interior trabalha.

Regra de honestidade: uma película **D** desaparece do contador de proveniência
quando está em raio-X, mas continua listada na legenda como decorativa. O leitor
nunca deve confundir a casca que orienta com o tecido que calcula.

## 4. Planos de corte

Quatro planos: coronal, sagital, axial e um oblíquo livre. Implementação por
recorte local de material, com o motor intocado.

Três exigências separam um corte útil de um modelo quebrado.

**Tampa.** Um recorte cru deixa a casca oca e o resultado parece defeito. A face
cortada recebe tampa por estêncil: as faces traseiras incrementam o estêncil, as
dianteiras decrementam, e um quadrilátero no plano é desenhado onde o estêncil
sobrou. A tampa é sólida e a peça parece seccionada, não vazada.

**Sonda.** A tampa não é geometria morta: ela é pintada com o estado no plano.
Atividade de campo, atividade laminar e concentração química são amostradas na
posição de cada pixel da tampa e mapeadas pela rampa da grandeza escolhida. É
assim que um plano de corte mostra funcionamento em vez de mostrar apenas
espessura. A grandeza exibida é escolhida pelo leitor e aparece rotulada com
unidade na borda do corte.

**Fatia.** Dois planos paralelos com distância `d` produzem uma laje. É o gesto
que permite olhar uma faixa coronal inteira sem perder profundidade, e é o mais
próximo do que se faz em uma preparação real.

Invariante testável: mudar plano, espessura ou orientação **não altera nenhum
hash do motor**. Esse teste já existe em espírito em `../../quality/VALIDATION.md:81`, como
independência da câmera, e passa a cobrir também o recorte.

## 5. Escada de escalas e a vista de neurônio

As cinco abas da 0.8 viram degraus explícitos de uma escada, e o menu superior
passa a mostrar em qual degrau o leitor está e qual resolução é autoritativa
naquele degrau.

| Degrau | Extensão típica | Resolução autoritativa | Vista |
| :-- | :-- | :-- | :-- |
| Encéfalo | dezenas de cm | rede abstrata + campo E/I | Visão Geral |
| Região | cm | campo E/I por vértice | Superfície |
| Coluna | mm | populações laminares e circuito talâmico | Lâminas |
| Patch | centenas de µm | doze células AdEx | Célula |
| Neurônio | dezenas de µm | uma célula AdEx e seus receptores | **Neurônio** |
| Sinapse | µm | fenda, vesícula, ocupação | **Sinapse** |

O selo de resolução é obrigatório. Ele evita a leitura errada mais comum de um
simulador multiescala: achar que ampliar produz detalhe novo. Ampliar do patch
para o neurônio não muda equação nenhuma; muda o que está enquadrado.

### 5.1 Como se chega ao neurônio

Na vista Célula, um clique em qualquer soma dispara seleção por raycast contra
as doze instâncias. A câmera transita para o palco de célula única, o painel
troca para os estados daquela célula, e o menu superior ganha o degrau Neurônio
com o índice selecionado. Teclado: `Tab` percorre as células, `Enter` amplia,
`Escape` volta. A seleção é estado de interface e não toca o motor.

### 5.2 O que o neurônio mostra

| Elemento | Classe | Fonte |
| :-- | :-- | :-- |
| soma | E | `membraneVolts[i]` pela rampa de voltagem |
| cone de implantação | E | mesma voltagem, com realce próximo do limiar |
| árvore dendrítica | E ou D, conforme §5.3 | `dendriteVolts[i]` |
| espinhas e sítios pós-sinápticos | T | posição derivada do preset |
| axônio mielinizado e nós de Ranvier | D na geometria, E na propagação | evento de spike carimbado |
| botões terminais | E | liberação, quando a 0.8 publicar |
| correntes AMPA, NMDA, GABA-A, GABA-B | E | corrente com sinal, por receptor |
| adaptação | E | `adaptationAmperes[i]`, como dessaturação lenta |

A morfologia é gerada deterministicamente a partir do índice da célula e de um
fluxo próprio do RNG endereçado. A mesma semente produz a mesma árvore, em
qualquer máquina e em qualquer replay. Morfologia que muda a cada recarga não é
ilustração: é ruído.

**Propagação do potencial de ação.** O spike publicado lança uma banda que sobe
do cone de implantação e desce o axônio, saltando entre nós de Ranvier. A
posição é `v·(t − t_spike)` com `v` declarada como constante de apresentação,
porque o modelo pontual não tem cabo axonal e eu não vou fingir que tem. A banda
só existe se houver evento publicado; ela nunca é criada por interpolação entre
snapshots. Isso exige que a ABI publique tempo de spike por célula, e não apenas
a flag por tick que existe hoje.

**Correntes na membrana.** Cada receptor tem matiz próprio e direção derivada do
sinal da corrente: entrada despolarizante flui em direção ao soma, saída
hiperpolarizante flui para fora. A frequência da animação vem da constante de
tempo do receptor — AMPA em 5 ms é visivelmente rápida, GABA-B em 150 ms é
visivelmente lenta. A animação ensina a cinética em vez de decorar a cena.

Quando `E_rev` e `V` se aproximam, a corrente tende a zero mesmo com condutância
alta. Nesse caso o fluxo para e a condutância aparece como um anel presente e
imóvel. Inibição por shunt precisa ser legível como o que é: um caminho aberto
que não empurra carga. É exatamente o ponto que `../../specifications/MODEL_SPEC.md:203` exige não
reduzir ao nome do receptor.

### 5.3 A escolha que precede o desenho

O motor tem hoje um único compartimento dendrítico. Existem dois caminhos
honestos e nenhum terceiro:

- **árvore ilustrativa:** toda a árvore recebe uma cor só, a do compartimento
  publicado, e a legenda diz que o dendrito é um compartimento. Barato, honesto,
  visualmente pobre;
- **três compartimentos no motor:** soma, dendrito proximal e distal, com
  convergência de cabo testada. Aí existe gradiente real para mostrar, e o
  desenho fica rico porque o modelo ficou mais rico.

Prefiro o segundo, na 0.9, e mantenho o primeiro como estado intermediário
rotulado. O que não pode acontecer é pintar um gradiente inventado sobre um
compartimento único.

## 6. Química: onde surge, para onde vai, por onde se espalha

Esta é a parte do pedido que mais depende do motor e menos depende do shader.
Ela se divide em duas escalas com físicas diferentes.

### 6.1 Transmissão pontual — a fenda (0.8)

Estados por sinapse, todos em Rust:

- recurso disponível `R` e utilização `u`, pela convenção de Tsodyks–Markram já
  escrita em `../../specifications/MODEL_SPEC.md:226`;
- quanta liberados no evento pré-sináptico;
- concentração na fenda `[T]`, com limpeza rápida;
- ocupação por família de receptor `O_r`.

Encenação, com cada etapa presa a um estado:

| Etapa | Estado que a autoriza |
| :-- | :-- |
| vesículas povoando a zona ativa | `R` |
| fusão e liberação | evento pré-sináptico com quanta > 0 |
| nuvem atravessando a fenda | `[T]` acima do limiar de exibição |
| receptores acendendo | `O_r` |
| recaptura por transportador | termo de remoção |
| depleção visível do estoque | queda de `R` |

Sem estado, sem animação. Um botão terminal que pulsa sem evento publicado é o
mesmo erro que uma luz de nó pulsando sem spike.

**Implementação 0.8-v5.** `SynapseRenderLayer` enquadra um microdomínio de
aproximadamente `1 µm`; a espessura da fenda é exagerada e rotulada como tal.
Reserva vesicular controla presença/escala das vesículas, o último evento e seu
tempo controlam a fusão, concentração controla densidade da nuvem, ocupação
controla os quatro anéis receptores e o delta da remoção entre snapshots
controla os transportadores. Posições e membranas são topologia; nenhum objeto
decorativo recebe animação de estado.

### 6.2 Transmissão de volume — o espraiamento (0.10)

Para moduladores — dopamina, acetilcolina, noradrenalina, serotonina — a
transmissão relevante não é pontual. É liberação por varicosidade, difusão no
espaço extracelular e captação. O modelo correspondente é reação–difusão, que
[MODEL_SPEC.md](../../specifications/MODEL_SPEC.md) já antecipa como classe de solver:

$$
\frac{\partial C}{\partial t} = D^{*}\nabla^{2}C + S(x,t) - \frac{V_{\max}C}{K_m + C},
\qquad D^{*} = \frac{D}{\lambda^{2}}.
$$

Decisões numéricas que fazem parte do contrato, não do ajuste:

- o domínio é o **grafo cortical CSR que já existe**, com o laplaciano do grafo
  no lugar do operador contínuo. Nenhuma malha nova, nenhum contrato geométrico
  novo, e a projeção nó→vértice continua valendo;
- separação de operadores: difusão implícita ou IMEX, captação de
  Michaelis–Menten resolvida analiticamente no subpasso. Euler explícito sobre o
  termo de captação perde positividade e não entra;
- invariantes testados: positividade em toda execução, e conservação de massa
  com captação desligada e fontes nulas;
- `λ` é tortuosidade declarada, não parâmetro de ajuste visual.

Encenação: uma pluma volumétrica por substância, com glifo de fonte no núcleo de
projeção, e superfície de nível na concentração escolhida. Renderização por
textura tridimensional grosseira reconstruída por snapshot e integrada no passe
de emissão, com orçamento declarado — a resolução do volume é escolhida por
medição de custo, não por aparência.

**Condição de entrada, e ela é rígida.** Os núcleos de projeção não existem no
modelo. Desenhar uma pluma dopaminérgica antes de existir uma fonte com função
seria inventar atividade, que é o que o princípio 1 do roadmap proíbe. Então a
0.8 mostra só glutamato e GABA na fenda, onde o estado é real, e a pluma espera
os núcleos ganharem circuito na 0.10.

### 6.3 Três mapas, nunca um

`../../specifications/MODEL_SPEC.md:303` exige que concentração, ocupação e efeito funcional vivam em
buffers diferentes. A apresentação sustenta essa separação com três sobreposições
independentes e alternáveis:

- **concentração** — quanto há, e onde;
- **ocupação** — quanto está ligado ao receptor;
- **efeito** — o que mudou no circuito.

Ver as três divergirem no tempo é a melhor aula que este simulador pode dar
sobre neuromodulação. Fundi-las em um só brilho seria desfazer, na imagem, a
distinção que o modelo faz questão de manter.

## 7. Sistema de cor

Fonte única em `src/render/visual-tokens.ts`. Nenhum literal de cor fora dele.

### 7.1 Eixos semânticos separados

Cada eixo ocupa um canal visual próprio, e eles não se sobrepõem.

| Eixo | Canal | Regra |
| :-- | :-- | :-- |
| identidade química ou de elemento | matiz | matiz é reservada; nunca reutilizada em outro eixo |
| intensidade ou concentração | luminância e alfa | rampa perceptualmente uniforme em OKLCH, não interpolação em sRGB |
| direção do fluxo | sentido da animação e padrão de traço | pista redundante, legível sem cor |
| cinética | frequência da animação | derivada da constante de tempo do modelo |
| estado elétrico | rampa divergente de voltagem | ancorada em marcos físicos |

A interpolação em sRGB, usada hoje via `lerp`, embarra os tons intermediários e
faz duas intensidades diferentes parecerem iguais. A rampa perceptual resolve
isso e é pré-computada em tabela, sem custo por frame.

### 7.2 Rampa de voltagem

Ancorada onde a fisiologia tem marcos, não em passos arbitrários:

| Marco | Valor | Leitura |
| :-- | :-- | :-- |
| `E_K` | −90 mV | extremo hiperpolarizado |
| repouso e `E_Cl` | −70 mV | ponto neutro da rampa |
| limiar exponencial | −50 mV | mudança de inclinação perceptível |
| `E_AMPA`, `E_NMDA` | 0 mV | extremo despolarizado |
| registro de evento | −30 mV | marca de spike |

O ponto neutro em −70 mV é o que permite ler despolarização e hiperpolarização
como direções opostas, e não como "mais claro" e "menos claro".

### 7.3 Tabela de substâncias

Uma linha por substância, com matiz, glifo, constante de tempo, reversão, origem
e alvo. A tabela é a mesma que o modelo consome: se a UI listar uma constante de
tempo diferente da do motor, o teste falha. Nenhum número fisiológico é digitado
duas vezes.

Os matizes atuais precisam ser refeitos: glutamato e GABA hoje disputam a mesma
região de azul e violeta que regiões, relé, TRN e feedback também usam. Com seis
substâncias e cinco tipos de via, sete matizes ad hoc não bastam. A alocação
segue duas restrições — distância perceptual mínima entre matizes vizinhos, e
distinguibilidade sob as três formas comuns de daltonismo.

## 8. Vocabulário de animação

Cinco primitivas. Nada fora desta lista se move por estado.

| Primitiva | Transição que a autoriza | Duração |
| :-- | :-- | :-- |
| **propagação** | evento discreto com carimbo de tempo | distância dividida pela velocidade declarada |
| **liberação** | evento pré-sináptico | constante de limpeza da fenda |
| **difusão** | crescimento de campo escalar | passo do solver |
| **recaptura** | termo de remoção ativo | constante de captação |
| **respiração** | estado contínuo dentro de faixa | constante de tempo do estado |

Qualquer outro movimento é decorativo, declarado como **D** e independente de
estado. Rotação orbital e névoa são decorativos e continuam existindo; eles só
não podem se disfarçar de fenômeno.

Movimento reduzido: cada primitiva tem equivalente estático que carrega a mesma
informação — a banda de propagação vira marca de posição, a difusão vira
superfície de nível fixa. Reduzir movimento não pode reduzir informação.

## 9. Gates da apresentação

Estes entram em `scripts/audit_runtime.js` e passam a bloquear promoção.

| Gate | Critério |
| :-- | :-- |
| invertibilidade cor↔estado | amostrar pixels de estado conhecido em cada vista e recuperar o estado pela rampa inversa, dentro de tolerância declarada por grandeza |
| teto de bloom | nenhuma região codificada satura; a invertibilidade acima é o que mede isso |
| redundância de codificação | modo sem cor ativo, e toda distinção semântica permanece legível por forma, padrão ou rótulo |
| proveniência | todo objeto da cena declara classe; nenhum objeto **D** referencia campo de snapshot |
| independência do recorte | plano, espessura e orientação não alteram hash algum do motor |
| determinismo da morfologia | a mesma semente produz a mesma árvore dendrítica, verificado por hash de geometria |
| orçamento por vista | draw calls, triângulos e bytes por snapshot dentro do teto declarado para a vista |
| contraste e teclado | critérios atuais, mais navegação até a célula selecionada e de volta |

## 10. Orçamento

Cada vista declara teto antes de ser implementada, e a medição em hardware real
precede a comparação. Sem baseline anterior, "ficou mais pesado" não é uma
afirmação verificável.

| Vista | Teto de draw calls | Observação |
| :-- | :-- | :-- |
| Visão Geral | o atual mais a pilha de películas | películas são cascas únicas, baratas em draws e caras em preenchimento |
| Lâminas | atual, três níveis de detalhe preservados | |
| Célula | atual | |
| Neurônio | a declarar na 0.9 | morfologia instanciada, não uma malha por ramo |
| Química | a declarar na 0.10 | o raymarch domina; a resolução do volume é escolhida por medição |

Regra que não muda: se o motor atrasar, a interface reduz nível de detalhe ou
cadência de snapshot. Ela nunca aumenta `dt` (`../../quality/VALIDATION.md:108`).

## 11. O que este contrato não afirma

- Não afirma que uma superfície dobrada seja uma superfície cortical anatômica.
- Não afirma que uma árvore dendrítica desenhada corresponda à morfologia de
  algum tipo celular.
- Não afirma que a velocidade de propagação exibida no axônio seja medida; ela é
  constante de apresentação declarada.
- Não afirma que uma pluma de modulador represente distribuição real de
  receptores, transportadores ou densidade de varicosidades.
- Não afirma que um plano de corte corresponda a um plano de referência clínico.
- Não afirma que atividade visualmente coerente seja evidência fisiológica.

A sequência em que estes elementos entram, e a condição de entrada de cada um,
estão na [proposta de roadmap arquivada](../roadmaps/ROADMAP-NEXT-v0.8-proposal.md). Os achados que motivaram este
contrato estão em [AUDIT_0.8_ENTRY.md](../../audits/0.8/AUDIT_0.8_ENTRY.md).
