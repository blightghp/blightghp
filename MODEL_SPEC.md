# Especificação matemática e epistemológica · BRAIN PRO

**Revisão:** 5 · produto observado 0.9.0 · modelos com schema próprio · R10-B sem modelo novo

Esta é a fonte canônica das perguntas, variáveis, equações, métodos, hipóteses e
limites do motor. Ela não transforma a fisiologia em algo que o código ainda não
calcula: cada modelo declara estado, unidade, regime, prova e classificação.

## Convenções

- O tempo interno usa segundos; a interface pode apresentá-lo em milissegundos.
- Potenciais elétricos usam volts no núcleo e milivolts apenas na apresentação.
- Condutâncias, correntes e concentrações devem declarar a unidade no tipo de configuração ou no nome do campo.
- Índices de unidade, sinapse, vértice e região não são intercambiáveis.
- O tempo do motor é um tick inteiro. O valor físico é `tick * dt`.
- Posições atuais estão em coordenadas procedurais sem unidade anatômica. Velocidade de condução física só será introduzida quando a geometria tiver escala declarada.
- Perfil de material, iluminação, textura e acabamento 3D são apresentação; não acrescentam variável, compartimento, evento, unidade ou evidência ao modelo.

## Classificação epistemológica

| Classe | Significado |
| :-- | :-- |
| ILUSTRATIVO | organiza uma explicação; não pretende reproduzir dinâmica medida |
| PROCEDURAL | produzido por regra determinística sem proveniência anatômica/experimental |
| FENOMENOLÓGICO | reproduz comportamento qualitativo no regime declarado |
| DIDÁTICO | prioriza legibilidade e contrato pequeno para aprendizagem |
| FUNDAMENTADO EM REFERÊNCIA | forma/equação apoiada por fonte, sem calibração local suficiente |
| CALIBRADO | parâmetros ajustados a dados e protocolo declarados |
| VALIDADO NO REGIME DECLARADO | erro, invariantes e comparação externa sustentam o uso delimitado |
| EXPERIMENTAL | implementação ou hipótese ainda sem promoção |

Geometria 3D não altera esta classe.
Fotorealismo, PBR, translucidez ou SSS também não alteram esta classe. Quando a
película visual sugerir espessura, propagação ou microestrutura não calculadas,
a legenda deve negar explicitamente essa leitura e o fallback esquemático
permanece a referência.

O catálogo anatômico R10-A reutiliza esses rótulos como metadados de evidência,
mas não registra um novo modelo, variável ou observável. `MODEL_BOUND` significa
apenas que a entrada visual aponta para um objeto já publicado pelo modelo; não
eleva a geometria procedural a evidência anatômica. Seu fingerprint não integra
nenhum dos cinco domínios científicos.

A topologia vascular R10-B também não é modelo hemodinâmico. Seu grafo e sua
geometria têm hash próprio de apresentação e descrevem somente conectividade,
direção topológica e classe anatômica ilustrativa. Não existem estado vascular,
unidade de fluxo, perfusão, oxigenação, pulso, solver ou acoplamento com o motor;
por isso nenhum dado vascular integra a ABI v8 ou os cinco hashes científicos.

## Registro dos modelos atuais

