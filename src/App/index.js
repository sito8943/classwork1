import {
  AmbientLight,
  Clock,
  DirectionalLight,
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
  #isSceneRotationEnabled;
  #rotateSceneButton;

  constructor() {
    this.#rafId = 0;
    this.#isDestroyed = false;
    this.#isSceneRotationEnabled = false;
    this.#rotateSceneButton = null;

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
    this.#initUI();

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
    const al = new AmbientLight('white', 0.2);
    this.#scene.add(al);

    this.#createDirectionalLight({
      color: '#ffe7c2',
      intensity: 2.1,
      position: [24, 33, 18],
      shadowSize: 2048,
      shadowBias: -0.00015,
    });
    this.#createDirectionalLight({
      color: '#c9dcff',
      intensity: 0.95,
      position: [-26, 33, 10],
      shadowSize: 1024,
      shadowBias: -0.0001,
    });
    this.#createDirectionalLight({
      color: '#ffffff',
      intensity: 0.8,
      position: [0, 33, -28],
      shadowSize: 1024,
      shadowBias: -0.0001,
    });
  }

  #createDirectionalLight({
    color,
    intensity,
    position,
    shadowSize = 1024,
    shadowBias = -0.0001,
    target = [0, 0, 0],
  }) {
    const light = new DirectionalLight(color, intensity);
    light.position.set(...position);
    light.castShadow = true;
    light.shadow.mapSize.set(shadowSize, shadowSize);
    light.shadow.camera.near = 0.5;
    light.shadow.camera.far = 120;
    light.shadow.camera.left = -35;
    light.shadow.camera.right = 35;
    light.shadow.camera.top = 35;
    light.shadow.camera.bottom = -35;
    light.shadow.bias = shadowBias;

    this.#scene.add(light);
    this.#scene.add(light.target);
    light.target.position.set(...target);
  }

  #initMesh() {
    this.#initTorusKnot();

    const geo = new PlaneGeometry(35, 35);
    const material = new MeshStandardMaterial({
      side: DoubleSide,
    });
    const floor = new Mesh(geo, material);
    floor.rotateX(-Math.PI / 2);
    floor.position.y = -19;
    floor.receiveShadow = true;

    this.#scene.add(floor);
  }

  #initTorusKnot() {
    const geo = new TorusKnotGeometry(10, 3, 100, 16);

    const material = new MeshStandardMaterial({
      // wireframe: true,
    });
    const mesh = new Mesh(geo, material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
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

  #initUI() {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = 'Rotar escena';
    button.style.position = 'fixed';
    button.style.right = '16px';
    button.style.bottom = '16px';
    button.style.zIndex = '10';
    button.style.padding = '10px 14px';
    button.style.border = '1px solid rgba(255, 255, 255, 0.4)';
    button.style.borderRadius = '8px';
    button.style.background = 'rgba(20, 20, 20, 0.8)';
    button.style.color = '#fff';
    button.style.fontFamily = 'system-ui, sans-serif';
    button.style.cursor = 'pointer';
    button.style.backdropFilter = 'blur(2px)';
    button.setAttribute('aria-pressed', 'false');
    button.addEventListener('click', this.#toggleSceneRotation);

    document.body.appendChild(button);
    this.#rotateSceneButton = button;
  }

  #removeUI() {
    if (!this.#rotateSceneButton) {
      return;
    }

    this.#rotateSceneButton.removeEventListener('click', this.#toggleSceneRotation);
    this.#rotateSceneButton.remove();
    this.#rotateSceneButton = null;
  }

  #toggleSceneRotation = () => {
    this.#isSceneRotationEnabled = !this.#isSceneRotationEnabled;
    this.#syncRotateButton();
  };

  #syncRotateButton() {
    if (!this.#rotateSceneButton) {
      return;
    }

    this.#rotateSceneButton.textContent = this.#isSceneRotationEnabled
      ? 'Detener rotación'
      : 'Rotar escena';
    this.#rotateSceneButton.setAttribute(
      'aria-pressed',
      this.#isSceneRotationEnabled ? 'true' : 'false'
    );
  }

  #animate = () => {
    if (this.#isDestroyed) {
      return;
    }

    this.#stats.begin();

    const delta = this.#clock.getDelta();
    this.#controls.update(delta);
    if (this.#isSceneRotationEnabled) {
      this.#scene.rotation.y += delta * 0.8;
    }

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
    this.#removeUI();
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
    this.#isSceneRotationEnabled = false;
    this.#scene = null;
    this.#camera = null;
    this.#renderer = null;
    this.#stats = null;
  }
}
