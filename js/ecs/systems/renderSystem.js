// Visible-z convention: the camera sits at z = 10 with near = 0.1 and
// far = 100, so only geometry with z in (-90, 9.9) is rendered. Scene
// sprites use z in [0, 8]; z = 9 is reserved for the vignette overlay.
//
// Window masking (req 8): indoor entities (InsideBuilding.buildingId set)
// render at INDOOR_SPRITE_Z = 3, the facade-mask mesh (world/facadeMask.js —
// both building fronts rebuilt from environment.png with window/ladder holes)
// sits at FACADE_MASK_Z = 4, and outdoor entities keep z = 5. Painter order
// in the transparent pass makes indoor sprites show only through the holes.
import * as THREE from 'three';
import { Components, GameStates, createRenderable } from '../components.js';
import { deriveTint } from '../tint.js';
import { GAME_WIDTH, GAME_HEIGHT } from '../../world/layout.js';
import { buildFacadeMaskQuads } from '../../world/facadeMask.js';

const VIGNETTE_Z = 9;
const INDOOR_SPRITE_Z = 3;
const FACADE_MASK_Z = 4;
const VERTICAL_BULLET_ROTATION = Math.PI / 2;
const ENVIRONMENT_TEXTURE = 'assets/environment.png';

const RENDERABLE_QUERY = Object.freeze([Components.Renderable]);

