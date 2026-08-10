import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { visualPassOf } from "./render-types";
import { VISUAL_COLORS } from "./visual-tokens";

type MaterialObject = THREE.Object3D & {
  material: THREE.Material | THREE.Material[];
};

function hasMaterial(object: THREE.Object3D): object is MaterialObject {
  return "material" in object;
}

const COMPOSITE_SHADER = {
  uniforms: {
    baseTexture: { value: null },
    bloomTexture: { value: null },
  },
  vertexShader: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform sampler2D baseTexture;
    uniform sampler2D bloomTexture;
    varying vec2 vUv;
    void main() {
      vec4 base = texture2D(baseTexture, vUv);
      vec3 bloom = texture2D(bloomTexture, vUv).rgb;
      gl_FragColor = vec4(base.rgb + bloom, base.a);
    }
  `,
};

/**
 * Renders emission into its own bloom target while matter writes the depth mask.
 * The final pass draws the untouched scene and adds only the emission bloom.
 */
export class SelectiveBloomPipeline {
  readonly bloomPass: UnrealBloomPass;
  private readonly bloomComposer: EffectComposer;
  private readonly finalComposer: EffectComposer;
  private readonly depthMaskMaterial = new THREE.MeshBasicMaterial({
    color: VISUAL_COLORS.transparentBlack,
    colorWrite: false,
    depthTest: true,
    depthWrite: true,
    side: THREE.DoubleSide,
  });
  private readonly savedMaterials = new Map<MaterialObject, THREE.Material | THREE.Material[]>();

  constructor(
    renderer: THREE.WebGLRenderer,
    private readonly scene: THREE.Scene,
    camera: THREE.Camera,
    size: THREE.Vector2,
    strength: number,
    radius: number,
  ) {
    this.bloomPass = new UnrealBloomPass(size, strength, radius, 0.12);
    this.bloomComposer = new EffectComposer(renderer);
    this.bloomComposer.renderToScreen = false;
    this.bloomComposer.addPass(new RenderPass(scene, camera));
    this.bloomComposer.addPass(this.bloomPass);

    const finalPass = new ShaderPass(
      new THREE.ShaderMaterial({
        uniforms: {
          baseTexture: { value: null },
          bloomTexture: { value: this.bloomComposer.renderTarget2.texture },
        },
        vertexShader: COMPOSITE_SHADER.vertexShader,
        fragmentShader: COMPOSITE_SHADER.fragmentShader,
        defines: {},
      }),
      "baseTexture",
    );
    finalPass.needsSwap = true;
    this.finalComposer = new EffectComposer(renderer);
    this.finalComposer.addPass(new RenderPass(scene, camera));
    this.finalComposer.addPass(finalPass);
  }

  render(): void {
    this.scene.traverse((object) => {
      if (!hasMaterial(object) || visualPassOf(object) === "emission") return;
      this.savedMaterials.set(object, object.material);
      object.material = this.depthMaskMaterial;
    });
    try {
      this.bloomComposer.render();
    } finally {
      for (const [object, material] of this.savedMaterials) object.material = material;
      this.savedMaterials.clear();
    }
    this.finalComposer.render();
  }

  setSize(width: number, height: number): void {
    this.bloomComposer.setSize(width, height);
    this.finalComposer.setSize(width, height);
  }

  dispose(): void {
    this.depthMaskMaterial.dispose();
    this.bloomComposer.dispose();
    this.finalComposer.dispose();
  }
}
