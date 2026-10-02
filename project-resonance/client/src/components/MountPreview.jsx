import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { createMount, animateMount, disposeMount } from '../game3d/mountModel.js';
import { createHero, applyEquipment, animateHero } from '../game3d/heroModel.js';
import { addEnvironment } from '../game3d/heroModel.js';

/** 馬廄的 3D 坐騎預覽：自己慢慢轉，角色騎在上面；拖曳可以旋轉 */
export default function MountPreview({ def, equipped, items, locked = false, className = '' }) {
  const wrapRef = useRef(null);
  const ctx = useRef(null);

  useEffect(() => {
    const wrap = wrapRef.current;
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.toneMapping = THREE.NeutralToneMapping;
    renderer.toneMappingExposure = 1.05;
    renderer.domElement.style.display = 'block';
    wrap.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 60);
    camera.position.set(0, 2.6, 8.4);
    camera.lookAt(0, 1.3, 0);
    addEnvironment(renderer, scene); // 金屬盔甲的反射，不然顏色會變灰
    scene.add(new THREE.HemisphereLight(0xffffff, 0x2a2440, 1.6));
    const key = new THREE.DirectionalLight(0xffffff, 1.8);
    key.position.set(3, 5, 4);
    const rim = new THREE.DirectionalLight(0xf5c04a, 1.2);
    rim.position.set(-3, 2, -4);
    scene.add(key, rim);
    const stage = new THREE.Mesh(new THREE.CylinderGeometry(1.8, 1.9, 0.12, 40), new THREE.MeshLambertMaterial({ color: 0x1d1830 }));
    stage.position.y = -0.06;
    scene.add(stage);

    const pivot = new THREE.Group();
    pivot.rotation.y = -0.7;
    scene.add(pivot);
    const hero = createHero();
    const state = { pivot, hero, mount: null, dragging: false, lastX: 0, vel: 0, auto: true };
    ctx.current = state;

    const resize = () => {
      const w = wrap.clientWidth, h = wrap.clientHeight;
      if (!w || !h) return;
      renderer.setSize(w, h);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    const ro = new ResizeObserver(resize);
    ro.observe(wrap);
    resize();

    const clock = new THREE.Clock();
    let t = 0, raf;
    const loop = () => {
      const dt = Math.min(clock.getDelta(), 0.05);
      t += dt;
      if (!state.dragging) {
        state.vel *= 0.93;
        pivot.rotation.y += state.vel + (state.auto ? dt * 0.4 : 0);
      }
      if (state.mount) animateMount(state.mount, t, dt, { moving: false });
      animateHero(hero, t, dt, { mounted: !!state.mount });
      renderer.render(scene, camera);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      if (state.mount) disposeMount(state.mount);
      scene.traverse((o) => { o.geometry?.dispose(); o.material?.dispose?.(); });
      renderer.dispose();
      renderer.domElement.remove();
      ctx.current = null;
    };
  }, []);

  // 換坐騎
  useEffect(() => {
    const s = ctx.current;
    if (!s) return;
    if (s.mount) { s.pivot.remove(s.mount.root); disposeMount(s.mount); s.mount = null; }
    if (!def) return;
    s.mount = createMount(def);
    s.pivot.add(s.mount.root);
    s.mount.seat.add(s.hero.root);
    s.hero.root.position.set(0, -s.hero.hipY - 0.03, -0.05);
    // 還沒擁有：剪影
    s.mount.root.traverse((o) => {
      if (o.isMesh && locked) { o.material = o.material.clone(); o.material.color?.set(0x111018); if (o.material.emissive) o.material.emissive.set(0x000000); }
    });
    s.hero.root.visible = !locked;
  }, [def, locked]);

  useEffect(() => {
    if (ctx.current) applyEquipment(ctx.current.hero, equipped, items);
  }, [equipped, items]);

  const down = (e) => {
    const s = ctx.current; if (!s) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    s.dragging = true; s.lastX = e.clientX; s.vel = 0; s.auto = false;
  };
  const move = (e) => {
    const s = ctx.current; if (!s?.dragging) return;
    const dx = e.clientX - s.lastX;
    s.lastX = e.clientX;
    s.pivot.rotation.y += dx * 0.012;
    s.vel = dx * 0.012;
  };
  const up = () => { if (ctx.current) ctx.current.dragging = false; };

  return (
    <div ref={wrapRef} className={`no-touch-action relative cursor-grab active:cursor-grabbing ${className}`}
      onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} />
  );
}
