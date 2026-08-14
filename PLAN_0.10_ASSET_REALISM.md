# Anexo executável · malha hiper-realista sobre a baseline 0.10

**Documento:** anexo técnico de [PLAN_0.10.md](PLAN_0.10.md) · cobre o corte `R10-H`
(ingestão de asset) e os pontos de `R10-B`/`R10-D`/`R10-E` que a malha externa toca.
**Baseline medida:** produto `0.9.0` · ABI/snapshot `8` · 37 buffers · cinco hashes ·
catálogo schema 1 com 32 entradas · 98 renderizáveis (58 ligados + 40 excluídos) ·
25 objetos elegíveis a PBR · tampas stencil com teto de 18 draws.

---

## 0 · Correções de premissa antes de qualquer linha de código

Quatro pontos do enunciado não correspondem ao código atual. Implementar sem corrigi-los
produz falha em tempo de execução, não degradação silenciosa.

| # | Premissa | O que o código diz | Consequência prática |
| :-- | :-- | :-- | :-- |
| C1 | “tampas stencil implementadas para os 25 objetos PBR elegíveis” | são **dois conjuntos distintos**. PBR elegível = 25 objetos do `REALISTIC_ILLUSTRATIVE_MANIFEST`. Fonte de tampa = `CUT_CAP_OBJECTS` em `main.ts:236`, com **4** objetos na Visão Geral, 2 em Lâminas, 2 em Célula, 1 em Neurônio, 1 em Eletricidade, 2 em Sinapse | o orçamento de tampa é função do **número de malhas fechadas**, não do número de objetos PBR. §3 abaixo depende disso |
| C2 | “limites de memória de textura da ABI v8” | a ABI v8 é o contrato Rust↔Wasm↔Worker: 37 buffers de estado de simulação. **Não existe orçamento de textura nela.** O orçamento de textura vive em `MaterialProfileAudit.estimatedOwnedTextureBytes` e em `renderer.info.memory.textures` | o teto de normal maps é gráfico (PERF-010), não de ABI. §1.3 usa os números certos |
| C3 | “mapear as sub-malhas aos 32 IDs estáveis” | dos 32 IDs, apenas **6** são macroscópicos (`encephalon`, `cerebrum`, `cerebral-hemisphere-left/right`, `cerebellum`, `brainstem`). Os outros 26 são coluna, patch, neurônio e sinapse | uma malha de encéfalo esculpida no Blender mapeia para no máximo 6 IDs. Lobos, ventrículos, corpo caloso e **qualquer vaso** não têm ID: `declareAnatomicalBinding()` **lança exceção** com ID desconhecido |
| C4 | “vasos sanguíneos complexos” integrados agora | existem **zero** entradas vasculares no catálogo | a malha de vasos **não pode ser vinculada** até `R10-B` publicar as 44 entradas. Dependência dura, não preferência |

Consequência de ordenação: **R10-B (vascular) precede a ingestão da malha de vasos.**
A malha de encéfalo pode entrar antes, limitada aos 6 IDs macroscópicos.

E a decisão de fase permanece a acordada: este anexo especifica **o pipeline**; distribuir
um atlas de terceiros continua condicionado à escolha de fonte e licença pelo mantenedor
(AST-031/AST-037).

---

## 1 · Fluxo de assets e compatibilidade com o schema 1

### 1.1 Nomenclatura: o nome da malha é a chave primária

Três subsistemas independentes resolvem objeto **por nome**:

```ts
// material-profile.ts:407  → manifesto de material
const object = root.getObjectByName(declaration.objectName);
if (!object) throw new Error(`material manifest object is missing: ${declaration.objectName}`);

// clipping.ts:477         → fonte de tampa stencil
const object = registration.root.getObjectByName(name);

// anatomical-provenance.ts:42 → binding de catálogo
if (!anatomicalEntryById(entryId, catalog)) throw new Error(`unknown anatomical catalog entry: ${entryId}`);
```

Portanto o nome do objeto no Blender é contrato, não estética. Convenção obrigatória:

```
<view>__<slot>__<lodOrRole>
```

