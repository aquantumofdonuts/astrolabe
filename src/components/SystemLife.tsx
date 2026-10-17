import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'

const noHit = () => {}
const billboard = `varying vec2 p;void main(){p=uv*2.-1.;vec4 c=modelViewMatrix*vec4(0,0,0,1);c.xy+=position.xy;gl_Position=projectionMatrix*c;}`

/** A quiet activity light; node or category selection adds a broad, feathered halo. */
export function DestinationGlow({
  color,
  radius,
  active,
  paused,
  seed,
}: {
  color: string
  radius: number
  active: boolean
  paused: boolean
  seed: number
}) {
  const material = useRef<THREE.ShaderMaterial>(null)
  const uniforms = useMemo(
    () => ({
      tint: { value: new THREE.Color(color) },
      time: { value: seed },
      focus: { value: 0 },
    }),
    [color, seed]
  )
  useFrame((_, dt) => {
    if (!paused) uniforms.time.value += Math.min(dt, 0.05)
    // Deselect immediately; only the newly selected halo blooms in.
    uniforms.focus.value =
      !active || paused
        ? Number(active)
        : THREE.MathUtils.damp(uniforms.focus.value, Number(active), 6, dt)
    if (material.current) {
      material.current.uniforms.focus.value = uniforms.focus.value
      material.current.uniforms.time.value = uniforms.time.value
    }
  })
  return (
    <mesh raycast={noHit}>
      <planeGeometry args={[radius * 5.6, radius * 5.6]} />
      <shaderMaterial
        ref={material}
        uniforms={uniforms}
        vertexShader={billboard}
        transparent
        depthWrite={false}
        blending={THREE.AdditiveBlending}
        fragmentShader={`varying vec2 p;uniform vec3 tint;uniform float time,focus;
      void main(){float r=length(p);float pulse=.86+.14*sin(time*.85);
      float halo=exp(-pow((r-.36)*4.8,2.))*smoothstep(.3,.42,r)*pow(max(0.,1.-r),1.8);
      float beacon=pow(max(0.,1.-length(p-vec2(.39,.25))*16.),2.);
      float beat=pow(max(0.,sin(time*1.6)),12.);
      float rim=exp(-pow((r-.375)*35.,2.))*.08;
      gl_FragColor=vec4(tint*1.35,(halo*.24+rim*.7)*focus*pulse+beacon*(.08+beat*.38));}`}
      />
    </mesh>
  )
}

function Comet({ paused, offset }: { paused: boolean; offset: number }) {
  const group = useRef<THREE.Group>(null)
  const elapsed = useRef(offset)
  useFrame((_, dt) => {
    if (!paused) elapsed.current += Math.min(dt, 0.05)
    const t = elapsed.current % 74
    if (!group.current) return
    group.current.visible = t < 17
    group.current.position.set(-72 + t * 7, 32 - t * 1.8, -72 + t * 0.5)
    group.current.rotation.z = -0.25
  })
  return (
    <group ref={group} visible={false}>
      <mesh raycast={noHit}>
        <planeGeometry args={[27, 3.8]} />
        <shaderMaterial
          vertexShader={`varying vec2 p;void main(){p=uv*2.-1.;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`}
          transparent
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          fragmentShader={`varying vec2 p;void main(){float x=(p.x+1.)*.5;float w=.035+(1.-x)*.2;float tail=exp(-pow(p.y/w,2.))*pow(x,2.)*(1.-smoothstep(.88,1.,x));gl_FragColor=vec4(.36,.7,1.,tail*.38);}`}
        />
      </mesh>
      <mesh position={[11, 0, 0]} raycast={noHit}>
        <sphereGeometry args={[0.12, 8, 8]} />
        <meshBasicMaterial color={[2, 2.8, 3]} toneMapped={false} />
      </mesh>
    </group>
  )
}

export default function SystemLife({
  paused,
  economical,
  category,
  subdued,
}: {
  paused: boolean
  economical: boolean
  category: string
  subdued: boolean
}) {
  return (
    <group>
      <group visible={!subdued && category === 'all'}>
        <Comet paused={paused} offset={8} />
        {!economical && <Comet paused={paused} offset={44} />}
      </group>
    </group>
  )
}

