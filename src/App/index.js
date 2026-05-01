import {
  AmbientLight,
  Clock,
  DoubleSide,
  Mesh,
  MeshStandardMaterial,
  PerspectiveCamera,
  PlaneGeometry,
  Scene,
  TorusKnotGeometry,
  WebGLRenderer,
  PCFShadowMap,
} from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import Stats from 'stats.js';

export default class App {
  #renderer;
  #camera;
  #scene;
  #stats;
  #mesh;
  #clock;
  #controls;
  #rafId;
  #isDestroyed;

  constructor() {
    this.#rafId = 0;
    this.#isDestroyed = false;

    this.#init().catch((error) => {
      // Keep errors visible during bootstrap without crashing silently.
      console.error(error);
    });
  }

  async #init() {
    this.#stats = new Stats();
    this.#stats.showPanel(1); // 0: fps, 1: ms, 2: mb, 3+: custom

    document.body.appendChild(this.#stats.dom);

    const canvas = document.querySelector('#canvas');
    if (!canvas) {
      throw new Error('Canvas element #canvas was not found');
    }

    this.#renderer = new WebGLRenderer({
      canvas,
    });

    this.#renderer.shadowMap.enabled = true;
    this.#renderer.shadowMap.type = PCFShadowMap;

    this.#renderer.setSize(window.innerWidth, window.innerHeight);

    this.#clock = new Clock();

    const aspect = window.innerWidth / window.innerHeight;

    this.#camera = new PerspectiveCamera(60, aspect, 0.1, 100);
    this.#camera.position.z = 20;

    this.#controls = new OrbitControls(this.#camera, this.#renderer.domElement);
    this.#controls.enableDamping = true;

    this.#scene = new Scene();

    await this.#load();

    this.#animate();
    this.#initEvents();
  }

  async #load() {
    // await resources.load();

    // MESHES
    this.#initMesh();

    // LIGHTS
    this.#initLights();
  }

  #initLights() {
    const al = new AmbientLight('white', 1);

    this.#scene.add(al);
  }

  #initMesh() {
    this.#initTorusKnot();

    const geo = new PlaneGeometry(35, 35);
    const material = new MeshStandardMaterial({
      side: DoubleSide,
    });
    const mesh = new Mesh(geo, material);
    mesh.rotateX(-Math.PI / 2);
    mesh.position.y = -19;

    this.#scene.add(mesh);
  }

  #initTorusKnot() {
    const geo = new TorusKnotGeometry(10, 3, 100, 16);

    const material = new MeshStandardMaterial({
      // wireframe: true,
    });
    const mesh = new Mesh(geo, material);
    this.#mesh = mesh;

    this.#scene.add(mesh);
  }

  #resize = () => {
    if (this.#isDestroyed) {
      return;
    }

    const w = window.innerWidth;
    const h = window.innerHeight;

    this.#renderer.setSize(w, h);
    const aspect = w / h;

    this.#camera.aspect = aspect;
    this.#camera.updateProjectionMatrix();
  };

  #initEvents() {
    window.addEventListener('resize', this.#resize);
  }

  #removeEvents() {
    window.removeEventListener('resize', this.#resize);
  }

  #animate = () => {
    if (this.#isDestroyed) {
      return;
    }

    this.#stats.begin();

    const delta = this.#clock.getDelta();
    this.#controls.update(delta);

    this.#renderer.render(this.#scene, this.#camera);
    this.#stats.end();

    this.#rafId = window.requestAnimationFrame(this.#animate);
  };

  destroy() {
    if (this.#isDestroyed) {
      return;
    }
    this.#isDestroyed = true;

    if (this.#rafId) {
      window.cancelAnimationFrame(this.#rafId);
      this.#rafId = 0;
    }

    this.#removeEvents();
    this.#controls?.dispose();

    if (this.#scene) {
      this.#scene.traverse((object) => {
        if (!(object instanceof Mesh)) {
          return;
        }

        object.geometry?.dispose();
        const { material } = object;
        if (Array.isArray(material)) {
          material.forEach((m) => m?.dispose?.());
          return;
        }
        material?.dispose?.();
      });
      this.#scene.clear();
    }

    this.#renderer?.dispose();

    if (this.#stats?.dom?.parentNode) {
      this.#stats.dom.parentNode.removeChild(this.#stats.dom);
    }

    this.#mesh = null;
    this.#controls = null;
    this.#clock = null;
    this.#scene = null;
    this.#camera = null;
    this.#renderer = null;
    this.#stats = null;
  }
}