| ID | Modelo/objeto | Pergunta e resolução | Estado/unidade | Método | Classe e regime | Estado de prova |
| :-- | :-- | :-- | :-- | :-- | :-- | :-- |
| MOD-001 | rede abstrata | propagação/eventos em unidades direcionadas | proxies/u.a., pesos | tick serial, atrasos e traços | DIDÁTICO/FENOMENOLÓGICO | replay 0.5 preservado |
| MOD-010 | campo E/I | atividade populacional sobre grafo procedural | E/I/u.a. por vértice | kernel atrasado explícito + decaimento exato | PROCEDURAL/DIDÁTICO | fixture e convergência |
| MOD-020 | coluna L1–L6 | vias e relaxação populacional | E/I adimensional | relaxação exponencial | DIDÁTICO/FENOMENOLÓGICO | invariantes/testes |
| MOD-030 | relé–TRN | efeito de atraso/feedback no ritmo | relé/TRN/rebote `[0,1]` | relaxação + linhas de atraso | FENOMENOLÓGICO | controle de laço/testes |
| MOD-040 | patch AdEx | excitabilidade/correntes de 12 células | V, A, Hz, s | AdEx híbrido, 83,3 µs | FUNDAMENTADO EM REFERÊNCIA/DIDÁTICO | replay, convergência, ensemble |
| MOD-050 | receptores | correntes AMPA/NMDA/GABA-A/GABA-B | S/A/V | decaimentos exatos + força motriz | FUNDAMENTADO EM REFERÊNCIA | convergência parcial e replay |
| MOD-060 | STP | depleção/facilitação determinística | `R,u`, S, mol | Tsodyks–Markram exponencial | FUNDAMENTADO EM REFERÊNCIA/DIDÁTICO | fixture bit a bit |
| MOD-070 | fenda/ocupação | separar matéria, concentração e ligação | mol, mol·m⁻³, fração | mapas exponenciais atômicos | DIDÁTICO/EXPERIMENTAL | conservação/replay |
| MOD-080 | solver químico | compor operadores positivos sob rigidez | tempo, exposição, estoques | Strang palindrômico adaptativo | NUMÉRICO VALIDADO NO REGIME TESTADO | convergência/replay |
| MOD-081 | trilha química | publicar uma sinapse representativa | buffers químicos v6 | composição por tick | DIDÁTICO/EXPERIMENTAL | fixture integrada; visual promovido nos limites 0.8 |
| MOD-090 | inferência Bayesiana de tarefa | atualizar crença escalar | probabilidades | Bayes discreto em TS, schema 1 | EXPERIMENTAL/ISOLADO | fixture, replay exato e controle nulo; posterior não alimenta drive |
| MOD-091 | eventos celulares carimbados | preservar identidade e instante de spikes do patch | ID, s | evento híbrido AdEx em subpasso; lote SoA schema 1 | OBSERVÁVEL DO MODELO | fixture/replay exato, ordem, hash e teto; não altera dinâmica |

“Validado” na última coluna refere-se ao contrato numérico testado, não a
validade fisiológica externa.

## Contrato obrigatório por modelo

Todo novo modelo ou revisão preenche: pergunta científica; objeto e resolução;
variáveis/tipos/unidades/domínios; condições iniciais e de contorno; equação
contínua; eventos e ordem; método, passo e tolerâncias; invariantes, conservação
e positividade; parâmetros/procedência/calibração; sensibilidade/convergência;
observáveis e estado publicado; relação multiescala; regime, limitações e falhas
esperadas; classificação epistemológica; testes analítico, numérico e
estatístico aplicáveis; visualização autorizada.

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

| Domínio | Formulação atual/alvo | Método | Gate/estado |
| :-- | :-- | :-- | :-- |
| campo cortical | kernel atrasado; futura PDE na superfície | histórico discreto; futuro FEM/cotangente e IMEX | atual com convergência; troca reabre prova |
| população laminar | E/I saturante | relaxação exponencial | implementado; estabilidade/conectividade |
| célula multicompartimental | AdEx no soma + cabo passivo proximal/distal | subpasso fixo; matriz tridiagonal implícita + evento/reset | implementado em R09-E; convergência, carga e replay |
| receptores | condutância e força motriz | decaimentos exatos | implementado; pico/integral/paridade |
| química local | ação de massa compartimental | mapas exatos + splitting Strang adaptativo | implementado no regime didático; massa/positividade/convergência |
| reação–difusão de volume | futura | implícito/IMEX após contrato espacial | pesquisa; solução simples e massa |
| liberação estocástica | futura | Gillespie/tau-leaping com erro declarado | pesquisa; distribuições e recursos |
| acoplamento multiescala | restrição/prolongamento | operadores conservativos | unilateral implementado; bilateral bloqueado |

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

Desde R09-E, o patch padrão usa três compartimentos em cadeia: soma AdEx,
dendrito proximal passivo e dendrito distal passivo. Em unidades SI:

$$
C_s \frac{dV_s}{dt} = -g_{L,s}(V_s-E_L)
+ g_{L,s}\Delta_T\exp\!\left(\frac{V_s-V_T}{\Delta_T}\right)
- w + I_{\mathrm{inj}} + g_{sp}(V_p-V_s) + I_{\mathrm{GABA-B}},
$$

$$
C_p \frac{dV_p}{dt} = -g_{L,p}(V_p-E_L)
+ g_{sp}(V_s-V_p) + g_{pd}(V_d-V_p) + I_{\mathrm{GABA-A}},
$$

$$
C_d \frac{dV_d}{dt} = -g_{L,d}(V_d-E_L)
+ g_{pd}(V_p-V_d) + I_{\mathrm{AMPA}} + I_{\mathrm{NMDA}},
$$

$$
\tau_w\frac{dw}{dt}=a(V_s-E_L)-w.
$$

Os parâmetros passivos são `Cs = 200 pF`, `Cp = 60 pF`, `Cd = 40 pF`,
`gL,s = 10 nS`, `gL,p = 4 nS`, `gL,d = 2 nS`, `gsp = 6 nS` e `gpd = 4 nS`.
O roteamento é parte do modelo: AMPA/NMDA usam a força motriz distal, GABA-A
usa a proximal e GABA-B usa a somática. Cada par de correntes axiais aparece
com sinais opostos nos compartimentos adjacentes, portanto a soma interna é
zero antes das fugas e correntes de membrana.

Fuga e acoplamento são resolvidos juntos por Euler implícito em uma matriz
tridiagonal fixa de 3×3. Exponencial AdEx, adaptação, injeção e correntes
receptoras são avaliadas no início do subpasso. O passo microscópico permanece
`1/12000 s = 83,3 µs`; cada tick macro de `1/60 s` executa exatamente 200
subpassos. `V_s`, `V_p` e `V_d` ficam em `[−120,+60] mV`.

Ao cruzar `−30 mV`, registra-se um spike, aplica-se `Vs ← Vreset` e `w ← w+b`.
O preset contém 8 células excitatórias e 4 inibitórias. Para E/I,
respectivamente: `ΔT = 2/0,5 mV`, `a = 2/0 nS`, `b = 40/0 pA`,
`τw = 200/30 ms` e reset em `−58/−55 mV`. O repouso é `−70 mV` e o limiar
exponencial `−50 mV`. O modelo não produz a forma completa de um potencial de
ação nem canais dendríticos ativos.

`CellPatchModel::LegacySingleDendriteV1` conserva o solver anterior somente
para replay/rollback; `MultiCompartmentV2` é o padrão científico. Fixtures v1
e v2 são testadas bit a bit e os hashes v2 separam soma, proximal e distal por
tags e comprimentos próprios.

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

Cada receptor possui estado e cinética próprios. No patch 0.7, AMPA, NMDA,
GABA-A e GABA-B usam decaimento exponencial exato com `τ = 5, 80, 10 e 150 ms`.
Os potenciais de reversão são `0, 0, −70 e −90 mV`. Eventos externos são
endereçados deterministicamente por semente, célula e microtick; spikes internos
excitatórios alimentam AMPA/NMDA e os inibitórios alimentam GABA-A/GABA-B.
Modulação metabotrópica permanece fora desta fase.

GABA-A pode produzir hiperpolarização ou inibição por shunt conforme o potencial de reversão do cloro, o potencial de repouso e o estado instantâneo da membrana. O tipo do receptor não será usado sozinho para decidir o efeito.

Na rede abstrata preservada da 0.6, `conductance_ampa` e `conductance_gaba` são
traços normalizados com `τ = 5 ms` e `τ = 10 ms`; a corrente usada pelo LIF é o
proxy adimensional `g_AMPA - g_GABAA`. O decaimento por tick é exponencial exato,
mas o passo interativo padrão de `1/60 s` é mais grosso que ambas as constantes.
Assim, a baseline é estável e reproduzível, porém não resolve a forma temporal
dessas correntes e não implementa ainda a equação por potencial de reversão
acima. O estudo em `synaptic_convergence.rs` caracteriza passos de 1 a 0,125 ms;
o preset bioelétrico 0.7 usa passo próprio e replay separado, sem alterar
retroativamente os hashes da 0.6.

