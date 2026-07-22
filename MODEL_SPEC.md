# Especificação do modelo

Este documento define o significado dos estados e das equações planejadas. Ele não descreve como se toda a fisiologia já existisse no código: cada seção indica a escala em que passa a valer e as simplificações que permanecem.

## Convenções

- O tempo interno usa segundos; a interface pode apresentá-lo em milissegundos.
- Potenciais elétricos usam volts no núcleo futuro e milivolts apenas na apresentação.
- Condutâncias, correntes e concentrações devem declarar a unidade no tipo de configuração ou no nome do campo.
- Índices de unidade, sinapse, vértice e região não são intercambiáveis.
- O tempo do motor é um tick inteiro. O valor físico é `tick * dt`.
- Posições atuais estão em coordenadas procedurais sem unidade anatômica. Velocidade de condução física só será introduzida quando a geometria tiver escala declarada.

## Escalas do estado

| Escala | Estado principal | Interpretação |
| :-- | :-- | :-- |
| Rede atual | potencial, ativação, refratariedade e traços por unidade | Aproximação pulsada fenomenológica |
| Campo | atividade E/I por vértice da malha | Estado populacional macroscópico |
| Patch microscópico | potencial, adaptação, condutâncias e eventos por célula | Amostra local resolvida em spikes |
| Sinapse | eficácia, atraso, receptor e recursos de liberação | Canal causal entre unidades |
| Tarefa | estímulo codificado, hipótese e erro definidos pelo experimento | Conteúdo cognitivo fora do núcleo biofísico |
| Observação | taxa, pseudo-LFP, espectro, dispersão e demais leituras | Derivados; não realimentam o motor por padrão |

## Campo e spikes: duas resoluções, uma atividade

Campo e spikes representam a mesma atividade em escalas diferentes. Isso não significa que compartilhem a mesma equação ou que seus valores possam ser somados diretamente.

Durante a 0.3, os spikes continuam sendo o estado integrado e o campo é apenas uma leitura agregada. A partir da 0.4, o campo passa a representar o domínio macroscópico. Quando um patch microscópico surgir na 0.6, ele substitui a contribuição do campo no suporte espacial selecionado.

Para uma janela de acoplamento `ΔT`, a atividade microscópica agregada no vértice `v` é

$$
r_v[k] = \frac{1}{\Delta T}\sum_{i \in P_v} q_{vi}\,N_i[k],
$$

onde `N_i[k]` é o número de disparos da célula `i` na janela e `q` contém pesos de projeção normalizados. O estado apresentado usa uma máscara de resolução:

$$
a_v = (1-m_v)\,u_v + m_v\,r_v, \qquad 0 \le m_v \le 1.
$$

Assim, a região microscópica substitui gradualmente a macroscópica, em vez de duplicá-la. O campo fornece condições de contorno e drive ao patch; o retorno do patch usa a média acima e só será ativado depois de testes de estabilidade e conservação.

## Unidade microscópica

O modelo-alvo para patches é o Adaptive Exponential Integrate-and-Fire:

$$
C\frac{dV_i}{dt} = -g_L(V_i-E_L)
+ g_L\Delta_T\exp\!\left(\frac{V_i-V_T}{\Delta_T}\right)
- w_i + I_i^{\mathrm{syn}} + I_i^{\mathrm{ext}} + I_i^{\eta},
$$

$$
\tau_w\frac{dw_i}{dt}=a(V_i-E_L)-w_i.
$$

Ao cruzar o limiar de evento, registra-se um spike, aplica-se `V ← V_reset` e `w ← w + b`. O modelo reproduz diferentes padrões de disparo, mas o evento continua sendo um limiar seguido de reset; ele não produz a forma completa de um potencial de ação.

Classes celulares são presets multiparamétricos. Capacitância, fuga, limiar, inclinação exponencial, adaptação e reset participam da classificação; `a` e `b` não bastam isoladamente para definir uma célula piramidal ou fast-spiking.

O ruído colorido pode ser representado por Ornstein–Uhlenbeck:

$$
dI_i^{\eta} = -\frac{I_i^{\eta}}{\tau_\eta}\,dt
+ \sigma_\eta\sqrt{dt}\,\xi_i,
\qquad \xi_i \sim \mathcal N(0,1).
$$

Cada amostra é obtida de um endereço determinístico do RNG. Não existe um fluxo global cujo resultado dependa da ordem de execução.

## Sinapses por condutância

A corrente sináptica de uma célula é

$$
I_i^{\mathrm{syn}} = -\sum_r g_i^r(t)\bigl(V_i-E_r\bigr).
$$

Cada receptor possui estado e cinética próprios. A progressão planejada é:

1. AMPA e GABA-A na 0.3, depois da validação do integrador;
2. NMDA e GABA-B nos patches da 0.6;
3. modulação metabotrópica apenas com mecanismo e circuito declarados.

GABA-A pode produzir hiperpolarização ou inibição por shunt conforme o potencial de reversão do cloro, o potencial de repouso e o estado instantâneo da membrana. O tipo do receptor não será usado sozinho para decidir o efeito.

Para NMDA, o bloqueio por magnésio pode entrar como fator dependente de voltagem, com parâmetros e unidade explicitados no preset. A equação concreta será escolhida junto com os dados de calibração, sem misturar convenções de artigos diferentes.

### Plasticidade de curto prazo

A primeira implementação de Tsodyks–Markram será determinística. Entre eventos:

$$
\frac{dR}{dt}=\frac{1-R}{\tau_D}, \qquad
\frac{du}{dt}=\frac{U-u}{\tau_F}.
$$

No evento pré-sináptico, calcula-se a fração liberada segundo a convenção escolhida, atualiza-se a condutância e só então se depletam os recursos. A variante estocástica posterior deverá declarar número de sítios ou vesículas e condicionar a depleção à liberação efetiva. `uR` não será usado ao mesmo tempo como quantidade liberada determinística e como probabilidade Bernoulli sem essa distinção.

## Campo populacional

A 0.4 escolherá uma das duas famílias abaixo e registrará essa escolha no preset.

### Campo integral

$$
\tau\frac{\partial u(x,t)}{\partial t} = -u(x,t)
+ \int_{\mathcal M} w\!\left(d_g(x,x')\right)
f\!\left(u\left(x',t-d_g(x,x')/c\right)\right)dx'
+ h(x,t).
$$

Nessa formulação, o kernel usa distância geodésica e o atraso depende do comprimento do caminho.

### Campo por operador de superfície

$$
\tau\frac{\partial u}{\partial t} = -u + D\Delta_{\mathcal M}u + f(Wu+h).
$$

Aqui `Δ_M` é o Laplace–Beltrami discretizado pela malha, ou uma aproximação de Laplaciano de grafo cuja diferença esteja documentada. Um kernel geodésico não será chamado de Laplace–Beltrami, e atraso de condução não será apresentado como causa suficiente de ondas. Ondas são regimes que precisam emergir e ser medidos no sistema completo.

O primeiro campo terá populações excitatória e inibitória separadas. Um único escalar de atividade não é suficiente para estudar balanço E/I ou produzir observáveis sinápticos interpretáveis.

## Inferência e tarefas

O núcleo oferece unidades, conexões, campos, plasticidade e portas de entrada/saída. Uma tarefa pode organizar esses elementos como uma hierarquia preditiva, mas não altera o significado das equações bioelétricas.

Para um experimento de código preditivo, uma função local de erro pode ser escrita como

$$
F_{\mathrm{task}} = \tfrac12\varepsilon^\top\Pi\varepsilon
- \tfrac12\log|\Pi| + \text{prior},
$$

e a dinâmica da representação pode ser derivada de seu gradiente. O caso linear-gaussiano pode convergir para a média posterior ponderada por precisão. Essa propriedade pertence ao experimento e não prova que AdEx, receptores, ruído, atrasos e plasticidade descendam do mesmo funcional.

A STDP pareada atual permanece uma regra fenomenológica. Uma interpretação por gradiente exigirá uma derivação e, em geral, um terceiro fator que represente erro, recompensa ou modulação.

## Neuroquímica

Um modulador não é um escalar sem anatomia. Cada mecanismo neuroquímico deve definir:

- substância e família de receptor;
- região de origem e alvos;
- localização pré-sináptica, pós-sináptica ou extrasináptica;
- cinética de liberação, ligação, dessensibilização e remoção;
- efeito sobre canais, liberação, ganho ou plasticidade;
- escala espacial e temporal;
- possibilidade de cotransmissão;
- unidade e intervalo de calibração.

Concentração, ocupação de receptor e efeito funcional ficam em buffers diferentes. ACh, DA, NE e 5-HT poderão modular precisão em tarefas específicas, mas não receberão esse significado universalmente.

## Observáveis

| Nome | Unidade | Origem | Restrição |
| :-- | :-- | :-- | :-- |
| Taxa de disparo | Hz | contagem de eventos por janela | declarar população e janela |
| Potencial de membrana | V | estado da célula | não confundir com campo extracelular |
| Corrente sináptica | A | estados de receptor e força motriz | declarar componentes incluídos |
| Pseudo-LFP | V relativo ou unidade arbitrária | combinação validada de correntes E/I | declarar geometria e kernel do eletrodo virtual |
| Atividade de campo | conforme o modelo | estado populacional | não chamar de potencial de membrana |
| Dispersão espacial | unidade da malha | distribuição de atividade | declarar peso e domínio |
| Dimensionalidade | adimensional | covariância de estados em janela | interpretação é resultado, não regra |
| Sinal hemodinâmico | unidade do modelo | modelo neurovascular futuro | separado de volume cortical ativo |

O primeiro LFP será um pseudo-LFP. Modelos pontuais não oferecem a geometria de fontes necessária para afirmar que uma soma simples `1/r` representa o potencial extracelular real.

## Topologia e estados coletivos

- Homologia persistente será calculada em representações e escalas explicitadas, fora do laço de render.
- Números de Betti não serão misturados com modularidade, small-world ou rich-club, que são métricas de rede.
- Defeitos de fase exigem um campo contínuo, filtragem estreita em banda e extração de fase validada.
- Criticalidade será comparada a modelos alternativos, com controle de limiarização, tamanho finito e subamostragem. Um expoente ou uma razão de ramificação isolados não validam o motor.

## O que o modelo não afirma

- Não afirma que o cérebro inteiro minimize uma única função de energia.
- Não afirma que todos os nós atuais sejam neurônios biológicos individuais.
- Não afirma que uma casca convexa seja uma superfície cortical anatômica.
- Não afirma que atenção, sono ou memória tenham um único modulador ou mecanismo.
- Não afirma que atividade visualmente coerente seja evidência fisiológica suficiente.

As decisões de implementação estão em [ARCHITECTURE.md](ARCHITECTURE.md) e a forma de testá-las em [VALIDATION.md](VALIDATION.md).