| Nome no Blender | Papel | Onde é resolvido |
| :-- | :-- | :-- |
| `leftHemi-shell` | substitui a casca convexa atual, mantém o nome legado | manifesto de material, `CUT_CAP_OBJECTS`, binding |
| `overview__leftHemi__cap` | proxy estanque de baixa densidade, só stencil | `CUT_CAP_OBJECTS` |
| `overview__leftHemi__lod0` / `__lod1` | malha visível de alta e média densidade | manifesto de material |

**Regra de ouro:** os quatro nomes legados — `leftHemi-shell`, `rightHemi-shell`,
`cerebellum-shell`, `stem-shell` — **não mudam**. Renomeá-los quebra simultaneamente o
manifesto de material, o `CUT_CAP_OBJECTS` e a auditoria de cobertura. A malha nova assume
o nome; o nome não se adapta à malha.

### 1.2 O mapa de binding: AST-034 verificado na importação, não na revisão

O carregador recebe um mapa fechado e **falha** se qualquer malha importada não estiver
nele. Isso transforma a cobertura de 98 objetos em invariante de build.

```ts
// src/assets-pipeline/asset-binding-map.ts
export type AssetBinding =
  | { readonly kind: "catalog-entry"; readonly entryId: string }
  | { readonly kind: "not-anatomical"; readonly reason: string };

export const OVERVIEW_ASSET_BINDINGS: Readonly<Record<string, AssetBinding>> = {
  "leftHemi-shell":          { kind: "catalog-entry", entryId: ANATOMY_IDS.leftHemisphere },
  "rightHemi-shell":         { kind: "catalog-entry", entryId: ANATOMY_IDS.rightHemisphere },
  "cerebellum-shell":        { kind: "catalog-entry", entryId: ANATOMY_IDS.cerebellum },
  "stem-shell":              { kind: "catalog-entry", entryId: ANATOMY_IDS.brainstem },
  "overview__leftHemi__cap": { kind: "not-anatomical", reason: "Watertight stencil proxy; carries no anatomical claim." },
  // …
};

export function applyAssetBindings(
  root: THREE.Object3D,
  bindings: Readonly<Record<string, AssetBinding>>,
): void {
  const unmapped: string[] = [];
  root.traverse((object) => {
    if (!("material" in object)) return;
    const binding = bindings[object.name];
    if (!binding) { unmapped.push(object.name || object.type); return; }
    if (binding.kind === "catalog-entry") declareAnatomicalBinding(object, binding.entryId);
    else declareNonAnatomical(object, binding.reason);
  });
  if (unmapped.length > 0) {
    throw new Error(`imported meshes without an anatomical declaration: ${unmapped.sort().join(", ")}`);
  }
}
```

`auditAnatomicalScene()` continua exigindo
`boundObjects + explicitlyNonAnatomicalObjects === totalRenderableObjects`. Com o mapa
fechado, uma malha esquecida no Blender falha na importação, não na auditoria final.

### 1.3 Exigências do exportador glTF que o manifesto de material impõe

`RealisticIllustrativeMaterialManager.registerLayer` (`material-profile.ts:398-453`)
rejeita, nesta ordem:

| Rejeição | Regra no Blender |
| :-- | :-- |
| `object is not a single-material mesh` | **um material por objeto.** Multi-material → `Edit Mode › P › By Material` antes de exportar |
| `geometry lacks normals` | exportar normais; sem *Custom Split Normals* não suportado pelo alvo |
| `material manifest envelope exceeded` | `geometry.boundingSphere.radius ≤ maximumLocalRadius`. As cascas de Visão Geral declaram `2.2` — aplique escala no Blender (`Ctrl+A › Scale`), não no `Object3D` |
| `lacks matter provenance` | `declareVisual(obj, "matter", …)` antes de `registerLayer` |
| `state material lacks a semantic binding` | se a malha for `state`, o binding com campo/unidade/transformação é obrigatório |

**UVs.** Sem atributo `uv`, o manager gera uma projeção esférica de emergência
(`sphericalUvAttribute`, `material-profile.ts:160`). Isso é fallback, não pipeline: um
normal map assado no Blender **não alinha** com UV esférica gerada em runtime.
Exportar UVs reais é obrigatório para qualquer bake.

