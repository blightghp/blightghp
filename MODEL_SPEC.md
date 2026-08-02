# Caderno matemático · BRAIN PRO [v. 0.6.0]

Aqui anoto o que cada estado e equação significa enquanto aprendo a implementá-los
em Rust. Não escrevo como se toda a fisiologia já existisse: cada seção declara
quando passa a valer, o que consigo testar e quais simplificações permanecem.

## Convenções

- O tempo interno usa segundos; a interface pode apresentá-lo em milissegundos.
- Potenciais elétricos usam volts no núcleo futuro e milivolts apenas na apresentação.
- Condutâncias, correntes e concentrações devem declarar a unidade no tipo de configuração ou no nome do campo.
- Índices de unidade, sinapse, vértice e região não são intercambiáveis.
- O tempo do motor é um tick inteiro. O valor físico é `tick * dt`.
- Posições atuais estão em coordenadas procedurais sem unidade anatômica. Velocidade de condução física só será introduzida quando a geometria tiver escala declarada.

## Política matemática a partir da 0.5

O crate Rust registra separadamente a equação contínua, o método numérico e o
observável publicado. “Cálculo forte” significa erro controlado e invariantes
demonstráveis, não apenas equações mais longas.

1. Estados internos usam `f64` por padrão; snapshots gráficos podem quantizar
   para `f32` depois de medir o erro.
2. Tempo, voltagem, corrente, condutância, concentração, comprimento e taxa
   recebem tipos/unidades distintos antes de entrar em presets públicos.
3. Nenhum solver altera `dt`, tolerância ou modelo em resposta a FPS.
4. Sistemas rígidos declaram Jacobiano ou estrutura esparsa suficiente para um
   método implícito/IMEX; Euler explícito não é fallback silencioso.
5. Eventos de spike, liberação e troca de resolução preservam ordem canônica.
6. Massa, carga, probabilidade, positividade e limites de recursos são
   invariantes testados quando aplicáveis.
7. Toda promoção inclui convergência temporal/espacial e sensibilidade aos
   parâmetros; ajuste visual não calibra um modelo.

### Contrato laminar consolidado na 0.6

Para cada lâmina `ℓ`, o primeiro kernel Rust usa um sistema populacional E/I:

$$
\tau^E_\ell\frac{dE_\ell}{dt}
=-E_\ell+F\left(\sum_j W_{\ell j}E_j-g^I_\ell I_\ell+P_\ell\right),
$$

$$
\tau^I_\ell\frac{dI_\ell}{dt}
=-I_\ell+F\left(g^{EI}_\ell E_\ell\right),
\qquad
F(x)=\frac{\max(0,x)}{1+\max(0,x)}.
$$

Congelando o lado direito durante um tick, cada estado relaxa
exponencialmente para o alvo:

$$
x_{n+1}=x_\star+(x_n-x_\star)e^{-\Delta t/\tau}.
$$

Essa forma mantém `E,I ∈ [0,1]` para entradas válidas e trata exatamente o
termo linear de relaxação. A matriz é indexada como `[alvo][origem]`. O preset
inicial existe para validar tipos, determinismo, ABI Wasm e propagação entre
lâminas; seus pesos **não são uma calibração fisiológica**.

Para evitar que uma matriz densa pareça mais abrangente do que o modelo, cada
entrada não nula precisa pertencer a uma destas classes didáticas:

- recorrência local em L1–L6;
- feedforward intracolunar L4→L2/L3 e L2/L3→L5;
- feedback intracolunar L5→L6 e L6→L1/L4.

`canonical_projection_gain(origem, alvo)` é a única tabela do preset.
`projection_kind` é independente do peso e rejeita pares fora desse escopo.
Essas setas ajudam a estudar a convenção alvo×origem; elas não afirmam que a
conectividade cortical real se reduz a sete vias.

### Laço córtico-talâmico didático da 0.6