/** A quiet stellar backdrop: warm giants, blue-white pinpoints and rare diffraction flares. */
export function StarField({ economical, paused }: { economical: boolean; paused: boolean }) {
  const material = useRef<THREE.ShaderMaterial>(null)
  const uniforms = useMemo(() => ({ time: { value: 0 } }), [])
  const geometry = useMemo(() => {
    let state = 19283
    const random = () => {
      state = (Math.imul(state, 1664525) + 1013904223) >>> 0
      return state / 4294967296
    }
    const count = economical ? 2300 : 7200
    const positions: number[] = [],
      colors: number[] = [],
      sizes: number[] = [],
      signatures: number[] = []
    const color = new THREE.Color()
    for (let i = 0; i < count; i++) {
      const y = random() * 2 - 1,
        angle = random() * Math.PI * 2,
        r = 125 + random() * 90
      const xz = Math.sqrt(1 - y * y)
      positions.push(Math.cos(angle) * xz * r, y * r, Math.sin(angle) * xz * r)
      const spectrum = random()
      color.set(
        spectrum < 0.23
          ? '#ffc88a'
          : spectrum < 0.45
            ? '#8fbaff'
            : spectrum < 0.53
              ? '#f4a6a2'
              : spectrum < 0.6
                ? '#c5b5ff'
                : '#e6f2ff'
      )
      const giant = random() < 0.045
      color
        .multiplyScalar(giant ? 0.9 + random() * 0.5 : 0.3 + random() * 0.65)
        .toArray(colors, i * 3)
      sizes.push(giant ? 9 + random() * 7 : 1.2 + Math.pow(random(), 2) * 3.8)
      // Phase, breathing speed and silhouette vary independently, avoiding synchronized flicker.
      signatures.push(random() * Math.PI * 2, 0.2 + random() * 0.55, giant ? random() : 0)
    }
    const result = new THREE.BufferGeometry()
    result.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
    result.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3))
    result.setAttribute('size', new THREE.Float32BufferAttribute(sizes, 1))
    result.setAttribute('signature', new THREE.Float32BufferAttribute(signatures, 3))
    return result
  }, [economical])
  useEffect(() => () => geometry.dispose(), [geometry])
  useFrame((_, dt) => {
    if (!paused) uniforms.time.value += Math.min(dt, 0.05)
    if (material.current) material.current.uniforms.time.value = uniforms.time.value
  })
  return (
    <points geometry={geometry} raycast={noHit}>
      <shaderMaterial
        ref={material}
        uniforms={uniforms}
        transparent
        depthWrite={false}
        blending={THREE.AdditiveBlending}
        vertexColors
        vertexShader={`
          attribute float size;
          attribute vec3 signature;
          uniform float time;
          varying vec3 tint;
          varying float luminosity;
          varying float shape;
          void main() {
            vec4 mv = modelViewMatrix * vec4(position, 1.);
            gl_Position = projectionMatrix * mv;
            float breath = sin(time * signature.y + signature.x);
            luminosity = .82 + .18 * breath;
            gl_PointSize = clamp(size * 160. / max(1., -mv.z), 1., 13.);
            tint = color;
            shape = signature.z;
          }`}
        fragmentShader={`
          varying vec3 tint;
          varying float luminosity;
          varying float shape;
          void main() {
            vec2 p = (gl_PointCoord - .5) * 2.;
            float radius = length(p);
            float core = exp(-radius * radius * 15.);
            float halo = exp(-radius * radius * 4.) * .16;
            // Only rare bright stars get optical rays; most remain clean points.
            float rays = 0.;
            if (shape > .42) {
              if (shape > .8) p = mat2(.707, -.707, .707, .707) * p;
              rays = (exp(-abs(p.x) * 38.) * exp(-abs(p.y) * 3.5)
                    + exp(-abs(p.y) * 38.) * exp(-abs(p.x) * 3.5)) * .22;
            }
            float alpha = (core + halo + rays) * (1. - smoothstep(.75, 1., radius));
            gl_FragColor = vec4(tint * luminosity, alpha);
          }`}
      />
    </points>
  )
}
