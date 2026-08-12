# Auditoria de entrada da 0.8

> Nota histórica: referências `arquivo:linha` abaixo identificam o checkout
> auditado em 10 de agosto de 2026 e não devem ser usadas como rastreabilidade
> vigente. O veredito atual por ID está em
> [ARCHITECTURE.md, “Achados da auditoria 0.8 reavaliados”](ARCHITECTURE.md#achados-da-auditoria-08-reavaliados).

**Data:** 10 de agosto de 2026
**Escopo:** estado implementado da 0.7, coerência entre documentação e código,
qualidade executável, e viabilidade do programa de leitura visual pedido para as
próximas fases — anatomia progressiva, planos de corte, transparência por
película, ampliação de um neurônio em funcionamento, campos de neurotransmissor
e sistema de cor/animação por elemento.

## Veredito

A 0.7 está íntegra. O que ela promete, ela entrega: o motor Rust publica estado
celular em SI, o shell não integra equações, os testes passam e as capturas
existem. Como base de código, o projeto está **apto a abrir a 0.8**.

O programa visual pedido, porém, **não está apto a começar sobre a apresentação
atual**. O motivo não é falta de talento gráfico: é que três decisões vigentes
tornam o programa impossível de executar com honestidade —

1. o roadmap exclui explicitamente atlas anatômico, morfologia
   multicompartimental e tractografia do caminho até a 1.0 (`ROADMAP.md:188`);
2. a camada de apresentação satura para branco e destrói a codificação de
   estado, de modo que qualquer refinamento anatômico seria invisível;
3. metade do que o programa quer mostrar — química da fenda, concentração,
   ocupação, propagação axonal com tempo — **não existe como estado calculado**,
   e o princípio 1 do roadmap proíbe animar o que o motor não computa.

Portanto a 0.8 precisa de dois trabalhos paralelos: fechar a escala química no
motor e reconstruir o contrato de apresentação. Só depois disso a anatomia
realista deixa de ser enfeite e passa a ser leitura.

## Evidência executada

| Gate | Resultado |
| :-- | :-- |
| `npm run typecheck` | aprovado, sem diagnóstico |
| `npx vitest run` | 12 arquivos, 41 testes aprovados em 4,28 s |
| árvore de trabalho | limpa em `049cfa1`, sem alteração pendente |
| capturas versionadas | cinco PNG e `runtime-audit.json` presentes em `artifacts/visual-audit/` |
| coerência de versão | `package.json`, `index.html`, `ROADMAP.md`, `PLAN_0.7.md` e `AUDIT_0.7.md` concordam em 0.7.0 |

Não reexecutei `cargo test`, `clippy`, o alvo Wasm nem `audit:runtime` nesta
revisão; eles pertencem ao fechamento da 0.7 e estão registrados em
[AUDIT_0.7.md](AUDIT_0.7.md). As afirmações abaixo sobre o motor vêm de leitura
do código, não de nova execução.

## Achados

Severidade: **bloqueio** impede abrir o corte correspondente; **alto** precisa
entrar na 0.8; **médio** entra na trilha de qualidade; **baixo** é dívida
registrada.

### Planejamento

| # | Achado | Severidade |
| :-- | :-- | :-- |
| P1 | A 0.8 não tem plano de cortes equivalente a [PLAN_0.6](docs/legacy/plans/PLAN-0.6.md) e [PLAN_0.7](docs/legacy/plans/PLAN-0.7.md). A fase existe como uma linha de tabela (`ROADMAP.md:37`) e três itens abertos de preparação (`ROADMAP.md:153-156`). As duas fases anteriores só começaram com plano escrito antes do código. | alto |
| P2 | O programa visual pedido não aparece em nenhum documento. Plano de corte, película transparente, ampliação de neurônio, espraiamento espacial de neurotransmissor e sistema de cor por substância não têm uma linha sequer; morfologia aparece apenas como negação, nas ressalvas do que o modelo não faz. E não é omissão de redação — `ROADMAP.md:182-188` declara o contrário, mantendo regiões procedurais, casca convexa e ausência de atlas e morfologia como limites assumidos até a 1.0. | bloqueio |
| P3 | `ARCHITECTURE.md:49` ainda intitula a seção principal como arquitetura 0.6, e `ARCHITECTURE.md:15` descreve `main.ts` no estado 0.4 — "ainda concentra relógio, cena, renderização, HUD, captura e controles" —, o que deixou de ser verdade quando as camadas de render foram extraídas. | médio |
| P4 | A própria arquitetura define o gatilho para criar `src/render/`: três camadas extraídas de `main.ts` (`ARCHITECTURE.md:462`). O gatilho disparou — existem `render-layers.ts`, `laminar-layer.ts` e `cell-layer.ts` — e o diretório não foi criado. As três camadas convivem soltas em `src/`, sem tipo comum e sem a interface `RenderLayer` que o documento especifica em `ARCHITECTURE.md:404`. | médio |
| P5 | `inference.ts` e o HUD bayesiano continuam ocupando o painel inferior inteiro da Visão Geral. A posterior é calculada em TypeScript e entra no motor como `confidence` do drive (`main.ts:218`), fora do contrato `ExperimentEncoder`/`ExperimentDecoder` previsto em `ARCHITECTURE.md:357`. Nenhum teste cobre seu efeito sobre a dinâmica. | médio |

### Evidência e gates

| # | Achado | Severidade |
| :-- | :-- | :-- |
| E1 | `runtime-audit.json` registra cadência, contraste e contadores, mas **não** registra hardware, navegador, preset, número de nós, sinapses nem vértices — campos que `VALIDATION.md:96` exige de todo relatório de desempenho. O artefato não satisfaz o critério que o documento define. | alto |
| E2 | O mesmo artefato publica `frameCpuMs.p95 = 81,5 ms` e média de 37,9 ms, e a captura de Visão Geral exibe 10 FPS. É ambiente headless com rasterização por software, e [AUDIT_0.7.md](AUDIT_0.7.md) diz isso. O problema é outro: **não existe nenhuma medição em hardware real**. O alvo de 60 Hz de `VALIDATION.md:108` não tem evidência que o sustente nem que o refute, e o programa visual vai multiplicar o custo gráfico. | alto |
| E3 | O gate visual mede contraste de texto contra o painel. Ele não verifica o critério vizinho, declarado em `VALIDATION.md:115`: legibilidade sem depender apenas de cor. Hoje excitatório e inibitório têm geometria idêntica e só diferem em matiz, nas três vistas. | médio |
| E4 | `VALIDATION.md:117` exige confirmar que cada pulso visível aponta para um evento publicado. Isso é verdadeiro por leitura do código, mas nenhum teste amarra cor ou posição renderizada de volta ao estado do snapshot. É a única linha da validação gráfica sem execução. | médio |

### Apresentação

| # | Achado | Severidade |
| :-- | :-- | :-- |
| R1 | Três hexadecimais distintos representam "inibitório": `0xc779ff` (`render-layers.ts:40`), `0xc879ff` (`cell-layer.ts:10`), `0xc979ff` (`laminar-layer.ts:106`). Excitatório e relé usam quatro: `0x2ed9ff`, `0x31c8ff`, `0x36c8ff`, `0x249cff`. Não há módulo de tokens; cada camada redefine a semântica. | alto |
| R2 | Quase todo material usa `AdditiveBlending` com `depthWrite: false`, e o bloom é global sobre a cena inteira. O resultado está nas capturas: nas abas Célula e Eletricidade, os doze somas leem como discos brancos idênticos, e a distinção E/I sobrevive apenas no halo externo. A codificação de estado é perdida exatamente onde a atividade é alta — isto é, onde ela importa. | alto |
| R3 | `receptorCurrentTotals` (`cell-layer.ts:41-54`) reduz cada receptor à média do valor absoluto. O motor publica corrente **com sinal**, calculada como `g·(E_rev − V)` (`cell_patch.rs:385-389`), de modo que GABA-A perto do repouso pode ser hiperpolarizante, nulo ou de shunt. A interface apaga justamente a distinção que `MODEL_SPEC:203` manda preservar, e os quatro medidores ficam graficamente indistinguíveis em natureza. | alto |
| R4 | O toro `field-boundary` (`cell-layer.ts:136-148`) fica no plano XZ e é visto quase de topo. Nas duas capturas ele lê como uma barra azul sólida atravessando a fileira do meio de células. Nenhuma legenda o explica; o leitor não tem como saber que é a fronteira do campo. | médio |
| R5 | Célula e Eletricidade desenham a mesma cena. A diferença é a visibilidade dos halos e a opacidade dos dendritos (`cell-layer.ts:152-157`). São duas abas para um desenho, e a segunda não mostra nada de elétrico que a primeira já não mostrasse. | médio |
| R6 | Alocações por frame no caminho quente: um `Float32Array` do tamanho da rede a cada atualização (`render-layers.ts:276`), e um `Vector3` mais um `Quaternion` por célula por frame (`cell-layer.ts:56,195-197`). | baixo |
| R7 | `renderSignals` compõe e escreve 900 matrizes de limpeza por frame (`render-layers.ts:357-362`), mesmo com 140 sinais visíveis; e `updateVisibility` roda a cada frame (`main.ts:258`) embora dependa só de estado de interface. | baixo |

### Fronteira do motor para o programa visual

Estes não são defeitos da 0.7. São a razão pela qual partes do pedido não podem
ser desenhadas hoje sem inventar fenômeno.

| # | Achado | Consequência |
| :-- | :-- | :-- |
| M1 | `spiked` é uma flag por tick, zerada no início de cada tick (`cell_patch.rs:352`), e `first_spike_seconds` é um marco único. Não existe carimbo de tempo por spike. | Não dá para animar a propagação de um potencial de ação ao longo do axônio entre snapshots sem interpolar um evento — o que `ARCHITECTURE.md:424` proíbe. A ABI precisa publicar tempos de evento, na mesma forma compacta já usada por `SignalBatch`. |
| M2 | O dendrito é um compartimento passivo único (`MODEL_SPEC:173`). | Uma árvore dendrítica com gradiente de voltagem seria ficção. Ou a árvore inteira mostra uma cor só, ou o motor ganha compartimentos antes da vista de neurônio. |
| M3 | Não existe estado químico: sem recurso vesicular, sem concentração na fenda, sem ocupação de receptor, sem transportador. | Todo o pedido de "onde a química surge, para onde vai e por onde se espalha" depende de estado que ainda não é calculado. Nenhum shader resolve isso. |

## Leitura do pedido contra o estado atual

| O que foi pedido | Existe hoje | Existe no plano | Fronteira que falta |
| :-- | :-- | :-- | :-- |
| Camadas progressivas com anatomia realista | envoltório convexo por região, nuvem de pontos procedural | não; explicitamente excluído em `ROADMAP.md:184,188` | superfície dobrada com proveniência declarada; separação entre matéria e emissão no render |
| Planos de corte para ver o funcionamento | nada | não | planos de recorte com tampa por estêncil e sonda de estado na face cortada |
| Ampliar um neurônio em funcionamento no menu superior | quatro abas, sem seleção nem zoom; doze esferas iguais | não | seleção por raycast, palco de célula única, morfologia determinística, carimbo de tempo de spike |
| Correntes sinápticas e trocas neuroquímicas no neurônio | quatro medidores em painel, sem sinal e sem lugar | parcialmente: abas Sinapse e Bioquímica em `ROADMAP.md:37` | corrente com sinal e direção; estado de fenda, vesícula e ocupação |
| Produção e espraiamento das redes de neurotransmissores | nada | só como solver de reação–difusão, sem contrato visual | campo de transmissão de volume no grafo cortical, com fonte, difusão efetiva e captação |
| Camadas anatômicas com películas transparentes | quatro caixas de visibilidade por região, tudo ou nada | não | pilha de películas com opacidade contínua, ordenação por profundidade, modo raio-X |
| Cor e animação por tipo de elemento e substância | sete matizes ad hoc em três arquivos | não | módulo único de tokens, rampa perceptual, vocabulário fechado de animação, teste de invertibilidade cor↔estado |

O item mais importante desta tabela é o conflito de premissa. O roadmap atual
diz que a anatomia entra quando existe função para sustentá-la — regra correta,
que impediu o projeto de virar uma maquete. O pedido quer anatomia como
instrumento de leitura, não como afirmação. As duas coisas convivem, mas só sob
uma condição explícita: **cada elemento visível declara sua proveniência**.
Enquanto isso não estiver escrito, qualquer giro, dobra ou brilho novo vira uma
alegação que o motor não pode sustentar.

## Plano de correções e melhorias

### Onda 1 — destravar a apresentação (pré-requisito de tudo)

1. Criar `src/render/` com a interface `RenderLayer` já especificada em
   `ARCHITECTURE.md:404`, e mover as três camadas para dentro. Fecha P4.
2. Criar `src/render/visual-tokens.ts` como fonte única de cor, matiz por
   substância, rampa de voltagem e vocabulário de animação. Remover os sete
   hexadecimais espalhados. Fecha R1.
3. Separar o render em dois passes: **matéria** (alfa, com profundidade,
   ordenada de trás para frente) e **emissão** (aditivo). Aplicar bloom somente
   ao passe de emissão. Fecha R2 e é a condição para qualquer transparência
   confiável entre películas.
4. Publicar corrente com sinal na interface e desenhar direção de fluxo; manter
   o módulo apenas como leitura secundária. Fecha R3.
5. Explicar o toro de fronteira na legenda ou removê-lo da cena. Fecha R4.
6. Tirar as alocações do caminho quente e a limpeza cega de instâncias. Fecha
   R6 e R7.

### Onda 2 — fechar os gates que o próprio projeto define

7. Estender `runtime-audit.json` com hardware, navegador, preset e contagens.
   Fecha E1.
8. Registrar um baseline de desempenho em hardware real, com o formato de
   `VALIDATION.md:96`, antes de aumentar o custo gráfico. Fecha E2.
9. Adicionar ao gate visual: modo sem cor, verificação de redundância de
   codificação, e um teste de invertibilidade — amostrar pixels de estado
   conhecido e exigir que a cor renderizada volte ao estado dentro de tolerância.
   Fecha E3 e E4, e protege as ondas seguintes contra regressão de legibilidade.

### Onda 3 — alinhar documentação ao código

10. Atualizar o cabeçalho e a descrição de `main.ts` em `ARCHITECTURE.md`.
    Fecha P3.
11. Escrever o plano de cortes da 0.8 no formato das fases anteriores. Fecha P1.
12. Escrever o contrato de apresentação — o que este relatório entrega em
    [proposta visual arquivada](docs/legacy/specs/VISUAL-SPEC-v0.8-proposal.md) — e substituir os limites assumidos do
    roadmap por limites com data e condição de entrada. Fecha P2.
13. Decidir o destino do experimento bayesiano: portá-lo para o contrato de
    encoder/decoder ou aposentá-lo do painel principal, liberando o espaço para
    instrumentos fisiológicos. Fecha P5.

### Onda 4 — o que só o motor pode destravar

14. Publicar tempos de evento por célula na ABI, para que propagação axonal seja
    animada a partir de evento real. Endereça M1.
15. Decidir entre árvore dendrítica ilustrativa com voltagem única ou dendrito de
    três compartimentos no motor. A vista de neurônio depende dessa escolha, não
    do desenho. Endereça M2.
16. Implementar a escala química — recurso, fenda, ocupação — antes de qualquer
    animação de neurotransmissor. Endereça M3.

As ondas 1 a 3 não dependem de nova física e podem entrar na trilha de qualidade
da 0.8. A onda 4 é a própria 0.8 e 0.9.

## Gate de saída da 0.8

A 0.8 termina quando:

1. recurso vesicular, concentração na fenda e ocupação de receptor existirem em
   Rust, com conservação de massa e positividade testadas;
2. plasticidade de curto prazo tiver um oráculo versionado e replay próprio;
3. o solver químico demonstrar estabilidade no regime em que será usado, e não
   apenas permanecer finito;
4. o contrato de apresentação estiver implementado, com tokens únicos, dois
   passes e bloom seletivo;
5. o teste de invertibilidade cor↔estado passar nas quatro vistas;
6. existir baseline de desempenho em hardware real, antes e depois da mudança
   gráfica;
7. nenhum elemento visível estiver sem proveniência declarada.

O próximo trabalho autorizado é **0.8-a: contrato de recursos e conservação**,
em paralelo com **0.8-v1: fundação da apresentação**. O roadmap revisado está em
[proposta de roadmap arquivada](docs/legacy/roadmaps/ROADMAP-NEXT-v0.8-proposal.md) e o desenho da leitura visual na
[proposta visual arquivada](docs/legacy/specs/VISUAL-SPEC-v0.8-proposal.md).