### 1.4 Vasos: como não estourar draw calls

A malha de vasos da referência é o pior caso possível para draw calls se importada como
hierarquia de artista (dezenas de objetos). Regra de agrupamento:

| Estratégia | Draws | Quando |
| :-- | :-- | :-- |
| **mesclar por classe** — uma malha `arterial`, uma `venous`, uma `capillary` | 3 | padrão. `Ctrl+J` no Blender, ou `mergeGeometries()` na importação |
| instanciar segmentos repetidos (arteríolas penetrantes) | 1 por classe | vistas Lâminas/Célula |
| um objeto por segmento nomeado | N | **proibido** |

Mesclar destrói o nome por segmento — e o picking por segmento depende dele. Solução sem
custo: manter o **grafo em dados** (o contrato `src/vascular/vascular-topology-v1.json` de
R10-B) e resolver o segmento por `geometry.groups` + atributo `segmentIndex` no raycast,
em vez de por `Object3D` separado. Uma malha mesclada, picking por segmento, 1 draw.

Teto herdado de R10-B: **≤ 6 draws na Visão Geral, ≤ 3 em Lâminas, ≤ 2 em Célula,
≤ 5 em Sinapse, 0 em Eletricidade** — asseverado em teste, não estimado.

### 1.5 Normal maps de alta frequência: o orçamento real

O que existe hoje (`ProceduralNormalMapCache`): três mapas 256² RGBA8 com mipmaps.

```
256 × 256 × 4 bytes × 4/3 (mipmaps) = 349.526 B por mapa
× 3 mapas                            = 1.048.577 B ≈ 1,0 MiB
```

Proposta para giros e sulcos de alta frequência, com teto explícito:

| Mapa | Resolução | Formato | Bytes com mipmap | Papel |
| :-- | :-- | :-- | --: | :-- |
| `cortical-macro` | 1024² | RGB8 tangente | 5.592.406 | sulcos primários, se **não** estiverem na geometria |
| `cortical-micro` | 512², *tileable*, `RepeatWrapping` | RGB8 | 1.398.102 | poros e microrrelevo, repetido 8–16× |
| `cortical-ao` | 512² | R8 (canal único) | 349.526 | oclusão de cavidade |
| **total adicional** | | | **≈ 7,3 MiB** | |

Regras:

1. **Sulco primário é geometria, não textura.** Normal map não produz silhueta nem
   oclusão correta em corte. Os sulcos macroscópicos vão para a malha (ou para a
   girificação procedural de R10-D); a textura fica com o que é menor que um triângulo.
2. **O micro é *tileable* e repetido**, não único por hemisfério: 512² repetido dá
   densidade equivalente a 4096² por 1/64 da memória.
3. `colorSpace = THREE.NoColorSpace` em normal e AO (o gerador atual já faz isso);
   `SRGBColorSpace` apenas em mapas de cor.
4. Teto declarado: `estimatedOwnedTextureBytes ≤ 12 MiB` no perfil `baseline`. Medir com
   `__BRAIN_ENGINE__.presentationAudit().material.estimatedOwnedTextureBytes` e registrar
   o valor do PMREM medido — não estimar.
5. KTX2/Basis é o caminho quando o total passar de 12 MiB; entra pelo manifesto de asset
   com `compression` declarada (AST-037), nunca como otimização informal.

---

## 2 · Calibração PBR na película `realistic-illustrative`

### 2.1 Mudanças de tipo exigidas

```ts
// render-types.ts
export type VisualMaterialSurface = "tissue" | "membrane" | "substrate" | "wet-tissue";

export interface VisualMaterialEligibility {
  readonly id: string;
  readonly surface: VisualMaterialSurface;
  readonly maximumLocalRadius: number;
  readonly opacityRange: readonly [number, number];
  readonly source: "procedural-scene-graph" | "external-asset";   // ← união ampliada
}
```