O segundo kernel liga quatro estados agregados: relé talâmico excitatório,
população inibitória do núcleo reticular do tálamo (TRN), variável lenta de
rebote e a coluna L1–L6. O relé leva o drive sensorial a L4; L6 devolve contexto
ao relé e ao TRN; o TRN inibe o relé depois de um atraso discreto. Em forma
resumida:

$$
\tau_R\dot R=-R+F(g_sS+g_{6R}E_6+g_bB-g_{TR}T(t-d_T)),
$$

$$
\tau_T\dot T=-T+F(g_{RT}R(t-d_R)+g_{6T}E_6),
\qquad
\tau_B\dot B=-B+T(1-R).
$$

As três relaxações usam a mesma atualização exponencial do contrato laminar.
Os atrasos são linhas circulares limitadas a 4.096 passos; estados ficam em
`[0,1]`, ganhos em `[0,4]` e drives em `[0,4]`. O teste de ritmo usa entrada
constante, mede amplitude e pontos de retorno depois do transiente e abre o
laço TRN→relé como controle. A oscilação desaparece nesse controle.

Este é um oscilador fenomenológico para estudar atraso, realimentação e
integração em Rust. Ele não contém correntes de cálcio tipo T, canais iônicos,
morfologia, núcleos talâmicos individualizados nem calibração experimental;
portanto, não representa um spindle biológico.

### Solvers previstos por domínio

| Domínio | Formulação inicial | Método candidato | Gate |
| :-- | :-- | :-- | :-- |
| campo cortical | kernel atrasado / futura PDE na superfície | histórico discreto; depois FEM/cotangente e IMEX | convergência espacial, fase e velocidade |
| população laminar | Wilson–Cowan E/I | relaxação exponencial / IMEX | estabilidade, conectividade e ritmos |
| célula pontual | AdEx híbrido | exponencial + localização de evento | tempo de spike e corrente |
| receptores | ODE de estados e força motriz | atualização exata de decaimentos ou Rush–Larsen | pico e integral de corrente |
| bioquímica | ação de massa e reação–difusão | Rosenbrock/BDF ou splitting validado | positividade e conservação |
| liberação estocástica | processo de saltos | Gillespie ou tau-leaping com erro declarado | distribuições e recursos limitados |
| acoplamento multiescala | restrição/prolongamento | operadores conservativos | não duplicação e fluxo de contorno |

## Escalas do estado

| Escala | Estado principal | Interpretação |
| :-- | :-- | :-- |
| Rede 0.4 promovida | potencial, ativação, refratariedade e traços por unidade | Kernel Rust preservado durante a expansão |
| Lâmina 0.6 | atividade E/I por L1–L6 e matriz alvo×origem | Kernel populacional Rust didático |
| Campo | atividade E/I por vértice da malha | Estado populacional macroscópico |
| Patch microscópico | potencial, adaptação, condutâncias e eventos por célula | Amostra local resolvida em spikes |
| Sinapse | eficácia, atraso, receptor e recursos de liberação | Canal causal entre unidades |
| Tarefa | estímulo codificado, hipótese e erro definidos pelo experimento | Conteúdo cognitivo fora do núcleo biofísico |
| Observação | taxa, pseudo-LFP, espectro, dispersão e demais leituras | Derivados; não realimentam o motor por padrão |

## Campo e spikes: duas resoluções, uma atividade

Campo e spikes representam a mesma atividade em escalas diferentes. Isso não significa que compartilhem a mesma equação ou que seus valores possam ser somados diretamente.

Durante a 0.3, os spikes continuam sendo o estado integrado e o campo é apenas uma leitura agregada. A partir da 0.4, o campo passa a representar o domínio macroscópico. Quando um patch microscópico surgir na 0.7, ele substitui a contribuição do campo no suporte espacial selecionado.

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
2. NMDA e GABA-B nos patches da 0.7;
3. modulação metabotrópica apenas com mecanismo e circuito declarados.

GABA-A pode produzir hiperpolarização ou inibição por shunt conforme o potencial de reversão do cloro, o potencial de repouso e o estado instantâneo da membrana. O tipo do receptor não será usado sozinho para decidir o efeito.

