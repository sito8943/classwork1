import { EquirectangularReflectionMapping, TextureLoader } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { HDRLoader } from 'three/addons/loaders/HDRLoader.js';

const BASE_URL = 'https://pub-c295cf8704164d52b5582264a7bb9ff2.r2.dev/2026';

const ASSETS = [
  { key: 'windows', type: 'texture', path: BASE_URL + '/tv/windows.jpg' },
  { key: 'tv', type: 'gltf', path: BASE_URL + '/tv/tv.glb' },
  { key: 'screen', type: 'gltf', path: BASE_URL + '/tv/screen.glb' },
  {
    key: 'envmap',
    type: 'envmap',
    path: BASE_URL + '/tv/venice_sunset_1k.hdr',
  },
];

class Resources {
  #resources;
  #loaders;

  constructor() {
    this.#resources = new Map();
    this.#loaders = {
      tl: new TextureLoader(),
      gltf: new GLTFLoader(),
      hdrLoader: new HDRLoader(),
    };
  }

  get(v) {
    return this.#resources.get(v);
  }

  async load() {
    const promises = ASSETS.map((asset) => {
      let promise = undefined;

      // GLTF
      if (asset.type === 'gltf') {
        promise = new Promise((res) => {
          this.#loaders.gltf.load(asset.path, (model) => {
            this.#resources.set(asset.key, model);
            res();
          });
        });
      } else if (asset.type === 'texture') {
        promise = new Promise((res) => {
          this.#loaders.tl.load(asset.path, (model) => {
            this.#resources.set(asset.key, model);
            res();
          });
        });
      }

      // ENVMAP // HDR
      else if (asset.type === 'envmap') {
        promise = new Promise((res) => {
          this.#loaders.hdrLoader.load(asset.path, (texture) => {
            this.#resources.set(asset.key, texture);
            texture.mapping = EquirectangularReflectionMapping;
            res();
          });
        });
      }

      // return promise
      return promise;
    });

    await Promise.all(promises);
  }
}

const resources = new Resources();
export default resources;