Atualizar também o *type guard* `visualMaterialEligibilityOf`, que hoje compara contra os
três literais antigos e devolveria `undefined` para `wet-tissue` — silenciosamente
removendo o objeto da contagem de elegíveis.

### 2.2 Parâmetros do tecido úmido

```ts
// material-profile.ts › surfaceParameters()
if (surface === "wet-tissue") {
  return {
    roughness: 0.38,            // base fosca; o brilho vem do clearcoat
    metalness: 0,               // tecido nunca é condutor
    clearcoat: 1.0,             // película de LCR/serosidade
    clearcoatRoughness: 0.14,   // reflexo nítido = molhado; > 0.30 lê como plástico seco
    ior: 1.37,                  // índice de tecido mole
    sheen: 0.08,                // quase nulo: sheen alto lê como veludo
    sheenRoughness: 0.9,
    sheenColor: 0xc98f86,
    transmission: 0,            // ver §2.3 — zero no perfil baseline
    thickness: 0,
  };
}
```

E na fábrica do material:

```ts
const material = new THREE.MeshPhysicalMaterial({
  color: new THREE.Color(0xb98a80),          // córtex; substância branca ≈ 0xe8ddd2
  roughness: p.roughness,
  metalness: 0,
  clearcoat: p.clearcoat,
  clearcoatRoughness: p.clearcoatRoughness,
  clearcoatNormalMap: normalMapProvider.get("cortical-micro"), // relevo só no verniz
  ior: p.ior,
  specularIntensity: 1.0,
  envMapIntensity: 1.35,                     // o “molhado” é reflexo de ambiente
  normalMap: normalMapProvider.get("cortical-macro"),
  normalScale: new THREE.Vector2(0.75, 0.75),
  aoMap: normalMapProvider.get("cortical-ao"),
  aoMapIntensity: 0.85,
  sheen: p.sheen,
  sheenRoughness: p.sheenRoughness,
  sheenColor: new THREE.Color(p.sheenColor),
});
material.emissive.setHex(0x000000);          // tecido não emite; bloom é só de emissão
```

`aoMap` exige o segundo conjunto de UV (`uv1`). Se o bake usar o mesmo UV, copiar o
atributo uma vez na importação: `geometry.setAttribute("uv1", geometry.getAttribute("uv"))`.

### 2.3 Espalhamento subsuperficial: os dois caminhos e seus custos

**`transmission` no Three.js não é SSS — é transparência refrativa.** E ela dispara
`renderTransmissionPass()` (`WebGLRenderer.js:1973`), que **re-renderiza a cena opaca**
num render target próprio com mipmap, a cada `render()` do composer final.
`thickness`, `attenuationColor` e `attenuationDistance` só têm efeito com
`transmission > 0`.

| Caminho | Parâmetros | Custo | Perfil |
| :-- | :-- | :-- | :-- |
| **A · transmissão real** | `transmission: 0.10`, `thickness: 0.35`, `attenuationColor: 0x7a2d24`, `attenuationDistance: 0.6` | **um render de cena por frame** + mipmap | só `enhanced`/`cinema`; `transmissionResolutionScale: 0.5` obrigatório |
| **B · translucidez injetada** | wrap diffuse + espessura assada por vértice, dentro do shader que já roda | **zero passes** | `baseline` |

Caminho B, com uniforme criado uma única vez:

```ts
material.userData.stateUniforms = {
  translucency: { value: 0.55 },   // intensidade do wrap
  bloodTint:    { value: new THREE.Color(0x7a2d24) },
};

material.onBeforeCompile = (shader) => {
  shader.uniforms.translucency = material.userData.stateUniforms.translucency;
  shader.uniforms.bloodTint    = material.userData.stateUniforms.bloodTint;

  shader.vertexShader = shader.vertexShader
    .replace("#include <common>", `
      #include <common>
      attribute float thicknessFactor;   // assado em R10-D
      varying float vThickness;
    `)
    .replace("#include <begin_vertex>", `
      #include <begin_vertex>
      vThickness = thicknessFactor;
    `);

  shader.fragmentShader = shader.fragmentShader
    .replace("#include <common>", `
      #include <common>
      uniform float translucency;
      uniform vec3  bloodTint;
      varying float vThickness;
    `)
    .replace("#include <dithering_fragment>", `
      #include <dithering_fragment>
      // wrap diffuse: a luz “vaza” pela borda proporcionalmente à espessura assada
      vec3  L    = normalize( directionalLights[ 0 ].direction );
      float wrap = clamp( ( dot( normal, L ) + 0.6 ) / 1.6, 0.0, 1.0 );
      float back = pow( clamp( dot( normalize( vViewPosition ), -L ), 0.0, 1.0 ), 2.5 );
      gl_FragColor.rgb += bloodTint * translucency * wrap * back * ( 1.0 - vThickness );
      #include <dithering_fragment>
    `);
};
```

