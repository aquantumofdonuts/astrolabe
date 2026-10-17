import { useEffect, useMemo, useRef } from 'react'
import type { RefObject } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { HullMaterial } from './SurfaceMaterials'

/** Original geometry: a heavily armed, entirely unreasonable shareware inspector. */
export default function HectorShip({ boost }: { boost: RefObject<number> }) {
  const flames = useRef<THREE.Group>(null)
  const hull = useMemo(() => {
    const shape = new THREE.Shape()
    shape.moveTo(0, 2.6)
    for (const [x, y] of [
      [-0.48, 1.25],
      [-0.72, 0.35],
      [-1.8, -0.45],
      [-2.1, -1.65],
      [-1.15, -1.4],
      [-0.58, -1.8],
      [0, -1.45],
      [0.58, -1.8],
      [1.15, -1.4],
      [2.1, -1.65],
      [1.8, -0.45],
      [0.72, 0.35],
      [0.48, 1.25],
    ])
      shape.lineTo(x, y)
    shape.closePath()
    return new THREE.ExtrudeGeometry(shape, {
      depth: 0.32,
      bevelEnabled: true,
      bevelSegments: 2,
      steps: 1,
      bevelSize: 0.08,
      bevelThickness: 0.09,
    })
  }, [])
  useEffect(() => () => hull.dispose(), [hull])
  useFrame(({ clock }) => {
    if (flames.current)
      flames.current.scale.y = (0.9 + Math.sin(clock.elapsedTime * 23) * 0.09) * boost.current
  })
  return (
    <group>
      <mesh geometry={hull}>
        <HullMaterial color="#485363" metalness={0.88} polished />
      </mesh>
      <mesh position={[0, 0.15, 0.43]}>
        <boxGeometry args={[0.56, 2.45, 0.22]} />
        <HullMaterial color="#82909d" polished />
      </mesh>
      <mesh position={[0, 1.02, 0.65]} scale={[0.3, 0.65, 0.16]}>
        <sphereGeometry args={[1, 12, 10]} />
        <meshStandardMaterial
          color="#35131b"
          emissive="#f14a32"
          emissiveIntensity={1.6}
          metalness={0.5}
          roughness={0.2}
        />
      </mesh>
      <mesh position={[0, 1.83, 0.48]}>
        <boxGeometry args={[0.12, 0.65, 0.1]} />
        <meshBasicMaterial color={[3, 0.22, 0.04]} toneMapped={false} />
      </mesh>
      {[-1, 1].map((side) => (
        <group key={side}>
          <mesh position={[side * 1.05, -0.5, 0.48]} rotation={[0, 0, side * -0.5]}>
            <boxGeometry args={[0.52, 1.8, 0.14]} />
            <HullMaterial color="#26303b" />
          </mesh>
          <mesh position={[side * 1.16, -0.48, 0.59]} rotation={[0, 0, side * -0.5]}>
            <boxGeometry args={[0.1, 1.55, 0.04]} />
            <meshStandardMaterial
              color="#c54f35"
              emissive="#7b1607"
              emissiveIntensity={0.8}
              metalness={0.65}
            />
          </mesh>
          <mesh position={[side * 1.72, -0.95, 0.42]}>
            <cylinderGeometry args={[0.13, 0.17, 1.55, 10]} />
            <HullMaterial color="#a5a7a3" polished />
          </mesh>
          <mesh position={[side * 1.72, -0.15, 0.42]}>
            <sphereGeometry args={[0.12, 8, 8]} />
            <meshBasicMaterial color={[4, 0.35, 0.03]} toneMapped={false} />
          </mesh>
          <mesh position={[side * 0.61, -1.55, 0.18]}>
            <cylinderGeometry args={[0.27, 0.3, 0.8, 12]} />
            <HullMaterial color="#252e36" />
          </mesh>
          <mesh position={[side * 0.61, -1.98, 0.18]} rotation={[Math.PI / 2, 0, 0]}>
            <torusGeometry args={[0.22, 0.07, 8, 16]} />
            <meshBasicMaterial color={[0.2, 1.8, 3]} toneMapped={false} />
          </mesh>
        </group>
      ))}
      <group ref={flames} position={[0, -1.9, 0.16]}>
        {[-1, 1].map((side) => (
          <group key={side} position={[side * 0.61, 0, 0]}>
            <mesh position={[0, -0.75, 0]} rotation={[0, 0, Math.PI]}>
              <coneGeometry args={[0.2, 1.5, 12]} />
              <meshBasicMaterial
                color={[0.12, 1.3, 2.8]}
                transparent
                opacity={0.5}
                depthWrite={false}
                blending={THREE.AdditiveBlending}
                toneMapped={false}
              />
            </mesh>
            <mesh position={[0, -0.35, 0]} rotation={[0, 0, Math.PI]}>
              <coneGeometry args={[0.11, 0.8, 10]} />
              <meshBasicMaterial color={[1.2, 2.5, 4]} toneMapped={false} />
            </mesh>
          </group>
        ))}
      </group>
    </group>
  )
}
