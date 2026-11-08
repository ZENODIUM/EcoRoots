import { useEffect, useRef, useState } from 'react'
import * as Cesium from 'cesium'
import type { Bounds, LayerDef, RegionInput } from '../api'

;(window as unknown as { CESIUM_BASE_URL: string }).CESIUM_BASE_URL = '/cesium'

export type CellPaint = { id: string; bounds: Bounds; rgb: [number, number, number] | null; hatch: boolean; dim?: boolean }
export type GlobePoint = { id: string; lon: number; lat: number; kind: 'occurrence' | 'population' | 'fire'; label?: string }
export type DrawMode = 'none' | 'bbox' | 'point'
export type CameraTarget = { lon: number; lat: number; height: number; key: number }
export type NativeRange = { native: string[]; introduced: string[] }

type Props = {
  cells: CellPaint[]
  points: GlobePoint[]
  regionBounds: Bounds | null
  regionCircle: { center: [number, number]; radiusKm: number } | null
  overlays: LayerDef[]
  drawMode: DrawMode
  radiusKm: number
  selectedCell: string | null
  camera: CameraTarget | null
  range?: NativeRange | null
  onDraw: (r: RegionInput) => void
  onPickCell: (id: string | null) => void
  onPickPoint: (id: string) => void
}

const C = (h: string, a = 1) => Cesium.Color.fromCssColorString(h).withAlpha(a)
const token = import.meta.env.VITE_CESIUM_ION_TOKEN

type L3 = { features: { properties: { code: string; name: string }; geometry: { type: 'Polygon' | 'MultiPolygon'; coordinates: unknown } }[] }
let l3: Promise<L3> | null = null
const loadL3 = () => (l3 ??= fetch('/geo/wgsrpd_l3.json').then((r) => { if (!r.ok) throw new Error(String(r.status)); return r.json() as Promise<L3> }))

