import { Component, Suspense, useLayoutEffect, useMemo, useRef, type ReactNode, type RefObject } from 'react'
import { Canvas, useThree, type ThreeEvent } from '@react-three/fiber'
import { Html, OrbitControls, useGLTF } from '@react-three/drei'
import * as THREE from 'three'
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib'
import { assetById, DISPLAY_HEIGHT, FOOTPRINT } from '../../../data/archetypes'
import { mulberry32, type Plot } from './model'

export type FieldSpec = {
  key: string; assetId: string; colour: string; label: string
  positions: { x: number; z: number; rot: number; jitter: number }[]
  stageOf: number[] // stage per active instance (length = active count)
  stageScales: number[]
  band: { x0: number; x1: number }
  organ?: string | null
  spacing?: number
}
export type Pick = { key: string; index: number } | null
export type CameraApi = { reset: () => void; top: () => void; fit: () => void }

const HOME = new THREE.Vector3(0, 14.5, 24)
/** How much bigger than the smallest (24 x 15) field this one is: camera, light and fog scale with it. */
const grow = (plot: Plot) => Math.max(plot.w / 24, plot.d / 15)

// ---------------------------------------------------------------- soil
function Soil({ cutBands, plot }: { cutBands: { x0: number; x1: number }[]; plot: Plot }) {
  const top = useMemo(() => {
    const g = new THREE.PlaneGeometry(plot.w, plot.d, Math.round(4 * plot.w), Math.round(4 * plot.d))
    g.rotateX(-Math.PI / 2)
    const pos = g.attributes.position as THREE.BufferAttribute
    const rnd = mulberry32(11)
    const colors = new Float32Array(pos.count * 3)
    const a = new THREE.Color('#5d3d26'), b = new THREE.Color('#7a5534'), c = new THREE.Color('#4b3020')
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i)
      const edge = Math.abs(x) > plot.w / 2 - 0.01 || Math.abs(z) > plot.d / 2 - 0.01
      const n = Math.sin(x * 0.9) * Math.cos(z * 1.1) * 0.5 + Math.sin(x * 2.7 + z * 1.9) * 0.25 + (rnd() - 0.5) * 0.35
      pos.setY(i, edge ? 0 : n * 0.045)
      const col = a.clone().lerp(n > 0 ? b : c, Math.min(1, Math.abs(n) * 1.3))
      colors.set([col.r, col.g, col.b], i * 3)
    }
    g.setAttribute('color', new THREE.BufferAttribute(colors, 3))
    g.computeVertexNormals()
    return g
  }, [plot.w, plot.d])
  return (
    <group>
      <mesh geometry={top} receiveShadow>
        <meshStandardMaterial vertexColors roughness={0.97} metalness={0} />
      </mesh>
      {/* earthen body: darker subsoil under a topsoil band */}
      <mesh position={[0, -0.16, 0]} receiveShadow>
        <boxGeometry args={[plot.w, 0.3, plot.d]} />
        <meshStandardMaterial color="#6a4429" roughness={1} />
      </mesh>
      <mesh position={[0, -1.06, 0]}>
        <boxGeometry args={[plot.w, 1.5, plot.d]} />
        <meshStandardMaterial color="#3e2718" roughness={1} />
      </mesh>
      {cutBands.map((b) => {
        const w = b.x1 - b.x0, cx = (b.x0 + b.x1) / 2
        return (
          <group key={b.x0} position={[cx, -0.75, plot.d / 2 + 0.012]}>
            <mesh>
              <planeGeometry args={[w - 0.1, 1.1]} />
              <meshStandardMaterial color="#2b1a10" roughness={1} />
            </mesh>
            <RootLines width={w - 0.3} />
            <Html position={[0, -0.38, 0.02]} center className="st-cut-label" zIndexRange={[5, 0]}>root / rhizome zone · illustrative</Html>
          </group>
        )
      })}
    </group>
  )
}

function RootLines({ width }: { width: number }) {
  const geo = useMemo(() => {
    const rnd = mulberry32(5)
    const pts: number[] = []
    for (let i = 0; i < Math.round(width * 3); i++) {
      let x = -width / 2 + rnd() * width, y = 0.5
      for (let s = 0; s < 5; s++) {
        const nx = x + (rnd() - 0.5) * 0.35, ny = y - 0.08 - rnd() * 0.12
        pts.push(x, y, 0.005, nx, ny, 0.005)
        x = nx; y = ny
      }
    }
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3))
    return g
  }, [width])
  return <lineSegments geometry={geo}><lineBasicMaterial color="#a07a52" transparent opacity={0.55} /></lineSegments>
}

// ---------------------------------------------------------------- plants
type MeshPart = { geometry: THREE.BufferGeometry; material: THREE.Material | THREE.Material[]; local: THREE.Matrix4 }

