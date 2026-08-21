# Revisão visual R10-D · superfície, relevo e limites

**Data:** 21 de agosto de 2026

**Escopo:** 12 capturas físicas em `artifacts/procedural-surface`
**Veredito:** avanço geométrico verificável; fotorrealismo e atlas continuam bloqueados

## Método e referências

A comparação usa a R10-C como antes e referências públicas apenas como alvo
visual, nunca como fonte de geometria ou calibração:

- o [pipeline de pré-processamento do Human Connectome Project](https://www.humanconnectome.org/study/hcp-young-adult/project-protocol/mr-preprocessing)
  separa reconstrução de superfície da imagem volumétrica; a R10-D continua uma
  superfície procedural sem segmentação de sujeito;
- Tallinen et al., [*Gyrification from constrained cortical expansion*](https://www.pnas.org/doi/10.1073/pnas.1406015111),
  mostram que dobra cortical emerge de restrições mecânicas. O ruído ridged atual
  é somente uma aproximação de aparência, não esse modelo físico;
- Sereno et al., [*The human cerebellum has almost 80% of the surface area of the neocortex*](https://pmc.ncbi.nlm.nih.gov/articles/PMC7431020/),
  tornam evidente a densidade das folia que uma forma cerebelar plausível precisa
  comunicar;
- uma [reconstrução cerebelar 3D](https://pmc.ncbi.nlm.nih.gov/articles/PMC9470778/)
  serve para comparar continuidade, bandas e separação espacial, sem incorporar
  seus dados ao projeto.

A escala de revisão é: 0 = quebrado; 1 = esquemático/rudimentar; 2 = macroforma
ilustrativa coerente; 3 = plausibilidade anatômica forte; 4 = derivado de
atlas/sujeito e validado. Uma solução puramente procedural não recebe nota 4.

## Comparação

| Vista | R10-C | R10-D | Progresso observável | Lacuna remanescente / proprietário |
| :-- | --: | --: | :-- | :-- |
| Visão Geral | 1 | 2 | quatro cascas convexas foram substituídas por superfícies contínuas; fissura medial, cavidades, macroassimetria e foliação cerebelar aparecem em quatro ângulos e no corte | sulcos são ruído, densidade ainda baixa, tecido azul/translúcido e luz plana; R10-E possui luz/material, R10-H possui atlas externo |
| Lâminas | 1 | 1 | captura permanece válida e dentro do orçamento após a nova camada macro | cilindros e espaçamento didático não se aproximam de histologia; R10-E/F, sem inventar espessura celular |
| Célula | 1 | 1 | não houve regressão de composição ou material | somas ovais e dendritos lineares continuam rudimentares; nova geometria celular exige estado/escopo próprio |
| Neurônio | 1 | 1 | hash e scene graph permanecem estáveis | árvore ilustrativa não identifica tipo celular ou calibre real |
| Eletricidade | 1 | 1 | prancha continua legível e separada | é diagrama espacial, não anatomia; não deve imitar fotografia |
| Sinapse | 1 | 1 | microdomínio preserva as camadas existentes | escala exagerada e formas primitivas permanecem; ultraestrutura externa só após proveniência |

## Leitura das capturas

- `surface-high-anterior/lateral/posterior`: a silhueta deixou de ser um casco
  facetado único; o relevo é parte da posição dos vértices, não normal map;
- `surface-low-baseline`: o governador reduz para 1.500 triângulos sem mudar IDs,
  bindings, materiais ou o hash científico;
- `surface-high-coronal-cut`: a malha fechada participa do clipping e a sonda
  continua lendo somente `field.waveActivity` publicado;
- `surface-review-*`: as seis vistas permanecem operantes; somente a Visão Geral
  recebe nova anatomia nesta etapa.

O contraste baked tornou cavidades legíveis, mas não resolve a materialidade.
Vasos ainda cruzam ou se afastam do envelope, a paleta ciano/azul comunica
simulação tecnológica mais que tecido, e a iluminação não separa bem giro e
sulco. Tentar esconder isso com bloom aumentaria brilho sem aumentar realismo.

## Decisão

R10-D é aprovada como **macroforma procedural ilustrativa**. Não autoriza os
termos “fotorrealista”, “sulco anatômico”, “atlas” ou “reconstrução clínica”. O
próximo gate canônico é R10-E: AgX, grade/tone mapping, SSS aproximado e consumo
dos atributos `aoFactor`/`thickness`, reexecutando contraste, monocromia,
pixel→estado e orçamento físico.
