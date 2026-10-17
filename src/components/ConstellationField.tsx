import { useEffect, useMemo } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import type { Catalog } from '../lib/catalog'
import type { Constellation } from '../lib/orbits'
import { constellationField } from '../lib/constellationField'

const noHit = () => {}

/** A translucent grouping cue, never a physical destination or a picking surface. */
export default function ConstellationField({
  station,
  catalog,
  family,
  color,
  paused,
  dimmed,
  active,
}: {
  station: Constellation
  catalog: Catalog
  family: number
  color: string
  paused: boolean
  dimmed: boolean
  active: boolean
}) {
  const { invalidate } = useThree()
  const field = useMemo(
    () => constellationField(station, catalog, family),
    [station, catalog, family]
  )
  const uniforms = useMemo(
    () => ({
      tint: { value: new THREE.Color(color) },
      time: { value: field.phase },
      strength: { value: 0.0 },
    }),
    [color, field.phase]
  )
  const lines = useMemo(() => {
    const vertices: number[] = []
    for (const thread of field.threads) {
      const curve = new THREE.QuadraticBezierCurve3(
        new THREE.Vector3(...thread.start),
        new THREE.Vector3(...thread.control),
        new THREE.Vector3(...thread.end)
      )
      const points = curve.getPoints(40)
      for (let i = 1; i < points.length; i++)
        vertices.push(...points[i - 1].toArray(), ...points[i].toArray())
    }
    return new THREE.BufferGeometry().setAttribute(
      'position',
      new THREE.Float32BufferAttribute(vertices, 3)
    )
  }, [field])
  useEffect(() => () => lines.dispose(), [lines])
  const lineMaterial = useMemo(
    () =>
      new THREE.LineBasicMaterial({
        color,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        toneMapped: false,
      }),
    [color]
  )
  useEffect(() => () => lineMaterial.dispose(), [lineMaterial])
  useFrame((_, delta) => {
    const target = dimmed ? 0.09 : active ? 0.95 : 0.55
    if (!paused) uniforms.time.value += Math.min(delta, 0.05)
    uniforms.strength.value = paused
      ? target
      : THREE.MathUtils.damp(uniforms.strength.value, target, 5, Math.min(delta, 0.05))
    lineMaterial.opacity = uniforms.strength.value * 0.19
    if (Math.abs(uniforms.strength.value - target) > 0.001) invalidate()
  })
  if (!station.instruments.length) return null
  return (
    <group name={`constellation-field:${station.categoryId}`}>
      <lineSegments geometry={lines} material={lineMaterial} raycast={noHit} />
      <mesh position={field.center} raycast={noHit}>
        <planeGeometry args={[field.radius * 2.6, field.radius * 2.6]} />
        <shaderMaterial
          uniforms={uniforms}
          transparent
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          vertexShader={`varying vec2 p;void main(){p=uv*2.-1.;vec4 c=modelViewMatrix*vec4(0.,0.,0.,1.);c.xy+=position.xy;gl_Position=projectionMatrix*c;}`}
          fragmentShader={`varying vec2 p;uniform vec3 tint;uniform float time,strength;
          float hash(vec2 q){return fract(sin(dot(q,vec2(127.1,311.7)))*43758.5453);}
          float noise(vec2 q){vec2 i=floor(q),f=fract(q);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);}
          void main(){float r=length(p);float a=atan(p.y,p.x);
            float flow=noise(p*3.5+vec2(time*.012,-time*.008));
            float curl=sin(a*3.+flow*3.+time*.018)*.06;
            float ribbon=exp(-pow((r-.55-curl)*20.,2.));
            float breaks=smoothstep(.32,.73,noise(p*4.+flow));
            float veil=pow(max(0.,1.-r),3.)*noise(p*5.+flow)*.016;
            float alpha=(ribbon*breaks*.055+veil)*strength*(1.-smoothstep(.72,.98,r));
            gl_FragColor=vec4(tint,alpha);
          }`}
        />
      </mesh>
    </group>
  )
}
