import * as THREE from "three";

export const PHOTO_WIDTH = 3.3;
export const PHOTO_HEIGHT = 2.25;

// Keep the cover, screws, substrate and frame. Only the two optical assemblies
// are replaced; the plane sits between the substrate and the original cover.
export function setPhotoInterior(group: THREE.Group, photo: boolean) {
  group.traverse(object => {
    if (["optical-core", "optical-lenses"].includes(object.userData.assemblyPart)) object.visible = !photo;
  });
}

export function photoSize(width: number, height: number) {
  const scale = Math.min(PHOTO_WIDTH / width, PHOTO_HEIGHT / height);
  return { width: width * scale, height: height * scale };
}

export async function createPhotoPanel(url: string) {
  const texture = await new THREE.TextureLoader().loadAsync(url);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  const size = photoSize(texture.image.width, texture.image.height);
  const panel = new THREE.Mesh(
    new THREE.PlaneGeometry(size.width, size.height),
    new THREE.MeshBasicMaterial({ map: texture, side: THREE.DoubleSide, toneMapped: false }),
  );
  panel.position.set(0, 1.64, 0.10);
  panel.userData.photoPanel = true;
  panel.userData.assemblyPart = "optical-core";
  // Transmission captures opaque meshes. Dither the photo into the existing
  // selection transition without moving it to the transparent render pass.
  panel.material.onBeforeCompile = shader => {
    shader.fragmentShader = shader.fragmentShader.replace("#include <color_fragment>", "#include <color_fragment>\nfloat coverage = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));\nif (diffuseColor.a <= coverage) discard;");
  };
  panel.material.customProgramCacheKey = () => "archive-photo-coverage";
  // The cover handles the original frosted-to-clear reveal.
  return panel;
}

export function disposePhoto(panel: THREE.Mesh) {
  const material = panel.material as THREE.MeshBasicMaterial;
  material.map?.dispose();
  material.dispose();
  panel.geometry.dispose();
  panel.removeFromParent();
}
