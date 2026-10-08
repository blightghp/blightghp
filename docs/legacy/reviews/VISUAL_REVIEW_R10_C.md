# Revisão visual R10-C · realismo com honestidade epistemológica

**Data:** 20 de agosto de 2026

**Escopo:** seis capturas `enhanced` em GPU física, comparadas com imagens e
ferramentas públicas de anatomia, MRI e visualização neurocientífica. Esta
revisão avalia aparência; não promove geometria procedural a atlas clínico.

## Referências e critérios

- O [Allen Human Brain Atlas](https://alleninstitute.org/news/allen-institute-for-brain-science-launches-allen-human-brain-atlas-with-first-data-set-charting-genes-at-work-in-the-adult-human-brain)
  integra MRI, DTI, histologia e expressão gênica num referencial 3D. A
  comparação exige que silhueta, orientação e detalhe sejam sustentados por uma
  fonte antes de parecerem clínicos.
- O [pipeline do Human Connectome Project](https://www.humanconnectome.org/study/hcp-young-adult/project-protocol/mr-preprocessing)
  deriva superfícies corticais e segmentação subcortical de T1 de alta qualidade.
  Sulcos e separação entre superfícies não devem ser improvisados por ruído de
  shader quando forem apresentados como anatomia.
- O [Connectome Workbench](https://www.humanconnectome.org/software/connectome-workbench)
  separa exploração em superfície e em volume. Essa distinção orienta câmera,
  cortes e níveis de escala do BRAIN PRO.
- O [Visible Human Project/NLM](https://www.nlm.nih.gov/research/visible/products.html)
  registra reconstruções e cortes derivados de imagem médica. Fotos/cortes reais
  mostram que uma face seccionada precisa de espessura, variação tecidual e
  continuidade material; uma tampa plana uniforme não é tecido realista.
- A referência microscópica do NIH sobre uma
  [reconstrução 3D de tecido cerebral humano](https://www.nih.gov/news-events/nih-research-matters/study-reveals-unseen-details-human-brain-structure)
  é usada apenas como padrão de densidade/oclusão na escala celular, não como
  autorização para copiar conectividade ou atribuir morfologia ao modelo.

Nenhuma imagem, malha ou textura dessas fontes foi copiada para o projeto. Os
links servem à crítica visual; asset externo continua bloqueado até R10-H.

## Escala de revisão

`0` = diagrama plano; `1` = volume geométrico elementar; `2` = ilustração 3D
coerente; `3` = simulação visual convincente com limitações explícitas; `4` =
referência calibrada. R10-C não pode legitimamente receber nota 4 porque não usa
atlas nem dados de imagem.

| Vista | R10-C | O que progrediu | Lacuna observada contra as referências | Gate proprietário |
| :-- | --: | :-- | :-- | :-- |
| Visão Geral | 1 | PBR e vasos agora aparecem por padrão; profundidade e oclusão são legíveis | casca convexa facetada, ausência de giros/sulcos, vasos fora do envelope cortical e paleta azul distante de tecido | R10-D (superfície), R10-E (luz/material), R10-H (asset) |
| Lâminas | 1 | vasos penetrantes e anéis criam relações de profundidade | cilindros empilhados continuam uma notação; não há espessura cortical, corpos celulares ou densidade laminar comparável a histologia | R10-D/R10-E; manter rótulo didático |
| Célula | 1 | película reduz aparência totalmente plana e vasos acrescentam contexto | somas ovais repetidos, dendritos lineares e calibre vascular exagerado; não há membrana, núcleo ou organelas publicados | R10-D/R10-E; não inventar ultraestrutura |
| Neurônio | 1 | evento, compartimentos e halo permanecem distinguíveis | soma pode saturar até branco; arborização é esparsa e sem espessura/ramificação convincente; não representa tipo celular real | R10-E para exposição; morfologia externa só com R10-H |
| Eletricidade | 2 | a prancha tem profundidade, plano e hierarquia luminosa coerentes com seu papel | é deliberadamente um diagrama, não tecido. Transformá-la em “foto de cérebro” destruiria a legibilidade e a fronteira epistemológica | R10-F para UI; preservar linguagem de prancha |
| Sinapse | 1 | membranas, receptores e vaso recebem microtextura e separação espacial | escalas incompatíveis são didáticas, a fenda é vazia e as formas permanecem primitivas; a captura não se aproxima de micrografia | R10-D/R10-E; ultraestrutura externa só R10-H |

## Parecer

O perfil `realistic-illustrative` é coerente como **tentativa de 3D** e agora é o
padrão nas seis vistas, mas o conjunto ainda não é realista no sentido de foto,
MRI, histologia ou simulação anatômica calibrada. O principal bloqueio não é
bloom: é geometria. Acrescentar brilho à `ConvexGeometry` só torna os polígonos
mais visíveis.

R10-C é aprovado visualmente apenas como infraestrutura e baseline: perfil
`enhanced` preserva a película, `baseline` reduz o custo, e as capturas em
`artifacts/presentation-budget/visual-*-enhanced.png` congelam o ponto de
comparação. A promoção para “simulação visual convincente” permanece
explicitamente bloqueada até a superfície de R10-D e a luz/materialidade de
R10-E; nenhuma nota ou termo desta revisão autoriza alegação clínica.
