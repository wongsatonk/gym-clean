// Rim (edge) light for figure materials: a view-angle (fresnel) glow in the --edge colour, added
// as emissive light, so the silhouette reads on the dark stage from any turn — the 3D version of
// the 2D figure's edge stroke. Patches MeshStandardMaterial's shader; no extra passes or meshes.
import { Color, type MeshStandardMaterial } from 'three';

export type RimOptions = { color: number; strength?: number; power?: number };

export function addRim<M extends MeshStandardMaterial>(material: M, opts: RimOptions): M {
  const color = new Color(opts.color);
  const strength = opts.strength ?? 1.2;
  const power = opts.power ?? 2.2;
  material.onBeforeCompile = (shader) => {
    shader.uniforms.rimColor = { value: color };
    shader.uniforms.rimStrength = { value: strength };
    shader.uniforms.rimPower = { value: power };
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        '#include <common>\nuniform vec3 rimColor;\nuniform float rimStrength;\nuniform float rimPower;',
      )
      .replace(
        '#include <emissivemap_fragment>',
        '#include <emissivemap_fragment>\n' +
          'float rimF = 1.0 - saturate(dot(normalize(normal), normalize(vViewPosition)));\n' +
          'totalEmissiveRadiance += rimColor * (rimStrength * pow(rimF, rimPower));',
      );
  };
  // Same patch for every rim material, so they share one compiled program.
  material.customProgramCacheKey = () => 'figure-rim';
  return material;
}