Na rede abstrata preservada da 0.6, `conductance_ampa` e `conductance_gaba` são
traços normalizados com `τ = 5 ms` e `τ = 10 ms`; a corrente usada pelo LIF é o
proxy adimensional `g_AMPA - g_GABAA`. O decaimento por tick é exponencial exato,
mas o passo interativo padrão de `1/60 s` é mais grosso que ambas as constantes.
Assim, a baseline é estável e reproduzível, porém não resolve a forma temporal
dessas correntes e não implementa ainda a equação por potencial de reversão
acima. O estudo em `synaptic_convergence.rs` caracteriza passos de 1 a 0,125 ms;
um preset bioelétrico só pode ser promovido na 0.7 com passo próprio, custo
medido e novo replay, sem alterar retroativamente os hashes da 0.6.

Para NMDA, o bloqueio por magnésio pode entrar como fator dependente de voltagem, com parâmetros e unidade explicitados no preset. A equação concreta será escolhida junto com os dados de calibração, sem misturar convenções de artigos diferentes.

### Plasticidade de curto prazo

A primeira implementação de Tsodyks–Markram será determinística. Entre eventos:

$$
\frac{dR}{dt}=\frac{1-R}{\tau_D}, \qquad
\frac{du}{dt}=\frac{U-u}{\tau_F}.
$$

No evento pré-sináptico, calcula-se a fração liberada segundo a convenção escolhida, atualiza-se a condutância e só então se depletam os recursos. A variante estocástica posterior deverá declarar número de sítios ou vesículas e condicionar a depleção à liberação efetiva. `uR` não será usado ao mesmo tempo como quantidade liberada determinística e como probabilidade Bernoulli sem essa distinção.

## Campo populacional

### Modelo adotado na 0.4

A 0.4 usa um **campo E/I por kernel de grafo com atraso**. Para cada população
`p ∈ {E, I}` e vértice `i`, a atualização é:

$$
u_{p,i}^{n+1} = \operatorname{clip}_{[0,u_{\max}]}\left[
e^{-\Delta t/\tau_p}u_{p,i}^{n}
+ \rho_p\Delta t\left(
\sum_{j\in N(i)}\bar w_{ij}u_{p,j}^{n-d_{ij}}-u_{p,i}^{n}
\right)+h_{p,i}^{n}\right].
$$

Os pesos são `w_ij = exp(-ℓ_ij / σ)` e normalizados em cada linha. O atraso é
`d_ij = max(1, round(ℓ_ij / (c Δt)))`. `ℓ_ij` é o comprimento euclidiano da
aresta no espaço procedural e **não** uma distância geodésica anatômica. O
domínio é um grafo k-NN simétrico dos pontos corticais externos; não é uma
triangulação e o operador não é chamado de Laplace–Beltrami.

`h` recebe impulsos dos spikes. Cada nó cortical é projetado para exatamente um
vértice; cerebelo e tronco não pertencem a esse campo. No sentido inverso, a
diferença `E-I` do vértice associado produz uma modulação sub-limiar com ganho
declarado. Os estados `E`, `I` e `waveActivity` usam unidade arbitrária (`u.a.`);
`waveActivity = clip(0,7E + 0,3I, 0, 1)` é um observável de apresentação, não
um terceiro estado dinâmico.

O passo padrão é `1/60 s`. Os decaimentos locais usam a solução exponencial
exata; o termo de propagação é explícito e possui teste de convergência contra
passos menores. A discretização do atraso ainda é quantizada pelo tick, e essa
limitação deve ser considerada em qualquer interpretação de velocidade de onda.

### Famílias futuras

Uma malha triangular poderá substituir o grafo quando houver geometria cortical
adequada para distâncias geodésicas ou Laplace–Beltrami. Essa troca exigirá novo
estudo de convergência; atraso de condução, por si só, não será apresentado como
causa suficiente de ondas fisiológicas.

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
