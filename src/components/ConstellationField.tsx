import { useEffect, useMemo, useRef } from 'react'
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
  const ribbonMaterial = useRef<THREE.ShaderMaterial>(null)
  const veilMaterial = useRef<THREE.ShaderMaterial>(null)
  const animation = useRef({ time: field.phase, strength: 0 })
  const ribbons = useMemo(() => {
    const vertices: number[] = []
    const tangents: number[] = []
    const uvs: number[] = []
    const indices: number[] = []
    for (const thread of field.threads) {
      const curve = new THREE.QuadraticBezierCurve3(
        new THREE.Vector3(...thread.start),
        new THREE.Vector3(...thread.control),
        new THREE.Vector3(...thread.end)
      )
      const offset = vertices.length / 3
      const segments = 64
      for (let i = 0; i <= segments; i++) {
        const t = i / segments
        const point = curve.getPoint(t).toArray()
        const tangent = curve.getTangent(t).toArray()
        vertices.push(...point, ...point)
        tangents.push(...tangent, ...tangent)
        uvs.push(t, -1, t, 1)
        if (i < segments) {
          const a = offset + i * 2
          indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2)
        }
      }
    }
    const geometry = new THREE.BufferGeometry()
      .setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3))
      .setAttribute('tangent', new THREE.Float32BufferAttribute(tangents, 3))
      .setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2))
      .setIndex(indices)
    geometry.computeBoundingSphere()
    // Account for the glow width and the small displacement in the vertex shader.
    geometry.boundingSphere!.radius += 0.5
    return geometry
  }, [field])
  useEffect(() => () => ribbons.dispose(), [ribbons])
  useFrame((_, delta) => {
    const target = dimmed ? 0.25 : active ? 1 : 0.65
    const state = animation.current
    if (!paused) state.time += Math.min(delta, 0.05)
    state.strength = paused
      ? target
      : THREE.MathUtils.damp(state.strength, target, 5, Math.min(delta, 0.05))
    // Fiber owns the live uniform objects. Updating the source props alone leaves
    // the compiled material at its initial values after a React render.
    for (const material of [ribbonMaterial.current, veilMaterial.current]) {
      if (!material) continue
      material.uniforms.time.value = state.time
      material.uniforms.strength.value = state.strength
    }
    if (Math.abs(state.strength - target) > 0.001) invalidate()
  })
  if (!station.instruments.length) return null
  return (
    <group name={`constellation-field:${station.categoryId}`}>
      {field.threads.length > 0 && (
        <mesh geometry={ribbons} raycast={noHit}>
          <shaderMaterial
            ref={ribbonMaterial}
            uniforms={uniforms}
            transparent
            depthWrite={false}
            side={THREE.DoubleSide}
            toneMapped={false}
            blending={THREE.AdditiveBlending}
            vertexShader={`attribute vec3 tangent;uniform float time;varying vec2 p;
            void main(){p=uv;vec4 center=modelViewMatrix*vec4(position,1.);
              vec3 along=mat3(modelViewMatrix)*tangent;
              vec2 normal=length(along.xy)>.0001?normalize(vec2(-along.y,along.x)):vec2(1.,0.);
              float envelope=sin(uv.x*3.14159265);
              float sway=(sin(uv.x*19.-time*.42)*.035+sin(uv.x*37.+time*.27)*.018)*envelope;
              center.xy+=normal*(uv.y*.34+sway);
              gl_Position=projectionMatrix*center;}`}
            fragmentShader={`varying vec2 p;uniform vec3 tint;uniform float time,strength;
            void main(){float u=p.x,y=p.y;
              float envelope=smoothstep(0.,.06,u)*(1.-smoothstep(.94,1.,u));
              float curl=sin(u*22.-time*.55)*.14+sin(u*47.+time*.31)*.065;
              float core=exp(-pow((y-curl)*18.,2.));
              float strand=exp(-pow((y+sin(u*31.+time*.38)*.3)*24.,2.));
              float flow=.72+.28*sin(u*35.-time*.9+sin(u*11.+time*.2));
              float glow=exp(-pow(y*2.4,2.))*.16;
              float alpha=(glow+core*.48+strand*.2)*flow*envelope*strength;
              vec3 energy=mix(tint,vec3(.85,.95,1.),core*.5)*1.8;
              gl_FragColor=vec4(energy,alpha);}`}
          />
        </mesh>
      )}
      <mesh position={field.center} raycast={noHit}>
        <planeGeometry args={[field.radius * 2.6, field.radius * 2.6]} />
        <shaderMaterial
          ref={veilMaterial}
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