function useParts(url: string, assetId: string) {
  const gltf = useGLTF(url)
  return useMemo(() => {
    const a = assetById(assetId)!
    const root = gltf.scene
    root.updateMatrixWorld(true)
    const parts: MeshPart[] = []
    root.traverse((o) => {
      const m = o as THREE.Mesh
      if (m.isMesh) parts.push({ geometry: m.geometry, material: m.material, local: m.matrixWorld.clone() })
    })
    // normalise: base on the soil, centred, scaled to the archetype's display height
    const lo = a.bounds_min ?? [0, 0, 0], hi = a.bounds_max ?? [0, 1, 0]
    const width = Math.max(hi[0] - lo[0], hi[2] - lo[2], 1e-6)
    const s = Math.min((DISPLAY_HEIGHT[assetId] ?? 1) / Math.max(1e-6, hi[1] - lo[1]), (FOOTPRINT[assetId] ?? 1) / width)
    const norm = new THREE.Matrix4().makeScale(s, s, s).multiply(new THREE.Matrix4().makeTranslation(-(lo[0] + hi[0]) / 2, -lo[1], -(lo[2] + hi[2]) / 2))
    return { parts, norm }
  }, [gltf, assetId])
}

function Instances({ spec, parts, norm, onPick }: { spec: FieldSpec; parts: MeshPart[]; norm: THREE.Matrix4; onPick: (p: Pick) => void }) {
  const refs = useRef<(THREE.InstancedMesh | null)[]>([])
  const invalidate = useThree((s) => s.invalidate)
  const cap = spec.positions.length
  useLayoutEffect(() => {
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), p = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0)
    const n = Math.min(spec.stageOf.length, cap)
    parts.forEach((part, pi) => {
      const im = refs.current[pi]
      if (!im) return
      for (let i = 0; i < n; i++) {
        const pos = spec.positions[i]
        const k = spec.stageScales[spec.stageOf[i]] * pos.jitter
        q.setFromAxisAngle(up, pos.rot); sc.set(k, k, k); p.set(pos.x, 0, pos.z)
        m.compose(p, q, sc).multiply(norm).multiply(part.local)
        im.setMatrixAt(i, m)
      }
      im.count = n
      im.instanceMatrix.needsUpdate = true
      im.computeBoundingSphere()
    })
    invalidate()
  }, [spec, parts, norm, cap, invalidate])
  return (
    <group>
      {parts.map((part, pi) => (
        <instancedMesh key={pi} ref={(el) => { refs.current[pi] = el }} args={[part.geometry, part.material as THREE.Material, cap]}
          castShadow receiveShadow frustumCulled={false}
          onClick={(e: ThreeEvent<MouseEvent>) => { e.stopPropagation(); if (e.instanceId != null) onPick({ key: spec.key, index: e.instanceId }) }} />
      ))}
    </group>
  )
}

function GlbField({ spec, onPick }: { spec: FieldSpec; onPick: (p: Pick) => void }) {
  const a = assetById(spec.assetId)!
  const { parts, norm } = useParts(`/${a.file}`, spec.assetId)
  return <Instances spec={spec} parts={parts} norm={norm} onPick={onPick} />
}

// Procedural stand-in used when a GLB cannot be loaded: the scene keeps working.
function PrimitiveField({ spec, onPick }: { spec: FieldSpec; onPick: (p: Pick) => void }) {
  const parts = useMemo<MeshPart[]>(() => {
    const stem = new THREE.CylinderGeometry(0.03, 0.05, 0.5, 6).translate(0, 0.25, 0)
    const crown = new THREE.ConeGeometry(0.28, 0.6, 7).translate(0, 0.75, 0)
    return [
      { geometry: stem, material: new THREE.MeshStandardMaterial({ color: '#6b5236' }), local: new THREE.Matrix4() },
      { geometry: crown, material: new THREE.MeshStandardMaterial({ color: spec.colour, roughness: 0.8 }), local: new THREE.Matrix4() },
    ]
  }, [spec.colour])
  return <Instances spec={spec} parts={parts} norm={new THREE.Matrix4()} onPick={onPick} />
}

class FieldBoundary extends Component<{ fallback: ReactNode; children: ReactNode; onError: () => void }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  componentDidCatch() { this.props.onError() }
  render() { return this.state.failed ? this.props.fallback : this.props.children }
}