O `thicknessFactor` vem do baking de R10-D (§6.2 do plano principal); sem ele, use
`1.0 - aoFactor` como aproximação e declare isso no manifesto.

**Atenção ao contrato:** `onBeforeCompile` sem `material.customProgramCacheKey` faz o
Three.js reaproveitar programas indevidamente entre materiais. Adicionar:

```ts
material.customProgramCacheKey = () => "wet-tissue-translucency-v1";
```

---

## 3 · Integração com as tampas stencil existentes

### 3.1 A aritmética exata do teto

`ClippingSystem.refreshCapSources()` (`clipping.ts:472-489`):

```
draws = capSources.length × 2 × planes.length + planes.length
```

| Configuração | Fontes | Planos | Draws | Situação |
| :-- | --: | --: | --: | :-- |
| corte simples, Visão Geral hoje | 4 | 1 | **9** | ✓ dentro |
| laje, Visão Geral hoje | 4 | 2 | **18** | ✓ **exatamente no teto** |
| laje com 5 fontes | 5 | 2 | 22 | ✗ truncado para 4 fontes |

O truncamento é silencioso:

```ts
this.capSources = this.capSources.slice(
  0, Math.max(0, Math.floor((MAXIMUM_CAP_DRAW_CALLS - this.planes.length) / (2 * this.planes.length))),
);
```

**A Visão Geral já está no limite.** Qualquer quinta malha fechada adicionada a
`CUT_CAP_OBJECTS` é descartada em modo laje — e o sintoma é uma casca visualmente oca em
um dos hemisférios, não um erro.

### 3.2 O custo escondido: geometria compartilhada

`StencilCapPass.configure` faz `source.clone(false)` — os clones **compartilham a
geometria original**. Com 4 fontes e 1 plano são 8 re-renderizações completas da malha de
origem por frame (backside + frontside). Draw *calls* continuam 9; **triângulos**, não.

| Fonte de tampa | Triângulos | Triângulos de stencil/frame (1 plano) |
| :-- | --: | --: |
| casca convexa atual (~180 pontos) | ~356 | ~2.848 |
| malha hiper-realista importada | 200.000 | **1.600.000** |

Por isso a regra: **proxy de tampa dedicado.**

```ts
const CUT_CAP_OBJECTS: Readonly<Record<SimulationView, readonly string[]>> = {
  overview: [
    "overview__leftHemi__cap",     // ≤ 2.000 triângulos, estanque, colorWrite irrelevante
    "overview__rightHemi__cap",
    "overview__cerebellum__cap",
    "overview__stem__cap",
  ],
  // …
};
```

Requisitos do proxy no Blender: **estanque** (`Mesh › Cleanup › Merge by Distance`, zero
aresta de contorno em `Select All by Trait › Non Manifold`), normais coerentes para fora
(`Shift+N`), envolvendo a malha visível (`Shrink/Fatten` positivo de ~0,5% do raio) e
**sem** entrar no manifesto de material — ele nunca escreve cor.

Novo teto a asseverar em teste: **≤ 2.000 triângulos por fonte de tampa**, além dos
9/18 draws.

### 3.3 Miolo maciço com cor de carne, sem draw adicional

A tampa é hoje uma `PlaneGeometry(2,2)` com `MeshBasicMaterial` azul-petróleo sólido
(`0x255b77`, opacidade 0,86 — `clipping.ts:201-216`). Uma cor chapada para todas as
regiões.