export default function Globe(p: Props) {
  const host = useRef<HTMLDivElement>(null)
  const viewer = useRef<Cesium.Viewer | null>(null)
  const ds = useRef<Record<string, Cesium.CustomDataSource>>({})
  const overlayLayers = useRef<Map<string, Cesium.ImageryLayer>>(new Map())
  const props = useRef(p)
  props.current = p
  const [cursor, setCursor] = useState<{ lon: number; lat: number; h: number | null } | null>(null)
  const [mode, setMode] = useState<'ion' | 'offline'>('ion')

  // ---- create the viewer once
  useEffect(() => {
    if (!host.current) return
    const online = Boolean(token)
    if (online) Cesium.Ion.defaultAccessToken = token!
    const v = new Cesium.Viewer(host.current, {
      animation: false, timeline: false, baseLayerPicker: false, geocoder: false, homeButton: false,
      sceneModePicker: false, navigationHelpButton: false, fullscreenButton: false, infoBox: false,
      selectionIndicator: false, requestRenderMode: true, maximumRenderTimeChange: Infinity,
      baseLayer: online
        ? Cesium.ImageryLayer.fromWorldImagery({})
        : Cesium.ImageryLayer.fromProviderAsync(Cesium.TileMapServiceImageryProvider.fromUrl(Cesium.buildModuleUrl('Assets/Textures/NaturalEarthII')), {}),
      terrain: online ? Cesium.Terrain.fromWorldTerrain() : undefined,
    })
    if (!online) setMode('offline')
    const base = v.imageryLayers.get(0)
    base.brightness = 0.78; base.saturation = 0.55; base.contrast = 1.08; base.gamma = 1.05
    const s = v.scene
    s.backgroundColor = C('#050F0B')
    if (s.skyBox) s.skyBox.show = false
    s.sun!.show = false; s.moon!.show = false
    s.globe.baseColor = C('#0B1C16')
    s.globe.showGroundAtmosphere = true
    if (s.skyAtmosphere) { s.skyAtmosphere.hueShift = -0.08; s.skyAtmosphere.saturationShift = -0.35; s.skyAtmosphere.brightnessShift = -0.25 }
    s.fog.density = 2.0e-4
    s.globe.depthTestAgainstTerrain = false
    ;(v.cesiumWidget.creditContainer as HTMLElement).classList.add('credits')
    for (const k of ['range', 'cells', 'points', 'region', 'draft']) {
      const d = new Cesium.CustomDataSource(k)
      v.dataSources.add(d)
      ds.current[k] = d
    }
    v.camera.setView({ destination: Cesium.Cartesian3.fromDegrees(45, 18, 2.2e7) })
    viewer.current = v

    // ---- interaction: drawing, picking, cursor readout
    const h = new Cesium.ScreenSpaceEventHandler(s.canvas)
    let corner: Cesium.Cartographic | null = null
    let hover: Cesium.Cartographic | null = null
    const at = (pos: Cesium.Cartesian2) => {
      const ray = v.camera.getPickRay(pos)
      const c = ray && s.globe.pick(ray, s)
      return c ? Cesium.Cartographic.fromCartesian(c) : null
    }
    const deg = Cesium.Math.toDegrees
    const rectOf = (a: Cesium.Cartographic, b: Cesium.Cartographic): Bounds => [
      Math.min(deg(a.longitude), deg(b.longitude)), Math.min(deg(a.latitude), deg(b.latitude)),
      Math.max(deg(a.longitude), deg(b.longitude)), Math.max(deg(a.latitude), deg(b.latitude)),
    ]
    const draft = ds.current.draft
    h.setInputAction((e: { position: Cesium.Cartesian2 }) => {
      const m = props.current.drawMode
      if (m === 'bbox') {
        const c = at(e.position)
        if (!c) return
        if (!corner) {
          corner = c
          draft.entities.removeAll()
          draft.entities.add({
            rectangle: {
              coordinates: new Cesium.CallbackProperty(() => {
                if (!corner || !hover) return undefined
                const [w, so, ea, n] = rectOf(corner, hover)
                return Cesium.Rectangle.fromDegrees(w, so, ea, n)
              }, false) as unknown as Cesium.Property,
              material: C('#8FB89A', 0.18),
            },
          })
        } else {
          const b = rectOf(corner, c)
          corner = null
          draft.entities.removeAll()
          props.current.onDraw({ bbox: b.map((x) => +x.toFixed(4)) as Bounds })
        }
        s.requestRender()
        return
      }
      if (m === 'point') {
        const c = at(e.position)
        if (c) props.current.onDraw({ point: [+deg(c.longitude).toFixed(4), +deg(c.latitude).toFixed(4)], radius_km: props.current.radiusKm })
        return
      }
      const picked = s.pick(e.position)
      const id: string | undefined = picked?.id?.id
      if (id?.startsWith('cell:')) props.current.onPickCell(id.slice(5))
      else if (id?.startsWith('pt:')) props.current.onPickPoint(id.slice(3))
      else props.current.onPickCell(null)
    }, Cesium.ScreenSpaceEventType.LEFT_CLICK)

    let last = 0
    h.setInputAction((e: { endPosition: Cesium.Cartesian2 }) => {
      const now = performance.now()
      if (props.current.drawMode === 'bbox' && corner) {
        hover = at(e.endPosition)
        s.requestRender()
      }
      if (now - last < 60) return
      last = now
      const c = at(e.endPosition)
      if (!c) { setCursor(null); return }
      // terrain heights are only trustworthy once detailed tiles are loaded (camera below ~250 km)
      const hh = v.camera.positionCartographic.height < 250_000 ? s.globe.getHeight(c) : undefined
      setCursor({ lon: deg(c.longitude), lat: deg(c.latitude), h: hh === undefined ? null : hh })
    }, Cesium.ScreenSpaceEventType.MOUSE_MOVE)

    h.setInputAction(() => { corner = null; draft.entities.removeAll(); s.requestRender() }, Cesium.ScreenSpaceEventType.RIGHT_CLICK)

    return () => {
      h.destroy()
      v.destroy()
      viewer.current = null
      ds.current = {}
      overlayLayers.current.clear()
    }
  }, [])

  // ---- cells
  useEffect(() => {
    const v = viewer.current, d = ds.current.cells
    if (!v || !d) return
    d.entities.suspendEvents()
    d.entities.removeAll()
    for (const c of p.cells) {
      const [w, s, e, n] = c.bounds
      const inset = (e - w) * 0.035
      const sel = c.id === p.selectedCell
      let material: Cesium.MaterialProperty
      if (!c.rgb) {
        // no value: shown as an empty frame tone, never as a low value
        material = new Cesium.ColorMaterialProperty(C('#A39BC7', c.dim ? 0.05 : 0.10))
      } else {
        const col = Cesium.Color.fromBytes(c.rgb[0], c.rgb[1], c.rgb[2], 255).withAlpha(sel ? 0.92 : 0.74)
        material = c.hatch
          ? new Cesium.StripeMaterialProperty({ evenColor: col, oddColor: col.withAlpha(0.12), repeat: 7, orientation: Cesium.StripeOrientation.VERTICAL })
          : new Cesium.ColorMaterialProperty(col)
      }
      d.entities.add({
        id: `cell:${c.id}`,
        rectangle: { coordinates: Cesium.Rectangle.fromDegrees(w + inset, s + inset, e - inset, n - inset), material },
      })
      if (sel) {
        d.entities.add({
          polyline: {
            positions: Cesium.Cartesian3.fromDegreesArray([w, s, e, s, e, n, w, n, w, s]),
            clampToGround: true, width: 2.5, material: C('#ECF0E7'),
          },
        })
      }
    }
    d.entities.resumeEvents()
    v.scene.requestRender()
  }, [p.cells, p.selectedCell])

  // ---- WCVP native range on TDWG level-3 regions (coarse; drawn under everything else)
  useEffect(() => {
    const d = ds.current.range
    if (!d) return
    let live = true
    d.entities.removeAll()
    viewer.current?.scene.requestRender()
    if (!p.range || (!p.range.native.length && !p.range.introduced.length)) return
    const nat = new Set(p.range.native), intr = new Set(p.range.introduced)
    loadL3().then((gj) => {
      if (!live) return
      for (const f of gj.features) {
        const code = f.properties.code
        const kind = nat.has(code) ? 'native' : intr.has(code) ? 'introduced' : null
        if (!kind) continue
        const col = kind === 'native' ? '#6FCF7F' : '#F0A64A'
        const polys = f.geometry.type === 'Polygon' ? [f.geometry.coordinates as number[][][]] : f.geometry.coordinates as number[][][][]
        polys.forEach((rings, i) => {
          const pos = (ring: number[][]) => Cesium.Cartesian3.fromDegreesArray(ring.flat())
          d.entities.add({
            id: `range:${code}:${i}`, name: `${f.properties.name} (${kind})`,
            polygon: { hierarchy: new Cesium.PolygonHierarchy(pos(rings[0]), rings.slice(1).map((h) => new Cesium.PolygonHierarchy(pos(h)))),
              material: C(col, 0.2), outline: true, outlineColor: C(col, 0.85), height: 0 },
          })
        })
      }
      viewer.current?.scene.requestRender()
    }).catch(() => {})
    return () => { live = false }
  }, [p.range])

  // ---- points
  useEffect(() => {
    const v = viewer.current, d = ds.current.points
    if (!v || !d) return
    d.entities.removeAll()
    for (const pt of p.points) {
      const occ = pt.kind === 'occurrence'
      if (pt.kind === 'fire') {
        d.entities.add({
          id: `pt:${pt.id}`, position: Cesium.Cartesian3.fromDegrees(pt.lon, pt.lat),
          point: { pixelSize: 4, color: C('#E8874E', 0.9), heightReference: Cesium.HeightReference.CLAMP_TO_GROUND, disableDepthTestDistance: Number.POSITIVE_INFINITY },
        })
        continue
      }
      d.entities.add({
        id: `pt:${pt.id}`,
        position: Cesium.Cartesian3.fromDegrees(pt.lon, pt.lat),
        point: {
          pixelSize: occ ? 5 : 11, color: occ ? C('#77B5BD') : C('#B7855F'),
          outlineColor: occ ? C('#050F0B') : C('#ECF0E7'), outlineWidth: occ ? 1.5 : 2,
          heightReference: Cesium.HeightReference.CLAMP_TO_GROUND, disableDepthTestDistance: Number.POSITIVE_INFINITY,
        },
      })
    }
    v.scene.requestRender()
  }, [p.points])

  // ---- region outline
  useEffect(() => {
    const v = viewer.current, d = ds.current.region
    if (!v || !d) return
    d.entities.removeAll()
    const dash = new Cesium.PolylineDashMaterialProperty({ color: C('#ECF0E7', 0.9), dashLength: 14 })
    if (p.regionBounds) {
      const [w, s, e, n] = p.regionBounds
      d.entities.add({ polyline: { positions: Cesium.Cartesian3.fromDegreesArray([w, s, e, s, e, n, w, n, w, s]), clampToGround: true, width: 2, material: dash } })
    }
    if (p.regionCircle) {
      const [lon, lat] = p.regionCircle.center
      d.entities.add({
        position: Cesium.Cartesian3.fromDegrees(lon, lat),
        ellipse: { semiMajorAxis: p.regionCircle.radiusKm * 1000, semiMinorAxis: p.regionCircle.radiusKm * 1000, material: C('#ECF0E7', 0.06) },
      })
    }
    v.scene.requestRender()
  }, [p.regionBounds, p.regionCircle])

  // ---- overlay imagery (display-only layers)
  useEffect(() => {
    const v = viewer.current
    if (!v) return
    const want = new Set(p.overlays.map((o) => o.id))
    for (const [id, layer] of overlayLayers.current) {
      if (!want.has(id)) { v.imageryLayers.remove(layer, true); overlayLayers.current.delete(id) }
    }
    for (const o of p.overlays) {
      if (overlayLayers.current.has(o.id) || !o.url) continue
      const provider = o.kind === 'wms'
        ? new Cesium.WebMapServiceImageryProvider({ url: o.url, layers: o.wms_layer!, parameters: { transparent: true, format: 'image/png' }, credit: o.attribution })
        : new Cesium.UrlTemplateImageryProvider({ url: o.url, maximumLevel: 12, credit: o.attribution })
      const layer = v.imageryLayers.addImageryProvider(provider)
      layer.alpha = o.kind === 'wms' ? 0.7 : 0.9
      overlayLayers.current.set(o.id, layer)
    }
    v.scene.requestRender()
  }, [p.overlays])

  // ---- camera
  useEffect(() => {
    const v = viewer.current
    if (!v || !p.camera) return
    const { lon, lat, height } = p.camera
    v.camera.flyToBoundingSphere(new Cesium.BoundingSphere(Cesium.Cartesian3.fromDegrees(lon, lat), 1), {
      offset: new Cesium.HeadingPitchRange(Cesium.Math.toRadians(10), Cesium.Math.toRadians(-48), height * 1.35),
      duration: 2.2,
    })
  }, [p.camera])

  useEffect(() => {
    const v = viewer.current
    if (!v) return
    v.scene.canvas.style.cursor = p.drawMode === 'none' ? '' : 'crosshair'
    if (p.drawMode === 'none') { ds.current.draft?.entities.removeAll(); v.scene.requestRender() }
  }, [p.drawMode])

  return (
    <div className="globe" data-testid="globe">
      <div ref={host} className="globe-host" />
      <div className="cursor-readout mono" aria-live="off" data-off={cursor ? undefined : true}>
        {cursor ? (
          <>
            <span>{Math.abs(cursor.lat).toFixed(3)}°{cursor.lat >= 0 ? 'N' : 'S'}</span>
            <span>{Math.abs(cursor.lon).toFixed(3)}°{cursor.lon >= 0 ? 'E' : 'W'}</span>
            <span>{cursor.h === null ? 'zoom in for elevation' : `${Math.round(cursor.h).toLocaleString()} m`}</span>
          </>
        ) : <span>cursor off globe</span>}
        {mode === 'offline' && <span className="st-pending">offline basemap · no ion token</span>}
      </div>
    </div>
  )
}