function BandMarker({ spec, plot }: { spec: FieldSpec; plot: Plot }) {
  const pts = useMemo(() => {
    const y = 0.06, { x0, x1 } = spec.band, z0 = -plot.d / 2 + 0.15, z1 = plot.d / 2 - 0.15
    return new Float32Array([x0 + 0.15, y, z0, x1 - 0.15, y, z0, x1 - 0.15, y, z0, x1 - 0.15, y, z1, x1 - 0.15, y, z1, x0 + 0.15, y, z1, x0 + 0.15, y, z1, x0 + 0.15, y, z0])
  }, [spec.band, plot.d])
  return (
    <group>
      <lineSegments>
        <bufferGeometry><bufferAttribute attach="attributes-position" args={[pts, 3]} /></bufferGeometry>
        <lineBasicMaterial color={spec.colour} transparent opacity={0.55} />
      </lineSegments>
      <Html position={[(spec.band.x0 + spec.band.x1) / 2, 0.1, -plot.d / 2 - 0.2]} center className="st-band-label" zIndexRange={[5, 0]}>
        <span style={{ borderColor: spec.colour }}><i style={{ background: spec.colour }} />{spec.label}</span>
      </Html>
    </group>
  )
}

function PickRing({ fields, pick }: { fields: FieldSpec[]; pick: Pick }) {
  const f = pick && fields.find((x) => x.key === pick.key)
  const pos = f && pick && pick.index < f.stageOf.length ? f.positions[pick.index] : null
  if (!pos) return null
  return (
    <mesh position={[pos.x, 0.07, pos.z]} rotation={[-Math.PI / 2, 0, 0]}>
      <ringGeometry args={[0.32, 0.42, 32]} />
      <meshBasicMaterial color="#d4b36b" />
    </mesh>
  )
}

function CameraRig({ api, controls, k }: { api: RefObject<CameraApi | null>; controls: RefObject<OrbitControlsImpl | null>; k: number }) {
  const { camera, invalidate } = useThree()
  useLayoutEffect(() => {
    const go = (p: THREE.Vector3) => {
      camera.position.copy(p)
      controls.current?.target.set(0, 0, 0)
      controls.current?.update()
      invalidate()
    }
    api.current = {
      reset: () => go(HOME.clone().multiplyScalar(k)),
      top: () => go(new THREE.Vector3(0, 26 * k, 0.01)),
      fit: () => go(new THREE.Vector3(0, 9 * k, 14 * k)),
    }
    go(HOME.clone().multiplyScalar(k))  // a bigger field moves the camera back
  }, [api, camera, controls, invalidate, k])
  return null
}

// ---------------------------------------------------------------- scene
export default function Scene3D({ fields, plot, pick, onPick, cameraApi, onAssetError }: {
  fields: FieldSpec[]; plot: Plot; pick: Pick; onPick: (p: Pick) => void
  cameraApi: RefObject<CameraApi | null>; onAssetError: (key: string) => void
}) {
  const controls = useRef<OrbitControlsImpl | null>(null)
  const k = Math.round(grow(plot) * 20) / 20
  return (
    <Canvas shadows frameloop="demand" dpr={[1, 1.75]} camera={{ position: HOME.toArray(), fov: 38, near: 0.1, far: 200 }}
      onPointerMissed={() => onPick(null)} gl={{ antialias: true, preserveDrawingBuffer: true }}>
      <color attach="background" args={['#06110c']} />
      <fog attach="fog" args={['#06110c', 34 * k, 70 * k]} />
      <hemisphereLight args={['#e8f1df', '#3a2616', 1.05]} />
      <directionalLight position={[9 * k, 16 * k, 7 * k]} intensity={2.1} castShadow shadow-mapSize={[1536, 1536]}
        shadow-camera-left={-plot.w / 2 - 3} shadow-camera-right={plot.w / 2 + 3} shadow-camera-top={plot.d / 2 + 4.5}
        shadow-camera-bottom={-plot.d / 2 - 4.5} shadow-camera-far={120} key={'sun' + plot.w} />
      <Soil plot={plot} cutBands={fields.filter((f) => /rhizome|root/.test(f.organ ?? '')).map((f) => f.band)} />
      {fields.map((f) => (
        <group key={f.key + f.assetId}>
          <BandMarker spec={f} plot={plot} />
          <FieldBoundary fallback={<PrimitiveField spec={f} onPick={onPick} />} onError={() => onAssetError(f.key)}>
            <Suspense fallback={null}>
              <GlbField spec={f} onPick={onPick} />
            </Suspense>
          </FieldBoundary>
        </group>
      ))}
      <PickRing fields={fields} pick={pick} />
      <OrbitControls ref={controls} makeDefault enableDamping={false} minDistance={5} maxDistance={48 * k}
        maxPolarAngle={Math.PI * 0.46} target={[0, 0, 0]} />
      <CameraRig api={cameraApi} controls={controls} k={k} />
    </Canvas>
  )
}

export function webglAvailable() {
  try {
    const c = document.createElement('canvas')
    return !!(c.getContext('webgl2') || c.getContext('webgl'))
  } catch { return false }
}