Para ler como miolo preenchido, **troque o material da tampa, não a contagem de objetos**:
uma `ShaderMaterial` com projeção triplanar em espaço de mundo, preservando **byte a byte**
o contrato de stencil.

```ts
const capMaterial = new THREE.ShaderMaterial({
  uniforms: {
    grayMatter:  { value: new THREE.Color(0xa8827a) },
    whiteMatter: { value: new THREE.Color(0xe6dbd0) },
    interiorMap: { value: interiorNoiseTexture },   // 256² tileable, ~350 KB
    planeNormal: { value: new THREE.Vector3(0, 0, 1) },
  },
  vertexShader: /* posição de mundo → varying vWorld */,
  fragmentShader: /* triplanar(interiorMap, vWorld) mistura cinzenta↔branca por profundidade */,
  side: THREE.DoubleSide,
  transparent: true,
  depthTest: true,
  depthWrite: true,
  // contrato de stencil preservado exatamente:
  stencilWrite: true,
  stencilRef: 0,
  stencilFunc: THREE.NotEqualStencilFunc,
  stencilFail: THREE.ReplaceStencilOp,
  stencilZFail: THREE.ReplaceStencilOp,
  stencilZPass: THREE.ReplaceStencilOp,
  clippingPlanes: stablePlanes.filter((_, index) => index !== planeIndex),
});
```

Três invariantes que **não** podem mudar:

1. `cap.onAfterRender = (renderer) => renderer.clearStencil();` — sem isso o stencil
   contamina o frame seguinte;
2. `declareVisual(cap, "matter", "decoration")` + `excludeFromSelectiveBloom(cap)` — a
   tampa é decoração e não pode florescer;
3. `clippingPlanes` recebe **os outros** planos, nunca o próprio: é o que impede a tampa
   de vazar para fora da laje.

Limite epistemológico obrigatório: a distinção cinzenta/branca na face de corte é
**ilustrativa e procedural**. Não há segmentação de substância no motor. A entrada de
catálogo correspondente declara isso, e a sonda de corte continua lendo **apenas**
`field.waveActivity` — a cor da tampa nunca vira leitura de campo.

### 3.4 Interação com o composer de bloom

As tampas e os clones de stencil vivem em `scene`, não no grupo da vista, e portanto
atravessam os dois `EffectComposer`. `excludeFromSelectiveBloom` os torna invisíveis
durante o passe de bloom (`selective-bloom.ts:107-111`), então o custo de stencil é pago
uma vez por frame, no composer final. **Manter esse `excludeFromSelectiveBloom` em
qualquer objeto novo de tampa** — sem ele, o custo dobra e o stencil é escrito num alvo
onde ninguém o lê.

Os render targets já são criados com `stencilBuffer: true` (`selective-bloom.ts:76-81`);
nenhuma mudança é necessária ali.

---

## 4 · Vínculo de estado do Worker (ABI v8) sem alocação por frame

### 4.1 O que a ABI v8 realmente entrega

`NeuralSnapshot` (`protocol.ts:112`) chega ao thread principal com buffers
**transferidos** (não copiados): `activations`, `potentials`, `weights`, `signals`,
`field`, `corticothalamic`, `cellPatch`, `cellSpikeEvents`, `chemical`, `diagnostics`.
São `Float32Array`/`Uint32Array` prontos para leitura indexada. A ABI não transporta nada
gráfico.

### 4.2 O precedente legítimo já existente

Uma malha anatômica **pode** ser dirigida por estado — a casca atual já é
(`brain-layer.ts:300-306`):

```ts
declareVisual(shell, "matter", "state", {
  field: `mean(activations[region=${region}])`,
  unit: "normalized activity",
  transform: "regional mean to shell opacity",
  redundancy: ["position", "shape"],
});
```

Duas regras decorrem disso:

- objeto dirigido por estado **é** `state` e declara `field`/`unit`/`transform`/
  `redundancy` — o manifesto de material rejeita `state` sem binding
  (`material-profile.ts:418`);