O bloqueio por magnésio do NMDA é

$$
B(V)=\frac{1}{1 + [Mg^{2+}]/3{,}57\;\exp(-0{,}062 V_{mV})},
$$

com `[Mg²⁺] = 1 mmol/L`. Ele multiplica a condutância NMDA. A escolha é uma
aproximação didática não calibrada para uma preparação biológica específica.

### Plasticidade de curto prazo

A implementação 0.8-b de Tsodyks–Markram é determinística. Entre eventos, as
três variáveis usam a solução exponencial exata:

$$
\frac{dR}{dt}=\frac{1-R}{\tau_D}, \qquad
\frac{du}{dt}=\frac{U-u}{\tau_F}, \qquad
\frac{dg}{dt}=-\frac{g}{\tau_g}.
$$

Para um intervalo `Δt`, isso equivale a

$$
R^- = 1-(1-R)e^{-\Delta t/\tau_D}, \quad
u^- = U+(u-U)e^{-\Delta t/\tau_F}, \quad
g^- = ge^{-\Delta t/\tau_g}.
$$

No evento pré-sináptico, a ordem é parte do modelo e não detalhe de
implementação:

$$
f_{rel}=u^-R^-, \quad
g^+=g^-+q_gf_{rel}, \quad
R^+=R^--f_{rel}, \quad
u^+=u^-+U(1-u^-).
$$

Portanto, o primeiro evento usa `u=U`; a facilitação produzida nele só afeta o
evento seguinte. Eventos com o mesmo instante são aceitos na ordem canônica do
chamador. `f_rel` é quantidade fracionária determinística e nunca probabilidade
Bernoulli. Uma variante estocástica posterior deverá declarar número de sítios
ou vesículas e condicionar a depleção à liberação efetiva.

### Contrato de recursos e conservação da 0.8

O corte 0.8-a congela grandezas e fronteiras antes de implementar a dinâmica.
Na primeira variante, `R` e `u` são frações adimensionais no intervalo fechado
`[0,1]`. `R` é a fração disponível do estoque vesicular e `u` é utilização;
nenhuma das duas é contagem de moléculas. No evento determinístico,

$$
f_{rel}=uR, \qquad n_{rel}=n_{pool}f_{rel},
$$

onde `n_pool` e `n_rel` usam mol. `f_rel` é quantidade fracionária liberada,
não probabilidade Bernoulli. O 0.8-b consome esse contrato na ordem temporal
definida acima, sem RNG e sem clamp corretivo.

O balanço fechado acompanha equivalentes molares do mesmo transmissor em cinco
estoques, todos não negativos:

| Estoque | Campo | Unidade |
| :-- | :-- | :-- |
| vesicular disponível/reservado | `vesicular_moles` | mol |
| fenda | `cleft_moles` | mol |
| ligado a receptor | `receptor_bound_moles` | mol equivalente |
| recapturado | `recovered_moles` | mol equivalente |
| removido/degradado | `degraded_equivalent_moles` | mol equivalente |

O sumidouro degradado permanece no ledger: limpeza pode tirar transmissor ativo
da fenda, mas não pode apagar massa do balanço. Para um sistema fechado,

$$
n_0 = n_{ves}+n_{cleft}+n_{bound}+n_{recovered}+n_{degraded}
$$

dentro de tolerâncias absoluta e relativa declaradas pelo experimento. Fonte ou
dreno externo exige um termo de fronteira explícito; não entra como correção
oculta do estoque.

Conservação de carga é um ledger separado. Pela convenção do motor, corrente
positiva entra na célula. Para cada transferência de membrana integrada,
`ΔQ_intra = ∫I dt` e `ΔQ_extra = −ΔQ_intra`, em coulombs, de modo que a soma
seja zero dentro da tolerância declarada. O modelo não converte mol de
neurotransmissor em coulombs: ligação química e fluxo iônico são balanços
distintos e só se acoplam pela cinética de receptor explicitamente modelada.

