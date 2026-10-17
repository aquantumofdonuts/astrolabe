import { useEffect, useMemo, useRef, useState } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js'
import { HullMaterial } from './SurfaceMaterials'

function MachinedBox({
  size,
  children,
}: {
  size: [number, number, number]
  children: React.ReactNode
}) {
  const [width, height, depth] = size
  const geometry = useMemo(
    () => new RoundedBoxGeometry(width, height, depth, 2, 0.025),
    [width, height, depth]
  )
  useEffect(() => () => geometry.dispose(), [geometry])
  return (
    <mesh geometry={geometry} castShadow receiveShadow>
      {children}
    </mesh>
  )
}

/** Uploaded artwork stays intact and faces the viewer; its orbital housing supplies depth. */
export default function LogoBeacon({
  image,
  color,
  id,
  paused,
}: {
  image: string
  color: string
  id: string
  paused: boolean
}) {
  const { invalidate, gl } = useThree()
  const [texture, setTexture] = useState<THREE.Texture | null>(null)
  const housing = useRef<THREE.Group>(null)
  const rotor = useRef<THREE.Group>(null)
  const parentRotation = useMemo(() => new THREE.Quaternion(), [])
  const hullProfile = useMemo(
    () =>
      [
        [0, -0.24],
        [0.88, -0.24],
        [1.08, -0.16],
        [1.19, -0.02],
        [1.22, 0.18],
        [1.2, 0.385],
        [1.08, 0.385],
        [1.06, 0.4],
        [0.97, 0.38],
        [0, 0.38],
      ].map(([radius, z]) => new THREE.Vector2(radius, z)),
    []
  )
  // The same instrument keeps its silhouette when the catalog is reordered.
  const variant = useMemo(
    () => [...id].reduce((hash, char) => (hash * 31 + char.charCodeAt(0)) >>> 0, 0) % 3,
    [id]
  )
  useEffect(() => {
    let cancelled = false
    setTexture(null)
    const loaded = new THREE.TextureLoader().load(
      image,
      (map) => {
        if (cancelled) return
        if (map.image.width > 512 || map.image.height > 512) {
          map.dispose()
          return
        }
        map.colorSpace = THREE.SRGBColorSpace
        map.anisotropy = Math.min(4, gl.capabilities.getMaxAnisotropy())
        setTexture(map)
        invalidate()
      },
      undefined,
      () => {
        if (!cancelled) invalidate()
      }
    )
    return () => {
      cancelled = true
      loaded.dispose()
    }
  }, [image, invalidate, gl])
  useFrame(({ camera }, delta) => {
    if (housing.current) {
      housing.current.parent?.getWorldQuaternion(parentRotation)
      housing.current.quaternion.copy(parentRotation.invert()).multiply(camera.quaternion)
    }
    if (rotor.current && !paused) rotor.current.rotation.z += Math.min(delta, 0.05) * 0.045
  }, 0.5)
  return (
    <group ref={housing} name={`logo-beacon:${id}`}>
      <mesh
        rotation={[Math.PI / 2, 0, 0]}
        castShadow
        receiveShadow
        userData={{ navigationSurface: true }}
      >
        <latheGeometry args={[hullProfile, 80]} />
        <HullMaterial color="#425d6e" />
      </mesh>
      <mesh position={[0, 0, 0.44]} userData={{ navigationSurface: true }}>
        <circleGeometry args={[1.08, 64]} />
        <meshBasicMaterial color="#08121c" />
      </mesh>
      <mesh position={[0, 0, 0.46]} userData={{ navigationSurface: true }}>
        <planeGeometry args={[1.49, 1.49]} />
        <meshBasicMaterial
          map={texture}
          onUpdate={(material) => {
            material.needsUpdate = true
          }}
          color={texture ? '#ffffff' : color}
          transparent
          toneMapped={false}
        />
      </mesh>
      <mesh position={[0, 0, 0.43]} castShadow receiveShadow>
        <torusGeometry args={[1.11, 0.03, 8, 80]} />
        <HullMaterial color="#c4d2d6" polished roughness={0.3} />
      </mesh>
      <mesh position={[0, 0, 0.47]}>
        <torusGeometry args={[1.075, 0.012, 6, 80]} />
        <meshBasicMaterial color={color} toneMapped={false} />
      </mesh>
      {[0.12, 0.24].map((z) => (
        <mesh key={z} position={[0, 0, z]}>
          <torusGeometry args={[1.215, 0.012, 6, 80]} />
          <HullMaterial color="#142632" roughness={0.65} />
        </mesh>
      ))}
      {Array.from({ length: 32 }, (_, index) => (
        <group key={index} rotation={[0, 0, (index * Math.PI) / 16]}>
          <mesh position={[0, 1.18, 0.4]}>
            <boxGeometry args={[0.009, index % 4 === 0 ? 0.055 : 0.023, 0.014]} />
            <meshBasicMaterial color={index % 8 === 0 ? color : '#738f9d'} toneMapped={false} />
          </mesh>
        </group>
      ))}
      {[0, 1, 2, 3, 4, 5].map((index) => (
        <group key={index} rotation={[0, 0, (index * Math.PI) / 3 + 0.25]}>
          <mesh position={[0, 1.17, 0.41]} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.033, 0.033, 0.035, 6]} />
            <HullMaterial color="#d0d8db" polished />
          </mesh>
          <mesh position={[0, 1.17, 0.432]}>
            <boxGeometry args={[0.035, 0.008, 0.006]} />
            <meshBasicMaterial color="#132331" />
          </mesh>
        </group>
      ))}
      <group rotation={[0.28, -0.22, variant * 0.65]}>
        <group ref={rotor}>
          <mesh>
            <torusGeometry args={[1.39, 0.052, 12, 96, Math.PI * 1.65]} />
            <HullMaterial color="#91a4ae" polished />
          </mesh>
          <mesh position={[0, 0, -0.09]}>
            <torusGeometry args={[1.39, 0.017, 6, 96, Math.PI * 1.65]} />
            <HullMaterial color="#9b8060" />
          </mesh>
          <mesh rotation={[0, 0, Math.PI * 1.7]}>
            <torusGeometry args={[1.39, 0.022, 6, 32, Math.PI * 0.2]} />
            <meshStandardMaterial color={color} emissive={color} emissiveIntensity={1.2} />
          </mesh>
          {Array.from({ length: variant + 3 }, (_, i) => (
            <group key={i} rotation={[0, 0, (i * Math.PI * 2) / (variant + 3)]}>
              <group position={[1.4, 0, 0]}>
                <MachinedBox size={[0.22, 0.16, 0.15]}>
                  <HullMaterial color="#a1b3bb" />
                </MachinedBox>
              </group>
              <mesh position={[1.42, 0, 0.08]}>
                <boxGeometry args={[0.09, 0.035, 0.015]} />
                <meshBasicMaterial color={color} toneMapped={false} />
              </mesh>
              <mesh position={[1.34, 0, 0.082]}>
                <boxGeometry args={[0.016, 0.09, 0.012]} />
                <meshBasicMaterial color="#223946" />
              </mesh>
            </group>
          ))}
        </group>
      </group>
      {[-1, 1].map((side) => (
        <group key={side} position={[side * 1.22, -0.52, -0.03]} rotation={[0, 0, side * -0.4]}>
          <MachinedBox size={[0.07, 0.4, 0.15]}>
            <HullMaterial color="#536d7e" />
          </MachinedBox>
        </group>
      ))}
    </group>
  )
}
