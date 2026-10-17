import { createContext, useContext, useEffect, useMemo } from 'react'
import type { ReactNode } from 'react'
import * as THREE from 'three'

const SurfaceContext = createContext<{
  roughness: THREE.DataTexture
  grain: THREE.DataTexture
} | null>(null)

/** Procedural microfinish stays local and repeatable; uploaded artwork is never textured. */
export function SurfaceMaterials({ children }: { children: ReactNode }) {
  const maps = useMemo(() => {
    const size = 256
    const rough = new Uint8Array(size * size * 4)
    const grain = new Uint8Array(size * size * 4)
    let random = 90421
    for (let y = 0; y < size; y++)
      for (let x = 0; x < size; x++) {
        random = (Math.imul(random, 1664525) + 1013904223) >>> 0
        const noise = random / 4294967296
        const brush = Math.sin(y * 0.73) * 0.5 + Math.sin(y * 1.91) * 0.2
        const seam = x % 64 === 0 ? 15 : 0
        const r = Math.round(206 + brush * 18 + noise * 18)
        const g = Math.round(127 + brush * 7 + noise * 5 - seam)
        const index = (y * size + x) * 4
        rough.set([r, r, r, 255], index)
        grain.set([g, g, g, 255], index)
      }
    const texture = (data: Uint8Array) => {
      const result = new THREE.DataTexture(data, size, size)
      result.wrapS = result.wrapT = THREE.RepeatWrapping
      result.repeat.set(3, 2)
      result.magFilter = THREE.LinearFilter
      result.minFilter = THREE.LinearMipmapLinearFilter
      result.generateMipmaps = true
      result.needsUpdate = true
      return result
    }
    return { roughness: texture(rough), grain: texture(grain) }
  }, [])
  useEffect(
    () => () => {
      maps.roughness.dispose()
      maps.grain.dispose()
    },
    [maps]
  )
  return <SurfaceContext.Provider value={maps}>{children}</SurfaceContext.Provider>
}

export function HullMaterial({
  color = '#627f90',
  roughness = 0.46,
  metalness = 0.84,
  polished = false,
}: {
  color?: string
  roughness?: number
  metalness?: number
  polished?: boolean
}) {
  const maps = useContext(SurfaceContext)
  return (
    <meshPhysicalMaterial
      color={color}
      metalness={metalness}
      roughness={roughness}
      roughnessMap={maps?.roughness}
      bumpMap={maps?.grain}
      bumpScale={0.012}
      clearcoat={polished ? 0.38 : 0.14}
      clearcoatRoughness={0.28}
      envMapIntensity={0.85}
    />
  )
}