O contrato estático vive em `chemical_contract.rs`; a transição temporal vive
em `short_term_plasticity.rs`. O primeiro valida grandezas e calcula a liberação
planejada sem estado. O segundo possui relógio absoluto, recuperação, decaimento,
depleção, facilitação e hash próprio. A ABI v6 integra duas instâncias — uma por
transmissor — ao microdomínio publicado descrito abaixo.

### Fenda e ocupação da 0.8-c

A química local representa glutamato e GABA em compartimentos de fenda separados.
Para cada transmissor `T`, concentração e matéria livre se relacionam pelo volume
explícito da fenda:

$$
[T]=\frac{n_{cleft,T}}{V_{cleft}}.
$$

A limpeza de primeira ordem é uma operação atômica exata:

$$
n_{cleft,T}^{+}=n_{cleft,T}^{-}e^{-\Delta t/\tau_{clear,T}}, \qquad
n_{recovered,T}^{+}=n_{recovered,T}^{-}+
\left(n_{cleft,T}^{-}-n_{cleft,T}^{+}\right).
$$

Cada família `r ∈ {AMPA, NMDA, GABA-A, GABA-B}` declara transmissor, capacidade
de sítios `N_r`, taxa de associação `k_{on,r}` em `m³·mol⁻¹·s⁻¹` e taxa de
dissociação `k_{off,r}` em `s⁻¹`. Com a concentração congelada na entrada da
operação,

$$
\lambda_r=k_{on,r}[T]+k_{off,r}, \qquad
O_{\infty,r}=\frac{k_{on,r}[T]}{\lambda_r}, \qquad
O_r^{+}=O_{\infty,r}+(O_r^{-}-O_{\infty,r})e^{-\lambda_r\Delta t}.
$$

O estoque ligado é `n_bound,r=N_rO_r`. Toda variação positiva sai da fenda
correspondente; dissociação devolve matéria à mesma fenda. Uma operação que
exigiria mais transmissor do que existe falha sem mutar o estado. Concentração
por transmissor, ocupação por receptor e matéria removida são buffers distintos;
efeito funcional ainda não existe nesse snapshot e não pode ser inferido deles.

Essas são transições elementares positivas, não um solver composto. A 0.8-d
abaixo define a ordem global, a separação de operadores, o tratamento de rigidez
e o estudo de convergência. Os valores padrão atuais são didáticos e não
constituem calibração para uma preparação biológica.

### Solver químico e rigidez da 0.8-d

O solver composto usa uma sequência de Strang palindrômica por subpasso. Se `C`
denota limpeza e `B_r` a ligação de uma família receptora, a ordem é

$$
C_G^{h/2}C_A^{h/2}
B_{AMPA}^{h/2}B_{NMDA}^{h/2}B_{GABA-A}^{h/2}B_{GABA-B}^{h/2}
B_{GABA-B}^{h/2}B_{GABA-A}^{h/2}B_{NMDA}^{h/2}B_{AMPA}^{h/2}
C_A^{h/2}C_G^{h/2}.
$$

Aqui `G` é glutamato e `A` é GABA. Cada operador elementar usa a solução
exponencial da 0.8-c, avaliada por `libm::exp` para que o replay químico seja
idêntico entre os alvos nativos suportados; não existe ramo de Euler explícito.
Essa escolha fica restrita à química nova e não altera as exponenciais nem os
hashes legados da ABI v5. O passo máximo é limitado também pela exposição
rígida na entrada do subpasso:

$$
\chi=h\max\left(\tau_{clear,T}^{-1},
k_{on,r}[T]+k_{off,r}\right)\leq\chi_{max}.
$$

O preset didático fixa `h_max=0,25 ms`, `χ_max=0,1` e no máximo 4.096 subpassos
por intervalo solicitado. Se o limite exigir trabalho além desse envelope, o
intervalo inteiro falha e nenhum estado parcial é publicado. Tempo, contador,
estoques, ocupações e hashes são atualizados apenas depois de a cópia candidata
terminar com sucesso.