export function createRenderSystem(world, container) {
  let renderer = null;
  let scene = null;
  let camera = null;
  let vignette = null;
  let vignetteTexture = null;
  let facadeMask = null;
  let sceneEntity = null;
  let lastSceneVisible = null;
  const meshOwnerIds = [];
  const renderableIds = [];

  const textureLoader = new THREE.TextureLoader();
  // path -> { texture, loaded, pendingClones }. Sprite-sheet clones created
  // before the source image arrives are queued here and flagged needsUpdate
  // from the load callback — flagging a clone with no image data spams
  // "Texture marked for update but no image data found" on the console.
  const textureCache = new Map();
  const meshByEntity = new Map();
  // Animated entities (Sprite component) get a CLONE of the cached sheet
  // texture so per-frame UV offsets never mutate the shared cache. Maps
  // entityId -> sheet path currently bound to the mesh; membership doubles as
  // the "owns a cloned texture" marker for removeMesh/dispose.
  const sheetByEntity = new Map();

  function getTextureEntry(texturePath) {
    let entry = textureCache.get(texturePath);
    if (entry === undefined) {
      entry = { texture: null, loaded: false, pendingClones: [] };
      entry.texture = textureLoader.load(texturePath, () => {
        entry.loaded = true;
        for (let i = 0; i < entry.pendingClones.length; i++) {
          entry.pendingClones[i].needsUpdate = true;
        }
        entry.pendingClones.length = 0;
      });
      entry.texture.magFilter = THREE.NearestFilter;
      entry.texture.minFilter = THREE.NearestFilter;
      entry.texture.generateMipmaps = false;
      entry.texture.colorSpace = THREE.SRGBColorSpace;
      textureCache.set(texturePath, entry);
    }
    return entry;
  }

  function getTexture(texturePath) {
    return getTextureEntry(texturePath).texture;
  }

  function cloneSheetTexture(texturePath) {
    const entry = getTextureEntry(texturePath);
    const texture = entry.texture.clone();
    if (entry.loaded) {
      texture.needsUpdate = true;
    } else {
      entry.pendingClones.push(texture);
    }
    return texture;
  }

  // A texture is render-safe only once its source image has arrived.
  // Texture.clone() bumps version via copy() even while source.data is still
  // null, so a freshly cloned sheet rendered pre-load warns "Texture marked
  // for update but no image data found" — meshes stay hidden until this is
  // true (invisible meshes are never uploaded).
  function textureReady(texture) {
    if (texture === null || texture === undefined) {
      return false;
    }
    const source = texture.source;
    return source !== undefined && source.data !== undefined && source.data !== null;
  }

  function buildVignetteTexture() {
    const size = 256;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    const gradient = ctx.createRadialGradient(
      size / 2, size / 2, size * 0.3,
      size / 2, size / 2, size * 0.72
    );
    gradient.addColorStop(0, 'rgba(4, 4, 14, 0)');
    gradient.addColorStop(1, 'rgba(4, 4, 14, 0.55)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, size, size);
    const texture = new THREE.CanvasTexture(canvas);
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    return texture;
  }

  function applyViewport() {
    const windowWidth = window.innerWidth;
    const windowHeight = window.innerHeight;
    const scale = Math.min(windowWidth / GAME_WIDTH, windowHeight / GAME_HEIGHT);
    const viewWidth = Math.floor(GAME_WIDTH * scale);
    const viewHeight = Math.floor(GAME_HEIGHT * scale);
    const offsetX = Math.floor((windowWidth - viewWidth) / 2);
    const offsetY = Math.floor((windowHeight - viewHeight) / 2);
    renderer.setSize(viewWidth, viewHeight, false);
    const canvas = renderer.domElement;
    canvas.style.position = 'absolute';
    canvas.style.left = offsetX + 'px';
    canvas.style.top = offsetY + 'px';
    canvas.style.width = viewWidth + 'px';
    canvas.style.height = viewHeight + 'px';
  }

  function onResize() {
    applyViewport();
  }

  function addMesh(entityId, renderable) {
    const sprite = world.getComponent(entityId, Components.Sprite);
    let texture = getTexture(renderable.texturePath);
    if (sprite !== undefined) {
      texture = cloneSheetTexture(sprite.sheet);
      sheetByEntity.set(entityId, sprite.sheet);
    }
    const geometry = new THREE.PlaneGeometry(renderable.width, renderable.height);
    const material = new THREE.MeshBasicMaterial({
      map: texture,
      transparent: sprite !== undefined,
      depthWrite: false,
      depthTest: false,
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(
      renderable.x + renderable.width / 2,
      renderable.y + renderable.height / 2,
      renderable.z
    );
    mesh.visible = renderable.visible && textureReady(mesh.material.map);
    scene.add(mesh);
    meshByEntity.set(entityId, mesh);
    renderable.dirty = false;
  }

  function removeMesh(entityId) {
    const mesh = meshByEntity.get(entityId);
    if (mesh === undefined) {
      return;
    }
    meshByEntity.delete(entityId);
    if (sheetByEntity.delete(entityId) && mesh.material.map !== null) {
      mesh.material.map.dispose();
    }
    scene.remove(mesh);
    mesh.material.dispose();
    mesh.geometry.dispose();
  }

  function syncSpriteMesh(entityId, mesh, sprite) {
    if (sheetByEntity.get(entityId) !== sprite.sheet) {
      const texture = cloneSheetTexture(sprite.sheet);
      if (mesh.material.map !== null) {
        mesh.material.map.dispose();
      }
      mesh.material.map = texture;
      sheetByEntity.set(entityId, sprite.sheet);
    }
    const anim = world.getComponent(entityId, Components.AnimState);
    const frame = anim === undefined ? 0 : anim.frame;
    const cols = sprite.cols;
    const rows = sprite.rows;
    const map = mesh.material.map;
    map.repeat.set(1 / cols, 1 / rows);
    map.offset.set(
      (frame % cols) / cols,
      1 - ((Math.floor(frame / cols) % rows) + 1) / rows
    );
    mesh.scale.x = sprite.flipX ? -1 : 1;
  }

  function getGameState() {
    const gameId = world.queryFirst(Components.GameState);
    return gameId === undefined
      ? null
      : world.getComponent(gameId, Components.GameState);
  }

  // Facade mask: one merged BufferGeometry (quad per cover rect) sharing the
  // cached environment texture through per-vertex UVs — a single mesh, single
  // material, single draw call at FACADE_MASK_Z. The texture itself stays
  // cache-owned (disposed with the cache, not with this mesh).
  function buildFacadeMaskMesh() {
    const quads = buildFacadeMaskQuads();
    const positions = new Float32Array(quads.length * 12);
    const uvs = new Float32Array(quads.length * 8);
    const indices = new Uint16Array(quads.length * 6);
    for (let i = 0; i < quads.length; i++) {
      const quad = quads[i];
      const p = i * 12;
      positions[p] = quad.x;
      positions[p + 1] = quad.y;
      positions[p + 3] = quad.x + quad.width;
      positions[p + 4] = quad.y;
      positions[p + 6] = quad.x + quad.width;
      positions[p + 7] = quad.y + quad.height;
      positions[p + 9] = quad.x;
      positions[p + 10] = quad.y + quad.height;
      const u = i * 8;
      uvs[u] = quad.u0;
      uvs[u + 1] = quad.v0;
      uvs[u + 2] = quad.u1;
      uvs[u + 3] = quad.v0;
      uvs[u + 4] = quad.u1;
      uvs[u + 5] = quad.v1;
      uvs[u + 6] = quad.u0;
      uvs[u + 7] = quad.v1;
      const t = i * 6;
      const v = i * 4;
      indices[t] = v;
      indices[t + 1] = v + 1;
      indices[t + 2] = v + 2;
      indices[t + 3] = v;
      indices[t + 4] = v + 2;
      indices[t + 5] = v + 3;
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
    geometry.setIndex(new THREE.BufferAttribute(indices, 1));
    const material = new THREE.MeshBasicMaterial({
      map: getTexture(ENVIRONMENT_TEXTURE),
      transparent: true,
      depthWrite: false,
      depthTest: false,
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.z = FACADE_MASK_Z;
    return mesh;
  }

  return {
    init() {
      renderer = new THREE.WebGLRenderer({ antialias: false, alpha: false });
      renderer.setPixelRatio(1);
      renderer.setClearColor(0x050508, 1);
      renderer.autoClear = true;
      const canvas = renderer.domElement;
      canvas.style.display = 'block';
      canvas.style.imageRendering = 'pixelated';
      container.appendChild(canvas);

      scene = new THREE.Scene();
      camera = new THREE.OrthographicCamera(0, GAME_WIDTH, GAME_HEIGHT, 0, 0.1, 100);
      camera.position.z = 10;

      vignetteTexture = buildVignetteTexture();
      const vignetteMaterial = new THREE.MeshBasicMaterial({
        map: vignetteTexture,
        transparent: true,
        depthWrite: false,
        depthTest: false,
      });
      vignette = new THREE.Mesh(
        new THREE.PlaneGeometry(GAME_WIDTH, GAME_HEIGHT),
        vignetteMaterial
      );
      vignette.position.set(GAME_WIDTH / 2, GAME_HEIGHT / 2, VIGNETTE_Z);
      scene.add(vignette);

      facadeMask = buildFacadeMaskMesh();
      scene.add(facadeMask);

      sceneEntity = world.createEntity();
      world.addComponent(
        sceneEntity,
        Components.Renderable,
        createRenderable({
          texturePath: ENVIRONMENT_TEXTURE,
          width: GAME_WIDTH,
          height: GAME_HEIGHT,
          x: 0,
          y: 0,
          z: 0,
          visible: false,
        })
      );

      applyViewport();
      window.addEventListener('resize', onResize);
      lastSceneVisible = null;
    },

    update() {
      const gameState = getGameState();
      const sceneVisible = gameState !== null && gameState.current === GameStates.PLAYING;

      if (sceneVisible !== lastSceneVisible) {
        lastSceneVisible = sceneVisible;
        if (sceneEntity !== null) {
          const renderable = world.getComponent(sceneEntity, Components.Renderable);
          if (renderable !== undefined) {
            renderable.visible = sceneVisible;
            renderable.dirty = true;
          }
        }
        if (vignette !== null) {
          vignette.visible = sceneVisible;
        }
        if (facadeMask !== null) {
          facadeMask.visible = sceneVisible;
        }
      }

      meshOwnerIds.length = 0;
      for (const id of meshByEntity.keys()) {
        meshOwnerIds.push(id);
      }
      for (let i = 0; i < meshOwnerIds.length; i++) {
        if (!world.hasComponent(meshOwnerIds[i], Components.Renderable)) {
          removeMesh(meshOwnerIds[i]);
        }
      }

      world.queryInto(RENDERABLE_QUERY, renderableIds);
      for (let i = 0; i < renderableIds.length; i++) {
        const entityId = renderableIds[i];
        const renderable = world.getComponent(entityId, Components.Renderable);
        let mesh = meshByEntity.get(entityId);
        if (mesh === undefined) {
          addMesh(entityId, renderable);
          mesh = meshByEntity.get(entityId);
        }
        const position = world.getComponent(entityId, Components.Position);
        if (position !== undefined) {
          // Position-anchored entities (player, enemies, bullets): Position
          // is the feet point, so the quad center sits half a sprite above
          // it. Window masking: an entity inside a building drops to
          // INDOOR_SPRITE_Z, BEHIND the facade-mask mesh, so it is visible
          // only through the window/ladder holes; outdoors it keeps its own
          // z (5) in front of the facade.
          const inside = world.getComponent(entityId, Components.InsideBuilding);
          const z =
            inside !== undefined && inside.buildingId !== null
              ? INDOOR_SPRITE_Z
              : renderable.z;
          mesh.position.set(
            position.x,
            position.y + renderable.height / 2,
            z
          );
          // The 16x4 bullet tracer is authored horizontal; rotate the quad
          // 90° for up/down shots so the tracer reads vertical.
          const projectile = world.getComponent(entityId, Components.Projectile);
          if (projectile !== undefined) {
            mesh.rotation.z =
              projectile.dy !== 0 ? VERTICAL_BULLET_ROTATION : 0;
          }
        } else if (renderable.dirty) {
          mesh.position.set(
            renderable.x + renderable.width / 2,
            renderable.y + renderable.height / 2,
            renderable.z
          );
        }
        const sprite = world.getComponent(entityId, Components.Sprite);
        if (sprite !== undefined) {
          syncSpriteMesh(entityId, mesh, sprite);
        }
        // Visibility is resolved AFTER the sprite sync above: syncSpriteMesh
        // may have swapped material.map to a sheet whose image has not
        // arrived yet, and a mesh with image-less texture must never render.
        mesh.visible = renderable.visible && textureReady(mesh.material.map);
        // Tint is fully derived here from component state, every frame, for
        // every entity (see ecs/tint.js): HitFlash -> red, else Cooldown ->
        // gray, else white. HitFlash has priority when both are present.
        mesh.material.color.setHex(deriveTint(world, entityId));
        renderable.dirty = false;
      }

      if (sceneVisible) {
        renderer.render(scene, camera);
      } else {
        renderer.clear();
      }
    },

    dispose() {
      window.removeEventListener('resize', onResize);
      meshOwnerIds.length = 0;
      for (const id of meshByEntity.keys()) {
        meshOwnerIds.push(id);
      }
      for (let i = 0; i < meshOwnerIds.length; i++) {
        removeMesh(meshOwnerIds[i]);
      }
      meshOwnerIds.length = 0;
      sheetByEntity.clear();
      for (const entry of textureCache.values()) {
        entry.texture.dispose();
        entry.pendingClones.length = 0;
      }
      textureCache.clear();
      if (facadeMask !== null) {
        scene.remove(facadeMask);
        facadeMask.material.dispose();
        facadeMask.geometry.dispose();
        facadeMask = null;
      }
      if (vignette !== null) {
        scene.remove(vignette);
        vignette.material.dispose();
        vignette.geometry.dispose();
        vignette = null;
      }
      if (vignetteTexture !== null) {
        vignetteTexture.dispose();
        vignetteTexture = null;
      }
      if (renderer !== null) {
        renderer.dispose();
        if (renderer.domElement.parentNode) {
          renderer.domElement.parentNode.removeChild(renderer.domElement);
        }
        renderer = null;
      }
      scene = null;
      camera = null;
      sceneEntity = null;
      lastSceneVisible = null;
    },
  };
}