- objeto `decoration` **não pode** variar com estado (GFX-005). Um vaso, um crânio ou uma
  meninge não pulsa. Se a opacidade dele muda, ou vira `state` com campo publicado, ou não
  muda.

### 4.3 Padrão de escrita sem alocação

```ts
// uma vez, na criação do material
material.userData.stateUniforms = { activity: { value: 0 }, cutFade: { value: 0 } };
material.onBeforeCompile = (shader) => {
  shader.uniforms.activity = material.userData.stateUniforms.activity;
  shader.uniforms.cutFade  = material.userData.stateUniforms.cutFade;
};
material.customProgramCacheKey = () => "wet-tissue-state-v1";
```

```ts
// por frame — apenas escritas escalares, zero objeto criado
export class RealisticShellBinding {
  private readonly scratch = new Float32Array(4);   // pré-alocado no construtor
  private lastVisible = true;

  update(snapshot: NeuralSnapshot, previous: NeuralSnapshot | undefined, alpha: number): void {
    const wave = snapshot.field.waveActivity;
    const previousWave = previous?.field.waveActivity;
    let total = 0;
    for (let i = 0; i < this.vertexIndices.length; i += 1) {   // índices pré-computados
      const v = this.vertexIndices[i];
      const current = wave[v];
      const before = previousWave ? previousWave[v] : current;
      total += before + (current - before) * alpha;
    }
    const mean = total / this.vertexIndices.length;
    this.uniforms.activity.value = mean;                       // escrita escalar
    const visible = mean > this.cullThreshold;
    if (visible !== this.lastVisible) {                        // ← detector de mudança
      this.object.visible = visible;
      this.lastVisible = visible;
      this.onSceneGraphRevisionChanged();                      // invalida caches de travessia
    }
  }
}
```

Proibições explícitas no laço, todas presentes hoje em algum ponto do renderer:

| Proibido | Alternativa |
| :-- | :-- |
| `new Float32Array(n)` por frame (`brain-layer.ts:341`) | buffer pré-alocado no construtor |
| `.map` / `.filter` / `.reduce` com *closure* sobre typed array | laço `for` indexado |
| `new THREE.Vector3()` / `Color()` / `Matrix4()` no laço | instâncias `private readonly temp*` reutilizadas |
| espalhar (`[...typedArray]`) | acesso indexado |
| alternar `object.visible` todo frame | detector de mudança + invalidação explícita |

**Por que o detector de mudança importa:** `SelectiveBloomPipeline.render()` e
`PresentationMaterialEffects.beforeRender()` percorrem a árvore a cada frame. A otimização
de cache prevista em R10-C depende de uma revisão do scene graph; alternar `visible` sem
sinalizar invalida o cache silenciosamente ou, pior, o deixa obsoleto.

### 4.4 Fronteira que não se atravessa

`cutFade`, `activity` e visibilidade são **apresentação**. Nenhum deles retorna ao Worker,
nenhum entra em comando, nenhum altera `dt`, preset ou topologia. `UI-004` e `ARC-010`
continuam valendo: a preferência visual nunca cruza a ABI como parâmetro científico.

---

## 5 · Critérios de promoção

### 5.1 O que cada comando prova — e o que não prova

| Comando | Prova | **Não** prova |
| :-- | :-- | :-- |
| `cargo test --workspace` | que o motor Rust não foi tocado (83 testes) | nada sobre a malha, o material ou o custo |
| `cargo clippy --workspace --all-targets -- -D warnings` | higiene do crate | idem |
| `npm run typecheck` | as uniões de tipo ampliadas em §2.1 fecham | comportamento em runtime |
| `npm run test` | contratos de render, clipping, material, catálogo | pixels |
| `npm run audit:anatomy` | catálogo válido e cobertura por objeto | custo gráfico |
| `npm run audit:material` | elegibilidade PBR, fallback atômico, bytes de textura | invariância dos hashes |
| `npm run audit:runtime` | perfil, cadência, contraste, teclado | GPU física |
| `npm run check` | agregado dos anteriores | baseline em hardware real |

**A invariância dos cinco hashes não é provada por `cargo test`.** Ela é provada no
navegador, com o relógio congelado, exatamente como R10-A fez:

```js
await page.evaluate(() => window.__BRAIN_ENGINE__.setCaptureMode(true));
const before = await page.evaluate(() => window.__BRAIN_ENGINE__.diagnostics());
// … importar malha, trocar perfil, mover corte, alternar laje, isolar, apontar, buscar …
const after  = await page.evaluate(() => window.__BRAIN_ENGINE__.diagnostics());
assert.deepEqual(
  [before.stateHash, before.corticothalamicHash, before.cellPatchHash, before.chemicalHash, before.cellSpikeEventHash],
  [after.stateHash,  after.corticothalamicHash,  after.cellPatchHash,  after.chemicalHash,  after.cellSpikeEventHash],
);
```

### 5.2 Cadência: o que de fato degrada

`dt` é fixo (`83,3 µs`) e independe do frame. A cadência de 60/30/15/10 Hz é decidida por
`shouldRequestSnapshot(publishedTick, targetTick, cadence)` sobre ticks, não sobre tempo de
parede. Uma malha pesada **não muda a cadência declarada**; ela reduz a taxa de
`requestAnimationFrame`, e portanto a taxa efetiva de avanço em tempo de parede.

O gate correto é o percentil, não a cadência nominal:

```js
const profile = await page.evaluate(() => window.__BRAIN_ENGINE__.profile());
// frame p95, latência p95 do Worker, draws, triângulos, geometrias, texturas
```

### 5.3 Gates novos exigidos por esta alteração

| Gate | Critério de falha |
| :-- | :-- |
| cobertura de binding | qualquer malha importada fora do `assetBindingMap` |
| tampa · draws | `estimatedAdditionalDrawCalls > 9` no corte simples ou `> 18` na laje |
| tampa · triângulos | qualquer fonte de tampa acima de 2.000 triângulos |
| tampa · truncamento | `capSources.length < CUT_CAP_OBJECTS[view].length` com corte ativo — hoje isso passa em silêncio |
| textura | `estimatedOwnedTextureBytes > 12 MiB` no perfil `baseline` |
| passe de transmissão | qualquer material com `transmission > 0` no perfil `baseline` |
| alocação por frame | crescimento de heap acima da tolerância em 600 frames com o relógio congelado |
| integridade de asset | SHA-256 do arquivo diferente do manifesto; licença ausente; formato fora de glTF/GLB |
| fallback atômico | falha de carregamento/shader que não retorne a cena inteira a `schematic` |
| sincronia do GIF | `visualContractHash` divergente (QA-117) |

### 5.4 Sequência de execução para a PR

```bash
npm run typecheck && npm run test -- --reporter=dot
```

```bash
cargo test --workspace && cargo clippy --workspace --all-targets -- -D warnings
```

```bash
npm run audit:anatomy && npm run audit:material && npm run audit:runtime
```

```bash
npm run check && npm run verify:brain-gif
```

A auditoria da PR (`AUDIT_0.10_R10_H.md`) registra: comandos executados, ambiente, os
cinco hashes antes/depois, draws/triângulos/texturas por vista antes/depois, bytes do
asset e seu SHA-256, contagem de objetos ligados/excluídos, e o motivo de qualquer
fallback observado.

---

## 6 · Ordem de execução recomendada

1. **R10-B** — sem as 44 entradas vasculares, a malha de vasos não tem ID para vincular (C4).
2. **R10-C** — o orçamento precisa existir antes de gastar triângulos e textura.
3. **R10-H §1** — manifesto, carregador estrito e `assetBindingMap`, validados com fixture
   sintética.
4. **§3 deste anexo** — proxies de tampa e material triplanar da tampa, ainda sobre a
   geometria atual: valida o pipeline de stencil isoladamente.
5. **R10-D/§2** — geometria de alta densidade e calibração `wet-tissue`.
6. **R10-G** — recaptura do GIF e verificação de sincronia.

Fazer §5 antes de §3 é o erro caro: a malha entra, a tampa trunca em silêncio no modo laje,
e o sintoma aparece como “buraco no hemisfério” num artefato de captura, não como falha de
teste.