Refinar `h_max` de `1 ms` para `0,5 ms` e `0,25 ms` reduz monotonicamente o erro
contra a referência de `0,03125 ms` no cenário conjunto de glutamato e GABA. O
oráculo `chemical-solver-v1.json` congela método, ordem, parâmetros, número de
subpassos, exposição máxima, buffers e hashes.

### Trilha química publicada na ABI v6

`ChemicalTrack` representa uma sinapse didática, não a soma populacional de
fendas distintas. Em cada fronteira de tick, ele primeiro avança a limpeza e a
ligação até o novo tempo. Depois publica as contagens de spikes E/I daquele tick
e aplica no máximo um evento vesicular por transmissor quando a contagem é
positiva. Assim, liberação no instante `t` altera imediatamente matéria livre e
concentração; ocupação e remoção evoluem nos intervalos seguintes.

O snapshot conserva ordens canônicas: `[glutamato, GABA]` para transmissores e
`[AMPA, NMDA, GABA-A, GABA-B]` para receptores. Publica reserva e utilização
vesicular, índice/tempo/quantidade do último evento, liberação acumulada, matéria
e concentração na fenda, matéria ligada, ocupação e remoção acumulada. O quarto
hash cobre todo esse bloco, os dois estados vesiculares e o hash do solver.

O hash legado da rede, o hash córtico-talâmico e o hash do patch celular não
recebem nenhum byte químico. Seus oráculos v1 continuam idênticos;
`schemaVersion = 6` apenas acrescenta o bloco e o hash químico ao protocolo.
O oráculo `chemical-track-v1.json` congela seis ticks, incluindo repouso,
eventos E/I separados e coincidentes, e todos os campos publicados.

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

## Procedimento para introduzir novos cálculos

1. formular a pergunta e a classificação epistemológica;
2. definir objeto, resolução, estado, tipos e unidades;
3. declarar equações, domínio, condições iniciais/contorno e eventos;
4. ordenar eventos e escolher método numérico;
5. fixar passo/tolerância, erro aceitável e regime de estabilidade;
6. declarar invariantes, conservação, positividade e atomicidade;
7. registrar parâmetros, fonte, calibração e sensibilidade;
8. definir entrada, observáveis e estado publicado;
9. decidir hash, replay e fixture antes da ABI;
10. criar testes analíticos/refinados/estatísticos aplicáveis;
11. medir custo e limites de recursos;
12. autorizar somente a visualização sustentada pelo estado;
13. definir promoção e rollback.

## Domínios futuros avaliados

| Domínio | Classificação de programa | Condição mínima |
| :-- | :-- | :-- |
| canais dendríticos ativos/árvore espacial detalhada | pesquisa posterior ao cabo passivo de R09-E | pergunta que três compartimentos passivos não resolvam, dados, estabilidade e ABI |
| timestamp/condução axonal | pré-1.0 para propagação visual causal | evento compacto, unidade, limite e replay |
| canais iônicos detalhados | pesquisa/pós-1.0 | pergunta que AdEx não resolve + fonte/calibração |
| plasticidade de longo prazo | pós-1.0/pesquisa | escala temporal, estabilidade e controle nulo |
| transmissão de volume/neuromodulação | pesquisa 0.10+ | fontes funcionais, domínio com unidade e solver positivo |
| astrócitos/clearance iônico/BBB | adiado/pesquisa | pergunta e dados específicos; não decorar química |
| neurovascular/hemodinâmica | pós-1.0/pesquisa | estado vascular, acoplamento e observável separados |
| fluxo de LCR | fora do escopo atual | requisito educacional e modelo validável |
| memória de trabalho/hipocampo/basal/ação | pesquisa 0.11+ | tarefa explícita, controles e métricas estatísticas |
| pseudo-LFP/espectro/sincronização | pós-promoção 0.8 | unidade, janela, kernel e sinal sintético |
| dimensionalidade/topologia de dados | pesquisa/offline | janela/amostragem e custo fora do frame |

Itens não listados como necessários não viram obrigação pela simples
disponibilidade de tecnologia.

As decisões de implementação estão em [ARCHITECTURE.md](ARCHITECTURE.md) e a forma de testá-las em [VALIDATION.md](VALIDATION.md).
