import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { setPhotoInterior, photoSize, PHOTO_WIDTH, PHOTO_HEIGHT } from "../src/photo-panel.ts";

const bytes = await readFile(new URL("../public/assets/archive-assembly.glb", import.meta.url));
const { scene } = await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength), "");
const meshes=[];
scene.traverse(object=>{if(object.isMesh) meshes.push(object);});
setPhotoInterior(scene,true);
const hidden=meshes.filter(mesh=>!mesh.visible);
assert.equal(hidden.length,6,"only six optical interior meshes are replaced");
for(const mesh of meshes) {
  const internal=["optical-core","optical-lenses"].includes(mesh.userData.assemblyPart);
  assert.equal(mesh.visible,!internal);
}
scene.updateMatrixWorld(true);
const cover=meshes.find(mesh=>mesh.material.name.startsWith("Frosted_Polymer"));
const base=meshes.find(mesh=>mesh.material.name.startsWith("Optical_Diffuser"));
const coverBounds=new THREE.Box3().setFromObject(cover), baseBounds=new THREE.Box3().setFromObject(base);
assert.ok(.10 < coverBounds.min.z && .10 > baseBounds.max.z,"photo remains inside the original shell");
assert.ok(1.64+PHOTO_HEIGHT/2 < 2.835,"photo does not cover the printed top label");
for(const [width,height] of [[6000,4000],[4000,6000],[1000,1000],[10000,500]]) {
  const size=photoSize(width,height);
  assert.ok(size.width<=PHOTO_WIDTH+1e-9 && size.height<=PHOTO_HEIGHT+1e-9);
  assert.ok(Math.abs(size.width/size.height-width/height)<1e-9,"no photo stretching or cropping");
}
setPhotoInterior(scene,false);
assert.ok(meshes.every(mesh=>mesh.visible),"removing photo restores original components");
console.log("Gallery: original shell preserved, optical components replaced, photo depth and aspect ratio checked.");
