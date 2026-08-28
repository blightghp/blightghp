# Auditoria 0.10 · R10-E · luz e materialidade

**Data:** 28 de agosto de 2026

**Commit técnico medido:** `161665f9d9acf00dfb47d1900922780ea03f82d8`

**Branch de trabalho:** `blightghp/r10-e-light-materiality`
**Resultado:** gate de evidência física fechado; etapa ainda não promovida

## Resultado

R10-E substitui a aparência ciano uniforme das quatro shells overview por
albedos quentes/neutros estritamente de apresentação. A mistura é limitada às
quatro shells R10-D aprovadas e permanece após a sincronização dinâmica; a
codificação científica dessas shells continua sendo somente opacidade. Vasos,
estado científico, geometria, Worker, ABI e hashes não mudam.

O artefato físico é
[`../../../artifacts/light-materiality/light-materiality.json`](../../../artifacts/light-materiality/light-materiality.json).
Ele foi gerado na Intel UHD via ANGLE/D3D11, não em SwiftShader.

| Contrato | Evidência | Resultado |
| :-- | :-- | :-- |
| GFX-R10E-01 | 37 materiais físicos, transmissão zero, quatro shaders de superfície assada e quatro albedos regionais | aceito |
| GFX-R10E-02 | 12 materiais vasculares preservados; zero `semanticGeometryChanges` | aceito |
| GFX-R10E-03 | AgX ativo fora do fallback; alto contraste força ACES + esquema e restaura AgX | aceito |
| GFX-R10E-04 | 16 capturas físicas: referência esquemática, matriz de seis ângulos, seis vistas e três modos acessíveis | aceito |
| GFX-R10E-05 | cinco hashes científicos invariantes; corte coronal com uma tampa shader/um plano | aceito |

## Implementação e limites

`src/render/material-profile.ts` copia a cor de origem sem alocar no caminho de
`sync()` e aplica a mistura regional somente quando `r10EOverviewShellRegion()`
aprova a shell. Córtex, cerebelo e tronco ganham albedo quente/neutro; a região
vascular não recebe essa mistura. A emissão da shell acompanha a albedo de
apresentação, enquanto a atividade continua modulando apenas opacidade e
intensidade já declaradas.

O shader assado mantém a chave `r10-e-baked-surface-v1:<região>` e não adiciona
draw, passe, textura externa ou recompilação por quadro. A API de auditoria
expõe apenas o reset de câmera de corte já existente para tornar superior,
oblíqua e coronal determinísticos; não muda controles do produto.

Isso não cria atlas, segmentação, sulcos nomeados, validade clínica nem uma nova
topologia vascular. As capturas continuam mostrando vasos desconectados do
envelope em alguns ângulos e relevo de baixa frequência; esses limites são
registrados na [revisão visual](../../reviews/VISUAL_REVIEW_R10_E.md).

## Medição física

| Perfil overview | Amostras | p50 | p95 | draws medidos | triângulos medidos | Teto p95 |
| :-- | --: | --: | --: | --: | --: | --: |
| `baseline` | 24 | 1,7 ms | 2,7 ms | 24 | 14.520 | 33,4 ms |
| `cinema`/enhanced | 24 | 1,9 ms | 3,2 ms | 56 | 35.595 | 50 ms |

O custo de textura residente do perfil material é 1.392.640 bytes (ambiente
PMREM + três normais procedurais). A matriz frontal amostrou 1.986 pixels quentes
contra 254 frios; é uma sentinela de dominância de paleta, não uma alegação de
cor anatômica.

O corte coronal conservou quatro fontes de tampa, uma tampa shader, 9 draws
adicionais estimados (teto 18) e sonda de `field.waveActivity` disponível com
91 amostras. As cinco hashes científico-computacionais mantiveram os valores de
R10-D; o hash geométrico de apresentação continua `7dfdd64207190121`.

## Acessibilidade e reversão

- monocromia foi capturada com `visualAudit().colorMode === "monochrome"`;
- móvel foi capturado em 390 × 844;
- uma segunda página com `prefers-reduced-motion: reduce` iniciou rotação em `0`
  e ainda ativou o perfil realista;
- alto contraste reverteu para material esquemático e ACES, depois restaurou AgX;
- nenhum erro de página/console foi registrado na matriz física.

## Gates executados

- TypeScript sem emissão, Vitest (30 arquivos / 154 testes) e build Vite;
- `npm run audit:light-materiality` em GPU física;
- `npm run verify:light-materiality`;
- `npm run audit:material`, Worker/Wasm, runtime e orçamento de apresentação
  em diretórios de evidência separados durante o corte.

## Veredito

O corte de cor-base e a matriz R10-E são aceitos como evidência de apresentação
reversível e de baixo custo. R10-E **não é promoção**: ainda requer a decisão e,
se justificada, a avaliação de GTAO somente no perfil `enhanced`, além de GIF,
manifesto/README sincronizados e uma decisão final de promoção. Não há base para
merge nesta etapa.
