import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { createHero, applyEquipment, animateHero, triggerSwing } from '../game3d/heroModel.js';
import { addEnvironment } from '../game3d/heroModel.js';
import { setHeroWings } from '../game3d/wingModel.js';

/** 角色頁的 3D 模型預覽：手指左右拖曳旋轉，放開後自己慢慢轉；點一下揮劍 */
export default function CharacterPreview({ equipped, items, wing = null, wingLv = 1, className = '' }) {
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
    const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 50);
    camera.position.set(0, 1.6, 6.6);
    camera.lookAt(0, 1.0, 0);
    addEnvironment(renderer, scene); // 金屬盔甲的反射，不然顏色會變灰
    scene.add(new THREE.HemisphereLight(0xffffff, 0x2a2440, 1.6));
    const key = new THREE.DirectionalLight(0xffffff, 1.8);
    key.position.set(3, 5, 4);
    const rim = new THREE.DirectionalLight(0xf5c04a, 1.2);
    rim.position.set(-3, 2, -4);
    scene.add(key, rim);

    // 展示台
    const stage = new THREE.Mesh(
      new THREE.CylinderGeometry(1.1, 1.2, 0.12, 40),
      new THREE.MeshLambertMaterial({ color: 0x1d1830 }),
    );
    stage.position.y = -0.06;
    const glow = new THREE.Mesh(
      new THREE.RingGeometry(1.0, 1.12, 48).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: 0xf5c04a, transparent: true, opacity: 0.7 }),
    );
    glow.position.y = 0.005;
    scene.add(stage, glow);

    const hero = createHero();
    hero.root.rotation.y = -0.5;
    scene.add(hero.root);

    const state = { hero, dragging: false, lastX: 0, vel: 0, idleAt: 0 };
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
        hero.root.rotation.y += state.vel;
        if (t > state.idleAt && Math.abs(state.vel) < 0.002) hero.root.rotation.y += dt * 0.35; // 自動慢轉
      }
      animateHero(hero, t, dt, {});
      glow.material.opacity = 0.5 + Math.sin(t * 2) * 0.2;
      renderer.render(scene, camera);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      scene.traverse((o) => { o.geometry?.dispose(); o.material?.dispose?.(); });
      renderer.dispose();
      renderer.domElement.remove();
      ctx.current = null;
    };
  }, []);

  // 翅膀
  useEffect(() => {
    if (ctx.current) setHeroWings(ctx.current.hero, wing, wingLv);
  }, [wing, wingLv]);

  // 裝備變了就換外觀
  useEffect(() => {
    if (ctx.current) applyEquipment(ctx.current.hero, equipped, items);
  }, [equipped, items]);

  const down = (e) => {
    const s = ctx.current; if (!s) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    s.dragging = true; s.lastX = e.clientX; s.startX = e.clientX; s.vel = 0;
  };
  const move = (e) => {
    const s = ctx.current; if (!s?.dragging) return;
    const dx = e.clientX - s.lastX;
    s.lastX = e.clientX;
    s.hero.root.rotation.y += dx * 0.012;
    s.vel = dx * 0.012;
  };
  const up = (e) => {
    const s = ctx.current; if (!s) return;
    s.dragging = false;
    s.idleAt = performance.now() / 1000 + 9999; // 拖過之後不要自動轉
    if (Math.abs(e.clientX - (s.startX ?? e.clientX)) < 6) triggerSwing(s.hero); // 點一下 = 揮劍
  };

  return (
    <div
      ref={wrapRef}
      className={`no-touch-action relative cursor-grab active:cursor-grabbing ${className}`}
      onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}
    />
  );
}
