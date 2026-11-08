import { Component, Suspense, useMemo, type ReactNode } from 'react'
import { Canvas } from '@react-three/fiber'
import { OrbitControls, useGLTF } from '@react-three/drei'
import * as THREE from 'three'
import { assetById } from '../data/archetypes'

// A single plant model on a turntable. Loaded lazily so pages without 3D never pull in three.js.

const reduced = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

function Model({ url }: { url: string }) {
  const gltf = useGLTF(url)
  const obj = useMemo(() => {
    const s = gltf.scene.clone(true)
    const box = new THREE.Box3().setFromObject(s)
    const size = box.getSize(new THREE.Vector3())
    const k = 1.5 / Math.max(size.y, size.x * 0.8, size.z * 0.8, 1e-6)
    s.scale.setScalar(k)
    const c = box.getCenter(new THREE.Vector3())
    s.position.set(-c.x * k, -box.min.y * k, -c.z * k)
    return s
  }, [gltf])
  return <primitive object={obj} />
}

class Guard extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  render() { return this.state.failed ? <p className="small dim mv-fail">3D view unavailable in this browser.</p> : this.props.children }
}

export default function ModelViewer({ assetId }: { assetId: string }) {
  const a = assetById(assetId)
  if (!a) return <p className="small dim">No model.</p>
  return (
    <Guard>
      <Canvas className="mv-canvas" camera={{ position: [2.1, 1.5, 2.4], fov: 38 }} dpr={[1, 1.5]} gl={{ antialias: true, alpha: true }}
        aria-label={`3D illustration: ${a.label}`} role="img">
        <hemisphereLight args={['#e8f1df', '#3a2616', 1.15]} />
        <directionalLight position={[3, 5, 2]} intensity={2.2} />
        <Suspense fallback={null}><Model url={`/${a.file}`} /></Suspense>
        <mesh rotation-x={-Math.PI / 2} position-y={-0.002}><circleGeometry args={[1.1, 48]} /><meshStandardMaterial color="#2c1f14" roughness={1} /></mesh>
        <OrbitControls autoRotate={!reduced} autoRotateSpeed={1.4} enablePan={false} minDistance={1.4} maxDistance={6} target={[0, 0.7, 0]} />
      </Canvas>
    </Guard>
  )
}
